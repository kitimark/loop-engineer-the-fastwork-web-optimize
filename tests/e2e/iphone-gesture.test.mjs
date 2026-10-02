// tools/iphone.mjs gesture and wda, without the phone (NEW measurement code, finger simulation):
// - gesture end to end against tests/fixtures/fake-webkit-proxy.mjs --wda-port: a fake Safari page (vm window,
//   rAF, touch listeners, scroll + momentum + toolbar model) driven by an in-process fake WebDriverAgent;
// - the guards: lease (like scroll/record), Safari in front, the runtime pull-to-refresh check, a lease lost
//   mid-run, no /source or element calls;
// - wda build|start|status|stop against fake xcodebuild/iproxy, with FW_WDA_HOME and FW_STATE_DIR in temp dirs.
// Never the real phone, its proxy ports, the real WDA (FW_WDA_URL always points at a fake or a free port) or
// the real locks.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, freePort, startProc, TESTS, REPO, sleep } from '../helpers.mjs';
import { createHash } from 'node:crypto';
import { compileScript, COMPILER_VERSION } from '../../tools/lib/gesture.mjs';
import { TOOL_FILES } from '../../tools/lib/gesture-run.mjs';
import { RECORDER_JS } from '../../tools/lib/gesture-rec.mjs';
import { WDA_REF } from '../../tools/lib/wda-runner.mjs';
import { pidAlive } from '../../tools/lib/lock.mjs';

const sha16 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const IPHONE = tool('iphone.mjs'), LOCK = tool('lock.mjs');
const FIX = join(TESTS, 'fixtures');
const PROTOCOL = join(REPO, 'tools', 'gestures', 'finger-protocol-v1.json');
let env;
before(async () => { env = { FW_WDA_HOME: tempDir('fw-wdahome-'), FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()), FW_WDA_URL: `http://127.0.0.1:${await freePort()}` }; });
beforeEach(() => { env = { ...env, FW_STATE_DIR: tempDir('fw-gesture-') }; });
const lock = (...a) => node(LOCK, a, { env });
const procs = [];
after(() => Promise.all(procs.map((p) => p.stop())));

const S = (o) => ({ type: 'stroke', dir: 'up', px: 520, ms: 160, profile: 'fling', ...o });
function scriptFile(steps, extra = {}) {
  const f = join(tempDir('fw-gscript-'), 'script.json');
  writeFileSync(f, JSON.stringify({ name: 'e2e', version: 1, screen: [430, 932], steps, ...extra }));
  return f;
}
async function fakePhone(args = []) {
  const dir = tempDir('fw-gphone-');
  const wipLog = join(dir, 'wip.jsonl'), wdaLog = join(dir, 'wda.jsonl');
  const p = await startProc(process.execPath, [join(FIX, 'fake-webkit-proxy.mjs'), '--port=0', '--url=http://192.168.0.2:5441/', '--wda-port=0', ...args],
    { env: { FAKE_WIP_LOG: wipLog, FAKE_WDA_LOG: wdaLog }, ready: (s) => /^FAKE_WDA_PORT=\d+$/m.test(s) });
  procs.push(p);
  const out = p.stdout();
  const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  return {
    env: { ...env, FW_IPHONE_PORT: out.match(/^FAKE_WIP_PORT=(\d+)$/m)[1], FW_WDA_URL: `http://127.0.0.1:${out.match(/^FAKE_WDA_PORT=(\d+)$/m)[1]}` },
    wda: () => read(wdaLog), wip: () => read(wipLog), dir,
  };
}
const actionsCalls = (calls) => calls.filter((c) => /\/actions$/.test(c.path));

test('gesture --dry-run: compiles and prints the strokes and the hash; needs no lease and touches nothing', () => {
  const r = node(IPHONE, ['gesture', PROTOCOL, '--dry-run', '--variant', 'slow', '--param', 'pushes=4'], { env });
  assert.equal(r.code, 0, r.out);
  const want = compileScript(JSON.parse(readFileSync(PROTOCOL, 'utf8')), { params: { variant: 'slow', pushes: '4' } });
  assert.match(r.stdout, new RegExp(`^GESTURE_HASH ${want.hash}$`, 'm'));
  assert.match(r.stdout, /^finger-protocol-v1 v1 hash [0-9a-f]{12} .*"variant":"slow".*"pushes":4.*: 20 strokes/m);
  assert.match(r.stdout, /^ {2}s1 up 450 px \/ 900 ms minjerk: x 215 y 705->255/m);
  const bad = node(IPHONE, ['gesture', scriptFile([{ type: 'reload' }, S({ dir: 'down' })]), '--dry-run'], { env });
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /pull-to-refresh guard/);
  // the slow-drag script (U5): drag strokes print their plateau speed
  const sd = node(IPHONE, ['gesture', join(REPO, 'tools', 'gestures', 'slow-drag-v1.json'), '--dry-run'], { env });
  assert.equal(sd.code, 0, sd.out);
  assert.match(sd.stdout, /^slow-drag-v1 v1 hash [0-9a-f]{12} .*: 5 strokes/m);
  assert.match(sd.stdout, /^ {2}s2 up 560 px \/ 4458 ms drag: .*\(plateau 130 px\/s\)/m);
  assert.match(sd.stdout, /^ {2}s3 down 560 px \/ 4458 ms drag: .*\(plateau 130 px\/s\)/m);
});

test('gesture and wda start refuse without the lease (no --owner, nobody holds it, someone else holds it)', () => {
  const f = scriptFile([S({})]);
  for (const cmd of [['gesture', f], ['wda', 'start']]) {
    let r = node(IPHONE, cmd, { env });
    assert.equal(r.code, 1, cmd.join(' '));
    assert.match(r.stderr, /--owner <topic> is required/);
    r = node(IPHONE, [...cmd, '--owner', 'me'], { env });
    assert.match(r.stderr, /you \("me"\) don't hold the iphone lease/);
  }
  lock('acquire', 'iphone', '--owner', 'someone-else');
  for (const cmd of [['gesture', f], ['wda', 'start']]) assert.match(node(IPHONE, [...cmd, '--owner', 'me'], { env }).stderr, /\(holder: "someone-else"\)/);
});

test('gesture end to end on the fake phone: strokes as real touches, recorder, marks, reload, loops, summary', async () => {
  const phone = await fakePhone(['--doc-height=2800', '--prevent-at-end']); // maxY 1985 collapsed
  const f = scriptFile([
    { type: 'reload', scrollAfterMs: 200 },
    { type: 'mark', name: 'go' },
    { type: 'repeat', times: 6, until: 'atEnd', steps: [S({}), { type: 'pause', ms: 300 }] },
    { type: 'until', cond: 'atEnd', timeoutMs: 6000 },
    { type: 'until', cond: 'settled', timeoutMs: 6000, optional: true },
    S({ px: 300, ms: 300, profile: 'still', holdMs: 200 }),
    S({ dir: 'down', px: 450, ms: 400, profile: 'still' }),
    { type: 'repeat', times: 3, until: 'atTop', steps: [S({ dir: 'down', ms: 140 }), { type: 'pause', ms: 800 }] },
  ], { params: { endY: 1900 } });
  lock('acquire', 'iphone', '--owner', 'me', '--url', 'http://192.168.0.2:5441/');
  const out = join(phone.dir, 'run.json');
  const r = await nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--label', 'e2e', '--out', out], { env: phone.env, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^GESTURE e2e v1 hash [0-9a-f]{12} .* on http:\/\/192\.168\.0\.2:5441\/$/m);
  assert.match(r.stdout, new RegExp(`^saved ${out.replace(/[./]/g, '\\$&')}$`, 'm'));
  const doc = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(doc.run.aborted, null);
  assert.deepEqual(doc.run.errors, []);
  assert.equal(doc.program.hash, compileScript(JSON.parse(readFileSync(f, 'utf8'))).hash);
  assert.equal(doc.meta.kind, 'gesture');
  // which tool version made the run (review-gesture 6): git HEAD, per-file hashes as run, recorder, WDA tag
  const t = doc.meta.tool;
  assert.match(t.gitHead, /^[0-9a-f]{40}$/);
  assert.equal(typeof t.dirty, 'boolean');
  assert.deepEqual(Object.keys(t.files), TOOL_FILES);
  for (const f of TOOL_FILES) assert.equal(t.files[f], sha16(readFileSync(join(REPO, f))), f);
  assert.equal(t.recorder, sha16(RECORDER_JS));
  assert.equal(t.compiler, COMPILER_VERSION);
  assert.equal(doc.meta.wda.ref, WDA_REF);
  // one page load (the script starts with a reload); every stroke ran in it
  assert.equal(doc.run.segments.length, 1);
  assert.equal(doc.run.reloads.length, 1);
  const seg = doc.run.segments[0];
  assert.ok(seg.frames.length > 50 && seg.frames.every((x) => x.length === 4), 'record-style frames');
  assert.deepEqual(seg.marks.map((m) => m[1]), ['go']);
  assert.ok(seg.sync.length >= 2 && seg.sync.every(([a, , b]) => b >= a));
  const n = doc.run.strokes.length;
  assert.ok(n >= 4, `strokes ${n}`);
  assert.ok(doc.run.strokes.every((s) => s.seg === 0 && s.returnedAt >= s.sentAt));
  // the fake WDA saw exactly those strokes, no bundleId, the idle settings, and never /source or elements
  const calls = phone.wda();
  assert.equal(actionsCalls(calls).length, n);
  assert.ok(!calls.some((c) => c.forbidden));
  assert.ok(!JSON.stringify(calls.find((c) => c.path === '/session').body).includes('bundleId'));
  assert.deepEqual(calls.find((c) => c.path.endsWith('/appium/settings')).body.settings, { waitForIdleTimeout: 0, animationCoolOffTimeout: 0, defaultActiveApplication: 'com.apple.mobilesafari' });
  assert.equal(calls.at(-1).method, 'DELETE');
  // touches: one sequence per stroke, the push at the end prevented by the page, momentum after the flings
  const sm = doc.summary;
  assert.equal(sm.segments[0].touchSequences, n);
  assert.equal(sm.segments[0].aligned, true);
  assert.ok(sm.touchmove.total > 50 && sm.touchmove.endPrevented > 10, JSON.stringify(sm.touchmove));
  // compiler v2 sends few long segments; the touches are sampled along them (XCTest, I-042), so there are more
  // touchmoves than pointerMoves sent
  const moves = actionsCalls(calls).reduce((k, c) => k + c.body.actions[0].actions.filter((x) => x.type === 'pointerMove' && x.duration).length, 0);
  assert.ok(sm.touchmove.total > moves, `touchmoves ${sm.touchmove.total} vs pointerMoves ${moves}`);
  assert.ok(sm.momentum.flings >= 2, JSON.stringify(sm.momentum));
  assert.ok(sm.momentum.tauMedianS > 0.3 && sm.momentum.tauMedianS < 0.7, `the fake decays with tau 0.45 s: ${sm.momentum.tauMedianS}`);
  const still = sm.segments[0].perStroke.find((p) => p.profile === 'still' && p.dir === 'down');
  assert.equal(still.tauS, null, 'no momentum after a still stroke');
  assert.ok(sm.toolbar.transitions >= 1);
  // pin fight split by touch phase (review-gesture 4): touch data present, a count per stroke (the fake clamps at maxY: no fight)
  assert.equal(sm.pin.touchData, true);
  assert.ok(sm.segments[0].perStroke.every((p) => Number.isInteger(p.pinTouching) && Number.isInteger(p.pinAfterLift)));
  assert.equal(sm.pin.fight, 0);
  // touches carry the event's own timeStamp (v2 recorder); the handler ran at or after it
  assert.ok(seg.touches.every((e) => e.length === 8 && typeof e[7] === 'number' && e[7] <= e[0]), 'timeStamp recorded');
  assert.ok(sm.segments[0].perStroke.every((p) => typeof p.endLagMs === 'number' && p.endLagMs >= 0));
  // motion metrics (de-unknowns-ux): per stroke window, per segment, pooled for the run; printed with the summary
  assert.ok(sm.motion.movingFrames > 50 && sm.motion.mwfiMs >= 8 && sm.motion.longestGapMs >= sm.motion.mwfiMs, JSON.stringify(sm.motion));
  assert.ok(Number.isInteger(sm.motion.stutterRuns) && sm.motion.stutterRunMaxMs !== null);
  assert.equal(sm.segments.reduce((a, g) => a + g.motion.movingFrames, 0), sm.motion.movingFrames);
  // the first fling scrolls to the end, the fling back up to the top; in between the page prevents every
  // touchmove at the end (--prevent-at-end), so those windows have no motion: counts 0, metrics null, not 0
  const ps = sm.segments[0].perStroke, show = JSON.stringify(ps.map((p) => [p.id, p.startY, p.movingFrames, p.mwfiMs]));
  assert.ok(ps[0].movingFrames > 10 && ps.at(-1).movingFrames > 10, show);
  for (const p of ps) {
    if (p.movingFrames > 0) assert.ok(p.mwfiMs > 0 && p.longestGapMs >= p.mwfiMs && Number.isInteger(p.stutterRuns) && p.stutterRunMaxMs !== null, show);
    else assert.deepEqual([p.mwfiMs, p.longestGapMs, p.stutterRuns, p.stutterRunMaxMs], [null, null, 0, null], show);
  }
  assert.equal(ps.reduce((a, p) => a + p.movingFrames, 0) <= sm.segments[0].motion.movingFrames, true, 'windows start at the first touch');
  // U6: touch to first scroll on a page at rest, and whether the first touchmove was cancelable (armed)
  assert.ok(sm.segments[0].perStroke.some((p) => typeof p.touchToScrollMs === 'number' && p.touchToScrollMs >= 0));
  assert.ok(sm.segments[0].perStroke.every((p) => p.firstMoveCancelable === null || p.firstMoveCancelable === 0 || p.firstMoveCancelable === 1));
  assert.match(r.stdout + r.stderr, /"motion": \{\s+"movingFrames": \d+/);
  // loops: the traverse ended at the end, the fling-to-top loop at the top
  assert.equal(doc.run.loops[0].until, 'atEnd');
  assert.equal(doc.run.loops.at(-1).until, 'atTop');
  assert.ok(['atTop', 'pull guard'].includes(doc.run.loops.at(-1).ended), JSON.stringify(doc.run.loops));
  // the recorder was installed through WIP (passive listeners) after the reload
  assert.ok(phone.wip().some((e) => e.reloaded));
});

test('gesture refuses when Safari is not in front: no stroke is sent', async () => {
  const phone = await fakePhone(['--foreground=com.apple.springboard']);
  lock('acquire', 'iphone', '--owner', 'me');
  const r = await nodeAsync(IPHONE, ['gesture', scriptFile([S({})]), '--owner', 'me'], { env: phone.env, timeout: 30000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /refusing: com\.apple\.springboard is in front, not Safari/);
  assert.equal(actionsCalls(phone.wda()).length, 0);
  assert.equal(phone.wda().at(-1).method, 'DELETE', 'the session is closed');
});

test('gesture: the WDA runner itself in front is named without its team id (review-gesture 2)', async () => {
  const phone = await fakePhone(['--foreground=fw.wda.abcde12345.WebDriverAgentRunner.xctrunner']);
  lock('acquire', 'iphone', '--owner', 'me');
  const r = await nodeAsync(IPHONE, ['gesture', scriptFile([S({})]), '--owner', 'me'], { env: phone.env, timeout: 30000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /refusing: <runner-bundle-id>\.xctrunner is in front, not Safari/);
  assert.doesNotMatch(r.out, /abcde12345/i);
  assert.equal(actionsCalls(phone.wda()).length, 0);
});

test('gesture: no WDA running is a clean error that says how to start it', async () => {
  lock('acquire', 'iphone', '--owner', 'me');
  const phone = await fakePhone();
  const r = await nodeAsync(IPHONE, ['gesture', scriptFile([S({})]), '--owner', 'me'], { env: { ...phone.env, FW_WDA_URL: env.FW_WDA_URL }, timeout: 30000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /ECONNREFUSED/);
  assert.match(r.stderr, /node tools\/iphone\.mjs wda start --owner me/);
});

test('runtime pull-to-refresh guard: a down stroke on a short page is refused before it is sent; partial data saved', async () => {
  const phone = await fakePhone(['--doc-height=1100']); // maxY 285-325: below the 450 px the down stroke needs
  const f = scriptFile([{ type: 'reload' }, S({}), { type: 'until', cond: 'atEnd', timeoutMs: 6000 }, S({ dir: 'down', px: 450, ms: 400, profile: 'still' })]);
  lock('acquire', 'iphone', '--owner', 'me');
  const out = join(phone.dir, 'guard.json');
  const r = await nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--out', out], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /aborted: error: pull-to-refresh guard: s2 \(down 450 px\) needs scrollY >= 450, the page is at \d+; nothing was sent/);
  assert.equal(actionsCalls(phone.wda()).length, 1);
  const doc = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(doc.run.strokes.length, 1);
  assert.ok(doc.run.segments[0].frames.length > 10, 'the recorder was read despite the abort');
});

test('pull guard: a down stroke waits for two still samples (momentum after a fling), then goes (review-gesture 5)', async () => {
  const phone = await fakePhone();
  const f = scriptFile([{ type: 'reload' }, S({}), S({ dir: 'down', px: 300, ms: 400, profile: 'still' })]);
  lock('acquire', 'iphone', '--owner', 'me');
  const out = join(phone.dir, 'still.json');
  const r = await nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--out', out], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  const [fling, down] = JSON.parse(readFileSync(out, 'utf8')).run.strokes;
  assert.equal(fling.guardY, null, 'an up stroke has no pull guard');
  assert.equal(down.guardY.length, 2);
  assert.ok(Math.abs(down.guardY[0] - down.guardY[1]) < 1 && down.guardY[0] >= 300, JSON.stringify(down));
  assert.ok(down.stillWaitMs >= 500, `it waited for the fling's momentum to end: ${down.stillWaitMs} ms`);
  assert.ok(down.sentAt - fling.returnedAt >= down.stillWaitMs);
});

test('pull guard: a page that never comes to rest is refused before the down stroke (review-gesture 5)', async () => {
  const phone = await fakePhone(['--doc-height=1800', '--jitter-at-end']); // maxY 985 collapsed
  const f = scriptFile([{ type: 'reload' }, S({}), { type: 'pause', ms: 300 }, S({}), { type: 'pause', ms: 300 }, S({ dir: 'down', px: 120, ms: 400, profile: 'still' })]);
  lock('acquire', 'iphone', '--owner', 'me');
  const out = join(phone.dir, 'jitter.json');
  const r = await nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--out', out], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /pull-to-refresh guard: s3 \(down 120 px\) the page did not come to rest in 5000 ms \(scrollY \d+ -> \d+\); nothing was sent/);
  assert.equal(actionsCalls(phone.wda()).length, 2);
  // the up push s2 at the end waited too; the page never rested, so it went flagged (review-gesture-2)
  assert.match(r.stderr, /warning: s2 \(up, at the end\) sent on a page still moving after 5000 ms \(scrollY \d+ -> \d+\): stillOk false/);
  const [s1, s2] = JSON.parse(readFileSync(out, 'utf8')).run.strokes;
  assert.equal(s1.stillOk, null, 's1 starts at the top: no wait');
  assert.equal(s2.stillOk, false);
  assert.ok(s2.stillWaitMs >= 5000);
});

test('an up push at the end starts on a still page: two still samples first (review-gesture-2)', async () => {
  const phone = await fakePhone(['--doc-height=1800']);
  const f = scriptFile([{ type: 'reload' }, S({}), { type: 'pause', ms: 300 }, S({ px: 200, ms: 400, profile: 'still' })]);
  lock('acquire', 'iphone', '--owner', 'me');
  const out = join(phone.dir, 'endpush.json');
  const r = await nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--out', out], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  const [fling, push] = JSON.parse(readFileSync(out, 'utf8')).run.strokes;
  assert.equal(fling.stillOk, null);
  assert.equal(push.stillOk, true, JSON.stringify(push));
  assert.ok(Math.abs(push.guardY[0] - push.guardY[1]) < 1);
  assert.ok(push.stillWaitMs >= 100 && push.sentAt - fling.returnedAt >= push.stillWaitMs, JSON.stringify(push));
  assert.doesNotMatch(r.stderr, /warning: s2/);
});

test('the page hidden mid-run (another app in front) stops before the next stroke (review-gesture 3)', async () => {
  const phone = await fakePhone(['--hide-after-strokes=1']);
  const f = scriptFile([{ type: 'reload' }, S({}), { type: 'pause', ms: 300 }, S({}), S({})]);
  lock('acquire', 'iphone', '--owner', 'me');
  const out = join(phone.dir, 'hidden.json');
  const r = await nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--out', out], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /aborted: the page is not visible \(document\.visibilityState "hidden": Safari is no longer in front, or another tab is\): stopped before s2, nothing was sent/);
  assert.equal(actionsCalls(phone.wda()).length, 1);
  const doc = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(doc.run.strokes.length, 1);
  assert.ok(doc.run.segments[0].frames.length > 5, 'the recorder was read despite the abort');
  assert.equal(phone.wda().at(-1).method, 'DELETE');
});

test('a landscape page (innerWidth != 430) is refused before the first stroke', async () => {
  const phone = await fakePhone(['--width=932']);
  lock('acquire', 'iphone', '--owner', 'me');
  const r = await nodeAsync(IPHONE, ['gesture', scriptFile([S({})]), '--owner', 'me', '--out', join(phone.dir, 'land.json')], { env: phone.env, timeout: 30000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /the page is 932 px wide, the script is for 430 \(portrait\): rotated\? stopped before s1, nothing was sent/);
  assert.equal(actionsCalls(phone.wda()).length, 0);
});

test('a lease lost mid-run stops before the next stroke', async () => {
  const phone = await fakePhone();
  const f = scriptFile([{ type: 'reload' }, { type: 'pause', ms: 6000 }, S({})]);
  lock('acquire', 'iphone', '--owner', 'me');
  const run = nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--out', join(phone.dir, 'lost.json')], { env: phone.env, timeout: 60000 });
  for (let i = 0; i < 100 && !phone.wip().some((e) => e.reloaded); i++) await sleep(100);
  await sleep(1000);
  lock('release', 'iphone', '--owner', 'me');
  const r = await run;
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /lost the iphone lease/);
  assert.equal(actionsCalls(phone.wda()).length, 0);
});

test('a lease too short for the run is refused up front', async () => {
  lock('acquire', 'iphone', '--owner', 'me', '--ttl', '20');
  const r = node(IPHONE, ['gesture', PROTOCOL, '--owner', 'me'], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /your iphone lease ends in \d+ s, the run needs ~\d+ s: node tools\/lock\.mjs renew iphone --owner me --ttl 900/);
});

test('a reconnect that fails saves its error without a LAN address or another tab\'s title (review-t1a N1)', async () => {
  const phone = await fakePhone(['--extra-tabs-after-reload']); // after the reload, two tabs on the mirror's host and a private one
  const f = scriptFile([{ type: 'reload' }, S({})]);
  lock('acquire', 'iphone', '--owner', 'me');
  const out = join(phone.dir, 'n1.json');
  const r = await nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--out', out], { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.equal(actionsCalls(phone.wda()).length, 0, 'no stroke after the failed reconnect');
  const saved = readFileSync(out, 'utf8');
  const doc = JSON.parse(saved);
  assert.match(doc.run.aborted, /^error: AMBIGUOUS: 2 tabs match "lan-host:5441" in app PID:4242 [^:]*: http:\/\/lan-host:5441\/ "start" \[PID:4242\], http:\/\/lan-host:5441\/copy\/ "second copy" \[PID:4242\] \(all targets: .*http:\/\/lan-host:8080\/private\/inbox \[PID:4242\]\)/);
  assert.doesNotMatch(saved, /192\.168\.|Private Inbox/, 'the saved record names no LAN address and no title of a non-candidate tab');
  assert.match(r.stderr, /gesture run aborted: error: AMBIGUOUS: 2 tabs match "lan-host:5441"/);
  assert.doesNotMatch(r.stderr, /Private Inbox/);
});

test('--morph-log: installed after each page load, read per segment, morph-active stats in the summary', async () => {
  const phone = await fakePhone();
  const mlog = join(phone.dir, 'morph-calls.jsonl');
  lock('acquire', 'iphone', '--owner', 'me');
  const out = join(phone.dir, 'm.json');
  const r = await nodeAsync(IPHONE, ['gesture', scriptFile([{ type: 'reload' }, S({}), { type: 'reload' }, S({})]), '--owner', 'me', '--label', 'ml', '--out', out, '--morph-log', join(FIX, 'fake-morph-log.mjs')],
    { env: { ...phone.env, FAKE_MORPH_LOG: mlog }, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  const calls = readFileSync(mlog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(calls.map((c) => [c[0], c.at(-1)]), [['install', 'me'], ['read', 'me'], ['install', 'me'], ['read', 'me']]);
  assert.ok(calls[1].includes('ml-seg0') && calls[3].includes('ml-seg1'));
  const doc = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(doc.run.morph.length, 2);
  assert.ok(existsSync(doc.run.morph[1].file));
  assert.deepEqual(doc.summary.morph, { frames: 6, p50: 30, p95: 60, gt50Pct: 33.3 });
  // the morph logger's code is part of the tool version (review-gesture-2)
  assert.deepEqual(doc.meta.tool.morphLog, { file: 'tests/fixtures/fake-morph-log.mjs', sha: sha16(readFileSync(join(FIX, 'fake-morph-log.mjs'))) });
  assert.match(r.out, /warning: --morph-log runs a separate process with its own inspector connection per segment.*prefer --inject/, 'I-038');
  assert.ok(!('inject' in doc.run), 'no --inject: no run.inject');
  assert.ok(!('reconnects' in doc.run), 'nothing closed the run\'s connection: no run.reconnects');
});

test('--morph-log survives morph-log\'s own connection taking the tab from the run\'s connection (one client per page, I-038)', async () => {
  const phone = await fakePhone(['--one-client-per-page']);
  lock('acquire', 'iphone', '--owner', 'me');
  const out = join(phone.dir, 'mp.json');
  const t0 = Date.now();
  const r = await nodeAsync(IPHONE, ['gesture', scriptFile([{ type: 'reload' }, S({}), { type: 'mark', name: 'mid' }, { type: 'reload' }, S({})]), '--owner', 'me', '--label', 'mp', '--out', out, '--morph-log', join(FIX, 'fake-morph-log.mjs')],
    { env: { ...phone.env, FAKE_MORPH_PEER: '1' }, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.ok(Date.now() - t0 < 30000, 'no command waited out its 15 s timeout on a dead connection');
  const wip = phone.wip();
  assert.ok(wip.filter((x) => x.pageTaken).length >= 4, 'each morph-log install and read took the tab');
  assert.equal(wip.filter((x) => x.stolenClose).length, 3, 'the run\'s next command after each, but the last read, was answered with a close');
  const doc = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(doc.run.errors, []);
  assert.equal(doc.run.aborted, null);
  assert.equal(actionsCalls(phone.wda()).length, 2);
  assert.deepEqual(doc.run.morph.map((m) => m.seg), [0, 1]);
  assert.ok(doc.run.segments.length === 2 && doc.run.segments.every((s) => s.frames.length > 5), 'the recorder data survives the reconnects');
  assert.deepEqual(doc.run.segments[0].marks.map((m) => m[1]), ['mid']);
  // one reconnect after each install (the segment's state poll) and after the first read (the reload); the last read is
  // followed by nothing that needs the page
  assert.deepEqual((doc.run.reconnects || []).map((x) => [x.code, x.during]), [[1001, 'state'], [1001, 'reload'], [1001, 'state']], r.out);
  assert.match(r.out, /inspector connection closed by the proxy \(code 1001\) before (state|reload): reconnecting \(I-038\)/);
  assert.doesNotMatch(r.out, /timed out/);
});

test('--inject (I-038): the logger runs on the run\'s own connection after each page load, read per segment; values and morph stats saved', async () => {
  const phone = await fakePhone();
  lock('acquire', 'iphone', '--owner', 'me');
  const out = join(phone.dir, 'inj.json');
  const r = await nodeAsync(IPHONE, ['gesture', scriptFile([{ type: 'reload' }, S({}), { type: 'reload' }, S({})]), '--owner', 'me', '--label', 'inj', '--out', out, '--inject', join(FIX, 'fake-inject.mjs')],
    { env: phone.env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /warning: --morph-log/);
  const doc = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(doc.run.errors, []);
  assert.deepEqual(doc.run.inject.map((x) => [x.seg, x.name, x.value.summary.seg, x.value.summary.label]), [[0, 'fake-mlog', 0, 'inj'], [1, 'fake-mlog', 1, 'inj']]);
  for (const x of doc.run.inject) assert.ok(x.value.frames.length > 5 && x.value.summary.frames === x.value.frames.length, JSON.stringify(x.value.summary));
  assert.deepEqual(doc.run.morph.map((m) => m.seg), [0, 1], 'morph: true feeds run.morph');
  assert.ok(doc.summary.morph && doc.summary.morph.frames > 0, JSON.stringify(doc.summary.morph));
  assert.ok(doc.run.segments.every((s) => s.frames.length > 5), 'the recorder still records');
  assert.equal(actionsCalls(phone.wda()).length, 2);
  // the logger's code is part of the tool version, like --morph-log's
  assert.deepEqual(doc.meta.tool.inject, { file: 'tests/fixtures/fake-inject.mjs', sha: sha16(readFileSync(join(FIX, 'fake-inject.mjs'))) });
});

test('--inject is refused with --morph-log, and a missing or malformed logger is refused, before WDA or the page are touched (I-038)', async () => {
  const phone = await fakePhone();
  lock('acquire', 'iphone', '--owner', 'me');
  const f = scriptFile([{ type: 'reload' }, S({})]);
  const run = (...extra) => nodeAsync(IPHONE, ['gesture', f, '--owner', 'me', '--out', join(phone.dir, 'x.json'), ...extra], { env: phone.env, timeout: 30000 });
  let r = await run('--inject', join(FIX, 'fake-inject.mjs'), '--morph-log', join(FIX, 'fake-morph-log.mjs'));
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /--inject and --morph-log both feed run\.morph: pass one/);
  r = await run('--inject', join(phone.dir, 'nope.mjs'));
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /--inject .*nope\.mjs: no such file/);
  const bad = join(phone.dir, 'bad.mjs');
  writeFileSync(bad, 'export const install = "1";\n');
  r = await run('--inject', bad);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /export read \(an expression string/);
  assert.deepEqual(phone.wda(), [], 'no WDA call');
  assert.ok(!existsSync(join(phone.dir, 'x.json')));
});

// ---- wda build | start | status | stop -------------------------------------------------------------------
// A detached helper (the fake iproxy) writes its log on its own schedule: poll for a non-empty file, bounded (I-055).
async function readWhenWritten(file, what, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try { const s = readFileSync(file, 'utf8'); if (s.trim()) return s; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (Date.now() > end) assert.fail(`${what} (${file}) was not written within ${timeoutMs} ms`);
    await sleep(50);
  }
}
function wdaEnv() {
  const home = tempDir('fw-wdahome-');
  for (const f of ['fake-xcodebuild.mjs', 'fake-iproxy.mjs', 'fake-ideviceinfo.mjs']) chmodSync(join(FIX, f), 0o755);
  const logs = tempDir('fw-wdalogs-');
  return { home, logs, env: { ...env, FW_WDA_HOME: home, FW_XCODEBUILD: join(FIX, 'fake-xcodebuild.mjs'), FW_IPROXY: join(FIX, 'fake-iproxy.mjs'), FW_IDEVICE_ID: '/usr/bin/false', FW_IDEVICEINFO: join(FIX, 'fake-ideviceinfo.mjs'), FW_SECURITY: '/usr/bin/false', FAKE_XCODEBUILD_LOG: join(logs, 'xb.jsonl'), FAKE_IPROXY_LOG: join(logs, 'ip.jsonl'), FAKE_WDA_LOG: join(logs, 'wda.jsonl') } };
}

/** The made-up account/device ids of the fakes: never in what the tools print (review-gesture 2, Hard rule 12). */
const IDS = [/ABCDE12345/i, /0011223344556677/, /Kitchen Phone/, /Test Person/, /example\.com/, /00AABBCCDDEEFF00/, /1A2B3C4D-1111/, /0123456789abcdef0123/];

/** `wda build` inside our own chrome-measure hold, the only way it runs (review-gesture 1). */
const heldBuild = (w, args, extra = {}) => node(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--max-seconds', '600', '--', process.execPath, IPHONE, 'wda', 'build', '--owner', 'me', ...args], { env: { ...w.env, ...extra }, timeout: 60000 });

test('wda build: lease; only inside our own chrome-measure hold (not on a free lock, not under someone\'s short job); sources outside the repo', () => {
  const w = wdaEnv();
  const wda = (...a) => node(IPHONE, ['wda', ...a], { env: w.env, timeout: 30000 });
  assert.match(wda('build').stderr, /--owner <topic> is required/);
  assert.match(wda('build', '--owner', 'me').stderr, /you \("me"\) don't hold the iphone lease/);
  lock('acquire', 'iphone', '--owner', 'me');
  let r = wda('status');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^sources: +missing; run: git clone --depth 1 --branch v[0-9.]+ https://github\\.com/appium/WebDriverAgent ${w.home}/WebDriverAgent$`, 'm'));
  assert.match(r.stdout, /^build: +none/m);
  assert.match(r.stdout, /^wda: +not reachable/m);
  const HOLD = /\n {2}node tools\/lock\.mjs run chrome-measure --owner me --no-timing --max-seconds 600 -- node tools\/iphone\.mjs wda build --owner me/;
  mkdirSync(join(w.home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), { recursive: true });
  const xbCalls = () => (existsSync(w.env.FAKE_XCODEBUILD_LOG) ? readFileSync(w.env.FAKE_XCODEBUILD_LOG, 'utf8').trim().split('\n').filter(Boolean).length : 0);
  // a free lock: a queued A/B would be granted it mid-build
  r = wda('build', '--owner', 'me', '--team', 'ABCDE12345', '--udid', '00008130-0011223344556677');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /refusing wda build: chrome-measure is free, but this process does not hold it/);
  assert.match(r.stderr, HOLD);
  // someone measuring
  lock('acquire', 'chrome-measure', '--owner', 'measurer', '--ttl', '300');
  r = wda('build', '--owner', 'me', '--team', 'ABCDE12345', '--udid', '00008130-0011223344556677');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /refusing wda build: chrome-measure is held by "measurer", not by this process/);
  lock('release', 'chrome-measure', '--owner', 'measurer');
  // someone's short-lane job (npm test): it ends within 300 s and the next A/B would start mid-build
  lock('acquire', 'chrome-measure', '--owner', 'npm-test', '--short', '--max-seconds', '120');
  r = wda('build', '--owner', 'me', '--team', 'ABCDE12345', '--udid', '00008130-0011223344556677');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /refusing wda build: chrome-measure is held by "npm-test" \(a short-lane job\), not by this process/);
  lock('release', 'chrome-measure', '--owner', 'npm-test');
  // our own short-lane hold: refused too (the short lane is for bounded jobs <= 300 s; lead's policy)
  r = node(LOCK, ['run', 'chrome-measure', '--owner', 'me', '--short', '--max-seconds', '120', '--', process.execPath, IPHONE, 'wda', 'build', '--owner', 'me', '--team', 'ABCDE12345', '--udid', '00008130-0011223344556677'], { env: w.env, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /refusing wda build: your chrome-measure hold is a short-lane job \(max 120 s\)/);
  assert.equal(xbCalls(), 0, 'xcodebuild never ran outside our hold');
  // inside our own hold (lock.mjs run): the remaining checks
  rmSync(join(w.home, 'WebDriverAgent'), { recursive: true });
  r = heldBuild(w, []);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /WebDriverAgent sources missing .* Fetch them once:\n {2}git clone --depth 1 --branch/s);
  mkdirSync(join(w.home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), { recursive: true });
  r = heldBuild(w, []);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no signing team .*Xcode > Settings > Accounts/s);
  r = heldBuild(w, ['--team', 'ABCDE12345']);
  assert.match(r.stderr, /no iPhone .*on USB/);
  r = heldBuild(w, ['--team', 'ABCDE12345', '--udid', '00008130-0011223344556677'], { FAKE_XCODEBUILD_FAIL: '1' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /xcodebuild build-for-testing failed \(exit 65\); last lines of .*build\.log:\n.*requires a development team/s);
  // review-gesture 2: the log tail is scrubbed (team, UDIDs, device names, runner bundle id, e-mail, identity name)...
  for (const s of IDS) assert.doesNotMatch(r.out, s, `${s} printed:\n${r.stderr}`);
  assert.match(r.stderr, /No Account for Team "<team>"/);
  assert.match(r.stderr, /name:<device>/);
  assert.match(r.stderr, /"<device-name>" is busy/);
  // ...while the local log outside the repo keeps the real values (read there, never printed)
  assert.match(readFileSync(join(w.home, 'build.log'), 'utf8'), /Kitchen Phone 7.*ABCDE12345/s);
  r = heldBuild(w, ['--team', 'ABCDE12345', '--udid', '00008130-0011223344556677']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /inside your chrome-measure hold \(stopped after 540 s\)/);
  assert.match(r.stdout, /^WDA_BUILT .*WebDriverAgentRunner_iphoneos26\.6-arm64\.xctestrun$/m);
  for (const s of IDS) assert.doesNotMatch(r.out, s, 'account and device ids are not printed in full');
  const args = JSON.parse(readFileSync(w.env.FAKE_XCODEBUILD_LOG, 'utf8').trim().split('\n').at(-1));
  for (const a of ['build-for-testing', '-allowProvisioningUpdates', 'DEVELOPMENT_TEAM=ABCDE12345', 'PRODUCT_BUNDLE_IDENTIFIER=fw.wda.abcde12345.WebDriverAgentRunner', 'id=00008130-0011223344556677', '-derivedDataPath']) assert.ok(args.includes(a), a);
  assert.ok(args[args.indexOf('-derivedDataPath') + 1].startsWith(w.home), 'DerivedData outside the repo');
  const cfg = JSON.parse(readFileSync(join(w.home, 'config.json'), 'utf8'));
  assert.deepEqual([cfg.team, cfg.udid, cfg.deviceName], ['ABCDE12345', '00008130-0011223344556677', 'Kitchen Phone 7'], 'the device name is kept locally, to scrub it');
  r = wda('status');
  assert.match(r.stdout, /^build: +ok \(WebDriverAgentRunner_iphoneos26\.6-arm64\.xctestrun\)/m);
  for (const s of IDS) assert.doesNotMatch(r.out, s);
});

test('wda build: SIGTERM to the hold stops xcodebuild\'s whole process group, nothing keeps building after the lock is released (review-gesture-2 B2)', async () => {
  const w = wdaEnv();
  mkdirSync(join(w.home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), { recursive: true });
  lock('acquire', 'iphone', '--owner', 'me');
  const pids = tempDir('fw-xbslow-');
  const p = await startProc(process.execPath, [LOCK, 'run', 'chrome-measure', '--owner', 'me', '--max-seconds', '600', '--', process.execPath, IPHONE, 'wda', 'build', '--owner', 'me', '--team', 'ABCDE12345', '--udid', '00008130-0011223344556677'],
    { env: { ...w.env, FAKE_XCODEBUILD_SLOW: pids }, ready: () => existsSync(join(pids, 'xb.pid')) && existsSync(join(pids, 'helper.pid')), timeout: 30000 });
  const xb = Number(readFileSync(join(pids, 'xb.pid'), 'utf8')), helper = Number(readFileSync(join(pids, 'helper.pid'), 'utf8'));
  assert.ok(pidAlive(xb) && pidAlive(helper), 'the slow build and its helper run');
  assert.match(lock('status').stdout, /chrome-measure +held by "me"/);
  // a plain `lock.mjs run` signals only its direct child (node iphone.mjs), then releases the lock and exits
  p.proc.kill('SIGTERM');
  await p.exited;
  // the build's group is gone with it: xcodebuild at once (SIGTERM), its SIGTERM-ignoring helper after the grace (SIGKILL)
  const t0 = Date.now();
  while ((pidAlive(xb) || pidAlive(helper)) && Date.now() - t0 < 8000) await sleep(50);
  assert.ok(!pidAlive(xb), `xcodebuild ${xb} still running after the hold ended`);
  assert.ok(!pidAlive(helper), `xcodebuild's helper ${helper} still running after the hold ended`);
  assert.doesNotMatch(lock('status').stdout, /chrome-measure +held by/);
  // the interrupted build says so (its stderr closes when the orphaned node iphone.mjs exits)
  const t1 = Date.now();
  while (!/interrupted by SIGTERM/.test(p.stderr()) && Date.now() - t1 < 8000) await sleep(50);
  assert.match(p.stderr(), /wda build interrupted by SIGTERM: xcodebuild \(its whole process group\) was stopped/);
  assert.ok(!existsSync(join(w.home, 'DerivedData', 'Build', 'Products')), 'no build products from a stopped build');
});

test('wda start: a runner that fails to launch is a clean error whose xcodebuild log tail carries no ids (review-gesture 2)', async () => {
  const w = wdaEnv();
  mkdirSync(join(w.home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), { recursive: true });
  lock('acquire', 'iphone', '--owner', 'me');
  assert.equal(heldBuild(w, ['--team', 'ABCDE12345', '--udid', '00008130-0011223344556677']).code, 0);
  const r = await nodeAsync(IPHONE, ['wda', 'start', '--owner', 'me', '--timeout', '20'], { env: { ...w.env, FAKE_XCODEBUILD_RUN_FAIL: '1' }, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /WDA did not come up at http:\/\/127\.0\.0\.1:\d+; last lines of .*runner\.log:\n.*TEST EXECUTE FAILED/s);
  assert.match(r.stderr, /No profiles for '<runner-bundle-id>\.xctrunner'/);
  for (const s of IDS) assert.doesNotMatch(r.out, s, `${s} printed:\n${r.stderr}`);
  assert.ok(!existsSync(join(env.FW_STATE_DIR, 'wda', 'runner.json')), 'the failed runner was cleaned up');
});

test('wda start (lease) runs the runner and iproxy, activates Safari; status sees them; stop kills only them', async () => {
  const w = wdaEnv();
  w.env.FAKE_IPROXY_DELAY_MS = '700'; // the fake runner is ready without iproxy, so its argv log may come late (I-055)
  mkdirSync(join(w.home, 'WebDriverAgent', 'WebDriverAgent.xcodeproj'), { recursive: true });
  lock('acquire', 'iphone', '--owner', 'me');
  assert.equal(heldBuild(w, ['--team', 'ABCDE12345', '--udid', '00008130-0011223344556677']).code, 0);
  let r = node(IPHONE, ['wda', 'start'], { env: w.env });
  assert.match(r.stderr, /--owner <topic> is required/);
  r = await nodeAsync(IPHONE, ['wda', 'start', '--owner', 'me', '--timeout', '30'], { env: w.env, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^WDA_READY http:\/\/127\.0\.0\.1:\d+ \(Safari in front\)$/m);
  const pids = ['runner', 'iproxy'].map((n) => JSON.parse(readFileSync(join(env.FW_STATE_DIR, 'wda', `${n}.json`), 'utf8')));
  assert.ok(pids.every((p) => pidAlive(p.pid) && p.owner === 'me'));
  assert.ok(!JSON.stringify(pids).includes('0011223344556677'), 'pidfiles do not store the device id');
  assert.deepEqual(JSON.parse((await readWhenWritten(w.env.FAKE_IPROXY_LOG, 'the fake iproxy argv log')).trim()), ['8100:8100', '-u', '00008130-0011223344556677']);
  const calls = readFileSync(w.env.FAKE_WDA_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(calls.some((c) => c.path.endsWith('/wda/apps/activate') && c.body.bundleId === 'com.apple.mobilesafari'));
  // again: already running is fine
  r = await nodeAsync(IPHONE, ['wda', 'start', '--owner', 'me'], { env: w.env, timeout: 30000 });
  assert.match(r.stdout, /already running/);
  r = await nodeAsync(IPHONE, ['wda', 'status'], { env: w.env, timeout: 30000 });
  assert.match(r.stdout, /^runner +running pid \d+ .*\(by me\)$/m);
  assert.match(r.stdout, /^wda: +ready=true build fake/m);
  r = await nodeAsync(IPHONE, ['wda', 'stop'], { env: w.env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /stopped runner \(pid \d+\)\nstopped iproxy \(pid \d+\)/);
  for (let i = 0; i < 50 && pids.some((p) => pidAlive(p.pid)); i++) await sleep(100);
  assert.ok(pids.every((p) => !pidAlive(p.pid)));
  assert.match((await nodeAsync(IPHONE, ['wda', 'stop'], { env: w.env })).stdout, /WDA was not running/);
});
