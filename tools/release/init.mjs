#!/usr/bin/env node
// npm run init (I-268): install the public release's large files (the frozen snapshot site/ + site-pretty/, reviewed
// pictures and videos, data) that its repo does not carry, listed in tools/release/release-assets.json:
//   {"version":1, "release":"<tag>", "repo":"<owner>/<repo>" (optional),
//    "assets":[{"name":"snapshot-<id>.tar.gz", "sha256":"…", "bytes":N, "unpackTo":".", "kind":"snapshot"|"media"|"data",
//               "redacted":[{"path":"site-pretty/…", "rule":"secret-kv", "originalBlob":"…", "redactedBlob":"…"}] (snapshot only, I-270)}]}
//
//   npm run init                                  # download from https://github.com/<owner>/<repo>/releases/download/<tag>/<name>
//   node tools/release/init.mjs --from <dir>      # the same files from a local folder (offline, tests)
//   node tools/release/init.mjs --repo <owner>/<repo> | --assets <file> | --dry-run | --keep-downloads
//
// Fail-closed, in this order, and nothing is written outside out/release-init/ until every check passed:
//   1. fetch every asset not yet installed into out/release-init/downloads/ (public URL via Node fetch, no gh needed),
//      checking its size and sha256 (a bad file is deleted);
//   2. unpack each into its own staging dir (tar; absolute paths, `..`, `.git/`, links and special files refused from
//      the listing, before anything is extracted);
//   3. the snapshot asset's site/ and site-pretty/ must have the git tree ids baseline.json pins (tools/lib/baseline.mjs
//      dirTreeId); no other asset may write under them. I-270: a file the release redacted (a secret-shaped value in
//      vendored code) must have its listed redactedBlob and counts as its originalBlob; the list must be the one HEAD's
//      committed release-assets.json holds; any other difference fails;
//   4. no target file may exist with other bytes (identical files are skipped); then the files are moved into place
//      (site/ and site-pretty/ listed in .git/info/exclude when HEAD does not track them), and `baseline.mjs status`
//      must say ok (untracked, verified).
// The snapshot is skipped when the checkout already has the pinned one (tracked, as in the study repo, or verified).
// Exit 0 done (or nothing to do), 1 a check failed (nothing installed), 2 usage, 3 the baseline check after install failed.
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, renameSync, lstatSync, readdirSync, createReadStream, createWriteStream, statSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { exitOnHelp } from '../lib/help.mjs';

exitOnHelp(import.meta.url);
delete process.env.FW_MIRROR_HOME; // install into and check this checkout, never a fixture override
const { REPO } = await import('../lib/paths.mjs');
const { TREES, PIN_FILE, RELEASE_MANIFEST, readPin, dirTreeId, baselineStatus, redactionList, releaseRedactions } = await import('../lib/baseline.mjs');

const argv = process.argv.slice(2);
const KNOWN = new Set(['--from', '--repo', '--assets', '--dry-run', '--keep-downloads']);
const VALUED = new Set(['--from', '--repo', '--assets']);
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const [k, v] = argv[i].includes('=') ? [argv[i].slice(0, argv[i].indexOf('=')), argv[i].slice(argv[i].indexOf('=') + 1)] : [argv[i], null];
  if (!KNOWN.has(k)) usage(`unknown argument ${argv[i]}`);
  if (VALUED.has(k)) { const val = v ?? argv[++i]; if (!val) usage(`${k} needs a value`); opts[k.slice(2)] = val; } else opts[k.slice(2)] = true;
}
function usage(msg) { console.error(`init.mjs: ${msg} (see --help)`); process.exit(2); }
class Fail extends Error {}
const fail = (msg) => { throw new Fail(msg); };

const WORK = join(REPO, 'out', 'release-init');
const DOWNLOADS = join(WORK, 'downloads');
const INSTALLED = join(WORK, 'installed.json');
const KINDS = new Set(['snapshot', 'media', 'data']);

/** release-assets.json, validated: a bad manifest is a usage error (exit 2), nothing fetched. */
function loadManifest(file) {
  let m;
  try { m = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { usage(`cannot read ${file}: ${e.code === 'ENOENT' ? 'no such file (the release packer writes it)' : e.message}`); }
  if (m?.version !== 1) usage(`${file}: "version" must be 1`);
  if (typeof m.release !== 'string' || !/^[\w.+-]+$/.test(m.release)) usage(`${file}: "release" must be a tag name`);
  if (m.repo != null && !/^[\w.-]+\/[\w.-]+$/.test(m.repo)) usage(`${file}: "repo" must be <owner>/<repo>`);
  if (!Array.isArray(m.assets) || !m.assets.length) usage(`${file}: "assets" must be a non-empty list`);
  const names = new Set();
  for (const a of m.assets) {
    const where = `${file}: asset ${JSON.stringify(a?.name)}`;
    if (typeof a?.name !== 'string' || !/^[\w][\w.+-]*\.(tar\.gz|tgz|tar)$/.test(a.name)) usage(`${where}: "name" must be a plain .tar.gz / .tgz / .tar file name`);
    if (names.has(a.name)) usage(`${where}: listed twice`);
    names.add(a.name);
    if (!/^[0-9a-f]{64}$/.test(a.sha256 ?? '')) usage(`${where}: "sha256" must be 64 hex digits`);
    if (!Number.isSafeInteger(a.bytes) || a.bytes < 0) usage(`${where}: "bytes" must be a byte count`);
    if (!KINDS.has(a.kind)) usage(`${where}: "kind" must be snapshot, media or data`);
    a.unpackTo ??= '.';
    if (typeof a.unpackTo !== 'string' || isAbsolute(a.unpackTo) || a.unpackTo.split(/[\\/]/).includes('..') || gitSegment(a.unpackTo)) usage(`${where}: "unpackTo" must be a path inside the checkout, outside .git/`);
  }
  const red = redactionList(m);
  if (red.error) usage(`${file}: ${red.error}`);
  return m;
}

const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
async function sha256File(f) {
  const h = createHash('sha256');
  await pipeline(createReadStream(f), async function* (src) { for await (const c of src) h.update(c); });
  return h.digest('hex');
}

/** Stream `src` (a Node Readable) into `dest`, checking size and sha256 on the way; a bad copy is deleted. */
async function receive(src, dest, a) {
  const part = `${dest}.part`;
  const h = createHash('sha256');
  let n = 0;
  const check = new Transform({
    transform(chunk, _e, cb) {
      n += chunk.length;
      if (n > a.bytes) return cb(new Fail(`${a.name}: more than the ${a.bytes} bytes release-assets.json lists`));
      h.update(chunk);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(src, check, createWriteStream(part));
    if (n !== a.bytes) fail(`${a.name}: ${n} bytes, release-assets.json lists ${a.bytes}`);
    const got = h.digest('hex');
    if (got !== a.sha256) fail(`${a.name}: sha256 ${got.slice(0, 12)}… does not match release-assets.json's ${a.sha256.slice(0, 12)}…`);
    renameSync(part, dest);
  } catch (e) {
    rmSync(part, { force: true });
    throw e instanceof Fail ? e : new Fail(`${a.name}: ${e.message}`);
  }
}

function assetUrl(m, a) {
  const repo = opts.repo ?? m.repo;
  if (!repo) usage('no "repo" in release-assets.json: pass --repo <owner>/<repo> or --from <dir>');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) usage('--repo must be <owner>/<repo>');
  const base = (process.env.FW_RELEASE_BASE_URL || 'https://github.com').replace(/\/+$/, ''); // tests: a local server
  return `${base}/${repo}/releases/download/${encodeURIComponent(m.release)}/${encodeURIComponent(a.name)}`;
}

/** Get one asset into DOWNLOADS (a verified earlier download is reused). */
async function fetchAsset(m, a) {
  const dest = join(DOWNLOADS, a.name);
  if (existsSync(dest) && statSync(dest).size === a.bytes && (await sha256File(dest)) === a.sha256) return console.log(`GOT ${a.name}: ${a.bytes} bytes, sha256 ok (earlier download)`);
  rmSync(dest, { force: true });
  if (opts.from) {
    const src = join(resolve(opts.from), a.name);
    if (!existsSync(src)) fail(`MISSING ${a.name}: not in ${resolve(opts.from)}`);
    await receive(createReadStream(src), dest, a);
    return console.log(`GOT ${a.name}: ${a.bytes} bytes, sha256 ok (from ${resolve(opts.from)})`);
  }
  const url = assetUrl(m, a);
  let res;
  try { res = await fetch(url, { redirect: 'follow' }); } catch (e) { fail(`${a.name}: download failed: ${e.cause?.code || e.message} (${url})`); }
  if (res.status === 404) fail(`MISSING ${a.name}: HTTP 404 at ${url}`);
  if (!res.ok || !res.body) fail(`${a.name}: HTTP ${res.status} at ${url}`);
  await receive(Readable.fromWeb(res.body), dest, a);
  console.log(`GOT ${a.name}: ${a.bytes} bytes, sha256 ok (${url})`);
}

/** Every regular file below `dir` as a relative path; links and special files are refused. */
function filesBelow(dir, name) {
  const out = [];
  const walk = (abs, rel) => {
    for (const n of readdirSync(abs).sort()) {
      const r = rel ? `${rel}/${n}` : n;
      const st = lstatSync(join(abs, n));
      if (st.isDirectory()) walk(join(abs, n), r);
      else if (st.isFile()) out.push(r);
      else fail(`${name}: ${r} is a link or special file; release files hold regular files only`);
    }
  };
  walk(dir, '');
  return out;
}

/** A path segment that would write into a git dir (case-insensitive file systems: `.GIT` too). */
const gitSegment = (p) => p.split(/[\\/]/).some((s) => s.toLowerCase() === '.git');

/** tar into `dest`, after checking the listing: no absolute path, no `..`, no `.git`, only files and directories. */
function unpack(file, dest, name) {
  const tarList = (flags) => {
    const r = spawnSync('tar', [flags, file], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status !== 0) fail(`${name}: not a readable tar file (${(r.stderr || '').trim().split('\n')[0]})`);
    return r.stdout.split('\n').filter(Boolean);
  };
  const names = tarList('-tf');
  const long = tarList('-tvf'); // same entries, same order; the first character is the type (bsdtar and GNU tar)
  if (long.length !== names.length) fail(`${name}: the archive listing is ambiguous (${names.length} names, ${long.length} entries)`);
  for (const [i, e] of names.entries()) {
    if (isAbsolute(e) || /^[A-Za-z]:/.test(e) || e.split(/[\\/]/).includes('..')) fail(`${name}: unsafe path in the archive: ${e}`);
    if (gitSegment(e)) fail(`${name}: ${e} would write into a .git directory`);
    if (!'-d'.includes(long[i][0])) fail(`${name}: ${e.replace(/\/$/, '')} is a link or special file (type ${long[i][0]}); release files hold regular files only`);
  }
  mkdirSync(dest, { recursive: true });
  const x = spawnSync('tar', ['-xf', file, '-C', dest], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (x.status !== 0) fail(`${name}: tar failed (${(x.stderr || '').trim().split('\n')[0]})`);
}

/**
 * A checkout whose HEAD does not track the snapshot (the release) keeps the unpacked site/ and site-pretty/ out of
 * `git status` and the scope guard (tools/scope.mjs counts untracked files) through .git/info/exclude: local, whatever
 * the repo's .gitignore says. Never where HEAD tracks them: there the ignore would hide a re-mirror's new files.
 */
function excludeSnapshot() {
  const g = (...a) => spawnSync('git', a, { cwd: REPO, encoding: 'utf8' });
  const want = TREES.filter((t) => g('rev-parse', '--verify', '-q', `HEAD:${t}`).status !== 0).map((t) => `/${t}/`);
  const p = g('rev-parse', '--git-path', 'info/exclude');
  if (!want.length || p.status !== 0 || !p.stdout.trim()) return;
  const f = resolve(REPO, p.stdout.trim());
  const have = existsSync(f) ? readFileSync(f, 'utf8') : '';
  const add = want.filter((l) => !have.split('\n').includes(l));
  if (!add.length) return;
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, `${have}${have && !have.endsWith('\n') ? '\n' : ''}# npm run init (I-268): the snapshot unpacked from the release file\n${add.join('\n')}\n`);
}

const sameFile = (a, b) => { const sa = statSync(a), sb = statSync(b); return sa.size === sb.size && readFileSync(a).equals(readFileSync(b)); };

async function main() {
  const manifestFile = resolve(opts.assets ?? join(REPO, 'tools', 'release', 'release-assets.json'));
  const m = loadManifest(manifestFile);
  const pin = readPin(REPO);
  const snapAssets = m.assets.filter((a) => a.kind === 'snapshot');
  if (snapAssets.length && (!pin || pin.error)) fail(`no usable ${PIN_FILE} in ${REPO}${pin?.error ? ` (${pin.error})` : ''}: the snapshot cannot be verified`);
  const before = snapAssets.length ? baselineStatus() : null;
  const haveSnapshot = before?.state === 'ok';
  if (snapAssets.length && !haveSnapshot) {
    const present = TREES.filter((t) => existsSync(join(REPO, t)));
    if (present.length) fail(`${present.map((t) => `${t}/`).join(' and ')} exist but are not the pinned snapshot ${pin.snapshot} (${before.state}): move them away (or delete them), then run npm run init again`);
  }
  const installed = readJson(INSTALLED, {});
  const todo = [];
  for (const a of m.assets) {
    if (a.kind === 'snapshot' && haveSnapshot) { console.log(`SKIP ${a.name}: the pinned snapshot ${pin.snapshot} is already in place (${before.source ?? 'tracked by git'})`); continue; }
    const rec = installed[a.name];
    if (a.kind !== 'snapshot' && rec?.sha256 === a.sha256 && Array.isArray(rec.files) && rec.files.every((f) => existsSync(join(REPO, f)))) { console.log(`SKIP ${a.name}: already installed`); continue; }
    todo.push(a);
  }
  console.log(`INIT ${m.release}: ${todo.length} of ${m.assets.length} asset(s) to install${todo.length ? ` from ${opts.from ? resolve(opts.from) : assetUrl(m, todo[0]).slice(0, -encodeURIComponent(todo[0].name).length)}` : ''}`);
  if (opts['dry-run']) {
    for (const a of todo) console.log(`WOULD FETCH ${a.name} (${a.bytes} bytes, ${a.kind}) ${opts.from ? join(resolve(opts.from), a.name) : assetUrl(m, a)} -> ${a.unpackTo}`);
    return 0;
  }
  if (!todo.length) { console.log(`INIT OK ${m.release}: nothing to do`); return 0; }

  // 1. fetch and check every file first
  mkdirSync(DOWNLOADS, { recursive: true });
  for (const a of todo) await fetchAsset(m, a);

  // 2-4. unpack into staging, verify, check targets; only then move
  const stage = mkdtempSync(join(WORK, 'stage-'));
  let interrupted = false;
  try {
    const plan = []; // {a, files: [{src, rel}]}
    const seen = new Map();
    for (const [i, a] of todo.entries()) {
      const root = join(stage, String(i));
      const base = join(root, a.unpackTo);
      unpack(join(DOWNLOADS, a.name), base, a.name);
      const files = filesBelow(root, a.name).map((r) => ({ src: join(root, r), rel: r }));
      for (const f of files) {
        if (gitSegment(f.rel)) fail(`${a.name}: ${f.rel} would write into a .git directory`);
        const top = f.rel.split('/')[0];
        if (a.kind !== 'snapshot' && TREES.includes(top)) fail(`${a.name}: a ${a.kind} file may not write the snapshot (${f.rel})`);
        if (seen.has(f.rel)) fail(`${a.name} and ${seen.get(f.rel)} both hold ${f.rel}`);
        seen.set(f.rel, a.name);
      }
      if (a.kind === 'snapshot') {
        const have = {};
        const { swaps } = redactionList({ assets: [a] });
        // the swaps count only as HEAD's committed manifest lists them (as the baseline check reads them later): an
        // edited or other manifest cannot widen them
        const head = releaseRedactions(REPO);
        if (head.error) fail(`${a.name}: HEAD:${RELEASE_MANIFEST}: ${head.error}`);
        if (JSON.stringify(swaps) !== JSON.stringify(head.swaps)) fail(`SNAPSHOT-MISMATCH ${a.name}: its list of redacted files (${swaps.length}) is not the one HEAD:${RELEASE_MANIFEST} commits (${head.swaps.length}); was the manifest edited after packing?`);
        for (const t of TREES) {
          if (!existsSync(join(root, t))) fail(`${a.name}: has no ${t}/ (unpacked to ${a.unpackTo}); a snapshot file holds ${TREES.join('/ and ')}/ at the checkout root`);
          try { have[t] = dirTreeId(root, t, { swaps }); } catch (e) { fail(`SNAPSHOT-MISMATCH ${a.name}: ${e.message}`); }
        }
        const bad = TREES.filter((t) => have[t] !== pin.trees[t]);
        if (bad.length) fail(`SNAPSHOT-MISMATCH ${a.name}: ${bad.map((t) => `${t} tree ${have[t].slice(0, 10)}, ${PIN_FILE} pins ${pin.trees[t].slice(0, 10)}`).join('; ')}: not the snapshot ${pin.snapshot} (a changed byte?)`);
        console.log(`VERIFIED ${a.name}: ${TREES.map((t) => `${t} ${have[t].slice(0, 10)}`).join(', ')} = ${PIN_FILE} ${pin.snapshot}${swaps.length ? ` (${swaps.length} redacted file(s) counted as their original blobs)` : ''}`);
      }
      plan.push({ a, files });
    }
    const conflicts = [];
    for (const { files } of plan) {
      for (const f of files) {
        f.dest = join(REPO, f.rel);
        let p = dirname(f.dest);
        while (p.length > REPO.length && !existsSync(p)) p = dirname(p);
        if (p.length > REPO.length && !lstatSync(p).isDirectory()) { conflicts.push(`${relative(REPO, p)} is a file, ${f.rel} needs a directory there`); continue; }
        if (!existsSync(f.dest)) continue;
        if (lstatSync(f.dest).isFile() && sameFile(f.src, f.dest)) f.same = true;
        else conflicts.push(`${f.rel} exists with other content`);
      }
    }
    if (conflicts.length) fail(`CONFLICT: ${conflicts.length} target(s) in ${REPO}, nothing installed; move them away, then run npm run init again:\n  ${conflicts.slice(0, 10).join('\n  ')}${conflicts.length > 10 ? `\n  … ${conflicts.length - 10} more` : ''}`);
    if (plan.some(({ a }) => a.kind === 'snapshot')) excludeSnapshot();
    // the move: no check is left that can fail; an interrupt waits until every file is in place
    const onSig = () => { interrupted = true; };
    process.on('SIGINT', onSig);
    process.on('SIGTERM', onSig);
    for (const { a, files } of plan) {
      let moved = 0;
      for (const f of files) {
        if (f.same) continue;
        mkdirSync(dirname(f.dest), { recursive: true });
        renameSync(f.src, f.dest);
        moved++;
      }
      if (a.kind !== 'snapshot') installed[a.name] = { sha256: a.sha256, files: files.map((f) => f.rel), at: new Date().toISOString() };
      console.log(`UNPACKED ${a.name} -> ${a.unpackTo}: ${moved} file(s)${files.length - moved ? `, ${files.length - moved} already identical` : ''}`);
    }
    writeFileSync(INSTALLED, JSON.stringify(installed, null, 1) + '\n');
    process.off('SIGINT', onSig);
    process.off('SIGTERM', onSig);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  if (!opts['keep-downloads']) for (const a of todo) rmSync(join(DOWNLOADS, a.name), { force: true });
  if (todo.some((a) => a.kind === 'snapshot')) {
    const s = baselineStatus();
    if (s.state !== 'ok') { console.error(`init.mjs: installed, but the baseline check says ${s.state}:\n  ${s.message}`); return 3; }
    console.log(`BASELINE ${s.snapshot} ok (${s.source ?? 'tracked by git'})`);
  }
  console.log(`INIT OK ${m.release}: ${todo.length} asset(s) installed`);
  return interrupted ? 130 : 0;
}

try {
  process.exitCode = await main();
} catch (e) {
  console.error(`INIT FAILED: ${e instanceof Fail ? e.message : `unexpected: ${e.stack || e.message}`}`);
  process.exitCode = 1;
}
