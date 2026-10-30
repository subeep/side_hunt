/** Tiny word-level diff (LCS). Pure, client-safe. Used for the moderator's original-vs-shared comparison. */
export interface DiffPart {
  text: string;
  kind: 'same' | 'removed' | 'added';
}

const tokens = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];

export function wordDiff(a: string, b: string): { original: DiffPart[]; shared: DiffPart[] } {
  const A = tokens(a).slice(0, 1500);
  const B = tokens(b).slice(0, 1500);
  const dp: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const original: DiffPart[] = [];
  const shared: DiffPart[] = [];
  const push = (arr: DiffPart[], text: string, kind: DiffPart['kind']) => {
    const last = arr[arr.length - 1];
    if (last && last.kind === kind) last.text += text;
    else arr.push({ text, kind });
  };
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { push(original, A[i], 'same'); push(shared, B[j], 'same'); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push(original, A[i++], 'removed');
    else push(shared, B[j++], 'added');
  }
  while (i < A.length) push(original, A[i++], 'removed');
  while (j < B.length) push(shared, B[j++], 'added');
  return { original, shared };
}
