// Phone hold v2 T2 (incident I-168, research/architecture/phone-hold-v2.md section 4.1): agents hold the iPhone only
// while a command runs (`lock.mjs run iphone`, a process hold), with an optional keep window after it for the same
// owner's next part; `acquire iphone` (a lease) is for the user's own test, the lead, and --not-ready queueing. The
// library side: the keep window (keepHold, the take-over by the same owner's next process hold, expiry), renew on a
// process hold, the acquire policy, who holds the phone for a phone tool (owner or the FW_LOCK_HELD token), and the
// run / cooling marks the ledger counts. Every test uses its own $FW_STATE_DIR (never the live .git/fastwork-mirror/).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const L = await import('../../tools/lib/lock.mjs');

let state;
beforeEach(() => { state = tempDir('fw-phone-hold-'); process.env.FW_STATE_DIR = state; });
const holderFile = () => JSON.parse(readFileSync(join(state, 'locks', 'iphone.json'), 'utf8'));
const ledger = () => {
  const f = join(state, 'locks', 'holds.log');
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.resource === 'iphone') : [];
};
const proc = (owner, extra = {}) => L.tryAcquire('iphone', { owner, kind: 'process', pid: process.pid, ...extra });

test('I-168 keep: after its command, a process hold becomes a keep lease for the same owner; others wait; the owner\'s next process hold takes it over (same token)', async () => {
  const now = Date.now();
  const a = await proc('fix-x', { meta: { expectSec: 900 } });
  assert.equal(a.ok, true);
  const tok = a.holder.token;
  assert.equal(await L.keepHold('iphone', { token: 'not-the-token', keepSec: 120, now }), null, 'only the hold itself');
  const k = await L.keepHold('iphone', { token: tok, keepSec: 120, now });
  assert.equal(k.kind, 'lease');
  assert.equal(k.pid, undefined);
  assert.equal(k.keep.sec, 120);
  assert.equal(k.expiresAt, new Date(now + 120000).toISOString());
  assert.equal(k.keep.until, k.expiresAt);
  // another owner (a user's hand test too) waits
  const u = await L.tryAcquire('iphone', { owner: 'user-try', kind: 'lease', ttlSec: 900 });
  assert.equal(u.ok, false);
  assert.equal(u.holder.owner, 'fix-x');
  // the same owner's next process hold continues the hold: same token, a process again, no keep, a new part
  const b = await proc('fix-x', { meta: { expectSec: 600 } });
  assert.equal(b.ok, true);
  assert.equal(b.reentrant, undefined, 'a take-over, not a re-entry: this process releases it at its end');
  assert.equal(b.resumed, true);
  const h = holderFile();
  assert.equal(h.token, tok);
  assert.equal(h.kind, 'process');
  assert.equal(h.pid, process.pid);
  assert.equal(h.keep, undefined);
  assert.equal(h.expiresAt, undefined);
  assert.equal(h.meta.expectSec, 600);
  assert.ok(Date.parse(h.partAt) >= now, 'the OVERDUE clock restarts with the new part');
  assert.equal(h.keeps, 1);
  assert.equal(ledger().length, 0, 'still one hold: no line yet');
  await L.release('iphone', { owner: 'fix-x' });
  const l = ledger();
  assert.equal(l.length, 1);
  assert.equal(l[0].kind, 'process');
  assert.equal(l[0].token, tok);
});

test('I-168 keep: a keep window that runs out frees the phone for the next waiter; its ledger line ends at the keep\'s end (kind keep); the owner\'s next part is a new hold', async () => {
  const a = await proc('fix-x');
  const t0 = Date.now();
  await L.keepHold('iphone', { token: a.holder.token, keepSec: 2, now: t0 });
  const u = await L.tryAcquire('iphone', { owner: 'user-try', kind: 'lease', ttlSec: 900, now: t0 + 3000 });
  assert.equal(u.ok, true, JSON.stringify(u));
  const l = ledger();
  assert.equal(l.length, 1);
  assert.equal(l[0].kind, 'keep');
  assert.equal(l[0].owner, 'fix-x');
  assert.equal(l[0].endedAt, new Date(t0 + 2000).toISOString());
  assert.match(l[0].how, /^keep ended/);
  await L.release('iphone', { owner: 'user-try' });
  const b = await proc('fix-x');
  assert.equal(b.ok, true);
  assert.notEqual(b.holder.token, a.holder.token);
  assert.equal(b.resumed, undefined);
});

test('I-168 keep: keepHold refuses a lease, another process\'s hold and a hold already gone', async () => {
  const lease = await L.tryAcquire('iphone', { owner: 'user-try', kind: 'lease', ttlSec: 900 });
  assert.equal(await L.keepHold('iphone', { token: lease.holder.token, keepSec: 60 }), null, 'a lease is no process hold');
  await L.release('iphone', { owner: 'user-try' });
  assert.equal(await L.keepHold('iphone', { token: lease.holder.token, keepSec: 60 }), null, 'gone');
  const a = await proc('fix-x');
  assert.equal(await L.keepHold('iphone', { token: a.holder.token, pid: process.pid + 1, keepSec: 60 }), null, 'another process');
  assert.equal(holderFile().kind, 'process');
});

test('I-168: renew on a process hold changes nothing (it ends with its process; an expiry would make a live hold stale)', async () => {
  await proc('fix-x');
  const r = await L.renew('iphone', { owner: 'fix-x', ttlSec: 900, noShorten: true });
  assert.equal(r.kept, true);
  assert.equal(holderFile().expiresAt, undefined);
  const r2 = await L.renew('iphone', { owner: 'fix-x', ttlSec: 60 });
  assert.equal(r2.kept, true);
  assert.equal(holderFile().expiresAt, undefined);
  assert.equal(L.staleReason(holderFile()), null);
});

test('I-168 policy: an agent\'s acquire iphone is refused with the run form; the user\'s hand test, the lead with a reason and --not-ready queueing pass', () => {
  const m = L.phoneAcquireRefusal({ owner: 'fix-x' });
  assert.match(m, /node tools\/lock\.mjs run iphone --owner fix-x .*-- <phone part>/);
  assert.match(m, /I-168/);
  assert.equal(L.phoneAcquireRefusal({ owner: 'user-try' }), null);
  assert.equal(L.phoneAcquireRefusal({ owner: 'user' }), null);
  assert.equal(L.phoneAcquireRefusal({ owner: 'fix-x', notReady: true }), null);
  assert.equal(L.phoneAcquireRefusal({ owner: 'fix-x', lead: true, reason: 'repair: hand the phone to a step runner' }), null);
  assert.match(L.phoneAcquireRefusal({ owner: 'fix-x', lead: true }), /--lead needs --reason/);
  assert.match(L.phoneAcquireRefusal({ owner: 'fix-x', lead: true, reason: '  ' }), /--lead needs --reason/);
  assert.match(L.phoneAcquireRefusal({ owner: 'userx' }), /run iphone/, 'only user and user-* are the user');
  assert.equal(L.PHONE_HOLD.maxSec, 900);
  assert.equal(L.PHONE_HOLD.blockMaxSec, 3600);
  assert.equal(L.PHONE_HOLD.keepMaxSec, 180);
});

test('I-168 phoneHolder: the token of the live hold in FW_LOCK_HELD names its owner (no --owner needed); else the owner must hold it; refusals name the run form', async () => {
  assert.throws(() => L.phoneHolder({ owner: undefined, env: {} }), (e) => e.usage === true && /--owner <topic> is required/.test(e.message));
  assert.throws(() => L.phoneHolder({ owner: 'me', env: {} }), /you \("me"\) don't hold the iphone lease\. Run: node tools\/lock\.mjs run iphone --owner me -- /);
  const a = await proc('me');
  assert.equal(L.phoneHolder({ owner: 'me', env: {} }), 'me');
  assert.equal(L.phoneHolder({ owner: undefined, env: { FW_LOCK_HELD: `iphone:${a.holder.token}` } }), 'me');
  assert.equal(L.phoneHolder({ owner: 'other', env: { FW_LOCK_HELD: `chrome-measure:abc,iphone:${a.holder.token}` } }), 'me', 'inside the hold: the hold\'s owner');
  assert.throws(() => L.phoneHolder({ owner: 'other', env: { FW_LOCK_HELD: 'iphone:0123456789ab' } }), /\(holder: "me"\)/);
  assert.equal(L.heldPhoneOwner({ owner: 'other', env: {} }), null, 'the non-throwing form');
  assert.equal(L.heldPhoneOwner({ owner: 'me', env: {} }), 'me');
});

test('I-168 marks: the run iphone wrapper\'s own marker (hold: true) is no use for the ledger; a cooling wait is, and keeps a phone block\'s between-holds window', async () => {
  await proc('fix-x');
  await L.describeHold('iphone', { owner: 'fix-x', run: { text: 'run iphone wrapper', since: new Date().toISOString(), pid: process.pid, lockRun: true, hold: true }, runPid: process.pid });
  assert.deepEqual(holderFile().uses ?? [], []);
  await L.describeHold('iphone', { owner: 'fix-x', run: null, runPid: process.pid });
  await L.describeHold('iphone', { owner: 'fix-x', block: 'P-1', betweenMin: 5 });
  await L.describeHold('iphone', { owner: 'fix-x', run: { text: 'cooling: wait.mjs phone-temp', since: new Date().toISOString(), pid: process.pid, cooling: true }, runPid: process.pid });
  const h = holderFile();
  assert.equal(h.uses.length, 1);
  assert.equal(h.uses[0].k, 'cooling');
  assert.ok(h.meta.between, 'a cooling wait leaves the between-holds window open');
  assert.ok(h.lastRunAt, 'a cooling wait is use for the idle alarm too');
});
