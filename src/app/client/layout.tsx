import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { ClientNav } from '@/components/client/ClientNav';
import { requireClient } from '@/lib/authz/guards';

/** Shell for the client portal: explicit ACTIVE workspace only (multi-membership users are sent to /workspace by the guard). */
export default async function ClientLayout({ children }: { children: ReactNode }) {
  const p = await requireClient();
  return (
    <div>
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brown-200 bg-brown-50 px-5 py-4" aria-label="Active workspace">
        <div>
          <p className="eyebrow">Active workspace</p>
          <p className="font-serif text-2xl leading-tight text-brown-900">{p.activeOrgName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="brown">{p.activeOrgRole === 'client_admin' ? 'Administrator' : 'Member'}</Badge>
          <Badge tone={p.communityApproved ? 'sage' : 'neutral'}>{p.communityApproved ? 'Learning community: approved' : 'Learning community: not approved'}</Badge>
          {p.memberships.filter((m) => m.orgKind === 'client').length > 1 && <span className="text-xs text-muted">Switch workspace from the header.</span>}
        </div>
      </section>
      <ClientNav isAdmin={p.activeOrgRole === 'client_admin'} />
      {children}
    </div>
  );
}
