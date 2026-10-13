// pictures.mjs: the proposal pictures and videos for the public release (I-270, memory/public-release.md). Re-encodes
// every console/proposals/**/*.png to WebP with cwebp (-metadata none: no EXIF, XMP or ICC text), copies the MP4s
// without their container metadata (ffmpeg -map_metadata -1 -c copy), and writes an image review sheet for the human
// check.
//
//   node tools/release/pictures.mjs --out <dir> [--state <dir>] [--out-root <dir> [--source <repo>]]
//                                   [--known <file>] [--quality 85] [--lossless] [--sheet <file>] [--jobs N]
//
//   --out       media tree root; files land in <out>/console/proposals/PR-NNN/<name>.webp|.mp4 (the release paths)
//   --out-root  also list the out/ media and data pack.mjs ships (their images and videos) on the sheet; out/lead,
//               out/tryit and out/article as far as --source's committed write-ups (default: this repo's main checkout) cite them
//   --sheet     the review sheet (default <out>/../review-sheet.md; never inside --out, which is packed)
//   --quality   cwebp -q (default 85); --lossless uses cwebp -lossless instead
//   --jobs      parallel encoder/OCR processes (default: cores - 1, at most 4)
//
// Review sheet: every picture and video the release ships, except Chrome's 430x932 viewport shots (no system UI), may
// show a status bar, a clock, a network or device name: each is listed for review. When tesseract is installed it reads
// each listed PNG, GIF and JPEG locally and the sheet names the kind of hit: time-like text, IP-like text, "iPhone",
// Wi-Fi, a known literal; never the text itself (no tesseract: a WARN line, and the sheet says so). Its metadata column
// names what each picture carries and what pack.mjs does with it (imagemeta.mjs). Identical pictures are encoded and
// read once. --out and --sheet must
// be outside this repo (exit 2). $FW_CWEBP / $FW_TESSERACT / $FW_FFMPEG name other binaries (tests use fakes).
import { exitOnHelp } from '../lib/help.mjs';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync, renameSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { loadKnown, buildRules, scanText } from './rules.mjs';
import { parseArgs, knownFile, isDir, isText, sha256Buf, pool, isVideo, stripVideo, refuseInside, show } from './release-util.mjs';
import { outFiles, citedOutPaths } from './pack.mjs';
import { imageMeta, shipImage, IMAGE_FILE, dataImages, dataUriVerdict } from './imagemeta.mjs';

exitOnHelp(import.meta.url);

/** Every picture gets a review except Chrome's 430x932 viewport shots (no system UI). */
export const isReviewSize = (w, h) => !(w === 430 && h === 932);

/** Width and height of a PNG (IHDR). */
export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

/** Kinds of hit in OCR text (never the text): time-like, ip-like, iphone, wifi, known-literal. */
export function ocrKinds(text, literals = []) {
  const kinds = [];
  if (/(^|[^\d])([01]?\d|2[0-3]):[0-5]\d(?!\d)/.test(text)) kinds.push('time-like');
  if (/(^|[^\d.])\d{1,3}(\.\d{1,3}){3}(?![\d.])/.test(text)) kinds.push('ip-like');
  if (/i\s?phone/i.test(text)) kinds.push('iphone');
  if (/\bwi[\s-]?fi\b/i.test(text)) kinds.push('wifi');
  const low = text.toLowerCase(), flat = low.replace(/\s+/g, '');
  if (literals.some((v) => v.length >= 3 && (low.includes(v.toLowerCase()) || flat.includes(v.toLowerCase().replace(/\s+/g, ''))))) kinds.push('known-literal');
  return kinds;
}

function runBin(bin, args) {
  return new Promise((res) => {
    const c = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (err += d));
    c.on('error', (e) => res({ code: -1, out, err: e.message }));
    c.on('exit', (code) => res({ code, out, err }));
  });
}
const binOk = (bin, flag) => { const r = spawnSync(bin, [flag], { encoding: 'utf8' }); return r.status === 0; };

/** Width and height of a GIF (logical screen), else null. */
export function gifSize(buf) {
  return buf.length >= 10 && /^GIF8[79]a$/.test(buf.toString('latin1', 0, 6)) ? [buf.readUInt16LE(6), buf.readUInt16LE(8)] : null;
}
const OCR_FORMATS = /\.(png|gif|jpe?g)$/i;

/**
 * Encode the pictures, strip the videos, write the review sheet. With `outRoot`, the out/ media and data that pack.mjs
 * ships are listed too (and their PNG/GIF/JPEG read by OCR), pictures embedded in their text files as <file>#data-N;
 * `extra` ([{path, buf, video}]) adds rows for pictures from elsewhere (build.mjs: the release's git history). Returns {pictures, distinct, videos, skipped, bytesIn,
 * bytesOut, ocr:'tesseract'|null, flagged:[{path, size:[w,h]|null, kinds|null, note}], sheet}.
 */
export async function encodePictures({ state, out, sheet, outRoot, cited = new Set(), rules = [], quality = 85, lossless = false, jobs, extra = [] }) {
  const src = join(state, 'console', 'proposals');
  const cwebp = process.env.FW_CWEBP || 'cwebp';
  const tess = process.env.FW_TESSERACT || 'tesseract';
  if (!binOk(cwebp, '-version')) throw new Error(`cwebp not found (${cwebp}): brew install webp`);
  const ocr = binOk(tess, '--version') ? tess : null;
  if (!ocr) console.log(`WARN tesseract not found (${show(tess, rules)}): no OCR, the review sheet says "OCR not run"; read every picture yourself (brew install tesseract)`);
  jobs = Number(jobs) || Math.max(1, Math.min(4, (os.availableParallelism?.() || os.cpus().length) - 1));
  const literals = rules.filter((r) => r.kind === 'literal' && typeof r.match === 'string').map((r) => r.match);
  const items = [], flagged = [];
  let videos = 0, skipped = 0;
  if (isDir(src)) for (const pr of readdirSync(src).filter((d) => /^PR-\d+$/.test(d) && isDir(join(src, d))).sort()) {
    for (const f of readdirSync(join(src, pr)).sort()) {
      const from = join(src, pr, f);
      const rel = `console/proposals/${pr}/${f}`;
      if (/\.png$/i.test(f)) items.push({ from, rel: rel.replace(/\.png$/i, '.webp') });
      else if (/\.mp4$/i.test(f)) {
        mkdirSync(join(out, 'console', 'proposals', pr), { recursive: true });
        stripVideo(from, join(out, rel));
        videos++;
        flagged.push({ path: rel, size: null, kinds: null, note: 'video: watch it', meta: 'container metadata stripped' });
      } else skipped++;
    }
  }
  const byHash = new Map();
  let bytesIn = 0, bytesOut = 0;
  for (const it of items) {
    const buf = readFileSync(it.from);
    bytesIn += buf.length;
    it.size = pngSize(buf);
    it.hash = sha256Buf(buf);
    if (!byHash.has(it.hash)) byHash.set(it.hash, { from: it.from, size: it.size, review: isReviewSize(...it.size) });
  }
  const tmp = join(out, '.encode');
  mkdirSync(tmp, { recursive: true });
  const qargs = lossless ? ['-lossless'] : ['-q', String(quality)];
  const read = async (file) => { const o = await runBin(ocr, [file, 'stdout']); return o.code === 0 ? ocrKinds(o.out, literals) : ['ocr-failed']; };
  await pool([...byHash], jobs, async ([hash, u]) => {
    const dest = join(tmp, `${hash}.webp`);
    const r = await runBin(cwebp, ['-quiet', '-metadata', 'none', ...qargs, u.from, '-o', dest]);
    let head = null;
    try { head = readFileSync(dest).subarray(0, 12); } catch {}
    if (r.code !== 0 || !head || head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WEBP') throw new Error(`cwebp failed for ${u.from.slice(src.length + 1)} (exit ${r.code})`);
    u.webp = dest;
    if (u.review && ocr) u.kinds = await read(u.from);
  });
  for (const it of items) {
    const u = byHash.get(it.hash);
    const dest = join(out, it.rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(u.webp, dest);
    bytesOut += statSync(dest).size;
    u.meta ??= imageMeta(readFileSync(dest)).kinds.join(', ') || 'none';
    if (u.review) flagged.push({ path: it.rel, size: it.size, kinds: ocr ? u.kinds : null, meta: u.meta });
  }
  rmSync(tmp, { recursive: true, force: true });
  // the out/ files pack.mjs ships: every image and video is listed; PNG/GIF/JPEG get OCR. Pictures embedded in shipped
  // text files as data: URIs get a row each, <file>#data-N, and so do the clean pictures of the release's git history
  // (`extra`, build.mjs: git:<path>@<blob>[#data-N]); those are read from temp copies (OCR needs a file).
  const literalHits = (text) => scanText(text, rules, { literalsOnly: true, allow: [] }).length;
  const dataDir = join(out, '.data-uri');
  const copies = [];
  const copy = (path, buf, video = false) => {
    if (video) return { path, video: true };
    let fmt = null;
    try { fmt = imageMeta(buf).format; } catch {}
    mkdirSync(dataDir, { recursive: true });
    const file = join(dataDir, `${copies.length}.${fmt === 'jpeg' ? 'jpg' : fmt || 'bin'}`);
    writeFileSync(file, buf);
    copies.push(file);
    return { path, file };
  };
  const queue = [];
  let outListed = 0;
  if (outRoot && isDir(outRoot)) {
    const { media, data } = outFiles(outRoot, { cited });
    queue.push(...[...media, ...data].filter((f) => IMAGE_FILE.test(f) || isVideo(f)).map((rel) => ({ path: rel, file: join(outRoot, rel.slice(4)), video: isVideo(rel) })));
    for (const rel of [...media, ...data].filter((f) => !IMAGE_FILE.test(f) && !isVideo(f))) {
      const b = readFileSync(join(outRoot, rel.slice(4)));
      if (!isText(b)) continue;
      for (const d of dataImages(b.toString('utf8'))) {
        const path = `${rel}#data-${d.n}`;
        const v = dataUriVerdict(d, { name: path, literalHits });
        if (v.action === 'ignore') continue;
        if (d.kind === 'base64' && d.buf) queue.push(copy(path, d.buf));
        else queue.push({ path, note: d.kind === 'svg-text' ? 'SVG text: look at it' : d.why === 'undecodable-data-uri' ? 'data: URI does not decode' : 'not a picture this reads', meta: v.action === 'refused' ? `**refused** (${v.kinds.join(', ')})` : 'no known value in its text' });
      }
    }
    outListed = queue.length;
  }
  for (const x of extra) queue.push(copy(x.path, x.buf, x.video));
  const rows = await pool(queue, jobs, async (item) => {
    const rel = item.path;
    if (item.note) return { path: rel, size: null, kinds: null, note: item.note, meta: item.meta };
    if (item.video) return { path: rel, size: null, kinds: null, note: 'video: watch it', meta: rel.startsWith('git:') ? 'in git history: no tags beyond the encoder' : 'container metadata stripped' };
    const buf = readFileSync(item.file);
    let size = null;
    try { size = pngSize(buf); } catch { size = gifSize(buf); }
    // what pack.mjs will do with its metadata (imagemeta.mjs): stripped, refused, or nothing to do
    let meta;
    try { const m = shipImage(buf, { name: rel.replace(/#data-\d+$/, ''), literalHits }); meta = m.kinds.length ? `${m.action === 'refused' ? `**refused** (${m.risky.join(', ')}): ` : m.action === 'stripped' ? 'stripped: ' : ''}${m.kinds.join(', ')}` : 'none'; } catch (e) { meta = `unreadable (${e.message})`; }
    if (size && size[0] === 430 && size[1] === 932 && meta === 'none') return null;
    if (!OCR_FORMATS.test(item.file)) return { path: rel, size, kinds: null, note: 'no OCR for this format: look at it', meta };
    return { path: rel, size, kinds: ocr ? await read(item.file) : null, meta };
  });
  rmSync(dataDir, { recursive: true, force: true });
  flagged.push(...rows.filter(Boolean));
  sheet = sheet || join(dirname(resolve(out)), 'review-sheet.md');
  const kindsCell = (f) => (f.note ? f.note : f.kinds === null ? 'OCR not run' : f.kinds.length ? f.kinds.join(', ') : 'none found');
  const row = (f) => `| ${f.path} | ${f.size ? f.size.join('x') : ''} | ${kindsCell(f)} | ${f.meta ?? ''} |`;
  const hitsFirst = [...flagged].sort((a, b) => (b.kinds?.length || 0) - (a.kinds?.length || 0) || a.path.localeCompare(b.path));
  const text = `# Image review sheet\n\n`
    + `Every picture and video the release ships except Chrome's 430x932 viewport shots (no system UI) may show a status bar, a clock, `
    + `a network or device name. Look at every one before the release; the rows with an OCR hit first.\n\n`
    + `OCR: ${ocr ? 'tesseract, run locally on PNG, GIF and JPEG; the column names the kind of text found, never the text' : 'not run (tesseract not installed): read every image'}.\n\n`
    + `- proposal pictures: ${items.length} PNG re-encoded to WebP (${lossless ? 'lossless' : `quality ${quality}`}, metadata none), ${byHash.size} distinct\n`
    + `- proposal videos: ${videos} MP4, container metadata stripped\n`
    + (outRoot ? `- out/ media and data: ${outListed} images and videos (pictures embedded in text files as data: URIs as <file>#data-N)\n` : '')
    + (extra.length ? `- release git history: ${extra.length} pictures, videos and data: URI pictures (git:<path>@<blob>[#data-N]), nothing to strip\n` : '')
    + `- listed for review: ${flagged.length}${ocr ? `, with an OCR hit: ${flagged.filter((f) => f.kinds?.length).length}` : ''}\n\n`
    + `Metadata: what the file carries and what the release does with it (PNG/GIF stripped losslessly; another format with more than `
    + `pixel/colour data is refused); kinds only, never values.\n\n`
    + `| file | size | OCR hit kinds | metadata |\n|---|---|---|---|\n${hitsFirst.map(row).join('\n')}\n`;
  mkdirSync(dirname(sheet), { recursive: true });
  writeFileSync(sheet + '.tmp', text);
  renameSync(sheet + '.tmp', sheet);
  return { pictures: items.length, distinct: byHash.size, videos, skipped, bytesIn, bytesOut, ocr: ocr ? 'tesseract' : null, flagged, sheet };
}

let RULES = null;
async function main() {
  const a = parseArgs(process.argv.slice(2), { booleans: ['lossless'] });
  if (!a.out) { console.error('usage: pictures.mjs --out <dir> [--state <dir>] [--out-root <dir> [--source <repo>]] [--known <file>] [--quality 85] [--lossless] [--sheet <file>] [--jobs N]'); process.exit(2); }
  const { sharedStateDir, mainCheckout } = await import('../lib/paths.mjs');
  refuseInside('pictures.mjs', { '--out': a.out, '--sheet': a.sheet }, [mainCheckout()]);
  const rules = RULES = buildRules(loadKnown(knownFile(a)));
  const q = a.quality === undefined ? 85 : Number(a.quality);
  if (!(q >= 0 && q <= 100)) { console.error('--quality must be 0-100'); process.exit(2); }
  const cited = a['out-root'] ? citedOutPaths({ source: resolve(a.source || mainCheckout()) }) : new Set();
  const r = await encodePictures({ state: resolve(a.state || sharedStateDir()), out: resolve(a.out), sheet: a.sheet && resolve(a.sheet), outRoot: a['out-root'] && resolve(a['out-root']), cited, rules, quality: q, lossless: !!a.lossless, jobs: a.jobs });
  console.log(`PICTURES ${r.pictures} webp (${r.distinct} distinct, ${(r.bytesIn / 1e6).toFixed(1)} MB -> ${(r.bytesOut / 1e6).toFixed(1)} MB), ${r.videos} mp4 -> ${show(resolve(a.out), rules)}`);
  console.log(`REVIEW ${r.flagged.length} listed, OCR ${r.ocr || 'not run'} -> ${show(r.sheet, rules)}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`pictures: ${show(e.message, RULES)}`); process.exit(1); });
