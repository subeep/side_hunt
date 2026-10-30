import Link from 'next/link';
import { Alert, Badge, SubNav, type Tone } from '@/components/ui';
import type { SharedPublic } from '@/lib/learning/columns';
import type { StatDisplay } from '@/lib/insights/aggregation';
import { PRIVACY_NOTE } from '@/lib/insights/aggregation';
import { STATUS_LABEL, type IdeaStatus } from '@/lib/insights/ideas';

export function InsightsNav({ current, owner }: { current: string; owner?: boolean }) {
  return (
    <SubNav
      current={current}
      items={[
        { href: '/learn', label: 'Shared feed' },
        { href: '/learn/themes', label: 'Themes' },
        { href: '/learn/ideas', label: 'Improvement ideas' },
        { href: '/learn/aira', label: 'Ask AIRA' },
        { href: '/learn/saved', label: 'Saved searches' },
        { href: '/learn/bookmarks', label: 'Bookmarks' },
        { href: '/learn/digest', label: 'Digest' },
        { href: '/learn/mine', label: 'My observations' },
        ...(owner ? [{ href: '/product', label: 'Product console' }] : []),
      ]}
    />
  );
}

export const QUALITY_TONE: Record<string, Tone> = { unassessed: 'neutral', weak: 'amber', moderate: 'brown', strong: 'sage' };
export const QUALITY_LABEL: Record<string, string> = { unassessed: 'Quality not yet assessed', weak: 'Weak evidence', moderate: 'Moderate evidence', strong: 'Strong evidence' };
const STATUS_TONE: Record<IdeaStatus, Tone> = { proposed: 'neutral', under_review: 'amber', planned: 'brown', in_progress: 'brown', released: 'sage', not_proceeding: 'clay' };

export const StatusBadge = ({ status }: { status: IdeaStatus }) => <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
export const EvidenceBadge = ({ q }: { q: string }) => <Badge tone={QUALITY_TONE[q] ?? 'neutral'}>{QUALITY_LABEL[q] ?? q}</Badge>;

export function ItemCard({ item }: { item: SharedPublic }) {
  return (
    <Link href={`/learn/feed/${item.id}`} className="card card-link block">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {item.offeringSlug && <Badge tone="brown">{item.offeringSlug}</Badge>}
        {item.topic && <Badge>{item.topic}</Badge>}
        <EvidenceBadge q={item.evidenceQuality} />
      </div>
      <h3 className="text-lg font-semibold leading-snug">{item.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{item.summary}</p>
      <p className="mt-3 text-xs text-muted">{[item.industry, item.region, item.periodLabel].filter(Boolean).join(' · ') || 'Context generalised by a moderator'}</p>
    </Link>
  );
}

/** The safeguarded headline statistic: a number only when it is safe, otherwise the reason it is withheld. */
export function StatBlock({ stat, label = 'in this view' }: { stat: StatDisplay; label?: string }) {
  if (stat.suppressed)
    return (
      <Alert tone="warn">
        <p className="font-semibold">Count withheld</p>
        <p className="mt-1">{stat.reason}</p>
        <p className="mt-1 text-xs">The approved items below are still readable. Statistics are withheld so that no single organisation can be singled out.</p>
      </Alert>
    );
  if (stat.orgs === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
      <span className="font-serif text-xl text-brown-900">{stat.orgs}</span> distinct organisations · <span className="font-serif text-xl text-brown-900">{stat.items}</span> approved items {label}
      <p className="mt-1 text-xs text-muted">{PRIVACY_NOTE}</p>
    </div>
  );
}

export const FeedBanner = () => (
  <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-sage/30 bg-sage-soft px-4 py-2.5 text-sm text-[#3f5834]">
    <Badge tone="sage">Cross-client shared feed</Badge>
    Approved, de-identified observations only. This is not your organisation’s private notes (see <Link href="/learn/org" className="font-semibold">Our organisation</Link>).
  </div>
);
