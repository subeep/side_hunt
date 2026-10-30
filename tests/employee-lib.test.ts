import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { as, USER, ORG } from './helpers/principals';
import { db, schema } from '@/db';
import { AuthzError, InputError } from '@/lib/employee/common';
import { getMyRun, getMyRun as getRun, listMyRuns, runPlayground, saveRunFeedback } from '@/lib/employee/playground';
import { createExperiment, createKnowledge, createReleaseNote, getItem, giveFeedback, isStale, listFeedback, listItems, reviewKnowledge, setExperimentStatus } from '@/lib/employee/items';
import { addTeamNote, createTeam, getTeam, joinTeam, listTeams } from '@/lib/employee/teams';
import { attachRecording, createSession, listAttachableVideos, getSession, listSessions, setSessionAudience, updateSession } from '@/lib/employee/live';
import { getDashboard } from '@/lib/employee/dashboard';

const denied = async (action: string, actor: string) => {
  const rows = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.action, action), eq(schema.auditEvents.actorId, actor), eq(schema.auditEvents.outcome, 'deny')));
  return rows.length;
};

describe('employee playground', () => {
  it('persists an employee run with mode employee, no tenant, and audits it', async () => {
    const e = await as(USER.employee);
    const { id, result } = await runPlayground(e, 'policy-what-if', { cutoffScore: 600, maxDti: 50 });
    const [row] = await db.select().from(schema.playgroundRuns).where(eq(schema.playgroundRuns.id, id));
    expect(row).toMatchObject({ mode: 'employee', userId: USER.employee, orgId: null, offeringSlug: 'credit-strategy-simulator' });
    expect(result.label).toMatch(/^SYNTHETIC/);
    const ev = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.action, 'playground.run'), eq(schema.auditEvents.resourceId, id)));
    expect(ev).toHaveLength(1);
  });
  it('clients and anonymous cannot run or read; denials are audited', async () => {
    for (const who of [USER.nwMember, USER.nwAdmin, USER.outsider]) {
      const c = await (who === USER.outsider ? as(who) : as(who));
      await expect(runPlayground(c, 'policy-what-if', {})).rejects.toBeInstanceOf(AuthzError);
      await expect(listMyRuns(c)).rejects.toBeInstanceOf(AuthzError);
    }
    await expect(runPlayground(null, 'policy-what-if', {})).rejects.toBeInstanceOf(AuthzError);
    expect(await denied('playground.run', USER.nwMember)).toBeGreaterThan(0);
  });
  it('run history is isolated between employees (direct id access returns nothing, feedback is refused)', async () => {
    const e = await as(USER.employee);
    const o = await as(USER.owner);
    expect((await listMyRuns(e)).map((r) => r.id)).toContain('run_seed_emp_1');
    expect((await listMyRuns(e)).map((r) => r.id)).not.toContain('run_seed_emp_3');
    expect((await listMyRuns(o)).map((r) => r.id)).toEqual(expect.arrayContaining(['run_seed_emp_3']));
    expect((await listMyRuns(o)).map((r) => r.id)).not.toContain('run_seed_emp_1');
    expect(await getMyRun(o, 'run_seed_emp_1')).toBeNull();
    expect((await getRun(e, 'run_seed_emp_1'))!.result.scenarioSlug).toBe('policy-what-if');
    await expect(saveRunFeedback(o, 'run_seed_emp_1', { rating: 'not_useful' })).rejects.toBeInstanceOf(InputError);
    const [r1] = await db.select().from(schema.playgroundRuns).where(eq(schema.playgroundRuns.id, 'run_seed_emp_1'));
    expect(r1.feedback?.rating).toBe('useful'); // untouched
    expect(await denied('playground.view', USER.owner)).toBeGreaterThan(0);
  });
  it('a client sandbox run id is never readable through the employee playground', async () => {
    const [r] = await db.insert(schema.playgroundRuns).values({ mode: 'client', userId: USER.employee, orgId: ORG.northwind, offeringSlug: 'riva', scenarioSlug: 'report-validation', inputs: {}, output: {} }).returning();
    expect(await getMyRun(await as(USER.employee), r.id)).toBeNull();
  });
  it('structured feedback is validated and saved on the run', async () => {
    const e = await as(USER.employee);
    const { id } = await runPlayground(e, 'segment-compare', {});
    await expect(saveRunFeedback(e, id, { rating: 'amazing' })).rejects.toBeInstanceOf(InputError);
    await expect(saveRunFeedback(e, id, { rating: 'useful', comment: 'x'.repeat(1001) })).rejects.toBeInstanceOf(InputError);
    await saveRunFeedback(e, id, { rating: 'partly_useful', comment: 'Good evidence list' });
    expect((await getMyRun(e, id))!.feedback).toEqual({ rating: 'partly_useful', comment: 'Good evidence list' });
    await expect(runPlayground(e, 'does-not-exist', {})).rejects.toBeInstanceOf(InputError);
  });
});

describe('employee experiments, knowledge, release notes', () => {
  it('every read and write is refused for clients, and audited', async () => {
    const c = await as(USER.nwMember);
    await expect(listItems(c, 'experiment')).rejects.toBeInstanceOf(AuthzError);
    await expect(getItem(c, 'knowledge', 'emp_seed_kb_1')).rejects.toBeInstanceOf(AuthzError);
    await expect(createExperiment(c, { title: 'Sneaky', body: 'Trying to post as a client' })).rejects.toBeInstanceOf(AuthzError);
    await expect(giveFeedback(c, 'experiment', 'emp_seed_exp_1', { rating: 'stop' })).rejects.toBeInstanceOf(AuthzError);
    await expect(listFeedback(c, 'experiment', 'emp_seed_exp_1')).rejects.toBeInstanceOf(AuthzError);
    await expect(listItems(null, 'knowledge')).rejects.toBeInstanceOf(AuthzError);
    expect(await denied('employee.experiment.list', USER.nwMember)).toBe(1);
    expect(await denied('employee.experiment.create', USER.nwMember)).toBe(1);
  });
  it('an employee whose allowlist entry is revoked loses access immediately', async () => {
    await db.update(schema.employeeAllowlist).set({ status: 'revoked' }).where(eq(schema.employeeAllowlist.email, 'moderator@azentio.com'));
    try {
      await expect(listItems(await as(USER.moderator), 'experiment')).rejects.toBeInstanceOf(AuthzError);
    } finally {
      await db.update(schema.employeeAllowlist).set({ status: 'active' }).where(eq(schema.employeeAllowlist.email, 'moderator@azentio.com'));
    }
  });
  it('experiments: create, validate, owner-only status, direct id with wrong kind is not found', async () => {
    const e = await as(USER.employee);
    await expect(createExperiment(e, { title: 'x', body: 'short' })).rejects.toBeInstanceOf(InputError);
    const x = await createExperiment(e, { title: 'Test experiment', body: 'A hypothesis worth testing with synthetic data.', hypothesis: 'It helps' });
    expect(x.status).toBe('proposed');
    await setExperimentStatus(e, x.id, 'running');
    await expect(setExperimentStatus(e, x.id, 'launched')).rejects.toBeInstanceOf(InputError);
    await expect(setExperimentStatus(await as(USER.owner), x.id, 'concluded')).rejects.toBeInstanceOf(AuthzError);
    expect((await getItem(e, 'experiment', x.id))!.status).toBe('running');
    expect(await getItem(e, 'knowledge', x.id)).toBeNull();
    expect(await getItem(e, 'experiment', 'emp_missing')).toBeNull();
  });
  it('feedback loop: one row per user, valid ratings only, tally for the item', async () => {
    const e = await as(USER.employee);
    await expect(giveFeedback(e, 'experiment', 'emp_seed_exp_2', { rating: 'helpful' })).rejects.toBeInstanceOf(InputError); // knowledge rating on an experiment
    await giveFeedback(e, 'experiment', 'emp_seed_exp_2', { rating: 'needs_evidence', comment: 'Which metric?' });
    await giveFeedback(e, 'experiment', 'emp_seed_exp_2', { rating: 'promising' });
    const fb = await listFeedback(e, 'experiment', 'emp_seed_exp_2');
    expect(fb.rows).toHaveLength(1);
    expect(fb.mine?.rating).toBe('promising');
    await expect(giveFeedback(e, 'experiment', 'emp_nope', { rating: 'promising' })).rejects.toBeInstanceOf(InputError);
  });
  it('knowledge: stale flag, owner-only re-review that moves the date out', async () => {
    const e = await as(USER.employee);
    const kb = await listItems(e, 'knowledge');
    expect(kb.find((i) => i.id === 'emp_seed_kb_4')!.reviewDate && isStale(kb.find((i) => i.id === 'emp_seed_kb_4')!)).toBe(true);
    expect(isStale(kb.find((i) => i.id === 'emp_seed_kb_1')!)).toBe(false);
    await expect(reviewKnowledge(e, 'emp_seed_kb_4', {})).rejects.toBeInstanceOf(AuthzError); // owned by publisher
    const pub = await as(USER.publisher);
    await reviewKnowledge(pub, 'emp_seed_kb_4', { body: 'Updated checklist after the audit viewer and support authorisation changes.' });
    expect(isStale((await getItem(pub, 'knowledge', 'emp_seed_kb_4'))!)).toBe(false);
    const created = await createKnowledge(e, { title: 'New article', body: 'Some internal guidance worth keeping.' });
    expect(created.ownerId).toBe(USER.employee);
    expect(created.reviewDate!.getTime()).toBeGreaterThan(Date.now());
  });
  it('release notes need the content_publisher grant: ordinary employees and admins are refused', async () => {
    const input = { title: 'Release 0.5', body: 'Notes for the next internal release.', version: '0.5.0' };
    await expect(createReleaseNote(await as(USER.employee), input)).rejects.toBeInstanceOf(AuthzError);
    await expect(createReleaseNote(await as(USER.admin), input)).rejects.toBeInstanceOf(AuthzError);
    await expect(createReleaseNote(await as(USER.nwAdmin), input)).rejects.toBeInstanceOf(AuthzError);
    const r = await createReleaseNote(await as(USER.publisher), input);
    expect(r.kind).toBe('release_note');
    expect(await denied('employee.release_note.create', USER.employee)).toBe(1);
  });
});

describe('team spaces', () => {
  it('notes are visible and writable by members only; join makes a member', async () => {
    const o = await as(USER.owner); // member of seeded team 1
    const e = await as(USER.employee); // owner of team 1
    const pub = await as(USER.publisher); // not a member of team 1
    expect((await getTeam(pub, 'emp_seed_team_1'))!.notes).toEqual([]);
    expect((await getTeam(pub, 'emp_seed_team_1'))!.isMember).toBe(false);
    await expect(addTeamNote(pub, 'emp_seed_team_1', { body: 'Let me in' })).rejects.toBeInstanceOf(AuthzError);
    expect((await getTeam(e, 'emp_seed_team_1'))!.notes.length).toBeGreaterThan(0);
    await addTeamNote(o, 'emp_seed_team_1', { body: 'Owner adds a note' });
    await joinTeam(pub, 'emp_seed_team_1');
    const t = await getTeam(pub, 'emp_seed_team_1');
    expect(t!.isMember).toBe(true);
    expect(t!.notes.map((n) => n.body)).toContain('Owner adds a note');
    expect(await getTeam(pub, 'emp_seed_exp_1')).toBeNull(); // wrong kind
  });
  it('clients cannot list, create, join or read teams', async () => {
    const c = await as(USER.hbMember);
    await expect(listTeams(c)).rejects.toBeInstanceOf(AuthzError);
    await expect(createTeam(c, { title: 'Team X', body: 'A team that should never exist.' })).rejects.toBeInstanceOf(AuthzError);
    await expect(joinTeam(c, 'emp_seed_team_1')).rejects.toBeInstanceOf(AuthzError);
    await expect(getTeam(c, 'emp_seed_team_1')).rejects.toBeInstanceOf(AuthzError);
    await expect(addTeamNote(c, 'emp_seed_team_1', { body: 'hello' })).rejects.toBeInstanceOf(AuthzError);
  });
  it('creating a team makes the creator the first member', async () => {
    const e = await as(USER.employee);
    const t = await createTeam(e, { title: 'Team Driftwood', body: 'Prototype of a tiny scenario explainer.', focus: 'RIVA' });
    expect((await getTeam(e, t.id))!.members).toEqual(['Eden Employee']);
    expect((await listTeams(e)).find((x) => x.id === t.id)!.isMember).toBe(true);
  });
});

describe('internal live sessions and publisher separation', () => {
  const session = { title: 'Employee town hall', kind: 'live', startsAt: new Date(Date.now() + 5 * 86400_000).toISOString(), audience: 'employees' };
  beforeAll(async () => {
    await db.insert(schema.media).values([
      { id: 'med_test_video_a', title: 'Test recording A', kind: 'video', mime: 'video/mp4', data: 'x', status: 'draft', audienceKind: 'public' },
      { id: 'med_test_video_org', title: 'Northwind private video', kind: 'video', mime: 'video/mp4', data: 'x', status: 'published', audienceKind: 'org', audienceOrgId: ORG.northwind },
      { id: 'med_test_video_noaud', title: 'No audience video', kind: 'video', mime: 'video/mp4', data: 'x', status: 'published' },
      { id: 'med_test_doc', title: 'A document', kind: 'document', mime: 'text/plain', data: 'x', status: 'published', audienceKind: 'employees' },
    ]).onConflictDoNothing();
    await db.insert(schema.events).values([
      { id: 'evt_test_org', title: 'Northwind private briefing', kind: 'briefing', startsAt: new Date(Date.now() + 86400_000), audienceKind: 'org', audienceOrgId: ORG.northwind },
      { id: 'evt_test_noaud', title: 'No audience metadata', kind: 'live', startsAt: new Date(Date.now() + 86400_000) },
      { id: 'evt_test_public', title: 'Public webinar', kind: 'webinar', startsAt: new Date(Date.now() + 86400_000), audienceKind: 'public' },
    ]).onConflictDoNothing();
  });

  it('employees see internal sessions; org, public and metadata-less events never appear for them', async () => {
    const e = await as(USER.employee);
    const { upcoming, past } = await listSessions(e);
    const ids = [...upcoming, ...past].map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['evt_seed_emp_live', 'evt_seed_emp_past']));
    expect(ids).not.toContain('evt_test_org');
    expect(ids).not.toContain('evt_test_noaud');
    expect(ids).not.toContain('evt_test_public');
    expect(past.find((x) => x.id === 'evt_seed_emp_past')!.recordingMediaId).toBe('med_seed_emp_recording');
  });
  it('direct object access: other-audience or metadata-less events are 404 for employees; clients are refused', async () => {
    const e = await as(USER.employee);
    expect(await getSession(e, 'evt_test_org')).toBeNull();
    expect(await getSession(e, 'evt_test_noaud')).toBeNull();
    expect(await getSession(e, 'evt_test_public')).toBeNull();
    expect((await getSession(e, 'evt_seed_emp_live'))!.id).toBe('evt_seed_emp_live');
    await expect(getSession(await as(USER.nwMember), 'evt_seed_emp_live')).rejects.toBeInstanceOf(AuthzError);
    await expect(listSessions(await as(USER.nwAdmin))).rejects.toBeInstanceOf(AuthzError);
  });
  it('ordinary employees, admins, moderators and clients cannot configure sessions: rejected and audited', async () => {
    for (const who of [USER.employee, USER.admin, USER.moderator, USER.owner, USER.nwAdmin]) {
      const p = await as(who);
      await expect(createSession(p, session)).rejects.toBeInstanceOf(AuthzError);
      await expect(updateSession(p, 'evt_seed_emp_live', { ...session, status: 'cancelled' })).rejects.toBeInstanceOf(AuthzError);
      await expect(setSessionAudience(p, 'evt_seed_emp_live', { audience: 'public' })).rejects.toBeInstanceOf(AuthzError);
      await expect(attachRecording(p, 'evt_seed_emp_live', 'med_test_video_a')).rejects.toBeInstanceOf(AuthzError);
    }
    expect(await denied('broadcast.create', USER.employee)).toBe(1);
    expect(await denied('broadcast.audience', USER.admin)).toBe(1);
    const [e] = await db.select().from(schema.events).where(eq(schema.events.id, 'evt_seed_emp_live'));
    expect(e.status).toBe('scheduled');
    expect(e.audienceKind).toBe('employees');
  });
  it('the video_publisher grant creates sessions, with validation', async () => {
    const pub = await as(USER.publisher);
    await expect(createSession(pub, { ...session, title: 'x' })).rejects.toBeInstanceOf(InputError);
    await expect(createSession(pub, { ...session, audience: 'community' })).rejects.toBeInstanceOf(InputError);
    await expect(createSession(pub, { ...session, audience: 'product', product: 'nope' })).rejects.toBeInstanceOf(InputError);
    await expect(createSession(pub, { ...session, endsAt: new Date(Date.now()).toISOString() })).rejects.toBeInstanceOf(InputError);
    const row = await createSession(pub, session);
    expect(row).toMatchObject({ audienceKind: 'employees', hostId: USER.publisher });
    const ev = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.action, 'broadcast.create'), eq(schema.auditEvents.resourceId, row.id)));
    expect(ev).toHaveLength(1);
    const prodSession = await createSession(pub, { ...session, title: 'Entitled webinar', audience: 'product', product: 'riva' });
    expect(prodSession).toMatchObject({ audienceKind: 'product', audienceProduct: 'riva' });
  });
  it('attaching a recording aligns media audience to the session; changing audience re-aligns the recording', async () => {
    const pub = await as(USER.publisher);
    await expect(attachRecording(pub, 'evt_seed_emp_live', 'med_test_doc')).rejects.toBeInstanceOf(InputError); // not a video
    await expect(attachRecording(pub, 'evt_seed_emp_live', 'med_missing')).rejects.toBeInstanceOf(InputError);
    await attachRecording(pub, 'evt_seed_emp_live', 'med_test_video_a');
    let [m] = await db.select().from(schema.media).where(eq(schema.media.id, 'med_test_video_a'));
    expect(m).toMatchObject({ audienceKind: 'employees', status: 'published' }); // was public draft: narrowed, never left wider than the session
    await setSessionAudience(pub, 'evt_seed_emp_live', { audience: 'product', product: 'riva' });
    [m] = await db.select().from(schema.media).where(eq(schema.media.id, 'med_test_video_a'));
    expect(m).toMatchObject({ audienceKind: 'product', audienceProduct: 'riva' });
    await setSessionAudience(pub, 'evt_seed_emp_live', { audience: 'employees' });
    [m] = await db.select().from(schema.media).where(eq(schema.media.id, 'med_test_video_a'));
    expect(m.audienceKind).toBe('employees');
  });
  it('tenant-private and metadata-less videos are neither listed nor attachable (no re-audiencing of client media)', async () => {
    const pub = await as(USER.publisher);
    const ids = (await listAttachableVideos(pub)).map((v) => v.id);
    expect(ids).not.toContain('med_test_video_org');
    expect(ids).not.toContain('med_test_video_noaud');
    await expect(attachRecording(pub, 'evt_seed_emp_live', 'med_test_video_org')).rejects.toBeInstanceOf(InputError);
    await expect(attachRecording(pub, 'evt_seed_emp_live', 'med_test_video_noaud')).rejects.toBeInstanceOf(InputError);
    const [m] = await db.select().from(schema.media).where(eq(schema.media.id, 'med_test_video_org'));
    expect(m).toMatchObject({ audienceKind: 'org', audienceOrgId: ORG.northwind });
  });
  it('publisher cannot touch client-private (org audience) or metadata-less events', async () => {
    const pub = await as(USER.publisher);
    await expect(updateSession(pub, 'evt_test_org', { ...session, status: 'cancelled' })).rejects.toBeInstanceOf(InputError);
    await expect(setSessionAudience(pub, 'evt_test_noaud', { audience: 'public' })).rejects.toBeInstanceOf(InputError);
    const [e] = await db.select().from(schema.events).where(eq(schema.events.id, 'evt_test_org'));
    expect(e.audienceKind).toBe('org');
  });
});

describe('dashboard', () => {
  it('shows the employee their own experiments and internal sessions; refuses clients', async () => {
    const e = await as(USER.employee);
    const d = await getDashboard(e);
    expect(d.experiments.every((x) => x.id.startsWith('emp_'))).toBe(true);
    expect(d.upcoming.map((u) => u.id)).toContain('evt_seed_emp_hack');
    await expect(getDashboard(await as(USER.hbAdmin))).rejects.toBeInstanceOf(AuthzError);
    const o = await getDashboard(await as(USER.owner));
    expect(o.experiments.map((x) => x.title)).not.toContain('Seasonality-aware comparison explanation');
  });
});

describe('employee seed', () => {
  it('is idempotent and creates no support authorisation', async () => {
    const { seedEmployee } = await import('@/db/seed/employee');
    const before = (await db.select().from(schema.employeeItems)).length;
    await seedEmployee(db);
    expect((await db.select().from(schema.employeeItems)).length).toBe(before);
    expect((await db.select().from(schema.supportAuthorisations)).length).toBe(0);
    const [e] = await db.select().from(schema.events).where(eq(schema.events.id, 'evt_seed_emp_past'));
    expect(e).toMatchObject({ audienceKind: 'employees', recordingMediaId: 'med_seed_emp_recording' });
    const kb = await listItems(await as(USER.employee), 'knowledge');
    expect(kb.map((k) => k.id)).toContain('emp_seed_kb_4'); // staleness itself is covered above (the item is re-reviewed there)
  });
});
