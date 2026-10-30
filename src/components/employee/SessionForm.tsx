import { Field } from '@/components/ui';
import { SESSION_AUDIENCES, type EventRow } from '@/lib/employee/live';

const iso = (d?: Date | null) => (d ? d.toISOString().slice(0, 16) : '');
const AUD_LABEL: Record<string, string> = { employees: 'Employees only', public: 'Public', product: 'Clients entitled to a product' };

export function AudienceFields({ kind, product, products }: { kind?: string | null; product?: string | null; products: { slug: string; name: string }[] }) {
  return (
    <>
      <Field label="Audience" htmlFor="audience">
        <select id="audience" name="audience" defaultValue={kind ?? 'employees'} className="select">
          {SESSION_AUDIENCES.map((a) => <option key={a} value={a}>{AUD_LABEL[a]}</option>)}
        </select>
      </Field>
      <Field label="Product (only for the entitled-clients audience)" htmlFor="product">
        <select id="product" name="product" defaultValue={product ?? ''} className="select">
          <option value="">Not applicable</option>
          {products.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
        </select>
      </Field>
    </>
  );
}

/** Shared create/edit fields for a session. Times are entered and stored as UTC. */
export function SessionFields({ e, withStatus }: { e?: EventRow; withStatus?: boolean }) {
  return (
    <>
      <Field label="Title" htmlFor="title"><input id="title" name="title" className="input" defaultValue={e?.title} required minLength={3} maxLength={140} /></Field>
      <Field label="Description" htmlFor="description"><textarea id="description" name="description" className="textarea !min-h-20" defaultValue={e?.description ?? ''} maxLength={1000} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="kind">
          <select id="kind" name="kind" className="select" defaultValue={e?.kind ?? 'live'}>
            <option value="live">Live session</option><option value="webinar">Webinar</option><option value="briefing">Briefing</option><option value="hackathon_session">Hackathon session</option>
          </select>
        </Field>
        {withStatus && (
          <Field label="Status" htmlFor="status">
            <select id="status" name="status" className="select" defaultValue={e?.status ?? 'scheduled'}>
              <option value="scheduled">Scheduled</option><option value="live">Live now</option><option value="ended">Ended</option><option value="cancelled">Cancelled</option>
            </select>
          </Field>
        )}
        <Field label="Starts (UTC)" htmlFor="startsAt"><input id="startsAt" name="startsAt" type="datetime-local" className="input" defaultValue={iso(e?.startsAt)} required /></Field>
        <Field label="Ends (UTC, optional)" htmlFor="endsAt"><input id="endsAt" name="endsAt" type="datetime-local" className="input" defaultValue={iso(e?.endsAt)} /></Field>
      </div>
      <Field label="Join info" htmlFor="joinInfo" hint="Shown only to people the audience permits."><input id="joinInfo" name="joinInfo" className="input" defaultValue={e?.joinInfo ?? ''} maxLength={300} /></Field>
    </>
  );
}
