import { Alert, Badge, Card } from '@/components/ui';
import { SIMULATED_LABEL, type RunView } from '@/lib/client/sandbox';

const show = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—'));

/** Renders a stored scenario run. Always labelled SIMULATED / SYNTHETIC; never presented as a decision. */
export function RunResult({ run, labels = {} }: { run: RunView; labels?: Record<string, string> }) {
  const o = run.output;
  const sample = Array.isArray(o.sampleData) ? o.sampleData : [];
  const evidence = Array.isArray(o.evidence) ? o.evidence : [];
  const metrics = Array.isArray(o.metrics) ? o.metrics : [];
  return (
    <div className="space-y-5">
      <Alert tone="warn"><strong>SIMULATED.</strong> {SIMULATED_LABEL} The data below is synthetic sample data, and the summary is an illustration, never an approved credit or business decision.</Alert>
      <Card>
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl">Simulated summary</h2><Badge tone="amber">Simulated</Badge><Badge tone="neutral">{o.mode === 'ai-assisted' ? 'AI-assisted' : 'Deterministic'}</Badge></div>
        <p className="mt-3 leading-relaxed">{o.summary ?? 'No summary was produced.'}</p>
        {metrics.length > 0 && (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-xl border border-line bg-paper px-3 py-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{m.label}</dt>
                <dd className="font-serif text-xl text-brown-900">{m.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
      <Card>
        <h2 className="text-xl">Inputs used</h2>
        <div className="mt-2 overflow-x-auto"><table className="table-basic"><tbody>
          {Object.entries(run.inputs).map(([k, v]) => (<tr key={k}><th scope="row" className="!normal-case !tracking-normal">{labels[k] ?? k}</th><td>{show(v)}</td></tr>))}
        </tbody></table></div>
        {run.evidenceNote && (
          <div className="mt-4">
            <p className="label">Your pasted evidence note</p>
            <p className="whitespace-pre-wrap rounded-xl border border-line bg-paper px-3 py-2 text-sm">{run.evidenceNote}</p>
            <p className="hint">Stored with this run as plain text. Visible to you and your organisation&apos;s administrators only. It is not uploaded, shared or used for training.</p>
          </div>
        )}
      </Card>
      {sample.map((d) => (
        <Card key={d.title}>
          <h2 className="text-xl">{d.title}</h2>
          <p className="hint mb-2">Synthetic sample data</p>
          <div className="overflow-x-auto">
            <table className="table-basic">
              <thead><tr>{Object.keys(d.rows[0] ?? {}).map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{d.rows.map((row, i) => (<tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{show(v)}</td>)}</tr>))}</tbody>
            </table>
          </div>
        </Card>
      ))}
      {evidence.length > 0 && (
        <Card>
          <h2 className="text-xl">Evidence</h2>
          <ul className="mt-2 space-y-3">{evidence.map((e) => (<li key={e.title}><p className="font-medium text-brown-900">{e.title}</p><p className="text-sm text-muted">{e.detail}</p></li>))}</ul>
        </Card>
      )}
    </div>
  );
}
