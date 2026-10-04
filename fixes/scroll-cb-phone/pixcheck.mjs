// scroll-cb-phone pixel check (Chrome headless, functional; no timing). Serves C and V (./build.mjs arms; served hashes
// checked, a mismatch exits 3 = VOID) and runs tools/check.mjs on three targets in this order: C1 (C), V, C2 (C again,
// fresh isolated context) with --viewport both (mobile 430x932 DPR 3 touch, desktop) and screenshots top / middle /
// bottom. check.mjs diffs every target against the first: C2 vs C1 is the A/A, V vs C1 the judged diff.
//   node tools/lock.mjs run chrome-measure --shared --weight check --max-seconds 300 --owner fix-scroll-cb -- \
//     node fixes/scroll-cb-phone/pixcheck.mjs out/scroll-cb-phone/pixcheck
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WT, JS, CSS, build } from './build.mjs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // the mirror's self-signed cert, localhost only
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const OUT = process.argv[2] || join(WT, 'out/scroll-cb-phone/pixcheck');
mkdirSync(OUT, { recursive: true });
const ARMS = build({ quiet: true });
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
async function serve(arm) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', ARMS[arm].dir, '--https', '--no-http-twin', '--no-cache',
    '--vendors=local', '--quiet', '--port', 'auto', '--state', st], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  procs.push(p);
  let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} }
  if (!s) throw new Error('server did not start for ' + arm);
  const url = `https://localhost:${s.port}/`;
  const got = [sha(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())), sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()))];
  if (got[0] !== ARMS[arm].js || got[1] !== ARMS[arm].css) { console.error(`VOID ${arm} served ${got.join(' / ')}, pinned ${ARMS[arm].js} / ${ARMS[arm].css}`); cleanup(); process.exit(3); }
  console.log(`${arm} served ${got.join(' / ')} at port ${s.port}`);
  return url;
}
const cleanup = () => { for (const p of procs) try { p.kill(); } catch {} };
let code = 1;
try {
  const c = await serve('C'), v = await serve('V');
  const r = spawnSync(process.execPath, [join(WT, 'tools/check.mjs'), `C1=${c}`, `V=${v}`, `C2=${c}`, '--viewport', 'both', '--owner', 'fix-scroll-cb',
    '--max-seconds', '290', '--out', OUT, '--result', join(OUT, 'check.json')], { cwd: WT, stdio: 'inherit' });
  code = r.status ?? 1;
} finally { cleanup(); }
process.exit(code);
