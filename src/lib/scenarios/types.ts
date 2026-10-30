/** Contract between the employee Playground and the client Sandbox. Implementation lives in ./index.ts (owned by the employee agent). */
export interface ScenarioField {
  key: string;
  label: string;
  type: 'number' | 'select' | 'text';
  options?: { value: string; label: string }[];
  default: string | number;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}
export interface ScenarioDef {
  slug: string; // policy-what-if | sme-application | segment-compare | report-validation (+ optional extras)
  offeringSlug: string; // products.slug
  title: string;
  description: string;
  fields: ScenarioField[];
  syntheticDataNote: string;
}
export interface ScenarioResult {
  label: 'SYNTHETIC — simulated output. Not a credit or business decision.';
  scenarioSlug: string;
  inputs: Record<string, string | number>;
  sampleData: { title: string; rows: Record<string, string | number>[] }[]; // the synthetic data inspected
  evidence: { title: string; detail: string }[];
  summary: string; // the simulated recommendation / finding
  metrics: { label: string; value: string }[];
  mode: 'deterministic' | 'ai-assisted';
}
