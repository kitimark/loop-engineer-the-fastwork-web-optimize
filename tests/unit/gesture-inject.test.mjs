// I-038: `iphone.mjs gesture --inject <logger.mjs>` loads an in-page logger module and runs it on the gesture tool's own
// inspector connection (tools/lib/gesture-run.mjs loadInject / runProgram), instead of --morph-log's separate process
// with its own connection, whose close left the run's connection hanging on the phone. Pure parts here; end to end in
// tests/e2e/iphone-gesture.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadInject, runProgram } from '../../tools/lib/gesture-run.mjs';
import { tempDir, TESTS, TOOLS } from '../helpers.mjs';

const mod = (src) => { const f = join(tempDir('fw-inject-'), 'logger.mjs'); writeFileSync(f, src); return f; };

test('I-038 loadInject: string or function exports; name and morph; label and segment reach the functions', async () => {
  const a = await loadInject(join(TESTS, 'fixtures', 'fake-inject.mjs'), { label: 'L1' });
  assert.equal(a.name, 'fake-mlog');
  assert.equal(a.morph, true);
  assert.match(a.install(3), /seg: 3, label: "L1"/);
  assert.match(a.read(0), /window\.__inj/);
  const b = await loadInject(mod(`export const install = '1'; export function read({ seg, label }) { return 'r' + seg + label; }`), { label: 'x' });
  assert.equal(b.name, 'logger');
  assert.equal(b.morph, false);
  assert.equal(b.install(0), '1');
  assert.equal(b.read(2), 'r2x');
});

test('I-038 loadInject: a missing file, a missing export or a non-string expression is refused with the reason', async () => {
  await assert.rejects(loadInject('/nonexistent/logger.mjs'), /--inject \/nonexistent\/logger\.mjs: no such file/);
  await assert.rejects(loadInject(mod(`export const install = '1';`)), /export read \(an expression string, or a function \(\{seg, label\}\) returning one\)/);
  const c = await loadInject(mod(`export const install = () => 42; export const read = '1';`));
  assert.throws(() => c.install(0), /install\(\) must return an expression string/);
});

/** A page for runProgram with no strokes: records what is evaluated, in order. */
function fakePage(readValue) {
  const calls = [];
  return {
    calls,
    page: {
      install: async () => { calls.push('recorder install'); },
      state: async () => ({ y: 0, maxY: 1000, ih: 775, pageT: 0, vis: 'visible', iw: 430, macBefore: 0, macAfter: 0 }),
      read: async () => { calls.push('recorder read'); return { frames: [], touches: [], marks: [] }; },
      evaluate: async (e) => { calls.push(`evaluate ${e}`); return e === 'READ' ? readValue : 'ok'; },
    },
  };
}

test('I-038 runProgram --inject: install after the recorder install, read after the recorder read, on the page\'s own evaluate; values in run.inject (morph: also run.morph)', async () => {
  const inject = { name: 'n', morph: true, install: (seg) => `INSTALL ${seg}`, read: () => 'READ' };
  const { page, calls } = fakePage(JSON.stringify({ frames: [[0, 16, 0, 1, 'm']], summary: { frames: 1 } }));
  const res = await runProgram({ ops: [] }, { wda: {}, page, inject, log: () => {} });
  assert.deepEqual(calls, ['recorder install', 'evaluate INSTALL 0', 'recorder read', 'evaluate READ']);
  assert.deepEqual(res.inject, [{ seg: 0, name: 'n', value: { frames: [[0, 16, 0, 1, 'm']], summary: { frames: 1 } } }]);
  assert.deepEqual(res.morph, [{ seg: 0, frames: [[0, 16, 0, 1, 'm']], summary: { frames: 1 } }]);
  assert.deepEqual(res.errors, []);
  const plain = await runProgram({ ops: [] }, { wda: {}, page: fakePage(null).page, log: () => {} });
  assert.ok(!('inject' in plain), 'without --inject the run record has no inject key (unchanged)');
});

test('I-038 runProgram --inject: a failing read is an error entry, the recorder data is kept', async () => {
  const inject = { name: 'n', morph: false, install: () => 'I', read: () => 'READ' };
  const { page } = fakePage(null);
  page.evaluate = async (e) => { if (e === 'READ') throw new Error('Runtime.evaluate timed out after 15000ms'); return 'ok'; };
  const res = await runProgram({ ops: [] }, { wda: {}, page, inject, log: () => {} });
  assert.deepEqual(res.errors, ['inject read: Runtime.evaluate timed out after 15000ms']);
  assert.equal(res.segments.length, 1);
  assert.deepEqual(res.inject, []);
  assert.deepEqual(res.morph, []);
});

test('I-038 sources: --inject is a valued flag of iphone.mjs, refused together with --morph-log, and --morph-log warns', () => {
  assert.match(readFileSync(join(TOOLS, 'iphone.mjs'), 'utf8'), /const VALUED = \[[^\]]*'--inject'/);
  const g = readFileSync(join(TOOLS, 'lib', 'gesture-run.mjs'), 'utf8');
  assert.match(g, /if \(opt\('inject'\) && opt\('morph-log'\)\) throw new Error/);
  assert.match(g, /warning: --morph-log runs a separate process with its own inspector connection/);
});
