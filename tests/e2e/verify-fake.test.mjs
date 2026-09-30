// tools/verify.mjs end to end against the fake Chrome ($CHROME): argument handling, the result JSON
// shape and its frame/LoAF summaries (exact values from the fake's canned data), the emulation it
// asks for, and the chrome-measure lock (held during the run, FIFO wait, released after, --no-lock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, TESTS, sleep, startProc } from '../helpers.mjs';

const FAKE = join(TESTS, 'fixtures', 'fake-chrome.mjs');
const VERIFY = tool('verify.mjs');
const LOCK = tool('lock.mjs');
const readLog = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const holder = (state) => { try { return JSON.parse(readFileSync(join(state, 'locks', 'chrome-measure.json'), 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function setup() {
  const d = tempDir('fw-verify-');
  const env = { CHROME: FAKE, FW_STATE_DIR: join(d, 'state'), FAKE_CHROME_LOG: join(d, 'chrome.jsonl') };
  const args = (owner, extra = []) => ['a=http://127.0.0.1:9/', '--runs', '1', '--viewport', 'mobile', '--cpu', '3', '--no-screens', '--out', join(d, 'out'), '--result', join(d, 'result.json'), '--profile', join(d, 'profile'), '--owner', owner, ...extra];
  return { d, env, args };
}

test('usage error without targets: exit 2 before any lock or browser', () => {
  const { d, env } = setup();
  const r = node(VERIFY, ['--runs', '1'], { env });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /^usage: node tools\/verify\.mjs/);
  assert.equal(existsSync(join(d, 'state')), false);
  assert.equal(readLog(env.FAKE_CHROME_LOG).length, 0);
});

test('one mobile run: result JSON shape + exact summaries, emulation settings, lock held then released', async () => {
  const A = setup(), B = setup();
  // A takes the lock; B runs at the same time with --no-lock and must never touch lock state
  const pa = nodeAsync(VERIFY, A.args('vtest'), { env: A.env });
  const pb = nodeAsync(VERIFY, B.args('nolock', ['--no-lock']), { env: B.env });
  let seen = null;
  for (let i = 0; i < 200 && !seen; i++) { seen = holder(A.env.FW_STATE_DIR); await sleep(50); }
  const [ra, rb] = await Promise.all([pa, pb]);
  assert.equal(ra.code, 0, ra.out);
  assert.equal(rb.code, 0, rb.out);

  assert.ok(seen, 'chrome-measure was held during the run');
  assert.equal(seen.owner, 'vtest');
  assert.equal(seen.kind, 'process');
  assert.deepEqual(seen.meta, { cmd: 'verify', targets: ['a=http://127.0.0.1:9/'], cpu: 3, runs: 1, viewport: 'mobile' });
  assert.equal(holder(A.env.FW_STATE_DIR), null, 'released on exit');
  assert.equal(existsSync(join(B.d, 'state')), false, '--no-lock never touches the lock dir');

  const res = JSON.parse(readFileSync(join(A.d, 'result.json'), 'utf8'));
  assert.equal(res.cpu, 3);
  assert.deepEqual(res.viewports, ['mobile']);
  assert.equal(res.runs, 1);
  assert.deepEqual(res.targets, [{ label: 'a', url: 'http://127.0.0.1:9/' }]);
  assert.deepEqual(Object.keys(res.host).sort(), ['cpus', 'loadavg', 'model']);
  assert.equal(res.results.length, 1);
  const r = res.results[0];
  assert.deepEqual(Object.keys(r).sort(), ['errors', 'label', 'loadavg1', 'morphState', 'morphSummary', 'notFound', 'origins', 'requests', 'run', 'scripts', 'scroll', 'scrollSummary', 'shimStats', 'shots', 'state', 'url', 'viewport'].sort());
  assert.equal(r.viewport, 'mobile');
  assert.equal(r.run, 0);
  assert.equal(r.morphState, 'start-selling-top-nav is-morph');
  assert.deepEqual(r.scroll, { ms: 5000, ticks: 16, y: 2068, h: 3000 });
  assert.deepEqual(r.shots, {});
  assert.deepEqual(r.scripts, ['/_app/immutable/nodes/2.fixture.js']);
  assert.deepEqual(r.notFound, []);
  // FRAMES = 50 x 16.7 ms + [25, 40, 60, 120]; one LoAF of 120 ms (script 80 ms, forced layout 25 ms)
  const s = r.scrollSummary;
  assert.deepEqual({ frames: s.frames, seconds: s.seconds, fps: s.fps, p50: s.p50, p95: s.p95, max: s.max, gt20: s.gt20, gt33: s.gt33, gt34: s.gt34, gt50: s.gt50, gt100: s.gt100, droppedPct: s.droppedPct },
    { frames: 54, seconds: 1.1, fps: 50, p50: 16.7, p95: 40, max: 120, gt20: 4, gt33: 3, gt34: 3, gt50: 2, gt100: 1, droppedPct: 7.4 });
  assert.deepEqual({ n: s.loafCount, ms: s.loafMs, block: s.loafBlockingMs, render: s.loafRenderMs, script: s.loafScriptMs, forced: s.forcedLayoutMs }, { n: 1, ms: 120, block: 70, render: 30, script: 80, forced: 25 });
  assert.equal(s.topScripts[0].key, '/_app/immutable/nodes/2.fixture.js:10 tick [user-callback FrameRequestCallback]');
  assert.deepEqual(s.byFile, { '/_app/immutable/nodes/2.fixture.js': 80 });
  assert.deepEqual(r.morphSummary.frames, 54);
  assert.deepEqual(res.rows[0], { viewport: 'mobile', target: 'a', runs: 1, fps: 50, p95: 40, gt20: 4, gt34: 3, gt50: 2, gt100: 1, max: 120, loafMs: 120, loafScriptMs: 80, forcedMs: 25, morphFps: 50, morphGt50: 2, morphLoafMs: 120, scrollS: 5 });
  assert.match(ra.stdout, /\[mobile run 1\/1\] a http:\/\/127\.0\.0\.1:9\/ \.\.\. fps 50/);

  const log = readLog(A.env.FAKE_CHROME_LOG);
  const cmd = (m) => log.filter((l) => l.method === m).map((l) => l.params);
  assert.deepEqual(cmd('Emulation.setCPUThrottlingRate'), [{ rate: 3 }, { rate: 1 }]);
  assert.deepEqual(cmd('Emulation.setDeviceMetricsOverride'), [{ width: 430, height: 932, deviceScaleFactor: 3, mobile: true }]);
  assert.deepEqual(cmd('Emulation.setTouchEmulationEnabled'), [{ enabled: true, maxTouchPoints: 5 }]);
  assert.deepEqual(cmd('Security.setIgnoreCertificateErrors'), [{ ignore: true }]);
  assert.equal(cmd('Input.synthesizeScrollGesture').length, 4, 'mobile morph phase uses touch gestures');
  assert.equal(cmd('Page.captureScreenshot').length, 0, '--no-screens');
  assert.match(cmd('Page.addScriptToEvaluateOnNewDocument')[0].source, /long-animation-frame/);
  assert.equal(log.find((l) => l.method === '(started)').params.profile, join(A.d, 'profile'));
  assert.ok(log.some((l) => l.method === '(exit)'), 'Chrome was closed');
});

test('waits in the chrome-measure FIFO queue while someone else measures', async () => {
  const { d, env, args } = setup();
  assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--owner', 'other-agent'], { env }).code, 0);
  const p = nodeAsync(VERIFY, args('waiter'), { env });
  await sleep(1500);
  assert.equal(readLog(env.FAKE_CHROME_LOG).length, 0, 'Chrome must not start while the lock is held');
  const st = JSON.parse(node(LOCK, ['status', 'chrome-measure', '--json'], { env }).stdout)[0];
  assert.deepEqual(st.queue.map((w) => w.owner), ['waiter']);
  assert.equal(node(LOCK, ['release', 'chrome-measure', '--owner', 'other-agent'], { env }).code, 0);
  const r = await p;
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(d, 'result.json')));
});

test('SIGTERM mid-run: lock released and the browser does not outlive verify.mjs', async () => {
  const { env, args } = setup();
  const v = await startProc(process.execPath, [VERIFY, ...args('killed')], { env, ready: (s) => /\[mobile run 1\/1\]/.test(s) });
  const chromePid = readLog(env.FAKE_CHROME_LOG).find((l) => l.method === '(started)').pid;
  assert.ok(alive(chromePid));
  assert.equal(holder(env.FW_STATE_DIR).owner, 'killed');
  await v.stop('SIGTERM');
  assert.equal(holder(env.FW_STATE_DIR), null);
  let gone = false;
  for (let i = 0; i < 60 && !(gone = !alive(chromePid)); i++) await sleep(50);
  if (!gone) process.kill(chromePid, 'SIGKILL');
  assert.ok(gone, 'Chrome was left running (and would keep the profile dir locked for the next run)');
});
