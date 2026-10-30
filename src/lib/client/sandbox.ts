import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import type { Principal } from '@/lib/auth/principal';
import { authorize } from '@/lib/authz';
import { audit } from '@/lib/audit';
import { rateLimit } from '@/lib/ratelimit';
import { listScenarios, runScenario, type ScenarioDef, type ScenarioResult } from '@/lib/scenarios';

export const SIMULATED_LABEL = 'SYNTHETIC — simulated output. Not a credit or business decision.';
export const EVIDENCE_NOTE_KEY = '_evidenceNote';
export const FEEDBACK_RATINGS = { helpful: 'Helpful', partly_helpful: 'Partly helpful', not_helpful: 'Not helpful' } as const;
export const FEEDBACK_TOPICS = { realism: 'Realism of the synthetic data', clarity: 'Clarity of the evidence', missing_data: 'Missing inputs or data', other: 'Something else' } as const;

export type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Invalid input.';
const isAdmin = (p: Principal) => p.activeOrgRole === 'client_admin';

/** Entitled + active offering, else null. Non-entitled access is denied by policy and audited. */
export async function getEntitledOffering(p: Principal, slug: string) {
  const d = authorize(p, 'sandbox.use', { productSlug: slug });
  if (!d.allow) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'sandbox.use', outcome: 'deny', resourceType: 'product', resourceId: slug.slice(0, 80), meta: { reason: d.reason } });
    return null;
  }
  const [prod] = await db.select().from(schema.products).where(and(eq(schema.products.slug, slug), eq(schema.products.status, 'active')));
  return prod ?? null;
}

export const scenariosFor = (offeringSlug: string): ScenarioDef[] => listScenarios(offeringSlug).filter((s) => s.offeringSlug === offeringSlug);

/** Only keys the scenario declares are accepted (no smuggled fields); missing ones take the scenario default. The engine validates + clamps. */
export function pickInputs(def: ScenarioDef, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = raw[f.key];
    if (v === undefined || v === null || v === '') out[f.key] = f.default;
    else if (f.type === 'number' && typeof v === 'string') out[f.key] = v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
    else out[f.key] = typeof v === 'string' ? v.slice(0, 200) : v;
  }
  return out;
}

function simulate(def: ScenarioDef, raw: Record<string, unknown>): { ok: true; result: ScenarioResult } | Fail {
  try {
    return { ok: true, result: runScenario(def.slug, pickInputs(def, raw)) };
  } catch (err) {
    return fail(`Those inputs could not be run${err instanceof Error && err.message ? `: ${err.message.slice(0, 160)}` : '.'}`);
  }
}

const runSchema = z.object({
  offeringSlug: z.string().min(1).max(80),
  scenarioSlug: z.string().min(1).max(80),
  evidenceNote: z.string().trim().max(1500, 'The evidence note must be 1500 characters or fewer.').optional(),
});

/** Run a scenario with synthetic inputs and persist it as a client run: tenant from the session, owner = me. */
export async function executeRun(p: Principal, raw: { offeringSlug: unknown; scenarioSlug: unknown; inputs?: Record<string, unknown>; evidenceNote?: unknown }): Promise<{ ok: true; runId: string } | Fail> {
  const parsed = runSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!p.activeOrgId) return fail('Choose a workspace first.');
  if (!(await getEntitledOffering(p, parsed.data.offeringSlug))) return fail('This offering is not available in your workspace.');
  const def = scenariosFor(parsed.data.offeringSlug).find((s) => s.slug === parsed.data.scenarioSlug);
  if (!def) return fail('Unknown scenario for this offering.');
  if (!(await rateLimit(`sandbox:${p.userId}`, 60, 3600))) return fail('You have run many scenarios recently. Try again later.');
  const sim = simulate(def, raw.inputs ?? {});
  if (!sim.ok) return sim;
  const note = parsed.data.evidenceNote || undefined;
  const [row] = await db
    .insert(schema.playgroundRuns)
    .values({
      mode: 'client',
      userId: p.userId,
      orgId: p.activeOrgId,
      offeringSlug: def.offeringSlug,
      scenarioSlug: def.slug,
      inputs: { ...sim.result.inputs, ...(note ? { [EVIDENCE_NOTE_KEY]: note } : {}) },
      output: sim.result as unknown as Record<string, unknown>,
    })
    .returning({ id: schema.playgroundRuns.id });
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'sandbox.run', resourceType: 'run', resourceId: row.id, orgId: p.activeOrgId, meta: { offering: def.offeringSlug, scenario: def.slug, hasNote: !!note } });
  return { ok: true, runId: row.id };
}

export interface RunView {
  id: string;
  offeringSlug: string;
  scenarioSlug: string;
  createdAt: Date;
  userId: string;
  userName: string | null;
  inputs: Record<string, unknown>;
  evidenceNote: string | null;
  output: Partial<ScenarioResult>;
  feedback: { rating?: string; topic?: string; comment?: string } | null;
}

const r = schema.playgroundRuns;
const runCols = { id: r.id, offeringSlug: r.offeringSlug, scenarioSlug: r.scenarioSlug, createdAt: r.createdAt, userId: r.userId, userName: schema.users.name, inputs: r.inputs, output: r.output, feedback: r.feedback, orgId: r.orgId, mode: r.mode };

function view(row: { inputs: Record<string, unknown> } & Omit<RunView, 'inputs' | 'evidenceNote' | 'output'> & { output: unknown }): RunView {
  const { [EVIDENCE_NOTE_KEY]: note, ...inputs } = row.inputs;
  return { id: row.id, offeringSlug: row.offeringSlug, scenarioSlug: row.scenarioSlug, createdAt: row.createdAt, userId: row.userId, userName: row.userName, inputs, evidenceNote: typeof note === 'string' ? note : null, output: (row.output ?? {}) as Partial<ScenarioResult>, feedback: row.feedback };
}

/** Members see only their OWN runs; a client administrator sees every run of the ACTIVE organisation. */
export async function listRuns(p: Principal, opts: { offeringSlug?: string; limit?: number } = {}): Promise<RunView[]> {
  if (!p.activeOrgId) return [];
  const scope = isAdmin(p) ? eq(r.orgId, p.activeOrgId) : and(eq(r.orgId, p.activeOrgId), eq(r.userId, p.userId));
  const rows = await db
    .select(runCols)
    .from(r)
    .leftJoin(schema.users, eq(schema.users.id, r.userId))
    .where(and(eq(r.mode, 'client'), scope, opts.offeringSlug ? eq(r.offeringSlug, opts.offeringSlug) : undefined))
    .orderBy(desc(r.createdAt))
    .limit(opts.limit ?? 50);
  return rows.map(view);
}

/** Direct run id access: verifies ORG and USER permission. Anything else is a 404 (and an audit deny when the run exists). */
export async function getRun(p: Principal, id: string): Promise<RunView | null> {
  if (!p.activeOrgId) return null;
  const [row] = await db.select(runCols).from(r).leftJoin(schema.users, eq(schema.users.id, r.userId)).where(eq(r.id, id));
  if (!row) return null;
  const permitted = row.mode === 'client' && row.orgId === p.activeOrgId && (row.userId === p.userId || isAdmin(p));
  if (!permitted) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'sandbox.run.view', outcome: 'deny', resourceType: 'run', resourceId: id });
    return null;
  }
  return view(row);
}

const feedbackSchema = z.object({
  rating: z.enum(Object.keys(FEEDBACK_RATINGS) as [keyof typeof FEEDBACK_RATINGS]),
  topic: z.enum(Object.keys(FEEDBACK_TOPICS) as [keyof typeof FEEDBACK_TOPICS]),
  comment: z.string().trim().max(500, 'Keep the comment to 500 characters.').optional(),
});

/** Only the person who ran it can rate a run (an administrator can read colleagues' runs but not speak for them). */
export async function submitRunFeedback(p: Principal, runId: string, raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!p.activeOrgId) return fail('Choose a workspace first.');
  const res = await db
    .update(r)
    .set({ feedback: { rating: parsed.data.rating, topic: parsed.data.topic, comment: parsed.data.comment || undefined } })
    .where(and(eq(r.id, runId), eq(r.mode, 'client'), eq(r.orgId, p.activeOrgId), eq(r.userId, p.userId)))
    .returning({ id: r.id });
  if (!res.length) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'sandbox.feedback', outcome: 'deny', resourceType: 'run', resourceId: runId.slice(0, 80) });
    return fail('Run not found.');
  }
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'sandbox.feedback', resourceType: 'run', resourceId: runId, orgId: p.activeOrgId, meta: { rating: parsed.data.rating, topic: parsed.data.topic } });
  return { ok: true };
}

const s = schema.savedScenarios;
const saveSchema = z.object({ offeringSlug: z.string().min(1).max(80), scenarioSlug: z.string().min(1).max(80), name: z.string().trim().min(2, 'Give the scenario a name (2+ characters).').max(80, 'Names are limited to 80 characters.') });
const MAX_SAVED = 25;

/** Saved scenarios = a name + validated synthetic inputs, private to (tenant, owner). */
export async function saveScenario(p: Principal, raw: { offeringSlug: unknown; scenarioSlug: unknown; name: unknown; inputs: Record<string, unknown> }): Promise<{ ok: true; id: string } | Fail> {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!p.activeOrgId) return fail('Choose a workspace first.');
  if (!(await getEntitledOffering(p, parsed.data.offeringSlug))) return fail('This offering is not available in your workspace.');
  const def = scenariosFor(parsed.data.offeringSlug).find((x) => x.slug === parsed.data.scenarioSlug);
  if (!def) return fail('Unknown scenario for this offering.');
  const existing = await db.select({ id: s.id }).from(s).where(and(eq(s.orgId, p.activeOrgId), eq(s.userId, p.userId)));
  if (existing.length >= MAX_SAVED) return fail(`You can keep up to ${MAX_SAVED} saved scenarios. Delete one first.`);
  const sim = simulate(def, raw.inputs); // validates + normalises the inputs exactly as a run would
  if (!sim.ok) return sim;
  const [row] = await db.insert(s).values({ orgId: p.activeOrgId, userId: p.userId, offeringSlug: def.offeringSlug, scenarioSlug: def.slug, name: parsed.data.name, inputs: sim.result.inputs }).returning({ id: s.id });
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'sandbox.scenario.save', resourceType: 'saved_scenario', resourceId: row.id, orgId: p.activeOrgId });
  return { ok: true, id: row.id };
}

export async function listSavedScenarios(p: Principal, offeringSlug?: string) {
  if (!p.activeOrgId) return [];
  return db
    .select({ id: s.id, name: s.name, offeringSlug: s.offeringSlug, scenarioSlug: s.scenarioSlug, inputs: s.inputs, createdAt: s.createdAt })
    .from(s)
    .where(and(eq(s.orgId, p.activeOrgId), eq(s.userId, p.userId), offeringSlug ? eq(s.offeringSlug, offeringSlug) : undefined))
    .orderBy(desc(s.createdAt));
}

export async function deleteSavedScenario(p: Principal, id: string): Promise<boolean> {
  if (!p.activeOrgId) return false;
  const res = await db.delete(s).where(and(eq(s.id, id), eq(s.orgId, p.activeOrgId), eq(s.userId, p.userId))).returning({ id: s.id });
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'sandbox.scenario.delete', outcome: res.length ? 'ok' : 'deny', resourceType: 'saved_scenario', resourceId: id.slice(0, 80), orgId: p.activeOrgId });
  return res.length > 0;
}

/** Save the inputs of a run I may view (my own, or any org run for an administrator) as MY saved scenario. */
export async function saveScenarioFromRun(p: Principal, runId: string, name: unknown) {
  const run = await getRun(p, runId);
  if (!run) return fail('Run not found.');
  return saveScenario(p, { offeringSlug: run.offeringSlug, scenarioSlug: run.scenarioSlug, name, inputs: run.inputs });
}
