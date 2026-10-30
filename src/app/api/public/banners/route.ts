import { NextResponse } from 'next/server';
import { getPublicBanners } from '@/lib/public/content';

/** Public, unauthenticated: only published banners with audience 'public' inside their window (never per-user content). */
export async function GET() {
  const banners = await getPublicBanners();
  return NextResponse.json(
    { banners: banners.map(({ id, title, summary, eyebrow, ctaLabel, ctaHref, startsAt, endsAt }) => ({ id, title, summary, eyebrow, ctaLabel, ctaHref, startsAt, endsAt })) },
    { headers: { 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' } },
  );
}
