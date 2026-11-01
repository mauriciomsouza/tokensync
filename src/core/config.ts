import * as z from 'zod/mini';

/*
 * Config schema. Uses `zod/mini` (tree-shakable) so the same validation runs in
 * the browser playground without shipping ~450 KB of zod. Field docs live in
 * tokensync.schema.json for editor autocompletion and in the README.
 */

const scope = {
  /** Globs over dot names; only these tokens are compared. */
  include: z.optional(z.array(z.string())),
  /** Globs over dot names to ignore. */
  exclude: z.optional(z.array(z.string())),
};

const renameRule = z.object({
  /** Regular expression tested against the dot name. */
  match: z.string(),
  replace: z.string(),
});

const positive = z.number().check(z.positive());

const cssTarget = z.object({
  format: z.literal('css'),
  path: z.string(),
  /** Custom property prefix, e.g. "ds" for --ds-color-bg. */
  prefix: z.optional(z.string()),
  /** Mode → selector or at-rule. The first entry is the base mode. Default { <first mode>: ":root" }. */
  modes: z.optional(z.record(z.string(), z.string())),
  remBase: z.optional(positive),
  ...scope,
});

const dtcgTarget = z.object({
  format: z.literal('dtcg'),
  /** One file for every mode, or { mode: file } for one file per mode. */
  path: z.union([z.string(), z.record(z.string(), z.string())]),
  /** Mode a single file represents. Default: the first Figma mode. */
  mode: z.optional(z.string()),
  ...scope,
});

const tailwindTarget = z.object({
  format: z.literal('tailwind'),
  path: z.string(),
  /** Mode the theme represents. Default: the first Figma mode. */
  mode: z.optional(z.string()),
  /** Tailwind theme key → token name prefix, e.g. { "colors": "color" }. */
  groups: z.optional(z.record(z.string(), z.string())),
  remBase: z.optional(positive),
  ...scope,
});

export const targetSchema = z.discriminatedUnion('format', [cssTarget, dtcgTarget, tailwindTarget]);

export const configSchema = z.object({
  $schema: z.optional(z.string()),
  project: z._default(z.string(), 'Design tokens'),
  figma: z._default(
    z.object({
      /** Path to a Figma Variables JSON (GET /v1/files/:key/variables/local). */
      file: z.optional(z.string()),
      /** Figma file key, fetched live with FIGMA_TOKEN. */
      fileKey: z.optional(z.string()),
      /** Rename Figma modes, e.g. { "Mode 1": "light" }. */
      modes: z.optional(z.record(z.string(), z.string())),
      /** Per-collection options: a group prefix for its tokens, or skip it. */
      collections: z.optional(
        z.record(z.string(), z.object({ prefix: z.optional(z.string()), skip: z.optional(z.boolean()) })),
      ),
      /** Globs for FLOAT variables that are plain numbers, not px. */
      unitless: z.optional(z.array(z.string())),
      /** Include variables hidden from publishing. */
      includeHidden: z.optional(z.boolean()),
    }),
    {},
  ),
  /** CIEDE2000 distance under which two colors are considered equal. */
  threshold: z._default(z.number().check(z.gte(0)), 1),
  rename: z.optional(z.array(renameRule)),
  ...scope,
  targets: z.array(targetSchema).check(z.minLength(1, 'add at least one target (css, dtcg or tailwind)')),
});

export type Config = z.infer<typeof configSchema>;
export type ConfigInput = z.input<typeof configSchema>;
export type TargetConfig = z.infer<typeof targetSchema>;
export type CssTarget = z.infer<typeof cssTarget>;
export type DtcgTarget = z.infer<typeof dtcgTarget>;
export type TailwindTarget = z.infer<typeof tailwindTarget>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function parseConfig(input: unknown): Config {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ConfigError(`Invalid tokensync config:\n${lines.join('\n')}`);
  }
  return result.data;
}

export function targetLabel(t: TargetConfig): string {
  return typeof t.path === 'string' ? t.path : Object.values(t.path).join(', ');
}

/** Typed helper for `tokensync.config.ts`. */
export function defineConfig(config: ConfigInput): ConfigInput {
  return config;
}
