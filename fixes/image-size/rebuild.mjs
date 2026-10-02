// Rebuild the image-size overlay from the baseline snapshot, byte for byte, from manifest.json (fix-image-size).
// patch.diff can't carry the image bytes (Fastwork-derived binaries stay out of git, I-067), so this script plus the
// manifest are the fix: per file, sips resize at the recorded size and JPEG quality, then for JPEG a lossless
// jpegtran Huffman pass, for PNG a strip of the chunk types sips adds (gAMA, cHRM, eXIf, iTXt) that the source lacks.
// Every output is checked against the manifest's sha256 (exit 1 on any mismatch).
//   node fixes/image-size/rebuild.mjs [outDir]     default outDir: fixes/image-size/overlay
// Needs macOS sips, and jpegtran + djpeg (libjpeg-turbo) on PATH; the manifest records the versions used.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTree } from '../../tools/lib/paths.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const man = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'));
const outDir = resolve(process.argv[2] || join(here, 'overlay'));
const root = resolveTree('site-pretty');
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const chunks = (b) => { const o = []; for (let i = 8; i < b.length;) { const l = b.readUInt32BE(i); o.push({ t: b.toString('latin1', i + 4, i + 8), buf: b.subarray(i, i + 12 + l) }); i += 12 + l; } return o; };
let bad = 0;
for (const f of man.files) {
  const src = join(root, f.path), dst = join(outDir, f.path);
  if (sha(src) !== f.sha256Before) { console.log(`BASELINE-DIFFERS ${f.path}`); bad++; continue; }
  mkdirSync(dirname(dst), { recursive: true });
  const jpeg = f.format !== 'png';
  execFileSync('sips', ['-z', String(f.natAfter[1]), String(f.natAfter[0]), '-s', 'format', jpeg ? 'jpeg' : 'png', ...(jpeg ? ['-s', 'formatOptions', String(f.quality)] : []), src, '--out', dst], { stdio: 'ignore' });
  if (jpeg) {
    execFileSync('jpegtran', ['-copy', 'all', '-optimize', '-outfile', dst + '.tmp', dst]);
    renameSync(dst + '.tmp', dst);
  } else {
    const keep = new Set(chunks(readFileSync(src)).map((c) => c.t).concat(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']));
    const cs = chunks(readFileSync(dst));
    writeFileSync(dst, Buffer.concat([readFileSync(dst).subarray(0, 8), ...cs.filter((c) => keep.has(c.t)).map((c) => c.buf)]));
  }
  const got = sha(dst);
  if (got !== f.sha256After) { console.log(`MISMATCH ${f.path} ${got}`); bad++; }
}
console.log(`${man.files.length - bad} of ${man.files.length} files rebuilt byte-identical into ${outDir}`);
process.exit(bad ? 1 : 0);
