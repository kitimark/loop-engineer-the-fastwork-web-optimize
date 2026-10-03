// The Xcode iOS Simulator as a stand-in for the iPhone (research/simulator/README.md §7, spec by arch-sim): one
// device `fw-sim 15 Pro Max`, booted and shut down by `tools/sim.mjs session` inside the caller's own NORMAL
// chrome-measure hold (the Simulator is host CPU and GPU: Hard rule 7), Mobile Safari inspected through a SECOND
// ios_webkit_debug_proxy on :9231 (device list) / :9232 (tabs), never the phone's :9221 / :9222.
//
// Privacy and the phone (Hard rules 9 and 12; the lead's requirements):
//   - iwdp cannot name the Simulator on its command line (port_config.c accepts ids matching [a-fA-F0-9-]{25,},
//     `*` or `null`, README §5.0), so the proxy gets a config FILE in the shared state dir
//     (.git/fastwork-mirror/sim/iwdp.cfg, mode 600, never committed, never printed): `null:<list port>`, then
//     `<udid>:-1` for EVERY device `idevice_id -l` (USB) or `-n` (network) lists (a port of -1 makes iwdp ignore that device before any
//     attach: ios_webkit_debug_proxy.c iwdp_listen), then `:<tabs port>`, which the Simulator (fixed id
//     SIMULATOR, attached over the launchd_sim webinspectord socket) takes. Phone UDIDs appear nowhere else: not
//     in argv (the file path is), logs, JSON or errors (scrub()).
//   - After start, and again before every timed run, GET :<list port>/json must list exactly one device whose
//     deviceId is SIMULATOR; anything else stops the proxy ("proxy sees a non-simulator device"), no id printed.
//   - Navigation is `simctl openurl`, never the proxy; nothing here talks to :9221/:9222, WDA :8100 or iproxy.
//   - `session` stops the proxy and WDA-sim (if it started them) and shuts the Simulator down in `finally` and on
//     SIGINT/SIGTERM/SIGHUP; it kills only pids from its own pidfiles after checking their command lines, and
//     never erases the device (Safari's first-run tip would come back). I-063: a functional session that ran its
//     command (no signal, no timing hold waiting) keeps it booted instead, Safari quit, for a keeper process to shut
//     down after FW_SIM_IDLE_SEC or on demand (tools/lib/sim-warm.mjs; warmOut, keeper, shutdownWarm below).
// Test doubles name the executables: $FW_SIMCTL (takes simctl's arguments; default `xcrun simctl`), $FW_IWDP,
// $FW_LSOF, $FW_IDEVICE_ID, $FW_XCODEBUILD, $FW_OPEN, $FW_OSASCRIPT. Ports: $FW_SIM_DEVICE_PORT (9231),
// $FW_SIM_PORT (9232), $FW_SIM_WDA_PORT (8101); the phone's 9221/9222/8100 are refused.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, openSync, closeSync, existsSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { sharedStateDir } from './paths.mjs';
import { status as lockStatus, parseHeld, staleReason, pidAlive, tryAcquire, dequeue, release as lockRelease, isGroup, slotIn, timedInSlotRefusal, SHARED_LANE } from './lock.mjs';
import { redact } from './redact.mjs';
import { idleSec, readWarm, warmFile, keeperInfo, timingDemand, warmLine, warmState, keeperRetryMs, SIM_MJS } from './sim-warm.mjs';
import * as BG from './sim-background.mjs';

// I-087 (user T-040): named devices, one at a time. `fw-sim` (the default, unchanged for every caller: config.json,
// the same name and type) stands in for the iPhone 15 Pro Max; the iPads are the real tablet case for pixel checks
// (no timing). A non-default device is created on demand (`sim.mjs setup --device k`, or its first session) from an
// installed device type on an installed iOS runtime: nothing is ever downloaded. Its config is sim/config-<key>.json.
// The device a command drives: --device, else $FW_SIM_DEVICE (a session sets it for its <cmd>), else fw-sim (sim.mjs).
export const DEVICES = Object.freeze(Object.fromEntries([
  ['fw-sim', 'fw-sim 15 Pro Max', 'iPhone-15-Pro-Max', 'iphone'],
  ['fw-ipad', 'fw-ipad Pro 13 M5', 'iPad-Pro-13-inch-M5-12GB', 'ipad'],
  ['fw-ipad-a16', 'fw-ipad A16', 'iPad-A16', 'ipad'],
  ['fw-ipad-mini', 'fw-ipad mini A17 Pro', 'iPad-mini-A17-Pro', 'ipad'],
].map(([key, name, type, family]) => [key, Object.freeze({ key, name, deviceType: `com.apple.CoreSimulator.SimDeviceType.${type}`, family })])));
export const DEFAULT_DEVICE = 'fw-sim';
export const SIM_NAME = DEVICES[DEFAULT_DEVICE].name;
export const DEVICE_TYPE = DEVICES[DEFAULT_DEVICE].deviceType;
let currentKey = DEFAULT_DEVICE;
/** The device key from a --device value / $FW_SIM_DEVICE (unset or empty: fw-sim); an unknown one throws, naming the known. */
export function deviceKey(v) {
  if (v === undefined || v === null || v === '') return DEFAULT_DEVICE;
  if (!Object.hasOwn(DEVICES, v)) throw new Error(`unknown Simulator device "${v}" (known: ${Object.keys(DEVICES).join(', ')})`);
  return v;
}
/** Make `key` the device this process drives (config, names, types); returns it. */
export function useDevice(key) { currentKey = deviceKey(key); return DEVICES[currentKey]; }
/** The device this process drives: {key, name, deviceType, family}. */
export const device = () => DEVICES[currentKey];
/** The label of a warm record's device (I-063 records before I-087 name none: fw-sim). */
export const warmLabel = (w) => (w?.device && Object.hasOwn(DEVICES, w.device) ? w.device : DEFAULT_DEVICE);
export const SIM_DEVICE = 'simulator';
export const SAFARI = 'com.apple.mobilesafari';
export const SIM_ID = 'SIMULATOR';
export const PHONE_PORTS = Object.freeze([9221, 9222, 8100]);
/** iwdp's own device-id pattern (port_config.c): an id that does not match can't be written as a -1 line. */
export const IWDP_ID = /^[A-Fa-f0-9-]{25,}$/;
export const WINDOWS = ['shown', 'hidden'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** {list, tabs, wda} ports; any of the phone's (9221, 9222, 8100) is refused. */
export function ports(env = process.env) {
  const p = { list: Number(env.FW_SIM_DEVICE_PORT || 9231), tabs: Number(env.FW_SIM_PORT || 9232), wda: Number(env.FW_SIM_WDA_PORT || 8101) };
  for (const [k, v] of Object.entries(p)) {
    if (!Number.isInteger(v) || v <= 0 || v > 65535) throw new Error(`bad simulator ${k} port ${v}`);
    if (PHONE_PORTS.includes(v)) throw new Error(`refusing simulator ${k} port ${v}: 9221/9222 (the phone's proxy) and 8100 (the phone's WDA) are the iPhone's`);
  }
  if (new Set(Object.values(p)).size !== 3) throw new Error(`simulator ports must differ (${JSON.stringify(p)})`);
  return p;
}

// ---- state (shared by every worktree: .git/fastwork-mirror/sim/) ----------------------------------------------
export const simDir = () => join(sharedStateDir(), 'sim');
const file = (n) => join(simDir(), n);
/** fw-sim keeps config.json (unchanged); every other device sim/config-<key>.json. */
export const configFile = (key = currentKey) => file(key === DEFAULT_DEVICE ? 'config.json' : `config-${deviceKey(key)}.json`);
export const iwdpCfgFile = () => file('iwdp.cfg');
export const sessionFile = () => file('session.json');
const pidFile = (name) => file(`${name}.pid.json`);
export const logFile = (name) => file(`${name}.log`);
/** I-082: the Simulator's background CPU, one JSON line per settle / window / summary, every session ({session, owner, kind}). */
export const backgroundFile = () => file('background.jsonl');
function ensureDir() { mkdirSync(simDir(), { recursive: true, mode: 0o700 }); }
const readJson = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
function writePrivate(f, text) { ensureDir(); writeFileSync(f, text, { mode: 0o600 }); chmodSync(f, 0o600); }

export const readConfig = (key = currentKey) => readJson(configFile(key), {});
export function writeConfig(c, key = currentKey) { writePrivate(configFile(key), JSON.stringify(c, null, 1)); }
/** Every device with a config file: [{key, cfg}] (fw-sim first). */
export const configuredDevices = () => Object.keys(DEVICES).map((key) => ({ key, cfg: readConfig(key) })).filter((x) => x.cfg.udid);
export const readSession = () => readJson(sessionFile(), null);
/** The session record if its process still runs, else null. */
export function liveSession() { const s = readSession(); return s && pidAlive(s.pid) ? s : null; }

// ---- privacy: no UDID leaves this machine (Hard rule 12) ------------------------------------------------------
/** Every id we know of: the Simulator's UDID (config) and the phone UDIDs in iwdp.cfg. */
export function knownIds() {
  const ids = new Set();
  for (const { cfg } of configuredDevices()) ids.add(cfg.udid);
  try { for (const l of readFileSync(iwdpCfgFile(), 'utf8').split('\n')) { const m = l.match(/^([^:]+):-1$/); if (m) ids.add(m[1]); } } catch {}
  return [...ids];
}
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Text with known ids and every id-shaped string (redact.mjs) replaced. */
export function scrub(text, ids = knownIds()) {
  if (typeof text !== 'string' || !text) return text;
  let s = text;
  for (const id of ids) if (id && id.length >= 8) s = s.replace(new RegExp(esc(id), 'gi'), '<udid>');
  return redact(s);
}
/** Whether an id is set, never any part of it. */
export const mask = (s) => (s ? 'set' : '(unset)');

// ---- executables ------------------------------------------------------------------------------------------------
const exe = (env, name) => process.env[env] || name;
/** argv for simctl: $FW_SIMCTL takes simctl's own arguments; the real one is `xcrun simctl`. */
const simctlArgv = (args) => (process.env.FW_SIMCTL ? [process.env.FW_SIMCTL, args] : ['xcrun', ['simctl', ...args]]);
export function simctl(args, { timeoutMs = 60000 } = {}) {
  const [cmd, a] = simctlArgv(args);
  const r = spawnSync(cmd, a, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}
const failText = (r) => (r.error ? r.error.code || r.error.message : `exit ${r.status}: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ')}`);

/**
 * A child in its own process group that a signal (`abort`) or the timeout stops as a whole (SIGTERM, then SIGKILL
 * after graceMs), never orphaned (like wda-runner's runGroup). `onOut(line, stream)`: each output line (stdio
 * piped), else the given stdio. Resolves {status, signal, timedOut, aborted, error}.
 */
export function runChild(cmd, args, { env = process.env, timeoutMs = 0, graceMs = 3000, abort = null, onOut = null, stdio = 'ignore' } = {}) {
  return new Promise((done) => {
    let child;
    try { child = spawn(cmd, args, { env, stdio: onOut ? ['ignore', 'pipe', 'pipe'] : stdio, detached: true }); } catch (error) { done({ status: null, signal: null, timedOut: false, aborted: false, error }); return; }
    let timedOut = false, aborted = false, hard = null, finished = false;
    const killGroup = (sig) => { try { process.kill(-child.pid, sig); } catch {} };
    const stop = () => { killGroup('SIGTERM'); if (!hard) { hard = setTimeout(() => killGroup('SIGKILL'), graceMs); hard.unref?.(); } };
    const onAbort = () => { aborted = true; stop(); };
    if (abort) { if (abort.aborted) onAbort(); else abort.addEventListener('abort', onAbort, { once: true }); }
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; stop(); }, timeoutMs) : null;
    if (onOut) {
      for (const [name, st] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
        let buf = '';
        st.setEncoding('utf8');
        st.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { onOut(buf.slice(0, i), name); buf = buf.slice(i + 1); } });
        st.on('end', () => { if (buf) onOut(buf, name); buf = ''; });
      }
    }
    const finish = (r) => { if (finished) return; finished = true; clearTimeout(timer); clearTimeout(hard); abort?.removeEventListener('abort', onAbort); done(r); };
    child.on('error', (error) => finish({ status: null, signal: null, timedOut, aborted, error }));
    child.on('close', (status, signal) => { killGroup('SIGKILL'); finish({ status, signal, timedOut, aborted, error: null }); });
  });
}
/** simctl through runChild (boot / bootstatus can take a minute: a signal must be able to stop them). */
export async function simctlAsync(args, { timeoutMs = 120000, abort } = {}) {
  const [cmd, a] = simctlArgv(args);
  let out = '';
  const r = await runChild(cmd, a, { timeoutMs, abort, onOut: (l) => { out += l + '\n'; } });
  return { ...r, stdout: out, stderr: '' };
}

// ---- the device -------------------------------------------------------------------------------------------------
/** Every simulator device: [{udid, name, state, deviceTypeIdentifier, runtimeId}]. */
export function listDevices() {
  const r = simctl(['list', '-j', 'devices']);
  if (r.status !== 0) throw new Error(`simctl list devices failed (${failText(r)})`);
  const j = JSON.parse(r.stdout);
  return Object.entries(j.devices || {}).flatMap(([runtimeId, ds]) => ds.map((d) => ({ udid: d.udid, name: d.name, state: d.state, deviceTypeIdentifier: d.deviceTypeIdentifier, isAvailable: d.isAvailable !== false, runtimeId })));
}
/** Available iOS runtimes, newest first: [{identifier, name, version, buildversion, supported}] (supported: the device type
 *  ids the runtime lists in supportedDeviceTypes, null when simctl does not say). */
export function listRuntimes() {
  const r = simctl(['list', '-j', 'runtimes']);
  if (r.status !== 0) throw new Error(`simctl list runtimes failed (${failText(r)})`);
  const vkey = (v) => String(v).split('.').map((x) => x.padStart(4, '0')).join('.');
  return (JSON.parse(r.stdout).runtimes || []).filter((x) => x.isAvailable !== false && (x.platform ? x.platform === 'iOS' : /iOS/.test(x.identifier)))
    .map((x) => ({ identifier: x.identifier, name: x.name, version: x.version, buildversion: x.buildversion, supported: Array.isArray(x.supportedDeviceTypes) ? x.supportedDeviceTypes.map((t) => t?.identifier).filter(Boolean) : null }))
    .sort((a, b) => vkey(b.version).localeCompare(vkey(a.version)));
}
/** The fw-sim device: the configured UDID if it still exists, else the first one named SIM_NAME of our type. */
export function findDevice(cfg = readConfig(), devices = listDevices()) {
  return (cfg.udid && devices.find((d) => d.udid === cfg.udid)) || devices.find((d) => d.name === device().name && d.deviceTypeIdentifier === device().deviceType) || null;
}
export function xcodeVersion() {
  const r = spawnSync(exe('FW_XCODEBUILD', 'xcodebuild'), ['-version'], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) return null;
  const v = (r.stdout.match(/^Xcode\s+(\S+)/m) || [])[1], b = (r.stdout.match(/^Build version\s+(\S+)/m) || [])[1];
  return v ? `${v}${b ? ` (${b})` : ''}` : null;
}

/**
 * `sim.mjs setup [--device k]`: create the device this process drives if absent (the newest installed iOS runtime that
 * supports its device type, or `runtime`: identifier, name or version); store its config. I-087: never downloads a
 * runtime or a device type; one that is not installed refuses.
 */
export function setup({ runtime = null, log = console.log } = {}) {
  const cfg = readConfig();
  const rts = listRuntimes();
  let dev = findDevice(cfg);
  if (!dev) {
    const type = device().deviceType;
    const fits = (x) => !x.supported || x.supported.includes(type); // a runtime that does not list its types: simctl create decides
    let rt = runtime ? rts.find((x) => [x.identifier, x.name, x.version].includes(runtime)) : rts.find(fits);
    if (!rt && !runtime && rts.length) throw new Error(`no installed iOS runtime supports ${type.split('.').pop()} (${device().key}; installed: ${rts.map((x) => x.name).join(', ')}); a runtime or device type download is the user's decision`);
    if (!rt) throw new Error(runtime ? `no installed iOS runtime "${runtime}" (installed: ${rts.map((x) => x.name).join(', ') || 'none'}); a runtime download is the user's decision` : 'no iOS Simulator runtime installed (Xcode > Settings > Components); a runtime download is the user\'s decision');
    if (!fits(rt)) throw new Error(`the iOS runtime ${rt.name} does not support ${type.split('.').pop()} (${device().key}); a runtime or device type download is the user's decision`);
    const r = simctl(['create', device().name, device().deviceType, rt.identifier]);
    if (r.status !== 0) throw new Error(`simctl create failed (${failText(r)})`);
    dev = findDevice({ udid: r.stdout.trim() });
    if (!dev) throw new Error('simctl create succeeded, but the new device is not listed');
    log(`created ${device().name} on ${rt.name}`);
  } else log(`${device().name} exists (${dev.state})`);
  const rt = rts.find((x) => x.identifier === dev.runtimeId);
  const next = { ...cfg, device: device().key, udid: dev.udid, name: dev.name, runtime: rt?.name ?? dev.runtimeId, runtimeId: dev.runtimeId, runtimeBuild: rt?.buildversion ?? null, deviceType: dev.deviceTypeIdentifier, xcode: xcodeVersion(), setupAt: new Date().toISOString() };
  writeConfig(next);
  log(`config ${configFile()}: device ${mask(next.udid)}, ${next.runtime} (${next.runtimeBuild ?? '?'}), ${next.deviceType.split('.').pop()}, Xcode ${next.xcode ?? '?'}`);
  return next;
}

// ---- the hold gate (Hard rule 7) ---------------------------------------------------------------------------------
export const holdCmd = (owner = '<you>', rest = '-- <cmd>') => `node tools/lock.mjs run chrome-measure --owner ${owner} --max-seconds 420 -- node tools/sim.mjs session --owner ${owner} ${rest}`;
// ts-lock-share (research/architecture/lock-shared-lane.md §3): a FUNCTIONAL session (no timing: does the page load,
// does a tool work) may run in a shared-lane reader slot of weight SIM_WEIGHT instead of a normal hold, so at most one
// light reader runs beside it and never an A/B. One fw-sim, so every session also holds the exclusive `simulator`
// process lock (strict FIFO, not gated): two functional sessions never race for the device.
export const SIM_LOCK = 'simulator';
export const SIM_WEIGHT = SHARED_LANE.weights.simulator;
export const functionalCmd = (owner = '<you>', rest = '-- <cmd>') => `node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds ${SHARED_LANE.maxSec} --owner ${owner} -- node tools/sim.mjs session --functional --owner ${owner} ${rest}`;
/**
 * May a Simulator boot / timed run happen now? Only inside this process's own NORMAL chrome-measure hold: the live
 * holder's token is in $FW_LOCK_HELD (set by `lock.mjs run` for its command; the test of wda-runner's buildGate).
 * A free lock, someone else's hold, or a short-lane hold (bounded jobs like npm test) is refused.
 * `functional: true` (sim.mjs session --functional) also accepts this process's live functional slot ($FW_LOCK_SHARED)
 * of weight >= SIM_WEIGHT: a shared-lane reader, or the exclusive short hold `run --shared` becomes while the lead's
 * switch is off (review-lock-share N2); the result then names the `mode` ('exclusive' | 'short' | 'shared'). Without
 * `functional`, a process inside a functional slot is refused even when it also inherits an exclusive hold (N6).
 * Returns {ok: true, endsAt} (ms epoch the hold ends, Infinity if it declared no length) or {ok: false, reason}.
 */
export function holdGate(s = lockStatus('chrome-measure'), held = process.env.FW_LOCK_HELD, { owner, now = Date.now(), what = 'a Simulator session', functional = false, sharedHeld = process.env.FW_LOCK_SHARED } = {}) {
  const h = s.holder;
  const live = h && !s.stale && !staleReason(h, now);
  const slot = live ? slotIn(h, parseHeld(sharedHeld)['chrome-measure'], now) : null;
  if (slot && !functional) return { ok: false, reason: `this process runs inside the functional (shared) slot of "${slot.owner}" ($FW_LOCK_SHARED): ${what} there must be a functional one (no timing runs):\n  ${functionalCmd(owner)}` };
  if (slot && !(slot.weight >= SIM_WEIGHT)) return { ok: false, reason: `your shared slot has weight ${slot.weight}, and ${what} needs weight ${SIM_WEIGHT} (host CPU and GPU: at most one light job beside it):\n  ${functionalCmd(owner)}` };
  if (slot && !slot.holder) return { ok: true, endsAt: Date.parse(slot.acquiredAt) + slot.maxSec * 1000, mode: 'shared' };
  if (slot) {
    // the switch-off stand-in (an exclusive short hold) or an exclusive hold a --shared job re-entered
    const ends = [h.expiresAt && Date.parse(h.expiresAt), h.short && h.maxSec > 0 && Date.parse(h.acquiredAt) + h.maxSec * 1000, !h.short && h.meta?.expectSec > 0 && Date.parse(h.acquiredAt) + h.meta.expectSec * 1000].filter((x) => Number.isFinite(x));
    return { ok: true, endsAt: ends.length ? Math.min(...ends) : Infinity, mode: h.short ? 'short' : 'exclusive' };
  }
  const mine = parseHeld(held)['chrome-measure'];
  if (live && mine && mine === h.token && !isGroup(h)) {
    if (h.short) return { ok: false, reason: `your chrome-measure hold is a short-lane job (max ${h.maxSec} s): the short lane is for bounded jobs like npm test, and ${what} is minutes of host CPU and GPU. Run it in a normal hold:\n  ${holdCmd(owner)}\n(a functional check that takes no timing runs in a shared slot instead: ${functionalCmd(owner)})` };
    const ends = [h.expiresAt && Date.parse(h.expiresAt), h.meta?.expectSec > 0 && Date.parse(h.acquiredAt) + h.meta.expectSec * 1000].filter((x) => Number.isFinite(x));
    return { ok: true, endsAt: ends.length ? Math.min(...ends) : Infinity, ...(functional ? { mode: 'exclusive' } : {}) };
  }
  const who = !live ? 'chrome-measure is free, but this process does not hold it'
    : isGroup(h) ? `chrome-measure is shared by functional readers (${(h.readers || []).map((y) => `"${y.owner}"`).join(', ')}), and ${functional ? 'none of them is this process' : 'a shared slot is no normal hold'}`
      : `chrome-measure is held by "${h.owner}"${h.short ? ' (a short-lane job)' : ''}, not by this process`;
  const how = functional ? functionalCmd(owner) : holdCmd(owner);
  return { ok: false, reason: `${who}. ${what[0].toUpperCase()}${what.slice(1)} runs only inside your own ${functional ? 'normal hold or shared reader slot' : 'normal hold'}, so no A/B runs beside it (Hard rule 7):\n  ${how}` };
}

/**
 * The exclusive `simulator` process lock (one fw-sim, one session): strict FIFO, polled here rather than through
 * lock.mjs acquire(), whose signal handlers exit at once and would skip the session's Simulator shutdown. The holder is
 * this process (stale when it dies). Gives up after waitSec (dequeued), naming the holder. Returns {release}.
 */
export async function takeSimLock(owner, { waitSec = 60, meta = {}, log = console.error, pollMs = 1000 } = {}) {
  const t0 = Date.now();
  let logged = 0;
  for (;;) {
    const res = await tryAcquire(SIM_LOCK, { owner, kind: 'process', meta });
    if (res.ok && !res.reentrant) {
      const token = res.holder.token;
      return { holder: res.holder, release: async () => { const h = lockStatus(SIM_LOCK).holder; if (h && h.token === token) await lockRelease(SIM_LOCK, { owner }); } };
    }
    if (res.ok) throw new Error(`the ${SIM_LOCK} lock is already held by "${owner}" (another session of yours): one Simulator session at a time`);
    const h = res.holder;
    if (Date.now() - t0 >= waitSec * 1000) {
      await dequeue(SIM_LOCK, owner, (w) => w.pid === process.pid);
      throw new Error(`the Simulator is busy: the ${SIM_LOCK} lock is ${h ? `held by "${h.owner}" (pid ${h.pid}, since ${h.acquiredAt})` : `being handed over to "${res.next}"`}; gave up after ${waitSec} s (one fw-sim, one session at a time)`);
    }
    if (Date.now() - logged > 15000) { log(`[lock ${SIM_LOCK}] busy${h ? `: held by "${h.owner}"` : ''}; you are #${res.position} in queue`); logged = Date.now(); }
    await new Promise((ok) => setTimeout(ok, pollMs));
  }
}

/**
 * Commands that touch the Simulator mid-session: only from inside the live session, inside its normal hold (or, for a
 * --functional session, its shared slot). `timed: true` (scroll, record, run) is refused in a functional session.
 */
export function requireSession({ owner, timed = false } = {}) {
  const s = liveSession();
  if (!s) throw new Error(`no live Simulator session. Run it inside one:\n  ${holdCmd(owner)}`);
  if (process.env.FW_SIM_SESSION !== s.id) throw new Error(`this process is not inside the live Simulator session (owner "${s.owner}"): run your command as the session's <cmd>`);
  const sk = s.device ?? DEFAULT_DEVICE; // I-087: a record before I-087 names none (fw-sim)
  if (sk !== device().key) throw new Error(`the live Simulator session drives ${sk}, not ${device().key}: drop --device (inside a session its <cmd> inherits FW_SIM_DEVICE=${sk})`);
  if (timed && s.functional) throw new Error(`refusing: this is a functional Simulator session (sim.mjs session --functional, lock mode ${s.lock?.mode ?? '?'}): it takes no timing runs (scroll, record, run), so none of its numbers is ever pooled with a measured one. Run them in a normal hold:\n  ${holdCmd(s.owner)}`);
  // N6: nothing timed inside a functional slot (FW_LOCK_SHARED), whatever else the process inherits
  const refusal = timed ? timedInSlotRefusal('this Simulator run') : null;
  if (refusal) throw new Error(refusal);
  // a no-timing hold (ts-lock-bundle) skipped the host gate: no timed run on a host nobody checked was quiet
  const ch = timed ? lockStatus('chrome-measure').holder : null;
  if (ch?.noTiming && parseHeld(process.env.FW_LOCK_HELD)['chrome-measure'] === ch.token) throw new Error(`refusing: your chrome-measure hold is a no-timing hold (lock.mjs run --no-timing: no host gate), and scroll, record and run are timing. Run them in a normal hold:\n  ${holdCmd(s.owner)}`);
  const g = holdGate(undefined, undefined, { owner: s.owner, what: 'a Simulator run', functional: !!s.functional });
  if (!g.ok) throw new Error(`refusing: ${g.reason}`);
  return s;
}

// ---- pidfiles (only our own processes are ever killed) -------------------------------------------------------------
function readPid(name) {
  const j = readJson(pidFile(name), null);
  return j ? (pidAlive(j.pid) ? j : { ...j, dead: true }) : null;
}
/** Is rec's pid still the process we started (its command line contains rec.match), not a reused pid? */
export function isOurs(rec) {
  if (!rec || rec.dead || !rec.match) return false;
  const r = spawnSync('ps', ['-o', 'command=', '-p', String(rec.pid)], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.includes(rec.match);
}
export function startDetached(name, cmd, args, { match, owner, env = process.env, session = null }) {
  ensureDir();
  const log = logFile(name);
  const fd = openSync(log, 'a', 0o600);
  const p = spawn(cmd, args, { detached: true, stdio: ['ignore', fd, fd], env });
  closeSync(fd);
  try { chmodSync(log, 0o600); } catch {}
  p.unref();
  const rec = { pid: p.pid, name, cmd: scrub([cmd, ...args].join(' ')), match, owner, session, startedAt: new Date().toISOString() };
  writePrivate(pidFile(name), JSON.stringify(rec, null, 1));
  return rec;
}
export async function stopOne(name, log = () => {}) {
  const rec = readPid(name);
  if (!rec) return false;
  if (isOurs(rec)) {
    try { process.kill(-rec.pid, 'SIGTERM'); } catch { try { process.kill(rec.pid, 'SIGTERM'); } catch {} }
    for (let i = 0; i < 50 && pidAlive(rec.pid); i++) await sleep(100);
    if (pidAlive(rec.pid)) { try { process.kill(-rec.pid, 'SIGKILL'); } catch { try { process.kill(rec.pid, 'SIGKILL'); } catch {} } }
    log(`stopped ${name} (pid ${rec.pid})`);
  } else log(`${name}: pid ${rec.pid} is gone or no longer ours; removing its pidfile (nothing killed)`);
  rmSync(pidFile(name), { force: true });
  return true;
}
export const pidInfo = (name) => { const r = readPid(name); return r ? { ...r, ours: isOurs(r) } : null; };
export const logTail = (name, n = 12) => { try { return scrub(readFileSync(logFile(name), 'utf8').trim().split('\n').slice(-n).join('\n')); } catch { return '(no log)'; } };

// ---- the inspector proxy -----------------------------------------------------------------------------------------
/** The webinspectord_sim socket(s) in `lsof -aUc launchd_sim -Fn` output (field n), deduplicated. */
export function parseLsofSockets(text) {
  return [...new Set(String(text || '').split('\n').filter((l) => l.startsWith('n') && l.endsWith('com.apple.webinspectord_sim.socket')).map((l) => l.slice(1)))];
}
export function findSocket() {
  const r = spawnSync(exe('FW_LSOF', 'lsof'), ['-aUc', 'launchd_sim', '-Fn'], { encoding: 'utf8', timeout: 30000 });
  if (r.error) throw new Error(`lsof: ${r.error.code || r.error.message}`);
  const s = parseLsofSockets(r.stdout);
  if (s.length > 1) throw new Error(`${s.length} Simulator web inspector sockets: more than one Simulator is booted; shut the others down (xcrun simctl list devices booted) before measuring`);
  return s[0] || null;
}
/**
 * Every phone iwdp could attach: the union of `idevice_id -l` (USB) and `idevice_id -n` (network: a phone paired over
 * Wi-Fi and not plugged in; review-sim B2), deduplicated. Fails closed: either call failing, or a line that is not a
 * device id iwdp's config can name, refuses the proxy.
 */
export function phoneIds() {
  const ids = new Set();
  for (const flag of ['-l', '-n']) {
    const r = spawnSync(exe('FW_IDEVICE_ID', 'idevice_id'), [flag], { encoding: 'utf8', timeout: 15000 });
    if (r.error || r.status !== 0) throw new Error(`idevice_id ${flag} failed (${r.error ? r.error.code || r.error.message : `exit ${r.status}`}): without the list of ${flag === '-l' ? 'USB' : 'network'} phones the proxy could attach one; not starting it`);
    const got = r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    const bad = got.filter((x) => !IWDP_ID.test(x)).length;
    if (bad) throw new Error(`idevice_id ${flag} printed ${bad} line(s) that are not device ids iwdp's config accepts: not starting the proxy (it could attach that device)`);
    for (const x of got) ids.add(x);
  }
  return [...ids];
}
/** iwdp's config file: the list port, every attached phone ignored (-1), then the Simulator (any other device). */
export function iwdpConfigText(ids, { list, tabs }) {
  for (const id of ids) if (!IWDP_ID.test(id)) throw new Error('iwdpConfigText: not an iwdp device id');
  return [`null:${list}`, ...[...new Set(ids)].map((u) => `${u}:-1`), `:${tabs}`].join('\n') + '\n';
}
export function writeIwdpConfig(ids, p = ports()) { writePrivate(iwdpCfgFile(), iwdpConfigText(ids, p)); return iwdpCfgFile(); }

/** GET :<list>/json: {ok, ids, n, other} (other: devices whose id is not SIMULATOR; never their ids). */
export async function proxyDevices(p = ports()) {
  const j = await (await fetch(`http://localhost:${p.list}/json`, { signal: AbortSignal.timeout(4000) })).json();
  const ids = Array.isArray(j) ? j.map((d) => d?.deviceId) : [null];
  const other = ids.filter((x) => x !== SIM_ID).length;
  return { ok: ids.length === 1 && ids[0] === SIM_ID, n: ids.length, other, sim: ids.includes(SIM_ID) };
}
export const NOT_SIM = 'proxy sees a non-simulator device';
/** The check before every timed run: exactly SIMULATOR on the list port, else the proxy is stopped and this throws. */
export async function proxyCheck(p = ports()) {
  let d;
  try { d = await proxyDevices(p); } catch (e) { throw new Error(`the Simulator proxy is not reachable on :${p.list} (${e.cause?.code || e.message}); nothing measured`); }
  if (d.ok) return d;
  await stopOne('proxy');
  throw new Error(d.other ? `${NOT_SIM} (${d.other} non-simulator device(s) listed on :${p.list}): proxy stopped, nothing measured` : `the Simulator proxy lists no Simulator on :${p.list}: proxy stopped, nothing measured`);
}

/** Start the second iwdp (Safari must already run in the booted Simulator: iwdp fakes the attach once at start). */
export async function startProxy({ owner, session = null, timeoutMs = 20000, log = () => {} } = {}) {
  const p = ports();
  const socket = findSocket();
  if (!socket) throw new Error(`no Simulator web inspector socket (lsof -aUc launchd_sim): is ${device().key} booted with Safari running?`);
  const ids = phoneIds();
  const cfg = writeIwdpConfig(ids, p);
  await stopOne('proxy', log);
  const rec = startDetached('proxy', exe('FW_IWDP', 'ios_webkit_debug_proxy'), ['-c', cfg, '-s', `unix:${socket}`, '-F'], { match: cfg, owner, session });
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    await sleep(500);
    if (!pidAlive(rec.pid)) throw new Error(`the proxy exited at start; last lines of its log:\n${logTail('proxy')}`);
    try { last = await proxyDevices(p); } catch { continue; }
    if (last.other) { await stopOne('proxy', log); throw new Error(`${NOT_SIM} (${last.other} non-simulator device(s) listed on :${p.list}): proxy stopped, nothing measured`); }
    if (last.ok) {
      try { await (await fetch(`http://localhost:${p.tabs}/json`, { signal: AbortSignal.timeout(4000) })).json(); } catch { continue; }
      log(`proxy up (pid ${rec.pid}): SIMULATOR on :${p.list}, tabs on :${p.tabs}`);
      return { ...rec, ports: p };
    }
  }
  await stopOne('proxy', log);
  throw new Error(`the proxy did not list the Simulator on :${p.list} within ${Math.round(timeoutMs / 1000)} s${last ? ` (${last.n} device(s) listed)` : ''}; proxy stopped`);
}

// ---- Simulator.app (window shown) ---------------------------------------------------------------------------------
export function simAppRunning() {
  const r = spawnSync(exe('FW_OSASCRIPT', 'osascript'), ['-e', 'application "Simulator" is running'], { encoding: 'utf8', timeout: 15000 });
  return r.status === 0 && r.stdout.trim() === 'true';
}
export function openSimApp(udid) {
  const r = spawnSync(exe('FW_OPEN', 'open'), ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) throw new Error(`could not open Simulator.app (${failText(r)})`);
}
export function quitSimApp() {
  spawnSync(exe('FW_OSASCRIPT', 'osascript'), ['-e', 'quit app "Simulator"'], { encoding: 'utf8', timeout: 30000 });
}

// ---- open ------------------------------------------------------------------------------------------------------------
/**
 * The tab `sim.mjs open` opened (incident I-050): among the listed targets on `want`'s host and path, the only one,
 * or else the only one that was not listed (same websocket and url) in `before`, the listing taken before simctl
 * openurl; null while that is not decided (a restored tab on the same url and no new one yet). Never the first of
 * several (I-037).
 */
export function openedTab(list, want, before = []) {
  const w = new URL(want);
  const on = (t) => { try { const u = new URL(t.url); return u.host === w.host && u.pathname === w.pathname; } catch { return false; } };
  const hits = (Array.isArray(list) ? list : []).filter((t) => t && t.webSocketDebuggerUrl && on(t));
  if (hits.length <= 1) return hits[0] ?? null;
  const key = (t) => `${t.webSocketDebuggerUrl} ${t.url}`;
  const old = new Set((Array.isArray(before) ? before : []).filter(Boolean).map(key));
  const fresh = hits.filter((t) => !old.has(key(t)));
  return fresh.length === 1 ? fresh[0] : null;
}

// The Simulator's Safari restores the tabs of the earlier session at launch (incident I-050: a dead server's page that
// never answers Runtime.evaluate, so it can be neither read nor navigated away), and `open` adds a tab next to it.
// `open` records its server's host for its session (sim/opened.json, mode 600); the session's later commands scope
// every tab pick to that host (FW_TAB_HOST, tools/lib/wip.mjs pickTab), so a page of another server is never a
// candidate. Two pages on the session's own host stay AMBIGUOUS (I-037). A record of another session is ignored.
export const openedFile = () => file('opened.json');
// It also records the page it landed on (`href`, its location.href; incident I-052): `open` and `fetched` connect to
// exactly that page while Safari lists it, so a second open on the same host (openurl adds a tab) is not AMBIGUOUS.
export function writeOpened(session, url, href = url) { writePrivate(openedFile(), JSON.stringify({ session: session.id, host: new URL(url).host, url: href, at: new Date().toISOString() })); }
const ownOpened = (session) => { const o = readJson(openedFile(), null); return o && session?.id && o.session === session.id ? o : null; };
export function openedHost(session) { return ownOpened(session)?.host || null; }
export function openedUrl(session) { return ownOpened(session)?.url || null; }
/**
 * A tab url matcher for openTab (I-052): exactly `url` while `list` (the proxy's /json) has a page target on it; else any
 * page on `host`; else any page. Several matches stay AMBIGUOUS in pickTab (I-037).
 */
export function pageMatcher(list, url, host) {
  if (url && (Array.isArray(list) ? list : []).some((t) => t && t.webSocketDebuggerUrl && t.url === url)) return (u) => u === url;
  if (host) return (u) => { try { return new URL(u).host === host; } catch { return false; } };
  return () => true;
}
/** Sets env.FW_TAB_HOST to the session's opened host (unless the caller set it); returns the host in force or null. */
export function scopeTabs(session, env = process.env) {
  const h = openedHost(session);
  if (h && !env.FW_TAB_HOST) env.FW_TAB_HOST = h;
  return env.FW_TAB_HOST || null;
}

// ---- boot / shutdown -------------------------------------------------------------------------------------------------
export function deviceState(udid) { return listDevices().find((d) => d.udid === udid)?.state ?? null; }
/** CoreSimulator's in-between device states (simctl list): they end by themselves; boot and shutdown refuse them. */
export const TRANSITIONAL = Object.freeze(['Creating', 'Booting', 'Shutting Down']);
export const isTransitional = (state) => TRANSITIONAL.includes(state);
/** I-078: how long a session / doctor --fix waits for a transition to end (FW_SIM_TRANSITION_SEC, default 60). */
export function transitionWaitSec(env = process.env) {
  const v = env.FW_SIM_TRANSITION_SEC;
  if (v === undefined || v === '') return 60;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`FW_SIM_TRANSITION_SEC must be a number of seconds >= 0 (got ${v})`);
  return n;
}
/**
 * I-078: wait (up to maxSec, polling simctl) while the device is in a transitional state, e.g. the last session's
 * fw-sim still "Shutting Down" after Simulator.app quit. Only reads the state: never boots, shuts down or kills
 * anything. Returns {from, state, waitedSec, settled}; `from` null/settled when there was nothing to wait for.
 */
export async function settleDevice(udid, { maxSec = transitionWaitSec(), pollMs = 500, abort } = {}) {
  const t0 = Date.now();
  const from = deviceState(udid);
  let state = from;
  while (isTransitional(state) && Date.now() - t0 < maxSec * 1000 && !abort?.aborted) {
    await sleep(Math.min(pollMs, Math.max(0, maxSec * 1000 - (Date.now() - t0))));
    state = deviceState(udid);
  }
  return { from, state, waitedSec: Math.round((Date.now() - t0) / 1000), settled: !isTransitional(state) };
}
/** I-088: how long a session / doctor waits for a Booted device with no live session to shut down by itself before it
 *  calls it a leak (FW_SIM_LEAK_WAIT_SEC, default 30; 0 = no wait). */
export function leakWaitSec(env = process.env) {
  const v = env.FW_SIM_LEAK_WAIT_SEC;
  if (v === undefined || v === '') return 30;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`FW_SIM_LEAK_WAIT_SEC must be a number of seconds >= 0 (got ${v})`);
  return n;
}
/**
 * I-088: a device that reads Booted (or in transition) with no live session may be the last session's, whose shutdown
 * is still under way: e.g. its process was stopped mid-cleanup after `simctl shutdown` started, so the simulator lock
 * went to the next session 0.5 s later while CoreSimulator still listed the device as Booted. Polls (only reads the
 * state; never boots, shuts down or kills) until it reads Shutdown or is gone, `stop()` returns true, or maxSec passes.
 * Returns {from, state, waitedSec, shutdown}.
 */
export async function waitForShutdown(udid, { maxSec = leakWaitSec(), pollMs = 500, abort, stop = () => false } = {}) {
  const t0 = Date.now();
  const from = deviceState(udid);
  let state = from;
  const down = (x) => x === 'Shutdown' || x === null;
  while (!down(state) && Date.now() - t0 < maxSec * 1000 && !abort?.aborted && !stop()) {
    await sleep(Math.min(pollMs, Math.max(0, maxSec * 1000 - (Date.now() - t0))));
    state = deviceState(udid);
  }
  return { from, state, waitedSec: Math.round((Date.now() - t0) / 1000), shutdown: down(state) };
}
/**
 * The device `status`, `doctor` and a plain `shutdown` look at when no --device / $FW_SIM_DEVICE names one (I-087): the
 * live session's; else a configured device that is not shut down (the warm one first); else the warm record's; else fw-sim.
 */
export function activeDevice() {
  const live = liveSession();
  if (live) return deviceKey(live.device);
  const w = readWarm();
  const conf = configuredDevices();
  if (conf.length > 1) {
    let list = null;
    try { list = listDevices(); } catch {}
    const up = list ? conf.filter(({ cfg }) => { const d = list.find((x) => x.udid === cfg.udid); return d && d.state !== 'Shutdown'; }).map((x) => x.key) : [];
    if (up.length) return up.includes(warmLabel(w)) && w ? warmLabel(w) : up[0];
  }
  if (w) return warmLabel(w);
  return DEFAULT_DEVICE;
}

// Safari's HTTP cache persists across sessions in the device's data (incident I-052, F-115): an origin seen before
// (localhost:<port>, and serve.mjs --port auto hands the same ports to different overlays) gets its hashed
// `immutable` assets from the cache without a request, so a Simulator arm could silently run another arm's CSS / JS,
// and serve --no-cache cannot evict an entry already stored. Every session therefore empties the two HTTP caches in
// Safari's data container, WebKit's disk cache (Library/Caches/com.apple.mobilesafari/WebKit/NetworkCache) and
// CFNetwork's (…/fsCachedData), after boot and before Safari launches, with Safari terminated (its networking
// process owns the cache). Website data (localStorage, cookies, service-worker CacheStorage), tabs and the first-run
// tip state are kept. A failure refuses the session. The path comes from `simctl get_app_container` and must be a
// data container of this very device, or nothing is removed.
export const SAFARI_CACHE_DIRS = Object.freeze([['NetworkCache', 'Library/Caches/com.apple.mobilesafari/WebKit/NetworkCache'], ['fsCachedData', 'Library/Caches/com.apple.mobilesafari/fsCachedData']]);
const NOT_CONTAINER = 'could not clear Safari\'s HTTP cache (I-052): simctl get_app_container printed a path that is not a data container of fw-sim; nothing removed';
export function safariCacheTargets(container, udid) {
  const c = String(container ?? '').replace(/\n+$/, '');
  const esc = String(udid || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!udid || /\/\.{1,2}(\/|$)/.test(c) || !new RegExp(`^/[^\\n]+/${esc}/data/Containers/Data/Application/[A-Za-z0-9-]+$`).test(c)) throw new Error(NOT_CONTAINER);
  return SAFARI_CACHE_DIRS.map(([name, rel]) => ({ name, path: `${c}/${rel}` }));
}
const treeBytes = (p) => { let n = 0; let st; try { st = lstatSync(p); } catch { return 0; } if (!st.isDirectory()) return st.size; for (const e of readdirSync(p)) n += treeBytes(join(p, e)); return n; };
/** Empty Safari's HTTP caches (see above). Safari must not run: it is terminated first. Returns {cleared, removedMB}. */
export async function clearSafariCache(udid, { abort, log = () => {} } = {}) {
  const t = await simctlAsync(['terminate', udid, SAFARI], { timeoutMs: 30000, abort }); // after a boot: "found nothing to terminate"
  if (t.aborted) throw new Error('interrupted while clearing Safari\'s HTTP cache');
  if (t.status === 0) await sleep(1500); // it was running: let its WebKit processes exit
  const r = simctl(['get_app_container', udid, SAFARI, 'data'], { timeoutMs: 30000 });
  if (r.status !== 0) throw new Error(`could not clear Safari's HTTP cache (I-052): simctl get_app_container failed (${scrub(failText(r))})`);
  const removedMB = {};
  for (const { name, path } of safariCacheTargets(r.stdout, udid)) {
    removedMB[name] = Math.round(treeBytes(path) / 1024 / 1024 * 10) / 10;
    rmSync(path, { recursive: true, force: true });
    if (existsSync(path)) throw new Error(`could not clear Safari's HTTP cache (I-052): ${name} is still there`);
  }
  log(`Safari HTTP cache cleared before launch (I-052): ${Object.entries(removedMB).map(([k, v]) => `${k} ${v.toFixed(1)} MB`).join(', ')}`);
  return { cleared: true, removedMB };
}

/** `sim.mjs fetched <part>`'s page read: every Resource Timing entry, its sizes and the page origin (JSON). */
export const RESOURCES_JS = `JSON.stringify({origin: location.origin, entries: performance.getEntriesByType('resource').map((e) => ({name: e.name, transferSize: e.transferSize, encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize}))})`;
/**
 * Did the page fetch `part` over the network or take it from Safari's cache (I-052)? Resource Timing's transferSize
 * (CONFIRMED, w3c.github.io/resource-timing #dom-performanceresourcetiming-transfersize): 0 for cache mode "local",
 * 300 for "validated" (no body transferred), else encoded body size + 300. So only a body over the network is "network";
 * the Simulator's Safari reported 300 / body 0 for a load our server never saw (OBSERVED, in our setup, 2026-10-02),
 * so the server log is the decisive check. A cross-origin entry without Timing-Allow-Origin also reads 0, and an engine
 * without the field gives undefined: both "unknown". `logText`: the server's log (serve.mjs: "<status> GET <path> …"
 * per request), its GETs for `part` counted over the whole log.
 * Returns {lines, code}: 0 every match came over the network (and the log has a GET), 3 cache / unknown / no GET,
 * 1 no entry matches.
 */
export function fetchReport(page, part, { logText = null } = {}) {
  const origin = page?.origin ?? null;
  const hits = (page?.entries ?? []).filter((e) => typeof e?.name === 'string' && e.name.includes(part));
  const verdict = (e) => {
    if (typeof e.transferSize !== 'number') return 'unknown (no transferSize)';
    if (e.transferSize === 300 && !(e.encodedBodySize > 0)) return 'validated (no body transferred)'; // the spec's cache mode "validated"
    if (e.transferSize > 0) return 'network'; // encoded body size + 300
    let o = null; try { o = new URL(e.name).origin; } catch {}
    if (o !== origin) return 'unknown (cross-origin)';
    return e.encodedBodySize > 0 || e.decodedBodySize > 0 ? 'cache' : 'unknown (no sizes)';
  };
  const lines = hits.map((e) => `${verdict(e).padEnd(10)} ${e.name} (transferSize ${e.transferSize ?? 'n/a'}, body ${e.encodedBodySize ?? 'n/a'} B)`);
  let code = !hits.length ? 1 : hits.every((e) => verdict(e) === 'network') ? 0 : 3;
  if (!hits.length) lines.push(`no resource of the page matches "${part}" (Resource Timing)`);
  if (logText !== null) {
    const gets = String(logText).split('\n').filter((l) => /^\d{3} GET \S+/.test(l) && l.split(' ')[2].includes(part.replace(/^https?:\/\/[^/]+/, ''))).length;
    lines.push(`server log: ${gets} GET${gets === 1 ? '' : 's'} for ${part}`);
    if (!gets && code === 0) code = 3;
  }
  return { lines, code };
}

/** Boot, wait for bootstatus, empty Safari's HTTP cache, launch Safari and wait for its inspector socket. Throws on
 *  failure (the caller shuts down). Returns {safariCache}. `warm` (I-063): fw-sim is already booted (a warm device the
 *  session took over): no boot; Safari is terminated (clearSafariCache does it), its HTTP cache emptied and Safari
 *  launched again, so the session starts from the state a cold boot gives. */
export async function bootDevice(udid, { abort, log = () => {}, bootTimeoutMs = 300000, warm = false } = {}) {
  const t0 = Date.now();
  let r;
  if (!warm) {
    r = await simctlAsync(['boot', udid], { timeoutMs: 120000, abort });
    if (r.aborted) throw new Error('interrupted during boot');
    if (r.status !== 0 && deviceState(udid) !== 'Booted') throw new Error(`simctl boot failed (${r.error ? r.error.code : `exit ${r.status}`}): ${r.stdout.trim().split('\n').slice(-2).join(' | ')}`);
  }
  r = await simctlAsync(['bootstatus', udid, '-b'], { timeoutMs: bootTimeoutMs, abort }); // returns at once on a booted device
  if (r.aborted) throw new Error('interrupted during bootstatus');
  if (r.status !== 0) throw new Error(`simctl bootstatus failed (${r.timedOut ? 'timed out' : `exit ${r.status}`})`);
  const safariCache = await clearSafariCache(udid, { abort, log });
  r = await simctlAsync(['launch', udid, SAFARI], { timeoutMs: 60000, abort });
  if (r.aborted) throw new Error('interrupted during the Safari launch');
  if (r.status !== 0) throw new Error(`simctl launch Safari failed (${r.timedOut ? 'timed out after 60 s' : r.signal ? `signal ${r.signal}` : `exit ${r.status}`})`);
  for (let i = 0; i < 60; i++) {
    if (abort?.aborted) throw new Error('interrupted while waiting for the inspector socket');
    if (findSocket()) { log(`${warm ? `reused the booted ${device().key} (no boot), Safari relaunched` : 'booted'} in ${Math.round((Date.now() - t0) / 1000)} s, Safari running`); return { safariCache }; }
    await sleep(500);
  }
  throw new Error('Safari runs, but no web inspector socket appeared in 30 s');
}
/** Shut fw-sim down if it is not already (cleanup: always attempted, errors logged, never thrown). */
export async function shutdownDevice(udid, { log = () => {}, label = device().key } = {}) {
  let st = null;
  try { st = deviceState(udid); } catch (e) { log(`simctl list failed during cleanup: ${e.message}`); }
  if (st === 'Shutdown') return 'already shut down';
  const r = await simctlAsync(['shutdown', udid], { timeoutMs: 120000 });
  const res = r.status === 0 ? 'shut down' : `shutdown failed (exit ${r.status ?? r.signal}); run: node tools/sim.mjs doctor --fix`;
  log(`${label} ${res}`);
  return res;
}

/** `sim.mjs status` lines (UDIDs masked). */
export async function statusLines() {
  const out = [];
  const cfg = readConfig();
  const setupCmd = `node tools/sim.mjs setup${device().key === DEFAULT_DEVICE ? '' : ` --device ${device().key}`}`;
  out.push(`config:   ${cfg.udid ? `device ${mask(cfg.udid)}, ${cfg.runtime} (${cfg.runtimeBuild ?? '?'}), Xcode ${cfg.xcode ?? '?'}, tip ${cfg.tip?.state ?? 'unchecked'}` : `none (${setupCmd}${device().key === DEFAULT_DEVICE ? '' : ', or its first session'})`}`);
  let dev = null, devState, list = null; // devState: the real state for the warm line (undefined: simctl failed, unchecked)
  try { list = listDevices(); dev = findDevice(cfg, list); devState = dev?.state ?? null; } catch (e) { out.push(`device:   simctl failed (${e.message})`); }
  if (dev || cfg.udid) out.push(`device:   ${dev ? `${dev.name}: ${dev.state}` : `not found (${setupCmd})`}`);
  // I-087: every configured device (fw-sim, iPads) when there is more than one; --device picks the one shown above
  const conf = configuredDevices();
  if (conf.length > 1 || device().key !== DEFAULT_DEVICE) out.push(`devices:  ${conf.map(({ key, cfg: c }) => `${key}${key === device().key ? ' (shown)' : ''} ${list ? (list.find((d) => d.udid === c.udid)?.state ?? 'not found') : '?'}`).join(', ') || 'none'}; known: ${Object.keys(DEVICES).join(', ')}`);
  const wr = readWarm();
  if (wr && wr.udid !== cfg.udid) devState = list ? (list.find((d) => d.udid === wr.udid)?.state ?? null) : undefined; // the warm line is about the warm device
  const s = readSession();
  out.push(`session:  ${s ? `${pidAlive(s.pid) ? 'live' : 'DEAD (stale record)'} pid ${s.pid}, owner ${s.owner}, window ${s.window}, since ${s.startedAt}${s.boot ? `, ${s.boot.mode} start (session ${s.boot.sessionsOnBoot} on this boot)` : ''}` : 'none'}`);
  out.push(`warm:     ${warmLine(undefined, undefined, { devState })?.replace(/^warm: /, '') ?? `none (idle timeout ${idleSec()} s after a functional session; FW_SIM_IDLE_SEC)`}`); // I-063
  for (const n of ['proxy', 'wda', 'keeper']) { const r = pidInfo(n); out.push(`${n.padEnd(9)} ${r ? (r.ours ? `running pid ${r.pid} since ${r.startedAt} (by ${r.owner})` : `stale pidfile (pid ${r.pid})`) : 'not running'}`); }
  let p = null;
  try { p = ports(); } catch (e) { out.push(`ports:    ${e.message}`); }
  if (p) {
    const d = await proxyDevices(p).catch(() => null);
    out.push(`proxy:    :${p.list} ${d ? (d.ok ? 'lists SIMULATOR only' : `lists ${d.n} device(s), ${d.other} non-simulator`) : 'not reachable'}; tabs :${p.tabs}; WDA-sim :${p.wda}`);
  }
  return out;
}

/** `sim.mjs doctor [--fix]`: a booted fw-sim (or a running proxy / WDA-sim) without a live session is a leak, unless it
 *  is the warm device of I-063 with its keeper running (warm.json and a live keeper of ours). */
export async function doctor({ fix = false, log = console.log, lockWaitSec = 60 } = {}) {
  if (!fix) return doctorRun({ fix, log });
  // review-i063 N4: --fix under the simulator lock, like a session and the keeper: in a session's cleanup window (live,
  // warm.json just written) it would otherwise stop the keeper and remove the record while the session skips its own
  // shutdown, leaving a booted device with no record. A session that holds the lock cleans up itself.
  let lk;
  try { lk = await takeSimLock('sim-doctor', { waitSec: lockWaitSec, meta: { cmd: 'sim doctor --fix' }, log: () => {}, pollMs: 500 }); } catch (e) { log(`doctor --fix: ${e.message}; a session cleans up itself: retry after it ends`); return 3; }
  try { return await doctorRun({ fix, log }); } finally { await lk.release(); }
}
async function doctorRun({ fix, log }) {
  const cfg = readConfig();
  const leakSec = leakWaitSec(); // I-088: a bad FW_SIM_LEAK_WAIT_SEC refuses at once
  let live = liveSession();
  let dev = cfg.udid ? findDevice(cfg) : null;
  if (fix && !live && isTransitional(dev?.state)) {
    // I-078: a shutdown or boot in progress ends by itself: --fix waits for it (bounded) and judges the state it ends in
    const from = dev.state, s = await settleDevice(dev.udid);
    log(`waited ${s.waitedSec} s for ${device().name} to finish ${from} (${s.settled ? `now ${s.state ?? 'gone'}` : `still ${s.state}`}; I-078)`);
    dev = findDevice(cfg);
  }
  if (!live && dev?.state === 'Booted') {
    // I-088: Booted with no live session and not the kept warm device: the last session's shutdown may still be under
    // way (its process stopped mid-cleanup); wait for it (bounded, FW_SIM_LEAK_WAIT_SEC) before calling it a LEAK
    const w0 = readWarm();
    const keptNow = w0 && !w0.shutdownFailed && w0.udid === dev.udid && pidInfo('keeper')?.ours;
    if (!keptNow) {
      const s = await waitForShutdown(dev.udid, { maxSec: leakSec, stop: () => !!liveSession() });
      if (s.waitedSec > 0 || s.shutdown) log(`waited ${s.waitedSec} s for ${device().name} (Booted with no live session) to shut down by itself (${s.shutdown ? `now ${s.state ?? 'gone'}` : `still ${s.state}`}; I-088)`);
      live = liveSession();
      dev = findDevice(cfg);
    }
  }
  const moving = !live && isTransitional(dev?.state); // I-078: in transition, not (yet) a leak; nothing to shut down
  // I-087: a warm record (and its keeper) of ANOTHER device is that device's business: doctor --device <it> checks it
  const warmAny = readWarm();
  const otherWarm = !!(warmAny && cfg.udid && warmAny.udid && warmAny.udid !== cfg.udid);
  const warm = otherWarm ? null : warmAny;
  const keeper = otherWarm ? null : pidInfo('keeper');
  // the warm device, kept by its keeper (not one whose last shutdown failed: review-i063 B1)
  const kept = !live && warm && !warm.shutdownFailed && keeper?.ours && dev?.state === 'Booted' && warm.udid === dev.udid;
  const problems = [];
  if (!live && readSession()) problems.push('stale session record');
  if (moving) problems.push(`${device().name} is ${dev.state} with no live session: a shutdown or boot in progress (it ends by itself; a session waits for it, I-078): run doctor again shortly${fix ? '' : ', or doctor --fix (waits for it)'}`);
  else if (dev && dev.state !== 'Shutdown' && !live && !kept) problems.push(`LEAK: ${device().name} is ${dev.state} with no live session${warm ? ` (a warm record, but ${warm.shutdownFailed ? `its last shutdown FAILED: ${warm.shutdownFailed.why}` : `its keeper ${keeper ? (keeper.ours ? 'runs for another device' : 'is gone') : 'is missing'}`})` : ''}`);
  if (warm && !kept && !(dev && dev.state !== 'Shutdown' && !live)) problems.push(`stale warm record (${live ? 'a live session owns the device' : `${device().key} is ${dev?.state ?? 'not found'}`})`);
  for (const n of ['proxy', 'wda']) { const r = pidInfo(n); if (r && (!live || r.session !== live.id)) problems.push(`${n}: ${r.ours ? `running (pid ${r.pid}) outside a live session` : 'stale pidfile'}`); }
  if (keeper && !kept) problems.push(`keeper: ${keeper.ours ? `running (pid ${keeper.pid}) without a warm device to keep` : 'stale pidfile'}`);
  if (!problems.length) { log(`ok: ${live ? `live session pid ${live.pid} (owner ${live.owner})` : kept ? warmLine() : `no session, nothing booted, no proxy${otherWarm ? ` (${device().key}; the warm ${warmLabel(warmAny)}: node tools/sim.mjs doctor --device ${warmLabel(warmAny)})` : ''}`}`); return 0; }
  for (const p of problems) log(p);
  if (!fix) { log(`run: node tools/sim.mjs doctor --fix (stops our proxy / WDA-sim / keeper, shuts ${device().key} down)`); return 3; }
  for (const n of ['wda', 'proxy', 'keeper']) if (n !== 'keeper' || (!kept && !otherWarm)) await stopOne(n, log);
  if (moving) { rmSync(sessionFile(), { force: true }); log(`NOT fixed: ${device().name} is still ${dev.state} (never shut down mid-transition); retry, or check it in Simulator.app`); return 3; }
  if (dev && dev.state !== 'Shutdown' && !live && !kept) {
    await shutdownDevice(dev.udid, { log });
    // review-i063 B1: fixed only when the device IS shut down; the warm record (if any) stays for the next try
    const st = deviceState(dev.udid);
    if (st !== null && st !== 'Shutdown') { if (!live) rmSync(sessionFile(), { force: true }); log(`NOT fixed: ${device().name} is still ${st} after the shutdown${warm ? ' (the warm record stays)' : ''}; retry, or shut it down in Simulator.app`); return 3; }
  }
  if (!live) rmSync(sessionFile(), { force: true });
  if (!kept && !otherWarm) rmSync(warmFile(), { force: true });
  log('fixed');
  return 0;
}

// ---- the warm device (incident I-063; the state and its readers: tools/lib/sim-warm.mjs) ------------------------------
/** The keeper's env: the caller's, without its lock / session handles (the keeper holds nothing of the session's). */
function keeperEnv(env = process.env) {
  const e = { ...env };
  for (const k of ['FW_LOCK_HELD', 'FW_LOCK_SHARED', 'FW_SIM_SESSION', 'FW_SIM_FUNCTIONAL', 'FW_TAB_HOST']) delete e[k];
  return e;
}
/** Is the Booted `dev` the warm device `w` recorded, of the configured type and runtime? Returns null if so, else why not. */
export function warmMismatch(w, dev, cfg) {
  if (!w) return 'no warm record';
  if (!dev || dev.state !== 'Booted') return `${device().name} is ${dev?.state ?? 'not found'}`;
  if (w.udid !== dev.udid || dev.udid !== cfg.udid) return 'the warm record names another device';
  if (dev.deviceTypeIdentifier !== device().deviceType || (cfg.deviceType && dev.deviceTypeIdentifier !== cfg.deviceType)) return 'another device type';
  if ((cfg.runtimeId && dev.runtimeId !== cfg.runtimeId) || (w.runtimeId && w.runtimeId !== dev.runtimeId)) return 'another iOS runtime';
  return null;
}
/**
 * Shut the warm fw-sim down (I-063) under the `simulator` lock (waits up to waitSec; a session or another shutdown that
 * holds it wins): never while a session lives, and with `id` (the keeper) only while warm.json is still that record (a
 * session that took the device over replaced or removed it). Stops the keeper unless `fromKeeper`. Returns {done, why}.
 */
export async function shutdownWarm({ reason, by = 'sim', id = null, waitSec = 60, fromKeeper = false, log = () => {} } = {}) {
  let lk;
  // busy (review-i063 follow-up): the simulator lock or a live session holds the device; not a failed shutdown
  try { lk = await takeSimLock(`sim-${by}`.slice(0, 40).replace(/[^A-Za-z0-9_.:-]/g, '-'), { waitSec, meta: { cmd: `sim shutdown (${reason})` }, log: () => {}, pollMs: 500 }); } catch (e) { return { done: false, busy: true, why: e.message }; }
  try {
    const w = readWarm();
    if (id && (!w || w.id !== id)) return { done: false, why: 'superseded: the warm record changed (a session took the device over)' };
    // review-i063 n2: the record went while this call waited for the lock (the keeper or another reap won the race):
    // nothing of ours to shut down, and no "stale record" to report
    if (!w) return { done: false, gone: true, why: 'the warm record was removed before this shutdown got the simulator lock (the keeper or another shutdown did it)' };
    const live = liveSession();
    if (live) return { done: false, busy: true, why: `a live session (pid ${live.pid}, owner "${live.owner}") owns the device` };
    // I-087: the device the warm record names (fw-sim or an iPad), whatever device this process was started for
    const udid = w.udid || readConfig(warmLabel(w)).udid;
    const res = udid ? await shutdownDevice(udid, { log, label: warmLabel(w) }) : 'no Simulator configured';
    // done only when the device IS shut down now (review-i063 B1): a failed or timed-out `simctl shutdown` keeps the
    // record (marked) and the keeper, so status, doctor, the timed tools' reap and the phone NOTE still see the device
    let st = null;
    if (udid) { try { st = deviceState(udid); } catch (e) { st = `unknown (${e.message})`; } }
    if (udid && st !== null && st !== 'Shutdown') { // null: the device is gone, nothing booted
      const why = `${res}; ${warmLabel(w)} is ${st}`;
      if (w) writePrivate(warmFile(), JSON.stringify({ ...w, shutdownFailed: { at: new Date().toISOString(), by, reason, why } }, null, 1));
      log(`SIM_WARM_SHUTDOWN_FAILED (${reason}; by ${by}): ${why}; the warm record stays: node tools/sim.mjs doctor`);
      return { done: false, failed: true, why };
    }
    if (!fromKeeper) await stopOne('keeper', log);
    rmSync(warmFile(), { force: true });
    log(`SIM_WARM_SHUTDOWN (${reason}; by ${by}): ${warmLabel(w)} ${res}${w ? `, warm since ${w.lastSessionEndedAt ?? '?'}` : ''}`);
    return { done: true, why: res, already: res === 'already shut down' };
  } finally { await lk.release(); }
}
/**
 * `sim.mjs keeper <id>` (detached, started by a session that kept fw-sim booted): polls every pollMs and shuts the warm
 * device down at its idle timeout or when chrome-measure has a timing holder or waiter. Backs off (and polls again)
 * while anyone holds the simulator lock; exits when warm.json is no longer its record. Its pidfile goes with it.
 */
export async function keeper({ id, pollMs = Number(process.env.FW_SIM_KEEPER_POLL_MS || 2000), checkMs = Number(process.env.FW_SIM_KEEPER_CHECK_MS || 30000), log = console.log } = {}) {
  if (!id) throw new Error('usage: node tools/sim.mjs keeper <warm id> (started by sim.mjs session)');
  const own = () => { const k = readJson(pidFile('keeper'), null); return k && k.pid === process.pid; };
  let lastCheck = Date.now(), fails = 0, retryAt = 0;
  const retryBaseMs = keeperRetryMs();
  // review-i063 N7: a shutdown that keeps failing (or a lock that stays busy) is retried every poll, but each distinct
  // line is logged once (seconds normalized), so keeper.log does not grow by a line every 2 s
  const seen = new Set();
  const once = (s) => { const k = String(s).replace(/\b\d+ s\b/g, 'N s'); if (seen.has(k)) return; if (seen.size > 200) seen.clear(); seen.add(k); log(s); };
  try {
    for (;;) {
      const w = readWarm();
      if (!w || w.id !== id) { log(`keeper ${id}: the warm record is gone or another one (a session took the device over, or it was shut down): exiting`); return 0; }
      let why = Date.now() >= Date.parse(w.idleUntil) ? `idle ${Math.round((Date.now() - Date.parse(w.lastSessionEndedAt)) / 1000)} s` : null;
      if (!why) { try { why = timingDemand(lockStatus('chrome-measure')); } catch {} }
      if (!why && Date.now() - lastCheck >= checkMs) {
        // review-i063 N3: the real state every checkMs (one simctl list): a device shut down outside the keeper
        // (Simulator.app quit, simctl by hand) leaves no record that says "booted"; shutdownWarm clears it under the lock
        lastCheck = Date.now();
        let st;
        try { st = deviceState(w.udid); } catch {}
        if (st !== undefined && st !== 'Booted') why = `${warmLabel(w)} is ${st ?? 'gone'} (shut down outside the keeper)`;
      }
      if (why && Date.now() >= retryAt) {
        const r = await shutdownWarm({ reason: why, by: 'keeper', id, waitSec: 0, fromKeeper: true, log: once });
        if (r.done) return 0;
        once(`keeper ${id}: ${why}, but not now: ${r.why}`); // keep polling: a failed shutdown is retried
        // review-i063 n1: a `simctl shutdown` that failed is retried with back-off (5 s, 10 s, ... up to 5 min), not
        // every poll; a busy simulator lock (a session, a reap) is no failure and is retried at the next poll
        if (r.failed) { fails++; retryAt = Date.now() + Math.min(retryBaseMs * 2 ** (fails - 1), 300000); } else retryAt = 0;
      }
      await sleep(pollMs);
    }
  } finally { if (own()) rmSync(pidFile('keeper'), { force: true }); }
}
/**
 * Hand the booted fw-sim to a keeper at the end of a functional session (I-063): Safari quit (no page keeps running),
 * warm.json written, the keeper started. Returns the record, or null when the device is not Booted any more.
 */
export async function warmOut({ udid, owner, boot, idle, log = () => {} }) {
  const t = await simctlAsync(['terminate', udid, SAFARI], { timeoutMs: 30000 }); // "found nothing to terminate" is fine
  if (deviceState(udid) !== 'Booted') return null;
  const dev = findDevice({ udid });
  const now = Date.now();
  const rec = { id: randomBytes(6).toString('hex'), device: device().key, udid, runtimeId: dev?.runtimeId ?? null, deviceType: dev?.deviceTypeIdentifier ?? null, bootedAt: boot.bootedAt, sessions: boot.sessionsOnBoot,
    lastOwner: owner, lastSessionEndedAt: new Date(now).toISOString(), idleSec: idle, idleUntil: new Date(now + idle * 1000).toISOString(), safariQuit: t.status === 0 };
  await stopOne('keeper', log); // a stray one (none normally: the session took the device over)
  writePrivate(warmFile(), JSON.stringify(rec, null, 1));
  const k = startDetached('keeper', process.execPath, [SIM_MJS, 'keeper', rec.id], { match: `keeper ${rec.id}`, owner, env: keeperEnv() });
  log(`fw-sim kept booted for the next session (I-063): Safari quit; shuts down at ${rec.idleUntil} (idle ${idle} s, FW_SIM_IDLE_SEC), or as soon as a timing hold is queued, or on node tools/sim.mjs shutdown; keeper pid ${k.pid}`);
  return rec;
}

// ---- WebDriverAgent on the Simulator (README §3.3): unsigned, its own DerivedData, port 8101, no iproxy -----------
/** WDA-sim's DerivedData, next to the phone's ($FW_WDA_HOME/DerivedData) but never shared with it. */
export const wdaSimDerivedData = (home) => join(home, 'DerivedData-sim');
export const wdaSimDestination = (udid) => `platform=iOS Simulator,id=${udid}`;
/** build-for-testing for the Simulator: no team, no Apple ID, no signing (CODE_SIGNING_ALLOWED=NO). */
export function wdaSimBuildArgs({ src, home, udid }) {
  return ['-project', join(src, 'WebDriverAgent.xcodeproj'), '-scheme', 'WebDriverAgentRunner', '-destination', wdaSimDestination(udid),
    '-derivedDataPath', wdaSimDerivedData(home), 'CODE_SIGNING_ALLOWED=NO', 'build-for-testing'];
}
export const wdaSimRunArgs = ({ xctestrun, udid }) => ['test-without-building', '-xctestrun', xctestrun, '-destination', wdaSimDestination(udid)];
/** The env of the WDA-sim runner: TEST_RUNNER_USE_PORT reaches the runner as USE_PORT (man xcodebuild, TEST_RUNNER_<VAR>). */
export const wdaSimEnv = (p = ports(), env = process.env) => ({ ...env, TEST_RUNNER_USE_PORT: String(p.wda), FW_WDA_URL: `http://127.0.0.1:${p.wda}` });

/** `sim.mjs wda build`: inside the caller's own normal hold (xcodebuild is minutes of CPU); the device need not be booted. */
export async function wdaBuild({ owner, log = console.log, abort = null }) {
  const gate = holdGate(undefined, undefined, { owner, what: 'a WDA-sim build' });
  if (!gate.ok) throw new Error(`refusing sim wda build: ${gate.reason.replace(/session --owner (\S+) -- <cmd>/, 'wda build --owner $1')}`);
  const cfg = readConfig();
  if (!cfg.udid) throw new Error('no Simulator configured: node tools/sim.mjs setup');
  const { wdaHome, srcDir, findXctestrun, cloneCommand } = await import('./wda-runner.mjs');
  if (!existsSync(join(srcDir(), 'WebDriverAgent.xcodeproj'))) throw new Error(`WebDriverAgent sources missing in ${srcDir()} (the phone's checkout, outside the repo). Fetching them is the user's / lead's decision:\n  ${cloneCommand()}`);
  const home = wdaHome();
  mkdirSync(home, { recursive: true });
  const blog = join(home, 'build-sim.log');
  const timeoutMs = Number.isFinite(gate.endsAt) ? Math.max(1000, gate.endsAt - Date.now() - 20000) : 540000;
  log(`building WebDriverAgent for the Simulator, unsigned (log: ${blog}; stopped after ${Math.round(timeoutMs / 1000)} s, before your hold ends)`);
  const fd = openSync(blog, 'w', 0o600);
  const r = await runChild(exe('FW_XCODEBUILD', 'xcodebuild'), wdaSimBuildArgs({ src: srcDir(), home, udid: cfg.udid }), { timeoutMs, abort, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  if (r.error) throw new Error(`xcodebuild could not start: ${r.error.code || r.error.message}`);
  if (r.status !== 0) throw new Error(`xcodebuild build-for-testing (Simulator) ${r.timedOut ? 'stopped before your hold ends' : r.aborted ? 'interrupted' : 'failed'} (exit ${r.status ?? r.signal}); last lines of ${blog}:\n${scrub(readFileSync(blog, 'utf8').trim().split('\n').slice(-15).join('\n'))}`);
  const x = findXctestrun(wdaSimDerivedData(home));
  if (!x) throw new Error(`build succeeded but no .xctestrun in ${wdaSimDerivedData(home)}/Build/Products`);
  writeConfig({ ...readConfig(), wdaBuiltAt: new Date().toISOString() });
  log(`WDA_SIM_BUILT ${x.split('/').pop()}`);
  return 0;
}
/** `sim.mjs wda start`: inside a session (the Simulator is booted); WDA-sim on :8101, stopped by the session's cleanup. */
export async function wdaStart({ session, log = console.log, timeoutMs = 120000 }) {
  const cfg = readConfig();
  const { wdaHome, findXctestrun } = await import('./wda-runner.mjs');
  const x = findXctestrun(wdaSimDerivedData(wdaHome()));
  if (!x) throw new Error('no WDA-sim build yet: node tools/lock.mjs run chrome-measure --owner <you> --max-seconds 600 -- node tools/sim.mjs wda build --owner <you>');
  const p = ports();
  const url = `http://127.0.0.1:${p.wda}`;
  const ready = async () => { try { const j = await (await fetch(`${url}/status`, { signal: AbortSignal.timeout(3000) })).json(); return !!(j?.value?.ready ?? j?.value); } catch { return false; } };
  await stopOne('wda', log);
  const rec = startDetached('wda', exe('FW_XCODEBUILD', 'xcodebuild'), wdaSimRunArgs({ xctestrun: x, udid: cfg.udid }), { match: wdaSimDerivedData(wdaHome()), owner: session.owner, session: session.id, env: wdaSimEnv(p) });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ready()) { log(`WDA_SIM_READY ${url} (pid ${rec.pid}; the session stops it)`); return 0; }
    if (!pidAlive(rec.pid)) break;
    await sleep(1000);
  }
  await stopOne('wda', log);
  throw new Error(`WDA-sim did not come up at ${url}; last lines of its log:\n${logTail('wda')}`);
}

/**
 * `sim.mjs session --owner o [--window shown|hidden] -- <cmd> [args]`: boot, wait, launch Safari, start the proxy,
 * run <cmd> (process group, output scrubbed) with FW_SIM_SESSION, FW_SIM_PORT, FW_IPHONE_PORT (= the tabs port),
 * FW_SIM_DEVICE_PORT and FW_SIM_UDID set; then ALWAYS stop WDA-sim (if this session started it) and the proxy,
 * shut the Simulator down and quit Simulator.app if this session opened it, also on SIGINT/SIGTERM/SIGHUP.
 * Resolves <cmd>'s exit code (124: stopped before the hold ends; 128+n: a signal).
 */
export async function session({ owner, window = 'shown', cmd, args = [], log = console.log, err = console.error, tip = null, cleanupMs = 40000, functional = false, simLockWaitSec } = {}) {
  if (!owner) throw new Error('--owner <you> is required');
  if (!WINDOWS.includes(window)) throw new Error(`--window must be shown or hidden (got ${window})`);
  if (!cmd) throw new Error(`usage: ${functional ? functionalCmd(owner) : holdCmd(owner)}`);
  const gate = holdGate(undefined, undefined, { owner, functional, what: functional ? 'a functional Simulator session' : undefined });
  if (!gate.ok) throw new Error(`refusing sim session: ${gate.reason}`);
  const p = ports();
  const bgCfg = BG.config(); // I-082: a bad FW_SIM_SETTLE_SEC / FW_SIM_BG_* refuses before anything boots
  const leakSec = leakWaitSec(); // I-088: so does a bad FW_SIM_LEAK_WAIT_SEC
  let cfg = readConfig();
  // I-087: a device other than fw-sim is created at its first session (simctl create; no boot, nothing downloaded)
  const onDemand = !cfg.udid && device().key !== DEFAULT_DEVICE;
  if (!cfg.udid && !onDemand) throw new Error('no Simulator configured: node tools/sim.mjs setup');
  if (!onDemand) {
    const dev = findDevice(cfg);
    if (!dev || dev.udid !== cfg.udid) throw new Error(`${device().name} (configured) not found: node tools/sim.mjs setup${device().key === DEFAULT_DEVICE ? '' : ` --device ${device().key}`}`);
  }
  // one fw-sim: the `simulator` lock closes the race of two sessions reading "no live session" at once (two functional
  // sessions in a raised-cap group). Its wait leaves the boot, the command and the cleanup inside the hold.
  const left = Number.isFinite(gate.endsAt) ? (gate.endsAt - Date.now() - cleanupMs) / 1000 - 60 : 120;
  const simLock = await takeSimLock(owner, { waitSec: simLockWaitSec ?? Math.max(0, Math.min(120, Math.floor(left))), meta: { cmd: 'sim session', functional }, log: err });
  let rec, id, warm = null;
  try {
    const other = liveSession();
    if (other) throw new Error(`a Simulator session is already running (pid ${other.pid}, owner "${other.owner}"${other.device && other.device !== device().key ? `, ${other.device}` : ''})`);
    if (onDemand) cfg = setup({ log: err }); // under the simulator lock: two first sessions never create two devices
    // I-063: read the device again under the simulator lock (a keeper may have shut it down while this session waited);
    // a Booted fw-sim is taken over only when it is the warm device of warm.json (same device, type and runtime)
    let now = findDevice(cfg);
    if (isTransitional(now?.state)) {
      // I-078: a shutdown (or boot) still in progress, e.g. the last session's fw-sim after Simulator.app quit: wait for
      // it to end inside this hold's budget (boot, command and cleanup still fit), then the rules below decide
      const room = Number.isFinite(gate.endsAt) ? Math.floor((gate.endsAt - Date.now() - cleanupMs) / 1000) - 60 : Infinity;
      const maxSec = Math.max(0, Math.min(transitionWaitSec(), room));
      const s = await settleDevice(now.udid, { maxSec });
      if (!s.settled) throw new Error(`refusing: ${device().name} is still ${s.state} after waiting ${s.waitedSec} s for it to finish (I-078; a shutdown or boot that does not end: node tools/sim.mjs doctor)`);
      err(`sim session: waited ${s.waitedSec} s for ${device().name} to finish ${now.state} (now ${s.state ?? 'gone'}; I-078)`);
      now = findDevice(cfg);
    }
    if (now && now.state !== 'Shutdown' && warmMismatch(readWarm(), now, cfg)) {
      // I-088: Booted with no live session and no warm record of it: the last session's shutdown may still be under way
      // (its process stopped mid-cleanup); wait for it (bounded, inside this hold's budget) before calling it a leak
      const room = Number.isFinite(gate.endsAt) ? Math.floor((gate.endsAt - Date.now() - cleanupMs) / 1000) - 60 : Infinity;
      const s = await waitForShutdown(now.udid, { maxSec: Math.max(0, Math.min(leakSec, room)) });
      if (s.waitedSec > 0 || s.shutdown) err(`sim session: ${device().name} was ${s.from} with no live session; waited ${s.waitedSec} s for a shutdown in progress (${s.shutdown ? `now ${s.state ?? 'gone'}` : `still ${s.state}`}; I-088)`);
      now = findDevice(cfg);
    }
    let w = readWarm();
    if (w && w.udid !== cfg.udid) {
      // I-087: the warm device is another one (fw-sim kept warm, this session drives an iPad, or the other way): one
      // Simulator at a time (findSocket refuses two), so it is shut down here, under this session's simulator lock
      const lbl = warmLabel(w);
      const res = await shutdownDevice(w.udid, { label: lbl });
      let st = null;
      try { st = deviceState(w.udid); } catch (e) { st = `unknown (${e.message})`; }
      if (st !== null && st !== 'Shutdown') {
        writePrivate(warmFile(), JSON.stringify({ ...w, shutdownFailed: { at: new Date().toISOString(), by: owner, reason: `a ${device().key} session needs the Simulator`, why: `${res}; ${lbl} is ${st}` } }, null, 1));
        throw new Error(`refusing: the warm ${lbl} did not shut down (${res}; it is ${st}), and ${device().key} can't boot beside it: node tools/sim.mjs doctor --fix --device ${lbl}`);
      }
      await stopOne('keeper', () => {});
      rmSync(warmFile(), { force: true });
      err(`sim session: the warm ${lbl} was shut down first (${res}): one Simulator at a time (I-087)`);
      w = null;
    }
    if (now?.state !== 'Shutdown') {
      const why = warmMismatch(w, now, cfg);
      if (why) throw new Error(`refusing: ${device().name} is already ${now?.state ?? 'gone'} (booted by someone else, or a leaked session: node tools/sim.mjs doctor)${w ? `; the warm record does not match it (${why})` : ''}`);
      warm = w;
    }
    await stopOne('keeper', () => {}); // the device is this session's now (a warm one), or the keeper's record is stale
    let afterWarm = null;
    if (warm && !functional) {
      // review-i063 N5: a timing session always cold-boots (warm and cold starts never pool): it shuts the warm device
      // down here, under its own simulator lock, and boots it again; a failed shutdown keeps the record and refuses
      const res = await shutdownDevice(cfg.udid);
      const st = deviceState(cfg.udid);
      if (st !== null && st !== 'Shutdown') {
        writePrivate(warmFile(), JSON.stringify({ ...warm, shutdownFailed: { at: new Date().toISOString(), by: owner, reason: 'a timing session cold-boots', why: `${res}; ${device().key} is ${st}` } }, null, 1));
        throw new Error(`refusing: a timing session cold-boots, but the warm ${device().name} did not shut down (${res}; it is ${st}): node tools/sim.mjs doctor --fix`);
      }
      afterWarm = { lastSessionEndedAt: warm.lastSessionEndedAt ?? null, sessions: warm.sessions ?? null, shutDownAt: new Date().toISOString() };
      warm = null;
    }
    rmSync(warmFile(), { force: true });
    id = randomBytes(6).toString('hex');
    const boot = warm ? { mode: 'warm', bootedAt: warm.bootedAt, sessionsOnBoot: (warm.sessions || 1) + 1, idleSec: Math.round((Date.now() - Date.parse(warm.lastSessionEndedAt)) / 1000) } : { mode: 'cold', bootedAt: null, sessionsOnBoot: 1, ...(afterWarm ? { afterWarm } : {}) };
    rec = { id, pid: process.pid, owner, device: device().key, window, startedAt: new Date().toISOString(), proxyPorts: p, tipDismissed: cfg.tip?.state ?? 'unchecked', boot, ...(functional ? { functional: true, lock: { mode: gate.mode } } : {}) };
  } catch (e) { await simLock.release(); throw e; }
  writePrivate(sessionFile(), JSON.stringify(rec, null, 1));
  const ac = new AbortController();
  let interrupted = null;
  const onSig = (sig) => () => { if (!interrupted) { interrupted = sig; err(`sim session: ${sig}: stopping, then cleaning up`); } ac.abort(); };
  const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => [s, onSig(s)]);
  for (const [s, h] of handlers) process.on(s, h);
  const state = { appOpened: false, wdaStarted: false, ready: false };
  let code = 1, mon = null;
  try {
    log(`sim session ${id} (owner ${owner}, window ${window}${functional ? `, functional, lock mode ${gate.mode}` : ''}): ${warm ? `reusing the booted ${device().name} (I-063: idle ${rec.boot.idleSec} s, session ${rec.boot.sessionsOnBoot} on this boot)` : `booting ${device().name}${rec.boot.afterWarm ? ' (a timing session cold-boots: the warm device was shut down first, I-063)' : ''}`}`);
    if (warm) { await stopOne('wda', () => {}); await stopOne('proxy', () => {}); } // none normally: the last session stopped them
    const boot = await bootDevice(cfg.udid, { abort: ac.signal, log, warm: !!warm });
    if (!warm) rec.boot.bootedAt = new Date().toISOString();
    rec.safariCache = boot?.safariCache ?? null; // meta.sim.safariCache of every record of this session (I-052)
    writePrivate(sessionFile(), JSON.stringify(rec, null, 1));
    if (window === 'shown') { const was = simAppRunning(); openSimApp(cfg.udid); state.appOpened = !was; }
    if (interrupted) throw new Error(`interrupted by ${interrupted}`);
    await startProxy({ owner, session: id, log });
    if (tip) { rec.tipDismissed = await tip({ udid: cfg.udid, state, log }); writePrivate(sessionFile(), JSON.stringify(rec, null, 1)); }
    if (interrupted) throw new Error(`interrupted by ${interrupted}`);
    // I-082: wait (bounded) for the Simulator's own background CPU to settle, then record it during the command, so its
    // counts carry the context (tools/lib/sim-background.mjs; read-only, nothing in the Simulator is stopped)
    const cmdRoom = Number.isFinite(gate.endsAt) ? (gate.endsAt - Date.now() - cleanupMs) / 1000 : Infinity;
    const settled = await BG.settle({ maxSec: Math.max(0, Math.min(bgCfg.settleSec, Math.floor(cmdRoom * 0.25))), limitPct: bgCfg.limitPct, abort: ac.signal });
    rec.background = { settle: settled, limitPct: bgCfg.limitPct, everySec: bgCfg.everySec, file: 'sim/background.jsonl' };
    writePrivate(sessionFile(), JSON.stringify(rec, null, 1));
    log(BG.settleLine(settled));
    BG.appendJsonl(backgroundFile(), { session: id, owner, kind: 'settle', boot: rec.boot?.mode ?? null, at: new Date().toISOString(), ...settled });
    if (interrupted) throw new Error(`interrupted by ${interrupted}`);
    mon = BG.monitor({ everySec: bgCfg.everySec, limitPct: bgCfg.limitPct, onWindow: (w) => BG.appendJsonl(backgroundFile(), { session: id, owner, kind: 'window', ...w }) });
    const env = { ...process.env, FW_SIM_SESSION: id, FW_SIM_BACKGROUND_LOG: backgroundFile(), FW_SIM_PORT: String(p.tabs), FW_IPHONE_PORT: String(p.tabs), FW_SIM_DEVICE_PORT: String(p.list), FW_SIM_WDA_PORT: String(p.wda), FW_SIM_UDID: cfg.udid, FW_SIM_DEVICE: device().key, ...(functional ? { FW_SIM_FUNCTIONAL: '1' } : {}) };
    const timeoutMs = Number.isFinite(gate.endsAt) ? Math.max(1000, gate.endsAt - Date.now() - cleanupMs) : 0;
    log(`SIM_READY tabs :${p.tabs}; running: ${scrub([cmd, ...args].join(' '))}${timeoutMs ? ` (stopped after ${Math.round(timeoutMs / 1000)} s, before your hold ends)` : ''}`);
    const ids = knownIds();
    state.ready = true;
    const r = await runChild(cmd, args, { env, timeoutMs, abort: ac.signal, onOut: (l, s) => (s === 'stdout' ? log : err)(scrub(l, ids)) });
    if (r.error) throw new Error(`could not start ${cmd}: ${r.error.code || r.error.message}`);
    code = r.timedOut ? 124 : r.aborted ? 128 + ({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 }[interrupted] || 15) : r.status ?? 128;
    if (r.timedOut) err(`sim session: the command was stopped after ${Math.round(timeoutMs / 1000)} s so the Simulator shuts down before your chrome-measure hold ends`);
    return code;
  } catch (e) {
    if (interrupted) { err(scrub(e.message)); return 128 + ({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 }[interrupted] || 15); }
    throw e;
  } finally {
    const clog = (s) => log(`cleanup: ${scrub(s)}`);
    if (mon) { // I-082: the background during the command, before cleanup changes it
      try { const sum = mon.stop(); log(BG.summaryLine(sum)); const { windows, ...rest } = sum; BG.appendJsonl(backgroundFile(), { session: id, owner, kind: 'summary', at: new Date().toISOString(), code, interrupted, ...rest }); } catch (e) { clog(`background summary failed: ${e.message}`); }
    }
    try { const w = pidInfo('wda'); if (w && w.session === id) await stopOne('wda', clog); } catch (e) { clog(`wda stop failed: ${e.message}`); }
    try { await stopOne('proxy', clog); } catch (e) { clog(`proxy stop failed: ${e.message}`); }
    // I-063: a functional session that got to its command and ended without a signal keeps fw-sim booted for the next
    // one (a keeper shuts it down later); a timing session, an interrupted or failed start, FW_SIM_IDLE_SEC=0 or a
    // timing hold waiting for chrome-measure shut it down now
    let kept = null;
    try {
      const idle = idleSec();
      const demand = functional && idle > 0 && state.ready && !interrupted ? timingDemand(lockStatus('chrome-measure')) : null;
      if (demand) clog(`not keeping ${device().key} booted: ${demand}`);
      else if (functional && idle > 0 && state.ready && !interrupted) kept = await warmOut({ udid: cfg.udid, owner, boot: rec.boot, idle, log: clog });
    } catch (e) { clog(`keeping ${device().key} booted failed (${e.message}): shutting it down`); try { await stopOne('keeper', clog); } catch {} rmSync(warmFile(), { force: true }); kept = null; }
    if (!kept) { try { await shutdownDevice(cfg.udid, { log: clog }); } catch (e) { clog(`shutdown failed: ${e.message}`); } }
    if (state.appOpened) {
      try { quitSimApp(); clog('Simulator.app quit'); } catch {}
      // review-i063 N3: whether quitting Simulator.app shuts its devices down is a setting there; a kept device is
      // read again, so no record says "booted" for a device that is not
      if (kept) {
        let st;
        try { st = deviceState(cfg.udid); } catch {}
        if (st !== undefined && st !== 'Booted') { clog(`${device().key} is ${st ?? 'gone'} after Simulator.app quit: not kept`); try { await stopOne('keeper', clog); } catch {} rmSync(warmFile(), { force: true }); }
      }
    }
    // I-078: a shutdown still in progress (Simulator.app shuts its devices down after the quit returns) ends before the
    // simulator lock goes to the next session, within this hold's time (not after a signal: the join side waits then)
    try {
      const st = interrupted ? null : deviceState(cfg.udid);
      if (isTransitional(st)) {
        const room = Number.isFinite(gate.endsAt) ? Math.floor((gate.endsAt - Date.now()) / 1000) - 10 : Infinity;
        const s = await settleDevice(cfg.udid, { maxSec: Math.max(0, Math.min(transitionWaitSec(), room)), abort: ac.signal });
        clog(`waited ${s.waitedSec} s for ${device().key} to finish ${st} (${s.settled ? `now ${s.state ?? 'gone'}` : `still ${s.state}: the next session waits for it`}; I-078)`);
      }
    } catch (e) { clog(`${device().key} state check failed: ${e.message}`); }
    rmSync(sessionFile(), { force: true });
    try { await simLock.release(); } catch (e) { clog(`${SIM_LOCK} lock release failed: ${e.message}`); }
    for (const [s, h] of handlers) process.off(s, h);
  }
}
