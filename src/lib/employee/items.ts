import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { assertAction, assertEmployee, deny, InputError, optText, parse, text } from './common';

/** Employee-only content (experiments, team spaces, release notes, knowledge). NEVER indexed for search or AIRA. Every function re-checks the employee identity. */
export type ItemKind = 'experiment' | 'team' | 'release_note' | 'knowledge';
export type Item = typeof schema.employeeItems.$inferSelect;

export const EXPERIMENT_STATUSES = ['proposed', 'running', 'concluded', 'parked'] as const;
export const RATINGS: Record<ItemKind, readonly string[]> = {
  experiment: ['promising', 'needs_evidence', 'stop'],
  knowledge: ['helpful', 'outdated', 'incorrect'],
  release_note: ['clear', 'confusing'],
  team: [],
};
export const KNOWLEDGE_REVIEW_DAYS = 90;
const DAY = 86_400_000;
const A = (k: ItemKind, verb: string) => `employee.${k}.${verb}`;

export const isStale = (i: Pick<Item, 'reviewDate'>, now = new Date()) => !!i.reviewDate && i.reviewDate.getTime() < now.getTime();

export async function listItems(p: Principal | null, kind: ItemKind) {
  await assertEmployee(p, A(kind, 'list'));
  const rows = await db
    .select({ item: schema.employeeItems, ownerName: schema.users.name })
    .from(schema.employeeItems)
    .leftJoin(schema.users, eq(schema.users.id, schema.employeeItems.ownerId))
    .where(eq(schema.employeeItems.kind, kind))
    .orderBy(desc(schema.employeeItems.updatedAt));
  return rows.map((r) => ({ ...r.item, ownerName: r.ownerName ?? 'Unknown' }));
}

/** Object access by id: wrong kind or not an employee => null / denied (and audited for non-employees). */
export async function getItem(p: Principal | null, kind: ItemKind, id: string) {
  await assertEmployee(p, A(kind, 'view'));
  const [r] = await db
    .select({ item: schema.employeeItems, ownerName: schema.users.name })
    .from(schema.employeeItems)
    .leftJoin(schema.users, eq(schema.users.id, schema.employeeItems.ownerId))
    .where(and(eq(schema.employeeItems.id, id), eq(schema.employeeItems.kind, kind)));
  return r ? { ...r.item, ownerName: r.ownerName ?? 'Unknown' } : null;
}

const base = { title: text(3, 120, 'Title'), body: text(10, 4000, 'Description') };

export async function createExperiment(p: Principal | null, raw: unknown) {
  await assertEmployee(p, A('experiment', 'create'));
  const i = parse(z.object({ ...base, hypothesis: optText(500, 'Hypothesis') }), raw);
  const [row] = await db.insert(schema.employeeItems).values({ kind: 'experiment', title: i.title, body: i.body, ownerId: p!.userId, status: 'proposed', meta: i.hypothesis ? { hypothesis: i.hypothesis } : {} }).returning();
  await audit({ actorId: p!.userId, action: A('experiment', 'create'), resourceType: 'employee_item', resourceId: row.id });
  return row;
}

/** Only the owner changes an experiment's status; everyone else gives feedback. */
export async function setExperimentStatus(p: Principal | null, id: string, status: unknown) {
  await assertEmployee(p, A('experiment', 'status'));
  const s = parse(z.enum(EXPERIMENT_STATUSES, { message: 'Unknown status' }), status);
  const item = await getItem(p, 'experiment', id);
  if (!item) throw new InputError('Experiment not found.');
  if (item.ownerId !== p!.userId) return deny(p, A('experiment', 'status'), 'only the owner may change status', { resourceType: 'employee_item', resourceId: id });
  await db.update(schema.employeeItems).set({ status: s, updatedAt: new Date() }).where(eq(schema.employeeItems.id, id));
  await audit({ actorId: p!.userId, action: A('experiment', 'status'), resourceType: 'employee_item', resourceId: id, meta: { status: s } });
}

export async function createKnowledge(p: Principal | null, raw: unknown) {
  await assertEmployee(p, A('knowledge', 'create'));
  const i = parse(z.object({ ...base, area: optText(60, 'Area') }), raw);
  const [row] = await db.insert(schema.employeeItems).values({ kind: 'knowledge', title: i.title, body: i.body, ownerId: p!.userId, status: 'current', reviewDate: new Date(Date.now() + KNOWLEDGE_REVIEW_DAYS * DAY), meta: i.area ? { area: i.area } : {} }).returning();
  await audit({ actorId: p!.userId, action: A('knowledge', 'create'), resourceType: 'employee_item', resourceId: row.id });
  return row;
}

/** Owner re-certifies an item (optionally with edits) and pushes the next review date out. */
export async function reviewKnowledge(p: Principal | null, id: string, raw: unknown) {
  await assertEmployee(p, A('knowledge', 'review'));
  const i = parse(z.object({ body: optText(4000, 'Body') }), raw ?? {});
  const item = await getItem(p, 'knowledge', id);
  if (!item) throw new InputError('Knowledge item not found.');
  if (item.ownerId !== p!.userId) return deny(p, A('knowledge', 'review'), 'only the owner may review this item', { resourceType: 'employee_item', resourceId: id });
  await db.update(schema.employeeItems).set({ ...(i.body ? { body: i.body } : {}), status: 'current', reviewDate: new Date(Date.now() + KNOWLEDGE_REVIEW_DAYS * DAY), updatedAt: new Date() }).where(eq(schema.employeeItems.id, id));
  await audit({ actorId: p!.userId, action: A('knowledge', 'review'), resourceType: 'employee_item', resourceId: id });
}

/** Release notes are read-only for ordinary employees: posting needs the content_publisher grant. */
export async function createReleaseNote(p: Principal | null, raw: unknown) {
  await assertAction(p, 'content.publish', A('release_note', 'create'));
  const i = parse(z.object({ ...base, version: optText(30, 'Version') }), raw);
  const [row] = await db.insert(schema.employeeItems).values({ kind: 'release_note', title: i.title, body: i.body, ownerId: p!.userId, status: 'published', meta: i.version ? { version: i.version } : {} }).returning();
  await audit({ actorId: p!.userId, action: A('release_note', 'create'), resourceType: 'employee_item', resourceId: row.id });
  return row;
}

/** One feedback row per (item, user): later submissions replace the earlier one. */
export async function giveFeedback(p: Principal | null, kind: ItemKind, id: string, raw: unknown) {
  await assertEmployee(p, A(kind, 'feedback'));
  const i = parse(z.object({ rating: z.string(), comment: optText(1000, 'Comment') }), raw);
  if (!RATINGS[kind].includes(i.rating)) throw new InputError('Choose one of the listed ratings.');
  if (!(await getItem(p, kind, id))) throw new InputError('Item not found.');
  const [prev] = await db.select().from(schema.employeeItemFeedback).where(and(eq(schema.employeeItemFeedback.itemId, id), eq(schema.employeeItemFeedback.userId, p!.userId)));
  if (prev) await db.update(schema.employeeItemFeedback).set({ rating: i.rating, comment: i.comment ?? null }).where(eq(schema.employeeItemFeedback.id, prev.id));
  else await db.insert(schema.employeeItemFeedback).values({ itemId: id, userId: p!.userId, rating: i.rating, comment: i.comment });
  await audit({ actorId: p!.userId, action: A(kind, 'feedback'), resourceType: 'employee_item', resourceId: id, meta: { rating: i.rating } });
}

export async function listFeedback(p: Principal | null, kind: ItemKind, id: string) {
  await assertEmployee(p, A(kind, 'feedback_list'));
  const rows = await db
    .select({ rating: schema.employeeItemFeedback.rating, comment: schema.employeeItemFeedback.comment, at: schema.employeeItemFeedback.createdAt, name: schema.users.name, userId: schema.employeeItemFeedback.userId })
    .from(schema.employeeItemFeedback)
    .innerJoin(schema.employeeItems, and(eq(schema.employeeItems.id, schema.employeeItemFeedback.itemId), eq(schema.employeeItems.kind, kind)))
    .leftJoin(schema.users, eq(schema.users.id, schema.employeeItemFeedback.userId))
    .where(eq(schema.employeeItemFeedback.itemId, id))
    .orderBy(desc(schema.employeeItemFeedback.createdAt));
  const tally: Record<string, number> = {};
  for (const r of rows) if (r.rating) tally[r.rating] = (tally[r.rating] ?? 0) + 1;
  return { rows, tally, mine: rows.find((r) => r.userId === p!.userId) ?? null };
}

export async function feedbackCounts(p: Principal | null, kind: ItemKind) {
  await assertEmployee(p, A(kind, 'feedback_count'));
  const rows = await db
    .select({ itemId: schema.employeeItemFeedback.itemId, n: sql<number>`count(*)::int` })
    .from(schema.employeeItemFeedback)
    .innerJoin(schema.employeeItems, and(eq(schema.employeeItems.id, schema.employeeItemFeedback.itemId), eq(schema.employeeItems.kind, kind)))
    .groupBy(schema.employeeItemFeedback.itemId);
  return new Map(rows.map((r) => [r.itemId, r.n]));
}

/**
 * Feedback overview for a list page: rating tallies for every employee, and the full comments ONLY for items the caller owns
 * (owners of knowledge articles / authors of release notes). Never returns other people's comments for items you do not own.
 */
export async function feedbackSummary(p: Principal | null, kind: ItemKind) {
  await assertEmployee(p, A(kind, 'feedback_summary'));
  const rows = await db
    .select({ itemId: schema.employeeItemFeedback.itemId, ownerId: schema.employeeItems.ownerId, rating: schema.employeeItemFeedback.rating, comment: schema.employeeItemFeedback.comment, at: schema.employeeItemFeedback.createdAt, name: schema.users.name })
    .from(schema.employeeItemFeedback)
    .innerJoin(schema.employeeItems, and(eq(schema.employeeItems.id, schema.employeeItemFeedback.itemId), eq(schema.employeeItems.kind, kind)))
    .leftJoin(schema.users, eq(schema.users.id, schema.employeeItemFeedback.userId))
    .orderBy(desc(schema.employeeItemFeedback.createdAt));
  const tallies = new Map<string, Record<string, number>>();
  const owned = new Map<string, { rating: string | null; comment: string | null; at: Date; name: string | null }[]>();
  for (const r of rows) {
    const t = tallies.get(r.itemId) ?? {};
    if (r.rating) t[r.rating] = (t[r.rating] ?? 0) + 1;
    tallies.set(r.itemId, t);
    if (r.ownerId === p!.userId) owned.set(r.itemId, [...(owned.get(r.itemId) ?? []), { rating: r.rating, comment: r.comment, at: r.at, name: r.name }]);
  }
  return { tallies, owned };
}
