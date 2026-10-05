#!/usr/bin/env node
// toolbar-resize P-125 driver (from sim-bisect119 c57654440d01): the v8 will-change window, px rootMargin (wpx) vs
// data-fw-wc pinned to 1 (wc1) vs C (v8 as served), Timeline attribution of the in-view toolbar-step frames.
// Two servers: A = v8 (fixes/v8-best overlay; C and wc1), B = v8 + the one-line wpx change (fixes/toolbar-resize overlay,
// p125-wpx.diff; wpx). One normal exclusive Simulator hold (a gesture with --timeline refuses in a functional session,
// a --no-timing hold and the shared lane):
//   node tools/lock.mjs run chrome-measure --max-seconds 600 --owner fix-toolbar-resize -- sh -c \
//     'node tools/fix.mjs serve v8-best > out/toolbar-resize/serveA125.log 2>&1 & SA=$!; \
//      node tools/fix.mjs serve toolbar-resize > out/toolbar-resize/serveB125.log 2>&1 & SB=$!; \
//      node tools/wait.mjs serve out/serve-v8-best.json --pid $SA --owner fix-toolbar-resize --timeout 60 && \
//      node tools/wait.mjs serve out/serve-toolbar-resize.json --pid $SB --owner fix-toolbar-resize --timeout 60 && \
//      SB_BUDGET_S=520 node tools/sim.mjs session --owner fix-toolbar-resize -- node fixes/toolbar-resize/sim-p125.mjs \
//        C:H1 wpx:H1 C:H2 wc1:H1 C:H3 wc1:H2 C:H4 wpx:H2 C:H5; E=$?; kill $SA $SB; exit $E'
// step = <arm>:H<n>, arm C | wpx | wc1. Output: out/toolbar-resize/sim125/ (g-<run>.json, tl-<run>.json, runs.jsonl).
// Score: node fixes/toolbar-resize/score-p125.mjs out/toolbar-resize/sim125 C-H1 wpx-H1 ... --json p125-score.json
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const WT = new URL('../..', import.meta.url).pathname;
const D = join(WT, 'out/toolbar-resize/sim125'); mkdirSync(D, { recursive: true });
const SERVERS = { A: join(WT, 'out/serve-v8-best.json'), B: join(WT, 'out/serve-toolbar-resize.json') };
const WANT = { A: { css: 'f836404b3728', js: '3e3e94cb6e9f' }, B: { css: 'f836404b3728', js: '6a79036cc108' } };
const ARMS = { C: 'A', wc1: 'A', wpx: 'B' };
const INJ = join(WT, 'fixes/toolbar-resize/p125-inject.mjs');
const injSha = createHash('sha256').update(readFileSync(INJ)).digest('hex').slice(0, 12);
const SCRIPT = join(WT, 'fixes/toolbar-resize/flick-hero-v1.json'); // P-115/P-119's script (6ae05e12ace9)
const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 520) * 1000;
const sh = (args) => { const r = spawnSync('node', args, { cwd: WT, encoding: 'utf8', maxBuffer: 64 << 20 }); const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n'); console.log('  ' + out.slice(-2).join('\n  ').slice(0, 600)); return r.status; };
const log = (o) => appendFileSync(join(D, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
// served bytes, both servers, before any run (exit 26 on a mismatch)
const port = {}, served = {};
for (const [k, f] of Object.entries(SERVERS)) {
  const st = JSON.parse(readFileSync(f, 'utf8')); port[k] = st.httpTwin;
  const hash = async (p) => { const res = await fetch(`http://localhost:${st.httpTwin}${p}`); return { h: createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex').slice(0, 12), source: res.headers.get('x-mirror-source') }; };
  served[k] = { css: await hash('/_app/immutable/assets/2.gBuqKVzi.css'), js: await hash('/_app/immutable/nodes/2.DyWL8TcE.js'), port: st.httpTwin };
}
log({ served, injectSha: injSha });
for (const k of Object.keys(SERVERS)) {
  const s = served[k];
  if (s.css.h !== WANT[k].css || s.js.h !== WANT[k].js || s.css.source !== 'overlay' || s.js.source !== 'overlay') { console.log(`STOP served bytes ${k}: ${JSON.stringify(s)}`); process.exit(26); }
}
console.log(`served bytes ok: A js ${served.A.js.h}, B js ${served.B.js.h}, css ${served.A.css.h}; inject ${injSha}`);
console.log('wda start:'); sh(['tools/sim.mjs', 'wda', 'start']);
for (const s of process.argv.slice(2)) {
  if (budget - (Date.now() - t0) < 45000) { console.log(`STOP budget before ${s}`); log({ step: s, stop: 'budget' }); break; }
  const m = s.match(/^(\w+):H(\d+)$/); if (!m || !(m[1] in ARMS)) { console.log(`bad step ${s}`); continue; }
  const name = `${m[1]}-H${m[2]}`, F = join(D, `g-${name}.json`), TL = join(D, `tl-${name}.json`), srv = ARMS[m[1]];
  if (existsSync(F)) { console.log(`exists ${F}`); continue; }
  process.env.P125_ARM = m[1] === 'C' ? 'none' : m[1];
  const o = sh(['tools/sim.mjs', 'open', `http://localhost:${port[srv]}/`]);
  const g = sh(['tools/sim.mjs', 'gesture', SCRIPT, '--label', `p125-${name}`, '--out', F, '--timeline', TL, '--inject', INJ]);
  let inj = null; try { const gj = JSON.parse(readFileSync(F, 'utf8')); inj = (gj.run?.inject || gj.inject || [])[0]?.value ?? null; } catch {}
  const brief = inj ? (() => { try { const v = typeof inj === 'string' ? JSON.parse(inj) : inj; return { arm: v.arm, drops: v.drops, pinned: v.pinnedAtInstall, promo0: v.promo0, promo1: v.promo1, fwwc0AtRead: v.fwwc0AtRead, nWr: v.wr?.length, nIo: v.io?.length }; } catch { return null; } })() : null;
  console.log(`SB ${name} server ${srv} open ${o} gesture ${g} t+${Math.round((Date.now() - t0) / 1000)} s ${JSON.stringify(brief)}`);
  log({ step: s, name, server: srv, port: port[srv], jsWant: WANT[srv].js, open: o, gesture: g, inject: brief });
}
