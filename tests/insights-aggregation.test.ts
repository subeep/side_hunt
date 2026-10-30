import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { as, USER } from './helpers/principals';
import { makeShared, markWithdrawnOnly } from './helpers/shared';
import { db, schema } from '@/db';
import { breakdown, countDistinctOrgs, LEDGER_WINDOW_MS, releaseStat } from '@/lib/insights/aggregation';
import { runFeed } from '@/lib/insights/search';
import { minCohortOrgs } from '@/lib/env';

afterEach(() => { delete process.env.MIN_COHORT_ORGS; });

describe('distinct-org counting', () => {
  it('counts organisations, not posts: many posts from one org are one org of evidence', async () => {
    const ids = [
      await makeShared({ org: 'org_ag1', offering: 'agg-a' }), await makeShared({ org: 'org_ag1', offering: 'agg-a' }), await makeShared({ org: 'org_ag1', offering: 'agg-a' }),
      await makeShared({ org: 'org_ag2', offering: 'agg-a' }), await makeShared({ org: 'org_ag2', offering: 'agg-a' }),
    ];
    expect(await countDistinctOrgs(ids)).toBe(2);
    const s = await releaseStat(null, ids);
    expect(s).toMatchObject({ suppressed: true, orgs: null, items: null }); // 5 posts but only 2 organisations
    expect(s.reason).toMatch(/Fewer than 3 organisations; count withheld to protect contributors/);
    ids.push(await makeShared({ org: 'org_ag3', offering: 'agg-a' }));
    expect(await releaseStat(null, ids)).toMatchObject({ suppressed: false, orgs: 3, items: 6 });
  });
  it('ignores withdrawn items when counting', async () => {
    const x = await makeShared({ org: 'org_ag4', offering: 'agg-w' });
    const y = await makeShared({ org: 'org_ag5', offering: 'agg-w' });
    const z = await makeShared({ org: 'org_ag6', offering: 'agg-w' });
    expect((await releaseStat(null, [x, y, z])).suppressed).toBe(false);
    await markWithdrawnOnly(z);
    expect(await countDistinctOrgs([x, y, z])).toBe(2);
    expect((await releaseStat(null, [x, y, z])).suppressed).toBe(true);
  });
  it('the threshold comes from MIN_COHORT_ORGS (never below 2)', async () => {
    expect(minCohortOrgs()).toBe(3);
    process.env.MIN_COHORT_ORGS = '4';
    expect(minCohortOrgs()).toBe(4);
    process.env.MIN_COHORT_ORGS = '1';
    expect(minCohortOrgs()).toBe(2);
    process.env.MIN_COHORT_ORGS = '4';
    const ids = [await makeShared({ org: 'org_ah1' }), await makeShared({ org: 'org_ah2' }), await makeShared({ org: 'org_ah3' })];
    expect((await releaseStat(null, ids)).suppressed).toBe(true);
  });
});

describe('suppression in the feed', () => {
  it('items stay readable while the count is withheld; a filter that drops the cohort below the threshold suppresses stats', async () => {
    await makeShared({ org: 'org_af1', offering: 'flt-a', industry: 'IndA' });
    await makeShared({ org: 'org_af2', offering: 'flt-a', industry: 'IndA' });
    await makeShared({ org: 'org_af3', offering: 'flt-a', industry: 'IndB' });
    const p = await as(USER.nwMember);
    const wide = await runFeed(p, { filters: { offering: 'flt-a' } });
    expect(wide!.items).toHaveLength(3);
    expect(wide!.stat).toMatchObject({ suppressed: false, orgs: 3 });
    const narrow = await runFeed(await as(USER.hbMember), { filters: { offering: 'flt-a', industry: 'IndA' } });
    expect(narrow!.items).toHaveLength(2); // still readable
    expect(narrow!.stat.suppressed).toBe(true);
    expect(narrow!.stat.orgs).toBeNull();
    expect(JSON.stringify(narrow!.stat)).not.toMatch(/org_af/);
  });
});

describe('differencing guard', () => {
  async function scenario(ns: string) {
    const common = { offering: ns };
    const ids = {
      o1: await makeShared({ org: `org_${ns}1`, period: 'P-common', ...common }),
      o2: await makeShared({ org: `org_${ns}2`, period: 'P-common', ...common }),
      o3: await makeShared({ org: `org_${ns}3`, period: 'P-common', ...common }),
      target: await makeShared({ org: `org_${ns}T`, period: 'P-target', ...common }),
    };
    return ids;
  }
  it('blocks the classic attack: two overlapping filters whose difference isolates one organisation', async () => {
    await scenario('dg-a');
    const attacker = await as(USER.nwMember);
    const all = await runFeed(attacker, { filters: { offering: 'dg-a' } });
    expect(all!.stat).toMatchObject({ suppressed: false, orgs: 4 }); // first figure released
    const part = await runFeed(attacker, { filters: { offering: 'dg-a', period: 'P-common' } });
    expect(part!.stat.suppressed).toBe(true); // 4 - 3 = the target org would be revealed
    expect(part!.stat.reason).toMatch(/differs from one you were shown earlier by fewer than 3 organisations/);
    expect(part!.items).toHaveLength(3); // items themselves remain readable
  });
  it('is symmetric: the order of the two queries does not matter', async () => {
    await scenario('dg-b');
    const u = await as(USER.hbMember);
    expect((await runFeed(u, { filters: { offering: 'dg-b', period: 'P-common' } }))!.stat.suppressed).toBe(false);
    expect((await runFeed(u, { filters: { offering: 'dg-b' } }))!.stat.suppressed).toBe(true);
  });
  it('is per-user: another user is judged against their own ledger', async () => {
    await scenario('dg-c');
    const q = { filters: { offering: 'dg-c' } };
    await runFeed(await as(USER.nwMember), q);
    expect((await runFeed(await as(USER.hbMember), { filters: { offering: 'dg-c', period: 'P-common' } }))!.stat.suppressed).toBe(false);
  });
  it('repeating the identical query is fine, and a suppressed figure is not recorded as released', async () => {
    await scenario('dg-d');
    const u = await as(USER.atMember);
    const q = { filters: { offering: 'dg-d' } };
    expect((await runFeed(u, q))!.stat.suppressed).toBe(false);
    expect((await runFeed(u, q))!.stat.suppressed).toBe(false);
    expect((await runFeed(u, { filters: { offering: 'dg-d', period: 'P-common' } }))!.stat.suppressed).toBe(true);
    const rows = await db.select().from(schema.statLedger).where(eq(schema.statLedger.userId, USER.atMember));
    expect(rows).toHaveLength(1); // only the released 4-org set; the suppressed 3-item set was never recorded
    expect(rows[0].itemIds).toHaveLength(4);
  });
  it('allows a second figure that differs by at least the threshold of organisations', async () => {
    await scenario('dg-e');
    const u = await as(USER.nwAdmin);
    await runFeed(u, { filters: { offering: 'dg-e' } });
    await makeShared({ org: 'org_dg-e-x1', offering: 'dg-e', period: 'P-more' });
    await makeShared({ org: 'org_dg-e-x2', offering: 'dg-e', period: 'P-more' });
    await makeShared({ org: 'org_dg-e-x3', offering: 'dg-e', period: 'P-more' });
    expect((await runFeed(u, { filters: { offering: 'dg-e', period: 'P-more' } }))!.stat.suppressed).toBe(false);
  });
  it('ledger entries expire after the window, so legitimate new publications do not suppress forever', async () => {
    await scenario('dg-f');
    const u = await as(USER.hbAdmin);
    await runFeed(u, { filters: { offering: 'dg-f' } });
    await db.update(schema.statLedger).set({ createdAt: new Date(Date.now() - LEDGER_WINDOW_MS - 60_000) }).where(eq(schema.statLedger.userId, USER.hbAdmin));
    expect((await runFeed(u, { filters: { offering: 'dg-f', period: 'P-common' } }))!.stat.suppressed).toBe(false);
  });
});

describe('sensitive breakdowns', () => {
  it('suppresses industry x region cells below the threshold and hides a complementary cell', async () => {
    const ids: string[] = [];
    for (const o of ['1', '2', '3']) ids.push(await makeShared({ org: `org_bd${o}`, industry: 'Bank', region: 'EU' }));
    for (const o of ['4', '5', '6']) ids.push(await makeShared({ org: `org_bd${o}`, industry: 'Bank', region: 'US' }));
    for (const o of ['7', '8', '9', 'a']) ids.push(await makeShared({ org: `org_bd${o}`, industry: 'Bank', region: 'APAC' }));
    ids.push(await makeShared({ org: 'org_bdz', industry: 'Fintech', region: 'EU' })); // rare cell: 1 org
    const b = await breakdown(ids, 'industry_region');
    const labels = b.rows.map((r) => r.label);
    expect(labels).not.toContain('Fintech × EU');
    expect(b.withheldCells).toBe(2); // the rare cell + the smallest visible cell (complementary suppression)
    expect(labels).toHaveLength(2);
    expect(b.rows.every((r) => r.orgs >= 3)).toBe(true);
    expect(JSON.stringify(b)).not.toMatch(/org_bd/);
  });
  it('shows everything when every cell is large enough', async () => {
    const ids: string[] = [];
    for (const o of ['1', '2', '3']) ids.push(await makeShared({ org: `org_be${o}`, region: 'EU' }));
    for (const o of ['4', '5', '6']) ids.push(await makeShared({ org: `org_be${o}`, region: 'US' }));
    const b = await breakdown(ids, 'region');
    expect(b.rows).toHaveLength(2);
    expect(b.withheldCells).toBe(0);
  });
});
