#!/usr/bin/env node
// end-morph (fix-end-morph): DESCRIPTIVE re-read of P-137's phone Timeline files (fix-end-bg's signed block, G driver,
// xcode-serious; fixes/end-bg/README.md section 5). Decides nothing; no new measurement. For the metric frames of
// fixes/end-bg/phone/p137-read.mjs (lastScreen band, after a touchend), per arm C / V and per cell (morph bin x toolbar
// step yes/no): frames, slow (dt > 34), and the medians over frames of the Timeline work inside the frame gap [t - dt, t]
// (research/serious-heat/p129-read.mjs flatten/alignment): Paint ms (sum of top-level Paint records, nested ones not
// double counted), Paint count, painted area (sum of clip quads, kilo css px), Layout ms / count, RecalculateStyles ms,
// Composite ms, script ms (FunctionCall/EventDispatch/TimerFire/FireAnimationFrame/ObserverCallback). The biggest paint
// rects (size@position, page coords) over the slow toolbar-step frames of C are listed too.
//   node fixes/end-morph/p137-tlwork.mjs <p137 runs folder>
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { readRun, flatten } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const dir = process.argv[2];
if (!dir) { console.log('usage: node fixes/end-morph/p137-tlwork.mjs <out/p137/runs>'); process.exit(2); }
const bin = (m) => (m <= 0 ? 'm0' : m < 0.55 ? 'fade' : m < 1 ? 'panel' : 'm1');
const SCRIPT = new Set(['FunctionCall', 'EventDispatch', 'TimerFire', 'FireAnimationFrame', 'ObserverCallback']);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const quad = (c) => { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; const x = Math.min(...xs), y = Math.min(...ys); return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(...xs) - x), h: Math.round(Math.max(...ys) - y) }; };
const cells = {}; const rects = {};
for (const arm of ['C', 'V']) for (let k = 1; k <= 4; k++) {
  const name = `E${arm}${k}`;
  if (!existsSync(join(dir, `g-${name}.json`))) continue;
  const g = JSON.parse(readFileSync(join(dir, `g-${name}.json`), 'utf8'));
  const tl = JSON.parse(readFileSync(join(dir, `tl-${name}.json`), 'utf8'));
  const r = readRun(g, tl, 'E');
  if (r.why.length) { console.log(name, 'INVALID', r.why.join('; ')); continue; }
  const seg = g.run.segments[0], fr = seg.frames, tc = seg.touches || [];
  const t = Math.max(...fr.map((f) => f[3])), docH = seg.docH1 || seg.docH;
  // top-level-only records (a Paint inside a Paint is not double counted): walk the raw tree
  const flat = [];
  const off = tl.offsetMs;
  const walk = (rec, inPaint, inLayout) => {
    const a = rec.startTime * 1000 - off, b = (rec.endTime ?? rec.startTime) * 1000 - off;
    flat.push({ type: rec.type, a, b, data: rec.data || {}, top: (rec.type === 'Paint' && !inPaint) || (rec.type === 'Layout' && !inLayout) || !['Paint', 'Layout'].includes(rec.type) });
    for (const c of rec.children || []) walk(c, inPaint || rec.type === 'Paint', inLayout || rec.type === 'Layout');
  };
  for (const rec of tl.recs) walk(rec, false, false);
  flat.sort((x, y) => x.a - y.a);
  const rows = r.rows.filter((x) => x.band === 'lastScreen').filter((x) => { const tt = fr[x.i][0]; let last = null; for (const e of tc) if (e[0] <= tt) last = e; return last && last[1] === 'e'; });
  for (const x of rows) {
    const [ft, dt, y, ih] = fr[x.i];
    const m = Math.min(1, Math.max(0, (y - (docH - ih - t)) / t));
    const key = `${arm} ${bin(m)} ${x.tb ? 'step' : 'no-step'}`;
    const c = (cells[key] ||= { n: 0, slow: 0, paintMs: [], paints: [], kpx: [], layoutMs: [], layouts: [], styleMs: [], compMs: [], scriptMs: [], obs: [] });
    const lo = ft - dt, hi = ft;
    let pm = 0, pn = 0, ar = 0, lm = 0, ln = 0, sm = 0, cm = 0, js = 0, ob = 0; const fr8 = [];
    for (const q of flat) {
      if (q.b <= lo || q.a >= hi) continue;
      const d = Math.min(q.b, hi) - Math.max(q.a, lo);
      if (q.type === 'Paint' && q.top) { pm += d; pn++; if (q.data.clip) { const b = quad(q.data.clip); ar += (b.w * b.h) / 1000; fr8.push(b); } }
      else if (q.type === 'Layout' && q.top) { lm += d; ln++; }
      else if (q.type === 'RecalculateStyles') sm += d;
      else if (q.type === 'Composite') cm += d;
      else if (SCRIPT.has(q.type)) { js += d; if (q.type === 'ObserverCallback') ob++; }
    }
    c.n++; if (dt > 34) c.slow++;
    c.paintMs.push(pm); c.paints.push(pn); c.kpx.push(ar); c.layoutMs.push(lm); c.layouts.push(ln); c.styleMs.push(sm); c.compMs.push(cm); c.scriptMs.push(js); c.obs.push(ob);
    for (const b of fr8) { const k2 = `${b.w}x${b.h}`; const cr = (rects[key] ||= {}); cr[k2] = (cr[k2] || 0) + 1; }
  }
}
console.log('cell (arm, morph bin, toolbar step) | frames | dt>34 | median per frame: paint ms, paints, painted kpx, layout ms, layouts, style ms, composite ms, script ms, observer callbacks (mean)');
for (const [k, c] of Object.entries(cells).sort()) console.log(k.padEnd(20), String(c.n).padStart(4), String(c.slow).padStart(4), '|', r1(med(c.paintMs)), med(c.paints), Math.round(med(c.kpx)), r1(med(c.layoutMs)), med(c.layouts), r1(med(c.styleMs)), r1(med(c.compMs)), r1(med(c.scriptMs)), r1(c.obs.reduce((a, b) => a + b, 0) / c.n));
console.log('paint rects per frame by size (css px), per cell, top 14:');
for (const [k, cr] of Object.entries(rects).sort()) { const n = cells[k].n; console.log('  ' + k.padEnd(18), Object.entries(cr).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([s2, v]) => `${s2}:${(v / n).toFixed(2)}`).join(' ')); }
