#!/usr/bin/env node
// Automated per-topic benchmarks (research/architecture/automated-benchmarks.md; fixes/README.md
// Definition of done items 7a and 8). Each done topic commits a data-only fixes/<topic>/bench.json.
//
//   node tools/bench.mjs lint [<topic>...]            # schema + "no code" lint of fixes/*/bench.json (in npm test)
//   node tools/bench.mjs mech <topic> [--on <o>] [--viewport mobile|desktop|both] [--repeat 2] [--live]
//                                     [--experiment <topic>/<nn>] [--owner <name>] [--allow-main]
//        Tier A: exact in-page counters + parity snapshots during an unthrottled, stepped scroll, headless.
//        Baseline side: site-pretty (or <o>); patched side: the overlay rebuilt from the committed
//        fixes/<topic>/patch.diff into out/bench/overlays/ (--live: fixes/<topic>/overlay as it is now;
//        --experiment: that row's variant diff, checked against the row's expected outcome).
//        Takes chrome-measure in the SHORT lane (--short --max-seconds 180) and stops itself at 180 s.
//
// Every check asserts a pair: the baseline expectation proves the probe still sees the mechanism
// (else VACUOUS, or ALREADY-REMOVED with --on), the patched one that the fix still removes it (else
// FAIL). Repeats that disagree -> FLAKY (never retried until green). Results: fixes/<topic>/bench-results.json.
//
// Exit codes: 0 pass, 1 a check failed / VACUOUS / REGRESSED / lint errors, 2 usage,
//             3 INCONCLUSIVE / FLAKY / BASELINE-CHANGED, 124 the short-lane budget ran out.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import { REPO, resolveTree, checkoutId, isLinkedWorktree } from './lib/paths.mjs';
import { acquire } from './lib/lock.mjs';
import { launchChrome, CDP, browserVersion } from './lib/cdp.mjs';
import { lintTopic, loadSpec } from './lib/bench-spec.mjs';
import { patchHeader, baselineDrift, buildOverlay, listFiles, sha256File } from './lib/bench-overlay.mjs';
import { tierASession, CDP_KINDS } from './lib/bench-scenario.mjs';
import { checkRepeat, combineRepeats, isStalled, baselineChanged, parityDiff, parityVerdict, experimentVerdict, exitCode } from './lib/bench-verdict.mjs';

const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const own = dd >= 0 ? argv.slice(0, dd) : argv;
const VALUED = ['--on', '--viewport', '--repeat', '--owner', '--experiment', '--max-seconds'];
const opt = (n, d) => { const i = own.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = own[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : own[i + 1]; };
const flag = (n) => own.includes(`--${n}`);
const pos = own.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(own[i - 1])));
const [cmd, ...args] = pos;
const FIXES = join(REPO, 'fixes');
const BASE_NAME = process.env.FW_BASE || 'site-pretty';
const BASE = resolveTree(BASE_NAME);
const OUT = join(REPO, 'out', 'bench');
const MECH_MAX_SEC = 180; // lead decision Q1: Tier A in the short lane, capped at 180 s
const MECH_SERVE = ['--vendors=local']; // Tier A: no latency or https needed for counts

function die(msg, code = 2) { console.error(msg); process.exit(code); }
/** mech/gain/calibrate write fixes/<topic>/bench-results.json: in a worktree, like fix.mjs (Hard rule 5). */
function requireWorktree() {
  if (isLinkedWorktree() || flag('allow-main') || process.env.FW_ALLOW_MAIN === '1') return;
  die(`refusing to write fixes/*/bench-results.json in the main checkout (${REPO}); run it in your worktree, or use bench.mjs reconfirm (writes only out/). --allow-main if you really mean it.`);
}
const checkTopic = (t) => { if (!t || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(t)) die(`topic must be kebab-case (got "${t ?? ''}")`); return t; };
function git(...a) { const r = spawnSync('git', a, { cwd: REPO, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; }

/** Topics with a fixes/<topic>/bench.json in this checkout. */
function benchTopics(dir = FIXES) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => !d.startsWith('_') && statSync(join(dir, d)).isDirectory() && existsSync(join(dir, d, 'bench.json'))).sort();
}

/** Content hash of the benchmark's measurement code: results only compare within one toolsSha. */
export function toolsSha() {
  const files = ['tools/bench.mjs', ...readdirSync(join(REPO, 'tools', 'lib')).filter((f) => /^bench-.*\.mjs$/.test(f)).sort().map((f) => `tools/lib/${f}`), 'tools/lib/cdp.mjs', 'tools/lib/perf-page.mjs', 'tools/serve.mjs', 'tools/vendor-shim.js'];
  const h = createHash('sha256');
  for (const f of files) if (existsSync(join(REPO, f))) h.update(f + '\0').update(readFileSync(join(REPO, f)));
  return h.digest('hex').slice(0, 12);
}
function baselineManifest() {
  const f = join(resolveTree('site'), '.mirror', 'manifest.json');
  return existsSync(f) ? sha256File(f).slice(0, 16) : null;
}

// ---- lint -------------------------------------------------------------------------------------------
function cmdLint(topics) {
  const list = topics.length ? topics : benchTopics();
  if (!list.length) { console.log('no fixes/*/bench.json yet'); return 0; }
  let bad = 0;
  for (const t of list) {
    const r = lintTopic(FIXES, t);
    if (r.errors.length) { bad++; console.log(`FAIL ${t}\n  ${r.errors.join('\n  ')}`); }
    else console.log(`OK   ${t}${r.warnings.length ? `\n  warning: ${r.warnings.join('\n  warning: ')}` : ''}`);
  }
  return bad ? 1 : 0;
}

// ---- overlays ----------------------------------------------------------------------------------------
/** Patches (and live seed dirs) that make up target `o` (a topic with patch.diff, or a combined overlay). */
function targetParts(o, seen = new Set()) {
  if (seen.has(o)) die(`--on ${o}: stacking loop`);
  seen.add(o);
  const pf = join(FIXES, o, 'patch.diff');
  if (existsSync(pf)) {
    const text = readFileSync(pf, 'utf8');
    const h = patchHeader(text);
    const below = h.stackedOn ? targetParts(h.stackedOn, seen) : { patches: [], seeds: [] };
    return { patches: [...below.patches, { name: o, text, file: pf }], seeds: below.seeds };
  }
  if (existsSync(join(FIXES, o, 'overlay'))) return { patches: [], seeds: [join(FIXES, o, 'overlay')] };
  die(`--on ${o}: neither fixes/${o}/patch.diff nor fixes/${o}/overlay exists`);
}
function build(name, parts) {
  const dest = join(OUT, 'overlays', name);
  const report = buildOverlay({ repo: REPO, dest, base: BASE, patches: parts.patches, seedDirs: parts.seeds });
  const bad = report.filter((r) => !r.ok);
  return { dest, report, bad };
}

// ---- servers -----------------------------------------------------------------------------------------
const children = new Set();
const killChildren = () => { for (const c of children) { try { c.kill(); } catch {} } children.clear(); };
process.on('exit', killChildren);
async function startServer(label, overlays, serveArgs, stateDir) {
  mkdirSync(stateDir, { recursive: true });
  const stateFile = join(stateDir, `serve-${label}.json`);
  rmSync(stateFile, { force: true });
  const a = [join(REPO, 'tools', 'serve.mjs'), '--root', BASE, ...(overlays.length ? ['--overlay', overlays.join(',')] : []), '--port', '0', '--quiet', '--state', stateFile, ...serveArgs];
  const proc = spawn(process.execPath, a, { stdio: ['ignore', 'ignore', 'inherit'] });
  children.add(proc);
  for (let i = 0; i < 200; i++) {
    if (existsSync(stateFile)) { try { return { proc, ...JSON.parse(readFileSync(stateFile, 'utf8')) }; } catch {} }
    if (proc.exitCode !== null) throw new Error(`${label} server exited (${proc.exitCode})`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${label} server did not start`);
}
function get(url) {
  return new Promise((res, rej) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { rejectUnauthorized: false, headers: { 'accept-encoding': 'identity' } }, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(c) })); });
    req.on('error', rej);
    req.setTimeout(20000, () => req.destroy(new Error('timeout ' + url)));
  });
}
/** Every overlay file must come from the overlay, byte for byte. */
async function servedCheck(url, dir) {
  const bad = [];
  const files = listFiles(dir);
  for (const rel of files) {
    const r = await get(url + rel);
    const want = sha256File(join(dir, rel)), got = createHash('sha256').update(r.body).digest('hex');
    if (r.status !== 200 || got !== want || r.headers['x-mirror-source'] !== 'overlay') bad.push(`/${rel}: status ${r.status}, source ${r.headers['x-mirror-source']}, sha ${got === want ? 'ok' : 'differs'}`);
  }
  return { files: files.length, bad };
}

// ---- lock + budget -------------------------------------------------------------------------------------
async function takeLock(owner, { short, maxSec, meta }) {
  const l = await acquire('chrome-measure', { owner, kind: 'process', short, maxSec, meta });
  if (short && !l.reentrant) {
    // a short hold ends at maxSec for everyone else: stop before that, never measure past it
    const t = setTimeout(() => { console.error(`[bench] the short-lane budget of ${maxSec} s ran out: stopping (split the run with --viewport, or --repeat 1 while iterating)`); process.exit(124); }, Math.max(1, maxSec - 3) * 1000);
    t.unref();
  }
  return l;
}

// ---- results ---------------------------------------------------------------------------------------------
function readResults(t) { const f = join(FIXES, t, 'bench-results.json'); try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return { schema: 1, topic: t }; } }
function writeResults(t, res) { const f = join(FIXES, t, 'bench-results.json'); writeFileSync(f, JSON.stringify(res, null, 1) + '\n'); return f; }

// ---- Tier A ----------------------------------------------------------------------------------------------
/**
 * Plans per viewport for a list of {topic, spec}: labels and probe ids are namespaced "<topic>:<name>".
 */
export function mechPlans(items, viewports) {
  const plans = {};
  for (const { topic, spec } of items) {
    const use = [...(spec.mechanism || []).map((c) => ({ ...c, kind: 'check' })), ...(spec.parity || []).map((p) => ({ ...p, kind: 'parity' }))];
    for (const u of use) {
      if (!viewports.includes(u.viewport)) continue;
      const plan = plans[u.viewport] ||= { viewport: u.viewport, probes: {}, windows: [], segments: {}, spots: {} };
      const name = u.segment ?? u.spot, label = `${topic}:${name}`;
      let w = plan.windows.find((x) => x.label === label);
      if (!w) {
        w = { label, parity: [], ...(u.segment !== undefined ? { segment: name } : { spot: name }) };
        plan.windows.push(w);
        if (u.segment !== undefined) plan.segments[label] = spec.segments[name]; else plan.spots[label] = spec.spots[name];
      }
      if (u.kind === 'parity') w.parity.push(u);
      else plan.probes[`${topic}:${u.probe}`] = spec.probes[u.probe];
    }
  }
  // windows run in bench.json order of first use, per topic: keep it stable
  return plans;
}

/**
 * Run Tier A: `sides` = {baseline: {label, url}, patched: {label, url}}; alternating order per repeat.
 * Returns sessions[viewport][side][repeat].
 */
async function runMech(cdp, plans, sides, repeat, log) {
  const sessions = {};
  for (const [vp, plan] of Object.entries(plans)) {
    sessions[vp] = { baseline: [], patched: [] };
    for (let r = 0; r < repeat; r++) {
      for (const side of r % 2 ? ['patched', 'baseline'] : ['baseline', 'patched']) {
        log(`[${vp} repeat ${r + 1}/${repeat}] ${side} ${sides[side].url}`);
        sessions[vp][side].push(await tierASession(cdp, sides[side].url, plan, { log }));
      }
    }
  }
  return sessions;
}

/** Evaluate one topic's checks and parity from the sessions. */
export function evaluateTopic(topic, spec, sessions, { on = null, drift = false } = {}) {
  const checks = [], parity = [];
  for (const c of spec.mechanism || []) {
    const s = sessions[c.viewport];
    if (!s) continue;
    const label = `${topic}:${c.segment ?? c.spot}`, pid = `${topic}:${c.probe}`;
    const val = (side, r) => { const w = s[side][r].windows[label]; return w ? w.counts[pid] : null; };
    const probeErr = (side, r) => s[side][r].errors.filter((e) => { const p = spec.probes[c.probe]; return [p.selector, p.prop, p.query].some((x) => x && e.includes(x)) || e.startsWith(`${label}:`); });
    const b = [], p = [], per = [], errors = [];
    let stalled = false;
    for (let r = 0; r < s.baseline.length; r++) {
      b.push(val('baseline', r)); p.push(val('patched', r));
      const e = [...probeErr('baseline', r), ...probeErr('patched', r)];
      errors.push(...e);
      per.push(e.length ? 'ERROR' : checkRepeat(c, b[r], p[r], { on }));
      for (const side of ['baseline', 'patched']) { const w = s[side][r].windows[label]; if (w && isStalled(w.capped, w.steps)) stalled = true; }
    }
    const verdict = baselineChanged(combineRepeats(per, { stalled }), drift);
    checks.push({ id: c.id, viewport: c.viewport, where: c.segment ?? c.spot, probe: c.probe, kind: spec.probes[c.probe].kind, baseline: { expect: c.baseline, values: b }, patched: { expect: c.patched, values: p }, perRepeat: per, ...(stalled ? { stalled: true } : {}), ...(errors.length ? { errors: [...new Set(errors)] } : {}), verdict });
  }
  for (const e of spec.parity || []) {
    const s = sessions[e.viewport];
    if (!s) continue;
    const label = `${topic}:${e.segment ?? e.spot}`;
    const totals = [], diffs = [];
    let stalled = false, steps = 0;
    for (let r = 0; r < s.baseline.length; r++) {
      const d = parityDiff(e, s.baseline[r].parity[label] || [], s.patched[r].parity[label] || []);
      totals.push(d.total); diffs.push(...d.diffs.map((x) => ({ repeat: r + 1, ...x })));
      steps = (s.baseline[r].parity[label] || []).length;
      for (const side of ['baseline', 'patched']) { const w = s[side][r].windows[label]; if (w && isStalled(w.capped, w.steps)) stalled = true; }
    }
    parity.push({ viewport: e.viewport, where: e.segment ?? e.spot, keys: [...(e.classes || []).map((x) => 'class ' + x), ...(e.props || []).map((x) => `prop ${x[0]} ${x[1]}`), ...(e.attrs || []).map((x) => `attr ${x[0]} ${x[1]}`)], steps, diffTotals: totals, diffs: diffs.slice(0, 20), verdict: baselineChanged(parityVerdict(totals, { stalled }), drift && totals.some((x) => x > 0)) });
  }
  return { checks, parity };
}

function fmtVals(v) { return v.map((x) => (x == null ? '-' : Number.isInteger(x) ? x : Math.round(x * 1000) / 1000)).join(', '); }
function printTopic(topic, ev, experiment) {
  for (const c of ev.checks) console.log(`  ${c.verdict.padEnd(16)} ${c.id.padEnd(30)} ${c.viewport} ${c.where}: baseline ${fmtVals(c.baseline.values)} (${c.baseline.expect})  patched ${fmtVals(c.patched.values)} (${c.patched.expect})${c.stalled ? '  [quiescence cap hit on too many steps]' : ''}${c.errors ? `  errors: ${c.errors.join('; ')}` : ''}`);
  for (const p of ev.parity) console.log(`  ${p.verdict.padEnd(16)} parity ${p.viewport} ${p.where}: ${p.steps} steps, diffs per repeat ${p.diffTotals.join(', ')}${p.diffs.length ? `\n${p.diffs.slice(0, 5).map((d) => `      step ${d.step} y ${d.y ?? '-'} ${d.key}: ${JSON.stringify(d.baseline)} -> ${JSON.stringify(d.patched)}`).join('\n')}` : ''}`);
  if (experiment) for (const r of experiment.rows) console.log(`  experiment ${r.id}: expected ${r.expected}, observed ${r.observed}: ${r.match}`);
}

/**
 * Build both sides of a comparison: the baseline side (site-pretty, or --on <o> rebuilt) and the patched
 * side (<o> + the committed patch.diff, an experiment's variant diff, or --live: the owner's overlay).
 * Returns {source, drift, baseBuild, pb} or {exit} after printing a CONFLICT / BASELINE-CHANGED line.
 */
function prepareSides(t, { on = null, exp = null, live = false }) {
  const onParts = on ? targetParts(on) : { patches: [], seeds: [] };
  let mine, source;
  if (live) {
    if (!existsSync(join(FIXES, t, 'overlay'))) die(`--live: fixes/${t}/overlay does not exist`);
    mine = { patches: [], seeds: [join(FIXES, t, 'overlay')] }; source = { kind: 'live', dir: `fixes/${t}/overlay` };
  } else {
    const rel = exp && exp.variant !== 'final' ? exp.variant : 'patch.diff';
    const f = join(FIXES, t, rel);
    if (!existsSync(f)) die(`fixes/${t}/${rel} not found`);
    const text = readFileSync(f, 'utf8');
    const h = patchHeader(text);
    if (h.stackedOn && h.stackedOn !== on) die(`fixes/${t}/${rel} is stacked on ${h.stackedOn}: run with --on ${h.stackedOn}`);
    mine = { patches: [{ name: t, text }], seeds: [] }; source = { kind: exp ? 'variant' : 'committed', file: `fixes/${t}/${rel}`, sha256: sha256File(f) };
    source.drift = baselineDrift(text, BASE);
  }
  const drift = !!(source.drift && source.drift.length);
  const baseBuild = on ? build(`on-${on}`, onParts) : null;
  if (baseBuild?.bad.length) { console.log(`CONFLICT building --on ${on}:\n  ${baseBuild.bad.map((b) => `${b.name}: ${b.error}`).join('\n  ')}`); return { exit: 1 }; }
  const patchedName = `${t}${exp ? '@' + exp.id.split('/')[1] : ''}${source.kind === 'live' ? '-live' : ''}${on ? '+on-' + on : ''}`;
  const pb = build(patchedName, { patches: [...onParts.patches, ...mine.patches], seeds: [...mine.seeds, ...onParts.seeds] });
  if (pb.bad.length) {
    const v = drift ? 'BASELINE-CHANGED' : 'CONFLICT';
    console.log(`${v} ${t}: the patch does not apply${on ? ` on top of ${on}` : ''}:\n  ${pb.bad.map((b) => `${b.name}: ${b.error}`).join('\n  ')}`);
    return { exit: drift ? 3 : 1 };
  }
  return { source, drift, baseBuild, pb };
}

async function cmdMech(t) {
  checkTopic(t);
  requireWorktree();
  if (!existsSync(BASE)) die(`baseline ${BASE} not found (FW_MIRROR_HOME?)`, 1);
  const spec = loadSpec(FIXES, t);
  if (spec.status === 'superseded') { console.log(`${t}: status superseded by ${spec.supersededBy} (${spec.reason}); nothing to check`); return 0; }
  const on = opt('on') || null;
  const repeat = Number(opt('repeat', 2));
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 4) die('--repeat must be 1-4');
  const vpOpt = opt('viewport', 'both');
  if (!['mobile', 'desktop', 'both'].includes(vpOpt)) die('--viewport mobile|desktop|both');
  const viewports = vpOpt === 'both' ? ['mobile', 'desktop'] : [vpOpt];
  const expId = opt('experiment') || null;
  let exp = null;
  if (expId) {
    exp = (spec.experiments || []).find((x) => x.id === expId);
    if (!exp) die(`no experiment "${expId}" in fixes/${t}/bench.json`);
  }
  const sides = prepareSides(t, { on, exp, live: flag('live') });
  if (sides.exit != null) return sides.exit;
  const { source, drift, baseBuild, pb } = sides;
  const items = [{ topic: t, spec }];
  const plans = mechPlans(items, viewports);
  if (!Object.keys(plans).length) die(`fixes/${t}/bench.json has no mechanism or parity check for ${viewports.join('/')}`);

  const owner = opt('owner', process.env.FW_LOCK_OWNER || `bench-${t}`);
  const lock = await takeLock(owner, { short: true, maxSec: MECH_MAX_SEC, meta: { cmd: 'bench mech', topic: t, on, viewports } });
  const t0 = Date.now();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = join(OUT, 'runs', `${t}-${stamp}`);
  const load1Start = os.loadavg()[0];
  let sessions, chromeVersion, served;
  const ch = await launchChrome({ port: 0, profileDir: join(REPO, 'out', 'chrome-bench-profile'), headless: true });
  try {
    const [bs, ps] = await Promise.all([startServer('baseline', baseBuild ? [baseBuild.dest] : [], MECH_SERVE, runDir), startServer('patched', [pb.dest], MECH_SERVE, runDir)]);
    served = await servedCheck(ps.url, pb.dest);
    if (served.bad.length) throw new Error(`patched server does not serve the overlay: ${served.bad.join('; ')}`);
    const cdp = await CDP.connect(ch.wsUrl);
    chromeVersion = await browserVersion(cdp).catch(() => null);
    const sides = { baseline: { url: bs.url }, patched: { url: ps.url } };
    console.log(`bench mech ${t}${exp ? ` --experiment ${expId}` : ''}: baseline ${BASE_NAME}${on ? ` + ${on}` : ''} vs ${source.kind === 'live' ? source.dir : source.file}${on ? ` on ${on}` : ''}; ${Object.keys(plans).join('+')}, repeat ${repeat}, headless, unthrottled`);
    sessions = await runMech(cdp, plans, sides, repeat, (s) => console.log(s));
    cdp.close();
  } finally {
    await ch.close();
    killChildren();
    lock.release();
  }
  const ev = evaluateTopic(t, spec, sessions, { on, drift });
  const experiment = exp ? experimentVerdict(exp.expect, ev.checks, ev.parity) : null;
  const verdicts = experiment ? [experiment.verdict] : [...ev.checks.map((c) => c.verdict), ...ev.parity.map((p) => p.verdict)];
  const code = exitCode(verdicts);
  printTopic(t, ev, experiment);
  const summary = code === 0 ? 'PASS' : code === 3 ? (verdicts.includes('BASELINE-CHANGED') ? 'BASELINE-CHANGED' : 'FLAKY') : 'FAIL';
  const record = {
    at: new Date().toISOString(), verdict: experiment ? experiment.verdict : summary, seconds: Math.round((Date.now() - t0) / 1000),
    git: { branch: git('rev-parse', '--abbrev-ref', 'HEAD'), head: git('rev-parse', '--short', 'HEAD'), checkout: checkoutId() },
    toolsSha: toolsSha(), chrome: chromeVersion, baselineManifest: baselineManifest(), baseline: BASE_NAME + (on ? ` + ${on}` : ''), on,
    patch: source, served: { files: served.files }, viewports: Object.keys(plans), repeat, host: { load1Start: Math.round(load1Start * 10) / 10, load1End: Math.round(os.loadavg()[0] * 10) / 10 },
    sessions: Object.fromEntries(Object.entries(sessions).map(([vp, s]) => [vp, Object.fromEntries(Object.entries(s).map(([side, rs]) => [side, rs.map((x) => ({ steps: x.steps, capped: x.capped, errors: x.errors }))]))])),
    checks: ev.checks, parity: ev.parity, ...(experiment ? { experiment } : {}),
  };
  const res = readResults(t);
  if (exp) { res.experiments ||= {}; res.experiments[expId] ||= {}; res.experiments[expId].mech = record; }
  else if (on) { res.mechOn ||= {}; res.mechOn[on] = record; }
  else res.mech = record;
  const f = writeResults(t, res);
  console.log(`MECH ${record.verdict} ${t}${exp ? ` ${expId}` : ''} (${ev.checks.length} checks, ${ev.parity.length} parity, ${record.seconds} s) -> ${relative(REPO, f)}`);
  return code;
}

const cmds = { lint: () => cmdLint(args), mech: () => cmdMech(args[0]) };
if (!cmd || !cmds[cmd]) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(cmd ? 2 : 0);
}
Promise.resolve(cmds[cmd]()).then((c) => process.exit(c ?? 0), (e) => { console.error(e.stack || e); process.exit(1); });
