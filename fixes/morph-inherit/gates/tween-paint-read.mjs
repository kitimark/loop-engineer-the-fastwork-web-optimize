// Read a tween-paint-sim.mjs result (morph-inherit gate c; F3 A step 1, fix-nav-morph): per tween frame, the Paint clips (root-view rects),
// Layout / RecalculateStyles / Composite counts; per composited layer, the paintCount deltas between the layer
// snapshots (holds vs tween-containing spans vs isolation probes) and its bounds at m = 0 and m = 1.
//   node fixes/morph-inherit/gates/tween-paint-read.mjs out/morph-inherit/tween-paint-<ts>.json [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const f = argv[0]; const ji = argv.indexOf('--json'); const jOut = ji >= 0 ? argv[ji + 1] : null;
const D = JSON.parse(readFileSync(f, 'utf8'));
const r1 = (v) => Math.round(v * 10) / 10;
const rect = (q) => { const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; const x = Math.min(...xs), y = Math.min(...ys); return [r1(x), r1(y), r1(Math.max(...xs) - x), r1(Math.max(...ys) - y)]; };
const out = { file: f, runs: [] };

for (const run of D.runs) {
  if (run.void || run.error) { console.log(run.arm, run.void || run.error); continue; }
  const TL = JSON.parse(readFileSync(run.timelineFile, 'utf8'));
  const off = TL.offsetMs;
  const flat = [];
  const walk = (r, depth) => { if (r.startTime != null) flat.push({ type: r.type, t: r.startTime * 1000 - off, e: (r.endTime ?? r.startTime) * 1000 - off, data: r.data, depth }); for (const c of r.children || []) walk(c, depth + 1); };
  for (const r of TL.recs) walk(r, 0);
  flat.sort((a, b) => a.t - b.t);
  const fr = run.driver.frames; // [t, dt, y, m]
  // frame i's rendering update lies in [t_i, t_{i+1})
  const frames = [];
  for (let i = 0; i + 1 < fr.length; i++) {
    const [t, dt, y, m] = fr[i], t1 = fr[i + 1][0];
    const mPrev = i ? fr[i - 1][3] : m;
    const ph = m <= 0.001 && mPrev <= 0.001 ? 'm0' : m >= 0.999 && mPrev >= 0.999 ? 'm1' : m > mPrev ? 'open' : m < mPrev ? 'close' : m >= 0.999 ? 'm1' : 'm0';
    const R = flat.filter((x) => x.t >= t && x.t < t1);
    const P = R.filter((x) => x.type === 'Paint').map((x) => rect(x.data.clip));
    frames.push({ i, t: r1(t), dtNext: r1(t1 - t), y, m, ph, L: R.filter((x) => x.type === 'Layout').length, S: R.filter((x) => x.type === 'RecalculateStyles').length, C: R.filter((x) => x.type === 'Composite').length, P, layoutRoots: R.filter((x) => x.type === 'Layout').map((x) => x.data?.root ? rect(x.data.root) : null) });
  }
  // tweens: maximal runs of open / close frames
  const tweens = [];
  for (const fm of frames) {
    if (fm.ph !== 'open' && fm.ph !== 'close') continue;
    const last = tweens.at(-1);
    if (last && last.kind === fm.ph && last.frames.at(-1).i === fm.i - 1) last.frames.push(fm); else tweens.push({ kind: fm.ph, frames: [fm] });
  }
  const key = (p) => `${Math.round(p[2])}x${Math.round(p[3])}`;
  const sumPh = (sel) => { const F = frames.filter(sel); const by = {}; for (const fm of F) for (const p of fm.P) { const k = key(p); by[k] = (by[k] || 0) + 1; } return { frames: F.length, paints: F.reduce((a, x) => a + x.P.length, 0), layouts: F.reduce((a, x) => a + x.L, 0), styles: F.reduce((a, x) => a + x.S, 0), bySize: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 25) }; };
  const R = { arm: run.arm, served: run.served, moving: run.driver.moving, atOne: run.driver.atOne, holds: { m0: sumPh((x) => x.ph === 'm0'), m1: sumPh((x) => x.ph === 'm1') }, tweens: [] };
  for (const tw of tweens) {
    const by = {}; for (const fm of tw.frames) for (const p of fm.P) { const k = key(p); by[k] = (by[k] || 0) + 1; }
    R.tweens.push({ kind: tw.kind, frames: tw.frames.length, paints: tw.frames.reduce((a, x) => a + x.P.length, 0), layouts: tw.frames.reduce((a, x) => a + x.L, 0), styles: tw.frames.reduce((a, x) => a + x.S, 0), gt34: tw.frames.filter((x) => x.dtNext > 34).length, bySize: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 25), perFrame: tw.frames.map((x) => ({ m: x.m, dt: x.dtNext, L: x.L, S: x.S, P: x.P })) });
  }
  // layer snapshots
  const S = run.snaps;
  const tOf = (s) => (s.tA + s.tB) / 2;
  const mAt = (t) => { let m = null; for (const x of fr) { if (x[0] <= t) m = x[3]; else break; } return m; };
  const snapInfo = S.map((s) => ({ label: s.label, t: r1(tOf(s) - run.t0), ms: r1(s.tB - s.tA), m: mAt(s.tA), mB: mAt(s.tB), layers: s.layers.length }));
  const names = new Map(); for (const s of S) for (const l of s.layers) names.set(l.id, l.name);
  const byLabel = Object.fromEntries(S.map((s, k) => [s.label, s])); const byIdx = (lab) => S.findIndex((x) => x.label === lab);
  const deltaS = (sa, sb) => { const A = new Map(sa.layers.map((l) => [l.id, l])); const out = {}; for (const l of sb.layers) { const pa = A.get(l.id)?.pc ?? 0; if (l.pc - pa) out[l.id] = l.pc - pa; } return out; };
  const delta = (a, b) => { const A = new Map(byLabel[a].layers.map((l) => [l.id, l])); const out = {}; for (const l of byLabel[b].layers) { const pa = A.get(l.id)?.pc ?? 0; if (l.pc - pa) out[l.id] = l.pc - pa; } return out; };
  const spans = [];
  for (let k = 0; k + 1 < S.length; k++) {
    const a = S[k].label, b = S[k + 1].label;
    if (a.startsWith('iso') && a.endsWith('-b')) continue; // between probes
    const framesIn = fr.filter((x) => x[0] >= S[k].tB && x[0] < S[k + 1].tA);
    const phs = {}; for (let i = 1; i < framesIn.length; i++) { const m = framesIn[i][3], mp = framesIn[i - 1][3]; const ph = m <= 0.001 && mp <= 0.001 ? 'm0' : m >= 0.999 && mp >= 0.999 ? 'm1' : m > mp ? 'open' : 'close'; phs[ph] = (phs[ph] || 0) + 1; }
    spans.push({ from: a, to: b, ms: r1(S[k + 1].tA - S[k].tB), driverFrames: phs, d: delta(a, b) });
  }
  const m0 = byLabel['m0-early-0'] || byLabel.pre, m1 = byLabel['m1-early-0'];
  const geo = (s, id) => { const l = s?.layers.find((x) => x.id === id); return l ? { b: l.b?.map(r1), cb: l.cb?.map(r1), mem: l.mem } : null; };
  const ids = [...new Set(spans.flatMap((s) => Object.keys(s.d)))];
  R.layers = ids.map((id) => ({ id, name: names.get(id), m0: geo(m0, id), m1: geo(m1, id), deltas: Object.fromEntries(spans.map((s) => [`${s.from}>${s.to}`, s.d[id] || 0])) }));
  R.spans = spans.map((s) => ({ from: s.from, to: s.to, ms: s.ms, driverFrames: s.driverFrames, total: Object.values(s.d).reduce((a, v) => a + v, 0) }));
  R.snapInfo = snapInfo;
  R.layerCount = { m0: m0?.layers.length, m1: m1?.layers.length };
  R.rects = { m0: m0?.rects, m1: m1?.rects };
  // iso probes: timeline paints in the probe's frames
  let isoCur = 0;
  R.iso = (run.iso || []).map((p) => {
    const ts = p.ts || []; const a = ts[0], b = ts.at(-1);
    const P = flat.filter((x) => x.type === 'Paint' && x.t >= a && x.t < b + 50).map((x) => rect(x.data.clip));
    const by = {}; for (const q of P) { const k = key(q); by[k] = (by[k] || 0) + 1; }
    const ia = S.findIndex((x, k) => x.label === p.a && k >= isoCur); isoCur = ia + 2; const d = deltaS(S[ia], S[ia + 1]);
    return { kind: p.kind, frames: ts.length, paints: P.length, layouts: flat.filter((x) => x.type === 'Layout' && x.t >= a && x.t < b + 50).length, bySize: Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 12), layerDeltas: Object.entries(d).map(([id, v]) => [id + " " + names.get(id), v]).sort((x, y) => y[1] - x[1]) };
  });
  out.runs.push(R);

  // print
  console.log(`\n=== ${R.arm} served ${R.served.js}/${R.served.css}; driver moving ${JSON.stringify(R.moving)}`);
  console.log('snapshots', snapInfo.map((s) => `${s.label}@${s.t}(${s.ms}ms m${s.m}->${s.mB} L${s.layers})`).join(' '));
  for (const [k, h] of Object.entries(R.holds)) console.log(`hold ${k}: frames ${h.frames} paints/f ${r1(h.paints / h.frames)} layouts/f ${r1(h.layouts / h.frames)} styles/f ${r1(h.styles / h.frames)} sizes ${JSON.stringify(h.bySize.slice(0, 8))}`);
  for (const tw of R.tweens) console.log(`${tw.kind}: frames ${tw.frames} >34 ${tw.gt34} paints/f ${r1(tw.paints / tw.frames)} layouts/f ${r1(tw.layouts / tw.frames)} styles/f ${r1(tw.styles / tw.frames)} sizes ${JSON.stringify(tw.bySize.slice(0, 14))}`);
  console.log('spans', R.spans.map((s) => `${s.from}>${s.to} ${s.ms}ms ${JSON.stringify(s.driverFrames)} paints ${s.total}`).join('\n      '));
  console.log('layers that painted:');
  for (const l of R.layers.sort((a, b) => Object.values(b.deltas).reduce((x, y) => x + y, 0) - Object.values(a.deltas).reduce((x, y) => x + y, 0))) console.log(`  ${l.id} ${l.name} m0 ${JSON.stringify(l.m0)} m1 ${JSON.stringify(l.m1)}\n     ${Object.entries(l.deltas).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  for (const p of R.iso) console.log(`iso ${p.kind}: frames ${p.frames} paints ${p.paints} layouts ${p.layouts} sizes ${JSON.stringify(p.bySize)} layers ${JSON.stringify(p.layerDeltas)}`);
}
if (jOut) writeFileSync(jOut, JSON.stringify(out, null, 1));
