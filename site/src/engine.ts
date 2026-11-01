/** Browser entry: the exact engine and renderers the CLI uses, minus Node-only pieces. */
export { parseConfig } from '../../src/core/config.js';
export { check, sync } from '../../src/core/engine.js';
export { renderHtml } from '../../src/render/html.js';
export { renderMarkdown } from '../../src/render/markdown.js';
export { unifiedDiff } from '../../src/core/linediff.js';
