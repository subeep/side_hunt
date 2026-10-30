import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { as, USER, ORG } from './helpers/principals';
import { makeOrg, denies } from './client-fixtures';
import * as A from '@/lib/client/admin';
import { previewInvitation } from '@/lib/auth/invitations';
import { hashToken } from '@/lib/crypto';

const BASE = 'http://portal.test';
const roleOf = async (membershipId: string) => (await db.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId)))[0];
const failed = (r: { ok: boolean }) => expect(r.ok).toBe(false);

describe('invitations', () => {
  it('a client admin invites into the active org with an honest email status and a single-use link', async () => {
    const o = await makeOrg({ members: 0 });
    const p = await o.as(o.admins[0].userId);
    const res = await A.inviteMember(p, { email: ' New.Colleague@Test.example ', role: 'client_member' }, BASE);
    expect(res.ok).toBe(true);
    const { link, emailStatus } = res as { link: string; emailStatus: string };
    expect(link.startsWith(`${BASE}/invite/`)).toBe(true);
    expect(['queued', 'sent', 'failed']).toContain(emailStatus);
    expect(emailStatus).not.toBe('delivered');
    const list = await A.listInvitations(p);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ email: 'new.colleague@test.example', role: 'client_member', state: 'pending', emailStatus });
    const token = link.split('/invite/')[1];
    expect((await previewInvitation(token))?.orgId).toBe(o.orgId);
    // raw token is never stored
    const [row] = await db.select().from(schema.invitations).where(eq(schema.invitations.orgId, o.orgId));
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });
  it('rejects duplicates, existing members, staff addresses and bad input', async () => {
    const o = await makeOrg({ members: 1 });
    const p = await o.as(o.admins[0].userId);
    expect((await A.inviteMember(p, { email: 'dup@test.example', role: 'client_member' }, BASE)).ok).toBe(true);
    failed(await A.inviteMember(p, { email: 'dup@test.example', role: 'client_admin' }, BASE));
    const [mem] = await db.select().from(schema.users).where(eq(schema.users.id, o.members[0].userId));
    failed(await A.inviteMember(p, { email: mem.email, role: 'client_member' }, BASE));
    failed(await A.inviteMember(p, { email: 'someone@azentio.com', role: 'client_member' }, BASE));
    failed(await A.inviteMember(p, { email: 'not-an-email', role: 'client_member' }, BASE));
    failed(await A.inviteMember(p, { email: 'x@test.example' }, BASE));
    expect(await A.listInvitations(p)).toHaveLength(1);
  });
  it('escalation attempts are refused server-side and audited: platform roles and forged org ids', async () => {
    const o = await makeOrg();
    const other = await makeOrg({ name: 'Other' });
    const p = await o.as(o.admins[0].userId);
    for (const role of ['employee', 'portal_admin', 'learning_moderator', 'content_publisher', 'video_publisher', 'product_owner', 'client_viewer', '', 'CLIENT_ADMIN', ['client_admin']]) {
      const r = await A.inviteMember(p, { email: 'esc@test.example', role }, BASE);
      expect(r.ok, String(role)).toBe(false);
    }
    failed(await A.inviteMember(p, { email: 'esc@test.example', role: 'client_member', orgId: other.orgId }, BASE)); // forged tenant
    failed(await A.inviteMember(p, { email: 'esc@test.example', role: 'client_member', orgId: ORG.azentio }, BASE));
    failed(await A.inviteMember(p, { email: 'esc@test.example', role: 'client_member', orgId: ['x'] }, BASE));
    expect(await db.select().from(schema.invitations).where(eq(schema.invitations.email, 'esc@test.example'))).toHaveLength(0);
    const d = await denies('invite.create', o.admins[0].userId);
    expect(d.length).toBeGreaterThanOrEqual(10);
    expect(d.some((e) => (e.meta as { claimedRole?: string }).claimedRole === 'portal_admin')).toBe(true);
    expect(d.some((e) => (e.meta as { claimedOrgId?: string }).claimedOrgId === other.orgId)).toBe(true);
    // a forged-but-matching org id carries no extra authority and is harmless
    expect((await A.inviteMember(p, { email: 'ok@test.example', role: 'client_member', orgId: o.orgId }, BASE)).ok).toBe(true);
    const [inv] = await db.select().from(schema.invitations).where(eq(schema.invitations.email, 'ok@test.example'));
    expect(inv.orgId).toBe(o.orgId);
  });
  it('members and multi-membership users without a workspace cannot invite or even list', async () => {
    const o = await makeOrg();
    const m = await o.as(o.members[0].userId);
    failed(await A.inviteMember(m, { email: 'a@test.example', role: 'client_member' }, BASE));
    expect(await A.listInvitations(m)).toEqual([]);
    expect(await A.listMembers(m)).toEqual([]);
    expect((await denies('invite.create', o.members[0].userId)).length).toBe(1);
    failed(await A.inviteMember(await as(USER.multi), { email: 'a@test.example', role: 'client_member' }, BASE));
    failed(await A.inviteMember(await as(USER.employee), { email: 'a@test.example', role: 'client_member' }, BASE));
    failed(await A.inviteMember(await as(USER.admin), { email: 'a@test.example', role: 'client_member' }, BASE)); // portal admin is not a client admin
  });
  it('states: pending, accepted, expired, revoked; revoke is org-scoped and audited', async () => {
    const o = await makeOrg();
    const other = await makeOrg({ name: 'Other' });
    const p = await o.as(o.admins[0].userId);
    const q = await other.as(other.admins[0].userId);
    const i1 = (await A.inviteMember(p, { email: 'one@test.example', role: 'client_member' }, BASE)) as { link: string };
    await A.inviteMember(p, { email: 'two@test.example', role: 'client_member' }, BASE);
    await A.inviteMember(p, { email: 'three@test.example', role: 'client_admin' }, BASE);
    const rows = await A.listInvitations(p);
    const id = (e: string) => rows.find((r) => r.email === e)!.id;
    await db.update(schema.invitations).set({ usedAt: new Date(), usedBy: 'x' }).where(eq(schema.invitations.id, id('two@test.example')));
    await db.update(schema.invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.invitations.id, id('three@test.example')));
    expect(Object.fromEntries((await A.listInvitations(p)).map((r) => [r.email, r.state]))).toEqual({ 'one@test.example': 'pending', 'two@test.example': 'accepted', 'three@test.example': 'expired' });
    // another org's admin cannot revoke it (and the attempt is audited)
    failed(await A.revokeInvite(q, { invitationId: id('one@test.example') }));
    expect((await denies('invite.revoke', other.admins[0].userId)).length).toBe(1);
    expect((await previewInvitation(i1.link.split('/invite/')[1]))?.orgId).toBe(o.orgId);
    failed(await A.revokeInvite(p, { invitationId: id('two@test.example') })); // already used
    failed(await A.revokeInvite(p, { invitationId: 'inv_nope' }));
    failed(await A.revokeInvite(p, { invitationId: id('one@test.example'), orgId: other.orgId })); // forged org field
    expect((await A.revokeInvite(p, { invitationId: id('one@test.example') })).ok).toBe(true);
    expect((await A.listInvitations(p)).find((r) => r.email === 'one@test.example')?.state).toBe('revoked');
    expect(await previewInvitation(i1.link.split('/invite/')[1])).toBeNull();
    expect(A.invitationState({ usedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 5000) })).toBe('pending');
  });
});

describe('role changes', () => {
  it('toggles client_member <-> client_admin within the org only, and is audited', async () => {
    const o = await makeOrg({ admins: 2, members: 1 });
    const p = await o.as(o.admins[0].userId);
    const mem = o.members[0];
    expect((await A.changeMemberRole(p, { membershipId: mem.membershipId, role: 'client_admin' })).ok).toBe(true);
    expect((await roleOf(mem.membershipId)).role).toBe('client_admin');
    expect((await A.changeMemberRole(p, { membershipId: mem.membershipId, role: 'client_member' })).ok).toBe(true);
    expect((await roleOf(mem.membershipId)).role).toBe('client_member');
    const ev = (await db.select().from(schema.auditEvents)).filter((e) => e.action === 'member.change_role' && e.actorId === o.admins[0].userId && e.outcome === 'ok');
    expect(ev).toHaveLength(2);
    expect(ev[0].meta).toMatchObject({ from: 'client_member', to: 'client_admin' });
    expect((await A.listMembers(p)).map((m) => m.role).sort()).toEqual(['client_admin', 'client_admin', 'client_member']);
  });
  it('platform roles, unknown roles and forged org ids are refused and audited; nothing changes', async () => {
    const o = await makeOrg({ admins: 2, members: 1 });
    const other = await makeOrg({ name: 'Other', members: 1 });
    const p = await o.as(o.admins[0].userId);
    const mem = o.members[0];
    for (const role of ['employee', 'portal_admin', 'learning_moderator', 'content_publisher', 'video_publisher', 'product_owner', 'root', '']) failed(await A.changeMemberRole(p, { membershipId: mem.membershipId, role }));
    failed(await A.changeMemberRole(p, { membershipId: mem.membershipId, role: 'client_admin', orgId: other.orgId }));
    expect((await roleOf(mem.membershipId)).role).toBe('client_member');
    expect((await denies('member.change_role', o.admins[0].userId)).length).toBeGreaterThanOrEqual(8);
    // a plain member cannot promote anyone, including themselves
    const m = await o.as(mem.userId);
    failed(await A.changeMemberRole(m, { membershipId: mem.membershipId, role: 'client_admin' }));
    expect((await roleOf(mem.membershipId)).role).toBe('client_member');
  });
  it('cannot touch another org\'s members, employees or platform memberships', async () => {
    const o = await makeOrg({ admins: 1, members: 0 });
    const other = await makeOrg({ name: 'Other', members: 1 });
    const p = await o.as(o.admins[0].userId);
    failed(await A.changeMemberRole(p, { membershipId: other.members[0].membershipId, role: 'client_admin' }));
    failed(await A.revokeMember(p, { membershipId: other.admins[0].membershipId }));
    expect((await roleOf(other.members[0].membershipId)).role).toBe('client_member');
    expect((await roleOf(other.admins[0].membershipId)).status).toBe('active');
    // seeded Northwind / employee memberships by id
    const rows = await db.select().from(schema.memberships);
    const emp = rows.find((r) => r.userId === USER.admin && r.orgId === ORG.azentio)!;
    const nw = rows.find((r) => r.userId === USER.nwMember)!;
    failed(await A.changeMemberRole(p, { membershipId: emp.id, role: 'client_member' }));
    failed(await A.revokeMember(p, { membershipId: emp.id }));
    failed(await A.changeMemberRole(p, { membershipId: nw.id, role: 'client_admin' }));
    expect((await db.select().from(schema.memberships).where(eq(schema.memberships.id, emp.id)))[0]).toMatchObject({ role: 'employee', status: 'active' });
    expect((await roleOf(nw.id)).role).toBe('client_member');
    failed(await A.changeMemberRole(p, { membershipId: '', role: 'client_admin' }));
    expect((await denies('member.change_role', o.admins[0].userId)).length).toBeGreaterThanOrEqual(3);
    expect((await denies('member.revoke', o.admins[0].userId)).length).toBe(2);
  });
  it('the last administrator can never be demoted', async () => {
    const o = await makeOrg({ admins: 1, members: 1 });
    const p = await o.as(o.admins[0].userId);
    const r = await A.changeMemberRole(p, { membershipId: o.admins[0].membershipId, role: 'client_member' });
    failed(r);
    expect((r as { error: string }).error).toMatch(/at least one administrator/);
    expect((await roleOf(o.admins[0].membershipId)).role).toBe('client_admin');
    // promote someone else first, then the original may step down, and then the remaining one is protected
    expect((await A.changeMemberRole(p, { membershipId: o.members[0].membershipId, role: 'client_admin' })).ok).toBe(true);
    expect((await A.changeMemberRole(p, { membershipId: o.admins[0].membershipId, role: 'client_member' })).ok).toBe(true);
    const p2 = await o.as(o.members[0].userId);
    failed(await A.changeMemberRole(p2, { membershipId: o.members[0].membershipId, role: 'client_member' }));
    expect((await roleOf(o.members[0].membershipId)).role).toBe('client_admin');
    expect((await denies('member.change_role', o.admins[0].userId)).length).toBe(1);
  });
});

describe('membership revocation', () => {
  it('revokes a member (they lose the workspace immediately) and keeps the last admin', async () => {
    const o = await makeOrg({ admins: 1, members: 1 });
    const p = await o.as(o.admins[0].userId);
    expect((await as(o.members[0].userId)).memberships.some((m) => m.orgId === o.orgId)).toBe(true);
    expect((await A.revokeMember(p, { membershipId: o.members[0].membershipId })).ok).toBe(true);
    const row = await roleOf(o.members[0].membershipId);
    expect(row.status).toBe('revoked');
    expect(row.revokedAt).toBeTruthy();
    expect((await as(o.members[0].userId, o.orgId)).activeOrgId).toBeNull();
    failed(await A.revokeMember(p, { membershipId: o.members[0].membershipId })); // already revoked
    const last = await A.revokeMember(p, { membershipId: o.admins[0].membershipId }); // removing yourself as the last admin
    failed(last);
    expect((last as { error: string }).error).toMatch(/last administrator/);
    expect((await roleOf(o.admins[0].membershipId)).status).toBe('active');
    expect((await denies('member.revoke', o.admins[0].userId)).length).toBe(1);
    expect((await A.listMembers(p)).find((m) => m.userId === o.members[0].userId)?.status).toBe('revoked');
  });
  it('an admin may step down when another admin exists; a member cannot revoke anyone', async () => {
    const o = await makeOrg({ admins: 2, members: 1 });
    failed(await A.revokeMember(await o.as(o.members[0].userId), { membershipId: o.admins[0].membershipId }));
    expect((await roleOf(o.admins[0].membershipId)).status).toBe('active');
    const p = await o.as(o.admins[0].userId);
    expect((await A.revokeMember(p, { membershipId: o.admins[0].membershipId })).ok).toBe(true); // leaves admin #2
    failed(await A.revokeMember(await o.as(o.admins[1].userId), { membershipId: o.admins[1].membershipId })); // now the last one
    failed(await A.revokeMember(await o.as(o.admins[1].userId), { membershipId: o.members[0].membershipId, orgId: ORG.northwind })); // forged tenant
    expect((await roleOf(o.members[0].membershipId)).status).toBe('active');
  });
});

describe('entitlements are read-only for clients', () => {
  it('lists the org entitlements and exposes no way to change them', async () => {
    const p = await as(USER.hbAdmin);
    const ents = await A.listOrgEntitlements(p);
    expect(ents.filter((e) => e.entitled).map((e) => e.slug).sort()).toEqual(['riva', 'sme-credit-decisioning']);
    expect(Object.keys(A).filter((k) => /entitle/i.test(k)).sort()).toEqual(['listOrgEntitlements']); // no mutating entitlement function exists
    expect(await db.select().from(schema.entitlements).where(eq(schema.entitlements.orgId, ORG.harbor))).toHaveLength(2);
  });
  it('requesting access only raises a ticket (admins only, own org) and never enables anything', async () => {
    const o = await makeOrg({ admins: 1, members: 1, entitlements: [] });
    const p = await o.as(o.admins[0].userId);
    expect((await A.requestProductAccess(p, { productSlug: 'riva' })).ok).toBe(true);
    expect(await db.select().from(schema.entitlements).where(eq(schema.entitlements.orgId, o.orgId))).toHaveLength(0);
    const t = await db.select().from(schema.supportTickets).where(eq(schema.supportTickets.orgId, o.orgId));
    expect(t).toHaveLength(1);
    expect(t[0].subject).toContain('RIVA');
    expect((await db.select().from(schema.auditEvents)).some((e) => e.action === 'entitlement.request' && e.orgId === o.orgId && e.outcome === 'ok')).toBe(true);
    failed(await A.requestProductAccess(await o.as(o.members[0].userId), { productSlug: 'riva' }));
    failed(await A.requestProductAccess(p, { productSlug: 'nope' }));
    failed(await A.requestProductAccess(p, { productSlug: 'riva', orgId: ORG.harbor }));
    failed(await A.requestProductAccess(await as(USER.hbAdmin), { productSlug: 'riva' })); // already entitled
    expect((await denies('entitlement.request', o.members[0].userId)).length).toBe(1);
  });
  it('member lists are scoped to the active organisation', async () => {
    const nw = await A.listMembers(await as(USER.nwAdmin));
    expect(nw.map((m) => m.email).sort()).toEqual(['admin@northwind.example', 'member@northwind.example', 'multi@consultant.example']);
    expect((await A.listMembers(await as(USER.multi, ORG.harbor))).length).toBe(0); // multi is only a member in Harbor
  });
});
