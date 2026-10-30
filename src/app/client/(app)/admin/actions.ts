'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireClientAdminAccepted } from '@/lib/client/guard';
import { changeMemberRole, inviteMember, requestProductAccess, revokeInvite, revokeMember } from '@/lib/client/admin';
import type { FormState } from '@/components/client/ActionForm';

/**
 * Every action re-authorises on the server (client administrator of the ACTIVE workspace). The whole form is handed to the
 * lib layer as untrusted input: forged orgId / role fields are rejected there and audited.
 */
const raw = (form: FormData) => Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, unknown>;
const done = (): void => revalidatePath('/client/admin');

async function origin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
}

export async function inviteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClientAdminAccepted();
  const res = await inviteMember(p, raw(form), await origin());
  if (!res.ok) return { error: res.error };
  done();
  return { link: res.link, emailStatus: res.emailStatus };
}

export async function revokeInviteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClientAdminAccepted();
  const res = await revokeInvite(p, raw(form));
  done();
  return res.ok ? { ok: 'Invitation revoked.' } : { error: res.error };
}

export async function changeRoleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClientAdminAccepted();
  const res = await changeMemberRole(p, raw(form));
  done();
  return res.ok ? { ok: 'Role updated.' } : { error: res.error };
}

export async function revokeMemberAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClientAdminAccepted();
  const res = await revokeMember(p, raw(form));
  done();
  return res.ok ? { ok: 'Membership revoked.' } : { error: res.error };
}

export async function requestAccessAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClientAdminAccepted();
  const res = await requestProductAccess(p, raw(form));
  return res.ok ? { ok: 'Request sent to the Azentio team as a support ticket. Nothing is enabled until they act.' } : { error: res.error };
}
