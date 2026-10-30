import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Alert, Card, PageHeader, fmtDate } from '@/components/ui';
import { ActionForm } from '@/components/client/ActionForm';
import { TermsText } from '@/components/client/TermsText';
import { requireClient } from '@/lib/authz/guards';
import { CURRENT_TERMS_VERSION } from '@/lib/client/terms';
import { acceptTermsAction } from './actions';

export const metadata = { title: 'Workspace terms' };

export default async function TermsPage() {
  const p = await requireClient();
  const [acc] = await db
    .select({ at: schema.termsAcceptances.acceptedAt })
    .from(schema.termsAcceptances)
    .where(and(eq(schema.termsAcceptances.userId, p.userId), eq(schema.termsAcceptances.orgId, p.activeOrgId), eq(schema.termsAcceptances.termsVersion, CURRENT_TERMS_VERSION)));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Workspace terms" title={`Terms for ${p.activeOrgName}`} description="Read how this workspace works and what sharing means before you continue. Terms are recorded per person and per workspace." />
      <Card><TermsText orgName={p.activeOrgName!} /></Card>
      <div className="mt-6">
        {acc ? (
          <Alert tone="ok">You acknowledged version {CURRENT_TERMS_VERSION} on {fmtDate(acc.at)}. <Link href="/client" className="font-semibold">Continue to your dashboard</Link>.</Alert>
        ) : (
          <Card>
            <ActionForm action={acceptTermsAction} submit="Accept and continue" pendingText="Saving…">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="ack" required className="mt-1 h-4 w-4 accent-[var(--color-brown-700)]" />
                <span>I have read the workspace terms and the learning-sharing explanation. I understand that joining this workspace is <strong>not</strong> consent to share or train, and that I will be asked separately for each contribution.</span>
              </label>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
