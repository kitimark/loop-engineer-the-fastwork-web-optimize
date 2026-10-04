#!/usr/bin/env node
// frames-n2.mjs: frame-gap counts for the morph-gpu (N2, PR-012) phone block: the reveal (V) against today's best build
// (C), driver M = `iphone.mjs run --driver morph`, schema fw-iphone-run/1, no Timeline. Derived from
// fixes/morph-inherit/p085/frames-p085.mjs (same scopes, thresholds and void rules). Changes: the arms, the builds, and a
// 'better' verdict next to no-worse / WORSE.
// usage: node frames-n2.mjs <arm>:<run.json> ... [--json out]   (arms C = best-build, V = reveal)
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
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const runs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))).map((s) => { const k = s.indexOf(':'); return { arm: s.slice(0, k), f: s.slice(k + 1) }; });
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 12);
const BUILD = { C: { js: '65052c4a3902', css: 'e0f92804c521', name: 'best' }, V: { js: '372b99478871', css: '257507365449', name: 'rv' } };
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const TH = { '>50': 50, '>46': 46, '>54': 54, '>34': 34, '>30': 30, '>38': 38 };
const count = (dts) => { const o = Object.fromEntries(Object.entries(TH).map(([k, v]) => [k, dts.filter((d) => d > v).length]));
  o.near34 = dts.filter((d) => d > 30 && d <= 38).length; o.near50 = dts.filter((d) => d > 46 && d <= 54).length; o.n = dts.length; return o; };
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const out = { scorer: 'frames-n2.mjs', sha256: self, runs: [] };
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
  const row = { arm: r.arm, file: r.f, label: meta.label, pos: meta.pos, sentinel: meta.sentinel ?? null, battery: meta.battery?.end?.temperatureC ?? null, rafHz: meta.rafHz, atOneP95: g.driverResult?.driver?.atOne?.p95 ?? null, void: v };
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
if (!(out.arms.C?.runs >= 3 && out.arms.V?.runs >= 3)) out.verdict = { insufficient: `valid runs C ${out.arms.C?.runs ?? 0}, V ${out.arms.V?.runs ?? 0}; need 3 per arm` };
else { out.verdict = {};
  const per = (a, sc, k) => valid.filter((x) => x.arm === a).map((x) => x[sc][k]);
  for (const sc of ['moving', 'drive']) {
    const d = (k) => out.arms.V[sc][k] - out.arms.C[sc][k];
    const vv = (k, lim) => (d(k) <= -2 && Math.max(...per('V', sc, k)) < Math.min(...per('C', sc, k)) ? 'better' : d(k) <= lim ? 'no-worse' : 'WORSE');
    const fam = (main, a, b, lim) => { const vs = [vv(main, lim), vv(a, lim), vv(b, lim)]; return { delta: d(main), twins: { [a]: d(a), [b]: d(b) }, verdict: vs[0], twinVerdicts: { [a]: vs[1], [b]: vs[2] }, thresholdSensitive: new Set(vs).size > 1 }; };
    out.verdict[sc] = { '>50': fam('>50', '>46', '>54', 1), '>34': fam('>34', '>30', '>38', 2) }; } }
for (const x of out.runs) console.log(`${x.arm} pos ${x.pos} ${x.label}${x.void.length ? ' VOID ' + x.void.join('; ') : ''}: moving ${JSON.stringify(x.moving)} held1 ${JSON.stringify(x.held1)} |dm|-weighted dt ${x.dmWeightedDt} since-start ${JSON.stringify(x.sinceStart?.map((b) => [b.from, b.n, b['>34'], b['>50']]))} held m=1 p95 (driver) ${x.atOneP95} sentinel ${x.sentinel ? x.sentinel.pass : '-'} battery ${x.battery} rAF ${x.rafHz} Hz${x.slowMoving?.length ? ' slow ' + x.slowMoving.join(' ') : ''}`);
console.log(`arms ${JSON.stringify(out.arms)}`);
if (out.verdict) console.log(`verdict (V - C, arm medians) ${JSON.stringify(out.verdict)}`);
console.log(`frames-n2.mjs sha256 ${self}`);
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
