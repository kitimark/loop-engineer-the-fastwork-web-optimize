// tools/sim.mjs: the tools inside a session (scroll, run, wda, open, I-052 fetched, safari-restart, gesture, I-050), end
// to end on the fakes of tests/e2e/sim-fixture.mjs (no Simulator is ever booted, no phone touched). The session itself:
// tests/e2e/sim.test.mjs (split from it so the two run in parallel, user T-105 #2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { node, nodeAsync } from '../helpers.mjs';
import { deviceOf } from '../../tools/lib/stats.mjs';
import { SIM, LOCK, dir, env, lines, device, simDir, setup, inHold, noIds, cleanedUp } from './sim-fixture.mjs';

test('scroll inside a session: iphone.mjs scroll\'s probe on the tabs port -> out JSON with meta.device "simulator" and meta.sim; outside a session: refused', async () => {
  const udid = setup();
  let r = node(SIM, ['scroll', '--label', 'x'], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no live Simulator session/);
  const out = join(dir, 'scroll.json');
  r = await inHold([process.execPath, SIM, 'scroll', '--label', 'fp2', '--out', out], { timeout: 110000, e: { ...env, FAKE_IWDP_TAB_ARGS: '--doc-height=1500' } });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  noIds(JSON.stringify(j), udid);
  assert.equal(j.meta.device, 'simulator');
  assert.equal(deviceOf(j), 'simulator', 'stats keeps it apart from phone and Chrome runs');
  assert.deepEqual([j.meta.owner, j.meta.label], ['me', 'fp2']);
  assert.deepEqual(j.meta.settings, { lowPowerMode: 'n/a', batteryPct: 'n/a', charging: 'n/a' });
  const s = j.meta.sim;
  assert.deepEqual([s.runtime, s.runtimeBuild, s.deviceType, s.xcode, s.window], ['iOS 26.5', '23F77', 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro-Max', '26.6 (17F113)', 'hidden']);
  assert.deepEqual(s.proxyPorts, { list: Number(env.FW_SIM_DEVICE_PORT), tabs: Number(env.FW_SIM_PORT), wda: Number(env.FW_SIM_WDA_PORT) });
  assert.ok(s.hostLoad.start && s.hostLoad.end, 'host load sampled at start and end');
  assert.ok('tipDismissed' in s);
  assert.deepEqual(Object.keys(j.summary), ['idle', 'scroll', 'bottom']);
  assert.ok(j.frames.length > 10 && j.finalY >= j.maxY - 5, `scrolled to the bottom (${j.finalY} of ${j.maxY})`);
  cleanedUp();
});

test('run inside a session: iphone.mjs run\'s std probe with the Simulator target (no lease, no battery, meta.device "simulator", meta.sim, Simulator tool files)', async () => {
  const udid = setup();
  const out = join(dir, 'run.json');
  const r = await inHold([process.execPath, SIM, 'run', '--driver', 'scroll', '--probe', 'std', '--label', 'srun', '--settle', '0', '--idle', '0.2', '--bottom', '0.2', '--out', out], { timeout: 110000, e: { ...env, FAKE_IWDP_TAB_ARGS: '--doc-height=1500', FW_IDEVICEDIAGNOSTICS: join(dir, 'never-called') } });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  noIds(JSON.stringify(j), udid);
  assert.deepEqual([j.meta.schema, j.meta.driverName, j.meta.device, j.meta.owner, j.meta.label, j.meta.battery], ['fw-iphone-run/1', 'scroll', 'simulator', 'me', 'srun', null]);
  assert.equal(deviceOf(j), 'simulator', 'stats keeps it apart from phone and Chrome runs');
  assert.deepEqual(j.meta.settings, { lowPowerMode: 'n/a', batteryPct: 'n/a', charging: 'n/a' });
  assert.equal(j.meta.sim.window, 'hidden');
  assert.ok(j.meta.sim.hostLoad.start && j.meta.sim.hostLoad.end);
  assert.ok(Object.keys(j.meta.tool.files).includes('tools/lib/sim.mjs') && Object.keys(j.meta.tool.files).includes('tools/lib/iphone-run.mjs'));
  assert.ok(j.frames.length > 5);
  assert.match(r.stdout, /^srun \[S\]: /m);
  cleanedUp();
});

test('wda: build refused outside a normal hold; inside one: unsigned Simulator build in DerivedData-sim; start inside a session on the sim WDA port, stopped by the session', async () => {
  const udid = setup();
  const home = join(dir, 'wda');
  mkdirSync(join(home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), { recursive: true });
  const e = { ...env, FW_WDA_HOME: home, FAKE_XCODEBUILD_LOG: join(dir, 'xcb.jsonl') };
  let r = node(SIM, ['wda', 'build', '--owner', 'me'], { env: e });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /refusing sim wda build: chrome-measure is free/);
  r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--short', '--max-seconds', '60', '--', process.execPath, SIM, 'wda', 'build', '--owner', 'me'], { env: e });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /short-lane job/);
  r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--', process.execPath, SIM, 'wda', 'build', '--owner', 'me'], { env: e });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /WDA_SIM_BUILT \S+\.xctestrun/);
  noIds(r.out, udid);
  const [b] = lines(e.FAKE_XCODEBUILD_LOG);
  assert.deepEqual(b, ['-project', join(home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), '-scheme', 'WebDriverAgentRunner', '-destination', `platform=iOS Simulator,id=${udid}`, '-derivedDataPath', join(home, 'DerivedData-sim'), 'CODE_SIGNING_ALLOWED=NO', 'build-for-testing']);
  assert.ok(!existsSync(join(home, 'DerivedData')), 'the phone\'s DerivedData is untouched');
  r = node(SIM, ['wda', 'start'], { env: e });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no live Simulator session/);
  // review-sim R1: the running WDA-sim's pidfile must match only the Simulator's DerivedData-sim, never a generic
  // `test-without-building` (the phone's WDA runner has that too: a stop/cleanup would kill it)
  const pidfile = join(simDir(), 'wda.pid.json');
  r = await inHold(['sh', '-c', `"${process.execPath}" "${SIM}" wda start && "${process.execPath}" -e "fetch('http://127.0.0.1:${env.FW_SIM_WDA_PORT}/status').then((x) => x.text()).then(console.log)" && "${process.execPath}" -e "console.log('PIDMATCH=' + JSON.parse(require('fs').readFileSync('${pidfile}', 'utf8')).match)"`], { e });
  assert.equal(r.code, 0, r.out);
  assert.equal((r.stdout.match(/^PIDMATCH=(.*)$/m) || [])[1], join(home, 'DerivedData-sim'), r.out);
  assert.match(r.stdout, new RegExp(`WDA_SIM_READY http://127\\.0\\.0\\.1:${env.FW_SIM_WDA_PORT}`));
  assert.match(r.stdout, /"ready":true/);
  assert.match(r.stdout, /cleanup: stopped wda/);
  noIds(r.out, udid);
  const run = lines(e.FAKE_XCODEBUILD_LOG)[1];
  assert.deepEqual([run[0], run[3], run[4]], ['test-without-building', '-destination', `platform=iOS Simulator,id=${udid}`]);
  assert.ok(!existsSync(join(simDir(), 'wda.pid.json')));
  assert.equal(await fetch(`http://127.0.0.1:${env.FW_SIM_WDA_PORT}/status`).then(() => 'up', () => 'down'), 'down');
  cleanedUp();
});

test('open inside a session: simctl openurl (never the proxy), waits for the tab, screenshot (--out)', async () => {
  setup();
  const shot = join(dir, 'shots', 'open.png');
  const wip = join(dir, 'wip.jsonl');
  const r = await inHold(['sh', '-c', `"${process.execPath}" "${SIM}" open "http://127.0.0.1:${env.FW_SIM_PORT}/" --out "${shot}"`], { e: { ...env, FAKE_WIP_LOG: wip } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /Safari \(Simulator\) now on http:\/\/127\.0\.0\.1:\d+\/; screenshot .*shots\/open\.png/);
  assert.equal(readFileSync(shot).subarray(0, 4).toString('hex'), '89504e47', 'the screenshot is written where --out says');
  const evals = lines(wip).filter((x) => x.evaluate).map((x) => x.evaluate);
  assert.ok(evals.length > 0, 'the tab was read over the proxy');
  assert.ok(!evals.some((x) => /location\s*\.\s*(href\s*=(?!=)|assign|replace)|location\s*=(?!=)|reload\(/.test(x)), `no navigation over the proxy: ${JSON.stringify(evals)}`);
  const calls = lines(env.FAKE_SIMCTL_LOG).filter((a) => a[0] === 'openurl');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], `http://127.0.0.1:${env.FW_SIM_PORT}/`);
  cleanedUp();
});

test('I-052 fetched: after open, the page\'s Resource Timing says network (transferSize > 0) or cache, the server log\'s GETs back it; exit 0 / 3 / 1; outside a session: refused', async () => {
  const udid = setup();
  const url = `http://127.0.0.1:${env.FW_SIM_PORT}/`;
  const res = join(dir, 'resources.json'), slog = join(dir, 'server.log'), wip = join(dir, 'wip.jsonl');
  const entry = (transferSize) => [{ name: `${url}_app/immutable/assets/x.css`, transferSize, encodedBodySize: 43, decodedBodySize: 43 }, { name: `${url}favicon.ico`, transferSize: 300, encodedBodySize: 0, decodedBodySize: 0 }];
  writeFileSync(res, JSON.stringify(entry(343)));
  writeFileSync(slog, '200 GET /?n=1 0.2ms\n200 GET /_app/immutable/assets/x.css 1.1ms\n');
  const e = { ...env, FAKE_WIP_LOG: wip, FAKE_IWDP_TAB: 'webkit', FAKE_IWDP_TAB_ARGS: `--url=${url} --resources=${res}` };
  let r = node(SIM, ['fetched', 'x.css'], { env: e });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no live Simulator session/);
  const run = (tail) => inHold(['sh', '-c', `"${process.execPath}" "${SIM}" open "${url}" --out "${join(dir, 'o.png')}" && ${tail}`], { timeout: 110000, e });
  r = await run(`"${process.execPath}" "${SIM}" fetched x.css --log "${slog}"`);
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  assert.match(r.stdout, /^network\s+http:\/\/127\.0\.0\.1:\d+\/_app\/immutable\/assets\/x\.css \(transferSize 343, body 43 B\)$/m);
  assert.match(r.stdout, /^server log: 1 GET for x\.css$/m);
  assert.match(r.stdout, /^FETCHED network: x\.css$/m);
  writeFileSync(res, JSON.stringify(entry(0)));
  r = await run(`"${process.execPath}" "${SIM}" fetched x.css; echo "CACHE $?"; "${process.execPath}" "${SIM}" fetched nope.css; echo "NONE $?"`);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^cache\s+http:\/\/127\.0\.0\.1:\d+\/_app\/immutable\/assets\/x\.css /m);
  assert.match(r.stdout, /^FETCHED NOT-NETWORK: x\.css\nCACHE 3$/m);
  assert.match(r.stdout, /^FETCHED none: nope\.css\nNONE 1$/m);
  assert.deepEqual(lines(wip).filter((x) => x.navigate), [], 'fetched only reads: no navigation over the proxy');
  cleanedUp();
});

test('safari-restart inside a session: WDA-sim down, so simctl terminate + launch on the configured Simulator, then the tab answers; outside a session: refused', async () => {
  const udid = setup();
  let r = node(SIM, ['safari-restart'], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no live Simulator session/);
  r = await inHold([process.execPath, SIM, 'safari-restart', '--timeout', '20'], { timeout: 110000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^restarting Safari via simctl$/m);
  assert.match(r.stdout, /^SAFARI_RESTARTED via simctl in \d+ ms: /m);
  noIds(r.out, udid);
  const calls = lines(env.FAKE_SIMCTL_LOG);
  const t = calls.findLastIndex((a) => a[0] === 'terminate'); // the last one: the session's boot terminates Safari too, before it clears the cache (I-052)
  assert.ok(t >= 0, 'simctl terminate was called');
  assert.deepEqual(calls.slice(t, t + 2), [['terminate', udid, 'com.apple.mobilesafari'], ['launch', udid, 'com.apple.mobilesafari']]);
  cleanedUp();
});

test('gesture inside a session: strokes to WDA-sim, the page over the session proxy, an out/sim record with meta.device "simulator"; outside a session: refused; --dry-run needs none', async () => {
  const udid = setup();
  const f = join(dir, 'script.json');
  const S = (o) => ({ type: 'stroke', dir: 'up', px: 450, ms: 900, profile: 'minjerk', ...o });
  writeFileSync(f, JSON.stringify({ name: 'sim-e2e', version: 1, screen: [430, 932], steps: [{ type: 'mark', name: 'go' }, S({}), { type: 'pause', ms: 300 }, S({ px: 300, ms: 300, profile: 'still', holdMs: 200 })] }));
  let r = node(SIM, ['gesture', f, '--dry-run'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^GESTURE_HASH [0-9a-f]{64}$/m);
  r = node(SIM, ['gesture', f], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no live Simulator session/);
  const out = join(dir, 'gesture.json'), wdaLog = join(dir, 'wda.jsonl');
  const e = { ...env, FAKE_IWDP_TAB: 'webkit', FAKE_IWDP_TAB_ARGS: `--wda-port=${env.FW_SIM_WDA_PORT} --url=http://127.0.0.1:1/ --doc-height=2800`, FAKE_WDA_LOG: wdaLog };
  r = await inHold([process.execPath, SIM, 'gesture', f, '--label', 'sg', '--out', out], { timeout: 110000, e });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  noIds(JSON.stringify(j), udid);
  assert.deepEqual([j.meta.kind, j.meta.device, j.meta.owner, j.meta.label], ['gesture', 'simulator', 'me', 'sg']);
  assert.equal(deviceOf(j), 'simulator', 'stats keeps it apart from phone and Chrome runs');
  assert.ok(j.meta.sim.hostLoad.start && j.meta.sim.hostLoad.end);
  assert.ok(Object.keys(j.meta.tool.files).includes('tools/lib/sim.mjs') && Object.keys(j.meta.tool.files).includes('tools/lib/gesture-run.mjs'));
  assert.equal(typeof j.meta.wda.settings.echoed, 'number', 'the /appium/settings echo is recorded');
  assert.equal(j.run.aborted, null);
  assert.deepEqual(j.run.errors, []);
  assert.equal(j.run.strokes.length, 2);
  const acts = lines(wdaLog).filter((c) => /\/actions$/.test(c.path));
  assert.equal(acts.length, 2, 'both strokes went to WDA-sim (the fake on the session\'s WDA port)');
  assert.ok(j.run.segments[0].touches.length > 0, 'the page saw the touches');
  cleanedUp();
});

test('I-050: Safari restored an earlier session\'s tab (a dead server, never answers): gesture alone refuses (AMBIGUOUS, I-037); after open in the same session it picks only the open\'s host and never touches the stale tab; the next session refuses again', async () => {
  const udid = setup();
  const f = join(dir, 'script.json');
  writeFileSync(f, JSON.stringify({ name: 'sim-e2e', version: 1, screen: [430, 932], steps: [{ type: 'stroke', dir: 'up', px: 300, ms: 500, profile: 'minjerk' }] }));
  const url = `http://127.0.0.1:${env.FW_SIM_PORT}/`;
  const wip = join(dir, 'wip.jsonl');
  const e = { ...env, FAKE_WIP_LOG: wip, FAKE_IWDP_TAB: 'webkit', FAKE_IWDP_TAB_ARGS: `--wda-port=${env.FW_SIM_WDA_PORT} --url=${url} --doc-height=2800 --stale-tab=http://localhost:63765/` };
  const gestureAlone = () => inHold([process.execPath, SIM, 'gesture', f, '--label', 'stale', '--out', join(dir, 'g0.json')], { timeout: 110000, e });
  let r = await gestureAlone();
  assert.match(r.out, /AMBIGUOUS: 2 tabs match any page: http:\/\/localhost:63765\/ \[PID:4242\], http:\/\/127\.0\.0\.1:\d+\/ \[PID:4242\]/, 'two Safari pages and no open: never picks one (I-037)');
  const out = join(dir, 'g1.json'), shot = join(dir, 'shots', 'open.png');
  r = await inHold(['sh', '-c', `"${process.execPath}" "${SIM}" open "${url}" --out "${shot}" && "${process.execPath}" "${SIM}" gesture "${f}" --label sg --out "${out}"`], { timeout: 110000, e });
  assert.equal(r.code, 0, r.out);
  noIds(r.out, udid);
  assert.match(r.stdout, /Safari \(Simulator\) now on http:\/\/127\.0\.0\.1:\d+\/; screenshot /);
  assert.match(r.stdout, /^Safari also lists 1 page of another server \(restored from an earlier session\?\): this session's scroll \/ record \/ run \/ gesture pick only tabs on 127\.0\.0\.1:\d+ \(I-050\)$/m);
  assert.ok(!lines(wip).some((x) => x.staleConnected), 'nothing ever connects to the restored tab (it would never answer)');
  assert.deepEqual(lines(wip).filter((x) => x.navigate), [], 'no navigation over the proxy');
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(j.run.aborted, null);
  assert.equal(j.run.strokes.length, 1);
  cleanedUp();
  r = await gestureAlone();
  assert.match(r.out, /AMBIGUOUS: 2 tabs match any page/, 'the record of an earlier session\'s open does not scope this one');
  cleanedUp();
});
