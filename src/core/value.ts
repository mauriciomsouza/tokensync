import { colorDistance, colorSyntaxOf, formatColor, parseColor, toHex, type ColorSyntax } from './color.js';
import type { TokenValue } from './types.js';

export interface ParseOptions {
  /** Pixels per rem/em. Default 16. */
  remBase?: number;
}

/** Infers a token value from a raw string as found in CSS or Tailwind. */
export function parseLiteral(raw: string, opts: ParseOptions = {}): TokenValue {
  const s = raw.trim();
  const color = parseColor(s);
  if (color) return { type: 'color', color };

  const dim = /^(-?\d*\.?\d+)(px|rem|em)$/.exec(s);
  if (dim?.[1] && dim[2]) {
    const n = parseFloat(dim[1]);
    return { type: 'dimension', px: dim[2] === 'px' ? n : n * (opts.remBase ?? 16) };
  }
  if (/^-?\d*\.?\d+$/.test(s)) return { type: 'number', value: parseFloat(s) };
  if (s === 'true' || s === 'false') return { type: 'boolean', value: s === 'true' };
  return { type: 'string', value: s };
}

const trimNumber = (n: number): string => String(Math.round(n * 1000) / 1000);

export interface FormatHints {
  colorSyntax?: ColorSyntax;
  /** Unit used for dimensions. */
  unit?: 'px' | 'rem';
  remBase?: number;
}

/** Hints taken from an existing value so a rewrite keeps the author's style. */
export function hintsFrom(raw: string | undefined, remBase = 16): FormatHints {
  if (!raw) return { remBase };
  const s = raw.trim();
  return {
    colorSyntax: colorSyntaxOf(s),
    unit: /rem$/.test(s) ? 'rem' : 'px',
    remBase,
  };
}

/** Serializes a value the way CSS / Tailwind expect it. */
export function formatLiteral(v: TokenValue, hints: FormatHints = {}): string {
  switch (v.type) {
    case 'color':
      return formatColor(v.color, hints.colorSyntax ?? 'hex');
    case 'dimension':
      if (v.px === 0) return '0';
      if (hints.unit === 'rem') return `${trimNumber(v.px / (hints.remBase ?? 16))}rem`;
      return `${trimNumber(v.px)}px`;
    case 'number':
      return trimNumber(v.value);
    case 'boolean':
      return String(v.value);
    case 'string':
      return v.value;
  }
}

/** Short, stable label for humans (reports, tables). */
export function displayValue(v: TokenValue): string {
  switch (v.type) {
    case 'color':
      return toHex(v.color);
    case 'dimension':
      return `${trimNumber(v.px)}px`;
    case 'number':
      return trimNumber(v.value);
    case 'boolean':
      return String(v.value);
    case 'string':
      return v.value;
  }
}

const numeric = (v: TokenValue): number | undefined =>
  v.type === 'dimension' ? v.px : v.type === 'number' ? v.value : undefined;

const normalizeString = (s: string): string =>
  s
    .replace(/["']/g, '')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export interface Comparison {
  equal: boolean;
  /** True when the values are not identical but fall within the tolerance. */
  withinTolerance: boolean;
  deltaE?: number;
}

/**
 * Compares two values. Colors are compared perceptually with CIEDE2000;
 * alpha is compared separately because ΔE ignores it.
 */
export function compareValues(a: TokenValue, b: TokenValue, threshold: number): Comparison {
  if (a.type === 'color' && b.type === 'color') {
    const deltaE = colorDistance(a.color, b.color);
    const alphaEqual = Math.abs(a.color.a - b.color.a) <= 0.01;
    const exact = toHex(a.color) === toHex(b.color);
    const equal = alphaEqual && deltaE <= threshold;
    return { equal, withinTolerance: equal && !exact, deltaE };
  }
  const na = numeric(a);
  const nb = numeric(b);
  if (na !== undefined && nb !== undefined) {
    return { equal: Math.abs(na - nb) < 0.001, withinTolerance: false };
  }
  if (a.type === 'string' && b.type === 'string') {
    return { equal: normalizeString(a.value) === normalizeString(b.value), withinTolerance: false };
  }
  if (a.type === 'boolean' && b.type === 'boolean') {
    return { equal: a.value === b.value, withinTolerance: false };
  }
  return { equal: false, withinTolerance: false };
}

export function sameValue(a: TokenValue, b: TokenValue): boolean {
  return displayValue(a) === displayValue(b) && a.type === b.type;
}

export { parseColor };
