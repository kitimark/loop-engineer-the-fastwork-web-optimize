// I-155 end to end on a temp state dir: `lock.mjs acquire iphone --not-ready` (QUEUED, exit 3, never served);
// `lock.mjs run iphone` under the owner's lease marks it in use while its command runs; `idle.mjs check` counts the
// lease holder's chrome-measure hold as use and prints a NOTIFY line per addressee of a new alarm. No phone, Chrome,
// port 5173 or real store (I-041).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';

const LOCK = tool('lock.mjs');
const IDLE = tool('idle.mjs');
let state, env;
beforeEach(() => { state = tempDir('fw-pready-e2e-'); env = { FW_STATE_DIR: state }; });
const lock = (...a) => node(LOCK, a, { env });
const later = (min) => new Date(Date.now() + min * 60000).toISOString();
const idle = (args, min = 0) => node(IDLE, args, { env: { ...env, FW_IDLE_NOW: later(min) } });

test('I-155 CLI: acquire iphone --not-ready queues (exit 3) without being served; status marks it; the flag is iphone-only; acquiring ready takes the lease', () => {
  assert.equal(lock('acquire', 'iphone', '--owner', 'runner', '--ttl', '900').code, 0);
  const q = lock('acquire', 'iphone', '--owner', 'fix-a', '--not-ready');
  assert.equal(q.code, 3, q.stdout + q.stderr);
  assert.match(q.stdout, /^QUEUED iphone \(not ready\): you \("fix-a"\) are #1 in the queue and keep the place/);
  assert.match(lock('status', 'iphone', '--no-host').stdout, /queue: 1\. fix-a \[not ready, I-155\]/);
  assert.match(lock('acquire', 'chrome-measure', '--owner', 'x', '--not-ready').stderr, /--not-ready is for lock\.mjs acquire iphone/);
  assert.equal(lock('release', 'iphone', '--owner', 'runner').code, 0);
  assert.match(lock('status', 'iphone', '--no-host').stdout, /^iphone\s+free\n/m, 'free, and nobody is next');
  assert.equal(lock('acquire', 'iphone', '--owner', 'fix-a', '--not-ready').code, 3, 'never granted while not ready');
  const g = lock('acquire', 'iphone', '--owner', 'fix-a');
  assert.equal(g.code, 0, g.stdout + g.stderr);
});

test('I-155 CLI: run iphone under the own lease marks the lease in use (lockRun, the command\'s pid) while the command runs, and clears it after', () => {
  assert.equal(lock('acquire', 'iphone', '--owner', 'runner', '--ttl', '900').code, 0);
  const f = join(state, 'locks', 'iphone.json');
  const r = lock('run', 'iphone', '--owner', 'runner', '--', process.execPath, '-e',
    `setTimeout(() => { const h = JSON.parse(require('fs').readFileSync(${JSON.stringify(f)}, 'utf8')); console.log('MARK ' + JSON.stringify({ pid: h.meta.run && h.meta.run.pid === process.pid, lockRun: h.meta.run && h.meta.run.lockRun })); }, 700)`);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /MARK \{"pid":true,"lockRun":true\}/);
  const h = JSON.parse(readFileSync(f, 'utf8'));
  assert.equal(h.meta.run, undefined, 'cleared at the end');
  assert.ok(h.lastRunAt, 'its start and end stamp the last use');
  assert.equal(h.owner, 'runner', 'the lease stays');
});

test('I-155 idle check: the holder\'s chrome-measure hold is use (OK, exit 0); without it the alarm prints NOTIFY lines for the holder and the waiter', () => {
  assert.equal(lock('acquire', 'iphone', '--owner', 'runner', '--ttl', '1800').code, 0);
  assert.equal(lock('acquire', 'iphone', '--owner', 'fix-w', '--wait', '0').code, 3);
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'runner').code, 0);
  const ok = idle(['check'], 7);
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /OK iphone: held by runner, which holds the Chrome slot \(its phone-block hold\): in use, not idle \(I-155\)/);
  assert.equal(lock('release', 'chrome-measure', '--owner', 'runner').code, 0);
  assert.equal(lock('acquire', 'iphone', '--owner', 'fix-w', '--wait', '0').code, 3); // keep the place
  const al = idle(['check'], 14);
  assert.equal(al.code, 3, al.stdout + al.stderr);
  assert.match(al.stdout, /IDLE iphone: iPhone held by runner but unused/);
  assert.match(al.stdout, /NOTIFY runner: you hold the iPhone lease with no phone run for \d+ min while others wait/);
  assert.match(al.stdout, /NOTIFY fix-w: iPhone held by runner unused for \d+ min while you wait/);
});
