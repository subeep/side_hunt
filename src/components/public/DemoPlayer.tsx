'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui';
import { fmtDuration } from '@/lib/public/media-format';

interface Props {
  id: string;
  title: string;
  durationSec: number;
  hasPoster: boolean;
  chapters: { t: number; title: string }[];
  transcript: { t: number; text: string }[];
}

/**
 * Accessible player for SYNTHETIC demo clips. The "video" is a generated, looping SVG animation served through the
 * authorising media route; playback position is simulated (there is no audio track). Controls, chapters and the
 * transcript are all keyboard-operable and the full transcript is always visible as text.
 */
export function DemoPlayer({ id, title, durationSec, hasPoster, chapters, transcript }: Props) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setTime((t) => {
        if (t + 0.25 >= durationSec) {
          setPlaying(false);
          return durationSec;
        }
        return t + 0.25;
      });
    }, 250);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, durationSec]);

  const seek = (t: number, play = true) => {
    setTime(Math.max(0, Math.min(durationSec, t)));
    if (play) setPlaying(true);
  };
  const toggle = () => {
    if (!playing && time >= durationSec) setTime(0);
    setPlaying((p) => !p);
  };
  const t = Math.floor(time);
  const activeChapter = [...chapters].reverse().find((c) => c.t <= t);
  const activeLine = [...transcript].reverse().find((l) => l.t <= t);
  const src = `/api/media/${encodeURIComponent(id)}`;
  const stage = playing || !hasPoster ? src : `${src}?variant=poster`;

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-brown-800 bg-brown-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={stage} alt={`${title}: synthetic demo animation${playing ? ' (playing)' : ''}`} className="aspect-video w-full object-cover" />
        <div className="flex flex-wrap items-center gap-3 bg-brown-900 px-4 py-3 text-brown-50">
          <button type="button" onClick={toggle} aria-pressed={playing} className="btn btn-sm bg-brown-50 !text-brown-900 hover:bg-white">
            {playing ? 'Pause' : time >= durationSec ? 'Replay' : 'Play'}
          </button>
          <span className="font-mono text-xs tabular-nums" aria-hidden="true">{fmtDuration(t)} / {fmtDuration(durationSec)}</span>
          <input type="range" min={0} max={durationSec} step={1} value={t} onChange={(e) => seek(Number(e.target.value), false)} aria-label="Seek" aria-valuetext={`${fmtDuration(t)} of ${fmtDuration(durationSec)}`} className="min-w-32 flex-1 accent-brown-300" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Synthetic demo: a generated animation with simulated playback. No real product footage, audio or client data.</p>

      {chapters.length > 0 && (
        <section className="mt-6" aria-labelledby="chapters-h">
          <h2 id="chapters-h" className="text-lg font-semibold">Chapters</h2>
          <ol className="mt-2 grid gap-2 sm:grid-cols-2">
            {chapters.map((c) => (
              <li key={c.t}>
                <button type="button" onClick={() => seek(c.t)} aria-current={activeChapter?.t === c.t ? 'true' : undefined} className="flex w-full items-center gap-3 rounded-lg border border-line bg-card px-3 py-2 text-left text-sm hover:border-brown-300 aria-[current=true]:border-brown-500 aria-[current=true]:bg-brown-50">
                  <span className="font-mono text-xs text-brown-600">{fmtDuration(c.t)}</span>
                  <span className="font-medium">{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-6" aria-labelledby="transcript-h">
        <h2 id="transcript-h" className="text-lg font-semibold">Transcript</h2>
        {transcript.length === 0 ? (
          <Alert tone="info" className="mt-2">No transcript is available for this item.</Alert>
        ) : (
          <ol className="mt-2 space-y-1 text-sm">
            {transcript.map((l) => (
              <li key={l.t}>
                <button type="button" onClick={() => seek(l.t, false)} aria-current={activeLine?.t === l.t ? 'true' : undefined} className="flex w-full gap-3 rounded-md px-2 py-1.5 text-left hover:bg-brown-100 aria-[current=true]:bg-brown-100">
                  <span className="font-mono text-xs text-brown-600">{fmtDuration(l.t)}</span>
                  <span>{l.text}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
