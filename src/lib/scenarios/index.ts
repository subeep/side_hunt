import type { ScenarioDef, ScenarioResult } from './types';
export type { ScenarioDef, ScenarioResult, ScenarioField } from './types';

// STUB: replaced by the employee agent (deterministic, pure, synthetic-data scenario engines).
export function listScenarios(_offeringSlug?: string): ScenarioDef[] {
  return [];
}
export function getScenario(_slug: string): ScenarioDef | null {
  return null;
}
/** Must validate + clamp raw inputs against the scenario's fields, and be deterministic for the same inputs. */
export function runScenario(_slug: string, _rawInputs: Record<string, unknown>): ScenarioResult {
  throw new Error('scenario engine not implemented yet');
}
