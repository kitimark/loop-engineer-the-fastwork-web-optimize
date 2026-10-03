// best-build runner for platform-idle's Chrome idle counter, unmodified (fixes/platform-idle/tools/idlecount.mjs, counts
// only, no timing): the node version of fixes/platform-idle/tools/run-chrome.sh with the arms of ./arms.mjs (C st6-rb2,
// V platform-idle, N best build, ...). One https server per arm (own origin), then one idlecount call per load, in order.
// A load's served hashes are checked by idle-compare.mjs (idlecount records them). Run (shared lane, ~70 s per load):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner wi-best-build -- \
//     node fixes/best-build/gates/idle-chrome.mjs out/best-build/idle/chrome.json V:1 N:1 C:1
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ARMDEF, BASE, makeSnapshots } from './arms.mjs';
import { WT } from '../build.mjs';

makeSnapshots({ quiet: true });
const [outArg, ...order] = process.argv.slice(2);
if (!outArg || !order.length) { console.error('usage: idle-chrome.mjs <records.json> ARM:REP ...'); process.exit(1); }
const out = resolve(outArg);
const D = join(WT, 'out/best-build/idle'); mkdirSync(D, { recursive: true });
const arms = [...new Set(order.map((l) => l.split(':')[0]))];
const procs = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let rc = 0;
try {
  for (const a of arms) {
    const st = join(D, `serve-${a}.json`); rmSync(st, { force: true });
    const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, '--port', '0', '--https', '--vendors=local', '--no-http-twin', '--quiet', '--state', st];
    if (ARMDEF[a].dir) args.push('--overlay', ARMDEF[a].dir);
    procs[a] = spawn(process.execPath, args, { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  }
  for (const a of arms) {
    const st = join(D, `serve-${a}.json`); let ok = false;
    for (let i = 0; i < 300 && !ok; i++) { if (existsSync(st)) try { ok = !!JSON.parse(readFileSync(st, 'utf8')).port; } catch {} if (!ok) await sleep(100); }
    if (!ok) throw new Error(`${a}: server did not start`);
  }
  for (const l of order) {
    const [a, rep] = l.split(':');
    try { execFileSync(process.execPath, [join(WT, 'fixes/platform-idle/tools/idlecount.mjs'), '--state', join(D, `serve-${a}.json`), '--arm', a, '--rep', rep, '--out', out], { cwd: WT, stdio: 'inherit' }); }
    catch { rc = 1; console.log('load failed', l); }
  }
} finally { for (const p of Object.values(procs)) p.kill(); }
console.log('EXIT', rc);
process.exit(rc);
