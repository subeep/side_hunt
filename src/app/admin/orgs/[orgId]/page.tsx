import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, EmptyState, Field, PageHeader } from '@/components/ui';
import { AdminNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { requireGrant } from '@/lib/authz/guards';
import { getCommunityStatus, getOrg, listEntitlements, listMembers, listOrgInvitations } from '@/lib/admin/orgs';
import { addMemberAction, communityAction, entitlementAction, inviteOrgAction, revokeOrgInviteAction, revokeMemberAction, roleAction } from '../actions';

export const metadata = { title: 'Organisation' };

export default async function OrgPage({ params }: { params: Promise<{ orgId: string }> }) {
  const p = await requireGrant('portal_admin');
  const org = await getOrg(p, (await params).orgId);
  if (!org || org.kind !== 'client') notFound();
  const [members, ents, community, invites] = await Promise.all([listMembers(p, org.id), listEntitlements(p, org.id), getCommunityStatus(p, org.id), listOrgInvitations(p, org.id)]);
  return (
    <div>
      <PageHeader eyebrow="Organisation" title={org.name} description={[org.industry, org.region].filter(Boolean).join(' · ') || undefined} actions={<><Link href="/admin/orgs" className="btn btn-secondary btn-sm">All organisations</Link><Link href="/admin/support" className="btn btn-secondary btn-sm">Support access</Link></>} />
      <AdminNav current="/admin/orgs" />
      {org.status === 'suspended' && <Alert tone="danger" className="mb-6">This organisation is suspended. Its members cannot open the workspace.</Alert>}

      <section aria-labelledby="members" className="mb-10">
        <h2 id="members" className="mb-3 text-xl">Members</h2>
        {members.length === 0 ? <EmptyState title="No members yet">Invite the first client administrator below. Once they accept, they can invite their own colleagues.</EmptyState> : (
          <div className="overflow-x-auto rounded-xl border border-line bg-card">
            <table className="table-basic">
              <thead><tr><th scope="col">Person</th><th scope="col">Status</th><th scope="col">Role</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td><strong className="text-brown-900">{m.name}</strong><br /><span className="text-xs text-muted">{m.email}</span></td>
                    <td><Badge tone={m.status === 'active' ? 'sage' : 'neutral'}>{m.status}</Badge></td>
                    <td>
                      <ActionForm action={roleAction} submit="Change" variant="secondary" inline>
                        <input type="hidden" name="membershipId" value={m.id} />
                        <label className="sr-only" htmlFor={`role-${m.id}`}>Role for {m.email}</label>
                        <select id={`role-${m.id}`} name="role" defaultValue={m.role} className="select !w-auto"><option value="client_member">Member</option><option value="client_admin">Client administrator</option></select>
                      </ActionForm>
                    </td>
                    <td>{m.status === 'active' && <ActionForm action={revokeMemberAction} submit="Revoke" variant="danger" inline confirmText={`Revoke ${m.email}?`}><input type="hidden" name="membershipId" value={m.id} /></ActionForm>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card mt-4 max-w-2xl"><h3 className="mb-3 text-lg">Invite someone new</h3>
          <ActionForm action={inviteOrgAction} submit="Create invitation">
            <input type="hidden" name="orgId" value={org.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email" htmlFor="inv-email"><input id="inv-email" name="email" type="email" className="input" required maxLength={200} /></Field>
              <Field label="Role" htmlFor="inv-role"><select id="inv-role" name="role" className="select" defaultValue="client_admin"><option value="client_admin">Client administrator</option><option value="client_member">Member</option></select></Field>
            </div>
            <p className="hint">Use this for the first client administrator of a new organisation. The person signs in with an emailed code and accepts a single-use invitation (7 days). Invitations are stored in the email outbox; pass the link on yourself if no email provider is configured.</p>
          </ActionForm>
          {invites.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm" aria-label="Pending invitations">
              {invites.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2"><span><strong className="text-brown-900">{v.email}</strong> <Badge tone="neutral">{v.role === 'client_admin' ? 'Administrator' : 'Member'}</Badge> <span className="text-xs text-muted">pending</span></span>
                  <ActionForm action={revokeOrgInviteAction} submit="Revoke" variant="danger" inline confirmText={`Revoke the invitation for ${v.email}?`}><input type="hidden" name="invitationId" value={v.id} /></ActionForm></li>
              ))}
            </ul>
          )}
        </div>
        <div className="card mt-4 max-w-2xl"><h3 className="mb-3 text-lg">Add an existing user</h3>
          <ActionForm action={addMemberAction} submit="Add member">
            <input type="hidden" name="orgId" value={org.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email" htmlFor="email"><input id="email" name="email" type="email" className="input" required maxLength={200} /></Field>
              <Field label="Role" htmlFor="role"><select id="role" name="role" className="select"><option value="client_member">Member</option><option value="client_admin">Client administrator</option></select></Field>
            </div>
            <p className="hint">Only existing, non-employee users, and only client roles. Platform roles are granted on the Platform grants page, to employees only.</p>
          </ActionForm>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="ents"><h2 id="ents" className="mb-3 text-xl">Product entitlements</h2>
          <ul className="space-y-2">
            {ents.map((e) => (
              <li key={e.slug} className="card flex flex-wrap items-center justify-between gap-3">
                <span><strong className="text-brown-900">{e.name}</strong> <Badge tone={e.enabled ? 'sage' : 'neutral'}>{e.enabled ? 'Enabled' : 'Off'}</Badge></span>
                <ActionForm action={entitlementAction} submit={e.enabled ? 'Disable' : 'Enable'} variant={e.enabled ? 'secondary' : 'primary'} inline>
                  <input type="hidden" name="orgId" value={org.id} /><input type="hidden" name="productSlug" value={e.slug} /><input type="hidden" name="enabled" value={String(!e.enabled)} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="comm"><h2 id="comm" className="mb-3 text-xl">Learning community</h2>
          <div className="card">
            <p className="mb-3 text-sm">Status: <Badge tone={community === 'approved' ? 'sage' : community === 'revoked' ? 'clay' : 'neutral'}>{community}</Badge></p>
            <p className="mb-4 text-sm text-muted">Approval lets members read approved shared learning. It is not consent to share anything: each contribution still needs its author&apos;s explicit choice and moderator review.</p>
            <div className="flex flex-wrap gap-2">
              <ActionForm action={communityAction} submit="Approve" inline><input type="hidden" name="orgId" value={org.id} /><input type="hidden" name="status" value="approved" /></ActionForm>
              <ActionForm action={communityAction} submit="Revoke" variant="danger" inline confirmText="Revoke community participation for this organisation?"><input type="hidden" name="orgId" value={org.id} /><input type="hidden" name="status" value="revoked" /></ActionForm>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
