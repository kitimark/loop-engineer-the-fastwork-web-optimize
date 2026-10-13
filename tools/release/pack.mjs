// pack.mjs: pack the public release's GitHub Release files and write their manifest, release-assets.json (I-270,
// memory/public-release.md; `npm run init` in the release repo reads the manifest, I-268).
//
//   node tools/release/pack.mjs --assets <dir> --media <dir> [--source <repo>] [--out-root <dir>] [--known <file>]
//                               [--manifest <file>] [--tag <tag>] [--repo <owner/name>]
//
//   snapshot-<baseline id>.tar.gz  the frozen snapshot: git archive of site/ and site-pretty/ at the source repo's HEAD
//                                  (refused unless both trees are the ones HEAD's baseline.json pins), with every
//                                  secret-shaped value in a text file redacted (rules.mjs redactSecrets; I-270, user
//                                  2026-10-13: third-party keys in vendored code); the manifest lists each such file
//                                  ("redacted": path, rule, originalBlob, redactedBlob), so npm run init and
//                                  tools/lib/baseline.mjs still verify the pin. A removed value is also replaced
//                                  wherever else it stands verbatim (site/ escapes what site-pretty/ quotes). A file
//                                  whose redaction would also take out a known literal, or would break JS/JSON that
//                                  parsed before (node --check), stays as it is (the check then fails the build:
//                                  literals are never redacted and shipped)
//   proposal-media.tar             the --media tree from pictures.mjs (console/proposals/PR-NNN/*.webp|*.mp4)
//   out-media.tar                  out/article-gifs, out/article-video, out/people-blink, as they are, except that the
//                                  MP4/MOV videos lose their container metadata (ffmpeg -map_metadata -1 -c copy)
//   out-data.tar.gz                out/ab, out/iphone-screen/*.json, out/snapshots, and of out/tryit and out/lead only the
//                                  files the committed text cites by path (git grep over HEAD's research/, fixes/,
//                                  memory/, README files; no `..`; a linked included folder is refused); every text
//                                  file scrubbed (rules.mjs scrubAll: known literals in any letter case, then the
//                                  regexes) and listed for a human read, binary files as they are
// Pictures (imagemeta.mjs; every file with a picture name, whatever its bytes): PNG and GIF lose their text, date and
// EXIF chunks/blocks losslessly; a JPEG, AVIF or WebP with XMP, IPTC, a comment, GPS, camera, owner or other non-pixel
// EXIF data, a file that is no picture it reads, HEIC/TIFF/BMP/JPEG XL, and a PNG colour profile with a known value
// are refused: left out, IMAGE-REFUSED, and the build is not ready.
// Tar headers carry no owner (uid/gid 0, no user or group name: they would hold the login name), no xattrs.
// Never packed: out/certs, Chrome profiles, out/archive, out/engines, out/pages-*, out/cf-review, every other out/ entry,
// *.log anywhere, .DS_Store and ._* (AppleDouble) files, key and certificate files, SQLite files (by their first bytes),
// anything named or below a folder named like Cookies or Login Data. Each file must stay under 2 GiB (GitHub's Release
// file limit).
// All assets unpack at the release repo's root ("unpackTo": "."). Defaults: --source this repo's main checkout,
// --out-root <source>/out, --manifest <assets>/release-assets.json, --tag release-<baseline id>. --assets and
// --manifest must be outside this repo and the source repo (exit 2). Output names files, counts and rule ids only,
// never a value; paths print with the home folder as ~.
import { exitOnHelp } from '../lib/help.mjs';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync, lstatSync, renameSync, rmSync, mkdtempSync, openSync, readSync, closeSync, constants } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { loadKnown, buildRules, scrubAll, redactSecrets, scanText, safeText, SECRET_SHAPES } from './rules.mjs';
import { shipImage, IMAGE_FILE } from './imagemeta.mjs';
import { parseArgs, knownFile, MAX_ASSET_BYTES, addHits, tallyToList, walkFiles, isDir, isText, sha256File, tarCreate, isVideo, stripVideo, refuseInside, show } from './release-util.mjs';

exitOnHelp(import.meta.url);

export const OUT_MEDIA = ['article-gifs', 'article-video', 'people-blink'];
// out/lead and out/tryit hold the lead's scratch files (reply drafts, logs) next to the few the write-ups cite: only
// the files the committed text cites by path ship (citedOutPaths)
export const OUT_DATA = [{ dir: 'ab' }, { dir: 'iphone-screen', only: /\.json$/i, why: 'screen recordings and capture logs (only the JSON results ship)' }, { dir: 'snapshots' }, { dir: 'tryit', citedOnly: true }, { dir: 'lead', citedOnly: true }];
export const CITED_ONLY = OUT_DATA.filter((d) => d.citedOnly).map((d) => d.dir);
const NOT_CITED = 'not cited by path in the committed write-ups (out/lead, out/tryit ship only cited files)';
/** out/ entries never packed, with the scrub report's reason; other entries: "not cited by the write-ups". */
export function outReason(name, isDirectory) {
  if (name === 'certs') return 'TLS keys and certificates';
  if (/^chrome-|profile/i.test(name)) return 'Chrome profiles (history, cookies)';
  if (name === 'archive') return 'raw output of old runs, not reviewed';
  if (name === 'engines') return 'browser engine builds (third-party binaries)';
  if (/^pages-/.test(name)) return 'site page builds (published on their own)';
  if (name === 'cf-review') return 'Cloudflare review data';
  if (!isDirectory && /\.log$/i.test(name)) return 'loose logs';
  return 'not in the release include set (not cited by the write-ups)';
}
/** Files inside an included folder that are never packed (._name: AppleDouble forks a copy or restore may bring). */
const skipFile = (rel) => (/(^|\/)(\.DS_Store|\._[^/]*)$/.test(rel) ? 'Finder metadata' : /\.(pem|key|p12|crt|cer|keychain)$/i.test(rel) ? 'key or certificate file'
  : /\.log$/i.test(rel) ? 'log files' : /(^|\/)[^/]*(Cookies|Login Data)[^/]*(\/|$)/i.test(rel) ? 'browser cookie or login stores' : null);
const skipDir = (rel, name) => /^chrome-|-profile$|^Default$/i.test(name);
/** A file whose first bytes say SQLite (browser history, cookies, app stores): never packed, whatever its name. */
const isSqlite = (file) => {
  const b = Buffer.alloc(16);
  let fd;
  try { fd = openSync(file, 'r'); return readSync(fd, b, 0, 16, 0) === 16 && b.toString('latin1') === 'SQLite format 3\0'; } catch { return false; } finally { if (fd !== undefined) closeSync(fd); }
};

const trimCite = (p) => p.replace(/[./]+$/, '');
/** out/lead and out/tryit paths cited in text: "out/lead/x/y.png" (trailing dots and slashes trimmed), at the start of a
 *  word or after ./ and ../ segments (../../out/lead/x.png); not checkout/lead/..., not a worktree's .../out/lead/... */
const CITE_START = '(^|[^A-Za-z0-9_./-])(\\.{1,2}/)*out/';
const CITE_ERE = `${CITE_START}(${CITED_ONLY.join('|')})/[A-Za-z0-9._@+/-]+`; // POSIX ERE for git grep; the same as CITE_RE
export const CITE_RE = new RegExp(CITE_ERE, 'g');
const citeOf = (match) => trimCite(match.replace(/^HEAD:/, '').replace(/^[^A-Za-z0-9_./-]?(\.{1,2}\/)*/, ''));
/**
 * The out/lead and out/tryit paths the committed text cites: `git grep` over HEAD's research/, fixes/, memory/ and
 * README files of the source repo, nothing else (a console thread that names a file does not ship it). A Set of paths
 * as cited, without any `.` or `..` segment; only those that are regular files under out/ ship.
 */
export function citedOutPaths({ source }) {
  const cited = new Set();
  const r = spawnSync('git', ['-C', source, 'grep', '-I', '-h', '-o', '-E', CITE_ERE, 'HEAD', '--', 'research', 'fixes', 'memory', 'README*', ':(glob)**/README*'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`git grep for cited out/ paths failed: ${(r.stderr || '').trim().split('\n')[0]}`);
  for (const l of r.stdout.split('\n').filter(Boolean)) {
    const p = citeOf(l);
    if (!p.split('/').some((x) => x === '..' || x === '.' || x === '')) cited.add(p);
  }
  return cited;
}

/** Any out/ path where CITE_ERE's may start; placeholders matched to be dropped. */
const ANY_CITE_ERE = `${CITE_START}[A-Za-z0-9._@+/<>*{}$-]+`;
/**
 * Every out/ path the committed text cites (the same files as citedOutPaths, any out/ folder), without placeholders
 * (`<topic>`, `*`, `{a,b}`, `$x`) and `.`/`..` segments: a Set.
 */
export function citedOutAll({ source }) {
  const cited = new Set();
  const r = spawnSync('git', ['-C', source, 'grep', '-I', '-h', '-o', '-E', ANY_CITE_ERE, 'HEAD', '--', 'research', 'fixes', 'memory', 'README*', ':(glob)**/README*'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`git grep for cited out/ paths failed: ${(r.stderr || '').trim().split('\n')[0]}`);
  for (const l of r.stdout.split('\n').filter(Boolean)) {
    const p = citeOf(l);
    if (/[<>*{}$]/.test(p) || p === 'out') continue;
    if (!p.split('/').some((x) => x === '..' || x === '.' || x === '')) cited.add(p);
  }
  return cited;
}
/** The out/ folders the release ships from (out-media and out-data include sets, out/lead and out/tryit among them). */
export const SHIPPED_DIRS = [...OUT_MEDIA, ...OUT_DATA.map((d) => d.dir)];
/** A cited path under one of SHIPPED_DIRS (else another checkout's or a never-shipped output). */
export const inShippedDir = (p) => SHIPPED_DIRS.includes(p.split('/')[1]);
/** The cited out/ paths that do not exist under outRoot (no file, folder or link there): a sorted list. */
export function citedMissing(outRoot, cited) {
  return [...cited].filter((p) => { try { lstatSync(join(outRoot, p.slice(4))); return false; } catch { return true; } }).sort();
}

/**
 * The out/ files the release ships, as out/... paths: {media, data, skipped: Map(reason -> count), cited: number of
 * shipped cited files}. Regular files only (links and special files never: npm run init refuses them), minus the
 * never-packed files above; in out/lead and out/tryit only the paths in `cited` (citedOutPaths; none without it).
 */
export function outFiles(outRoot, { cited = new Set() } = {}) {
  const skipped = new Map();
  const skip = (why) => skipped.set(why, (skipped.get(why) || 0) + 1);
  let nCited = 0;
  const pick = (dir, { only, why: onlyWhy, citedOnly } = {}) => {
    // an included folder that is a link could point anywhere (the home folder, another checkout): refused
    let st = null;
    try { st = lstatSync(join(outRoot, dir)); } catch {}
    if (st?.isSymbolicLink()) throw new Error(`out/${dir} is a symbolic link; the release packs real folders only`);
    if (!isDir(join(outRoot, dir))) return [];
    const files = [];
    for (const f of walkFiles(join(outRoot, dir), { skipDir: (rel, name) => { if (!skipDir(rel, name)) return false; skip('Chrome profile folders'); return true; } })) {
      const rel = `out/${dir}/${f}`;
      const why = skipFile(f) || (only && !only.test(f) ? onlyWhy : null) || (citedOnly && !cited.has(rel) ? NOT_CITED : null) || (isSqlite(join(outRoot, dir, f)) ? 'SQLite databases' : null);
      if (why) skip(why); else { files.push(rel); if (citedOnly) nCited++; }
    }
    return files;
  };
  return { media: OUT_MEDIA.flatMap((d) => pick(d)), data: OUT_DATA.flatMap((d) => pick(d.dir, d)), skipped, cited: nCited };
}

function git(cwd, ...args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || '').trim().split('\n')[0]}`);
  return r.stdout.trim();
}

/** The snapshot pin of the source repo's HEAD, checked against HEAD's own trees. */
export function snapshotPin(source) {
  const pin = JSON.parse(git(source, 'show', 'HEAD:baseline.json'));
  if (!pin.snapshot || !pin.trees) throw new Error('HEAD:baseline.json has no snapshot id or trees');
  for (const t of ['site', 'site-pretty']) {
    const have = git(source, 'rev-parse', `HEAD:${t}`);
    if (have !== pin.trees[t]) throw new Error(`BASELINE-MISMATCH: HEAD:${t} is not the tree baseline.json pins`);
  }
  return pin;
}

/**
 * git with no caller config or environment (no filters, attributes or templates, like tools/lib/baseline.mjs): the
 * blob ids must be what the source repo has.
 */
function cleanGit(args, { env = {}, input } = {}) {
  const base = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_ATTR_NOSYSTEM: '1' };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT']) delete base[k];
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.attributesFile=/dev/null', ...args], { encoding: input ? undefined : 'utf8', input, env: { ...base, ...env }, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.find((a) => !a.startsWith('-'))} failed: ${String(r.stderr || '').trim().split('\n')[0]}`);
  return String(r.stdout).trim();
}

/**
 * How a text parses: 'json', 'js' (node --check as a script), 'js-module' (as an ES module), or null. With `only`, only
 * that way is tried.
 */
function syntaxOf(text, work, only = null) {
  const want = (k) => !only || only === k;
  if (want('json')) { try { JSON.parse(Buffer.from(text, 'latin1').toString('utf8')); return 'json'; } catch {} }
  const dir = join(work, 'syntax');
  mkdirSync(dir, { recursive: true });
  for (const [k, ext] of [['js', 'cjs'], ['js-module', 'mjs']]) {
    if (!want(k)) continue;
    const f = join(dir, `check.${ext}`);
    writeFileSync(f, Buffer.from(text, 'latin1'));
    if (spawnSync(process.execPath, ['--check', f], { stdio: 'ignore' }).status === 0) return k;
  }
  return null;
}

/**
 * The snapshot Release file: the pinned site/ and site-pretty/ of the source HEAD, every secret-shaped value in a text
 * file redacted. Without one it is plain `git archive` as before; with some, the redacted blobs go into a throwaway git
 * dir that borrows the source's objects (alternates), so the archive is still git's. A value a shape matched is also
 * replaced wherever else it stands verbatim. Returns {redacted:[{path, rule, count, syntax, originalBlob, redactedBlob}],
 * kept:[{path, rule, why}]} (kept: a known literal inside the secret, or JS/JSON the redaction would break; left as it
 * is, so the check fails the build).
 */
export function packSnapshot({ source, pin, snap, rules, work }) {
  const x = join(work, 'snapshot');
  mkdirSync(x, { recursive: true });
  const raw = join(work, 'snapshot.tar');
  cleanGit(['-C', source, 'archive', '--format=tar', '-o', raw, 'HEAD^{tree}', 'site', 'site-pretty']);
  const ux = spawnSync('tar', ['-xf', raw, '-C', x], { encoding: 'utf8' });
  if (ux.status !== 0) throw new Error(`tar -x of the snapshot failed: ${(ux.stderr || '').trim().split('\n')[0]}`);
  rmSync(raw, { force: true });
  // 1. every secret shape, as redactSecrets replaces it; the values it removed are remembered (in memory only)
  const texts = [], values = new Map(); // value -> rule id
  for (const rel of walkFiles(x)) {
    const buf = readFileSync(join(x, rel));
    if (!isText(buf)) continue;
    const text = buf.toString('latin1'); // byte-exact outside the (ASCII) matches
    const r = redactSecrets(text);
    const hits = new Map(r.hits.map((h) => [h.id, h.count]));
    if (r.hits.length) for (const sh of SECRET_SHAPES.filter((s) => s.id !== 'secret-pem' && hits.has(s.id))) {
      for (const m of text.matchAll(new RegExp(sh.match, 'g'))) {
        const v = sh.id === 'secret-kv' ? m[0].match(/[A-Za-z0-9+/]{24,}={0,2}$/)?.[0] : m[0];
        if (v) values.set(v, sh.id);
      }
    }
    texts.push({ rel, text, out: r.text, hits });
  }
  // 2. the same values wherever else they stand in the snapshot (site/ and site-pretty/ hold the same vendored code,
  // the shapes match only one of them where site/ escapes the quotes)
  for (const t of texts) for (const [v, id] of values) {
    const parts = t.out.split(v);
    if (parts.length > 1) { t.out = parts.join(`[secret omitted: ${id}]`); t.hits.set(id, (t.hits.get(id) || 0) + parts.length - 1); }
  }
  // 3. keep a file as it is when its redaction would take out a known value, or break JS/JSON that parsed before
  const redacted = [], kept = [];
  for (const t of texts.filter((t) => t.out !== t.text)) {
    const rule = [...t.hits.keys()].sort().join(',');
    if (scanText(t.out, rules, { literalsOnly: true, allow: [] }).length < scanText(t.text, rules, { literalsOnly: true, allow: [] }).length) { kept.push({ path: t.rel, rule, why: 'a known value inside it' }); continue; }
    const syntax = syntaxOf(t.text, work);
    if (syntax && syntaxOf(t.out, work, syntax) !== syntax) { kept.push({ path: t.rel, rule, why: `the redacted file is no valid ${syntax}` }); continue; }
    writeFileSync(join(x, t.rel), Buffer.from(t.out, 'latin1'));
    redacted.push({ path: t.rel, rule, count: [...t.hits.values()].reduce((n, c) => n + c, 0), syntax: syntax || 'none' });
  }
  if (!redacted.length) {
    cleanGit(['-C', source, 'archive', '--format=tar.gz', '-o', snap, 'HEAD^{tree}', 'site', 'site-pretty']);
    return { redacted, kept };
  }
  const gd = join(work, 'snapshot.git');
  cleanGit(['init', '-q', '--bare', '--template=', gd]);
  const objects = cleanGit(['-C', source, 'rev-parse', '--path-format=absolute', '--git-path', 'objects']);
  writeFileSync(join(gd, 'objects', 'info', 'alternates'), `${objects}\n`);
  const env = { GIT_INDEX_FILE: join(work, 'snapshot.index') }; // read-tree --prefix wants a work tree: the extracted copy
  for (const t of ['site', 'site-pretty']) cleanGit([`--git-dir=${gd}`, `--work-tree=${x}`, 'read-tree', `--prefix=${t}/`, pin.trees[t]], { env });
  for (const r of redacted) {
    const [mode, blob] = cleanGit([`--git-dir=${gd}`, `--work-tree=${x}`, 'ls-files', '-s', '--', `:(literal)${r.path}`], { env }).split(/\s+/);
    r.originalBlob = blob;
    r.redactedBlob = cleanGit([`--git-dir=${gd}`, 'hash-object', '-w', '--no-filters', '--', join(x, r.path)]);
    cleanGit([`--git-dir=${gd}`, `--work-tree=${x}`, 'update-index', '--cacheinfo', `${mode},${r.redactedBlob},${r.path}`], { env });
  }
  const tree = cleanGit([`--git-dir=${gd}`, 'write-tree'], { env });
  cleanGit([`--git-dir=${gd}`, 'archive', '--format=tar.gz', '-o', snap, tree]);
  return { redacted, kept };
}

async function asset(path, kind, maxBytes) {
  const bytes = statSync(path).size;
  if (bytes >= maxBytes) throw new Error(`${basename(path)} is ${bytes} bytes, at or over the ${maxBytes}-byte Release file limit: split it`);
  return { name: basename(path), sha256: await sha256File(path), bytes, unpackTo: '.', kind };
}

/**
 * Pack every asset and write the manifest. Returns {manifest, manifestPath, assets, hits, excluded:[{path,reason}], counts}.
 */
export async function packRelease({ source, mediaDir, outRoot, assetsDir, manifest, rules, tag, repo, cited = null, maxBytes = MAX_ASSET_BYTES }) {
  mkdirSync(assetsDir, { recursive: true });
  const work = mkdtempSync(join(os.tmpdir(), 'fw-release-pack-'));
  const tally = new Map();
  const excluded = [];
  const counts = {};
  const assets = [];
  // every shipped picture: PNG/GIF stripped of text, dates and EXIF; other formats refused when they carry more than
  // pixel/colour data (imagemeta.mjs); a refused picture is left out and makes the build not ready
  const images = { checked: 0, stripped: [], refused: [] };
  // a known value in a PNG colour profile (compressed, so no byte scan sees it) is a refusal too
  const literalHits = (text) => scanText(text, rules, { literalsOnly: true, allow: [] }).length;
  const image = (rel, buf) => {
    images.checked++;
    const r = shipImage(buf, { name: rel, literalHits });
    if (r.action === 'refused') { images.refused.push({ path: rel, kinds: r.risky }); return null; }
    if (r.action === 'stripped') images.stripped.push({ path: rel, kinds: r.kinds });
    return r.buf;
  };
  try {
    cited ??= citedOutPaths({ source });
    // 1. the frozen snapshot
    const pin = snapshotPin(source);
    const snap = join(assetsDir, `snapshot-${pin.snapshot}.tar.gz`);
    const sr = packSnapshot({ source, pin, snap, rules, work });
    const sa = await asset(snap, 'snapshot', maxBytes);
    if (sr.redacted.length) sa.redacted = sr.redacted.map((r) => ({ path: r.path, rule: r.rule, originalBlob: r.originalBlob, redactedBlob: r.redactedBlob }));
    assets.push(sa);
    // 2. proposal pictures and videos
    let media = isDir(mediaDir) ? walkFiles(mediaDir).filter((f) => !f.startsWith('.')) : [];
    const stray = media.filter((f) => !/^console\/proposals\/PR-\d+\/[^/]+\.(webp|mp4)$/i.test(f));
    if (stray.length) throw new Error(`media tree holds ${stray.length} file(s) outside console/proposals/PR-NNN/*.webp|mp4, e.g. ${stray[0]}`);
    media = media.filter((f) => !IMAGE_FILE.test(f) || image(f, readFileSync(join(mediaDir, f)))); // cwebp wrote them without metadata: a check
    counts['proposal-media'] = media.length;
    if (media.length) { const p = join(assetsDir, 'proposal-media.tar'); tarCreate(p, mediaDir, media); assets.push(await asset(p, 'media', maxBytes)); }
    // 3. out/: what is left out, then media as they are, then data scrubbed
    const included = new Set([...OUT_MEDIA, ...OUT_DATA.map((d) => d.dir)]);
    if (isDir(outRoot)) for (const e of readdirSync(outRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!included.has(e.name)) excluded.push({ path: `out/${e.name}${e.isDirectory() ? '/' : ''}`, reason: outReason(e.name, e.isDirectory()) });
    }
    const of = outFiles(outRoot, { cited });
    const { skipped } = of;
    // media as they are, videos with their container metadata stripped, pictures without theirs; data with every text
    // file scrubbed
    const stage = join(work, 'stage');
    let stripped = 0, scrubbed = 0;
    const textFiles = [];
    const om = of.media.filter((rel) => {
      const from = join(outRoot, rel.slice(4)), to = join(stage, 'media', rel);
      mkdirSync(dirname(to), { recursive: true });
      if (isVideo(rel)) { stripVideo(from, to); stripped++; return true; }
      if (IMAGE_FILE.test(rel)) { const b = image(rel, readFileSync(from)); if (!b) return false; writeFileSync(to, b); return true; }
      copyFileSync(from, to, constants.COPYFILE_FICLONE);
      return true;
    });
    counts['out-media'] = om.length;
    counts['out-media-videos-stripped'] = stripped;
    if (om.length) { const p = join(assetsDir, 'out-media.tar'); tarCreate(p, join(stage, 'media'), om); assets.push(await asset(p, 'media', maxBytes)); }
    const od = of.data.filter((rel) => {
      const from = join(outRoot, rel.slice(4)), to = join(stage, 'data', rel);
      mkdirSync(dirname(to), { recursive: true });
      const buf = readFileSync(from);
      // a picture name goes through the picture check whatever its bytes (text named .png is no picture: refused)
      if (IMAGE_FILE.test(rel)) { const b = image(rel, buf); if (!b) return false; writeFileSync(to, b); return true; }
      if (isText(buf)) { const r = scrubAll(buf.toString('utf8'), rules); addHits(tally, r.hits); writeFileSync(to, r.text); scrubbed++; textFiles.push(rel); return true; }
      copyFileSync(from, to, constants.COPYFILE_FICLONE);
      return true;
    });
    counts['out-data'] = od.length;
    counts['out-data-text'] = scrubbed;
    counts['out/lead and out/tryit files cited'] = of.cited;
    counts['images checked'] = images.checked;
    counts['images stripped'] = images.stripped.length;
    counts['images refused'] = images.refused.length;
    if (od.length) { const p = join(assetsDir, 'out-data.tar.gz'); tarCreate(p, join(stage, 'data'), od, { gzip: true }); assets.push(await asset(p, 'data', maxBytes)); }
    for (const [why, n] of skipped) excluded.push({ path: `inside included out/ folders (${n})`, reason: why });
    for (const r of images.refused) excluded.push({ path: r.path, reason: `picture refused: ${r.kinds.join(', ')} (no lossless strip for this format)` });
    const m = { version: 1, release: tag || `release-${pin.snapshot}`, ...(repo ? { repo } : {}), assets };
    const mp = manifest || join(assetsDir, 'release-assets.json');
    mkdirSync(dirname(mp), { recursive: true });
    writeFileSync(mp + '.tmp', JSON.stringify(m, null, 2) + '\n');
    renameSync(mp + '.tmp', mp);
    return { manifest: m, manifestPath: mp, snapshot: pin.snapshot, assets, hits: tallyToList(tally), excluded, counts, redacted: sr.redacted, redactKept: sr.kept, images, textFiles, cited: of.cited };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

let RULES = null;
async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.assets || !a.media) { console.error('usage: pack.mjs --assets <dir> --media <dir> [--source <repo>] [--out-root <dir>] [--known <file>] [--manifest <file>] [--tag <tag>] [--repo <owner/name>]'); process.exit(2); }
  const { mainCheckout } = await import('../lib/paths.mjs');
  const source = resolve(a.source || mainCheckout());
  refuseInside('pack.mjs', { '--assets': a.assets, '--manifest': a.manifest }, [mainCheckout(), source]);
  const rules = RULES = buildRules(loadKnown(knownFile(a)));
  const r = await packRelease({ source, mediaDir: resolve(a.media), outRoot: resolve(a['out-root'] || join(source, 'out')), assetsDir: resolve(a.assets), manifest: a.manifest && resolve(a.manifest), rules, tag: a.tag, repo: a.repo });
  for (const x of r.assets) console.log(`ASSET ${x.name} ${x.bytes} ${x.sha256} ${x.kind}`);
  console.log(`CITED ${r.cited} out/lead and out/tryit file(s) ship (cited by path)`);
  console.log(`IMAGES ${r.images.checked} checked, ${r.images.stripped.length} stripped, ${r.images.refused.length} refused`);
  for (const x of r.images.refused) console.log(`IMAGE-REFUSED ${safeText(x.path, rules)}: ${x.kinds.join(', ')}`);
  for (const h of r.hits) console.log(`SCRUB ${h.id} ${h.count}`);
  for (const x of r.redacted) console.log(`REDACTED ${safeText(x.path, rules)} ${x.rule} ${x.count}`);
  for (const x of r.redactKept) console.log(`NOT-REDACTED ${safeText(x.path, rules)} ${x.rule}: ${x.why} (the check reports it)`);
  console.log(`MANIFEST ${show(r.manifestPath, rules)} (${r.assets.length} assets, release ${r.manifest.release})`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`pack: ${show(e.message, RULES)}`); process.exit(1); });
