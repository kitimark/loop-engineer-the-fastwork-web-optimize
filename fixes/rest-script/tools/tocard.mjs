#!/usr/bin/env node
// rest-script scorer v2 (P-078): Chrome census.mjs / Simulator simcensus.mjs outputs -> costcard.mjs records (ts-costcard
// schema, I-083) plus the registered verdict table. No Fastwork code in this file.
// Arms: C = st6-rb2 rep 1, C2 = st6-rb2 rep 2 (A/A), V = rest-script (every rep). One records file per engine x width
// (x reduced). Windows: one per position, kind "rest-<label>" (per window; costcard reads them "per 2 s").
// Position classes (prediction 1), from layout values recorded in the C rep 1 run itself (rowTop = the avatar row's
// viewport top, vh = Chrome emulated height / Sim innerHeight, gate = #people data-start-selling-scene), row height 32 px:
//   paused     gate == 'paused'                                              -> V = C predicted
//   far        gate == 'active' and (rowTop >= 1.5 vh + 50 or rowTop + 32 <= -0.5 vh - 50)   -> V < C predicted
//   near       gate == 'active' and rowTop < 1.5 vh - 50 and rowTop + 32 > -0.5 vh + 50     -> V = C predicted
//   border     otherwise (within 50 px of the fix's 50 % rootMargin band edge), or the classes of C/C2/V runs differ
//              (gate attribute differs) -> reported, not scored
// Per-event rows: rotator-slide = each 'far' window scaled to one 1020 ms slide; pain-tick = the 'pain' window scaled to 3 s.
// Verdict per row and count, pooled over reps: floor = max(2, |C1 - C2|); SAVE when min(C1, C2) - max(V) > floor; MORE
// when min(V) - max(C1, C2) > floor; else SAME. (Every V rep has to clear both C reps by more than the A/A spread.)
// usage: node tocard.mjs --engine chrome|sim --tag <w430> --st6 a.json,b.json --fix a.json,b.json --out <records.json>
import { readFileSync, writeFileSync } from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ENGINE = arg('--engine'), TAG = arg('--tag'), OUT = arg('--out');
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
const st6 = arg('--st6').split(',').map(load), fix = arg('--fix').split(',').map(load);
const KEYS = ENGINE === 'chrome'
  ? { mainFrames: 'mainFrames', styleRecalcs: 'styleRecalc', layouts: 'layout', paints: 'paint', timerFires: 'timerFire', rafFires: 'rafFire', compositorFrames: 'drawFrame' }
  : { mainFrames: 'RenderingFrame', styleRecalcs: 'RecalculateStyles', layouts: 'Layout', paints: 'Paint', timerFires: 'TimerFire', rafFires: 'FireAnimationFrame', composites: 'Composite', functionCalls: 'FunctionCall', codeCalls: 'bundleCalls' };
const SHOW = ['mainFrames', 'styleRecalcs', 'layouts', 'paints', 'timerFires', 'rafFires', 'codeCalls'];
const ROWH = 32;
const ms = (p) => (ENGINE === 'chrome' ? p.win : p.ms);
const vhOf = (r) => (ENGINE === 'chrome' ? r.vh : r.view?.ih);
const raw = (p, k) => ((p.per2s?.[KEYS[k]] ?? 0) * ms(p)) / 2000;
const codeCalls = (p) => (ENGINE === 'chrome' ? (Object.values(p.calls2s || {}).reduce((a, b) => a + b, 0) * ms(p)) / 2000 : raw(p, 'codeCalls'));
const classOf = (p, vh) => {
  if (p.gate === 'paused') return 'paused';
  if (p.gate !== 'active' || p.rowTop == null || !vh) return 'border';
  const t = p.rowTop;
  if (t >= 1.5 * vh + 50 || t + ROWH <= -0.5 * vh - 50) return 'far';
  if (t < 1.5 * vh - 50 && t + ROWH > -0.5 * vh + 50) return 'near';
  return 'border';
};
const C0 = st6[0];
const cls = Object.fromEntries(C0.positions.map((p) => [p.label, classOf(p, vhOf(C0))]));
for (const r of [...st6, ...fix]) for (const p of r.positions) if (cls[p.label] && p.gate !== C0.positions.find((q) => q.label === p.label)?.gate) cls[p.label] = 'border';
const win = (p, kind, scale) => {
  const w = { kind, ms: Math.round(ms(p) * scale) };
  for (const k of Object.keys(KEYS)) if (k !== 'codeCalls') w[k] = +(raw(p, k) * scale).toFixed(2);
  w.codeCalls = +(codeCalls(p) * scale).toFixed(2);
  return w;
};
const mk = (r, arm, rep) => ({
  arm, rep, mode: 'full', engine: ENGINE,
  ...(r.fatal ? { void: 'probe fatal: ' + r.fatal.split('\n')[0] } : {}),
  windows: r.positions.filter((p) => p.per2s).flatMap((p) => [
    win(p, `rest-${p.label}`, 1),
    ...(cls[p.label] === 'far' ? [win(p, `rotator-slide@${p.label}`, 1020 / ms(p))] : []),
    ...(p.label === 'pain' ? [win(p, 'pain-tick', 3000 / ms(p))] : []),
  ]),
});
const loads = [];
st6.forEach((r, i) => loads.push(mk(r, i === 0 ? 'C' : 'C2', i + 1)));
fix.forEach((r, i) => loads.push(mk(r, 'V', i + 1)));
const kinds = [...new Set(loads.flatMap((l) => l.windows.map((w) => w.kind)))];
const rows = [];
for (const kind of kinds) {
  const label = kind.replace(/^rest-|^rotator-slide@/, '').replace(/^pain-tick$/, 'pain');
  const vals = (arm, k) => loads.filter((l) => l.arm === arm && !l.void).map((l) => l.windows.find((w) => w.kind === kind)?.[k]).filter((v) => v != null);
  const row = { kind, class: cls[label] ?? 'border', counts: {} };
  for (const k of SHOW) {
    const c1 = vals('C', k)[0], c2 = vals('C2', k)[0], v = vals('V', k);
    if (c1 == null || c2 == null || !v.length) { row.counts[k] = { verdict: 'MISSING' }; continue; }
    const floor = Math.max(2, Math.abs(c1 - c2));
    const verdict = Math.min(c1, c2) - Math.max(...v) > floor ? 'SAVE' : Math.min(...v) - Math.max(c1, c2) > floor ? 'MORE' : 'SAME';
    row.counts[k] = { C: +c1.toFixed(1), C2: +c2.toFixed(1), V: v.map((x) => +x.toFixed(1)), floor: +floor.toFixed(1), verdict };
  }
  rows.push(row);
}
writeFileSync(OUT, JSON.stringify({ topic: 'rest-script', tag: TAG, engine: ENGINE, scorer: 'tocard v2', classes: cls, loads, rows }, null, 1));
console.log(`# ${ENGINE} ${TAG} (C/C2/V reps, verdict); classes ${JSON.stringify(cls)}`);
for (const r of rows) console.log(`${r.kind} [${r.class}]: ${SHOW.map((k) => { const c = r.counts[k]; return c.verdict === 'MISSING' ? `${k} -` : `${k} ${c.C}/${c.C2}/${c.V.join(',')} ${c.verdict}`; }).join(' | ')}`);
