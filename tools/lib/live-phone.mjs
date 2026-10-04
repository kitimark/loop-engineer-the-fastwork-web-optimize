// I-126 + user T-086: a proposal's Try-it pages (A and B) on the iPhone, over the same Wi-Fi as this Mac.
//
// The console's own Try-it servers (live.mjs createLiveServers) listen on 127.0.0.1 only and stop 10 min after the
// panel closes: the console and its frames stay on this Mac. For the phone,
//   node tools/console.mjs proposal phone <id> [--option <name>]          (proposal-cli.mjs)
// starts (or reuses) one tools/serve.mjs per build on the Wi-Fi: plain http (I-003: no certificate warning on the
// phone), --vendors=local like the panel, --port auto (5200-5999, never 5173), host 0.0.0.0, detached, until
//   node tools/console.mjs proposal phone <id> [--option <name>] --stop
// A build is the plain baseline (A without an A patch) or the baseline + one stored live patch (by blob), so one server
// serves every proposal that shows the same build. Only the mirror's pages go on the Wi-Fi; the console itself never
// does (console-server.mjs listens on 127.0.0.1 and answers localhost Hosts only).
//
// Registry: <console>/live/phone/<build>.json is serve.mjs's own --state file (pid, port, root, overlays), and
// <build>.err.log its stderr. Its stdout, whose announcement names the LAN addresses, is dropped (Hard rule 12).
// upServer(): a build is up when its state file names a live pid and /__mirror/info on 127.0.0.1:<port> names the same
// root tree and overlay (a reused pid or a stale file is not "up"). phoneStatus() gives the Proposals page each side's
// phone link: the placeholder http://lan:<port>/ (the only form printed or stored) and its href with this Mac's LAN
// address now (lib/lan.mjs, resolved at view time like I-119), or null when there is none.
// FW_PHONE_SERVE_HOST=127.0.0.1 keeps the servers off the network (the tests); any other value but 0.0.0.0 is refused.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, openSync, closeSync } from 'node:fs';
import { join, basename } from 'node:path';
import http from 'node:http';
import { REPO } from './paths.mjs';
import { liveDir, liveOverlayDir, buildLiveOverlay, BLOB } from './live.mjs';
import { lanAddress } from './lan.mjs';

export const phoneDir = () => join(liveDir(), 'phone');
const BASES = ['site-pretty', 'site'];
const HOSTS = ['0.0.0.0', '127.0.0.1'];
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The two builds of a stored live entry: {a: {base, blob|null}, b: {base, blob}} (A: its own patch, else the baseline). */
export function liveBuilds(live) {
  if (!live || !BLOB.test(String(live.blob))) throw new Error(live && live.none !== undefined ? `no live pages (${live.none})` : 'no live pages (no live patch: node tools/console.mjs proposal live …)');
  const base = live.base || 'site-pretty';
  return { a: { base, blob: live.a?.blob || null }, b: { base, blob: live.blob } };
}

/** A build's registry name: "site-pretty" (the plain baseline) or "site-pretty+<blob>". */
export function buildKey({ base, blob }) {
  if (!BASES.includes(base)) throw new Error(`bad base ${JSON.stringify(base)}`);
  if (blob != null && !BLOB.test(String(blob))) throw new Error(`bad blob id ${JSON.stringify(blob)}`);
  return blob ? `${base}+${blob}` : base;
}
const KEY = /^(site-pretty|site)(?:\+([0-9a-f]{40}|[0-9a-f]{64}))?$/;
export const phoneStateFile = (b) => join(phoneDir(), `${buildKey(b)}.json`);
const errFile = (b) => join(phoneDir(), `${buildKey(b)}.err.log`);

/** The phone link as stored and printed: the placeholder host `lan` (lib/lan.mjs), never an address. */
export const phoneLink = (port) => `http://lan:${port}/`;

/** The command that starts the phone servers of a proposal (option). Option names are OPTION_NAME-safe. */
export const phoneCommand = (id, option) => `node tools/console.mjs proposal phone ${id}${option ? ` --option ${option}` : ''}`;

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function readState(b) { try { return JSON.parse(readFileSync(phoneStateFile(b), 'utf8')); } catch { return null; } }

/** GET http://127.0.0.1:<port>/__mirror/info -> its JSON, or null (not answering, not JSON, timeout). */
export function mirrorInfo(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/__mirror/info', timeout: timeoutMs, headers: { 'accept-encoding': 'identity' } }, (res) => {
      let s = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { s += d; if (s.length > 4e6) req.destroy(); });
      res.on('end', () => { try { resolve(res.statusCode === 200 ? JSON.parse(s) : null); } catch { resolve(null); } });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

/** Does /__mirror/info describe build `b` (root tree name and the overlay dirs)? */
function serves(info, b) {
  if (!info || basename(String(info.root || '')) !== b.base) return false;
  const want = b.blob ? [liveOverlayDir(b.blob)] : [];
  const got = (Array.isArray(info.overlays) ? info.overlays : []).map((o) => o && o.dir);
  return got.length === want.length && got.every((d, i) => d === want[i]);
}

/** Build `b`'s phone server when it is up and serves that build: {port, pid}; else null. `probe` for the tests. */
export async function upServer(b, { probe = mirrorInfo } = {}) {
  const st = readState(b);
  const port = Number(st?.port), pid = Number(st?.pid);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !pidAlive(pid)) return null;
  return serves(await probe(port), b) ? { port, pid } : null;
}

/**
 * For the Proposals page (GET /api/live/<id>/phone): {wifi, a, b, note?}. A side is {up: true, lan, href} (href: the
 * placeholder with this Mac's LAN address now, or null without one) or {up: false}. `lan`: the resolver (lib/lan.mjs).
 */
export async function phoneStatus(live, { probe, lan = () => lanAddress() } = {}) {
  const builds = liveBuilds(live);
  let addr = null;
  try { const a = lan(); if (typeof a === 'string' && IPV4.test(a)) addr = a; } catch { /* no Wi-Fi address: href null */ }
  const out = { wifi: !!addr };
  for (const side of ['a', 'b']) {
    const s = await upServer(builds[side], { probe });
    out[side] = s ? { up: true, lan: phoneLink(s.port), href: addr ? `http://${addr}:${s.port}/` : null } : { up: false };
  }
  if (!addr) out.note = 'This Mac has no Wi-Fi address right now (is the Wi-Fi on?), so the iPhone cannot reach it.';
  return out;
}

function tail(f) {
  try { return readFileSync(f, 'utf8').trim().split('\n').slice(-2).join(' ') || 'no message'; } catch { return 'no message'; }
}

async function spawnServe(b, extra, { serveScript, host, startTimeoutMs }) {
  mkdirSync(phoneDir(), { recursive: true });
  const sf = phoneStateFile(b);
  rmSync(sf, { force: true }); // stale: upServer said its server is gone
  const fd = openSync(errFile(b), 'w');
  let proc;
  try {
    proc = spawn(process.execPath, [serveScript, '--root', b.base, ...extra, '--vendors=local', '--port', 'auto', '--host', host, '--quiet', '--state', sf],
      { cwd: REPO, detached: true, stdio: ['ignore', 'ignore', fd] });
  } finally { closeSync(fd); }
  let exited = null;
  proc.once('exit', (code, sig) => { exited = { code, sig }; });
  proc.once('error', (e) => { exited = { code: e.code || e.message }; });
  const what = b.blob ? `the page server for ${buildKey(b).replace(/\+(.{12}).*$/, ' + patch $1')}` : `the page server for the plain ${b.base}`;
  for (const end = Date.now() + startTimeoutMs; Date.now() < end;) {
    await sleep(100);
    if (exited) throw new Error(`${what} exited (${exited.code ?? exited.sig}): ${tail(errFile(b))}`);
    const st = readState(b);
    if (st && st.pid === proc.pid && Number.isInteger(st.port)) { proc.unref(); return { port: st.port, pid: proc.pid }; }
  }
  try { process.kill(proc.pid, 'SIGTERM'); } catch { /* gone */ }
  throw new Error(`${what} did not start within ${startTimeoutMs / 1000} s: ${tail(errFile(b))}`);
}

/**
 * Start (or reuse) the phone servers of a live entry: {a, b}, each {port, pid, lan, reused}. Builds B's (and A's)
 * overlay from the stored patch first (buildLiveOverlay: refuses a patch made on another baseline). Detached: they run
 * until stopPhoneServers (or a reboot); the caller's exit does not stop them.
 */
export async function startPhoneServers(live, { serveScript = join(REPO, 'tools', 'serve.mjs'), host = process.env.FW_PHONE_SERVE_HOST || '0.0.0.0', startTimeoutMs = 30000, probe } = {}) {
  if (!HOSTS.includes(host)) throw new Error(`FW_PHONE_SERVE_HOST: 0.0.0.0 (the Wi-Fi) or 127.0.0.1 (tests) only (got ${JSON.stringify(host)})`);
  const builds = liveBuilds(live);
  const out = {};
  for (const side of ['a', 'b']) {
    const b = builds[side];
    const up = await upServer(b, { probe });
    if (up) { out[side] = { ...up, lan: phoneLink(up.port), reused: true }; continue; }
    const extra = b.blob ? ['--overlay', buildLiveOverlay(b.blob)] : [];
    const s = await spawnServe(b, extra, { serveScript, host, startTimeoutMs });
    out[side] = { ...s, lan: phoneLink(s.port), reused: false };
  }
  return out;
}

/** Stop one build's phone server (only one this registry started and /__mirror/info confirms): {stopped, pid?, port?}. */
async function stopBuild(b, { probe, waitMs }) {
  const up = await upServer(b, { probe });
  if (!up) {
    const st = readState(b);
    if (st && !pidAlive(Number(st.pid))) rmSync(phoneStateFile(b), { force: true }); // its server is gone
    return { stopped: false };
  }
  try { process.kill(up.pid, 'SIGTERM'); } catch { /* gone meanwhile */ }
  for (const end = Date.now() + waitMs; Date.now() < end && pidAlive(up.pid);) await sleep(50);
  if (pidAlive(up.pid)) { try { process.kill(up.pid, 'SIGKILL'); } catch { /* gone */ } }
  rmSync(phoneStateFile(b), { force: true });
  return { stopped: true, ...up };
}

/** Stop the phone servers of a live entry: {a, b}, each {stopped, pid?, port?}. A build both sides share stops once. */
export async function stopPhoneServers(live, { probe, waitMs = 5000 } = {}) {
  const builds = liveBuilds(live);
  const a = await stopBuild(builds.a, { probe, waitMs });
  const b = buildKey(builds.b) === buildKey(builds.a) ? a : await stopBuild(builds.b, { probe, waitMs });
  return { a, b };
}

/** Every build in the registry: [{key, base, blob, port, pid, up}] (up: upServer). */
export async function listPhoneServers({ probe } = {}) {
  let names = [];
  try { names = readdirSync(phoneDir()).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of names.sort()) {
    const m = KEY.exec(f.slice(0, -5));
    if (!m) continue;
    const b = { base: m[1], blob: m[2] || null };
    const st = readState(b);
    const up = await upServer(b, { probe });
    out.push({ key: buildKey(b), ...b, port: Number(st?.port) || null, pid: Number(st?.pid) || null, up: !!up });
  }
  return out;
}
