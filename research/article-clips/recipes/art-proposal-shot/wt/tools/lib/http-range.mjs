// Single byte-range parsing for tools/serve.mjs (incident I-054). iOS Safari plays <video> media only from
// servers that answer byte-range requests (Apple, Safari Web Content Guide, "Creating Video for Safari on
// iPhone" > "Configuring Your Server": "HTTP servers hosting media files for iOS must support byte-range
// requests, which iOS uses to perform random access in media playback.").
//
// RFC 9110 §14.2: a server MAY ignore Range; an invalid or unsupported one MUST be ignored (full 200).
// We serve exactly one range. A multi-range request (`bytes=0-1,5-6`) is ignored and gets the full 200
// (no multipart/byteranges); browsers' media loaders ask for one range at a time.

/**
 * parseRange(header, size) -> null (no / invalid / multi-range Range: send the full body),
 * {start, end} (inclusive byte positions, end clamped to size-1), or {unsatisfiable: true}
 * (a valid range that selects nothing: 416 with `Content-Range: bytes *\/size`).
 */
export function parseRange(header, size) {
  if (typeof header !== 'string') return null;
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') { // suffix: the last n bytes
    const n = Number(m[2]);
    if (n === 0 || size === 0) return { unsatisfiable: true };
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const last = m[2] === '' ? Infinity : Number(m[2]);
  if (last < start) return null; // invalid: ignored
  if (start >= size) return { unsatisfiable: true };
  return { start, end: Math.min(last, size - 1) };
}
