// I-131: the Cache-Control serve.mjs sends for a file from the root, an overlay or the vendor store.
//
// The mirror records production's headers (site/.mirror/manifest.json: 230 files `public, max-age=31536000,
// immutable`, a few `max-age=86400`). Production may promise that, because there a URL's bytes never change. On the
// mirror they do: an overlay changes a hashed file in place (PR-017's /_app/immutable/assets/2.gBuqKVzi.css), site-pretty
// serves other bytes than site/ under the same names, and every port (--port auto, the console's Try-it servers, the
// ephemeral http twin) is reused by other builds. A browser that stored a fresh copy keeps using it without asking
// (RFC 9111 §4.2; `immutable`, RFC 8246, even across reloads; Chromium reuses any fresh subresource on a normal
// reload), so it showed another build's file. So nothing the mirror serves may be reused without revalidation:
// a recorded header that grants freshness becomes `no-cache` (store, but revalidate every use; serve.mjs sends a
// content ETag, so a revalidation is a 304 when the bytes are the same and the new bytes when they are not).
// Headers that already revalidate every use (the document's `max-age=0, must-revalidate`, no-cache, no-store) stay.

/** Does this Cache-Control value let a browser reuse a stored response without revalidating it? */
export function grantsFreshness(cc) {
  const dirs = String(cc ?? '').toLowerCase().split(',').map((d) => d.trim()).filter(Boolean);
  if (dirs.some((d) => d === 'no-store' || d === 'no-cache' || d.startsWith('no-cache='))) return false;
  if (dirs.includes('immutable')) return true;
  const age = (name) => { const d = dirs.find((x) => x.startsWith(name + '=')); return d ? Number(d.slice(name.length + 1).replace(/"/g, '')) : null; };
  const maxAge = age('max-age');
  if (maxAge !== null) return !(maxAge <= 0); // a malformed value (NaN) counts as fresh: be safe
  return true; // no max-age at all: a cache may assign heuristic freshness (RFC 9111 §4.2.2)
}

/** The header serve.mjs sends for a recorded (production) value: `no-store` under --no-cache, else never a fresh one. */
export function mirrorCacheControl(recorded, { noStore = false } = {}) {
  if (noStore) return 'no-store';
  return grantsFreshness(recorded) ? 'no-cache' : String(recorded);
}
