import { EmptyState, PageHeader } from '@/components/ui';
import { ContentCard } from '@/components/public/Blocks';
import { getPrincipal } from '@/lib/auth/session';
import { listContentForPrincipal } from '@/lib/public/content';

export const metadata = { title: 'AI Lab', description: 'Prototypes, experiments and engineering notes. Everything here uses synthetic data.' };

export default async function Page() {
  const items = await listContentForPrincipal(await getPrincipal(), 'lab');
  return (
    <div>
      <PageHeader eyebrow="AI Lab" title="Experiment Boldly. Engineer Purposefully." description="Prototypes, experiments and engineering notes. Everything here uses synthetic data." />
      {items.length === 0 ? <EmptyState title="Nothing published yet">New posts will appear here.</EmptyState> : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((i) => <li key={i.id}><ContentCard item={i} base="/lab" /></li>)}</ul>}
    </div>
  );
}
