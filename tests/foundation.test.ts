import { describe, expect, it } from 'vitest';
import { as, USER, ORG } from './helpers/principals';
import { authorize } from '@/lib/authz/policy';
import { canSeeAudience } from '@/lib/authz/audience';
import { requestLoginCode, verifyLoginCode, isEligibleEmail } from '@/lib/auth/login';
import { createInvitation, acceptInvitation } from '@/lib/auth/invitations';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';

describe('principals', () => {
  it('employee is employee, with only explicit grants', async () => {
    const e = await as(USER.employee);
    expect(e.isEmployee).toBe(true);
    expect([...e.grants]).toEqual([]);
    const a = await as(USER.admin);
    expect(a.grants.has('portal_admin')).toBe(true);
    expect(a.grants.has('learning_moderator')).toBe(false);
  });
  it('multi-membership user has no active workspace until chosen; bogus workspace ignored', async () => {
    expect((await as(USER.multi)).activeOrgId).toBeNull();
    expect((await as(USER.multi, ORG.atlas)).activeOrgId).toBeNull(); // not a member of atlas
    expect((await as(USER.multi, ORG.harbor)).activeOrgId).toBe(ORG.harbor);
  });
  it('single-membership client auto-selects their workspace and entitlements follow the ACTIVE org', async () => {
    const m = await as(USER.hbMember);
    expect(m.activeOrgId).toBe(ORG.harbor);
    expect(m.entitlements.has('riva')).toBe(true);
    expect(m.entitlements.has('credit-strategy-simulator')).toBe(false);
  });
});

describe('audience rule', () => {
  it('denies missing metadata; public must be explicit', async () => {
    const m = await as(USER.nwMember);
    expect(canSeeAudience(m, {})).toBe(false);
    expect(canSeeAudience(null, { kind: null })).toBe(false);
    expect(canSeeAudience(null, { kind: 'public' })).toBe(true);
  });
  it('employees-only is invisible to clients and anonymous', async () => {
    expect(canSeeAudience(await as(USER.employee), { kind: 'employees' })).toBe(true);
    expect(canSeeAudience(await as(USER.nwAdmin), { kind: 'employees' })).toBe(false);
    expect(canSeeAudience(null, { kind: 'employees' })).toBe(false);
  });
  it('org audience requires the ACTIVE workspace to match; employees get no implicit tenant access', async () => {
    const a = { kind: 'org' as const, orgId: ORG.northwind };
    expect(canSeeAudience(await as(USER.nwMember), a)).toBe(true);
    expect(canSeeAudience(await as(USER.hbMember), a)).toBe(false);
    expect(canSeeAudience(await as(USER.admin), a)).toBe(false);
    expect(canSeeAudience(await as(USER.multi, ORG.harbor), a)).toBe(false);
    expect(canSeeAudience(await as(USER.multi, ORG.northwind), a)).toBe(true);
  });
  it('product audience follows entitlements of the active org', async () => {
    const a = { kind: 'product' as const, product: 'riva' };
    expect(canSeeAudience(await as(USER.hbMember), a)).toBe(true);
    expect(canSeeAudience(await as(USER.nwMember), a)).toBe(false);
    expect(canSeeAudience(await as(USER.employee), a)).toBe(false);
  });
});

describe('policy', () => {
  it('grants are separate; employee implies nothing', async () => {
    const e = await as(USER.employee);
    for (const act of ['org.manage', 'grant.platform', 'content.publish', 'video.publish', 'learning.moderate', 'idea.manage', 'audit.view'] as const)
      expect(authorize(e, act).allow).toBe(false);
    expect(authorize(await as(USER.publisher), 'content.publish').allow).toBe(true);
    expect(authorize(await as(USER.publisher), 'learning.moderate').allow).toBe(false);
    expect(authorize(await as(USER.admin), 'learning.moderate').allow).toBe(false);
  });
  it('client admin may invite only client roles, only in their own active org', async () => {
    const a = await as(USER.nwAdmin);
    expect(authorize(a, 'invite.create', { role: 'client_member' }).allow).toBe(true);
    expect(authorize(a, 'invite.create', { role: 'employee' }).allow).toBe(false);
    expect(authorize(a, 'invite.create', { role: 'portal_admin' }).allow).toBe(false);
    expect(authorize(a, 'invite.create', { orgId: ORG.harbor, role: 'client_member' }).allow).toBe(false);
    expect(authorize(await as(USER.nwMember), 'invite.create', { role: 'client_member' }).allow).toBe(false);
  });
  it('sandbox requires entitlement in the active workspace', async () => {
    expect(authorize(await as(USER.hbMember), 'sandbox.use', { productSlug: 'riva' }).allow).toBe(true);
    expect(authorize(await as(USER.hbMember), 'sandbox.use', { productSlug: 'credit-strategy-simulator' }).allow).toBe(false);
  });
});

describe('login + invitations', () => {
  it('arbitrary external email is not eligible and gets no code', async () => {
    expect(await isEligibleEmail('stranger@gmail.example')).toBe(false);
    const r = await requestLoginCode('stranger@gmail.example', '1.1.1.1');
    expect(r.demoCode).toBeUndefined();
    expect(await verifyLoginCode('stranger@gmail.example', '123456')).toBeNull();
  });
  it('non-allowlisted @azentio.com address is not eligible', async () => {
    expect(await isEligibleEmail('intruder@azentio.com')).toBe(false);
  });
  it('code flow works for a demo persona and a wrong code fails', async () => {
    const r = await requestLoginCode('member@northwind.example', '2.2.2.2');
    expect(r.demoCode).toMatch(/^\d{6}$/);
    expect(await verifyLoginCode('member@northwind.example', '000000')).toBeNull();
    expect(await verifyLoginCode('member@northwind.example', r.demoCode!)).toBe(USER.nwMember);
    expect(await verifyLoginCode('member@northwind.example', r.demoCode!)).toBeNull(); // single use
  });
  it('invitation: single-use, email-bound, org-scoped', async () => {
    const admin = await as(USER.nwAdmin);
    const { link } = await createInvitation(admin, { email: 'New.Person@northwind.example', role: 'client_member' }, 'http://x');
    const token = link.split('/invite/')[1];
    expect(await isEligibleEmail('new.person@northwind.example')).toBe(true);
    const code = (await requestLoginCode('new.person@northwind.example', '3.3.3.3')).demoCode;
    expect(code).toBeUndefined(); // not a demo persona => never shown on screen
    // sign in as the invited user by crafting a code row directly
    const { hashToken } = await import('@/lib/crypto');
    await db.insert(schema.loginCodes).values({ email: 'new.person@northwind.example', codeHash: hashToken('new.person@northwind.example:424242'), expiresAt: new Date(Date.now() + 60000) });
    const uid = await verifyLoginCode('new.person@northwind.example', '424242');
    expect(uid).toBeTruthy();
    const before = await as(uid!);
    expect(before.memberships.length).toBe(0); // arbitrary verified email => no tenant membership automatically
    // wrong person cannot accept
    expect((await acceptInvitation(await as(USER.hbMember), token)).ok).toBe(false);
    const res = await acceptInvitation(before, token);
    expect(res).toEqual({ ok: true, orgId: ORG.northwind });
    expect((await acceptInvitation(before, token)).ok).toBe(false); // single use
    const after = await as(uid!);
    expect(after.activeOrgId).toBe(ORG.northwind);
    expect(after.memberships[0].role).toBe('client_member');
    const [m] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, uid!));
    expect(m.orgId).toBe(ORG.northwind);
  });
});
