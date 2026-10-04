#!/usr/bin/env node
// toolbar-resize P-119 scorer (frozen before data). Simulator, attribution only; times compare within one session
// against interleaved C runs, never as a gain.
//   node fixes/toolbar-resize/score-p119.mjs <folder> <run> ... [--json out.json]     (<run> = <arm>-H<n>, arm C | cct | cva)
// <folder> holds g-<run>.json (sim.mjs gesture --out, with p119-inject.mjs's record) + tl-<run>.json (--timeline).
// 1. PRIMARY (unchanged): score-bisect.mjs (sha256/12 cb6f0c97b81b) on the same runs: per run ratio and call
//    (LOCATES <= 0.30, PARTIAL <= 0.70, NONE; GEOMETRY, NO-REPLICA, VOID as there). Arm call over its replicates: the
//    common call when every replicate run has the same call, else SPLIT.
// 2. SECONDARY (R5, frame-count invariant): on the primary's frames (toolbar-moving: innerHeight strictly between the
//    run's min and max; hero zone y < 3250; a Layout belongs to a frame when it starts in (t - dt, t]) the summed
//    Layout ms per second of those frames (sum Layout ms / sum dt). Ratio to the mean of the nearest C run before and
//    after; banded like the primary. Sums count outermost Layout records only (no nested Layout twice). A run whose secondary band differs from its primary call is N-SENSITIVE.
// 3. MID-PAGE (registered from a post-hoc read of P-115's data): frames with the toolbar still (innerHeight at the
//    run's min or max), y >= 3000, y changed from the previous frame; count of frames whose largest Layout >= 10 ms
//    ("big"). Per arm run vs its neighbouring C mean: MID-REMOVES <= 0.2x, MID-SAME >= 0.7x, else MID-PARTIAL;
//    MID-THIN when that C mean < 5.
// 4. ENTERING (R3): crossings from the inject's IntersectionObserver on the showcase (rootMargin 0, threshold 0;
//    entries [time, in, top, bottom, rootH]); an enter event = an entry with in = 1 whose previous entry had in = 0,
//    inside the longest segment's frame span; dir down when top > 0 (enters at the viewport bottom), else up.
//    Updates = the Timeline's top-level RenderingFrame records (page ms = s * 1000 - offsetMs); per update its largest
//    Layout and largest Paint (any depth). U_E = the update whose start is within 2 ms of the entry's time (the
//    nearest), else the last update starting <= time + 2 ms ("approx"). Window = updates E-1 .. E+2. Per event:
//    maxL / maxP = the window's largest Layout / Paint; catch-up k = the first k in 0..2 with update E+k's largest
//    Layout >= 5 ms (null if none). Per run: enterL / enterP = medians over its events (all directions; down and up
//    also listed). Per non-C run vs its neighbouring C mean (each value):
//      ENTER-COST when (L ratio >= 1.5 and L - C >= 8 ms) or (P ratio >= 1.5 and P - C >= 8 ms);
//      ENTER-OK when (L ratio <= 1.2 or L - C < 4 ms) and (P ratio <= 1.2 or P - C < 4 ms); else ENTER-UNCLEAR;
//      ENTER-THIN when the run or a neighbouring C run has < 2 events.
//    UNPAINTED-PROXY per run = events with catch-up k >= 1 (the showcase's big Layout lands in an update after the
//    one that first saw it intersect: by WebKit's update order the entering update then shows the box without its
//    content). A proxy, not pixels; read for cva only (C and cct relayout the showcase anyway).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
const pos = args.filter((x, i) => !(ji >= 0 && (i === ji || i === ji + 1)));
const [dir, ...names] = pos;
if (!dir || !names.length) { console.error('usage: score-p119.mjs <folder> <run> ... [--json out.json]'); process.exit(1); }
const HERE = new URL('.', import.meta.url).pathname;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const band = (r) => (r == null ? 'INSUFFICIENT' : r <= 0.3 ? 'LOCATES' : r <= 0.7 ? 'PARTIAL' : 'NONE');
// 1. primary
const pj = join(dir, 'primary.json');
const pr = spawnSync('node', [join(HERE, 'score-bisect.mjs'), dir, ...names, '--json', pj], { encoding: 'utf8' });
process.stdout.write(pr.stdout || ''); if (pr.status !== 0) { process.stderr.write(pr.stderr || ''); process.exit(pr.status || 1); }
const P = JSON.parse(readFileSync(pj, 'utf8'));
// per-run data
function load(name) {
  const g = JSON.parse(readFileSync(join(dir, `g-${name}.json`), 'utf8')), tl = JSON.parse(readFileSync(join(dir, `tl-${name}.json`), 'utf8'));
  const seg = [...(g.run?.segments || [])].sort((a, b) => (b.frames?.length || 0) - (a.frames?.length || 0))[0];
  let inj = (g.run?.inject || g.inject || [])[0]?.value ?? null; if (typeof inj === 'string') inj = JSON.parse(inj);
  const lays = [], ups = [];
  const big = (r, type) => { let m = 0; const w = (x) => { if (x.type === type && x.endTime != null) m = Math.max(m, (x.endTime - x.startTime) * 1000); (x.children || []).forEach(w); }; w(r); return m; };
  // outermost Layout records only (a Layout nested in a Layout is not counted twice in sums)
  const walk = (r, inLay) => { const isL = r.type === 'Layout' && r.endTime != null; if (isL && !inLay) lays.push([r.startTime * 1000 - tl.offsetMs, (r.endTime - r.startTime) * 1000]); (r.children || []).forEach((c) => walk(c, inLay || isL)); };
  for (const r of tl.recs || []) { walk(r, false); if (r.type === 'RenderingFrame' && r.endTime != null) ups.push({ s: r.startTime * 1000 - tl.offsetMs, L: big(r, 'Layout'), P: big(r, 'Paint') }); }
  ups.sort((a, b) => a.s - b.s);
  return { name, arm: name.replace(/-H\d+$/, ''), seg, inj, lays, ups };
}
const runs = names.map(load);
const nbC = (i, key) => { const nb = []; for (let j = i - 1; j >= 0; j--) if (runs[j].arm === 'C') { nb.push(j); break; } for (let j = i + 1; j < runs.length; j++) if (runs[j].arm === 'C') { nb.push(j); break; } return nb; };
for (const r of runs) {
  const fr = r.seg.frames, ihs = fr.map((x) => x[3]), lo = Math.min(...ihs), hi = Math.max(...ihs);
  const inF = (t, dt) => r.lays.filter((l) => l[0] > t - dt && l[0] <= t);
  // 2. secondary
  let sumL = 0, sumDt = 0, n = 0;
  for (const [t, dt, y, ih] of fr) { if (!(ih > lo && ih < hi) || y >= 3250) continue; n++; sumDt += dt; sumL += inF(t, dt).reduce((a, l) => a + l[1], 0); }
  r.secondary = { n, layoutMsPerS: sumDt ? r3(sumL / (sumDt / 1000)) : null };
  // 3. mid-page
  let mn = 0, mb = 0;
  for (let i = 1; i < fr.length; i++) { const [t, dt, y, ih] = fr[i]; if ((ih !== lo && ih !== hi) || y < 3000 || y === fr[i - 1][2]) continue; mn++; if (inF(t, dt).reduce((m, l) => Math.max(m, l[1]), 0) >= 10) mb++; }
  r.mid = { n: mn, big: mb };
  // 4. entering
  const t0 = fr[0][0], t1 = fr[fr.length - 1][0];
  const io = r.inj?.io || [];
  const ev = [];
  for (let i = 1; i < io.length; i++) {
    const [T, inn, top] = io[i]; if (!(inn === 1 && io[i - 1][1] === 0) || T < t0 || T > t1) continue;
    let E = -1, approx = false, best = 3;
    r.ups.forEach((u, k) => { const d = Math.abs(u.s - T); if (d <= 2 && d < best) { best = d; E = k; } });
    if (E < 0) { approx = true; for (let k = 0; k < r.ups.length; k++) if (r.ups[k].s <= T + 2) E = k; }
    if (E < 0) continue;
    const win = r.ups.slice(Math.max(0, E - 1), E + 3);
    let k = null; for (let j = 0; j <= 2; j++) if (r.ups[E + j] && r.ups[E + j].L >= 5) { k = j; break; }
    ev.push({ T, dir: top > 0 ? 'down' : 'up', approx, maxL: r3(Math.max(...win.map((u) => u.L))), maxP: r3(Math.max(...win.map((u) => u.P))), catchUp: k });
  }
  const pick = (d) => ev.filter((e) => !d || e.dir === d);
  r.enter = { n: ev.length, nDown: pick('down').length, nUp: pick('up').length, enterL: r3(median(ev.map((e) => e.maxL))), enterP: r3(median(ev.map((e) => e.maxP))),
    downL: r3(median(pick('down').map((e) => e.maxL))), downP: r3(median(pick('down').map((e) => e.maxP))), upL: r3(median(pick('up').map((e) => e.maxL))), upP: r3(median(pick('up').map((e) => e.maxP))),
    unpaintedProxy: ev.filter((e) => e.catchUp != null && e.catchUp >= 1).length, events: ev };
  const m = r.inj?.measured || {};
  r.gapAtTop = m.showcaseTop0 != null && m.ih0 ? r3(m.showcaseTop0 - m.ih0) : null;
}
// per-run calls
const calls = {};
runs.forEach((r, i) => {
  if (r.arm === 'C') return;
  const nb = nbC(i).map((j) => runs[j]);
  const mean = (f) => { const v = nb.map(f).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const prim = P.verdicts[r.name] || {};
  const cSec = mean((c) => c.secondary.layoutMsPerS), secR = r.secondary.layoutMsPerS != null && cSec ? r3(r.secondary.layoutMsPerS / cSec) : null;
  const secBand = band(secR);
  const nSens = ['LOCATES', 'PARTIAL', 'NONE'].includes(prim.call) && ['LOCATES', 'PARTIAL', 'NONE'].includes(secBand) && secBand !== prim.call;
  const cMid = mean((c) => c.mid.big), midR = cMid ? r3(r.mid.big / cMid) : null;
  const mid = cMid == null || cMid < 5 ? 'MID-THIN' : midR <= 0.2 ? 'MID-REMOVES' : midR >= 0.7 ? 'MID-SAME' : 'MID-PARTIAL';
  const cL = mean((c) => c.enter.enterL), cP = mean((c) => c.enter.enterP);
  const L = r.enter.enterL, Pp = r.enter.enterP;
  let enter;
  if (r.enter.n < 2 || nb.some((c) => c.enter.n < 2) || L == null || cL == null) enter = 'ENTER-THIN';
  else {
    const lr = cL > 0 ? L / cL : Infinity, prr = cP > 0 ? Pp / cP : Infinity;
    if ((lr >= 1.5 && L - cL >= 8) || (prr >= 1.5 && Pp - cP >= 8)) enter = 'ENTER-COST';
    else if ((lr <= 1.2 || L - cL < 4) && (prr <= 1.2 || Pp - cP < 4)) enter = 'ENTER-OK';
    else enter = 'ENTER-UNCLEAR';
  }
  calls[r.name] = { primary: prim.call, ratio: prim.ratio, secondaryRatio: secR, secondaryBand: secBand, nSensitive: nSens, midRatio: midR, mid, enterL: L, enterP: Pp, cEnterL: r3(cL), cEnterP: r3(cP), enter, unpaintedProxy: `${r.enter.unpaintedProxy}/${r.enter.n}`, neighbours: nb.map((c) => c.name) };
});
const armCalls = {};
for (const arm of [...new Set(runs.filter((r) => r.arm !== 'C').map((r) => r.arm))]) {
  const cs = runs.filter((r) => r.arm === arm).map((r) => calls[r.name]);
  const same = (k) => (cs.every((c) => c[k] === cs[0][k]) ? cs[0][k] : 'SPLIT');
  armCalls[arm] = { runs: cs.length, primary: same('primary'), nSensitive: cs.some((c) => c.nSensitive), mid: same('mid'), enter: same('enter'), unpaintedProxy: cs.map((c) => c.unpaintedProxy).join(' ') };
}
const out = { scorer: 'fixes/toolbar-resize/score-p119.mjs', primary: { replica: P.replica, drift: P.drift, void: P.void, verdicts: P.verdicts },
  runs: runs.map((r) => ({ name: r.name, arm: r.arm, secondary: r.secondary, mid: r.mid, enter: r.enter, gapAtTop: r.gapAtTop })), calls, armCalls };
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + '\n');
for (const r of runs) {
  const c = calls[r.name];
  console.log(`${r.name.padEnd(8)} sec ${r.secondary.layoutMsPerS} ms/s (n ${r.secondary.n}) mid big ${r.mid.big}/${r.mid.n} enter n ${r.enter.n} (down ${r.enter.nDown}, up ${r.enter.nUp}) L ${r.enter.enterL} P ${r.enter.enterP} unpainted-proxy ${r.enter.unpaintedProxy} gapAtTop ${r.gapAtTop}` +
    (c ? ` -> primary ${c.primary} ${c.ratio} | sec ${c.secondaryRatio} ${c.secondaryBand}${c.nSensitive ? ' N-SENSITIVE' : ''} | ${c.mid} ${c.midRatio} | ${c.enter} (C L ${c.cEnterL} P ${c.cEnterP})` : ''));
}
for (const [a, c] of Object.entries(armCalls)) console.log(`ARM ${a}: primary ${c.primary}${c.nSensitive ? ' (N-SENSITIVE)' : ''} | ${c.mid} | ${c.enter} | unpainted-proxy ${c.unpaintedProxy}`);
