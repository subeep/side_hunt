/** Transcript text is stored as lines "mm:ss text". */
export function parseTranscript(text: string | null | undefined): { t: number; text: string }[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((l) => /^(\d{1,2}):(\d{2})\s+(.+)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ t: Number(m[1]) * 60 + Number(m[2]), text: m[3] }));
}
