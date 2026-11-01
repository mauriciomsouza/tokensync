# Aurora (fictional example)

Aurora is a made-up design system used to demonstrate tokensync. Every value here is fictional.

| File                            | Format                       | Covers                                                                                    |
| :------------------------------ | :--------------------------- | :---------------------------------------------------------------------------------------- |
| `figma/variables.json`          | Figma Variables REST payload | 3 collections: Primitives (1 mode), Theme (Light/Dark, aliases to primitives), Typography |
| `src/styles/tokens.css`         | CSS custom properties        | Semantic colors per mode (`:root`, `[data-theme="dark"]`), spacing, radius                |
| `tokens/primitives.tokens.json` | W3C DTCG                     | Color palette and typography                                                              |
| `tailwind.theme.json`           | Tailwind theme               | Brand palette, spacing, radius (in rem)                                                   |

## Intentional drift

| Token                                                 | Where    | What happened                                             |
| :---------------------------------------------------- | :------- | :-------------------------------------------------------- |
| `color.accent.default` (light)                        | CSS      | Hand-picked `#5b3be8` instead of `brand.600`              |
| `color.accent.hover` (dark)                           | CSS      | Figma moved it to `brand.100`; CSS kept the old value     |
| `color.bg.subtle` (dark)                              | CSS      | Small but visible difference (ΔE 1.4)                     |
| `color.fg.muted` (light)                              | CSS      | Rounded by hand; **within** ΔE tolerance, so not reported |
| `radius.md`                                           | CSS      | 6px in code, 8px in Figma                                 |
| `color.danger`, `space.12`                            | CSS      | Added in Figma, missing in code                           |
| `color.info`                                          | CSS      | Exists only in code                                       |
| `color.brand.700`, `font.family.sans`, `font.size.xl` | DTCG     | Out of date                                               |
| `color.neutral.950`                                   | DTCG     | Missing                                                   |
| `color.brand.300`, `radius.lg`                        | Tailwind | Out of date (`radius.lg` in rem)                          |
| `space.12`                                            | Tailwind | Missing                                                   |

## Try it

From the repository root:

```bash
npm run build
npm run example                     # check (exits 1: drift is the point)
npm run example:report              # writes examples/aurora/tokensync-report.html
```

To try `sync --write`, copy the folder first so the example keeps its drift:

```bash
cp -r examples/aurora /tmp/aurora
node dist/cli.js sync --config /tmp/aurora/tokensync.config.json --write
node dist/cli.js check --config /tmp/aurora/tokensync.config.json
```
