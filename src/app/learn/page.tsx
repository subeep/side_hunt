import Link from 'next/link';
import { requireFeed } from '@/lib/insights/guards';
import { FILTER_KEYS, normaliseFilters, normaliseQuery, runFeed } from '@/lib/insights/search';
import { first } from '@/lib/insights/state';
import { feedHref, listSavedSearches } from '@/lib/insights/engage';
import { Alert, AudienceChip, EmptyState, Field, PageHeader } from '@/components/ui';
import { FeedBanner, InsightsNav, ItemCard, StatBlock } from '@/components/insights/parts';
import { SearchBox } from '@/components/insights/SearchBox';
import { InsightsForm } from '@/components/insights/Forms';
import { saveSearchAction } from './feed/actions';

export const metadata = { title: 'Shared learning' };
const PAGE = 12;
const LABELS: Record<(typeof FILTER_KEYS)[number], string> = { offering: 'Offering', industry: 'Industry', region: 'Region', period: 'Observation period', topic: 'Topic' };

export default async function LearnHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await requireFeed('/learn');
  const sp = await searchParams;
  const q = normaliseQuery(first(sp.q));
  const filters = normaliseFilters(Object.fromEntries(FILTER_KEYS.map((k) => [k, first(sp[k])])));
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const res = (await runFeed(p, { q, filters, limit: PAGE, offset: (page - 1) * PAGE }))!;
  const active = !!q || Object.keys(filters).length > 0;
  const saved = (await listSavedSearches(p)).slice(0, 5);
  const qs = (extra: Record<string, string>) => feedHref(q, filters, extra).replace('/learn', '');
  const exportQs = new URLSearchParams([...(q ? [['q', q]] : []), ...Object.entries(filters)] as [string, string][]).toString();

  return (
    <div>
      <InsightsNav current="/learn" owner={p.grants.has('product_owner')} />
      <PageHeader
        eyebrow="Collective learning"
        title="Shared learning from the community"
        description="Observations that clients proposed, a moderator reviewed and de-identified, and the community agreed to share. Use it to see what others are noticing, and to check your own experience against it."
        actions={<><Link className="btn btn-primary" href="/learn/new">Share an observation</Link><AudienceChip kind="community" /></>}
      />
      <FeedBanner />

      <form method="get" action="/learn" className="card mb-6 space-y-4" role="search">
        <SearchBox defaultValue={q} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FILTER_KEYS.map((k) => (
            <Field key={k} label={LABELS[k]} htmlFor={`f-${k}`}>
              <select id={`f-${k}`} name={k} className="select" defaultValue={filters[k] ?? ''}>
                <option value="">Any</option>
                {res.facets[k].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" type="submit">Search</button>
          {active && <Link className="btn btn-ghost" href="/learn">Clear</Link>}
          <span className="flex-1" />
          <a className="btn btn-secondary btn-sm" href={`/api/learn/export?format=csv&${exportQs}`}>Export CSV</a>
          <a className="btn btn-secondary btn-sm" href={`/api/learn/export?format=json&${exportQs}`}>Export JSON</a>
        </div>
        <p className="hint">Search, counts, suggestions and exports all apply the same visibility rules as the items themselves.</p>
      </form>

      <div className="mb-6"><StatBlock stat={res.stat} label={active ? 'matching your search' : 'in the shared feed'} /></div>

      {res.items.length === 0 ? (
        <EmptyState title={active ? 'No approved observations match' : 'No approved observations have been shared yet'} action={active ? <Link className="btn btn-secondary" href="/learn">Clear search</Link> : <Link className="btn btn-primary" href="/learn/new">Propose the first one</Link>}>
          {active ? 'Try fewer filters or different words. Only observations that passed moderation appear here.' : 'When clients propose observations and a moderator approves them, they appear here.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2" aria-live="polite">{res.items.map((i) => <ItemCard key={i.id} item={i} />)}</div>
      )}

      {(page > 1 || res.hasMore) && (
        <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
          {page > 1 ? <Link className="btn btn-secondary btn-sm" href={`/learn${qs({ page: String(page - 1) })}`}>Previous</Link> : <span />}
          <span className="text-xs text-muted">Page {page}</span>
          {res.hasMore ? <Link className="btn btn-secondary btn-sm" href={`/learn${qs({ page: String(page + 1) })}`}>Next</Link> : <span />}
        </nav>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {active && (
          <section className="card" aria-labelledby="save-h">
            <h2 id="save-h" className="text-lg">Save this search</h2>
            <InsightsForm action={saveSearchAction} submitLabel="Save search" className="mt-3">
              <input type="hidden" name="q" value={q} />
              {FILTER_KEYS.map((k) => <input key={k} type="hidden" name={k} value={filters[k] ?? ''} />)}
              <Field label="Name" htmlFor="sname"><input id="sname" name="name" className="input" required minLength={2} maxLength={60} /></Field>
            </InsightsForm>
          </section>
        )}
        {saved.length > 0 && (
          <section className="card" aria-labelledby="saved-h">
            <h2 id="saved-h" className="text-lg">Your saved searches</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {saved.map((s) => <li key={s.id}><Link href={feedHref(s.query, s.filters)}>{s.name}</Link></li>)}
            </ul>
            <Link className="mt-3 inline-block text-sm" href="/learn/saved">Manage saved searches</Link>
          </section>
        )}
      </div>
      <Alert tone="info" className="mt-8">Popularity is not market prevalence or proof of causation. Items are listed by relevance or recency, never ranked by votes, and there are no leaderboards.</Alert>
    </div>
  );
}
