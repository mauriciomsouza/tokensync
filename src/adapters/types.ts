import type { TargetConfig } from '../core/config.js';
import type { ModeValue, Token, TokenSet } from '../core/types.js';

/** File contents keyed by path. `undefined` means the file does not exist yet. */
export type FileMap = Record<string, string | undefined>;

export interface WritePlan {
  /** Modes this target represents, base mode first. */
  modes: string[];
  /** Figma tokens to add or update. */
  upserts: Token[];
  /** Code tokens to delete (only with `--prune`). */
  removals: Token[];
  /** Keys that exist in the target after the write; aliases to these stay references. */
  available: Set<string>;
  /** Resolves the Figma value of a token for one of the target modes. */
  valueFor: (token: Token, mode: string) => ModeValue | undefined;
}

export interface Adapter<T extends TargetConfig = TargetConfig> {
  format: T['format'];
  /** Files the target reads and writes, with the mode each one represents (if per-file). */
  files(target: T): string[];
  /** Canonical modes covered by the target, base mode first. */
  modes(target: T, figmaModes: string[]): string[];
  /** Whether a Figma token can be represented by this target at all. */
  accepts(target: T, name: string): boolean;
  read(target: T, files: FileMap, modes: string[]): TokenSet;
  /** Returns the new contents of every file that changed. Never touches disk. */
  write(target: T, files: FileMap, plan: WritePlan): FileMap;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly file?: string,
  ) {
    super(file ? `${file}: ${message}` : message);
    this.name = 'AdapterError';
  }
}
