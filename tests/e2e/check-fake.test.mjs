// tools/check.mjs end to end against the fake Chrome in check mode (FAKE_CHROME_CHECK=1: each target's server
// answers /check-fake.json, which the fake plays into the page as exceptions, Log errors, 404s and the nav class):
// a headless launch with the pinned --screen-info, the UA override before every navigation, no CPU throttling,
// failures detected, a functional-only result (no timing field), the shared/short lane and re-entry of an outer
// hold, one temp profile per job (removed), the --max-seconds self-stop (ts-headless, research/architecture/headless-functional.md).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, nodeAsync, TESTS } from '../helpers.mjs';
import * as lockLib from '../../tools/lib/lock.mjs';

const FAKE = join(TESTS, 'fixtures', 'fake-chrome.mjs');
const readLog = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const holder = (state) => { try { return JSON.parse(readFileSync(join(state, 'locks', 'chrome-measure.json'), 'utf8')); } catch { return null; } };

let repo, servers = [], ok, bad;
function serveJson(data) {
  return new Promise((res) => {
    const s = http.createServer((req, r) => {
      if (req.url === '/check-fake.json') { r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify(data)); }
      r.end('<!doctype html>');
    });
    s.listen(0, '127.0.0.1', () => { servers.push(s); res(`http://127.0.0.1:${s.address().port}/`); });
  });
}
before(async () => {
  repo = makeTempRepo({ worktree: null });
  ok = await serveJson({});
  bad = await serveJson({ errors: ['TypeError: x is not a function'], logErrors: ['Failed to load resource: 404'], notFound: ['/_app/immutable/chunks/missing.js'], nav: 'start-selling-top-nav' });
});
after(() => { for (const s of servers) s.close(); });

let n = 0;
function setup(name, extra = {}) {
  const d = join(repo.root, `${name}-${++n}`);
  // FW_MIRROR_HOME: the targets serve no baseline; keep the snapshot check off this checkout's real one
  const env = { CHROME: FAKE, FAKE_CHROME_CHECK: '1', FW_CHECK_TEST_FAST: '1', FW_STATE_DIR: join(d, 'state'), FAKE_CHROME_LOG: join(d, 'chrome.jsonl'), FW_MIRROR_HOME: d, ...extra };
  const args = (...a) => [...a, '--out', join(d, 'out'), '--result', join(d, 'check.json'), '--owner', name];
  const result = () => JSON.parse(readFileSync(join(d, 'check.json'), 'utf8'));
  return { d, env, args, result, log: () => readLog(env.FAKE_CHROME_LOG) };
}
const CHECK = () => join(repo.main, 'tools', 'check.mjs');
const run = (s, ...a) => nodeAsync(CHECK(), s.args(...a), { cwd: repo.main, env: s.env, timeout: 60000 });

test('usage: no target, a timing option, a bad budget or DPR: exit 2 before any lock or browser', () => {
  for (const [a, re] of [[[], /^usage: node tools\/check\.mjs/], [['a=http://127.0.0.1:9/', '--cpu', '6'], /functional only: --cpu is a timing option/],
    [['a=http://127.0.0.1:9/', '--max-seconds', '900'], /--max-seconds must be an integer 10-300/], [['a=http://127.0.0.1:9/', '--screen-dpr', '0'], /--screen-dpr/],
    [['a=http://127.0.0.1:9/', 'a=http://127.0.0.1:8/'], /labels must be unique/]]) {
    const s = setup('usage');
    const r = node(CHECK(), a, { cwd: repo.main, env: s.env });
    assert.equal(r.code, 2, `${a.join(' ')}: ${r.out}`);
    assert.match(r.stderr, re);
    assert.equal(existsSync(join(s.d, 'state')), false, 'never queued');
    assert.equal(s.log().length, 0, 'no browser');
  }
});

test('two targets, mobile: headless + pinned screen, UA override before each navigation, no throttling; errors and 404s fail the check', async () => {
  const s = setup('two');
  const r = await run(s, `ok=${ok}`, `bad=${bad}`);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /CHECK FAIL \(1\)/);
  const log = s.log();
  const started = log.find((l) => l.method === '(started)');
  assert.ok(started.params.argv.includes('--headless=new'), started.params.argv.join(' '));
  assert.ok(started.params.argv.includes('--screen-info={0,0 3024x1964 devicePixelRatio=2}'));
  assert.equal(log.filter((l) => l.method === 'Emulation.setCPUThrottlingRate').length, 0, 'functional: never throttled');
  // every navigation of a page session comes after that session's UA override, which names Chrome/, not HeadlessChrome/
  const navs = log.filter((l) => l.method === 'Page.navigate');
  assert.equal(navs.length, 4, 'two targets x (check load + screenshot load)');
  for (const nav of navs) {
    const i = log.indexOf(nav);
    const ua = log.slice(0, i).find((l) => l.method === 'Emulation.setUserAgentOverride' && l.sessionId === nav.sessionId);
    assert.ok(ua, `UA override before ${nav.params.url}`);
    assert.match(ua.params.userAgent, /\bChrome\/1\.0\.0\.0/);
    assert.doesNotMatch(ua.params.userAgent, /Headless/);
  }
  const res = s.result();
  assert.equal(res.kind, 'functional');
  assert.equal(res.chromeMode, 'headless');
  assert.equal(res.timing, 'test-fast');
  assert.doesNotMatch(res.uaOverride, /Headless/);
  assert.deepEqual(res.screenInfo, { width: 1512, height: 982, dpr: 2, arg: '--screen-info={0,0 3024x1964 devicePixelRatio=2}' });
  // the shared lane where lib/lock.mjs has it and its switch is on (ts-lock-share), else the short lane
  assert.match(res.lock.mode, lockLib.SHARED_LANE ? /^(shared|short)$/ : /^short$/);
  assert.equal(res.lock.maxSec, 300);
  assert.deepEqual(res.baselineSnapshot.state, 'override');
  const [a, b] = res.results;
  assert.deepEqual([a.label, a.viewport, b.label], ['ok', 'mobile', 'bad']);
  assert.deepEqual(a.failures, []);
  assert.equal(a.morphReached, true);
  assert.deepEqual([a.preEmulation.dpr, a.preEmulation.screen], [2, [1512, 982]]);
  assert.match(a.preEmulation.ua, /HeadlessChrome\//, 'read before the override');
  assert.equal(a.dom.elements, 42);
  assert.equal(a.walk.y, a.walk.maxY);
  assert.deepEqual(Object.keys(a.shots), ['top', 'middle', 'bottom']);
  for (const f of Object.values(a.shots)) assert.ok(existsSync(join(repo.main, f)), f);
  assert.equal(b.morphReached, false, 'the nav class came back without is-morph');
  assert.deepEqual(b.notFound, ['404 /_app/immutable/chunks/missing.js']);
  assert.ok(b.errors.includes('exception: TypeError: x is not a function'), b.errors.join(' | '));
  assert.ok(b.errors.some((e) => /^network: Failed to load resource: 404/.test(e)));
  assert.deepEqual(res.failures, ['mobile bad: 2 console error(s)']);
  assert.deepEqual(res.diffs.map((x) => [x.b, x.shot, x.diffPct, x.withinMode]), [['bad', 'top', 0.12, 'headless'], ['bad', 'middle', 0.12, 'headless'], ['bad', 'bottom', 0.12, 'headless']]);
  // functional only: no frame / fps / LoAF / jank / duration field anywhere (job.seconds is the tool's own run time)
  const keys = [];
  const walk = (v, p) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.push(`${p}.${k}`); walk(x, `${p}.${k}`); } };
  walk(res, '');
  const timing = keys.filter((k) => /\.(frames?|fps\w*|loaf\w*|p\d\d|median\w*|jank\w*|longTasks?|\w*Ms|cpu|idle|gt\d+)$/i.test(k));
  assert.deepEqual(timing, []);
  // the job's own profile, removed; the lock released
  assert.match(started.params.profile, /chrome-fn\/two-\d+-[0-9a-f]{8}$/);
  assert.equal(existsSync(started.params.profile), false, 'profile removed');
  assert.deepEqual(readdirSync(join(repo.main, 'out', 'chrome-fn')).filter((f) => f.startsWith('two-')), []);
  assert.equal(holder(join(s.d, 'state')), null);
});

test('--screen-dpr 3 --viewport desktop --no-screens: the switch follows, wheel gestures, exit 0', async () => {
  const s = setup('dpr');
  const r = await run(s, `ok=${ok}`, '--screen-dpr', '3', '--viewport', 'desktop', '--no-screens');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /CHECK OK: 1 page\(s\), headless .* DPR 3/);
  const started = s.log().find((l) => l.method === '(started)');
  assert.ok(started.params.argv.includes('--screen-info={0,0 4536x2946 devicePixelRatio=3}'));
  const res = s.result();
  assert.equal(res.screenInfo.dpr, 3);
  assert.equal(res.results[0].viewport, 'desktop');
  assert.deepEqual(res.results[0].shots, {});
  assert.equal(s.log().filter((l) => l.method === 'Input.dispatchMouseEvent' && l.params.type === 'mouseWheel').length, 25);
  assert.equal(s.log().filter((l) => l.method === 'Emulation.setDeviceMetricsOverride' && l.params.width === 1440).length, 1);
});

test('inside an outer hold (lock.mjs run): re-enters it, never queues behind it', async () => {
  const s = setup('outer');
  const outer = await nodeAsync(join(repo.main, 'tools', 'lock.mjs'), ['run', 'chrome-measure', '--owner', 'outer-hold', '--short', '--max-seconds', '120', '--', process.execPath, CHECK(), ...s.args(`ok=${ok}`, '--no-screens')], { cwd: repo.main, env: s.env, timeout: 60000 });
  assert.equal(outer.code, 0, outer.out);
  assert.match(s.result().lock.mode, /^reentrant/);
  assert.equal(holder(join(s.d, 'state')), null);
});

test('two jobs at once: separate profiles, both complete, both removed', async () => {
  const s1 = setup('par'), s2 = setup('par');
  const shared = { FW_STATE_DIR: s1.env.FW_STATE_DIR };
  s2.env = { ...s2.env, ...shared };
  const [r1, r2] = await Promise.all([run(s1, `ok=${ok}`, '--no-screens'), run(s2, `ok=${ok}`, '--no-screens')]);
  assert.equal(r1.code, 0, r1.out);
  assert.equal(r2.code, 0, r2.out);
  const p1 = s1.log().find((l) => l.method === '(started)').params.profile, p2 = s2.log().find((l) => l.method === '(started)').params.profile;
  assert.notEqual(p1, p2);
  assert.equal(existsSync(p1) || existsSync(p2), false);
});

test('--max-seconds: a page that hangs stops the job at the budget (exit 124), lock released, profile removed', async () => {
  const s = setup('budget', { FAKE_CHROME_HANG_AT: 'Page.navigate' });
  const t0 = Date.now();
  const r = await run(s, `ok=${ok}`, '--max-seconds', '10');
  assert.equal(r.code, 124, r.out);
  assert.match(r.stderr, /lock budget of 10 s ran out/);
  assert.ok(Date.now() - t0 < 30000);
  assert.equal(holder(join(s.d, 'state')), null);
  const started = s.log().find((l) => l.method === '(started)');
  assert.equal(existsSync(started.params.profile), false);
});
