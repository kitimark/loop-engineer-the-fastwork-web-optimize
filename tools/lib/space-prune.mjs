// Auto-clean of regenerable disk output (incident I-124; user T-049 #27, 2026-10-04: "yes, clean by themselves" plus
// "keep the evidence for writing the medium.com blog post"). The disk filled twice (I-095, I-124) with leftovers no
// one removed; the user cleaned ~19 GB by hand. This module removes ONLY three classes, each after a day of no use:
//
//   profile   a throwaway Chrome profile (our marker or a tempProfileDir name) or a probe's fixed-name profile (a browser
//             cache), no process uses or holds it open, newest write more than a day ago. lib/cdp.mjs removes temp
//             profiles itself when their run ends (I-095/I-106); this class takes what a SIGKILL left. A tool's
//             persistent profile (chrome-verify-profile & co.) and a profile in the OS temp dir without our marker
//             are never touched.
//   frames    the image files (png, jpg, webp, ...) directly inside a folder of at least MIN_FRAMES of them (full-frame
//             screenshots: simpx, pixel runs, check/ab shots, Simulator shots), when no committed file cites the folder,
//             anything in it or a folder above it, nothing holds it open and its newest entry is more than a day old.
//             A record stays first: frames-pruned.json (every image's name, size, time) and up to THUMBS downscaled
//             thumbnails (sips) in _pruned-thumbs/, so the blog can still show what was captured. No thumbnail, no
//             deletion. Only image files go; JSON, Markdown, logs and subfolders stay.
//   snapshot  an immutable build copy out/snapshots/<name>-<12 hex>, when one of its files hashes to that name (sha256
//             prefix), the hash appears in committed fixes/ or research/ text (a pinned, rebuildable build), the path
//             itself is not cited, no process serves or holds it and it is more than a day old.
//
// Never removed (the keep-list, T-049 #27): every .json, .md, log and results file, verify.json, phone records, ioscap
// recordings (.mov and their .result.json/.frames.json), the console/incident/findings stores (.git/fastwork-mirror),
// anything cited by committed files or an evidence.json, anything newer than a day (so nothing a live agent just wrote),
// anything a running process uses or holds open, certs, Try-it pages. Every removal is appended to a kept log
// (<git-common-dir>/fastwork-mirror/space/prune.log, JSON lines: class, path, bytes, files, record) for the blog.
//
// Switch: FW_SPACE_AUTOPRUNE=0 turns the automatic run (idle.mjs watch --by lead) off; `space.mjs prune` alone is a
// dry run, `space.mjs prune --apply` removes.
import { existsSync, readdirSync, readFileSync, lstatSync, statSync, mkdirSync, writeFileSync, appendFileSync, rmSync, unlinkSync } from 'node:fs';
import { join, relative, basename, sep, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { sharedStateDir } from './paths.mjs';
import { worktrees, findProfiles, profileKind, profileInUse, userDataDirs, processes, newestMtime, citations, findManifests, citedBy, duBytes, isChromeProfile, TEMP_PROFILE_MARKER, defaultScratchRoots, showPath, fmtSize } from './space.mjs';

export const DAY_MS = 24 * 3600e3;
export const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?|heic)$/i;
export const MIN_FRAMES = 3;
export const THUMBS = 4;
export const THUMB_PX = 320;
export const RECORD = 'frames-pruned.json';
export const THUMB_DIR = '_pruned-thumbs';
/** Top-level out/ entries never searched for frames: in use (certs, Try-it, snapshots: their own class), recordings, phone records. */
export const NO_FRAMES_TOP = new Set(['certs', 'tryit', 'snapshots', 'iphone-screen', 'ioscap', 'iphone']);
export const SNAPSHOT_NAME = /^[A-Za-z0-9._-]+-([0-9a-f]{12})$/;

/** Is the automatic run on? (FW_SPACE_AUTOPRUNE=0 turns it off; default on, user T-049 #27.) */
export const autoPruneEnabled = (env = process.env) => env.FW_SPACE_AUTOPRUNE !== '0';
export const spaceDir = () => join(sharedStateDir(), 'space');
export const pruneLogFile = () => join(spaceDir(), 'prune.log');

const isDir = (p) => { try { return lstatSync(p).isDirectory(); } catch { return false; } };
const readJsonSafe = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const inside = (p, root) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);
const git = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 }); return r.status === 0 ? r.stdout : null; };

/**
 * Every path a running process holds open, its cwd included (lsof -F n; $FW_LSOF for tests). null when lsof could not
 * run or timed out: then nothing can be shown to be free, and planPrune keeps everything.
 */
export function openPaths(env = process.env) {
  const r = spawnSync(env.FW_LSOF || 'lsof', ['-nP', '-w', '-F', 'n'], { encoding: 'utf8', timeout: 120000, maxBuffer: 512 * 1024 * 1024 });
  if (r.error || r.signal || !r.stdout) return null;
  return r.stdout.split('\n').filter((l) => l[0] === 'n' && l[1] === '/').map((l) => l.slice(1));
}

/** Citations of out/ paths: committed fixes/ and research/ text (main + unlanded heads) and every evidence.json item. */
export function allCitations(mainRoot, wts, mainRef = 'main') {
  const heads = wts.filter((w) => !w.main && w.head && git(mainRoot, 'merge-base', '--is-ancestor', w.head, mainRef) === null).map((w) => w.head);
  const cites = citations(mainRoot, [mainRef, ...heads]);
  for (const w of wts) for (const f of findManifests(w.path)) {
    const m = readJsonSafe(f);
    for (const it of Array.isArray(m?.items) ? m.items : []) {
      if (!it || typeof it.path !== 'string' || !/^out\//.test(it.path)) continue;
      const k = it.path.replace(/\/+$/, '');
      cites.set(k, [...new Set([...(cites.get(k) || []), relative(mainRoot, f)])].sort());
    }
  }
  return cites;
}

/** Which of `hashes` appear in committed fixes/ and research/ text at `ref` (one git grep). */
export function committedHashes(root, hashes, ref = 'main') {
  const want = [...new Set(hashes)];
  if (!want.length) return new Set();
  const out = git(root, 'grep', '-h', '-o', '-F', ...want.flatMap((h) => ['-e', h]), ref, '--', 'fixes', 'research') || '';
  return new Set(out.split('\n').map((l) => l.replace(/^[^:]*:/, '').trim()).filter((h) => want.includes(h)));
}

const sha12 = (f) => { try { return createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12); } catch { return null; } };
function filesUnder(d, max = 200) {
  const out = [];
  const walk = (x) => { let es = []; try { es = readdirSync(x, { withFileTypes: true }); } catch { return; } for (const e of es) { if (out.length >= max) return; const p = join(x, e.name); if (e.isDirectory() && !e.isSymbolicLink()) walk(p); else if (e.isFile()) out.push(p); } };
  walk(d);
  return out;
}

/**
 * The dry-run plan. opts: {mainRoot, now, maxAgeMs (default a day), cites, procs, open (paths held open), scratchRoots,
 * tmpRoot, mainRef, committed (Set of hashes, for tests)}. Returns {candidates[], kept[], bytes}: a candidate is
 * {cls, path, show, bytes, why, images?}; a kept entry {cls, path, show, why} says why something that looked
 * like a class member stays.
 */
export function planPrune(opts) {
  const mainRoot = opts.mainRoot;
  const now = opts.now ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? DAY_MS;
  const wts = opts.wts ?? worktrees(mainRoot);
  const cites = opts.cites ?? allCitations(mainRoot, wts, opts.mainRef || 'main');
  const procs = opts.procs ?? processes();
  const open = opts.open === undefined ? openPaths() : opts.open;
  const scratchRoots = opts.scratchRoots ?? defaultScratchRoots(mainRoot);
  const tmpRoot = opts.tmpRoot === undefined ? tmpdir() : opts.tmpRoot;
  const r = { mainRoot };
  const show = (p) => showPath(r, p);
  const outs = wts.map((w) => ({ w, out: join(w.path, 'out') })).filter((x) => isDir(x.out));
  const relOut = (p) => { for (const { out } of outs) if (inside(p, out)) return `out/${relative(out, p).split(sep).join('/')}`; return null; };
  const heldBy = (p) => {
    if (!Array.isArray(open)) return 'open files could not be listed (lsof failed): nothing is shown free';
    const o = open.find((x) => inside(x, p));
    if (o) return `held open by a process (${show(o)})`;
    // a command line may name it absolutely or relative to its checkout (serve.mjs --root out/snapshots/<name>)
    const rel = relOut(p);
    const names = [p, ...(rel ? [rel] : [])];
    const pr = procs.find((x) => x.pid !== process.pid && names.some((n) => x.command.includes(n + sep) || x.command.endsWith(n) || x.command.includes(n + ' ') || x.command.includes(n + '"') || x.command.includes(n + "'")));
    return pr ? `a running process names it (pid ${pr.pid})` : null;
  };
  const age = (p, depth) => now - newestMtime(p, depth);
  const candidates = [], kept = [];
  const keep = (cls, p, why) => kept.push({ cls, path: p, show: show(p), why });
  const consider = (cls, p, depth, extra = {}) => {
    const rel = relOut(p);
    // a Chrome profile is a browser cache, never evidence: only a citation of the profile itself or of a file in it keeps
    // it, not one of a folder above it (out/rest-script/ cited as a whole held ~10 GB of profiles, 2026-10-04 survey)
    const cited = !rel ? [] : cls === 'profile' ? [...new Set([...cites].filter(([c]) => c === rel || c.startsWith(rel + '/')).flatMap(([, fs]) => fs))].sort() : citedBy(rel, cites);
    if (cited.length) return keep(cls, p, `cited by ${cited.slice(0, 2).join(', ')}${cited.length > 2 ? ` +${cited.length - 2}` : ''}`);
    const held = heldBy(p);
    if (held) return keep(cls, p, held);
    const a = age(p, depth);
    if (a < maxAgeMs) return keep(cls, p, `written ${Math.round(a / 360e3) / 10} h ago (under ${Math.round(maxAgeMs / 360e3) / 10} h)`);
    candidates.push({ cls, path: p, show: show(p), ...extra });
    return true;
  };

  // profiles: every checkout's out/, the scratchpads, and our marked ones in the OS temp dir
  const profDirs = [...new Set([...outs.map((x) => x.out), ...scratchRoots].flatMap((d) => findProfiles(d)))];
  const tmpMarked = [];
  if (tmpRoot && isDir(tmpRoot)) { let es = []; try { es = readdirSync(tmpRoot); } catch {} for (const e of es) { const d = join(tmpRoot, e); if (isDir(d) && existsSync(join(d, TEMP_PROFILE_MARKER)) && !profDirs.includes(d)) tmpMarked.push(d); } }
  const udd = userDataDirs(procs);
  for (const d of [...profDirs, ...tmpMarked]) {
    const kind = profileKind(d);
    if (kind === 'reused') { keep('profile', d, 'a tool reuses it on purpose'); continue; }
    const use = profileInUse(d, procs, udd);
    if (use) { keep('profile', d, `in use by pid ${use.pid} (${use.how})`); continue; }
    consider('profile', d, 3, { kind, why: kind === 'temp' ? 'leftover throwaway Chrome profile' : 'a probe\'s Chrome profile (browser cache), unused' });
  }

  // frames: folders of full-frame images under every out/ (not inside a profile, not the excluded top-level entries)
  const profSet = new Set([...profDirs]);
  for (const { out } of outs) {
    const walk = (d, n, top) => {
      let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
      const images = es.filter((e) => e.isFile() && IMAGE_RE.test(e.name)).map((e) => e.name);
      if (!top && images.length >= MIN_FRAMES) consider('frames', d, 1, { images, why: `${images.length} full-frame image(s); a record and ${Math.min(THUMBS, images.length)} thumbnail(s) stay` });
      if (n <= 0) return;
      for (const e of es) {
        if (!e.isDirectory() || e.isSymbolicLink() || e.name.startsWith('_pruned')) continue;
        if (top && NO_FRAMES_TOP.has(e.name)) continue;
        const p = join(d, e.name);
        if (profSet.has(p) || isChromeProfile(p)) continue;
        walk(p, n - 1, false);
      }
    };
    walk(out, 8, true);
  }

  // snapshots: out/snapshots/<name>-<12 hex>
  const snaps = [];
  for (const { out } of outs) { let es = []; try { es = readdirSync(join(out, 'snapshots')); } catch {} for (const e of es) { const p = join(out, 'snapshots', e); const m = e.match(SNAPSHOT_NAME); if (isDir(p) && m) snaps.push({ p, hash: m[1] }); } }
  const committed = opts.committed ?? committedHashes(mainRoot, snaps.map((s) => s.hash), opts.mainRef || 'main');
  for (const { p, hash } of snaps) {
    if (!filesUnder(p).some((f) => sha12(f) === hash)) { keep('snapshot', p, `no file in it hashes to ${hash}: not the build its name pins`); continue; }
    if (!committed.has(hash)) { keep('snapshot', p, `hash ${hash} appears in no committed fixes/ or research/ text: no record to rebuild it from`); continue; }
    consider('snapshot', p, 6, { why: `rebuildable: hash ${hash} is pinned in committed text` });
  }

  // sizes: whole folders for profiles and snapshots, the image files only for frames
  const sizes = duBytes(candidates.filter((c) => c.cls !== 'frames').map((c) => c.path));
  for (const c of candidates) {
    if (c.cls === 'frames') c.bytes = c.images.reduce((s, f) => { try { return s + statSync(join(c.path, f)).size; } catch { return s; } }, 0);
    else c.bytes = sizes.get(c.path) || 0;
  }
  candidates.sort((a, b) => b.bytes - a.bytes);
  return { createdAt: new Date(now).toISOString(), maxAgeMs, candidates, kept, bytes: candidates.reduce((s, c) => s + c.bytes, 0), roots: { outs: outs.map((x) => x.out), scratchRoots, tmpRoot } };
}

/** Downscale `src` to at most `px` on its long side into `dst` (macOS sips; $FW_SIPS for tests). True when dst exists. */
export function sipsThumb(src, dst, px = THUMB_PX, env = process.env) {
  const r = spawnSync(env.FW_SIPS || 'sips', ['-Z', String(px), src, '--out', dst], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0 && existsSync(dst);
}
/** Up to n evenly spaced picks of a sorted list (first and last included). */
export function spread(list, n = THUMBS) {
  if (list.length <= n) return [...list];
  return [...new Set(Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]))];
}

/**
 * Remove the plan's candidates (the --apply path). Each one is checked again just before it goes: still there, still
 * inside the roots the plan scanned, still the class it was (a profile still a Chrome profile; a snapshot still named
 * like one). Returns {removed[], skipped[], bytes}; every removal is appended to pruneLogFile().
 */
export function applyPrune(plan, { by = 'space.mjs', now = Date.now(), thumb = sipsThumb, log = () => {} } = {}) {
  const roots = [...plan.roots.outs, ...plan.roots.scratchRoots, ...(plan.roots.tmpRoot ? [plan.roots.tmpRoot] : [])];
  const removed = [], skipped = [];
  mkdirSync(spaceDir(), { recursive: true });
  const record = (c, extra) => {
    const line = { at: new Date(now).toISOString(), by, cls: c.cls, path: c.show, bytes: c.bytes, why: c.why, ...extra };
    appendFileSync(pruneLogFile(), JSON.stringify(line) + '\n');
    removed.push(line);
    log(`PRUNED ${c.cls} ${fmtSize(c.bytes)} ${c.show}${extra.thumbs ? ` (record ${extra.record}, ${extra.thumbs} thumbnail(s))` : ''}`);
  };
  for (const c of plan.candidates) {
    const skip = (why) => { skipped.push({ cls: c.cls, path: c.show, why }); log(`SKIPPED ${c.cls} ${c.show}: ${why}`); };
    if (!isAbsolute(c.path) || !roots.some((rt) => inside(c.path, rt) && c.path !== rt)) { skip('outside the scanned roots'); continue; }
    if (!existsSync(c.path)) { skip('gone already'); continue; }
    if (c.cls === 'profile') {
      if (!isChromeProfile(c.path)) { skip('no longer a Chrome profile'); continue; }
      try { rmSync(c.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
      if (existsSync(c.path)) { skip('could not be removed'); continue; }
      record(c, { kind: c.kind });
    } else if (c.cls === 'snapshot') {
      if (!SNAPSHOT_NAME.test(basename(c.path)) || basename(join(c.path, '..')) !== 'snapshots') { skip('not a snapshot folder'); continue; }
      try { rmSync(c.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
      if (existsSync(c.path)) { skip('could not be removed'); continue; }
      record(c, {});
    } else if (c.cls === 'frames') {
      const images = c.images.filter((f) => IMAGE_RE.test(f) && !f.includes('/') && existsSync(join(c.path, f))).sort();
      if (!images.length) { skip('no images left'); continue; }
      const tdir = join(c.path, THUMB_DIR);
      mkdirSync(tdir, { recursive: true });
      const thumbs = [];
      for (const f of spread(images)) { const dst = join(tdir, f.replace(IMAGE_RE, '.png')); if (thumb(join(c.path, f), dst)) thumbs.push(basename(dst)); }
      if (!thumbs.length) { try { rmSync(tdir, { recursive: true, force: true }); } catch {} skip('no thumbnail could be made: nothing removed'); continue; }
      const list = images.map((f) => { let st = null; try { st = statSync(join(c.path, f)); } catch {} return { name: f, bytes: st?.size ?? null, mtime: st ? new Date(st.mtimeMs).toISOString() : null }; });
      const prev = readJsonSafe(join(c.path, RECORD));
      writeFileSync(join(c.path, RECORD), JSON.stringify({ schema: 'fw-frames-pruned/1', at: new Date(now).toISOString(), by, why: 'I-124 auto-clean: uncited full-frame images older than a day (user T-049 #27)', images: [...(Array.isArray(prev?.images) ? prev.images : []), ...list], thumbs: { dir: THUMB_DIR, px: THUMB_PX, files: thumbs }, bytes: list.reduce((s, x) => s + (x.bytes || 0), 0) + (prev?.bytes || 0) }, null, 1) + '\n');
      let freed = 0, n = 0;
      for (const x of list) { try { unlinkSync(join(c.path, x.name)); freed += x.bytes || 0; n++; } catch {} }
      record({ ...c, bytes: freed }, { files: n, record: RECORD, thumbs: thumbs.length });
    } else skip(`unknown class ${c.cls}`);
  }
  return { removed, skipped, bytes: removed.reduce((s, x) => s + (x.bytes || 0), 0) };
}

/** Text of a plan (dry run). */
export function renderPlan(plan, { top = 12 } = {}) {
  const L = [];
  const by = (cls) => plan.candidates.filter((c) => c.cls === cls);
  L.push(`PRUNE PLAN ${plan.createdAt.slice(0, 16)}Z: ${plan.candidates.length} item(s), ${fmtSize(plan.bytes)} (only these classes, each unused for ${Math.round(plan.maxAgeMs / 360e3) / 10} h; JSON, Markdown, logs, phone records, recordings and anything cited stay)`);
  for (const [cls, what] of [['profile', 'Chrome profiles (leftover temp profiles, probe browser caches)'], ['frames', 'full-frame image files (a record and thumbnails stay)'], ['snapshot', 'rebuildable snapshot copies (hash pinned in committed text)']]) {
    const xs = by(cls);
    L.push(`  ${what}: ${xs.length} = ${fmtSize(xs.reduce((s, c) => s + c.bytes, 0))}`);
    for (const c of xs.slice(0, top)) L.push(`    ${fmtSize(c.bytes).padStart(8)}  ${c.show}  ${c.why}`);
    if (xs.length > top) L.push(`    ... ${xs.length - top} more (--json)`);
  }
  const kc = new Map(); for (const k of plan.kept) { const key = `${k.cls}: ${k.why.replace(/\(.*\)|\d+(\.\d+)? h ago|by \S+.*$|[0-9a-f]{12}/g, '').replace(/\s+/g, ' ').trim()}`; kc.set(key, (kc.get(key) || 0) + 1); }
  if (kc.size) { L.push('  kept (why):'); for (const [k, n] of [...kc].sort((a, b) => b[1] - a[1]).slice(0, top)) L.push(`    ${String(n).padStart(4)}  ${k}`); }
  return L.join('\n');
}

const pidAlive = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
export const runFile = () => join(spaceDir(), 'prune.running');
export const lastFile = () => join(spaceDir(), 'last-prune.json');

/**
 * One prune at a time (the CLI's --apply and the watch's automatic run): a run file holding our pid; a dead holder's
 * file is taken over. Plans, applies when `apply`, writes a summary to last-prune.json (apply only). Returns
 * {busy} when another prune runs, else {plan, result|null}.
 */
export function runPrune({ apply = false, by = 'space.mjs', log = () => {}, now = Date.now(), thumb, ...planOpts } = {}) {
  mkdirSync(spaceDir(), { recursive: true });
  if (apply) {
    for (let i = 0; ; i++) {
      try { writeFileSync(runFile(), JSON.stringify({ pid: process.pid, by, at: new Date(now).toISOString() }) + '\n', { flag: 'wx' }); break; } catch (e) {
        if (e.code !== 'EEXIST' || i) return { busy: readJsonSafe(runFile()) || { pid: null } };
        const cur = readJsonSafe(runFile());
        if (cur && pidAlive(cur.pid)) return { busy: cur };
        try { unlinkSync(runFile()); } catch {}
      }
    }
  }
  try {
    const plan = planPrune({ now, ...planOpts });
    if (!apply) return { plan, result: null };
    const result = applyPrune(plan, { by, now, log, ...(thumb ? { thumb } : {}) });
    writeFileSync(lastFile(), JSON.stringify({ at: new Date(now).toISOString(), by, removed: result.removed.length, skipped: result.skipped.length, bytes: result.bytes, planned: plan.candidates.length, kept: plan.kept.length }) + '\n');
    return { plan, result };
  } finally { if (apply) try { unlinkSync(runFile()); } catch {} }
}
