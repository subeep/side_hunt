import { EmptyState, PageHeader } from '@/components/ui';
import { ProductCard } from '@/components/public/Blocks';
import { listPublicProducts } from '@/lib/public/products';

export const metadata = { title: 'Products', description: 'Built to work. Designed to evolve.' };

export default async function ProductsPage() {
  const products = await listPublicProducts();
  return (
    <div>
      <PageHeader eyebrow="Products" title="Built to Work. Designed to Evolve." description="Public product information. Entitled clients and employees get guided, synthetic-data demos after signing in." />
      {products.length === 0 ? <EmptyState title="No products to show yet">Product information will appear here once published.</EmptyState> : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{products.map((p) => <li key={p.slug}><ProductCard product={p} /></li>)}</ul>}
    </div>
  );
}
