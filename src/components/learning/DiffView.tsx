import clsx from 'clsx';
import { wordDiff } from '@/lib/learning/diff';

export function DiffView({ original, shared }: { original: string; shared: string }) {
  const d = wordDiff(original, shared);
  const part = (kind: string) => clsx(kind === 'removed' && 'bg-clay-soft text-clay line-through decoration-clay/60', kind === 'added' && 'bg-sage-soft text-[#3f5834]');
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <p className="eyebrow mb-1">Original (private)</p>
        <p className="whitespace-pre-wrap rounded-lg border border-line bg-paper-2/60 p-3 text-sm leading-relaxed">
          {d.original.map((x, i) => <span key={i} className={part(x.kind)}>{x.text}</span>)}
        </p>
      </div>
      <div>
        <p className="eyebrow mb-1">Shared (what the community would see)</p>
        <p className="whitespace-pre-wrap rounded-lg border border-line bg-card p-3 text-sm leading-relaxed">
          {d.shared.map((x, i) => <span key={i} className={part(x.kind)}>{x.text}</span>)}
        </p>
      </div>
    </div>
  );
}
