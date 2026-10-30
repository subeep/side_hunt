import { inArray } from 'drizzle-orm';
import type { Db } from '../index';
import * as schema from '../schema';
import { ORG, USER } from './core';

/**
 * Owned by the insights feature agent. Idempotent (fixed ids, onConflictDoNothing). Synthetic data only.
 * Runs AFTER the learning seed. Anything that references a shr_seed_* row is skipped (and logged) if that row is missing.
 */
const SHARED = ['shr_seed_season_nw', 'shr_seed_season_hb', 'shr_seed_season_at', 'shr_seed_doc_nw', 'shr_seed_doc_hb', 'shr_seed_report_at'] as const;
const ago = (days: number) => new Date(Date.now() - days * 86400_000);

export async function seedInsights(db: Db) {
  const s = schema;
  const have = new Set((await db.select({ id: s.sharedContributions.id }).from(s.sharedContributions).where(inArray(s.sharedContributions.id, [...SHARED]))).map((r) => r.id));
  const missing = SHARED.filter((id) => !have.has(id));
  if (missing.length) console.warn(`[seed:insights] learning seed rows missing (${missing.join(', ')}): skipping themes/ideas/engagement that depend on them.`);
  const live = (ids: readonly string[]) => ids.filter((id) => have.has(id));

  // Hand-made themes (the single-organisation reporting item stays unthemed on purpose).
  const themes = [
    { id: 'thm_seed_season', title: 'Seasonality context', summary: 'Organisations report that seasonal small-business cash flow is read inconsistently: peak-season receipts are normalised in different ways and quiet months can look like stress.', offeringSlug: 'sme-credit-decisioning', topic: 'Seasonal cash flow', caveat: 'Early signal from a small group of organisations. Reports describe experiences, not measured prevalence, and do not show cause.', ids: ['shr_seed_season_nw', 'shr_seed_season_hb', 'shr_seed_season_at'] },
    { id: 'thm_seed_docs', title: 'Document inconsistencies', summary: 'Source documents for the same borrower (statements, tax filings, ledgers) often disagree, and there is no shared rule for reconciling them or showing which source was used.', offeringSlug: 'sme-credit-decisioning', topic: 'Document inconsistencies', caveat: 'Only two organisations have contributed so far, so figures are withheld and this should be treated as tentative.', ids: ['shr_seed_doc_nw', 'shr_seed_doc_hb'] },
  ];
  for (const t of themes) {
    await db.insert(s.themes).values({ id: t.id, title: t.title, summary: t.summary, offeringSlug: t.offeringSlug, topic: t.topic, caveat: t.caveat, createdBy: USER.owner, updatedAt: ago(3) }).onConflictDoNothing();
    const ids = live(t.ids);
    if (ids.length) await db.insert(s.themeMembers).values(ids.map((sharedId) => ({ themeId: t.id, sharedId, addedBy: USER.owner }))).onConflictDoNothing();
  }

  // Improvement ideas with audience-appropriate updates. Status is never a delivery promise.
  const ideas = [
    {
      id: 'ida_seed_season', title: 'Financial Analysis Intelligence: add a seasonality-aware comparison explanation',
      problem: 'Seasonal small-business cash flow is normalised inconsistently, so comparable applications can be explained and decided differently depending on the reviewer.',
      offeringSlug: 'sme-credit-decisioning', proposedOutcome: 'When seasonal patterns affect a comparison, reviewers see a plain explanation of how peak and quiet months were treated.',
      team: 'Financial Analysis', priority: 'high' as const, status: 'under_review' as const, themeId: 'thm_seed_season', evidence: ['shr_seed_season_nw', 'shr_seed_season_hb', 'shr_seed_season_at'],
      history: [['proposed', null, 9, 'Idea created from the Seasonality context theme'], ['under_review', 'proposed', 3, 'Picked up at the weekly triage']] as const,
      update: 'Under review. Not a promised delivery.', updateDays: 3,
    },
    {
      id: 'ida_seed_planned', title: 'Document intelligence: show which source document fed each ratio',
      problem: 'When statements and tax filings disagree, analysts reconcile by hand and the workbench does not show which document a given ratio came from.',
      offeringSlug: 'sme-credit-decisioning', proposedOutcome: 'Each ratio shows its source document and flags material disagreement between sources.',
      team: 'Financial Analysis', priority: 'medium' as const, status: 'planned' as const, themeId: 'thm_seed_docs', evidence: ['shr_seed_doc_nw', 'shr_seed_doc_hb'],
      history: [['proposed', null, 20, 'Idea created'], ['under_review', 'proposed', 12, 'Reviewed with the analytics team'], ['planned', 'under_review', 5, 'Agreed to scope the design']] as const,
      update: 'Planned. We have decided to scope this and will share progress here. This is a status update, not a delivery promise.', updateDays: 5,
    },
    {
      id: 'ida_seed_notproceeding', title: 'RIVA: configurable decimal precision per regulator rule',
      problem: 'A local validation rule was stricter than the regulator checker and rejected a valid return until the field was re-mapped.',
      offeringSlug: 'riva', proposedOutcome: 'Validation rules can be aligned to the regulator checker without re-mapping fields.',
      team: 'Reporting and Validation', priority: 'low' as const, status: 'not_proceeding' as const, themeId: null, evidence: ['shr_seed_report_at'],
      history: [['proposed', null, 25, 'Idea created'], ['under_review', 'proposed', 18, 'Reviewed'], ['not_proceeding', 'under_review', 7, 'Existing mapping options cover the case']] as const,
      update: 'Not proceeding for now. We reviewed this and the existing field-mapping options already cover it. We will look again if more organisations raise the same point. This is not a delivery promise.', updateDays: 7,
    },
  ];
  for (const i of ideas) {
    const [created] = await db.insert(s.ideas).values({
      id: i.id, title: i.title, problem: i.problem, offeringSlug: i.offeringSlug, proposedOutcome: i.proposedOutcome, ownerUserId: USER.owner, team: i.team,
      priority: i.priority, status: i.status, themeId: i.themeId && have.size ? i.themeId : null, createdBy: USER.owner, createdAt: ago(i.history[0][2]), updatedAt: ago(i.updateDays),
    }).onConflictDoNothing().returning({ id: s.ideas.id });
    const ev = live(i.evidence);
    if (ev.length) await db.insert(s.ideaEvidence).values(ev.map((sharedId) => ({ ideaId: i.id, sharedId }))).onConflictDoNothing();
    if (!created) continue;
    await db.insert(s.ideaStatusHistory).values(i.history.map(([to, from, days, note], n) => ({ id: `ish_seed_${i.id.slice(9)}_${n}`, ideaId: i.id, fromStatus: from, toStatus: to, actorId: USER.owner, note, at: ago(days) }))).onConflictDoNothing();
    await db.insert(s.ideaUpdates).values({ id: `iup_seed_${i.id.slice(9)}`, ideaId: i.id, message: i.update, createdBy: USER.owner, createdAt: ago(i.updateDays) }).onConflictDoNothing();
    await db.insert(s.auditEvents).values([
      { actorId: USER.owner, actorOrgId: ORG.azentio, action: 'idea.create', resourceType: 'idea', resourceId: i.id, meta: { evidence: ev.length, seed: true } },
      ...((i.status as string) !== 'proposed' ? [{ actorId: USER.owner, actorOrgId: ORG.azentio, action: 'idea.status_change', resourceType: 'idea', resourceId: i.id, meta: { to: i.status, seed: true } }] : []),
    ]);
  }

  if (have.has('shr_seed_season_nw')) {
    await db.insert(s.comments).values([
      { id: 'cmt_seed_1', parentType: 'shared', parentId: 'shr_seed_season_nw', authorId: USER.hbMember, authorOrgId: ORG.harbor, body: 'We see the same pattern around harvest timing, so this matches our experience.', createdAt: ago(10) },
      { id: 'cmt_seed_2', parentType: 'shared', parentId: 'shr_seed_season_nw', authorId: USER.atMember, authorOrgId: ORG.atlas, body: 'Is anyone normalising by a trailing twelve-month view? Curious how others handle quiet months.', createdAt: ago(8) },
      { id: 'cmt_seed_3', parentType: 'shared', parentId: 'shr_seed_season_nw', authorId: USER.owner, authorOrgId: ORG.azentio, body: 'Thanks all. A linked improvement idea is under review. This is a status update, not a delivery promise.', createdAt: ago(3) },
    ]).onConflictDoNothing();
  }
  const votes = [
    ['fbv_seed_1', USER.hbMember, 'shr_seed_season_nw', 'useful'], ['fbv_seed_2', USER.atMember, 'shr_seed_season_nw', 'useful'], ['fbv_seed_3', USER.nwMember, 'shr_seed_season_hb', 'useful'],
    ['fbv_seed_4', USER.hbMember, 'shr_seed_season_at', 'needs_evidence'], ['fbv_seed_5', USER.nwMember, 'shr_seed_doc_hb', 'needs_evidence'],
  ] as const;
  const liveVotes = votes.filter((v) => have.has(v[2]));
  if (liveVotes.length) await db.insert(s.feedbackVotes).values(liveVotes.map(([id, userId, sharedId, vote]) => ({ id, userId, sharedId, vote }))).onConflictDoNothing();

  await db.insert(s.savedSearches).values({ id: 'sav_seed_nw', userId: USER.nwMember, name: 'Seasonal SME cash flow', query: 'seasonal cash flow', filters: { offering: 'sme-credit-decisioning' } }).onConflictDoNothing();
  const marks = [
    ...(have.has('shr_seed_season_hb') ? [{ id: 'bkm_seed_1', userId: USER.nwMember, targetType: 'shared', targetId: 'shr_seed_season_hb' }] : []),
    { id: 'bkm_seed_2', userId: USER.nwMember, targetType: 'theme', targetId: 'thm_seed_season' },
    { id: 'bkm_seed_3', userId: USER.nwMember, targetType: 'idea', targetId: 'ida_seed_season' },
  ];
  await db.insert(s.bookmarks).values(marks).onConflictDoNothing();
  await db.insert(s.digestSubscriptions).values({ userId: USER.nwMember, frequency: 'weekly', topics: ['Seasonal cash flow'] }).onConflictDoNothing();
}
