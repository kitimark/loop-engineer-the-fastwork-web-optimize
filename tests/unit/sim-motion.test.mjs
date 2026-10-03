// tools/lib/sim-motion.mjs (incident I-100): the Simulator's Reduce Motion switch for `sim.mjs session --reduce-motion
// on|off`, on an in-memory fake `simctl spawn <udid> defaults ...` (no Simulator). Covers the --reduce-motion value
// check, read / write / delete with the read-back, the pending record written BEFORE the change (so a killed session
// is restored by the next one), the restore at the end, a stale record of another device left alone, the page check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { RM_DOMAIN, RM_KEY, parseReduceMotion, readReduceMotion, writeReduceMotion, applyReduceMotion, restoreReduceMotion, restorePending, readPending, fmtRM, pageVerdict, PAGE_MOTION_JS, pendingLine } from '../../tools/lib/sim-motion.mjs';
import { tempDir } from '../helpers.mjs';

const UDID = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE'; // made up
/** A fake simctl: defaults of one booted device in memory; like the real `defaults`, read of a missing key exits 1. */
function fakeSimctl({ value, failWrite = false, liar = false } = {}) {
  const st = { value, calls: [] };
  st.simctl = (args) => {
    st.calls.push(args);
    const [c, u, tool, verb, dom, key, type, v] = args;
    assert.deepEqual([c, u, tool, dom, key], ['spawn', UDID, 'defaults', RM_DOMAIN, RM_KEY], `unexpected call ${args.join(' ')}`);
    if (verb === 'read') return st.value === undefined ? { status: 1, stdout: '', stderr: `\nThe domain/default pair of (${RM_DOMAIN}, ${RM_KEY}) does not exist\n` } : { status: 0, stdout: st.value ? '1\n' : '0\n', stderr: '' };
    if (failWrite) return { status: 1, stdout: '', stderr: `An error was encountered processing the command: device ${UDID} is not booted` };
    if (verb === 'write') { assert.equal(type, '-bool'); if (!liar) st.value = v === 'true'; return { status: 0, stdout: '', stderr: '' }; }
    if (verb === 'delete') { if (st.value === undefined) return { status: 1, stdout: '', stderr: `Domain (${RM_DOMAIN}) not found.\nDefaults have not been changed.` }; st.value = undefined; return { status: 0, stdout: '', stderr: '' }; }
    throw new Error(`unexpected verb ${verb}`);
  };
  return st;
}
const writeFile = (f, text) => writeFileSync(f, text, { mode: 0o600 });

test('parseReduceMotion: on / off / absent; anything else (or no value) is refused', () => {
  assert.equal(parseReduceMotion(undefined), null);
  assert.equal(parseReduceMotion('on'), 'on');
  assert.equal(parseReduceMotion('off'), 'off');
  for (const bad of ['true', 'yes', '1', '', true]) assert.throws(() => parseReduceMotion(bad), /--reduce-motion takes on or off/);
  assert.equal(fmtRM(true), 'on'); assert.equal(fmtRM(false), 'off'); assert.equal(fmtRM(null), 'unset (off)');
});

test('readReduceMotion / writeReduceMotion: 1 / 0 / missing key; a write is read back; a failed write throws', () => {
  const f = fakeSimctl();
  assert.equal(readReduceMotion(UDID, f), null, 'missing key = unset');
  assert.equal(writeReduceMotion(UDID, true, f), true);
  assert.deepEqual(f.calls.at(-2), ['spawn', UDID, 'defaults', 'write', RM_DOMAIN, RM_KEY, '-bool', 'true']);
  assert.equal(readReduceMotion(UDID, f), true);
  assert.equal(writeReduceMotion(UDID, false, f), false);
  assert.equal(writeReduceMotion(UDID, null, f), null, 'null deletes the key');
  assert.equal(writeReduceMotion(UDID, null, f), null, 'deleting a missing key is fine');
  assert.throws(() => writeReduceMotion(UDID, true, fakeSimctl({ failWrite: true })), /could not set Reduce Motion on/);
  assert.throws(() => writeReduceMotion(UDID, true, fakeSimctl({ value: false, liar: true })), /Reduce Motion reads off after setting it on/);
  const odd = { simctl: () => ({ status: 0, stdout: 'maybe\n', stderr: '' }) };
  assert.throws(() => readReduceMotion(UDID, odd), /printed "maybe", not 0 or 1/);
  const broken = { simctl: () => ({ status: 149, stdout: '', stderr: 'Unable to lookup in current state: Shutdown' }) };
  assert.throws(() => readReduceMotion(UDID, broken), /could not read Reduce Motion/);
});

test('apply then restore: the pending record (mode 600) is written before the change and removed by the restore; the previous value comes back (unset = key deleted)', () => {
  const dir = tempDir('fw-rm-');
  const file = join(dir, 'reduce-motion.json');
  for (const before of [undefined, false, true]) {
    const f = fakeSimctl({ value: before });
    let seenBefore = null;
    const spy = { simctl: (a) => { if (a[3] === 'write') seenBefore = readPending(file); return f.simctl(a); } };
    const r = applyReduceMotion({ file, udid: UDID, mode: 'on', session: 's1', owner: 'me', device: 'fw-sim', simctl: spy.simctl, writeFile });
    assert.deepEqual(r, { requested: 'on', previous: before ?? null, value: true });
    assert.equal(f.value, true);
    assert.equal(seenBefore?.session, 's1', 'the record exists before the write');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const p = readPending(file);
    assert.deepEqual([p.session, p.owner, p.device, p.previous, p.set], ['s1', 'me', 'fw-sim', before ?? null, true]);
    assert.equal(restoreReduceMotion({ file, udid: UDID, session: 'other', simctl: f.simctl }), null, 'another session\'s record is not this session\'s to restore');
    assert.ok(existsSync(file));
    assert.deepEqual(restoreReduceMotion({ file, udid: UDID, session: 's1', simctl: f.simctl }), { restored: before ?? null, value: before ?? null });
    assert.equal(f.value, before);
    assert.ok(!existsSync(file), 'record removed after the restore');
    assert.equal(restoreReduceMotion({ file, udid: UDID, session: 's1', simctl: f.simctl }), null, 'nothing left to restore');
  }
  const off = fakeSimctl({ value: true });
  assert.deepEqual(applyReduceMotion({ file, udid: UDID, mode: 'off', session: 's2', owner: 'me', device: 'fw-sim', simctl: off.simctl, writeFile }), { requested: 'off', previous: true, value: false });
  restoreReduceMotion({ file, udid: UDID, session: 's2', simctl: off.simctl });
  assert.equal(off.value, true);
});

test('a failed write keeps the record (the next session restores it); a failed restore keeps it too', () => {
  const dir = tempDir('fw-rm-');
  const file = join(dir, 'reduce-motion.json');
  const f = fakeSimctl({ value: false, failWrite: true });
  assert.throws(() => applyReduceMotion({ file, udid: UDID, mode: 'on', session: 's1', owner: 'me', device: 'fw-sim', simctl: f.simctl, writeFile }), /could not set Reduce Motion/);
  assert.equal(readPending(file).previous, false);
  assert.throws(() => restoreReduceMotion({ file, udid: UDID, session: 's1', simctl: f.simctl }), /could not set Reduce Motion/);
  assert.ok(existsSync(file), 'still pending');
});

test('restorePending: a record left by a killed session of this device is restored at the next session; another device\'s stays', () => {
  const dir = tempDir('fw-rm-');
  const file = join(dir, 'reduce-motion.json');
  const f = fakeSimctl({ value: undefined });
  applyReduceMotion({ file, udid: UDID, mode: 'on', session: 'dead', owner: 'gone', device: 'fw-sim', simctl: f.simctl, writeFile });
  // ... the session was killed (SIGKILL): no restore ran
  assert.equal(f.value, true);
  assert.match(pendingLine(readPending(file)), /^Reduce Motion left on by session dead \(owner gone, fw-sim\) at .*: the next fw-sim session restores it to unset \(off\) \(I-100\)$/);
  assert.equal(restorePending({ file, udid: UDID, device: 'fw-ipad', simctl: f.simctl }), null, 'an iPad session does not touch fw-sim\'s setting');
  assert.ok(existsSync(file));
  const r = restorePending({ file, udid: UDID, device: 'fw-sim', simctl: f.simctl });
  assert.deepEqual([r.session, r.owner, r.previous, r.set], ['dead', 'gone', null, true]);
  assert.equal(f.value, undefined, 'back to unset');
  assert.ok(!existsSync(file));
  assert.equal(restorePending({ file, udid: UDID, device: 'fw-sim', simctl: f.simctl }), null);
  writeFileSync(file, '{not json');
  assert.equal(readPending(file), null);
});

test('pageVerdict: the page\'s matchMedia answer against the wanted setting', () => {
  assert.equal(typeof PAGE_MOTION_JS, 'string');
  assert.match(PAGE_MOTION_JS, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.deepEqual(pageVerdict({ reduce: true, noPreference: false }, 'on'), { ok: true, media: 'reduce', line: 'REDUCE_MOTION page reduce (session --reduce-motion on): ok' });
  assert.deepEqual(pageVerdict({ reduce: false, noPreference: true }, 'off'), { ok: true, media: 'no-preference', line: 'REDUCE_MOTION page no-preference (session --reduce-motion off): ok' });
  assert.equal(pageVerdict({ reduce: false, noPreference: true }, 'on').ok, false);
  assert.match(pageVerdict({ reduce: false, noPreference: true }, 'on').line, /^REDUCE_MOTION page no-preference \(session --reduce-motion on\): MISMATCH/);
  assert.equal(pageVerdict({ reduce: true, noPreference: false }, 'off').ok, false);
  assert.deepEqual(pageVerdict({ reduce: true, noPreference: false }, null), { ok: true, media: 'reduce', line: 'REDUCE_MOTION page reduce (session without --reduce-motion: not checked)' });
  assert.equal(pageVerdict({ reduce: true, noPreference: true }, 'on').ok, false, 'both or neither: the page answers nonsense');
  assert.equal(pageVerdict(null, 'on').ok, false);
});
