import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { explainScenario, getScenario, listScenarios, runScenario, type ScenarioResult } from '../scenarios';
import { assertAction, InputError, optText, parse } from './common';

export const FEEDBACK_RATINGS = ['useful', 'partly_useful', 'not_useful'] as const;
const mine = (p: Principal, id: string) => and(eq(schema.playgroundRuns.id, id), eq(schema.playgroundRuns.userId, p.userId), eq(schema.playgroundRuns.mode, 'employee'));

/** Run a synthetic scenario (pure + deterministic) and persist the run for THIS employee only (mode 'employee', no tenant). */
export async function runPlayground(p: Principal | null, scenarioSlug: string, rawInputs: Record<string, unknown>) {
  await assertAction(p, 'playground.use', 'playground.run');
  const def = getScenario(scenarioSlug);
  if (!def) throw new InputError('Unknown scenario.');
  const result = runScenario(def.slug, rawInputs);
  const [row] = await db.insert(schema.playgroundRuns).values({ mode: 'employee', userId: p!.userId, orgId: null, offeringSlug: def.offeringSlug, scenarioSlug: def.slug, inputs: result.inputs, output: { ...result } }).returning();
  await audit({ actorId: p!.userId, action: 'playground.run', resourceType: 'playground_run', resourceId: row.id, meta: { scenario: def.slug } });
  return { id: row.id, result };
}

export async function saveRunFeedback(p: Principal | null, runId: string, raw: unknown) {
  await assertAction(p, 'playground.use', 'playground.feedback');
  const i = parse(z.object({ rating: z.enum(FEEDBACK_RATINGS, { message: 'Choose a rating' }), comment: optText(1000, 'Comment') }), raw);
  const res = await db.update(schema.playgroundRuns).set({ feedback: { rating: i.rating, comment: i.comment } }).where(mine(p!, runId)).returning({ id: schema.playgroundRuns.id });
  if (!res.length) {
    // Somebody else's run (or nothing at all): indistinguishable to the caller, but audited.
    await audit({ actorId: p!.userId, action: 'playground.feedback', outcome: 'deny', resourceType: 'playground_run', resourceId: runId, meta: { reason: 'not found or not own run' } });
    throw new InputError('Run not found.');
  }
  await audit({ actorId: p!.userId, action: 'playground.feedback', resourceType: 'playground_run', resourceId: runId, meta: { rating: i.rating } });
}

/** Own run only. A run id belonging to another employee (or a client sandbox run) returns null, exactly like a missing id. */
export async function getMyRun(p: Principal | null, runId: string) {
  await assertAction(p, 'playground.use', 'playground.view');
  const [row] = await db.select().from(schema.playgroundRuns).where(mine(p!, runId));
  if (!row) {
    await audit({ actorId: p!.userId, action: 'playground.view', outcome: 'deny', resourceType: 'playground_run', resourceId: runId, meta: { reason: 'not found or not own run' } });
    return null;
  }
  const result = row.output as unknown as ScenarioResult;
  return { id: row.id, scenarioSlug: row.scenarioSlug, offeringSlug: row.offeringSlug, createdAt: row.createdAt, result, feedback: row.feedback, explanation: explainScenario(result) };
}

export async function listMyRuns(p: Principal | null, limit = 20) {
  await assertAction(p, 'playground.use', 'playground.list');
  return db
    .select({ id: schema.playgroundRuns.id, scenarioSlug: schema.playgroundRuns.scenarioSlug, offeringSlug: schema.playgroundRuns.offeringSlug, createdAt: schema.playgroundRuns.createdAt, feedback: schema.playgroundRuns.feedback })
    .from(schema.playgroundRuns)
    .where(and(eq(schema.playgroundRuns.userId, p!.userId), eq(schema.playgroundRuns.mode, 'employee')))
    .orderBy(desc(schema.playgroundRuns.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));
}

/** Step 1: offerings that have a scenario, with their product names. */
export async function listPlaygroundOfferings(p: Principal | null) {
  await assertAction(p, 'playground.use', 'playground.offerings');
  const prods = await db.select({ slug: schema.products.slug, name: schema.products.name, tagline: schema.products.tagline }).from(schema.products).where(eq(schema.products.status, 'active')).orderBy(schema.products.sortOrder);
  return prods.map((x) => ({ ...x, scenarios: listScenarios(x.slug) })).filter((x) => x.scenarios.length);
}
