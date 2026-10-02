// PR-001 rev 3 (P-058): per-'you'-draw metrics from `iphone.mjs run --driver window --probe std` run JSONs (fw-iphone-run/1).
// Only the 'you' draws (word slot 0, the one with frames/video) are scored; every other word stays on the SVG in every arm.
//
// Draw starts: the std probe's class crossings on em.script-accent (+is-drawing-in / +is-drawing-out). The probe does not log the
// word, so a 'you' draw is the one of its direction nearest to the cycle's 'you' times since navigation (Sim, 2026-10-02:
// in 22.0 s, out 24.2 s, period 21.44 s; draws of one direction are >= 3 s apart, the tolerance is 1.2 s). In the arms the
// draw is engaged when the word is on the canvas/video right after the start batch: the last +/-is-canvas crossing at or before
// start + 1 ms is '+is-canvas' (the arm adds it at the in-draw and keeps it through the out-draw, so an out-draw has no crossing
// of its own; fixed 10-02 before any counted run was analysed). An engaged draw that is not a 'you' draw makes the run VOID-ID.
// A '-is-canvas' before the draw's end (900 ms) is a handback (the reason is in the arm's own stats, readstats.mjs).
//
// Per 'you' draw, window W = (s, s + 2000 ms] on the probe's frame stamps (a frame row's t ends its gap; post-draw stalls count).
// A frame is in W when its gap (t - dt, t] overlaps W, so a stall that starts inside W and ends after it counts too
// (fixed 10-02 after block A: F1's 1.8 s stalls after its in-draws closed at ~2.02 s and were missed; applies to every arm):
//   live    frames in (s, s + 900]              gap     longest dt in W
//   gt50 gt34 and the +-4 ms twins gt46/gt54, gt30/gt38, near34 (30, 38], near50 (46, 54]   (CLAUDE.md "Frame thresholds")
//   eng     engaged on the canvas/video at the start (arms only)   back   handed back before 900 ms
// Per run: sums over its 'you' draws, and the idle phase's own summary (all words) for context.
// usage: node youdraws.mjs [--in 22050] [--out 24230] [--period 21440] [--tol 1200] <run.json>... > table
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2), opt = {}, files = [];
for (let i = 0; i < args.length; i++) args[i].startsWith('--') ? (opt[args[i].slice(2)] = Number(args[++i])) : files.push(args[i]);
const T = { in: opt.in ?? 22050, out: opt.out ?? 24230 }, PER = opt.period ?? 21440, TOL = opt.tol ?? 1200;
const KEYS = ['gt50', 'gt34', 'gt46', 'gt54', 'gt30', 'gt38', 'near34', 'near50'];
const rows = [];
for (const f of files) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const fr = r.frames.map((x) => (Array.isArray(x) ? { t: x[0], dt: x[1] } : x));
  const idle = r.marks && r.marks.idle;
  const cr = (r.crossings || []).filter((c) => c.kind === 'class' && c.id === 'em.script-accent');
  const starts = cr.filter((c) => c.value === '+is-drawing-in' || c.value === '+is-drawing-out');
  const run = { file: f.split('/').pop(), label: r.meta.label, arm: r.meta.arm, build: r.meta.build, draws: [], voidId: [], idle: r.summary && r.summary.phases && r.summary.phases.idle };
  for (const s of starts) {
    const d = s.value.endsWith('in') ? 'in' : 'out', n = Math.round((s.t - T[d]) / PER), off = s.t - (T[d] + n * PER);
    const you = n >= 0 && Math.abs(off) <= TOL;
    const last = cr.filter((c) => (c.value === '+is-canvas' || c.value === '-is-canvas') && c.t <= s.t + 1).at(-1);
    const eng = !!last && last.value === '+is-canvas';
    if (eng && !you) run.voidId.push(Math.round(s.t));
    if (!you) continue;
    if (idle && (s.t < idle[0] || s.t + 2000 > idle[1])) continue; // only draws whose whole window lies in the idle phase
    const back = cr.some((c) => c.value === '-is-canvas' && c.t > s.t && c.t < s.t + 880);
    const w = fr.filter((x) => x.dt != null && x.t > s.t && x.t - x.dt < s.t + 2000), live = fr.filter((x) => x.t > s.t && x.t <= s.t + 900).length;
    const m = { d, n, at: Math.round(s.t), off: Math.round(off), eng, back, live, gap: Math.max(0, ...w.map((x) => x.dt)) };
    m.gt50 = w.filter((x) => x.dt > 50).length; m.gt34 = w.filter((x) => x.dt > 34).length;
    m.gt46 = w.filter((x) => x.dt > 46).length; m.gt54 = w.filter((x) => x.dt > 54).length;
    m.gt30 = w.filter((x) => x.dt > 30).length; m.gt38 = w.filter((x) => x.dt > 38).length;
    m.near34 = w.filter((x) => x.dt > 30 && x.dt <= 38).length; m.near50 = w.filter((x) => x.dt > 46 && x.dt <= 54).length;
    run.draws.push(m);
  }
  run.sum = Object.fromEntries(KEYS.map((k) => [k, run.draws.reduce((a, m) => a + m[k], 0)]));
  run.sum.youDraws = run.draws.length; run.sum.engaged = run.draws.filter((m) => m.eng && !m.back).length;
  run.sum.liveMin = Math.min(...run.draws.map((m) => m.live)); run.sum.gapMax = Math.max(0, ...run.draws.map((m) => m.gap));
  rows.push(run);
}
console.log(JSON.stringify(rows, null, 1));
console.error('label arm | you-draws engaged | live min | gap max | >50 (46/54) | >34 (30/38) | void-id');
for (const r of rows) console.error(`${r.label} ${r.arm} | ${r.sum.youDraws} ${r.sum.engaged} | ${r.sum.liveMin} | ${r.sum.gapMax} | ${r.sum.gt50} (${r.sum.gt46}/${r.sum.gt54}) | ${r.sum.gt34} (${r.sum.gt30}/${r.sum.gt38}) | ${r.voidId.join(',') || '-'}`);
