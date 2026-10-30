'use server';
import { revalidatePath } from 'next/cache';
import { requireEmployee } from '@/lib/authz/guards';
import { fromForm, guarded, type FormState } from '@/lib/employee/common';
import { createKnowledge, giveFeedback, reviewKnowledge } from '@/lib/employee/items';

export async function createKnowledgeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  return guarded(async () => { await createKnowledge(p, fromForm(form)); revalidatePath('/employee/knowledge'); return 'Article added. Its first review is due in 90 days.'; });
}
export async function reviewAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id, ...rest } = fromForm(form);
  return guarded(async () => { await reviewKnowledge(p, id ?? '', rest); revalidatePath('/employee/knowledge'); return 'Marked as reviewed. Next review in 90 days.'; });
}
export async function knowledgeFeedbackAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id, ...rest } = fromForm(form);
  return guarded(async () => { await giveFeedback(p, 'knowledge', id ?? '', rest); revalidatePath('/employee/knowledge'); return 'Thanks. The article owner can see your feedback.'; });
}
