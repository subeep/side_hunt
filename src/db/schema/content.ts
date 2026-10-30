import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { audienceCols, createdAt, pk, ts } from './_shared';

/** Banners, public pages/perspectives, lab posts, client resources/briefings. Owned by: public site + publisher agent. */
export const contentItems = pgTable(
  'content_items',
  {
    id: pk('cnt'),
    kind: text('kind').$type<'banner' | 'page' | 'perspective' | 'lab' | 'resource' | 'briefing'>().notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    body: text('body'),
    status: text('status').$type<'draft' | 'published' | 'archived'>().notNull().default('draft'),
    ...audienceCols(),
    startsAt: ts('starts_at'),
    endsAt: ts('ends_at'),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    authorId: text('author_id'),
    publishedAt: ts('published_at'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').defaultNow(),
  },
  (t) => [index('content_kind_status').on(t.kind, t.status)],
);

/** Media is stored in the DB and ONLY served through an authorising route handler. Never from /public. */
export const media = pgTable('media', {
  id: pk('med'),
  title: text('title').notNull(),
  description: text('description'),
  kind: text('kind').$type<'video' | 'image' | 'document'>().notNull(),
  mime: text('mime').notNull(),
  /** Text payload (SVG / VTT / markdown). Synthetic demo assets only. */
  data: text('data').notNull(),
  posterSvg: text('poster_svg'),
  durationSec: integer('duration_sec'),
  transcript: text('transcript'),
  status: text('status').$type<'draft' | 'published'>().notNull().default('draft'),
  ...audienceCols(),
  uploadedBy: text('uploaded_by'),
  createdAt: createdAt(),
});

/** Live sessions, webinars, client briefings, hackathon sessions + their recordings. */
export const events = pgTable('events', {
  id: pk('evt'),
  title: text('title').notNull(),
  description: text('description'),
  kind: text('kind').$type<'live' | 'webinar' | 'briefing' | 'hackathon_session'>().notNull(),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at'),
  status: text('status').$type<'scheduled' | 'live' | 'ended' | 'cancelled'>().notNull().default('scheduled'),
  /** Join link / dial-in. Only returned to principals the audience permits. */
  joinInfo: text('join_info'),
  recordingMediaId: text('recording_media_id'),
  ...audienceCols(),
  hostId: text('host_id'),
  createdAt: createdAt(),
});

/** Public enquiries: demo requests, hackathon interest, contact. Write-only for the public. */
export const leads = pgTable('leads', {
  id: pk('led'),
  kind: text('kind').$type<'demo' | 'hackathon' | 'contact'>().notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company'),
  role: text('role'),
  message: text('message'),
  interests: jsonb('interests').$type<string[]>(),
  status: text('status').$type<'new' | 'contacted' | 'closed'>().notNull().default('new'),
  createdAt: createdAt(),
});

/** Playground (employee) and Sandbox (client) runs: synthetic data only, isolated by user + tenant. */
export const playgroundRuns = pgTable(
  'playground_runs',
  {
    id: pk('run'),
    mode: text('mode').$type<'employee' | 'client'>().notNull(),
    userId: text('user_id').notNull(),
    /** Tenant for client runs (taken from the session's active workspace, never from user input). NULL for employee runs. */
    orgId: text('org_id'),
    offeringSlug: text('offering_slug').notNull(),
    scenarioSlug: text('scenario_slug').notNull(),
    inputs: jsonb('inputs').$type<Record<string, unknown>>().notNull(),
    output: jsonb('output').$type<Record<string, unknown>>().notNull(),
    feedback: jsonb('feedback').$type<{ rating?: string; comment?: string }>(),
    createdAt: createdAt(),
  },
  (t) => [index('runs_user').on(t.userId), index('runs_org').on(t.orgId)],
);

/** Employee experiments, hackathon team spaces, release notes, knowledge library. Employees-only by construction. */
export const employeeItems = pgTable('employee_items', {
  id: pk('emp'),
  kind: text('kind').$type<'experiment' | 'team' | 'release_note' | 'knowledge' | 'internal_note'>().notNull(),
  title: text('title').notNull(),
  body: text('body'),
  ownerId: text('owner_id'),
  reviewDate: ts('review_date'),
  status: text('status').notNull().default('open'),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').defaultNow(),
});

export const employeeItemFeedback = pgTable('employee_item_feedback', {
  id: pk('efb'),
  itemId: text('item_id').notNull(),
  userId: text('user_id').notNull(),
  rating: text('rating'),
  comment: text('comment'),
  createdAt: createdAt(),
});

/** Simulated support-ticket integration for client workspaces. */
export const supportTickets = pgTable('support_tickets', {
  id: pk('tkt'),
  orgId: text('org_id').notNull(),
  userId: text('user_id').notNull(),
  subject: text('subject').notNull(),
  body: text('body'),
  status: text('status').$type<'open' | 'pending' | 'closed'>().notNull().default('open'),
  createdAt: createdAt(),
});
