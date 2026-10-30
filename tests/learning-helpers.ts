import { db, schema } from '@/db';
import { newId } from '@/db/ids';
import type { ContributionStatus } from '@/db/schema/learning';
import type { Principal } from '@/lib/auth/principal';
import { createContribution, submitContribution } from '@/lib/learning/contributions';
import { claimForReview, saveSharedDraft } from '@/lib/learning/review';
import { publishShared } from '@/lib/learning/publish';

export const validInput = (over: Record<string, unknown> = {}) => ({
  kind: 'market_observation',
  title: 'Seasonal files get different treatment',
  observation: 'Analysts treated comparable seasonal small business files differently over two winters, and the outcome depended on who reviewed the file.',
  offeringSlug: 'sme-credit-decisioning',
  topic: 'Seasonal cash flow',
  industry: 'Lender',
  region: 'Somewhere broad',
  observationPeriod: 'Last two winters',
  evidenceType: 'first_hand',
  confidence: 'medium',
  supportLinks: '',
  sharingChoice: 'community',
  ...over,
});

export const ALL_CONSENTS = { store_process: true, publish_shared: true, attribution: false, training: false };

export async function mkDraft(p: Principal, over: Record<string, unknown> = {}) {
  const r = await createContribution(p, validInput(over));
  if (!r.ok) throw new Error(`createContribution failed: ${r.message} ${JSON.stringify(r.errors)}`);
  return r.id;
}
export async function mkSubmitted(p: Principal, over: Record<string, unknown> = {}, consents: Record<string, boolean> = ALL_CONSENTS) {
  const id = await mkDraft(p, over);
  const r = await submitContribution(p, id, { consents, acknowledgeFlags: true });
  if (!r.ok) throw new Error(`submit failed: ${r.message}`);
  return id;
}
export const GOOD_REP = {
  title: 'Seasonal small business files are handled inconsistently',
  summary: 'Reviewers treated comparable seasonal small business files differently over two winters, and the outcome depended on the individual reviewer.',
  industry: 'Lender',
  region: 'North America',
  periodLabel: 'Two winters',
  evidenceQuality: 'moderate',
  includeAttribution: false,
  redactionNotes: 'INTERNAL-REDACTION-NOTE removed names',
};
export async function mkPublished(author: Principal, mod: Principal, over: Record<string, unknown> = {}, rep: Record<string, unknown> = {}) {
  const id = await mkSubmitted(author, over);
  const c = await claimForReview(mod, id);
  if (!c.ok) throw new Error(`claim failed ${c.message}`);
  const s = await saveSharedDraft(mod, id, { ...GOOD_REP, ...rep });
  if (!s.ok) throw new Error(`save failed ${s.message}`);
  const pub = await publishShared(mod, id);
  if (!pub.ok) throw new Error(`publish failed ${pub.message}`);
  return { id, sharedId: pub.sharedId };
}

/** Insert a contribution row directly in any status (for state-machine tests). */
export async function insertAt(status: ContributionStatus, org: string, author: string, choice: 'private' | 'organisation' | 'community' = 'community') {
  const id = newId('con');
  await db.insert(schema.contributions).values({
    id, orgId: org, authorId: author, kind: 'market_observation', title: 'State machine fixture', observation: 'Fixture observation text for state machine tests.',
    sharingChoice: choice, status, submittedAt: status === 'draft' ? null : new Date(),
  });
  return id;
}
