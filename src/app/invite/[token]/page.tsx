import Link from 'next/link';
import { Alert, Card, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/client/ActionForm';
import { TermsText } from '@/components/client/TermsText';
import { getPrincipal } from '@/lib/auth/session';
import { resolveInvite } from '@/lib/client/invite';
import { logoutAction } from '@/lib/auth/actions';
import { acceptInviteAction } from './actions';

export const metadata = { title: 'Workspace invitation' };
const ROLE: Record<string, string> = { client_member: 'Member', client_admin: 'Administrator' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await getPrincipal();
  const v = await resolveInvite(token, p);

  if (v.state === 'invalid')
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader eyebrow="Invitation" title="This invitation is invalid or has expired" description="Invitations are single-use and expire after 7 days. It may also have been revoked or already used. Ask the administrator of your organisation to send a new one." />
        <Link className="btn btn-secondary" href="/">Back to home</Link>
      </div>
    );

  if (v.state === 'anonymous')
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader eyebrow="Invitation" title={`You're invited to ${v.orgName}`} description={`You have been invited to join the ${v.orgName} workspace on azentio.ai as ${ROLE[v.role] ?? v.role}.`} />
        <Card className="space-y-4">
          <p className="text-sm">To accept, sign in with <strong>the email address this invitation was sent to</strong>. We email a one-time code to confirm it is you. An invitation can only be accepted by the person it was issued to, and only once.</p>
          <Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to continue</Link>
          <p className="hint">Not expecting this? Ignore it: nothing happens unless you sign in and accept.</p>
        </Card>
      </div>
    );

  if (v.state === 'wrong_email')
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader eyebrow="Invitation" title="This invitation is for a different account" description="You are signed in with an email address that this invitation was not issued to, so it cannot be accepted from here." />
        <Alert tone="danger">No membership was created. Sign out and sign in with the invited address, or ask your administrator to invite the address you use.</Alert>
        <form action={logoutAction} className="mt-4"><button className="btn btn-secondary" type="submit">Sign out</button></form>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Invitation" title={`Join ${v.orgName}`} description={`You are invited as ${ROLE[v.role] ?? v.role}. Review the workspace terms and the learning-sharing explanation, then accept.`} />
      <Card><TermsText orgName={v.orgName} /></Card>
      <Card>
        <ActionForm action={acceptInviteAction} submit={`Accept and join ${v.orgName}`} pendingText="Joining…">
          <input type="hidden" name="token" value={token} />
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="ack" required className="mt-1 h-4 w-4 accent-[var(--color-brown-700)]" />
            <span>I have read the workspace terms and the learning-sharing explanation. I understand that joining {v.orgName} is <strong>not</strong> consent to share or train, and that I will be asked separately for each contribution.</span>
          </label>
        </ActionForm>
      </Card>
    </div>
  );
}
