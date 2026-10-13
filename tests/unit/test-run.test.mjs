// tools/lib/test-run.mjs (user T-105 #2, ts-testspeed): the order of npm test (longest file first), the schedule
// prediction, per-file seconds from node:test events, and the changed-files mapping of `npm run test:changed`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from '../helpers.mjs';
import { SUITE_DIRS, DURATIONS_FILE, DEFAULT_SEC, listSuite, readDurations, orderLongestFirst, predictWall, fileSeconds, namedFiles, dependents, testsForChanges, readToolSources } from '../../tools/lib/test-run.mjs';

test('orderLongestFirst: by recorded seconds, unknown files at DEFAULT_SEC, ties by name; the input is not changed', () => {
  const files = ['tests/unit/a.test.mjs', 'tests/e2e/b.test.mjs', 'tests/e2e/c.test.mjs', 'tests/unit/new.test.mjs', 'tests/e2e/z.test.mjs'];
  const d = { 'tests/unit/a.test.mjs': 1, 'tests/e2e/b.test.mjs': 90, 'tests/e2e/c.test.mjs': 20, 'tests/e2e/z.test.mjs': DEFAULT_SEC };
  const copy = [...files];
  assert.deepEqual(orderLongestFirst(files, d), ['tests/e2e/b.test.mjs', 'tests/e2e/c.test.mjs', 'tests/e2e/z.test.mjs', 'tests/unit/new.test.mjs', 'tests/unit/a.test.mjs']);
  assert.deepEqual(files, copy);
  assert.deepEqual(orderLongestFirst(files, {}), [...files].sort(), 'no durations: by name, as node --test did');
  assert.deepEqual(orderLongestFirst(['x', 'y'], { y: 5 }, 10), ['x', 'y'], 'defaultSec applies to the unknown one');
});

test('predictWall: a greedy list schedule in the given order (the next file takes the first free slot)', () => {
  const d = { a: 10, b: 6, c: 4, d: 4 };
  // slot 1: a (0-10); slot 2: b (0-6), c (6-10); d takes the first free slot at 10: ends at 14
  assert.equal(predictWall(['a', 'b', 'c', 'd'], d, 2), 14);
  assert.equal(predictWall(['a', 'b', 'c', 'd'], d, 4), 10);
  assert.equal(predictWall(['a', 'b', 'c', 'd'], d, 1), 24);
});

test('predictWall: longest first beats by-name order when the long file sorts last (the old npm test tail)', () => {
  const d = { 'a.test.mjs': 10, 'b.test.mjs': 10, 'c.test.mjs': 10, 'z.test.mjs': 30 };
  const byName = Object.keys(d).sort();
  assert.equal(predictWall(byName, d, 2), 40, 'z starts at 10 on the second slot');
  assert.equal(predictWall(orderLongestFirst(byName, d), d, 2), 30);
  assert.equal(predictWall(['x', 'y'], {}, 1), 2 * DEFAULT_SEC);
  assert.equal(predictWall(['x'], { x: 5 }, 0), 5, 'at least one slot');
});

test('fileSeconds: sums the top-level tests of each file (passes and fails), skips subtests and events without a file', () => {
  const ev = (file, nesting, ms) => ({ file, nesting, details: { duration_ms: ms } });
  const s = fileSeconds([ev('/r/a.test.mjs', 0, 1500), ev('/r/a.test.mjs', 0, 500), ev('/r/a.test.mjs', 1, 400), ev('/r/b.test.mjs', 0, 250), ev(undefined, 0, 9000), { file: '/r/c', nesting: 0 }]);
  assert.deepEqual(s, { '/r/a.test.mjs': 2, '/r/b.test.mjs': 0.25 });
});

test('namedFiles: base names in quotes (imports, tool(), join parts, spawned scripts); not words in prose', () => {
  const t = `import { a } from './lib/lock.mjs';\nconst X = tool('sim.mjs');\nconst p = join(TOOLS, 'lib', "cdp.mjs");\nspawn(process.execPath, [\`\${dir}/fake-wda.mjs\`]);\n// see verify.mjs for details\nconst s = 'agents-page.html';`;
  assert.deepEqual([...namedFiles(t)].sort(), ['agents-page.html', 'cdp.mjs', 'fake-wda.mjs', 'lock.mjs', 'sim.mjs']);
  assert.ok(!namedFiles(t).has('verify.mjs'));
});

test('dependents: transitive importers and starters of a changed tools file; a file with no users is only itself', () => {
  const src = {
    'tools/lib/host.mjs': '',
    'tools/lib/lock.mjs': "import { x } from './host.mjs';",
    'tools/lock.mjs': "import { y } from './lib/lock.mjs';",
    'tools/fix.mjs': "spawn(process.execPath, [join(TOOLS, 'lock.mjs')]);",
    'tools/lib/stats.mjs': '',
    'tools/stats.mjs': "import { s } from './lib/stats.mjs';",
  };
  assert.deepEqual([...dependents(['tools/lib/host.mjs'], src)].sort(), ['tools/fix.mjs', 'tools/lib/host.mjs', 'tools/lib/lock.mjs', 'tools/lock.mjs']);
  assert.deepEqual([...dependents(['tools/stats.mjs'], src)], ['tools/stats.mjs']);
  assert.deepEqual([...dependents([], src)], []);
});

test('testsForChanges: helpers / package.json / paths.mjs run everything; a changed test runs itself; a tool or fixture runs the files that name it or a dependent', () => {
  const suite = ['tests/unit/lock.test.mjs', 'tests/unit/stats.test.mjs', 'tests/e2e/fix.test.mjs', 'tests/e2e/sim.test.mjs'];
  const toolSources = { 'tools/lib/host.mjs': '', 'tools/lib/lock.mjs': "import './host.mjs';", 'tools/fix.mjs': "import './lib/lock.mjs';", 'tools/lib/stats.mjs': '', 'tools/sim.mjs': '' };
  const testSources = {
    'tests/unit/lock.test.mjs': "import { acquire } from '../../tools/lib/lock.mjs';",
    'tests/unit/stats.test.mjs': "import { s } from '../../tools/lib/stats.mjs';",
    'tests/e2e/fix.test.mjs': "const FIX = tool('fix.mjs');",
    'tests/e2e/sim.test.mjs': "import { SIM } from './sim-fixture.mjs'; const f = FX('fake-simctl.mjs');",
  };
  const go = (changed) => testsForChanges(changed, { suite, toolSources, testSources });
  for (const all of ['tests/helpers.mjs', 'package.json', 'tools/lib/paths.mjs']) {
    const r = go(['tools/lib/stats.mjs', all]);
    assert.equal(r.all, true, all);
    assert.match(r.why, new RegExp(all.replace(/[./]/g, '\\$&')));
  }
  let r = go(['tools/lib/host.mjs']);
  assert.deepEqual(r.files, ['tests/unit/lock.test.mjs', 'tests/e2e/fix.test.mjs'], 'lock.test names lib/lock.mjs, fix.test names fix.mjs; both depend on host.mjs');
  assert.match(r.why['tests/e2e/fix.test.mjs'], /names tools\/fix\.mjs/);
  r = go(['tests/unit/stats.test.mjs']);
  assert.deepEqual([r.files, r.why], [['tests/unit/stats.test.mjs'], { 'tests/unit/stats.test.mjs': 'changed' }]);
  r = go(['tests/fixtures/fake-simctl.mjs', 'tests/e2e/sim-fixture.mjs']);
  assert.deepEqual(r.files, ['tests/e2e/sim.test.mjs'], 'a fixture or a shared test module runs the files that name it');
  r = go(['tools/sim.mjs']);
  assert.deepEqual(r.files, [], 'nothing names it here');
  assert.deepEqual(go([]).files, []);
});

test('the real suite: listSuite has the three dirs, no non-test modules (sim-fixture.mjs), and the split sim files; tests/durations.json reads', () => {
  const suite = listSuite(REPO);
  assert.ok(suite.length > 100);
  assert.ok(suite.every((f) => SUITE_DIRS.some((d) => f.startsWith(`${d}/`)) && f.endsWith('.test.mjs')));
  for (const d of SUITE_DIRS) { const part = suite.filter((f) => f.startsWith(`${d}/`)); assert.deepEqual(part, [...part].sort(), `${d}: by name`); }
  assert.deepEqual(SUITE_DIRS.map((d) => suite.findIndex((f) => f.startsWith(`${d}/`))), SUITE_DIRS.map((d) => suite.findIndex((f) => f.startsWith(`${d}/`))).sort((a, b) => a - b), 'unit, e2e, hooks');
  for (const f of ['tests/e2e/sim.test.mjs', 'tests/e2e/sim-tools.test.mjs', 'tests/unit/test-run.test.mjs', 'tests/hooks/git-hooks.test.mjs']) assert.ok(suite.includes(f), f);
  assert.ok(!suite.some((f) => f.endsWith('sim-fixture.mjs')));
  const d = readDurations(join(REPO, DURATIONS_FILE));
  assert.ok(Object.keys(d).length > 100 && Object.values(d).every((s) => Number.isFinite(s) && s >= 0), 'per-file seconds');
  assert.ok(Object.keys(d).every((f) => f.startsWith('tests/')), 'repo-relative paths');
  assert.deepEqual(readDurations(join(REPO, 'tests', 'no-such-durations.json')), {});
  // the slowest files go first: the old tail (sim*.test.mjs sorted last by name) is gone
  const order = orderLongestFirst(suite, d);
  assert.ok(order.indexOf('tests/e2e/sim-warm.test.mjs') < 8 && order.indexOf('tests/e2e/sim.test.mjs') < 8, order.slice(0, 8).join(' '));
  assert.ok(existsSync(join(REPO, 'tools', 'test-run.mjs')));
});

test('readToolSources: every tools/ script and page with its text (the changed-files map reads them)', () => {
  const src = readToolSources(REPO);
  for (const f of ['tools/lock.mjs', 'tools/lib/lock.mjs', 'tools/test-run.mjs', 'tools/lib/agents-page.html']) assert.ok(f in src, f);
  assert.equal(src['tools/lib/test-run.mjs'], readFileSync(join(REPO, 'tools', 'lib', 'test-run.mjs'), 'utf8'));
  assert.ok([...dependents(['tools/lib/test-run.mjs'], src)].includes('tools/test-run.mjs'));
});
