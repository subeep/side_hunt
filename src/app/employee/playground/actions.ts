'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireEmployee } from '@/lib/authz/guards';
import { guarded, fromForm, type FormState } from '@/lib/employee/common';
import { runPlayground, saveRunFeedback } from '@/lib/employee/playground';

export async function runAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { slug, ...inputs } = fromForm(form);
  return guarded(async () => {
    const { id } = await runPlayground(p, slug ?? '', inputs);
    revalidatePath('/employee/playground');
    redirect(`/employee/playground/runs/${id}`);
  });
}

export async function feedbackAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { runId, ...rest } = fromForm(form);
  return guarded(async () => {
    await saveRunFeedback(p, runId ?? '', rest);
    revalidatePath(`/employee/playground/runs/${runId}`);
    return 'Feedback saved. Thank you.';
  });
}
