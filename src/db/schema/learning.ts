import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { createdAt, pk, ts } from './_shared';

export const CONTRIBUTION_KINDS = [
  'market_observation',
  'emerging_trend',
  'product_gap',
  'operational_challenge',
  'successful_practice',
  'improvement_suggestion',
] as const;

export const CONTRIBUTION_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'clarification_requested',
  'published',
  'rejected',
  'withdrawn',
  'unpublished',
] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

/**
 * PRIVATE SOURCE record. Owned by a tenant. Never serialised to anyone outside the tenant, except that a moderator
 * may read a contribution that has been explicitly submitted for review. Drafts are never visible to moderators.
 * Published copies live in shared_contributions and contain only reviewed fields.
 */
export const contributions = pgTable(
  'contributions',
  {
    id: pk('con'),
    orgId: text('org_id').notNull(),
    authorId: text('author_id').notNull(),
    kind: text('kind').$type<(typeof CONTRIBUTION_KINDS)[number]>().notNull(),
    title: text('title').notNull(),
    observation: text('observation').notNull(),
    offeringSlug: text('offering_slug'),
    industry: text('industry'),
    region: text('region'),
    observationPeriod: text('observation_period'),
    evidenceType: text('evidence_type').$type<'first_hand' | 'aggregate_metric' | 'external_report' | 'anecdotal'>(),
    confidence: text('confidence').$type<'low' | 'medium' | 'high'>(),
    topic: text('topic'),
    supportLinks: jsonb('support_links').$type<string[]>(),
    /** private = author only, organisation = my org, community = PROPOSED for the shared learning community (needs review). */
    sharingChoice: text('sharing_choice').$type<'private' | 'organisation' | 'community'>().notNull().default('private'),
    status: text('status').$type<ContributionStatus>().notNull().default('draft'),
    version: integer('version').notNull().default(1),
    sensitiveFlags: jsonb('sensitive_flags').$type<{ type: string; excerpt: string; field: string }[]>(),
    sensitiveAcknowledged: boolean('sensitive_acknowledged').notNull().default(false),
    /** Public-facing reason shown to the contributor on return / rejection / unpublish. */
    lastModeratorMessage: text('last_moderator_message'),
    currentSharedId: text('current_shared_id'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').defaultNow(),
    submittedAt: ts('submitted_at'),
  },
  (t) => [index('contrib_org').on(t.orgId), index('contrib_author').on(t.authorId), index('contrib_status').on(t.status)],
);

export const CONSENT_PURPOSES = ['store_process', 'publish_shared', 'attribution', 'training'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/** Append-only consent history. Current state = latest row per (contribution, purpose). Membership != consent. */
export const contributionConsents = pgTable(
  'contribution_consents',
  {
    id: pk('cns'),
    contributionId: text('contribution_id').notNull(),
    userId: text('user_id').notNull(),
    purpose: text('purpose').$type<ConsentPurpose>().notNull(),
    granted: boolean('granted').notNull(),
    contributionVersion: integer('contribution_version').notNull(),
    note: text('note'),
    at: createdAt(),
  },
  (t) => [index('consent_contrib').on(t.contributionId)],
);

/**
 * APPROVED SHARED REPRESENTATION. Contains only reviewed fields. org_id is kept for distinct-organisation counting
 * and MUST NEVER be included in any response payload. `id` is an opaque public id.
 */
export const sharedContributions = pgTable(
  'shared_contributions',
  {
    id: pk('shr'),
    contributionId: text('contribution_id').notNull(),
    orgId: text('org_id').notNull(), // INTERNAL ONLY
    version: integer('version').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    offeringSlug: text('offering_slug'),
    industry: text('industry'), // generalised by moderator
    region: text('region'), // generalised by moderator
    periodLabel: text('period_label'), // generalised by moderator
    topic: text('topic'),
    evidenceType: text('evidence_type'),
    confidence: text('confidence'),
    evidenceQuality: text('evidence_quality').$type<'unassessed' | 'weak' | 'moderate' | 'strong'>().notNull().default('unassessed'),
    /** Only set when the contributor consented to attribution AND a moderator approved it. */
    attributionLabel: text('attribution_label'),
    status: text('status').$type<'published' | 'unpublished' | 'withdrawn' | 'superseded'>().notNull().default('published'),
    publishedBy: text('published_by'),
    publishedAt: ts('published_at'),
    withdrawnAt: ts('withdrawn_at'),
    createdAt: createdAt(),
  },
  (t) => [index('shared_status').on(t.status), index('shared_contrib').on(t.contributionId)],
);

/** Moderator decisions. internal_note is never exposed outside moderators/admin-with-authorisation. */
export const moderationEvents = pgTable(
  'moderation_events',
  {
    id: pk('mod'),
    contributionId: text('contribution_id').notNull(),
    sharedId: text('shared_id'),
    moderatorId: text('moderator_id').notNull(),
    decision: text('decision').notNull(),
    reasonPublic: text('reason_public'),
    internalNote: text('internal_note'),
    at: createdAt(),
  },
  (t) => [index('modev_contrib').on(t.contributionId)],
);

export const reports = pgTable('reports', {
  id: pk('rep'),
  sharedId: text('shared_id').notNull(),
  /** Reporter identity stays within moderation; never disclosed to the contributor or other clients. */
  reporterId: text('reporter_id').notNull(),
  reporterOrgId: text('reporter_org_id'),
  reason: text('reason').$type<'misleading' | 'confidential' | 'inappropriate'>().notNull(),
  details: text('details'),
  status: text('status').$type<'open' | 'actioned' | 'dismissed'>().notNull().default('open'),
  decisionNote: text('decision_note'),
  decidedBy: text('decided_by'),
  decidedAt: ts('decided_at'),
  createdAt: createdAt(),
});

/** Denormalised search/retrieval index over APPROVED shared representations only. Rows are removed on withdrawal. */
export const searchIndex = pgTable('search_index', {
  sharedId: text('shared_id').primaryKey(),
  text: text('text').notNull(),
  terms: jsonb('terms').$type<Record<string, number>>().notNull(),
  indexedAt: createdAt(),
});

/** Cache of search/AIRA retrieval results. Entries referencing a withdrawn id are purged synchronously. */
export const retrievalCache = pgTable('retrieval_cache', {
  key: text('key').primaryKey(),
  scope: text('scope').notNull(),
  resultIds: jsonb('result_ids').$type<string[]>().notNull(),
  payload: jsonb('payload').$type<unknown>(),
  createdAt: createdAt(),
});

/** Comments inherit the audience of the parent resource at read time. */
export const comments = pgTable(
  'comments',
  {
    id: pk('cmt'),
    parentType: text('parent_type').$type<'shared' | 'theme' | 'idea' | 'event' | 'resource'>().notNull(),
    parentId: text('parent_id').notNull(),
    authorId: text('author_id').notNull(),
    authorOrgId: text('author_org_id'),
    body: text('body').notNull(),
    status: text('status').$type<'visible' | 'hidden' | 'removed'>().notNull().default('visible'),
    createdAt: createdAt(),
  },
  (t) => [index('comments_parent').on(t.parentType, t.parentId)],
);

export const bookmarks = pgTable(
  'bookmarks',
  {
    id: pk('bkm'),
    userId: text('user_id').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('bookmarks_unique').on(t.userId, t.targetType, t.targetId)],
);

export const savedSearches = pgTable('saved_searches', {
  id: pk('sav'),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  query: text('query'),
  filters: jsonb('filters').$type<Record<string, string>>(),
  createdAt: createdAt(),
});

export const feedbackVotes = pgTable(
  'feedback_votes',
  {
    id: pk('fbv'),
    userId: text('user_id').notNull(),
    sharedId: text('shared_id').notNull(),
    vote: text('vote').$type<'useful' | 'needs_evidence'>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('fbv_unique').on(t.userId, t.sharedId)],
);
