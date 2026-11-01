import pc from 'picocolors';
import type { Rgba } from '../core/types.js';
import type { Change, DriftResult, ModeDiff, TargetDiff } from '../core/types.js';
import { displayValue } from '../core/value.js';
import { KIND_LABEL, modeLabel, multiMode, summaryLine } from './shared.js';

export interface TerminalOptions {
  /** Draw truecolor swatches. Default: auto (COLORTERM=truecolor/24bit). */
  truecolor?: boolean;
  /** Disable all color. */
  color?: boolean;
  width?: number;
}

type Colors = ReturnType<typeof pc.createColors>;

const ANSI = /\u001b\[[0-9;]*m/g;
const visibleLength = (s: string): number => [...s.replace(ANSI, '')].length;
const pad = (s: string, n: number): string => s + ' '.repeat(Math.max(0, n - visibleLength(s)));
const truncate = (s: string, n: number): string => (visibleLength(s) <= n ? s : `${[...s].slice(0, n - 1).join('')}…`);

function swatch(c: Rgba | undefined, enabled: boolean): string {
  if (!c || !enabled) return '';
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `\u001b[48;2;${r};${g};${b}m  \u001b[0m `;
}

function value(d: ModeDiff, side: 'figma' | 'code', tc: boolean): string {
  const v = d[side];
  if (!v) return '—';
  const sw = v.value.type === 'color' ? swatch(v.value.color, tc) : '';
  return sw + displayValue(v.value);
}

function deltaText(c: Change, d: ModeDiff, k: Colors): string {
  if (d.deltaE !== undefined) {
    const t = `ΔE ${d.deltaE.toFixed(1)}`;
    return d.deltaE >= 10 ? k.red(t) : k.yellow(t);
  }
  const f = d.figma?.value;
  const o = d.code?.value;
  if (f?.type === 'dimension' && o?.type === 'dimension') {
    const n = Math.round((f.px - o.px) * 100) / 100;
    return k.yellow(`${n > 0 ? '+' : ''}${n}px`);
  }
  return k.dim(c.type);
}

function targetBlock(t: TargetDiff, k: Colors, tc: boolean, width: number): string[] {
  const out: string[] = [];
  const n = t.changes.length;
  const status = n === 0 ? k.green('in sync') : k.yellow(`${n} difference${n === 1 ? '' : 's'}`);
  const modes = multiMode(t) ? k.dim(` · ${t.modes.join(' / ')}`) : '';
  out.push(`  ${k.bold(t.target)} ${k.dim(t.format)}${modes}  ${status}`);
  if (n === 0) return [...out, ''];

  const nameW = Math.min(34, Math.max(12, ...t.changes.map((c) => visibleLength(c.name))));
  const modeW = multiMode(t) ? Math.max(4, ...t.modes.map((m) => m.length)) : 0;
  const valW = Math.max(14, Math.min(26, Math.floor((width - nameW - modeW - 24) / 2)));

  for (const kind of ['changed', 'added', 'removed'] as const) {
    const rows = t.changes.filter((c) => c.kind === kind);
    if (rows.length === 0) continue;
    const color = kind === 'changed' ? k.yellow : kind === 'added' ? k.blue : k.red;
    const sign = kind === 'changed' ? '~' : kind === 'added' ? '+' : '-';
    out.push('', `  ${color('■')} ${k.bold(KIND_LABEL[kind])} ${k.dim(`(${rows.length})`)}`);
    for (const c of rows) {
      c.modes.forEach((d, i) => {
        const name = pad(i === 0 ? truncate(c.name, nameW) : '', nameW);
        const mode = modeW ? `${pad(k.dim(modeLabel(d.mode)), modeW)}  ` : '';
        let line: string;
        if (kind === 'changed') {
          line = `${pad(k.dim(value(d, 'code', tc)), valW)} ${k.dim('→')} ${pad(value(d, 'figma', tc), valW)} ${deltaText(c, d, k)}`;
        } else {
          line = value(d, kind === 'added' ? 'figma' : 'code', tc);
        }
        out.push(`    ${color(i === 0 ? sign : ' ')} ${name}  ${mode}${line}`);
      });
    }
  }
  for (const note of t.notes) out.push(`    ${k.yellow('!')} ${k.dim(note)}`);
  out.push('');
  return out;
}

export function renderTerminal(result: DriftResult, opts: TerminalOptions = {}): string {
  const enabled = opts.color ?? pc.isColorSupported;
  const k = pc.createColors(enabled);
  const env = typeof process !== 'undefined' ? process.env : {};
  const tc = enabled && (opts.truecolor ?? /truecolor|24bit/i.test(env.COLORTERM ?? ''));
  const width = opts.width ?? 100;
  const drift = result.summary.total > 0;

  const out: string[] = [''];
  out.push(`  ${k.bold('tokensync')} ${k.dim('·')} ${result.project}`, '');
  for (const t of result.targets) out.push(...targetBlock(t, k, tc, width));
  const line = summaryLine(result);
  out.push(
    drift
      ? `  ${k.yellow('◐')} ${k.bold('Drift detected')} ${k.dim('—')} ${line}`
      : `  ${k.green('●')} ${k.bold(line)}`,
  );
  if (drift)
    out.push(
      k.dim(
        `    Run ${k.reset('tokensync sync --write')} to update code from Figma, or ${k.reset('tokensync report')} for a visual diff.`,
      ),
    );
  out.push('');
  return out.join('\n');
}
