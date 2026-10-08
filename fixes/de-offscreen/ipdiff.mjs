#!/usr/bin/env node
// de-offscreen: read out/de-offscreen/isplay/<arm>-<run>.json (isplay-sim.mjs) and list, per load, what the `+is-play`
// toggle step did to the layer list: created / destroyed / resized (composited bounds) / memory change / repainted
// (paintCount delta), before -> after (the toggle step) and after -> after1s; per-arm totals; then every layer-set
// change over the 1.6 s of samples (tRel, created / destroyed, owners, reasons). --json writes the committed export
// (counts, MB, owners only; no Simulator ms).
//   node fixes/de-offscreen/ipdiff.mjs [--dir out/de-offscreen/isplay] [--json fixes/de-offscreen/data/sim-isplay.json] [--quiet]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WT } from './common.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DIR = join(WT, opt('--dir', 'out/de-offscreen/isplay'));
const MB = (b) => Math.round(b / 1e4) / 100;
const quiet = argv.includes('--quiet');
const files = readdirSync(DIR).filter((f) => /^[^s].*-\d+\.json$/.test(f) && !f.startsWith('serve')).sort();
const out = { loads: {}, arms: {} };
function phase(A, B, owners) {
  const a = new Map(A.layers.map((l) => [l.id, l])), b = new Map(B.layers.map((l) => [l.id, l]));
  const name = (id) => { const o = owners[id]?.owner; return o ? (o.sel || '?') : '?'; };
  const created = [], destroyed = [], resized = [], memChanged = [], repainted = [];
  for (const [id, l] of b) {
    const p = a.get(id);
    if (!p) { created.push({ id, sel: name(id), mb: MB(l.mem), cb: l.cb, paints: l.paints, reasons: owners[id]?.reasons }); continue; }
    if (String(p.cb?.slice(2)) !== String(l.cb?.slice(2))) resized.push({ id, sel: name(id), from: p.cb, to: l.cb, dmb: MB(l.mem - p.mem) });
    else if (p.mem !== l.mem) memChanged.push({ id, sel: name(id), dmb: MB(l.mem - p.mem) });
    if (l.paints > p.paints) repainted.push({ id, sel: name(id), n: l.paints - p.paints, mb: MB(l.mem) });
  }
  for (const [id, l] of a) if (!b.has(id)) destroyed.push({ id, sel: name(id), mb: MB(l.mem) });
  const sum = (xs, k) => Math.round(xs.reduce((s, x) => s + (x[k] || 0), 0) * 100) / 100;
  return { layers: [A.layers.length, B.layers.length], mb: [MB(A.layers.reduce((s, l) => s + l.mem, 0)), MB(B.layers.reduce((s, l) => s + l.mem, 0))],
    created, destroyed, resized, memChanged, repainted, n: { created: created.length, createdMb: sum(created, 'mb'), destroyed: destroyed.length, resized: resized.length, repaintedLayers: repainted.length, repaints: sum(repainted, 'n'), repaintedMb: sum(repainted, 'mb') } };
}
for (const f of files) {
  const r = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  if (!r.hit) { out.loads[f] = { arm: r.arm, error: r.errors }; continue; }
  const h = r.hit, ow = h.owners || {};
  const p1 = phase(h.before, h.after, ow), p2 = phase(h.after, h.after1s, ow);
  const tl = h.timeline;
  const paintsIn = (tl.paints || []).map((p) => { const q = p.clip; if (!q) return null; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; return { x: Math.round(Math.min(...xs)), y: Math.round(Math.min(...ys) - h.y), w: Math.round(Math.max(...xs) - Math.min(...xs)), h: Math.round(Math.max(...ys) - Math.min(...ys)), ms: p.ms }; }).filter(Boolean);
  // layer-set changes over the samples: at each sample whose layer ids differ from the previous one, what was created
  // and destroyed (owner selector, MB, reasons). Short owner names: drop the common class prefix.
  const short = (s) => String(s || '?').replace(/start-selling-platform-/g, '').replace(/start-selling-/g, '');
  const events = [];
  if (h.samples) {
    let prev = h.before.layers;
    for (const s of h.samples) {
      const a = new Set(prev.map((l) => l.id)), b = new Set(s.layers.map((l) => l.id));
      const cr = s.layers.filter((l) => !a.has(l.id)), de = prev.filter((l) => !b.has(l.id));
      if (cr.length || de.length) events.push({ tRel: s.tRel, layers: s.layers.length, mb: MB(s.layers.reduce((x, l) => x + l.mem, 0)),
        created: cr.map((l) => ({ sel: short(ow[l.id]?.owner?.sel), mb: MB(l.mem), w: l.cb?.[2], h: l.cb?.[3], reasons: ow[l.id]?.reasons })),
        destroyed: de.map((l) => ({ sel: short(ow[l.id]?.owner?.sel), mb: MB(l.mem) })) });
      prev = s.layers;
    }
  }
  out.loads[f] = { arm: r.arm, run: r.run, served: r.served, toggleY: h.y, toggles: h.toggles, tlCounts: tl.counts, tlPaints: paintsIn, composites: tl.composites, toggleStep: p1, nextSecond: p2, events };
  const A = (out.arms[r.arm] ||= []); A.push({ run: r.run, y: h.y, before: p1.layers[0], after: p1.layers[1], after1s: p2.layers[1], mbBefore: p1.mb[0], mbAfter: p1.mb[1], mbAfter1s: p2.mb[1], ...Object.fromEntries(Object.entries(p1.n).map(([k, v]) => ['t_' + k, v])), ...Object.fromEntries(Object.entries(p2.n).map(([k, v]) => ['s_' + k, v])), tlPaint: tl.counts.Paint || 0, tlComposite: tl.counts.Composite || 0, tlLayout: tl.counts.Layout || 0, tlStyle: tl.counts.RecalculateStyles || 0, tlPaintArea: paintsIn.reduce((s, p) => s + p.w * p.h, 0) });
  if (!quiet) {
    console.log(`\n== ${f}: toggle ${h.toggles.map((t) => t.sel + ' @' + t.y).join(', ')} | step to y ${h.y}`);
    console.log(`   toggle step: ${p1.layers.join('->')} L, ${p1.mb.join('->')} MB | created ${p1.n.created} (${p1.n.createdMb} MB) destroyed ${p1.n.destroyed} resized ${p1.resized.length} repainted ${p1.n.repaintedLayers} layers / ${p1.n.repaints} paints | Timeline ${JSON.stringify(tl.counts)}`);
    for (const x of p1.created) console.log(`     + ${x.sel} ${x.mb} MB cb ${JSON.stringify(x.cb)} paints ${x.paints} [${(x.reasons || []).join(',')}]`);
    for (const x of p1.destroyed) console.log(`     - ${x.sel} ${x.mb} MB`);
    for (const x of p1.resized) console.log(`     ~ ${x.sel} ${JSON.stringify(x.from)} -> ${JSON.stringify(x.to)} dMB ${x.dmb}`);
    for (const x of p1.memChanged) console.log(`     m ${x.sel} dMB ${x.dmb}`);
    for (const x of p1.repainted) console.log(`     p ${x.sel} +${x.n} (${x.mb} MB)`);
    console.log(`   next 1 s: ${p2.layers.join('->')} L, ${p2.mb.join('->')} MB | created ${p2.n.created} (${p2.n.createdMb} MB) destroyed ${p2.n.destroyed} resized ${p2.resized.length} repainted ${p2.n.repaintedLayers} / ${p2.n.repaints}`);
    for (const x of p2.created) console.log(`     + ${x.sel} ${x.mb} MB cb ${JSON.stringify(x.cb)} [${(x.reasons || []).join(',')}]`);
    for (const x of p2.destroyed) console.log(`     - ${x.sel} ${x.mb} MB`);
    for (const x of p2.resized) console.log(`     ~ ${x.sel} ${JSON.stringify(x.from)} -> ${JSON.stringify(x.to)}`);
    console.log(`   Timeline Paint boxes (viewport y): ${paintsIn.map((p) => `${p.w}x${p.h}@${p.x},${p.y}`).join(' ')}`);
    if (h.samples) {
      // layer lifetimes over the samples (tRel = ms after the toggle's MutationObserver record, page clock)
      // only the samples where the layer count or memory changed (plus the first and last)
      const sl = h.samples.map((s) => ({ t: s.tRel, n: s.layers.length, mb: MB(s.layers.reduce((a, l) => a + l.mem, 0)) }));
      const ch = sl.filter((s, i) => i === 0 || i === sl.length - 1 || s.n !== sl[i - 1].n || s.mb !== sl[i - 1].mb);
      console.log(`   toggle ${h.toggleAfterStepMs} ms after the scroll step; ${sl.length} samples, changes (tRel ms: layers / MB): ${ch.map((s) => `${s.t}:${s.n}/${s.mb}`).join(' ')}`);
      const before = new Set(h.before.layers.map((l) => l.id)); const life = new Map();
      for (const s of h.samples) for (const l of s.layers) { const e = life.get(l.id) || { first: s.tRel, last: s.tRel, mb: MB(l.mem), cb: l.cb }; e.last = s.tRel; life.set(l.id, e); }
      const gone = [...before].map((id) => ({ id, at: h.samples.find((s) => !s.layers.some((l) => l.id === id))?.tRel })).filter((x) => x.at != null);
      for (const [id, e] of life) if (!before.has(id)) console.log(`     new ${ow[id]?.owner?.sel || '?'} ${e.mb} MB cb ${JSON.stringify(e.cb)} seen ${e.first}..${e.last}${e.last < h.samples[h.samples.length - 1].tRel ? ' (gone after)' : ''} [${(ow[id]?.reasons || []).join(',')}]`);
      for (const x of gone) console.log(`     gone ${ow[x.id]?.owner?.sel || '?'} from ${x.at}`);
      console.log(`   Timeline records (type, tRel, ms) >= 2 ms: ${(tl.records || []).filter((r) => r[2] >= 2).map((r) => r.join(':')).join(' ')}`);
    }
  }
}
console.log('\n| arm | run | toggle y | layers before/after/+1s | MB before/after/+1s | toggle step: created (MB) / destroyed / resized / repainted layers (paints) | Timeline in step: Paint / Composite / Layout / Style |');
console.log('|---|---|---|---|---|---|---|');
for (const [arm, rs] of Object.entries(out.arms)) for (const x of rs) console.log(`| ${arm} | ${x.run} | ${x.y} | ${x.before}/${x.after}/${x.after1s} | ${x.mbBefore}/${x.mbAfter}/${x.mbAfter1s} | ${x.t_created} (${x.t_createdMb}) / ${x.t_destroyed} / ${x.t_resized} / ${x.t_repaintedLayers} (${x.t_repaints}) | ${x.tlPaint} / ${x.tlComposite} / ${x.tlLayout} / ${x.tlStyle} |`);
// per load: the layer-set changes after the toggle (tRel ms: +created / -destroyed, layers, MB; created owners)
console.log('\n| arm | run | tRel ms | + / - | layers | MB | created (owner MB [reasons]) |');
console.log('|---|---|---|---|---|---|---|');
for (const [f, L] of Object.entries(out.loads)) for (const e of L.events || []) {
  const grp = {}; for (const c of e.created) { const k = `${c.sel} ${c.mb}${c.reasons?.length ? ' [' + c.reasons.join(',') + ']' : ''}`; grp[k] = (grp[k] || 0) + 1; }
  console.log(`| ${L.arm} | ${L.run} | ${e.tRel} | +${e.created.length} / -${e.destroyed.length} | ${e.layers} | ${e.mb} | ${Object.entries(grp).map(([k, n]) => (n > 1 ? n + '× ' : '') + k).join('; ')} |`);
}
// the committed export: no Simulator ms (paint boxes, Composite records), only counts, MB, owners and reasons
if (opt('--json')) {
  const loads = Object.fromEntries(Object.entries(out.loads).map(([f, L]) => { const { tlPaints, composites, ...rest } = L; return [f.replace(/\.json$/, ''), rest]; }));
  writeFileSync(join(WT, opt('--json')), JSON.stringify({
    engine: 'webkit (iOS Simulator, Mobile Safari), 430x775 DPR 3', source: 'fixes/de-offscreen/isplay-sim.mjs + ipdiff.mjs',
    notes: ['tRel = ms after the is-play MutationObserver record (page clock); counts, MB, owners and reasons only, no timing claims',
      'toggleStep = census before the step vs the first census after the flip; nextSecond = first vs last census (1.6 s); events = every layer-set change over the samples',
      'tlCounts = Timeline record counts over the toggle step and the 1.6 s of sampling'],
    arms: out.arms, loads }, null, 0));
}
