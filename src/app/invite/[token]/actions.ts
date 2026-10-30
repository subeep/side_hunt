'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getPrincipal, setSessionActiveOrg } from '@/lib/auth/session';
import { acceptInviteWithTerms } from '@/lib/client/invite';
import type { FormState } from '@/components/client/ActionForm';

/** Identity = the signed-in session; the invitation must have been issued to that verified email. The token is the only form input. */
export async function acceptInviteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get('token') ?? '').slice(0, 200);
  const p = await getPrincipal();
  if (!p) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const res = await acceptInviteWithTerms(p, token, form.get('ack') === 'on');
  if (!res.ok) return { error: res.error };
  if (p.sessionId) await setSessionActiveOrg(p.sessionId, res.orgId);
  revalidatePath('/', 'layout');
  redirect('/client');
}
