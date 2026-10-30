import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import type { Principal } from '@/lib/auth/principal';
import { audit } from '@/lib/audit';
import { rateLimit } from '@/lib/ratelimit';

const t = schema.supportTickets;
export type TicketStatus = 'open' | 'pending' | 'closed';
export const SIMULATED_SUPPORT_NOTE = 'Simulated support integration: tickets are stored in this portal only. No external helpdesk is contacted and no response time is promised.';

const ticketSchema = z.object({
  subject: z.string().trim().min(3, 'Add a short subject (3+ characters).').max(120, 'Subject is limited to 120 characters.'),
  body: z.string().trim().min(10, 'Describe the issue in at least 10 characters.').max(2000, 'Description is limited to 2000 characters.'),
});

export async function createTicket(p: Principal, raw: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!p.activeOrgId) return { ok: false, error: 'Choose a workspace first.' };
  const parsed = ticketSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  if (!(await rateLimit(`ticket:${p.userId}`, 10, 3600))) return { ok: false, error: 'You have raised several tickets recently. Please wait before raising another.' };
  const [row] = await db.insert(t).values({ orgId: p.activeOrgId, userId: p.userId, subject: parsed.data.subject, body: parsed.data.body }).returning({ id: t.id });
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'support.create', resourceType: 'ticket', resourceId: row.id, orgId: p.activeOrgId });
  return { ok: true, id: row.id };
}

const cols = { id: t.id, subject: t.subject, body: t.body, status: t.status, createdAt: t.createdAt, userId: t.userId, userName: schema.users.name };
const isAdmin = (p: Principal) => p.activeOrgRole === 'client_admin';

/** Members see their own tickets; a client administrator sees every ticket of the ACTIVE organisation. Never another tenant's. */
export async function listTickets(p: Principal) {
  if (!p.activeOrgId) return [];
  const scope = isAdmin(p) ? eq(t.orgId, p.activeOrgId) : and(eq(t.orgId, p.activeOrgId), eq(t.userId, p.userId));
  return db.select(cols).from(t).leftJoin(schema.users, eq(schema.users.id, t.userId)).where(scope).orderBy(desc(t.createdAt));
}

export async function getTicket(p: Principal, id: string) {
  if (!p.activeOrgId) return null;
  const [row] = await db.select({ ...cols, orgId: t.orgId }).from(t).leftJoin(schema.users, eq(schema.users.id, t.userId)).where(eq(t.id, id));
  if (!row) return null;
  if (row.orgId !== p.activeOrgId || (row.userId !== p.userId && !isAdmin(p))) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'support.view', outcome: 'deny', resourceType: 'ticket', resourceId: id });
    return null;
  }
  const { orgId: _o, ...safe } = row;
  return safe;
}

export async function closeTicket(p: Principal, id: string): Promise<boolean> {
  const row = await getTicket(p, id);
  if (!row || !p.activeOrgId) return false;
  const res = await db.update(t).set({ status: 'closed' }).where(and(eq(t.id, id), eq(t.orgId, p.activeOrgId))).returning({ id: t.id });
  if (res.length) await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'support.close', resourceType: 'ticket', resourceId: id, orgId: p.activeOrgId });
  return res.length > 0;
}
