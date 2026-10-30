import type { Db } from '../index';
import * as schema from '../schema';
import { ORG, USER } from './core';
import { demoPosterSvg, demoVideoSvg } from '../../lib/public/synthetic';

/** Owned by the public feature agent. Idempotent (fixed ids, onConflictDoNothing). Synthetic data only. */
export const MEDIA = {
  pubCredit: 'med_seed_pub_credit_sim',
  pubSme: 'med_seed_pub_sme',
  pubPortfolio: 'med_seed_pub_portfolio',
  pubRiva: 'med_seed_pub_riva',
  empRecording: 'med_seed_emp_recording',
  rivaDemo: 'med_seed_riva_demo',
  nwPrivate: 'med_seed_nw_private',
  draftPublic: 'med_seed_draft_public',
  noAudience: 'med_seed_no_audience',
} as const;
export const CONTENT = {
  bannerHackathon: 'cnt_seed_banner_hackathon',
  bannerEmployees: 'cnt_seed_banner_employees',
  bannerDraft: 'cnt_seed_banner_draft',
  bannerExpired: 'cnt_seed_banner_expired',
  perspInternal: 'cnt_seed_persp_internal',
} as const;
export const EVENT = { webinar: 'evt_seed_public_webinar', recap: 'evt_seed_public_recap' } as const;

const DAY = 86400_000;
const chapters = (...t: [number, string][]) => t.map(([s, title]) => ({ t: s, title }));

export async function seedPublic(db: Db) {
  const now = Date.now();
  const at = (days: number) => new Date(now + days * DAY);

  type V = { id: string; title: string; description: string; sub: string; product: string | null; dur: number; transcript: string; chapters: { t: number; title: string }[]; status?: 'draft' | 'published'; aud: { audienceKind: 'public' | 'employees' | 'org' | 'product' | null; audienceOrgId?: string; audienceProduct?: string }; age: number };
  const videos: V[] = [
    { id: MEDIA.pubCredit, title: 'Credit Strategy Simulator: policy what-if', sub: 'Product showcase', product: 'credit-strategy-simulator', dur: 75, description: 'A short walkthrough of simulating a policy change on a synthetic portfolio.', aud: { audienceKind: 'public' }, age: -9,
      transcript: '00:00 Welcome. This is a synthetic walkthrough, not real client data.\n00:20 Pick a policy lever, for example a minimum score cut-off.\n00:45 The simulator compares approvals and risk across a synthetic portfolio.\n01:05 Outputs are illustrations to discuss, never an approved credit decision.',
      chapters: chapters([0, 'Introduction'], [20, 'Choose a lever'], [45, 'Compare outcomes'], [65, 'Reading the results']) },
    { id: MEDIA.pubSme, title: 'SME Credit Decisioning Workbench in two minutes', sub: 'Product showcase', product: 'sme-credit-decisioning', dur: 90, description: 'Financial analysis, policy evaluation and evidence in one workbench, with a human making the decision.', aud: { audienceKind: 'public' }, age: -8,
      transcript: '00:00 A synthetic applicant is loaded into the workbench.\n00:30 Financial spreading and policy checks run side by side.\n01:00 Evidence is listed for each recommendation.\n01:20 A person records the final decision; the audit trail is kept.',
      chapters: chapters([0, 'Applicant'], [30, 'Analysis and policy'], [60, 'Evidence'], [80, 'Human decision']) },
    { id: MEDIA.pubPortfolio, title: 'Similar Portfolio Intelligence: finding comparable segments', sub: 'Product showcase', product: 'similar-portfolio-intelligence', dur: 60, description: 'Compare an application with relevant historical segments to see patterns and comparable outcomes.', aud: { audienceKind: 'public' }, age: -7,
      transcript: '00:00 We start from one synthetic financing application.\n00:25 Similar historical segments are matched and ranked.\n00:45 Patterns and risk indicators are compared, with caveats shown.',
      chapters: chapters([0, 'Starting point'], [25, 'Matching segments'], [45, 'Patterns and caveats']) },
    { id: MEDIA.pubRiva, title: 'RIVA: mapping, validating and reporting', sub: 'Product showcase', product: 'riva', dur: 80, description: 'Connect data sources, map report fields and validate before you submit.', aud: { audienceKind: 'public' }, age: -6,
      transcript: '00:00 RIVA connects a synthetic data source.\n00:25 Report fields are mapped and versioned.\n00:50 Validation rules flag exceptions for review.',
      chapters: chapters([0, 'Data sources'], [25, 'Field mapping'], [50, 'Validation']) },
    { id: MEDIA.empRecording, title: 'Internal: experiment readout (employees only)', sub: 'Internal recording', product: null, dur: 45, description: 'Synthetic internal readout. Employees only.', aud: { audienceKind: 'employees' }, age: -5,
      transcript: '00:00 Internal readout of a synthetic experiment.\n00:20 Notes are for employees only.', chapters: chapters([0, 'Readout'], [20, 'Notes']) },
    { id: MEDIA.rivaDemo, title: 'RIVA guided demo (entitled clients)', sub: 'Entitled demo', product: 'riva', dur: 70, description: 'Guided demo for organisations entitled to RIVA.', aud: { audienceKind: 'product', audienceProduct: 'riva' }, age: -4,
      transcript: '00:00 Guided demo for RIVA-entitled workspaces.\n00:30 Walks through a synthetic validation run.', chapters: chapters([0, 'Welcome'], [30, 'Validation run']) },
    { id: MEDIA.nwPrivate, title: 'Northwind: private briefing recording', sub: 'Organisation only', product: null, dur: 50, description: 'Synthetic briefing recording for Northwind Credit Union only.', aud: { audienceKind: 'org', audienceOrgId: ORG.northwind }, age: -3,
      transcript: '00:00 Synthetic briefing for one organisation.\n00:25 Not visible to any other tenant.', chapters: chapters([0, 'Briefing'], [25, 'Q&A']) },
    { id: MEDIA.draftPublic, title: 'Upcoming public showcase (draft)', sub: 'Draft', product: null, dur: 40, description: 'Draft public video awaiting publication.', status: 'draft', aud: { audienceKind: 'public' }, age: -2,
      transcript: '00:00 Draft transcript, not yet published.', chapters: chapters([0, 'Draft']) },
    { id: MEDIA.noAudience, title: 'Legacy upload with no audience metadata', sub: 'No audience', product: null, dur: 30, description: 'Missing audience metadata: denied to everyone until a publisher sets one.', aud: { audienceKind: null }, age: -1,
      transcript: '00:00 This item has no audience and must never be served.', chapters: chapters([0, 'Legacy']) },
  ];
  await db.insert(schema.media).values(videos.map((v) => ({
    id: v.id, title: v.title, description: v.description, kind: 'video' as const, mime: 'image/svg+xml', data: demoVideoSvg(v.title, v.sub), posterSvg: demoPosterSvg(v.title, v.sub),
    durationSec: v.dur, transcript: v.transcript, chapters: v.chapters, productSlug: v.product, status: v.status ?? ('published' as const),
    audienceKind: v.aud.audienceKind, audienceOrgId: v.aud.audienceOrgId ?? null, audienceProduct: v.aud.audienceProduct ?? null, uploadedBy: USER.publisher, createdAt: at(v.age),
  }))).onConflictDoNothing();

  const pub = (extra: Record<string, unknown>) => ({ audienceKind: 'public' as const, authorId: USER.publisher, ...extra });
  await db.insert(schema.contentItems).values([
    // Banners: one live public, one employees-only, one draft, one expired.
    { id: CONTENT.bannerHackathon, kind: 'banner', slug: 'hackathon-banner', title: 'Your next idea. Our next breakthrough.', summary: 'Build, experiment, and collaborate at the upcoming azentio.ai hackathon. Register your interest to hear when dates and participation details are announced.', status: 'published', startsAt: at(-1), endsAt: at(180), publishedAt: at(-1), meta: { eyebrow: 'Upcoming hackathon', ctaLabel: 'Register interest', ctaHref: '/hackathon/register' }, ...pub({}) },
    { id: CONTENT.bannerEmployees, kind: 'banner', slug: 'employee-town-hall-banner', title: 'Employees: town hall recording is available', summary: 'Internal notice for employees only.', status: 'published', publishedAt: at(-2), meta: { eyebrow: 'Internal', ctaLabel: 'Open employee portal', ctaHref: '/employee' }, audienceKind: 'employees', authorId: USER.publisher },
    { id: CONTENT.bannerDraft, kind: 'banner', slug: 'draft-launch-banner', title: 'Draft: launch announcement', summary: 'Not yet approved for publication.', status: 'draft', meta: { eyebrow: 'Announcement' }, ...pub({}) },
    { id: CONTENT.bannerExpired, kind: 'banner', slug: 'spring-webinar-banner', title: 'Last season webinar (ended)', summary: 'This banner ran in an earlier window and has expired.', status: 'published', startsAt: at(-40), endsAt: at(-10), publishedAt: at(-40), meta: { eyebrow: 'Webinar' }, ...pub({}) },
    // Public perspectives.
    { id: 'cnt_seed_persp_1', kind: 'perspective', slug: 'ai-needs-evidence-not-just-answers', title: 'AI needs evidence, not just answers', summary: 'Why recommendations in regulated lending should always travel with their evidence.', status: 'published', publishedAt: at(-12), meta: { tags: ['governance', 'decisioning'] }, ...pub({ body: 'A recommendation without evidence is a guess with good manners.\n\nIn credit and reporting, people must be able to see why a system suggested something, which policy applied, and what data was used.\n\n## What good looks like\n- Every recommendation lists the evidence behind it\n- A person records the final decision\n- The audit trail survives staff changes' }) },
    { id: 'cnt_seed_persp_2', kind: 'perspective', slug: 'seasonality-is-not-noise', title: 'Seasonality is not noise', summary: 'Small-business cash flow moves with the calendar. Models should say so.', status: 'published', publishedAt: at(-8), meta: { tags: ['sme', 'analytics'] }, ...pub({ body: 'Many small businesses earn most of their income in a few months.\n\nTreating a quiet quarter as distress creates unfair outcomes and noisy alerts.\n\n## A better default\n- Compare like periods with like\n- Show the seasonal context next to any flag\n- Let analysts override with a reason' }) },
    { id: 'cnt_seed_persp_3', kind: 'perspective', slug: 'learning-together-without-sharing-secrets', title: 'Learning together without sharing secrets', summary: 'How a community can learn from each other while private details stay private.', status: 'published', publishedAt: at(-4), meta: { tags: ['privacy', 'community'] }, ...pub({ body: 'Shared learning only works if contributors stay in control.\n\nSharing is a choice made per observation, reviewed by a person, and reversible.\n\n## Principles\n- Private by default\n- De-identified wording\n- Withdrawal that really removes the item from search' }) },
    // Lab posts.
    { id: 'cnt_seed_lab_1', kind: 'lab', slug: 'policy-what-if-prototype', title: 'Prototype: policy what-if explorer', summary: 'A deterministic what-if explorer on a synthetic portfolio.', status: 'published', publishedAt: at(-10), meta: { tags: ['prototype'] }, ...pub({ body: 'We built a small explorer that re-runs a synthetic portfolio under different policy levers.\n\nIt is deterministic on purpose: the same inputs always give the same outputs, so results can be discussed and challenged.\n\nAll data in the prototype is synthetic and outputs are illustrations, not decisions.' }) },
    { id: 'cnt_seed_lab_2', kind: 'lab', slug: 'document-consistency-checks', title: 'Experiment: cross-document consistency checks', summary: 'Flagging inconsistencies between documents for a human to review.', status: 'published', publishedAt: at(-6), meta: { tags: ['documents', 'experiment'] }, ...pub({ body: 'This experiment compares a handful of fields across synthetic documents and flags mismatches.\n\nThe point is triage: a person still decides what a mismatch means.' }) },
    // Employees-only content that must NEVER appear publicly.
    { id: CONTENT.perspInternal, kind: 'perspective', slug: 'internal-roadmap-thinking', title: 'Internal: roadmap thinking (employees only)', summary: 'Employee-only note. Must never be shown publicly.', body: 'Internal planning notes. Employees only.', status: 'published', publishedAt: at(-3), audienceKind: 'employees', authorId: USER.publisher },
  ]).onConflictDoNothing();

  await db.insert(schema.events).values([
    { id: EVENT.webinar, title: 'Webinar: governed learning with AI', description: 'A public walkthrough of how shared learning, review and withdrawal work. Q&A included.', kind: 'webinar', startsAt: at(21), endsAt: new Date(at(21).getTime() + 3600_000), status: 'scheduled', joinInfo: 'Registration link will be published here once confirmed.', audienceKind: 'public', hostId: USER.publisher },
    { id: EVENT.recap, title: 'Webinar recap: product showcase', description: 'Recording of the public product showcase.', kind: 'webinar', startsAt: at(-14), endsAt: new Date(at(-14).getTime() + 3600_000), status: 'ended', recordingMediaId: MEDIA.pubRiva, audienceKind: 'public', hostId: USER.publisher },
  ]).onConflictDoNothing();
}
