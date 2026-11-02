#!/usr/bin/env node
/**
 * Renders the LinkedIn posters in design/posters/ to docs/marketing/posters/.
 *
 *   launch.html   -> launch.png              1080x1350 at 2x (2160x2700)
 *   concept.html  -> concept.png             1080x1350 at 2x
 *   carousel.html -> carousel/01.png ...     one PNG per .poster slide
 *                 -> carousel/<name>-carousel.pdf, one 1080x1350 page per slide
 *
 * Uses the system Chrome (override with CHROME_PATH); no browser download.
 *   node design/posters/render.mjs            # everything
 *   node design/posters/render.mjs concept    # one file while iterating
 */
import { mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = resolve(root, 'docs/marketing/posters');
const name = basename(root);
mkdirSync(resolve(out, 'carousel'), { recursive: true });
const only = process.argv.slice(2);
const log = (line) => process.stdout.write(`${line}\n`);
const wanted = (file) => only.length === 0 || only.includes(file);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
});
const context = await browser.newContext({
  viewport: { width: 1080, height: 1350 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

async function open(file) {
  await page.goto(pathToFileURL(resolve(here, file)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
}

for (const poster of ['launch', 'concept'].filter(wanted)) {
  await open(`${poster}.html`);
  await page
    .locator('.poster')
    .first()
    .screenshot({ path: resolve(out, `${poster}.png`) });
  log(`  + docs/marketing/posters/${poster}.png`);
}

if (wanted('carousel')) {
  await open('carousel.html');
  const slides = page.locator('.poster');
  const count = await slides.count();
  for (let i = 0; i < count; i++) {
    const file = `carousel/${String(i + 1).padStart(2, '0')}.png`;
    await slides.nth(i).screenshot({ path: resolve(out, file) });
    log(`  + docs/marketing/posters/${file}`);
  }
  await page.emulateMedia({ media: 'print' });
  const pdf = `carousel/${name}-carousel.pdf`;
  await page.pdf({
    path: resolve(out, pdf),
    width: '1080px',
    height: '1350px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  log(`  + docs/marketing/posters/${pdf}`);
}

await browser.close();
