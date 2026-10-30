import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireGrant } from '@/lib/authz/guards';
import { ALLOWED_TRANSITIONS, getIdeaForPrincipal, listOwnerCandidates, STATUS_DISCLAIMER, STATUS_LABEL } from '@/lib/insights/ideas';
import { normaliseQuery, searchShared } from '@/lib/insights/search';
import { first } from '@/lib/insights/state';
import { getVisibleSharedMany } from '@/lib/insights/visibility';
import { Alert, Card, Field, fmtDate, PageHeader } from '@/components/ui';
import { ConsoleNav } from '@/components/insights/ConsoleNav';
import { IdeaFields } from '@/components/insights/IdeaForm';
import { InsightsForm } from '@/components/insights/Forms';
import { StatusBadge } from '@/components/insights/parts';
import { changeStatusAction, postUpdateAction, updateIdeaAction } from '../../actions';

export const metadata = { title: 'Manage idea' };

export default async function ManageIdea({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const p = await requireGrant('product_owner');
  const sp = await searchParams;
  const idea = await getIdeaForPrincipal(p, id);
  if (!idea?.internal) notFound();
  const [row] = await db.select().from(schema.ideas).where(eq(schema.ideas.id, id));
  const q = normaliseQuery(first(sp.q));
  const [products, owners, themes, found, linked] = await Promise.all([
    db.select({ slug: schema.products.slug, name: schema.products.name }).from(schema.products),
    listOwnerCandidates(p),
    db.select({ id: schema.themes.id, title: schema.themes.title }).from(schema.themes).where(eq(schema.themes.status, 'active')),
    searchShared(p, { q, limit: 40 }),
    getVisibleSharedMany(p, idea.internal.evidenceIds),
  ]);
  const candidates = [...linked, ...(found?.items ?? []).filter((c) => !linked.some((l) => l.id === c.id))];
  const hidden = idea.internal.evidenceIds.length - linked.length;
  const next = ALLOWED_TRANSITIONS[idea.status];
  return (
    <div className="mx-auto max-w-4xl">
      <ConsoleNav current="/product" />
      <Link href="/product" className="mb-4 inline-block text-sm">← All ideas</Link>
      <PageHeader eyebrow="Product owner console" title={idea.title} actions={<><StatusBadge status={idea.status} /><Link className="btn btn-secondary btn-sm" href={`/learn/ideas/${id}`}>See what clients see</Link></>} />
      <Alert tone="info" className="mb-6">{STATUS_DISCLAIMER}</Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg">Change status</h2>
          {next.length === 0 ? <p className="text-sm text-muted">“{STATUS_LABEL[idea.status]}” is final. Create a new idea if the work reopens.</p> : (
            <InsightsForm action={changeStatusAction} submitLabel="Change status" pendingText="Saving…">
              <input type="hidden" name="ideaId" value={id} />
              <Field label="New status" htmlFor="st"><select id="st" name="status" className="select" required>{next.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></Field>
              <Field label="Message for clients (optional)" hint="Plain language, no dates, ticket numbers, client names or internal planning. A safe default is used if empty." htmlFor="msg"><textarea id="msg" name="message" className="textarea min-h-20" maxLength={600} /></Field>
              <Field label="Internal note (never shown to clients)" htmlFor="note"><textarea id="note" name="note" className="textarea min-h-16" maxLength={500} /></Field>
            </InsightsForm>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-lg">Post an update</h2>
          <InsightsForm action={postUpdateAction} submitLabel="Post update" pendingText="Posting…">
            <input type="hidden" name="ideaId" value={id} />
            <Field label="Update for clients" hint="Audience-appropriate: describe the theme and the decision. Not a delivery promise." htmlFor="um"><textarea id="um" name="message" className="textarea min-h-24" required minLength={10} maxLength={600} /></Field>
          </InsightsForm>
          {idea.updates.length > 0 && <div className="mt-4 border-t border-line pt-3"><p className="label">Latest posted</p><p className="text-sm">{idea.updates[0].message}</p></div>}
        </Card>
      </div>

      <section className="mt-8" aria-labelledby="edit-h">
        <h2 id="edit-h" className="mb-3 text-xl">Edit idea and evidence</h2>
        <form method="get" className="mb-4 flex gap-2" role="search"><input className="input" name="q" defaultValue={q} placeholder="Filter the evidence list, e.g. seasonal" aria-label="Filter evidence" /><button className="btn btn-secondary">Filter evidence</button></form>
        {hidden > 0 && <Alert tone="warn" className="mb-4">{hidden} linked observation{hidden > 1 ? 's are' : ' is'} no longer published and {hidden > 1 ? 'are' : 'is'} hidden from clients. Saving this form removes {hidden > 1 ? 'them' : 'it'} from the idea.</Alert>}
        <InsightsForm action={updateIdeaAction} submitLabel="Save changes" pendingText="Saving…">
          <input type="hidden" name="ideaId" value={id} />
          <IdeaFields d={{ title: idea.title, problem: idea.problem, proposedOutcome: idea.proposedOutcome, offeringSlug: row.offeringSlug, ownerUserId: row.ownerUserId, team: row.team, priority: row.priority, themeId: row.themeId }} products={products} owners={owners} themes={themes} candidates={candidates} selected={new Set(linked.map((l) => l.id))} />
        </InsightsForm>
      </section>

      <section className="mt-8" aria-labelledby="hist-h">
        <h2 id="hist-h" className="mb-3 text-xl">Status history (internal)</h2>
        <div className="card overflow-x-auto !p-0"><table className="table-basic min-w-[32rem]"><thead><tr><th>When</th><th>Change</th><th>Internal note</th></tr></thead><tbody>
          {idea.internal.history.map((h, n) => <tr key={n}><td>{fmtDate(h.at)}</td><td>{h.from ? `${STATUS_LABEL[h.from as keyof typeof STATUS_LABEL]} → ` : ''}{STATUS_LABEL[h.to as keyof typeof STATUS_LABEL]}</td><td>{h.note ?? '—'}</td></tr>)}
        </tbody></table></div>
      </section>
    </div>
  );
}
