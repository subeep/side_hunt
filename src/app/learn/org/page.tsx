import Link from 'next/link';
import { requireClientAccepted } from '@/lib/client/guard';
import { listOrg } from '@/lib/learning/access';
import { Alert, EmptyState, PageHeader } from '@/components/ui';
import { LearnNav } from '@/components/learning/LearnNav';
import { ContributionCard } from '@/components/learning/ContributionCard';

export const metadata = { title: 'Our organisation’s observations' };

export default async function OrgObservationsPage() {
  const p = await requireClientAccepted();
  const rows = await listOrg(p);
  return (
    <div>
      <LearnNav current="/learn/org" />
      <PageHeader
        eyebrow={`${p.activeOrgName} · organisation-only`}
        title="Our organisation’s observations"
        description="Contributions your colleagues chose to share within your organisation, or proposed to the learning community. Only members of your organisation can see this page. It is not the cross-client shared feed."
        actions={<Link className="btn btn-secondary" href="/learn">Open the cross-client shared feed</Link>}
      />
      <Alert tone="info" className="mb-6">Private drafts and items kept private by their author never appear here. Items only reach other organisations after a moderator publishes a de-identified shared version.</Alert>
      {rows.length === 0 ? (
        <EmptyState title="Nothing shared within your organisation yet">When a colleague shares an observation with the organisation, it appears here.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{rows.map((r) => <ContributionCard key={r.c.id} c={r.c} by={r.authorName} />)}</div>
      )}
    </div>
  );
}
