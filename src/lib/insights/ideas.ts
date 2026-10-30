import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { IDEA_STATUSES } from '@/db/schema/insights';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { authorize } from '../authz/policy';
import { notify } from '../notify';
import type { SharedPublic } from '../learning/columns';
import { plainLanguageProblem } from './plain';
import { canSeeFeed, getVisibleSharedMany, visiblePublishedIds } from './visibility';

export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export { IDEA_STATUSES };
export const STATUS_LABEL: Record<IdeaStatus, string> = {
  proposed: 'Proposed', under_review: 'Under review', planned: 'Planned', in_progress: 'In progress', released: 'Released', not_proceeding: 'Not proceeding',
};
export const STATUS_DISCLAIMER = 'Status shows where an idea is in review. It is not a delivery promise or a commitment to a date.';
export const ALLOWED_TRANSITIONS: Record<IdeaStatus, IdeaStatus[]> = {
  proposed: ['under_review', 'not_proceeding'],
  under_review: ['proposed', 'planned', 'not_proceeding'],
  planned: ['under_review', 'in_progress', 'not_proceeding'],
  in_progress: ['planned', 'released', 'not_proceeding'],
  released: [],
  not_proceeding: ['proposed', 'under_review'],
};

export class IdeaError extends Error {
  constructor(public code: 'forbidden' | 'invalid' | 'not_found', message: string) {
    super(message);
  }
}

const I = schema.ideas;
const txt = (min: number, max: number) => z.string().trim().min(min).max(max);
const ideaFields = z.object({
  title: txt(8, 140),
  problem: txt(20, 1500),
  offeringSlug: z.string().trim().max(80).nullish(),
  proposedOutcome: txt(10, 1000),
  ownerUserId: z.string().trim().max(80).nullish(),
  team: z.string().trim().max(80).nullish(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  themeId: z.string().trim().max(80).nullish(),
  evidenceIds: z.array(z.string().max(80)).max(25).default([]),
});
// Partial schema without defaults (zod 4 .partial() would still apply them and silently reset priority / unlink evidence).
const ideaPatch = ideaFields.extend({ priority: ideaFields.shape.priority.removeDefault(), evidenceIds: ideaFields.shape.evidenceIds.removeDefault() }).partial();
export type IdeaInput = z.input<typeof ideaFields>;
const message = txt(10, 600);

async function guard(p: Principal | null, what: string, resourceId?: string): Promise<Principal> {
  const d = authorize(p, 'idea.manage');
  if (!d.allow || !p) {
    await audit({ actorId: p?.userId, actorOrgId: p?.activeOrgId, action: `idea.${what}`, resourceType: 'idea', resourceId, outcome: 'deny', meta: { reason: d.reason } });
    throw new IdeaError('forbidden', 'Product owner access is required.');
  }
  return p;
}
const firstIssue = (e: z.ZodError) => `${e.issues[0].path.join('.') || 'input'}: ${e.issues[0].message}`;

/** Evidence may be linked only if currently published AND visible to the owner making the link. */
async function assertEvidence(p: Principal, ids: string[]) {
  const uniq = [...new Set(ids)];
  const ok = await visiblePublishedIds(p, uniq);
  if (ok.length !== uniq.length) throw new IdeaError('invalid', 'Evidence can only be linked from approved contributions that are currently published and visible to you.');
  return uniq;
}
async function assertPlain(texts: (string | null | undefined)[]) {
  for (const t of texts) {
    if (!t) continue;
    const why = await plainLanguageProblem(t);
    if (why) throw new IdeaError('invalid', why);
  }
}
async function assertRefs(f: { offeringSlug?: string | null; ownerUserId?: string | null; themeId?: string | null }) {
  if (f.offeringSlug) {
    const [x] = await db.select({ s: schema.products.slug }).from(schema.products).where(eq(schema.products.slug, f.offeringSlug));
    if (!x) throw new IdeaError('invalid', 'Unknown offering.');
  }
  if (f.themeId) {
    const [x] = await db.select({ s: schema.themes.id }).from(schema.themes).where(eq(schema.themes.id, f.themeId));
    if (!x) throw new IdeaError('invalid', 'Unknown theme.');
  }
  if (f.ownerUserId) {
    const [x] = await db.select({ s: schema.memberships.userId }).from(schema.memberships).where(and(eq(schema.memberships.userId, f.ownerUserId), eq(schema.memberships.orgId, 'org_azentio'), eq(schema.memberships.role, 'employee'), eq(schema.memberships.status, 'active')));
    if (!x) throw new IdeaError('invalid', 'The owner must be an active employee.');
  }
}

export async function createIdea(p: Principal | null, raw: IdeaInput & { initialUpdate?: string }) {
  const me = await guard(p, 'create');
  const parsed = ideaFields.safeParse(raw);
  if (!parsed.success) throw new IdeaError('invalid', firstIssue(parsed.error));
  const f = parsed.data;
  const upd = raw.initialUpdate ? message.safeParse(raw.initialUpdate) : null;
  if (upd && !upd.success) throw new IdeaError('invalid', firstIssue(upd.error));
  await assertPlain([f.title, f.problem, f.proposedOutcome, f.team, upd?.data]);
  await assertRefs({ ...f, ownerUserId: f.ownerUserId ?? me.userId });
  const evidence = await assertEvidence(me, f.evidenceIds);
  const [row] = await db.insert(I).values({
    title: f.title, problem: f.problem, offeringSlug: f.offeringSlug || null, proposedOutcome: f.proposedOutcome,
    ownerUserId: f.ownerUserId || me.userId, team: f.team || null, priority: f.priority, themeId: f.themeId || null, createdBy: me.userId,
  }).returning({ id: I.id });
  if (evidence.length) await db.insert(schema.ideaEvidence).values(evidence.map((sharedId) => ({ ideaId: row.id, sharedId })));
  await db.insert(schema.ideaStatusHistory).values({ ideaId: row.id, fromStatus: null, toStatus: 'proposed', actorId: me.userId, note: 'Idea created' });
  if (upd?.success) await db.insert(schema.ideaUpdates).values({ ideaId: row.id, message: upd.data, createdBy: me.userId });
  await audit({ actorId: me.userId, actorOrgId: me.activeOrgId, action: 'idea.create', resourceType: 'idea', resourceId: row.id, meta: { evidence: evidence.length } });
  return { id: row.id };
}

export async function updateIdea(p: Principal | null, id: string, raw: Partial<IdeaInput>) {
  const me = await guard(p, 'update', id);
  const [cur] = await db.select().from(I).where(eq(I.id, id));
  if (!cur) throw new IdeaError('not_found', 'Idea not found.');
  const parsed = ideaPatch.safeParse(raw);
  if (!parsed.success) throw new IdeaError('invalid', firstIssue(parsed.error));
  const f = parsed.data;
  await assertPlain([f.title, f.problem, f.proposedOutcome, f.team]);
  await assertRefs(f);
  const patch: Partial<typeof I.$inferInsert> = { updatedAt: new Date() };
  if (f.title !== undefined) patch.title = f.title;
  if (f.problem !== undefined) patch.problem = f.problem;
  if (f.proposedOutcome !== undefined) patch.proposedOutcome = f.proposedOutcome;
  if (f.offeringSlug !== undefined) patch.offeringSlug = f.offeringSlug || null;
  if (f.ownerUserId) patch.ownerUserId = f.ownerUserId;
  if (f.team !== undefined) patch.team = f.team || null;
  if (f.priority !== undefined) patch.priority = f.priority;
  if (f.themeId !== undefined) patch.themeId = f.themeId || null;
  if (f.evidenceIds !== undefined) {
    const want = [...new Set(f.evidenceIds)];
    const have = (await db.select({ s: schema.ideaEvidence.sharedId }).from(schema.ideaEvidence).where(eq(schema.ideaEvidence.ideaId, id))).map((r) => r.s);
    await assertEvidence(me, want.filter((x) => !have.includes(x))); // only NEW links need to be visible+published
    const drop = have.filter((x) => !want.includes(x));
    if (drop.length) await db.delete(schema.ideaEvidence).where(and(eq(schema.ideaEvidence.ideaId, id), inArray(schema.ideaEvidence.sharedId, drop)));
    const add = want.filter((x) => !have.includes(x));
    if (add.length) await db.insert(schema.ideaEvidence).values(add.map((sharedId) => ({ ideaId: id, sharedId }))).onConflictDoNothing();
  }
  await db.update(I).set(patch).where(eq(I.id, id));
  await audit({ actorId: me.userId, actorOrgId: me.activeOrgId, action: 'idea.update', resourceType: 'idea', resourceId: id, meta: { fields: Object.keys(f) } });
}

/** Notify the authors of currently-published linked evidence (only if their org is still an approved participant). Audience-appropriate text only. */
async function notifyContributors(ideaId: string, title: string, label: string, historyId: string) {
  const ev = await db.select({ s: schema.ideaEvidence.sharedId }).from(schema.ideaEvidence).where(eq(schema.ideaEvidence.ideaId, ideaId));
  if (!ev.length) return 0;
  const authors = await db
    .select({ userId: schema.contributions.authorId, orgId: schema.contributions.orgId })
    .from(schema.sharedContributions)
    .innerJoin(schema.contributions, eq(schema.contributions.id, schema.sharedContributions.contributionId))
    .where(and(inArray(schema.sharedContributions.id, ev.map((e) => e.s)), eq(schema.sharedContributions.status, 'published')));
  const approved = new Set((await db.select({ o: schema.orgSettings.orgId }).from(schema.orgSettings).where(eq(schema.orgSettings.communityStatus, 'approved'))).map((r) => r.o));
  const users = [...new Set(authors.filter((a) => approved.has(a.orgId)).map((a) => a.userId))];
  for (const userId of users)
    await notify({
      userId, kind: 'idea_status', title: `Improvement idea update: ${title}`,
      body: `An improvement idea linked to a theme you contributed to is now “${label}”. ${STATUS_DISCLAIMER}`,
      link: `/learn/ideas/${ideaId}`, dedupeKey: `idea-status:${historyId}:${userId}`,
    });
  return users.length;
}

export async function changeStatus(p: Principal | null, id: string, input: { status: string; note?: string; message?: string }) {
  const me = await guard(p, 'status_change', id);
  const to = z.enum(IDEA_STATUSES).safeParse(input.status);
  if (!to.success) throw new IdeaError('invalid', 'Unknown status.');
  const [cur] = await db.select().from(I).where(eq(I.id, id));
  if (!cur) throw new IdeaError('not_found', 'Idea not found.');
  if (!ALLOWED_TRANSITIONS[cur.status].includes(to.data))
    throw new IdeaError('invalid', `A status change from “${STATUS_LABEL[cur.status]}” to “${STATUS_LABEL[to.data]}” is not allowed.`);
  const note = z.string().trim().max(500).optional().safeParse(input.note);
  if (!note.success) throw new IdeaError('invalid', 'Internal note is too long.');
  let msg = input.message?.trim() || `Status is now “${STATUS_LABEL[to.data]}”. This is a status update, not a delivery promise.`;
  const m = message.safeParse(msg);
  if (!m.success) throw new IdeaError('invalid', firstIssue(m.error));
  msg = m.data;
  await assertPlain([msg]);
  const [h] = await db.insert(schema.ideaStatusHistory).values({ ideaId: id, fromStatus: cur.status, toStatus: to.data, actorId: me.userId, note: note.data || null }).returning({ id: schema.ideaStatusHistory.id });
  await db.update(I).set({ status: to.data, updatedAt: new Date() }).where(eq(I.id, id));
  await db.insert(schema.ideaUpdates).values({ ideaId: id, message: msg, createdBy: me.userId });
  await audit({ actorId: me.userId, actorOrgId: me.activeOrgId, action: 'idea.status_change', resourceType: 'idea', resourceId: id, meta: { from: cur.status, to: to.data } });
  const notified = await notifyContributors(id, cur.title, STATUS_LABEL[to.data], h.id);
  return { historyId: h.id, notified };
}

export async function postUpdate(p: Principal | null, id: string, raw: string) {
  const me = await guard(p, 'post_update', id);
  const [cur] = await db.select({ id: I.id }).from(I).where(eq(I.id, id));
  if (!cur) throw new IdeaError('not_found', 'Idea not found.');
  const m = message.safeParse(raw);
  if (!m.success) throw new IdeaError('invalid', firstIssue(m.error));
  await assertPlain([m.data]);
  await db.insert(schema.ideaUpdates).values({ ideaId: id, message: m.data, createdBy: me.userId });
  await db.update(I).set({ updatedAt: new Date() }).where(eq(I.id, id));
  await audit({ actorId: me.userId, actorOrgId: me.activeOrgId, action: 'idea.post_update', resourceType: 'idea', resourceId: id });
}

/* ------------------------------ readers ------------------------------ */

export interface IdeaListItem {
  id: string; title: string; status: IdeaStatus; team: string | null; updatedAt: Date | null; offeringSlug: string | null; latestUpdate: string | null;
}

const hasPublishedEvidence = sql`exists (select 1 from idea_evidence ie join shared_contributions sc on sc.id = ie.shared_id where ie.idea_id = ${I.id} and sc.status = 'published')`;

/**
 * Which ideas may this principal see? Product owners: all. Community-visible principals: ideas linked to evidence that is
 * currently published in the feed. Entitled workspaces: ideas for an offering they are entitled to. Employees: ideas they own.
 */
function ideaVisibility(p: Principal | null): SQL | null {
  if (!p) return null;
  if (authorize(p, 'idea.manage').allow) return sql`true`;
  const parts: SQL[] = [];
  if (canSeeFeed(p)) parts.push(hasPublishedEvidence);
  const ents = [...p.entitlements];
  if (ents.length) parts.push(inArray(I.offeringSlug, ents));
  if (p.isEmployee) parts.push(eq(I.ownerUserId, p.userId));
  return parts.length ? or(...parts)! : null;
}

async function toListItems(rows: (typeof I.$inferSelect)[]): Promise<IdeaListItem[]> {
  if (!rows.length) return [];
  const ups = await db.select().from(schema.ideaUpdates).where(inArray(schema.ideaUpdates.ideaId, rows.map((r) => r.id))).orderBy(desc(schema.ideaUpdates.createdAt));
  const latest = new Map<string, string>();
  for (const u of ups) if (!latest.has(u.ideaId)) latest.set(u.ideaId, u.message);
  return rows.map((r) => ({ id: r.id, title: r.title, status: r.status, team: r.team, updatedAt: r.updatedAt, offeringSlug: r.offeringSlug, latestUpdate: latest.get(r.id) ?? null }));
}

/** Contract export (CLAUDE.md): ideas relevant to this principal. Never includes priority, internal notes or private tickets. */
export async function listIdeasForPrincipal(p: Principal | null, opts: { limit?: number } = {}): Promise<IdeaListItem[]> {
  const vis = ideaVisibility(p);
  if (!vis) return [];
  const rows = await db.select().from(I).where(vis).orderBy(desc(I.updatedAt)).limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  return toListItems(rows);
}

/** Contract export (CLAUDE.md): ideas an employee owns. */
export async function listOwnedIdeas(userId: string): Promise<IdeaListItem[]> {
  if (!userId) return [];
  return toListItems(await db.select().from(I).where(eq(I.ownerUserId, userId)).orderBy(desc(I.updatedAt)).limit(50));
}

export interface IdeaDetail extends IdeaListItem {
  problem: string; proposedOutcome: string; createdAt: Date; themeId: string | null;
  updates: { message: string; at: Date }[]; timeline: { status: IdeaStatus; at: Date }[]; evidence: SharedPublic[]; disclaimer: string;
  /** Present ONLY for product owners (idea.manage). */
  internal?: { priority: string; ownerUserId: string | null; evidenceIds: string[]; history: { from: string | null; to: string; note: string | null; at: Date; actorId: string }[] };
}

/** Direct object access: 404 (null) + audit deny when the idea exists but is not visible to this principal. */
export async function getIdeaForPrincipal(p: Principal | null, id: string): Promise<IdeaDetail | null> {
  if (!p || !id) return null;
  const vis = ideaVisibility(p);
  const [row] = vis ? await db.select().from(I).where(and(eq(I.id, id), vis)) : [];
  if (!row) {
    const [exists] = await db.select({ id: I.id }).from(I).where(eq(I.id, id));
    if (exists) await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'idea.read', resourceType: 'idea', resourceId: id, outcome: 'deny' });
    return null;
  }
  const [list] = await toListItems([row]);
  const [ups, hist, ev] = await Promise.all([
    db.select().from(schema.ideaUpdates).where(eq(schema.ideaUpdates.ideaId, id)).orderBy(desc(schema.ideaUpdates.createdAt)),
    db.select().from(schema.ideaStatusHistory).where(eq(schema.ideaStatusHistory.ideaId, id)).orderBy(schema.ideaStatusHistory.at),
    db.select({ s: schema.ideaEvidence.sharedId }).from(schema.ideaEvidence).where(eq(schema.ideaEvidence.ideaId, id)),
  ]);
  const evidenceIds = ev.map((e) => e.s);
  const detail: IdeaDetail = {
    ...list, problem: row.problem, proposedOutcome: row.proposedOutcome, createdAt: row.createdAt, themeId: row.themeId,
    updates: ups.map((u) => ({ message: u.message, at: u.createdAt })),
    timeline: hist.map((h) => ({ status: h.toStatus as IdeaStatus, at: h.at })), // status + date only: notes stay internal
    evidence: await getVisibleSharedMany(p, evidenceIds), // published + visible to THIS principal
    disclaimer: STATUS_DISCLAIMER,
  };
  if (authorize(p, 'idea.manage').allow)
    detail.internal = { priority: row.priority, ownerUserId: row.ownerUserId, evidenceIds, history: hist.map((h) => ({ from: h.fromStatus, to: h.toStatus, note: h.note, at: h.at, actorId: h.actorId })) };
  return detail;
}

/** Product-owner console list (all ideas, with internal fields). */
export async function listIdeasAdmin(p: Principal | null) {
  await guard(p, 'list');
  const rows = await db.select().from(I).orderBy(desc(I.updatedAt));
  return rows;
}

/** Ideas visible to this principal that cite a given approved contribution (feed detail "linked ideas"). */
export async function ideasForEvidence(p: Principal | null, sharedId: string): Promise<IdeaListItem[]> {
  const vis = ideaVisibility(p);
  if (!vis || !canSeeFeed(p)) return [];
  const links = await db.select({ id: schema.ideaEvidence.ideaId }).from(schema.ideaEvidence).where(eq(schema.ideaEvidence.sharedId, sharedId));
  if (!links.length) return [];
  return toListItems(await db.select().from(I).where(and(inArray(I.id, links.map((l) => l.id)), vis)).orderBy(desc(I.updatedAt)));
}

/** Employees who can own an idea (console owner picker). Names only. */
export async function listOwnerCandidates(p: Principal | null): Promise<{ id: string; name: string }[]> {
  await guard(p, 'list_owners');
  return db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.orgId, 'org_azentio'), eq(schema.memberships.role, 'employee'), eq(schema.memberships.status, 'active'), eq(schema.users.status, 'active')))
    .orderBy(schema.users.name);
}
