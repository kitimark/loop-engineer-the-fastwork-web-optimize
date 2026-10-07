// I-234: `thermal.mjs set` prints SET and then holds until a signal. The e2e test (tests/e2e/thermal-cli.test.mjs) sends
// SIGTERM as soon as it reads SET; under load the signal landed between the SET write and the handler install, and
// Node's default action killed the process (exit null, the condition left on until the connection closed). Here
// the SIGTERM comes from inside announce(), i.e. right after SET is written: it must end the hold, not the process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tool } from '../helpers.mjs';

const LIB = pathToFileURL(tool('lib/condition-inducer.mjs')).href;

/** Run holdUntilEnd in a child whose announce() prints SET and then signals itself. */
function child(sig) {
  const src = `import { holdUntilEnd } from ${JSON.stringify(LIB)};
const end = await holdUntilEnd({ holdSec: 30, announce: () => { process.stdout.write('SET x\\n'); process.kill(process.pid, ${JSON.stringify(sig)}); } });
process.stdout.write('END ' + JSON.stringify(end) + '\\n');`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', src], { encoding: 'utf8', timeout: 20000 });
}

test('I-234: a signal sent right after the SET line ends the hold ({why: sig}), it does not kill the process', () => {
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    const r = child(sig);
    assert.equal(r.signal, null, `${sig}: the process was killed by ${r.signal} (handlers installed after SET): ${r.stdout}${r.stderr}`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `SET x\nEND {"why":"${sig}"}\n`);
  }
});

test('I-234: holdUntilEnd still ends on the hold time and on a closed connection', async () => {
  const { holdUntilEnd } = await import(LIB);
  let said = 0;
  const t0 = Date.now();
  assert.deepEqual(await holdUntilEnd({ holdSec: 0.05, announce: () => said++ }), { why: '0.05 s elapsed' });
  assert.ok(Date.now() - t0 >= 40);
  const { EventEmitter } = await import('node:events');
  const conn = new EventEmitter();
  const p = holdUntilEnd({ holdSec: 30, conn, announce: () => said++ });
  const err = new Error('gone');
  conn.emit('close', err);
  assert.deepEqual(await p, { lost: err });
  assert.equal(said, 2, 'announce runs once per hold');
});
