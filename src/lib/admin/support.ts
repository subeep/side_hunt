import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { hasSupportAuthorisation } from '../authz';
import { notify } from '../notify';
import { assertAction, deny, InputError, parse, text } from '../employee/common';

const ACT = (a: string) => `support.${a}`;
export const SUPPORT_HOURS = [1, 4, 24] as const;

async function clientOrg(orgId: string) {
  const [o] = await db.select().from(schema.organisations).where(eq(schema.organisations.id, orgId));
  if (!o || o.kind !== 'client') throw new InputError('Client organisation not found.');
  return o;
}

/** A portal admin creates a time-boxed authorisation for THEMSELVES with a mandatory reason; the client's admins are told. */
export async function createSupportAuthorisation(p: Principal | null, raw: unknown) {
  await assertAction(p, 'org.manage', ACT('authorise'));
  const i = parse(z.object({ orgId: z.string().min(1), reason: text(15, 500, 'Reason'), hours: z.coerce.number().refine((h) => (SUPPORT_HOURS as readonly number[]).includes(h), 'Choose 1, 4 or 24 hours') }), raw);
  const org = await clientOrg(i.orgId);
  const expiresAt = new Date(Date.now() + i.hours * 3600_000);
  const [row] = await db.insert(schema.supportAuthorisations).values({ adminId: p!.userId, orgId: org.id, reason: i.reason, expiresAt }).returning();
  await audit({ actorId: p!.userId, action: ACT('authorise'), resourceType: 'support_authorisation', resourceId: row.id, orgId: org.id, meta: { hours: i.hours, reason: i.reason } });
  const admins = await db.select({ id: schema.memberships.userId }).from(schema.memberships).where(and(eq(schema.memberships.orgId, org.id), eq(schema.memberships.role, 'client_admin'), eq(schema.memberships.status, 'active')));
  for (const a of admins) await notify({ userId: a.id, kind: 'support_access', title: 'azentio support access authorised', body: `A portal administrator was authorised to view a summary of your organisation's private workspace content until ${expiresAt.toUTCString()}. Reason given: ${i.reason}`, dedupeKey: `support-auth:${row.id}:${a.id}` });
  return row;
}

export async function revokeSupportAuthorisation(p: Principal | null, id: string) {
  await assertAction(p, 'org.manage', ACT('revoke'));
  const res = await db.update(schema.supportAuthorisations).set({ status: 'revoked' }).where(and(eq(schema.supportAuthorisations.id, id), eq(schema.supportAuthorisations.status, 'active'))).returning();
  if (!res.length) throw new InputError('Authorisation not found or already revoked.');
  await audit({ actorId: p!.userId, action: ACT('revoke'), resourceType: 'support_authorisation', resourceId: id, orgId: res[0].orgId });
}

export async function listSupportAuthorisations(p: Principal | null) {
  await assertAction(p, 'org.manage', ACT('list'));
  const rows = await db
    .select({ a: schema.supportAuthorisations, adminEmail: schema.users.email, orgName: schema.organisations.name })
    .from(schema.supportAuthorisations)
    .leftJoin(schema.users, eq(schema.users.id, schema.supportAuthorisations.adminId))
    .leftJoin(schema.organisations, eq(schema.organisations.id, schema.supportAuthorisations.orgId))
    .orderBy(desc(schema.supportAuthorisations.createdAt))
    .limit(100);
  const now = Date.now();
  return rows.map(({ a, adminEmail, orgName }) => ({ ...a, adminEmail: adminEmail ?? '?', orgName: orgName ?? '?', state: a.status === 'revoked' ? ('revoked' as const) : a.expiresAt.getTime() <= now ? ('expired' as const) : ('active' as const), mine: a.adminId === p!.userId }));
}

/**
 * The ONLY door through which a portal admin sees anything private about a client org, and only as a SUMMARY: counts and the
 * titles of submitted material. Draft titles, observation bodies, authors and attachments are never returned. Requires an active,
 * unexpired authorisation for THIS admin + THIS org. Every successful view is audited ('support.access'); every refusal too.
 */
export async function getSupportSummary(p: Principal | null, orgId: string) {
  const allowed = await hasSupportAuthorisation(p, orgId);
  if (!allowed) return deny(p, ACT('access'), 'no active support authorisation for this organisation', { orgId, resourceType: 'organisation', resourceId: orgId });
  const org = await clientOrg(orgId);
  const [auth] = await db
    .select({ id: schema.supportAuthorisations.id, expiresAt: schema.supportAuthorisations.expiresAt, reason: schema.supportAuthorisations.reason })
    .from(schema.supportAuthorisations)
    .where(and(eq(schema.supportAuthorisations.adminId, p!.userId), eq(schema.supportAuthorisations.orgId, orgId), eq(schema.supportAuthorisations.status, 'active'), gt(schema.supportAuthorisations.expiresAt, new Date())))
    .orderBy(desc(schema.supportAuthorisations.expiresAt))
    .limit(1);
  const byStatus = await db.select({ status: schema.contributions.status, n: sql<number>`count(*)::int` }).from(schema.contributions).where(eq(schema.contributions.orgId, orgId)).groupBy(schema.contributions.status);
  const titles = await db
    .select({ id: schema.contributions.id, title: schema.contributions.title, status: schema.contributions.status, kind: schema.contributions.kind, updatedAt: schema.contributions.updatedAt })
    .from(schema.contributions)
    .where(and(eq(schema.contributions.orgId, orgId), sql`${schema.contributions.status} <> 'draft'`))
    .orderBy(desc(schema.contributions.updatedAt))
    .limit(50);
  const [runs] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.playgroundRuns).where(and(eq(schema.playgroundRuns.orgId, orgId), eq(schema.playgroundRuns.mode, 'client')));
  const [tickets] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.supportTickets).where(and(eq(schema.supportTickets.orgId, orgId), sql`${schema.supportTickets.status} <> 'closed'`));
  const [mem] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.memberships).where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.status, 'active')));
  await audit({ actorId: p!.userId, actorOrgId: p!.activeOrgId, action: ACT('access'), resourceType: 'organisation', resourceId: orgId, orgId, meta: { authorisationId: auth?.id, view: 'summary' } });
  return {
    org: { id: org.id, name: org.name },
    authorisation: auth ?? null,
    counts: { activeMembers: mem?.n ?? 0, sandboxRuns: runs?.n ?? 0, openTickets: tickets?.n ?? 0, contributionsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Record<string, number> },
    contributionTitles: titles,
  };
}

/** Orgs for pickers. */
export async function listClientOrgsLite(p: Principal | null) {
  await assertAction(p, 'org.manage', ACT('orgs'));
  return db.select({ id: schema.organisations.id, name: schema.organisations.name }).from(schema.organisations).where(eq(schema.organisations.kind, 'client')).orderBy(asc(schema.organisations.name));
}
