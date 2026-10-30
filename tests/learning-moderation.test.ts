import { describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { as, USER, ORG } from './helpers/principals';
import {
  authorTimeline, claimForReview, decideReport, getForModeration, moderationDetail, moderationQueue, openReports, publishShared, rejectContribution, requestClarification,
  saveContribution, saveSharedDraft, sharedPublicColumns, submitContribution, transition,
} from '@/lib/learning';
import { GOOD_REP, mkDraft, mkSubmitted, validInput, ALL_CONSENTS, mkPublished } from './learning-helpers';

const PRIVATE_STRINGS = ['GreenEdge', 'Ms Patel', '4821 9930 1127', 'priya.patel', 'Lakeshore', 'Kampong', 'Sok Vannak', '+855 12 345 678', 'Tonle', 'Zur Post', 'Garmisch', 'DE89 3704', 'Weber', 'Dunmore', 'Okafor', 'Siem Reap', 'Chea', '0123456789', 'RC-14', 'reports@atlas', 'NDA', 'EUR 250,000', '$85,000'];
const INTERNAL = ['INTERNAL-REDACTION-NOTE', 'Single-cycle evidence', 'Removed branch name', 'Removed officer name', 'Removed hotel name'];

describe('moderator access: only explicitly submitted contributions', () => {
  it('drafts (even community-intended), private and organisation-only items are 404 for moderators; submitted ones open', async () => {
    const mod = await as(USER.moderator);
    expect(await getForModeration(mod, 'con_seed_nw_draft')).toBeNull();
    expect(await getForModeration(mod, 'con_seed_hb_org_only')).toBeNull();
    const priv = await mkDraft(await as(USER.nwMember), { sharingChoice: 'private' });
    expect(await getForModeration(mod, priv)).toBeNull();
    expect(await moderationDetail(mod, priv)).toBeNull();
    expect(await getForModeration(mod, 'con_seed_q_sub1')).not.toBeNull();
    expect(await getForModeration(mod, 'con_seed_q_clar')).not.toBeNull();
    const denies = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.resourceId, 'con_seed_nw_draft'), eq(schema.auditEvents.outcome, 'deny')));
    expect(denies.length).toBeGreaterThan(0);
  });

  it('only holders of the learning_moderator grant: admin, employee, product owner, clients are refused', async () => {
    for (const who of [USER.admin, USER.employee, USER.owner, USER.publisher, USER.nwAdmin, USER.hbMember, USER.outsider]) {
      const p = await as(who);
      expect(await getForModeration(p, 'con_seed_q_sub1'), who).toBeNull();
      expect(await moderationQueue(p), who).toEqual([]);
      expect(await openReports(p), who).toEqual([]);
      expect(await claimForReview(p, 'con_seed_q_sub2'), who).toMatchObject({ ok: false });
      expect(await publishShared(p, 'con_seed_q_sub2')).toMatchObject({ ok: false });
    }
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, 'con_seed_q_sub2'));
    expect(c.status).toBe('submitted');
  });

  it('the queue holds the seeded submitted + clarification items and never drafts or org-only items', async () => {
    const q = await moderationQueue(await as(USER.moderator));
    const ids = q.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['con_seed_q_sub1', 'con_seed_q_sub2', 'con_seed_q_clar']));
    expect(ids).not.toContain('con_seed_nw_draft');
    expect(ids).not.toContain('con_seed_hb_org_only');
    expect(q.every((x) => ['submitted', 'in_review', 'clarification_requested'].includes(x.status))).toBe(true);
    expect((await openReports(await as(USER.moderator))).map((r) => r.id)).toContain('rep_seed_open');
  });
});

describe('review and publication', () => {
  it('claim -> redact -> publish creates a shared copy with ONLY reviewed fields and indexes it from the shared text', async () => {
    const author = await as(USER.hbMember);
    const mod = await as(USER.moderator);
    const id = await mkSubmitted(author, { title: 'Hugo at Secret Harbor Ltd saw it', observation: 'Mr Tan (tan@harbor.example) at Secret Harbor Ltd reported delayed repayment schedules for the harvest season over two cycles.' });
    // author cannot claim or publish; publishing needs a claim and a saved review
    expect(await transition(author, id, 'in_review')).toMatchObject({ ok: false, code: 'forbidden_actor' });
    expect(await publishShared(mod, id)).toMatchObject({ ok: false, code: 'illegal_transition' });
    expect((await claimForReview(mod, id)).ok).toBe(true);
    expect(await claimForReview(mod, id)).toMatchObject({ ok: false, code: 'illegal_transition' }); // already claimed
    expect(await publishShared(mod, id)).toMatchObject({ ok: false, code: 'precondition' }); // pre-filled draft is not a reviewed representation
    // residual sensitive text blocks publication unless explicitly acknowledged
    expect((await saveSharedDraft(mod, id, { ...GOOD_REP, summary: 'Mr Tan at Secret Harbor Ltd reported delayed repayment schedules across the harvest season.' })).ok).toBe(true);
    expect(await publishShared(mod, id)).toMatchObject({ ok: false, code: 'precondition' });
    expect((await saveSharedDraft(mod, id, GOOD_REP)).ok).toBe(true);
    const r = await publishShared(mod, id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [shared] = await db.select(sharedPublicColumns).from(schema.sharedContributions).where(eq(schema.sharedContributions.id, r.sharedId));
    expect(shared.title).toBe(GOOD_REP.title);
    expect(shared.attributionLabel).toBeNull();
    const text = JSON.stringify(shared);
    for (const s of ['Secret Harbor', 'Mr Tan', 'tan@harbor', 'org_harbor', id, USER.hbMember, 'harbor.example', 'INTERNAL-REDACTION-NOTE']) expect(text).not.toContain(s);
    expect(Object.keys(shared).sort()).toEqual(Object.keys(sharedPublicColumns).sort());
    const [idx] = await db.select().from(schema.searchIndex).where(eq(schema.searchIndex.sharedId, r.sharedId));
    expect(idx.text).toContain('inconsistently');
    for (const s of ['Secret Harbor', 'Mr Tan', 'tan@harbor']) expect(idx.text).not.toContain(s);
    // internal copy keeps org id internally, but the contribution points to the shared copy
    const [row] = await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, r.sharedId));
    expect(row.orgId).toBe(ORG.harbor);
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c).toMatchObject({ status: 'published', currentSharedId: r.sharedId });
    // the author was notified in-app, honestly (no 'delivered' claims)
    const n = await db.select().from(schema.notifications).where(and(eq(schema.notifications.userId, USER.hbMember), eq(schema.notifications.kind, 'learning.published')));
    expect(n.some((x) => x.link === `/learn/c/${id}`)).toBe(true);
    expect(n.every((x) => !/delivered/i.test(`${x.title} ${x.body}`))).toBe(true);
  });

  it('every published payload (seeded + new) contains no org id, contribution id, author id/email, internal notes or private source strings', async () => {
    await mkPublished(await as(USER.atMember), await as(USER.moderator));
    const rows = await db.select(sharedPublicColumns).from(schema.sharedContributions);
    expect(rows.length).toBeGreaterThanOrEqual(7);
    const blob = JSON.stringify(rows);
    const cons = await db.select({ id: schema.contributions.id, authorId: schema.contributions.authorId }).from(schema.contributions);
    const users = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users);
    for (const needle of [...Object.values(ORG), ...cons.map((c) => c.id), ...users.map((u) => u.id), ...users.map((u) => u.email), ...PRIVATE_STRINGS, ...INTERNAL, 'org_id', 'orgId', 'contribution_id', 'contributionId', 'publishedBy', 'published_by'])
      expect(blob, needle).not.toContain(needle);
    // and the search index is built from shared text only
    const idx = JSON.stringify(await db.select().from(schema.searchIndex));
    for (const needle of [...PRIVATE_STRINGS, ...INTERNAL, ...Object.values(ORG), 'con_seed']) expect(idx, needle).not.toContain(needle);
    // every seeded shared item is searchable, and each has a private source that DOES contain identifying detail
    expect((await db.select().from(schema.searchIndex)).length).toBeGreaterThanOrEqual(7);
    const [nw] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, 'con_seed_season_nw'));
    expect(nw.observation).toContain('GreenEdge');
  });

  it('seeded content follows the brief: three orgs for seasonality, two for documents, one for reporting', async () => {
    const rows = await db.select().from(schema.sharedContributions).where(inArray(schema.sharedContributions.id, ['shr_seed_season_nw', 'shr_seed_season_hb', 'shr_seed_season_at', 'shr_seed_doc_nw', 'shr_seed_doc_hb', 'shr_seed_report_at']));
    expect(rows).toHaveLength(6);
    expect(new Set(rows.filter((r) => r.topic === 'Seasonal cash flow').map((r) => r.orgId)).size).toBe(3);
    expect(new Set(rows.filter((r) => r.topic === 'Document inconsistencies').map((r) => r.orgId)).size).toBe(2);
    expect(new Set(rows.filter((r) => r.topic === 'Reporting validation').map((r) => r.orgId)).size).toBe(1);
    for (const r of rows) expect(r).toMatchObject({ status: 'published' });
    for (const r of rows.filter((x) => x.topic === 'Seasonal cash flow')) {
      expect(r.periodLabel && r.evidenceType && r.confidence).toBeTruthy();
      expect(r.offeringSlug).toBe('sme-credit-decisioning');
    }
    // the seasonal Harbor item went through one clarification round
    const ev = await db.select().from(schema.moderationEvents).where(eq(schema.moderationEvents.contributionId, 'con_seed_season_hb'));
    expect(ev.map((e) => e.decision)).toEqual(expect.arrayContaining(['clarification_requested', 'resubmitted', 'published']));
  });

  it('attribution only with consent AND explicit moderator choice', async () => {
    const mod = await as(USER.moderator);
    const noConsent = await mkSubmitted(await as(USER.atMember));
    await claimForReview(mod, noConsent);
    expect(await saveSharedDraft(mod, noConsent, { ...GOOD_REP, includeAttribution: true })).toMatchObject({ ok: false, code: 'precondition' });
    const withConsent = await mkSubmitted(await as(USER.atMember), {}, { ...ALL_CONSENTS, attribution: true });
    await claimForReview(mod, withConsent);
    await saveSharedDraft(mod, withConsent, GOOD_REP); // consent given but moderator does not include it
    const p1 = await publishShared(mod, withConsent);
    if (!p1.ok) throw new Error('x');
    expect((await db.select({ a: schema.sharedContributions.attributionLabel }).from(schema.sharedContributions).where(eq(schema.sharedContributions.id, p1.sharedId)))[0].a).toBeNull();
    const withConsent2 = await mkSubmitted(await as(USER.atMember), {}, { ...ALL_CONSENTS, attribution: true });
    await claimForReview(mod, withConsent2);
    await saveSharedDraft(mod, withConsent2, { ...GOOD_REP, includeAttribution: true });
    const p2 = await publishShared(mod, withConsent2);
    if (!p2.ok) throw new Error('x');
    expect((await db.select({ a: schema.sharedContributions.attributionLabel }).from(schema.sharedContributions).where(eq(schema.sharedContributions.id, p2.sharedId)))[0].a).toBe('Atlas Regional Bank');
  });

  it('clarification: the author sees the public question, never the internal note; resubmission returns it to the queue', async () => {
    const author = await as(USER.atAdmin);
    const mod = await as(USER.moderator);
    const id = await mkSubmitted(author);
    await claimForReview(mod, id);
    expect(await requestClarification(mod, id, 'x')).toMatchObject({ ok: false, code: 'invalid' });
    expect((await requestClarification(mod, id, 'How many files were affected, roughly?', 'INTERNAL: suspect duplicate of last month')).ok).toBe(true);
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c).toMatchObject({ status: 'clarification_requested', lastModeratorMessage: 'How many files were affected, roughly?' });
    const tl = JSON.stringify(await authorTimeline(id));
    expect(tl).toContain('How many files were affected');
    expect(tl).not.toContain('INTERNAL');
    const ntf = JSON.stringify(await db.select().from(schema.notifications).where(eq(schema.notifications.userId, USER.atAdmin)));
    expect(ntf).toContain('How many files were affected');
    expect(ntf).not.toContain('suspect duplicate');
    // author amends and resubmits (flags/consents handled again), moderator can claim once more
    expect((await saveContribution(author, id, validInput({ observation: 'About one file in five was affected; the pattern held across both winters we looked at.' }))).ok).toBe(true);
    expect((await submitContribution(author, id, { consents: ALL_CONSENTS, acknowledgeFlags: true })).ok).toBe(true);
    expect((await claimForReview(mod, id)).ok).toBe(true);
    const [mdetail] = [await moderationDetail(mod, id)];
    expect(mdetail!.events.some((e) => e.internalNote?.includes('suspect duplicate'))).toBe(true); // moderators do see it
  });

  it('reject: public reason to the author, internal note stays internal; terminal; the author cannot edit it back to life', async () => {
    const author = await as(USER.nwAdmin);
    const mod = await as(USER.moderator);
    const id = await mkSubmitted(author);
    await claimForReview(mod, id);
    expect(await rejectContribution(mod, id, { category: 'nonsense', reasonPublic: 'Duplicate of an existing item' })).toMatchObject({ ok: false, code: 'invalid' });
    expect((await rejectContribution(mod, id, { category: 'duplicate', reasonPublic: 'This duplicates an item we already hold.', internalNote: 'INTERNAL-DUP-OF-con_xyz' })).ok).toBe(true);
    const tl = JSON.stringify(await authorTimeline(id));
    expect(tl).toContain('duplicates an item');
    expect(tl).not.toContain('INTERNAL-DUP');
    expect(JSON.stringify(await db.select().from(schema.notifications).where(eq(schema.notifications.userId, USER.nwAdmin)))).not.toContain('INTERNAL-DUP');
    expect(await saveContribution(author, id, validInput())).toMatchObject({ ok: false, code: 'locked' });
    expect(await transition(author, id, 'draft')).toMatchObject({ ok: false, code: 'illegal_transition' });
    expect(await transition(mod, id, 'published')).toMatchObject({ ok: false, code: 'illegal_transition' });
  });

  it('the moderator cannot edit or publish through the author path; in-review items cannot be edited by the author', async () => {
    const author = await as(USER.hbAdmin);
    const mod = await as(USER.moderator);
    const id = await mkSubmitted(author);
    expect(await saveContribution(author, id, validInput())).toMatchObject({ ok: false, code: 'locked' }); // submitted
    await claimForReview(mod, id);
    expect(await saveContribution(author, id, validInput())).toMatchObject({ ok: false, code: 'locked' }); // in review
    expect(await saveContribution(mod, id, validInput())).toMatchObject({ ok: false, code: 'not_found' });
    expect(await submitContribution(mod, id, { consents: ALL_CONSENTS })).toMatchObject({ ok: false });
  });
});

describe('versioning: material edit of a published contribution', () => {
  it('creates v2 in submitted for renewed review; v1 stays published and indexed until v2 is approved; then v1 is superseded', async () => {
    const author = await as(USER.nwMember);
    const mod = await as(USER.moderator);
    const { id, sharedId: v1 } = await mkPublished(author, mod);
    const edit = await saveContribution(author, id, validInput({ title: 'Seasonal files: a refined view', observation: 'After a further winter the same pattern held, and the gap between reviewers narrowed only where a written rule existed.' }), { acknowledgeFlags: true });
    expect(edit).toMatchObject({ ok: true, status: 'submitted', version: 2, renewedReview: true });
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c).toMatchObject({ status: 'submitted', version: 2, currentSharedId: v1 });
    // old shared version unchanged and still served + indexed
    const [old] = await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, v1));
    expect(old).toMatchObject({ status: 'published', version: 1, title: GOOD_REP.title });
    expect(await db.select().from(schema.searchIndex).where(eq(schema.searchIndex.sharedId, v1))).toHaveLength(1);
    // the moderator sees it as a new item in the queue
    expect((await moderationQueue(mod)).find((q) => q.id === id)).toMatchObject({ status: 'submitted', version: 2 });
    // renewed review: claim, redact, publish
    expect((await claimForReview(mod, id)).ok).toBe(true);
    const [draft] = await db.select().from(schema.reviewDrafts).where(eq(schema.reviewDrafts.contributionId, id));
    expect(draft.reviewed).toBe(false); // v1's reviewed representation is never reused silently
    expect(await publishShared(mod, id)).toMatchObject({ ok: false, code: 'precondition' });
    await saveSharedDraft(mod, id, { ...GOOD_REP, title: 'Seasonal small business files: refined view' });
    const r = await publishShared(mod, id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.superseded).toEqual([v1]);
    expect((await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, v1)))[0].status).toBe('superseded');
    expect(await db.select().from(schema.searchIndex).where(eq(schema.searchIndex.sharedId, v1))).toHaveLength(0);
    expect(await db.select().from(schema.searchIndex).where(eq(schema.searchIndex.sharedId, r.sharedId))).toHaveLength(1);
    expect(r.version).toBe(2);
  });

  it('flags must be acknowledged for the edit; non-material edits do not trigger review; nothing widens', async () => {
    const author = await as(USER.nwMember);
    const mod = await as(USER.moderator);
    const { id } = await mkPublished(author, mod);
    expect(await saveContribution(author, id, validInput({ observation: 'Call Mr Jones on +1 415 555 0132 about the file, it still happens each winter for seasonal firms.' }))).toMatchObject({ ok: false, code: 'precondition' });
    const [still] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(still).toMatchObject({ status: 'published', version: 1 });
    // links only: in place, same version
    expect(await saveContribution(author, id, validInput({ supportLinks: 'https://example.com/ref' }))).toMatchObject({ ok: true, status: 'published', version: 1, renewedReview: false });
    // widening / changing the audience of a published item is refused
    expect(await saveContribution(author, id, validInput({ sharingChoice: 'organisation' }))).toMatchObject({ ok: false, code: 'locked' });
    const orgOnly = await mkSubmitted(author, { sharingChoice: 'organisation' });
    expect(await saveContribution(author, orgOnly, validInput({ sharingChoice: 'community', title: 'Trying to widen quietly' }))).toMatchObject({ ok: false, code: 'locked' });
    const [o] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, orgOnly));
    expect(o).toMatchObject({ sharingChoice: 'organisation', status: 'published', version: 1 });
    expect(await getForModeration(mod, orgOnly)).toBeNull();
    // organisation-only edit: in place (v2), never reaches moderation
    expect(await saveContribution(author, orgOnly, validInput({ sharingChoice: 'organisation', title: 'Org-only refined view' }))).toMatchObject({ ok: true, status: 'published', version: 2 });
    expect(await getForModeration(mod, orgOnly)).toBeNull();
  });

  it('attribution is not carried into v2 unless the moderator re-approves it with consent', async () => {
    const author = await as(USER.hbMember);
    const mod = await as(USER.moderator);
    const { id } = await mkPublished(author, mod);
    await saveContribution(author, id, validInput({ title: 'A refined seasonal view of the files' }), { acknowledgeFlags: true });
    await claimForReview(mod, id);
    expect(await saveSharedDraft(mod, id, { ...GOOD_REP, includeAttribution: true })).toMatchObject({ ok: false, code: 'precondition' });
  });
});
