import { beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { as, USER } from './helpers/principals';
import { makeShared, markWithdrawnOnly } from './helpers/shared';
import { db, schema } from '@/db';
import { clusterItems, findDuplicates, getThemeView, listThemes, periodKey, rebuildThemes, themeConfidence, trendSummary } from '@/lib/insights/themes';

const mk = (id: string, title: string, summary: string, offeringSlug: string | null = 'x', topic: string | null = null) => ({ id, title, summary, offeringSlug, topic });
let tA: string[], tB: string[];
let themeId: string;

beforeAll(async () => {
  tA = [];
  for (const [n, org] of ['1', '2', '3'].entries())
    tA.push(await makeShared({ org: `org_th${org}`, title: `Walrus harvest cycles variant ${n}`, summary: 'Walrus harvest cycles create uneven cash receipts that reviewers treat differently.', offering: 'th-a', topic: 'walrus', period: n === 2 ? 'Q2 2026' : 'Q1 2026', quality: 'strong' }));
  tB = [await makeShared({ org: 'org_th9', title: 'Okapi reporting field mapping', summary: 'Okapi mapping of regulatory fields is slow and manual.', offering: 'th-b', topic: 'okapi' }), await makeShared({ org: 'org_th9', title: 'Okapi reporting validation', summary: 'Okapi regulatory validation exceptions are unclear.', offering: 'th-b', topic: 'okapi' })];
  const [t] = await db.insert(schema.themes).values({ title: 'Walrus cycles (hand made)', summary: 'Hand-made theme', offeringSlug: 'th-a', createdBy: 'usr_owner', caveat: 'Hand-written caveat.' }).returning();
  themeId = t.id;
  await db.insert(schema.themeMembers).values([...tA, tB[0]].map((sharedId) => ({ themeId, sharedId, addedBy: 'usr_owner' })));
});

describe('clustering (deterministic TF-IDF)', () => {
  const items = [
    mk('a1', 'Seasonal cash flow inconsistency', 'Seasonal SME cash flow is treated inconsistently', 'sme', 'seasonality'),
    mk('a2', 'Seasonal cash flow treatment', 'Treatment of seasonal cash flow differs by reviewer', 'sme', 'seasonality'),
    mk('b1', 'Report field mapping', 'Regulatory report field mapping is manual and slow', 'riva', 'reporting'),
    mk('b2', 'Report validation mapping', 'Validation of regulatory report field mapping is unclear', 'riva', 'reporting'),
    mk('c1', 'Totally unrelated thing', 'Office coffee supplies and parking', null, null),
  ];
  it('groups similar items, keeps dissimilar apart, is order independent', () => {
    const c1 = clusterItems(items);
    const c2 = clusterItems([...items].reverse());
    expect(c1).toEqual(c2);
    const groups = c1.map((g) => g.join(','));
    expect(groups).toContain('a1,a2');
    expect(groups).toContain('b1,b2');
    expect(groups).toContain('c1');
  });
  it('detects near duplicates and ignores merely related items', () => {
    const d = findDuplicates([mk('d1', 'Walrus harvest cycles', 'Walrus harvest cycles create uneven cash receipts'), mk('d2', 'Walrus harvest cycles', 'Walrus harvest cycles create uneven cash receipts!'), mk('d3', 'Okapi mapping', 'Regulatory field mapping is slow')]);
    expect(d).toHaveLength(1);
    expect([d[0].aId, d[0].bId]).toEqual(['d1', 'd2']);
  });
});

describe('theme views', () => {
  it('shows only published+visible evidence, distinct-org stats where safe, confidence/limitations and the disclaimer', async () => {
    const v = await getThemeView(await as(USER.nwMember), themeId);
    expect(v!.items.map((i) => i.id).sort()).toEqual([...tA, tB[0]].sort());
    expect(v!.stat).toMatchObject({ suppressed: false, orgs: 4 });
    expect(v!.periods).toEqual(['Q1 2026', 'Q2 2026']);
    expect(v!.confidence.label).not.toBe('low');
    expect(v!.limitations.join(' ')).toMatch(/Hand-written caveat/);
    expect(v!.disclaimer).toMatch(/Popularity is not market prevalence or proof of causation/);
    expect(v!.latestUpdate).toBeInstanceOf(Date);
    expect(v!.duplicates.length).toBeGreaterThan(0); // the three near-identical walrus items
    expect(JSON.stringify(v)).not.toMatch(/org_th|contributionId|publishedBy/);
  });
  it('withdrawn evidence disappears from the theme immediately and the cohort shrinks', async () => {
    const x = await makeShared({ org: 'org_th7', title: 'Walrus extra', summary: 'Walrus extra evidence', offering: 'th-a' });
    await db.insert(schema.themeMembers).values({ themeId, sharedId: x });
    const p = await as(USER.hbMember);
    expect((await getThemeView(p, themeId))!.items.map((i) => i.id)).toContain(x);
    await markWithdrawnOnly(x);
    expect((await getThemeView(p, themeId))!.items.map((i) => i.id)).not.toContain(x);
  });
  it('a below-threshold theme shows its items but suppresses counts, caps confidence at low and warns about the small sample', async () => {
    const [t] = await db.insert(schema.themes).values({ title: 'Okapi reporting', summary: 'two items one org', createdBy: 'usr_owner' }).returning();
    await db.insert(schema.themeMembers).values(tB.map((sharedId) => ({ themeId: t.id, sharedId })));
    const v = await getThemeView(await as(USER.atMember), t.id);
    expect(v!.items).toHaveLength(2);
    expect(v!.stat.suppressed).toBe(true);
    expect(v!.stat.orgs).toBeNull();
    expect(v!.confidence.label).toBe('low');
    expect(v!.smallSample).toMatch(/Small sample/);
    expect(v!.trend!.text).toMatch(/No trend comparison/);
  });
  it('is invisible (null / 404) to anyone who cannot see the feed, and to everyone when no member is published', async () => {
    expect(await getThemeView(null, themeId)).toBeNull();
    expect(await getThemeView(await as(USER.employee), themeId)).toBeNull();
    expect(await listThemes(await as(USER.employee))).toBeNull();
    const [t] = await db.insert(schema.themes).values({ title: 'Ghost theme', summary: 'all withdrawn', createdBy: 'usr_owner' }).returning();
    const w = await makeShared({ org: 'org_th8', status: 'withdrawn' });
    await db.insert(schema.themeMembers).values({ themeId: t.id, sharedId: w });
    expect(await getThemeView(await as(USER.nwMember), t.id)).toBeNull();
    expect((await listThemes(await as(USER.nwMember)))!.map((x) => x.title)).not.toContain('Ghost theme');
  });
});

describe('confidence, periods and trends', () => {
  it('confidence rises with evidence quality, distinct orgs and sample size; capped low below the threshold', () => {
    expect(themeConfidence({ qualities: ['strong', 'strong', 'strong', 'strong'], orgs: 6, items: 8 }).label).toBe('high');
    expect(themeConfidence({ qualities: ['strong', 'strong'], orgs: 2, items: 9 }).label).toBe('low');
    expect(themeConfidence({ qualities: ['weak', 'unassessed'], orgs: 3, items: 3 }).label).toBe('low');
    expect(themeConfidence({ qualities: ['moderate', 'moderate', 'strong'], orgs: 3, items: 4 }).label).toBe('medium');
  });
  it('orders free-text periods', () => {
    const ps = ['Q3 2026', 'Q1 2026', 'Jan 2025', 'Q4 2025'].sort((a, b) => periodKey(a) - periodKey(b));
    expect(ps).toEqual(['Jan 2025', 'Q4 2025', 'Q1 2026', 'Q3 2026']);
  });
  it('trend-change summary compares periods only when each period meets the cohort threshold', async () => {
    const ids: string[] = [];
    for (const o of ['1', '2', '3']) ids.push(await makeShared({ org: `org_tr${o}`, period: 'Q1 2026' }));
    for (const o of ['1', '2', '3', '4']) ids.push(await makeShared({ org: `org_tr${o}`, period: 'Q2 2026' }));
    const t = await trendSummary(ids);
    expect(t.text).toMatch(/Q2 2026: 4 organisations .* versus 3 in Q1 2026/);
    expect(t.text).toMatch(/not how common/);
    ids.push(await makeShared({ org: 'org_tr9', period: 'Q3 2026' }));
    const t2 = await trendSummary(ids);
    expect(t2.text).not.toMatch(/Q3 2026/); // a single-organisation period is withheld
    expect(JSON.stringify(t2)).not.toMatch(/org_tr/);
  });
});

describe('rebuildThemes', () => {
  it('is product-owner only', async () => {
    await expect(rebuildThemes(await as(USER.employee))).rejects.toThrow('forbidden');
    await expect(rebuildThemes(await as(USER.moderator))).rejects.toThrow('forbidden');
    await expect(rebuildThemes(await as(USER.nwAdmin))).rejects.toThrow('forbidden');
  });
  it('creates generated themes from similar published items, leaves hand-made themes alone and is idempotent', async () => {
    const g = [await makeShared({ org: 'org_rb1', title: 'Capybara guarantor documentation gaps', summary: 'Capybara guarantor documentation is missing from loan files.', offering: 'rb', topic: 'capybara' }),
      await makeShared({ org: 'org_rb2', title: 'Capybara guarantor paperwork incomplete', summary: 'Capybara guarantor documentation incomplete in loan files.', offering: 'rb', topic: 'capybara' }),
      await makeShared({ org: 'org_rb3', title: 'Capybara guarantor documents absent', summary: 'Capybara guarantor documentation absent from loan files.', offering: 'rb', topic: 'capybara' })];
    const o = await as(USER.owner);
    const before = await db.select().from(schema.themeMembers).where(eq(schema.themeMembers.themeId, themeId));
    const r1 = await rebuildThemes(o);
    expect(r1.created).toBeGreaterThan(0);
    const members = await db.select().from(schema.themeMembers).where(inArray(schema.themeMembers.sharedId, g));
    const themeIds = [...new Set(members.map((m) => m.themeId))];
    expect(themeIds).toHaveLength(1);
    expect(themeIds[0]).toMatch(/^thm_auto_/);
    const [gen] = await db.select().from(schema.themes).where(eq(schema.themes.id, themeIds[0]));
    expect(gen.createdBy).toBe('system');
    expect(gen.caveat).toMatch(/text similarity/);
    expect(await db.select().from(schema.themeMembers).where(eq(schema.themeMembers.themeId, themeId))).toHaveLength(before.length);
    const r2 = await rebuildThemes(o);
    expect(r2).toEqual({ created: r1.created, removed: 0 });
    const aud = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'themes.rebuild'));
    expect(aud.some((a) => a.outcome === 'ok')).toBe(true);
    // a generated theme with no published evidence is removed by the next rebuild
    for (const id of g) await markWithdrawnOnly(id);
    const r3 = await rebuildThemes(o);
    expect(r3.removed).toBeGreaterThan(0);
    expect(await db.select().from(schema.themes).where(eq(schema.themes.id, themeIds[0]))).toHaveLength(0);
  });
});
