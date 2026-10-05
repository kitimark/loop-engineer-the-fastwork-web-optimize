#!/usr/bin/env node
// toolbar-resize P-133 driver (from sim-pgp.mjs 73215a3c3912): Simulator Timeline mechanism ratios of the in-page arms
// in pgp-inject.mjs (unchanged, 2cfd9c00b9f1) on main 189ca7ed's build as served: v9-final + morph-scroll rev 7d
// (fixes/morph-scroll-v9try overlay, `node tools/fix.mjs apply morph-scroll-v9try`; JS 1b2eecc66011, CSS e1359ab9994a).
// Stimulus: cycle-hero-v2.json (drag cycles inside the hero zone; replaces flick-hero-v1, P-131's overshoot).
// Two normal exclusive holds (gesture --timeline is refused in shared and --no-timing slots), each <= 10 min:
//   node tools/lock.mjs run chrome-measure --max-seconds 600 --owner fix-toolbar-resize -- sh -c \
//     'node tools/fix.mjs serve morph-scroll-v9try > out/toolbar-resize/serve133.log 2>&1 & S=$!; \
//      node tools/wait.mjs serve out/serve-morph-scroll-v9try.json --pid $S --owner fix-toolbar-resize --timeout 60 && \
//      SB_BUDGET_S=500 node tools/sim.mjs session --owner fix-toolbar-resize -- \
//        node fixes/toolbar-resize/sim-p133.mjs <hold A|B> <step> ...; E=$?; kill $S; exit $E'
// step = <arm>:H<n>, arm C (control) | nvc | nvn | tps | tp | vu0. Steps: 1. served bytes through the http twin (hash +
// x-mirror-source overlay; exit 26 on a mismatch); 2. wda start; 3. per run: sim.mjs open, sim.mjs gesture
// cycle-hero-v2.json --timeline --inject pgp-inject.mjs (arm via $PGP_ARM); 4. after the FIRST run, a format and count
// gate: an inject value with ioInstalled, a census (vc1), docH0 > 0, and n >= 8 toolbar-moving hero frames (the
// scorer's frame filter, frames only, no Layout read), else STOP exit 27 before any further run; 5. budget stop:
// before each step, stop when the time left is under the longest step so far + 15 s (75 s before the first); the rest
// is logged as dropped (a further hold needs the lead's OK).
// Output: out/toolbar-resize/simp133/<hold>/ g-<run>.json, tl-<run>.json, runs.jsonl. Then check-n133.mjs (n check,
// before scoring), check-pgp.mjs (applied-arm gate), the frozen score-bisect.mjs (cb6f0c97b81b) per hold folder.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const WT = new URL('../..', import.meta.url).pathname;
const STATE = join(WT, 'out/serve-morph-scroll-v9try.json');
const WANT = { css: 'e1359ab9994a', js: '1b2eecc66011' };
export const ARMS = ['C', 'nvc', 'nvn', 'tps', 'tp', 'vu0'];
export const HOLDS = ['A', 'B'];
const INJ = join(WT, 'fixes/toolbar-resize/pgp-inject.mjs');
const SCRIPT = join(WT, 'fixes/toolbar-resize/cycle-hero-v2.json');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
/** The scorer's frame filter (score-bisect.mjs cb6f0c97b81b): the longest segment; ih strictly between its min and
 *  max; y < 3250. Frames only: no Timeline is read. */
export function movingHeroN(g) {
  const seg = [...(g?.run?.segments || [])].sort((a, b) => (b.frames?.length || 0) - (a.frames?.length || 0))[0];
  if (!seg?.frames?.length) return 0;
  const ihs = seg.frames.map((x) => x[3]), lo = Math.min(...ihs), hi = Math.max(...ihs);
  return seg.frames.filter(([, , y, ih]) => ih > lo && ih < hi && y < 3250).length;
}
export const firstRunWhy = (v, n) => {
  const why = [];
  if (!v || typeof v !== 'object') why.push('no inject value');
  else {
    if (!v.ioInstalled) why.push('no showcase IO');
    if (!Array.isArray(v.vc1)) why.push('no census');
    if (!(v.docH0 > 0)) why.push(`docH0 ${v.docH0}`);
  }
  if (!(n >= 8)) why.push(`n ${n} < 8 moving hero frames`);
  return why;
};
if (import.meta.url === `file://${process.argv[1]}`) {
  const [hold, ...steps] = process.argv.slice(2);
  if (!HOLDS.includes(hold)) { console.log(`usage: sim-p133.mjs <A|B> <step> ... (got hold ${hold})`); process.exit(2); }
  const D = join(WT, 'out/toolbar-resize/simp133', hold); mkdirSync(D, { recursive: true });
  const injSha = sha(readFileSync(INJ)), scriptSha = sha(readFileSync(SCRIPT));
  const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 285) * 1000;
  const sh = (args) => { const r = spawnSync('node', args, { cwd: WT, encoding: 'utf8', maxBuffer: 64 << 20 }); const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n'); console.log('  ' + out.slice(-2).join('\n  ')); return r.status; };
  const log = (o) => appendFileSync(join(D, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), hold, ...o }) + '\n');
  const st = JSON.parse(readFileSync(STATE, 'utf8'));
  const hash = async (p) => { const res = await fetch(`http://localhost:${st.httpTwin}${p}`); return { h: sha(Buffer.from(await res.arrayBuffer())), source: res.headers.get('x-mirror-source') }; };
  const served = { css: await hash('/_app/immutable/assets/2.gBuqKVzi.css'), js: await hash('/_app/immutable/nodes/2.DyWL8TcE.js'), port: st.httpTwin };
  log({ served, injectSha: injSha, scriptSha });
  if (served.css.h !== WANT.css || served.js.h !== WANT.js || served.css.source !== 'overlay' || served.js.source !== 'overlay') { console.log(`STOP served bytes: ${JSON.stringify(served)}`); process.exit(26); }
  console.log(`hold ${hold}: served bytes ok: css ${served.css.h} js ${served.js.h}; inject ${injSha}; script ${scriptSha}`);
  console.log('wda start:'); sh(['tools/sim.mjs', 'wda', 'start']);
  let longest = 60000;
  for (const [i, s] of steps.entries()) {
    const left = budget - (Date.now() - t0);
    if (left < longest + 15000) { console.log(`STOP budget before ${s} (left ${Math.round(left / 1000)} s, longest step ${Math.round(longest / 1000)} s)`); log({ dropped: steps.slice(i) }); break; }
    const m = s.match(/^(\w+):H(\d+)$/); if (!m || !ARMS.includes(m[1])) { console.log(`bad step ${s}`); continue; }
    const name = `${m[1]}-H${m[2]}`, F = join(D, `g-${name}.json`), TL = join(D, `tl-${name}.json`);
    if (existsSync(F)) { console.log(`exists ${F}`); continue; }
    const ts = Date.now();
    process.env.PGP_ARM = m[1] === 'C' ? 'none' : m[1];
    const o = sh(['tools/sim.mjs', 'open', `http://localhost:${st.httpTwin}/`]);
    const g = sh(['tools/sim.mjs', 'gesture', SCRIPT, '--label', `p133-${hold}-${name}`, '--out', F, '--timeline', TL, '--inject', INJ]);
    let inj = null, n = 0;
    try { const gj = JSON.parse(readFileSync(F, 'utf8')); n = movingHeroN(gj); inj = (gj.run?.inject || gj.inject || [])[0]?.value ?? null; if (typeof inj === 'string') inj = JSON.parse(inj); } catch {}
    longest = Math.max(longest, Date.now() - ts);
    console.log(`SB ${hold} ${name} open ${o} gesture ${g} n ${n} step ${Math.round((Date.now() - ts) / 1000)} s t+${Math.round((Date.now() - t0) / 1000)} s inject ${JSON.stringify(inj).slice(0, 200)}`);
    log({ step: s, name, open: o, gesture: g, n, stepMs: Date.now() - ts, inject: inj });
    if (i === 0) { const why = firstRunWhy(inj, n); if (why.length) { console.log(`STOP first-run gate: ${why.join('; ')}`); log({ stop: 'first-run gate', why }); process.exit(27); } }
  }
}
