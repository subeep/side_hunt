import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { as, USER, ORG } from './helpers/principals';
import { makeOrg, denies } from './client-fixtures';

// Deterministic stand-in for the employee-owned scenario engine (same contract as src/lib/scenarios/types.ts).
vi.mock('@/lib/scenarios', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/scenarios')>();
  const def = (slug: string, offeringSlug: string) => ({
    slug, offeringSlug, title: `Scenario ${slug}`, description: 'd', syntheticDataNote: 'Synthetic only.',
    fields: [{ key: 'score', label: 'Score', type: 'number', default: 640, min: 500, max: 780 }, { key: 'seg', label: 'Segment', type: 'select', default: 'all', options: [{ value: 'all', label: 'All' }, { value: 'new', label: 'New' }] }],
  });
  const defs = [def('policy-what-if', 'credit-strategy-simulator'), def('sme-application', 'sme-credit-decisioning'), def('segment-compare', 'similar-portfolio-intelligence'), def('report-validation', 'riva')];
  return {
    listScenarios: (o?: string) => defs.filter((d) => !o || d.offeringSlug === o),
    getScenario: (s: string) => defs.find((d) => d.slug === s) ?? null,
    runScenario: (slug: string, raw: Record<string, unknown>) => {
      if (!('score' in raw)) return real.runScenario(slug, raw); // other seeds (employee) use the real engine with its own fields
      const score = Number(raw.score);
      if (!Number.isFinite(score) || score < 500 || score > 780) throw new Error('score out of range');
      if (raw.seg !== 'all' && raw.seg !== 'new') throw new Error('bad segment');
      return { label: 'SYNTHETIC — simulated output. Not a credit or business decision.', scenarioSlug: slug, inputs: { score, seg: raw.seg as string }, sampleData: [{ title: 'Sample', rows: [{ a: 1 }] }], evidence: [{ title: 'E', detail: 'd' }], summary: `Simulated at ${score}`, metrics: [{ label: 'm', value: '1' }], mode: 'deterministic' };
    },
  };
});

const S = await import('@/lib/client/sandbox');
const ok = <T extends { ok: boolean }>(r: T) => r as Extract<T, { ok: true }>;

describe('sandbox: entitlement', () => {
  it('runs a synthetic scenario for an entitled offering, tenant and owner from the session', async () => {
    const nw = await as(USER.nwMember);
    const res = await S.executeRun(nw, { offeringSlug: 'credit-strategy-simulator', scenarioSlug: 'policy-what-if', inputs: { score: '660', seg: 'new' }, evidenceNote: 'Pasted synthetic note' });
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(schema.playgroundRuns).where(eq(schema.playgroundRuns.id, ok(res).runId));
    expect(row.mode).toBe('client');
    expect(row.orgId).toBe(ORG.northwind);
    expect(row.userId).toBe(USER.nwMember);
    expect(row.inputs).toMatchObject({ score: 660, seg: 'new', _evidenceNote: 'Pasted synthetic note' });
    expect((row.output as { label: string }).label).toMatch(/^SYNTHETIC/);
    const run = await S.getRun(nw, row.id);
    expect(run?.evidenceNote).toBe('Pasted synthetic note');
    expect(run?.inputs).toEqual({ score: 660, seg: 'new' }); // note is not mixed into displayed inputs
    const audited = (await db.select().from(schema.auditEvents)).filter((a) => a.action === 'sandbox.run' && a.resourceId === row.id);
    expect(audited).toHaveLength(1);
    expect(audited[0].orgId).toBe(ORG.northwind);
  });
  it('a non-entitled offering cannot be run or opened, and the attempt is audited', async () => {
    const nw = await as(USER.nwMember); // Northwind has no RIVA
    expect(await S.getEntitledOffering(nw, 'riva')).toBeNull();
    const res = await S.executeRun(nw, { offeringSlug: 'riva', scenarioSlug: 'report-validation', inputs: {} });
    expect(res.ok).toBe(false);
    expect((await denies('sandbox.use', USER.nwMember)).length).toBeGreaterThanOrEqual(2);
    expect(await S.getEntitledOffering(nw, 'credit-strategy-simulator')).toMatchObject({ slug: 'credit-strategy-simulator' });
    expect(await S.getEntitledOffering(nw, 'not-a-product')).toBeNull();
    expect((await S.saveScenario(nw, { offeringSlug: 'riva', scenarioSlug: 'report-validation', name: 'x1', inputs: {} })).ok).toBe(false);
  });
  it('no active workspace means no sandbox at all', async () => {
    const multi = await as(USER.multi);
    expect((await S.executeRun(multi, { offeringSlug: 'sme-credit-decisioning', scenarioSlug: 'sme-application', inputs: {} })).ok).toBe(false);
    expect(await S.getEntitledOffering(multi, 'sme-credit-decisioning')).toBeNull();
    expect(await S.listRuns(multi)).toEqual([]);
  });
  it('the scenario must belong to the offering and inputs are validated', async () => {
    const hb = await as(USER.hbMember);
    expect((await S.executeRun(hb, { offeringSlug: 'riva', scenarioSlug: 'policy-what-if', inputs: {} })).ok).toBe(false); // other offering's scenario
    expect((await S.executeRun(hb, { offeringSlug: 'riva', scenarioSlug: 'nope', inputs: {} })).ok).toBe(false);
    const bad = await S.executeRun(hb, { offeringSlug: 'riva', scenarioSlug: 'report-validation', inputs: { score: '99999' } });
    expect(bad.ok).toBe(false);
    expect((await S.executeRun(hb, { offeringSlug: 'riva', scenarioSlug: 'report-validation', inputs: {}, evidenceNote: 'x'.repeat(1501) })).ok).toBe(false);
    expect((await S.executeRun(hb, { offeringSlug: '', scenarioSlug: 'report-validation' })).ok).toBe(false);
  });
  it('only declared fields reach the engine; missing ones take the default', () => {
    const def = (S.scenariosFor('riva'))[0];
    expect(S.pickInputs(def, { score: '700', evil: 'x', orgId: ORG.northwind })).toEqual({ score: 700, seg: 'all' });
    expect(S.pickInputs(def, {})).toEqual({ score: 640, seg: 'all' });
  });
});

describe('sandbox: feedback', () => {
  it('only the person who ran it can rate, with structured, validated feedback', async () => {
    const nw = await as(USER.nwMember);
    expect((await S.submitRunFeedback(nw, 'run_cl_nw_2', { rating: 'partly_helpful', topic: 'realism', comment: 'ok' })).ok).toBe(true);
    expect((await S.getRun(nw, 'run_cl_nw_2'))?.feedback).toEqual({ rating: 'partly_helpful', topic: 'realism', comment: 'ok' });
    expect((await S.submitRunFeedback(nw, 'run_cl_nw_2', { rating: 'amazing', topic: 'realism' })).ok).toBe(false);
    expect((await S.submitRunFeedback(nw, 'run_cl_nw_2', { rating: 'helpful', topic: 'bogus' })).ok).toBe(false);
    expect((await S.submitRunFeedback(nw, 'run_cl_nw_2', { rating: 'helpful', topic: 'clarity', comment: 'x'.repeat(501) })).ok).toBe(false);
    expect((await S.submitRunFeedback(await as(USER.nwAdmin), 'run_cl_nw_2', { rating: 'not_helpful', topic: 'other' })).ok).toBe(false); // admin can read, not speak for the author
    expect((await S.submitRunFeedback(await as(USER.hbAdmin), 'run_cl_nw_2', { rating: 'not_helpful', topic: 'other' })).ok).toBe(false); // other tenant
    expect((await S.getRun(nw, 'run_cl_nw_2'))?.feedback?.rating).toBe('partly_helpful');
    expect((await denies('sandbox.feedback', USER.hbAdmin)).length).toBe(1);
  });
});

describe('sandbox: saved scenarios', () => {
  it('are private to tenant AND owner; names and limits validated', async () => {
    const mem = await as(USER.nwMember);
    const adm = await as(USER.nwAdmin);
    const saved = await S.saveScenario(mem, { offeringSlug: 'sme-credit-decisioning', scenarioSlug: 'sme-application', name: ' My baseline ', inputs: { score: 700, seg: 'new' } });
    expect(saved.ok).toBe(true);
    const id = ok(saved).id;
    const mine = await S.listSavedScenarios(mem, 'sme-credit-decisioning');
    expect(mine.find((s) => s.id === id)).toMatchObject({ name: 'My baseline', inputs: { score: 700, seg: 'new' } });
    expect((await S.listSavedScenarios(adm)).some((s) => s.id === id)).toBe(false); // not even the admin
    expect((await S.listSavedScenarios(await as(USER.hbMember))).some((s) => s.id === id)).toBe(false);
    expect(await S.deleteSavedScenario(await as(USER.hbMember), id)).toBe(false);
    expect(await S.deleteSavedScenario(adm, id)).toBe(false);
    expect((await S.saveScenario(mem, { offeringSlug: 'sme-credit-decisioning', scenarioSlug: 'sme-application', name: 'a', inputs: {} })).ok).toBe(false);
    expect((await S.saveScenario(mem, { offeringSlug: 'sme-credit-decisioning', scenarioSlug: 'sme-application', name: 'n'.repeat(81), inputs: {} })).ok).toBe(false);
    expect((await S.saveScenario(mem, { offeringSlug: 'sme-credit-decisioning', scenarioSlug: 'sme-application', name: 'Bad inputs', inputs: { score: 1 } })).ok).toBe(false);
    expect(await S.deleteSavedScenario(mem, id)).toBe(true);
  });
  it('can be created from a run the caller may view, but not from someone else\'s', async () => {
    const adm = await as(USER.nwAdmin);
    expect((await S.saveScenarioFromRun(adm, 'run_cl_nw_1', 'Copied by admin')).ok).toBe(true); // admin may read org runs
    expect((await S.saveScenarioFromRun(await as(USER.hbAdmin), 'run_cl_nw_1', 'Stolen')).ok).toBe(false);
    expect((await S.saveScenarioFromRun(await as(USER.nwMember), 'run_cl_nw_3', 'Colleague')).ok).toBe(false);
  });
  it('enforces the per-user cap inside one tenant', async () => {
    const o = await makeOrg({ entitlements: ['riva'], members: 1 });
    const p = await o.as(o.members[0].userId);
    for (let i = 0; i < 25; i++) expect((await S.saveScenario(p, { offeringSlug: 'riva', scenarioSlug: 'report-validation', name: `s${i}x`, inputs: {} })).ok).toBe(true);
    expect((await S.saveScenario(p, { offeringSlug: 'riva', scenarioSlug: 'report-validation', name: 'one too many', inputs: {} })).ok).toBe(false);
  });
});

describe('sandbox: run history scoping with new runs', () => {
  it('a fresh organisation sees only its own new runs; an org admin sees all members', async () => {
    const o = await makeOrg({ entitlements: ['riva'], admins: 1, members: 2 });
    const [m1, m2] = o.members;
    const [a] = o.admins;
    const r1 = ok(await S.executeRun(await o.as(m1.userId), { offeringSlug: 'riva', scenarioSlug: 'report-validation', inputs: {} }));
    const r2 = ok(await S.executeRun(await o.as(m2.userId), { offeringSlug: 'riva', scenarioSlug: 'report-validation', inputs: {} }));
    expect((await S.listRuns(await o.as(m1.userId))).map((r) => r.id)).toEqual([r1.runId]);
    expect((await S.listRuns(await o.as(m2.userId))).map((r) => r.id)).toEqual([r2.runId]);
    expect((await S.listRuns(await o.as(a.userId))).map((r) => r.id).sort()).toEqual([r1.runId, r2.runId].sort());
    expect(await S.getRun(await o.as(m1.userId), r2.runId)).toBeNull();
    expect((await S.getRun(await o.as(a.userId), r2.runId))?.userName).toContain('client_member');
    // none of it leaks into Harbor, which is also entitled to RIVA
    expect((await S.listRuns(await as(USER.hbAdmin))).map((r) => r.id)).not.toContain(r1.runId);
    expect(await S.getRun(await as(USER.hbAdmin), r1.runId)).toBeNull();
  });
});
