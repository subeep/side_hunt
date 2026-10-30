import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, AudienceChip, Badge, Card, fmtDate, PageHeader } from '@/components/ui';
import { EmployeeNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { AudienceFields, SessionFields } from '@/components/employee/SessionForm';
import { requireEmployee } from '@/lib/authz/guards';
import { canConfigure, getSession, listAttachableVideos } from '@/lib/employee/live';
import { db, schema } from '@/db';
import { attachAction, audienceAction, detachAction, updateSessionAction } from '../actions';

export const metadata = { title: 'Session' };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireEmployee();
  const e = await getSession(p, (await params).id);
  if (!e) notFound();
  const manage = canConfigure(p);
  const [videos, products] = manage ? await Promise.all([listAttachableVideos(p), db.select({ slug: schema.products.slug, name: schema.products.name }).from(schema.products)]) : [[], []];
  return (
    <div>
      <PageHeader eyebrow="Internal live session" title={e.title} description={e.description ?? undefined} actions={<Link href="/employee/live" className="btn btn-secondary btn-sm">All sessions</Link>} />
      <EmployeeNav current="/employee/live" />
      <div className="mb-6 flex flex-wrap gap-2"><AudienceChip kind={e.audienceKind} /><Badge tone="neutral">{e.kind.replace('_', ' ')}</Badge><Badge tone={e.status === 'live' ? 'sage' : 'neutral'}>{e.status}</Badge></div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg">When</h2>
          <p className="text-sm">{fmtDate(e.startsAt)}{e.endsAt ? ` to ${fmtDate(e.endsAt)}` : ''}</p>
          <h2 className="mb-2 mt-5 text-lg">How to join</h2>
          <p className="text-sm text-muted">{e.joinInfo ?? 'Join details have not been added yet.'}</p>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg">Recording</h2>
          {e.recordingMediaId ? (
            <>
              <p className="mb-3 text-sm text-muted">Served only through the authorising media route for your audience.</p>
              <a className="btn btn-primary btn-sm" href={`/api/media/${encodeURIComponent(e.recordingMediaId)}`} target="_blank" rel="noopener noreferrer">Open recording</a>
            </>
          ) : <p className="text-sm text-muted">No recording is attached to this session.</p>}
        </Card>
      </div>

      {!manage ? (
        <Alert tone="info" className="mt-8">Read-only: only users with the video_publisher grant can change sessions, recordings or audiences. Direct requests to change them are rejected and audited.</Alert>
      ) : (
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="card" aria-labelledby="edit"><h2 id="edit" className="mb-4 text-lg">Edit session</h2>
            <ActionForm action={updateSessionAction} submit="Save changes"><input type="hidden" name="id" value={e.id} /><SessionFields e={e} withStatus /></ActionForm>
          </section>
          <div className="space-y-6">
            <section className="card" aria-labelledby="aud"><h2 id="aud" className="mb-4 text-lg">Audience</h2>
              <ActionForm action={audienceAction} submit="Set audience"><input type="hidden" name="id" value={e.id} /><AudienceFields kind={e.audienceKind} product={e.audienceProduct} products={products} /></ActionForm>
              <p className="hint mt-2">An attached recording always takes the session&apos;s audience, so it is never wider than the session.</p>
            </section>
            <section className="card" aria-labelledby="rec"><h2 id="rec" className="mb-4 text-lg">Recording</h2>
              <ActionForm action={attachAction} submit="Attach recording">
                <input type="hidden" name="id" value={e.id} />
                <label className="label" htmlFor="mediaId">Video</label>
                <select id="mediaId" name="mediaId" className="select" required defaultValue={e.recordingMediaId ?? ''}>
                  <option value="" disabled>Choose a video…</option>
                  {videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
                </select>
              </ActionForm>
              {e.recordingMediaId && <div className="mt-3"><ActionForm action={detachAction} submit="Detach recording" variant="secondary" confirmText="Detach this recording from the session?"><input type="hidden" name="id" value={e.id} /></ActionForm></div>}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
