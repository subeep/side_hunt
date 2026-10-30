import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '@/lib/auth/principal';
import { acceptInvitation, previewInvitation } from '@/lib/auth/invitations';
import { normaliseEmail } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { recordTermsAcceptance } from './terms';

export type InviteView =
  | { state: 'invalid' }
  | { state: 'anonymous'; orgName: string; role: string }
  | { state: 'wrong_email' }
  | { state: 'ready'; orgName: string; role: string };

/**
 * Authority to invite is re-checked at redemption: the issuing administrator must STILL be an active client_admin of the
 * invitation's organisation. Removing or demoting an administrator therefore also neutralises their lingering invitations.
 */
async function pendingInvitation(token: string, p: Principal | null) {
  const inv = token.length >= 8 && token.length <= 200 ? await previewInvitation(token) : null;
  if (!inv) return null;
  const [issuer] = await db
    .select({ id: schema.memberships.id })
    .from(schema.invitations)
    .innerJoin(schema.memberships, and(eq(schema.memberships.userId, schema.invitations.invitedBy), eq(schema.memberships.orgId, schema.invitations.orgId), eq(schema.memberships.role, 'client_admin'), eq(schema.memberships.status, 'active')))
    .where(eq(schema.invitations.id, inv.id));
  if (!issuer) {
    await audit({ actorId: p?.userId, actorOrgId: inv.orgId, action: 'invite.accept', outcome: 'deny', resourceType: 'invitation', resourceId: inv.id, orgId: inv.orgId, meta: { reason: 'issuer_no_longer_administrator' } });
    return null;
  }
  return inv;
}

const ANON_AUDIT_MAX = 10;
const ANON_AUDIT_WINDOW_SEC = 600;
async function anonymousViewAllowed(): Promise<boolean> {
  let ip = 'unknown';
  try {
    const h = await headers();
    ip = clientIp(h) || 'unknown';
  } catch {
    // no request context (tests, scripts): all such callers share one bucket
  }
  const key = `invite-view:${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;
  return rateLimit(key, ANON_AUDIT_MAX, ANON_AUDIT_WINDOW_SEC);
}

/** What should /invite/<token> show? Bad / expired / revoked / used tokens are indistinguishable ("invalid or expired"). */
export async function resolveInvite(token: string, p: Principal | null): Promise<InviteView> {
  const inv = await pendingInvitation(token, p);
  if (!inv) {
    // Anonymous probes must not append unbounded audit rows: audit only while the per-client throttle allows it.
    if (p || (await anonymousViewAllowed())) await audit({ actorId: p?.userId, action: 'invite.view', outcome: 'deny', resourceType: 'invitation', meta: { reason: 'invalid_expired_revoked_or_used' } });
    return { state: 'invalid' };
  }
  if (!p) return { state: 'anonymous', orgName: inv.orgName, role: inv.role };
  if (normaliseEmail(p.email) !== inv.email) {
    await audit({ actorId: p.userId, action: 'invite.view', outcome: 'deny', resourceType: 'invitation', resourceId: inv.id, meta: { reason: 'email_mismatch' } });
    return { state: 'wrong_email' };
  }
  return { state: 'ready', orgName: inv.orgName, role: inv.role };
}

/**
 * Accept the invitation for the signed-in, verified, intended account. Requires the explicit terms + learning-sharing
 * acknowledgement (checked BEFORE the single-use token is consumed). The acknowledgement is not consent to share or train.
 */
export async function acceptInviteWithTerms(p: Principal, token: string, acknowledged: boolean): Promise<{ ok: true; orgId: string } | { ok: false; error: string }> {
  if (!acknowledged) return { ok: false, error: 'Please confirm that you have read the workspace terms and the learning-sharing explanation.' };
  if (!(await pendingInvitation(token, p))) return { ok: false, error: 'This invitation is invalid, expired, revoked or already used.' };
  const res = await acceptInvitation(p, token);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordTermsAcceptance(p.userId, res.orgId, 'invitation');
  return { ok: true, orgId: res.orgId };
}
