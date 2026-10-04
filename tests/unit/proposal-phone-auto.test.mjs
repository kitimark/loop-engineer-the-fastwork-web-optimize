// I-143 (user T-119): `proposal post|revise|publish|live` start the phone Try-it pages of every option with live pages,
// as `proposal phone` does (tools/lib/proposal-cli.mjs startPhones / phoneWanted). Fake starter, no Try-it host, no
// network; the end-to-end run with the real host on 127.0.0.1 is in tests/e2e/console-live.test.mjs.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

let C;
before(async () => {
  process.env.FW_STATE_DIR = join(tempDir('fw-phone-auto-'), 'state');
  C = await import('../../tools/lib/proposal-cli.mjs');
});

const BLOB = (c) => c.repeat(40);
const live = (c) => ({ patch: `fixes/${c}/patch.diff`, blob: BLOB(c), base: 'site-pretty' });
const fakeStart = (calls, { fail = () => false } = {}) => async (l) => {
  calls.push(l.blob);
  if (fail(l)) throw new Error('the Try-it host exited (3): BASELINE-MODIFIED: test\nsecond line');
  return { a: { port: 6400, lan: 'http://lan:6400/', reused: true }, b: { port: 6401 + calls.length, lan: `http://lan:${6401 + calls.length}/`, reused: false } };
};
const capture = () => { const out = [], err = []; return { out, err, o: (s) => out.push(s), e: (s) => err.push(s) }; };

test('I-143 startPhones: one PHONE line per option with live pages; ports already up say "already running"; none/no-patch options skipped', async () => {
  const p = { id: 'PR-021', state: 'proposed', options: [{ name: 'full', live: live('a') }, { name: 'keep', live: { none: 'Keep the original.' } }, { name: 'lite', live: live('b') }, { name: 'later' }] };
  const calls = [], c = capture();
  const r = await C.startPhones(p, { start: fakeStart(calls), out: c.o, err: c.e });
  assert.deepEqual(calls, [BLOB('a'), BLOB('b')]);
  assert.deepEqual(r.map((x) => [x.what, x.ok]), [['PR-021 option full', true], ['PR-021 option lite', true]]);
  assert.equal(c.out[0], 'PHONE PR-021 option full: A http://lan:6400/ (already running), B http://lan:6402/ (started)');
  assert.equal(c.out[1], 'PHONE PR-021 option lite: A http://lan:6400/ (already running), B http://lan:6403/ (started)');
  assert.match(c.out[2], /stay up after the decision; stop: node tools\/console\.mjs proposal phone PR-021 --option <name> --stop/);
  assert.deepEqual(c.err, []);
  // only one option (proposal live --option lite)
  const c2 = capture(), calls2 = [];
  await C.startPhones(p, { start: fakeStart(calls2), only: 'lite', out: c2.o, err: c2.e });
  assert.deepEqual(calls2, [BLOB('b')]);
  // a proposal without options
  const c3 = capture(), calls3 = [];
  await C.startPhones({ id: 'PR-022', state: 'accepted', live: live('c') }, { start: fakeStart(calls3), out: c3.o, err: c3.e });
  assert.equal(c3.out[0], 'PHONE PR-022: A http://lan:6400/ (already running), B http://lan:6402/ (started)');
  assert.match(c3.out[1], /stop: node tools\/console\.mjs proposal phone PR-022 --stop/);
});

test('I-143 startPhones: a draft or withdrawn proposal starts nothing; a failed start is a warning with the retry command, the rest still start', async () => {
  for (const state of ['draft', 'withdrawn']) {
    const calls = [], c = capture();
    assert.deepEqual(await C.startPhones({ id: 'PR-023', state, live: live('a') }, { start: fakeStart(calls), out: c.o, err: c.e }), []);
    assert.deepEqual([calls, c.out, c.err], [[], [], []], state);
  }
  const p = { id: 'PR-024', state: 'proposed', options: [{ name: 'x', live: live('a') }, { name: 'y', live: live('b') }] };
  const calls = [], c = capture();
  const r = await C.startPhones(p, { start: fakeStart(calls, { fail: (l) => l.blob === BLOB('a') }), out: c.o, err: c.e });
  assert.deepEqual(r.map((x) => x.ok), [false, true]);
  assert.deepEqual(c.err, ['warning: PR-024 option x: the phone pages did not start (the Try-it host exited (3): BASELINE-MODIFIED: test); start them later: node tools/console.mjs proposal phone PR-024 --option x']);
  assert.match(c.out[0], /^PHONE PR-024 option y: /);
  // every start failed: warnings only, no "stay up" line
  const c2 = capture();
  await C.startPhones({ id: 'PR-025', state: 'proposed', live: live('a') }, { start: fakeStart([], { fail: () => true }), out: c2.o, err: c2.e });
  assert.deepEqual(c2.out, []);
  assert.equal(c2.err.length, 1);
});

test('I-143 phoneWanted: on by default; --no-phone or FW_PROPOSAL_PHONE=off|0|no|false turns it off', () => {
  const a = C.parseArgs(['post', '--file', 'x.json']);
  assert.equal(C.phoneWanted(a, {}), true);
  assert.equal(C.phoneWanted(a, { FW_PROPOSAL_PHONE: 'on' }), true);
  assert.equal(C.phoneWanted(a, { FW_PROPOSAL_PHONE: '' }), true);
  for (const v of ['off', 'OFF', '0', 'no', 'false']) assert.equal(C.phoneWanted(a, { FW_PROPOSAL_PHONE: v }), false, v);
  assert.equal(C.phoneWanted(C.parseArgs(['post', '--no-phone', '--file', 'x.json']), {}), false);
});

test('I-143 run(): post, revise, publish and live call the phone start; the test env default (helpers cleanEnv) is off', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../tools/lib/proposal-cli.mjs', import.meta.url), 'utf8');
  assert.equal((src.match(/await autoPhones\(p, a, deps/g) || []).length, 4, 'post, revise, publish, live');
  const helpers = readFileSync(new URL('../helpers.mjs', import.meta.url), 'utf8');
  assert.match(helpers, /env\.FW_PROPOSAL_PHONE = 'off';/);
});
