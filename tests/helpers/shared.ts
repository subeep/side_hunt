import { db, schema } from '@/db';
import { buildTerms } from '@/lib/insights/text';
import { newId } from '@/db/ids';

export interface SharedFixture {
  id?: string;
  org: string; // internal org id (need not be a real organisation)
  title?: string;
  summary?: string;
  offering?: string | null;
  industry?: string | null;
  region?: string | null;
  period?: string | null;
  topic?: string | null;
  quality?: 'unassessed' | 'weak' | 'moderate' | 'strong';
  status?: 'published' | 'unpublished' | 'withdrawn' | 'superseded';
  authorId?: string; // creates a private source contribution owned by this user in `org`
  indexed?: boolean;
}

/** Inline fixture for insights tests: a shared_contributions row + search_index row (+ optional private source row). */
export async function makeShared(o: SharedFixture): Promise<string> {
  const id = o.id ?? newId('shr_t');
  const contributionId = `con_t_${id}`;
  const title = o.title ?? `Observation ${id}`;
  const summary = o.summary ?? 'Generic observation text for tests.';
  if (o.authorId)
    await db.insert(schema.contributions).values({ id: contributionId, orgId: o.org, authorId: o.authorId, kind: 'market_observation', title: `PRIVATE ${title}`, observation: `PRIVATE SOURCE ${summary}`, status: 'published', currentSharedId: id });
  await db.insert(schema.sharedContributions).values({
    id, contributionId, orgId: o.org, version: 1, kind: 'market_observation', title, summary, offeringSlug: o.offering ?? null, industry: o.industry ?? null,
    region: o.region ?? null, periodLabel: o.period ?? null, topic: o.topic ?? null, evidenceType: 'first_hand', confidence: 'medium', evidenceQuality: o.quality ?? 'moderate',
    status: o.status ?? 'published', publishedAt: new Date(),
  });
  if (o.indexed !== false) {
    const text = `${title} ${summary}`;
    await db.insert(schema.searchIndex).values({ sharedId: id, text, terms: buildTerms(text) });
  }
  return id;
}

/** Simulates a withdrawal at the DB level WITHOUT purging caches, to prove reads re-check status at read time. */
export async function markWithdrawnOnly(id: string) {
  const { eq } = await import('drizzle-orm');
  await db.update(schema.sharedContributions).set({ status: 'withdrawn', withdrawnAt: new Date() }).where(eq(schema.sharedContributions.id, id));
}

export const NON_COMMUNITY = { user: 'usr_t_nc', org: 'org_t_nc' };
/** A real client org that is NOT an approved community participant, with one member. */
export async function ensureNonCommunityOrg(status: 'none' | 'pending' | 'revoked' = 'pending') {
  await db.insert(schema.organisations).values({ id: NON_COMMUNITY.org, name: 'Unapproved Test Org', slug: 'unapproved-test', kind: 'client' }).onConflictDoNothing();
  await db.insert(schema.orgSettings).values({ orgId: NON_COMMUNITY.org, communityStatus: status }).onConflictDoNothing();
  await db.insert(schema.users).values({ id: NON_COMMUNITY.user, email: 'member@unapproved.example', name: 'Una Approved' }).onConflictDoNothing();
  await db.insert(schema.memberships).values({ userId: NON_COMMUNITY.user, orgId: NON_COMMUNITY.org, role: 'client_member' }).onConflictDoNothing();
}
