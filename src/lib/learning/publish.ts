import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { newId } from '@/db/ids';
import type { Principal } from '../auth/principal';
import { hasGrant } from '../authz';
import { audit } from '../audit';
import { getOwnContribution, isAuthor, moderatorVisible, type Contribution } from './access';
import { currentConsents, recordConsents } from './consent';
import { LIMITS, PRODUCTION_PROPAGATION_SLA } from './constants';
import { indexSharedWith, purgeRetrievalCacheWith, removeFromIndexWith } from './indexing';
import { notifyStateChange, transition, type Tx } from './lifecycle';
import { fail, type Fail } from './result';
import { scanShared } from './sensitive';

import { z } from 'zod';
import { fieldErrors, reasonText, sharedRepInput } from './validation';

const noteMax = z.string().trim().max(LIMITS.note.max).nullable().optional();
const unpublishText = z.object({ reasonPublic: reasonText(), internalNote: noteMax });
const reinstateText = z.object({ reasonPublic: z.string().trim().max(LIMITS.message.max).nullable().optional(), internalNote: noteMax });

export { PRODUCTION_PROPAGATION_SLA, scanShared };
export interface TraceStep {
  step: string;
  at: string;
  ms_since_start: number;
}

export const indexShared = (sharedId: string) => indexSharedWith(db, sharedId);
export const removeFromIndex = (sharedId: string) => removeFromIndexWith(db, sharedId);
export const purgeRetrievalCache = (sharedId: string) => purgeRetrievalCacheWith(db, sharedId);

const isModerator = (p: Principal) => hasGrant(p, 'learning_moderator');
const tracer = () => {
  const t0 = Date.now();
  const trace: TraceStep[] = [];
  return { trace, step: (step: string) => trace.push({ step, at: new Date().toISOString(), ms_since_start: Date.now() - t0 }) };
};

/**
 * Publish the moderator's REVIEWED shared representation (in_review -> published). Creates a shared_contributions row
 * that contains ONLY reviewed fields (categorical context copied from the source: kind, offering, topic, evidence type,
 * confidence; free text only from the moderator's redacted form). A previous published version of the same contribution
 * becomes 'superseded' and leaves the index/caches. Refuses while sensitive flags remain unless acknowledged.
 */
export async function publishShared(moderator: Principal, contributionId: string, opts: { acknowledgeResidualFlags?: boolean } = {}): Promise<{ ok: true; sharedId: string; version: number; superseded: string[] } | Fail> {
  if (!isModerator(moderator)) return fail('forbidden_actor', 'Requires the learning moderator grant.');
  const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, contributionId));
  if (!c || !moderatorVisible(c)) return fail('not_found', 'Not found');
  if (c.status !== 'in_review') return fail('illegal_transition', `A contribution that is "${c.status.replace('_', ' ')}" cannot be published.`);
  const [draft] = await db.select().from(schema.reviewDrafts).where(eq(schema.reviewDrafts.contributionId, contributionId));
  if (!draft || !draft.reviewed) return fail('precondition', 'Save the reviewed shared representation before publishing.');
  const rep = sharedRepInput.safeParse(draft);
  if (!rep.success) return fail('invalid', 'The shared representation is incomplete.', fieldErrors(rep.error));
  const residual = scanShared(rep.data);
  if (residual.length && !opts.acknowledgeResidualFlags) return fail('precondition', `The shared text still contains ${residual.length} possibly sensitive item(s). Redact them, or acknowledge that you have judged them safe to publish.`);
  const consents = await currentConsents(contributionId);
  if (!consents.store_process.granted || !consents.publish_shared.granted) return fail('precondition', 'The contributor has not given the consents required to publish.');
  if (rep.data.includeAttribution && !consents.attribution.granted) return fail('precondition', 'The contributor did not consent to attribution.');
  const [org] = await db.select({ name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.id, c.orgId));

  const sharedId = newId('shr');
  const superseded: string[] = [];
  const t = await transition(moderator, contributionId, 'published', {
    sharedId,
    internalNote: rep.data.redactionNotes,
    set: { currentSharedId: sharedId, lastModeratorMessage: null },
    inTx: async (tx) => {
      await tx.insert(schema.sharedContributions).values({
        id: sharedId, contributionId, orgId: c.orgId, version: c.version,
        kind: c.kind, offeringSlug: c.offeringSlug, topic: c.topic, evidenceType: c.evidenceType, confidence: c.confidence,
        title: rep.data.title, summary: rep.data.summary, industry: rep.data.industry, region: rep.data.region, periodLabel: rep.data.periodLabel,
        evidenceQuality: rep.data.evidenceQuality,
        attributionLabel: rep.data.includeAttribution ? (org?.name ?? null) : null,
        status: 'published', publishedBy: moderator.userId, publishedAt: new Date(),
      });
      const old = await tx
        .update(schema.sharedContributions)
        .set({ status: 'superseded' })
        .where(and(eq(schema.sharedContributions.contributionId, contributionId), inArray(schema.sharedContributions.status, ['published', 'unpublished']), sql`${schema.sharedContributions.id} <> ${sharedId}`))
        .returning({ id: schema.sharedContributions.id });
      superseded.push(...old.map((o) => o.id));
    },
  });
  if (!t.ok) return t;
  await indexShared(sharedId);
  for (const id of superseded) {
    await removeFromIndex(id);
    await purgeRetrievalCache(id);
    await audit({ actorId: moderator.userId, action: 'learning.shared.superseded', resourceType: 'shared_contribution', resourceId: id, meta: { by: sharedId } });
  }
  await audit({ actorId: moderator.userId, action: 'learning.shared.publish', resourceType: 'shared_contribution', resourceId: sharedId, meta: { version: c.version, superseded, residualFlagsAcknowledged: residual.length > 0 } });
  return { ok: true, sharedId, version: c.version, superseded };
}

async function loadShared(sharedId: string) {
  const [s] = await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, sharedId));
  if (!s) return null;
  const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, s.contributionId));
  return c ? { s, c } : null;
}

/**
 * Take a published shared item offline (moderator, e.g. while a report is open). The shared row flips FIRST (reads always
 * re-check status='published'), then index and caches are purged. The contributor is told (public reason only).
 */
export async function unpublishShared(moderator: Principal, sharedId: string, a: { reasonPublic: string; internalNote?: string | null; reportId?: string }): Promise<{ ok: true } | Fail> {
  if (!isModerator(moderator)) return fail('forbidden_actor', 'Requires the learning moderator grant.');
  const txt = unpublishText.safeParse(a);
  if (!txt.success) return fail('invalid', 'Write a public reason (5 to 600 characters); the internal note is limited to 1000 characters.', fieldErrors(txt.error));
  const found = await loadShared(sharedId);
  if (!found || !moderatorVisible(found.c)) return fail('not_found', 'Not found');
  if (found.s.status !== 'published') return fail('illegal_transition', `A shared item that is "${found.s.status}" cannot be unpublished.`);
  const flip = (tx: Tx) => tx.update(schema.sharedContributions).set({ status: 'unpublished' }).where(and(eq(schema.sharedContributions.id, sharedId), eq(schema.sharedContributions.status, 'published')));
  const r = await offlineOrOnline(moderator, found.c, sharedId, 'unpublished', 'published', 'unpublished', flip, a);
  if (!r.ok) return r;
  await removeFromIndex(sharedId);
  const purged = await purgeRetrievalCache(sharedId);
  await audit({ actorId: moderator.userId, action: 'learning.shared.unpublish', resourceType: 'shared_contribution', resourceId: sharedId, meta: { reportId: a.reportId ?? null, cachePurged: purged } });
  return { ok: true };
}

/** Put an unpublished item back online after review (moderator). Re-indexes it. */
export async function reinstateShared(moderator: Principal, sharedId: string, a: { reasonPublic?: string | null; internalNote?: string | null } = {}): Promise<{ ok: true } | Fail> {
  if (!isModerator(moderator)) return fail('forbidden_actor', 'Requires the learning moderator grant.');
  const found = await loadShared(sharedId);
  if (!found || !moderatorVisible(found.c)) return fail('not_found', 'Not found');
  const txt = reinstateText.safeParse(a);
  if (!txt.success) return fail('invalid', 'The message or note is too long.', fieldErrors(txt.error));
  if (found.s.status !== 'unpublished') return fail('illegal_transition', `A shared item that is "${found.s.status}" cannot be reinstated.`);
  const flip = (tx: Tx) => tx.update(schema.sharedContributions).set({ status: 'published' }).where(and(eq(schema.sharedContributions.id, sharedId), eq(schema.sharedContributions.status, 'unpublished')));
  const r = await offlineOrOnline(moderator, found.c, sharedId, 'published', 'unpublished', 'reinstated', flip, { reasonPublic: a.reasonPublic ?? 'The review is complete and the shared version is live again.', internalNote: a.internalNote });
  if (!r.ok) return r;
  await indexShared(sharedId);
  await audit({ actorId: moderator.userId, action: 'learning.shared.reinstate', resourceType: 'shared_contribution', resourceId: sharedId });
  return { ok: true };
}

/**
 * unpublish/reinstate: normally the contribution itself transitions (published <-> unpublished). When a NEWER version is
 * pending review the contribution is in another status; the live shared copy is still flipped, with an event + notice.
 */
async function offlineOrOnline(moderator: Principal, c: Contribution, sharedId: string, to: 'published' | 'unpublished', fromExpected: 'published' | 'unpublished', decision: string, flip: (tx: Tx) => Promise<unknown>, a: { reasonPublic?: string | null; internalNote?: string | null }) {
  if (c.status === fromExpected) {
    return transition(moderator, c.id, to, { sharedId, reasonPublic: a.reasonPublic, internalNote: a.internalNote, set: { lastModeratorMessage: to === 'unpublished' ? (a.reasonPublic ?? null) : null }, inTx: async (tx) => void (await flip(tx)) });
  }
  const ev = await db.transaction(async (tx) => {
    await flip(tx);
    const [e] = await tx.insert(schema.moderationEvents).values({ contributionId: c.id, sharedId, moderatorId: moderator.userId, actorRole: 'moderator', fromStatus: c.status, toStatus: c.status, decision, reasonPublic: a.reasonPublic ?? null, internalNote: a.internalNote ?? null }).returning({ id: schema.moderationEvents.id });
    return e;
  });
  await audit({ actorId: moderator.userId, action: `learning.contribution.${decision}`, resourceType: 'contribution', resourceId: c.id, orgId: c.orgId, meta: { sharedId, note: 'newer version pending review' } });
  await notifyStateChange({ contribution: c, decision, eventId: ev.id, reasonPublic: a.reasonPublic });
  return { ok: true as const };
}

/**
 * AUTHOR withdrawal. ONE synchronous call that atomically: marks the shared copy withdrawn (+ withdrawn_at), deletes its
 * search_index row, purges retrieval_cache rows referencing it, records the consent withdrawal, moves the contribution to
 * 'withdrawn' (moderation event), then audits and notifies the author. Returns a trace of every invalidation stage.
 * Honest limits are in WITHDRAWAL_CAVEATS: viewed material / third-party copies cannot be recalled; no model is untrained.
 */
export async function withdrawShared(p: Principal, sharedId: string): Promise<{ ok: true; trace: TraceStep[]; sla: string } | Fail> {
  const { trace, step } = tracer();
  const found = await loadShared(sharedId);
  if (!found || !isAuthor(p, found.c)) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'learning.shared.withdraw', resourceType: 'shared_contribution', resourceId: sharedId, outcome: 'deny' });
    return fail('not_found', 'Not found');
  }
  const { s, c } = found;
  if (!['published', 'unpublished'].includes(s.status)) return fail('illegal_transition', `A shared item that is "${s.status}" cannot be withdrawn.`);
  step('authorised: caller is the contributing author in the active workspace');
  // A newer version pending review, or a rejected revision, leaves the contribution in another status while v-previous is still live.
  const otherStatus = ['submitted', 'in_review', 'clarification_requested', 'rejected'].includes(c.status);
  const t = await transition(p, c.id, 'withdrawn', {
    sharedId,
    special: otherStatus ? 'withdraw_live' : undefined,
    reasonPublic: 'Withdrawn by the contributor.',
    inTx: async (tx) => {
      await tx.update(schema.sharedContributions).set({ status: 'withdrawn', withdrawnAt: new Date() }).where(eq(schema.sharedContributions.id, sharedId));
      step('shared copy marked withdrawn (withdrawn_at set); reads re-check status and stop serving it');
      const n = await removeFromIndexWith(tx as never, sharedId);
      step(`search index row deleted (${n} row)`);
      const k = await purgeRetrievalCacheWith(tx as never, sharedId);
      step(`retrieval cache purged (${k} cached result${k === 1 ? '' : 's'} referencing it removed)`);
      await recordConsents(tx as never, { contributionId: c.id, userId: p.userId, version: c.version, desired: { publish_shared: false, attribution: false, training: false }, note: 'withdrawn by author' });
      step('consent withdrawal recorded (append-only history kept)');
      await tx.delete(schema.reviewDrafts).where(eq(schema.reviewDrafts.contributionId, c.id));
      step('moderator working draft of the private text discarded; moderators can no longer open the source');
    },
  });
  if (!t.ok) return t;
  // Any older superseded versions of this contribution must also be out of index/caches (defence in depth).
  const stale = await db.select({ id: schema.sharedContributions.id }).from(schema.sharedContributions).where(and(eq(schema.sharedContributions.contributionId, c.id), inArray(schema.sharedContributions.status, ['superseded'])));
  for (const x of stale) {
    await removeFromIndex(x.id);
    await purgeRetrievalCache(x.id);
  }
  step('contribution moved to withdrawn; audit event written; author notified in-app');
  const [idx] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.searchIndex).where(eq(schema.searchIndex.sharedId, sharedId));
  const [cache] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.retrievalCache).where(sql`${schema.retrievalCache.resultIds} @> ${JSON.stringify([sharedId])}::jsonb`);
  step(`verified: ${idx.n} index rows and ${cache.n} cache entries still reference it`);
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'learning.shared.withdraw', resourceType: 'shared_contribution', resourceId: sharedId, orgId: c.orgId, meta: { trace: trace.map((x) => x.step), msTotal: trace[trace.length - 1]?.ms_since_start } });
  return { ok: true, trace, sla: PRODUCTION_PROPAGATION_SLA };
}

/** Shared copies of one contribution as the author sees them (public columns + lifecycle state only). */
export async function sharedVersions(contributionId: string) {
  const s = schema.sharedContributions;
  return db.select({ id: s.id, version: s.version, status: s.status, title: s.title, summary: s.summary, industry: s.industry, region: s.region, periodLabel: s.periodLabel, evidenceQuality: s.evidenceQuality, attributionLabel: s.attributionLabel, publishedAt: s.publishedAt, withdrawnAt: s.withdrawnAt }).from(s).where(eq(s.contributionId, contributionId)).orderBy(s.version);
}

/**
 * Author withdrawal by CONTRIBUTION id (what the UI knows). Community items: withdraws the live shared copy (full trace).
 * Community proposals still awaiting a decision (submitted / in review / clarification requested): the author takes the
 * proposal back; nothing was ever published, the publication consent is recorded as withdrawn and moderators lose access.
 * Organisation-only items: there is no shared copy; the contribution leaves its organisation's view.
 */
export async function withdrawContribution(p: Principal, contributionId: string): Promise<{ ok: true; trace: TraceStep[]; sla: string } | Fail> {
  const c = await getOwnContribution(p, contributionId, 'learning.contribution.withdraw');
  if (!c) return fail('not_found', 'Not found');
  const live = await db.select({ id: schema.sharedContributions.id }).from(schema.sharedContributions).where(and(eq(schema.sharedContributions.contributionId, contributionId), inArray(schema.sharedContributions.status, ['published', 'unpublished'])));
  if (live.length) return withdrawShared(p, live[0].id);
  const { trace, step } = tracer();
  if (c.sharingChoice === 'community' && ['submitted', 'in_review', 'clarification_requested'].includes(c.status)) {
    step('authorised: caller is the contributing author in the active workspace');
    const w = await transition(p, contributionId, 'withdrawn', {
      special: 'withdraw_pending',
      reasonPublic: 'Withdrawn by the contributor before a decision was made.',
      inTx: async (tx) => {
        await recordConsents(tx as never, { contributionId, userId: p.userId, version: c.version, desired: { publish_shared: false, attribution: false, training: false }, note: 'withdrawn by author before moderation finished' });
        step('consent withdrawal recorded (append-only history kept); a moderator can no longer publish this');
        await tx.delete(schema.reviewDrafts).where(eq(schema.reviewDrafts.contributionId, contributionId));
        step('moderator working draft discarded; the contribution leaves the moderation queue and moderators can no longer open your private text');
      },
    });
    if (!w.ok) return w;
    step('proposal withdrawn; nothing was ever published, so there is no shared copy, index row or cache entry; audit written and author notified');
    return { ok: true, trace, sla: PRODUCTION_PROPAGATION_SLA };
  }
  if (c.sharingChoice !== 'organisation' || c.status !== 'published') return fail('illegal_transition', 'There is nothing published to withdraw.');
  step('authorised: caller is the contributing author in the active workspace');
  const t = await transition(p, contributionId, 'withdrawn', {
    reasonPublic: 'Withdrawn by the contributor.',
    inTx: async (tx) => {
      await recordConsents(tx as never, { contributionId, userId: p.userId, version: c.version, desired: { training: false }, note: 'withdrawn by author' });
    },
  });
  if (!t.ok) return t;
  step('organisation-only contribution withdrawn; colleagues can no longer open it or see it in the organisation list; audit written and author notified');
  return { ok: true, trace, sla: PRODUCTION_PROPAGATION_SLA };
}
