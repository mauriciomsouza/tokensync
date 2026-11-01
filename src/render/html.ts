import { luminance } from '../core/color.js';
import type { Change, DriftResult, ModeDiff, ModeValue, TargetDiff } from '../core/types.js';
import { displayValue } from '../core/value.js';
import { escapeHtml as e, KIND_LABEL, modeLabel, multiMode, summaryLine } from './shared.js';

/**
 * Self-contained HTML report. Visual system: "Proof" (see docs/design/DESIGN_SPEC.md).
 * No external requests, no scripts required, deterministic output (no timestamps
 * unless the caller passes one).
 */

export interface HtmlOptions {
  /** Shown in the header; omit for deterministic output. */
  generatedAt?: string;
  /** Short description of where the Figma data came from. */
  figmaSource?: string;
  /** Render without the outer document (used by the playground). */
  fragment?: boolean;
}

export const REPORT_CSS = `
.ts-report{--paper:#f7f6f2;--card:#ffffff;--ink:#16161a;--ink-2:#55565e;--ink-3:#8a8b93;--rule:#e4e2dc;--rule-2:#efede8;
--changed:#b45309;--changed-bg:#fdf3e4;--added:#1d5fd1;--added-bg:#eaf1fd;--removed:#b42318;--removed-bg:#fdecea;--ok:#127a4a;--ok-bg:#e7f5ee;
--check:linear-gradient(45deg,#d9d7d0 25%,transparent 25%,transparent 75%,#d9d7d0 75%),linear-gradient(45deg,#d9d7d0 25%,#fff 25%,#fff 75%,#d9d7d0 75%);
--ring:rgb(0 0 0/.1);--sans:ui-sans-serif,system-ui,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
--mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,"Liberation Mono",monospace;
color:var(--ink);font:14px/1.5 var(--sans);-webkit-font-smoothing:antialiased;container-type:inline-size}
@media (prefers-color-scheme:dark){.ts-report:not([data-theme=light]){--paper:#121214;--card:#1a1a1e;--ink:#ececef;--ink-2:#a4a5ad;--ink-3:#6f707a;--rule:#2b2b31;--rule-2:#222227;--ring:rgb(255 255 255/.16);
--changed:#f0a54a;--changed-bg:#2c2113;--added:#7aa7ff;--added-bg:#16213a;--removed:#ff8a7a;--removed-bg:#341a17;--ok:#5fd39a;--ok-bg:#12291e;
--check:linear-gradient(45deg,#3a3a40 25%,transparent 25%,transparent 75%,#3a3a40 75%),linear-gradient(45deg,#3a3a40 25%,#222 25%,#222 75%,#3a3a40 75%)}}
.ts-report[data-theme=dark]{--paper:#121214;--card:#1a1a1e;--ink:#ececef;--ink-2:#a4a5ad;--ink-3:#6f707a;--rule:#2b2b31;--rule-2:#222227;--ring:rgb(255 255 255/.16);
--changed:#f0a54a;--changed-bg:#2c2113;--added:#7aa7ff;--added-bg:#16213a;--removed:#ff8a7a;--removed-bg:#341a17;--ok:#5fd39a;--ok-bg:#12291e;
--check:linear-gradient(45deg,#3a3a40 25%,transparent 25%,transparent 75%,#3a3a40 75%),linear-gradient(45deg,#3a3a40 25%,#222 25%,#222 75%,#3a3a40 75%)}
.ts-report *{box-sizing:border-box}
.ts-wrap{max-width:1080px;margin:0 auto;padding:48px 32px 64px}
.ts-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:24px;padding-bottom:28px;border-bottom:1px solid var(--rule)}
.ts-eyebrow{font:500 12px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin:0 0 12px;display:flex;align-items:center;gap:8px}
.ts-mark{width:14px;height:14px;border-radius:50%;background:conic-gradient(var(--ink) 0 50%,transparent 0);box-shadow:inset 0 0 0 1.5px var(--ink)}
.ts-title{font-size:32px;line-height:1.15;letter-spacing:-.02em;font-weight:650;margin:0}
.ts-sub{margin:8px 0 0;color:var(--ink-2)}
.ts-stats{display:flex;gap:4px;flex-wrap:wrap}
.ts-stat{min-width:104px;padding:12px 14px;background:var(--card);border:1px solid var(--rule);border-radius:10px}
.ts-stat b{display:block;font:600 26px/1 var(--sans);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.ts-stat span{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:var(--ink-2)}
.ts-stat i{width:8px;height:8px;border-radius:2px;display:inline-block}
.ts-stat.changed i{background:var(--changed)}.ts-stat.added i{background:var(--added)}.ts-stat.removed i{background:var(--removed)}.ts-stat.ok i{background:var(--ok)}
.ts-target{margin-top:40px}
.ts-target>header{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.ts-target h2{font:600 15px/1.3 var(--mono);margin:0;letter-spacing:-.01em}
.ts-chip{font:500 11px/1 var(--mono);padding:4px 7px;border-radius:5px;border:1px solid var(--rule);color:var(--ink-2);background:var(--card)}
.ts-meta{color:var(--ink-3);font-size:13px;margin-left:auto}
.ts-group{background:var(--card);border:1px solid var(--rule);border-radius:12px;overflow:hidden;margin-bottom:12px}
.ts-group>h3{display:flex;align-items:center;gap:8px;margin:0;padding:11px 16px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2);border-bottom:1px solid var(--rule)}
.ts-group>h3 i{width:8px;height:8px;border-radius:2px}
.ts-group.changed>h3 i{background:var(--changed)}.ts-group.added>h3 i{background:var(--added)}.ts-group.removed>h3 i{background:var(--removed)}
.ts-group>h3 em{font-style:normal;color:var(--ink-3);font-weight:500}
.ts-row{display:grid;grid-template-columns:minmax(150px,1.2fr) 48px minmax(0,2.4fr) 72px;align-items:center;gap:16px;padding:12px 16px;border-top:1px solid var(--rule-2)}
.ts-group>h3+.ts-row{border-top:0}
.ts-row.single{grid-template-columns:minmax(180px,1.3fr) minmax(0,2.2fr) 84px}
.ts-row.nomode{grid-template-columns:minmax(150px,1.2fr) minmax(0,2.4fr) 72px}
.ts-name{font:500 13px/1.35 var(--mono);overflow-wrap:anywhere}
.ts-name small{display:block;font:12px/1.4 var(--sans);color:var(--ink-3);margin-top:2px}
.ts-mode{font:500 11px/1 var(--mono);color:var(--ink-2);text-transform:lowercase}
.ts-mode.cont{visibility:hidden}
.ts-cmp{display:grid;grid-template-columns:1fr 20px 1fr;align-items:center;gap:10px;min-width:0}
.ts-side{display:flex;align-items:center;gap:10px;min-width:0}
.ts-side .ts-val{font:13px/1.3 var(--mono);overflow-wrap:anywhere;min-width:0}
.ts-side .ts-val small{display:block;font:11px/1.3 var(--mono);color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ts-side.old .ts-val>span{color:var(--ink-2);text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--removed) 70%,transparent);text-decoration-thickness:1.5px}
.ts-side.new .ts-val>span{font-weight:600}
.ts-arrow{color:var(--ink-3);text-align:center;font:14px/1 var(--mono)}
.ts-sw{position:relative;flex:none;width:40px;height:40px;border-radius:8px;background:var(--check);background-size:10px 10px;background-position:0 0,5px 5px;box-shadow:inset 0 0 0 1px rgb(0 0 0/.08)}
.ts-sw::after{content:"";position:absolute;inset:0;border-radius:inherit;background:var(--c);box-shadow:inset 0 0 0 1px var(--ring)}
.ts-pair{display:flex;flex:none;border-radius:8px;overflow:hidden;box-shadow:inset 0 0 0 1px rgb(0 0 0/.08)}
.ts-dim{flex:none;width:40px;height:40px;display:flex;align-items:center;justify-content:flex-start}
.ts-dim i{display:block;height:12px;border-radius:3px;background:var(--ink-3);min-width:2px;max-width:40px}
.ts-side.new .ts-dim i{background:var(--ink)}
.ts-radius{flex:none;width:40px;height:40px;border:1.5px solid var(--ink-3);border-right:0;border-bottom:0;background:transparent}
.ts-side.new .ts-radius{border-color:var(--ink)}
.ts-txt{flex:none;width:40px;height:40px;border-radius:8px;border:1px dashed var(--rule);display:flex;align-items:center;justify-content:center;font:600 13px/1 var(--sans);color:var(--ink-3)}
.ts-de{justify-self:end;font:600 12px/1 var(--mono);padding:5px 7px;border-radius:6px;color:var(--changed);background:var(--changed-bg);white-space:nowrap;font-variant-numeric:tabular-nums}
.ts-de.big{color:var(--removed);background:var(--removed-bg)}
.ts-de.none{color:var(--ink-3);background:transparent;font-weight:500}
.ts-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.ts-item{display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid var(--rule-2);border-right:1px solid var(--rule-2);min-width:0}
.ts-item .ts-sw,.ts-item .ts-dim,.ts-item .ts-txt,.ts-item .ts-radius{width:32px;height:32px}
.ts-item .ts-dim i{max-width:32px}
.ts-item div{min-width:0}
.ts-item .ts-name{font-size:12.5px}
.ts-item .ts-v{font:12px/1.3 var(--mono);color:var(--ink-2);overflow-wrap:anywhere}
.ts-notes{margin:10px 0 0;padding:0;list-style:none;color:var(--ink-2);font-size:13px}
.ts-notes li{padding:4px 0 4px 18px;position:relative}
.ts-notes li::before{content:"!";position:absolute;left:2px;top:4px;font:600 11px/18px var(--mono);color:var(--changed)}
.ts-ok{display:flex;align-items:center;gap:10px;padding:16px;background:var(--ok-bg);color:var(--ok);border-radius:12px;font-weight:550}
.ts-foot{margin-top:48px;padding-top:20px;border-top:1px solid var(--rule);display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between;color:var(--ink-3);font-size:12.5px}
.ts-foot code{font:12px var(--mono);color:var(--ink-2)}
@container (max-width:620px){.ts-wrap{padding:28px 16px 40px}.ts-title{font-size:26px}
.ts-stat{min-width:0;flex:1 1 40%}
.ts-row,.ts-row.single,.ts-row.nomode{grid-template-columns:1fr auto;gap:10px}
.ts-row .ts-cmp{grid-column:1/-1;grid-template-columns:minmax(0,1fr) 14px minmax(0,1fr);gap:8px}
.ts-row .ts-sw,.ts-row .ts-dim,.ts-row .ts-radius,.ts-row .ts-txt{width:32px;height:32px}.ts-side{gap:8px}
.ts-row .ts-mode{grid-row:1;grid-column:2;justify-self:end}
.ts-row .ts-mode.cont{visibility:visible}
.ts-row .ts-de{grid-column:2;grid-row:1}
.ts-row:has(.ts-mode) .ts-de{grid-row:3;grid-column:1/-1;justify-self:start}
.ts-meta{margin-left:0;width:100%}}
`;

const PAGE_CSS = `html{background:#f7f6f2}@media (prefers-color-scheme:dark){html{background:#121214}}
body{margin:0;background:var(--paper)}`;

function swatchStyle(v: ModeValue): string {
  if (v.value.type !== 'color') return '';
  const c = v.value.color;
  const rgb = `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)} / ${Math.round(c.a * 1000) / 1000})`;
  return `--c:${rgb}`;
}

function visual(v: ModeValue | undefined, name: string, scale: number): string {
  if (!v) return '<span class="ts-txt">—</span>';
  const val = v.value;
  const lum = val.type === 'color' ? luminance(val.color) : 0;
  if (val.type === 'color') {
    return `<span class="ts-sw" style="${swatchStyle(v)}" title="${e(displayValue(val))}" data-lum="${lum.toFixed(2)}"></span>`;
  }
  if (val.type === 'dimension') {
    if (/(^|\.)radius(\.|$)|rounded/.test(name)) {
      const r = Math.min(val.px, 40);
      return `<span class="ts-radius" style="border-top-left-radius:${r}px"></span>`;
    }
    const w = Math.max(2, Math.round((val.px / scale) * 40));
    return `<span class="ts-dim"><i style="width:${w}px"></i></span>`;
  }
  if (val.type === 'string' && /font|family/.test(name)) {
    return `<span class="ts-txt" style="font-family:${e(val.value)}">Aa</span>`;
  }
  return `<span class="ts-txt">${val.type === 'number' ? '#' : 'T'}</span>`;
}

function valueHtml(v: ModeValue | undefined): string {
  if (!v) return '<span>—</span>';
  const alias = v.alias ? `<small>→ ${e(v.alias)}</small>` : '';
  return `<span>${e(displayValue(v.value))}</span>${alias}`;
}

function deltaBadge(c: Change, d: ModeDiff): string {
  if (d.deltaE !== undefined) {
    return `<span class="ts-de${d.deltaE >= 10 ? ' big' : ''}" title="CIEDE2000 distance">ΔE ${d.deltaE.toFixed(1)}</span>`;
  }
  const f = d.figma?.value;
  const k = d.code?.value;
  if (f?.type === 'dimension' && k?.type === 'dimension') {
    const n = Math.round((f.px - k.px) * 100) / 100;
    return `<span class="ts-de">${n > 0 ? '+' : ''}${n}px</span>`;
  }
  if (!d.code) return '<span class="ts-de none">missing</span>';
  return `<span class="ts-de none">${e(c.type)}</span>`;
}

function maxDimension(t: TargetDiff): number {
  let max = 1;
  for (const c of t.changes)
    for (const d of c.modes)
      for (const v of [d.figma, d.code]) if (v?.value.type === 'dimension') max = Math.max(max, v.value.px);
  return Math.min(max, 96);
}

function changedGroup(t: TargetDiff): string {
  const rows = t.changes.filter((c) => c.kind === 'changed');
  if (rows.length === 0) return '';
  const showMode = multiMode(t);
  const scale = maxDimension(t);
  const body = rows
    .map((c) =>
      c.modes
        .map(
          (d, i) => `<div class="ts-row${showMode ? '' : ' nomode'}">
<div class="ts-name">${i === 0 ? e(c.name) : ''}</div>
${showMode ? `<div class="ts-mode${i > 0 ? '' : ''}">${e(modeLabel(d.mode))}</div>` : ''}
<div class="ts-cmp"><div class="ts-side old">${visual(d.code, c.name, scale)}<div class="ts-val">${valueHtml(d.code)}</div></div><div class="ts-arrow" aria-label="becomes">→</div><div class="ts-side new">${visual(d.figma, c.name, scale)}<div class="ts-val">${valueHtml(d.figma)}</div></div></div>
${deltaBadge(c, d)}
</div>`,
        )
        .join(''),
    )
    .join('');
  return `<section class="ts-group changed"><h3><i></i>${KIND_LABEL.changed} <em>${rows.length} · code → Figma</em></h3>${body}</section>`;
}

function listGroup(t: TargetDiff, kind: 'added' | 'removed'): string {
  const rows = t.changes.filter((c) => c.kind === kind);
  if (rows.length === 0) return '';
  const side = kind === 'added' ? 'figma' : 'code';
  const scale = maxDimension(t);
  const items = rows
    .map((c) => {
      const first = c.modes[0];
      const v = first?.[side];
      const modes =
        multiMode(t) && c.modes.length > 1
          ? c.modes.map((d) => displayValue(d[side]?.value ?? { type: 'string', value: '—' })).join(' / ')
          : v
            ? displayValue(v.value)
            : '—';
      const pair =
        multiMode(t) && c.modes.length > 1 && c.type === 'color'
          ? `<span class="ts-pair">${c.modes.map((d) => `<span class="ts-sw" style="${d[side] ? swatchStyle(d[side]) : ''};width:16px;height:32px;border-radius:0;box-shadow:none"></span>`).join('')}</span>`
          : visual(v, c.name, scale);
      return `<div class="ts-item">${pair}<div><div class="ts-name">${e(c.name)}</div><div class="ts-v">${e(modes)}</div></div></div>`;
    })
    .join('');
  const hint = kind === 'added' ? 'in Figma, not in code' : 'in code, not in Figma';
  return `<section class="ts-group ${kind}"><h3><i></i>${KIND_LABEL[kind]} <em>${rows.length} · ${hint}</em></h3><div class="ts-list">${items}</div></section>`;
}

function targetSection(t: TargetDiff): string {
  const n = t.changes.length;
  const meta = `${n === 0 ? 'in sync' : `${n} difference${n === 1 ? '' : 's'}`} · ${t.inSync} matching${t.withinTolerance ? ` (${t.withinTolerance} within ΔE tolerance)` : ''}`;
  const modes = multiMode(t) ? t.modes.map((m) => `<span class="ts-chip">${e(m)}</span>`).join('') : '';
  const notes = t.notes.length ? `<ul class="ts-notes">${t.notes.map((x) => `<li>${e(x)}</li>`).join('')}</ul>` : '';
  const body =
    n === 0
      ? `<div class="ts-ok">● Matches Figma</div>`
      : changedGroup(t) + listGroup(t, 'added') + listGroup(t, 'removed');
  return `<section class="ts-target"><header><h2>${e(t.target)}</h2><span class="ts-chip">${e(t.format)}</span>${modes}<span class="ts-meta">${e(meta)}</span></header>${body}${notes}</section>`;
}

export function renderHtml(result: DriftResult, opts: HtmlOptions = {}): string {
  const s = result.summary;
  const drift = s.total > 0;
  const stat = (cls: string, n: number, label: string): string =>
    `<div class="ts-stat ${cls}"><b>${n}</b><span><i></i>${label}</span></div>`;
  const source = opts.figmaSource ? ` against ${e(opts.figmaSource)}` : '';
  const inner = `<div class="ts-wrap">
<header class="ts-head"><div><p class="ts-eyebrow"><span class="ts-mark"></span>tokensync · drift report</p>
<h1 class="ts-title">${e(result.project)}</h1>
<p class="ts-sub">${drift ? `${s.total} token${s.total === 1 ? '' : 's'} drifted from Figma${source}.` : `Code matches Figma${source}.`}</p></div>
<div class="ts-stats">${stat('changed', s.changed, 'changed')}${stat('added', s.added, 'missing in code')}${stat('removed', s.removed, 'not in Figma')}${stat('ok', s.inSync, 'in sync')}</div></header>
${result.targets.map(targetSection).join('\n')}
<footer class="ts-foot"><span>${e(summaryLine(result))} · colors compared with CIEDE2000, threshold ΔE ${result.threshold}</span><span>${drift ? 'Fix with <code>npx tokensync sync --write</code>' : ''}${opts.generatedAt ? ` · ${e(opts.generatedAt)}` : ''}</span></footer>
</div>`;
  if (opts.fragment) return `<div class="ts-report">${inner}</div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:,">
<title>${e(result.project)} · tokensync report</title>
<style>${PAGE_CSS}${REPORT_CSS}</style>
</head>
<body class="ts-report">
${inner}
</body>
</html>
`;
}
