import Link from 'next/link';
import { requireClientAccepted } from '@/lib/client/guard';
import { listMine } from '@/lib/learning/access';
import { PageHeader, EmptyState, Alert } from '@/components/ui';
import { LearnNav } from '@/components/learning/LearnNav';
import { ContributionCard } from '@/components/learning/ContributionCard';

export const metadata = { title: 'My observations' };

export default async function MyObservationsPage() {
  const p = await requireClientAccepted();
  const rows = await listMine(p);
  const attention = rows.filter((r) => r.status === 'clarification_requested');
  return (
    <div>
      <LearnNav current="/learn/mine" />
      <PageHeader
        eyebrow={`${p.activeOrgName} · private to you`}
        title="My observations"
        description="Everything you have written, in every status. This list is private: nothing here is visible to other clients, and drafts are never visible to moderators."
        actions={<Link className="btn btn-primary" href="/learn/new">New observation</Link>}
      />
      {attention.length > 0 && <Alert tone="warn" className="mb-6">{attention.length} contribution{attention.length > 1 ? 's' : ''} need your answer to a moderator’s question.</Alert>}
      {rows.length === 0 ? (
        <EmptyState title="You have not written any observations yet" action={<Link className="btn btn-primary" href="/learn/new">Start a private draft</Link>}>
          Observations start as private drafts. You decide later whether to keep them private, share them with your organisation, or propose them to the learning community.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{rows.map((c) => <ContributionCard key={c.id} c={c} />)}</div>
      )}
    </div>
  );
}
