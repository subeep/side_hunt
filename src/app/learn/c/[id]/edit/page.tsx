import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireClientAccepted } from '@/lib/client/guard';
import { getOwnContribution } from '@/lib/learning/access';
import { Alert, PageHeader } from '@/components/ui';
import { LearnNav } from '@/components/learning/LearnNav';
import { ContributionForm, type ContributionValues } from '@/components/learning/ContributionForm';
import { saveContributionAction } from '../actions';

export const metadata = { title: 'Edit observation' };

export default async function EditContributionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requireClientAccepted();
  const c = await getOwnContribution(p, id, 'learning.contribution.edit');
  if (!c) notFound();
  const editable = ['draft', 'clarification_requested', 'published'].includes(c.status);
  const initial: ContributionValues = {
    kind: c.kind, title: c.title, observation: c.observation, offeringSlug: c.offeringSlug ?? '', industry: c.industry ?? '', region: c.region ?? '', observationPeriod: c.observationPeriod ?? '',
    evidenceType: c.evidenceType ?? '', confidence: c.confidence ?? '', topic: c.topic ?? '', supportLinks: (c.supportLinks ?? []).join('\n'), sharingChoice: c.sharingChoice,
  };
  return (
    <div className="mx-auto max-w-3xl">
      <LearnNav current="/learn/mine" />
      <PageHeader eyebrow={`Version ${c.version}`} title="Edit observation" description={c.status === 'clarification_requested' ? 'Amend your observation to answer the moderator’s question, then resubmit from the observation page.' : undefined} />
      {!editable ? (
        <Alert tone="info">A contribution that is “{c.status.replace('_', ' ')}” can no longer be edited. <Link href={`/learn/c/${id}`}>Back to the observation</Link>.</Alert>
      ) : (
        <ContributionForm
          action={saveContributionAction}
          initial={initial}
          contributionId={id}
          communityApproved={p.communityApproved}
          sharingLocked={c.status !== 'draft'}
          needsFlagAck={c.status === 'published'}
          orgOnlyLive={c.status === 'published' && c.sharingChoice === 'organisation'}
          submitLabel={c.status === 'published' ? (c.sharingChoice === 'organisation' ? 'Save changes for my organisation' : 'Save as a new version for renewed review') : c.status === 'draft' ? 'Save changes (stays private)' : 'Save amendments'}
          backHref={`/learn/c/${id}`}
        />
      )}
    </div>
  );
}
