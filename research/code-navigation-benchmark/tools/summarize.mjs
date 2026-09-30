#!/usr/bin/env node
// Aggregate data/runs.json (from score.mjs --write) into per task x arm and per arm tables.
// Invalid runs (harness glitches, see runs-index.tsv 5th column) are excluded from aggregates.
import fs from 'node:fs';
import path from 'node:path';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const runs = JSON.parse(fs.readFileSync(path.join(root, 'data/runs.json'), 'utf8')).filter((r) => !r.invalid);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const agg = (rs) => ({
  n: rs.length, score: +mean(rs.map((r) => r.score)).toFixed(3), perfect: rs.filter((r) => r.score >= 0.999).length,
  calls: +mean(rs.map((r) => r.toolCalls)).toFixed(1), serenaCalls: +mean(rs.map((r) => r.serenaCalls)).toFixed(1),
  usedSerena: rs.filter((r) => r.serenaCalls > 0).length,
  wallSec: +med(rs.map((r) => r.wallSec)).toFixed(1), tokensK: +(med(rs.map((r) => r.tokens.total)) / 1000).toFixed(0),
  ctxPeakK: +(med(rs.map((r) => r.tokens.ctxPeak)) / 1000).toFixed(1), outTok: Math.round(med(rs.map((r) => r.tokens.output))),
  offByOne: rs.reduce((a, r) => a + (r.offByOne || 0), 0),
});
const tasks = [...new Set(runs.map((r) => r.task))].sort();
const arms = ['G', 'S', 'SO']; // original study arms; follow-up arms (GR GM SM GN SN GU SU *-haiku) are listed in allArms below
const byTask = tasks.map((t) => ({ task: t, type: runs.find((r) => r.task === t).type,
  ...Object.fromEntries(arms.map((a) => [a, agg(runs.filter((r) => r.task === t && r.arm === a))])) }));
const byArm = Object.fromEntries(arms.map((a) => [a, agg(runs.filter((r) => r.arm === a))]));
// paired comparison on tasks that SO also ran
const soTasks = new Set(runs.filter((r) => r.arm === 'SO').map((r) => r.task));
const paired = Object.fromEntries(arms.map((a) => [a, agg(runs.filter((r) => r.arm === a && soTasks.has(r.task)))]));
const out = { generated: new Date().toISOString(), byArm, pairedOnSOTasks: paired, byTask };
fs.writeFileSync(path.join(root, 'data/summary.json'), JSON.stringify(out, null, 1));
const fmt = (x) => (x.n ? `${x.score.toFixed(2)} (${x.perfect}/${x.n}) ${x.calls}c ${x.wallSec}s ${x.tokensK}k` : '-');
console.log('task | type | G | S | SO   (score (perfect/n) calls medianWall medianTotalTokens)');
for (const r of byTask) console.log(`${r.task} | ${r.type} | ${fmt(r.G)} | ${fmt(r.S)} | ${fmt(r.SO)}`);
console.log('\nby arm (original study arms, all tasks):'); console.table(byArm);
const allLabels = [...new Set(runs.map((r) => r.arm))];
const allArms = Object.fromEntries(allLabels.map((a) => [a, agg(runs.filter((r) => r.arm === a))]));
out.allArms = allArms; fs.writeFileSync(path.join(root, 'data/summary.json'), JSON.stringify(out, null, 1));
console.log('all arm labels (different task sets: compare with tools/compare.mjs):'); console.table(allArms);
console.log('paired on SO tasks:'); console.table(paired);

// Per-tool latency and result size as seen by the agents (tool_use -> tool_result timestamps, so it
// includes MCP / harness overhead and queueing on the shared Serena server).
const calls = runs.flatMap((r) => (r.calls || []).map((c) => ({ ...c, arm: r.arm })));
const q = (xs, p) => { const s = [...xs].filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const byTool = {};
for (const c of calls) (byTool[c.name] ||= []).push(c);
const callStats = Object.entries(byTool).filter(([, cs]) => cs.length >= 3).map(([tool, cs]) => ({ tool, n: cs.length,
  medMs: q(cs.map((c) => c.ms), 0.5), p90Ms: q(cs.map((c) => c.ms), 0.9), maxMs: Math.max(...cs.map((c) => c.ms || 0)),
  medChars: q(cs.map((c) => c.chars), 0.5), p90Chars: q(cs.map((c) => c.chars), 0.9), maxChars: Math.max(...cs.map((c) => c.chars || 0)) }))
  .sort((a, b) => b.n - a.n);
fs.writeFileSync(path.join(root, 'data/agent-call-stats.json'), JSON.stringify(callStats, null, 1));
console.log('agent-side call stats:'); console.table(callStats);

// Task-type groups used in the README.
const GROUPS = {
  'A locate a definition (by name / by behaviour)': ['T01', 'T02', 'T13'],
  'B callers / references of a named symbol': ['T03', 'T05', 'T14', 'T20'],
  'C cross-file refs through bundle import aliases': ['T04'],
  'J resolve an import alias to its runtime definition': ['T19', 'T24'],
  'D disambiguate short / shadowed names and bindings': ['T11', 'T12', 'T17', 'T18', 'T23', 'T25'],
  'E call-graph scoped API use, read a function body': ['T07', 'T08'],
  'K who writes a class / inline style / state': ['T21', 'T27'],
  'F strings, custom properties, class usage': ['T06', 'T22'],
  'G CSS (rules, width animations, @media context)': ['T09', 'T10', 'T26'],
  'H text census (every line containing X)': ['T15'],
  'I tooling control flow across processes': ['T16'],
  'L open discovery, no names given (follow-up)': ['T28', 'T29', 'T30'],
  'M overlay copy paths (follow-up)': ['T31', 'T32', 'T33'],
  'N unprettified site/ (follow-up)': ['T34', 'T35', 'T36'],
};
const byGroup = Object.entries(GROUPS).map(([g, ts]) => ({ group: g,
  ...Object.fromEntries(arms.map((a) => [a, agg(runs.filter((r) => r.arm === a && ts.includes(r.task)))])) }));
const s2 = JSON.parse(fs.readFileSync(path.join(root, 'data/summary.json'), 'utf8'));
s2.allArms = allArms;
s2.byGroup = byGroup;
s2.compliance = { S_runsUsingSerena: runs.filter((r) => r.arm === 'S' && r.serenaCalls > 0).length, S_runs: runs.filter((r) => r.arm === 'S').length,
  S_serenaShareOfCalls: +(runs.filter((r) => r.arm === 'S').reduce((a, r) => a + r.serenaCalls, 0) / runs.filter((r) => r.arm === 'S').reduce((a, r) => a + r.toolCalls, 0)).toFixed(2) };
const real = new Set(['T19', 'T20', 'T21', 'T22', 'T23', 'T24', 'T25', 'T26', 'T27']);
s2.bySource = { synthetic: Object.fromEntries(arms.map((a) => [a, agg(runs.filter((r) => r.arm === a && !real.has(r.task)))])),
  ownerQuestions: Object.fromEntries(arms.map((a) => [a, agg(runs.filter((r) => r.arm === a && real.has(r.task)))])) };
fs.writeFileSync(path.join(root, 'data/summary.json'), JSON.stringify(s2, null, 1));
console.log('\nby source (synthetic T01-T18 vs owner questions T19-T27):');
for (const [k, v] of Object.entries(s2.bySource)) console.log(k, '|', fmt(v.G), '|', fmt(v.S), '|', fmt(v.SO));
console.log('\nby group:');
for (const r of byGroup) console.log(`${r.group} | ${fmt(r.G)} | ${fmt(r.S)} | ${fmt(r.SO)}`);
console.log(s2.compliance);
