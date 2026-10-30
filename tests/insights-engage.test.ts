import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { as, USER } from './helpers/principals';
import { ensureNonCommunityOrg, makeShared, markWithdrawnOnly, NON_COMMUNITY } from './helpers/shared';
import { db, schema } from '@/db';
import { addComment, buildDigest, castVote, deleteSavedSearch, EngageError, feedHref, latestDigestEmail, listBookmarks, listComments, listSavedSearches, moderateComment, queueDigestEmail, reportComment, saveSearch, setDigest, toggleBookmark, voteSummary } from '@/lib/insights/engage';

let item: string;
beforeAll(async () => {
  await ensureNonCommunityOrg('pending');
  item = await makeShared({ org: 'org_en1', title: 'Engagement target', summary: 'Comments live here', offering: 'en', topic: 'engage-topic' });
});

describe('comments inherit the parent audience', () => {
  it('community members can comment and read; others get nothing and cannot post', async () => {
    const hb = await as(USER.hbMember);
    const id = await addComment(hb, item, 'Same issue seen on our side too.');
    expect(id).toMatch(/^cmt_/);
    const seen = await listComments(await as(USER.nwMember), item);
    expect(seen).toHaveLength(1);
    expect(seen![0]).toMatchObject({ authorName: 'Community participant', label: 'Community participant', mine: false });
    expect(JSON.stringify(seen)).not.toMatch(/org_harbor|authorId|usr_hb|authorOrgId/i);
    for (const p of [null, await as(USER.employee), await as(USER.multi), await as(NON_COMMUNITY.user)]) {
      expect(await listComments(p, item)).toBeNull();
      await expect(addComment(p, item, 'sneaky comment')).rejects.toBeInstanceOf(EngageError);
    }
  });
  it('comments vanish when the parent is withdrawn and cannot be added to a withdrawn parent', async () => {
    const w = await makeShared({ org: 'org_en2', title: 'Soon withdrawn parent', summary: 'x' });
    const p = await as(USER.nwMember);
    await addComment(p, w, 'A comment on a live item.');
    await markWithdrawnOnly(w);
    expect(await listComments(p, w)).toBeNull();
    await expect(addComment(p, w, 'late comment')).rejects.toMatchObject({ code: 'not_found' });
  });
  it('validates input: length, emails, unknown parents', async () => {
    const p = await as(USER.nwMember);
    await expect(addComment(p, item, 'x')).rejects.toMatchObject({ code: 'invalid' });
    await expect(addComment(p, item, 'y'.repeat(1001))).rejects.toMatchObject({ code: 'invalid' });
    await expect(addComment(p, item, 'write to me at jo@example.com please')).rejects.toMatchObject({ code: 'invalid' });
    await expect(addComment(p, 'shr_nope', 'valid comment text')).rejects.toMatchObject({ code: 'not_found' });
  });
  it('reporting and hiding: any visible reader can report; only moderators hide; authors can remove their own', async () => {
    const author = await as(USER.atMember);
    const cid = await addComment(author, item, 'A borderline comment to moderate.');
    await reportComment(await as(USER.nwMember), cid, 'inappropriate', 'not helpful');
    const rep = await db.select().from(schema.reports).where(eq(schema.reports.sharedId, item));
    expect(rep.some((r) => r.details?.startsWith(`Comment ${cid}`) && r.reporterId === USER.nwMember)).toBe(true);
    await expect(reportComment(await as(USER.employee), cid, 'inappropriate')).rejects.toBeInstanceOf(EngageError);
    await expect(reportComment(await as(USER.nwMember), cid, 'bogus')).rejects.toMatchObject({ code: 'invalid' });
    // a normal participant cannot hide someone else's comment
    await expect(moderateComment(await as(USER.nwMember), cid, 'hidden')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(moderateComment(await as(USER.nwMember), cid, 'removed')).rejects.toMatchObject({ code: 'forbidden' });
    await moderateComment(await as(USER.moderator), cid, 'hidden');
    const asMember = await listComments(await as(USER.nwMember), item);
    expect(asMember!.map((c) => c.id)).not.toContain(cid);
    const asMod = await listComments(await as(USER.moderator), item);
    expect(asMod!.find((c) => c.id === cid)!.hidden).toBe(true);
    const mine = await addComment(author, item, 'My own comment to delete.');
    await moderateComment(author, mine, 'removed');
    expect((await listComments(author, item))!.map((c) => c.id)).not.toContain(mine);
    const aud = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.action, 'comment.moderate'), eq(schema.auditEvents.outcome, 'deny')));
    expect(aud.length).toBeGreaterThan(0);
  });
});

describe('feedback votes', () => {
  it('one vote per user, changeable, clearable; tallies only for owners/moderators and only above the threshold', async () => {
    const nw = await as(USER.nwMember);
    await castVote(nw, item, 'useful');
    await castVote(nw, item, 'needs_evidence');
    const rows = await db.select().from(schema.feedbackVotes).where(and(eq(schema.feedbackVotes.sharedId, item), eq(schema.feedbackVotes.userId, USER.nwMember)));
    expect(rows).toHaveLength(1);
    expect(rows[0].vote).toBe('needs_evidence');
    await expect(castVote(nw, item, 'love_it')).rejects.toMatchObject({ code: 'invalid' });
    await expect(castVote(await as(USER.employee), item, 'useful')).rejects.toBeInstanceOf(EngageError);
    expect(await voteSummary(nw, item)).toBeNull();
    expect(await voteSummary(await as(USER.owner), item)).toMatchObject({ suppressed: true });
    await castVote(await as(USER.hbMember), item, 'useful');
    await castVote(await as(USER.atMember), item, 'useful');
    expect(await voteSummary(await as(USER.owner), item)).toEqual({ suppressed: false, useful: 2, needsEvidence: 1 });
    await castVote(nw, item, null);
    expect(await db.select().from(schema.feedbackVotes).where(and(eq(schema.feedbackVotes.sharedId, item), eq(schema.feedbackVotes.userId, USER.nwMember)))).toHaveLength(0);
  });
});

describe('bookmarks and saved searches', () => {
  it('cannot bookmark what you cannot see; bookmarks of withdrawn items degrade to a neutral placeholder', async () => {
    const p = await as(USER.nwMember);
    expect(await toggleBookmark(p, 'shared', item)).toBe(true);
    expect((await listBookmarks(p)).find((b) => b.targetId === item)!.title).toBe('Engagement target');
    expect(await toggleBookmark(p, 'shared', item)).toBe(false);
    await expect(toggleBookmark(p, 'shared', 'shr_nope')).rejects.toMatchObject({ code: 'not_found' });
    await expect(toggleBookmark(p, 'event', item)).rejects.toMatchObject({ code: 'invalid' });
    await expect(toggleBookmark(await as(USER.employee), 'shared', item)).rejects.toBeInstanceOf(EngageError);
    const w = await makeShared({ org: 'org_en3', title: 'Bookmarked then withdrawn', summary: 'x' });
    await toggleBookmark(p, 'shared', w);
    await markWithdrawnOnly(w);
    const b = (await listBookmarks(p)).find((x) => x.targetId === w)!;
    expect(b.title).toBeNull();
    expect(b.href).toBeNull();
    // another user's bookmarks are never listed
    expect((await listBookmarks(await as(USER.hbMember))).find((x) => x.targetId === w)).toBeUndefined();
  });
  it('saved searches: validated, capped, own only, whitelisted filters', async () => {
    const p = await as(USER.hbAdmin);
    const id = await saveSearch(p, { name: 'Seasonal', q: 'seasonal cash flow', filters: { offering: 'en', evil: 'x', region: 'EU' } });
    const [row] = (await listSavedSearches(p)).filter((r) => r.id === id);
    expect(row.filters).toEqual({ offering: 'en', region: 'EU' });
    expect(feedHref(row.query, row.filters)).toBe('/learn?q=seasonal+cash+flow&offering=en&region=EU');
    await expect(saveSearch(p, { name: '' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(saveSearch(await as(USER.employee), { name: 'Nope' })).rejects.toBeInstanceOf(EngageError);
    await deleteSavedSearch(await as(USER.atAdmin), id); // someone else's: no effect
    expect((await listSavedSearches(p)).map((r) => r.id)).toContain(id);
    await deleteSavedSearch(p, id);
    expect((await listSavedSearches(p)).map((r) => r.id)).not.toContain(id);
    for (let n = 0; n < 19; n++) await saveSearch(p, { name: `S${n + 1}` });
    await saveSearch(p, { name: 'S20' }).catch(() => undefined);
    await expect(saveSearch(p, { name: 'one too many' })).rejects.toMatchObject({ code: 'invalid' });
    expect(await listSavedSearches(await as(USER.employee))).toEqual([]);
  });
});

describe('digest', () => {
  it('subscription is validated; the preview obeys visibility and is honest that email is only queued', async () => {
    const p = await as(USER.atAdmin);
    await expect(setDigest(p, { frequency: 'hourly' })).rejects.toMatchObject({ code: 'invalid' });
    await setDigest(p, { frequency: 'weekly', topics: ['engage-topic', 'engage-topic', ' '] });
    const d = await buildDigest(p);
    expect(d!.topics).toEqual(['engage-topic']);
    expect(d!.newItems.map((i) => i.id)).toEqual([item]);
    expect(d!.stat.suppressed).toBe(true); // a single organisation
    expect(await buildDigest(await as(USER.employee))).toBeNull();
    await expect(setDigest(await as(USER.employee), { frequency: 'weekly' })).rejects.toBeInstanceOf(EngageError);
    delete process.env.RESEND_API_KEY;
    const status = await queueDigestEmail(p);
    expect(status).toBe('queued'); // stored only; never "delivered"
    const sub = await db.select().from(schema.digestSubscriptions).where(eq(schema.digestSubscriptions.userId, USER.atAdmin));
    expect(sub[0].lastSentAt).toBeNull();
    expect((await latestDigestEmail(p))!.status).toBe('queued');
  });
});
