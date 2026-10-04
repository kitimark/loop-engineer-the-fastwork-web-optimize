// I-126 + user T-086: a proposal's Try-it pages (A and B) on the iPhone, over the same Wi-Fi as this Mac.
//
// The console's own Try-it servers (live.mjs createLiveServers) listen on 127.0.0.1 only and stop 10 min after the
// panel closes: the console and its frames stay on this Mac. For the phone,
//   node tools/console.mjs proposal phone <id> [--option <name>]          (proposal-cli.mjs; or the page's Start button)
// registers each build with the Try-it host (T-106, lib/tryit.mjs: ONE process for every Try-it page, one plain-http
// port per build, I-003: no certificate warning on the phone; --vendors=local like the panel; files loaded on first
// use, dropped after 30 min idle; no-store) and starts the host if it is not running. Until
//   node tools/console.mjs proposal phone <id> [--option <name>] --stop
// marks them stopped: their ports then show a Start page, and the Proposals page a Start button.
// A build is the plain baseline (A without an A patch) or the baseline + one stored live patch (by blob), so one port
// serves every proposal that shows the same build; its Try-it name is buildKey(): "site-pretty" or "site-pretty+<blob>".
// Only the mirror's pages go on the Wi-Fi; the console itself never does (console-server.mjs listens on 127.0.0.1).
// upServer(): a build is up when the registry entry serves exactly that tree + overlay, is not stopped, and the running
// host listens on its port (status.json; no request is sent, so a status check never loads the build's files).
// phoneStatus() gives the Proposals page each side's phone link: the placeholder http://lan:<port>/ (the only form
// printed or stored) and its href with this Mac's LAN address now (lib/lan.mjs, resolved at view time like I-119).
import { liveOverlayDir, buildLiveOverlay, BLOB } from './live.mjs';
import { lanAddress } from './lan.mjs';
import * as T from './tryit.mjs';

const BASES = ['site-pretty', 'site'];
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

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

/** The phone link as stored and printed: the placeholder host `lan` (lib/lan.mjs), never an address. */
export const phoneLink = (port) => `http://lan:${port}/`;

/** The command that starts the phone servers of a proposal (option). Option names are OPTION_NAME-safe. */
export const phoneCommand = (id, option) => `node tools/console.mjs proposal phone ${id}${option ? ` --option ${option}` : ''}`;

/** Does registry entry `e` serve exactly build `b` (tree and overlay)? */
function serves(e, b) {
  const want = b.blob ? [liveOverlayDir(b.blob)] : [];
  return !!e && e.root === b.base && e.overlays.length === want.length && e.overlays.every((d, i) => d === want[i]);
}

/** Build `b` when the running Try-it host serves it now: {port, pid (the host's)}; else null. No request is sent. */
export async function upServer(b) {
  const e = T.getBuild(buildKey(b));
  if (!serves(e, b) || e.stopped) return null;
  const s = T.readStatus();
  return s?.builds?.[e.name]?.listening ? { port: e.port, pid: s.pid } : null;
}

/**
 * For the Proposals page (GET /api/live/<id>/phone): {wifi, a, b, note?}. A side is {up: true, lan, href} (href: the
 * placeholder with this Mac's LAN address now, or null without one), {up: false, stopped: true, lan} (registered, not
 * served now: the page offers Start) or {up: false}. `lan`: the resolver (lib/lan.mjs).
 */
export async function phoneStatus(live, { lan = () => lanAddress() } = {}) {
  const builds = liveBuilds(live);
  let addr = null;
  try { const a = lan(); if (typeof a === 'string' && IPV4.test(a)) addr = a; } catch { /* no Wi-Fi address: href null */ }
  const out = { wifi: !!addr };
  for (const side of ['a', 'b']) {
    const s = await upServer(builds[side]);
    const e = s ? null : T.getBuild(buildKey(builds[side]));
    out[side] = s ? { up: true, lan: phoneLink(s.port), href: addr ? `http://${addr}:${s.port}/` : null }
      : serves(e, builds[side]) ? { up: false, stopped: true, lan: phoneLink(e.port) } : { up: false };
  }
  if (!addr) out.note = 'This Mac has no Wi-Fi address right now (is the Wi-Fi on?), so the iPhone cannot reach it.';
  return out;
}

/**
 * Serve the builds of a live entry on the Wi-Fi through the Try-it host: {a, b}, each {port, pid (the host's), lan,
 * reused}. Builds B's (and A's) overlay from the stored patch first (buildLiveOverlay: refuses a patch made on another
 * baseline), registers (or un-stops) each build and starts the host if it is not running. `ensure`: for the tests.
 */
export async function startPhoneServers(live, { ensure, label } = {}) {
  const builds = liveBuilds(live);
  const out = {};
  for (const side of ['a', 'b']) {
    const b = builds[side];
    const was = await upServer(b);
    const overlays = b.blob ? [buildLiveOverlay(b.blob)] : [];
    const r = await T.ensureBuild({ name: buildKey(b), root: b.base, overlays, vendors: 'local', by: 'proposal-phone', ...(label && { label }) }, ensure ? { ensure } : {});
    out[side] = { port: r.port, pid: r.hostPid, lan: phoneLink(r.port), reused: !!was && was.port === r.port };
  }
  return out;
}

/** Stop the phone pages of a live entry: {a, b}, each {stopped, port?}. Their ports keep a Start page. Shared builds stop once. */
export async function stopPhoneServers(live) {
  const builds = liveBuilds(live);
  const one = async (b) => {
    const up = await upServer(b);
    if (!up) return { stopped: false };
    T.setStopped(buildKey(b), true);
    return { stopped: true, port: up.port };
  };
  const a = await one(builds.a);
  const b = buildKey(builds.b) === buildKey(builds.a) ? a : await one(builds.b);
  return { a, b };
}

/** Every proposal build in the Try-it registry: [{key, base, blob, port, pid, up, stopped}]. */
export async function listPhoneServers() {
  const st = T.readStatus();
  const out = [];
  for (const e of T.listBuilds()) {
    const m = KEY.exec(e.name);
    if (!m) continue;
    const b = { base: m[1], blob: m[2] || null };
    out.push({ key: e.name, ...b, port: e.port, pid: st?.pid ?? null, up: !!(await upServer(b)), stopped: !!e.stopped });
  }
  return out;
}
