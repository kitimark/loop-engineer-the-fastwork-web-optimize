// I-124: the free-disk floor for new timing holds (tools/lib/disk.mjs, lib/lock.mjs tryAcquire). A fake free-space
// reading ($FW_DISK_FREE_GB) stands in for a nearly full disk; every test uses its own $FW_STATE_DIR.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const D = await import('../../tools/lib/disk.mjs');
const L = await import('../../tools/lib/lock.mjs');
const CM = 'chrome-measure';
let state;
const saved = {};
beforeEach(() => {
  state = tempDir('fw-disk-');
  for (const k of ['FW_STATE_DIR', 'FW_TIMING_MIN_FREE_GB', 'FW_DISK_FREE_GB']) saved[k] = process.env[k];
  process.env.FW_STATE_DIR = state;
});
afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
const low = (gb = '3') => { process.env.FW_TIMING_MIN_FREE_GB = '8'; process.env.FW_DISK_FREE_GB = gb; };
const queue = () => { const f = join(state, 'locks', `${CM}.queue.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []; };

test('thresholds: defaults 8 GB (timing floor) and 20 GB (alarm), 0 = off, junk = default', () => {
  assert.equal(D.timingMinGb({}), 8);
  assert.equal(D.timingMinGb({ FW_TIMING_MIN_FREE_GB: '0' }), 0);
  assert.equal(D.timingMinGb({ FW_TIMING_MIN_FREE_GB: 'x' }), 8);
  assert.equal(D.timingMinGb({ FW_TIMING_MIN_FREE_GB: '-1' }), 8);
  assert.equal(D.alarmGb({}), 20);
  assert.equal(D.alarmGb({ FW_SPACE_ALARM_GB: '12.5' }), 12.5);
});

test('diskFree: the real volume, or the fake reading for tests', () => {
  const r = D.diskFree(state, {});
  assert.ok(r.totalBytes > 0 && r.freeBytes >= 0 && r.fake === false);
  const f = D.diskFree(state, { FW_DISK_FREE_GB: '2.5' });
  assert.deepEqual([f.freeBytes, f.fake], [2.5 * D.GiB, true]);
  assert.equal(D.diskFree(join(state, 'nope', 'x'), {}), null);
});

test('timingDiskRefusal: under the floor says DISK-LOW with the report command; at or over it, or off, null', () => {
  assert.equal(D.timingDiskRefusal(state, { FW_TIMING_MIN_FREE_GB: '8', FW_DISK_FREE_GB: '8' }), null);
  assert.equal(D.timingDiskRefusal(state, { FW_TIMING_MIN_FREE_GB: '0', FW_DISK_FREE_GB: '1' }), null);
  const m = D.timingDiskRefusal(state, { FW_TIMING_MIN_FREE_GB: '8', FW_DISK_FREE_GB: '3' });
  assert.match(m, /^DISK-LOW: only 3\.0 GB free on this disk \(under 8 GB\): no new timing hold starts/);
  // the lead's ruling: the refusal says how to free space (report, prune --apply, the folder owners)
  assert.match(m, /-- node tools\/space\.mjs prune, then the same with prune --apply/);
  assert.match(m, /node tools\/space\.mjs report \(sections 5-6\), and ask those owners/);
  assert.match(m, /Shared, short and --no-timing holds and phone runs still run/);
});

test('a new timing hold of chrome-measure is refused on a nearly full disk, and its queue entry goes (I-124)', async () => {
  low();
  await assert.rejects(L.tryAcquire(CM, { owner: 'ab-a', kind: 'lease', ttlSec: 60 }), /^Error: \[lock chrome-measure\] DISK-LOW: only 3\.0 GB free/);
  assert.equal(L.status(CM).holder, null);
  // queued behind a holder: the next attempt refuses and drops the entry, so the queue moves on
  process.env.FW_DISK_FREE_GB = '50';
  assert.equal((await L.tryAcquire(CM, { owner: 'build', kind: 'lease', ttlSec: 60, noTiming: true })).ok, true);
  const q1 = await L.tryAcquire(CM, { owner: 'ab-b', kind: 'lease', ttlSec: 60 });
  assert.equal(q1.ok, false);
  assert.deepEqual(queue().map((w) => w.owner), ['ab-b']);
  process.env.FW_DISK_FREE_GB = '3';
  await assert.rejects(L.tryAcquire(CM, { owner: 'ab-b', kind: 'lease', ttlSec: 60 }), /DISK-LOW/);
  assert.deepEqual(queue(), []);
});

test('on a nearly full disk, shared, short and --no-timing holds and re-entries still run; floor 0 = off', async () => {
  low();
  const nt = await L.tryAcquire(CM, { owner: 'build', kind: 'lease', ttlSec: 60, noTiming: true });
  assert.equal(nt.ok, true, 'a --no-timing hold');
  assert.equal((await L.tryAcquire(CM, { owner: 'build', kind: 'lease', ttlSec: 60, noTiming: true })).reentrant, true, 'its own renewal');
  assert.equal((await L.release(CM, { owner: 'build' })).released ?? true, true);
  const sh = await L.tryAcquire(CM, { owner: 'tests', kind: 'lease', short: true, maxSec: 60 });
  assert.equal(sh.ok, true, 'a short job');
  await L.release(CM, { owner: 'tests' });
  // a timing hold granted while there was room is re-entered by the tools in it (FW_LOCK_HELD)
  process.env.FW_DISK_FREE_GB = '50';
  const t = await L.tryAcquire(CM, { owner: 'ab', kind: 'lease', ttlSec: 60 });
  assert.equal(t.ok, true);
  process.env.FW_DISK_FREE_GB = '3';
  const inner = await L.tryAcquire(CM, { owner: 'verify', kind: 'process', held: `${CM}:${t.holder.token}` });
  assert.deepEqual([inner.ok, inner.inherited], [true, true]);
  assert.equal((await L.tryAcquire(CM, { owner: 'ab', kind: 'lease', ttlSec: 60 })).reentrant, true, 'the holder renews its own lease');
  await L.release(CM, { owner: 'ab' });
  process.env.FW_TIMING_MIN_FREE_GB = '0';
  assert.equal((await L.tryAcquire(CM, { owner: 'ab2', kind: 'lease', ttlSec: 60 })).ok, true, 'floor off');
  await L.release(CM, { owner: 'ab2' });
});

test('a phone run (a run wrapping iphone.mjs scroll|record|run|gesture) is never refused for disk space', async () => {
  for (const c of [['node', 'tools/iphone.mjs', 'scroll', '--owner', 'x'], 'sh -c "node tools/iphone.mjs record --seconds 25"', ['node', '/abs/tools/iphone.mjs', 'gesture'], 'iphone.mjs run x']) assert.equal(D.wrapsPhoneRun(c), true, String(c));
  for (const c of [['node', 'tools/iphone.mjs', 'open', 'u'], ['node', 'tools/fix.mjs', 'ab', 't'], 'sim.mjs session', '']) assert.equal(D.wrapsPhoneRun(c), false, String(c));
  low();
  assert.equal((await L.tryAcquire(CM, { owner: 'phone', kind: 'lease', ttlSec: 60, meta: { phoneRun: true } })).ok, true);
  await L.release(CM, { owner: 'phone' });
  await assert.rejects(L.tryAcquire(CM, { owner: 'ab', kind: 'lease', ttlSec: 60, meta: { phoneRun: false } }), /DISK-LOW/);
});

test('other resources (the iPhone lease) are never refused for disk space', async () => {
  low('0.5');
  assert.equal((await L.tryAcquire('iphone', { owner: 'p', kind: 'lease', ttlSec: 60 })).ok, true);
});
