import { redirect } from 'next/navigation';
import { PageHeader, Card, Badge } from '@/components/ui';
import { requireUser } from '@/lib/authz/guards';
import { selectWorkspaceAction } from '@/lib/auth/actions';

export const metadata = { title: 'Choose workspace' };

export default async function WorkspacePage() {
  const p = await requireUser('/workspace');
  const clients = p.memberships.filter((m) => m.orgKind === 'client');
  if (clients.length === 0) redirect(p.isEmployee ? '/employee' : '/');
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Workspace" title="Choose your active workspace" description="You belong to more than one organisation. Everything you see and do is scoped to exactly one workspace at a time. You can switch at any time from the header." />
      <div className="space-y-3">
        {clients.map((m) => (
          <Card key={m.orgId}>
            <form action={selectWorkspaceAction} className="flex items-center justify-between gap-4">
              <input type="hidden" name="orgId" value={m.orgId} />
              <div>
                <p className="font-serif text-lg text-brown-900">{m.orgName}</p>
                <Badge tone="neutral">{m.role === 'client_admin' ? 'Administrator' : 'Member'}</Badge>
                {p.activeOrgId === m.orgId && <Badge tone="sage" className="ml-2">Active</Badge>}
              </div>
              <button className="btn btn-primary btn-sm" type="submit">Open workspace</button>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
