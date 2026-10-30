import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { CONTRIBUTION_STATUSES, type ContributionStatus } from '@/db/schema/learning';
import { as, USER, ORG } from './helpers/principals';
import { ALLOWED, SPECIAL_EDGES, notifyStateChange, transition } from '@/lib/learning';
import { insertAt, mkDraft } from './learning-helpers';

type Kind = 'author' | 'moderator' | undefined;
const STATUSES = [...CONTRIBUTION_STATUSES];

describe('state machine: every (from, to) pair x every actor', () => {
  it('matches the ALLOWED table exactly, with correct actor authority', async () => {
    const author = await as(USER.nwMember);
    const mod = await as(USER.moderator);
    const otherTenant = await as(USER.hbMember);
    let allowedCount = 0;
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const allowed: Kind = ALLOWED[from][to];
        if (allowed) allowedCount++;
        // author
        const a = await transition(author, await insertAt(from, ORG.northwind, USER.nwMember), to);
        expect(a.ok, `author ${from}->${to}`).toBe(allowed === 'author');
        if (!a.ok) expect(a.code, `author ${from}->${to}`).toBe(allowed ? 'forbidden_actor' : 'illegal_transition');
        // moderator
        const m = await transition(mod, await insertAt(from, ORG.northwind, USER.nwMember), to);
        expect(m.ok, `moderator ${from}->${to}`).toBe(allowed === 'moderator' && from !== 'draft');
        if (!m.ok) expect(m.code, `moderator ${from}->${to}`).toBe(from === 'draft' || from === 'withdrawn' ? 'not_found' : allowed ? 'forbidden_actor' : 'illegal_transition');
        // another tenant's member never even learns the object exists
        const o = await transition(otherTenant, await insertAt(from, ORG.northwind, USER.nwMember), to);
        expect(o.ok).toBe(false);
        if (!o.ok) expect(o.code).toBe('not_found');
      }
    }
    expect(allowedCount).toBe(10);
  });

  it('the spec edges are exactly these', () => {
    const edges = STATUSES.flatMap((f) => STATUSES.filter((t) => ALLOWED[f][t]).map((t) => `${f}>${t}:${ALLOWED[f][t]}`)).sort();
    expect(edges).toEqual([
      'clarification_requested>submitted:author', 'draft>submitted:author', 'in_review>clarification_requested:moderator', 'in_review>published:moderator', 'in_review>rejected:moderator',
      'published>unpublished:moderator', 'published>withdrawn:author', 'submitted>in_review:moderator', 'unpublished>published:moderator', 'unpublished>withdrawn:author',
    ]);
  });

  it('terminal states have no way out; rejected -> draft in particular is refused', async () => {
    const author = await as(USER.nwMember);
    for (const from of ['rejected', 'withdrawn'] as ContributionStatus[])
      for (const to of STATUSES) {
        const r = await transition(author, await insertAt(from, ORG.northwind, USER.nwMember), to);
        expect(r.ok).toBe(false);
      }
    const r = await transition(author, await insertAt('rejected', ORG.northwind, USER.nwMember), 'draft');
    expect(r).toMatchObject({ ok: false, code: 'illegal_transition' });
  });

  it('special edges are refused on a plain transition call', async () => {
    const author = await as(USER.nwMember);
    for (const e of SPECIAL_EDGES) {
      const choice = e.special === 'org_only' ? 'organisation' : 'community';
      const id = await insertAt(e.from, ORG.northwind, USER.nwMember, choice);
      expect(await transition(author, id, e.to)).toMatchObject({ ok: false, code: 'illegal_transition' });
    }
  });

  it('special edges enforce their preconditions', async () => {
    const author = await as(USER.nwMember);
    // org_only edge only for organisation-scope contributions
    expect(await transition(author, await insertAt('draft', ORG.northwind, USER.nwMember, 'community'), 'published', { special: 'org_only' })).toMatchObject({ ok: false, code: 'precondition' });
    expect((await transition(author, await insertAt('draft', ORG.northwind, USER.nwMember, 'organisation'), 'published', { special: 'org_only' })).ok).toBe(true);
    // organisation-only items are not moderation submissions; private items cannot be submitted at all
    expect(await transition(author, await insertAt('draft', ORG.northwind, USER.nwMember, 'organisation'), 'submitted')).toMatchObject({ ok: false, code: 'precondition' });
    expect(await transition(author, await insertAt('draft', ORG.northwind, USER.nwMember, 'private'), 'submitted')).toMatchObject({ ok: false, code: 'precondition' });
    // withdraw_live needs a live shared copy
    expect(await transition(author, await insertAt('submitted', ORG.northwind, USER.nwMember), 'withdrawn', { special: 'withdraw_live' })).toMatchObject({ ok: false, code: 'precondition' });
    // material_edit only for community items
    expect(await transition(author, await insertAt('published', ORG.northwind, USER.nwMember, 'organisation'), 'submitted', { special: 'material_edit' })).toMatchObject({ ok: false, code: 'precondition' });
  });

  it('a successful transition writes an audit event, a moderation event and a notification; refusals write audit denies', async () => {
    const author = await as(USER.nwMember);
    const mod = await as(USER.moderator);
    const id = await insertAt('submitted', ORG.northwind, USER.nwMember);
    const r = await transition(mod, id, 'in_review', { internalNote: 'INTERNAL-ONLY-NOTE' });
    expect(r.ok).toBe(true);
    const ev = await db.select().from(schema.moderationEvents).where(eq(schema.moderationEvents.contributionId, id));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ fromStatus: 'submitted', toStatus: 'in_review', decision: 'claimed', actorRole: 'moderator', internalNote: 'INTERNAL-ONLY-NOTE' });
    const aud = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.resourceId, id), eq(schema.auditEvents.action, 'learning.contribution.claimed')));
    expect(aud).toHaveLength(1);
    const ntf = await db.select().from(schema.notifications).where(eq(schema.notifications.dedupeKey, `learn:${ev[0].id}`));
    expect(ntf[0]).toMatchObject({ userId: USER.nwMember, link: `/learn/c/${id}`, emailStatus: 'none' });
    expect(ntf[0].body ?? '').not.toContain('INTERNAL-ONLY-NOTE');
    // author cannot take the moderator edge; the denial is audited
    const bad = await transition(author, id, 'published');
    expect(bad.ok).toBe(false);
    const deny = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.resourceId, id), eq(schema.auditEvents.outcome, 'deny')));
    expect(deny.length).toBeGreaterThan(0);
  });

  it('notifications are idempotent per moderation event', async () => {
    const mod = await as(USER.moderator);
    const id = await insertAt('submitted', ORG.northwind, USER.nwMember);
    const r = await transition(mod, id, 'in_review');
    if (!r.ok) throw new Error('setup');
    const key = `learn:${r.eventId}`;
    await notifyStateChange({ contribution: r.contribution, decision: r.decision, eventId: r.eventId });
    await notifyStateChange({ contribution: r.contribution, decision: r.decision, eventId: r.eventId });
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.dedupeKey, key));
    expect(rows).toHaveLength(1);
  });

  it('is atomic: two concurrent claims cannot both succeed', async () => {
    const m1 = await as(USER.moderator);
    const id = await insertAt('submitted', ORG.northwind, USER.nwMember);
    const [a, b] = await Promise.all([transition(m1, id, 'in_review'), transition(m1, id, 'in_review')]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const ev = await db.select().from(schema.moderationEvents).where(eq(schema.moderationEvents.contributionId, id));
    expect(ev).toHaveLength(1);
  });

  it('a draft is never changed by merely existing: creation yields status draft', async () => {
    const id = await mkDraft(await as(USER.nwMember));
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c.status).toBe('draft');
    expect(c.submittedAt).toBeNull();
  });
});
