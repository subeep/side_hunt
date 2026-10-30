import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { as, USER, ORG } from './helpers/principals';
import { makeOrg, denies } from './client-fixtures';
import { getResource, listResources } from '@/lib/client/resources';
import { getSession, isUpcoming, listSessions } from '@/lib/client/sessions';
import { contributionSummary, getDashboard, listDemos, listEntitledOfferings } from '@/lib/client/dashboard';
import { getRun, listRuns } from '@/lib/client/sandbox';
import { createTicket, getTicket, listTickets } from '@/lib/client/support';
import { clientCanSee } from '@/lib/client/audience';

const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe('resources / briefings / release notes', () => {
  it('each tenant sees its own org items and entitled-product items only', async () => {
    const nw = titles(await listResources(await as(USER.nwMember)));
    expect(nw).toContain('Northwind onboarding playbook');
    expect(nw).toContain('Credit Strategy Simulator: release notes 2026.10');
    expect(nw).not.toContain('Harbor reporting calendar guide');
    expect(nw).not.toContain('Atlas regional rollout briefing');
    expect(nw).not.toContain('RIVA: release notes 2026.10'); // Northwind is not entitled to RIVA
    const hb = titles(await listResources(await as(USER.hbMember)));
    expect(hb).toContain('RIVA: release notes 2026.10');
    expect(hb).toContain('Harbor reporting calendar guide');
    expect(hb).not.toContain('Northwind onboarding playbook');
    expect(hb).not.toContain('Credit Strategy Simulator: release notes 2026.10');
  });
  it('drafts never show, even to the owning tenant', async () => {
    expect(titles(await listResources(await as(USER.nwAdmin)))).not.toContain('Northwind draft: unpublished plan');
    expect(await getResource(await as(USER.nwAdmin), 'cnt_cl_nw_draft')).toBeNull();
  });
  it('direct object id access across tenants returns nothing and is audited', async () => {
    const hb = await as(USER.hbMember);
    expect(await getResource(hb, 'cnt_cl_nw_playbook')).toBeNull();
    expect(await getResource(hb, 'cnt_cl_rn_csim')).toBeNull(); // product audience, not entitled
    expect((await denies('resource.view', USER.hbMember)).length).toBeGreaterThanOrEqual(2);
    expect(await getResource(hb, 'cnt_does_not_exist')).toBeNull();
    expect((await getResource(await as(USER.nwMember), 'cnt_cl_nw_playbook'))?.title).toBe('Northwind onboarding playbook');
  });
  it('missing audience metadata, employee-only and internal-org items are denied by default', async () => {
    const base = { kind: 'resource' as const, status: 'published' as const, publishedAt: new Date(), body: 'x' };
    await db.insert(schema.contentItems).values([
      { ...base, id: 'cnt_t_noaud', slug: 't-noaud', title: 'T no audience', audienceKind: null },
      { ...base, id: 'cnt_t_emp', slug: 't-emp', title: 'T employees', audienceKind: 'employees' },
      { ...base, id: 'cnt_t_int', slug: 't-int', title: 'T internal org', audienceKind: 'org', audienceOrgId: ORG.azentio },
      { ...base, id: 'cnt_t_pub', slug: 't-pub', title: 'T public resource', audienceKind: 'public' },
      { ...base, id: 'cnt_t_comm', slug: 't-comm', title: 'T community', audienceKind: 'community' },
      { ...base, id: 'cnt_t_future', slug: 't-future', title: 'T not yet live', audienceKind: 'org', audienceOrgId: ORG.northwind, startsAt: new Date(Date.now() + 86400_000) },
    ]);
    const nw = await as(USER.nwAdmin);
    const list = titles(await listResources(nw));
    for (const t of ['T no audience', 'T employees', 'T internal org', 'T public resource', 'T community', 'T not yet live']) expect(list).not.toContain(t);
    for (const id of ['cnt_t_noaud', 'cnt_t_emp', 'cnt_t_int', 'cnt_t_pub', 'cnt_t_comm', 'cnt_t_future']) expect(await getResource(nw, id)).toBeNull();
    // the portal never widens the rule: an employee principal gets no employee-only content either
    expect(clientCanSee(await as(USER.employee), { kind: 'employees' })).toBe(false);
    expect(clientCanSee(await as(USER.employee), { kind: 'org', orgId: ORG.azentio })).toBe(false);
  });
  it('multi-membership user: results follow the ACTIVE workspace, never a union', async () => {
    const asNw = titles(await listResources(await as(USER.multi, ORG.northwind)));
    const asHb = titles(await listResources(await as(USER.multi, ORG.harbor)));
    expect(asNw).toContain('Northwind onboarding playbook');
    expect(asNw).not.toContain('Harbor reporting calendar guide');
    expect(asHb).toContain('Harbor reporting calendar guide');
    expect(asHb).not.toContain('Northwind onboarding playbook');
    expect(await listResources(await as(USER.multi))).toEqual([]); // no active workspace => nothing
    expect(await getResource(await as(USER.multi, ORG.harbor), 'cnt_cl_nw_playbook')).toBeNull();
  });
});

describe('sessions / webinars / recordings', () => {
  it('invitation-only Northwind webinar is visible to Northwind only', async () => {
    for (const u of [USER.nwMember, USER.nwAdmin]) expect(titles(await listSessions(await as(u)))).toContain('Northwind: SME seasonality working session');
    for (const u of [USER.hbMember, USER.atMember]) {
      const list = titles(await listSessions(await as(u)));
      expect(list).not.toContain('Northwind: SME seasonality working session');
      expect(list.join()).not.toContain('Northwind');
    }
    expect(await getSession(await as(USER.hbAdmin), 'evt_cl_nw_webinar')).toBeNull();
    expect((await denies('session.view', USER.hbAdmin)).length).toBe(1);
    expect(await getSession(await as(USER.multi, ORG.harbor), 'evt_cl_nw_webinar')).toBeNull();
    expect((await getSession(await as(USER.multi, ORG.northwind), 'evt_cl_nw_webinar'))?.joinInfo).toContain('NW-4821');
  });
  it('product sessions follow entitlements', async () => {
    expect(titles(await listSessions(await as(USER.hbMember)))).toContain('RIVA validation clinic');
    expect(titles(await listSessions(await as(USER.nwMember)))).not.toContain('RIVA validation clinic');
    expect(await getSession(await as(USER.atMember), 'evt_cl_riva_clinic')).toBeNull();
  });
  it('join info is withheld once ended or cancelled; recordings only via an authorised media row', async () => {
    const nw = await as(USER.nwMember);
    const past = await getSession(nw, 'evt_cl_nw_past');
    expect(past?.joinInfo).toBeNull();
    expect(past?.recordingUrl).toBe('/api/media/med_cl_nw_recording');
    expect(isUpcoming(past!)).toBe(false);
    // a public event whose recording is Northwind-only: other tenants get the event but never the recording link
    await db.insert(schema.events).values({ id: 'evt_t_pub', title: 'T public event', kind: 'webinar', startsAt: new Date(Date.now() - 86400_000), status: 'ended', recordingMediaId: 'med_cl_nw_recording', audienceKind: 'public' });
    expect((await getSession(await as(USER.hbMember), 'evt_t_pub'))?.recordingUrl).toBeNull();
    expect((await getSession(nw, 'evt_t_pub'))?.recordingUrl).toBe('/api/media/med_cl_nw_recording');
    await db.update(schema.events).set({ status: 'cancelled', startsAt: new Date(Date.now() + 86400_000), joinInfo: 'secret-join' }).where(eq(schema.events.id, 'evt_t_pub'));
    expect((await getSession(nw, 'evt_t_pub'))?.joinInfo).toBeNull();
  });
  it('employee-only / missing-audience / hackathon events are never listed', async () => {
    await db.insert(schema.events).values([
      { id: 'evt_t_emp', title: 'T employee-only', kind: 'live', startsAt: new Date(Date.now() + 86400_000), audienceKind: 'employees', joinInfo: 'emp-secret' },
      { id: 'evt_t_none', title: 'T no audience', kind: 'live', startsAt: new Date(Date.now() + 86400_000), audienceKind: null },
      { id: 'evt_t_hack', title: 'T hackathon', kind: 'hackathon_session', startsAt: new Date(Date.now() + 86400_000), audienceKind: 'public' },
    ]);
    const list = titles(await listSessions(await as(USER.nwAdmin)));
    for (const t of ['T employee-only', 'T no audience', 'T hackathon']) expect(list).not.toContain(t);
    for (const id of ['evt_t_emp', 'evt_t_none', 'evt_t_hack']) expect(await getSession(await as(USER.nwAdmin), id)).toBeNull();
  });
});

describe('demos (media)', () => {
  it('product + org audiences follow entitlement and tenant; no payload columns selected', async () => {
    const nw = await listDemos(await as(USER.nwMember));
    const ids = nw.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['med_cl_demo_csim', 'med_cl_demo_sme', 'med_cl_demo_spi', 'med_cl_nw_walkthrough']));
    expect(ids).not.toContain('med_cl_demo_riva');
    expect(Object.keys(nw[0])).not.toContain('data');
    const hb = (await listDemos(await as(USER.hbMember))).map((m) => m.id);
    expect(hb).toEqual(expect.arrayContaining(['med_cl_demo_riva', 'med_cl_demo_sme']));
    expect(hb).not.toContain('med_cl_nw_walkthrough');
    expect(hb).not.toContain('med_cl_demo_csim');
    const at = (await listDemos(await as(USER.atMember))).map((m) => m.id);
    expect(at).not.toContain('med_cl_nw_recording');
  });
  it('draft or audience-less media is never a demo', async () => {
    const base = { kind: 'video' as const, mime: 'image/svg+xml', data: '<svg/>' };
    await db.insert(schema.media).values([
      { ...base, id: 'med_t_draft', title: 'T draft demo', status: 'draft', audienceKind: 'product', audienceProduct: 'riva' },
      { ...base, id: 'med_t_none', title: 'T no audience demo', status: 'published', audienceKind: null },
      { ...base, id: 'med_t_emp', title: 'T employee demo', status: 'published', audienceKind: 'employees' },
    ]);
    expect(titles(await listDemos(await as(USER.hbMember))).filter((t) => t.startsWith('T '))).toEqual([]);
  });
});

describe('sandbox runs and support tickets are isolated by tenant AND user', () => {
  it('members see only their own runs; admins see their org; nobody sees another tenant', async () => {
    const mem = (await listRuns(await as(USER.nwMember))).map((r) => r.id).sort();
    expect(mem).toEqual(['run_cl_nw_1', 'run_cl_nw_2']);
    const adm = (await listRuns(await as(USER.nwAdmin))).map((r) => r.id).sort();
    expect(adm).toEqual(['run_cl_nw_1', 'run_cl_nw_2', 'run_cl_nw_3']);
    expect((await listRuns(await as(USER.hbMember))).map((r) => r.id)).toEqual(['run_cl_hb_1']);
    expect(await listRuns(await as(USER.atAdmin))).toEqual([]);
    expect((await listRuns(await as(USER.multi, ORG.northwind))).length).toBe(0); // multi has no runs; colleagues' runs are not theirs
    expect((await listRuns(await as(USER.multi, ORG.harbor))).length).toBe(0);
  });
  it('direct run id: owner and own-org admin only, everything else is a 404 plus audit', async () => {
    expect((await getRun(await as(USER.nwMember), 'run_cl_nw_1'))?.userName).toBe('Noah Northwind');
    expect((await getRun(await as(USER.nwAdmin), 'run_cl_nw_1'))?.id).toBe('run_cl_nw_1'); // admin of the same org
    expect(await getRun(await as(USER.nwMember), 'run_cl_nw_3')).toBeNull(); // colleague's run
    expect(await getRun(await as(USER.hbAdmin), 'run_cl_nw_1')).toBeNull(); // another tenant, even an admin
    expect(await getRun(await as(USER.multi, ORG.harbor), 'run_cl_nw_1')).toBeNull(); // member of NW but active org is Harbor
    expect(await getRun(await as(USER.atMember), 'run_cl_hb_1')).toBeNull();
    expect(await getRun(await as(USER.nwAdmin), 'run_nope')).toBeNull();
    expect((await denies('sandbox.run.view', USER.hbAdmin)).length).toBe(1);
    expect((await denies('sandbox.run.view', USER.nwMember)).length).toBe(1);
  });
  it('tickets: members own, admins their org, never cross-tenant', async () => {
    expect((await listTickets(await as(USER.nwMember))).map((t) => t.id).sort()).toEqual(['tkt_cl_nw_1', 'tkt_cl_nw_3']);
    expect((await listTickets(await as(USER.nwAdmin))).map((t) => t.id).sort()).toEqual(['tkt_cl_nw_1', 'tkt_cl_nw_2', 'tkt_cl_nw_3']);
    expect((await listTickets(await as(USER.hbAdmin))).map((t) => t.id).sort()).toEqual(['tkt_cl_hb_1', 'tkt_cl_hb_2']);
    expect(await getTicket(await as(USER.nwMember), 'tkt_cl_nw_2')).toBeNull(); // colleague's ticket
    expect(await getTicket(await as(USER.hbAdmin), 'tkt_cl_nw_1')).toBeNull();
    expect(await getTicket(await as(USER.multi, ORG.harbor), 'tkt_cl_nw_1')).toBeNull();
    expect((await getTicket(await as(USER.nwAdmin), 'tkt_cl_nw_1'))?.subject).toBe('Sandbox run history question');
  });
  it('ticket creation takes tenant and author from the session and validates input', async () => {
    const hb = await as(USER.hbMember);
    expect((await createTicket(hb, { subject: 'x', body: 'too short' })).ok).toBe(false);
    expect((await createTicket(hb, { subject: 'Valid subject', body: 'y'.repeat(2001) })).ok).toBe(false);
    const res = await createTicket(hb, { subject: 'Valid subject', body: 'A sufficiently long description.', orgId: ORG.northwind, userId: USER.nwAdmin });
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(schema.supportTickets).where(eq(schema.supportTickets.id, (res as { id: string }).id));
    expect(row.orgId).toBe(ORG.harbor);
    expect(row.userId).toBe(USER.hbMember);
    expect(row.status).toBe('open');
    expect((await listTickets(await as(USER.nwAdmin))).some((t) => t.id === row.id)).toBe(false);
    expect((await createTicket(await as(USER.multi), { subject: 'Valid subject', body: 'A sufficiently long description.' })).ok).toBe(false); // no active workspace
  });
});

describe('dashboard summaries', () => {
  it('contribution counts cover only my items and org-visible colleague items, never other tenants or private drafts', async () => {
    const mk = (id: string, orgId: string, authorId: string, status: 'draft' | 'submitted' | 'published', sharingChoice: 'private' | 'organisation' | 'community') =>
      ({ id, orgId, authorId, kind: 'market_observation' as const, title: id, observation: 'obs', status, sharingChoice });
    const base = await contributionSummary(await as(USER.nwMember));
    const baseHb = await contributionSummary(await as(USER.hbAdmin));
    const bump = (c: Record<string, number>, d: Record<string, number>) => { const o = { ...c }; for (const [k, v] of Object.entries(d)) o[k] = (o[k] ?? 0) + v; return o; };
    await db.insert(schema.contributions).values([
      mk('con_t_me_draft', ORG.northwind, USER.nwMember, 'draft', 'private'),
      mk('con_t_me_sub', ORG.northwind, USER.nwMember, 'submitted', 'community'),
      mk('con_t_col_org', ORG.northwind, USER.nwAdmin, 'submitted', 'organisation'),
      mk('con_t_col_priv', ORG.northwind, USER.nwAdmin, 'submitted', 'private'),
      mk('con_t_col_draft', ORG.northwind, USER.nwAdmin, 'draft', 'organisation'),
      mk('con_t_hb', ORG.harbor, USER.hbMember, 'published', 'community'),
    ]);
    const s = await contributionSummary(await as(USER.nwMember));
    expect(s.mine).toEqual(bump(base.mine, { draft: 1, submitted: 1 }));
    expect(s.org).toEqual(bump(base.org, { draft: 1, submitted: 2 })); // my two + only the colleague's submitted/organisation item
    const hb = await contributionSummary(await as(USER.hbAdmin));
    expect(hb.mine).toEqual(baseHb.mine); // Northwind rows never leak into Harbor counts
    expect(hb.org).toEqual(bump(baseHb.org, { published: 1 }));
    expect(await contributionSummary(await as(USER.multi))).toEqual({ mine: {}, org: {} });
  });
  it('an organisation with no entitlements gets empty states everywhere and no sandbox access', async () => {
    const o = await makeOrg({ name: 'Empty Org', members: 1 });
    const p = await o.as(o.members[0].userId);
    expect(p.activeOrgId).toBe(o.orgId);
    const d = await getDashboard(p);
    expect(d.offerings).toEqual([]);
    expect(d.demos).toEqual([]); // no product demos, and no other tenant's media as sample content
    expect(d.upcoming.every((x) => x.audienceKind === 'public')).toBe(true); // only explicitly public events, nothing from other tenants
    expect(d.contributions).toEqual({ mine: {}, org: {} });
    expect(await listEntitledOfferings(p)).toEqual([]);
    expect(await listResources(p)).toEqual([]);
    expect((await listSessions(p)).every((x) => x.audienceKind === 'public')).toBe(true);
    expect(await listRuns(p)).toEqual([]);
    expect(await listTickets(p)).toEqual([]);
    const { getEntitledOffering } = await import('@/lib/client/sandbox');
    for (const slug of ['credit-strategy-simulator', 'riva', 'sme-credit-decisioning']) expect(await getEntitledOffering(p, slug)).toBeNull();
    expect((await denies('sandbox.use', o.members[0].userId)).length).toBe(3);
  });
  it('entitled dashboard lists exactly the entitled offerings', async () => {
    const d = await getDashboard(await as(USER.hbAdmin));
    expect(d.offerings.map((o) => o.slug).sort()).toEqual(['riva', 'sme-credit-decisioning']);
    expect(d.upcoming.every((s) => !('joinInfo' in s))).toBe(true);
    expect(d.upcoming.map((s) => s.title)).not.toContain('Northwind: SME seasonality working session');
  });
  it('an employee who also holds a client membership never sees employee content in the client portal', async () => {
    await db.insert(schema.events).values({ id: 'evt_t_emp2', title: 'T employee broadcast', kind: 'live', startsAt: new Date(Date.now() + 86400_000), audienceKind: 'employees' });
    await db.insert(schema.memberships).values({ userId: USER.employee, orgId: ORG.northwind, role: 'client_member' });
    const p = await as(USER.employee);
    expect(p.isEmployee).toBe(true);
    expect(p.activeOrgId).toBe(ORG.northwind);
    expect(titles(await listSessions(p))).not.toContain('T employee broadcast');
    expect(await getSession(p, 'evt_t_emp2')).toBeNull();
    const n = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.action, 'session.view'), eq(schema.auditEvents.actorId, USER.employee)));
    expect(n.length).toBe(1);
  });
});
