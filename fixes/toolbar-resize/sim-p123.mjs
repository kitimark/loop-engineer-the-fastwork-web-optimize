#!/usr/bin/env node
// toolbar-resize P-123 driver (from sim-bisect119 c57654440d01): COUNT-ONLY, one arm (the v8 build as served, no rule),
// p123-inject.mjs logging, flick-hero-v1 (6ae05e12ace9, P-115/P-119's script). Shared slot, functional session:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-toolbar-resize -- sh -c \
//     'node tools/fix.mjs serve v8-best > out/toolbar-resize/serve123.log 2>&1 & SP=$!; node tools/wait.mjs serve out/serve-v8-best.json --pid $SP --owner fix-toolbar-resize --timeout 60; \
//      SB_BUDGET_S=240 node tools/sim.mjs session --functional --owner fix-toolbar-resize -- node fixes/toolbar-resize/sim-p123.mjs R1 R2; E=$?; kill $SP; exit $E'
// Output: out/toolbar-resize/sim123/g-<run>.json (+ runs.jsonl). Read: node fixes/toolbar-resize/read-p123.mjs out/toolbar-resize/sim123 R1 R2
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const WT = new URL('../..', import.meta.url).pathname;
const D = join(WT, 'out/toolbar-resize/sim123'); mkdirSync(D, { recursive: true });
const STATE = join(WT, 'out/serve-v8-best.json');
const INJ = join(WT, 'fixes/toolbar-resize/p123-inject.mjs');
const injSha = createHash('sha256').update(readFileSync(INJ)).digest('hex').slice(0, 12);
const SCRIPT = join(WT, 'fixes/toolbar-resize/flick-hero-v1.json');
const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 240) * 1000;
const sh = (args) => { const r = spawnSync('node', args, { cwd: WT, encoding: 'utf8', maxBuffer: 64 << 20 }); const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n'); console.log('  ' + out.slice(-2).join('\n  ').slice(0, 600)); return r.status; };
const log = (o) => appendFileSync(join(D, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
const st = JSON.parse(readFileSync(STATE, 'utf8'));
const hash = async (p) => { const res = await fetch(`http://localhost:${st.httpTwin}${p}`); return { h: createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex').slice(0, 12), source: res.headers.get('x-mirror-source') }; };
const served = { css: await hash('/_app/immutable/assets/2.gBuqKVzi.css'), js: await hash('/_app/immutable/nodes/2.DyWL8TcE.js') };
log({ served, injectSha: injSha });
if (served.css.h !== 'f836404b3728' || served.js.h !== '3e3e94cb6e9f' || served.css.source !== 'overlay') { console.log(`STOP served bytes: ${JSON.stringify(served)}`); process.exit(26); }
console.log(`served bytes ok: css ${served.css.h} js ${served.js.h}; inject ${injSha}`);
console.log('wda start:'); sh(['tools/sim.mjs', 'wda', 'start']);
for (const name of process.argv.slice(2)) {
  if (budget - (Date.now() - t0) < 60000) { console.log(`STOP budget before ${name}`); break; }
  const F = join(D, `g-${name}.json`);
  if (existsSync(F)) { console.log(`exists ${F}`); continue; }
  const o = sh(['tools/sim.mjs', 'open', `http://localhost:${st.httpTwin}/`]);
  const g = sh(['tools/sim.mjs', 'gesture', SCRIPT, '--count-only', '--label', `p123-${name}`, '--out', F, '--inject', INJ]);
  let inj = null; try { const gj = JSON.parse(readFileSync(F, 'utf8')); inj = (gj.run?.inject || gj.inject || [])[0]?.value ?? null; } catch {}
  console.log(`P123 ${name} open ${o} gesture ${g} t+${Math.round((Date.now() - t0) / 1000)} s inject ${JSON.stringify(inj).slice(0, 200)}`);
  log({ name, open: o, gesture: g, inject: inj });
}
