'use server';
import { revalidatePath } from 'next/cache';
import { requireClientAccepted } from '@/lib/client/guard';
import { closeTicket, createTicket } from '@/lib/client/support';
import type { FormState } from '@/components/client/ActionForm';

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export async function createTicketAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClientAccepted();
  const res = await createTicket(p, { subject: str(form.get('subject')), body: str(form.get('body')) }); // org + author from the session
  if (!res.ok) return { error: res.error };
  revalidatePath('/client/support');
  return { ok: 'Ticket raised. It is stored in this portal (simulated integration).' };
}

export async function closeTicketAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClientAccepted();
  const done = await closeTicket(p, str(form.get('id')));
  revalidatePath('/client/support', 'layout');
  return done ? { ok: 'Ticket closed.' } : { error: 'Ticket not found.' };
}
