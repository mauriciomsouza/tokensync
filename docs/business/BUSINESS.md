# Business

## Problem

Design systems keep tokens in two places: Figma variables, where designers work, and code (CSS, JSON, a Tailwind theme), where products are built. Nothing keeps them aligned. A designer adjusts `accent/hover` in the dark theme; the CSS never changes; three months later two screens disagree and nobody knows which value is right.

The cost is not the one wrong color. It is the **loss of trust in the source of truth**: engineers stop believing Figma, designers stop believing the build, and every review turns into "which hex is correct?".

What teams do today:

- **Manual audits** before releases: someone screenshots both and squints.
- **One-way exports**: a plugin or script dumps Figma to JSON, overwriting whatever is in code, including legitimate code-side additions. Nobody reviews the diff because it is noise.
- **Nothing**, until a bug report.

## Who it is for

| Segment                                  | Situation                                                 | What they need from tokensync                                                      |
| :--------------------------------------- | :-------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| **Design-system engineers** (primary)    | Own the token files in a repo; review PRs that touch them | A CI check that fails on drift and says exactly what and where; a safe way to sync |
| **Design engineers / product engineers** | Work on both sides; get blamed for mismatches             | A quick local `check` and a visual report to settle "which one is right"           |
| **Designers who own the Figma library**  | Change variables and want proof it shipped                | A readable report or PR comment they can open without a terminal                   |
| **Small teams without a token pipeline** | Hand-written CSS variables, a Tailwind theme              | Something that works with the files they already have, no migration                |

Not for (now): teams who want a full token _authoring_ or _transformation_ platform; tokensync reads and reconciles, it does not replace those tools.

## Positioning

> **tokensync catches design-token drift before it ships.** It compares Figma variables with the tokens already in your code, shows the differences as a visual diff, and can open a pull request to reconcile them.

The wedge is **detection and reconciliation**, in CI, against the files a team already has.

### Alternatives, fairly

| Tool                                      | What it is great at                                                                                                                                            | How tokensync relates                                                                                                                                                              |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tokens Studio for Figma**               | A full token management plugin inside Figma: authoring, themes, sync of token JSON to Git providers, and working with Figma variables. Widely used and mature. | Tokens Studio is where tokens are _managed_; tokensync checks that the code actually matches. Teams using Tokens Studio can still run tokensync in CI against the generated files. |
| **Style Dictionary**                      | The standard open-source build system that _transforms_ tokens into platform outputs (CSS, iOS, Android, …), with DTCG support in recent versions.             | Complementary. Style Dictionary turns tokens into code; tokensync verifies that code against Figma. It can check Style Dictionary's CSS output like any other CSS file.            |
| **Figma Dev Mode / variables in inspect** | Shows developers the variables used by a selected layer, with code syntax.                                                                                     | Great for one element at a time. It does not compare a whole token set with a repository or run in CI.                                                                             |
| **Export plugins and custom scripts**     | Quick one-way dumps of variables to JSON/CSS.                                                                                                                  | Overwrites without telling you what changed. tokensync is the review step: perceptual diff, per mode, then a minimal write.                                                        |

We do not claim any of these "can't" do something; they are aimed at different jobs, and many teams will use tokensync alongside one of them.

### Differentiators

1. **Diff, not dump.** Added / changed / removed per mode, with before → after.
2. **Perceptual colors.** CIEDE2000 with a threshold, so `#5d5d6b` vs `#5e5e6c` is not drift but `#5b3be8` vs `#6440f0` is.
3. **Works with existing files.** CSS custom properties (including `[data-theme]` and media queries), DTCG JSON, Tailwind theme JSON. No migration.
4. **Minimal writes.** `sync` edits only the changed values and keeps comments, units, color syntax and key order. The resulting PR is reviewable.
5. **CI-native.** Exit codes, sticky PR comment, scheduled sync PRs.

### Honest constraints

- Live fetching uses Figma's Variables REST API, which Figma limits to members of **Enterprise** organizations. Everyone else exports variables to a JSON file (by plugin or script) and points `--figma` at it. The playground and all examples use files.
- Composite tokens (typography styles, shadows) are not compared yet.

## Sustainability model

tokensync is MIT-licensed and stays free. The CLI and Action have no server component and cost nothing to run.

Possible paths if adoption justifies it, in order of fit:

1. **Sponsorship** (GitHub Sponsors) from teams that rely on it in CI.
2. **Hosted dashboard (later, optional):** drift history across repos, Slack alerts, a designer-facing view. The open-source CLI remains complete on its own.
3. **Paid support** for larger design-system teams setting up mapping rules.

None of these is a plan to execute now; the goal for v0 is usefulness and adoption.

## Metrics

| Stage      | Metric                                                                             | First target (90 days after launch) |
| :--------- | :--------------------------------------------------------------------------------- | :---------------------------------- |
| Awareness  | Demo site unique visitors; GitHub stars                                            | 5k visitors; 300 stars              |
| Activation | Playground sessions that edit an input                                             | 25% of visitors                     |
| Adoption   | npm weekly downloads; public repos using the Action (code search for `tokensync@`) | 500/week; 25 repos                  |
| Value      | Issues/discussions describing drift caught in CI                                   | 10 reports                          |
| Quality    | Open bugs labeled `sync` (writes are the risky path)                               | 0 open > 7 days                     |

Measured from npm, GitHub and Pages analytics only; tokensync itself collects no telemetry.
