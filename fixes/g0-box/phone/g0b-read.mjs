#!/usr/bin/env node
// g0-box phone reader (fix-g0-box; a pure reader: no device, no measurement). Card: fixes/g0-box/README.md "Phone card
// draft". A copy of arch-compositor-morph's fixes/compositor-morph/phone-c3bk6/p161-read.mjs (P-160/P-161/P-163 rules,
// credit arch-compositor-morph) with ONE change: what an "open" is.
//   node fixes/g0-box/phone/g0b-read.mjs <runs folder> [--runs EC1,EV1,...] [--json out.json]
//   node fixes/g0-box/phone/g0b-read.mjs --selftest
// Why the change: p161's opens are scroll-position crossings (m = (y - (docH - 2 ih)) / ih going from <= 0 to > 0). On
// g0 builds (the original end-of-page, g0.0 f75c1707 onward) the page is held still at the end and the menu opens by
// itself over 680 ms after the first upward finger move at the end (JS ~14369-14430 of g0.0: touchmove jack M, k(n),
// ZM tween); a swipe the other way closes it the same way. scrollY does not move, so p161 would see no open at all.
// OPEN on g0 (this reader): in a run's segment 0, walk the touch rows [t, kind, n, cancelable, defaultPrevented, scrollY,
// clientY, timeStamp] in order, with the state closed at the start:
//   - a touchmove ('m') whose clientY is lower than the previous touch row's of the same contact (finger moves up,
//     content would scroll down) while the state is closed, and that the page prevented (defaultPrevented 1: g0's jack
//     M took it), is an OPEN TRIGGER at its t; the state becomes open;
//   - a prevented touchmove whose clientY is higher (finger moves down) while the state is open is a CLOSE TRIGGER;
//     the state becomes closed.
//   Fallback, only for a record with no prevented touchmove at all (a recorder that does not see the page's
//   preventDefault): the rule before P-164, open = upward move at scrollY >= docH - innerHeight - 8, close = any
//   downward move while open.
//   P-164 pre-data change (2026-10-08, before any P-164 data): the end rule alone found no open in the Simulator G
//   records (out/sim/fix-g0-box-gesture-p164-{C,V}-*.json). g0 pins the opened page at the scrollY where its jack fired
//   (5213/5214 there, L's scrollTo), and opening grows docH 5999 -> 6035, so scrollY stays 39-47 px under
//   docH - ih - 8. Count-only records keep no frames either, so ih falls back to seg.vh0 when no frame row has it.
//   With ih from vh0 the end rule fires on a rubber-band overscroll (y 5260, not prevented) one stroke BEFORE g0's
//   jack opens the menu. The recorder does see the page's preventDefault (1370 prevented moves in those records, every
//   one at the pin), and g0's jack prevents every move that opens or closes it (k(n) then preventDefault, g0.0f JS 14402,
//   14409-14413), so prevented moves define the triggers; the end rule is only the fallback.
// Per trigger the TWEEN WINDOW is [t, t + 700 ms]; its frames are the segment's rAF rows with t inside (all of them:
// the page is still, so p161's "y changed" filter would drop every frame).
// METRICS (per counted run)
//   O1.f2: the first open trigger after load; f1 = dt of the first frame at or after the trigger, f2 = the next frame's
//     dt (p153's firstOpen shape on the time trigger).
//   open tween frames (the D2/D3 population, replacing p161's open-0 frames): every frame in every open window except the
//     first open's (O1 is D1's): n, median dt, share with dt > 34 and the twins > 30 / > 38, and > 50 (descriptive).
//   Descriptive: the same for close windows; trigger counts per run (open, close), which must match between arms.
// DECISION: p161's decide() unchanged (D1 +4 ms, D2 +4 ms, D3 at 34/30/38; PASS / FAIL / OPEN).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { holdStatus } = await import(pathToFileURL(join(root, 'fixes', 'end-morph-p1', 'phone', 'p153-read.mjs')).href);
// med, BOUND_MS and decide copied verbatim from p161-read.mjs 48-49, 60-74 (importing it would run its CLI on our argv)
export const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export const BOUND_MS = 4;
export function decide(C, V) { // C, V: arrays of per-run { f2, medianDt, share }
  const f2C = C.map((r) => r.f2).filter((x) => x != null), f2V = V.map((r) => r.f2).filter((x) => x != null);
  const d1 = f2C.length >= 3 && f2V.length >= 3 ? { diff: med(f2V) - med(f2C), ok: med(f2V) - med(f2C) <= BOUND_MS + 1e-9 } : { diff: null, ok: null };
  const mC = C.map((r) => r.medianDt).filter((x) => x != null), mV = V.map((r) => r.medianDt).filter((x) => x != null);
  const d2 = mC.length >= 3 && mV.length >= 3 ? { diff: med(mV) - med(mC), ok: med(mV) - med(mC) <= BOUND_MS + 1e-9 } : { diff: null, ok: null };
  const d3 = {};
  for (const k of [34, 30, 38]) {
    const c = C.map((r) => r.share?.[k]).filter((x) => x != null), v = V.map((r) => r.share?.[k]).filter((x) => x != null);
    d3[k] = c.length < 3 || v.length < 3 ? 'open' : med(v) <= med(c) ? 'le' : Math.min(...v) > Math.max(...c) ? 'worse' : 'open';
  }
  const d3v = Object.values(d3);
  const fail = d1.ok === false || d2.ok === false || d3v.every((x) => x === 'worse');
  const pass = d1.ok === true && d2.ok === true && d3v.every((x) => x === 'le');
  return { d1, d2, d3, decision: fail ? 'FAIL' : pass ? 'PASS' : 'OPEN' };
}
export const WINDOW_MS = 700, END_SLACK = 8;
export function triggers(seg) {
  const docH = seg.docH1 ?? seg.docH ?? 0, ih = Math.max(...(seg.frames ?? []).map((r) => r[3]), 0) || seg.vh0 || 0;
  const out = []; let open = false, prevY = null;
  const usePv = (seg.touches ?? []).some((r) => r[1] === 'm' && r[4] === 1); // the recorder saw the page's preventDefault
  for (const r of seg.touches ?? []) {
    const [t, kind, , , pv, sy, cy] = r;
    if (kind === 's') { prevY = cy; continue; }
    if (kind === 'e' || kind === 'c') { prevY = null; continue; }
    if (kind !== 'm' || prevY == null || cy == null) continue;
    const d = prevY - cy; prevY = cy;
    if (!open && d > 0 && (usePv ? pv === 1 : sy >= docH - ih - END_SLACK)) { out.push({ t, kind: 'open' }); open = true; }
    else if (open && d < 0 && (usePv ? pv === 1 : true)) { out.push({ t, kind: 'close' }); open = false; }
  }
  return out;
}
const winFrames = (seg, t) => (seg.frames ?? []).filter((r) => r[0] >= t && r[0] <= t + WINDOW_MS);
const stats = (dts) => {
  const sh = (k) => (dts.length ? +(dts.filter((d) => d > k).length / dts.length).toFixed(4) : null);
  return { n: dts.length, medianDt: med(dts), share: { 34: sh(34), 30: sh(30), 38: sh(38), 50: sh(50) } };
};
export function runMetrics(seg) {
  const tr = triggers(seg), opens = tr.filter((x) => x.kind === 'open'), closes = tr.filter((x) => x.kind === 'close');
  const o1 = opens[0] ? winFrames(seg, opens[0].t) : [];
  const later = opens.slice(1).flatMap((x) => winFrames(seg, x.t).map((r) => r[1]));
  const cl = closes.flatMap((x) => winFrames(seg, x.t).map((r) => r[1]));
  return { f1: o1[0]?.[1] ?? null, f2: o1[1]?.[1] ?? null, nOpen: opens.length, nClose: closes.length, dts: later, ...stats(later), close: stats(cl) };
}
function selftest() {
  // docH 2000, ih 800: the end is scrollY >= 1192. Contact 1 at the end moves up (open), contact 2 moves down (close),
  // contact 3 starts above the end and moves up (no open), contact 4 at the end moves up again (open 2).
  const fr = (t, dt) => [t, dt, 1200, 800];
  const seg = { docH: 2000, frames: [fr(0, 16), fr(100, 16), fr(116, 40), fr(150, 20), fr(800, 16), fr(1000, 16), fr(1016, 36), fr(1500, 16), fr(2000, 16), fr(2016, 31), fr(2050, 39), fr(2800, 16)],
    touches: [[90, 's', 1, 1, 0, 1200, 500], [100, 'm', 1, 1, 0, 1200, 480], [110, 'm', 1, 1, 0, 1200, 460], [200, 'e', 0, 1, 0, 1200, 460],
      [990, 's', 1, 1, 0, 1200, 300], [1000, 'm', 1, 1, 0, 1200, 340], [1100, 'e', 0, 1, 0, 1200, 340],
      [1490, 's', 1, 1, 0, 900, 500], [1500, 'm', 1, 1, 0, 900, 450], [1600, 'e', 0, 1, 0, 900, 450],
      [1990, 's', 1, 1, 0, 1200, 500], [2000, 'm', 1, 1, 0, 1200, 470], [2100, 'e', 0, 1, 0, 1200, 470]] };
  // contact 3 is above the end while closed: no trigger (the state was closed by contact 2)
  const tr = triggers(seg), m = runMetrics(seg);
  const P = (f2, md, s) => ({ f2, medianDt: md, share: { 34: s, 30: s, 38: s } });
  const ok = [
    ['triggers', JSON.stringify(tr.map((x) => x.kind + '@' + x.t)) === JSON.stringify(['open@100', 'close@1000', 'open@2000'])],
    ['O1 f1 f2', m.f1 === 16 && m.f2 === 40],
    ['later open frames', JSON.stringify(m.dts) === JSON.stringify([16, 31, 39]) && m.medianDt === 31],
    ['shares', m.share[34] === 0.3333 && m.share[30] === 0.6667 && m.share[38] === 0.3333],
    ['close window', m.close.n === 3 && m.close.medianDt === 16],
    ['prevented open below the end (P-164 Simulator shape)', JSON.stringify(triggers({ docH: 5999, docH1: 6035, vh0: 775,
      touches: [[-30, 's', 1, 0, 0, 5200, 700], [-20, 'm', 1, 0, 0, 5260, 650], [-10, 'e', 0, 0, 0, 5260, 650],
        [0, 's', 1, 0, 0, 5213, 681], [10, 'm', 1, 1, 1, 5213, 681], [20, 'm', 1, 1, 1, 5213, 680], [30, 'e', 0, 0, 0, 5213, 600],
        [40, 's', 1, 0, 0, 5213, 300], [50, 'm', 1, 1, 1, 5213, 330], [60, 'e', 0, 0, 0, 5213, 330],
        [70, 's', 1, 0, 0, 4000, 500], [80, 'm', 1, 0, 0, 4000, 450], [90, 'e', 0, 0, 0, 4000, 450]] }).map((x) => x.kind + '@' + x.t)) === JSON.stringify(['open@20', 'close@50'])],
    ['decide pass', decide([P(30, 20, 0.1), P(28, 21, 0.1), P(30, 19, 0.2)], [P(32, 22, 0.1), P(31, 20, 0.0), P(33, 23, 0.1)]).decision === 'PASS'],
    ['decide fail', decide([P(30, 20, 0.1), P(28, 21, 0.1), P(30, 19, 0.2)], [P(45, 20, 0.1), P(44, 20, 0.0), P(46, 20, 0.1)]).decision === 'FAIL'],
  ];
  const bad = ok.filter(([, v]) => !v);
  console.log(bad.length ? 'SELFTEST FAIL ' + bad.map(([k]) => k).join(', ') : `SELFTEST ok (${ok.length} checks)`);
  process.exitCode = bad.length ? 1 : 0;
}
const argv = process.argv.slice(2);
if (argv[0] === '--selftest') selftest();
else if (argv[0]) {
  const dir = argv[0], ri = argv.indexOf('--runs');
  const names = ri > 0 ? argv[ri + 1].split(',') : ['EC1', 'EV1', 'EV2', 'EC2', 'EC3', 'EV3', 'EV4', 'EC4'];
  const logs = {}; const ld = join(dir, '..');
  for (const f of readdirSync(ld).filter((f) => /^hold-H\d+\.log$/.test(f))) logs[f.slice(5, -4)] = readFileSync(join(ld, f), 'utf8');
  const hs = holdStatus(logs);
  const out = { runs: {}, holds: hs };
  for (const nm of names) {
    let use = nm;
    if (!(hs[nm]?.valid && existsSync(join(dir, `g-${nm}.json`))) && hs[nm + 'r']?.valid && existsSync(join(dir, `g-${nm}r.json`))) use = nm + 'r';
    const f = join(dir, `g-${use}.json`);
    if (!existsSync(f)) { console.log(nm, 'missing'); continue; }
    if (!hs[use]?.valid) { console.log(nm, `NOT COUNTED: ${hs[use]?.why ?? 'no hold log names it'}`); continue; }
    const g = JSON.parse(readFileSync(f, 'utf8')), m = runMetrics(g.run.segments[0]);
    out.runs[nm] = { file: use, ...m };
    console.log(`${nm}${use !== nm ? ' (' + use + ')' : ''} triggers open ${m.nOpen} close ${m.nClose} | O1 f1 ${m.f1} f2 ${m.f2} | open tween n ${m.n} median ${m.medianDt} >34 ${m.share[34]} (>30 ${m.share[30]} >38 ${m.share[38]}) >50 ${m.share[50]} | close tween n ${m.close.n} median ${m.close.medianDt} >34 ${m.close.share[34]}`);
  }
  const arm = (re) => Object.entries(out.runs).filter(([k]) => re.test(k)).map(([, r]) => r);
  const C = arm(/^EC/), V = arm(/^EV/);
  out.decision = decide(C, V);
  const st = (a) => `median ${med(a)} (${a.length ? Math.min(...a) + '-' + Math.max(...a) : 'none'})`;
  console.log(`triggers per run: C open ${C.map((r) => r.nOpen).join(',')} close ${C.map((r) => r.nClose).join(',')} | V open ${V.map((r) => r.nOpen).join(',')} close ${V.map((r) => r.nClose).join(',')}`);
  console.log(`D1 O1.f2 C ${st(C.map((r) => r.f2).filter((x) => x != null))} V ${st(V.map((r) => r.f2).filter((x) => x != null))} diff ${out.decision.d1.diff} -> ${out.decision.d1.ok === null ? 'INSUFFICIENT' : out.decision.d1.ok ? 'within +4' : 'OVER +4'}`);
  console.log(`D2 open tween median dt C ${st(C.map((r) => r.medianDt).filter((x) => x != null))} V ${st(V.map((r) => r.medianDt).filter((x) => x != null))} diff ${out.decision.d2.diff} -> ${out.decision.d2.ok === null ? 'INSUFFICIENT' : out.decision.d2.ok ? 'within +4' : 'OVER +4'}`);
  console.log(`D3 open tween share >34/>30/>38 C ${[34, 30, 38].map((k) => med(C.map((r) => r.share[k]))).join('/')} V ${[34, 30, 38].map((k) => med(V.map((r) => r.share[k]))).join('/')} -> ${JSON.stringify(out.decision.d3)}`);
  console.log(`descriptive: close tween median dt C ${st(C.map((r) => r.close.medianDt).filter((x) => x != null))} V ${st(V.map((r) => r.close.medianDt).filter((x) => x != null))}`);
  console.log(`DECISION ${out.decision.decision}`);
  const ji = argv.indexOf('--json'); if (ji > 0) writeFileSync(argv[ji + 1], JSON.stringify(out, null, 1));
} else console.log('usage: see header');
