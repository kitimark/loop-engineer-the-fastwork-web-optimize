// tools/lib/exit.mjs (I-110, I-117): a CLI exits with its code only after stdout and stderr flushed what was written
// before; a closed pipe (EPIPE) ends it at once; runMain maps a throw to the error code. Fake streams, no processes.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { exitWhenFlushed, runMain } from '../../tools/lib/exit.mjs';

const prevCode = process.exitCode;
afterEach(() => { process.exitCode = prevCode; });

/** A stream whose write callbacks run only when flush() is called (data still queued for a slow reader). */
function slow(name, log) {
  const s = new EventEmitter();
  const pending = [];
  s.write = (chunk, cb) => { log.push(`${name} write`); pending.push(cb); return false; };
  s.flush = () => { while (pending.length) pending.shift()(); };
  return s;
}

test('exitWhenFlushed: sets the exit code at once, exits only after stdout and then stderr flushed', () => {
  const log = [];
  const stdout = slow('out', log), stderr = slow('err', log);
  const exits = [];
  exitWhenFlushed(3, { stdout, stderr, exit: (c) => exits.push(c) });
  assert.equal(process.exitCode, 3);
  assert.deepEqual(exits, [], 'nothing flushed yet: no exit');
  stdout.flush();
  assert.deepEqual(exits, [], 'stderr not flushed yet');
  stderr.flush();
  assert.deepEqual(exits, [3]);
  assert.deepEqual(log, ['out write', 'err write']);
});

test('exitWhenFlushed: a closed pipe (error on stdout or stderr) exits at once, and only once', () => {
  for (const which of ['out', 'err']) {
    const stdout = slow('out', []), stderr = slow('err', []);
    const exits = [];
    exitWhenFlushed(0, { stdout, stderr, exit: (c) => exits.push(c) });
    (which === 'out' ? stdout : stderr).emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    assert.deepEqual(exits, [0], which);
    stdout.flush(); stderr.flush();
    assert.deepEqual(exits, [0], `${which}: no second exit`);
  }
});

test('runMain: the resolved code, or errCode with the message on stderr when main throws', async () => {
  let exits = [];
  const io = () => { const stdout = slow('out', []), stderr = slow('err', []); return { stdout, stderr, exit: (c) => exits.push(c), flush: () => { stdout.flush(); stderr.flush(); } }; };
  let x = io();
  await runMain(async () => 4, { stdout: x.stdout, stderr: x.stderr, exit: x.exit });
  x.flush();
  assert.deepEqual(exits, [4]);
  exits = [];
  x = io();
  const errs = [];
  const orig = console.error;
  console.error = (m) => errs.push(m);
  try { await runMain(async () => { throw new Error('bad usage'); }, { errCode: 2, stdout: x.stdout, stderr: x.stderr, exit: x.exit }); } finally { console.error = orig; }
  x.flush();
  assert.deepEqual(exits, [2]);
  assert.deepEqual(errs, ['bad usage']);
});
