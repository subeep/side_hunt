'use server';
import { redirect } from 'next/navigation';
import { requireClientAccepted } from '@/lib/client/guard';
import { createContribution } from '@/lib/learning/contributions';
import { readContribution } from '@/lib/learning/forms';
import type { FormState } from '@/lib/learning/result';

/** Always creates a PRIVATE DRAFT, whatever sharing choice is selected. */
export async function createContributionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const p = await requireClientAccepted();
  const r = await createContribution(p, readContribution(fd));
  if (!r.ok) return { error: r.message, errors: r.errors };
  redirect(`/learn/c/${r.id}?saved=1`);
}
