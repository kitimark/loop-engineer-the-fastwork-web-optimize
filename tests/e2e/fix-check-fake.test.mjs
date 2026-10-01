// tools/fix.mjs check end to end with the fake Chrome in check mode, in a temp repo + worktree over the fixture
// baseline: the same two servers and served-file check as ab, then tools/check.mjs (headless) on both; an overlay
// that makes the page throw, request a missing chunk and lose the morph gives exit 1 with those regressions; a
// clean overlay gives exit 0 and, with --save, fixes/<topic>/check.json; check.json carries no origin, LAN address,
// checkout path or home dir (Hard rule 12); ab refuses --headless / --functional (ts-headless).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { makeTempRepo, node, nodeAsync, TESTS } from '../helpers.mjs';
import { makeFixtureHome } from '../fixtures/baseline.mjs';

const FAKE = join(TESTS, 'fixtures', 'fake-chrome.mjs');
let repo;
const fix = (...a) => node(join(repo.wt, 'tools', 'fix.mjs'), a, { cwd: repo.wt });
const env = (name) => ({ CHROME: FAKE, FAKE_CHROME_CHECK: '1', FW_CHECK_TEST_FAST: '1', FW_STATE_DIR: join(repo.root, `state-${name}`), FAKE_CHROME_LOG: join(repo.root, `${name}.jsonl`) });
const readLog = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
// a LAN origin (normalised like ab's), a bare private address, the home dir and the checkout path (scrubbed)
const BAD = () => ({ errors: ['ReferenceError: y at http://192.168.1.20:5200/x.js via 10.0.0.7'], logErrors: [`Failed to load ${homedir()}/s.js and ${repo.wt}/a.js`], notFound: ['/_app/immutable/chunks/missing.js'], nav: 'start-selling-top-nav' });
function topic(t, data) {
  assert.equal(fix('new', t).code, 0);
  const e = fix('edit', t, '/check-fake.json');
  assert.equal(e.code, 0, e.out);
  writeFileSync(join(repo.wt, 'fixes', t, 'overlay', 'check-fake.json'), JSON.stringify(data));
}
const lastCheck = (t) => { const d = join(repo.wt, 'out', 'check', t); const s = readdirSync(d).sort().pop(); return join(d, s, 'check.json'); };

before(() => {
  repo = makeTempRepo({ worktree: 'check-wt' });
  const fx = makeFixtureHome(repo.main);
  for (const d of [fx.site, fx.pretty]) writeFileSync(join(d, 'check-fake.json'), '{}');
  topic('breaks-page', BAD());
  topic('clean-page', { note: 'same behaviour, other bytes' });
});

test('fix check: new errors, a new 404 and a lost morph on the patched side give exit 1; check.json scrubbed, not saved', async () => {
  const r = await nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['check', 'breaks-page'], { cwd: repo.wt, env: env('bad'), timeout: 90000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /served-file check OK: 1 overlay file\(s\) differ from baseline and come from the overlay/);
  assert.match(r.stdout, /CHECK breaks-page: REGRESSED: 2 new error\(s\); 1 new 404\(s\); morph lost \(mobile\)/);
  const text = readFileSync(lastCheck('breaks-page'), 'utf8');
  const res = JSON.parse(text);
  assert.equal(res.kind, 'functional check');
  assert.equal(res.chromeMode, 'headless');
  assert.deepEqual(res.config.serveArgs, ['--vendors=local', '--https', '--latency', '150'], 'the same servers as ab');
  assert.equal(res.config.screenInfo.dpr, 2);
  assert.deepEqual(res.servedCheck.map((x) => [x.path, x.source]), [['/check-fake.json', 'overlay']]);
  assert.deepEqual([...res.regressions.newErrors].sort(), ['exception: ReferenceError: y at <origin>/x.js via <lan>', 'network: Failed to load ~/s.js and ./a.js']);
  assert.deepEqual(res.regressions.new404s, ['404 /_app/immutable/chunks/missing.js']);
  assert.deepEqual(res.regressions.morphReached, { baseline: true, patched: false });
  assert.deepEqual(Object.keys(res.regressions.screenshotDiffPct), ['top', 'middle', 'bottom']);
  assert.deepEqual(res.regressions.domDiff.elements, { baseline: 42, patched: 42 });
  // Hard rule 12: nothing that names this machine
  for (const bad of ['127.0.0.1', 'localhost', '192.168.', '10.0.0.7', repo.root, homedir()]) assert.equal(text.includes(bad), false, `check.json contains ${bad}`);
  assert.equal(existsSync(join(repo.wt, 'fixes', 'breaks-page', 'check.json')), false, 'saved only with --save');
  assert.equal(existsSync(join(repo.wt, 'fixes', 'breaks-page', 'results.json')), false, 'never touches results.json');
  const started = readLog(env('bad').FAKE_CHROME_LOG).filter((l) => l.method === '(started)');
  assert.equal(started.length, 1, 'one headless browser for both sides');
  assert.ok(started[0].params.argv.includes('--headless=new'));
});

test('fix check --save --viewport both: a clean overlay is ok (exit 0) and saves fixes/<topic>/check.json', async () => {
  const r = await nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['check', 'clean-page', '--save', '--viewport', 'both', '--no-screens'], { cwd: repo.wt, env: env('clean'), timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /CHECK clean-page: ok/);
  const saved = JSON.parse(readFileSync(join(repo.wt, 'fixes', 'clean-page', 'check.json'), 'utf8'));
  assert.equal(saved.verdict, 'ok');
  assert.deepEqual(Object.keys(saved.regressions.byViewport), ['mobile', 'desktop']);
  assert.deepEqual(saved.regressions.newErrors, []);
  assert.deepEqual(saved.pages.map((p) => `${p.viewport} ${p.label}`), ['mobile base', 'mobile fix', 'desktop base', 'desktop fix']);
  assert.equal(saved.raw.startsWith('out/check/clean-page/'), true);
});

test('fix ab refuses --headless / --functional (timing runs headed only): exit 2, pointing to fix check', () => {
  for (const f of ['--headless', '--functional']) {
    const r = fix('ab', 'clean-page', f);
    assert.equal(r.code, 2, r.out);
    assert.match(r.stderr, /fix\.mjs ab measures timing and runs headed only.*fix\.mjs check <topic>/);
  }
  assert.equal(existsSync(join(repo.wt, 'out', 'ab')), false, 'refused before any server or measurement');
});
