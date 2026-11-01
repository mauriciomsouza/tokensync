/**
 * The normalized token model every adapter reads into and writes from.
 *
 * A token has a stable `key` (kebab-case, used for matching across sources),
 * a human-friendly `name` (dot path, used for display and globbing), and one
 * value per mode.
 */

export type TokenType = 'color' | 'dimension' | 'number' | 'string' | 'boolean';

export interface Rgba {
  /** 0..1 */
  r: number;
  /** 0..1 */
  g: number;
  /** 0..1 */
  b: number;
  /** 0..1 */
  a: number;
}

export type TokenValue =
  | { type: 'color'; color: Rgba }
  | { type: 'dimension'; px: number }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean };

export interface ModeValue {
  /** Fully resolved value (aliases followed). */
  value: TokenValue;
  /** Dot-path name of the token this value references, if it is an alias. */
  alias?: string;
}

export interface Token {
  /** Matching key, e.g. `color-brand-500`. */
  key: string;
  /** Display name / dot path, e.g. `color.brand.500`. */
  name: string;
  type: TokenType;
  /** Values keyed by canonical mode name. */
  values: Record<string, ModeValue>;
  description?: string;
}

export interface TokenSet {
  /** Where the set came from, e.g. `figma` or `tokens.css`. */
  source: string;
  /** Canonical mode names present in this set. The first one is the default mode. */
  modes: string[];
  tokens: Map<string, Token>;
  /** Non-fatal problems found while reading (unresolved aliases, unknown values…). */
  warnings: string[];
}

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface ModeDiff {
  mode: string;
  figma?: ModeValue;
  code?: ModeValue;
  /** CIEDE2000 distance when both sides are colors. */
  deltaE?: number;
}

export interface Change {
  kind: ChangeKind;
  key: string;
  name: string;
  type: TokenType;
  /** One entry per compared mode that differs (or every mode for added/removed). */
  modes: ModeDiff[];
}

export interface TargetDiff {
  /** Label of the code target, usually its path. */
  target: string;
  format: string;
  /** Modes that were compared on both sides. */
  modes: string[];
  changes: Change[];
  /** Tokens that matched exactly or within tolerance. */
  inSync: number;
  /** Colors that differ but fall under the ΔE threshold. */
  withinTolerance: number;
  notes: string[];
}

export interface DriftResult {
  project: string;
  threshold: number;
  targets: TargetDiff[];
  summary: { added: number; removed: number; changed: number; inSync: number; total: number };
}
