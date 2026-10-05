#!/usr/bin/env node
// end-bg P-144 driver: Simulator Timeline paint attribution on the end screen (mechanism ratios within one hold, never a
// gain, never a phone result). Build C as served: v9-final + morph-scroll rev 7d from the fixes/end-bg overlay
// (JS 1b2eecc66011, CSS e1359ab9994a); arms in eb-inject.mjs ($EB_ARM); stimulus end-cycle-v1.json.
// One normal exclusive hold per plan hold (gesture --timeline is refused in shared and --no-timing slots), <= 10 min:
//   node tools/lock.mjs run chrome-measure --max-seconds 600 --wait 14400 --owner fix-end-bg -- sh -c \
//     'node tools/fix.mjs serve end-bg > out/end-bg/serve-p144.log 2>&1 & S=$!; \
//      node tools/wait.mjs serve out/serve-end-bg.json --pid $S --owner fix-end-bg --timeout 60 && \
//      SB_BUDGET_S=500 node tools/sim.mjs session --owner fix-end-bg -- \
//        node fixes/end-bg/sim/sim-p144.mjs <hold> <its steps>; E=$?; kill $S; exit $E'
// <hold> is E1-E3 (PLAN) or F1-F6 (PLAN4, only when the dry run chose it); the steps must be exactly the carded ones
// (else exit 2 before any work). Per hold: 1. served bytes through the http twin (hash + x-mirror-source overlay; exit
// 26 on a mismatch); 2. wda start; 3. per step: host-load check (load1 > HOST_MAX: exit 28, VOID-HOST), sim.mjs open,
// sim.mjs gesture end-cycle-v1.json --timeline --inject eb-inject.mjs; 4. after the FIRST step, the first-run gate
// (inject value, C applied, docH0 > 0, n >= 8 band-moving frames), else exit 27; 5. the budget stop (a step is not
// started with less than the longest step + 15 s left; dropped steps are logged, not scored).
// Every step logs load1 at its start and end (runs.jsonl). Output: out/end-bg/simp144/<hold>/ g-<run>.json,
// tl-<run>.json, runs.jsonl. Then check-p144.mjs (n and applied-arm check) and score-p144.mjs.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadavg } from 'node:os';
import { ARMS, PLAN, PLAN4, hostWhy, bandFrames, N_MIN } from './p144-lib.mjs';
import { appliedWhy } from './eb-inject.mjs';
const WT = new URL('../../..', import.meta.url).pathname;
const STATE = join(WT, 'out/serve-end-bg.json');
export const WANT = { css: 'e1359ab9994a', js: '1b2eecc66011' };
const INJ = join(WT, 'fixes/end-bg/sim/eb-inject.mjs');
const SCRIPT = join(WT, 'fixes/end-bg/sim/end-cycle-v1.json');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
export const PLANS = { ...PLAN, ...PLAN4 };
export function stepsOk(hold, steps) { return !!PLANS[hold] && steps.join(' ') === PLANS[hold].join(' '); }
export function firstRunWhy(v, n) {
  const why = appliedWhy('C', v);
  if (v && typeof v === 'object' && !(v.docH0 > 0)) why.push(`docH0 ${v.docH0}`);
  if (!(n >= N_MIN)) why.push(`n ${n} < ${N_MIN} band-moving frames`);
  return why;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [hold, ...steps] = process.argv.slice(2);
  if (!stepsOk(hold, steps)) { console.log(`STOP hold ${hold} must run exactly ${PLANS[hold] ? PLANS[hold].join(' ') : '(unknown hold)'} (got ${steps.join(' ')})`); process.exit(2); }
  const D = join(WT, 'out/end-bg/simp144', hold); mkdirSync(D, { recursive: true });
  const injSha = sha(readFileSync(INJ)), scriptSha = sha(readFileSync(SCRIPT));
  const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 285) * 1000;
  const sh = (args, env) => { const r = spawnSync('node', args, { cwd: WT, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, ...env } }); const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n'); console.log('  ' + out.slice(-2).join('\n  ')); return r.status; };
  const log = (o) => appendFileSync(join(D, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), hold, ...o }) + '\n');
  const st = JSON.parse(readFileSync(STATE, 'utf8'));
  const hash = async (p) => { const res = await fetch(`http://localhost:${st.httpTwin}${p}`); return { h: sha(Buffer.from(await res.arrayBuffer())), source: res.headers.get('x-mirror-source') }; };
  const served = { css: await hash('/_app/immutable/assets/2.gBuqKVzi.css'), js: await hash('/_app/immutable/nodes/2.DyWL8TcE.js'), port: st.httpTwin };
  log({ served, injectSha: injSha, scriptSha });
  if (served.css.h !== WANT.css || served.js.h !== WANT.js || served.css.source !== 'overlay' || served.js.source !== 'overlay') { console.log(`STOP served bytes: ${JSON.stringify(served)}`); process.exit(26); }
  console.log(`hold ${hold}: served bytes ok: css ${served.css.h} js ${served.js.h}; inject ${injSha}; script ${scriptSha}`);
  console.log('wda start:'); sh(['tools/sim.mjs', 'wda', 'start']);
  let longest = 70000;
  for (const [i, s] of steps.entries()) {
    const left = budget - (Date.now() - t0);
    if (left < longest + 15000) { console.log(`STOP budget before ${s} (left ${Math.round(left / 1000)} s, longest step ${Math.round(longest / 1000)} s)`); log({ dropped: steps.slice(i) }); break; }
    const m = s.match(/^(\w+):H(\d+)$/); if (!m || !ARMS.includes(m[1])) { console.log(`bad step ${s}`); process.exit(2); }
    const name = `${m[1]}-H${m[2]}`, F = join(D, `g-${name}.json`), TL = join(D, `tl-${name}.json`);
    if (existsSync(F)) { console.log(`STOP exists ${F} (a re-run starts from an empty folder)`); process.exit(2); }
    const l0 = Math.round(loadavg()[0] * 10) / 10, hw = hostWhy(l0);
    if (hw.length) { console.log(`STOP host load before ${s}: ${hw.join('; ')} (VOID-HOST)`); log({ stop: 'host', step: s, load1: l0 }); process.exit(28); }
    const ts = Date.now();
    const o = sh(['tools/sim.mjs', 'open', `http://localhost:${st.httpTwin}/`]);
    const g = sh(['tools/sim.mjs', 'gesture', SCRIPT, '--label', `p144-${hold}-${name}`, '--out', F, '--timeline', TL, '--inject', INJ], { EB_ARM: m[1] });
    let inj = null, n = 0;
    try { const gj = JSON.parse(readFileSync(F, 'utf8')); n = bandFrames(gj).frames.length; inj = (gj.run?.inject || gj.inject || [])[0]?.value ?? null; if (typeof inj === 'string') inj = JSON.parse(inj); } catch {}
    longest = Math.max(longest, Date.now() - ts);
    console.log(`P144 ${hold} ${name} open ${o} gesture ${g} n ${n} step ${Math.round((Date.now() - ts) / 1000)} s t+${Math.round((Date.now() - t0) / 1000)} s inject ${JSON.stringify(inj).slice(0, 200)}`);
    log({ step: s, name, open: o, gesture: g, n, stepMs: Date.now() - ts, load1: [l0, Math.round(loadavg()[0] * 10) / 10], inject: inj });
    if (i === 0) { const why = firstRunWhy(inj, n); if (why.length) { console.log(`STOP first-run gate: ${why.join('; ')}`); log({ stop: 'first-run gate', why }); process.exit(27); } }
  }
}
