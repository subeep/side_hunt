import { describe, expect, it } from 'vitest';
import { as, USER } from './helpers/principals';
import { listScenarios } from '@/lib/scenarios';
import { executeRun, getRun, scenariosFor } from '@/lib/client/sandbox';

// Integration with the REAL employee-owned scenario engine (no mock). Skips until that engine is present.
const available = listScenarios().length > 0;

describe.skipIf(!available)('sandbox with the real scenario engine', () => {
  it('every entitled scenario runs, persists, and is labelled SYNTHETIC', async () => {
    const nw = await as(USER.nwMember);
    for (const slug of [...nw.entitlements]) {
      for (const def of scenariosFor(slug)) {
        const res = await executeRun(nw, { offeringSlug: slug, scenarioSlug: def.slug, inputs: {} });
        expect(res.ok, `${def.slug}`).toBe(true);
        const run = await getRun(nw, (res as { runId: string }).runId);
        expect(run?.output.label).toMatch(/^SYNTHETIC/);
        expect(run?.output.summary).toBeTruthy();
      }
    }
  });
  it('out-of-range inputs are clamped or rejected by the engine, never stored raw', async () => {
    const hb = await as(USER.hbMember);
    const def = scenariosFor('riva')[0];
    const field = def.fields.find((f) => f.type === 'number');
    if (!field) return;
    const res = await executeRun(hb, { offeringSlug: 'riva', scenarioSlug: def.slug, inputs: { [field.key]: '99999999' } });
    if (res.ok) {
      const run = await getRun(hb, res.runId);
      expect(Number(run?.inputs[field.key])).toBeLessThanOrEqual(field.max ?? Infinity);
    }
  });
});
