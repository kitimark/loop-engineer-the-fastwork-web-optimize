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
//                                minutes of Mac CPU, so only while chrome-measure is free, held by a short-lane
//                                job, or inside your own hold (Hard rule 7). The first build registers the device
//                                with the user's Apple account (free provisioning): the user's own one-time step
//   wda start --owner <o>        lease-guarded: xcodebuild test-without-building + iproxy, wait for /status,
//                                bring Safari to the front
//   wda stop                     kill our runner and iproxy (no lease: cleanup must always work)
// Test doubles: $FW_XCODEBUILD, $FW_IPROXY, $FW_IDEVICE_ID, $FW_SECURITY name the executables.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, openSync, closeSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { sharedStateDir } from './paths.mjs';
import { status as lockStatus, parseHeld, staleReason, pidAlive } from './lock.mjs';
import { status as wdaStatus, createSession, WDA_URL, SAFARI } from './wda.mjs';

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
export const mask = (s) => (s ? `${String(s).slice(0, 4)}...` : '(unset)');

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

/**
 * May `wda build` (minutes of xcodebuild) run now? Only while chrome-measure is free/stale, held by a
 * short-lane job (npm test, bench mech), or held by an ancestor of this process (`lock.mjs run`).
 * Returns null (go) or the reason it may not.
 */
export function buildGate(s = lockStatus('chrome-measure'), held = process.env.FW_LOCK_HELD) {
  const h = s.holder;
  if (!h || s.stale || staleReason(h)) return null;
  if (h.short) return null;
  if (parseHeld(held)['chrome-measure'] === h.token) return null;
  return `chrome-measure is held by "${h.owner}" (a normal hold: someone is measuring). xcodebuild would load the Mac (Hard rule 7). Wait until it is free, or run it in the short lane: node tools/lock.mjs run chrome-measure --owner <you> --short --max-seconds 300 -- node tools/iphone.mjs wda build`;
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
  const rec = { pid: p.pid, name, cmd: [cmd, ...args].join(' ').replace(/id=[0-9A-Fa-f-]{8,}/g, 'id=<udid>').replace(/-u [0-9A-Fa-f-]{8,}/, '-u <udid>'), match, log, owner, startedAt: new Date().toISOString() };
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

export async function wdaCmd({ sub, opt, requireLease, log = console.log }) {
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
    requireLease(); // xcodebuild talks to the device (provisioning, preparing it for development): lease holders only
    const gate = buildGate();
    if (gate) throw new Error(`refusing wda build: ${gate}`);
    const cfg = readConfig();
    cfg.ref = opt('ref', cfg.ref || WDA_REF);
    if (!existsSync(join(srcDir(), 'WebDriverAgent.xcodeproj'))) throw new Error(`WebDriverAgent sources missing in ${srcDir()} (kept outside the repo, never committed). Fetch them once:\n  ${cloneCommand(cfg.ref)}`);
    const team = opt('team', cfg.team) || detectTeam();
    if (!team || typeof team === 'object') throw new Error(`no signing team${team?.many ? ` (${team.many} teams found: pass --team <TEAMID>)` : ' (no Apple Development certificate in the keychain)'}.\n${SETUP}`);
    const udid = opt('udid', cfg.udid) || detectUdid();
    if (!udid || typeof udid === 'object') throw new Error(`no iPhone${udid?.many ? ` (${udid.many} devices: pass --udid)` : ' on USB (idevice_id -l lists none): connect it with the cable and unlock it'}`);
    const bundleId = opt('bundle-id', cfg.bundleId) || `fw.wda.${String(team).toLowerCase()}.WebDriverAgentRunner`;
    Object.assign(cfg, { team, udid, bundleId });
    writeConfig(cfg);
    const blog = join(wdaHome(), 'build.log');
    log(`building WebDriverAgent ${cfg.ref} for device ${mask(udid)}, team ${mask(team)} (log: ${blog}); a few minutes of Mac CPU; Xcode's automatic signing registers this device with the signed-in Apple account`);
    const fd = openSync(blog, 'w');
    const r = spawnSync(exe('xcodebuild', 'FW_XCODEBUILD'), buildArgs({ udid, team, bundleId }), { cwd: srcDir(), stdio: ['ignore', fd, fd], timeout: 20 * 60000 });
    closeSync(fd);
    if (r.status !== 0) throw new Error(`xcodebuild build-for-testing failed (exit ${r.status ?? r.signal}); last lines of ${blog}:\n${tail(blog)}\nIf it is about signing or the account: ${SETUP}`);
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
