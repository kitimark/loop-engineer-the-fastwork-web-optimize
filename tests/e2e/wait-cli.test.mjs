// tools/wait.mjs and `lock.mjs wait` CLIs (ts-wait, user request 2026-10-01): one background command that
// exits by itself with one result line (MET / TIMEOUT / NEVER) and a documented exit code (0 / 3 / 4, 1 usage),
// replacing agents' `sleep N; status` and `until …; do sleep …; done` loops. Also: `acquire iphone --wait`
// keeps strict FIFO (the documented replacement for retrying acquire iphone every 2-5 min by hand).
// Temp lock dirs ($FW_STATE_DIR) only; no real locks, no port 5173, no phone.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { tempDir, node, nodeAsync, tool, sleep, cleanEnv } from '../helpers.mjs';

const WAIT = tool('wait.mjs');
const LOCK = tool('lock.mjs');
let state, env;
beforeEach(() => { state = tempDir('fw-waitcli-'); env = { FW_STATE_DIR: state }; });
const lock = (...a) => node(LOCK, a, { env });
const lockAsync = (...a) => nodeAsync(LOCK, a, { env });
const queue = (r) => { try { return JSON.parse(readFileSync(join(state, 'locks', `${r}.queue.json`), 'utf8')).map((w) => w.owner); } catch { return []; } };

test('wait file --match: exits 0 with the matching line once a background job writes it', async () => {
  const f = join(state, 'job.log');
  const w = nodeAsync(WAIT, ['file', f, '--match', '^EXIT \\d+', '--timeout', '20']);
  await sleep(600);
  writeFileSync(f, 'working\n');
  await sleep(600);
  appendFileSync(f, 'EXIT 0\n');
  const r = await w;
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^MET file ${f.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} ~ /\\^EXIT \\\\d\\+/: EXIT 0 \\(after \\d+ s\\)\\n$`));
  assert.match(r.stderr, /no such file yet/, 'state changes go to stderr');
  assert.equal(r.stdout.trim().split('\n').length, 1, 'one result line on stdout');
});

test('wait file: TIMEOUT exit 3 with the last state; --pid of a finished writer: NEVER exit 4 at once', async () => {
  const f = join(state, 'x.log');
  writeFileSync(f, 'nothing\n');
  const t = node(WAIT, ['file', f, '--match', 'DONE', '--timeout', '1', '--quiet']);
  assert.equal(t.code, 3, t.out);
  assert.match(t.stdout, /^TIMEOUT file .* after 1 s: no line matches \/DONE\/ yet \(8 bytes\)$/m);
  assert.equal(t.stderr, '', '--quiet: no change lines');
  const p = spawn(process.execPath, ['-e', '0'], { env: cleanEnv() });
  await new Promise((r) => p.on('exit', r));
  const t0 = Date.now();
  const n = node(WAIT, ['file', f, '--match', 'DONE', '--pid', String(p.pid), '--timeout', '600']);
  assert.equal(n.code, 4, n.out);
  assert.match(n.stdout, new RegExp(`^NEVER file .*: process ${p.pid} exited and no line matched`));
  assert.ok(Date.now() - t0 < 5000, 'no hour-long wait for a dead writer');
});

test('wait serve: MET with MIRROR_URL once the state file names a live pid whose URL answers', async () => {
  const s = await new Promise((res) => { const x = http.createServer((q, a) => a.end('ok')); x.listen(0, '127.0.0.1', () => res(x)); });
  const url = `http://127.0.0.1:${s.address().port}/`;
  const f = join(state, 'serve-t.json');
  try {
    const w = nodeAsync(WAIT, ['serve', f, '--timeout', '20']);
    await sleep(700);
    writeFileSync(f, JSON.stringify({ url, pid: process.pid }));
    const r = await w;
    assert.equal(r.code, 0, r.out);
    assert.match(r.stdout, new RegExp(`^MET serve .*: MIRROR_URL=${url.replace(/[.]/g, '\\.')} pid=${process.pid} \\(after \\d+ s\\)$`, 'm'));
  } finally { s.close(); }
  const t = node(WAIT, ['serve', join(state, 'none.json'), '--timeout', '1', '--quiet']);
  assert.equal(t.code, 3);
  assert.match(t.stdout, /TIMEOUT serve .* after 1 s: no state file yet/);
});

test('wait url / pid / time / git, and usage errors exit 1', async () => {
  const p = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 1500)'], { env: cleanEnv() });
  const r = node(WAIT, ['pid', String(p.pid), '--timeout', '20']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^MET pid ${p.pid}: pid ${p.pid} exited`));
  const u = node(WAIT, ['url', 'http://127.0.0.1:9/', '--timeout', '1', '--quiet']);
  assert.equal(u.code, 3, u.out);
  assert.match(u.stdout, /^TIMEOUT url http:\/\/127\.0\.0\.1:9\/ after 1 s: no answer/);
  const tm = node(WAIT, ['time', '1']);
  assert.equal(tm.code, 0, tm.out);
  assert.match(tm.stdout, /^MET time \d{4}-/);
  const g = node(WAIT, ['git', '--ref', 'HEAD', '--contains', 'HEAD', '--quiet']);
  assert.equal(g.code, 0, g.out);
  assert.match(g.stdout, /^MET git HEAD contains HEAD/);
  for (const args of [[], ['bogus'], ['file'], ['pid', 'abc'], ['file', 'x', '--timeout', 'soon'], ['file', 'x', '--match', '('], ['git', '--path', 'a', '--grep', 'b'], ['time', '5', '--timeout', '9']]) {
    const e = node(WAIT, args);
    assert.equal(e.code, 1, `${args.join(' ')}: ${e.out}`);
  }
  assert.equal(node(WAIT, ['--help']).code, 0);
});

test('lock wait: released-by exits when the holder releases; position<=1 and mine as the queue moves; read-only', async () => {
  assert.equal(lock('acquire', 'w', '--owner', 'a').code, 0);
  assert.equal(lock('acquire', 'w', '--owner', 'b').code, 3);
  assert.equal(lock('acquire', 'w', '--owner', 'c').code, 3);
  const rel = lockAsync('wait', 'w', '--until', 'released-by:a', '--timeout', '30');
  const pos = lockAsync('wait', 'w', '--until', 'position<=1', '--owner', 'c', '--timeout', '30');
  const mine = lockAsync('wait', 'w', '--until', 'mine', '--owner', 'b', '--timeout', '30');
  await sleep(1200);
  assert.deepEqual(queue('w'), ['b', 'c'], 'waits take no queue place');
  assert.equal(lock('release', 'w', '--owner', 'a').code, 0);
  const r = await rel;
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^MET w released-by "a": free; queue: 1\. b, 2\. c \(after \d+ s\)$/m);
  assert.equal(lock('acquire', 'w', '--owner', 'b').code, 0);
  const m = await mine;
  assert.equal(m.code, 0, m.out);
  assert.match(m.stdout, /^MET w held-by "b": held by "b"; queue: 1\. c/m);
  const p = await pos;
  assert.equal(p.code, 0, p.out);
  assert.match(p.stdout, /^MET w "c" at position <= 1/m);
  assert.match(p.stderr, /\[lock wait .*\] w held by "a"; queue: 1\. b, 2\. c/, 'each state change on stderr');
});

test('lock wait: TIMEOUT exit 3 with the state; idle --for needs the lock to stay idle; usage errors exit 1', async () => {
  assert.equal(lock('acquire', 'w', '--owner', 'a').code, 0);
  const t = lock('wait', 'w', '--until', 'free', '--timeout', '1', '--quiet');
  assert.equal(t.code, 3, t.out);
  assert.match(t.stdout, /^TIMEOUT w free after 1 s: held by "a"$/m);
  assert.equal(lock('release', 'w', '--owner', 'a').code, 0);
  const t0 = Date.now();
  const idle = lock('wait', 'w', '--until', 'idle', '--for', '2', '--timeout', '20');
  assert.equal(idle.code, 0, idle.out);
  assert.match(idle.stdout, /^MET w idle: free \(for 2 s\)/m);
  assert.ok(Date.now() - t0 >= 2000, 'held the condition for --for seconds');
  for (const args of [['wait', 'w'], ['wait', 'w', '--until', 'mine'], ['wait', 'w', '--until', 'soon'], ['wait', 'w', '--until', 'free', '--timeout', 'x'], ['wait', 'BAD!', '--until', 'free']]) {
    const e = lock(...args);
    assert.equal(e.code, 1, `${args.join(' ')}: ${e.out}`);
  }
});

test('acquire iphone --wait: a background waiter gets the lease in strict FIFO order when the holder releases', async () => {
  assert.equal(lock('acquire', 'iphone', '--owner', 'a').code, 0);
  const b = lockAsync('acquire', 'iphone', '--owner', 'b', '--wait', '30');
  for (let i = 0; i < 100 && !queue('iphone').includes('b'); i++) await sleep(50);
  assert.equal(lock('acquire', 'iphone', '--owner', 'c').code, 3, 'c queues behind b');
  assert.equal(lock('release', 'iphone', '--owner', 'a').code, 0);
  const r = await b;
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ACQUIRED iphone for "b" until /);
  assert.equal(lock('acquire', 'iphone', '--owner', 'c').code, 3, 'c still waits: b holds it');
});
