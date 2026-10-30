import { beforeAll, describe, expect, it } from 'vitest';
import { as, USER } from './helpers/principals';
import { makeShared } from './helpers/shared';
import { buildDigest, setDigest } from '@/lib/insights/engage';

// SECURITY REVIEW (insights): the digest trend line is not covered by the differencing ledger, and its topic filter is free text.
beforeAll(async () => {
  for (const o of ['org_rs3a', 'org_rs3b', 'org_rs3c']) {
    await makeShared({ org: o, title: `Rail dx ${o}`, summary: 'dx item', topic: 'rs3-dx', period: 'Q1 2031' });
    await makeShared({ org: o, title: `Rail dx later ${o}`, summary: 'dx item later', topic: 'rs3-dx', period: 'Q2 2031' });
  }
  // topic rs3-dy has exactly ONE contributing organisation: any statistic about it alone must be withheld (< 3 orgs).
  await makeShared({ org: 'org_rs3z', title: 'Rare dy', summary: 'dy item', topic: 'rs3-dy', period: 'Q2 2031' });
});

describe('review: differencing through digest topics', () => {
  it('does not let a user recover the organisation count of a withheld (single-org) topic by differencing two digests', async () => {
    const p = await as(USER.nwMember);
    await setDigest(p, { frequency: 'weekly', topics: ['rs3-dx'] });
    const a = (await buildDigest(p))!.trend.text;
    await setDigest(p, { frequency: 'weekly', topics: ['rs3-dx', 'rs3-dy'] });
    const b = (await buildDigest(p))!.trend.text;
    // a: "Q2 2031: 3 organisations ... versus 3"; b: "Q2 2031: 4 organisations ... versus 3 (1 more)". The delta is org_rs3z's lone cell.
    expect(a).not.toEqual(b);
    const orgsIn = (t: string) => Number(t.match(/: (\d+) organisations/)?.[1]);
    // Safeguard expectation: the second figure must be withheld or equal to the first.
    expect(orgsIn(b) === orgsIn(a) || Number.isNaN(orgsIn(b))).toBe(true);
  });
});
