import { and, desc, eq, isNotNull, ne, notLike, or } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { hasGrant, hasSupportAuthorisation } from '../authz';
import { audit } from '../audit';

export type Contribution = typeof schema.contributions.$inferSelect;
const c = schema.contributions;

/**
 * THE moderator visibility rule: a moderator may open a contribution ONLY if it was explicitly submitted for community
 * review. Drafts (even community-intended ones) and private / organisation-only items are invisible to moderators.
 */
export const moderatorVisible = (x: Pick<Contribution, 'status' | 'submittedAt' | 'sharingChoice'>) =>
  x.status !== 'draft' && x.status !== 'withdrawn' && !!x.submittedAt && x.sharingChoice === 'community';
export const moderatorVisibleSql = and(ne(c.status, 'draft'), ne(c.status, 'withdrawn'), isNotNull(c.submittedAt), eq(c.sharingChoice, 'community'))!;

export const isAuthor = (p: Principal | null, x: Pick<Contribution, 'authorId' | 'orgId'>) => !!p && !!p.activeOrgId && x.authorId === p.userId && x.orgId === p.activeOrgId;
/**
 * Org members see organisation / community items once they have left draft; never drafts or private items, and never
 * items the author withdrew or that a moderator declined (the author's private text stops being disclosed to colleagues).
 */
export const orgVisible = (p: Principal | null, x: Pick<Contribution, 'orgId' | 'sharingChoice' | 'status'>) =>
  !!p && !!p.activeOrgId && x.orgId === p.activeOrgId && x.status !== 'draft' && x.status !== 'withdrawn' && x.status !== 'rejected' && (x.sharingChoice === 'organisation' || x.sharingChoice === 'community');

export type ViewerRole = 'author' | 'org_member' | 'support';

/**
 * Load a contribution for /learn/c/[id]. Author, or an org member for org-visible items (read-only), or a portal admin
 * under an active support authorisation (read-only, audited). EVERYTHING else is null (callers return 404) and an audit
 * 'deny' is written. Never reveals whether the id exists.
 */
export async function getContributionForViewer(p: Principal, id: string): Promise<{ c: Contribution; role: ViewerRole } | null> {
  const [row] = await db.select().from(c).where(eq(c.id, id));
  if (row) {
    if (isAuthor(p, row)) return { c: row, role: 'author' };
    if (orgVisible(p, row)) return { c: row, role: 'org_member' };
    if (await hasSupportAuthorisation(p, row.orgId)) {
      await audit({ actorId: p.userId, action: 'learning.support_read', resourceType: 'contribution', resourceId: id, orgId: row.orgId });
      return { c: row, role: 'support' };
    }
  }
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'learning.contribution.read', resourceType: 'contribution', resourceId: id, outcome: 'deny' });
  return null;
}

/** Author-only lookup used by every mutating author action. Same 404-style null + audit deny. */
export async function getOwnContribution(p: Principal, id: string, action = 'learning.contribution.write'): Promise<Contribution | null> {
  const [row] = await db.select().from(c).where(eq(c.id, id));
  if (row && isAuthor(p, row)) return row;
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action, resourceType: 'contribution', resourceId: id, outcome: 'deny' });
  return null;
}

/** Moderator lookup: grant + explicit-submission rule. Null => 404 (audited). */
export async function getForModeration(p: Principal, id: string): Promise<Contribution | null> {
  if (!hasGrant(p, 'learning_moderator')) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'learning.moderation.read', resourceType: 'contribution', resourceId: id, outcome: 'deny', meta: { why: 'no learning_moderator grant' } });
    return null;
  }
  const [row] = await db.select().from(c).where(eq(c.id, id));
  if (row && moderatorVisible(row)) {
    await audit({ actorId: p.userId, action: 'learning.moderation.read', resourceType: 'contribution', resourceId: id, orgId: row.orgId });
    return row;
  }
  await audit({ actorId: p.userId, action: 'learning.moderation.read', resourceType: 'contribution', resourceId: id, outcome: 'deny', meta: { why: 'not explicitly submitted for community review' } });
  return null;
}

export async function listMine(p: Principal) {
  if (!p.activeOrgId) return [];
  return db.select().from(c).where(and(eq(c.orgId, p.activeOrgId), eq(c.authorId, p.userId))).orderBy(desc(c.updatedAt));
}

export async function listOrg(p: Principal) {
  if (!p.activeOrgId) return [];
  return db
    .select({ c, authorName: schema.users.name })
    .from(c)
    .innerJoin(schema.users, eq(schema.users.id, c.authorId))
    .where(and(eq(c.orgId, p.activeOrgId), ne(c.status, 'draft'), ne(c.status, 'withdrawn'), ne(c.status, 'rejected'), or(eq(c.sharingChoice, 'organisation'), eq(c.sharingChoice, 'community'))))
    .orderBy(desc(c.updatedAt));
}

/** Public-facing moderation history for the contributor: decisions + the PUBLIC reason only. Never internal notes, moderator ids or report handling (report_* events). */
export async function authorTimeline(contributionId: string) {
  return db
    .select({ id: schema.moderationEvents.id, at: schema.moderationEvents.at, decision: schema.moderationEvents.decision, fromStatus: schema.moderationEvents.fromStatus, toStatus: schema.moderationEvents.toStatus, reasonPublic: schema.moderationEvents.reasonPublic, actorRole: schema.moderationEvents.actorRole })
    .from(schema.moderationEvents)
    .where(and(eq(schema.moderationEvents.contributionId, contributionId), notLike(schema.moderationEvents.decision, 'report\\_%')))
    .orderBy(schema.moderationEvents.at);
}
