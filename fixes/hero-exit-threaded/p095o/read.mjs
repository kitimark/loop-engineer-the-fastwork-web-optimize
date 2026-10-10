#!/usr/bin/env node
// P-095o reader (written before data; fixes/hero-exit-threaded/README.md "P-095o"). The original (O) next to P-095's
// C (v4 = best-build) and V (v6 = B-R2), hero band, driver G. A pure reader: no device.
//   node fixes/hero-exit-threaded/p095o/read.mjs <folder> [--json out.json]        (folder: out/p095o/runs)
// Counts come from P-095's own frame scorer, unchanged: framesF.mjs (sha256 40d0d302c3f1), scope 'band' = moving
// hero-band frames, y 1..780, dt > 30/34/38 (the >34 line and its twins) and > 46/50/54. Per arm the counted runs O1-O3,
// C1-C3, V1-V3; a re-run <run>r replaces a void first try (the block log's ITEM ... VOID lines name them; a run is void
// here too when its record or Timeline file is missing). Writer share per run from scoreF.mjs (reported only).
// COMPARISON per pair (>34 band counts per run, >= 2 valid runs per arm, else THIN; both sentinels PASS, else VOID), the
// same range rule as P-137 / P-137o: BETTER = max(new) < min(old) ("BETTER, median <= half" when also median(new) <=
// 0.5 median(old)), WORSE = min(new) > max(old), OVERLAP otherwise. Pairs: C vs O, V vs O, V vs C (P-095's own pair, with
// P-095's delta line too: median V - median C, no-worse when <= +2 at >34, <= +1 at >50). Twins >30/>38: a twin with
// another word makes it "threshold-sensitive".
// 4 OCT (descriptive): P-095's committed band >34 counts, C 27/37/22 and V 26/8/12, against today's C and V with the
// same range rule. 4 Oct was REAL Serious, today is tool-held (Xcode-condition) Serious: different heat profiles.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FRAMES = join(here, '..', 'pF', 'framesF.mjs'), SCORE = join(here, '..', 'pF', 'scoreF.mjs');
const FN = { O: 'C:s=4163', C: 'C:s=4391', V: 'V:s=4503,heRest=4455' };
const TH = ['>30', '>34', '>38', '>46', '>50', '>54'];
const OCT4 = { C: [27, 37, 22], V: [26, 8, 12] };
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export function rule(old, neu) {
  if (old.length < 2 || neu.length < 2) return 'THIN';
  if (Math.max(...neu) < Math.min(...old)) return med(neu) <= 0.5 * med(old) ? 'BETTER, median <= half' : 'BETTER';
  if (Math.min(...neu) > Math.max(...old)) return 'WORSE';
  return 'OVERLAP';
}
const a = process.argv.slice(2);
if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/hero-exit-threaded/p095o/read.mjs <folder> [--json out.json]'); process.exit(a[0] ? 0 : 2); }
const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
const log = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].map((h) => join(dir, '..', `hold-${h}.log`)).filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');
const voidRuns = new Set([...log.matchAll(/^ITEM (\S+) VOID/gm)].map((m) => m[1]));
const out = { sentinels: {}, runs: {}, invalid: {}, per: { O: [], C: [], V: [] } };
for (const s of ['S0', 'S1']) {
  const f = join(dir, `s-${s}.json`);
  try { const m = JSON.parse(readFileSync(f, 'utf8')).meta || {}; out.sentinels[s] = { pass: m.sentinel?.pass === true, value: m.sentinel?.value ?? null }; } catch { out.sentinels[s] = { pass: false, value: 'no record' }; }
}
const pick = [];
for (const arm of ['O', 'C', 'V']) for (let k = 1; k <= 3; k++) {
  const base = `${arm}${k}`; let used = null;
  for (const name of [base, `${base}r`]) {
    const g = join(dir, `g-${name}.json`), tl = join(dir, `tl-${name}.json`);
    if (!existsSync(g)) continue;
    if (voidRuns.has(name) || !existsSync(tl)) { out.invalid[name] = voidRuns.has(name) ? 'void in the block log' : 'no Timeline file'; continue; }
    used = name; pick.push({ arm, name, g, tl }); break;
  }
  if (!used) out.invalid[base] ||= 'no valid try';
}
const tmp = join(dir, 'framesF-p095o.json');
const fr = spawnSync('node', [FRAMES, ...pick.map((p) => `${p.arm}:${p.g}`), '--band', '1:780', '--json', tmp], { encoding: 'utf8' });
if (fr.status !== 0) { console.log(`framesF failed: ${fr.stderr || fr.stdout}`); process.exit(1); }
const ff = JSON.parse(readFileSync(tmp, 'utf8'));
for (const p of pick) {
  const r = ff.runs.find((x) => x.file === p.g);
  const sc = spawnSync('node', [SCORE, `${FN[p.arm].split(':')[0]}:${p.g}:${p.tl}`, '--fn', FN[p.arm], '--band', '1:780'], { encoding: 'utf8' });
  const ln = (sc.stdout || '').split('\n').find((l) => /^[CV] \S+: (VOID|valid)/.test(l)) || '';
  const share = (ln.match(/share ([\d.]+|null)/) || [])[1] ?? null;
  const gj = JSON.parse(readFileSync(p.g, 'utf8')), pr = gj.meta?.profile || {}, s = pr.start || {}, e = pr.end || {};
  out.runs[p.name] = { arm: p.arm, band: r.band, writerShare: share, heat: `${s.state ?? '?'} ${s.battC ?? '?'} -> ${e.state ?? '?'} ${e.battC ?? '?'} (${e.holder || s.holder || '?'})` };
  out.per[p.arm].push(r.band);
}
const sentOk = out.sentinels.S0.pass && out.sentinels.S1.pass;
const col = (arm, th) => out.per[arm].map((b) => b[th]);
out.medians = Object.fromEntries(['O', 'C', 'V'].map((arm) => [arm, Object.fromEntries(TH.map((th) => [th, med(col(arm, th))]))]));
const pair = (old, neu) => {
  const w = Object.fromEntries(TH.map((th) => [th, rule(col(old, th), col(neu, th))]));
  return { '>34': w['>34'] + (w['>30'] !== w['>34'] || w['>38'] !== w['>34'] ? ' [threshold-sensitive]' : ''), twins: { '>30': w['>30'], '>38': w['>38'] }, gt50: { '>46': w['>46'], '>50': w['>50'], '>54': w['>54'] } };
};
out.result = sentOk ? { 'C vs O': pair('O', 'C'), 'V vs O': pair('O', 'V'), 'V vs C': pair('C', 'V'),
  'P-095 delta V - C': { '>34': med(col('V', '>34')) - med(col('C', '>34')), '>50': med(col('V', '>50')) - med(col('C', '>50')) } } : 'VOID (a sentinel failed or is missing)';
out.oct4 = { C: { oct4: OCT4.C, today: col('C', '>34'), reading: rule(OCT4.C, col('C', '>34')) }, V: { oct4: OCT4.V, today: col('V', '>34'), reading: rule(OCT4.V, col('V', '>34')) } };
console.log(`P-095o read: sentinels ${JSON.stringify(out.sentinels)}`);
for (const [n, r] of Object.entries(out.runs)) console.log(`  ${n} (${r.arm}) band n ${r.band.n} ${TH.map((th) => `${th} ${r.band[th]}`).join(' ')} near34 ${r.band.near34} | writer share ${r.writerShare} | heat ${r.heat}`);
for (const [n, w] of Object.entries(out.invalid)) console.log(`  INVALID ${n}: ${w}`);
console.log(`MEDIANS ${JSON.stringify(out.medians)}`);
console.log(`RESULT ${JSON.stringify(out.result)}`);
console.log(`OCT4 (today vs 4 Oct, OVERLAP = same within spread; different heat profiles) ${JSON.stringify(out.oct4)}`);
delete out.per;
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
