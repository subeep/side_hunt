import type { Db } from '../index';
import * as schema from '../schema';

/** Fixed ids so tests, docs and other seed files can reference them. */
export const ORG = { azentio: 'org_azentio', northwind: 'org_northwind', harbor: 'org_harbor', atlas: 'org_atlas' } as const;
export const USER = {
  admin: 'usr_admin',
  moderator: 'usr_moderator',
  publisher: 'usr_publisher',
  owner: 'usr_owner',
  employee: 'usr_employee',
  nwAdmin: 'usr_nw_admin',
  nwMember: 'usr_nw_member',
  hbAdmin: 'usr_hb_admin',
  hbMember: 'usr_hb_member',
  atAdmin: 'usr_at_admin',
  atMember: 'usr_at_member',
  multi: 'usr_multi',
  outsider: 'usr_outsider',
} as const;

export const DEMO_PERSONAS: { id: string; email: string; name: string; label: string; description: string }[] = [
  { id: USER.admin, email: 'admin@azentio.com', name: 'Avery Admin', label: 'Portal administrator', description: 'Manages organisations, role grants and audit. No access to private client content without a support authorisation.' },
  { id: USER.moderator, email: 'moderator@azentio.com', name: 'Morgan Moderator', label: 'Learning moderator', description: 'Reviews submitted observations, redacts, publishes, rejects, handles reports.' },
  { id: USER.publisher, email: 'publisher@azentio.com', name: 'Parker Publisher', label: 'Content publisher', description: 'Manages banners, public content and video audiences. No identity administration.' },
  { id: USER.owner, email: 'owner@azentio.com', name: 'Oakley Owner', label: 'Product owner', description: 'Connects approved themes to improvement ideas and communicates status.' },
  { id: USER.employee, email: 'employee@azentio.com', name: 'Eden Employee', label: 'Employee (no grants)', description: 'Employee portal only. Employee status implies no admin, moderation or publishing power.' },
  { id: USER.nwAdmin, email: 'admin@northwind.example', name: 'Nia Northwind', label: 'Northwind – client administrator', description: 'Invites and manages roles inside Northwind Credit Union only.' },
  { id: USER.nwMember, email: 'member@northwind.example', name: 'Noah Northwind', label: 'Northwind – client member', description: 'Own-organisation workspace, entitled demos, observations.' },
  { id: USER.hbAdmin, email: 'admin@harbor.example', name: 'Hana Harbor', label: 'Harbor – client administrator', description: 'Administrator of Harbor Microfinance.' },
  { id: USER.hbMember, email: 'member@harbor.example', name: 'Hugo Harbor', label: 'Harbor – client member', description: 'Member of Harbor Microfinance.' },
  { id: USER.atAdmin, email: 'admin@atlas.example', name: 'Ada Atlas', label: 'Atlas – client administrator', description: 'Administrator of Atlas Regional Bank.' },
  { id: USER.atMember, email: 'member@atlas.example', name: 'Arlo Atlas', label: 'Atlas – client member', description: 'Member of Atlas Regional Bank.' },
  { id: USER.multi, email: 'multi@consultant.example', name: 'Mira Multi', label: 'Multi-workspace client user', description: 'Member of Northwind and Harbor; must pick an explicit active workspace.' },
];

export async function seedCore(db: Db) {
  const s = schema;
  await db.insert(s.organisations).values([
    { id: ORG.azentio, name: 'Azentio (internal)', slug: 'azentio', kind: 'internal' },
    { id: ORG.northwind, name: 'Northwind Credit Union', slug: 'northwind', kind: 'client', industry: 'Credit union', region: 'North America' },
    { id: ORG.harbor, name: 'Harbor Microfinance', slug: 'harbor', kind: 'client', industry: 'Microfinance', region: 'South-East Asia' },
    { id: ORG.atlas, name: 'Atlas Regional Bank', slug: 'atlas', kind: 'client', industry: 'Retail & SME banking', region: 'Europe' },
  ]).onConflictDoNothing();

  await db.insert(s.orgSettings).values([
    { orgId: ORG.northwind, communityStatus: 'approved', termsVersion: '2026-10' },
    { orgId: ORG.harbor, communityStatus: 'approved', termsVersion: '2026-10' },
    { orgId: ORG.atlas, communityStatus: 'approved', termsVersion: '2026-10' },
  ]).onConflictDoNothing();

  await db.insert(s.users).values(DEMO_PERSONAS.map((p) => ({ id: p.id, email: p.email, name: p.name, isDemoPersona: true }))).onConflictDoNothing();
  await db.insert(s.users).values({ id: USER.outsider, email: 'random@gmail.example', name: 'Random Outsider' }).onConflictDoNothing();

  await db.insert(s.employeeAllowlist).values(
    DEMO_PERSONAS.filter((p) => p.email.endsWith('@azentio.com')).map((p) => ({ email: p.email, name: p.name, addedBy: 'seed' })),
  ).onConflictDoNothing();

  const emp = (userId: string) => ({ userId, orgId: ORG.azentio, role: 'employee' as const });
  const cli = (userId: string, orgId: string, role: 'client_member' | 'client_admin') => ({ userId, orgId, role });
  await db.insert(s.memberships).values([
    emp(USER.admin), emp(USER.moderator), emp(USER.publisher), emp(USER.owner), emp(USER.employee),
    cli(USER.nwAdmin, ORG.northwind, 'client_admin'), cli(USER.nwMember, ORG.northwind, 'client_member'),
    cli(USER.hbAdmin, ORG.harbor, 'client_admin'), cli(USER.hbMember, ORG.harbor, 'client_member'),
    cli(USER.atAdmin, ORG.atlas, 'client_admin'), cli(USER.atMember, ORG.atlas, 'client_member'),
    cli(USER.multi, ORG.northwind, 'client_member'), cli(USER.multi, ORG.harbor, 'client_member'),
  ]).onConflictDoNothing();

  await db.insert(s.grants).values([
    { id: 'grt_admin', userId: USER.admin, permission: 'portal_admin', grantedBy: 'seed' },
    { id: 'grt_moderator', userId: USER.moderator, permission: 'learning_moderator', grantedBy: 'seed' },
    { id: 'grt_publisher_c', userId: USER.publisher, permission: 'content_publisher', grantedBy: 'seed' },
    { id: 'grt_publisher_v', userId: USER.publisher, permission: 'video_publisher', grantedBy: 'seed' },
    { id: 'grt_owner', userId: USER.owner, permission: 'product_owner', grantedBy: 'seed' },
  ]).onConflictDoNothing();

  await db.insert(s.products).values([
    { slug: 'credit-strategy-simulator', name: 'Credit Strategy Simulator', category: 'Credit policy intelligence', tagline: 'Simulate credit policy changes before deployment.', summary: 'Explore potential effects on approvals, risk exposure, and portfolio outcomes before a policy change goes live.', sortOrder: 1, details: { capabilities: ['Simulate policy changes', 'Compare approval and risk outcomes', 'Evidence-backed recommendations'], workflow: ['Choose a policy lever', 'Run against a synthetic portfolio', 'Review simulated outcomes'], sandboxScenario: 'policy-what-if' } },
    { slug: 'sme-credit-decisioning', name: 'SME Credit Decisioning Workbench', category: 'Explainable credit intelligence', tagline: 'Financial analysis, policy evaluation and recommendations in one workbench.', summary: 'Bring financial analysis, policy evaluation, risk review, and credit recommendations together with evidence and human oversight.', sortOrder: 2, details: { capabilities: ['Financial spreading', 'Policy evaluation', 'Risk review', 'Human oversight and audit trail'], workflow: ['Load a synthetic applicant', 'Evaluate against policy', 'Inspect evidence', 'Record a human decision'], sandboxScenario: 'sme-application' } },
    { slug: 'similar-portfolio-intelligence', name: 'Similar Portfolio Intelligence', category: 'Contextual portfolio insights', tagline: 'Compare applications with relevant historical segments.', summary: 'Understand patterns, risk indicators and comparable outcomes by comparing financing applications with relevant historical portfolio segments.', sortOrder: 3, details: { capabilities: ['Segment matching', 'Pattern and risk indicators', 'Comparable outcomes'], workflow: ['Pick an application', 'Find similar segments', 'Compare outcomes'], sandboxScenario: 'segment-compare' } },
    { slug: 'riva', name: 'RIVA', category: 'Reporting intelligence, validation & analytics', tagline: 'Configurable reporting, field mapping and validation.', summary: 'A configurable reporting environment connecting data sources, mapping report fields, supporting validation, and simplifying reporting workflows.', sortOrder: 4, details: { capabilities: ['Data source mapping', 'Report field mapping', 'Validation rules', 'Reporting workflow'], workflow: ['Map fields', 'Run validation', 'Review exceptions'], sandboxScenario: 'report-validation' } },
  ]).onConflictDoNothing();

  await db.insert(s.entitlements).values([
    { orgId: ORG.northwind, productSlug: 'credit-strategy-simulator' },
    { orgId: ORG.northwind, productSlug: 'sme-credit-decisioning' },
    { orgId: ORG.northwind, productSlug: 'similar-portfolio-intelligence' },
    { orgId: ORG.harbor, productSlug: 'sme-credit-decisioning' },
    { orgId: ORG.harbor, productSlug: 'riva' },
    { orgId: ORG.atlas, productSlug: 'credit-strategy-simulator' },
    { orgId: ORG.atlas, productSlug: 'similar-portfolio-intelligence' },
  ]).onConflictDoNothing();
}
