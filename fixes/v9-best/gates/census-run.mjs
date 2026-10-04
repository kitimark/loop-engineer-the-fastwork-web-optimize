// v9-best: copy of fixes/v8-best/gates/census-run.mjs (int-v8); only the snapshot (V9_SNAP=out/v9/snap-<js12>, A = v8, V = v9 from
// fixes/v9-best/build.mjs), the output folder (out/v9) and the tool paths changed. The v8-era header below is kept as is.
// v8-best (copy of fixes/v7-best/gates/census-run.mjs, wave-v7; paths and arms changed) Chrome work counts (copy of fixes/gpu-preview/gates/census-run.mjs, wi-gpu-bundle; snapshot dir and owner changed) (no timing): de-frame-audit's census (research/design-engineering/frame-audit/census.mjs,
// main da543cb3, unchanged) on arms from out/v9/snap, each on its own https server (port 0, --vendors=local),
// served hashes checked against HASHES.txt. Output out/v9/census-<arm>-<ts>.json.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner int-v8 -- \
//     node fixes/v9-best/gates/census-run.mjs A,V
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const GS = process.env.V9_SNAP ? join(WT, process.env.V9_SNAP) : (() => { console.error('set V9_SNAP=out/v9/snap-<js12>'); process.exit(2); })(), OUT = join(WT, 'out/v9'); mkdirSync(OUT, { recursive: true });
const HX = Object.fromEntries(readFileSync(join(GS, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = new Date().toISOString().replace(/[:.]/g, '-');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // local self-signed mirror cert, hash check only
for (const arm of (process.argv[2] || 'A,V').split(',')) {
  const d = arm.replace(/\d+$/, '');
  const st = join(OUT, `serve-census-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', join(GS, d), '--https', '--port', '0', '--quiet', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `https://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    if (js !== HX[`${d}/${NODE}`] || css !== HX[`${d}/${CSS}`]) { console.log(`VOID ${arm}: serves ${js} / ${css}`); process.exitCode = 3; continue; }
    console.log(`== ${arm} serves ${js} / ${css}`);
    execFileSync(process.execPath, [join(WT, 'research/design-engineering/frame-audit/census.mjs'), '--url', url, '--arm', arm, '--out', join(OUT, `census-${arm}-${tag}.json`)], { cwd: WT, stdio: 'inherit' });
  } finally { p.kill(); }
}
