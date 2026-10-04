// tools/lib/incident.mjs in-process: id parsing, error normalization (the dedup key), open / join,
// update validation, resolve rules, announcement text, waitFor. Git-dependent paths (KNOWN, landed
// commits) are covered end to end in tests/e2e/incident-cli.test.mjs on a temp repo.
// Every test uses its own $FW_STATE_DIR, so the real shared incident store is never touched.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const I = await import('../../tools/lib/incident.mjs');
let state;
beforeEach(() => { state = tempDir('fw-incident-'); process.env.FW_STATE_DIR = state; });

test('store lives in the shared state dir, next to the locks', () => {
  assert.equal(I.incidentDir(), join(state, 'incidents'));
});

test('parseId accepts short forms and rejects junk', () => {
  for (const s of ['3', 'I-3', 'i-003', 'I003', ' I-003 ']) assert.equal(I.parseId(s), 'I-003');
  assert.equal(I.parseId('1234'), 'I-1234');
  for (const s of ['', 'x', 'I-', 'I-3a', '../I-001']) assert.throws(() => I.parseId(s), /bad incident id/);
});

test('normalizeError: same failure with different ports, paths, pids, hashes gives the same key', () => {
  const a = I.normalizeError('Error: listen EADDRINUSE: address already in use 0.0.0.0:5231\n    at Server.setupListenHandle');
  const b = I.normalizeError('\n  Error: listen EADDRINUSE: address already in use 0.0.0.0:5877');
  assert.equal(a, b);
  assert.equal(a, 'error: listen eaddrinuse: address already in use <n>.<n>.<n>.<n>:<n>');
  assert.equal(
    I.normalizeError('ENOENT: no such file or directory, open \'/Users/x/.claude/worktrees/fix-a/fixes/a/overlay/_app/2.DyWL8TcE.js\''),
    I.normalizeError('ENOENT: no such file or directory, open \'/Users/x/.claude/worktrees/fix-b/fixes/b/overlay/_app/2.DyWL8TcE.js\''),
  );
  assert.equal(I.normalizeError('[lock chrome-measure] timed out after 3600 s; held by pid 81234 token 3fa9c0d1e2b4'), '[lock chrome-measure] timed out after <n> s; held by pid <n> token <hex>');
  assert.equal(I.normalizeError('fetch https://localhost:5412/x failed'), 'fetch <url> failed');
  assert.equal(I.normalizeError(''), '');
  assert.equal(I.normalizeError(undefined), '');
  assert.notEqual(I.normalizeError('TypeError: a is undefined'), I.normalizeError('TypeError: b is undefined'));
});

test('signature: explicit --sig wins; no error and no sig means no dedup', () => {
  assert.equal(I.signature({ sig: ' Chrome-No-Start ', error: 'whatever' }), 'sig:chrome-no-start');
  assert.match(I.signature({ error: 'Boom 42' }), /^err:boom <n>$/);
  assert.equal(I.signature({}), '');
});

test('open: validates, records the report and environment; the same error joins instead of duplicating', async () => {
  await assert.rejects(I.open({ title: 't' }), /--by/);
  await assert.rejects(I.open({ by: 'a' }), /--title/);
  await assert.rejects(I.open({ by: 'a', title: 't', cls: 'weird' }), /bad class/);

  const r1 = await I.open({ by: 'fix-a', title: 'ab crashes', error: 'Error: listen EADDRINUSE 0.0.0.0:5231', cls: 'tool', cmd: 'node tools/fix.mjs ab a', output: 'x'.repeat(20000), workaround: 'retry' });
  assert.equal(r1.action, 'opened');
  const inc = r1.incident;
  assert.equal(inc.id, 'I-001');
  assert.equal(inc.status, 'open');
  assert.equal(inc.class, 'tool');
  assert.equal(inc.blocking, true, 'blocking by default');
  assert.ok(inc.output.length <= 8001, 'output is clipped to its tail');
  assert.equal(typeof inc.env.node, 'string');
  assert.ok(inc.env.checkout);
  assert.deepEqual(inc.affected.map((a) => a.by), ['fix-a']);
  assert.ok(existsSync(join(state, 'incidents', 'I-001.json')));

  const r2 = await I.open({ by: 'fix-b', title: 'different words', error: 'Error: listen EADDRINUSE 0.0.0.0:5999', blocking: false });
  assert.equal(r2.action, 'joined');
  assert.equal(r2.incident.id, 'I-001');
  assert.deepEqual(r2.incident.affected.map((a) => [a.by, a.blocking]), [['fix-a', true], ['fix-b', false]]);
  const r3 = await I.open({ by: 'fix-b', title: 'again', error: 'Error: listen EADDRINUSE 0.0.0.0:6000' });
  assert.equal(r3.incident.affected.length, 2, 'the same agent is listed once');

  const r4 = await I.open({ by: 'fix-c', title: 'forced separate', error: 'Error: listen EADDRINUSE 0.0.0.0:1', forceNew: true });
  assert.equal(r4.action, 'opened');
  assert.equal(r4.incident.id, 'I-002');
  const r5 = await I.open({ by: 'fix-c', title: 'no error text' });
  const r6 = await I.open({ by: 'fix-d', title: 'no error text' });
  assert.deepEqual([r5.incident.id, r6.incident.id], ['I-003', 'I-004'], 'reports without error text or --sig never dedup');

  assert.deepEqual(I.list().map((i) => i.id), ['I-001', 'I-002', 'I-003', 'I-004']);
  assert.equal(I.get('1').title, 'ab crashes');
  assert.throws(() => I.get('99'), /no incident I-099/);
});

test('concurrent opens of the same failure (in-process) produce one incident', async () => {
  const res = await Promise.all(Array.from({ length: 8 }, (_, k) => I.open({ by: `agent-${k}`, title: 'Chrome did not start', error: `Error: Chrome exited with code ${k}` })));
  assert.equal(res.filter((r) => r.action === 'opened').length, 1);
  assert.equal(res.filter((r) => r.action === 'joined').length, 7);
  assert.deepEqual(readdirSync(join(state, 'incidents')).filter((f) => f.endsWith('.json')), ['I-001.json']);
  assert.equal(I.get('I-001').affected.length, 8);
});

test('update: validates enums, records history, refuses empty updates and "resolved"', async () => {
  await I.open({ by: 'a', title: 't', error: 'e1' });
  await assert.rejects(I.update('1', { status: 'fixing' }), /--by/);
  await assert.rejects(I.update('1', { by: 'lead', status: 'resolved' }), /bad status/);
  await assert.rejects(I.update('1', { by: 'lead', priority: 'P9' }), /bad priority/);
  await assert.rejects(I.update('1', { by: 'lead', cls: 'nope' }), /bad class/);
  await assert.rejects(I.update('1', { by: 'lead' }), /nothing to update/);
  await assert.rejects(I.update('7', { by: 'lead', note: 'x' }), /no incident I-007/);
  const u = await I.update('1', { by: 'lead', status: 'fixing', cls: 'tool', priority: 'P0', assignee: 'ts-i001', workaround: 'use --runs 3', affected: 'fix-z', note: 'dispatched' });
  assert.equal(u.status, 'fixing');
  assert.equal(u.assignee, 'ts-i001');
  assert.deepEqual(u.affected.map((a) => a.by), ['a', 'fix-z']);
  const h = u.history.at(-1);
  assert.equal(h.by, 'lead');
  assert.deepEqual(h.changes, { status: 'fixing', class: 'tool', priority: 'P0', assignee: 'ts-i001', workaround: 'use --runs 3', affected: 'fix-z' });
  assert.equal(h.note, 'dispatched');
  const n = await I.update('1', { by: 'ts-i001', note: 'repro found' });
  assert.equal(n.history.at(-1).note, 'repro found');
});

test('I-183: update --blocking yes|no flips the blocking flag, records it in the history, and counts as an update on its own', async () => {
  await I.open({ by: 'lead', title: 'lead-only', error: 'e1', blocking: true });
  assert.equal(I.get('1').blocking, true);
  const off = await I.update('1', { by: 'lead', blocking: false });
  assert.equal(off.blocking, false);
  assert.deepEqual(off.history.at(-1).changes, { blocking: false });
  await assert.rejects(I.update('1', { by: 'lead', blocking: false }), /nothing to update/, 'no change, no note: refused');
  assert.equal((await I.update('1', { by: 'lead', blocking: true })).blocking, true);
});

test('resolve: "fixed" needs a real commit; other resolutions need a note; parked/resolved leave the active list', async () => {
  await I.open({ by: 'a', title: 't1', error: 'alpha failed' });
  await I.open({ by: 'b', title: 't2', error: 'beta failed' });
  await assert.rejects(I.resolve('1', { by: 'lead' }), /needs --commit/);
  await assert.rejects(I.resolve('1', { by: 'lead', commit: 'deadbeefdeadbeef' }), /unknown commit/);
  await assert.rejects(I.resolve('1', { by: 'lead', resolution: 'workaround' }), /needs --note/);
  await assert.rejects(I.resolve('1', { by: 'lead', resolution: 'maybe', note: 'x' }), /bad resolution/);
  const r = await I.resolve('1', { by: 'lead', commit: 'HEAD', allowUnlanded: true, remeasure: true, note: 'thanks' });
  assert.equal(r.status, 'resolved');
  assert.match(r.fix.commit, /^[0-9a-f]{40}$/);
  assert.equal(r.fix.short, r.fix.commit.slice(0, 10));
  assert.equal(r.remeasure, true);
  await I.update('2', { by: 'lead', status: 'parked', workaround: 'skip the desktop run' });
  assert.deepEqual(I.list().map((i) => i.id), []);
  assert.deepEqual(I.list({ all: true }).map((i) => i.id), ['I-001', 'I-002']);
  // reopening is an update
  const re = await I.update('1', { by: 'lead', status: 'open', note: 'came back' });
  assert.equal(re.status, 'open');
  assert.equal(re.resolution, undefined);
});

test('announcement: says what to do for each state', async () => {
  const { incident } = await I.open({ by: 'fix-a', title: 'verify hangs', error: 'e', cmd: 'node tools/fix.mjs ab a --runs 5' });
  await I.open({ by: 'fix-b', title: 'same', error: 'e' });
  let a = I.announcement(I.get(incident.id));
  assert.match(a, /^\[incident I-001\] OPEN: verify hangs/);
  assert.match(a, /No workaround yet.*incident\.mjs wait I-001/);
  assert.match(a, /Affected: fix-a, fix-b$/);
  await I.update('1', { by: 'lead', status: 'fixing', priority: 'P1', assignee: 'ts-i001', workaround: 'use --runs 3' });
  a = I.announcement(I.get('1'));
  assert.match(a, /FIXING P1, assigned to ts-i001/);
  assert.match(a, /Workaround meanwhile: use --runs 3/);
  const r = await I.resolve('1', { by: 'lead', commit: 'HEAD', allowUnlanded: true, remeasure: true });
  a = I.announcement(r);
  assert.match(a, /RESOLVED \(fixed\): verify hangs/);
  assert.match(a, new RegExp(`Fix: ${r.fix.short} on main: `));
  assert.match(a, /git rebase main/);
  assert.match(a, new RegExp(`git merge-base --is-ancestor ${r.fix.short} HEAD`));
  assert.match(a, /re-run: node tools\/fix\.mjs ab a --runs 5/);
  assert.match(a, /Re-measure: /);
  await I.open({ by: 'x', title: 'parked one', error: 'p' });
  await I.update('2', { by: 'lead', status: 'parked', workaround: 'skip it' });
  assert.match(I.announcement(I.get('2')), /PARKED: parked one\nAction: continue without it; workaround: skip it/);
  const w = await I.open({ by: 'x', title: 'question', error: 'q' });
  const ans = await I.resolve(w.incident.id, { by: 'lead', resolution: 'answered', note: 'WebKit fires resize on toolbar collapse' });
  assert.match(I.announcement(ans), /RESOLVED \(answered\)[\s\S]*Note: WebKit fires resize/);
  assert.doesNotMatch(I.announcement(ans), /git rebase/);
});

test('waitFor: returns when resolved/parked, null on timeout', async () => {
  await I.open({ by: 'a', title: 't', error: 'e' });
  assert.equal(await I.waitFor('1', { timeoutSec: 0.2, pollMs: 50 }), null);
  const p = I.waitFor('1', { timeoutSec: 10, pollMs: 50 });
  setTimeout(() => { I.update('1', { by: 'lead', status: 'parked', note: 'later' }); }, 150);
  const inc = await p;
  assert.equal(inc.status, 'parked');
});
