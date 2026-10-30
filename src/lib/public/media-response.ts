import type { Principal } from '../auth/principal';
import { getMediaForPrincipal, type MediaVariant } from './media';
import { isId } from './links';

const base = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

/** Identical for "does not exist", "draft", "wrong tenant", "no audience": the caller learns nothing. */
const notFound = () => new Response('Not found', { status: 404, headers: { ...base, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' } });

/**
 * The HTTP face of getMediaForPrincipal (kept out of the route file so it is unit-testable).
 *  - 404 (never 403) for anything not permitted or nonexistent
 *  - Cache-Control public only for audience 'public' + published; everything else private, no-store
 *  - SVG is served with a locked-down CSP (no script, sandboxed) on top of nosniff, and only as an image type
 */
export async function mediaResponse(id: string, p: Principal | null, variantParam: string | null): Promise<Response> {
  if (!isId(id)) return notFound();
  const variant: MediaVariant = variantParam === 'poster' ? 'poster' : 'data';
  const m = await getMediaForPrincipal(id, p, variant);
  if (!m) return notFound();
  const headers: Record<string, string> = {
    ...base,
    'Content-Type': `${m.mime}; charset=utf-8`,
    'Cache-Control': m.cacheable && m.audienceKind === 'public' ? 'public, max-age=300' : 'private, no-store',
    'Content-Security-Policy': m.mime === 'image/svg+xml' ? "default-src 'none'; style-src 'unsafe-inline'; sandbox" : "default-src 'none'; sandbox",
    'Content-Disposition': 'inline',
  };
  if (!m.cacheable) headers['Cross-Origin-Resource-Policy'] = 'same-origin';
  return new Response(m.body, { status: 200, headers });
}
