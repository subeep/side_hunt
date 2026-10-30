import Link from 'next/link';
import { Alert, EmptyState, PageHeader } from '@/components/ui';
import { MediaCard } from '@/components/public/Blocks';
import { getPrincipal } from '@/lib/auth/session';
import { listMediaForPrincipal } from '@/lib/public/media';
import { listPublicProducts } from '@/lib/public/products';
import { isSlug } from '@/lib/public/links';

export const metadata = { title: 'Media', description: 'Product showcases and recordings.' };

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product: raw } = await searchParams;
  const product = isSlug(raw) ? raw : undefined;
  const p = await getPrincipal();
  const [items, products] = await Promise.all([listMediaForPrincipal(p, { productSlug: product }), listPublicProducts()]);
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-sm font-medium no-underline ${active ? 'border-brown-700 bg-brown-700 text-brown-50' : 'border-brown-200 bg-card text-brown-700 hover:bg-brown-100'}`;
  return (
    <div>
      <PageHeader eyebrow="Media" title="See intelligence in action." description="Product showcases and recordings. All clips are synthetic demonstrations generated for this environment." />
      <Alert tone="info" className="mb-6">
        {p ? <>Showing the media <strong>your account</strong> is permitted to see. Each item shows who it is for; access is checked on the server for every request.</> : <>You are browsing as a public visitor, so only public videos are listed. <Link href="/login" className="font-semibold">Sign in</Link> if you are a client or employee.</>}
      </Alert>
      <nav aria-label="Filter by product" className="mb-6 flex flex-wrap gap-2">
        <Link href="/media" className={chip(!product)} aria-current={!product ? 'true' : undefined}>All</Link>
        {products.map((x) => <Link key={x.slug} href={`/media?product=${x.slug}`} className={chip(product === x.slug)} aria-current={product === x.slug ? 'true' : undefined}>{x.name}</Link>)}
      </nav>
      {items.length === 0 ? <EmptyState title="No media to show" action={product ? <Link href="/media" className="btn btn-secondary btn-sm">Clear filter</Link> : undefined}>There are no videos available to you{product ? ' for this product' : ''} right now.</EmptyState>
        : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((m) => <li key={m.id}><MediaCard m={m} /></li>)}</ul>}
    </div>
  );
}
