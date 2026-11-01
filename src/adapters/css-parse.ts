/**
 * A deliberately small CSS scanner: just enough structure to find custom
 * property declarations, the rule they live in, and the exact character
 * ranges of their values, so `sync --write` can edit a stylesheet surgically
 * without reformatting it or touching comments.
 */

export interface Declaration {
  name: string;
  /** Raw value text, trimmed. */
  value: string;
  /** Offsets of the value inside the source (trimmed). */
  valueStart: number;
  valueEnd: number;
  /** Offsets of the whole line(s) holding the declaration, for removal. */
  lineStart: number;
  lineEnd: number;
}

export interface Rule {
  /** Enclosing at-rule prelude (e.g. `@media (prefers-color-scheme: dark)`), or '' at top level. */
  context: string;
  /** Selector list as written, trimmed. */
  selector: string;
  /** Offset just after `{`. */
  bodyStart: number;
  /** Offset of the closing `}`. */
  bodyEnd: number;
  declarations: Declaration[];
}

const collapse = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/'/g, '"')
    .replace(/\s*([(),:>+~=])\s*/g, '$1')
    .trim();

/** Skips a comment or string starting at `i`; returns the index after it, or `i` if neither. */
function skipOpaque(src: string, i: number): number {
  if (src[i] === '/' && src[i + 1] === '*') {
    const end = src.indexOf('*/', i + 2);
    return end === -1 ? src.length : end + 2;
  }
  const q = src[i];
  if (q === '"' || q === "'") {
    let j = i + 1;
    while (j < src.length && src[j] !== q) {
      if (src[j] === '\\') j++;
      j++;
    }
    return j + 1;
  }
  return i;
}

function parseDeclarations(src: string, start: number, end: number): Declaration[] {
  const out: Declaration[] = [];
  let i = start;
  let declStart = start;
  let depth = 0;
  const flush = (stop: number): void => {
    const text = src.slice(declStart, stop);
    const colon = text.indexOf(':');
    if (colon !== -1) {
      const rawName = text
        .slice(0, colon)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();
      if (rawName.startsWith('--')) {
        const rawValue = text.slice(colon + 1);
        const lead = rawValue.length - rawValue.trimStart().length;
        const valueStart = declStart + colon + 1 + lead;
        const valueEnd = declStart + colon + 1 + rawValue.trimEnd().length;
        const nameAt = declStart + text.indexOf(rawName);
        const lineStart = src.lastIndexOf('\n', nameAt - 1) + 1;
        // Include a trailing comment on the same line and the newline itself.
        let lineEnd = stop < end && src[stop] === ';' ? stop + 1 : stop;
        const nl = src.indexOf('\n', lineEnd);
        const rest = src.slice(lineEnd, nl === -1 ? end : nl);
        if (/^\s*(\/\*.*\*\/)?\s*$/.test(rest)) lineEnd = nl === -1 ? end : nl + 1;
        out.push({
          name: rawName,
          value: src.slice(valueStart, valueEnd),
          valueStart,
          valueEnd,
          lineStart: /^\s*$/.test(src.slice(lineStart, nameAt)) ? lineStart : nameAt,
          lineEnd,
        });
      }
    }
  };
  while (i < end) {
    const skipped = skipOpaque(src, i);
    if (skipped !== i) {
      if (src[i] === '/' && depth === 0 && /^\s*$/.test(src.slice(declStart, i))) declStart = skipped;
      i = skipped;
      continue;
    }
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) {
      flush(i);
      declStart = i + 1;
    }
    i++;
  }
  if (src.slice(declStart, end).trim()) flush(end);
  return out;
}

/** Finds the matching `}` for the `{` at `open`. */
function matchBrace(src: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const skipped = skipOpaque(src, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  throw new Error('Unbalanced braces in CSS');
}

export function parseCss(src: string, start = 0, end = src.length, context = ''): Rule[] {
  const rules: Rule[] = [];
  let i = start;
  let preludeStart = start;
  while (i < end) {
    const skipped = skipOpaque(src, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = src[i];
    if (ch === ';') {
      // e.g. @import, @charset
      preludeStart = i + 1;
    } else if (ch === '{') {
      const close = matchBrace(src, i);
      const prelude = collapse(src.slice(preludeStart, i));
      if (prelude.startsWith('@')) {
        const inner = context ? `${context} ${prelude}` : prelude;
        rules.push(...parseCss(src, i + 1, close, inner));
      } else {
        rules.push({
          context,
          selector: prelude,
          bodyStart: i + 1,
          bodyEnd: close,
          declarations: parseDeclarations(src, i + 1, close),
        });
      }
      i = close + 1;
      preludeStart = i;
      continue;
    }
    i++;
  }
  return rules;
}

/**
 * A mode spec is either a selector (`:root`, `[data-theme="dark"]`, `.dark`)
 * or an at-rule optionally followed by a selector
 * (`@media (prefers-color-scheme: dark)` → `:root` inside that media query).
 */
export function parseModeSpec(spec: string): { context: string; selector: string } {
  const s = spec.trim();
  if (!s.startsWith('@')) return { context: '', selector: collapse(s) };
  // Split "@media (…) .dark" into prelude and trailing selector.
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) {
        const rest = s.slice(i + 1).trim();
        if (rest && !/^(and|or|not)\b/.test(rest)) {
          return { context: collapse(s.slice(0, i + 1)), selector: collapse(rest) };
        }
      }
    }
  }
  return { context: collapse(s), selector: ':root' };
}

export function ruleMatches(rule: Rule, spec: { context: string; selector: string }): boolean {
  if (rule.context !== spec.context) return false;
  return rule.selector.split(',').some((sel) => sel.trim() === spec.selector);
}

/** Serializes a mode spec into a new rule, used when the stylesheet has no block for a mode yet. */
export function newRuleText(spec: { context: string; selector: string }, body: string[], indent: string): string {
  if (!spec.context) return `${spec.selector} {\n${body.map((l) => indent + l).join('\n')}\n}\n`;
  return `${spec.context} {\n${indent}${spec.selector} {\n${body.map((l) => indent + indent + l).join('\n')}\n${indent}}\n}\n`;
}
