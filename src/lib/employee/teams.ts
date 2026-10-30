import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { assertEmployee, deny, InputError, optText, parse, text } from './common';

/** Hackathon team spaces. Everyone employed can see that a team exists and join; the notes are visible to members only. */
const members = (m: unknown): string[] => (Array.isArray((m as { members?: unknown })?.members) ? ((m as { members: string[] }).members) : []);

export async function listTeams(p: Principal | null) {
  await assertEmployee(p, 'employee.team.list');
  const rows = await db.select({ t: schema.employeeItems, owner: schema.users.name }).from(schema.employeeItems).leftJoin(schema.users, eq(schema.users.id, schema.employeeItems.ownerId)).where(eq(schema.employeeItems.kind, 'team')).orderBy(asc(schema.employeeItems.createdAt));
  return rows.map(({ t, owner }) => ({ id: t.id, title: t.title, body: t.body, ownerName: owner ?? 'Unknown', memberCount: members(t.meta).length, isMember: members(t.meta).includes(p!.userId), focus: (t.meta as { focus?: string } | null)?.focus ?? null }));
}

export async function createTeam(p: Principal | null, raw: unknown) {
  await assertEmployee(p, 'employee.team.create');
  const i = parse(z.object({ title: text(3, 80, 'Team name'), body: text(10, 1000, 'What are you building?'), focus: optText(80, 'Focus') }), raw);
  const [row] = await db.insert(schema.employeeItems).values({ kind: 'team', title: i.title, body: i.body, ownerId: p!.userId, status: 'open', meta: { members: [p!.userId], focus: i.focus } }).returning();
  await audit({ actorId: p!.userId, action: 'employee.team.create', resourceType: 'employee_item', resourceId: row.id });
  return row;
}

async function loadTeam(id: string) {
  const [t] = await db.select().from(schema.employeeItems).where(and(eq(schema.employeeItems.id, id), eq(schema.employeeItems.kind, 'team')));
  return t ?? null;
}

export async function joinTeam(p: Principal | null, id: string) {
  await assertEmployee(p, 'employee.team.join');
  const t = await loadTeam(id);
  if (!t) throw new InputError('Team not found.');
  if (t.status === 'closed') throw new InputError('This team space is closed.');
  const ms = members(t.meta);
  if (!ms.includes(p!.userId)) {
    await db.update(schema.employeeItems).set({ meta: { ...(t.meta ?? {}), members: [...ms, p!.userId] }, updatedAt: new Date() }).where(eq(schema.employeeItems.id, id));
    await audit({ actorId: p!.userId, action: 'employee.team.join', resourceType: 'employee_item', resourceId: id });
  }
}

export async function leaveTeam(p: Principal | null, id: string) {
  await assertEmployee(p, 'employee.team.leave');
  const t = await loadTeam(id);
  if (!t) throw new InputError('Team not found.');
  if (t.ownerId === p!.userId) throw new InputError('The team owner cannot leave; close the space instead.');
  await db.update(schema.employeeItems).set({ meta: { ...(t.meta ?? {}), members: members(t.meta).filter((m) => m !== p!.userId) } }).where(eq(schema.employeeItems.id, id));
  await audit({ actorId: p!.userId, action: 'employee.team.leave', resourceType: 'employee_item', resourceId: id });
}

/** Team detail. Notes are only returned to members; non-members get the summary and `isMember: false`. */
export async function getTeam(p: Principal | null, id: string) {
  await assertEmployee(p, 'employee.team.view');
  const t = await loadTeam(id);
  if (!t) return null;
  const ms = members(t.meta);
  const isMember = ms.includes(p!.userId);
  const names = isMember && ms.length ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(sql`${schema.users.id} in (${sql.join(ms.map((m) => sql`${m}`), sql`, `)})`) : [];
  const notes = isMember
    ? await db
        .select({ id: schema.employeeItems.id, body: schema.employeeItems.body, at: schema.employeeItems.createdAt, author: schema.users.name })
        .from(schema.employeeItems)
        .leftJoin(schema.users, eq(schema.users.id, schema.employeeItems.ownerId))
        .where(and(eq(schema.employeeItems.kind, 'internal_note'), sql`${schema.employeeItems.meta}->>'teamId' = ${id}`))
        .orderBy(asc(schema.employeeItems.createdAt))
    : [];
  return { id: t.id, title: t.title, body: t.body, status: t.status, isMember, isOwner: t.ownerId === p!.userId, focus: (t.meta as { focus?: string } | null)?.focus ?? null, memberCount: ms.length, members: names.map((n) => n.name), notes };
}

export async function addTeamNote(p: Principal | null, id: string, raw: unknown) {
  await assertEmployee(p, 'employee.team.note');
  const i = parse(z.object({ body: text(2, 2000, 'Note') }), raw);
  const t = await loadTeam(id);
  if (!t) throw new InputError('Team not found.');
  if (!members(t.meta).includes(p!.userId)) return deny(p, 'employee.team.note', 'join the team to add notes', { resourceType: 'employee_item', resourceId: id });
  const [row] = await db.insert(schema.employeeItems).values({ kind: 'internal_note', title: `Note for ${t.title}`.slice(0, 120), body: i.body, ownerId: p!.userId, status: 'open', meta: { teamId: id } }).returning();
  await audit({ actorId: p!.userId, action: 'employee.team.note', resourceType: 'employee_item', resourceId: row.id, meta: { teamId: id } });
}
