import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireFeed } from '@/lib/insights/guards';
import { getThemeView } from '@/lib/insights/themes';
import { isBookmarked } from '@/lib/insights/engage';
import { Alert, Badge, Card, fmtDay, PageHeader } from '@/components/ui';
import { InsightsNav, ItemCard, StatBlock } from '@/components/insights/parts';
import { ActionButton } from '@/components/insights/Forms';
import { bookmarkAction } from '../../feed/actions';

export const metadata = { title: 'Theme' };
const TONE = { low: 'amber', medium: 'brown', high: 'sage' } as const;

export default async function ThemeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requireFeed(`/learn/themes/${id}`);
  const t = await getThemeView(p, id);
  if (!t) notFound();
  const marked = await isBookmarked(p, 'theme', id);
  return (
    <div>
      <InsightsNav current="/learn/themes" owner={p.grants.has('product_owner')} />
      <Link href="/learn/themes" className="mb-4 inline-block text-sm">← All themes</Link>
      <PageHeader eyebrow="Theme" title={t.title} description={t.summary} actions={<><Badge tone={TONE[t.confidence.label]}>Confidence: {t.confidence.label}</Badge><ActionButton action={bookmarkAction} fields={{ type: 'theme', id }} label={marked ? 'Remove bookmark' : 'Bookmark'} pressed={marked} /></>} />
      <Alert tone="warn" className="mb-6"><strong>Read this first.</strong> {t.disclaimer}</Alert>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card><p className="text-xs uppercase tracking-wider text-muted">Contributing organisations</p><div className="mt-2"><StatBlock stat={t.stat} label="" /></div></Card>
        <Card><p className="text-xs uppercase tracking-wider text-muted">Relevant offerings</p><p className="mt-2 flex flex-wrap gap-1.5">{t.offerings.length ? t.offerings.map((o) => <Badge key={o} tone="brown">{o}</Badge>) : <span className="text-sm text-muted">Not specified</span>}</p></Card>
        <Card><p className="text-xs uppercase tracking-wider text-muted">Observation periods</p><p className="mt-2 text-sm">{t.periods.join(' · ') || 'Not stated'}</p><p className="mt-2 text-xs text-muted">Latest update {fmtDay(t.latestUpdate)}</p></Card>
      </div>

      {t.smallSample && <Alert tone="warn" className="mb-6">{t.smallSample}</Alert>}

      <section className="mb-8" aria-labelledby="conf-h">
        <h2 id="conf-h" className="mb-3 text-xl">Confidence and limitations</h2>
        <Card><ul className="list-disc space-y-1.5 pl-5 text-sm">{t.limitations.map((l) => <li key={l}>{l}</li>)}</ul></Card>
      </section>

      <section className="mb-8" aria-labelledby="trend-h">
        <h2 id="trend-h" className="mb-3 text-xl">Change between periods</h2>
        <Card>
          <p className="text-sm">{t.trend?.text}</p>
          {t.trend && t.trend.rows.length > 0 && (
            <table className="table-basic mt-3"><thead><tr><th>Period</th><th>Organisations</th></tr></thead><tbody>{t.trend.rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.orgs}</td></tr>)}</tbody></table>
          )}
          {t.trend?.note && <p className="mt-2 text-xs text-muted">{t.trend.note}</p>}
        </Card>
      </section>

      {t.duplicates.length > 0 && (
        <Alert tone="info" className="mb-8">
          <strong>Near-duplicate wording detected.</strong> Some observations here read almost the same. They are not treated as extra evidence.
          <ul className="mt-1 list-disc pl-5 text-xs">{t.duplicates.map((d) => <li key={d.aId + d.bId}><Link href={`/learn/feed/${d.aId}`}>{d.aTitle}</Link> and <Link href={`/learn/feed/${d.bId}`}>{d.bTitle}</Link></li>)}</ul>
        </Alert>
      )}

      <section aria-labelledby="ev-h">
        <h2 id="ev-h" className="mb-3 text-xl">Supporting approved observations</h2>
        <div className="grid gap-4 md:grid-cols-2">{t.items.map((i) => <ItemCard key={i.id} item={i} />)}</div>
        <p className="mt-3 text-xs text-muted">Only observations that are currently published are listed. If a contributor withdraws one, it disappears here immediately.</p>
      </section>
    </div>
  );
}
