import { NextResponse } from 'next/server';
import { getPrincipal } from '@/lib/auth/session';
import { forbiddenJson, jsonError, unauthorizedJson } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { FILTER_KEYS, normaliseFilters, runFeed } from '@/lib/insights/search';
import { clientTermsPending } from '@/lib/client/guard';
import { canSeeFeed } from '@/lib/insights/visibility';

/** Search + safeguarded counts. Same visibility, published re-check, cohort suppression and differencing ledger as the page. */
export async function GET(req: Request) {
  const p = await getPrincipal();
  if (!p) return unauthorizedJson();
  if (!canSeeFeed(p)) return forbiddenJson();
  if (await clientTermsPending(p)) return forbiddenJson(); // workspace terms not yet acknowledged
  if (!(await rateLimit(`learn:search:${p.userId}`, 60, 60))) return jsonError(429, 'rate_limited');
  const u = new URL(req.url);
  const filters = normaliseFilters(Object.fromEntries(FILTER_KEYS.map((k) => [k, u.searchParams.get(k)])));
  const res = await runFeed(p, { q: u.searchParams.get('q') ?? '', filters, limit: Math.min(Number(u.searchParams.get('limit')) || 20, 50), offset: Math.max(Number(u.searchParams.get('offset')) || 0, 0) });
  if (!res) return forbiddenJson();
  return NextResponse.json({ items: res.items, hasMore: res.hasMore, statistics: res.stat }, { headers: { 'Cache-Control': 'no-store' } });
}
