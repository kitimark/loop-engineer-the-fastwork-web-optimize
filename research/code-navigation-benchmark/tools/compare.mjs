#!/usr/bin/env node
// Paired comparison of arms on the tasks they share: node tools/compare.mjs G S GR [--tasks T03,T04] [--per-task]
// Arm labels are the 2nd column of data/runs-index.tsv (G, S, SO, GR, GM, SM, GU, SU, G-haiku, S-haiku ...).
// Invalid runs are excluded. Medians for wall/tokens/peak context, means for score and calls.
import fs from 'node:fs';
import path from 'node:path';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const runs = JSON.parse(fs.readFileSync(path.join(root, 'data/runs.json'), 'utf8')).filter((r) => !r.invalid);
const args = process.argv.slice(2);
const ti = args.indexOf('--tasks');
const only = ti >= 0 ? args[ti + 1].split(',') : null;
const arms = args.filter((a, i) => !a.startsWith('--') && (ti < 0 || (i !== ti + 1)));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
let tasks = [...new Set(runs.map((r) => r.task))].filter((t) => arms.every((a) => runs.some((r) => r.task === t && r.arm === a)));
if (only) tasks = tasks.filter((t) => only.includes(t));
const rows = (rs) => ({ n: rs.length, score: +mean(rs.map((r) => r.score)).toFixed(3), perfect: rs.filter((r) => r.score >= 0.999).length,
  calls: +mean(rs.map((r) => r.toolCalls)).toFixed(1), serena: +mean(rs.map((r) => r.serenaCalls)).toFixed(1), usedSerena: rs.filter((r) => r.serenaCalls > 0).length,
  wallS: +med(rs.map((r) => r.wallSec)).toFixed(0), tokK: +(med(rs.map((r) => r.tokens.total)) / 1000).toFixed(0), peakK: +(med(rs.map((r) => r.tokens.ctxPeak)) / 1000).toFixed(0),
  outTok: Math.round(med(rs.map((r) => r.tokens.output))), obo: rs.reduce((a, r) => a + (r.offByOne || 0), 0) });
console.log(`tasks (${tasks.length}): ${tasks.join(' ')}`);
console.table(Object.fromEntries(arms.map((a) => [a, rows(runs.filter((r) => r.arm === a && tasks.includes(r.task)))])));
if (args.includes('--per-task')) for (const t of tasks) {
  console.log(t, arms.map((a) => { const x = runs.filter((r) => r.task === t && r.arm === a); return `${a}: ${x.map((r) => r.score.toFixed(2)).join('/')} ${Math.round(med(x.map((r) => r.tokens.total)) / 1000)}k ${x.map((r) => r.toolCalls).join('/')}c`; }).join(' | '));
}
