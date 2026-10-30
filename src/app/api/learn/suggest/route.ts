import { NextResponse } from 'next/server';
import { getPrincipal } from '@/lib/auth/session';
import { forbiddenJson, jsonError, unauthorizedJson } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { suggest } from '@/lib/insights/search';
import { clientTermsPending } from '@/lib/client/guard';
import { canSeeFeed } from '@/lib/insights/visibility';

export async function GET(req: Request) {
  const p = await getPrincipal();
  if (!p) return unauthorizedJson();
  if (!canSeeFeed(p)) return forbiddenJson();
  if (await clientTermsPending(p)) return forbiddenJson(); // workspace terms not yet acknowledged
  if (!(await rateLimit(`learn:suggest:${p.userId}`, 120, 60))) return jsonError(429, 'rate_limited');
  const suggestions = await suggest(p, new URL(req.url).searchParams.get('q') ?? '');
  return NextResponse.json({ suggestions }, { headers: { 'Cache-Control': 'no-store' } });
}
