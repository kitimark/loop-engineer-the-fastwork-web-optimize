// The iPhone's USB link to the Mac, read-only, plus the one repair we may make (incident I-222; I-173, I-216, I-235,
// I-239). Five drops on 2026-10-06/07 had one shape: the Mac's USB bus (IOUSB) still lists an "iPhone", usbmux lists no
// device, ios_webkit_debug_proxy :9222 refuses and :9221 returns []; only a re-plug brought it back, and once (I-235)
// the long-running proxy then listed nothing until it was restarted. CLI: tools/usblink.mjs.
//
// Three reads, none of which talks to the phone:
//   IOUSB    `ioreg -p IOUSB -w0 -l -r -n iPhone` ($FW_IOREG; `off`: no read): the iPhone node on the Mac's USB bus, its
//            current configuration and speed code (kept as numbers for the drop records; no serials, no names)
//   usbmux   usbmuxd's ListDevices over its socket (tools/lib/usbmux.mjs listDevices, $FW_USBMUXD_SOCKET): USB entries
//            only; with a WDA config (knownDevice().udid) only that phone counts, else the only USB device
//   proxy    GET http://127.0.0.1:<list port>/json ($FW_IPHONE_DEVICE_PORT, 9221): the proxy's device list, counted only
//            (the entries carry the device name and id, Hard rule 12: never kept or printed)
// States (evaluate): ok | unplugged (no iPhone on IOUSB, none on usbmux) | usb-lost (IOUSB has it, usbmux does not) |
// proxy-stale (usbmux has it, the proxy has listed none for more than staleAfter, default 30 s) | proxy-down (usbmux has
// it, nothing answers on the list port) | unknown (usbmuxd gave no list, or IOUSB unreadable with the phone off usbmux).
// Between the first empty proxy list and staleAfter the state is `attaching` (the proxy re-attaches by itself after a
// re-plug within seconds, I-239): `status` waits it out, `watch` logs it.
//
// The repair (proxy-stale only): restart the proxy that `usblink.mjs proxy start` started. Its pidfile
// (<state dir>/usblink/proxy.json: pid, the -c argument, the process start time) is the only key: a pid whose command
// line lacks that -c argument, names a Simulator socket (`-s unix:`), or started at another time (a reused pid) is not
// ours and is never signalled. Every start, stop, restart and refusal is one JSON line in <state dir>/usblink/audit.log
// (no ids). The proxy's own output goes to <state dir>/usblink/proxy.log (0600, local, never printed: it names the phone).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, openSync, closeSync, rmSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { sharedStateDir } from './paths.mjs';
import { listDevices, usbAttachIn } from './usbmux.mjs';
import { knownDevice } from './redact.mjs';
import { pidAlive } from './wait.mjs';

export const LINK_STATES = Object.freeze(['ok', 'unplugged', 'usb-lost', 'proxy-stale', 'proxy-down', 'unknown']);
/** `usblink.mjs status` exit codes, one per state (2: usage). */
export const LINK_EXIT = Object.freeze({ ok: 0, usage: 2, unplugged: 3, 'usb-lost': 4, 'proxy-stale': 5, 'proxy-down': 6, unknown: 7 });
export const LINK_DEFAULTS = Object.freeze({ staleAfterSec: 30, everySec: 10, minEverySec: 1, repairGapSec: 120, maxRepairs: 3, replugStepSec: 60 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmm = (t) => new Date(t).toISOString().slice(11, 16) + 'Z';
const dur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 120 ? `${s} s` : `${Math.round(s / 60)} min`; };

// ---- the three reads ---------------------------------------------------------------------------------------------

/** `ioreg -p IOUSB -w0 -l -r -n iPhone` output -> {count, config, speed} (the first iPhone's numbers; null when absent). */
export function parseIoreg(text) {
  let count = 0, cur = null;
  const first = { config: null, speed: null };
  for (const l of String(text || '').split('\n')) {
    if (/\+-o /.test(l)) { cur = /\+-o iPhone@[0-9A-Fa-f]+\s+<class IOUSB(Host)?Device\b/.test(l) ? ++count : null; continue; }
    if (cur !== 1) continue;
    let m;
    if ((m = l.match(/"kUSBCurrentConfiguration" = (\d+)/))) first.config = Number(m[1]);
    else if ((m = l.match(/"Device Speed" = (\d+)/))) first.speed = Number(m[1]);
  }
  return { count, ...first };
}

/** The iPhone on the Mac's USB bus: parseIoreg's {count, config, speed}, or null (ioreg off, missing or failing). */
export function ioUsbIphone({ exe = process.env.FW_IOREG || 'ioreg', timeoutMs = 10000 } = {}) {
  if (exe === 'off') return null;
  const r = spawnSync(exe, ['-p', 'IOUSB', '-w0', '-l', '-r', '-n', 'iPhone'], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
  if (r.error || r.status !== 0) return null;
  return parseIoreg(r.stdout);
}

/** For phone-temp (I-222): why the phone is off usbmux, from IOUSB: 'usb-lost', 'unplugged' or null (no read). */
export function ioUsbLinkCause(opts) {
  const io = ioUsbIphone(opts);
  return io ? (io.count > 0 ? 'usb-lost' : 'unplugged') : null;
}

/** usbmux's view of the phone: {count (USB entries), listed, id (its attach DeviceID)} or null (no list). */
export async function muxPhone({ udid = knownDevice().udid, ...opts } = {}) {
  const devs = await listDevices(opts);
  if (!Array.isArray(devs)) return null;
  const a = usbAttachIn(devs, udid);
  return { count: devs.filter((d) => d.type === 'USB').length, listed: !!a?.listed, id: a?.listed ? a.id : null };
}

/** The proxy's device list port and tab ports ($FW_IPHONE_DEVICE_PORT 9221, $FW_IPHONE_PORT 9222 .. +100). */
export function proxyPorts(env = process.env) {
  const list = Number(env.FW_IPHONE_DEVICE_PORT || 9221), tabs = Number(env.FW_IPHONE_PORT || 9222);
  return { list, tabs, last: tabs + 100 };
}
/** The -c argument our proxy runs with: the lead's command line since 04:13Z (I-235), `null:9221,:9222-9322`. */
export const proxyConfigArg = ({ list, tabs, last } = proxyPorts()) => `null:${list},:${tabs}-${last}`;

/** The proxy's device list: {count} | {refused: true, code} (nothing listens) | {error} (no answer, not JSON). */
export function proxyDevices({ port = proxyPorts().list, timeoutMs = 3000 } = {}) {
  // a fresh connection per read (agent: false): a pooled keep-alive socket of a proxy that died would read as a reset,
  // not as "nothing listens". 127.0.0.1: the proxy listens on IPv4 (lsof, 2026-10-07).
  return new Promise((done) => {
    let over = false;
    const end = (v) => { if (!over) { over = true; done(v); } };
    const req = http.get({ host: '127.0.0.1', port, path: '/json', agent: false, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => { try { const j = JSON.parse(body); end(Array.isArray(j) ? { count: j.length } : { error: 'not a device list' }); } catch { end({ error: 'not a device list' }); } });
      res.on('error', (e) => end({ error: e.code || e.message }));
    });
    req.on('timeout', () => { req.destroy(); end({ error: 'TimeoutError' }); });
    req.on('error', (e) => end(e.code === 'ECONNREFUSED' ? { refused: true, code: e.code } : { error: e.code || e.message }));
  });
}

/** One look at all three: {at, iousb, mux, proxy}. The proxy is only asked when usbmux has the phone. */
export async function sample({ now = Date.now, ioreg = ioUsbIphone, mux = muxPhone, proxy = proxyDevices } = {}) {
  const at = now();
  const [m, io] = [await mux().catch(() => null), (() => { try { return ioreg(); } catch { return null; } })()];
  const p = m?.listed ? await proxy().catch((e) => ({ error: String(e?.message || e) })) : null;
  return { at, iousb: io, mux: m, proxy: p };
}

// ---- the verdict -------------------------------------------------------------------------------------------------

/**
 * The link state of one sample. `prev` ({state, since, emptySince}) carries the time the proxy list was first seen empty
 * (proxy-stale needs staleAfterMs of it) and the start of the current state. -> {state, since, emptySince, line}.
 * `line` is one plain sentence without ids (the CLI prefixes "USBLINK <state>: ").
 */
export function evaluate(s, prev = {}, { staleAfterMs = LINK_DEFAULTS.staleAfterSec * 1000, list = proxyPorts().list } = {}) {
  const now = s.at;
  let state, line, emptySince = null;
  const io = s.iousb, m = s.mux, p = s.proxy;
  const ioText = io ? `IOUSB ${io.count ? `has the iPhone (configuration ${io.config ?? '?'}, speed code ${io.speed ?? '?'})` : 'has no iPhone'}` : 'IOUSB not readable';
  if (!m) { state = 'unknown'; line = `usbmuxd gave no device list (is it running?); ${ioText}`; }
  else if (!m.listed) {
    const other = m.count ? ` (${m.count} other USB device${m.count === 1 ? '' : 's'})` : '';
    if (io?.count) { state = 'usb-lost'; line = `the Mac's USB bus still has the iPhone, but usbmux does not list it${other}: the phone tools can't reach it; re-plug the iPhone's cable (phone unlocked)`; }
    else if (io) { state = 'unplugged'; line = `no iPhone on the Mac's USB bus or on usbmux${other}: plug the cable in (phone unlocked)`; }
    else { state = 'unknown'; line = `usbmux does not list the iPhone${other} and IOUSB is not readable (unplugged or usb-lost)`; }
  } else if (p?.refused) { state = 'proxy-down'; line = `usbmux has the iPhone (attach #${m.id}), but nothing answers on :${list} (${p.code}): start the proxy (node tools/usblink.mjs proxy start --by <you>)`; }
  else if (p && !p.error && p.count > 0) { state = 'ok'; line = `the iPhone is on USB (usbmux attach #${m.id}) and the proxy :${list} lists ${p.count} device${p.count === 1 ? '' : 's'}`; }
  else {
    emptySince = prev.emptySince ?? now;
    const what = p?.error ? `has not answered (${p.error})` : 'has listed no device';
    if (now - emptySince >= staleAfterMs) { state = 'proxy-stale'; line = `usbmux has the iPhone (attach #${m.id}), but the proxy :${list} ${what} for ${dur(now - emptySince)}: restart it (node tools/usblink.mjs proxy restart --by <you>: only a proxy usblink.mjs started)`; }
    else { state = 'attaching'; line = `usbmux has the iPhone (attach #${m.id}); the proxy :${list} ${what} for ${dur(now - emptySince)} (proxy-stale after ${dur(staleAfterMs)})`; }
  }
  const since = prev.state === state && Number.isFinite(prev.since) ? prev.since : now;
  if (since < now && state !== 'ok' && state !== 'attaching') line += ` (since ${hhmm(since)}, ${dur(now - since)})`;
  return { state, since, emptySince, line };
}

/** A drop record for the audit log: the numbers that may explain a drop later (no ids, no names). */
export const sampleFacts = (s) => ({
  iousb: s.iousb ? { count: s.iousb.count, config: s.iousb.config, speed: s.iousb.speed } : null,
  mux: s.mux ? { usb: s.mux.count, listed: s.mux.listed, attach: s.mux.id } : null,
  proxy: s.proxy ? (s.proxy.refused ? { refused: s.proxy.code } : s.proxy.error ? { error: s.proxy.error } : { count: s.proxy.count }) : null,
});

// ---- shared state: <state dir>/usblink/ ------------------------------------------------------------------------------

export const linkDir = () => join(sharedStateDir(), 'usblink');
export const stateFile = () => join(linkDir(), 'state.json');
export const auditFile = () => join(linkDir(), 'audit.log');
export const proxyFile = () => join(linkDir(), 'proxy.json');
export const proxyLogFile = () => join(linkDir(), 'proxy.log');

function writeJsonAtomic(file, obj) {
  mkdirSync(linkDir(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n', { mode: 0o600 });
  renameSync(tmp, file);
}
const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

/** One audit line (JSON) in <state dir>/usblink/audit.log. */
export function audit(event) {
  mkdirSync(linkDir(), { recursive: true });
  appendFileSync(auditFile(), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n', { mode: 0o600 });
}
export const readLinkState = () => readJson(stateFile());
export const writeLinkState = (s) => writeJsonAtomic(stateFile(), s);

// ---- the proxy we start (and only that one) ------------------------------------------------------------------------

/** The process's start time (ms) from `ps -o lstart=`, or null. */
export function procStart(pid) {
  const r = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' });
  const t = r.status === 0 ? Date.parse(r.stdout.trim()) : NaN;
  return Number.isFinite(t) ? t : null;
}
const procCommand = (pid) => { const r = spawnSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : ''; };
export const readProxyRecord = () => readJson(proxyFile());

/**
 * Is `rec` (the pidfile) a live proxy that usblink.mjs started? {ours, why}. Ours only when the pid runs, its command
 * line has our -c argument and no `-s unix:` (a Simulator proxy, tools/lib/sim.mjs), and it started when we recorded.
 * `ps` ({command(pid), start(pid)}) is for tests.
 */
export function isOurProxy(rec, { alive = pidAlive, command = procCommand, start = procStart } = {}) {
  if (!rec || !Number.isInteger(rec.pid)) return { ours: false, why: 'no proxy started by usblink.mjs (no pidfile)' };
  if (!alive(rec.pid)) return { ours: false, why: `the proxy usblink.mjs started (pid ${rec.pid}) has exited`, dead: true };
  const cmd = command(rec.pid);
  if (!rec.match || !cmd.includes(rec.match)) return { ours: false, why: `pid ${rec.pid} is another program now (its command line lacks ${rec.match || 'our -c argument'})` };
  if (/(^|\s)-s\s+unix:/.test(cmd) || /--simulator-webinspector[= ]unix:/.test(cmd)) return { ours: false, why: `pid ${rec.pid} is a Simulator proxy (-s unix:)` };
  const t = start(rec.pid);
  if (Number.isFinite(rec.procStart) && (t === null || Math.abs(t - rec.procStart) > 2000)) return { ours: false, why: `pid ${rec.pid} started at another time than the proxy we recorded (a reused pid)` };
  return { ours: true, why: `pid ${rec.pid}, started by ${rec.by || '?'} at ${rec.startedAt}` };
}

const proxyExe = () => process.env.FW_IWDP_PHONE || 'ios_webkit_debug_proxy';

async function waitPort(port, want, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const p = await proxyDevices({ port, timeoutMs: 1000 });
    if (want === 'up' ? !p.refused : p.refused) return true;
    if (Date.now() >= end) return false;
    await sleep(200);
  }
}

/**
 * Start the phone's proxy detached (`ios_webkit_debug_proxy -c null:9221,:9222-9322`) and record it. Refuses when
 * something already answers on the list port (a proxy we did not start: never a second one). -> {ok, pid, why}.
 */
export async function startProxy({ by, reason = null, ports = proxyPorts() } = {}) {
  if (!by) throw new Error('--by <your agent name> is required');
  const before = await proxyDevices({ port: ports.list, timeoutMs: 2000 });
  if (!before.refused) {
    const why = `something already answers on :${ports.list}: ${isOurProxy(readProxyRecord()).ours ? 'the proxy usblink.mjs started (proxy restart restarts it)' : 'a proxy usblink.mjs did not start (stop it by hand once, then proxy start)'}`;
    audit({ event: 'proxy-start-refused', by, reason, why });
    return { ok: false, why };
  }
  mkdirSync(linkDir(), { recursive: true });
  const cfg = proxyConfigArg(ports);
  const fd = openSync(proxyLogFile(), 'a', 0o600);
  const p = spawn(proxyExe(), ['-c', cfg], { detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  try { chmodSync(proxyLogFile(), 0o600); } catch {}
  const spawned = await new Promise((res) => { p.once('spawn', () => res(true)); p.once('error', (e) => res(e)); });
  if (spawned !== true) { audit({ event: 'proxy-start-failed', by, reason, why: spawned.code || spawned.message }); return { ok: false, why: `could not start ${proxyExe()}: ${spawned.code || spawned.message}` }; }
  p.unref();
  const rec = { pid: p.pid, match: `-c ${cfg}`, exe: proxyExe().split('/').pop(), ports, by, reason, startedAt: new Date().toISOString(), procStart: procStart(p.pid) };
  writeJsonAtomic(proxyFile(), rec);
  const up = await waitPort(ports.list, 'up', 5000);
  audit({ event: 'proxy-start', by, reason, pid: p.pid, up });
  return up ? { ok: true, pid: p.pid, why: `started (pid ${p.pid}), :${ports.list} answers` } : { ok: false, pid: p.pid, why: `started (pid ${p.pid}), but :${ports.list} does not answer after 5 s (see ${proxyLogFile()})` };
}

/** Stop the proxy usblink.mjs started (never another one). -> {ok, pid, why}. */
export async function stopProxy({ by, reason = null, event = 'proxy-stop' } = {}) {
  if (!by) throw new Error('--by <your agent name> is required');
  const rec = readProxyRecord();
  const o = isOurProxy(rec);
  if (!o.ours) {
    if (o.dead) rmSync(proxyFile(), { force: true });
    audit({ event: `${event}-refused`, by, reason, why: o.why });
    return { ok: !!o.dead, why: o.dead ? `${o.why}; pidfile removed` : `${o.why}: nothing stopped` };
  }
  try { process.kill(rec.pid, 'SIGTERM'); } catch {}
  for (let i = 0; i < 30 && pidAlive(rec.pid); i++) await sleep(100);
  if (pidAlive(rec.pid)) { try { process.kill(rec.pid, 'SIGKILL'); } catch {} for (let i = 0; i < 20 && pidAlive(rec.pid); i++) await sleep(100); }
  rmSync(proxyFile(), { force: true });
  await waitPort(rec.ports?.list ?? proxyPorts().list, 'down', 3000);
  audit({ event, by, reason, pid: rec.pid });
  return { ok: true, pid: rec.pid, why: `stopped pid ${rec.pid}` };
}

/** proxy-stale's repair: stop OUR proxy and start it again. A proxy we did not start: refused, nothing killed. */
export async function restartProxy({ by, reason = null } = {}) {
  if (!by) throw new Error('--by <your agent name> is required');
  const rec = readProxyRecord();
  const o = isOurProxy(rec);
  if (!o.ours && !o.dead) { audit({ event: 'proxy-restart-refused', by, reason, why: o.why }); return { ok: false, why: `${o.why}: not restarted (nothing killed); restart it by hand` }; }
  const st = await stopProxy({ by, reason, event: 'proxy-restart-stop' });
  if (!st.ok) return { ok: false, why: st.why };
  const s = await startProxy({ by, reason, ports: rec.ports ?? proxyPorts() });
  audit({ event: 'proxy-restart', by, reason, from: rec.pid, to: s.pid ?? null, ok: s.ok });
  return { ok: s.ok, from: rec.pid, pid: s.pid, why: s.ok ? `restarted the proxy (pid ${rec.pid} -> ${s.pid})` : s.why };
}

// ---- the re-plug console step (watch --post-step, the lead's) --------------------------------------------------------

export const REPLUG_TITLE = "Re-plug the iPhone's USB cable";
export const REPLUG_TEXT = 'The Mac lost the iPhone on USB (the cable is in, but the phone tools cannot reach it). Unplug the cable from the iPhone, wait 3 s, plug it back in, unlock the phone, then press Done. This step closes by itself when the link is back.';

/**
 * One pass of the re-plug step rule: usb-lost (or unplugged) for longer than `afterMs` -> post one action step, unless
 * the one we posted is still open, or the user finished ours less than `afterMs` ago (a re-plug that did not help gets
 * the next step only after another `afterMs`); the link ok again -> cancel our step if it is still open. `st` is the
 * watch's state ({state, since, step, stepClosedAt}); `console` = {post, get, cancel, open(step)} (tools/lib/console.mjs).
 * Returns {step, stepClosedAt, posted?, closed?, error?}: the next step and stepClosedAt for the state.
 */
export async function replugStepPass(st, { by, now, afterMs = LINK_DEFAULTS.replugStepSec * 1000, console: c }) {
  const lost = st.state === 'usb-lost' || st.state === 'unplugged';
  let cur = null;
  if (st.step) { try { cur = c.get(st.step); } catch { cur = null; } }
  if (cur && c.open(cur)) {
    if (st.state !== 'ok') return { step: st.step, stepClosedAt: null };
    try {
      await c.cancel(st.step, { by, note: 'the USB link is back (usblink.mjs: ok)' });
      audit({ event: 'replug-step-closed', by, step: st.step });
      return { step: null, stepClosedAt: null, closed: st.step };
    } catch (e) { return { step: st.step, stepClosedAt: null, error: e.message }; }
  }
  if (st.state === 'ok') return { step: null, stepClosedAt: null };
  const closedAt = st.step ? now : (st.stepClosedAt ?? null); // ours was finished (Done) or withdrawn elsewhere
  if (lost && now - st.since >= afterMs && (closedAt === null || now - closedAt >= afterMs)) {
    try {
      const s = await c.post({ by, kind: 'action', title: REPLUG_TITLE, instructions: REPLUG_TEXT });
      audit({ event: 'replug-step', by, step: s.id, state: st.state, since: new Date(st.since).toISOString() });
      return { step: s.id, stepClosedAt: null, posted: s.id };
    } catch (e) { return { step: null, stepClosedAt: closedAt, error: e.message }; }
  }
  return { step: null, stepClosedAt: closedAt };
}
