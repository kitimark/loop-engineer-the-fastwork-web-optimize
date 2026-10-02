// `node tools/iphone.mjs run --driver scroll|window|morph --probe std --owner <o>`: one scripted iPhone run with the
// standard probe (measurement protocol v2 T1a; research/architecture/measurement-protocol-v2.md §5.4-5.5). The
// in-page code and the pure post-processing live in tools/lib/iphone-probe.mjs; this file is the WIP orchestration.
//
// Sequence (every driver): lease check, then the lease is renewed to outlast the run (lock.mjs renew); no timed
// run while someone else's NORMAL chrome-measure hold holds it (`WAIT`, checked again after the settle; exclusive
// short-lane holds and the runner's own hold, --no-timing included, pass; a SHARED group passes with a NOTE line and the
// Mac state in meta.mac, unless --require-quiet or FW_PHONE_REQUIRE_QUIET=1: then it waits too; I-056;
// --allow-during-measure for diagnostics); Safari not on the certificate warning; scrollTo(0, instant) + reload;
// the probe options (--y-source raf|raf-legacy|scroll|none) and a load-frame logger (`early`) from the reconnect; readyState
// complete; the battery (idevicediagnostics AppleSmartBattery: temperature, charging, capacity; --no-battery);
// settle (--settle, default 8 s); then ONE in-page expression: page facts, stateAtStart (+ --state), --tops, the
// std probe, the driver, stop, Resource Timing. The page is polled at <= 1 Hz (1.5 s) and the result read back in
// chunks; then the battery again, and the same-origin scripts/stylesheets the page loaded are fetched again from
// the Mac and hashed (meta.served).
//   S scroll : the `iphone.mjs scroll` stimulus: idle (--idle 3 s), scrollBy 250 px smooth every 300 ms to the
//              bottom, bottom hold (--bottom 3 s). Phases idle, scroll, bottom.
//   W window : [--from Y0: instant jump, 1 s] idle (--idle 3 s), the same steps until y >= --to Y, hold (--hold 2 s),
//              then the sentinel (§5.2): instant jump to the bottom and hold (--sentinel 3 s; 0 = none).
//              Phases idle, scroll, hold, sentinel.
//   M morph  : the build's window.__fwMorphDrive({hold: --hold 2000 ms, cycles: --cycles 3}); its own summaries
//              (moving / atOne / atZero) are kept as driverResult. Phase drive.
// Output: out/iphone/<owner>-run-<label>-<ts>.json (or --out), schema fw-iphone-run/1: meta (driver, labels, block
// fields for T2/T3, wall clock + page clock mapping (U7), settings fingerprint with 'unknown' for what a page
// cannot read (U9), served hashes, tool hashes), fields, frames, marks, mutations, crossings, tops, summary, driverResult, pre, post.
// A run that failed in the page (driver error) is still written, with meta.error, and exits 1.
// Heat sentinel (protocol v2 §5.2, CLAUDE.md "Phone blocks"; incident I-047): a control run (--arm C, not --warmup) or
// any run with --heat-sentinel gets meta.sentinel {driver, criterion, value, pass} next to meta.battery (S/W: bottom
// >= 58 fps and scroll >= 44 fps, W's bottom = its sentinel phase; M: held m=1 p95 <= 18 ms; pass null when the run
// has no such data), else meta.sentinel null. `wait.mjs phone-temp --below auto` reads it back.
// Park (I-047): once the page was reloaded, the run ends with Safari on about:blank (wip.mjs parkSafari), also after
// a failure, so an animating test page does not keep heating the phone; --no-park keeps the page. The next run on
// the phone needs `iphone.mjs open <url>` first. The Simulator target never parks.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openTab, safariTab, sleep, parkSafari, isBlankUrl } from './wip.mjs';
import { status as lockStatus, phoneGuard, phoneMacRecord } from './lock.mjs';
import { REPO } from './paths.mjs';
import { iphoneTarget, mirrorInfo, CERT_WARNING_TITLE, lanSafeUrl, LAN_HOST } from './iphone-url.mjs';
import { SCHEMA, DRIVERS, DRIVER_JS, PROBE_STD_JS, PRE_JS, STATE_START_JS, EARLY_JS, RESOURCES_JS, RESOURCE_TIMING_JS, Y_SOURCES, yReadsLabel, optsJs, startJs, STATE_JS, RESULT_LEN_JS, CHUNK, resultChunkJs, buildDoc } from './iphone-probe.mjs';

export const DEVICE = 'iPhone 15 Pro Max, iOS 26.6.1 Safari';
/** Files whose code shapes a run's stimulus and numbers: recorded per run (meta.tool), like `gesture`'s. */
export const TOOL_FILES = ['tools/iphone.mjs', 'tools/lib/iphone-run.mjs', 'tools/lib/iphone-probe.mjs', 'tools/lib/wip.mjs'];
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export function toolVersion(driver, root = REPO, toolFiles = TOOL_FILES) {
  const git = (...a) => { const r = spawnSync('git', ['-C', root, ...a], { encoding: 'utf8', timeout: 10000 }); return r.status === 0 ? r.stdout.trim() : null; };
  const files = {};
  for (const f of toolFiles) { try { files[f] = sha16(readFileSync(join(root, f))); } catch { files[f] = null; } }
  const st = git('status', '--porcelain', '--', ...toolFiles);
  return { gitHead: git('rev-parse', 'HEAD'), dirty: st === null ? null : st.length > 0, files, probe: sha16(PROBE_STD_JS + PRE_JS + STATE_START_JS + EARLY_JS + RESOURCE_TIMING_JS + startJs.toString()), driver: sha16(DRIVER_JS[driver]) };
}

export const USAGE = `usage: node tools/iphone.mjs run --driver scroll|window|morph --probe std --owner <topic> [--label l] [--out file]
    [--build <name>] [--run <id>] [--block <id>] [--arm C|V|A|B] [--pos n] [--warmup]
    [--settle 8] [--idle 3] [--bottom 3]                    scroll (S)
    --to <y> [--from 0] [--idle 3] [--hold 2] [--sentinel 3] window (W)
    [--hold 2000] [--cycles 3]                              morph (M; --hold in ms, as __fwMorphDrive takes it)
    [--tops id=selector,...]                                document tops before/after the timed window
    [--state <file.js>]                                     an expression whose value joins stateAtStart.custom
    [--y-source raf|raf-legacy|scroll|none]                 where the probe's y comes from (default raf; raf-legacy = probe v1)
    [--no-battery]                                          skip the idevicediagnostics battery read at start and end
    [--low-power on|off]                                    Low Power Mode as set on the phone (a page cannot read it;
                                                            rAF runs at 30 Hz when on); default unknown
    [--require-quiet]                                       WAIT while shared jobs (npm test, a Simulator session) hold
                                                            chrome-measure (also FW_PHONE_REQUIRE_QUIET=1); default: run
                                                            beside them, with a NOTE and the Mac state in meta.mac
    [--allow-during-measure]                                run beside someone else's chrome-measure hold (diagnostics
                                                            only; to keep the Mac quiet, run inside your own lock.mjs
                                                            run chrome-measure --no-timing hold)
    [--heat-sentinel]                                       judge the run as the heat sentinel (default for --arm C
                                                            without --warmup): meta.sentinel {driver, criterion, value, pass}
    [--no-park]                                             keep the page open after the run (default: Safari parks
                                                            on about:blank, I-047; open <url> before the next run)`;

/** Device settings that a page cannot read (U9, research/architecture/unknowns-validity.md): recorded as 'unknown'
 *  rather than left out, until a device-side reader (T2: WDA / lockdown) fills them in. */
export const UNREADABLE_SETTINGS = ['lowPowerMode', 'limitFrameRate', 'batteryPct', 'charging', 'case', 'brightness', 'autoBrightness', 'contentBlockers', 'safariFeatureFlags'];
export function deviceSettings(page, battery = null, lowPower = 'unknown') {
  const s = { ...Object.fromEntries(UNREADABLE_SETTINGS.map((k) => [k, 'unknown'])), ...(page || {}) };
  if (lowPower === 'on' || lowPower === 'off') s.lowPowerMode = lowPower === 'on'; // declared by the operator (--low-power)
  if (battery && !battery.error) {
    if (typeof battery.CurrentCapacity === 'number') s.batteryPct = battery.CurrentCapacity;
    if (typeof battery.IsCharging === 'boolean') s.charging = battery.IsCharging;
  }
  return s;
}

/** The AppleSmartBattery keys kept from `idevicediagnostics ioregentry AppleSmartBattery` (a plist): only these,
 *  never serials or other ids (Hard rule 12). Temperature is in 1/100 degC. */
export const BATTERY_KEYS = ['Temperature', 'IsCharging', 'ExternalConnected', 'FullyCharged', 'CurrentCapacity', 'MaxCapacity'];
export function parseBattery(xml) {
  const out = {};
  for (const k of BATTERY_KEYS) {
    const m = xml.match(new RegExp(`<key>${k}</key>\\s*<(integer|real|true|false)\\s*/?>(?:([^<]*)</\\1>)?`));
    if (!m) continue;
    out[k] = m[1] === 'true' ? true : m[1] === 'false' ? false : Number(m[2]);
  }
  if (!Object.keys(out).length) return { error: 'no AppleSmartBattery values in the output' };
  if (typeof out.Temperature === 'number') out.temperatureC = out.Temperature / 100;
  return out;
}
/** One battery read through libimobiledevice ($FW_IDEVICEDIAGNOSTICS names the executable, for tests). */
export function batteryInfo() {
  const bin = process.env.FW_IDEVICEDIAGNOSTICS || 'idevicediagnostics';
  const r = spawnSync(bin, ['ioregentry', 'AppleSmartBattery'], { encoding: 'utf8', timeout: 15000 });
  if (r.error) return { error: `idevicediagnostics: ${r.error.code || 'failed'}` };
  if (r.status !== 0) return { error: `idevicediagnostics exit ${r.status}` }; // no stderr: it may name the device
  return { t: new Date().toISOString(), ...parseBattery(r.stdout) };
}

/** The heat sentinel's criteria (protocol v2 §5.2; CLAUDE.md "Phone blocks"). */
export const SENTINEL = Object.freeze({ bottomFps: 58, scrollFps: 44, heldP95Ms: 18 });
/**
 * The sentinel verdict of one run: {driver, criterion, value, pass}. S and W: bottom >= 58 fps and scroll >= 44 fps
 * (S's bottom phase; W's bottom is its sentinel phase, the instant jump to the bottom and hold); M: the build's held
 * m=1 frames (driverResult.driver.atOne) p95 <= 18 ms. `pass` is null (with `note`) when the run has no such data
 * (a W run with --sentinel 0, a phase without frames, a morph without __fwMorphDrive). Pure.
 */
export function sentinelVerdict(driverName, summary, driverResult) {
  const driver = DRIVERS[driverName];
  if (driver === 'M') {
    const criterion = `held m=1 p95 <= ${SENTINEL.heldP95Ms} ms`;
    const p95 = driverResult?.driver?.atOne?.p95;
    if (typeof p95 !== 'number' || !Number.isFinite(p95)) return { driver, criterion, value: null, pass: null, note: 'no held m=1 frames (driverResult.driver.atOne)' };
    return { driver, criterion, value: p95, pass: p95 <= SENTINEL.heldP95Ms };
  }
  const bottomPhase = driver === 'W' ? 'sentinel' : 'bottom';
  const criterion = `bottom >= ${SENTINEL.bottomFps} fps and scroll >= ${SENTINEL.scrollFps} fps${driver === 'W' ? ' (bottom: the sentinel phase)' : ''}`;
  const fps = (ph) => { const v = summary?.phases?.[ph]; return v && v.frames > 0 && typeof v.fps === 'number' ? v.fps : null; };
  const value = { bottom: fps(bottomPhase), scroll: fps('scroll') };
  if (value.bottom === null || value.scroll === null) return { driver, criterion, value, pass: null, note: `no ${value.bottom === null ? bottomPhase : 'scroll'} frames` };
  return { driver, criterion, value, pass: value.bottom >= SENTINEL.bottomFps && value.scroll >= SENTINEL.scrollFps };
}

const num = (v, name, { min = 0 } = {}) => { const n = Number(v); if (!Number.isFinite(n) || n < min) throw new Error(`--${name} must be a number >= ${min} (got ${v})\n${USAGE}`); return n; };

/** argv (after `run`) -> validated options. Throws with the usage on bad input. Pure. */
export function parseRunArgs(argv) {
  const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
  const flag = (n) => argv.includes(`--${n}`);
  if (flag('help') || flag('h')) return { help: true };
  const driver = opt('driver');
  if (!DRIVERS[driver]) throw new Error(`--driver must be one of ${Object.keys(DRIVERS).join(', ')}${driver ? ` (got ${driver})` : ''}\n${USAGE}`);
  const probe = opt('probe', 'std');
  if (probe !== 'std') throw new Error(`--probe must be std (got ${probe})\n${USAGE}`);
  const o = { driver, probe, label: opt('label', 'run'), out: opt('out'), settleMs: 1000 * num(opt('settle', 8), 'settle') };
  o.labels = { build: opt('build', null), run: opt('run', null), block: opt('block', null), arm: opt('arm', null), pos: opt('pos') === undefined ? null : num(opt('pos'), 'pos'), warmup: flag('warmup') };
  if (o.labels.arm !== null && !/^[A-Z]$/.test(o.labels.arm)) throw new Error(`--arm is one letter (C, V, A, B, ...), got ${o.labels.arm}`);
  o.stateFile = opt('state') ?? null;
  o.allowDuringMeasure = flag('allow-during-measure');
  o.requireQuiet = flag('require-quiet');
  o.sentinel = flag('heat-sentinel') || (o.labels.arm === 'C' && !o.labels.warmup);
  o.park = !flag('no-park');
  o.battery = !flag('no-battery');
  o.lowPower = opt('low-power', 'unknown');
  if (!['on', 'off', 'unknown'].includes(o.lowPower)) throw new Error(`--low-power must be on or off (got ${o.lowPower})\n${USAGE}`);
  const ySource = opt('y-source', 'raf');
  if (!Y_SOURCES.includes(ySource)) throw new Error(`--y-source must be one of ${Y_SOURCES.join(', ')} (got ${ySource})\n${USAGE}`);
  const tops = opt('tops');
  o.tops = tops ? tops.split(',').map((s) => { const i = s.indexOf('='); if (i < 1) throw new Error(`--tops wants id=selector[,id=selector...] (got ${s})`); return [s.slice(0, i), s.slice(i + 1)]; }) : [];
  const p = { tops: o.tops, ySource };
  if (driver === 'scroll') Object.assign(p, { idleMs: 1000 * num(opt('idle', 3), 'idle'), bottomMs: 1000 * num(opt('bottom', 3), 'bottom'), maxScrollMs: 45000 });
  if (driver === 'window') {
    if (opt('to') === undefined) throw new Error(`--driver window needs --to <y>\n${USAGE}`);
    Object.assign(p, { from: num(opt('from', 0), 'from'), to: num(opt('to'), 'to', { min: 1 }), settleAtMs: 1000, idleMs: 1000 * num(opt('idle', 3), 'idle'), holdMs: 1000 * num(opt('hold', 2), 'hold'), sentinelMs: 1000 * num(opt('sentinel', 3), 'sentinel'), maxScrollMs: 45000 });
  }
  if (driver === 'morph') Object.assign(p, { holdMs: num(opt('hold', 2000), 'hold'), cycles: num(opt('cycles', 3), 'cycles', { min: 1 }), maxDriveMs: 0 });
  if (driver === 'morph') p.maxDriveMs = 2 * p.cycles * p.holdMs + 30000;
  o.params = p;
  return o;
}

/** Upper bound of the in-page part (ms), for the poll timeout and the lease check. */
export function estimateMs(o) {
  const p = o.params;
  if (o.driver === 'scroll') return p.idleMs + p.maxScrollMs + p.bottomMs;
  if (o.driver === 'window') return (p.from > 0 ? p.settleAtMs : 0) + p.idleMs + p.maxScrollMs + p.holdMs + p.sentinelMs;
  return p.maxDriveMs;
}

/**
 * `target` (absent for the phone, whose path is unchanged): the Simulator's `sim.mjs run` passes {device, settings,
 * toolFiles, outDir, extra() -> more meta fields, guard() in place of measureGuard (it runs inside its own normal
 * hold), renew(needMs), start() / end() around the timed part}; no lease renewal, lease URL check or battery read.
 */
export async function runCmd({ argv, requireLease, port, target = null }) {
  const o = parseRunArgs(argv.slice(argv.indexOf('run') + 1));
  if (o.help) { console.log(USAGE); return; }
  const owner = requireLease();
  const customStateJs = o.stateFile ? readFileSync(resolve(o.stateFile), 'utf8').trim().replace(/;\s*$/, '') : null;
  if (target) o.battery = false;
  const guard = target ? target.guard : (again) => measureGuard({ ...o, owner }, undefined, undefined, { note: !again });
  await guard();
  const need = o.settleMs + estimateMs(o) + 30000 + 2500;
  if (!target) {
    // renew the lease to cover this run (iphone-runner did it before every run), through lock.mjs, which also
    // keeps the Mac awake until the new expiry
    const ttl = Math.max(900, Math.ceil(need / 1000) + 60);
    const rn = spawnSync(process.execPath, [join(REPO, 'tools', 'lock.mjs'), 'renew', 'iphone', '--owner', owner, '--ttl', String(ttl)], { encoding: 'utf8', timeout: 30000 });
    if (rn.status !== 0) throw new Error(`could not renew the iphone lease: ${(rn.stderr || rn.stdout || '').trim()}`);
  } else await target.renew?.(need);
  const tabs = await (await fetch(`http://localhost:${port}/json`, { signal: AbortSignal.timeout(4000) })).json();
  if (!target && Array.isArray(tabs) && tabs.length && tabs.every((p) => isBlankUrl(p.url))) throw new Error(`Safari shows no web page (parked after the last run or block, I-047?): node tools/iphone.mjs open <url> --owner ${owner} first`);
  const tab = safariTab(tabs); // never a blank web view of another app, never the first of several (I-037)
  if (CERT_WARNING_TITLE.test(tab.title || '')) throw new Error(`Safari shows its certificate warning ("${tab.title}") on ${tab.url}, not the page; run: node tools/iphone.mjs open <url> --owner ${owner} (incident I-003)`);
  const holder = target ? null : lockStatus('iphone').holder;
  let leaseUrl = holder?.meta?.url;
  if (leaseUrl && !tab.url.startsWith(leaseUrl)) { try { leaseUrl = iphoneTarget(leaseUrl, await mirrorInfo(leaseUrl)).url; } catch {} }
  if (leaseUrl && !tab.url.startsWith(leaseUrl)) console.error(`warning: Safari shows ${tab.url}, your lease says ${holder.meta.url} (run: node tools/iphone.mjs open ${holder.meta.url} --owner ${owner})`);

  let c = await openTab(() => true, { port });
  const host = new URL(await c.evaluate('location.href')).host;
  let reloaded = false; // from the reload on, the run ends with Safari parked (I-047), also after a failure
  try {
    await c.evaluate(`scrollTo({ top: 0, behavior: 'instant' }); setTimeout(() => location.reload(), 400); 'ok'`); // instant: html{scroll-behavior:smooth} (F-021)
    reloaded = true;
    c.close();
    await sleep(2500);
    c = await openTab(host, { port });
    await c.evaluate(optsJs(o.params)).catch(() => {});
    await c.evaluate(EARLY_JS).catch(() => {});
    for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
    const batteryStart = o.battery ? batteryInfo() : null; // before the settle: the USB query is not in the timed part
    if (target) await target.start?.();
    await sleep(o.settleMs);
    requireLease(); // still ours after the settle
    const macGuard = await guard(true); // its Mac state is the run's start (I-056)
    const macStartMs = Date.now();
    const started = await c.evaluate(startJs(o.driver, o.params, { customStateJs }));
    if (started !== 'started') throw new Error(`the run did not start in the page (${JSON.stringify(started)})`);
    const t0 = Date.now(), limit = estimateMs(o) + 30000;
    let state = null;
    while (Date.now() - t0 < limit) {
      await sleep(1500); // <= ~1 Hz Runtime.evaluate during a timed run (protocol §5.5)
      state = await c.evaluate(STATE_JS);
      if (state === 'done' || state === 'error') break;
    }
    if (state !== 'done' && state !== 'error') throw new Error(`the run did not finish in ${Math.round(limit / 1000)} s (state ${state})`);
    const len = await c.evaluate(RESULT_LEN_JS);
    let s = '';
    for (let i = 0; i < len; i += CHUNK) s += await c.evaluate(resultChunkJs(i));
    if (s.length !== len) throw new Error(`read ${s.length} of ${len} result chars`);
    const raw = JSON.parse(s);
    raw.macStartMs = macStartMs;
    raw.battery = o.battery ? { start: batteryStart, end: batteryInfo() } : null;
    raw.served = await servedHashes(await c.evaluate(RESOURCES_JS).catch(() => []));
    if (!target) raw.mac = phoneMacRecord(macGuard);
    if (target) await target.end?.();
    return finish(o, owner, raw, { target });
  } finally { c.close(); if (reloaded && o.park && !target) await parkAfterRun(port, owner); }
}

/** Park Safari after a run (I-047); a failure to park never fails the run: it says how to park by hand. */
async function parkAfterRun(port, owner) {
  try {
    const r = await parkSafari({ port });
    console.log(r.already ? 'parked: Safari shows no web page (--no-park keeps the page)' : `parked Safari on about:blank (--no-park keeps the page; open <url> before the next run)`);
  } catch (e) { console.error(`warning: could not park Safari (${e.message}); run: node tools/iphone.mjs park --owner ${owner}`); }
}

/** No timed phone run while someone else's normal chrome-measure hold holds it; short-lane holds (npm test --short,
 *  bench mech) and the runner's own hold (o.owner, or the hold FW_LOCK_HELD names) pass; shared jobs pass with a NOTE
 *  unless o.requireQuiet (--require-quiet) or FW_PHONE_REQUIRE_QUIET=1 (I-056, lib/lock.mjs phoneGuard).
 *  --allow-during-measure for diagnostics. Returns phoneGuard's {requireQuiet, allow, start} for phoneMacRecord. */
export function measureGuard(o, st = lockStatus('chrome-measure'), env = process.env, { note = true, log = console.log, load1 } = {}) {
  return phoneGuard({ owner: o.owner, allow: o.allowDuringMeasure, requireQuiet: o.requireQuiet, st, env, note, log, load1 });
}

/** sha256/16 of each same-origin script/stylesheet the page loaded, fetched again from the Mac after the run. */
export async function servedHashes(urls) {
  const out = {};
  for (const u of urls || []) {
    let key = u;
    try { key = new URL(u).pathname; const r = await fetch(u, { signal: AbortSignal.timeout(5000) }); out[key] = r.ok ? sha16(Buffer.from(await r.arrayBuffer())) : `HTTP ${r.status}`; } catch { out[key] = null; }
  }
  return out;
}

// lanSafeUrl / LAN_HOST live in iphone-url.mjs (iphone.mjs scroll and record use them too); re-exported here.
export { lanSafeUrl, LAN_HOST };
/** pre / post with their URLs through lanSafeUrl (href, Resource Timing names). */
function lanSafe(o) {
  if (!o || typeof o !== 'object') return o;
  const c = { ...o };
  if ('href' in c) c.href = lanSafeUrl(c.href);
  if (Array.isArray(c.resources)) c.resources = c.resources.map((r) => (Array.isArray(r) ? [lanSafeUrl(r[0]), ...r.slice(1)] : r));
  return c;
}

/** Raw page result -> run JSON on disk + console summary. Exported for tests. */
export function finish(o, owner, raw, { now = new Date(), target = null } = {}) {
  const doc = buildDoc(raw);
  const meta = {
    schema: SCHEMA, kind: 'run', driver: DRIVERS[o.driver], driverName: o.driver, probe: o.probe, label: o.label,
    build: o.labels.build, run: o.labels.run ?? o.label, block: o.labels.block, arm: o.labels.arm, pos: o.labels.pos, warmup: o.labels.warmup,
    owner, date: now.toISOString(), device: target?.device ?? DEVICE, href: lanSafeUrl(raw.pre?.href), ua: raw.pre?.ua, vw: raw.pre?.vw, vh0: raw.pre?.vh0, dpr: raw.pre?.dpr,
    params: { settleMs: o.settleMs, ...o.params },
    wallStartMs: raw.macStartMs ?? null, clock: raw.pre?.clock ?? null, probeVersion: raw.probeVersion ?? 1, ySource: raw.ySource ?? o.params.ySource ?? 'raf', yReads: yReadsLabel(raw.ySource ?? o.params.ySource ?? 'raf', o.driver), yReadCounts: raw.yReads ?? null, settings: target?.settings ?? deviceSettings(raw.pre?.settings, raw.battery?.start, o.lowPower),
    rafHz: doc.summary.rafHz, lowPowerSuspect: doc.summary.lowPowerSuspect, battery: raw.battery ?? null,
    sentinel: o.sentinel && !target ? sentinelVerdict(o.driver, doc.summary, raw.driverResult) : null, served: raw.served || null, tool: toolVersion(o.driver, REPO, target?.toolFiles), error: raw.err || null,
    ...(raw.mac ? { mac: raw.mac } : {}), // I-056: shared jobs and load1 on the Mac at the run's start and end
    ...(target?.extra ? target.extra() : {}),
  };
  const out = resolve(REPO, o.out || join('out', target?.outDir ?? 'iphone', `${owner}-run-${o.label}-${now.getTime()}.json`));
  const json = { meta, ...doc, tops: raw.tops, topsPost: raw.topsPost, stateAtStart: raw.stateAtStart, early: raw.early, driverResult: raw.driverResult, pre: lanSafe(raw.pre), post: lanSafe(raw.post) };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(json));
  const sm = doc.summary;
  const cnt = (v) => `>50 ${v.gt50} >34 ${v.gt34} (+-4: >46 ${v.gt46} >54 ${v.gt54} >30 ${v.gt30} >38 ${v.gt38}, near34 ${v.near34} near50 ${v.near50})`;
  const ph = Object.entries(sm.phases).map(([k, v]) => `${k} ${v.frames}fr ${v.fps} fps ${cnt(v)} max ${v.max}@${v.maxY}`).join(' | ');
  console.log(`${o.label} [${meta.driver}]: ${ph}`);
  if (sm.lowPowerSuspect && meta.settings.lowPowerMode !== true) console.log(`  warning: rAF ~${sm.rafHz} Hz (median frame): Low Power Mode on? (settings.lowPowerMode ${meta.settings.lowPowerMode}; pass --low-power on|off)`);
  for (const f of sm.slow) console.log(`  ${f.dt} ms${f.near ? ` (near ${f.near})` : ''} @y${f.yStart}->${f.yEnd} ${f.phase || '-'} rafJs ${f.rafJsMs} mut ${JSON.stringify(f.mut)} prev ${JSON.stringify(f.mutPrev)}${f.crossings.length ? ' | ' + f.crossings.join('; ') : ''}`);
  if (sm.early) console.log(`  early (load, from ${sm.early.t0nav} ms): ${sm.early.frames}fr ${cnt(sm.early)} max ${sm.early.max}${sm.early.slow.length ? ' [' + sm.early.slow.join(' ') + ']' : ''}`);
  if (raw.stateAtStart) console.log(`  at start: ${JSON.stringify(raw.stateAtStart)}; animations ${JSON.stringify(raw.pre?.anims)}`);
  for (const t of sm.tweens || []) console.log(`  tween from m=${t.from}: first dts ${t.dts.join(' ')}`);
  console.log(`  mutations ${JSON.stringify(sm.mutationTotals)}; crossings ${sm.crossings}; probe max ${sm.probeMsMax} ms, frames with probe > 1 ms: ${sm.framesProbeOver1ms}`);
  if (meta.sentinel) console.log(`  heat sentinel [${meta.sentinel.driver}]: ${meta.sentinel.pass === null ? `NOT JUDGED (${meta.sentinel.note})` : meta.sentinel.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(meta.sentinel.value)} (${meta.sentinel.criterion})${typeof raw.battery?.end?.temperatureC === 'number' ? `; battery ${raw.battery.end.temperatureC} °C at the end` : ''}`);
  if (raw.driverResult?.driver) { const d = raw.driverResult.driver; const f = (s) => (s ? `${s.frames}fr p50 ${s.p50} p95 ${s.p95} >50 ${s.gt50} max ${s.max}` : '-'); console.log(`  morph: moving ${f(d.moving)} | atOne ${f(d.atOne)} | atZero ${f(d.atZero)}`); }
  console.log(`saved ${out}`);
  if (raw.err) throw new Error(`driver failed in the page: ${raw.err} (partial run saved: ${out})`);
  return out;
}
