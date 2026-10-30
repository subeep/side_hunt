import Link from 'next/link';
import { requireFeed } from '@/lib/insights/guards';
import { feedHref, listSavedSearches } from '@/lib/insights/engage';
import { Card, EmptyState, fmtDay, PageHeader } from '@/components/ui';
import { InsightsNav } from '@/components/insights/parts';
import { ActionButton } from '@/components/insights/Forms';
import { deleteSavedAction } from '../feed/actions';

export const metadata = { title: 'Saved searches' };

export default async function SavedPage() {
  const p = await requireFeed('/learn/saved');
  const rows = await listSavedSearches(p);
  return (
    <div>
      <InsightsNav current="/learn/saved" owner={p.grants.has('product_owner')} />
      <PageHeader eyebrow="Your shortcuts" title="Saved searches" description="Searches are private to you. Running one always applies today’s visibility rules, so withdrawn observations never appear." />
      {rows.length === 0 ? (
        <EmptyState title="No saved searches yet" action={<Link className="btn btn-primary" href="/learn">Go to the shared feed</Link>}>Run a search or choose filters in the shared feed, then use “Save this search”.</EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link href={feedHref(s.query, s.filters)} className="font-serif text-lg">{s.name}</Link>
                  <p className="mt-1 text-xs text-muted">{[s.query && `“${s.query}”`, ...Object.entries(s.filters ?? {}).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(' · ') || 'All approved observations'} · saved {fmtDay(s.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  <Link className="btn btn-secondary btn-sm" href={feedHref(s.query, s.filters)}>Run</Link>
                  <ActionButton action={deleteSavedAction} fields={{ id: s.id }} label="Delete" className="btn btn-ghost btn-sm" confirm="Delete this saved search?" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
