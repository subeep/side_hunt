'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireEmployee } from '@/lib/authz/guards';
import { fromForm, guarded, type FormState } from '@/lib/employee/common';
import { createExperiment, giveFeedback, setExperimentStatus } from '@/lib/employee/items';

export async function createExperimentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  return guarded(async () => { const x = await createExperiment(p, fromForm(form)); revalidatePath('/employee/experiments'); redirect(`/employee/experiments/${x.id}`); });
}
export async function statusAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id, status } = fromForm(form);
  return guarded(async () => { await setExperimentStatus(p, id ?? '', status); revalidatePath(`/employee/experiments/${id}`); return 'Status updated.'; });
}
export async function experimentFeedbackAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id, ...rest } = fromForm(form);
  return guarded(async () => { await giveFeedback(p, 'experiment', id ?? '', rest); revalidatePath(`/employee/experiments/${id}`); return 'Feedback saved.'; });
}
