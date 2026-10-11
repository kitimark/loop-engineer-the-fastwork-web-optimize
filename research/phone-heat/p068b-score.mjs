#!/usr/bin/env node
// P-068b scorer (cap-heat-builds, 2026-10-11): P-068's per-segment scorer (heat.mjs scoreSegments: OLS slope over
// 60-360 s, corrected to 37.0 C with k = 0.045 /min) applied to the arms F, B, V (= v6) and M (= g0.0m), plus the
// per-segment start/end battery, the start mode (gates.jsonl), the thermal state at the hold's start and end (the
// I-186 profile reads in seg-<id>.log) and the charge mode. Deltas between builds use P-068's "fixes vs baseline" rule
// (|delta| 0.05 C/min in BOTH sessions). Research only; reads out/p068b/, writes out/p068b/score.json.
//   node research/phone-heat/p068b-score.mjs [--dir out/p068b]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreSegments, PRE } from './heat.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const dir = resolve(REPO, argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : 'out/p068b');
const jsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const lines = jsonl(join(dir, 'samples.jsonl'));
const gates = jsonl(join(dir, 'gates.jsonl'));
const r3 = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : null);

/** Thermal state words from a segment hold's log: the profile start read and the hold's end read (I-186 lines). */
export function thermalOf(log) {
  const start = log.match(/PROFILE \S+ ok at the hold's start: phone is ([A-Za-z]+[^,(]*)/)?.[1]?.trim() ?? null;
  const end = log.match(/PROFILE \S+ held to the hold's end: phone is ([A-Za-z]+[^,;(]*)/)?.[1]?.trim()
    ?? log.match(/PROFILE-DRIFT \S+: at the hold's end the phone is ([A-Za-z]+[^,;(]*)/)?.[1]?.trim() ?? null;
  return { start, end, drift: /PROFILE-DRIFT/.test(log) };
}

const segs = scoreSegments(lines).map((s) => {
  const ss = lines.filter((l) => l.kind === 'sample' && l.id === s.id && typeof l.tC === 'number');
  const end = ss.filter((l) => l.sNominal <= 360).sort((a, b) => b.sNominal - a.sNominal)[0];
  const g = gates.findLast((x) => x.id === s.id);
  const lf = join(dir, `seg-${s.id}.log`);
  return { ...s, endC: end?.tC ?? null, start: g?.start ?? null, gateC: g?.gateC ?? null, thermal: existsSync(lf) ? thermalOf(readFileSync(lf, 'utf8')) : null };
});
const ok = segs.filter((s) => !s.void && !s.chargeExcluded && typeof s.corr === 'number');
const get = (h, a, f) => ok.findLast((s) => s.session === h && s.arm === a)?.[f]; // an end-of-session re-run, if any
const ARMS = ['F', 'B', 'V', 'M'], H = ['H1', 'H2'];
const per = Object.fromEntries(ARMS.map((a) => [a, { corr: H.map((h) => r3(get(h, a, 'corr'))), raw: H.map((h) => r3(get(h, a, 'slope'))) }]));
const pair = (a, b, f) => H.map((h) => { const x = get(h, a, f), y = get(h, b, f); return typeof x === 'number' && typeof y === 'number' ? r3(x - y) : null; });
function decide(a, b) { // P-068's X-vs-B rule, read as "b runs cooler than a" (a - b >= +0.05 in both sessions)
  const dc = pair(a, b, 'corr'), dr = pair(a, b, 'slope');
  if (dc.some((v) => v === null)) return { dCorr: dc, dRaw: dr, verdict: 'incomplete' };
  const all = (p) => dc.every(p);
  let v = all((x) => x >= PRE.fixC) ? `${b} cooler than ${a}` : all((x) => x <= -PRE.fixC) ? `${b} hotter than ${a}` : all((x) => Math.abs(x) < PRE.fixC) ? 'no detectable change' : 'inconclusive';
  if (/cooler|hotter/.test(v) && !dr.every((x) => (v.includes('cooler') ? x > 0 : x < 0))) v += ' (start-sensitive: raw slopes disagree in sign)';
  return { dCorr: dc, dRaw: dr, verdict: v };
}
const out = {
  pre: PRE,
  segments: segs,
  perArm: per,
  excessOverFloor: Object.fromEntries(['B', 'V', 'M'].map((a) => [a, pair(a, 'F', 'corr')])),
  floorCheck: H.map((h) => { const f = get(h, 'F', 'corr'); const o = ['B', 'V', 'M'].map((a) => get(h, a, 'corr')).filter((x) => typeof x === 'number'); return typeof f === 'number' ? o.every((x) => x > f) : null; }),
  compare: { 'B-V': decide('B', 'V'), 'B-M': decide('B', 'M'), 'V-M': decide('V', 'M') },
};
writeFileSync(join(dir, 'score.json'), JSON.stringify(out, null, 1));
console.log('| segment | arm | start | gate C | t0 C | t360 C | mean C | raw | corr | idle | cycles slope | n | cycles | thermal start -> end | charge |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const s of segs) console.log(`| ${s.id} | ${s.arm} | ${s.start} | ${s.gateC} | ${s.startC} | ${s.endC} | ${s.meanC} | ${s.slope} | ${s.corr} | ${s.idleSlope} | ${s.cycleSlope} | ${s.n} | ${s.cycles} | ${s.thermal ? `${s.thermal.start} -> ${s.thermal.end}${s.thermal.drift ? ' (drift)' : ''}` : '?'} | ${s.chargeMode}${s.chargeExcluded ? ' EXCLUDED' : ''}${s.void ? ' VOID ' + s.void : ''} |`);
console.log(JSON.stringify({ perArm: out.perArm, excessOverFloor: out.excessOverFloor, floorCheck: out.floorCheck, compare: out.compare }, null, 1));
