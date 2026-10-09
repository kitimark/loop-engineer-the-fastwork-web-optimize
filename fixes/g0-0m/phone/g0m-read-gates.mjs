#!/usr/bin/env node
// g0.0m phone kit (fix-reveal-paint, 2026-10-09; card: fixes/g0-0m/README.md "Phone check card"): a text-substitution copy of
// P-174's kit (fixes/g0-0l/phone/, fix-scrollcb-g0; credit it and its lineage below) with: logs out/g0mp, labels g0m-, owner
// fix-reveal-paint, snapshot out/g0-0m/snap (fixes/g0-0m/phone/g0m-snap.sh, HASHES.txt e7947589f4c9) and these pins (the
// headers below name the older arms; the code's pins are these):
//   C = g0.0l (best on main, fixes/g0-0l)                  JS 4106679e0a8a  CSS 440582cec781
//   V = g0.0m rev 3 = g0.0l + reveal-paint (fixes/g0-0m)  JS 37af49aef32b  CSS 7a8ecdd8f8e4
// The two G programs are byte-identical copies of P-174's (compiled 22b636f36a82 / 65f6de58009c).
// g0.0l phone card copy (fix-scrollcb-g0, 2026-10-09) of fix-g0-box's p129-read-g0.mjs (P-129 reader, credit fix-g0-box,
// fix-end-morph): ONE change, G6 accepts the two g0.0l programs (flick 22b636f36a82, approach 65f6de58009c) instead of fs.
// Everything else (G1-G5, the sentinel rule, readBlock) is byte-identical to the source.
// P-129 reader (frozen before data; card: research/serious-heat/README.md §5 "P-129", rev 2).
// Reads one P-129 block: driver-G gesture records (g-<run>.json, iphone.mjs gesture, the P-124 format) and their WebKit
// Timeline files (tl-<run>.json, iphone.mjs gesture --timeline: {syncT, syncTL, offsetMs, recs, end, stopped, epochs}).
//   node research/serious-heat/p129-read.mjs <folder> --E E1,E2,E3,E4 --L L1,L2,L3,L4 [--S S0,S1] [--json out.json]
// No measurement, no device: a pure reader. Exports its rules for p129-selftest.mjs.
//
// CLOCKS (ops C1). Frame records [t, dt, scrollY, innerHeight]: t = the recorder's rAF timestamp (page performance.now()
//   clock, tools/lib/gesture-rec.mjs). Timeline records: startTime/endTime in s on the inspector's clock. Mapping, as
//   tools/lib/gesture-run.mjs timelineRecorder documents it: Timeline ms = page ms + offsetMs, offsetMs = syncTL*1000 -
//   syncT (a performance.mark TimeStamp). So a record's page time = startTime*1000 - offsetMs.
// RUN GATES (a run failing any gate is INVALID: excluded, named in the output; the runner re-runs it inside the block cap):
//   G1 timeline present: syncTL and offsetMs are numbers, recs non-empty, stopped true, no `epochs` (the file has it only after a
//      reconnect, holding epochs 1..; those records sit on another time base).
//   G2 drift: end.offsetMs is a number and |end.offsetMs - offsetMs| <= 2 ms.
//   G3 alignment: of the run's moving frames (i >= 1, scrollY != previous), >= 95 % have a FireAnimationFrame record whose
//      page start lies in [t - 2, min(t + 10, tNext - 2)) (the recorder's own rAF callback runs in that update; tNext = the
//      next frame's t, so a match never borrows the next update's callback), AND the median lag (FireAnimationFrame
//      start - t) is within +-2 ms. Why asymmetric: t is the update's frozen "now", taken before the resize, scroll,
//      media-query and animation steps that precede the rAF callbacks (WebKit Page.cpp l.2478-2535, c7ee1c1cda), so a
//      frame with heavy scroll handlers starts its callbacks several ms after t; the median, over mostly light frames,
//      is what pins the clock (an offset error of > 2 ms fails it).
//   G4 idle (ops C4): first touchstart - readyPageMs in [4.0, 5.5] s for E (P-124's fs: 4.62-4.64 s), in [20, 23] s for L.
//   G5 exactly one segment (the --timeline file is segment 0's) with >= 100 frames, run not aborted.
//   G6 the gesture program hash starts with 8737f212c0ff (fs, ms-fastshort-v1; sentinels too).
// FILES: <folder>/g-<run>.json (iphone.mjs gesture --out) and <folder>/tl-<run>.json (its --timeline); sentinels g- only.
// FRAMES: moving = scrollY differs from the previous frame; slow(th) = dt > th, th in {30, 34, 38} (34 decides, 30/38
//   are the phone twins: a reading that differs at a twin is flagged threshold-sensitive). Bands (tools/lib/gesture-rec.mjs
//   frameBands): hero scrollY < 900; lastScreen scrollY >= maxY - vh with maxY = docH1 (or docH) - innerHeight; else middle.
//   Toolbar step: innerHeight differs from the previous or the next frame. Windows: E from readyPageMs W1 [0, 8.5) s,
//   W2 [8.5, 20) s, W3 >= 20 s; L from its first touchstart L1 [0, 8.5) s, L2 >= 8.5 s.
// PART A, per slow moving frame of a valid counted run whose gap lies inside the Timeline (first record start <= t - dt,
//   t <= last record end):
//   gap = (t - dt, t] (page ms). WORK = EventDispatch, FunctionCall, TimerFire, FireAnimationFrame, ObserverCallback,
//   EvaluateScript, RecalculateStyles, Layout, Paint, at any depth.
//   busy   = length of the union of every WORK record's overlap with the gap (ops N1: nested records count once).
//   busyRF = busy united with the RenderingFrame self-spans in the gap (ops C2): a RenderingFrame's span minus the union of
//            its direct children's spans (Composite is a child, so its flush wait stays out; §4.1).
//   maxLR  = the largest overlap with the gap of one Layout or RecalculateStyles record.
//   class(b): MAIN when b >= dt - 16.7; RENDER when b < 8 and maxLR <= 4; else MIXED.
//   Reading over all counted valid runs pooled (E and L): THIN when < 30 classified frames or < 3 runs with one;
//   RENDER-LED when RENDER >= 50 %; MAIN-LED when MAIN >= 50 %; else MIXED. Computed with busy (decides) and busyRF:
//   when the two differ, the reading is ATTRIBUTION-SENSITIVE and decides nothing (ops C2).
// PART B (hero band, moving frames, th 34): a run enters B when it has >= 25 moving hero frames (P-124 fs: 82-83 per run).
//   rE, rL = pooled slow/moving hero frames of the E / L runs in B; per-run rL_i.
//   THIN when fewer than 3 E or 3 L runs are in B.
//   LOAD  when rL <= 0.5 rE and rL <= 0.04, and >= 3 L runs (or all, when only 3) have rL_i <= 0.5 rE (ops C4: the per-run
//         spread applies to the relative criterion only).
//   HERO  when rL >= 0.10 and rL >= 0.75 rE, and >= 3 L runs (or all, when only 3) have rL_i >= 0.75 rE.
//   SPLIT otherwise.
// PART S (descriptive, decides nothing): slow moving lastScreen frames whose t is within 300 ms after a touchend: does
//   the gap hold a TimerFire whose timerId was installed with timeout 200 (TimerInstall data.timeout), and a Layout that
//   starts after that TimerFire's start inside the gap?
// SENTINELS (ops C3; Timeline-OFF E runs, g- files only): PASS when moving fps (moving frames / sum of their dt) >= 50 and
//   slow share (dt > 34, moving) <= 6 % (P-124's 8 xcode-serious G runs: 54.3-56.4 fps, 2.1-4.2 %). A failing end
//   sentinel VOIDs every counted run of the block; a failing start sentinel VOIDs the block before any counted run.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WORK = new Set(['EventDispatch', 'FunctionCall', 'TimerFire', 'FireAnimationFrame', 'ObserverCallback', 'EvaluateScript', 'RecalculateStyles', 'Layout', 'Paint']);
export const TH = [30, 34, 38];
export const GATE = { drift: 2, align: 0.95, alignLo: 2, alignHi: 10, medLag: 2, idleE: [4.0, 5.5], idleL: [20, 23], minFrames: 100 };
export const FLOOR = { aFrames: 30, aRuns: 3, bHero: 25, bRuns: 3 };
export const SENT = { fps: 50, slow: 0.06 };
export const FS_HASHES = ['22b636f36a82', '65f6de58009c']; // g0.0l: g-flick-g0l.json, g-approach-g0l.json
export const FS_HASH = FS_HASHES.join('|'); // (source: P-164 g0 copy pinned ms-fastshort-g0 38d7fe5d7fa8 here)

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

/** Union length of intervals [a, b] (any order). */
export function unionLen(iv) {
  const s = iv.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let tot = 0, ca = null, cb = null;
  for (const [a, b] of s) {
    if (ca === null) { ca = a; cb = b; } else if (a <= cb) { cb = Math.max(cb, b); } else { tot += cb - ca; ca = a; cb = b; }
  }
  if (ca !== null) tot += cb - ca;
  return tot;
}
const clip = ([a, b], lo, hi) => [Math.max(a, lo), Math.min(b, hi)];
/** Subtract a union of intervals from [a, b]; returns the remaining pieces. */
export function subtract([a, b], holes) {
  let out = [[a, b]];
  for (const [ha, hb] of holes) {
    const nx = [];
    for (const [x, y] of out) {
      if (hb <= x || ha >= y) { nx.push([x, y]); continue; }
      if (ha > x) nx.push([x, ha]);
      if (hb < y) nx.push([hb, y]);
    }
    out = nx;
  }
  return out;
}

/** Flatten Timeline records to page-ms intervals: {type, a, b, data, kids: [[a, b]]}. */
export function flatten(recs, offsetMs) {
  const out = [];
  const span = (r) => [r.startTime * 1000 - offsetMs, (r.endTime ?? r.startTime) * 1000 - offsetMs];
  const walk = (r) => {
    const [a, b] = span(r);
    out.push({ type: r.type, a, b, data: r.data || {}, kids: (r.children || []).map(span) });
    for (const c of r.children || []) walk(c);
  };
  for (const r of recs || []) walk(r);
  return out;
}

export function classify(b, dt, maxLR) { return b >= dt - 16.7 ? 'MAIN' : b < 8 && maxLR <= 4 ? 'RENDER' : 'MIXED'; }

/** Part A numbers for one gap (page ms). */
export function gapWork(flat, lo, hi) {
  const work = [], rf = []; let maxLR = 0;
  for (const r of flat) {
    if (r.b <= lo || r.a >= hi) continue;
    if (WORK.has(r.type)) {
      const c = clip([r.a, r.b], lo, hi); work.push(c);
      if (r.type === 'Layout' || r.type === 'RecalculateStyles') maxLR = Math.max(maxLR, c[1] - c[0]);
    }
    if (r.type === 'RenderingFrame') for (const p of subtract([r.a, r.b], r.kids)) rf.push(clip(p, lo, hi));
  }
  return { busy: unionLen(work), busyRF: unionLen([...work, ...rf]), maxLR };
}

export const band = (f, docH) => (f[2] < 900 ? 'hero' : f[2] >= docH - f[3] - f[3] ? 'lastScreen' : 'middle');

/** One run: gates and per-frame rows. role E | L | S. */
export function readRun(g, tl, role) {
  const why = [];
  const segs = g?.run?.segments || [], seg = segs[0];
  const fr = seg?.frames || [];
  if (segs.length !== 1 || fr.length < GATE.minFrames) why.push(`G5 ${segs.length} segments, ${fr.length} frames (want 1 segment, >= ${GATE.minFrames} frames)`);
  if (g?.run?.aborted) why.push('G5 the gesture run aborted');
  if (!FS_HASHES.some((h) => String(g?.program?.hash || '').startsWith(h))) why.push(`G6 script hash ${String(g?.program?.hash || 'none').slice(0, 12)} is not one of ${FS_HASH}`);
  const ready = g?.run?.reloads?.[0]?.readyPageMs ?? null;
  const t1 = (seg?.touches || []).find((e) => e[1] === 's');
  const idle = ready != null && t1 ? (t1[0] - ready) / 1000 : null;
  if (role !== 'S') {
    const [lo, hi] = role === 'E' ? GATE.idleE : GATE.idleL;
    if (idle == null || idle < lo || idle > hi) why.push(`G4 idle ${idle == null ? 'n/a' : idle.toFixed(2)} s not in [${lo}, ${hi}]`);
  }
  const docH = seg?.docH1 ?? seg?.docH ?? 0;
  const moving = [];
  for (let i = 1; i < fr.length; i++) if (fr[i][2] !== fr[i - 1][2]) moving.push(i);
  const res = { role, idle: r3(idle), frames: fr.length, moving: moving.length, why, rows: [] };
  if (role === 'S') {
    const sum = moving.reduce((m, i) => m + fr[i][1], 0), slow = moving.filter((i) => fr[i][1] > 34).length;
    res.fps = r1(sum ? (1000 * moving.length) / sum : 0); res.slowShare = r3(moving.length ? slow / moving.length : 1);
    res.sentinel = res.fps >= SENT.fps && res.slowShare <= SENT.slow && !why.length ? 'PASS' : 'FAIL';
    return res;
  }
  // G1, G2
  const ok1 = tl && Number.isFinite(tl.syncTL) && Number.isFinite(tl.offsetMs) && (tl.recs || []).length > 0 && tl.stopped === true && !(tl.epochs || []).length; // epochs[] exists only after a reconnect
  if (!ok1) why.push('G1 timeline missing, unaligned, not stopped or reconnected');
  const drift = ok1 && Number.isFinite(tl.end?.offsetMs) ? Math.abs(tl.end.offsetMs - tl.offsetMs) : null;
  if (ok1 && (drift == null || drift > GATE.drift)) why.push(`G2 drift ${drift == null ? 'n/a' : drift.toFixed(2)} ms > ${GATE.drift}`);
  res.drift = r3(drift);
  if (!ok1) return res;
  const flat = flatten(tl.recs, tl.offsetMs);
  const faf = flat.filter((r) => r.type === 'FireAnimationFrame').map((r) => r.a).sort((a, b) => a - b);
  // G3
  let hit = 0; const lags = [];
  for (const i of moving) {
    const t = fr[i][0], hiB = Math.min(t + GATE.alignHi, i + 1 < fr.length ? fr[i + 1][0] - GATE.alignLo : Infinity);
    const m = faf.find((a) => a >= t - GATE.alignLo && a < hiB);
    if (m !== undefined) { hit++; lags.push(m - t); }
  }
  const share = moving.length ? hit / moving.length : 0;
  lags.sort((a, b) => a - b);
  res.align = { share: r3(share), medianLagMs: r1(lags[lags.length >> 1]) };
  if (share < GATE.align) why.push(`G3 alignment ${(share * 100).toFixed(1)} % < ${GATE.align * 100} %`);
  const med = lags[lags.length >> 1];
  if (lags.length && Math.abs(med) > GATE.medLag) why.push(`G3 median lag ${med.toFixed(2)} ms outside +-${GATE.medLag}`);
  // reader rev 1.1 (mechanical, the lead's ruling after P-129 part 1): a loop instead of Math.min(...)/Math.max(...)
  // spread, which overflowed the call stack on a real Timeline's record count; pairwise Math.min/max keeps the exact result.
  let tlLo = Infinity, tlHi = -Infinity;
  for (const r of flat) { tlLo = Math.min(tlLo, r.a); tlHi = Math.max(tlHi, r.b); }
  const touchEnds = (seg.touches || []).filter((e) => e[1] === 'e').map((e) => e[0]);
  const installs200 = new Set(flat.filter((r) => r.type === 'TimerInstall' && r.data.timeout === 200).map((r) => r.data.timerId));
  const t0w = (role === 'E' ? ready : t1?.[0]) ?? NaN; // missing: G4 already failed the run
  for (const i of moving) {
    const [t, dt, y, ih] = fr[i];
    const tb = (i > 0 && fr[i - 1][3] !== ih) || (i + 1 < fr.length && fr[i + 1][3] !== ih);
    const s = (t - t0w) / 1000;
    const win = role === 'E' ? (s < 8.5 ? 'W1' : s < 20 ? 'W2' : 'W3') : s < 8.5 ? 'L1' : 'L2';
    const row = { i, t: r1(t), dt, band: band(fr[i], docH), tb, win, slow: TH.map((th) => dt > th) };
    if (dt > Math.min(...TH) && t - dt >= tlLo && t <= tlHi) {
      const w = gapWork(flat, t - dt, t);
      row.busy = r1(w.busy); row.busyRF = r1(w.busyRF); row.maxLR = r1(w.maxLR);
      row.cls = classify(w.busy, dt, w.maxLR); row.clsRF = classify(w.busyRF, dt, w.maxLR);
      if (row.band === 'lastScreen' && touchEnds.some((e) => e <= t && t - e <= 300)) {
        const tf = flat.filter((r) => r.type === 'TimerFire' && installs200.has(r.data.timerId) && r.a > t - dt && r.a <= t);
        row.s = { timer200: tf.length > 0, layoutAfter: tf.some((f) => flat.some((r) => r.type === 'Layout' && r.a >= f.a && r.a <= t)) };
      }
    }
    res.rows.push(row);
  }
  return res;
}

const readingA = (rows, key, nRuns) => {
  const n = rows.length, c = { MAIN: 0, RENDER: 0, MIXED: 0 };
  for (const r of rows) c[r[key]]++;
  const reading = n < FLOOR.aFrames || nRuns < FLOOR.aRuns ? 'THIN' : c.RENDER / n >= 0.5 ? 'RENDER-LED' : c.MAIN / n >= 0.5 ? 'MAIN-LED' : 'MIXED';
  return { n, ...c, reading };
};

/** Whole block. runs: {name: readRun result}; roles from the result. */
export function readBlock(runs) {
  const out = { sentinels: {}, invalid: {}, partA: {}, partB: null, partS: null, descriptive: {}, reading: null };
  const sent = Object.entries(runs).filter(([, r]) => r.role === 'S');
  for (const [n, r] of sent) out.sentinels[n] = { fps: r.fps, slowShare: r.slowShare, sentinel: r.sentinel };
  const counted = Object.entries(runs).filter(([, r]) => r.role !== 'S');
  for (const [n, r] of counted) if (r.why.length) out.invalid[n] = r.why;
  if (sent.some(([, r]) => r.sentinel !== 'PASS')) { out.reading = 'VOID (a sentinel failed: every counted run since the last passing sentinel is void)'; return out; }
  const valid = counted.filter(([, r]) => !r.why.length);
  // part A at each threshold, busy and busyRF
  for (const th of TH) {
    const k = TH.indexOf(th), rows = [], runsWith = new Set();
    for (const [n, r] of valid) for (const row of r.rows) if (row.slow[k] && row.cls) { rows.push(row); runsWith.add(n); }
    out.partA[`dt>${th}`] = { busy: readingA(rows, 'cls', runsWith.size), busyRF: readingA(rows, 'clsRF', runsWith.size) };
  }
  const a34 = out.partA['dt>34'];
  const aReading = a34.busy.reading === a34.busyRF.reading ? a34.busy.reading : `ATTRIBUTION-SENSITIVE (busy ${a34.busy.reading}, busyRF ${a34.busyRF.reading})`;
  const thSens = TH.some((th) => out.partA[`dt>${th}`].busy.reading !== a34.busy.reading);
  out.partA.reading = aReading + (thSens ? ' [threshold-sensitive]' : '');
  // descriptive splits at 34 (busy)
  const desc = {};
  for (const [, r] of valid) for (const row of r.rows) {
    if (!row.slow[1] || !row.cls) continue;
    for (const key of [`band:${row.band}`, `win:${row.win}`, `toolbar:${row.tb ? 'step' : 'other'}`]) {
      desc[key] ||= { n: 0, MAIN: 0, RENDER: 0, MIXED: 0 }; desc[key].n++; desc[key][row.cls]++;
    }
  }
  out.descriptive.partA = desc;
  // moving-frame slow rates per window (prediction 2 and 7; all bands)
  const rate = {};
  for (const [, r] of valid) for (const row of r.rows) { rate[row.win] ||= [0, 0]; rate[row.win][0]++; if (row.slow[1]) rate[row.win][1]++; }
  out.descriptive.slowRateByWindow = Object.fromEntries(Object.entries(rate).map(([w, [n, s]]) => [w, { moving: n, slow: s, rate: r3(s / n) }]));
  // part B
  const hero = (r) => { const h = r.rows.filter((x) => x.band === 'hero'); return [h.length, h.filter((x) => x.slow[1]).length]; };
  const inB = (role) => valid.filter(([, r]) => r.role === role && hero(r)[0] >= FLOOR.bHero);
  const E = inB('E'), L = inB('L');
  const pool = (xs) => { const [n, s] = xs.reduce((m, [, r]) => { const [a, b] = hero(r); return [m[0] + a, m[1] + b]; }, [0, 0]); return n ? s / n : null; };
  const rE = pool(E), rL = pool(L), per = L.map(([n, r]) => { const [a, b] = hero(r); return { run: n, rate: r3(b / a), hero: a }; });
  let b = 'SPLIT';
  if (E.length < FLOOR.bRuns || L.length < FLOOR.bRuns) b = 'THIN';
  else {
    const need = Math.min(3, L.length);
    if (rL <= 0.5 * rE && rL <= 0.04 && per.filter((p) => p.rate <= 0.5 * rE).length >= need) b = 'LOAD';
    else if (rL >= 0.1 && rL >= 0.75 * rE && per.filter((p) => p.rate >= 0.75 * rE).length >= need) b = 'HERO';
  }
  out.partB = { rE: r3(rE), rL: r3(rL), Eruns: E.map(([n]) => n), perL: per, reading: b };
  // part S
  const s = { frames: 0, timer200: 0, layoutAfter: 0 };
  for (const [, r] of valid) for (const row of r.rows) if (row.s && row.slow[1]) { s.frames++; if (row.s.timer200) s.timer200++; if (row.s.layoutAfter) s.layoutAfter++; }
  out.partS = s;
  // prediction 6 support (ops N3)
  const tbRows = desc['toolbar:step'] || { n: 0, MAIN: 0 };
  out.descriptive.toolbarStep = { n: tbRows.n, mainShare: tbRows.n ? r3(tbRows.MAIN / tbRows.n) : null, testable: tbRows.n >= 10 };
  out.reading = { partA: out.partA.reading, partB: b };
  return out;
}

async function main() {
  const args = process.argv.slice(2), dir = args[0];
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (!dir || !opt('--E') || !opt('--L')) { console.error('usage: p129-read.mjs <folder> --E E1,... --L L1,... [--S S0,S1] [--json out.json]'); process.exit(1); }
  const load = (f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } };
  const runs = {};
  for (const [role, k] of [['E', '--E'], ['L', '--L'], ['S', '--S']]) for (const n of (opt(k) || '').split(',').filter(Boolean)) runs[n] = readRun(load(`g-${n}.json`), role === 'S' ? null : load(`tl-${n}.json`), role);
  const out = readBlock(runs);
  out.runs = Object.fromEntries(Object.entries(runs).map(([n, r]) => [n, { role: r.role, idle: r.idle, frames: r.frames, moving: r.moving, drift: r.drift, align: r.align, fps: r.fps, slowShare: r.slowShare, why: r.why }]));
  console.log(JSON.stringify(out, null, 1));
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1) + '\n');
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
