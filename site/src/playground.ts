import { check, parseConfig, renderHtml, renderMarkdown, sync, unifiedDiff } from './engine.js';

/**
 * Playground: everything runs in the browser with the same engine the CLI
 * uses. Nothing is sent anywhere; there is no backend.
 */

interface Fixture {
  label: string;
  path: string;
  content: string;
  target: Record<string, unknown>;
}

const FIXTURES: Record<string, Fixture> = {
  css: {
    label: 'CSS custom properties',
    path: 'tokens.css',
    content: __AURORA__.css,
    target: {
      format: 'css',
      path: 'tokens.css',
      modes: { light: ':root', dark: '[data-theme="dark"]' },
      exclude: ['color.brand.**', 'color.neutral.**', 'color.green.**', 'color.amber.**', 'color.red.**', 'font.**'],
    },
  },
  dtcg: {
    label: 'W3C Design Tokens (DTCG)',
    path: 'tokens.json',
    content: __AURORA__.dtcg,
    target: {
      format: 'dtcg',
      path: 'tokens.json',
      include: ['color.brand.**', 'color.neutral.**', 'color.green.**', 'color.amber.**', 'color.red.**', 'font.**'],
    },
  },
  tailwind: {
    label: 'Tailwind theme JSON',
    path: 'theme.json',
    content: __AURORA__.tailwind,
    target: { format: 'tailwind', path: 'theme.json', include: ['color.brand.**', 'space.*', 'radius.*'] },
  },
};

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

const figmaInput = $<HTMLTextAreaElement>('#figma-input');
const codeInput = $<HTMLTextAreaElement>('#code-input');
const formatSelect = $<HTMLSelectElement>('#format');
const threshold = $<HTMLInputElement>('#threshold');
const thresholdOut = $<HTMLOutputElement>('#threshold-out');
const scoped = $<HTMLInputElement>('#scoped');
const output = $<HTMLDivElement>('#output');
const status = $<HTMLParagraphElement>('#status');
const codeLabel = $<HTMLSpanElement>('#code-label');
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

let view: 'report' | 'markdown' | 'sync' = 'report';
const edited = new Map<string, string>();

function setStatus(text: string, tone: 'ok' | 'drift' | 'error'): void {
  status.textContent = text;
  status.dataset.tone = tone;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function run(): void {
  const fx = FIXTURES[formatSelect.value] as Fixture;
  let figma: unknown;
  try {
    figma = JSON.parse(figmaInput.value);
  } catch (err) {
    setStatus(`Figma JSON: ${(err as Error).message}`, 'error');
    return;
  }
  const target = { ...fx.target };
  if (!scoped.checked) {
    delete target.include;
    delete target.exclude;
  }
  try {
    const config = parseConfig({
      project: 'Aurora Design System',
      threshold: Number(threshold.value),
      targets: [target],
    });
    const input = { config, figma, files: { [fx.path]: codeInput.value } };
    const { result, warnings } = check(input);
    const s = result.summary;
    setStatus(
      s.total === 0
        ? `In sync · ${s.inSync} tokens match Figma`
        : `${s.changed} changed · ${s.added} missing in code · ${s.removed} not in Figma · ${s.inSync} in sync`,
      s.total === 0 ? 'ok' : 'drift',
    );
    const warn = warnings.length
      ? `<p class="pg-warn">${warnings.length} warning${warnings.length > 1 ? 's' : ''}: ${escape(warnings.slice(0, 3).join(' · '))}</p>`
      : '';
    if (view === 'report') {
      output.innerHTML = warn + renderHtml(result, { fragment: true, figmaSource: 'the pasted Figma JSON' });
    } else if (view === 'markdown') {
      output.innerHTML = `${warn}<pre class="pg-code">${escape(renderMarkdown(result))}</pre>`;
    } else {
      const { writes } = sync(input);
      const next = writes[fx.path];
      output.innerHTML =
        warn +
        (next === undefined
          ? '<p class="pg-empty">Nothing to sync. The code already matches Figma.</p>'
          : `<pre class="pg-code pg-diff">${unifiedDiff(fx.path, codeInput.value, next)
              .split('\n')
              .map((l) => {
                const cls =
                  l.startsWith('+++') || l.startsWith('---')
                    ? 'h'
                    : l[0] === '+'
                      ? 'a'
                      : l[0] === '-'
                        ? 'd'
                        : l.startsWith('@@')
                          ? 'k'
                          : '';
                return `<span class="${cls}">${escape(l)}</span>`;
              })
              .join('\n')}</pre>`);
    }
  } catch (err) {
    setStatus((err as Error).message, 'error');
  }
}

let timer: number | undefined;
const schedule = (): void => {
  window.clearTimeout(timer);
  timer = window.setTimeout(run, 150);
};

function loadFormat(): void {
  const fx = FIXTURES[formatSelect.value] as Fixture;
  codeInput.value = edited.get(formatSelect.value) ?? fx.content;
  codeLabel.textContent = fx.path;
  run();
}

figmaInput.value = __AURORA__.figma;
figmaInput.addEventListener('input', schedule);
codeInput.addEventListener('input', () => {
  edited.set(formatSelect.value, codeInput.value);
  schedule();
});
formatSelect.addEventListener('change', loadFormat);
scoped.addEventListener('change', run);
threshold.addEventListener('input', () => {
  thresholdOut.textContent = Number(threshold.value).toFixed(1);
  schedule();
});
$<HTMLButtonElement>('#reset').addEventListener('click', () => {
  figmaInput.value = __AURORA__.figma;
  edited.clear();
  threshold.value = '1';
  thresholdOut.textContent = '1.0';
  scoped.checked = true;
  loadFormat();
});
for (const tab of tabs) {
  tab.addEventListener('click', () => {
    view = tab.dataset.view as typeof view;
    for (const t of tabs) t.setAttribute('aria-selected', String(t === tab));
    run();
  });
}

loadFormat();
