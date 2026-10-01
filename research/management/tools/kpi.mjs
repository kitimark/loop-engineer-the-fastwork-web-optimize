#!/usr/bin/env node
// Management KPIs for the "ultra smooth" goal, computed from local data only (read-only).
//
//   node research/management/tools/kpi.mjs                    # markdown report on stdout
//   node research/management/tools/kpi.mjs --json out.json    # also write the raw KPI object
//   node research/management/tools/kpi.mjs --since 2026-10-01T00:00Z   # only A/Bs, incidents and landings after this
//   node research/management/tools/kpi.mjs --transcript <session.jsonl>  # also count the user's process nudges
//   node research/management/tools/kpi.mjs --compare research/management/data/kpi-baseline.json   # delta column
//
// Sources (never written, never sent anywhere):
//   - git: `main` history, all local branches, `git worktree list`;
//   - every checkout (main + .claude/worktrees/*): fixes/*/results.json, out/ab/*/*/{verify.json,results*.json},
//     out/iphone*/*.json summaries;
//   - the shared store <git-common-dir>/fastwork-mirror/: locks (holder, queue, audit.log), incidents, findings;
//   - fixes/EXPERIMENTS.md, fixes/ARCH_TEAM.md, fixes/TOPICS.md on main;
//   - optionally the session transcript (only the user's own typed/queued prompts are counted, never printed).
// Git is run with `--no-optional-locks` and only read commands. No Chrome, no locks taken, no network.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SINCE = opt('since') ? Date.parse(opt('since')) : 0;
const NOW = Date.now();

const git = (args, cwd) => {
  try { return execFileSync('git', ['--no-optional-locks', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim(); }
  catch { return ''; }
};
const COMMON = resolve(process.cwd(), git(['rev-parse', '--path-format=absolute', '--git-common-dir'], process.cwd()) || '.git');
const REPO = dirname(COMMON);                       // the main checkout
const STATE = process.env.FW_STATE_DIR || join(COMMON, 'fastwork-mirror');
const G = (args) => git(args, REPO);
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const ls = (d) => { try { return readdirSync(d); } catch { return []; } };
const median = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const mins = (ms) => r1(ms / 60000);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const CLEAN_LOAD = 6;

// ---------------------------------------------------------------- checkouts, branches
const worktrees = [];
{
  let cur = null;
  for (const line of G(['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; worktrees.push(cur); }
    else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (line.startsWith('HEAD ') && cur) cur.head = line.slice(5);
  }
}
const checkouts = worktrees.map((w) => w.path).filter((p) => existsSync(p));
const branches = G(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter(Boolean);

// ---------------------------------------------------------------- friction scan (--friction): who waits on what, now
// Retro 1.5: agents were blocked on process (short jobs behind 25-40 min A/Bs, I-020/I-021) and the signals
// were in `lock.mjs status` for 20+ min before the user noticed. This mode is cheap (~6 s, no transcript,
// no results scan) and is run at every mgmt-ops check-in; its ALARM lines go into the digest, and an alarm
// older than one check-in becomes an incident candidate. Exit code 2 when any ALARM fires.
if (argv.includes('--friction')) {
  const LIM = { shortWaitMin: 10, normalWaitMin: 30, queueLen: 3, holderFactor: 2, incidentUnownedMin: 60, iphoneStaleMin: 60, behind: 20 };
  const alarms = []; const warns = [];
  const A = (code, msg) => alarms.push(`ALARM ${code}: ${msg}`);
  const W = (code, msg) => warns.push(`warn  ${code}: ${msg}`);
  const cpuTicks = () => os.cpus().reduce((a, c) => { const t = c.times; a.tot += t.user + t.nice + t.sys + t.idle + t.irq; a.idle += t.idle; return a; }, { tot: 0, idle: 0 });
  const secs = (s) => { const m = String(s).trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/); return m ? (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+m[3]) * 60 + (+m[4]) : 0; };
  const procs = () => {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,time=,etime=,command='], { encoding: 'utf8', maxBuffer: 32 << 20 }).split('\n').filter(Boolean)
      .map((l) => { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/); return m && { pid: +m[1], ppid: +m[2], cpu: secs(m[3]), age: secs(m[4]), cmd: m[5] }; }).filter(Boolean);
    return rows;
  };
  const treeCpu = (rows, root) => { const kids = {}; for (const r of rows) (kids[r.ppid] ||= []).push(r); let s = 0; const st = [root]; const seen = new Set();
    while (st.length) { const p = st.pop(); if (seen.has(p)) continue; seen.add(p); const r = rows.find((x) => x.pid === p); if (r) s += r.cpu; for (const k of kids[p] || []) st.push(k.pid); } return s; };
  const t0 = cpuTicks(); const p0 = procs();
  await new Promise((r) => setTimeout(r, 5000));
  const t1 = cpuTicks(); const p1 = procs();
  const busyPct = Math.round(100 * (1 - (t1.idle - t0.idle) / Math.max(1, t1.tot - t0.tot)));
  const load1 = r1(os.loadavg()[0]);
  const quiet = load1 <= CLEAN_LOAD && busyPct <= 25;
  const behindOf = (checkout) => { const w = worktrees.find((x) => x.path === checkout); return w?.branch && w.path !== REPO ? Number(G(['rev-list', '--count', `${w.branch}..main`]) || 0) : 0; };
  const lines = [`# friction scan ${new Date(NOW).toISOString()}  host: load1 ${load1}, CPU ${busyPct} % busy${quiet ? ' (QUIET)' : ''}`, ''];
  for (const res of ['chrome-measure', 'iphone']) {
    const h = readJson(join(STATE, 'locks', `${res}.json`));
    const q = readJson(join(STATE, 'locks', `${res}.queue.json`)) || [];
    if (h) {
      const age = (NOW - Date.parse(h.acquiredAt)) / 60000;
      const runs = Number(h.meta?.runs) || 0;
      const expected = h.meta?.cmd === 'verify' && runs ? runs * 2 * 1.1 + 2 : h.meta?.maxSec ? h.meta.maxSec / 60 : h.kind === 'lease' && h.expiresAt ? (Date.parse(h.expiresAt) - Date.parse(h.acquiredAt)) / 60000 : 10;
      const dCpu = h.kind === "process" && h.pid ? treeCpu(p1, h.pid) - treeCpu(p0, h.pid) : null; const cpu = dCpu != null && dCpu >= 0 ? r1(dCpu) : null; // < 0: the tree changed between samples
      const beh = behindOf(h.checkout);
      lines.push(`${res}: held by ${h.owner} [${h.kind}${h.meta?.cmd ? ' ' + h.meta.cmd : ''}] ${r1(age)} min (expected ~${r1(expected)})${cpu != null ? `, tree CPU ${cpu} s in 5 s` : ''}${beh ? `, checkout ${beh} commits behind main` : ''}`);
      if (res === 'chrome-measure') {
        if (age > LIM.holderFactor * expected) A('HOLDER-OVERDUE', `${h.owner} holds chrome-measure ${r1(age)} min, > ${LIM.holderFactor}x expected ${r1(expected)} min`);
        if (cpu != null && cpu < 0.2 && q.length) (age > 5 ? A : W)('HOLDER-IDLE', `${h.owner} holds chrome-measure but its process tree used ${cpu} s CPU in 5 s (hung or waiting?) with ${q.length} queued${quiet ? '; host is QUIET: the quiet window is being wasted' : ''}`);
        if (h.kind === 'lease' && expected > 30) W('LONG-LEASE', `${h.owner} lease of ${r1(expected)} min on chrome-measure`);
        if (beh > LIM.behind) W('OLD-TOOLS-HOLDER', `${h.owner} runs from a checkout ${beh} commits behind main (old lock/tool code, cf. I-011)`);
      } else if (h.owner && /offline/.test(h.owner)) W('IPHONE-PARKED', `iPhone lease parked by ${h.owner} until ${h.expiresAt}: nothing triggers the pending iPhone checks when the phone is back`);
    } else lines.push(`${res}: free${q.length ? ` with ${q.length} queued (grant pending?)` : ''}`);
    for (const e of q) {
      const w = (NOW - Date.parse(e.since)) / 60000; const beh = behindOf(e.checkout);
      lines.push(`  waiting: ${e.owner} [${e.short ? `short ${e.maxSec || '?'} s` : 'normal'}] ${r1(w)} min${beh ? `, ${beh} behind main` : ''}`);
      if (e.short && w > LIM.shortWaitMin) A('SHORT-WAIT', `${e.owner} (short job) has waited ${r1(w)} min > ${LIM.shortWaitMin}`);
      if (!e.short && w > LIM.normalWaitMin) A('NORMAL-WAIT', `${e.owner} has waited ${r1(w)} min > ${LIM.normalWaitMin}`);
      if (beh > LIM.behind) W('OLD-TOOLS-WAITER', `${e.owner} queues from a checkout ${beh} commits behind main`);
    }
    if (res === 'chrome-measure' && q.length > LIM.queueLen) A('QUEUE-LONG', `${q.length} waiting on chrome-measure (> ${LIM.queueLen}); ${q.filter((e) => e.short).length} of them short jobs`);
  }
  // incidents: active and unowned, or blocking
  for (const f of ls(join(STATE, 'incidents')).filter((f) => /^I-\d+\.json$/.test(f))) {
    const i = readJson(join(STATE, 'incidents', f)); if (!i || i.status === 'resolved') continue;
    const age = (NOW - Date.parse(i.openedAt)) / 60000;
    if (!i.assignee && age > LIM.incidentUnownedMin) A('INCIDENT-UNOWNED', `${i.id} active ${r1(age)} min with no assignee: ${String(i.title).slice(0, 80)}`);
    if (i.blocking) W('INCIDENT-BLOCKING', `${i.id} is blocking (${r1(age)} min)`);
  }
  // the goal's device: time since the last iPhone measurement anywhere
  let lastPhone = 0;
  for (const co of checkouts) for (const d of ls(join(co, 'out')).filter((d) => d.startsWith('iphone'))) for (const f of ls(join(co, 'out', d))) { try { lastPhone = Math.max(lastPhone, statSync(join(co, 'out', d, f)).mtimeMs); } catch {} }
  if (lastPhone && (NOW - lastPhone) / 60000 > LIM.iphoneStaleMin) W('IPHONE-STALE', `no iPhone measurement for ${r1((NOW - lastPhone) / 60000)} min (the goal's device)`);
  // tooling touched outside toolsmith branches (I-021: they then run the full suite in the short lane)
  const onMain = new Set(G(['ls-tree', '-d', '--name-only', 'main', 'fixes/']).split('\n').map((x) => x.replace(/^fixes\//, '')));
  const lockOwners = ['chrome-measure', 'iphone'].flatMap((r) => [readJson(join(STATE, 'locks', `${r}.json`)), ...(readJson(join(STATE, 'locks', `${r}.queue.json`)) || [])]).filter(Boolean);
  for (const w of worktrees.filter((w) => w.path !== REPO)) {
    // only fix-owner worktrees (a fixes/<topic>/ that main doesn't have); toolsmiths are meant to touch tools
    const topics = ls(join(w.path, 'fixes')).filter((t) => !onMain.has(t) && existsSync(join(w.path, 'fixes', t, 'README.md')));
    if (!topics.length || lockOwners.some((o) => o.checkout === w.path && /^ts-/.test(o.owner))) continue;
    const ch = git(['status', '--porcelain'], w.path).split('\n').filter((l) => /^.. (tools|tests)\//.test(l));
    const ahead = w.branch ? G(['diff', '--name-only', `main...${w.branch}`]).split('\n').filter((p) => /^(tools|tests)\//.test(p)) : [];
    const subj = w.branch ? G(['log', '--format=%s', `main..${w.branch}`]) : '';
    if ((ch.length || ahead.length) && !/^(tools|tests)/m.test(subj) && !/ts-|toolsmith/.test(w.branch)) W('TOOLS-TOUCHED', `${w.branch} (${topics.join(', ')}): ${ch.length + ahead.length} tools/tests path(s) changed on a non-tooling branch`);
  }
  // leftovers that cost memory and CPU: orphaned servers, stray automation Chromes
  const orphans = p1.filter((r) => r.ppid === 1 && /serve\.mjs/.test(r.cmd) && !/--port 5173\b/.test(r.cmd));
  if (orphans.length) W('ORPHAN-SERVERS', `${orphans.length} serve.mjs with parent 1 (not port 5173)`);
  const mcpChrome = p1.filter((r) => /chrome-devtools-mcp\/chrome-profile/.test(r.cmd) && /Google Chrome\.app\/Contents\/MacOS\/Google Chrome /.test(r.cmd) && r.age > 3600);
  if (mcpChrome.length) W('STRAY-CHROME', `${mcpChrome.length} chrome-devtools MCP Chrome running ${r1(mcpChrome[0].age / 3600)} h (unused since rule 8?)`);
  if (quiet && alarms.some((a) => /HOLDER-(IDLE|OVERDUE)/.test(a))) A('QUIET-WASTED', `host is quiet (load1 ${load1}, CPU ${busyPct} %) but chrome-measure is blocked: use this window for the clean A/Bs`);
  console.log([...lines, '', ...(alarms.length ? alarms : ['no alarms']), ...warns].join('\n'));
  process.exit(alarms.length ? 2 : 0);
}

// ---------------------------------------------------------------- A/B sessions and results
// One "session" per fix.mjs ab run: out/ab/<topic>/<stamp>/verify.json (stamp = start, before the lock wait;
// verify.json mtime = end). results.json files add the metrics summary (deduped by topic+createdAt+viewport).
const sessions = [];
const results = new Map();
const addResult = (r, where) => {
  if (!r || !r.metrics || !r.createdAt) return;
  for (const x of [r, r.desktop].filter(Boolean)) {
    if (!x.metrics) continue;
    const key = `${x.topic}|${x.createdAt}|${x.config?.viewport}`;
    if (!results.has(key)) results.set(key, { ...x, where });
  }
};
const stampToMs = (s) => Date.parse(s.replace(/^(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, '$1T$2:$3:$4.$5Z'));
for (const co of checkouts) {
  for (const t of ls(join(co, 'fixes'))) addResult(readJson(join(co, 'fixes', t, 'results.json')), co);
  const abDir = join(co, 'out', 'ab');
  for (const t of ls(abDir)) for (const st of ls(join(abDir, t))) {
    const d = join(abDir, t, st);
    for (const f of ls(d).filter((f) => /^results.*\.json$/.test(f))) addResult(readJson(join(d, f)), co);
    const vf = join(d, 'verify.json');
    const start = stampToMs(st);
    if (!Number.isFinite(start)) continue;
    const v = existsSync(vf) ? readJson(vf) : null;
    const runs = v ? v.results.filter((x) => !x.diff && x.loadavg1) : [];
    sessions.push({
      topic: t, start, end: v ? statSync(vf).mtimeMs : null, completed: !!v, checkout: basename(co),
      viewport: v?.viewports?.[0], cpu: v?.cpu, runs: runs.length,
      loads: runs.map((x) => x.loadavg1.before),
    });
  }
}
// results.json committed on branches whose worktree is gone
for (const b of branches) {
  for (const p of G(['ls-tree', '-r', '--name-only', b, '--', 'fixes']).split('\n').filter((p) => /^fixes\/[^/]+\/results\.json$/.test(p))) {
    const txt = G(['show', `${b}:${p}`]);
    if (txt) { try { addResult(JSON.parse(txt), `branch ${b}`); } catch {} }
  }
}
// dedupe sessions seen through several checkouts (copied out/ dirs are not expected, but be safe)
const sessKey = new Map(); for (const s of sessions) sessKey.set(`${s.topic}|${s.start}`, s);
const allSessions = [...sessKey.values()].filter((s) => s.start >= SINCE).sort((a, b) => a.start - b.start);
const abResults = [...results.values()].filter((r) => Date.parse(r.createdAt) >= SINCE);

const m = (r, metric, side) => r.metrics?.scroll?.[metric]?.[side]?.median ?? null;
const resultRows = abResults.map((r) => ({
  topic: r.topic, kind: r.kind, createdAt: r.createdAt, viewport: r.config?.viewport, runs: r.config?.runs,
  stackedOn: r.config?.stackedOn || null,
  loadMin: r.host?.loadavg1Min ?? null, loadMax: r.host?.loadavg1Max ?? null,
  clean: r.host?.loadavg1Max != null ? r.host.loadavg1Max <= CLEAN_LOAD : null,
  gt50: [m(r, 'gt50', 'baseline'), m(r, 'gt50', 'patched')], gt34: [m(r, 'gt34', 'baseline'), m(r, 'gt34', 'patched')],
  gt20: [m(r, 'gt20', 'baseline'), m(r, 'gt20', 'patched')], fps: [m(r, 'fps', 'baseline'), m(r, 'fps', 'patched')],
  verdicts: Object.fromEntries(Object.entries(r.metrics?.scroll || {}).map(([k, v]) => [k, v.verdict])),
})).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

// ---------------------------------------------------------------- iPhone scripted runs
const iphone = [];
for (const co of checkouts) for (const dir of ls(join(co, 'out')).filter((d) => d.startsWith('iphone'))) {
  for (const f of ls(join(co, 'out', dir)).filter((f) => f.endsWith('.json'))) {
    const j = readJson(join(co, 'out', dir, f));
    const s = j?.summary?.scroll; if (!s) continue;
    const label = String(j.meta?.label || f);
    const side = /base/i.test(label) || /base/i.test(f) ? 'base' : /fix|patch/i.test(label + f) ? 'patched' : 'other';
    const at = Date.parse(j.meta?.date || '') || statSync(join(co, 'out', dir, f)).mtimeMs;
    if (at < SINCE) continue;
    iphone.push({ owner: j.meta?.owner || basename(co), side, label, at, fps: s.fps, gt34: s.gt34, gt50: s.gt50, max: s.max, frames: s.frames });
  }
}
const iphoneBy = {};
for (const x of iphone) { const k = x.owner; (iphoneBy[k] ||= { base: [], patched: [], other: [] })[x.side].push(x); }
const iphoneRows = Object.entries(iphoneBy).map(([owner, v]) => ({
  owner, nBase: v.base.length, nPatched: v.patched.length,
  fps: [median(v.base.map((x) => x.fps)), median(v.patched.map((x) => x.fps))],
  gt34: [median(v.base.map((x) => x.gt34)), median(v.patched.map((x) => x.gt34))],
  gt50: [median(v.base.map((x) => x.gt50)), median(v.patched.map((x) => x.gt50))],
}));

// ---------------------------------------------------------------- A/A floor
let aa = null;
for (const r of [...results.values()].filter((r) => /A\/A/.test(r.kind || '')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
  if (r.config?.viewport === 'mobile') { aa = r; break; }
}
const aaRow = aa && { createdAt: aa.createdAt, load: [aa.host?.loadavg1Min, aa.host?.loadavg1Max], gt50: m(aa, 'gt50', 'baseline'), gt34: m(aa, 'gt34', 'baseline'), gt20: m(aa, 'gt20', 'baseline'), fps: m(aa, 'fps', 'baseline') };

// ---------------------------------------------------------------- goal progress
const mobileAB = resultRows.filter((r) => r.viewport === 'mobile' && r.kind === 'A/B');
const best = (key, i = 1) => mobileAB.filter((r) => r[key][i] != null).sort((a, b) => a[key][i] - b[key][i])[0] || null;
const bestClean = (key) => mobileAB.filter((r) => r.clean && r[key][1] != null).sort((a, b) => a[key][1] - b[key][1])[0] || null;
const combined = mobileAB.filter((r) => /^all-wave|combined|-all$/.test(r.topic) || r.stackedOn);
const iphonePatched = iphone.filter((x) => x.side === 'patched');
const goal = {
  target: { chromeGt50: 0, chromeGt34: '~0', iphoneFps: 60, iphoneGt50: 0 },
  aaFloor: aaRow,
  bestChromeGt50: best('gt50') && { topic: best('gt50').topic, value: best('gt50').gt50[1], baseline: best('gt50').gt50[0], clean: best('gt50').clean },
  bestChromeGt34: best('gt34') && { topic: best('gt34').topic, value: best('gt34').gt34[1], baseline: best('gt34').gt34[0], clean: best('gt34').clean },
  bestCleanGt34: bestClean('gt34') && { topic: bestClean('gt34').topic, value: bestClean('gt34').gt34[1] },
  // "moved" = the A/B verdict says the ranges are disjoint (not just a lower median)
  gt50BetterVerdicts: mobileAB.filter((r) => /^better/.test(r.verdicts.gt50 || '')).length,
  gt34BetterVerdicts: mobileAB.filter((r) => /^better/.test(r.verdicts.gt34 || '')).length,
  combinedMeasured: combined.length, combinedClean: combined.filter((r) => r.clean).length,
  iphoneBaseMedian: { fps: median(iphone.filter((x) => x.side === 'base').map((x) => x.fps)), gt34: median(iphone.filter((x) => x.side === 'base').map((x) => x.gt34)), gt50: median(iphone.filter((x) => x.side === 'base').map((x) => x.gt50)), n: iphone.filter((x) => x.side === 'base').length },
  iphoneBestPatched: iphonePatched.length ? (() => { const byOwner = iphoneRows.filter((r) => r.nPatched).sort((a, b) => (a.gt34[1] ?? 1e9) - (b.gt34[1] ?? 1e9))[0]; return byOwner && { owner: byOwner.owner, fps: byOwner.fps[1], gt34: byOwner.gt34[1], gt50: byOwner.gt50[1] }; })() : null,
};

// ---------------------------------------------------------------- lock: queue wait, utilization, clean share
const done = allSessions.filter((s) => s.completed && s.runs);
const perRun = done.map((s) => (s.end - s.start) / s.runs).filter((x) => x > 0);
const serviceMsPerRun = perRun.length ? Math.min(...perRun) : 60000;   // fastest observed = no wait
const waits = done.map((s) => Math.max(0, s.end - s.start - s.runs * serviceMsPerRun));
const firstStart = done.length ? Math.min(...done.map((s) => s.start)) : null;
const lastEnd = done.length ? Math.max(...done.map((s) => s.end)) : null;
const busyMs = done.reduce((a, s) => a + s.runs * serviceMsPerRun, 0);
const allRunLoads = done.flatMap((s) => s.loads);
const lockNow = (() => {
  const out = {};
  for (const res of ['chrome-measure', 'iphone']) {
    const h = readJson(join(STATE, 'locks', `${res}.json`));
    const q = readJson(join(STATE, 'locks', `${res}.queue.json`)) || [];
    out[res] = {
      holder: h?.owner || null, heldMin: h ? mins(NOW - Date.parse(h.acquiredAt)) : null, kind: h?.kind || null,
      queue: q.length, shortQueued: q.filter((x) => x.short).length,
      waitMin: { median: mins(median(q.map((x) => NOW - Date.parse(x.since)))), max: q.length ? mins(Math.max(...q.map((x) => NOW - Date.parse(x.since)))) : null },
    };
  }
  const audit = join(STATE, 'locks', 'audit.log');
  out.auditLines = existsSync(audit) ? readFileSync(audit, 'utf8').split('\n').filter(Boolean).length : 0;
  return out;
})();
const lock = {
  abSessions: allSessions.length, abCompleted: done.length, abAborted: allSessions.length - done.length,
  serviceMinPerRun: mins(serviceMsPerRun),
  waitMin: { median: mins(median(waits)), max: waits.length ? mins(Math.max(...waits)) : null },
  utilizationPct: firstStart ? pct(busyMs, lastEnd - firstStart) : null,
  windowH: firstStart ? r1((lastEnd - firstStart) / 3600000) : null,
  now: lockNow,
};
const clean = {
  runsClean: allRunLoads.filter((l) => l <= CLEAN_LOAD).length, runs: allRunLoads.length,
  runsCleanPct: pct(allRunLoads.filter((l) => l <= CLEAN_LOAD).length, allRunLoads.length),
  runsContaminated: allRunLoads.filter((l) => l > 10).length,
  resultsClean: resultRows.filter((r) => r.clean).length, results: resultRows.filter((r) => r.clean != null).length,
  medianRunLoad: r1(median(allRunLoads)),
  hostNow: await (async () => {
    const a = os.cpus(); await new Promise((r) => setTimeout(r, 2000)); const b = os.cpus();
    let busy = 0, tot = 0;
    b.forEach((c, i) => { const d = (k) => c.times[k] - a[i].times[k]; const t = d('user') + d('nice') + d('sys') + d('idle') + d('irq'); tot += t; busy += t - d('idle'); });
    return { load1: r1(os.loadavg()[0]), cpuBusyPct: pct(busy, tot) };
  })(),
};

// ---------------------------------------------------------------- incidents
const incidents = ls(join(STATE, 'incidents')).filter((f) => /^I-\d+\.json$/.test(f)).map((f) => readJson(join(STATE, 'incidents', f))).filter(Boolean)
  .filter((i) => Date.parse(i.openedAt) >= SINCE);
const mainLog = G(['log', '--format=%H%x09%cI%x09%aI%x09%s', 'main']).split('\n').filter(Boolean).map((l) => { const [sha, cI, aI, s] = l.split('\t'); return { sha, c: Date.parse(cI), a: Date.parse(aI), s }; });
const incRows = incidents.map((i) => {
  const hist = i.history || [];
  const res = [...hist].reverse().find((h) => h.action === 'resolved');
  const ready = hist.find((h) => /fix (\w{7,}|ready)/i.test(h.note || ''));
  const landed = mainLog.filter((c) => new RegExp(`\\b${i.id}\\b`).test(c.s) && /^tools|^tests|^cdp|^paths/.test(c.s)).sort((a, b) => a.c - b.c)[0];
  return {
    id: i.id, cls: i.class, status: i.status, resolution: i.resolution || res?.changes?.resolution || null, assignee: i.assignee || null,
    openedAt: i.openedAt, resolveMin: res ? mins(Date.parse(res.at) - Date.parse(i.openedAt)) : null,
    readyToResolveMin: res && ready ? mins(Date.parse(res.at) - Date.parse(ready.at)) : null,
    toolCommitOnMain: landed?.sha?.slice(0, 7) || null,
    staleInStore: i.status !== 'resolved' && !!landed,
    ageMin: i.status !== 'resolved' ? mins(NOW - Date.parse(i.openedAt)) : null,
  };
});
const inc = {
  opened: incRows.length, resolved: incRows.filter((i) => i.status === 'resolved').length,
  active: incRows.filter((i) => i.status !== 'resolved').length,
  fixed: incRows.filter((i) => i.resolution === 'fixed').length,
  duplicates: incRows.filter((i) => i.resolution === 'duplicate').length,
  resolveMin: { median: median(incRows.map((i) => i.resolveMin)), max: Math.max(0, ...incRows.map((i) => i.resolveMin || 0)) },
  readyToResolveMin: { median: median(incRows.map((i) => i.readyToResolveMin)) },
  staleInStore: incRows.filter((i) => i.staleInStore).map((i) => `${i.id} (${i.toolCommitOnMain})`),
  activeUnassigned: incRows.filter((i) => i.status !== 'resolved' && !i.assignee).map((i) => i.id),
  rows: incRows,
};

// ---------------------------------------------------------------- topics: landed, on branch, lead time
const topicsMd = G(['show', 'main:fixes/TOPICS.md']);
const topicNames = [...topicsMd.matchAll(/^\|\s*(N?\d+)\s*\|\s*`([a-z0-9-]+)`/gm)].map((x) => ({ id: x[1], name: x[2] }));
const landedDirs = new Set(G(['ls-tree', '-d', '--name-only', 'main', 'fixes/']).split('\n').map((p) => p.replace(/^fixes\//, '')));
const branchTopics = {};
for (const b of branches.filter((b) => b !== 'main')) {
  const ahead = Number(G(['rev-list', '--count', `main..${b}`]) || 0);
  if (!ahead) continue;
  for (const p of G(['diff', '--name-only', `main...${b}`, '--', 'fixes']).split('\n').filter(Boolean)) {
    const t = p.split('/')[1]; if (!t || /\.md$/.test(t)) continue;
    (branchTopics[t] ||= new Set()).add(b);
  }
}
// uncommitted work in a worktree counts as "in progress" too
const wtTopics = {};
for (const w of worktrees) for (const t of ls(join(w.path, 'fixes'))) if (existsSync(join(w.path, 'fixes', t, 'README.md')) && !landedDirs.has(t) && !['_template'].includes(t)) (wtTopics[t] ||= new Set()).add(w.branch);
const topicStatus = topicNames.map(({ id, name }) => {
  // topic dirs don't always carry the TOPICS.md name (nav-morph owns 3+6+13): match by name or prefix
  const matches = (set) => Object.keys(set).filter((t) => t === name || t.startsWith(name + '--') || name.startsWith(t + '-'));
  let status = 'not started';
  if (landedDirs.has(name)) status = 'landed';
  else if (matches(branchTopics).length || matches(wtTopics).length) status = 'in progress';
  // start = the topic's first A/B session (any checkout, name or name--variant), else its first commit
  const abStarts = sessions.filter((x) => x.topic === name || x.topic.startsWith(name + '--') || name.startsWith(x.topic + '-')).map((x) => x.start);
  const firstA = landedDirs.has(name) ? Math.min(...G(['log', '--format=%aI', 'main', '--', `fixes/${name}`]).split('\n').filter(Boolean).map(Date.parse)) : null;
  const start = abStarts.length ? Math.min(...abStarts, firstA ?? Infinity) : firstA;
  const landC = landedDirs.has(name) ? Math.max(...G(['log', '--format=%cI', 'main', '--', `fixes/${name}`]).split('\n').filter(Boolean).map(Date.parse)) : null;
  return { id, name, status, firstAB: abStarts.length ? new Date(Math.min(...abStarts)).toISOString() : null,
    leadTimeMin: start && landC ? mins(landC - start) : null, wipAgeMin: status === 'in progress' && abStarts.length ? mins(NOW - Math.min(...abStarts)) : null };
});
const fixDirsInFlight = [...new Set([...Object.keys(branchTopics), ...Object.keys(wtTopics)])].filter((t) => !landedDirs.has(t));

// ---------------------------------------------------------------- worktrees: waiting on the lead, cleanup debt
const wtRows = worktrees.filter((w) => w.path !== REPO).map((w) => {
  const b = w.branch || '';
  const ahead = b ? Number(G(['rev-list', '--count', `main..${b}`]) || 0) : 0;
  const behind = b ? Number(G(['rev-list', '--count', `${b}..main`]) || 0) : 0;
  const last = b ? Date.parse(G(['log', '-1', '--format=%cI', b])) : null;
  const dirty = git(['status', '--porcelain', '--untracked-files=normal'], w.path).split('\n').filter((l) => l && !/ out\/| fixes\/[^/]+\/overlay\//.test(l)).length;
  const subjects = ahead ? G(['log', '--format=%s', `main..${b}`]).split('\n') : [];
  return { branch: b, ahead, behind, dirty, lastCommitAgeMin: last ? mins(NOW - last) : null, kind: subjects.some((s) => /^tools|^tests/.test(s)) ? 'tool' : subjects.length ? 'deliverable' : 'none' };
});
const agents = {
  worktrees: wtRows.length,
  landedOrEmpty: wtRows.filter((w) => !w.ahead && !w.dirty).length,           // cleanup debt (or an idle agent)
  readyWaiting30: wtRows.filter((w) => w.ahead && !w.dirty && w.lastCommitAgeMin > 30).length, // committed, untouched > 30 min
  withCommitsAhead: wtRows.filter((w) => w.ahead).length,
  dirtyNoCommit: wtRows.filter((w) => !w.ahead && w.dirty).length,
  staleBehind20: wtRows.filter((w) => w.behind > 20).length,
  rows: wtRows,
};

// ---------------------------------------------------------------- experiments, benchmarks, findings, arch team
const expMd = G(['show', 'main:fixes/EXPERIMENTS.md']);
const expCells = expMd.split('\n').filter((l) => /^\|\s*[a-z0-9-]+\/\d+/.test(l)).map((l) => l.split('|').map((c) => c.trim()));
const expRows = expCells.length;  // columns: id, variant, hypothesis, result, validity, numbers, evidence, lesson, status, bench
let benchFiles = 0, variantDiffs = 0;
for (const co of checkouts) for (const t of ls(join(co, 'fixes'))) {
  if (existsSync(join(co, 'fixes', t, 'bench.json'))) benchFiles++;
  variantDiffs += ls(join(co, 'fixes', t, 'variants')).filter((f) => f.endsWith('.diff')).length;
}
const findings = ls(join(STATE, 'findings')).filter((f) => /^F-\d+\.json$/.test(f)).map((f) => readJson(join(STATE, 'findings', f))).filter(Boolean);
const archMd = G(['show', 'main:fixes/ARCH_TEAM.md']);
const scoreRows = archMd.split('\n').filter((l) => /^\|\s*\d+\s*\(/.test(l)).map((l) => l.split('|').map((c) => c.trim()));
const adoptedNum = scoreRows.reduce((a, c) => a + (Number.parseInt(c[5], 10) || 0), 0);
const knownRecs = ['nav-morph-all', 'anim-ablation', 'hero-track-io', 'transition-frames', 'frame-attribution', 'scene-gate-flap'];
const recStarted = knownRecs.filter((t) => fixDirsInFlight.includes(t) || landedDirs.has(t));
const exp = {
  ledgerRows: expRows, abResults: resultRows.length, abSessions: allSessions.length,
  ledgerClean: expCells.filter((c) => /^clean/.test(c[5] || '')).length,
  ledgerBenchPassing: expCells.filter((c) => /\b(PASS|passes|bench\.json#|experiments\[)/.test(c[10] || '') && !/pending/.test(c[10] || '')).length,
  ledgerDiffKept: expCells.filter((c) => /variants\/|patch\.diff/.test(c[10] || '')).length,
  benchFiles, variantDiffs, benchRunnerOnMain: !!G(['ls-tree', '--name-only', 'main', 'tools/bench.mjs']),
  findings: findings.length, findingsOpen: findings.filter((f) => f.status !== 'resolved').length,
  archScoreRows: scoreRows.length, archAdoptedNumeric: adoptedNum,
  archAdoptedPending: scoreRows.filter((c) => /pending/i.test(c[5] || '') || c[5] === '0').length,
  archRecsStarted: recStarted, archRecsKnown: knownRecs,
};

// ---------------------------------------------------------------- landing flow (main)
const mainSince = mainLog.filter((c) => c.c >= SINCE);
const landings = {
  commitsOnMain: mainSince.length,
  toolCommits: mainSince.filter((c) => /^tools|^tests|^cdp|^paths|^githooks/.test(c.s)).length,
  fixCommits: mainSince.filter((c) => /^fix\(|^fixes\/[a-z]/.test(c.s)).length,
  docCommits: mainSince.filter((c) => !/^tools|^tests|^cdp|^paths|^githooks|^fix\(|^fixes\/[a-z]|^research|^nav-bench/.test(c.s)).length,
  researchCommits: mainSince.filter((c) => /^research|^nav-bench/.test(c.s)).length,
  topicsLanded: topicStatus.filter((t) => t.status === 'landed').length, topics: topicStatus.length,
  topicsInProgress: topicStatus.filter((t) => t.status === 'in progress').length,
  leadTimeMin: topicStatus.filter((t) => t.leadTimeMin != null).map((t) => `${t.name}: ${t.leadTimeMin}`),
  wipAgeMin: { median: median(topicStatus.map((t) => t.wipAgeMin)), max: Math.max(0, ...topicStatus.map((t) => t.wipAgeMin || 0)) },
};

// ---------------------------------------------------------------- the user's process nudges (optional)
let user = null;
const tr = opt('transcript');
if (tr && existsSync(tr)) {
  // a queued prompt shows up twice (enqueue + delivery): same text within 5 min = one prompt; a repeated
  // /loop prompt later counts again
  const lastAt = new Map(); const ps = [];
  for (const line of readFileSync(tr, 'utf8').split('\n')) {
    if (!line) continue; let e; try { e = JSON.parse(line); } catch { continue; }
    let text = null; const at = Date.parse(e.timestamp);
    if (e.type === 'user' && !e.isMeta && typeof e.message?.content === 'string') text = e.message.content;
    else if (e.type === 'queue-operation' && e.operation === 'enqueue' && typeof e.content === 'string') text = e.content;
    if (!text || /^\s*</.test(text) || /^This session is being continued/.test(text) || !(at >= SINCE)) continue;
    const k = text.trim().slice(0, 200); const prev = lastAt.get(k); lastAt.set(k, at);
    if (prev != null && Math.abs(at - prev) < 300000) continue;
    ps.push({ at, text });
  }
  ps.sort((a, b) => a.at - b.at);
  const loop = /^(think about the improvement for team|check each agents)/i;
  const nudge = /\b(why|what're|what are|what's|are they|is it work|check|ping)\b|\?/i;
  const typed = ps.filter((p) => !loop.test(p.text));
  const hours = ps.length > 1 ? (ps[ps.length - 1].at - ps[0].at) / 3600000 : null;
  user = {
    prompts: ps.length, loopPrompts: ps.length - typed.length, typed: typed.length,
    processQuestions: typed.filter((p) => nudge.test(p.text) && /\b(agent|team|chrome|iphone|incident|commit|serena|doing|progress|measure|dirty|blocker|re-measure)/i.test(p.text)).length,
    windowH: r1(hours),
  };
  user.processQuestionsPerH = hours ? r1(user.processQuestions / hours) : null;
}

// ---------------------------------------------------------------- lead load: interruptions, decisions vs routine
// Incoming = everything delivered to the lead's session (queued or direct): user prompts, agent/teammate
// messages, task notifications. Classified by keywords only (heuristic; the text is never printed).
// Outgoing = the lead's own tool calls: decisions (spawns, landings, incident triage/resolve, lock repair)
// vs routine (relays by SendMessage, status checks).
let lead = null;
if (tr && existsSync(tr)) {
  const seen = new Map(); const incoming = []; const out = [];
  const DECIDE = /\b(BLOCKED|blocked|NEEDS-WORK|ACCEPT|REJECT|ready (to|for) (land|review)|please land|land (it|this)|needs? (a |your )?(decision|approval|permission)|decide|approve|question for the lead|which (one|option))\b|\?\s*$/m;
  const STATUS = /lock\.mjs (status|doctor)|incident\.mjs (list|show)|finding\.mjs list|\b(status|log|worktree list) --|\bgit (status|log|worktree)\b|\buptime\b|\bps\b|\btop -l/;
  for (const line of readFileSync(tr, 'utf8').split('\n')) {
    if (!line) continue; let e; try { e = JSON.parse(line); } catch { continue; }
    const at = Date.parse(e.timestamp); if (!(at >= SINCE)) continue;
    let text = null;
    if (e.type === 'queue-operation' && e.operation === 'enqueue' && typeof e.content === 'string') text = e.content;
    else if (e.type === 'user' && !e.isMeta && typeof e.message?.content === 'string') text = e.message.content;
    if (text) {
      const k = text.slice(0, 400); const prev = seen.get(k); seen.set(k, at);
      if (!(prev != null && at - prev < 300000) && !/^<(command|local-command|bash-)/.test(text) && !/^This session is being continued/.test(text)) {
        const kind = /^<task-notification>/.test(text) ? 'notification' : /^<agent-message/.test(text) ? 'agent' : /^<teammate-message/.test(text) ? 'teammate' : /^\[Request interrupted/.test(text) ? 'interrupt' : 'user';
        const interim = kind === 'notification' && /has not reported yet|may resume on its own|result below may be interim/.test(text);
        incoming.push({ at, kind, interim, decision: kind === 'user' || (!interim && DECIDE.test(text)) });
      }
    }
    if (e.type === 'assistant') for (const c of e.message?.content || []) {
      if (c.type !== 'tool_use') continue;
      const cmd = String(c.input?.command || '');
      const cat = c.name === 'Agent' ? 'spawn'
        : c.name === 'SendMessage' ? 'relay'
        : c.name === 'Bash' && /merge --ff-only/.test(cmd) ? 'land'
        : c.name === 'Bash' && /incident\.mjs (resolve|update|open)|lock\.mjs repair|finding\.mjs resolve/.test(cmd) ? 'triage'
        : c.name === 'Bash' && STATUS.test(cmd) ? 'status'
        : c.name === 'Bash' ? 'other-bash' : 'other';
      out.push({ at, cat });
    }
  }
  const all = [...incoming, ...out].sort((a, b) => a.at - b.at);
  const H = all.length > 1 ? (all[all.length - 1].at - all[0].at) / 3600000 : null;
  const per = (n) => (H ? r1(n / H) : null);
  const cnt = (a, f) => a.filter(f).length;
  let max10 = 0; const ts = incoming.map((x) => x.at).sort((a, b) => a - b);
  for (let i = 0, j = 0; i < ts.length; i++) { while (ts[i] - ts[j] > 600000) j++; max10 = Math.max(max10, i - j + 1); }
  const decisionsOut = cnt(out, (x) => ['spawn', 'land', 'triage'].includes(x.cat));
  const routineOut = cnt(out, (x) => ['relay', 'status'].includes(x.cat));
  lead = {
    windowH: r1(H),
    incoming: incoming.length, incomingPerH: per(incoming.length), max10min: max10,
    byKind: Object.fromEntries(['user', 'agent', 'teammate', 'notification', 'interrupt'].map((k) => [k, cnt(incoming, (x) => x.kind === k)])),
    interimNotifications: cnt(incoming, (x) => x.interim),
    incomingNeedingDecision: cnt(incoming, (x) => x.decision), incomingDecisionPct: pct(cnt(incoming, (x) => x.decision), incoming.length),
    outgoing: Object.fromEntries(['spawn', 'land', 'triage', 'relay', 'status', 'other-bash', 'other'].map((k) => [k, cnt(out, (x) => x.cat === k)])),
    decisionsOut, routineOut, decisionSharePct: pct(decisionsOut, decisionsOut + routineOut),
    relaysPerH: per(cnt(out, (x) => x.cat === 'relay')),
  };
}

// ---------------------------------------------------------------- output
const K = { lead, generatedAt: new Date(NOW).toISOString(), since: SINCE ? new Date(SINCE).toISOString() : null, repo: basename(REPO), goal, lock, clean, incidents: inc, landings, topics: topicStatus, fixDirsInFlight, agents, experiments: exp, user, resultRows, iphoneRows };
const prev = opt('compare') ? readJson(opt('compare')) : null;
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const fmt = (v) => (v == null ? '-' : Array.isArray(v) ? v.join(' / ') : typeof v === 'object' ? JSON.stringify(v) : String(v));

const table = [
  ['Goal', 'Chrome frames >50 ms, A/A floor (median, quiet host)', 'goal.aaFloor.gt50', 'target 0'],
  ['Goal', 'Chrome frames >34 ms, A/A floor', 'goal.aaFloor.gt34', 'target ~0'],
  ['Goal', 'best patched Chrome >50 ms (single topic)', 'goal.bestChromeGt50.value', 'any clean?'],
  ['Goal', 'best patched Chrome >34 ms (single topic)', 'goal.bestChromeGt34.value', ''],
  ['Goal', 'A/Bs with a disjoint "better" on frames >50 ms / >34 ms', null, 'the goal metrics; >20 ms and fps are proxies'],
  ['Goal', 'combined-overlay A/Bs measured / clean', 'goal.combinedMeasured', 'clean: goal.combinedClean'],
  ['Goal', 'iPhone baseline scroll fps / >34 / >50 (median)', 'goal.iphoneBaseMedian', 'target 60 / ~0 / 0'],
  ['Goal', 'iPhone best patched (single topic)', 'goal.iphoneBestPatched', ''],
  ['Flow', 'topics landed / total (TOPICS.md incl. N-list)', 'landings.topicsLanded', 'of landings.topics'],
  ['Flow', 'topics in progress (branch or worktree)', 'landings.topicsInProgress', ''],
  ['Flow', 'topic lead time, first A/B -> landed (min)', 'landings.leadTimeMin', ''],
  ['Flow', 'in-progress topics: age since first A/B, median / max (min)', 'landings.wipAgeMin', 'nothing counts until landed and combined'],
  ['Flow', 'commits on main: tool / fix / research / docs', null, ''],
  ['Lock', 'A/B sessions started / completed / not completed (queued, running or killed)', null, ''],
  ['Lock', 'queue wait per A/B, median / max (min, estimated)', 'lock.waitMin', ''],
  ['Lock', 'chrome-measure utilization over the A/B window (%, lower bound)', 'lock.utilizationPct', 'window h: lock.windowH'],
  ['Lock', 'queue now: length / short / max wait (min)', null, ''],
  ['Clean', 'runs started at load1 <= 6 (%)', 'clean.runsCleanPct', 'n = clean.runs'],
  ['Clean', 'runs started at load1 > 10 (contaminated)', 'clean.runsContaminated', ''],
  ['Clean', 'median load1 at run start', 'clean.medianRunLoad', ''],
  ['Clean', 'host now: load1 / CPU busy %', null, ''],
  ['Incidents', 'opened / resolved / active', null, ''],
  ['Incidents', 'time to resolve, median / max (min)', 'incidents.resolveMin', ''],
  ['Incidents', 'fix ready -> resolved, median (min)', 'incidents.readyToResolveMin.median', ''],
  ['Incidents', 'landed on main but not resolved in the store', 'incidents.staleInStore', ''],
  ['Arch', 'scorecard rows / rows with adopted 0 or pending', null, 'adoption by owners is the real metric'],
  ['Arch', 'measurement-review experiments started (E1, E3, E4, N9, N1)', 'experiments.archRecsStarted', ''],
  ['Learn', 'EXPERIMENTS.md rows / clean validity / diff kept / benchmark runnable', null, 'bench stays 0 until tools/bench.mjs lands'],
  ['Learn', 'bench.json files / variant diffs / runner on main', null, ''],
  ['Learn', 'findings on the board / open', null, ''],
  ['Agents', 'worktrees / landed-or-empty (cleanup debt) / committed & untouched >30 min / >20 commits behind main', null, ''],
  ['User', 'user prompts / loop prompts / process questions per hour', null, ''],
  ['Lead', 'messages the lead handled per hour (all incoming) / max in any 10 min', null, 'lower is better: mgmt-ops absorbs routine'],
  ['Lead', 'incoming: agent+teammate / notifications (of which interim noise) / user / interrupts', null, ''],
  ['Lead', 'incoming that needed a lead decision (%)', 'lead.incomingDecisionPct', 'keyword heuristic'],
  ['Lead', 'lead actions: decisions (spawn+land+triage) / routine (relay+status) / decision share %', null, 'higher share is better'],
  ['Lead', 'relays (SendMessage) per hour', 'lead.relaysPerH', ''],
];
const special = {
  'A/Bs with a disjoint "better" on frames >50 ms / >34 ms': () => [goal.gt50BetterVerdicts, goal.gt34BetterVerdicts],
  'commits on main: tool / fix / research / docs': () => [landings.toolCommits, landings.fixCommits, landings.researchCommits, landings.docCommits],
  'A/B sessions started / completed / not completed (queued, running or killed)': () => [lock.abSessions, lock.abCompleted, lock.abAborted],
  'queue now: length / short / max wait (min)': () => [lock.now['chrome-measure'].queue, lock.now['chrome-measure'].shortQueued, lock.now['chrome-measure'].waitMin.max],
  'host now: load1 / CPU busy %': () => [clean.hostNow.load1, clean.hostNow.cpuBusyPct],
  'opened / resolved / active': () => [inc.opened, inc.resolved, inc.active],
  'scorecard rows / rows with adopted 0 or pending': () => [exp.archScoreRows, exp.archAdoptedPending],
  'EXPERIMENTS.md rows / clean validity / diff kept / benchmark runnable': () => [exp.ledgerRows, exp.ledgerClean, exp.ledgerDiffKept, exp.ledgerBenchPassing],
  'bench.json files / variant diffs / runner on main': () => [exp.benchFiles, exp.variantDiffs, exp.benchRunnerOnMain],
  'findings on the board / open': () => [exp.findings, exp.findingsOpen],
  'worktrees / landed-or-empty (cleanup debt) / committed & untouched >30 min / >20 commits behind main': () => [agents.worktrees, agents.landedOrEmpty, agents.readyWaiting30, agents.staleBehind20],
  'messages the lead handled per hour (all incoming) / max in any 10 min': () => (lead ? [lead.incomingPerH, lead.max10min] : ['(pass --transcript)']),
  'incoming: agent+teammate / notifications (of which interim noise) / user / interrupts': () => (lead ? [lead.byKind.agent + lead.byKind.teammate, `${lead.byKind.notification} (${lead.interimNotifications})`, lead.byKind.user, lead.byKind.interrupt] : ['-']),
  'lead actions: decisions (spawn+land+triage) / routine (relay+status) / decision share %': () => (lead ? [lead.decisionsOut, lead.routineOut, lead.decisionSharePct] : ['-']),
  'user prompts / loop prompts / process questions per hour': () => (user ? [user.prompts, user.loopPrompts, user.processQuestionsPerH] : ['(pass --transcript)']),
};
K.table = {};
for (const [, label, path] of table) K.table[label] = special[label] ? special[label]() : get(K, path);
const lines = [];
lines.push(`# KPI report ${K.generatedAt}${K.since ? ` (since ${K.since})` : ''}`, '');
lines.push(`| area | KPI | now | ${prev ? `baseline (${prev.generatedAt.slice(0, 16)}Z) | ` : ''}note |`, `|---|---|---|${prev ? '---|' : ''}---|`);
for (const [area, label, , note] of table) {
  const noteTxt = note.replace(/([a-z]+\.[a-zA-Z.]+)/g, (s) => (get(K, s) !== undefined ? fmt(get(K, s)) : s));
  lines.push(`| ${area} | ${label} | ${fmt(K.table[label])} | ${prev ? fmt(prev.table?.[label]) + ' | ' : ''}${noteTxt} |`);
}
lines.push('', '## Chrome A/B results (mobile unless noted), medians baseline -> patched', '',
  '| topic | created (UTC) | vp | n | load1 | clean | >50 ms | >34 ms | >20 ms | fps |', '|---|---|---|---|---|---|---|---|---|---|');
for (const r of resultRows) lines.push(`| ${r.topic}${r.stackedOn ? ` (on ${r.stackedOn})` : ''} | ${r.createdAt.slice(11, 16)} | ${r.viewport} | ${r.runs} | ${r.loadMin}-${r.loadMax} | ${r.clean ? 'yes' : 'no'} | ${r.gt50.join(' -> ')} | ${r.gt34.join(' -> ')} | ${r.gt20.join(' -> ')} | ${r.fps.join(' -> ')} |`);
lines.push('', '## iPhone scripted scroll (scroll phase), medians base / patched', '', '| owner | n base / patched | fps | >34 ms | >50 ms |', '|---|---|---|---|---|');
for (const r of iphoneRows) lines.push(`| ${r.owner} | ${r.nBase} / ${r.nPatched} | ${r.fps.join(' / ')} | ${r.gt34.join(' / ')} | ${r.gt50.join(' / ')} |`);
lines.push('', '## Topics', '', '| # | topic | status | first A/B (UTC) | lead time / WIP age (min) |', '|---|---|---|---|---|');
for (const t of topicStatus) lines.push(`| ${t.id} | ${t.name} | ${t.status} | ${t.firstAB ? t.firstAB.slice(11, 16) : '-'} | ${t.leadTimeMin ?? (t.wipAgeMin != null ? `WIP ${t.wipAgeMin}` : '-')} |`);
lines.push('', `Fix dirs in flight (branches/worktrees, not on main): ${fixDirsInFlight.join(', ') || '-'}`);
lines.push('', '## Incidents', '', '| id | class | status | assignee | resolve (min) | ready->resolved (min) | tool commit on main | stale |', '|---|---|---|---|---|---|---|---|');
for (const i of incRows.sort((a, b) => a.id.localeCompare(b.id))) lines.push(`| ${i.id} | ${i.cls} | ${i.status}${i.resolution ? ` (${i.resolution})` : ''} | ${i.assignee || '-'} | ${i.resolveMin ?? (i.ageMin != null ? `open ${i.ageMin}` : '-')} | ${i.readyToResolveMin ?? '-'} | ${i.toolCommitOnMain || '-'} | ${i.staleInStore ? 'YES' : ''} |`);
lines.push('', '## Worktrees', '', '| branch | ahead | behind | dirty files | last commit age (min) | kind |', '|---|---|---|---|---|---|');
for (const w of wtRows) lines.push(`| ${w.branch} | ${w.ahead} | ${w.behind} | ${w.dirty} | ${w.lastCommitAgeMin} | ${w.kind} |`);
console.log(lines.join('\n'));

const out = opt('json');
if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(out, JSON.stringify(K, null, 1) + '\n'); console.error(`wrote ${out}`); }
