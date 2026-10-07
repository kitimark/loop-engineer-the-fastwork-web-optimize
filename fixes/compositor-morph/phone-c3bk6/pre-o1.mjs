#!/usr/bin/env node
// P-161 descriptive (arch-compositor-morph; a pure reader, no device): was K6's pre on at O1? For each counted run
// (E<arm><k>), the approach pauses before O1 (runs of frames with the same scrollY) whose m lies in (-1, 0] (K6 turns
// pre on 200 ms into such a pause), with the Timeline Paint / Composite records inside each pause; and O1's own f1+f2
// Paint count and Composite ms. A pre build shows as a Paint burst (Simulator: 10-16 paints) in a pause in range, in V
// only; a pre-built O1 paints fewer rects than C's (Simulator: 7-16 vs 19-21).
//   node fixes/compositor-morph/phone-c3bk6/pre-o1.mjs out/cmp163/runs [--json out.json]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..', '..');
const { flatten } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const { opens } = await import(pathToFileURL(join(root, 'fixes', 'end-morph-p1', 'phone', 'p153-read.mjs')).href);
const dir = process.argv[2], jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
if (!dir) { console.log('usage: node fixes/compositor-morph/phone-c3bk6/pre-o1.mjs <runs folder> [--json out.json]'); process.exit(2); }
const r1 = (x) => Math.round(x * 10) / 10;
const out = {};
for (const arm of ['C', 'V']) for (let k = 1; k <= 4; k++) {
  const nm = `E${arm}${k}`, gf = join(dir, `g-${nm}.json`), tf = join(dir, `tl-${nm}.json`);
  if (!existsSync(gf) || !existsSync(tf)) continue;
  const g = JSON.parse(readFileSync(gf, 'utf8')), tl = JSON.parse(readFileSync(tf, 'utf8'));
  const seg = g.run.segments[0], fr = seg.frames, docH = seg.docH1 ?? seg.docH ?? 0;
  const lvh = Math.max(...fr.map((f) => f[3]));
  const mOf = (f) => (f[2] - (docH - f[3] - lvh)) / lvh;
  const o = opens(g)[0];
  if (!o) { out[nm] = { error: 'no open' }; continue; }
  const flat = flatten(tl.recs, tl.offsetMs);
  const within = (lo, hi, type) => flat.filter((r) => r.type === type && r.a >= lo && r.a < hi);
  // pauses before O1: maximal runs of >= 3 frames with the same scrollY, from the last frame at m <= -1.5
  let i0 = o.i - 1; while (i0 > 0 && mOf(fr[i0]) > -1.5) i0--;
  const pauses = [];
  for (let i = i0 + 1; i < o.i; ) {
    let j = i; while (j + 1 < o.i && fr[j + 1][2] === fr[i][2]) j++;
    if (j - i >= 2) {
      const lo = fr[i][0], hi = fr[j][0], m = mOf(fr[i]);
      const P = within(lo, hi, 'Paint'), C = within(lo, hi, 'Composite');
      pauses.push({ m: +m.toFixed(3), ms: Math.round(hi - lo), inRange: m > -1 && m <= 0, paints: P.length, composite: r1(C.reduce((s, r) => s + (r.b - r.a), 0)), maxComposite: r1(C.reduce((s, r) => Math.max(s, r.b - r.a), 0)) });
    }
    i = j + 1;
  }
  const lo = fr[o.i][0] - fr[o.i][1], hi = o.i + 1 < fr.length ? fr[o.i + 1][0] : fr[o.i][0];
  const oP = within(lo, hi, 'Paint'), oC = within(lo, hi, 'Composite');
  out[nm] = { o1: { f1: o.f1, f2: o.f2, paints: oP.length, composite: r1(oC.reduce((s, r) => s + (r.b - r.a), 0)) }, pauses };
  const inR = pauses.filter((p) => p.inRange);
  console.log(`${nm}: O1 f1 ${r1(o.f1)} f2 ${r1(o.f2)} ms, f1+f2 paints ${oP.length}, composite ${out[nm].o1.composite} ms | pauses in (-1, 0]: ${inR.length ? inR.map((p) => `m ${p.m} ${p.ms} ms paints ${p.paints} composite ${p.composite} (max ${p.maxComposite})`).join('; ') : 'none'} | other pauses ${pauses.length - inR.length}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
