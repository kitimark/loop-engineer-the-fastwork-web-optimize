// tools/lib/bench-spec.mjs: the fixes/<topic>/bench.json contract (schema, expectation grammar, the
// "data only" lint, experiments[]), and `bench.mjs lint`. The last test lints every committed
// fixes/*/bench.json: that is the part of the benchmark suite that runs in plain `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, makeTempRepo, node } from '../helpers.mjs';
import { parseExpectation, meets, lintSpec, lintTopic, loadSpec, PROBE_KINDS } from '../../tools/lib/bench-spec.mjs';

// design §6.1, plus an experiment row per kind of outcome
export function example() {
  return {
    schema: 1, topic: 'phone-invisible-shrink', status: 'authored', supersededBy: null,
    evidence: 'results.json mobile 6x n=5: fps 66.5 -> 71.6 (disjoint), forced 94 -> 31 ms; LoAF future l 122/114 ms (11 LoAFs) -> absent',
    segments: {
      future: { from: '.start-selling-future', to: '.start-selling-platform', step: 150, before: 1.0 },
      platform: { from: '.start-selling-platform', to: 'end', step: 150, before: 1.0 },
      profile: { from: '.start-selling-profile-sticky', to: '.start-selling-future', step: 150, before: 1.0 },
    },
    spots: { top: { at: 'top', wait: 1, window: 3 } },
    probes: {
      futureWrites: { kind: 'setProperty', prop: '--future-shrink' },
      platformWrites: { kind: 'inlineProp', selector: '.start-selling-platform', prop: '--platform-shrink' },
      profileMql: { kind: 'matchMedia', query: '(min-width: 861px)' },
      layouts: { kind: 'perfMetrics', metric: 'LayoutCount' },
    },
    mechanism: [
      { id: 'no-future-writes-phone', viewport: 'mobile', segment: 'future', probe: 'futureWrites', baseline: '>= 20', patched: '== 0', why: 'CSS 3384/3650 force scale 1 on phones (T1)' },
      { id: 'no-platform-writes-phone', viewport: 'mobile', segment: 'platform', probe: 'platformWrites', baseline: '>= 5', patched: '== 0', why: 'CSS 10990-11016 neutralise --platform-shrink on phones' },
      { id: 'profile-mql-cached', viewport: 'mobile', segment: 'profile', probe: 'profileMql', baseline: '>= 10', patched: '<= 2', why: 'T2: one MQL per mount instead of one per frame' },
      { id: 'desktop-still-animates', viewport: 'desktop', segment: 'future', probe: 'futureWrites', baseline: '>= 20', patched: '>= 0.5 * baseline', why: 'gate must not match a 1440 mouse viewport' },
      { id: 'idle-layouts', viewport: 'mobile', spot: 'top', probe: 'layouts', baseline: '>= 1', patched: 'equal', why: 'idle unchanged' },
    ],
    parity: [
      { viewport: 'mobile', segment: 'future', classes: ['.start-selling-future', '.pain'] },
      { viewport: 'desktop', segment: 'future', classes: ['.start-selling-future', '.pain'], props: [['.start-selling-future', '--future-shrink', 0.001]], attrs: [['body', 'data-y']] },
    ],
    gain: { scenario: { viewport: 'mobile', segment: 'future' }, metric: 'styleLayoutMs', direction: 'lower', device: 'chrome', status: 'authored' },
    experiments: [
      { id: 'phone-invisible-shrink/01', variant: 'final', expect: { mech: 'pass', parity: 'pass', gain: 'better' } },
      { id: 'phone-invisible-shrink/02', variant: 'variants/02.diff', expect: { mech: { 'no-future-writes-phone': 'pass', 'desktop-still-animates': 'fail' }, gain: 'within-noise' }, why: 'gated on width only: desktop lost its animation' },
      { id: 'phone-invisible-shrink/03', variant: 'variants/03.diff', expect: { parity: 'fail', gain: 'broke' }, why: 'dropped the is-pain-dark toggle' },
    ],
  };
}
const lint = (s, o = {}) => lintSpec(s, { topic: 'phone-invisible-shrink', ...o });

test('expectation grammar: parse, evaluate, baseline references', () => {
  assert.deepEqual(parseExpectation('== 0'), { op: '==', n: 0, text: '== 0' });
  assert.deepEqual(parseExpectation('>=20'), { op: '>=', n: 20, text: '>=20' });
  assert.deepEqual(parseExpectation('<= 0.25 * baseline'), { op: '<=', ref: 'baseline', f: 0.25, text: '<= 0.25 * baseline' });
  assert.deepEqual(parseExpectation('equal'), { op: '==', ref: 'baseline', f: 1, text: 'equal' });
  for (const bad of ['', '= 1', '>= x', '>= -1', '<= baseline', 'return 1', '>= 1; alert(1)', '< 2 * baseline']) assert.throws(() => parseExpectation(bad), /not an expectation/, bad);
  assert.throws(() => parseExpectation('equal', { allowBaseline: false }), /baseline expectation/);
  assert.throws(() => parseExpectation('>= 0.5 * baseline', { allowBaseline: false }), /baseline expectation/);
  assert.equal(meets('== 0', 0), true);
  assert.equal(meets('== 0', 1), false);
  assert.equal(meets('>= 20', 20), true);
  assert.equal(meets('>= 20', 19), false);
  assert.equal(meets('> 2', 2), false);
  assert.equal(meets('< 2', 1.5), true);
  assert.equal(meets('<= 0.25 * baseline', 25, 100), true);
  assert.equal(meets('<= 0.25 * baseline', 26, 100), false);
  assert.equal(meets('>= 0.5 * baseline', 50, 100), true);
  assert.equal(meets('equal', 7, 7), true);
  assert.equal(meets('equal', 7, 8), false);
  assert.equal(meets('<= 0.25 * baseline', 0, undefined), false, 'no baseline value: not met');
  assert.equal(meets('>= 0', NaN), false);
  assert.equal(meets('>= 0', null), false);
});

test('lint accepts the design example (selectors, media queries, custom properties, prose)', () => {
  const r = lint(example(), { hasFile: (f) => ['variants/02.diff', 'variants/03.diff'].includes(f) });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('lint rejects code-like strings outside prose, long strings, and code fragments in prose', () => {
  const cases = [
    [(s) => { s.probes.futureWrites.selector = 'x => x.style'; }, /code-like token "=>"/],
    [(s) => { s.probes.profileMql.query = '(min-width: 861px); alert(1)'; }, /code-like token ";"/],
    [(s) => { s.segments.future.from = 'function(){}'; }, /code-like token "function"/],
    [(s) => { s.probes.futureWrites.prop = '--a\n--b'; }, /newline/],
    [(s) => { s.mechanism[0].why = 'the fix: function l(e) { a.style.setProperty(x, y); }'; }, /function body/],
    [(s) => { s.evidence = 'arrow (x) => y'; }, /code-like token "=>"/],
    [(s) => { s.evidence = 'x'.repeat(201); }, /longer than 200/],
    [(s) => { s.notes = 'if (a) { b(); }'; }, /block with ;/],
  ];
  for (const [mut, re] of cases) {
    const s = example();
    mut(s);
    const { errors } = lint(s, { hasFile: () => true });
    assert.ok(errors.some((e) => re.test(e)), `${re}: ${errors.join(' | ')}`);
  }
  // words in prose are fine: "return", "function" as words, minified names and line refs in prose
  const s = example();
  s.mechanism[0].why = 'the future callback l (JS 11317) no longer has a reason to return early; the function runs once';
  assert.deepEqual(lint(s, { hasFile: () => true }).errors, []);
});

test('lint: schema errors (unknown keys and kinds, references, expectations, status)', () => {
  const cases = [
    [(s) => { s.schema = 2; }, /bench.schema: must be 1/],
    [(s) => { s.topic = 'other-topic'; }, /does not match the directory/],
    [(s) => { s.status = 'draft'; }, /bench.status/],
    [(s) => { s.status = 'superseded'; }, /supersededBy.*names the superseding topic/],
    [(s) => { s.supersededBy = 'scroll-engine'; }, /only with status "superseded"/],
    [(s) => { s.code = 'x'; }, /unknown key "code"/],
    [(s) => { s.probes.x = { kind: 'eval', expr: '1' }; }, /unknown probe kind "eval"/],
    [(s) => { s.probes.futureWrites.extra = 1; }, /unknown key "extra"/],
    [(s) => { delete s.probes.profileMql.query; }, /query: required for kind matchMedia/],
    [(s) => { s.probes.layouts.metric = 'Nope'; }, /bad value "Nope"/],
    [(s) => { s.mechanism[0].probe = 'nope'; }, /no probe "nope"/],
    [(s) => { s.mechanism[0].segment = 'nope'; }, /no segment "nope"/],
    [(s) => { s.mechanism[0].spot = 'top'; }, /exactly one of "segment" or "spot"/],
    [(s) => { s.mechanism[0].baseline = 'equal'; }, /can't refer to the baseline/],
    [(s) => { s.mechanism[0].patched = 'zero'; }, /not an expectation/],
    [(s) => { s.mechanism[1].id = s.mechanism[0].id; }, /duplicate id/],
    [(s) => { s.mechanism[0].viewport = 'tablet'; }, /mobile or desktop/],
    [(s) => { delete s.mechanism[0].why; }, /why: required/],
    [(s) => { s.segments.future.step = 5; }, /step: integer px/],
    [(s) => { s.parity[0].classes = []; }, /a list of selectors/],
    [(s) => { s.parity[1].props = [['.a', '--x', -1]]; }, /\[selector, property, tolerance\?\]/],
    [(s) => { s.gain.metric = 'fps'; }, /gain.metric/],
    [(s) => { s.gain.status = 'maybe'; }, /gain.status/],
    [(s) => { delete s.evidence; }, /evidence: required/],
  ];
  for (const [mut, re] of cases) {
    const s = example();
    mut(s);
    const { errors } = lint(s, { hasFile: () => true });
    assert.ok(errors.some((e) => re.test(e)), `${re}: ${errors.join(' | ')}`);
  }
  assert.deepEqual(lintSpec(null).errors, ['bench.json must be a JSON object']);
  assert.ok(Object.keys(PROBE_KINDS).includes('readAfterWrite'));
});

test('I-032 layers probe kind: metric count | max | added | paints, required', () => {
  assert.deepEqual(PROBE_KINDS.layers, [['metric', 'enum:count|max|added|paints', true]]);
  const ok = example();
  ok.probes.layerCount = { kind: 'layers', metric: 'added' };
  assert.deepEqual(lint(ok, { hasFile: () => true }).errors, []);
  for (const [p, re] of [[{ kind: 'layers' }, /metric: required for kind layers/], [{ kind: 'layers', metric: 'area' }, /bad value "area"/]]) {
    const s = example();
    s.probes.l = p;
    assert.ok(lint(s, { hasFile: () => true }).errors.some((e) => re.test(e)), p.metric ?? 'no metric');
  }
});

test('lint: experiments[] need an existing variant diff (or "final") and an expected outcome that can detect a break', () => {
  const ok = { hasFile: (f) => ['variants/02.diff', 'variants/03.diff'].includes(f) };
  const cases = [
    [(s) => { s.experiments[1].variant = 'variants/07.diff'; }, /"final" or "variants\/02.diff"/],
    [(s) => { s.experiments[1].id = 'other/02'; }, /must start with "phone-invisible-shrink\/"/],
    [(s) => { s.experiments[1].id = 'phone-invisible-shrink/2'; }, /must be "<topic>\/<nn>"/],
    [(s) => { s.experiments[2].id = s.experiments[1].id; s.experiments[2].variant = s.experiments[1].variant; }, /duplicate id/],
    [(s) => { s.experiments[1].expect.mech = { 'no-such-check': 'pass' }; }, /no mechanism check "no-such-check"/],
    [(s) => { s.experiments[1].expect.gain = 'maybe'; }, /better, within-noise, worse, broke/],
    [(s) => { s.experiments[2].expect = { gain: 'broke' }; }, /must still detect the break/],
    [(s) => { s.experiments[0].expect = {}; }, /needs mech, parity or gain/],
    [(s) => { delete s.gain; }, /needs the top-level "gain" scenario/],
  ];
  for (const [mut, re] of cases) {
    const s = example();
    mut(s);
    const { errors } = lint(s, ok);
    assert.ok(errors.some((e) => re.test(e)), `${re}: ${errors.join(' | ')}`);
  }
  const { errors } = lint(example(), { hasFile: (f) => f === 'variants/02.diff' });
  assert.ok(errors.some((e) => /fixes\/phone-invisible-shrink\/variants\/03.diff does not exist/.test(e)), errors.join(' | '));
});

test('bench.mjs lint: OK / FAIL per topic, exit codes, loadSpec throws on lint errors', () => {
  const repo = makeTempRepo({ worktree: null });
  const put = (t, spec, variants = []) => {
    mkdirSync(join(repo.main, 'fixes', t, 'variants'), { recursive: true });
    writeFileSync(join(repo.main, 'fixes', t, 'bench.json'), typeof spec === 'string' ? spec : JSON.stringify(spec, null, 1));
    for (const v of variants) writeFileSync(join(repo.main, 'fixes', t, v), 'diff\n');
  };
  const bench = (...a) => node(join(repo.main, 'tools', 'bench.mjs'), a, { cwd: repo.main });
  assert.match(bench('lint').stdout, /no fixes\/\*\/bench.json yet/);
  put('phone-invisible-shrink', example(), ['variants/02.diff', 'variants/03.diff']);
  let r = bench('lint');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^OK {3}phone-invisible-shrink$/m);
  const bad = example(); bad.topic = 'bad-topic'; bad.probes.futureWrites.selector = 'a => b';
  put('bad-topic', bad);
  put('broken-json', '{ "schema": 1,');
  r = bench('lint');
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^FAIL bad-topic\n {2}bench\.probes\.futureWrites\.selector: code-like token "=>"/m);
  assert.match(r.stdout, /^FAIL broken-json\n {2}not valid JSON/m);
  assert.equal(bench('lint', 'phone-invisible-shrink').code, 0);
  assert.throws(() => loadSpec(join(repo.main, 'fixes'), 'bad-topic'), /fails the lint/);
  assert.equal(loadSpec(join(repo.main, 'fixes'), 'phone-invisible-shrink').topic, 'phone-invisible-shrink');
  assert.equal(bench('nope').code, 2);
});

test('every committed fixes/*/bench.json passes the lint', () => {
  const dir = join(REPO, 'fixes');
  const topics = readdirSync(dir).filter((d) => !d.startsWith('_') && existsSync(join(dir, d, 'bench.json')));
  for (const t of topics) {
    const r = lintTopic(dir, t);
    assert.deepEqual(r.errors, [], `fixes/${t}/bench.json`);
  }
});
