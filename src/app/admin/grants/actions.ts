'use server';
import { revalidatePath } from 'next/cache';
import { requireGrant } from '@/lib/authz/guards';
import { fromForm, guarded, type FormState } from '@/lib/employee/common';
import { grantPlatform, revokeGrant } from '@/lib/admin/people';

export async function grantAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireGrant('portal_admin');
  return guarded(async () => { await grantPlatform(p, fromForm(form)); revalidatePath('/admin/grants'); return 'Grant recorded.'; });
}
export async function revokeGrantAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireGrant('portal_admin');
  return guarded(async () => { await revokeGrant(p, fromForm(form)); revalidatePath('/admin/grants'); return 'Grant revoked.'; });
}
