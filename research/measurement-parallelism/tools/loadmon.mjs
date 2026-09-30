#!/usr/bin/env node
// Low-overhead host-load sampler. Every INTERVAL seconds: one `ps` call, CPU-time deltas per pid,
// grouped by process family; loadavg; the chrome-measure lock holder (read straight from the lock files).
// Usage: node loadmon.mjs <out.jsonl> [intervalSec=5] [lockDir]
// Stop with SIGTERM/SIGINT.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { loadavg, cpus } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const out = process.argv[2];
const intervalSec = Number(process.argv[3] || 5);
const lockDir = process.argv[4] || '/Users/<user>/source/fastwork-com-web-optimize/.git/fastwork-mirror/locks';
const NCPU = cpus().length;
if (!out) { console.error('usage: loadmon.mjs <out.jsonl> [intervalSec] [lockDir]'); process.exit(2); }

// "[dd-][hh:]mm:ss.ss" -> seconds
function cpuSec(t) {
  let days = 0;
  if (t.includes('-')) { const [d, rest] = t.split('-'); days = Number(d); t = rest; }
  const parts = t.split(':').map(Number);
  let s = 0;
  for (const p of parts) s = s * 60 + p;
  return days * 86400 + s;
}

function snapshot() {
  const txt = execFileSync('ps', ['-Ao', 'pid=,ppid=,rss=,time=,command='], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const procs = new Map();
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    procs.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), rssKB: Number(m[3]), cpu: cpuSec(m[4]), cmd: m[5] });
  }
  return procs;
}

const MEASURE_PROFILE = /user-data-dir=\S*(chrome-verify-profile|measure-parallel|chrome-ab|verify-profile)/;
function classify(procs) {
  // Root Chrome browser processes -> measured or other; helpers inherit via ppid chain.
  const root = new Map(); // pid -> 'measured' | 'other'
  for (const p of procs.values()) {
    if (/\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome( |$)/.test(p.cmd) || /Chrome for Testing\.app\/Contents\/MacOS\//.test(p.cmd)) {
      root.set(p.pid, MEASURE_PROFILE.test(p.cmd) ? 'measured' : 'other');
    }
  }
  const fam = new Map();
  for (const p of procs.values()) {
    let f;
    let q = p, hops = 0;
    while (q && hops < 6) { if (root.has(q.pid)) { f = root.get(q.pid); break; } q = procs.get(q.ppid); hops++; }
    const c = p.cmd;
    if (f === 'measured') {
      f = /--type=renderer/.test(c) ? 'chrome_measured_renderer' : /--type=gpu-process/.test(c) ? 'chrome_measured_gpu' : root.has(p.pid) ? 'chrome_measured_browser' : 'chrome_measured_other';
    } else if (f === 'other' || /Google Chrome|Chromium|Chrome Helper/.test(c)) f = 'chrome_other';
    else if (/(^|\/)node\s/.test(c) || /(^|\/)node$/.test(c)) {
      f = /serve\.mjs|fix\.mjs serve|vite|http-server|preview/.test(c) ? 'node_servers'
        : /tools\/(verify|fix|mirror)\.mjs|lock\.mjs run/.test(c) ? 'node_measure_tools'
        : /npm test|node --test|vitest|jest|mocha/.test(c) ? 'node_tests'
        : /chrome-devtools-mcp|mcp/.test(c) ? 'node_mcp' : 'node_other';
    }
    else if (/^claude\b|\/claude(\s|$)|\.claude\/local|@anthropic-ai\/claude-code/.test(c)) f = 'claude';
    else if (/serena|Python|python|\buv\b|uvx/.test(c)) f = 'serena_python';
    else if (/WindowServer/.test(c)) f = 'windowserver';
    else if (/kernel_task/.test(c)) f = 'kernel_task';
    else if (/ugrep|rg\b|\bgrep\b|\bgit\b|\bfind\b/.test(c)) f = 'shell_tools';
    else f = 'other';
    fam.set(p.pid, f);
  }
  return fam;
}

// Memory: vm_stat counters (cumulative ones become per-second rates), pressure level, swap.
function memState() {
  const txt = execFileSync('vm_stat', { encoding: 'utf8' });
  const page = Number(txt.match(/page size of (\d+)/)?.[1] || 16384);
  const v = {};
  for (const m of txt.matchAll(/^"?([^:"]+)"?:\s+(\d+)\./gm)) v[m[1].trim()] = Number(m[2]);
  const GB = (pages) => Math.round(((pages * page) / 2 ** 30) * 100) / 100;
  let pressure = null, swapUsedMB = null;
  try { pressure = Number(execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' })); } catch {}
  try { swapUsedMB = Number(execFileSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8' }).match(/used = ([\d.]+)M/)?.[1]); } catch {}
  return {
    gauges: { freeGB: GB(v['Pages free'] + (v['Pages speculative'] || 0)), compressorGB: GB(v['Pages occupied by compressor']), storedInCompressorGB: GB(v['Pages stored in compressor']), wiredGB: GB(v['Pages wired down']), pressure, swapUsedMB },
    counters: { compressions: v['Compressions'], decompressions: v['Decompressions'], pageins: v['Pageins'], pageouts: v['Pageouts'], swapins: v['Swapins'], swapouts: v['Swapouts'] },
  };
}

function lockState() {
  const r = { holder: null, queue: null };
  try { const h = JSON.parse(readFileSync(`${lockDir}/chrome-measure.json`, 'utf8')); r.holder = h.owner || null; r.holderCmd = h.meta?.cmd; } catch {}
  try { r.queue = JSON.parse(readFileSync(`${lockDir}/chrome-measure.queue.json`, 'utf8')).length; } catch {}
  return r;
}

let stop = false;
process.on('SIGTERM', () => { stop = true; });
process.on('SIGINT', () => { stop = true; });

// Host CPU from the kernel's per-core tick counters: exact, and unlike per-pid ps deltas it includes
// processes that start and exit between two samples (npm test spawns many of those).
const ticks = () => cpus().reduce((a, c) => { const t = c.times; a.busy += t.user + t.nice + t.sys + t.irq; a.all += t.user + t.nice + t.sys + t.irq + t.idle; return a; }, { busy: 0, all: 0 });
let prevTicks = ticks();
let prevMem = memState();
let prev = snapshot();
let prevT = performance.now();
while (!stop) {
  await sleep(intervalSec * 1000);
  const cur = snapshot();
  const t = performance.now();
  const dt = (t - prevT) / 1000;
  const fam = classify(cur);
  const byFam = {};
  let total = 0;
  const counts = {};
  const top = [];
  for (const p of cur.values()) {
    const before = prev.get(p.pid);
    const d = before && before.cmd === p.cmd ? p.cpu - before.cpu : p.cpu; // new pid: all its cpu is in this window
    if (d <= 0) continue;
    const f = fam.get(p.pid);
    byFam[f] = (byFam[f] || 0) + d;
    total += d;
    top.push([d, p.pid, f, p.cmd.slice(0, 80)]);
  }
  for (const f of fam.values()) counts[f] = (counts[f] || 0) + 1;
  const pct = (s) => Math.round((s / dt / NCPU) * 1000) / 10; // % of whole machine
  const fams = Object.fromEntries(Object.entries(byFam).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pct(v)]));
  top.sort((a, b) => b[0] - a[0]);
  const mem = memState();
  const rate = Object.fromEntries(Object.entries(mem.counters).map(([k, v]) => [k + 'PerSec', Math.round((v - prevMem.counters[k]) / dt)]));
  prevMem = mem;
  const rssGB = {};
  for (const p of cur.values()) { const f = fam.get(p.pid); rssGB[f] = (rssGB[f] || 0) + p.rssKB; }
  for (const k of Object.keys(rssGB)) rssGB[k] = Math.round((rssGB[k] / 2 ** 20) * 100) / 100;
  const la = loadavg();
  const rec = {
    ts: new Date().toISOString(),
    dt: Math.round(dt * 100) / 100,
    load1: Math.round(la[0] * 100) / 100, load5: Math.round(la[1] * 100) / 100, load15: Math.round(la[2] * 100) / 100,
    cpuPct: pct(total),
    hostCpuPct: (() => { const t = ticks(); const v = Math.round(((t.busy - prevTicks.busy) / (t.all - prevTicks.all)) * 1000) / 10; prevTicks = t; return v; })(),
    fam: fams,
    mem: { ...mem.gauges, ...rate },
    rssGB,
    nProcs: counts,
    nChromeMeasuredRoots: [...cur.values()].filter((p) => fam.get(p.pid) === 'chrome_measured_browser').length,
    top3: top.slice(0, 3).map(([d, pid, f, c]) => ({ pid, f, pct: pct(d), c })),
    lock: lockState(),
  };
  appendFileSync(out, JSON.stringify(rec) + '\n');
  prev = cur; prevT = t;
}
