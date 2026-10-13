// Restore of images the I-124 auto-clean deleted (incident I-275). Every pruned folder kept a record, frames-pruned.json
// (name, bytes, mtime of each image). For each record under the given out/ roots this finds the original bytes again:
//
//   1. site/: the same relative path (any tail of the folder's out/ path plus the name), exact size;
//   2. by exact name AND exact size in the search dirs (the console store, every checkout's out/, research/, site/
//      anywhere) and in git history (every blob of every ref whose path ends in the name).
//
// A step-2 image is restored only when every candidate has the same content (git blob id); differing candidates make it
// "ambiguous", none "not-found". An image already back (same name and size) is "present". Restored files get the
// record's mtime. A record (and its _pruned-thumbs/) inside a deploy tree (a folder holding a DEPLOY_MARKERS file, or
// under one) moves to <parent of the outermost deploy folder>/pruned-records/<its name>/<path inside>, with `origin` (the
// folder's path under the out/ root) added, so a later run still finds it and nothing extra is deployed. Records in a
// pruned-records/ folder without `origin` (moved by hand) are listed as unmapped and left alone.
// Reads and copies image files only; never prints their contents.
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, copyFileSync, renameSync, utimesSync, rmSync } from 'node:fs';
import { join, relative, dirname, basename, sep, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { RECORD, THUMB_DIR, DEPLOY_MARKERS, IMAGE_RE } from './space-prune.mjs';

export const RECORDS_DIR = 'pruned-records';
const SKIP_DIRS = new Set(['.git', 'node_modules', '.wrangler', THUMB_DIR, RECORDS_DIR]);
const readJsonSafe = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const sizeOf = (f) => { try { const st = statSync(f); return st.isFile() ? st.size : null; } catch { return null; } };
const inside = (p, root) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);
/** git's blob id of a buffer (sha1 repos), so file and git candidates compare by content. */
export const blobId = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const fileId = (f) => { try { return blobId(readFileSync(f)); } catch { return null; } };

/** The outermost folder from `outRoot`'s first level down to `dir` that holds a deploy marker, or null. */
export function deployRoot(outRoot, dir) {
  const rel = relative(outRoot, dir);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
  const segs = rel.split(sep);
  for (let i = 1; i <= segs.length; i++) {
    const d = join(outRoot, ...segs.slice(0, i));
    if (DEPLOY_MARKERS.some((m) => existsSync(join(d, m)))) return d;
  }
  return null;
}

/** Every frames-pruned.json under `outRoot` (not in Chrome profiles; out/archive only with `archive`). */
export function findRecords(outRoot, { archive = false } = {}) {
  const found = [];
  const walk = (d, top) => {
    let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    if (es.some((e) => e.name === 'Local State')) return;
    for (const e of es) {
      const p = join(d, e.name);
      if (e.isFile() && e.name === RECORD) found.push(p);
      else if (e.isDirectory() && !e.isSymbolicLink() && !['.git', 'node_modules', THUMB_DIR].includes(e.name) && !(top && e.name === 'archive' && !archive)) walk(p, false);
    }
  };
  walk(outRoot, true);
  return found.sort();
}

/**
 * Files named in `names` under `dirs` (Chrome profiles, .git, node_modules, thumbnails and pruned-records skipped):
 * Map name -> [{path, bytes}].
 */
export function indexByName(dirs, names) {
  const idx = new Map();
  const seen = new Set();
  const walk = (d) => {
    if (seen.has(d)) return; seen.add(d);
    let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    if (es.some((e) => e.name === 'Local State')) return;
    for (const e of es) {
      const p = join(d, e.name);
      if (e.isDirectory() && !e.isSymbolicLink()) { if (!SKIP_DIRS.has(e.name)) walk(p); continue; }
      if (!e.isFile() || !names.has(e.name)) continue;
      const bytes = sizeOf(p);
      if (bytes === null) continue;
      if (!idx.has(e.name)) idx.set(e.name, []);
      idx.get(e.name).push({ path: p, bytes });
    }
  };
  for (const d of dirs) if (d && existsSync(d)) walk(d);
  return idx;
}

/** Blobs of every ref's history whose path ends in one of `names`: Map name -> [{sha, bytes, path}] (one per blob). */
export function gitBlobsByName(gitRoot, names) {
  const idx = new Map();
  if (!gitRoot) return idx;
  const r = spawnSync('git', ['rev-list', '--all', '--objects'], { cwd: gitRoot, encoding: 'utf8', timeout: 300000, maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) return idx;
  const hits = new Map();
  for (const l of r.stdout.split('\n')) {
    const m = l.match(/^([0-9a-f]{40}) (.+)$/);
    if (!m) continue;
    const name = m[2].split('/').pop();
    if (names.has(name) && !hits.has(m[1])) hits.set(m[1], { name, path: m[2] });
  }
  if (!hits.size) return idx;
  const c = spawnSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], { cwd: gitRoot, input: [...hits.keys()].join('\n') + '\n', encoding: 'utf8', timeout: 300000, maxBuffer: 256 * 1024 * 1024 });
  for (const l of (c.stdout || '').split('\n')) {
    const m = l.match(/^([0-9a-f]{40}) blob (\d+)$/);
    if (!m) continue;
    const h = hits.get(m[1]);
    if (!idx.has(h.name)) idx.set(h.name, []);
    idx.get(h.name).push({ sha: m[1], bytes: Number(m[2]), path: h.path });
  }
  return idx;
}
const gitBlob = (gitRoot, sha) => { const r = spawnSync('git', ['cat-file', 'blob', sha], { cwd: gitRoot, timeout: 120000, maxBuffer: 1024 * 1024 * 1024 }); return r.status === 0 ? r.stdout : null; };

/**
 * The restore plan. opts: {outRoots[], siteRoot, searchDirs[], gitRoot (null: no git history), archive}. Returns
 * {folders[], unmapped[]}: a folder is {outRoot, dir, rel, record, moved, deployRoot, images[]}; an image is {name, bytes,
 * mtime, status: present|site|match|ambiguous|not-found, from?: {kind: file|git, path, sha?}, candidates}.
 */
export function planRestore({ outRoots, siteRoot = null, searchDirs = [], gitRoot = null, archive = false }) {
  const folders = [], unmapped = [];
  for (const outRoot of outRoots) {
    for (const rec of findRecords(outRoot, { archive })) {
      const j = readJsonSafe(rec);
      if (!j || !Array.isArray(j.images)) { unmapped.push({ record: rec, why: 'unreadable record' }); continue; }
      const relRec = relative(outRoot, dirname(rec)).split(sep);
      const moved = relRec.includes(RECORDS_DIR);
      if (moved && typeof j.origin !== 'string') { unmapped.push({ record: rec, why: `in ${RECORDS_DIR}/ without origin (moved by hand)` }); continue; }
      const dir = moved ? join(outRoot, ...j.origin.split('/')) : dirname(rec);
      if (moved && (!inside(dir, outRoot) || dir === outRoot)) { unmapped.push({ record: rec, why: 'origin outside the out/ root' }); continue; }
      const rel = relative(outRoot, dir).split(sep).join('/');
      const byName = new Map();
      for (const x of j.images) if (x && typeof x.name === 'string' && !x.name.includes('/') && IMAGE_RE.test(x.name)) byName.set(x.name, x);
      folders.push({ outRoot, dir, rel, record: rec, moved, deployRoot: deployRoot(outRoot, dir), images: [...byName.values()].map((x) => ({ name: x.name, bytes: x.bytes, mtime: x.mtime })) });
    }
  }
  const names = new Set(folders.flatMap((f) => f.images.map((i) => i.name)));
  const idx = indexByName([...searchDirs, siteRoot], names);
  const gidx = gitBlobsByName(gitRoot, names);
  for (const f of folders) {
    const segs = f.rel.split('/');
    for (const im of f.images) {
      const here = join(f.dir, im.name);
      if (!Number.isInteger(im.bytes)) { im.status = 'not-found'; im.why = 'no size in the record'; continue; }
      if (sizeOf(here) === im.bytes) { im.status = 'present'; continue; }
      if (siteRoot) {
        let hit = null;
        for (let k = 0; k <= segs.length && !hit; k++) { const p = join(siteRoot, ...segs.slice(k), im.name); if (sizeOf(p) === im.bytes) hit = p; }
        if (hit) { im.status = 'site'; im.from = { kind: 'file', path: hit }; im.candidates = 1; continue; }
      }
      const cands = [];
      for (const c of idx.get(im.name) || []) if (c.bytes === im.bytes && !inside(c.path, f.dir)) cands.push({ kind: 'file', path: c.path });
      for (const c of gidx.get(im.name) || []) if (c.bytes === im.bytes) cands.push({ kind: 'git', path: c.path, sha: c.sha });
      for (const c of cands) if (c.kind === 'file') c.sha = fileId(c.path);
      const ids = new Set(cands.map((c) => c.sha).filter(Boolean));
      im.candidates = cands.length;
      if (!ids.size) im.status = 'not-found';
      else if (ids.size > 1) im.status = 'ambiguous';
      else { im.status = 'match'; im.from = cands.find((c) => c.kind === 'file' && c.sha) || cands[0]; }
    }
  }
  return { folders, unmapped };
}

/** Where a deploy tree's record goes: <parent of deployRoot>/pruned-records/<deployRoot name>/<dir inside it>. */
export const recordsHome = (deployRootDir, dir) => join(dirname(deployRootDir), RECORDS_DIR, basename(deployRootDir), relative(deployRootDir, dir));

/** Restore the plan's site/match images (each checked again: size and content id) and move deploy-tree records. */
export function applyRestore(plan, { gitRoot = null, by = 'space.mjs', now = Date.now(), log = () => {} } = {}) {
  const restored = [], failed = [], moved = [];
  for (const f of plan.folders) {
    for (const im of f.images) {
      if (im.status !== 'site' && im.status !== 'match') continue;
      const dst = join(f.dir, im.name);
      if (existsSync(dst)) { failed.push({ path: dst, why: 'a file is there now' }); continue; }
      const buf = im.from.kind === 'git' ? gitBlob(gitRoot, im.from.sha) : (() => { try { return readFileSync(im.from.path); } catch { return null; } })();
      if (!buf || buf.length !== im.bytes || (im.from.sha && blobId(buf) !== im.from.sha)) { failed.push({ path: dst, why: 'the source changed since the plan' }); continue; }
      mkdirSync(f.dir, { recursive: true });
      writeFileSync(dst, buf, { flag: 'wx' });
      const t = Date.parse(im.mtime);
      if (Number.isFinite(t)) try { utimesSync(dst, t / 1000, t / 1000); } catch {}
      restored.push({ path: dst, from: im.from.kind === 'git' ? `git ${im.from.sha.slice(0, 12)} ${im.from.path}` : im.from.path });
    }
    if (!f.deployRoot || f.moved) continue;
    const home = recordsHome(f.deployRoot, f.dir);
    if (existsSync(join(home, RECORD)) || existsSync(join(home, THUMB_DIR))) { failed.push({ path: f.record, why: `${home} has a record already: not moved` }); continue; }
    mkdirSync(home, { recursive: true });
    const j = readJsonSafe(f.record) || {};
    writeFileSync(join(home, RECORD), JSON.stringify({ ...j, origin: f.rel, movedAt: new Date(now).toISOString(), movedBy: by }, null, 1) + '\n');
    rmSync(f.record, { force: true });
    if (existsSync(join(f.dir, THUMB_DIR))) renameSync(join(f.dir, THUMB_DIR), join(home, THUMB_DIR));
    moved.push({ from: f.dir, to: home });
    log(`MOVED record ${f.rel} -> ${relative(f.outRoot, home).split(sep).join('/')}`);
  }
  return { restored, failed, moved };
}

/** Per out/ top-level folder: images, present, restored from site, by name+size, ambiguous, not found. */
export function summarize(plan, show = () => 'out') {
  const m = new Map();
  for (const f of plan.folders) {
    const k = `${show(f.outRoot)}/${f.rel.split('/')[0]}`;
    const s = m.get(k) || { key: k, folders: 0, images: 0, present: 0, site: 0, match: 0, ambiguous: 0, 'not-found': 0 };
    s.folders++;
    for (const im of f.images) { s.images++; s[im.status]++; }
    m.set(k, s);
  }
  return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function renderRestore(plan, result = null, show = () => 'out') {
  const L = [];
  const rows = summarize(plan, show);
  L.push(`RESTORE ${result ? 'APPLIED' : 'PLAN (dry run)'}: ${plan.folders.length} record(s); per out/ folder: images = present + from site/ + by name and size + ambiguous + not found`);
  L.push(`  ${'folder'.padEnd(28)} ${['records', 'images', 'present', 'site', 'name+size', 'ambiguous', 'not-found'].map((h) => h.padStart(9)).join(' ')}`);
  for (const s of rows) L.push(`  ${s.key.padEnd(28)} ${[s.folders, s.images, s.present, s.site, s.match, s.ambiguous, s['not-found']].map((n) => String(n).padStart(9)).join(' ')}`);
  const um = new Map();
  for (const u of plan.unmapped) {
    const parts = u.record.split(`${sep}${RECORDS_DIR}${sep}`);
    const k = `${show(parts.length > 1 ? parts[0] : dirname(u.record))}: ${u.why}`;
    um.set(k, (um.get(k) || 0) + 1);
  }
  for (const [k, n] of um) L.push(`  UNMAPPED ${n} record(s) under ${k}`);
  const deploy = plan.folders.filter((f) => f.deployRoot && !f.moved).length;
  if (result) L.push(`RESTORED ${result.restored.length} file(s); moved ${result.moved.length} record(s) out of deploy trees; failed ${result.failed.length}${result.failed.length ? ': ' + result.failed.slice(0, 5).map((x) => `${x.path} (${x.why})`).join('; ') : ''}`);
  else L.push(`DRY RUN: nothing was written. ${deploy} record(s) in deploy trees would move to ${RECORDS_DIR}/. node tools/space.mjs restore --apply restores the site/ and name+size rows.`);
  return L.join('\n');
}
