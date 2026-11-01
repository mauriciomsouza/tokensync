#!/usr/bin/env node
/**
 * Renders the screenshots in docs/design/screens/ from real output:
 *
 *   report-light.png / report-dark.png / report-mobile.png
 *       the HTML report the CLI generates for examples/aurora
 *   pr-comment.png    the Markdown the CLI generates, inside a GitHub-like frame
 *   terminal.png      the CLI's ANSI output, converted to HTML
 *   playground.png    the demo site, served under /tokensync/ like on Pages
 *
 * Requires `npm run build && npm run build:site`, and Chrome at /usr/bin/google-chrome
 * (override with CHROME_PATH).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { chromium } from 'playwright-core';
import { serve } from '../scripts/serve-site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mockups = resolve(root, 'design/mockups');
const screens = resolve(root, 'docs/design/screens');
const build = resolve(root, 'design/.build');
const aurora = resolve(root, 'examples/aurora');
const cli = resolve(root, 'dist/cli.js');
mkdirSync(screens, { recursive: true });
mkdirSync(build, { recursive: true });

const run = (args, env = {}) => {
  try {
    return execFileSync(process.execPath, [cli, ...args], {
      cwd: aurora,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
  } catch (err) {
    return err.stdout; // check exits 1 on drift; that's expected here
  }
};
const fill = (template, values) =>
  Object.entries(values).reduce(
    (html, [k, v]) => html.replace(`{{${k}}}`, v),
    readFileSync(resolve(mockups, template), 'utf8'),
  );

// 1. HTML report from the real CLI.
run(['report', '--out', resolve(build, 'report.html'), '--no-color']);

// 2. PR comment: real Markdown rendered with GitHub-flavored Markdown.
const md = run(['check', '--markdown', '--no-fail']);
writeFileSync(resolve(build, 'pr-comment.html'), fill('pr-comment.html', { BODY: marked.parse(md) }));

// 3. Terminal: real ANSI output (truecolor swatches) converted to spans.
const ansi = run(['check'], { FORCE_COLOR: '1', COLORTERM: 'truecolor' });
writeFileSync(resolve(build, 'terminal.html'), fill('terminal.html', { BODY: ansiToHtml(ansi) }));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' });
async function shot(
  url,
  out,
  { width = 1280, height = 800, scheme = 'light', fullPage = true, selector, scale = 2 } = {},
) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: scheme });
  await page.goto(url, { waitUntil: 'networkidle' });
  if (selector) await page.locator(selector).screenshot({ path: resolve(screens, out) });
  else await page.screenshot({ path: resolve(screens, out), fullPage });
  await page.close();
  console.log(`  docs/design/screens/${out}`);
}

const file = (p) => pathToFileURL(resolve(build, p)).href;
await shot(file('report.html'), 'report-light.png', { width: 1200 });
await shot(file('report.html'), 'report-dark.png', { width: 1200, scheme: 'dark' });
await shot(file('report.html'), 'report-mobile.png', {
  width: 390,
  height: 844,
  scheme: 'dark',
  fullPage: false,
  scale: 3,
});
await shot(file('pr-comment.html'), 'pr-comment.png', { width: 1012, selector: '.frame' });
await shot(file('terminal.html'), 'terminal.png', { width: 1100, selector: '.window' });

const server = await serve(4321);
await shot('http://localhost:4321/tokensync/#playground', 'playground.png', {
  width: 1440,
  height: 1100,
  fullPage: false,
});
server.close();
await browser.close();

/** Minimal SGR → HTML: bold, dim, strikethrough-less 16 colors and 24-bit backgrounds. */
function ansiToHtml(text) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const FG = { 31: 'red', 32: 'green', 33: 'yellow', 34: 'blue', 36: 'cyan', 90: 'dim' };
  let state = { bold: false, dim: false, fg: '', bg: '' };
  let out = '';
  for (const part of text.split(/(\u001b\[[0-9;]*m)/)) {
    const m = /^\u001b\[([0-9;]*)m$/.exec(part);
    if (!m) {
      if (!part) continue;
      const cls = [state.bold && 'b', state.dim && 'd', state.fg].filter(Boolean).join(' ');
      const style = state.bg ? ` style="background:${state.bg}"` : '';
      out += cls || style ? `<span class="${cls}"${style}>${esc(part)}</span>` : esc(part);
      continue;
    }
    const codes = m[1].split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) state = { bold: false, dim: false, fg: '', bg: '' };
      else if (c === 1) state.bold = true;
      else if (c === 2) state.dim = true;
      else if (c === 22) state = { ...state, bold: false, dim: false };
      else if (c === 39) state.fg = '';
      else if (c === 49) state.bg = '';
      else if (c === 48 && codes[i + 1] === 2) {
        state.bg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
        i += 4;
      } else if (FG[c]) state.fg = FG[c];
    }
  }
  return out;
}
