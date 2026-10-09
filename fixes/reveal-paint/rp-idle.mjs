#!/usr/bin/env node
// reveal-paint: the idle census reader (lead ruling 2 on D for g0.0m). Input: rp-sim.mjs records made with RP_DRIVE=none,
// RP_IDLE_MS=30000 and RP_VISIT=<y,...>. Per record: the layer memory at the top (C0b), the Timeline paints in the 30 s
// idle window, and the layers that painted during it (paint-count delta over the census artefact), split into #people
// (an owner path inside #people) and the rest; then the visit census (MB and layer count at each RP_VISIT y). Per arm:
// medians. Counts and MB are the verdict; Simulator ms are not used here.
//   node fixes/reveal-paint/rp-idle.mjs out/reveal-paint/i{2,3,4}/*.json
import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rows = [];
for (const f of process.argv.slice(2).filter((a) => a.endsWith('.json') && !/serve-/.test(a))) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  if (r.drive !== 'none' || !r.idle) { console.log(`${f}: not an idle record (drive ${r.drive})`); continue; }
  const L = r.layers || {}, own = L.owners || {};
  const painted = (L.changed || []).filter((l) => l.d > l.art);
  const isPeople = (id) => /#people|start-selling-future|start-selling-profile/.test(`${own[id]?.path || ''} ${own[id]?.sel || ''}`);
  const ppl = painted.filter((l) => isPeople(l.id));
  const rest = painted.filter((l) => !isPeople(l.id));
  const sum = (a) => a.reduce((s, l) => s + (l.d - l.art), 0);
  const visit = Object.fromEntries((r.visit || []).map((v) => [v.y, v.mb]));
  rows.push({ rec: `${basename(dirname(f))}/${basename(f)}`, arm: r.arm, mbTop: Math.round(L.mem0 / 1e5) / 10, mbEnd: Math.round(L.mem1 / 1e5) / 10,
    tlPaints: r.idle.paints, kpx2: Math.round(r.idle.area / 1e3), pplLayers: ppl.length, pplPaints: sum(ppl), restPaints: sum(rest),
    ppl: ppl.map((l) => `${(own[l.id]?.sel || '?').slice(0, 36)}:${l.d - l.art}`).join(' '), visit });
}
const ys = [...new Set(rows.flatMap((r) => Object.keys(r.visit)))].sort((a, b) => a - b);
console.log(['record', 'arm', 'MB top', 'MB end of idle', 'Timeline paints', 'paint kpx2', '#people layers painted', '#people layer paints', 'other layer paints', ...ys.map((y) => `MB at y ${y}`), '#people painters'].join(' | '));
for (const r of rows) console.log([r.rec, r.arm, r.mbTop, r.mbEnd, r.tlPaints, r.kpx2, r.pplLayers, r.pplPaints, r.restPaints, ...ys.map((y) => r.visit[y] ?? '-'), r.ppl || '-'].join(' | '));
for (const arm of [...new Set(rows.map((r) => r.arm))]) {
  const a = rows.filter((r) => r.arm === arm);
  console.log([`median ${arm} (n ${a.length})`, '', med(a.map((r) => r.mbTop)), med(a.map((r) => r.mbEnd)), med(a.map((r) => r.tlPaints)), med(a.map((r) => r.kpx2)), med(a.map((r) => r.pplLayers)), med(a.map((r) => r.pplPaints)), med(a.map((r) => r.restPaints)), ...ys.map((y) => med(a.map((r) => r.visit[y])))].join(' | '));
}
