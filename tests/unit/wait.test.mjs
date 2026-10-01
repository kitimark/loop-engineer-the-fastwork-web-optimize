// tools/lib/wait.mjs (ts-wait, user request 2026-10-01): the blocking waits behind tools/wait.mjs and
// `lock.mjs wait`. pollUntil's result kinds, backoff floor/cap and --for hold run on a fake clock; the
// conditions run on real temp files, processes, an in-process HTTP server and a temp git repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import { tempDir, sleep, cleanEnv } from '../helpers.mjs';
import { pollUntil, parseSec, BACKOFF, pidAlive, fileCondition, urlCondition, serveCondition, pidsCondition, gitCondition, timeCondition, parseLockCondition, lockConditionMet, lockState } from '../../tools/lib/wait.mjs';

/** A fake clock: sleep() advances it and records each pause. */
function clock() {
  let t = 1_000_000;
  const pauses = [];
  return { now: () => t, sleep: async (ms) => { pauses.push(ms); t += ms; }, pauses, advance: (ms) => { t += ms; } };
}

test('pollUntil: met at once, met later, timeout, never; states reported once per change', async () => {
  let c = clock();
  let r = await pollUntil(() => ({ met: true, state: 'ok', detail: 'd' }), { now: c.now, sleep: c.sleep });
  assert.deepEqual([r.result, r.detail, r.waitedSec, r.checks], ['met', 'd', 0, 1]);
  assert.equal(c.pauses.length, 0, 'no sleep when already met');

  c = clock();
  let n = 0;
  const seen = [];
  r = await pollUntil(() => (++n >= 4 ? { met: true, state: 'up' } : { met: false, state: 'down' }), { now: c.now, sleep: c.sleep, onChange: (s) => seen.push(s) });
  assert.equal(r.result, 'met');
  assert.equal(r.checks, 4);
  assert.deepEqual(seen, ['down', 'up']);

  c = clock();
  r = await pollUntil(() => ({ met: false, state: 'still' }), { timeoutSec: 30, now: c.now, sleep: c.sleep });
  assert.equal(r.result, 'timeout');
  assert.equal(r.state, 'still');
  assert.equal(r.waitedSec, 30, 'the last pause is cut to the deadline');

  c = clock();
  r = await pollUntil(() => ({ met: false, state: 'x', never: 'process 1 exited' }), { now: c.now, sleep: c.sleep });
  assert.deepEqual([r.result, r.never], ['never', 'process 1 exited']);

  c = clock();
  r = await pollUntil(() => ({ met: false, state: 'x' }), { timeoutSec: 0, now: c.now, sleep: c.sleep });
  assert.equal(r.result, 'timeout', '--timeout 0 checks once');
  assert.equal(r.checks, 1);
  await assert.rejects(pollUntil(() => ({ met: true }), { timeoutSec: -1 }), /--timeout/);
});

test('pollUntil: backoff starts at 1 s (never faster) and grows to the 10 s cap', async () => {
  const c = clock();
  await pollUntil(() => ({ met: false, state: 's' }), { timeoutSec: 120, now: c.now, sleep: c.sleep });
  assert.equal(c.pauses[0], BACKOFF.minMs);
  assert.ok(BACKOFF.minMs >= 1000, 'at most one check per second');
  for (let i = 1; i < c.pauses.length - 1; i++) assert.ok(c.pauses[i] >= c.pauses[i - 1], `non-decreasing: ${c.pauses}`);
  assert.ok(c.pauses.includes(BACKOFF.maxMs), `reaches the cap: ${c.pauses}`);
  assert.ok(Math.max(...c.pauses) <= BACKOFF.maxMs);
});

test('pollUntil --for: the condition must hold continuously; a break restarts the hold', async () => {
  const c = clock();
  const t0 = c.now();
  // met from 0-5 s, broken at 5-7 s, met again from 7 s on
  const check = () => { const s = (c.now() - t0) / 1000; return s < 5 || s >= 7 ? { met: true, state: 'free' } : { met: false, state: 'busy' }; };
  const r = await pollUntil(check, { holdSec: 10, timeoutSec: 600, now: c.now, sleep: c.sleep });
  assert.equal(r.result, 'met');
  const s = (c.now() - t0) / 1000;
  assert.ok(s >= 17 && s <= 19, `met after the second 10 s hold, not the first (${s} s)`);
  const r2 = await pollUntil(() => ({ met: true, state: 'x' }), { holdSec: 30, timeoutSec: 10, now: c.now, sleep: c.sleep });
  assert.equal(r2.result, 'timeout', 'a hold longer than the timeout times out');
});

test('parseSec: plain seconds and s/m/h suffixes', () => {
  assert.equal(parseSec('90'), 90);
  assert.equal(parseSec('90s'), 90);
  assert.equal(parseSec('10m'), 600);
  assert.equal(parseSec('2h'), 7200);
  assert.equal(parseSec('1.5'), 1.5);
  assert.ok(Number.isNaN(parseSec('soon')));
  assert.ok(Number.isNaN(parseSec('-5')));
  assert.ok(Number.isNaN(parseSec(undefined)));
});

test('fileCondition: exists / non-empty, then a matching line read incrementally (partial and truncated files)', () => {
  const d = tempDir('fw-wait-');
  const f = join(d, 'job.log');
  const exists = fileCondition(f);
  assert.equal(exists().met, false);
  assert.match(exists().state, /no such file/);
  writeFileSync(f, '');
  assert.equal(exists().met, false, 'an empty file is not there yet');
  const m = fileCondition(f, { match: /^EXIT (\d+)/ });
  appendFileSync(f, 'starting\nEX');
  assert.equal(m().met, false);
  assert.equal(exists().met, true);
  appendFileSync(f, 'IT 0'); // no newline yet: a finished writer may never end the line
  const r = m();
  assert.equal(r.met, true);
  assert.equal(r.detail, 'EXIT 0');
  // a replaced (shorter) file is read from the start again
  writeFileSync(f, 'EXIT 7\n');
  const again = fileCondition(f, { match: /^EXIT 7/ });
  assert.equal(again().detail, 'EXIT 7');
  writeFileSync(f, 'x\n');
  const m2 = fileCondition(f, { match: /^done/ });
  assert.equal(m2().met, false);
  writeFileSync(f, 'done\n'); // truncated + rewritten: size < offset or a new inode
  assert.equal(m2().met, true);
});

test('fileCondition --pid: the writer exited without the line -> never; a line written just before exit still counts', async () => {
  const d = tempDir('fw-wait-');
  const f = join(d, 'out.log');
  const p = spawn(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(f)}, 'boom\\n')`], { env: cleanEnv() });
  await new Promise((r) => p.on('exit', r));
  const r = fileCondition(f, { match: /^EXIT/, pid: p.pid })();
  assert.equal(r.met, false);
  assert.match(r.never, new RegExp(`process ${p.pid} exited and no line matched`));
  const ok = fileCondition(f, { match: /^boom/, pid: p.pid })();
  assert.equal(ok.met, true, 'the line is there although the writer is gone');
  const none = fileCondition(join(d, 'never.log'), { pid: p.pid })();
  assert.match(none.never, /the file never appeared/);
});

test('pidsCondition / timeCondition', async () => {
  const p = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 300)'], { env: cleanEnv() });
  const c = pidsCondition([p.pid, process.pid]);
  assert.equal(c().met, false);
  assert.match(c().state, new RegExp(String(p.pid)));
  await new Promise((r) => p.on('exit', r));
  assert.equal(pidsCondition([p.pid])().met, true);
  // a child that exited while its parent (this process) is blocked is a zombie until reaped: it counts as exited
  const z = spawn(process.execPath, ['-e', '0'], { env: cleanEnv() });
  execFileSync(process.execPath, ['-e', 'setTimeout(()=>{}, 600)']); // blocks the event loop: z is not reaped meanwhile
  assert.match(execFileSync('ps', ['-o', 'stat=', '-p', String(z.pid)], { encoding: 'utf8' }), /^Z/, 'precondition: a zombie');
  assert.equal(pidAlive(z.pid), false);
  assert.equal(pidsCondition([z.pid])().met, true);
  assert.equal(pidAlive(process.pid), true);
  assert.equal(pidAlive(2 ** 22 + 12345), false);
  assert.equal(timeCondition(Date.now() - 1)().met, true);
  assert.equal(timeCondition(Date.now() + 60000)().met, false);
});

function server(handler) {
  return new Promise((res) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
}

test('urlCondition: no answer / 5xx not met; any < 500 or exactly --status met', async () => {
  let code = 503;
  const s = await server((req, res) => { res.statusCode = code; res.end('x'); });
  const url = `http://127.0.0.1:${s.address().port}/`;
  try {
    assert.equal((await urlCondition(url)()).met, false);
    code = 404;
    assert.equal((await urlCondition(url)()).met, true, 'a 404 answers: the server is up');
    assert.equal((await urlCondition(url, { status: 200 })()).met, false);
    code = 200;
    const r = await urlCondition(url, { status: 200 })();
    assert.equal(r.met, true);
    assert.match(r.detail, /HTTP 200/);
  } finally { s.close(); }
  const dead = await urlCondition(url)();
  assert.equal(dead.met, false);
  assert.match(dead.state, /no answer/);
  assert.throws(() => urlCondition('not a url'));
});

test('serveCondition: state file with a live pid whose URL answers; a stale file (dead pid) is not ready', async () => {
  const d = tempDir('fw-wait-');
  const f = join(d, 'serve-x.json');
  const s = await server((req, res) => res.end('ok'));
  const url = `http://localhost:${s.address().port}/`;
  try {
    assert.match((await serveCondition(f)()).state, /no state file/);
    const p = spawn(process.execPath, ['-e', '0'], { env: cleanEnv() });
    await new Promise((r) => p.on('exit', r));
    writeFileSync(f, JSON.stringify({ url, pid: p.pid }));
    const stale = await serveCondition(f)();
    assert.equal(stale.met, false);
    assert.match(stale.state, /stale state file/);
    assert.match((await serveCondition(f, { pid: p.pid })()).never, /exited/);
    writeFileSync(f, JSON.stringify({ url, pid: process.pid, httpTwin: 5999, overlays: ['/x/overlay'] }));
    const r = await serveCondition(f)();
    assert.equal(r.met, true);
    assert.equal(r.detail, `MIRROR_URL=${url} twin=http://localhost:5999/ pid=${process.pid} overlay=/x/overlay`);
  } finally { s.close(); }
  const down = await serveCondition(f)();
  assert.equal(down.met, false);
  assert.match(down.state, /not answering/);
});

test('gitCondition: moves / contains / path / grep on a temp repo', () => {
  const d = tempDir('fw-wait-git-');
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8', env: cleanEnv() }).trim();
  g('init', '-q', '-b', 'main');
  writeFileSync(join(d, 'a.txt'), 'a');
  g('add', '.'); g('commit', '-qm', 'first');
  const first = g('rev-parse', 'HEAD');
  const moves = gitCondition({ cwd: d });
  const path = gitCondition({ cwd: d, path: 'fixes/all-wave1/README.md' });
  const grep = gitCondition({ cwd: d, grep: /incident I-099/ });
  assert.equal(moves().met, false);
  assert.equal(path().met, false);
  assert.equal(grep().met, false);
  mkdirSync(join(d, 'fixes', 'all-wave1'), { recursive: true });
  writeFileSync(join(d, 'fixes', 'all-wave1', 'README.md'), 'x');
  g('add', '.'); g('commit', '-qm', 'tools: something (incident I-099)');
  const second = g('rev-parse', 'HEAD');
  const m = moves();
  assert.equal(m.met, true);
  assert.match(m.detail, new RegExp(`moved ${first.slice(0, 7)} -> ${second.slice(0, 7)}: tools: something`));
  assert.equal(path().met, true);
  assert.match(grep().detail, /incident I-099/);
  assert.equal(gitCondition({ cwd: d, contains: first })().met, true);
  g('checkout', '-qb', 'side', first);
  writeFileSync(join(d, 'b.txt'), 'b');
  g('add', '.'); g('commit', '-qm', 'side');
  assert.equal(gitCondition({ cwd: d, contains: 'side' })().met, false, 'main does not contain the side commit');
  assert.match(gitCondition({ cwd: d, ref: 'nope' })().state, /nope not found/);
});

const st = (holder, queue = [], stale = null) => ({ holder, stale, queue: queue.map((owner) => (typeof owner === 'string' ? { owner } : owner)) });

test('parseLockCondition: free, idle, mine, held-by, released-by, position<=N; owners from --owner', () => {
  assert.deepEqual(parseLockCondition('free'), { kind: 'free' });
  assert.deepEqual(parseLockCondition('idle'), { kind: 'idle' });
  assert.deepEqual(parseLockCondition('mine', 'me'), { kind: 'held-by', owner: 'me' });
  assert.deepEqual(parseLockCondition('held-by:x'), { kind: 'held-by', owner: 'x' });
  assert.deepEqual(parseLockCondition('held-by', 'me'), { kind: 'held-by', owner: 'me' });
  assert.deepEqual(parseLockCondition('released-by=all-wave1'), { kind: 'released-by', owner: 'all-wave1' });
  assert.deepEqual(parseLockCondition('position<=2', 'me'), { kind: 'position', owner: 'me', n: 2 });
  assert.throws(() => parseLockCondition('mine'), /--owner/);
  assert.throws(() => parseLockCondition('held-by'), /needs an owner/);
  assert.throws(() => parseLockCondition('position<=1'), /--owner/);
  assert.throws(() => parseLockCondition('soon'), /unknown --until "soon"/);
});

test('lockConditionMet: each condition on status snapshots; a stale holder counts as no holder', () => {
  const met = (spec, s, owner) => lockConditionMet(parseLockCondition(spec, owner), s).met;
  const held = st({ owner: 'a' }, ['b', { owner: 'c', short: true }]);
  assert.equal(lockState(held), 'held by "a"; queue: 1. b, 2. c (short)');
  assert.equal(met('free', held), false);
  assert.equal(met('free', st({ owner: 'a' }, [], 'pid 1 is gone')), true);
  assert.equal(met('free', st(null, ['b'])), true);
  assert.equal(met('idle', st(null, ['b'])), false);
  assert.equal(met('idle', st(null)), true);
  assert.equal(met('held-by:a', held), true);
  assert.equal(met('mine', held, 'b'), false);
  assert.equal(met('released-by:a', held), false, 'holds it');
  assert.equal(met('released-by:b', held), false, 'waits for it');
  assert.equal(met('released-by:z', held), true);
  assert.equal(met('position<=0', held, 'a'), true, 'the holder is at 0');
  assert.equal(met('position<=1', held, 'c'), false);
  assert.equal(met('position<=2', held, 'c'), true);
  assert.equal(met('position<=5', held, 'z'), false, 'not queued at all');
});
