# Design spec: "Proof"

**Proof** is tokensync's visual system. The name comes from printing: a proof is the sheet you hold next to the original to catch what changed before the run. Every surface does the same job: put _code (now)_ next to _Figma (expected)_ and make the difference impossible to miss, without shouting.

Screenshots of every surface live in [`screens/`](screens/) and are regenerated from real output with `npm run render`.

## 1. Principles

1. **The diff is the hero.** Old value struck through and muted, arrow, new value bold. Everything else (chrome, counts, metadata) recedes.
2. **Color means state, nothing else.** Four state colors, no decorative color. Token swatches are the only other color on the page.
3. **Never color alone.** Each state also has a word ("Changed", "Missing in code", "Not in Figma", "In sync") and a sign (`~`, `+`, `−`, `●`).
4. **One structure, four surfaces.** Terminal, HTML report, PR comment and playground all show: summary → per target → Changed, Missing in code, Not in Figma.
5. **Honest swatches.** Checkerboard under translucent colors; a hairline ring so `#fff` on white and `#0e0e12` on near-black stay visible.

## 2. Vocabulary

| State   | Label           | Sign | Meaning                                                                          |
| :------ | :-------------- | :--- | :------------------------------------------------------------------------------- |
| changed | Changed         | `~`  | Exists on both sides; value differs (ΔE above threshold, or different px/string) |
| added   | Missing in code | `+`  | In Figma, not in this target. `sync` adds it                                     |
| removed | Not in Figma    | `−`  | In this target, not in Figma. `sync --prune` removes it                          |
| ok      | In sync         | `●`  | Equal, or within ΔE tolerance                                                    |

Direction is always **code → Figma**: Figma is the source of truth, so "after" is the Figma value. Labels avoid "added/removed" in UI because they are ambiguous about which side.

## 3. Tokens

### Color (light / dark)

| Token             | Light                 | Dark                     | Use                                                |
| :---------------- | :-------------------- | :----------------------- | :------------------------------------------------- |
| `paper`           | `#f7f6f2`             | `#121214`                | Page background (warm off-white, like proof paper) |
| `card`            | `#ffffff`             | `#1a1a1e`                | Groups, stat tiles                                 |
| `ink`             | `#16161a`             | `#ececef`                | Primary text, "after" values                       |
| `ink-2`           | `#55565e`             | `#a4a5ad`                | Secondary text, "before" values                    |
| `ink-3`           | `#8a8b93`             | `#6f707a`                | Metadata, captions, arrows                         |
| `rule` / `rule-2` | `#e4e2dc` / `#efede8` | `#2b2b31` / `#222227`    | Borders, row dividers                              |
| `changed` (+bg)   | `#b45309` / `#fdf3e4` | `#f0a54a` / `#2c2113`    | Changed state, ΔE badge                            |
| `added` (+bg)     | `#1d5fd1` / `#eaf1fd` | `#7aa7ff` / `#16213a`    | Missing in code                                    |
| `removed` (+bg)   | `#b42318` / `#fdecea` | `#ff8a7a` / `#341a17`    | Not in Figma; ΔE ≥ 10 badge; strike-through        |
| `ok` (+bg)        | `#127a4a` / `#e7f5ee` | `#5fd39a` / `#12291e`    | In sync                                            |
| `ring`            | `rgb(0 0 0 / .1)`     | `rgb(255 255 255 / .16)` | Swatch hairline                                    |

All text/background pairs meet WCAG AA (4.5:1) in both themes; state colors on their `bg` meet AA for the 12 px badges.

### Type

- **Sans** (`ui-sans-serif, system-ui, …`) for prose and labels. No webfonts: the report must be a single offline file.
- **Mono** (`ui-monospace, SF Mono, JetBrains Mono, …`) for anything you could copy: token names, values, paths, commands.
- Scale (px): 32 title / 26 stat / 15 target heading / 14 body / 13 values / 12 labels and badges / 11 captions. Title tracking −0.02em; uppercase labels +0.04–0.08em.
- Numbers use `tabular-nums` so counts and ΔE align.

### Space and shape

4 px base; common steps 8 / 12 / 16 / 24 / 40 / 48. Radius: 12 groups, 10 tiles, 8 swatches, 6 badges, 5 chips. Swatches 40 px (32 px in lists and on narrow screens).

## 4. Surfaces

### Terminal (`tokensync check`)

```
  tokensync · Aurora Design System

  src/styles/tokens.css css · light / dark  7 differences

  ■ Changed (4)
    ~ color.accent.default  light  ██ #5b3be8   →  ██ #6440f0   ΔE 2.1
    ~ radius.md             all    6px          →  8px          +2px
  ■ Missing in code (2)
    + color.danger          light  ██ #d23a2d
  ■ Not in Figma (1)
    - color.info            all    ██ #2f80ed

  ◐ Drift detected — 9 changed, 4 missing in code, 1 not in Figma · 55 in sync
```

- ANSI 16 colors for state (yellow/blue/red/green) so it follows the user's terminal theme; truecolor swatches (`██`) only when `COLORTERM=truecolor|24bit`.
- "Before" values dim; "after" values default weight. ΔE ≥ 10 turns red.
- Mode column only when the target has more than one mode; `all` when every mode differs identically.
- Respects `NO_COLOR` and `--no-color`; without color the signs and labels carry the meaning.

### HTML report (`tokensync report`)

Single self-contained file: inline CSS, no scripts, no network requests, deterministic bytes.

- **Header:** eyebrow `TOKENSYNC · DRIFT REPORT` with the half-filled "proof" mark, project title, one-sentence summary; four stat tiles on the right (wrap to 2×2 on mobile).
- **Per target:** mono path, format chip, mode chips, and right-aligned "N differences · M matching (K within ΔE tolerance)".
- **Changed group:** rows of `name | mode | [swatch old value] → [swatch new value + alias caption] | delta badge`. Visuals per type: color swatch; radius drawn as a corner with that radius; spacing/size as a bar scaled to the largest value in the target; font family as "Aa" in that family.
- **Missing / Not in Figma groups:** compact grid of cards (swatch + name + value); multi-mode colors show a split swatch (light | dark).
- **Footer:** summary, threshold used, and the fix command.
- **Responsive:** container query at 620 px stacks each row (name + mode, then the comparison, then the badge), so it also works when embedded in the playground.
- **Themes:** follows `prefers-color-scheme`; `data-theme="light|dark"` forces one.

### PR comment (`check --markdown`, posted by the Action)

GitHub Markdown only, so no color: hierarchy comes from structure.

1. Hidden marker `<!-- tokensync:report -->` (the Action finds and updates this one comment; never more than one per PR).
2. `### tokensync · <project>` then one bold sentence with the totals.
3. Summary table per target (counts right-aligned).
4. One `<details>` per target; **open** when total differences ≤ 25, collapsed otherwise. Inside: a table per state, values in code spans, alias as `<sub>→ name</sub>`, Δ column right-aligned (`ΔE 2.1`, `+2px`).
5. Tables longer than 50 rows split, with the rest inside a nested `<details>`.
6. `<sub>` footer: threshold, fix command, link to the HTML report artifact.

No emoji: they render inconsistently and read as noise in review threads.

### Demo site and playground

- Same tokens as the report; the playground embeds the real report fragment.
- Layout: inputs left (Figma JSON, code tokens with a format picker, threshold slider), output right with tabs **Report / PR comment / sync diff** and a one-line status (`■ 4 changed · …`) that updates as you type (150 ms debounce).
- Errors (invalid JSON, invalid config) replace the status line in `removed` color; the last good output stays visible below.
- Mobile: single column, 16 px gutters, no horizontal scroll.

## 5. Copy

- Sentence case everywhere except the uppercase micro-labels.
- Say what to do next: every drift state ends with the fix command.
- Name things the way the user sees them: "Missing in code", not "added"; "Not in Figma", not "orphan".
- Errors name the file and the fix: `FIGMA_TOKEN is not set. Create a personal access token with the file_variables:read scope.`
