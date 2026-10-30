// Smoke render of the insights pages as server components (auth mocked), to catch runtime errors that tsc cannot.
import type { ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@/lib/auth/principal';
import { as, USER } from './helpers/principals';

let current: Principal | null = null;
class Redirect extends Error { constructor(public to: string) { super(`redirect:${to}`); } }
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND'); },
  forbidden: () => { throw new Error('FORBIDDEN'); },
  redirect: (to: string) => { throw new Redirect(to); },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/auth/session', () => ({ getPrincipal: async () => current }));
vi.mock('@/components/learning/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/lib/authz/guards', () => ({
  requireUser: async () => { if (!current) throw new Redirect('/login'); return current; },
  requireGrant: async (g: string) => { if (!current?.isEmployee || !current.grants.has(g as never)) throw new Error('FORBIDDEN'); return current; },
}));

async function html(el: ReactElement) {
  const stream = await renderToReadableStream(el, { onError: (e) => { throw e; } });
  await stream.allReady;
  return new Response(stream).text();
}
const PAGES: Record<string, () => Promise<{ default: unknown }>> = {
  'learn': () => import('@/app/learn/page'),
  'learn/themes': () => import('@/app/learn/themes/page'),
  'learn/themes/[id]': () => import('@/app/learn/themes/[id]/page'),
  'learn/ideas': () => import('@/app/learn/ideas/page'),
  'learn/ideas/[id]': () => import('@/app/learn/ideas/[id]/page'),
  'learn/feed/[id]': () => import('@/app/learn/feed/[id]/page'),
  'learn/aira': () => import('@/app/learn/aira/page'),
  'learn/saved': () => import('@/app/learn/saved/page'),
  'learn/bookmarks': () => import('@/app/learn/bookmarks/page'),
  'learn/digest': () => import('@/app/learn/digest/page'),
  'product': () => import('@/app/product/page'),
  'product/ideas/new': () => import('@/app/product/ideas/new/page'),
  'product/ideas/[id]': () => import('@/app/product/ideas/[id]/page'),
  'product/themes': () => import('@/app/product/themes/page'),
};
const page = async (path: string, props: Record<string, unknown> = {}) => {
  const mod = await PAGES[path]();
  return html(await (mod.default as (p: unknown) => Promise<ReactElement>)({ params: Promise.resolve({}), searchParams: Promise.resolve({}), ...props }));
};

let ids: { shared: string; theme: string; idea: string };
beforeAll(async () => {
  ids = { shared: 'shr_seed_season_hb', theme: 'thm_seed_season', idea: 'ida_seed_season' };
});

describe('page smoke renders', () => {
  it('feed, themes, ideas, aira, saved, bookmarks, digest render for a community member', async () => {
    current = await as(USER.nwMember);
    expect(await page('learn')).toMatch(/Shared learning from the community|Cross-client shared feed/);
    expect(await page('learn', { searchParams: Promise.resolve({ q: 'seasonal cash', offering: 'sme-credit-decisioning' }) })).toMatch(/Save this search/);
    expect(await page('learn/themes')).toMatch(/Seasonality context/);
    expect(await page('learn/themes/[id]', { params: Promise.resolve({ id: ids.theme }) })).toMatch(/Popularity is not market prevalence/);
    expect(await page('learn/ideas')).toMatch(/Not a promised delivery|Under review/);
    expect(await page('learn/ideas/[id]', { params: Promise.resolve({ id: ids.idea }) })).toMatch(/not a delivery promise/i);
    expect(await page('learn/feed/[id]', { params: Promise.resolve({ id: ids.shared }) })).toMatch(/Discussion/);
    expect(await page('learn/aira')).toMatch(/never retrains or changes any model/);
    expect(await page('learn/saved')).toMatch(/Seasonal SME cash flow/);
    expect(await page('learn/bookmarks')).toMatch(/Bookmarks/);
    expect(await page('learn/digest')).toMatch(/stored, not sent|Learning digest/);
  });
  it('detail pages 404 for unknown ids and deny non-community principals', async () => {
    current = await as(USER.nwMember);
    await expect(page('learn/feed/[id]', { params: Promise.resolve({ id: 'shr_nope' }) })).rejects.toThrow('NOT_FOUND');
    await expect(page('learn/themes/[id]', { params: Promise.resolve({ id: 'thm_nope' }) })).rejects.toThrow('NOT_FOUND');
    await expect(page('learn/ideas/[id]', { params: Promise.resolve({ id: 'ida_nope' }) })).rejects.toThrow('NOT_FOUND');
    current = await as(USER.employee);
    await expect(page('learn')).rejects.toThrow('FORBIDDEN');
    await expect(page('learn/themes')).rejects.toThrow('FORBIDDEN');
    await expect(page('learn/feed/[id]', { params: Promise.resolve({ id: ids.shared }) })).rejects.toThrow('FORBIDDEN');
    await expect(page('learn/ideas/[id]', { params: Promise.resolve({ id: ids.idea }) })).rejects.toThrow('NOT_FOUND');
    expect(await page('learn/ideas')).toMatch(/No improvement ideas are relevant/);
    expect(await page('learn/aira')).toMatch(/Public website content/);
    current = null;
    await expect(page('learn')).rejects.toThrow(/redirect:\/login/);
  });
  it('multi-membership user without an active workspace is sent to the workspace picker', async () => {
    current = await as(USER.multi);
    await expect(page('learn')).rejects.toThrow('redirect:/workspace');
  });
  it('product console renders for the product owner and is forbidden for everyone else', async () => {
    current = await as(USER.owner);
    expect(await page('product')).toMatch(/Prioritisation assist/);
    expect(await page('product/ideas/new')).toMatch(/Supporting contributions/);
    expect(await page('product/ideas/[id]', { params: Promise.resolve({ id: ids.idea }) })).toMatch(/Change status/);
    expect(await page('product/themes')).toMatch(/Rebuild generated themes/);
    for (const u of [USER.employee, USER.admin, USER.moderator, USER.nwAdmin]) {
      current = await as(u);
      await expect(page('product')).rejects.toThrow('FORBIDDEN');
      await expect(page('product/ideas/[id]', { params: Promise.resolve({ id: ids.idea }) })).rejects.toThrow('FORBIDDEN');
      await expect(page('product/themes')).rejects.toThrow('FORBIDDEN');
    }
  });
  it('the feed with a withdrawn-then-searched item and an empty search shows empty states', async () => {
    current = await as(USER.hbMember);
    expect(await page('learn', { searchParams: Promise.resolve({ q: 'zzzxqv nothing matches this' }) })).toMatch(/No approved observations match/);
  });
});
