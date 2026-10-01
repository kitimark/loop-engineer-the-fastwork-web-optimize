// tools/lib/safari-restart.mjs in process: driver choice, argument shapes, the wait, error wrapping and scrubbing.
// The end-to-end path (iphone.mjs safari-restart against a fake Safari, fake WDA and fake devicectl) is
// tests/e2e/iphone-safari-restart.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, TESTS } from '../helpers.mjs';
import { safariRestart, devicectlArgs, simctlDriver, devicectlDriver, waitForPage, isTarget, safe, VIAS, heldBy, heldTabs, INSPECTOR_HINT } from '../../tools/lib/safari-restart.mjs';

const UDID = '00008130-0011223344556677'; // made up
const drv = (name, { up = true, fail = null, seen = [] } = {}) => ({ name, async available() { return up; },
  async restart() { seen.push([name, 'restart']); if (fail) throw new Error(fail); }, async open(url) { seen.push([name, 'open', url]); } });
const RESTORED = 'http://127.0.0.1:1/restored';
/** A fake wait: the restored page (target null) is `restored` (null: none, noPage), a target is shown with `title`. */
const waiter = ({ restored = RESTORED, title = 'Page', calls = [] } = {}) => async ({ target }) => {
  calls.push(target);
  if (!target) { if (!restored) { const e = new Error('Safari did not come back with a page within 3 s: no tab'); e.noPage = true; throw e; } return { tab: { url: restored, webSocketDebuggerUrl: 'ws://x' }, landed: { href: restored, title: 'Old', mirror: 0 } }; }
  return { tab: { url: target }, landed: { href: target, title, mirror: 0 } };
};
const quiet = () => {};

test('devicectl arguments: one launch that terminates the running Safari, the URL as payload', () => {
  assert.deepEqual(devicectlArgs({ udid: UDID }), ['device', 'process', 'launch', '--terminate-existing', '--device', UDID, 'com.apple.mobilesafari']);
  assert.deepEqual(devicectlArgs({ udid: UDID, url: 'http://127.0.0.1:5200/' }), ['device', 'process', 'launch', '--payload-url', 'http://127.0.0.1:5200/', '--device', UDID, 'com.apple.mobilesafari']);
  assert.ok(isTarget('http://127.0.0.1:5200/', 'http://127.0.0.1:5200') && isTarget('http://h:1/p?x=1', 'http://h:1/p?x=1') && !isTarget('http://h:1/p?x=2', 'http://h:1/p?x=1'));
  assert.deepEqual(VIAS, ['auto', 'wda', 'devicectl', 'simctl']);
});

test('auto takes the first available driver; --via names one; neither available is a clear error', async () => {
  const seen = [];
  let r = await safariRestart({ drivers: [drv('wda', { up: false, seen }), drv('devicectl', { seen })], port: 1, wait: waiter(), log: quiet });
  assert.deepEqual([r.via, r.href, r.opened], ['devicectl', RESTORED, null]);
  r = await safariRestart({ drivers: [drv('wda', { seen }), drv('devicectl', { seen })], via: 'wda', port: 1, wait: waiter(), log: quiet });
  assert.equal(r.via, 'wda');
  assert.deepEqual(seen, [['devicectl', 'restart'], ['wda', 'restart']]);
  await assert.rejects(safariRestart({ drivers: [drv('wda', { up: false }), drv('devicectl', { up: false })], port: 1, log: quiet }), /^Error: safari-restart: no way to restart Safari is available \(tried wda, devicectl\)/);
  await assert.rejects(safariRestart({ drivers: [drv('wda')], via: 'simctl', port: 1, log: quiet }), /--via simctl is not available here \(use wda\)/);
  await assert.rejects(safariRestart({ drivers: [drv('wda')], via: 'x', port: 1, log: quiet }), /--via must be one of/);
  await assert.rejects(safariRestart({ drivers: [drv('wda')], url: 'javascript:alert(1)', port: 1, log: quiet }), /--url must be an http\(s\) URL/);
});

test('--url: loaded in the restored tab (no new tab); with no restored page the driver opens it; a certificate warning fails (I-003); messages are scrubbed', async () => {
  const seen = [], lines = [], calls = [], navs = [];
  const url = 'http://127.0.0.1:1/x';
  const navigate = async (tab, u) => { navs.push([tab.url, u]); };
  let r = await safariRestart({ drivers: [drv('wda', { seen })], url, port: 1, wait: waiter({ calls }), navigate, log: (s) => lines.push(s) });
  assert.deepEqual(seen, [['wda', 'restart']], 'the driver did not open a tab');
  assert.deepEqual(navs, [[RESTORED, url]]);
  assert.deepEqual(calls, [null, url], 'waited for the restored page, then for the target');
  assert.deepEqual([r.href, r.opened], [url, 'tab']);
  assert.match(lines.at(-1), /^SAFARI_RESTARTED via wda in \d+ ms: http:\/\/127\.0\.0\.1:1\/x$/);
  seen.length = 0; navs.length = 0;
  r = await safariRestart({ drivers: [drv('wda', { seen })], url, port: 1, wait: waiter({ restored: null }), navigate, log: (s) => lines.push(s) });
  assert.deepEqual(seen, [['wda', 'restart'], ['wda', 'open', url]]);
  assert.deepEqual([navs.length, r.opened], [0, 'driver']);
  assert.match(lines.at(-2), /^Safari restored no page: opening http:\/\/127\.0\.0\.1:1\/x via wda \(a new tab\)$/);
  // no restored page and no --url: an error, not a silent success
  await assert.rejects(safariRestart({ drivers: [drv('wda')], port: 1, wait: waiter({ restored: null }), log: quiet }), /safari-restart: Safari did not come back with a page/);
  await assert.rejects(safariRestart({ drivers: [drv('wda')], url, port: 1, wait: waiter({ title: 'This Connection Is Not Private' }), navigate, log: quiet }), /Safari did not load .*certificate warning/);
  // a driver error naming the UDID, the device's name and a LAN host
  const known = { udid: UDID, deviceName: 'Kim Phone' };
  await assert.rejects(safariRestart({ drivers: [drv('wda', { fail: `device ${UDID} (Kim Phone) at http://192.168.0.7:8100/ refused` })], port: 1, known, log: quiet }),
    (e) => !e.message.includes(UDID) && !e.message.includes('Kim Phone') && !e.message.includes('192.168') && /<udid> \(<device-name>\) at http:\/\/lan-host:8100\/ refused/.test(e.message));
  assert.equal(safe(`x ${UDID} 10.0.0.5`, {}), 'x <udid> lan-host');
});

test('waitForPage: polls until a page answers, else names the last reason after the timeout', async () => {
  let n = 0;
  const fetchImpl = async () => ({ json: async () => (++n < 3 ? [] : [{ url: 'about:blank', webSocketDebuggerUrl: 'ws://127.0.0.1:1/x' }]) });
  await assert.rejects(waitForPage({ port: 1, timeoutMs: 600, pollMs: 50, fetchImpl }), (e) => /Safari did not come back with a page within 1 s: no tab matching any page .*blank web views are never picked/.test(e.message) && e.noPage === true);
  assert.ok(n >= 3, 'it polled');
  const down = async () => { const e = new TypeError('fetch failed'); e.cause = { code: 'ECONNREFUSED' }; throw e; };
  await assert.rejects(waitForPage({ port: 7, timeoutMs: 200, pollMs: 50, fetchImpl: down }), /the WebKit proxy on :7 did not answer \(ECONNREFUSED\)/);
  // with a URL only that origin counts: another origin's tab is not Safari coming back on the page
  const other = async () => ({ json: async () => [{ url: 'http://127.0.0.1:9/', title: 'Inbox', webSocketDebuggerUrl: 'ws://127.0.0.1:1/x' }] });
  await assert.rejects(waitForPage({ port: 1, target: 'http://127.0.0.1:5200/', timeoutMs: 200, pollMs: 50, fetchImpl: other }), (e) => /Safari did not show http:\/\/127\.0\.0\.1:5200\/ within 0 s: no tab matching the matcher/.test(e.message) && !e.message.includes('Inbox'));
  // several matching tabs: AMBIGUOUS at once, not after the timeout (I-037)
  const two = async () => ({ json: async () => [{ url: 'http://127.0.0.1:9/a', webSocketDebuggerUrl: 'ws://127.0.0.1:1/a' }, { url: 'http://127.0.0.1:9/b', webSocketDebuggerUrl: 'ws://127.0.0.1:1/b' }] });
  const t0 = Date.now();
  await assert.rejects(waitForPage({ port: 1, timeoutMs: 5000, pollMs: 50, fetchImpl: two }), /AMBIGUOUS: 2 tabs match/);
  assert.ok(Date.now() - t0 < 2000);
});

test('simctl driver: terminate (a Safari not running is fine), launch, openurl; devicectl failure output is scrubbed', async () => {
  const log = join(tempDir('fw-srunit-'), 'ctl.jsonl');
  const env = { ...process.env, FW_SIMCTL: join(TESTS, 'fixtures', 'fake-devicectl.mjs'), FW_DEVICECTL: join(TESTS, 'fixtures', 'fake-devicectl.mjs'), FAKE_APPCTL_LOG: log };
  delete env.FAKE_APPCTL_PROXY;
  const sim = simctlDriver({ udid: 'SIM-UDID', env });
  await sim.restart();
  await sim.open('http://127.0.0.1:5200/');
  await sim.restart();
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)), [
    ['terminate', 'SIM-UDID', 'com.apple.mobilesafari'], ['launch', 'SIM-UDID', 'com.apple.mobilesafari'], ['openurl', 'SIM-UDID', 'http://127.0.0.1:5200/'],
    ['terminate', 'SIM-UDID', 'com.apple.mobilesafari'], ['launch', 'SIM-UDID', 'com.apple.mobilesafari']]);
  await assert.rejects(devicectlDriver({ udid: null, env }).restart(), /no device UDID configured/);
  const failing = devicectlDriver({ udid: UDID, env: { ...env, FAKE_APPCTL_FAIL: '1' } });
  await assert.rejects(safariRestart({ drivers: [failing], port: 1, known: { udid: UDID }, log: quiet }),
    (e) => /devicectl launch --terminate-existing failed \(exit 1\)/.test(e.message) && !e.message.includes(UDID) && !e.message.includes('192.168') && !e.message.includes('Test Person'));
});

test('another inspector: a page the proxy lists without devtoolsFrontendUrl is named before the restart; an unanswered evaluate carries the Web Inspector hint', async () => {
  const held = { url: 'http://127.0.0.1:1/a', devtoolsFrontendUrl: '' }, blank = { url: 'about:blank', devtoolsFrontendUrl: '' }, free = { url: 'http://127.0.0.1:1/b', devtoolsFrontendUrl: '/d' };
  assert.match(heldBy(held, [held, blank, free]), /another client of the WebKit proxy holds this page/);
  assert.match(heldBy(free, [held, blank, free]), /close Safari Web Inspector on the Mac/);
  // a proxy without a frontend (-F, sim.mjs) lists "" for every page: that is no hold
  assert.equal(heldBy(held), `; ${INSPECTOR_HINT}`);
  assert.deepEqual(heldTabs([held, { url: 'http://127.0.0.1:1/c', devtoolsFrontendUrl: '' }]), []);
  assert.equal(heldBy({}), `; ${INSPECTOR_HINT}`);
  const lines = [];
  const listTabs = async () => [held, blank, free];
  await safariRestart({ drivers: [drv('wda')], port: 1, wait: waiter(), listTabs, log: (s) => lines.push(s) });
  assert.match(lines[0], /^note: 1 page\(s\) held by another client of the WebKit proxy/);
  lines.length = 0;
  await safariRestart({ drivers: [drv('wda')], port: 1, wait: waiter(), listTabs: async () => [held], log: (s) => lines.push(s) });
  assert.match(lines[0], /^restarting Safari via wda$/, 'no frontend anywhere: no note');
  lines.length = 0;
  await safariRestart({ drivers: [drv('wda')], port: 1, wait: waiter(), listTabs: async () => { throw new Error('down'); }, log: (s) => lines.push(s) });
  assert.match(lines[0], /^restarting Safari via wda$/, 'a proxy that does not answer before the restart is no error');
});
