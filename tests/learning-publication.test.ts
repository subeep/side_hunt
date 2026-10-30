import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { as, USER } from './helpers/principals';
import {
  PRODUCTION_PROPAGATION_SLA, WITHDRAWAL_CAVEATS, authorTimeline, openReports, createReport, decideReport, indexShared, investigateReport, publishShared, purgeRetrievalCache,
  reinstateShared, removeFromIndex, saveContribution, saveSharedDraft, unpublishShared, withdrawContribution, withdrawShared,
} from '@/lib/learning';
import { createReport as createReportDirect } from '@/lib/learning/reports';
import { mkPublished, mkSubmitted, validInput, GOOD_REP } from './learning-helpers';

const cacheRow = (key: string, ids: string[], payload: unknown = null) => db.insert(schema.retrievalCache).values({ key, scope: 'test', resultIds: ids, payload });
const idxCount = async (id: string) => (await db.select().from(schema.searchIndex).where(eq(schema.searchIndex.sharedId, id))).length;

describe('index and cache primitives', () => {
  it('indexShared only indexes published items; removeFromIndex and purgeRetrievalCache work by id', async () => {
    const mod = await as(USER.moderator);
    const { sharedId } = await mkPublished(await as(USER.nwMember), mod);
    expect(await idxCount(sharedId)).toBe(1);
    expect(await removeFromIndex(sharedId)).toBe(1);
    expect(await indexShared(sharedId)).toBe(true);
    await cacheRow(`k1-${sharedId}`, [sharedId, 'shr_other']);
    await cacheRow(`k2-${sharedId}`, ['shr_other'], { text: `contains ${sharedId} in payload` });
    await cacheRow(`k3-${sharedId}`, ['shr_other'], { text: 'unrelated' });
    expect(await purgeRetrievalCache(sharedId)).toBe(2);
    const left = await db.select().from(schema.retrievalCache).where(eq(schema.retrievalCache.key, `k3-${sharedId}`));
    expect(left).toHaveLength(1);
    await db.delete(schema.retrievalCache).where(eq(schema.retrievalCache.key, `k3-${sharedId}`));
    // index text and terms are derived from the SHARED representation
    const [idx] = await db.select().from(schema.searchIndex).where(eq(schema.searchIndex.sharedId, sharedId));
    expect(idx.terms.seasonal).toBeGreaterThan(0);
    expect(idx.text).toContain(GOOD_REP.title);
  });
});

describe('withdrawal: one synchronous call with a trace', () => {
  it('marks withdrawn, deletes the index row, purges cache rows, audits, notifies and returns a trace', async () => {
    const author = await as(USER.hbMember);
    const mod = await as(USER.moderator);
    const { id, sharedId } = await mkPublished(author, mod);
    await cacheRow(`w1-${sharedId}`, ['shr_x', sharedId]);
    await cacheRow(`w2-${sharedId}`, ['shr_y'], { answer: sharedId });
    await cacheRow(`w3-${sharedId}`, ['shr_z']);
    expect(await idxCount(sharedId)).toBe(1);

    const r = await withdrawShared(author, sharedId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // trace: each invalidation stage, ISO timestamps, monotone ms
    expect(r.trace.length).toBeGreaterThanOrEqual(6);
    for (const t of r.trace) {
      expect(typeof t.step).toBe('string');
      expect(new Date(t.at).toISOString()).toBe(t.at);
      expect(t.ms_since_start).toBeGreaterThanOrEqual(0);
    }
    expect(r.trace.map((t) => t.ms_since_start)).toEqual([...r.trace.map((t) => t.ms_since_start)].sort((a, b) => a - b));
    const steps = r.trace.map((t) => t.step).join(' | ');
    expect(steps).toMatch(/marked withdrawn/);
    expect(steps).toMatch(/search index row deleted \(1 row\)/);
    expect(steps).toMatch(/retrieval cache purged \(2 cached results/);
    expect(steps).toMatch(/verified: 0 index rows and 0 cache entries/);
    expect(r.sla).toBe(PRODUCTION_PROPAGATION_SLA);
    expect(PRODUCTION_PROPAGATION_SLA).toMatch(/60 seconds/);
    expect(WITHDRAWAL_CAVEATS.join(' ')).toMatch(/already viewed|viewed/);
    expect(WITHDRAWAL_CAVEATS.join(' ')).toMatch(/untrain/i);

    const [s] = await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, sharedId));
    expect(s.status).toBe('withdrawn');
    expect(s.withdrawnAt).toBeInstanceOf(Date);
    expect(await idxCount(sharedId)).toBe(0);
    const caches = await db.select().from(schema.retrievalCache);
    expect(caches.filter((c) => c.key.startsWith('w1-') || c.key.startsWith('w2-')).filter((c) => c.key.endsWith(sharedId))).toHaveLength(0);
    expect(caches.filter((c) => c.key === `w3-${sharedId}`)).toHaveLength(1); // unrelated cache untouched
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c.status).toBe('withdrawn');
    const aud = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.resourceId, sharedId), eq(schema.auditEvents.action, 'learning.shared.withdraw')));
    expect(aud).toHaveLength(1);
    const ntf = await db.select().from(schema.notifications).where(and(eq(schema.notifications.userId, USER.hbMember), eq(schema.notifications.kind, 'learning.withdrawn')));
    expect(ntf.some((n) => n.link === `/learn/c/${id}`)).toBe(true);
    // second withdrawal is refused (already withdrawn) and changes nothing
    expect(await withdrawShared(author, sharedId)).toMatchObject({ ok: false, code: 'illegal_transition' });
  });

  it('only the contributing author can withdraw: colleagues, other tenants, moderators, admins get not_found and nothing changes', async () => {
    const author = await as(USER.nwMember);
    const mod = await as(USER.moderator);
    const { id, sharedId } = await mkPublished(author, mod);
    for (const who of [USER.nwAdmin, USER.hbAdmin, USER.moderator, USER.admin, USER.owner, USER.employee, USER.outsider]) {
      expect(await withdrawShared(await as(who), sharedId), who).toMatchObject({ ok: false, code: 'not_found' });
      expect(await withdrawContribution(await as(who), id), who).toMatchObject({ ok: false, code: 'not_found' });
    }
    expect(await withdrawShared(await as(USER.multi), sharedId)).toMatchObject({ ok: false });
    const [s] = await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, sharedId));
    expect(s.status).toBe('published');
    expect(await idxCount(sharedId)).toBe(1);
  });

  it('withdrawing while a newer version is pending review still works and ends the pending revision', async () => {
    const author = await as(USER.atMember);
    const mod = await as(USER.moderator);
    const { id, sharedId } = await mkPublished(author, mod);
    await saveContribution(author, id, validInput({ title: 'Edited while live, version two' }), { acknowledgeFlags: true });
    const [pending] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(pending.status).toBe('submitted');
    const r = await withdrawContribution(author, id);
    expect(r.ok).toBe(true);
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c.status).toBe('withdrawn');
    expect(await idxCount(sharedId)).toBe(0);
  });

  it('organisation-only items can be withdrawn too (no shared copy to purge)', async () => {
    const author = await as(USER.hbMember);
    const id = await mkSubmitted(author, { sharingChoice: 'organisation' });
    const r = await withdrawContribution(author, id);
    expect(r.ok).toBe(true);
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c.status).toBe('withdrawn');
    expect(await withdrawContribution(author, id)).toMatchObject({ ok: false });
  });
});

describe('unpublish / reinstate', () => {
  it('unpublish removes the item from index and caches immediately and tells the author; reinstate re-indexes; only moderators', async () => {
    const author = await as(USER.nwAdmin);
    const mod = await as(USER.moderator);
    const { id, sharedId } = await mkPublished(author, mod);
    await cacheRow(`u1-${sharedId}`, [sharedId]);
    expect(await unpublishShared(await as(USER.admin), sharedId, { reasonPublic: 'nope nope' })).toMatchObject({ ok: false });
    expect(await unpublishShared(author, sharedId, { reasonPublic: 'nope nope' })).toMatchObject({ ok: false });
    expect((await unpublishShared(mod, sharedId, { reasonPublic: 'Under review after a concern.', internalNote: 'INTERNAL-UNPUB' })).ok).toBe(true);
    expect((await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, sharedId)))[0].status).toBe('unpublished');
    expect(await idxCount(sharedId)).toBe(0);
    expect(await db.select().from(schema.retrievalCache).where(eq(schema.retrievalCache.key, `u1-${sharedId}`))).toHaveLength(0);
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c).toMatchObject({ status: 'unpublished', lastModeratorMessage: 'Under review after a concern.' });
    expect(JSON.stringify(await authorTimeline(id))).not.toContain('INTERNAL-UNPUB');
    expect(await unpublishShared(mod, sharedId, { reasonPublic: 'again please' })).toMatchObject({ ok: false, code: 'illegal_transition' });
    expect(await reinstateShared(author, sharedId)).toMatchObject({ ok: false });
    expect((await reinstateShared(mod, sharedId)).ok).toBe(true);
    expect(await idxCount(sharedId)).toBe(1);
    // an author can withdraw an unpublished item
    expect((await unpublishShared(mod, sharedId, { reasonPublic: 'Second review in progress.' })).ok).toBe(true);
    expect((await withdrawShared(author, sharedId)).ok).toBe(true);
  });
});

describe('reporting', () => {
  it('a signed-in principal who can see the item can report; moderators see the reporter, the contributor never does', async () => {
    const reporter = await as(USER.atMember);
    const r = await createReport(reporter, { sharedId: 'shr_seed_season_nw', reason: 'confidential', details: 'Reads as if it could identify a small lender.' });
    expect(r).toMatchObject({ ok: true, duplicate: false });
    if (!r.ok) return;
    const [row] = await db.select().from(schema.reports).where(eq(schema.reports.id, r.id));
    expect(row).toMatchObject({ reporterId: USER.atMember, reporterOrgId: 'org_atlas', status: 'open', sharedId: 'shr_seed_season_nw' });
    // duplicate open report by the same user is idempotent
    expect(await createReport(reporter, { sharedId: 'shr_seed_season_nw', reason: 'misleading' })).toMatchObject({ ok: true, duplicate: true, id: r.id });
    // moderators see it
    const mod = await as(USER.moderator);
    expect((await openReports(mod)).map((x) => x.id)).toContain(r.id);
    const inv = await investigateReport(mod, r.id);
    expect(inv?.reporterOrgName).toBe('Atlas Regional Bank');
    expect((await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.resourceId, r.id), eq(schema.auditEvents.action, 'learning.report.investigate')))).length).toBe(1);
    expect(await investigateReport(await as(USER.nwAdmin), r.id)).toBeNull();
    expect(await investigateReport(await as(USER.admin), r.id)).toBeNull();
    // moderators were notified in-app
    expect((await db.select().from(schema.notifications).where(eq(schema.notifications.dedupeKey, `report:${r.id}:${USER.moderator}`))).length).toBe(1);
    // the contributor-facing surfaces contain nothing about the reporter
    const contrib = JSON.stringify([
      await authorTimeline('con_seed_season_nw'),
      await db.select().from(schema.notifications).where(eq(schema.notifications.userId, USER.nwMember)),
      await db.select().from(schema.contributions).where(eq(schema.contributions.id, 'con_seed_season_nw')),
    ]);
    for (const needle of [USER.atMember, 'org_atlas', 'Atlas', 'member@atlas', 'Reads as if it could identify']) expect(contrib).not.toContain(needle);
  });

  it('people who cannot see the item cannot report it; unknown / withdrawn / unpublished ids get the same generic refusal', async () => {
    const mod = await as(USER.moderator);
    const { sharedId } = await mkPublished(await as(USER.nwMember), mod);
    const base = { reason: 'misleading' };
    expect(await createReport(null, { sharedId, ...base })).toMatchObject({ ok: false });
    for (const who of [USER.employee, USER.admin, USER.outsider]) expect(await createReport(await as(who), { sharedId, ...base }), who).toMatchObject({ ok: false, code: 'not_found' });
    const unapproved = { ...(await as(USER.hbMember)), communityApproved: false };
    expect(await createReport(unapproved, { sharedId, ...base })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await createReport(await as(USER.hbMember), { sharedId: 'shr_nope', ...base })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await createReport(await as(USER.hbMember), { sharedId, reason: 'because' })).toMatchObject({ ok: false, code: 'invalid' });
    await unpublishShared(mod, sharedId, { reasonPublic: 'Offline during a check.' });
    expect(await createReport(await as(USER.hbMember), { sharedId, ...base })).toMatchObject({ ok: false, code: 'not_found' });
    expect((await db.select().from(schema.reports).where(eq(schema.reports.sharedId, sharedId))).length).toBe(0);
  });

  it('reports are rate limited per user', async () => {
    const reporter = await as(USER.atAdmin);
    const ids = ['shr_seed_season_nw', 'shr_seed_season_hb', 'shr_seed_doc_nw', 'shr_seed_doc_hb', 'shr_seed_report_at'];
    const mod = await as(USER.moderator);
    const extra = (await mkPublished(await as(USER.nwMember), mod)).sharedId;
    const results = [];
    for (const sid of [...ids, extra]) results.push(await createReportDirect(reporter, { sharedId: sid, reason: 'inappropriate' }));
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toMatchObject({ ok: false, code: 'rate_limited' });
  });

  it('deciding a report: actioned takes the item offline with a public reason; dismissed leaves it; not repeatable; moderators only', async () => {
    const mod = await as(USER.moderator);
    const author = await as(USER.nwMember);
    const a = await mkPublished(author, mod);
    const b = await mkPublished(author, mod);
    const ra = await createReport(await as(USER.hbMember), { sharedId: a.sharedId, reason: 'confidential' });
    const rb = await createReport(await as(USER.atMember), { sharedId: b.sharedId, reason: 'misleading' });
    if (!ra.ok || !rb.ok) throw new Error('setup');
    expect(await decideReport(await as(USER.admin), ra.id, { decision: 'actioned', note: 'trying to decide' })).toMatchObject({ ok: false, code: 'forbidden_actor' });
    expect(await decideReport(await as(USER.nwAdmin), ra.id, { decision: 'dismissed', note: 'client tries' })).toMatchObject({ ok: false });
    expect(await decideReport(mod, ra.id, { decision: 'maybe', note: 'abc def' })).toMatchObject({ ok: false, code: 'invalid' });
    expect((await decideReport(mod, ra.id, { decision: 'actioned', note: 'INTERNAL-DECISION upheld', reasonPublic: 'A concern about this item was upheld.' })).ok).toBe(true);
    expect((await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, a.sharedId)))[0].status).toBe('unpublished');
    expect(await idxCount(a.sharedId)).toBe(0);
    expect((await db.select().from(schema.reports).where(eq(schema.reports.id, ra.id)))[0]).toMatchObject({ status: 'actioned', decidedBy: USER.moderator, decisionNote: 'INTERNAL-DECISION upheld' });
    const contrib = JSON.stringify([await authorTimeline(a.id), await db.select().from(schema.notifications).where(eq(schema.notifications.userId, USER.nwMember))]);
    expect(contrib).toContain('A concern about this item was upheld.');
    expect(contrib).not.toContain('INTERNAL-DECISION');
    expect(contrib).not.toContain(USER.hbMember);
    expect(await decideReport(mod, ra.id, { decision: 'dismissed', note: 'second try' })).toMatchObject({ ok: false, code: 'illegal_transition' });
    expect((await decideReport(mod, rb.id, { decision: 'dismissed', note: 'No change needed after review.' })).ok).toBe(true);
    expect((await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, b.sharedId)))[0].status).toBe('published');
    expect(await idxCount(b.sharedId)).toBe(1);
  });
});

// Review fixes: pending withdrawal, org visibility after withdrawal, honest wording.
import { statusBody } from '@/lib/learning/constants';
describe('review fixes: withdrawal of pending proposals', () => {
  it('a withdrawn pending proposal records publish consent as withdrawn, leaves the queue and cannot be published', async () => {
    const { as, USER } = await import('./helpers/principals');
    const { moderationQueue, claimForReview, publishShared, currentConsents, withdrawContribution } = await import('@/lib/learning');
    const { mkSubmitted } = await import('./learning-helpers');
    const author = await as(USER.hbMember);
    const mod = await as(USER.moderator);
    const id = await mkSubmitted(author);
    expect((await moderationQueue(mod)).some((q) => q.id === id)).toBe(true);
    expect((await claimForReview(mod, id)).ok).toBe(true);
    const w = await withdrawContribution(author, id);
    expect(w.ok).toBe(true);
    expect((await currentConsents(id)).publish_shared.granted).toBe(false);
    expect((await moderationQueue(mod)).some((q) => q.id === id)).toBe(false);
    expect((await publishShared(mod, id)).ok).toBe(false);
    // another member of the author's org cannot withdraw it
    expect((await withdrawContribution(await as(USER.hbAdmin), id)).ok).toBe(false);
  });
  it('status copy does not claim that organisation-only items were reviewed', () => {
    expect(statusBody('published', 'organisation')).toMatch(/not reviewed by moderators/);
    expect(statusBody('published', 'community')).toMatch(/moderator-reviewed/);
  });
});
