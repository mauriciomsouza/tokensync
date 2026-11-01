import { describe, expect, it } from 'vitest';
import { cssAdapter } from '../src/adapters/css.js';
import { dtcgAdapter } from '../src/adapters/dtcg.js';
import { tailwindAdapter } from '../src/adapters/tailwind.js';
import type { WritePlan } from '../src/adapters/types.js';
import { parseConfig, type CssTarget, type DtcgTarget, type TailwindTarget } from '../src/core/config.js';
import { displayValue } from '../src/core/value.js';
import type { Token, TokenSet } from '../src/core/types.js';

const dump = (set: TokenSet): Record<string, Record<string, string>> =>
  Object.fromEntries(
    [...set.tokens.values()].map((t) => [
      t.name,
      Object.fromEntries(
        Object.entries(t.values).map(([m, v]) => [m, displayValue(v.value) + (v.alias ? ` <- ${v.alias}` : '')]),
      ),
    ]),
  );

/** A plan that rewrites every token with its own values: the identity write. */
function identity(set: TokenSet): WritePlan {
  const tokens = [...set.tokens.values()];
  return {
    modes: set.modes,
    upserts: tokens,
    removals: [],
    available: new Set(tokens.map((t) => t.key)),
    valueFor: (t: Token, m: string) => t.values[m],
  };
}

const target = <T>(t: unknown): T => parseConfig({ targets: [t] }).targets[0] as T;

describe('CSS adapter', () => {
  const t = target<CssTarget>({
    format: 'css',
    path: 'tokens.css',
    modes: { light: ':root', dark: '[data-theme="dark"]', contrast: '@media (prefers-contrast: more)' },
  });
  const css = `/* Brand */
:root {
  --color-blue: #1d5fd1; /* primary */
  --color-accent: var(--color-blue);
  --space-4: 1rem;
  --font-sans: "Inter", sans-serif;
  --shadow: 0 1px 2px rgb(0 0 0 / 0.1);
}

[data-theme='dark'] {
  --color-accent: #9cc0ff;
}

@media (prefers-contrast: more) {
  :root { --color-accent: #003399; }
}
`;
  const modes = cssAdapter.modes(t, ['light', 'dark']);

  it('reads every mode, falling back to the base rule', () => {
    expect(modes).toEqual(['light', 'dark', 'contrast']);
    const d = dump(cssAdapter.read(t, { 'tokens.css': css }, modes));
    expect(d['color.blue']).toEqual({ light: '#1d5fd1', dark: '#1d5fd1', contrast: '#1d5fd1' });
    expect(d['color.accent']).toEqual({ light: '#1d5fd1 <- color.blue', dark: '#9cc0ff', contrast: '#003399' });
    expect(d['space.4']!.light).toBe('16px');
    expect(d['font.sans']!.light).toBe('"Inter", sans-serif');
  });

  it('round-trips without changing a byte', () => {
    const set = cssAdapter.read(t, { 'tokens.css': css }, modes);
    expect(cssAdapter.write(t, { 'tokens.css': css }, identity(set))).toEqual({});
  });

  it('edits values in place, keeping comments, units and syntax', () => {
    const set = cssAdapter.read(t, { 'tokens.css': css }, modes);
    const blue = set.tokens.get('color-blue')!;
    const space = set.tokens.get('space-4')!;
    const plan: WritePlan = {
      ...identity(set),
      upserts: [blue, space],
      valueFor: (tok) =>
        tok.key === 'color-blue'
          ? { value: { type: 'color', color: { r: 0, g: 0.4, b: 1, a: 1 } } }
          : { value: { type: 'dimension', px: 20 } },
    };
    const out = cssAdapter.write(t, { 'tokens.css': css }, plan)['tokens.css']!;
    expect(out).toContain('--color-blue: #0066ff; /* primary */');
    expect(out).toContain('--space-4: 1.25rem;');
    expect(out).toContain('/* Brand */');
    expect(out.split('\n').length).toBe(css.split('\n').length);
  });

  it('inserts new tokens next to their group and creates missing mode blocks', () => {
    const t2 = target<CssTarget>({ format: 'css', path: 'a.css', modes: { light: ':root', dark: '.dark' } });
    const src = ':root {\n  --color-blue: #1d5fd1;\n  --space-4: 16px;\n}\n';
    const tok: Token = {
      key: 'color-red',
      name: 'color.red',
      type: 'color',
      values: {
        light: { value: { type: 'color', color: { r: 1, g: 0, b: 0, a: 1 } } },
        dark: { value: { type: 'color', color: { r: 0.5, g: 0, b: 0, a: 1 } } },
      },
    };
    const out = cssAdapter.write(
      t2,
      { 'a.css': src },
      {
        modes: ['light', 'dark'],
        upserts: [tok],
        removals: [],
        available: new Set(),
        valueFor: (x, m) => x.values[m],
      },
    )['a.css']!;
    expect(out).toBe(
      ':root {\n  --color-blue: #1d5fd1;\n  --color-red: #ff0000;\n  --space-4: 16px;\n}\n\n.dark {\n  --color-red: #800000;\n}\n',
    );
  });

  it('writes aliases as var() references when the target token exists', () => {
    const t2 = target<CssTarget>({ format: 'css', path: 'a.css', prefix: 'ds' });
    const src = ':root {\n  --ds-color-blue: #1d5fd1;\n}\n';
    const tok: Token = {
      key: 'color-link',
      name: 'color.link',
      type: 'color',
      values: { default: { value: { type: 'color', color: { r: 0, g: 0, b: 0, a: 1 } }, alias: 'color.blue' } },
    };
    const out = cssAdapter.write(
      t2,
      { 'a.css': src },
      {
        modes: ['default'],
        upserts: [tok],
        removals: [],
        available: new Set(['color-blue']),
        valueFor: (x, m) => x.values[m],
      },
    )['a.css']!;
    expect(out).toContain('--ds-color-link: var(--ds-color-blue);');
  });

  it('removes declarations with --prune, including their trailing comment', () => {
    const set = cssAdapter.read(t, { 'tokens.css': css }, modes);
    const out = cssAdapter.write(
      t,
      { 'tokens.css': css },
      { ...identity(set), upserts: [], removals: [set.tokens.get('color-blue')!] },
    )['tokens.css']!;
    expect(out).not.toContain('--color-blue:');
    expect(out).not.toContain('primary');
    expect(out).toContain('--color-accent: var(--color-blue);');
  });
});

describe('DTCG adapter', () => {
  const t = target<DtcgTarget>({ format: 'dtcg', path: 'tokens.json', mode: 'light' });
  const json = `{
  "color": {
    "$type": "color",
    "blue": {
      "500": { "$value": "#1d5fd1", "$description": "Primary" },
      "100": { "$value": { "colorSpace": "srgb", "components": [0.9, 0.95, 1], "alpha": 1, "hex": "#e6f2ff" } }
    },
    "accent": { "$value": "{color.blue.500}" }
  },
  "space": {
    "4": { "$type": "dimension", "$value": { "value": 16, "unit": "px" } }
  },
  "font": { "family": { "sans": { "$type": "fontFamily", "$value": ["Inter", "sans-serif"] } } }
}
`;

  it('reads classic and 2025-draft values and resolves references', () => {
    const d = dump(dtcgAdapter.read(t, { 'tokens.json': json }, ['light']));
    expect(d['color.blue.500']).toEqual({ light: '#1d5fd1' });
    expect(d['color.blue.100']).toEqual({ light: '#e6f2ff' });
    expect(d['color.accent']).toEqual({ light: '#1d5fd1 <- color.blue.500' });
    expect(d['space.4']).toEqual({ light: '16px' });
    expect(d['font.family.sans']).toEqual({ light: 'Inter, sans-serif' });
  });

  it('round-trips without changes and keeps integer-like key order', () => {
    const set = dtcgAdapter.read(t, { 'tokens.json': json }, ['light']);
    expect(dtcgAdapter.write(t, { 'tokens.json': json }, identity(set))).toEqual({});
  });

  it('updates values in the existing style and adds new tokens', () => {
    const set = dtcgAdapter.read(t, { 'tokens.json': json }, ['light']);
    const space = set.tokens.get('space-4')!;
    const added: Token = {
      key: 'color-blue-900',
      name: 'color.blue.900',
      type: 'color',
      values: { light: { value: { type: 'color', color: { r: 0, g: 0, b: 0.2, a: 1 } } } },
    };
    const out = dtcgAdapter.write(
      t,
      { 'tokens.json': json },
      {
        ...identity(set),
        upserts: [space, added],
        valueFor: (tok, m) => (tok.key === 'space-4' ? { value: { type: 'dimension', px: 20 } } : tok.values[m]),
      },
    )['tokens.json']!;
    const parsed = JSON.parse(out) as {
      space: { '4': { $value: unknown } };
      color: { blue: Record<string, { $value: string }> };
    };
    expect(parsed.space['4'].$value).toEqual({ value: 20, unit: 'px' });
    expect(parsed.color.blue['900']!.$value).toBe('#000033');
    expect(out.indexOf('"500"')).toBeLessThan(out.indexOf('"100"'));
    expect(out).toContain('"$description": "Primary"');
  });

  it('supports one file per mode', () => {
    const t2 = target<DtcgTarget>({ format: 'dtcg', path: { light: 'light.json', dark: 'dark.json' } });
    const files = {
      'light.json': '{ "bg": { "$type": "color", "$value": "#ffffff" } }',
      'dark.json': '{ "bg": { "$type": "color", "$value": "#000000" } }',
    };
    expect(dump(dtcgAdapter.read(t2, files, ['light', 'dark']))).toEqual({ bg: { light: '#ffffff', dark: '#000000' } });
  });
});

describe('Tailwind adapter', () => {
  const t = target<TailwindTarget>({ format: 'tailwind', path: 'theme.json' });
  const json = `{
  "theme": {
    "extend": {
      "colors": {
        "brand": { "DEFAULT": "#7c5cff", "50": "#f3f0ff", "500": "#7c5cff" },
        "ink": "#18181d"
      },
      "spacing": { "4": "1rem", "px": "1px" },
      "borderRadius": { "md": "0.5rem" },
      "fontFamily": { "sans": ["Inter", "sans-serif"] }
    }
  }
}
`;

  it('maps theme groups onto token names', () => {
    const d = dump(tailwindAdapter.read(t, { 'theme.json': json }, ['light']));
    expect(d['color.brand']).toEqual({ light: '#7c5cff' });
    expect(d['color.brand.50']).toEqual({ light: '#f3f0ff' });
    expect(d['color.ink']).toEqual({ light: '#18181d' });
    expect(d['space.4']).toEqual({ light: '16px' });
    expect(d['radius.md']).toEqual({ light: '8px' });
    expect(d['font.family.sans']).toEqual({ light: 'Inter, sans-serif' });
  });

  it('only accepts tokens that belong to a mapped group', () => {
    expect(tailwindAdapter.accepts(t, 'color.brand.500')).toBe(true);
    expect(tailwindAdapter.accepts(t, 'space.4')).toBe(true);
    expect(tailwindAdapter.accepts(t, 'motion.fast')).toBe(false);
  });

  it('round-trips and writes rem when the file uses rem', () => {
    const set = tailwindAdapter.read(t, { 'theme.json': json }, ['light']);
    expect(tailwindAdapter.write(t, { 'theme.json': json }, identity(set))).toEqual({});
    const add: Token = {
      key: 'space-8',
      name: 'space.8',
      type: 'dimension',
      values: { light: { value: { type: 'dimension', px: 32 } } },
    };
    const out = tailwindAdapter.write(t, { 'theme.json': json }, { ...identity(set), upserts: [add] })['theme.json']!;
    expect(JSON.parse(out).theme.extend.spacing['8']).toBe('2rem');
    expect(out.indexOf('"DEFAULT"')).toBeLessThan(out.indexOf('"50"'));
  });
});
