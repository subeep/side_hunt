import { and, eq, isNull } from 'drizzle-orm';
import { db, schema, type Db } from '@/db';
import type { ContributionStatus } from '@/db/schema/learning';
import type { Principal } from '../auth/principal';
import { hasGrant } from '../authz';
import { audit } from '../audit';
import { notify } from '../notify';
import { isAuthor, moderatorVisible, type Contribution } from './access';
import { fail, type Fail } from './result';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type ActorKind = 'author' | 'moderator';
type S = ContributionStatus;

/**
 * THE state machine. Every edge names WHO may take it. Anything not listed is refused (in particular
 * rejected -> draft, published -> draft, withdrawn -> anything, and any moderator edge taken by an author or vice versa).
 */
export const ALLOWED: Record<S, Partial<Record<S, ActorKind>>> = {
  draft: { submitted: 'author' },
  submitted: { in_review: 'moderator' },
  in_review: { published: 'moderator', rejected: 'moderator', clarification_requested: 'moderator' },
  clarification_requested: { submitted: 'author' },
  published: { withdrawn: 'author', unpublished: 'moderator' },
  rejected: {},
  withdrawn: {},
  unpublished: { published: 'moderator', withdrawn: 'author' },
};

/**
 * Edges that exist ONLY on a specific controlled path (they are refused for a plain transition() call):
 *  - org_only: an organisation-only contribution has no moderation (it is never cross-client), so submitting it makes it
 *    visible to the author's organisation directly: draft -> published, author, sharing_choice = organisation.
 *  - material_edit: editing a published community contribution creates version+1 and re-enters review: published -> submitted.
 *  - withdraw_live: withdrawing while a newer version is pending or was rejected: {submitted|in_review|clarification_requested|rejected}
 *    -> withdrawn, only when a shared copy is live (so withdrawal is never blocked by a pending or rejected revision).
 *  - withdraw_pending: the author takes back a community proposal that a moderator has not decided yet:
 *    {submitted|in_review|clarification_requested} -> withdrawn (community items only; nothing was ever published).
 */
export type Special = 'org_only' | 'material_edit' | 'withdraw_live' | 'withdraw_pending';
export const SPECIAL_EDGES: { from: S; to: S; actor: ActorKind; special: Special }[] = [
  { from: 'draft', to: 'published', actor: 'author', special: 'org_only' },
  { from: 'published', to: 'submitted', actor: 'author', special: 'material_edit' },
  { from: 'submitted', to: 'withdrawn', actor: 'author', special: 'withdraw_live' },
  { from: 'in_review', to: 'withdrawn', actor: 'author', special: 'withdraw_live' },
  { from: 'clarification_requested', to: 'withdrawn', actor: 'author', special: 'withdraw_live' },
  { from: 'rejected', to: 'withdrawn', actor: 'author', special: 'withdraw_live' },
  { from: 'submitted', to: 'withdrawn', actor: 'author', special: 'withdraw_pending' },
  { from: 'in_review', to: 'withdrawn', actor: 'author', special: 'withdraw_pending' },
  { from: 'clarification_requested', to: 'withdrawn', actor: 'author', special: 'withdraw_pending' },
];

export function edgeFor(from: S, to: S, special?: Special): { actor: ActorKind; special?: Special } | null {
  const plain = ALLOWED[from]?.[to];
  if (plain && !special) return { actor: plain };
  const sp = SPECIAL_EDGES.find((e) => e.from === from && e.to === to && e.special === special);
  return sp ? { actor: sp.actor, special: sp.special } : null;
}

const DECISION: Record<string, string> = {
  'draft>submitted': 'submitted',
  'clarification_requested>submitted': 'resubmitted',
  'submitted>in_review': 'claimed',
  'in_review>published': 'published',
  'in_review>rejected': 'rejected',
  'in_review>clarification_requested': 'clarification_requested',
  'published>withdrawn': 'withdrawn',
  'unpublished>withdrawn': 'withdrawn',
  'published>unpublished': 'unpublished',
  'unpublished>published': 'reinstated',
  'published>submitted': 'revision_submitted',
  'draft>published': 'shared_with_organisation',
};
const decisionFor = (from: S, to: S) => DECISION[`${from}>${to}`] ?? (to === 'withdrawn' ? 'withdrawn' : `${from}>${to}`);

export interface TransitionOpts {
  /** Shown to the contributor. */
  reasonPublic?: string | null;
  /** Moderator-only. Never shown to authors or other tenants. */
  internalNote?: string | null;
  sharedId?: string | null;
  special?: Special;
  /** Extra column updates applied in the SAME compare-and-set statement. */
  set?: Partial<typeof schema.contributions.$inferInsert>;
  /** Extra writes in the SAME database transaction (use ONLY the tx handle inside). */
  inTx?: (tx: Tx, updated: Contribution) => Promise<void>;
}
export type TransitionResult = { ok: true; from: S; to: S; contribution: Contribution; eventId: string; decision: string } | Fail;

/**
 * Move a contribution along the state machine. Checks, in order: the actor can see the object at all (else not_found,
 * never revealing existence), the edge exists, the ACTOR has the authority for that edge, edge preconditions; then
 * performs an atomic compare-and-set, appends a moderation_events row, and (after commit) writes an audit event and an
 * idempotent in-app notification. Illegal and unauthorised attempts are audited as 'deny'.
 */
export async function transition(actor: Principal, contributionId: string, to: ContributionStatus, opts: TransitionOpts = {}): Promise<TransitionResult> {
  const [row] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, contributionId));
  const denyAudit = (code: string, why: string) =>
    audit({ actorId: actor.userId, actorOrgId: actor.activeOrgId, action: 'learning.transition.refused', resourceType: 'contribution', resourceId: contributionId, outcome: 'deny', meta: { code, to, why } });

  const asAuthor = !!row && isAuthor(actor, row);
  const asModerator = !!row && hasGrant(actor, 'learning_moderator') && moderatorVisible(row);
  if (!row || (!asAuthor && !asModerator)) {
    await denyAudit('not_found', 'actor cannot see object');
    return fail('not_found', 'Not found');
  }
  const from = row.status;
  const edge = edgeFor(from, to, opts.special);
  if (!edge) {
    await denyAudit('illegal_transition', `${from}->${to}`);
    return fail('illegal_transition', `A contribution cannot move from "${from}" to "${to}".`);
  }
  if ((edge.actor === 'author' && !asAuthor) || (edge.actor === 'moderator' && !asModerator)) {
    await denyAudit('forbidden_actor', `${from}->${to} requires ${edge.actor}`);
    return fail('forbidden_actor', `Only the ${edge.actor} can move a contribution from "${from}" to "${to}".`);
  }
  // Edge preconditions that depend on the object.
  if (from === 'draft' && to === 'submitted' && row.sharingChoice !== 'community') return fail('precondition', 'Only community proposals are submitted for moderation. Organisation-only items are shared with your organisation directly; private items stay drafts.');
  if (edge.special === 'org_only' && row.sharingChoice !== 'organisation') return fail('precondition', 'Direct publication is only possible for organisation-only contributions.');
  if (edge.special === 'material_edit' && row.sharingChoice !== 'community') return fail('precondition', 'Only community contributions re-enter review.');
  if (edge.special === 'withdraw_live' && !row.currentSharedId) return fail('precondition', 'There is no live shared copy to withdraw.');
  if (edge.special === 'withdraw_pending' && row.sharingChoice !== 'community') return fail('precondition', 'Only community proposals can be withdrawn while pending.');

  const decision = decisionFor(from, to);
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.contributions)
      .set({ ...opts.set, status: to, updatedAt: new Date(), ...(to === 'submitted' ? { submittedAt: new Date() } : {}) })
      .where(and(eq(schema.contributions.id, contributionId), eq(schema.contributions.status, from)))
      .returning();
    if (!updated) return null; // lost a race: someone else moved it first
    const [ev] = await tx
      .insert(schema.moderationEvents)
      .values({ contributionId, sharedId: opts.sharedId ?? row.currentSharedId ?? null, moderatorId: actor.userId, actorRole: edge.actor, fromStatus: from, toStatus: to, decision, reasonPublic: opts.reasonPublic ?? null, internalNote: opts.internalNote ?? null })
      .returning({ id: schema.moderationEvents.id });
    await opts.inTx?.(tx, updated);
    return { updated, eventId: ev.id };
  });
  if (!result) return fail('conflict', 'This contribution was changed by someone else. Reload and try again.');

  await audit({
    actorId: actor.userId,
    actorOrgId: edge.actor === 'author' ? actor.activeOrgId : null,
    action: `learning.contribution.${decision}`,
    resourceType: 'contribution',
    resourceId: contributionId,
    orgId: row.orgId,
    meta: { from, to, version: result.updated.version, sharedId: opts.sharedId ?? row.currentSharedId ?? null },
  });
  await notifyStateChange({ contribution: result.updated, decision, eventId: result.eventId, reasonPublic: opts.reasonPublic ?? null });
  return { ok: true, from, to, contribution: result.updated, eventId: result.eventId, decision };
}

const COPY: Record<string, (title: string, org?: boolean) => { title: string; body: string }> = {
  submitted: (t) => ({ title: 'Submitted for review', body: `"${t}" was submitted for moderator review. Nothing is shared until a moderator approves a de-identified version.` }),
  resubmitted: (t) => ({ title: 'Resubmitted for review', body: `Your amended "${t}" is back in the moderation queue.` }),
  revision_submitted: (t) => ({ title: 'New version submitted for review', body: `Your edit to "${t}" needs renewed review. The previously published version stays as it is until the new one is approved.` }),
  claimed: (t) => ({ title: 'A moderator has started your review', body: `"${t}" is now in review.` }),
  clarification_requested: (t) => ({ title: 'A moderator needs clarification', body: `"${t}": please read the question and resubmit.` }),
  published: (t) => ({ title: 'Published to the community', body: `A reviewed, de-identified version of "${t}" is now available to approved participants. Your private original was not shared.` }),
  rejected: (t) => ({ title: 'Not published', body: `"${t}" will not be published. It stays private.` }),
  unpublished: (t) => ({ title: 'Temporarily unpublished', body: `The shared version of "${t}" was taken offline while a concern is reviewed.` }),
  reinstated: (t) => ({ title: 'Published again', body: `The shared version of "${t}" is live again after review.` }),
  withdrawn: (t) => ({ title: 'Withdrawal complete', body: `"${t}" was withdrawn. It is no longer available to the audience it was shared with, and any shared copy was removed from search and caches. Already-viewed material and third-party copies cannot be recalled automatically.` }),
  shared_with_organisation: (t) => ({ title: 'Shared with your organisation', body: `"${t}" is now visible to members of your organisation only. It is not shared with other clients.` }),
};

/** In-app (P0) notification(s) for a state change. Idempotent per moderation event. Email is P1 and never claimed as delivered. */
export async function notifyStateChange(a: { contribution: Contribution; decision: string; eventId: string; reasonPublic?: string | null }) {
  const c = a.contribution;
  const copy = COPY[a.decision]?.(c.title);
  if (!copy) return;
  const body = [copy.body, a.reasonPublic ? `Moderator message: ${a.reasonPublic}` : null].filter(Boolean).join('\n');
  await notify({ userId: c.authorId, kind: `learning.${a.decision}`, title: copy.title, body, link: `/learn/c/${c.id}`, dedupeKey: `learn:${a.eventId}` });
  if (['submitted', 'resubmitted', 'revision_submitted'].includes(a.decision) && c.sharingChoice === 'community') {
    const mods = await db.select({ u: schema.grants.userId }).from(schema.grants).where(and(eq(schema.grants.permission, 'learning_moderator'), isNull(schema.grants.revokedAt)));
    for (const m of mods) await notify({ userId: m.u, kind: 'moderation.queue', title: 'New contribution awaiting review', body: `"${c.title}" (${a.decision.replace('_', ' ')}).`, link: `/moderation/${c.id}`, dedupeKey: `learn:${a.eventId}:mod:${m.u}` });
  }
}
