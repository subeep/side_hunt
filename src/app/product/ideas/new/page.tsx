import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireGrant } from '@/lib/authz/guards';
import { listOwnerCandidates } from '@/lib/insights/ideas';
import { normaliseQuery, searchShared } from '@/lib/insights/search';
import { first } from '@/lib/insights/state';
import { Alert, PageHeader } from '@/components/ui';
import { ConsoleNav } from '@/components/insights/ConsoleNav';
import { IdeaFields } from '@/components/insights/IdeaForm';
import { InsightsForm } from '@/components/insights/Forms';
import { createIdeaAction } from '../../actions';

export const metadata = { title: 'New idea' };

export default async function NewIdea({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await requireGrant('product_owner');
  const sp = await searchParams;
  const q = normaliseQuery(first(sp.q));
  const [products, owners, themes, found] = await Promise.all([
    db.select({ slug: schema.products.slug, name: schema.products.name }).from(schema.products).where(eq(schema.products.status, 'active')),
    listOwnerCandidates(p),
    db.select({ id: schema.themes.id, title: schema.themes.title }).from(schema.themes).where(eq(schema.themes.status, 'active')),
    searchShared(p, { q, limit: 40 }),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <ConsoleNav current="/product/ideas/new" />
      <PageHeader eyebrow="Product owner console" title="New improvement idea" description="Describe the problem in plain language and link the approved observations that support it. New ideas start as Proposed." />
      <form method="get" className="mb-6 flex gap-2" role="search"><input className="input" name="q" defaultValue={q} placeholder="Filter the evidence list below, e.g. seasonal" aria-label="Filter evidence" /><button className="btn btn-secondary">Filter evidence</button></form>
      <Alert tone="warn" className="mb-6">Anything in the title, problem, outcome or updates is visible to clients. Do not include emails, ticket numbers, client names, internal roadmap detail or delivery dates. The server rejects these.</Alert>
      <InsightsForm action={createIdeaAction} submitLabel="Create idea" pendingText="Creating…">
        <IdeaFields products={products} owners={owners} themes={themes} candidates={found?.items ?? []} selected={new Set()} extra={
          <div><label className="label" htmlFor="iu">First update for clients (optional)</label><textarea id="iu" name="initialUpdate" className="textarea min-h-20" maxLength={600} placeholder="Proposed. Not a promised delivery." /></div>
        } />
      </InsightsForm>
    </div>
  );
}
