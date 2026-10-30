import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@/lib/auth/principal';
import { as, USER } from './helpers/principals';
import { makeShared } from './helpers/shared';
import { hasAcceptedTerms } from '@/lib/client/terms';
import { ORG } from '@/db/seed/core';

// SECURITY REVIEW (insights): the terms gate is enforced on pages, server actions and /api/aira, but not on the feed API handlers.
let current: Principal | null = null;
vi.mock('@/lib/auth/session', () => ({ getPrincipal: async () => current }));
const origin = 'http://localhost';
let search: typeof import('@/app/api/learn/search/route');
let suggest: typeof import('@/app/api/learn/suggest/route');
let exp: typeof import('@/app/api/learn/export/route');
beforeAll(async () => {
  search = await import('@/app/api/learn/search/route');
  suggest = await import('@/app/api/learn/suggest/route');
  exp = await import('@/app/api/learn/export/route');
  await makeShared({ org: 'org_rs2', title: 'Kestrel terms gate probe', summary: 'Kestrel terms gate probe text for review.' });
});
beforeEach(() => { current = null; });

describe('review: terms gate on feed API handlers', () => {
  it('Arlo Atlas has not acknowledged the workspace terms (precondition)', async () => {
    const p = await as(USER.atMember);
    expect(await hasAcceptedTerms(p.userId, ORG.atlas)).toBe(false);
  });
  it.each([['search', 'search?q=kestrel'], ['suggest', 'suggest?q=kestrel'], ['export', 'export?q=kestrel&format=json']])('GET /api/learn/%s refuses a client who has not acknowledged terms', async (_n, path) => {
    current = await as(USER.atMember);
    const h = path.startsWith('search') ? search.GET : path.startsWith('suggest') ? suggest.GET : exp.GET;
    const res = await h(new Request(`${origin}/api/learn/${path}`));
    expect(res.status).toBe(403);
  });
});
