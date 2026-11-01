import { describe, expect, it } from 'vitest';
import { colorDistance, deltaE2000, parseColor, toHex, toHslString, toRgbString } from '../src/core/color.js';
import { compareValues } from '../src/core/value.js';

describe('color parsing and formatting', () => {
  it('round-trips hex, including alpha and shorthand', () => {
    expect(toHex(parseColor('#7C5CFF')!)).toBe('#7c5cff');
    expect(toHex(parseColor('#abc')!)).toBe('#aabbcc');
    expect(toHex(parseColor('#6440f066')!)).toBe('#6440f066');
  });

  it('parses modern and legacy rgb()/hsl() syntax', () => {
    expect(toHex(parseColor('rgb(100 64 240 / 0.4)')!)).toBe('#6440f066');
    expect(toHex(parseColor('rgba(100, 64, 240, 0.4)')!)).toBe('#6440f066');
    expect(toHex(parseColor('hsl(0 100% 50%)')!)).toBe('#ff0000');
    expect(parseColor('var(--x)')).toBeUndefined();
    expect(parseColor('16px')).toBeUndefined();
  });

  it('formats rgb and hsl', () => {
    expect(toRgbString({ r: 1, g: 0, b: 0, a: 0.5 })).toBe('rgb(255 0 0 / 0.5)');
    expect(toHslString({ r: 1, g: 0, b: 0, a: 1 })).toBe('hsl(0 100% 50%)');
  });
});

describe('CIEDE2000', () => {
  // Reference pairs from Sharma, Wu & Dalal (2005), Table 1.
  const pairs: [number, number, number, number, number, number, number][] = [
    [50, 2.6772, -79.7751, 50, 0, -82.7485, 2.0425],
    [50, 3.1571, -77.2803, 50, 0, -82.7485, 2.8615],
    [50, -1.3802, -84.2814, 50, 0, -82.7485, 1.0],
    [50, 2.49, -0.001, 50, -2.49, 0.0009, 7.1792],
    [50, 0, 0, 50, -1, 2, 2.3669],
    [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
    [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
    [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
    [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
  ];
  it.each(pairs)('matches reference value %#', (L1, a1, b1, L2, a2, b2, expected) => {
    expect(deltaE2000({ L: L1, a: a1, b: b1 }, { L: L2, a: a2, b: b2 })).toBeCloseTo(expected, 3);
  });

  it('is zero for identical colors and symmetric', () => {
    const a = parseColor('#7c5cff')!;
    const b = parseColor('#6440f0')!;
    expect(colorDistance(a, a)).toBe(0);
    expect(colorDistance(a, b)).toBeCloseTo(colorDistance(b, a), 10);
  });
});

describe('threshold', () => {
  const v = (hex: string) => ({ type: 'color' as const, color: parseColor(hex)! });

  it('ignores rounding differences under the threshold', () => {
    const r = compareValues(v('#5d5d6b'), v('#5e5e6c'), 1);
    expect(r.equal).toBe(true);
    expect(r.withinTolerance).toBe(true);
    expect(r.deltaE).toBeLessThan(1);
  });

  it('reports perceptible differences', () => {
    const r = compareValues(v('#6440f0'), v('#5b3be8'), 1);
    expect(r.equal).toBe(false);
    expect(r.deltaE).toBeGreaterThan(1);
  });

  it('a stricter threshold catches the same rounding', () => {
    expect(compareValues(v('#5d5d6b'), v('#5e5e6c'), 0).equal).toBe(false);
  });

  it('treats alpha separately from ΔE', () => {
    expect(compareValues(v('#6440f066'), v('#6440f0'), 1).equal).toBe(false);
  });
});
