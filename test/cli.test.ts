import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AURORA } from './helpers.js';

const root = resolve(AURORA, '../..');
const cli = resolve(root, 'dist/cli.js');
let dir = '';

const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [cli, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  });

beforeAll(() => {
  if (!existsSync(cli)) execFileSync('npx', ['tsup'], { cwd: root, stdio: 'ignore' });
  dir = mkdtempSync(join(tmpdir(), 'tokensync-'));
  cpSync(AURORA, dir, { recursive: true });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('cli', () => {
  it('check exits 1 on drift and prints a summary', () => {
    const r = run(['check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('Drift detected');
  });

  it('check --json is machine-readable', () => {
    const r = run(['check', '--json', '--no-fail']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).summary.total).toBe(14);
  });

  it('sync without --write never touches files', () => {
    const before = readFileSync(join(dir, 'src/styles/tokens.css'), 'utf8');
    const r = run(['sync']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Dry run');
    expect(readFileSync(join(dir, 'src/styles/tokens.css'), 'utf8')).toBe(before);
  });

  it('report writes a single HTML file', () => {
    const r = run(['report', '-o', 'out/report.html']);
    expect(r.status).toBe(0);
    expect(readFileSync(join(dir, 'out/report.html'), 'utf8')).toContain('<!doctype html>');
  });

  it('sync --write --prune makes check pass', () => {
    expect(run(['sync', '--write', '--prune']).status).toBe(0);
    const r = run(['check']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('In sync');
  });

  it('exits 2 on config errors and never prints the Figma token', () => {
    const r = run(['check', '--file-key', 'abc'], {
      FIGMA_TOKEN: 'figd_do_not_print',
      FIGMA_API_URL: 'http://127.0.0.1:9',
    });
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).not.toContain('figd_do_not_print');
    expect(run(['check', '--config', 'nope.json']).status).toBe(2);
    expect(run(['frobnicate']).status).toBe(2);
  });
});
