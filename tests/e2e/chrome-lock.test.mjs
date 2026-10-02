// The tests/chrome harness and the chrome-measure lock (incident I-022). npm run test:chrome queued
// behind agents' A/Bs for longer than the 600 s per-test timeout: tests failed while still waiting, and
// vendor-shim.chrome then got the lock after its tests had timed out and held it with an idle Chrome.
// chromeLock() (tests/helpers.mjs) waits in a before() hook with its own budget, lets spawned tools
// re-enter the hold, and releases it in after(). Here: a chrome-shaped fixture test file under a very
// short --test-timeout, in a temp lock dir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, runAsync, tool, TESTS, sleep } from '../helpers.mjs';

const FIXTURE = join(TESTS, 'fixtures', 'chrome-lock-fixture.mjs');
const LOCK = tool('lock.mjs');
const state = () => { const d = tempDir('fw-chromelock-'); return { FW_STATE_DIR: join(d, 'state') }; };
const status = (env) => JSON.parse(node(LOCK, ['status', 'chrome-measure', '--json'], { env }).stdout)[0];
const runFixture = (env, timeoutMs, extra = {}) => runAsync(process.execPath, ['--test', `--test-timeout=${timeoutMs}`, FIXTURE], { env: { ...env, ...extra }, timeout: 60000 });

test('the queue wait does not count against the per-test timeout; spawned tools re-enter the hold; released after', async () => {
  const env = state();
  assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--owner', 'someone-measuring'], { env }).code, 0);
  const p = runFixture(env, 2000);
  await sleep(3500); // longer than the 2 s per-test timeout
  assert.deepEqual(status(env).queue.map((w) => w.owner), ['fixture-chrome-test'], 'the test file waits in the queue');
  assert.equal(node(LOCK, ['release', 'chrome-measure', '--owner', 'someone-measuring'], { env }).code, 0);
  const r = await p;
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ℹ pass 1/);
  const st = status(env);
  assert.equal(st.holder, null, 'released after the file');
  assert.deepEqual(st.queue, []);
});

test('under the npm run test:chrome wrapper (one lock.mjs run hold), the file and its tools re-enter it', async () => {
  const env = state();
  const r = await runAsync(process.execPath, [LOCK, 'run', 'chrome-measure', '--short', '--max-seconds', '60', '--owner', 'test-chrome', '--', process.execPath, '--test', '--test-timeout=5000', FIXTURE], { env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ℹ pass 1/);
  assert.doesNotMatch(r.out, /busy/);
  assert.equal(status(env).holder, null, 'released when the run ends');
});

test('ts-lock-share: under a `run --shared` wrapper (test:chrome:fn), a shared chromeLock file and its --shared tools re-enter the reader slot', async () => {
  const env = { ...state(), FW_LOCK_SHARED_JOIN_LOAD: '1000', FW_LOCK_SHARED_JOIN_BUSY: '100' };
  assert.equal(node(LOCK, ['shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e'], { env }).code, 0);
  const r = await runAsync(process.execPath, [LOCK, 'run', 'chrome-measure', '--shared', '--max-seconds', '60', '--weight', 'test-chrome-fn', '--owner', 'test-chrome-fn', '--', process.execPath, '--test', '--test-timeout=5000', FIXTURE], { env: { ...env, FIXTURE_SHARED: '1' }, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ℹ pass 1/);
  assert.doesNotMatch(r.out, /busy|shared \(functional\) hold/);
  assert.equal(status(env).holder, null, 'the group closed when the run ended');
  // the same file under the exclusive test:chrome wrapper: its shared lock re-enters the exclusive hold
  const x = await runAsync(process.execPath, [LOCK, 'run', 'chrome-measure', '--short', '--max-seconds', '60', '--owner', 'test-chrome', '--', process.execPath, '--test', '--test-timeout=5000', FIXTURE], { env: { ...env, FIXTURE_SHARED: '1' }, timeout: 60000 });
  assert.equal(x.code, 0, x.out);
  assert.doesNotMatch(x.out, /busy/);
});

test('review-lock-share B1: a shared chromeLock file run on its own takes the plain exclusive hold (no bounded shared or short hold nobody would kill), switch off or on', async () => {
  for (const on of [false, true]) {
    const env = { ...state(), FW_LOCK_SHARED_JOIN_LOAD: '1000', FW_LOCK_SHARED_JOIN_BUSY: '100' };
    if (on) assert.equal(node(LOCK, ['shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e'], { env }).code, 0);
    const out = join(tempDir('fw-chromelock-b1-'), 'holder.json');
    const r = await runFixture(env, 20000, { FIXTURE_SHARED: '1', FIXTURE_HOLDER_OUT: out });
    assert.equal(r.code, 0, r.out);
    const { holder: h, env: lockEnv } = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(h.owner, 'fixture-chrome-test', `switch ${on ? 'on' : 'off'}`);
    assert.equal(h.kind, 'process');
    for (const k of ['short', 'shared', 'functional', 'expiresAt', 'readers']) assert.equal(h[k], undefined, `switch ${on ? 'on' : 'off'}: no ${k}`);
    assert.ok(lockEnv.FW_LOCK_HELD && !lockEnv.FW_LOCK_SHARED, 'its tools get FW_LOCK_HELD, as on main');
    assert.equal(status(env).holder, null, 'released after the file');
  }
});

test('a failing test still releases the hold', async () => {
  const env = state();
  const r = await runFixture(env, 20000, { FIXTURE_FAIL: '1' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FIXTURE_FAIL: failing on purpose/);
  assert.equal(status(env).holder, null);
  assert.equal(existsSync(join(env.FW_STATE_DIR, 'locks', 'chrome-measure.json')), false);
});

test('every tests/chrome file holds chrome-measure through chromeLock() and passes its env to the tools', () => {
  const dir = join(TESTS, 'chrome');
  const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs'));
  assert.ok(files.length >= 3);
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/\bacquire\(\s*'chrome-measure'/.test(src), `${f}: take the lock with chromeLock(), not acquire() (its wait would count against the test timeout)`);
    assert.ok(/chromeLock\(/.test(src), `${f}: uses chromeLock()`);
    assert.ok(/before\(\(\) => lock\.acquire\(\), \{ timeout: Infinity \}\)/.test(src), `${f}: waits for the lock in its own before() hook`);
    assert.ok(/lock\.release\(\)/.test(src), `${f}: releases the lock in after()`);
    for (const m of src.matchAll(/(?:nodeAsync|startProc)\([^\n]*(?:verify\.mjs|fix\.mjs)[^\n]*/g)) assert.ok(/lock\.env/.test(m[0]), `${f}: a tool spawned without lock.env would queue behind the file's own hold:\n${m[0]}`);
  }
});
