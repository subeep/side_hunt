import { Card, PageHeader } from '@/components/ui';
import { LeadForm } from '@/components/public/LeadForm';
import { submitDemoAction } from './actions';

export const metadata = { title: 'Start a conversation', description: 'Request a demo or share a challenge with the azentio.ai team.' };

export default function ConnectPage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div>
        <PageHeader eyebrow="Connect" title="The next intelligent idea starts here." description="Request a demo or tell us about a challenge. A person reads every request." />
        <Card><LeadForm kind="demo" action={submitDemoAction} /></Card>
      </div>
      <aside className="space-y-4 lg:pt-28" aria-label="What to expect">
        <Card>
          <h2 className="text-lg font-semibold">What happens next</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>Your request is stored securely and reviewed by our team.</li>
            <li>We reply to the email you give, usually within a few working days.</li>
            <li>We never share your details with other organisations.</li>
          </ol>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Already a client?</h2>
          <p className="mt-2 text-sm text-muted">Sign in to your workspace for entitled demos, sessions and shared learning.</p>
          <a href="/login" className="btn btn-secondary btn-sm mt-3">Sign in</a>
        </Card>
      </aside>
    </div>
  );
}
