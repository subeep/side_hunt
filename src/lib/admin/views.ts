import { and, count, desc, eq, gt, gte, ilike, lt, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { minCohortOrgs, isDemoMode } from '../env';
import { assertAction, PAGE_SIZE, pageOf } from '../employee/common';

const esc = (s: string) => s.replace(/[\\%_]/g, '\\$&');
const filters = z.object({
  action: z.string().trim().max(80).optional(),
  actor: z.string().trim().max(120).optional(),
  outcome: z.enum(['ok', 'deny']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type AuditFilters = z.infer<typeof filters> & { page?: number };

/** Paginated audit viewer. Invalid filter values are dropped, never interpolated; LIKE wildcards are escaped. */
export async function listAudit(p: Principal | null, rawFilters: Record<string, unknown>) {
  await assertAction(p, 'audit.view', 'admin.audit.view');
  const f: Partial<z.infer<typeof filters>> = {};
  for (const k of Object.keys(filters.shape) as (keyof typeof filters.shape)[]) {
    const r = filters.shape[k].safeParse(rawFilters[k] === '' ? undefined : rawFilters[k]);
    if (r.success && r.data) (f as Record<string, unknown>)[k] = r.data;
  }
  const page = pageOf(rawFilters.page);
  const conds: SQL[] = [];
  if (f.action) conds.push(ilike(schema.auditEvents.action, `${esc(f.action)}%`));
  if (f.outcome) conds.push(eq(schema.auditEvents.outcome, f.outcome));
  if (f.actor) conds.push(sql`(${schema.auditEvents.actorId} = ${f.actor} or ${schema.users.email} ilike ${'%' + esc(f.actor) + '%'})`);
  if (f.from) conds.push(gte(schema.auditEvents.at, new Date(`${f.from}T00:00:00Z`)));
  if (f.to) conds.push(lt(schema.auditEvents.at, new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000)));
  const where = conds.length ? and(...conds) : undefined;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.auditEvents).leftJoin(schema.users, eq(schema.users.id, schema.auditEvents.actorId)).where(where);
  const rows = await db
    .select({ id: schema.auditEvents.id, at: schema.auditEvents.at, action: schema.auditEvents.action, outcome: schema.auditEvents.outcome, actorId: schema.auditEvents.actorId, actorEmail: schema.users.email, orgId: schema.auditEvents.orgId, resourceType: schema.auditEvents.resourceType, resourceId: schema.auditEvents.resourceId, meta: schema.auditEvents.meta })
    .from(schema.auditEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditEvents.actorId))
    .where(where)
    .orderBy(desc(schema.auditEvents.at), desc(schema.auditEvents.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { rows, total: n, page, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)), filters: f };
}

export async function listLeads(p: Principal | null, rawFilters: { kind?: unknown; page?: unknown }) {
  await assertAction(p, 'org.manage', 'admin.leads.view');
  const kind = z.enum(['demo', 'hackathon', 'contact']).safeParse(rawFilters.kind).data;
  const page = pageOf(rawFilters.page);
  const where = kind ? eq(schema.leads.kind, kind) : undefined;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.leads).where(where);
  const rows = await db.select().from(schema.leads).where(where).orderBy(desc(schema.leads.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  await audit({ actorId: p!.userId, action: 'admin.leads.view', meta: { kind: kind ?? 'all', page } }); // personal data: reads are logged
  return { rows, total: n, page, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)), kind };
}

/** Read-only operational config. Reports whether secrets are set, never their values. */
export async function getConfig(p: Principal | null) {
  await assertAction(p, 'org.manage', 'admin.config.view');
  return {
    demoMode: isDemoMode(),
    minCohortOrgs: minCohortOrgs(),
    emailProviderConfigured: !!process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM ?? 'azentio.ai <onboarding@resend.dev> (default)',
    database: process.env.DATABASE_URL ? 'Postgres (DATABASE_URL)' : 'Embedded PGlite',
    authSecretConfigured: !!process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16,
  };
}

export async function adminOverview(p: Principal | null) {
  await assertAction(p, 'org.manage', 'admin.overview');
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const now = new Date();
  return {
    orgs: await n(db.select({ n: count() }).from(schema.organisations).where(eq(schema.organisations.kind, 'client'))),
    employees: await n(db.select({ n: count() }).from(schema.employeeAllowlist).where(eq(schema.employeeAllowlist.status, 'active'))),
    activeSupport: await n(db.select({ n: count() }).from(schema.supportAuthorisations).where(and(eq(schema.supportAuthorisations.status, 'active'), gt(schema.supportAuthorisations.expiresAt, now)))),
    denials24h: await n(db.select({ n: count() }).from(schema.auditEvents).where(and(eq(schema.auditEvents.outcome, 'deny'), gte(schema.auditEvents.at, new Date(now.getTime() - 86_400_000))))),
    leads: await n(db.select({ n: count() }).from(schema.leads)),
  };
}
