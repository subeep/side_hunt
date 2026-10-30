import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { as, USER, ORG } from './helpers/principals';
import { makeOrg } from './client-fixtures';
import { DEMO_INVITE_TOKEN } from '@/db/seed/client';
import { requestLoginCode, verifyLoginCode, isEligibleEmail } from '@/lib/auth/login';
import { previewInvitation, createInvitation } from '@/lib/auth/invitations';
import { hashToken } from '@/lib/crypto';
import { acceptInviteWithTerms, resolveInvite } from '@/lib/client/invite';
import { CURRENT_TERMS_VERSION, hasAcceptedTerms, recordTermsAcceptance } from '@/lib/client/terms';

const membershipsOf = (userId: string) => db.select().from(schema.memberships).where(eq(schema.memberships.userId, userId));
async function loginAs(email: string) {
  const code = '424242';
  await db.insert(schema.loginCodes).values({ email, codeHash: hashToken(`${email}:${code}`), expiresAt: new Date(Date.now() + 60_000) });
  const id = await verifyLoginCode(email, code);
  expect(id).toBeTruthy();
  return id!;
}

describe('first-time journey with the seeded demo invitation', () => {
  it('is pending, tied to Northwind and the invited email, and stored only as a hash', async () => {
    const inv = await previewInvitation(DEMO_INVITE_TOKEN);
    expect(inv).toMatchObject({ email: 'newperson@northwind.example', role: 'client_member', orgId: ORG.northwind });
    const [row] = await db.select().from(schema.invitations).where(eq(schema.invitations.id, 'inv_demo_northwind'));
    expect(row.tokenHash).toBe(hashToken(DEMO_INVITE_TOKEN));
    expect(row.invitedBy).toBe(USER.nwAdmin);
    expect(JSON.stringify(row)).not.toContain(DEMO_INVITE_TOKEN);
    expect(await resolveInvite(DEMO_INVITE_TOKEN, null)).toMatchObject({ state: 'anonymous', orgName: 'Northwind Credit Union' });
  });
  it('walks the whole journey: eligible login, preview, terms acknowledgement required, accept, single use', async () => {
    expect(await isEligibleEmail('newperson@northwind.example')).toBe(true); // a pending invitation makes the email eligible
    const r = await requestLoginCode('newperson@northwind.example', '9.9.9.9');
    expect(r.demoCode).toMatch(/^\d{6}$/); // seeded demo persona in DEMO_MODE: judges can sign in
    const uid = await verifyLoginCode('newperson@northwind.example', r.demoCode!);
    expect(uid).toBe('usr_newperson');
    const before = await as(uid!);
    expect(before.memberships).toEqual([]); // signing in created no tenant membership
    expect(await resolveInvite(DEMO_INVITE_TOKEN, before)).toMatchObject({ state: 'ready', orgName: 'Northwind Credit Union', role: 'client_member' });

    const refused = await acceptInviteWithTerms(before, DEMO_INVITE_TOKEN, false);
    expect(refused.ok).toBe(false);
    expect(await previewInvitation(DEMO_INVITE_TOKEN)).not.toBeNull(); // not consumed without the acknowledgement
    expect(await membershipsOf(uid!)).toHaveLength(0);

    const done = await acceptInviteWithTerms(before, DEMO_INVITE_TOKEN, true);
    expect(done).toEqual({ ok: true, orgId: ORG.northwind });
    const after = await as(uid!);
    expect(after.activeOrgId).toBe(ORG.northwind);
    expect(after.activeOrgRole).toBe('client_member');
    expect(after.entitlements.has('credit-strategy-simulator')).toBe(true);
    expect(after.entitlements.has('riva')).toBe(false);
    const [t] = await db.select().from(schema.termsAcceptances).where(and(eq(schema.termsAcceptances.userId, uid!), eq(schema.termsAcceptances.orgId, ORG.northwind)));
    expect(t).toMatchObject({ termsVersion: CURRENT_TERMS_VERSION, learningExplained: true });
    expect(await hasAcceptedTerms(uid!, ORG.northwind)).toBe(true);
    // consent to share/train is NOT created by joining
    expect(await db.select().from(schema.contributionConsents).where(eq(schema.contributionConsents.userId, uid!))).toHaveLength(0);

    // single use
    expect((await acceptInviteWithTerms(after, DEMO_INVITE_TOKEN, true)).ok).toBe(false);
    expect(await resolveInvite(DEMO_INVITE_TOKEN, after)).toEqual({ state: 'invalid' });
    expect(await resolveInvite(DEMO_INVITE_TOKEN, null)).toEqual({ state: 'invalid' });
    expect(await membershipsOf(uid!)).toHaveLength(1);
  });
});

describe('invitation refusal paths', () => {
  const mint = async (o: Awaited<ReturnType<typeof makeOrg>>, email: string, role: 'client_member' | 'client_admin' = 'client_member') => {
    const admin = await o.as(o.admins[0].userId);
    const { link } = await createInvitation(admin, { email, role }, 'http://x');
    return link.split('/invite/')[1];
  };
  it('a different signed-in email is refused, creates no membership, and does not burn the invitation', async () => {
    const o = await makeOrg({ name: 'Wrong Email Org' });
    const token = await mint(o, 'intended@wrong.example');
    const intruder = await as(USER.hbMember);
    expect(await resolveInvite(token, intruder)).toEqual({ state: 'wrong_email' });
    const res = await acceptInviteWithTerms(intruder, token, true);
    expect(res.ok).toBe(false);
    expect((await membershipsOf(USER.hbMember)).map((m) => m.orgId)).toEqual([ORG.harbor]);
    const uid = await loginAs('intended@wrong.example');
    expect((await acceptInviteWithTerms(await as(uid), token, true)).ok).toBe(true); // rightful owner still can
    const denied = (await db.select().from(schema.auditEvents)).filter((e) => e.action === 'invite.accept' && e.outcome === 'deny' && e.actorId === USER.hbMember);
    expect(denied.length).toBeGreaterThanOrEqual(1);
  });
  it('bad, empty, expired and revoked tokens are all the same generic "invalid"', async () => {
    const o = await makeOrg({ name: 'Lifecycle Org' });
    const expired = await mint(o, 'exp@life.example');
    await db.update(schema.invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.invitations.tokenHash, hashToken(expired)));
    const revoked = await mint(o, 'rev@life.example');
    await db.update(schema.invitations).set({ revokedAt: new Date() }).where(eq(schema.invitations.tokenHash, hashToken(revoked)));
    const live = await mint(o, 'live@life.example');
    const uid = await loginAs('live@life.example');
    const p = await as(uid);
    for (const t of ['', 'x', 'nonsense-token-nonsense', 'a'.repeat(500), expired, revoked, "'; drop table invitations;--"]) {
      expect(await resolveInvite(t, p), t.slice(0, 20)).toEqual({ state: 'invalid' });
      expect((await acceptInviteWithTerms(p, t, true)).ok).toBe(false);
    }
    expect(await membershipsOf(uid)).toHaveLength(0);
    expect((await resolveInvite(live, p)).state).toBe('ready');
  });
  it('an arbitrary external email gets no code, no membership, and cannot use anyone else\'s invitation', async () => {
    const o = await makeOrg({ name: 'Target Org' });
    const token = await mint(o, 'someone.else@target.example');
    expect(await isEligibleEmail('stranger@gmail.example')).toBe(false);
    expect((await requestLoginCode('stranger@gmail.example', '8.8.8.8')).demoCode).toBeUndefined();
    expect(await verifyLoginCode('stranger@gmail.example', '123456')).toBeNull();
    // even if they obtain an account (e.g. verified some other way), no membership appears and the token does not work for them
    const uid = await loginAs('stranger2@gmail.example');
    const p = await as(uid);
    expect(p.memberships).toEqual([]);
    expect(await resolveInvite(token, p)).toEqual({ state: 'wrong_email' });
    expect((await acceptInviteWithTerms(p, token, true)).ok).toBe(false);
    expect(await membershipsOf(uid)).toHaveLength(0);
    expect(await db.select().from(schema.termsAcceptances).where(eq(schema.termsAcceptances.userId, uid))).toHaveLength(0);
  });
  it('an administrator invitation grants client_admin only, in the inviting org only', async () => {
    const o = await makeOrg({ name: 'Admin Invite Org' });
    const token = await mint(o, 'boss@admininvite.example', 'client_admin');
    const uid = await loginAs('boss@admininvite.example');
    expect((await acceptInviteWithTerms(await as(uid), token, true)).ok).toBe(true);
    const p = await as(uid);
    expect(p.activeOrgRole).toBe('client_admin');
    expect(p.activeOrgId).toBe(o.orgId);
    expect(p.isEmployee).toBe(false);
    expect(p.grants.size).toBe(0);
    expect(p.memberships).toHaveLength(1);
  });
});

describe('terms gate', () => {
  it('seeded personas have acknowledged the current terms, except the deliberate Atlas member', async () => {
    expect(await hasAcceptedTerms(USER.nwMember, ORG.northwind)).toBe(true);
    expect(await hasAcceptedTerms(USER.hbAdmin, ORG.harbor)).toBe(true);
    expect(await hasAcceptedTerms(USER.atMember, ORG.atlas)).toBe(false); // demonstrates the redirect to /client/terms
  });
  it('acknowledgement is per person, per workspace and per version, and idempotent', async () => {
    expect(await hasAcceptedTerms(USER.nwMember, ORG.harbor)).toBe(false); // not a member there, never accepted
    expect(await hasAcceptedTerms(USER.nwAdmin, ORG.northwind)).toBe(true);
    expect(await hasAcceptedTerms(USER.atAdmin, ORG.northwind)).toBe(false);
    await recordTermsAcceptance(USER.atMember, ORG.atlas, 'terms_page');
    await recordTermsAcceptance(USER.atMember, ORG.atlas, 'terms_page');
    expect(await hasAcceptedTerms(USER.atMember, ORG.atlas)).toBe(true);
    expect(await db.select().from(schema.termsAcceptances).where(and(eq(schema.termsAcceptances.userId, USER.atMember), eq(schema.termsAcceptances.orgId, ORG.atlas)))).toHaveLength(1);
    const [e] = (await db.select().from(schema.auditEvents)).filter((a) => a.action === 'terms.accept' && a.actorId === USER.atMember);
    expect(e.meta).toMatchObject({ version: CURRENT_TERMS_VERSION, via: 'terms_page' });
    // an older version does not satisfy the gate
    await db.delete(schema.termsAcceptances).where(and(eq(schema.termsAcceptances.userId, USER.atMember), eq(schema.termsAcceptances.orgId, ORG.atlas)));
    await db.insert(schema.termsAcceptances).values({ userId: USER.atMember, orgId: ORG.atlas, termsVersion: '2025-01', learningExplained: true });
    expect(await hasAcceptedTerms(USER.atMember, ORG.atlas)).toBe(false);
  });
  it('a multi-membership user acknowledges each workspace separately', async () => {
    const o = await makeOrg({ name: 'Third Workspace', members: 0 });
    await db.insert(schema.memberships).values({ userId: USER.multi, orgId: o.orgId, role: 'client_member' });
    expect(await hasAcceptedTerms(USER.multi, ORG.northwind)).toBe(true);
    expect(await hasAcceptedTerms(USER.multi, o.orgId)).toBe(false);
  });
});
