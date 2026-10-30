import { FLAG_LABELS, highlightSegments, type SensitiveFlag } from '@/lib/learning/sensitive';
import { SCAN_DISCLAIMER } from '@/lib/learning/constants';
import { Alert } from '@/components/ui';

/** Text with likely-sensitive spans highlighted (moderator view / author preview). */
export function SensitiveText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">
      {highlightSegments(text).map((s, i) =>
        s.type ? (
          <mark key={i} className="rounded bg-amber-soft px-0.5 text-ink underline decoration-clay decoration-wavy underline-offset-2" title={FLAG_LABELS[s.type] ?? s.type}>{s.text}</mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

export function FlagList({ flags, title = 'Possibly sensitive content found' }: { flags: SensitiveFlag[]; title?: string }) {
  if (!flags.length) return null;
  return (
    <Alert tone="warn">
      <p className="font-semibold">{title} ({flags.length})</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {flags.map((f, i) => (
          <li key={i}><span className="font-medium">{FLAG_LABELS[f.type] ?? f.type}</span> in {f.field}: <code className="rounded bg-white/70 px-1">{f.excerpt}</code></li>
        ))}
      </ul>
      <p className="mt-2 text-xs">{SCAN_DISCLAIMER}</p>
    </Alert>
  );
}
