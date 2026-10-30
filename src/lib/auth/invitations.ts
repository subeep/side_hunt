import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { hashToken, normaliseEmail } from '../crypto';
import { newInviteToken } from './login';
import { authorize } from '../authz/policy';
import type { Principal } from './principal';
import { audit } from '../audit';
import { sendEmail } from '../email';

export class AuthzError extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

/** Client administrators invite only into their OWN active organisation, and only into client roles. */
export async function createInvitation(p: Principal, input: { email: string; role: 'client_member' | 'client_admin' }, baseUrl: string) {
  const d = authorize(p, 'invite.create', { role: input.role });
  if (!d.allow) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'invite.create', outcome: 'deny', meta: { reason: d.reason } });
    throw new AuthzError(d.reason);
  }
  const orgId = p.activeOrgId!; // tenant from the session, never from the request
  const email = normaliseEmail(input.email);
  const token = newInviteToken();
  const [inv] = await db
    .insert(schema.invitations)
    .values({ orgId, email, role: input.role, tokenHash: hashToken(token), invitedBy: p.userId, expiresAt: new Date(Date.now() + 7 * 86400_000) })
    .returning();
  const link = `${baseUrl}/invite/${token}`;
  const emailStatus = await sendEmail({ to: email, subject: `You're invited to ${p.activeOrgName} on azentio.ai`, body: `Accept your single-use invitation (expires in 7 days): ${link}`, purpose: 'invitation', dedupeKey: `inv:${inv.id}` });
  await audit({ actorId: p.userId, actorOrgId: orgId, action: 'invite.create', resourceType: 'invitation', resourceId: inv.id, orgId, meta: { role: input.role } });
  return { id: inv.id, link, emailStatus };
}

export async function revokeInvitation(p: Principal, invitationId: string) {
  const d = authorize(p, 'invite.revoke');
  if (!d.allow) throw new AuthzError(d.reason);
  const res = await db
    .update(schema.invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.invitations.id, invitationId), eq(schema.invitations.orgId, p.activeOrgId!), isNull(schema.invitations.usedAt)))
    .returning({ id: schema.invitations.id });
  if (res.length) await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'invite.revoke', resourceType: 'invitation', resourceId: invitationId, orgId: p.activeOrgId });
  return res.length > 0;
}

export async function previewInvitation(token: string) {
  const [inv] = await db
    .select({ id: schema.invitations.id, email: schema.invitations.email, role: schema.invitations.role, orgName: schema.organisations.name, orgId: schema.invitations.orgId })
    .from(schema.invitations)
    .innerJoin(schema.organisations, eq(schema.organisations.id, schema.invitations.orgId))
    .where(and(eq(schema.invitations.tokenHash, hashToken(token)), isNull(schema.invitations.usedAt), isNull(schema.invitations.revokedAt), gt(schema.invitations.expiresAt, new Date())));
  return inv ?? null;
}

/** Accept only for the verified account the invitation was issued to. Single use. Returns the org id. */
export async function acceptInvitation(p: Principal, token: string): Promise<{ ok: true; orgId: string } | { ok: false; reason: string }> {
  const inv = await previewInvitation(token);
  if (!inv) return { ok: false, reason: 'This invitation is invalid, expired, revoked or already used.' };
  if (normaliseEmail(p.email) !== inv.email) {
    await audit({ actorId: p.userId, action: 'invite.accept', outcome: 'deny', resourceType: 'invitation', resourceId: inv.id, meta: { reason: 'email_mismatch' } });
    return { ok: false, reason: 'This invitation was issued to a different email address.' };
  }
  const claimed = await db
    .update(schema.invitations)
    .set({ usedAt: new Date(), usedBy: p.userId })
    .where(and(eq(schema.invitations.id, inv.id), isNull(schema.invitations.usedAt)))
    .returning({ id: schema.invitations.id });
  if (!claimed.length) return { ok: false, reason: 'This invitation was already used.' };
  await db
    .insert(schema.memberships)
    .values({ userId: p.userId, orgId: inv.orgId, role: inv.role })
    .onConflictDoUpdate({ target: [schema.memberships.userId, schema.memberships.orgId], set: { role: inv.role, status: 'active', revokedAt: null } });
  await audit({ actorId: p.userId, actorOrgId: inv.orgId, action: 'invite.accept', resourceType: 'invitation', resourceId: inv.id, orgId: inv.orgId, meta: { role: inv.role } });
  return { ok: true, orgId: inv.orgId };
}
