#!/usr/bin/env node
// P-137o reader (written before data; fixes/end-bg/README.md "P-137o"). The original (O) against C (v9-final +
// morph-scroll 7d) at the end of the page, on P-137's script, procedure and metric. A pure reader: no device.
//   node fixes/end-bg/phone/p137o-read.mjs <folder> [--json out.json]
// It reuses P-137's frozen reader unchanged (p137-read.mjs: metric() = moving frames in the lastScreen band after a
// touchend, s(th) for th 30/34/38/46/50/54; decide() = its verdict rule; both on P-129's readRun gates G1-G6). Runs: EO1-4
// (arm O) and EC1-4 (arm C), a re-run <run>r replaces an INVALID first try; sentinels S0/S1 on C.
// COMPARISON (>34, per-run counts, >= 3 valid runs per arm, both sentinels PASS): P-137's rule with O in the control
// role and C in the changed role, so its words read: CAUSE = "C BETTER, median at most half of O's" (max C < min O and
// median C <= 0.5 median O), CONTRIBUTES = "C BETTER" (max C < min O), WORSE = "C WORSE" (min C > max O), NOT SHOWN =
// "OVERLAP". Twins >30/>38 (threshold-sensitive when they differ), >50 with twins >46/>54 reported; denominator guard
// (rates when median n differs by > 15 %) as P-137.
// DRIFT (descriptive, decides nothing): today's C against 5 Oct's C (P-137 §5's committed >34 counts of EC1-EC4: 30, 17,
// 14, 15; its Timeline files no longer exist, so they cannot be re-read); the same rule on the two C sets: ranges
// overlap = "same within run-to-run spread", else "drifted" with the direction.
// HEAT: per run the start/end thermal state, battery °C and condition holder from the run record (meta.profile).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { readRun } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const { metric, decide, verdict } = await import(pathToFileURL(join(here, 'p137-read.mjs')).href);
const WORDS = { CAUSE: 'C BETTER (median <= half of O)', CONTRIBUTES: 'C BETTER', WORSE: 'C WORSE', 'NOT SHOWN': 'OVERLAP', THIN: 'THIN' };
const word = (v) => String(v).replace(/^(CAUSE|CONTRIBUTES|WORSE|NOT SHOWN|THIN)/, (m) => WORDS[m]);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

function readArm(dir, arm, names) {
  const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const runs = {}, invalid = {}, per = [];
  for (const base of names) {
    let used = null;
    for (const name of [base, `${base}r`]) {
      const g = load(`g-${name}.json`), tl = load(`tl-${name}.json`);
      if (!g) continue;
      const r = readRun(g, tl, 'E');
      if (r.why.length) { invalid[name] = r.why; continue; }
      used = name; const m = metric(g, r);
      const p = g.meta?.profile || {}, s = p.start || {}, e = p.end || {};
      const heat = { start: `${s.state ?? '?'} ${s.battC ?? '?'}`, end: `${e.state ?? '?'} ${e.battC ?? '?'}`, holder: e.holder || s.holder || (s.induced === 'Yes' ? 'Xcode' : '?') };
      runs[name] = { arm, idle: r.idle, drift: r.drift, heat, ...m }; per.push(m); break;
    }
    if (!used) invalid[base] ||= ['no valid try'];
  }
  return { runs, invalid, per };
}

const a = process.argv.slice(2);
if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/end-bg/phone/p137o-read.mjs <folder> [--json out.json]'); process.exit(a[0] ? 0 : 2); }
const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
const OCT5_C34 = [30, 17, 14, 15]; // P-137 §5, EC1-EC4 >34
const out = { sentinels: {} };
for (const s of ['S0', 'S1']) {
  const f = join(dir, `g-${s}.json`); const g = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  const r = g ? readRun(g, null, 'S') : null;
  out.sentinels[s] = r ? { fps: r.fps, slowShare: r.slowShare, sentinel: r.sentinel } : { sentinel: 'FAIL (no record)' };
}
const O = readArm(dir, 'O', ['EO1', 'EO2', 'EO3', 'EO4']), C = readArm(dir, 'C', ['EC1', 'EC2', 'EC3', 'EC4']);
out.runs = { ...O.runs, ...C.runs }; out.invalid = { ...O.invalid, ...C.invalid };
const sentOk = Object.values(out.sentinels).every((s) => s.sentinel === 'PASS');
if (sentOk) {
  const d = decide({ C: O.per, V: C.per });
  out.result = { basis: d.basis.replace('C ', 'O ').replace('V ', 'C '), decision: word(d.decision),
    twins: Object.fromEntries(Object.entries(d.twins).map(([k, v]) => [k, word(v)])),
    gt50: Object.fromEntries(Object.entries(d.gt50).map(([k, v]) => [k, k === 'note' ? v : word(v)])),
    medians: { O: d.medians.C, C: d.medians.V } };
} else out.result = { decision: 'VOID (a sentinel failed or is missing)' };
{
  const t = C.per.map((m) => m.s[34]), o = OCT5_C34;
  const v = verdict(o, t);
  out.drift = { oct5C: o, todayC: t, medOct5: med(o), medToday: med(t),
    reading: v === 'NOT SHOWN' ? 'same within run-to-run spread (ranges overlap)' : v === 'WORSE' ? 'drifted: today higher (ranges apart)' : v === 'THIN' ? 'thin' : 'drifted: today lower (ranges apart)' };
}
console.log(`P-137o read: sentinels ${JSON.stringify(out.sentinels)}`);
for (const [n, r] of Object.entries(out.runs)) console.log(`  ${n} (${r.arm}) n ${r.n} >30 ${r.s[30]} >34 ${r.s[34]} >38 ${r.s[38]} | >46 ${r.s[46]} >50 ${r.s[50]} >54 ${r.s[54]} | busy ${JSON.stringify(r.cls)} tb ${r.tbShare} fpsAll ${r.fpsAll} | idle ${r.idle} | heat ${r.heat.start} -> ${r.heat.end} (${r.heat.holder})`);
for (const [n, w] of Object.entries(out.invalid)) console.log(`  INVALID ${n}: ${w.join('; ')}`);
console.log(`RESULT ${JSON.stringify(out.result)}`);
if (out.drift) console.log(`DRIFT C today vs 5 Oct ${JSON.stringify(out.drift)}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
