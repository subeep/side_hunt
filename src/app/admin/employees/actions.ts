'use server';
import { revalidatePath } from 'next/cache';
import { requireGrant } from '@/lib/authz/guards';
import { fromForm, guarded, type FormState } from '@/lib/employee/common';
import { addAllowlist, revokeAllowlist } from '@/lib/admin/people';

export async function addAllowlistAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireGrant('portal_admin');
  return guarded(async () => { await addAllowlist(p, fromForm(form)); revalidatePath('/admin/employees'); return 'Added. They become an employee after their first verified sign-in with a one-time code.'; });
}
export async function revokeAllowlistAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireGrant('portal_admin');
  const { email } = fromForm(form);
  return guarded(async () => { await revokeAllowlist(p, email ?? ''); revalidatePath('/admin/employees'); return 'Revoked. Employee access, grants and sessions ended.'; });
}
