import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/core/config.js';
import { check, hasDrift, sync } from '../src/core/engine.js';
import { renderHtml } from '../src/render/html.js';
import { COMMENT_MARKER, renderMarkdown } from '../src/render/markdown.js';
import { renderTerminal } from '../src/render/terminal.js';
import { alias, aurora, figmaPayload, rgb } from './helpers.js';

describe('diff engine on the Aurora example', () => {
  const input = aurora();
  const { result } = check(input);

  it('summarizes drift across all targets', () => {
    expect(result.summary).toEqual({ added: 4, removed: 1, changed: 9, inSync: 55, total: 14 });
    expect(hasDrift(result)).toBe(true);
  });

  it('reports changes per mode with before → after and ΔE', () => {
    const css = result.targets[0]!;
    const hover = css.changes.find((c) => c.name === 'color.accent.hover')!;
    expect(hover.kind).toBe('changed');
    expect(hover.modes).toHaveLength(1);
    expect(hover.modes[0]!.mode).toBe('dark');
    expect(hover.modes[0]!.deltaE).toBeGreaterThan(10);
    expect(hover.modes[0]!.figma!.alias).toBe('color.brand.100');
  });

  it('collapses identical per-mode differences into one "all modes" row', () => {
    const radius = result.targets[0]!.changes.find((c) => c.name === 'radius.md')!;
    expect(radius.modes.map((m) => m.mode)).toEqual(['*']);
  });

  it('ignores differences under the ΔE threshold and counts them', () => {
    const css = result.targets[0]!;
    expect(css.changes.find((c) => c.name === 'color.fg.muted')).toBeUndefined();
    expect(css.withinTolerance).toBe(1);
  });

  it('respects a stricter threshold', () => {
    const strict = check({ ...input, config: { ...input.config, threshold: 0 } }).result;
    expect(strict.targets[0]!.changes.find((c) => c.name === 'color.fg.muted')?.kind).toBe('changed');
  });

  it('orders changes deterministically (changed, added, removed; natural name order)', () => {
    const kinds = result.targets[0]!.changes.map((c) => c.kind);
    expect(kinds).toEqual(
      [...kinds].sort(
        (a, b) => ['changed', 'added', 'removed'].indexOf(a) - ['changed', 'added', 'removed'].indexOf(b),
      ),
    );
    expect(JSON.stringify(check(aurora()).result)).toBe(JSON.stringify(result));
  });

  it('applies include/exclude scopes per target', () => {
    const tw = result.targets[2]!;
    expect(tw.changes.every((c) => /^(color\.brand|space|radius)\./.test(c.name))).toBe(true);
  });
});

describe('modes and aliases end-to-end', () => {
  const figma = figmaPayload({
    collections: [
      { id: 'P', name: 'Primitives', modes: ['Value'] },
      { id: 'T', name: 'Theme', modes: ['Light', 'Dark'] },
    ],
    variables: [
      { id: 'p1', name: 'blue/500', collection: 'P', type: 'COLOR', values: [rgb('#1d5fd1')] },
      { id: 'p2', name: 'blue/200', collection: 'P', type: 'COLOR', values: [rgb('#9cc0ff')] },
      { id: 't1', name: 'accent', collection: 'T', type: 'COLOR', values: [alias('p1'), alias('p2')] },
    ],
  });
  const config = parseConfig({
    targets: [{ format: 'css', path: 't.css', modes: { light: ':root', dark: '@media (prefers-color-scheme: dark)' } }],
  });

  it('detects a dark-mode-only drift through a media query', () => {
    const css =
      ':root{--blue-500:#1d5fd1;--blue-200:#9cc0ff;--accent:var(--blue-500)}@media (prefers-color-scheme: dark){:root{--accent:#1d5fd1}}';
    const { result } = check({ config, figma, files: { 't.css': css } });
    expect(result.summary.changed).toBe(1);
    const c = result.targets[0]!.changes[0]!;
    expect(c.modes.map((m) => m.mode)).toEqual(['dark']);
  });

  it('sync writes a var() reference for the alias, then reports no drift', () => {
    const css =
      ':root {\n  --blue-500: #1d5fd1;\n  --blue-200: #9cc0ff;\n  --accent: var(--blue-500);\n}\n\n@media (prefers-color-scheme: dark) {\n  :root {\n    --accent: #1d5fd1;\n  }\n}\n';
    const { writes } = sync({ config, figma, files: { 't.css': css } });
    expect(writes['t.css']).toContain('--accent: var(--blue-200);');
    expect(check({ config, figma, files: writes }).result.summary.total).toBe(0);
  });
});

describe('sync on the Aurora example', () => {
  it('brings every target in sync without touching anything else', () => {
    const input = aurora();
    const { writes } = sync(input);
    expect(Object.keys(writes).sort()).toEqual([
      'src/styles/tokens.css',
      'tailwind.theme.json',
      'tokens/primitives.tokens.json',
    ]);
    const after = check({ ...input, files: { ...input.files, ...writes } }).result;
    // Only the code-only token remains, because sync keeps it unless --prune.
    expect(after.summary).toMatchObject({ changed: 0, added: 0, removed: 1 });

    const css = writes['src/styles/tokens.css']!;
    expect(css).toContain('Run `npx tokensync check` before editing by hand.');
    expect(css).toContain('--color-fg-muted: #5e5e6c; /* rounded by hand, still within ΔE tolerance */');
    expect(css).toContain('--color-focus-ring: rgb(100 64 240 / 0.4);');
    expect(css).toContain('--radius-md: 8px;');
    expect(css).toContain('--color-info: #2f80ed;');
    // Unchanged lines stay put: the file only grows by the added declarations.
    const before = input.files['src/styles/tokens.css']!;
    expect(css.split('\n').length - before.split('\n').length).toBe(3);

    const tw = writes['tailwind.theme.json']!;
    expect(JSON.parse(tw).borderRadius.lg).toBe('0.75rem');
    expect(JSON.parse(tw).spacing['12']).toBe('3rem');
  });

  it('removes code-only tokens with prune', () => {
    const input = aurora();
    const { writes } = sync(input, { prune: true });
    expect(writes['src/styles/tokens.css']).not.toContain('--color-info');
    expect(check({ ...input, files: { ...input.files, ...writes } }).result.summary.total).toBe(0);
  });

  it('is idempotent', () => {
    const input = aurora();
    const first = sync(input, { prune: true }).writes;
    const second = sync({ ...input, files: { ...input.files, ...first } }, { prune: true }).writes;
    expect(second).toEqual({});
  });
});

describe('renderers', () => {
  const { result } = check(aurora());

  it('markdown report matches the snapshot', () => {
    const md = renderMarkdown(result);
    expect(md.startsWith(COMMENT_MARKER)).toBe(true);
    expect(md).toMatchSnapshot();
  });

  it('markdown collapses long tables', () => {
    const md = renderMarkdown(result, { maxRows: 2 });
    expect(md).toContain('<details><summary>');
  });

  it('markdown says so when in sync', () => {
    const md = renderMarkdown({
      ...result,
      targets: [],
      summary: { added: 0, removed: 0, changed: 0, inSync: 3, total: 0 },
    });
    expect(md).toContain('In sync: 3 tokens match Figma.');
  });

  it('html report is self-contained, escaped and deterministic', () => {
    const html = renderHtml(result);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).not.toMatch(/<script|<link|https?:\/\/(?!www\.w3)/);
    expect(html).toContain('Aurora Design System');
    expect(html).toBe(renderHtml(check(aurora()).result));
    const evil = renderHtml({ ...result, project: '<img src=x onerror=alert(1)>' });
    expect(evil).not.toContain('<img src=x');
  });

  it('terminal output works without color', () => {
    const out = renderTerminal(result, { color: false });
    expect(out).toContain('Drift detected');
    expect(out).toContain('#c9b8ff');
    expect(out).not.toMatch(/\u001b\[/);
  });
});
