#!/usr/bin/env node
// scoreF.mjs: scorer for the hero-exit-threaded F-build phone Timeline block (the ticket after P-074; counts, no timing
// verdict). It is score074.mjs (P-074, sha256 1d1fc26908f1) with three changes, everything else unchanged:
//  1. heRest TimerFire records are found at any depth (the phone Timeline nests them in RenderingFrame records, so
//     score074 found none: "no data for rest" in P-074). The rest hand-over frame stays "the TimerFire's own work + the
//     next unit", and the timer's work is added only when the TimerFire is not already inside that next unit (no
//     double count). The timer part and the next-unit part are also printed separately.
//  2. (b) gets a third kind, 'first-move': the first moving band frame after each touchstart (V's .he-tf arming moved
//     there from the touchstart frame in the F build), V vs C same index, same bounds as the other kinds. Its window is
//     two units, the first moving frame's unit plus the next one: the first frame off the top repaints the whole hero
//     once in both arms (P-074: 58 paints, 364k px, in C1 and V1 alike) and that burst falls on either side of a unit
//     boundary (V1 in the first unit, C1 in the next), so one unit alone compares the boundary, not the arms.
//  3. timer grid, descriptive per run (no verdict): the TimerFire timer id with >= 5 fires whose median gap is nearest
//     1000 ms (the countdown's setInterval(1000)) and its median gap; 'grid30' when that median is >= 1012 ms (P-074:
//     1020 ms under real thermal Serious, P-071: 1005 ms). Whether a flagged run counts is the ticket's rule.
// usage: node scoreF.mjs <arm>:<gesture.json>[:<tl.json>] ... --fn <arm>:<name>=<line>[,<name>=<line>] ... [--band 1:780]
//        [--script 2.DyWL8TcE.js] [--json out]
// Pass every counted run in block order (void runs and their re-runs included): void runs are reported and then dropped;
// the remaining valid runs of an arm are paired in order (V valid run i with C valid run i).
// Inputs per run: the gesture recorder's frames ([t, dt, y, vh] rAF stamps, page ms), its touches and marks, and the
// Timeline file (--timeline; recs with startTime in Timeline seconds; page ms = TL * 1000 - offsetMs).
// Definitions:
//  - frame unit: the recorder stamps each frame from its own rAF callback (an unnamed injected script; the most frequent
//    unnamed rAF FunctionCall). Unit i = the top-level Timeline records from the one holding logger call i up to the one
//    holding call i+1. A frame stamp maps to the logger call within 4 ms after a median clock fit (P-071: residual
//    <= 0.6 ms); a stamp without one is "uncovered".
//  - moving hero-band frame: a recorder frame with band[0] <= y <= band[1] (default 1..780, inside the exit range for
//    either toolbar state) and y != previous y.
//  - writer frame: its unit holds a FireAnimationFrame -> FunctionCall of the page script (scriptName ends with --script,
//    default nodes/2.DyWL8TcE.js) at the arm's `s` line (+-1), the
//    st6-rb2 per-frame writer (rect read + --exit-opacity write). (a) = writer frames / covered moving band frames, per
//    run. In range: C 0.3..1.0 (C does not run `s` on every moving frame: P-071 tC 0.634 / tV 0.533, scroll-event
//    driven), V 0..0.05. Reported per arm, never combined: C is the positive control, V the claim. Per arm: 'in' (all
//    valid runs in), 'out' (all out), 'split' (runs on both sides: no claim for that arm), 'not enough' (< 2 valid runs).
//  - record counts per unit: RecalculateStyles, Layout, Paint (+ clip-quad area), Composite, FireAnimationFrame, all depths.
//  - hand-over frames (V): (1) the first unit after each touchstart ('s' in touches) while y <= band[1]; (2) the top-level
//    TimerFire whose FunctionCall is the page script's heRest line (located by the record; its delay after the last
//    moving frame is reported, expected 300 ms + up to one frame): its frame = the TimerFire record's own work + the next
//    unit (the class drop's style/layout/paint lands there). A fire at y > band[1] (rest2, past the hero end) is a
//    no-op drop, printed and not scored. Each heRest fire is paired with the
//    rest mark (rest1..rest4) nearest to it in time, within 800 ms; a fire without one is printed as unpaired and not
//    scored; a mark with two fires keeps the nearest. Matching C units, V valid run i with C valid run i (no fallback):
//    (1) C's first unit after the same-index touchstart; (2) C's first unit at or after (C's last moving frame at or
//    before the same rest mark + V's measured delay). (b) per kind (touchstart, rest): 'in' when every V hand-over unit
//    has dRecalc <= 1, dLayout <= 0, dPaint <= 0 against its C unit, 'OUT' when any has not, 'no data for <kind>' when no
//    pair of that kind was found in some run pair (goes to the lead, not to a mechanism verdict).
//  - y≈50 frame (c): the first moving frame of drag1 with y >= 50; record counts and whether it is a writer frame.
// Void (reported, the caller re-runs once in place): gesture errors / aborted, Timeline errors or more than one epoch,
// > 10 % uncovered moving band frames. Sentinel and Low Power Mode are judged outside (block log).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const fns = {}; args.forEach((a, i) => { if (a === '--fn') { const [arm, list] = args[i + 1].split(':'); fns[arm] = Object.fromEntries(list.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, +v]; })); } });
const band = opt('--band', '1:780').split(':').map(Number);
const SCRIPT = opt('--script', 'nodes/2.DyWL8TcE.js');
const isPage = (name) => !!name && name.split('?')[0].endsWith(SCRIPT);
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
// Assumption: in each rendering update the logger's rAF callback runs before the page's rAF callbacks (rAF callbacks run
// in registration order; the logger re-registers first, `s` is registered after it in the previous frame), so a frame's
// own page rAF work falls in the unit that its logger call opens. iOS Timeline puts FireAnimationFrame records at top
// level (P-071 Timeline: 588 top-level FAF), so units are cut between top-level records.
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
  const units = unitStart.map((s, i) => { const e = i + 1 < unitStart.length ? unitStart[i + 1] : Infinity; const f = {}; const cs = []; const ks = [];
    for (let k = L[i]; k < tops.length && tops[k].s < e; k++) { if (k > L[i] && tops[k].s < s) continue; walk(tops[k].r, f); cs.push(...tops[k].cs); ks.push(k); }
    return { s, f, cs, ks }; });
  // dedupe units that share a top-level record (two logger calls in one record): keep the first, empty the rest
  for (let i = 1; i < units.length; i++) if (L[i] === L[i - 1]) { units[i].f = {}; units[i].cs = []; units[i].ks = []; units[i].shared = true; }
  const fr = seg.frames;
  // clock fit: median of (unit start - frame stamp) over the nearest pairs of the first 200 frames
  const diffs = []; for (const [t] of fr.slice(0, 200)) { let bd = 1e9, b = 0; for (const s of LT) { const d = s - t; if (Math.abs(d) < Math.abs(bd)) bd = d; if (s > t + 100) break; } if (Math.abs(bd) < 100) diffs.push(bd); }
  diffs.sort((a, b) => a - b); const fit = diffs.length ? diffs[diffs.length >> 1] : 0;
  let uIdx = 0; const unitOf = (t) => { const tt = t + fit; while (uIdx + 1 < LT.length && Math.abs(LT[uIdx + 1] - tt) <= Math.abs(LT[uIdx] - tt)) uIdx++; return Math.abs(LT[uIdx] - tt) <= 4 ? units[uIdx] : null; };
  const unitAfter = (t) => units.find((u, i) => LT[i] >= t + fit) || null;
  const F = fns[run.arm] || {};
  if (F.s === undefined) throw new Error(`no --fn ${run.arm}:s=<line> given: the writer test needs it (refusing to score ${run.arm} as writer-free)`);
  if (run.arm === 'V' && F.heRest === undefined) throw new Error('no heRest line for V (--fn V:s=<line>,heRest=<line>)');
  const isWriter = (u) => !!u && u.cs.some((c) => c.raf && isPage(c.name) && near(c.line, F.s));
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
  // change 2: the first moving band frame after each touchstart: the first recorder frame after t whose y differs from
  // the previous frame's; its own unit (unitOf, from a reset search index), or null when uncovered or out of the band
  const firstMoves = touchS.map((t) => { for (let i = 1; i < fr.length; i++) { const [ft, , y] = fr[i]; if (ft <= t) continue;
    if (y === fr[i - 1][2]) continue; if (y < band[0] || y > band[1]) return { t: Math.round(ft), y, frame: null, outOfBand: true };
    uIdx = 0; const u = unitOf(ft); if (!u) return { t: Math.round(ft), y, frame: null };
    const nu = units[uIdx + 1]; const f = { ...u.f }; if (nu) for (const [k, v] of Object.entries(nu.f)) f[k] = (f[k] || 0) + v;
    return { t: Math.round(ft), y, first: pick(u.f), next: nu ? pick(nu.f) : null, frame: { s: Math.round(u.s - fit), twoUnits: !!nu, ...pick(f) } }; } return null; });
  // change 3 (descriptive): the timer id nearest a 1000 ms period, TimerFire records at any depth
  const tf = []; const findTF = (r) => { if (r.type === 'TimerFire') tf.push(r); for (const c of r.children || []) findTF(c); }; for (const t of tops) findTF(t.r);
  const byId = {}; for (const r of tf) { const id = r.data && r.data.timerId; if (id == null) continue; (byId[id] ||= []).push(pm(r.startTime)); }
  let grid = null; for (const [id, ts] of Object.entries(byId)) { if (ts.length < 5) continue; ts.sort((a, b) => a - b); const g = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b); const med = g[g.length >> 1];
    if (!grid || Math.abs(med - 1000) < Math.abs(grid.medianGapMs - 1000)) grid = { timerId: +id, fires: ts.length, medianGapMs: +med.toFixed(1) }; }
  if (grid) grid.grid30 = grid.medianGapMs >= 1012;
  // V's rest hand-over: the heRest TimerFire runs between frames, so its frame = the TimerFire record's own (forced)
  // work + the next frame unit (the class drop's style/layout/paint lands there), both summed.
  const rests = [];
  // change 1: heRest TimerFire records at any depth, each with the index of its top-level ancestor
  const timers = []; const findT = (r, k) => { if (r.type === 'TimerFire') { const cs = []; calls(r, cs, false, true); if (cs.some((c) => isPage(c.name) && near(c.line, F.heRest))) timers.push({ r, k }); } for (const c of r.children || []) findT(c, k); };
  if (F.heRest !== undefined) tops.forEach((t, k) => findT(t.r, k));
  for (const { r: tr, k: top } of timers) { const ts = pm(tr.startTime) - fit; const lastMove = movingT.filter((x) => x <= ts).pop(); const nx = unitAfter(ts);
    const ft = {}; walk(tr, ft); const inside = !!nx && nx.ks.includes(top); const f = nx ? { ...nx.f } : {};
    if (!inside) for (const [k, v] of Object.entries(ft)) f[k] = (f[k] || 0) + v;
    const y = yAt(ts);
    rests.push({ t: Math.round(ts), afterLastMoveMs: lastMove ? Math.round(ts - lastMove) : null, y, pastEnd: y > band[1], timer: pick(ft), timerInsideNext: inside, next: nx ? pick(nx.f) : null, frame: nx ? { s: Math.round(ts), timerPlusNext: true, ...pick(f) } : null }); }
  const restNames = ['rest1', 'rest2', 'rest3', 'rest4'];
  const restAnchors = Object.fromEntries(restNames.map((n) => [n, marks[n] === undefined ? null : movingT.filter((t) => t <= marks[n]).pop() ?? null]));
  // pair each heRest fire with the nearest rest mark (|fire - mark| <= 800 ms); a mark keeps its nearest fire
  for (const rs of rests) { let best = null; for (const n of restNames) { if (marks[n] === undefined) continue; const d = Math.abs(rs.t - marks[n]); if (d <= 800 && (!best || d < best.d)) best = { n, d }; } rs.mark = best ? best.n : null; rs.markDist = best ? Math.round(best.d) : null; }
  for (const n of restNames) { const fs = rests.filter((r) => r.mark === n).sort((a, b) => a.markDist - b.markDist); fs.slice(1).forEach((r) => { r.mark = null; r.dupOf = n; }); }
  return { arm: run.arm, file: run.g, tl: tlFile, label: g.meta && g.meta.label, void: void_, frames: fr.length, loggerKey, loggerCalls: L.length, clockFitMs: +fit.toFixed(1), moving, uncovered,
    writerShare: covered ? +(writer / covered).toFixed(3) : null, writer, perMovingFrame: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, covered ? +(v / covered).toFixed(2) : null])),
    y50, touchFrames, firstMoves, timerGrid: grid, rests, restAnchors, RF: units, firstAfter: (t) => unitAfter(t) };
}
const S = runs.map(score);
const out = { scorer: 'scoreF.mjs', sha256: self, band, fns, runs: [] };
const validRuns = S.filter((r) => !r.void.length);
const Cs = validRuns.filter((r) => r.arm === 'C'), Vs = validRuns.filter((r) => r.arm === 'V');
for (const r of S) {
  console.log(`${r.arm} ${r.label}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; moving band frames ${r.moving} (uncovered ${r.uncovered}); writer frames ${r.writer} share ${r.writerShare}; per moving frame ${JSON.stringify(r.perMovingFrame)}`);
  console.log(`   y≈50 frame: ${JSON.stringify(r.y50)}`);
  console.log(`   timer grid (descriptive): ${r.timerGrid ? `timer ${r.timerGrid.timerId}, ${r.timerGrid.fires} fires, median gap ${r.timerGrid.medianGapMs} ms${r.timerGrid.grid30 ? ' -> 30 ms grid (grid30)' : ''}` : 'no 1000 ms timer found'}`);
}
// (b): V hand-over frames vs C's matching frames, paired in order (V valid run i with C valid run i; no fallback)
const pairs = [];
for (let i = 0; i < Math.max(Vs.length, Cs.length); i++) {
  const v = Vs[i], c = Cs[i]; if (!v || !c) { console.log(`   (b) valid run pair ${i + 1}: no ${v ? 'C' : 'V'} run, not scored`); continue; }
  for (const rs of v.rests) if (!rs.mark || rs.pastEnd) console.log(`   (b) ${v.label} heRest fire at ${rs.t} y${rs.y}: ${rs.pastEnd ? `past the hero end (y > ${band[1]}), a no-op drop, not a hand-over: not scored` : rs.dupOf ? 'second fire for ' + rs.dupOf + ', unpaired, not scored' : 'no rest mark within 800 ms, unpaired, not scored'}`);
  const rows = [];
  v.touchFrames.forEach((tf, k) => { const ct = c.touchFrames[k]; if (tf.y > band[1] || !tf.frame|| !ct || !ct.frame) return;
    rows.push({ kind: `touchstart ${k + 1}`, type: 'touchstart', y: tf.y, V: tf.frame, C: ct.frame }); });
  v.firstMoves.forEach((fm, k) => { const cm = c.firstMoves[k]; if (!fm || !cm || fm.outOfBand || cm.outOfBand || !fm.frame || !cm.frame) return;
    rows.push({ kind: `first-move ${k + 1} [V ${fm.first.P}+${fm.next ? fm.next.P : '-'}P, C ${cm.first.P}+${cm.next ? cm.next.P : '-'}P]`, type: 'first-move', y: fm.y, V: fm.frame, C: cm.frame }); });
  v.rests.forEach((rs) => { if (!rs.mark || rs.pastEnd) return; const anchor = c.restAnchors[rs.mark]; if (!rs.frame || anchor == null || rs.afterLastMoveMs == null) return;
    const cx = c.firstAfter(anchor + rs.afterLastMoveMs); if (!cx) return;
    rows.push({ kind: `${rs.mark} (+${rs.afterLastMoveMs} ms) [timer S${rs.timer.S} L${rs.timer.L} P${rs.timer.P}${rs.timerInsideNext ? ' (inside next)' : ''} | next ${rs.next ? `S${rs.next.S} L${rs.next.L} P${rs.next.P}` : '-'}]`, type: 'rest', y: rs.y, V: rs.frame, C: { s: Math.round(cx.s), ...pick(cx.f) } }); });
  for (const r of rows) { r.dS = r.V.S - r.C.S; r.dL = r.V.L - r.C.L; r.dP = r.V.P - r.C.P; r.ok = r.dS <= 1 && r.dL <= 0 && r.dP <= 0;
    console.log(`   (b) ${v.label} vs ${c.label} ${r.kind} y${r.y}: V S${r.V.S} L${r.V.L} P${r.V.P} | C S${r.C.S} L${r.C.L} P${r.C.P} -> ${r.ok ? 'in' : 'OUT'}`); }
  const byType = Object.fromEntries(['touchstart', 'first-move', 'rest'].map((ty) => { const rr = rows.filter((r) => r.type === ty); return [ty, !rr.length ? `no data for ${ty}` : rr.every((r) => r.ok) ? 'in' : 'OUT']; }));
  pairs.push({ V: v.label, C: c.label, rows, byType });
}
const inA = (r) => r.arm === 'C' ? r.writerShare >= 0.3 && r.writerShare <= 1 : r.writerShare >= 0 && r.writerShare <= 0.05;
const valid = validRuns;
const aRuns = valid.map((r) => ({ arm: r.arm, label: r.label, share: r.writerShare, in: inA(r) }));
const armV = (arm) => { const a = aRuns.filter((x) => x.arm === arm); return a.length < 2 ? `not enough (${a.length} valid)` : a.every((x) => x.in) ? 'in' : a.every((x) => !x.in) ? 'out' : 'split'; };
const perArmA = { C: armV('C'), V: armV('V') };
const verdictB = Object.fromEntries(['touchstart', 'first-move', 'rest'].map((ty) => { const st = pairs.map((p) => p.byType[ty]);
  return [ty, !pairs.length ? 'no data (no valid run pair)' : st.some((x) => x.startsWith('no data')) ? `no data for ${ty}` : st.every((x) => x === 'in') ? 'in' : 'OUT']; }));
console.log(`(a) per run: ${aRuns.map((x) => `${x.label} ${x.share} ${x.in ? 'in' : 'OUT'}`).join(', ')} -> C (positive control) ${perArmA.C}; V (claim) ${perArmA.V}`);
console.log(`(b) touchstart ${verdictB.touchstart}; first-move ${verdictB['first-move']}; rest ${verdictB.rest}; (c) y50: ${valid.map((r) => `${r.label} writer=${r.y50 && r.y50.writer}`).join(', ')}`);
console.log(`scorer sha256 ${self}`);
for (const r of S) { const { RF, firstAfter, ...rest } = r; out.runs.push(rest); }
out.a = { runs: aRuns, perArm: perArmA }; out.b = { pairs, verdict: verdictB };
out.timerGrid = S.map((r) => ({ label: r.label, ...(r.timerGrid || { none: true }) }));
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
