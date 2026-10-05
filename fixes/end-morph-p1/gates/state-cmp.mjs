// end-morph-p1 (fix-end-morph-p1): read an em-p1-px.mjs px.json and compare, per stop, the STATE of every V load with the
// A loads: F()'s probe point (y, hit element), is-on-dark, data-fw-rv, #platform's --morph-fade / computed opacity /
// visibility. Also checks rev 3's guard: #platform's computed opacity is never 1 at any stop of any load.
// Optional --band <css px>: also re-score the cross-stop pairs on the top band only (rows 0..band), where the nav is.
//   node fixes/end-morph-p1/gates/state-cmp.mjs <px dir> [--band 100]
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { pngPixels, delta, score, aa } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const dir = resolve(process.argv[2]);
const bi = process.argv.indexOf('--band'); const BAND = bi > 0 ? Number(process.argv[bi + 1]) : 0;
const res = JSON.parse(readFileSync(join(dir, 'px.json'), 'utf8'));
const L = Object.fromEntries(res.loads.map((l) => [l.arm, l]));
let diffs = 0, guard = 0, n = 0;
for (const s of L.A.stops) {
  const a = s.state; const row = [s.k.padEnd(7), `m ${String(a.m).slice(0, 6).padEnd(6)}`];
  for (const arm of ['A2', 'V', 'V2']) {
    const b = L[arm]?.stops.find((x) => x.k === s.k)?.state; if (!b) { row.push(`${arm} missing`); continue; }
    const same = a.probe?.hit === b.probe?.hit && a.onDark === b.onDark;
    if (!same) diffs++;
    row.push(`${arm} ${same ? 'same' : 'DIFF'} probeY ${a.probe?.y}->${b.probe?.y} rv ${b.rv}`);
  }
  for (const arm of ['A', 'A2', 'V', 'V2']) { const b = L[arm]?.stops.find((x) => x.k === s.k)?.state; if (b) { n++; if (+b.pOpacity >= 1) guard++; } }
  row.push(`onDark ${a.onDark} pOp A ${a.pOpacity} V ${L.V?.stops.find((x) => x.k === s.k)?.state.pOpacity} pVis ${a.pVis} hit ${a.probe?.hit?.slice(-60)}`);
  console.log(row.join(' | '));
}
console.log(`hit/onDark differences vs A: ${diffs}; #platform computed opacity >= 1 at ${guard} of ${n} load-stops`);
if (BAND) {
  const sh = (arm, k) => join(dir, `${arm}-${k}.png`);
  const crop = (P, rows) => ({ ...P, h: rows, px: P.px.subarray(0, rows * P.w * P.bpp) });
  for (const c of res.cross || []) {
    if (!c.sel) continue;
    const P = Object.fromEntries(Object.entries(c.sel).map(([slot, [arm, k]]) => [slot, pngPixels(readFileSync(sh(arm, k)))]));
    const rows = BAND * res.dpr; const Q = Object.fromEntries(Object.entries(P).map(([s, p]) => [s, crop(p, rows)]));
    const dAV = delta(Q.A, Q.V), dAA = delta(Q.A, Q.A2), dVV = delta(Q.V, Q.V2), dA2V2 = delta(Q.A2, Q.V2), dAV2 = delta(Q.A, Q.V2), dA2V = delta(Q.A2, Q.V);
    const m = dAV.length, dMin = new Uint8Array(m), dMask = new Uint8Array(m);
    for (let p = 0; p < m; p++) { dMin[p] = Math.min(dAV[p], dAV2[p], dA2V[p], dA2V2[p]); dMask[p] = Math.max(dAA[p], dVV[p]); }
    const cs = score(Q.A, Q.V, dMin, dMask, [], res.dpr), av = score(Q.A, Q.V, dAV, dAA, [], res.dpr);
    console.log(`band 0-${BAND} css px | ${c.label}: A~V beyond A/A ${av.beyondCssPx2} css px2 (max ${av.maxLevel}); consistent ${cs.beyondCssPx2} css px2 (max ${cs.maxLevel}); A/A ${JSON.stringify(aa(dAA))}${cs.clusters[0] ? ' top ' + JSON.stringify(cs.clusters[0].bboxCss) : ''}`);
  }
}
