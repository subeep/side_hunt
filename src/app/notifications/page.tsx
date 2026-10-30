import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireUser } from '@/lib/authz/guards';
import { PageHeader, Card, Badge, EmptyState, fmtDate } from '@/components/ui';
import { markAllReadAction } from './actions';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const p = await requireUser('/notifications');
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, p.userId)).orderBy(desc(schema.notifications.createdAt)).limit(100);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Inbox" title="Notifications" description="In-app status updates. These are stored records; an email, where enabled, is shown with its true hand-off status (queued, sent or failed), never as “delivered”." actions={rows.some((r) => !r.readAt) ? <form action={markAllReadAction}><button className="btn btn-secondary btn-sm">Mark all read</button></form> : undefined} />
      {rows.length === 0 ? (
        <EmptyState title="Nothing here yet">Status changes on your contributions and invitations will appear here.</EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((n) => (
            <Card key={n.id} className={n.readAt ? 'opacity-75' : ''}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-brown-900">{n.link ? <Link href={n.link}>{n.title}</Link> : n.title}</p>
                  {n.body && <p className="mt-1 text-sm text-muted">{n.body}</p>}
                  <p className="mt-2 text-xs text-muted">{fmtDate(n.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {!n.readAt && <Badge tone="brown">New</Badge>}
                  {n.emailStatus !== 'none' && <Badge tone={n.emailStatus === 'sent' ? 'sage' : n.emailStatus === 'failed' ? 'clay' : 'amber'}>Email {n.emailStatus}</Badge>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
