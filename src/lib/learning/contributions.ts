import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { ConsentPurpose } from '@/db/schema/learning';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { rateLimit } from '../ratelimit';
import { getOwnContribution, type Contribution } from './access';
import { recordConsents, currentConsents } from './consent';
import { transition } from './lifecycle';
import { fail, type Fail } from './result';
import { flagsFingerprint, scanFields } from './sensitive';
import { contributionInput, fieldErrors, submissionGaps, type ContributionInput } from './validation';

/** Fields whose change alters what a moderator/reader would see => renewed review for a published community item. */
export const MATERIAL_FIELDS = ['kind', 'title', 'observation', 'offeringSlug', 'industry', 'region', 'observationPeriod', 'evidenceType', 'confidence', 'topic'] as const;

export const scanContribution = (c: Pick<ContributionInput, 'title' | 'observation' | 'industry' | 'region' | 'observationPeriod' | 'supportLinks'>) =>
  scanFields({ title: c.title, observation: c.observation, industry: c.industry, region: c.region, observationPeriod: c.observationPeriod, supportLinks: c.supportLinks });

const contentColumns = (i: ContributionInput) => ({
  kind: i.kind, title: i.title, observation: i.observation, offeringSlug: i.offeringSlug, industry: i.industry, region: i.region,
  observationPeriod: i.observationPeriod, evidenceType: i.evidenceType, confidence: i.confidence, topic: i.topic, supportLinks: i.supportLinks,
});

function parse(raw: unknown): { ok: true; data: ContributionInput } | Fail {
  const r = contributionInput.safeParse(raw);
  return r.success ? { ok: true, data: r.data } : fail('invalid', 'Please fix the highlighted fields.', fieldErrors(r.error));
}
const noWorkspace = () => fail('no_workspace', 'Choose an active client workspace first.');
const communityNotApproved = () => fail('precondition', 'Your organisation is not an approved participant in the learning community, so you cannot propose community sharing.');

/**
 * Create a PRIVATE DRAFT. Saving never shares anything, whatever the sharing choice selected: status is always 'draft'
 * until an explicit submit with the required consents.
 */
export async function createContribution(p: Principal, raw: unknown): Promise<{ ok: true; id: string } | Fail> {
  if (!p.activeOrgId || p.activeOrgRole === null || p.activeOrgRole === 'employee') return noWorkspace();
  const v = parse(raw);
  if (!v.ok) return v;
  if (v.data.sharingChoice === 'community' && !p.communityApproved) return communityNotApproved();
  const flags = scanContribution(v.data);
  const [row] = await db
    .insert(schema.contributions)
    .values({ ...contentColumns(v.data), orgId: p.activeOrgId, authorId: p.userId, sharingChoice: v.data.sharingChoice, status: 'draft', version: 1, sensitiveFlags: flags, sensitiveAcknowledged: false })
    .returning({ id: schema.contributions.id });
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'learning.contribution.create', resourceType: 'contribution', resourceId: row.id, orgId: p.activeOrgId, meta: { sharingChoice: v.data.sharingChoice, flags: flags.length } });
  return { ok: true, id: row.id };
}

/**
 * Save edits. Behaviour by status:
 *  draft / clarification_requested: update in place (status unchanged: saving never submits or shares).
 *  published (community): a MATERIAL change creates version+1 and moves to 'submitted' for renewed review; the live shared
 *    copy is untouched until the new version is approved. Requires acknowledging any sensitive flags.
 *  published (organisation-only): updated in place (version+1 if material); it never reaches the community.
 *  anything else: locked.
 * The sharing choice can only be changed while still a draft: it can never be silently widened afterwards.
 */
export async function saveContribution(p: Principal, id: string, raw: unknown, opts: { acknowledgeFlags?: boolean } = {}): Promise<{ ok: true; id: string; status: string; version: number; renewedReview: boolean } | Fail> {
  const row = await getOwnContribution(p, id);
  if (!row) return fail('not_found', 'Not found');
  const v = parse(raw);
  if (!v.ok) return v;
  const next = v.data;
  const done = (c: Contribution, renewedReview = false) => ({ ok: true as const, id, status: c.status, version: c.version, renewedReview });

  if (next.sharingChoice !== row.sharingChoice) {
    if (row.status !== 'draft') return fail('locked', 'The sharing choice cannot be changed after submission, so an audience can never be silently widened. To share more widely, create a new contribution.');
    if (next.sharingChoice === 'community' && !p.communityApproved) return communityNotApproved();
  }
  if (!['draft', 'clarification_requested', 'published'].includes(row.status)) return fail('locked', `A contribution that is "${row.status.replace('_', ' ')}" cannot be edited.`);

  const flags = scanContribution(next);
  const flagsChanged = flagsFingerprint(flags) !== flagsFingerprint(row.sensitiveFlags ?? []);
  const material = MATERIAL_FIELDS.some((f) => (next[f] ?? null) !== (row[f] ?? null));
  const linksChanged = JSON.stringify(next.supportLinks) !== JSON.stringify(row.supportLinks ?? []);
  const cols = contentColumns(next);

  if (row.status === 'published') {
    if (!material && !linksChanged) return done(row);
    if (flags.length && !opts.acknowledgeFlags) return fail('precondition', 'The scan flagged possibly sensitive content. Review the flagged text and tick the acknowledgement to continue.');
    if (!material) {
      const [u] = await db.update(schema.contributions).set({ supportLinks: next.supportLinks, updatedAt: new Date() }).where(eq(schema.contributions.id, id)).returning();
      return done(u);
    }
    if (row.sharingChoice === 'organisation') {
      const [u] = await db.update(schema.contributions).set({ ...cols, version: row.version + 1, sensitiveFlags: flags, sensitiveAcknowledged: flags.length > 0, updatedAt: new Date() }).where(eq(schema.contributions.id, id)).returning();
      await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'learning.contribution.edit', resourceType: 'contribution', resourceId: id, orgId: row.orgId, meta: { version: u.version, scope: 'organisation' } });
      return done(u);
    }
    const consents = await currentConsents(id);
    if (!consents.store_process.granted || !consents.publish_shared.granted) return fail('precondition', 'Required consents are not in place for this contribution.');
    const t = await transition(p, id, 'submitted', {
      special: 'material_edit',
      set: { ...cols, version: row.version + 1, sensitiveFlags: flags, sensitiveAcknowledged: flags.length > 0, lastModeratorMessage: null },
      // currentSharedId is NOT touched: the live shared version keeps serving until the new one is approved.
    });
    return t.ok ? done(t.contribution, true) : t;
  }

  const [u] = await db
    .update(schema.contributions)
    .set({ ...cols, sharingChoice: next.sharingChoice, sensitiveFlags: flags, sensitiveAcknowledged: flagsChanged ? false : row.sensitiveAcknowledged, updatedAt: new Date() })
    .where(eq(schema.contributions.id, id))
    .returning();
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'learning.contribution.save', resourceType: 'contribution', resourceId: id, orgId: row.orgId, meta: { status: u.status, flags: flags.length } });
  return done(u);
}

export type ConsentChoices = Partial<Record<ConsentPurpose, boolean>>;

/**
 * Explicit submission. Draft (or returned) -> community: 'submitted' for moderation. Organisation-only: shared with the
 * author's organisation directly (no moderation, never cross-client). Private items cannot be submitted.
 * Requires store_process consent (always), publish_shared (community), acknowledgement of scan flags, and completeness.
 */
export async function submitContribution(p: Principal, id: string, a: { consents: ConsentChoices; acknowledgeFlags?: boolean }) {
  const row = await getOwnContribution(p, id);
  if (!row) return fail('not_found', 'Not found');
  if (!['draft', 'clarification_requested'].includes(row.status)) return fail('illegal_transition', `A contribution that is "${row.status.replace('_', ' ')}" cannot be submitted.`);
  if (row.sharingChoice === 'private') return fail('precondition', 'This contribution is private to you. Choose "within my organisation" or "propose community sharing" before submitting.');
  if (row.sharingChoice === 'community' && !p.communityApproved) return communityNotApproved();
  const v = parse({ ...row, supportLinks: row.supportLinks ?? [] });
  if (!v.ok) return v;
  const gaps = submissionGaps(row);
  if (gaps.length) return fail('invalid', `Add the missing context before submitting: ${gaps.join(', ')}.`);
  if (!a.consents.store_process) return fail('precondition', 'You must agree to storage and processing before submitting anything.');
  if (row.sharingChoice === 'community' && !a.consents.publish_shared) return fail('precondition', 'Proposing community sharing needs your separate consent to publish a reviewed shared summary.');
  const flags = scanContribution(v.data);
  if (flags.length && !a.acknowledgeFlags) return fail('precondition', 'The scan flagged possibly sensitive content. Review the flagged text and acknowledge it before submitting. The scan is not a privacy guarantee.');
  if (!(await rateLimit(`learn:submit:${p.userId}`, 30, 3600))) return fail('rate_limited', 'Too many submissions. Try again later.');

  const community = row.sharingChoice === 'community';
  const desired: ConsentChoices = {
    store_process: true,
    publish_shared: community && !!a.consents.publish_shared,
    attribution: community && !!a.consents.attribution,
    training: !!a.consents.training,
  };
  return transition(p, id, community ? 'submitted' : 'published', {
    special: community ? undefined : 'org_only',
    set: { sensitiveFlags: flags, sensitiveAcknowledged: flags.length > 0, lastModeratorMessage: null },
    inTx: async (tx) => {
      await recordConsents(tx as never, { contributionId: id, userId: p.userId, version: row.version, desired, note: community ? 'submitted for community review' : 'shared with own organisation' });
    },
  });
}
