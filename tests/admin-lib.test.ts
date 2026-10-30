import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { as, USER, ORG } from './helpers/principals';
import { db, schema } from '@/db';
import { AuthzError, InputError } from '@/lib/employee/common';
import { addMember, changeMemberRole, createOrg, getCommunityStatus, listEntitlements, listMembers, listOrgs, revokeMember, setCommunityStatus, setEntitlement, setOrgStatus } from '@/lib/admin/orgs';
import { addAllowlist, grantPlatform, listAllowlist, listGrantHolders, revokeAllowlist, revokeGrant } from '@/lib/admin/people';
import { createSupportAuthorisation, getSupportSummary, listSupportAuthorisations, revokeSupportAuthorisation } from '@/lib/admin/support';
import { adminOverview, getConfig, listAudit, listLeads } from '@/lib/admin/views';
import { isEligibleEmail } from '@/lib/auth/login';
import { hasSupportAuthorisation, canReadTenantPrivate } from '@/lib/authz';

const audits = (action: string, outcome?: 'ok' | 'deny') =>
  db.select().from(schema.auditEvents).where(outcome ? and(eq(schema.auditEvents.action, action), eq(schema.auditEvents.outcome, outcome)) : eq(schema.auditEvents.action, action));

/** Everyone who is not a portal administrator, with the reason they are refused. */
const NON_ADMINS = [USER.employee, USER.moderator, USER.publisher, USER.owner, USER.nwAdmin, USER.nwMember, USER.multi, USER.outsider];

async function secondAdmin() {
  await db.insert(schema.users).values({ id: 'usr_admin2', email: 'admin2@azentio.com', name: 'Second Admin' }).onConflictDoNothing();
  await db.insert(schema.employeeAllowlist).values({ email: 'admin2@azentio.com', name: 'Second Admin' }).onConflictDoNothing();
  await db.insert(schema.memberships).values({ userId: 'usr_admin2', orgId: ORG.azentio, role: 'employee' }).onConflictDoNothing();
  await db.insert(schema.grants).values({ id: 'grt_admin2', userId: 'usr_admin2', permission: 'portal_admin' }).onConflictDoNothing();
  return as('usr_admin2');
}

beforeAll(async () => {
  await db.insert(schema.users).values({ id: 'usr_tclient', email: 'tclient@example.test', name: 'Test Client' }).onConflictDoNothing();
  await db.insert(schema.contributions).values([
    { id: 'con_t_draft', orgId: ORG.northwind, authorId: USER.nwMember, kind: 'market_observation', title: 'SECRET DRAFT TITLE', observation: 'SECRET DRAFT BODY about Customer 4411', status: 'draft' },
    { id: 'con_t_sub', orgId: ORG.northwind, authorId: USER.nwMember, kind: 'product_gap', title: 'Submitted gap title', observation: 'SECRET SUBMITTED BODY', status: 'submitted' },
    { id: 'con_t_hb', orgId: ORG.harbor, authorId: USER.hbMember, kind: 'product_gap', title: 'Harbor only title', observation: 'Harbor body', status: 'submitted' },
  ]).onConflictDoNothing();
});

describe('admin console: nobody but a portal admin', () => {
  it('every admin function refuses non-admins (and records an audited denial)', async () => {
    for (const who of NON_ADMINS) {
      const p = await as(who);
      const calls: Promise<unknown>[] = [
        listOrgs(p), createOrg(p, { name: 'Evil Org' }), setOrgStatus(p, ORG.northwind, 'suspended'), listMembers(p, ORG.northwind),
        addMember(p, { orgId: ORG.northwind, email: 'random@gmail.example', role: 'client_admin' }), changeMemberRole(p, 'mem_x', 'client_admin'), revokeMember(p, 'mem_x'),
        listEntitlements(p, ORG.northwind), setEntitlement(p, ORG.northwind, 'riva', true), setCommunityStatus(p, ORG.northwind, 'revoked'), getCommunityStatus(p, ORG.northwind),
        listAllowlist(p), addAllowlist(p, { email: 'x@azentio.com', name: 'X Person' }), revokeAllowlist(p, 'employee@azentio.com'),
        listGrantHolders(p), grantPlatform(p, { userId: who, permission: 'portal_admin' }), revokeGrant(p, { userId: USER.admin, permission: 'portal_admin' }),
        createSupportAuthorisation(p, { orgId: ORG.northwind, reason: 'I would just like to look around', hours: 24 }), revokeSupportAuthorisation(p, 'sup_x'), listSupportAuthorisations(p), getSupportSummary(p, ORG.northwind),
        listAudit(p, {}), listLeads(p, {}), getConfig(p), adminOverview(p),
      ];
      for (const r of await Promise.allSettled(calls)) {
        expect(r.status).toBe('rejected');
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(AuthzError);
      }
    }
    expect((await audits('admin.grant.create', 'deny')).length).toBe(NON_ADMINS.length);
    // nothing changed
    expect((await db.select().from(schema.organisations).where(eq(schema.organisations.name, 'Evil Org'))).length).toBe(0);
    expect((await db.select().from(schema.grants).where(eq(schema.grants.userId, USER.employee))).length).toBe(0);
    await expect(listOrgs(null)).rejects.toBeInstanceOf(AuthzError);
  });
  it('a grant holder who is not portal_admin gets nothing from other grants', async () => {
    await expect(listAudit(await as(USER.moderator), {})).rejects.toBeInstanceOf(AuthzError);
    await expect(createOrg(await as(USER.publisher), { name: 'Pub Org' })).rejects.toBeInstanceOf(AuthzError);
  });
});

describe('organisations and members', () => {
  it('creates, lists and suspends client orgs; suspension removes the workspace from members immediately', async () => {
    const a = await as(USER.admin);
    const org = await createOrg(a, { name: 'Test Co Ltd', industry: 'Fintech', region: 'Europe' });
    expect(org).toMatchObject({ kind: 'client', status: 'active', slug: 'test-co-ltd' });
    await expect(createOrg(a, { name: 'x' })).rejects.toBeInstanceOf(InputError);
    expect((await listOrgs(a)).some((o) => o.id === org.id)).toBe(true);
    await setOrgStatus(a, ORG.atlas, 'suspended');
    expect((await as(USER.atMember)).memberships).toHaveLength(0);
    await setOrgStatus(a, ORG.atlas, 'active');
    expect((await as(USER.atMember)).activeOrgId).toBe(ORG.atlas);
    await expect(setOrgStatus(a, ORG.azentio, 'suspended')).rejects.toBeInstanceOf(InputError); // internal org can never be suspended
    await expect(setOrgStatus(a, ORG.atlas, 'deleted')).rejects.toBeInstanceOf(InputError);
    expect((await audits('admin.org.create', 'ok')).length).toBeGreaterThan(0);
  });
  it('members: only existing non-employee users, only client roles, never employees; role changes are limited to the two client roles', async () => {
    const a = await as(USER.admin);
    const org = await createOrg(a, { name: 'Member Test Org' });
    await expect(addMember(a, { orgId: org.id, email: 'ghost@nowhere.example', role: 'client_member' })).rejects.toBeInstanceOf(InputError);
    await expect(addMember(a, { orgId: org.id, email: 'tclient@example.test', role: 'employee' })).rejects.toBeInstanceOf(AuthzError);
    await expect(addMember(a, { orgId: org.id, email: 'tclient@example.test', role: 'portal_admin' })).rejects.toBeInstanceOf(AuthzError);
    await expect(addMember(a, { orgId: org.id, email: 'employee@azentio.com', role: 'client_member' })).rejects.toBeInstanceOf(AuthzError);
    await expect(addMember(a, { orgId: ORG.azentio, email: 'tclient@example.test', role: 'client_member' })).rejects.toBeInstanceOf(InputError); // internal org is not a client org
    await addMember(a, { orgId: org.id, email: 'TClient@Example.test', role: 'client_member' });
    const m = (await listMembers(a, org.id)).find((x) => x.userId === 'usr_tclient')!;
    expect(m).toMatchObject({ role: 'client_member', status: 'active' });
    await changeMemberRole(a, m.id, 'client_admin');
    await expect(changeMemberRole(a, m.id, 'employee')).rejects.toBeInstanceOf(AuthzError);
    await expect(changeMemberRole(a, m.id, 'portal_admin')).rejects.toBeInstanceOf(AuthzError);
    expect((await listMembers(a, org.id))[0].role).toBe('client_admin');
    // employee memberships are not manageable through this console
    const [emp] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.userId, USER.employee), eq(schema.memberships.orgId, ORG.azentio)));
    await expect(changeMemberRole(a, emp.id, 'client_admin')).rejects.toBeInstanceOf(InputError);
    await expect(revokeMember(a, emp.id)).rejects.toBeInstanceOf(InputError);
    await revokeMember(a, m.id);
    expect((await listMembers(a, org.id))[0].status).toBe('revoked');
    await addMember(a, { orgId: org.id, email: 'tclient@example.test', role: 'client_member' }); // re-adding reactivates, no duplicate row
    expect(await listMembers(a, org.id)).toHaveLength(1);
    expect((await audits('admin.member.add', 'deny')).length).toBeGreaterThanOrEqual(3);
  });
});

describe('employee allowlist', () => {
  it('only @azentio.com addresses, normalised; adding makes the address eligible for a sign-in code', async () => {
    const a = await as(USER.admin);
    for (const bad of ['evil@gmail.com', 'x@azentio.com.evil.example', 'x@notazentio.com', 'x@azentio.co']) await expect(addAllowlist(a, { email: bad, name: 'Some Person' })).rejects.toBeInstanceOf(AuthzError);
    await expect(addAllowlist(a, { email: 'not-an-email', name: 'Some Person' })).rejects.toBeInstanceOf(InputError);
    expect(await isEligibleEmail('new.hire@azentio.com')).toBe(false);
    await addAllowlist(a, { email: ' New.Hire@Azentio.com ', name: 'New Hire' });
    expect(await isEligibleEmail('new.hire@azentio.com')).toBe(true);
    expect((await listAllowlist(a)).find((x) => x.email === 'new.hire@azentio.com')).toMatchObject({ status: 'active', signedIn: false });
    expect((await audits('admin.allowlist.add', 'deny')).length).toBe(NON_ADMINS.length + 4);
  });
  it('revoking strips employee status, grants and sessions at once; own access cannot be revoked', async () => {
    const a = await as(USER.admin);
    await expect(revokeAllowlist(a, 'admin@azentio.com')).rejects.toBeInstanceOf(AuthzError);
    await expect(revokeAllowlist(a, 'nobody@azentio.com')).rejects.toBeInstanceOf(InputError);
    await db.insert(schema.users).values({ id: 'usr_temp', email: 'temp@azentio.com', name: 'Temp' }).onConflictDoNothing();
    await addAllowlist(a, { email: 'temp@azentio.com', name: 'Temp' });
    await db.insert(schema.memberships).values({ userId: 'usr_temp', orgId: ORG.azentio, role: 'employee' }).onConflictDoNothing();
    await grantPlatform(a, { userId: 'usr_temp', permission: 'content_publisher' });
    expect((await as('usr_temp')).grants.has('content_publisher')).toBe(true);
    await revokeAllowlist(a, 'temp@azentio.com');
    const t = await as('usr_temp');
    expect(t.isEmployee).toBe(false);
    expect(t.grants.size).toBe(0);
    expect((await db.select().from(schema.grants).where(and(eq(schema.grants.userId, 'usr_temp')))).every((g) => g.revokedAt)).toBe(true);
  });
});

describe('platform grants: escalation attempts', () => {
  it('only a portal admin grants; employees, grant holders, client admins and clients cannot grant themselves or anyone else', async () => {
    for (const who of [USER.employee, USER.moderator, USER.publisher, USER.owner, USER.nwAdmin, USER.hbAdmin, USER.multi]) {
      const p = await as(who);
      await expect(grantPlatform(p, { userId: who, permission: 'portal_admin' })).rejects.toBeInstanceOf(AuthzError);
      await expect(grantPlatform(p, { userId: USER.employee, permission: 'learning_moderator' })).rejects.toBeInstanceOf(AuthzError);
    }
    expect((await as(USER.employee)).grants.size).toBe(0);
  });
  it('a portal admin cannot grant platform roles to client users, client admins or unverified accounts', async () => {
    const a = await as(USER.admin);
    for (const target of [USER.nwAdmin, USER.nwMember, USER.multi, USER.outsider, 'usr_does_not_exist']) {
      await expect(grantPlatform(a, { userId: target, permission: 'learning_moderator' })).rejects.toBeInstanceOf(AuthzError);
      expect((await as(target === 'usr_does_not_exist' ? USER.employee : target)).grants.has('learning_moderator')).toBe(false);
    }
    // an @azentio.com user who is NOT allowlisted is not an employee either
    await db.insert(schema.users).values({ id: 'usr_intruder', email: 'intruder@azentio.com', name: 'Intruder' }).onConflictDoNothing();
    await db.insert(schema.memberships).values({ userId: 'usr_intruder', orgId: ORG.azentio, role: 'employee' }).onConflictDoNothing();
    await expect(grantPlatform(a, { userId: 'usr_intruder', permission: 'content_publisher' })).rejects.toBeInstanceOf(AuthzError);
    expect((await audits('admin.grant.create', 'deny')).length).toBeGreaterThanOrEqual(6);
  });
  it('grants to a verified employee work, are idempotent, validated and audited; revoke removes them', async () => {
    const a = await as(USER.admin);
    await expect(grantPlatform(a, { userId: USER.employee, permission: 'superuser' })).rejects.toBeInstanceOf(InputError);
    await grantPlatform(a, { userId: USER.employee, permission: 'video_publisher' });
    await grantPlatform(a, { userId: USER.employee, permission: 'video_publisher' });
    expect((await listGrantHolders(a)).filter((g) => g.userId === USER.employee && g.permission === 'video_publisher')).toHaveLength(1);
    const e = await as(USER.employee);
    expect(e.grants.has('video_publisher')).toBe(true);
    expect(e.grants.has('portal_admin')).toBe(false); // grants are separate
    await revokeGrant(a, { userId: USER.employee, permission: 'video_publisher' });
    expect((await as(USER.employee)).grants.size).toBe(0);
    await expect(revokeGrant(a, { userId: USER.employee, permission: 'video_publisher' })).rejects.toBeInstanceOf(InputError);
    expect((await audits('admin.grant.revoke', 'ok')).length).toBe(1);
  });
  it('a portal admin cannot revoke their own portal_admin grant, nor the last one', async () => {
    const a = await as(USER.admin);
    await expect(revokeGrant(a, { userId: USER.admin, permission: 'portal_admin' })).rejects.toBeInstanceOf(AuthzError);
    const b = await secondAdmin();
    await expect(revokeGrant(b, { userId: USER.admin, permission: 'portal_admin' })).resolves.toBeUndefined(); // two admins: one may revoke the other
    await expect(revokeGrant(b, { userId: 'usr_admin2', permission: 'portal_admin' })).rejects.toBeInstanceOf(AuthzError); // self
    await db.update(schema.grants).set({ revokedAt: null }).where(eq(schema.grants.id, 'grt_admin'));
    expect((await as(USER.admin)).grants.has('portal_admin')).toBe(true);
    await db.update(schema.grants).set({ revokedAt: new Date() }).where(eq(schema.grants.id, 'grt_admin2')); // leave a single admin
    await expect(revokeGrant(await as(USER.admin), { userId: USER.admin, permission: 'portal_admin' })).rejects.toBeInstanceOf(AuthzError);
  });
});

describe('entitlements and community status', () => {
  it('toggles products for one org; unknown product refused; effect on principal', async () => {
    const a = await as(USER.admin);
    expect((await as(USER.hbMember)).entitlements.has('credit-strategy-simulator')).toBe(false);
    await setEntitlement(a, ORG.harbor, 'credit-strategy-simulator', true);
    expect((await as(USER.hbMember)).entitlements.has('credit-strategy-simulator')).toBe(true);
    expect((await as(USER.nwMember)).entitlements.has('riva')).toBe(false);
    expect((await listEntitlements(a, ORG.harbor)).find((e) => e.slug === 'credit-strategy-simulator')!.enabled).toBe(true);
    await setEntitlement(a, ORG.harbor, 'credit-strategy-simulator', false);
    expect((await as(USER.hbMember)).entitlements.has('credit-strategy-simulator')).toBe(false);
    await expect(setEntitlement(a, ORG.harbor, 'bogus', true)).rejects.toBeInstanceOf(InputError);
    await expect(setEntitlement(a, ORG.azentio, 'riva', true)).rejects.toBeInstanceOf(InputError);
  });
  it('community approve/revoke is validated, audited and takes effect on the principal', async () => {
    const a = await as(USER.admin);
    await setCommunityStatus(a, ORG.atlas, 'revoked');
    expect((await as(USER.atMember)).communityApproved).toBe(false);
    expect(await getCommunityStatus(a, ORG.atlas)).toBe('revoked');
    await setCommunityStatus(a, ORG.atlas, 'approved');
    expect((await as(USER.atMember)).communityApproved).toBe(true);
    await expect(setCommunityStatus(a, ORG.atlas, 'pending')).rejects.toBeInstanceOf(InputError);
    expect((await audits('admin.community.set', 'ok')).length).toBe(2);
  });
});

describe('support authorisation: private client content needs an explicit, time-boxed, audited grant', () => {
  const reason = 'Investigating ticket about missing observation status';
  it('without an authorisation a portal admin sees nothing, and the attempt is audited as a denial', async () => {
    const a = await as(USER.admin);
    expect(await hasSupportAuthorisation(a, ORG.northwind)).toBe(false);
    expect(await canReadTenantPrivate(a, ORG.northwind)).toBe(false);
    await expect(getSupportSummary(a, ORG.northwind)).rejects.toBeInstanceOf(AuthzError);
    const denials = await audits('support.access', 'deny');
    expect(denials.some((d) => d.actorId === USER.admin && d.orgId === ORG.northwind)).toBe(true);
    expect((await audits('support.access', 'ok')).length).toBe(0);
  });
  it('reason is mandatory and the duration is bounded; unknown orgs are refused', async () => {
    const a = await as(USER.admin);
    await expect(createSupportAuthorisation(a, { orgId: ORG.northwind, reason: '', hours: 4 })).rejects.toBeInstanceOf(InputError);
    await expect(createSupportAuthorisation(a, { orgId: ORG.northwind, reason: 'too short', hours: 4 })).rejects.toBeInstanceOf(InputError);
    await expect(createSupportAuthorisation(a, { orgId: ORG.northwind, reason, hours: 9999 })).rejects.toBeInstanceOf(InputError);
    await expect(createSupportAuthorisation(a, { orgId: ORG.azentio, reason, hours: 4 })).rejects.toBeInstanceOf(InputError);
    await expect(createSupportAuthorisation(a, { orgId: 'org_nope', reason, hours: 4 })).rejects.toBeInstanceOf(InputError);
    expect((await listSupportAuthorisations(a)).length).toBe(0);
  });
  it('with an authorisation: summary only (titles of submitted items, counts), audited, org-scoped, and no draft titles or bodies', async () => {
    const a = await as(USER.admin);
    const row = await createSupportAuthorisation(a, { orgId: ORG.northwind, reason, hours: 1 });
    expect(await hasSupportAuthorisation(a, ORG.northwind)).toBe(true);
    const s = await getSupportSummary(a, ORG.northwind);
    expect(s.org.id).toBe(ORG.northwind);
    expect(s.contributionTitles.map((t) => t.title)).toContain('Submitted gap title');
    expect(s.contributionTitles.some((t) => t.status === 'draft')).toBe(false);
    const draftTitles = (await db.select({ t: schema.contributions.title }).from(schema.contributions).where(and(eq(schema.contributions.orgId, ORG.northwind), eq(schema.contributions.status, 'draft')))).map((r) => r.t);
    expect(draftTitles).toContain('SECRET DRAFT TITLE');
    for (const t of draftTitles) expect(JSON.stringify(s)).not.toContain(t); // drafts are counted, never named
    expect(s.counts.contributionsByStatus.draft).toBe(draftTitles.length);
    expect(s.counts.contributionsByStatus.submitted).toBeGreaterThanOrEqual(1);
    const blob = JSON.stringify(s);
    for (const secret of ['SECRET', 'Customer 4411', 'Harbor only title', USER.nwMember]) expect(blob).not.toContain(secret);
    const ok = (await audits('support.access', 'ok')).filter((e) => e.resourceId === ORG.northwind);
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ actorId: USER.admin, orgId: ORG.northwind });
    // the authorisation is for ONE org only
    await expect(getSupportSummary(a, ORG.harbor)).rejects.toBeInstanceOf(AuthzError);
    // and only for the admin who created it
    const b = await secondAdmin();
    await db.update(schema.grants).set({ revokedAt: null }).where(eq(schema.grants.id, 'grt_admin2'));
    await expect(getSupportSummary(await as('usr_admin2'), ORG.northwind)).rejects.toBeInstanceOf(AuthzError);
    expect(b.userId).toBe('usr_admin2');
    // client admins of that org were told
    const n = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, USER.nwAdmin));
    expect(n.some((x) => x.kind === 'support_access' && x.dedupeKey === `support-auth:${row.id}:${USER.nwAdmin}`)).toBe(true);
    expect(n.some((x) => x.emailStatus !== 'none')).toBe(false);
    // revoke ends access
    await revokeSupportAuthorisation(a, row.id);
    await expect(getSupportSummary(a, ORG.northwind)).rejects.toBeInstanceOf(AuthzError);
    await expect(revokeSupportAuthorisation(a, row.id)).rejects.toBeInstanceOf(InputError);
    expect((await listSupportAuthorisations(a))[0].state).toBe('revoked');
  });
  it('an expired authorisation grants nothing', async () => {
    const a = await as(USER.admin);
    const row = await createSupportAuthorisation(a, { orgId: ORG.harbor, reason, hours: 4 });
    await getSupportSummary(a, ORG.harbor);
    await db.update(schema.supportAuthorisations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.supportAuthorisations.id, row.id));
    await expect(getSupportSummary(a, ORG.harbor)).rejects.toBeInstanceOf(AuthzError);
    expect((await listSupportAuthorisations(a)).find((x) => x.id === row.id)!.state).toBe('expired');
  });
  it('an employee with a forged authorisation row but no portal_admin grant still gets nothing', async () => {
    await db.insert(schema.supportAuthorisations).values({ adminId: USER.moderator, orgId: ORG.northwind, reason: 'forged row for a non-admin', expiresAt: new Date(Date.now() + 3600_000) });
    const m = await as(USER.moderator);
    expect(await hasSupportAuthorisation(m, ORG.northwind)).toBe(false);
    await expect(getSupportSummary(m, ORG.northwind)).rejects.toBeInstanceOf(AuthzError);
  });
});

describe('audit viewer, leads, config', () => {
  it('filters by action, actor, outcome and date; paginates; escapes wildcards; ignores bad filters', async () => {
    const a = await as(USER.admin);
    const all = await listAudit(a, {});
    expect(all.total).toBeGreaterThan(10);
    expect(all.rows.length).toBeLessThanOrEqual(25);
    expect(all.rows[0].at.getTime()).toBeGreaterThanOrEqual(all.rows.at(-1)!.at.getTime());
    const denies = await listAudit(a, { outcome: 'deny' });
    expect(denies.rows.length).toBeGreaterThan(0);
    expect(denies.rows.every((r) => r.outcome === 'deny')).toBe(true);
    const grants = await listAudit(a, { action: 'admin.grant' });
    expect(grants.rows.every((r) => r.action.startsWith('admin.grant'))).toBe(true);
    const byActor = await listAudit(a, { actor: 'moderator@azentio.com', outcome: 'deny' });
    expect(byActor.rows.length).toBeGreaterThan(0);
    expect(byActor.rows.every((r) => r.actorEmail === 'moderator@azentio.com')).toBe(true);
    const today = new Date().toISOString().slice(0, 10);
    expect((await listAudit(a, { from: today, to: today })).total).toBe(all.total);
    expect((await listAudit(a, { to: '2001-01-01' })).total).toBe(0);
    expect((await listAudit(a, { action: '%' })).total).toBe(0); // wildcard is a literal, not a match-all
    expect((await listAudit(a, { outcome: "ok' or 1=1 --", from: 'garbage' })).total).toBe(all.total); // invalid filters are dropped
    const p2 = await listAudit(a, { page: '2' });
    expect(p2.page).toBe(2);
    expect(p2.rows.map((r) => r.id)).not.toEqual(all.rows.map((r) => r.id));
    expect((await listAudit(a, { page: '99999' })).rows).toEqual([]);
  });
  it('viewing leads is audited and paginated; kind filter validated', async () => {
    await db.insert(schema.leads).values([{ kind: 'demo', name: 'Lee Lead', email: 'lee@example.com', message: 'Hi' }, { kind: 'hackathon', name: 'Hana Hack', email: 'hana@example.com' }]);
    const a = await as(USER.admin);
    const r = await listLeads(a, {});
    expect(r.total).toBeGreaterThanOrEqual(2);
    expect((await listLeads(a, { kind: 'hackathon' })).rows.every((l) => l.kind === 'hackathon')).toBe(true);
    expect((await listLeads(a, { kind: 'bogus' })).total).toBe(r.total);
    expect((await audits('admin.leads.view', 'ok')).length).toBe(3);
  });
  it('config reports flags but never secrets', async () => {
    process.env.RESEND_API_KEY = 're_SECRET_VALUE_123';
    try {
      const c = await getConfig(await as(USER.admin));
      expect(c).toMatchObject({ demoMode: true, minCohortOrgs: 3, emailProviderConfigured: true });
      expect(JSON.stringify(c)).not.toContain('re_SECRET');
      expect(JSON.stringify(c)).not.toContain(process.env.AUTH_SECRET!);
    } finally {
      delete process.env.RESEND_API_KEY;
    }
    expect((await getConfig(await as(USER.admin))).emailProviderConfigured).toBe(false);
  });
});

describe('review fixes: admin invitations and last-admin guard', () => {
  it('portal admin can onboard the first client administrator by invitation; the invitee becomes eligible and non-admins are refused', async () => {
    const { inviteToOrg, listOrgInvitations, revokeOrgInvitation } = await import('@/lib/admin/orgs');
    const { previewInvitation } = await import('@/lib/auth/invitations');
    const admin = await as(USER.admin);
    const org = await createOrg(admin, { name: 'Invite Bank' });
    const r = await inviteToOrg(admin, { orgId: org.id, email: 'First.Admin@invitebank.example', role: 'client_admin' }, 'http://localhost:3000');
    expect(r.link).toMatch(/^http:\/\/localhost:3000\/invite\//);
    expect(await isEligibleEmail('first.admin@invitebank.example')).toBe(true);
    const prev = await previewInvitation(r.link.split('/invite/')[1]);
    expect(prev?.orgId).toBe(org.id);
    expect(prev?.role).toBe('client_admin');
    expect((await listOrgInvitations(admin, org.id)).map((i) => i.email)).toEqual(['first.admin@invitebank.example']);
    await expect(inviteToOrg(admin, { orgId: org.id, email: 'x@invitebank.example', role: 'portal_admin' }, 'http://x')).rejects.toBeInstanceOf(AuthzError);
    await expect(inviteToOrg(admin, { orgId: org.id, email: 'someone@azentio.com', role: 'client_member' }, 'http://x')).rejects.toBeInstanceOf(AuthzError);
    await expect(inviteToOrg(admin, { orgId: 'org_nope', email: 'x@invitebank.example', role: 'client_member' }, 'http://x')).rejects.toBeInstanceOf(InputError);
    for (const id of NON_ADMINS) await expect(inviteToOrg(await as(id), { orgId: org.id, email: 'y@invitebank.example', role: 'client_admin' }, 'http://x')).rejects.toBeInstanceOf(AuthzError);
    await revokeOrgInvitation(admin, (await listOrgInvitations(admin, org.id))[0].id);
    expect(await isEligibleEmail('first.admin@invitebank.example')).toBe(false);
  });

  it('two admins retiring each other via the allowlist concurrently cannot leave zero portal administrators', async () => {
    const admin = await as(USER.admin);
    const second = await secondAdmin();
    await Promise.allSettled([revokeAllowlist(admin, second.email), revokeAllowlist(second, admin.email)]);
    const left = await db.select().from(schema.grants).where(eq(schema.grants.permission, 'portal_admin'));
    expect(left.some((g) => g.revokedAt === null)).toBe(true);
  });
});

describe('review fixes: feedback summary', () => {
  it('owners see comments on their own items; others see only tallies', async () => {
    const { feedbackSummary } = await import('@/lib/employee/items');
    const owner = await as(USER.publisher);
    const other = await as(USER.employee);
    const mine = await feedbackSummary(owner, 'knowledge');
    const theirs = await feedbackSummary(other, 'knowledge');
    expect([...mine.owned.values()].flat().length).toBeGreaterThan(0);
    expect(theirs.owned.size).toBe(0);
    expect(theirs.tallies.size).toBeGreaterThan(0);
  });
});
