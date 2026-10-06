// tools/lib/gesture-from-record.mjs (incident I-218, article clips T-211): a finger record (`iphone.mjs record --touches`)
// -> a gesture script `iphone.mjs gesture` accepts, the scroll curve that script should produce (expected fidelity), and
// the score of a replay's scroll curve against the user's. Fixture records: tests/fixtures/finger-record.mjs (a small
// finger + scroll model, no phone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScript, LIMITS } from '../../tools/lib/gesture.mjs';
import * as G from '../../tools/lib/gesture-from-record.mjs';
import { makeRecord, lin, ease, flick, SCENE } from '../fixtures/finger-record.mjs';

test('I-218: contactsOf groups touches into contacts (start..end), with the finger points; a second finger marks it multi', () => {
  const rec = makeRecord(SCENE);
  const cs = G.contactsOf(rec.touches);
  assert.equal(cs.length, 5);
  assert.deepEqual(cs.map((c) => [c.multi, c.open ?? false, c.cancelled]), Array(5).fill([false, false, false]));
  assert.equal(cs[0].pts[0][1], 650);
  assert.equal(cs[0].pts.at(-1)[1], 350);
  assert.equal(Math.round(cs[1].end - cs[1].start), 3300);
  const multi = G.contactsOf(makeRecord(SCENE, { multiAt: 3500 }).touches);
  assert.deepEqual(multi.map((c) => c.multi), [false, true, false, false, false]);
});

test('I-218: splitReversals cuts a contact at the finger\'s turning point (10 px hysteresis), not at jitter', () => {
  const pts = [[0, 700], [100, 600], [200, 500], [250, 503], [300, 497], [400, 560], [500, 650]];
  const p = G.splitReversals(pts, 10);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0].at(-1), [300, 497], 'cut at the extreme');
  assert.deepEqual(p[1][0], [300, 497]);
  assert.equal(G.splitReversals([[0, 500], [50, 504], [100, 498]], 10).length, 1, 'jitter under the hysteresis: one piece');
});

test('I-218: fromRecord makes a script iphone.mjs gesture accepts: strokes within the guards, long drags split, flings matched at lift-off, a hold kept, pauses keep the timeline, taps dropped, a down stroke guarded', () => {
  const rec = makeRecord(SCENE);
  const r = G.fromRecord(rec, { name: 'finger-test' });
  const prog = compileScript(r.script); // the gesture compiler accepts it as is
  assert.equal(prog.strokes.length, r.strokes.length);
  for (const s of prog.strokes) {
    assert.ok(s.px >= LIMITS.px[0] && s.px <= LIMITS.px[1], `px ${s.px}`);
    assert.ok(s.ms >= LIMITS.ms[0] && s.ms <= LIMITS.ms[1], `ms ${s.ms}`);
  }
  // flick up (fling) | drag up 700 -> two parts of 350 (drag, the last holds ~300 ms) | flick down (fling) | up, down (reversal)
  assert.deepEqual(prog.strokes.map((s) => [s.dir, s.profile]), [['up', 'fling'], ['up', 'drag'], ['up', 'drag'], ['down', 'fling'], ['up', 'minjerk'], ['down', 'fling']]);
  assert.deepEqual(prog.strokes.slice(1, 3).map((s) => s.px), [350, 350]);
  assert.ok(Math.abs(prog.strokes[2].holdMs - 300) <= 20, `hold ${prog.strokes[2].holdMs}`);
  assert.equal(prog.strokes[1].holdMs, 0);
  // the fling's lift-off speed is the finger's (~2000 px/s over the last 50 ms): ms = 1875 * px / v
  const f = r.strokes[0];
  assert.ok(f.userLiftPxPerS > 1700 && f.userLiftPxPerS < 2100, `lift ${f.userLiftPxPerS}`);
  assert.ok(Math.abs(prog.strokes[0].analyticPeakPxPerS - f.userLiftPxPerS) < 40, `${prog.strokes[0].analyticPeakPxPerS} vs ${f.userLiftPxPerS}`);
  // the tap is dropped and said so; the down fling got an until y>=300 before it
  assert.deepEqual(r.dropped.map((d) => d.why.split(':')[0]), ['short']);
  const types = r.script.steps.map((s) => (s.type === 'until' ? `until ${s.cond}` : s.type));
  const i = types.indexOf('until y>=300');
  assert.ok(i > 0 && r.script.steps[i + 1].dir === 'down', types.join(','));
  // the timeline: each stroke starts when the finger did (a fling: so that it lifts when the finger lifted), unless the
  // stroke before it still runs; then it starts right after it, and the lateness is said
  let prevEnd = null;
  for (const s of r.strokes) {
    assert.equal(s.scriptStartMs, prevEnd === null ? s.plannedStartMs : Math.max(s.plannedStartMs, prevEnd), s.id);
    assert.equal(s.lateMs, s.scriptStartMs - s.plannedStartMs);
    prevEnd = s.scriptStartMs + s.contactMs;
  }
  assert.deepEqual(r.strokes.filter((s) => s.lateMs > 100).map((s) => s.id), ['s6'], 'the slow lift after the turn: a fling at 250 px/s needs longer than the finger took');
  assert.ok(r.notes.some((n) => /^s6 starts \d+ ms after its planned time/.test(n)), r.notes.join('\n'));
  assert.equal(r.strokes[0].plannedStartMs, 300 - r.strokes[0].contactMs, 'the fling lifts when the finger lifted (300 ms after its touch)');
  assert.equal(r.strokes[1].plannedStartMs, 2500, 'the drag starts 2.5 s after the first touch, as the finger did');
  // a trailing pause records the last momentum; the source block says where the script came from
  assert.equal(r.script.steps.at(-1).type, 'pause');
  assert.equal(r.script.source.tool, 'gesture-from-record');
  assert.equal(r.script.source.startScrollY, 0);
  assert.equal(r.script.source.strokes.length, prog.strokes.length);
  assert.deepEqual(r.script.screen, [430, 932]);
});

test('I-218: the expected curve (what the script should produce) is scored against the user\'s; the model floor (the user\'s own finger through the same model) is at least as close', () => {
  const rec = makeRecord(SCENE);
  const r = G.fromRecord(rec, { name: 'finger-test' });
  const e = r.expected;
  assert.ok(e.curve.length > 100);
  assert.ok(e.score.n > 500);
  assert.ok(e.score.meanAbsDy < 60, `script mean |dy| ${e.score.meanAbsDy}`);
  assert.ok(e.floor.meanAbsDy <= e.score.meanAbsDy + 1, `floor ${e.floor.meanAbsDy} vs script ${e.score.meanAbsDy}`);
  assert.ok(e.floor.meanAbsDy < 40, `floor mean ${e.floor.meanAbsDy}`);
  assert.ok(e.tauS > 0.3 && e.tauS < 0.6, `tau from the user's flings ${e.tauS}`);
  assert.equal(typeof e.score.maxAbsDy, 'number');
});

test('I-218: --from/--to keep only the contacts that start in the window; a window with none is an error; a record without touches is refused', () => {
  const rec = makeRecord(SCENE);
  const r = G.fromRecord(rec, { name: 'w', fromS: 7, toS: 10 });
  assert.equal(r.strokes.length, 1);
  assert.equal(r.strokes[0].dir, 'down');
  assert.ok(r.script.source.startScrollY > 600, `the page is not at the top there: ${r.script.source.startScrollY}`);
  assert.ok(r.notes.some((n) => /position the page at scrollY/.test(n)), r.notes.join('\n'));
  assert.throws(() => G.fromRecord(rec, { name: 'w', fromS: 19, toS: 20 }), /no finger contact/);
  assert.throws(() => G.fromRecord({ ...rec, touches: undefined }, { name: 'w' }), /record --touches/);
});

test('I-218: a down stroke near the top (scrollY < 300) is dropped (pull-to-refresh guard), one longer than the scrollY is trimmed; a multi-finger contact is dropped', () => {
  const rec = makeRecord([
    { at: 500, ms: 200, path: flick(500, 700) }, // down at the top: dropped
    { at: 1500, ms: 600, path: ease(750, 300) }, // up 450, ends at rest
    { at: 3000, ms: 500, path: lin(250, 740) }, // down 490 at y ~440: trimmed to the scrollY
  ], { multiAt: null });
  const r = G.fromRecord(rec, { name: 'top' });
  assert.deepEqual(r.dropped.map((d) => d.why.split(':')[0]), ['pull-guard']);
  assert.equal(r.strokes.length, 2);
  const down = r.strokes[1];
  assert.equal(down.dir, 'down');
  assert.ok(down.px < down.userPx && down.px <= down.userStartY, `${down.px} vs ${down.userPx} at ${down.userStartY}`);
  compileScript(r.script);
  const m = G.fromRecord(makeRecord(SCENE, { multiAt: 3500 }), { name: 'm' });
  assert.ok(m.dropped.some((d) => /^multi/.test(d.why)));
});

test('I-218: --overhead-ms shortens every pause by the per-stroke WDA start latency (never below 0)', () => {
  const rec = makeRecord(SCENE);
  const a = G.fromRecord(rec, { name: 'a' }), b = G.fromRecord(rec, { name: 'b', overheadMs: 700 });
  const pauses = (r) => r.script.steps.slice(0, -1).filter((s) => s.type === 'pause').map((s) => s.ms);
  assert.equal(pauses(a).length, pauses(b).length + pauses(a).filter((p) => p <= 700).length);
  assert.ok(pauses(b).every((p, i) => p === pauses(a).filter((q) => q > 700)[i] - 700));
});

/** A gesture run doc (iphone.mjs gesture's output) replaying `rec` with `lagMs` more WDA latency before each contact: the
 *  user's frames and touches, each moved later by lagMs per contact begun (the page rests in the gaps). */
function replayOf(rec, { lagMs = 800, dy = 0, cut = null } = {}) {
  const cs = G.contactsOf(rec.touches);
  const shift = (t) => { let k = 0; for (const c of cs) if (c.start <= t) k++; return k * lagMs; };
  const frames = rec.frames.map((f) => [Math.round((f[0] + shift(f[0])) * 10) / 10, f[1], f[2] + (cut !== null && f[0] > cut ? dy : 0), f[3]]);
  const touches = rec.touches.map((e) => [e[0] + shift(e[0]), e[1], e[2], e[3], e[4], e[5], e[6], e[7] + shift(e[7])]);
  return { meta: { kind: 'gesture' }, run: { segments: [{ frames, touches, marks: [] }], strokes: [] } };
}

test('I-218: compare scores a replay against the user\'s curve: stroke alignment removes the WDA lag, start alignment does not; key moments, crossings, a --max-dy verdict', () => {
  const rec = makeRecord(SCENE);
  const rep = replayOf(rec, { lagMs: 800 });
  const c = G.compare(rec, rep, { cross: [1500, 1800] });
  assert.equal(c.align, 'strokes');
  assert.equal(c.anchors, 5);
  assert.ok(c.score.meanAbsDy < 5, `stroke-aligned mean ${c.score.meanAbsDy}`);
  assert.deepEqual(c.strokes.map((s) => s.lagMs), [0, 800, 1600, 2400, 3200], 'each touch later by the lag');
  assert.equal(c.crossings.length, 2);
  assert.ok(c.crossings[0].dMs > 700, `the 1500 px crossing comes later in the replay: ${c.crossings[0].dMs}`);
  assert.ok(Math.abs(c.peak.replay.y - c.peak.user.y) <= 2);
  const s = G.compare(rec, rep, { align: 'start' });
  assert.equal(s.align, 'start');
  assert.ok(s.score.meanAbsDy > 3 * c.score.meanAbsDy + 20, `start-aligned ${s.score.meanAbsDy} vs strokes ${c.score.meanAbsDy}`);
  // an end position 120 px off after 12 s shows in max/end, and fails --max-dy 50
  const off = G.compare(rec, replayOf(rec, { lagMs: 0, dy: 120, cut: 5000 + 12000 }), { maxDy: 50 });
  assert.ok(off.score.maxAbsDy >= 118 && off.score.endDy >= 118, JSON.stringify(off.score));
  assert.equal(off.verdict, 'MISS');
  assert.equal(G.compare(rec, rep, { maxDy: 50 }).verdict, 'OK');
});

test('I-218: compare with the script aligns the script\'s strokes to the replay\'s touches (split strokes, dropped taps); mismatched counts fall back to start with a note', () => {
  const rec = makeRecord(SCENE);
  const r = G.fromRecord(rec, { name: 's' });
  // a replay that plays the SCRIPT's strokes: 6 touch sequences (the split drag, the reversal), no tap
  const rep = replayOf(rec, { lagMs: 0 });
  const seg = rep.run.segments[0];
  // rebuild the replay's touches as one start/end per script stroke at the user's times
  const t0 = r.script.source.firstTouchT;
  seg.touches = r.script.source.strokes.flatMap((s) => [[t0 + s.userMs, 's', 1, 1, 0, 0, 500, t0 + s.userMs], [t0 + s.userMs + 100, 'e', 0, 1, 0, 0, 400, t0 + s.userMs + 100]]);
  const c = G.compare(rec, rep, { script: r.script });
  assert.equal(c.align, 'strokes');
  assert.equal(c.anchors, r.strokes.length);
  assert.ok(c.score.meanAbsDy < 3);
  seg.touches = seg.touches.slice(0, 4);
  const d = G.compare(rec, rep, { script: r.script });
  assert.equal(d.align, 'start');
  assert.ok(d.notes.some((n) => /2 touch sequences in the replay, 6 strokes in the script/.test(n)), d.notes.join('\n'));
});

test('I-218: curveOf reads a record or a gesture run (one segment, or --seg), and refuses a count-only run', () => {
  const rec = makeRecord(SCENE, { seconds: 2 });
  assert.equal(G.curveOf(rec).kind, 'record');
  const rep = replayOf(rec, { lagMs: 0 });
  assert.equal(G.curveOf(rep).kind, 'gesture');
  rep.run.segments.push(rep.run.segments[0]);
  assert.throws(() => G.curveOf(rep), /2 segments \(a reload\): pick one with --seg/);
  assert.equal(G.curveOf(rep, { seg: 1 }).kind, 'gesture');
  assert.throws(() => G.curveOf({ meta: { countOnly: true }, run: { segments: [{ frames: 120 }] } }), /no frame log/);
});
