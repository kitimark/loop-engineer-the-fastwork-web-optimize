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
