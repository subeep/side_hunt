import Link from 'next/link';
import { Alert, Badge, Card, EmptyState, Field, PageHeader, fmtDate } from '@/components/ui';
import { ActionForm } from '@/components/client/ActionForm';
import { requireClientAccepted } from '@/lib/client/guard';
import { listTickets, SIMULATED_SUPPORT_NOTE } from '@/lib/client/support';
import { createTicketAction } from './actions';

export const metadata = { title: 'Support' };
const TICKET_TONE = { open: 'amber', pending: 'brown', closed: 'sage' } as const;

export default async function SupportPage() {
  const p = await requireClientAccepted();
  const tickets = await listTickets(p);
  const admin = p.activeOrgRole === 'client_admin';
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Support" title="Support tickets" description={admin ? `As an administrator you can see every ticket raised by ${p.activeOrgName}.` : 'You see the tickets you raised. Administrators of your organisation can also read them.'} />
      <Alert tone="info">{SIMULATED_SUPPORT_NOTE}</Alert>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="t-h">
          <h2 id="t-h" className="mb-3 text-2xl">{admin ? 'Organisation tickets' : 'My tickets'}</h2>
          {tickets.length === 0 ? (
            <EmptyState title="No tickets yet">Raise a ticket for access questions, product help or anything blocked. Please never include customer data or credentials.</EmptyState>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => (
                <Card key={t.id} href={`/client/support/${t.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium text-brown-900">{t.subject}</p><Badge tone={TICKET_TONE[t.status]}>{t.status}</Badge></div>
                  <p className="mt-1 text-sm text-muted">{fmtDate(t.createdAt)}{admin && t.userName ? ` · ${t.userName}` : ''}</p>
                </Card>
              ))}
            </div>
          )}
        </section>
        <aside>
          <Card>
            <h2 className="text-xl">Raise a ticket</h2>
            <ActionForm action={createTicketAction} submit="Raise ticket" pendingText="Sending…" className="mt-3 space-y-3">
              <Field label="Subject" htmlFor="subject"><input id="subject" name="subject" required minLength={3} maxLength={120} className="input" /></Field>
              <Field label="What do you need?" htmlFor="body" hint="10 to 2000 characters. No customer data or credentials."><textarea id="body" name="body" required minLength={10} maxLength={2000} className="textarea" /></Field>
            </ActionForm>
          </Card>
          <p className="mt-3 text-sm"><Link href="/client/resources">Looking for guides and release notes?</Link></p>
        </aside>
      </div>
    </div>
  );
}
