'use server';
import { revalidatePath } from 'next/cache';
import { requireGrant } from '@/lib/authz/guards';
import { fromForm, guarded, type FormState } from '@/lib/employee/common';
import { createSupportAuthorisation, revokeSupportAuthorisation } from '@/lib/admin/support';

export async function authoriseAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireGrant('portal_admin');
  return guarded(async () => { await createSupportAuthorisation(p, fromForm(form)); revalidatePath('/admin/support'); return 'Authorised. The client administrators were notified. Every view is audited.'; });
}
export async function revokeSupportAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireGrant('portal_admin');
  const { id } = fromForm(form);
  return guarded(async () => { await revokeSupportAuthorisation(p, id ?? ''); revalidatePath('/admin/support', 'layout'); return 'Authorisation revoked.'; });
}
