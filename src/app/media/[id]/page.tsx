import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, AudienceChip, Badge } from '@/components/ui';
import { DemoPlayer } from '@/components/public/DemoPlayer';
import { getPrincipal } from '@/lib/auth/session';
import { getMediaDetailForPrincipal } from '@/lib/public/media';
import { parseTranscript } from '@/lib/public/transcript';
import { PRODUCT_LABEL } from '@/lib/public/lead-schema';

export const metadata = { title: 'Media player' };

export default async function MediaPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Direct object-id access: null (missing, wrong audience, draft for non-publishers, no audience metadata) => 404, never a hint.
  const m = await getMediaDetailForPrincipal(id, await getPrincipal());
  if (!m || m.kind !== 'video') notFound();
  const productName = m.productSlug ? PRODUCT_LABEL[m.productSlug as keyof typeof PRODUCT_LABEL] : undefined;
  return (
    <article className="mx-auto max-w-4xl">
      <p className="mb-3 text-sm"><Link href="/media">&larr; All media</Link></p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AudienceChip kind={m.audienceKind} />
        <Badge tone="amber">Synthetic demo</Badge>
        {productName && <Link href={`/products/${m.productSlug}`} className="badge badge-neutral no-underline">{productName}</Link>}
      </div>
      <h1 className="text-3xl font-semibold leading-tight">{m.title}</h1>
      {m.description && <p className="mt-2 text-muted">{m.description}</p>}
      {m.status === 'draft' && <Alert tone="warn" className="mt-4">Draft preview. This item is not published and is visible only to accounts holding the video publisher grant.</Alert>}
      <div className="mt-6">
        <DemoPlayer id={m.id} title={m.title} durationSec={m.durationSec ?? 60} hasPoster={m.hasPoster} chapters={m.chapters} transcript={parseTranscript(m.transcript)} />
      </div>
    </article>
  );
}
