import { describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { as, USER, ORG } from './helpers/principals';
import { db, schema } from '@/db';
import { revokeGrant } from '@/lib/admin/people';
import { createSession, attachRecording, setSessionAudience } from '@/lib/employee/live';

// Security review (employee area), finding 1: the "last portal_admin" guard is check-then-act without a lock or
// transaction, so two admins revoking each other at the same moment leave the platform with ZERO portal admins.
describe('last portal_admin protection under concurrency', () => {
  it('two admins revoking each other concurrently must not leave zero portal admins', async () => {
    await db.insert(schema.users).values({ id: 'usr_race_admin2', email: 'race2@azentio.com', name: 'Race Admin' }).onConflictDoNothing();
    await db.insert(schema.employeeAllowlist).values({ email: 'race2@azentio.com', name: 'Race Admin' }).onConflictDoNothing();
    await db.insert(schema.memberships).values({ userId: 'usr_race_admin2', orgId: ORG.azentio, role: 'employee' }).onConflictDoNothing();
    await db.insert(schema.grants).values({ id: 'grt_race_admin2', userId: 'usr_race_admin2', permission: 'portal_admin' }).onConflictDoNothing();
    const a = await as(USER.admin);
    const b = await as('usr_race_admin2');
    await Promise.allSettled([
      revokeGrant(a, { userId: 'usr_race_admin2', permission: 'portal_admin' }),
      revokeGrant(b, { userId: USER.admin, permission: 'portal_admin' }),
    ]);
    const left = await db.select().from(schema.grants).where(and(eq(schema.grants.permission, 'portal_admin'), isNull(schema.grants.revokedAt)));
    expect(left.length).toBeGreaterThan(0); // FAILS today: both revocations succeed
  });
});

// Finding 2: attachRecording re-audiences the shared media row, but the same media can be attached to several
// sessions. Attaching an employees-only recording to a second, public session publishes it to everyone, while the
// first (employees-only) session still shows it. The advertised invariant "a recording is never wider than its session" breaks.
describe('recording audience invariant across sessions', () => {
  it('attaching one recording to a public session must not widen it for an employees-only session that also holds it', async () => {
    const pub = await as(USER.publisher);
    await db.insert(schema.media).values({ id: 'med_rev_internal', title: 'Internal roadmap walkthrough', kind: 'video', mime: 'video/mp4', data: 'x', status: 'published', audienceKind: 'employees' }).onConflictDoNothing();
    const base = { description: 'x', kind: 'live', startsAt: '2030-01-01T10:00', joinInfo: '' };
    const internal = await createSession(pub, { ...base, title: 'Internal roadmap session', audience: 'employees' });
    const external = await createSession(pub, { ...base, title: 'Public webinar', audience: 'public' });
    await attachRecording(pub, internal.id, 'med_rev_internal');
    await attachRecording(pub, external.id, 'med_rev_internal'); // same media row now public
    const [m] = await db.select().from(schema.media).where(eq(schema.media.id, 'med_rev_internal'));
    const [i] = await db.select().from(schema.events).where(eq(schema.events.id, internal.id));
    const widerThanSession = i.recordingMediaId === m.id && i.audienceKind === 'employees' && m.audienceKind === 'public';
    expect(widerThanSession).toBe(false); // FAILS today: employees-only session's recording is publicly readable
    void setSessionAudience;
  });
});
