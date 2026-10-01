// tools/lib/bench-scenario.mjs scenarioClock() (incident I-027 C): the scenario's own waits (quiet period,
// settle, warm-up, spot wait/window) run on the stubbed host's fake clock under $FW_TEST_HOST only; on the
// real host they are Date.now + setTimeout, exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { node, FAKE_HOST } from '../helpers.mjs';

const SCENARIO = new URL('../../tools/lib/bench-scenario.mjs', import.meta.url).href;

test('real host (no FW_TEST_HOST): scenarioClock() is Date.now + setTimeout, unchanged', async () => {
  assert.equal(process.env.FW_TEST_HOST, undefined, 'this test process has no host stub');
  const { scenarioClock } = await import(SCENARIO);
  const c = await scenarioClock();
  assert.equal(c.stub, undefined);
  assert.ok(Math.abs(c.now() - Date.now()) < 50, 'wall clock');
  const t0 = Date.now();
  await c.sleep(120);
  assert.ok(Date.now() - t0 >= 110, `a 120 ms sleep took ${Date.now() - t0} ms of real time`);
  assert.equal(await scenarioClock(), c, 'resolved once per process');
});

test('stubbed host (FW_TEST_HOST): the stub\'s clock, a 60 s wait costs no wall time', () => {
  const code = `import('${SCENARIO}').then(async (m) => {
    const c = await m.scenarioClock(), t0 = c.now(), w0 = Date.now();
    await c.sleep(60000);
    console.log(JSON.stringify({ stub: c.stub, fakeSec: (c.now() - t0) / 1000, wallMs: Date.now() - w0 }));
  });`;
  const r = node('--input-type=module', ['-e', code], { env: { FW_TEST_HOST: FAKE_HOST } });
  assert.equal(r.code, 0, r.out);
  const x = JSON.parse(r.stdout);
  assert.equal(x.stub, FAKE_HOST);
  assert.ok(x.fakeSec >= 60 && x.fakeSec < 61, `fake clock advanced ${x.fakeSec} s`);
  assert.ok(x.wallMs < 5000, `took ${x.wallMs} ms of wall time`);
});
