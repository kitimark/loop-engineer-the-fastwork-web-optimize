#!/usr/bin/env node
// toolbar-resize P-133 count-only dry run (I-184: counts only, no frame log, no Timeline, no timing number), BEFORE any
// Timeline data: two C runs of cycle-hero-v2.json on the served build (no inject), in a shared Simulator slot:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-toolbar-resize -- sh -c \
//     'node tools/fix.mjs serve morph-scroll-v9try > out/toolbar-resize/serve133d.log 2>&1 & S=$!; \
//      node tools/wait.mjs serve out/serve-morph-scroll-v9try.json --pid $S --owner fix-toolbar-resize --timeout 60 && \
//      node tools/sim.mjs session --functional --owner fix-toolbar-resize -- node fixes/toolbar-resize/dry-p133.mjs; \
//      E=$?; kill $S; exit $E'
// Each run passes (dryWhy empty) when: all 18 strokes were sent, no error and no abort, no guard-ended loop or guard
// error, >= 8 toolbar transitions, and every down stroke started at scrollY >= 560 and <= 3000 (the zone check: the
// expands start there). Prints DRY PASS | DRY FAIL and each run's stroke-phase wall time (first stroke sent to last
// stroke returned, plus its reload/idle), which sets hold B's step count (see the card). Output out/toolbar-resize/dry133/.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const WT = new URL('../..', import.meta.url).pathname;
export const STROKES = 18, MIN_TRANSITIONS = 8, Y_LO = 560, Y_HI = 3000;
const num = (t) => (Array.isArray(t) ? t.length : Number(t ?? NaN));
export function dryWhy(doc) {
  const run = doc?.run || {}, why = [];
  const strokes = run.strokes || [];
  if (strokes.length !== STROKES) why.push(`strokes ${strokes.length}/${STROKES}`);
  if (run.aborted) why.push('aborted');
  const errs = (run.errors || []).map((e) => (typeof e === 'string' ? e : e?.message || JSON.stringify(e)));
  if (errs.length) why.push(`errors ${errs.length}${errs.some((e) => /pull-to-refresh guard/.test(e)) ? ' (guard)' : ''}`);
  const gl = (run.loops || []).filter((l) => l.ended === 'pull guard').length;
  if (gl) why.push(`guard-ended loops ${gl}`);
  const tr = num(doc?.summary?.toolbar?.transitions);
  if (!(tr >= MIN_TRANSITIONS)) why.push(`toolbar transitions ${tr} < ${MIN_TRANSITIONS}`);
  const ys = strokes.filter((s) => s.kin?.dir === 'down').map((s) => (Array.isArray(s.guardY) ? Math.min(...s.guardY) : null));
  if (ys.some((y) => y == null || y < Y_LO || y > Y_HI)) why.push(`down-stroke start y outside ${Y_LO}-${Y_HI}: ${JSON.stringify(ys)}`);
  return why;
}
export function strokeWallS(doc) {
  const s = doc?.run?.strokes || [];
  if (!s.length || !s[0].sentAt || !s[s.length - 1].returnedAt) return null;
  return Math.round((s[s.length - 1].returnedAt - s[0].sentAt) / 100) / 10;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const D = join(WT, 'out/toolbar-resize/dry133'); mkdirSync(D, { recursive: true });
  const st = JSON.parse(readFileSync(join(WT, 'out/serve-morph-scroll-v9try.json'), 'utf8'));
  const sh = (args) => { const t = Date.now(); const r = spawnSync('node', args, { cwd: WT, encoding: 'utf8', maxBuffer: 64 << 20 }); console.log('  ' + `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-2).join('\n  ')); return { code: r.status, s: Math.round((Date.now() - t) / 100) / 10 }; };
  sh(['tools/sim.mjs', 'wda', 'start']);
  const res = []; let fail = 0;
  for (const k of [1, 2]) {
    const F = join(D, `dry-C-${k}.json`);
    const o = sh(['tools/sim.mjs', 'open', `http://localhost:${st.httpTwin}/`]);
    const g = sh(['tools/sim.mjs', 'gesture', join(WT, 'fixes/toolbar-resize/cycle-hero-v2.json'), '--count-only', '--label', `p133-dry-${k}`, '--out', F]);
    let doc = null; try { doc = JSON.parse(readFileSync(F, 'utf8')); } catch {}
    const why = doc ? dryWhy(doc) : ['no record'];
    if (why.length) fail++;
    const r = { run: k, open: o, gesture: g, stepS: Math.round((o.s + g.s) * 10) / 10, strokeWallS: strokeWallS(doc), transitions: num(doc?.summary?.toolbar?.transitions), why };
    res.push(r); console.log(`DRY C-${k}: ${why.length ? 'FAIL ' + why.join('; ') : 'ok'} | step ${r.stepS} s (open ${o.s} + gesture ${g.s}), strokes wall ${r.strokeWallS} s, transitions ${r.transitions}`);
  }
  writeFileSync(join(D, 'dry.json'), JSON.stringify(res, null, 1) + '\n');
  console.log(fail ? 'DRY FAIL' : 'DRY PASS');
  process.exit(fail ? 3 : 0);
}
