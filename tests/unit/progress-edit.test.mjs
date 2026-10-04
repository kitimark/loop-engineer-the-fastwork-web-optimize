// tools/lib/progress-edit.mjs (ts-threads, the lead after the T-104 team measurement): `console.mjs progress set` and
// `progress best` as library calls. set: path = value edits of fixes/PROGRESS.json, updatedAt/updatedBy stamped, the
// result validated (the CLI refuses an invalid one). best: "best": true moves to one version and the build block moves
// with it (since = the version's since, the T-103 rule; name; fixes = every landed version's fixes up to it; summary
// and combined rows of the old build dropped; items' inBuild flags kept in step).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const E = await import('../../tools/lib/progress-edit.mjs');
const P = await import('../../tools/lib/progress.mjs');

const NOW = Date.parse('2026-10-04T11:00:00Z');
const item = (id, o = {}) => ({ id, title: `Item ${id}`, area: 'hero', state: 'landed', stage: 'L', ...o });
const res = [{ what: 'frames over 50 ms', before: '4', after: '1', tag: 'OBSERVED', driver: 'scripted scroll' }];
function doc() {
  return {
    schema: 'fw-progress/1', updatedAt: '2026-10-04T10:00:00Z', updatedBy: 'mgmt-ops-10', goal: 'Smooth.',
    complaints: [{ area: 'hero', text: 'laggy' }],
    changes: [{ at: '2026-10-04T09:00:00Z', text: 'one' }],
    items: [item('cdwc', { inBuild: true }), item('hero-a', { state: 'testing', stage: 'V', next: 'P-033', owner: 'fix-hero' }), item('carousel', { inBuild: false }), item('morph')],
    upcoming: [],
    versions: [
      { id: 'v0', name: 'Original page', since: '2026-10-01T00:00:00Z', improvement: 'The page.', tryIt: { none: 'x' } },
      { id: 'v1', best: true, name: 'Stack 6', since: '2026-10-02T08:00:00Z', improvement: 'Countdown.', fixes: ['cdwc'], result: res, cost: 'none', tryIt: { none: 'x' } },
      { id: 'v2', landed: false, name: 'GPU preview (to try; not landed)', since: '2026-10-03T08:00:00Z', improvement: 'GPU.', fixes: ['hero-a'], result: res, cost: 'none', tryIt: { none: 'x' } },
      { id: 'v3', name: 'Best build 3', since: '2026-10-04T07:00:00Z', improvement: 'Carousel and morph.', fixes: ['carousel', 'morph'], result: res, cost: 'none', tryIt: { none: 'x' } },
    ],
    build: {
      name: 'Stack 6', since: '2026-10-02T08:00:00Z', summary: 'The countdown fix.', fixes: ['cdwc'],
      combined: [{ ...res[0], when: '2026-10-02T09:00:00Z' }, { ...res[0], what: 'later', when: '2026-10-04T08:00:00Z' }],
    },
  };
}
const text = (p = doc()) => JSON.stringify(p, null, 1) + '\n';

test('the fixture is valid', () => assert.deepEqual(P.validateProgress(doc()), []));

test('parseValue: JSON when it parses, else the words as a string; --string keeps the raw text', () => {
  assert.equal(E.parseValue('"x"'), 'x');
  assert.equal(E.parseValue('true'), true);
  assert.equal(E.parseValue('42'), 42);
  assert.deepEqual(E.parseValue('{"a": 1}'), { a: 1 });
  assert.deepEqual(E.parseValue('["a","b"]'), ['a', 'b']);
  assert.equal(E.parseValue('plain words, no quotes'), 'plain words, no quotes');
  assert.equal(E.parseValue('2026-10-04T07:33:52Z'), '2026-10-04T07:33:52Z');
  assert.equal(E.parseValue('true', { string: true }), 'true');
  assert.equal(E.parseValue('"q"\n', { string: true }), '"q"', 'a file\'s last newline is not part of the value');
});

test('progressSet: edits, stamps updatedAt/updatedBy, validates; the errors before and after are both returned', () => {
  const stale = doc(); stale.build.since = '2026-10-01T09:00:00Z';
  const r = E.progressSet(text(stale), [{ path: 'build.since', value: '2026-10-02T08:00:00Z' }], { by: 'mgmt-ops-10', now: NOW });
  assert.match(r.before.join('\n'), /build\.since: 2026-10-01T09:00:00Z, but the version with "best": true/);
  assert.deepEqual(r.errors, []);
  assert.equal(r.data.build.since, '2026-10-02T08:00:00Z');
  assert.equal(r.data.updatedAt, '2026-10-04T11:00:00Z');
  assert.equal(r.data.updatedBy, 'mgmt-ops-10');
  assert.deepEqual(r.notes, ['build.since: "2026-10-01T09:00:00Z" -> "2026-10-02T08:00:00Z"']);
  assert.deepEqual(JSON.parse(r.text), r.data);
  // several at once; a delete; [id=x]; a new row first
  const m = E.progressSet(text(), [{ path: 'items[id=hero-a].next', value: 'P-034' }, { path: 'build.summary', delete: true }, { path: 'changes[^]', value: { at: '2026-10-04T11:00:00Z', text: 'two' } }], { by: 'ops', now: NOW });
  assert.deepEqual(m.errors, []);
  assert.equal(m.data.items[1].next, 'P-034');
  assert.equal(m.data.build.summary, undefined);
  assert.deepEqual(m.data.changes.map((c) => c.text), ['two', 'one']);
  assert.deepEqual(m.notes, ['items[id=hero-a].next: "P-033" -> "P-034"', 'build.summary: deleted (was "The countdown fix.")', 'changes[^]: added {"at":"2026-10-04T11:00:00Z","text":"two"}']);
  // in order: a later path sees the earlier edits (a new first change row, then the oldest one out)
  const seq = E.progressSet(text(), [{ path: 'changes[^]', value: { at: '2026-10-04T11:00:00Z', text: 'two' } }, { path: 'changes[1]', delete: true }], { by: 'ops', now: NOW });
  assert.deepEqual(seq.data.changes.map((c) => c.text), ['two']);
  assert.equal(seq.notes[1], 'changes[1]: deleted (was {"at":"2026-10-04T09:00:00Z","text":"one"})');
  assert.throws(() => E.progressSet(text(), [{ path: 'changes[1]', delete: true }], { by: 'ops', now: NOW }), /changes\[1\]: index out of range \(1 entries\)/);
  // an explicit updatedAt wins over the stamp
  const u = E.progressSet(text(), [{ path: 'updatedAt', value: '2026-10-04T10:30:00Z' }], { by: 'ops', now: NOW });
  assert.equal(u.data.updatedAt, '2026-10-04T10:30:00Z');
  // an invalid result: returned with its errors (the CLI refuses to write it)
  const bad = E.progressSet(text(), [{ path: 'items[0].state', value: 'nope' }], { by: 'ops', now: NOW });
  assert.deepEqual(bad.before, []);
  assert.match(bad.errors.join('\n'), /items\[0\]\.state: must be one of/);
  assert.throws(() => E.progressSet(text(), [{ path: 'goal', value: 'x' }], { now: NOW }), /--by <agent>/);
  assert.throws(() => E.progressSet(text(), [], { by: 'ops', now: NOW }), /nothing to set/);
});

test('progressBest: the flag and the build block move together; fixes are every landed version\'s up to it; old summary and combined rows go', () => {
  const r = E.progressBest(text(), 'v3', { by: 'ops', now: NOW });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.data.versions.map((v) => v.best), [undefined, undefined, undefined, true]);
  assert.deepEqual(Object.keys(r.data.versions[3]).slice(0, 2), ['id', 'best'], '"best" right after the id, as ops write it');
  assert.equal(r.data.build.since, '2026-10-04T07:00:00Z', 'the T-103 rule');
  assert.equal(r.data.build.name, 'Best build 3');
  assert.deepEqual(r.data.build.fixes, ['cdwc', 'carousel', 'morph'], 'v1 + v3; v2 is a page to try, not landed');
  assert.equal(r.data.build.summary, undefined, 'the old build\'s summary is not this build\'s');
  assert.deepEqual(r.data.build.combined.map((c) => c.what), ['later'], 'a row measured before this build existed was of an older build');
  assert.equal(r.data.items[2].inBuild, true, 'an inBuild flag follows build.fixes');
  assert.equal(r.data.items[3].inBuild, undefined, 'no flag stays no flag');
  assert.equal(r.data.updatedBy, 'ops');
  for (const re of [/^versions\[3\] "v3": "best": true \(was versions\[1\] "v1"\)$/, /^build\.since: 2026-10-02T08:00:00Z -> 2026-10-04T07:00:00Z$/, /^build\.name: "Stack 6" -> "Best build 3"$/,
    /^build\.fixes: \+carousel, \+morph$/, /^build\.summary: removed \(it described the previous build\); set it with --summary/, /^build\.combined: dropped 1 row measured before 2026-10-04T07:00:00Z/, /^items\[2\] "carousel"\.inBuild: false -> true$/]) {
    assert.ok(r.notes.some((n) => re.test(n)), `${re}\n${r.notes.join('\n')}`);
  }
  // --name and --summary
  const n = E.progressBest(text(), 'v3', { by: 'ops', now: NOW, name: 'Best build v3', summary: 'Every landed fix.' });
  assert.equal(n.data.build.name, 'Best build v3'); assert.equal(n.data.build.summary, 'Every landed fix.');
  assert.deepEqual(n.errors, []);
});

test('progressBest: back to an older version drops every combined row; the current best is a no-op; a page to try or an unknown id is refused', () => {
  const p = doc(); p.versions[1].best = undefined; delete p.versions[1].best; p.versions[3].best = true;
  Object.assign(p.build, { name: 'Best build 3', since: '2026-10-04T07:00:00Z', fixes: ['cdwc', 'carousel', 'morph'] });
  p.items[2].inBuild = true;
  assert.deepEqual(P.validateProgress(p), []);
  const back = E.progressBest(text(p), 'v1', { by: 'ops', now: NOW });
  assert.deepEqual(back.errors, []);
  assert.deepEqual(back.data.build.fixes, ['cdwc']);
  assert.deepEqual(back.data.build.combined, [], 'all were measured on a later build');
  assert.equal(back.data.items[2].inBuild, false);
  const same = E.progressBest(text(), 'v1', { by: 'ops', now: NOW });
  assert.deepEqual(same.errors, []);
  assert.deepEqual({ ...same.data, updatedAt: 0, updatedBy: 0 }, { ...doc(), updatedAt: 0, updatedBy: 0 }, 'nothing but the stamp changes');
  // the build block already on that version (same since) keeps its own name and summary (ops write a longer name)
  const own = doc(); own.build.name = 'Best build v1: the countdown fix';
  const kept = E.progressBest(text(own), 'v1', { by: 'ops', now: NOW });
  assert.equal(kept.data.build.name, 'Best build v1: the countdown fix');
  assert.equal(kept.data.build.summary, 'The countdown fix.');
  assert.deepEqual(kept.notes, []);
  assert.equal(E.progressBest(text(own), 'v1', { by: 'ops', now: NOW, name: 'Stack 6' }).data.build.name, 'Stack 6', '--name still sets it');
  const preview = E.progressBest(text(), 'v2', { by: 'ops', now: NOW });
  assert.match(preview.errors.join('\n'), /versions\[2\]: "best": true and "landed": false/);
  assert.throws(() => E.progressBest(text(), 'v9', { by: 'ops', now: NOW }), /no version "v9" \(versions: v0, v1, v2, v3\)/);
  assert.throws(() => E.progressBest(text({ ...doc(), versions: undefined }), 'v1', { by: 'ops', now: NOW }), /no versions/);
});

test('progressBest without a build block makes one', () => {
  const p = doc(); delete p.build; for (const it of p.items) delete it.inBuild;
  const r = E.progressBest(text(p), 'v3', { by: 'ops', now: NOW });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.data.build, { name: 'Best build 3', since: '2026-10-04T07:00:00Z', fixes: ['cdwc', 'carousel', 'morph'] });
});
