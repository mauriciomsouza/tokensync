import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseConfig, type Config } from '../src/core/config.js';
import type { FileMap } from '../src/adapters/types.js';
import { filesFor } from '../src/core/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
export const AURORA = resolve(here, '../examples/aurora');

export function aurora(): { config: Config; figma: unknown; files: FileMap } {
  const config = parseConfig(JSON.parse(readFileSync(resolve(AURORA, 'tokensync.config.json'), 'utf8')));
  const figma: unknown = JSON.parse(readFileSync(resolve(AURORA, 'figma/variables.json'), 'utf8'));
  const files: FileMap = {};
  for (const p of filesFor(config)) files[p] = readFileSync(resolve(AURORA, p), 'utf8');
  return { config, figma, files };
}

/** Builds a tiny Figma Variables payload. */
export function figmaPayload(spec: {
  collections: { id: string; name: string; modes: string[] }[];
  variables: {
    id: string;
    name: string;
    collection: string;
    type: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
    values: unknown[];
    scopes?: string[];
  }[];
}): unknown {
  const variableCollections: Record<string, unknown> = {};
  for (const c of spec.collections) {
    variableCollections[c.id] = {
      id: c.id,
      name: c.name,
      modes: c.modes.map((m, i) => ({ modeId: `${c.id}:${i}`, name: m })),
      defaultModeId: `${c.id}:0`,
      variableIds: spec.variables.filter((v) => v.collection === c.id).map((v) => v.id),
    };
  }
  const variables: Record<string, unknown> = {};
  for (const v of spec.variables) {
    variables[v.id] = {
      id: v.id,
      name: v.name,
      variableCollectionId: v.collection,
      resolvedType: v.type,
      scopes: v.scopes ?? ['ALL_SCOPES'],
      valuesByMode: Object.fromEntries(v.values.map((val, i) => [`${v.collection}:${i}`, val])),
    };
  }
  return { status: 200, error: false, meta: { variables, variableCollections } };
}

export const rgb = (hex: string, a = 1): { r: number; g: number; b: number; a: number } => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
  a,
});
export const alias = (id: string): { type: 'VARIABLE_ALIAS'; id: string } => ({ type: 'VARIABLE_ALIAS', id });
