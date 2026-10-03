#!/usr/bin/env node
// score074.mjs: P-074 scorer (hero-exit-threaded phone Timeline attribution block; counts, no timing verdict).
// usage: node score074.mjs <arm>:<gesture.json>[:<tl.json>] ... --fn <arm>:<name>=<line>[,<name>=<line>] ... [--band 1:780] [--json out]
// Inputs per run: the gesture recorder's frames ([t, dt, y, vh] rAF stamps, page ms), its touches and marks, and the
// Timeline file (--timeline; recs with startTime in Timeline seconds; page ms = TL * 1000 - offsetMs).
// Definitions:
//  - frame unit: the recorder stamps each frame from its own rAF callback (an unnamed injected script; the most frequent
//    unnamed rAF FunctionCall). Unit i = the top-level Timeline records from the one holding logger call i up to the one
//    holding call i+1. A frame stamp maps to the logger call within 4 ms after a median clock fit (P-071: residual
//    <= 0.6 ms); a stamp without one is "uncovered".
//  - moving hero-band frame: a recorder frame with band[0] <= y <= band[1] (default 1..780, inside the exit range for
//    either toolbar state) and y != previous y.
//  - writer frame: its unit holds a FireAnimationFrame -> FunctionCall of a named script at the arm's `s` line (+-1), the
//    st6-rb2 per-frame writer (rect read + --exit-opacity write). (a) = writer frames / covered moving band frames, per
//    run. In range: C 0.3..1.0 (C does not run `s` on every moving frame: P-071 tC 0.634 / tV 0.533, scroll-event
//    driven), V 0..0.05. A split (runs of one arm on both sides) = no claim for (a).
//  - record counts per unit: RecalculateStyles, Layout, Paint (+ clip-quad area), Composite, FireAnimationFrame, all depths.
//  - hand-over frames (V): (1) the first unit after each touchstart ('s' in touches) while y <= band[1]; (2) the unit
//    holding a TimerFire -> FunctionCall at the arm's heRest line (located by the record; its delay after the last
//    moving frame is reported, expected 300 ms + up to one frame). Matching C units, same run-pair order (V run i with
//    C run i): (1) C's first unit after the same-index touchstart; (2) C's first unit at or after (C's last moving frame
//    before the same rest mark + V's measured delay). (b) in range: every V hand-over unit has dRecalc <= 1, dLayout <= 0,
//    dPaint <= 0 against its C unit.
//  - y≈50 frame (c): the first moving frame of drag1 with y >= 50; record counts and whether it is a writer frame.
// Void (reported, the caller re-runs once in place): gesture errors / aborted, Timeline errors or more than one epoch,
// > 10 % uncovered moving band frames. Sentinel and Low Power Mode are judged outside (block log).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const fns = {}; args.forEach((a, i) => { if (a === '--fn') { const [arm, list] = args[i + 1].split(':'); fns[arm] = Object.fromEntries(list.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, +v]; })); } });
const band = opt('--band', '1:780').split(':').map(Number);
const runs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))).map((s) => { const [arm, g, t] = s.split(':'); return { arm, g, t }; });
const self = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12);
const walk = (r, f) => { f[r.type] = (f[r.type] || 0) + 1;
  if (r.type === 'Paint' && r.data && r.data.clip) { const q = r.data.clip; f.paintPx = (f.paintPx || 0) + Math.abs((q[2] - q[0]) * (q[5] - q[1])); }
  for (const c of r.children || []) walk(c, f); };
const calls = (r, out, inRaf = false, inTimer = false) => { if (r.type === 'FunctionCall' && r.data) out.push({ st: r.startTime, name: r.data.scriptName || "", line: r.data.scriptLine, col: r.data.scriptColumn, raf: inRaf, timer: inTimer });
  for (const c of r.children || []) calls(c, out, inRaf || r.type === 'FireAnimationFrame', inTimer || r.type === 'TimerFire'); };
const near = (line, want) => want !== undefined && Math.abs(line - want) <= 1;
const pick = (f) => ({ S: f.RecalculateStyles || 0, L: f.Layout || 0, P: f.Paint || 0, Ppx: Math.round(f.paintPx || 0), C: f.Composite || 0, raf: f.FireAnimationFrame || 0 });
// Frame units: the recorder's own rAF callback (an injected script, empty scriptName) runs once per rendering update.
// Unit i = every top-level record that starts in [start of the top-level record holding logger call i, the same for i+1).
// The recorder's frame stamps map to logger calls by order after a median clock-offset fit (each within 4 ms).
function score(run) {
  const g = JSON.parse(readFileSync(run.g, 'utf8')); const seg = g.run.segments[0];
  const tlFile = run.t || (g.run.timeline && g.run.timeline[0] && g.run.timeline[0].file);
  const tl = JSON.parse(readFileSync(tlFile.startsWith('/') ? tlFile : new URL(tlFile, `file://${process.cwd()}/`), 'utf8'));
  const void_ = [];
  if (g.run.aborted) void_.push(`gesture aborted: ${g.run.aborted}`);
  if ((g.run.errors || []).length) void_.push(`gesture errors: ${g.run.errors.slice(0, 2).join('; ')}`);
  if ((tl.errors || []).length) void_.push(`timeline errors: ${tl.errors.slice(0, 2).join('; ')}`);
  if (tl.epochs && tl.epochs.length > 1) void_.push(`timeline epochs ${tl.epochs.length}`);
  const off = tl.offsetMs, pm = (s) => s * 1000 - off;
  const tops = tl.recs.map((r) => { const cs = []; calls(r, cs, r.type === 'FireAnimationFrame', r.type === 'TimerFire'); return { r, s: pm(r.startTime), cs }; }).sort((a, b) => a.s - b.s);
  // logger identity: the most frequent rAF FunctionCall of an unnamed script
  const lc = {}; for (const t of tops) for (const c of t.cs) if (c.raf && !c.name) lc[`${c.line}:${c.col}`] = (lc[`${c.line}:${c.col}`] || 0) + 1;
  const loggerKey = Object.entries(lc).sort((a, b) => b[1] - a[1])[0]?.[0];
  const L = [], LT = []; tops.forEach((t, k) => { for (const c of t.cs) if (c.raf && !c.name && `${c.line}:${c.col}` === loggerKey) { L.push(k); LT.push(pm(c.st)); } });
  const unitStart = L.map((k) => tops[k].s);
  const units = unitStart.map((s, i) => { const e = i + 1 < unitStart.length ? unitStart[i + 1] : Infinity; const f = {}; const cs = [];
    for (let k = L[i]; k < tops.length && tops[k].s < e; k++) { if (k > L[i] && tops[k].s < s) continue; walk(tops[k].r, f); cs.push(...tops[k].cs); }
    return { s, f, cs }; });
  // dedupe units that share a top-level record (two logger calls in one record): keep the first, empty the rest
  for (let i = 1; i < units.length; i++) if (L[i] === L[i - 1]) { units[i].f = {}; units[i].cs = []; units[i].shared = true; }
  const fr = seg.frames;
  // clock fit: median of (unit start - frame stamp) over the nearest pairs of the first 200 frames
  const diffs = []; for (const [t] of fr.slice(0, 200)) { let bd = 1e9, b = 0; for (const s of LT) { const d = s - t; if (Math.abs(d) < Math.abs(bd)) bd = d; if (s > t + 100) break; } if (Math.abs(bd) < 100) diffs.push(bd); }
  diffs.sort((a, b) => a - b); const fit = diffs.length ? diffs[diffs.length >> 1] : 0;
  let uIdx = 0; const unitOf = (t) => { const tt = t + fit; while (uIdx + 1 < LT.length && Math.abs(LT[uIdx + 1] - tt) <= Math.abs(LT[uIdx] - tt)) uIdx++; return Math.abs(LT[uIdx] - tt) <= 4 ? units[uIdx] : null; };
  const unitAfter = (t) => units.find((u, i) => LT[i] >= t + fit) || null;
  const F = fns[run.arm] || {};
  const isWriter = (u) => !!u && u.cs.some((c) => c.raf && c.name && near(c.line, F.s));
  let moving = 0, writer = 0, uncovered = 0; const sums = { S: 0, L: 0, P: 0, Ppx: 0, C: 0 };
  const marks = Object.fromEntries((seg.marks || []).map(([t, n]) => [n, t]));
  let y50 = null; const movingT = [];
  for (let i = 1; i < fr.length; i++) {
    const [t, , y] = fr[i], yp = fr[i - 1][2];
    const u = unitOf(t);
    if (y < band[0] || y > band[1] || y === yp) continue;
    moving++; movingT.push(t); if (!u) { uncovered++; continue; }
    const p = pick(u.f); for (const k of Object.keys(sums)) sums[k] += p[k];
    if (isWriter(u)) writer++;
    if (!y50 && y >= 50 && (marks.drag1 === undefined || t >= marks.drag1) && (marks.rest1 === undefined || t < marks.rest1)) y50 = { t: Math.round(t), y, writer: isWriter(u), ...p };
  }
  if (moving && uncovered / moving > 0.1) void_.push(`${uncovered} of ${moving} moving band frames have no matching frame unit`);
  const covered = moving - uncovered;
  const touchS = (seg.touches || []).filter((x) => x[1] === 's').map((x) => x[0]);
  const yAt = (t) => { let y = 0; for (const f of fr) { if (f[0] > t) break; y = f[2]; } return y; };
  const touchFrames = touchS.map((t) => { const u = unitAfter(t); return { t: Math.round(t), y: yAt(t), frame: u ? { s: Math.round(u.s - fit), ...pick(u.f) } : null }; });
  const rests = [];
  units.forEach((u) => { for (const c of u.cs) if (c.timer && c.name && near(c.line, F.heRest)) {
    const ts = u.s - fit; const lastMove = movingT.filter((t) => t <= ts).pop();
    rests.push({ t: Math.round(ts), afterLastMoveMs: lastMove ? Math.round(ts - lastMove) : null, y: yAt(ts), frame: { s: Math.round(ts), ...pick(u.f) } }); } });
  const restAnchors = ['rest1', 'rest2', 'rest3', 'rest4'].map((n) => marks[n] === undefined ? null : movingT.filter((t) => t <= marks[n] + 400).pop() ?? null);
  return { arm: run.arm, file: run.g, tl: tlFile, label: g.meta && g.meta.label, void: void_, frames: fr.length, loggerKey, loggerCalls: L.length, clockFitMs: +fit.toFixed(1), moving, uncovered,
    writerShare: covered ? +(writer / covered).toFixed(3) : null, writer, perMovingFrame: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, covered ? +(v / covered).toFixed(2) : null])),
    y50, touchFrames, rests, restAnchors, RF: units, firstAfter: (t) => unitAfter(t) };
}
const S = runs.map(score);
const out = { scorer: 'score074.mjs', sha256: self, band, fns, runs: [] };
const Cs = S.filter((r) => r.arm === 'C'), Vs = S.filter((r) => r.arm === 'V');
for (const r of S) {
  console.log(`${r.arm} ${r.label}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; moving band frames ${r.moving} (uncovered ${r.uncovered}); writer frames ${r.writer} share ${r.writerShare}; per moving frame ${JSON.stringify(r.perMovingFrame)}`);
  console.log(`   y≈50 frame: ${JSON.stringify(r.y50)}`);
}
// (b): V hand-over frames vs C's matching frames, paired in order (V run i with C run i)
const pairs = [];
for (let i = 0; i < Vs.length; i++) {
  const v = Vs[i], c = Cs[i] || Cs[0]; if (!v || !c) continue;
  const rows = [];
  v.touchFrames.forEach((tf, k) => { const ct = c.touchFrames[k]; if (tf.y > band[1] || !tf.frame|| !ct || !ct.frame) return;
    rows.push({ kind: `touchstart ${k + 1}`, y: tf.y, V: tf.frame, C: ct.frame }); });
  v.rests.forEach((rs, k) => { const anchor = c.restAnchors[k]; if (!rs.frame || anchor == null || rs.afterLastMoveMs == null) return;
    const cx = c.firstAfter(anchor + rs.afterLastMoveMs); if (!cx) return;
    rows.push({ kind: `rest ${k + 1} (+${rs.afterLastMoveMs} ms)`, y: rs.y, V: rs.frame, C: { s: Math.round(cx.s), ...pick(cx.f) } }); });
  for (const r of rows) { r.dS = r.V.S - r.C.S; r.dL = r.V.L - r.C.L; r.dP = r.V.P - r.C.P; r.ok = r.dS <= 1 && r.dL <= 0 && r.dP <= 0;
    console.log(`   (b) ${v.label} vs ${c.label} ${r.kind} y${r.y}: V S${r.V.S} L${r.V.L} P${r.V.P} | C S${r.C.S} L${r.C.L} P${r.C.P} -> ${r.ok ? 'in' : 'OUT'}`); }
  pairs.push({ V: v.label, C: c.label, rows, allIn: rows.length > 0 && rows.every((r) => r.ok) });
}
const inA = (r) => r.arm === 'C' ? r.writerShare >= 0.3 && r.writerShare <= 1 : r.writerShare >= 0 && r.writerShare <= 0.05;
const valid = S.filter((r) => !r.void.length);
const aRuns = valid.map((r) => ({ arm: r.arm, label: r.label, share: r.writerShare, in: inA(r) }));
const armV = (arm) => { const a = aRuns.filter((x) => x.arm === arm); return !a.length ? 'none' : a.every((x) => x.in) ? 'in' : a.every((x) => !x.in) ? 'out' : 'split'; };
const perArmA = { C: armV('C'), V: armV('V') };
const verdictA = perArmA.C === 'in' && perArmA.V === 'in' ? 'in' : Object.values(perArmA).includes('split') ? 'split (no claim)' : 'out';
const verdictB = pairs.length && pairs.every((p) => p.allIn) ? 'in' : 'out';
console.log(`(a) per run: ${aRuns.map((x) => `${x.label} ${x.share} ${x.in ? 'in' : 'OUT'}`).join(', ')} -> per arm ${JSON.stringify(perArmA)} -> ${verdictA}`);
console.log(`(b) ${verdictB}; (c) y50: ${valid.map((r) => `${r.label} writer=${r.y50 && r.y50.writer}`).join(', ')}`);
console.log(`scorer sha256 ${self}`);
for (const r of S) { const { RF, firstAfter, ...rest } = r; out.runs.push(rest); }
out.a = { runs: aRuns, perArm: perArmA, verdict: verdictA }; out.b = { pairs, verdict: verdictB };
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
