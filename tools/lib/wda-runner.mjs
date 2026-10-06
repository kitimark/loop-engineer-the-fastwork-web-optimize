// `node tools/iphone.mjs wda build|start|stop|status|check`: build, start and stop WebDriverAgent (the XCUITest
// runner that plays gesture strokes as real touches, research/architecture/finger-simulation.md) on the iPhone,
// and forward its port 8100 over USB with `iproxy 8100:8100`.
//
// Everything WDA lives OUTSIDE the repo, in $FW_WDA_HOME (default ~/.cache/fw-wda/): the WebDriverAgent
// sources (open source, Apache-2.0, cloned once by the user/agent at a pinned tag), DerivedData, build logs
// and config.json (team id, device UDID, runner bundle id: the user's account data, never committed, never
// printed in full). Pidfiles of the runner and iproxy live in the shared state dir
// (.git/fastwork-mirror/wda/), so every worktree sees one runner; `stop` kills only those pids, after checking
// that they still are our xcodebuild/iproxy.
//
//   wda status                   sources, build, profile expiry, runner/iproxy pids, /status (no lease)
//   wda check [--owner <o>]      I-112 preflight for phone block runners (no lease, read-only): exit 0 `WDA READY …`,
//                                exit 3 `WDA NOT READY: …` with the start command. Run it before a hold's start gate
//                                and pre-warm, so a block never spends them on a runner that is down
//   wda build --owner <o> [--ref vX] [--team ID] [--udid UDID] [--bundle-id ID]
//                                lease-guarded (xcodebuild talks to the device); xcodebuild build-for-testing is
//                                minutes of Mac CPU, so it runs only INSIDE your own chrome-measure hold
//                                (Hard rule 7: nobody's A/B can start mid-build):
//                                  node tools/lock.mjs run chrome-measure --owner <o> --max-seconds 600 -- \
//                                    node tools/iphone.mjs wda build --owner <o>
//                                A normal hold only (a short-lane hold is refused). xcodebuild runs in its own
//                                process group, stopped at min(BUILD_MAX_SEC, what is left of the hold's
//                                --max-seconds - 15 s) and on SIGINT/SIGTERM/SIGHUP (runGroup: never orphaned
//                                past the hold). The first build registers the device with the
//                                user's Apple account (free provisioning): the user's own one-time step
//   wda start --owner <o>        lease-guarded: xcodebuild test-without-building + iproxy, wait for /status,
//                                bring Safari to the front
//   wda ensure --owner <o> [--timeout 120] [--forward-wait S] [--usb-wait 20] [--retry-wait 10] [--no-retry]
//                                I-220, lease-guarded; for block kits at a part start instead of stop/start/check:
//                                READY -> kept (no restart). Else: usbmux must list the phone on USB (idevice_id -l,
//                                --usb-wait s); our runner up (ServerURLHere) -> restart iproxy only; else start the
//                                runner, stopping early on XCTest's "Timed out while enabling automation mode" and,
//                                then, once more after a clean stop (pidfiles + this tool's stale processes) and
//                                --retry-wait s. The forward gets --forward-wait s once the runner is up (default 30,
//                                60 when load1 > cores). Last line, exit: `WDA READY (kept|restarted...)` 0,
//                                `WDA REPLUG NEEDED: <why>` 4 (post a re-plug step, then re-run), `WDA NOT READY: <why>` 3
//   wda stop                     kill our runner and iproxy (no lease: cleanup must always work)
// Test doubles: $FW_XCODEBUILD, $FW_IPROXY, $FW_IDEVICE_ID, $FW_IDEVICEINFO, $FW_SECURITY name the executables.
// Everything printed goes through redact() (tools/lib/redact.mjs, Hard rule 12): no full team id, UDID,
// runner bundle id, device name, Apple Account e-mail or signing-identity name, also not in xcodebuild log tails.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, openSync, closeSync, rmSync, appendFileSync, statSync, fstatSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, loadavg, cpus } from 'node:os';
import { sharedStateDir } from './paths.mjs';
import { status as lockStatus, parseHeld, staleReason, pidAlive } from './lock.mjs';
import { status as wdaStatus, createSession, WDA_URL, SAFARI } from './wda.mjs';
import { redact } from './redact.mjs';

export const WDA_REF = 'v16.13.6'; // appium/WebDriverAgent tag, 2026-09-30; V0 confirms it launches on iOS 26.6.1
export const WDA_GIT = 'https://github.com/appium/WebDriverAgent';
export const wdaHome = () => process.env.FW_WDA_HOME || join(homedir(), '.cache', 'fw-wda');
export const srcDir = () => join(wdaHome(), 'WebDriverAgent');
export const derivedData = () => join(wdaHome(), 'DerivedData');
const configFile = () => join(wdaHome(), 'config.json');
const stateDir = () => join(sharedStateDir(), 'wda');
const pidFile = (name) => join(stateDir(), `${name}.json`);
const exe = (name, env) => process.env[env] || name;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Shorten an account or device id for printing (they stay on this machine, Hard rule 12). */
/** Whether an id is set, never any part of it (review-gesture-2: not even a prefix of the team id or UDID). */
export const mask = (s) => (s ? 'set' : '(unset)');

export function readConfig() { try { return JSON.parse(readFileSync(configFile(), 'utf8')); } catch { return {}; } }
export function writeConfig(c) { mkdirSync(wdaHome(), { recursive: true }); writeFileSync(configFile(), JSON.stringify(c, null, 1)); }

export const cloneCommand = (ref = WDA_REF) => `git clone --depth 1 --branch ${ref} ${WDA_GIT} ${srcDir()}`;

/** The xcodebuild build-for-testing arguments (signing with the user's team; unique runner bundle id). */
export function buildArgs({ udid, team, bundleId }) {
  return ['-project', join(srcDir(), 'WebDriverAgent.xcodeproj'), '-scheme', 'WebDriverAgentRunner', '-destination', `id=${udid}`,
    '-derivedDataPath', derivedData(), '-allowProvisioningUpdates', `DEVELOPMENT_TEAM=${team}`, `PRODUCT_BUNDLE_IDENTIFIER=${bundleId}`,
    'CODE_SIGN_STYLE=Automatic', 'build-for-testing'];
}
export const runnerArgs = ({ xctestrun, udid }) => ['test-without-building', '-xctestrun', xctestrun, '-destination', `id=${udid}`];
export const iproxyArgs = ({ udid, port = 8100 }) => [`${port}:8100`, '-u', udid];

/** The .xctestrun file a build-for-testing left in DerivedData, or null. */
export function findXctestrun(dd = derivedData()) {
  const p = join(dd, 'Build', 'Products');
  try { const f = readdirSync(p).filter((x) => x.endsWith('.xctestrun')).sort(); return f.length ? join(p, f.at(-1)) : null; } catch { return null; }
}

/** ExpirationDate from a decoded provisioning profile (plist XML), ISO string or null. */
export function parseExpiry(plist) {
  const m = String(plist || '').match(/<key>ExpirationDate<\/key>\s*<date>([^<]+)<\/date>/);
  return m ? new Date(m[1]).toISOString() : null;
}

function profileExpiry() {
  const dd = join(derivedData(), 'Build', 'Products');
  let app = null;
  try { for (const d of readdirSync(dd)) { const a = join(dd, d, 'WebDriverAgentRunner-Runner.app', 'embedded.mobileprovision'); if (existsSync(a)) app = a; } } catch {}
  if (!app) return null;
  const r = spawnSync(exe('security', 'FW_SECURITY'), ['cms', '-D', '-i', app], { encoding: 'utf8' });
  return r.status === 0 ? parseExpiry(r.stdout) : null;
}

/** A normal hold's xcodebuild cap: inside the ~10 min a normal chrome-measure hold may last (CLAUDE.md). */
export const BUILD_MAX_SEC = 540;
// --no-timing (ts-lock-bundle): a build measures nothing, so it need not wait for a quiet host (the user may work at the Mac)
export const buildHoldCmd = (owner = '<you>') => `node tools/lock.mjs run chrome-measure --owner ${owner} --no-timing --max-seconds 600 -- node tools/iphone.mjs wda build --owner ${owner}`;

/**
 * May `wda build` (minutes of xcodebuild) run now? Only inside this process's own chrome-measure hold: the
 * live holder's token is in $FW_LOCK_HELD (set by `lock.mjs run` for its command). Seeing the lock free, or
 * held by someone else's short-lane job, is not enough: a queued A/B would start mid-build (Hard rule 7).
 * Returns {ok: true, timeoutMs} (the build must end before the hold does) or {ok: false, reason}.
 */
export function buildGate(s = lockStatus('chrome-measure'), held = process.env.FW_LOCK_HELD, { owner, now = Date.now() } = {}) {
  const h = s.holder;
  const live = h && !s.stale && !staleReason(h, now);
  const mine = parseHeld(held)['chrome-measure'];
  if (live && mine && mine === h.token) {
    // the short lane is for bounded jobs of <= 300 s (npm test); a build is minutes of CPU: normal holds only (lead, review-gesture-2)
    if (h.short) return { ok: false, reason: `your chrome-measure hold is a short-lane job (max ${h.maxSec} s): the short lane is for bounded jobs like npm test, and a build is minutes of Mac CPU. Run it in a normal hold:\n  ${buildHoldCmd(owner)}` };
    // the hold's end: a lease's expiresAt, or a normal run's declared length (meta.expectSec = --max-seconds) from
    // acquiredAt, so the time already spent in the hold counts (review-gesture-2)
    const ends = [h.expiresAt && Date.parse(h.expiresAt), h.meta?.expectSec > 0 && Date.parse(h.acquiredAt) + h.meta.expectSec * 1000].filter((x) => Number.isFinite(x));
    const left = ends.length ? Math.min(...ends) - now : Infinity;
    const timeoutMs = Math.min(BUILD_MAX_SEC * 1000, left - 15000);
    if (timeoutMs < 60000) return { ok: false, reason: `your chrome-measure hold ends in ${Math.max(0, Math.round(left / 1000))} s: too little for a build. Run it in a fresh hold:\n  ${buildHoldCmd(owner)}` };
    return { ok: true, timeoutMs };
  }
  const who = live ? `chrome-measure is held by "${h.owner}"${h.short ? ' (a short-lane job)' : ''}, not by this process` : 'chrome-measure is free, but this process does not hold it';
  return { ok: false, reason: `${who}. xcodebuild is minutes of Mac CPU: it runs only inside your own hold, so no A/B starts mid-build (Hard rule 7):\n  ${buildHoldCmd(owner)}` };
}

/**
 * Run a long child (xcodebuild build-for-testing) in its own process group, never orphaned (review-gesture-2
 * B2): a normal `lock.mjs run` passes SIGINT/SIGTERM/SIGHUP to its direct child only (this node process),
 * and releases the lock right after; a blocking spawnSync would die with us and leave xcodebuild building
 * outside any hold. Here those signals and the timeout kill the whole group (SIGTERM, then SIGKILL after
 * graceMs). Resolves {status, signal, timedOut, interrupted (the signal we got, or null), error}.
 */
export function runGroup(cmd, args, { cwd, stdio = 'ignore', timeoutMs, graceMs = 3000, signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] } = {}) {
  return new Promise((done) => {
    let child;
    try { child = spawn(cmd, args, { cwd, stdio, detached: true }); } catch (error) { done({ status: null, signal: null, timedOut: false, interrupted: null, error }); return; }
    let timedOut = false, interrupted = null, hard = null;
    const killGroup = (sig) => { try { process.kill(-child.pid, sig); } catch {} };
    const stop = () => { killGroup('SIGTERM'); if (!hard) { hard = setTimeout(() => killGroup('SIGKILL'), graceMs); hard.unref?.(); } };
    const handlers = signals.map((s) => [s, () => { interrupted ??= s; stop(); }]);
    for (const [s, h] of handlers) process.on(s, h);
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; stop(); }, timeoutMs) : null;
    const finish = (r) => { clearTimeout(timer); clearTimeout(hard); for (const [s, h] of handlers) process.off(s, h); done(r); };
    child.on('error', (error) => finish({ status: null, signal: null, timedOut, interrupted, error }));
    child.on('exit', (status, signal) => { killGroup('SIGKILL'); finish({ status, signal, timedOut, interrupted, error: null }); }); // and anything it left in its group
  });
}

function readPid(name) {
  try { const j = JSON.parse(readFileSync(pidFile(name), 'utf8')); return j && pidAlive(j.pid) ? j : { ...j, dead: true }; } catch { return null; }
}
/** Is pid still the process we started (not a reused pid)? */
function isOurs(rec) {
  if (!rec || rec.dead) return false;
  const r = spawnSync('ps', ['-o', 'command=', '-p', String(rec.pid)], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.includes(rec.match);
}
function startDetached(name, cmd, args, { log, match, owner }) {
  mkdirSync(stateDir(), { recursive: true });
  const logOffset = fileSize(log); // I-220: where this start's lines begin in the shared, appended log
  const fd = openSync(log, 'a');
  const p = spawn(cmd, args, { detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  p.unref();
  const rec = { pid: p.pid, name, cmd: redact([cmd, ...args].join(' '), readConfig()).replace(/id=[0-9A-Fa-f-]{8,}/g, 'id=<udid>').replace(/-u [0-9A-Fa-f-]{8,}/, '-u <udid>'), match, log, logOffset, owner, startedAt: new Date().toISOString() };
  writeFileSync(pidFile(name), JSON.stringify(rec, null, 1));
  // I-220: a ledger of every process this tool started, so a clean stop also ends one whose pidfile is gone
  appendFileSync(ledgerFile(), JSON.stringify({ pid: rec.pid, name, match, startedAt: rec.startedAt }) + '\n');
  return rec;
}
const ledgerFile = () => join(stateDir(), 'started.jsonl');
const fileSize = (f) => { try { return statSync(f).size; } catch { return 0; } };
/** The text a log got since `offset` (at most the last `max` bytes). */
function readFrom(file, offset = 0, max = 1 << 20) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const end = fstatSync(fd).size;
    const from = Math.max(offset, end - max);
    if (end <= from) return '';
    const b = Buffer.alloc(end - from);
    readSync(fd, b, 0, b.length, from);
    return b.toString('utf8');
  } catch { return ''; } finally { if (fd !== undefined) closeSync(fd); }
}
async function stopOne(name, log = console.log) {
  const rec = readPid(name);
  if (!rec) return false;
  if (isOurs(rec)) {
    try { process.kill(-rec.pid, 'SIGTERM'); } catch { try { process.kill(rec.pid, 'SIGTERM'); } catch {} }
    for (let i = 0; i < 50 && pidAlive(rec.pid); i++) await sleep(100);
    if (pidAlive(rec.pid)) { try { process.kill(-rec.pid, 'SIGKILL'); } catch { try { process.kill(rec.pid, 'SIGKILL'); } catch {} } }
    log(`stopped ${name} (pid ${rec.pid})`);
  } else log(`${name}: pid ${rec.pid} is gone or no longer ours; removing its pidfile`);
  rmSync(pidFile(name), { force: true });
  return true;
}
const tail = (f, n = 15) => { try { return readFileSync(f, 'utf8').trim().split('\n').slice(-n).join('\n'); } catch { return '(no log)'; } };

function detectUdid() {
  const r = spawnSync(exe('idevice_id', 'FW_IDEVICE_ID'), ['-l'], { encoding: 'utf8' });
  const ids = r.status === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  return ids.length === 1 ? ids[0] : ids.length ? { many: ids.length } : null;
}
/** The phone's name (Settings > General > About > Name, often the owner's name): stored locally to scrub it. */
function detectDeviceName(udid) {
  const r = spawnSync(exe('ideviceinfo', 'FW_IDEVICEINFO'), ['-u', udid, '-k', 'DeviceName'], { encoding: 'utf8', timeout: 10000 });
  const n = r.status === 0 ? (r.stdout || '').trim() : '';
  return n || null;
}
function detectTeam() {
  const r = spawnSync(exe('security', 'FW_SECURITY'), ['find-certificate', '-a', '-c', 'Apple Development', '-p'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const teams = new Set();
  for (const pem of r.stdout.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []) {
    const s = spawnSync('openssl', ['x509', '-noout', '-subject'], { input: pem, encoding: 'utf8' });
    const m = s.stdout.match(/OU\s*=\s*([A-Z0-9]{10})/);
    if (m) teams.add(m[1]);
  }
  return teams.size === 1 ? [...teams][0] : teams.size ? { many: teams.size } : null;
}

const SETUP = `one-time user setup (research/architecture/finger-simulation.md 5(a)): Xcode > Settings > Accounts > + Apple Account
  (a free personal team is enough); iPhone: Developer Mode on, Settings > Developer > Enable UI Automation on;
  after the first build+start: Settings > General > VPN & Device Management > trust the "Apple Development" app.`;

// ---- I-220: wda ensure -------------------------------------------------------------------------------------------
// Phone block kits restarted WDA at every part start (wda stop/start/check). On 2026-10-06, 6 of 22 starts ended in
// XCTest "Failed to initialize for UI testing ... Timed out while enabling automation mode" (60 s after "Running
// tests..."), and from 09:53Z the runner came up while usbmux listed no USB device (iproxy: "No connected/matching device
// found"); each time only a cable re-plug helped (an immediate retry at 00:39Z failed too). OBSERVED, in our setup.
// "Supported platforms for the buildables in the current scheme is empty" and "Using the first of multiple matching
// destinations" are in every start's log, good or failed: noise, never a failure signature here.
/** `wda ensure` exit code: a cable re-plug is the way out (kits post a console step). 0 READY, 3 NOT READY, 1 error. */
export const EXIT_REPLUG = 4;
const SIG = {
  automation: /Timed out while enabling automation mode/,
  serverUrl: /ServerURLHere->/,
  noUsb: /No connected\/matching device found/,
  usbConn: /Requesting connection to USB device|Error connecting to device/,
};
/**
 * What a runner start looked like, from this start's runner.log and iproxy.log text: 'automation-timeout' (XCTest
 * could not enable automation mode), 'no-usb' (iproxy's latest device line: usbmux has no matching USB device),
 * 'forward' (the runner reported its ServerURL but the USB forward does not answer), 'launch' (no ServerURL yet).
 */
export function classifyStart({ runner = '', iproxy = '' } = {}) {
  if (SIG.automation.test(runner)) return 'automation-timeout';
  const dev = String(iproxy).split('\n').filter((l) => SIG.noUsb.test(l) || SIG.usbConn.test(l));
  if (dev.length && SIG.noUsb.test(dev.at(-1))) return 'no-usb';
  return SIG.serverUrl.test(runner) ? 'forward' : 'launch';
}
const REASON = {
  'automation-timeout': 'XCTest timed out enabling automation mode on the iPhone ("Failed to initialize for UI testing")',
  'no-usb': 'the iPhone is not on USB for usbmux (iproxy: "No connected/matching device found")',
  forward: 'the runner is up (ServerURLHere) but the USB forward does not answer',
  launch: 'the runner did not report its server (no ServerURLHere)',
};
/** How long to give the USB forward once the runner is up: twice as long when load1 exceeds the core count (I-220, 09:53Z at load1 70-95). */
export function forwardWaitSec({ base = 30, load1 = loadavg()[0], cpus: n = cpus().length } = {}) {
  return load1 > n ? base * 2 : base;
}
/** `idevice_id -l` output: how many USB devices usbmux lists, and whether `udid` is one (no udid configured: any, I-223). */
export function parseUsbList(stdout, udid) {
  const ids = String(stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
  return { count: ids.length, listed: udid ? ids.includes(udid) : ids.length > 0 };
}
/** A log line without IPv4 addresses but loopback (the runner prints the phone's LAN address in ServerURLHere; Hard rule 12). */
export const scrubAddr = (s) => String(s).replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (a) => (a === '127.0.0.1' ? a : '<addr>'));
/** usbmux's USB device list now: {count, listed}, or null when idevice_id is missing or fails (no verdict). */
export function usbList(udid = readConfig().udid) {
  const r = spawnSync(exe('idevice_id', 'FW_IDEVICE_ID'), ['-l'], { encoding: 'utf8', timeout: 10000 });
  return r.status === 0 ? parseUsbList(r.stdout, udid) : null;
}
/** This start's lines of runner.log and iproxy.log (from the offsets their pidfiles recorded). */
function startText(run, ip) {
  return { runner: run ? readFrom(run.log, run.logOffset ?? Infinity) : '', iproxy: ip ? readFrom(ip.log, ip.logOffset ?? Infinity) : '' };
}
/** End every process in the ledger that is still ours and alive (pidfiles already stopped): a runner only with our DerivedData in its command line. */
function killStale(log) {
  let lines = [];
  try { lines = readFileSync(ledgerFile(), 'utf8').split('\n').filter(Boolean); } catch { return; }
  for (const l of lines) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (!Number.isInteger(e.pid) || !pidAlive(e.pid)) continue;
    const r = spawnSync('ps', ['-ww', '-o', 'command=', '-p', String(e.pid)], { encoding: 'utf8' });
    const cmd = r.status === 0 ? r.stdout : '';
    if (!cmd.includes(e.match) || (e.name === 'runner' && !cmd.includes(`${derivedData()}/`))) continue; // not ours (a reused pid, the Simulator's runner)
    try { process.kill(-e.pid, 'SIGKILL'); } catch { try { process.kill(e.pid, 'SIGKILL'); } catch {} }
    log(`killed stale ${e.name} (pid ${e.pid})`);
  }
  rmSync(ledgerFile(), { force: true });
}
async function cleanStop(log) { await stopOne('runner', log); await stopOne('iproxy', log); killStale(log); }
const startIproxy = (cfg, owner) => startDetached('iproxy', exe('iproxy', 'FW_IPROXY'), iproxyArgs({ udid: cfg.udid }), { log: join(wdaHome(), 'iproxy.log'), match: '8100', owner });
/**
 * Wait for /status ready: stop early on the automation-mode signature or a dead runner, and give the forward
 * `fwdSec` once the runner has reported its ServerURL. Resolves {ready, st} or {ready: false, kind}.
 */
async function waitUp({ run, timeoutSec, fwdSec }) {
  const deadline = Date.now() + timeoutSec * 1000;
  let upAt = null;
  for (;;) {
    const st = await wdaStatus().catch(() => null);
    if (st?.ready) return { ready: true, st };
    const kind = classifyStart(startText(run, readPid('iproxy')));
    if (kind === 'automation-timeout') return { ready: false, kind };
    if (kind === 'forward' || kind === 'no-usb') upAt ??= Date.now();
    const alive = readPid('runner');
    if (!alive || alive.dead || Date.now() > deadline || (upAt && Date.now() - upAt > fwdSec * 1000)) return { ready: false, kind };
    await sleep(1000);
  }
}
/** Restart iproxy only (the runner stays) and wait `fwdSec` for /status. */
async function iproxyOnly({ cfg, owner, run, fwdSec, log }) {
  log(`runner is up (ServerURLHere) but the USB forward does not answer: restarting iproxy only (waiting up to ${fwdSec} s)`);
  await stopOne('iproxy', log);
  startIproxy(cfg, owner);
  return waitUp({ run, timeoutSec: fwdSec, fwdSec });
}
async function frontSafari() { const s = await createSession(); try { await s.activate(SAFARI); } finally { await s.close(); } }
const readyLine = (how, st) => `WDA READY (${how}) build ${st?.build?.version ?? '?'} os ${st?.os?.version ?? '?'}`;

/**
 * `wda ensure --owner <o>`: keep a READY runner; else check usbmux, restart iproxy only when the runner is up, or
 * start the runner, retrying once after a clean stop on the automation-mode timeout. The last line is the verdict:
 * `WDA READY (...)` exit 0, `WDA REPLUG NEEDED: ...` exit 4, `WDA NOT READY: ...` exit 3.
 */
async function ensureCmd({ opt, flag, requireLease, log }) {
  const owner = requireLease();
  const st0 = await wdaStatus().catch(() => null);
  if (st0?.ready) { log(readyLine('kept, no restart', st0)); return 0; }
  const cfg = readConfig();
  const x = findXctestrun();
  if (!x || !cfg.udid) throw new Error('no WDA build yet: node tools/iphone.mjs wda build');
  const timeoutSec = Number(opt('timeout', 120)), retryWait = Number(opt('retry-wait', 10)), usbWait = Number(opt('usb-wait', 20));
  const fwdSec = opt('forward-wait', null) != null ? Number(opt('forward-wait')) : forwardWaitSec();
  const noRetry = flag('no-retry');
  const again = `node tools/iphone.mjs wda ensure --owner ${owner}`;
  const replug = async (why) => { await cleanStop(log); log(`WDA REPLUG NEEDED: ${why}. Re-plug the iPhone cable (phone unlocked), then re-run: ${again}`); return EXIT_REPLUG; };
  const notReady = async (why, run) => {
    await cleanStop(log);
    const t = run ? startText(run, null).runner.trim().split('\n').filter((l) => l.trim()).slice(-8) : [];
    for (const l of t) log(`  | ${scrubAddr(l)}`);
    log(`WDA NOT READY: ${why}. Unlocked phone? UI Automation enabled? Runner trusted? Re-run: ${again}`);
    return 3;
  };
  // 1. usbmux first: without the phone on USB, iproxy has nothing to forward to, whatever xcodebuild manages
  let usb = usbList(cfg.udid);
  for (const end = Date.now() + usbWait * 1000; usb && !usb.listed && Date.now() < end;) { await sleep(1000); usb = usbList(cfg.udid); }
  if (usb && !usb.listed) return replug(`the iPhone is not on USB for usbmux (idevice_id -l lists ${usb.count} device${usb.count === 1 ? '' : 's'}, not this one, for ${usbWait} s)`);
  // 2. our runner is up and reported its server: only the forward is down
  const run0 = readPid('runner');
  if (run0 && isOurs(run0) && run0.logOffset != null && SIG.serverUrl.test(startText(run0, null).runner)) {
    const r = await iproxyOnly({ cfg, owner, run: run0, fwdSec, log });
    if (r.ready) { await frontSafari(); log(readyLine('restarted iproxy only', r.st)); return 0; }
    if (r.kind === 'no-usb') return replug(`${REASON['no-usb']} while the runner is up`);
    log(`iproxy restart did not help (${REASON[r.kind] || r.kind}): restarting the runner`);
  }
  // 3. a fresh runner; once more after a clean stop when XCTest timed out enabling automation mode
  let why = run0 && isOurs(run0) ? 'it was not ready' : 'it was not running';
  for (let attempt = 1; ; attempt++) {
    await cleanStop(log);
    if (attempt > 1 && retryWait > 0) await sleep(retryWait * 1000);
    const run = startDetached('runner', exe('xcodebuild', 'FW_XCODEBUILD'), runnerArgs({ xctestrun: x, udid: cfg.udid }), { log: join(wdaHome(), 'runner.log'), match: 'test-without-building', owner });
    startIproxy(cfg, owner);
    let r = await waitUp({ run, timeoutSec, fwdSec });
    if (!r.ready && r.kind === 'forward') r = await iproxyOnly({ cfg, owner, run, fwdSec, log });
    if (r.ready) {
      await frontSafari();
      log(readyLine(attempt > 1 ? `restarted after one retry: ${why}` : `restarted: ${why}`, r.st));
      return 0;
    }
    log(`WDA start ${attempt} failed: ${REASON[r.kind] || r.kind}`);
    if (r.kind === 'no-usb') return replug(`${REASON['no-usb']}${SIG.serverUrl.test(startText(run, null).runner) ? ' while the runner is up' : ''}`);
    if (r.kind !== 'automation-timeout') return notReady(REASON[r.kind] || r.kind, run);
    if (noRetry) return replug('XCTest timed out enabling automation mode (no retry)');
    if (attempt >= 2) return replug('XCTest timed out enabling automation mode twice (a start and one retry after a clean stop)');
    why = REASON['automation-timeout'];
    log(`retrying once after a clean stop${retryWait > 0 ? ` and ${retryWait} s` : ''}`);
  }
}

/**
 * The command. Everything it prints (log lines, error messages, xcodebuild log tails) goes through redact()
 * with the ids from config.json (Hard rule 12; review-gesture 2): team, UDID, runner bundle id, device name.
 */
export async function wdaCmd({ log = console.log, ...args }) {
  const scrub = (s) => redact(String(s), readConfig());
  try {
    return await wdaCmdInner({ ...args, log: (s) => log(scrub(s)) });
  } catch (e) {
    throw new Error(scrub(e?.message ?? e));
  }
}

async function wdaCmdInner({ sub, opt, flag = () => false, requireLease, log }) {
  if (sub === 'status') {
    const cfg = readConfig();
    const src = existsSync(join(srcDir(), 'WebDriverAgent.xcodeproj'));
    const ref = src ? (spawnSync('git', ['-C', srcDir(), 'describe', '--tags', '--always'], { encoding: 'utf8' }).stdout || '').trim() : null;
    log(`home:     ${wdaHome()}`);
    log(`sources:  ${src ? `${srcDir()} (${ref || 'unknown ref'}${ref && ref !== (cfg.ref || WDA_REF) ? `, pinned ${cfg.ref || WDA_REF}` : ''})` : `missing; run: ${cloneCommand(cfg.ref || WDA_REF)}`}`);
    log(`config:   team ${mask(cfg.team)}, device ${mask(cfg.udid)}, runner ${cfg.bundleId ? 'set' : '(unset)'}`);
    const x = findXctestrun();
    const exp = x ? profileExpiry() : null;
    const days = exp ? Math.floor((Date.parse(exp) - Date.now()) / 86400000) : null;
    log(`build:    ${x ? `ok (${x.split('/').pop()})` : 'none (node tools/iphone.mjs wda build)'}${exp ? `; profile expires ${exp}${days < 0 ? ' EXPIRED: re-run wda build with the phone unlocked' : ` (${days} d)`}` : ''}`);
    for (const n of ['runner', 'iproxy']) { const r = readPid(n); log(`${n.padEnd(9)} ${r ? (isOurs(r) ? `running pid ${r.pid} since ${r.startedAt} (by ${r.owner})` : `stale pidfile (pid ${r.pid})`) : 'not running'}`); }
    const st = await wdaStatus().catch((e) => ({ error: e.message }));
    log(`wda:      ${st.error ? `not reachable at ${WDA_URL()}` : `ready=${st.ready} build ${st.build?.version ?? '?'} os ${st.os?.version ?? '?'}`}`);
    return 0;
  }
  if (sub === 'check') {
    const st = await wdaStatus().catch((e) => ({ error: e.message }));
    if (!st.error && st.ready) { log(`WDA READY build ${st.build?.version ?? '?'} os ${st.os?.version ?? '?'}`); return 0; }
    const owner = opt('owner') || '<you>';
    log(`WDA NOT READY: ${st.error ? `not reachable at ${WDA_URL()}` : 'it answers /status but is not ready'}. Start it (iphone lease): node tools/iphone.mjs wda start --owner ${owner}`);
    return 3;
  }
  if (sub === 'build') {
    const owner = requireLease(); // xcodebuild talks to the device (provisioning, preparing it for development): lease holders only
    const gate = buildGate(undefined, undefined, { owner });
    if (!gate.ok) throw new Error(`refusing wda build: ${gate.reason}`);
    const cfg = readConfig();
    cfg.ref = opt('ref', cfg.ref || WDA_REF);
    if (!existsSync(join(srcDir(), 'WebDriverAgent.xcodeproj'))) throw new Error(`WebDriverAgent sources missing in ${srcDir()} (kept outside the repo, never committed). Fetch them once:\n  ${cloneCommand(cfg.ref)}`);
    const team = opt('team', cfg.team) || detectTeam();
    if (!team || typeof team === 'object') throw new Error(`no signing team${team?.many ? ` (${team.many} teams found: pass --team <TEAMID>)` : ' (no Apple Development certificate in the keychain)'}.\n${SETUP}`);
    const udid = opt('udid', cfg.udid) || detectUdid();
    if (!udid || typeof udid === 'object') throw new Error(`no iPhone${udid?.many ? ` (${udid.many} devices: pass --udid)` : ' on USB (idevice_id -l lists none): connect it with the cable and unlock it'}`);
    const bundleId = opt('bundle-id', cfg.bundleId) || `fw.wda.${String(team).toLowerCase()}.WebDriverAgentRunner`;
    const deviceName = detectDeviceName(udid) || cfg.deviceName; // only to scrub it from what we print
    Object.assign(cfg, { team, udid, bundleId, ...(deviceName ? { deviceName } : {}) });
    writeConfig(cfg);
    const blog = join(wdaHome(), 'build.log');
    log(`building WebDriverAgent ${cfg.ref} for device ${mask(udid)}, team ${mask(team)} (log: ${blog}); a few minutes of Mac CPU inside your chrome-measure hold (stopped after ${Math.round(gate.timeoutMs / 1000)} s); Xcode's automatic signing registers this device with the signed-in Apple account`);
    const fd = openSync(blog, 'w');
    const r = await runGroup(exe('xcodebuild', 'FW_XCODEBUILD'), buildArgs({ udid, team, bundleId }), { cwd: srcDir(), stdio: ['ignore', fd, fd], timeoutMs: gate.timeoutMs });
    closeSync(fd);
    if (r.interrupted) throw new Error(`wda build interrupted by ${r.interrupted}: xcodebuild (its whole process group) was stopped, nothing keeps building after the hold. Re-run it in a fresh hold:\n  ${buildHoldCmd(owner)}`);
    if (r.error) throw new Error(`xcodebuild could not start: ${r.error.code || r.error.message}`);
    if (r.status !== 0) throw new Error(`xcodebuild build-for-testing ${r.timedOut ? `stopped after ${Math.round(gate.timeoutMs / 1000)} s (before your chrome-measure hold ends); re-run it in a fresh hold` : 'failed'} (exit ${r.status ?? r.signal}); last lines of ${blog}:\n${tail(blog)}\nIf it is about signing or the account: ${SETUP}`);
    const x = findXctestrun();
    if (!x) throw new Error(`build succeeded but no .xctestrun in ${derivedData()}/Build/Products`);
    log(`WDA_BUILT ${x}`);
    const exp = profileExpiry();
    if (exp) log(`profile expires ${exp} (free team: 7 days; then re-run wda build)`);
    return 0;
  }
  if (sub === 'start') {
    const owner = requireLease();
    const cfg = readConfig();
    const x = findXctestrun();
    if (!x || !cfg.udid) throw new Error('no WDA build yet: node tools/iphone.mjs wda build');
    const run = readPid('runner');
    if (run && isOurs(run)) {
      const st = await wdaStatus().catch(() => null);
      if (st?.ready) { log(`WDA_READY ${WDA_URL()} (already running, pid ${run.pid}, started by ${run.owner})`); return 0; }
    }
    await stopOne('runner', log); await stopOne('iproxy', log);
    const rlog = join(wdaHome(), 'runner.log');
    startDetached('runner', exe('xcodebuild', 'FW_XCODEBUILD'), runnerArgs({ xctestrun: x, udid: cfg.udid }), { log: rlog, match: 'test-without-building', owner });
    startDetached('iproxy', exe('iproxy', 'FW_IPROXY'), iproxyArgs({ udid: cfg.udid }), { log: join(wdaHome(), 'iproxy.log'), match: '8100', owner });
    const deadline = Date.now() + Number(opt('timeout', 120)) * 1000;
    let st = null;
    while (Date.now() < deadline) {
      st = await wdaStatus().catch(() => null);
      if (st?.ready) break;
      const r = readPid('runner');
      if (!r || r.dead) break;
      await sleep(1000);
    }
    if (!st?.ready) {
      await stopOne('runner', log); await stopOne('iproxy', log);
      throw new Error(`WDA did not come up at ${WDA_URL()}; last lines of ${rlog}:\n${tail(rlog)}\nUnlocked phone? UI Automation enabled? Runner trusted? ${SETUP}`);
    }
    const s = await createSession();
    try { await s.activate(SAFARI); } finally { await s.close(); }
    log(`WDA_READY ${WDA_URL()} (Safari in front)`);
    return 0;
  }
  if (sub === 'ensure') return ensureCmd({ opt, flag, requireLease, log });
  if (sub === 'stop') {
    const a = await stopOne('runner', log), b = await stopOne('iproxy', log);
    if (!a && !b) log('WDA was not running (no pidfiles)');
    return 0;
  }
  throw new Error('usage: node tools/iphone.mjs wda status | check [--owner <topic>] | build --owner <topic> [--ref vX] [--team ID] [--udid UDID] | start --owner <topic> | ensure --owner <topic> [--timeout 120] [--forward-wait S] [--usb-wait 20] [--retry-wait 10] [--no-retry] | stop');
}

export { stateDir as wdaStateDir };
