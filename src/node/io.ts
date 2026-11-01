import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FileMap } from '../adapters/types.js';
import { ConfigError, parseConfig, type Config } from '../core/config.js';
import { filesFor } from '../core/engine.js';
import { fetchFigmaVariables, redact } from '../core/figma.js';

export const CONFIG_NAMES = [
  'tokensync.config.json',
  'tokensync.config.ts',
  'tokensync.config.mjs',
  'tokensync.config.js',
];

export interface LoadedConfig {
  config: Config;
  /** Directory relative paths in the config resolve against. */
  root: string;
  path: string;
}

export async function loadConfig(explicit: string | undefined, cwd = process.cwd()): Promise<LoadedConfig> {
  const path = explicit ? resolve(cwd, explicit) : CONFIG_NAMES.map((n) => resolve(cwd, n)).find((p) => existsSync(p));
  if (!path) {
    throw new ConfigError(`No config found. Create tokensync.config.json (see README) or pass --config <path>.`);
  }
  if (!existsSync(path)) throw new ConfigError(`Config file not found: ${relative(cwd, path) || path}`);
  let raw: unknown;
  if (path.endsWith('.json')) {
    try {
      raw = JSON.parse(await readFile(path, 'utf8'));
    } catch (err) {
      throw new ConfigError(`Could not parse ${relative(cwd, path)}: ${(err as Error).message}`);
    }
  } else {
    // .ts configs rely on Node's built-in type stripping (Node 22.18+ / 23.6+).
    const mod = (await import(pathToFileURL(path).href)) as { default?: unknown };
    raw = mod.default ?? mod;
  }
  return { config: parseConfig(raw), root: dirname(path), path };
}

export async function readFiles(paths: string[], root: string): Promise<FileMap> {
  const out: FileMap = {};
  await Promise.all(
    paths.map(async (p) => {
      const abs = isAbsolute(p) ? p : resolve(root, p);
      out[p] = existsSync(abs) ? await readFile(abs, 'utf8') : undefined;
    }),
  );
  return out;
}

export async function loadTargetFiles(config: Config, root: string): Promise<FileMap> {
  return readFiles(filesFor(config), root);
}

export interface FigmaSourceOptions {
  /** Path from --figma, relative to cwd. */
  file?: string;
  fileKey?: string;
  cwd: string;
  root: string;
  config: Config;
  env?: NodeJS.ProcessEnv;
}

export async function loadFigma(o: FigmaSourceOptions): Promise<{ data: unknown; label: string }> {
  const env = o.env ?? process.env;
  const fileKey = o.fileKey ?? (o.file ? undefined : o.config.figma.fileKey);
  const file = o.file
    ? resolve(o.cwd, o.file)
    : !fileKey && o.config.figma.file
      ? resolve(o.root, o.config.figma.file)
      : undefined;

  if (file) {
    if (!existsSync(file)) throw new ConfigError(`Figma file not found: ${relative(o.cwd, file)}`);
    try {
      return { data: JSON.parse(await readFile(file, 'utf8')), label: relative(o.cwd, file) || file };
    } catch (err) {
      throw new ConfigError(`Could not parse ${relative(o.cwd, file)}: ${(err as Error).message}`);
    }
  }
  if (fileKey) {
    const token = env.FIGMA_TOKEN;
    if (!token)
      throw new ConfigError(
        'FIGMA_TOKEN is not set. Create a personal access token with the file_variables:read scope.',
      );
    try {
      const data = await fetchFigmaVariables({
        fileKey,
        token,
        ...(env.FIGMA_API_URL ? { baseUrl: env.FIGMA_API_URL } : {}),
      });
      return { data, label: `Figma file ${fileKey}` };
    } catch (err) {
      // No `cause` on purpose, so the token can never reach a log through it.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(redact((err as Error).message, token));
    }
  }
  throw new ConfigError(
    'No Figma source. Pass --figma <file.json>, --file-key <key> (with FIGMA_TOKEN), or set figma.file in the config.',
  );
}

/** Writes files atomically (temp file + rename) so a crash never leaves half a token file. */
export async function writeFiles(files: FileMap, root: string): Promise<string[]> {
  const written: string[] = [];
  for (const [p, content] of Object.entries(files)) {
    if (content === undefined) continue;
    const abs = isAbsolute(p) ? p : resolve(root, p);
    await mkdir(dirname(abs), { recursive: true });
    const tmp = `${abs}.tokensync-${process.pid}.tmp`;
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, abs);
    written.push(p);
  }
  return written;
}
