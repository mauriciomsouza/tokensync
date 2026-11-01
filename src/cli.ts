#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { ConfigError } from './core/config.js';
import { check, hasDrift, sync } from './core/engine.js';
import { unifiedDiff } from './core/linediff.js';
import { renderHtml } from './render/html.js';
import { renderMarkdown } from './render/markdown.js';
import { renderTerminal } from './render/terminal.js';
import { loadConfig, loadFigma, loadTargetFiles, writeFiles } from './node/io.js';
import { VERSION } from './version.js';

const HELP = `
${pc.bold('tokensync')} — catch design-token drift between Figma and code before it ships.

${pc.bold('Usage')}
  tokensync check   [options]     Compare Figma variables with code tokens (exit 1 on drift)
  tokensync report  [options]     Write a self-contained HTML drift report
  tokensync sync    [options]     Preview (or --write) code updates that match Figma

${pc.bold('Figma source')} (one of)
  --figma <file>        Figma Variables JSON (GET /v1/files/:key/variables/local)
  --file-key <key>      Fetch live from the Figma API; needs FIGMA_TOKEN in the environment
                        (default: figma.file / figma.fileKey from the config)

${pc.bold('Options')}
  -c, --config <path>   Config file (default: ./tokensync.config.json)
  --threshold <ΔE>      Override the CIEDE2000 color threshold (default 1)
  --json                check: print the drift result as JSON
  --markdown            check: print a Markdown report (for PR comments)
  -o, --out <file>      report: output path (default: tokensync-report.html)
                        check: also write the --json/--markdown output to a file
  --write               sync: write the changes to disk (otherwise dry run)
  --prune               sync: also remove tokens that are not in Figma
  --no-fail             check: exit 0 even when drift is found
  --no-color            Disable colors
  -v, --version         Print the version
  -h, --help            Show this help

${pc.bold('Exit codes')}
  0  in sync (or --no-fail)    1  drift found    2  usage or config error
`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string', short: 'c' },
      figma: { type: 'string' },
      'file-key': { type: 'string' },
      threshold: { type: 'string' },
      json: { type: 'boolean' },
      markdown: { type: 'boolean' },
      out: { type: 'string', short: 'o' },
      write: { type: 'boolean' },
      prune: { type: 'boolean' },
      'no-fail': { type: 'boolean' },
      'no-color': { type: 'boolean' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const command = positionals[0];
  if (values.help || !command) {
    process.stdout.write(HELP);
    return command || values.help ? 0 : 2;
  }
  if (!['check', 'report', 'sync'].includes(command)) {
    process.stderr.write(`Unknown command "${command}". Run tokensync --help.\n`);
    return 2;
  }

  const color = values['no-color'] ? false : undefined;
  const k = pc.createColors(color ?? pc.isColorSupported);
  const cwd = process.cwd();
  const { config, root } = await loadConfig(values.config, cwd);
  if (values.threshold !== undefined) {
    const t = Number(values.threshold);
    if (!Number.isFinite(t) || t < 0) throw new ConfigError('--threshold must be a non-negative number');
    config.threshold = t;
  }
  const figma = await loadFigma({ file: values.figma, fileKey: values['file-key'], cwd, root, config });
  const files = await loadTargetFiles(config, root);
  const warn = (msgs: string[]): void => {
    for (const w of msgs) process.stderr.write(`${k.yellow('warning')} ${w}\n`);
  };

  if (command === 'check') {
    const { result, warnings } = check({ config, figma: figma.data, files });
    warn(warnings);
    let output: string;
    if (values.json) output = `${JSON.stringify(result, null, 2)}\n`;
    else if (values.markdown) output = renderMarkdown(result);
    else output = renderTerminal(result, color === undefined ? {} : { color });
    process.stdout.write(output);
    if (values.out && (values.json || values.markdown)) {
      const out = resolve(cwd, values.out);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, output, 'utf8');
    }
    return hasDrift(result) && !values['no-fail'] ? 1 : 0;
  }

  if (command === 'report') {
    const { result, warnings } = check({ config, figma: figma.data, files });
    warn(warnings);
    const out = resolve(cwd, values.out ?? 'tokensync-report.html');
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, renderHtml(result, { figmaSource: figma.label }), 'utf8');
    const s = result.summary;
    process.stdout.write(
      `${k.green('✓')} Report written to ${k.bold(relative(cwd, out))} ${k.dim(`(${s.changed} changed, ${s.added} missing, ${s.removed} not in Figma)`)}\n`,
    );
    return 0;
  }

  // sync
  const { writes, result, warnings } = sync({ config, figma: figma.data, files }, { prune: values.prune ?? false });
  warn(warnings);
  const paths = Object.keys(writes);
  if (paths.length === 0) {
    process.stdout.write(`${k.green('●')} Nothing to sync — code matches Figma.\n`);
    return 0;
  }
  if (!values.write) {
    for (const p of paths) {
      const diff = unifiedDiff(p, files[p] ?? '', writes[p] ?? '');
      for (const line of diff.split('\n')) {
        const c =
          line.startsWith('+++') || line.startsWith('---')
            ? k.bold
            : line.startsWith('+')
              ? k.green
              : line.startsWith('-')
                ? k.red
                : line.startsWith('@@')
                  ? k.cyan
                  : k.dim;
        process.stdout.write(`${c(line)}\n`);
      }
      process.stdout.write('\n');
    }
    const pruneNote =
      !values.prune && result.summary.removed > 0
        ? ` ${result.summary.removed} token(s) not in Figma are kept; add --prune to remove them.`
        : '';
    process.stdout.write(
      `${k.yellow('◐')} Dry run: ${paths.length} file(s) would change. Re-run with ${k.bold('--write')} to apply.${pruneNote}\n`,
    );
    return 0;
  }
  const written = await writeFiles(writes, root);
  for (const p of written) process.stdout.write(`${k.green('✓')} Updated ${p}\n`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${pc.red('error')} ${msg}\n`);
    process.exitCode = 2;
  },
);
