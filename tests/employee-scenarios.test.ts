import { describe, expect, it } from 'vitest';
import { explainScenario, getScenario, listScenarios, runScenario } from '@/lib/scenarios';

const SLUGS = ['policy-what-if', 'sme-application', 'segment-compare', 'report-validation'];
const LABEL = 'SYNTHETIC — simulated output. Not a credit or business decision.';

describe('scenario engine', () => {
  it('lists the four scenarios, by offering, as copies', () => {
    expect(listScenarios().map((s) => s.slug)).toEqual(SLUGS);
    expect(listScenarios('riva').map((s) => s.slug)).toEqual(['report-validation']);
    expect(listScenarios('nope')).toEqual([]);
    listScenarios()[0].fields[0].default = 1; // mutating a copy must not change the registry
    expect(getScenario('policy-what-if')!.fields[0].default).toBe(640);
    expect(getScenario('missing')).toBeNull();
  });
  it.each(SLUGS)('%s is deterministic, labelled and well formed', (slug) => {
    const def = getScenario(slug)!;
    const defaults = Object.fromEntries(def.fields.map((f) => [f.key, f.default]));
    const a = runScenario(slug, defaults);
    const b = runScenario(slug, { ...defaults });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.label).toBe(LABEL);
    expect(a.mode).toBe('deterministic');
    expect(a.scenarioSlug).toBe(slug);
    expect(a.sampleData.length).toBeGreaterThan(0);
    expect(a.evidence.length).toBeGreaterThan(0);
    expect(a.metrics.length).toBeGreaterThan(0);
    expect(a.summary).not.toMatch(/approved for|loan is approved|guarantee/i);
  });
  it('validates and clamps inputs; unknown keys and bad types fall back safely', () => {
    const r = runScenario('policy-what-if', { cutoffScore: 99999, maxDti: -5, segment: 'hacked', extra: '<script>' });
    expect(r.inputs).toEqual({ cutoffScore: 780, maxDti: 25, segment: 'all' });
    const r2 = runScenario('policy-what-if', { cutoffScore: 'abc', maxDti: NaN });
    expect(r2.inputs).toEqual({ cutoffScore: 640, maxDti: 43, segment: 'all' });
    expect(runScenario('sme-application', { amount: '250000', termMonths: 37 }).inputs).toMatchObject({ amount: 250000, termMonths: 36 });
    expect(runScenario('policy-what-if', null as never).inputs.cutoffScore).toBe(640);
    expect(() => runScenario('nope', {})).toThrow();
    expect(() => runScenario('__proto__', {})).toThrow();
  });
  it('policy what-if: stricter cutoff approves fewer; baseline reproduces itself', () => {
    const base = runScenario('policy-what-if', { cutoffScore: 640, maxDti: 43 });
    expect(base.summary).toMatch(/no simulated change/);
    const strict = runScenario('policy-what-if', { cutoffScore: 700, maxDti: 35 });
    const loose = runScenario('policy-what-if', { cutoffScore: 580, maxDti: 55 });
    const n = (r: typeof base) => Number(r.metrics[0].value.split(' ')[0]);
    expect(n(strict)).toBeLessThan(n(base));
    expect(n(loose)).toBeGreaterThan(n(base));
  });
  it('sme application: always requires a human decision; stress worsens ratios; seasonal applicant is flagged', () => {
    const calm = runScenario('sme-application', { applicant: 'bakery', amount: 50000 });
    const stressed = runScenario('sme-application', { applicant: 'bakery', amount: 50000, revenueShock: 30 });
    expect(calm.summary).toMatch(/human credit officer/);
    expect(calm.metrics.find((m) => m.label === 'Human decision')!.value).toBe('Required');
    expect(Number(stressed.metrics[0].value)).toBeLessThan(Number(calm.metrics[0].value));
    const logistics = runScenario('sme-application', { applicant: 'logistics', amount: 400000 });
    expect(logistics.summary).toMatch(/decline consideration/);
    expect(logistics.evidence.some((e) => e.detail.startsWith('Fail'))).toBe(true);
  });
  it('segment compare: sector match ranks first and small samples are caveated', () => {
    const r = runScenario('segment-compare', { sector: 'agri', ticket: 120000, seasonality: 'high', tenure: 12 });
    expect(r.sampleData[0].rows[0].segment).toBe('SEG-C');
    const logi = runScenario('segment-compare', { sector: 'logistics', ticket: 40000, seasonality: 'low', tenure: 36 });
    expect(logi.evidence.at(-1)!.detail).toMatch(/fewer than 50/);
  });
  it('report validation: clean mapping has defects, drifted maps fail every row, incomplete flags unmapped fields', () => {
    const clean = runScenario('report-validation', { mappingSet: 'clean', maxExceptionRate: 50 });
    expect(Number(clean.metrics[0].value)).toBeGreaterThan(0);
    const strict = runScenario('report-validation', { mappingSet: 'clean', strictness: 'strict', maxExceptionRate: 50 });
    expect(Number(strict.metrics[0].value)).toBeGreaterThan(Number(clean.metrics[0].value));
    const drifted = runScenario('report-validation', { mappingSet: 'drifted' });
    expect(drifted.metrics.find((m) => m.label === 'Result')!.value).toBe('Exceeds tolerance');
    const inc = runScenario('report-validation', { mappingSet: 'incomplete', maxExceptionRate: 50 });
    expect(inc.metrics.find((m) => m.label === 'Unmapped required fields')!.value).toBe('1');
    expect(inc.metrics.find((m) => m.label === 'Result')!.value).toBe('Exceeds tolerance');
  });
  it('explain hook is deterministic and never claims ai mode', () => {
    const r = runScenario('segment-compare', {});
    const e = explainScenario(r);
    expect(e.mode).toBe('deterministic');
    expect(e).toEqual(explainScenario(r));
    expect(e.text).toContain('SYNTHETIC');
  });
});
