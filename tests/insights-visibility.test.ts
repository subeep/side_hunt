import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { as, USER, ORG } from './helpers/principals';
import { ensureNonCommunityOrg, makeShared, markWithdrawnOnly, NON_COMMUNITY } from './helpers/shared';
import { db, schema } from '@/db';
import { canSeeFeed, getVisibleShared } from '@/lib/insights/visibility';
import { cacheKeyFor, exportFeed, runFeed, searchShared, suggest } from '@/lib/insights/search';
import { listThemes } from '@/lib/insights/themes';
import { askAira } from '@/lib/insights/aira';

let a: string, b: string, c: string, stale: string;
beforeAll(async () => {
  await ensureNonCommunityOrg('pending');
  a = await makeShared({ org: 'org_zz1', title: 'Quasar ledger seasonality', summary: 'Quasar cash flow seasonality is treated inconsistently.', offering: 'vis-a', industry: 'Retail', region: 'Europe', period: 'Q1 2026', topic: 'quasar-topic' });
  b = await makeShared({ org: 'org_zz2', title: 'Quasar document mismatch', summary: 'Document totals differ between quasar statements.', offering: 'vis-a', industry: 'Retail', region: 'Asia', period: 'Q2 2026', topic: 'quasar-topic' });
  c = await makeShared({ org: 'org_zz3', title: 'Unrelated reporting note', summary: 'Regulatory field mapping takes long.', offering: 'vis-b', industry: 'Bank', region: 'Europe', period: 'Q2 2026', topic: 'reporting' });
  stale = await makeShared({ org: 'org_zz4', title: 'Quasar unpublished stale', summary: 'quasar quasar quasar stale index row', offering: 'vis-a', status: 'unpublished' });
});

describe('feed visibility matrix', () => {
  it('community members, moderators and product owners can see the feed; nobody else', async () => {
    expect(canSeeFeed(await as(USER.nwMember))).toBe(true);
    expect(canSeeFeed(await as(USER.hbAdmin))).toBe(true);
    expect(canSeeFeed(await as(USER.moderator))).toBe(true);
    expect(canSeeFeed(await as(USER.owner))).toBe(true);
    expect(canSeeFeed(await as(USER.multi, ORG.harbor))).toBe(true);
    expect(canSeeFeed(null)).toBe(false);
    expect(canSeeFeed(await as(USER.employee))).toBe(false); // employee without grant
    expect(canSeeFeed(await as(USER.admin))).toBe(false); // portal admin is not a community role
    expect(canSeeFeed(await as(USER.publisher))).toBe(false);
    expect(canSeeFeed(await as(USER.multi))).toBe(false); // no explicit active workspace
    expect(canSeeFeed(await as(USER.outsider))).toBe(false);
    expect(canSeeFeed(await as(NON_COMMUNITY.user))).toBe(false); // org not approved
  });
  it('denied principals get nothing from search, detail, suggestions, export, themes and AIRA', async () => {
    for (const p of [null, await as(USER.employee), await as(USER.admin), await as(NON_COMMUNITY.user), await as(USER.multi)]) {
      expect(await searchShared(p, { q: 'quasar' })).toBeNull();
      expect(await runFeed(p, {})).toBeNull();
      expect(await getVisibleShared(p, a)).toBeNull();
      expect(await suggest(p, 'quasar')).toEqual([]);
      expect(await exportFeed(p, { q: 'quasar' }, 'json')).toBeNull();
      expect(await exportFeed(p, { q: 'quasar' }, 'csv')).toBeNull();
      expect(await listThemes(p)).toBeNull();
      const r = await askAira(p, { question: 'quasar seasonality', scope: 'portal' });
      expect(r.ok).toBe(false);
    }
  });
  it('an org whose community status is revoked loses access', async () => {
    await db.update(schema.orgSettings).set({ communityStatus: 'revoked' }).where(eq(schema.orgSettings.orgId, ORG.atlas));
    expect(canSeeFeed(await as(USER.atMember))).toBe(false);
    expect(await searchShared(await as(USER.atMember), { q: 'quasar' })).toBeNull();
    await db.update(schema.orgSettings).set({ communityStatus: 'approved' }).where(eq(schema.orgSettings.orgId, ORG.atlas));
    expect(canSeeFeed(await as(USER.atMember))).toBe(true);
  });
});

describe('search', () => {
  it('ranks by term relevance, excludes unpublished rows even if still indexed, and never serialises tenant fields', async () => {
    const r = await searchShared(await as(USER.nwMember), { q: 'quasar seasonality' });
    expect(r!.ids[0]).toBe(a);
    expect(r!.ids).toContain(b);
    expect(r!.ids).not.toContain(stale);
    expect(r!.ids).not.toContain(c);
    const json = JSON.stringify(r!.items);
    expect(json).not.toMatch(/org_zz|orgId|contributionId|publishedBy|con_t_/);
  });
  it('supports partial matches and the offering/industry/region/period/topic filters', async () => {
    const p = await as(USER.hbMember);
    expect((await searchShared(p, { q: 'seasonal' }))!.ids).toContain(a);
    expect((await searchShared(p, { filters: { offering: 'vis-b' } }))!.ids).toEqual([c]);
    expect((await searchShared(p, { filters: { industry: 'retail', region: 'asia' } }))!.ids).toEqual([b]);
    expect((await searchShared(p, { q: 'quasar', filters: { period: 'Q1 2026' } }))!.ids).toEqual([a]);
    expect((await searchShared(p, { filters: { topic: 'reporting' } }))!.ids).toEqual([c]);
    expect((await searchShared(p, { filters: { offering: "x' or '1'='1" } }))!.ids).toEqual([]); // parameterised
  });
  it('suggestions only come from approved published items', async () => {
    const s = await suggest(await as(USER.nwMember), 'quasar');
    expect(s.map((x) => x.text)).toContain('Quasar ledger seasonality');
    expect(s.map((x) => x.text)).not.toContain('Quasar unpublished stale');
  });
});

describe('employee-only content never reaches the feed, suggestions, exports, themes or AIRA input', () => {
  it('stays out even when text matches and an orphan index row exists', async () => {
    const [emp] = await db.insert(schema.employeeItems).values({ kind: 'internal_note', title: 'Zebrafish confidential roadmap', body: 'zebrafish internal roadmap plan' }).returning();
    await db.insert(schema.searchIndex).values({ sharedId: emp.id, text: 'zebrafish confidential roadmap', terms: { zebrafish: 3 } });
    await db.insert(schema.contentItems).values({ kind: 'page', slug: 'zebra-internal', title: 'Zebrafish employee page', summary: 'zebrafish', status: 'published', audienceKind: 'employees' });
    const p = await as(USER.owner);
    expect((await searchShared(p, { q: 'zebrafish' }))!.items).toHaveLength(0);
    expect(await suggest(p, 'zebrafish')).toEqual([]);
    expect((await exportFeed(p, { q: 'zebrafish' }, 'json'))!.body).not.toMatch(/zebrafish/i);
    expect((await exportFeed(p, {}, 'csv'))!.body).not.toMatch(/zebrafish/i);
    expect(JSON.stringify(await listThemes(p))).not.toMatch(/zebrafish/i);
    let seen = '';
    const r = await askAira(p, { question: 'zebrafish roadmap', scope: 'portal' }, { model: async (i) => ((seen = JSON.stringify(i)), 'x') });
    expect(r.ok && r.sources).toEqual([]);
    expect(seen).toBe(''); // the model was never even called: nothing was retrieved
  });
});

describe('withdrawal takes effect immediately, even through the cache', () => {
  it('a cached result is re-verified against status=published on every hit', async () => {
    const id = await makeShared({ org: 'org_zz5', title: 'Nebula withdraw me', summary: 'nebula withdraw cache check', offering: 'vis-w' });
    const p = await as(USER.nwMember);
    const first = await searchShared(p, { q: 'nebula withdraw' });
    expect(first!.ids).toContain(id);
    const second = await searchShared(p, { q: 'nebula withdraw' });
    expect(second!.cacheHit).toBe(true);
    const cached = await db.select().from(schema.retrievalCache).where(eq(schema.retrievalCache.key, cacheKeyFor('nebula withdraw', {})));
    expect(cached[0].resultIds).toContain(id);
    await markWithdrawnOnly(id); // no cache purge, no index removal
    const third = await searchShared(p, { q: 'nebula withdraw' }); // published set changed -> cache is not trusted (may be a miss)
    expect(third!.ids).not.toContain(id);
    expect(await getVisibleShared(p, id)).toBeNull();
    expect((await suggest(p, 'nebula'))).toEqual([]);
    expect((await exportFeed(p, { q: 'nebula' }, 'json'))!.body).not.toContain(id);
  });
  it('cache keys are scope+query+filter specific and order independent', () => {
    expect(cacheKeyFor('Seasonal  cash', {})).toBe(cacheKeyFor('cash seasonal', {}));
    expect(cacheKeyFor('cash', { offering: 'a' })).not.toBe(cacheKeyFor('cash', { offering: 'b' }));
  });
});

describe('export parity', () => {
  it('JSON and CSV contain exactly the items the same principal sees, with no tenant fields', async () => {
    const p = await as(USER.hbMember);
    const ui = await searchShared(p, { q: 'quasar', limit: 500 });
    const json = JSON.parse((await exportFeed(p, { q: 'quasar' }, 'json'))!.body);
    expect(json.items.map((i: { id: string }) => i.id)).toEqual(ui!.ids);
    const csv = (await exportFeed(p, { q: 'quasar' }, 'csv'))!.body.trim().split('\r\n');
    expect(csv.length).toBe(ui!.ids.length + 1);
    expect(JSON.stringify(json)).not.toMatch(/org_zz|contributionId|publishedBy/);
    const audits = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'insights.export'));
    expect(audits.length).toBeGreaterThan(0);
  });
  it('CSV neutralises spreadsheet formulas', async () => {
    await makeShared({ org: 'org_zz6', title: '=HYPERLINK("http://evil")', summary: 'formula injection check zxcv', offering: 'vis-f' });
    const csv = (await exportFeed(await as(USER.nwMember), { q: 'zxcv' }, 'csv'))!.body;
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});
