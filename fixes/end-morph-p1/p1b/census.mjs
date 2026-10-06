// Position-bin census diff (protocol v2 §3.4 / fixes/README.md: "no 250 px bin worse by >= 1 tick median or +1 frame
// k>=5 per run"), Chrome side, from a verify.mjs --frame-log result. A pure reader (fix-end-morph-p1).
// Frames: run.frameLog.<phase> = [[t, dt, scrollY], ...]; every frame of the idle, scroll and morph phases counts, binned by
// floor(scrollY / 250). Per run and bin: n, k>=5 count (dt >= 37.5 ms), k>=7 count (dt >= 54.17 ms), median tick
// (k = round(dt / 8.333)). Per bin: the median over runs of each, per arm; a bin is "worse" in A when the median tick is
// up by >= 1, or the k>=5 count by >= 1 per run (median over runs), or the k>=7 count by >= 1.
//   node fixes/end-morph-p1/p1b/census.mjs <verify.json> [--control C --arm A]
import { readFileSync, writeFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const file = argv[0];
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const CTL = opt('--control', 'C'), ARM = opt('--arm', 'A');
const v = JSON.parse(readFileSync(file, 'utf8'));
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const tick = (dt) => Math.round(dt / (1000 / 120));
const per = { [CTL]: [], [ARM]: [] };
for (const r of v.results.filter((x) => !x.diff)) {
  if (!(r.label in per)) continue;
  const bins = {};
  for (const ph of ['idle', 'scroll', 'morph']) for (const [, dt, y] of r.frameLog?.[ph] || []) { const b = Math.floor(y / 250); (bins[b] ||= []).push(dt); }
  per[r.label].push(Object.fromEntries(Object.entries(bins).map(([b, d]) => [b, { n: d.length, k5: d.filter((x) => tick(x) >= 5).length, k7: d.filter((x) => tick(x) >= 7).length, mt: med(d.map(tick)) }])));
}
const all = new Set([...per[CTL], ...per[ARM]].flatMap((x) => Object.keys(x)));
const rows = [];
for (const b of [...all].map(Number).sort((p, q) => p - q)) {
  const m = (arm, k) => med(per[arm].map((x) => (x[b] ? x[b][k] : 0)));
  const mt = (arm) => med(per[arm].map((x) => x[b]?.mt ?? null));
  const d = { k5: m(ARM, 'k5') - m(CTL, 'k5'), k7: m(ARM, 'k7') - m(CTL, 'k7'), mt: mt(ARM) != null && mt(CTL) != null ? mt(ARM) - mt(CTL) : null };
  rows.push({ y: `${b * 250}-${(b + 1) * 250}`, n: { [CTL]: m(CTL, 'n'), [ARM]: m(ARM, 'n') }, k5: { [CTL]: m(CTL, 'k5'), [ARM]: m(ARM, 'k5') }, k7: { [CTL]: m(CTL, 'k7'), [ARM]: m(ARM, 'k7') }, medTick: { [CTL]: mt(CTL), [ARM]: mt(ARM) }, d, worse: d.k5 >= 1 || d.k7 >= 1 || (d.mt != null && d.mt >= 1) });
}
const out = { file, runs: { [CTL]: per[CTL].length, [ARM]: per[ARM].length }, worse: rows.filter((r) => r.worse).map((r) => r.y), rows };
for (const r of rows) console.log(`${r.y.padEnd(11)} n ${r.n[CTL]}/${r.n[ARM]} k>=5 ${r.k5[CTL]}/${r.k5[ARM]} k>=7 ${r.k7[CTL]}/${r.k7[ARM]} median tick ${r.medTick[CTL]}/${r.medTick[ARM]}${r.worse ? '  WORSE' : ''}`);
console.log(`CENSUS runs ${CTL} ${out.runs[CTL]} ${ARM} ${out.runs[ARM]}; bins worse in ${ARM}: ${out.worse.join(', ') || 'none'}`);
writeFileSync(file.replace(/\.json$/, '') + '-census.json', JSON.stringify(out, null, 1));
