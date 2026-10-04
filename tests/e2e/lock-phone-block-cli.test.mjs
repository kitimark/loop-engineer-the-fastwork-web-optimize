// I-160 end to end: `lock.mjs doing iphone --block/--between` (and `acquire iphone --block`) mark a phone block; a
// Simulator session (`acquire|run --shared --weight simulator`, or a `run` of sim.mjs session) is DEFERRED while the
// block runs without a window that fits it; status lists it; other readers are not deferred. Temp FW_STATE_DIR (I-041).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';

const LOCK = tool('lock.mjs');
let state, env;
beforeEach(() => { state = tempDir('fw-pblockcli-'); env = { FW_STATE_DIR: state, FW_LOCK_SHARED_JOIN_LOAD: '1000', FW_LOCK_SHARED_JOIN_BUSY: '100' }; });
const lock = (...a) => node(LOCK, a, { env });
const iphone = () => JSON.parse(readFileSync(join(state, 'locks', 'iphone.json'), 'utf8'));

test('I-160 CLI: --block/--between mark the lease (iphone only, validated); a Simulator session is DEFERRED (exit 3, not queued) until a window fits', () => {
  assert.equal(lock('shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e').code, 0);
  const a = lock('acquire', 'iphone', '--owner', 'runner', '--ttl', '900', '--block', 'P-114');
  assert.equal(a.code, 0, a.stderr);
  assert.equal(iphone().meta.block.id, 'P-114');
  assert.match(lock('doing', 'chrome-measure', '--owner', 'runner', '--block', 'P-1').stderr, /iphone lease/);
  assert.match(lock('acquire', 'iphone', '--owner', 'runner', '--between', '5').stderr, /--between is for lock\.mjs doing iphone/);
  assert.match(lock('renew', 'iphone', '--owner', 'runner', '--block', 'P-1').stderr, /--block and --between are for/);
  assert.match(lock('doing', 'iphone', '--owner', 'runner', '--block', 'no spaces').stderr, /ticket id/);
  const st = lock('status', 'iphone', '--no-host');
  assert.match(st.stdout, /"block":\{"id":"P-114"/);
  // deferred: exit 3, a reason, no queue entry; status lists it
  const d = lock('acquire', 'chrome-measure', '--owner', 'sim-a', '--shared', '--weight', 'simulator', '--max-seconds', '120');
  assert.equal(d.code, 3, d.stdout + d.stderr);
  assert.match(d.stdout, /^DEFERRED chrome-measure: deferred: phone block P-114 of "runner" runs on the iPhone and no between-holds window is open/);
  const s = lock('status', 'chrome-measure', '--no-host');
  assert.match(s.stdout, /deferred by a phone block \(I-160; not queued, they poll on\): sim-a/);
  assert.doesNotMatch(s.stdout, /queue:/);
  // another reader is not deferred
  const f = lock('acquire', 'chrome-measure', '--owner', 'fn', '--shared', '--weight', '1', '--max-seconds', '30');
  assert.equal(f.code, 0, f.stdout + f.stderr);
  assert.equal(lock('release', 'chrome-measure', '--shared', '--owner', 'fn').code, 0);
  // the runner opens a 10 min window: the session starts
  const w = lock('doing', 'iphone', '--owner', 'runner', '--between', '10');
  assert.equal(w.code, 0, w.stderr);
  assert.match(w.stdout, /phone block P-114, between holds until .* \(Simulator sessions that fit may start; I-160\)/);
  const ok = lock('acquire', 'chrome-measure', '--owner', 'sim-a', '--shared', '--weight', 'simulator', '--max-seconds', '120');
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.doesNotMatch(lock('status', 'chrome-measure', '--no-host').stdout, /deferred by a phone block/);
  assert.equal(lock('release', 'chrome-measure', '--shared', '--owner', 'sim-a').code, 0);
  // the block ends
  const n = lock('doing', 'iphone', '--owner', 'runner', '--block', 'none');
  assert.equal(n.code, 0, n.stderr);
  assert.equal(iphone().meta.block, undefined);
  assert.equal(iphone().meta.between, undefined);
});

test('I-160 CLI: `run` of sim.mjs session counts as a Simulator session whatever its weight; deferred runs poll and give up at --timeout', () => {
  assert.equal(lock('shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e').code, 0);
  assert.equal(lock('acquire', 'iphone', '--owner', 'runner', '--ttl', '900', '--block', 'P-9').code, 0);
  const r = lock('run', 'chrome-measure', '--owner', 'sim-b', '--shared', '--weight', '2', '--max-seconds', '60', '--timeout', '1',
    '--', process.execPath, '-e', '/* node tools/sim.mjs session */', 'tools/sim.mjs', 'session');
  assert.notEqual(r.code, 0);
  assert.match(r.stderr + r.stdout, /phone block P-9/);
  const s = lock('status', 'chrome-measure', '--no-host');
  assert.doesNotMatch(s.stdout, /sim-b/, 'a deferred run that gave up leaves no trace');
  // a plain weight-2 job is not a Simulator session
  const p = lock('run', 'chrome-measure', '--owner', 'job', '--shared', '--weight', '2', '--max-seconds', '60', '--', process.execPath, '-e', '0');
  assert.equal(p.code, 0, p.stdout + p.stderr);
});
