import { Card, PageHeader } from '@/components/ui';
import { LeadForm } from '@/components/public/LeadForm';
import { getPublicBanners } from '@/lib/public/content';
import { BannerStrip } from '@/components/public/Blocks';
import { submitHackathonAction } from './actions';

export const metadata = { title: 'Register hackathon interest', description: 'Register your interest in the upcoming azentio.ai hackathon.' };

export default async function HackathonRegisterPage() {
  const banner = (await getPublicBanners()).find((b) => /hackathon/i.test(b.eyebrow + b.title));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Hackathon" title="Register your interest" description="Dates and participation details are still to be announced. Register and we will tell you first." />
      {banner && <div className="mb-6"><BannerStrip banner={{ ...banner, ctaHref: null, ctaLabel: null }} tone="soft" /></div>}
      <Card><LeadForm kind="hackathon" action={submitHackathonAction} /></Card>
    </div>
  );
}
