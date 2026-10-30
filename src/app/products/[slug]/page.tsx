import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, PageHeader } from '@/components/ui';
import { MediaCard } from '@/components/public/Blocks';
import { ProductArt } from '@/components/public/Art';
import { getPrincipal } from '@/lib/auth/session';
import { getPublicProduct, productLinks } from '@/lib/public/products';
import { listMediaForPrincipal } from '@/lib/public/media';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getPublicProduct((await params).slug);
  return p ? { title: p.name, description: p.tagline } : { title: 'Product' };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getPublicProduct(slug);
  if (!product) notFound();
  const principal = await getPrincipal();
  const links = productLinks(principal, product.slug);
  // Same audience rule as the gallery: an entitled client also sees that product's entitled demo; anonymous sees public clips only.
  const videos = await listMediaForPrincipal(principal, { productSlug: product.slug, limit: 6 });
  return (
    <div className="space-y-10">
      <PageHeader eyebrow={product.category} title={product.name} description={product.summary}
        actions={<>
          {links.sandbox && <Link href="/client/sandbox" className="btn btn-primary">Open in your sandbox</Link>}
          {links.playground && <Link href="/employee/playground" className="btn btn-primary">Open in the Playground</Link>}
          <Link href="/connect" className="btn btn-secondary">Request a demo</Link>
        </>} />
      {links.needsWorkspace && <Alert tone="info">Choose an active workspace from the header to see whether your organisation is entitled to this product.</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <p className="font-serif text-xl text-brown-900">{product.tagline}</p>
            {product.capabilities.length > 0 && <><h2 className="mt-5 text-lg font-semibold">What it does</h2><ul className="mt-2 space-y-2 text-sm">{product.capabilities.map((c) => <li key={c} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brown-400" />{c}</li>)}</ul></>}
          </Card>
          {product.workflow.length > 0 && (
            <Card><h2 className="text-lg font-semibold">How a session flows</h2><ol className="mt-3 space-y-3">{product.workflow.map((w, i) => <li key={w} className="flex items-center gap-3 text-sm"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brown-700 text-xs font-semibold text-brown-50">{i + 1}</span>{w}</li>)}</ol></Card>
          )}
        </div>
        <ProductArt slug={product.slug} className="h-auto w-full self-start" />
      </div>
      <section aria-labelledby="vids">
        <h2 id="vids" className="mb-4 text-2xl font-semibold">Watch</h2>
        {videos.length === 0 ? <Card className="text-sm text-muted">No videos are available for this product yet.</Card> : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{videos.map((m) => <li key={m.id}><MediaCard m={m} /></li>)}</ul>}
      </section>
      <p className="text-xs text-muted">Demonstrations use synthetic data. Sample outputs are illustrations, not credit or business decisions.</p>
    </div>
  );
}
