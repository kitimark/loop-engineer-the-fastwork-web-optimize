// The host admission gate through the CLIs (incident I-016): `lock.mjs status` host line, `lock.mjs
// acquire` of chrome-measure on a busy / quiet (fake) host, the gate-timeout grant, and verify.mjs marking
// every run of a gate-timeout hold contaminated. The host is tests/fixtures/fake-host.mjs ($FW_TEST_HOST,
// set by helpers.cleanEnv), driven by FAKE_HOST_* env.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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
