import type { ScenarioDef, ScenarioResult } from './types';
import { DEFS } from './data';
import { ENGINES, LABEL, normaliseInputs } from './engines';
export type { ScenarioDef, ScenarioResult, ScenarioField } from './types';
export { normaliseInputs };

/** Scenarios, optionally narrowed to one offering (products.slug). Returns copies so callers cannot mutate the registry. */
export function listScenarios(offeringSlug?: string): ScenarioDef[] {
  return DEFS.filter((d) => !offeringSlug || d.offeringSlug === offeringSlug).map((d) => structuredClone(d));
}
export function getScenario(slug: string): ScenarioDef | null {
  const d = DEFS.find((x) => x.slug === slug);
  return d ? structuredClone(d) : null;
}

/** Pure + deterministic: validates/clamps inputs against the field definitions; same inputs always give the same output. */
export function runScenario(slug: string, rawInputs: Record<string, unknown>): ScenarioResult {
  const def = DEFS.find((x) => x.slug === slug);
  const engine = def && ENGINES[def.slug];
  if (!def || !engine) throw new Error(`Unknown scenario: ${slug}`);
  const inputs = normaliseInputs(def, rawInputs);
  return { label: LABEL, scenarioSlug: def.slug, inputs, mode: 'deterministic', ...engine(inputs) };
}

/**
 * Optional "AI-assisted" explanation hook. Deterministic and offline in this build: it rewrites the already-computed
 * evidence into a plain-language explanation and never calls an external model. A real provider could be plugged in
 * here, but it would only ever receive this synthetic result.
 */
export function explainScenario(result: ScenarioResult): { mode: 'deterministic'; text: string } {
  const lead = result.evidence.slice(0, 3).map((e) => `${e.title}: ${e.detail}`).join(' ');
  const key = result.metrics.slice(0, 3).map((m) => `${m.label} ${m.value}`).join('; ');
  return { mode: 'deterministic', text: `${result.summary} Key figures: ${key}. ${lead} (${result.label})` };
}
