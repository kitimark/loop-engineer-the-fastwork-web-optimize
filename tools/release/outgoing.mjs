// tools/release/outgoing.mjs: the scrub check of what a push would publish (user, 2026-10-13: "only I push, after a
// scrub check"; CLAUDE.md Hard rules 1-2). .githooks/pre-push runs it on every push and refuses unless it exits 0.
//   node tools/release/outgoing.mjs [--remote origin] [--known <file>] [<range>]
//       by hand: lists and checks the commits not pushed yet: <range> in git rev-list syntax (e.g. origin/main..HEAD),
//       default HEAD --not --remotes=<remote> (the remote-tracking refs: as far as this clone last fetched)
//   node tools/release/outgoing.mjs --pre-push <remote> [<url>] [--known <file>]
//       the hook: reads git's pre-push lines "<local ref> <local oid> <remote ref> <remote oid>" on stdin
// Refused (pre-push): deleting a remote ref, pushing a tag or any ref outside refs/heads/, pushing anything but a commit
// (an annotated tag to a branch), a non-fast-forward update (also when the remote's commit is not here: fetch first),
// local changes to tools/release/ or .githooks/ (the hook runs the working-tree copies), and in both modes a merge
// commit among the outgoing commits (Hard rule 1). In the hook, what the remote has comes from the remote itself
// (`git ls-remote <url>`: every advertised commit that exists here, plus the pre-push lines' remote commits), never
// from local remote-tracking refs; an ls-remote failure refuses. Outgoing = the pushed commits minus what those reach.
// Every outgoing commit is checked with tools/release/check.mjs's rules (rules.mjs from the known values file, default
// ~/.cache/fw-release/known.json or $FW_RELEASE_KNOWN, plus the generic secret shapes), with git's replace refs off
// (git pack-objects sends the original objects): its message and header lines; its author and committer, which must
// already appear in the remote's history, as check.mjs --source does (a public identity line is kept, any other is
// `identity-unknown` and scanned); every path it adds or changes (`path-forbidden`: what .githooks/pre-commit and the
// release rewrite keep out of git: the snapshot site/ and site-pretty/, out/, overlays, .serena/cache/, *.pem,
// __pycache__/, volatile mirror files); every blob it adds or changes: text (UTF-16 decoded) fully; pictures through
// imagemeta.mjs shipImage (anything but `clean` refuses: `media-<kinds>`), videos through videoMeta; any other binary
// blob for the literal values only and refused (`binary-unchecked`) unless a known values file `allow` entry's path
// covers each of its outgoing paths; the pushed ref names.
// Output: "COMMIT <sha10> <subject>" per outgoing commit and "REFUSED <why>" lines, then check.mjs's "HIT <rule-id>
// <where>:<line>" lines and "CHECK <n> residual (<r> rules)"; every printed text has its rule matches replaced by their
// tokens, so no value is ever printed. Last line "OUTGOING <n> commit(s) to <remote>: clean" or "...: REFUSED".
// Exit 0 clean, 1 hits or refusals, 2 usage, a missing or bad known file, or a git error (fail closed).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { exitOnHelp, isMain } from '../lib/help.mjs';
import { loadKnown, buildRules, scanText, safeText, withSecrets } from './rules.mjs';
import { gitEnv, formatHits } from './check.mjs';
import { shipImage, videoMeta, sniffMedia, IMAGE_FILE } from './imagemeta.mjs';

exitOnHelp(import.meta.url);

const ZERO = /^0+$/;
const IDENT = /^(author|committer|tagger) (.*>) \d+ [+-]\d{4}$/;
const VIDEO_FILE = /\.(mp4|mov|m4v)$/i;
const isBinary = (buf) => buf.subarray(0, 8192).includes(0);
/** Paths no push publishes: .githooks/pre-commit's FORBIDDEN list and tools/release/rewrite.mjs DROP_PATHS. */
export const FORBIDDEN_PATHS = [/^out\//, /^fixes\/[^/]+\/overlay\//, /^\.serena\/cache\//, /\.pem$/i, /^site(-pretty)?\//, /(^|\/)__pycache__\//, /(^|\/)missing-local\.txt$/, /(^|\/)\.mirror\/chrome-profile\//];
/** The working-tree files the hook runs: a local change to them would run unreviewed code (or none) as the check. */
const HOOK_PATHS = ['tools/release', '.githooks'];

/** git in `cwd` (the repo being pushed), replace refs off; latin1 keeps bytes intact. Throws on a non-zero exit. */
function gitIn(cwd) {
  return (args, { input, encoding = 'latin1' } = {}) => execFileSync('git', args, { cwd, input, encoding: encoding === 'buffer' ? undefined : encoding, maxBuffer: 2 ** 31, env: gitEnv({ GIT_NO_REPLACE_OBJECTS: '1' }), stdio: ['pipe', 'pipe', 'pipe'] });
}

/** "Name <email>" of every author and committer in the history git log reaches from `revs` (args, or oids on stdin). */
export function publicIdentities(git, { args = [], oids = null } = {}) {
  const ids = new Set();
  if (oids && !oids.length) return ids;
  const out = git(['log', ...args, ...(oids ? ['--stdin'] : []), '--format=%an <%ae>%x00%cn <%ce>'], { encoding: 'utf8', input: oids ? oids.join('\n') + '\n' : undefined });
  for (const l of out.split('\n')) for (const x of l.split('\0')) if (x) ids.add(x);
  return ids;
}

/** The commits the remote `where` (URL or remote name) advertises that exist here (ls-remote; throws when it fails). */
export function remoteCommits(git, where) {
  if (!where || where.startsWith('-')) throw new Error('no remote to ask (ls-remote)');
  const oids = [...new Set(git(['ls-remote', where], { encoding: 'utf8' }).split('\n').map((l) => l.split('\t')[0]).filter((o) => /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(o)))];
  if (!oids.length) return [];
  return git(['cat-file', '--batch-check'], { input: oids.join('\n') + '\n', encoding: 'utf8' }).split('\n').map((l) => l.split(' ')).filter((f) => f[1] === 'commit').map((f) => f[0]);
}

/** Blobs of many oids in one `cat-file --batch`: oid -> Buffer. */
function readBlobs(git, oids) {
  const out = new Map();
  for (let i = 0; i < oids.length; i += 500) {
    const part = oids.slice(i, i + 500);
    const b = git(['cat-file', '--batch'], { input: part.join('\n') + '\n', encoding: 'buffer' });
    let off = 0;
    for (const oid of part) {
      const nl = b.indexOf(10, off);
      const head = b.subarray(off, nl).toString().split(' ');
      if (head[1] === 'missing' || head.length < 3) throw new Error(`blob ${oid.slice(0, 10)} is missing`);
      const n = Number(head[2]);
      out.set(oid, b.subarray(nl + 1, nl + 1 + n));
      off = nl + 1 + n + 1;
    }
  }
  return out;
}

/** UTF-16 text (a BOM, or every other byte 0 in the first 4 KiB) decoded, else null. */
export function utf16Text(buf) {
  const be = (b) => { const y = Buffer.from(b.subarray(0, b.length & ~1)); y.swap16(); return y.toString('utf16le'); };
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return be(buf.subarray(2));
  const n = Math.min(buf.length, 4096) & ~1;
  if (n < 8) return null;
  let le = 0, bg = 0;
  for (let i = 0; i < n; i += 2) { if (buf[i] && !buf[i + 1]) le++; if (!buf[i] && buf[i + 1]) bg++; }
  return le === n / 2 ? buf.toString('utf16le') : bg === n / 2 ? be(buf) : null;
}

/**
 * Check the commits `rev-list <args>` selects (oid lines on stdin when `input` is given) in repo `cwd`. Returns
 * {commits: [{sha, subject}], merges: [sha], hits: [{id, where, line}]}. identities: see publicIdentities.
 */
export function checkCommits(cwd, { args = [], input } = {}, rules, { identities }) {
  const git = gitIn(cwd);
  const rl = (extra) => git(['rev-list', ...extra, ...args, ...(input !== undefined ? ['--stdin'] : [])], { encoding: 'utf8', input }).split('\n').filter(Boolean);
  const list = rl(['--reverse']), merges = rl(['--merges']);
  const hits = [];
  const hit = (id, where, line) => hits.push({ id, where, line });
  const show = (s) => safeText(s, rules);
  const commits = [];
  const blobPaths = new Map(); // oid -> [path] (the paths it has in the outgoing commits)
  for (const sha of list) {
    const o10 = sha.slice(0, 10);
    const data = Buffer.from(git(['cat-file', 'commit', sha]), 'latin1');
    const end = data.indexOf('\n\n');
    const head = end < 0 ? data : data.subarray(0, end), body = end < 0 ? Buffer.alloc(0) : data.subarray(end + 2);
    const headLines = head.toString('latin1').split('\n');
    headLines.forEach((l, i) => {
      const m = l.match(IDENT);
      if (m) {
        if (identities.has(Buffer.from(m[2], 'latin1').toString('utf8'))) return; // public already: the user keeps it
        hit('identity-unknown', `commit@${o10}`, i + 1);
      }
      for (const h of scanText(Buffer.from(l, 'latin1'), rules, { allow: [] })) hit(h.id, `commit@${o10}`, i + 1);
    });
    for (const h of scanText(body, rules, { allow: [] })) hit(h.id, `commit@${o10}`, h.line + headLines.length + 1);
    commits.push({ sha, subject: show(body.toString('utf8').split('\n')[0]) });
    if (merges.includes(sha)) continue; // refused anyway; a merge's diff has no single parent
    // ":<old mode> <new mode> <old oid> <new oid> <status>\0<path>\0" per added, changed or deleted path
    const f = git(['diff-tree', '-r', '-z', '--no-renames', '--no-abbrev', '--no-commit-id', '--root', sha]).split('\0');
    for (let i = 0; i < f.length; i += 2) {
      if (!f[i] && i === f.length - 1) break; // the trailing NUL
      const m = f[i].match(/^:\d+ (\d+) [0-9a-f]+ ([0-9a-f]+) ([A-Z])$/);
      if (!m || f[i + 1] === undefined) { hit('diff-unparsed', `commit@${o10}`, 0); break; }
      if (m[3] === 'D') continue;
      const path = Buffer.from(f[i + 1], 'latin1').toString('utf8');
      for (const h of scanText(path, rules, { allow: [] })) hit(h.id, `path@${o10}/${show(path)}`, 0);
      if (FORBIDDEN_PATHS.some((re) => re.test(path))) hit('path-forbidden', `path@${o10}/${show(path)}`, 0);
      if (m[1] === '160000' || ZERO.test(m[2])) continue; // a submodule commit, no blob
      const l = blobPaths.get(m[2]);
      if (!l) blobPaths.set(m[2], [path]); else if (!l.includes(path)) l.push(path);
    }
  }
  const allow = rules.allow || [];
  const literalHits = (t) => scanText(t, rules, { literalsOnly: true, allow: [] }).length;
  const blobs = readBlobs(git, [...blobPaths.keys()]);
  for (const [oid, ps] of blobPaths) {
    const data = blobs.get(oid);
    const name = ps[0], where = `${show(name)}@${oid.slice(0, 10)}`;
    const here = allow.filter((a) => ps.every((p) => a.path.test(p)));
    const kind = sniffMedia(data);
    if (kind === 'video' || ps.some((p) => VIDEO_FILE.test(p))) {
      const v = videoMeta(data);
      if (v.risky.length) hit(`media-${v.risky.join('+')}`, where, 0);
    } else if (kind || ps.some((p) => IMAGE_FILE.test(p))) {
      const s = shipImage(data, { name: ps.find((p) => IMAGE_FILE.test(p)) ?? name, literalHits });
      if (s.action !== 'clean') hit(`media-${(s.risky.length ? s.risky : s.kinds).join('+') || s.action}`, where, 0);
    }
    const text = isBinary(data) ? utf16Text(data) : null;
    if (text !== null) { for (const h of scanText(text, rules, { path: name, allow: here })) hit(h.id, where, h.line); continue; }
    const binary = isBinary(data);
    if (binary && !kind && !ps.every((p) => allow.some((a) => a.path.test(p)))) hit('binary-unchecked', where, 0);
    for (const h of scanText(data, rules, { path: name, allow: here, literalsOnly: binary })) hit(h.id, where, h.line);
  }
  return { commits, merges, hits };
}

/**
 * The pre-push lines: {tips, have, refused: [why], hits}. A line "<local ref> <local oid> <remote ref> <remote oid>";
 * a delete has a zero local oid, a new remote ref a zero remote oid. hits: the pushed ref names' scan hits.
 */
export function prePushPlan(git, lines, rules) {
  const refused = [], tips = [], have = [], hits = [];
  for (const line of lines) {
    const [lref, loid, rref, roid] = line.trim().split(/\s+/);
    if (!lref) continue;
    if (!loid || !rref || !roid) { refused.push(`unreadable pre-push line ${JSON.stringify(line.slice(0, 80))}`); continue; }
    for (const h of scanText(rref, rules, { allow: [] })) hits.push({ id: h.id, where: `ref@${safeText(rref, rules)}`, line: 0 });
    if (ZERO.test(loid)) { refused.push(`deleting ${rref}: deletes are not pushed from here`); continue; }
    if (!rref.startsWith('refs/heads/')) { refused.push(`${rref}: only branches (refs/heads/*) are pushed; tags and other refs are refused`); continue; }
    let type = '';
    try { type = git(['cat-file', '-t', loid], { encoding: 'utf8' }).trim(); } catch {}
    if (type !== 'commit') { refused.push(`${lref} -> ${rref}: ${loid.slice(0, 10)} is ${type ? `a ${type}` : 'missing'}, not a commit`); continue; }
    if (!ZERO.test(roid)) {
      let known = true;
      try { git(['cat-file', '-e', `${roid}^{commit}`]); } catch { known = false; }
      if (!known) { refused.push(`${rref}: the remote is at ${roid.slice(0, 10)}, which is not here (fetch first, then rebase)`); continue; }
      let ff = true;
      try { git(['merge-base', '--is-ancestor', roid, loid]); } catch { ff = false; }
      if (!ff) { refused.push(`${rref}: not a fast-forward of the remote's ${roid.slice(0, 10)} (Hard rule 1: rebase, never rewrite what is pushed)`); continue; }
      have.push(roid);
    }
    tips.push(loid);
  }
  return { tips, have, refused, hits };
}

async function main(argv) {
  const usage = 'usage: outgoing.mjs [--remote <name>] [--known <file>] [<range>]  |  outgoing.mjs --pre-push <remote> [<url>] [--known <file>]';
  const opt = { remote: 'origin' }, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remote' || a === '--known') { if (argv[i + 1] === undefined) { console.error(usage); return 2; } opt[a.slice(2)] = argv[++i]; }
    else if (a === '--pre-push') { if (argv[i + 1] === undefined) { console.error(usage); return 2; } opt.prePush = true; opt.remote = argv[++i]; if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) opt.url = argv[++i]; }
    else if (a.startsWith('--')) { console.error(`${usage} (unknown option ${a})`); return 2; }
    else pos.push(a);
  }
  if (pos.length > 1 || (opt.prePush && pos.length)) { console.error(usage); return 2; }
  const stdin = opt.prePush ? readFileSync(0, 'latin1') : ''; // read it all first: git waits for the hook to take it
  let rules;
  try { rules = withSecrets(buildRules(loadKnown(opt.known))); } catch (e) { console.error(`OUTGOING refused: ${e.message}`); return 2; }
  const git = gitIn(process.cwd());
  const remote = opt.remote;
  try {
    let res = { commits: [], merges: [], hits: [] }, refused = [], refHits = [];
    if (opt.prePush) {
      const plan = prePushPlan(git, stdin.split('\n').filter((l) => l.trim()), rules);
      refused = plan.refused; refHits = plan.hits;
      const dirty = git(['status', '--porcelain', '--untracked-files=all', '--', ...HOOK_PATHS], { encoding: 'utf8' }).split('\n').filter(Boolean);
      if (dirty.length) refused.push(`${dirty.length} local change(s) in ${HOOK_PATHS.join('/ or ')}/ (the hook runs the working-tree copies): commit or restore them first`);
      if (plan.tips.length) {
        const theirs = remoteCommits(git, opt.url || remote);
        const input = [...plan.tips, '--not', ...plan.have, ...theirs].join('\n') + '\n';
        res = checkCommits(process.cwd(), { input }, rules, { identities: publicIdentities(git, { oids: [...new Set([...plan.have, ...theirs])] }) });
      }
    } else {
      const args = pos.length ? pos[0].split(/\s+/).filter(Boolean) : ['HEAD', '--not', `--remotes=${remote}`];
      res = checkCommits(process.cwd(), { args }, rules, { identities: publicIdentities(git, { args: [`--remotes=${remote}`] }) });
    }
    const hits = [...refHits, ...res.hits];
    for (const m of res.merges) refused.push(`merge commit ${m.slice(0, 10)} in the outgoing commits (Hard rule 1: rebase + fast-forward only)`);
    const out = [...res.commits.map((c) => `COMMIT ${c.sha.slice(0, 10)} ${c.subject}`), ...refused.map((r) => `REFUSED ${safeText(r, rules)}`)];
    const bad = refused.length || hits.length;
    process.stdout.write((out.length ? `${out.join('\n')}\n` : '') + formatHits(hits, rules.length) + `OUTGOING ${res.commits.length} commit(s) to ${safeText(remote, rules)}: ${bad ? 'REFUSED' : 'clean'}\n`);
    return bad ? 1 : 0;
  } catch (e) {
    console.error(`OUTGOING failed (refusing): ${safeText(String(e.stderr || e.message).trim().split('\n')[0], rules)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
