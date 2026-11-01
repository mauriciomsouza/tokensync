#!/usr/bin/env node
/**
 * Serves site/dist under /tokensync/ — the same base path GitHub Pages uses —
 * so relative links are verified the way they will run in production.
 * Usage: node scripts/serve-site.mjs [port]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = '/tokensync/';
const dist = resolve(fileURLToPath(new URL('../site/dist', import.meta.url)));
const port = Number(process.argv[2] ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function serve(listenPort = port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/tokensync') {
      res.writeHead(301, { Location: BASE }).end();
      return;
    }
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(404).end('Not found (site is served under /tokensync/)');
      return;
    }
    let file = normalize(join(dist, decodeURIComponent(url.pathname.slice(BASE.length))));
    if (!file.startsWith(dist)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(listenPort, () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await serve();
  console.log(`http://localhost:${port}${BASE}`);
}
