import type { Db } from '../index';
import * as schema from '../schema';
import { USER } from './core';
import { runScenario } from '../../lib/scenarios';

const DAY = 86_400_000;
const at = (days: number, hour = 14) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

/** Employee area demo data. Idempotent (fixed ids, onConflictDoNothing). Synthetic only. Deliberately NO support authorisation: the admin creates one in the demo. */
export async function seedEmployee(db: Db) {
  const emp = { audienceKind: 'employees' as const, audienceOrgId: null, audienceProduct: null };
  await db.insert(schema.events).values([
    { id: 'evt_seed_emp_live', title: 'Internal: simulator roadmap Q&A', description: 'Employees-only live session. Prototype notes and open questions on the policy what-if scenarios.', kind: 'live', startsAt: at(3), endsAt: at(3, 15), joinInfo: 'Internal room link shared on the day (synthetic demo: no real meeting).', hostId: USER.publisher, ...emp },
    { id: 'evt_seed_emp_hack', title: 'Hackathon team stand-up', description: 'Short sync for hackathon team spaces. Bring your notes.', kind: 'hackathon_session', startsAt: at(1, 9), endsAt: at(1, 10), joinInfo: 'Internal room link (synthetic).', hostId: USER.publisher, ...emp },
    { id: 'evt_seed_emp_past', title: 'Internal: segment comparison demo (recording)', description: 'Walkthrough of the similar-segment comparison with synthetic data.', kind: 'live', startsAt: at(-14), endsAt: at(-14, 15), status: 'ended', recordingMediaId: 'med_seed_emp_recording', hostId: USER.publisher, ...emp },
  ]).onConflictDoNothing();

  const item = (id: string, kind: 'experiment' | 'team' | 'release_note' | 'knowledge' | 'internal_note', title: string, body: string, ownerId: string, extra: { status?: string; reviewDate?: Date; meta?: Record<string, unknown> } = {}) =>
    ({ id, kind, title, body, ownerId, ...extra });
  await db.insert(schema.employeeItems).values([
    item('emp_seed_exp_1', 'experiment', 'Seasonality-aware comparison explanation', 'Prototype that explains month-by-month cash-flow patterns next to annual ratios, using only synthetic SME profiles.', USER.employee, { status: 'running', meta: { hypothesis: 'Analysts trust a recommendation more when seasonality is shown next to the ratios.' } }),
    item('emp_seed_exp_2', 'experiment', 'Plain-language policy diff', 'Generate a short plain-language summary of what changed between two policy configurations in the what-if scenario.', USER.owner, { status: 'proposed', meta: { hypothesis: 'A text diff makes review meetings faster than comparing two tables.' } }),
    item('emp_seed_exp_3', 'experiment', 'Field-mapping suggestions for RIVA', 'Suggest source-column matches for report fields using name similarity only. No model training, synthetic data.', USER.publisher, { status: 'concluded', meta: { hypothesis: 'Simple name similarity covers most obvious mappings.' } }),
    item('emp_seed_team_1', 'team', 'Team Saltmarsh', 'Building a seasonality explainer for the SME workbench demo.', USER.employee, { status: 'open', meta: { members: [USER.employee, USER.owner], focus: 'SME Credit Decisioning Workbench' } }),
    item('emp_seed_team_2', 'team', 'Team Tidewater', 'Exploring validation exception triage for reporting workflows.', USER.publisher, { status: 'open', meta: { members: [USER.publisher], focus: 'RIVA' } }),
    item('emp_seed_note_1', 'internal_note', 'Note for Team Saltmarsh', 'Kick-off: scope is three synthetic applicants, one chart, one explanation paragraph. Demo on Friday.', USER.employee, { status: 'open', meta: { teamId: 'emp_seed_team_1' } }),
    item('emp_seed_rel_1', 'release_note', 'Playground: segment comparison added', 'The Playground now includes the similar-segment comparison scenario with sample-size caveats.', USER.publisher, { status: 'published', meta: { version: '0.4.0' } }),
    item('emp_seed_rel_2', 'release_note', 'Audit viewer filters', 'The portal audit viewer can now filter by action, actor, outcome and date range.', USER.publisher, { status: 'published', meta: { version: '0.3.2' } }),
    item('emp_seed_rel_3', 'release_note', 'Support authorisations are time-boxed', 'Portal administrators need an active, reasoned, time-boxed authorisation to see a summary of any client organisation\'s private content.', USER.publisher, { status: 'published', meta: { version: '0.3.0' } }),
    item('emp_seed_kb_1', 'knowledge', 'How to run a synthetic scenario review', 'Pick the offering, inspect the synthetic inputs, run the scenario, read the evidence list, then record structured feedback. Never describe simulated output as an approved decision.', USER.employee, { status: 'current', reviewDate: at(60), meta: { area: 'Playground' } }),
    item('emp_seed_kb_2', 'knowledge', 'Consent and sharing vocabulary', 'Membership, publishing consent and training consent are three different permissions. Joining a workspace is never consent to share or train.', USER.owner, { status: 'current', reviewDate: at(45), meta: { area: 'Governance' } }),
    item('emp_seed_kb_3', 'knowledge', 'Writing de-identified observations', 'Remove names, account numbers, transaction-level data and unusual dates. Rare facts can identify an organisation even without a name.', USER.moderator, { status: 'current', reviewDate: at(20), meta: { area: 'Moderation' } }),
    item('emp_seed_kb_4', 'knowledge', 'Release checklist (needs review)', 'Checklist for preparing a prototype release. Last reviewed before the audit viewer and support authorisation changes: some steps may be out of date.', USER.publisher, { status: 'current', reviewDate: at(-12), meta: { area: 'Operations' } }),
  ]).onConflictDoNothing();

  await db.insert(schema.employeeItemFeedback).values([
    { id: 'efb_seed_1', itemId: 'emp_seed_exp_1', userId: USER.owner, rating: 'promising', comment: 'Clear value for analysts. Needs a second sector before we generalise.' },
    { id: 'efb_seed_2', itemId: 'emp_seed_kb_4', userId: USER.employee, rating: 'outdated', comment: 'Step 4 still mentions the old audit page.' },
    { id: 'efb_seed_3', itemId: 'emp_seed_rel_1', userId: USER.employee, rating: 'clear', comment: null },
  ]).onConflictDoNothing();

  const run = (id: string, userId: string, slug: string, inputs: Record<string, unknown>, feedback?: { rating: string; comment?: string }) => {
    const result = runScenario(slug, inputs);
    return { id, mode: 'employee' as const, userId, orgId: null, offeringSlug: slug === 'policy-what-if' ? 'credit-strategy-simulator' : 'sme-credit-decisioning', scenarioSlug: slug, inputs: result.inputs, output: { ...result }, feedback: feedback ?? null };
  };
  await db.insert(schema.playgroundRuns).values([
    run('run_seed_emp_1', USER.employee, 'policy-what-if', { cutoffScore: 620, maxDti: 45 }, { rating: 'useful', comment: 'The marginal-decisions evidence is the most helpful part.' }),
    run('run_seed_emp_2', USER.employee, 'sme-application', { applicant: 'agri', amount: 150000, termMonths: 48 }),
    run('run_seed_emp_3', USER.owner, 'policy-what-if', { cutoffScore: 700, maxDti: 38 }),
  ]).onConflictDoNothing();
}
