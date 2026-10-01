#!/usr/bin/env node
// Claude usage meter for this project, computed from local transcripts only (read-only, no network).
// User request T-010 (2026-10-01 22:0xZ): "Every 30 minutes, measure the current session usage. make it carries over
// to next session."
//
//   node research/management/tools/usage.mjs                          # markdown report; appends one JSON line to the log
//   node research/management/tools/usage.mjs --reset 2026-10-01T21:20Z  # window anchor (any past reset; windows are 5 h)
//   node research/management/tools/usage.mjs --calibrate 2026-10-01T22:04:55Z=10   # record the user's own plan reading
//   node research/management/tools/usage.mjs --now <ISO>              # report as of another instant (tests, back-fills)
//   node research/management/tools/usage.mjs --no-log                 # do not append to usage.jsonl
//   node research/management/tools/usage.mjs --json                   # print the JSON record instead of markdown
//
// Sources (never written, never sent anywhere):
//   ~/.claude/projects/<this project>/<session>.jsonl                        main sessions ("main:<id8>")
//   ~/.claude/projects/<this project>/<session>/subagents/**/agent-*.jsonl   agents; names from agent-*.meta.json
//     (`name`, else the spawn `description`, else agent-<id>)
// Each assistant line carries timestamp, message.model, message.usage. One API message is written once per content
// block with the same usage, so lines are de-duplicated by message.id (else requestId, else uuid); "<synthetic>" lines
// are skipped. A message counts at its first timestamp.
//
// Privacy (Hard rule 12): only counts, timestamps, model names and agent names are read out; transcript text is never
// printed or stored.
//
// Output store (shared by every worktree, local, never committed): <git-common-dir>/fastwork-mirror/usage/
//   usage.jsonl        one line per run: {at, windowStart, windowEnd, last30, window, byAgent (top 10), byModel, estimate}
//   calibration.jsonl  the user's readings {at, percent, windowStart, recordedAt}
//
// Plan %: the plan limit cannot be read locally. The estimate divides this window's weighted units by the units per
// percent implied by the user's readings (each reading: units used from its window start to the reading / percent).
// Weighted units = input + 1.25 x cache writes + 0.1 x cache reads + 5 x output, times a model factor (opus 1,
// sonnet 0.6, haiku 0.2): a rough price proxy, not the plan's formula. The user's % may also include usage outside
// this project. It is labelled ESTIMATE everywhere.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, appendFileSync, createReadStream } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { createInterface } from 'node:readline';
import os from 'node:os';

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);

const H5 = 5 * 3600e3;
const NOW = opt('now') ? Date.parse(opt('now')) : Date.now();
const ANCHOR = Date.parse(opt('reset', '2026-10-01T21:20:00Z'));
if (!Number.isFinite(NOW) || !Number.isFinite(ANCHOR)) { console.error('usage.mjs: bad --now or --reset'); process.exit(1); }
const windowStartOf = (t) => ANCHOR + Math.floor((t - ANCHOR) / H5) * H5;

const git = (args) => { try { return execFileSync('git', ['--no-optional-locks', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const COMMON = resolve(process.cwd(), git(['rev-parse', '--path-format=absolute', '--git-common-dir']) || '.git');
const REPO = dirname(COMMON);
const STORE = join(process.env.FW_STATE_DIR || join(COMMON, 'fastwork-mirror'), 'usage');
const PROJECTS = process.env.FW_TRANSCRIPTS || join(os.homedir(), '.claude', 'projects', REPO.replace(/[^A-Za-z0-9]/g, '-'));

const readJsonl = (f) => { try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const ls = (d) => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } };

// --- calibration -----------------------------------------------------------------------------------------------
const calFile = join(STORE, 'calibration.jsonl');
const cal = opt('calibrate');
if (cal) {
  const m = /^(.+)=(\d+(?:\.\d+)?)%?$/.exec(cal);
  const at = m && Date.parse(m[1]);
  if (!m || !Number.isFinite(at)) { console.error('usage.mjs: --calibrate <ISO>=<percent>'); process.exit(1); }
  mkdirSync(STORE, { recursive: true });
  const rec = { at: new Date(at).toISOString(), percent: Number(m[2]), windowStart: new Date(windowStartOf(at)).toISOString(), recordedAt: new Date().toISOString() };
  appendFileSync(calFile, JSON.stringify(rec) + '\n');
  console.log(`CALIBRATION ${rec.at} = ${rec.percent} % (window from ${rec.windowStart})`);
}
const calibrations = readJsonl(calFile).filter((c) => Number.isFinite(Date.parse(c.at)) && c.percent > 0);

// --- files -----------------------------------------------------------------------------------------------------
// Only files touched since the earliest instant we need (oldest calibration window, current window, last 30 min).
const needFrom = Math.min(windowStartOf(NOW), NOW - 30 * 60e3, ...calibrations.map((c) => Date.parse(c.windowStart)));
const files = []; // {path, agent}
const metaName = (jsonl) => {
  try {
    const m = JSON.parse(readFileSync(jsonl.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    if (m.name) return m.name;
    if (m.description) return `"${String(m.description).slice(0, 40)}"`;
  } catch { /* no meta */ }
  return basename(jsonl, '.jsonl');
};
const walkAgents = (dir) => {
  for (const e of ls(dir)) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkAgents(p);
    else if (/^agent-.*\.jsonl$/.test(e.name)) files.push({ path: p, agent: metaName(p) });
  }
};
for (const e of ls(PROJECTS)) {
  const p = join(PROJECTS, e.name);
  if (e.isFile() && e.name.endsWith('.jsonl')) files.push({ path: p, agent: `main:${e.name.slice(0, 8)}` });
  else if (e.isDirectory()) walkAgents(join(p, 'subagents'));
}
const recent = files.filter((f) => { try { return statSync(f.path).mtimeMs >= needFrom; } catch { return false; } });

// --- messages --------------------------------------------------------------------------------------------------
const msgs = new Map(); // key -> {t, model, agent, u}
const tsRe = /"timestamp":"([^"]+)"/;
for (const f of recent) {
  const rl = createInterface({ input: createReadStream(f.path, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
    const ts = tsRe.exec(line);
    if (!ts || Date.parse(ts[1]) < needFrom) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    const m = d.message;
    if (d.type !== 'assistant' || !m || !m.usage || !m.model || m.model === '<synthetic>') continue;
    const key = m.id || d.requestId || d.uuid;
    if (msgs.has(key)) continue;
    const u = m.usage;
    msgs.set(key, {
      t: Date.parse(d.timestamp), model: m.model, agent: f.agent,
      u: { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, cacheRead: u.cache_read_input_tokens || 0 },
    });
  }
}

// --- aggregation -----------------------------------------------------------------------------------------------
const KINDS = ['input', 'output', 'cacheWrite', 'cacheRead'];
const modelFactor = (model) => (/opus|fable/i.test(model) ? 1 : /sonnet/i.test(model) ? 0.6 : /haiku/i.test(model) ? 0.2 : 1);
const units = (m) => (m.u.input + 1.25 * m.u.cacheWrite + 0.1 * m.u.cacheRead + 5 * m.u.output) * modelFactor(m.model);
const zero = () => ({ messages: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, units: 0 });
const add = (acc, m) => { acc.messages++; for (const k of KINDS) acc[k] += m.u[k]; acc.units += units(m); return acc; };
const sumRange = (a, b) => { const acc = zero(); for (const m of msgs.values()) if (m.t >= a && m.t < b) add(acc, m); acc.units = Math.round(acc.units); return acc; };
const group = (a, b, by) => {
  const g = new Map();
  for (const m of msgs.values()) if (m.t >= a && m.t < b) add(g.get(m[by]) || g.set(m[by], zero()).get(m[by]), m);
  return [...g.entries()].map(([name, v]) => ({ name, ...v, units: Math.round(v.units) })).sort((x, y) => y.output - x.output);
};

const wStart = windowStartOf(NOW);
const window = sumRange(wStart, NOW + 1);
const last30 = sumRange(NOW - 30 * 60e3, NOW + 1);
const byAgent = group(wStart, NOW + 1, 'agent').slice(0, 10);
const byModel = group(wStart, NOW + 1, 'model');

// Estimate: units per percent from each calibration (units from its window start to the reading).
const points = calibrations.map((c) => {
  const at = Date.parse(c.at), ws = Date.parse(c.windowStart);
  const u = sumRange(ws, at + 1).units;
  return { at: c.at, percent: c.percent, units: u, unitsPerPercent: u > 0 ? u / c.percent : null };
}).filter((p) => p.unitsPerPercent);
const upp = points.length ? points.map((p) => p.unitsPerPercent).sort((a, b) => a - b) : [];
const estimate = upp.length ? {
  percent: Math.round((window.units / upp[upp.length >> 1]) * 10) / 10,
  range: upp.length > 1 ? [Math.round((window.units / upp[upp.length - 1]) * 10) / 10, Math.round((window.units / upp[0]) * 10) / 10] : null,
  from: points.map((p) => ({ at: p.at, percent: p.percent, unitsPerPercent: Math.round(p.unitsPerPercent) })),
  note: 'ESTIMATE from the user\'s readings and a rough price-weighted proxy; not the plan formula',
} : null;

const rec = {
  at: new Date(NOW).toISOString(), windowStart: new Date(wStart).toISOString(), windowEnd: new Date(wStart + H5).toISOString(),
  last30, window, byAgent, byModel, estimate,
};
if (!flag('no-log')) { mkdirSync(STORE, { recursive: true }); appendFileSync(join(STORE, 'usage.jsonl'), JSON.stringify(rec) + '\n'); }

// --- report ----------------------------------------------------------------------------------------------------
if (flag('json')) { console.log(JSON.stringify(rec, null, 2)); process.exit(0); }
const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(1) + ' k' : String(n));
const hhmm = (t) => new Date(t).toISOString().slice(11, 16) + 'Z';
const row = (name, v) => `| ${name} | ${v.messages} | ${k(v.output)} | ${k(v.input)} | ${k(v.cacheWrite)} | ${k(v.cacheRead)} | ${k(v.units)} |`;
const head = '| | messages | output | input | cache write | cache read | weighted units |\n|---|---|---|---|---|---|---|';
const L = [];
L.push(`## Usage ${new Date(NOW).toISOString().slice(0, 16)}Z (window ${hhmm(wStart)}-${hhmm(wStart + H5)}, reset in ${Math.round((wStart + H5 - NOW) / 60e3)} min)`);
L.push('');
L.push(estimate
  ? `**Plan used: ~${estimate.percent} % (ESTIMATE${estimate.range ? `, range ${estimate.range[0]}-${estimate.range[1]} %` : ''}; from ${points.length} user reading(s); rough proxy, may miss usage outside this project)**`
  : '**Plan used: no estimate (no calibration; add one with --calibrate <ISO>=<percent>)**');
L.push('');
L.push(head);
L.push(row('this window', window));
L.push(row('last 30 min', last30));
L.push('');
L.push('**By agent (this window, top 10 by output)**');
L.push('');
L.push(head.replace('| |', '| agent |'));
for (const a of byAgent) L.push(row(a.name, a));
L.push('');
L.push('**By model (this window)**');
L.push('');
L.push(head.replace('| |', '| model |'));
for (const m of byModel) L.push(row(m.name, m));
L.push('');
L.push(`Sources: ${recent.length} of ${files.length} transcript files touched since ${hhmm(needFrom)}; ${msgs.size} API messages. Log: ${flag('no-log') ? 'not written (--no-log)' : 'usage.jsonl appended'}.`);
console.log(L.join('\n'));
