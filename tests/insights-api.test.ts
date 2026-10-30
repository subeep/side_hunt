import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@/lib/auth/principal';
import { as, USER } from './helpers/principals';
import { makeShared } from './helpers/shared';

let current: Principal | null = null;
vi.mock('@/lib/auth/session', () => ({ getPrincipal: async () => current }));

const origin = 'http://localhost';
const post = (body: unknown, headers: Record<string, string> = { origin, host: 'localhost' }) =>
  new Request(`${origin}/api/aira`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

let aira: typeof import('@/app/api/aira/route');
let search: typeof import('@/app/api/learn/search/route');
let suggest: typeof import('@/app/api/learn/suggest/route');
let exp: typeof import('@/app/api/learn/export/route');

beforeAll(async () => {
  aira = await import('@/app/api/aira/route');
  search = await import('@/app/api/learn/search/route');
  suggest = await import('@/app/api/learn/suggest/route');
  exp = await import('@/app/api/learn/export/route');
  await makeShared({ org: 'org_api1', title: 'Ibis route handler check', summary: 'Ibis marsh route handler check text.', offering: 'api' });
});
beforeEach(() => { current = null; });

describe('route handlers enforce the principal on the server', () => {
  it('feed endpoints: 401 anonymous, 403 for non-community principals, 200 for community members', async () => {
    for (const [h, path] of [[search.GET, 'search?q=ibis'], [suggest.GET, 'suggest?q=ibis'], [exp.GET, 'export?q=ibis&format=json']] as const) {
      current = null;
      expect((await h(new Request(`${origin}/api/learn/${path}`))).status).toBe(401);
      current = await as(USER.employee);
      expect((await h(new Request(`${origin}/api/learn/${path}`))).status).toBe(403);
      current = await as(USER.multi);
      expect((await h(new Request(`${origin}/api/learn/${path}`))).status).toBe(403);
      current = await as(USER.hbMember);
      expect((await h(new Request(`${origin}/api/learn/${path}`))).status).toBe(200);
    }
  });
  it('search returns approved items and a safeguarded statistic; no tenant fields; no-store', async () => {
    current = await as(USER.nwMember);
    const res = await search.GET(new Request(`${origin}/api/learn/search?q=ibis%20marsh&offering=api`));
    expect(res.headers.get('cache-control')).toBe('no-store');
    const j = await res.json();
    expect(j.items).toHaveLength(1);
    expect(j.statistics.suppressed).toBe(true);
    expect(JSON.stringify(j)).not.toMatch(/org_api1|orgId|contributionId/);
  });
  it('suggest and export reflect the same rules', async () => {
    current = await as(USER.nwMember);
    const s = await (await suggest.GET(new Request(`${origin}/api/learn/suggest?q=ibis`))).json();
    expect(s.suggestions.map((x: { text: string }) => x.text)).toContain('Ibis route handler check');
    const csv = await exp.GET(new Request(`${origin}/api/learn/export?q=ibis&format=csv`));
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/);
    expect(csv.headers.get('content-disposition')).toMatch(/attachment/);
    expect(await csv.text()).toContain('Ibis route handler check');
  });
});

describe('/api/aira', () => {
  it('rejects cross-origin and malformed requests', async () => {
    current = await as(USER.nwMember);
    expect((await aira.POST(post({ question: 'ibis marsh', scope: 'portal' }, { host: 'localhost' }))).status).toBe(403); // no Origin header
    expect((await aira.POST(post({ question: 'ibis marsh', scope: 'portal' }, { origin: 'http://evil.example', host: 'localhost' }))).status).toBe(403);
    expect((await aira.POST(post({ question: 'x' }))).status).toBe(400);
    expect((await aira.POST(post({ question: 'ibis marsh', scope: 'bogus' }))).status).toBe(400);
  });
  it('portal scope: 401 anonymous, 403 for non-community, 200 with citations + statement for community', async () => {
    current = null;
    expect((await aira.POST(post({ question: 'ibis marsh route handler', scope: 'portal' }))).status).toBe(401);
    current = await as(USER.employee);
    expect((await aira.POST(post({ question: 'ibis marsh route handler', scope: 'portal' }))).status).toBe(403);
    current = await as(USER.atMember); // Atlas has not acknowledged the workspace terms yet: the terms gate applies here too
    expect((await aira.POST(post({ question: 'ibis marsh route handler', scope: 'portal' }))).status).toBe(403);
    current = await as(USER.nwMember);
    const res = await aira.POST(post({ question: 'ibis marsh route handler', scope: 'portal' }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.sources.length).toBeGreaterThan(0);
    expect(j.statement).toMatch(/never retrains or changes any model/);
    expect(j.cohort.suppressed).toBe(true);
    expect(JSON.stringify(j)).not.toMatch(/org_api1/);
  });
  it('public scope is open to anyone but never returns community content', async () => {
    current = null;
    const res = await aira.POST(post({ question: 'ibis marsh route handler', scope: 'public' }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.sources.every((s: { id: string }) => /^(product|content|media):/.test(s.id))).toBe(true);
    expect(JSON.stringify(j)).not.toMatch(/Ibis/);
  });
});
