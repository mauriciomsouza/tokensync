import type { Config } from './config.js';
import { applyRenames, matchesAny, normalizeMode, normalizeSegment, splitFigmaName, toKey, toName } from './names.js';
import type { ModeValue, Rgba, Token, TokenSet, TokenType, TokenValue } from './types.js';

/* ------------------------------------------------------------------ */
/* Figma REST shapes (GET /v1/files/:file_key/variables/local)         */
/* ------------------------------------------------------------------ */

export interface FigmaAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
}

export type FigmaRawValue = boolean | number | string | Rgba | FigmaAlias;

export interface FigmaVariable {
  id: string;
  name: string;
  key?: string;
  variableCollectionId: string;
  resolvedType: 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';
  valuesByMode: Record<string, FigmaRawValue>;
  remote?: boolean;
  description?: string;
  hiddenFromPublishing?: boolean;
  scopes?: string[];
  codeSyntax?: Record<string, string>;
}

export interface FigmaCollection {
  id: string;
  name: string;
  key?: string;
  modes: { modeId: string; name: string }[];
  defaultModeId: string;
  remote?: boolean;
  hiddenFromPublishing?: boolean;
  variableIds?: string[];
}

export interface FigmaVariablesResponse {
  status?: number;
  error?: boolean;
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaCollection>;
  };
}

/** Mode key used for tokens that come from a single-mode collection: they apply to every mode. */
export const BASE_MODE = '*';

const isAlias = (v: FigmaRawValue): v is FigmaAlias =>
  typeof v === 'object' && v !== null && (v as FigmaAlias).type === 'VARIABLE_ALIAS';

const UNITLESS_SCOPES = new Set(['FONT_WEIGHT', 'OPACITY']);
const UNITLESS_NAME = /(^|\.)(weight|font-weight|opacity|z-index|zindex|ratio|scale)(\.|$)/;

export class FigmaFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FigmaFormatError';
  }
}

export function assertFigmaResponse(data: unknown): asserts data is FigmaVariablesResponse {
  const meta = (data as FigmaVariablesResponse | undefined)?.meta;
  if (!meta || typeof meta.variables !== 'object' || typeof meta.variableCollections !== 'object') {
    throw new FigmaFormatError(
      'This does not look like a Figma Variables response. Expected { meta: { variables, variableCollections } } ' +
        'as returned by GET /v1/files/:file_key/variables/local.',
    );
  }
}

/**
 * Reads a Figma Variables response into the normalized token model.
 *
 * - Collections become token groups (optionally prefixed via config).
 * - Multi-mode collections produce one value per mode; single-mode collections
 *   produce a base value that applies to every mode.
 * - `VARIABLE_ALIAS` values are resolved across collections, matching modes by
 *   name and falling back to the target collection's default mode.
 */
export function readFigma(data: unknown, config: Pick<Config, 'figma' | 'rename'> = { figma: {} }): TokenSet {
  assertFigmaResponse(data);
  const { variables, variableCollections } = data.meta;
  const opts = config.figma ?? {};
  const warnings: string[] = [];

  const modeName = (raw: string): string => normalizeMode(opts.modes?.[raw] ?? raw);
  const collectionModeName = (c: FigmaCollection, modeId: string): string | undefined => {
    const m = c.modes.find((x) => x.modeId === modeId);
    return m ? modeName(m.name) : undefined;
  };
  const isMultiMode = (c: FigmaCollection): boolean => c.modes.length > 1;

  // Stable ordering: collections by name, then the order Figma lists variables.
  const collections = Object.values(variableCollections).sort((a, b) => a.name.localeCompare(b.name));
  const modes: string[] = [];
  for (const c of collections) {
    if (!isMultiMode(c) || opts.collections?.[c.name]?.skip) continue;
    const ordered = [...c.modes].sort((a, b) =>
      a.modeId === c.defaultModeId ? -1 : b.modeId === c.defaultModeId ? 1 : 0,
    );
    for (const m of ordered) {
      const n = modeName(m.name);
      if (!modes.includes(n)) modes.push(n);
    }
  }

  const nameOf = (v: FigmaVariable): string => {
    const c = variableCollections[v.variableCollectionId];
    const prefix = c ? opts.collections?.[c.name]?.prefix : undefined;
    const segments = [...(prefix ? prefix.split(/[./]/).map(normalizeSegment) : []), ...splitFigmaName(v.name)];
    return applyRenames(toName(segments), config.rename);
  };

  const typeOf = (v: FigmaVariable, name: string): TokenType => {
    switch (v.resolvedType) {
      case 'COLOR':
        return 'color';
      case 'STRING':
        return 'string';
      case 'BOOLEAN':
        return 'boolean';
      case 'FLOAT': {
        if (matchesAny(name, opts.unitless)) return 'number';
        const scopes = v.scopes ?? [];
        if (scopes.length > 0 && scopes.every((s) => UNITLESS_SCOPES.has(s))) return 'number';
        return UNITLESS_NAME.test(name) ? 'number' : 'dimension';
      }
    }
  };

  const literal = (
    v: FigmaVariable,
    raw: Exclude<FigmaRawValue, FigmaAlias>,
    type: TokenType,
  ): TokenValue | undefined => {
    if (type === 'color' && typeof raw === 'object') {
      return { type: 'color', color: { r: raw.r, g: raw.g, b: raw.b, a: raw.a ?? 1 } };
    }
    if (type === 'dimension' && typeof raw === 'number') return { type: 'dimension', px: raw };
    if (type === 'number' && typeof raw === 'number') return { type: 'number', value: raw };
    if (type === 'string' && typeof raw === 'string') return { type: 'string', value: raw };
    if (type === 'boolean' && typeof raw === 'boolean') return { type: 'boolean', value: raw };
    warnings.push(`${v.name}: unexpected ${typeof raw} value for a ${v.resolvedType} variable`);
    return undefined;
  };

  /** Resolves one variable in a given mode (by name), following aliases. */
  const resolve = (
    v: FigmaVariable,
    wantedMode: string | undefined,
    seen: string[],
  ): { value: TokenValue; firstAlias?: string } | undefined => {
    if (seen.includes(v.id)) {
      warnings.push(`Alias cycle: ${[...seen, v.id].map((id) => variables[id]?.name ?? id).join(' → ')}`);
      return undefined;
    }
    const c = variableCollections[v.variableCollectionId];
    if (!c) {
      warnings.push(`${v.name}: unknown collection ${v.variableCollectionId}`);
      return undefined;
    }
    const mode =
      c.modes.find((m) => wantedMode !== undefined && modeName(m.name) === wantedMode)?.modeId ?? c.defaultModeId;
    const raw = v.valuesByMode[mode] ?? Object.values(v.valuesByMode)[0];
    if (raw === undefined) return undefined;
    if (isAlias(raw)) {
      const target = variables[raw.id];
      if (!target) {
        warnings.push(
          `${v.name}: alias points to a variable that is not in this file (${raw.id}); is it from a library?`,
        );
        return undefined;
      }
      const inner = resolve(target, wantedMode, [...seen, v.id]);
      return inner ? { value: inner.value, firstAlias: nameOf(target) } : undefined;
    }
    const value = literal(v, raw, typeOf(v, nameOf(v)));
    return value ? { value } : undefined;
  };

  const tokens = new Map<string, Token>();
  const ordered = collections.flatMap((c) => {
    if (opts.collections?.[c.name]?.skip) return [];
    const ids = c.variableIds ?? Object.keys(variables).filter((id) => variables[id]?.variableCollectionId === c.id);
    return ids.map((id) => variables[id]).filter((v): v is FigmaVariable => Boolean(v));
  });

  for (const v of ordered) {
    if (v.remote) continue;
    if (v.hiddenFromPublishing && !opts.includeHidden) continue;
    const c = variableCollections[v.variableCollectionId];
    if (!c) continue;
    const name = nameOf(v);
    const key = toKey(name.split('.'));
    const type = typeOf(v, name);
    const values: Record<string, ModeValue> = {};

    if (isMultiMode(c)) {
      for (const m of c.modes) {
        const mode = collectionModeName(c, m.modeId) as string;
        const r = resolve(v, mode, []);
        if (r) values[mode] = r.firstAlias ? { value: r.value, alias: r.firstAlias } : { value: r.value };
      }
    } else {
      const r = resolve(v, undefined, []);
      if (r) values[BASE_MODE] = r.firstAlias ? { value: r.value, alias: r.firstAlias } : { value: r.value };
    }

    if (Object.keys(values).length === 0) continue;
    if (tokens.has(key)) {
      warnings.push(`Duplicate token name "${name}" (from ${c.name}/${v.name}); the later one wins`);
    }
    const token: Token = { key, name, type, values };
    if (v.description) token.description = v.description;
    tokens.set(key, token);
  }

  return { source: 'figma', modes, tokens, warnings };
}

/* ------------------------------------------------------------------ */
/* Live fetch                                                          */
/* ------------------------------------------------------------------ */

export interface FetchOptions {
  fileKey: string;
  token: string;
  /** Defaults to https://api.figma.com */
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Fetches local variables from the Figma REST API.
 * The token is sent only in the `X-Figma-Token` header and is never included in errors.
 * Note: the Variables REST API requires a Figma Enterprise plan.
 */
export async function fetchFigmaVariables(opts: FetchOptions): Promise<FigmaVariablesResponse> {
  const doFetch = opts.fetch ?? fetch;
  const base = (opts.baseUrl ?? 'https://api.figma.com').replace(/\/$/, '');
  const url = `${base}/v1/files/${encodeURIComponent(opts.fileKey)}/variables/local`;
  let res: Response;
  try {
    res = await doFetch(url, { headers: { 'X-Figma-Token': opts.token, Accept: 'application/json' } });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // No `cause`: the original error may contain the token, and causes get logged verbatim.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`Could not reach the Figma API (${redact(reason, opts.token)})`);
  }
  if (!res.ok) {
    const hint =
      res.status === 403
        ? ' Check that FIGMA_TOKEN has the file_variables:read scope and that the file belongs to an Enterprise org.'
        : res.status === 404
          ? ' Check the file key.'
          : '';
    throw new Error(`Figma API responded ${res.status} ${res.statusText}.${hint}`);
  }
  const data: unknown = await res.json();
  assertFigmaResponse(data);
  return data;
}

export function redact(text: string, secret: string | undefined): string {
  if (!secret) return text;
  return text.split(secret).join('[redacted]');
}
