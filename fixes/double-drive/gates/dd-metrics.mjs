#!/usr/bin/env node
// double-drive: before/after numbers from research/v8-double-drive/probe raw-<vp>.json files (dd-probe.mjs / dd-sim.mjs),
// for the two cards this fix changes. No timing claims beyond the probe's own wall clock (Chrome headless, 60 Hz rAF).
//   node fixes/double-drive/gates/dd-metrics.mjs <A probe dir> <V probe dir> [phone,desktop|sim]
// Per card and arm:
// - transform transitions: transitionrun count on the card (all phases), max runs in one scroll segment;
// - drift after a stop: per segment (and the fast scroll up), the card's own movement after the scroll stopped (the
//   page is still, so every px is the card), max edge movement px, and the settle time (last frame an edge moved
//   > 0.1 px, ms after the stop); scale at the stop vs at the end of the hold (from the computed matrix);
// - one-frame jumps: the movement not explained by the motion of the frame before,
//   jump = dEdge - prevDEdge * dScroll / prevDScroll (top and bottom edge, the larger), over consecutive frames; the
//   largest per phase group, and the frames where the class or transform-origin switched.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dirA, dirV] = process.argv.slice(2, 4);
const vps = (process.argv[4] || 'phone,desktop').split(',');
const CARDS = { future: '.start-selling-future-card', commission: '.commission-card' };
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const scaleOf = (tf) => { const m = /matrix\(([^,]+),\s*([^,]+)/.exec(tf || ''); return m ? +(+m[1]).toFixed(4) : tf === 'none' ? 1 : null; };

function metrics(run) {
  const segs = [...run.segs.map((s) => ({ ...s, kind: 'down' })), { k: 2000, ...run.up, kind: 'up' }];
  const hold = 1400; const out = {};
  const vh = run.height || run.viewport?.h; const vc = vh / 2;
  for (const [name, sel] of Object.entries(CARDS)) {
    const g = (run.geo || []).filter((x) => x[2] === sel);
    // transitions on the card's transform
    const keys = Object.entries(run.pairs || {}).filter(([, p]) => (p.path || '').split(' > ').pop().split('.').includes(sel.slice(1)));
    const tfKeys = new Set(keys.filter(([, p]) => p.prop === 'transform').map(([k]) => k));
    const tfEv = (run.ev || []).filter((e) => tfKeys.has(e[3]));
    const runs = tfEv.filter((e) => e[0] === 'r');
    const perSeg = {}; for (const e of runs) perSeg[e[5]] = (perSeg[e[5]] || 0) + 1;
    // drift after each stop
    const drifts = [];
    for (const s of segs) {
      const w = g.filter((x) => x[0] >= s.tStop && x[0] <= s.tStop + hold);
      if (w.length < 3) continue;
      const f0 = w[0]; let maxD = 0, maxX = 0, maxY = 0, lastMove = null;
      // visible drift: the side edges (x), and the card content shown at the viewport's centre line (y), which follows
      // the card's scale about its origin: fraction u of the card at the stop, then where that fraction is later
      const u = (vc - f0[4]) / (f0[6] - f0[4]); const onScreen = f0[4] < vh && f0[6] > 0;
      for (let i = 0; i < w.length; i++) {
        const x = w[i]; if (!onScreen) break;
        const dx = Math.max(Math.abs(x[3] - f0[3]), Math.abs(x[5] - f0[5]));
        const dy = u >= 0 && u <= 1 ? Math.abs(x[4] + u * (x[6] - x[4]) - vc) : 0;
        maxX = Math.max(maxX, dx); maxY = Math.max(maxY, dy); maxD = Math.max(maxD, dx, dy);
        if (i && [3, 4, 5, 6].some((j) => Math.abs(x[j] - w[i - 1][j]) > 0.1)) lastMove = x[0];
      }
      if (maxD > 0.5) drifts.push({ seg: s.k, kind: s.kind, yStop: f0[1], driftPx: r1(maxD), driftX: r1(maxX), driftCentreY: r1(maxY), settleMs: lastMove == null ? 0 : Math.round(lastMove - s.tStop), scaleAtStop: scaleOf(f0[8]), scaleEnd: scaleOf(w.at(-1)[8]) });
    }
    // one-frame jumps
    const jumps = [];
    for (let i = 2; i < g.length; i++) {
      const a = g[i - 2], b = g[i - 1], c = g[i];
      if (c[0] - b[0] > 40 || b[0] - a[0] > 40) continue;
      const ds1 = b[1] - a[1], ds2 = c[1] - b[1];
      const k = ds1 ? ds2 / ds1 : (ds2 ? null : 1); if (k == null) continue;
      const jt = (c[4] - b[4]) - (b[4] - a[4]) * k, jb = (c[6] - b[6]) - (b[6] - a[6]) * k;
      const j = Math.abs(jt) > Math.abs(jb) ? jt : jb;
      const t = c[0]; const seg = segs.find((s) => t >= s.t0 && t <= s.tStop + hold);
      jumps.push({ t, y: c[1], dScroll: ds2, jump: r1(j), phase: seg ? seg.kind : 'other', switched: b[7] !== c[7] || b[9] !== c[9], origin: b[7] !== c[7] ? `${b[7]} -> ${c[7]}` : undefined, cls: b[9] !== c[9] ? `${b[9]} -> ${c[9]}` : undefined, scale: scaleOf(c[8]) });
    }
    const top = (ph) => jumps.filter((j) => j.phase === ph).sort((x, y) => Math.abs(y.jump) - Math.abs(x.jump)).slice(0, 3);
    out[name] = {
      samples: g.length,
      transformRuns: runs.length, transformRunsMaxPerSeg: Math.max(0, ...Object.values(perSeg)),
      drift: { n: drifts.length, maxPx: drifts.length ? Math.max(...drifts.map((d) => d.driftPx)) : 0, settleMedMs: med(drifts.map((d) => d.settleMs)), settleMaxMs: drifts.length ? Math.max(...drifts.map((d) => d.settleMs)) : 0, list: drifts },
      jumps: { maxDown: top('down')[0]?.jump ?? 0, maxUp: top('up')[0]?.jump ?? 0, topDown: top('down'), topUp: top('up'), switches: jumps.filter((j) => j.switched) },
    };
  }
  return out;
}

const res = {};
for (const vp of vps) {
  for (const [arm, dir] of [['A', dirA], ['V', dirV]]) {
    const f = join(dir, `raw-${vp}.json`); if (!existsSync(f)) { console.log('missing', f); continue; }
    const run = JSON.parse(readFileSync(f, 'utf8'));
    const m = metrics(run); (res[vp] ||= {})[arm] = { served: run.served, end: run.end, errors: run.errors?.length ?? null, http4xx: run.http4xx?.length ?? null, ...m };
    console.log(`\n== ${vp} ${arm} served ${run.served?.js}/${run.served?.css} end ${run.end} errors ${run.errors?.length} 4xx ${run.http4xx?.length}`);
    for (const [name, c] of Object.entries(m)) {
      console.log(`${name.padEnd(10)} samples ${c.samples} transformRuns ${c.transformRuns} (max/seg ${c.transformRunsMaxPerSeg}) drift n ${c.drift.n} max ${c.drift.maxPx} px settle med ${c.drift.settleMedMs} max ${c.drift.settleMaxMs} ms | jump max down ${c.jumps.maxDown} up ${c.jumps.maxUp} px`);
      for (const d of c.drift.list) console.log(`    drift seg ${d.seg} ${d.kind} y ${d.yStop}: ${d.driftPx} px (sides ${d.driftX}, centre line ${d.driftCentreY}), settle ${d.settleMs} ms, scale ${d.scaleAtStop} -> ${d.scaleEnd}`);
      for (const j of c.jumps.switches) console.log(`    switch y ${j.y} ${j.phase} dScroll ${j.dScroll} jump ${j.jump} scale ${j.scale} ${j.origin ? 'origin ' + j.origin : ''} ${j.cls ? 'cls ' + j.cls : ''}`);
      for (const j of [...c.jumps.topDown, ...c.jumps.topUp]) console.log(`    top ${j.phase} y ${j.y} dScroll ${j.dScroll} jump ${j.jump} scale ${j.scale}`);
    }
  }
}
const outF = join(dirV, 'dd-metrics.json'); writeFileSync(outF, JSON.stringify({ dirA, dirV, res }, null, 1)); console.log('\nwrote', outF);
