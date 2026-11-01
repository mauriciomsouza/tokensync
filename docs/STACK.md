# Stack

Every choice here is about one constraint: tokensync runs in other people's CI, so it has to install fast, behave the same every time, and be easy to audit.

## Runtime

| Choice                                                | Why                                                                                                                                                     | Alternatives considered                                                                       |
| :---------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------- |
| **Node 22, ESM**                                      | Current LTS; global `fetch`, `node:util` `parseArgs`, stable ESM. Matches the Action's `setup-node`.                                                    | Node 20: entering end of life; Bun/Deno: less common in CI images.                            |
| **TypeScript, `strict` + `noUncheckedIndexedAccess`** | Token maps are full of optional lookups; the compiler should force us to handle them.                                                                   | Plain JS with JSDoc: weaker guarantees on the adapter contract.                               |
| **`zod` (via `zod/mini`)**                            | Config validation with readable errors and inferred types. `zod/mini` is tree-shakable, so the browser playground bundle is ~108 KB instead of ~540 KB. | Hand-written validation (more code, worse errors); full `zod` (too heavy for the playground). |
| **`picocolors`**                                      | Tiny, no dependencies, respects `NO_COLOR`/`FORCE_COLOR`.                                                                                               | `chalk` (bigger), `kleur`.                                                                    |
| **Own CIEDE2000**                                     | ~80 lines, verified against the published reference pairs; avoids a color library for one function.                                                     | `culori` (excellent, but we need ΔE 2000 plus sRGB → Lab only).                               |
| **Own order-preserving JSON parser**                  | `JSON.parse` reorders integer-like keys (`"50"`, `"100"`), which would reshuffle palettes on write. ~150 lines.                                         | `jsonc-parser` (another dependency), accepting reordering (breaks the minimal-write promise). |
| **Own CSS scanner**                                   | We only need custom-property declarations, their rule/at-rule context, and exact value offsets for surgical edits.                                      | `postcss` (correct but heavy; its stringifier can reformat untouched code).                   |
| **`node:util` `parseArgs`**                           | Built in; three subcommands don't need a framework.                                                                                                     | `commander`, `yargs`, `cac`.                                                                  |

Runtime dependencies: **2** (`zod`, `picocolors`). Adding a third needs the human owner (see `CLAUDE.md`).

## Build and quality

| Tool                                             | Why                                                                                                               |
| :----------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **tsup**                                         | Bundles `cli` and `index` to ESM with `.d.ts` in one config; fast.                                                |
| **esbuild** (direct)                             | Bundles the playground for the browser from the same sources.                                                     |
| **vitest**                                       | Fast, ESM-native, snapshots for the Markdown report.                                                              |
| **ESLint (typescript-eslint strict) + Prettier** | Catch real bugs; stop formatting debates.                                                                         |
| **playwright-core + system Chrome**              | Renders README screenshots from real output and checks the site under `/tokensync/`. No bundled browser download. |
| **marked** (dev only)                            | Renders the Markdown report as GitHub-flavored Markdown for the PR comment screenshot.                            |

## Distribution

| Surface       | How                                                                                                                                                                                                   |
| :------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI           | npm package `tokensync`, `bin` → `dist/cli.js`; `npx tokensync`.                                                                                                                                      |
| Library       | `import { check, sync, renderMarkdown } from 'tokensync'`; pure functions, usable in any JS runtime.                                                                                                  |
| GitHub Action | Composite action (`action.yml`) that runs the published CLI with `npx` and uses small zero-dependency scripts for the GitHub API. A composite action avoids committing a bundled `dist/` to the repo. |
| Demo          | Static site on GitHub Pages; all URLs relative so it works under `/tokensync/`.                                                                                                                       |

## Design decisions worth knowing

- **Pure engine, thin edges.** `check(config, figmaJson, files)` returns data; only `src/node/io.ts` and the CLI touch disk or network. That is what lets the playground run the real engine.
- **Match on keys, show names.** Tokens match on a kebab-case key (`color-brand-500`), so DTCG paths, CSS variables and Tailwind keys meet in one namespace; people read the dot name (`color.brand.500`).
- **Single-mode collections apply to every mode.** Primitives usually live in a one-mode collection; their value is used for each mode of the code target.
- **Aliases are kept, not just resolved.** Values are compared resolved, but `sync` writes `var(--x)` / `{x}` references when the referenced token exists in the target.
