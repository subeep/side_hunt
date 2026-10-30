'use server';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/authz/guards';
import { enforceClientTerms } from '@/lib/client/guard';
import { clientIp } from '@/lib/http';
import { airaRateAllowed, askAira, type AiraResult, type AiraScope } from '@/lib/insights/aira';

export interface AiraState { error?: string; result?: AiraResult; question?: string; scope?: AiraScope }

export async function askAiraAction(_: AiraState, fd: FormData): Promise<AiraState> {
  const p = await requireUser('/learn/aira');
  await enforceClientTerms(p);
  const scope: AiraScope = fd.get('scope') === 'public' ? 'public' : 'portal';
  const question = typeof fd.get('question') === 'string' ? (fd.get('question') as string) : '';
  const key = scope === 'portal' ? p.userId : clientIp(await headers());
  if (!(await airaRateAllowed(scope, key))) return { error: 'You are asking too quickly. Please wait a minute and try again.', question, scope };
  const r = await askAira(p, { question, scope });
  return r.ok ? { result: r, question, scope } : { error: r.message, question, scope };
}
