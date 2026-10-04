// countdown-faces: runs cc-check.mjs for the cost card (counts only, no timing). Serves out/countdown-faces/snap/C and
// /V on fresh ports with --no-cache (I-131), checks the served JS/CSS against snap/hashes.json (VOID, exit 3), then per
// y and rep runs the arms in ABBA order, saving each trace for tools/costcard.mjs.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner countdown-faces -- \
//     node fixes/countdown-faces/cc-run.mjs pastHero 3 [first rep, default 1]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';

const [Y = 'pastHero', N = '3', FIRST = '1'] = process.argv.slice(2);
const SNAP = join(WT, 'out/countdown-faces/snap'), OUT = join(WT, 'out/countdown-faces/cc');
mkdirSync(OUT, { recursive: true });
const hashes = JSON.parse(readFileSync(join(SNAP, 'hashes.json'), 'utf8'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const servers = {};
try {
  for (const arm of ['C', 'V']) {
    const st = join(OUT, `serve-cc-${arm}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', join(SNAP, arm), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--https', '--latency', '150', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(arm + ' server did not start');
    servers[arm] = { p, st };
    const url = s.url || `https://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    if (js !== hashes[arm].js || css !== hashes[arm].css) { console.error(`VOID ${arm}: serves ${js.slice(0, 12)} / ${css.slice(0, 12)}`); process.exitCode = 3; throw new Error('hash'); }
    console.log(arm, 'serves', js.slice(0, 12), css.slice(0, 12));
  }
  for (let r = +FIRST; r < +FIRST + +N; r++) for (const arm of r % 2 ? ['C', 'V'] : ['V', 'C']) {
    const label = `${arm}-${Y}-r${r}`;
    execFileSync(process.execPath, [join(WT, 'fixes/countdown-faces/cc-check.mjs'), '--state', servers[arm].st.slice(WT.length + 1), '--label', label, '--y', Y, '--seconds', '6',
      '--save-trace', `out/countdown-faces/cc/${label}.trace.json`], { stdio: 'inherit', cwd: WT });
  }
} finally { for (const s of Object.values(servers)) s.p.kill(); }
