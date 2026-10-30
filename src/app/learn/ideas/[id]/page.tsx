import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/authz/guards';
import { enforceClientTerms } from '@/lib/client/guard';
import { getIdeaForPrincipal, STATUS_LABEL } from '@/lib/insights/ideas';
import { canSeeFeed } from '@/lib/insights/visibility';
import { isBookmarked } from '@/lib/insights/engage';
import { Alert, Card, fmtDay, PageHeader } from '@/components/ui';
import { EvidenceBadge, InsightsNav, StatusBadge } from '@/components/insights/parts';
import { ActionButton } from '@/components/insights/Forms';
import { bookmarkAction } from '../../feed/actions';

export const metadata = { title: 'Improvement idea' };

export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requireUser(`/learn/ideas/${id}`);
  await enforceClientTerms(p);
  const idea = await getIdeaForPrincipal(p, id); // 404 for anything not relevant to this principal
  if (!idea) notFound();
  const feed = canSeeFeed(p);
  const marked = feed ? await isBookmarked(p, 'idea', id) : false;
  return (
    <div>
      <InsightsNav current="/learn/ideas" owner={p.grants.has('product_owner')} />
      <Link href="/learn/ideas" className="mb-4 inline-block text-sm">← All ideas</Link>
      <PageHeader eyebrow="Improvement idea" title={idea.title} actions={<>
        <StatusBadge status={idea.status} />
        {feed && <ActionButton action={bookmarkAction} fields={{ type: 'idea', id }} label={marked ? 'Remove bookmark' : 'Bookmark'} pressed={marked} />}
        {idea.internal && <Link className="btn btn-secondary btn-sm" href={`/product/ideas/${id}`}>Manage in console</Link>}
      </>} />
      <Alert tone="warn" className="mb-6"><strong>{STATUS_LABEL[idea.status]}.</strong> {idea.disclaimer}</Alert>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card><h2 className="mb-2 text-base">The problem</h2><p className="text-sm leading-relaxed">{idea.problem}</p><h2 className="mb-2 mt-5 text-base">Proposed outcome</h2><p className="text-sm leading-relaxed">{idea.proposedOutcome}</p></Card>
          <section aria-labelledby="up-h">
            <h2 id="up-h" className="mb-3 text-xl">Updates</h2>
            {idea.updates.length === 0 ? <p className="text-sm text-muted">No updates have been posted yet.</p> : (
              <ol className="space-y-3">{idea.updates.map((u, n) => <li key={n} className="card !p-4"><p className="text-sm">{u.message}</p><p className="mt-1 text-xs text-muted">{fmtDay(u.at)}</p></li>)}</ol>
            )}
          </section>
          <section aria-labelledby="ev-h">
            <h2 id="ev-h" className="mb-3 text-xl">Approved observations behind this idea</h2>
            {idea.evidence.length === 0 ? <p className="text-sm text-muted">{feed ? 'No currently published observations are linked.' : 'The shared feed is available to approved community participants.'}</p> : (
              <ul className="space-y-2">{idea.evidence.map((e) => <li key={e.id} className="card !p-4"><Link href={`/learn/feed/${e.id}`} className="font-semibold">{e.title}</Link> <EvidenceBadge q={e.evidenceQuality} /></li>)}</ul>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <Card>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs uppercase tracking-wider text-muted">Status</dt><dd><StatusBadge status={idea.status} /></dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-muted">Owner team</dt><dd>{idea.team ?? 'Not assigned yet'}</dd></div>
              {idea.offeringSlug && <div><dt className="text-xs uppercase tracking-wider text-muted">Offering</dt><dd>{idea.offeringSlug}</dd></div>}
              <div><dt className="text-xs uppercase tracking-wider text-muted">Last update</dt><dd>{fmtDay(idea.updatedAt)}</dd></div>
            </dl>
          </Card>
          <Card>
            <h2 className="mb-2 text-base">Status history</h2>
            <ol className="space-y-1.5 text-sm">{idea.timeline.map((t, n) => <li key={n}>{STATUS_LABEL[t.status]} <span className="text-xs text-muted">· {fmtDay(t.at)}</span></li>)}</ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}
