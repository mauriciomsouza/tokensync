import type { TailwindTarget } from '../core/config.js';
import { normalizeMode, normalizeSegment, toKey, toName } from '../core/names.js';
import { detectIndent, isObject, parseJson, stringifyJson, type OObject, type OValue } from '../core/ojson.js';
import type { ModeValue, TokenSet } from '../core/types.js';
import { formatLiteral, hintsFrom, parseLiteral, sameValue } from '../core/value.js';
import { AdapterError, type Adapter } from './types.js';

/**
 * Tailwind theme as JSON — the object you would put under `theme` or
 * `theme.extend` in `tailwind.config`, exported to a file (many teams keep it
 * in `theme.json` and import it). A wrapper `{ "theme": { "extend": … } }` is
 * also understood. Tailwind has no notion of modes, so a theme represents one.
 */

export const DEFAULT_TAILWIND_GROUPS: Record<string, string> = {
  colors: 'color',
  spacing: 'space',
  borderRadius: 'radius',
  fontFamily: 'font.family',
  fontSize: 'font.size',
  fontWeight: 'font.weight',
  lineHeight: 'font.line-height',
  boxShadow: 'shadow',
  opacity: 'opacity',
};

const groupsOf = (t: TailwindTarget): [string, string[]][] =>
  Object.entries(t.groups ?? DEFAULT_TAILWIND_GROUPS).map(([k, prefix]) => [
    k,
    prefix.split('.').map(normalizeSegment),
  ]);

/** Finds the object that actually holds theme keys. */
function themeRoot(root: OObject): OObject {
  let node = root;
  const theme = node.get('theme');
  if (isObject(theme)) node = theme;
  const extend = node.get('extend');
  if (isObject(extend)) node = extend;
  return node;
}

interface Entry {
  /** Path inside the group object, as spelled in the file. */
  path: string[];
  group: string;
  parent: OObject;
  prop: string;
  raw: OValue;
}

function collect(theme: OObject, groups: [string, string[]][]): Map<string, Entry> {
  const out = new Map<string, Entry>();
  for (const [group, prefix] of groups) {
    const node = theme.get(group);
    if (!isObject(node)) continue;
    const walk = (obj: OObject, path: string[]): void => {
      for (const [k, v] of obj) {
        if (isObject(v)) {
          walk(v, [...path, k]);
          continue;
        }
        const segs = [...prefix, ...[...path, k].filter((s) => s !== 'DEFAULT').map(normalizeSegment)];
        out.set(toKey(segs), { path: [...path, k], group, parent: obj, prop: k, raw: v });
      }
    };
    walk(node, []);
  }
  return out;
}

const rawToString = (raw: OValue): string | undefined => {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  // fontFamily: ["Inter", "sans-serif"]; fontSize: ["14px", { lineHeight }] → first entry
  if (Array.isArray(raw)) {
    if (raw.every((x) => typeof x === 'string')) return (raw as string[]).join(', ');
    return typeof raw[0] === 'string' ? raw[0] : undefined;
  }
  return undefined;
};

export const tailwindAdapter: Adapter<TailwindTarget> = {
  format: 'tailwind',

  files: (t) => [t.path],

  modes: (t, figmaModes) => [normalizeMode(t.mode ?? figmaModes[0] ?? 'default')],

  accepts(t, name) {
    const segs = name.split('.');
    return groupsOf(t).some(([, prefix]) => prefix.every((p, i) => segs[i] === p) && segs.length > prefix.length);
  },

  read(t, files, modes) {
    const mode = modes[0] as string;
    const set: TokenSet = { source: t.path, modes, tokens: new Map(), warnings: [] };
    const text = files[t.path];
    if (text === undefined) {
      set.warnings.push(`${t.path} does not exist yet`);
      return set;
    }
    let root: OValue;
    try {
      root = parseJson(text);
    } catch (err) {
      throw new AdapterError((err as Error).message, t.path);
    }
    if (!isObject(root)) throw new AdapterError('expected a JSON object at the top level', t.path);
    const remBase = t.remBase ?? 16;
    for (const [key, entry] of collect(themeRoot(root), groupsOf(t))) {
      const str = rawToString(entry.raw);
      if (str === undefined) continue;
      const value = parseLiteral(str, { remBase });
      const mv: ModeValue = { value };
      set.tokens.set(key, { key, name: key.replace(/-/g, '.'), type: value.type, values: { [mode]: mv } });
    }
    // Restore proper names (segments can contain dashes): rebuild from group prefix + path.
    for (const [group, prefix] of groupsOf(t)) {
      for (const [key, entry] of collect(themeRoot(root), [[group, prefix]])) {
        const tok = set.tokens.get(key);
        if (tok) tok.name = toName([...prefix, ...entry.path.filter((s) => s !== 'DEFAULT').map(normalizeSegment)]);
      }
    }
    return set;
  },

  write(t, files, plan) {
    const mode = plan.modes[0] as string;
    const before = files[t.path];
    const root = before === undefined ? new Map<string, OValue>() : parseJson(before);
    if (!isObject(root)) throw new AdapterError('expected a JSON object at the top level', t.path);
    const theme = themeRoot(root);
    const groups = groupsOf(t);
    const entries = collect(theme, groups);
    const remBase = t.remBase ?? 16;
    const indent = before === undefined ? '  ' : detectIndent(before);

    const sampleOf = (type: string): string | undefined =>
      [...entries.values()]
        .map((e) => rawToString(e.raw))
        .find((s) => s !== undefined && parseLiteral(s).type === type);

    for (const token of plan.upserts) {
      const want = plan.valueFor(token, mode);
      if (!want) continue;
      const existing = entries.get(token.key);
      if (existing) {
        const str = rawToString(existing.raw);
        if (str !== undefined && sameValue(parseLiteral(str, { remBase }), want.value)) continue;
        const text = formatLiteral(want.value, hintsFrom(str, remBase));
        let next: OValue = text;
        if (typeof existing.raw === 'number' && want.value.type === 'number') next = want.value.value;
        else if (Array.isArray(existing.raw)) {
          next =
            existing.raw.every((x) => typeof x === 'string') && want.value.type === 'string'
              ? text.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
              : [text, ...existing.raw.slice(1)];
        }
        existing.parent.set(existing.prop, next);
        continue;
      }
      const segs = token.name.split('.');
      const match = groups.find(([, prefix]) => prefix.every((p, i) => segs[i] === p));
      if (!match) continue;
      const [group, prefix] = match;
      const rest = segs.slice(prefix.length);
      let node = theme.get(group);
      if (!isObject(node)) {
        node = new Map();
        theme.set(group, node);
      }
      for (const seg of rest.slice(0, -1)) {
        let next: OValue | undefined = node.get(seg);
        if (typeof next === 'string') {
          // `brand: "#…"` becomes `brand: { DEFAULT: "#…" }` when a child is added.
          next = new Map<string, OValue>([['DEFAULT', next]]);
          node.set(seg, next);
        } else if (!isObject(next)) {
          next = new Map();
          node.set(seg, next);
        }
        node = next;
      }
      const leaf = rest[rest.length - 1] as string;
      node.set(leaf, formatLiteral(want.value, hintsFrom(sampleOf(want.value.type), remBase)));
    }

    for (const token of plan.removals) {
      const entry = entries.get(token.key);
      if (entry) entry.parent.delete(entry.prop);
    }

    const text = `${stringifyJson(root, indent)}\n`;
    return text === before ? {} : { [t.path]: text };
  },
};
