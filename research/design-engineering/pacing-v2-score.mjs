#!/usr/bin/env node
// Score a pacing v2 session (pacing/v2.html) against the reading fixed in pacing-result.md §3.
// Usage: node research/design-engineering/pacing-v2-score.mjs <results.json> [--json]
// Input: the JSON from window.__fwPacingGet() (or an object wrapping it under fwPacingV2).
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: pacing-v2-score.mjs <results.json> [--json]'); process.exit(2); }
let r = JSON.parse(fs.readFileSync(file, 'utf8'));
if (typeof r === 'string') r = JSON.parse(r);
if (r.fwPacingV2) r = r.fwPacingV2;
if (r.page !== 'fw-pacing-v2') { console.error(`not a pacing v2 result (page=${r.page})`); process.exit(2); }

const T = r.rafMs;
const gaps = (a, thr) => a.slice(1).map((x, i) => x - a[i]).filter((d) => d > thr);
const binom1 = (k, n) => { let p = 0; const c = (n, k) => { let x = 1; for (let i = 1; i <= k; i++) x = x * (n - k + i) / i; return x; }; for (let j = k; j <= n; j++) p += c(n, j); return p / 2 ** n; };

// delivery: per clip, frames shown, gaps > 1.5 T (designed: 9 per eased clip, 0 for catch), stray rAF gaps (system hitches)
const delivery = [];
for (const t of r.trials) {
  const clips = t.kind === 'pair' ? t.clips.map((c, j) => ({ label: t.order[j], ...c })) : [{ label: `g100-${t.v}`, raf: t.raf, shown: t.shown }];
  for (const c of clips) delivery.push({ n: t.n, group: t.group, clip: c.label, shownGaps: gaps(c.shown, 1.5 * T).length, rafGaps: gaps(c.raf, 1.5 * T).map(Math.round) });
}

const pairs = r.trials.filter((t) => t.kind === 'pair');
const groups = {};
for (const t of pairs) {
  const g = (groups[t.group] ??= { n: 0, late: 0, aChosen: 0, rows: [] });
  g.n++; g.late += t.chosen === 'late' ? 1 : 0; g.aChosen += t.choice === 'A' ? 1 : 0;
  g.rows.push({ n: t.n, rep: t.rep, order: t.order.join('-'), choice: t.choice, chosen: t.chosen, rtMs: t.rtMs });
}
const ease = pairs.filter((t) => t.group !== 'catch');
const sideA = ease.filter((t) => t.choice === 'A').length;
const ratings = {};
for (const t of r.trials.filter((t) => t.kind === 'rate')) (ratings[t.v] ??= []).push(t.rating);

// the §3 reading
const g1 = groups['ease-1'] || { n: 0, late: 0 };
// "chosen" = the clip picked as SMOOTHER. Session 1 rated ease-early smoother (2 vs 4); MWFI predicts ease-late smoother.
// (pacing-result.md §3 as first written had this backwards; see its erratum.)
const full = g1.late >= 3 ? 'late gaps smoother (reverses session 1; agrees with MWFI: gaps at peak velocity look worse)' : g1.n - g1.late >= 3 ? 'early gaps smoother (repeats session 1, against MWFI)' : 'null (2/2)';
const pref = (g) => (groups[g] ? `${groups[g].late}/${groups[g].n} late` : 'n/a');
const half = groups['ease-1/2'], quarter = groups['ease-1/4'];
let pursuit = 'undecided';
// pursuit reading (session 1's explanation): early smoother at full speed because the eye can't follow peak velocity,
// fading at 1/4 speed. Only meaningful when full speed repeats session 1.
if (g1.n - g1.late >= 3 && quarter) pursuit = quarter.late === quarter.n ? 'supported (early smoother at full speed, late at 1/4)' : quarter.late === 0 && (!half || half.late === 0) ? 'ruled out (early smoother at every speed)' : 'undecided (mixed at reduced speed)';
else if (g1.late >= 3) pursuit = 'moot (full speed does not repeat session 1)';
const meanR = Object.fromEntries(Object.entries(ratings).map(([v, a]) => [v, +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)]));
const vs = Object.keys(meanR).map(Number).sort((a, b) => a - b);
const rising = vs.length > 1 && meanR[vs[vs.length - 1]] > meanR[vs[0]] && vs.every((v, i) => i === 0 || meanR[v] >= meanR[vs[i - 1]]);
const p10 = full.startsWith('late') ? 'released (gaps at peak velocity look worse: the start leap P10 removes is felt)' : 'held';

const out = {
  file, rafMs: T, startedAt: r.startedAt, finishedAt: r.finishedAt, durS: r.finishedAt ? Math.round((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000) : null,
  groups, sideBias: { aChosenInEasePairs: `${sideA}/${ease.length}`, catch: groups.catch ? groups.catch.rows[0].choice : null },
  ratings, meanRatings: meanR, ratingRisesWithSpeed: rising,
  verdict: { fullSpeed: full, pFullOneSided: binom1(Math.max(g1.late, g1.n - g1.late), g1.n), half: pref('ease-1/2'), quarter: pref('ease-1/4'), pursuit, p10 },
  delivery: { clips: delivery.length, offDesign: delivery.filter((d) => (d.clip === 'none' ? d.shownGaps !== 0 : d.clip.startsWith('g100') ? false : d.shownGaps !== 9)), withRafGaps: delivery.filter((d) => d.rafGaps.length) },
};
if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
console.log(`pacing v2: ${file}  rAF ${T} ms  ${out.durS} s`);
for (const [g, x] of Object.entries(groups)) console.log(`  ${g.padEnd(9)} late ${x.late}/${x.n}  A ${x.aChosen}/${x.n}  ${x.rows.map((w) => `${w.order}:${w.choice}`).join(' ')}`);
console.log(`  side: A chosen in ${out.sideBias.aChosenInEasePairs} eased pairs; catch ${out.sideBias.catch}`);
console.log(`  g100 ratings: ${vs.map((v) => `${v} px/s ${ratings[v].join(',')}`).join('; ')}  (rises with speed: ${rising})`);
console.log(`  delivery: ${out.delivery.offDesign.length} clips off design; ${out.delivery.withRafGaps.length} clips with system rAF gaps ${JSON.stringify(out.delivery.withRafGaps.map((d) => [d.n, d.clip, d.rafGaps]))}`);
console.log(`VERDICT full speed: ${full} (one-sided p ${out.verdict.pFullOneSided.toFixed(3)}); 1/2: ${out.verdict.half}; 1/4: ${out.verdict.quarter}; pursuit: ${pursuit}; P10: ${p10}`);
