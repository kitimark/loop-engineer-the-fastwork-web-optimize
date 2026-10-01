// `iphone.mjs run` got a target parameter for the Simulator (`sim.mjs run`, research/simulator/README.md §7): that is
// MEASUREMENT CODE, so the phone's output must stay byte for byte what it was before (captured on the code before the
// change, 44087f4): the run JSON (meta.tool aside: it hashes the tool files themselves) and the console summary, for
// a scroll run, a window run and a run without the battery read. A Simulator target changes only meta.device,
// meta.settings, meta.tool's file list, the added meta.sim and the out dir (out/sim/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { finish, parseRunArgs, DEVICE, TOOL_FILES } from '../../tools/lib/iphone-run.mjs';
import { makeRaw } from '../fixtures/run-raw.mjs';
import { tempDir } from '../helpers.mjs';

const NOW = new Date('2026-10-01T12:00:00.000Z');
function runFinish(drv, opts = {}) {
  const out = join(tempDir('fw-run-pin-'), 'o.json');
  const o = parseRunArgs([...drv, '--probe', 'std', '--label', 'pin', '--block', 'b1', '--arm', 'C', '--pos', '1', '--out', out]);
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  const raw = makeRaw();
  if (!o.battery) raw.battery = null;
  try { finish(o, 'me', raw, { now: NOW, ...opts }); } finally { console.log = orig; }
  const j = JSON.parse(readFileSync(out, 'utf8'));
  return { j, logs: logs.join('\n').replaceAll(out, '<out>'), out };
}
const pin = ({ j, logs }) => {
  const s = JSON.stringify({ ...j, meta: { ...j.meta, tool: null } }) + '\n--\n' + logs;
  return [createHash('sha256').update(s).digest('hex').slice(0, 16), s.length];
};

test('iphone run (the phone, no target): run JSON and console summary byte-identical to before the Simulator target', () => {
  // re-pinned on purpose since 44087f4, phone output only (the Simulator test below checks the target contract):
  // T1a probe v3 adds movedFromTime; the T1a phone summary replaces the k forms with ms forms and adds rafHz /
  // lowPowerSuspect (and the fixture's 37.4 ms frame is now a slow frame, near 34)
  assert.deepEqual(pin(runFinish(['--driver', 'scroll'])), ['556fc28afd03fee1', 10625]);
  assert.deepEqual(pin(runFinish(['--driver', 'window', '--to', '1800'])), ['bfb34e07452d5a24', 10678]);
  assert.deepEqual(pin(runFinish(['--driver', 'scroll', '--no-battery'])), ['d1ecb63d607a46b7', 10403]);
  const { j } = runFinish(['--driver', 'scroll']);
  assert.equal(j.meta.device, DEVICE);
  assert.deepEqual(Object.keys(j.meta.tool.files), TOOL_FILES);
  assert.ok(!('sim' in j.meta));
});

test('iphone run with a Simulator target: device, settings, tool files, meta.sim and out dir change; everything else is the phone\'s', () => {
  const phone = runFinish(['--driver', 'scroll', '--no-battery']).j;
  const target = { device: 'simulator', settings: { lowPowerMode: 'n/a' }, toolFiles: ['tools/sim.mjs', ...TOOL_FILES], outDir: 'sim', extra: () => ({ sim: { window: 'shown' } }) };
  const r = runFinish(['--driver', 'scroll', '--no-battery'], { target });
  const sim = r.j;
  assert.equal(sim.meta.device, 'simulator');
  assert.deepEqual(sim.meta.settings, { lowPowerMode: 'n/a' });
  assert.deepEqual(Object.keys(sim.meta.tool.files), ['tools/sim.mjs', ...TOOL_FILES]);
  assert.deepEqual(sim.meta.sim, { window: 'shown' });
  const strip = (m) => { const { device, settings, tool, sim: s, ...rest } = m; return rest; };
  assert.deepEqual(strip(sim.meta), strip(phone.meta));
  assert.deepEqual({ ...sim, meta: null }, { ...phone, meta: null });
  assert.ok(Object.keys(sim.meta).indexOf('sim') === Object.keys(sim.meta).length - 1, 'meta.sim comes last');
});
