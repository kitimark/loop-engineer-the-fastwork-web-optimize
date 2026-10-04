// I-165 end to end on a temp state dir: `lock.mjs wait iphone --until mine --for N` on a lease that is already the
// caller's ends at once (MET, exit 0) with a NOTE on stderr, instead of idling the phone N s. No phone or real store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir, node, tool } from '../helpers.mjs';

const LOCK = tool('lock.mjs');

test('I-165 CLI: wait --until mine --for 60 on the own lease exits 0 at once with a NOTE; --for still holds for another owner\'s hold', () => {
  const env = { FW_STATE_DIR: tempDir('fw-selfwait-e2e-') };
  const lock = (...a) => node(LOCK, a, { env });
  assert.equal(lock('acquire', 'iphone', '--owner', 'fix-h', '--ttl', '900').code, 0);
  const t0 = Date.now();
  const w = lock('wait', 'iphone', '--until', 'mine', '--for', '60', '--owner', 'fix-h', '--timeout', '20');
  assert.equal(w.code, 0, w.stdout + w.stderr);
  assert.ok(Date.now() - t0 < 15000, `ended at once, not after --for (took ${Date.now() - t0} ms)`);
  assert.match(w.stdout, /^MET /m);
  assert.match(w.stderr, /NOTE --for 60 is ignored with --until mine \(held-by:fix-h\): .*\(I-165\)\. For a quiet window use --until idle --for N\./);
  // another owner waiting for fix-h's hold with --for keeps the hold time: it times out first
  const o = lock('wait', 'iphone', '--until', 'held-by:fix-h', '--for', '60', '--owner', 'fix-w', '--timeout', '2');
  assert.equal(o.code, 3, o.stdout + o.stderr);
  assert.doesNotMatch(o.stderr, /I-165/);
});
