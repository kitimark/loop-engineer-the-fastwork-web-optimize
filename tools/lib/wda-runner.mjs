// `node tools/iphone.mjs wda build|start|stop|status`: build, start and stop WebDriverAgent (the XCUITest
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
//   wda stop                     kill our runner and iproxy (no lease: cleanup must always work)
// Test doubles: $FW_XCODEBUILD, $FW_IPROXY, $FW_IDEVICE_ID, $FW_IDEVICEINFO, $FW_SECURITY name the executables.
// Everything printed goes through redact() (tools/lib/redact.mjs, Hard rule 12): no full team id, UDID,
// runner bundle id, device name, Apple Account e-mail or signing-identity name, also not in xcodebuild log tails.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, openSync, closeSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
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
export const buildHoldCmd = (owner = '<you>') => `node tools/lock.mjs run chrome-measure --owner ${owner} --max-seconds 600 -- node tools/iphone.mjs wda build --owner ${owner}`;

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
  const fd = openSync(log, 'a');
  const p = spawn(cmd, args, { detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  p.unref();
  const rec = { pid: p.pid, name, cmd: redact([cmd, ...args].join(' '), readConfig()).replace(/id=[0-9A-Fa-f-]{8,}/g, 'id=<udid>').replace(/-u [0-9A-Fa-f-]{8,}/, '-u <udid>'), match, log, owner, startedAt: new Date().toISOString() };
  writeFileSync(pidFile(name), JSON.stringify(rec, null, 1));
  return rec;
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

async function wdaCmdInner({ sub, opt, requireLease, log }) {
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
  if (sub === 'stop') {
    const a = await stopOne('runner', log), b = await stopOne('iproxy', log);
    if (!a && !b) log('WDA was not running (no pidfiles)');
    return 0;
  }
  throw new Error('usage: node tools/iphone.mjs wda status | build --owner <topic> [--ref vX] [--team ID] [--udid UDID] | start --owner <topic> | stop');
}

export { stateDir as wdaStateDir };
