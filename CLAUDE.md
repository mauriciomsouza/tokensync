# CLAUDE.md — working on tokensync

This file is the operating manual for any agent (or human) changing this repository. Read it before you touch code.

## What tokensync is

A CLI and GitHub Action that catches **design-token drift**: it reads Figma Variables (REST payload or export), normalizes them, compares them with the tokens in code (CSS custom properties, W3C DTCG JSON, Tailwind theme JSON), reports the differences, and can rewrite the code to match Figma.

- Engine: `src/core/` and `src/adapters/`. Pure functions: no filesystem, no network, no clock. The same code runs in the CLI, the Action and the browser playground.
- Node edges: `src/node/io.ts` (files, config loading, Figma fetch) and `src/cli.ts`.
- Renderers: `src/render/` (terminal, Markdown, HTML). HTML and Markdown must stay browser-safe.
- Distribution: `action.yml` + `action/` (GitHub Action), `site/` (demo on GitHub Pages).

## Source of truth

When two documents disagree, the one listed here for that topic wins. Fix the other one in the same change.

| Topic                                        | Decided by                                                                    |
| :------------------------------------------- | :---------------------------------------------------------------------------- |
| Behavior of the engine and adapters          | Tests in `test/` (if a test and a doc disagree, the test wins)                |
| Config shape                                 | `src/core/config.ts` (schema), mirrored in `tokensync.schema.json` and README |
| CLI flags and exit codes                     | `src/cli.ts` `HELP` text, mirrored in README                                  |
| Visual system (terminal, report, PR comment) | `docs/design/DESIGN_SPEC.md`                                                  |
| Scope, phases, gates                         | `docs/PLAN.md`                                                                |
| Technology choices                           | `docs/STACK.md`                                                               |
| Positioning, audience, metrics               | `docs/business/BUSINESS.md`                                                   |
| Launch copy                                  | `docs/marketing/LAUNCH.md`                                                    |
| Who does what                                | `docs/AGENT_TEAM.md`                                                          |

## Inviolable rules

1. **Never write user files without `--write`.** `sync` is a dry run by default and prints a diff. Only `report` (its own output path) and `--out` write files without that flag.
2. **The Figma token is never logged, printed, embedded or attached as an error `cause`.** It travels only in the `X-Figma-Token` header. Errors pass through `redact()`. The Action masks it with `::add-mask::`.
3. **No secrets in the repo.** No tokens, no `.env` files, no real file keys. CI uses `secrets.*` and `vars.*` only.
4. **Fixtures are fictional.** Aurora and every test fixture are made up. No real company, product or person data, and no real Figma files.
5. **Deterministic output.** Same input, same bytes: stable ordering (changed → added → removed, natural name order), no timestamps unless the caller passes one, no randomness. Snapshots depend on this.
6. **The engine stays pure.** No `node:` imports in `src/core`, `src/adapters` or `src/render/{html,markdown,shared}.ts`. The playground bundle will break if you add one.
7. **Writes are minimal.** `sync` changes only the values that differ. CSS keeps comments, formatting and value syntax; JSON keeps key order, indentation and inline objects. If a change would reformat an untouched line, it is a bug.
8. **Exit codes are API.** `0` in sync, `1` drift, `2` usage/config error. Changing them is a breaking change.

## How to work

- **Tests before "done".** A change is done when `npm run verify` passes (typecheck, lint, test, build, site build). New behavior comes with a test; bug fixes come with a test that failed before.
- **Independent review.** Whoever implements a change does not approve it. Dev implements, QA reviews against the plan and the rules above. See `docs/AGENT_TEAM.md`.
- **Small commits.** One logical change per commit, imperative subject, body explains why. Snapshot updates go in the same commit as the change that caused them, and the commit says so.
- **UI changes produce screenshots.** Any change to the HTML report, terminal output, PR comment or site runs `npm run render` and commits the updated PNGs in `docs/design/screens/`. Look at them before you commit; describe what changed in the commit body.
- **Examples must keep drifting.** `examples/aurora` exists to show drift. `npm run example` must exit 1 with a readable report. If you change Aurora, update the counts in the tests and README.
- **Docs move with code.** A new flag, config key or format updates README, `tokensync.schema.json` and `CHANGELOG.md` in the same change.

## Commands

```bash
npm run verify        # typecheck + lint + test + build + site build
npm test              # vitest
npm run example       # check against examples/aurora (exits 1: drift is the point)
npm run build:site    # site/dist, served under any base path
npm run preview:site  # serve site/dist under /tokensync/ on :4173
npm run render        # regenerate docs/design/screens/*.png (needs Chrome)
```

## Ask the human owner before

Publishing to npm, tagging a release, changing the license, changing exit codes or the config format in a breaking way, adding a runtime dependency, or anything listed in "Points that require the human owner" in `docs/AGENT_TEAM.md`.
