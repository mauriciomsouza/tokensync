/** Minimal unified line diff (LCS) used to preview `sync` without writing. */
export function unifiedDiff(path: string, before: string, after: string, context = 2): string {
  const a = before === '' ? [] : before.replace(/\n$/, '').split('\n');
  const b = after.replace(/\n$/, '').split('\n');
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      (lcs[i] as number[])[j] =
        a[i] === b[j] ? (lcs[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(lcs[i + 1]?.[j] ?? 0, lcs[i]?.[j + 1] ?? 0);

  type Op = { t: ' ' | '-' | '+'; s: string };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ t: ' ', s: a[i] as string });
      i++;
      j++;
    } else if (i < n && (j >= m || (lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0))) {
      // Deletions first, so a replaced line reads "- old" then "+ new".
      ops.push({ t: '-', s: a[i] as string });
      i++;
    } else {
      ops.push({ t: '+', s: b[j] as string });
      j++;
    }
  }

  const out = [`--- a/${path}`, `+++ b/${path}`];
  let k = 0;
  while (k < ops.length) {
    if (ops[k]?.t === ' ') {
      k++;
      continue;
    }
    const start = Math.max(0, k - context);
    let end = k;
    while (end < ops.length) {
      if (ops[end]?.t !== ' ') {
        end++;
        continue;
      }
      let run = 0;
      while (ops[end + run]?.t === ' ') run++;
      if (run > context * 2 || end + run >= ops.length) {
        end = Math.min(ops.length, end + context);
        break;
      }
      end += run;
    }
    const hunk = ops.slice(start, end);
    const aLen = hunk.filter((o) => o.t !== '+').length;
    const bLen = hunk.filter((o) => o.t !== '-').length;
    const aStart = ops.slice(0, start).filter((o) => o.t !== '+').length + 1;
    const bStart = ops.slice(0, start).filter((o) => o.t !== '-').length + 1;
    out.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
    for (const o of hunk) out.push(`${o.t}${o.s}`);
    k = end;
  }
  return out.join('\n');
}
