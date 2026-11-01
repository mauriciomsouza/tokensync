/**
 * Public API. Everything here is environment-agnostic (no `node:` imports)
 * except `node/io`, which is exported separately as helpers for Node callers.
 */
export * from './core/types.js';
export * from './core/color.js';
export * from './core/names.js';
export { compareValues, displayValue, formatLiteral, parseLiteral } from './core/value.js';
export {
  configSchema,
  defineConfig,
  parseConfig,
  ConfigError,
  type Config,
  type ConfigInput,
  type TargetConfig,
} from './core/config.js';
export { readFigma, fetchFigmaVariables, BASE_MODE, type FigmaVariablesResponse } from './core/figma.js';
export {
  check,
  sync,
  hasDrift,
  filesFor,
  adapters,
  type CheckInput,
  type CheckOutput,
  type SyncOutput,
} from './core/engine.js';
export type { Adapter, FileMap, WritePlan } from './adapters/types.js';
export { renderMarkdown, COMMENT_MARKER } from './render/markdown.js';
export { renderHtml, REPORT_CSS } from './render/html.js';
export { renderTerminal } from './render/terminal.js';
export { unifiedDiff } from './core/linediff.js';
export { VERSION } from './version.js';
