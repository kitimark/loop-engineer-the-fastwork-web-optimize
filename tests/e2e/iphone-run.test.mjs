// `node tools/iphone.mjs run` (protocol v2 T1a) end to end against tests/fixtures/fake-run-proxy.mjs: a fake
// ios_webkit_debug_proxy whose Safari tab is the fake page of tests/fixtures/fake-run-dom.mjs (the y~1960 frame of
// F-044, a cv crossing at 1250, optionally window.__fwMorphDrive). FW_STATE_DIR is a temp lock dir and
// FW_IPHONE_PORT the fake's port and FW_IDEVICEDIAGNOSTICS tests/fixtures/fake-idevicediagnostics.mjs, so the real
// phone, its proxy, libimobiledevice and the real iphone lease are never touched.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, freePort, startProc, TESTS } from '../helpers.mjs';
import { APP_JS } from '../fixtures/fake-run-dom.mjs';

const IPHONE = tool('iphone.mjs'), LOCK = tool('lock.mjs');
const procs = [];
after(async () => { await Promise.all(procs.map((p) => p.stop())); });
let env, dir;
const FAKE_IDD = join(TESTS, 'fixtures', 'fake-idevicediagnostics.mjs');
beforeEach(async () => {
  dir = tempDir('fw-iphone-run-');
  env = { FW_STATE_DIR: join(dir, 'state'), FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()), FW_IDEVICEDIAGNOSTICS: FAKE_IDD, FAKE_IDD_LOG: join(dir, 'idd.jsonl') };
});
const iddCalls = () => (existsSync(env.FAKE_IDD_LOG) ? readFileSync(env.FAKE_IDD_LOG, 'utf8').trim().split('\n').length : 0);
const lock = (...a) => node(LOCK, a, { env });
const run = (args, e = env) => nodeAsync(IPHONE, ['run', ...args], { env: e, timeout: 90000 });

async function fakePhone(args = []) {
  const log = join(tempDir('fw-wip-run-'), 'wip.jsonl');
  const p = await startProc(process.execPath, [join(TESTS, 'fixtures', 'fake-run-proxy.mjs'), ...args],
    { env: { FAKE_WIP_LOG: log }, ready: (s) => s.match(/^FAKE_WIP_PORT=(\d+)$/m) });
  procs.push(p);
  const port = p.stdout().match(/^FAKE_WIP_PORT=(\d+)$/m)[1];
  const events = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { env: { ...env, FW_IPHONE_PORT: port }, events, stop: () => p.stop() };
}
const SHORT = ['--settle', '0', '--idle', '0.2'];

test('run: --help prints the usage without a lease; a bad driver or a missing lease is refused before Safari is touched', async () => {
  let r = await nodeAsync(IPHONE, ['dance'], { env });
  assert.match(r.stdout, /^usage: node tools\/iphone\.mjs status .*\| run --driver scroll\|window\|morph --probe std --owner <topic> \(run --help\)$/m, 'the top-level usage names run');
  r = await run(['--help']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^usage: node tools\/iphone\.mjs run --driver scroll\|window\|morph --probe std --owner <topic>/);
  r = await run(['--driver', 'fling', '--owner', 'me']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--driver must be one of scroll, window, morph \(got fling\)/);
  r = await run(['--driver', 'window', '--owner', 'me']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /needs --to/);
  r = await run(['--driver', 'scroll', '--owner', 'me']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /you \("me"\) don't hold the iphone lease/);
  lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'someone-else');
  r = await run(['--driver', 'scroll', '--owner', 'me']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /\(holder: "someone-else"\)/);
});

test('run --driver window: reload, settle, probe + driver, one JSON with meta, uncapped counts at y~1960, crossings, served hashes; lease renewed; <= 1 Hz polling', async () => {
  const phone = await fakePhone();
  assert.equal(node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me', '--ttl', '120'], { env: phone.env }).code, 0);
  const state = join(dir, 'state.js');
  writeFileSync(state, `({ imgs: document.querySelectorAll('img').length });\n`);
  const out = join(dir, 'w.json');
  const r = await run(['--driver', 'window', '--probe', 'std', '--owner', 'me', '--label', 'ewin', '--from', '1500', '--to', '2000', '--settle', '0.3', '--idle', '0.2', '--hold', '0.2', '--sentinel', '0.2',
    '--build', 'B1', '--block', 'k1', '--arm', 'C', '--pos', '0', '--warmup', '--tops', 'platform=#platform', '--state', state, '--out', out], phone.env);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ewin \[W\]: idle \d+fr .*\| scroll \d+fr [\d.]+ fps >50 [1-9]\d* >34 [1-9]\d* \(\+-4: >46 \d+ >54 \d+ >30 \d+ >38 \d+, near34 \d+ near50 \d+\) max .*\| hold \d+fr .*\| sentinel \d+fr/m, 'phone counts in ms, no k forms');
  assert.doesNotMatch(r.stdout, /k>=|ticks/);
  assert.match(r.stdout, /^ {2}\d+(\.\d)? ms @y\d+->\d+ scroll rafJs \d+(\.\d+)? mut \{"src":21,/m, 'the slow frame line: all 21 src writes');
  assert.match(r.stdout, /inert div\.start-selling-morph-panel removed/);
  assert.match(r.stdout, new RegExp(`^saved ${out.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`, 'm'));

  const j = JSON.parse(readFileSync(out, 'utf8'));
  const m = j.meta;
  assert.deepEqual([m.schema, m.kind, m.driver, m.driverName, m.probe, m.label, m.build, m.run, m.block, m.arm, m.pos, m.warmup, m.owner, m.error],
    ['fw-iphone-run/1', 'run', 'W', 'window', 'std', 'ewin', 'B1', 'ewin', 'k1', 'C', 0, true, 'me', null]);
  assert.match(m.href, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal(m.ua, 'FakeSafari/1.0 (fake-run-dom)');
  assert.ok(m.wallStartMs > Date.now() - 60000 && m.wallStartMs <= Date.now(), 'Mac wall clock at the start (U7)');
  assert.ok(m.clock.wallMs > 0 && m.clock.perfMs >= 0);
  assert.equal(m.settings.lowPowerMode, 'unknown');
  assert.equal(m.settings.reducedMotion, false);
  assert.deepEqual(m.params, { settleMs: 300, tops: [['platform', '#platform']], ySource: 'raf', from: 1500, to: 2000, settleAtMs: 1000, idleMs: 200, holdMs: 200, sentinelMs: 200, maxScrollMs: 45000 });
  assert.deepEqual(m.served, { '/_app/immutable/app.js': createHash('sha256').update(APP_JS).digest('hex').slice(0, 16) }, 'served hash of each same-origin script');
  for (const f of ['tools/iphone.mjs', 'tools/lib/iphone-run.mjs', 'tools/lib/iphone-probe.mjs', 'tools/lib/wip.mjs']) assert.match(m.tool.files[f], /^[0-9a-f]{16}$/);
  assert.match(m.tool.probe, /^[0-9a-f]{16}$/);
  assert.match(m.tool.driver, /^[0-9a-f]{16}$/);
  assert.match(m.tool.gitHead, /^[0-9a-f]{40}$/);
  assert.deepEqual(j.tops, { platform: 2860 });
  assert.deepEqual(j.stateAtStart, { panel: true, panelInert: true, panelImg: 21, panelImgSrc: 0, custom: { imgs: 21 } });
  assert.ok(j.early.frames.length > 10, 'load frames from the reconnect through the settle');
  assert.deepEqual(j.fields, ['t', 'dt', 'yStart', 'yEnd', 'innerHeight', 'm', 'rafJsMs', 'probeMs', 'docH']);
  const ev = j.crossings.filter((c) => c.kind === 'inert');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].src, 'effect');
  assert.ok(j.frames[ev[0].frame][3] >= 1960 && ev[0].y > 1500 && ev[0].y <= j.frames[ev[0].frame][3], `inert flip in the frame that reached y 1960 (crossing y ${ev[0].y}, the last rAF y)`);
  const row = j.mutations.counts.find((c) => c[0] === ev[0].frame);
  assert.equal(row[1 + j.mutations.types.indexOf('src')], 21);
  assert.ok(j.crossings.some((c) => c.kind === 'scene' && c.value === 'active' && c.frame === ev[0].frame));
  assert.ok(j.crossings.some((c) => c.kind === 'cv' && c.id === 'section.commission'));
  assert.equal(j.driverResult.finalY, 2085);
  assert.equal(m.ySource, 'raf');
  assert.equal(m.probeVersion, 3);
  assert.match(m.yReads, /^probe rAF scrollY/);
  assert.equal(m.yReadCounts.raf, j.frames.length);
  assert.equal(m.yReadCounts.crossing, 0);
  assert.ok(j.crossings.filter((c) => c.frame !== null).every((c) => c.stale === true && Array.isArray(c.yFrame) && (c.yRow === null ? c.frame <= 1 : c.y === j.frames[c.yRow][3])), 'raf crossings: stale, frame interval and y row (none before the probe\'s first row)');
  assert.ok(j.frames.slice(1).every((f) => f[8] === 2900), 'docH per frame');
  assert.deepEqual(m.battery.start, { t: m.battery.start.t, Temperature: 3050, IsCharging: false, ExternalConnected: true, CurrentCapacity: 80, temperatureC: 30.5 });
  assert.equal(m.battery.end.CurrentCapacity, 79, 'a second battery read after the run');
  assert.equal(iddCalls(), 2);
  assert.ok(!readFileSync(out, 'utf8').includes('FAKESERIAL'), 'no battery serial in the run JSON');
  assert.deepEqual([m.settings.batteryPct, m.settings.charging, m.settings.lowPowerMode], [80, false, 'unknown']);
  assert.deepEqual(j.post.resources.map((x) => [new URL(x[0]).pathname, x[1]]), [['/_app/immutable/app.js', 'script']], 'Resource Timing dump after the run');
  assert.equal(j.early.fontsStatus, 'loaded');

  const ev2 = phone.events();
  assert.equal(ev2.filter((e) => e.reload).length, 1, 'one reload per run');
  const polls = ev2.filter((e) => e.evaluate === 'window.__fwrState || null').map((e) => e.t);
  assert.ok(polls.length >= 1);
  for (let i = 1; i < polls.length; i++) assert.ok(polls[i] - polls[i - 1] >= 1400, `state polls ${polls[i] - polls[i - 1]} ms apart (<= ~1 Hz, protocol §5.5)`);
  const st = JSON.parse(node(LOCK, ['status', 'iphone', '--json'], { env: phone.env }).stdout)[0];
  assert.equal(st.holder.owner, 'me');
  assert.ok(Date.parse(st.holder.expiresAt) - Date.now() > 800 * 1000, `the 120 s lease was renewed to cover the run (${st.holder.expiresAt})`);
});

test('run --driver scroll and --driver morph: phases to the bottom; morph tweens and the build\'s summaries', async () => {
  const phone = await fakePhone(['--doc-height=1500', '--morph']);
  assert.equal(node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me'], { env: phone.env }).code, 0);
  let out = join(dir, 's.json');
  let r = await run(['--driver', 'scroll', '--owner', 'me', ...SHORT, '--bottom', '0.2', '--y-source', 'scroll', '--no-battery', '--no-park', '--out', out], phone.env); // --no-park: the morph run below reuses the page (I-047)
  assert.equal(r.code, 0, r.out);
  let j = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(j.meta.driver, 'S');
  assert.deepEqual([j.meta.ySource, j.meta.params.ySource, j.meta.battery], ['scroll', 'scroll', null]);
  assert.equal(iddCalls(), 0, '--no-battery: no idevicediagnostics call');
  assert.equal(j.frames.at(-1)[3], 685, 'scroll-listener y');
  assert.equal(j.meta.label, 'run');
  assert.deepEqual(Object.keys(j.marks), ['idle', 'scroll', 'bottom']);
  assert.deepEqual(j.driverResult, { maxY: 685, finalY: 685 });
  // I-091: the owner renews to a longer lease on purpose; the next run's own renew must not shorten it to now + 900 s
  assert.equal(node(LOCK, ['renew', 'iphone', '--owner', 'me', '--ttl', '3000'], { env: phone.env }).code, 0);
  const longLease = Date.parse(JSON.parse(node(LOCK, ['status', 'iphone', '--json'], { env: phone.env }).stdout)[0].holder.expiresAt);
  out = join(dir, 'm.json');
  r = await run(['--driver', 'morph', '--owner', 'me', '--settle', '0', '--hold', '150', '--cycles', '2', '--label', 'morph', '--y-source', 'raf-legacy', '--out', out], { ...phone.env, FW_IDEVICEDIAGNOSTICS: join(dir, 'no-such-idevicediagnostics') });
  assert.equal(r.code, 0, r.out);
  const kept = JSON.parse(node(LOCK, ['status', 'iphone', '--json'], { env: phone.env }).stdout)[0].holder.expiresAt;
  assert.equal(Date.parse(kept), longLease, `the run kept the owner's longer lease (I-091): ${kept}`);
  assert.match(r.stdout, /^ {2}tween from m=0: first dts /m);
  assert.match(r.stdout, /^ {2}morph: moving \d+fr p50 /m);
  j = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual([j.meta.driver, j.meta.params.holdMs, j.meta.params.cycles], ['M', 150, 2]);
  assert.deepEqual([j.meta.ySource, j.meta.probeVersion], ['raf-legacy', 3]);
  assert.match(j.meta.yReads, /per observer batch/);
  assert.ok(j.meta.yReadCounts.crossing >= 1, 'raf-legacy reads scrollY in the observer (the --morph style writes)');
  assert.ok(j.crossings.every((c) => c.stale === false && c.yRow === null));
  assert.deepEqual(j.summary.tweens.map((t) => t.from), [0, 1, 0, 1]);
  assert.equal(j.driverResult.driver.cycles, 2);
  assert.deepEqual(j.meta.battery, { start: { error: 'idevicediagnostics: ENOENT' }, end: { error: 'idevicediagnostics: ENOENT' } }, 'no libimobiledevice: recorded, the run goes on');
  assert.equal(j.meta.settings.charging, 'unknown');
});

test('run --driver morph on a build without __fwMorphDrive: exit 1, the partial run is saved with meta.error', async () => {
  const phone = await fakePhone();
  assert.equal(node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me'], { env: phone.env }).code, 0);
  const out = join(dir, 'bad.json');
  const r = await run(['--driver', 'morph', '--owner', 'me', '--settle', '0', '--hold', '100', '--cycles', '1', '--out', out], phone.env);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /driver failed in the page: no window\.__fwMorphDrive .*partial run saved: /);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.match(j.meta.error, /no window\.__fwMorphDrive/);
  assert.equal(j.driverResult, null);
});

test('run during a normal chrome-measure hold: WAIT, Safari untouched; a short-lane hold or --allow-during-measure runs', async () => {
  const phone = await fakePhone(['--doc-height=1200']);
  assert.equal(node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me'], { env: phone.env }).code, 0);
  assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--owner', 'fix-ab'], { env: phone.env }).code, 0);
  const args = ['--driver', 'scroll', '--owner', 'me', ...SHORT, '--bottom', '0'];
  let r = await run([...args, '--out', join(dir, 'a.json')], phone.env);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /^WAIT: chrome-measure is held by "fix-ab"/m);
  assert.deepEqual(phone.events().filter((e) => e.evaluate || e.reload), [], 'nothing evaluated, no reload');
  assert.ok(!existsSync(join(dir, 'a.json')));
  r = await run([...args, '--allow-during-measure', '--no-park', '--out', join(dir, 'b.json')], phone.env); // run c reuses the page (I-047)
  assert.equal(r.code, 0, r.out);
  assert.equal(node(LOCK, ['release', 'chrome-measure', '--owner', 'fix-ab'], { env: phone.env }).code, 0);
  assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--owner', 'npm-test', '--short', '--max-seconds', '120'], { env: phone.env }).code, 0);
  r = await run([...args, '--out', join(dir, 'c.json')], phone.env);
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(readFileSync(join(dir, 'c.json'), 'utf8')).meta.driver, 'S');
});

test('I-056: run beside a shared group: by default it runs with a NOTE and meta.mac; --require-quiet / FW_PHONE_REQUIRE_QUIET=1 WAIT, Safari untouched; inside the runner\'s own lock.mjs run --no-timing hold it runs', async () => {
  const phone = await fakePhone(['--doc-height=1200']);
  const e = { ...phone.env, FW_LOCK_LOAD1: '5.5' }; // the run records load1: never the host's (I-057)
  assert.equal(node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me'], { env: e }).code, 0);
  assert.equal(node(LOCK, ['shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e'], { env: e }).code, 0);
  assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--shared', '--weight', '3', '--max-seconds', '120', '--owner', 'sim-x'], { env: e }).code, 0);
  const args = ['--driver', 'scroll', '--owner', 'me', ...SHORT, '--bottom', '0'];
  // --require-quiet, or FW_PHONE_REQUIRE_QUIET=1: WAIT before Safari is touched
  for (const [a, ee] of [[['--require-quiet'], e], [[], { ...e, FW_PHONE_REQUIRE_QUIET: '1' }]]) {
    const r = await run([...args, ...a, '--out', join(dir, 'w.json')], ee);
    assert.equal(r.code, 1, r.out);
    assert.match(r.stderr, /^WAIT: chrome-measure is held by the shared lane \("sim-x" w3\), and this run asks for a quiet Mac/m);
  }
  assert.deepEqual(phone.events().filter((x) => x.evaluate || x.reload), [], 'nothing evaluated, no reload');
  // default (Mac-quiet preferred, not required; user T-017): it runs, one NOTE, the Mac state in meta.mac
  let r = await run([...args, '--no-park', '--out', join(dir, 'a.json')], e);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout.match(/^NOTE: shared jobs hold chrome-measure beside this phone run \("sim-x" w3; load1 5\.5\)/gm)?.length, 1, 'one note line (the re-check after the settle prints none)');
  const mac = JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8')).meta.mac;
  assert.deepEqual([mac.requireQuiet, mac.allow, mac.start.shared, mac.start.load1, mac.end.shared, mac.end.load1], [false, false, [{ owner: 'sim-x', weight: 3 }], 5.5, [{ owner: 'sim-x', weight: 3 }], 5.5]);
  assert.ok(Date.parse(mac.end.at) >= Date.parse(mac.start.at));
  assert.equal(node(LOCK, ['release', 'chrome-measure', '--shared', '--owner', 'sim-x'], { env: e }).code, 0);
  // the lead's convention: the recorded part inside the runner's own no-timing hold (the hold's name may differ: FW_LOCK_HELD)
  const out = join(dir, 'b.json');
  r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'g1-hold', '--no-timing', '--max-seconds', '120', '--', process.execPath, IPHONE, 'run', ...args, '--require-quiet', '--out', out], { env: e, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stderr, /WAIT|no-timing hold/);
  assert.doesNotMatch(r.stdout, /NOTE: shared jobs/);
  const b = JSON.parse(readFileSync(out, 'utf8')).meta;
  assert.equal(b.driver, 'S');
  assert.deepEqual([b.mac.requireQuiet, b.mac.start.shared, b.mac.end.shared], [true, [], []]);
});

test('I-047: a control run records the heat-sentinel verdict next to the battery and ends with Safari parked; the next run asks for open; --no-park keeps the page', async () => {
  const phone = await fakePhone(['--doc-height=1500']);
  assert.equal(node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me'], { env: phone.env }).code, 0);
  let out = join(dir, 'keep.json');
  let r = await run(['--driver', 'scroll', '--owner', 'me', ...SHORT, '--bottom', '0.3', '--arm', 'V', '--no-park', '--out', out], phone.env);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(phone.events().filter((e) => e.navigate), [], '--no-park: Safari keeps the page');
  assert.doesNotMatch(r.out, /parked|heat sentinel/);
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).meta.sentinel, null, 'arm V is not the sentinel');

  out = join(dir, 'ctl.json');
  r = await run(['--driver', 'scroll', '--owner', 'me', ...SHORT, '--bottom', '0.3', '--arm', 'C', '--block', 'k1', '--out', out], phone.env);
  assert.equal(r.code, 0, r.out);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  const keys = Object.keys(j.meta);
  assert.equal(keys.indexOf('sentinel'), keys.indexOf('battery') + 1, 'meta.sentinel next to meta.battery');
  assert.deepEqual([j.meta.sentinel.driver, j.meta.sentinel.criterion, typeof j.meta.sentinel.pass], ['S', 'bottom >= 58 fps and scroll >= 44 fps', 'boolean']);
  assert.deepEqual(j.meta.sentinel.value, { bottom: j.summary.phases.bottom.fps, scroll: j.summary.phases.scroll.fps });
  assert.match(r.stdout, /^ {2}heat sentinel \[S\]: (PASS|FAIL) .*; battery 30\.\d+ °C at the end$/m);
  assert.match(r.stdout, /^parked Safari on about:blank \(--no-park keeps the page\); before the next run: node tools\/iphone\.mjs open <url> --owner me \(it loads the URL in the parked tab, or restarts Safari, I-077\)$/m);
  assert.deepEqual(phone.events().filter((e) => e.navigate).map((e) => e.navigate), ['about:blank'], 'parked once, after the run');
  const ev = phone.events();
  assert.ok(ev.findIndex((e) => e.navigate) > ev.findLastIndex((e) => e.evaluate && e.evaluate.startsWith('window.__fwrState')), 'the park comes after the timed part');

  r = await run(['--driver', 'scroll', '--owner', 'me', ...SHORT, '--out', join(dir, 'next.json')], phone.env);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /Safari shows no web page \(parked after the last run or block, I-047\?\): node tools\/iphone\.mjs open <url> --owner me first \(it loads the URL in the parked tab, or restarts Safari, I-077\)$/m);
  assert.equal(phone.events().filter((e) => e.reload).length, 2, 'no reload of a parked tab');
  r = await nodeAsync(IPHONE, ['park', '--owner', 'me'], { env: phone.env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout, 'PARKED already: Safari shows no web page\n');
  assert.equal(phone.events().filter((e) => e.navigate).length, 1, 'nothing navigated again');
});

test('I-075: served hashes are fetched for a local page (default unchanged); --no-served and a non-local page skip the fetch and record why', async () => {
  let phone = await fakePhone(['--doc-height=1500']);
  assert.equal(node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me'], { env: phone.env }).code, 0);
  const gets = () => phone.events().filter((e) => e.get);
  let out = join(dir, 'local.json');
  let r = await run(['--driver', 'scroll', '--owner', 'me', ...SHORT, '--bottom', '0.2', '--no-battery', '--no-park', '--out', out], phone.env);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).meta.served, { '/_app/immutable/app.js': createHash('sha256').update(APP_JS).digest('hex').slice(0, 16) }, 'the mirror default: hashed as before');
  assert.equal(gets().length, 1, 'one GET of the page script from the Mac');
  assert.doesNotMatch(r.stdout, /^served:/m);

  out = join(dir, 'flag.json');
  r = await run(['--driver', 'scroll', '--owner', 'me', ...SHORT, '--bottom', '0.2', '--no-battery', '--no-park', '--no-served', '--out', out], phone.env);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).meta.served, { skipped: true, reason: '--no-served' });
  assert.equal(gets().length, 1, '--no-served: no GET');
  assert.match(r.stdout, /^served: not fetched \(--no-served\)$/m);
  await phone.stop();

  phone = await fakePhone(['--doc-height=1500', '--page-host=192.0.2.1']); // TEST-NET-1 (RFC 5737): not loopback, not LAN
  out = join(dir, 'ext.json');
  r = await run(['--driver', 'scroll', '--owner', 'me', ...SHORT, '--bottom', '0.2', '--no-battery', '--no-park', '--out', out], phone.env);
  assert.equal(r.code, 0, r.out);
  const m = JSON.parse(readFileSync(out, 'utf8')).meta;
  assert.match(m.href, /^http:\/\/192\.0\.2\.1:\d+\/$/);
  assert.deepEqual(m.served, { skipped: true, reason: 'not a loopback or LAN page (host 192.0.2.1): no requests from the Mac to it' });
  assert.equal(gets().length, 0, 'a non-local page: no request from the Mac');
  assert.match(r.stdout, /^served: not fetched \(not a loopback or LAN page \(host 192\.0\.2\.1\)/m);
});

test('run while Safari shows the certificate warning: refused with the open hint, no reload', async () => {
  const phone = await fakePhone(['--cert-warning']);
  assert.equal(node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me'], { env: phone.env }).code, 0);
  const r = await run(['--driver', 'scroll', '--owner', 'me', ...SHORT], phone.env);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /certificate warning .*node tools\/iphone\.mjs open <url> --owner me \(incident I-003\)/);
  assert.deepEqual(phone.events().filter((e) => e.evaluate || e.reload), []);
});
