import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { as, USER } from './helpers/principals';
import { makeShared } from './helpers/shared';
import { db, schema } from '@/db';
import { searchShared } from '@/lib/insights/search';
import { createIdea, updateIdea } from '@/lib/insights/ideas';

let ev: string;
beforeAll(async () => {
  ev = await makeShared({ org: 'org_rv1', title: 'Zebra ledger oddity', summary: 'Zebra ledger oddity is reported often enough here.', topic: 'rv-topic' });
});

describe('review: requirements coverage (insights)', () => {
  it('a newly published item appears in the default feed immediately after a prior (cached) search', async () => {
    const p = await as(USER.nwMember);
    await searchShared(p, {}); // warms retrieval_cache for the empty query
    const fresh = await makeShared({ org: 'org_rv2', title: 'Brand new approved observation', summary: 'Published right after the cache was warmed.' });
    const r = await searchShared(p, { limit: 500 });
    expect(r!.ids).toContain(fresh);
  });

  it('partial updateIdea does not silently reset priority or drop linked evidence', async () => {
    const owner = await as(USER.owner);
    const { id } = await createIdea(owner, { title: 'Zebra ledger explanation improvement', problem: 'Zebra ledger oddity needs a clearer explanation for reviewers.', proposedOutcome: 'Reviewers see a clear explanation.', priority: 'high', evidenceIds: [ev] });
    await updateIdea(owner, id, { team: 'Analytics' });
    const [row] = await db.select().from(schema.ideas).where(eq(schema.ideas.id, id));
    expect(row.priority).toBe('high');
    const links = await db.select().from(schema.ideaEvidence).where(eq(schema.ideaEvidence.ideaId, id));
    expect(links.map((l) => l.sharedId)).toEqual([ev]);
  });
});
