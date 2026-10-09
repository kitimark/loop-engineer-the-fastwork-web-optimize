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

test('parseProfile: serious by default, real-serious (I-246), fair, and nothing else (no "none")', () => {
  assert.equal(P.parseProfile(undefined), 'serious');
  assert.equal(P.parseProfile('fair'), 'fair');
  assert.equal(P.parseProfile('serious'), 'serious');
  assert.equal(P.parseProfile('real-serious'), 'real-serious');
  for (const bad of ['none', '', 'Serious', 'xcode-serious', 'real-fair', 'real']) assert.throws(() => P.parseProfile(bad), /--profile must be serious .*, real-serious .* or fair .*There is no profile "none"/);
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

// I-250: on 2026-10-08 11:17Z the xctrace record of a thermal read hung (0 % CPU, ignored SIGTERM and SIGINT, only
// SIGKILL ended it ~9.5 min later); execFile's timeout sent SIGTERM to xcrun only and waited for its pipes.
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const gone = async (pids, ms = 3000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (!pids.some(alive)) return true; await new Promise((r) => setTimeout(r, 50)); } return !pids.some(alive); };
test('I-250 readThermal: a hung xctrace record (ignores SIGTERM and SIGINT, a helper in its group keeps stdout open) is killed with its whole process group at the bound and retried once; a second hang is the read\'s error (timedOut), each with one XCTRACE TIMEOUT line', { timeout: 30000 }, async () => {
  const d = tempDir('fw-i250-');
  const env = { FW_XCTRACE: FAKE_THERMAL, FW_THERMAL_BATTERY: FAKE_THERMAL, FW_THERMAL_UDID: 'SYNTH-UDID', FAKE_THERMAL_STATE: 'Fair', FAKE_THERMAL_INDUCED: 'No',
    FAKE_THERMAL_RECORD_HANG: '2', FAKE_THERMAL_HANG_COUNT: join(d, 'count'), FAKE_THERMAL_HANG_PIDS: join(d, 'pids') };
  const pids = () => readFileSync(env.FAKE_THERMAL_HANG_PIDS, 'utf8').trim().split('\n').map(Number);
  let lines = [];
  let t0 = Date.now();
  let r = await P.readThermal({ env, log: (l) => lines.push(l), recordTimeoutMs: 400, killGraceMs: 300 });
  assert.ok(Date.now() - t0 < 8000, `bounded: ${Date.now() - t0} ms`);
  assert.equal(r.timedOut, true);
  assert.equal(r.state, null);
  assert.equal(r.error, 'xctrace record timeout after 0.4 s, twice (process group killed, I-250)');
  assert.equal(P.profileVerdict('serious', r).code, 1, 'no read');
  assert.equal(typeof r.battC, 'number', 'the battery read still runs');
  assert.deepEqual(lines, [
    'XCTRACE TIMEOUT after 0.4 s (thermal read: xctrace record, attempt 1 of 2; its process group killed, I-250); retrying once',
    'XCTRACE TIMEOUT after 0.4 s (thermal read: xctrace record, attempt 2 of 2; its process group killed, I-250)',
  ]);
  assert.equal(pids().length, 4, 'two hung records, each with its helper');
  assert.ok(await gone(pids()), `every hung process is gone (SIGKILL to the group): ${pids().filter(alive)}`);
  assert.doesNotMatch(JSON.stringify(r) + lines.join('\n'), /SYNTH-UDID/, 'the device id is never printed or kept');
  // the first record hangs, the retry reads
  writeFileSync(env.FAKE_THERMAL_HANG_COUNT, '1');
  lines = [];
  t0 = Date.now();
  r = await P.readThermal({ env, log: (l) => lines.push(l), recordTimeoutMs: 400, killGraceMs: 300 });
  assert.deepEqual([r.state, r.induced, r.error, r.timedOut], ['Fair', 'No', null, undefined]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^XCTRACE TIMEOUT after 0\.4 s \(thermal read: xctrace record, attempt 1 of 2; .*\); retrying once$/);
  assert.ok(await gone(pids()));
  // the default bound is the time limit plus 60 s; $FW_XCTRACE_TIMEOUT_MS / $FW_XCTRACE_KILL_GRACE_MS (tests) set both calls'
  const seen = [];
  const exec = async (cmd, args, o) => { seen.push([args.includes('record') ? 'record' : args.includes('export') ? 'export' : 'battery', o.timeout, o.killGraceMs]); return { code: 0, error: null, stdout: args.includes('export') ? thermalXml([{ state: 'Fair', induced: 'No' }]) : '' }; };
  await P.readThermal({ env: {}, udid: 'D', exec });
  assert.deepEqual(seen.slice(0, 2), [['record', 70000, 5000], ['export', 60000, 5000]]);
  seen.length = 0;
  await P.readThermal({ env: { FW_XCTRACE_TIMEOUT_MS: '900', FW_XCTRACE_KILL_GRACE_MS: '100' }, udid: 'D', exec });
  assert.deepEqual(seen.slice(0, 2), [['record', 900, 100], ['export', 900, 100]]);
});

test('I-250 execBounded: stdout and exit code of a normal child; a missing binary is an error; a timed-out child whose helper holds the pipe resolves after SIGKILL to the group', { timeout: 20000 }, async () => {
  let r = await P.execBounded(process.execPath, ['-e', 'process.stdout.write("hi"); process.exit(3)'], { timeout: 5000 });
  assert.deepEqual([r.code, r.error, r.stdout, r.timedOut], [3, null, 'hi', false]);
  r = await P.execBounded('/nonexistent/fw-i250-binary', [], { timeout: 5000 });
  assert.deepEqual([r.code, r.error, r.timedOut], [1, 'ENOENT', false]);
  const d = tempDir('fw-i250-exec-');
  const env = { ...process.env, FAKE_THERMAL_RECORD_HANG: '1', FAKE_THERMAL_HANG_PIDS: join(d, 'pids') };
  const t0 = Date.now();
  r = await P.execBounded(process.execPath, [FAKE_THERMAL, 'record', '--device', 'X', '--output', join(d, 't')], { timeout: 300, killGraceMs: 200, env });
  assert.deepEqual([r.code, r.error, r.timedOut], [1, 'timeout', true]);
  assert.ok(Date.now() - t0 < 4000, `${Date.now() - t0} ms`);
  const pids = readFileSync(join(d, 'pids'), 'utf8').trim().split('\n').map(Number);
  assert.ok(await gone(pids), `left: ${pids.filter(alive)}`);
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
  assert.equal(r.line, 'REFUSED profile serious (Serious, induced by Xcode): phone is Nominal, battery 31.2 C; set Xcode > Window > Devices and Simulators > the phone > Device Conditions > Thermal State > Serious > Start (leave it on), then run again (gate xcode-serious code 2, reason condition-missing, I-186)');
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

// I-257: the gate no longer posts this step (no manual Xcode steps, user T-228 #15; see the I-257 test below); the
// library helper and its de-duplication stay covered here, called directly.
test('postProfileStep (no longer called by the gate, I-257): one action step per owner and profile while it is open, not a phone step (I-123 does not apply)', async () => {
  const read = { state: 'Nominal', induced: 'No', battC: 30 };
  const post = (o) => P.postProfileStep({ owner: 'iphone-runner', profile: 'serious', fix: 'set-serious', read, ...o });
  const ps = [];
  for (let i = 0; i < 3; i++) ps.push(await post());
  let steps = C.list({ pending: true });
  assert.equal(steps.length, 1, 'posted once');
  const s = steps[0];
  assert.deepEqual([s.kind, s.by, s.status, s.parts.length, s.parts[0].record], ['action', 'iphone-runner', 'pending', 1, false]);
  assert.match(s.title, /^Xcode: set the iPhone's Thermal State to Serious \(test profile serious\)$/);
  assert.match(s.instructions, /Xcode choose Window > Devices and Simulators, click Devices and select the iPhone; under Device Conditions set Condition to Thermal State and Profile to Serious, then click Start\. Leave it on/);
  assert.deepEqual(s.meta.phoneProfile, { owner: 'iphone-runner', profile: 'serious', fix: 'set-serious', incident: 'I-186', read: { state: 'Nominal', induced: 'No', condition: null } });
  assert.deepEqual(ps.map((x) => [x.step.id, x.posted]), [[s.id, true], [s.id, false], [s.id, false]]);
  const { isPhoneStep } = await import('../../tools/lib/phone-step.mjs');
  assert.equal(isPhoneStep(s), false);
  // another owner, or the fair profile: their own step
  await post({ owner: 'fix-x' });
  await P.postProfileStep({ owner: 'iphone-runner', profile: 'fair', fix: 'stop-condition', read: { state: 'Serious', induced: 'Yes', battC: 30 } });
  steps = C.list({ pending: true });
  assert.equal(steps.length, 3);
  assert.match(steps[2].title, /stop the iPhone's thermal condition \(test profile fair\)/);
  // answered (the tester clicked Done): the same condition read posts no new step for 30 min (I-201), after that a new one
  await C.start(s.id);
  await C.done(s.id);
  assert.equal(C.get(s.id).status, 'answered');
  const mine = () => C.list({ pending: true }).filter((x) => x.meta?.phoneProfile?.owner === 'iphone-runner' && x.meta.phoneProfile.profile === 'serious').length;
  const r = await post();
  assert.deepEqual([r.step.id, r.posted, r.recent], [s.id, false, true]);
  assert.equal(mine(), 0);
  await post({ now: Date.now() + 31 * 60000 });
  assert.equal(mine(), 1);
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

// I-201: the lead's raw read of 2026-10-05 06:14Z (xctrace export of device-thermal-state-intervals): the Current track
// Critical (is-induced No, narrative "...with desired state Serious..."), the Induced track Serious (is-induced Yes). The
// user HAD set Xcode to Serious; the phone itself was above it. Minimal two-row export in xctrace's id/ref shape.
const XML_0614 = `<?xml version="1.0"?>
<trace-query-result>
<node xpath='//trace-toc[1]/run[1]/data[1]/table[2]'><schema name="device-thermal-state-intervals"><col><mnemonic>start</mnemonic></col><col><mnemonic>duration</mnemonic></col><col><mnemonic>thermal-state</mnemonic></col><col><mnemonic>track-label</mnemonic></col><col><mnemonic>is-induced</mnemonic></col><col><mnemonic>narrative</mnemonic></col></schema><row><start-time id="1" fmt="00:00.000.000">0</start-time><duration id="2" fmt="11.04 s">11040000000</duration><thermal-state id="3" fmt="Critical">Critical</thermal-state><string id="4" fmt="Current">Current</string><boolean id="5" fmt="No">0</boolean><narrative id="6" fmt="Critical thermal state with desired state Serious from active device conditions"><thermal-state ref="3"/><narrative-text id="7" fmt=" thermal state with desired state "> thermal state with desired state </narrative-text><thermal-state id="8" fmt="Serious">Serious</thermal-state><narrative-text id="9" fmt=" from active device conditions"> from active device conditions</narrative-text></narrative></row>
<row><start-time ref="1"/><duration ref="2"/><thermal-state ref="8"/><string id="10" fmt="Induced">Induced</string><boolean id="11" fmt="Yes">1</boolean><narrative id="12" fmt="Serious thermal state device condition active"><thermal-state ref="8"/><narrative-text id="13" fmt=" thermal state device condition active"> thermal state device condition active</narrative-text></narrative></row>
</node></trace-query-result>`;
const READ_0614 = { state: 'Critical', induced: 'Yes', condition: 'Serious', battC: 30.19 };

test('I-201 parseThermalTable: the Induced track\'s own level is the condition (06:14Z: Current Critical, Xcode condition Serious)', () => {
  let t = P.parseThermalTable(XML_0614);
  assert.deepEqual(t.rows.map((r) => [r.track, r.state, r.induced]), [['Current', 'Critical', 'No'], ['Induced', 'Serious', 'Yes']]);
  assert.deepEqual([t.state, t.induced, t.condition, t.changed, t.error], ['Critical', 'Yes', 'Serious', false, null]);
  assert.equal(P.profileVerdict('serious', { ...t, battC: 30.19 }).code, 3, 'gate codes unchanged: a Critical phone is the ceiling (research/phone-thermal-gate)');
  // the captured export of 2026-10-04: condition Serious; real heat (no Induced row): no condition
  t = P.parseThermalTable(readFileSync(join(TESTS, 'fixtures', 'thermal-induced-serious-2rows.xml'), 'utf8'));
  assert.deepEqual([t.state, t.induced, t.condition], ['Serious', 'Yes', 'Serious']);
  t = P.parseThermalTable(thermalXml([{ state: 'Serious', induced: 'No' }]));
  assert.deepEqual([t.state, t.induced, t.condition], ['Serious', 'No', null]);
  // the fake writes a condition other than the phone's state; the last Induced row wins
  t = P.parseThermalTable(thermalXml([{ state: 'Critical', induced: 'Yes', condition: 'Fair' }, { state: 'Critical', induced: 'Yes', condition: 'Serious' }]));
  assert.deepEqual([t.state, t.induced, t.condition, t.error], ['Critical', 'Yes', 'Serious', null]);
  // unlabelled rows: an induced row's state is the condition
  t = P.parseThermalTable(`<trace-query-result><node><schema name="device-thermal-state-intervals"><col><mnemonic>thermal-state</mnemonic></col><col><mnemonic>is-induced</mnemonic></col></schema><row><thermal-state id="1">Critical</thermal-state><boolean id="2">1</boolean></row></node></trace-query-result>`);
  assert.deepEqual([t.state, t.induced, t.condition], ['Critical', 'Yes', 'Critical']);
});

test('I-201 readThermal / ledger: the condition is kept in the read, the start record and the end record', async () => {
  const exec = async (cmd, args) => {
    const a = args[0] === 'xctrace' ? args.slice(1) : args;
    if (a[0] === 'record') return { code: 0, error: null, stdout: '' };
    if (a[0] === 'export') return { code: 0, error: null, stdout: XML_0614 };
    return { code: 0, error: null, stdout: '<plist><dict><key>Temperature</key><integer>3019</integer></dict></plist>' };
  };
  const r = await P.readThermal({ env: {}, udid: 'DEV-1', exec });
  assert.deepEqual([r.state, r.induced, r.condition, r.battC, r.error], ['Critical', 'Yes', 'Serious', 30.19, null]);
  const g = await P.startGate({ owner: 'runner', hold: hold('tok-c'), read: async () => ({ state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 33 }), log: () => {} });
  assert.equal(g.record().start.condition, 'Serious');
  assert.equal(P.readLedger(g.key).start.condition, 'Serious');
  const f = join(tempDir('fw-thermal-cond-'), 'a.json');
  writeFileSync(f, JSON.stringify({ meta: {} }));
  await g.saved(f);
  const s = await P.closeHold({ resource: 'chrome-measure', token: 'tok-c', read: async () => ({ ...READ_0614 }), log: () => {} });
  assert.deepEqual([s[0].start.condition, s[0].end.condition, s[0].end.state, s[0].drift], ['Serious', 'Serious', 'Critical', true]);
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).meta.profile.end.condition, 'Serious');
  assert.equal(P.readLedger(g.key).end.condition, 'Serious');
});

test('I-201 refusalText: a Critical phone under the right Serious condition: restart the condition when the battery is cool, else wait to cool; a Critical condition still gets set-Serious', () => {
  const t = (profile, read) => P.refusalText(profile, read, P.profileVerdict(profile, read));
  const HINT = 'the phone itself reads Critical above the Xcode condition Serious; if the battery is cool (< 38 °C), stop the Xcode condition, wait until a re-read shows below Critical (about 2 min), then start Serious again; otherwise wait for it to cool; re-read with node tools/iphone.mjs profile --owner <you>';
  // the 06:14Z read (battery 30.19 C, cool): the restart step (follow-up: the episode of 2026-10-05, OBSERVED)
  let r = t('serious', READ_0614);
  assert.deepEqual([r.fix, r.reason], ['restart-condition', 'phone-above-condition']);
  assert.equal(r.line, `REFUSED profile serious (Serious, induced by Xcode): phone is Critical (Xcode condition Serious), battery 30.19 C; ${HINT} (gate xcode-serious code 3, reason phone-above-condition, I-186)`);
  assert.doesNotMatch(r.line, /the Xcode condition is Critical|set Xcode/);
  // a warm battery (>= 38 C) or none read: the same hint, no step (wait for it to cool)
  for (const battC of [38, 41.2, null]) {
    r = t('serious', { ...READ_0614, battC });
    assert.deepEqual([r.fix, r.reason], [null, 'phone-above-condition'], String(battC));
    assert.ok(r.line.includes(HINT), r.line);
  }
  assert.equal(P.COOL_C, 38);
  // the condition itself Critical (or a read without the Induced row's level): the tester's step, as before
  for (const read of [{ state: 'Critical', induced: 'Yes', condition: 'Critical', battC: 33 }, { state: 'Critical', induced: 'Yes', battC: 33 }]) {
    r = t('serious', read);
    assert.deepEqual([r.fix, r.reason], ['set-serious', 'condition-critical'], JSON.stringify(read));
    assert.match(r.line, /the Xcode condition is Critical, above the ceiling; set Xcode > .* > Serious > Start/);
  }
  // a condition wrong for the profile (Fair) under a Critical phone: the step, naming the condition it found
  r = t('serious', { state: 'Critical', induced: 'Yes', condition: 'Fair', battC: 33 });
  assert.deepEqual([r.fix, r.reason], ['set-serious', 'condition-wrong']);
  assert.match(r.line, /phone is Critical \(Xcode condition Fair\), battery 33 C; the Xcode condition is Fair, not Serious, and the phone is Critical, above the ceiling; set Xcode > .* > Serious > Start/);
  // fair: any condition is wrong, so stop it, whatever its level
  r = t('fair', READ_0614);
  assert.deepEqual([r.fix, r.reason], ['stop-condition', 'condition-wrong']);
  assert.match(r.line, /stop it: Xcode > .* > Stop/);
  // the other reasons
  assert.equal(t('serious', { state: 'Nominal', induced: 'No', battC: 31 }).reason, 'condition-missing');
  assert.equal(t('serious', { state: 'Serious', induced: 'No', battC: 40 }).reason, 'condition-missing');
  assert.equal(t('serious', { state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 44.5 }).reason, 'ceiling');
  assert.equal(t('serious', { error: 'x' }).reason, 'no-read');
  assert.equal(t('fair', { state: 'Fair', induced: 'Yes', condition: 'Fair', battC: 33 }).reason, 'condition-on');
  assert.equal(t('fair', { state: 'Serious', induced: 'No', battC: 40 }).reason, 'too-hot');
});

test('I-201 startGate: the 06:14Z read refuses (exit 8, reason phone-above-condition; fix restart-condition with a cool battery, none with a warm one) with the REARM line and no step (I-257)', async () => {
  const owner = 'art-worst-cases';
  const gate = (read) => P.startGate({ owner, hold: hold(), read: async () => ({ ...read }), log: () => {} }).catch((x) => x);
  // warm battery
  let e = await gate({ ...READ_0614, battC: 40 });
  assert.ok(e instanceof P.ProfileRefusal);
  assert.deepEqual([e.exitCode, e.verdict.code, e.reason, e.fix], [8, 3, 'phone-above-condition', null]);
  assert.doesNotMatch(e.message, /\nSTEP /);
  assert.match(e.message, /\nREARM the thermal tool fixes it \(no user step\): node tools\/iphone\.mjs rearm --owner art-worst-cases /);
  // cool battery: the restart remedy, done by the tool (REARM), never a user step (was the restart step before I-257)
  e = await gate(READ_0614);
  assert.deepEqual([e.exitCode, e.reason, e.fix], [8, 'phone-above-condition', 'restart-condition']);
  assert.doesNotMatch(e.message, /\nSTEP /);
  assert.match(e.message, /\nREARM /);
  assert.equal(C.list().length, 0);
});

test('I-201 the tester\'s step (postProfileStep, no longer called by the gate, I-257): not posted again within 30 min of an answered one for the same owner and profile, unless the condition read changed', async () => {
  const owner = 'art-worst-cases';
  const crit = { state: 'Critical', induced: 'Yes', condition: 'Critical', battC: 31 };
  const post = (read, now, o = owner) => P.postProfileStep({ owner: o, profile: 'serious', fix: 'set-serious', read: { ...read }, ...(now ? { now } : {}) });
  let p = await post(crit);
  const id = p.step.id;
  assert.equal(p.posted, true);
  assert.deepEqual(C.get(id).meta.phoneProfile.read, { state: 'Critical', induced: 'Yes', condition: 'Critical' });
  await C.start(id);
  await C.done(id); // the user: "I set it"
  // the same read again (the change did not show): no new step
  p = await post(crit);
  assert.deepEqual([p.step.id, p.posted, p.recent], [id, false, true]);
  assert.equal(C.list().length, 1);
  // another owner: its own step
  await post(crit, undefined, 'x');
  assert.equal(C.list().length, 2);
  // the condition read changed (the Xcode condition now Fair): a new step
  p = await post({ ...crit, condition: 'Fair' });
  const id2 = p.step.id;
  assert.ok(p.posted && id2 !== id);
  await C.start(id2);
  await C.done(id2);
  // 31 min after the answers, the same read: a new step
  p = await post(crit, Date.now() + 31 * 60000);
  assert.equal(p.posted, true);
  assert.equal(C.list().length, 4);
  // the pure helper: the window, the read, the profile
  const ans = { status: 'answered', result: { at: new Date(1e12).toISOString() }, meta: { phoneProfile: { owner: 'o', profile: 'serious', read: { state: 'Critical', induced: 'Yes', condition: 'Critical' } } } };
  const q = (read, now, profile = 'serious') => P.recentProfileStep([ans], { owner: 'o', profile, read, now });
  assert.equal(q({ state: 'Critical', induced: 'Yes', condition: 'Critical' }, 1e12 + 29 * 60000), ans);
  assert.equal(q({ state: 'Serious', induced: 'Yes', condition: 'Critical' }, 1e12 + 29 * 60000), ans, 'the phone\'s own state is not the condition read');
  assert.equal(q({ state: 'Critical', induced: 'Yes', condition: 'Critical' }, 1e12 + 31 * 60000), null);
  assert.equal(q({ state: 'Critical', induced: 'Yes', condition: 'Serious' }, 1e12 + 60000), null, 'condition changed');
  assert.equal(q({ state: 'Critical', induced: 'No', condition: null }, 1e12 + 60000), null, 'condition stopped');
  assert.equal(q(ans.meta.phoneProfile.read, 1e12, 'fair'), null, 'another profile');
});

// I-246: real heat. The real-serious profile (gate real-serious: expect serious, acceptInduced false) passes a phone at
// Serious by itself (Is Induced = No) and refuses an induced one (code 4, "wants real heat"), too cool (2), the ceiling (3).
test('I-246: profile real-serious = gate real-serious: Serious not induced passes, induced refuses (code 4), too cool 2, ceiling 3', () => {
  assert.deepEqual({ ...P.PROFILES['real-serious'] }, { name: 'real-serious', gate: 'real-serious', expect: 'serious', acceptInduced: false, want: 'Serious, real heat (not induced)' });
  assert.equal(P.DEFAULT_PROFILE, 'serious', 'serious stays the default');
  const want = { 'Nominal No': 2, 'Nominal Yes': 4, 'Fair No': 2, 'Fair Yes': 4, 'Serious No': 0, 'Serious Yes': 4, 'Critical No': 3, 'Critical Yes': 3 };
  for (const [k, code] of Object.entries(want)) {
    const [state, induced] = k.split(' ');
    const r = P.profileVerdict('real-serious', { state, induced, battC: 36 });
    assert.equal(r.code, code, `real-serious ${k}: ${r.why}`);
    assert.equal(r.profile, 'real-serious');
  }
  assert.match(P.profileVerdict('real-serious', { state: 'Serious', induced: 'Yes', battC: 36 }).why, /induced .*this profile wants real heat/);
  assert.match(P.profileVerdict('real-serious', { state: 'Fair', induced: 'No', battC: 36 }).why, /too cool \(Fair\)/);
  assert.equal(P.profileVerdict('real-serious', { state: 'Serious', induced: 'No', battC: 43.9 }).code, 0);
  assert.equal(P.profileVerdict('real-serious', { state: 'Serious', induced: 'No', battC: 44 }).code, 3, 'the 44 C ceiling holds');
  assert.equal(P.profileVerdict('real-serious', { state: 'Serious', induced: 'No', battC: null }).code, 0);
  assert.equal(P.profileVerdict('real-serious', { error: 'xctrace record exit 1' }).code, 1);
  // serious and fair unchanged
  assert.equal(P.profileVerdict('serious', { state: 'Serious', induced: 'No', battC: 36 }).code, 7);
  assert.equal(P.profileVerdict('serious', { state: 'Serious', induced: 'Yes', battC: 36 }).code, 0);
  assert.equal(P.profileVerdict('fair', { state: 'Fair', induced: 'Yes', battC: 36 }).why, 'induced by Xcode');
});

test('I-246: real-serious refusals: an induced condition is stopped (step stop-condition, tool mode CLEAR), too cool waits for real heat (no step)', () => {
  const t = (read, o) => P.refusalText('real-serious', read, P.profileVerdict('real-serious', read), o);
  let r = t({ state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 34 });
  assert.deepEqual([r.fix, r.reason], ['stop-condition', 'condition-on']);
  assert.equal(r.line, 'REFUSED profile real-serious (Serious, real heat (not induced)): phone is Serious (induced by Xcode), battery 34 C; stop it: Xcode > Window > Devices and Simulators > the phone > Device Conditions > Thermal State > Stop (leave it off), then run again (gate real-serious code 4, reason condition-on, I-186)');
  assert.equal(P.toolHint('real-serious', t({ state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 34 }, { condition: 'tool' }), 'me'), 'CLEAR the thermal tool fixes it (no user step): node tools/thermal.mjs clear --owner me (inside your phone hold; I-199)');
  r = t({ state: 'Fair', induced: 'No', battC: 33 });
  assert.deepEqual([r.fix, r.reason], [null, 'too-cool']);
  assert.match(r.line, /^REFUSED profile real-serious \(Serious, real heat \(not induced\)\): phone is Fair, battery 33 C; too cool for the real-serious profile: .*real heat.* \(gate real-serious code 2, reason too-cool, I-186\)$/);
  r = t({ state: 'Critical', induced: 'Yes', condition: 'Serious', battC: 33 });
  assert.deepEqual([r.fix, r.reason], ['stop-condition', 'condition-wrong']);
  r = t({ state: 'Critical', induced: 'No', battC: 41 });
  assert.deepEqual([r.fix, r.reason], [null, 'ceiling']);
  const s = P.stepFor({ owner: 'me', profile: 'real-serious', fix: 'stop-condition' });
  assert.match(s.title, /stop the iPhone's thermal condition \(test profile real-serious\)/);
  assert.match(s.instructions, /The real-serious profile wants the phone at Serious by its own heat, with no Xcode condition\./);
  assert.match(P.stepFor({ owner: 'me', profile: 'fair', fix: 'stop-condition' }).instructions, /The fair profile wants the phone at Nominal or Fair with no Xcode condition\./, 'fair unchanged');
});

test('I-246: startGate / closeHold under real-serious: the ledger, meta.profile and the end read name real-serious (profiles never pool)', async () => {
  const dir = tempDir('fw-thermal-real-');
  const lines = [];
  const g = await P.startGate({ profile: 'real-serious', owner: 'runner', hold: hold('tokR'), read: async () => ({ state: 'Serious', induced: 'No', battC: 39 }), log: (l) => lines.push(l) });
  assert.equal(lines[0], 'PROFILE real-serious ok at the hold\'s start: phone is Serious (real heat, not induced), battery 39 C (gate real-serious; read 0 s)');
  assert.equal(g.key, P.ledgerKey(hold('tokR'), 'real-serious'));
  const rec = g.record();
  assert.deepEqual([rec.name, rec.gate, rec.start.state, rec.start.induced, rec.start.code], ['real-serious', 'real-serious', 'Serious', 'No', 0]);
  // a serious run in the same hold is its own ledger: it refuses this real-heat phone, the real-serious read stays kept
  await assert.rejects(P.startGate({ profile: 'serious', owner: 'runner', hold: hold('tokR'), read: async () => ({ state: 'Serious', induced: 'No', battC: 39 }), log: () => {}, postStep: null }), (e) => e.exitCode === 8 && e.verdict.code === 7);
  assert.equal((await P.startGate({ profile: 'real-serious', owner: 'runner', hold: hold('tokR'), read: async () => { throw new Error('no read expected'); }, log: () => {} })).cached, true);
  const f = join(dir, 'run.json');
  writeFileSync(f, JSON.stringify({ meta: { profile: rec } }));
  await g.saved(f);
  const end = [];
  const s = await P.closeHold({ resource: 'chrome-measure', token: 'tokR', read: async () => ({ state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 39 }), log: (l) => end.push(l) });
  assert.deepEqual(s.map((x) => [x.profile, x.gate, x.drift, x.end.code]), [['real-serious', 'real-serious', true, 4]]);
  assert.match(end[0], /^PROFILE-DRIFT real-serious: .*\(gate real-serious code 4: induced .*wants real heat.*\)/);
  const j = JSON.parse(readFileSync(f, 'utf8'));
  assert.deepEqual([j.meta.profile.name, j.meta.profile.gate, j.meta.profileDrift], ['real-serious', 'real-serious', true]);
});

test('I-246: a real-serious warm-up (the heat pre-warm) passes too cool, is never the hold\'s start read; ceiling and a condition still refuse', async () => {
  let read = { state: 'Fair', induced: 'No', battC: 35 };
  const c = counter(() => read);
  const lines = [];
  const opts = { profile: 'real-serious', owner: 'runner', hold: hold('tokW'), read: c.read, log: (l) => lines.push(l), postStep: null };
  const w = await P.startGate({ ...opts, warmup: true });
  assert.match(lines[0], /^PROFILE real-serious warm-up: phone is Fair, battery 35 C \(gate real-serious code 2: too cool \(Fair\)\); an uncounted warm-up runs, not kept as the hold's start read/);
  assert.deepEqual([w.key, w.cached, w.record().name, w.record().gate, w.record().warmup, w.record().start.state, w.record().start.code], [null, false, 'real-serious', 'real-serious', true, 'Fair', 2]);
  await w.saved('/nonexistent/run.json'); // lists nothing
  assert.equal(P.readLedger(P.ledgerKey(hold('tokW'), 'real-serious')), null, 'no ledger: no start read kept');
  // the counted run reads again and refuses too cool (reason too-cool, no step)
  await assert.rejects(P.startGate(opts), (e) => e.exitCode === 8 && e.reason === 'too-cool');
  // a warm-up that already finds real Serious is still not the start read
  read = { state: 'Serious', induced: 'No', battC: 38 };
  assert.equal((await P.startGate({ ...opts, warmup: true })).record().warmup, true);
  assert.equal(P.readLedger(P.ledgerKey(hold('tokW'), 'real-serious')), null);
  assert.equal(c.n, 3);
  // the first counted run: the start read, kept; a later warm-up in the same hold reuses it (no read)
  const g = await P.startGate(opts);
  assert.equal(g.record().warmup, undefined);
  assert.equal(P.readLedger(g.key).start.state, 'Serious');
  assert.equal((await P.startGate({ ...opts, warmup: true })).cached, true);
  assert.equal(c.n, 4);
  // a fresh hold: the ceiling and an induced condition refuse a warm-up as usual
  const o2 = { ...opts, hold: hold('tokW2') };
  read = { state: 'Fair', induced: 'No', battC: 44 };
  await assert.rejects(P.startGate({ ...o2, warmup: true }), (e) => e.exitCode === 8 && e.verdict.code === 3 && e.reason === 'ceiling');
  read = { state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 34 };
  await assert.rejects(P.startGate({ ...o2, warmup: true }), (e) => e.exitCode === 8 && e.verdict.code === 4 && e.reason === 'condition-on');
  read = { state: 'Critical', induced: 'No', battC: 36 };
  await assert.rejects(P.startGate({ ...o2, warmup: true }), (e) => e.verdict.code === 3);
  // serious and fair: warmup changes nothing (a Fair phone refuses serious, its passing read is kept)
  read = { state: 'Fair', induced: 'No', battC: 35 };
  await assert.rejects(P.startGate({ ...o2, profile: 'serious', warmup: true }), (e) => e.exitCode === 8 && e.verdict.code === 2);
  const f = await P.startGate({ ...o2, profile: 'fair', warmup: true });
  assert.equal(f.record().warmup, undefined);
  assert.equal(P.readLedger(P.ledgerKey(hold('tokW2'), 'fair')).start.code, 0);
});

// I-257 (C-133/134/135, 2026-10-09: a blind swipe test's `iphone.mjs record` posted "Xcode: set the iPhone's Thermal
// State to Serious" three times): the user is never asked for a manual Xcode thermal step (user T-228 #15; memory
// "phone-checks-start-warm"). The gate refuses (exit 8) in every condition mode and tells the AGENT what fixes it with the
// thermal tool (the REARM / CLEAR line); no console step, whatever the read.
test('I-257 startGate never posts a console step for the tester (xcode mode, the default, and tool mode): a fixable misfit refuses with exit 8 and the REARM / CLEAR line', async () => {
  const cases = [
    ['serious', undefined, { state: 'Nominal', induced: 'No', battC: 30 }, 'condition-missing', /\nREARM the thermal tool fixes it \(no user step\): node tools\/iphone\.mjs rearm --owner me /],
    ['serious', 'xcode', { state: 'Fair', induced: 'No', battC: 31 }, 'condition-missing', /\nREARM /],
    ['serious', 'xcode', { ...READ_0614 }, 'phone-above-condition', /\nREARM /], // cool battery: was the restart step (I-201)
    ['serious', 'xcode', { state: 'Critical', induced: 'Yes', condition: 'Critical', battC: 31 }, 'condition-critical', /\nREARM /],
    ['fair', 'xcode', { state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 30 }, 'condition-on', /\nCLEAR the thermal tool fixes it \(no user step\): node tools\/thermal\.mjs clear --owner me /],
    ['real-serious', undefined, { state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 33 }, 'condition-on', /\nCLEAR /],
    ['serious', 'tool', { state: 'Nominal', induced: 'No', battC: 30 }, 'condition-missing', /\nREARM /],
  ];
  for (const [profile, condition, read, reason, hint] of cases) {
    const e = await P.startGate({ profile, owner: 'me', hold: hold(), read: async () => ({ ...read }), log: () => {}, ...(condition ? { condition } : {}) }).catch((x) => x);
    const what = `${profile}/${condition ?? 'default'}/${read.state}`;
    assert.ok(e instanceof P.ProfileRefusal, what);
    assert.deepEqual([e.exitCode, e.reason], [8, reason], what);
    assert.match(e.message, hint, what);
    assert.doesNotMatch(e.message, /\nSTEP /, what);
  }
  assert.deepEqual(C.list(), [], 'no console step at all');
});
