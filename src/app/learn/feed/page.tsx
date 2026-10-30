import { redirect } from 'next/navigation';
import { requireFeed } from '@/lib/insights/guards';
import { first } from '@/lib/insights/state';

/** /learn/feed is the same view as /learn: keep one canonical URL, preserve the query. */
export default async function FeedRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireFeed('/learn');
  const sp = await searchParams;
  const out = new URLSearchParams();
  for (const k of ['q', 'offering', 'industry', 'region', 'period', 'topic', 'page']) { const v = first(sp[k]); if (v) out.set(k, v); }
  redirect(`/learn${out.size ? `?${out}` : ''}`);
}
