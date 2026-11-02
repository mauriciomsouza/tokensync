# LinkedIn posters

Images for announcing tokensync on LinkedIn, built in the "Proof" visual system: proof paper, ink,
state colors only, crop marks on every sheet. Real output from the fictional Aurora design system
is used as the hero instead of plain screenshots.

| File                              | Size                        | Use                                         |
| --------------------------------- | --------------------------- | ------------------------------------------- |
| `launch.png`                      | 2160×2700 (1080×1350 at 2x) | Launch post, single image                   |
| `concept.png`                     | 2160×2700                   | Follow-up post about perceptual color diffs |
| `carousel/01.png` … `07.png`      | 2160×2700 each              | Carousel slides, also usable alone          |
| `carousel/tokensync-carousel.pdf` | 7 pages, 1080×1350          | Upload as a LinkedIn document so it swipes  |

Sources are in [`design/posters/`](../../../design/posters/) (HTML and CSS, no build step). The
report itself uses system fonts; the posters embed Inter and JetBrains Mono from
`design/posters/fonts/` (SIL OFL, licenses alongside) so they render the same on any machine.

```bash
node design/posters/render.mjs            # everything
node design/posters/render.mjs carousel   # one file while iterating
```

It uses the system Chrome (`CHROME_PATH` to override).

## launch.png

**Headline:** Figma changed. Your CSS didn’t.

**Alt text:**

> Poster for tokensync, an open-source tool, on warm off-white paper. Headline: "Figma changed."
> followed by "Your CSS didn't." struck through in red. Subhead: "tokensync catches design-token
> drift between Figma variables and your CSS, DTCG or Tailwind tokens, then fixes only what
> changed." Below, a tilted drift report lists changed tokens with old and new color swatches and
> ΔE badges, and a magnifying glass enlarges the red "ΔE 12.1" badge. A tally reads 9 changed,
> 4 missing in code, 1 not in Figma, 55 in sync. Footer: Open source, free.
> mauriciomsouza.github.io/tokensync. By Mauricio Souza, Design Engineer.

## concept.png

**Headline:** Your eyes miss it. ΔE doesn’t.

**Alt text:**

> Poster for tokensync. Headline: "Your eyes miss it. ΔE doesn't." Subhead: "Colors are compared
> the way people see them. tokensync flags drift a glance can't, and ignores what nobody can see."
> A large circle is split down the middle: the left half is the code color #5b3be8 (struck through,
> labeled "Code, now, tokens.css"), the right half the Figma color #6440f0 (labeled "Figma,
> expected, color.brand.600"). The two purples look almost identical. Below, a ΔE scale from 0 to
> 15+ marks the threshold at 1, "obvious" at 10, and pins this pair at ΔE 2.1. Caption:
> color.accent.default, light mode, Aurora, a fictional design system.

## Carousel

**Suggested document title:** tokensync: catch design-token drift between Figma and code

| Slide | Alt text                                                                                                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Cover, 1 of 7. Headline: "Which hex is right?" Two cards: the code token --color-accent-default set to #5b3be8, and the Figma variable color.accent.default set to #6440f0, each with its swatch. "Swipe" cue at the bottom.                                                                                                                         |
| 2     | 2 of 7, the problem. "Two sources of truth drift apart." A line chart: the Figma line steps up twice (color.accent to #6440f0, radius.md to 8px) while the code line stays flat ("still #5b3be8", "still 6px"). A bracket between them reads "14 tokens drifted".                                                                                    |
| 3     | 3 of 7, how it works. "One check. Every format you ship." Figma variables, from the REST API or an exported JSON, flow through tokensync to three targets: tokens.css with 7 differences, primitives.tokens.json (DTCG) with 4, tailwind.theme.json with 3. Outputs: Terminal, HTML report, PR comment, JSON.                                        |
| 4     | 4 of 7, the design decision. "Compare color the way eyes do." Four token pairs with swatches and ΔE badges: color.bg.subtle 1.4, color.accent.default 2.1, color.brand.300 6.9, and color.accent.hover 12.1 in red.                                                                                                                                  |
| 5     | 5 of 7, pull requests. "One comment. Always current." The tokensync bot's comment on a pull request: a summary table per target and the changed tokens with code and Figma values.                                                                                                                                                                   |
| 6     | 6 of 7, what makes it different. "Sync changes values. Nothing else." A diff of tokens.css changes only two values, the accent color and radius.md, and keeps comments and neighboring lines untouched. Three notes: dry run by default, --write applies; exit codes 0 in sync, 1 drift, 2 config error; the Figma token is never logged or printed. |
| 7     | 7 of 7. "Try the live demo." URL: mauriciomsouza.github.io/tokensync. Notes: paste Figma JSON and see the report, runs in your browser, MIT license. A tilted crop of the playground shows the live report. Tag: Open source, free.                                                                                                                  |
