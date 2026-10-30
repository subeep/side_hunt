import { index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { createdAt, pk, ts } from './_shared';

export const IDEA_STATUSES = ['proposed', 'under_review', 'planned', 'in_progress', 'released', 'not_proceeding'] as const;

/** Themes group APPROVED shared contributions. Never contains private source data. */
export const themes = pgTable('themes', {
  id: pk('thm'),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  offeringSlug: text('offering_slug'),
  topic: text('topic'),
  caveat: text('caveat'),
  status: text('status').$type<'active' | 'archived'>().notNull().default('active'),
  createdBy: text('created_by').notNull().default('system'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').defaultNow(),
});

export const themeMembers = pgTable(
  'theme_members',
  {
    themeId: text('theme_id').notNull(),
    sharedId: text('shared_id').notNull(),
    addedBy: text('added_by').notNull().default('system'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.themeId, t.sharedId] })],
);

export const ideas = pgTable(
  'ideas',
  {
    id: pk('ida'),
    title: text('title').notNull(),
    problem: text('problem').notNull(),
    offeringSlug: text('offering_slug'),
    proposedOutcome: text('proposed_outcome').notNull(),
    ownerUserId: text('owner_user_id'),
    team: text('team'),
    priority: text('priority').$type<'low' | 'medium' | 'high'>().notNull().default('medium'),
    status: text('status').$type<(typeof IDEA_STATUSES)[number]>().notNull().default('proposed'),
    themeId: text('theme_id'),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').defaultNow(),
  },
  (t) => [index('ideas_status').on(t.status)],
);

export const ideaEvidence = pgTable(
  'idea_evidence',
  {
    ideaId: text('idea_id').notNull(),
    sharedId: text('shared_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.ideaId, t.sharedId] })],
);

export const ideaStatusHistory = pgTable('idea_status_history', {
  id: pk('ish'),
  ideaId: text('idea_id').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  actorId: text('actor_id').notNull(),
  note: text('note'),
  at: createdAt(),
});

/** Audience-appropriate, plain-language update shown to clients. Must not expose private tickets / roadmap commitments. */
export const ideaUpdates = pgTable('idea_updates', {
  id: pk('iup'),
  ideaId: text('idea_id').notNull(),
  message: text('message').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: createdAt(),
});

export const digestSubscriptions = pgTable('digest_subscriptions', {
  userId: text('user_id').primaryKey(),
  frequency: text('frequency').$type<'off' | 'weekly' | 'monthly'>().notNull().default('weekly'),
  topics: jsonb('topics').$type<string[]>(),
  lastSentAt: ts('last_sent_at'),
});

/** Log of AIRA questions. Stores cited ids only (all ids are approved shared contributions). */
export const airaQueries = pgTable('aira_queries', {
  id: pk('aq'),
  userId: text('user_id'),
  orgId: text('org_id'),
  surface: text('surface').notNull().default('portal'),
  question: text('question').notNull(),
  citedSharedIds: jsonb('cited_shared_ids').$type<string[]>().notNull(),
  mode: text('mode').notNull().default('extractive'),
  createdAt: createdAt(),
});

/**
 * Per-user ledger of RELEASED aggregate statistics (differencing guard). Stores the item-id set behind each statistic a
 * user has been shown, so a later statistic that differs from an earlier one by fewer than MIN_COHORT_ORGS organisations
 * can be suppressed. Internal only; never serialised.
 */
export const statLedger = pgTable(
  'stat_ledger',
  {
    id: pk('stl'),
    userId: text('user_id').notNull(),
    setHash: text('set_hash').notNull(),
    itemIds: jsonb('item_ids').$type<string[]>().notNull(),
    orgs: integer('orgs').notNull(),
    items: integer('items').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('stat_ledger_user').on(t.userId, t.createdAt)],
);

/** Placeholder to keep drizzle from tree-shaking `integer` import in this file. */
export const _insightsMeta = pgTable('insights_meta', { key: text('key').primaryKey(), n: integer('n') });
