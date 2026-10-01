// Fake screenshots and recordings for the proposal tests (ts-proposals): real, decodable PNGs of one colour (with an
// optional stripe, so A and B differ), and byte heads that sniff as MP4 / WebM. Nothing derived from Fastwork.
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/** A w x h RGB PNG filled with `rgb`, with a horizontal `stripe` colour band in the middle third if given. */
export function pngBytes(w = 8, h = 6, rgb = [200, 60, 60], stripe = null) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    const c = stripe && y >= h / 3 && y < (2 * h) / 3 ? stripe : rgb;
    for (let x = 0; x < w; x++) { row[1 + x * 3] = c[0]; row[2 + x * 3] = c[1]; row[3 + x * 3] = c[2]; }
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

/** The head of an ISO-BMFF file ("ftyp" box, brand isom): sniffs as MP4. Not playable. */
export const mp4Bytes = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(12), Buffer.alloc(64, 1)]);
/** An EBML head: sniffs as WebM. */
export const webmBytes = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60, 2)]);

export function writePng(file, ...a) { writeFileSync(file, pngBytes(...a)); return file; }
export function writeMp4(file) { writeFileSync(file, mp4Bytes()); return file; }
