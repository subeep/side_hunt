import type { Db } from '../index';
import * as schema from '../schema';
import { ORG, USER } from './core';
import { scanFields } from '../../lib/learning/sensitive';
import { indexSharedWith } from '../../lib/learning/indexing';

/**
 * Collective-learning seed. Idempotent (fixed ids + onConflictDoNothing). SYNTHETIC data only: every organisation,
 * person, account number and company below is invented. Private sources contain realistic identifying details ON PURPOSE
 * so that the moderator's redaction is visible; the shared versions contain none of them.
 */
const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86400_000 + hours * 3600_000);
const MOD = USER.moderator;

interface Pub {
  key: string; sharedId: string; org: string; author: string; kind: (typeof schema.CONTRIBUTION_KINDS)[number];
  title: string; observation: string; offering: string; industry: string; region: string; period: string;
  evidence: 'first_hand' | 'aggregate_metric' | 'external_report' | 'anecdotal'; confidence: 'low' | 'medium' | 'high'; topic: string; links?: string[];
  shared: { title: string; summary: string; industry: string; region: string; periodLabel: string; quality: 'weak' | 'moderate' | 'strong'; attribution?: string };
  redaction: string; clarification?: { question: string; amendment: string }; day: number;
}

const PUB: Pub[] = [
  {
    key: 'season_nw', sharedId: 'shr_seed_season_nw', org: ORG.northwind, author: USER.nwMember, kind: 'market_observation', offering: 'sme-credit-decisioning', topic: 'Seasonal cash flow', day: 30,
    title: 'Lakeshore branch: landscaping SME declined on annualised cash flow',
    observation: "At our Lakeshore branch, Ms Patel's team declined GreenEdge Landscaping LLC (account 4821 9930 1127) for an $85,000 working-capital line because the analyst annualised the June-September quarter of strong receipts, while another analyst on the same desk spread the same style of statements over twelve months and approved a comparable file the week before. File contact: priya.patel@northwind.example. Over the last two winters at least a dozen seasonal SME files (landscaping, snow clearing, marinas) were treated differently depending on who reviewed them. Our written policy does not say how seasonal months should be normalised.",
    industry: 'Credit union, Lakeshore district branch', region: 'Greater Toronto Area', period: 'Nov 2024 - Mar 2026', evidence: 'first_hand', confidence: 'medium',
    links: ['https://intranet.northwind.example/credit/seasonal-files-2025'],
    shared: { title: 'Seasonal SME cash flow is normalised inconsistently between analysts', summary: 'Analysts reviewing seasonal small-business files (outdoor services, marine and similar trades) applied different treatments to peak-season receipts: some annualised the strongest months, others spread statements across twelve months. Comparable files received different outcomes depending on the reviewer, and the written policy gives no guidance on normalising seasonal months.', industry: 'Member-owned lender', region: 'North America', periodLabel: 'Two winter seasons', quality: 'moderate' },
    redaction: 'Removed branch name, borrower trade name, account reference, loan amount, reviewer name and email. Region generalised to continent; period widened to seasons.',
  },
  {
    key: 'season_hb', sharedId: 'shr_seed_season_hb', org: ORG.harbor, author: USER.hbMember, kind: 'operational_challenge', offering: 'sme-credit-decisioning', topic: 'Seasonal cash flow', day: 24,
    title: 'Kampong Thom rice-mill cooperatives: score depends on the month of application',
    observation: "Loan officer Mr Sok Vannak (+855 12 345 678) noticed that our 140 agricultural SME borrowers around Kampong Thom (for example Tonle Rice Mill Co) are scored on flat monthly cash flow although income arrives in two harvest windows. The committee papers for the 2025 dry-season round show near-identical borrowers rated 'weak' or 'adequate' depending on the month the application was filed. We hold the committee minutes under NDA with the cooperative federation. Update after the moderator's question: the filing-month effect appeared in both harvest cycles we reviewed, not only the latest one.",
    industry: 'Microfinance, agricultural SME lending', region: 'Kampong Thom province', period: 'Two harvest cycles, 2024-2025', evidence: 'aggregate_metric', confidence: 'medium',
    shared: { title: 'Application timing relative to harvest changes how seasonal borrowers are scored', summary: 'Agricultural micro-enterprise borrowers whose income arrives in a small number of harvest windows were scored differently depending on the month their application was filed. The effect appeared in both harvest cycles reviewed. Both the scoring inputs and the repayment schedules assume smooth monthly cash flow.', industry: 'Microfinance', region: 'South-East Asia', periodLabel: 'Two harvest cycles', quality: 'moderate', attribution: 'Harbor Microfinance' },
    redaction: 'Removed officer name and phone number, cooperative name, province, borrower count and the NDA reference. Kept the finding that the effect appeared in both cycles (confirmed by contributor after clarification).',
    clarification: { question: 'Was the filing-month effect seen in both harvest cycles you reviewed, or only the most recent one? Please do not name any borrower in your answer.', amendment: 'confirmed both cycles' },
  },
  {
    key: 'season_at', sharedId: 'shr_seed_season_at', org: ORG.atlas, author: USER.atMember, kind: 'emerging_trend', offering: 'sme-credit-decisioning', topic: 'Seasonal cash flow', day: 18,
    title: 'Alpine hospitality borrowers look stressed in the off-season',
    observation: "Hotel Zur Post in Garmisch (IBAN DE89 3704 0044 0532 0130 00, EUR 240,000 term loan) was flagged as stressed by the decisioning workbench for the November-December months even though Mr Weber's accounts show the same pattern every year and full repayment each winter. Two colleagues report the same effect for other tourism SMEs, but we have not measured it systematically.",
    industry: 'Retail & SME banking, Bavarian Alps', region: 'Garmisch-Partenkirchen', period: 'Winter 2025/26', evidence: 'anecdotal', confidence: 'low',
    shared: { title: 'Tourism-dependent SMEs appear stressed in off-season months', summary: 'Small businesses in tourism-led areas were presented as stressed for the quiet months even though the same pattern repeats every year and loans are repaid in full. Colleagues described similar cases, but this has not been measured systematically, so treat it as an early signal.', industry: 'Retail and SME banking', region: 'Central Europe', periodLabel: 'One winter season', quality: 'weak' },
    redaction: 'Removed hotel name, town, IBAN, loan amount and customer surname. Evidence marked weak: anecdotal, not systematic.',
  },
  {
    key: 'doc_nw', sharedId: 'shr_seed_doc_nw', org: ORG.northwind, author: USER.nwAdmin, kind: 'product_gap', offering: 'sme-credit-decisioning', topic: 'Document inconsistencies', day: 27,
    title: 'Revenue differs between statements and tax filings: no visible reconciliation',
    observation: "For Dunmore Fabrication Ltd the uploaded bank statements show turnover of $1,240,000 while the filed return shows $1,095,000, mostly a sales-tax and timing difference. Ms Okafor (analyst) reconciled it by hand and the workbench did not show which source fed the ratio. We see this on roughly one file in five and each analyst has a different habit.",
    industry: 'Credit union, commercial lending desk', region: 'Ontario', period: 'Q1-Q2 2026', evidence: 'first_hand', confidence: 'medium',
    shared: { title: 'Statements and tax filings disagree and the source used is not visible', summary: 'Turnover on uploaded bank statements often differs from the figure on filed returns, mainly through sales-tax and timing effects. Analysts reconcile by hand and in different ways, and the workbench does not show which document fed a given ratio. Roughly one file in five is affected.', industry: 'Member-owned lender', region: 'North America', periodLabel: 'Two quarters', quality: 'moderate' },
    redaction: 'Removed company name, both turnover figures, analyst name.',
  },
  {
    key: 'doc_hb', sharedId: 'shr_seed_doc_hb', org: ORG.harbor, author: USER.hbAdmin, kind: 'operational_challenge', offering: 'sme-credit-decisioning', topic: 'Document inconsistencies', day: 22,
    title: 'Handwritten ledgers and mobile-money exports do not reconcile',
    observation: "Borrowers in the Siem Reap market district give us handwritten ledgers plus mobile-money exports. For Mrs Chea's stall the two totals differ by about a third and the account 0123456789 statement does not match either. Loan officers pick whichever looks more credible; there is no agreed rule.",
    industry: 'Microfinance, market traders', region: 'Siem Reap', period: 'Last 12 months', evidence: 'first_hand', confidence: 'medium',
    shared: { title: 'Informal borrowers supply documents that disagree, with no agreed rule', summary: 'Informal-sector borrowers often provide handwritten ledgers and mobile-money exports whose totals disagree materially. Loan officers choose whichever source seems more credible; there is no agreed reconciliation rule, so similar borrowers can be treated differently.', industry: 'Microfinance', region: 'South-East Asia', periodLabel: 'Last 12 months', quality: 'moderate' },
    redaction: 'Removed district, trader name, account number and the specific size of the discrepancy.',
  },
  {
    key: 'report_at', sharedId: 'shr_seed_report_at', org: ORG.atlas, author: USER.atAdmin, kind: 'operational_challenge', offering: 'riva', topic: 'Reporting validation', day: 12,
    title: 'Return template rejected valid files because of a decimal-format rule',
    observation: "Our RC-14 supervisory return (branch code 0471, contact reports@atlas.example) was rejected by our internal validation although the regulator's own checker accepted it; the rule demanded two decimals where the template allows up to four. Re-mapping fixed it but cost three working days at quarter end.",
    industry: 'Retail & SME banking', region: 'Europe', period: 'Q1 2026', evidence: 'first_hand', confidence: 'high',
    shared: { title: 'Internal validation rule stricter than the regulator checker rejected valid returns', summary: 'A periodic supervisory return was rejected by an internal validation rule that was stricter than the regulator\'s own checker (decimal precision). Re-mapping the field resolved it but cost several working days at quarter end.', industry: 'Retail and SME banking', region: 'Europe', periodLabel: 'One quarter', quality: 'strong' },
    redaction: 'Removed return code, branch code and contact address.',
  },
];

export async function seedLearning(db: Db) {
  const s = schema;
  for (const x of PUB) {
    const conId = `con_seed_${x.key}`;
    const flags = scanFields({ title: x.title, observation: x.observation, industry: x.industry, region: x.region, observationPeriod: x.period, supportLinks: x.links });
    const t0 = x.day; // days ago the contribution was submitted
    await db.insert(s.contributions).values({
      id: conId, orgId: x.org, authorId: x.author, kind: x.kind, title: x.title, observation: x.observation, offeringSlug: x.offering,
      industry: x.industry, region: x.region, observationPeriod: x.period, evidenceType: x.evidence, confidence: x.confidence, topic: x.topic, supportLinks: x.links ?? [],
      sharingChoice: 'community', status: 'published', version: 1, sensitiveFlags: flags, sensitiveAcknowledged: true, currentSharedId: x.sharedId,
      createdAt: ago(t0 + 1), updatedAt: ago(t0 - 3), submittedAt: ago(t0),
    }).onConflictDoNothing();

    const attr = !!x.shared.attribution;
    await db.insert(s.contributionConsents).values(
      (['store_process', 'publish_shared', 'attribution', 'training'] as const).map((purpose) => ({
        id: `cns_seed_${x.key}_${purpose}`, contributionId: conId, userId: x.author, purpose, contributionVersion: 1,
        granted: purpose === 'store_process' || purpose === 'publish_shared' || (purpose === 'attribution' && attr), at: ago(t0), note: 'submitted for community review',
      })),
    ).onConflictDoNothing();

    const ev: { n: string; actor: string; role: 'author' | 'moderator'; from: string | null; to: string; decision: string; at: Date; pub?: string; note?: string }[] = [
      { n: 'sub', actor: x.author, role: 'author', from: 'draft', to: 'submitted', decision: 'submitted', at: ago(t0) },
      { n: 'claim', actor: MOD, role: 'moderator', from: 'submitted', to: 'in_review', decision: 'claimed', at: ago(t0, 3) },
    ];
    if (x.clarification) {
      ev.push(
        { n: 'clar', actor: MOD, role: 'moderator', from: 'in_review', to: 'clarification_requested', decision: 'clarification_requested', at: ago(t0, 5), pub: x.clarification.question, note: 'Single-cycle evidence would make this anecdotal. Ask before publishing.' },
        { n: 'resub', actor: x.author, role: 'author', from: 'clarification_requested', to: 'submitted', decision: 'resubmitted', at: ago(t0 - 1) },
        { n: 'claim2', actor: MOD, role: 'moderator', from: 'submitted', to: 'in_review', decision: 'claimed', at: ago(t0 - 1, 2) },
      );
    }
    ev.push(
      { n: 'redact', actor: MOD, role: 'moderator', from: 'in_review', to: 'in_review', decision: 'redacted', at: ago(t0 - 2), note: x.redaction },
      { n: 'pub', actor: MOD, role: 'moderator', from: 'in_review', to: 'published', decision: 'published', at: ago(t0 - 2, 1), note: x.redaction },
    );
    await db.insert(s.moderationEvents).values(ev.map((e) => ({
      id: `mod_seed_${x.key}_${e.n}`, contributionId: conId, sharedId: e.n === 'pub' ? x.sharedId : null, moderatorId: e.actor, actorRole: e.role,
      fromStatus: e.from, toStatus: e.to, decision: e.decision, reasonPublic: e.pub ?? null, internalNote: e.note ?? null, at: e.at,
    }))).onConflictDoNothing();

    await db.insert(s.reviewDrafts).values({
      contributionId: conId, claimedBy: MOD, title: x.shared.title, summary: x.shared.summary, industry: x.shared.industry, region: x.shared.region,
      periodLabel: x.shared.periodLabel, evidenceQuality: x.shared.quality, includeAttribution: attr, redactionNotes: x.redaction, reviewed: true, updatedAt: ago(t0 - 2),
    }).onConflictDoNothing();

    await db.insert(s.sharedContributions).values({
      id: x.sharedId, contributionId: conId, orgId: x.org, version: 1, kind: x.kind, title: x.shared.title, summary: x.shared.summary, offeringSlug: x.offering,
      industry: x.shared.industry, region: x.shared.region, periodLabel: x.shared.periodLabel, topic: x.topic, evidenceType: x.evidence, confidence: x.confidence,
      evidenceQuality: x.shared.quality, attributionLabel: attr ? x.shared.attribution : null, status: 'published', publishedBy: MOD, publishedAt: ago(t0 - 2, 1), createdAt: ago(t0 - 2, 1),
    }).onConflictDoNothing();
    await indexSharedWith(db, x.sharedId);

    await db.insert(s.notifications).values({ userId: x.author, kind: 'learning.published', title: 'Published to the community', body: 'A reviewed, de-identified version of your contribution is now available to approved participants. Your private original was not shared.', link: `/learn/c/${conId}`, dedupeKey: `learn:mod_seed_${x.key}_pub`, createdAt: ago(t0 - 2, 1) }).onConflictDoNothing();
  }

  // ---- Moderation queue + other states ----
  interface Q { id: string; org: string; author: string; kind: (typeof schema.CONTRIBUTION_KINDS)[number]; title: string; observation: string; offering: string | null; topic: string | null; industry: string; region: string; period: string; evidence: 'first_hand' | 'aggregate_metric' | 'external_report' | 'anecdotal'; confidence: 'low' | 'medium' | 'high'; choice: 'private' | 'organisation' | 'community'; status: typeof schema.CONTRIBUTION_STATUSES[number]; day: number; msg?: string }
  const Q: Q[] = [
    { id: 'con_seed_q_sub1', org: ORG.harbor, author: USER.hbAdmin, kind: 'improvement_suggestion', title: 'Override reasons are free text, so we cannot compare them', observation: 'When our credit committee overrides a recommendation the reason is typed as free text. Last quarter a colleague (k.lim@harbor.example) tried to summarise 40 overrides by hand, including a EUR 250,000 equipment line, and could not group them. A short controlled list of reasons plus a free-text field would let us see patterns without reading every file.', offering: 'sme-credit-decisioning', topic: 'Policy overrides', industry: 'Microfinance', region: 'South-East Asia', period: 'Q2 2026', evidence: 'first_hand', confidence: 'medium', choice: 'community', status: 'submitted', day: 2 },
    { id: 'con_seed_q_sub2', org: ORG.atlas, author: USER.atAdmin, kind: 'product_gap', title: 'Similar-portfolio comparisons do not show how small the matched segment is', observation: 'When a comparison finds only a handful of historical cases the screen still shows percentages with the same visual weight as a large segment. Analysts in our team read these as firm evidence. A visible segment size and a plain warning for small segments would prevent over-reading.', offering: 'similar-portfolio-intelligence', topic: 'Explainability', industry: 'Retail & SME banking', region: 'Europe', period: 'Last two quarters', evidence: 'first_hand', confidence: 'medium', choice: 'community', status: 'submitted', day: 1 },
    { id: 'con_seed_q_clar', org: ORG.northwind, author: USER.nwAdmin, kind: 'market_observation', title: 'Early-warning thresholds drift after a policy change', observation: 'After the spring policy update our early-warning alerts fired for far fewer accounts. We think the thresholds were recalibrated implicitly, but we have not confirmed this.', offering: 'credit-strategy-simulator', topic: 'Policy overrides', industry: 'Credit union', region: 'North America', period: 'Spring 2026', evidence: 'anecdotal', confidence: 'low', choice: 'community', status: 'clarification_requested', day: 6, msg: 'Can you say roughly how many fewer alerts you saw, in relative terms (for example half as many), and over what period? Please avoid naming accounts or customers.' },
    { id: 'con_seed_nw_draft', org: ORG.northwind, author: USER.nwMember, kind: 'market_observation', title: 'DRAFT: pricing tiers negotiated with a regional retailer', observation: 'SEED-PRIVATE-DRAFT-MARKER. Our negotiated rate card with Lakeshore Retail Partners is confidential, and I want to think about whether the pattern is worth sharing. Not ready for anyone else to read. Do not submit.', offering: null, topic: null, industry: 'Credit union', region: 'North America', period: '2026', evidence: 'first_hand', confidence: 'low', choice: 'community', status: 'draft', day: 0 },
    { id: 'con_seed_hb_org_only', org: ORG.harbor, author: USER.hbMember, kind: 'successful_practice', title: 'Weekly credit-committee huddle on flagged applications', observation: 'We started a 20-minute weekly huddle for flagged applications. It cut the average time to decision and made overrides more consistent. Written up for colleagues in our own organisation only.', offering: 'sme-credit-decisioning', topic: 'Policy overrides', industry: 'Microfinance', region: 'South-East Asia', period: 'Last 3 months', evidence: 'first_hand', confidence: 'medium', choice: 'organisation', status: 'published', day: 9 },
  ];
  for (const q of Q) {
    const flags = scanFields({ title: q.title, observation: q.observation, industry: q.industry, region: q.region, observationPeriod: q.period });
    const submitted = q.status !== 'draft';
    await db.insert(s.contributions).values({
      id: q.id, orgId: q.org, authorId: q.author, kind: q.kind, title: q.title, observation: q.observation, offeringSlug: q.offering, industry: q.industry, region: q.region,
      observationPeriod: q.period, evidenceType: q.evidence, confidence: q.confidence, topic: q.topic, supportLinks: [], sharingChoice: q.choice, status: q.status, version: 1,
      sensitiveFlags: flags, sensitiveAcknowledged: submitted && flags.length > 0, lastModeratorMessage: q.msg ?? null, createdAt: ago(q.day + 1), updatedAt: ago(q.day), submittedAt: submitted ? ago(q.day) : null,
    }).onConflictDoNothing();
    if (submitted) {
      const community = q.choice === 'community';
      await db.insert(s.contributionConsents).values((['store_process', 'publish_shared', 'attribution', 'training'] as const).map((purpose) => ({
        id: `cns_${q.id}_${purpose}`, contributionId: q.id, userId: q.author, purpose, contributionVersion: 1, granted: purpose === 'store_process' || (purpose === 'publish_shared' && community), at: ago(q.day), note: community ? 'submitted for community review' : 'shared with own organisation',
      }))).onConflictDoNothing();
    }
  }
  const evs = [
    { id: 'mod_seed_q_sub1_sub', contributionId: 'con_seed_q_sub1', moderatorId: USER.hbAdmin, actorRole: 'author' as const, fromStatus: 'draft', toStatus: 'submitted', decision: 'submitted', at: ago(2) },
    { id: 'mod_seed_q_sub2_sub', contributionId: 'con_seed_q_sub2', moderatorId: USER.atAdmin, actorRole: 'author' as const, fromStatus: 'draft', toStatus: 'submitted', decision: 'submitted', at: ago(1) },
    { id: 'mod_seed_q_clar_sub', contributionId: 'con_seed_q_clar', moderatorId: USER.nwAdmin, actorRole: 'author' as const, fromStatus: 'draft', toStatus: 'submitted', decision: 'submitted', at: ago(6) },
    { id: 'mod_seed_q_clar_claim', contributionId: 'con_seed_q_clar', moderatorId: MOD, actorRole: 'moderator' as const, fromStatus: 'submitted', toStatus: 'in_review', decision: 'claimed', at: ago(5, 20) },
    { id: 'mod_seed_q_clar_ask', contributionId: 'con_seed_q_clar', moderatorId: MOD, actorRole: 'moderator' as const, fromStatus: 'in_review', toStatus: 'clarification_requested', decision: 'clarification_requested', at: ago(5, 22), reasonPublic: Q[2].msg, internalNote: 'Low confidence and anecdotal. Need a relative size before this is useful to others. Possible duplicate of nothing so far.' },
    { id: 'mod_seed_hb_org_only_share', contributionId: 'con_seed_hb_org_only', moderatorId: USER.hbMember, actorRole: 'author' as const, fromStatus: 'draft', toStatus: 'published', decision: 'shared_with_organisation', at: ago(9) },
  ];
  await db.insert(s.moderationEvents).values(evs).onConflictDoNothing();
  await db.insert(s.reviewDrafts).values({ contributionId: 'con_seed_q_clar', claimedBy: MOD, title: Q[2].title, summary: Q[2].observation, industry: 'Credit union', region: 'North America', periodLabel: 'Spring 2026', evidenceQuality: 'weak', redactionNotes: 'Waiting on contributor.', reviewed: false, updatedAt: ago(5, 22) }).onConflictDoNothing();
  await db.insert(s.notifications).values([
    { userId: USER.nwAdmin, kind: 'learning.clarification_requested', title: 'A moderator needs clarification', body: `"${Q[2].title}": please read the question and resubmit.\nModerator message: ${Q[2].msg}`, link: '/learn/c/con_seed_q_clar', dedupeKey: 'learn:mod_seed_q_clar_ask', createdAt: ago(5, 22) },
    { userId: MOD, kind: 'moderation.queue', title: 'New contribution awaiting review', body: `"${Q[0].title}" (submitted).`, link: '/moderation/con_seed_q_sub1', dedupeKey: 'learn:mod_seed_q_sub1_sub:mod:' + MOD, createdAt: ago(2) },
    { userId: MOD, kind: 'moderation.queue', title: 'New contribution awaiting review', body: `"${Q[1].title}" (submitted).`, link: '/moderation/con_seed_q_sub2', dedupeKey: 'learn:mod_seed_q_sub2_sub:mod:' + MOD, createdAt: ago(1) },
  ]).onConflictDoNothing();

  // One open report on a published shared item (reporter = an Atlas member; never disclosed to the contributor).
  await db.insert(s.reports).values({ id: 'rep_seed_open', sharedId: 'shr_seed_doc_hb', reporterId: USER.atMember, reporterOrgId: ORG.atlas, reason: 'misleading', details: 'The wording reads as if it applies to all informal borrowers. Our experience in a different market is not the same, so it may over-generalise.', status: 'open', createdAt: ago(1) }).onConflictDoNothing();
  await db.insert(s.notifications).values({ userId: MOD, kind: 'moderation.report', title: 'New report on a shared observation', body: `"${PUB[4].shared.title}" was reported (misleading).`, link: '/moderation/reports/rep_seed_open', dedupeKey: `report:rep_seed_open:${MOD}`, createdAt: ago(1) }).onConflictDoNothing();
}
