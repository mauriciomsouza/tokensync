import type { Change, DriftResult, ModeDiff, TargetDiff } from '../core/types.js';
import { displayValue } from '../core/value.js';
import { KIND_LABEL, modeLabel, multiMode, summaryLine } from './shared.js';

/** Hidden marker used by the GitHub Action to find and update its own comment. */
export const COMMENT_MARKER = '<!-- tokensync:report -->';

export interface MarkdownOptions {
  /** Link to the full HTML report, e.g. a workflow artifact. */
  reportUrl?: string;
  /** Max rows per table before collapsing the rest. Default 50. */
  maxRows?: number;
  /** Include the sticky-comment marker. Default true. */
  marker?: boolean;
}

const md = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (s: string): string => `\`${s.replace(/`/g, "'")}\``;

function cell(d: ModeDiff, side: 'figma' | 'code'): string {
  const v = d[side];
  if (!v) return '—';
  const shown = code(displayValue(v.value));
  return v.alias ? `${shown} <sub>→ ${md(v.alias)}</sub>` : shown;
}

function delta(c: Change, d: ModeDiff): string {
  if (d.deltaE !== undefined) return `ΔE ${d.deltaE.toFixed(1)}`;
  const f = d.figma?.value;
  const k = d.code?.value;
  if (f?.type === 'dimension' && k?.type === 'dimension') {
    const n = Math.round((f.px - k.px) * 100) / 100;
    return `${n > 0 ? '+' : ''}${n}px`;
  }
  return c.type;
}

function table(t: TargetDiff, kind: Change['kind'], max: number): string[] {
  const rows = t.changes.filter((c) => c.kind === kind);
  if (rows.length === 0) return [];
  const showMode = multiMode(t);
  const head =
    kind === 'changed'
      ? ['Token', ...(showMode ? ['Mode'] : []), 'Code (now)', 'Figma (expected)', 'Δ']
      : kind === 'added'
        ? ['Token', ...(showMode ? ['Mode'] : []), 'Figma value']
        : ['Token', ...(showMode ? ['Mode'] : []), 'Code value'];
  const lines: string[] = [];
  const body: string[] = [];
  for (const c of rows) {
    c.modes.forEach((d, i) => {
      const name = i === 0 ? code(c.name) : '';
      const mode = showMode ? [modeLabel(d.mode)] : [];
      if (kind === 'changed')
        body.push(`| ${[name, ...mode, cell(d, 'code'), cell(d, 'figma'), delta(c, d)].join(' | ')} |`);
      else if (kind === 'added') body.push(`| ${[name, ...mode, cell(d, 'figma')].join(' | ')} |`);
      else body.push(`| ${[name, ...mode, cell(d, 'code')].join(' | ')} |`);
    });
  }
  const header = [
    `| ${head.join(' | ')} |`,
    `| ${head.map((h, i) => (i === 0 ? ':--' : h === 'Δ' ? '--:' : ':--')).join(' | ')} |`,
  ];
  const title = `**${KIND_LABEL[kind]}** (${rows.length})`;
  if (body.length <= max) {
    lines.push(title, '', ...header, ...body, '');
  } else {
    lines.push(title, '', ...header, ...body.slice(0, max), '');
    lines.push(
      `<details><summary>${body.length - max} more rows</summary>`,
      '',
      ...header,
      ...body.slice(max),
      '',
      '</details>',
      '',
    );
  }
  return lines;
}

export function renderMarkdown(result: DriftResult, opts: MarkdownOptions = {}): string {
  const max = opts.maxRows ?? 50;
  const out: string[] = [];
  if (opts.marker !== false) out.push(COMMENT_MARKER);
  const drift = result.summary.total > 0;
  out.push(`### ${drift ? '◐' : '●'} tokensync · ${md(result.project)}`, '');
  out.push(drift ? `**Design tokens drifted from Figma.** ${summaryLine(result)}.` : `**${summaryLine(result)}**`, '');

  if (drift) {
    out.push('| Target | Changed | Missing in code | Not in Figma | In sync |', '| :-- | --: | --: | --: | --: |');
    for (const t of result.targets) {
      const n = (k: Change['kind']): number => t.changes.filter((c) => c.kind === k).length;
      out.push(
        `| ${code(t.target)} <sub>${t.format}</sub> | ${n('changed')} | ${n('added')} | ${n('removed')} | ${t.inSync} |`,
      );
    }
    out.push('');
  }

  for (const t of result.targets) {
    if (t.changes.length === 0 && t.notes.length === 0) continue;
    const modes = multiMode(t) ? ` · modes: ${t.modes.join(', ')}` : '';
    out.push(`<details${result.targets.length === 1 ? ' open' : ''}>`);
    out.push(
      `<summary><b>${md(t.target)}</b> — ${t.changes.length} difference${t.changes.length === 1 ? '' : 's'}${modes}</summary>`,
      '',
    );
    out.push(...table(t, 'changed', max), ...table(t, 'added', max), ...table(t, 'removed', max));
    for (const n of t.notes) out.push(`> ${md(n)}`, '');
    out.push('</details>', '');
  }

  const foot = [`Colors compared with CIEDE2000; differences under ΔE ${result.threshold} are ignored.`];
  if (drift) foot.push('Run `npx tokensync sync --write` to update code from Figma.');
  if (opts.reportUrl) foot.push(`[Open the visual report](${opts.reportUrl}).`);
  out.push(`<sub>${foot.join(' ')}</sub>`, '');
  return out.join('\n');
}
