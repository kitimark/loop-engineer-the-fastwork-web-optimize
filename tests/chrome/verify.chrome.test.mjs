// OPT-IN (npm run test:chrome): real Chrome, short runs, through the REAL cross-worktree chrome-measure
// lock (so it queues behind agents' measurements instead of disturbing them). Fixture baseline only.
//   1. verify.mjs: one mobile run at CPU 2x against the fixture served like `fix.mjs ab` serves it
//      (--vendors=local --https, --root site-pretty); frames/LoAF fields present; lock held; SRI ok.
//   2. SIGTERM during a real run: lock released, the dedicated Chrome (its profile) is gone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, nodeAsync, tool, startServe, startProc, run, sleep, REPO } from '../helpers.mjs';
import { makeFixtureHome, VENDOR_KEY, PAGE_JS } from '../fixtures/baseline.mjs';

const OWNER = `test-chrome-${process.pid}`;
const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO }).stdout.trim();
const LOCKFILE = join(common, 'fastwork-mirror', 'locks', 'chrome-measure.json');
const holder = () => { try { return JSON.parse(readFileSync(LOCKFILE, 'utf8')); } catch { return null; } };
let fx, srv, d;
before(async () => {
  d = tempDir('fw-chrome-');
  fx = makeFixtureHome(join(d, 'home'));
  srv = await startServe(['--port', '0', '--quiet', '--root', 'site-pretty', '--vendors=local', '--https'], { env: { FW_MIRROR_HOME: fx.home } });
});
after(() => srv?.stop());

test('verify.mjs: one real mobile run at CPU 2x under the chrome-measure lock', async () => {
  const p = nodeAsync(tool('verify.mjs'), [`fx=${srv.url}`, '--runs', '1', '--viewport', 'mobile', '--cpu', '2', '--no-screens', '--out', join(d, 'out'), '--result', join(d, 'r.json'), '--profile', join(d, 'profile'), '--owner', OWNER], { timeout: 600000 });
  let seen = null, done = false;
  p.then(() => (done = true));
  while (!done) { const h = holder(); if (h?.owner === OWNER) seen = h; await sleep(200); }
  const r = await p;
  assert.equal(r.code, 0, r.out);
  assert.ok(seen, 'held the real chrome-measure lock while measuring');
  assert.equal(seen.kind, 'process');
  assert.equal(seen.meta.cpu, 2);
  assert.notEqual(holder()?.owner, OWNER, 'released afterwards');

  const res = JSON.parse(readFileSync(join(d, 'r.json'), 'utf8'));
  const x = res.results[0];
  assert.equal(x.viewport, 'mobile');
  assert.ok(x.scroll.y > 0, 'the page scrolled');
  assert.equal(x.state.nav, 'start-selling-top-nav');
  for (const ph of ['scrollSummary', 'morphSummary']) {
    const s = x[ph];
    assert.ok(s.frames > 10, `${ph}.frames ${s.frames}`);
    assert.ok(s.fps > 0);
    for (const k of ['p50', 'p95', 'max', 'gt20', 'gt34', 'gt50', 'gt100', 'loafCount', 'loafMs', 'loafScriptMs', 'forcedLayoutMs']) assert.equal(typeof s[k], 'number', `${ph}.${k}`);
    assert.equal(s.noLoaf, undefined, 'long-animation-frame observer available');
  }
  assert.ok(x.scripts.includes(PAGE_JS));
  assert.ok(x.scripts.includes('/__vendor/' + VENDOR_KEY), 'CF beacon rewritten to the local vendor copy');
  assert.deepEqual(x.notFound, []);
  assert.deepEqual(x.errors.filter((e) => /integrity|digest/i.test(e)), [], 'vendor script passed SRI (served from site/, not site-pretty/)');
  assert.deepEqual(Object.keys(x.origins).filter((o) => !/^https:\/\/localhost:\d+/.test(o) && !o.startsWith('data:')), [], 'no request left the machine');
});

test('verify.mjs: SIGTERM mid-run releases the lock and closes the dedicated Chrome', async () => {
  const profile = join(d, 'profile-kill');
  const v = await startProc(process.execPath, [tool('verify.mjs'), `fx=${srv.url}`, '--runs', '1', '--viewport', 'mobile', '--cpu', '2', '--no-screens', '--out', join(d, 'out2'), '--profile', profile, '--owner', OWNER + '-kill'], { ready: (s) => /\[mobile run 1\/1\]/.test(s), timeout: 600000 });
  const chromeUp = () => run('pgrep', ['-f', `user-data-dir=${profile}`]).stdout.trim();
  assert.ok(chromeUp(), 'Chrome is running with the dedicated profile');
  await v.stop('SIGTERM');
  let left = chromeUp();
  for (let i = 0; i < 60 && left; i++) { await sleep(100); left = chromeUp(); }
  if (left) run('pkill', ['-f', `user-data-dir=${profile}`]);
  assert.equal(left, '', 'Chrome must not outlive verify.mjs');
  assert.notEqual(holder()?.owner, OWNER + '-kill');
  assert.equal(existsSync(join(d, 'r2.json')), false);
});
