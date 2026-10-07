// tools/usblink.mjs (incident I-222): the iPhone's USB link as one line and an exit code per state, the proxy we start
// (and only that one), the watch's repair of a stale proxy and its re-plug console step. Fakes only: a fake usbmuxd
// socket (tests/fixtures/fake-usbmuxd.mjs), a fake IOUSB (fake-ioreg.mjs), a fake phone proxy (fake-phone-iwdp.mjs) on
// free ports, a temp state dir. Never the Mac's usbmuxd, USB bus, the real proxy, :9221/:9222 or the phone.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { tempDir, node, nodeAsync, tool, sleep, TESTS, cleanEnv, freeStablePorts, killFixtures } from '../helpers.mjs';
import { startFakeUsbmuxd } from '../fixtures/fake-usbmuxd.mjs';

const USBLINK = tool('usblink.mjs');
const FAKE_IWDP = join(TESTS, 'fixtures', 'fake-phone-iwdp.mjs');
const UDID = '00008130-0011223344556677';
const PHONE = { deviceId: UDID, deviceName: "Test Person's iPhone", url: 'localhost:9222' };
let dir, env, mux, port, t0;
const io = (mode) => writeFileSync(join(dir, 'ioreg-mode'), mode);
const proxyList = (list) => writeFileSync(join(dir, 'iwdp-devices.json'), JSON.stringify(list));
// async: the fake usbmuxd answers from this test process, so a CLI call must not block its event loop (spawnSync would)
const run = (...a) => nodeAsync(USBLINK, a, { env, timeout: 60000 });
const audit = () => { try { return readFileSync(join(dir, 'state', 'usblink', 'audit.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const noIds = (out, what) => assert.doesNotMatch(out, /00008130|Test Person|FAKESERIAL/, `${what}: no device id, name or serial`);

beforeEach(async () => {
  t0 = Date.now();
  dir = tempDir('fw-usblink-');
  mkdirSync(join(dir, 'wda'), { recursive: true });
  mux = await startFakeUsbmuxd(dir);
  [port] = await freeStablePorts(1);
  env = {
    FW_STATE_DIR: join(dir, 'state'), FW_WDA_HOME: join(dir, 'wda'), FW_USBMUXD_SOCKET: mux.socket,
    FW_IOREG: join(TESTS, 'fixtures', 'fake-ioreg.mjs'), FAKE_IOREG_FILE: join(dir, 'ioreg-mode'),
    FW_IWDP_PHONE: FAKE_IWDP, FAKE_PHONE_IWDP_DEVICES: join(dir, 'iwdp-devices.json'),
    FW_IPHONE_DEVICE_PORT: String(port), FW_IPHONE_PORT: String(port + 1),
  };
  io('iphone'); proxyList([]);
});
afterEach(async () => { killFixtures({ since: t0 }); await mux.close(); });

test('status: one line and a distinct exit code per state (unplugged 3, usb-lost 4, proxy-down 6, proxy-stale 5, ok 0, unknown 7); no ids', async () => {
  io('none'); mux.set([]);
  let r = await run('status');
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^USBLINK unplugged: no iPhone on the Mac's USB bus or on usbmux: plug the cable in \(phone unlocked\)\n$/);

  io('iphone'); // the 2026-10-06/07 drops: IOUSB lists the iPhone, usbmux none
  r = await run('status');
  assert.equal(r.code, 4, r.out);
  assert.match(r.stdout, /^USBLINK usb-lost: the Mac's USB bus still has the iPhone, but usbmux does not list it: the phone tools can't reach it; re-plug the iPhone's cable \(phone unlocked\)\n$/);

  mux.set([{ id: 132, udid: UDID, raw: true }]);
  r = await run('status');
  assert.equal(r.code, 6, r.out);
  assert.match(r.stdout, new RegExp(`^USBLINK proxy-down: usbmux has the iPhone \\(attach #132\\), but nothing answers on :${port} \\(ECONNREFUSED\\)`));

  r = await run('proxy', 'start', '--by', 'lead', '--reason', 'test');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^PROXY START OK: started \\(pid \\d+\\), :${port} answers\\n$`));
  const t = Date.now();
  r = await run('status', '--stale-after', '1'); // I-235: usbmux back, the proxy lists nothing
  assert.equal(r.code, 5, r.out);
  assert.ok(Date.now() - t >= 1000, 'status waits the grace out before it says proxy-stale');
  assert.match(r.stdout, new RegExp(`^USBLINK proxy-stale: usbmux has the iPhone \\(attach #132\\), but the proxy :${port} has listed no device for 1 s: restart it`));

  proxyList([PHONE]);
  r = await run('status');
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout, `USBLINK ok: the iPhone is on USB (usbmux attach #132) and the proxy :${port} lists 1 device\n`);
  r = await run('status', '--json');
  assert.equal(r.code, 0, r.out);
  const j = JSON.parse(r.stdout);
  assert.equal(j.state, 'ok');
  assert.deepEqual(j.iousb, { count: 1, config: 6, speed: 2 });
  assert.deepEqual(j.mux, { usb: 1, listed: true, attach: 132 });
  assert.deepEqual(j.proxy, { count: 1 });

  // a WDA config names another phone: this USB device is not it
  writeFileSync(join(dir, 'wda', 'config.json'), JSON.stringify({ udid: '00008130-0099999999999999' }));
  r = await run('status');
  assert.equal(r.code, 4, r.out);
  assert.match(r.stdout, /does not list it \(1 other USB device\)/);

  r = await nodeAsync(USBLINK, ['status'], { env: { ...env, FW_USBMUXD_SOCKET: 'off' } });
  assert.equal(r.code, 7, r.out);
  assert.match(r.stdout, /^USBLINK unknown: usbmuxd gave no device list/);
  for (const x of [await run('status'), await run('status', '--json')]) noIds(x.out, 'status');

  for (const a of [['status', '--stale-after', 'x'], ['bogus'], [], ['proxy'], ['proxy', 'start'], ['proxy', 'start', '--by', 'bad name'], ['watch', '--every', '0'], ['watch', '--repair']]) {
    const u = await run(...a);
    assert.equal(u.code, 2, `${a.join(' ')}: ${u.out}`);
    assert.equal(u.stdout, '', `${a.join(' ')}: no result line on a usage error`);
  }
  assert.equal((await run('--help')).code, 0);
});

test('proxy: start refuses a busy port; restart and stop never touch a proxy usblink did not start or a Simulator proxy; ours restarts', async () => {
  // a proxy started by hand (the lead's since 04:13Z): answers on the port, no pidfile
  mux.set([{ id: 132, udid: UDID }]);
  const hand = spawn(process.execPath, [FAKE_IWDP, '-c', `null:${port},:${port + 1}-${port + 101}`], { env: cleanEnv(env), stdio: 'ignore' });
  for (let i = 0; i < 50 && (await run('status', '--stale-after', '0')).code === 6; i++) await sleep(100);
  let r = await run('proxy', 'start', '--by', 'lead');
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, new RegExp(`^PROXY START REFUSED: something already answers on :${port}: a proxy usblink.mjs did not start`));
  for (const sub of ['restart', 'stop']) {
    r = await run('proxy', sub, '--by', 'lead');
    assert.equal(r.code, 1, `${sub}: ${r.out}`);
    assert.match(r.stdout, /REFUSED: no proxy started by usblink.mjs \(no pidfile\)/, sub);
  }
  r = await run('proxy', 'show');
  assert.equal(r.code, 1);
  assert.match(r.stdout, /^PROXY none: no proxy started by usblink.mjs/);
  assert.ok(alive(hand.pid), 'the hand-started proxy still runs');

  // a pidfile that names a Simulator proxy (-s unix:) with our -c argument: refused, nothing killed
  const [simPort] = await freeStablePorts(1);
  const cfg = `null:${simPort},:${simPort + 1}-${simPort + 101}`;
  const sim = spawn(process.execPath, [FAKE_IWDP, '-c', cfg, '-s', 'unix:/private/tmp/x/com.apple.webinspectord_sim.socket'], { env: cleanEnv(env), stdio: 'ignore' });
  await sleep(300);
  const lstart = Date.parse(spawnSync('ps', ['-o', 'lstart=', '-p', String(sim.pid)], { encoding: 'utf8' }).stdout.trim());
  mkdirSync(join(dir, 'state', 'usblink'), { recursive: true });
  writeFileSync(join(dir, 'state', 'usblink', 'proxy.json'), JSON.stringify({ pid: sim.pid, match: `-c ${cfg}`, procStart: lstart, ports: { list: simPort, tabs: simPort + 1, last: simPort + 101 } }));
  r = await run('proxy', 'restart', '--by', 'lead');
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, new RegExp(`^PROXY RESTART REFUSED: pid ${sim.pid} is a Simulator proxy \\(-s unix:\\): not restarted \\(nothing killed\\)`));
  assert.ok(alive(sim.pid), 'the Simulator proxy still runs');
  hand.kill('SIGKILL'); sim.kill('SIGKILL');
  for (let i = 0; i < 50 && (await run('status', '--stale-after', '0')).code !== 6; i++) await sleep(100);

  // ours: start, show, restart (a new pid), stop
  writeFileSync(join(dir, 'state', 'usblink', 'proxy.json'), 'null');
  r = await run('proxy', 'start', '--by', 'lead');
  assert.equal(r.code, 0, r.out);
  const p1 = JSON.parse(readFileSync(join(dir, 'state', 'usblink', 'proxy.json'), 'utf8'));
  assert.equal(p1.match, `-c null:${port},:${port + 1}-${port + 101}`);
  assert.equal(p1.by, 'lead');
  assert.ok(Number.isFinite(p1.procStart));
  r = await run('proxy', 'show');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^PROXY ours: pid ${p1.pid}, started by lead`));
  r = await run('proxy', 'restart', '--by', 'lead', '--reason', 'stale');
  assert.equal(r.code, 0, r.out);
  const p2 = JSON.parse(readFileSync(join(dir, 'state', 'usblink', 'proxy.json'), 'utf8'));
  assert.notEqual(p2.pid, p1.pid);
  assert.equal(r.stdout, `PROXY RESTART OK: restarted the proxy (pid ${p1.pid} -> ${p2.pid})\n`);
  assert.ok(!alive(p1.pid), 'the old proxy is gone');
  r = await run('proxy', 'stop', '--by', 'lead');
  assert.equal(r.code, 0, r.out);
  assert.ok(!alive(p2.pid));
  assert.ok(!existsSync(join(dir, 'state', 'usblink', 'proxy.json')));
  assert.deepEqual(audit().map((a) => a.event), ['proxy-start-refused', 'proxy-restart-refused', 'proxy-stop-refused', 'proxy-restart-refused', 'proxy-start', 'proxy-restart-stop', 'proxy-start', 'proxy-restart', 'proxy-stop']);
  noIds(JSON.stringify(audit()), 'audit');
  if (existsSync(join(dir, 'state', 'usblink', 'proxy.log'))) assert.equal((spawnSync('stat', ['-f', '%Lp', join(dir, 'state', 'usblink', 'proxy.log')], { encoding: 'utf8' }).stdout || '').trim(), '600', 'the proxy log names the phone: owner-only');
});

test('watch --repair: a stale proxy we started is restarted once (I-235), a state change per line, audit with the drop numbers; one watch at a time', async () => {
  mux.set([{ id: 132, udid: UDID }]);
  assert.equal((await run('proxy', 'start', '--by', 'lead')).code, 0);
  const p1 = JSON.parse(readFileSync(join(dir, 'state', 'usblink', 'proxy.json'), 'utf8')).pid;
  const w = nodeAsync(USBLINK, ['watch', '--every', '1', '--stale-after', '1', '--repair', '--by', 'lead', '--seconds', '6'], { env, timeout: 30000 });
  await sleep(1500);
  const second = await run('watch', '--seconds', '1');
  assert.equal(second.code, 2, second.out);
  assert.match(second.stderr, /another usblink watch runs \(pid \d+/);
  // the restarted proxy lists the phone: the link is ok again
  for (let i = 0; i < 80; i++) { const rec = JSON.parse(readFileSync(join(dir, 'state', 'usblink', 'proxy.json'), 'utf8') || 'null'); if (rec && rec.pid !== p1) break; await sleep(100); }
  proxyList([PHONE]);
  const r = await w;
  assert.equal(r.code, 0, r.out);
  const lines = r.stdout.trim().split('\n').map((l) => l.replace(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ /, ''));
  assert.match(lines[0], /^WATCH usblink every 1 s \(proxy-stale after 1 s\); repair: restart our proxy as lead$/);
  assert.match(lines[1], /^USBLINK attaching: /);
  assert.match(lines[2], /^USBLINK proxy-stale: /);
  assert.match(lines[3], new RegExp(`^REPAIR restarted the proxy \\(pid ${p1} -> \\d+\\) \\(try 1 of 3\\)$`));
  assert.ok(lines.includes(`USBLINK ok: the iPhone is on USB (usbmux attach #132) and the proxy :${port} lists 1 device`), r.stdout);
  assert.equal(lines.at(-1), 'STOPPED');
  assert.equal(lines.filter((l) => l.startsWith('REPAIR')).length, 1, 'one restart');
  const ev = audit();
  const states = ev.filter((a) => a.event === 'state');
  assert.deepEqual(states.slice(0, 2).map((a) => [a.from, a.to]), [[null, 'attaching'], ['attaching', 'proxy-stale']]);
  assert.equal(states.at(-1).to, 'ok');
  assert.deepEqual(states[0].iousb, { count: 1, config: 6, speed: 2 });
  assert.deepEqual(states[0].mux, { usb: 1, listed: true, attach: 132 });
  assert.ok(ev.some((a) => a.event === 'proxy-restart' && a.by === 'lead' && a.from === p1));
  const st = JSON.parse(readFileSync(join(dir, 'state', 'usblink', 'state.json'), 'utf8'));
  assert.equal(st.watch, false);
  assert.equal(st.state, 'ok');
  noIds(r.out + JSON.stringify(ev) + JSON.stringify(st), 'watch');
});

test('watch --repair: a stale proxy usblink did not start is never restarted: one REPAIR SKIPPED line', async () => {
  mux.set([{ id: 132, udid: UDID }]);
  const hand = spawn(process.execPath, [FAKE_IWDP, '-c', `null:${port},:${port + 1}-${port + 101}`], { env: cleanEnv(env), stdio: 'ignore' });
  await sleep(400);
  const r = await nodeAsync(USBLINK, ['watch', '--every', '1', '--stale-after', '1', '--repair', '--by', 'lead', '--seconds', '4'], { env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  assert.equal((r.stdout.match(/REPAIR SKIPPED: no proxy started by usblink.mjs \(no pidfile\); restart the proxy by hand/g) || []).length, 1, r.stdout);
  assert.doesNotMatch(r.stdout, /REPAIR restarted/);
  assert.ok(alive(hand.pid), 'never killed');
  hand.kill('SIGKILL');
});

test('watch --post-step: usb-lost past --step-after posts ONE re-plug action step, cancelled by itself when the link is ok', async () => {
  mux.set([]); // usb-lost: IOUSB has the iPhone
  const w = nodeAsync(USBLINK, ['watch', '--every', '1', '--post-step', '--step-after', '1', '--by', 'lead', '--seconds', '12'], { env, timeout: 40000 });
  const stateOf = () => { try { return JSON.parse(readFileSync(join(dir, 'state', 'usblink', 'state.json'), 'utf8')); } catch { return null; } };
  let step = null;
  for (let i = 0; i < 100 && !step; i++) { step = stateOf()?.step ?? null; if (!step) await sleep(100); }
  assert.match(String(step), /^C-\d+$/, 'a step was posted');
  await sleep(2200); // two more passes: no second step
  // the user re-plugs: usbmux and the proxy see the phone
  mux.set([{ id: 133, udid: UDID }]);
  proxyList([PHONE]);
  assert.equal((await run('proxy', 'start', '--by', 'lead')).code, 0);
  const r = await w;
  assert.equal(r.code, 0, r.out);
  assert.equal((r.stdout.match(/POSTED C-\d+: Re-plug the iPhone's USB cable \(usb-lost\)/g) || []).length, 1, r.stdout);
  assert.match(r.stdout, new RegExp(`CLOSED ${step}: the USB link is back`));
  const s = JSON.parse(readFileSync(join(dir, 'state', 'console', `${step}.json`), 'utf8'));
  assert.equal(s.kind, 'action');
  assert.equal(s.by, 'lead');
  assert.equal(s.title, "Re-plug the iPhone's USB cable");
  assert.equal(s.status, 'cancelled');
  assert.equal(stateOf().step, null);
  noIds(r.out + JSON.stringify(s), 'post-step');
});
