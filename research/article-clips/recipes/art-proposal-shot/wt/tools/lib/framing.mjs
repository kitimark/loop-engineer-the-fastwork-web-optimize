// I-074 (user T-028): let the user console show the mirror in an iframe. tools/serve.mjs sends production's
// `x-frame-options: SAMEORIGIN` and CSP `frame-ancestors 'self'` with every document, so a page on another origin (the
// console on localhost:5559) can't frame it. `serve.mjs --frame-ancestors <origin>[,<origin>…]` (opt-in) drops
// x-frame-options and names those origins in the document CSP's frame-ancestors. Only exact localhost / 127.0.0.1
// origins with a port are accepted (the console is localhost-only). Without the flag nothing changes.
//
// Platform note (CONFIRMED): a CSP frame-ancestors directive makes browsers ignore X-Frame-Options (CSP Level 3,
// https://www.w3.org/TR/CSP3/#frame-ancestors-and-frame-options), but we drop the header anyway so no browser has to
// pick; a second frame-ancestors directive in one policy is ignored (CSP3 §2.2.1, "duplicate directives"), so the
// production directive is replaced, not appended to.

/** An origin the console may frame the mirror from: http(s)://localhost:<port> or http(s)://127.0.0.1:<port>. */
export const FRAME_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1):([1-9]\d{0,4})$/;

/** `--frame-ancestors` value -> [origin] (comma or space separated, deduplicated); throws on anything else. */
export function parseFrameAncestors(v) {
  if (v === undefined || v === null || typeof v !== 'string' || !v.trim() || v.startsWith('--')) {
    throw new Error('--frame-ancestors needs an origin, e.g. --frame-ancestors http://localhost:5559');
  }
  const list = v.split(/[\s,]+/).filter(Boolean);
  for (const o of list) {
    const m = FRAME_ORIGIN.exec(o);
    if (!m || Number(m[1]) > 65535) throw new Error(`--frame-ancestors: ${JSON.stringify(o)} is not an exact origin http(s)://localhost:<port> or http(s)://127.0.0.1:<port> (no path, no other host)`);
  }
  return [...new Set(list)];
}

/** `csp` with its frame-ancestors directive set to 'self' + `origins` (replaced if present, else appended). */
export function withFrameAncestors(csp, origins) {
  const dirs = String(csp || '').split(';').map((d) => d.trim()).filter(Boolean);
  const value = ["frame-ancestors 'self'", ...origins].join(' ');
  const i = dirs.findIndex((d) => /^frame-ancestors(?:\s|$)/i.test(d));
  if (i >= 0) dirs[i] = value; else dirs.push(value);
  return dirs.join('; ');
}

/** A document's response headers, made frameable by `origins` (mutates and returns `headers`). */
export function allowFraming(headers, origins) {
  delete headers['x-frame-options'];
  headers['content-security-policy'] = withFrameAncestors(headers['content-security-policy'], origins);
  return headers;
}
