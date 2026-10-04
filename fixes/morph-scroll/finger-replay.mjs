#!/usr/bin/env node
// PR-018 rev 7c D card: replay rev 7c's lift-off finger rule offline on recorded swipes (no device, no Chrome).
//   node fixes/morph-scroll/finger-replay.mjs <capture.json>...
// For each swipe (finger-analyze.mjs's rules: outcome hit / back / mid, heading = the end the swipe headed for) this
// recomputes, from the recorded passive touch events, what rev 7c's __msTouchEv would hold at touchend:
//   touchstart: __msFn = 0, __msFv = 0, __msFy = clientY, __msFt = timeStamp
//   touchmove (timeStamp s > __msFt): s - __msFt > 50 ? (__msFv = 0, __msFn = 0)
//     : (__msFv = (__msFn ? 0.5 * __msFv : 0) + (__msFn ? 0.5 : 1) * (__msFy - clientY) / max(1, s - __msFt), __msFn++);
//     __msFy = clientY, __msFt = s
//   touchend: __msFl = __msFn && s - __msFt < 50 && |__msFv| >= 0.3 ? sign(__msFv) : 0
// and whether __msSettle would commit on it: e (p at touchend, from the touch record's scrollY) in (-0.1, 1.1) and
// (Fl > 0 ? e < 0.9 : e > 0.1); the commit goes to Fl > 0 ? open : closed. Source: fixes/morph-scroll/delta.diff
// (__msTouchEv, __msSettle). Mirrors the code as of rev 7c (ms-428961bda278); change both together.
import { readFileSync } from 'node:fs';
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const tot = {};
for (const f of files) {
  const r = JSON.parse(readFileSync(f, 'utf8')), fr = r.frames, tc = r.touches;
  const lvh = Math.max(...fr.map((x) => x[3]));
  const pOf = (x) => (x[2] - (r.docH - x[3] - lvh)) / lvh;
  const frAt = (t) => { let q = fr[0]; for (const x of fr) { if (x[0] > t) break; q = x; } return q; };
  const stamp = (x) => (x[7] ?? x[0]);
  const rows = [];
  for (let i = 0; i < tc.length; i++) {
    if (tc[i][1] !== 's' || tc[i][2] !== 1) continue;
    let j = i + 1; while (j < tc.length && !((tc[j][1] === 'e' || tc[j][1] === 'c') && tc[j][2] === 0)) j++;
    if (j >= tc.length) break;
    // outcome, as finger-analyze.mjs
    const ts = tc[i][0], tl = tc[j][0], nextS = tc.slice(j + 1).find((x) => x[1] === 's');
    const f0 = frAt(ts), fl = frAt(tl), p0 = pOf(f0);
    if (p0 < -0.15 || p0 > 1.15) continue;
    const fingerDy = (tc[j][6] ?? tc[i][6]) - tc[i][6], pageDy = fl[2] - f0[2];
    const dir = Math.abs(pageDy) >= 2 ? Math.sign(pageDy) : -Math.sign(fingerDy);
    const after = fr.filter((x) => x[0] > tl && (!nextS || x[0] < nextS[0]));
    let rest = null, lc = tl; for (let k = 1; k < after.length; k++) { if (after[k][2] !== after[k - 1][2]) lc = after[k][0]; else if (after[k][0] - lc >= 300) { rest = after[k]; break; } }
    rest = rest || after.at(-1) || fl; const pr = pOf(rest);
    const sO = p0 >= 0.98, sC = p0 <= 0.02, aO = pr >= 0.98, aC = pr <= 0.02;
    let out; if ((dir > 0 && sO) || (dir < 0 && sC) || dir === 0) out = 'noop'; else if ((dir > 0 && aO) || (dir < 0 && aC)) out = 'hit'; else if ((dir > 0 && aC) || (dir < 0 && aO)) out = 'back'; else out = 'mid';
    if (out === 'noop') continue;
    // rev 7c's finger state at touchend
    let Fn = 0, Fv = 0, Fy = tc[i][6], Ft = stamp(tc[i]);
    for (let k = i + 1; k < j; k++) {
      const x = tc[k]; if (x[1] !== 'm' || x[6] == null) continue; const s = stamp(x);
      if (!(s > Ft)) continue;
      if (s - Ft > 50) { Fv = 0; Fn = 0; } else { Fv = (Fn ? 0.5 * Fv : 0) + ((Fn ? 0.5 : 1) * (Fy - x[6])) / Math.max(1, s - Ft); Fn++; }
      Fy = x[6]; Ft = s;
    }
    const sEnd = stamp(tc[j]);
    const Fl = Fn && sEnd - Ft < 50 && Math.abs(Fv) >= 0.3 ? Math.sign(Fv) : 0;
    const e = pOf([0, 0, tc[j][5], fl[3]]);
    const commits = Fl !== 0 && e > -0.1 && e < 1.1 && (Fl > 0 ? e < 0.9 : e > 0.1);
    const verdict = !Fl ? 'no finger rule (Fl 0)' : Fl !== dir ? 'points the WRONG way' : commits ? 'commits to the intended end' : 'right way, but no commit (e outside its range)';
    rows.push({ out, verdict, e: +e.toFixed(2), Fv: +Fv.toFixed(2) });
  }
  const by = {};
  for (const x of rows) { const k = `${x.out} -> ${x.verdict}`; by[k] = (by[k] || 0) + 1; tot[k] = (tot[k] || 0) + 1; }
  console.log(r.label); for (const [k, n] of Object.entries(by).sort()) console.log(`  ${k}: ${n}`);
  for (const x of rows) if (x.out !== 'hit' && x.verdict !== 'commits to the intended end') console.log(`    ${x.out} e ${x.e} Fv ${x.Fv}: ${x.verdict}`);
}
if (files.length > 1) { console.log('all'); for (const [k, n] of Object.entries(tot).sort()) console.log(`  ${k}: ${n}`); }
