import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { eq } from 'drizzle-orm';
import type { ReactElement } from 'react';
import type { Principal } from '@/lib/auth/principal';

const state = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getPrincipal: async () => state.current, SESSION_COOKIE: 'az_session' }));
vi.mock('@/lib/insights/ideas', () => ({ listOwnedIdeas: async () => [{ id: 'idea_1', title: 'Seasonality-aware explanation', status: 'Under review', latestUpdate: 'Being reviewed' }] }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { kind: 'redirect', to }); },
  notFound: () => { throw Object.assign(new Error('NEXT_NOT_FOUND'), { kind: 'notFound' }); },
  forbidden: () => { throw Object.assign(new Error('NEXT_FORBIDDEN'), { kind: 'forbidden' }); },
}));

import { as, USER, ORG } from './helpers/principals';
import { db, schema } from '@/db';

type Page = (props: { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>;
const pages = import.meta.glob('../src/app/{employee,admin}/**/page.tsx', { eager: false }) as Record<string, () => Promise<{ default: Page }>>;
const load = async (path: string) => (await pages[`../src/app/${path}/page.tsx`]()).default;
const render = async (path: string, params: Record<string, string> = {}, searchParams: Record<string, string> = {}) =>
  renderToString(await (await load(path))({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) }));
const as$ = async (id: string, org?: string) => { state.current = (await as(id, org)) as Principal; };
const kindOf = async (fn: () => Promise<unknown>) => fn().then(() => 'ok', (e) => (e as { kind?: string }).kind ?? (e as Error).message);

const EMPLOYEE_PAGES: [string, Record<string, string>][] = [
  ['employee', {}], ['employee/playground', {}], ['employee/playground/[slug]', { slug: 'policy-what-if' }], ['employee/playground/[slug]', { slug: 'report-validation' }],
  ['employee/playground/runs/[id]', { id: 'run_seed_emp_1' }], ['employee/live', {}], ['employee/live/[id]', { id: 'evt_seed_emp_live' }], ['employee/experiments', {}],
  ['employee/experiments/[id]', { id: 'emp_seed_exp_1' }], ['employee/teams', {}], ['employee/teams/[id]', { id: 'emp_seed_team_1' }], ['employee/release-notes', {}], ['employee/knowledge', {}],
];
const ADMIN_PAGES = ['admin', 'admin/orgs', 'admin/employees', 'admin/grants', 'admin/support', 'admin/audit', 'admin/leads', 'admin/config'];

beforeEach(() => { state.current = null; });

describe('employee pages render for an employee (with unrelated ideas module absent or present)', () => {
  it.each(EMPLOYEE_PAGES)('%s', async (path, params) => {
    await as$(USER.employee);
    const html = await render(path, params);
    expect(html.length).toBeGreaterThan(500);
    expect(html).not.toMatch(/undefined|\[object Object\]/);
  });
  it('dashboard separates internal notes and shows assigned ideas', async () => {
    await as$(USER.employee);
    const html = await render('employee');
    expect(html).toContain('Internal prototype notes (employees only)');
    expect(html).toContain('Seasonality-aware explanation');
    expect(html).toContain('Public product information');
  });
  it('playground run page labels the output as synthetic and shows the deterministic mode', async () => {
    await as$(USER.employee);
    const html = await render('employee/playground/runs/[id]', { id: 'run_seed_emp_1' });
    expect(html).toContain('SYNTHETIC');
    expect(html).toContain('deterministic');
    expect(html).toContain('No external AI service was called');
  });
  it("another employee's run is a 404", async () => {
    await as$(USER.owner);
    expect(await kindOf(() => render('employee/playground/runs/[id]', { id: 'run_seed_emp_1' }))).toBe('notFound');
  });
  it('team notes are not rendered for a non-member', async () => {
    await as$(USER.publisher);
    const html = await render('employee/teams/[id]', { id: 'emp_seed_team_1' });
    expect(html).not.toContain('Kick-off: scope is three synthetic applicants');
    expect(html).toContain('Join this team');
  });
  it('live page: ordinary employees get no create form; publishers do', async () => {
    await as$(USER.employee);
    expect(await render('employee/live')).not.toContain('Create a session');
    expect(await render('employee/live/[id]', { id: 'evt_seed_emp_live' })).toContain('Read-only');
    await as$(USER.publisher);
    expect(await render('employee/live')).toContain('Create a session');
    expect(await render('employee/live/[id]', { id: 'evt_seed_emp_live' })).toContain('Edit session');
  });
  it('knowledge page flags the stale article; release-note form only for content publishers', async () => {
    await as$(USER.employee);
    const html = await render('employee/knowledge');
    expect(html).toContain('Review overdue');
    expect(await render('employee/release-notes')).not.toContain('Post a release note');
    await as$(USER.publisher);
    expect(await render('employee/release-notes')).toContain('Post a release note');
  });
});

describe('employee routes refuse everyone else on the server', () => {
  it.each(EMPLOYEE_PAGES)('%s: client member -> 403, anonymous -> login redirect', async (path, params) => {
    await as$(USER.nwMember);
    expect(await kindOf(() => render(path, params))).toBe('forbidden');
    await as$(USER.multi, ORG.harbor);
    expect(await kindOf(() => render(path, params))).toBe('forbidden');
    state.current = null;
    expect(await kindOf(() => render(path, params))).toBe('redirect');
  });
  it('a denied page visit is audited', async () => {
    await as$(USER.hbAdmin);
    await kindOf(() => render('employee/experiments'));
    const rows = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.actorId, USER.hbAdmin));
    expect(rows.some((r) => r.action === 'authz.deny' && r.outcome === 'deny')).toBe(true);
  });
});

describe('admin pages', () => {
  it.each(ADMIN_PAGES)('%s renders for a portal admin', async (path) => {
    await as$(USER.admin);
    const html = await render(path);
    expect(html.length).toBeGreaterThan(500);
    expect(html).not.toMatch(/\[object Object\]/);
  });
  it('org detail renders members, entitlements and community controls', async () => {
    await as$(USER.admin);
    const html = await render('admin/orgs/[orgId]', { orgId: ORG.northwind });
    expect(html).toContain('Northwind Credit Union');
    expect(html).toContain('Product entitlements');
    expect(html).toContain('Learning community');
    expect(await kindOf(() => render('admin/orgs/[orgId]', { orgId: ORG.azentio }))).toBe('notFound');
  });
  it.each([...ADMIN_PAGES, 'admin/orgs/[orgId]', 'admin/support/[orgId]'])('%s: non-admins get 403 (employee, moderator, client admin) and anonymous is redirected', async (path) => {
    for (const who of [USER.employee, USER.moderator, USER.publisher, USER.nwAdmin]) {
      await as$(who);
      expect(await kindOf(() => render(path, { orgId: ORG.northwind }))).toBe('forbidden');
    }
    state.current = null;
    expect(await kindOf(() => render(path, { orgId: ORG.northwind }))).toBe('redirect');
  });
  it('support summary page: 403 without authorisation, renders summary with one', async () => {
    await as$(USER.admin);
    expect(await kindOf(() => render('admin/support/[orgId]', { orgId: ORG.northwind }))).toBe('forbidden');
    const { createSupportAuthorisation } = await import('@/lib/admin/support');
    await createSupportAuthorisation((await as(USER.admin)), { orgId: ORG.northwind, reason: 'Page test: investigating a support case', hours: 1 });
    const html = await render('admin/support/[orgId]', { orgId: ORG.northwind });
    expect(html).toContain('Northwind Credit Union');
    expect(html).toContain('recorded in the audit trail');
    const ok = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'support.access'));
    expect(ok.some((e) => e.outcome === 'ok' && e.orgId === ORG.northwind)).toBe(true);
    expect(ok.some((e) => e.outcome === 'deny')).toBe(true);
  });
  it('audit page filters through the query string', async () => {
    await as$(USER.admin);
    const html = await render('admin/audit', {}, { outcome: 'deny' });
    expect(html).toContain('deny');
    expect(await render('admin/audit', {}, { outcome: 'garbage', page: '-4' })).toContain('Audit viewer');
  });
});
