import type { ReactNode } from 'react';

const head = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

/** Plain responsive table for synthetic sample data. */
export function DataTable({ title, rows }: { title?: string; rows: Record<string, string | number>[] }): ReactNode {
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);
  return (
    <div>
      {title && <p className="mb-2 text-sm font-semibold text-brown-800">{title}</p>}
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="table-basic">
          <thead><tr>{cols.map((c) => <th key={c} scope="col">{head(c)}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{String(r[c] ?? '')}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-8 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Playground steps">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === current ? 'step' : undefined} className={`flex items-center gap-2 rounded-full border px-3 py-1 ${i === current ? 'border-brown-700 bg-brown-700 text-white' : i < current ? 'border-brown-300 bg-brown-100 text-brown-800' : 'border-line bg-card text-muted'}`}>
          <span aria-hidden>{i + 1}</span>{s}
        </li>
      ))}
    </ol>
  );
}

export const SYNTHETIC_BANNER = 'SYNTHETIC data and simulated output. Nothing here is a credit, business or regulatory decision.';
