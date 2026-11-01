import type { Rgba } from './types.js';

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const round = (n: number, digits = 4): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const hex2 = (n: number): string =>
  Math.round(clamp01(n) * 255)
    .toString(16)
    .padStart(2, '0');

/** `#rrggbb`, or `#rrggbbaa` when the color is not fully opaque. Always lowercase. */
export function toHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return Math.round(clamp01(c.a) * 255) === 255 ? base : base + hex2(c.a);
}

export function toRgbString(c: Rgba): string {
  const r = Math.round(clamp01(c.r) * 255);
  const g = Math.round(clamp01(c.g) * 255);
  const b = Math.round(clamp01(c.b) * 255);
  const a = round(clamp01(c.a), 3);
  return a === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${a})`;
}

export function toHslString(c: Rgba): string {
  const { r, g, b } = c;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const hs = `${round(h, 1)} ${round(s * 100, 1)}% ${round(l * 100, 1)}%`;
  const a = round(clamp01(c.a), 3);
  return a === 1 ? `hsl(${hs})` : `hsl(${hs} / ${a})`;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

const NAMED: Record<string, string> = {
  transparent: '#00000000',
  black: '#000000',
  white: '#ffffff',
};

export function parseHex(input: string): Rgba | undefined {
  const m = /^#([0-9a-f]{3,8})$/i.exec(input.trim());
  if (!m?.[1]) return undefined;
  let h = m[1];
  if (h.length === 3 || h.length === 4) {
    h = [...h].map((ch) => ch + ch).join('');
  }
  if (h.length !== 6 && h.length !== 8) return undefined;
  const n = (i: number): number => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}

function parseChannel(raw: string, scale: number): number {
  const s = raw.trim();
  if (s.endsWith('%')) return parseFloat(s) / 100;
  return parseFloat(s) / scale;
}

function splitArgs(inner: string): { parts: string[]; alpha?: string } {
  // Supports `r, g, b, a`, `r g b`, and `r g b / a`.
  const [main = '', alpha] = inner.split('/');
  const parts = main
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (alpha === undefined && parts.length === 4) {
    const a = parts.pop();
    return a === undefined ? { parts } : { parts, alpha: a };
  }
  return alpha === undefined ? { parts } : { parts, alpha: alpha.trim() };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Parses hex, `rgb()/rgba()`, `hsl()/hsla()` and a few keywords. */
export function parseColor(input: string): Rgba | undefined {
  const s = input.trim().toLowerCase();
  const named = NAMED[s];
  if (named) return parseHex(named);
  if (s.startsWith('#')) return parseHex(s);

  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(s);
  if (!fn?.[1] || fn[2] === undefined) return undefined;
  const { parts, alpha } = splitArgs(fn[2]);
  if (parts.length !== 3) return undefined;
  const a = alpha === undefined ? 1 : parseChannel(alpha, 1);

  if (fn[1].startsWith('rgb')) {
    const [r, g, b] = parts.map((p) => parseChannel(p, 255)) as [number, number, number];
    if ([r, g, b, a].some(Number.isNaN)) return undefined;
    return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
  }
  const h = parseFloat(parts[0] ?? '');
  const sat = parseFloat(parts[1] ?? '') / 100;
  const lig = parseFloat(parts[2] ?? '') / 100;
  if ([h, sat, lig, a].some(Number.isNaN)) return undefined;
  const [r, g, b] = hslToRgb(((h % 360) + 360) % 360, sat, lig);
  return { r, g, b, a: clamp01(a) };
}

export type ColorSyntax = 'hex' | 'rgb' | 'hsl';

export function colorSyntaxOf(raw: string): ColorSyntax {
  const s = raw.trim().toLowerCase();
  if (s.startsWith('rgb')) return 'rgb';
  if (s.startsWith('hsl')) return 'hsl';
  return 'hex';
}

export function formatColor(c: Rgba, syntax: ColorSyntax): string {
  if (syntax === 'rgb') return toRgbString(c);
  if (syntax === 'hsl') return toHslString(c);
  return toHex(c);
}

/* ------------------------------------------------------------------ */
/* Perceptual distance: CIEDE2000                                     */
/* ------------------------------------------------------------------ */

export interface Lab {
  L: number;
  a: number;
  b: number;
}

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** sRGB (D65) → CIE L*a*b* (D65). */
export function rgbToLab(c: Rgba): Lab {
  const r = srgbToLinear(c.r);
  const g = srgbToLinear(c.g);
  const b = srgbToLinear(c.b);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const deg = (rad: number): number => (rad * 180) / Math.PI;
const rad = (d: number): number => (d * Math.PI) / 180;

/**
 * CIEDE2000 colour difference (Sharma, Wu & Dalal, 2005), kL = kC = kH = 1.
 * ~1.0 is the threshold where most people start to notice a difference.
 */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const hp = (bb: number, ap: number): number => {
    if (bb === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(bb, ap));
    return h >= 0 ? h : h + 360;
  };
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
    else hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

export function colorDistance(c1: Rgba, c2: Rgba): number {
  return deltaE2000(rgbToLab(c1), rgbToLab(c2));
}

/** Relative luminance, used to pick legible text on top of a swatch. */
export function luminance(c: Rgba): number {
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
}
