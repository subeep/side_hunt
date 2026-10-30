import Link from 'next/link';
import { requireFeed } from '@/lib/insights/guards';
import { buildDigest, DIGEST_EMAIL_NOTE, getDigestSub, latestDigestEmail } from '@/lib/insights/engage';
import { Alert, Badge, Card, EmptyState, Field, fmtDate, PageHeader } from '@/components/ui';
import { InsightsNav, ItemCard, StatBlock, StatusBadge } from '@/components/insights/parts';
import { ActionButton, InsightsForm } from '@/components/insights/Forms';
import { digestAction, queueDigestAction } from '../feed/actions';

export const metadata = { title: 'Digest' };

export default async function DigestPage() {
  const p = await requireFeed('/learn/digest');
  const [sub, d, mail] = await Promise.all([getDigestSub(p), buildDigest(p), latestDigestEmail(p)]);
  return (
    <div>
      <InsightsNav current="/learn/digest" owner={p.grants.has('product_owner')} />
      <PageHeader eyebrow="Stay informed" title="Learning digest" description="A short summary of what is new and what changed among the approved observations, themes and ideas you can see." />
      <Alert tone="info" className="mb-6">{DIGEST_EMAIL_NOTE}</Alert>
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <aside className="space-y-4">
          <Card>
            <h2 className="mb-3 text-lg">Subscription</h2>
            <InsightsForm action={digestAction} submitLabel="Save preferences">
              <Field label="Frequency" htmlFor="freq">
                <select id="freq" name="frequency" className="select" defaultValue={sub?.frequency ?? 'off'}>
                  <option value="off">Off</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                </select>
              </Field>
              <Field label="Topics (optional, comma separated)" hint="Leave empty for everything you can see." htmlFor="tp">
                <input id="tp" name="topics" className="input" defaultValue={(sub?.topics ?? []).join(', ')} maxLength={300} />
              </Field>
            </InsightsForm>
          </Card>
          <Card>
            <h2 className="mb-2 text-lg">Email</h2>
            <p className="mb-3 text-sm text-muted">Store a copy of this preview for your own address.</p>
            <ActionButton action={queueDigestAction} fields={{}} label="Queue preview email to me" />
            <p className="mt-3 text-xs text-muted">{mail ? <>Latest: <Badge tone={mail.status === 'sent' ? 'sage' : mail.status === 'failed' ? 'clay' : 'amber'}>{mail.status}</Badge> on {fmtDate(mail.createdAt)} ({mail.status === 'queued' ? 'stored, not sent' : mail.status === 'sent' ? 'handed to the provider; delivery not confirmed' : 'not sent'})</> : 'Nothing queued yet.'}</p>
          </Card>
        </aside>

        <div className="space-y-6">
          <p className="text-sm text-muted">Preview since {fmtDate(d?.since)} · frequency: <strong>{sub?.frequency ?? 'off'}</strong></p>
          {d && (
            <>
              <section aria-labelledby="new-h">
                <h2 id="new-h" className="mb-3 text-xl">New approved observations</h2>
                {d.newItems.length === 0 ? <EmptyState title="Nothing new in this period">When new observations are approved they will be listed here.</EmptyState> : (
                  <><div className="mb-3"><StatBlock stat={d.stat} label="in this period" /></div><div className="grid gap-4 md:grid-cols-2">{d.newItems.map((i) => <ItemCard key={i.id} item={i} />)}</div></>
                )}
              </section>
              <section aria-labelledby="tr-h">
                <h2 id="tr-h" className="mb-3 text-xl">Trend change</h2>
                <Card><p className="text-sm">{d.trend.text}</p>{d.trend.note && <p className="mt-2 text-xs text-muted">{d.trend.note}</p>}</Card>
              </section>
              <section aria-labelledby="th-h">
                <h2 id="th-h" className="mb-3 text-xl">Theme updates</h2>
                {d.themes.length === 0 ? <p className="text-sm text-muted">No themes changed in this period.</p> : <ul className="space-y-1 text-sm">{d.themes.map((t) => <li key={t.id}><Link href={`/learn/themes/${t.id}`}>{t.title}</Link></li>)}</ul>}
              </section>
              <section aria-labelledby="id-h">
                <h2 id="id-h" className="mb-3 text-xl">Idea updates</h2>
                {d.ideas.length === 0 ? <p className="text-sm text-muted">No idea updates in this period.</p> : <ul className="space-y-2 text-sm">{d.ideas.map((i) => <li key={i.id}><Link href={`/learn/ideas/${i.id}`}>{i.title}</Link> <StatusBadge status={i.status} /></li>)}</ul>}
                <p className="mt-2 text-xs text-muted">Status is not a delivery promise.</p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
