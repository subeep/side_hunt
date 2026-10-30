'use server';
import { revalidatePath } from 'next/cache';
import { requireEmployee } from '@/lib/authz/guards';
import { fromForm, guarded, type FormState } from '@/lib/employee/common';
import { createReleaseNote, giveFeedback } from '@/lib/employee/items';

export async function createNoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  return guarded(async () => { await createReleaseNote(p, fromForm(form)); revalidatePath('/employee/release-notes'); return 'Release note published to employees.'; });
}
export async function noteFeedbackAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id, ...rest } = fromForm(form);
  return guarded(async () => { await giveFeedback(p, 'release_note', id ?? '', rest); revalidatePath('/employee/release-notes'); return 'Thanks for the feedback.'; });
}
