// tools/lib/http-range.mjs: the single-range `Range: bytes=…` parser serve.mjs uses (incident I-054).
// RFC 9110 §14: an invalid or unsupported Range is ignored (full 200); a valid but unsatisfiable one is 416.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from '../../tools/lib/http-range.mjs';

const U = { unsatisfiable: true };

test('bytes=a-b, bytes=a-, bytes=-n on a 100-byte body', () => {
  assert.deepEqual(parseRange('bytes=0-0', 100), { start: 0, end: 0 });
  assert.deepEqual(parseRange('bytes=0-1', 100), { start: 0, end: 1 }); // Safari's first media probe
  assert.deepEqual(parseRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseRange('bytes=90-500', 100), { start: 90, end: 99 }, 'last-pos past the end is clamped');
  assert.deepEqual(parseRange('bytes=0-99', 100), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=40-', 100), { start: 40, end: 99 });
  assert.deepEqual(parseRange('bytes=0-', 100), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-500', 100), { start: 0, end: 99 }, 'a suffix longer than the body is the whole body');
  assert.deepEqual(parseRange('Bytes = 5 - 6 ', 100), { start: 5, end: 6 }, 'unit is case-insensitive, optional whitespace');
});

test('no, invalid or multi-range Range headers are ignored (null = send the full 200)', () => {
  for (const h of [undefined, null, '', 'bytes=', 'bytes=-', 'items=0-1', 'bytes=a-b', 'bytes=5-2', 'bytes=0-1,4-5', 'bytes=0-1, -3', 'bytes=1.5-2', 'bytes 0-1'])
    assert.equal(parseRange(h, 100), null, String(h));
});

test('valid but unsatisfiable ranges -> unsatisfiable (416 with Content-Range: bytes */size)', () => {
  assert.deepEqual(parseRange('bytes=100-', 100), U, 'first-pos at the size');
  assert.deepEqual(parseRange('bytes=150-200', 100), U);
  assert.deepEqual(parseRange('bytes=-0', 100), U, 'zero-length suffix');
  assert.deepEqual(parseRange('bytes=0-', 0), U, 'nothing is satisfiable on an empty body');
  assert.deepEqual(parseRange('bytes=-5', 0), U);
});
