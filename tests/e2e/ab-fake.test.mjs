// tools/fix.mjs ab end to end with the fake Chrome ($CHROME), in a temp repo + worktree: starts the two
// servers (calibrated defaults: --vendors=local --https --latency 150), checks the served overlay,
// runs verify.mjs under the lock, and writes results.json (A/B) / results-aa.json (A/A). Also: SIGTERM
// on `ab` must not leave servers, verify.mjs or the browser running, nor the lock held.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, nodeAsync, startProc, tempDir, TESTS, SLOW_EXIT, signalTwiceDuringExit, sleep, sha256 } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';

const FAKE = join(TESTS, 'fixtures', 'fake-chrome.mjs');
let repo, fx;
const fix = (args, env = {}) => node(join(repo.wt, 'tools', 'fix.mjs'), args, { cwd: repo.wt, env });
const readLog = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

before(() => {
  repo = makeTempRepo({ worktree: 'ab-wt' });
  fx = makeFixtureHome(repo.main);
  assert.equal(fix(['new', 'fast-nav']).code, 0);
  assert.equal(fix(['edit', 'fast-nav', PAGE_JS]).code, 0);
  const f = join(repo.wt, 'fixes', 'fast-nav', 'overlay', PAGE_JS.slice(1));
  writeFileSync(f, readFileSync(f, 'utf8').replace('requestAnimationFrame(tick);\n}', 'if (scrollY < 4000) requestAnimationFrame(tick);\n}'));
});

test('ab --runs 1 (A/B) and ab --aa (A/A) produce complete results files', async () => {
  // Both runs share one lock dir, as in real use: they serialize through chrome-measure (they also share
  // the checkout's Chrome profile dir, so running them unserialized would make them fight over one browser).
  const envB = { CHROME: FAKE, FW_STATE_DIR: join(repo.root, 'state'), FAKE_CHROME_LOG: join(repo.root, 'ab.jsonl') };
  const envA = { CHROME: FAKE, FW_STATE_DIR: join(repo.root, 'state'), FAKE_CHROME_LOG: join(repo.root, 'aa.jsonl') };
  const [ab, aa] = await Promise.all([
    nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['ab', 'fast-nav', '--runs', '1', '--idle', '1', '--no-screens'], { cwd: repo.wt, env: envB }),
    nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['ab', '--aa', '--runs', '1', '--idle', '0', '--no-screens'], { cwd: repo.wt, env: envA }),
  ]);
  assert.equal(ab.code, 0, ab.out);
  assert.equal(aa.code, 0, aa.out);
  assert.match(ab.stdout, /served-file check OK: 1 overlay file\(s\) differ from baseline and come from the overlay/);

  const res = JSON.parse(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'results.json'), 'utf8'));
  assert.equal(res.topic, 'fast-nav');
  assert.equal(res.kind, 'A/B');
  assert.equal(res.git.branch, 'wt/ab-wt');
  assert.deepEqual(res.config, { cpu: 6, viewport: 'mobile', runs: 1, idle: 1, serveArgs: ['--vendors=local', '--https', '--latency', '150'], baseline: 'site-pretty', stackedOn: null, order: 'ABBA (alternating per run)' });
  assert.equal(res.patch.file, 'fixes/fast-nav/patch.diff');
  assert.equal(res.patch.sha256, sha256(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'patch.diff'))));
  assert.deepEqual([res.patch.files, res.patch.added, res.patch.removed], [1, 1, 1]);
  assert.equal(res.servedCheck.length, 1);
  const sc = res.servedCheck[0];
  assert.equal(sc.path, '/' + PAGE_JS.slice(1));
  assert.equal(sc.baseline.source, 'base');
  assert.equal(sc.patched.source, 'overlay');
  assert.equal(sc.patched.sha256, sc.overlaySha256);
  assert.equal(sc.baseline.sha256, sha256(fx.prettyFiles[PAGE_JS]));
  assert.deepEqual(Object.keys(res.metrics.scroll), ['fps', 'gt20', 'gt34', 'gt50', 'gt100', 'max', 'p95', 'loafMs', 'loafScriptMs', 'forcedLayoutMs']);
  assert.deepEqual(Object.keys(res.metrics.morph), ['fps', 'gt50', 'loafMs', 'forcedLayoutMs']);
  // idle phase (--idle 1): the same metrics as the scroll phase, from the fake's no-input recording
  assert.deepEqual(Object.keys(res.metrics), ['scroll', 'morph', 'idle']);
  assert.deepEqual(Object.keys(res.metrics.idle), Object.keys(res.metrics.scroll));
  const ifps = res.metrics.idle.fps;
  assert.equal(ifps.name, 'fps');
  assert.equal(ifps.higherIsBetter, true);
  assert.deepEqual(ifps.baseline, { median: 58.1, min: 58.1, max: 58.1, runs: [58.1] });
  assert.deepEqual(ifps.patched, { median: 58.1, min: 58.1, max: 58.1, runs: [58.1] });
  assert.deepEqual([ifps.delta, ifps.deltaPct, ifps.pairedDeltas, ifps.verdict], [0, 0, [0], 'n=1 (need >=3 runs for a verdict)']);
  assert.deepEqual(Object.fromEntries(Object.entries(res.metrics.idle).map(([k, v]) => [k, v.baseline.median])),
    { fps: 58.1, gt20: 2, gt34: 1, gt50: 1, gt100: 0, max: 55, p95: 16.7, loafMs: 55, loafScriptMs: 40, forcedLayoutMs: 6 });
  assert.match(res.markdown, /^\| idle: fps \| 58\.1 \[58\.1-58\.1\] \| 58\.1 \[58\.1-58\.1\] \| 0 \(0%\) \| n=1/m);
  assert.match(res.markdown, /^\| idle: forced style\+layout ms \(in LoAF\) \| 6 \[6-6\] \| 6 \[6-6\] \| 0 \(0%\) \| n=1/m);
  assert.equal(JSON.parse(readFileSync(join(repo.wt, res.raw), 'utf8')).idle, 1, 'ab passes --idle to verify.mjs');
  const fps = res.metrics.scroll.fps;
  assert.deepEqual(fps.baseline, { median: 50, min: 50, max: 50, runs: [50] });
  assert.deepEqual(fps.patched, { median: 50, min: 50, max: 50, runs: [50] });
  assert.equal(fps.delta, 0);
  assert.deepEqual(fps.pairedDeltas, [0]);
  assert.equal(fps.verdict, 'n=1 (need >=3 runs for a verdict)');
  assert.equal(res.metrics.scroll.forcedLayoutMs.baseline.median, 25);
  assert.deepEqual(res.regressions.newErrors, []);
  assert.deepEqual(res.regressions.new404s, []);
  assert.deepEqual(res.regressions.morphReached, { baseline: [true], patched: [true] });
  assert.match(res.markdown, /^\| mobile 6x, n=1 \| baseline median \[min-max\] \| patched median \[min-max\] \| delta \| verdict \|$/m);
  assert.match(res.markdown, /^\| scroll: fps \| 50 \[50-50\] \| 50 \[50-50\] \| 0 \(0%\) \| n=1/m);
  assert.ok(existsSync(join(repo.wt, res.raw)), 'raw verify.json kept under out/ab/');
  assert.equal(typeof res.host.loadavg1Min, 'number');

  // the two servers really were baseline vs baseline+overlay over https (ABBA with 1 run: base then fix)
  const nav = readLog(envB.FAKE_CHROME_LOG).filter((l) => l.method === 'Page.navigate').map((l) => l.params.url);
  assert.equal(nav.length, 2);
  for (const u of nav) assert.match(u, /^https:\/\/localhost:\d+\/$/);
  assert.notEqual(nav[0], nav[1]);
  assert.deepEqual(readLog(envB.FAKE_CHROME_LOG).filter((l) => l.method === 'Emulation.setCPUThrottlingRate').map((l) => l.params.rate), [6, 1, 6, 1]);

  const aaDirs = readdirSync(join(repo.wt, 'out', 'ab', '_aa'));
  assert.equal(aaDirs.length, 1);
  const aaRes = JSON.parse(readFileSync(join(repo.wt, 'out', 'ab', '_aa', aaDirs[0], 'results-aa.json'), 'utf8'));
  assert.equal(aaRes.kind, 'A/A noise floor');
  assert.equal(aaRes.patch, null);
  assert.deepEqual(aaRes.servedCheck, []);
  assert.equal(aaRes.metrics.scroll.fps.delta, 0);
  // --idle 0: no idle phase measured, none reported
  assert.equal(aaRes.config.idle, 0);
  assert.deepEqual(Object.keys(aaRes.metrics), ['scroll', 'morph']);
  assert.doesNotMatch(aaRes.markdown, /\| idle:/);
  assert.equal(aaRes.metrics.scroll.fps.baseline.median, 50);
  // no lock left behind
  assert.equal(existsSync(join(repo.root, 'state', 'locks', 'chrome-measure.json')), false);
});

test('SIGTERM on ab: no server, verify.mjs or browser left running, lock released', async () => {
  const env = { CHROME: FAKE, FW_STATE_DIR: join(repo.root, 'state-kill'), FAKE_CHROME_LOG: join(repo.root, 'kill.jsonl') };
  const p = await startProc(process.execPath, [join(repo.wt, 'tools', 'fix.mjs'), 'ab', 'fast-nav', '--runs', '1', '--no-screens'], { cwd: repo.wt, env, ready: (s) => /\[mobile run 1\/1\]/.test(s), timeout: 30000 });
  const chromePid = readLog(env.FAKE_CHROME_LOG).find((l) => l.method === '(started)').pid;
  const lockFile = join(env.FW_STATE_DIR, 'locks', 'chrome-measure.json');
  const verifyPid = JSON.parse(readFileSync(lockFile, 'utf8')).pid;
  const stamp = readdirSync(join(repo.wt, 'out', 'ab', 'fast-nav')).sort().pop();
  const serverPids = ['serve-base.json', 'serve-fix.json'].map((f) => JSON.parse(readFileSync(join(repo.wt, 'out', 'ab', 'fast-nav', stamp, f), 'utf8')).pid);
  await p.stop('SIGTERM');
  const pids = { verify: verifyPid, chrome: chromePid, base: serverPids[0], fix: serverPids[1] };
  const left = () => Object.entries(pids).filter(([, pid]) => alive(pid)).map(([k]) => k);
  for (let i = 0; i < 60 && left().length; i++) await sleep(50);
  const survivors = left();
  for (const pid of Object.values(pids)) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  assert.deepEqual(survivors, [], `still running after SIGTERM: ${survivors.join(', ')}`);
  assert.equal(existsSync(lockFile), false, 'lock released');
});

test('two SIGTERMs on ab, the second during its exit: ab still exits via its handler and leaves nothing running (incident I-009)', async () => {
  const env = { CHROME: FAKE, FW_STATE_DIR: join(repo.root, 'state-kill2'), FAKE_CHROME_LOG: join(repo.root, 'kill2.jsonl'), SLOW_EXIT_DIR: tempDir('fw-2sig-') };
  const p = await startProc(process.execPath, ['--import', SLOW_EXIT, join(repo.wt, 'tools', 'fix.mjs'), 'ab', 'fast-nav', '--runs', '1', '--no-screens'], { cwd: repo.wt, env, ready: (s) => /\[mobile run 1\/1\]/.test(s), timeout: 30000 });
  const chromePid = readLog(env.FAKE_CHROME_LOG).find((l) => l.method === '(started)').pid;
  const lockFile = join(env.FW_STATE_DIR, 'locks', 'chrome-measure.json');
  const verifyPid = JSON.parse(readFileSync(lockFile, 'utf8')).pid;
  const stamp = readdirSync(join(repo.wt, 'out', 'ab', 'fast-nav')).sort().pop();
  const serverPids = ['serve-base.json', 'serve-fix.json'].map((f) => JSON.parse(readFileSync(join(repo.wt, 'out', 'ab', 'fast-nav', stamp, f), 'utf8')).pid);
  assert.deepEqual(await signalTwiceDuringExit(p.proc, env.SLOW_EXIT_DIR), { code: 130, signal: null }, 'fix.mjs exited via its handler, not killed by the second SIGTERM');
  const pids = { verify: verifyPid, chrome: chromePid, base: serverPids[0], fix: serverPids[1] };
  const left = () => Object.entries(pids).filter(([, pid]) => alive(pid)).map(([k]) => k);
  for (let i = 0; i < 60 && left().length; i++) await sleep(50);
  const survivors = left();
  for (const pid of Object.values(pids)) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  assert.deepEqual(survivors, [], `still running after SIGTERM: ${survivors.join(', ')}`);
  assert.equal(existsSync(lockFile), false, 'lock released');
});
