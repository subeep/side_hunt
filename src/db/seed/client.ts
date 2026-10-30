import type { Db } from '../index';
import * as schema from '../schema';
import { hashToken } from '../../lib/crypto';
import { ORG, USER } from './core';
import { runScenario } from '../../lib/scenarios';

/**
 * Client portal seed. Idempotent (fixed ids + onConflictDoNothing). Synthetic data only.
 *
 * FIRST-TIME JOURNEY FOR JUDGES
 *   Open /invite/demo-invite-token-northwind   (raw token below; only its HMAC hash is stored)
 *   -> sign in as newperson@northwind.example (a seeded demo persona WITHOUT any membership; in DEMO_MODE the one-time code
 *      is shown on screen) -> review terms + learning-sharing explanation (acknowledge, NOT consent) -> /client for Northwind.
 *   The token is hashed with AUTH_SECRET (src/lib/crypto), so seed and runtime must share the same AUTH_SECRET.
 *
 * TERMS GATE: every seeded persona has acknowledged the 2026-10 workspace terms EXCEPT Arlo Atlas (member@atlas.example), who
 * is sent to /client/terms on first visit so the gate can be demonstrated.
 */
export const DEMO_INVITE_TOKEN = 'demo-invite-token-northwind';
const day = 86400_000;
const at = (days: number, hours = 14) => new Date(Date.now() + days * day + hours * 3600_000 - (Date.now() % day));
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const poster = (title: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="${esc(title)}"><rect width="640" height="360" fill="#f1e9dc"/><rect x="24" y="24" width="592" height="312" rx="18" fill="#fffdf8" stroke="#cfae8a"/><text x="48" y="150" font-family="Georgia,serif" font-size="30" fill="#3b2619">${esc(title)}</text><text x="48" y="190" font-family="sans-serif" font-size="16" fill="#7a6654">Synthetic storyboard. No real footage or client data.</text></svg>`;
const media = (id: string, title: string, description: string, audience: { kind: 'org' | 'product'; org?: string; product?: string }, transcript: string) => ({
  id, title, description, kind: 'video' as const, mime: 'image/svg+xml', data: poster(title), posterSvg: poster(title), durationSec: 420, transcript,
  status: 'published' as const, audienceKind: audience.kind, audienceOrgId: audience.org ?? null, audienceProduct: audience.product ?? null, uploadedBy: 'seed',
});
const item = (id: string, kind: 'resource' | 'briefing' | 'release_note', title: string, summary: string, body: string, audience: { kind: 'org' | 'product'; org?: string; product?: string }, status: 'published' | 'draft' = 'published', ageDays = 3) => ({
  id, kind, slug: `client-${id.replace('cnt_cl_', '')}`, title, summary, body, status, audienceKind: audience.kind, audienceOrgId: audience.org ?? null, audienceProduct: audience.product ?? null, authorId: USER.publisher, publishedAt: status === 'published' ? at(-ageDays) : null,
});

/** Seeded runs are produced by the REAL scenario engine so "Run again with these inputs" reproduces them exactly. */
const run = (id: string, userId: string, orgId: string, offeringSlug: string, scenarioSlug: string, inputs: Record<string, unknown>, ageDays: number, feedback?: { rating: string; topic: string; comment?: string }) => {
  const result = runScenario(scenarioSlug, inputs);
  return { id, mode: 'client' as const, userId, orgId, offeringSlug, scenarioSlug, inputs: result.inputs, output: result as unknown as Record<string, unknown>, feedback: feedback ?? null, createdAt: at(-ageDays) };
};

export async function seedClient(db: Db) {
  const s = schema;

  // ---- Terms: acknowledged by everyone except Arlo Atlas (terms gate demo). Acknowledgement is NOT consent to share or train.
  const accepted: [string, string][] = [
    [USER.nwAdmin, ORG.northwind], [USER.nwMember, ORG.northwind], [USER.hbAdmin, ORG.harbor], [USER.hbMember, ORG.harbor], [USER.atAdmin, ORG.atlas],
    [USER.multi, ORG.northwind], [USER.multi, ORG.harbor],
  ];
  await db.insert(s.termsAcceptances).values(accepted.map(([userId, orgId]) => ({ id: `trm_seed_${userId}_${orgId}`, userId, orgId, termsVersion: '2026-10', learningExplained: true }))).onConflictDoNothing();

  // ---- Media: approved demos (entitled product audience) + org-only walkthrough/recording.
  await db.insert(s.media).values([
    media('med_cl_demo_csim', 'Guided demo: policy what-if', 'Walk through a simulated policy change on a synthetic portfolio.', { kind: 'product', product: 'credit-strategy-simulator' }, 'Narrator: We pick a cut-off lever, run it against the synthetic portfolio and review the simulated approval and risk movement. Synthetic data only.'),
    media('med_cl_demo_sme', 'Guided demo: SME application review', 'Evaluate a synthetic SME applicant against policy with an evidence trail.', { kind: 'product', product: 'sme-credit-decisioning' }, 'Narrator: A synthetic applicant is spread, evaluated against policy and reviewed. A human records the final decision. Synthetic data only.'),
    media('med_cl_demo_spi', 'Guided demo: similar segments', 'Compare an application with similar historical segments.', { kind: 'product', product: 'similar-portfolio-intelligence' }, 'Narrator: We choose an application, find comparable synthetic segments and read the outcome patterns. Synthetic data only.'),
    media('med_cl_demo_riva', 'Guided demo: report validation', 'Map report fields and review validation exceptions.', { kind: 'product', product: 'riva' }, 'Narrator: Fields are mapped, validation rules run and exceptions are reviewed. Synthetic data only.'),
    media('med_cl_nw_walkthrough', 'Northwind onboarding walkthrough', 'A short tour of the Northwind workspace.', { kind: 'org', org: ORG.northwind }, 'Narrator: This tour is prepared for the Northwind workspace and is visible to Northwind members only.'),
    media('med_cl_nw_recording', 'Recording: SME cash-flow working session', 'Northwind-only recording of the previous working session.', { kind: 'org', org: ORG.northwind }, 'Recording of an invitation-only Northwind session. Synthetic transcript.'),
  ]).onConflictDoNothing();

  // ---- Events: sessions / briefings / webinars. One invitation-only webinar for Northwind only.
  const ev = (id: string, title: string, description: string, kind: 'live' | 'webinar' | 'briefing', startsInDays: number, audience: { kind: 'org' | 'product'; org?: string; product?: string }, joinInfo: string | null, extra: { status?: 'scheduled' | 'ended'; recordingMediaId?: string } = {}) => ({
    id, title, description, kind, startsAt: at(startsInDays), endsAt: at(startsInDays, 15), status: extra.status ?? ('scheduled' as const), joinInfo, recordingMediaId: extra.recordingMediaId ?? null,
    audienceKind: audience.kind, audienceOrgId: audience.org ?? null, audienceProduct: audience.product ?? null, hostId: USER.publisher,
  });
  await db.insert(s.events).values([
    ev('evt_cl_nw_webinar', 'Northwind: SME seasonality working session', 'Invitation-only webinar for Northwind. Bring synthetic or de-identified examples only.', 'webinar', 5, { kind: 'org', org: ORG.northwind }, 'https://meet.example.invalid/northwind-seasonality (passcode NW-4821, synthetic)'),
    ev('evt_cl_nw_past', 'Northwind: SME cash-flow working session (previous)', 'Previous invitation-only session. Recording available to Northwind.', 'webinar', -14, { kind: 'org', org: ORG.northwind }, null, { status: 'ended', recordingMediaId: 'med_cl_nw_recording' }),
    ev('evt_cl_csim_hours', 'Credit Strategy Simulator office hours', 'Open Q&A for organisations entitled to the Credit Strategy Simulator.', 'live', 3, { kind: 'product', product: 'credit-strategy-simulator' }, 'https://meet.example.invalid/csim-office-hours (synthetic)'),
    ev('evt_cl_sme_briefing', 'SME Credit Decisioning briefing', 'Quarterly briefing for entitled clients.', 'briefing', 9, { kind: 'product', product: 'sme-credit-decisioning' }, 'https://meet.example.invalid/sme-briefing (synthetic)'),
    ev('evt_cl_riva_clinic', 'RIVA validation clinic', 'Hands-on session on validation rules for RIVA clients.', 'webinar', 6, { kind: 'product', product: 'riva' }, 'https://meet.example.invalid/riva-clinic (synthetic)'),
    ev('evt_cl_spi_briefing', 'Similar Portfolio Intelligence briefing', 'Briefing for entitled clients on segment comparison.', 'briefing', 12, { kind: 'product', product: 'similar-portfolio-intelligence' }, 'https://meet.example.invalid/spi-briefing (synthetic)'),
    ev('evt_cl_hb_briefing', 'Harbor: reporting calendar briefing', 'Briefing prepared for Harbor Microfinance.', 'briefing', 4, { kind: 'org', org: ORG.harbor }, 'https://meet.example.invalid/harbor-briefing (synthetic)'),
    ev('evt_cl_at_briefing', 'Atlas: regional rollout briefing', 'Briefing prepared for Atlas Regional Bank.', 'briefing', 7, { kind: 'org', org: ORG.atlas }, 'https://meet.example.invalid/atlas-briefing (synthetic)'),
  ]).onConflictDoNothing();

  // ---- Client resources, briefings, release notes (org-specific and entitled-product audiences). One draft that must never show.
  const note = 'This is synthetic demonstration content. It describes released behaviour only and is not a delivery commitment.';
  await db.insert(s.contentItems).values([
    item('cnt_cl_nw_playbook', 'resource', 'Northwind onboarding playbook', 'How the Northwind team gets started: roles, sandbox etiquette, support routes.', `Welcome to your workspace.\n\n- Administrators invite colleagues and assign Member or Administrator roles.\n- Use the Sandbox with synthetic data only.\n- Raise a support request for anything blocked.\n\n${note}`, { kind: 'org', org: ORG.northwind }),
    item('cnt_cl_nw_q4', 'briefing', 'Northwind Q4 policy briefing', 'Prepared for Northwind: policy simulation themes for the quarter.', `Themes for the quarter, prepared for Northwind only.\n\n1. Seasonal cash-flow treatment in SME applications.\n2. Document consistency checks.\n\n${note}`, { kind: 'org', org: ORG.northwind }, 'published', 6),
    item('cnt_cl_nw_draft', 'resource', 'Northwind draft: unpublished plan', 'Draft. Must never be visible to clients.', 'Draft content.', { kind: 'org', org: ORG.northwind }, 'draft'),
    item('cnt_cl_hb_calendar', 'resource', 'Harbor reporting calendar guide', 'Reporting deadlines and RIVA validation checkpoints for Harbor.', `Harbor reporting checkpoints.\n\n- Monthly validation run\n- Quarterly exception review\n\n${note}`, { kind: 'org', org: ORG.harbor }),
    item('cnt_cl_at_rollout', 'briefing', 'Atlas regional rollout briefing', 'Prepared for Atlas: rollout notes for the regional teams.', `Rollout notes for Atlas only.\n\n${note}`, { kind: 'org', org: ORG.atlas }, 'published', 5),
    item('cnt_cl_res_sme_guide', 'resource', 'Configuring policy packs in the SME workbench', 'Guide for organisations entitled to SME Credit Decisioning.', `Policy packs group the rules evaluated for each application.\n\n1. Choose a pack.\n2. Review the rule list.\n3. Run a synthetic applicant in the Sandbox.\n\n${note}`, { kind: 'product', product: 'sme-credit-decisioning' }, 'published', 9),
    item('cnt_cl_rn_csim', 'release_note', 'Credit Strategy Simulator: release notes 2026.10', 'Released improvements to comparison views.', `Released\n\n- Side-by-side comparison of approval and risk movement.\n- Clearer evidence labels.\n\n${note}`, { kind: 'product', product: 'credit-strategy-simulator' }, 'published', 2),
    item('cnt_cl_rn_sme', 'release_note', 'SME Credit Decisioning: release notes 2026.10', 'Released improvements to evidence trail.', `Released\n\n- Evidence trail now lists the rule behind each flag.\n\n${note}`, { kind: 'product', product: 'sme-credit-decisioning' }, 'published', 2),
    item('cnt_cl_rn_spi', 'release_note', 'Similar Portfolio Intelligence: release notes 2026.10', 'Released improvements to segment matching.', `Released\n\n- Segment matching explains which attributes matched.\n\n${note}`, { kind: 'product', product: 'similar-portfolio-intelligence' }, 'published', 4),
    item('cnt_cl_rn_riva', 'release_note', 'RIVA: release notes 2026.10', 'Released improvements to validation exceptions.', `Released\n\n- Exceptions can be grouped by rule.\n\n${note}`, { kind: 'product', product: 'riva' }, 'published', 3),
  ]).onConflictDoNothing();

  // ---- Sample sandbox runs (computed by the live scenario engine from the stored inputs, so re-running reproduces them).
  const nw = ORG.northwind;
  await db.insert(s.playgroundRuns).values([
    run('run_cl_nw_1', USER.nwMember, nw, 'credit-strategy-simulator', 'policy-what-if', { cutoffScore: 640, maxDti: 43, segment: 'all' }, 4, { rating: 'helpful', topic: 'clarity', comment: 'Evidence labels were easy to follow.' }),
    run('run_cl_nw_2', USER.nwMember, nw, 'sme-credit-decisioning', 'sme-application', { applicant: 'bakery', amount: 120000, termMonths: 36, revenueShock: 10 }, 2),
    run('run_cl_nw_3', USER.nwAdmin, nw, 'similar-portfolio-intelligence', 'segment-compare', { sector: 'retail', ticket: 60000, seasonality: 'high', tenure: 24 }, 1),
    run('run_cl_hb_1', USER.hbMember, ORG.harbor, 'riva', 'report-validation', { mappingSet: 'clean', strictness: 'strict', maxExceptionRate: 10 }, 3),
  ]).onConflictDoNothing();
  await db.insert(s.savedScenarios).values({ id: 'scn_cl_nw_1', orgId: nw, userId: USER.nwMember, offeringSlug: 'credit-strategy-simulator', scenarioSlug: 'policy-what-if', name: 'Baseline policy, all applicants', inputs: { cutoffScore: 640, maxDti: 43, segment: 'all' } }).onConflictDoNothing();

  // ---- Support tickets (simulated integration), per organisation.
  const tk = (id: string, orgId: string, userId: string, subject: string, body: string, status: 'open' | 'pending' | 'closed', ageDays: number) => ({ id, orgId, userId, subject, body, status, createdAt: at(-ageDays) });
  await db.insert(s.supportTickets).values([
    tk('tkt_cl_nw_1', nw, USER.nwMember, 'Sandbox run history question', 'Where can I find the scenarios I ran last week?', 'open', 2),
    tk('tkt_cl_nw_2', nw, USER.nwAdmin, 'Request: additional colleague seats', 'We would like to add three analysts to the workspace next month.', 'pending', 5),
    tk('tkt_cl_nw_3', nw, USER.nwMember, 'Release note clarification', 'Does the new comparison view affect saved scenarios?', 'closed', 12),
    tk('tkt_cl_hb_1', ORG.harbor, USER.hbMember, 'RIVA exception grouping', 'Can exceptions be exported for a review meeting?', 'open', 1),
    tk('tkt_cl_hb_2', ORG.harbor, USER.hbAdmin, 'Billing contact update', 'Please update the workspace contact for our organisation.', 'closed', 9),
    tk('tkt_cl_at_1', ORG.atlas, USER.atAdmin, 'Briefing recording request', 'Could the regional briefing be recorded for the wider team?', 'open', 3),
  ]).onConflictDoNothing();

  // ---- Pending invitation for the first-time journey. Email status is recorded honestly as queued (stored, not sent).
  await db.insert(s.users).values({ id: 'usr_newperson', email: 'newperson@northwind.example', name: 'Newperson Northwind', isDemoPersona: true }).onConflictDoNothing();
  await db.insert(s.invitations).values({ id: 'inv_demo_northwind', orgId: nw, email: 'newperson@northwind.example', role: 'client_member', tokenHash: hashToken(DEMO_INVITE_TOKEN), invitedBy: USER.nwAdmin, expiresAt: new Date(Date.now() + 180 * day) }).onConflictDoNothing();
  await db.insert(s.emailOutbox).values({ id: 'eml_demo_invite', toEmail: 'newperson@northwind.example', subject: "You're invited to Northwind Credit Union on azentio.ai", body: `Accept your single-use invitation: /invite/${DEMO_INVITE_TOKEN}`, purpose: 'invitation', dedupeKey: 'inv:inv_demo_northwind', status: 'queued' }).onConflictDoNothing();
}
