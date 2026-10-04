#!/usr/bin/env node
// p100-score.mjs: P-100 display-rate diagnostic (PHONE TICKET P-100 in fixes/cd-roll-ca/README.md), committed before any
// phone data. Reads p100-rec.mjs records (their `summary`, from p100-lib.mjs summarize) and prints, per arm, medians
// over its records, then the registered outcomes. Counts and rates only; no frame-time gate.
// usage: node fixes/cd-roll-ca/phone/p100-score.mjs <record.json> ... [--json out.json]
// Per record (p100-lib): surfaces.fastPerSec = displayed-surface gaps < 12.5 ms (faster than 80 Hz) per second of the
//   record; surfaces.perSec; vsync.lt12_5 = share of the panel's vsync gaps < 12.5 ms; caFps.median; thermal states.
// Void (dropped, reported): record error, no displayed-surfaces table, Thermal State not one single state, or arm
//   unknown. An arm needs >= 2 valid records, else "not enough".
// Outcomes (fixed before data):
//   O1 (F-212: does a Core Animation roll run faster than 60 Hz?) RAISED when med fastPerSec(ca) >= 10 and
//      >= 5 x max(med fastPerSec(raf), 1) and med fastPerSec(quiet) <= 2; NOT RAISED when med fastPerSec(ca) <= 2;
//      else UNCLEAR. If every valid record is at Serious and O1 is NOT RAISED, it reads "NOT RAISED AT SERIOUS" (a cap
//      at Serious is not ruled out; the ticket's Fair re-run row applies).
//   O2 (arch-gpu-lessons: a paused animation keeps its frame-rate request) KEPT when med vsync.lt12_5(paused) >= 0.5 and
//      med vsync.lt12_5(quiet) <= 0.1; NOT KEPT when med vsync.lt12_5(paused) <= 0.1; else UNCLEAR; "no vsync table"
//      when the device trace has none.
//   O3 (descriptive, the user's "B feels smoother"): med fastPerSec and perSec of V9 vs C8 (the real page at y 0),
//      printed with the ratio; no verdict.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const ARMS = ['quiet', 'ca', 'paused', 'raf', 'V9', 'C8'];
const med = (a) => { const s = a.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--json'));
const recs = files.map((f) => {
  const j = JSON.parse(readFileSync(f, 'utf8')), v = [], s = j.summary || {};
  if (j.error) v.push(`error ${j.error}`);
  if (!ARMS.includes(j.arm)) v.push(`unknown arm ${j.arm}`);
  if (!s.surfaces || !(s.surfaces.n > 1)) v.push('no displayed-surfaces table');
  if (!Array.isArray(s.thermal) || s.thermal.length !== 1) v.push(`thermal ${JSON.stringify(s.thermal ?? null)}`);
  return { file: f, label: j.label, arm: j.arm, void: v, thermal: s.thermal?.[0] ?? null, batt: j.battery ?? null,
    fastPerSec: s.surfaces?.fastPerSec ?? null, perSec: s.surfaces?.perSec ?? null, surfGapMedian: s.surfaces?.median ?? null,
    vsyncLt: s.vsync?.lt12_5 ?? null, vsyncPerSec: s.vsync?.perSec ?? null, caFps: s.caFps?.median ?? null, caFpsOver62: s.caFps?.over62 ?? null };
});
for (const r of recs) console.log(`R ${r.label}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; ${r.thermal}; batt ${r.batt?.start}->${r.batt?.end}; surfaces ${r.perSec}/s fast ${r.fastPerSec}/s gap med ${r.surfGapMedian} ms; vsync <12.5 ${r.vsyncLt} (${r.vsyncPerSec}/s); CA fps ${r.caFps}`);
const by = Object.fromEntries(ARMS.map((a) => { const ok = recs.filter((r) => r.arm === a && !r.void.length);
  return [a, { n: ok.length, fastPerSec: med(ok.map((r) => r.fastPerSec)), perSec: med(ok.map((r) => r.perSec)), vsyncLt: med(ok.map((r) => r.vsyncLt)), vsyncPerSec: med(ok.map((r) => r.vsyncPerSec)), caFps: med(ok.map((r) => r.caFps)) }]; }));
for (const a of ARMS) console.log(`ARM ${a}: n ${by[a].n}, fast/s ${by[a].fastPerSec}, surfaces/s ${by[a].perSec}, vsync <12.5 ${by[a].vsyncLt} (${by[a].vsyncPerSec}/s), CA fps ${by[a].caFps}`);
const enough = (...a) => a.every((x) => by[x].n >= 2);
const valid = recs.filter((r) => !r.void.length), allSerious = valid.length > 0 && valid.every((r) => r.thermal === 'Serious');
let O1 = 'not enough';
if (enough('ca', 'raf', 'quiet')) {
  const c = by.ca.fastPerSec, f = by.raf.fastPerSec, q = by.quiet.fastPerSec;
  O1 = c >= 10 && c >= 5 * Math.max(f, 1) && q <= 2 ? 'RAISED' : c <= 2 ? (allSerious ? 'NOT RAISED AT SERIOUS' : 'NOT RAISED') : 'UNCLEAR';
}
let O2 = 'not enough';
if (enough('paused', 'quiet')) {
  const p = by.paused.vsyncLt, q = by.quiet.vsyncLt;
  O2 = p == null || q == null ? 'no vsync table' : p >= 0.5 && q <= 0.1 ? 'KEPT' : p <= 0.1 ? 'NOT KEPT' : 'UNCLEAR';
}
const O3 = enough('V9', 'C8') ? { V9: { fastPerSec: by.V9.fastPerSec, perSec: by.V9.perSec }, C8: { fastPerSec: by.C8.fastPerSec, perSec: by.C8.perSec }, fastRatio: by.C8.fastPerSec ? +(by.V9.fastPerSec / by.C8.fastPerSec).toFixed(2) : null } : 'not enough';
console.log(`O1 (CA roll faster than 60 Hz): ${O1}`);
console.log(`O2 (paused animation keeps the rate): ${O2}`);
console.log(`O3 (page V9 vs C8, descriptive): ${JSON.stringify(O3)}`);
console.log(`scorer sha256 ${self}`);
const out = opt('--json');
if (out) writeFileSync(out, JSON.stringify({ scorer: self, records: recs, arms: by, allSerious, O1, O2, O3 }, null, 1));
