#!/usr/bin/env node
// v8-double-drive: summarise dd-probe raw-<vp>.json.
//   node research/v8-double-drive/probe/analyze.mjs out/v8-double-drive/probe-<tag> [phone,desktop]
// Per (element, property) pair with transitions seen: runs per phase, the max runs within one scroll segment
// (>= 3 = retargeted while the driver moved = double drive), the transition's duration/delay, the settle trail
// (transitionend after the scroll stopped, ms), the max gap between computed value and the transition's end
// keyframe (the driven target) while moving, and the scroll range. Geometry: frames where transform-origin changed
// between two samples, with the jump of the element's box not explained by the scroll.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2]; const vps = (process.argv[3] || 'phone,desktop').split(',');
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = {};
for (const vp of vps) {
  const f = join(dir, `raw-${vp}.json`); if (!existsSync(f)) continue;
  const run = JSON.parse(readFileSync(f, 'utf8'));
  const segs = new Map(run.segs.map((s) => [s.k, s]));
  segs.set(1000, { k: 1000, tStop: run.morph.tOpen, t0: run.morph.tOpen }); segs.set(1001, { k: 1001, tStop: run.morph.tClose, t0: run.morph.tClose });
  segs.set(2000, { k: 2000, ...run.up });
  const by = new Map();
  for (const [type, t, y, key, phase, seg, el] of run.ev) {
    let p = by.get(key); if (!p) by.set(key, (p = { key, runs: 0, ends: 0, cancels: 0, perSeg: {}, phases: {}, ys: [], ev: [] }));
    p.ev.push({ type, t, y, phase, seg, el });
    if (type === 'r') { p.runs++; p.perSeg[seg] = (p.perSeg[seg] || 0) + 1; p.phases[phase] = (p.phases[phase] || 0) + 1; p.ys.push(y); }
    else if (type === 'e') p.ends++; else p.cancels++;
  }
  const gaps = new Map();
  for (const [t, y, key, running, gap, phase] of run.samples) {
    const g = gaps.get(key) || { maxGap: 0, frames: 0, runningFrames: 0 }; g.frames++; if (running) g.runningFrames++;
    if (Number.isFinite(gap) && gap > g.maxGap && (phase === 'move' || phase.startsWith('morph') || phase === 'up')) g.maxGap = gap; gaps.set(key, g);
  }
  const rows = [];
  for (const p of by.values()) {
    const meta = run.pairs[p.key] || {}; const segMax = Math.max(0, ...Object.values(p.perSeg));
    // settle trail: per segment with >= 2 runs, the last transitionend after that segment's stop, minus the stop
    const trails = [];
    for (const [seg, n] of Object.entries(p.perSeg)) {
      if (n < 2) continue; const s = segs.get(+seg); if (!s) continue;
      const after = p.ev.filter((e) => e.seg === +seg && e.t >= s.tStop);
      const lastEnd = after.filter((e) => e.type === 'e').at(-1);
      const lastRun = p.ev.filter((e) => e.seg === +seg && e.type === 'r').at(-1);
      if (lastEnd) trails.push({ seg: +seg, trail: Math.round(lastEnd.t - s.tStop), sinceLastRun: Math.round(lastEnd.t - lastRun.t) });
    }
    rows.push({ key: p.key, path: meta.path || '?', prop: meta.prop || p.key.split('|')[1], pseudo: meta.pseudo || '', dur: meta.dur, delay: meta.delay, ease: meta.ease,
      runs: p.runs, cancels: p.cancels, ends: p.ends, segMaxRuns: segMax, phases: p.phases,
      yMin: Math.min(...p.ys), yMax: Math.max(...p.ys), retargeted: segMax >= 3,
      trailMed: med(trails.map((x) => x.trail)), trailMax: trails.length ? Math.max(...trails.map((x) => x.trail)) : null, trails: trails.slice(0, 12),
      maxGap: gaps.get(p.key)?.maxGap ?? null });
  }
  rows.sort((a, b) => (b.retargeted - a.retargeted) || (b.segMaxRuns - a.segMaxRuns));
  // geometry: transform-origin / class switches between consecutive samples of the same selector
  const geo = []; const last = new Map();
  for (const g of run.geo || []) {
    const [t, y, sel, l, top, r, bot, origin, tf, cls] = g; const p = last.get(sel); last.set(sel, g);
    if (!p || t - p[0] > 40) continue;
    if (p[7] !== origin || p[9] !== cls) {
      const pp = (run.geo || []).filter((x) => x[2] === sel && x[0] < p[0]).at(-1); // the frame before, for the normal motion
      const dy = y - p[1]; const dTop = +(top - p[4]).toFixed(1), dBot = +(bot - p[6]).toFixed(1);
      const nTop = pp ? +(p[4] - pp[4]).toFixed(1) : null;
      geo.push({ sel, t, y, dScroll: dy, originFrom: p[7], originTo: origin, clsFrom: p[9], clsTo: cls, tfFrom: p[8], tfTo: tf, dTop, dBot, dLeft: +(l - p[3]).toFixed(1), prevFrameDTop: nTop });
    }
  }
  out[vp] = { served: run.served, end: run.end, errors: run.errors.length, http4xx: run.http4xx.length, pairs: rows, geo };
  console.log(`\n== ${vp} (served ${run.served.js}/${run.served.css}, end ${run.end}, errors ${run.errors.length}, 4xx ${run.http4xx.length})`);
  for (const r of rows) console.log(`${r.retargeted ? 'RETARGET' : '        '} runs ${String(r.runs).padStart(4)} segMax ${String(r.segMaxRuns).padStart(3)} ${r.prop}${r.pseudo} ${r.dur}/${r.delay} trail med ${r.trailMed} max ${r.trailMax} gap ${r.maxGap} y ${r.yMin}-${r.yMax} phases ${JSON.stringify(r.phases)} :: ${r.path.slice(-150)}`);
  console.log(`-- geometry switches (${geo.length})`);
  for (const g of geo.slice(0, 60)) console.log(`${g.sel} y ${g.y} dScroll ${g.dScroll} origin ${g.originFrom} -> ${g.originTo} dTop ${g.dTop} dBot ${g.dBot} dLeft ${g.dLeft} (prev frame dTop ${g.prevFrameDTop}) cls ${g.clsFrom === g.clsTo ? '=' : g.clsFrom + ' -> ' + g.clsTo} tf ${g.tfFrom} -> ${g.tfTo}`);
}
writeFileSync(join(dir, 'summary.json'), JSON.stringify(out, null, 1));
console.log('\nwrote', join(dir, 'summary.json'));
