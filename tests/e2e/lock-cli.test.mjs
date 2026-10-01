// tools/lock.mjs CLI: exit codes (0 held, 3 busy/queued, 1 error), status output, concurrent
// acquirers, FIFO hand-over, --wait, `run <res> -- cmd` (holds while cmd runs, propagates the exit
// code, releases after, and does not leave the command running when it is killed).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, startProc, tool, sleep, TESTS } from '../helpers.mjs';

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

test('I-020: --wait as the next waiter takes a freed lock within about a second (was the 5 s first pause)', async () => {
  assert.equal(lock('acquire', 'w', '--owner', 'a').code, 0);
  const waiting = lockAsync('acquire', 'w', '--owner', 'b', '--wait', '20');
  for (let i = 0; i < 100 && !statusJson('w').queue.length; i++) await sleep(50);
  await sleep(300);
  const t0 = Date.now();
  assert.equal(lock('release', 'w', '--owner', 'a').code, 0);
  const r = await waiting;
  assert.equal(r.code, 0, r.out);
  assert.ok(Date.now() - t0 < 2500, `granted ${Date.now() - t0} ms after the release`);
});

test('I-020: a chrome-measure lease defaults to a TTL and is capped; "use lock.mjs run" in the refusal', () => {
  const a = lock('acquire', 'chrome-measure', '--owner', 'lease-topic');
  assert.equal(a.code, 0, a.out);
  const h = holder('chrome-measure');
  assert.ok(Math.abs(Date.parse(h.expiresAt) - Date.now() - 600000) < 10000, 'default TTL 600 s');
  assert.match(a.stdout, /ACQUIRED chrome-measure for "lease-topic" until /);
  assert.equal(lock('release', 'chrome-measure', '--owner', 'lease-topic').code, 0);
  const big = lock('acquire', 'chrome-measure', '--owner', 'lease-topic', '--ttl', '2400');
  assert.equal(big.code, 1);
  assert.match(big.stderr, /capped at 1200 s.*lock\.mjs run chrome-measure --owner <topic> -- sh -c/);
  assert.equal(holder('chrome-measure'), null);
  const iphone = lock('acquire', 'iphone', '--owner', 'phone', '--ttl', '2400');
  assert.equal(iphone.code, 0, 'the iphone lease has no such cap');
});

test('I-020: a normal `run` on chrome-measure declares its length (--max-seconds, default 600); past it: a warning and OVERDUE in status, never a kill', async () => {
  const lockFile = join(state, 'locks', 'chrome-measure.json');
  const child = `setTimeout(() => { console.log('DONE'); process.exit(4); }, 2600);`;
  const p = lockAsync('run', 'chrome-measure', '--owner', 'long-ab', '--max-seconds', '1', '--', process.execPath, '-e', child);
  let h = null;
  for (let i = 0; i < 100 && !h; i++) { await sleep(50); h = holder('chrome-measure'); }
  assert.equal(h.meta.expectSec, 1);
  assert.equal(h.short, undefined, 'still a normal hold');
  await sleep(1600);
  assert.match(lock('status', 'chrome-measure').stdout, /held by "long-ab" .*OVERDUE \(past its 1 s/);
  const r = await p;
  assert.equal(r.code, 4, 'the command ran to its end: a measurement is never killed');
  assert.match(r.stdout, /DONE/);
  assert.match(r.stderr, /\[lock chrome-measure\] this hold passed its 1 s .*split long measurements/);
  assert.equal(existsSync(lockFile), false, 'released');
  const d = lock('run', 'chrome-measure', '--owner', 'plain', '--', process.execPath, '-e', `console.log(JSON.parse(require('fs').readFileSync(${JSON.stringify(lockFile)}, 'utf8')).meta.expectSec)`);
  assert.equal(d.code, 0, d.out);
  assert.equal(d.stdout.trim(), '600', 'default: ~10 min per normal hold');
  const other = lock('run', 'w', '--owner', 'plain', '--', process.execPath, '-e', `console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(${JSON.stringify(join(state, 'locks', 'w.json'))}, 'utf8')).meta))`);
  assert.equal(other.stdout.trim(), '{}', 'other resources: no declared length unless given');
});

test('run <res> -- cmd: holds the lock (process kind) while cmd runs, propagates exit code, releases', () => {
  const probe = `const h = JSON.parse(require('fs').readFileSync(${JSON.stringify(join(state, 'locks', 'chrome-measure.json'))}, 'utf8')); console.log('HOLDER ' + JSON.stringify(h)); process.exit(7);`;
  const r = lock('run', 'chrome-measure', '--owner', 'runner', '--note', 'n', '--', process.execPath, '-e', probe);
  assert.equal(r.code, 7, r.out);
  const h = JSON.parse(r.stdout.match(/^HOLDER (.*)$/m)[1]);
  assert.equal(h.owner, 'runner');
  assert.equal(h.kind, 'process');
  assert.equal(typeof h.pid, 'number');
  assert.deepEqual(h.meta, { note: 'n', expectSec: 600 }, 'a normal chrome-measure run declares ~10 min (I-020)');
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

test('short lane (I-007): acquire --short is served before earlier normal waiters; BUSY names who is next', () => {
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'ab-a').code, 0);
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'ab-b').code, 3);
  const s = lock('acquire', 'chrome-measure', '--owner', 'commit', '--short', '--max-seconds', '120');
  assert.equal(s.code, 3, s.out);
  assert.match(s.stdout, /BUSY chrome-measure: held by "ab-a"/);
  assert.match(lock('status', 'chrome-measure').stdout, /commit \(short/);
  assert.equal(lock('release', 'chrome-measure', '--owner', 'ab-a').code, 0);
  const st = lock('status', 'chrome-measure').stdout;
  assert.match(st, /free, handing over to "commit"/, 'status during a hand-over names who is next');
  assert.doesNotMatch(st, /undefined/);
  const b = lock('acquire', 'chrome-measure', '--owner', 'ab-b');
  assert.equal(b.code, 3);
  assert.match(b.stdout, /free, but "commit" is next/);
  const win = lock('acquire', 'chrome-measure', '--owner', 'commit', '--short', '--max-seconds', '120');
  assert.equal(win.code, 0, win.out);
  assert.match(win.stdout, /ACQUIRED chrome-measure for "commit" until .* \(short, max 120 s\)/);
  assert.equal(holder('chrome-measure').short, true);
  assert.equal(lock('acquire', 'x', '--owner', 'y', '--short', '--max-seconds', '9999').code, 1, 'max-seconds is bounded');
});

test('run --short --max-seconds: a command that overruns is killed (with its children) and the lock released', async () => {
  const marker = join(state, 'grandchild-survived');
  const gc = `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'), 3000);`;
  const child = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(gc)}], { stdio: 'inherit' }); console.log('CHILD UP'); setInterval(() => {}, 1000);`;
  const t0 = Date.now();
  const r = await lockAsync('run', 'chrome-measure', '--owner', 'slow', '--short', '--max-seconds', '1', '--', process.execPath, '-e', child);
  assert.equal(r.code, 124, r.out);
  assert.match(r.stdout, /CHILD UP/);
  assert.match(r.stderr, /exceeded --max-seconds 1/);
  assert.ok(Date.now() - t0 < 9000, 'killed at max-seconds, not when it finished');
  assert.equal(holder('chrome-measure'), null, 'released');
  await sleep(3500);
  assert.ok(!existsSync(marker), "the command's child processes are killed too");
  const ok = lock('run', 'chrome-measure', '--owner', 'fast', '--short', '--max-seconds', '30', '--', process.execPath, '-e', 'process.exit(5)');
  assert.equal(ok.code, 5, 'a short run within its max propagates the exit code');
});

test('I-024: run --short past --max-seconds kills the whole tree: SIGTERM-ignoring child and grandchild, also one in its own process group', async () => {
  const pids = join(state, 'pids');
  // a grandchild that ignores SIGTERM in the command's group, and one that left it (detached: a nested
  // `lock.mjs run --short` puts its command in a new group); the child ignores SIGTERM and waits for them
  const gc = `process.on('SIGTERM', () => {}); require('fs').appendFileSync(${JSON.stringify(pids)}, process.pid + '\\n'); setInterval(() => {}, 1000);`;
  const child = `process.on('SIGTERM', () => {}); const { spawn } = require('child_process');
    spawn(process.execPath, ['-e', ${JSON.stringify(gc)}], { stdio: 'ignore' });
    spawn(process.execPath, ['-e', ${JSON.stringify(gc)}], { stdio: 'ignore', detached: true });
    console.log('CHILD UP'); setInterval(() => {}, 1000);`;
  const t0 = Date.now();
  const r = await lockAsync('run', 'chrome-measure', '--owner', 'npm-test', '--short', '--max-seconds', '2', '--', process.execPath, '-e', child);
  const took = Date.now() - t0;
  assert.equal(r.code, 124, r.out);
  assert.match(r.stderr, /exceeded --max-seconds 2/);
  assert.ok(took < 10000, `stopped at max-seconds + the SIGKILL grace, not later (${took} ms)`);
  assert.equal(holder('chrome-measure'), null, 'released');
  const left = readFileSync(pids, 'utf8').trim().split('\n').map(Number);
  assert.equal(left.length, 2);
  let gone = false;
  for (let i = 0; i < 40 && !(gone = left.every((p) => !alive(p))); i++) await sleep(50);
  for (const p of left) if (alive(p)) process.kill(p, 'SIGKILL');
  assert.ok(gone, 'no process of the short job outlives its hold (I-024: a test tree ran 13 min past it)');
});

test('I-026: every chrome-measure hold runs under caffeinate: run (-w its pid), a lease (-t until expiry), ended on release', async () => {
  const log = join(state, 'caffeinate.jsonl');
  const cenv = { ...env, FW_CAFFEINATE: join(TESTS, 'fixtures', 'fake-caffeinate.mjs'), FAKE_CAFFEINATE_LOG: log };
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const r = node(LOCK, ['run', 'chrome-measure', '--owner', 'ab', '--', process.execPath, '-e', 'setTimeout(() => {}, 300)'], { env: cenv });
  assert.equal(r.code, 0, r.out);
  for (let i = 0; i < 60 && !calls().length; i++) await sleep(50);
  const [run] = calls();
  assert.deepEqual(run.args.slice(0, 3), ['-i', '-s', '-w']);
  for (let i = 0; i < 60 && alive(run.pid); i++) await sleep(50);
  assert.ok(!alive(run.pid), 'gone with the hold');
  assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--owner', 'lease'], { env: cenv }).code, 0);
  for (let i = 0; i < 60 && calls().length < 2; i++) await sleep(50);
  const lease = calls()[1];
  assert.deepEqual(lease.args.slice(0, 3), ['-i', '-s', '-t']);
  assert.ok(Number(lease.args[3]) > 590 && Number(lease.args[3]) <= 600, lease.args.join(' '));
  assert.ok(alive(lease.pid), 'a lease keeps it after the CLI exits');
  assert.equal(node(LOCK, ['release', 'chrome-measure', '--owner', 'lease'], { env: cenv }).code, 0);
  for (let i = 0; i < 60 && alive(lease.pid); i++) await sleep(50);
  const stopped = !alive(lease.pid);
  if (!stopped) process.kill(lease.pid, 'SIGKILL');
  assert.ok(stopped, 'release ends the lease\'s assertion');
  assert.ok(!existsSync(join(state, 'locks', 'chrome-measure.awake.json')));
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

test('run exports FW_LOCK_HELD=<resource>:<token>; a nested run re-enters without queueing and leaves the outer hold (incident I-005)', () => {
  const lockFile = join(state, 'locks', 'chrome-measure.json');
  // inner: another owner, another pid; it must run at once (--timeout 2 fails it otherwise)
  const inner = `const fs = require('fs'); const h = JSON.parse(fs.readFileSync(${JSON.stringify(lockFile)}, 'utf8')); console.log('INNER ' + process.env.FW_LOCK_HELD + ' ' + h.owner);`;
  const outer = `const { spawnSync } = require('child_process'); const fs = require('fs');
    console.log('OUTER ' + process.env.FW_LOCK_HELD);
    const r = spawnSync(process.execPath, [${JSON.stringify(LOCK)}, 'run', 'chrome-measure', '--owner', 'nested', '--timeout', '2', '--', process.execPath, '-e', ${JSON.stringify(inner)}], { stdio: 'inherit' });
    console.log('NESTED EXIT ' + r.status);
    console.log('AFTER ' + JSON.parse(fs.readFileSync(${JSON.stringify(lockFile)}, 'utf8')).owner);`;
  const r = lock('run', 'chrome-measure', '--owner', 'outer', '--', process.execPath, '-e', outer);
  assert.equal(r.code, 0, r.out);
  const [, token] = r.stdout.match(/^OUTER chrome-measure:([0-9a-f]{12})$/m) || [];
  assert.ok(token, r.out);
  assert.match(r.stdout, new RegExp(`^INNER chrome-measure:${token} outer$`, 'm'), 'the inner command runs under the outer hold');
  assert.match(r.stdout, /^NESTED EXIT 0$/m);
  assert.match(r.stdout, /^AFTER outer$/m, 'the nested run must not release the outer hold');
  assert.equal(holder('chrome-measure'), null);
  assert.deepEqual(statusJson('chrome-measure').queue, []);
});

test('run with a forged, stale or other-resource FW_LOCK_HELD still queues behind the real holder', () => {
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'busy').code, 0);
  const token = holder('chrome-measure').token;
  for (const held of ['chrome-measure:0123456789ab', `iphone:${token}`, `chrome-measure:${token}0`]) {
    const r = node(LOCK, ['run', 'chrome-measure', '--owner', 'late', '--timeout', '1', '--', process.execPath, '-e', 'console.log("RAN")'], { env: { ...env, FW_LOCK_HELD: held } });
    assert.equal(r.code, 1, `${held}: ${r.out}`);
    assert.doesNotMatch(r.stdout, /RAN/);
    assert.match(r.stderr, /timed out after 1 s; held by busy/);
  }
  assert.equal(holder('chrome-measure').owner, 'busy');
  assert.deepEqual(statusJson('chrome-measure').queue, []);
});
