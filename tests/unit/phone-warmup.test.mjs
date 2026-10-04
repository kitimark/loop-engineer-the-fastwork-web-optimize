// I-176: an uncounted warm-up phone run (--warmup) may run beside ANOTHER agent's --no-timing chrome-measure hold (a
// build or CPU work on the Mac). The phone stamps its own frames, so a warm-up (whose numbers nobody counts) loses
// nothing to Mac load; a counted run, a sentinel/control run, and anything beside a normal (timing) hold still WAIT.
// phoneRunRefusal / phoneGuard / phoneMacRecord / phoneWarmup (lib/lock.mjs), measureGuard (lib/iphone-run.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneRunRefusal, phoneGuard, phoneMacRecord, phoneWarmup } from '../../tools/lib/lock.mjs';
import { measureGuard, parseRunArgs, USAGE } from '../../tools/lib/iphone-run.mjs';
import { tempDir } from '../helpers.mjs';

const env = { FW_STATE_DIR: tempDir('fw-warmup-') };
const noTiming = { holder: { owner: 'builder', noTiming: true, token: 't1' }, stale: false };
const timing = { holder: { owner: 'fix-ab', token: 't2' }, stale: false };

test('I-176: beside another owner\'s --no-timing hold a counted run WAITs, a --warmup run passes', () => {
  assert.match(phoneRunRefusal({ owner: 'me', st: noTiming, env }), /^WAIT: chrome-measure is held by "builder" \(a no-timing hold: a build or CPU work\)/);
  assert.equal(phoneRunRefusal({ owner: 'me', st: noTiming, env, warmup: true }), null);
});

test('I-176: the WAIT beside a --no-timing hold names --warmup (counted and sentinel runs cannot take it); beside a normal hold it does not offer it', () => {
  const why = phoneRunRefusal({ owner: 'me', st: noTiming, env });
  assert.match(why, /--warmup/);
  assert.match(why, /uncounted warm-up/);
  assert.match(why, /never a counted or sentinel\/control run/);
  assert.doesNotMatch(phoneRunRefusal({ owner: 'me', st: timing, env }), /uncounted warm-up/);
});

test('I-176: a timing (normal) hold still WAITs a --warmup run, with the reason', () => {
  const why = phoneRunRefusal({ owner: 'me', st: timing, env, warmup: true });
  assert.match(why, /^WAIT: chrome-measure is held by "fix-ab" \(a normal hold, e\.g\. a goal A\/B\)/);
  assert.match(why, /--warmup passes only beside a --no-timing hold/);
});

test('I-176: free, stale, short-lane and shared stand-in locks behave as before with or without --warmup', () => {
  for (const warmup of [false, true]) {
    assert.equal(phoneRunRefusal({ owner: 'me', st: { holder: null }, env, warmup }), null);
    assert.equal(phoneRunRefusal({ owner: 'me', st: { ...timing, stale: true }, env, warmup }), null);
    assert.equal(phoneRunRefusal({ owner: 'me', st: { holder: { owner: 'x', short: true }, stale: false }, env, warmup }), null);
    assert.equal(phoneRunRefusal({ owner: 'me', st: { holder: { owner: 'x', functional: true, weight: 1 }, stale: false }, env, warmup }), null);
  }
});

test('I-176: --warmup does not relax --require-quiet: a shared job still makes a quiet-Mac run wait', () => {
  const st = { holder: { owner: 'x', functional: true, weight: 1 }, stale: false };
  assert.match(phoneRunRefusal({ owner: 'me', st, env, warmup: true, requireQuiet: true }), /asks for a quiet Mac/);
});

test('I-176: --allow-during-measure and the runner\'s own hold are unchanged (own hold: no beside record)', () => {
  assert.equal(phoneRunRefusal({ owner: 'me', st: timing, env, allow: true, warmup: true }), null);
  const own = { holder: { owner: 'me', noTiming: true, token: 'tok' }, stale: false };
  assert.equal(phoneRunRefusal({ owner: 'me', st: own, env, warmup: true }), null);
  const g = phoneGuard({ owner: 'me', st: own, env, warmup: true, note: false, load1: 1 });
  assert.equal(g.warmup, true);
  assert.equal(g.beside, undefined, 'nothing was relaxed in the own hold');
});

test('I-176: phoneGuard beside a --no-timing hold: a NOTE, and warmup + beside {owner, kind} in the record\'s mac field', () => {
  const lines = [];
  const g = phoneGuard({ owner: 'me', st: noTiming, env, warmup: true, log: (l) => lines.push(l), load1: 2 });
  assert.deepEqual(g.beside, { owner: 'builder', kind: 'no-timing' });
  assert.equal(g.warmup, true);
  assert.ok(lines.some((l) => /^NOTE: uncounted warm-up run beside "builder"'s --no-timing hold/.test(l)), lines.join('\n'));
  const rec = phoneMacRecord(g, { at: 'x', shared: [], load1: 2 });
  assert.equal(rec.warmup, true);
  assert.deepEqual(rec.beside, { owner: 'builder', kind: 'no-timing' });
  assert.throws(() => phoneGuard({ owner: 'me', st: noTiming, env, load1: 2 }), /^Error: WAIT:/);
});

test('I-176: without --warmup the record has no warmup/beside keys (shape unchanged)', () => {
  const g = phoneGuard({ owner: 'me', st: { holder: null }, env, note: false, load1: 1 });
  assert.deepEqual(Object.keys(phoneMacRecord(g, { at: 'x' })).sort(), ['allow', 'end', 'requireQuiet', 'start']);
});

test('I-176: FW_PHONE_WARMUP=1 is --warmup (phoneWarmup)', () => {
  assert.equal(phoneWarmup({ FW_PHONE_WARMUP: '1' }), true);
  assert.equal(phoneWarmup({}), false);
  assert.equal(phoneWarmup({ FW_PHONE_WARMUP: '0' }), false);
  assert.equal(phoneRunRefusal({ owner: 'me', st: noTiming, env: { ...env, FW_PHONE_WARMUP: '1' } }), null);
});

test('I-176: run --warmup (the existing uncounted-run label) is what measureGuard relaxes; a sentinel control run (--arm C without --warmup) is not', () => {
  const o = parseRunArgs(['--driver', 'scroll', '--owner', 'me', '--warmup']);
  assert.equal(o.labels.warmup, true);
  assert.doesNotThrow(() => measureGuard(o, noTiming, env, { note: false }));
  const c = parseRunArgs(['--driver', 'scroll', '--owner', 'me', '--arm', 'C']);
  assert.equal(c.labels.warmup, false);
  assert.throws(() => measureGuard(c, noTiming, env, { note: false }), /^Error: WAIT:/);
  assert.throws(() => measureGuard(o, timing, env, { note: false }), /^Error: WAIT:/);
});

test('I-176: run --help says what --warmup does beside a no-timing hold and that sentinel/control runs must not take it', () => {
  assert.match(USAGE, /\[--warmup\][\s\S]*?--no-timing chrome-measure\s+hold[\s\S]*?never beside a timing hold/);
  assert.match(USAGE, /sentinel/i);
  assert.match(USAGE, /must not take --warmup/);
});
