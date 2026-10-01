// tools/lib/host.mjs T8+ (incident I-033): the display / wake / power state of the Mac per run (U1: the plain
// baseline measured 63.5-78.3 fps with the display on vs 92.2-93.8 in DarkWake), the HOST-DISPLAY-CHANGED
// verdict tag, and Chrome's field-trial state on disk (U8). Every command output is synthetic
// (tests/fixtures/pmset-outputs.mjs); nothing here reads the real machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tempDir } from '../helpers.mjs';
import * as host from '../../tools/lib/host.mjs';
import * as P from '../fixtures/pmset-outputs.mjs';

test('parsers: systemstate capabilities (Graphics = FullWake), power source, system-wide assertions, CGDisplayIsAsleep', () => {
  assert.deepEqual(host.parseSystemState(P.systemState(true)), { capabilities: ['CPU', 'Graphics', 'Audio', 'Network'], fullWake: true });
  assert.deepEqual(host.parseSystemState(P.systemState(false)), { capabilities: ['CPU', 'Network'], fullWake: false }, 'DarkWake');
  assert.equal(host.parseSystemState(''), null);
  assert.equal(host.parseSystemState(null), null);
  assert.equal(host.parsePowerSource(P.powerSource(true)), 'AC');
  assert.equal(host.parsePowerSource(P.powerSource(false)), 'battery');
  assert.equal(host.parsePowerSource("Now drawing from 'UPS Power'\n"), 'UPS');
  assert.equal(host.parsePowerSource('garbage'), null);
  const a = host.parseAssertions(P.assertions({ displayAssert: 0, systemAssert: 1, userActive: 1 }));
  assert.equal(a.PreventUserIdleDisplaySleep, 0, 'the system-wide count, not the caffeinate -d line in the per-process list');
  assert.equal(a.PreventUserIdleSystemSleep, 1);
  assert.equal(a.UserIsActive, 1);
  assert.equal(Object.keys(a).length, 10, 'only the system-wide block');
  assert.equal(host.parseAssertions('no assertions here'), null);
  assert.equal(host.parseDisplayAsleep(P.displayAsleep(true)), 'on');
  assert.equal(host.parseDisplayAsleep(P.displayAsleep(false)), 'off');
  assert.equal(host.parseDisplayAsleep('true'), 'off');
  assert.equal(host.parseDisplayAsleep('false'), 'on');
  assert.equal(host.parseDisplayAsleep(''), null);
  assert.equal(host.parseDisplayAsleep('execution error: ...'), null);
});

const samplers = ({ display = true, fullWake = true, ac = true, displayAssert = 1 } = {}) => ({
  now: () => Date.parse('2026-10-01T04:00:48Z'),
  pmsetSystemState: () => P.systemState(fullWake), pmsetPs: () => P.powerSource(ac),
  pmsetAssertions: () => P.assertions({ displayAssert }), displayAsleep: () => P.displayAsleep(display),
});

test('hostPower(): display, wake, power source and the sleep-preventing assertions; never throws', async () => {
  assert.deepEqual(await host.hostPower({ samplers: samplers() }), {
    at: '2026-10-01T04:00:48.000Z', display: 'on', fullWake: true, capabilities: ['CPU', 'Graphics', 'Audio', 'Network'], powerSource: 'AC',
    displaySleepPrevented: true, systemSleepPrevented: true, userActive: true,
  });
  // the 04:00Z canary's state: DarkWake, display off, nobody holding the display awake
  const dark = await host.hostPower({ samplers: samplers({ display: false, fullWake: false, displayAssert: 0 }) });
  assert.deepEqual([dark.display, dark.fullWake, dark.powerSource, dark.displaySleepPrevented], ['off', false, 'AC', false]);
  // a failing command (non-zero exit -> null, a throw, garbage) gives null for its fields only
  const broken = await host.hostPower({ samplers: { ...samplers({ ac: false }), displayAsleep: () => null, pmsetSystemState: () => { throw new Error('pmset'); }, pmsetAssertions: () => 'x' } });
  assert.deepEqual([broken.display, broken.fullWake, broken.capabilities, broken.powerSource, broken.displaySleepPrevented, broken.systemSleepPrevented], [null, null, null, 'battery', null, null]);
  // inside node --test without a stub the real samplers refuse (I-024): all unknown, no throw
  const refused = await host.hostPower();
  assert.deepEqual([refused.display, refused.fullWake, refused.powerSource, refused.at], [null, null, null, null]);
});

const P_ON = { display: 'on', fullWake: true, powerSource: 'AC', displaySleepPrevented: true };
const P_OFF = { display: 'off', fullWake: false, powerSource: 'AC', displaySleepPrevented: false };
const run = (label, i, start, end = start, chrome) => ({ label, run: i, power: { start, end }, ...(chrome ? { chrome } : {}) });

test('hostStateSummary(): one state throughout -> no tag; a change within a run, between runs or between the arms -> HOST-DISPLAY-CHANGED', () => {
  const same = host.hostStateSummary([run('base', 0, P_ON), run('fix', 0, P_ON), run('fix', 1, P_ON), run('base', 1, P_ON)]);
  assert.deepEqual([same.recorded, same.changed, same.tag, same.reasons], [true, false, null, []]);
  assert.deepEqual([same.display, same.fullWake, same.powerSource, same.displaySleepPrevented], [['on'], [true], ['AC'], [true]]);
  assert.match(host.describeHostState(same), /^host state: display on, FullWake, power AC, display-sleep assertion yes$/);
  // the display went to sleep inside run 2 of fix
  const within = host.hostStateSummary([run('base', 0, P_ON), run('fix', 0, P_ON), run('fix', 1, P_ON, P_OFF), run('base', 1, P_OFF)]);
  assert.equal(within.tag, 'HOST-DISPLAY-CHANGED');
  assert.equal(host.HOST_DISPLAY_TAG, 'HOST-DISPLAY-CHANGED');
  assert.deepEqual(within.reasons, ['fix run 2: display on, FullWake at the start, display off, DarkWake at the end']);
  // each arm constant, but in another state (the display slept between the arms of an AABB-like order)
  const arms = host.hostStateSummary([run('base', 0, P_ON), run('fix', 0, P_OFF)]);
  assert.equal(arms.tag, 'HOST-DISPLAY-CHANGED');
  assert.deepEqual(arms.reasons, ['the arms differ: base display on, FullWake vs fix display off, DarkWake']);
  assert.deepEqual(arms.byLabel, { base: { display: ['on'], fullWake: [true] }, fix: { display: ['off'], fullWake: [false] } });
  // between runs of one arm only
  const between = host.hostStateSummary([run('base', 0, P_ON), run('base', 1, P_OFF), run('fix', 0, P_ON)]);
  assert.equal(between.tag, 'HOST-DISPLAY-CHANGED');
  assert.match(between.reasons[0], /not the same in every run: display on\/off, fullWake true\/false/);
  // wake alone (display reading unknown) counts too; power source and the assertion alone do not
  assert.equal(host.hostStateSummary([run('a', 0, { fullWake: true }), run('b', 0, { fullWake: false })]).tag, 'HOST-DISPLAY-CHANGED');
  assert.equal(host.hostStateSummary([run('a', 0, P_ON), run('b', 0, { ...P_ON, powerSource: 'battery', displaySleepPrevented: false })]).tag, null);
  // unknown readings never make a change; nothing known: not recorded, no tag
  const partial = host.hostStateSummary([run('a', 0, P_ON), run('b', 0, { display: null, fullWake: null })]);
  assert.equal(partial.tag, null);
  const none = host.hostStateSummary([run('a', 0, { display: null, fullWake: null }), { label: 'b', run: 0 }]);
  assert.deepEqual([none.recorded, none.tag], [false, null]);
  assert.equal(host.describeHostState(none), 'host state: not recorded');
  assert.equal(host.describeHostState(undefined), 'host state: not recorded');
  assert.match(host.describeHostState(within), /display on\/off, FullWake\/DarkWake, .*; HOST-DISPLAY-CHANGED: fix run 2/);
  // Chrome version and field-trial state: distinct values over the runs (log only)
  const ch = host.hostStateSummary([run('a', 0, P_ON, P_ON, { version: 'Chrome/154', featureStateSha256: 'f1', variationsSeedSha256: 's1' }), run('b', 0, P_ON, P_ON, { version: 'Chrome/154', featureStateSha256: 'f2', variationsSeedSha256: 's1' })]);
  assert.deepEqual([ch.chromeVersions, ch.featureStateSha256, ch.variationsSeedSha256, ch.tag], [['Chrome/154'], ['f1', 'f2'], ['s1'], null]);
});

test('chromeProfileState(): sha256 of ChromeFeatureState and of the variations seed serial, the seed date; nulls when unreadable', () => {
  const d = tempDir('fw-profile-');
  assert.deepEqual(host.chromeProfileState(d), { featureStateSha256: null, featureStateMtime: null, variationsSeedSha256: null, variationsSeedDate: null });
  assert.deepEqual(host.chromeProfileState(null), { featureStateSha256: null, featureStateMtime: null, variationsSeedSha256: null, variationsSeedDate: null });
  const fs = JSON.stringify({ 'enable-features': 'A<StudyA,B', 'disable-features': 'C', 'force-fieldtrials': 'StudyA/Group1', 'force-fieldtrial-params': '' });
  writeFileSync(join(d, 'ChromeFeatureState'), fs);
  // Chrome time: microseconds since 1601-01-01; 13435321863000000 = 2026-10-01T09:51:03Z (U8: seed fetched at 09:51Z)
  writeFileSync(join(d, 'Local State'), JSON.stringify({ variations_seed_serial_number: 'SERIAL-1', variations_seed_date: '13435321863000000', other: { secret: 'x' } }));
  const s = host.chromeProfileState(d);
  const sha = (x) => createHash('sha256').update(x).digest('hex');
  assert.equal(s.featureStateSha256, sha(fs));
  assert.equal(s.variationsSeedSha256, sha('SERIAL-1'));
  assert.equal(s.variationsSeedDate, '2026-10-01T09:51:03.000Z');
  assert.match(s.featureStateMtime, /^\d{4}-\d\d-\d\dT/);
  assert.equal(JSON.stringify(s).includes('SERIAL-1'), false, 'hashes only');
  // a Local State that is not JSON: the feature state is still read
  const d2 = tempDir('fw-profile-'); mkdirSync(d2, { recursive: true });
  writeFileSync(join(d2, 'ChromeFeatureState'), fs); writeFileSync(join(d2, 'Local State'), '{broken');
  assert.deepEqual([host.chromeProfileState(d2).featureStateSha256, host.chromeProfileState(d2).variationsSeedSha256], [sha(fs), null]);
});

test('classifyRun(): a host sleep in the lock gate before the hold warns (the run itself came after the wake, I-033)', () => {
  assert.deepEqual(host.classifyRun({ gateSleptSec: 27 }).warnings, ["host slept 27 s in the lock's host gate before this hold"]);
  assert.equal(host.classifyRun({ gateSleptSec: 27 }).loadInvalid, false);
  assert.deepEqual(host.classifyRun({ gateSleptSec: 0 }).warnings, []);
});
