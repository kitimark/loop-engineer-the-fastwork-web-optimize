// imagemeta.mjs: metadata in the pictures the public release ships (I-270 review): PNG and GIF are stripped losslessly
// (the chunks and extension blocks that carry text, dates or EXIF are dropped, the pixels are untouched); JPEG, AVIF and
// WebP are only read, and a file that carries XMP, IPTC, a comment, GPS, a camera, an owner or any EXIF tag beyond the
// pixel and colour ones is refused (the build is not ready). Library, no CLI. Names kinds, never values.
// Fail closed: a file with a picture name that is no picture this reads, a format it does not read (HEIC/HEIF, TIFF,
// BMP, JPEG XL), an unreadable or truncated file, a PNG critical chunk it does not know, a WebP chunk outside the
// pixel/animation/colour ones, JPEG bytes after EOI or an APP0 that is not JFIF, an AVIF top-level box other than
// ftyp/meta/mdat (and empty or zero-filled free/skip) or a meta child other than hdlr/pitm/iloc/iinf/iprp/iref/idat/
// dinf/grpl (an 'xml ' box only as XMP, refused as such), an AVIF uuid box or EXIF bytes outside a parsed Exif item, and a
// known value inside a colour profile (PNG iCCP inflated, JPEG APP2, WebP ICCP, AVIF colr; read as text and as UTF-16
// big and little endian, the ICC mluc strings) are all refused.
//
//   imageMeta(buf) -> {format: 'png'|'gif'|'jpeg'|'avif'|'webp'|null, kinds: [...], risky: [...]}
//   stripImage(buf) -> {buf, removed: [...]} for PNG and GIF, else null
//   shipImage(buf, {name, literalHits}) -> {format, kinds, action: 'stripped'|'clean'|'refused', buf, risky}
//
// Kinds: text (PNG tEXt/zTXt/iTXt), xmp, exif-pixel (only pixel/colour tags), exif-camera (Make, Model, lens),
// exif-owner (Artist, Copyright, owner, serial numbers), exif-gps, exif-other (any other tag: dates, software, notes),
// exif-unparsed, time (PNG tIME), private-chunk (any other PNG ancillary chunk but the pixel, colour and animation ones),
// comment (GIF/JPEG comment), plain-text (a GIF plain-text block: stripped), app-ext (a GIF application block other
// than looping), iptc, icc (a colour profile, kept), trailing-data (bytes after the PNG IEND or the GIF trailer:
// stripped; after a JPEG EOI, the WebP RIFF or the last AVIF box: refused), and the refusals: not-an-image,
// format-not-shipped, unreadable, unknown-critical-chunk, known-value-in-icc, unknown-webp-chunk, app0-not-jfif,
// uuid-box, unknown-avif-box.
import { inflateSync } from 'node:zlib';

/** EXIF/TIFF tags that only describe pixels, layout or colour (and the pointers to the sub-directories). */
const PIXEL_TAGS = new Set([
  0x0100, 0x0101, 0x0102, 0x0103, 0x0106, 0x0111, 0x0112, 0x0115, 0x0116, 0x0117, 0x011a, 0x011b, 0x011c, 0x0128,
  0x012d, 0x013e, 0x013f, 0x0201, 0x0202, 0x0211, 0x0212, 0x0213, 0x0214,
  0x8769, 0xa005, // Exif and Interoperability sub-directory pointers (followed / interop only)
  0x9000, 0x9101, 0xa000, 0xa001, 0xa002, 0xa003, 0xa500,
]);
const CAMERA_TAGS = new Set([0x010f, 0x0110, 0xa433, 0xa434]);
const OWNER_TAGS = new Set([0x013b, 0x8298, 0xa430, 0xa431, 0xa435]);
const GPS_POINTER = 0x8825;
/** Kinds a read-only format may carry and still ship. */
const BENIGN = new Set(['exif-pixel', 'icc']);
/** Kinds no strip can make shippable: refused for every format. */
const FATAL = new Set(['not-an-image', 'format-not-shipped', 'unreadable', 'unknown-critical-chunk', 'known-value-in-icc']);
const PNG_CRITICAL = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);
/** WebP chunks that hold pixels, alpha, animation or a colour profile; any other chunk is refused. */
const WEBP_OK = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
/** Picture formats this module does not read: never shipped. */
const NOT_SHIPPED = /\.(heic|heif|tiff?|bmp|jxl)$/i;
/** AVIF top-level boxes that may carry data; free/skip pass only empty or zero-filled. */
const AVIF_TOP = new Set(['ftyp', 'meta', 'mdat']);
/** AVIF meta children that hold items, their locations and properties; an 'xml ' box only when it is XMP (refused as xmp). */
const AVIF_META = new Set(['hdlr', 'pitm', 'iloc', 'iinf', 'iprp', 'iref', 'idat', 'dinf', 'grpl']);

/** Classify the tags of a TIFF (EXIF) block: a Set of kinds. */
export function exifKinds(t) {
  const kinds = new Set();
  if (t.length < 8) return new Set(['exif-unparsed']);
  const le = t.toString('latin1', 0, 2) === 'II';
  if (!le && t.toString('latin1', 0, 2) !== 'MM') return new Set(['exif-unparsed']);
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  if (u16(2) !== 42) return new Set(['exif-unparsed']);
  const seen = new Set();
  const walk = (off, depth) => {
    if (!off || seen.has(off) || depth > 4 || off + 2 > t.length) return;
    seen.add(off);
    const n = u16(off);
    if (off + 2 + n * 12 + 4 > t.length) { kinds.add('exif-unparsed'); return; }
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12, tag = u16(e);
      if (tag === GPS_POINTER) kinds.add('exif-gps');
      else if (CAMERA_TAGS.has(tag)) kinds.add('exif-camera');
      else if (OWNER_TAGS.has(tag)) kinds.add('exif-owner');
      else if (!PIXEL_TAGS.has(tag)) kinds.add('exif-other');
      if (tag === 0x8769) walk(u32(e + 8), depth + 1);
    }
    if (depth === 0) walk(u32(off + 2 + n * 12), depth + 1); // IFD1: the thumbnail's directory
  };
  walk(u32(4), 0);
  if (!kinds.size) kinds.add('exif-pixel');
  return kinds;
}
/** EXIF kinds of a payload that may start with "Exif\0\0" (JPEG APP1, WebP EXIF, HEIF Exif item after its offset). */
const exifPayload = (b) => exifKinds(b.toString('latin1', 0, 6) === 'Exif\0\0' ? b.subarray(6) : b);

const XMP_MARKS = ['<x:xmpmeta', 'http://ns.adobe.com/xap/1.0/', 'adobe:ns:meta'];
const hasXmp = (buf) => XMP_MARKS.some((m) => buf.includes(m, 0, 'latin1'));

function pngChunks(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  const out = [];
  for (let p = 8; p + 12 <= buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), end = p + 12 + len;
    if (end > buf.length) throw new Error('PNG chunk runs past the end of the file');
    out.push({ type, start: p, end, data: buf.subarray(p + 8, p + 8 + len) });
    p = end;
    if (type === 'IEND') { if (p < buf.length) out.push({ type: '(trailing)', start: p, end: buf.length, data: buf.subarray(p) }); break; }
  }
  return out;
}
const PNG_TEXT = { tEXt: 'text', zTXt: 'text', iTXt: 'text', eXIf: 'exif', tIME: 'time', '(trailing)': 'trailing-data' };
/** Ancillary chunks that only describe pixels, colour or animation (kept); any other ancillary chunk is dropped. */
const PNG_KEEP = new Set(['gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'bKGD', 'tRNS', 'hIST', 'sPLT', 'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCV', 'cLLI']);
const pngDrop = (c) => c.type in PNG_TEXT || (/^[a-z]/.test(c.type) && !PNG_KEEP.has(c.type));
const pngKind = (c) => (c.type === 'iTXt' && c.data.toString('latin1', 0, 17) === 'XML:com.adobe.xmp' ? 'xmp' : c.type === 'eXIf' ? [...exifKinds(c.data)].join(',') : PNG_TEXT[c.type] || 'private-chunk');

/** GIF blocks: [{keep, kind, start, end}] (header and screen descriptor first), or null when not a GIF. */
function gifBlocks(buf) {
  if (buf.length < 13 || !/^GIF8[79]a$/.test(buf.toString('latin1', 0, 6))) return null;
  const table = (flags) => (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
  const subBlocks = (q) => { while (q < buf.length) { const n = buf[q]; q += 1 + n; if (n === 0) return q; } throw new Error('GIF sub-blocks run past the end of the file'); };
  const out = [{ keep: true, start: 0, end: 13 + table(buf[10]) }];
  let p = out[0].end;
  while (p < buf.length) {
    const b = buf[p];
    if (b === 0x3b) { out.push({ keep: true, start: p, end: p + 1 }); p++; break; }
    if (b === 0x2c) { const q = subBlocks(p + 10 + table(buf[p + 9]) + 1); out.push({ keep: true, start: p, end: q }); p = q; continue; }
    if (b !== 0x21) throw new Error(`unknown GIF block 0x${b.toString(16)}`);
    const label = buf[p + 1], end = subBlocks(p + 2);
    if (label === 0xfe) out.push({ keep: false, kind: 'comment', start: p, end });
    else if (label === 0xff) {
      const app = buf.toString('latin1', p + 3, p + 3 + buf[p + 2]);
      const loop = app === 'NETSCAPE2.0' || app === 'ANIMEXTS1.0';
      out.push({ keep: loop, kind: loop ? null : app.startsWith('XMP Data') ? 'xmp' : 'app-ext', start: p, end });
    } else if (label === 0x01) out.push({ keep: false, kind: 'plain-text', start: p, end }); // text drawn over the picture
    else out.push({ keep: true, start: p, end }); // graphic control
    p = end;
  }
  if (p < buf.length) out.push({ keep: false, kind: 'trailing-data', start: p, end: buf.length });
  return out;
}

/** Every JPEG segment to EOI (entropy-coded data skipped: stuffed 0xFF00 and restart markers), then nothing after it. */
function jpegKinds(buf) {
  const kinds = new Set();
  let p = 2, eoi = false;
  while (p + 2 <= buf.length) {
    if (buf[p] !== 0xff) throw new Error('JPEG marker expected');
    const m = buf[p + 1];
    if (m === 0xff) { p++; continue; } // fill byte
    if (m === 0xd9) { eoi = true; p += 2; break; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { p += 2; continue; }
    if (p + 4 > buf.length) throw new Error('JPEG segment runs past the end of the file');
    const len = buf.readUInt16BE(p + 2), end = p + 2 + len;
    if (len < 2 || end > buf.length) throw new Error('JPEG segment runs past the end of the file');
    const seg = buf.subarray(p + 4, end);
    if (m === 0xe0 && seg.toString('latin1', 0, 5) !== 'JFIF\0') kinds.add('app0-not-jfif');
    else if (m === 0xe1 && seg.toString('latin1', 0, 6) === 'Exif\0\0') for (const k of exifPayload(seg)) kinds.add(k);
    else if (m === 0xe1 && hasXmp(seg)) kinds.add('xmp');
    else if (m === 0xe2 && seg.toString('latin1', 0, 11) === 'ICC_PROFILE') kinds.add('icc');
    else if (m === 0xed) kinds.add('iptc');
    else if (m === 0xfe) kinds.add('comment');
    else if (m >= 0xe1 && m <= 0xef && m !== 0xee) kinds.add('exif-other'); // other application segments
    p = end;
    if (m === 0xda) { // scan data up to the next marker that is no stuffed byte and no restart
      while (p + 1 < buf.length && !(buf[p] === 0xff && buf[p + 1] !== 0 && !(buf[p + 1] >= 0xd0 && buf[p + 1] <= 0xd7))) p++;
    }
  }
  if (!eoi) throw new Error('JPEG without EOI');
  if (p < buf.length) kinds.add('trailing-data');
  return kinds;
}

/** ISO BMFF boxes in buf[start, end): [{type, start, body, end}]. */
function boxes(buf, start = 0, end = buf.length) {
  const out = [];
  for (let p = start; p + 8 <= end;) {
    let size = buf.readUInt32BE(p), hdr = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(p + 8)); hdr = 16; } else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) break;
    out.push({ type: buf.toString('latin1', p + 4, p + 8), start: p, body: p + hdr, end: p + size });
    p += size;
  }
  return out;
}
/** AVIF/HEIF: Exif items (parsed through iloc), XMP items (mime application/rdf+xml), colour profiles. */
function heifKinds(buf) {
  const kinds = new Set();
  const top = boxes(buf);
  if (top.some((b) => b.type === 'uuid')) kinds.add('uuid-box');
  // top level: ftyp, meta, mdat, and free/skip only when empty or all zero; anything else (or bytes the boxes don't cover)
  const zero = (b) => buf.subarray(b.body, b.end).every((x) => x === 0);
  if (top.some((b) => !AVIF_TOP.has(b.type) && !((b.type === 'free' || b.type === 'skip') && zero(b)))) kinds.add('unknown-avif-box');
  if ((top.length ? top[top.length - 1].end : 0) < buf.length) kinds.add('trailing-data');
  const exifRanges = []; // [start, end) of the Exif items read through iloc
  const meta = top.find((b) => b.type === 'meta');
  if (meta) {
    const kids = boxes(buf, meta.body + 4, meta.end);
    if (kids.some((b) => !AVIF_META.has(b.type) && !(b.type === 'xml ' && hasXmp(buf.subarray(b.body, b.end))))) kinds.add('unknown-avif-box');
    const iprp = kids.find((b) => b.type === 'iprp');
    const ipco = iprp && boxes(buf, iprp.body, iprp.end).find((b) => b.type === 'ipco');
    if ([kids, ipco ? boxes(buf, ipco.body, ipco.end) : []].some((l) => l.some((b) => b.type === 'uuid'))) kinds.add('uuid-box');
    const items = new Map(); // id -> type
    const iinf = kids.find((b) => b.type === 'iinf');
    if (iinf) {
      const v = buf[iinf.body];
      for (const infe of boxes(buf, iinf.body + 4 + (v === 0 ? 2 : 4), iinf.end).filter((b) => b.type === 'infe')) {
        const iv = buf[infe.body];
        if (iv < 2) continue;
        let q = infe.body + 4;
        const id = iv === 2 ? buf.readUInt16BE(q) : buf.readUInt32BE(q);
        q += (iv === 2 ? 2 : 4) + 2;
        const type = buf.toString('latin1', q, q + 4);
        let ctype = '';
        if (type === 'mime') { const s = q + 4 + buf.subarray(q + 4, infe.end).indexOf(0) + 1; ctype = buf.toString('latin1', s, s + buf.subarray(s, infe.end).indexOf(0)); }
        items.set(id, type === 'mime' ? `mime:${ctype}` : type);
      }
    }
    const iloc = kids.find((b) => b.type === 'iloc');
    const extents = new Map();
    if (iloc) {
      const v = buf[iloc.body];
      let q = iloc.body + 4;
      const os = buf[q] >> 4, ls = buf[q] & 15, bs = buf[q + 1] >> 4, is = v ? buf[q + 1] & 15 : 0;
      q += 2;
      const rd = (n) => { const x = n === 0 ? 0 : n === 4 ? buf.readUInt32BE(q) : n === 8 ? Number(buf.readBigUInt64BE(q)) : NaN; q += n; return x; };
      const count = v < 2 ? buf.readUInt16BE(q) : buf.readUInt32BE(q);
      q += v < 2 ? 2 : 4;
      for (let i = 0; i < count && q < iloc.end; i++) {
        const id = v < 2 ? buf.readUInt16BE(q) : buf.readUInt32BE(q);
        q += v < 2 ? 2 : 4;
        const method = v ? buf.readUInt16BE(q) & 15 : 0;
        if (v) q += 2;
        q += 2; // data reference index
        const base = rd(bs);
        const n = buf.readUInt16BE(q);
        q += 2;
        const ex = [];
        for (let k = 0; k < n; k++) { if (is) rd(is); const off = rd(os), len = rd(ls); ex.push([base + off, len]); }
        // construction method 0: file offsets; 1: offsets into the meta box's idat (small items such as Exif)
        const idat = kids.find((b) => b.type === 'idat');
        extents.set(id, method === 0 ? ex : method === 1 && idat ? ex.map(([o, l]) => [idat.body + o, l]) : null);
      }
    }
    for (const [id, type] of items) {
      if (type === 'Exif') {
        const ex = extents.get(id);
        if (!ex || !ex.length || ex.some(([o, l]) => !(o + l <= buf.length))) { kinds.add('exif-unparsed'); continue; }
        for (const [o, l] of ex) exifRanges.push([o, o + l]);
        const data = Buffer.concat(ex.map(([o, l]) => buf.subarray(o, o + l)));
        for (const k of data.length >= 4 ? exifPayload(data.subarray(4 + data.readUInt32BE(0))) : ['exif-unparsed']) kinds.add(k);
      } else if (type === 'mime:application/rdf+xml') kinds.add('xmp');
    }
    if (kids.some((b) => b.type === 'iprp') && buf.includes('colr', meta.body, 'latin1')) kinds.add('icc');
  }
  if (hasXmp(buf)) kinds.add('xmp');
  // an EXIF block anywhere else (an mdat the items do not name, a free box): not read, so not shipped
  // ("Exif\0\0" and a TIFF header; an infe's item type "Exif" alone is no EXIF block)
  for (let i = buf.indexOf('Exif\0\0', 0, 'latin1'); i >= 0; i = buf.indexOf('Exif\0\0', i + 1, 'latin1')) {
    if (!/^(II\*\0|MM\0\*)$/.test(buf.toString('latin1', i + 6, i + 10))) continue;
    if (!exifRanges.some(([a, b]) => i >= a && i < b)) { kinds.add('exif-unparsed'); break; }
  }
  return kinds;
}

function webpKinds(buf) {
  const kinds = new Set();
  const riffEnd = 8 + buf.readUInt32LE(4);
  if (riffEnd > buf.length) throw new Error('WebP RIFF runs past the end of the file');
  let p = 12;
  for (; p + 8 <= riffEnd;) {
    const type = buf.toString('latin1', p, p + 4), len = buf.readUInt32LE(p + 4);
    if (p + 8 + len > riffEnd) throw new Error('WebP chunk runs past the end of the RIFF');
    if (type === 'XMP ') kinds.add('xmp');
    else if (type === 'EXIF') { for (const k of exifPayload(buf.subarray(p + 8, p + 8 + len))) kinds.add(k); kinds.add('unknown-webp-chunk'); }
    else if (type === 'ICCP') kinds.add('icc');
    else if (!WEBP_OK.has(type)) kinds.add('unknown-webp-chunk');
    p += 8 + len + (len & 1);
  }
  if (Math.max(p, riffEnd) < buf.length) kinds.add('trailing-data');
  return kinds;
}

const formatOf = (buf) => (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 ? 'png'
  : /^GIF8[79]a$/.test(buf.toString('latin1', 0, 6)) ? 'gif'
    : buf[0] === 0xff && buf[1] === 0xd8 ? 'jpeg'
      : buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP' ? 'webp'
        : buf.toString('latin1', 4, 8) === 'ftyp' && /^avi[fs]$/.test(buf.toString('latin1', 8, 12)) ? 'avif' : null);

/** The metadata kinds of an image: {format, kinds, risky} (risky: kinds a read-only format may not ship with). */
export function imageMeta(buf) {
  const format = formatOf(buf);
  let kinds = new Set();
  if (format === 'png') for (const c of pngChunks(buf)) { const k = pngDrop(c) ? pngKind(c) : c.type === 'iCCP' ? 'icc' : /^[A-Z]/.test(c.type) && !PNG_CRITICAL.has(c.type) ? 'unknown-critical-chunk' : null; if (k) for (const x of k.split(',')) kinds.add(x); }
  else if (format === 'gif') for (const b of gifBlocks(buf)) { if (b.kind) kinds.add(b.kind); }
  else if (format === 'jpeg') kinds = jpegKinds(buf);
  else if (format === 'avif') kinds = heifKinds(buf);
  else if (format === 'webp') kinds = webpKinds(buf);
  const list = [...kinds].sort();
  return { format, kinds: list, risky: list.filter((k) => !BENIGN.has(k)) };
}

/** PNG and GIF without their metadata (pixels untouched): {buf, removed: [kinds]}; null for other formats. */
export function stripImage(buf) {
  const format = formatOf(buf);
  if (format === 'png') {
    const cs = pngChunks(buf);
    const removed = new Set();
    for (const c of cs) if (pngDrop(c)) for (const x of pngKind(c).split(',')) removed.add(x);
    return { buf: Buffer.concat([buf.subarray(0, 8), ...cs.filter((c) => !pngDrop(c)).map((c) => buf.subarray(c.start, c.end))]), removed: [...removed].sort() };
  }
  if (format === 'gif') {
    const bs = gifBlocks(buf);
    return { buf: Buffer.concat(bs.filter((b) => b.keep).map((b) => buf.subarray(b.start, b.end))), removed: [...new Set(bs.filter((b) => !b.keep).map((b) => b.kind))].sort() };
  }
  return null;
}

/** The colour profile bytes of a picture: PNG iCCP (its name, and the profile inflated), JPEG APP2 ICC_PROFILE
 *  segments (joined), WebP ICCP, AVIF colr (prof/rICC). */
function iccProfiles(buf, format) {
  if (format === 'png') {
    return pngChunks(buf).filter((c) => c.type === 'iCCP').flatMap((c) => {
      const z = c.data.indexOf(0);
      if (z < 0) throw new Error('iCCP without a name');
      return [c.data.subarray(0, z), inflateSync(c.data.subarray(z + 2))];
    });
  }
  if (format === 'jpeg') {
    const parts = [];
    for (let p = 2; p + 4 <= buf.length && buf[p] === 0xff && buf[p + 1] !== 0xda && buf[p + 1] !== 0xd9;) {
      if (buf[p + 1] === 0xff) { p++; continue; } // fill byte, as jpegKinds
      const end = p + 2 + buf.readUInt16BE(p + 2);
      if (buf[p + 1] === 0xe2 && buf.toString('latin1', p + 4, p + 15) === 'ICC_PROFILE') parts.push(buf.subarray(p + 18, end));
      p = end;
    }
    return parts.length ? [Buffer.concat(parts)] : [];
  }
  if (format === 'webp') {
    const out = [];
    for (let p = 12; p + 8 <= buf.length;) { const len = buf.readUInt32LE(p + 4); if (buf.toString('latin1', p, p + 4) === 'ICCP') out.push(buf.subarray(p + 8, p + 8 + len)); p += 8 + len + (len & 1); }
    return out;
  }
  if (format === 'avif') {
    const out = [];
    for (let i = buf.indexOf('colr', 0, 'latin1'); i >= 4; i = buf.indexOf('colr', i + 1, 'latin1')) {
      const t = buf.toString('latin1', i + 4, i + 8), end = i - 4 + buf.readUInt32BE(i - 4);
      if ((t === 'prof' || t === 'rICC') && end <= buf.length) out.push(buf.subarray(i + 8, end));
    }
    return out;
  }
  return [];
}
/** A profile as text the literal scan can read: latin1, and UTF-16 big and little endian at both byte alignments. */
function profileTexts(b) {
  const u16 = (x, be) => { const y = Buffer.from(x.subarray(0, x.length & ~1)); if (be) y.swap16(); return y.toString('utf16le'); };
  return [b.toString('latin1'), u16(b, true), u16(b, false), u16(b.subarray(1), true), u16(b.subarray(1), false)];
}

/**
 * What the release does with one picture (`name`: its file name; `literalHits(text)`: how many known values a text
 * holds, for the PNG colour profile): PNG/GIF stripped ('stripped' when something was dropped, else 'clean'),
 * JPEG/AVIF/WebP shipped as they are when they carry only benign kinds ('clean'); everything else 'refused'.
 */
export function shipImage(buf, { name = '', literalHits = null } = {}) {
  const refuse = (kinds, format = null) => ({ format, kinds, risky: kinds, action: 'refused', buf });
  if (NOT_SHIPPED.test(name)) return refuse(['format-not-shipped']);
  let m;
  try {
    m = imageMeta(buf);
    if (!m.format) return refuse(['not-an-image']);
    if (literalHits && iccProfiles(buf, m.format).some((b) => profileTexts(b).some((t) => literalHits(t) > 0))) m = { ...m, kinds: [...m.kinds, 'known-value-in-icc'].sort() };
  } catch (e) {
    return refuse(['unreadable'], m?.format ?? null);
  }
  const fatal = m.kinds.filter((k) => FATAL.has(k));
  if (fatal.length) return { ...m, risky: fatal, action: 'refused', buf };
  const s = stripImage(buf);
  if (s) return { ...m, action: s.removed.length ? 'stripped' : 'clean', buf: s.buf };
  return { ...m, action: m.risky.length ? 'refused' : 'clean', buf };
}

/** Every file name that is (or claims to be) a picture: each goes through shipImage, whatever its bytes. */
export const IMAGE_FILE = /\.(png|gif|jpe?g|avif|webp|heic|heif|tiff?|bmp|jxl)$/i;
