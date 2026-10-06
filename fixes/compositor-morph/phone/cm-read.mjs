#!/usr/bin/env node
// compositor-morph phone reader (arch-compositor-morph; a pure reader: no device, no measurement; counts, not ms).
// Question: in iOS Safari, under a WDA finger gesture (G, the E procedure g-fastshort-v1.json as P-152/P-155), does a
// morph frame still recalculate style, lay out and paint on the main thread? C = v9-final, V = compositor-only morph.
//   node fixes/compositor-morph/phone/cm-read.mjs <runs folder> [--json out.json] [--runs EC1,EV1,...]
//   node fixes/compositor-morph/phone/cm-read.mjs --selftest
// Per counted run (g-<run>.json + tl-<run>.json; run gates from P-129's readRun, role E):
//   morph frames = rows in the lastScreen band whose scrollY differs from the previous frame and whose m is in (0, 1)
//   (m = (scrollY - (docH - 2 ih)) / ih, as P-155's mOf); for each frame window (t - dt, t] the Timeline records that
//   start in it: Layout, Paint, RecalculateStyles (counts; Paint area from data.clip when present).
//   Per run: n frames; per frame mean Layout / Paint / RecalculateStyles; share of frames with >= 1 Layout / Paint.
// Predictions and decision rules: fixes/compositor-morph/README.md "Phone card" (frozen before data).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { readRun, flatten } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const TYPES = ['Layout', 'Paint', 'RecalculateStyles'];

export function mOf(seg, i) { const fr = seg.frames, docH = seg.docH1 ?? seg.docH ?? 0; const [, , y, ih] = fr[i]; return (y - (docH - 2 * ih)) / ih; }
/** Morph frames of one run and their record counts. recs: flattened Timeline ({type, a, b, data}). */
export function morphCounts(seg, rows, recs) {
  const fr = seg.frames;
  const mf = rows.filter((x) => x.band === 'lastScreen' && x.i > 0 && fr[x.i][2] !== fr[x.i - 1][2]).filter((x) => { const m = mOf(seg, x.i); return m > 0 && m < 1; });
  return countIn(fr, mf, recs);
}
/** Probe-page runs (A<v>, uncounted attribution): every frame whose scrollY moved (any band), dt from the row or the stamps. */
export function movedCounts(seg, recs) {
  const fr = seg.frames, mf = [];
  for (let i = 1; i < fr.length; i++) if (fr[i][2] !== fr[i - 1][2]) mf.push({ i, dt: fr[i][0] - fr[i - 1][0] });
  return countIn(fr, mf, recs);
}
function countIn(fr, mf, recs) {
  const by = TYPES.map((t) => recs.filter((q) => q.type === t).map((q) => q.a).sort((p, q) => p - q));
  const inWin = (arr, lo, hi) => { let n = 0; for (const a of arr) { if (a > hi) break; if (a > lo) n++; } return n; };
  const per = mf.map((x) => { const t = fr[x.i][0]; return by.map((arr) => inWin(arr, t - x.dt, t)); });
  const n = per.length, sum = (k) => per.reduce((s, p) => s + p[k], 0), any = (k) => per.filter((p) => p[k] > 0).length;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return { n, perFrame: Object.fromEntries(TYPES.map((t, k) => [t, n ? r3(sum(k) / n) : null])), share: Object.fromEntries(TYPES.map((t, k) => [t, n ? r3(any(k) / n) : null])) };
}
function selftest() {
  let k = 0; const ok = (a, b, m) => { k++; if (JSON.stringify(a) !== JSON.stringify(b)) { console.log(`SELFTEST FAIL ${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); process.exit(1); } };
  // ih 800, docH 6800: the zone (m 0..1) is scrollY 5200..6000
  const seg = { docH: 6800, frames: [[0, 16, 5100, 800], [16, 16, 5300, 800], [32, 16, 5500, 800], [48, 16, 5500, 800], [64, 16, 6000, 800], [80, 16, 5900, 800]] };
  const rows = [1, 2, 3, 4, 5].map((i) => ({ i, dt: 16, band: 'lastScreen' }));
  const recs = [{ type: 'Layout', a: 20 }, { type: 'Paint', a: 21 }, { type: 'RecalculateStyles', a: 22 }, { type: 'RecalculateStyles', a: 30 }, { type: 'Layout', a: 40 }, { type: 'Paint', a: 70 }, { type: 'Layout', a: 75 }];
  const c = morphCounts(seg, rows, recs);
  ok(c.n, 3, 'morph frames: moved and 0 < m < 1 (5300, 5500, 5900; 5500 again did not move; 6000 is m 1)');
  ok(c.perFrame, { Layout: 0.667, Paint: 0.667, RecalculateStyles: 0.667 }, 'per frame: (0,16] nothing; (16,32] L P S S; (64,80] P L');
  ok(c.share, { Layout: 0.667, Paint: 0.667, RecalculateStyles: 0.333 }, 'share of frames with >= 1');
  ok(morphCounts(seg, rows.map((r) => ({ ...r, band: 'middle' })), recs).n, 0, 'lastScreen only');
  const mc = movedCounts(seg, recs);
  ok(mc.n, 4, 'probe: every moved frame (5300, 5500, 6000, 5900)');
  ok(mc.perFrame, { Layout: 0.5, Paint: 0.5, RecalculateStyles: 0.5 }, 'probe per frame: (0,16] none, (16,32] L P S S, (48,64] nothing, (64,80] P L');
  console.log(`SELFTEST ok (${k} checks)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/compositor-morph/phone/cm-read.mjs <folder> [--json out.json] [--runs a,b] | --selftest'); process.exit(a[0] ? 0 : 2); }
  const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
  const names = a.includes('--runs') ? a[a.indexOf('--runs') + 1].split(',') : ['EC1', 'EV1', 'EV2', 'EC2', 'EC3', 'EV3', 'EV4', 'EC4'];
  const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const out = { runs: {}, invalid: {} };
  for (const nm of names) {
    const g = load(`g-${nm}.json`), tl = load(`tl-${nm}.json`);
    if (!g || !tl) { out.invalid[nm] = [g ? 'no tl' : 'no record']; continue; }
    if (/^A/.test(nm)) { const x = (out.runs[nm] = movedCounts(g.run.segments[0], flatten(tl.recs, tl.offsetMs))); console.log(`  ${nm} (probe, ungated) moved frames ${x.n} | per frame L ${x.perFrame.Layout} P ${x.perFrame.Paint} S ${x.perFrame.RecalculateStyles} | share L ${x.share.Layout} P ${x.share.Paint} S ${x.share.RecalculateStyles}`); continue; }
    const r = readRun(g, tl, 'E');
    if (r.why.length) { out.invalid[nm] = r.why; continue; }
    const seg = g.run.segments[0];
    out.runs[nm] = morphCounts(seg, r.rows, flatten(tl.recs, tl.offsetMs));
    const x = out.runs[nm];
    console.log(`  ${nm} morph frames ${x.n} | per frame L ${x.perFrame.Layout} P ${x.perFrame.Paint} S ${x.perFrame.RecalculateStyles} | share L ${x.share.Layout} P ${x.share.Paint} S ${x.share.RecalculateStyles}`);
  }
  for (const [nm, w] of Object.entries(out.invalid)) console.log(`  INVALID ${nm}: ${w.join('; ')}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}
