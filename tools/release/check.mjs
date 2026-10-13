// tools/release/check.mjs: the release's fail-closed residual check (I-269; memory/public-release.md).
//   node tools/release/check.mjs <dir|bare.git> [--known <file>]
// Scans everything for the scrub rules (tools/release/rules.mjs, built from the known values file, default
// ~/.cache/fw-release/known.json or $FW_RELEASE_KNOWN):
//   - a directory: every file's bytes and every file and directory name (symlinks: their target text, never followed);
//     a `.git` inside it is scanned as a git repo (below), not as raw files;
//   - a git dir (bare, or a checkout's .git): every object in its object store, reachable or not: every blob, every
//     commit and tag message and header line (but the author, committer and tagger lines: the user keeps their name;
//     `encoding`, `mergetag`, `gpgsig` and the tag name are scanned), every tree entry name, and every ref name.
// Binary files and blobs (a NUL in the first 8 KiB, filter-repo's test) are scanned as bytes for the literal values
// only. Literals match in any ASCII letter case.
// Output: "CHECK 0 residual", exit 0; or one line per hit "HIT <rule-id> <path>:<line>" then "CHECK <n> residual",
// exit 1. Git hits name `<path>@<blob10>`, `commit@<sha10>`, `tag@<sha10>`, `tree@<sha10>/<name>` or `ref@<name>`; any
// printed name has its matches replaced by their tokens, so no value is ever printed. Exit 2: usage or a bad known file.
import { readdirSync, lstatSync, readFileSync, readlinkSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { exitOnHelp, isMain } from '../lib/help.mjs';
import { loadKnown, buildRules, scanText, safeText, tildify } from './rules.mjs';

exitOnHelp(import.meta.url);

const isBinary = (buf) => buf.subarray(0, 8192).includes(0);
/** env for git on another repo: no inherited GIT_DIR & co (a hook exports them), no optional index writes */
export function gitEnv(extra = {}) {
  const e = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  for (const k of Object.keys(e)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX)$/.test(k)) delete e[k];
  return { ...e, ...extra };
}

/** true when p is a git directory (bare repo or a checkout's .git dir). */
export function isGitDir(p) {
  try {
    return statSync(p).isDirectory() && existsSync(join(p, 'HEAD')) && existsSync(join(p, 'objects')) && existsSync(join(p, 'refs'));
  } catch { return false; }
}

/** The git dir holding the objects for a `.git` entry (a dir, or the gitfile "gitdir: …" of a linked worktree). */
function gitDirOf(dotgit) {
  if (lstatSync(dotgit).isDirectory()) return dotgit;
  const m = readFileSync(dotgit, 'utf8').match(/^gitdir:\s*(.+)$/m);
  if (!m) return null;
  const gd = resolve(dotgit, '..', m[1].trim());
  if (isGitDir(gd)) return gd;
  try { const c = resolve(gd, readFileSync(join(gd, 'commondir'), 'utf8').trim()); return isGitDir(c) ? c : null; } catch { return null; }
}

/** Scan a directory tree. hit(id, where, line) is called per hit. */
export async function checkDir(root, rules, hit) {
  const show = (s) => safeText(s, rules);
  const walk = async (dir) => {
    let names;
    try { names = readdirSync(dir).sort(); } catch { hit('unreadable', show(relative(root, dir) || '.'), 0); return; }
    for (const name of names) {
      const p = join(dir, name), rel = relative(root, p), shown = show(rel);
      for (const h of scanText(name, rules, { path: rel })) hit(h.id, `name@${shown}`, 0);
      let st;
      try { st = lstatSync(p); } catch { hit('unreadable', shown, 0); continue; }
      if (name === '.git') {
        let gd = null;
        try { gd = gitDirOf(p); } catch {}
        if (gd) await checkGit(gd, rules, (id, where, line) => hit(id, `${shown}:${where}`, line));
        else hit('unreadable', shown, 0);
        continue;
      }
      if (st.isSymbolicLink()) { for (const h of scanText(readlinkSync(p), rules, { path: rel })) hit(h.id, `${shown}->`, h.line); continue; }
      if (st.isDirectory()) { await walk(p); continue; }
      if (!st.isFile()) continue;
      let buf;
      try { buf = readFileSync(p); } catch { hit('unreadable', shown, 0); continue; }
      for (const h of scanText(buf, rules, { path: rel, literalsOnly: isBinary(buf) })) hit(h.id, shown, h.line);
    }
  };
  await walk(root);
}

/** Every object of a git dir via one `cat-file --batch-all-objects --batch` stream: onObject(oid, type, data). */
export function eachObject(gitDir, onObject) {
  return new Promise((done, fail) => {
    const p = spawn('git', ['--git-dir', gitDir, 'cat-file', '--batch-all-objects', '--batch', '--unordered'], { stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv() });
    let err = '', chunks = [], have = 0, need = null, oid = '', type = '';
    p.stderr.on('data', (d) => (err += d));
    const joined = () => { if (chunks.length > 1) chunks = [Buffer.concat(chunks)]; return chunks[0] || Buffer.alloc(0); };
    p.stdout.on('data', (d) => {
      chunks.push(d); have += d.length;
      for (;;) {
        if (need === null) {          // a header line "<oid> <type> <size>"
          const b = joined(), nl = b.indexOf(10);
          if (nl < 0) return;
          const f = b.subarray(0, nl).toString().split(' ');
          [oid, type] = f; need = Number(f[2]) + 1;
          chunks = [b.subarray(nl + 1)]; have = b.length - nl - 1;
        }
        if (have < need) return;      // body and its newline: concatenated once, when complete
        const b = joined();
        onObject(oid, type, b.subarray(0, need - 1));
        chunks = [b.subarray(need)]; have = b.length - need; need = null;
      }
    });
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? done() : fail(new Error(`git cat-file failed (${code}): ${err.trim().split('\n')[0]}`))));
  });
}

/** Scan a git dir: every blob, commit/tag message, tree entry name and ref name. hit(id, where, line). */
export async function checkGit(gitDir, rules, hit) {
  const git = (...a) => execFileSync('git', ['--git-dir', gitDir, ...a], { encoding: 'latin1', maxBuffer: 2 ** 31, env: gitEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  const show = (s) => safeText(s, rules);
  const pathOf = new Map();   // blob oid -> the first path naming it (reachable blobs; the others print "(unreachable)")
  try {
    for (const l of git('rev-list', '--objects', '--all', '--reflog').split('\n')) {
      const i = l.indexOf(' ');
      if (i > 0 && !pathOf.has(l.slice(0, i))) pathOf.set(l.slice(0, i), Buffer.from(l.slice(i + 1), 'latin1').toString('utf8'));
    }
  } catch { /* an empty repo has no revisions */ }
  let oidBytes = 20;
  try { if (git('rev-parse', '--show-object-format').trim() === 'sha256') oidBytes = 32; } catch {}
  let objects = 0;
  await eachObject(gitDir, (oid, type, data) => {
    objects++;
    const o10 = oid.slice(0, 10);
    if (type === 'blob') {
      const path = pathOf.get(oid) ?? '(unreachable)';
      for (const h of scanText(data, rules, { path, literalsOnly: isBinary(data) })) hit(h.id, `${show(path)}@${o10}`, h.line);
    } else if (type === 'commit' || type === 'tag') {
      const end = data.indexOf('\n\n');
      const head = end < 0 ? data : data.subarray(0, end), body = end < 0 ? Buffer.alloc(0) : data.subarray(end + 2);
      const headLines = head.toString('latin1').split('\n');
      // every header line but the identities (kept by the user's choice): a tag's name, encoding, mergetag, gpgsig
      headLines.forEach((l, i) => {
        if (/^(author|committer|tagger) /.test(l)) return;
        for (const h of scanText(Buffer.from(l, 'latin1'), rules)) hit(h.id, `${type}@${o10}`, i + 1);
      });
      for (const h of scanText(body, rules)) hit(h.id, `${type}@${o10}`, h.line + headLines.length + 1);
    } else if (type === 'tree') {
      for (let i = 0; i < data.length;) {
        const sp = data.indexOf(32, i), nul = sp < 0 ? -1 : data.indexOf(0, sp);
        if (nul < 0) break;
        const name = data.subarray(sp + 1, nul);
        for (const h of scanText(name, rules, { path: name.toString('utf8') })) hit(h.id, `tree@${o10}/${show(name.toString('utf8'))}`, 0);
        i = nul + 1 + oidBytes;
      }
    }
  });
  let refs = '';
  try { refs = git('for-each-ref', '--format=%(refname)'); } catch {}
  for (const r of refs.split('\n').filter(Boolean)) for (const h of scanText(Buffer.from(r, 'latin1'), rules)) hit(h.id, `ref@${show(r)}`, 0);
  return objects;
}

/** Check a dir or a git dir; returns {hits:[{id, where, line}]}. */
export async function check(target, rules) {
  const hits = [];
  const hit = (id, where, line) => hits.push({ id, where, line });
  if (isGitDir(target)) await checkGit(target, rules, hit);
  else await checkDir(target, rules, hit);
  return { hits };
}

export function formatHits(hits) {
  return [...hits.map((h) => `HIT ${h.id} ${h.where}:${h.line}`), `CHECK ${hits.length} residual`].join('\n') + '\n';
}

async function main(argv) {
  const pos = [], opt = {};
  const usage = 'usage: check.mjs <dir|bare.git> [--known <file>]';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--known') opt.known = argv[++i];
    else if (argv[i].startsWith('--')) { console.error(`${usage} (unknown option ${argv[i]})`); return 2; }
    else pos.push(argv[i]);
  }
  if (pos.length !== 1 || !existsSync(pos[0])) { console.error(usage); return 2; }
  let rules;
  try { rules = buildRules(loadKnown(opt.known)); } catch (e) { console.error(`CHECK refused: ${e.message}`); return 2; }
  const target = resolve(pos[0]);
  let res;
  try { res = await check(target, rules); } catch (e) { console.error(`CHECK failed on ${tildify(target)}: ${safeText(e.message, rules)}`); return 1; }
  process.stdout.write(formatHits(res.hits));
  return res.hits.length ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
