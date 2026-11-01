# Agent team

tokensync is built by one human owner working with a small team of AI agents, each with a narrow role and its own prompt in `.claude/agents/`. The structure exists for one reason: **the agent that writes a change is never the one that approves it.**

## Roles

| Role         | Agent                                         | Owns                                                               | Typical deliverable                                           |
| :----------- | :-------------------------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------------ |
| Orchestrator | main session                                  | The iteration: picks the next item from `PLAN.md`, assigns, merges | Task brief with acceptance criteria; merge decision           |
| Business     | [`business`](../.claude/agents/business.md)   | Problem, audience, positioning, metrics                            | Updates to `docs/business/BUSINESS.md`; go/no-go on scope     |
| Design       | [`design`](../.claude/agents/design.md)       | Visual system for terminal, HTML report, PR comment and site       | `DESIGN_SPEC.md` changes, mockups, rendered PNGs              |
| Dev          | [`dev`](../.claude/agents/dev.md)             | Engine, adapters, CLI, renderers, Action scripts                   | Code + tests in one small commit                              |
| QA           | [`qa`](../.claude/agents/qa.md)               | Independent review, edge cases, the inviolable rules               | Review notes; failing tests for bugs it finds                 |
| Infra        | [`infra`](../.claude/agents/infra.md)         | CI, Pages, `action.yml`, build tooling                             | Workflow changes verified locally (act-free: scripts + mocks) |
| Release      | [`release`](../.claude/agents/release.md)     | Versioning, changelog, release checklist                           | `CHANGELOG.md` entry, version bump PR, release notes draft    |
| Marketing    | [`marketing`](../.claude/agents/marketing.md) | Launch narrative and copy                                          | `docs/marketing/LAUNCH.md` drafts                             |

## One iteration

```
            ┌─────────────────────────────┐
            │ Orchestrator                │
            │ pick item from PLAN.md      │
            │ write brief + acceptance    │
            └──────────────┬──────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         ▼                 ▼                  ▼
   ┌──────────┐      ┌──────────┐       ┌──────────┐
   │ Business │      │ Design   │       │ Infra    │   (only the roles
   │ scope ok?│      │ spec/    │       │ CI impact│    the item needs)
   └────┬─────┘      │ mockup   │       └────┬─────┘
        │            └────┬─────┘            │
        └─────────────────┼──────────────────┘
                          ▼
                    ┌──────────┐
                    │ Dev      │  code + tests, npm run verify,
                    │          │  npm run render if UI changed
                    └────┬─────┘
                         ▼
                    ┌──────────┐   fail: back to Dev with
                    │ QA       │──── a failing test or note
                    │ review   │
                    └────┬─────┘
                         │ pass
                         ▼
            ┌─────────────────────────────┐
            │ Orchestrator: merge          │
            │ Release: CHANGELOG entry     │
            │ Marketing: only at launches  │
            └─────────────────────────────┘
```

## Points that require the human owner

| Decision                                                         | Why it is not delegated                      |
| :--------------------------------------------------------------- | :------------------------------------------- |
| Publishing to npm, tagging a release, moving the `v0` Action tag | Irreversible for users who pin versions      |
| Breaking changes to config, CLI flags or exit codes              | Breaks CI pipelines in other people's repos  |
| New runtime dependencies                                         | Supply-chain risk; install size is a feature |
| Anything that touches credentials or the Figma API contract      | Security; the token rule is inviolable       |
| License, name, positioning claims about other tools              | Legal and reputational                       |
| Posting launch copy anywhere public                              | It speaks in the owner's voice               |
| Merging when QA and Dev disagree                                 | Tie-break needs judgment, not another agent  |

## Team rules

1. **Implementer ≠ approver.** Dev never marks its own work done; QA never fixes what it reviews (it writes the failing test and hands it back).
2. **Briefs have acceptance criteria.** "Make sync better" is not a brief. "sync keeps inline JSON objects inline; test: round-trip `primitives.tokens.json` produces no diff" is.
3. **Evidence over assertion.** "Tests pass" means the command output is in the hand-off. "Looks good" means the PNG was rendered and looked at.
4. **Stay in your lane.** Design does not edit `src/core`; Dev does not change `DESIGN_SPEC.md` to match what it built. Disagreements go to the Orchestrator.
5. **The rules in `CLAUDE.md` beat any brief.** If a brief asks for something that breaks one, the agent stops and says so.
6. **Small and reversible.** Prefer three small commits to one large one. Every commit leaves `npm run verify` green.
