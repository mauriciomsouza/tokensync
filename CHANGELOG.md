# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-01

### Added

- `tokensync check`: compares Figma Variables with code tokens per mode; terminal, `--json` and `--markdown` output; exit code 1 on drift, 2 on usage errors.
- `tokensync report`: single-file HTML report with side-by-side color swatches, radius and spacing previews, light and dark themes.
- `tokensync sync`: dry-run unified diff by default; `--write` applies minimal edits; `--prune` removes tokens that are not in Figma.
- Figma input from an exported JSON file (`--figma`) or live from the Variables REST API (`--file-key` + `FIGMA_TOKEN`), with modes, cross-collection alias resolution, RGBA → hex and FLOAT → px/number.
- Adapters: CSS custom properties (selectors and at-rules per mode, `var()` aliases), W3C DTCG JSON (string and 2025-draft structured values, one file or one file per mode), Tailwind theme JSON.
- Perceptual color comparison with CIEDE2000 and a configurable `threshold`.
- Config via `tokensync.config.json` / `.ts` with JSON Schema for editor autocompletion.
- GitHub Action with a sticky PR comment, job summary, HTML report artifact and optional scheduled sync PR.
- Demo site with an in-browser playground on GitHub Pages.
- Fictional "Aurora" example with intentional drift in all three formats.
