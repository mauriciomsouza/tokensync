/**
 * Name normalization.
 *
 * Every source spells token names differently:
 *   Figma     `Color/Brand/500`, `Spacing/Space 4`, `radius/md`
 *   CSS       `--color-brand-500`, `--ds-space-4`
 *   DTCG      `{ "color": { "brand": { "500": … } } }`
 *   Tailwind  `colors.brand.500`
 *
 * tokensync turns each one into a list of lowercase, kebab-case segments.
 * The *name* is the segments joined with `.` and is what people read and glob.
 * The *key* is the segments joined with `-` and is what drift is matched on,
 * so `color.brand.500` (DTCG) and `--color-brand-500` (CSS) are the same token.
 */

/** `Brand Primary` → `brand-primary`, `fontSize` → `font-size`, `0.5` → `0-5`. */
export function normalizeSegment(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function splitFigmaName(name: string): string[] {
  return name.split('/').map(normalizeSegment).filter(Boolean);
}

export function toName(segments: readonly string[]): string {
  return segments.join('.');
}

export function toKey(segments: readonly string[]): string {
  return segments.join('-');
}

/** `color.brand.500` → `color-brand-500`. */
export function nameToKey(name: string): string {
  return toKey(name.split('.'));
}

/** `color.brand.500` + prefix `ds` → `--ds-color-brand-500`. */
export function cssVarName(key: string, prefix?: string): string {
  return prefix ? `--${normalizeSegment(prefix)}-${key}` : `--${key}`;
}

/** `--ds-color-brand-500` → `color-brand-500` (or undefined when the prefix does not match). */
export function keyFromCssVar(varName: string, prefix?: string): string | undefined {
  if (!varName.startsWith('--')) return undefined;
  const bare = varName.slice(2);
  if (!prefix) return bare;
  const p = `${normalizeSegment(prefix)}-`;
  return bare.startsWith(p) ? bare.slice(p.length) : undefined;
}

/** Canonical mode name: `Light` → `light`, `High Contrast` → `high-contrast`. */
export function normalizeMode(name: string): string {
  return normalizeSegment(name) || 'default';
}

/**
 * Glob over dot names. `*` matches within one segment, `**` matches across
 * segments. `color.*` matches `color.bg` but not `color.brand.500`;
 * `color.**` matches both.
 */
export function globToRegExp(glob: string): RegExp {
  let src = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i] as string;
    if (ch === '*' && glob[i + 1] === '*') {
      src += '.*';
      i++;
    } else if (ch === '*') {
      src += '[^.]*';
    } else {
      src += ch.replace(/[.|\\{}()[\]^$+?]/g, '\\$&');
    }
  }
  return new RegExp(`^${src}$`);
}

export function matchesAny(name: string, globs: readonly string[] | undefined): boolean {
  if (!globs || globs.length === 0) return false;
  return globs.some((g) => globToRegExp(g).test(name));
}

export interface RenameRule {
  /** Regular expression tested against the dot name. */
  match: string;
  replace: string;
}

export function applyRenames(name: string, rules: readonly RenameRule[] | undefined): string {
  if (!rules) return name;
  return rules.reduce((acc, r) => acc.replace(new RegExp(r.match), r.replace), name);
}
