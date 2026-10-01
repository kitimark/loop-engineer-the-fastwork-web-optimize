// Back-tag Chrome measurement holds (verify.json files) with host power/display state from `pmset -g log`.
// Usage: node scan.mjs <pmset.log> <root>...   (prints JSON lines + a markdown table)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [pmsetPath, ...roots] = process.argv.slice(2);
const SINCE = Date.parse('2026-09-30T16:00:00Z');

// ---- pmset timeline ----
const ev = [];
for (const line of readFileSync(pmsetPath, 'utf8').split('\n')) {
  const m = line.match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-]\d{4}) (\S+)\s+(.*)$/);
  if (!m) continue;
  const t = Date.parse(`${m[1]}T${m[2]}${m[3].slice(0, 3)}:${m[3].slice(3)}`);
  if (t < SINCE - 86400e3) continue;
  const [, , , , kind, rest] = m;
  let e = null;
  if (kind === 'Sleep' && /Entering Sleep/.test(rest)) e = 'sleep';
  else if (kind === 'DarkWake' && /DarkWake from/.test(rest)) e = 'darkwake';
  else if (kind === 'Wake' && /DarkWake to FullWake|Wake from/.test(rest)) e = 'fullwake';
  else if (kind === 'Notification' && /Display is turned on/.test(rest)) e = 'display-on';
  else if (kind === 'Notification' && /Display is turned off/.test(rest)) e = 'display-off';
  const pw = rest.match(/Using (AC|Batt|BATT)/i);
  if (pw) ev.push({ t, power: /^AC$/i.test(pw[1]) ? 'AC' : 'battery' });
  if (e) ev.push({ t, e });
}
ev.sort((a, b) => a.t - b.t);
function stateAt(t) {
  let wake = 'unknown', display = 'unknown', power = 'unknown';
  for (const x of ev) {
    if (x.t > t) break;
    if (x.power) power = x.power;
    if (x.e === 'sleep') { wake = 'asleep'; display = 'off'; }
    if (x.e === 'darkwake') { wake = 'DarkWake'; display = 'off'; }
    if (x.e === 'fullwake') wake = 'FullWake';
    if (x.e === 'display-on') { display = 'on'; wake = 'FullWake'; }
    if (x.e === 'display-off') display = 'off';
  }
  return { wake, display, power };
}
function transitionsIn(a, b) { return ev.filter((x) => x.e && x.t > a && x.t < b).map((x) => `${new Date(x.t).toISOString().slice(11, 19)}Z ${x.e}`); }

// ---- verify.json files ----
const files = [];
function walk(d, depth) {
  if (depth > 7) return;
  let ents; try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const en of ents) {
    if (en.name === 'node_modules' || en.name === 'site' || en.name === 'site-pretty' || en.name.startsWith('chrome-')) continue;
    const p = join(d, en.name);
    if (en.isDirectory()) walk(p, depth + 1);
    else if (en.name === 'verify.json') files.push(p);
  }
}
for (const r of roots) walk(r, 0);

const rows = [];
for (const f of files) {
  let v; try { v = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  const ats = [];
  const visit = (o) => { if (!o || typeof o !== 'object') return; for (const [k, x] of Object.entries(o)) { if (k === 'at' && typeof x === 'string') ats.push(Date.parse(x)); else if (typeof x === 'object') visit(x); } };
  visit(v.results);
  const end = statSync(f).mtimeMs;
  const stamp = f.match(/(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z)/)?.[1];
  const start = stamp ? Date.parse(stamp.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z/, 'T$1:$2:$3.$4Z')) : (ats.length ? Math.min(...ats) : end);
  if (end < SINCE) continue;
  const rowsV = v.rows || [];
  const base = rowsV.find((r) => r.target === 'base') || rowsV[0] || {};
  const fix = rowsV.find((r) => r.target === 'fix');
  const slept = (v.results || []).some((r) => r.host?.woke || r.host?.sleptSec > 0);
  const s0 = stateAt(start), s1 = stateAt(end);
  rows.push({ file: f, start: new Date(start).toISOString(), end: new Date(end).toISOString(), runs: v.runs, cpu: v.cpu, idle: v.idle,
    targets: (v.targets || []).map((t) => t.label).join('/'), baseFps: base.fps, fixFps: fix?.fps, idleFps: base.idleFps, slept,
    snapshot: v.baseline?.snapshot, s0, s1, trans: transitionsIn(start, end) });
}
rows.sort((a, b) => a.start.localeCompare(b.start));
for (const r of rows) console.log(JSON.stringify(r));
