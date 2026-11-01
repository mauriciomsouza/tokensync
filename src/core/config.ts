import { z } from 'zod';

const renameRule = z.object({
  match: z.string().describe('Regular expression tested against the dot name'),
  replace: z.string(),
});

const scope = {
  include: z.array(z.string()).optional().describe('Globs over dot names; only these tokens are compared'),
  exclude: z.array(z.string()).optional().describe('Globs over dot names to ignore'),
};

const cssTarget = z.object({
  format: z.literal('css'),
  path: z.string(),
  prefix: z.string().optional().describe('Custom property prefix, e.g. "ds" for --ds-color-bg'),
  modes: z
    .record(z.string(), z.string())
    .optional()
    .describe('Mode → selector or at-rule. The first entry is the base mode. Default { <first mode>: ":root" }'),
  remBase: z.number().positive().optional(),
  ...scope,
});

const dtcgTarget = z.object({
  format: z.literal('dtcg'),
  path: z
    .union([z.string(), z.record(z.string(), z.string())])
    .describe('One file for every mode, or { mode: file } for one file per mode'),
  mode: z.string().optional().describe('Mode a single file represents. Default: the first Figma mode'),
  ...scope,
});

const tailwindTarget = z.object({
  format: z.literal('tailwind'),
  path: z.string(),
  mode: z.string().optional().describe('Mode the theme represents. Default: the first Figma mode'),
  groups: z
    .record(z.string(), z.string())
    .optional()
    .describe('Tailwind theme key → token name prefix, e.g. { "colors": "color" }'),
  remBase: z.number().positive().optional(),
  ...scope,
});

export const targetSchema = z.discriminatedUnion('format', [cssTarget, dtcgTarget, tailwindTarget]);

export const configSchema = z.object({
  $schema: z.string().optional(),
  project: z.string().default('Design tokens'),
  figma: z
    .object({
      file: z.string().optional().describe('Path to a Figma Variables JSON (GET /v1/files/:key/variables/local)'),
      fileKey: z.string().optional().describe('Figma file key, fetched live with FIGMA_TOKEN'),
      modes: z.record(z.string(), z.string()).optional().describe('Rename Figma modes, e.g. { "Mode 1": "light" }'),
      collections: z
        .record(z.string(), z.object({ prefix: z.string().optional(), skip: z.boolean().optional() }))
        .optional()
        .describe('Per-collection options: a group prefix for its tokens, or skip it'),
      unitless: z.array(z.string()).optional().describe('Globs for FLOAT variables that are plain numbers, not px'),
      includeHidden: z.boolean().optional().describe('Include variables hidden from publishing'),
    })
    .default({}),
  threshold: z.number().min(0).default(1).describe('CIEDE2000 distance under which two colors are considered equal'),
  rename: z.array(renameRule).optional(),
  ...scope,
  targets: z.array(targetSchema).min(1),
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
