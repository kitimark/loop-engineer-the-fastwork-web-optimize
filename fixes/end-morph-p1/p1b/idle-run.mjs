// A (P1 + P1b (a)) gate, protocol v2 §3.5 idle triple (lead ruling 09:35Z; fix-end-morph-p1). Serves the given snapshot
// arms on their own ports and runs fixes/platform-idle/tools/idletriple.mjs on them (headless, CPU 1x, counts only, no
// timing): top (y 0), parked mid-page after a scroll (MIDY, default 2620), the end (ENDY, default the bottom: the end
// morph at m = 1). Callbacks/s, writes/s, mutations/s, rAF/s per spot; ROUNDS 1, WIN 5000 ms by default.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 120 --owner fix-end-morph-p1 -- \
//     node fixes/end-morph-p1/p1b/idle-run.mjs C=out/p1b/snapi/C1 A=out/p1b/snapi/A1
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const BASE = join(mirrorHome(), 'site-pretty');
const OUT = join(WT, 'out/end-morph-p1/p1b'); mkdirSync(OUT, { recursive: true });
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const ARMS = process.argv.slice(2).map((s) => { const i = s.indexOf('='); return [s.slice(0, i), resolve(WT, s.slice(i + 1))]; });
const procs = [], targets = [];
try {
  for (const [k, dir] of ARMS) {
    const st = join(OUT, `serve-idle-${k}-${process.pid}.json`); rmSync(st, { force: true });
    procs.push(spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', dir, '--port', '0', '--quiet', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] }));
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await new Promise((r) => setTimeout(r, 100)); }
    if (!s) throw new Error(`${k}: server did not start`);
    targets.push(`${k}=${s.url}`); rmSync(st, { force: true });
  }
  const out = join(OUT, `idletriple-${tag}.json`);
  const r = spawnSync(process.execPath, [join(WT, 'fixes/platform-idle/tools/idletriple.mjs'), out, ...targets], { stdio: 'inherit', env: { ROUNDS: '1', ENDY: '999999', ...process.env } });
  console.log('arms', JSON.stringify(Object.fromEntries(ARMS)), 'wrote', out, 'exit', r.status);
} finally { for (const p of procs) p.kill(); }
