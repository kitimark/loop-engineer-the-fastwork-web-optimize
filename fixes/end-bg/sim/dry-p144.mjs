#!/usr/bin/env node
// end-bg P-144 count-only dry run (I-184: counts only, no frame log, no Timeline, no timing number), after the lead's
// signature and BEFORE any Timeline data: one C run and one nob run of end-cycle-v1.json with the eb-inject logger, in a
// shared Simulator slot:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-end-bg -- sh -c \
//     'node tools/fix.mjs serve end-bg > out/end-bg/serve-p144d.log 2>&1 & S=$!; \
//      node tools/wait.mjs serve out/serve-end-bg.json --pid $S --owner fix-end-bg --timeout 60 && \
//      node tools/sim.mjs session --functional --owner fix-end-bg -- node fixes/end-bg/sim/dry-p144.mjs; \
//      E=$?; kill $S; exit $E'
// A run passes (dryWhy empty) when: no abort and no error; the approach loop ended at the end of the page (not at its
// 20-pass cap, not by the pull guard); exactly 12 cycle strokes were sent (6 down of 400 px, 6 up of 440 px); the logger
// saw >= 8 toolbar steps inside the last-screen band; the arm's applied probes are as expected at the end of the run.
// Prints each run's step wall time (open + gesture) and the plan the card's rule picks from their mean (planFor):
// E (5-step holds), F (4-step holds) or FAIL (no data; back to the ops read and the lead). Output out/end-bg/dry144/.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planFor, CYCLE_STROKES, N_MIN } from './p144-lib.mjs';
import { appliedWhy } from './eb-inject.mjs';
const WT = new URL('../../..', import.meta.url).pathname;
export function dryWhy(doc, arm) {
  const run = doc?.run || {}, why = [];
  if (run.aborted) why.push('aborted');
  const errs = run.errors || [];
  if (errs.length) why.push(`errors ${errs.length}: ${String(errs[0]).slice(0, 120)}`);
  const lp = run.loops || [];
  if (lp.length !== 1 || lp[0].ended === 'max' || lp[0].ended === 'pull guard') why.push(`approach loop ${JSON.stringify(lp)}`);
  const st = run.strokes || [];
  const down = st.filter((s) => s.kin?.dir === 'down' && s.kin?.px === 400).length, up = st.filter((s) => s.kin?.dir === 'up' && s.kin?.px === 440).length;
  if (down + up !== CYCLE_STROKES || down !== 6) why.push(`cycle strokes ${down} down + ${up} up`);
  let v = (run.inject || [])[0]?.value ?? null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  if (!(v?.bandSteps >= N_MIN)) why.push(`band toolbar steps ${v?.bandSteps} < ${N_MIN}`);
  why.push(...appliedWhy(arm, v));
  return why;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const D = join(WT, 'out/end-bg/dry144'); mkdirSync(D, { recursive: true });
  const st = JSON.parse(readFileSync(join(WT, 'out/serve-end-bg.json'), 'utf8'));
  const sh = (args, env) => { const t = Date.now(); const r = spawnSync('node', args, { cwd: WT, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, ...env } }); console.log('  ' + `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-2).join('\n  ')); return { code: r.status, s: Math.round((Date.now() - t) / 100) / 10 }; };
  sh(['tools/sim.mjs', 'wda', 'start']);
  const res = []; let fail = 0;
  for (const arm of ['C', 'nob']) {
    const F = join(D, `dry-${arm}.json`);
    const o = sh(['tools/sim.mjs', 'open', `http://localhost:${st.httpTwin}/`]);
    const g = sh(['tools/sim.mjs', 'gesture', join(WT, 'fixes/end-bg/sim/end-cycle-v1.json'), '--count-only', '--label', `p144-dry-${arm}`, '--out', F, '--inject', join(WT, 'fixes/end-bg/sim/eb-inject.mjs')], { EB_ARM: arm });
    let doc = null; try { doc = JSON.parse(readFileSync(F, 'utf8')); } catch {}
    const why = doc ? dryWhy(doc, arm) : ['no record'];
    if (why.length) fail++;
    const r = { arm, open: o, gesture: g, stepS: Math.round((o.s + g.s) * 10) / 10, why };
    res.push(r); console.log(`DRY ${arm}: ${why.length ? 'FAIL ' + why.join('; ') : 'ok'} | step ${r.stepS} s (open ${o.s} + gesture ${g.s})`);
  }
  const mean = res.reduce((a, r) => a + r.stepS, 0) / res.length, plan = planFor(mean);
  writeFileSync(join(D, 'dry.json'), JSON.stringify({ res, meanStepS: Math.round(mean * 10) / 10, plan }, null, 1) + '\n');
  console.log(`DRY mean step ${Math.round(mean * 10) / 10} s -> plan ${plan}`);
  console.log(fail ? 'DRY FAIL' : plan === 'FAIL' ? 'DRY PASS, design budget FAILED' : 'DRY PASS');
  process.exit(fail || plan === 'FAIL' ? 3 : 0);
}
