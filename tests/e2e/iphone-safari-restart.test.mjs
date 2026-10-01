// tools/iphone.mjs safari-restart (tools/lib/safari-restart.mjs), without the phone: against
// tests/fixtures/fake-webkit-proxy.mjs --wda-port (a fake Safari that quits and restarts on the fake WDA's
// terminate / launch / url) and tests/fixtures/fake-devicectl.mjs ($FW_DEVICECTL). Checks the lease guard, the WDA
// call sequence, the devicectl arguments, the fallback, the wait for a page that answers, and that no UDID, device
// name or LAN host reaches the output (Hard rule 12). Never the real phone, its proxy, the real WDA or the real locks.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool, freePort, startProc, TESTS } from '../helpers.mjs';

const IPHONE = tool('iphone.mjs'), LOCK = tool('lock.mjs');
const FIX = join(TESTS, 'fixtures');
const UDID = '00008130-0011223344556677'; // made up
let env;
before(async () => { env = { FW_WDA_HOME: tempDir('fw-wdahome-'), FW_IPHONE_PORT: String(await freePort()), FW_WDA_URL: `http://127.0.0.1:${await freePort()}` }; });
beforeEach(() => { env = { ...env, FW_STATE_DIR: tempDir('fw-srestart-') }; });
const lock = (e, ...a) => node(LOCK, a, { env: e });
const procs = [];
after(() => Promise.all(procs.map((p) => p.stop())));

async function fakePhone(args = []) {
  const dir = tempDir('fw-srphone-');
  const wipLog = join(dir, 'wip.jsonl'), wdaLog = join(dir, 'wda.jsonl'), ctlLog = join(dir, 'ctl.jsonl');
  const p = await startProc(process.execPath, [join(FIX, 'fake-webkit-proxy.mjs'), '--port=0', '--url=http://192.168.0.2:5441/', '--wda-port=0', '--launch-ms=200', ...args],
    { env: { FAKE_WIP_LOG: wipLog, FAKE_WDA_LOG: wdaLog }, ready: (s) => /^FAKE_WDA_PORT=\d+$/m.test(s) });
  procs.push(p);
  const out = p.stdout();
  const wip = out.match(/^FAKE_WIP_PORT=(\d+)$/m)[1];
  const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  writeFileSync(join(env.FW_WDA_HOME, 'config.json'), JSON.stringify({ udid: UDID, deviceName: 'Test Person Phone' }));
  return {
    env: { ...env, FW_IPHONE_PORT: wip, FW_WDA_URL: `http://127.0.0.1:${out.match(/^FAKE_WDA_PORT=(\d+)$/m)[1]}`,
      FW_DEVICECTL: join(FIX, 'fake-devicectl.mjs'), FAKE_APPCTL_PROXY: `http://127.0.0.1:${wip}`, FAKE_APPCTL_LOG: ctlLog },
    wda: () => read(wdaLog), wip: () => read(wipLog), ctl: () => read(ctlLog),
  };
}
const calls = (ph) => ph.wda().map((c) => `${c.method} ${c.path.replace(/FAKE-\d+/, ':id')}`);
const clean = (r) => {
  for (const s of [UDID, '192.168.0', 'Test Person']) assert.ok(!r.out.includes(s), `output names ${s}: ${r.out}`);
};

test('safari-restart needs the iphone lease and touches nothing without it', async () => {
  const ph = await fakePhone();
  const r = node(IPHONE, ['safari-restart', '--owner', 'me'], { env: ph.env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /don't hold the iphone lease/);
  assert.deepEqual(ph.wda(), []);
  assert.deepEqual(ph.ctl(), []);
});

test('via WDA (auto, WDA up): terminate, launch, then the URL loads in the restored tab (no new tab); prints SAFARI_RESTARTED', async () => {
  const ph = await fakePhone();
  lock(ph.env, 'acquire', 'iphone', '--owner', 'me');
  const page = `http://127.0.0.1:${await freePort()}/page?x=1`; // nothing listens: Safari shows "Failed to open page" there, still that origin
  const r = node(IPHONE, ['safari-restart', '--owner', 'me', '--url', page], { env: ph.env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^SAFARI_RESTARTED via wda in \\d+ ms: ${page.replace(/[?.]/g, '\\$&')}$`, 'm'));
  assert.deepEqual(calls(ph), ['GET /status', 'POST /session', 'POST /session/:id/appium/settings', 'POST /session/:id/wda/apps/terminate',
    'POST /session/:id/wda/apps/launch', 'DELETE /session/:id']);
  const w = ph.wda();
  assert.deepEqual(w[3].body, { bundleId: 'com.apple.mobilesafari' });
  assert.deepEqual(w[4].body, { bundleId: 'com.apple.mobilesafari', shouldWaitForQuiescence: false });
  assert.deepEqual(ph.wip().filter((x) => x.app).map((x) => x.app), ['terminate', 'launch']);
  assert.deepEqual(ph.wip().filter((x) => x.navigate).map((x) => x.navigate), [page], 'loaded in the restored tab');
  assert.ok(!w.some((c) => c.forbidden));
  assert.deepEqual(ph.ctl(), [], 'devicectl not used while WDA is up');
  clean(r);
});

test('no --url: Safari comes back on its restored tab; a LAN tab url is printed as lan-host', async () => {
  const ph = await fakePhone();
  lock(ph.env, 'acquire', 'iphone', '--owner', 'me');
  const r = node(IPHONE, ['safari-restart', '--owner', 'me'], { env: ph.env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^SAFARI_RESTARTED via wda in \d+ ms: http:\/\/lan-host:5441\/$/m);
  assert.ok(!calls(ph).includes('POST /session/:id/url'));
  clean(r);
});

test('via devicectl: one launch --terminate-existing, the URL in the restored tab; auto falls back to it when WDA is down', async () => {
  const ph = await fakePhone();
  lock(ph.env, 'acquire', 'iphone', '--owner', 'me');
  const page = `http://127.0.0.1:${await freePort()}/d`;
  const r = node(IPHONE, ['safari-restart', '--owner', 'me', '--via', 'devicectl', '--url', page], { env: ph.env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^SAFARI_RESTARTED via devicectl in \d+ ms: http:\/\/127\.0\.0\.1:\d+\/d$/m);
  assert.deepEqual(ph.ctl(), [['device', 'process', 'launch', '--terminate-existing', '--device', UDID, 'com.apple.mobilesafari']]);
  assert.deepEqual(ph.wip().filter((x) => x.navigate).map((x) => x.navigate), [page]);
  assert.deepEqual(calls(ph), [], 'no WDA call with --via devicectl');
  clean(r);
  const down = { ...ph.env, FW_WDA_URL: `http://127.0.0.1:${await freePort()}` };
  const r2 = node(IPHONE, ['safari-restart', '--owner', 'me'], { env: down });
  assert.equal(r2.code, 0, r2.out);
  assert.match(r2.stdout, /^SAFARI_RESTARTED via devicectl /m);
  assert.deepEqual(ph.ctl()[1], ['device', 'process', 'launch', '--terminate-existing', '--device', UDID, 'com.apple.mobilesafari']);
  clean(r2);
});

test('Safari restores no page: the driver opens the URL (WDA /url, devicectl --payload-url); without --url that is an error', async () => {
  const ph = await fakePhone(['--launch-blank']);
  lock(ph.env, 'acquire', 'iphone', '--owner', 'me');
  const page = `http://127.0.0.1:${await freePort()}/fresh`;
  const r = node(IPHONE, ['safari-restart', '--owner', 'me', '--url', page, '--timeout', '6'], { env: ph.env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^Safari restored no page: opening http:\/\/127\.0\.0\.1:\d+\/fresh via wda \(a new tab\)$/m);
  assert.match(r.stdout, /^SAFARI_RESTARTED via wda in \d+ ms: http:\/\/127\.0\.0\.1:\d+\/fresh$/m);
  assert.deepEqual(calls(ph).filter((c) => /apps|url/.test(c)), ['POST /session/:id/wda/apps/terminate', 'POST /session/:id/wda/apps/launch', 'POST /session/:id/url']);
  assert.deepEqual(ph.wda().find((c) => c.path.endsWith('/url')).body, { url: page, bundleId: 'com.apple.mobilesafari' });
  const r2 = node(IPHONE, ['safari-restart', '--owner', 'me', '--via', 'devicectl', '--url', page, '--timeout', '6'], { env: ph.env });
  assert.equal(r2.code, 0, r2.out);
  assert.deepEqual(ph.ctl(), [['device', 'process', 'launch', '--terminate-existing', '--device', UDID, 'com.apple.mobilesafari'], ['device', 'process', 'launch', '--payload-url', page, '--device', UDID, 'com.apple.mobilesafari']]);
  const r3 = node(IPHONE, ['safari-restart', '--owner', 'me', '--timeout', '2'], { env: ph.env });
  assert.equal(r3.code, 1);
  assert.match(r3.stderr, /safari-restart: Safari did not come back with a page within 2 s/);
  clean(r); clean(r2); clean(r3);
});

test('failures are clear and safe: devicectl naming the UDID, device and a LAN host; Safari never coming back; WDA launch failing', async () => {
  const ph = await fakePhone(['--launch-never']);
  lock(ph.env, 'acquire', 'iphone', '--owner', 'me');
  const f = node(IPHONE, ['safari-restart', '--owner', 'me', '--via', 'devicectl'], { env: { ...ph.env, FAKE_APPCTL_FAIL: '1' } });
  assert.equal(f.code, 1);
  assert.match(f.stderr, /safari-restart: devicectl launch --terminate-existing failed \(exit 1\): .*<udid>.*lan-host/);
  clean(f);
  const t = node(IPHONE, ['safari-restart', '--owner', 'me', '--timeout', '2'], { env: ph.env });
  assert.equal(t.code, 1);
  assert.match(t.stderr, /safari-restart: Safari did not come back with a page within 2 s: no tab matching any page/);
  clean(t);
  const ph2 = await fakePhone(['--fail-app=launch']);
  const w = node(IPHONE, ['safari-restart', '--owner', 'me', '--via', 'wda'], { env: { ...ph2.env, FW_STATE_DIR: ph.env.FW_STATE_DIR } });
  assert.equal(w.code, 1);
  assert.match(w.stderr, /safari-restart: WDA POST \/session\/FAKE-1\/wda\/apps\/launch: HTTP 500 unknown error: injected failure on launch/);
  assert.equal(calls(ph2).at(-1), 'DELETE /session/:id', 'the WDA session is closed after a failure');
  const v = node(IPHONE, ['safari-restart', '--owner', 'me', '--via', 'telepathy'], { env: ph.env });
  assert.equal(v.code, 1);
  assert.match(v.stderr, /--via must be one of auto, wda, devicectl, simctl/);
});
