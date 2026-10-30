import Link from 'next/link';
import { requireFeed } from '@/lib/insights/guards';
import { listThemes } from '@/lib/insights/themes';
import { Alert, Badge, Card, EmptyState, fmtDay, PageHeader } from '@/components/ui';
import { InsightsNav } from '@/components/insights/parts';
import { THEME_DISCLAIMER } from '@/lib/insights/themes';

export const metadata = { title: 'Themes' };
const TONE = { low: 'amber', medium: 'brown', high: 'sage' } as const;

export default async function ThemesPage() {
  const p = await requireFeed('/learn/themes');
  const themes = (await listThemes(p)) ?? [];
  return (
    <div>
      <InsightsNav current="/learn/themes" owner={p.grants.has('product_owner')} />
      <PageHeader eyebrow="Collective learning" title="Themes" description="Recurring topics grouped from approved observations, with the evidence, its limits and when it last changed. Counts are in distinct organisations and appear only where that is safe." />
      <Alert tone="info" className="mb-6">{THEME_DISCLAIMER}</Alert>
      {themes.length === 0 ? (
        <EmptyState title="No themes yet">Themes appear once there are approved observations to group. Each theme links back to the evidence it is built on.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {themes.map((t) => (
            <Card key={t.id} href={`/learn/themes/${t.id}`}>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {t.offerings.map((o) => <Badge key={o} tone="brown">{o}</Badge>)}
                <Badge tone={TONE[t.confidence.label]}>Confidence: {t.confidence.label}</Badge>
                {t.generated && <Badge>Auto-grouped</Badge>}
              </div>
              <h2 className="text-xl">{t.title}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-muted">{t.summary}</p>
              <p className="mt-3 text-sm">
                {t.stat.suppressed ? <span className="text-amber">Count withheld (small cohort)</span> : <><strong>{t.stat.orgs}</strong> distinct organisations</>}
                {' · '}{t.periods.length ? t.periods.join(', ') : 'period not stated'}
              </p>
              {t.smallSample && <p className="mt-2 text-xs font-medium text-amber">{t.smallSample}</p>}
              <p className="mt-2 text-xs text-muted">Latest update {fmtDay(t.latestUpdate)}</p>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-6 text-sm"><Link href="/learn">Browse the underlying observations</Link></p>
    </div>
  );
}
