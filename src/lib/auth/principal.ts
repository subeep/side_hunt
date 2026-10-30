import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { GrantName } from '@/db/schema/core';
import { EMPLOYEE_DOMAIN, INTERNAL_ORG_ID } from '../env';

export type OrgRole = 'employee' | 'client_member' | 'client_admin';

export interface Principal {
  userId: string;
  email: string;
  name: string;
  sessionId: string | null;
  /** Server-validated active workspace. Never taken from user input. */
  activeOrgId: string | null;
  activeOrgName: string | null;
  activeOrgRole: OrgRole | null;
  memberships: { orgId: string; orgName: string; orgKind: 'internal' | 'client'; role: OrgRole }[];
  /** Verified @azentio.com identity + active allowlist entry + active employee membership. */
  isEmployee: boolean;
  /** Platform grants. Only ever non-empty for employees. */
  grants: ReadonlySet<GrantName>;
  /** Entitlements of the ACTIVE workspace only. */
  entitlements: ReadonlySet<string>;
  /** Is the ACTIVE workspace an approved participant in the cross-client learning community? */
  communityApproved: boolean;
}

/**
 * Build a principal from the database. `requestedActiveOrgId` (from the session row) is honoured only if the user
 * holds an ACTIVE membership of that organisation; otherwise ignored. A single-client-membership user is auto-selected.
 * Multi-membership users have no active workspace until they pick one.
 */
export async function buildPrincipal(userId: string, opts: { sessionId?: string | null; requestedActiveOrgId?: string | null } = {}): Promise<Principal | null> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user || user.status !== 'active') return null;

  const rows = await db
    .select({ orgId: schema.memberships.orgId, role: schema.memberships.role, orgName: schema.organisations.name, orgKind: schema.organisations.kind })
    .from(schema.memberships)
    .innerJoin(schema.organisations, eq(schema.organisations.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.status, 'active'), eq(schema.organisations.status, 'active')));

  const [allow] = await db.select().from(schema.employeeAllowlist).where(eq(schema.employeeAllowlist.email, user.email));
  const employeeMembership = rows.find((r) => r.orgId === INTERNAL_ORG_ID && r.role === 'employee');
  const isEmployee = !!employeeMembership && user.email.endsWith(EMPLOYEE_DOMAIN) && allow?.status === 'active';

  // Employee membership without verified identity is not honoured at all.
  const memberships = rows.filter((r) => (r.orgId === INTERNAL_ORG_ID ? isEmployee : true)) as Principal['memberships'];

  let grants = new Set<GrantName>();
  if (isEmployee) {
    const g = await db.select({ p: schema.grants.permission }).from(schema.grants).where(and(eq(schema.grants.userId, userId), isNull(schema.grants.revokedAt)));
    grants = new Set(g.map((x) => x.p));
  }

  const clientMemberships = memberships.filter((m) => m.orgKind === 'client');
  let active = opts.requestedActiveOrgId ? clientMemberships.find((m) => m.orgId === opts.requestedActiveOrgId) : undefined;
  if (!active && clientMemberships.length === 1) active = clientMemberships[0];

  let entitlements = new Set<string>();
  let communityApproved = false;
  if (active) {
    const ents = await db.select({ s: schema.entitlements.productSlug }).from(schema.entitlements).where(eq(schema.entitlements.orgId, active.orgId));
    entitlements = new Set(ents.map((e) => e.s));
    const [os] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, active.orgId));
    communityApproved = os?.communityStatus === 'approved';
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    sessionId: opts.sessionId ?? null,
    activeOrgId: active?.orgId ?? null,
    activeOrgName: active?.orgName ?? null,
    activeOrgRole: active?.role ?? null,
    memberships,
    isEmployee,
    grants,
    entitlements,
    communityApproved,
  };
}

export async function principalFromSessionToken(tokenHash: string): Promise<Principal | null> {
  const [s] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.tokenHash, tokenHash), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date())));
  if (!s) return null;
  return buildPrincipal(s.userId, { sessionId: s.id, requestedActiveOrgId: s.activeOrgId });
}
