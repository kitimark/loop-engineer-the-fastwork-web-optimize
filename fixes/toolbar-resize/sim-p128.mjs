#!/usr/bin/env node
// toolbar-resize P-128 driver (COUNT-ONLY; from sim-p125.mjs 62c34d165a31): the in-page stack census of the DOM calls
// in the in-view toolbar-step frames on v8 as served (fixes/v8-best overlay, JS 3e3e94cb6e9f, CSS f836404b3728).
// No Timeline, no timing number: `sim.mjs gesture --count-only --inject p128-inject.mjs` in a functional session in
// one shared slot (weight simulator):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-toolbar-resize -- sh -c \
//     'node tools/fix.mjs serve v8-best > out/toolbar-resize/serve128.log 2>&1 & S=$!; \
//      node tools/wait.mjs serve out/serve-v8-best.json --pid $S --owner fix-toolbar-resize --timeout 60 && \
//      SB_BUDGET_S=250 node tools/sim.mjs session --functional --owner fix-toolbar-resize -- \
//        node fixes/toolbar-resize/sim-p128.mjs C:H1 C:H2 C:H3 C:H4 C:H5; E=$?; kill $S; exit $E'
// Steps: 1. served bytes (JS, CSS: hash and x-mirror-source overlay; exit 26 on a mismatch); 2. wda start; 3. per run:
// sim.mjs open the page, sim.mjs gesture flick-hero-v1.json (6ae05e12ace9) --count-only --inject p128-inject.mjs;
// after the FIRST run a gate (rev 2, ops N2: the reader's run gate without the served record, runGateWhy below):
// an inject value, installs >= 1, the four deciding wrappers, the showcase IO, >= 100 frames, an innerHeight range
// >= 30 px, and >= 1 call whose stack has a "/_app/immutable/" line with :line:col; else STOP exit 27 before any
// further run. Every run logs ownFramesLeft (ops N3): the calls whose stack still holds a p128-inject.js line, i.e.
// whether JSC dropped the wrapper's frames by sourceURL (the caller key does not depend on it); 4. budget stop (< 45 s left: the
// remaining runs are logged as dropped and run in one more slot under the same names).
// Output: out/toolbar-resize/sim128/ g-<run>.json (the gesture record, run.inject[].value), runs.jsonl.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const WT = new URL('../..', import.meta.url).pathname;
const D = join(WT, 'out/toolbar-resize/sim128');
const WANT = { css: 'f836404b3728', js: '3e3e94cb6e9f' };
const INJ = join(WT, 'fixes/toolbar-resize/p128-inject.mjs'), SCRIPT = join(WT, 'fixes/toolbar-resize/flick-hero-v1.json');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

// the first run's format gate (exported for the self-test)
export function formatOk(value) {
  let v = value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return false; } }
  return !!v && Array.isArray(v.calls) && v.calls.some((c) => (c.stack || []).some((l) => l.includes('/_app/immutable/') && /:\d+:\d+$/.test(l)));
}
export const DECIDE_APIS = ['setAttribute', 'toggle', 'setProperty', 'gBCR'];
// the run gate shared with p128-read.mjs (rev 2, ops N2): [] when the inject value passes, else the reasons
export function runGateWhy(v) {
  const why = [];
  if (!v) return ['no inject value'];
  if (!(v.installs >= 1)) why.push('not installed');
  if (!DECIDE_APIS.every((a) => (v.wrapped || []).includes(a))) why.push('wrappers missing');
  if (!v.ioInstalled) why.push('no showcase IO');
  const ihs = (v.fr || []).map((x) => x[0]);
  if (ihs.length < 100) why.push('< 100 frames');
  if (!(ihs.length && Math.max(...ihs) - Math.min(...ihs) >= 30)) why.push('no toolbar step (ih range < 30)');
  if (!formatOk(v)) why.push('no page stack line');
  return why;
}
export const ownFramesLeft = (v) => (v?.calls || []).filter((c) => (c.stack || []).some((l) => l.includes('p128-inject.js'))).reduce((n, c) => n + c.f.length, 0);
export function injectValue(g) {
  const segs = g?.run?.inject || [];
  let best = null;
  for (const s of segs) { let v = s.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } } if (v && (!best || (v.fr?.length || 0) > (best.fr?.length || 0))) best = v; }
  return best;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  mkdirSync(D, { recursive: true });
  const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 250) * 1000;
  const sh = (args) => { const r = spawnSync('node', args, { cwd: WT, encoding: 'utf8', maxBuffer: 64 << 20 }); const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n'); console.log('  ' + out.slice(-2).join('\n  ').slice(0, 600)); return r.status; };
  const log = (o) => appendFileSync(join(D, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
  const st = JSON.parse(readFileSync(join(WT, 'out/serve-v8-best.json'), 'utf8')), port = st.httpTwin;
  const hash = async (p) => { const res = await fetch(`http://localhost:${port}${p}`); return { h: sha(Buffer.from(await res.arrayBuffer())), source: res.headers.get('x-mirror-source') }; };
  const served = { css: await hash('/_app/immutable/assets/2.gBuqKVzi.css'), js: await hash('/_app/immutable/nodes/2.DyWL8TcE.js'), port };
  const injectSha = sha(readFileSync(INJ)), scriptSha = sha(readFileSync(SCRIPT));
  log({ served, injectSha, scriptSha });
  if (served.css.h !== WANT.css || served.js.h !== WANT.js || served.css.source !== 'overlay' || served.js.source !== 'overlay') { console.log(`STOP served bytes: ${JSON.stringify(served)}`); process.exit(26); }
  console.log(`served bytes ok: js ${served.js.h}, css ${served.css.h} (overlay); inject ${injectSha}; script ${scriptSha}`);
  console.log('wda start:'); sh(['tools/sim.mjs', 'wda', 'start']);
  const steps = process.argv.slice(2);
  for (const [i, s] of steps.entries()) {
    if (budget - (Date.now() - t0) < 45000) { console.log(`STOP budget before ${s}`); for (const d of steps.slice(i)) log({ step: d, stop: 'budget' }); break; }
    const m = s.match(/^C:H(\d+)$/); if (!m) { console.log(`bad step ${s}`); continue; }
    const name = `C-H${m[1]}`, F = join(D, `g-${name}.json`);
    if (existsSync(F)) { console.log(`exists ${F}`); continue; }
    const o = sh(['tools/sim.mjs', 'open', `http://localhost:${port}/`]);
    const g = sh(['tools/sim.mjs', 'gesture', SCRIPT, '--count-only', '--label', `p128-${name}`, '--out', F, '--inject', INJ]);
    let v = null; try { v = injectValue(JSON.parse(readFileSync(F, 'utf8'))); } catch {}
    const brief = v ? { installs: v.installs, wrapped: v.wrapped?.length, io: v.ioInstalled, frames: v.fr?.length, sigs: v.calls?.length, calls: (v.calls || []).reduce((n, c) => n + c.f.length, 0) } : null;
    console.log(`SB ${name} open ${o} gesture ${g} t+${Math.round((Date.now() - t0) / 1000)} s ${JSON.stringify(brief)}`);
    const why = runGateWhy(v), own = ownFramesLeft(v);
    console.log(`  gate ${why.length ? why.join('; ') : 'ok'}; ownFramesLeft ${own}`);
    log({ step: s, name, port, open: o, gesture: g, inject: brief, gate: why, ownFramesLeft: own });
    if (i === 0 && why.length) { console.log(`STOP gate after run 1: ${why.join('; ')}`); process.exit(27); }
  }
}
