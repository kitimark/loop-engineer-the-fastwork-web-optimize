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
//     never erases the device (Safari's first-run tip would come back).
// Test doubles name the executables: $FW_SIMCTL (takes simctl's arguments; default `xcrun simctl`), $FW_IWDP,
// $FW_LSOF, $FW_IDEVICE_ID, $FW_XCODEBUILD, $FW_OPEN, $FW_OSASCRIPT. Ports: $FW_SIM_DEVICE_PORT (9231),
// $FW_SIM_PORT (9232), $FW_SIM_WDA_PORT (8101); the phone's 9221/9222/8100 are refused.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, openSync, closeSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { sharedStateDir } from './paths.mjs';
import { status as lockStatus, parseHeld, staleReason, pidAlive, tryAcquire, dequeue, release as lockRelease, isGroup, slotIn, timedInSlotRefusal, SHARED_LANE } from './lock.mjs';
import { redact } from './redact.mjs';

export const SIM_NAME = 'fw-sim 15 Pro Max';
export const DEVICE_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro-Max';
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
export const configFile = () => file('config.json');
export const iwdpCfgFile = () => file('iwdp.cfg');
export const sessionFile = () => file('session.json');
const pidFile = (name) => file(`${name}.pid.json`);
export const logFile = (name) => file(`${name}.log`);
function ensureDir() { mkdirSync(simDir(), { recursive: true, mode: 0o700 }); }
const readJson = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
function writePrivate(f, text) { ensureDir(); writeFileSync(f, text, { mode: 0o600 }); chmodSync(f, 0o600); }

export const readConfig = () => readJson(configFile(), {});
export function writeConfig(c) { writePrivate(configFile(), JSON.stringify(c, null, 1)); }
export const readSession = () => readJson(sessionFile(), null);
/** The session record if its process still runs, else null. */
export function liveSession() { const s = readSession(); return s && pidAlive(s.pid) ? s : null; }

// ---- privacy: no UDID leaves this machine (Hard rule 12) ------------------------------------------------------
/** Every id we know of: the Simulator's UDID (config) and the phone UDIDs in iwdp.cfg. */
export function knownIds() {
  const ids = new Set();
  const c = readConfig();
  if (c.udid) ids.add(c.udid);
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
/** Available iOS runtimes, newest first: [{identifier, name, version, buildversion}]. */
export function listRuntimes() {
  const r = simctl(['list', '-j', 'runtimes']);
  if (r.status !== 0) throw new Error(`simctl list runtimes failed (${failText(r)})`);
  const vkey = (v) => String(v).split('.').map((x) => x.padStart(4, '0')).join('.');
  return (JSON.parse(r.stdout).runtimes || []).filter((x) => x.isAvailable !== false && (x.platform ? x.platform === 'iOS' : /iOS/.test(x.identifier)))
    .map((x) => ({ identifier: x.identifier, name: x.name, version: x.version, buildversion: x.buildversion }))
    .sort((a, b) => vkey(b.version).localeCompare(vkey(a.version)));
}
/** The fw-sim device: the configured UDID if it still exists, else the first one named SIM_NAME of our type. */
export function findDevice(cfg = readConfig(), devices = listDevices()) {
  return (cfg.udid && devices.find((d) => d.udid === cfg.udid)) || devices.find((d) => d.name === SIM_NAME && d.deviceTypeIdentifier === DEVICE_TYPE) || null;
}
export function xcodeVersion() {
  const r = spawnSync(exe('FW_XCODEBUILD', 'xcodebuild'), ['-version'], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) return null;
  const v = (r.stdout.match(/^Xcode\s+(\S+)/m) || [])[1], b = (r.stdout.match(/^Build version\s+(\S+)/m) || [])[1];
  return v ? `${v}${b ? ` (${b})` : ''}` : null;
}

/** `sim.mjs setup`: create the device if absent (newest iOS runtime, or `runtime`: identifier, name or version); store config. */
export function setup({ runtime = null, log = console.log } = {}) {
  const cfg = readConfig();
  const rts = listRuntimes();
  let dev = findDevice(cfg);
  if (!dev) {
    const rt = runtime ? rts.find((x) => [x.identifier, x.name, x.version].includes(runtime)) : rts[0];
    if (!rt) throw new Error(runtime ? `no installed iOS runtime "${runtime}" (installed: ${rts.map((x) => x.name).join(', ') || 'none'}); a runtime download is the user's decision` : 'no iOS Simulator runtime installed (Xcode > Settings > Components); a runtime download is the user\'s decision');
    const r = simctl(['create', SIM_NAME, DEVICE_TYPE, rt.identifier]);
    if (r.status !== 0) throw new Error(`simctl create failed (${failText(r)})`);
    dev = findDevice({ udid: r.stdout.trim() });
    if (!dev) throw new Error('simctl create succeeded, but the new device is not listed');
    log(`created ${SIM_NAME} on ${rt.name}`);
  } else log(`${SIM_NAME} exists (${dev.state})`);
  const rt = rts.find((x) => x.identifier === dev.runtimeId);
  const next = { ...cfg, udid: dev.udid, name: dev.name, runtime: rt?.name ?? dev.runtimeId, runtimeId: dev.runtimeId, runtimeBuild: rt?.buildversion ?? null, deviceType: dev.deviceTypeIdentifier, xcode: xcodeVersion(), setupAt: new Date().toISOString() };
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
  if (!socket) throw new Error('no Simulator web inspector socket (lsof -aUc launchd_sim): is fw-sim booted with Safari running?');
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

// ---- boot / shutdown -------------------------------------------------------------------------------------------------
export function deviceState(udid) { return listDevices().find((d) => d.udid === udid)?.state ?? null; }

/** Boot, wait for bootstatus, launch Safari and wait for its inspector socket. Throws on failure (the caller shuts down). */
export async function bootDevice(udid, { abort, log = () => {}, bootTimeoutMs = 300000 } = {}) {
  const t0 = Date.now();
  let r = await simctlAsync(['boot', udid], { timeoutMs: 120000, abort });
  if (r.aborted) throw new Error('interrupted during boot');
  if (r.status !== 0 && deviceState(udid) !== 'Booted') throw new Error(`simctl boot failed (${r.error ? r.error.code : `exit ${r.status}`}): ${r.stdout.trim().split('\n').slice(-2).join(' | ')}`);
  r = await simctlAsync(['bootstatus', udid, '-b'], { timeoutMs: bootTimeoutMs, abort });
  if (r.aborted) throw new Error('interrupted during bootstatus');
  if (r.status !== 0) throw new Error(`simctl bootstatus failed (${r.timedOut ? 'timed out' : `exit ${r.status}`})`);
  r = await simctlAsync(['launch', udid, SAFARI], { timeoutMs: 60000, abort });
  if (r.aborted) throw new Error('interrupted during the Safari launch');
  if (r.status !== 0) throw new Error(`simctl launch Safari failed (exit ${r.status})`);
  for (let i = 0; i < 60; i++) {
    if (abort?.aborted) throw new Error('interrupted while waiting for the inspector socket');
    if (findSocket()) { log(`booted in ${Math.round((Date.now() - t0) / 1000)} s, Safari running`); return; }
    await sleep(500);
  }
  throw new Error('Safari runs, but no web inspector socket appeared in 30 s');
}
/** Shut fw-sim down if it is not already (cleanup: always attempted, errors logged, never thrown). */
export async function shutdownDevice(udid, { log = () => {} } = {}) {
  let st = null;
  try { st = deviceState(udid); } catch (e) { log(`simctl list failed during cleanup: ${e.message}`); }
  if (st === 'Shutdown') return 'already shut down';
  const r = await simctlAsync(['shutdown', udid], { timeoutMs: 120000 });
  const res = r.status === 0 ? 'shut down' : `shutdown failed (exit ${r.status ?? r.signal}); run: node tools/sim.mjs doctor --fix`;
  log(`fw-sim ${res}`);
  return res;
}

/** `sim.mjs status` lines (UDIDs masked). */
export async function statusLines() {
  const out = [];
  const cfg = readConfig();
  out.push(`config:   ${cfg.udid ? `device ${mask(cfg.udid)}, ${cfg.runtime} (${cfg.runtimeBuild ?? '?'}), Xcode ${cfg.xcode ?? '?'}, tip ${cfg.tip?.state ?? 'unchecked'}` : 'none (node tools/sim.mjs setup)'}`);
  let dev = null;
  try { dev = findDevice(cfg); } catch (e) { out.push(`device:   simctl failed (${e.message})`); }
  if (dev || cfg.udid) out.push(`device:   ${dev ? `${dev.name}: ${dev.state}` : 'not found (node tools/sim.mjs setup)'}`);
  const s = readSession();
  out.push(`session:  ${s ? `${pidAlive(s.pid) ? 'live' : 'DEAD (stale record)'} pid ${s.pid}, owner ${s.owner}, window ${s.window}, since ${s.startedAt}` : 'none'}`);
  for (const n of ['proxy', 'wda']) { const r = pidInfo(n); out.push(`${n.padEnd(9)} ${r ? (r.ours ? `running pid ${r.pid} since ${r.startedAt} (by ${r.owner})` : `stale pidfile (pid ${r.pid})`) : 'not running'}`); }
  let p = null;
  try { p = ports(); } catch (e) { out.push(`ports:    ${e.message}`); }
  if (p) {
    const d = await proxyDevices(p).catch(() => null);
    out.push(`proxy:    :${p.list} ${d ? (d.ok ? 'lists SIMULATOR only' : `lists ${d.n} device(s), ${d.other} non-simulator`) : 'not reachable'}; tabs :${p.tabs}; WDA-sim :${p.wda}`);
  }
  return out;
}

/** `sim.mjs doctor [--fix]`: a booted fw-sim (or a running proxy / WDA-sim) without a live session is a leak. */
export async function doctor({ fix = false, log = console.log } = {}) {
  const cfg = readConfig();
  const live = liveSession();
  const dev = cfg.udid ? findDevice(cfg) : null;
  const problems = [];
  if (!live && readSession()) problems.push('stale session record');
  if (dev && dev.state !== 'Shutdown' && !live) problems.push(`LEAK: ${SIM_NAME} is ${dev.state} with no live session`);
  for (const n of ['proxy', 'wda']) { const r = pidInfo(n); if (r && (!live || r.session !== live.id)) problems.push(`${n}: ${r.ours ? `running (pid ${r.pid}) outside a live session` : 'stale pidfile'}`); }
  if (!problems.length) { log(`ok: ${live ? `live session pid ${live.pid} (owner ${live.owner})` : 'no session, nothing booted, no proxy'}`); return 0; }
  for (const p of problems) log(p);
  if (!fix) { log('run: node tools/sim.mjs doctor --fix (stops our proxy / WDA-sim, shuts fw-sim down)'); return 3; }
  for (const n of ['wda', 'proxy']) await stopOne(n, log);
  if (dev && dev.state !== 'Shutdown') await shutdownDevice(dev.udid, { log });
  if (!live) rmSync(sessionFile(), { force: true });
  log('fixed');
  return 0;
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
  const cfg = readConfig();
  if (!cfg.udid) throw new Error('no Simulator configured: node tools/sim.mjs setup');
  const dev = findDevice(cfg);
  if (!dev || dev.udid !== cfg.udid) throw new Error(`${SIM_NAME} (configured) not found: node tools/sim.mjs setup`);
  // one fw-sim: the `simulator` lock closes the race of two sessions reading "no live session" at once (two functional
  // sessions in a raised-cap group). Its wait leaves the boot, the command and the cleanup inside the hold.
  const left = Number.isFinite(gate.endsAt) ? (gate.endsAt - Date.now() - cleanupMs) / 1000 - 60 : 120;
  const simLock = await takeSimLock(owner, { waitSec: simLockWaitSec ?? Math.max(0, Math.min(120, Math.floor(left))), meta: { cmd: 'sim session', functional }, log: err });
  let rec, id;
  try {
    const other = liveSession();
    if (other) throw new Error(`a Simulator session is already running (pid ${other.pid}, owner "${other.owner}")`);
    if (dev.state !== 'Shutdown') throw new Error(`refusing: ${SIM_NAME} is already ${dev.state} (booted by someone else, or a leaked session: node tools/sim.mjs doctor)`);
    id = randomBytes(6).toString('hex');
    rec = { id, pid: process.pid, owner, window, startedAt: new Date().toISOString(), proxyPorts: p, tipDismissed: cfg.tip?.state ?? 'unchecked', ...(functional ? { functional: true, lock: { mode: gate.mode } } : {}) };
  } catch (e) { await simLock.release(); throw e; }
  writePrivate(sessionFile(), JSON.stringify(rec, null, 1));
  const ac = new AbortController();
  let interrupted = null;
  const onSig = (sig) => () => { if (!interrupted) { interrupted = sig; err(`sim session: ${sig}: stopping, then cleaning up`); } ac.abort(); };
  const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => [s, onSig(s)]);
  for (const [s, h] of handlers) process.on(s, h);
  const state = { appOpened: false, wdaStarted: false };
  let code = 1;
  try {
    log(`sim session ${id} (owner ${owner}, window ${window}${functional ? `, functional, lock mode ${gate.mode}` : ''}): booting ${SIM_NAME}`);
    await bootDevice(cfg.udid, { abort: ac.signal, log });
    if (window === 'shown') { const was = simAppRunning(); openSimApp(cfg.udid); state.appOpened = !was; }
    if (interrupted) throw new Error(`interrupted by ${interrupted}`);
    await startProxy({ owner, session: id, log });
    if (tip) { rec.tipDismissed = await tip({ udid: cfg.udid, state, log }); writePrivate(sessionFile(), JSON.stringify(rec, null, 1)); }
    if (interrupted) throw new Error(`interrupted by ${interrupted}`);
    const env = { ...process.env, FW_SIM_SESSION: id, FW_SIM_PORT: String(p.tabs), FW_IPHONE_PORT: String(p.tabs), FW_SIM_DEVICE_PORT: String(p.list), FW_SIM_WDA_PORT: String(p.wda), FW_SIM_UDID: cfg.udid, ...(functional ? { FW_SIM_FUNCTIONAL: '1' } : {}) };
    const timeoutMs = Number.isFinite(gate.endsAt) ? Math.max(1000, gate.endsAt - Date.now() - cleanupMs) : 0;
    log(`SIM_READY tabs :${p.tabs}; running: ${scrub([cmd, ...args].join(' '))}${timeoutMs ? ` (stopped after ${Math.round(timeoutMs / 1000)} s, before your hold ends)` : ''}`);
    const ids = knownIds();
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
    try { const w = pidInfo('wda'); if (w && w.session === id) await stopOne('wda', clog); } catch (e) { clog(`wda stop failed: ${e.message}`); }
    try { await stopOne('proxy', clog); } catch (e) { clog(`proxy stop failed: ${e.message}`); }
    try { await shutdownDevice(cfg.udid, { log: clog }); } catch (e) { clog(`shutdown failed: ${e.message}`); }
    if (state.appOpened) { try { quitSimApp(); clog('Simulator.app quit'); } catch {} }
    rmSync(sessionFile(), { force: true });
    try { await simLock.release(); } catch (e) { clog(`${SIM_LOCK} lock release failed: ${e.message}`); }
    for (const [s, h] of handlers) process.off(s, h);
  }
}
