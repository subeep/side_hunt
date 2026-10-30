import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { hasGrant } from '../authz';
import { audit } from '../audit';
import { getForModeration, moderatorVisibleSql } from './access';
import { currentConsents } from './consent';
import { LIMITS } from './constants';
import { transition } from './lifecycle';
import { unpublishShared } from './publish';
import { fail, type Fail } from './result';
import { fieldErrors, reasonText, sharedRepInput } from './validation';
import { z } from 'zod';

const isMod = (p: Principal) => hasGrant(p, 'learning_moderator');
const REJECT_CATEGORIES = ['duplicate', 'unsafe', 'not_suitable'] as const;

/** Moderator queue: only explicitly-submitted community proposals awaiting a decision. Drafts / private / org-only never appear. */
export async function moderationQueue(p: Principal) {
  if (!isMod(p)) return [];
  const c = schema.contributions;
  return db
    .select({ id: c.id, title: c.title, kind: c.kind, status: c.status, version: c.version, submittedAt: c.submittedAt, flags: c.sensitiveFlags, orgName: schema.organisations.name })
    .from(c)
    .innerJoin(schema.organisations, eq(schema.organisations.id, c.orgId))
    .where(and(moderatorVisibleSql, inArray(c.status, ['submitted', 'in_review', 'clarification_requested'])))
    .orderBy(asc(c.submittedAt));
}

/** Open report queue (moderators only). Reporter identity is visible here, and only here. */
export async function openReports(p: Principal) {
  if (!isMod(p)) return [];
  const r = schema.reports;
  return db
    .select({ id: r.id, sharedId: r.sharedId, reason: r.reason, details: r.details, createdAt: r.createdAt, sharedTitle: schema.sharedContributions.title, sharedStatus: schema.sharedContributions.status })
    .from(r)
    .innerJoin(schema.sharedContributions, eq(schema.sharedContributions.id, r.sharedId))
    .where(eq(r.status, 'open'))
    .orderBy(asc(r.createdAt));
}

/** Full moderator view of one contribution: private source, review draft, history WITH internal notes, consents, shared copies. */
export async function moderationDetail(p: Principal, id: string) {
  const c = await getForModeration(p, id);
  if (!c) return null;
  const [draft] = await db.select().from(schema.reviewDrafts).where(eq(schema.reviewDrafts.contributionId, id));
  const events = await db.select().from(schema.moderationEvents).where(eq(schema.moderationEvents.contributionId, id)).orderBy(asc(schema.moderationEvents.at));
  const shared = await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.contributionId, id)).orderBy(desc(schema.sharedContributions.version));
  const [org] = await db.select({ name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.id, c.orgId));
  const reports = shared.length
    ? await db.select({ id: schema.reports.id, sharedId: schema.reports.sharedId, reason: schema.reports.reason, details: schema.reports.details, status: schema.reports.status, createdAt: schema.reports.createdAt }).from(schema.reports).where(inArray(schema.reports.sharedId, shared.map((s) => s.id)))
    : [];
  return { c, draft: draft ?? null, events, shared, reports, orgName: org?.name ?? 'Unknown organisation', consents: await currentConsents(id) };
}

/** submitted -> in_review. Creates / refreshes the moderator's working shared representation from the private source. */
export async function claimForReview(p: Principal, id: string) {
  return transition(p, id, 'in_review', {
    inTx: async (tx, c) => {
      const [prev] = await tx.select().from(schema.reviewDrafts).where(eq(schema.reviewDrafts.contributionId, id));
      const base = { claimedBy: p.userId, title: c.title, summary: c.observation.slice(0, LIMITS.summary.max), industry: c.industry, region: c.region, periodLabel: c.observationPeriod, reviewed: false, updatedAt: new Date() };
      await tx
        .insert(schema.reviewDrafts)
        .values({ contributionId: id, ...base, evidenceQuality: prev?.evidenceQuality ?? 'unassessed', redactionNotes: prev?.redactionNotes ?? null })
        .onConflictDoUpdate({ target: schema.reviewDrafts.contributionId, set: base });
    },
  });
}

/** Redact + save the shared representation (in_review only). Marks it as explicitly reviewed. */
export async function saveSharedDraft(p: Principal, id: string, raw: unknown): Promise<{ ok: true } | Fail> {
  const c = await getForModeration(p, id);
  if (!c) return fail('not_found', 'Not found');
  if (c.status !== 'in_review') return fail('precondition', 'Claim the contribution for review before editing the shared version.');
  const v = sharedRepInput.safeParse(raw);
  if (!v.success) return fail('invalid', 'Please fix the highlighted fields.', fieldErrors(v.error));
  if (v.data.includeAttribution && !(await currentConsents(id)).attribution.granted) return fail('precondition', 'The contributor did not consent to attribution.');
  await db
    .update(schema.reviewDrafts)
    .set({ ...v.data, claimedBy: p.userId, reviewed: true, updatedAt: new Date() })
    .where(eq(schema.reviewDrafts.contributionId, id));
  await db.insert(schema.moderationEvents).values({ contributionId: id, moderatorId: p.userId, actorRole: 'moderator', fromStatus: 'in_review', toStatus: 'in_review', decision: 'redacted', internalNote: v.data.redactionNotes });
  await audit({ actorId: p.userId, action: 'learning.review.redact_save', resourceType: 'contribution', resourceId: id, orgId: c.orgId });
  return { ok: true };
}

export async function requestClarification(p: Principal, id: string, message: unknown, internalNote?: string | null) {
  const m = reasonText().safeParse(message);
  if (!m.success) return fail('invalid', 'Write the question for the contributor.', { message: m.error.issues[0].message });
  const n = z.string().trim().max(LIMITS.note.max).nullable().optional().safeParse(internalNote);
  if (!n.success) return fail('invalid', `The internal note is limited to ${LIMITS.note.max} characters.`, { internalNote: n.error.issues[0].message });
  return transition(p, id, 'clarification_requested', { reasonPublic: m.data, internalNote: n.data, set: { lastModeratorMessage: m.data } });
}

export async function rejectContribution(p: Principal, id: string, a: { category: unknown; reasonPublic: unknown; internalNote?: unknown }) {
  const v = z.object({ category: z.enum(REJECT_CATEGORIES), reasonPublic: reasonText(), internalNote: z.string().trim().max(LIMITS.note.max).optional() }).safeParse(a);
  if (!v.success) return fail('invalid', 'Choose a category and write the public reason.', fieldErrors(v.error));
  return transition(p, id, 'rejected', {
    reasonPublic: v.data.reasonPublic,
    internalNote: `[${v.data.category}] ${v.data.internalNote ?? ''}`.trim(),
    set: { lastModeratorMessage: v.data.reasonPublic },
  });
}

/**
 * Decide an open report. actioned: the shared item is taken offline (if still published) and the contributor is informed
 * with the PUBLIC reason only. dismissed: no change to the item. The decision note stays internal; the reporter is never named.
 */
export async function decideReport(p: Principal, reportId: string, a: { decision: unknown; note: unknown; reasonPublic?: unknown }): Promise<{ ok: true } | Fail> {
  if (!isMod(p)) return fail('forbidden_actor', 'Requires the learning moderator grant.');
  const v = z.object({ decision: z.enum(['actioned', 'dismissed']), note: reasonText(), reasonPublic: z.string().trim().max(LIMITS.message.max).optional() }).safeParse(a);
  if (!v.success) return fail('invalid', 'Record a decision and a decision note.', fieldErrors(v.error));
  const [r] = await db.select().from(schema.reports).where(eq(schema.reports.id, reportId));
  if (!r) return fail('not_found', 'Not found');
  if (r.status !== 'open') return fail('illegal_transition', 'This report has already been decided.');
  const [s] = await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, r.sharedId));
  if (!s) return fail('not_found', 'Not found');
  if (v.data.decision === 'actioned' && s.status === 'published') {
    const u = await unpublishShared(p, s.id, { reasonPublic: v.data.reasonPublic || 'A concern about this observation was upheld, so the shared version has been taken offline.', internalNote: v.data.note, reportId });
    if (!u.ok) return u;
  }
  const [done] = await db.update(schema.reports).set({ status: v.data.decision, decisionNote: v.data.note, decidedBy: p.userId, decidedAt: new Date() }).where(and(eq(schema.reports.id, reportId), eq(schema.reports.status, 'open'))).returning({ id: schema.reports.id });
  if (!done) return fail('conflict', 'This report was decided by someone else.');
  await db.insert(schema.moderationEvents).values({ contributionId: s.contributionId, sharedId: s.id, moderatorId: p.userId, actorRole: 'moderator', decision: `report_${v.data.decision}`, internalNote: v.data.note });
  await audit({ actorId: p.userId, action: `learning.report.${v.data.decision}`, resourceType: 'report', resourceId: reportId, meta: { sharedId: s.id } });
  return { ok: true };
}

/** Moderator opens a report for investigation (audited). Returns the report + the shared item + its source if it was submitted. */
export async function investigateReport(p: Principal, reportId: string) {
  if (!isMod(p)) return null;
  const [r] = await db.select().from(schema.reports).where(eq(schema.reports.id, reportId));
  if (!r) return null;
  const [s] = await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, r.sharedId));
  const [rep] = r.reporterOrgId ? await db.select({ name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.id, r.reporterOrgId)) : [];
  await audit({ actorId: p.userId, action: 'learning.report.investigate', resourceType: 'report', resourceId: reportId, meta: { sharedId: r.sharedId } });
  const siblings = await db.select({ id: schema.reports.id, reason: schema.reports.reason, status: schema.reports.status }).from(schema.reports).where(eq(schema.reports.sharedId, r.sharedId));
  return { report: r, shared: s ?? null, reporterOrgName: rep?.name ?? null, siblings };
}
