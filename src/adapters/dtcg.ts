import type { DtcgTarget } from '../core/config.js';
import { normalizeMode, normalizeSegment, toKey, toName } from '../core/names.js';
import { detectIndent, isObject, parseJson, stringifyJson, type OObject, type OValue } from '../core/ojson.js';
import type { ModeValue, Rgba, Token, TokenSet, TokenType, TokenValue } from '../core/types.js';
import { parseLiteral, sameValue } from '../core/value.js';
import { toHex } from '../core/color.js';
import { AdapterError, type Adapter, type FileMap, type WritePlan } from './types.js';

/**
 * W3C Design Tokens Community Group format (https://tr.designtokens.org/format/).
 * Supports both the classic string values (`"#0b5fff"`, `"16px"`) and the
 * structured values of the 2025 draft (`{ colorSpace, components }`, `{ value, unit }`).
 */

const ALIAS = /^\{([^}]+)\}$/;

interface Entry {
  /** Original path segments, as spelled in the file. */
  path: string[];
  node: OObject;
  type?: string;
}

function fileModes(t: DtcgTarget, figmaModes: string[]): [string, string][] {
  if (typeof t.path === 'string') return [[normalizeMode(t.mode ?? figmaModes[0] ?? 'default'), t.path]];
  return Object.entries(t.path).map(([m, p]) => [normalizeMode(m), p]);
}

function collect(root: OValue, file: string): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const walk = (node: OObject, path: string[], inherited?: string): void => {
    const groupType = typeof node.get('$type') === 'string' ? (node.get('$type') as string) : inherited;
    if (node.has('$value')) {
      const key = toKey(path.map(normalizeSegment));
      const entry: Entry = { path, node };
      if (groupType) entry.type = groupType;
      out.set(key, entry);
      return;
    }
    for (const [k, v] of node) {
      if (k.startsWith('$')) continue;
      if (isObject(v)) walk(v, [...path, k], groupType);
    }
  };
  if (!isObject(root)) throw new AdapterError('expected a JSON object at the top level', file);
  walk(root, []);
  return out;
}

function parseDtcgValue(raw: OValue | undefined, type: string | undefined): TokenValue | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') {
    const v = parseLiteral(raw);
    if (type === 'number' && v.type === 'dimension') return { type: 'number', value: v.px };
    return v;
  }
  if (typeof raw === 'number') {
    return type === 'dimension' ? { type: 'dimension', px: raw } : { type: 'number', value: raw };
  }
  if (typeof raw === 'boolean') return { type: 'boolean', value: raw };
  if (Array.isArray(raw)) {
    // fontFamily: ["Inter", "sans-serif"]
    return { type: 'string', value: raw.map((x) => String(x)).join(', ') };
  }
  if (isObject(raw)) {
    if (raw.has('colorSpace') || raw.has('components')) {
      const hex = raw.get('hex');
      const comps = raw.get('components');
      const alpha = typeof raw.get('alpha') === 'number' ? (raw.get('alpha') as number) : 1;
      if (Array.isArray(comps) && comps.length === 3 && comps.every((c) => typeof c === 'number')) {
        const [r, g, b] = comps as [number, number, number];
        return { type: 'color', color: { r, g, b, a: alpha } };
      }
      if (typeof hex === 'string') {
        const v = parseLiteral(hex);
        if (v.type === 'color') return { type: 'color', color: { ...v.color, a: alpha } };
      }
      return undefined;
    }
    if (raw.has('value') && raw.has('unit')) {
      const value = Number(raw.get('value'));
      const unit = raw.get('unit');
      return { type: 'dimension', px: unit === 'rem' ? value * 16 : value };
    }
  }
  return undefined;
}

const typeName = (t: TokenType, name: string): string | undefined => {
  if (t === 'color' || t === 'dimension' || t === 'number') return t;
  if (t === 'string' && /font[-.]?family|(^|\.)family(\.|$)/.test(name)) return 'fontFamily';
  return undefined;
};

const round = (n: number): number => Math.round(n * 10000) / 10000;

function encodeColor(c: Rgba, like: OValue | undefined): OValue {
  if (isObject(like)) {
    const out: OObject = new Map<string, OValue>([
      ['colorSpace', 'srgb'],
      ['components', [round(c.r), round(c.g), round(c.b)]],
    ]);
    if (c.a < 1 || like.has('alpha')) out.set('alpha', round(c.a));
    out.set('hex', toHex({ ...c, a: 1 }));
    return out;
  }
  return toHex(c);
}

function encodeValue(v: TokenValue, like: OValue | undefined): OValue {
  switch (v.type) {
    case 'color':
      return encodeColor(v.color, like);
    case 'dimension':
      if (isObject(like)) {
        const unit = like.get('unit') === 'rem' ? 'rem' : 'px';
        return new Map<string, OValue>([
          ['value', unit === 'rem' ? round(v.px / 16) : round(v.px)],
          ['unit', unit],
        ]);
      }
      if (typeof like === 'number') return round(v.px);
      return `${round(v.px)}px`;
    case 'number':
      return typeof like === 'string' ? String(round(v.value)) : round(v.value);
    case 'boolean':
      return v.value;
    case 'string':
      if (Array.isArray(like)) return v.value.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
      return v.value;
  }
}

export const dtcgAdapter: Adapter<DtcgTarget> = {
  format: 'dtcg',

  files: (t) => fileModes(t, []).map(([, p]) => p),

  modes: (t, figmaModes) => fileModes(t, figmaModes).map(([m]) => m),

  accepts: () => true,

  read(t, files, modes) {
    const set: TokenSet = {
      source: Object.values(fileModes(t, modes))
        .map(([, p]) => p)
        .join(', '),
      modes,
      tokens: new Map(),
      warnings: [],
    };
    const perMode = new Map<string, Map<string, Entry>>();
    for (const [mode, path] of fileModes(t, modes)) {
      const text = files[path];
      if (text === undefined) {
        set.warnings.push(`${path} does not exist yet`);
        perMode.set(mode, new Map());
        continue;
      }
      let root: OValue;
      try {
        root = parseJson(text);
      } catch (err) {
        throw new AdapterError((err as Error).message, path);
      }
      perMode.set(mode, collect(root, path));
    }

    const resolve = (mode: string, entry: Entry, seen: string[]): ModeValue | undefined => {
      const raw = entry.node.get('$value');
      const ref = typeof raw === 'string' ? ALIAS.exec(raw) : null;
      if (ref?.[1]) {
        const key = toKey(ref[1].split('.').map(normalizeSegment));
        const target = perMode.get(mode)?.get(key);
        if (!target || seen.includes(key)) {
          set.warnings.push(`${toName(entry.path)}: could not resolve ${raw as string}`);
          return undefined;
        }
        const inner = resolve(mode, target, [...seen, key]);
        return inner ? { value: inner.value, alias: toName(ref[1].split('.').map(normalizeSegment)) } : undefined;
      }
      const value = parseDtcgValue(raw, entry.type);
      if (!value) set.warnings.push(`${toName(entry.path)}: unsupported $value`);
      return value ? { value } : undefined;
    };

    const keys = new Set<string>();
    for (const m of perMode.values()) for (const k of m.keys()) keys.add(k);
    for (const key of keys) {
      const values: Record<string, ModeValue> = {};
      let name = '';
      let description: string | undefined;
      for (const [mode, entries] of perMode) {
        const entry = entries.get(key);
        if (!entry) continue;
        name ||= toName(entry.path.map(normalizeSegment));
        const d = entry.node.get('$description');
        if (typeof d === 'string') description ??= d;
        const v = resolve(mode, entry, [key]);
        if (v) values[mode] = v;
      }
      const first = Object.values(values)[0];
      if (!first) continue;
      const token: Token = { key, name, type: first.value.type, values };
      if (description) token.description = description;
      set.tokens.set(key, token);
    }
    return set;
  },

  write(t, files: FileMap, plan: WritePlan): FileMap {
    const out: FileMap = {};
    for (const [mode, path] of fileModes(t, plan.modes)) {
      const before = files[path];
      const root = before === undefined ? new Map<string, OValue>() : parseJson(before);
      if (!isObject(root)) throw new AdapterError('expected a JSON object at the top level', path);
      const entries = collect(root, path);
      const indent = before === undefined ? '  ' : detectIndent(before);

      // Learn the file's value style from existing tokens.
      const sample = (type: TokenType): OValue | undefined =>
        [...entries.values()]
          .map((e) => e.node.get('$value'))
          .find((v) => {
            const p = parseDtcgValue(v, undefined);
            return p?.type === type && !(typeof v === 'string' && ALIAS.test(v));
          });

      const pathFor = (key: string, name: string): string[] => entries.get(key)?.path ?? name.split('.');

      const ensure = (segments: string[]): OObject => {
        let node: OObject = root;
        for (const seg of segments) {
          let next = node.get(seg);
          if (!isObject(next)) {
            next = new Map();
            node.set(seg, next);
          }
          node = next;
        }
        return node;
      };

      for (const token of plan.upserts) {
        const want = plan.valueFor(token, mode);
        if (!want) continue;
        const existing = entries.get(token.key);
        const aliasKey = want.alias?.replace(/\./g, '-');
        let encoded: OValue;
        if (aliasKey && plan.available.has(aliasKey)) {
          encoded = `{${pathFor(aliasKey, want.alias as string).join('.')}}`;
        } else {
          const like = existing?.node.get('$value');
          encoded = encodeValue(
            want.value,
            like !== undefined && !(typeof like === 'string' && ALIAS.test(like)) ? like : sample(want.value.type),
          );
        }
        if (existing) {
          const current = existing.node.get('$value');
          const currentParsed = parseDtcgValue(current, existing.type);
          const isAliasNow = typeof current === 'string' && ALIAS.test(current);
          if (!isAliasNow && !want.alias && currentParsed && sameValue(currentParsed, want.value)) continue;
          if (stringifyJson(current ?? null) === stringifyJson(encoded)) continue;
          existing.node.set('$value', encoded);
          continue;
        }
        const segments = pathFor(token.key, token.name);
        const parent = ensure(segments.slice(0, -1));
        const node: OObject = new Map();
        const tn = typeName(token.type, token.name);
        if (tn && !parentHasType(root, segments.slice(0, -1), tn)) node.set('$type', tn);
        node.set('$value', encoded);
        if (token.description) node.set('$description', token.description);
        parent.set(segments[segments.length - 1] as string, node);
      }

      for (const token of plan.removals) {
        const entry = entries.get(token.key);
        if (!entry) continue;
        removePath(root, entry.path);
      }

      const text = `${stringifyJson(root, indent, 0, { inlineLeaves: before !== undefined && newLeavesInline(root) })}\n`;
      if (text !== before) out[path] = text;
    }
    return out;
  },
};

function parentHasType(root: OObject, segments: string[], type: string): boolean {
  let node: OValue | undefined = root;
  let inherited: OValue | undefined;
  for (const seg of segments) {
    if (!isObject(node)) return false;
    if (node.has('$type')) inherited = node.get('$type');
    node = node.get(seg);
  }
  if (isObject(node) && node.has('$type')) inherited = node.get('$type');
  return inherited === type;
}

function removePath(root: OObject, path: string[]): void {
  const stack: OObject[] = [root];
  for (const seg of path.slice(0, -1)) {
    const next = stack[stack.length - 1]?.get(seg);
    if (!isObject(next)) return;
    stack.push(next);
  }
  stack[stack.length - 1]?.delete(path[path.length - 1] as string);
  // Drop groups left empty.
  for (let i = stack.length - 1; i > 0; i--) {
    const node = stack[i] as OObject;
    if ([...node.keys()].some((k) => !k.startsWith('$'))) break;
    stack[i - 1]?.delete(path[i - 1] as string);
  }
}

/** New tokens are written inline when most existing tokens in the file are. */
function newLeavesInline(root: OObject): boolean {
  let inline = 0;
  let total = 0;
  const walk = (n: OObject): void => {
    for (const [k, v] of n) {
      if (!isObject(v) || k.startsWith('$')) continue;
      if (v.has('$value')) {
        total++;
        if (stringifyJson(v).indexOf('\n') === -1) inline++;
      } else walk(v);
    }
  };
  walk(root);
  return total > 0 && inline / total > 0.5;
}
