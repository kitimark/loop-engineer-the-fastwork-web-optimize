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

// ts-lock-bundle (e): hostPower() on this machine (T8+, I-033). The default suite feeds hostPower only fake readings
// (tests/fixtures/fake-host.mjs and synthetic pmset / osascript text), so this is the one check that the four real
// commands answer and parse. What stays untested without hardware: a real display-off or DarkWake reading (the
// test runs with the display on and the user present), and the CGDisplayIsAsleep answer with no display attached.
// Manual check for the user or lead (not automated: it sleeps the display): `pmset displaysleepnow`, wait 10 s
// without touching the Mac, then from ssh or a scheduled job: node -e "import('./tools/lib/host.mjs').then(async (h) =>
// console.log(await h.hostPower()))" -> display 'off'; fullWake false only once the Mac drops to DarkWake.
test('hostPower on this machine: every field read (no null), no stub; a lit display is FullWake', { skip: process.platform !== 'darwin' && 'macOS only (pmset, osascript)' }, () => {
  const code = `import('${HOST}').then(async (h) => console.log(JSON.stringify(await h.hostPower())));`;
  const r = node('--input-type=module', ['-e', code], { env: { FW_TEST_HOST: '' } });
  assert.equal(r.code, 0, r.out);
  const p = JSON.parse(r.stdout);
  assert.equal(p.stub, undefined, 'the real samplers');
  assert.ok(['on', 'off'].includes(p.display), `display ${p.display}`);
  assert.equal(typeof p.fullWake, 'boolean');
  assert.ok(Array.isArray(p.capabilities) && p.capabilities.includes('CPU'), `capabilities ${p.capabilities}`);
  assert.ok(p.powerSource != null, 'pmset -g ps names a source');
  for (const k of ['displaySleepPrevented', 'systemSleepPrevented', 'userActive']) assert.equal(typeof p[k], 'boolean', `${k} ${p[k]}`);
  assert.ok(Math.abs(Date.parse(p.at) - Date.now()) < 60000);
  if (p.display === 'on') assert.equal(p.fullWake, true, 'a lit display has the Graphics capability (no DarkWake)');
});
