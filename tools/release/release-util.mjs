// Shared helpers of the release export tools (I-270): argument parsing, the known-values default path, scrubbing of JSON
// values, hit tallies, file walks, sha256, tar, the outside-the-repo guard, print-safe text and a streamed byte scan.
// Library only; no CLI. Never prints a value: callers print rule ids, counts and paths (through show()).
import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, statSync, lstatSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, isAbsolute, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import os from 'node:os';
import { tildify, safeText } from './rules.mjs';

/** Default known-values file (outside any repo, mode 600, made by the lead). */
export const DEFAULT_KNOWN = join(os.homedir(), '.cache', 'fw-release', 'known.json');
/** The known-values file of a command line: --known, else $FW_RELEASE_KNOWN (as rules.mjs), else the default. */
export const knownFile = (a) => resolve(a.known || process.env.FW_RELEASE_KNOWN || DEFAULT_KNOWN);
/** GitHub refuses Release files of 2 GiB and more. */
export const MAX_ASSET_BYTES = 2 * 1024 ** 3;

/** Tiny flag parser: --k v, --flag (boolean when the next token is a flag or missing), positionals in `_`. */
export function parseArgs(argv, { booleans = [] } = {}) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const eq = a.indexOf('=');
    const k = (eq > 0 ? a.slice(2, eq) : a.slice(2));
    if (eq > 0) o[k] = a.slice(eq + 1);
    else if (booleans.includes(k)) o[k] = true;
    else if (i + 1 < argv.length) o[k] = argv[++i];
    else throw new Error(`--${k} needs a value`);
  }
  return o;
}

/** Add {id,count} hits into a Map id -> count. */
export function addHits(tally, hits) {
  for (const h of hits || []) if (h && h.count) tally.set(h.id, (tally.get(h.id) || 0) + h.count);
  return tally;
}
export const tallyToList = (tally) => [...tally].sort((a, b) => a[0].localeCompare(b[0])).map(([id, count]) => ({ id, count }));

/** Scrub every string (values and keys) of a JSON value with scrubText; hits go into `tally`. */
export function scrubJson(value, rules, scrubText, tally) {
  const s = (str) => { const r = scrubText(str, rules); addHits(tally, r.hits); return r.text; };
  const walk = (v) => {
    if (typeof v === 'string') return s(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[s(k)] = walk(x); return o; }
    return v;
  };
  return walk(value);
}

/** All regular files under dir (no symlinks followed), as paths relative to dir with '/' separators, sorted. */
export function walkFiles(dir, { skipDir = () => false } = {}) {
  const out = [];
  const rec = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const p = join(d, e.name);
      const rel = relative(dir, p).split(sep).join('/');
      if (e.isDirectory()) { if (!skipDir(rel, e.name)) rec(p); } else if (e.isFile()) out.push(rel);
    }
  };
  rec(dir);
  return out;
}

export const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
export const isFile = (p) => { try { return lstatSync(p).isFile(); } catch { return false; } };

/** sha256 of a file, streamed (assets reach 2 GiB). */
export function sha256File(path) {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(path).on('error', rej).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex')));
  });
}
export const sha256Buf = (b) => createHash('sha256').update(b).digest('hex');

/** True when the bytes are text we may scrub: no NUL and valid UTF-8. */
export function isText(buf) {
  if (buf.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch { return false; }
}
export const readText = (p) => readFileSync(p, 'utf8');

/**
 * Flags for the system tar: no owner names or ids in the headers (they carry the login name), no xattrs or macOS
 * metadata. bsdtar (macOS): --uid/--gid 0, empty --uname/--gname; GNU tar: --owner=0 --group=0 --numeric-owner.
 */
export function tarFlags(bin = process.env.FW_TAR || 'tar') {
  const v = spawnSync(bin, ['--version'], { encoding: 'utf8' }).stdout || '';
  if (/GNU tar/.test(v)) return ['--owner=0', '--group=0', '--numeric-owner', '--no-xattrs'];
  return ['--uid', '0', '--gid', '0', '--uname', '', '--gname', '', '--no-xattrs', ...(process.platform === 'darwin' ? ['--no-mac-metadata'] : [])];
}

/**
 * Write a tar archive of `names` (paths relative to `cwd`, files only, no recursion) with the system tar. macOS tar adds
 * AppleDouble files and xattr headers unless told not to (COPYFILE_DISABLE, --no-xattrs/--no-mac-metadata).
 */
export function tarCreate(archive, cwd, names, { gzip = false } = {}) {
  const list = names.join('\n') + '\n';
  const args = ['-c', ...(gzip ? ['-z'] : []), '-f', archive, ...tarFlags(), '--no-recursion', '-T', '-'];
  const r = spawnSync(process.env.FW_TAR || 'tar', args, { cwd, input: list, encoding: 'utf8', env: { ...process.env, COPYFILE_DISABLE: '1' }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`tar failed (${r.status ?? r.signal}): ${(r.stderr || '').trim().split('\n').slice(0, 3).join(' | ')}`);
}

/** Unpack an archive into dir (created by the caller). */
export function tarExtract(archive, dir) {
  const r = spawnSync(process.env.FW_TAR || 'tar', ['-x', '-f', archive, '-C', dir], { encoding: 'utf8', env: { ...process.env, COPYFILE_DISABLE: '1' } });
  if (r.status !== 0) throw new Error(`tar -x failed for ${archive}: ${(r.stderr || '').trim().split('\n')[0]}`);
}

/** Members of an archive (tar -t). */
export function tarList(archive) {
  const r = spawnSync(process.env.FW_TAR || 'tar', ['-t', '-f', archive], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`tar -t failed for ${archive}: ${(r.stderr || '').trim().split('\n')[0]}`);
  return r.stdout.split('\n').filter(Boolean);
}

/** Run a small pool of async jobs, at most n at a time; resolves to results in input order. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}

const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
/** p with symlinks resolved as far as it exists (the nearest existing ancestor's realpath plus the rest). */
export function realish(p) {
  let probe = resolve(p);
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  return join(real(probe), relative(probe, resolve(p)));
}
/** Is `p` (an output path, maybe not there yet) inside one of `roots` (repos), symlinks resolved? Returns that root. */
export function insideAny(p, roots) {
  const rp = realish(p);
  for (const root of roots.filter(Boolean)) { const r = relative(real(root), rp); if (r === '' || (!r.startsWith('..') && !isAbsolute(r))) return root; }
  return null;
}

/** A string safe to print: the home folder as ~, every rule match (literals in any case) as its token. */
export function show(s, rules) {
  const home = os.homedir();
  let t = String(s);
  if (home && home !== '/') t = t.split(home + '/').join('~/').replace(new RegExp(`${home.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')}(?![\\w.-])`, 'g'), '~');
  t = tildify(t);
  return rules ? safeText(t, rules) : t;
}

const lowerBytes = (b) => { for (let i = 0; i < b.length; i++) if (b[i] >= 65 && b[i] <= 90) b[i] += 32; return b; };
/**
 * Count the known literals (any ASCII letter case) in a file's bytes, streamed, and with `gunzip` also in its
 * decompressed bytes: the tar headers (owner names, file names) are bytes no unpacked check sees. Returns
 * [{id, count, where:'bytes'|'gunzipped'}] (no values).
 */
export async function scanFileLiterals(path, rules, { gunzip = false } = {}) {
  const lits = rules.filter((r) => r.kind === 'literal').map((r) => ({ id: r.id, needle: lowerBytes(Buffer.from(r.match, 'utf8')) }));
  if (!lits.length) return [];
  const keep = Math.max(...lits.map((l) => l.needle.length)) - 1;
  const scan = (stream, where) => new Promise((res, rej) => {
    const counts = new Map();
    let tail = Buffer.alloc(0);
    stream.on('error', rej).on('data', (chunk) => {
      const buf = lowerBytes(Buffer.concat([tail, chunk]));
      for (const l of lits) {
        // a match that ends inside the carried tail was counted with the previous chunk
        for (let i = buf.indexOf(l.needle); i >= 0; i = buf.indexOf(l.needle, i + 1)) if (i + l.needle.length > tail.length) counts.set(l.id, (counts.get(l.id) || 0) + 1);
      }
      tail = buf.subarray(Math.max(0, buf.length - keep));
    }).on('end', () => res([...counts].map(([id, count]) => ({ id, count, where }))));
  });
  const out = await scan(createReadStream(path), 'bytes');
  if (gunzip) {
    // pipe() does not pass the file's errors on: without this a read error would leave the scan waiting forever
    const file = createReadStream(path), gz = createGunzip();
    file.on('error', (e) => gz.destroy(e));
    out.push(...await scan(file.pipe(gz), 'gunzipped'));
  }
  return out;
}

/**
 * Refuse (exit 2) when an output path lies inside this repo, its source repo or a worktree of them (symlinks
 * resolved): the release outputs hold Fastwork-derived files and are built outside every repo.
 */
export function refuseInside(tool, outputs, roots) {
  for (const [flag, p] of Object.entries(outputs)) {
    if (!p) continue;
    const root = insideAny(p, roots);
    if (root) { console.error(`REFUSED: ${flag} ${show(resolve(p))} is inside the repo ${show(root)}; ${tool} writes outside every repo`); process.exit(2); }
  }
}

export const isVideo = (p) => /\.(mp4|mov|m4v)$/i.test(p);
/** Copy a video without its container metadata (creation time, location, device, encoder tags): ffmpeg, streams copied. */
export function stripVideo(from, to) {
  const bin = process.env.FW_FFMPEG || 'ffmpeg';
  const r = spawnSync(bin, ['-nostdin', '-loglevel', 'error', '-y', '-i', from, '-map', '0:v', '-map', '0:a?', '-map_metadata', '-1', '-map_chapters', '-1',
    '-c', 'copy', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', to], { encoding: 'utf8' });
  if (r.error?.code === 'ENOENT') throw new Error(`ffmpeg not found (${bin}): brew install ffmpeg`);
  if (r.status !== 0 || !existsSync(to)) throw new Error(`ffmpeg failed for ${from.split('/').slice(-2).join('/')} (exit ${r.status ?? r.signal}): ${(r.stderr || '').trim().split('\n')[0]}`);
}
