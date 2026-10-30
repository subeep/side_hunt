import Link from 'next/link';
import { Card } from '@/components/ui';
import { getPrincipal } from '@/lib/auth/session';
import { getBannersForPrincipal, listPublicContent } from '@/lib/public/content';
import { listPublicProducts } from '@/lib/public/products';
import { listShowcase } from '@/lib/public/media';
import { listPublicEvents } from '@/lib/public/events';
import { CAPABILITIES, HAPPENING, TRUST } from '@/lib/public/copy';
import { fmtDate } from '@/components/ui';
import { CapIcon, HeroArt, TrustMark } from '@/components/public/Art';
import { BannerStrip, MediaCard, ProductCard, SectionHead } from '@/components/public/Blocks';

export default async function Home() {
  const p = await getPrincipal();
  const [banners, products, showcase, perspectives, events] = await Promise.all([
    getBannersForPrincipal(p),
    listPublicProducts(),
    listShowcase(3),
    listPublicContent('perspective', 2),
    listPublicEvents(),
  ]);
  // The hackathon banner (CTA into /hackathon) leads. EVERY other published, in-window banner the visitor may see is shown too.
  const hackathon = banners.find((b) => b.audienceKind === 'public' && b.ctaHref?.startsWith('/hackathon'));
  const others = banners.filter((b) => b.id !== hackathon?.id);
  const nextEvent = events.upcoming[0];

  return (
    <div className="space-y-20">
      {hackathon && <BannerStrip banner={hackathon} />}
      {others.map((b) => <BannerStrip key={b.id} banner={b} tone="soft" />)}

      <section aria-labelledby="hero" className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <p className="eyebrow mb-3">azentio.ai</p>
          <h1 id="hero" className="text-4xl font-semibold leading-[1.1] md:text-5xl">Intelligence Begins With Imagination.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">Enterprise AI for decisions, documents, agents and analytics, built with the trust, oversight and audit trail regulated industries require.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/products" className="btn btn-primary">Explore products</Link>
            <Link href="/connect" className="btn btn-secondary">Start a conversation</Link>
          </div>
        </div>
        <HeroArt className="mx-auto h-auto w-full max-w-lg" />
      </section>

      <section aria-labelledby="who">
        <SectionHead eyebrow="Who we are" title="Intelligence, Engineered for the Real World." />
        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <p className="text-lg leading-relaxed text-brown-800">AI creates value when it moves beyond experimentation and becomes part of how businesses operate. We build intelligent applications combining domain understanding, advanced AI, intuitive experiences, and enterprise-grade engineering.</p>
          <Card className="bg-brown-50"><p className="font-serif text-lg text-brown-900">Evidence in, decisions out.</p><p className="mt-2 text-sm text-muted">Every recommendation is explainable, reviewable and logged. People stay in charge.</p></Card>
        </div>
      </section>

      <section aria-labelledby="what">
        <SectionHead eyebrow="What we do" title="Intelligence in Every Layer." text="Tap or press a card to see what it covers." />
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
        {products.length === 0 ? <Card>Product information will appear here.</Card> : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{products.map((x) => <li key={x.slug}><ProductCard product={x} /></li>)}</ul>}
      </section>

      <section aria-labelledby="action">
        <SectionHead eyebrow="See intelligence in action" title="Don't Just Imagine What AI Can Do. See It." text="Explore real product experiences, intelligent workflows, and ideas brought to life through engineering. Clips are synthetic demonstrations." action={<Link href="/media" className="btn btn-primary btn-sm">Watch product showcases</Link>} />
        {showcase.length > 0 && <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{showcase.map((m) => <li key={m.id}><MediaCard m={m} /></li>)}</ul>}
      </section>

      <section aria-labelledby="trust" className="rounded-3xl border border-line bg-paper-2 p-6 md:p-10">
        <SectionHead eyebrow="Trust by design" title="Innovation Without Compromising Trust." text="Enterprise AI must be as accountable as it is intelligent." />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST.map((t) => (
            <li key={t.n} className="flex gap-4"><TrustMark n={t.n} className="h-12 w-12 shrink-0" /><div><h3 className="font-serif text-lg text-brown-900">{t.title}</h3><p className="mt-1 text-sm text-muted">{t.text}</p></div></li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="happening">
        <SectionHead eyebrow="What's happening" title="Ideas in Motion." />
        <ul className="grid gap-4 md:grid-cols-3">
          {HAPPENING.map((h) => (
            <li key={h.href}><Card href={h.href} className="h-full"><p className="eyebrow">{h.eyebrow}</p><h3 className="mt-2 text-lg font-semibold leading-snug">{h.title}</h3><p className="mt-2 text-sm text-muted">{h.text}</p>
              {h.href === '/live' && nextEvent && <p className="mt-3 rounded-lg bg-brown-50 px-3 py-2 text-xs text-brown-800">Next: {nextEvent.title}, {fmtDate(nextEvent.startsAt)}</p>}
              {h.href === '/perspectives' && perspectives[0] && <p className="mt-3 rounded-lg bg-brown-50 px-3 py-2 text-xs text-brown-800">Latest: {perspectives[0].title}</p>}
            </Card></li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cta" className="relative overflow-hidden rounded-3xl bg-brown-800 px-6 py-12 text-center text-brown-50 md:px-12">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-10" aria-hidden="true" focusable="false"><defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="#e2cdb0" /></pattern></defs><rect width="100%" height="100%" fill="url(#dots)" /></svg>
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brown-300">Build what&apos;s next</p>
          <h2 id="cta" className="mx-auto mt-2 max-w-2xl text-3xl font-semibold !text-brown-50">The Next Intelligent Idea Starts Here.</h2>
          <p className="mx-auto mt-3 max-w-xl text-brown-100">Explore our products, share a challenge, or collaborate to turn ambitious ideas into working AI solutions.</p>
          <Link href="/connect" className="btn mt-6 bg-brown-50 !text-brown-900 hover:bg-white">Start a conversation</Link>
        </div>
      </section>
    </div>
  );
}
