// A tiny test file run by tests/e2e/chrome-lock.test.mjs with `node --test --test-timeout=<short>`,
// shaped like a tests/chrome file: it holds chrome-measure through chromeLock() (tests/helpers.mjs),
// then its test spawns `lock.mjs run chrome-measure` the way verify.mjs / fix.mjs ab take the lock,
// which must re-enter the hold instead of queueing behind it. FIXTURE_FAIL=1 makes the test fail
// (the hold must still be released).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromeLock, nodeAsync, tool } from '../helpers.mjs';

const lock = chromeLock('fixture-chrome-test', { cmd: 'fixture' });
before(() => lock.acquire(), { timeout: Infinity });
after(() => lock.release());

test('runs under the file hold; a child tool re-enters it', async () => {
  const r = await nodeAsync(tool('lock.mjs'), ['run', 'chrome-measure', '--owner', 'child-tool', '--', process.execPath, '-e', 'process.exit(0)'], { env: lock.env, timeout: 20000 });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /busy/, 'the child did not queue');
  assert.equal(process.env.FIXTURE_FAIL, undefined, 'FIXTURE_FAIL: failing on purpose');
});
