'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireClientAccepted } from '@/lib/client/guard';
import { saveContribution, submitContribution } from '@/lib/learning/contributions';
import { setOptionalConsent } from '@/lib/learning/consent';
import { withdrawContribution } from '@/lib/learning/publish';
import { readConsents, readContribution, readStr } from '@/lib/learning/forms';
import type { FormState } from '@/lib/learning/result';

const idOf = (fd: FormData) => z.string().min(1).max(64).parse(readStr(fd, 'contributionId'));

export async function saveContributionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const p = await requireClientAccepted();
  const id = idOf(fd);
  const r = await saveContribution(p, id, readContribution(fd), { acknowledgeFlags: fd.get('acknowledgeFlags') === 'on' });
  if (!r.ok) return { error: r.message, errors: r.errors };
  redirect(`/learn/c/${id}?${r.renewedReview ? 'renewed' : 'saved'}=1`);
}

export async function submitContributionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const p = await requireClientAccepted();
  const id = idOf(fd);
  const r = await submitContribution(p, id, { consents: readConsents(fd), acknowledgeFlags: fd.get('acknowledgeFlags') === 'on' });
  if (!r.ok) return { error: r.message, errors: r.errors };
  redirect(`/learn/c/${id}?submitted=1`);
}

export async function withdrawAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const p = await requireClientAccepted();
  if (fd.get('confirm') !== 'on') return { error: 'Please confirm that you understand what withdrawal does and does not do.' };
  const id = idOf(fd);
  const r = await withdrawContribution(p, id);
  if (!r.ok) return { error: r.message };
  revalidatePath(`/learn/c/${id}`);
  return { ok: true, message: `Withdrawn. ${r.sla}`, trace: r.trace };
}

export async function optionalConsentAction(fd: FormData): Promise<void> {
  const p = await requireClientAccepted();
  const id = idOf(fd);
  const purpose = z.enum(['attribution', 'training']).parse(readStr(fd, 'purpose'));
  await setOptionalConsent(p, id, purpose, readStr(fd, 'granted') === '1');
  revalidatePath(`/learn/c/${id}`);
}
