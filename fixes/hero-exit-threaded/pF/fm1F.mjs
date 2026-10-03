#!/usr/bin/env node
// fm1F.mjs: frame-gap counts at the top-band crossing for the hero-exit-threaded P-088 phone block (driver G).
// The lead's amendment to P-081's "b-fm OUT -> back to F" for the first-move-1 row (fm1, the first move off the top):
// fm1 is judged on frames, not on record counts. It fails when the claim arm adds a frame over 34 ms (or over 50 ms)
// against C at the top-band crossing; its RecalculateStyles / Layout excess (scoreF.mjs's fm1 row) is reported as a
// named residual, never dropped.
// Window per run (recorder rAF stamps [t, dt, y, vh], page ms): after the first touchstart ('s' in touches), from the
// first moving frame (y != previous y) through the 10th frame counted from the first frame with y > --edge (default
// 30 = the hero top + 30 px, where the F builds go live; the hero top is y 0 on the phone). So the window holds the move
// off the top (both arms repaint the whole hero there) and the crossing (go-live) plus 9 frames after it.
// Thresholds as framesF.mjs (phone): dt > 50 and dt > 34, twins >46 / >54 and >30 / >38.
// Verdict per threshold, claim - C of the arm medians: 'no-worse' when <= 0, 'WORSE' at >= +1 (any added long frame);
// threshold-sensitive when a twin's verdict differs from the main threshold's or the other twin's.
// usage: node fm1F.mjs <arm>:<gesture.json> ... [--edge 30] [--after 9] [--json out]
// Pass C's runs and ONE claim arm's runs (the first arm that is not C is the claim), counted runs in block order, void
// runs left out (scoreF.mjs reports which are void; files of a gate-failed or slept hold are never passed).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const edge = Number(opt('--edge', '30')), after = Number(opt('--after', '9'));
const runs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))).map((s) => { const k = s.indexOf(':'); return { arm: s.slice(0, k), g: s.slice(k + 1) }; });
const self = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12);
const TH = { '>50': 50, '>46': 46, '>54': 54, '>34': 34, '>30': 30, '>38': 38 };
const count = (dts) => { const o = Object.fromEntries(Object.entries(TH).map(([k, v]) => [k, dts.filter((d) => d > v).length])); o.n = dts.length; return o; };
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const out = { scorer: 'fm1F.mjs', sha256: self, edge, after, runs: [] };
for (const r of runs) {
  const g = JSON.parse(readFileSync(r.g, 'utf8')); const seg = g.run.segments[0]; const fr = seg.frames;
  const ts = (seg.touches || []).find((t) => t[1] === 's');
  if (!ts) { out.runs.push({ arm: r.arm, file: r.g, error: 'no touchstart' }); continue; }
  let i0 = -1; for (let i = 1; i < fr.length; i++) if (fr[i][0] >= ts[0] && fr[i][2] !== fr[i - 1][2]) { i0 = i; break; }
  let k = -1; for (let i = Math.max(i0, 0); i0 >= 0 && i < fr.length; i++) if (fr[i][2] > edge) { k = i; break; }
  if (i0 < 0 || k < 0 || k + after >= fr.length) { out.runs.push({ arm: r.arm, file: r.g, error: 'no first move or no crossing' }); continue; }
  const w = fr.slice(i0, k + after + 1);
  out.runs.push({ arm: r.arm, file: r.g, label: g.meta && g.meta.label, startY: fr[i0][2], crossY: fr[k][2], endY: fr[k + after][2], frames: w.length, dts: w.map((f) => Math.round(f[1])), fm1: count(w.map((f) => f[1])) });
}
const arms = [...new Set(out.runs.filter((x) => !x.error).map((x) => x.arm))];
out.arms = {}; for (const a of arms) { out.arms[a] = {}; for (const k of [...Object.keys(TH), 'n']) out.arms[a][k] = med(out.runs.filter((x) => x.arm === a && !x.error).map((x) => x.fm1[k])); }
const [C, F] = ['C', arms.find((a) => a !== 'C')];
if (out.arms[C] && F && out.arms[F]) {
  const d = (k) => out.arms[F][k] - out.arms[C][k]; const v = (k) => (d(k) <= 0 ? 'no-worse' : 'WORSE');
  const fam = (main, a, b) => { const vs = [v(main), v(a), v(b)]; return { delta: d(main), twins: { [a]: d(a), [b]: d(b) }, verdict: vs[0], thresholdSensitive: new Set(vs).size > 1 }; };
  out.claim = F; out.verdict = { '>50': fam('>50', '>46', '>54'), '>34': fam('>34', '>30', '>38') };
}
for (const x of out.runs) console.log(x.error ? `${x.arm} ${x.file}: ${x.error}` : `${x.arm} ${x.label}: y ${x.startY}..${x.endY} (cross ${x.crossY}), ${x.frames} frames, dts ${x.dts.join(' ')} -> ${JSON.stringify(x.fm1)}`);
console.log(`arms ${JSON.stringify(out.arms)}`);
if (out.verdict) console.log(`verdict (${F} - C, arm medians) ${JSON.stringify(out.verdict)}`);
console.log(`fm1F.mjs sha256 ${self}`);
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
