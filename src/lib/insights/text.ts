/** Tiny, deterministic text toolkit (tokenise / stem / tf-idf / cosine). No external services, no embeddings API. */
const STOP = new Set(
  'a an and are as at be by for from has have in is it its of on or that the their this to was were will with we our us they them these those but not no can may more most than then there which who what when how why do does did into over under also such any all each other some about been being if so very'.split(' '),
);

export function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function tokenise(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

export function termFreq(tokens: string[], weight = 1, into: Map<string, number> = new Map()): Map<string, number> {
  for (const t of tokens) into.set(t, (into.get(t) ?? 0) + weight);
  return into;
}

/** term -> count object in the shape stored in search_index.terms. */
export const buildTerms = (text: string): Record<string, number> => Object.fromEntries(termFreq(tokenise(text)));

export const idfOf = (df: number, n: number) => Math.log(1 + (n - df + 0.5) / (df + 0.5));

export function idfTable(docs: Map<string, number>[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const out = new Map<string, number>();
  for (const [t, c] of df) out.set(t, idfOf(c, docs.length));
  return out;
}

export function tfidfVector(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const v = new Map<string, number>();
  for (const [t, c] of tf) v.set(t, (1 + Math.log(c)) * (idf.get(t) ?? 1));
  return v;
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [t, x] of a) { na += x * x; const y = b.get(t); if (y) dot += x * y; }
  for (const y of b.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Shared-prefix fuzzy match used for partial credit (e.g. seasonal ~ seasonality). */
export function fuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < 5) return false;
  let i = 0;
  while (i < min && a[i] === b[i]) i++;
  return i >= Math.max(5, Math.ceil(min * 0.7));
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
