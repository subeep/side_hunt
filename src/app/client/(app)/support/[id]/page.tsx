import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, Card, PageHeader, fmtDate } from '@/components/ui';
import { ActionForm } from '@/components/client/ActionForm';
import { requireClientAccepted } from '@/lib/client/guard';
import { getTicket, SIMULATED_SUPPORT_NOTE } from '@/lib/client/support';
import { closeTicketAction } from '../actions';

export const metadata = { title: 'Ticket' };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireClientAccepted();
  const { id } = await params;
  const t = await getTicket(p, id); // org + (author or this org's administrator); anything else is a 404 + audit
  if (!t) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader eyebrow="Support ticket" title={t.subject} description={`Raised ${fmtDate(t.createdAt)}${t.userId === p.userId ? '' : ` by ${t.userName ?? 'a colleague'}`}`} actions={<Link href="/client/support" className="btn btn-secondary btn-sm">All tickets</Link>} />
      <Card>
        <Badge tone={t.status === 'closed' ? 'sage' : t.status === 'pending' ? 'brown' : 'amber'}>{t.status}</Badge>
        <p className="mt-3 whitespace-pre-wrap leading-relaxed">{t.body}</p>
      </Card>
      <Alert tone="info">{SIMULATED_SUPPORT_NOTE}</Alert>
      {t.status !== 'closed' && <ActionForm action={closeTicketAction} submit="Close ticket" buttonClass="btn-secondary" confirm="Close this ticket?"><input type="hidden" name="id" value={t.id} /></ActionForm>}
    </div>
  );
}
