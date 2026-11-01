import { cssAdapter } from '../adapters/css.js';
import { dtcgAdapter } from '../adapters/dtcg.js';
import { tailwindAdapter } from '../adapters/tailwind.js';
import type { Adapter, FileMap } from '../adapters/types.js';
import { targetLabel, type Config, type TargetConfig } from './config.js';
import { BASE_MODE, readFigma } from './figma.js';
import { matchesAny } from './names.js';
import type { Change, DriftResult, ModeDiff, ModeValue, TargetDiff, Token, TokenSet } from './types.js';
import { compareValues, displayValue } from './value.js';

/**
 * The engine is pure: it takes parsed config, the Figma payload and a map of
 * file contents, and returns data. No filesystem, no network, no clock — which
 * is why the exact same code runs in the CLI, the GitHub Action and the
 * browser playground.
 */

export const adapters: Record<TargetConfig['format'], Adapter> = {
  css: cssAdapter as Adapter,
  dtcg: dtcgAdapter as Adapter,
  tailwind: tailwindAdapter as Adapter,
};

export function adapterFor(t: TargetConfig): Adapter {
  return adapters[t.format];
}

/** Every file a config reads, so callers know what to load. */
export function filesFor(config: Config): string[] {
  return [...new Set(config.targets.flatMap((t) => adapterFor(t).files(t)))];
}

/** Value of a Figma token in a mode: exact mode, then the collection's base value, then the first mode. */
export function figmaValueFor(token: Token, mode: string, figmaModes: string[]): ModeValue | undefined {
  return (
    token.values[mode] ??
    token.values[BASE_MODE] ??
    (figmaModes[0] !== undefined ? token.values[figmaModes[0]] : undefined) ??
    Object.values(token.values)[0]
  );
}

function inScope(name: string, config: Config, target: TargetConfig): boolean {
  if (config.include?.length && !matchesAny(name, config.include)) return false;
  if (matchesAny(name, config.exclude)) return false;
  if (target.include?.length && !matchesAny(name, target.include)) return false;
  if (matchesAny(name, target.exclude)) return false;
  return true;
}

export function scopedFigma(figma: TokenSet, config: Config, target: TargetConfig): Token[] {
  const adapter = adapterFor(target);
  return [...figma.tokens.values()].filter((t) => inScope(t.name, config, target) && adapter.accepts(target, t.name));
}

const sig = (d: ModeDiff): string =>
  JSON.stringify([
    d.figma && displayValue(d.figma.value),
    d.figma?.alias,
    d.code && displayValue(d.code.value),
    d.code?.alias,
  ]);

/** When every mode differs in exactly the same way, report it once as `*` (all modes). */
function collapseModes(modes: ModeDiff[], total: number): ModeDiff[] {
  const first = modes[0];
  if (total < 2 || modes.length !== total || !first) return modes;
  return modes.every((d) => sig(d) === sig(first)) ? [{ ...first, mode: BASE_MODE }] : modes;
}

export function diffTarget(figma: TokenSet, code: TokenSet, config: Config, target: TargetConfig): TargetDiff {
  const adapter = adapterFor(target);
  const modes = adapter.modes(target, figma.modes);
  const threshold = config.threshold;
  const changes: Change[] = [];
  const notes = [...code.warnings];
  let inSync = 0;
  let withinTolerance = 0;

  const unknownModes = figma.modes.length > 0 ? modes.filter((m) => !figma.modes.includes(m)) : [];
  if (unknownModes.length > 0) {
    notes.push(
      `Mode${unknownModes.length > 1 ? 's' : ''} ${unknownModes.join(', ')} not found in Figma (${figma.modes.join(', ')}); compared against the default mode`,
    );
  }

  const figmaTokens = scopedFigma(figma, config, target);
  const figmaKeys = new Set(figmaTokens.map((t) => t.key));

  for (const ft of figmaTokens) {
    const ct = code.tokens.get(ft.key);
    const perMode: ModeDiff[] = modes.map((mode) => {
      const d: ModeDiff = { mode };
      const fv = figmaValueFor(ft, mode, figma.modes);
      if (fv) d.figma = fv;
      const cv = ct?.values[mode];
      if (cv) d.code = cv;
      return d;
    });
    if (!ct) {
      changes.push({
        kind: 'added',
        key: ft.key,
        name: ft.name,
        type: ft.type,
        modes: collapseModes(
          perMode.filter((m) => m.figma),
          modes.length,
        ),
      });
      continue;
    }
    const differing: ModeDiff[] = [];
    let tolerated = false;
    for (const d of perMode) {
      if (!d.figma) continue;
      if (!d.code) {
        differing.push(d);
        continue;
      }
      const cmp = compareValues(d.figma.value, d.code.value, threshold);
      if (cmp.deltaE !== undefined) d.deltaE = Math.round(cmp.deltaE * 100) / 100;
      if (!cmp.equal) differing.push(d);
      else if (cmp.withinTolerance) tolerated = true;
    }
    if (differing.length > 0) {
      changes.push({
        kind: 'changed',
        key: ft.key,
        name: ft.name,
        type: ft.type,
        modes: collapseModes(differing, modes.length),
      });
    } else {
      inSync++;
      if (tolerated) withinTolerance++;
    }
  }

  for (const ct of code.tokens.values()) {
    if (figmaKeys.has(ct.key) || !inScope(ct.name, config, target)) continue;
    const perMode = modes.flatMap((mode) => {
      const v = ct.values[mode];
      return v ? [{ mode, code: v }] : [];
    });
    changes.push({
      kind: 'removed',
      key: ct.key,
      name: ct.name,
      type: ct.type,
      modes: collapseModes(perMode, modes.length),
    });
  }

  const order = { changed: 0, added: 1, removed: 2 } as const;
  changes.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, 'en', { numeric: true }));

  return { target: targetLabel(target), format: target.format, modes, changes, inSync, withinTolerance, notes };
}

export interface CheckInput {
  config: Config;
  /** Raw Figma Variables payload. */
  figma: unknown;
  files: FileMap;
}

export interface CheckOutput {
  result: DriftResult;
  figma: TokenSet;
  warnings: string[];
}

export function check({ config, figma: raw, files }: CheckInput): CheckOutput {
  const figma = readFigma(raw, config);
  const targets = config.targets.map((t) => {
    const adapter = adapterFor(t);
    const modes = adapter.modes(t, figma.modes);
    const code = adapter.read(t, files, modes);
    return diffTarget(figma, code, config, t);
  });
  const count = (k: Change['kind']): number =>
    targets.reduce((n, t) => n + t.changes.filter((c) => c.kind === k).length, 0);
  const summary = {
    added: count('added'),
    removed: count('removed'),
    changed: count('changed'),
    inSync: targets.reduce((n, t) => n + t.inSync, 0),
    total: 0,
  };
  summary.total = summary.added + summary.removed + summary.changed;
  return {
    result: { project: config.project, threshold: config.threshold, targets, summary },
    figma,
    warnings: figma.warnings,
  };
}

export function hasDrift(result: DriftResult): boolean {
  return result.summary.total > 0;
}

export interface SyncOptions {
  /** Also delete tokens that exist in code but not in Figma. */
  prune?: boolean;
}

export interface SyncOutput extends CheckOutput {
  /** New contents of every file that would change. */
  writes: FileMap;
}

/** Computes the file contents that bring every target in line with Figma. Writes nothing. */
export function sync(input: CheckInput, opts: SyncOptions = {}): SyncOutput {
  const out = check(input);
  const { config, files } = input;
  const writes: FileMap = {};
  config.targets.forEach((t, i) => {
    const adapter = adapterFor(t);
    const diff = out.result.targets[i] as TargetDiff;
    const modes = adapter.modes(t, out.figma.modes);
    const current: FileMap = { ...files, ...writes };
    const code = adapter.read(t, current, modes);
    const changedKeys = new Set(diff.changes.filter((c) => c.kind !== 'removed').map((c) => c.key));
    const removedKeys = new Set(diff.changes.filter((c) => c.kind === 'removed').map((c) => c.key));
    const upserts = scopedFigma(out.figma, config, t).filter((tok) => changedKeys.has(tok.key));
    const removals = opts.prune ? [...code.tokens.values()].filter((tok) => removedKeys.has(tok.key)) : [];
    const available = new Set([...scopedFigma(out.figma, config, t).map((x) => x.key)]);
    if (!opts.prune) for (const k of code.tokens.keys()) available.add(k);
    Object.assign(
      writes,
      adapter.write(t, current, {
        modes,
        upserts,
        removals,
        available,
        valueFor: (tok, mode) => figmaValueFor(tok, mode, out.figma.modes),
      }),
    );
  });
  return { ...out, writes };
}
