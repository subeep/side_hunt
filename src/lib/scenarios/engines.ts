import type { ScenarioDef, ScenarioResult } from './types';
import { BASELINE_POLICY, GRADES, LGD, MAPPING_SETS, PORTFOLIO, REPORT_FIELDS, REPORT_ROWS, SEGMENTS, SME_APPLICANTS } from './data';

type In = Record<string, string | number>;
export const LABEL = 'SYNTHETIC — simulated output. Not a credit or business decision.' as const;
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const money = (n: number) => Math.round(n).toLocaleString('en-GB');
const pct = (n: number, d = 1) => `${n.toFixed(d)}%`;

/** Validate + clamp raw inputs against the field definitions. Unknown keys are dropped; bad values fall back to defaults. */
export function normaliseInputs(def: ScenarioDef, raw: Record<string, unknown> | null | undefined): In {
  const out: In = {};
  for (const f of def.fields) {
    const v = raw && Object.prototype.hasOwnProperty.call(raw, f.key) ? raw[f.key] : undefined;
    if (f.type === 'number') {
      let n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (!Number.isFinite(n)) n = Number(f.default);
      const min = f.min ?? -Infinity;
      n = Math.min(f.max ?? Infinity, Math.max(min, n));
      if (f.step && Number.isFinite(min)) n = Math.min(f.max ?? Infinity, Math.round((n - min) / f.step) * f.step + min);
      out[f.key] = Number(n.toFixed(6));
    } else if (f.type === 'select') {
      out[f.key] = typeof v === 'string' && f.options?.some((o) => o.value === v) ? v : String(f.default);
    } else {
      out[f.key] = (typeof v === 'string' ? v.trim().slice(0, 200) : '') || String(f.default);
    }
  }
  return out;
}

type Engine = (i: In) => Omit<ScenarioResult, 'label' | 'scenarioSlug' | 'inputs' | 'mode'>;

function simulatePolicy(cutoff: number, maxDti: number, segment: string) {
  const pop = PORTFOLIO.filter((l) => segment === 'all' || l.segment === segment);
  const approved = pop.filter((l) => l.score >= cutoff && l.dti <= maxDti);
  const exposure = approved.reduce((s, l) => s + l.amount, 0);
  const loss = approved.reduce((s, l) => s + l.amount * l.pd * LGD, 0);
  const avgScore = approved.length ? approved.reduce((s, l) => s + l.score, 0) / approved.length : 0;
  const ntc = approved.length ? (approved.filter((l) => l.segment === 'new-to-credit').length / approved.length) * 100 : 0;
  return { pop, approved, exposure, loss, avgScore, ntc, rate: pop.length ? (approved.length / pop.length) * 100 : 0, lossRate: exposure ? (loss / exposure) * 100 : 0 };
}

const policyWhatIf: Engine = (i) => {
  const seg = String(i.segment);
  const base = simulatePolicy(BASELINE_POLICY.cutoffScore, BASELINE_POLICY.maxDti, seg);
  const s = simulatePolicy(Number(i.cutoffScore), Number(i.maxDti), seg);
  const baseIds = new Set(base.approved.map((l) => l.id));
  const marginal = s.approved.filter((l) => !baseIds.has(l.id));
  const dropped = base.approved.filter((l) => !s.approved.some((x) => x.id === l.id));
  const marginalLoss = marginal.reduce((a, l) => a + l.amount * l.pd * LGD, 0);
  const dApprove = s.approved.length - base.approved.length;
  const dLoss = s.loss - base.loss;
  return {
    sampleData: [
      { title: 'Baseline vs proposed policy (synthetic portfolio)', rows: [
        { policy: 'Baseline', minScore: BASELINE_POLICY.cutoffScore, maxDtiPct: BASELINE_POLICY.maxDti, approvals: base.approved.length, approvalRatePct: f1(base.rate), expectedLoss: money(base.loss) },
        { policy: 'Proposed', minScore: Number(i.cutoffScore), maxDtiPct: Number(i.maxDti), approvals: s.approved.length, approvalRatePct: f1(s.rate), expectedLoss: money(s.loss) },
      ] },
      { title: 'First 8 synthetic applicants', rows: s.pop.slice(0, 8).map((l) => ({ id: l.id, score: l.score, dtiPct: l.dti, amount: l.amount, segment: l.segment, approvedUnderProposed: s.approved.includes(l) ? 'yes' : 'no' })) },
    ],
    evidence: [
      { title: 'Population', detail: `${s.pop.length} synthetic applicants in scope (${seg === 'all' ? 'all segments' : seg}).` },
      { title: 'Marginal decisions', detail: `${marginal.length} applicants newly approved and ${dropped.length} no longer approved versus baseline. Newly approved applicants carry an expected loss of ${money(marginalLoss)}.` },
      { title: 'Portfolio shift', detail: `Average approved score ${f1(s.avgScore)} (baseline ${f1(base.avgScore)}); new-to-credit share of approvals ${pct(s.ntc)} (baseline ${pct(base.ntc)}).` },
      { title: 'Method', detail: `Expected loss = amount x synthetic probability of default x loss-given-default of ${LGD}. Probabilities are generated from score and DTI by a fixed formula, not estimated from real outcomes.` },
    ],
    summary: dApprove === 0 && dLoss === 0
      ? 'The proposed levers reproduce the baseline policy on this synthetic portfolio: no simulated change in approvals or expected loss.'
      : `Simulated effect: ${dApprove >= 0 ? '+' : ''}${dApprove} approvals versus baseline and expected loss ${dLoss >= 0 ? 'up' : 'down'} by ${money(Math.abs(dLoss))}. Any real policy change would need credit-risk review and approval.`,
    metrics: [
      { label: 'Simulated approvals', value: `${s.approved.length} of ${s.pop.length}` },
      { label: 'Approval rate', value: `${pct(s.rate)} (baseline ${pct(base.rate)})` },
      { label: 'Expected loss', value: `${money(s.loss)} (${dLoss >= 0 ? '+' : '-'}${money(Math.abs(dLoss))} vs baseline)` },
      { label: 'Expected loss rate', value: `${f2(s.lossRate)}% of approved exposure` },
      { label: 'Approved exposure', value: money(s.exposure) },
    ],
  };
};

function annuity(amount: number, months: number, rate = 0.095) {
  const r = rate / 12;
  return (amount * r) / (1 - Math.pow(1 + r, -months)) * 12;
}

const smeApplication: Engine = (i) => {
  const a = SME_APPLICANTS[String(i.applicant)] ?? SME_APPLICANTS.bakery;
  const shock = Number(i.revenueShock) / 100;
  const rev = a.revenue * (1 - shock);
  const ebitda = Math.max(0, a.ebitda - a.revenue * shock * 0.35);
  const newDs = annuity(Number(i.amount), Number(i.termMonths));
  const dscr = ebitda / (a.existingDebtService + newDs);
  const lev = ebitda > 0 ? (a.totalDebt + Number(i.amount)) / ebitda : Infinity;
  const cr = a.currentAssets / a.currentLiabilities;
  const checks = [
    { name: 'Debt service cover >= 1.25', ok: dscr >= 1.25, value: f2(dscr) },
    { name: 'Total debt / EBITDA <= 4.0', ok: lev <= 4, value: Number.isFinite(lev) ? f2(lev) : 'n/a' },
    { name: 'Current ratio >= 1.10', ok: cr >= 1.1, value: f2(cr) },
    { name: 'Trading history >= 2 years', ok: a.yearsTrading >= 2, value: `${a.yearsTrading} years` },
  ];
  const fails = checks.filter((c) => !c.ok);
  const lean = fails.length === 0 ? 'supports approval consideration' : fails.length === 1 ? 'suggests referral for manual review' : 'supports decline consideration';
  return {
    sampleData: [
      { title: `${a.name} (synthetic financials)`, rows: [{ revenue: money(rev), ebitda: money(ebitda), existingDebtService: money(a.existingDebtService), totalDebt: money(a.totalDebt), currentAssets: money(a.currentAssets), currentLiabilities: money(a.currentLiabilities), seasonality: a.seasonality }] },
      { title: 'Policy checks', rows: checks.map((c) => ({ check: c.name, value: c.value, result: c.ok ? 'pass' : 'fail' })) },
    ],
    evidence: [
      { title: 'Applicant profile', detail: `${a.sector}, ${a.yearsTrading} years trading. ${a.note}` },
      { title: 'Proposed facility', detail: `${money(Number(i.amount))} over ${i.termMonths} months at an assumed 9.5%, annual debt service ${money(newDs)}.` },
      ...checks.map((c) => ({ title: c.name, detail: `${c.ok ? 'Pass' : 'Fail'}: ${c.value}${shock ? ` (after ${Number(i.revenueShock)}% revenue stress)` : ''}.` })),
    ],
    summary: `Simulated recommendation: the synthetic evidence ${lean}. This is decision support only: a named human credit officer must review the evidence, record a decision and own it.`,
    metrics: [
      { label: 'Debt service cover', value: f2(dscr) },
      { label: 'Debt / EBITDA', value: Number.isFinite(lev) ? f2(lev) : 'n/a' },
      { label: 'Current ratio', value: f2(cr) },
      { label: 'Checks passed', value: `${checks.length - fails.length} of ${checks.length}` },
      { label: 'Human decision', value: 'Required' },
    ],
  };
};

const ORD: Record<string, number> = { low: 0, medium: 1, high: 2 };
const segmentCompare: Engine = (i) => {
  const scored = SEGMENTS.map((s) => {
    const dist = (s.sector === i.sector ? 0 : 40) + Math.min(30, Math.abs(Math.log(s.ticket / Number(i.ticket))) * 20) + Math.abs(ORD[s.seasonality] - ORD[String(i.seasonality)]) * 12 + Math.min(10, Math.abs(s.tenure - Number(i.tenure)) / 6);
    return { s, sim: Math.round(Math.max(0, 100 - dist) * 10) / 10 };
  }).sort((a, b) => b.sim - a.sim || a.s.id.localeCompare(b.s.id));
  const top = scored.slice(0, 3);
  const n = top.reduce((a, t) => a + t.s.n, 0);
  const wDef = top.reduce((a, t) => a + t.s.defaultRate * t.s.n, 0) / n;
  const wRec = top.reduce((a, t) => a + t.s.recovery * t.s.n, 0) / n;
  const small = top.filter((t) => t.s.n < 50);
  return {
    sampleData: [{ title: 'Most similar historical segments (synthetic)', rows: top.map((t) => ({ segment: t.s.id, name: t.s.name, similarity: t.sim, historicalLoans: t.s.n, defaultRatePct: t.s.defaultRate, recoveryPct: t.s.recovery })) }],
    evidence: [
      ...top.map((t) => ({ title: `${t.s.id}: ${t.s.name}`, detail: `Similarity ${t.sim}/100 on sector, facility size, seasonality and tenure. ${t.s.n} comparable loans, ${t.s.defaultRate}% defaulted, ${t.s.recovery}% average recovery.` })),
      { title: 'Caveats', detail: small.length ? `${small.map((t) => t.s.id).join(', ')} rest on fewer than 50 loans: treat their outcomes as indicative only.` : 'All three segments have at least 50 loans, which is still a small sample and not a forecast.' },
    ],
    summary: `The application most resembles ${top[0].s.name.toLowerCase()}. Pooled over the three closest segments, historical default rate was ${f1(wDef)}% with ${f1(wRec)}% recovery. Comparable outcomes describe the past; they do not decide this application.`,
    metrics: [
      { label: 'Closest segment', value: `${top[0].s.id} (${top[0].sim}/100)` },
      { label: 'Pooled default rate', value: pct(wDef) },
      { label: 'Pooled recovery', value: pct(wRec) },
      { label: 'Comparable loans', value: String(n) },
    ],
  };
};

const reportValidation: Engine = (i) => {
  const m = MAPPING_SETS[String(i.mappingSet)] ?? MAPPING_SETS.clean;
  const strict = i.strictness === 'strict';
  const exceptions: { row: number; field: string; problem: string }[] = [];
  const unmapped = REPORT_FIELDS.filter((f) => f.required && !m.map[f.field]).map((f) => f.field);
  REPORT_ROWS.forEach((r, idx) => {
    for (const f of REPORT_FIELDS) {
      const col = m.map[f.field];
      if (!col) continue;
      const v = r[col];
      const empty = v === '' || v === undefined || v === null;
      if (empty) { if (f.required) exceptions.push({ row: idx + 1, field: f.field, problem: 'required value missing' }); continue; }
      if (f.type === 'number' && (typeof v !== 'number' || v < 0)) exceptions.push({ row: idx + 1, field: f.field, problem: typeof v !== 'number' ? 'not numeric (mapped to a text column)' : 'negative exposure' });
      else if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) exceptions.push({ row: idx + 1, field: f.field, problem: 'date not in ISO format' });
      else if (f.type === 'enum' && !GRADES.includes(String(v))) exceptions.push({ row: idx + 1, field: f.field, problem: `grade '${v}' not in ${GRADES.join('/')}` });
      else if (f.type === 'iso2' && !/^[A-Z]{2}$/.test(String(v)) && (strict || String(v).length !== 2)) exceptions.push({ row: idx + 1, field: f.field, problem: 'country code is not a 2-letter upper-case code' });
    }
  });
  const checks = REPORT_ROWS.length * REPORT_FIELDS.length;
  const bad = new Set(exceptions.map((e) => e.row)).size;
  const rate = (bad / REPORT_ROWS.length) * 100;
  const within = rate <= Number(i.maxExceptionRate) && unmapped.length === 0;
  return {
    sampleData: [
      { title: `Field mapping: ${m.label}`, rows: REPORT_FIELDS.map((f) => ({ reportField: f.field, sourceColumn: m.map[f.field] ?? '(unmapped)', type: f.type, required: f.required ? 'yes' : 'no' })) },
      { title: 'Exceptions', rows: exceptions.length ? exceptions.slice(0, 20).map((e) => ({ record: e.row, field: e.field, problem: e.problem })) : [{ record: '-', field: '-', problem: 'No exceptions' }] },
    ],
    evidence: [
      { title: 'Mapping coverage', detail: unmapped.length ? `Required field(s) with no source column: ${unmapped.join(', ')}.` : 'Every required report field is mapped to a source column.' },
      { title: 'Records checked', detail: `${REPORT_ROWS.length} synthetic records against ${REPORT_FIELDS.length} fields (${checks} checks, ${strict ? 'strict' : 'standard'} rules).` },
      { title: 'Exceptions', detail: `${exceptions.length} exceptions across ${bad} records; exception rate ${pct(rate)} against a tolerance of ${i.maxExceptionRate}%.` },
    ],
    summary: within ? 'Simulated finding: the mapping is within the chosen tolerance. A reporting owner still has to review the exceptions before anything is submitted.' : 'Simulated finding: the mapping exceeds tolerance or leaves required fields unmapped. Fix the mapping or the source data and re-run; nothing here is a regulatory submission.',
    metrics: [
      { label: 'Exceptions', value: String(exceptions.length) },
      { label: 'Records with exceptions', value: `${bad} of ${REPORT_ROWS.length}` },
      { label: 'Exception rate', value: pct(rate) },
      { label: 'Unmapped required fields', value: String(unmapped.length) },
      { label: 'Result', value: within ? 'Within tolerance' : 'Exceeds tolerance' },
    ],
  };
};

export const ENGINES: Record<string, Engine> = { 'policy-what-if': policyWhatIf, 'sme-application': smeApplication, 'segment-compare': segmentCompare, 'report-validation': reportValidation };
