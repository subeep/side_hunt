import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrincipal } from '@/lib/auth/session';
import { clientIp, forbiddenJson, jsonError, sameOrigin, unauthorizedJson } from '@/lib/http';
import { airaRateAllowed, askAira } from '@/lib/insights/aira';
import { clientTermsPending } from '@/lib/client/guard';
import { canSeeFeed } from '@/lib/insights/visibility';

const body = z.object({ question: z.string().trim().min(3).max(500), scope: z.enum(['portal', 'public']).default('portal') });

/** AIRA. scope=portal needs a signed-in community-visible principal; scope=public is open and sees public content only. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, 'cross_origin');
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_request');
  const p = await getPrincipal();
  const { question, scope } = parsed.data;
  if (scope === 'portal') {
    if (!p) return unauthorizedJson();
    if (!canSeeFeed(p)) return forbiddenJson();
    if (await clientTermsPending(p)) return forbiddenJson(); // workspace terms not yet acknowledged
  }
  const rateKey = scope === 'portal' ? p!.userId : clientIp(req.headers);
  if (!(await airaRateAllowed(scope, rateKey))) return jsonError(429, 'rate_limited');
  const r = await askAira(p, { question, scope });
  if (!r.ok) return jsonError(r.error === 'forbidden' ? 403 : 400, r.error);
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
}
