#!/usr/bin/env node
// toolbar-resize P-133 n check: run on each hold folder BEFORE the applied-arm gate and the scorer. Reads frames, strokes,
// loops and errors only (no Timeline, no Layout): the hold FAILS (HOLD-FAIL, not scored) when any run has fewer than 8
// toolbar-moving hero frames (the scorer's filter: ih strictly between the run's two values, y < 3250), when the
// gesture was aborted or did not send all of its strokes, or when a run is missing. Reported, never failing: runs
// under the design target of 12, guard-ended loops and guard errors (0 expected by construction), toolbar transitions,
// and the highest scrollY a moving frame had.
//   node fixes/toolbar-resize/check-n133.mjs <folder> <run> ... [--strokes 18] [--json out.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
export const N_MIN = 8, N_TARGET = 12, HERO_Y = 3250;
export function checkRun(g, strokesPlanned) {
  const run = g?.run || {};
  const seg = [...(run.segments || [])].sort((a, b) => (b.frames?.length || 0) - (a.frames?.length || 0))[0];
  const frames = seg?.frames || [];
  const ihs = frames.map((x) => x[3]), lo = frames.length ? Math.min(...ihs) : null, hi = frames.length ? Math.max(...ihs) : null;
  let n = 0, transitions = 0, inT = false, maxMovingY = null;
  for (const [, , y, ih] of frames) {
    const mv = ih > lo && ih < hi;
    if (mv && !inT) transitions++;
    inT = mv;
    if (mv) maxMovingY = Math.max(maxMovingY ?? -Infinity, y);
    if (mv && y < HERO_Y) n++;
  }
  const guardLoops = (run.loops || []).filter((l) => l.ended === 'pull guard').length;
  const errs = (run.errors || []).map((e) => (typeof e === 'string' ? e : e?.message || JSON.stringify(e)));
  const guardErrors = errs.filter((e) => /pull-to-refresh guard/.test(e)).length;
  const strokes = (run.strokes || []).length;
  const why = [];
  if (!frames.length) why.push('no frames');
  if (n < N_MIN) why.push(`n ${n} < ${N_MIN}`);
  if (run.aborted) why.push(`aborted ${JSON.stringify(run.aborted).slice(0, 80)}`);
  if (strokesPlanned && strokes !== strokesPlanned) why.push(`strokes ${strokes}/${strokesPlanned}`);
  return { n, belowTarget: n < N_TARGET, transitions, ih: [lo, hi], maxMovingY, guardLoops, guardErrors, errors: errs.length, strokes, fail: why };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const pos = args.filter((x, i) => !x.startsWith('--') && !['--strokes', '--json'].includes(args[i - 1]));
  const [dir, ...names] = pos;
  if (!dir || !names.length) { console.error('usage: check-n133.mjs <folder> <run> ... [--strokes 18] [--json out.json]'); process.exit(1); }
  const planned = Number(opt('--strokes') || 18);
  const out = {}; let fail = 0;
  for (const name of names) {
    const F = join(dir, `g-${name}.json`);
    const r = existsSync(F) ? checkRun(JSON.parse(readFileSync(F, 'utf8')), planned) : { fail: ['missing'] };
    out[name] = r; if (r.fail.length) fail++;
    console.log(`${name.padEnd(9)} ${r.fail.length ? 'FAIL ' + r.fail.join('; ') : 'ok'} | n ${r.n}${r.belowTarget ? ' (below target 12)' : ''} transitions ${r.transitions} maxMovingY ${r.maxMovingY} strokes ${r.strokes} guard loops ${r.guardLoops} guard errors ${r.guardErrors} errors ${r.errors}`);
  }
  const verdict = fail ? 'HOLD-FAIL' : 'N-CHECK PASS';
  console.log(verdict);
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify({ verdict, runs: out }, null, 1) + '\n');
  process.exit(fail ? 3 : 0);
}
