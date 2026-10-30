import { Alert, Badge, Card } from '@/components/ui';
import { PublisherShell } from '@/components/public/PublisherShell';
import { requireAnyPublisher } from '@/lib/public/guards';
import { authorize } from '@/lib/authz';
import { publisherTabsFor } from '@/lib/public/publisher';

export const metadata = { title: 'Publisher console' };

const DESC: Record<string, string> = {
  '/publisher/banners': 'Create, schedule and archive website banners.',
  '/publisher/content': 'Write perspectives, lab posts and pages.',
  '/publisher/media': 'Choose who can watch each video, and publish or unpublish it.',
};

export default async function PublisherHome() {
  const p = await requireAnyPublisher();
  const content = authorize(p, 'content.publish').allow;
  const video = authorize(p, 'video.publish').allow;
  const tabs = publisherTabsFor(p);
  return (
    <PublisherShell p={p} current="/publisher" title="Publish with care" description="Two separate grants control this console. Each tab and each action checks its own grant on the server.">
      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <span>Content publisher: <Badge tone={content ? 'sage' : 'clay'}>{content ? 'granted' : 'not granted'}</Badge></span>
        <span>Video publisher: <Badge tone={video ? 'sage' : 'clay'}>{video ? 'granted' : 'not granted'}</Badge></span>
      </div>
      <ul className="grid gap-4 md:grid-cols-3">{tabs.map((t) => <li key={t.href}><Card href={t.href} className="h-full"><h2 className="text-lg font-semibold">{t.label}</h2><p className="mt-1 text-sm text-muted">{DESC[t.href]}</p></Card></li>)}</ul>
      <Alert tone="info" className="mt-8">
        Publishers manage website content and video audiences only. This console cannot read private learning records, change roles or memberships, or administer identities. Every change here is written to the audit log.
      </Alert>
    </PublisherShell>
  );
}
