import Link from 'next/link';
import { requireGrant } from '@/lib/authz/guards';
import { findDuplicates, listThemes } from '@/lib/insights/themes';
import { searchShared } from '@/lib/insights/search';
import { Alert, Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { ConsoleNav } from '@/components/insights/ConsoleNav';
import { ActionButton } from '@/components/insights/Forms';
import { rebuildThemesAction } from '../actions';

export const metadata = { title: 'Themes (console)' };

export default async function ConsoleThemes() {
  const p = await requireGrant('product_owner');
  const [themes, feed] = await Promise.all([listThemes(p), searchShared(p, { limit: 500 })]);
  const dups = findDuplicates(feed?.items ?? []);
  return (
    <div>
      <ConsoleNav current="/product/themes" />
      <PageHeader eyebrow="Product owner console" title="Themes" description="Themes group approved observations by wording, offering and topic. Rebuilding regenerates the auto-grouped themes only; hand-made themes are never changed." actions={<ActionButton action={rebuildThemesAction} fields={{}} label="Rebuild generated themes" className="btn btn-primary" />} />
      <Alert tone="info" className="mb-6">Generated themes keep their evidence links and their uncertainty. A theme with fewer than the minimum number of organisations shows its observations but never a count.</Alert>
      {(themes ?? []).length === 0 ? <EmptyState title="No themes yet">Rebuild to group the approved observations, or ask for hand-made themes to be seeded.</EmptyState> : (
        <div className="grid gap-4 md:grid-cols-2">
          {themes!.map((t) => (
            <Card key={t.id} href={`/learn/themes/${t.id}`}>
              <div className="mb-2 flex flex-wrap gap-1.5">{t.generated ? <Badge>Auto-grouped</Badge> : <Badge tone="brown">Hand-made</Badge>}<Badge tone={t.confidence.label === 'high' ? 'sage' : t.confidence.label === 'medium' ? 'brown' : 'amber'}>Confidence: {t.confidence.label}</Badge></div>
              <h2 className="text-lg">{t.title}</h2>
              <p className="mt-2 text-sm text-muted">{t.stat.suppressed ? 'Count withheld (small cohort)' : `${t.stat.orgs} distinct organisations`} · {t.items.length} approved item{t.items.length === 1 ? '' : 's'}</p>
              {t.smallSample && <p className="mt-1 text-xs font-medium text-amber">{t.smallSample}</p>}
            </Card>
          ))}
        </div>
      )}
      <section className="mt-10" aria-labelledby="dup-h">
        <h2 id="dup-h" className="mb-3 text-xl">Possible duplicates</h2>
        {dups.length === 0 ? <p className="text-sm text-muted">No near-duplicate wording found among approved observations.</p> : (
          <ul className="space-y-2 text-sm">{dups.map((d) => <li key={d.aId + d.bId} className="card !p-4"><Link href={`/learn/feed/${d.aId}`}>{d.aTitle}</Link> and <Link href={`/learn/feed/${d.bId}`}>{d.bTitle}</Link> <span className="text-xs text-muted">· similarity {d.similarity}</span></li>)}</ul>
        )}
        <p className="mt-2 text-xs text-muted">Near-duplicates are signals for moderators; they never count as extra evidence.</p>
      </section>
    </div>
  );
}
