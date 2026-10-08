#!/usr/bin/env node
// P-166 stage 1 reader (COUNTS ONLY, never durations): for each out/p166/sim/tl-<arm>-<spot>-<rep>.json, the spot frame
// and its record counts. Spot frame: A = the top-level Timeline record (RenderingFrame) that holds the first rAF frame
// whose scrollY left the start (the first scroll step's frame); B = the record holding the '+is-play' flip's TimeStamp.
// Counts: RecalculateStyles, Layout, Paint, Composite, FunctionCall, EventDispatch, TimerFire, all records, and the
// p166 flips (class / data-fw-wc changes) in that frame; the same for the frame before and after.
//   node fixes/g0-box/phone/p166-read.mjs [out/p166/sim] [--json out.json] | --selftest
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KINDS = ['RecalculateStyles', 'Layout', 'Paint', 'Composite', 'FunctionCall', 'EventDispatch', 'TimerFire'];
const walk = (r, f) => { f(r); for (const k of r.children || []) walk(k, f); };
export function counts(top) {
  const c = Object.fromEntries(KINDS.map((k) => [k, 0])); c.records = 0; const flips = [];
  walk(top, (r) => { c.records++; if (r.type in c) c[r.type]++; if (r.type === 'TimeStamp') { const m = String(r.data?.message || ''); if (m.startsWith('p166:') && m !== 'p166:start' && m !== 'p166:end') flips.push(m.slice(5)); } });
  return { ...c, flips };
}
const stamps = (recs, pred) => { const out = []; recs.forEach((top, i) => walk(top, (r) => { if (r.type === 'TimeStamp' && pred(String(r.data?.message || ''))) out.push({ i, t: r.startTime }); })); return out; };

export function spotFrame(j) {
  const recs = j.recs || [];
  if (j.spot === 'B') { const s = stamps(recs, (m) => m.startsWith('p166:') && m.includes('+is-play')); return s.length ? { i: s[0].i, how: 'is-play stamp' } : { i: -1, how: 'no is-play flip' }; }
  const st = stamps(recs, (m) => m === 'p166:start')[0];
  const fr = (j.page?.frames || []); const y0 = fr.length ? fr[0][1] : 0;
  const first = fr.find((f) => f[1] > y0 + 0.5);
  if (!st || !first || j.page?.tStart == null) return { i: -1, how: 'no start stamp or no moving frame' };
  const t = st.t + (first[0] - j.page.tStart) / 1000;
  let i = recs.findIndex((r) => r.startTime <= t && (r.endTime ?? r.startTime) >= t);
  if (i < 0) i = recs.findIndex((r) => r.startTime >= t);
  return { i, how: 'first moving rAF frame', y: first[1] };
}

export function readRun(j) {
  const sf = spotFrame(j); const recs = j.recs || [];
  const at = (k) => (k >= 0 && k < recs.length ? { type: recs[k].type, ...counts(recs[k]) } : null);
  return { arm: j.arm, spot: j.spot, rep: j.rep, he: j.page?.he ?? null, steps: j.page?.steps ?? null, errors: j.errors || [], how: sf.how, frame: at(sf.i), before: at(sf.i - 1), after: at(sf.i + 1) };
}

if (process.argv.includes('--selftest')) {
  const rf = (t, kids) => ({ type: 'RenderingFrame', startTime: t, endTime: t + 0.016, children: kids });
  const ts = (t, m) => ({ type: 'TimeStamp', startTime: t, data: { message: m } });
  const jA = { arm: 'e', spot: 'A', page: { tStart: 1000, frames: [[1000, 0], [1016, 0], [1033, 12]] },
    recs: [rf(5.0, [ts(5.001, 'p166:start')]), rf(5.016, [{ type: 'Layout' }]), rf(5.032, [{ type: 'RecalculateStyles' }, { type: 'RecalculateStyles' }, ts(5.035, 'p166:section.hero-track +he-css')]), rf(5.05, [])] };
  const a = readRun(jA);
  const jB = { arm: 'f', spot: 'B', page: {}, recs: [rf(1, []), rf(1.02, [{ type: 'Paint' }, { type: 'Composite', children: [{ type: 'Paint' }] }, ts(1.03, 'p166:div.x +is-play')])] };
  const b = readRun(jB);
  const bad = [];
  if (!(a.frame && a.frame.RecalculateStyles === 2 && a.frame.flips[0] === 'section.hero-track +he-css')) bad.push(`A ${JSON.stringify(a.frame)}`);
  if (!(b.frame && b.frame.Paint === 2 && b.frame.Composite === 1 && b.before && b.before.records === 1)) bad.push(`B ${JSON.stringify(b)}`);
  console.log(bad.length ? `SELFTEST FAIL ${bad.join(' | ')}` : 'SELFTEST ok (spot A by the first moving rAF frame, spot B by the is-play stamp, nested counts)');
  process.exit(bad.length ? 1 : 0);
}

const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'out/p166/sim';
const rows = readdirSync(dir).filter((f) => /^tl-.*\.json$/.test(f)).sort().map((f) => readRun(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
for (const r of rows) {
  const f = r.frame;
  console.log(`${r.arm.padEnd(6)} ${r.spot} ${r.rep} he ${r.he} ${r.how}: ` + (f ? `styles ${f.RecalculateStyles} layout ${f.Layout} paint ${f.Paint} composite ${f.Composite} fn ${f.FunctionCall} ev ${f.EventDispatch} timer ${f.TimerFire} recs ${f.records} flips [${f.flips.join('; ').slice(0, 160)}]` : 'no frame') +
    (r.after ? ` | next: styles ${r.after.RecalculateStyles} layout ${r.after.Layout} paint ${r.after.Paint} flips [${r.after.flips.join('; ').slice(0, 80)}]` : '') + (r.errors.length ? ` ERRORS ${r.errors.join('; ')}` : ''));
}
const ji = process.argv.indexOf('--json'); if (ji > 0) writeFileSync(process.argv[ji + 1], JSON.stringify(rows, null, 1));
