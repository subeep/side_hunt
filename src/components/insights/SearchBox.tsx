'use client';
import { useEffect, useId, useRef, useState } from 'react';

/** Search input with type-ahead from /api/learn/suggest (server applies the same visibility rules). Works without JS as a plain GET form. */
export function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const id = useId();
  const [opts, setOpts] = useState<string[]>([]);
  const [q, setQ] = useState(defaultValue);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) { setOpts([]); return; }
    const ac = new AbortController();
    t.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/learn/suggest?q=${encodeURIComponent(q.trim())}`, { signal: ac.signal });
        if (r.ok) setOpts(((await r.json()) as { suggestions: { text: string }[] }).suggestions.map((s) => s.text));
      } catch { /* suggestions are optional */ }
    }, 200);
    return () => { clearTimeout(t.current); ac.abort(); };
  }, [q]);
  return (
    <>
      <input className="input" type="search" name="q" value={q} onChange={(e) => setQ(e.target.value)} list={`${id}-l`} placeholder="Search approved observations, e.g. seasonal cash flow" aria-label="Search approved observations" maxLength={200} autoComplete="off" />
      <datalist id={`${id}-l`}>{opts.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}
