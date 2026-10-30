import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, AudienceChip, Badge, Card, PageHeader, fmtDate } from '@/components/ui';
import { requireClientAccepted } from '@/lib/client/guard';
import { getSession } from '@/lib/client/sessions';

export const metadata = { title: 'Session' };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireClientAccepted();
  const { id } = await params;
  const s = await getSession(p, id); // audience re-checked for this object id; otherwise 404 + audit
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader eyebrow={s.kind === 'briefing' ? 'Briefing' : s.kind === 'webinar' ? 'Webinar' : 'Live session'} title={s.title} description={s.description ?? undefined} actions={<Link href="/client/sessions" className="btn btn-secondary btn-sm">All sessions</Link>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2"><AudienceChip kind={s.audienceKind} orgName={p.activeOrgName} />{s.audienceKind === 'org' && <Badge tone="brown">Invitation-only</Badge>}<Badge tone={s.status === 'cancelled' ? 'clay' : 'neutral'}>{s.status}</Badge></div>
        <p className="mt-3 text-sm">{fmtDate(s.startsAt)}{s.endsAt ? ` to ${fmtDate(s.endsAt)}` : ''}</p>
      </Card>
      {s.joinInfo ? (
        <Card><h2 className="text-lg">How to join</h2><p className="mt-2 break-words font-mono text-sm">{s.joinInfo}</p><p className="hint mt-2">Shared with your workspace only. Please do not forward it.</p></Card>
      ) : s.status === 'cancelled' ? (
        <Alert tone="warn">This session was cancelled.</Alert>
      ) : s.status === 'ended' ? (
        <Alert tone="info">This session has ended. Joining details are no longer shown.</Alert>
      ) : (
        <Alert tone="info">Joining details will be added closer to the start.</Alert>
      )}
      {s.recordingUrl && <Card><h2 className="text-lg">Recording</h2><a className="mt-2 inline-block font-semibold" href={s.recordingUrl} target="_blank" rel="noopener">Open recording ↗</a><p className="hint mt-1">Served only to people the recording&apos;s audience permits.</p></Card>}
    </div>
  );
}
