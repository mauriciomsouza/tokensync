import { describe, expect, it } from 'vitest';
import {
  applyRenames,
  cssVarName,
  globToRegExp,
  keyFromCssVar,
  matchesAny,
  normalizeMode,
  normalizeSegment,
  splitFigmaName,
} from '../src/core/names.js';

describe('name normalization', () => {
  it('turns Figma paths into dot names and kebab keys', () => {
    expect(splitFigmaName('color/brand/500')).toEqual(['color', 'brand', '500']);
    expect(splitFigmaName('Color/Brand Primary/Hover')).toEqual(['color', 'brand-primary', 'hover']);
    expect(splitFigmaName('Spacing / Space_4 ')).toEqual(['spacing', 'space-4']);
    expect(splitFigmaName('font/lineHeight/tight')).toEqual(['font', 'line-height', 'tight']);
  });

  it('normalizes odd segments', () => {
    expect(normalizeSegment('0.5')).toBe('0-5');
    expect(normalizeSegment('  Émphasis (old)')).toBe('mphasis-old');
    expect(normalizeSegment('fontSize')).toBe('font-size');
  });

  it('maps keys to CSS custom properties and back', () => {
    expect(cssVarName('color-brand-500')).toBe('--color-brand-500');
    expect(cssVarName('color-brand-500', 'ds')).toBe('--ds-color-brand-500');
    expect(keyFromCssVar('--ds-color-bg', 'ds')).toBe('color-bg');
    expect(keyFromCssVar('--other-color-bg', 'ds')).toBeUndefined();
    expect(keyFromCssVar('--color-bg')).toBe('color-bg');
  });

  it('normalizes mode names', () => {
    expect(normalizeMode('Light')).toBe('light');
    expect(normalizeMode('High Contrast')).toBe('high-contrast');
  });

  it('globs over dot names', () => {
    expect(globToRegExp('color.*').test('color.bg')).toBe(true);
    expect(globToRegExp('color.*').test('color.brand.500')).toBe(false);
    expect(globToRegExp('color.**').test('color.brand.500')).toBe(true);
    expect(globToRegExp('space.*').test('spacer.1')).toBe(false);
    expect(matchesAny('radius.md', ['space.*', 'radius.*'])).toBe(true);
    expect(matchesAny('radius.md', undefined)).toBe(false);
  });

  it('applies rename rules in order', () => {
    expect(applyRenames('spacing.space-4', [{ match: '^spacing\\.space-', replace: 'space.' }])).toBe('space.4');
  });
});
