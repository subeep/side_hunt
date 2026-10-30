import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { GRANTS, type GrantName } from '@/db/schema/core';
import { buildPrincipal, type Principal } from '../auth/principal';
import { audit } from '../audit';
import { EMPLOYEE_DOMAIN } from '../env';
import { normaliseEmail } from '../crypto';
import { assertAction, deny, InputError, parse, text } from '../employee/common';

const ACT = (a: string) => `admin.${a}`;

// ---- employee allowlist --------------------------------------------------------------------------------------------
export async function listAllowlist(p: Principal | null) {
  await assertAction(p, 'org.manage', ACT('allowlist.list'));
  return db
    .select({ email: schema.employeeAllowlist.email, name: schema.employeeAllowlist.name, status: schema.employeeAllowlist.status, createdAt: schema.employeeAllowlist.createdAt, signedIn: sql<boolean>`exists (select 1 from users u where u.email = ${schema.employeeAllowlist.email} and u.last_login_at is not null)` })
    .from(schema.employeeAllowlist)
    .orderBy(asc(schema.employeeAllowlist.email));
}

/** Organiser-approved provisioning: only @azentio.com identities can ever be allowlisted. Membership is created at their first verified sign-in. */
export async function addAllowlist(p: Principal | null, raw: unknown) {
  await assertAction(p, 'org.manage', ACT('allowlist.add'));
  const i = parse(z.object({ email: z.string().trim().email('Enter a valid email address').max(200), name: text(2, 80, 'Name') }), raw);
  const email = normaliseEmail(i.email);
  if (!email.endsWith(EMPLOYEE_DOMAIN)) return deny(p, ACT('allowlist.add'), `only ${EMPLOYEE_DOMAIN} addresses can be employees`, { meta: { domain: email.split('@')[1] } });
  await db.insert(schema.employeeAllowlist).values({ email, name: i.name, addedBy: p!.userId }).onConflictDoUpdate({ target: schema.employeeAllowlist.email, set: { status: 'active', name: i.name, addedBy: p!.userId } });
  await audit({ actorId: p!.userId, action: ACT('allowlist.add'), resourceType: 'employee_allowlist', resourceId: email });
}

/** Revoking removes employee status immediately (principals require an active allowlist entry) and retires the person's platform grants. */
export async function revokeAllowlist(p: Principal | null, emailRaw: string) {
  await assertAction(p, 'org.manage', ACT('allowlist.revoke'));
  const email = normaliseEmail(emailRaw);
  if (email === p!.email) return deny(p, ACT('allowlist.revoke'), 'you cannot revoke your own employee access', { resourceId: email });
  // Retiring an administrator's grants shares the last-admin guard with revokeGrant: lock the active portal_admin rows in the same transaction.
  const outcome = await db.transaction(async (tx) => {
    const [u] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    const admins = await tx.select({ userId: schema.grants.userId }).from(schema.grants).where(and(eq(schema.grants.permission, 'portal_admin'), isNull(schema.grants.revokedAt))).for('update');
    if (u && admins.some((a) => a.userId === u.id) && !admins.some((a) => a.userId !== u.id)) return 'last' as const;
    const res = await tx.update(schema.employeeAllowlist).set({ status: 'revoked' }).where(eq(schema.employeeAllowlist.email, email)).returning({ email: schema.employeeAllowlist.email });
    if (!res.length) return 'none' as const;
    if (u) {
      await tx.update(schema.grants).set({ revokedAt: new Date() }).where(and(eq(schema.grants.userId, u.id), isNull(schema.grants.revokedAt)));
      await tx.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.userId, u.id), isNull(schema.sessions.revokedAt)));
    }
    return 'done' as const;
  });
  if (outcome === 'last') return deny(p, ACT('allowlist.revoke'), 'the last portal_admin cannot be revoked', { resourceId: email });
  if (outcome === 'none') throw new InputError('Allowlist entry not found.');
  await audit({ actorId: p!.userId, action: ACT('allowlist.revoke'), resourceType: 'employee_allowlist', resourceId: email });
}

// ---- platform grants -----------------------------------------------------------------------------------------------
export async function listGrantHolders(p: Principal | null) {
  await assertAction(p, 'grant.platform', ACT('grant.list'));
  const rows = await db
    .select({ id: schema.grants.id, permission: schema.grants.permission, userId: schema.grants.userId, email: schema.users.email, name: schema.users.name, at: schema.grants.createdAt })
    .from(schema.grants)
    .innerJoin(schema.users, eq(schema.users.id, schema.grants.userId))
    .where(isNull(schema.grants.revokedAt))
    .orderBy(asc(schema.users.email), asc(schema.grants.permission));
  return rows;
}

/** Candidate people for grants: verified employees (an active allowlist entry on an existing user). */
export async function listGrantCandidates(p: Principal | null) {
  await assertAction(p, 'grant.platform', ACT('grant.candidates'));
  return db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .innerJoin(schema.employeeAllowlist, and(eq(schema.employeeAllowlist.email, schema.users.email), eq(schema.employeeAllowlist.status, 'active')))
    .where(eq(schema.users.status, 'active'))
    .orderBy(asc(schema.users.email));
}

const grantSchema = z.object({ userId: z.string().min(1), permission: z.string() });
function checkPermission(permission: string): GrantName {
  if (!(GRANTS as readonly string[]).includes(permission)) throw new InputError('Unknown permission.');
  return permission as GrantName;
}

/** Platform grants go to verified EMPLOYEES only. Clients (including client admins) and unverified accounts are refused and audited. */
export async function grantPlatform(p: Principal | null, raw: unknown) {
  await assertAction(p, 'grant.platform', ACT('grant.create'));
  const i = parse(grantSchema, raw);
  const permission = checkPermission(i.permission);
  const target = await buildPrincipal(i.userId);
  if (!target?.isEmployee) return deny(p, ACT('grant.create'), 'platform grants can only be given to verified employees', { resourceType: 'user', resourceId: i.userId, meta: { permission } });
  const [existing] = await db.select().from(schema.grants).where(and(eq(schema.grants.userId, target.userId), eq(schema.grants.permission, permission), isNull(schema.grants.revokedAt)));
  if (existing) return; // idempotent
  await db.insert(schema.grants).values({ userId: target.userId, permission, grantedBy: p!.userId });
  await audit({ actorId: p!.userId, action: ACT('grant.create'), resourceType: 'user', resourceId: target.userId, meta: { permission } });
}

export async function revokeGrant(p: Principal | null, raw: unknown) {
  await assertAction(p, 'grant.platform', ACT('grant.revoke'));
  const i = parse(grantSchema, raw);
  const permission = checkPermission(i.permission);
  if (permission === 'portal_admin' && i.userId === p!.userId) return deny(p, ACT('grant.revoke'), 'you cannot revoke your own portal_admin grant', { resourceType: 'user', resourceId: i.userId });
  // Count-then-update runs in ONE transaction that row-locks every active portal_admin grant, so two admins revoking each other
  // serialise: the second sees the first's committed revocation and is refused. (No audit/deny inside: it uses the global handle.)
  const outcome = await db.transaction(async (tx) => {
    if (permission === 'portal_admin') {
      const admins = await tx.select({ userId: schema.grants.userId }).from(schema.grants).where(and(eq(schema.grants.permission, 'portal_admin'), isNull(schema.grants.revokedAt))).for('update');
      const others = new Set(admins.map((a) => a.userId).filter((u) => u !== i.userId));
      if (!others.size) return 'last' as const;
    }
    const res = await tx.update(schema.grants).set({ revokedAt: new Date() }).where(and(eq(schema.grants.userId, i.userId), eq(schema.grants.permission, permission), isNull(schema.grants.revokedAt))).returning({ id: schema.grants.id });
    return res.length ? ('done' as const) : ('none' as const);
  });
  if (outcome === 'last') return deny(p, ACT('grant.revoke'), 'the last portal_admin cannot be revoked', { resourceType: 'user', resourceId: i.userId });
  if (outcome === 'none') throw new InputError('That grant is not active.');
  await audit({ actorId: p!.userId, action: ACT('grant.revoke'), resourceType: 'user', resourceId: i.userId, meta: { permission } });
}
