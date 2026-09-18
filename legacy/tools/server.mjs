#!/usr/bin/env node
/**
 * RedGet — zero-dependency static server with SPA fallback.
 *
 *   node tools/server.mjs                 # http://0.0.0.0:3000
 *   PORT=8080 node tools/server.mjs       # custom port
 *   node tools/server.mjs --quiet         # no request log
 *
 * Routes:
 *   GET  /*                → the file under the repository root, if it exists
 *   GET  /<app route>      → index.html (history-mode fallback)
 *   HEAD /*                → same as GET without a body
 *   GET  /__redget/health  → { ok, uptime, routes }   (used by tools/validate.mjs)
 *
 * Security/robustness notes:
 *   - Path traversal is blocked: the resolved path must stay inside the root.
 *   - Nothing outside the root is ever read; there are no proxy or network calls.
 *   - ETag + If-None-Match give cheap 304s during development.
 *   - Every response sets Cache-Control: no-store so edits appear immediately.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { extname, dirname, resolve, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const QUIET = process.argv.includes('--quiet');
const startedAt = Date.now();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.sh': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
};

function mimeFor(file) {
  return MIME[extname(file).toLowerCase()] || 'application/octet-stream';
}

function isInsideRoot(target) {
  const rel = relative(ROOT, target);
  return rel === '' || (!rel.startsWith('..') && !rel.split(sep).includes('..'));
}

function etagFor(file, stats) {
  return `W/"${createHash('sha1').update(`${file}:${stats.size}:${stats.mtimeMs}`).digest('hex').slice(0, 16)}"`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
  res.end(body);
}

function sendFile(req, res, file) {
  let stats;
  try { stats = statSync(file); } catch { return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' }); }
  if (stats.isDirectory()) return sendFile(req, res, join(file, 'index.html'));

  const tag = etagFor(file, stats);
  if (req.headers['if-none-match'] === tag) {
    return send(res, 304, null, { ETag: tag });
  }

  const headers = {
    'Content-Type': mimeFor(file),
    'Content-Length': stats.size,
    ETag: tag,
    'Last-Modified': stats.mtime.toUTCString(),
  };

  if (req.method === 'HEAD') return send(res, 200, null, headers);

  res.writeHead(200, headers);
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
  return undefined;
}

const server = createServer((req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch {
    return send(res, 400, 'Bad request', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  const pathname = decodeURIComponent(url.pathname);

  if (!QUIET) {
    const ms = Date.now() - startedAt;
    process.stdout.write(`[${(ms / 1000).toFixed(1)}s] ${req.method} ${pathname}\n`);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    return send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD, OPTIONS' });
  }
  if (req.method === 'OPTIONS') {
    return send(res, 204, null, { Allow: 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': '*' });
  }

  if (pathname === '/__redget/health') {
    return send(res, 200, JSON.stringify({
      ok: true,
      name: 'RedGet dev server',
      root: ROOT,
      uptimeMs: Date.now() - startedAt,
      node: process.version,
    }, null, 2), { 'Content-Type': 'application/json; charset=utf-8' });
  }

  // Static file, if it exists inside the root.
  const candidate = normalize(resolve(ROOT, `.${pathname}`));
  if (isInsideRoot(candidate) && existsSync(candidate) && statSync(candidate).isFile()) {
    return sendFile(req, res, candidate);
  }
  if (isInsideRoot(candidate) && existsSync(candidate) && statSync(candidate).isDirectory()) {
    const index = join(candidate, 'index.html');
    if (existsSync(index)) return sendFile(req, res, index);
  }

  // Asset misses are real 404s (so the validator can catch broken links).
  if (/^\/(assets|tools|data|node_modules)\//.test(pathname) || /\.[a-z0-9]{1,6}$/i.test(pathname)) {
    return send(res, 404, `Not found: ${pathname}`, { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  // Everything else is an application route → index.html.
  const index = resolve(ROOT, 'index.html');
  if (!existsSync(index)) {
    return send(res, 500, 'index.html is missing — run: node tools/build-html.mjs', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  const body = readFileSync(index);
  return send(req.method === 'HEAD' ? res : res, 200, body, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: PORT=3100 node tools/server.mjs`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`RedGet dev server → http://${HOST}:${PORT}`);
  console.log(`  root:    ${ROOT}`);
  console.log(`  health:  http://${HOST}:${PORT}/__redget/health`);
  console.log('  Ctrl+C to stop.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { server.close(); process.exit(0); });
}

export default server;
