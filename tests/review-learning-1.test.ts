import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { as, USER } from './helpers/principals';
import {
  claimForReview, getContributionForViewer, getForModeration, listOrg, rejectContribution, saveContribution, submitContribution, withdrawContribution,
} from '@/lib/learning';
import { mkDraft, mkPublished, mkSubmitted, validInput, ALL_CONSENTS } from './learning-helpers';

// Security review (learning area), finding 1: after a material edit the contribution is 'submitted'; if the moderator
// REJECTS that v2 the contribution becomes 'rejected' while the v1 shared copy is still published and indexed.
// The withdraw edge for that state does not exist, so the author can never withdraw their live shared copy.
describe('withdrawal right is never blocked', () => {
  it('author can withdraw a still-live v1 shared copy after a v2 revision was rejected', async () => {
    const author = await as(USER.nwMember);
    const mod = await as(USER.moderator);
    const { id, sharedId } = await mkPublished(author, mod);
    const e = await saveContribution(author, id, validInput({ title: 'Seasonal files get different treatment, revised' }));
    expect(e.ok && e.renewedReview).toBe(true);
    expect((await claimForReview(mod, id)).ok).toBe(true);
    const rj = await rejectContribution(mod, id, { category: 'not_suitable', reasonPublic: 'Revision not suitable for sharing.' });
    expect(rj.ok).toBe(true);
    const [live] = await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, sharedId));
    expect(live.status).toBe('published'); // v1 is still being served
    const w = await withdrawContribution(author, id);
    expect(w.ok).toBe(true); // FAILS today: illegal_transition rejected -> withdrawn
  });
});

// Finding 2: an author who submitted a community proposal cannot take it back before a moderator publishes it:
// there is no withdraw edge and no way to revoke publish_shared. A moderator can still publish against the author's change of mind.
describe('author can retract a pending submission', () => {
  it('withdrawing a submitted (not yet published) proposal succeeds', async () => {
    const author = await as(USER.hbMember);
    const id = await mkSubmitted(author);
    const w = await withdrawContribution(author, id);
    expect(w.ok).toBe(true); // FAILS today: "There is nothing published to withdraw."
  });
});

// Finding 3: withdrawing an organisation-only contribution is advertised as "no longer visible to your organisation",
// but orgVisible()/listOrg() only exclude drafts, so colleagues keep reading the withdrawn private text.
describe('withdrawn items leave the organisation view', () => {
  it('a withdrawn org-only observation is 404 / not listed for a colleague', async () => {
    const author = await as(USER.nwMember);
    const colleague = await as(USER.nwAdmin);
    const id = await mkDraft(author, { sharingChoice: 'organisation' });
    expect((await submitContribution(author, id, { consents: ALL_CONSENTS, acknowledgeFlags: true })).ok).toBe(true);
    expect(await getContributionForViewer(colleague, id)).not.toBeNull();
    const w = await withdrawContribution(author, id);
    expect(w.ok).toBe(true);
    expect(await getContributionForViewer(colleague, id)).toBeNull(); // FAILS today: still readable
    expect((await listOrg(colleague)).some((r) => r.c.id === id)).toBe(false); // FAILS today: still listed
  });
});

// Finding 4: after the author withdraws, moderators can still open the author's private source (and the review draft).
describe('withdrawal ends moderator access to the private source', () => {
  it('moderator gets 404 for a withdrawn contribution', async () => {
    const author = await as(USER.atMember);
    const mod = await as(USER.moderator);
    const { id } = await mkPublished(author, mod);
    expect((await withdrawContribution(author, id)).ok).toBe(true);
    expect(await getForModeration(mod, id)).toBeNull(); // FAILS today: private source still readable
  });
});

// Finding 5: the contributor-facing history (authorTimeline, rendered on /learn/c/[id]) includes the moderator's internal
// report-decision events, so a DISMISSED report (which the contributor is never meant to hear about) shows up as "report_dismissed".
import { createReport, decideReport, authorTimeline } from '@/lib/learning';
describe('contributor history does not expose report handling', () => {
  it('a dismissed report leaves no trace in the author timeline', async () => {
    const author = await as(USER.nwMember);
    const mod = await as(USER.moderator);
    const { id, sharedId } = await mkPublished(author, mod);
    const rep = await createReport(await as(USER.hbMember), { sharedId, reason: 'misleading', details: 'looks off' });
    expect(rep.ok).toBe(true);
    if (!rep.ok) return;
    expect((await decideReport(mod, rep.id, { decision: 'dismissed', note: 'no issue found' })).ok).toBe(true);
    const tl = await authorTimeline(id);
    expect(tl.map((t) => t.decision).filter((d) => d.startsWith('report'))).toEqual([]); // FAILS today: ['report_dismissed']
  });
});

// Finding 6: moderator-facing server actions pass free text to lib functions that do not validate length
// (unpublishAction/reinstateAction/clarifyAction only use min length or no check at all), so an unbounded string is stored
// in moderation_events and fanned out in the contributor's notification body.
import { unpublishShared } from '@/lib/learning';
describe('moderator free text is length-limited', () => {
  it('unpublishShared rejects an absurdly long public reason / internal note', async () => {
    const author = await as(USER.atMember);
    const mod = await as(USER.moderator);
    const { sharedId } = await mkPublished(author, mod);
    const r = await unpublishShared(mod, sharedId, { reasonPublic: 'x'.repeat(500_000), internalNote: 'y'.repeat(500_000) });
    expect(r.ok).toBe(false); // FAILS today: stored verbatim
  });
});
