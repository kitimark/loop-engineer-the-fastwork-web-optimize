// The host admission gate through the CLIs (incident I-016): `lock.mjs status` host line, `lock.mjs
// acquire` of chrome-measure on a busy / quiet (fake) host, the gate-timeout grant, and verify.mjs marking
// every run of a gate-timeout hold contaminated. The host is tests/fixtures/fake-host.mjs ($FW_TEST_HOST,
// set by helpers.cleanEnv), driven by FAKE_HOST_* env.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { tempDir, node, nodeAsync, tool, TESTS } from '../helpers.mjs';

const LOCK = tool('lock.mjs');
let state;
beforeEach(() => { state = tempDir('fw-gatecli-'); });
const lock = (env, ...a) => node(LOCK, a, { env: { FW_STATE_DIR: state, ...env } });
const holder = () => { try { return JSON.parse(readFileSync(join(state, 'locks', 'chrome-measure.json'), 'utf8')); } catch { return null; } };

test('status prints a host line (load, CPU busy/sys, memory pressure, gate state); --json carries it; --no-host skips it', () => {
  const st = lock({ FAKE_HOST_BUSY: '0.3', FAKE_HOST_LOAD1: '8.2' }, 'status');
  assert.equal(st.code, 0, st.out);
  assert.match(st.stdout, /^host: load1 8\.2 \| cpu 30 % busy \(sys 9 %\) over 3 s \| mem pressure normal \| \d+ decompressions\/s \| STUBBED \(.*fake-host\.mjs\) \| chrome-measure gate open$/m);
  const js = JSON.parse(lock({}, 'status', 'chrome-measure', '--json').stdout)[0];
  assert.equal(js.host.busyPct, 5);
  assert.equal(JSON.parse(lock({}, 'status', 'iphone', '--json').stdout)[0].host, undefined, 'only gated resources');
  assert.doesNotMatch(lock({}, 'status', '--no-host').stdout, /^host:/m);
});

test('acquire on a busy host: BUSY "host not quiet" (exit 3), keeps the head place, status shows the closed gate; quiet host: ACQUIRED with the gate record', () => {
  const busy = { FAKE_HOST_BUSY: '0.6' };
  const b = lock(busy, 'acquire', 'chrome-measure', '--owner', 'topic-a');
  assert.equal(b.code, 3, b.out);
  assert.match(b.stdout, /^BUSY chrome-measure: free, but the host is not quiet \(cpu 60 % > 25 %; waiting since \S+, granted anyway after 600 s\)\. You \("topic-a"\) are #1/m);
  assert.equal(holder(), null);
  // someone else can't slip in on a quiet reading: topic-a is first
  assert.equal(lock({}, 'acquire', 'chrome-measure', '--owner', 'topic-b').code, 3);
  const st = lock(busy, 'status', 'chrome-measure');
  assert.match(st.stdout, /chrome-measure gate CLOSED for "topic-a" \(cpu 60 % > 25 %\) since /);
  // a short job is exempt from the gate
  const s = lock(busy, 'acquire', 'chrome-measure', '--owner', 'npm-test', '--short', '--max-seconds', '60');
  assert.equal(s.code, 0, s.out);
  assert.equal(lock({}, 'release', 'chrome-measure', '--owner', 'npm-test').code, 0);
  const ok = lock({}, 'acquire', 'chrome-measure', '--owner', 'topic-a');
  assert.equal(ok.code, 0, ok.out);
  const h = holder();
  assert.equal(h.owner, 'topic-a');
  assert.deepEqual([h.gate.quiet, h.gate.busyPct, h.gateTimeout], [true, 5, undefined]);
  assert.ok(h.gate.waitedSec >= 0);
  assert.match(h.gate.stub, /fake-host\.mjs$/, 'a stubbed host is visible in the holder record');
});

test('I-070 (C-024, replaces ts-lock-bundle (a) N3): a CLI acquire held at the host gate (BUSY exit 3) starts no caffeinate; a quiet grant of a timing lease starts its own -t one', async () => {
  const log = join(state, 'caffeinate-g.jsonl');
  const cenv = { FW_CAFFEINATE: join(TESTS, 'fixtures', 'fake-caffeinate.mjs'), FAKE_CAFFEINATE_LOG: log };
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  // quiet host: the gate passes on the one window, the timing lease is granted with its own assertion (a measurement)
  const ok = lock({ ...cenv, FW_STATE_DIR: join(state, 'quiet') }, 'acquire', 'chrome-measure', '--owner', 'quiet-topic');
  assert.equal(ok.code, 0, ok.out);
  for (let i = 0; i < 60 && calls().length < 1; i++) await sleep(50);
  const holderCalls = calls();
  assert.equal(holderCalls.length, 1);
  assert.deepEqual(holderCalls[0].args.slice(0, 3), ['-i', '-s', '-t']);
  for (const c of holderCalls) { try { process.kill(c.pid, 'SIGKILL'); } catch {} }
  // busy host: free lock, the gate closes on the measured window, BUSY exit 3 with the head place kept: no assertion
  const b = lock({ ...cenv, FAKE_HOST_BUSY: '0.6' }, 'acquire', 'chrome-measure', '--owner', 'topic-a');
  assert.equal(b.code, 3, b.out);
  assert.match(b.stdout, /^BUSY chrome-measure: free, but the host is not quiet/m);
  assert.equal(holder(), null);
  await sleep(300);
  assert.equal(calls().length, holderCalls.length, `a gate wait keeps nothing awake: ${JSON.stringify(calls().map((c) => c.args))}`);
  assert.equal(existsSync(join(state, 'locks', 'chrome-measure.queue-awake.json')), false);
});

test('gate timeout (FW_GATE_MAX_WAIT): granted anyway with gateTimeout, alert logged, and verify.mjs marks the runs contaminated', async () => {
  const env = { FAKE_HOST_BUSY: '0.6', FW_GATE_MAX_WAIT: '0' };
  const a = lock(env, 'acquire', 'chrome-measure', '--owner', 'late-topic');
  assert.equal(a.code, 0, a.out);
  assert.match(a.stdout, /after a host-gate TIMEOUT: the host was not quiet, measurements in this hold are contaminated/);
  assert.equal(holder().gateTimeout, true);
  const alerts = readFileSync(join(state, 'locks', 'host-alerts.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(alerts.map((x) => [x.owner, x.event]), [['late-topic', 'gate-timeout']]);
  assert.match(lock(env, 'status', 'chrome-measure').stdout, /held after a gate TIMEOUT/);
  // verify.mjs run as that owner (re-enters the lease): every run carries the gate record and is contaminated
  const d = tempDir('fw-gatev-');
  const r = await nodeAsync(tool('verify.mjs'), ['a=http://127.0.0.1:9/', '--runs', '1', '--viewport', 'mobile', '--cpu', '3', '--no-screens', '--idle', '0', '--max-wait', '0', '--out', join(d, 'out'), '--result', join(d, 'r.json'), '--profile', join(d, 'profile'), '--owner', 'late-topic'],
    { env: { CHROME: join(TESTS, 'fixtures', 'fake-chrome.mjs'), FW_STATE_DIR: state, FW_MIRROR_HOME: d } }); // no baseline served: off the real snapshot check
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'r.json'), 'utf8'));
  const h = res.results[0].host;
  assert.equal(h.gate.gateTimeout, true);
  assert.equal(h.loadInvalid, true);
  assert.ok(h.reasons.includes('lock granted by gate timeout (host never quiet)'), h.reasons.join('; '));
  assert.equal(res.host.gate.gateTimeout, true);
  assert.equal(lock({}, 'release', 'chrome-measure', '--owner', 'late-topic').code, 0);
  assert.equal(existsSync(join(state, 'locks', 'chrome-measure.json')), false);
});

test('T8+ (I-033): a chrome-measure `run` logs display / wake / display-sleep assertion at its start and end (locks/holds.log); warns without the assertion or on a change', () => {
  const log = () => readFileSync(join(state, 'locks', 'holds.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const cmd = [process.execPath, '-e', 'process.exit(5)'];
  // caffeinate -d active (the fake default), one state throughout: a line, no warning
  let r = lock({}, 'run', 'chrome-measure', '--owner', 'lit', '--', ...cmd);
  assert.equal(r.code, 5, r.out);
  assert.doesNotMatch(r.stderr, /display-sleep assertion|HOST-DISPLAY-CHANGED|not awake/);
  let l = log();
  assert.equal(l.length, 1);
  assert.deepEqual([l[0].resource, l[0].owner, l[0].short, l[0].code, l[0].tag], ['chrome-measure', 'lit', false, 5, null]);
  assert.ok(l[0].durationSec >= 0 && l[0].endedAt >= l[0].acquiredAt, 'I-056 (d): end and duration on every line');
  assert.deepEqual([l[0].start.display, l[0].start.fullWake, l[0].start.powerSource, l[0].start.displaySleepPrevented, l[0].end.display], ['on', true, 'AC', true, 'on']);
  assert.match(l[0].start.stub, /fake-host\.mjs$/);
  // no display-sleep assertion, and the display goes to sleep (DarkWake) during the hold
  r = lock({ FAKE_HOST_DISPLAY_ASSERT: '0', FAKE_HOST_DARKWAKE_AFTER: '1' }, 'run', 'chrome-measure', '--owner', 'dark', '--short', '--max-seconds', '60', '--', ...cmd);
  assert.equal(r.code, 5, r.out);
  assert.match(r.stderr, /^\[lock chrome-measure\] no display-sleep assertion is active .*PreventUserIdleDisplaySleep 0/m);
  assert.match(r.stderr, /^\[lock chrome-measure\] HOST-DISPLAY-CHANGED during this hold: dark run 1: display on, FullWake at the start, display off, DarkWake at the end/m);
  l = log();
  assert.deepEqual([l[1].owner, l[1].short, l[1].tag, l[1].start.displaySleepPrevented, l[1].end.fullWake], ['dark', true, 'HOST-DISPLAY-CHANGED', false, false]);
  assert.doesNotMatch(r.stderr, /not awake/, 'awake at the start of the hold');
  // review-host-state N1: already asleep at the start (display off, DarkWake): caffeinate -d does not wake it, so say so
  r = lock({ FAKE_HOST_DISPLAY: '0', FAKE_HOST_FULLWAKE: '0' }, 'run', 'chrome-measure', '--owner', 'asleep', '--short', '--max-seconds', '60', '--', ...cmd);
  assert.equal(r.code, 5, r.out);
  assert.match(r.stderr, /^\[lock chrome-measure\] the host is not awake at the start of this hold \(display off, DarkWake\): a display-sleep assertion does not wake it/m);
  assert.doesNotMatch(r.stderr, /HOST-DISPLAY-CHANGED|no display-sleep assertion/, 'one state throughout, assertion held');
  l = log();
  assert.deepEqual([l[2].owner, l[2].tag, l[2].start.display, l[2].start.fullWake], ['asleep', null, 'off', false]);
  // other resources: nothing recorded
  assert.equal(lock({}, 'run', 'iphone', '--owner', 'p', '--', ...cmd).code, 5);
  assert.equal(log().length, 3);
});

test('run --no-timing (ts-lock-bundle): granted on a busy host without the gate, shown as no-timing; a timing run inside refuses, a short one runs; a holds.log line without display / wake state', () => {
  const N = JSON.stringify(process.execPath), Q = JSON.stringify(LOCK);
  const inner = [
    `${N} ${Q} status chrome-measure --no-host`,
    `${N} ${Q} run chrome-measure --owner inner -- ${N} -e "process.exit(0)"; echo "timing=$?"`,
    `${N} ${Q} run chrome-measure --owner npm-test --short --max-seconds 60 -- ${N} -e "process.exit(0)"; echo "short=$?"`,
  ].join('; ');
  const r = lock({ FAKE_HOST_BUSY: '0.6' }, 'run', 'chrome-measure', '--owner', 'build', '--no-timing', '--', 'sh', '-c', inner);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^chrome-measure {2}held by "build" \(no-timing\) \[process pid \d+\]/m);
  assert.match(r.stdout, /^timing=1$/m);
  assert.match(r.stderr, /chrome-measure is held by "build" as a no-timing hold .* never runs inside it/);
  assert.match(r.stdout, /^short=0$/m);
  assert.doesNotMatch(r.stderr, /host is not quiet|display-sleep/);
  // I-056 (d): the hold is logged (owner, duration, exit code) for audit, but it records no display / wake state
  const l = readFileSync(join(state, 'locks', 'holds.log'), 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  assert.deepEqual(l.map((x) => [x.owner, x.mode, x.noTiming, x.code]), [['build', 'exclusive', true, 0]], 'one line, for the outer hold only (the nested short run re-entered it)');
  assert.ok(!('start' in l[0]) && !('end' in l[0]), 'a no-timing hold records no display / wake state');
  assert.ok(l[0].durationSec >= 0 && l[0].endedAt >= l[0].acquiredAt);
  assert.equal(existsSync(join(state, 'locks', 'host-alerts.log')), false);
  assert.equal(holder(), null, 'released');
  const a = lock({}, 'acquire', 'chrome-measure', '--owner', 'x', '--no-timing');
  assert.equal(a.code, 1);
  assert.match(a.stderr, /--no-timing is for lock\.mjs run/);
  const s = lock({}, 'run', 'chrome-measure', '--owner', 'x', '--no-timing', '--short', '--max-seconds', '60', '--', process.execPath, '-e', '0');
  assert.equal(s.code, 1);
  assert.match(s.stderr, /--no-timing is for normal holds/);
});
