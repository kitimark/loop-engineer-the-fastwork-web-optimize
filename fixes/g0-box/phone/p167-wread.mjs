#!/usr/bin/env node
// P-167 reader (lead 12:3xZ: the whole window, not the binned frame; written before any P-167 data). A pure reader, no
// device. Per counted W run (Timeline on) and per window phase of iphone-run's marks:
//   move = [scroll start, hold end)  (the steps 0 -> 750 at spot A, 4000 -> 5000 at spot B, then 2 s of hold)
//   idle = [idle start, scroll start) (the 3 s idle at the window's start position, after the jump/settle)
// it counts frames with dt > 34 and > 50 (twins 30/38 and 46/54), the max dt, and the Composite records' time (sum and
// the largest single overlap with one frame), and, as a secondary line, P-166's binned spot frame (p166-wread.mjs).
// Per arm: medians over its runs; the per-run lists stay in the JSON.
//   node fixes/g0-box/phone/p167-wread.mjs <dir with runs/ and order.log> [--arms 0,e,k] [--json out.json]
//   node fixes/g0-box/phone/p167-wread.mjs --selftest
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spotFrame } from './p166-wread.mjs';

const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

/** composite intervals [a, b) in page ms */
export function composites(tl) {
  const out = []; const walk = (r) => { if (r.type === 'Composite') out.push([r.startTime * 1000 - tl.offsetMs, (r.endTime ?? r.startTime) * 1000 - tl.offsetMs]); for (const c of r.children || []) walk(c); };
  for (const r of tl.recs || []) walk(r); return out;
}

/** one phase of one run: frames whose stamp t lies in [lo, hi) */
export function phase(j, comps, lo, hi) {
  const F = j.fields, it = F.indexOf('t'), id = F.indexOf('dt'), iy = F.indexOf('yEnd');
  const fr = j.frames.filter((f) => f[it] >= lo && f[it] < hi);
  const dts = fr.map((f) => f[id]);
  const cin = (f) => comps.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, f[it]) - Math.max(a, f[it] - f[id])), 0);
  const cs = fr.map(cin);
  const slow = fr.filter((f) => f[id] > 34).map((f) => ({ y: Math.round(f[iy]), dt: f[id], comp: r1(cin(f)) }));
  return { frames: fr.length, gt30: dts.filter((d) => d > 30).length, gt34: dts.filter((d) => d > 34).length, gt38: dts.filter((d) => d > 38).length,
    gt46: dts.filter((d) => d > 46).length, gt50: dts.filter((d) => d > 50).length, gt54: dts.filter((d) => d > 54).length,
    maxDt: dts.length ? Math.max(...dts) : null, compSum: r1(cs.reduce((s, x) => s + x, 0)), compMax: r1(cs.length ? Math.max(...cs) : 0), slow };
}

export function readRun(j, tl, spot) {
  const m = j.marks || {}; const comps = composites(tl);
  const move = phase(j, comps, m.scroll[0], m.hold[1]); const idle = phase(j, comps, m.idle[0], m.scroll[0]);
  const sf = spotFrame(j, spot);
  return { move, idle, spotFrame: sf ? { dt: sf.dt, y: sf.y } : null };
}

export function summarize(rows) {
  const k = ['gt34', 'gt50', 'gt30', 'gt38', 'gt46', 'gt54', 'maxDt', 'compSum', 'compMax'];
  const s = (p) => Object.fromEntries(k.map((x) => [x, r1(med(rows.map((r) => r[p][x])))]));
  return { n: rows.length, move: s('move'), idle: s('idle'), spotDt: r1(med(rows.map((r) => r.spotFrame?.dt))) };
}

function selftest() {
  const bad = []; const ok = (c, msg) => { if (!c) bad.push(msg); };
  const F = ['t', 'dt', 'yStart', 'yEnd'];
  const j = { fields: F, marks: { idle: [0, 100], scroll: [100, 300], hold: [300, 400] },
    frames: [[50, 16, 0, 0], [116, 16, 0, 0], [176, 60, 0, 40], [216, 40, 40, 200], [316, 36, 700, 750], [416, 16, 750, 750]] };
  const tl = { offsetMs: 0, recs: [{ type: 'RenderingFrame', startTime: 0.12, endTime: 0.17, children: [{ type: 'Composite', startTime: 0.13, endTime: 0.17 }] }] };
  const r = readRun(j, tl, 'A');
  ok(r.move.frames === 4 && r.move.gt34 === 3 && r.move.gt50 === 1 && r.move.maxDt === 60, `1 counts ${JSON.stringify(r.move)}`);
  ok(r.move.compSum === 40 && r.move.compMax === 40 && r.idle.frames === 1, `2 composite ${JSON.stringify(r.move)} idle ${r.idle.frames}`);
  ok(r.spotFrame.dt === 60 && r.spotFrame.y === 40, `3 spot frame ${JSON.stringify(r.spotFrame)}`);
  const s = summarize([r, r, { ...r, move: { ...r.move, gt34: 9 } }]);
  ok(s.move.gt34 === 3 && s.spotDt === 60, `4 summary ${JSON.stringify(s)}`);
  console.log(bad.length ? `SELFTEST FAIL\n- ${bad.join('\n- ')}` : 'SELFTEST ok (4 cases: counts, composite overlap, spot frame, medians)');
  return bad.length ? 1 : 0;
}

const args = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain && args.includes('--selftest')) process.exit(selftest());
if (isMain) {
  const dir = args.find((a) => !a.startsWith('--')) || 'out/p167ph'; const ai = args.indexOf('--arms'); const ji = args.indexOf('--json');
  const arms = ai >= 0 ? args[ai + 1].split(',') : null;
  const order = existsSync(join(dir, 'order.log')) ? readFileSync(join(dir, 'order.log'), 'utf8') : '';
  const items = [...new Set([...order.matchAll(/^\S+ RUN ([AB][0-9a-z][1-3]x?) arm/gm)].map((m) => m[1]))];
  const by = {}; const res = { runs: {}, arms: {} };
  for (const it of items) {
    const spot = it[0], arm = it[1]; if (arms && !arms.includes(arm)) continue;
    const rf = join(dir, 'runs', `w-${it}.json`), tf = join(dir, 'runs', `tl-${it}.json`);
    if (!existsSync(rf) || !existsSync(tf)) continue;
    const r = readRun(JSON.parse(readFileSync(rf, 'utf8')), JSON.parse(readFileSync(tf, 'utf8')), spot);
    res.runs[it] = r; (by[`${spot}${arm}`] ||= []).push(r);
    console.log(`${it} move >34 ${r.move.gt34} >50 ${r.move.gt50} max ${r.move.maxDt} comp sum ${r.move.compSum} max ${r.move.compMax} | idle >34 ${r.idle.gt34} >50 ${r.idle.gt50} | spot ${r.spotFrame?.dt} | slow ${r.move.slow.map((x) => `y${x.y}:${x.dt}(c${x.comp})`).join(' ')}`);
  }
  for (const [k, rows] of Object.entries(by)) { const s = summarize(rows); res.arms[k] = s;
    console.log(`ARM ${k} (n ${s.n}) move: >34 ${s.move.gt34} (30/38: ${s.move.gt30}/${s.move.gt38}) >50 ${s.move.gt50} (46/54: ${s.move.gt46}/${s.move.gt54}) max ${s.move.maxDt} comp sum ${s.move.compSum} max ${s.move.compMax} | idle >34 ${s.idle.gt34} >50 ${s.idle.gt50} | binned spot frame ${s.spotDt}`); }
  if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify(res, null, 1));
}
