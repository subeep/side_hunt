'use server';
import { redirect } from 'next/navigation';
import { requireClient } from '@/lib/authz/guards';
import { recordTermsAcceptance } from '@/lib/client/terms';
import type { FormState } from '@/components/client/ActionForm';

export async function acceptTermsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClient(); // tenant = the session's ACTIVE workspace; no org id is read from the form
  if (form.get('ack') !== 'on') return { error: 'Please tick the box to confirm you have read the terms and the learning-sharing explanation.' };
  await recordTermsAcceptance(p.userId, p.activeOrgId, 'terms_page');
  redirect('/client');
}
