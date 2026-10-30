import { requireClientAccepted } from '@/lib/client/guard';
import { PageHeader } from '@/components/ui';
import { LearnNav } from '@/components/learning/LearnNav';
import { ContributionForm } from '@/components/learning/ContributionForm';
import { createContributionAction } from './actions';

export const metadata = { title: 'New observation' };

export default async function NewObservationPage() {
  const p = await requireClientAccepted();
  return (
    <div className="mx-auto max-w-3xl">
      <LearnNav current="/learn/new" />
      <PageHeader eyebrow={`${p.activeOrgName} · private draft`} title="New observation" description="Describe what you have seen. It starts as a private draft that only you can see. You choose later whether and how to share it." />
      <ContributionForm action={createContributionAction} communityApproved={p.communityApproved} submitLabel="Save private draft" backHref="/learn/mine" />
    </div>
  );
}
