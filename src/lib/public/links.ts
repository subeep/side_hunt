/** Only same-site paths or https URLs may be used as banner/CTA targets (blocks javascript:, data:, protocol-relative). */
export function safeHref(h: unknown): string | null {
  if (typeof h !== 'string') return null;
  const s = h.trim();
  if (s.length > 300) return null;
  if (/^\/(?!\/)[\w\-./?=&#%]*$/.test(s)) return s;
  if (/^https:\/\/[a-z0-9.-]+(?::\d+)?(\/[\w\-./?=&#%]*)?$/i.test(s)) return s;
  return null;
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isSlug = (s: unknown): s is string => typeof s === 'string' && s.length >= 2 && s.length <= 80 && SLUG_RE.test(s);
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const isId = (s: unknown): s is string => typeof s === 'string' && ID_RE.test(s);
