#!/usr/bin/env node
// end-morph (fix-end-morph): a DESCRIPTIVE re-read of P-137's phone records (fix-end-bg's block, G driver, xcode-serious;
// card and verdict in fixes/end-bg/README.md section 5). Decides nothing. Question: where in the morph do P-137's slow
// end frames sit? For each metric frame of fixes/end-bg/phone/p137-read.mjs (lastScreen band, after a touchend) with
// dt > 34 ms: the morph value m at that frame, recomputed with the page's own formula (__msTick, JS 14474-14478:
// e = (y - (docH - innerHeight - t)) / t, clamped; t = the .fw-ms-end runway = 100lvh, taken as the largest innerHeight
// seen in the run), and whether the frame sits on a toolbar step (readRun's tb). Bins: m = 0 (#platform's last screen,
// before the runway), 0 < m < 0.55 (#platform fading and blurring: QM(r) = 1 - m/0.55), 0.55 <= m < 1 (#platform gone,
// panel still growing), m = 1 (open, at rest).
//   node fixes/end-morph/p137-mbins.mjs <p137 runs folder>
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { readRun } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const dir = process.argv[2];
if (!dir) { console.log('usage: node fixes/end-morph/p137-mbins.mjs <out/p137/runs>'); process.exit(2); }
const BINS = ['m=0', '0<m<0.55', '0.55<=m<1', 'm=1'];
const bin = (m) => (m <= 0 ? 'm=0' : m < 0.55 ? '0<m<0.55' : m < 1 ? '0.55<=m<1' : 'm=1');
const tot = {};
for (const arm of ['C', 'V']) {
  tot[arm] = { allTb: Object.fromEntries(BINS.map((b) => [b, 0])), all: Object.fromEntries(BINS.map((b) => [b, 0])), slow: Object.fromEntries(BINS.map((b) => [b, 0])), slowTb: Object.fromEntries(BINS.map((b) => [b, 0])) };
  for (let k = 1; k <= 4; k++) {
    const name = `E${arm}${k}`;
    if (!existsSync(join(dir, `g-${name}.json`))) continue;
    const g = JSON.parse(readFileSync(join(dir, `g-${name}.json`), 'utf8'));
    const tl = existsSync(join(dir, `tl-${name}.json`)) ? JSON.parse(readFileSync(join(dir, `tl-${name}.json`), 'utf8')) : null;
    const r = readRun(g, tl, 'E');
    if (r.why.length) { console.log(name, 'INVALID', r.why.join('; ')); continue; }
    const seg = g.run.segments[0], fr = seg.frames, tc = seg.touches || [];
    const t = Math.max(...fr.map((f) => f[3]));
    const docH = seg.docH1 || seg.docH;
    const rows = r.rows.filter((x) => x.band === 'lastScreen').filter((x) => { const tt = fr[x.i][0]; let last = null; for (const e of tc) if (e[0] <= tt) last = e; return last && last[1] === 'e'; });
    const per = { all: {}, slow: {}, slowTb: {} };
    for (const x of rows) {
      const [, , y, ih] = fr[x.i];
      const m = Math.min(1, Math.max(0, (y - (docH - ih - t)) / t));
      const b = bin(m);
      per.all[b] = (per.all[b] || 0) + 1; tot[arm].all[b]++; if (x.tb) tot[arm].allTb[b]++;
      if (x.dt > 34) { per.slow[b] = (per.slow[b] || 0) + 1; tot[arm].slow[b]++; if (x.tb) { per.slowTb[b] = (per.slowTb[b] || 0) + 1; tot[arm].slowTb[b]++; } }
    }
    console.log(name, 't', t, 'docH', docH, 'frames', JSON.stringify(per.all), 'dt>34', JSON.stringify(per.slow), 'of them on a toolbar step', JSON.stringify(per.slowTb));
  }
}
for (const arm of ['C', 'V']) console.log(`TOTAL ${arm}: frames ${JSON.stringify(tot[arm].all)} (on a toolbar step ${JSON.stringify(tot[arm].allTb)}) | dt>34 ${JSON.stringify(tot[arm].slow)} | dt>34 on a toolbar step ${JSON.stringify(tot[arm].slowTb)}`);
