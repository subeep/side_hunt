import { boolean, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { createdAt, pk, ts } from './_shared';

export const organisations = pgTable('organisations', {
  id: pk('org'),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  kind: text('kind').$type<'internal' | 'client'>().notNull(),
  industry: text('industry'),
  region: text('region'),
  status: text('status').$type<'active' | 'suspended'>().notNull().default('active'),
  createdAt: createdAt(),
});

export const orgSettings = pgTable('org_settings', {
  orgId: text('org_id').primaryKey(),
  /** Is the organisation an approved participant in the cross-client learning community? */
  communityStatus: text('community_status').$type<'none' | 'pending' | 'approved' | 'revoked'>().notNull().default('none'),
  communityApprovedBy: text('community_approved_by'),
  termsVersion: text('terms_version'),
  updatedAt: ts('updated_at').defaultNow(),
});

export const users = pgTable('users', {
  id: pk('usr'),
  email: text('email').notNull().unique(), // always stored lowercased
  name: text('name').notNull(),
  status: text('status').$type<'active' | 'disabled'>().notNull().default('active'),
  isDemoPersona: boolean('is_demo_persona').notNull().default(false),
  createdAt: createdAt(),
  lastLoginAt: ts('last_login_at'),
});

export const memberships = pgTable(
  'memberships',
  {
    id: pk('mem'),
    userId: text('user_id').notNull(),
    orgId: text('org_id').notNull(),
    role: text('role').$type<'employee' | 'client_member' | 'client_admin'>().notNull(),
    status: text('status').$type<'active' | 'revoked'>().notNull().default('active'),
    createdAt: createdAt(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [uniqueIndex('memberships_user_org').on(t.userId, t.orgId), index('memberships_org').on(t.orgId)],
);

/** Platform grants are separate, explicit permissions. Employee status never implies any of them. */
export const GRANTS = [
  'portal_admin',
  'learning_moderator',
  'content_publisher',
  'video_publisher',
  'product_owner',
] as const;
export type GrantName = (typeof GRANTS)[number];

export const grants = pgTable(
  'grants',
  {
    id: pk('grt'),
    userId: text('user_id').notNull(),
    permission: text('permission').$type<GrantName>().notNull(),
    grantedBy: text('granted_by'),
    createdAt: createdAt(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [index('grants_user').on(t.userId)],
);

/** Organiser-approved employee provisioning. Only allowlisted @azentio.com identities become employees. */
export const employeeAllowlist = pgTable('employee_allowlist', {
  email: text('email').primaryKey(),
  name: text('name').notNull(),
  addedBy: text('added_by'),
  status: text('status').$type<'active' | 'revoked'>().notNull().default('active'),
  createdAt: createdAt(),
});

export const invitations = pgTable(
  'invitations',
  {
    id: pk('inv'),
    orgId: text('org_id').notNull(),
    email: text('email').notNull(),
    role: text('role').$type<'client_member' | 'client_admin'>().notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: text('invited_by').notNull(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    usedBy: text('used_by'),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [index('invitations_org').on(t.orgId), index('invitations_email').on(t.email)],
);

export const loginCodes = pgTable(
  'login_codes',
  {
    id: pk('lgc'),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('login_codes_email').on(t.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: pk('ses'),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    activeOrgId: text('active_org_id'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [index('sessions_user').on(t.userId)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: pk('aud'),
    at: createdAt(),
    actorId: text('actor_id'),
    actorOrgId: text('actor_org_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    orgId: text('org_id'),
    outcome: text('outcome').$type<'ok' | 'deny'>().notNull().default('ok'),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
  },
  (t) => [index('audit_at').on(t.at), index('audit_actor').on(t.actorId), index('audit_action').on(t.action)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: pk('ntf'),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    /** Idempotency: the same dedupe key never produces a second notification. */
    dedupeKey: text('dedupe_key').notNull().unique(),
    emailStatus: text('email_status').$type<'none' | 'queued' | 'sent' | 'failed'>().notNull().default('none'),
    createdAt: createdAt(),
    readAt: ts('read_at'),
  },
  (t) => [index('notifications_user').on(t.userId, t.readAt)],
);

export const emailOutbox = pgTable('email_outbox', {
  id: pk('eml'),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  purpose: text('purpose').notNull(),
  dedupeKey: text('dedupe_key').notNull().unique(),
  /** queued != sent != delivered. We never claim "delivered": only the provider hand-off is recorded. */
  status: text('status').$type<'queued' | 'sent' | 'failed'>().notNull().default('queued'),
  provider: text('provider'),
  providerMessageId: text('provider_message_id'),
  error: text('error'),
  createdAt: createdAt(),
  sentAt: ts('sent_at'),
});

export const products = pgTable('products', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  tagline: text('tagline').notNull(),
  summary: text('summary').notNull(),
  details: jsonb('details').$type<{ capabilities?: string[]; workflow?: string[]; sandboxScenario?: string }>(),
  sortOrder: integer('sort_order').notNull().default(0),
  status: text('status').$type<'active' | 'retired'>().notNull().default('active'),
});

export const entitlements = pgTable(
  'entitlements',
  {
    orgId: text('org_id').notNull(),
    productSlug: text('product_slug').notNull(),
    grantedBy: text('granted_by'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.productSlug] })],
);

/** Portal administrators may only see a client's private content under an explicit, time-boxed, audited authorisation. */
export const supportAuthorisations = pgTable('support_authorisations', {
  id: pk('sup'),
  adminId: text('admin_id').notNull(),
  orgId: text('org_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status').$type<'active' | 'revoked'>().notNull().default('active'),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
});

export const termsAcceptances = pgTable(
  'terms_acceptances',
  {
    id: pk('trm'),
    userId: text('user_id').notNull(),
    orgId: text('org_id').notNull(),
    termsVersion: text('terms_version').notNull(),
    /** Joining a workspace is NOT consent to share or train. This only records that the explanation was shown/acknowledged. */
    learningExplained: boolean('learning_explained').notNull().default(false),
    acceptedAt: createdAt(),
  },
  (t) => [uniqueIndex('terms_user_org_ver').on(t.userId, t.orgId, t.termsVersion)],
);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: ts('window_start').notNull(),
  count: integer('count').notNull().default(0),
});
