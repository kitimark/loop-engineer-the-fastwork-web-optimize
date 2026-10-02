// Checks of heat.mjs's pre-registered scorer on synthetic samples (ticket P-068). Research-only; no phone, no network.
//   node --test research/phone-heat/heat.check.mjs
// Samples follow a Newton model, dT/dt = P - 0.045 (T - 32) °C/min, quantized to 0.1 °C like the battery sensor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSegments, verdicts, chargeState } from './heat.mjs';

const POWER = { F: 0.35, A: 0.45, B: 0.75, X: 0.70 }; // °C/min at 32 °C: B − A ≈ +0.30 after correction, F lowest
function makeSeg(lines, { session, attempt = 1, seg, arm, mode = 'held', power = POWER[arm], flipAt = null, startC = 37.0 }) {
  const id = attempt > 1 ? `${session}a${attempt}-${seg}${arm}` : `${session}-${seg}${arm}`;
  let T = startC;
  for (let s = 0; s <= 360; s += 30) {
    const charging = (mode === 'charging') !== (flipAt === s); // one read outside the mode at flipAt
    lines.push({ kind: 'sample', id, session, attempt, seg, arm, sNominal: s, tC: Math.round(T * 10) / 10, IsCharging: charging, ExternalConnected: true });
    for (let k = 0; k < 30; k++) T += (power - 0.045 * (T - 32)) / 60;
  }
  lines.push({ kind: 'segment', id, session, attempt, seg, arm, chargeMode: mode, cycles: [1, 2, 3] });
}
const session = (lines, h, arms, opts = {}) => arms.forEach((arm, i) => makeSeg(lines, { session: h, seg: i + 1, arm, ...opts }));
const H1 = ['F', 'A', 'B', 'X'], H2 = ['X', 'B', 'A', 'F'];

test('chargeState: held, charging, off the cable', () => {
  assert.equal(chargeState({ IsCharging: false, ExternalConnected: true }), 'held');
  assert.equal(chargeState({ IsCharging: true, ExternalConnected: true }), 'charging');
  assert.equal(chargeState({ IsCharging: false, ExternalConnected: false }), 'other');
});

test('both sessions held: a complete verdict', () => {
  const L = []; session(L, 'H1', H1); session(L, 'H2', H2);
  const v = verdicts(scoreSegments(L));
  assert.deepEqual(v.chargeMode, { H1: 'held', H2: 'held' });
  assert.equal(v.fastworkVsApple.verdict, 'Fastwork heats more');
  assert.deepEqual(v.floorCheck, [true, true]);
});

test('one charging read anywhere in 0-360 s excludes the segment (also outside the 60-360 s fit window)', () => {
  const L = []; session(L, 'H1', H1); session(L, 'H2', H2);
  L.splice(0, L.length, ...L.filter((l) => !(l.session === 'H1' && l.arm === 'B')));
  makeSeg(L, { session: 'H1', seg: 3, arm: 'B', flipAt: 0 });
  const segs = scoreSegments(L);
  assert.equal(segs.find((s) => s.id === 'H1-3B').chargeExcluded, true);
  assert.equal(verdicts(segs).fastworkVsApple.verdict, 'incomplete');
});

test('held path: the end-of-session re-run of an excluded arm is the one scored', () => {
  const L = [];
  makeSeg(L, { session: 'H1', seg: 1, arm: 'F' }); makeSeg(L, { session: 'H1', seg: 2, arm: 'A' });
  makeSeg(L, { session: 'H1', seg: 3, arm: 'B', flipAt: 120 }); makeSeg(L, { session: 'H1', seg: 4, arm: 'X' });
  makeSeg(L, { session: 'H1', seg: 5, arm: 'B' }); // the re-run, last
  session(L, 'H2', H2);
  const v = verdicts(scoreSegments(L));
  assert.equal(v.fastworkVsApple.verdict, 'Fastwork heats more');
});

test('fallback: an aborted held attempt is ignored; the charging restart is scored and the mode is "charging"', () => {
  const L = [];
  // attempt 1 (held): F with an absurd slope (would break the floor check if scored), then A and B excluded -> abort
  makeSeg(L, { session: 'H1', seg: 1, arm: 'F', power: 3.0 });
  makeSeg(L, { session: 'H1', seg: 2, arm: 'A', flipAt: 90 });
  makeSeg(L, { session: 'H1', seg: 3, arm: 'B', flipAt: 150 });
  // attempt 2 (charging), same seg numbers, ids made unique by the attempt
  session(L, 'H1', H1, { attempt: 2, mode: 'charging' });
  session(L, 'H2', H2, { mode: 'charging' });
  const segs = scoreSegments(L);
  assert.equal(new Set(segs.map((s) => s.id)).size, segs.length, 'segment ids are unique across attempts');
  const v = verdicts(segs);
  assert.deepEqual(v.attempt, { H1: 2, H2: 1 });
  assert.deepEqual(v.chargeMode, { H1: 'charging', H2: 'charging' });
  assert.equal(v.fastworkVsApple.verdict, 'Fastwork heats more');
  assert.deepEqual(v.floorCheck, [true, true], 'the aborted F (attempt 1) is not scored');
});

test('fallback in one session only: the sessions differ in charge state -> incomplete', () => {
  const L = [];
  makeSeg(L, { session: 'H1', seg: 1, arm: 'F' });
  session(L, 'H1', H1, { attempt: 2, mode: 'charging' });
  session(L, 'H2', H2);
  const v = verdicts(scoreSegments(L));
  assert.deepEqual(v.chargeMode, { H1: 'charging', H2: 'held' });
  assert.equal(v.fastworkVsApple.verdict, 'incomplete (the sessions differ in charge state)');
  assert.equal(v.fixesVsBaseline.verdict, 'incomplete (the sessions differ in charge state)');
});

test('fallback gate TIMEOUT before attempt 2 wrote any segment: the attempt marker makes it incomplete', () => {
  const L = [];
  // attempt 1 (held): F excluded, A B X valid; F's re-run gate timed out -> fallback; the charging gate timed out too
  makeSeg(L, { session: 'H1', seg: 1, arm: 'F', flipAt: 30 });
  makeSeg(L, { session: 'H1', seg: 2, arm: 'A' }); makeSeg(L, { session: 'H1', seg: 3, arm: 'B' }); makeSeg(L, { session: 'H1', seg: 4, arm: 'X' });
  session(L, 'H2', H2);
  const marker = { kind: 'attempt', session: 'H1', attempt: 2, chargeMode: 'charging' };
  const segs = scoreSegments(L);
  assert.equal(verdicts(segs).fastworkVsApple.verdict, 'Fastwork heats more', 'without the marker, attempt 1 would be scored');
  const v = verdicts(segs, undefined, [marker]);
  assert.deepEqual(v.attempt, { H1: 2, H2: 1 });
  assert.match(v.fastworkVsApple.verdict, /^incomplete/);
  assert.match(v.fixesVsBaseline.verdict, /^incomplete/);
});

test('a fallback session that never finished (gate TIMEOUT) gives incomplete', () => {
  const L = [];
  makeSeg(L, { session: 'H1', seg: 1, arm: 'F' }); makeSeg(L, { session: 'H1', seg: 2, arm: 'A', flipAt: 60 });
  makeSeg(L, { session: 'H1', attempt: 2, seg: 1, arm: 'F', mode: 'charging' }); // then charge-wait --want charging timed out
  session(L, 'H2', H2, { mode: 'charging' });
  const v = verdicts(scoreSegments(L));
  assert.match(v.fastworkVsApple.verdict, /^incomplete/);
});
