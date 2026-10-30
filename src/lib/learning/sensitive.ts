/**
 * Heuristic sensitive-content scan. Pure (client + server safe). IMPORTANT: this is a helper that flags LIKELY sensitive
 * text for the author and the moderator. It is NOT a privacy guarantee: it misses things and over-flags others.
 */
export interface SensitiveFlag {
  type: string;
  excerpt: string;
  field: string;
}
export interface SensitiveRange {
  type: string;
  start: number;
  end: number;
}

export const FLAG_LABELS: Record<string, string> = {
  iban: 'IBAN-like account number',
  email: 'Email address',
  phone: 'Phone number',
  card_or_account_number: 'Long digit run (possible card/account number)',
  grouped_digits: 'Grouped digits (possible card/account number)',
  account_label: 'Account number reference',
  national_id: 'National-ID-like number',
  currency_amount: 'Large currency amount',
  secret_keyword: 'Credential / secret keyword',
  customer_name: 'Personal name (e.g. "Mr X")',
  company_name: 'Company name',
  confidential_terms: 'Confidential terms / pricing / NDA',
};

// Order = priority when two matches overlap (earlier wins).
const RULES: { type: string; re: RegExp }[] = [
  { type: 'iban', re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g },
  { type: 'email', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { type: 'secret_keyword', re: /\b(?:password|passwd|pass\s?phrase|secret|api[\s_-]?key|access[\s_-]?token|auth[\s_-]?token|bearer|private[\s_-]?key|token|sk_live_\w+)\b/gi },
  { type: 'national_id', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'phone', re: /(?:\+\d[\d\s().-]{7,}\d|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b)/g },
  { type: 'account_label', re: /\b(?:acct|a\/c|account)\s*(?:no\.?|number|num|#)?\s*[:#]?\s*\d[\d -]{3,}\d/gi },
  { type: 'card_or_account_number', re: /\b\d{9,19}\b/g },
  { type: 'grouped_digits', re: /\b\d{3,4}(?:[ -]\d{3,4}){2,5}\b/g },
  { type: 'currency_amount', re: /(?:[$€£¥₹]\s?\d{1,3}(?:[,.\s]\d{3})+(?:\.\d+)?|[$€£¥₹]\s?\d{5,}|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\s?(?:USD|EUR|GBP|INR|CAD|AUD|SGD)\b|\b(?:USD|EUR|GBP|INR|CAD|AUD|SGD)\s?\d{1,3}(?:[,.\s]\d{3})+)/g },
  { type: 'customer_name', re: /\b(?:Mr|Mrs|Ms|Miss|Mx|Dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g },
  { type: 'company_name', re: /\b[A-Z][\w&'-]+(?:\s+[A-Z][\w&'-]+){0,3}\s+(?:LLC|Ltd|Inc|GmbH|SA|PLC|LLP|Pty|Co)\b/g },
  { type: 'confidential_terms', re: /\b(?:under\s+NDA|NDA|confidential(?:ly)?\s+(?:pricing|contract|terms?|agreement)|rate\s+card|contract\s+value|negotiated\s+(?:rate|pricing))\b/gi },
];

/** Positions of likely-sensitive spans (overlaps resolved by rule priority). Used for highlighting and for flags. */
export function findRanges(text: string | null | undefined): SensitiveRange[] {
  if (!text) return [];
  const all: (SensitiveRange & { p: number })[] = [];
  RULES.forEach((r, p) => {
    for (const m of text.matchAll(new RegExp(r.re.source, r.re.flags))) {
      if (m[0].length) all.push({ type: r.type, start: m.index!, end: m.index! + m[0].length, p });
    }
  });
  all.sort((a, b) => a.p - b.p || a.start - b.start);
  const kept: SensitiveRange[] = [];
  for (const c of all) if (!kept.some((k) => c.start < k.end && k.start < c.end)) kept.push({ type: c.type, start: c.start, end: c.end });
  return kept.sort((a, b) => a.start - b.start);
}

export function scanText(field: string, text: string | null | undefined): SensitiveFlag[] {
  return findRanges(text).map((r) => ({ type: r.type, field, excerpt: text!.slice(r.start, r.end).slice(0, 80) }));
}

/** Scan several named fields. Returns a stable list (field order as supplied). */
export function scanFields(fields: Record<string, string | string[] | null | undefined>): SensitiveFlag[] {
  return Object.entries(fields).flatMap(([k, v]) => scanText(k, Array.isArray(v) ? v.join('\n') : v));
}

/** Split text into plain / flagged segments for rendering. */
export function highlightSegments(text: string): { text: string; type?: string }[] {
  const out: { text: string; type?: string }[] = [];
  let at = 0;
  for (const r of findRanges(text)) {
    if (r.start > at) out.push({ text: text.slice(at, r.start) });
    out.push({ text: text.slice(r.start, r.end), type: r.type });
    at = r.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** Stable fingerprint of the flags, used to invalidate an acknowledgement when the text (and so the flags) change. */
export const flagsFingerprint = (flags: SensitiveFlag[]) => flags.map((f) => `${f.field}:${f.type}:${f.excerpt}`).join('|');

/** Residual sensitive-content flags on a SHARED representation (the moderator must clear or knowingly acknowledge them). */
export const scanShared = (r: { title: string; summary: string; industry?: string | null; region?: string | null; periodLabel?: string | null }) =>
  scanFields({ title: r.title, summary: r.summary, industry: r.industry, region: r.region, periodLabel: r.periodLabel });
