# Contributing

Thanks for helping. tokensync is small on purpose; the bar for changes is "makes drift easier to catch or safer to fix."

## Setup

```bash
git clone https://github.com/mauriciomsouza/tokensync.git
cd tokensync
npm ci
npm run verify      # typecheck, lint, test, build, site build
npm run example     # see the drift report for the Aurora example (exits 1 by design)
```

Node 22 or newer is required (`.nvmrc`).

## Ground rules

These are the same rules every agent working on the repo follows (see [`CLAUDE.md`](CLAUDE.md)):

- **Never write user files without `--write`.**
- **Never log, print or attach the Figma token** anywhere, including error messages.
- **Fixtures are fictional.** Use or extend Aurora; never commit real company tokens or real Figma exports.
- **Deterministic output.** Same input, same bytes.
- **The engine stays pure.** No `node:` imports in `src/core`, `src/adapters` or the HTML/Markdown renderers.

## Making a change

1. Open an issue first for anything bigger than a bug fix, so we can agree on scope.
2. Write a failing test, then the fix. Tests live in `test/`; adapter changes need a round-trip test.
3. If output changes, update the snapshot (`npx vitest run -u`) in the same commit and say why in the message.
4. If the HTML report, terminal output, PR comment or site changes, run `npm run render` (needs Chrome; set `CHROME_PATH` if it isn't at `/usr/bin/google-chrome`) and commit the updated PNGs after looking at them.
5. Update `README.md`, `tokensync.schema.json` and `CHANGELOG.md` (under `Unreleased`) for any new flag, config key or format.
6. Keep commits small with an imperative subject and a body that explains why.

## Adding a format

Implement the `Adapter` interface in `src/adapters/types.ts`:

- `files` / `modes` / `accepts` describe what the target covers.
- `read` returns a `TokenSet` (normalized names, resolved values, aliases recorded).
- `write` returns new file contents for a `WritePlan` and must leave untouched content byte-identical.

Register it in `src/core/engine.ts`, add it to the config schema, and add a round-trip test plus an Aurora fixture.

## Reporting a mapping problem

The most useful bug report is a tiny, fictional Figma JSON plus the code file and config that produce the wrong result. That becomes a test.
