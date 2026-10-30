import { beforeAll, describe, expect, it } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { CONTENT } from '@/db/seed/public';
import { getBannersForPrincipal, getPublicContent, getPublicBanners } from '@/lib/public/content';
import { getMediaForPrincipal } from '@/lib/public/media';
import {
  audienceOptions, listBannersForManage, listContentForManage, listMediaForManage, publisherTabsFor,
  saveBanner, saveContent, setContentStatus, setMediaAudience, setMediaStatus,
} from '@/lib/public/publisher';
import { MEDIA, ORG, USER, as, employeeWith, ensurePublicSeed } from './helpers/public';
import type { Principal } from '@/lib/auth/principal';

const banner = (o: Record<string, unknown> = {}) => ({ title: 'Spring hackathon', summary: 'Join us.', eyebrow: 'Hackathon', ctaLabel: 'Register', ctaHref: '/hackathon/register', audience: 'public', ...o });
const article = (o: Record<string, unknown> = {}) => ({ kind: 'perspective', slug: 'test-article', title: 'Test article', body: 'A body that is long enough to pass validation.', tags: 'a, b', audience: 'public', ...o });
const auditCount = async (action: string, outcome?: 'ok' | 'deny') =>
  (await db.select({ n: count() }).from(schema.auditEvents).where(outcome ? and(eq(schema.auditEvents.action, action), eq(schema.auditEvents.outcome, outcome)) : eq(schema.auditEvents.action, action)))[0].n;

let contentOnly: Principal, videoOnly: Principal, both: Principal, plain: Principal;
beforeAll(async () => {
  await ensurePublicSeed();
  contentOnly = await employeeWith('usr_t_content', ['content_publisher']);
  videoOnly = await employeeWith('usr_t_video', ['video_publisher']);
  both = await as(USER.publisher);
  plain = await as(USER.employee);
  await db.insert(schema.media).values([
    { id: 'med_t_a', title: 'Fixture A', kind: 'video', mime: 'image/svg+xml', data: '<svg xmlns="http://www.w3.org/2000/svg"/>', status: 'draft', audienceKind: 'employees' },
    { id: 'med_t_b', title: 'Fixture B', kind: 'video', mime: 'image/svg+xml', data: '<svg xmlns="http://www.w3.org/2000/svg"/>', status: 'published', audienceKind: 'public' },
    { id: 'med_t_org', title: 'Fixture org target', kind: 'video', mime: 'image/svg+xml', data: '<svg xmlns="http://www.w3.org/2000/svg"/>', status: 'published', audienceKind: 'employees' },
    { id: 'med_t_c', title: 'Fixture C (no audience)', kind: 'video', mime: 'image/svg+xml', data: '<svg xmlns="http://www.w3.org/2000/svg"/>', status: 'draft', audienceKind: null },
  ]).onConflictDoNothing();
  await db.insert(schema.contentItems).values([
    { id: 'cnt_t_resource', kind: 'resource', slug: 't-resource', title: 'Northwind resource', status: 'published', audienceKind: 'org', audienceOrgId: ORG.northwind },
    { id: 'cnt_t_persp_org', kind: 'perspective', slug: 't-persp-org', title: 'org perspective', status: 'draft', audienceKind: 'org', audienceOrgId: ORG.northwind },
  ]).onConflictDoNothing();
});

describe('grant separation (content_publisher and video_publisher are different grants)', () => {
  it('tabs follow grants', async () => {
    expect(publisherTabsFor(contentOnly).map((t) => t.href)).toEqual(['/publisher/banners', '/publisher/content']);
    expect(publisherTabsFor(videoOnly).map((t) => t.href)).toEqual(['/publisher/media']);
    expect(publisherTabsFor(both).length).toBe(3);
    expect(publisherTabsFor(plain)).toEqual([]);
    expect(publisherTabsFor(null)).toEqual([]);
  });
  it('content publisher cannot touch media audiences/status or list media', async () => {
    const before = await auditCount('authz.deny', 'deny');
    expect(await setMediaAudience(contentOnly, { id: 'med_t_a', kind: 'public', confirmPublic: true })).toMatchObject({ ok: false, denied: true });
    expect(await setMediaStatus(contentOnly, 'med_t_a', 'published')).toMatchObject({ ok: false, denied: true });
    expect(await listMediaForManage(contentOnly)).toEqual([]);
    expect(await audienceOptions(contentOnly)).toEqual({ orgs: [], products: [] });
    expect(await auditCount('authz.deny', 'deny')).toBe(before + 2);
    const [a] = await db.select().from(schema.media).where(eq(schema.media.id, 'med_t_a'));
    expect(a.audienceKind).toBe('employees');
    expect(a.status).toBe('draft');
  });
  it('video publisher cannot touch banners or public content', async () => {
    expect(await saveBanner(videoOnly, banner())).toMatchObject({ ok: false, denied: true });
    expect(await saveContent(videoOnly, article())).toMatchObject({ ok: false, denied: true });
    expect(await setContentStatus(videoOnly, 'banner', CONTENT.bannerDraft, 'published')).toMatchObject({ ok: false, denied: true });
    expect(await listBannersForManage(videoOnly)).toEqual([]);
    expect(await listContentForManage(videoOnly)).toEqual([]);
    const [d] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, CONTENT.bannerDraft));
    expect(d.status).toBe('draft');
  });
  it('plain employee, portal admin, moderator, client admin, anonymous: denied everywhere', async () => {
    for (const p of [plain, await as(USER.admin), await as(USER.moderator), await as(USER.owner), await as(USER.nwAdmin), await as(USER.nwMember), null]) {
      expect((await saveBanner(p, banner())).ok).toBe(false);
      expect((await saveContent(p, article({ slug: 'denied-article' }))).ok).toBe(false);
      expect((await setContentStatus(p, 'banner', CONTENT.bannerDraft, 'published')).ok).toBe(false);
      expect((await setMediaAudience(p, { id: 'med_t_a', kind: 'public', confirmPublic: true })).ok).toBe(false);
      expect((await setMediaStatus(p, 'med_t_a', 'published')).ok).toBe(false);
    }
    expect(await getPublicContent('perspective', 'denied-article')).toBeNull();
  });
  it('a client-side forged grant is meaningless: a client user cannot become a publisher via any input', async () => {
    const p = await as(USER.nwAdmin);
    expect(p.grants.size).toBe(0);
    expect((await saveBanner(p, { ...banner(), grants: ['content_publisher'], isEmployee: true })).ok).toBe(false);
  });
});

describe('banner lifecycle (content_publisher)', () => {
  let id = '';
  it('creates as draft: invisible to the public until published', async () => {
    const r = await saveBanner(contentOnly, banner({ startsAt: '2020-01-01T00:00', endsAt: '2099-01-01T00:00' }));
    expect(r.ok).toBe(true);
    id = (r as { id: string }).id;
    expect((await getPublicBanners()).map((b) => b.id)).not.toContain(id);
    expect(await auditCount('banner.create', 'ok')).toBeGreaterThan(0);
  });
  it('publish -> visible inside the window; unpublish/archive -> hidden; invalid transitions rejected; all audited', async () => {
    expect(await setContentStatus(contentOnly, 'banner', id, 'published')).toMatchObject({ ok: true });
    expect((await getPublicBanners()).map((b) => b.id)).toContain(id);
    expect(await setContentStatus(contentOnly, 'banner', id, 'archived')).toMatchObject({ ok: true });
    expect((await getPublicBanners()).map((b) => b.id)).not.toContain(id);
    expect((await setContentStatus(contentOnly, 'banner', id, 'published')).ok).toBe(false); // archived -> published not allowed
    expect(await setContentStatus(contentOnly, 'banner', id, 'draft')).toMatchObject({ ok: true });
    expect((await setContentStatus(contentOnly, 'banner', id, 'nonsense')).ok).toBe(false);
    for (const a of ['banner.publish', 'banner.archive', 'banner.unpublish']) expect(await auditCount(a, 'ok'), a).toBeGreaterThan(0);
  });
  it('scheduling in the future keeps it hidden even when published', async () => {
    const r = await saveBanner(contentOnly, banner({ title: 'Future banner', startsAt: '2090-01-01T00:00', endsAt: '2091-01-01T00:00' }));
    const fid = (r as { id: string }).id;
    await setContentStatus(contentOnly, 'banner', fid, 'published');
    expect((await getPublicBanners()).map((b) => b.id)).not.toContain(fid);
    expect((await getPublicBanners(new Date('2090-06-01T00:00:00Z'))).map((b) => b.id)).toContain(fid);
  });
  it('editing keeps the row and records the audience change; an employees-only banner never reaches the public', async () => {
    const r = await saveBanner(contentOnly, { ...banner({ title: 'Staff only' }), audience: 'employees' });
    const eid = (r as { id: string }).id;
    await setContentStatus(contentOnly, 'banner', eid, 'published');
    expect((await getPublicBanners()).map((b) => b.id)).not.toContain(eid);
    expect((await getBannersForPrincipal(plain)).map((b) => b.id)).toContain(eid);
    expect((await saveBanner(contentOnly, { ...banner({ title: 'Staff only v2' }), id: eid, audience: 'employees' })).ok).toBe(true);
    const [row] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, eid));
    expect(row.title).toBe('Staff only v2');
    expect(row.authorId).toBe('usr_t_content');
  });
  it('validation: javascript: links, half a button, bad windows, bad audience, blank title, huge fields', async () => {
    const bad = [
      banner({ ctaHref: 'javascript:alert(1)' }), banner({ ctaHref: '//evil.example' }), banner({ ctaLabel: '' }), banner({ ctaHref: '' }),
      banner({ startsAt: '2030-01-02T00:00', endsAt: '2030-01-01T00:00' }), banner({ audience: 'org' }), banner({ audience: 'community' }),
      banner({ title: ' ' }), banner({ summary: 'x'.repeat(301) }), banner({ startsAt: 'not a date' }),
    ];
    for (const b of bad) {
      const r = await saveBanner(contentOnly, b);
      expect(r.ok, JSON.stringify(b)).toBe(false);
      if (!r.ok) expect(r.denied).toBeUndefined();
    }
  });
  it('cannot edit or status-change content that is not a banner (client resource, other tenants)', async () => {
    expect((await saveBanner(contentOnly, { ...banner(), id: 'cnt_t_resource' })).ok).toBe(false);
    expect((await setContentStatus(contentOnly, 'banner', 'cnt_t_resource', 'archived')).ok).toBe(false);
    expect((await setContentStatus(contentOnly, 'banner', CONTENT.perspInternal, 'archived')).ok).toBe(false); // wrong group
    const [r] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, 'cnt_t_resource'));
    expect(r.status).toBe('published');
  });
});

describe('public content (content_publisher)', () => {
  it('perspective: create, publish, appears publicly; unpublish hides it; slug unique per kind; kind immutable', async () => {
    const r = await saveContent(contentOnly, article());
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    expect(await getPublicContent('perspective', 'test-article')).toBeNull(); // draft
    await setContentStatus(contentOnly, 'content', id, 'published');
    expect((await getPublicContent('perspective', 'test-article'))?.tags).toEqual(['a', 'b']);
    expect((await saveContent(contentOnly, article({ title: 'Dupe' }))).ok).toBe(false); // same kind+slug
    expect((await saveContent(contentOnly, article({ kind: 'lab', title: 'Same slug, other kind' }))).ok).toBe(true);
    expect((await saveContent(contentOnly, { ...article({ kind: 'lab', title: 'Try to retype' }), id })).ok).toBe(true);
    const [row] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id));
    expect(row.kind).toBe('perspective');
    await setContentStatus(contentOnly, 'content', id, 'draft');
    expect(await getPublicContent('perspective', 'test-article')).toBeNull();
  });
  it('body is stored as plain text (no HTML interpretation) and validation bites', async () => {
    const r = await saveContent(contentOnly, article({ slug: 'xss-attempt', body: '<script>alert(1)</script> plus enough text to pass the minimum.' }));
    expect(r.ok).toBe(true); // stored verbatim; the Prose component renders text only
    for (const b of [article({ slug: 'Bad Slug' }), article({ slug: '../x' }), article({ body: 'short' }), article({ title: 'x' }), article({ tags: 'a,b,c,d,e,f,g' }), article({ kind: 'resource' }), article({ audience: 'org' })]) {
      expect((await saveContent(contentOnly, b)).ok, JSON.stringify(b)).toBe(false);
    }
  });
  it('cannot reach client-audience or non-content kinds (resource, org-audience perspective)', async () => {
    expect((await saveContent(contentOnly, { ...article({ slug: 'hijack' }), id: 'cnt_t_resource' })).ok).toBe(false);
    expect((await saveContent(contentOnly, { ...article({ slug: 'hijack2' }), id: 'cnt_t_persp_org' })).ok).toBe(false);
    expect((await setContentStatus(contentOnly, 'content', 'cnt_t_persp_org', 'published')).ok).toBe(false);
    const listed = (await listContentForManage(contentOnly)).map((c) => c.id);
    expect(listed).not.toContain('cnt_t_resource');
    expect(listed).not.toContain('cnt_t_persp_org');
  });
  it('widening employees -> public is a deliberate, audited edit', async () => {
    const before = await auditCount('content.update', 'ok');
    const r = await saveContent(contentOnly, { ...article({ slug: 'internal-roadmap-thinking', title: 'Internal: roadmap thinking (employees only)', audience: 'public' }), id: CONTENT.perspInternal });
    expect(r.ok).toBe(true);
    const [a] = (await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.resourceId, CONTENT.perspInternal))).slice(-1);
    expect(a.meta).toMatchObject({ audience: { from: 'employees', to: 'public' } });
    expect(await auditCount('content.update', 'ok')).toBe(before + 1);
    // put it back so other assertions (and the seeded fixture) stay truthful
    await saveContent(contentOnly, { ...article({ slug: 'internal-roadmap-thinking', title: 'Internal: roadmap thinking (employees only)', audience: 'employees' }), id: CONTENT.perspInternal });
    expect(await getPublicContent('perspective', 'internal-roadmap-thinking')).toBeNull();
  });
});

describe('media audiences (video_publisher)', () => {
  it('org audience: validated against real active CLIENT orgs only (not internal, not unknown)', async () => {
    for (const orgId of ['org_azentio', 'org_nope', '', undefined]) expect((await setMediaAudience(videoOnly, { id: 'med_t_org', kind: 'org', orgId })).ok, String(orgId)).toBe(false);
    expect((await setMediaAudience(videoOnly, { id: 'med_t_org', kind: 'org', orgId: ORG.atlas })).ok).toBe(true);
    expect(await getMediaForPrincipal('med_t_org', await as(USER.atMember))).not.toBeNull();
    expect(await getMediaForPrincipal('med_t_org', await as(USER.nwMember))).toBeNull(); // other tenant
    expect(await getMediaForPrincipal('med_t_org', await as(USER.employee))).toBeNull(); // employees get no implicit tenant access
    expect(await getMediaForPrincipal('med_t_org', null)).toBeNull();
    // once tenant-private, the publisher can neither see nor change it (not found), so it cannot be re-pointed to read it
    expect((await listMediaForManage(videoOnly)).find((x) => x.id === 'med_t_org')).toBeUndefined();
    expect((await setMediaAudience(videoOnly, { id: 'med_t_org', kind: 'employees' })).ok).toBe(false);
    expect((await setMediaStatus(videoOnly, 'med_t_org', 'draft')).ok).toBe(false);
    expect(await getMediaForPrincipal('med_t_org', videoOnly)).toBeNull();
  });
  it('product audience: validated product; entitlement decides', async () => {
    expect((await setMediaAudience(videoOnly, { id: 'med_t_a', kind: 'product', product: 'nope' })).ok).toBe(false);
    expect((await setMediaAudience(videoOnly, { id: 'med_t_a', kind: 'product' })).ok).toBe(false);
    expect((await setMediaAudience(videoOnly, { id: 'med_t_a', kind: 'product', product: 'riva' })).ok).toBe(true);
    expect((await setMediaStatus(videoOnly, 'med_t_a', 'published')).ok).toBe(true);
    const [row] = await db.select().from(schema.media).where(eq(schema.media.id, 'med_t_a'));
    expect(row).toMatchObject({ audienceKind: 'product', audienceProduct: 'riva', audienceOrgId: null }); // stale org cleared
    expect(await getMediaForPrincipal('med_t_a', await as(USER.hbMember))).not.toBeNull();
    expect(await getMediaForPrincipal('med_t_a', await as(USER.atMember))).toBeNull();
  });
  it('only the four audience kinds are settable (never community / unknown)', async () => {
    for (const kind of ['community', 'private', '', 'PUBLIC', undefined]) expect((await setMediaAudience(videoOnly, { id: 'med_t_a', kind })).ok, String(kind)).toBe(false);
  });
  it('widening to public needs an explicit confirmation, and the change is audited with before/after', async () => {
    expect((await setMediaAudience(videoOnly, { id: 'med_t_a', kind: 'public' })).ok).toBe(false);
    expect((await setMediaAudience(videoOnly, { id: 'med_t_a', kind: 'public', confirmPublic: true })).ok).toBe(true);
    expect(await getMediaForPrincipal('med_t_a', null)).not.toBeNull(); // published earlier
    const rows = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.action, 'media.audience'), eq(schema.auditEvents.resourceId, 'med_t_a')));
    const last = rows[rows.length - 1];
    expect(last.actorId).toBe('usr_t_video');
    expect(last.meta).toMatchObject({ from: { kind: 'product' }, to: { kind: 'public' } });
  });
  it('narrowing / unpublishing takes effect immediately for the next request', async () => {
    expect((await setMediaStatus(videoOnly, 'med_t_b', 'draft')).ok).toBe(true);
    expect(await getMediaForPrincipal('med_t_b', null)).toBeNull();
    expect(await getMediaForPrincipal('med_t_b', videoOnly)).not.toBeNull(); // publisher can still preview the draft
    expect((await setMediaStatus(videoOnly, 'med_t_b', 'published')).ok).toBe(true);
    expect(await getMediaForPrincipal('med_t_b', null)).not.toBeNull();
    expect((await setMediaAudience(videoOnly, { id: 'med_t_b', kind: 'employees' })).ok).toBe(true);
    expect(await getMediaForPrincipal('med_t_b', null)).toBeNull();
    expect(await auditCount('media.unpublish', 'ok')).toBeGreaterThan(0);
  });
  it('media with NULL audience cannot be published until an audience is set, then it works', async () => {
    expect((await setMediaStatus(videoOnly, 'med_t_c', 'published')).ok).toBe(false);
    expect(await getMediaForPrincipal('med_t_c', videoOnly)).toBeNull();
    expect((await setMediaAudience(videoOnly, { id: 'med_t_c', kind: 'employees' })).ok).toBe(true);
    expect((await setMediaStatus(videoOnly, 'med_t_c', 'published')).ok).toBe(true);
    expect(await getMediaForPrincipal('med_t_c', plain)).not.toBeNull();
  });
  it('unknown media ids and malformed input fail cleanly', async () => {
    expect((await setMediaAudience(videoOnly, { id: 'med_missing', kind: 'public', confirmPublic: true })).ok).toBe(false);
    expect((await setMediaAudience(videoOnly, { id: "x'; --", kind: 'public' })).ok).toBe(false);
    expect((await setMediaStatus(videoOnly, 'med_missing', 'published')).ok).toBe(false);
    expect((await setMediaStatus(videoOnly, 'med_t_a', 'archived')).ok).toBe(false);
  });
  it('the audience tab lists metadata only (no payload, transcript or poster) and selectors expose client org + product names only', async () => {
    const rows = await listMediaForManage(videoOnly);
    expect(rows.length).toBeGreaterThanOrEqual(9);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(['audienceKind', 'audienceOrgId', 'audienceProduct', 'durationSec', 'id', 'kind', 'productSlug', 'status', 'title']);
    const o = await audienceOptions(videoOnly);
    expect(o.orgs.map((x) => x.id).sort()).toEqual([ORG.atlas, ORG.harbor, ORG.northwind].sort());
    expect(Object.keys(o.orgs[0]).sort()).toEqual(['id', 'name']);
  });
});

describe('publishers cannot reach identities, roles or private records (escalation)', () => {
  it('a full session of publisher operations leaves memberships, grants, users, allowlist and entitlements untouched', async () => {
    const snap = async () => JSON.stringify(await Promise.all([schema.memberships, schema.grants, schema.users, schema.employeeAllowlist, schema.entitlements, schema.orgSettings].map((t) => db.select().from(t))));
    const before = await snap();
    await saveBanner(both, banner({ title: 'Escalation probe' }));
    await saveContent(both, article({ slug: 'escalation-probe', audience: 'public' }));
    await setMediaAudience(both, { id: 'med_t_b', kind: 'org', orgId: ORG.harbor, grants: 'portal_admin', userId: USER.publisher, role: 'portal_admin' });
    await setMediaStatus(both, 'med_t_b', 'draft');
    expect(await snap()).toBe(before);
  });
  it('the publisher module imports no identity-admin or learning-record surface', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/lib/public/publisher.ts', 'utf8');
    for (const t of ['memberships', 'grants', 'employeeAllowlist', 'invitations', 'sessions', 'sharedContributions', 'contributions', 'searchIndex']) expect(src, t).not.toMatch(new RegExp(`schema\\.${t}\\b`));
  });
});
