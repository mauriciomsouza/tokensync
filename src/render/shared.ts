import type { Change, DriftResult, ModeDiff, TargetDiff } from '../core/types.js';
import { displayValue } from '../core/value.js';

export const KIND_LABEL: Record<Change['kind'], string> = {
  changed: 'Changed',
  added: 'Missing in code',
  removed: 'Not in Figma',
};

/** Short verb used in compact listings. */
export const KIND_SIGN: Record<Change['kind'], string> = { changed: '~', added: '+', removed: '−' };

export function valueText(d: ModeDiff, side: 'figma' | 'code'): string {
  const v = d[side];
  if (!v) return '—';
  const shown = displayValue(v.value);
  return v.alias ? `${shown} ← ${v.alias}` : shown;
}

export function modeLabel(mode: string): string {
  return mode === '*' ? 'all' : mode;
}

export function summaryLine(result: DriftResult): string {
  const { changed, added, removed, inSync } = result.summary;
  if (result.summary.total === 0) return `In sync: ${inSync} token${inSync === 1 ? '' : 's'} match Figma.`;
  const parts = [
    changed && `${changed} changed`,
    added && `${added} missing in code`,
    removed && `${removed} not in Figma`,
  ].filter(Boolean);
  return `${parts.join(', ')} · ${inSync} in sync`;
}

export function multiMode(t: TargetDiff): boolean {
  return t.modes.length > 1;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
