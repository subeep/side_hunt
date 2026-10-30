import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/db';
import { CONTENT, EVENT } from '@/db/seed/public';
import { getBannersForPrincipal, getPublicBanners, getPublicContent, inWindow, listPublicContent } from '@/lib/public/content';
import { listPublicEvents } from '@/lib/public/events';
import { getPublicProduct, listPublicProducts, productLinks } from '@/lib/public/products';
import { safeHref } from '@/lib/public/links';
import { parseTranscript } from '@/lib/public/transcript';
import { MEDIA, ORG, USER, as, ensurePublicSeed } from './helpers/public';

const DAY = 86400_000;
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

beforeAll(ensurePublicSeed);

describe('banners: window + audience + status', () => {
  const now = new Date();
  it('anonymous visitors see only the published public banner inside its window', async () => {
    expect(ids(await getPublicBanners(now))).toEqual([CONTENT.bannerHackathon]);
  });
  it('draft, expired and employees-only banners never reach the public', async () => {
    const got = ids(await getPublicBanners(now));
    for (const id of [CONTENT.bannerDraft, CONTENT.bannerExpired, CONTENT.bannerEmployees]) expect(got).not.toContain(id);
  });
  it('windows are honoured in both directions (before start, after end, back when the old banner ran)', async () => {
    expect(ids(await getPublicBanners(new Date(now.getTime() - 5 * DAY)))).toEqual([]); // hackathon not started yet
    expect(ids(await getPublicBanners(new Date(now.getTime() - 20 * DAY)))).toEqual([CONTENT.bannerExpired]);
    expect(ids(await getPublicBanners(new Date(now.getTime() + 400 * DAY)))).toEqual([]); // everything has ended
  });
  it('inWindow treats null bounds as open and end as exclusive', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    expect(inWindow({ startsAt: null, endsAt: null }, t)).toBe(true);
    expect(inWindow({ startsAt: t, endsAt: null }, t)).toBe(true);
    expect(inWindow({ startsAt: null, endsAt: t }, t)).toBe(false);
  });
  it('the employees-only banner is visible to employees, not to clients or anonymous', async () => {
    expect(ids(await getBannersForPrincipal(await as(USER.employee), now))).toContain(CONTENT.bannerEmployees);
    expect(ids(await getBannersForPrincipal(await as(USER.nwMember), now))).not.toContain(CONTENT.bannerEmployees);
    expect(ids(await getBannersForPrincipal(null, now))).not.toContain(CONTENT.bannerEmployees);
  });
  it('NULL audience and other-tenant banners are hidden; own-org banner is visible only to that org', async () => {
    await db.insert(schema.contentItems).values([
      { id: 'cnt_t_ban_null', kind: 'banner', slug: 't-null', title: 'no audience', status: 'published', audienceKind: null },
      { id: 'cnt_t_ban_nw', kind: 'banner', slug: 't-nw', title: 'nw only', status: 'published', audienceKind: 'org', audienceOrgId: ORG.northwind },
    ]).onConflictDoNothing();
    for (const p of [null, await as(USER.employee), await as(USER.publisher), await as(USER.hbMember)]) {
      const got = ids(await getBannersForPrincipal(p, now));
      expect(got).not.toContain('cnt_t_ban_null');
      expect(got).not.toContain('cnt_t_ban_nw');
    }
    expect(ids(await getBannersForPrincipal(await as(USER.nwMember), now))).toContain('cnt_t_ban_nw');
    expect(ids(await getBannersForPrincipal(await as(USER.multi), now))).not.toContain('cnt_t_ban_nw'); // no ACTIVE workspace
    expect(ids(await getBannersForPrincipal(await as(USER.multi, ORG.northwind), now))).toContain('cnt_t_ban_nw');
  });
  it('banner CTA links are sanitised at read time (javascript:, data:, protocol-relative dropped)', async () => {
    expect(safeHref('/hackathon/register')).toBe('/hackathon/register');
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    for (const bad of ['javascript:alert(1)', '//evil.example', 'data:text/html,x', 'http://plain.example', ' ', 5, null]) expect(safeHref(bad)).toBeNull();
    await db.insert(schema.contentItems).values({ id: 'cnt_t_ban_xss', kind: 'banner', slug: 't-xss', title: 'x', status: 'published', audienceKind: 'public', meta: { ctaLabel: 'Go', ctaHref: 'javascript:alert(1)' } }).onConflictDoNothing();
    const b = (await getPublicBanners(now)).find((x) => x.id === 'cnt_t_ban_xss')!;
    expect(b.ctaHref).toBeNull();
    expect(b.ctaLabel).toBeNull();
  });
});

describe('public perspectives / lab', () => {
  it('lists only published + explicitly public items of the right kind', async () => {
    const persp = await listPublicContent('perspective');
    const lab = await listPublicContent('lab');
    expect(persp.length).toBeGreaterThanOrEqual(3);
    expect(lab.length).toBeGreaterThanOrEqual(2);
    expect(ids(persp)).not.toContain(CONTENT.perspInternal);
    expect(ids(lab)).not.toContain(CONTENT.perspInternal);
    expect(persp.every((i) => !('authorId' in i))).toBe(true);
  });
  it('the employees-only item is a 404 by direct slug for the public site', async () => {
    expect(await getPublicContent('perspective', 'internal-roadmap-thinking')).toBeNull();
    expect(await getPublicContent('perspective', 'ai-needs-evidence-not-just-answers')).not.toBeNull();
    expect(await getPublicContent('lab', 'ai-needs-evidence-not-just-answers')).toBeNull(); // wrong kind
  });
  it('draft, archived and NULL-audience items are never public; hostile slugs are rejected', async () => {
    await db.insert(schema.contentItems).values([
      { id: 'cnt_t_p_draft', kind: 'perspective', slug: 't-draft', title: 'd', status: 'draft', audienceKind: 'public' },
      { id: 'cnt_t_p_arch', kind: 'perspective', slug: 't-arch', title: 'a', status: 'archived', audienceKind: 'public' },
      { id: 'cnt_t_p_null', kind: 'perspective', slug: 't-nullaud', title: 'n', status: 'published', audienceKind: null },
    ]).onConflictDoNothing();
    const got = ids(await listPublicContent('perspective'));
    for (const id of ['cnt_t_p_draft', 'cnt_t_p_arch', 'cnt_t_p_null']) expect(got).not.toContain(id);
    for (const s of ['t-draft', 't-arch', 't-nullaud', "x'--", '../a', '']) expect(await getPublicContent('perspective', s)).toBeNull();
  });
});

describe('/live public events', () => {
  it('lists the public upcoming webinar and the past one with its (public) recording', async () => {
    const { upcoming, past } = await listPublicEvents();
    expect(ids(upcoming)).toContain(EVENT.webinar);
    const recap = past.find((e) => e.id === EVENT.recap)!;
    expect(recap.recordingId).toBe(MEDIA.pubRiva);
  });
  it('non-public and cancelled events are never listed; recordings that are not anonymously viewable are not linked', async () => {
    const soon = new Date(Date.now() + DAY);
    await db.insert(schema.events).values([
      { id: 'evt_t_emp', title: 'internal', kind: 'live', startsAt: soon, audienceKind: 'employees' },
      { id: 'evt_t_null', title: 'no audience', kind: 'live', startsAt: soon, audienceKind: null },
      { id: 'evt_t_org', title: 'org', kind: 'briefing', startsAt: soon, audienceKind: 'org', audienceOrgId: ORG.northwind },
      { id: 'evt_t_cancel', title: 'cancelled', kind: 'webinar', startsAt: soon, status: 'cancelled', audienceKind: 'public' },
      { id: 'evt_t_leak1', title: 'leaky recording A', kind: 'webinar', startsAt: new Date(Date.now() - 3 * DAY), status: 'ended', audienceKind: 'public', recordingMediaId: MEDIA.empRecording },
      { id: 'evt_t_leak2', title: 'leaky recording B', kind: 'webinar', startsAt: new Date(Date.now() - 3 * DAY), status: 'ended', audienceKind: 'public', recordingMediaId: MEDIA.draftPublic },
      { id: 'evt_t_leak3', title: 'leaky recording C', kind: 'webinar', startsAt: new Date(Date.now() - 3 * DAY), status: 'ended', audienceKind: 'public', recordingMediaId: MEDIA.noAudience },
    ]).onConflictDoNothing();
    const { upcoming, past } = await listPublicEvents();
    const all = ids([...upcoming, ...past]);
    for (const id of ['evt_t_emp', 'evt_t_null', 'evt_t_org', 'evt_t_cancel']) expect(all).not.toContain(id);
    for (const id of ['evt_t_leak1', 'evt_t_leak2', 'evt_t_leak3']) expect(past.find((e) => e.id === id)!.recordingId).toBeNull();
  });
});

describe('products', () => {
  it('lists the four seeded products with public fields only', async () => {
    const ps = await listPublicProducts();
    expect(ps.map((p) => p.slug)).toEqual(['credit-strategy-simulator', 'sme-credit-decisioning', 'similar-portfolio-intelligence', 'riva']);
    for (const p of ps) expect(Object.keys(p).sort()).toEqual(['capabilities', 'category', 'name', 'slug', 'summary', 'tagline', 'workflow']);
    expect(JSON.stringify(ps)).not.toMatch(/sandboxScenario|policy-what-if|report-validation/);
  });
  it('unknown or malformed slugs are null', async () => {
    for (const s of ['nope', '../x', '', "riva' or 1=1"]) expect(await getPublicProduct(s)).toBeNull();
  });
  it('sandbox link only for the ACTIVE workspace entitlement; playground only for employees', async () => {
    expect(productLinks(null, 'riva')).toMatchObject({ sandbox: false, playground: false });
    expect(productLinks(await as(USER.hbMember), 'riva').sandbox).toBe(true);
    expect(productLinks(await as(USER.hbMember), 'credit-strategy-simulator').sandbox).toBe(false);
    expect(productLinks(await as(USER.nwMember), 'riva').sandbox).toBe(false);
    expect(productLinks(await as(USER.multi), 'riva')).toMatchObject({ sandbox: false, needsWorkspace: true });
    expect(productLinks(await as(USER.multi, ORG.harbor), 'riva').sandbox).toBe(true);
    expect(productLinks(await as(USER.employee), 'riva')).toMatchObject({ playground: true, sandbox: false });
  });
});

describe('transcript parsing', () => {
  it('parses mm:ss lines and ignores junk', () => {
    expect(parseTranscript('00:05 Hello\nnonsense\n01:10 World')).toEqual([{ t: 5, text: 'Hello' }, { t: 70, text: 'World' }]);
    expect(parseTranscript(null)).toEqual([]);
  });
});
