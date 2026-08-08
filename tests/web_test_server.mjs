import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const PORT = Number(process.env.PORT || 8000);

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.pck', 'application/octet-stream'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.mp3', 'audio/mpeg'],
  ['.ico', 'image/x-icon'],
]);

function reply(res, status, body = '', headers = {}) {
  res.writeHead(status, {
    'cache-control': 'no-store, max-age=0',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    ...headers,
  });
  res.end(body);
}

function safeFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relative);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

  // The real production endpoint is serverless. Browser smoke tests only need
  // a harmless sink so telemetry can run without polluting console/errors.
  if (url.pathname === '/api/telemetry') {
    if (req.method === 'POST') {
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 128_000) {
          reply(res, 413);
          return;
        }
      }
      reply(res, 204);
      return;
    }
    if (req.method === 'OPTIONS') {
      reply(res, 204, '', { allow: 'POST, OPTIONS' });
      return;
    }
    reply(res, 405, '', { allow: 'POST, OPTIONS' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    reply(res, 405);
    return;
  }

  const filename = safeFile(url.pathname);
  if (!filename) {
    reply(res, 400);
    return;
  }

  try {
    const info = await stat(filename);
    if (!info.isFile()) {
      reply(res, 404);
      return;
    }
    const body = req.method === 'HEAD' ? '' : await readFile(filename);
    reply(res, 200, body, {
      'content-type': TYPES.get(path.extname(filename).toLowerCase()) || 'application/octet-stream',
      'content-length': String(info.size),
    });
  } catch {
    reply(res, 404);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`YAKOLAK_WEB_TEST_SERVER_READY http://127.0.0.1:${PORT}`);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
