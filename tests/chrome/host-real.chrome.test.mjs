// Opt-in (npm run test:chrome): tools/lib/host.mjs's default samplers on this machine. The default suite
// never reads the real host (incident I-024: tests waited on a busy or sleeping Mac), so the one check
// that the real readings work lives here, with the other real-machine tests. No Chrome is started.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { node, chromeLock } from '../helpers.mjs';

const HOST = new URL('../../tools/lib/host.mjs', import.meta.url).href;
// a quiet machine for the CPU window, like every tests/chrome file (tests/e2e/chrome-lock.test.mjs)
const lock = chromeLock(`test-chrome-host-${process.pid}`, { cmd: 'host-real.chrome test' });
before(() => lock.acquire(), { timeout: Infinity });
after(() => lock.release());

test('default samplers on this machine: numbers, not errors; ps finds this process tree; no sleep in 1 s', () => {
  const code = `import('${HOST}').then(async (h) => {
    const a = await h.snapshot();
    const x = await h.sample({ windowSec: 1 });
    console.log(JSON.stringify({ a, x, tree: await h.treeCpuSec(process.pid) }));
  });`;
  const r = node('--input-type=module', ['-e', code], { env: { FW_TEST_HOST: '' } });
  assert.equal(r.code, 0, r.out);
  const { a, x, tree } = JSON.parse(r.stdout);
  assert.ok(a.ticks.total > 0);
  assert.equal(typeof a.load1, 'number');
  assert.ok(a.freeMemMB > 0);
  assert.equal(typeof a.mono, 'number');
  if (process.platform === 'darwin') {
    assert.ok([1, 2, 4].includes(a.pressure), `pressure ${a.pressure}`);
    assert.equal(typeof a.decompressions, 'number');
    assert.ok(a.wakeAt > 1.7e9, `kern.waketime ${a.wakeAt}`);
  }
  assert.equal(a.stub, undefined);
  assert.ok(x.busyPct === null || (x.busyPct >= 0 && x.busyPct <= 100));
  assert.ok(x.windowSec >= 1 && x.windowSec < 3);
  assert.equal(x.suspended, false, `no host sleep in a 1 s window (slept ${x.sleptSec} s)`);
  assert.equal(typeof tree, 'number');
});
