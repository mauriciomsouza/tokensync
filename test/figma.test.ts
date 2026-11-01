import { describe, expect, it, vi } from 'vitest';
import { fetchFigmaVariables, readFigma } from '../src/core/figma.js';
import { toHex } from '../src/core/color.js';
import type { ModeValue } from '../src/core/types.js';
import { alias, aurora, figmaPayload, rgb } from './helpers.js';

const hex = (v: ModeValue): string =>
  v.value.type === 'color' ? toHex(v.value.color) : `not a color: ${v.value.type}`;

const payload = figmaPayload({
  collections: [
    { id: 'C:p', name: 'Primitives', modes: ['Value'] },
    { id: 'C:t', name: 'Theme', modes: ['Light', 'Dark'] },
  ],
  variables: [
    { id: 'V:1', name: 'color/blue/500', collection: 'C:p', type: 'COLOR', values: [rgb('#1d5fd1')] },
    { id: 'V:2', name: 'color/blue/200', collection: 'C:p', type: 'COLOR', values: [rgb('#9cc0ff')] },
    { id: 'V:3', name: 'space/4', collection: 'C:p', type: 'FLOAT', values: [16] },
    { id: 'V:4', name: 'font/weight/bold', collection: 'C:p', type: 'FLOAT', values: [700], scopes: ['FONT_WEIGHT'] },
    { id: 'V:5', name: 'color/accent', collection: 'C:t', type: 'COLOR', values: [alias('V:1'), alias('V:2')] },
    { id: 'V:6', name: 'color/link', collection: 'C:t', type: 'COLOR', values: [alias('V:5'), alias('V:5')] },
    {
      id: 'V:7',
      name: 'color/overlay',
      collection: 'C:t',
      type: 'COLOR',
      values: [rgb('#000000', 0.5), rgb('#000000', 0.7)],
    },
  ],
});

describe('readFigma', () => {
  const set = readFigma(payload);

  it('collects modes from multi-mode collections, default mode first', () => {
    expect(set.modes).toEqual(['light', 'dark']);
  });

  it('normalizes names and converts RGBA to hex', () => {
    const t = set.tokens.get('color-blue-500')!;
    expect(t.name).toBe('color.blue.500');
    expect(t.type).toBe('color');
    expect(hex(t.values['*']!)).toBe('#1d5fd1');
  });

  it('keeps alpha', () => {
    const t = set.tokens.get('color-overlay')!;
    expect(hex(t.values.dark!)).toBe('#000000b3');
  });

  it('treats FLOAT as px unless scoped or named as unitless', () => {
    expect(set.tokens.get('space-4')!.values['*']!.value).toEqual({ type: 'dimension', px: 16 });
    expect(set.tokens.get('font-weight-bold')!.values['*']!.value).toEqual({ type: 'number', value: 700 });
  });

  it('resolves aliases per mode and records the referenced token', () => {
    const accent = set.tokens.get('color-accent')!;
    expect(accent.values.light!.alias).toBe('color.blue.500');
    expect(hex(accent.values.light!)).toBe('#1d5fd1');
    expect(hex(accent.values.dark!)).toBe('#9cc0ff');
  });

  it('resolves alias chains, keeping the first hop as the reference', () => {
    const link = set.tokens.get('color-link')!;
    expect(link.values.dark!.alias).toBe('color.accent');
    expect(hex(link.values.dark!)).toBe('#9cc0ff');
  });

  it('warns on cycles and missing library variables instead of crashing', () => {
    const broken = figmaPayload({
      collections: [{ id: 'C', name: 'C', modes: ['Value'] }],
      variables: [
        { id: 'A', name: 'a', collection: 'C', type: 'COLOR', values: [alias('B')] },
        { id: 'B', name: 'b', collection: 'C', type: 'COLOR', values: [alias('A')] },
        { id: 'X', name: 'x', collection: 'C', type: 'COLOR', values: [alias('VariableID:lib/1')] },
      ],
    });
    const s = readFigma(broken);
    expect(s.tokens.size).toBe(0);
    expect(s.warnings.some((w) => w.includes('cycle'))).toBe(true);
    expect(s.warnings.some((w) => w.includes('library'))).toBe(true);
  });

  it('supports collection prefixes, renamed modes and skipped collections', () => {
    const s = readFigma(payload, {
      figma: { collections: { Primitives: { prefix: 'ref' }, Theme: {} }, modes: { Dark: 'night' } },
    });
    expect(s.tokens.has('ref-color-blue-500')).toBe(true);
    expect(s.modes).toEqual(['light', 'night']);
    expect(s.tokens.get('color-accent')!.values.light!.alias).toBe('ref.color.blue.500');
    const skipped = readFigma(payload, { figma: { collections: { Primitives: { skip: true } } } });
    expect(skipped.tokens.has('color-blue-500')).toBe(false);
  });

  it('rejects payloads that are not a Variables response', () => {
    expect(() => readFigma({ document: {} })).toThrow(/Figma Variables response/);
  });

  it('reads the Aurora fixture', () => {
    const s = readFigma(aurora().figma);
    expect(s.modes).toEqual(['light', 'dark']);
    expect(s.tokens.size).toBe(50);
    expect(s.warnings).toEqual([]);
  });
});

describe('fetchFigmaVariables', () => {
  it('sends the token only as a header and never echoes it in errors', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 403, statusText: 'Forbidden' }));
    const err = await fetchFigmaVariables({ fileKey: 'abc', token: 'figd_secret', fetch: fetchMock }).catch(
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('figd_secret');
    expect((err as Error).message).toContain('403');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.figma.com/v1/files/abc/variables/local');
    expect(url).not.toContain('figd_secret');
    expect((init.headers as Record<string, string>)['X-Figma-Token']).toBe('figd_secret');
  });

  it('returns the parsed payload', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    const data = await fetchFigmaVariables({ fileKey: 'abc', token: 't', fetch: fetchMock });
    expect(readFigma(data).tokens.size).toBe(7);
  });

  it('redacts the token from network errors', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('connect failed for token figd_secret');
    });
    const err = await fetchFigmaVariables({ fileKey: 'abc', token: 'figd_secret', fetch: fetchMock }).catch(
      (e: Error) => e,
    );
    expect((err as Error).message).toContain('[redacted]');
    expect((err as Error).message).not.toContain('figd_secret');
  });
});
