#!/usr/bin/env node
// framesF.mjs: frame-gap counts for the hero-exit-threaded P-081 phone block (driver G, Timeline on in counted runs).
// Phone thresholds as CLAUDE.md "Frame thresholds" (phone): dt > 50 and dt > 34 (ms, the recorder's rAF stamps), plus
// the +-4 ms twins (>46 / >54 for >50, >30 / >38 for >34); frames in the near bands (30, 38] / (46, 54] are counted and
// flagged. No k forms on the phone.
// usage: node framesF.mjs <arm>:<gesture.json> ... [--band 1:780] [--json out]
// Pass the counted runs in block order, void runs left out (the scorer scoreF.mjs reports which runs are void; holds that
// failed the thermal gate are never passed).
// Scopes per run: 'gesture' = every frame stamped from the 'drag1' mark up to the 'end' mark (the idle lead-in left out);
// 'band' = moving hero-band frames, band[0] <= y <= band[1] and y != previous y (scoreF.mjs's definition).
// Per arm: the median count per threshold. Verdict per threshold and scope, F - C of the arm medians:
// '>50': no-worse when F - C <= +1; '>34': no-worse when F - C <= +2 (the less-work phone bound, as P-078).
// threshold-sensitive: the two twins of a threshold give different verdicts from the main threshold or each other.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const band = opt('--band', '1:780').split(':').map(Number);
const runs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))).map((s) => { const k = s.indexOf(':'); return { arm: s.slice(0, k), g: s.slice(k + 1) }; });
const self = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12);
const TH = { '>50': 50, '>46': 46, '>54': 54, '>34': 34, '>30': 30, '>38': 38 };
const count = (dts) => { const o = Object.fromEntries(Object.entries(TH).map(([k, v]) => [k, dts.filter((d) => d > v).length]));
  o['near34'] = dts.filter((d) => d > 30 && d <= 38).length; o['near50'] = dts.filter((d) => d > 46 && d <= 54).length; o.n = dts.length; return o; };
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const out = { scorer: 'framesF.mjs', sha256: self, band, runs: [] };
for (const r of runs) {
  const g = JSON.parse(readFileSync(r.g, 'utf8')); const seg = g.run.segments[0];
  const mk = Object.fromEntries((seg.marks || []).map(([t, n]) => [n, t]));
  const t0 = mk.drag1, t1 = mk.end;
  if (t0 === undefined || t1 === undefined) { out.runs.push({ arm: r.arm, file: r.g, error: 'no drag1/end mark' }); continue; }
  const fr = seg.frames; const gd = [], bd = [];
  for (let i = 0; i < fr.length; i++) { const [t, dt, y] = fr[i]; if (t < t0 || t >= t1) continue; gd.push(dt);
    if (i > 0 && y >= band[0] && y <= band[1] && y !== fr[i - 1][2]) bd.push(dt); }
  out.runs.push({ arm: r.arm, file: r.g, label: g.meta && g.meta.label, gesture: count(gd), band: count(bd) });
}
const arms = [...new Set(out.runs.filter((x) => !x.error).map((x) => x.arm))];
out.arms = {}; for (const a of arms) { out.arms[a] = {}; for (const sc of ['gesture', 'band']) { out.arms[a][sc] = {};
  for (const k of [...Object.keys(TH), 'near34', 'near50', 'n']) out.arms[a][sc][k] = med(out.runs.filter((x) => x.arm === a && !x.error).map((x) => x[sc][k])); } }
const [C, F] = ['C', arms.find((a) => a !== 'C')];
if (out.arms[C] && F && out.arms[F]) { out.verdict = {};
  for (const sc of ['gesture', 'band']) { const d = (k) => out.arms[F][sc][k] - out.arms[C][sc][k]; const v = (k, lim) => (d(k) <= lim ? 'no-worse' : 'WORSE');
    const fam = (main, a, b, lim) => { const vs = [v(main, lim), v(a, lim), v(b, lim)]; return { delta: d(main), twins: { [a]: d(a), [b]: d(b) }, verdict: vs[0], thresholdSensitive: new Set(vs).size > 1 }; };
    out.verdict[sc] = { '>50': fam('>50', '>46', '>54', 1), '>34': fam('>34', '>30', '>38', 2) }; } }
for (const x of out.runs) console.log(x.error ? `${x.arm} ${x.file}: ${x.error}` : `${x.arm} ${x.label}: gesture ${JSON.stringify(x.gesture)} band ${JSON.stringify(x.band)}`);
console.log(`arms ${JSON.stringify(out.arms)}`);
if (out.verdict) console.log(`verdict (${F} - C, arm medians) ${JSON.stringify(out.verdict)}`);
console.log(`framesF.mjs sha256 ${self}`);
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
