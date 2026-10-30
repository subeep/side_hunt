import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui';
import { BannerStrip } from '@/components/public/Blocks';
import { getPublicBanners } from '@/lib/public/content';
import { HACKATHON_TRACKS } from '@/lib/public/lead-schema';

export const metadata = { title: 'Hackathon', description: 'Build, experiment, and collaborate at the upcoming azentio.ai hackathon.' };

export default async function HackathonPage() {
  const banner = (await getPublicBanners()).find((b) => /hackathon/i.test(b.eyebrow + b.title));
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Hackathon" title="Your next idea. Our next breakthrough." description="Build, experiment, and collaborate with the azentio.ai team. Dates and participation details will be announced to those who register interest." actions={<Link href="/hackathon/register" className="btn btn-primary">Register interest</Link>} />
      {banner && <BannerStrip banner={banner} tone="soft" />}
      <section aria-labelledby="tracks"><h2 id="tracks" className="mb-3 text-xl font-semibold">Possible areas to build in</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{HACKATHON_TRACKS.map((t) => <li key={t}><Card className="!py-4 text-sm font-medium">{t}</Card></li>)}</ul>
        <p className="mt-3 text-sm text-muted">Areas are indicative and may change. Nothing here is a commitment on dates, prizes or eligibility.</p>
      </section>
    </div>
  );
}
