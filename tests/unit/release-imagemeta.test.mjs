// I-270 review: picture metadata in the public release (tools/release/imagemeta.mjs). Every fixture picture is built
// here at run time; made-up values only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { imageMeta, stripImage, shipImage, exifKinds, IMAGE_FILE, dataImages, dataUriVerdict, dataRun, videoMeta, sniffMedia } from '../../tools/release/imagemeta.mjs';
import { png, pngChunk, gif, gifComment, gifApp, xmp, avif, bmffBox } from '../fixtures/release/stage.mjs';

/** A little-endian TIFF block with one IFD0 of `tags` ([tag, value]: SHORT values), and an Exif IFD of `exif` tags. */
function tiff(tags, exif = []) {
  const ifd = (list, at) => {
    const b = Buffer.alloc(2 + list.length * 12 + 4);
    b.writeUInt16LE(list.length, 0);
    list.forEach(([tag, v, type = 3], i) => { const e = 2 + i * 12; b.writeUInt16LE(tag, e); b.writeUInt16LE(type, e + 2); b.writeUInt32LE(1, e + 4); b.writeUInt32LE(v, e + 8); });
    return b;
  };
  const head = Buffer.from('II*\0\x08\0\0\0', 'latin1');
  const ifd0Len = 2 + (tags.length + (exif.length ? 1 : 0)) * 12 + 4;
  const all = exif.length ? [...tags, [0x8769, 8 + ifd0Len, 4]] : tags;
  return Buffer.concat([head, ifd(all), ...(exif.length ? [ifd(exif)] : [])]);
}
const jpeg = (segments) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...segments.map(([m, data]) => { const h = Buffer.from([0xff, m, 0, 0]); h.writeUInt16BE(data.length + 2, 2); return Buffer.concat([h, data]); }), Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
const riff = (chunks) => {
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks.map(([t, d]) => { const h = Buffer.alloc(8); h.write(t, 0, 'latin1'); h.writeUInt32LE(d.length, 4); return Buffer.concat([h, d, d.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); })]);
  const h = Buffer.alloc(8); h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
};
/** An AVIF whose meta box holds one Exif item (iinf + iloc pointing at bytes in an mdat). */
function avifWithExif(t) {
  const box = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32BE(8 + data.length); h.write(type, 4, 'latin1'); return Buffer.concat([h, data]); };
  const full = (type, v, data) => box(type, Buffer.concat([Buffer.from([v, 0, 0, 0]), data]));
  const ftyp = box('ftyp', Buffer.from('avif\0\0\0\0avifmif1', 'latin1'));
  const infe = full('infe', 2, Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.from('Exif', 'latin1'), Buffer.from('\0')]));
  const iinf = full('iinf', 0, Buffer.concat([Buffer.from([0, 1]), infe]));
  const payload = Buffer.concat([Buffer.from([0, 0, 0, 6]), Buffer.from('Exif\0\0', 'latin1'), t]);
  const ilocFor = (offset) => full('iloc', 0, Buffer.concat([Buffer.from([0x44, 0x00, 0, 1, 0, 1, 0, 0, 0, 1]), Buffer.from([offset >> 24, (offset >> 16) & 255, (offset >> 8) & 255, offset & 255]), Buffer.from([0, 0, 0, payload.length])]));
  const metaLen = 8 + 4 + iinf.length + ilocFor(0).length;
  const offset = ftyp.length + metaLen + 8;
  return Buffer.concat([ftyp, full('meta', 0, Buffer.concat([iinf, ilocFor(offset)])), box('mdat', payload)]);
}

test('I-270 imagemeta: EXIF tags are sorted into pixel/colour, camera, owner, GPS and other', () => {
  assert.deepEqual([...exifKinds(tiff([[0x0112, 1], [0x011a, 72]]))], ['exif-pixel'], 'orientation and resolution only');
  assert.deepEqual([...exifKinds(tiff([[0x010f, 0], [0x0110, 0]]))], ['exif-camera']);
  assert.deepEqual([...exifKinds(tiff([[0x013b, 0]]))], ['exif-owner'], 'Artist');
  assert.deepEqual([...exifKinds(tiff([[0x0112, 1]], [[0xa430, 0]]))], ['exif-owner'], 'CameraOwnerName in the Exif IFD');
  assert.deepEqual([...exifKinds(tiff([[0x8825, 0, 4]]))], ['exif-gps']);
  assert.deepEqual([...exifKinds(tiff([[0x0132, 0]]))], ['exif-other'], 'a date');
  assert.deepEqual([...exifKinds(Buffer.from('nonsense'))], ['exif-unparsed']);
});

test('I-270 imagemeta: PNG loses text, XMP, EXIF, time and private chunks; pixels and colour chunks stay, byte for byte', () => {
  const clean = png(10, 10, '', [pngChunk('iCCP', 'profile\0\0x')]);
  const dirty = png(10, 10, 'private', [pngChunk('iCCP', 'profile\0\0x'), pngChunk('tEXt', 'Author\0someone'), pngChunk('zTXt', 'Comment\0\0x'), pngChunk('iTXt', `XML:com.adobe.xmp\0\0\0\0\0${xmp()}`), pngChunk('eXIf', tiff([[0x010f, 0]])), pngChunk('tIME', '1234567')]);
  assert.deepEqual(imageMeta(dirty), { format: 'png', kinds: ['exif-camera', 'icc', 'private-chunk', 'text', 'time', 'xmp'], risky: ['exif-camera', 'private-chunk', 'text', 'time', 'xmp'] });
  const s = stripImage(dirty);
  assert.deepEqual(s.buf, clean);
  assert.deepEqual(s.removed, ['exif-camera', 'private-chunk', 'text', 'time', 'xmp']);
  assert.deepEqual(shipImage(dirty).action, 'stripped');
  assert.deepEqual(shipImage(clean), { ...imageMeta(clean), action: 'clean', buf: clean });
});

test('I-270 imagemeta: GIF loses comments and application blocks but the looping one', () => {
  const loop = gifApp('NETSCAPE2.0', '\x01\x00\x00');
  const dirty = gif([loop, gifComment('by someone'), gifApp('XMP DataXMP', xmp()), gifApp('MAKER 1.0ab', 'x')]);
  assert.deepEqual(imageMeta(dirty).kinds, ['app-ext', 'comment', 'xmp']);
  assert.deepEqual(stripImage(dirty), { buf: gif([loop]), removed: ['app-ext', 'comment', 'xmp'] });
  assert.equal(shipImage(gif([loop])).action, 'clean');
  assert.throws(() => imageMeta(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00\x99', 'latin1')), /unknown GIF block/);
});

test('I-270 imagemeta: JPEG, WebP and AVIF are read only: pixel/colour EXIF and ICC ship, anything else is refused', () => {
  const ok = jpeg([[0xe0, Buffer.from('JFIF\0\x01\x02', 'latin1')], [0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff([[0x0112, 6]])])], [0xe2, Buffer.from('ICC_PROFILE\0x', 'latin1')]]);
  assert.deepEqual(shipImage(ok).action, 'clean');
  assert.deepEqual(imageMeta(ok).kinds, ['exif-pixel', 'icc']);
  const cam = jpeg([[0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff([[0x0110, 0]])])]]);
  assert.deepEqual(shipImage(cam).risky, ['exif-camera']);
  assert.equal(shipImage(cam).action, 'refused');
  assert.deepEqual(imageMeta(jpeg([[0xe1, Buffer.from(`http://ns.adobe.com/xap/1.0/\0${xmp()}`)], [0xfe, Buffer.from('hi')], [0xed, Buffer.from('Photoshop 3.0\0')]])).kinds, ['comment', 'iptc', 'xmp']);
  assert.equal(shipImage(riff([['VP8 ', Buffer.from('pix')]])).action, 'clean', 'a WebP from cwebp -metadata none');
  assert.deepEqual(shipImage(riff([['VP8 ', Buffer.from('pix')], ['XMP ', Buffer.from(xmp())]])).risky, ['xmp']);
  assert.deepEqual(shipImage(riff([['VP8 ', Buffer.from('pix')], ['EXIF', tiff([[0x8825, 0, 4]])]])).risky, ['exif-gps', 'unknown-webp-chunk'], 'an EXIF chunk is refused whatever it holds');
  assert.equal(shipImage(avif()).action, 'clean');
  assert.deepEqual(shipImage(avif(true)).risky, ['xmp'], 'an XMP packet anywhere in the file');
  assert.deepEqual(imageMeta(avifWithExif(tiff([[0x0112, 1]]))).kinds, ['exif-pixel'], 'the Exif item found through iloc');
  assert.deepEqual(shipImage(avifWithExif(tiff([[0x013b, 0]]))).risky, ['exif-owner']);
});

// Fail closed (review of 84658a88): every case below shipped before.
const refused = (buf, opts) => { const r = shipImage(buf, opts); return [r.action, r.risky]; };

test('I-270 imagemeta: bytes this module does not read as a picture are refused, whatever the name says (TIFF, plain bytes)', () => {
  assert.deepEqual(refused(tiff([[0x0112, 1]]), { name: 'out/lead/a.png' }), ['refused', ['not-an-image']], 'a TIFF named .png');
  assert.deepEqual(refused(Buffer.from('plain text'), { name: 'out/lead/b.png' }), ['refused', ['not-an-image']], 'text named .png');
  assert.deepEqual(refused(Buffer.alloc(0)), ['refused', ['not-an-image']], 'an empty file');
});

test('I-270 imagemeta: only the AVIF brands avif/avis are read; HEIF (mif2) and other ftyp brands (MA1B) are refused', () => {
  assert.equal(shipImage(avif(false, 'avis')).action, 'clean');
  assert.deepEqual(refused(avif(false, 'mif2'), { name: 'x.avif' }), ['refused', ['not-an-image']]);
  assert.deepEqual(refused(avif(false, 'MA1B'), { name: 'x.avif' }), ['refused', ['not-an-image']]);
  assert.deepEqual(refused(avif(false, 'heic'), { name: 'x.avif' }), ['refused', ['not-an-image']]);
});

test('I-270 imagemeta: HEIC/HEIF, TIFF, BMP and JPEG XL are refused by name; every picture name goes through the check', () => {
  for (const ext of ['heic', 'heif', 'tif', 'tiff', 'bmp', 'jxl', 'HEIC']) {
    assert.deepEqual(refused(png(1, 1), { name: `out/lead/x.${ext}` }), ['refused', ['format-not-shipped']], ext);
    assert.ok(IMAGE_FILE.test(`out/lead/x.${ext}`), ext);
  }
  for (const ext of ['png', 'gif', 'jpg', 'jpeg', 'avif', 'webp', 'PNG']) assert.ok(IMAGE_FILE.test(`a/x.${ext}`), ext);
  assert.ok(!IMAGE_FILE.test('a/x.json'));
});

test('I-270 imagemeta: a WebP chunk outside VP8/VP8L/VP8X/ALPH/ANIM/ANMF/ICCP, or bytes after the RIFF, is refused', () => {
  const ok = [['VP8X', Buffer.alloc(10)], ['ICCP', Buffer.from('prof')], ['ANIM', Buffer.alloc(6)], ['ANMF', Buffer.alloc(16)], ['ALPH', Buffer.from('a')], ['VP8L', Buffer.from('pix')]];
  assert.equal(shipImage(riff(ok)).action, 'clean');
  assert.deepEqual(refused(riff([...ok, ['abcd', Buffer.from('someone')]])), ['refused', ['unknown-webp-chunk']]);
  assert.deepEqual(refused(riff([['VP8 ', Buffer.from('pix')], ['EXIF', tiff([[0x0112, 1]])]])), ['refused', ['unknown-webp-chunk']], 'even a pixel-only EXIF chunk');
  assert.deepEqual(refused(Buffer.concat([riff([['VP8 ', Buffer.from('pix')]]), Buffer.from('hidden')])), ['refused', ['trailing-data']]);
});

test('I-270 imagemeta: a PNG critical chunk other than IHDR/PLTE/IDAT/IEND is refused (it cannot be dropped safely)', () => {
  assert.deepEqual(refused(png(10, 10, '', [pngChunk('ABCD', 'someone')])), ['refused', ['unknown-critical-chunk']]);
  assert.equal(shipImage(png(10, 10, '', [pngChunk('PLTE', '\0\0\0')])).action, 'clean');
});

test('I-270 imagemeta: JPEG bytes after EOI are refused', () => {
  const ok = jpeg([[0xe0, Buffer.from('JFIF\0\x01\x02', 'latin1')]]);
  assert.equal(shipImage(ok).action, 'clean');
  assert.deepEqual(refused(Buffer.concat([ok, Buffer.from('hidden after the end')])), ['refused', ['trailing-data']]);
});

test('I-270 imagemeta: a JPEG APP0 that is not JFIF is refused', () => {
  assert.deepEqual(refused(jpeg([[0xe0, Buffer.from('NOTE\0someone', 'latin1')]])), ['refused', ['app0-not-jfif']]);
});

test('I-270 imagemeta: a truncated JPEG (no EOI, a segment past the end) is unreadable and refused', () => {
  const ok = jpeg([[0xe0, Buffer.from('JFIF\0\x01\x02', 'latin1')]]);
  assert.deepEqual(refused(ok.subarray(0, ok.length - 2)), ['refused', ['unreadable']], 'no EOI');
  assert.deepEqual(refused(ok.subarray(0, 8)), ['refused', ['unreadable']], 'APP0 runs past the end');
});

test('I-270 imagemeta: an AVIF uuid box (top level or in meta) is refused', () => {
  const uuid = bmffBox('uuid', Buffer.concat([Buffer.alloc(16, 7), Buffer.from('vendor data')]));
  assert.deepEqual(refused(Buffer.concat([avif(), uuid])), ['refused', ['unknown-avif-box', 'uuid-box']], 'at the top level no uuid is allowed either');
  const meta = bmffBox('meta', Buffer.concat([Buffer.alloc(4), uuid]));
  assert.deepEqual(refused(Buffer.concat([avif(), meta])), ['refused', ['unknown-avif-box', 'uuid-box']], 'no uuid among the meta children either');
});

test('I-270 imagemeta: an EXIF block outside the parsed Exif items (an mdat no item names) is refused', () => {
  const stray = bmffBox('mdat', Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff([[0x0112, 1]])]));
  assert.deepEqual(refused(Buffer.concat([avif(), stray])), ['refused', ['exif-unparsed']], 'even pixel-only EXIF');
  assert.equal(shipImage(avifWithExif(tiff([[0x0112, 1]]))).action, 'clean', 'the Exif item itself is read');
  assert.deepEqual(refused(Buffer.concat([avifWithExif(tiff([[0x0112, 1]])), stray])), ['refused', ['exif-unparsed']]);
});

test('I-270 imagemeta: a known value inside a PNG colour profile (iCCP, inflated) is refused; the chunk ships otherwise', () => {
  const iccp = (text) => pngChunk('iCCP', Buffer.concat([Buffer.from('ICC Profile\0\0', 'latin1'), deflateSync(Buffer.from(text, 'latin1'))]));
  const literalHits = (t) => (t.includes('someone-private') ? 1 : 0);
  assert.deepEqual(refused(png(10, 10, '', [iccp('desc made by someone-private on a laptop')]), { literalHits }), ['refused', ['known-value-in-icc']]);
  const fine = png(10, 10, '', [iccp('desc Display P3')]);
  assert.deepEqual([shipImage(fine, { literalHits }).action, shipImage(fine, { literalHits }).buf], ['clean', fine], 'kept byte for byte');
  assert.deepEqual(refused(png(10, 10, '', [pngChunk('iCCP', 'profile\0\0not zlib')]), { literalHits }), ['refused', ['unreadable']], 'a profile that does not inflate');
});

// Follow-up review of 2d711b1c (non-blocking items): every case below shipped there.
test('I-270 imagemeta: AVIF top level is ftyp, meta, mdat and empty or zero-filled free/skip only; anything else is refused', () => {
  assert.equal(shipImage(Buffer.concat([avif(), bmffBox('free', ''), bmffBox('skip', Buffer.alloc(32)), bmffBox('free', Buffer.alloc(3))])).action, 'clean');
  assert.deepEqual(refused(Buffer.concat([avif(), bmffBox('abcd', 'someone')])), ['refused', ['unknown-avif-box']]);
  assert.deepEqual(refused(Buffer.concat([avif(), bmffBox('free', 'someone')])), ['refused', ['unknown-avif-box']], 'a free box with data');
  assert.deepEqual(refused(Buffer.concat([avif(), bmffBox('skip', 'someone')])), ['refused', ['unknown-avif-box']]);
  assert.deepEqual(refused(Buffer.concat([avif(), Buffer.from('hidden after the last box')])), ['refused', ['trailing-data']]);
});

test('I-270 imagemeta: a GIF plain-text block (text drawn over the picture) is dropped like a comment', () => {
  const plain = Buffer.concat([Buffer.from([0x21, 0x01, 12]), Buffer.alloc(12), Buffer.from([7]), Buffer.from('someone', 'latin1'), Buffer.from([0])]);
  const loop = gifApp('NETSCAPE2.0', '\x01\x00\x00');
  assert.deepEqual(imageMeta(gif([loop, plain])).kinds, ['plain-text']);
  assert.deepEqual(stripImage(gif([loop, plain])), { buf: gif([loop]), removed: ['plain-text'] });
  assert.equal(shipImage(gif([loop, plain])).action, 'stripped');
});

test('I-270 imagemeta: a known value in a colour profile is found as UTF-16 (BE and LE) too, in PNG, JPEG, WebP and AVIF profiles', () => {
  const literalHits = (t) => (t.toLowerCase().includes('someone-private') ? 1 : 0);
  const be = Buffer.from('desc mluc enUS someone-private', 'utf16le').swap16(), le = Buffer.from('desc someone-private', 'utf16le');
  const icc = (text) => Buffer.concat([Buffer.alloc(9), text]); // odd offset: the scan reads both byte alignments
  const iccp = (b) => pngChunk('iCCP', Buffer.concat([Buffer.from('ICC Profile\0\0', 'latin1'), deflateSync(b)]));
  const app2 = (b) => [0xe2, Buffer.concat([Buffer.from('ICC_PROFILE\0\x01\x01', 'latin1'), b])];
  const colr = (b) => bmffBox('meta', Buffer.concat([Buffer.alloc(4), bmffBox('iprp', bmffBox('ipco', bmffBox('colr', Buffer.concat([Buffer.from('prof'), b]))))]));
  const withProfile = {
    png: (b) => png(10, 10, '', [iccp(b)]),
    jpeg: (b) => jpeg([[0xe0, Buffer.from('JFIF\0\x01\x02', 'latin1')], app2(b)]),
    webp: (b) => riff([['VP8X', Buffer.alloc(10)], ['ICCP', b], ['VP8 ', Buffer.from('pix')]]),
    avif: (b) => Buffer.concat([avif().subarray(0, 24), colr(b), bmffBox('mdat', 'pixels')]),
  };
  for (const [format, make] of Object.entries(withProfile)) {
    assert.equal(shipImage(make(icc(Buffer.from('desc Display P3', 'utf16le').swap16())), { literalHits }).action, 'clean', format);
    for (const [name, text] of [['UTF-16BE', be], ['UTF-16LE', le], ['UTF-16BE at an odd offset', icc(be)], ['latin1', Buffer.from('cprt someone-private')]]) {
      assert.deepEqual(refused(make(text), { literalHits }), ['refused', ['known-value-in-icc']], `${format} ${name}`);
    }
  }
});

// Second review (89c1255d): each case below shipped there.
test('I-270 imagemeta: an AVIF meta child other than hdlr/pitm/iloc/iinf/iprp/iref/idat/dinf/grpl is refused; an xml box only as XMP', () => {
  const meta = (...kids) => bmffBox('meta', Buffer.concat([Buffer.alloc(4), ...kids]));
  const ok = ['hdlr', 'pitm', 'iloc', 'iinf', 'iprp', 'iref', 'idat', 'dinf', 'grpl'].map((t) => bmffBox(t, Buffer.alloc(8)));
  assert.equal(shipImage(Buffer.concat([avif().subarray(0, 24), meta(...ok), bmffBox('mdat', 'pixels')])).action, 'clean');
  for (const t of ['abcd', 'free', 'xml ', 'ipro']) {
    assert.deepEqual(refused(Buffer.concat([avif().subarray(0, 24), meta(...ok, bmffBox(t, 'someone')), bmffBox('mdat', 'pixels')])), ['refused', ['unknown-avif-box']], t);
  }
  assert.deepEqual(refused(avif(true)), ['refused', ['xmp']], 'an xml box holding XMP: refused as xmp');
});

test('I-270 imagemeta: JPEG fill bytes (0xFF 0xFF) before a marker do not hide an ICC profile from the known-value scan', () => {
  const literalHits = (t) => (t.toLowerCase().includes('someone-private') ? 1 : 0);
  const icc = Buffer.concat([Buffer.from('ICC_PROFILE\0\x01\x01', 'latin1'), Buffer.from('desc someone-private', 'utf16le').swap16()]);
  const seg = (m, data) => { const h = Buffer.from([0xff, m, 0, 0]); h.writeUInt16BE(data.length + 2, 2); return Buffer.concat([h, data]); };
  const filled = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from('JFIF\0\x01\x02', 'latin1')), Buffer.from([0xff, 0xff, 0xff]), seg(0xe2, icc), Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
  assert.deepEqual(imageMeta(filled).kinds, ['icc'], 'jpegKinds reads past the fill');
  assert.deepEqual(refused(filled, { literalHits }), ['refused', ['known-value-in-icc']]);
});

// Pictures embedded in text files (the shipped out/lead/medium-copy.html pages hold 23).
test('I-270 imagemeta: dataImages finds data:image/...;base64 pictures in a text, numbered, with the base64 run; a run that does not decode is null', () => {
  const p = png(2, 2), g = gif([]);
  const text = `<img src="data:image/png;base64,${p.toString('base64')}"> css: url(data:image/GIF;charset=utf-8;base64,${g.toString('base64')}) `
    + `<img src="data:image/png;base64,abc"> <img src="data:image/jpeg;base64,"> <img src="data:image/svg+xml,%3Csvg%3E">`;
  const d = dataImages(text);
  assert.deepEqual(d.map((x) => [x.n, x.kind, x.mime, x.buf && x.buf.length]), [[1, 'base64', 'image/png', p.length], [2, 'base64', 'image/gif', g.length], [3, 'base64', 'image/png', null], [4, 'base64', 'image/jpeg', null], [5, 'svg-text', 'image/svg+xml', undefined]], 'a plain (not base64) SVG URI: its decoded text');
  assert.equal(text.slice(d[0].start, d[0].end), p.toString('base64'));
  assert.deepEqual(d[1].buf, g);
  assert.deepEqual(dataImages('data:image/png;base64,YWI=')[0].buf, Buffer.from('ab'), 'padded run decodes');
  for (const bad of ['YWI', 'YW=I', 'YWJ=']) assert.equal(dataImages(`data:image/png;base64,${bad}`)[0].buf, null, `${bad}: missing padding, padding inside, not canonical`);
  assert.deepEqual(dataImages('no pictures here'), []);
});

// Review of 3bb11931: every data: URI that may hold a picture is parsed or refused (fail closed).
const verdicts = (text, literalHits = null) => dataImages(text).map((d) => { const v = dataUriVerdict(d, { name: `t#data-${d.n}`, literalHits }); return [d.n, d.kind, v.action, v.kinds]; });

test('I-270 imagemeta: JSON-escaped data URIs (data:image\\/png;base64,... with \\/ in the run) are parsed, checked and written back escaped', () => {
  let buf = png(10, 10, '', [pngChunk('tEXt', 'Author\0someone')]), i = 0;
  while (!buf.toString('base64').includes('/')) buf = png(10, 10 + ++i, '', [pngChunk('tEXt', 'Author\0someone')]); // a run with a slash in it
  // JSON.stringify leaves / alone; PHP's json_encode and others write \/
  const escaped = JSON.stringify({ src: `data:image/png;base64,${buf.toString('base64')}` }).replace(/\//g, '\\/');
  const [d] = dataImages(escaped);
  assert.deepEqual([d.kind, d.escaped, d.buf && d.buf.equals(buf)], ['base64', true, true]);
  const v = dataUriVerdict(d, { name: 'x#data-1' });
  assert.deepEqual([v.action, v.kinds], ['stripped', ['text']]);
  const back = escaped.slice(0, d.start) + dataRun(d, v.buf) + escaped.slice(d.end);
  assert.deepEqual(Buffer.from(JSON.parse(back).src.split(',')[1], 'base64'), png(10, 10 + i), 'still valid JSON, the stripped picture inside');
});

test('I-270 imagemeta: every "data:image" (any case, \\/ too) that no parsed URI covers is refused as unparsed-data-uri', () => {
  assert.deepEqual(verdicts('<img src="data:image/png; charset=x;base64,AAAA"> <img src="data:image/png;a=%20;base64,AAAA"> <img src=\'data:image/png;"q";base64,AAAA\'> DATA:IMAGE\\/PNG ok'),
    [[1, 'unparsed', 'refused', ['unparsed-data-uri']], [2, 'unparsed', 'refused', ['unparsed-data-uri']], [3, 'unparsed', 'refused', ['unparsed-data-uri']], [4, 'unparsed', 'refused', ['unparsed-data-uri']]]);
  assert.deepEqual(verdicts(`DATA:IMAGE/PNG;BASE64,${png(2, 2).toString('base64')}`), [[1, 'base64', 'clean', []]], 'any case');
});

test('I-270 imagemeta: a non-base64 SVG data URI is percent-decoded and literal-scanned: a known value refuses it', () => {
  const literalHits = (t) => (t.includes('someone-private') ? 1 : 0);
  const css = (svg) => `.a{background:url("data:image/svg+xml,${encodeURIComponent(svg).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%27/g, "'")}") no-repeat}`;
  assert.deepEqual(verdicts(css("<svg viewBox='0 0 2 2'><filter id='n'/></svg>"), literalHits), [[1, 'svg-text', 'clean', []]], 'the snapshot CSS kind of URI passes');
  assert.deepEqual(verdicts(css("<svg><text>someone-private</text></svg>"), literalHits), [[1, 'svg-text', 'refused', ['known-value-in-svg']]]);
  assert.deepEqual(verdicts('url("data:image/svg+xml,%3Csvg%3E%E0%A4%A%3C/svg%3E")', literalHits), [[1, 'svg-text', 'refused', ['undecodable-data-uri']]], 'bad percent-encoding');
});

test('I-270 imagemeta: any other non-base64 image URI is refused; an octet-stream base64 run that decodes to a picture is refused', () => {
  assert.deepEqual(verdicts('<img src="data:image/png,%89PNG%0D%0A">'), [[1, 'other', 'refused', ['non-base64-data-uri']]]);
  assert.deepEqual(verdicts(`<a href="data:application/octet-stream;base64,${png(4, 4).toString('base64')}">`), [[1, 'octet', 'refused', ['picture-as-octet-stream']]]);
  assert.deepEqual(verdicts(`<a href="data:application\\/octet-stream;base64,${Buffer.from('just bytes').toString('base64')}">`), [[1, 'octet', 'ignore', []]], 'not a picture: no concern of this check');
});

test('I-270 imagemeta: a base64 run wrapped by \\r, \\n or \\t (raw or escaped) is undecodable', () => {
  const b = png(2, 2).toString('base64'), half = b.length - (b.length % 8) - 8;
  for (const sep of ['\n', '\r\n', '\t', '\\n', '\\r\\n']) {
    assert.deepEqual(verdicts(`data:image/png;base64,${b.slice(0, half)}${sep}${b.slice(half)}`)[0], [1, 'base64', 'refused', ['undecodable-data-uri']], JSON.stringify(sep));
  }
});

test('I-270 imagemeta: videoMeta reads an MP4 without re-muxing: the encoder tag is benign, any other tag, a date or a uuid is not', () => {
  const box = (t, ...kids) => bmffBox(t, Buffer.concat(kids.map((k) => Buffer.from(k))));
  const mvhd = (ctime) => { const b = Buffer.alloc(100); b.writeUInt32BE(ctime, 4); return box('mvhd', b); };
  const ilst = (...items) => box('udta', box('meta', Buffer.alloc(4), box('hdlr', Buffer.alloc(25)), box('ilst', ...items)));
  const tag = (k, v) => box(k, box('data', Buffer.alloc(8), v));
  const mp4 = (...moov) => Buffer.concat([box('ftyp', 'isom\0\0\x02\0isomiso2mp41'), box('moov', ...moov), box('mdat', 'frames')]);
  assert.deepEqual(videoMeta(mp4(mvhd(0), ilst(tag('\xa9too', 'Lavf62.3.100')))), { kinds: ['encoder'], risky: [] });
  assert.deepEqual(videoMeta(mp4(mvhd(0), ilst(tag('\xa9too', 'Lavf'), tag('\xa9xyz', '+13.7+100.5/')))).risky, ['video-tag']);
  assert.deepEqual(videoMeta(mp4(mvhd(3900000000))).risky, ['video-date']);
  assert.deepEqual(videoMeta(mp4(mvhd(0), box('uuid', Buffer.alloc(20)))).risky, ['uuid-box']);
  assert.deepEqual(videoMeta(Buffer.from('not a video')).risky, ['unreadable']);
});

test('I-270 imagemeta: sniffMedia finds a picture or video by its magic bytes, whatever its name; HEIC/TIFF/JXL bytes are refused', () => {
  const ftyp = (brand) => bmffBox('ftyp', Buffer.from(`${brand}\0\0\0\0${brand}`, 'latin1'));
  assert.equal(sniffMedia(png(4, 4)), 'png');
  assert.equal(sniffMedia(gif()), 'gif');
  assert.equal(sniffMedia(jpeg([])), 'jpeg');
  assert.equal(sniffMedia(riff([['VP8 ', Buffer.alloc(10)]])), 'webp');
  assert.equal(sniffMedia(avif()), 'avif');
  assert.equal(sniffMedia(Buffer.concat([ftyp('heic'), bmffBox('mdat', 'x')])), 'heic');
  assert.equal(sniffMedia(Buffer.concat([ftyp('isom'), bmffBox('mdat', 'x')])), 'video');
  assert.equal(sniffMedia(tiff([[0x0100, 4]])), 'tiff');
  assert.equal(sniffMedia(Buffer.from([0xff, 0x0a, 0xfa, 0x1f])), 'jxl');
  for (const t of ['plain text', '{"a": 1}', '', 'GIF']) assert.equal(sniffMedia(Buffer.from(t)), null, t);
  for (const b of [Buffer.concat([ftyp('heic'), bmffBox('mdat', 'x')]), tiff([[0x0100, 4]])]) assert.equal(shipImage(b, { name: 'notes.bin' }).action, 'refused');
});
