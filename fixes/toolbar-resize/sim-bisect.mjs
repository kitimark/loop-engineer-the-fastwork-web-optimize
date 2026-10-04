#!/usr/bin/env node
// toolbar-resize P-109: Simulator subtree bisect, one functional session (shared lane, weight simulator):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-toolbar-resize -- \
//     node tools/sim.mjs session --functional --owner fix-toolbar-resize -- node fixes/toolbar-resize/sim-bisect.mjs <step> ...
// step = <arm>:H<n> (arm C = v7, nvc, skh, skp, ch); ports come from out/serve-*.json (http twins, localhost).
// Each step: sim.mjs open <url>, then sim.mjs gesture flick-hero-v1 with --timeline into out/toolbar-resize/sim/.
// Stops before a step when less than 45 s of the 300 s hold are left. Score: fixes/toolbar-resize/score-bisect.mjs.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const WT = new URL('../..', import.meta.url).pathname;
const D = join(WT, 'out/toolbar-resize/sim'); mkdirSync(D, { recursive: true });
const STATE = { C: 'out/serve-v7-best.json', nvc: 'out/serve-toolbar-resize--b-nvc.json', skh: 'out/serve-toolbar-resize--b-skh.json', skp: 'out/serve-toolbar-resize--b-skp.json', ch: 'out/serve-toolbar-resize--b-ch.json' };
const SCRIPT = join(WT, 'out/toolbar-resize/flick-hero-v1.json');
const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 285) * 1000;
const sh = (args) => { const r = spawnSync('node', args, { cwd: WT, encoding: 'utf8', maxBuffer: 64 << 20 }); const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n'); console.log('  ' + out.slice(-2).join('\n  ')); return r.status; };
const log = (o) => appendFileSync(join(D, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
// ops C2: served bytes. Every arm's http twin must serve the card's CSS (sha256/12) from its overlay; refuse otherwise.
const CSS = { C: '308f0da70c3a', nvc: '9c3d7e989f94', skh: '903bc0a5380b', skp: 'b6cac1379bd7', ch: '496c6ec41688' };
const arms = [...new Set(process.argv.slice(2).map((s) => s.split(':')[0]))];
const served = {};
for (const a of arms) {
  const st = JSON.parse(readFileSync(join(WT, STATE[a]), 'utf8'));
  const res = await fetch(`http://localhost:${st.httpTwin}/_app/immutable/assets/2.gBuqKVzi.css`);
  const got = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex').slice(0, 12);
  served[a] = { port: st.httpTwin, css: got, source: res.headers.get('x-mirror-source') };
}
log({ served });
const bad = Object.entries(served).filter(([a, v]) => v.css !== CSS[a] || v.source !== 'overlay');
if (bad.length) { console.log(`STOP served bytes: ${JSON.stringify(bad)}`); process.exit(26); }
console.log(`served bytes ok: ${Object.entries(served).map(([a, v]) => `${a} ${v.css}`).join(', ')}`);
console.log('wda start:'); sh(['tools/sim.mjs', 'wda', 'start']);
for (const s of process.argv.slice(2)) {
  if (budget - (Date.now() - t0) < 45000) { console.log(`STOP budget before ${s}`); break; }
  const m = s.match(/^(\w+):H(\d+)$/); if (!m || !STATE[m[1]]) { console.log(`bad step ${s}`); continue; }
  const name = `${m[1]}-H${m[2]}`, F = join(D, `g-${name}.json`), TL = join(D, `tl-${name}.json`);
  if (existsSync(F)) { console.log(`exists ${F}`); continue; }
  const st = JSON.parse(readFileSync(join(WT, STATE[m[1]]), 'utf8'));
  const url = `http://localhost:${st.httpTwin}/`;
  const o = sh(['tools/sim.mjs', 'open', url]);
  const g = sh(['tools/sim.mjs', 'gesture', SCRIPT, '--label', `p109-${name}`, '--out', F, '--timeline', TL]);
  console.log(`SB ${name} open ${o} gesture ${g} t+${Math.round((Date.now() - t0) / 1000)} s`);
  log({ step: s, name, port: st.httpTwin, open: o, gesture: g });
}
