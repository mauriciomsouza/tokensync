/**
 * Order-preserving JSON.
 *
 * `JSON.parse` hoists integer-like keys (`"100"`, `"500"`) to the front of an
 * object, which silently reorders palettes such as `{ "DEFAULT", "50", "100" }`.
 * tokensync promises stable key order when it writes JSON, so objects are parsed
 * into `Map`s and stringified back in insertion order.
 */

export type OValue = null | boolean | number | string | OValue[] | OObject;
export type OObject = Map<string, OValue>;

export const isObject = (v: OValue | undefined): v is OObject => v instanceof Map;

/** Objects that were written on a single line in the source; the writer keeps them that way. */
const inlineInSource = new WeakSet<OObject>();

export class JsonSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
    this.name = 'JsonSyntaxError';
  }
}

export function parseJson(text: string): OValue {
  let i = 0;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const fail = (msg: string): never => {
    const before = src.slice(0, i);
    const line = before.split('\n').length;
    const col = i - before.lastIndexOf('\n');
    throw new JsonSyntaxError(`${msg} at line ${line}, column ${col}`, i);
  };
  const ws = (): void => {
    while (i < src.length && /\s/.test(src[i] as string)) i++;
  };
  const value = (): OValue => {
    ws();
    const ch = src[i];
    if (ch === '{') return object();
    if (ch === '[') return array();
    if (ch === '"') return string();
    if (ch === 't' && src.startsWith('true', i)) return ((i += 4), true);
    if (ch === 'f' && src.startsWith('false', i)) return ((i += 5), false);
    if (ch === 'n' && src.startsWith('null', i)) return ((i += 4), null);
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (m) {
      i += m[0].length;
      return Number(m[0]);
    }
    return fail(ch === undefined ? 'Unexpected end of JSON' : `Unexpected character ${JSON.stringify(ch)}`);
  };
  const string = (): string => {
    const start = i;
    i++;
    while (i < src.length && src[i] !== '"') {
      if (src[i] === '\\') i++;
      i++;
    }
    if (i >= src.length) fail('Unterminated string');
    i++;
    return JSON.parse(src.slice(start, i)) as string;
  };
  const object = (): OObject => {
    const start = i;
    const out: OObject = new Map();
    const done = (): OObject => {
      i++;
      if (!src.slice(start, i).includes('\n')) inlineInSource.add(out);
      return out;
    };
    i++;
    ws();
    if (src[i] === '}') return done();
    for (;;) {
      ws();
      if (src[i] !== '"') fail('Expected property name');
      const key = string();
      ws();
      if (src[i] !== ':') fail('Expected ":"');
      i++;
      out.set(key, value());
      ws();
      if (src[i] === ',') {
        i++;
        continue;
      }
      if (src[i] === '}') return done();
      fail('Expected "," or "}"');
    }
  };
  const array = (): OValue[] => {
    const out: OValue[] = [];
    i++;
    ws();
    if (src[i] === ']') return (i++, out);
    for (;;) {
      out.push(value());
      ws();
      if (src[i] === ',') {
        i++;
        continue;
      }
      if (src[i] === ']') return (i++, out);
      fail('Expected "," or "]"');
    }
  };

  const result = value();
  ws();
  if (i < src.length) fail('Unexpected trailing content');
  return result;
}

/** Detects the indentation unit of a JSON document (defaults to two spaces). */
export function detectIndent(text: string): string {
  const m = /^[ \t]+(?=")/m.exec(text);
  return m?.[0] ?? '  ';
}

export interface StringifyOptions {
  /** Keep every "leaf" object (no nested objects) on one line when it fits, e.g. `{ "$value": "#fff" }`. */
  inlineLeaves?: boolean;
  /** Max width for inlined objects. Default 100. */
  width?: number;
}

const inlineObject = (value: OObject): string =>
  `{ ${[...value].map(([k, v]) => `${JSON.stringify(k)}: ${inlineValue(v)}`).join(', ')} }`;
const inlineValue = (v: OValue): string =>
  isObject(v) ? inlineObject(v) : Array.isArray(v) ? `[${v.map(inlineValue).join(', ')}]` : JSON.stringify(v);

export function stringifyJson(value: OValue, indent = '  ', depth = 0, opts: StringifyOptions = {}): string {
  const pad = indent.repeat(depth + 1);
  const end = indent.repeat(depth);
  if (isObject(value)) {
    if (value.size === 0) return '{}';
    const isLeaf = [...value.values()].every((v) => !isObject(v) && !(Array.isArray(v) && v.some(isObject)));
    if (inlineInSource.has(value)) return inlineObject(value);
    if (opts.inlineLeaves && isLeaf) {
      const one = inlineObject(value);
      if (one.length + depth * indent.length <= (opts.width ?? 100)) return one;
    }
    const body = [...value].map(([k, v]) => `${pad}${JSON.stringify(k)}: ${stringifyJson(v, indent, depth + 1, opts)}`);
    return `{\n${body.join(',\n')}\n${end}}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    // Short arrays of primitives (e.g. color components) stay on one line.
    if (value.every((v) => v === null || typeof v !== 'object') && value.length <= 4) {
      return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
    }
    return `[\n${value.map((v) => pad + stringifyJson(v, indent, depth + 1, opts)).join(',\n')}\n${end}]`;
  }
  return JSON.stringify(value);
}

/** Converts plain JS data into the ordered representation. */
export function fromPlain(value: unknown): OValue {
  if (value === null || typeof value !== 'object') return value as OValue;
  if (Array.isArray(value)) return value.map(fromPlain);
  return new Map(Object.entries(value).map(([k, v]) => [k, fromPlain(v)]));
}

export function toPlain(value: OValue): unknown {
  if (isObject(value)) return Object.fromEntries([...value].map(([k, v]) => [k, toPlain(v)]));
  if (Array.isArray(value)) return value.map(toPlain);
  return value;
}
