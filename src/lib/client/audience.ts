import { and, eq, inArray, ne, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Principal } from '@/lib/auth/principal';
import { audienceFilter, canSeeAudience, type Audience } from '@/lib/authz';
import { INTERNAL_ORG_ID } from '@/lib/env';

/**
 * Client-portal narrowing of the shared audience rule. Even a principal who is ALSO an employee only sees client-facing
 * audiences here (org of the ACTIVE workspace / entitled product / explicit public): never employee or internal-org content.
 * `allowPublic: false` is used for client-specific resources and demos, which must carry an org or product audience.
 */
const kindsFor = (allowPublic: boolean) => (allowPublic ? ['public', 'org', 'product'] : ['org', 'product']);

export function clientAudienceFilter(cols: { kind: PgColumn; orgId: PgColumn; product: PgColumn }, p: Principal | null, opts: { allowPublic?: boolean } = {}): SQL {
  return and(
    audienceFilter(cols, p),
    inArray(cols.kind, kindsFor(!!opts.allowPublic)),
    or(ne(cols.kind, 'org'), and(eq(cols.kind, 'org'), ne(cols.orgId, INTERNAL_ORG_ID))),
  )!;
}

/** Row-level twin of clientAudienceFilter, for direct object-id access. */
export function clientCanSee(p: Principal | null, a: Audience, opts: { allowPublic?: boolean } = {}): boolean {
  if (!a.kind || !kindsFor(!!opts.allowPublic).includes(a.kind)) return false;
  if (a.kind === 'org' && a.orgId === INTERNAL_ORG_ID) return false;
  return canSeeAudience(p, a);
}
