import type { ScenarioDef } from './types';

/** Small seeded PRNG so the synthetic portfolio is identical on every run (no Math.random anywhere in the engines). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export interface SynthLoan { id: string; score: number; dti: number; amount: number; segment: 'new-to-credit' | 'established'; pd: number }

/** 400 fictional applicants. Generated once from a fixed seed. */
function buildPortfolio(): SynthLoan[] {
  const r = mulberry32(20261031);
  const out: SynthLoan[] = [];
  for (let i = 0; i < 400; i++) {
    const thin = r() < 0.3;
    const score = Math.round(Math.min(840, Math.max(420, 665 - (thin ? 35 : 0) + (r() + r() + r() - 1.5) * 150)));
    const dti = Math.round(Math.min(70, Math.max(8, 34 + (r() + r() - 1) * 24 - (score - 660) / 25)));
    const amount = Math.round((3000 + r() * 27000) / 500) * 500;
    const pd = Math.min(0.5, Math.max(0.003, 0.002 + 0.3 * Math.exp(-(score - 450) / 90) + Math.max(0, dti - 40) * 0.002));
    out.push({ id: `SYN-${String(i + 1).padStart(3, '0')}`, score, dti, amount, segment: thin ? 'new-to-credit' : 'established', pd: Math.round(pd * 10000) / 10000 });
  }
  return out;
}
export const PORTFOLIO: SynthLoan[] = buildPortfolio();
export const BASELINE_POLICY = { cutoffScore: 640, maxDti: 43 };
export const LGD = 0.45;

export interface SynthSme {
  name: string; sector: string; yearsTrading: number; revenue: number; ebitda: number; existingDebtService: number;
  currentAssets: number; currentLiabilities: number; totalDebt: number; seasonality: string; note: string;
}
export const SME_APPLICANTS: Record<string, SynthSme> = {
  bakery: { name: 'Fictional Bakehouse Ltd', sector: 'Food retail', yearsTrading: 6, revenue: 820000, ebitda: 118000, existingDebtService: 31000, currentAssets: 96000, currentLiabilities: 61000, totalDebt: 210000, seasonality: 'low', note: 'Stable monthly turnover; one prior facility, always repaid on time.' },
  logistics: { name: 'Fictional Northline Freight', sector: 'Logistics', yearsTrading: 3, revenue: 2400000, ebitda: 210000, existingDebtService: 118000, currentAssets: 310000, currentLiabilities: 340000, totalDebt: 760000, seasonality: 'medium', note: 'Growing fleet; thin liquidity and high existing debt service.' },
  agri: { name: 'Fictional Harvest Cooperative', sector: 'Agriculture', yearsTrading: 11, revenue: 1350000, ebitda: 190000, existingDebtService: 52000, currentAssets: 420000, currentLiabilities: 250000, totalDebt: 380000, seasonality: 'high', note: 'Cash flow concentrated in two harvest quarters; strong annual figures, weak monthly coverage.' },
};

export interface Segment { id: string; name: string; sector: string; ticket: number; seasonality: string; tenure: number; n: number; defaultRate: number; recovery: number }
export const SEGMENTS: Segment[] = [
  { id: 'SEG-A', name: 'Small retail, low seasonality', sector: 'retail', ticket: 30000, seasonality: 'low', tenure: 24, n: 310, defaultRate: 3.1, recovery: 62 },
  { id: 'SEG-B', name: 'Seasonal retail, mid ticket', sector: 'retail', ticket: 90000, seasonality: 'high', tenure: 18, n: 96, defaultRate: 6.4, recovery: 55 },
  { id: 'SEG-C', name: 'Agri producers, harvest-linked', sector: 'agri', ticket: 120000, seasonality: 'high', tenure: 12, n: 158, defaultRate: 4.2, recovery: 68 },
  { id: 'SEG-D', name: 'Agri inputs and trading', sector: 'agri', ticket: 60000, seasonality: 'medium', tenure: 24, n: 41, defaultRate: 5.6, recovery: 58 },
  { id: 'SEG-E', name: 'Regional freight and haulage', sector: 'logistics', ticket: 250000, seasonality: 'medium', tenure: 48, n: 124, defaultRate: 4.9, recovery: 71 },
  { id: 'SEG-F', name: 'Local courier micro-fleets', sector: 'logistics', ticket: 40000, seasonality: 'low', tenure: 36, n: 27, defaultRate: 7.8, recovery: 49 },
  { id: 'SEG-G', name: 'Professional services', sector: 'services', ticket: 50000, seasonality: 'low', tenure: 36, n: 270, defaultRate: 2.4, recovery: 66 },
  { id: 'SEG-H', name: 'Hospitality and events', sector: 'services', ticket: 70000, seasonality: 'high', tenure: 24, n: 83, defaultRate: 8.9, recovery: 44 },
];

export const REPORT_FIELDS = [
  { field: 'borrower_id', type: 'string', required: true },
  { field: 'exposure_amount', type: 'number', required: true },
  { field: 'reporting_date', type: 'date', required: true },
  { field: 'risk_grade', type: 'enum', required: true },
  { field: 'country_code', type: 'iso2', required: false },
] as const;
export const GRADES = ['A', 'B', 'C', 'D'];
export const REPORT_ROWS: Record<string, string | number>[] = [
  { src_borrower: 'B-1001', src_amount: 120000, src_amount_text: '120,000', src_date: '2026-09-30', src_grade: 'A', src_country: 'GB' },
  { src_borrower: 'B-1002', src_amount: 45000, src_amount_text: '45,000', src_date: '2026-09-30', src_grade: 'B', src_country: 'GB' },
  { src_borrower: 'B-1003', src_amount: 310000, src_amount_text: '310,000', src_date: '2026-09-30', src_grade: 'B', src_country: 'IE' },
  { src_borrower: '', src_amount: 78000, src_amount_text: '78,000', src_date: '2026-09-30', src_grade: 'C', src_country: 'GB' },
  { src_borrower: 'B-1005', src_amount: 15500, src_amount_text: '15,500', src_date: '2026-09-30', src_grade: 'A', src_country: 'FR' },
  { src_borrower: 'B-1006', src_amount: 220000, src_amount_text: '220,000', src_date: '30/09/2026', src_grade: 'C', src_country: 'DE' },
  { src_borrower: 'B-1007', src_amount: -9000, src_amount_text: '-9,000', src_date: '2026-09-30', src_grade: 'B', src_country: 'GB' },
  { src_borrower: 'B-1008', src_amount: 64000, src_amount_text: '64,000', src_date: '2026-09-30', src_grade: 'D', src_country: 'gb' },
  { src_borrower: 'B-1009', src_amount: 91000, src_amount_text: '91,000', src_date: '2026-09-30', src_grade: 'E', src_country: 'GB' },
  { src_borrower: 'B-1010', src_amount: 28000, src_amount_text: '28,000', src_date: '2026-09-30', src_grade: 'A', src_country: 'GBR' },
  { src_borrower: 'B-1011', src_amount: 175000, src_amount_text: '175,000', src_date: '2026-09-30', src_grade: 'B', src_country: 'GB' },
  { src_borrower: 'B-1012', src_amount: 52000, src_amount_text: '52,000', src_date: '2026-09-30', src_grade: 'C', src_country: 'GB' },
];
export const MAPPING_SETS: Record<string, { label: string; map: Record<string, string | null> }> = {
  clean: { label: 'Reviewed mapping', map: { borrower_id: 'src_borrower', exposure_amount: 'src_amount', reporting_date: 'src_date', risk_grade: 'src_grade', country_code: 'src_country' } },
  drifted: { label: 'Drifted mapping (amount mapped to a text column)', map: { borrower_id: 'src_borrower', exposure_amount: 'src_amount_text', reporting_date: 'src_date', risk_grade: 'src_grade', country_code: 'src_country' } },
  incomplete: { label: 'Incomplete mapping (reporting date unmapped)', map: { borrower_id: 'src_borrower', exposure_amount: 'src_amount', reporting_date: null, risk_grade: 'src_grade', country_code: 'src_country' } },
};

const opt = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const DEFS: ScenarioDef[] = [
  {
    slug: 'policy-what-if', offeringSlug: 'credit-strategy-simulator', title: 'Credit policy what-if',
    description: 'Change the score cut-off and the debt-to-income limit, then compare simulated approvals, expected loss and portfolio shift against a baseline policy.',
    syntheticDataNote: 'A fixed synthetic portfolio of 400 fictional applicants generated from a seed. No real customers, no real lending data.',
    fields: [
      { key: 'cutoffScore', label: 'Minimum credit score', type: 'number', default: 640, min: 500, max: 780, step: 5, help: 'Baseline policy is 640.' },
      { key: 'maxDti', label: 'Maximum debt-to-income (%)', type: 'number', default: 43, min: 25, max: 60, step: 1, help: 'Baseline policy is 43%.' },
      { key: 'segment', label: 'Population', type: 'select', default: 'all', options: opt([['all', 'All applicants'], ['new-to-credit', 'New-to-credit only'], ['established', 'Established borrowers only']]) },
    ],
  },
  {
    slug: 'sme-application', offeringSlug: 'sme-credit-decisioning', title: 'SME application review',
    description: 'Load a fictional SME applicant, evaluate it against a synthetic policy, inspect the evidence and read a recommendation that always needs a human decision.',
    syntheticDataNote: 'Three fictional SME profiles with invented financials. Policy thresholds are illustrative, not any lender\'s policy.',
    fields: [
      { key: 'applicant', label: 'Synthetic applicant', type: 'select', default: 'bakery', options: opt(Object.entries(SME_APPLICANTS).map(([k, v]) => [k, `${v.name} (${v.sector})`] as [string, string])) },
      { key: 'amount', label: 'Requested facility (currency units)', type: 'number', default: 120000, min: 10000, max: 500000, step: 5000 },
      { key: 'termMonths', label: 'Term (months)', type: 'number', default: 36, min: 6, max: 60, step: 6 },
      { key: 'revenueShock', label: 'Revenue stress (%)', type: 'number', default: 0, min: 0, max: 30, step: 5, help: 'Simulated fall in revenue applied before the ratios.' },
    ],
  },
  {
    slug: 'segment-compare', offeringSlug: 'similar-portfolio-intelligence', title: 'Similar segment comparison',
    description: 'Describe a financing application and see which historical synthetic segments it most resembles, with comparable outcomes and sample-size caveats.',
    syntheticDataNote: 'Eight fictional historical segments with invented outcomes. Similarity is a simple transparent distance, not a trained model.',
    fields: [
      { key: 'sector', label: 'Sector', type: 'select', default: 'retail', options: opt([['retail', 'Retail'], ['agri', 'Agriculture'], ['logistics', 'Logistics'], ['services', 'Services']]) },
      { key: 'ticket', label: 'Facility size (currency units)', type: 'number', default: 60000, min: 5000, max: 500000, step: 5000 },
      { key: 'seasonality', label: 'Cash-flow seasonality', type: 'select', default: 'medium', options: opt([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]) },
      { key: 'tenure', label: 'Tenure (months)', type: 'number', default: 24, min: 6, max: 84, step: 6 },
    ],
  },
  {
    slug: 'report-validation', offeringSlug: 'riva', title: 'Report field mapping validation',
    description: 'Apply a field mapping to synthetic source records, validate every record against the report schema and review the exceptions.',
    syntheticDataNote: 'Twelve fictional source records, some with deliberate defects. Nothing here is a regulatory filing.',
    fields: [
      { key: 'mappingSet', label: 'Field mapping', type: 'select', default: 'clean', options: opt(Object.entries(MAPPING_SETS).map(([k, v]) => [k, v.label] as [string, string])) },
      { key: 'strictness', label: 'Validation strictness', type: 'select', default: 'standard', options: opt([['standard', 'Standard'], ['strict', 'Strict (also flags format drift)']]) },
      { key: 'maxExceptionRate', label: 'Tolerated exception rate (%)', type: 'number', default: 10, min: 0, max: 50, step: 5 },
    ],
  },
];
