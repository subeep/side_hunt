import { EmptyState, PageHeader } from '@/components/ui';
import { ContentCard } from '@/components/public/Blocks';
import { getPrincipal } from '@/lib/auth/session';
import { listContentForPrincipal } from '@/lib/public/content';

export const metadata = { title: 'Perspectives', description: 'Short reads on applied AI in regulated industries.' };

export default async function Page() {
  const items = await listContentForPrincipal(await getPrincipal(), 'perspective');
  return (
    <div>
      <PageHeader eyebrow="Perspectives" title="Ideas Worth Exploring. Perspectives Worth Sharing." description="Short reads on applied AI in regulated industries." />
      {items.length === 0 ? <EmptyState title="Nothing published yet">New posts will appear here.</EmptyState> : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((i) => <li key={i.id}><ContentCard item={i} base="/perspectives" /></li>)}</ul>}
    </div>
  );
}
