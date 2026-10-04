// tools/lib/json-edit.mjs (ts-threads, the lead after the T-104 team measurement: mgmt-ops' slowest work is
// hand-editing the compact fixes/PROGRESS.json): edits of a hand-laid-out JSON file that keep every byte outside the
// changed value, so a `console.mjs progress set` makes a one-line diff. Paths: keys, [n], [id=x], [+] (append), [^]
// (prepend). A new value takes the layout of the value it replaces (or of its siblings): one line or one member per
// line, the file's indent, `{ "a"` vs `{"a"` padding.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const J = await import('../../tools/lib/json-edit.mjs');

// the PROGRESS.json layout: 1-space indent, rows of one-line objects (two paddings), expanded items, inline arrays
const DOC = `{
 "schema": "fw-progress/1",
 "updatedAt": "2026-10-04T10:10:00Z",
 "changes": [
  { "at": "2026-10-04T09:55:00Z", "text": "two" },
  { "at": "2026-10-04T09:25:00Z", "text": "one" }
 ],
 "items": [
  {
   "id": "a",
   "title": "A",
   "felt": {
    "answer": "better",
    "text": "x"
   },
   "checks": [{ "id": "P-001", "what": "w" }]
  },
  {
   "id": "b",
   "title": "B",
   "felt": { "answer": "same", "text": "y" }
  }
 ],
 "versions": [
  {"id": "v0", "name": "Original", "tryIt": {"none": "x"}},
  {"id": "v1", "best": true, "name": "One", "result": [{"what": "w", "before": "1", "after": "0"}]}
 ],
 "build": {
  "name": "One",
  "fixes": ["a", "b"],
  "combined": [
  ]
 }
}
`;
const edit = (path, value, o = {}) => J.editJson(DOC, [{ path, value, ...o }]);
const diff = (a, b) => { const x = a.split('\n'), y = b.split('\n'); return y.filter((l, i) => l !== x[i]); };

test('parsePath: keys, [n], [id=x], [+], [^]; bad paths say why', () => {
  assert.deepEqual(J.parsePath('build.since'), [{ key: 'build' }, { key: 'since' }]);
  assert.deepEqual(J.parsePath('items[id=cd-strip].checks[0].result'), [{ key: 'items' }, { id: 'cd-strip' }, { key: 'checks' }, { index: 0 }, { key: 'result' }]);
  assert.deepEqual(J.parsePath('changes[^]'), [{ key: 'changes' }, { prepend: true }]);
  assert.deepEqual(J.parsePath('versions[+]'), [{ key: 'versions' }, { append: true }]);
  for (const bad of ['', 'a..b', 'a[', 'a[x]', 'a[id=]', '.a', 'a[+].b', 'a b']) assert.throws(() => J.parsePath(bad), /path/, bad);
});

test('editJson: a scalar replaced in place; every other byte unchanged', () => {
  const out = edit('updatedAt', '2026-10-04T11:00:00Z');
  assert.deepEqual(diff(DOC, out), [' "updatedAt": "2026-10-04T11:00:00Z",']);
  assert.equal(out.length, DOC.length);
  const deep = edit('items[id=b].felt.answer', 'better');
  assert.deepEqual(diff(DOC, deep), ['   "felt": { "answer": "better", "text": "y" }']);
  const idx = edit('versions[1].result[0].after', '0-1');
  assert.deepEqual(diff(DOC, idx), ['  {"id": "v1", "best": true, "name": "One", "result": [{"what": "w", "before": "1", "after": "0-1"}]}']);
  assert.equal(JSON.parse(idx).versions[1].result[0].after, '0-1');
  // strings with quotes, backslashes and non-ASCII come out as JSON
  const q = edit('items[0].title', 'the "hero" \\ 42-44 °C');
  assert.equal(JSON.parse(q).items[0].title, 'the "hero" \\ 42-44 °C');
});

test('editJson: a container takes the layout of the value it replaces (one line, or one member per line)', () => {
  const inline = edit('build.fixes', ['a', 'b', 'c']);
  assert.deepEqual(diff(DOC, inline), ['  "fixes": ["a", "b", "c"],']);
  const multi = edit('items[0].felt', { answer: 'same', text: 'z' });
  assert.match(multi, /\n {3}"felt": \{\n {4}"answer": "same",\n {4}"text": "z"\n {3}\},\n/);
  const row = edit('versions[0]', { id: 'v0', name: 'Original page', tryIt: { none: 'y' } });
  assert.deepEqual(diff(DOC, row), ['  {"id": "v0", "name": "Original page", "tryIt": {"none": "y"}},'], 'the row keeps {"a" padding');
  const padded = edit('changes[1]', { at: '2026-10-04T09:26:00Z', text: 'one!' });
  assert.deepEqual(diff(DOC, padded), ['  { "at": "2026-10-04T09:26:00Z", "text": "one!" }'], 'the row keeps { "a" padding');
  assert.deepEqual(JSON.parse(padded).changes[1], { at: '2026-10-04T09:26:00Z', text: 'one!' });
});

test('editJson: [^] and [+] add a row in the layout of its neighbours; an empty multi-line array opens', () => {
  const pre = edit('changes[^]', { at: '2026-10-04T10:30:00Z', text: 'three' });
  assert.match(pre, /"changes": \[\n {2}\{ "at": "2026-10-04T10:30:00Z", "text": "three" \},\n {2}\{ "at": "2026-10-04T09:55:00Z"/);
  assert.equal(JSON.parse(pre).changes.length, 3);
  const app = edit('versions[+]', { id: 'v2', name: 'Two', fixes: ['b'] });
  assert.match(app, /"result": \[\{"what": "w", "before": "1", "after": "0"\}\]\},\n {2}\{"id": "v2", "name": "Two", "fixes": \["b"\]\}\n \],/);
  const item = edit('items[+]', { id: 'c', title: 'C', felt: { answer: 'same', text: 'q' } });
  assert.match(item, /\n {2}\},\n {2}\{\n {3}"id": "c",\n {3}"title": "C",\n {3}"felt": \{ "answer": "same", "text": "q" \}\n {2}\}\n \],/, 'a new item: one member per line like the last item; felt one line like its felt');
  const empty = edit('build.combined[+]', { what: 'w', before: '1', after: '0' });
  assert.match(empty, /"combined": \[\n {3}\{ "what": "w", "before": "1", "after": "0" \}\n {2}\]/);
  assert.deepEqual(JSON.parse(empty).build.combined, [{ what: 'w', before: '1', after: '0' }]);
});

test('editJson: a new key goes last (or after a named key) in the object\'s layout; delete removes the member and its comma', () => {
  const k = edit('build.since', '2026-10-04T07:33:52Z');
  assert.match(k, /"combined": \[\n {2}\],\n {2}"since": "2026-10-04T07:33:52Z"\n \}\n\}/);
  const after = edit('versions[0].best', true, { after: 'id' });
  assert.deepEqual(diff(DOC, after), ['  {"id": "v0", "best": true, "name": "Original", "tryIt": {"none": "x"}},']);
  const afterMulti = edit('items[0].owner', 'fix-a', { after: 'id' });
  assert.match(afterMulti, /\{\n {3}"id": "a",\n {3}"owner": "fix-a",\n {3}"title": "A",/);
  const del = J.editJson(DOC, [{ path: 'versions[1].best', delete: true }]);
  assert.deepEqual(diff(DOC, del), ['  {"id": "v1", "name": "One", "result": [{"what": "w", "before": "1", "after": "0"}]}']);
  const delLast = J.editJson(DOC, [{ path: 'items[1].felt', delete: true }]);
  assert.match(delLast, /"title": "B"\n {2}\}\n \],/);
  const delRow = J.editJson(DOC, [{ path: 'changes[0]', delete: true }]);
  assert.match(delRow, /"changes": \[\n {2}\{ "at": "2026-10-04T09:25:00Z", "text": "one" \}\n \],/);
  const delOnly = J.editJson(DOC, [{ path: 'items[0].checks[0]', delete: true }]);
  assert.match(delOnly, /"checks": \[\]/);
  const several = J.editJson(DOC, [{ path: 'build.name', value: 'Two' }, { path: 'versions[1].best', delete: true }, { path: 'versions[0].best', value: true, after: 'id' }]);
  assert.deepEqual(JSON.parse(several).versions.map((v) => v.best), [true, undefined]);
  assert.equal(JSON.parse(several).build.name, 'Two');
});

test('editJson: a missing parent, an index out of range, no or several [id=x] matches and a bad file are refused, naming the path', () => {
  assert.throws(() => edit('nope.x', 1), /nope: no such key/);
  assert.throws(() => edit('changes[5].text', 'x'), /changes\[5\]: index out of range \(2 entries\)/);
  assert.throws(() => edit('items[id=zz].title', 'x'), /items\[id=zz\]: no entry with "id": "zz" \(ids: a, b\)/);
  const dup = DOC.replace('"id": "b"', '"id": "a"');
  assert.throws(() => J.editJson(dup, [{ path: 'items[id=a].title', value: 'x' }]), /items\[id=a\]: 2 entries with "id": "a"/);
  assert.throws(() => edit('build.name.x', 1), /build\.name: not an object or array/);
  assert.throws(() => edit('build[+]', 1), /build: \[\+\] needs an array/);
  assert.throws(() => J.editJson(DOC, [{ path: 'nope', delete: true }]), /nope: no such key/);
  assert.throws(() => J.editJson('{"a": 1,}', [{ path: 'a', value: 2 }]), /not JSON/);
  assert.throws(() => edit('a', undefined), /no value/);
});

test('editJson on the real file layout: the result parses to the edited object (self-check), and the diff is one line', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { REPO } = await import('../helpers.mjs');
  const f = join(REPO, 'fixes', 'PROGRESS.json');
  if (!existsSync(f)) return;
  const text = readFileSync(f, 'utf8');
  const out = J.editJson(text, [{ path: 'updatedBy', value: 'ts-test' }]);
  assert.equal(diff(text, out).length, 1);
  assert.equal(out.split('\n').length, text.split('\n').length);
  assert.equal(JSON.parse(out).updatedBy, 'ts-test');
});
