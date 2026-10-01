#!/usr/bin/env node
// Per-fix workflow on top of the shared, read-only mirror baseline. Run it from a git worktree.
//
//   node tools/fix.mjs doctor                         # where is the baseline, which port, lock status
//   node tools/fix.mjs list                           # fixes/* with overlay / patch / results state
//   node tools/fix.mjs new <topic>                    # fixes/<topic>/{README.md, overlay/}
//   node tools/fix.mjs grep <regex> [file...]         # search the baseline (default: first-party JS/CSS + index.html)
//   node tools/fix.mjs show <file> [--lines 2660-2700]  # print a baseline file with line numbers
//   node tools/fix.mjs edit <topic> <file...>         # copy baseline file(s) into the overlay, then edit those copies
//   node tools/fix.mjs diff <topic>                   # write fixes/<topic>/patch.diff (overlay vs baseline)
//   node tools/fix.mjs apply <topic> [--from a,b] [--reset] [--check]   # rebuild the overlay from patch.diff(s)
//   node tools/fix.mjs combine <name> <topicA> <topicB>...  # apply several patches in order, report conflicts
//   node tools/fix.mjs serve <topic> [-- serve.mjs args]  # baseline + overlay on a per-worktree port
//   node tools/fix.mjs ab <topic> [--runs 5] [--cpu 6] [--viewport mobile] [--idle 6] [--no-screens] [-- serve.mjs args]
//   node tools/fix.mjs ab --aa [--runs 5]             # baseline vs baseline: the noise floor
//   ab per-frame attribution (I-018), all opt-in: [--cdp-metrics] per-phase CDP script/style/layout deltas; [--trace-frames]
//                  (perturbs timing) attributes frames >20 ms, writes results-trace.json, never results.json; [--frame-log] (E5)
//                  keeps [t, dt, scrollY] for tools/frames.mjs
//   ab host guard (I-017): [--max-wait 60] [--max-load 6] [--max-busy 25] [--watchdog 300] [--chrome-warm 10] go to verify.mjs (recheck before
//                  each run); a run started at load1 > 10, other CPU > 25 %, memory pressure >= warn or
//                  after a gate-timeout grant contaminates the result: verdicts get "CONTAMINATED (host): "
//   --on <other>   (edit, diff, serve, ab) stack this fix on another fix's overlay, e.g. a combined wave:
//                  edit copies from <other>'s overlay, diff is against it, ab compares <other> vs <other>+this
//
// <file> is a URL path such as /_app/immutable/nodes/2.DyWL8TcE.js (a site-pretty/ prefix is fine).
// Baseline = site-pretty/ (Prettier-formatted mirror) from the main checkout; FW_BASE=site switches
// to the byte-identical minified tree. Both are the snapshot committed on main and pinned by
// baseline.json: every command that reads the baseline refuses (exit 3, BASELINE-MODIFIED/-MISMATCH)
// unless it is that snapshot, unchanged; `new` makes the worktree sparse (no own copy; tools/baseline.mjs),
// `ab` records the snapshot id in results.json config.baselineSnapshot; when it measured another baseline
// (FW_BASELINE_ALLOW_MODIFIED=1) or the baseline changed during the A/B (verify.mjs re-checks it after
// every run; ab once more at the end), every verdict gets "BASELINE-<STATE>: " (config.baselineSnapshot.tag,
// .flaggedRuns), like "CONTAMINATED (host): ". The overlay holds full copies of Fastwork files, so it is
// gitignored; only patch.diff, README.md and results.json of a fix are meant to be committed, and
// only to local branches (never pushed). Writing commands refuse to run in the main checkout unless
// --allow-main is given, so a teammate that forgot to enter its worktree can't mix fixes there.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { resolve, join, dirname, relative, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import https from 'node:https';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { REPO, mirrorHome, resolveTree, isLinkedWorktree, gitCommonDir, sharedStateDir, autoPortBase, checkoutId, sha256File } from './lib/paths.mjs';
import { allStatus } from './lib/lock.mjs';
import { stats } from './lib/ab-stats.mjs';
import { requireBaseline, baselineStatus, baselineMeta, baselineTag, isSparse } from './lib/baseline.mjs';

const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const own = dd >= 0 ? argv.slice(0, dd) : argv;
const passthrough = dd >= 0 ? argv.slice(dd + 1) : null;
const VALUED = ['--runs', '--cpu', '--viewport', '--idle', '--lines', '--from', '--max', '--on', '--max-wait', '--max-load', '--max-busy', '--watchdog', '--chrome-warm'];
// passed through to verify.mjs by ab (I-018), all opt-in: --trace-frames (perturbs timing), --frame-log (E5), --cdp-metrics
const AB_FLAGS = ['trace-frames', 'frame-log', 'cdp-metrics'];
const opt = (n, d) => { const i = own.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = own[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : own[i + 1]; };
const flag = (n) => own.includes(`--${n}`);
const pos = own.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(own[i - 1])));
const [cmd, ...args] = pos;

const BASE_NAME = process.env.FW_BASE || 'site-pretty';
const BASE = resolveTree(BASE_NAME);
// Same "lags like live" setting the main session uses (README "Verification"); override after `--`.
const DEFAULT_SERVE = ['--vendors=local', '--https', '--latency', '150'];
const FIXES = join(REPO, 'fixes');
const topicDir = (t) => join(FIXES, t);
const overlayDir = (t) => join(FIXES, t, 'overlay');
const ON = opt('on') || null; // stack on another fix's overlay
if (ON && !existsSync(overlayDir(ON))) { console.error(`--on ${ON}: fixes/${ON}/overlay does not exist (build it with: node tools/fix.mjs apply ${ON} or combine)`); process.exit(2); }
/** The file this fix is diffed against: <on>'s overlay copy if stacked and present, else the baseline. */
const underlying = (rel) => (ON && existsSync(join(overlayDir(ON), rel)) ? join(overlayDir(ON), rel) : join(BASE, rel));

function die(msg, code = 2) { console.error(msg); process.exit(code); }
function checkTopic(t) { if (!t || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(t)) die(`topic must be kebab-case, e.g. countdown-idle-raf (got "${t ?? ''}")`); return t; }
function requireWorktree(what) {
  if (isLinkedWorktree() || flag('allow-main') || process.env.FW_ALLOW_MAIN === '1') return;
  die(`refusing to ${what} in the main checkout (${REPO}).\nFix agents work in their own git worktree (EnterWorktree, isolation: "worktree", or git worktree add). Pass --allow-main if you really mean the main checkout.`);
}
let BASELINE = null; // status of the committed snapshot (tools/lib/baseline.mjs), checked once per run
function requireBase() {
  if (!existsSync(BASE)) die(`baseline ${BASE} not found. It is the snapshot committed on main: node tools/baseline.mjs status (or set FW_MIRROR_HOME).`, 1);
  BASELINE ??= requireBaseline('fix.mjs'); // BASELINE-MODIFIED / -MISMATCH / ...: exit 3 with the fix
}
/** Normalise a user path to a baseline-relative POSIX path ("_app/immutable/nodes/2.DyWL8TcE.js"). */
function relPath(p) {
  let x = String(p).replace(/\\/g, '/');
  if (x.startsWith(BASE + '/')) x = x.slice(BASE.length + 1);
  x = x.replace(/^(\.\/)?(site-pretty|site)\//, '').replace(/^\/+/, '');
  if (!x || x.split('/').includes('..')) die(`bad path ${p}`);
  return x;
}
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else if (e.name !== '.DS_Store') out.push(f);
  }
  return out;
}
const overlayFiles = (t) => walk(overlayDir(t)).map((f) => relative(overlayDir(t), f).split(sep).join('/')).sort();
function git(...a) { const r = spawnSync('git', a, { cwd: REPO, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; }

// ---- commands --------------------------------------------------------------------------------------
function doctor() {
  const home = mirrorHome();
  const bs = baselineStatus();
  const lines = [
    ['checkout', REPO],
    ['linked worktree', isLinkedWorktree() ? 'yes' : 'no (main checkout)'],
    ['branch', git('rev-parse', '--abbrev-ref', 'HEAD')],
    ['git common dir', gitCommonDir()],
    ['mirror home', home + (process.env.FW_MIRROR_HOME ? ' (FW_MIRROR_HOME)' : '')],
    ['baseline', `${BASE} ${existsSync(BASE) ? 'OK' : 'MISSING'}`],
    ['byte-identical mirror', `${resolveTree('site')} ${existsSync(join(resolveTree('site'), '.mirror/manifest.json')) ? 'OK' : 'MISSING'}`],
    ['baseline snapshot', `${bs.snapshot ?? '(none)'} ${bs.state}`],
    ['worktree copy of snapshot', !isLinkedWorktree() ? '(main checkout)' : isSparse() ? 'no (sparse checkout)' : existsSync(join(REPO, 'site')) ? 'yes (own copy; node tools/baseline.mjs sparse drops it)' : 'no'],
    ['serve --port auto starts at', autoPortBase()],
    ['lock dir', join(sharedStateDir(), 'locks')],
  ];
  for (const [k, v] of lines) console.log(`${k.padEnd(28)} ${v}`);
  if (!bs.ok) console.log(bs.message);
  console.log('locks:');
  for (const s of allStatus()) console.log(`  ${s.resource.padEnd(15)} ${s.holder ? (s.stale ? 'stale ' : '') + 'held by ' + s.holder.owner : 'free'}${s.queue.length ? ` (${s.queue.length} queued)` : ''}`);
  const fixes = existsSync(FIXES) ? readdirSync(FIXES).filter((d) => existsSync(join(FIXES, d, 'overlay'))) : [];
  console.log(`fixes with an overlay here: ${fixes.join(', ') || '(none)'}`);
}

function list() {
  if (!existsSync(FIXES)) return console.log('(no fixes/)');
  for (const d of readdirSync(FIXES).sort()) {
    const dir = join(FIXES, d);
    if (!statSync(dir).isDirectory() || d.startsWith('_')) continue;
    const o = overlayFiles(d).length, p = existsSync(join(dir, 'patch.diff')), r = existsSync(join(dir, 'results.json'));
    console.log(`${d.padEnd(34)} overlay ${String(o).padStart(2)} files  patch.diff ${p ? 'yes' : 'no '}  results.json ${r ? 'yes' : 'no'}`);
  }
}

function cmdNew(t) {
  checkTopic(t); requireWorktree('create a fix');
  mkdirSync(overlayDir(t), { recursive: true });
  const readme = join(topicDir(t), 'README.md');
  if (!existsSync(readme)) {
    const tpl = readFileSync(join(FIXES, '_template', 'README.md'), 'utf8').replaceAll('<topic>', t);
    writeFileSync(readme, tpl);
  }
  // agent worktrees leave the committed snapshot out of their checkout and read the main checkout's
  // (tools/baseline.mjs sparse; it keeps an own copy when the main checkout doesn't hold this pin unchanged)
  if (isLinkedWorktree() && !process.env.FW_MIRROR_HOME && !isSparse()) {
    const r = spawnSync(process.execPath, [join(REPO, 'tools', 'baseline.mjs'), 'sparse'], { cwd: REPO, encoding: 'utf8' });
    process.stdout.write(r.stdout || ''); process.stdout.write(r.stderr || '');
  }
  console.log(`fixes/${t}/ ready. Next: node tools/fix.mjs edit ${t} <file>   (baseline: ${resolveTree(BASE_NAME)})`);
}

function cmdEdit(t, files) {
  checkTopic(t); requireWorktree('edit an overlay'); requireBase();
  if (!files.length) die('usage: node tools/fix.mjs edit <topic> <file...>');
  for (const f of files) {
    const rel = relPath(f);
    const src = underlying(rel), dst = join(overlayDir(t), rel);
    if (!existsSync(src)) die(`not in baseline: ${rel}`);
    if (existsSync(dst) && !flag('force')) { console.log(`already in overlay (edit it): ${dst}`); continue; }
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    console.log(`copied -> ${dst}`);
  }
}

function cmdShow(file) {
  requireBase();
  const rel = relPath(file);
  const f = join(BASE, rel);
  if (!existsSync(f)) die(`not in baseline: ${rel}`);
  const lines = readFileSync(f, 'utf8').split('\n');
  const [a, b] = String(opt('lines', `1-${Math.min(lines.length, 200)}`)).split('-').map(Number);
  for (let i = Math.max(1, a); i <= Math.min(lines.length, b || a); i++) console.log(`${String(i).padStart(6)}  ${lines[i - 1]}`);
}

function cmdGrep(pattern, files) {
  requireBase();
  if (!pattern) die('usage: node tools/fix.mjs grep <regex> [file...]');
  const ci = flag('i') || files.includes('-i'); // `-i` like grep (it is not a --flag, so it lands in files)
  files = files.filter((f) => f !== '-i');
  const re = new RegExp(pattern, ci ? 'i' : '');
  const targets = files.length ? files.map((f) => join(BASE, relPath(f))) : [...walk(join(BASE, '_app')).filter((f) => /\.(js|css)$/.test(f)), join(BASE, 'index.html')];
  for (const f of targets) if (!existsSync(f)) die(`not in baseline: ${relative(BASE, f)}`);
  const max = Number(opt('max', 200));
  let n = 0;
  for (const f of targets) {
    const lines = readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < lines.length && n < max; i++) if (re.test(lines[i])) { n++; console.log(`${relative(BASE, f)}:${i + 1}: ${lines[i].trim().slice(0, 220)}`); }
  }
  if (n >= max) console.log(`... stopped at --max ${max}`);
}

/** Unified diff of every overlay file against the baseline -> fixes/<topic>/patch.diff. */
function cmdDiff(t, { quiet = false } = {}) {
  checkTopic(t); requireBase();
  const files = overlayFiles(t);
  if (!files.length) die(`fixes/${t}/overlay is empty — copy files in with: node tools/fix.mjs edit ${t} <file>`);
  const header = [
    `# fastwork mirror fix: ${t}`,
    `# baseline: ${BASE_NAME}/ (${BASE_NAME === 'site-pretty' ? 'Prettier-formatted copy of the production mirror' : 'byte-identical production mirror'}); paths are URL paths`,
    ...(ON ? [`# STACKED on fixes/${ON}/overlay: apply ${ON} first, then this patch on top of it`] : []),
    `# rebuild the overlay with: node tools/fix.mjs apply ${t}${ON ? ` --on ${ON}` : ''}`,
    `# contains excerpts of Fastwork's code: local branches only, never push`,
  ];
  const parts = [];
  let add = 0, del = 0;
  const same = [];
  for (const rel of files) {
    const b = underlying(rel), o = join(overlayDir(t), rel);
    const exists = existsSync(b);
    header.push(`# base-sha256 ${rel} ${exists ? sha256File(b) : '(new file)'}`);
    const r = spawnSync('diff', ['-u', '--label', exists ? `a/${rel}` : '/dev/null', '--label', `b/${rel}`, exists ? b : '/dev/null', o], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (r.status === 0) { same.push(rel); continue; }
    if (r.status !== 1) die(`diff failed for ${rel}: ${r.stderr}`);
    const body = r.stdout;
    for (const l of body.split('\n')) { if (l.startsWith('+') && !l.startsWith('+++')) add++; else if (l.startsWith('-') && !l.startsWith('---')) del++; }
    parts.push(`diff --git a/${rel} b/${rel}\n${exists ? '' : 'new file mode 100644\n'}${body}`);
  }
  const out = join(topicDir(t), 'patch.diff');
  if (!parts.length) die(`overlay files are identical to the baseline: ${same.join(', ')}`);
  writeFileSync(out, header.join('\n') + '\n' + parts.join(''));
  if (!quiet) {
    console.log(`wrote ${relative(REPO, out)}: ${parts.length} file(s), +${add} -${del} lines`);
    if (same.length) console.log(`note: unchanged overlay copies (delete them to keep the overlay minimal): ${same.join(', ')}`);
  }
  return { file: out, files: parts.length, add, del };
}

function patchFiles(patch) {
  return [...readFileSync(patch, 'utf8').matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1].trim());
}
function resolvePatch(x) {
  if (existsSync(x) && statSync(x).isFile()) return resolve(x);
  const p = join(topicDir(x), 'patch.diff');
  if (!existsSync(p)) die(`no patch for "${x}" (looked for ${relative(REPO, p)})`);
  return p;
}
/** Apply one patch into an overlay dir. Returns {ok, output}. */
function applyPatch(patch, ovl, { check = false } = {}) {
  requireBase();
  for (const rel of patchFiles(patch)) {
    const dst = join(ovl, rel), src = underlying(rel);
    if (!existsSync(dst) && existsSync(src)) { mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst); }
  }
  const dir = relative(REPO, ovl).split(sep).join('/');
  const r = spawnSync('git', ['apply', '--whitespace=nowarn', `--directory=${dir}`, ...(check ? ['--check'] : []), patch], { cwd: REPO, encoding: 'utf8' });
  return { ok: r.status === 0, output: (r.stdout + r.stderr).trim() };
}

function cmdApply(t) {
  checkTopic(t); requireWorktree('write an overlay');
  const sources = (opt('from') ? opt('from').split(',') : [t]).map(resolvePatch);
  const ovl = overlayDir(t);
  if (flag('reset') && !flag('check')) rmSync(ovl, { recursive: true, force: true });
  if (overlayFiles(t).length && !flag('reset') && !flag('check') && sources.some((s) => s === join(topicDir(t), 'patch.diff'))) die(`fixes/${t}/overlay is not empty; add --reset to rebuild it from the patch`);
  mkdirSync(ovl, { recursive: true });
  let bad = 0;
  for (const p of sources) {
    const r = applyPatch(p, ovl, { check: flag('check') });
    console.log(`${r.ok ? 'OK      ' : 'CONFLICT'} ${relative(REPO, p)}${r.output ? '\n  ' + r.output.replace(/\n/g, '\n  ') : ''}`);
    if (!r.ok) bad++;
  }
  process.exitCode = bad ? 1 : 0;
}

function cmdCombine(name, topics) {
  checkTopic(name); requireWorktree('combine fixes');
  if (topics.length < 2) die('usage: node tools/fix.mjs combine <name> <topicA> <topicB> ...');
  const ovl = overlayDir(name);
  rmSync(ovl, { recursive: true, force: true });
  mkdirSync(ovl, { recursive: true });
  const report = [];
  for (const t of topics) {
    const p = resolvePatch(t);
    const chk = applyPatch(p, ovl, { check: true });
    if (!chk.ok) { report.push({ topic: t, ok: false, files: patchFiles(p), error: chk.output }); continue; }
    const r = applyPatch(p, ovl);
    report.push({ topic: t, ok: r.ok, files: patchFiles(p), error: r.ok ? undefined : r.output });
  }
  for (const r of report) console.log(`${r.ok ? 'applied ' : 'CONFLICT'} ${r.topic.padEnd(32)} ${r.files.join(', ')}${r.error ? '\n  ' + r.error.replace(/\n/g, '\n  ') : ''}`);
  const bad = report.filter((r) => !r.ok);
  console.log(bad.length ? `\n${bad.length} patch(es) did not apply on top of the earlier ones; resolve by hand in fixes/${name}/overlay` : `\nall ${topics.length} patches applied; measure with: node tools/fix.mjs ab ${name}`);
  process.exitCode = bad.length ? 1 : 0;
}

function serveArgs() { return passthrough && passthrough.length ? passthrough : DEFAULT_SERVE; }

function cmdServe(t) {
  checkTopic(t); requireBase();
  if (!existsSync(overlayDir(t))) die(`no fixes/${t}/overlay (run: node tools/fix.mjs new ${t})`);
  const a = [join(REPO, 'tools', 'serve.mjs'), '--root', BASE, '--overlay', [overlayDir(t), ...(ON ? [overlayDir(ON)] : [])].join(','), '--port', flag('port0') ? '0' : 'auto', '--state', join(REPO, 'out', `serve-${t}.json`), ...serveArgs()];
  console.log(`node ${a.map((x) => (x.startsWith(REPO + '/') ? relative(REPO, x) : x)).join(' ')}`);
  const c = spawn(process.execPath, a, { stdio: 'inherit' });
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => c.kill(s));
  c.on('exit', (code) => process.exit(code ?? 0));
}

// ---- A/B measurement --------------------------------------------------------------------------------
function get(url) {
  return new Promise((res, rej) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { rejectUnauthorized: false, headers: { 'accept-encoding': 'identity' } }, (r) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', rej);
    req.setTimeout(20000, () => req.destroy(new Error('timeout ' + url)));
  });
}
async function startServer(label, stateFile, extra) {
  rmSync(stateFile, { force: true });
  const a = [join(REPO, 'tools', 'serve.mjs'), '--root', BASE, ...extra, '--port', '0', '--quiet', '--state', stateFile, ...serveArgs()];
  const proc = spawn(process.execPath, a, { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 200; i++) {
    if (existsSync(stateFile)) { try { const s = JSON.parse(readFileSync(stateFile, 'utf8')); return { proc, ...s }; } catch {} }
    if (proc.exitCode !== null) die(`${label} server exited (${proc.exitCode})`, 1);
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill(); die(`${label} server did not start`, 1);
}
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const METRICS = {
  scroll: [['fps', 'fps', +1], ['gt20', 'frames >20 ms', -1], ['gt34', 'frames >34 ms', -1], ['gt50', 'frames >50 ms', -1], ['gt100', 'frames >100 ms', -1], ['max', 'worst frame ms', -1], ['p95', 'p95 frame ms', -1], ['loafMs', 'LoAF ms', -1], ['loafScriptMs', 'LoAF script ms', -1], ['forcedLayoutMs', 'forced style+layout ms (in LoAF)', -1]],
  morph: [['fps', 'fps', +1], ['gt50', 'frames >50 ms', -1], ['loafMs', 'LoAF ms', -1], ['forcedLayoutMs', 'forced style+layout ms (in LoAF)', -1]],
  // verify.mjs --trace-frames (I-018): main-thread time inside the scroll phase's frames > 20 ms, by kind
  trace: [['frames', 'frames >20 ms (traced)', -1], ['scriptMs', 'script ms in them', -1], ['styleMs', 'style ms in them', -1], ['layoutMs', 'layout ms in them', -1], ['paintMs', 'paint ms in them', -1], ['otherMs', 'other main-thread ms in them', -1], ['offMainMs', 'other (compositor/raster/GPU/vsync; GPU not separated) ms in them', -1], ['gt34', 'frames >34 ms (traced)', -1], ['gt50', 'frames >50 ms (traced)', -1], ['styleElements', 'elements style-recalculated in them', -1]],
};
// CDP Performance.getMetrics deltas per phase (verify.mjs --cdp-metrics, I-018; absent by default)
const CDP_METRICS = [['cdpScriptMs', 'script ms (CDP)', -1], ['cdpStyleMs', 'style recalc ms (CDP)', -1], ['cdpLayoutMs', 'layout ms (CDP)', -1], ['cdpStyleCount', 'style recalcs (CDP)', -1], ['cdpLayoutCount', 'layouts (CDP)', -1], ['cdpTaskMs', 'main-thread task ms (CDP)', -1]];
METRICS.scroll.push(...CDP_METRICS);
METRICS.morph.push(...CDP_METRICS);
// idle phase (verify.mjs --idle, before scrolling): the same metrics as the scroll phase
METRICS.idle = METRICS.scroll;
/** Host state of an A/B from verify's per-run records (tools/lib/host.mjs classifyRun). */
function hostSummary(v) {
  const rs = v.results.filter((r) => !r.diff);
  const loads = rs.filter((r) => r.loadavg1).flatMap((r) => [r.loadavg1.before, r.loadavg1.after]).filter((x) => x != null);
  const withHost = rs.filter((r) => r.host);
  const invalid = withHost.filter((r) => r.host.loadInvalid), warn = withHost.filter((r) => !r.host.loadInvalid && r.host.loadWarn);
  const other = withHost.map((r) => r.host.phases?.scroll?.otherBusyPct).filter((x) => x != null);
  return {
    ...v.host,
    loadavg1Min: loads.length ? r1(Math.min(...loads)) : null, loadavg1Max: loads.length ? r1(Math.max(...loads)) : null,
    otherCpuPctMax: other.length ? Math.max(...other) : null,
    recorded: withHost.length === rs.length, // false: verify.mjs from before I-017, no host record
    contaminated: invalid.length > 0, contaminatedRuns: invalid.length, runsTotal: rs.length,
    invalidRuns: invalid.map((r) => ({ label: r.label, run: r.run, reasons: r.host.reasons })),
    warnRuns: warn.map((r) => ({ label: r.label, run: r.run, warnings: r.host.warnings })),
  };
}
const CONTAMINATED = 'CONTAMINATED (host): ';
function hostLine(h) {
  const range = `load1 ${h.loadavg1Min}-${h.loadavg1Max}, other CPU max ${h.otherCpuPctMax ?? '?'} %`;
  const why = (xs, k) => [...new Set(xs.flatMap((x) => x[k]))].join('; ');
  if (!h.recorded) return `host: not recorded (verify.mjs without the I-017 host record); ${range}`;
  let s = h.contaminated ? `**host: ${h.contaminatedRuns} of ${h.runsTotal} runs contaminated (${why(h.invalidRuns, 'reasons')}); verdicts provisional** (${range})` : `host: 0 of ${h.runsTotal} runs contaminated (${range})`;
  if (h.warnRuns.length) s += `; ${h.warnRuns.length} warn: ${why(h.warnRuns, 'warnings')} (absolute numbers not comparable with an A/A floor from a quiet host)`;
  if (h.stub) s += ` [host STUBBED: ${h.stub}]`;
  return s;
}
function baselineLine(b) {
  return `**${b.tag}: not measured on the pinned snapshot ${b.snapshot ?? '(none)'} throughout (state ${b.state} at the start, ${b.flaggedRuns.length} run(s) flagged by verify.mjs); verdicts invalid** (tools/lib/baseline.mjs)`;
}
function markdown(metrics, cfg) {
  const rows = [`| ${cfg.viewport} ${cfg.cpu}x, n=${cfg.runs} | baseline median [min-max] | patched median [min-max] | delta | verdict |`, '|---|---|---|---|---|'];
  for (const [phase, ms] of Object.entries(metrics)) for (const v of Object.values(ms)) {
    rows.push(`| ${phase}: ${v.name} | ${v.baseline.median} [${v.baseline.min}-${v.baseline.max}] | ${v.patched.median} [${v.patched.min}-${v.patched.max}] | ${v.delta > 0 ? '+' : ''}${v.delta}${v.deltaPct != null ? ` (${v.deltaPct > 0 ? '+' : ''}${v.deltaPct}%)` : ''} | ${v.verdict} |`);
  }
  if (cfg.measurement?.traceFrames) rows.push('', 'traced (--trace-frames): tracing perturbs timing; frame numbers of this A/B are not comparable with untraced ones (compare the trace rows within this A/B only).');
  if (cfg.host) rows.push('', hostLine(cfg.host));
  if (cfg.baselineSnapshot?.tag) rows.push('', baselineLine(cfg.baselineSnapshot));
  return rows.join('\n');
}

async function cmdAb(t) {
  const aa = flag('aa');
  if (!aa) { checkTopic(t); requireWorktree('write results'); }
  requireBase();
  const topic = aa ? (t ? checkTopic(t) : '_aa') : t;
  if (!aa && !overlayFiles(t).length) die(`fixes/${t}/overlay is empty`);
  const runs = Number(opt('runs', 5)), cpu = Number(opt('cpu', 6)), viewport = opt('viewport', 'mobile'), idle = Number(opt('idle', 6));
  if (!['mobile', 'desktop'].includes(viewport)) die('--viewport must be mobile or desktop for ab (run twice for both)');
  if (!Number.isFinite(idle) || idle < 0) die(`--idle must be a number of seconds >= 0 (got "${opt('idle')}")`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(REPO, 'out', 'ab', topic, stamp);
  mkdirSync(outDir, { recursive: true });
  const patchInfo = aa ? null : cmdDiff(t, { quiet: true });

  const onOv = ON ? ['--overlay', overlayDir(ON)] : [];
  const base = await startServer('baseline', join(outDir, 'serve-base.json'), onOv);
  const fix = await startServer('patched', join(outDir, 'serve-fix.json'), aa ? onOv : ['--overlay', [overlayDir(t), ...(ON ? [overlayDir(ON)] : [])].join(',')]);
  let verifyProc = null; // killed with the servers, so a SIGTERM'd ab leaves no measurement (or Chrome) running
  const signalled = new Set(); // each child gets one SIGTERM from us, however often kill() runs
  const kill = () => { for (const p of [base.proc, fix.proc, verifyProc]) if (p && !signalled.has(p)) { signalled.add(p); try { p.kill(); } catch {} } };
  process.on('exit', kill);
  // process.on, not once: a once-listener is removed before it runs, restoring the default action, so a
  // second signal killed ab midway through process.exit() (incident I-009, same mechanism as I-008).
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { kill(); process.exit(130); });
  console.log(`baseline ${base.url}   patched ${fix.url}${aa ? '   (A/A: both baseline)' : ''}`);

  // prove what each server serves: overlay files from the overlay, everything else from the baseline
  const served = [];
  if (!aa) {
    for (const rel of overlayFiles(t)) {
      const [rb, rf] = await Promise.all([get(base.url + rel), get(fix.url + rel)]);
      const h = (b) => createHash('sha256').update(b).digest('hex');
      served.push({ path: '/' + rel, baseline: { status: rb.status, sha256: h(rb.body), source: rb.headers['x-mirror-source'] || 'base' }, patched: { status: rf.status, sha256: h(rf.body), source: rf.headers['x-mirror-source'] }, overlaySha256: sha256File(join(overlayDir(t), rel)) });
    }
    const bad = served.filter((s) => s.patched.sha256 !== s.overlaySha256 || s.patched.source !== 'overlay' || s.baseline.sha256 === s.overlaySha256);
    if (bad.length) { console.error('patched server does not serve the overlay as expected:', JSON.stringify(bad, null, 1)); kill(); process.exit(1); }
    console.log(`served-file check OK: ${served.length} overlay file(s) differ from baseline and come from the overlay`);
  }

  const verifyFile = join(outDir, 'verify.json');
  const vArgs = [join(REPO, 'tools', 'verify.mjs'), `base=${base.url}`, `${aa ? 'base2' : 'fix'}=${fix.url}`, '--runs', String(runs), '--cpu', String(cpu), '--viewport', viewport, '--idle', String(idle), '--out', outDir, '--result', verifyFile, '--owner', topic, ...(flag('no-screens') ? ['--no-screens'] : []), ...AB_FLAGS.filter(flag).map((f) => `--${f}`),
    ...['max-wait', 'max-load', 'max-busy', 'watchdog', 'chrome-warm'].flatMap((k) => (opt(k) !== undefined ? [`--${k}`, String(opt(k))] : []))];
  verifyProc = spawn(process.execPath, vArgs, { stdio: 'inherit' });
  const code = await new Promise((res) => verifyProc.on('exit', (c) => res(c)));
  kill();
  if (code !== 0 || !existsSync(verifyFile)) die(`verify.mjs failed (${code})`, 1);

  const v = JSON.parse(readFileSync(verifyFile, 'utf8'));
  const lb = 'base', lf = aa ? 'base2' : 'fix';
  const metrics = stats(v.results, viewport, lb, lf, METRICS);
  const runsOf = (l) => v.results.filter((r) => !r.diff && r.label === l);
  const norm = (e) => String(e).replace(/https?:\/\/(localhost|127\.0\.0\.1|[\d.]+):\d+/g, '<origin>');
  const errs = (l) => [...new Set(runsOf(l).flatMap((r) => r.errors).map(norm))];
  const nf = (l) => [...new Set(runsOf(l).flatMap((r) => r.notFound).map(norm))];
  const regressions = {
    newErrors: errs(lf).filter((e) => !errs(lb).includes(e)),
    fixedErrors: errs(lb).filter((e) => !errs(lf).includes(e)),
    errorsBothSides: errs(lf).filter((e) => errs(lb).includes(e)),
    new404s: nf(lf).filter((e) => !nf(lb).includes(e)),
    screenshotDiffPct: Object.fromEntries(v.results.filter((r) => r.diff).map((r) => [r.shot, r.diffPct ?? r.error])),
    morphReached: { baseline: runsOf(lb).map((r) => /is-morph/.test(r.morphState || '')), patched: runsOf(lf).map((r) => /is-morph/.test(r.morphState || '')) },
  };
  const host = hostSummary(v);
  if (host.contaminated) for (const ms of Object.values(metrics)) for (const x of Object.values(ms)) x.verdict = CONTAMINATED + x.verdict;
  // the baseline: not the pinned snapshot at the start (FW_BASELINE_ALLOW_MODIFIED=1), flagged by verify after
  // a run (changed mid-A/B), or changed by now: the verdicts compare something else than they say
  const flagged = v.results.filter((r) => !r.diff && r.baseline?.tag).map((r) => ({ label: r.label, run: r.run, viewport: r.viewport, state: r.baseline.state, tag: r.baseline.tag }));
  const bTag = baselineTag(baselineMeta(BASELINE)) ?? flagged[0]?.tag ?? baselineTag(baselineMeta(BASELINE), baselineMeta(baselineStatus()));
  if (bTag) for (const ms of Object.values(metrics)) for (const x of Object.values(ms)) x.verdict = `${bTag}: ${x.verdict}`;
  const cfg = { cpu, viewport, runs, idle, serveArgs: serveArgs(), baseline: BASE_NAME + (ON ? ` + fixes/${ON}/overlay` : ''), baselineSnapshot: { ...baselineMeta(BASELINE), ...(bTag ? { tag: bTag, flaggedRuns: flagged } : {}) }, stackedOn: ON, order: 'ABBA (alternating per run)',
    hostThresholds: v.host.thresholds ?? null, hostRecheck: v.host.recheck ?? null, watchdogSec: v.host.watchdogSec ?? null, measurement: v.measurement ?? null };
  const result = {
    topic, kind: aa ? 'A/A noise floor' : 'A/B', createdAt: new Date().toISOString(),
    git: { branch: git('rev-parse', '--abbrev-ref', 'HEAD'), head: git('rev-parse', '--short', 'HEAD'), checkout: checkoutId() },
    config: cfg,
    patch: patchInfo ? { file: relative(REPO, patchInfo.file), sha256: sha256File(patchInfo.file), files: patchInfo.files, added: patchInfo.add, removed: patchInfo.del } : null,
    servedCheck: served,
    metrics, regressions,
    host,
    raw: relative(REPO, verifyFile),
  };
  result.markdown = markdown(metrics, { ...cfg, host });
  // a traced A/B is not comparable with untraced ones: it never replaces the deliverable results.json (I-018 review)
  const traced = flag('trace-frames');
  const resFile = aa ? join(outDir, traced ? 'results-aa-trace.json' : 'results-aa.json') : join(topicDir(t), traced ? 'results-trace.json' : 'results.json');
  writeFileSync(resFile, JSON.stringify(result, null, 1));
  console.log('\n' + result.markdown + '\n');
  if (regressions.newErrors.length) console.log('NEW ERRORS on the patched page:\n  ' + regressions.newErrors.join('\n  '));
  if (regressions.new404s.length) console.log('NEW 404s on the patched page: ' + regressions.new404s.join(', '));
  console.log(`screenshot diff patched vs baseline (% pixels): ${JSON.stringify(regressions.screenshotDiffPct)}  (0-0.4 % is countdown/orbit phase noise)`);
  console.log(hostLine(host));
  if (bTag) console.log(baselineLine(cfg.baselineSnapshot));
  console.log(`wrote ${relative(REPO, resFile)} (raw: ${result.raw})`);
}

// ---- dispatch ---------------------------------------------------------------------------------------
const cmds = {
  doctor: () => doctor(), list: () => list(), new: () => cmdNew(args[0]), edit: () => cmdEdit(args[0], args.slice(1)),
  show: () => cmdShow(args[0]), grep: () => cmdGrep(args[0], args.slice(1)), diff: () => cmdDiff(args[0]),
  apply: () => cmdApply(args[0]), combine: () => cmdCombine(args[0], args.slice(1)), serve: () => cmdServe(args[0]), ab: () => cmdAb(args[0]),
};
if (!cmd || !cmds[cmd]) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 18).map((l) => l.slice(3)).join('\n')); process.exit(cmd ? 2 : 0); }
Promise.resolve(cmds[cmd]()).catch((e) => { console.error(e.stack || e); process.exit(1); });
