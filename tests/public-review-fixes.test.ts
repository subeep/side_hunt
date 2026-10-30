import { beforeAll, describe, expect, it } from 'vitest';
import { getBannersForPrincipal, getContentForPrincipal, getPublicContent, listContentForPrincipal } from '@/lib/public/content';
import { saveBanner, saveContent, setContentStatus } from '@/lib/public/publisher';
import { USER, as, ensurePublicSeed } from './helpers/public';
import type { Principal } from '@/lib/auth/principal';

let pub: Principal, emp: Principal, client: Principal;
beforeAll(async () => {
  await ensurePublicSeed();
  pub = await as(USER.publisher);
  emp = await as(USER.employee);
  client = await as(USER.nwMember);
});
const mk = async (raw: Record<string, unknown>) => {
  const r = await saveContent(pub, { body: 'A body that is long enough to pass validation.', tags: '', ...raw });
  expect(r.ok).toBe(true);
  const id = (r as { id: string }).id;
  await setContentStatus(pub, 'content', id, 'published');
  return id;
};

describe('published content is reachable (pages, employees-only perspectives/lab)', () => {
  it('a published public Page is readable by anyone; AIRA-style public reader sees it too', async () => {
    await mk({ kind: 'page', slug: 'rv-public-page', title: 'Public page', audience: 'public' });
    expect((await getContentForPrincipal(null, 'page', 'rv-public-page'))?.title).toBe('Public page');
    expect(await getPublicContent('page', 'rv-public-page')).not.toBeNull();
  });
  it('employees-only perspective/lab/page: readable by employees, never by anonymous or clients, and not by the public reader', async () => {
    for (const [kind, slug] of [['perspective', 'rv-emp-persp'], ['lab', 'rv-emp-lab'], ['page', 'rv-emp-page']] as const) {
      await mk({ kind, slug, title: `Emp ${kind}`, audience: 'employees' });
      expect((await getContentForPrincipal(emp, kind, slug))?.audienceKind).toBe('employees');
      expect((await listContentForPrincipal(emp, kind)).map((i) => i.slug)).toContain(slug);
      for (const p of [null, client]) {
        expect(await getContentForPrincipal(p, kind, slug)).toBeNull();
        expect((await listContentForPrincipal(p, kind)).map((i) => i.slug)).not.toContain(slug);
      }
      expect(await getPublicContent(kind, slug)).toBeNull();
    }
  });
});

describe('home banners', () => {
  it('a second, unscheduled public banner is returned alongside the hackathon banner and does not outrank scheduled ones', async () => {
    const r = await saveBanner(pub, { title: 'Webinar announcement', audience: 'public' });
    const id = (r as { id: string }).id;
    await setContentStatus(pub, 'banner', id, 'published');
    const list = await getBannersForPrincipal(null);
    expect(list.map((b) => b.id)).toContain(id);
    expect(list.filter((b) => b.audienceKind === 'public').length).toBeGreaterThanOrEqual(2);
    expect(list.findIndex((b) => b.ctaHref === '/hackathon/register')).toBeLessThan(list.findIndex((b) => b.id === id));
  });
});
