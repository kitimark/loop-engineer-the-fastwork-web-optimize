// tools/lock.mjs CLI: exit codes (0 held, 3 busy/queued, 1 error), status output, concurrent
// acquirers, FIFO hand-over, --wait, `run <res> -- cmd` (holds while cmd runs, propagates the exit
// code, releases after, and does not leave the command running when it is killed).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, startProc, tool, sleep } from '../helpers.mjs';

const LOCK = tool('lock.mjs');
let state, env;
beforeEach(() => { state = tempDir('fw-lockcli-'); env = { FW_STATE_DIR: state }; });
const lock = (...a) => node(LOCK, a, { env });
const lockAsync = (...a) => nodeAsync(LOCK, a, { env });
const holder = (r) => { try { return JSON.parse(readFileSync(join(state, 'locks', `${r}.json`), 'utf8')); } catch { return null; } };
const statusJson = (r) => JSON.parse(lock('status', r, '--json').stdout)[0];
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('acquire / busy / status / renew / release exit codes and messages', () => {
  const a = lock('acquire', 'iphone', '--owner', 'topic-a', '--url', 'https://192.168.1.2:5231/', '--note', 'hi');
  assert.equal(a.code, 0, a.out);
  assert.match(a.stdout, /^ACQUIRED iphone for "topic-a" until /);
  const h = holder('iphone');
  assert.equal(h.kind, 'lease');
  assert.deepEqual(h.meta, { url: 'https://192.168.1.2:5231/', note: 'hi' });
  assert.ok(Math.abs(Date.parse(h.expiresAt) - Date.now() - 900000) < 10000, 'iphone default TTL is 900 s');

  const again = lock('acquire', 'iphone', '--owner', 'topic-a', '--ttl', '60');
  assert.equal(again.code, 0);
  assert.match(again.stdout, /\(renewed\)/);

  const b = lock('acquire', 'iphone', '--owner', 'topic-b');
  assert.equal(b.code, 3, b.out);
  assert.match(b.stdout, /BUSY iphone: held by "topic-a".*You \("topic-b"\) are #1 in the queue/);

  const st = lock('status');
  assert.equal(st.code, 0);
  assert.match(st.stdout, /iphone\s+held by "topic-a" \[lease\]/);
  assert.match(st.stdout, /queue: 1\. topic-b/);
  assert.match(st.stdout, /chrome-measure\s+free/);
  const sj = statusJson('iphone');
  assert.equal(sj.holder.owner, 'topic-a');
  assert.equal(sj.queue[0].owner, 'topic-b');

  const rn = lock('renew', 'iphone', '--owner', 'topic-a', '--ttl', '1200');
  assert.equal(rn.code, 0);
  assert.match(rn.stdout, /^RENEWED iphone for "topic-a"/);
  assert.equal(lock('renew', 'iphone', '--owner', 'topic-b').code, 1);

  const bad = lock('release', 'iphone', '--owner', 'topic-b');
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /held by "topic-a", not "topic-b"/);
  assert.equal(holder('iphone').owner, 'topic-a');

  const rel = lock('release', 'iphone', '--owner', 'topic-a');
  assert.equal(rel.code, 0);
  assert.match(rel.stdout, /RELEASED iphone \(was "topic-a"\)/);
  assert.match(lock('release', 'iphone', '--owner', 'topic-a').stdout, /was not held/);

  // topic-b is head of the queue: a newcomer must not get it, topic-b does
  assert.equal(lock('acquire', 'iphone', '--owner', 'topic-c').code, 3);
  assert.equal(lock('acquire', 'iphone', '--owner', 'topic-b').code, 0);
  assert.equal(lock('dequeue', 'iphone', '--owner', 'topic-c').code, 0);
  assert.deepEqual(statusJson('iphone').queue, []);
  assert.equal(lock('release', 'iphone', '--force').code, 0, '--force needs no owner');
  assert.equal(holder('iphone'), null);
});

test('usage errors exit 1 (2 never collides with 3 = busy)', () => {
  assert.equal(lock('acquire', 'iphone').code, 1);
  assert.match(lock('acquire', 'iphone').stderr, /--owner <name> is required/);
  assert.equal(lock('acquire').code, 1);
  assert.equal(lock('frobnicate', 'iphone', '--owner', 'x').code, 1);
  assert.equal(lock('acquire', 'Bad_Name', '--owner', 'x').code, 1);
  const help = lock('help');
  assert.equal(help.code, 0);
  assert.match(help.stdout, /chrome-measure: /);
  // FW_LOCK_OWNER stands in for --owner
  assert.equal(node(LOCK, ['acquire', 'iphone'], { env: { ...env, FW_LOCK_OWNER: 'from-env' } }).code, 0);
  assert.equal(holder('iphone').owner, 'from-env');
});

test('concurrent acquirers: exactly one winner, everyone else queued once, FIFO hand-over', async () => {
  const owners = Array.from({ length: 8 }, (_, i) => `racer-${i}`);
  const res = await Promise.all(owners.map((o) => lockAsync('acquire', 'race', '--owner', o)));
  const winners = res.filter((r) => r.code === 0);
  assert.equal(winners.length, 1, res.map((r) => r.out).join('\n'));
  assert.equal(res.filter((r) => r.code === 3).length, 7);
  const winner = owners[res.findIndex((r) => r.code === 0)];
  assert.equal(holder('race').owner, winner);
  const q = statusJson('race').queue.map((w) => w.owner);
  assert.equal(q.length, 7);
  assert.equal(new Set(q).size, 7);
  assert.ok(!q.includes(winner));
  // hand-over in queue order
  assert.equal(lock('release', 'race', '--owner', winner).code, 0);
  assert.equal(lock('acquire', 'race', '--owner', q[1]).code, 3, 'second in line must wait');
  assert.equal(lock('acquire', 'race', '--owner', q[0]).code, 0);
  assert.deepEqual(statusJson('race').queue.map((w) => w.owner), q.slice(1));
});

test('--wait N blocks until the holder releases, or gives up with exit 3', async () => {
  assert.equal(lock('acquire', 'w', '--owner', 'a').code, 0);
  const giveUp = lock('acquire', 'w', '--owner', 'b', '--wait', '1');
  assert.equal(giveUp.code, 3);
  const waiting = lockAsync('acquire', 'w', '--owner', 'b', '--wait', '8');
  await sleep(800);
  assert.equal(lock('release', 'w', '--owner', 'a').code, 0);
  const r = await waiting;
  assert.equal(r.code, 0, r.out);
  assert.equal(holder('w').owner, 'b');
});

test('run <res> -- cmd: holds the lock (process kind) while cmd runs, propagates exit code, releases', () => {
  const probe = `const h = JSON.parse(require('fs').readFileSync(${JSON.stringify(join(state, 'locks', 'chrome-measure.json'))}, 'utf8')); console.log('HOLDER ' + JSON.stringify(h)); process.exit(7);`;
  const r = lock('run', 'chrome-measure', '--owner', 'runner', '--note', 'n', '--', process.execPath, '-e', probe);
  assert.equal(r.code, 7, r.out);
  const h = JSON.parse(r.stdout.match(/^HOLDER (.*)$/m)[1]);
  assert.equal(h.owner, 'runner');
  assert.equal(h.kind, 'process');
  assert.equal(typeof h.pid, 'number');
  assert.deepEqual(h.meta, { note: 'n' });
  assert.equal(holder('chrome-measure'), null, 'released after the command exits');
  assert.equal(lock('run', 'chrome-measure', '--owner', 'x').code, 1, 'run without -- cmd is a usage error');
});

test('run waits in the FIFO queue and times out with --timeout', () => {
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'busy').code, 0);
  const r = lock('run', 'chrome-measure', '--owner', 'late', '--timeout', '1', '--', process.execPath, '-e', 'console.log("RAN")');
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.stdout, /RAN/);
  assert.match(r.stderr, /timed out after 1 s; held by busy/);
  assert.deepEqual(statusJson('chrome-measure').queue, [], 'gave up its queue place');
});

test('run: killing the lock holder also stops the command (the lock never outlives the work)', async () => {
  const pidFile = join(state, 'child.pid');
  const child = `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); console.log('CHILD UP'); setInterval(() => {}, 1000);`;
  const p = await startProc(process.execPath, [LOCK, 'run', 'chrome-measure', '--owner', 'victim', '--', process.execPath, '-e', child], { env, ready: (s) => /CHILD UP/.test(s) });
  const childPid = Number(readFileSync(pidFile, 'utf8'));
  assert.equal(holder('chrome-measure').owner, 'victim');
  await p.stop('SIGTERM');
  assert.equal(holder('chrome-measure'), null, 'lock released on SIGTERM');
  let gone = false;
  for (let i = 0; i < 40 && !(gone = !alive(childPid)); i++) await sleep(50);
  if (!gone) process.kill(childPid, 'SIGKILL');
  assert.ok(gone, 'the command must not keep running after the lock was released');
  assert.ok(!existsSync(join(state, 'locks', 'chrome-measure.guard')));
});
