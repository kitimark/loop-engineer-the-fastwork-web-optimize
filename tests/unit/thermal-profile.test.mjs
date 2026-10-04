// I-186: the phone's thermal test profile (tools/lib/thermal-profile.mjs): the gate verdict (a port of
// research/phone-thermal-gate/verdict.mjs, its 16 self-test cases plus the tools' serious/fair profiles), the xctrace
// table parser (fixture XML in xctrace's id/ref shape, tests/fixtures/fake-thermal.mjs), the read (fake process runner,
// never the phone), the per-hold start-read cache, the refusal text and exit code, the console step de-duplication and
// the hold's end read that stamps the run records. $FW_STATE_DIR is a temp dir: no real ledger, step or lock.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, FAKE_THERMAL, TESTS } from '../helpers.mjs';
import { thermalXml } from '../fixtures/fake-thermal.mjs';

const P = await import('../../tools/lib/thermal-profile.mjs');
const C = await import('../../tools/lib/console.mjs');
const { gateVerdict: v } = P;

beforeEach(() => { process.env.FW_STATE_DIR = tempDir('fw-thermal-'); });

test('gateVerdict: the 16 cases of research/phone-thermal-gate/selftest.mjs, unchanged', () => {
  const slow = { median: 30 }, fast = { median: 8 };
  const t = (got, code, profile, why) => { assert.equal(got.code, code, got.why); assert.equal(got.profile, profile); if (why) assert.match(got.why, why); };
  t(v({ state: 'Serious', induced: 'No', battC: 39, timer: slow }), 0, 'real-serious');
  t(v({ state: 'Serious', induced: 'Yes', battC: 39 }), 4, 'real-serious');
  t(v({ state: 'Fair', induced: 'No', battC: 37 }), 2, 'real-serious');
  t(v({ state: 'Serious', induced: 'No', battC: 39, timer: fast }), 6, 'real-serious');
  t(v({ state: 'Fair', induced: 'No', battC: 37, expect: 'fair', timer: fast }), 0, 'real-fair');
  t(v({ state: 'Serious', induced: 'No', battC: 39, expect: 'fair' }), 5, 'real-fair');
  t(v({ err: 'xctrace record exit 1' }), 1, 'real-serious');
  t(v({ state: 'Serious', induced: 'No', battC: 44.1 }), 3, 'real-serious');
  t(v({ state: 'Serious', induced: 'Yes', battC: 33, acceptInduced: true }), 0, 'xcode-serious');
  t(v({ state: 'Serious', induced: 'Yes', battC: 33, acceptInduced: true, timer: fast }), 0, 'xcode-serious');
  t(v({ state: 'Serious', induced: 'No', battC: 39, acceptInduced: true }), 7, 'xcode-serious', /real heat/);
  t(v({ state: 'Nominal', induced: 'No', battC: 33, acceptInduced: true }), 2, 'xcode-serious');
  t(v({ state: 'Critical', induced: 'Yes', battC: 33, acceptInduced: true }), 3, 'xcode-serious');
  t(v({ state: 'Serious', induced: 'Yes', battC: 44, acceptInduced: true }), 3, 'xcode-serious');
  t(v({ err: 'x', acceptInduced: true }), 1, 'xcode-serious');
  t(v({ state: 'Fair', induced: 'Yes', battC: 37, expect: 'fair', acceptInduced: true }), 4, 'real-fair');
});

test('profileVerdict: serious = xcode-serious, fair = real-fair, every state x induced, ceiling 44 C / Critical in both', () => {
  const want = {
    serious: { 'Nominal No': 2, 'Nominal Yes': 2, 'Fair No': 2, 'Fair Yes': 2, 'Serious No': 7, 'Serious Yes': 0, 'Critical No': 3, 'Critical Yes': 3 },
    fair: { 'Nominal No': 0, 'Nominal Yes': 4, 'Fair No': 0, 'Fair Yes': 4, 'Serious No': 5, 'Serious Yes': 4, 'Critical No': 3, 'Critical Yes': 3 },
  };
  for (const [profile, cases] of Object.entries(want)) {
    for (const [k, code] of Object.entries(cases)) {
      const [state, induced] = k.split(' ');
      const r = P.profileVerdict(profile, { state, induced, battC: 33 });
      assert.equal(r.code, code, `${profile} ${k}: ${r.why}`);
      assert.equal(r.profile, P.PROFILES[profile].gate);
    }
    // the battery ceiling in every profile, a missing read is code 1, a missing battery is no ceiling
    const fit = profile === 'serious' ? { state: 'Serious', induced: 'Yes' } : { state: 'Fair', induced: 'No' };
    assert.equal(P.profileVerdict(profile, { ...fit, battC: 43.9 }).code, 0);
    assert.equal(P.profileVerdict(profile, { ...fit, battC: 44 }).code, 3);
    assert.equal(P.profileVerdict(profile, { ...fit, battC: null }).code, 0);
    assert.equal(P.profileVerdict(profile, { error: 'xctrace record exit 1' }).code, 1);
  }
});

test('parseProfile: serious by default, fair, and nothing else (no "none")', () => {
  assert.equal(P.parseProfile(undefined), 'serious');
  assert.equal(P.parseProfile('fair'), 'fair');
  assert.equal(P.parseProfile('serious'), 'serious');
  for (const bad of ['none', '', 'Serious', 'real-serious', 'xcode-serious']) assert.throws(() => P.parseProfile(bad), /--profile must be serious .* or fair .*There is no profile "none"/);
  assert.equal(P.EXIT_PROFILE, 8);
});

test('parseThermalTable: the export captured on our phone under Xcode\'s Serious (Current + Induced rows, refs); the research parser\'s rules', () => {
  // the exact export of 2026-10-04 22:10Z (research/phone-thermal-gate, 023caa54): row 2 (Induced) is all refs
  const captured = readFileSync(join(TESTS, 'fixtures', 'thermal-induced-serious-2rows.xml'), 'utf8');
  let t = P.parseThermalTable(captured);
  assert.equal(t.schema, 'device-thermal-state-intervals');
  assert.deepEqual([t.rows.length, t.state, t.induced, t.changed, t.error], [2, 'Serious', 'Yes', false, null]);
  assert.deepEqual(t.rows.map((r) => [r.track, r.state, r.induced]), [['Current', 'Serious', 'No'], ['Induced', 'Serious', 'Yes']]);
  assert.equal(P.profileVerdict('serious', { ...t, battC: 36.5 }).code, 0, 'xcode-serious passes');
  assert.equal(P.profileVerdict('fair', { ...t, battC: 36.5 }).code, 4, 'fair refuses an induced condition');
  // the fake's export has the same shape: real heat = one Current row (induced No); the condition adds the Induced row
  assert.equal(P.parseThermalTable(thermalXml([{ state: 'Serious', induced: 'No' }])).rows.length, 1);
  t = P.parseThermalTable(thermalXml([{ state: 'Serious', induced: 'Yes' }, { state: 'Serious', induced: 'Yes' }, { state: 'Serious', induced: 'Yes' }]));
  assert.deepEqual([t.rows.length, t.state, t.induced, t.changed, t.error], [6, 'Serious', 'Yes', false, null], 'ref="n" rows resolve');
  assert.match(thermalXml([{ state: 'Fair', induced: 'No' }, { state: 'Fair', induced: 'No' }]), /<thermal-state ref="\d+"\/>/, 'the fake uses the ref form');
  // the Induced row before the Current row: still induced Yes, the state from the Current row
  t = P.parseThermalTable(`<trace-query-result><node><schema name="device-thermal-state-intervals"><col><mnemonic>thermal-state</mnemonic></col><col><mnemonic>track-label</mnemonic></col><col><mnemonic>is-induced</mnemonic></col></schema><row><thermal-state id="1" fmt="Serious">Serious</thermal-state><string id="2" fmt="Induced">Induced</string><boolean id="3" fmt="Yes">1</boolean></row><row><thermal-state ref="1"/><string id="4" fmt="Current">Current</string><boolean id="5" fmt="No">0</boolean></row></node></trace-query-result>`);
  assert.deepEqual([t.rows.map((r) => r.track).join(), t.state, t.induced, t.error], ['Induced,Current', 'Serious', 'Yes', null]);
  // a change in the Current track is an error (not one state over the read)
  t = P.parseThermalTable(thermalXml([{ state: 'Nominal', induced: 'No' }, { state: 'Serious', induced: 'Yes' }]));
  assert.deepEqual([t.state, t.induced, t.changed], ['Serious', 'Yes', true]);
  assert.equal(t.error, 'state changed during the read (3 rows)');
  // an unresolvable ref is an error, not a guess
  t = P.parseThermalTable(thermalXml([{ state: 'Fair', induced: 'No' }]).replace(/<thermal-state id="\d+" fmt="Fair">Fair<\/thermal-state>/, '<thermal-state ref="99"/>'));
  assert.deepEqual([t.state, t.error], [null, 'unresolvable thermal-state cell (1 rows)']);
  // labelled rows without a Current row
  t = P.parseThermalTable(captured.replace('fmt="Current">Current<', 'fmt="Other">Other<'));
  assert.match(t.error, /^no Current-track row/);
  // no schema: by value; unlabelled rows count as Current
  t = P.parseThermalTable(`<trace-query-result><node><row><start-time fmt="00:00.000">0</start-time><thermal-state fmt="Fair">Fair</thermal-state><boolean fmt="No">0</boolean></row></node></trace-query-result>`);
  assert.deepEqual([t.state, t.induced, t.rows.length, t.error], ['Fair', 'No', 1, null]);
  t = P.parseThermalTable(`<trace-query-result><node xpath='x'><schema name="device-thermal-state-intervals"><col><mnemonic>thermal-state</mnemonic></col><col><mnemonic>is-induced</mnemonic></col></schema><row><thermal-state id="1">Critical</thermal-state><boolean id="2">1</boolean></row></node></trace-query-result>`);
  assert.deepEqual([t.state, t.induced], ['Critical', 'Yes'], 'raw text when there is no fmt');
  t = P.parseThermalTable('<trace-query-result><node></node></trace-query-result>');
  assert.deepEqual([t.rows.length, t.state, t.induced, t.changed, t.error], [0, null, null, false, 'no thermal state row in the trace']);
});

/** A process runner that plays xctrace + idevicediagnostics; records the calls. */
function fakeExec({ state = 'Serious', induced = 'Yes', batt = 33.5, recordCode = 0, rows = 2 } = {}) {
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const a = args[0] === 'xctrace' ? args.slice(1) : args;
    if (a[0] === 'record') return { code: recordCode, error: null, stdout: '' };
    if (a[0] === 'export') return { code: 0, error: null, stdout: thermalXml(Array.from({ length: rows }, () => ({ state, induced }))) };
    if (a[0] === 'ioregentry') return { code: 0, error: null, stdout: `<plist><dict><key>Temperature</key><integer>${Math.round(batt * 100)}</integer></dict></plist>` };
    return { code: 1, error: null, stdout: '' };
  };
  return { exec, calls };
}

test('readThermal: xcrun xctrace record (device, all processes, 10 s) + export of the thermal table + one battery read; errors by exit code only', async () => {
  const f = fakeExec();
  let r = await P.readThermal({ env: {}, udid: 'DEV-1', exec: f.exec });
  assert.deepEqual([r.state, r.induced, r.battC, r.rows, r.error], ['Serious', 'Yes', 33.5, 4, null], '2 intervals, Current + Induced rows each');
  assert.equal(f.calls[0][0], 'xcrun');
  assert.deepEqual(f.calls[0].slice(1, 10), ['xctrace', 'record', '--instrument', 'Thermal State', '--device', 'DEV-1', '--all-processes', '--time-limit', '10s']);
  assert.ok(f.calls[1].includes('/trace-toc/run[@number="1"]/data/table[@schema="device-thermal-state-intervals"]'));
  assert.deepEqual(f.calls[2], ['idevicediagnostics', 'ioregentry', 'AppleSmartBattery']);
  r = await P.readThermal({ env: {}, udid: 'DEV-1', exec: fakeExec({ recordCode: 9 }).exec });
  assert.deepEqual([r.state, r.error], [null, 'xctrace record exit 9']);
  assert.doesNotMatch(JSON.stringify(r), /DEV-1/, 'the device id is never in the read');
  r = await P.readThermal({ env: {}, udid: 'DEV-1', exec: fakeExec({ rows: 0 }).exec });
  assert.equal(r.error, 'no thermal state row in the trace');
  const wda = process.env.FW_WDA_HOME;
  process.env.FW_WDA_HOME = tempDir('fw-wdahome-'); // no runner config: no udid (never the real one)
  try { r = await P.readThermal({ env: {}, exec: fakeExec().exec }); } finally { if (wda === undefined) delete process.env.FW_WDA_HOME; else process.env.FW_WDA_HOME = wda; }
  assert.match(r.error, /no device/);
  // $FW_XCTRACE / $FW_THERMAL_BATTERY: a .mjs stand-in runs under node (the tests' fake; the real path never)
  r = await P.readThermal({ env: { FW_XCTRACE: FAKE_THERMAL, FW_THERMAL_BATTERY: FAKE_THERMAL, FW_THERMAL_UDID: 'X', FAKE_THERMAL_STATE: 'Fair', FAKE_THERMAL_INDUCED: 'No' } });
  assert.equal(r.error, null);
  assert.equal(typeof r.battC, 'number');
});

const hold = (token = 'tok1', resource = 'chrome-measure') => ({ resource, token, owner: 'runner' });
const counter = (read) => { const c = { n: 0 }; c.read = async () => { c.n++; return { at: new Date().toISOString(), ms: 25000, error: null, rows: 1, ...read() }; }; return c; };

test('startGate: one read per hold and profile (later runs reuse a passing start read); a new hold or another profile reads again', async () => {
  const c = counter(() => ({ state: 'Serious', induced: 'Yes', battC: 34 }));
  const lines = [];
  const a = await P.startGate({ profile: 'serious', owner: 'runner', hold: hold(), read: c.read, log: (l) => lines.push(l) });
  assert.equal(a.cached, false);
  assert.match(lines[0], /^PROFILE serious ok at the hold's start: phone is Serious \(induced by Xcode\), battery 34 C \(gate xcode-serious; read 25 s\)$/);
  for (let i = 0; i < 4; i++) {
    const b = await P.startGate({ owner: 'runner', hold: hold(), read: c.read, log: () => {} });
    assert.equal(b.cached, true);
    assert.deepEqual(b.record().start, { ...a.record().start, cached: true });
  }
  assert.equal(c.n, 1, 'scroll x 5 in one hold: one read');
  await P.startGate({ owner: 'runner', hold: hold('tok2'), read: c.read, log: () => {} });
  assert.equal(c.n, 2, 'a new hold reads again');
  await assert.rejects(P.startGate({ profile: 'fair', owner: 'runner', hold: hold(), read: c.read, log: () => {}, postStep: null }), (e) => e.exitCode === 8);
  assert.equal(c.n, 3, 'another profile in the same hold reads');
  await P.startGate({ owner: 'runner', hold: hold(), read: c.read, log: () => {}, force: true });
  assert.equal(c.n, 4, 'force (iphone.mjs profile) always reads');
  const rec = a.record();
  assert.deepEqual([rec.name, rec.gate, rec.hold, rec.start.state, rec.start.induced, rec.start.battC, rec.start.code, rec.end, rec.drift], ['serious', 'xcode-serious', 'chrome-measure:tok1', 'Serious', 'Yes', 34, 0, null, null]);
  // no hold: reads, keeps nothing
  const d = counter(() => ({ state: 'Serious', induced: 'Yes', battC: 34 }));
  await P.startGate({ owner: 'runner', hold: null, read: d.read, log: () => {} });
  await P.startGate({ owner: 'runner', hold: null, read: d.read, log: () => {} });
  assert.equal(d.n, 2);
});

test('startGate: a misfit is not cached and invalidates a kept start read; the next run reads again', async () => {
  let state = 'Nominal';
  const c = counter(() => ({ state, induced: 'No', battC: 31 }));
  const opts = { owner: 'runner', hold: hold(), read: c.read, log: () => {}, postStep: null };
  await assert.rejects(P.startGate(opts), P.ProfileRefusal);
  await assert.rejects(P.startGate(opts), P.ProfileRefusal);
  assert.equal(c.n, 2);
  state = 'Serious';
  const ok = counter(() => ({ state: 'Serious', induced: 'Yes', battC: 31 }));
  await P.startGate({ ...opts, read: ok.read });
  await P.startGate({ ...opts, read: ok.read });
  assert.equal(ok.n, 1);
  await assert.rejects(P.startGate({ ...opts, force: true }), P.ProfileRefusal); // a profile check mid-hold finds Nominal
  const again = counter(() => ({ state: 'Serious', induced: 'Yes', battC: 31 }));
  await P.startGate({ ...opts, read: again.read });
  assert.equal(again.n, 1, 'the invalidated start read is not reused');
});

test('refusalText / ProfileRefusal: plain words, what to switch in Xcode, exit 8', async () => {
  const t = (profile, read) => P.refusalText(profile, read, P.profileVerdict(profile, read));
  let r = t('serious', { state: 'Nominal', induced: 'No', battC: 31.2 });
  assert.equal(r.fix, 'set-serious');
  assert.equal(r.line, 'REFUSED profile serious (Serious, induced by Xcode): phone is Nominal, battery 31.2 C; set Xcode > Window > Devices and Simulators > the phone > Device Conditions > Thermal State > Serious > Start (leave it on), then run again (gate xcode-serious code 2, I-186)');
  r = t('serious', { state: 'Serious', induced: 'No', battC: 40 });
  assert.match(r.line, /phone is Serious \(real heat, not induced\), battery 40 C; set Xcode > .* > Serious > Start/);
  assert.equal(r.fix, 'set-serious');
  r = t('serious', { state: 'Serious', induced: 'Yes', battC: 44.5 });
  assert.equal(r.fix, null, 'the Xcode condition is right; the battery is too hot');
  assert.match(r.line, /ceiling .*node tools\/wait\.mjs phone-temp --below auto/);
  r = t('serious', { state: 'Critical', induced: 'Yes', battC: 33 });
  assert.equal(r.fix, 'set-serious');
  assert.match(r.line, /the Xcode condition is Critical, above the ceiling; set Xcode > .* > Serious > Start/);
  r = t('fair', { state: 'Critical', induced: 'Yes', battC: 33 });
  assert.equal(r.fix, 'stop-condition');
  r = t('fair', { state: 'Critical', induced: 'No', battC: 40 });
  assert.equal(r.fix, null);
  r = t('fair', { state: 'Serious', induced: 'Yes', battC: 33 });
  assert.equal(r.fix, 'stop-condition');
  assert.match(r.line, /stop it: Xcode > .* Thermal State > Stop \(leave it off\)/);
  r = t('fair', { state: 'Serious', induced: 'No', battC: 40 });
  assert.equal(r.fix, null);
  assert.match(r.line, /too hot for the fair profile; let the phone cool/);
  r = t('serious', { error: 'xctrace record exit 1' });
  assert.equal(r.fix, null);
  assert.match(r.line, /could not read the thermal state \(xctrace record exit 1\)/);
  const e = await P.startGate({ owner: 'o', hold: null, read: async () => ({ state: 'Fair', induced: 'No', battC: 30 }), log: () => {}, postStep: null }).catch((x) => x);
  assert.ok(e instanceof P.ProfileRefusal);
  assert.equal(e.exitCode, 8);
  assert.match(e.message, /^REFUSED profile serious .*phone is Fair/);
});

test('the tester\'s console step: one action step per owner and profile while it is open, not a phone step (I-123 does not apply)', async () => {
  const read = async () => ({ state: 'Nominal', induced: 'No', battC: 30 });
  const msgs = [];
  for (let i = 0; i < 3; i++) {
    const e = await P.startGate({ owner: 'iphone-runner', hold: hold(), read, log: () => {} }).catch((x) => x);
    assert.equal(e.exitCode, 8);
    msgs.push(e.message);
  }
  let steps = C.list({ pending: true });
  assert.equal(steps.length, 1, 'posted once');
  const s = steps[0];
  assert.deepEqual([s.kind, s.by, s.status, s.parts.length, s.parts[0].record], ['action', 'iphone-runner', 'pending', 1, false]);
  assert.match(s.title, /^Xcode: set the iPhone's Thermal State to Serious \(test profile serious\)$/);
  assert.match(s.instructions, /Xcode choose Window > Devices and Simulators, click Devices and select the iPhone; under Device Conditions set Condition to Thermal State and Profile to Serious, then click Start\. Leave it on/);
  assert.deepEqual(s.meta.phoneProfile, { owner: 'iphone-runner', profile: 'serious', fix: 'set-serious', incident: 'I-186' });
  assert.match(msgs[0], new RegExp(`\\nSTEP ${s.id} posted on the user console`));
  assert.match(msgs[1], new RegExp(`\\nSTEP ${s.id} already open on the user console`));
  const { isPhoneStep } = await import('../../tools/lib/phone-step.mjs');
  assert.equal(isPhoneStep(s), false);
  // another owner, or the fair profile: their own step
  await P.startGate({ owner: 'fix-x', hold: hold(), read, log: () => {} }).catch(() => {});
  await P.startGate({ profile: 'fair', owner: 'iphone-runner', hold: hold(), read: async () => ({ state: 'Serious', induced: 'Yes', battC: 30 }), log: () => {} }).catch(() => {});
  steps = C.list({ pending: true });
  assert.equal(steps.length, 3);
  assert.match(steps[2].title, /stop the iPhone's thermal condition \(test profile fair\)/);
  // answered (the tester clicked Done): a later misfit posts a new step
  await C.start(s.id);
  await C.done(s.id);
  assert.equal(C.get(s.id).status, 'answered');
  await P.startGate({ owner: 'iphone-runner', hold: hold(), read, log: () => {} }).catch(() => {});
  assert.equal(C.list({ pending: true }).filter((x) => x.meta?.phoneProfile?.owner === 'iphone-runner' && x.meta.phoneProfile.profile === 'serious').length, 1);
  // no Xcode fix (no read): no step
  const n = C.list().length;
  await P.startGate({ owner: 'z', hold: hold(), read: async () => ({ error: 'xctrace record exit 1' }), log: () => {} }).catch(() => {});
  assert.equal(C.list().length, n);
});

test('closeHold: the end read stamps every run record of the hold (profile.end, profileDrift); drift keeps the data; one read per profile; no run, no read', async () => {
  const dir = tempDir('fw-thermal-runs-');
  const g = await P.startGate({ owner: 'runner', hold: hold(), read: async () => ({ state: 'Serious', induced: 'Yes', battC: 33 }), log: () => {} });
  const files = [join(dir, 'a.json'), join(dir, 'b.json')];
  for (const f of files) { writeFileSync(f, JSON.stringify({ meta: { owner: 'runner', profile: g.record() }, frames: [[1, 2, 3]] })); await g.saved(f); }
  await g.saved(files[0]); // listed once
  assert.equal(P.readLedger(g.key).runs.length, 2);
  const c = counter(() => ({ state: 'Nominal', induced: 'No', battC: 32 }));
  const lines = [];
  const s = await P.closeHold({ resource: 'chrome-measure', token: 'tok1', read: c.read, log: (l) => lines.push(l) });
  assert.equal(c.n, 1);
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].profile, s[0].drift, s[0].runs, s[0].stamped, s[0].end.state, s[0].end.code], ['serious', true, 2, 2, 'Nominal', 2]);
  assert.match(lines[0], /^PROFILE-DRIFT serious: at the hold's end the phone is Nominal, battery 32 C \(gate xcode-serious code 2: too cool \(Nominal\)\); 2 of 2 run records marked profileDrift: true \(data kept, I-186\)$/);
  for (const f of files) {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    assert.equal(j.meta.profileDrift, true);
    assert.deepEqual([j.meta.profile.start.state, j.meta.profile.end.state, j.meta.profile.end.induced, j.meta.profile.end.battC, j.meta.profile.drift], ['Serious', 'Nominal', 'No', 32, true]);
    assert.deepEqual(j.frames, [[1, 2, 3]], 'data kept');
  }
  assert.deepEqual(await P.closeHold({ resource: 'chrome-measure', token: 'tok1', read: c.read, log: () => {} }), [], 'closed once');
  assert.equal(c.n, 1);
  // a hold whose end read fits: drift false
  const h2 = await P.startGate({ owner: 'runner', hold: hold('tok3'), read: async () => ({ state: 'Serious', induced: 'Yes', battC: 33 }), log: () => {} });
  const f3 = join(dir, 'c.json');
  writeFileSync(f3, JSON.stringify({ meta: {} }));
  await h2.saved(f3);
  const s2 = await P.closeHold({ resource: 'chrome-measure', token: 'tok3', read: async () => ({ state: 'Serious', induced: 'Yes', battC: 35 }), log: () => {} });
  assert.equal(s2[0].drift, false);
  assert.equal(JSON.parse(readFileSync(f3, 'utf8')).meta.profileDrift, false);
  // a start read and no run: closed without a read
  await P.startGate({ owner: 'runner', hold: hold('tok4'), read: async () => ({ state: 'Serious', induced: 'Yes', battC: 33 }), log: () => {} });
  const z = counter(() => ({ state: 'Nominal' }));
  assert.deepEqual(await P.closeHold({ resource: 'chrome-measure', token: 'tok4', read: z.read, log: () => {} }), []);
  assert.equal(z.n, 0);
  assert.deepEqual(P.openLedgers({ resource: 'chrome-measure', token: 'tok4' }), []);
  assert.ok(!existsSync(join(dir, 'nope.json')));
});

test('currentHold: the lock.mjs run hold named in FW_LOCK_HELD, else the live iphone lease, else none', () => {
  const cm = { holder: { owner: 'g1-hold', token: 'c0ffee000001' }, stale: null };
  const ip = { holder: { owner: 'runner', token: 'beef00000002' }, stale: null };
  assert.deepEqual(P.currentHold({ env: { FW_LOCK_HELD: 'chrome-measure:c0ffee000001' }, cm, ip }), { resource: 'chrome-measure', token: 'c0ffee000001', owner: 'g1-hold' });
  assert.deepEqual(P.currentHold({ env: { FW_LOCK_HELD: 'chrome-measure:aaaaaaaaaaaa' }, cm, ip }), { resource: 'iphone', token: 'beef00000002', owner: 'runner' });
  assert.deepEqual(P.currentHold({ env: {}, cm, ip }), { resource: 'iphone', token: 'beef00000002', owner: 'runner' });
  assert.equal(P.currentHold({ env: {}, cm, ip: { holder: ip.holder, stale: 'expired' } }), null);
  assert.equal(P.currentHold({ env: {}, cm, ip: { holder: null } }), null);
});
