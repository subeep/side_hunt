'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireEmployee } from '@/lib/authz/guards';
import { fromForm, guarded, type FormState } from '@/lib/employee/common';
import { addTeamNote, createTeam, joinTeam, leaveTeam } from '@/lib/employee/teams';

export async function createTeamAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  return guarded(async () => { const t = await createTeam(p, fromForm(form)); revalidatePath('/employee/teams'); redirect(`/employee/teams/${t.id}`); });
}
export async function joinAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id } = fromForm(form);
  return guarded(async () => { await joinTeam(p, id ?? ''); revalidatePath('/employee/teams', 'layout'); return 'You joined the team.'; });
}
export async function leaveAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id } = fromForm(form);
  return guarded(async () => { await leaveTeam(p, id ?? ''); revalidatePath('/employee/teams', 'layout'); return 'You left the team.'; });
}
export async function noteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireEmployee();
  const { id, ...rest } = fromForm(form);
  return guarded(async () => { await addTeamNote(p, id ?? '', rest); revalidatePath(`/employee/teams/${id}`); return 'Note added.'; });
}
