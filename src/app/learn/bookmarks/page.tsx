import Link from 'next/link';
import { requireFeed } from '@/lib/insights/guards';
import { listBookmarks } from '@/lib/insights/engage';
import { Badge, Card, EmptyState, fmtDay, PageHeader } from '@/components/ui';
import { InsightsNav } from '@/components/insights/parts';
import { ActionButton } from '@/components/insights/Forms';
import { removeBookmarkAction } from '../feed/actions';

export const metadata = { title: 'Bookmarks' };
const LABEL = { shared: 'Observation', theme: 'Theme', idea: 'Idea' } as const;

export default async function BookmarksPage() {
  const p = await requireFeed('/learn/bookmarks');
  const rows = await listBookmarks(p);
  return (
    <div>
      <InsightsNav current="/learn/bookmarks" owner={p.grants.has('product_owner')} />
      <PageHeader eyebrow="Your shortlist" title="Bookmarks" description="Observations, themes and ideas you saved. Each is re-checked for visibility whenever you open this page." />
      {rows.length === 0 ? (
        <EmptyState title="Nothing bookmarked yet" action={<Link className="btn btn-primary" href="/learn">Browse the shared feed</Link>}>Use “Bookmark” on an observation, theme or idea to keep it here.</EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((b) => (
            <Card key={b.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Badge tone="neutral">{LABEL[b.type] ?? b.type}</Badge>{' '}
                  {b.href ? <Link href={b.href} className="font-serif text-lg">{b.title}</Link> : <span className="text-muted">This item is no longer available</span>}
                  <p className="mt-1 text-xs text-muted">Saved {fmtDay(b.createdAt)}</p>
                </div>
                <ActionButton action={removeBookmarkAction} fields={{ id: b.id }} label="Remove" className="btn btn-ghost btn-sm" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
