// I-225: the probed re-arm of the phone's Serious condition (tools/lib/thermal-rearm.mjs, `iphone.mjs rearm`) with fake
// readers, a fake clock and fake thermal.mjs clear/set: clear the condition, read the plain state at most once a minute
// for up to 10 min until Nominal/Fair with no condition, only then set Serious, settle 120 s, the profile read; exit
// codes cleared 0 / still-critical 8 / timeout 13. And the gate's tool mode (I-199: no Xcode step, points to rearm).
// $FW_STATE_DIR is a temp dir: no real ledger, console step, lock, phone or condition.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from '../helpers.mjs';

const R = await import('../../tools/lib/thermal-rearm.mjs');
const P = await import('../../tools/lib/thermal-profile.mjs');
const C = await import('../../tools/lib/console.mjs');

beforeEach(() => { process.env.FW_STATE_DIR = tempDir('fw-rearm-'); });

const hold = (token = 'tokR') => ({ resource: 'iphone', token, owner: 'int-v11' });
const ABOVE = { state: 'Critical', induced: 'Yes', condition: 'Serious', battC: 34.5, holder: 'Xcode' }; // 10-07 01:22Z: profile exit 8 at 34.5 C
// I-233: a condition read names its holder (readThermal: our live thermal.mjs set, else Xcode)
const ON = { state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 34.2, holder: 'thermal.mjs' };
const XCODE_ON = { ...ON, holder: 'Xcode' };

/** A fake phone: reads come from `seq` (the last one repeats); each read takes 25 s of fake time; every call is logged. */
function rig(seq, { clearErr, clearErrs = [], setErr } = {}) {
  let t = Date.parse('2026-10-07T01:26:56Z');
  const calls = [], lines = [];
  let i = 0, nClear = 0;
  const h = {
    calls, lines, now: () => t,
    read: async () => { const at = t; calls.push({ fn: 'read', at }); t += 25000; const r = seq[Math.min(i++, seq.length - 1)]; return { at: new Date(at).toISOString(), ms: 25000, rows: 1, error: null, ...r }; },
    // clearErrs: one error (or null) per clear call, in order (I-249); clearErr: every call fails
    clear: async () => { calls.push({ fn: 'clear', at: t }); const e = clearErr || clearErrs[nClear++]; if (e) throw new Error(e); t += 2000; return { line: 'CLEARED the active condition' }; },
    set: async () => { calls.push({ fn: 'set', at: t }); if (setErr) throw new Error(setErr); t += 3000; return { pid: 4242, log: '/state/thermal/set-int-v11.log', line: 'SET ThermalCondition ThermalSerious (holding; SIGINT/SIGTERM or node tools/thermal.mjs clear ends it)' }; },
    sleep: async (ms) => { calls.push({ fn: 'sleep', at: t, ms }); t += ms; },
    log: (l) => lines.push(...String(l).split('\n')),
  };
  h.run = (extra = {}) => R.rearm({ owner: 'int-v11', hold: hold(), read: h.read, clear: h.clear, set: h.set, sleep: h.sleep, now: h.now, log: h.log, ...extra });
  return h;
}

test('I-225 rearm: the 10-07 01:2xZ episode (Critical under Serious; after the clear Critical 0 min, Serious 1 min, Nominal 2 min): set only after the clear read, settle 120 s, the profile read passes -> cleared, exit 0', async () => {
  const h = rig([ABOVE, { state: 'Critical', induced: 'No', battC: 34.09 }, { state: 'Serious', induced: 'No', battC: 34.09 }, { state: 'Nominal', induced: 'No', battC: 34.19 }, ON]);
  const r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['cleared', 0]);
  assert.deepEqual(h.calls.map((c) => c.fn), ['read', 'clear', 'read', 'sleep', 'read', 'sleep', 'read', 'set', 'sleep', 'read']);
  // the plain reads: at most once a minute (a 25 s read included), from the clear on
  const probes = h.calls.filter((c) => c.fn === 'read').slice(1, 4).map((c) => c.at);
  const t0 = h.calls.find((c) => c.fn === 'clear').at + 2000;
  assert.deepEqual(probes.map((x) => x - t0), [0, 60000, 120000]);
  // set comes after the passing plain read; the settle is 120 s, then the profile read
  const iSet = h.calls.findIndex((c) => c.fn === 'set');
  assert.deepEqual(h.calls[iSet + 1], { fn: 'sleep', at: h.calls[iSet + 1].at, ms: 120000 });
  assert.equal(r.set.pid, 4242);
  assert.equal(r.reads.length, 5);
  const out = h.lines.join('\n');
  assert.match(out, /^REARM start: phone is Critical \(Xcode condition Serious\), battery 34\.5 C \(gate xcode-serious code 3, reason phone-above-condition\); clearing the condition, then reading the plain state once a minute for up to 10 min \(I-225\)$/m);
  assert.match(out, /^REARM CLEAR CLEARED the active condition$/m);
  assert.match(out, /^REARM PROBE 1 \(0 min after the clear\): phone is Critical, battery 34\.09 C: not clear yet \(ceiling \(Critical\)\)$/m);
  assert.match(out, /^REARM PROBE 2 \(1 min after the clear\): phone is Serious \(real heat, not induced\), battery 34\.09 C: not clear yet \(too hot for a Fair check \(Serious\)\)$/m);
  assert.match(out, /^REARM PROBE 3 \(2 min after the clear\): phone is Nominal, battery 34\.19 C: clear \(Nominal or Fair, no condition\)$/m);
  assert.match(out, /^REARM SET SET ThermalCondition ThermalSerious .* \(thermal\.mjs set pid 4242, log \/state\/thermal\/set-int-v11\.log; it holds the condition until node tools\/thermal\.mjs clear --owner int-v11\)$/m);
  assert.match(out, /^REARM SETTLE 120 s before the profile read$/m);
  assert.match(out, /^PROFILE serious ok at the hold's start: phone is Serious \(induced by thermal\.mjs\), battery 34\.2 C/m);
  assert.match(out, /^REARM CLEARED: phone is Serious \(induced by thermal\.mjs\), battery 34\.2 C; the condition stays set by thermal\.mjs \(pid 4242\) \(exit 0\)$/m);
  // the profile read is the hold's start read (the hold's first run reads nothing more)
  const lg = P.readLedger(P.ledgerKey(hold(), 'serious'));
  assert.equal(lg.start.code, 0);
  assert.equal(lg.start.state, 'Serious');
  assert.equal(C.list().length, 0, 'no console step: the tool sets the condition (user T-228 #15)');
});

test('I-225 rearm: still Critical after the settle -> still-critical, exit 8; the set stays running and the line says how to end it', async () => {
  const h = rig([ABOVE, { state: 'Nominal', induced: 'No', battC: 34 }, ABOVE]);
  const r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['still-critical', 8]);
  assert.equal(P.EXIT_PROFILE, 8);
  assert.deepEqual(h.calls.map((c) => c.fn), ['read', 'clear', 'read', 'set', 'sleep', 'read']);
  const out = h.lines.join('\n');
  assert.match(out, /^REARM STILL-CRITICAL: REFUSED profile serious \(Serious, induced by thermal\.mjs\): phone is Critical \(Xcode condition Serious\), battery 34\.5 C; .*reason phone-above-condition, I-186\); the condition stays set by thermal\.mjs \(pid 4242; end it: node tools\/thermal\.mjs clear --owner int-v11\) \(exit 8\)$/m);
  assert.doesNotMatch(out, /^STEP /m, 'no user step');
  assert.equal(C.list().length, 0);
  // another misfit after the settle (the set did not take): exit 8 too, its own word
  const m = rig([ABOVE, { state: 'Fair', induced: 'No', battC: 33 }, { state: 'Fair', induced: 'No', battC: 33 }]);
  const r2 = await m.run();
  assert.deepEqual([r2.outcome, r2.code], ['misfit', 8]);
  assert.match(m.lines.join('\n'), /^REARM MISFIT: REFUSED profile serious .*phone is Fair, battery 33 C.*reason condition-missing, I-186\)/m);
});

test('I-225 rearm: no Nominal/Fair with no condition within 10 min of the clear -> timeout, exit 13; nothing set; never more than one read a minute', async () => {
  const h = rig([ABOVE, { state: 'Critical', induced: 'No', battC: 36 }]);
  const r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['timeout', 13]);
  assert.equal(R.EXIT_REARM_TIMEOUT, 13);
  assert.ok(!h.calls.some((c) => c.fn === 'set'), 'never set on a phone that did not clear');
  const probes = h.calls.filter((c) => c.fn === 'read').slice(1).map((c) => c.at);
  assert.equal(probes.length, 11, 'reads at 0, 1, ..., 10 min');
  for (let i = 1; i < probes.length; i++) assert.ok(probes[i] - probes[i - 1] >= 60000, `read ${i} came ${probes[i] - probes[i - 1]} ms after the one before`);
  assert.ok(probes.at(-1) - probes[0] <= 600000);
  assert.match(h.lines.join('\n'), /^REARM TIMEOUT: the phone did not read Nominal or Fair with no condition within 10 min of the clear \(last: Critical, battery 36 C\); nothing set, no condition on; let it cool \(node tools\/wait\.mjs phone-temp --below auto\), then run rearm again \(exit 13\)$/m);
  // a condition still on after the clear (someone else's): the probe line says so
  const x = rig([ABOVE, { state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 34, holder: 'Xcode' }]);
  await x.run({ maxWaitMs: 60000 });
  assert.match(x.lines.join('\n'), /^REARM PROBE 1 \(0 min after the clear\): phone is Serious \(induced by Xcode\), battery 34 C: not clear yet \(a condition is still on after the clear, held by Xcode\)$/m);
  // shorter limits (flags): --max-wait, --settle
  const s = rig([ABOVE, { state: 'Fair', induced: 'No', battC: 33 }, ON]);
  await s.run({ settleMs: 5000 });
  assert.equal(s.calls.find((c) => c.fn === 'sleep').ms, 5000);
});

test('I-225 rearm: a phone that already fits is left alone (exit 0, nothing cleared or set); a failed read, clear or set is an error (exit 1) and stops there', async () => {
  let h = rig([ON]);
  let r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['not-needed', 0]);
  assert.deepEqual(h.calls.map((c) => c.fn), ['read']);
  assert.match(h.lines.join('\n'), /^REARM NOT-NEEDED: phone is Serious \(induced by thermal\.mjs\), battery 34\.2 C fits the serious profile and the condition is ours; nothing cleared or set \(exit 0\)$/m);
  assert.equal(P.readLedger(P.ledgerKey(hold(), 'serious')).start.code, 0, 'the read is the hold\'s start read');
  h = rig([{ error: 'xctrace record exit 1' }]);
  r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['error', 1]);
  assert.deepEqual(h.calls.map((c) => c.fn), ['read']);
  assert.match(h.lines.join('\n'), /^REARM ERROR: could not read the thermal state \(xctrace record exit 1\)/m);
  h = rig([ABOVE], { clearErr: 'thermal.mjs clear exit 1: no tunnel' });
  r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['error', 1]);
  assert.deepEqual(h.calls.map((c) => c.fn), ['read', 'clear']);
  assert.match(h.lines.join('\n'), /^REARM ERROR: thermal\.mjs clear failed: thermal\.mjs clear exit 1: no tunnel; nothing set \(exit 1\)$/m);
  h = rig([ABOVE, { state: 'Nominal', induced: 'No', battC: 33 }], { setErr: 'thermal.mjs set exited 1 before SET' });
  r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['error', 1]);
  assert.match(h.lines.join('\n'), /^REARM ERROR: thermal\.mjs set serious failed: thermal\.mjs set exited 1 before SET; no condition on \(exit 1\)$/m);
});

// I-249 (P-166 part A2 start, 2026-10-08 11:15Z): rearm's first thermal.mjs clear met a transient RSD close (lib/rsd.mjs:
// the tunnel's RSD closed before it listed its services, so nothing reached the phone) and rearm ended with ERROR exit 1;
// restarting the part worked. That error class gets one retry after a 20 s pause; any other clear error stops at once.
const RSD_CLOSE = 'thermal.mjs clear exit 1: RSD on <tunnel> closed the connection before it listed its services';
test('I-249 rearm: a transient RSD close in the first clear: one retry after 20 s, then the sequence goes on (cleared, exit 0)', async () => {
  const h = rig([ABOVE, { state: 'Nominal', induced: 'No', battC: 33 }, ON], { clearErrs: [RSD_CLOSE, null] });
  const r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['cleared', 0]);
  assert.deepEqual(h.calls.map((c) => c.fn), ['read', 'clear', 'sleep', 'clear', 'read', 'set', 'sleep', 'read']);
  assert.equal(h.calls[2].ms, 20000, 'the pause before the one retry');
  const out = h.lines.join('\n');
  assert.match(out, /^REARM CLEAR RETRY: thermal\.mjs clear failed with a transient RSD close \(thermal\.mjs clear exit 1: RSD on <tunnel> closed the connection before it listed its services\); one retry in 20 s \(I-249\)$/m);
  assert.match(out, /^REARM CLEAR CLEARED the active condition$/m);
});

test('I-249 rearm: the RSD close twice is an ERROR (exit 1, nothing set, one retry only); another clear error is not retried', async () => {
  let h = rig([ABOVE], { clearErrs: [RSD_CLOSE, RSD_CLOSE, null] });
  let r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['error', 1]);
  assert.deepEqual(h.calls.map((c) => c.fn), ['read', 'clear', 'sleep', 'clear']);
  assert.match(h.lines.join('\n'), /^REARM ERROR: thermal\.mjs clear failed: thermal\.mjs clear exit 1: RSD on <tunnel> closed the connection before it listed its services \(after one retry, I-249\); nothing set \(exit 1\)$/m);
  h = rig([ABOVE], { clearErrs: ['thermal.mjs clear exit 1: RSD on <tunnel> refused the connection (HTTP/2 GOAWAY, error code 2)', null] });
  r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['error', 1]);
  assert.deepEqual(h.calls.map((c) => c.fn), ['read', 'clear'], 'only the transient close is retried');
  assert.equal(R.isTransientRsdClose(new Error(RSD_CLOSE)), true);
  assert.equal(R.isTransientRsdClose(new Error('thermal.mjs clear exit 1: no tunnel')), false);
});

test('I-225 the gate\'s tool mode (--condition tool / FW_PHONE_CONDITION=tool): no Xcode step; serious misfits point to iphone.mjs rearm, fair ones to thermal.mjs clear; exit 8 unchanged', async () => {
  assert.equal(P.parseCondition(undefined), 'xcode');
  assert.equal(P.parseCondition('tool'), 'tool');
  assert.equal(P.parseCondition('xcode'), 'xcode');
  assert.throws(() => P.parseCondition('both'), /--condition must be xcode \(default: an Xcode-held Serious condition passes; no step, I-257\) or tool \(thermal\.mjs, I-199: no step, iphone\.mjs rearm\)/);
  assert.equal(P.parseCondition(undefined, { FW_PHONE_CONDITION: 'tool' }), 'tool');
  const gate = (read, extra = {}) => P.startGate({ owner: 'int-v11', hold: hold(), read: async () => ({ ...read }), log: () => {}, condition: 'tool', ...extra }).catch((x) => x);
  for (const read of [ABOVE, { ...ABOVE, battC: 40 }, { state: 'Nominal', induced: 'No', battC: 31 }, { state: 'Critical', induced: 'Yes', condition: 'Critical', battC: 33 }]) {
    const e = await gate(read);
    assert.ok(e instanceof P.ProfileRefusal, String(e));
    assert.equal(e.exitCode, 8);
    const [first, second] = e.message.split('\n');
    assert.equal(first, P.refusalText('serious', read, P.profileVerdict('serious', read), { condition: 'tool' }).line, 'the tool mode\'s refusal line (I-233: names the holder)');
    assert.match(first, /^REFUSED profile serious \(Serious, induced by thermal\.mjs\): .*\(gate xcode-serious code \d, reason [a-z-]+, I-186\)$/);
    assert.doesNotMatch(first, /Xcode > Window/, 'no Xcode action in tool mode (I-233)');
    assert.equal(second, 'REARM the thermal tool fixes it (no user step): node tools/iphone.mjs rearm --owner int-v11 (inside your phone hold: thermal.mjs clear, plain reads once a minute until Nominal/Fair, set serious, settle 120 s, the profile read; I-225)');
  }
  let e = await gate({ state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 33 }, { profile: 'fair' });
  assert.match(e.message, /\nCLEAR the thermal tool fixes it \(no user step\): node tools\/thermal\.mjs clear --owner int-v11 \(inside your phone hold; I-199\)$/);
  e = await gate({ state: 'Serious', induced: 'No', battC: 40 }, { profile: 'fair' });
  assert.doesNotMatch(e.message, /\n(CLEAR|REARM|STEP) /, 'real heat: cool down, nothing to switch');
  assert.equal(C.list().length, 0, 'tool mode posts no step');
  // I-257: the Xcode mode (default) posts no step either; the same REARM line
  e = await P.startGate({ owner: 'int-v11', hold: hold(), read: async () => ({ ...ABOVE }), log: () => {} }).catch((x) => x);
  assert.doesNotMatch(e.message, /\nSTEP /);
  assert.match(e.message, /\nREARM the thermal tool fixes it \(no user step\)/);
  assert.equal(C.list().length, 0, 'no step in either mode (I-257)');
});

test('I-233 rearm: Serious induced by a condition that is not ours (Xcode left on) is no NOT-NEEDED: rearm takes it over (set, settle, read) -> took-over, exit 0', async () => {
  const h = rig([XCODE_ON, ON]);
  const r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['took-over', 0]);
  assert.deepEqual(h.calls.map((c) => c.fn), ['read', 'set', 'sleep', 'read'], 'no clear and no probe: the phone already reads Serious; set replaces the other condition (I-199 stage 3)');
  assert.equal(h.calls[2].ms, 120000);
  const out = h.lines.join('\n');
  assert.match(out, /^REARM TAKEOVER: phone is Serious \(induced by Xcode\), battery 34\.2 C, but the condition is not ours \(no live thermal\.mjs set holds it\); setting ours \(thermal\.mjs set replaces it, I-199 stage 3\) \(I-233\)$/m);
  assert.match(out, /^REARM CLEARED: phone is Serious \(induced by thermal\.mjs\), battery 34\.2 C; the condition stays set by thermal\.mjs \(pid 4242\) \(exit 0\)$/m);
  assert.doesNotMatch(out, /NOT-NEEDED/);
  // a legacy read without a holder counts as not ours
  const l = rig([{ ...ON, holder: undefined }, ON]);
  assert.equal((await l.run()).outcome, 'took-over');
  // after the takeover the condition still is not ours (the set did not take): a misfit, exit 8
  const m = rig([XCODE_ON, XCODE_ON]);
  const r2 = await m.run();
  assert.deepEqual([r2.outcome, r2.code], ['misfit', 8]);
  assert.match(m.lines.join('\n'), /^REARM MISFIT: REFUSED profile serious \(Serious, induced by thermal\.mjs\): phone is Serious \(induced by Xcode\), battery 34\.2 C; the Serious condition is held by Xcode, not by our thermal\.mjs set: .*reason condition-not-ours, I-186\)/m);
});

test('I-233 the gate in tool mode refuses a passing read whose condition is not ours (reason condition-not-ours, REARM line); the Xcode mode does not look at the holder', async () => {
  const gate = (read, extra = {}) => P.startGate({ owner: 'p158', hold: hold('tokG'), read: async () => ({ ...read }), log: () => {}, condition: 'tool', ...extra }).catch((x) => x);
  let e = await gate(XCODE_ON);
  assert.ok(e instanceof P.ProfileRefusal, String(e));
  assert.deepEqual([e.exitCode, e.reason, e.verdict.code], [8, 'condition-not-ours', 0]);
  const [first, second] = e.message.split('\n');
  assert.equal(first, 'REFUSED profile serious (Serious, induced by thermal.mjs): phone is Serious (induced by Xcode), battery 34.2 C; the Serious condition is held by Xcode, not by our thermal.mjs set: take it over with the thermal tool (the REARM line below) (gate xcode-serious code 0, reason condition-not-ours, I-186)');
  assert.match(second, /^REARM the thermal tool fixes it \(no user step\): node tools\/iphone\.mjs rearm --owner p158 /);
  assert.equal(P.readLedger(P.ledgerKey(hold('tokG'), 'serious')), null, 'not kept as the hold\'s start read');
  const ok = await gate(ON);
  assert.equal(ok.verdict.code, 0);
  // the Xcode mode: Xcode's condition is the right one
  const x = await P.startGate({ owner: 'p158', hold: hold('tokX'), read: async () => ({ ...XCODE_ON }), log: () => {} });
  assert.equal(x.verdict.code, 0);
});

test('I-233 wording names the holder: stateWords, the refusal head in tool mode; no holder = Xcode, as before', () => {
  assert.equal(P.stateWords({ state: 'Serious', induced: 'Yes', condition: 'Serious', holder: 'thermal.mjs' }), 'Serious (induced by thermal.mjs)');
  assert.equal(P.stateWords({ state: 'Critical', induced: 'Yes', condition: 'Serious', holder: 'thermal.mjs' }), 'Critical (thermal.mjs condition Serious)');
  assert.equal(P.stateWords({ state: 'Serious', induced: 'Yes', condition: 'Serious' }), 'Serious (induced by Xcode)');
  assert.equal(P.stateWords({ state: 'Critical', induced: 'Yes', condition: 'Serious', holder: 'Xcode' }), 'Critical (Xcode condition Serious)');
  const t = (read, o) => P.refusalText('serious', read, P.profileVerdict('serious', read), o).line;
  const above = { state: 'Critical', induced: 'Yes', condition: 'Serious', battC: 33, holder: 'thermal.mjs' };
  assert.equal(t(above, { condition: 'tool' }), 'REFUSED profile serious (Serious, induced by thermal.mjs): phone is Critical (thermal.mjs condition Serious), battery 33 C; the phone itself reads Critical above the thermal.mjs condition Serious; re-arm with the thermal tool (the REARM line below: clear, plain reads until Nominal/Fair, set serious, settle) (gate xcode-serious code 3, reason phone-above-condition, I-186)');
  assert.match(t({ state: 'Nominal', induced: 'No', battC: 31 }, { condition: 'tool' }), /phone is Nominal, battery 31 C; no condition on: set ours with the thermal tool \(the REARM line below\) \(gate xcode-serious code 2, reason condition-missing, I-186\)$/);
  // the Xcode mode keeps its words (existing pins in thermal-profile.test.mjs)
  assert.match(t({ ...above, holder: undefined }), /^REFUSED profile serious \(Serious, induced by Xcode\): phone is Critical \(Xcode condition Serious\), battery 33 C; the phone itself reads Critical above the Xcode condition Serious; if the battery is cool/);
});

test('I-233 liveHolder / readThermal: the holder file names our set only while its pid lives and is a thermal.mjs; a read under a condition carries holder thermal.mjs or Xcode', async () => {
  const H = await import('../../tools/lib/thermal-holder.mjs');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  assert.equal(H.liveHolder(), null, 'no file');
  mkdirSync(dirname(H.holderFile()), { recursive: true });
  writeFileSync(H.holderFile(), JSON.stringify({ pid: process.pid, owner: 'p158', group: 'ThermalCondition', profile: 'ThermalSerious', since: '2026-10-07T03:10:00Z' }));
  assert.equal(H.liveHolder(), null, 'this pid is no thermal.mjs');
  assert.equal(H.liveHolder({ argsOf: () => 'node /x/tools/thermal.mjs set serious --owner p158' }).owner, 'p158');
  assert.equal(H.liveHolder({ argsOf: () => 'node /x/tools/thermal.mjs set serious', alive: () => false }), null, 'dead pid');
  // readThermal names the holder of an induced condition (seam: holder())
  const exec = async (cmd, args) => {
    const a = args[0] === 'xctrace' ? args.slice(1) : args;
    if (a[0] === 'record') return { code: 0, error: null, stdout: '' };
    if (a[0] === 'export') return { code: 0, error: null, stdout: (await import('../fixtures/fake-thermal.mjs')).thermalXml([{ state: 'Serious', induced: 'Yes', condition: 'Serious' }]) };
    return { code: 1, error: null, stdout: '' };
  };
  const ours = { pid: 1, profile: 'ThermalSerious' };
  let r = await P.readThermal({ env: {}, udid: 'D', exec, holder: () => ours });
  assert.equal(r.holder, 'thermal.mjs');
  r = await P.readThermal({ env: {}, udid: 'D', exec, holder: () => null });
  assert.equal(r.holder, 'Xcode');
  r = await P.readThermal({ env: {}, udid: 'D', exec, holder: () => ({ pid: 1, profile: 'ThermalFair' }) });
  assert.equal(r.holder, 'Xcode', 'our set holds Fair, the condition reads Serious: someone replaced ours');
  const plain = async (cmd, args) => ((args[0] === 'xctrace' ? args[1] : args[0]) === 'export' ? { code: 0, error: null, stdout: (await import('../fixtures/fake-thermal.mjs')).thermalXml([{ state: 'Fair', induced: 'No' }]) } : exec(cmd, args));
  r = await P.readThermal({ env: {}, udid: 'D', exec: plain, holder: () => ours });
  assert.equal(r.holder, null, 'no condition, no holder');
});

// I-250: on 2026-10-08 11:17Z rearm's first read hung 8+ min (xctrace) with an empty log. Now every step prints a progress
// line before it starts, and a read that timed out twice (readThermal: timedOut) ends rearm with TIMEOUT, exit 13.
const HUNG = { error: 'xctrace record timeout after 70 s, twice (process group killed, I-250)', timedOut: true, state: null, induced: null, battC: 33 };
test('I-250 rearm: a progress line before every step (read, clear, each wait probe, set, settle, final read), so the log is never silent for a step', async () => {
  const h = rig([ABOVE, { state: 'Critical', induced: 'No', battC: 34.09 }, { state: 'Nominal', induced: 'No', battC: 34.19 }, ON]);
  const trace = [];
  const wrap = (fn, name) => async (...a) => { trace.push(`<${name}>`); return fn(...a); };
  const r = await R.rearm({ owner: 'int-v11', hold: hold(), read: wrap(h.read, 'read'), clear: wrap(h.clear, 'clear'), set: wrap(h.set, 'set'), sleep: wrap(h.sleep, 'sleep'), now: h.now, log: (l) => trace.push(String(l).split('\n')[0]) });
  assert.deepEqual([r.outcome, r.code], ['cleared', 0]);
  const before = (name, re) => trace.forEach((x, i) => { if (x === `<${name}>` && !(name === 'sleep' && !re)) assert.match(String(trace[i - 1]), re, `${name} at ${i}: ${trace.slice(Math.max(0, i - 2), i + 1).join(' | ')}`); });
  before('clear', /^REARM CLEARING: node tools\/thermal\.mjs clear/);
  before('set', /^REARM SETTING: node tools\/thermal\.mjs set serious/);
  const reads = trace.flatMap((x, i) => (x === '<read>' ? [trace[i - 1]] : []));
  assert.equal(reads.length, 4);
  assert.match(reads[0], /^REARM READ: reading the thermal state \(xctrace Thermal State, about 25 s; a hung xctrace is killed and retried once, I-250\)$/);
  assert.match(reads[1], /^REARM WAIT probe 1: reading the plain state \(until Nominal or Fair with no condition, up to 10 min after the clear\)$/);
  assert.match(reads[2], /^REARM WAIT probe 2: /);
  assert.match(reads[3], /^REARM READ final: the profile read after the settle$/);
  const iSettle = trace.findIndex((x) => /^REARM SETTLE 120 s/.test(x));
  assert.equal(trace[iSettle + 1], '<sleep>');
});

test('I-250 rearm: a hung first read (timedOut) ends with REARM TIMEOUT, exit 13, nothing cleared or set; a hung read after the settle is TIMEOUT 13 too (the set stays); a hung probe read is "not clear yet"', async () => {
  let h = rig([HUNG]);
  let r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['timeout', 13]);
  assert.deepEqual(h.calls.map((c) => c.fn), ['read']);
  assert.match(h.lines.join('\n'), /^REARM TIMEOUT: the thermal read hung \(xctrace record timeout after 70 s, twice \(process group killed, I-250\)\); nothing cleared or set; run rearm again, and if it hangs again tell the lead \(I-250\) \(exit 13\)$/m);
  h = rig([ABOVE, { state: 'Nominal', induced: 'No', battC: 33 }, HUNG]);
  r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['timeout', 13]);
  assert.deepEqual(h.calls.map((c) => c.fn), ['read', 'clear', 'read', 'set', 'sleep', 'read']);
  assert.match(h.lines.join('\n'), /^REARM TIMEOUT: the profile read after the settle hung \(xctrace record timeout .*\); the condition stays set by thermal\.mjs \(pid 4242; end it: node tools\/thermal\.mjs clear --owner int-v11\); read it again: node tools\/iphone\.mjs profile --owner int-v11 --condition tool \(exit 13\)$/m);
  assert.equal(P.readLedger(P.ledgerKey(hold(), 'serious')), null, 'no start read kept');
  h = rig([ABOVE, HUNG, { state: 'Fair', induced: 'No', battC: 33 }, ON]);
  r = await h.run();
  assert.deepEqual([r.outcome, r.code], ['cleared', 0]);
  assert.match(h.lines.join('\n'), /^REARM PROBE 1 \(0 min after the clear\): phone is unknown, battery 33 C: not clear yet \(.*\)$/m);
});
