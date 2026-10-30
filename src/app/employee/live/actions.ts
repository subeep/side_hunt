'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireEmployee } from '@/lib/authz/guards';
import { fromForm, guarded, type FormState } from '@/lib/employee/common';
import { attachRecording, createSession, detachRecording, setSessionAudience, updateSession } from '@/lib/employee/live';

/** Every action authorises in the lib (broadcast.configure = video_publisher grant); the UI hiding the forms is cosmetic. */
const done = (id?: string) => { revalidatePath('/employee/live'); if (id) revalidatePath(`/employee/live/${id}`); };

export async function createSessionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  return guarded(async () => { const row = await createSession(p, fromForm(form)); done(); redirect(`/employee/live/${row.id}`); });
}
export async function updateSessionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id, ...rest } = fromForm(form);
  return guarded(async () => { await updateSession(p, id ?? '', rest); done(id); return 'Session updated.'; });
}
export async function audienceAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id, ...rest } = fromForm(form);
  return guarded(async () => { await setSessionAudience(p, id ?? '', rest); done(id); return 'Audience updated (an attached recording follows it).'; });
}
export async function attachAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id, mediaId } = fromForm(form);
  return guarded(async () => { await attachRecording(p, id ?? '', mediaId); done(id); return 'Recording attached with the session audience.'; });
}
export async function detachAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id } = fromForm(form);
  return guarded(async () => { await detachRecording(p, id ?? ''); done(id); return 'Recording detached.'; });
}
