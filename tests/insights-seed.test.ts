import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { as, USER, ORG } from './helpers/principals';
import { db, schema } from '@/db';
import { getThemeView, listThemes } from '@/lib/insights/themes';
import { getIdeaForPrincipal, listIdeasForPrincipal } from '@/lib/insights/ideas';
import { plainLanguageProblem } from '@/lib/insights/plain';
import { searchShared } from '@/lib/insights/search';
import { askAira } from '@/lib/insights/aira';
import { withdrawShared } from '@/lib/learning';

const learningSeeded = async () => (await db.select({ id: schema.sharedContributions.id }).from(schema.sharedContributions).where(eq(schema.sharedContributions.id, 'shr_seed_season_nw'))).length > 0;

describe('insights seed (the brief\'s illustrative scenario)', () => {
  it('has the seasonality theme (3 orgs), the document theme (2 orgs, figures withheld) and leaves the single-org item unthemed', async () => {
    if (!(await learningSeeded())) return console.warn('learning seed not present: skipping');
    const p = await as(USER.hbMember);
    const season = await getThemeView(p, 'thm_seed_season');
    expect(season!.title).toBe('Seasonality context');
    expect(season!.items.map((i) => i.id).sort()).toEqual(['shr_seed_season_at', 'shr_seed_season_hb', 'shr_seed_season_nw']);
    expect(season!.stat).toMatchObject({ suppressed: false, orgs: 3 });
    expect(season!.disclaimer).toMatch(/Popularity is not market prevalence/);
    const docs = await getThemeView(await as(USER.atMember), 'thm_seed_docs');
    expect(docs!.items).toHaveLength(2);
    expect(docs!.stat.suppressed).toBe(true);
    expect(docs!.smallSample).toBeTruthy();
    const members = await db.select().from(schema.themeMembers);
    expect(members.some((m) => m.sharedId === 'shr_seed_report_at')).toBe(false);
  });
  it('has the Under review idea owned by the product owner, linked to the three seasonal items, with an honest update', async () => {
    if (!(await learningSeeded())) return;
    const nw = await as(USER.nwMember);
    const idea = await getIdeaForPrincipal(nw, 'ida_seed_season');
    expect(idea!.title).toBe('Financial Analysis Intelligence: add a seasonality-aware comparison explanation');
    expect(idea!.status).toBe('under_review');
    expect(idea!.latestUpdate).toBe('Under review. Not a promised delivery.');
    expect(idea!.evidence.map((e) => e.id).sort()).toEqual(['shr_seed_season_at', 'shr_seed_season_hb', 'shr_seed_season_nw']);
    expect(idea!.disclaimer).toMatch(/not a delivery promise/i);
    const owner = await getIdeaForPrincipal(await as(USER.owner), 'ida_seed_season');
    expect(owner!.internal!.ownerUserId).toBe(USER.owner);
    const statuses = (await listIdeasForPrincipal(nw)).map((i) => i.status);
    expect(statuses).toEqual(expect.arrayContaining(['under_review', 'planned', 'not_proceeding']));
  });
  it('every seeded client-facing update passes the audience-appropriate language gate', async () => {
    for (const u of await db.select().from(schema.ideaUpdates)) expect(await plainLanguageProblem(u.message), u.message).toBeNull();
    for (const i of await db.select().from(schema.ideas)) for (const t of [i.title, i.problem, i.proposedOutcome]) expect(await plainLanguageProblem(t), t).toBeNull();
  });
  it('seeds comments, votes, a saved search, bookmarks and a digest subscription', async () => {
    if (!(await learningSeeded())) return;
    expect((await db.select().from(schema.comments)).length).toBeGreaterThanOrEqual(3);
    expect((await db.select().from(schema.feedbackVotes)).length).toBeGreaterThanOrEqual(3);
    expect((await db.select().from(schema.savedSearches).where(eq(schema.savedSearches.userId, USER.nwMember))).length).toBe(1);
    expect((await db.select().from(schema.bookmarks).where(eq(schema.bookmarks.userId, USER.nwMember))).length).toBeGreaterThanOrEqual(2);
    expect((await db.select().from(schema.digestSubscriptions).where(eq(schema.digestSubscriptions.userId, USER.nwMember)))[0].frequency).toBe('weekly');
  });
  it('seeding twice changes nothing (idempotent)', async () => {
    const { seedInsights } = await import('@/db/seed/insights');
    const before = [(await db.select().from(schema.ideas)).length, (await db.select().from(schema.auditEvents)).length, (await db.select().from(schema.themeMembers)).length];
    await seedInsights(db);
    expect([(await db.select().from(schema.ideas)).length, (await db.select().from(schema.auditEvents)).length, (await db.select().from(schema.themeMembers)).length]).toEqual(before);
  });
});

describe('integration with the learning lifecycle: real withdrawal', () => {
  it('after the author withdraws a seeded shared item, search, AIRA, themes and ideas stop using it immediately', async () => {
    if (!(await learningSeeded())) return;
    const nw = await as(USER.nwMember);
    const q = 'seasonal SME cash flow normalised inconsistently analysts';
    expect((await searchShared(nw, { q }))!.ids).toContain('shr_seed_season_nw');
    const a1 = await askAira(nw, { question: q, scope: 'portal' });
    expect(a1.ok && a1.sources.map((s) => s.id)).toContain('shr_seed_season_nw');
    const res = await withdrawShared(await as(USER.nwMember, ORG.northwind), 'shr_seed_season_nw');
    expect(res.ok).toBe(true);
    expect((await searchShared(nw, { q }))!.ids).not.toContain('shr_seed_season_nw');
    const a2 = await askAira(nw, { question: q, scope: 'portal' });
    expect(a2.ok && a2.sources.map((s) => s.id)).not.toContain('shr_seed_season_nw');
    expect((await getThemeView(nw, 'thm_seed_season'))!.items.map((i) => i.id)).not.toContain('shr_seed_season_nw');
    expect((await getIdeaForPrincipal(nw, 'ida_seed_season'))!.evidence.map((e) => e.id)).not.toContain('shr_seed_season_nw');
    expect((await listThemes(nw))!.length).toBeGreaterThan(0);
  });
});
