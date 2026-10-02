// tools/lib/sim.mjs pure parts: the hold gate (own normal chrome-measure hold only), iwdp's config text (phones at -1,
// never a bad id), the lsof socket parse, the port rules (the phone's 9221/9222/8100 refused), scrub() (no UDID
// leaves the machine) and sim-scroll's meta (meta.device "simulator" and meta.sim, no battery).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { join } from 'node:path';
import { statSync } from 'node:fs';
import { holdGate, iwdpConfigText, parseLsofSockets, ports, scrub, mask, proxyCheck, IWDP_ID, SIM_DEVICE, SIM_WEIGHT, SIM_LOCK, takeSimLock, openedTab, writeOpened, openedHost, openedFile, scopeTabs, safariCacheTargets, fetchReport, openedUrl, pageMatcher, warmMismatch, DEVICE_TYPE } from '../../tools/lib/sim.mjs';
import { timingDemand, idleSec, IDLE_SEC_DEFAULT, warmLine, warmSummary, realStateInTest, reapResult, reapNote, settleSec } from '../../tools/lib/sim-warm.mjs';
import { status as lockStatus } from '../../tools/lib/lock.mjs';
import { simMeta, SIM_SETTINGS, runTarget } from '../../tools/lib/sim-scroll.mjs';
import { tempDir } from '../helpers.mjs';

const T0 = Date.parse('2026-10-01T12:00:00Z');
const holder = (o = {}) => ({ owner: 'me', token: 'aaaaaaaaaaaa', pid: process.pid, kind: 'process', acquiredAt: new Date(T0).toISOString(), ...o });
const st = (h) => ({ holder: h, stale: false, queue: [] });

test('holdGate: only this process\'s own normal hold passes; it ends at acquiredAt + expectSec (or a lease\'s expiresAt)', () => {
  let g = holdGate(st(holder({ meta: { expectSec: 420 } })), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000 });
  assert.deepEqual(g, { ok: true, endsAt: T0 + 420000 });
  g = holdGate(st(holder({ kind: 'lease', pid: undefined, expiresAt: new Date(T0 + 600000).toISOString() })), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000 });
  assert.equal(g.endsAt, T0 + 600000);
  g = holdGate(st(holder()), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000 });
  assert.deepEqual(g, { ok: true, endsAt: Infinity });
});

test('holdGate: refuses a free lock, someone else\'s hold, a forged token and a short-lane hold, naming the command to run', () => {
  let g = holdGate({ holder: null, queue: [] }, undefined, { owner: 'me' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /chrome-measure is free, but this process does not hold it/);
  assert.match(g.reason, /node tools\/lock\.mjs run chrome-measure --owner me --max-seconds 420 -- node tools\/sim\.mjs session --owner me/);
  g = holdGate(st(holder({ owner: 'other' })), undefined, { owner: 'me', now: T0 });
  assert.match(g.reason, /held by "other", not by this process/);
  g = holdGate(st(holder({ owner: 'other' })), 'chrome-measure:bbbbbbbbbbbb', { owner: 'me', now: T0 });
  assert.equal(g.ok, false);
  g = holdGate(st(holder({ short: true, maxSec: 300 })), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 });
  assert.equal(g.ok, false);
  assert.match(g.reason, /short-lane job \(max 300 s\)/);
  g = holdGate({ ...st(holder()), stale: true }, 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 });
  assert.equal(g.ok, false, 'a stale hold is no hold');
});

// ts-lock-share §3: a functional session also accepts its own shared-lane reader slot (weight >= 3) and its own short hold
const reader = (o = {}) => ({ owner: 'me', token: 'cccccccccccc', kind: 'process', pid: process.pid, acquiredAt: new Date(T0).toISOString(), deadline: new Date(T0 + 305000).toISOString(), maxSec: 300, weight: 3, ...o });
const group = (readers) => ({ owner: '(shared)', kind: 'lease', short: true, shared: true, format: 'rw1', token: 'dddddddddddd', acquiredAt: new Date(T0).toISOString(), expiresAt: new Date(T0 + 315000).toISOString(), readers });

test('holdGate functional: its own live reader slot of weight >= SIM_WEIGHT (ends at acquiredAt + maxSec), or its own short hold; mode named', () => {
  assert.equal(SIM_WEIGHT, 3);
  let g = holdGate(st(group([reader()])), undefined, { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: 'chrome-measure:cccccccccccc' });
  assert.deepEqual(g, { ok: true, endsAt: T0 + 300000, mode: 'shared' });
  // the switch-off form of `run --shared` (review-lock-share N2): its exclusive short stand-in, named by FW_LOCK_SHARED
  const standIn = holder({ short: true, maxSec: 300, functional: true, weight: 3, expiresAt: new Date(T0 + 305000).toISOString() });
  g = holdGate(st(standIn), undefined, { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: 'chrome-measure:aaaaaaaaaaaa' });
  assert.deepEqual(g, { ok: true, endsAt: T0 + 300000, mode: 'short' });
  g = holdGate(st(standIn), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: '' });
  assert.equal(g.ok, false, 'a short hold reached through FW_LOCK_HELD alone is a plain short-lane job');
  // an exclusive hold a --shared job re-entered (both FW_LOCK_HELD and FW_LOCK_SHARED): a slot of the full cap
  g = holdGate(st(holder({ meta: { expectSec: 420 } })), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: 'chrome-measure:aaaaaaaaaaaa' });
  assert.deepEqual(g, { ok: true, endsAt: T0 + 420000, mode: 'exclusive' });
  g = holdGate(st(holder()), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000, functional: true });
  assert.deepEqual(g, { ok: true, endsAt: Infinity, mode: 'exclusive' });
});

test('holdGate functional: refuses a light slot, someone else\'s slot, a dead or expired slot; a non-functional session never takes a slot', () => {
  let g = holdGate(st(group([reader({ weight: 1 })])), undefined, { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: 'chrome-measure:cccccccccccc' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /weight 1, and a Simulator session needs weight 3/);
  assert.match(g.reason, /lock\.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner me -- node tools\/sim\.mjs session --functional --owner me/);
  g = holdGate(st(group([reader({ owner: 'other' })])), undefined, { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: 'chrome-measure:bbbbbbbbbbbb' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /shared by functional readers \("other"\), and none of them is this process/);
  g = holdGate(st(group([reader({ pid: 999999 })])), undefined, { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: 'chrome-measure:cccccccccccc' });
  assert.equal(g.ok, false, 'a reader whose process is gone is no slot');
  g = holdGate(st(group([reader()])), undefined, { owner: 'me', now: T0 + 306000, functional: true, sharedHeld: 'chrome-measure:cccccccccccc' });
  assert.equal(g.ok, false, 'past its deadline');
  g = holdGate(st(group([reader()])), undefined, { owner: 'me', now: T0 + 1000, sharedHeld: 'chrome-measure:cccccccccccc' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /inside the functional \(shared\) slot of "me".*must be a functional one.*session --functional/s);
  g = holdGate(st(group([reader({ owner: 'other' })])), undefined, { owner: 'me', now: T0 + 1000 });
  assert.match(g.reason, /a shared slot is no normal hold.*\n {2}node tools\/lock\.mjs run chrome-measure --owner me --max-seconds 420/s);
  // N6: a non-functional session inside a slot is refused even when it also inherits the exclusive hold
  g = holdGate(st(holder()), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 + 1000, sharedHeld: 'chrome-measure:aaaaaaaaaaaa' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /must be a functional one/);
  // a light switch-off stand-in is refused like a light reader
  g = holdGate(st(holder({ short: true, maxSec: 300, functional: true, weight: 1, expiresAt: new Date(T0 + 305000).toISOString() })), undefined, { owner: 'me', now: T0 + 1000, functional: true, sharedHeld: 'chrome-measure:aaaaaaaaaaaa' });
  assert.match(g.reason, /weight 1, and a Simulator session needs weight 3/);
  g = holdGate(st(holder({ short: true, maxSec: 60 })), 'chrome-measure:aaaaaaaaaaaa', { owner: 'me', now: T0 });
  assert.match(g.reason, /short-lane job \(max 60 s\).*session --functional/s, 'the refusal names the functional form');
});

test('takeSimLock: one Simulator session at a time; a second waits, gives up after its wait (dequeued, holder named); release frees it', async () => {
  const prev = process.env.FW_STATE_DIR;
  process.env.FW_STATE_DIR = join(tempDir('fw-simlock-'), 'state');
  try {
    const a = await takeSimLock('one', { waitSec: 0 });
    assert.equal(lockStatus(SIM_LOCK).holder.owner, 'one');
    await assert.rejects(takeSimLock('two', { waitSec: 0, log: () => {} }), /the Simulator is busy: the simulator lock is held by "one"/);
    assert.deepEqual(lockStatus(SIM_LOCK).queue, [], 'the giving-up waiter left the queue');
    await assert.rejects(takeSimLock('one', { waitSec: 0 }), /already held by "one"/);
    await a.release();
    assert.equal(lockStatus(SIM_LOCK).holder, null);
    const b = await takeSimLock('two', { waitSec: 0 });
    await a.release(); // a stale handle never frees someone else's hold
    assert.equal(lockStatus(SIM_LOCK).holder.owner, 'two');
    await b.release();
  } finally { if (prev === undefined) delete process.env.FW_STATE_DIR; else process.env.FW_STATE_DIR = prev; }
});

test('I-050 openedTab: the one tab on the url, or the one not listed before openurl; null while undecided; never the first of several', () => {
  const ws = (n) => `ws://127.0.0.1:9232/devtools/page/${n}`;
  const want = 'http://localhost:5367/';
  const stale = { url: 'http://localhost:63765/', webSocketDebuggerUrl: ws(1), appId: 'PID:18026' };
  const mine = { url: 'http://localhost:5367/', webSocketDebuggerUrl: ws(2), appId: 'PID:18026' };
  assert.equal(openedTab([stale, mine], want, [stale]), mine, 'a restored tab on another host is not a candidate');
  assert.equal(openedTab([stale], want, [stale]), null, 'not listed yet');
  assert.equal(openedTab([{ ...mine, url: 'http://localhost:5367/other' }], want), null, 'another path');
  const hashed = { ...mine, url: 'http://localhost:5367/#x' };
  assert.equal(openedTab([hashed], want), hashed, 'a hash or query does not matter (host and path do)');
  const sameUrl = { ...stale, url: want };
  assert.equal(openedTab([sameUrl, mine], want, [sameUrl]), mine, 'restored on the same url: the new one');
  assert.equal(openedTab([sameUrl, mine], want, [sameUrl, mine]), null, 'both listed before: undecided, not the first');
  assert.equal(openedTab([sameUrl, mine], want, []), null, 'no listing before: undecided');
  const reused = { ...stale, url: want }; // Safari navigated the restored tab itself: same websocket, new url
  assert.equal(openedTab([reused], want, [stale]), reused);
  assert.equal(openedTab([{ url: want }, 'x', null], want), null, 'no websocket, no candidate');
});

test('I-050 writeOpened / openedHost / scopeTabs: the host of this session\'s open (mode 600); another session\'s record or none scopes nothing; a caller\'s FW_TAB_HOST wins', () => {
  const prev = process.env.FW_STATE_DIR;
  process.env.FW_STATE_DIR = tempDir('fw-sim-opened-');
  try {
    const s1 = { id: 's1' }, s2 = { id: 's2' };
    assert.equal(openedHost(s1), null, 'no record');
    let env = {};
    assert.equal(scopeTabs(s1, env), null);
    assert.deepEqual(env, {});
    writeOpened(s1, 'http://localhost:5367/path?q=1');
    assert.equal(statSync(openedFile()).mode & 0o777, 0o600);
    assert.equal(openedHost(s1), 'localhost:5367');
    assert.equal(openedHost(s2), null, 'an earlier session\'s open does not scope this one');
    assert.equal(openedHost(null), null);
    env = {};
    assert.equal(scopeTabs(s1, env), 'localhost:5367');
    assert.equal(env.FW_TAB_HOST, 'localhost:5367');
    env = { FW_TAB_HOST: 'localhost:9999' };
    assert.equal(scopeTabs(s1, env), 'localhost:9999', 'set by the caller: kept');
    env = {};
    assert.equal(scopeTabs(s2, env), null);
    assert.deepEqual(env, {});
  } finally { if (prev === undefined) delete process.env.FW_STATE_DIR; else process.env.FW_STATE_DIR = prev; }
});

test('I-052 openedUrl / pageMatcher: the page this session\'s last open landed on, matched exactly while Safari lists it (a second open on the same host is no longer AMBIGUOUS); else the host; else any', () => {
  const prev = process.env.FW_STATE_DIR;
  process.env.FW_STATE_DIR = tempDir('fw-sim-opened-url-');
  try {
    const s1 = { id: 's1' }, s2 = { id: 's2' };
    assert.equal(openedUrl(s1), null, 'no record');
    writeOpened(s1, 'http://localhost:5947/?n=2', 'http://localhost:5947/?n=2#top');
    assert.equal(openedUrl(s1), 'http://localhost:5947/?n=2#top', 'where the page landed (location.href)');
    assert.equal(openedHost(s1), 'localhost:5947');
    assert.equal(openedUrl(s2), null, 'an earlier session\'s open names no page in this one');
    writeOpened(s1, 'http://localhost:5947/?n=3');
    assert.equal(openedUrl(s1), 'http://localhost:5947/?n=3', 'without a landed href: the opened url');
  } finally { if (prev === undefined) delete process.env.FW_STATE_DIR; else process.env.FW_STATE_DIR = prev; }
  const ws = (n) => `ws://127.0.0.1:9232/devtools/page/${n}`;
  const list = [{ url: 'http://localhost:63765/', webSocketDebuggerUrl: ws(5) }, { url: 'http://localhost:5947/?n=1', webSocketDebuggerUrl: ws(1) }, { url: 'http://localhost:5947/?n=2', webSocketDebuggerUrl: ws(2) }];
  let m = pageMatcher(list, 'http://localhost:5947/?n=2', 'localhost:5947');
  assert.deepEqual(list.map((t) => m(t.url)), [false, false, true], 'the last open\'s page only');
  m = pageMatcher(list, 'http://localhost:5947/?n=9', 'localhost:5947');
  assert.deepEqual(list.map((t) => m(t.url)), [false, true, true], 'not listed (it navigated on): the host, so two stay AMBIGUOUS (I-037)');
  m = pageMatcher([{ url: 'http://localhost:5947/?n=2' }], 'http://localhost:5947/?n=2', 'localhost:5947');
  assert.equal(m('http://localhost:5947/?n=1'), true, 'a listing without websockets proves nothing: the host');
  m = pageMatcher(list, null, null);
  assert.deepEqual(list.map((t) => m(t.url)), [true, true, true], 'no open in this session: any page (pickTab still scopes by FW_TAB_HOST)');
  assert.equal(pageMatcher(list, null, 'localhost:5947')('not a url'), false);
});

test('iwdpConfigText: list port, each phone once at -1, then the Simulator; a non-id line is refused', () => {
  const a = '00008130-0011223344556677', b = 'abcdef0123456789abcdef0123456789abcdef01';
  assert.equal(iwdpConfigText([a, b, a], { list: 9231, tabs: 9232 }), `null:9231\n${a}:-1\n${b}:-1\n:9232\n`);
  assert.equal(iwdpConfigText([], { list: 9231, tabs: 9232 }), 'null:9231\n:9232\n');
  assert.throws(() => iwdpConfigText(['* evil'], { list: 1, tabs: 2 }), /not an iwdp device id/);
  assert.throws(() => iwdpConfigText([''], { list: 1, tabs: 2 }));
  assert.ok(IWDP_ID.test(a) && !IWDP_ID.test('SIMULATOR') && !IWDP_ID.test('short-123'));
});

test('parseLsofSockets: the webinspectord_sim sockets of field n, deduplicated', () => {
  const s = '/private/var/tmp/com.apple.launchd.X1/com.apple.webinspectord_sim.socket';
  assert.deepEqual(parseLsofSockets(`p12\nf5\nn${s}\nf6\nn/tmp/other.socket\nn${s}\n`), [s]);
  assert.deepEqual(parseLsofSockets(''), []);
  assert.deepEqual(parseLsofSockets(null), []);
});

test('ports: 9231 / 9232 / 8101 by default; the phone\'s 9221, 9222, 8100 and duplicates refused', () => {
  assert.deepEqual(ports({}), { list: 9231, tabs: 9232, wda: 8101 });
  assert.deepEqual(ports({ FW_SIM_DEVICE_PORT: '6001', FW_SIM_PORT: '6002', FW_SIM_WDA_PORT: '6003' }), { list: 6001, tabs: 6002, wda: 6003 });
  for (const [k, v] of [['FW_SIM_PORT', '9222'], ['FW_SIM_DEVICE_PORT', '9221'], ['FW_SIM_WDA_PORT', '8100']]) assert.throws(() => ports({ [k]: v }), /are the iPhone's/);
  assert.throws(() => ports({ FW_SIM_PORT: '9231' }), /must differ/);
  assert.throws(() => ports({ FW_SIM_PORT: 'x' }), /bad simulator tabs port/);
});

test('scrub: known ids (any case) and any UUID / UDID shape are replaced; mask never shows the id', () => {
  const sim = 'A1B2C3D4-E5F6-4711-8899-AABBCCDDEEFF', phone = '00008130-0011223344556677';
  const out = scrub(`boot ${sim} failed; phone ${phone.toLowerCase()} and ${sim.toLowerCase()}`, [sim, phone]);
  assert.ok(!out.includes(sim) && !out.toLowerCase().includes(phone.toLowerCase()) && !out.toLowerCase().includes(sim.toLowerCase()), out);
  assert.match(scrub(`unknown 11111111-2222-3333-4444-555555555555 here`, []), /^unknown <[a-z]+> here$/);
  assert.equal(scrub('', []), '');
  assert.equal(mask(sim), 'set');
  assert.equal(mask(''), '(unset)');
});

test('simMeta: device "simulator", runtime / Xcode / window / tip / ports / host load; settings are n/a (no battery)', () => {
  process.env.FW_STATE_DIR = tempDir('fw-sim-unit-'); // no config: the fields are null, never the real one
  assert.equal(SIM_DEVICE, 'simulator');
  assert.deepEqual(SIM_SETTINGS, { lowPowerMode: 'n/a', batteryPct: 'n/a', charging: 'n/a' });
  const m = simMeta({ window: 'shown', tipDismissed: 'absent', proxyPorts: { list: 9231, tabs: 9232, wda: 8101 } }, { hostStart: { load1: 1 }, hostEnd: { load1: 2 } });
  assert.equal(m.window, 'shown');
  assert.equal(m.tipDismissed, 'absent');
  assert.deepEqual(m.proxyPorts, { list: 9231, tabs: 9232, wda: 8101 });
  assert.deepEqual(m.hostLoad, { start: { load1: 1 }, end: { load1: 2 } });
  for (const k of ['runtime', 'runtimeBuild', 'deviceType', 'xcode', 'lockdownMode']) assert.ok(k in m, k);
  assert.ok(!JSON.stringify(m).match(/udid/i), 'no udid field');
  assert.equal(m.safariCache, null, 'I-052: a session record without the field (from before the fix): null, not "cleared"');
  const c = { cleared: true, removedMB: { NetworkCache: 4, fsCachedData: 0 } };
  assert.deepEqual(simMeta({ safariCache: c }).safariCache, c, 'I-052: every Simulator record says whether Safari\'s HTTP cache was emptied at boot');
});

test('I-052 fetchReport: transferSize > 0 network, 0 with a body cache, cross-origin / missing fields unknown; the server log\'s GETs; exit codes', () => {
  const o = 'http://localhost:5367';
  const css = `${o}/_app/immutable/assets/2.gBuqKVzi.css`, js = `${o}/_app/immutable/nodes/2.DyWL8TcE.js`;
  const page = (entries) => ({ origin: o, entries });
  let r = fetchReport(page([{ name: css, transferSize: 5120, encodedBodySize: 4800, decodedBodySize: 20000 }, { name: js, transferSize: 0, encodedBodySize: 9000, decodedBodySize: 30000 }]), '2.gBuqKVzi.css');
  assert.equal(r.code, 0);
  assert.match(r.lines[0], /^network\s+http:\/\/localhost:5367\/_app\/immutable\/assets\/2\.gBuqKVzi\.css \(transferSize 5120, body 4800 B\)$/);
  r = fetchReport(page([{ name: js, transferSize: 0, encodedBodySize: 9000, decodedBodySize: 30000 }]), '2.DyWL8TcE.js');
  assert.equal(r.code, 3);
  assert.match(r.lines[0], /^cache\s/);
  r = fetchReport(page([{ name: css, transferSize: 300, encodedBodySize: 0, decodedBodySize: 0 }]), 'x.css'.replace('x', '2.gBuqKVzi'));
  assert.equal(r.code, 3, 'transferSize 300 = the spec\'s cache mode "validated": no body came over the network (the real Sim reported it for a load the server never saw)');
  assert.match(r.lines[0], /^validated \(no body transferred\)\s/);
  assert.equal(fetchReport(page([{ name: css, transferSize: 343, encodedBodySize: 43 }]), '.css').code, 0, 'encoded size + 300: network');
  assert.equal(fetchReport(page([{ name: js }]), '.js').code, 3, 'no transferSize: unknown, never "network"');
  assert.match(fetchReport(page([{ name: js }]), '.js').lines[0], /^unknown \(no transferSize\)/);
  assert.match(fetchReport(page([{ name: 'http://cdn.example/x.js', transferSize: 0, encodedBodySize: 0 }]), 'x.js').lines[0], /^unknown \(cross-origin\)/);
  r = fetchReport(page([]), 'nope.css');
  assert.equal(r.code, 1);
  assert.match(r.lines.at(-1), /no resource of the page matches "nope\.css"/);
  const log = ['200 GET /_app/immutable/assets/2.gBuqKVzi.css 1.2ms', '200 GET / 3.0ms', '404 GET /favicon.ico 0.1ms'].join('\n');
  r = fetchReport(page([{ name: css, transferSize: 5120, encodedBodySize: 4800 }]), '2.gBuqKVzi.css', { logText: log });
  assert.equal(r.code, 0);
  assert.equal(r.lines.at(-1), 'server log: 1 GET for 2.gBuqKVzi.css');
  r = fetchReport(page([{ name: css, transferSize: 5120, encodedBodySize: 4800 }]), css, { logText: '200 GET / 3.0ms' });
  assert.equal(r.code, 3, 'network per the page, but no GET in this server\'s log: another server answered');
  assert.equal(r.lines.at(-1), `server log: 0 GETs for ${css}`);
});

test('I-052 safariCacheTargets: the two HTTP cache dirs under a data container of this device only; anything else refused', () => {
  const udid = '0A1B2C3D-0000-4000-8000-00000000ABCD';
  const app = `/Users/x/Library/Developer/CoreSimulator/Devices/${udid}/data/Containers/Data/Application/0F0F0F0F-0000-4000-8000-000000000001`;
  assert.deepEqual(safariCacheTargets(app, udid), [
    { name: 'NetworkCache', path: `${app}/Library/Caches/com.apple.mobilesafari/WebKit/NetworkCache` },
    { name: 'fsCachedData', path: `${app}/Library/Caches/com.apple.mobilesafari/fsCachedData` }]);
  assert.deepEqual(safariCacheTargets(`${app}\n`, udid).map((t) => t.name), ['NetworkCache', 'fsCachedData'], 'simctl\'s trailing newline');
  for (const bad of ['', 'relative/data/Containers/Data/Application/x', `/Users/x/Library/Developer/CoreSimulator/Devices/OTHER-DEVICE/data/Containers/Data/Application/0F0F`,
    `/Users/x/Library/Developer/CoreSimulator/Devices/${udid}/data`, `/Users/x/Library/Developer/CoreSimulator/Devices/${udid}/data/Containers/Data/Application/`,
    `/Users/x/Library/Developer/CoreSimulator/Devices/${udid}/data/Containers/Data/Application/../../../..`, `${app}/a b\nc`]) {
    assert.throws(() => safariCacheTargets(bad, udid), /not a data container of fw-sim/, JSON.stringify(bad));
  }
  assert.ok(!(() => { try { safariCacheTargets('/elsewhere', udid); } catch (e) { return e.message.includes(udid); } })(), 'the error never names the udid');
});

test('proxyCheck (before every timed run): exactly SIMULATOR passes; a phone that appeared later, or no Simulator, throws without printing its id', async () => {
  process.env.FW_STATE_DIR = tempDir('fw-sim-unit-');
  let list = [];
  const srv = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(list)); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const p = { list: srv.address().port, tabs: 1, wda: 2 };
  try {
    list = [{ deviceId: 'SIMULATOR' }];
    assert.equal((await proxyCheck(p)).ok, true);
    list = [{ deviceId: 'SIMULATOR' }, { deviceId: '00008130-0011223344556677', deviceName: "Test Person's iPhone" }];
    await assert.rejects(proxyCheck(p), (e) => /proxy sees a non-simulator device \(1 non-simulator/.test(e.message) && !/00008130|Test Person/.test(e.message));
    list = [];
    await assert.rejects(proxyCheck(p), /lists no Simulator/);
  } finally { srv.close(); }
  await assert.rejects(proxyCheck(p), /not reachable/);
});

test('runTarget: the Simulator target of iphone.mjs run; renew() refuses a run that would outlast the hold (minus cleanup)', async () => {
  process.env.FW_STATE_DIR = tempDir('fw-sim-unit-');
  const t = runTarget({ window: 'hidden' }, { requireSession: () => {}, holdEndsAt: () => T0 + 100000, cleanupMs: 40000, now: () => T0 });
  assert.equal(t.device, 'simulator');
  assert.equal(t.outDir, 'sim');
  assert.deepEqual(t.toolFiles.slice(0, 3), ['tools/sim.mjs', 'tools/lib/sim.mjs', 'tools/lib/sim-scroll.mjs']);
  assert.ok(t.toolFiles.includes('tools/lib/iphone-run.mjs'));
  await t.renew(60000);
  await assert.rejects(t.renew(61000), /needs about 61 s, but your chrome-measure hold leaves 60 s/);
  assert.deepEqual(Object.keys(t.extra()), ['sim']);
  assert.equal(t.extra().sim.window, 'hidden');
});

test('I-063 timingDemand: a normal holder or waiter of chrome-measure (verify, ab, bench, a normal run or lease) is timing; short, shared, functional (lane off), no-timing and stale ones are not', () => {
  const q = (...w) => ({ holder: null, stale: null, queue: w });
  assert.equal(timingDemand(q()), null);
  assert.equal(timingDemand({ holder: { owner: 'ab', kind: 'process' }, stale: null, queue: [] }), 'chrome-measure is held by "ab" (a timing hold)');
  assert.equal(timingDemand({ holder: { owner: 'ab', kind: 'process' }, stale: 'pid 1 is gone', queue: [] }), null, 'a stale holder holds nothing');
  for (const h of [{ owner: 'npm', short: true, maxSec: 300 }, { owner: '(shared)', short: true, shared: true, readers: [] }, { owner: 'sim', short: true, functional: true, weight: 3 }, { owner: 'build', noTiming: true }]) {
    assert.equal(timingDemand({ holder: h, stale: null, queue: [] }), null, JSON.stringify(h));
    assert.equal(timingDemand(q({ ...h, since: 'x' })), null, `queued ${JSON.stringify(h)}`);
  }
  assert.equal(timingDemand(q({ owner: 'npm', short: true }, { owner: 'fix-x', kind: 'process' })), '"fix-x" waits for a timing hold of chrome-measure', 'a timing waiter behind a short one');
});

test('I-063 idleSec / warmMismatch / warmLine / realStateInTest: the idle timeout (default 600, 0 = never warm); a warm device is reused only as recorded (device, type, runtime); a test without its own state dir never reads the real one', () => {
  assert.equal(IDLE_SEC_DEFAULT, 600);
  assert.equal(idleSec({}), 600);
  assert.equal(idleSec({ FW_SIM_IDLE_SEC: '0' }), 0);
  assert.equal(idleSec({ FW_SIM_IDLE_SEC: '90' }), 90);
  assert.throws(() => idleSec({ FW_SIM_IDLE_SEC: '-1' }), /FW_SIM_IDLE_SEC must be a number of seconds >= 0/);
  const cfg = { udid: 'U1', deviceType: DEVICE_TYPE, runtimeId: 'rt26' };
  const dev = { udid: 'U1', state: 'Booted', deviceTypeIdentifier: DEVICE_TYPE, runtimeId: 'rt26' };
  const w = { udid: 'U1', runtimeId: 'rt26' };
  assert.equal(warmMismatch(w, dev, cfg), null);
  assert.equal(warmMismatch(null, dev, cfg), 'no warm record');
  assert.match(warmMismatch(w, { ...dev, state: 'Shutting Down' }, cfg), /is Shutting Down/);
  assert.equal(warmMismatch({ ...w, udid: 'U2' }, dev, cfg), 'the warm record names another device');
  assert.equal(warmMismatch(w, { ...dev, deviceTypeIdentifier: 'x.iPhone-16' }, cfg), 'another device type');
  assert.equal(warmMismatch(w, { ...dev, runtimeId: 'rt18' }, cfg), 'another iOS runtime');
  assert.equal(warmMismatch({ ...w, runtimeId: 'rt18' }, dev, cfg), 'another iOS runtime');
  const now = Date.parse('2026-10-02T12:10:00Z');
  const s = { warm: { lastOwner: 'fix-a', sessions: 2, bootedAt: '2026-10-02T12:00:00Z', lastSessionEndedAt: '2026-10-02T12:09:00Z', idleUntil: '2026-10-02T12:19:00Z' }, keeper: { pid: 4242, alive: true } };
  assert.equal(warmLine(s, now), 'warm: fw-sim booted, idle 60 s since the session of "fix-a" (2 session(s) on this boot since 2026-10-02T12:00:00Z); shuts down by 2026-10-02T12:19:00Z or when a timing hold is queued; keeper pid 4242');
  assert.match(warmLine({ ...s, keeper: { pid: 4242, alive: false } }, now), /keeper pid 4242 DEAD: node tools\/sim\.mjs shutdown$/);
  assert.match(warmLine({ ...s, keeper: null }, now), /keeper MISSING: node tools\/sim\.mjs shutdown$/);
  assert.equal(warmLine(null), null);
  assert.deepEqual(warmSummary(s, now), { bootedAt: '2026-10-02T12:00:00Z', lastSessionEndedAt: '2026-10-02T12:09:00Z', idleUntil: '2026-10-02T12:19:00Z', sessions: 2, keeperAlive: true, at: '2026-10-02T12:10:00.000Z' });
  assert.equal(realStateInTest({ NODE_TEST_CONTEXT: 'child-v8' }), true);
  assert.equal(realStateInTest({ NODE_TEST_CONTEXT: 'child-v8', FW_STATE_DIR: '/tmp/x' }), false);
  assert.equal(realStateInTest({}), false);
});

test('I-063 review-i063 B1/B2/N3/N6: reapResult tells shut down / stale / gone / FAILED apart; reapNote is a WAIT on failure; warmLine says "booted" only when nothing says otherwise; settleSec', () => {
  const before = { lastSessionEndedAt: '2026-10-02T12:09:00Z', keeperAlive: false };
  const res = (status, stdout, stderr = '') => reapResult({ status, stdout, stderr }, before);
  const done = res(0, 'fw-sim shut down\nSIM_WARM_SHUTDOWN (verify.mjs timing hold; by verify): fw-sim shut down, warm since x\n');
  assert.deepEqual([done.action, done.ok, done.shutDown, 'stale' in done], ['shut down', true, true, false]);
  const stale = res(0, 'SIM_WARM_SHUTDOWN (verify.mjs timing hold; by verify): fw-sim already shut down, warm since x\n');
  assert.deepEqual([stale.action, stale.ok, stale.stale, 'shutDown' in stale], ['already shut down (a stale record, removed)', true, true, false]);
  const gone = res(0, 'SIM_WARM none: no warm Simulator recorded\n');
  assert.deepEqual([gone.action, gone.ok, 'shutDown' in gone], ['gone before the shutdown (the keeper or a session took it)', true, false]);
  const failed = res(3, 'SIM_WARM_SHUTDOWN_FAILED (x; by verify): shutdown failed (exit 164); fw-sim is Booted; the warm record stays\n', 'the warm Simulator was not shut down: shutdown failed\n');
  assert.deepEqual([failed.action, failed.ok, 'shutDown' in failed], ['shutdown FAILED', false, false]);
  assert.match(failed.error, /the warm Simulator was not shut down/);
  assert.equal(res(0, 'SIM_WARM_SHUTDOWN_FAILED (x; by y): z\n').ok, false, 'the FAILED line wins over exit 0');
  assert.match(reapNote(failed, 'this verify hold'), /^WAIT: a warm Simulator \(fw-sim\) may still be booted and its shutdown failed \(.*\): nothing is timed beside it, so this verify hold stops here; node tools\/sim\.mjs doctor --fix/);
  assert.match(reapNote(stale, 'this bench hold'), /^NOTE: a stale warm Simulator record .* at the start of this bench hold: fw-sim was not booted, the record was removed; nothing ran beside it/);
  assert.match(reapNote(done, 'this verify hold'), /^NOTE: a warm Simulator \(fw-sim, idle since 2026-10-02T12:09:00Z, keeper not running\) was still booted at the start of this verify hold: shut down before the first run/);
  assert.equal(reapNote(null), null);
  // warmLine (N3): the real state, a record from before the Mac's last start, a dead keeper, a failed shutdown
  const now = Date.parse('2026-10-02T12:10:00Z');
  const s = { warm: { lastOwner: 'fix-a', sessions: 2, bootedAt: '2026-10-02T12:00:00Z', lastSessionEndedAt: '2026-10-02T12:09:00Z', idleUntil: '2026-10-02T12:19:00Z' }, keeper: { pid: 4242, alive: true } };
  assert.match(warmLine(s, now, { devState: 'Shutdown' }), /^warm: STALE record: fw-sim is Shutdown \(the record of the session of "fix-a" at 2026-10-02T12:09:00Z\); node tools\/sim\.mjs shutdown clears it$/);
  assert.match(warmLine(s, now, { devState: null }), /^warm: STALE record: fw-sim is not found/);
  assert.match(warmLine({ ...s, stale: true }, now), /^warm: STALE record: the Mac restarted at \S+, after the session of "fix-a" at 2026-10-02T12:09:00Z \(fw-sim not booted since\)/);
  assert.match(warmLine({ ...s, keeper: { pid: 4242, alive: false } }, now), /^warm: fw-sim recorded as booted \(state unchecked\), idle 60 s/);
  assert.match(warmLine({ ...s, keeper: { pid: 4242, alive: false } }, now, { devState: 'Booted' }), /^warm: fw-sim booted, idle 60 s/);
  assert.match(warmLine({ ...s, warm: { ...s.warm, shutdownFailed: { at: 'T1', by: 'keeper', why: 'w' } } }, now), /; its last shutdown FAILED \(T1, by keeper\): node tools\/sim\.mjs doctor --fix$/);
  assert.deepEqual([warmSummary({ ...s, stale: true }, now).stale, warmSummary({ ...s, warm: { ...s.warm, shutdownFailed: { at: 'T1' } } }, now).shutdownFailed], [true, { at: 'T1' }]);
  assert.equal(settleSec({}), 20);
  assert.equal(settleSec({ FW_SIM_SETTLE_SEC: '0' }), 0);
  assert.throws(() => settleSec({ FW_SIM_SETTLE_SEC: 'x' }), /FW_SIM_SETTLE_SEC must be a number of seconds >= 0/);
});
