import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Principal } from '../auth/principal';
import { INTERNAL_ORG_ID } from '../env';

export type AudienceKind = 'public' | 'employees' | 'org' | 'product' | 'community';
export interface Audience {
  kind?: AudienceKind | null;
  orgId?: string | null;
  product?: string | null;
}

/**
 * THE audience rule. A resource is visible only when its audience permits the principal's identity, active
 * tenant/membership and entitlements. Missing audience metadata => DENY. 'public' must be explicit.
 */
export function canSeeAudience(p: Principal | null, a: Audience): boolean {
  switch (a.kind) {
    case 'public':
      return true;
    case 'employees':
      return !!p?.isEmployee;
    case 'org':
      if (!p || !a.orgId) return false;
      if (a.orgId === INTERNAL_ORG_ID) return p.isEmployee;
      return p.activeOrgId === a.orgId;
    case 'product':
      return !!p?.activeOrgId && !!a.product && p.entitlements.has(a.product);
    case 'community':
      return !!p && (p.communityApproved || p.grants.has('learning_moderator') || p.grants.has('product_owner'));
    default:
      return false; // null / undefined / unknown kind
  }
}

/** SQL twin of canSeeAudience, for list/search/count/export queries so they follow the same visibility rules. */
export function audienceFilter(cols: { kind: PgColumn; orgId: PgColumn; product: PgColumn }, p: Principal | null): SQL {
  const parts: SQL[] = [eq(cols.kind, 'public')];
  if (p?.isEmployee) {
    parts.push(eq(cols.kind, 'employees'));
    parts.push(and(eq(cols.kind, 'org'), eq(cols.orgId, INTERNAL_ORG_ID))!);
  }
  if (p?.activeOrgId) {
    parts.push(and(eq(cols.kind, 'org'), eq(cols.orgId, p.activeOrgId))!);
    const ents = [...p.entitlements];
    if (ents.length) parts.push(and(eq(cols.kind, 'product'), sql`${cols.product} in (${sql.join(ents.map((e) => sql`${e}`), sql`, `)})`)!);
  }
  if (p && (p.communityApproved || p.grants.has('learning_moderator') || p.grants.has('product_owner'))) parts.push(eq(cols.kind, 'community'));
  return or(...parts)!;
}
