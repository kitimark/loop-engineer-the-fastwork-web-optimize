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
const arms = ['G', 'S', 'SO'];
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
console.log('\nby arm:'); console.table(byArm);
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
  'B callers / references of a named symbol': ['T03', 'T05', 'T14'],
  'C cross-file references through bundle aliases': ['T04'],
  'D disambiguate short / shadowed locals': ['T11', 'T12', 'T17', 'T18'],
  'E call-graph scoped API use, read a function body': ['T07', 'T08'],
  'F string / custom-property writers': ['T06'],
  'G CSS': ['T09', 'T10'],
  'H text census (every line containing X)': ['T15'],
  'I tooling control flow across processes': ['T16'],
};
const byGroup = Object.entries(GROUPS).map(([g, ts]) => ({ group: g,
  ...Object.fromEntries(arms.map((a) => [a, agg(runs.filter((r) => r.arm === a && ts.includes(r.task)))])) }));
const s2 = JSON.parse(fs.readFileSync(path.join(root, 'data/summary.json'), 'utf8'));
s2.byGroup = byGroup;
s2.compliance = { S_runsUsingSerena: runs.filter((r) => r.arm === 'S' && r.serenaCalls > 0).length, S_runs: runs.filter((r) => r.arm === 'S').length,
  S_serenaShareOfCalls: +(runs.filter((r) => r.arm === 'S').reduce((a, r) => a + r.serenaCalls, 0) / runs.filter((r) => r.arm === 'S').reduce((a, r) => a + r.toolCalls, 0)).toFixed(2) };
fs.writeFileSync(path.join(root, 'data/summary.json'), JSON.stringify(s2, null, 1));
console.log('\nby group:');
for (const r of byGroup) console.log(`${r.group} | ${fmt(r.G)} | ${fmt(r.S)} | ${fmt(r.SO)}`);
console.log(s2.compliance);
