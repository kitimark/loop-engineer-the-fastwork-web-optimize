#!/usr/bin/env node
// panel-height: per toolbar-moving frame counts from a ph-sim.mjs run (counts only). For every RenderingFrame that starts
// within 8 ms after a logger rAF whose innerHeight differs from the previous rAF's (Safari's toolbar moving), and every
// other frame of the same phases, sums Layout / RecalculateStyles / Paint records, paint area (kpx) and
// ResizeObserver callbacks, split by the panel state at that rAF (m = 1 open, 0 < m < 1 morphing, m = 0).
//   node fixes/panel-height/tbframes.mjs <out/ph/sim-*/>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const D = process.argv[2];
const res = JSON.parse(readFileSync(join(D, 'ph.json'), 'utf8'));
const box = (c) => { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
for (const arm of res.arms) {
  const f = join(D, `tl-${arm.arm}.json`);
  let tl; try { tl = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  const { offsetMs: off, recs, logger: L } = tl;
  const rafs = L.f; // [t, ih, y, m, rv]
  const frames = recs.filter((r) => r.type === 'RenderingFrame').map((r) => ({ t: r.startTime * 1000 - off, r }));
  const out = {};
  for (const [name, ph] of Object.entries(arm.phases)) {
    if (!/^end/.test(name)) continue;
    for (const fr of frames) {
      if (fr.t < ph.t0 || fr.t >= ph.t1) continue;
      // the logger rAF that ran in this frame (closest start at or after the frame start, within 8 ms)
      let k = rafs.findIndex((x) => x[0] >= fr.t - 1 && x[0] <= fr.t + 8);
      if (k < 1) continue;
      const moving = rafs[k][1] !== rafs[k - 1][1];
      const m = +rafs[k][3]; const st = m >= 1 ? 'open' : m > 0.001 ? 'morphing' : 'closed';
      const key = `${moving ? 'toolbar-moving' : 'toolbar-still'} ${st}`;
      const o = (out[key] ||= { frames: 0, layouts: 0, framesWithLayout: 0, styles: 0, paints: 0, kpx: 0, ro: 0 });
      let L2 = 0, S = 0, P = 0, A = 0, R = 0;
      const walk = (x) => { if (x.type === 'Layout') L2++; else if (x.type === 'RecalculateStyles') S++; else if (x.type === 'Paint') { P++; if (x.data?.clip) A += box(x.data.clip); } else if (x.type === 'ObserverCallback' && /Resize/.test(x.data?.type || '')) R++; for (const c of x.children || []) walk(c); };
      walk(fr.r);
      o.frames++; o.layouts += L2; if (L2) o.framesWithLayout++; o.styles += S; o.paints += P; o.kpx += A / 1e3; o.ro += R;
    }
  }
  for (const [k, o] of Object.entries(out).sort()) {
    console.log(arm.arm, k.padEnd(24), `frames ${String(o.frames).padStart(3)} | per frame: layouts ${(o.layouts / o.frames).toFixed(2)} (frames with layout ${o.framesWithLayout}) styles ${(o.styles / o.frames).toFixed(2)} paints ${(o.paints / o.frames).toFixed(2)} kpx ${(o.kpx / o.frames).toFixed(0)} RO ${(o.ro / o.frames).toFixed(2)}`);
  }
}
