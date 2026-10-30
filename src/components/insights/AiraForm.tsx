'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { askAiraAction, type AiraState } from '@/app/learn/aira/actions';
import { Alert, Badge } from '@/components/ui';
import { SubmitButton } from '@/components/ui/SubmitButton';

export function AiraForm({ canPortal }: { canPortal: boolean }) {
  const [state, action] = useActionState(askAiraAction, {} as AiraState);
  const r = state.result;
  return (
    <div className="space-y-6">
      <form action={action} className="card space-y-4">
        <div>
          <label className="label" htmlFor="q">Your question</label>
          <textarea id="q" name="question" className="textarea min-h-24" required minLength={3} maxLength={500} defaultValue={state.question} placeholder="e.g. What are organisations saying about seasonal cash flow?" />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="label">Where should AIRA look?</legend>
          <label className="flex items-start gap-2 text-sm"><input type="radio" name="scope" value="portal" defaultChecked={canPortal && state.scope !== 'public'} disabled={!canPortal} className="mt-1" /> <span><strong>Approved community observations</strong> (shared feed){!canPortal && ' (not available to your account)'}</span></label>
          <label className="flex items-start gap-2 text-sm"><input type="radio" name="scope" value="public" defaultChecked={!canPortal || state.scope === 'public'} className="mt-1" /> <span><strong>Public website content</strong> (products, pages, media titles)</span></label>
        </fieldset>
        <SubmitButton pendingText="Searching approved sources…">Ask AIRA</SubmitButton>
      </form>

      {state.error && <Alert tone="danger">{state.error}</Alert>}

      {r && (
        <section className="card space-y-4" aria-live="polite" aria-labelledby="ans-h">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="ans-h" className="text-xl">Answer</h2>
            <Badge tone={r.mode === 'model' ? 'brown' : 'neutral'}>{r.mode === 'model' ? 'AI-assisted summary, citation-checked' : 'Plain extract of approved text'}</Badge>
          </div>
          {r.sentences.length === 0 ? (
            <p className="text-sm text-muted">{r.notes[0] ?? 'No approved sources matched this question.'}</p>
          ) : (
            <p className="leading-relaxed">
              {r.sentences.map((s, n) => (
                <span key={n}>{s.text}{/[.!?]$/.test(s.text) ? '' : '.'} {s.cites.map((c) => <sup key={c} className="mr-1 font-semibold text-brown-700">[{c}]</sup>)} </span>
              ))}
            </p>
          )}
          {r.notes.length > 0 && r.sentences.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-muted">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

          {r.cohort && (
            r.cohort.suppressed
              ? <Alert tone="warn"><strong>Organisation count withheld.</strong> {r.cohort.reason}</Alert>
              : <p className="text-sm"><strong>{r.cohort.orgs}</strong> distinct organisations contributed to the cited observations.</p>
          )}
          {r.smallSample && <Alert tone="warn">{r.smallSample}</Alert>}

          {r.sources.length > 0 && (
            <div>
              <h3 className="mb-2 text-base">Sources</h3>
              <ul className="space-y-2 text-sm">
                {r.sources.map((s) => (
                  <li key={s.ref}><span className="font-semibold text-brown-700">[{s.ref}]</span> {s.href ? <Link href={s.href}>{s.title}</Link> : s.title}{s.meta && <span className="text-xs text-muted"> · {s.meta}</span>}</li>
                ))}
              </ul>
            </div>
          )}
          <Alert tone="info">{r.statement} Popularity is not market prevalence or proof of causation.</Alert>
        </section>
      )}
    </div>
  );
}
