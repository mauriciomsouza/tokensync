import type { CssTarget } from '../core/config.js';
import { cssVarName, keyFromCssVar, normalizeMode } from '../core/names.js';
import type { ModeValue, TokenSet } from '../core/types.js';
import { formatLiteral, hintsFrom, parseLiteral, sameValue, type FormatHints } from '../core/value.js';
import { newRuleText, parseCss, parseModeSpec, ruleMatches, type Declaration, type Rule } from './css-parse.js';
import { AdapterError, type Adapter } from './types.js';

const VAR_REF = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/;

function modeSpecs(target: CssTarget, figmaModes: string[]): [string, string][] {
  const entries = Object.entries(target.modes ?? {});
  if (entries.length > 0) return entries.map(([m, spec]) => [normalizeMode(m), spec]);
  return [[figmaModes[0] ?? 'default', ':root']];
}

const keyToName = (key: string): string => key.replace(/-/g, '.');

interface Located {
  rule: Rule;
  decl: Declaration;
}

/** Index of declarations per mode, keyed by token key. Later declarations win, like the cascade. */
function indexByMode(rules: Rule[], specs: [string, string][], prefix?: string): Map<string, Map<string, Located>> {
  const out = new Map<string, Map<string, Located>>();
  for (const [mode, spec] of specs) {
    const parsed = parseModeSpec(spec);
    const byKey = new Map<string, Located>();
    for (const rule of rules) {
      if (!ruleMatches(rule, parsed)) continue;
      for (const decl of rule.declarations) {
        const key = keyFromCssVar(decl.name, prefix);
        if (key) byKey.set(key, { rule, decl });
      }
    }
    out.set(mode, byKey);
  }
  return out;
}

export const cssAdapter: Adapter<CssTarget> = {
  format: 'css',

  files: (t) => [t.path],

  modes: (t, figmaModes) => modeSpecs(t, figmaModes).map(([m]) => m),

  accepts: () => true,

  read(t, files, modes) {
    const src = files[t.path];
    const set: TokenSet = { source: t.path, modes, tokens: new Map(), warnings: [] };
    if (src === undefined) {
      set.warnings.push(`${t.path} does not exist yet`);
      return set;
    }
    let rules: Rule[];
    try {
      rules = parseCss(src);
    } catch (err) {
      throw new AdapterError((err as Error).message, t.path);
    }
    const specs = modeSpecs(t, modes);
    const index = indexByMode(rules, specs, t.prefix);
    const base = specs[0]?.[0] as string;
    const remBase = t.remBase ?? 16;

    const resolve = (mode: string, raw: string, seen: string[]): ModeValue | undefined => {
      const ref = VAR_REF.exec(raw.trim());
      if (!ref?.[1]) return { value: parseLiteral(raw, { remBase }) };
      const key = keyFromCssVar(ref[1], t.prefix);
      const target = key ? (index.get(mode)?.get(key) ?? index.get(base)?.get(key)) : undefined;
      if (!key || !target || seen.includes(key)) {
        if (ref[2]) return { value: parseLiteral(ref[2], { remBase }) };
        set.warnings.push(`${t.path}: could not resolve ${raw}`);
        return undefined;
      }
      const inner = resolve(mode, target.decl.value, [...seen, key]);
      return inner ? { value: inner.value, alias: keyToName(key) } : undefined;
    };

    // Union of keys, in source order of the base rule first.
    const keys = new Set<string>();
    for (const [mode] of specs) for (const k of index.get(mode)?.keys() ?? []) keys.add(k);

    for (const key of keys) {
      const values: Record<string, ModeValue> = {};
      for (const [mode] of specs) {
        const own = index.get(mode)?.get(key) ?? index.get(base)?.get(key);
        if (!own) continue;
        const v = resolve(mode, own.decl.value, [key]);
        if (v) values[mode] = v;
      }
      const first = Object.values(values)[0];
      if (!first) continue;
      set.tokens.set(key, { key, name: keyToName(key), type: first.value.type, values });
    }
    return set;
  },

  write(t, files, plan) {
    let src = files[t.path] ?? '';
    const specs = modeSpecs(t, plan.modes);
    const base = specs[0]?.[0] as string;
    const remBase = t.remBase ?? 16;
    const rules = parseCss(src);
    const index = indexByMode(rules, specs, t.prefix);

    // File-level style hints, so new declarations look like their neighbours.
    const allDecls = rules.flatMap((r) => r.declarations);
    const firstColor = allDecls.find((d) => parseLiteral(d.value).type === 'color');
    const firstDim = allDecls.find((d) => parseLiteral(d.value).type === 'dimension');
    const fileHints: FormatHints = {
      ...hintsFrom(firstColor?.value, remBase),
      unit: firstDim && /rem$/.test(firstDim.value) ? 'rem' : 'px',
      remBase,
    };
    const indent = /\n([ \t]+)--/.exec(src)?.[1] ?? '  ';

    const serialize = (v: ModeValue, existing?: string): string => {
      const aliasKey = v.alias?.replace(/\./g, '-');
      if (aliasKey && plan.available.has(aliasKey)) return `var(${cssVarName(aliasKey, t.prefix)})`;
      const hints = existing && !VAR_REF.test(existing) ? { ...fileHints, ...hintsFrom(existing, remBase) } : fileHints;
      return formatLiteral(v.value, hints);
    };

    type Edit = { start: number; end: number; text: string };
    const edits: Edit[] = [];
    const appended = new Map<string, string[]>(); // mode → new lines for rules that do not exist yet

    const insertInto = (mode: string, key: string, line: string): void => {
      const parsed = parseModeSpec(specs.find(([m]) => m === mode)?.[1] ?? ':root');
      const rule = rules.find((r) => ruleMatches(r, parsed));
      if (!rule) {
        appended.set(mode, [...(appended.get(mode) ?? []), line]);
        return;
      }
      // Place after the declaration sharing the longest key prefix, so groups stay together.
      const segs = key.split('-');
      let anchor: Declaration | undefined;
      let best = 0;
      for (const d of rule.declarations) {
        const dk = keyFromCssVar(d.name, t.prefix)?.split('-') ?? [];
        let n = 0;
        while (n < segs.length && n < dk.length && segs[n] === dk[n]) n++;
        if (n >= best && n > 0) {
          best = n;
          anchor = d;
        }
      }
      if (anchor) {
        const lineIndent = /^[ \t]*/.exec(src.slice(anchor.lineStart))?.[0] ?? indent;
        edits.push({ start: anchor.lineEnd, end: anchor.lineEnd, text: `${lineIndent}${line}\n` });
      } else {
        const before = src.slice(0, rule.bodyEnd);
        const needsNl = !/\n[ \t]*$/.test(before);
        const ruleIndent = /([ \t]*)[^\n]*$/.exec(src.slice(0, rule.bodyStart))?.[1] ?? '';
        edits.push({
          start: rule.bodyEnd,
          end: rule.bodyEnd,
          text: `${needsNl ? '\n' : ''}${ruleIndent}${indent}${line}\n${ruleIndent}`,
        });
      }
    };

    for (const token of plan.upserts) {
      const varName = cssVarName(token.key, t.prefix);
      const desired = new Map<string, ModeValue | undefined>(specs.map(([m]) => [m, plan.valueFor(token, m)]));
      const baseValue = desired.get(base);
      for (const [mode] of specs) {
        const want = desired.get(mode);
        if (!want) continue;
        const own = index.get(mode)?.get(token.key);
        if (own && own.decl.name === varName) {
          const text = serialize(want, own.decl.value);
          if (text !== own.decl.value) {
            const current = parseLiteral(own.decl.value, { remBase });
            const unchanged = !VAR_REF.test(own.decl.value) && !want.alias && sameValue(current, want.value);
            if (!unchanged) edits.push({ start: own.decl.valueStart, end: own.decl.valueEnd, text });
          }
          continue;
        }
        // Not declared in this mode's rule: only add when it would not inherit the right value.
        if (mode !== base && baseValue && sameValue(baseValue.value, want.value) && baseValue.alias === want.alias)
          continue;
        insertInto(mode, token.key, `${varName}: ${serialize(want)};`);
      }
    }

    for (const token of plan.removals) {
      for (const [mode] of specs) {
        const own = index.get(mode)?.get(token.key);
        if (own) edits.push({ start: own.decl.lineStart, end: own.decl.lineEnd, text: '' });
      }
    }

    // Apply from the end so earlier offsets stay valid. Same-offset inserts keep plan order.
    const dedup = new Map<string, Edit>();
    edits.forEach((e, i) => dedup.set(e.end === e.start ? `${e.start}:ins:${i}` : `${e.start}:${e.end}`, e));
    const ordered = [...dedup.values()]
      .map((e, i) => ({ e, i }))
      .sort((a, b) => b.e.start - a.e.start || b.i - a.i)
      .map(({ e }) => e);
    for (const e of ordered) src = src.slice(0, e.start) + e.text + src.slice(e.end);

    for (const [mode, lines] of appended) {
      const spec = parseModeSpec(specs.find(([m]) => m === mode)?.[1] ?? ':root');
      src = `${src.replace(/\s*$/, '')}${src.trim() ? '\n\n' : ''}${newRuleText(spec, lines, indent)}`;
    }
    if (files[t.path] === undefined && !src.endsWith('\n')) src += '\n';
    return src === files[t.path] ? {} : { [t.path]: src };
  },
};
