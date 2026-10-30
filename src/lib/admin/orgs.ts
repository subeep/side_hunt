import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { EMPLOYEE_DOMAIN, INTERNAL_ORG_ID } from '../env';
import { hashToken, normaliseEmail } from '../crypto';
import { newInviteToken } from '../auth/login';
import { sendEmail } from '../email';
import { assertAction, deny, InputError, optText, parse, text } from '../employee/common';

/** Portal administration of organisations. Every function re-authorises (portal_admin) and audits; tenant ids here are lookup keys for an admin operating ON a tenant, never authority for tenant data. */
const ACT = (a: string) => `admin.${a}`;
export const CLIENT_ROLES = ['client_member', 'client_admin'] as const;

async function clientOrg(orgId: string) {
  const [o] = await db.select().from(schema.organisations).where(eq(schema.organisations.id, orgId));
  if (!o || o.kind !== 'client' || o.id === INTERNAL_ORG_ID) throw new InputError('Client organisation not found.');
  return o;
}

export async function listOrgs(p: Principal | null) {
  await assertAction(p, 'org.manage', ACT('org.list'));
  const rows = await db
    .select({ org: schema.organisations, community: schema.orgSettings.communityStatus, members: sql<number>`(select count(*)::int from memberships m where m.org_id = ${schema.organisations.id} and m.status = 'active')`, ents: sql<number>`(select count(*)::int from entitlements e where e.org_id = ${schema.organisations.id})` })
    .from(schema.organisations)
    .leftJoin(schema.orgSettings, eq(schema.orgSettings.orgId, schema.organisations.id))
    .orderBy(asc(schema.organisations.kind), asc(schema.organisations.name));
  return rows.map((r) => ({ ...r.org, community: r.community ?? 'none', members: r.members, entitlementCount: r.ents }));
}

export async function createOrg(p: Principal | null, raw: unknown) {
  await assertAction(p, 'org.manage', ACT('org.create'));
  const i = parse(z.object({ name: text(2, 80, 'Name'), industry: optText(60, 'Industry'), region: optText(60, 'Region') }), raw);
  const base = i.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'client';
  const [clash] = await db.select({ id: schema.organisations.id }).from(schema.organisations).where(eq(schema.organisations.slug, base));
  const slug = clash ? `${base}-${Date.now().toString(36).slice(-4)}` : base;
  const [org] = await db.insert(schema.organisations).values({ name: i.name, slug, kind: 'client', industry: i.industry, region: i.region }).returning();
  await db.insert(schema.orgSettings).values({ orgId: org.id, communityStatus: 'none' }).onConflictDoNothing();
  await audit({ actorId: p!.userId, action: ACT('org.create'), resourceType: 'organisation', resourceId: org.id, orgId: org.id });
  return org;
}

export async function setOrgStatus(p: Principal | null, orgId: string, status: unknown) {
  await assertAction(p, 'org.manage', ACT('org.status'));
  const s = parse(z.enum(['active', 'suspended']), status);
  await clientOrg(orgId); // the internal organisation can never be suspended
  await db.update(schema.organisations).set({ status: s }).where(eq(schema.organisations.id, orgId));
  await audit({ actorId: p!.userId, action: ACT('org.status'), resourceType: 'organisation', resourceId: orgId, orgId, meta: { status: s } });
}

export async function getOrg(p: Principal | null, orgId: string) {
  await assertAction(p, 'org.manage', ACT('org.view'));
  const [o] = await db.select().from(schema.organisations).where(eq(schema.organisations.id, orgId));
  return o ?? null;
}

// ---- members -----------------------------------------------------------------------------------------------------
export async function listMembers(p: Principal | null, orgId: string) {
  await assertAction(p, 'org.manage', ACT('member.list'));
  await clientOrg(orgId);
  return db
    .select({ id: schema.memberships.id, role: schema.memberships.role, status: schema.memberships.status, userId: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, orgId))
    .orderBy(asc(schema.users.email));
}

const roleSchema = z.enum(CLIENT_ROLES, { message: 'Role must be client_member or client_admin' });

/** Admins may only place EXISTING non-employee users into a client org, and only in a client role. */
export async function addMember(p: Principal | null, raw: unknown) {
  await assertAction(p, 'org.manage', ACT('member.add'));
  const i = parse(z.object({ orgId: z.string().min(1), email: z.string().email('Enter a valid email address'), role: z.string() }), raw);
  if (!roleSchema.safeParse(i.role).success) return deny(p, ACT('member.add'), 'only client roles can be assigned here', { orgId: i.orgId, meta: { role: i.role } });
  const role = i.role as (typeof CLIENT_ROLES)[number];
  const org = await clientOrg(i.orgId);
  const email = normaliseEmail(i.email);
  if (email.endsWith(EMPLOYEE_DOMAIN)) return deny(p, ACT('member.add'), 'employees cannot be client members', { orgId: org.id });
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!u || u.status !== 'active') throw new InputError('No active user with that email. Use "Invite someone new" to onboard a person who has no account yet.');
  const [m] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.userId, u.id), eq(schema.memberships.orgId, org.id)));
  if (m) await db.update(schema.memberships).set({ role, status: 'active', revokedAt: null }).where(eq(schema.memberships.id, m.id));
  else await db.insert(schema.memberships).values({ userId: u.id, orgId: org.id, role });
  await audit({ actorId: p!.userId, action: ACT('member.add'), resourceType: 'membership', resourceId: m?.id, orgId: org.id, meta: { userId: u.id, role } });
}

/**
 * Onboarding path for people who do not have an account yet (e.g. the FIRST client administrator of a new organisation):
 * the portal administrator issues a single-use, 7-day invitation into a client org, in a client role only. The invitee
 * accepts it after signing in with an emailed code (an unused invitation makes the address eligible). Email is stored in the
 * outbox, not necessarily sent, so the link is also returned for the admin to pass on.
 */
export async function inviteToOrg(p: Principal | null, raw: unknown, baseUrl: string) {
  await assertAction(p, 'org.manage', ACT('invite.create'));
  const i = parse(z.object({ orgId: z.string().min(1), email: z.string().trim().email('Enter a valid email address').max(200), role: z.string() }), raw);
  if (!roleSchema.safeParse(i.role).success) return deny(p, ACT('invite.create'), 'only client roles can be invited here', { orgId: i.orgId, meta: { role: i.role } });
  const role = i.role as (typeof CLIENT_ROLES)[number];
  const org = await clientOrg(i.orgId);
  if (org.status !== 'active') throw new InputError('Reactivate the organisation before inviting people.');
  const email = normaliseEmail(i.email);
  if (email.endsWith(EMPLOYEE_DOMAIN)) return deny(p, ACT('invite.create'), 'employees cannot be invited as client members', { orgId: org.id });
  const [existing] = await db.select({ id: schema.memberships.id }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(and(eq(schema.users.email, email), eq(schema.memberships.orgId, org.id), eq(schema.memberships.status, 'active')));
  if (existing) throw new InputError('That person is already an active member of this organisation.');
  const token = newInviteToken();
  const [inv] = await db.insert(schema.invitations).values({ orgId: org.id, email, role, tokenHash: hashToken(token), invitedBy: p!.userId, expiresAt: new Date(Date.now() + 7 * 86400_000) }).returning();
  const link = `${baseUrl}/invite/${token}`;
  const emailStatus = await sendEmail({ to: email, subject: `You're invited to ${org.name} on azentio.ai`, body: `Accept your single-use invitation (expires in 7 days): ${link}`, purpose: 'invitation', dedupeKey: `inv:${inv.id}` });
  await audit({ actorId: p!.userId, action: ACT('invite.create'), resourceType: 'invitation', resourceId: inv.id, orgId: org.id, meta: { role, emailStatus } });
  return { id: inv.id, link, emailStatus };
}

export async function listOrgInvitations(p: Principal | null, orgId: string) {
  await assertAction(p, 'org.manage', ACT('invite.list'));
  await clientOrg(orgId);
  return db
    .select({ id: schema.invitations.id, email: schema.invitations.email, role: schema.invitations.role, expiresAt: schema.invitations.expiresAt })
    .from(schema.invitations)
    .where(and(eq(schema.invitations.orgId, orgId), isNull(schema.invitations.usedAt), isNull(schema.invitations.revokedAt), gt(schema.invitations.expiresAt, new Date())))
    .orderBy(desc(schema.invitations.createdAt));
}

export async function revokeOrgInvitation(p: Principal | null, invitationId: string) {
  await assertAction(p, 'org.manage', ACT('invite.revoke'));
  const [inv] = await db.select({ id: schema.invitations.id, orgId: schema.invitations.orgId }).from(schema.invitations).where(eq(schema.invitations.id, invitationId));
  if (!inv) throw new InputError('Invitation not found.');
  await clientOrg(inv.orgId);
  const res = await db.update(schema.invitations).set({ revokedAt: new Date() }).where(and(eq(schema.invitations.id, invitationId), isNull(schema.invitations.usedAt))).returning({ id: schema.invitations.id });
  if (!res.length) throw new InputError('That invitation was already used.');
  await audit({ actorId: p!.userId, action: ACT('invite.revoke'), resourceType: 'invitation', resourceId: invitationId, orgId: inv.orgId });
}

async function clientMembership(id: string) {
  const [r] = await db.select({ m: schema.memberships, kind: schema.organisations.kind }).from(schema.memberships).innerJoin(schema.organisations, eq(schema.organisations.id, schema.memberships.orgId)).where(eq(schema.memberships.id, id));
  if (!r || r.kind !== 'client' || r.m.role === 'employee') throw new InputError('Membership not found.');
  return r.m;
}

export async function changeMemberRole(p: Principal | null, membershipId: string, role: unknown) {
  await assertAction(p, 'org.manage', ACT('member.role'));
  if (!roleSchema.safeParse(role).success) return deny(p, ACT('member.role'), 'only client_member and client_admin may be assigned', { resourceType: 'membership', resourceId: membershipId, meta: { role: String(role) } });
  const m = await clientMembership(membershipId);
  await db.update(schema.memberships).set({ role: role as (typeof CLIENT_ROLES)[number] }).where(eq(schema.memberships.id, m.id));
  await audit({ actorId: p!.userId, action: ACT('member.role'), resourceType: 'membership', resourceId: m.id, orgId: m.orgId, meta: { from: m.role, to: role } });
}

export async function revokeMember(p: Principal | null, membershipId: string) {
  await assertAction(p, 'org.manage', ACT('member.revoke'));
  const m = await clientMembership(membershipId);
  await db.update(schema.memberships).set({ status: 'revoked', revokedAt: new Date() }).where(eq(schema.memberships.id, m.id));
  await audit({ actorId: p!.userId, action: ACT('member.revoke'), resourceType: 'membership', resourceId: m.id, orgId: m.orgId, meta: { userId: m.userId } });
}

// ---- entitlements + community ------------------------------------------------------------------------------------
export async function listEntitlements(p: Principal | null, orgId: string) {
  await assertAction(p, 'org.manage', ACT('entitlement.list'));
  await clientOrg(orgId);
  const prods = await db.select().from(schema.products).where(eq(schema.products.status, 'active')).orderBy(asc(schema.products.sortOrder));
  const on = new Set((await db.select({ s: schema.entitlements.productSlug }).from(schema.entitlements).where(eq(schema.entitlements.orgId, orgId))).map((e) => e.s));
  return prods.map((x) => ({ slug: x.slug, name: x.name, enabled: on.has(x.slug) }));
}

export async function setEntitlement(p: Principal | null, orgId: string, productSlug: string, enabled: boolean) {
  await assertAction(p, 'org.manage', ACT('entitlement.set'));
  await clientOrg(orgId);
  const [prod] = await db.select({ slug: schema.products.slug }).from(schema.products).where(and(eq(schema.products.slug, productSlug), eq(schema.products.status, 'active')));
  if (!prod) throw new InputError('Unknown product.');
  if (enabled) await db.insert(schema.entitlements).values({ orgId, productSlug, grantedBy: p!.userId }).onConflictDoNothing();
  else await db.delete(schema.entitlements).where(and(eq(schema.entitlements.orgId, orgId), eq(schema.entitlements.productSlug, productSlug)));
  await audit({ actorId: p!.userId, action: ACT('entitlement.set'), resourceType: 'entitlement', resourceId: productSlug, orgId, meta: { enabled } });
}

export async function getCommunityStatus(p: Principal | null, orgId: string) {
  await assertAction(p, 'org.manage', ACT('community.view'));
  const [s] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
  return s?.communityStatus ?? 'none';
}

/** Approving/revoking an organisation's participation in the cross-client learning community. Takes effect on the next request of its members. */
export async function setCommunityStatus(p: Principal | null, orgId: string, status: unknown) {
  await assertAction(p, 'org.manage', ACT('community.set'));
  const s = parse(z.enum(['approved', 'revoked']), status);
  await clientOrg(orgId);
  await db.insert(schema.orgSettings).values({ orgId, communityStatus: s, communityApprovedBy: s === 'approved' ? p!.userId : null }).onConflictDoUpdate({ target: schema.orgSettings.orgId, set: { communityStatus: s, communityApprovedBy: s === 'approved' ? p!.userId : null, updatedAt: new Date() } });
  await audit({ actorId: p!.userId, action: ACT('community.set'), resourceType: 'organisation', resourceId: orgId, orgId, meta: { status: s } });
}
