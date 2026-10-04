// morph-gpu idle triple (protocol v2 §3.5, fixes/README.md item 13): serves M = best-build, R1 = rev 1, A = rev 2 without
// pre-promotion, B = rev 2 (newest rv2a-* / rv2b-*) on their own ports and runs fixes/platform-idle/tools/idletriple.mjs
// (headless, functional, counts only) on all four: top (y 0), parked mid-page after a scroll (2620), the pin (5345).
// Run (shared lane): node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-morph-gpu \
//   -- node fixes/morph-gpu/rev2/idle-run.mjs
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const SNAP = join(WT, 'out/snapshots'), OUT = join(WT, 'out/morph-gpu/rev2'); mkdirSync(OUT, { recursive: true });
const newest = (re) => readdirSync(SNAP).filter((d) => re.test(d)).map((d) => join(SNAP, d)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const ARMS = { M: join(SNAP, 'best-65052c4a3902'), R1: join(SNAP, 'rv-372b99478871'), A: newest(/^rv2a-[0-9a-f]{12}$/), B: newest(/^rv2b-[0-9a-f]{12}$/) };
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const procs = [], targets = [];
try {
  for (const [k, dir] of Object.entries(ARMS)) {
    const st = join(OUT, `serve-idle-${k}-${process.pid}.json`); rmSync(st, { force: true });
    procs.push(spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', dir, '--port', '0', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] }));
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await new Promise((r) => setTimeout(r, 100)); }
    if (!s) throw new Error(`${k}: server did not start`);
    targets.push(`${k}=${s.url}`); rmSync(st, { force: true });
  }
  console.log('arms', JSON.stringify(ARMS));
  const out = join(OUT, `idletriple-${tag}.json`);
  const r = spawnSync(process.execPath, [join(WT, 'fixes/platform-idle/tools/idletriple.mjs'), out, ...targets], { stdio: 'inherit', env: { ...process.env, ROUNDS: '1' } });
  console.log('wrote', out, 'exit', r.status);
} finally { for (const p of procs) p.kill(); }
