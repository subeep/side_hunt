import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { as, USER, ORG } from './helpers/principals';
import { ensureNonCommunityOrg, makeShared, markWithdrawnOnly, NON_COMMUNITY } from './helpers/shared';
import { db, schema } from '@/db';
import { ALLOWED_TRANSITIONS, changeStatus, createIdea, getIdeaForPrincipal, IdeaError, listIdeasForPrincipal, listOwnedIdeas, postUpdate, updateIdea } from '@/lib/insights/ideas';
import { plainLanguageProblem } from '@/lib/insights/plain';
import { prioritiseIdeas } from '@/lib/insights/priority';

const base = { title: 'Add seasonality-aware comparison explanation', problem: 'Seasonal SME cash flow is treated inconsistently across applications and reviewers.', proposedOutcome: 'Reviewers see a clear explanation when seasonal patterns affect a comparison.' };
let e1: string, e2: string, e3: string, eWithdrawn: string, eUnpub: string, eNwAuthor: string, eNcAuthor: string;

beforeAll(async () => {
  await ensureNonCommunityOrg('pending');
  e1 = await makeShared({ org: 'org_id1', title: 'Idea evidence one', summary: 'one', offering: 'id-a', quality: 'strong' });
  e2 = await makeShared({ org: 'org_id2', title: 'Idea evidence two', summary: 'two', offering: 'id-a', quality: 'strong' });
  e3 = await makeShared({ org: 'org_id3', title: 'Idea evidence three', summary: 'three', offering: 'id-a', quality: 'strong' });
  eWithdrawn = await makeShared({ org: 'org_id4', status: 'withdrawn' });
  eUnpub = await makeShared({ org: 'org_id5', status: 'unpublished' });
  eNwAuthor = await makeShared({ org: ORG.northwind, authorId: USER.nwMember, title: 'Northwind-authored evidence', summary: 'nw' });
  eNcAuthor = await makeShared({ org: NON_COMMUNITY.org, authorId: NON_COMMUNITY.user, title: 'Unapproved-org evidence', summary: 'nc' });
});

describe('authorisation', () => {
  it('only the product_owner grant may create/update/change status/post; denials are audited', async () => {
    for (const p of [null, await as(USER.employee), await as(USER.admin), await as(USER.moderator), await as(USER.nwAdmin)]) {
      await expect(createIdea(p, base)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(updateIdea(p, 'ida_x', { title: 'Changed title here' })).rejects.toMatchObject({ code: 'forbidden' });
      await expect(changeStatus(p, 'ida_x', { status: 'planned' })).rejects.toMatchObject({ code: 'forbidden' });
      await expect(postUpdate(p, 'ida_x', 'A plain language update.')).rejects.toMatchObject({ code: 'forbidden' });
    }
    const denies = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.action, 'idea.create'), eq(schema.auditEvents.outcome, 'deny')));
    expect(denies.length).toBeGreaterThanOrEqual(4);
    expect(denies.some((d) => d.actorId === USER.employee)).toBe(true);
  });
  it('owner must be an active employee', async () => {
    const o = await as(USER.owner);
    await expect(createIdea(o, { ...base, ownerUserId: USER.nwMember })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createIdea(o, { ...base, offeringSlug: 'nope-product' })).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('evidence linking', () => {
  it('only currently published items visible to the owner can be linked; unknown, withdrawn, unpublished and non-shared ids are refused identically', async () => {
    const o = await as(USER.owner);
    const [emp] = await db.insert(schema.employeeItems).values({ kind: 'internal_note', title: 'secret', body: 'secret' }).returning();
    const msg = /currently published and visible/;
    for (const bad of [eWithdrawn, eUnpub, 'shr_does_not_exist', emp.id, `con_t_${e1}`])
      await expect(createIdea(o, { ...base, evidenceIds: [e1, bad] })).rejects.toThrow(msg);
    const ok = await createIdea(o, { ...base, evidenceIds: [e1, e2, e3, e3] });
    const rows = await db.select().from(schema.ideaEvidence).where(eq(schema.ideaEvidence.ideaId, ok.id));
    expect(rows).toHaveLength(3);
    // updating: a newly added withdrawn item is refused, existing links are kept when not resubmitted wrongly
    await expect(updateIdea(o, ok.id, { evidenceIds: [e1, eWithdrawn] })).rejects.toThrow(msg);
    await updateIdea(o, ok.id, { evidenceIds: [e1, e2] });
    expect(await db.select().from(schema.ideaEvidence).where(eq(schema.ideaEvidence.ideaId, ok.id))).toHaveLength(2);
  });
  it('a withdrawn item stops counting as evidence for clients immediately', async () => {
    const o = await as(USER.owner);
    const w = await makeShared({ org: 'org_idw', title: 'Soon withdrawn' });
    const { id } = await createIdea(o, { ...base, title: 'Idea resting on one item', evidenceIds: [w] });
    const nw = await as(USER.nwMember);
    expect((await listIdeasForPrincipal(nw)).map((i) => i.id)).toContain(id);
    expect((await getIdeaForPrincipal(nw, id))!.evidence.map((e) => e.id)).toEqual([w]);
    await markWithdrawnOnly(w);
    expect((await listIdeasForPrincipal(nw)).map((i) => i.id)).not.toContain(id);
    expect(await getIdeaForPrincipal(nw, id)).toBeNull();
    // the owner still sees the idea, but no longer sees the withdrawn evidence
    expect((await getIdeaForPrincipal(o, id))!.evidence).toEqual([]);
  });
});

describe('status changes', () => {
  it('writes history + audit for every change, enforces allowed transitions, released is terminal', async () => {
    const o = await as(USER.owner);
    const { id } = await createIdea(o, { ...base, title: 'Status trail idea', evidenceIds: [e1] });
    await expect(changeStatus(o, id, { status: 'released' })).rejects.toMatchObject({ code: 'invalid' }); // proposed -> released not allowed
    await expect(changeStatus(o, id, { status: 'proposed' })).rejects.toMatchObject({ code: 'invalid' }); // no-op
    await expect(changeStatus(o, id, { status: 'bogus' })).rejects.toMatchObject({ code: 'invalid' });
    await changeStatus(o, id, { status: 'under_review', note: 'internal: reviewed in weekly triage' });
    await changeStatus(o, id, { status: 'planned' });
    await changeStatus(o, id, { status: 'in_progress' });
    await changeStatus(o, id, { status: 'released' });
    await expect(changeStatus(o, id, { status: 'planned' })).rejects.toMatchObject({ code: 'invalid' });
    const hist = await db.select().from(schema.ideaStatusHistory).where(eq(schema.ideaStatusHistory.ideaId, id)).orderBy(schema.ideaStatusHistory.at);
    expect(hist.map((h) => h.toStatus)).toEqual(['proposed', 'under_review', 'planned', 'in_progress', 'released']);
    expect(hist[1]).toMatchObject({ fromStatus: 'proposed', actorId: USER.owner });
    const aud = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.resourceId, id), eq(schema.auditEvents.action, 'idea.status_change')));
    expect(aud).toHaveLength(4);
    expect(ALLOWED_TRANSITIONS.released).toEqual([]);
    // every change posted an audience-appropriate update that says it is not a delivery promise
    const ups = await db.select().from(schema.ideaUpdates).where(eq(schema.ideaUpdates.ideaId, id));
    expect(ups.length).toBe(4);
    expect(ups.every((u) => /not a delivery promise/.test(u.message))).toBe(true);
  });
  it('never shows internal history notes or priority to clients, but does to the product owner', async () => {
    const o = await as(USER.owner);
    const { id } = await createIdea(o, { ...base, title: 'Note visibility check idea', priority: 'high', evidenceIds: [e1] });
    await changeStatus(o, id, { status: 'under_review', note: 'INTERNAL-NOTE-XYZ prioritisation debate' });
    const client = await getIdeaForPrincipal(await as(USER.hbMember), id);
    expect(client).toBeTruthy();
    expect(client!.internal).toBeUndefined();
    expect(JSON.stringify(client)).not.toMatch(/INTERNAL-NOTE-XYZ|"priority"|usr_owner/);
    expect(client!.timeline.map((t) => t.status)).toEqual(['proposed', 'under_review']);
    const owner = await getIdeaForPrincipal(o, id);
    expect(owner!.internal!.priority).toBe('high');
    expect(JSON.stringify(owner!.internal!.history)).toContain('INTERNAL-NOTE-XYZ');
  });
  it('notifies the contributors of linked evidence with an audience-appropriate message, deduped, never other clients', async () => {
    const o = await as(USER.owner);
    const { id } = await createIdea(o, { ...base, title: 'Notify contributors idea', evidenceIds: [e1, eNwAuthor, eNcAuthor] });
    const r = await changeStatus(o, id, { status: 'under_review', message: 'Under review. Not a promised delivery.' });
    expect(r.notified).toBe(1); // Northwind author only: the unapproved org's author is not notified
    const n = await db.select().from(schema.notifications).where(eq(schema.notifications.kind, 'idea_status'));
    const mine = n.filter((x) => x.link === `/learn/ideas/${id}`);
    expect(mine).toHaveLength(1);
    expect(mine[0].userId).toBe(USER.nwMember);
    expect(JSON.stringify(mine[0])).not.toMatch(/Harbor|Atlas|Unapproved|org_id1|Northwind-authored|PRIVATE/i);
    expect(mine[0].body).toMatch(/not a delivery promise/i);
    expect(mine[0].emailStatus).toBe('none');
  });
});

describe('audience-appropriate updates', () => {
  it('rejects leaks: emails, ticket ids, internal ids, client names, roadmap commitments and dates', async () => {
    const bad = [
      'Contact jane.doe@northwind.example for details on this.',
      'This relates to ticket TKT-48213 from a customer.',
      'Tracked as INC-9912 internally for now.',
      'See support case #123456 for the history.',
      'Evidence is in con_seed_nw_season for reference.',
      'We are committed to shipping this improvement.',
      'The ETA for this change is next week.',
      'Planned for Q3 after the review completes.',
      'This will ship once the review is complete.',
      'Expected by March with the next release.',
      'Northwind asked for this specifically last month.',
      'Harbor Microfinance reported the same thing again.',
      'Discussed in the internal roadmap review meeting.',
    ];
    for (const m of bad) expect(await plainLanguageProblem(m), m).toBeTruthy();
    const o = await as(USER.owner);
    const { id } = await createIdea(o, { ...base, title: 'Update leak idea', evidenceIds: [e1] });
    for (const m of bad) await expect(postUpdate(o, id, m)).rejects.toBeInstanceOf(IdeaError);
    await expect(changeStatus(o, id, { status: 'under_review', message: bad[0] })).rejects.toMatchObject({ code: 'invalid' });
    await expect(createIdea(o, { ...base, title: 'Delivery committed for Q2 release' })).rejects.toMatchObject({ code: 'invalid' });
    expect((await db.select().from(schema.ideaUpdates).where(eq(schema.ideaUpdates.ideaId, id)))).toHaveLength(0);
    const st = await db.select().from(schema.ideas).where(eq(schema.ideas.id, id));
    expect(st[0].status).toBe('proposed'); // a rejected message did not change status
  });
  it('accepts plain, honest updates', async () => {
    for (const m of ['Under review. Not a promised delivery.', 'We are reviewing how seasonal cash flow is explained. This is a status update, not a delivery promise.'])
      expect(await plainLanguageProblem(m)).toBeNull();
    const o = await as(USER.owner);
    const { id } = await createIdea(o, { ...base, title: 'Plain update idea', evidenceIds: [e1] });
    await postUpdate(o, id, 'We are reviewing how seasonal cash flow is explained.');
    expect((await getIdeaForPrincipal(o, id))!.latestUpdate).toMatch(/reviewing/);
  });
});

describe('who sees which ideas (CLAUDE.md contract)', () => {
  it('community members see ideas linked to feed evidence; non-community and anonymous see none; entitled offering is the other path', async () => {
    const o = await as(USER.owner);
    const viaEvidence = await createIdea(o, { ...base, title: 'Visible via evidence only', evidenceIds: [e2] });
    const viaOffering = await createIdea(o, { ...base, title: 'Visible via riva entitlement', offeringSlug: 'riva' });
    const hb = (await listIdeasForPrincipal(await as(USER.hbMember))).map((i) => i.id);
    const nw = (await listIdeasForPrincipal(await as(USER.nwMember))).map((i) => i.id);
    expect(hb).toContain(viaEvidence.id);
    expect(hb).toContain(viaOffering.id); // Harbor is entitled to riva
    expect(nw).toContain(viaEvidence.id);
    expect(nw).not.toContain(viaOffering.id); // Northwind is not entitled to riva and the idea has no evidence
    expect(await getIdeaForPrincipal(await as(USER.nwMember), viaOffering.id)).toBeNull(); // direct id access -> 404
    const denied = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.resourceId, viaOffering.id), eq(schema.auditEvents.action, 'idea.read')));
    expect(denied.some((d) => d.outcome === 'deny' && d.actorId === USER.nwMember)).toBe(true);
    expect(await listIdeasForPrincipal(null)).toEqual([]);
    expect(await listIdeasForPrincipal(await as(USER.employee))).toEqual([]);
    expect(await listIdeasForPrincipal(await as(NON_COMMUNITY.user))).toEqual([]);
    expect(await getIdeaForPrincipal(await as(USER.employee), viaEvidence.id)).toBeNull();
  });
  it('list items have exactly the contract shape and no private fields', async () => {
    const [i] = await listIdeasForPrincipal(await as(USER.nwMember), { limit: 1 });
    expect(Object.keys(i).sort()).toEqual(['id', 'latestUpdate', 'offeringSlug', 'status', 'team', 'title', 'updatedAt']);
  });
  it('employees see ideas they own via listOwnedIdeas and the detail page, and no one else\'s', async () => {
    const o = await as(USER.owner);
    const { id } = await createIdea(o, { ...base, title: 'Owned by the employee persona', ownerUserId: USER.employee });
    expect((await listOwnedIdeas(USER.employee)).map((i) => i.id)).toContain(id);
    expect((await listOwnedIdeas(USER.nwMember)).map((i) => i.id)).toEqual([]);
    expect(await getIdeaForPrincipal(await as(USER.employee), id)).toBeTruthy();
    const other = await createIdea(o, { ...base, title: 'Owned by somebody else entirely' });
    expect(await getIdeaForPrincipal(await as(USER.employee), other.id)).toBeNull();
  });
});

describe('assisted prioritisation', () => {
  it('ranks by distinct organisations x evidence quality, not by number of posts', async () => {
    const o = await as(USER.owner);
    const many = [] as string[];
    for (let n = 0; n < 6; n++) many.push(await makeShared({ org: 'org_pr_single', quality: 'strong', offering: 'pr' }));
    const broad = [await makeShared({ org: 'org_pr_a', quality: 'strong', offering: 'pr' }), await makeShared({ org: 'org_pr_b', quality: 'strong', offering: 'pr' }), await makeShared({ org: 'org_pr_c', quality: 'strong', offering: 'pr' })];
    const noisy = await createIdea(o, { ...base, title: 'Noisy single-organisation idea', evidenceIds: many });
    const wide = await createIdea(o, { ...base, title: 'Broad three-organisation idea', evidenceIds: broad });
    const rows = await prioritiseIdeas(o);
    const rNoisy = rows.find((r) => r.ideaId === noisy.id)!;
    const rWide = rows.find((r) => r.ideaId === wide.id)!;
    expect(rWide.score).toBeGreaterThan(rNoisy.score);
    expect(rows.indexOf(rWide)).toBeLessThan(rows.indexOf(rNoisy));
    expect(rWide.explanation).toMatch(/distinct organisations/);
    expect(rNoisy.explanation).toMatch(/Repeated posts from one organisation count once/);
    await expect(prioritiseIdeas(await as(USER.nwMember))).rejects.toThrow('forbidden');
    await expect(prioritiseIdeas(await as(USER.employee))).rejects.toThrow('forbidden');
  });
});
