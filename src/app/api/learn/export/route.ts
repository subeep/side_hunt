import { getPrincipal } from '@/lib/auth/session';
import { forbiddenJson, jsonError, unauthorizedJson } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { exportFeed, FILTER_KEYS, normaliseFilters } from '@/lib/insights/search';
import { clientTermsPending } from '@/lib/client/guard';
import { canSeeFeed } from '@/lib/insights/visibility';

/** CSV/JSON export of exactly what the signed-in principal could see in the feed for the same query. Audited. */
export async function GET(req: Request) {
  const p = await getPrincipal();
  if (!p) return unauthorizedJson();
  if (!canSeeFeed(p)) return forbiddenJson();
  if (await clientTermsPending(p)) return forbiddenJson(); // workspace terms not yet acknowledged
  if (!(await rateLimit(`learn:export:${p.userId}`, 10, 60))) return jsonError(429, 'rate_limited');
  const u = new URL(req.url);
  const format = u.searchParams.get('format') === 'json' ? 'json' : 'csv';
  const out = await exportFeed(p, { q: u.searchParams.get('q') ?? '', filters: normaliseFilters(Object.fromEntries(FILTER_KEYS.map((k) => [k, u.searchParams.get(k)]))) }, format);
  if (!out) return forbiddenJson();
  return new Response(out.body, { headers: { 'Content-Type': out.contentType, 'Content-Disposition': `attachment; filename="${out.filename}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
