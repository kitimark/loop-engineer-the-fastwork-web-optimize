#!/usr/bin/env node
// frames-p085.mjs: frame-gap counts for the P-085 phone block (morph-inherit no-worse check vs the baseline; driver M =
// `iphone.mjs run --driver morph`, schema fw-iphone-run/1; no Timeline).
// usage: node frames-p085.mjs <arm>:<run.json> ... [--json out]   (arms B = baseline + the phone driver (bdrive), M = morph-inherit (mi))
// Pass the counted runs in block order (warm-ups left out; files from a hold that failed a thermal-gate read are never
// passed). Frames: the std probe's rAF rows [t, dt, yStart, yEnd, innerHeight, m, ...] (m = the nav header's inline
// --morph, null before the first tween = 0), inside the 'drive' mark.
// Scopes per run:
//   'moving' (scored): tween frames, i.e. frames whose m differs from the previous frame's or the next frame's m (the
//            probe reads m at its rAF callback, so a tween's first and last frames are both covered whichever callback
//            runs first);
//   'drive'  (reported): every frame of the drive phase; 'held1' (reported): m >= 0.999 and not moving.
// Thresholds as CLAUDE.md "Frame thresholds" (phone): dt > 50 and dt > 34 (ms), the +-4 ms twins (>46 / >54, >30 / >38);
// near-band frames (30, 38] / (46, 54] counted and flagged. No k forms on the phone.
// Per arm the median count per threshold over its valid runs; verdict M - B of the arm medians: '>50' no-worse when
// <= +1, '>34' no-worse when <= +2 (the less-work phone bound, as P-078 / P-081). threshold-sensitive: a twin's verdict
// differs from the main threshold's or the other twin's.
// Void run (listed, left out of the medians): meta.error; meta.driver not M; Low Power Mode (meta.settings.lowPowerMode
// true or meta.lowPowerSuspect); the served js/css not the arm's build (meta.served, sha256 prefixes); no 'drive' mark;
// the probe saw no m (null throughout); tween starts in the probe frames != 2 x cycles; a warm-up passed in.
// Counted runs carry --arm B / M, so iphone.mjs judges no heat sentinel on them (that is the S-driver sentinel runs' job).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const runs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))).map((s) => { const k = s.indexOf(':'); return { arm: s.slice(0, k), f: s.slice(k + 1) }; });
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 12);
const BUILD = { B: { js: 'afd388b8945a', css: '27776f3d4138', name: 'bdrive' }, M: { js: '7c61fe7d0662', css: 'f523598b2a24', name: 'mi' } };
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const TH = { '>50': 50, '>46': 46, '>54': 54, '>34': 34, '>30': 30, '>38': 38 };
const count = (dts) => { const o = Object.fromEntries(Object.entries(TH).map(([k, v]) => [k, dts.filter((d) => d > v).length]));
  o.near34 = dts.filter((d) => d > 30 && d <= 38).length; o.near50 = dts.filter((d) => d > 46 && d <= 54).length; o.n = dts.length; return o; };
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const out = { scorer: 'frames-p085.mjs', sha256: self, runs: [] };
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
  const row = { arm: r.arm, file: r.f, label: meta.label, pos: meta.pos, battery: meta.battery?.end?.temperatureC ?? null, rafHz: meta.rafHz, atOneP95: g.driverResult?.driver?.atOne?.p95 ?? null, void: v };
  if (mk && mk[1] !== undefined && !v.includes('the probe saw no m')) {
    const D = fr.filter((f) => f[0] >= mk[0] && f[0] <= mk[1]); const m = D.map((f) => f[5] ?? 0);
    const mov = D.map((f, i) => (i > 0 && m[i] !== m[i - 1]) || (i < D.length - 1 && m[i + 1] !== m[i]));
    row.drive = count(D.map((f) => f[1]));
    row.moving = count(D.filter((f, i) => mov[i]).map((f) => f[1]));
    row.held1 = count(D.filter((f, i) => !mov[i] && m[i] >= 0.999).map((f) => f[1]));
    row.slowMoving = D.filter((f, i) => mov[i] && f[1] > 30).map((f, i) => `${f[1]}@m${f[5]}`);
  }
  out.runs.push(row);
}
const valid = out.runs.filter((x) => !x.void.length && x.moving);
const arms = [...new Set(valid.map((x) => x.arm))];
out.arms = {};
for (const a of arms) { out.arms[a] = { runs: valid.filter((x) => x.arm === a).length };
  for (const sc of ['moving', 'drive', 'held1']) { out.arms[a][sc] = {}; for (const k of [...Object.keys(TH), 'near34', 'near50', 'n']) out.arms[a][sc][k] = med(valid.filter((x) => x.arm === a).map((x) => x[sc][k])); } }
if (out.arms.B && out.arms.M) { out.verdict = {};
  for (const sc of ['moving', 'drive']) { const d = (k) => out.arms.M[sc][k] - out.arms.B[sc][k]; const vv = (k, lim) => (d(k) <= lim ? 'no-worse' : 'WORSE');
    const fam = (main, a, b, lim) => { const vs = [vv(main, lim), vv(a, lim), vv(b, lim)]; return { delta: d(main), twins: { [a]: d(a), [b]: d(b) }, verdict: vs[0], thresholdSensitive: new Set(vs).size > 1 }; };
    out.verdict[sc] = { '>50': fam('>50', '>46', '>54', 1), '>34': fam('>34', '>30', '>38', 2) }; } }
for (const x of out.runs) console.log(`${x.arm} pos ${x.pos} ${x.label}${x.void.length ? ' VOID ' + x.void.join('; ') : ''}: moving ${JSON.stringify(x.moving)} held1 ${JSON.stringify(x.held1)} held m=1 p95 (driver) ${x.atOneP95} battery ${x.battery} rAF ${x.rafHz} Hz${x.slowMoving?.length ? ' slow ' + x.slowMoving.join(' ') : ''}`);
console.log(`arms ${JSON.stringify(out.arms)}`);
if (out.verdict) console.log(`verdict (M - B, arm medians) ${JSON.stringify(out.verdict)}`);
console.log(`frames-p085.mjs sha256 ${self}`);
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
