#!/usr/bin/env node
// Per-call latency and result size from a Serena MCP log (~/.serena/logs/<date>/mcp_*.txt).
//   node serena-log.mjs <log> [--since HH:MM] [--json out.json]
// Each tool call logs "Task-N:<Tool> ... Result: <payload>" and "Task-N:<Tool> completed in X seconds".
// Prints per-tool count, median/p90/max seconds and median/max result chars.
import fs from 'node:fs';
const [log, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
const since = opt('--since');
const text = fs.readFileSync(log, 'utf8');
const lines = text.split('\n');
const calls = new Map();
let cur = null;
for (const l of lines) {
  const m = /^INFO\s+(\S+ [\d:,]+) \[(Task-\d+):(\w+)\] (\S+) - (.*)$/.exec(l);
  if (m) {
    const [, ts, task, tool, , msg] = m;
    if (tool === 'init_project_services') { cur = null; continue; }
    const c = calls.get(task) || { task, tool, ts, resultChars: 0 };
    calls.set(task, c);
    if (msg.startsWith('Result: ')) { c.resultChars = msg.length - 8; cur = c; }
    const d = /completed in ([\d.]+) seconds/.exec(msg);
    if (d) { c.sec = Number(d[1]); cur = null; }
    continue;
  }
  if (/^(INFO|DEBUG|WARNING|ERROR)\s/.test(l)) { cur = null; continue; }
  if (cur) cur.resultChars += l.length + 1; // multi-line result payload
}
let rows = [...calls.values()].filter((c) => c.sec !== undefined && !/InitialInstructions|Memor/.test(c.tool));
if (since) rows = rows.filter((c) => c.ts.split(' ')[1].slice(0, 5) >= since);
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const by = {};
for (const r of rows) (by[r.tool] ||= []).push(r);
const summary = Object.entries(by).map(([tool, rs]) => ({ tool, n: rs.length,
  medSec: q(rs.map((r) => r.sec), 0.5), p90Sec: q(rs.map((r) => r.sec), 0.9), maxSec: Math.max(...rs.map((r) => r.sec)),
  medChars: q(rs.map((r) => r.resultChars), 0.5), maxChars: Math.max(...rs.map((r) => r.resultChars)) }));
console.table(summary);
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ log, since, summary, calls: rows }, null, 1));
