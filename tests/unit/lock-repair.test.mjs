// tools/lib/lock-repair.mjs (incident I-012): doctor finds each broken invariant of the lock files, repair
// is a dry run by default, --apply fixes only what doctor lists under the lock's guard, writes an audit
// line per change, never removes a live holder unless forced (and never the live iphone lease), and does
// not corrupt state while another process acquires and releases. Every test has its own $FW_STATE_DIR.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, utimesSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tempDir, tool, sleep } from '../helpers.mjs';

const L = await import('../../tools/lib/lock.mjs');
const X = await import('../../tools/lib/lock-repair.mjs');
const R = 'test-res';
let state;
beforeEach(() => { state = tempDir('fw-lockfix-'); process.env.FW_STATE_DIR = state; mkdirSync(join(state, 'locks'), { recursive: true }); });
const lf = (f) => join(state, 'locks', f);
const put = (f, v) => writeFileSync(lf(f), typeof v === 'string' ? v : JSON.stringify(v));
const get = (f) => JSON.parse(readFileSync(lf(f), 'utf8'));
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const codes = (r = R) => X.doctor(r)[0].problems.map((p) => p.code).sort();
const auditLines = () => (existsSync(lf('audit.log')) ? readFileSync(lf('audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
/** Every file in the lock dir with its bytes (dirs as "<dir>"), to prove a dry run changed nothing. */
function snapshot() {
  const o = {};
  for (const n of readdirSync(lf('')).sort()) { const p = lf(n); o[n] = statSync(p).isDirectory() ? `<dir ${statSync(p).mtimeMs}>` : readFileSync(p, 'latin1'); }
  return o;
}
/** A holder as a client on pre-25391a2 lock code wrote it: holder record only, last-grant untouched (I-011). */
const oldClientHolder = (owner, extra = {}) => put(`${R}.json`, { resource: R, owner, kind: 'lease', token: 'abcdef012345', checkout: '/x', host: 'h', acquiredAt: new Date().toISOString(), meta: {}, ...extra });

test('a state written by the current lock code is clean', async () => {
  await L.tryAcquire(R, { owner: 'a', kind: 'process' });
  await L.tryAcquire(R, { owner: 'b', kind: 'lease' });
  await L.tryAcquire(R, { owner: 'c', kind: 'lease', short: true, maxSec: 60 });
  const [d] = X.doctor(R);
  assert.deepEqual(d.problems, []);
  assert.equal(d.holder.owner, 'a');
  assert.equal(d.holderLive, true);
  await L.release(R, { owner: 'a' });
  assert.deepEqual(codes(), []);
  assert.deepEqual(X.doctor('never-used')[0].problems, [], 'no files at all is clean');
});

test('doctor: stale holders (dead pid, expired lease)', () => {
  put(`${R}.json`, { resource: R, owner: 'crashed', kind: 'process', pid: deadPid(), token: 't1', acquiredAt: ago(5) });
  let [d] = X.doctor(R);
  assert.deepEqual(d.problems.map((p) => p.code), ['holder-stale']);
  assert.match(d.problems[0].message, /"crashed".*pid \d+ is gone/);
  assert.equal(d.holder, null);
  put(`${R}.json`, { resource: R, owner: 'old', kind: 'lease', token: 't2', acquiredAt: ago(100), expiresAt: ago(1) });
  [d] = X.doctor(R);
  assert.deepEqual(d.problems.map((p) => p.code), ['holder-stale']);
  assert.match(d.problems[0].message, /expired at/);
});

test('doctor: unparsable holder, queue and last-grant files', () => {
  put(`${R}.json`, '{"owner": "a", trunc');
  put(`${R}.queue.json`, '{"not": "an array"}');
  put(`${R}.last-grant.json`, 'garbage');
  assert.deepEqual(codes(), ['holder-unparsable', 'last-grant-unparsable', 'queue-unparsable']);
  put(`${R}.json`, { owner: 'no-acquiredAt' });
  assert.ok(codes().includes('holder-unparsable'), 'a record without acquiredAt is not a holder');
});

test('doctor: queue entries that are stale, dead, malformed or duplicated', () => {
  const now = new Date().toISOString();
  put(`${R}.queue.json`, [
    { owner: 'ok', kind: 'lease', since: now, lastSeen: now },
    { owner: 'gone', kind: 'lease', since: ago(700), lastSeen: ago(700) },
    { owner: 'short-gone', kind: 'lease', since: ago(90), lastSeen: ago(90), queueTtlSec: 60, short: true, maxSec: 60 },
    { owner: 'dead', kind: 'process', pid: deadPid(), since: now, lastSeen: now },
    { kind: 'lease', lastSeen: now },
    { owner: 'ok', kind: 'lease', since: now, lastSeen: now },
  ]);
  const ps = X.doctor(R)[0].problems;
  assert.deepEqual(ps.map((p) => p.code), ['queue-stale-entry', 'queue-stale-entry', 'queue-stale-entry', 'queue-bad-entry', 'queue-duplicate']);
  assert.deepEqual(ps.slice(0, 3).map((p) => p.before.owner), ['gone', 'short-gone', 'dead']);
  assert.match(ps[2].message, /pid \d+, which is gone/);
});

test('doctor: last grant missing or not matching the live holder (I-011)', async () => {
  oldClientHolder('normal-old-client');
  let ps = X.doctor(R)[0].problems;
  assert.deepEqual(ps.map((p) => p.code), ['last-grant-missing']);
  assert.equal(ps[0].after.owner, 'normal-old-client');

  // a short job granted by new code, then a normal job granted by old code: the record still says short
  put(`${R}.last-grant.json`, { owner: 'ts-x', short: true, at: ago(30) });
  ps = X.doctor(R)[0].problems;
  assert.deepEqual(ps.map((p) => p.code), ['last-grant-mismatch']);
  assert.match(ps[0].message, /records "ts-x" \(short.*holder is "normal-old-client" \(normal\)/);
  assert.deepEqual(ps[0].after, { owner: 'normal-old-client', short: false, at: get(`${R}.json`).acquiredAt, token: 'abcdef012345' });

  // same owner, but an earlier grant than the holder's
  put(`${R}.last-grant.json`, { owner: 'normal-old-client', short: false, at: ago(3600) });
  assert.deepEqual(codes(), ['last-grant-mismatch']);
  // token-bearing records compare by token
  put(`${R}.last-grant.json`, { owner: 'normal-old-client', short: false, at: get(`${R}.json`).acquiredAt, token: '000000000000' });
  assert.deepEqual(codes(), ['last-grant-mismatch']);
  put(`${R}.last-grant.json`, X.grantOf(get(`${R}.json`)));
  assert.deepEqual(codes(), []);
});

test('doctor: a short last grant with no holder, older than the hold could run', () => {
  put(`${R}.last-grant.json`, { owner: 'npm-test', short: true, maxSec: 120, at: ago(100) });
  assert.deepEqual(codes(), [], 'still within maxSec + grace');
  put(`${R}.last-grant.json`, { owner: 'npm-test', short: true, maxSec: 120, at: ago(600) });
  assert.deepEqual(codes(), ['last-grant-short-outlived']);
  put(`${R}.last-grant.json`, { owner: 'ab', short: false, at: ago(6000) });
  assert.deepEqual(codes(), [], 'an old normal record is fine');
});

test('doctor: leftover guard dir and tmp files', () => {
  mkdirSync(lf(`${R}.guard`));
  assert.deepEqual(codes(), [], 'a fresh guard is someone in the critical section');
  const t = new Date(Date.now() - 30000);
  utimesSync(lf(`${R}.guard`), t, t);
  put(`${R}.queue.json.123.abcdef.tmp`, '[]');
  utimesSync(lf(`${R}.queue.json.123.abcdef.tmp`), new Date(Date.now() - 120000), new Date(Date.now() - 120000));
  put(`${R}.json.456.fedcba.tmp`, '{}'); // fresh: a writer between write and rename
  put(`other-res.json.1.aaaaaa.tmp`, '{}');
  utimesSync(lf(`other-res.json.1.aaaaaa.tmp`), t, t);
  const ps = X.doctor(R)[0].problems;
  assert.deepEqual(ps.map((p) => [p.code, p.file]), [['guard-leftover', `${R}.guard`], ['tmp-leftover', `${R}.queue.json.123.abcdef.tmp`]]);
  assert.equal(X.doctor(R, { guardAgeSec: 60 })[0].problems.filter((p) => p.code === 'guard-leftover').length, 0);
  assert.ok(X.doctor().map((d) => d.resource).includes('test-res'), 'doctor() with no resource covers every resource with state');
});

test('repair dry run changes nothing (byte-identical files, no audit log)', async () => {
  put(`${R}.json`, { resource: R, owner: 'crashed', kind: 'process', pid: deadPid(), token: 't1', acquiredAt: ago(5) });
  put(`${R}.queue.json`, [{ owner: 'gone', kind: 'lease', since: ago(700), lastSeen: ago(700) }]);
  put(`${R}.last-grant.json`, 'garbage');
  mkdirSync(lf(`${R}.guard`));
  const t = new Date(Date.now() - 30000);
  utimesSync(lf(`${R}.guard`), t, t);
  const before = snapshot();
  const d = await X.repair(R, {});
  assert.equal(d.applied, false);
  assert.deepEqual(d.problems.map((p) => p.code).sort(), ['guard-leftover', 'holder-stale', 'last-grant-unparsable', 'queue-stale-entry']);
  const d2 = await X.repair(R, { by: 'lead', reason: 'look only' });
  assert.equal(d2.applied, false);
  assert.deepEqual(snapshot(), before);
  assert.equal(existsSync(lf('audit.log')), false);
});

test('repair --apply fixes the I-011 case (old client wrote the holder, not the last grant) and audits it', async () => {
  // new code: a short npm test ran and released -> last grant short
  await L.tryAcquire(R, { owner: 'ts-x', kind: 'lease', short: true, maxSec: 120 });
  // (I-081: the record outlives the short hold only while someone is queued: the normal waiter queues during it)
  assert.equal((await L.tryAcquire(R, { owner: 'normal-waiter', kind: 'lease' })).ok, false);
  await L.release(R, { owner: 'ts-x' });
  assert.equal(get(`${R}.last-grant.json`).short, true);
  // old code: a normal A/B takes the lock by plain FIFO and does not write last-grant.json
  oldClientHolder('ab-old-client');
  // (no acquire attempt by new code yet: since I-011's fix, the next tryAcquire records the grant itself)
  assert.deepEqual(codes(), ['last-grant-mismatch']);

  await assert.rejects(X.repair(R, { apply: true, by: 'lead' }), /needs --by <who> and --reason/);
  const d = await X.repair(R, { apply: true, by: 'lead', reason: 'I-011: stale short last-grant' });
  assert.equal(d.applied, true);
  assert.deepEqual(d.problems.map((p) => p.code), ['last-grant-mismatch']);
  const holder = get(`${R}.json`);
  assert.equal(holder.owner, 'ab-old-client', 'the live holder is untouched');
  assert.deepEqual(get(`${R}.last-grant.json`), { owner: 'ab-old-client', short: false, at: holder.acquiredAt, token: holder.token });
  await L.tryAcquire(R, { owner: 'normal-waiter', kind: 'lease' });
  await L.tryAcquire(R, { owner: 'short-waiter', kind: 'lease', short: true, maxSec: 120 });
  assert.equal(L.status(R).next, 'short-waiter', 'after a normal grant the short lane is served next again');
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['normal-waiter', 'short-waiter'], 'queue untouched');
  assert.deepEqual(codes(), []);
  assert.equal(existsSync(lf(`${R}.guard`)), false, 'guard released');

  const lines = auditLines();
  assert.equal(lines.length, 1);
  const a = lines[0];
  assert.deepEqual(Object.keys(a).sort(), ['after', 'before', 'by', 'code', 'file', 'fix', 'reason', 'resource', 'ts']);
  assert.equal(a.by, 'lead');
  assert.equal(a.reason, 'I-011: stale short last-grant');
  assert.equal(a.file, `${R}.last-grant.json`);
  assert.equal(a.before.short, true);
  assert.equal(a.after.owner, 'ab-old-client');
  assert.ok(Math.abs(Date.parse(a.ts) - Date.now()) < 10000);

  // nothing left to do: apply is a no-op and logs nothing
  const again = await X.repair(R, { apply: true, by: 'lead', reason: 'again' });
  assert.deepEqual(again.problems, []);
  assert.equal(auditLines().length, 1);
});

test('repair --apply fixes every other invariant, atomically, one audit line per change', async () => {
  const pid = deadPid();
  put(`${R}.json`, { resource: R, owner: 'crashed', kind: 'process', pid, token: 't1', acquiredAt: ago(5) });
  const now = new Date().toISOString();
  put(`${R}.queue.json`, [
    { owner: 'keep', kind: 'lease', since: now, lastSeen: now },
    { owner: 'gone', kind: 'lease', since: ago(700), lastSeen: ago(700) },
    { owner: 'keep', kind: 'lease', since: now, lastSeen: now },
  ]);
  put(`${R}.last-grant.json`, { owner: 'npm', short: true, maxSec: 60, at: ago(3600) });
  mkdirSync(lf(`${R}.guard`));
  const t = new Date(Date.now() - 30000);
  utimesSync(lf(`${R}.guard`), t, t);
  put(`${R}.json.9.abcdef.tmp`, 'x');
  utimesSync(lf(`${R}.json.9.abcdef.tmp`), new Date(Date.now() - 120000), new Date(Date.now() - 120000));

  const d = await X.repair(R, { apply: true, by: 'lead', reason: 'cleanup' });
  assert.deepEqual(d.problems.map((p) => p.code).sort(), ['guard-leftover', 'holder-stale', 'last-grant-short-outlived', 'queue-duplicate', 'queue-stale-entry', 'tmp-leftover']);
  assert.equal(existsSync(lf(`${R}.json`)), false);
  assert.equal(get(`${R}.last-stale.json`).owner, 'crashed');
  assert.match(get(`${R}.last-stale.json`).clearedBy, /repair \(lead\)/);
  assert.deepEqual(get(`${R}.queue.json`).map((w) => w.owner), ['keep']);
  assert.equal(existsSync(lf(`${R}.last-grant.json`)), false);
  assert.equal(existsSync(lf(`${R}.guard`)), false);
  assert.deepEqual(readdirSync(lf('')).filter((n) => n.endsWith('.tmp')), [], 'no temp files left behind');
  assert.equal(auditLines().length, 6);
  assert.deepEqual(codes(), []);

  // corrupt files are moved aside, never deleted
  put(`${R}.queue.json`, 'garbage');
  await X.repair(R, { apply: true, by: 'lead', reason: 'corrupt queue' });
  const aside = readdirSync(lf('')).filter((n) => n.startsWith(`${R}.queue.json.corrupt-`));
  assert.equal(aside.length, 1);
  assert.equal(readFileSync(lf(aside[0]), 'utf8'), 'garbage');
  assert.equal(auditLines().at(-1).before, 'garbage');
  assert.deepEqual(codes(), []);
});

test('a live holder is never removed without --force-holder, and the live iphone lease never', async () => {
  await L.tryAcquire(R, { owner: 'live', kind: 'process' });
  put(`${R}.queue.json`, [{ owner: 'gone', kind: 'lease', since: ago(700), lastSeen: ago(700) }]);
  const d = await X.repair(R, { apply: true, by: 'lead', reason: 'queue' });
  assert.deepEqual(d.problems.map((p) => p.code), ['queue-stale-entry']);
  assert.equal(get(`${R}.json`).owner, 'live');

  // forced: removed, recorded, audited with the holder as "before"
  const f = await X.repair(R, { apply: true, by: 'lead', reason: 'holder hung', forceHolder: true });
  assert.deepEqual(f.problems.map((p) => p.code), ['holder-live-forced']);
  assert.match(f.problems[0].message, /"live".*is LIVE/);
  assert.equal(existsSync(lf(`${R}.json`)), false);
  assert.equal(auditLines().at(-1).before.owner, 'live');

  // the iphone lease of a live holder: refused even with --force-holder, dry run or apply
  const ok = await L.tryAcquire('iphone', { owner: 'phone-topic', kind: 'lease', ttlSec: 900 });
  assert.equal(ok.ok, true);
  const bytes = readFileSync(lf('iphone.json'), 'latin1');
  await assert.rejects(X.repair('iphone', { forceHolder: true }), /refusing to touch the iphone lease of a live holder.*phone-topic/);
  await assert.rejects(X.repair('iphone', { apply: true, by: 'lead', reason: 'x', forceHolder: true }), /refusing.*phone-topic/);
  assert.equal(readFileSync(lf('iphone.json'), 'latin1'), bytes);
  // an expired iphone lease is just stale and is cleaned like any other
  put('iphone.json', { ...JSON.parse(bytes), expiresAt: ago(1) });
  const s = await X.repair('iphone', { apply: true, by: 'lead', reason: 'expired' });
  assert.deepEqual(s.problems.map((p) => p.code), ['holder-stale']);
  assert.equal(existsSync(lf('iphone.json')), false);
});

test('repair --apply while another process acquires and releases does not corrupt the state', async () => {
  const lib = pathToFileURL(tool('lib/lock.mjs')).href;
  const holderPath = lf(`${R}.json`);
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { readFileSync } from 'node:fs';
    const L = await import(${JSON.stringify(lib)});
    let held = 0, bad = 0;
    const end = Date.now() + 2500;
    while (Date.now() < end) {
      const r = await L.tryAcquire(${JSON.stringify(R)}, { owner: 'child', kind: 'process' });
      if (!r.ok) continue;
      held++;
      await new Promise((s) => setTimeout(s, 3));
      try { if (JSON.parse(readFileSync(${JSON.stringify(holderPath)}, 'utf8')).token !== r.holder.token) bad++; } catch { bad++; }
      await L.release(${JSON.stringify(R)}, { owner: 'child' });
    }
    console.log(JSON.stringify({ held, bad }));
  `], { env: { ...process.env, FW_STATE_DIR: state }, stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  const exited = new Promise((r) => child.on('exit', r));
  let running = true;
  exited.then(() => (running = false));
  const pid = deadPid();
  let repairs = 0;
  for (let i = 0; running; i++) {
    // crashed clients: a dead-pid holder when free, a dead-pid queue entry when busy
    await L.tryAcquire(R, { owner: `ghost-${i}`, kind: 'process', pid });
    const d = await X.repair(R, { apply: true, by: 'test', reason: 'race' });
    repairs += d.problems.length ? 1 : 0;
    await sleep(1);
  }
  assert.equal(await exited, 0);
  const res = JSON.parse(out);
  assert.ok(res.held > 10, out);
  assert.equal(res.bad, 0, 'repair never removed or rewrote the live holder');
  assert.ok(repairs > 0, 'repair had work to do during the race');
  await X.repair(R, { apply: true, by: 'test', reason: 'final' });
  assert.deepEqual(codes(), []);
  for (const n of readdirSync(lf(''))) {
    assert.doesNotMatch(n, /\.tmp$|\.guard$|\.corrupt-/, `leftover ${n}`);
    if (n.endsWith('.json')) JSON.parse(readFileSync(lf(n), 'utf8'));
  }
  const lines = auditLines();
  assert.ok(lines.length > 0);
  assert.ok(lines.every((l) => !(l.before && l.before.owner === 'child' && /^holder/.test(l.code))), 'the live child holder was never removed');
});

// ---- queue reorder by the lead (incident I-019) -------------------------------------------------------
/** A holder "h" and waiters queued in the given order by the real lock code. */
async function queueOf(...owners) {
  assert.equal((await L.tryAcquire(R, { owner: 'h', kind: 'lease' })).ok, true);
  for (const o of owners) assert.equal((await L.tryAcquire(R, { owner: o, kind: 'lease' })).ok, false);
}
const order = () => L.status(R).queue.map((w) => w.owner);

test('move (I-019): a waiter moves up and down, keeps its since, records movedBy/movedAt, one audit line', async () => {
  await queueOf('a', 'b', 'c', 'd');
  const since = Object.fromEntries(L.status(R).queue.map((w) => [w.owner, w.since]));
  const up = await X.moveWaiter(R, { owner: 'd', to: 1, by: 'lead', reason: 'E1 is priority 1', apply: true });
  assert.equal(up.applied, true);
  assert.equal(up.from, 4);
  assert.equal(up.to, 1);
  assert.deepEqual(up.before.map((w) => w.owner), ['a', 'b', 'c', 'd']);
  assert.deepEqual(up.after.map((w) => w.owner), ['d', 'a', 'b', 'c']);
  assert.deepEqual(order(), ['d', 'a', 'b', 'c']);
  const d = L.status(R).queue[0];
  assert.equal(d.since, since.d, 'since is kept: waiting-time KPIs stay honest');
  assert.equal(d.movedBy, 'lead');
  assert.ok(Math.abs(Date.parse(d.movedAt) - Date.now()) < 5000);
  assert.equal(L.status(R).holder.owner, 'h', 'the holder is untouched');
  const lines = auditLines();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].code, 'queue-move');
  assert.equal(lines[0].by, 'lead');
  assert.equal(lines[0].reason, 'E1 is priority 1');
  assert.equal(lines[0].resource, R);
  assert.equal(lines[0].owner, 'd');
  assert.equal(lines[0].from, 4);
  assert.equal(lines[0].to, 1);
  assert.deepEqual(lines[0].before, ['a', 'b', 'c', 'd']);
  assert.deepEqual(lines[0].after, ['d', 'a', 'b', 'c']);

  await X.moveWaiter(R, { owner: 'a', to: 4, by: 'lead', reason: 'down', apply: true });
  assert.deepEqual(order(), ['d', 'b', 'c', 'a']);
  assert.equal(L.status(R).queue[3].since, since.a);
  assert.equal(auditLines().length, 2);
  await X.moveWaiter(R, { owner: 'c', to: 2, by: 'lead', reason: 'middle', apply: true });
  assert.deepEqual(order(), ['d', 'c', 'b', 'a']);
  assert.deepEqual(codes(), [], 'a moved queue is a consistent state for doctor');
});

test('move (I-019): waiters keep their places when they refresh; the moved one is granted first; nobody loses its entry', async () => {
  await queueOf('a', 'b', 'c');
  await X.moveWaiter(R, { owner: 'c', to: 1, by: 'lead', reason: 'x', apply: true });
  // every waiter polls again (acquire() / `lock.mjs run` / `acquire --wait` retry tryAcquire)
  for (const o of ['a', 'b', 'c']) {
    const r = await L.tryAcquire(R, { owner: o, kind: 'lease' });
    assert.equal(r.ok, false);
    assert.equal(r.position, { c: 1, a: 2, b: 3 }[o]);
  }
  assert.deepEqual(order(), ['c', 'a', 'b']);
  const c = L.status(R).queue[0];
  assert.equal(c.movedBy, 'lead', 'a refresh keeps the move record');
  assert.ok(c.movedAt);
  await L.release(R, { owner: 'h' });
  assert.equal(L.status(R).next, 'c');
  assert.equal((await L.tryAcquire(R, { owner: 'a', kind: 'lease' })).ok, false, 'the old head waits');
  assert.equal((await L.tryAcquire(R, { owner: 'c', kind: 'lease' })).ok, true, 'the moved waiter is granted in its new place');
  assert.deepEqual(order(), ['a', 'b']);
  await L.release(R, { owner: 'c' });
  assert.equal((await L.tryAcquire(R, { owner: 'a', kind: 'lease' })).ok, true);
  assert.deepEqual(order(), ['b']);
});

test('move (I-019): refuses the holder, a non-waiter, a bad position, and --by other than lead; changes nothing', async () => {
  await queueOf('a', 'b');
  const before = snapshot();
  await assert.rejects(X.moveWaiter(R, { owner: 'h', to: 1, by: 'lead', reason: 'x', apply: true }), /"h" holds test-res; --move only reorders waiting entries/);
  await assert.rejects(X.moveWaiter(R, { owner: 'zz', to: 1, by: 'lead', reason: 'x', apply: true }), /"zz" is not waiting for test-res/);
  await assert.rejects(X.moveWaiter(R, { owner: 'b', to: 3, by: 'lead', reason: 'x', apply: true }), /--to must be a position from 1 to 2/);
  await assert.rejects(X.moveWaiter(R, { owner: 'b', to: 0, by: 'lead', reason: 'x', apply: true }), /--to must be a position from 1 to 2/);
  for (const by of ['ts-prio', undefined, 'Lead']) {
    await assert.rejects(X.moveWaiter(R, { owner: 'b', to: 1, by, reason: 'x', apply: true }), /only the lead reorders the queue \(--by lead\)/);
    await assert.rejects(X.moveWaiter(R, { owner: 'b', to: 1, by }), /only the lead/, 'also in a dry run');
  }
  await assert.rejects(X.moveWaiter(R, { owner: 'b', to: 1, by: 'lead', apply: true }), /needs --reason/);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(auditLines(), []);
});

test('move (I-019): the dry run shows before/after and leaves the files byte-identical', async () => {
  await queueOf('a', 'b', 'c');
  const before = snapshot();
  const d = await X.moveWaiter(R, { owner: 'c', to: 1, by: 'lead', reason: 'x' });
  assert.equal(d.applied, false);
  assert.deepEqual(d.before.map((w) => w.owner), ['a', 'b', 'c']);
  assert.deepEqual(d.after.map((w) => w.owner), ['c', 'a', 'b']);
  assert.equal(d.after[0].movedBy, 'lead');
  assert.deepEqual(snapshot(), before);
  assert.ok(!existsSync(lf('audit.log')));
  // I-035: a move to the entry's own position is not "nothing to do" while the entry lacks the lead's mark (see below);
  // once marked, it is
  const same = await X.moveWaiter(R, { owner: 'a', to: 1, by: 'lead', reason: 'x', apply: true });
  assert.deepEqual([same.changed, same.marked, same.applied], [false, true, true]);
  const marked = snapshot();
  const again = await X.moveWaiter(R, { owner: 'a', to: 1, by: 'lead', reason: 'x', apply: true });
  assert.deepEqual([again.changed, again.marked, again.applied], [false, false, false], 'already there and marked: nothing to do');
  assert.deepEqual(snapshot(), marked);
});

test('I-035: a move to the entry\'s own position marks it movedBy lead (one audit line), so short jobs no longer pass it', async () => {
  await queueOf('a');
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60 })).ok, false);
  assert.deepEqual(order(), ['a', 's']);
  const dry = await X.moveWaiter(R, { owner: 'a', to: 1, by: 'lead', reason: 'E1 first' });
  assert.deepEqual([dry.from, dry.to, dry.changed, dry.marked, dry.applied], [1, 1, false, true, false]);
  assert.equal(L.status(R).queue[0].movedBy, undefined, 'the dry run writes nothing');
  const m = await X.moveWaiter(R, { owner: 'a', to: 1, by: 'lead', reason: 'E1 first', apply: true });
  assert.deepEqual([m.from, m.to, m.changed, m.marked, m.applied], [1, 1, false, true, true]);
  assert.match(m.note, /short lane: the lead's move puts "a" ahead of the short jobs behind it \(s\)/);
  const a = L.status(R).queue[0];
  assert.equal(a.movedBy, 'lead', 'the mark is on disk (it was only in the printed "after" line before I-035)');
  assert.ok(Math.abs(Date.parse(a.movedAt) - Date.now()) < 5000);
  assert.deepEqual(order(), ['a', 's'], 'nobody moved');
  const lines = auditLines();
  assert.equal(lines.length, 1);
  assert.deepEqual([lines[0].code, lines[0].owner, lines[0].from, lines[0].to, lines[0].reason], ['queue-move', 'a', 1, 1, 'E1 first']);
  assert.match(lines[0].fix, /mark "a" \(#1\) as moved by lead/);
  await L.release(R, { owner: 'h' });
  assert.equal(L.status(R).next, 'a', 'the lead\'s mark wins over the short lane (I-020)');
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60 })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 'a', kind: 'lease' })).ok, true);
});

test('move (I-019): positions count live waiters only (as status shows them); stale entries stay for the acquirers to prune', async () => {
  const now = new Date().toISOString();
  put(`${R}.json`, { resource: R, owner: 'h', kind: 'lease', token: 'abcdef012345', acquiredAt: now, expiresAt: new Date(Date.now() + 600000).toISOString() });
  put(`${R}.queue.json`, [
    { owner: 'a', kind: 'lease', since: now, lastSeen: now, queueTtlSec: 600 },
    { owner: 'gone', kind: 'lease', since: ago(700), lastSeen: ago(700), queueTtlSec: 600 },
    { owner: 'b', kind: 'lease', since: now, lastSeen: now, queueTtlSec: 600 },
    { owner: 'c', kind: 'lease', since: now, lastSeen: now, queueTtlSec: 600 },
  ]);
  assert.deepEqual(order(), ['a', 'b', 'c']);
  const d = await X.moveWaiter(R, { owner: 'c', to: 2, by: 'lead', reason: 'x', apply: true });
  assert.equal(d.from, 3);
  assert.deepEqual(order(), ['a', 'c', 'b']);
  assert.deepEqual(get(`${R}.queue.json`).map((w) => w.owner), ['a', 'gone', 'c', 'b']);
  await assert.rejects(X.moveWaiter(R, { owner: 'gone', to: 1, by: 'lead', reason: 'x', apply: true }), /"gone" is not waiting/);
});

test('move (I-019/I-020): a normal waiter the lead moves ahead of short jobs is served before them; behind one, the short lane goes first', async () => {
  await queueOf('a', 'b');
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60 })).ok, false);
  const d = await X.moveWaiter(R, { owner: 'b', to: 1, by: 'lead', reason: 'x', apply: true });
  assert.deepEqual(order(), ['b', 'a', 's']);
  assert.match(d.note, /short lane: the lead's move puts "b" ahead of the short jobs behind it \(s\)/);
  await L.release(R, { owner: 'h' });
  assert.equal(L.status(R).next, 'b', 'the lead\'s priority wins over the short lane (I-020)');
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60 })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 'b', kind: 'lease' })).ok, true);
  await L.release(R, { owner: 'b' });
  assert.equal(L.status(R).next, 's', 'then the short lane as usual: s before the unmoved a');
  // moved behind a short job: that short job still goes first
  const e = await X.moveWaiter(R, { owner: 'a', to: 2, by: 'lead', reason: 'y', apply: true });
  assert.deepEqual(order(), ['s', 'a']);
  assert.match(e.note, /short lane: queued short jobs ahead of "a" \(s\) are still served first/);
  assert.equal(L.status(R).next, 's');
});

test('I-081: repair of a stale exclusive short holder (killed without its exit handler) also removes its record unless someone waits', async () => {
  const shortHolder = (pid) => {
    const at = ago(20);
    put(`${R}.json`, { resource: R, owner: 'npm-test', kind: 'process', pid, token: 'a1a1a1a1a1a1', acquiredAt: at, expiresAt: new Date(Date.parse(at) + 125000).toISOString(), short: true, maxSec: 120, meta: {} });
    put(`${R}.last-grant.json`, { owner: 'npm-test', short: true, maxSec: 120, at, token: 'a1a1a1a1a1a1', runStart: at });
  };
  shortHolder(deadPid());
  assert.deepEqual(codes(), ['holder-stale', 'last-grant-short-closed']);
  await X.repair(R, { by: 'lead', reason: 't', apply: true });
  assert.equal(existsSync(lf(`${R}.json`)), false);
  assert.equal(existsSync(lf(`${R}.last-grant.json`)), false);
  assert.deepEqual(X.doctor(R, { now: Date.now() + 200000 })[0].problems, [], 'no last-grant-short-outlived later');
  // someone queued: only the holder goes, the record stays for the drain
  shortHolder(deadPid());
  const now = new Date().toISOString();
  put(`${R}.queue.json`, [{ owner: 's2', kind: 'lease', since: now, lastSeen: now, queueTtlSec: 60, short: true, maxSec: 90 }]);
  assert.deepEqual(codes(), ['holder-stale']);
  await X.repair(R, { by: 'lead', reason: 't', apply: true });
  assert.equal(get(`${R}.last-grant.json`).token, 'a1a1a1a1a1a1');
  // a live short holder removed with --force-holder, nobody queued
  put(`${R}.queue.json`, []);
  shortHolder(process.pid);
  assert.deepEqual(codes(), []);
  assert.deepEqual(X.doctor(R, { forceHolder: true })[0].problems.map((p) => p.code), ['holder-live-forced', 'last-grant-short-closed']);
});

// ---- leave (backlog, the lead 2026-10-03): an owner's waiting entries leave the queue at once, audited -----------
// A waiter whose process stopped (a killed `acquire --wait`, a lease reader nobody retries) lingered until the 30 s /
// 10 min stale rules dropped it (a "ts-i093 shared w2" entry, 2026-10-03 16:0xZ).
test('leave: removes every waiting entry of the owner (exclusive, short, reader; live or stale), keeps the others in order, one audit line', async () => {
  await queueOf('a', 'x', 'b');
  const q = get(`${R}.queue.json`);
  const reader = { owner: 'x', kind: 'process', pid: process.pid, checkout: '/x', since: ago(100), lastSeen: ago(1), queueTtlSec: 60, short: true, maxSec: 60, shared: true, weight: 2 };
  const dead = { ...reader, pid: deadPid(), weight: 1 };
  const stale = { owner: 'x', kind: 'lease', checkout: '/y', since: ago(900), lastSeen: ago(700), queueTtlSec: 600 };
  const moved = q.map((w) => (w.owner === 'b' ? { ...w, movedBy: 'lead', movedAt: ago(5) } : w));
  put(`${R}.queue.json`, [...moved, reader, dead, stale]);
  const h0 = readFileSync(lf(`${R}.json`), 'utf8');
  const out = await X.leaveQueue(R, { owner: 'x', reason: 'stopped waiting' });
  assert.equal(out.owner, 'x');
  assert.equal(out.removed.length, 4, 'both of its entries in the live queue, a dead-pid reader entry and a stale one');
  assert.deepEqual(out.removed.map((e) => !!e.running), [false, true, false, false], 'a process entry whose process still runs is flagged');
  assert.deepEqual(out.removed.map((e) => [e.position, e.live]), [[2, true], [4, true], [null, false], [null, false]]);
  assert.deepEqual(get(`${R}.queue.json`).map((w) => w.owner), ['a', 'b']);
  assert.equal(get(`${R}.queue.json`)[1].movedBy, 'lead', 'the other entries are kept as they were');
  assert.equal(readFileSync(lf(`${R}.json`), 'utf8'), h0, 'the holder is never touched');
  assert.deepEqual(out.after.map((w) => w.owner), ['a', 'b']);
  const lines = auditLines();
  assert.equal(lines.length, 1);
  assert.deepEqual([lines[0].code, lines[0].by, lines[0].reason, lines[0].resource, lines[0].owner], ['queue-leave', 'x', 'stopped waiting', R, 'x']);
  assert.deepEqual(lines[0].before, ['a', 'x', 'b', 'x'], 'the live queue, as status shows it');
  assert.deepEqual(lines[0].after, ['a', 'b']);
  assert.equal(lines[0].removed.length, 4);
  assert.deepEqual(codes(), [], 'doctor finds nothing left behind');
});

test('leave: --by names who removed them (the lead for another agent); a reason is optional', async () => {
  await queueOf('x');
  const out = await X.leaveQueue(R, { owner: 'x', by: 'lead' });
  assert.equal(out.removed.length, 1);
  const [l] = auditLines();
  assert.equal(l.by, 'lead');
  assert.ok(l.reason);
});

test('leave: never a holder: the holder (or a shared reader) keeps its hold; nothing queued writes nothing', async () => {
  await queueOf('a');
  const before = snapshot();
  const h = await X.leaveQueue(R, { owner: 'h' });
  assert.deepEqual(h.removed, []);
  assert.equal(h.holds, true);
  assert.equal(L.status(R).holder.owner, 'h');
  const n = await X.leaveQueue(R, { owner: 'nobody' });
  assert.deepEqual(n.removed, []);
  assert.equal(n.holds, false);
  assert.deepEqual(snapshot(), before, 'no queue write, no audit line');
  // a shared reader that also queued an exclusive entry (B3): only the entry goes
  const C = 'chrome-measure';
  await L.setSharedSwitch(C, { on: true, by: 'lead', reason: 'test' });
  const rd = await L.tryAcquire(C, { owner: 'fn', kind: 'lease', shared: true, weight: 1, maxSec: 60, load1: 0 });
  assert.equal(rd.ok, true);
  assert.equal((await L.tryAcquire(C, { owner: 'fn', kind: 'lease' })).ok, false);
  const r = await X.leaveQueue(C, { owner: 'fn' });
  assert.equal(r.removed.length, 1);
  assert.equal(r.holds, true);
  assert.deepEqual(L.status(C).holder.readers.map((x) => x.owner), ['fn'], 'the reader stays in the group');
  assert.deepEqual(L.status(C).queue, []);
});

test('leave: a removed process entry whose process still runs is flagged (it re-queues at the back on its next poll)', async () => {
  const kid = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  try {
    await queueOf();
    assert.equal((await L.tryAcquire(R, { owner: 'x', kind: 'process', pid: kid.pid })).ok, false);
    const out = await X.leaveQueue(R, { owner: 'x' });
    assert.equal(out.removed.length, 1);
    assert.equal(out.removed[0].running, true);
    assert.equal(out.removed[0].entry.pid, kid.pid);
  } finally { kid.kill('SIGKILL'); }
});
