#!/usr/bin/env node
// Tables for research/headless-60-calibration/README.md from h60.mjs result files.
//   node analyze.mjs <file.json>... [--by label|cpu|tag] [--phase scrollSummary|idle|morph] [--md]
// Groups runs, prints median [min-max] per metric, the distance to the phone (calibration formula: mean relative
// difference over >34, >50, >100, worst, with +1 smoothing) and, for two groups, whether the ranges overlap.
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const files = argv.filter((a, i) => a.endsWith('.json') && !(i > 0 && argv[i - 1].startsWith('--')));
const BY = opt('by', 'cpu');
const PHASE = opt('phase', 'scrollSummary');
const runs = files.flatMap((f) => { const d = JSON.parse(readFileSync(f, 'utf8')); return d.results.map((r) => ({ ...r, tag: d.tag, file: f })); });
// phone S references (ms thresholds, 60 Hz): calibration iphone.md (live, mean of 3) and iphone-wave2 B2/B3 (mirror)
// primary: the mirror (iphone-wave2 goal-B2/B3, the current serving; tools/phone.mjs), medians of the two clean runs;
// ms form: >34, >50; tick form (lead, 2026-10-02): k>=3, k>=4 (k = round(dt / 16.667)); both with >100 and worst
const PHONE = { gt34: 14.5, gt50: 5, k3: 9.5, k4: 2, gt100: 1, max: 112.5 };
const PHONE_LIVE = { gt34: 15.7, gt50: 5.7, gt100: 0.7, max: 104 }; // iphone.md, live site, mean of 3 (the 2026-09-30 calibration)
const d = (m, ref, ks) => ks.reduce((a, k) => a + Math.abs(m[k] - ref[k]) / (ref[k] + 1), 0) / ks.length;
const dist = (m) => d(m, PHONE, ['k3', 'k4', 'gt100', 'max']);
const distMs = (m) => d(m, PHONE, ['gt34', 'gt50', 'gt100', 'max']);
const distLive = (m) => d(m, PHONE_LIVE, ['gt34', 'gt50', 'gt100', 'max']);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const M = ['fps', 'gt20', 'gt30', 'gt34', 'gt38', 'gt46', 'gt50', 'gt54', 'gt100', 'k3', 'k4', 'max', 'p95', 'loafMs', 'forcedMs'];
const key = (r) => (BY === 'cpu' ? `${r.cpu}x` : BY === 'label' ? r.label : BY === 'tag' ? r.tag : `${r.tag}/${r.label}`);
const groups = new Map();
for (const r of runs) { if (!r[PHASE]) continue; const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
const rows = [];
for (const [k, rs] of groups) {
  const row = { group: k, n: rs.length };
  const meds = {};
  for (const m of M) { const xs = rs.map((r) => r[PHASE][m]); meds[m] = med(xs); row[m] = `${Math.round(med(xs) * 10) / 10} [${Math.min(...xs)}-${Math.max(...xs)}]`; }
  row.distK = Math.round(dist(meds) * 100) / 100; row.distMs = Math.round(distMs(meds) * 100) / 100; row.distLive = Math.round(distLive(meds) * 100) / 100;
  const ld = rs.map((r) => r.host.load1Start), busy = rs.map((r) => r.host.scroll?.busyPct).filter((x) => x != null), chrome = rs.map((r) => r.host.scroll?.chromeCpuPct).filter((x) => x != null);
  row.load1 = `${Math.min(...ld)}-${Math.max(...ld)}`; row.hostBusy = `${med(busy)} [${Math.min(...busy)}-${Math.max(...busy)}]`; row.chromeCpu = med(chrome);
  row.spin = med(rs.map((r) => r.spin.factor)); row.errors = rs.reduce((a, r) => a + r.errors.length, 0); row.morph = rs.filter((r) => r.morphReached).length;
  row._vals = Object.fromEntries(M.map((m) => [m, rs.map((r) => r[PHASE][m])]));
  rows.push(row);
}
if (argv.includes('--md')) {
  const cols = ['group', 'n', 'fps', 'gt34', 'gt30', 'gt38', 'gt50', 'gt46', 'gt54', 'gt100', 'k3', 'k4', 'max', 'loafMs', 'distK', 'distMs', 'distLive', 'load1', 'hostBusy', 'chromeCpu', 'spin'];
  console.log('| ' + cols.join(' | ') + ' |'); console.log('|' + cols.map(() => '---').join('|') + '|');
  for (const r of rows) console.log('| ' + cols.map((c) => r[c]).join(' | ') + ' |');
} else console.table(rows.map(({ _vals, ...r }) => r));
if (rows.length === 2) {
  const [a, b] = rows;
  console.log(`\n${a.group} -> ${b.group}: ranges (disjoint = "better"/"WORSE" by fix.mjs ab's rule)`);
  const dj = (m) => { const A = a._vals[m], B = b._vals[m]; return Math.max(...A) < Math.min(...B) || Math.max(...B) < Math.min(...A); };
  for (const [ms, k] of [['gt34', 'k3'], ['gt50', 'k4']]) console.log(`  ${k} vs legacy ${ms}: ${dj(k) === dj(ms) ? 'same verdict' : 'THRESHOLD-SENSITIVE (the tick and ms verdicts differ)'}`);
  for (const m of M) {
    const A = a._vals[m], B = b._vals[m];
    const disjoint = dj(m);
    console.log(`  ${m.padEnd(8)} ${String(med(A)).padStart(6)} -> ${String(med(B)).padStart(6)}  delta ${Math.round((med(B) - med(A)) * 10) / 10}${med(A) ? ` (${Math.round((100 * (med(B) - med(A))) / med(A))} %)` : ''}  ${disjoint ? 'DISJOINT' : 'overlap'}`);
  }
}
