// Overlays for tools/bench.mjs, always rebuilt from committed patches into out/bench/overlays/<name>/
// (never the owner's fixes/<topic>/overlay/, design §4): the same `git apply --directory` path as
// `fix.mjs apply|combine`, the patch header's base-sha256 lines (BASELINE-CHANGED), and the landing
// order of fixes/*/patch.diff on main (bench reconfirm's `_landed` overlay).
import { existsSync, mkdirSync, copyFileSync, rmSync, readFileSync, writeFileSync, readdirSync, cpSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const sha256File = (f) => sha256(readFileSync(f));

/** Header facts of a patch.diff written by `fix.mjs diff`. */
export function patchHeader(text) {
  const stacked = text.match(/^# STACKED on fixes\/([^/\s]+)\/overlay/m);
  const baseShas = {};
  for (const m of text.matchAll(/^# base-sha256 (\S+) (\S+)/gm)) baseShas[m[1]] = /^[0-9a-f]{64}$/.test(m[2]) ? m[2] : null;
  const files = [...text.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1].trim());
  return { stackedOn: stacked ? stacked[1] : null, baseShas, files };
}

/**
 * Files of an unstacked patch whose baseline bytes differ from the ones the patch was made against
 * (header base-sha256). Non-empty means the mirror was re-taken since: BASELINE-CHANGED, not FAIL.
 */
export function baselineDrift(text, base) {
  const h = patchHeader(text);
  if (h.stackedOn) return [];
  const out = [];
  for (const [rel, want] of Object.entries(h.baseShas)) {
    if (!want) continue;
    const f = join(base, rel);
    const got = existsSync(f) ? sha256File(f) : null;
    if (got !== want) out.push({ file: rel, want, got });
  }
  return out;
}

function listFiles(dir, root = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) listFiles(f, root, out); else if (e.name !== '.DS_Store') out.push(relative(root, f).split(sep).join('/'));
  }
  return out.sort();
}
export { listFiles };

/**
 * Build `dest` from scratch: copy each dir of `seedDirs` (a live overlay to stack on, later dirs lose),
 * then apply `patches` ([{name, text}]) in order with `git apply --directory` (run in `repo`, so `dest`
 * must lie inside it). A patch that doesn't apply on top of the earlier ones is reported as a conflict
 * and not applied; the rest continue. Returns [{name, ok, files, error}].
 */
export function buildOverlay({ repo, dest, base, patches = [], seedDirs = [] }) {
  const rel = relative(repo, dest).split(sep).join('/');
  if (!rel || rel.startsWith('..')) throw new Error(`overlay dir ${dest} must be inside ${repo}`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const d of [...seedDirs].reverse()) if (existsSync(d)) cpSync(d, dest, { recursive: true });
  const tmp = join(dirname(dest), `.${relative(dirname(dest), dest)}.patches`);
  mkdirSync(tmp, { recursive: true });
  const report = [];
  for (const [i, p] of patches.entries()) {
    const h = patchHeader(p.text);
    const copied = [];
    for (const f of h.files) {
      const d = join(dest, f), s = join(base, f);
      if (!existsSync(d) && existsSync(s)) { mkdirSync(dirname(d), { recursive: true }); copyFileSync(s, d); copied.push(d); }
    }
    const pf = join(tmp, `${String(i).padStart(2, '0')}-${p.name.replace(/[^\w.-]+/g, '_')}.diff`);
    writeFileSync(pf, p.text);
    const git = (...a) => spawnSync('git', ['apply', '--whitespace=nowarn', `--directory=${rel}`, ...a, pf], { cwd: repo, encoding: 'utf8' });
    const chk = git('--check');
    if (chk.status !== 0) {
      for (const d of copied) rmSync(d, { force: true }); // leave dest as it was before this patch
      report.push({ name: p.name, ok: false, files: h.files, error: (chk.stdout + chk.stderr).trim() });
      continue;
    }
    const r = git();
    report.push({ name: p.name, ok: r.status === 0, files: h.files, error: r.status === 0 ? undefined : (r.stdout + r.stderr).trim() });
  }
  rmSync(tmp, { recursive: true, force: true });
  return report;
}

function git(repo, ...a) {
  const r = spawnSync('git', a, { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}
/** Contents of `path` at `ref` (null if absent). */
export const gitShow = (repo, ref, path) => git(repo, 'show', `${ref}:${path}`);
export const gitRev = (repo, ref) => (git(repo, 'rev-parse', '--short', ref) || '').trim() || null;

/**
 * Topics whose fixes/<topic>/patch.diff exists at `ref`, in landing order: the first commit on the
 * first-parent history of `ref` that touched each patch (linear history, Hard rule 1).
 */
export function landedTopics(repo, ref = 'main') {
  const out = git(repo, 'log', '--first-parent', '--reverse', '--format=%x00%H', '--name-only', ref, '--', 'fixes/*/patch.diff');
  if (out == null) throw new Error(`git log ${ref} failed (no such ref?)`);
  const order = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^fixes\/([^/]+)\/patch\.diff$/);
    if (m && !order.includes(m[1])) order.push(m[1]);
  }
  return order.filter((t) => gitShow(repo, ref, `fixes/${t}/patch.diff`) != null);
}
