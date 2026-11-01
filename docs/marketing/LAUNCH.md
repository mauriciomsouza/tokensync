# Launch

Drafts are ready to paste. The human owner posts them; nothing here is published automatically. Every claim maps to something in the README (see "Claims check" at the end).

## Plan

| When                 | Channel          | Goal                                                                                                   | Asset                   |
| :------------------- | :--------------- | :----------------------------------------------------------------------------------------------------- | :---------------------- |
| T−7 days             | Repo polish      | README, demo site, screenshots final; Action used on a real PR in a sandbox repo                       | `docs/design/screens/*` |
| T−3                  | Friendly preview | 5–10 design-system engineers try the playground; fix the first confusion                               | Demo link               |
| T0, Tue/Wed 8–9am PT | Show HN          | Engineers who own token files                                                                          | Draft below             |
| T0 + 2h              | X and LinkedIn   | Design engineers, design-system leads                                                                  | Thread + post below     |
| T+7                  | Product Hunt     | Broader design/product audience                                                                        | Copy below              |
| T+14                 | Write-up         | "How CIEDE2000 decides if two colors are the same" — the threshold explainer, with the Aurora examples | Blog post (owner)       |

Rules: reply to every comment in the first 24 h; when someone reports a mapping that doesn't work, ask for a minimal fictional repro and turn it into a test.

## Show HN

**Title:** Show HN: tokensync – catch drift between Figma variables and your code tokens

**Text:**

> I build design-system tooling, and the same bug keeps coming back: someone updates a variable in Figma (say, the dark-mode hover color), nobody updates the CSS, and a few months later nobody knows which value is right.
>
> tokensync compares Figma variables with the tokens already in your repo — CSS custom properties, W3C design tokens JSON, or a Tailwind theme — and reports what drifted, per mode:
>
>     ~ color.accent.hover  dark  #c9b8ff → #e6deff  ΔE 12.1
>     + color.danger        light #d23a2d
>     - color.info          all   #2f80ed
>
> A few details I cared about:
>
> - Colors are compared with CIEDE2000 and a threshold, so a hand-rounded hex isn't drift but a real change is.
> - Aliases are resolved per mode (Light/Dark), and `sync --write` writes them back as `var(--…)` references, not flattened hex.
> - `sync` edits only the values that changed. Comments, units (rem stays rem), color syntax and JSON key order are preserved, so the PR is reviewable.
> - It's a GitHub Action too: one sticky PR comment, exit 1 on drift, optional scheduled "sync tokens" PR.
>
> Live fetching uses Figma's Variables REST API, which is Enterprise-only; otherwise you point it at an exported JSON file. There's a browser playground with a fictional design system so you can try it without either: https://mauriciomsouza.github.io/tokensync/
>
> MIT, TypeScript, two runtime dependencies. I'd love feedback on name-mapping cases it doesn't handle yet.

## X thread

1. Your Figma variables and your CSS are two sources of truth. They drift. Nobody notices until two screens disagree.

   I built tokensync to catch it in CI. [image: report-light.png]

2. It reads Figma variables (modes + aliases), compares them with the tokens already in your repo — CSS custom properties, DTCG JSON, Tailwind — and shows before → after per mode.

3. Colors are compared perceptually (CIEDE2000). #5d5d6b vs #5e5e6c: same color, ignored. #5b3be8 vs #6440f0: drift, flagged with ΔE 2.1. The threshold is configurable.

4. On pull requests it leaves one sticky comment with the diff. On a schedule it can open a "sync tokens" PR that changes only the values that drifted, keeping your comments, units and key order. [image: pr-comment.png]

5. Try it in the browser — the playground runs the real engine, no backend: https://mauriciomsouza.github.io/tokensync/

   Code (MIT): https://github.com/mauriciomsouza/tokensync

## LinkedIn post

> Design systems usually have two sources of truth: Figma variables and the tokens in code. They drift quietly — a hover color updated in Figma, never in CSS — and the cost shows up later as "which one is right?" in every review.
>
> I built **tokensync**, an open-source CLI and GitHub Action that:
>
> → compares Figma variables with CSS custom properties, W3C design tokens or a Tailwind theme, per mode (light/dark)
> → compares colors perceptually (CIEDE2000), so rounding isn't flagged but real changes are
> → posts one readable comment on each pull request
> → can open a PR that updates only the drifted values, keeping comments and formatting
>
> There's a playground with a fictional design system so you can see it work in 30 seconds: https://mauriciomsouza.github.io/tokensync/
>
> I'd especially like to hear from people maintaining token pipelines: what naming conventions does your team use between Figma and code?

## Product Hunt

- **Name:** tokensync
- **Tagline (60):** Catch design-token drift between Figma and code
- **Topics:** Design Tools, Developer Tools, Open Source, GitHub
- **Description (260):** tokensync compares Figma variables with the design tokens in your code (CSS variables, W3C tokens, Tailwind) and shows what drifted, with perceptual color diffs. Run it in CI to get a PR comment, or let it open a pull request that syncs code to Figma.
- **Gallery:** `report-light.png`, `pr-comment.png`, `terminal.png`, `playground.png`, `report-mobile.png`
- **Maker comment:**

  > Hi PH! I work between design and engineering, and the most common "bug" I see in design systems isn't a bug: it's Figma and code disagreeing about a token. tokensync is the check I wanted: it tells you what drifted, per theme, and can fix the code with a minimal diff. It's free and MIT-licensed. The playground uses a fictional design system, so you can try it without connecting anything. Feedback on mapping rules very welcome.

## Claims check

| Claim                                          | Backed by                                                        |
| :--------------------------------------------- | :--------------------------------------------------------------- |
| Modes and aliases resolved                     | `src/core/figma.ts`, `test/figma.test.ts`                        |
| CSS / DTCG / Tailwind                          | `src/adapters/*`, README "Supported formats"                     |
| CIEDE2000 + threshold                          | `src/core/color.ts`, reference pairs in `test/color.test.ts`     |
| Aliases written back as references             | `test/engine.test.ts` "sync writes a var() reference"            |
| Minimal writes preserving comments/units/order | `test/adapters.test.ts`, `test/engine.test.ts`                   |
| Sticky comment, exit 1, scheduled sync PR      | `action.yml`, `action/*.mjs`                                     |
| Variables REST API is Enterprise-only          | Figma developer docs (Variables REST API); README "Figma source" |
| Two runtime dependencies                       | `package.json`                                                   |
| No backend in the playground                   | `site/src/playground.ts`, `docs/STACK.md`                        |
