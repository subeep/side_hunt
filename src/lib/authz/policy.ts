import { and, eq, gt } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { GrantName } from '@/db/schema/core';
import type { Principal } from '../auth/principal';

export type Action =
  | 'org.manage'
  | 'grant.platform'
  | 'audit.view'
  | 'content.publish'
  | 'video.publish'
  | 'broadcast.configure'
  | 'learning.moderate'
  | 'idea.manage'
  | 'invite.create'
  | 'invite.revoke'
  | 'member.change_role'
  | 'member.revoke'
  | 'playground.use'
  | 'sandbox.use';

export interface Decision {
  allow: boolean;
  reason: string;
}
const ok = (reason = 'allowed'): Decision => ({ allow: true, reason });
const no = (reason: string): Decision => ({ allow: false, reason });

const CLIENT_ROLES = ['client_member', 'client_admin'];
export const hasGrant = (p: Principal | null, g: GrantName) => !!p?.isEmployee && p.grants.has(g);

/**
 * Central action policy (sync, pure). Default deny. Tenant for client actions always comes from the principal's
 * server-validated ACTIVE workspace; ctx.orgId, when supplied, must MATCH it, never override it.
 */
export function authorize(p: Principal | null, action: Action, ctx: { orgId?: string; role?: string; productSlug?: string } = {}): Decision {
  if (!p) return no('unauthenticated');
  switch (action) {
    case 'org.manage':
    case 'grant.platform':
    case 'audit.view':
      return hasGrant(p, 'portal_admin') ? ok() : no('requires portal_admin grant');
    case 'content.publish':
      return hasGrant(p, 'content_publisher') ? ok() : no('requires content_publisher grant');
    case 'video.publish':
    case 'broadcast.configure':
      return hasGrant(p, 'video_publisher') ? ok() : no('requires video_publisher grant');
    case 'learning.moderate':
      return hasGrant(p, 'learning_moderator') ? ok() : no('requires learning_moderator grant');
    case 'idea.manage':
      return hasGrant(p, 'product_owner') ? ok() : no('requires product_owner grant');
    case 'invite.create':
    case 'invite.revoke':
    case 'member.change_role':
    case 'member.revoke': {
      if (!p.activeOrgId) return no('no active workspace');
      if (ctx.orgId && ctx.orgId !== p.activeOrgId) return no('tenant mismatch');
      if (p.activeOrgRole !== 'client_admin') return no('requires client_admin in the active workspace');
      if (ctx.role && !CLIENT_ROLES.includes(ctx.role)) return no('cannot grant platform or employee roles');
      return ok();
    }
    case 'playground.use':
      return p.isEmployee ? ok() : no('employees only');
    case 'sandbox.use': {
      if (!p.activeOrgId) return no('no active workspace');
      if (!ctx.productSlug || !p.entitlements.has(ctx.productSlug)) return no('not entitled');
      return ok();
    }
    default:
      return no('unknown action');
  }
}

/** A portal administrator may read a client's private content only under an active, unexpired support authorisation. */
export async function hasSupportAuthorisation(p: Principal | null, orgId: string): Promise<boolean> {
  if (!hasGrant(p, 'portal_admin')) return false;
  const rows = await db
    .select({ id: schema.supportAuthorisations.id })
    .from(schema.supportAuthorisations)
    .where(and(eq(schema.supportAuthorisations.adminId, p!.userId), eq(schema.supportAuthorisations.orgId, orgId), eq(schema.supportAuthorisations.status, 'active'), gt(schema.supportAuthorisations.expiresAt, new Date())));
  return rows.length > 0;
}

/** Can this principal read a tenant's PRIVATE records (contributions, runs, ...)? Own active workspace, or admin w/ support authorisation. */
export async function canReadTenantPrivate(p: Principal | null, orgId: string): Promise<boolean> {
  if (!p) return false;
  if (p.activeOrgId && p.activeOrgId === orgId) return true;
  return hasSupportAuthorisation(p, orgId);
}
