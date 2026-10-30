import type { ReactNode } from 'react';
import { Field } from '@/components/ui';
import type { SharedPublic } from '@/lib/learning/columns';
import { EvidenceBadge } from './parts';

export interface IdeaDefaults { title?: string; problem?: string; proposedOutcome?: string; offeringSlug?: string | null; ownerUserId?: string | null; team?: string | null; priority?: string; themeId?: string | null }

/** Fields shared by the create and edit forms (server-rendered; wrap in <InsightsForm>). */
export function IdeaFields({ d = {}, products, owners, themes, candidates, selected, extra }: {
  d?: IdeaDefaults; products: { slug: string; name: string }[]; owners: { id: string; name: string }[]; themes: { id: string; title: string }[];
  candidates: SharedPublic[]; selected: Set<string>; extra?: ReactNode;
}) {
  return (
    <>
      <Field label="Title" htmlFor="title" hint="Plain language. Clients can read this."><input id="title" name="title" className="input" required minLength={8} maxLength={140} defaultValue={d.title} /></Field>
      <Field label="Problem statement" htmlFor="problem"><textarea id="problem" name="problem" className="textarea" required minLength={20} maxLength={1500} defaultValue={d.problem} /></Field>
      <Field label="Proposed outcome" htmlFor="outcome" hint="What would be different for users. Do not promise dates or delivery."><textarea id="outcome" name="proposedOutcome" className="textarea min-h-24" required minLength={10} maxLength={1000} defaultValue={d.proposedOutcome} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Offering" htmlFor="off"><select id="off" name="offeringSlug" className="select" defaultValue={d.offeringSlug ?? ''}><option value="">Not specific</option>{products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></Field>
        <Field label="Theme" htmlFor="thm"><select id="thm" name="themeId" className="select" defaultValue={d.themeId ?? ''}><option value="">None</option>{themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
        <Field label="Owner" htmlFor="own"><select id="own" name="ownerUserId" className="select" defaultValue={d.ownerUserId ?? ''}><option value="">Me</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
        <Field label="Owner team" htmlFor="team"><input id="team" name="team" className="input" maxLength={80} defaultValue={d.team ?? ''} /></Field>
        <Field label="Priority (internal, never shown to clients)" htmlFor="prio"><select id="prio" name="priority" className="select" defaultValue={d.priority ?? 'medium'}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
      </div>
      <fieldset className="rounded-xl border border-line p-3">
        <legend className="label px-1">Supporting contributions</legend>
        <p className="hint mb-2">Only approved observations that are currently published and visible to you can be linked. Repeated posts from one organisation count once as evidence.</p>
        {candidates.length === 0 ? <p className="text-sm text-muted">No approved observations are available to link yet.</p> : (
          <ul className="max-h-72 space-y-1.5 overflow-auto pr-1">
            {candidates.map((c) => (
              <li key={c.id}>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="evidence" value={c.id} defaultChecked={selected.has(c.id)} className="mt-1" />
                  <span>{c.title} <span className="text-xs text-muted">· {[c.offeringSlug, c.periodLabel].filter(Boolean).join(' · ')}</span> <EvidenceBadge q={c.evidenceQuality} /></span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {extra}
    </>
  );
}
