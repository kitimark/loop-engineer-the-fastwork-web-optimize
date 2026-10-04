#!/usr/bin/env node
// toolbar-resize P-119 (copy of the P-115 driver, sim-bisect115 4e1077d555cd): containment (cct) vs skip (cva) + the entering check, in-page arms (p119-inject.mjs),
// all on the v8 server (C = v8, lead 2026-10-04 19:2xZ; was v7 before data). One normal (exclusive) Simulator hold, as P-109 (the shared lane refuses gestures):
//   node tools/lock.mjs run chrome-measure --max-seconds 600 --owner fix-toolbar-resize -- sh -c \
//     'SB_BUDGET_S=520 node tools/sim.mjs session --owner fix-toolbar-resize -- node fixes/toolbar-resize/sim-bisect119.mjs <step> ...'
// step = <arm>:H<n>, arm C (control) | cct | cva. Output: out/toolbar-resize/sim119/. Gate: check-inject119.mjs.
// Score: node fixes/toolbar-resize/score-p119.mjs out/toolbar-resize/sim119 C-H1 cct-H1 ... (primary = score-bisect.mjs cb6f0c97b81b, unchanged).
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const WT = new URL('../..', import.meta.url).pathname;
const D = join(WT, 'out/toolbar-resize/sim119'); mkdirSync(D, { recursive: true });
const STATE = join(WT, 'out/serve-v8-best.json');
const ARMS = ['C', 'cct', 'cva'];
const INJ = join(WT, 'fixes/toolbar-resize/p119-inject.mjs');
const injSha = createHash('sha256').update(readFileSync(INJ)).digest('hex').slice(0, 12);
const SCRIPT = join(WT, 'fixes/toolbar-resize/flick-hero-v1.json'); // P-115's script (6ae05e12ace9), committed copy
const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 285) * 1000;
const sh = (args) => { const r = spawnSync('node', args, { cwd: WT, encoding: 'utf8', maxBuffer: 64 << 20 }); const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n'); console.log('  ' + out.slice(-2).join('\n  ')); return r.status; };
const log = (o) => appendFileSync(join(D, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
// served bytes (ops C2): the v8 twin must serve v8's CSS and JS from its overlay
const st = JSON.parse(readFileSync(STATE, 'utf8'));
const hash = async (p) => { const res = await fetch(`http://localhost:${st.httpTwin}${p}`); return { h: createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex').slice(0, 12), source: res.headers.get('x-mirror-source') }; };
const served = { css: await hash('/_app/immutable/assets/2.gBuqKVzi.css'), js: await hash('/_app/immutable/nodes/2.DyWL8TcE.js'), port: st.httpTwin };
log({ served, injectSha: injSha });
if (served.css.h !== 'f836404b3728' || served.js.h !== '3e3e94cb6e9f' || served.css.source !== 'overlay') { console.log(`STOP served bytes: ${JSON.stringify(served)}`); process.exit(26); }
console.log(`served bytes ok: css ${served.css.h} js ${served.js.h}; inject ${injSha}`);
console.log('wda start:'); sh(['tools/sim.mjs', 'wda', 'start']);
for (const s of process.argv.slice(2)) {
  if (budget - (Date.now() - t0) < 45000) { console.log(`STOP budget before ${s}`); break; }
  const m = s.match(/^(\w+):H(\d+)$/); if (!m || !ARMS.includes(m[1])) { console.log(`bad step ${s}`); continue; }
  const name = `${m[1]}-H${m[2]}`, F = join(D, `g-${name}.json`), TL = join(D, `tl-${name}.json`);
  if (existsSync(F)) { console.log(`exists ${F}`); continue; }
  process.env.P110_ARM = m[1] === 'C' ? 'none' : m[1];
  const o = sh(['tools/sim.mjs', 'open', `http://localhost:${st.httpTwin}/`]);
  const g = sh(['tools/sim.mjs', 'gesture', SCRIPT, '--label', `p119-${name}`, '--out', F, '--timeline', TL, '--inject', INJ]);
  let inj = null; try { const gj = JSON.parse(readFileSync(F, 'utf8')); inj = (gj.run?.inject || gj.inject || [])[0]?.value ?? null; } catch {}
  console.log(`SB ${name} open ${o} gesture ${g} t+${Math.round((Date.now() - t0) / 1000)} s inject ${JSON.stringify(inj).slice(0, 300)}`);
  log({ step: s, name, open: o, gesture: g, inject: inj });
}
