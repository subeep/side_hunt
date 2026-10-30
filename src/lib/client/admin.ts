import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import type { Principal } from '@/lib/auth/principal';
import { authorize, type Action } from '@/lib/authz';
import { AuthzError, createInvitation, revokeInvitation } from '@/lib/auth/invitations';
import { normaliseEmail } from '@/lib/crypto';
import { EMPLOYEE_DOMAIN } from '@/lib/env';
import { audit } from '@/lib/audit';
import { rateLimit } from '@/lib/ratelimit';
import { createTicket } from './support';

export const CLIENT_ROLES = ['client_member', 'client_admin'] as const;
export const ROLE_LABEL: Record<string, string> = { client_member: 'Member', client_admin: 'Administrator' };
export type AdminResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const GENERIC_NOT_FOUND = 'That record was not found in your organisation.';
const text = (v: unknown) => (typeof v === 'string' ? v : undefined);

/**
 * Gate for every admin mutation. Tenant = the principal's ACTIVE workspace. A client-supplied orgId (a forged hidden field)
 * is only ever compared with it; any mismatch, any non-client role, or a non-administrator caller is refused AND audited.
 */
async function gate(p: Principal, action: Action, raw: Record<string, unknown>, extra: Record<string, unknown> = {}, auditAs: string = action): Promise<{ ok: true; orgId: string } | { ok: false; error: string }> {
  const claimedOrg = raw.orgId == null || raw.orgId === '' ? undefined : text(raw.orgId) ?? '[invalid]';
  const claimedRole = raw.role == null || raw.role === '' ? undefined : text(raw.role) ?? '[invalid]';
  const d = authorize(p, action, { orgId: claimedOrg, role: claimedRole });
  if (!d.allow || !p.activeOrgId) {
    await audit({
      actorId: p.userId,
      actorOrgId: p.activeOrgId,
      action: auditAs,
      outcome: 'deny',
      orgId: p.activeOrgId,
      meta: { reason: d.reason, attempted: 'client_admin_escalation', claimedOrgId: claimedOrg?.slice(0, 60), claimedRole: claimedRole?.slice(0, 40), ...extra },
    });
    return fail(`Not permitted: ${d.reason}.`);
  }
  return { ok: true, orgId: p.activeOrgId };
}

/** Members of the ACTIVE organisation, with role and status. */
export async function listMembers(p: Principal) {
  if (p.activeOrgRole !== 'client_admin' || !p.activeOrgId) return [];
  return db
    .select({ membershipId: schema.memberships.id, userId: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.memberships.role, status: schema.memberships.status, since: schema.memberships.createdAt })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, p.activeOrgId))
    .orderBy(asc(schema.memberships.status), asc(schema.users.name));
}

export type InvitationState = 'pending' | 'accepted' | 'expired' | 'revoked';
export const invitationState = (i: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()): InvitationState =>
  i.revokedAt ? 'revoked' : i.usedAt ? 'accepted' : i.expiresAt <= now ? 'expired' : 'pending';

/** Invitations of the ACTIVE organisation with their state and the HONEST email hand-off status (queued/sent/failed, never "delivered"). */
export async function listInvitations(p: Principal) {
  if (p.activeOrgRole !== 'client_admin' || !p.activeOrgId) return [];
  const rows = await db
    .select({ id: schema.invitations.id, email: schema.invitations.email, role: schema.invitations.role, expiresAt: schema.invitations.expiresAt, usedAt: schema.invitations.usedAt, revokedAt: schema.invitations.revokedAt, createdAt: schema.invitations.createdAt })
    .from(schema.invitations)
    .where(eq(schema.invitations.orgId, p.activeOrgId))
    .orderBy(desc(schema.invitations.createdAt));
  const mail = rows.length ? await db.select({ k: schema.emailOutbox.dedupeKey, status: schema.emailOutbox.status }).from(schema.emailOutbox).where(inArray(schema.emailOutbox.dedupeKey, rows.map((r) => `inv:${r.id}`))) : [];
  const byKey = new Map(mail.map((m) => [m.k, m.status]));
  return rows.map((r) => ({ ...r, state: invitationState(r), emailStatus: byKey.get(`inv:${r.id}`) ?? null }));
}

/** Entitlements are managed by Azentio: read-only for clients. */
export async function listOrgEntitlements(p: Principal) {
  if (!p.activeOrgId) return [];
  const ents = new Set(p.entitlements);
  const products = await db.select({ slug: schema.products.slug, name: schema.products.name, category: schema.products.category }).from(schema.products).where(eq(schema.products.status, 'active')).orderBy(asc(schema.products.sortOrder));
  return products.map((x) => ({ ...x, entitled: ents.has(x.slug) }));
}

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200), role: z.enum(CLIENT_ROLES, 'Choose Member or Administrator.') });

export async function inviteMember(p: Principal, raw: Record<string, unknown>, baseUrl: string): Promise<AdminResult<{ link: string; emailStatus: string }>> {
  const g = await gate(p, 'invite.create', raw);
  if (!g.ok) return g;
  const parsed = inviteSchema.safeParse({ email: raw.email, role: raw.role });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input.');
  const email = normaliseEmail(parsed.data.email);
  if (email.endsWith(EMPLOYEE_DOMAIN)) return fail('Azentio staff accounts cannot be invited to a client workspace.');
  if (!(await rateLimit(`invite:${g.orgId}`, 30, 3600))) return fail('Too many invitations created recently. Try again later.');
  const [member] = await db
    .select({ id: schema.memberships.id })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.orgId, g.orgId), eq(schema.memberships.status, 'active'), eq(schema.users.email, email)));
  if (member) return fail('That person is already a member of this organisation.');
  const pending = (await listInvitations(p)).find((i) => i.email === email && i.state === 'pending');
  if (pending) return fail('A pending invitation already exists for that address. Revoke it first to issue a new link.');
  try {
    const res = await createInvitation(p, { email, role: parsed.data.role }, baseUrl);
    return { ok: true, link: res.link, emailStatus: res.emailStatus };
  } catch (err) {
    if (err instanceof AuthzError) return fail(`Not permitted: ${err.reason}.`);
    throw err;
  }
}

export async function revokeInvite(p: Principal, raw: Record<string, unknown>): Promise<AdminResult> {
  const g = await gate(p, 'invite.revoke', raw);
  if (!g.ok) return g;
  const id = z.string().min(1).max(80).safeParse(raw.invitationId);
  if (!id.success) return fail('Invalid invitation.');
  const done = await revokeInvitation(p, id.data);
  if (!done) {
    await audit({ actorId: p.userId, actorOrgId: g.orgId, action: 'invite.revoke', outcome: 'deny', resourceType: 'invitation', resourceId: id.data, orgId: g.orgId, meta: { reason: 'not_found_in_org_or_already_used' } });
    return fail('That invitation is not pending in your organisation.');
  }
  return { ok: true };
}

/** Another active administrator must remain: expressed in SQL so two concurrent demotions cannot both succeed. */
const otherAdminExists = (orgId: string, targetId: string) =>
  sql`exists (select 1 from ${schema.memberships} m2 where m2.org_id = ${orgId} and m2.role = 'client_admin' and m2.status = 'active' and m2.id <> ${targetId})`;

async function targetMembership(p: Principal, g: { orgId: string }, action: Action, membershipId: unknown) {
  const id = z.string().min(1).max(80).safeParse(membershipId);
  if (!id.success) return { ok: false, error: 'Invalid member.' } as const;
  const [row] = await db
    .select({ id: schema.memberships.id, orgId: schema.memberships.orgId, userId: schema.memberships.userId, role: schema.memberships.role, status: schema.memberships.status, orgKind: schema.organisations.kind })
    .from(schema.memberships)
    .innerJoin(schema.organisations, eq(schema.organisations.id, schema.memberships.orgId))
    .where(eq(schema.memberships.id, id.data));
  // Another tenant's member, an employee/platform membership: indistinguishable from "not found" for the caller, audited for us.
  if (!row || row.orgId !== g.orgId || row.orgKind !== 'client' || !(CLIENT_ROLES as readonly string[]).includes(row.role)) {
    await audit({ actorId: p.userId, actorOrgId: g.orgId, action, outcome: 'deny', resourceType: 'membership', resourceId: id.data, orgId: g.orgId, meta: { reason: row ? 'outside_active_org_or_not_client_role' : 'unknown_membership', attempted: 'client_admin_escalation' } });
    return { ok: false, error: GENERIC_NOT_FOUND } as const;
  }
  if (row.status !== 'active') return { ok: false, error: 'That membership is already revoked.' } as const;
  return { ok: true, row } as const;
}

/** An administrator who is removed or demoted must not leave redeemable invitations behind: revoke their pending ones in this org. */
async function revokeIssuedInvitations(p: Principal, orgId: string, issuerUserId: string, why: string) {
  const res = await db
    .update(schema.invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.invitations.orgId, orgId), eq(schema.invitations.invitedBy, issuerUserId), isNull(schema.invitations.usedAt), isNull(schema.invitations.revokedAt), gt(schema.invitations.expiresAt, new Date())))
    .returning({ id: schema.invitations.id });
  for (const r of res) await audit({ actorId: p.userId, actorOrgId: orgId, action: 'invite.revoke', resourceType: 'invitation', resourceId: r.id, orgId, meta: { reason: why, issuerUserId } });
}

/** client_member <-> client_admin within the active org only. The last administrator cannot be demoted. */
export async function changeMemberRole(p: Principal, raw: Record<string, unknown>): Promise<AdminResult> {
  const g = await gate(p, 'member.change_role', raw);
  if (!g.ok) return g;
  const role = z.enum(CLIENT_ROLES).safeParse(raw.role);
  if (!role.success) return fail('Choose Member or Administrator.');
  const t = await targetMembership(p, g, 'member.change_role', raw.membershipId);
  if (!t.ok) return fail(t.error);
  if (t.row.role === role.data) return { ok: true };
  const demoting = t.row.role === 'client_admin';
  const res = await db
    .update(schema.memberships)
    .set({ role: role.data })
    .where(and(eq(schema.memberships.id, t.row.id), eq(schema.memberships.orgId, g.orgId), eq(schema.memberships.status, 'active'), demoting ? otherAdminExists(g.orgId, t.row.id) : undefined))
    .returning({ id: schema.memberships.id });
  if (!res.length) {
    await audit({ actorId: p.userId, actorOrgId: g.orgId, action: 'member.change_role', outcome: 'deny', resourceType: 'membership', resourceId: t.row.id, orgId: g.orgId, meta: { reason: 'last_admin' } });
    return fail('An organisation must keep at least one administrator. Promote someone else first.');
  }
  await audit({ actorId: p.userId, actorOrgId: g.orgId, action: 'member.change_role', resourceType: 'membership', resourceId: t.row.id, orgId: g.orgId, meta: { from: t.row.role, to: role.data, userId: t.row.userId } });
  if (demoting) await revokeIssuedInvitations(p, g.orgId, t.row.userId, 'issuer_demoted');
  return { ok: true };
}

export async function revokeMember(p: Principal, raw: Record<string, unknown>): Promise<AdminResult> {
  const g = await gate(p, 'member.revoke', raw);
  if (!g.ok) return g;
  const t = await targetMembership(p, g, 'member.revoke', raw.membershipId);
  if (!t.ok) return fail(t.error);
  const res = await db
    .update(schema.memberships)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(and(eq(schema.memberships.id, t.row.id), eq(schema.memberships.orgId, g.orgId), eq(schema.memberships.status, 'active'), t.row.role === 'client_admin' ? otherAdminExists(g.orgId, t.row.id) : undefined))
    .returning({ id: schema.memberships.id });
  if (!res.length) {
    await audit({ actorId: p.userId, actorOrgId: g.orgId, action: 'member.revoke', outcome: 'deny', resourceType: 'membership', resourceId: t.row.id, orgId: g.orgId, meta: { reason: 'last_admin' } });
    return fail('You cannot remove the last administrator of the organisation.');
  }
  await audit({ actorId: p.userId, actorOrgId: g.orgId, action: 'member.revoke', resourceType: 'membership', resourceId: t.row.id, orgId: g.orgId, meta: { userId: t.row.userId, role: t.row.role } });
  await revokeIssuedInvitations(p, g.orgId, t.row.userId, 'issuer_removed');
  return { ok: true };
}

/** Clients cannot enable products. They can ask Azentio: this raises a support ticket and changes no entitlement. */
export async function requestProductAccess(p: Principal, raw: Record<string, unknown>): Promise<AdminResult> {
  const g = await gate(p, 'invite.create', { orgId: raw.orgId }, { via: 'product_access_request' }, 'entitlement.request'); // administrator-in-active-org check only
  if (!g.ok) return g;
  const slug = z.string().min(1).max(80).safeParse(raw.productSlug);
  if (!slug.success) return fail('Choose a product.');
  const [prod] = await db.select({ name: schema.products.name }).from(schema.products).where(and(eq(schema.products.slug, slug.data), eq(schema.products.status, 'active')));
  if (!prod) return fail('Unknown product.');
  if (p.entitlements.has(slug.data)) return fail('Your organisation already has access to this product.');
  const res = await createTicket(p, { subject: `Access request: ${prod.name}`, body: `A client administrator requested access to ${prod.name} (${slug.data}) for this organisation. Entitlements are enabled by Azentio only; this request changes nothing by itself.` });
  if (!res.ok) return fail(res.error);
  await audit({ actorId: p.userId, actorOrgId: g.orgId, action: 'entitlement.request', resourceType: 'product', resourceId: slug.data, orgId: g.orgId, meta: { ticketId: res.id } });
  return { ok: true };
}
