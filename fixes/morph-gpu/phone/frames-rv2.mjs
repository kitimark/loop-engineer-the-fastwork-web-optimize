#!/usr/bin/env node
// frames-rv2.mjs: the morph-gpu rev 2 phone block (PR-012 rev 2, arm A): the reveal with its setup moved off the
// tween-start frame (V = rv2a-ef9d1c9d5fca) against today's best build (C), driver M. A copy of frames-n2.mjs (P-092,
// f3a50b8ec2dd; scopes, thresholds, void and sentinel rules unchanged) with V's build changed and one addition, the
// per-tween start frames (review B1 falsifier, see "Tweens" below).
// usage: node frames-rv2.mjs <arm>:<run.json> ... [--json out]   (arms C = best-build, V = rev 2 A)
// Pass the counted runs in block order (warm-ups left out; files from a hold that failed a thermal-gate read are never
// passed). Frames: the std probe's rAF rows [t, dt, yStart, yEnd, innerHeight, m, ...] (m = the nav header's inline
// --morph, null before the first tween = 0), inside the 'drive' mark.
// Scopes per run:
//   'moving' (scored): tween frames, i.e. frames whose m differs from the previous frame's or the next frame's m;
//   'drive'  (reported): every frame of the drive phase; 'held1' (reported): m >= 0.999 and not moving.
// Amendment A6 (fixes/LEAD.md "Slot tickets"; reported, not scored): per run and arm median, 'dmWeightedDt' = the
// |delta m|-weighted dt over the drive frames, sum(|m_i - m_i-1| * dt_i) / sum(|m_i - m_i-1|) (ms), and 'sinceStart',
// the moving frames by time since their tween started (the t before the first frame that leaves a held m, as
// tweenStarts in tools/lib/iphone-probe.mjs), buckets [0,100) [100,250) [250,500) [500,inf) ms: n, >34, >50.
// Thresholds as CLAUDE.md "Frame thresholds" (phone): dt > 50 and dt > 34 (ms), the +-4 ms twins (>46 / >54, >30 / >38);
// near-band frames (30, 38] / (46, 54] counted and flagged. No k forms on the phone.
// Verdict per threshold, d = median(V) - median(C) over the valid runs of each arm:
//   'better'   when d <= -2 AND every V run's count is below every C run's count (the ranges do not overlap);
//   'no-worse' when d <= +1 ('>50' family) or d <= +2 ('>34' family) and not 'better' (the less-work phone bound, as
//              P-078 / P-081 / P-085);
//   'WORSE'    otherwise.
// threshold-sensitive: a twin's verdict differs from the main threshold's or the other twin's.
// No verdict ('insufficient', out.verdict.insufficient) while either arm has fewer than 3 valid runs (of 4): the block is
// void and is re-run once (ticket decision).
// Void run (listed, left out): meta.error; meta.driver not M; a warm-up; Low Power Mode (meta.settings.lowPowerMode true
// or meta.lowPowerSuspect); the served js/css not the arm's build (meta.served, sha256 prefixes); no 'drive' mark; the
// probe saw no m; tween starts in the probe frames != 2 x cycles.
// Counted runs carry --arm C / V, so iphone.mjs judges every counted C run as an M heat sentinel (tools/lib/iphone-run.mjs:
// meta.sentinel, held m=1 p95 <= 18 ms). Protocol v2 §5.2: a failing control voids every run since the last passing one;
// this scorer applies that in the order the files are passed (block order): a C run whose meta.sentinel.pass is not
// true (false = a fail; a missing sentinel or pass null = not judged, treated as a fail, P-092 R1) voids itself and
// every counted run after the previous passing C run. The block's S-driver sentinels (start / end)
// are judged by iphone.mjs and the runner, not here.
// Tweens (rev 2, scored): from the driver's own rAF rows (driverResult.driver.frames: [t, dt, scrollY, m]), a tween
// starts at the first row whose m leaves a held 0 (open O1, O2, O3) or a held 1 (close C1, C2, C3), held = m <= 0.001
// or >= 0.999 in the row before. Per tween: f1 = that row's dt, f2 = f1 + the next row's dt, f3 = f1 + the next two.
// 'close' = per run, the median over the run's C1-C3, then per arm the median over runs. Per arm, the median over the
// valid runs; d = median(V) - median(C), in ms. Verdict per key: 'no-worse' when d <= +2 ms, else 'WORSE'; 'better'
// when d <= -2 ms and every V run is below every C run. Scored keys: O1.f1 (the first open per page load, the reader's
// case), O1.f2, O1.f3, close.f1, close.f3; reported: O2/O3/C1-C3 f1-f3 and close.f2. A run without exactly the
// tweens O1-O3 and C1-C3 in its driver rows is void ("driver tweens").
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const runs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))).map((s) => { const k = s.indexOf(':'); return { arm: s.slice(0, k), f: s.slice(k + 1) }; });
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 12);
const BUILD = { C: { js: '65052c4a3902', css: 'e0f92804c521', name: 'best' }, V: { js: 'ef9d1c9d5fca', css: 'f7071e9138ac', name: 'rv2a' } };
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const TH = { '>50': 50, '>46': 46, '>54': 54, '>34': 34, '>30': 30, '>38': 38 };
const count = (dts) => { const o = Object.fromEntries(Object.entries(TH).map(([k, v]) => [k, dts.filter((d) => d > v).length]));
  o.near34 = dts.filter((d) => d > 30 && d <= 38).length; o.near50 = dts.filter((d) => d > 46 && d <= 54).length; o.n = dts.length; return o; };
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const out = { scorer: 'frames-rv2.mjs', sha256: self, runs: [] };
const TW = ['O1', 'C1', 'O2', 'C2', 'O3', 'C3'];
const tweens = (fr) => { const t = {}; let o = 0, c = 0; // driver rows [t, dt, y, m]
  for (let q = 1; q + 2 < fr.length; q++) { const pm = fr[q - 1][3], m = fr[q][3]; let id = null;
    if (pm <= 0.001 && m > 0.001) id = 'O' + ++o; else if (pm >= 0.999 && m < 0.999) id = 'C' + ++c;
    if (id) t[id] = { f1: fr[q][1], f2: +(fr[q][1] + fr[q + 1][1]).toFixed(1), f3: +(fr[q][1] + fr[q + 1][1] + fr[q + 2][1]).toFixed(1), m: fr[q][3] }; }
  return t; };
for (const r of runs) {
  const g = JSON.parse(readFileSync(r.f, 'utf8')); const meta = g.meta || {}; const v = [];
  const b = BUILD[r.arm];
  if (!b) v.push(`unknown arm ${r.arm}`);
  if (meta.error) v.push(`driver error: ${meta.error}`);
  if (meta.driver !== 'M') v.push(`driver ${meta.driver}, not M`);
  if (meta.warmup) v.push('a warm-up run');
  if (meta.settings?.lowPowerMode === true || meta.lowPowerSuspect) v.push(`Low Power Mode (settings ${meta.settings?.lowPowerMode}, rAF ~${meta.rafHz} Hz)`);
  const sv = meta.served || {}; const sj = sv[NODE], sc = sv[CSS];
  if (b && !(typeof sj === 'string' && sj.startsWith(b.js) && typeof sc === 'string' && sc.startsWith(b.css))) v.push(`served js ${sj} css ${sc}, not ${b.name} ${b.js}/${b.css}`);
  const mk = (g.marks || {}).drive;
  const fr = (g.frames || []).filter((f) => f[1] !== null);
  if (!mk || mk[1] === undefined) v.push('no drive mark');
  if (!fr.some((f) => f[5] !== null)) v.push('the probe saw no m');
  const cycles = meta.params?.cycles ?? 3, tw = (g.summary?.tweens || []).length;
  if (tw !== 2 * cycles) v.push(`${tw} tween starts in the probe frames, expected ${2 * cycles}`);
  const tws = tweens(g.driverResult?.driver?.frames || []);
  if (Object.keys(tws).join() !== TW.join()) v.push(`driver tweens ${Object.keys(tws).join(',') || 'none'}, expected ${TW.join(',')}`);
  const row = { tweens: tws, arm: r.arm, file: r.f, label: meta.label, pos: meta.pos, sentinel: meta.sentinel ?? null, battery: meta.battery?.end?.temperatureC ?? null, rafHz: meta.rafHz, atOneP95: g.driverResult?.driver?.atOne?.p95 ?? null, void: v };
  if (mk && mk[1] !== undefined && !v.includes('the probe saw no m')) {
    const D = fr.filter((f) => f[0] >= mk[0] && f[0] <= mk[1]); const m = D.map((f) => f[5] ?? 0);
    const mov = D.map((f, i) => (i > 0 && m[i] !== m[i - 1]) || (i < D.length - 1 && m[i + 1] !== m[i]));
    row.drive = count(D.map((f) => f[1]));
    row.moving = count(D.filter((f, i) => mov[i]).map((f) => f[1]));
    row.held1 = count(D.filter((f, i) => !mov[i] && m[i] >= 0.999).map((f) => f[1]));
    let num = 0, den = 0; for (let i = 1; i < D.length; i++) { const dm = Math.abs(m[i] - m[i - 1]); num += dm * D[i][1]; den += dm; }
    row.dmWeightedDt = den ? +(num / den).toFixed(2) : null;
    const B = [100, 250, 500, Infinity]; row.sinceStart = B.map((b, j) => ({ from: j ? B[j - 1] : 0, to: b, n: 0, '>34': 0, '>50': 0 }));
    let t0 = null;
    for (let i = 0; i < D.length; i++) {
      const p = i ? m[i - 1] : m[i];
      if (i && (p <= 0.001 || p >= 0.999) && m[i] > 0.001 && m[i] < 0.999) t0 = D[i - 1][0];
      if (!mov[i] || t0 === null) continue;
      const bk = row.sinceStart[B.findIndex((b) => D[i][0] - t0 < b)]; bk.n++; if (D[i][1] > 34) bk['>34']++; if (D[i][1] > 50) bk['>50']++;
    }
    row.slowMoving = D.filter((f, i) => mov[i] && f[1] > 30).map((f) => `${f[1]}@m${f[5]}`);
  }
  out.runs.push(row);
}
{ let since = []; // protocol v2 §5.2 sentinel rule, in block order
  for (const x of out.runs) { since.push(x);
    if (x.arm !== 'C') continue;
    if (x.sentinel?.pass === true) { since = []; continue; }
    const why = !x.sentinel ? 'no meta.sentinel (null)' : x.sentinel.pass === false ? `fail ${JSON.stringify(x.sentinel.value)}` : `pass ${x.sentinel.pass} (not judged${x.sentinel.note ? ': ' + x.sentinel.note : ''})`;
    for (const y of since) y.void.push(`M sentinel not passed at C pos ${x.pos}: ${why}`); since = []; } }
const valid = out.runs.filter((x) => !x.void.length && x.moving);
const arms = [...new Set(valid.map((x) => x.arm))];
out.arms = {};
for (const a of arms) { out.arms[a] = { runs: valid.filter((x) => x.arm === a).length, dmWeightedDt: med(valid.filter((x) => x.arm === a && x.dmWeightedDt !== null).map((x) => x.dmWeightedDt)) };
  for (const sc of ['moving', 'drive', 'held1']) { out.arms[a][sc] = {}; for (const k of [...Object.keys(TH), 'near34', 'near50', 'n']) out.arms[a][sc][k] = med(valid.filter((x) => x.arm === a).map((x) => x[sc][k])); } }
const KEYS = [...['O1', 'O2', 'O3', 'C1', 'C2', 'C3'].flatMap((t) => ['f1', 'f2', 'f3'].map((k) => `${t}.${k}`)), 'close.f1', 'close.f2', 'close.f3'];
const SCORED = ['O1.f1', 'O1.f2', 'O1.f3', 'close.f1', 'close.f3'];
const tv = (x, key) => { const [t, k] = key.split('.'); return t === 'close' ? med(['C1', 'C2', 'C3'].map((c) => x.tweens[c][k])) : x.tweens[t][k]; };
for (const a of arms) { out.arms[a].tweens = {}; for (const key of KEYS) { const v = valid.filter((x) => x.arm === a).map((x) => tv(x, key)); out.arms[a].tweens[key] = { med: med(v), runs: v }; } }
if (!(out.arms.C?.runs >= 3 && out.arms.V?.runs >= 3)) out.verdict = { insufficient: `valid runs C ${out.arms.C?.runs ?? 0}, V ${out.arms.V?.runs ?? 0}; need 3 per arm` };
else { out.verdict = {};
  const per = (a, sc, k) => valid.filter((x) => x.arm === a).map((x) => x[sc][k]);
  for (const sc of ['moving', 'drive']) {
    const d = (k) => out.arms.V[sc][k] - out.arms.C[sc][k];
    const vv = (k, lim) => (d(k) <= -2 && Math.max(...per('V', sc, k)) < Math.min(...per('C', sc, k)) ? 'better' : d(k) <= lim ? 'no-worse' : 'WORSE');
    const fam = (main, a, b, lim) => { const vs = [vv(main, lim), vv(a, lim), vv(b, lim)]; return { delta: d(main), twins: { [a]: d(a), [b]: d(b) }, verdict: vs[0], twinVerdicts: { [a]: vs[1], [b]: vs[2] }, thresholdSensitive: new Set(vs).size > 1 }; };
    out.verdict[sc] = { '>50': fam('>50', '>46', '>54', 1), '>34': fam('>34', '>30', '>38', 2) }; }
  out.verdict.tweens = {};
  for (const key of KEYS) { const c = out.arms.C.tweens[key], v = out.arms.V.tweens[key], d = +(v.med - c.med).toFixed(2);
    out.verdict.tweens[key] = { scored: SCORED.includes(key), C: c.med, V: v.med, delta: d, verdict: d <= -2 && Math.max(...v.runs) < Math.min(...c.runs) ? 'better' : d <= 2 ? 'no-worse' : 'WORSE', C_runs: c.runs, V_runs: v.runs }; } }
for (const x of out.runs) console.log(`${x.arm} pos ${x.pos} ${x.label}${x.void.length ? ' VOID ' + x.void.join('; ') : ''}: moving ${JSON.stringify(x.moving)} held1 ${JSON.stringify(x.held1)} |dm|-weighted dt ${x.dmWeightedDt} since-start ${JSON.stringify(x.sinceStart?.map((b) => [b.from, b.n, b['>34'], b['>50']]))} held m=1 p95 (driver) ${x.atOneP95} sentinel ${x.sentinel ? x.sentinel.pass : '-'} battery ${x.battery} rAF ${x.rafHz} Hz${x.slowMoving?.length ? ' slow ' + x.slowMoving.join(' ') : ''}`);
console.log(`arms ${JSON.stringify(out.arms)}`);
if (out.verdict) console.log(`verdict (V - C, arm medians) ${JSON.stringify(out.verdict)}`);
if (out.verdict?.tweens) for (const [k, x] of Object.entries(out.verdict.tweens)) console.log(`tween ${k}${x.scored ? ' (scored)' : ''}: C ${x.C} ${JSON.stringify(x.C_runs)} V ${x.V} ${JSON.stringify(x.V_runs)} d ${x.delta} ms ${x.verdict}`);
console.log(`frames-rv2.mjs sha256 ${self}`);
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
