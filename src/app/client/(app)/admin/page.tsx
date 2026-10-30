import { Alert, Badge, Card, EmptyState, Field, PageHeader, fmtDate, type Tone } from '@/components/ui';
import { ActionForm } from '@/components/client/ActionForm';
import { requireClientAdminAccepted } from '@/lib/client/guard';
import { listInvitations, listMembers, listOrgEntitlements, ROLE_LABEL, type InvitationState } from '@/lib/client/admin';
import { changeRoleAction, inviteAction, requestAccessAction, revokeInviteAction, revokeMemberAction } from './actions';

export const metadata = { title: 'Organisation admin' };
const STATE_TONE: Record<InvitationState, Tone> = { pending: 'amber', accepted: 'sage', expired: 'neutral', revoked: 'clay' };

export default async function ClientAdminPage() {
  const p = await requireClientAdminAccepted();
  const [members, invitations, products] = await Promise.all([listMembers(p), listInvitations(p), listOrgEntitlements(p)]);
  const activeAdmins = members.filter((m) => m.status === 'active' && m.role === 'client_admin').length;
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Organisation admin" title={`Manage ${p.activeOrgName}`} description="Invite colleagues and assign the two client roles. You can act only inside this organisation; platform and employee roles can never be granted here, and every attempt is audited." />

      <section aria-labelledby="mem-h">
        <h2 id="mem-h" className="mb-3 text-2xl">Members</h2>
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="table-basic">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membershipId}>
                    <td className="font-medium text-brown-900">{m.name}{m.userId === p.userId && <span className="ml-1 text-xs text-muted">(you)</span>}</td>
                    <td className="break-all">{m.email}</td>
                    <td><Badge tone={m.role === 'client_admin' ? 'brown' : 'neutral'}>{ROLE_LABEL[m.role] ?? m.role}</Badge></td>
                    <td><Badge tone={m.status === 'active' ? 'sage' : 'clay'}>{m.status}</Badge></td>
                    <td>
                      {m.status === 'active' && (
                        <div className="flex flex-wrap items-start gap-2">
                          <ActionForm action={changeRoleAction} submit={m.role === 'client_admin' ? 'Make member' : 'Make administrator'} buttonClass="btn-secondary btn-sm" confirm={m.role === 'client_admin' ? 'Change this administrator to a member?' : 'Give this person administrator rights in your organisation?'}>
                            <input type="hidden" name="membershipId" value={m.membershipId} />
                            <input type="hidden" name="role" value={m.role === 'client_admin' ? 'client_member' : 'client_admin'} />
                          </ActionForm>
                          <ActionForm action={revokeMemberAction} submit="Remove" buttonClass="btn-ghost btn-sm text-clay" confirm={`Remove ${m.name} from ${p.activeOrgName}?`}>
                            <input type="hidden" name="membershipId" value={m.membershipId} />
                          </ActionForm>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="hint mt-2">{activeAdmins <= 1 ? 'You have one administrator. The last administrator cannot be demoted or removed.' : `${activeAdmins} active administrators. The last administrator can never be demoted or removed.`}</p>
      </section>

      <section aria-labelledby="inv-h" className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div>
          <h2 id="inv-h" className="mb-3 text-2xl">Invitations</h2>
          {invitations.length === 0 ? (
            <EmptyState title="No invitations yet">Invite a colleague with the form. They receive a single-use link that expires in 7 days.</EmptyState>
          ) : (
            <div className="space-y-3">
              {invitations.map((i) => (
                <Card key={i.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><p className="break-all font-medium text-brown-900">{i.email}</p><p className="text-sm text-muted">{ROLE_LABEL[i.role]} · created {fmtDate(i.createdAt)} · {i.state === 'pending' ? `expires ${fmtDate(i.expiresAt)}` : i.state === 'accepted' ? `accepted ${fmtDate(i.usedAt)}` : i.state === 'revoked' ? `revoked ${fmtDate(i.revokedAt)}` : `expired ${fmtDate(i.expiresAt)}`}</p></div>
                    <div className="flex flex-wrap gap-2"><Badge tone={STATE_TONE[i.state]}>{i.state}</Badge>{i.emailStatus ? <Badge tone={i.emailStatus === 'sent' ? 'sage' : i.emailStatus === 'failed' ? 'clay' : 'amber'}>Email {i.emailStatus}</Badge> : <Badge tone="neutral">No email record</Badge>}</div>
                  </div>
                  {i.state === 'pending' && (
                    <ActionForm action={revokeInviteAction} submit="Revoke" buttonClass="btn-secondary btn-sm" className="mt-3" confirm="Revoke this invitation?"><input type="hidden" name="invitationId" value={i.id} /></ActionForm>
                  )}
                </Card>
              ))}
              <p className="hint">Email status is the hand-off status: queued means stored for sending, sent means accepted by the mail provider, failed means it was not sent. None of these confirms delivery. The link itself is shown only once, when you create the invitation.</p>
            </div>
          )}
        </div>
        <Card className="self-start">
          <h3 className="text-xl">Invite someone</h3>
          <ActionForm action={inviteAction} submit="Create invitation" pendingText="Creating…" className="mt-3 space-y-3">
            <Field label="Email address" htmlFor="inv-email"><input id="inv-email" name="email" type="email" required maxLength={200} autoComplete="off" className="input" /></Field>
            <Field label="Role" htmlFor="inv-role" hint="Only client roles exist here. Platform or employee roles cannot be granted."><select id="inv-role" name="role" defaultValue="client_member" className="select"><option value="client_member">Member</option><option value="client_admin">Administrator</option></select></Field>
          </ActionForm>
        </Card>
      </section>

      <section aria-labelledby="ent-h">
        <h2 id="ent-h" className="mb-1 text-2xl">Entitlements (read-only)</h2>
        <Alert tone="info" className="mb-3">Entitlements are enabled by Azentio. Workspace administrators cannot enable products for themselves. You can ask for access, which raises a support ticket and changes nothing by itself.</Alert>
        <div className="grid gap-3 md:grid-cols-2">
          {products.map((x) => (
            <Card key={x.slug}>
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-brown-900">{x.name}</p><p className="text-xs text-muted">{x.category}</p></div><Badge tone={x.entitled ? 'sage' : 'neutral'}>{x.entitled ? 'Enabled' : 'Not enabled'}</Badge></div>
              {!x.entitled && <ActionForm action={requestAccessAction} submit="Request access" buttonClass="btn-secondary btn-sm" className="mt-3"><input type="hidden" name="productSlug" value={x.slug} /></ActionForm>}
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
