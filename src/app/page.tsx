import Link from 'next/link';
import { getPrincipal } from '@/lib/auth/session';
import { getBannersForPrincipal } from '@/lib/public/content';
import { listPublicProducts } from '@/lib/public/products';
import { listShowcase } from '@/lib/public/media';
import { CAPABILITIES } from '@/lib/public/copy';
import { CapIcon } from '@/components/public/Art';
import { NeuralNetworkArt } from '@/components/public/NeuralNetworkArt';
import { BannerStrip, MediaCard, ProductCard, SectionHead } from '@/components/public/Blocks';

export default async function Home() {
  const p = await getPrincipal();
  const [banners, products, showcase] = await Promise.all([
    getBannersForPrincipal(p),
    listPublicProducts(),
    listShowcase(3),
  ]);
  // The hackathon banner (CTA into /hackathon) leads. EVERY other published, in-window banner the visitor may see is shown too.
  const hackathon = banners.find((b) => b.audienceKind === 'public' && b.ctaHref?.startsWith('/hackathon'));

  return (
    <div className="space-y-16">
      {hackathon && <BannerStrip banner={hackathon} />}
      
      <section aria-labelledby="hero" className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <p className="eyebrow mb-3">azentio.ai</p>
          <h1 id="hero" className="text-4xl font-semibold leading-[1.1] md:text-5xl">Intelligence Begins With Imagination.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">AI for decisions, documents, agents and analytics, with human oversight and an audit trail built in.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/products" className="btn btn-primary">Explore products</Link>
            <Link href="/learn/aira" className="btn btn-secondary">Ask AIRA</Link>
          </div>
        </div>
        <NeuralNetworkArt className="mx-auto h-auto w-full max-w-lg" />
      </section>

      <section aria-labelledby="what">
        <SectionHead eyebrow="What we do" title="What our AI does." />
        <ul className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <li key={c.title}>
              <details className="card group open:border-brown-300 open:shadow-md">
                <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg [&::-webkit-details-marker]:hidden">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brown-100 text-brown-700"><CapIcon name={c.icon} className="h-6 w-6" /></span>
                  <span className="flex-1"><span className="block font-serif text-lg text-brown-900">{c.title}</span><span className="mt-1 block text-sm text-muted">{c.blurb}</span></span>
                  <span aria-hidden="true" className="mt-1 text-brown-500 transition-transform group-open:rotate-45">+</span>
                </summary>
                <ul className="mt-4 space-y-2 border-t border-line pt-4 text-sm text-brown-800">
                  {c.points.map((x) => <li key={x} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brown-400" />{x}</li>)}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="products">
        <SectionHead eyebrow="Featured products" title="Built to Work. Designed to Evolve." action={<Link href="/products" className="btn btn-ghost btn-sm">All products &rarr;</Link>} />
        {products.length === 0 ? <p className="card">Product information will appear here.</p> : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{products.map((x) => <li key={x.slug}><ProductCard product={x} /></li>)}</ul>}
      </section>

      <section aria-labelledby="action">
        <SectionHead eyebrow="See intelligence in action" title="See it working." text="Synthetic product demos." action={<Link href="/media" className="btn btn-primary btn-sm">All demos</Link>} />
        {showcase.length > 0 && <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{showcase.map((m) => <li key={m.id}><MediaCard m={m} /></li>)}</ul>}
      </section>

      <section aria-labelledby="cta" className="rounded-3xl bg-brown-800 px-6 py-10 text-center text-brown-50">
        <h2 id="cta" className="text-2xl font-semibold !text-brown-50">Have a challenge AI could solve?</h2>
        <p className="mx-auto mt-2 max-w-md text-brown-100">Tell us about it, or sign in to try the sandbox.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/connect" className="btn bg-brown-50 !text-brown-900 hover:bg-white">Start a conversation</Link>
          <Link href="/login" className="btn btn-secondary">Sign in</Link>
        </div>
      </section>
    </div>
  );
}
