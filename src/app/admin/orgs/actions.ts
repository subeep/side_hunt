'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireGrant } from '@/lib/authz/guards';
import { fromForm, guarded, type FormState } from '@/lib/employee/common';
import { addMember, inviteToOrg, revokeOrgInvitation, changeMemberRole, createOrg, revokeMember, setCommunityStatus, setEntitlement, setOrgStatus } from '@/lib/admin/orgs';

/** Each action: guard (portal_admin) first, then the lib re-authorises and audits. IDs from the form are lookup keys only. */
const admin = () => requireGrant('portal_admin');
const refresh = () => revalidatePath('/admin', 'layout');

export async function createOrgAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await admin();
  return guarded(async () => { const o = await createOrg(p, fromForm(form)); refresh(); redirect(`/admin/orgs/${o.id}`); });
}
export async function orgStatusAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await admin();
  const { orgId, status } = fromForm(form);
  return guarded(async () => { await setOrgStatus(p, orgId ?? '', status); refresh(); return status === 'suspended' ? 'Organisation suspended. Its members lose access immediately.' : 'Organisation reactivated.'; });
}
export async function addMemberAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await admin();
  return guarded(async () => { await addMember(p, fromForm(form)); refresh(); return 'Member added.'; });
}
export async function roleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await admin();
  const { membershipId, role } = fromForm(form);
  return guarded(async () => { await changeMemberRole(p, membershipId ?? '', role); refresh(); return 'Role changed.'; });
}
export async function revokeMemberAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await admin();
  const { membershipId } = fromForm(form);
  return guarded(async () => { await revokeMember(p, membershipId ?? ''); refresh(); return 'Membership revoked.'; });
}
export async function entitlementAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await admin();
  const { orgId, productSlug, enabled } = fromForm(form);
  return guarded(async () => { await setEntitlement(p, orgId ?? '', productSlug ?? '', enabled === 'true'); refresh(); return enabled === 'true' ? 'Product enabled.' : 'Product disabled.'; });
}
export async function communityAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await admin();
  const { orgId, status } = fromForm(form);
  return guarded(async () => { await setCommunityStatus(p, orgId ?? '', status); refresh(); return status === 'approved' ? 'Community participation approved.' : 'Community participation revoked.'; });
}

async function origin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
}
export async function inviteOrgAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await admin();
  return guarded(async () => {
    const r = await inviteToOrg(p, fromForm(form), await origin());
    refresh();
    const mail = r.emailStatus === 'sent' ? 'Email sent to the provider.' : r.emailStatus === 'failed' ? 'Email sending failed.' : 'Email is stored in the outbox only (not sent).';
    return `Invitation created. ${mail} Single-use link, valid 7 days: ${r.link}`;
  });
}
export async function revokeOrgInviteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await admin();
  const { invitationId } = fromForm(form);
  return guarded(async () => { await revokeOrgInvitation(p, invitationId ?? ''); refresh(); return 'Invitation revoked.'; });
}
