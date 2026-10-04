// Disk space (incident I-095: the Data volume ran full; ~13 GB of leftover Chrome profiles, ~45 GB of raw out/ output,
// ~8 GB of scratch folders). READ-ONLY: this module measures and classifies; it never deletes, moves or writes anything
// but the optional list file the user asked for. The user decides what goes (`node tools/space.mjs report`).
//
// Categories:
//   profiles   Chrome profile dirs (a "Local State" file or the marker of lib/cdp.mjs) under every checkout's out/, the
//              session scratch folders and the OS temp dir. kind: temp (tempProfileDir name or marker; removed by
//              lib/cdp.mjs since I-095 except after a SIGKILL), probe (a research probe's fixed-name profile, which
//              the probe may reuse: status "probe", listed apart, not counted as leftover), reused (a tool's
//              persistent profile: verify.mjs's chrome-verify-profile records its field-trial state in every result,
//              bench and mirror reuse theirs: listed, never suggested). A profile in the OS temp dir without our marker
//              may be another app's: status "not-ours", not counted. In use = a running process names it in
//              --user-data-dir, or its marker's pid still runs.
//   worktrees  out/ of every linked worktree: finished when its branch landed (it made commits of its own, per its
//              reflog, and main has all of them) or every board row of its topics (status.mjs) is done / landed /
//              dropped; a parked row keeps it active (it may resume), and so does a branch that never committed (its
//              out/ may be the only copy of its work). A busy one (a process runs in it) or one written to in the last
//              --idle-hours is marked "check".
//   scratch    the entries of each Claude Code session scratchpad of this project (one folder per agent, by convention).
//   evidence   must-keep files listed by evidence manifests (fixes/<topic>/evidence.json, research/**/evidence.json in any
//              checkout), with sizes, missing files and the per-topic cap. A candidate that contains evidence says so.
import { existsSync, readdirSync, readFileSync, statfsSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, relative, dirname, basename, isAbsolute, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir, userInfo } from 'node:os';
import { status as lockStatus, isGroup, parseHeld } from './lock.mjs';

export const GiB = 1024 ** 3;
export const DEFAULT_WARN_GB = 10;
export const EVIDENCE_SCHEMA = 'fw-evidence/1';
export const DEFAULT_CAP_MB = 200;
export const TEMP_PROFILE_MARKER = '.fw-temp-profile.json'; // = lib/cdp.mjs TEMP_PROFILE_MARKER (no import: cdp is measurement code)
export const REUSED_PROFILES = new Set(['chrome-verify-profile', 'chrome-bench-profile', 'chrome-crawl-profile']);
const TEMP_NAME = /-\d+-[0-9a-f]{8}$/; // lib/cdp.mjs tempProfileDir(): <owner>-<pid>-<8 hex>
const FINISHED_STATES = new Set(['done', 'landed', 'dropped']); // review-i095 (C): parked is not finished, it may resume

/** The free-space threshold in GB ($FW_SPACE_WARN_GB, default 10; 0 = never warn). */
export function warnGb(env = process.env) {
  const v = Number(env.FW_SPACE_WARN_GB);
  return env.FW_SPACE_WARN_GB !== undefined && env.FW_SPACE_WARN_GB !== '' && Number.isFinite(v) && v >= 0 ? v : DEFAULT_WARN_GB;
}
/** {freeBytes, totalBytes} of the volume holding `path` (statfs: no process spawned). */
export function freeSpace(path) {
  const s = statfsSync(path);
  return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
}
export const fmtSize = (bytes) => (bytes >= GiB ? `${(bytes / GiB).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${Math.round(bytes / 1024 ** 2)} MB` : `${Math.round(bytes / 1024)} KB`);
/** One WARNING line when the volume holding `path` has less than warnGb() free, else null (errors: null). */
export function lowSpaceWarning(path, env = process.env) {
  const lim = warnGb(env);
  if (!lim) return null;
  try {
    const { freeBytes } = freeSpace(path);
    if (freeBytes >= lim * GiB) return null;
    return `WARNING: low disk space: ${fmtSize(freeBytes)} free on this disk (under ${lim} GB). Leftover Chrome profiles and old out/ folders: node tools/space.mjs report (read-only; you decide what to delete)`;
  } catch { return null; }
}

// ---- not beside someone's hold (review-i095 B) -------------------------------------------------------------------
/** The hold to run the report in: it waits its FIFO turn and keeps the report's load off everyone's measurements. */
export const SPACE_HOLD_CMD = 'node tools/lock.mjs run chrome-measure --owner <you> --no-timing --max-seconds 600 -- node tools/space.mjs report';
/**
 * Why `space.mjs report` may not run now, or null. It runs du over tens of GB plus ps, lsof and git for every worktree
 * (~30 s of disk and CPU load), so it refuses beside anyone else's exclusive normal hold on chrome-measure: a timing hold
 * (an A/B, verify, bench) or a no-timing hold (a build, or a phone part that wants a quiet Mac). It passes on a free or
 * stale lock, a shared (functional) group, an exclusive short-lane job, and the caller's own hold (FW_LOCK_HELD names
 * the holder's token: `lock.mjs run` exports it to its command, e.g. SPACE_HOLD_CMD). `st`: status('chrome-measure').
 */
export function spaceRunRefusal({ st, env = process.env } = {}) {
  const h = st?.holder;
  if (!h || st.stale || isGroup(h) || h.functional || h.short) return null;
  if (h.token && parseHeld(env.FW_LOCK_HELD)['chrome-measure'] === h.token) return null;
  return `WAIT: chrome-measure is held by "${h.owner}" (${h.noTiming ? 'a no-timing hold: a build, or a phone part that wants a quiet Mac' : 'a timing hold, e.g. an A/B'}). This report runs du over tens of GB plus ps, lsof and git for every worktree, which would load the Mac under that hold. Retry after it ends, or run it in its own hold, which waits its turn:\n  ${SPACE_HOLD_CMD}`;
}
/** spaceRunRefusal on the live lock state (null when the lock state can't be read). */
export function spaceRunRefusalNow(env = process.env) {
  let st; try { st = lockStatus('chrome-measure'); } catch { return null; }
  return spaceRunRefusal({ st, env });
}

// ---- helpers ----------------------------------------------------------------------------------------------
const isDir = (p) => { try { return lstatSync(p).isDirectory(); } catch { return false; } };
const readJsonSafe = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const inside = (p, root) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);
function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 20000 });
  return r.status === 0 ? r.stdout.trim() : null;
}
/** `du -sk` of many paths at once: Map path -> bytes (missing paths: 0). */
export function duBytes(paths) {
  const out = new Map();
  const list = [...new Set(paths)].filter((p) => existsSync(p));
  for (let i = 0; i < list.length; i += 200) {
    const r = spawnSync('du', ['-sk', ...list.slice(i, i + 200)], { encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
    for (const l of (r.stdout || '').split('\n')) { const m = l.match(/^(\d+)\t(.+)$/); if (m) out.set(m[2], Number(m[1]) * 1024); }
  }
  for (const p of paths) if (!out.has(p)) out.set(p, 0);
  return out;
}
/** Newest mtime (ms) of `dir` and its entries down to `depth` levels (directory mtimes change when entries come or go). */
export function newestMtime(dir, depth = 2) {
  let best = 0;
  const walk = (d, n) => {
    let st; try { st = lstatSync(d); } catch { return; }
    best = Math.max(best, st.mtimeMs);
    if (n <= 0 || !st.isDirectory()) return;
    let es = []; try { es = readdirSync(d); } catch {}
    for (const e of es) walk(join(d, e), n - 1);
  };
  walk(dir, depth);
  return best;
}
/** Running processes: [{pid, command}] (ps -ww: full command lines). */
export function processes() {
  const r = spawnSync('ps', ['-A', '-ww', '-o', 'pid=,command='], { encoding: 'utf8', timeout: 10000, maxBuffer: 64 * 1024 * 1024 });
  return (r.stdout || '').split('\n').map((l) => l.match(/^\s*(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: Number(m[1]), command: m[2] }));
}
/** Working directories of running processes: [{pid, cwd}] (lsof; [] when it fails). */
export function processCwds() {
  const r = spawnSync('lsof', ['-nP', '-a', '-d', 'cwd', '-F', 'pn'], { encoding: 'utf8', timeout: 20000, maxBuffer: 64 * 1024 * 1024 });
  const out = []; let pid = null;
  for (const l of (r.stdout || '').split('\n')) { if (l[0] === 'p') pid = Number(l.slice(1)); else if (l[0] === 'n' && pid) out.push({ pid, cwd: l.slice(1) }); }
  return out;
}
const pidAlive = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// ---- Chrome profiles ------------------------------------------------------------------------------------
export const isChromeProfile = (d) => existsSync(join(d, 'Local State')) || existsSync(join(d, TEMP_PROFILE_MARKER));
export function profileKind(dir) {
  const name = basename(dir);
  if (existsSync(join(dir, TEMP_PROFILE_MARKER)) || TEMP_NAME.test(name)) return 'temp';
  if (REUSED_PROFILES.has(name)) return 'reused';
  return 'probe';
}
/** Chrome profile dirs under `root` (not descending into a profile), up to `maxDepth` levels. */
export function findProfiles(root, maxDepth = 7) {
  const found = [];
  const walk = (d, n) => {
    if (!isDir(d)) return;
    if (isChromeProfile(d)) { found.push(d); return; }
    if (n <= 0) return;
    let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch {}
    for (const e of es) if (e.isDirectory() && !e.isSymbolicLink()) walk(join(d, e.name), n - 1);
  };
  walk(root, maxDepth);
  return found;
}
const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
/** Map realpath(--user-data-dir) -> pid over running processes (a value runs to the next " --" or the end). */
export function userDataDirs(procs) {
  const m = new Map();
  for (const x of procs) for (const g of x.command.matchAll(/--user-data-dir=(.+?)(?= --|$)/g)) m.set(real(g[1].trim().replace(/^["']|["']$/g, '')), x.pid);
  return m;
}
/** Is a profile in use: a process names it in --user-data-dir, or its marker's creator still runs. */
export function profileInUse(dir, procs, dirs = userDataDirs(procs)) {
  const pid = dirs.get(real(dir));
  if (pid) return { pid, how: 'user-data-dir' };
  const m = readJsonSafe(join(dir, TEMP_PROFILE_MARKER));
  if (m && m.pid !== process.pid && pidAlive(m.pid)) return { pid: m.pid, how: 'marker pid' };
  return null;
}

// ---- checkouts, worktrees, board ------------------------------------------------------------------------
/** [{path, head, branch, main}] from `git worktree list --porcelain` run in the main checkout. */
export function worktrees(mainRoot) {
  const out = git(mainRoot, 'worktree', 'list', '--porcelain');
  if (out === null) return [{ path: mainRoot, head: null, branch: null, main: true }];
  const list = [];
  for (const block of out.split(/\n\n+/)) {
    const w = {};
    for (const l of block.split('\n')) {
      if (l.startsWith('worktree ')) w.path = l.slice(9);
      else if (l.startsWith('HEAD ')) w.head = l.slice(5);
      else if (l.startsWith('branch ')) w.branch = l.slice(7).replace(/^refs\/heads\//, '');
    }
    if (w.path) list.push({ ...w, main: !list.length });
  }
  return list;
}
/** Topics a worktree works on: fixes/<t>/overlay present there, or fixes|research/<t>/ changed on its branch. */
export function worktreeTopics(w, mainRoot, mainRef) {
  const t = new Set();
  try { for (const d of readdirSync(join(w.path, 'fixes'))) if (isDir(join(w.path, 'fixes', d, 'overlay'))) t.add(d); } catch {}
  if (w.head) {
    const names = git(mainRoot, 'diff', '--name-only', `${mainRef}...${w.head}`) || '';
    for (const f of names.split('\n')) { const m = f.match(/^(?:fixes|research)\/([^/]+)\//); if (m && !m[1].startsWith('_')) t.add(m[1]); }
  }
  return [...t];
}
/** Commits the branch made itself, per its reflog ("commit", "commit (amend)", "cherry-pick" entries; 0 without a reflog). */
export function ownCommits(mainRoot, branch) {
  if (!branch) return 0;
  const out = git(mainRoot, 'reflog', 'show', '--format=%gs', `refs/heads/${branch}`, '--');
  return out ? out.split('\n').filter((l) => /^(commit( \([a-z]+\))?|cherry-pick):/.test(l)).length : 0;
}
export function boardRowsFor(topics, rows) {
  const keys = new Set(topics.flatMap((t) => [t, `fix-${t}`]));
  return rows.filter((r) => keys.has(r.id) || keys.has(r.owner) || (r.aliases || []).some((a) => keys.has(a)));
}

// ---- evidence manifests -----------------------------------------------------------------------------------
/** evidence.json files of one checkout: fixes/<t>/evidence.json, research/<t>[/<sub>]/evidence.json. */
export function findManifests(checkout) {
  const out = [];
  const tryDir = (d) => { const f = join(d, 'evidence.json'); if (existsSync(f)) out.push(f); };
  for (const top of ['fixes', 'research']) {
    let es = []; try { es = readdirSync(join(checkout, top)); } catch {}
    for (const e of es) {
      const d = join(checkout, top, e);
      if (!isDir(d)) continue;
      tryDir(d);
      if (top === 'research') { let ss = []; try { ss = readdirSync(d); } catch {} for (const s of ss) if (isDir(join(d, s))) tryDir(join(d, s)); }
    }
  }
  return out;
}
/** Validate one manifest object; returns a list of problems (empty = ok). */
export function validateManifest(m) {
  const p = [];
  if (!m || typeof m !== 'object') return ['not a JSON object'];
  if (m.schema !== EVIDENCE_SCHEMA) p.push(`schema must be "${EVIDENCE_SCHEMA}"`);
  if (!m.topic || typeof m.topic !== 'string') p.push('topic missing');
  if (m.capMB !== undefined && !(Number(m.capMB) > 0)) p.push('capMB must be a positive number');
  if (!Array.isArray(m.items) || !m.items.length) p.push('items must be a non-empty list');
  for (const [i, it] of (Array.isArray(m.items) ? m.items : []).entries()) {
    if (!it || typeof it.path !== 'string' || !it.path) { p.push(`items[${i}].path missing`); continue; }
    if (isAbsolute(it.path) || it.path.split('/').includes('..')) p.push(`items[${i}].path must be relative to a checkout, without ..: ${it.path}`);
    if (!it.why) p.push(`items[${i}].why missing (what claim or proposal it backs)`);
  }
  return p;
}

// ---- writers and citations (I-124) ------------------------------------------------------------------------
/**
 * Who writes what under out/ (path relative to the checkout's out/, first match wins). `regen`: true = scratch a tool
 * or probe can make again (a deletion candidate when nothing cites it and its owner is finished); false = keep (a phone
 * record or screen recording can't be made again, certs and Try-it pages are in use); null = unknown (listed, ask the
 * owner, never in the deletion block). Chrome profiles are classified by the profile section (status), not here.
 */
export const WRITERS = [
  { re: /^certs(\/|$)/, writer: 'TLS certs (serve.mjs --https; the phone trusts them)', regen: false },
  { re: /^tryit(\/|$)/, writer: 'proposal Try-it builds (lead)', regen: false },
  { re: /^snapshots(\/|$)/, writer: 'immutable build copies for phone blocks (lead)', regen: false },
  { re: /^iphone-screen(\/|$)|\.mov$/, writer: 'ioscap screen recordings', regen: false },
  { re: /^iphone(\/|$)|(^|\/)[^/]*-(?:run|gesture|finger)-[^/]*\.json$/, writer: 'phone run records (iphone.mjs, gesture)', regen: false },
  { re: /^ioscap(\/|$)/, writer: 'ioscap app build', regen: true },
  { re: /^ab(\/|$)/, writer: 'fix.mjs ab raw runs (results.json is the committed record)', regen: true },
  { re: /^check(\/|$)/, writer: 'fix.mjs check / check.mjs', regen: true },
  { re: /^bench(\/|$)/, writer: 'bench.mjs runs and overlays', regen: true },
  { re: /^verify[^/]*(\/|$)/, writer: 'verify.mjs output', regen: true },
  { re: /^sim(\/|$)/, writer: 'sim.mjs shots and runs', regen: true },
  { re: /^costcard(\/|$)|(^|\/)costcard[^/]*$/, writer: 'costcard.mjs', regen: true },
  { re: /(^|\/)simpx(\/|$)/, writer: 'simpx Simulator screenshots', regen: true },
  { re: /(^|\/)[^/]*pixels?[^/]*(\/|$)/, writer: 'pixel runs (frames)', regen: true },
  { re: /(^|\/)chrome(-fn|-profile[^/]*)?(\/|$)/, writer: 'Chrome profiles', regen: true },
  { re: /(^|\/)snap(\/|$)/, writer: 'topic build copies (snap)', regen: true },
  { re: /\.(log|txt)$/, writer: 'logs', regen: true },
  { re: /(^|\/)serve-[^/]*\.json$/, writer: 'serve state files', regen: true },
];
/** {writer, regen} for a path relative to out/. */
export function writerOf(relInOut) {
  const p = String(relInOut).split(sep).join('/');
  for (const w of WRITERS) if (w.re.test(p)) return { writer: w.writer, regen: w.regen };
  return { writer: `topic output (${p.split('/')[0]})`, regen: null };
}

// a path to out/... in committed text: preceded by a start or a non-name char (so "layout/x" is no hit)
const CITE_RE = '(^|[^A-Za-z0-9_.-])out/[A-Za-z0-9_.@+=:,-]+(/[A-Za-z0-9_.@+=:,-]+)*';
/**
 * Paths under out/ that committed write-ups cite: `git grep` over fixes/ and research/ (*.md, *.json, *.tsv, *.csv) at
 * every ref in `refs` (main plus each unlanded branch head). Returns Map "out/..." -> [citing files] (deduplicated).
 * Conservative on purpose: a citation in any checkout's text keeps that path in every checkout.
 */
export function citations(root, refs) {
  const out = new Map();
  for (const ref of [...new Set(refs.filter(Boolean))]) {
    const r = spawnSync('git', ['grep', '-I', '-o', '-E', CITE_RE, ref, '--', 'fixes/*.md', 'fixes/*.json', 'fixes/*.tsv', 'fixes/*.csv', 'research/*.md', 'research/*.json', 'research/*.tsv', 'research/*.csv'], { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 256 * 1024 * 1024 });
    for (const l of (r.stdout || '').split('\n')) {
      const m = l.match(/^[^:]+:([^:]+):(.*)$/);
      if (!m) continue;
      const path = m[2].replace(/^[^o]*(?=out\/)/, '').replace(/[.,:]+$/, '').replace(/\/+$/, '');
      if (!path.startsWith('out/') || path === 'out/') continue;
      const s = out.get(path) || new Set(); s.add(m[1]); out.set(path, s);
    }
  }
  return new Map([...out].map(([k, v]) => [k, [...v].sort()]));
}
/** The citing files of `rel` ("out/..."): a citation of it, of a path inside it, or of a folder holding it. */
export function citedBy(rel, cites) {
  const files = new Set();
  for (const [c, fs] of cites) if (c === rel || c.startsWith(rel + '/') || rel.startsWith(c + '/')) for (const f of fs) files.add(f);
  return [...files].sort();
}
const citedInside = (rel, cites) => { for (const c of cites.keys()) if (c.startsWith(rel + '/')) return true; return false; };

/**
 * The items of one checkout's out/: its entries, split further where something must stay (a citation or a Chrome
 * profile lies inside), down to `maxDepth` levels, so the items partition out/ and each one is kept or not as a whole.
 * Returns [{path, rel ("out/..."), relInOut}].
 */
export function outItems(checkout, { cites = new Map(), profiles = [], maxDepth = 5 } = {}) {
  const outDir = join(checkout, 'out');
  const items = [];
  const profileInside = (d) => profiles.some((p) => p.startsWith(d + sep));
  const walk = (d, n) => {
    let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = join(d, e.name);
      const relInOut = relative(outDir, p).split(sep).join('/');
      const rel = `out/${relInOut}`;
      if (e.isDirectory() && !e.isSymbolicLink() && n > 0 && !profiles.includes(p) && (citedInside(rel, cites) || profileInside(p))) walk(p, n - 1);
      else items.push({ path: p, rel, relInOut });
    }
  };
  if (isDir(outDir)) walk(outDir, maxDepth);
  return items;
}
/** Uncommitted changes outside out/ (git status --porcelain): [] = clean, null = unknown. */
export function dirtyOutsideOut(wt) {
  const s = git(wt, 'status', '--porcelain', '--untracked-files=normal');
  if (s === null) return null;
  return s.split('\n').filter(Boolean).filter((l) => { const f = l.slice(3).replace(/^"|"$/g, ''); return !/^out(\/|$)/.test(f) && !/^fixes\/[^/]+\/overlay(\/|$)/.test(f); });
}

// ---- scratch ----------------------------------------------------------------------------------------------
/** Claude Code session scratchpads of this project: /private/tmp/claude-<uid>/<slugged main path>/<session>/scratchpad. */
export function defaultScratchRoots(mainRoot) {
  let uid; try { uid = userInfo().uid; } catch { return []; }
  const base = join('/private/tmp', `claude-${uid}`, resolve(mainRoot).replace(/[^A-Za-z0-9]/g, '-'));
  let es = []; try { es = readdirSync(base); } catch {}
  return es.map((s) => join(base, s, 'scratchpad')).filter(isDir);
}

// ---- the report -------------------------------------------------------------------------------------------
/**
 * Build the read-only report. opts: {mainRoot, scratchRoots, idleHours, rows (board), procs, cwds, now, mainRef, tmpRoot}.
 * Returns {createdAt, free, warnGb, profiles[], worktrees[], scratch[], evidence{manifests[], items[]}, totals}.
 */
export function buildReport(opts) {
  const mainRoot = resolve(opts.mainRoot);
  const now = opts.now ?? Date.now();
  const idleMs = (opts.idleHours ?? 2) * 3600e3;
  const mainRef = opts.mainRef || 'main';
  const procs = opts.procs ?? processes();
  const cwds = opts.cwds ?? processCwds();
  const rows = opts.rows ?? [];
  const wts = worktrees(mainRoot);
  const scratchRoots = (opts.scratchRoots ?? defaultScratchRoots(mainRoot)).map((p) => resolve(p));
  const tmpRoot = opts.tmpRoot === undefined ? tmpdir() : opts.tmpRoot;

  // evidence first: every other category marks what it contains
  const manifests = [], evItems = [];
  for (const w of wts) for (const f of findManifests(w.path)) {
    const m = readJsonSafe(f);
    const problems = m ? validateManifest(m) : ['not valid JSON'];
    const rec = { file: f, checkout: w.path, topic: m?.topic ?? basename(dirname(f)), capMB: Number(m?.capMB) || DEFAULT_CAP_MB, problems, items: [] };
    for (const it of (Array.isArray(m?.items) ? m.items : [])) {
      if (!it || typeof it.path !== 'string' || isAbsolute(it.path) || it.path.split('/').includes('..')) continue;
      const cands = [w.path, mainRoot, ...wts.map((x) => x.path)];
      const hit = cands.map((c) => join(c, it.path)).find((p) => existsSync(p)) || null;
      const item = { manifest: f, topic: rec.topic, path: it.path, resolved: hit, why: it.why || '', kind: it.kind || null, fastworkDerived: !!it.fastworkDerived, missing: !hit };
      rec.items.push(item); evItems.push(item);
    }
    manifests.push(rec);
  }

  const outRoots = wts.map((w) => join(w.path, 'out')).filter(isDir);
  const profileRoots = [...outRoots, ...scratchRoots];
  const profDirs = [...new Set(profileRoots.flatMap((r) => findProfiles(r)))];
  const inTmp = new Set();
  if (tmpRoot && isDir(tmpRoot)) { let es = []; try { es = readdirSync(tmpRoot); } catch {} for (const e of es) { const d = join(tmpRoot, e); if (isDir(d) && isChromeProfile(d) && !profDirs.includes(d)) { profDirs.push(d); inTmp.add(d); } } }

  const wtOut = wts.filter((w) => !w.main).map((w) => ({ w, out: join(w.path, 'out') })).filter((x) => isDir(x.out));
  const mainOut = join(mainRoot, 'out');
  const scratchEntries = scratchRoots.flatMap((r) => { let es = []; try { es = readdirSync(r); } catch {} return es.map((e) => join(r, e)); });
  // I-124: what committed write-ups cite (main, and each branch head main does not contain) plus the evidence manifests;
  // the out/ items of every checkout split down to what must stay; one du over all of them (items partition each out/)
  const heads = wts.filter((w) => !w.main && w.head && git(mainRoot, 'merge-base', '--is-ancestor', w.head, mainRef) === null).map((w) => w.head);
  const cites = opts.cites ?? citations(mainRoot, [mainRef, ...heads]);
  for (const i of evItems) if (/^out\//.test(i.path)) { const k = i.path.replace(/\/+$/, ''); const f = relative(mainRoot, i.manifest); cites.set(k, [...new Set([...(cites.get(k) || []), f])].sort()); }
  const outOf = new Map(wts.map((w) => [w.path, outItems(w.path, { cites, profiles: profDirs })]));
  const allItems = [...outOf.values()].flat();
  const sizes = duBytes([...profDirs, ...allItems.map((i) => i.path), ...scratchEntries, ...evItems.filter((i) => i.resolved).map((i) => i.resolved)]);
  const outBytes = (w) => (outOf.get(w) || []).reduce((s, i) => s + (sizes.get(i.path) || 0), 0);
  const evidenceIn = (p) => evItems.filter((i) => i.resolved && inside(i.resolved, p));
  const isEvidence = (p) => evItems.some((i) => i.resolved && inside(p, i.resolved));

  const udd = userDataDirs(procs);
  const profiles = profDirs.map((d) => {
    const use = profileInUse(d, procs, udd);
    const kind = profileKind(d);
    const ev = evidenceIn(d).length;
    const marked = existsSync(join(d, TEMP_PROFILE_MARKER));
    const status = use ? 'in-use' : ev || isEvidence(d) ? 'keep-evidence' : kind === 'reused' ? 'reused' : inTmp.has(d) && !marked ? 'not-ours' : kind === 'probe' ? 'probe' : 'leftover';
    const note = use ? `pid ${use.pid} (${use.how})` : status === 'reused' ? 'a tool reuses it on purpose (verify records its field-trial state)'
      : status === 'not-ours' ? 'in the OS temp dir without our marker: may be another app\'s; not counted' : status === 'probe' ? 'a research probe\'s fixed-name profile: the probe may reuse it; ask its owner' : '';
    return { path: d, kind, bytes: sizes.get(d) || 0, inUse: use, status, note };
  }).sort((a, b) => b.bytes - a.bytes);

  const worktreesOut = wtOut.map(({ w, out }) => {
    const ahead = w.head ? Number(git(mainRoot, 'rev-list', '--count', `${mainRef}..${w.head}`)) : null;
    const topics = worktreeTopics(w, mainRoot, mainRef);
    const board = boardRowsFor(topics, rows).map((r) => ({ id: r.id, state: r.state, owner: r.owner }));
    const boardFinished = board.length > 0 && board.every((r) => FINISHED_STATES.has(r.state));
    const boardActive = board.some((r) => !FINISHED_STATES.has(r.state));
    const own = ownCommits(mainRoot, w.branch);
    const merged = ahead === 0 && own > 0; // review-i095 (C): a branch that never committed has not landed
    const busyPids = [...cwds.filter((c) => inside(c.cwd, w.path)).map((c) => c.pid), ...procs.filter((p) => p.pid !== process.pid && p.command.includes(w.path + sep)).map((p) => p.pid)].filter((p) => p !== process.pid);
    const lastWrite = newestMtime(out);
    const recent = now - lastWrite < idleMs;
    const finished = (merged || boardFinished) && !boardActive;
    const ev = evidenceIn(out);
    const why = [merged ? 'landed: its commits are on main' : ahead === 0 ? 'no commit of its own (its out/ may be the only copy of its work)' : `${ahead ?? '?'} commit(s) not on main`, board.length ? `board: ${board.map((r) => `${r.id} ${r.state}`).join(', ')}` : 'no board row found', `last write ${Math.round((now - lastWrite) / 360e3) / 10} h ago`];
    if (busyPids.length) why.push(`busy: ${[...new Set(busyPids)].length} process(es) run in it`);
    if (ev.length) why.push(`holds ${ev.length} evidence file(s): keep those`);
    const status = !finished ? 'active' : busyPids.length || recent ? 'check' : ev.length ? 'keep-evidence' : 'finished';
    return { path: w.path, out, branch: w.branch, ahead, ownCommits: own, merged, topics, board, bytes: outBytes(w.path), lastWrite: lastWrite ? new Date(lastWrite).toISOString() : null, busy: [...new Set(busyPids)], evidence: ev.length, status, note: why.join('; '),
      owner: busyPids.length || boardActive ? 'alive' : finished ? 'finished' : 'unknown', clean: merged && finished ? dirtyOutsideOut(w.path) : null };
  }).sort((a, b) => b.bytes - a.bytes);

  // a scratch folder is named after its agent (CLAUDE.md "Scratch files go in <scratchpad>/<your-topic>/"): its board
  // rows are the ones with that id or owner; "lead" (the main session, always running) is never matched by owner
  const scratch = scratchEntries.map((p) => {
    const name = basename(p);
    const lastWrite = newestMtime(p);
    const mine = rows.filter((r) => r.id === name || (name !== 'lead' && (r.owner === name || (r.aliases || []).includes(name))));
    const active = name === 'lead' || mine.some((r) => !FINISHED_STATES.has(r.state));
    const inUse = profiles.some((x) => x.inUse && inside(x.path, p)) || cwds.some((c) => inside(c.cwd, p));
    const ev = evidenceIn(p).length;
    const recent = now - lastWrite < idleMs;
    const status = inUse ? 'in-use' : ev ? 'keep-evidence' : active ? 'active' : recent ? 'check' : 'idle';
    return { path: p, bytes: sizes.get(p) || 0, lastWrite: lastWrite ? new Date(lastWrite).toISOString() : null, board: mine.map((r) => ({ id: r.id, state: r.state })), status, note: [name === 'lead' ? 'the lead\'s own folder' : null, mine.length ? `board: ${mine.map((r) => `${r.id} ${r.state}`).join(', ')}` : null, `last write ${Math.round((now - lastWrite) / 360e3) / 10} h ago`, ev ? `holds ${ev} evidence file(s)` : null].filter(Boolean).join('; ') };
  }).sort((a, b) => b.bytes - a.bytes);

  for (const m of manifests) {
    m.bytes = m.items.reduce((s, i) => s + (i.resolved ? sizes.get(i.resolved) || 0 : 0), 0);
    m.overCap = m.bytes > m.capMB * 1024 ** 2;
    m.missing = m.items.filter((i) => i.missing).length;
    m.fastworkDerived = m.items.filter((i) => i.fastworkDerived).length;
  }
  // I-124: every out/ item with its writer, size, owner state (alive / finished / unknown, branch landed) and the
  // committed files that cite it; what auto-clean may remove is decided by lib/space-prune.mjs (space.mjs prune)
  const wtBy = new Map(worktreesOut.map((w) => [w.path, w]));
  const profBy = new Map(profiles.map((p) => [p.path, p]));
  const items = [];
  for (const w of wts) for (const it of outOf.get(w.path) || []) {
    const wt = wtBy.get(w.path);
    const prof = profBy.get(it.path);
    const { writer, regen } = prof ? { writer: `Chrome profile (${prof.status})`, regen: prof.status !== 'reused' && prof.status !== 'in-use' } : writerOf(it.relInOut);
    const cited = citedBy(it.rel, cites);
    const owner = w.main ? 'lead' : wt ? wt.owner : 'unknown';
    const note = cited.length ? `cited by ${cited.slice(0, 3).join(', ')}${cited.length > 3 ? ` +${cited.length - 3}` : ''}`
      : prof ? prof.note || prof.status : regen === false ? 'keep: not regenerable, or in use' : regen === null ? 'unknown writer: ask the owner' : 'regenerable';
    items.push({ path: it.path, rel: it.rel, checkout: w.path, checkoutRel: w.main ? '.' : relative(mainRoot, w.path), branch: w.branch || null, main: !!w.main, owner, landed: wt ? wt.merged : null,
      writer, regen, bytes: sizes.get(it.path) || 0, citedBy: cited, note });
  }
  items.sort((a, b) => b.bytes - a.bytes);
  // landed, finished and clean outside out/: the worktree itself could go (git worktree remove); its out/ holds JSON, logs
  // and records the user keeps as blog evidence (T-049 #27), so it is listed for the user, never removed by a tool
  const landedClean = worktreesOut.filter((w) => w.merged && w.status === 'finished' && Array.isArray(w.clean) && !w.clean.length && !w.busy.length).map((w) => ({ path: w.path, branch: w.branch, bytes: w.bytes }));
  let free = null; try { free = freeSpace(mainRoot); } catch {}
  const sum = (xs) => xs.reduce((s, x) => s + x.bytes, 0);
  return {
    schema: 'fw-space-report/1', createdAt: new Date(now).toISOString(), readOnly: true, mainRoot, free, warnGb: warnGb(),
    profiles, worktrees: worktreesOut, mainOut: isDir(mainOut) ? { path: mainOut, bytes: outBytes(mainRoot) } : null, scratch,
    items, byWriter: groupBytes(items, (i) => i.writer), byCheckout: groupBytes(items, (i) => i.checkoutRel), landedClean, citationCount: cites.size,
    evidence: { manifests, items: evItems },
    totals: {
      leftoverProfiles: sum(profiles.filter((p) => p.status === 'leftover')), inUseProfiles: sum(profiles.filter((p) => p.status === 'in-use')), reusedProfiles: sum(profiles.filter((p) => p.status === 'reused')),
      probeProfiles: sum(profiles.filter((p) => p.status === 'probe')), notOursProfiles: sum(profiles.filter((p) => p.status === 'not-ours')),
      finishedWorktreeOut: sum(worktreesOut.filter((w) => w.status === 'finished')), checkWorktreeOut: sum(worktreesOut.filter((w) => w.status === 'check' || w.status === 'keep-evidence')), activeWorktreeOut: sum(worktreesOut.filter((w) => w.status === 'active')),
      scratchIdle: sum(scratch.filter((s) => s.status === 'idle')), scratchOther: sum(scratch.filter((s) => s.status !== 'idle')), evidence: manifests.reduce((s, m) => s + m.bytes, 0),
    },
  };
}

// ---- rendering --------------------------------------------------------------------------------------------
/** [{key, bytes, n}] summed by key(item), biggest first. */
export function groupBytes(items, key) {
  const m = new Map();
  for (const i of items) { const k = key(i); const e = m.get(k) || { key: k, bytes: 0, n: 0 }; e.bytes += i.bytes; e.n++; m.set(k, e); }
  return [...m.values()].sort((a, b) => b.bytes - a.bytes);
}
// I-124: printed paths are relative to the repo; a session scratchpad shows as <scratch>/<session>/..., the OS temp dir
// as $TMPDIR/... (no home folder or user name on screen)
const SCRATCH_BASE = /^\/private\/tmp\/claude-\d+\/[^/]+\//;
export function showPath(r, p) {
  const x = relative(r.mainRoot, p);
  if (x && !x.startsWith('..') && !isAbsolute(x)) return x;
  const t = tmpdir();
  if (inside(p, t) || inside(p, real(t))) return `$TMPDIR/${relative(inside(p, t) ? t : real(t), p)}`;
  return p.replace(SCRATCH_BASE, '<scratch>/');
}
const rel = showPath;
const pad = (s, n) => String(s).padStart(n);
export function renderText(r, { top = 12 } = {}) {
  const L = [];
  L.push(`SPACE REPORT ${r.createdAt.slice(0, 16)}Z  (read-only: nothing was deleted or moved)`);
  if (r.free) L.push(`free space: ${fmtSize(r.free.freeBytes)} of ${fmtSize(r.free.totalBytes)} on this disk${r.warnGb && r.free.freeBytes < r.warnGb * GiB ? `   WARNING: under ${r.warnGb} GB` : ''}`);
  const t = r.totals;
  const n = (s) => r.profiles.filter((p) => p.status === s).length;
  const byFolder = (status) => {
    const groups = new Map();
    for (const p of r.profiles.filter((x) => x.status === status)) { const g = dirname(p.path); const e = groups.get(g) || { n: 0, bytes: 0 }; e.n++; e.bytes += p.bytes; groups.set(g, e); }
    for (const [g, e] of [...groups].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, top)) L.push(`   ${pad(fmtSize(e.bytes), 8)}  ${pad(e.n, 4)} in ${rel(r, g)}/`);
    if (groups.size > top) L.push(`   ... ${groups.size - top} more folder(s) in the list file`);
  };
  L.push('', `1. Throwaway Chrome profiles (temp names or our marker) no process uses: ${n('leftover')} = ${fmtSize(t.leftoverProfiles)}`);
  L.push(`   (also: ${n('in-use')} in use = ${fmtSize(t.inUseProfiles)}, never touch; ${n('reused')} reused tool profiles = ${fmtSize(t.reusedProfiles)}, keep; ${n('not-ours')} in the OS temp dir without our marker = ${fmtSize(t.notOursProfiles)}, may be another app's, not counted)`);
  byFolder('leftover');
  L.push(`   research-probe profiles (fixed names; the probe may reuse them, ask its owner): ${n('probe')} = ${fmtSize(t.probeProfiles)}`);
  byFolder('probe');
  for (const p of r.profiles.filter((x) => x.status === 'in-use' || x.status === 'keep-evidence')) L.push(`   ${pad(fmtSize(p.bytes), 8)}  ${p.status.toUpperCase()}  ${rel(r, p.path)}  ${p.note}`);
  const fin = r.worktrees.filter((w) => w.status === 'finished'), chk = r.worktrees.filter((w) => w.status === 'check' || w.status === 'keep-evidence'), act = r.worktrees.filter((w) => w.status === 'active');
  L.push('', `2. out/ of finished worktrees (branch landed on main, or board rows done/landed/dropped; parked counts as active): ${fin.length} = ${fmtSize(t.finishedWorktreeOut)}`);
  for (const w of fin.slice(0, top)) L.push(`   ${pad(fmtSize(w.bytes), 8)}  ${rel(r, w.out)}  ${w.branch || ''}: ${w.note}`);
  if (fin.length > top) L.push(`   ... ${fin.length - top} more in the list file`);
  L.push(`   check first (finished, but busy, written to recently or holding evidence): ${chk.length} = ${fmtSize(t.checkWorktreeOut)}`);
  for (const w of chk.slice(0, top)) L.push(`   ${pad(fmtSize(w.bytes), 8)}  ${rel(r, w.out)}  ${w.branch || ''}: ${w.note}`);
  L.push(`   active (not listed as candidates): ${act.length} = ${fmtSize(t.activeWorktreeOut)}${r.mainOut ? `; the main checkout's out/ (lead): ${fmtSize(r.mainOut.bytes)}` : ''}`);
  L.push('', `3. Scratch folders: idle ${r.scratch.filter((s) => s.status === 'idle').length} = ${fmtSize(t.scratchIdle)}; in use, active, recent or with evidence = ${fmtSize(t.scratchOther)}`);
  for (const s of r.scratch.slice(0, top)) L.push(`   ${pad(fmtSize(s.bytes), 8)}  ${s.status.padEnd(13)} ${showPath(r, s.path)}  ${s.note}`);
  const ms = r.evidence.manifests;
  L.push('', `4. Must-keep evidence (evidence.json manifests): ${ms.length} manifest(s), ${r.evidence.items.length} item(s), ${fmtSize(t.evidence)}`);
  for (const m of ms) L.push(`   ${pad(fmtSize(m.bytes), 8)}  ${m.topic}: ${m.items.length} item(s)${m.fastworkDerived ? `, ${m.fastworkDerived} Fastwork-derived (gitignored, never commit, MUST KEEP)` : ''}${m.missing ? `, ${m.missing} MISSING` : ''}${m.overCap ? `, OVER the ${m.capMB} MB cap` : ''}${m.problems.length ? `; manifest problems: ${m.problems.join('; ')}` : ''}  (${rel(r, m.file)})`);
  if (!ms.length) L.push('   none yet: see fixes/README.md "Evidence keep-list"');
  // I-124: by writer, by checkout (owner alive or finished, branch landed), landed and clean worktrees
  if (r.items) {
    L.push('', `5. out/ by writer (every checkout; ${r.citationCount} cited path(s) in committed fixes/ and research/ text and evidence.json):`);
    for (const g of r.byWriter.slice(0, top)) {
      const cited = r.items.filter((i) => i.writer === g.key && i.citedBy.length).reduce((s, i) => s + i.bytes, 0);
      L.push(`   ${pad(fmtSize(g.bytes), 8)}  ${pad(g.n, 4)} item(s)  ${g.key}${cited ? `  (${fmtSize(cited)} cited)` : ''}`);
    }
    if (r.byWriter.length > top) L.push(`   ... ${r.byWriter.length - top} more writer(s) in --json`);
    L.push('', '6. out/ by checkout (owner: alive = a process runs in it or a board row is active; finished = landed or board done/dropped):');
    const wtBy = new Map(r.worktrees.map((w) => [rel(r, w.path), w]));
    for (const g of r.byCheckout.slice(0, top)) {
      const w = wtBy.get(g.key);
      const who = g.key === '.' ? 'main checkout (lead)' : w ? `${w.branch || '?'}: owner ${w.owner}, ${w.merged ? 'landed' : `${w.ahead ?? '?'} commit(s) not on main`}${w.board.length ? `, board ${w.board.map((b) => `${b.id} ${b.state}`).join(', ')}` : ''}` : '?';
      L.push(`   ${pad(fmtSize(g.bytes), 8)}  ${g.key === '.' ? 'out/' : `${g.key}/out/`}  ${who}`);
    }
    if (r.byCheckout.length > top) L.push(`   ... ${r.byCheckout.length - top} more checkout(s) in --json`);
    L.push('', `7. Landed, finished worktrees with nothing uncommitted outside out/: ${r.landedClean.length} = ${fmtSize(r.landedClean.reduce((s, w) => s + w.bytes, 0))} of out/ (its JSON, logs and records are blog evidence: the user decides, no tool removes a worktree)`);
    for (const w of r.landedClean.slice(0, top)) L.push(`   ${pad(fmtSize(w.bytes), 8)}  ${rel(r, w.path)}  ${w.branch || ''}`);
  }
  return L.join('\n');
}
/** The list file: one TSV line per path (category, status, bytes, size, path, note); review it before deleting anything. */
export function renderList(r) {
  const L = [`# space.mjs report ${r.createdAt}: read-only, nothing was deleted. Review before deleting anything; never delete "in-use", "active", "keep-evidence" or "evidence" lines.`, ['category', 'status', 'bytes', 'size', 'path', 'note'].join('\t')];
  const line = (c, s, b, p, n) => L.push([c, s, b, fmtSize(b), p, String(n || '').replace(/[\t\n]/g, ' ')].join('\t'));
  for (const p of r.profiles) line(`profile-${p.kind}`, p.status, p.bytes, p.path, p.note);
  for (const w of r.worktrees) line('worktree-out', w.status, w.bytes, w.out, w.note);
  for (const s of r.scratch) line('scratch', s.status, s.bytes, s.path, s.note);
  for (const i of r.evidence.items) line('evidence', i.missing ? 'missing' : 'keep', 0, i.resolved || i.path, `${i.topic}: ${i.why}${i.fastworkDerived ? ' (Fastwork-derived: gitignored, must keep)' : ''}`);
  return L.join('\n') + '\n';
}
