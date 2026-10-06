// local-server.mjs: a small local stand-in for Vercel, to test the private demo without deploying anything.
// It emulates exactly the parts the demo uses:
//   - Routing Middleware: imports <dir>/middleware.ts (Node strips the types), runs it for every path its
//     config.matcher covers; a response carrying `x-middleware-next: 1` continues to the static file, any other
//     response is sent as is;
//   - static files from <dir>/public (/ and directories -> index.html, else 404);
//   - vercel.json "headers" rules (source patterns of the form "/(.*)" or literal paths) on static responses.
// It listens on 127.0.0.1 only. The env vars come from the caller (in memory), never from a file.
//
//   import { startServer } from './local-server.mjs';
//   const s = await startServer({ dir: 'out/private-demo', env: { DEMO_PASS_SALT, DEMO_PASS_SHA256 } });
//   ... s.url ... await s.close();
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4',
};

// Vercel/path-to-regexp patterns used here: "/", "/:name*", "/(.*)", literal paths.
export function patternToRegExp(p) {
  if (p === '/') return /^\/$/;
  // tokens: a regex group "( ... )" (kept raw), "/:name*" (zero or more segments), "/:name" (one segment), a literal char
  const src = p.replace(/(\([^)]*\))|(\/:[A-Za-z_]\w*\*)|(\/:[A-Za-z_]\w*)|([\s\S])/g, (_, group, star, one, ch) =>
    group ?? (star ? '(?:/.*)?' : one ? '/[^/]+' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return new RegExp('^' + src + '$');
}

export async function startServer({ dir, env, port = 0, host = '127.0.0.1', log = null }) {
  const DIR = resolve(dir);
  const PUB = join(DIR, 'public');
  const mod = await import(pathToFileURL(join(DIR, 'middleware.ts')).href + '?t=' + Date.now());
  const middleware = mod.default;
  const matchers = [].concat(mod.config?.matcher ?? ['/:path*']).map(patternToRegExp);
  const vercel = JSON.parse(readFileSync(join(DIR, 'vercel.json'), 'utf8'));
  const rules = (vercel.headers || []).map((r) => ({ re: patternToRegExp(r.source), headers: r.headers }));
  const saved = {};
  for (const [k, v] of Object.entries(env || {})) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const stats = { middlewareRuns: 0, passed: 0, refused: 0 };

  function staticFile(pathname) {
    let p;
    try { p = decodeURIComponent(pathname); } catch { return null; }
    const cands = p.endsWith('/') ? [p + 'index.html'] : [p, p + '/index.html'];
    for (const c of cands) {
      const f = resolve(PUB, '.' + c);
      if (f !== PUB && !f.startsWith(PUB + sep)) return null;
      if (existsSync(f) && statSync(f).isFile()) return f;
    }
    return null;
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || host}`);
      if (matchers.some((re) => re.test(url.pathname))) {
        stats.middlewareRuns++;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
        const r = await middleware(new Request(url, { method: req.method, headers }));
        if (!r || r.headers.get('x-middleware-next') !== '1') {
          stats.refused++;
          const body = r ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
          const h = {};
          r?.headers.forEach((v, k) => { h[k] = v; });
          res.writeHead(r ? r.status : 500, { ...h, 'content-length': body.length });
          res.end(req.method === 'HEAD' ? undefined : body);
          log?.(`${r?.status} ${req.method} ${url.pathname} (middleware)`);
          return;
        }
        stats.passed++;
      }
      const f = staticFile(url.pathname);
      const h = {};
      for (const rule of rules) if (rule.re.test(url.pathname)) for (const { key, value } of rule.headers) h[key.toLowerCase()] = value;
      if (!f) {
        const body = Buffer.from('404 Not Found\n');
        res.writeHead(404, { ...h, 'content-type': 'text/plain; charset=utf-8', 'content-length': body.length });
        res.end(req.method === 'HEAD' ? undefined : body);
        log?.(`404 ${req.method} ${url.pathname}`);
        return;
      }
      const body = readFileSync(f);
      res.writeHead(200, { ...h, 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'content-length': body.length, 'cache-control': 'public, max-age=0, must-revalidate' });
      res.end(req.method === 'HEAD' ? undefined : body);
      log?.(`200 ${req.method} ${url.pathname}`);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('harness error: ' + e.message);
    }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, ok); });
  const actual = server.address().port;
  return {
    url: `http://localhost:${actual}`, port: actual, stats, middleware, matchers,
    close: () => new Promise((ok) => {
      server.closeAllConnections?.();
      server.close(() => {
        for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        ok();
      });
    }),
  };
}

// A free port in 5200-5999 (worktree range; never 5173).
export async function freePort() {
  const { createServer: cs } = await import('node:net');
  for (let i = 0; i < 50; i++) {
    const p = 5200 + Math.floor(Math.random() * 800);
    const ok = await new Promise((r) => { const s = cs(); s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => s.close(() => r(true))); });
    if (ok) return p;
  }
  throw new Error('no free port in 5200-5999');
}
