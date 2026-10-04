// I-131: tools/lib/cache-control.mjs, the Cache-Control serve.mjs sends instead of a recorded production value that
// lets a browser reuse a stored copy without asking (an overlay or another build on the same port would stay stale).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grantsFreshness, mirrorCacheControl } from '../../tools/lib/cache-control.mjs';
import { FRESH_PORT_RANGE, freshPortBase, autoPortBase } from '../../tools/lib/paths.mjs';

test('grantsFreshness: immutable, a positive max-age or no max-age at all grant reuse without revalidation', () => {
  for (const cc of ['public, max-age=31536000, immutable', 'public, max-age=86400', 'public, max-age=900', 'public, max-age=1, must-revalidate',
    'max-age=0, immutable', 'IMMUTABLE', 'public', '', undefined, null, 'max-age=abc', 'private, max-age="60"']) {
    assert.equal(grantsFreshness(cc), true, String(cc));
  }
  for (const cc of ['public, max-age=0, must-revalidate', 'no-cache', 'no-store', 'public, no-cache', 'no-cache="set-cookie", max-age=60', 'max-age=0', 'no-store, max-age=31536000, immutable']) {
    assert.equal(grantsFreshness(cc), false, cc);
  }
});

test('mirrorCacheControl: fresh production values become no-cache; revalidating ones stay; --no-cache is no-store', () => {
  assert.equal(mirrorCacheControl('public, max-age=31536000, immutable'), 'no-cache');
  assert.equal(mirrorCacheControl('public, max-age=86400'), 'no-cache');
  assert.equal(mirrorCacheControl('public, max-age=900'), 'no-cache');
  assert.equal(mirrorCacheControl('public, max-age=0, must-revalidate'), 'public, max-age=0, must-revalidate', 'the document header is sent as recorded');
  assert.equal(mirrorCacheControl('public, max-age=31536000, immutable', { noStore: true }), 'no-store');
  assert.equal(mirrorCacheControl('public, max-age=0, must-revalidate', { noStore: true }), 'no-store');
});

test('freshPortBase (serve.mjs --port fresh): per checkout, inside 6100-6398 with its 60-port walk, away from the auto range', () => {
  const b = freshPortBase();
  assert.equal(b, freshPortBase(), 'deterministic');
  assert.ok(b >= FRESH_PORT_RANGE.from && b + 59 <= FRESH_PORT_RANGE.to, String(b));
  assert.ok(FRESH_PORT_RANGE.from > 5999 + 59, 'above every port --port auto ever walked to (5200-6058)');
  assert.ok(autoPortBase() + 59 < FRESH_PORT_RANGE.from);
});
