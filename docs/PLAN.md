# Plan

Phases with explicit gates. A gate is passed when every check is true and the named reviewer signs off; the human owner approves G3 and later.

## Phases

### Phase 0: Frame (done)

Problem statement, audience, positioning, success metrics (`docs/business/BUSINESS.md`). Visual system named and specified (`docs/design/DESIGN_SPEC.md`). Stack chosen with reasons (`docs/STACK.md`).

**G0, framed:** BUSINESS.md answers who, what breaks today and how we measure; DESIGN_SPEC.md covers all four surfaces; STACK.md lists every runtime dependency with a reason. _Reviewer: Orchestrator._

### Phase 1: Engine (done)

Figma reader (modes, aliases, RGBA → hex, FLOAT → px/number, collections, name normalization). Adapters for CSS, DTCG and Tailwind with read and write. Diff engine with CIEDE2000 and threshold. Order-preserving JSON. Fictional Aurora example with intentional drift in all three formats.

**G1, correct:** reference ΔE pairs from Sharma et al. pass; each adapter round-trips Aurora with zero changes; `sync` then `check` reports no drift (with `--prune`); `sync` is idempotent. _Reviewer: QA._

### Phase 2: Surfaces (done)

CLI (`check`, `report`, `sync`), terminal/JSON/Markdown/HTML output, GitHub Action (sticky comment, sync PR), demo site with in-browser playground on GitHub Pages.

**G2, usable:** `npm run verify` green; exit codes 0/1/2 covered by tests; Markdown snapshot stable; screenshots rendered from real output and reviewed in light, dark and mobile; Action scripts exercised against a mock GitHub API; site verified under `/tokensync/`. _Reviewers: QA, Design._

### Phase 3: First release (next)

Publish `tokensync-cli@0.1.0` to npm, tag `v0.1.0` and `v0` for the Action, enable GitHub Pages, run the Action on a real pull request in a sandbox repo.

**G3, shipped:** the published package installs and runs `npx tokensync-cli check` in a clean directory; the Action posts and then updates one comment on a real PR; the Pages URL serves the playground. _Approver: human owner._

### Phase 4: Launch

Show HN, X/LinkedIn thread, Product Hunt, using drafts in `docs/marketing/LAUNCH.md`.

**G4, launched:** posts published by the owner; first-week metrics recorded in BUSINESS.md. _Approver: human owner._

### Later (not committed)

- Plugin API for custom adapters (SCSS maps, JS/TS theme objects, iOS/Android outputs).
- Typography composites and shadows (DTCG composite types).
- Figma-side writes (push code changes back to Figma) — requires a write-scoped token; needs a security review.
- Multiple Figma files / library variables resolved across files.
- `tokensync init` to generate a config by sniffing the repo.

## Risks

| Risk                                                    | Likelihood | Impact                            | Mitigation                                                                                     |
| :------------------------------------------------------ | :--------- | :-------------------------------- | :--------------------------------------------------------------------------------------------- |
| Figma Variables REST API is limited to Enterprise plans | Certain    | High: most teams can't fetch live | First-class `--figma <file.json>` path; document export options; playground needs no API       |
| Figma changes the Variables payload shape               | Medium     | High                              | `assertFigmaResponse` fails loudly; fixtures mirror the documented shape; one module to update |
| Name mapping between Figma and code differs per team    | High       | Medium                            | `rename` rules, collection prefixes, CSS prefix, Tailwind `groups`, include/exclude globs      |
| `sync --write` mangles a hand-edited file               | Medium     | High                              | Dry run by default; surgical CSS edits; order-preserving JSON; round-trip tests; atomic writes |
| Perceptual threshold hides a real change                | Low        | Medium                            | Default ΔE 1 (just noticeable); `--threshold 0` for exact; tolerated count shown in report     |
| Token leak through logs or errors                       | Low        | Severe                            | Header-only transport, `redact()`, no error `cause`, Action masking, test asserting it         |
| Scope creep into a token transformer                    | Medium     | Medium                            | Positioning in BUSINESS.md: detect and reconcile; transformation is Style Dictionary's job     |
