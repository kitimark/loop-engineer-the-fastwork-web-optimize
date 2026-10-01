// tools/wait.mjs and `lock.mjs wait` CLIs (ts-wait, user request 2026-10-01): one background command that
// exits by itself with one result line (MET / TIMEOUT / NEVER) and a documented exit code (0 / 3 / 4, 1 usage),
// replacing agents' `sleep N; status` and `until …; do sleep …; done` loops. Also: `acquire iphone --wait`
// keeps strict FIFO (the documented replacement for retrying acquire iphone every 2-5 min by hand).
// Temp lock dirs ($FW_STATE_DIR) only; no real locks, no port 5173, no phone.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { tempDir, node, nodeAsync, tool, sleep, cleanEnv, TESTS } from '../helpers.mjs';

const WAIT = tool('wait.mjs');
const LOCK = tool('lock.mjs');
let state, env;
beforeEach(() => { state = tempDir('fw-waitcli-'); env = { FW_STATE_DIR: state }; });
const lock = (...a) => node(LOCK, a, { env });
const lockAsync = (...a) => nodeAsync(LOCK, a, { env });
const queue = (r) => { try { return JSON.parse(readFileSync(join(state, 'locks', `${r}.queue.json`), 'utf8')).map((w) => w.owner); } catch { return []; } };

test('wait file --match: exits 0 with the matching line once a background job writes it', async () => {
  const f = join(state, 'job.log');
  const w = nodeAsync(WAIT, ['file', f, '--match', '^EXIT \\d+', '--timeout', '20']);
  await sleep(600);
  writeFileSync(f, 'working\n');
  await sleep(600);
  appendFileSync(f, 'EXIT 0\n');
  const r = await w;
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^MET file ${f.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} ~ /\\^EXIT \\\\d\\+/: EXIT 0 \\(after \\d+ s\\)\\n$`));
  assert.match(r.stderr, /no such file yet/, 'state changes go to stderr');
  assert.equal(r.stdout.trim().split('\n').length, 1, 'one result line on stdout');
});

test('wait file: TIMEOUT exit 3 with the last state; --pid of a finished writer: NEVER exit 4 at once', async () => {
  const f = join(state, 'x.log');
  writeFileSync(f, 'nothing\n');
  const t = node(WAIT, ['file', f, '--match', 'DONE', '--timeout', '1', '--quiet']);
  assert.equal(t.code, 3, t.out);
  assert.match(t.stdout, /^TIMEOUT file .* after 1 s: no line matches \/DONE\/ yet \(8 bytes\)$/m);
  assert.equal(t.stderr, '', '--quiet: no change lines');
  const p = spawn(process.execPath, ['-e', '0'], { env: cleanEnv() });
  await new Promise((r) => p.on('exit', r));
  const t0 = Date.now();
  const n = node(WAIT, ['file', f, '--match', 'DONE', '--pid', String(p.pid), '--timeout', '600']);
  assert.equal(n.code, 4, n.out);
  assert.match(n.stdout, new RegExp(`^NEVER file .*: process ${p.pid} exited and no line matched`));
  assert.ok(Date.now() - t0 < 5000, 'no hour-long wait for a dead writer');
});

test('wait serve: MET with MIRROR_URL once the state file names a live pid whose URL answers', async () => {
  const s = await new Promise((res) => { const x = http.createServer((q, a) => a.end('ok')); x.listen(0, '127.0.0.1', () => res(x)); });
  const url = `http://127.0.0.1:${s.address().port}/`;
  const f = join(state, 'serve-t.json');
  try {
    const w = nodeAsync(WAIT, ['serve', f, '--timeout', '20']);
    await sleep(700);
    writeFileSync(f, JSON.stringify({ url, pid: process.pid }));
    const r = await w;
    assert.equal(r.code, 0, r.out);
    assert.match(r.stdout, new RegExp(`^MET serve .*: MIRROR_URL=${url.replace(/[.]/g, '\\.')} pid=${process.pid} \\(after \\d+ s\\)$`, 'm'));
  } finally { s.close(); }
  const t = node(WAIT, ['serve', join(state, 'none.json'), '--timeout', '1', '--quiet']);
  assert.equal(t.code, 3);
  assert.match(t.stdout, /TIMEOUT serve .* after 1 s: no state file yet/);
});

test('wait url / pid / time / git, and usage errors exit 1', async () => {
  const p = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 1500)'], { env: cleanEnv() });
  const r = node(WAIT, ['pid', String(p.pid), '--timeout', '20']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^MET pid ${p.pid}: pid ${p.pid} exited`));
  const u = node(WAIT, ['url', 'http://127.0.0.1:9/', '--timeout', '1', '--quiet']);
  assert.equal(u.code, 3, u.out);
  assert.match(u.stdout, /^TIMEOUT url http:\/\/127\.0\.0\.1:9\/ after 1 s: no answer/);
  const tm = node(WAIT, ['time', '1']);
  assert.equal(tm.code, 0, tm.out);
  assert.match(tm.stdout, /^MET time \d{4}-/);
  const g = node(WAIT, ['git', '--ref', 'HEAD', '--contains', 'HEAD', '--quiet']);
  assert.equal(g.code, 0, g.out);
  assert.match(g.stdout, /^MET git HEAD contains HEAD/);
  for (const args of [[], ['bogus'], ['file'], ['pid', 'abc'], ['file', 'x', '--timeout', 'soon'], ['file', 'x', '--match', '('], ['git', '--path', 'a', '--grep', 'b'], ['time', '5', '--timeout', '9']]) {
    const e = node(WAIT, args);
    assert.equal(e.code, 1, `${args.join(' ')}: ${e.out}`);
  }
  assert.equal(node(WAIT, ['--help']).code, 0);
});

// wait phone-temp (ts-phone-cool, user T-009): the battery through tools/lib/iphone-run.mjs batteryInfo, here the
// fake idevicediagnostics ($FW_IDEVICEDIAGNOSTICS; 30.50 °C on its first call, with a serial that must not show)
test('wait phone-temp: MET at once when cool, TIMEOUT with the last reading, UNAVAILABLE exit 1 without a device; no serials; usage', () => {
  const FAKE_IDD = join(TESTS, 'fixtures', 'fake-idevicediagnostics.mjs');
  const log = join(state, 'idd.log');
  const calls = () => { try { return readFileSync(log, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
  const iddEnv = { FW_IDEVICEDIAGNOSTICS: FAKE_IDD, FAKE_IDD_LOG: log };
  const m = node(WAIT, ['phone-temp', '--below', '35'], { env: iddEnv });
  assert.equal(m.code, 0, m.out);
  assert.equal(m.stdout, 'MET phone-temp: phone at 30.5 °C <= 35.0 °C (after 0 s)\n');
  assert.match(m.stderr, /\] read 1: 30\.5 °C <= 35\.0 °C\n/, 'one line per read on stderr');
  assert.equal(calls(), 1);

  const t = node(WAIT, ['phone-temp', '--below', '20', '--timeout', '1'], { env: iddEnv });
  assert.equal(t.code, 3, t.out);
  assert.equal(t.stdout, 'TIMEOUT phone-temp after 1 s: read 1: 30.6 °C > 20.0 °C\n');
  assert.equal(calls(), 2, 'the check at the 1 s deadline reuses the first read (30 s floor)');
  for (const r of [m, t]) assert.doesNotMatch(r.out, /FAKESERIAL|Serial|192\.168\./, 'no device ids or LAN addresses');

  const u = node(WAIT, ['phone-temp', '--below', '38'], { env: { FW_IDEVICEDIAGNOSTICS: join(state, 'no-such-idevicediagnostics') } });
  assert.equal(u.code, 1, u.out);
  assert.equal(u.stdout, 'UNAVAILABLE phone-temp: battery temperature unavailable (idevicediagnostics: ENOENT) (after 0 s)\n');

  const before = calls();
  for (const args of [['phone-temp'], ['phone-temp', '--below', 'hot'], ['phone-temp', '--below', '38', '--runs-dir', state], ['phone-temp', '--below', 'auto', '--driver', 'X'], ['phone-temp', '--below', '38', '--driver', 'M'], ['phone-temp', '--below', '38', '--every', '10'], ['phone-temp', '--below', '38', '--every', 'x'], ['phone-temp', '--below', '38', '--timeout', 'soon']]) {
    const e = node(WAIT, args, { env: iddEnv });
    assert.equal(e.code, 1, `${args.join(' ')}: ${e.out}`);
    assert.equal(e.stdout, '', `${args.join(' ')}: no result line on a usage error`);
  }
  assert.match(node(WAIT, ['phone-temp', '--below', '38', '--runs-dir', state], { env: iddEnv }).stderr, /--runs-dir and --driver go with --below auto/);
  assert.match(node(WAIT, ['phone-temp', '--below', 'auto', '--driver', 'X'], { env: iddEnv }).stderr, /--driver is the next block's driver: S, W or M \(got X\)/);
  assert.match(node(WAIT, ['phone-temp', '--below', '38', '--every', '10'], { env: iddEnv }).stderr, /--every must be .*>= 30/);
  assert.equal(calls(), before, 'usage errors read no battery');
});

// --below auto (incident I-047): the last passing heat sentinel's battery temperature today minus 0.5 °C, from the run
// records `iphone.mjs run` writes (meta.sentinel next to meta.battery); 38 °C when there is none
test('wait phone-temp --below auto: 38 °C without a passing sentinel today; the last passing one minus 0.5 °C; the source on stderr', () => {
  const FAKE_IDD = join(TESTS, 'fixtures', 'fake-idevicediagnostics.mjs');
  const iddEnv = { FW_IDEVICEDIAGNOSTICS: FAKE_IDD, FAKE_IDD_LOG: join(state, 'idd.log') }; // 30.5 °C, 30.6, ...
  const runs = join(state, 'runs');
  const rec = (name, sentinelPass, endC, date = new Date()) => {
    mkdirSync(runs, { recursive: true });
    writeFileSync(join(runs, name), JSON.stringify({ meta: { schema: 'fw-iphone-run/1', kind: 'run', date: date.toISOString(), battery: { start: { temperatureC: endC - 1 }, end: { temperatureC: endC } }, sentinel: { driver: 'S', criterion: 'bottom >= 58 fps and scroll >= 44 fps', value: { bottom: 59, scroll: 55 }, pass: sentinelPass } } }));
  };
  let r = node(WAIT, ['phone-temp', '--below', 'auto', '--runs-dir', runs], { env: iddEnv });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout, 'MET phone-temp --below auto: phone at 30.5 °C <= 38.0 °C (after 0 s)\n');
  assert.match(r.stderr, /^auto: --below 38\.0 °C \(no passing heat sentinel with a battery reading today in .*runs; 0 record\(s\) from today read\)$/m);
  rec('a-run-ctl-1.json', true, 31.0);
  rec('a-run-ctl-2.json', false, 33.0);
  r = node(WAIT, ['phone-temp', '--below', 'auto', '--runs-dir', runs, '--timeout', '1'], { env: iddEnv });
  assert.equal(r.code, 3, r.out);
  assert.equal(r.stdout, 'TIMEOUT phone-temp --below auto after 1 s: read 1: 30.6 °C > 30.5 °C\n', 'the failing sentinel after it does not count');
  assert.match(r.stderr, /^auto: --below 30\.5 °C = 31\.0 °C \(battery after the last passing heat sentinel today, .*a-run-ctl-1\.json, \d\d:\d\d:\d\dZ\) - 0\.5$/m);
  rec('a-run-ctl-3.json', true, 31.6);
  r = node(WAIT, ['phone-temp', '--below', 'auto', '--runs-dir', `${join(state, 'none')},${runs}`], { env: iddEnv });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout, 'MET phone-temp --below auto: phone at 30.7 °C <= 31.1 °C (after 0 s)\n', 'the newest passing one; comma-separated dirs');
  assert.doesNotMatch(r.out, /FAKESERIAL|Serial|192\.168\./);
  // --driver M (iphone-runner: M sentinels failed at 41.5 °C): auto is at most 39.5 °C; S/W are not capped
  rec('a-run-ctl-4.json', true, 41.0);
  r = node(WAIT, ['phone-temp', '--below', 'auto', '--runs-dir', runs, '--driver', 'm'], { env: iddEnv });
  assert.equal(r.stdout, 'MET phone-temp --below auto: phone at 30.8 °C <= 39.5 °C (after 0 s)\n');
  assert.match(r.stderr, /^auto: --driver M: capped at 39\.5 °C \(M blocks start at or below 39\.5 °C\)$/m);
  r = node(WAIT, ['phone-temp', '--below', 'auto', '--runs-dir', runs, '--driver', 'S'], { env: iddEnv });
  assert.equal(r.stdout, 'MET phone-temp --below auto: phone at 30.9 °C <= 40.5 °C (after 0 s)\n');
  assert.doesNotMatch(r.stderr, /capped/);
});

test('lock wait: released-by exits when the holder releases; position<=1 and mine as the queue moves; read-only', async () => {
  assert.equal(lock('acquire', 'w', '--owner', 'a').code, 0);
  assert.equal(lock('acquire', 'w', '--owner', 'b').code, 3);
  assert.equal(lock('acquire', 'w', '--owner', 'c').code, 3);
  const rel = lockAsync('wait', 'w', '--until', 'released-by:a', '--timeout', '30');
  const pos = lockAsync('wait', 'w', '--until', 'position<=1', '--owner', 'c', '--timeout', '30');
  const mine = lockAsync('wait', 'w', '--until', 'mine', '--owner', 'b', '--timeout', '30');
  await sleep(1200);
  assert.deepEqual(queue('w'), ['b', 'c'], 'waits take no queue place');
  assert.equal(lock('release', 'w', '--owner', 'a').code, 0);
  const r = await rel;
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^MET w released-by "a": free; queue: 1\. b, 2\. c \(after \d+ s\)$/m);
  assert.equal(lock('acquire', 'w', '--owner', 'b').code, 0);
  const m = await mine;
  assert.equal(m.code, 0, m.out);
  assert.match(m.stdout, /^MET w held-by "b": held by "b"; queue: 1\. c/m);
  const p = await pos;
  assert.equal(p.code, 0, p.out);
  assert.match(p.stdout, /^MET w "c" at position <= 1/m);
  assert.match(p.stderr, /\[lock wait .*\] w held by "a"; queue: 1\. b, 2\. c/, 'each state change on stderr');
});

test('lock wait: TIMEOUT exit 3 with the state; idle --for needs the lock to stay idle; usage errors exit 1', async () => {
  assert.equal(lock('acquire', 'w', '--owner', 'a').code, 0);
  const t = lock('wait', 'w', '--until', 'free', '--timeout', '1', '--quiet');
  assert.equal(t.code, 3, t.out);
  assert.match(t.stdout, /^TIMEOUT w free after 1 s: held by "a"$/m);
  assert.equal(lock('release', 'w', '--owner', 'a').code, 0);
  const t0 = Date.now();
  const idle = lock('wait', 'w', '--until', 'idle', '--for', '2', '--timeout', '20');
  assert.equal(idle.code, 0, idle.out);
  assert.match(idle.stdout, /^MET w idle: free \(for 2 s\)/m);
  assert.ok(Date.now() - t0 >= 2000, 'held the condition for --for seconds');
  for (const args of [['wait', 'w'], ['wait', 'w', '--until', 'mine'], ['wait', 'w', '--until', 'soon'], ['wait', 'w', '--until', 'free', '--timeout', 'x'], ['wait', 'BAD!', '--until', 'free']]) {
    const e = lock(...args);
    assert.equal(e.code, 1, `${args.join(' ')}: ${e.out}`);
  }
});

test('acquire iphone --wait: a background waiter gets the lease in strict FIFO order when the holder releases', async () => {
  assert.equal(lock('acquire', 'iphone', '--owner', 'a').code, 0);
  const b = lockAsync('acquire', 'iphone', '--owner', 'b', '--wait', '30');
  for (let i = 0; i < 100 && !queue('iphone').includes('b'); i++) await sleep(50);
  assert.equal(lock('acquire', 'iphone', '--owner', 'c').code, 3, 'c queues behind b');
  assert.equal(lock('release', 'iphone', '--owner', 'a').code, 0);
  const r = await b;
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ACQUIRED iphone for "b" until /);
  assert.equal(lock('acquire', 'iphone', '--owner', 'c').code, 3, 'c still waits: b holds it');
});
