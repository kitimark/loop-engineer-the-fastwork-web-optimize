#!/usr/bin/env node
// Automated per-topic benchmarks (research/architecture/automated-benchmarks.md; fixes/README.md
// Definition of done items 7a and 8). Each done topic commits a data-only fixes/<topic>/bench.json.
//
//   node tools/bench.mjs lint [<topic>...]            # schema + "no code" lint of fixes/*/bench.json (in npm test)
//   node tools/bench.mjs mech <topic> [--on <o>] [--viewport mobile|desktop|both] [--repeat 2] [--live]
//                                     [--experiment <topic>/<nn>] [--owner <name>] [--max-seconds 5-180] [--allow-main]
//        Tier A: exact in-page counters + parity snapshots during an unthrottled, stepped scroll, headless.
//        Baseline side: site-pretty (or <o>); patched side: the overlay rebuilt from the committed
//        fixes/<topic>/patch.diff into out/bench/overlays/ (--live: fixes/<topic>/overlay as it is now;
//        --experiment: that row's variant diff, checked against the row's expected outcome).
//        Takes chrome-measure in the SHORT lane (--short --max-seconds 180) and stops itself at 180 s
//        (exit 124; the finished sessions' per-window counts are kept as bench-results.json mechPartial).
//   node tools/bench.mjs calibrate <topic> [--on <o>] [--runs 5] [--cpu 6] [--time-domain timeTicks|threadTicks] [--max-load 6]
//        Tier B noise floor: the topic's scenario as an A/A (baseline vs baseline), ABBA; minEffect = half
//        the Moses CI width. Refused unless every run was clean (tools/lib/host.mjs). Normal lane.
//        Needs only bench.json, no patch.diff (I-029): calibrate before the first patch exists.
//   node tools/bench.mjs gain <topic> [--on <o>] [--runs 5] [--cpu 6] [--time-domain ...] [--max-load 6] [--experiment <topic>/<nn>] [--live]
//        Tier B: the topic's micro-scenario (bench.json gain) at 6x, served like fix.mjs ab
//        (--vendors=local --https --latency 150), 5 fresh pages per side ABBA, Performance.getMetrics
//        deltas; exact one-sided Mann-Whitney + Hodges-Lehmann shift vs max(minEffect, half the authored
//        shift): HOLDS / REGRESSED / INCONCLUSIVE (any contaminated run, no or stale calibration). The
//        first clean HOLDS of the committed patch is stored as the authored effect. Normal lane.
//   node tools/bench.mjs reconfirm [--ref main] [--gain <topic,...>|all] [--experiments] [--runs 5] [--repeat 2]
//        Rebuild out/bench/overlays/_landed from <ref>'s committed fixes/*/patch.diff in landing order
//        (CONFLICT <topic> if one no longer applies), then one normal chrome-measure hold for Tier A of
//        every landed topic with a bench.json (site-pretty vs _landed; --experiments: every experiment
//        row's variant on its own overlay), and one more hold per --gain topic for its Tier B (an A/A
//        first when its floor is stale). Normal holds announce expectSec 600 (I-020).
//        Writes only out/bench/reconfirm/<sha>/report.{json,md}. Runs in the main checkout too.
//
// Every check asserts a pair: the baseline expectation proves the probe still sees the mechanism
// (else VACUOUS, or ALREADY-REMOVED with --on), the patched one that the fix still removes it (else
// FAIL). Repeats that disagree -> FLAKY (never retried until green). Results: fixes/<topic>/bench-results.json.
//
// Exit codes: 0 pass, 1 a check failed / VACUOUS / REGRESSED / lint errors, 2 usage,
//             3 INCONCLUSIVE / FLAKY / BASELINE-CHANGED (or, before measuring, BASELINE-MODIFIED / -MISMATCH:
//               the baseline is not the committed snapshot pinned by baseline.json), 124 the short-lane budget ran out.
// A run that measured another baseline anyway (FW_BASELINE_ALLOW_MODIFIED=1) or whose baseline changed
// while it ran (re-checked when it ends) gets "BASELINE-<STATE>: " before every verdict (baselineSnapshot.tag),
// exits 3 instead of 0, and never stores a calibration or an authored effect.
// Tier B host state (T8+, I-033): every gain run records display on/off, FullWake/DarkWake, power source and the
// display-sleep assertion just before and after it (runs[].host.power); a display or wake change within a run,
// between runs or between the sides gets "HOST-DISPLAY-CHANGED: " before the verdict (hostState.tag), with the same
// consequences as a BASELINE-* tag. The Chrome profile's field-trial hashes are logged as chromeProfile. A gain judged
// against a stored calibration counts that calibration's runs too (sides calibration-A/B, review-host-state N2): a floor
// measured in another display / wake state than the gain gets the same tag (calibrations from before T8+ carry none).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { REPO, resolveTree, checkoutId, isLinkedWorktree } from './lib/paths.mjs';
import { requireBaseline, baselineStatus, baselineMeta, baselineTag } from './lib/baseline.mjs';
import { acquire } from './lib/lock.mjs';
import { snapshot as hostSnapshot, between as hostBetween, THRESHOLDS as HOST_T, stubOutsideTest, hostStateSummary, describeHostState, chromeProfileState } from './lib/host.mjs';
import { launchChrome, CDP, browserVersion } from './lib/cdp.mjs';
import { lintTopic, loadSpec, lintSpec, GAIN_METRICS } from './lib/bench-spec.mjs';
import { patchHeader, baselineDrift, buildOverlay, listFiles, sha256File, landedTopics, gitShow, gitRev } from './lib/bench-overlay.mjs';
import { gainVerdict, experimentOutcome, calibrate as calibrateStats, hostBand, fmt } from './lib/bench-stats.mjs';
import { tierASession, CDP_KINDS, TEST_FAST } from './lib/bench-scenario.mjs';
import { checkRepeat, combineRepeats, isStalled, baselineChanged, parityDiff, parityVerdict, experimentVerdict, exitCode } from './lib/bench-verdict.mjs';

const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const own = dd >= 0 ? argv.slice(0, dd) : argv;
const VALUED = ['--on', '--viewport', '--repeat', '--owner', '--experiment', '--max-seconds', '--runs', '--cpu', '--time-domain', '--max-load', '--gain', '--ref'];
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
let BASELINE = { snapshot: null, state: 'unchecked' }; // set before any measurement command (bottom of the file)

function die(msg, code = 2) { console.error(msg); process.exit(code); }
/** BASELINE-<STATE> when this command did not measure the pinned snapshot throughout (re-checked now), else null. */
const baselineFlag = () => baselineTag(baselineMeta(BASELINE), baselineMeta(baselineStatus()));
const flagged = (tag, verdict) => (tag ? `${tag}: ${verdict}` : verdict);
const snapMeta = (tag) => ({ ...baselineMeta(BASELINE), ...(tag ? { tag } : {}) });
if (flag('no-lock')) die('bench.mjs always takes chrome-measure itself (Hard rule 7): there is no --no-lock');
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
const NORMAL_EXPECT_SEC = 600; // a normal hold announces 10 min (lock.mjs status shows OVERDUE past it, I-020)
async function takeLock(owner, { short, maxSec, meta, onBudget }) {
  const l = await acquire('chrome-measure', { owner, kind: 'process', short, maxSec, meta: short ? meta : { ...meta, expectSec: NORMAL_EXPECT_SEC } });
  if (short && !l.reentrant) {
    // a short hold ends at maxSec for everyone else: stop before that, never measure past it
    const t = setTimeout(() => {
      console.error(`[bench] the short-lane budget of ${maxSec} s ran out: stopping (split the run with --viewport, or --repeat 1 while iterating)`);
      try { onBudget?.(); } catch (e) { console.error(`[bench] could not save the partial record: ${e.message}`); }
      killChildren();
      process.exit(124);
    }, Math.max(1, maxSec - 3) * 1000);
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
 * Returns sessions[viewport][side][repeat]; fills `sessions` as it goes (the partial record on a budget stop).
 */
async function runMech(cdp, plans, sides, repeat, log, sessions = {}) {
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

/** The baseline side only (site-pretty, or + the --on overlay): for calibrate's A/A. */
function prepareBase(on) {
  if (!on) return { baseBuild: null };
  const baseBuild = build(`on-${on}`, targetParts(on));
  if (baseBuild.bad.length) { console.log(`CONFLICT building --on ${on}:\n  ${baseBuild.bad.map((b) => `${b.name}: ${b.error}`).join('\n  ')}`); return { exit: 1 }; }
  return { baseBuild };
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
  const maxSec = Number(opt('max-seconds', MECH_MAX_SEC));
  if (!(maxSec >= 5 && maxSec <= MECH_MAX_SEC)) die(`--max-seconds must be 5-${MECH_MAX_SEC} (Tier A runs in the short lane)`);
  const partial = {};
  let t0 = Date.now();
  // on a budget stop, keep what was measured: per-window counts of the finished sessions, never as `mech`
  const onBudget = () => {
    const res = readResults(t);
    res.mechPartial = { at: new Date().toISOString(), verdict: 'BUDGET', maxSeconds: maxSec, seconds: Math.round((Date.now() - t0) / 1000), toolsSha: toolsSha(), experiment: expId || null, on, viewports: Object.keys(plans), repeat,
      sessions: Object.fromEntries(Object.entries(partial).map(([vp, s]) => [vp, Object.fromEntries(Object.entries(s).map(([side, rs]) => [side, rs.map((x) => ({ steps: x.steps, capped: x.capped, errors: x.errors, windows: x.windows }))]))])) };
    const f = writeResults(t, res);
    console.error(`[bench] partial record (finished sessions only) -> ${relative(REPO, f)} mechPartial`);
  };
  const lock = await takeLock(owner, { short: true, maxSec, meta: { cmd: 'bench mech', topic: t, on, viewports }, onBudget });
  t0 = Date.now();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = join(OUT, 'runs', `${t}-${stamp}`);
  const hostStart = await hostSnapshot(); // recorded, never gated on: counts don't depend on load (design §2)
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
    sessions = await runMech(cdp, plans, sides, repeat, (s) => console.log(s), partial);
    cdp.close();
  } finally {
    await ch.close();
    killChildren();
    lock.release();
  }
  const host = hostBetween(hostStart, await hostSnapshot());
  // the host slept during the run (I-026): timers and frames stalled mid-window, so no count is trusted
  const slept = !!host.woke || (host.sleptSec ?? 0) > HOST_T.suspendMinSec;
  const ev = evaluateTopic(t, spec, sessions, { on, drift });
  const experiment = exp ? experimentVerdict(exp.expect, ev.checks, ev.parity) : null;
  const verdicts = experiment ? [experiment.verdict] : [...ev.checks.map((c) => c.verdict), ...ev.parity.map((p) => p.verdict)];
  const code = slept ? 3 : exitCode(verdicts);
  printTopic(t, ev, experiment);
  if (slept) console.log(`  FLAKY: the host slept ${host.sleptSec ?? '?'} s during the run (I-026); re-run it`);
  const summary = slept ? 'FLAKY' : code === 0 ? 'PASS' : code === 3 ? (verdicts.includes('BASELINE-CHANGED') ? 'BASELINE-CHANGED' : 'FLAKY') : 'FAIL';
  const bTag = baselineFlag();
  const record = {
    at: new Date().toISOString(), verdict: flagged(bTag, slept ? 'FLAKY' : experiment ? experiment.verdict : summary), ...(slept ? { hostSlept: true } : {}), seconds: Math.round((Date.now() - t0) / 1000),
    git: { branch: git('rev-parse', '--abbrev-ref', 'HEAD'), head: git('rev-parse', '--short', 'HEAD'), checkout: checkoutId() },
    toolsSha: toolsSha(), chrome: chromeVersion, baselineManifest: baselineManifest(), baselineSnapshot: snapMeta(bTag), baseline: BASE_NAME + (on ? ` + ${on}` : ''), on,
    patch: source, served: { files: served.files }, viewports: Object.keys(plans), repeat, ...(TEST_FAST ? { timing: 'test-fast' } : {}), host,
    sessions: Object.fromEntries(Object.entries(sessions).map(([vp, s]) => [vp, Object.fromEntries(Object.entries(s).map(([side, rs]) => [side, rs.map((x) => ({ steps: x.steps, capped: x.capped, errors: x.errors }))]))])),
    checks: ev.checks, parity: ev.parity, ...(experiment ? { experiment } : {}),
  };
  const res = readResults(t);
  if (exp) { res.experiments ||= {}; res.experiments[expId] ||= {}; res.experiments[expId].mech = record; }
  else if (on) { res.mechOn ||= {}; res.mechOn[on] = record; }
  else res.mech = record;
  const f = writeResults(t, res);
  console.log(`MECH ${record.verdict} ${t}${exp ? ` ${expId}` : ''} (${ev.checks.length} checks, ${ev.parity.length} parity, ${record.seconds} s) -> ${relative(REPO, f)}`);
  return bTag && code === 0 ? 3 : code;
}

// ---- Tier B ------------------------------------------------------------------------------------------------
const GAIN_SERVE = TEST_FAST ? ['--vendors=local', '--https'] : ['--vendors=local', '--https', '--latency', '150']; // the fix.mjs ab defaults (calibrated setting)
const chromeMajor = (v) => { const m = String(v || '').match(/\/(\d+)\./); return m ? Number(m[1]) : null; };
const setting = (timeDomain, cpu) => `${timeDomain} ${cpu}x ${GAIN_SERVE.join(' ')}${TEST_FAST ? ' test-fast' : ''}`;
const GAIN_EXIT = { HOLDS: 0, PASS: 0, REGRESSED: 1, MISMATCH: 1, INCONCLUSIVE: 3, SKIPPED: 0 };

/** The topic's Tier B scenario, keyed "<topic>:<segment|spot>". */
function gainScenario(topic, spec) {
  const g = spec.gain, sc = g.scenario;
  const name = sc.segment ?? sc.spot;
  return { key: `${topic}:${name}`, topic, viewport: sc.viewport, ...(sc.segment !== undefined ? { segment: spec.segments[name] } : { spot: spec.spots[name] }), metric: g.metric, direction: g.direction, ...(g.dwellFrames ? { dwellFrames: g.dwellFrames } : {}) };
}
function gainOpts() {
  const runs = Number(opt('runs', 5)), cpu = Number(opt('cpu', 6)), timeDomain = opt('time-domain', 'timeTicks');
  const maxLoad = opt('max-load') != null ? Number(opt('max-load')) : null;
  if (!Number.isInteger(runs) || runs < 4 || runs > 10) die('--runs must be 4-10 per side (Moses CI needs >= 4 vs 4; exact enumeration <= 10 vs 10)');
  if (!Number.isFinite(cpu) || cpu < 1) die('--cpu must be >= 1');
  if (!['timeTicks', 'threadTicks'].includes(timeDomain)) die('--time-domain timeTicks|threadTicks');
  if (maxLoad != null && !(maxLoad > 0)) die('--max-load must be > 0');
  return { runs, cpu, timeDomain, maxLoad };
}
const compactRuns = (runs, key) => runs.filter((r) => r.scenarios[key]).map((r) => ({ side: r.side, pair: r.pair, ...Object.fromEntries(Object.entries(r.scenarios[key]).filter(([k]) => k !== 'host')), host: { load1Start: r.host.load1Start, load1End: r.host.load1End, busyPct: r.host.busyPct, chromeCpuPct: r.host.chromeCpuPct, otherBusyPct: r.host.otherBusyPct, pressureMax: r.host.pressureMax, loadInvalid: r.host.loadInvalid, loadWarn: r.host.loadWarn, reasons: r.host.reasons, warnings: r.host.warnings, ...(r.host.power ? { power: r.host.power } : {}), ...(r.host.stub ? { stub: r.host.stub } : {}) } }));

/**
 * Serve A and B, launch a headed Chrome, run the ABBA loop over `scenarios`. Returns {runs, chrome}.
 * Everything inside one chrome-measure hold that the caller took.
 */
async function measureGain({ aOverlays, bOverlays, scenarios, o, runDir, log, gateTimeout = false }) {
  const { runGain } = await import('./lib/bench-gain.mjs');
  const profileDir = join(REPO, 'out', 'chrome-bench-profile');
  const ch = await launchChrome({ port: 0, profileDir, headless: false });
  try {
    const [as, bs] = await Promise.all([startServer('A', aOverlays, GAIN_SERVE, runDir), startServer('B', bOverlays, GAIN_SERVE, runDir)]);
    const cdp = await CDP.connect(ch.wsUrl);
    await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
    const chrome = await browserVersion(cdp).catch(() => null);
    const runs = await runGain({ cdp, chromePid: ch.proc.pid, sides: { A: { url: as.url }, B: { url: bs.url } }, scenarios, runs: o.runs, cpu: o.cpu, timeDomain: o.timeDomain, maxLoad: o.maxLoad, log, gateTimeout });
    cdp.close();
    return { runs, chrome, chromeProfile: chromeProfileState(profileDir) };
  } finally {
    await ch.close();
    killChildren();
  }
}

/** A/A floors for every metric of one scenario (only the scenario's own metric decides). */
function floors(runs, key) {
  const out = {};
  for (const m of GAIN_METRICS) {
    const a = runs.filter((r) => r.side === 'A' && r.scenarios[key] && !r.scenarios[key].error).map((r) => r.scenarios[key][m]);
    const b = runs.filter((r) => r.side === 'B' && r.scenarios[key] && !r.scenarios[key].error).map((r) => r.scenarios[key][m]);
    try {
      const c = calibrateStats(a, b);
      const all = [...a, ...b].sort((x, y) => x - y), med = all[Math.floor(all.length / 2)];
      out[m] = { minEffect: c.minEffect, shift: c.shift, ci: [c.ci.lo, c.ci.hi], relSpread: med ? Math.round((1000 * c.minEffect) / Math.abs(med)) / 1000 : null };
    } catch (e) { out[m] = { error: e.message }; }
  }
  return out;
}

async function cmdGain(t, { calibrateMode = false } = {}) {
  checkTopic(t);
  requireWorktree();
  if (!existsSync(BASE)) die(`baseline ${BASE} not found (FW_MIRROR_HOME?)`, 1);
  const spec = loadSpec(FIXES, t);
  const what = calibrateMode ? 'calibrate' : 'gain';
  if (!spec.gain) die(`fixes/${t}/bench.json has no "gain" scenario`);
  if (spec.status === 'superseded') { console.log(`${t}: status superseded by ${spec.supersededBy}; nothing to measure`); return 0; }
  const expId = calibrateMode ? null : opt('experiment') || null;
  const exp = expId ? (spec.experiments || []).find((x) => x.id === expId) : null;
  if (expId && !exp) die(`no experiment "${expId}" in fixes/${t}/bench.json`);
  if ((exp?.device ?? spec.gain.device ?? 'chrome') === 'iphone') { console.log(`GAIN SKIPPED ${t}${exp ? ` ${expId}` : ''}: device iphone (Chrome can't see this gain; Tier A still guards the mechanism)`); return 0; }
  if (exp && (exp.expect.gain === undefined || exp.expect.gain === 'broke')) { console.log(`GAIN SKIPPED ${expId}: expect.gain is ${exp.expect.gain ?? 'not set'} (a break is judged by bench mech: parity / checks expected to fail)`); return 0; }
  const o = gainOpts();
  const on = opt('on') || null;
  // calibrate is an A/A of the baseline (+ --on): it needs no patch.diff, so a topic can calibrate before
  // its first patch exists (I-029); gain needs the patched side
  const sides = calibrateMode ? prepareBase(on) : prepareSides(t, { on, exp, live: flag('live') });
  if (sides.exit != null) return sides.exit;
  const sc = gainScenario(t, spec);
  const owner = opt('owner', process.env.FW_LOCK_OWNER || `bench-${t}`);
  const lock = await takeLock(owner, { short: false, meta: { cmd: `bench ${what}`, topic: t, on, runs: o.runs, cpu: o.cpu } });
  // the host gate (lib/lock.mjs, I-016) granted a normal hold anyway after its cap: every run is contaminated
  const gateTimeout = !!lock.holder?.gateTimeout;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = join(OUT, 'runs', `${t}-${what}-${stamp}`);
  const baseOv = sides.baseBuild ? [sides.baseBuild.dest] : [];
  console.log(`bench ${what} ${t}${exp ? ` --experiment ${expId}` : ''}: ${sc.key} ${sc.metric} (${sc.direction} is better), ${o.runs} runs per side ABBA, ${o.cpu}x, ${o.timeDomain}${o.maxLoad != null ? `, --max-load ${o.maxLoad}` : ''}; ${calibrateMode ? `A/A: ${BASE_NAME}${on ? ` + ${on}` : ''} twice` : `baseline ${BASE_NAME}${on ? ` + ${on}` : ''} vs ${sides.source.file || sides.source.dir}`}`);
  const t0 = Date.now();
  let m;
  try {
    m = await measureGain({ aOverlays: baseOv, bOverlays: calibrateMode ? baseOv : [sides.pb.dest], scenarios: [sc], o, runDir, log: (s) => console.log(s), gateTimeout });
  } finally { lock.release(); }
  const { series, hostRange, fmtHost, calibrationPower } = await import('./lib/bench-gain.mjs');
  const ser = series(m.runs, sc.key, sc.metric);
  const range = hostRange(ser.hosts);
  const cur = { toolsSha: toolsSha(), chromeMajor: chromeMajor(m.chrome), setting: setting(o.timeDomain, o.cpu) };
  const res = readResults(t);
  const bTag = baselineFlag();
  // T8+ (I-033): display / wake per run (side = arm, pair = run); a change within a run, between runs or between the
  // sides tags every verdict HOST-DISPLAY-CHANGED, refuses calibration and authoring and exits 3, like a BASELINE-* tag
  // ts-lock-bundle (c), review-host-state N2: a gain is judged against the stored calibration's floor, so that A/A's
  // runs (sides calibration-A / calibration-B) count too: a floor measured in another display / wake state than the
  // gain tags the verdict (as reconfirm's own A/A does, B2). Calibrations from before T8+ carry no power: not counted.
  const calibRuns = calibrateMode ? [] : calibrationPower(res.calibration);
  const hostState = hostStateSummary([...calibRuns, ...m.runs.filter((r) => r.scenarios[sc.key]).map((r) => ({ label: r.side, run: r.pair, power: r.host.power }))]);
  const hTag = hostState.tag;
  const vTag = [bTag, hTag].filter(Boolean).join(': ') || null;
  console.log(describeHostState(hostState));
  const base = { at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), git: { branch: git('rev-parse', '--abbrev-ref', 'HEAD'), head: git('rev-parse', '--short', 'HEAD') }, ...cur, chrome: m.chrome, baselineManifest: baselineManifest(), baselineSnapshot: snapMeta(bTag), baseline: BASE_NAME + (on ? ` + ${on}` : ''), on, patch: calibrateMode ? null : sides.source, scenario: sc.key, metric: sc.metric, direction: sc.direction, runsPerSide: o.runs, cpu: o.cpu, timeDomain: o.timeDomain, host: range, hostState, chromeProfile: m.chromeProfile, values: { baseline: ser.a, patched: ser.b }, ...(ser.errors.length ? { errors: ser.errors } : {}) };
  if (ser.errors.length || ser.a.length < o.runs || ser.b.length < o.runs) {
    console.log(`${what.toUpperCase()} INCONCLUSIVE ${t}: scenario errors: ${[...new Set(ser.errors)].join('; ') || 'missing runs'}`);
    return 3;
  }
  if (calibrateMode) {
    const band = hostBand(ser.hosts);
    const fl = floors(m.runs, sc.key);
    const rec = { ...base, band, minEffect: fl[sc.metric].minEffect, floors: fl, runs: compactRuns(m.runs, sc.key) };
    if (bTag) {
      res.calibrationRefused = { ...rec, refused: bTag };
      writeResults(t, res);
      console.log(`CALIBRATION REFUSED ${t}: ${bTag}: not measured on the pinned snapshot ${BASELINE.snapshot ?? ''} throughout; floors come only from the committed snapshot.`);
      return 3;
    }
    if (hTag) {
      res.calibrationRefused = { ...rec, refused: hTag };
      writeResults(t, res);
      console.log(`CALIBRATION REFUSED ${t}: ${hTag}: ${hostState.reasons.join('; ')}; floors come only from runs in one display / wake state.`);
      return 3;
    }
    if (band !== 'clean') {
      res.calibrationRefused = rec;
      writeResults(t, res);
      console.log(`CALIBRATION REFUSED ${t}: the host was ${band} (${fmtHost(range)}); floors come only from clean runs under the warn line. Re-run on a quiet host.`);
      return 3;
    }
    res.calibration = rec;
    delete res.calibrationRefused;
    const f = writeResults(t, res);
    console.log(`CALIBRATED ${t} ${sc.metric}: minEffect ${fmt(rec.minEffect)} (A/A shift ${fmt(fl[sc.metric].shift)}, CI [${fl[sc.metric].ci.map(fmt).join(', ')}]) (${fmtHost(range)}) -> ${relative(REPO, f)}`);
    console.log(`  relative spread per metric (Q3: pick the smallest): ${GAIN_METRICS.map((k) => `${k} ${fl[k].relSpread ?? '-'}`).join(', ')}`);
    return 0;
  }
  const calib = res.calibration ? { ...res.calibration, setting: res.calibration.setting } : null;
  let line, verdict, rec;
  if (exp) {
    const r = experimentOutcome({ a: ser.a, b: ser.b, dir: sc.direction, calibration: calib, current: cur, hosts: ser.hosts });
    verdict = r.outcome === 'inconclusive' ? 'INCONCLUSIVE' : r.outcome === exp.expect.gain ? 'PASS' : 'MISMATCH';
    rec = { ...base, expected: exp.expect.gain, outcome: r.outcome, verdict: flagged(vTag, verdict), reason: r.reason, p: r.p, pWorse: r.pWorse, shift: r.shift, ci: r.ci, minEffect: r.minEffect, band: r.band, runs: compactRuns(m.runs, sc.key) };
    res.experiments ||= {}; res.experiments[expId] ||= {}; res.experiments[expId].gain = rec;
    line = `GAIN ${flagged(vTag, verdict)} ${t} ${expId}: expected ${exp.expect.gain}, observed ${r.outcome}${r.shift != null ? ` (HL shift ${fmt(r.shift)} [${fmt(r.ci?.lo)}, ${fmt(r.ci?.hi)}], p ${fmt(r.p)}, minEffect ${fmt(r.minEffect)})` : ` (${r.reason})`} (${fmtHost(range)})`;
  } else {
    const authored = on ? null : res.authored || null;
    const v = gainVerdict({ a: ser.a, b: ser.b, dir: sc.direction, calibration: calib, current: cur, authored, hosts: ser.hosts });
    verdict = v.verdict;
    rec = { ...base, verdict: flagged(vTag, verdict), reason: v.reason, p: v.p, pWorse: v.pWorse, u: v.u, shift: v.shift, ci: v.ci, budget: v.budget, minEffect: v.minEffect, band: v.band, runs: compactRuns(m.runs, sc.key) };
    if (on) { res.gainOn ||= {}; res.gainOn[on] = rec; } else res.gain = rec;
    let note = '';
    if (!on && !authored && sides.source.kind === 'committed') {
      if (verdict === 'HOLDS' && vTag) note = ` [not authored: ${vTag}]`;
      else if (verdict === 'HOLDS' && v.band === 'clean') { res.authored = { at: rec.at, shift: v.shift, ci: v.ci, p: v.p, toolsSha: cur.toolsSha, chromeMajor: cur.chromeMajor, setting: cur.setting, metric: sc.metric, patchSha256: sides.source.sha256 }; note = ' [authored: later runs must keep >= half of this shift]'; }
      else if (verdict === 'HOLDS') note = ` [not authored: ${v.band} host; author on a quiet host]`;
    }
    line = `GAIN ${flagged(vTag, verdict)} ${t} ${sc.metric}${v.shift != null ? `: HL shift ${fmt(v.shift)} [${fmt(v.ci?.lo)}, ${fmt(v.ci?.hi)}], p ${fmt(v.p)}, budget ${fmt(v.budget)} (minEffect ${fmt(v.minEffect)})` : ''} (${v.band === 'warn' ? 'WARN band, ' : ''}${fmtHost(range)})${v.verdict !== 'HOLDS' ? `: ${v.reason}` : ''}${note}`;
  }
  const f = writeResults(t, res);
  console.log(`${line} -> ${relative(REPO, f)}`);
  const gc = GAIN_EXIT[verdict] ?? 1;
  return vTag && gc === 0 ? 3 : gc;
}

// ---- reconfirm: the landed set, one hold for Tier A + one per --gain topic --------------------------------
async function cmdReconfirm() {
  if (!existsSync(BASE)) die(`baseline ${BASE} not found (FW_MIRROR_HOME?)`, 1);
  const ref = opt('ref', 'main');
  const sha = gitRev(REPO, ref);
  if (!sha) die(`no ref ${ref}`);
  const gainArg = opt('gain') || '';
  const withExperiments = flag('experiments');
  const o = gainArg ? gainOpts() : null;
  const repeat = Number(opt('repeat', 2));
  const topics = landedTopics(REPO, ref);
  const items = [], rows = [];
  const patches = [];
  for (const t of topics) {
    const patch = gitShow(REPO, ref, `fixes/${t}/patch.diff`);
    patches.push({ name: t, text: patch });
    const txt = gitShow(REPO, ref, `fixes/${t}/bench.json`);
    if (txt == null) { rows.push({ topic: t, A: 'MISSING', B: '-', note: 'no bench.json (Definition of done item 8: bench-author)' }); continue; }
    let spec;
    try { spec = JSON.parse(txt); } catch (e) { rows.push({ topic: t, A: 'LINT', B: '-', note: e.message }); continue; }
    const l = lintSpec(spec, { topic: t, hasFile: (rel) => gitShow(REPO, ref, `fixes/${t}/${rel}`) != null });
    if (l.errors.length) { rows.push({ topic: t, A: 'LINT', B: '-', note: l.errors[0] }); continue; }
    if (spec.status === 'superseded') { rows.push({ topic: t, A: 'SUPERSEDED', B: '-', note: `by ${spec.supersededBy}` }); continue; }
    const results = (() => { try { return JSON.parse(gitShow(REPO, ref, `fixes/${t}/bench-results.json`) || 'null'); } catch { return null; } })();
    items.push({ topic: t, spec, patch, results, drift: baselineDrift(patch, BASE).length > 0 });
  }
  const gainSet = gainArg === 'all' ? items.filter((i) => i.spec.gain && (i.spec.gain.device ?? 'chrome') === 'chrome').map((i) => i.topic) : gainArg.split(',').filter(Boolean);
  for (const g of gainSet) if (!items.find((i) => i.topic === g)) die(`--gain ${g}: not a landed topic with a bench.json at ${ref}`);
  console.log(`bench reconfirm ${ref} (${sha}): landed ${topics.join(', ') || '(none)'}; Tier A on ${items.map((i) => i.topic).join(', ') || '(none)'}${gainSet.length ? `; Tier B on ${gainSet.join(', ')}` : ''}${withExperiments ? '; experiments' : ''}`);
  // _landed = every landed patch in landing order; a patch that no longer applies fails the run
  const lb = build('_landed', { patches, seeds: [] });
  if (lb.bad.length) {
    for (const b of lb.bad) console.log(`CONFLICT ${b.name}: ${b.error.split('\n')[0]}`);
    console.log(`RECONFIRM FAIL: ${lb.bad.length} landed patch(es) no longer apply on top of the earlier ones (landing order)`);
    return 1;
  }
  const outDir = join(OUT, 'reconfirm', sha);
  mkdirSync(outDir, { recursive: true });
  const owner = opt('owner', process.env.FW_LOCK_OWNER || 'bench-reconfirm');
  const report = { ref, sha, at: new Date().toISOString(), toolsSha: toolsSha(), baselineManifest: baselineManifest(), baselineSnapshot: baselineMeta(BASELINE), landed: topics, tierA: {}, tierB: {}, experiments: {}, holds: [] };
  const t0 = Date.now();
  // one normal hold for Tier A (+ experiments), then one per --gain topic (I-020: holds <= 10 min, short
  // jobs get in at every hand-over)
  if (items.length) {
    const lock = await takeLock(owner, { short: false, meta: { cmd: 'bench reconfirm tier A', ref, sha } });
    report.holds.push({ what: 'tier A', gateTimeout: !!lock.holder?.gateTimeout, expectSec: lock.holder?.meta?.expectSec ?? null });
    try {
    // Tier A: one merged session per (side, viewport), baseline = site-pretty, patched = _landed
    {
      const plans = mechPlans(items, ['mobile', 'desktop']);
      const ch = await launchChrome({ port: 0, profileDir: join(REPO, 'out', 'chrome-bench-profile'), headless: true });
      try {
        const [bs, ps] = await Promise.all([startServer('baseline', [], MECH_SERVE, outDir), startServer('landed', [lb.dest], MECH_SERVE, outDir)]);
        const cdp = await CDP.connect(ch.wsUrl);
        report.chrome = await browserVersion(cdp).catch(() => null);
        const sessions = await runMech(cdp, plans, { baseline: { url: bs.url }, patched: { url: ps.url } }, repeat, (s) => console.log(s));
        for (const it of items) {
          const ev = evaluateTopic(it.topic, it.spec, sessions, { drift: it.drift });
          const vs = [...ev.checks.map((c) => c.verdict), ...ev.parity.map((p) => p.verdict)];
          const code = exitCode(vs);
          report.tierA[it.topic] = { verdict: code === 0 ? 'PASS' : code === 3 ? (vs.includes('BASELINE-CHANGED') ? 'BASELINE-CHANGED' : 'FLAKY') : 'FAIL', ...ev };
          console.log(`${it.topic}:`);
          printTopic(it.topic, ev, null);
          const fin = (it.spec.experiments || []).find((x) => x.variant === 'final');
          if (fin && (fin.expect.mech || fin.expect.parity)) report.experiments[fin.id] = { mech: experimentVerdict(fin.expect, ev.checks, ev.parity) };
        }
        // experiment rows with a variant diff: each on its own overlay (site-pretty + variant), Tier A only
        if (withExperiments) {
          for (const it of items) for (const x of it.spec.experiments || []) {
            if (x.variant === 'final' || (!x.expect.mech && !x.expect.parity)) continue;
            const text = gitShow(REPO, ref, `fixes/${it.topic}/${x.variant}`);
            const h = patchHeader(text);
            if (h.stackedOn) { report.experiments[x.id] = { mech: { verdict: 'SKIPPED', note: `stacked on ${h.stackedOn}: run bench mech --experiment ${x.id} --on ${h.stackedOn}` } }; continue; }
            const vb = build(`_exp-${x.id.replace('/', '-')}`, { patches: [{ name: x.id, text }], seeds: [] });
            if (vb.bad.length) { report.experiments[x.id] = { mech: { verdict: baselineDrift(text, BASE).length ? 'BASELINE-CHANGED' : 'CONFLICT', note: vb.bad[0].error } }; continue; }
            const vs = await startServer(`exp-${x.id.replace('/', '-')}`, [vb.dest], MECH_SERVE, outDir);
            const sess = await runMech(cdp, mechPlans([{ topic: it.topic, spec: it.spec }], ['mobile', 'desktop']), { baseline: { url: bs.url }, patched: { url: vs.url } }, repeat, (s) => console.log(s));
            try { vs.proc.kill(); } catch {}
            const ev = evaluateTopic(it.topic, it.spec, sess, {});
            const e = experimentVerdict(x.expect, ev.checks, ev.parity);
            report.experiments[x.id] = { mech: { ...e, checks: ev.checks, parity: ev.parity } };
            console.log(`experiment ${x.id}: ${e.verdict}`);
            for (const r of e.rows) console.log(`  ${r.id}: expected ${r.expected}, observed ${r.observed}: ${r.match}`);
          }
        }
        cdp.close();
      } finally { await ch.close(); killChildren(); }
    }
    } finally { lock.release(); }
  }
  // Tier B: per --gain topic, its own normal hold: an A/A first when its floor is missing or stale, then
  // baseline vs _landed, one page per run
  if (gainSet.length) {
    const { series, hostRange, fmtHost, calibrationPower } = await import('./lib/bench-gain.mjs');
    const cur0 = { toolsSha: report.toolsSha, setting: setting(o.timeDomain, o.cpu) };
    const fresh = (i) => i.results?.calibration && i.results.calibration.toolsSha === cur0.toolsSha && i.results.calibration.setting === cur0.setting && i.results.calibration.chromeMajor === chromeMajor(report.chrome) && i.results.calibration.band === 'clean';
    for (const i of items.filter((x) => gainSet.includes(x.topic))) {
      const sc = gainScenario(i.topic, i.spec);
      const lock = await takeLock(owner, { short: false, meta: { cmd: 'bench reconfirm tier B', ref, sha, topic: i.topic } });
      const gateTimeout = !!lock.holder?.gateTimeout;
      report.holds.push({ what: `tier B ${i.topic}`, gateTimeout, expectSec: lock.holder?.meta?.expectSec ?? null });
      let floor = null, m, aaRuns = [];
      try {
        if (!fresh(i)) {
          console.log(`A/A first: the calibration of ${i.topic} is missing or stale (toolsSha ${cur0.toolsSha}, ${cur0.setting})`);
          const aa = await measureGain({ aOverlays: [], bOverlays: [], scenarios: [sc], o, runDir: join(outDir, 'aa', i.topic), log: (s) => console.log(s), gateTimeout });
          aaRuns = aa.runs;
          const ser = series(aa.runs, sc.key, sc.metric);
          let minEffect = null;
          try { minEffect = calibrateStats(ser.a, ser.b).minEffect; } catch {}
          floor = { minEffect, band: hostBand(ser.hosts), toolsSha: cur0.toolsSha, chromeMajor: chromeMajor(aa.chrome), setting: cur0.setting, host: hostRange(ser.hosts), source: 'reconfirm A/A' };
        }
        m = await measureGain({ aOverlays: [], bOverlays: [lb.dest], scenarios: [sc], o, runDir: join(outDir, 'gain', i.topic), log: (s) => console.log(s), gateTimeout });
      } finally { lock.release(); }
      const cur = { ...cur0, chromeMajor: chromeMajor(m.chrome) };
      const ser = series(m.runs, sc.key, sc.metric);
      const calibration = floor || i.results.calibration;
      const v = ser.errors.length ? { verdict: 'INCONCLUSIVE', reason: `scenario errors: ${[...new Set(ser.errors)].join('; ')}` } : gainVerdict({ a: ser.a, b: ser.b, dir: sc.direction, calibration, current: cur, authored: i.results?.authored || null, hosts: ser.hosts });
      // T8+ (I-033): the display / wake state over the floor's A/A (sides aa-A, aa-B) and the gain runs: a change inside either,
      // or a floor measured in another state than the gain (review-host-state B2), tags this topic's line and the reconfirm
      const powerOf = (runs, pre) => runs.filter((r) => r.scenarios[sc.key]).map((r) => ({ label: pre + r.side, run: r.pair, power: r.host.power }));
      // ... and when the floor is the stored calibration (no A/A here), that calibration's runs (N2, ts-lock-bundle (c))
      const hostState = hostStateSummary([...(floor ? powerOf(aaRuns, 'aa-') : calibrationPower(i.results?.calibration)), ...powerOf(m.runs, '')]);
      report.tierB[i.topic] = { ...v, metric: sc.metric, values: { baseline: ser.a, patched: ser.b }, host: hostRange(ser.hosts), hostState, calibration: floor ? 'reconfirm A/A' : 'bench-results.json' };
      console.log(describeHostState(hostState));
      console.log(`GAIN ${flagged(hostState.tag, v.verdict)} ${i.topic} ${sc.metric}${v.shift != null ? `: HL shift ${fmt(v.shift)} [${fmt(v.ci?.lo)}, ${fmt(v.ci?.hi)}], p ${fmt(v.p)}, budget ${fmt(v.budget)}` : ''} (${fmtHost(hostRange(ser.hosts))})${v.verdict !== 'HOLDS' ? `: ${v.reason}` : ''}`);
    }
  }
  report.seconds = Math.round((Date.now() - t0) / 1000);
  const bTag = baselineFlag();
  if (bTag) report.baselineSnapshot = snapMeta(bTag);
  const hTag = Object.values(report.tierB).find((x) => x.hostState?.tag)?.hostState.tag ?? null;
  const vTag = [bTag, hTag].filter(Boolean).join(': ') || null;
  for (const it of items) rows.push({ topic: it.topic, A: report.tierA[it.topic]?.verdict ?? '-', B: report.tierB[it.topic]?.verdict ?? (it.spec.gain && (it.spec.gain.device ?? 'chrome') === 'iphone' ? 'iphone (skipped)' : '-'), note: report.tierB[it.topic]?.host ? `${report.tierB[it.topic].hostState?.tag ? `${report.tierB[it.topic].hostState.tag}: ${report.tierB[it.topic].hostState.reasons.join('; ')}; ` : ''}load1 ${report.tierB[it.topic].host.load1Min}-${report.tierB[it.topic].host.load1Max}, other CPU <= ${report.tierB[it.topic].host.otherBusyMax} %` : '' });
  rows.sort((x, y) => topics.indexOf(x.topic) - topics.indexOf(y.topic));
  report.rows = rows;
  const md = [`# bench reconfirm ${ref} ${sha}`, '', `${report.at}, ${report.seconds} s, toolsSha ${report.toolsSha}, ${report.chrome || ''}`, '', ...(bTag ? [`**${bTag}: not measured on the pinned snapshot ${BASELINE.snapshot ?? ''} throughout; every verdict below is invalid**`, ''] : []), '| topic | Tier A | Tier B | note |', '|---|---|---|---|', ...rows.map((r) => `| ${r.topic} | ${r.A} | ${r.B} | ${r.note || ''} |`), ...(Object.keys(report.experiments).length ? ['', '| experiment | Tier A |', '|---|---|', ...Object.entries(report.experiments).map(([id, e]) => `| ${id} | ${e.mech?.verdict ?? '-'} |`)] : [])].join('\n') + '\n';
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  writeFileSync(join(outDir, 'report.md'), md);
  console.log('\n' + md);
  const aVs = Object.values(report.tierA).map((x) => x.verdict), bVs = Object.values(report.tierB).map((x) => x.verdict), eVs = Object.values(report.experiments).map((x) => x.mech?.verdict).filter((v) => v && v !== 'SKIPPED');
  const code = Math.max(...[exitCode([...aVs, ...eVs.map((v) => (v === 'CONFLICT' ? 'FAIL' : v))]), ...bVs.map((v) => GAIN_EXIT[v] ?? 1)].map((c) => (c === 1 ? 10 : c)), 0);
  const exit0 = code === 10 ? 1 : code;
  const exit = vTag && exit0 === 0 ? 3 : exit0;
  console.log(`RECONFIRM ${flagged(vTag, exit0 === 0 ? 'PASS' : exit0 === 1 ? 'FAIL' : 'INCONCLUSIVE')} ${ref} ${sha} -> ${relative(REPO, join(outDir, 'report.md'))}`);
  return exit;
}

const cmds = { lint: () => cmdLint(args), mech: () => cmdMech(args[0]), gain: () => cmdGain(args[0]), calibrate: () => cmdGain(args[0], { calibrateMode: true }), reconfirm: () => cmdReconfirm() };
if (!cmd || !cmds[cmd]) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(cmd ? 2 : 0);
}
if (cmd !== 'lint' && stubOutsideTest()) {
  // review-i027 (as verify.mjs): a stubbed host would put fake waits and host records under a real Chrome's numbers
  console.error(`bench: a stubbed host (FW_TEST_HOST=${process.env.FW_TEST_HOST}) outside a test, with a real Chrome: refused; unset FW_TEST_HOST to measure`);
  process.exit(2);
}
// the committed snapshot pinned by baseline.json, unchanged (tools/lib/baseline.mjs): checked before any
// measurement command; bench-results.json / report.json record it as baselineSnapshot (metadata only)
if (cmd !== 'lint') BASELINE = requireBaseline('bench.mjs');
Promise.resolve(cmds[cmd]()).then((c) => process.exit(c ?? 0), (e) => { console.error(e.stack || e); process.exit(1); });
