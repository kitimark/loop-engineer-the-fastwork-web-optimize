// tools/test-run.mjs end to end (npm test / npm run test:changed; user T-105 #2, ts-testspeed) on tiny temp test files:
// the exit code and spec summary the pre-commit hook relies on, the longest-first order from a durations file, the
// per-test timeout, --plan, --record, usage errors, and the --changed listing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tempDir, node, nodeAsync, tool, REPO } from '../helpers.mjs';

const RUN = tool('test-run.mjs');
function files(specs) {
  const dir = tempDir('fw-testrun-');
  const log = join(dir, 'order.log');
  const out = {};
  for (const [name, body] of Object.entries(specs)) {
    const f = join(dir, `${name}.test.mjs`);
    writeFileSync(f, `import { test } from 'node:test';\nimport { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, ${JSON.stringify(name)} + '\\n');\n${body}\n`);
    out[name] = f;
  }
  return { dir, log, f: out, rel: (n) => relative(REPO, out[n]), order: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []) };
}
const PASS = "test('ok', () => {});";

test('exit 0 and the spec summary when every test passes; exit 1, the failing test named, when one fails (the pre-commit hook reads the exit code)', async () => {
  const t = files({ good: PASS, bad: "test('ok', () => {});\ntest('breaks', () => { throw new Error('boom-xyz'); });" });
  let r = await nodeAsync(RUN, [t.f.good]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^✔ ok \(/m);
  assert.match(r.stdout, /^ℹ tests 1$/m);
  assert.match(r.stdout, /^ℹ fail 0$/m);
  assert.match(r.stdout, /^TEST-RUN 1 files, concurrency 8, wall [\d.]+ s; slowest: /m);
  r = await nodeAsync(RUN, [t.f.good, t.f.bad]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^ℹ tests 3$/m);
  assert.match(r.stdout, /^ℹ pass 2$/m);
  assert.match(r.stdout, /^ℹ fail 1$/m);
  assert.match(r.stdout, /✖ breaks/);
  assert.match(r.stdout, /boom-xyz/);
  // a file that does not load counts as a failure too
  const broken = files({ syntax: "test('x', () => {" });
  r = await nodeAsync(RUN, [broken.f.syntax]);
  assert.equal(r.code, 1, r.out);
});

test('order: longest first from the durations file (unknown = DEFAULT_SEC), not by name; --plan prints that order and the predicted wall', async () => {
  const t = files({ a: PASS, b: PASS, c: PASS, d: PASS });
  const dur = join(t.dir, 'durations.json');
  writeFileSync(dur, JSON.stringify({ files: { [t.rel('a')]: 1, [t.rel('b')]: 50, [t.rel('d')]: 9 } }));
  const r = await nodeAsync(RUN, ['--concurrency', '1', '--durations', dur, t.f.a, t.f.b, t.f.c, t.f.d]);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(t.order(), ['b', 'd', 'c', 'a'], 'c has no entry: 3 s');
  const p = node(RUN, ['--plan', '--concurrency', '2', '--durations', dur, t.f.a, t.f.b, t.f.c, t.f.d]);
  assert.equal(p.code, 0, p.out);
  const listed = p.stdout.trim().split('\n').slice(0, 4).map((l) => l.trim().split(/\s+/));
  assert.deepEqual(listed.map((x) => x[0]), ['50.0', '9.0', '~3', '1.0']);
  assert.deepEqual(listed.map((x) => x.at(-1)), [t.rel('b'), t.rel('d'), t.rel('c'), t.rel('a')]);
  assert.match(p.stdout, /^TEST-PLAN 4 files at concurrency 2: predicted wall 50 s \(summed 63 s; from .*durations\.json\)$/m);
  assert.deepEqual(t.order(), ['b', 'd', 'c', 'a'], '--plan runs nothing');
});

test('--timeout is the per-test timeout (npm test: 120000 ms, as node --test --test-timeout did)', async () => {
  const t = files({ slow: "test('waits', async () => { await new Promise((r) => setTimeout(r, 2000)); });\ntest('after', () => {});" });
  const r = await nodeAsync(RUN, ['--timeout', '300', t.f.slow]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /test timed out after 300ms/);
  assert.match(r.stdout, /^✖ waits \((3\d\d|[4-9]\d\d)\.\d+ms\)$/m, 'cut at the timeout, not after its 2 s');
  assert.match(r.stdout, /^ℹ cancelled 1$/m);
  assert.match(readFileSync(RUN, 'utf8'), /timeout = 120000;/);
});

test('--record writes the per-file seconds of a passing run to the durations file; a failing run records nothing', async () => {
  const t = files({ one: "test('a', async () => { await new Promise((r) => setTimeout(r, 200)); });", two: PASS, bad: "test('x', () => { throw new Error('no'); });" });
  const dur = join(t.dir, 'durations.json');
  let r = await nodeAsync(RUN, ['--record', '--durations', dur, t.f.one, t.f.two]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^TEST-RUN recorded 2 files in /m);
  const j = JSON.parse(readFileSync(dur, 'utf8'));
  assert.deepEqual(Object.keys(j.files), [t.rel('one'), t.rel('two')].sort());
  assert.ok(j.files[t.rel('one')] >= 0.2 && j.files[t.rel('one')] < 5, JSON.stringify(j));
  assert.equal(j.concurrency, 8);
  const before = readFileSync(dur, 'utf8');
  r = await nodeAsync(RUN, ['--record', '--durations', dur, t.f.one, t.f.bad]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^TEST-RUN not recorded: a test failed$/m);
  assert.equal(readFileSync(dur, 'utf8'), before);
  // the committed file is only written by a full run
  r = await nodeAsync(RUN, ['--record', t.f.two]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^TEST-RUN not recorded: not the full suite$/m);
});

test('usage errors exit 2 before anything runs; FW_TEST_CONCURRENCY sets the default', async () => {
  const t = files({ a: PASS });
  for (const args of [['--concurrency', '0', t.f.a], ['--timeout', 'x', t.f.a], ['--bogus'], ['--changed', t.f.a]]) {
    const r = node(RUN, args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.out}`);
  }
  assert.deepEqual(t.order(), []);
  let r = node(RUN, [t.f.a], { env: { FW_TEST_CONCURRENCY: 'many' } });
  assert.equal(r.code, 2, r.out);
  r = await nodeAsync(RUN, [t.f.a], { env: { FW_TEST_CONCURRENCY: '3' } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^TEST-RUN 1 files, concurrency 3,/m);
  r = node(RUN, ['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^usage: node tools\/test-run\.mjs /);
});

test('--changed --list: the files mapped to this branch\'s tooling changes (or all), and the reminder that the hook runs the full suite', () => {
  const r = node(RUN, ['--changed', '--list']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^TEST-CHANGED (all \d+ files: .+ changed|\d+ of \d+ files for \d+ changed tooling path\(s\) since main)$/m);
  assert.match(r.stdout, /^TEST-CHANGED is for iteration only: the pre-commit hook and landing run the full npm test$/m);
  assert.doesNotMatch(r.stdout, /^ℹ tests/m, '--list runs nothing');
  const bad = node(RUN, ['--changed', '--list', '--base', 'no-such-ref-xyz']);
  assert.equal(bad.code, 2, bad.out);
  assert.match(bad.stderr, /no merge-base with "no-such-ref-xyz"/);
});
