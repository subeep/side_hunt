import { and, desc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { authorize } from '../authz/policy';
import { sendEmail, type EmailStatus } from '../email';
import { minCohortOrgs } from '../env';
import { rateLimit } from '../ratelimit';
import type { SharedPublic } from '../learning/columns';
import { releaseStat, type StatDisplay } from './aggregation';
import { getIdeaForPrincipal, listIdeasForPrincipal, type IdeaListItem } from './ideas';
import { FILTER_KEYS, normaliseFilters, normaliseQuery, type Filters } from './search';
import { themeIsVisible, trendSummary, type TrendSummary } from './themes';
import { canSeeFeed, getVisibleShared, getVisibleSharedMany } from './visibility';

export class EngageError extends Error {
  constructor(public code: 'forbidden' | 'not_found' | 'invalid' | 'rate_limited', message: string) {
    super(message);
  }
}
const need = (p: Principal | null): Principal => {
  if (!canSeeFeed(p)) throw new EngageError('forbidden', 'The shared feed is available to approved community participants.');
  return p!;
};
const firstIssue = (e: z.ZodError) => e.issues[0].message;

/* ------------------------------ comments ------------------------------ */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const commentBody = z.string().trim().min(2, 'Comment is too short.').max(1000, 'Comment is too long (1000 characters).');
export interface CommentView { id: string; authorName: string; label: string; body: string; createdAt: Date; mine: boolean; hidden: boolean }

/** Comments inherit the parent's audience at read time: if the parent is not published+visible, there are no comments. */
export async function listComments(p: Principal | null, sharedId: string): Promise<CommentView[] | null> {
  if (!(await getVisibleShared(p, sharedId))) return null;
  const mod = authorize(p, 'learning.moderate').allow;
  const rows = await db
    .select({ id: schema.comments.id, body: schema.comments.body, status: schema.comments.status, createdAt: schema.comments.createdAt, authorId: schema.comments.authorId, authorOrgId: schema.comments.authorOrgId, name: schema.users.name })
    .from(schema.comments)
    .leftJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
    .where(and(eq(schema.comments.parentType, 'shared'), eq(schema.comments.parentId, sharedId)))
    .orderBy(schema.comments.createdAt);
  return rows
    .filter((r) => r.status === 'visible' || (mod && r.status === 'hidden'))
    .map((r) => ({
      // Real names are shown only to the author themself and to moderators; other tenants see the generic label (rule 6).
      id: r.id, authorName: r.authorId === p!.userId ? 'You' : mod ? (r.name ?? 'Participant') : r.authorOrgId === 'org_azentio' ? 'Azentio team' : 'Community participant', label: r.authorOrgId === 'org_azentio' ? 'Azentio team' : 'Community participant', // org-agnostic
      body: r.body, createdAt: r.createdAt, mine: r.authorId === p!.userId, hidden: r.status !== 'visible',
    }));
}

export async function addComment(p: Principal | null, sharedId: string, raw: string) {
  const me = need(p);
  if (!(await getVisibleShared(me, sharedId))) throw new EngageError('not_found', 'Contribution not found.');
  const b = commentBody.safeParse(raw);
  if (!b.success) throw new EngageError('invalid', firstIssue(b.error));
  if (EMAIL.test(b.data)) throw new EngageError('invalid', 'Please remove email addresses from comments.');
  if (!(await rateLimit(`comment:${me.userId}`, 10, 60))) throw new EngageError('rate_limited', 'You are commenting too quickly. Please wait a moment.');
  const [row] = await db.insert(schema.comments).values({ parentType: 'shared', parentId: sharedId, authorId: me.userId, authorOrgId: me.isEmployee ? 'org_azentio' : me.activeOrgId, body: b.data }).returning({ id: schema.comments.id });
  await audit({ actorId: me.userId, actorOrgId: me.activeOrgId, action: 'comment.create', resourceType: 'comment', resourceId: row.id, meta: { sharedId } });
  return row.id;
}

async function commentWithVisibleParent(p: Principal, commentId: string) {
  const [c] = await db.select().from(schema.comments).where(and(eq(schema.comments.id, commentId), eq(schema.comments.parentType, 'shared')));
  if (!c || !(await getVisibleShared(p, c.parentId))) return null;
  return c;
}

/** Report a comment to moderation (stored as a report on the parent; the reporter is never shown to the comment author). */
export async function reportComment(p: Principal | null, commentId: string, reason: string, details?: string) {
  const me = need(p);
  const r = z.enum(['misleading', 'confidential', 'inappropriate']).safeParse(reason);
  if (!r.success) throw new EngageError('invalid', 'Choose a reason.');
  const c = await commentWithVisibleParent(me, commentId);
  if (!c) throw new EngageError('not_found', 'Comment not found.');
  if (!(await rateLimit(`report:${me.userId}`, 10, 3600))) throw new EngageError('rate_limited', 'Too many reports. Please try again later.');
  const [row] = await db.insert(schema.reports).values({ sharedId: c.parentId, reporterId: me.userId, reporterOrgId: me.activeOrgId, reason: r.data, details: `Comment ${c.id}: ${(details ?? '').trim().slice(0, 500)}`.trim() }).returning({ id: schema.reports.id });
  await audit({ actorId: me.userId, actorOrgId: me.activeOrgId, action: 'comment.report', resourceType: 'comment', resourceId: c.id, meta: { reportId: row.id, reason: r.data } });
}

/** Moderators may hide/restore/remove any comment; authors may remove their own. */
export async function moderateComment(p: Principal | null, commentId: string, status: 'visible' | 'hidden' | 'removed') {
  const me = need(p);
  const c = await commentWithVisibleParent(me, commentId);
  if (!c) throw new EngageError('not_found', 'Comment not found.');
  const mod = authorize(me, 'learning.moderate').allow;
  const own = c.authorId === me.userId && status === 'removed';
  if (!mod && !own) {
    await audit({ actorId: me.userId, actorOrgId: me.activeOrgId, action: 'comment.moderate', resourceType: 'comment', resourceId: c.id, outcome: 'deny' });
    throw new EngageError('forbidden', 'Only a moderator can do that.');
  }
  await db.update(schema.comments).set({ status }).where(eq(schema.comments.id, c.id));
  await audit({ actorId: me.userId, actorOrgId: me.activeOrgId, action: 'comment.moderate', resourceType: 'comment', resourceId: c.id, meta: { status } });
}

/* -------------------------- votes + bookmarks -------------------------- */

export async function castVote(p: Principal | null, sharedId: string, vote: string | null) {
  const me = need(p);
  if (!(await getVisibleShared(me, sharedId))) throw new EngageError('not_found', 'Contribution not found.');
  const F = schema.feedbackVotes;
  if (vote === null || vote === '') {
    await db.delete(F).where(and(eq(F.userId, me.userId), eq(F.sharedId, sharedId)));
    return;
  }
  const v = z.enum(['useful', 'needs_evidence']).safeParse(vote);
  if (!v.success) throw new EngageError('invalid', 'Unknown vote.');
  await db.insert(F).values({ userId: me.userId, sharedId, vote: v.data }).onConflictDoUpdate({ target: [F.userId, F.sharedId], set: { vote: v.data, createdAt: new Date() } });
}

export async function myVote(p: Principal | null, sharedId: string) {
  if (!p) return null;
  const [r] = await db.select({ v: schema.feedbackVotes.vote }).from(schema.feedbackVotes).where(and(eq(schema.feedbackVotes.userId, p.userId), eq(schema.feedbackVotes.sharedId, sharedId)));
  return r?.v ?? null;
}

/** Quality feedback summary for owners/moderators only; withheld below the cohort threshold of distinct voters. */
export async function voteSummary(p: Principal | null, sharedId: string): Promise<{ suppressed: true; reason: string } | { suppressed: false; useful: number; needsEvidence: number } | null> {
  if (!p || !(authorize(p, 'idea.manage').allow || authorize(p, 'learning.moderate').allow) || !(await getVisibleShared(p, sharedId))) return null;
  const rows = await db.select({ v: schema.feedbackVotes.vote }).from(schema.feedbackVotes).where(eq(schema.feedbackVotes.sharedId, sharedId));
  const t = minCohortOrgs();
  if (rows.length < t) return { suppressed: true, reason: `Fewer than ${t} reviewers have voted; tallies withheld.` };
  return { suppressed: false, useful: rows.filter((r) => r.v === 'useful').length, needsEvidence: rows.filter((r) => r.v === 'needs_evidence').length };
}

export type BookmarkType = 'shared' | 'theme' | 'idea';
async function targetTitle(p: Principal, type: BookmarkType, id: string): Promise<{ title: string; href: string } | null> {
  if (type === 'shared') { const s = await getVisibleShared(p, id); return s ? { title: s.title, href: `/learn/feed/${s.id}` } : null; }
  if (type === 'theme') { const t = await themeIsVisible(p, id); return t ? { title: t.title, href: `/learn/themes/${t.id}` } : null; }
  const i = await getIdeaForPrincipal(p, id);
  return i ? { title: i.title, href: `/learn/ideas/${i.id}` } : null;
}

export async function toggleBookmark(p: Principal | null, type: string, id: string): Promise<boolean> {
  const me = need(p);
  const t = z.enum(['shared', 'theme', 'idea']).safeParse(type);
  if (!t.success || !id || id.length > 80) throw new EngageError('invalid', 'Unknown bookmark target.');
  const B = schema.bookmarks;
  const [existing] = await db.select({ id: B.id }).from(B).where(and(eq(B.userId, me.userId), eq(B.targetType, t.data), eq(B.targetId, id)));
  if (existing) { await db.delete(B).where(eq(B.id, existing.id)); return false; }
  if (!(await targetTitle(me, t.data, id))) throw new EngageError('not_found', 'Not found.');
  await db.insert(B).values({ userId: me.userId, targetType: t.data, targetId: id }).onConflictDoNothing();
  return true;
}

export async function isBookmarked(p: Principal | null, type: BookmarkType, id: string) {
  if (!p) return false;
  const B = schema.bookmarks;
  const [r] = await db.select({ id: B.id }).from(B).where(and(eq(B.userId, p.userId), eq(B.targetType, type), eq(B.targetId, id)));
  return !!r;
}

/** Own bookmarks, each re-checked for visibility now; ones that are no longer available show a neutral placeholder. */
export async function listBookmarks(p: Principal | null) {
  if (!p) return [];
  const rows = await db.select().from(schema.bookmarks).where(eq(schema.bookmarks.userId, p.userId)).orderBy(desc(schema.bookmarks.createdAt)).limit(100);
  const out = [];
  for (const r of rows) {
    const type = r.targetType as BookmarkType;
    const t = ['shared', 'theme', 'idea'].includes(type) && canSeeFeed(p) ? await targetTitle(p, type, r.targetId) : null;
    out.push({ id: r.id, type, targetId: r.targetId, title: t?.title ?? null, href: t?.href ?? null, createdAt: r.createdAt });
  }
  return out;
}

export async function removeBookmark(p: Principal | null, bookmarkId: string) {
  if (!p) throw new EngageError('forbidden', 'Sign in required.');
  await db.delete(schema.bookmarks).where(and(eq(schema.bookmarks.id, bookmarkId), eq(schema.bookmarks.userId, p.userId)));
}

/* ----------------------------- saved searches ----------------------------- */

const MAX_SAVED = 20;
export async function saveSearch(p: Principal | null, input: { name: string; q?: string; filters?: Record<string, unknown> }) {
  const me = need(p);
  const name = z.string().trim().min(2, 'Give the search a name.').max(60).safeParse(input.name);
  if (!name.success) throw new EngageError('invalid', firstIssue(name.error));
  const S = schema.savedSearches;
  const have = await db.select({ id: S.id }).from(S).where(eq(S.userId, me.userId));
  if (have.length >= MAX_SAVED) throw new EngageError('invalid', `You can keep up to ${MAX_SAVED} saved searches.`);
  const [row] = await db.insert(S).values({ userId: me.userId, name: name.data, query: normaliseQuery(input.q) || null, filters: normaliseFilters(input.filters) as Record<string, string> }).returning({ id: S.id });
  return row.id;
}
export async function listSavedSearches(p: Principal | null) {
  if (!canSeeFeed(p)) return [];
  const S = schema.savedSearches;
  return db.select().from(S).where(eq(S.userId, p!.userId)).orderBy(desc(S.createdAt));
}
export async function deleteSavedSearch(p: Principal | null, id: string) {
  if (!p) throw new EngageError('forbidden', 'Sign in required.');
  await db.delete(schema.savedSearches).where(and(eq(schema.savedSearches.id, id), eq(schema.savedSearches.userId, p.userId)));
}
export function feedHref(q?: string | null, filters?: Filters | Record<string, string> | null, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  if (q) sp.set('q', q);
  for (const k of FILTER_KEYS) if (filters?.[k]) sp.set(k, filters[k]!);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  const s = sp.toString();
  return s ? `/learn?${s}` : '/learn';
}

/* --------------------------------- digest --------------------------------- */

export const DIGEST_EMAIL_NOTE = 'Email digests are a later (P1) feature. The button below only stores a message in the outbox; a status of “queued” means stored, not sent, and we never report “delivered”.';
const FREQ = z.enum(['off', 'weekly', 'monthly']);

export async function getDigestSub(p: Principal | null) {
  if (!p) return null;
  const [r] = await db.select().from(schema.digestSubscriptions).where(eq(schema.digestSubscriptions.userId, p.userId));
  return r ?? { userId: p.userId, frequency: 'off' as const, topics: [] as string[], lastSentAt: null };
}
export async function setDigest(p: Principal | null, input: { frequency: string; topics?: string[] }) {
  const me = need(p);
  const f = FREQ.safeParse(input.frequency);
  if (!f.success) throw new EngageError('invalid', 'Choose off, weekly or monthly.');
  const topics = [...new Set((input.topics ?? []).map((t) => t.trim().slice(0, 60)).filter(Boolean))].slice(0, 10);
  await db.insert(schema.digestSubscriptions).values({ userId: me.userId, frequency: f.data, topics }).onConflictDoUpdate({ target: schema.digestSubscriptions.userId, set: { frequency: f.data, topics } });
  await audit({ actorId: me.userId, actorOrgId: me.activeOrgId, action: 'digest.subscribe', resourceType: 'digest', meta: { frequency: f.data } });
}

export interface DigestPreview {
  since: Date; frequency: string; topics: string[]; newItems: SharedPublic[]; stat: StatDisplay; themes: { id: string; title: string }[]; ideas: IdeaListItem[]; trend: TrendSummary;
}
/** What a digest would contain NOW for this principal (same visibility + suppression rules as the feed). */
export async function buildDigest(p: Principal | null): Promise<DigestPreview | null> {
  if (!canSeeFeed(p)) return null;
  const me = p!;
  const sub = await getDigestSub(me);
  const days = sub?.frequency === 'weekly' ? 7 : 30;
  const since = sub?.lastSentAt ?? new Date(Date.now() - days * 86400_000);
  const topics = (sub?.topics ?? []).map((t) => t.toLowerCase());
  const S = schema.sharedContributions;
  const rows = await db.select({ id: S.id, topic: S.topic }).from(S).where(and(eq(S.status, 'published'), gte(S.publishedAt, since)));
  const ids = rows.filter((r) => !topics.length || (r.topic && topics.includes(r.topic.toLowerCase()))).map((r) => r.id);
  const newItems = await getVisibleSharedMany(me, ids);
  const allRows = await db.select({ id: S.id, topic: S.topic }).from(S).where(eq(S.status, 'published'));
  const trendIds = allRows.filter((r) => !topics.length || (r.topic && topics.includes(r.topic.toLowerCase()))).map((r) => r.id);
  const themeRows = await db.select({ id: schema.themes.id }).from(schema.themes).where(and(eq(schema.themes.status, 'active'), gte(schema.themes.updatedAt, since)));
  const themes = (await Promise.all(themeRows.map((t) => themeIsVisible(me, t.id)))).filter((t): t is { id: string; title: string } => !!t);
  const ideas = (await listIdeasForPrincipal(me, { limit: 30 })).filter((i) => i.updatedAt && i.updatedAt >= since);
  return { since, frequency: sub?.frequency ?? 'off', topics: sub?.topics ?? [], newItems, stat: await releaseStat(me.userId, newItems.map((i) => i.id)), themes, ideas, trend: await guardedTrend(me.userId, trendIds) };
}

/** The digest trend line is a statistic like any other: it goes through the same cohort + differencing ledger guard. */
async function guardedTrend(userId: string, trendIds: string[]): Promise<TrendSummary> {
  const trend = await trendSummary(trendIds);
  if (trend.rows.length < 2) return trend;
  const stat = await releaseStat(userId, trendIds);
  if (!stat.suppressed) return trend;
  return { rows: [], text: `Trend figures withheld: ${stat.reason ?? 'they could reveal a single contributor.'}`, note: trend.note };
}

export async function latestDigestEmail(p: Principal | null): Promise<{ status: EmailStatus; createdAt: Date } | null> {
  if (!p) return null;
  const rows = await db.select({ status: schema.emailOutbox.status, createdAt: schema.emailOutbox.createdAt }).from(schema.emailOutbox).where(and(eq(schema.emailOutbox.toEmail, p.email), eq(schema.emailOutbox.purpose, 'digest'))).orderBy(desc(schema.emailOutbox.createdAt)).limit(1);
  return rows[0] ?? null;
}

/** Store (and, only if a provider is configured, hand off) a digest email to the signed-in user themself. Returns the honest status. */
export async function queueDigestEmail(p: Principal | null): Promise<EmailStatus> {
  const d = await buildDigest(p);
  if (!d || !p) throw new EngageError('forbidden', 'The shared feed is available to approved community participants.');
  const lines = [
    'Your azentio.ai learning digest (approved contributions only)',
    '',
    ...(d.newItems.length ? d.newItems.map((i) => `- ${i.title}`) : ['No new approved contributions in this period.']),
    '',
    d.trend.text,
    '',
    'Status of ideas is not a delivery promise. Popularity is not market prevalence.',
  ];
  const day = new Date().toISOString().slice(0, 10);
  const status = await sendEmail({ to: p.email, subject: 'Your azentio.ai learning digest', body: lines.join('\n'), purpose: 'digest', dedupeKey: `digest:${p.userId}:${day}` });
  if (status === 'sent') await db.update(schema.digestSubscriptions).set({ lastSentAt: new Date() }).where(eq(schema.digestSubscriptions.userId, p.userId));
  return status;
}
