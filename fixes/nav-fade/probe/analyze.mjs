#!/usr/bin/env node
// nav-fade: read motion.json (motion.mjs) and summarize per arm and scenario the visible motion of the Join button
// (left edge and width of what is drawn: the earn-box minus its clip-path inset in v9, the button box in v8), the
// language switch (left edge), opacity and filter blur, all relative to the nav's right edge, per rAF sample.
// Flags: holds (a quantity that moved, stops for >= 2 frames and moves on in the same direction), reversals (direction
// changes mid-motion: two drivers fighting), jumps (one-frame step > 3x the median moving step), and the motion window.
//   node fixes/nav-fade/probe/analyze.mjs <motion.json> [--timeline arm:scen]
import { readFileSync } from 'node:fs';
const f = process.argv[2]; const J = JSON.parse(readFileSync(f, 'utf8'));
const tl = (() => { const i = process.argv.indexOf('--timeline'); return i > 0 ? process.argv[i + 1] : null; })();
const px = (s) => { const m = /(-?[\d.]+)px/.exec(s || ''); return m ? +m[1] : 0; };
// clip-path inset(T R ...) horizontal inset in px; a % value is of the box width w (the hidden state: inset(0 50%))
const insetX = (s, w) => { const m = /inset\(\s*(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(px|%)/.exec(s || ''); if (m) return m[3] === '%' ? (+m[2] / 100) * w : +m[2]; const o = /inset\(\s*(-?[\d.]+)(px|%)/.exec(s || ''); return o ? (o[2] === '%' ? (+o[1] / 100) * w : +o[1]) : 0; };
const blur = (s) => { const m = /blur\((-?[\d.]+)px\)/.exec(s || ''); return m ? +m[1] : 0; };
const tY = (s) => { const m = /matrix\(([^)]+)\)/.exec(s || ''); return m ? +m[1].split(',')[5] : 0; };
function derive(x) {
  const clip = x.bclip && x.bclip !== 'none' ? insetX(x.bclip, x.bw) : 0;
  // arm B (.fw-nf-cl): the visible pill spans [cl.left, button.right]
  const visL = x.cll != null ? Math.max(x.cll, x.el) : x.bl != null ? x.bl + clip : x.el, visW = x.cll != null ? Math.max(0, x.el + x.ew - visL) : x.bl != null ? Math.max(0, x.bw - 2 * clip) : x.ew;
  return { t: x.t, cls: x.cls, m: +(x.m || 0), joinL: +(visL - x.nr).toFixed(2), joinW: +visW.toFixed(2), sw: +(x.wl - x.nr).toFixed(2), op: +x.eo, mk: x.mkl != null ? +((x.mkl - x.mkil) / (-1.4 * x.ew) * 100).toFixed(2) : (() => { const m = /(-?[\d.]+)%/.exec(x.emask || ''); return m ? +m[1] : (/^0px/.test(x.emask || '') ? 0 : null); })(), mki: x.mkil, blur: blur(x.ef), ty: tY(x.etf), an: x.an, y: x.y };
}
function series(S, k) {
  const v = S.map((s) => s[k]); const d = v.slice(1).map((x, i) => +(x - v[i]).toFixed(3));
  const mv = d.map((x, i) => [i, x]).filter(([, x]) => Math.abs(x) > 0.01);
  if (!mv.length) return { k, moved: false, from: v[0], to: v.at(-1) };
  const first = mv[0][0], last = mv.at(-1)[0];
  let holds = 0, holdFrames = 0, rev = 0, prevSign = 0; let run = 0;
  for (let i = first; i <= last; i++) {
    const x = d[i]; if (Math.abs(x) <= 0.01) { run++; continue; }
    if (run >= 2) { holds++; holdFrames += run; } run = 0;
    const sg = Math.sign(x); if (prevSign && sg !== prevSign) rev++; prevSign = sg;
  }
  const mags = mv.map(([, x]) => Math.abs(x)).sort((a, b) => a - b); const med = mags[Math.floor(mags.length / 2)];
  const jumps = mv.filter(([, x]) => Math.abs(x) > 3 * med && Math.abs(x) > 1).map(([i, x]) => `${Math.round(S[i + 1].t - S[0].t)}ms:${x.toFixed(1)}`);
  return { k, moved: true, from: v[first], to: v[last + 1], startMs: Math.round(S[first + 1].t - S[0].t), endMs: Math.round(S[last + 1].t - S[0].t), movingFrames: mv.length, holds, holdFrames, reversals: rev, maxStep: +mags.at(-1).toFixed(2), medStep: +med.toFixed(2), jumps: jumps.slice(0, 6) };
}
for (const run of J.runs) {
  if (run.pass !== 'motion') {
    for (const [sc, o] of Object.entries(run.scen || {})) {
      const c = o.counts || {}; const top = Object.entries(c.paints || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}:${n}`).join(', ');
      console.log(`${run.arm} counts ${sc}: frames ${o.frames} layout ${c.layout ?? '-'} style ${c.style ?? '-'} ${c.types ? JSON.stringify(c.types) : ''}\n   paints: ${top}`);
    }
    if (run.layersBar) console.log(`${run.arm} nav layers (bar): ${JSON.stringify(run.layersBar)}`);
    if (run.layersEnd) console.log(`${run.arm} nav layers (end): ${JSON.stringify(run.layersEnd)}`);
    continue;
  }
  for (const [sc, o] of Object.entries(run.scen || {})) {
    const S = (o.samples || []).map(derive); if (!S.length) { console.log(run.arm, sc, 'no samples', o.error || ''); continue; }
    const flips = []; for (let i = 1; i < S.length; i++) if (S[i].cls !== S[i - 1].cls) flips.push(`${Math.round(S[i].t - S[0].t)}ms ${S[i - 1].cls} -> ${S[i].cls}`);
    const dts = S.slice(1).map((s, i) => s.t - S[i].t).sort((a, b) => a - b);
    console.log(`\n== ${run.arm} ${sc}: ${S.length} samples, dt p50 ${dts[Math.floor(dts.length / 2)]?.toFixed(1)} max ${dts.at(-1)?.toFixed(1)}; class changes: ${flips.join(' | ') || 'none'}`);
    for (const k of ['joinL', 'joinW', 'sw', 'op', 'mk', 'mki', 'blur', 'ty', 'm']) { const r = series(S, k); if (r.moved) console.log(`   ${k.padEnd(5)} ${r.from} -> ${r.to}  ${r.startMs}-${r.endMs} ms, ${r.movingFrames} moving frames, holds ${r.holds} (${r.holdFrames} fr), reversals ${r.reversals}, step med ${r.medStep} max ${r.maxStep}${r.jumps.length ? ', jumps ' + r.jumps.join(' ') : ''}`); }
    const anims = [...new Set(S.flatMap((s) => (s.an || '').split(' ').filter(Boolean)))]; console.log(`   running animations seen: ${anims.join(', ')}`);
    if (tl === `${run.arm}:${sc}`) for (const s of S) console.log(`   ${Math.round(s.t - S[0].t)}\ty${s.y}\tm${s.m}\tL${s.joinL}\tW${s.joinW}\tsw${s.sw}\top${s.op}\tmk${s.mk}\tbl${s.blur}\tty${s.ty}\t${s.cls}`);
  }
}
