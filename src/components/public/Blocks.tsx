import Link from 'next/link';
import { AudienceChip, Badge, Card, fmtDay } from '@/components/ui';
import { mediaUrl, fmtDuration, type MediaListItem } from '@/lib/public/media';
import type { Banner, PublicItem } from '@/lib/public/content';
import type { PublicProduct } from '@/lib/public/products';
import { ProductArt } from './Art';

export function BannerStrip({ banner, tone = 'brown' }: { banner: Banner; tone?: 'brown' | 'soft' }) {
  const dark = tone === 'brown';
  return (
    <section aria-label={banner.eyebrow} className={`relative overflow-hidden rounded-2xl border px-6 py-6 md:px-8 ${dark ? 'border-brown-800 bg-brown-800 text-brown-50' : 'border-brown-200 bg-brown-100 text-brown-900'}`}>
      <svg className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 opacity-20" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        {[30, 55, 80, 105].map((r) => <circle key={r} cx="100" cy="100" r={r} fill="none" stroke={dark ? '#e2cdb0' : '#9a6b45'} />)}
      </svg>
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <p className={`text-xs font-bold uppercase tracking-[0.16em] ${dark ? 'text-brown-300' : 'text-brown-600'}`}>{banner.eyebrow}</p>
          <h2 className={`mt-1 text-2xl font-semibold ${dark ? '!text-brown-50' : ''}`}>{banner.title}</h2>
          {banner.summary && <p className={`mt-2 text-[0.95rem] leading-relaxed ${dark ? 'text-brown-100' : 'text-brown-800'}`}>{banner.summary}</p>}
        </div>
        {banner.ctaHref && banner.ctaLabel && (
          <Link href={banner.ctaHref} className={`btn ${dark ? 'bg-brown-50 !text-brown-900 hover:bg-white' : 'btn-primary'}`}>{banner.ctaLabel}</Link>
        )}
      </div>
    </section>
  );
}

export function ProductCard({ product }: { product: PublicProduct }) {
  return (
    <Card href={`/products/${product.slug}`} className="flex h-full flex-col gap-3">
      <ProductArt slug={product.slug} className="h-auto w-full" />
      <p className="eyebrow">{product.category}</p>
      <h3 className="text-lg font-semibold">{product.name}</h3>
      <p className="flex-1 text-sm leading-relaxed text-muted">{product.summary}</p>
      <span className="text-sm font-semibold text-brown-700">View details &rarr;</span>
    </Card>
  );
}

export function MediaCard({ m }: { m: MediaListItem }) {
  return (
    <Card href={`/media/${m.id}`} className="flex h-full flex-col !p-0 overflow-hidden">
      {m.hasPoster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(m.id, 'poster')} alt={`Poster for ${m.title}`} loading="lazy" className="aspect-video w-full bg-brown-100 object-cover" />
      ) : (
        <div className="aspect-video w-full bg-brown-100" aria-hidden="true" />
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <AudienceChip kind={m.audienceKind} />
          {m.durationSec != null && <Badge>{fmtDuration(m.durationSec)}</Badge>}
        </div>
        <h3 className="text-base font-semibold leading-snug">{m.title}</h3>
        {m.description && <p className="text-sm text-muted">{m.description}</p>}
      </div>
    </Card>
  );
}

export function ContentCard({ item, base }: { item: PublicItem; base: '/perspectives' | '/lab' | '/pages' }) {
  return (
    <Card href={`${base}/${item.slug}`} className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {item.audienceKind === 'employees' && <Badge tone="clay">Employees only</Badge>}
        {item.tags.map((t) => <Badge key={t}>{t}</Badge>)}
        {item.publishedAt && <span className="text-xs text-muted">{fmtDay(item.publishedAt)}</span>}
      </div>
      <h3 className="text-lg font-semibold leading-snug">{item.title}</h3>
      {item.summary && <p className="flex-1 text-sm leading-relaxed text-muted">{item.summary}</p>}
      <span className="text-sm font-semibold text-brown-700">Read more &rarr;</span>
    </Card>
  );
}

export function SectionHead({ eyebrow, title, text, action }: { eyebrow: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-2xl">
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h2 className="text-2xl font-semibold md:text-3xl">{title}</h2>
        {text && <p className="mt-2 leading-relaxed text-muted">{text}</p>}
      </div>
      {action}
    </div>
  );
}
