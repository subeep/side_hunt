import { requireUser } from '@/lib/authz/guards';
import { enforceClientTerms } from '@/lib/client/guard';
import { canSeeFeed } from '@/lib/insights/visibility';
import { AIRA_STATEMENT } from '@/lib/insights/aira';
import { Alert, PageHeader } from '@/components/ui';
import { InsightsNav } from '@/components/insights/parts';
import { AiraForm } from '@/components/insights/AiraForm';

export const metadata = { title: 'Ask AIRA' };

export default async function AiraPage() {
  const p = await requireUser('/learn/aira');
  await enforceClientTerms(p);
  const canPortal = canSeeFeed(p);
  return (
    <div>
      <InsightsNav current="/learn/aira" owner={p.grants.has('product_owner')} />
      <PageHeader eyebrow="Assistant" title="Ask AIRA" description="AIRA finds approved contributions you are allowed to see, then summarises them with citations. It retrieves first and answers second, and drops any sentence it cannot back with a citation." />
      <Alert tone="info" className="mb-6">{AIRA_STATEMENT} {process.env.ANTHROPIC_API_KEY ? 'A language model writes the wording from the retrieved text only; every sentence is checked against its cited sources.' : 'No language model is configured here, so answers are plain extracts of the approved text.'}</Alert>
      <AiraForm canPortal={canPortal} />
    </div>
  );
}
