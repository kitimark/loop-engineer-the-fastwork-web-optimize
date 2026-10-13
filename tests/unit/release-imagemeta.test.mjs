// I-270 review: picture metadata in the public release (tools/release/imagemeta.mjs). Every fixture picture is built
// here at run time; made-up values only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { imageMeta, stripImage, shipImage, exifKinds, IMAGE_FILE } from '../../tools/release/imagemeta.mjs';
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
  assert.equal(shipImage(png(10, 10, '', [pngChunk('PLTE', '   ')])).action, 'clean');
});

test('I-270 imagemeta: JPEG bytes after EOI are refused', () => {
  const ok = jpeg([[0xe0, Buffer.from('JFIF ', 'latin1')]]);
  assert.equal(shipImage(ok).action, 'clean');
  assert.deepEqual(refused(Buffer.concat([ok, Buffer.from('hidden after the end')])), ['refused', ['trailing-data']]);
});

test('I-270 imagemeta: a JPEG APP0 that is not JFIF is refused', () => {
  assert.deepEqual(refused(jpeg([[0xe0, Buffer.from('NOTE someone', 'latin1')]])), ['refused', ['app0-not-jfif']]);
});

test('I-270 imagemeta: a truncated JPEG (no EOI, a segment past the end) is unreadable and refused', () => {
  const ok = jpeg([[0xe0, Buffer.from('JFIF ', 'latin1')]]);
  assert.deepEqual(refused(ok.subarray(0, ok.length - 2)), ['refused', ['unreadable']], 'no EOI');
  assert.deepEqual(refused(ok.subarray(0, 8)), ['refused', ['unreadable']], 'APP0 runs past the end');
});

test('I-270 imagemeta: an AVIF uuid box (top level or in meta) is refused', () => {
  const uuid = bmffBox('uuid', Buffer.concat([Buffer.alloc(16, 7), Buffer.from('vendor data')]));
  assert.deepEqual(refused(Buffer.concat([avif(), uuid])), ['refused', ['unknown-avif-box', 'uuid-box']], 'at the top level no uuid is allowed either');
  const meta = bmffBox('meta', Buffer.concat([Buffer.alloc(4), uuid]));
  assert.deepEqual(refused(Buffer.concat([avif(), meta])), ['refused', ['uuid-box']]);
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
