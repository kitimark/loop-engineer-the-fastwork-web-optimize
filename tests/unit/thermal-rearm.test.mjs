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
const ABOVE = { state: 'Critical', induced: 'Yes', condition: 'Serious', battC: 34.5 }; // 10-07 01:22Z: profile exit 8 at 34.5 C
const ON = { state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 34.2 };

/** A fake phone: reads come from `seq` (the last one repeats); each read takes 25 s of fake time; every call is logged. */
function rig(seq, { clearErr, setErr } = {}) {
  let t = Date.parse('2026-10-07T01:26:56Z');
  const calls = [], lines = [];
  let i = 0;
  const h = {
    calls, lines, now: () => t,
    read: async () => { const at = t; calls.push({ fn: 'read', at }); t += 25000; const r = seq[Math.min(i++, seq.length - 1)]; return { at: new Date(at).toISOString(), ms: 25000, rows: 1, error: null, ...r }; },
    clear: async () => { calls.push({ fn: 'clear', at: t }); if (clearErr) throw new Error(clearErr); t += 2000; return { line: 'CLEARED the active condition' }; },
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
  assert.match(out, /^PROFILE serious ok at the hold's start: phone is Serious \(induced by Xcode\), battery 34\.2 C/m);
  assert.match(out, /^REARM CLEARED: phone is Serious \(induced by Xcode\), battery 34\.2 C; the condition stays set by thermal\.mjs \(pid 4242\) \(exit 0\)$/m);
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
  assert.match(out, /^REARM STILL-CRITICAL: REFUSED profile serious \(Serious, induced by Xcode\): phone is Critical \(Xcode condition Serious\), battery 34\.5 C; .*reason phone-above-condition, I-186\); the condition stays set by thermal\.mjs \(pid 4242; end it: node tools\/thermal\.mjs clear --owner int-v11\) \(exit 8\)$/m);
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
  const x = rig([ABOVE, { state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 34 }]);
  await x.run({ maxWaitMs: 60000 });
  assert.match(x.lines.join('\n'), /^REARM PROBE 1 \(0 min after the clear\): phone is Serious \(induced by Xcode\), battery 34 C: not clear yet \(a condition is still on after the clear: induced by Xcode\)$/m);
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
  assert.match(h.lines.join('\n'), /^REARM NOT-NEEDED: phone is Serious \(induced by Xcode\), battery 34\.2 C fits the serious profile; nothing cleared or set \(exit 0\)$/m);
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

test('I-225 the gate\'s tool mode (--condition tool / FW_PHONE_CONDITION=tool): no Xcode step; serious misfits point to iphone.mjs rearm, fair ones to thermal.mjs clear; the line and exit 8 unchanged', async () => {
  assert.equal(P.parseCondition(undefined), 'xcode');
  assert.equal(P.parseCondition('tool'), 'tool');
  assert.equal(P.parseCondition('xcode'), 'xcode');
  assert.throws(() => P.parseCondition('both'), /--condition must be xcode \(default: the tester's Xcode, a console step\) or tool \(thermal\.mjs, I-199: no step, iphone\.mjs rearm\)/);
  assert.equal(P.parseCondition(undefined, { FW_PHONE_CONDITION: 'tool' }), 'tool');
  const gate = (read, extra = {}) => P.startGate({ owner: 'int-v11', hold: hold(), read: async () => ({ ...read }), log: () => {}, condition: 'tool', ...extra }).catch((x) => x);
  for (const read of [ABOVE, { ...ABOVE, battC: 40 }, { state: 'Nominal', induced: 'No', battC: 31 }, { state: 'Critical', induced: 'Yes', condition: 'Critical', battC: 33 }]) {
    const e = await gate(read);
    assert.ok(e instanceof P.ProfileRefusal, String(e));
    assert.equal(e.exitCode, 8);
    const [first, second] = e.message.split('\n');
    assert.equal(first, P.refusalText('serious', read, P.profileVerdict('serious', read)).line, 'the refusal line is the Xcode mode\'s');
    assert.equal(second, 'REARM the thermal tool fixes it (no user step): node tools/iphone.mjs rearm --owner int-v11 (inside your phone hold: thermal.mjs clear, plain reads once a minute until Nominal/Fair, set serious, settle 120 s, the profile read; I-225)');
  }
  let e = await gate({ state: 'Serious', induced: 'Yes', condition: 'Serious', battC: 33 }, { profile: 'fair' });
  assert.match(e.message, /\nCLEAR the thermal tool fixes it \(no user step\): node tools\/thermal\.mjs clear --owner int-v11 \(inside your phone hold; I-199\)$/);
  e = await gate({ state: 'Serious', induced: 'No', battC: 40 }, { profile: 'fair' });
  assert.doesNotMatch(e.message, /\n(CLEAR|REARM|STEP) /, 'real heat: cool down, nothing to switch');
  assert.equal(C.list().length, 0, 'tool mode posts no step');
  // the Xcode mode (default) still posts its step
  e = await P.startGate({ owner: 'int-v11', hold: hold(), read: async () => ({ ...ABOVE }), log: () => {} }).catch((x) => x);
  assert.match(e.message, /\nSTEP C-\d+ posted/);
});
