// tools/release/outgoing.mjs: the scrub check of what a push would publish (user, 2026-10-13: "only I push, after a
// scrub check"; CLAUDE.md Hard rules 1-2). .githooks/pre-push runs it on every push and refuses unless it exits 0.
//   node tools/release/outgoing.mjs [--remote origin] [--known <file>] [<range>]
//       by hand: lists and checks the commits not pushed yet: <range> in git rev-list syntax (e.g. origin/main..HEAD),
//       default HEAD --not --remotes=<remote>
//   node tools/release/outgoing.mjs --pre-push <remote> [<url>] [--known <file>]
//       the hook: reads git's pre-push lines "<local ref> <local oid> <remote ref> <remote oid>" on stdin
// Refused (pre-push): deleting a remote ref, pushing a tag or any ref outside refs/heads/, a non-fast-forward update
// (also when the remote's commit is not here: fetch first), and in both modes a merge commit among the outgoing commits
// (Hard rule 1). Outgoing = the pushed commits minus everything the remote-tracking refs of <remote> (and the remote's
// old commits) already reach.
// Every outgoing commit is checked with tools/release/check.mjs's rules (rules.mjs from the known values file, default
// ~/.cache/fw-release/known.json or $FW_RELEASE_KNOWN, plus the generic secret shapes): its message and header lines;
// its author and committer, which must already appear in the remote's public history (refs/remotes/<remote>/*), as
// check.mjs --source does (else `identity-unknown`); every path it adds or changes; every blob it adds or changes
// (binary blobs: the literal values only; an allow entry covers a blob when it covers each of its outgoing paths).
// Output: "COMMIT <sha10> <subject>" per outgoing commit and "REFUSED <why>" lines, then check.mjs's "HIT <rule-id>
// <where>:<line>" lines and "CHECK <n> residual (<r> rules)"; every printed text has its rule matches replaced by their
// tokens, so no value is ever printed. Last line "OUTGOING <n> commit(s) to <remote>: clean" or "...: REFUSED".
// Exit 0 clean, 1 hits or refusals, 2 usage, a missing or bad known file, or a git error (fail closed).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { exitOnHelp, isMain } from '../lib/help.mjs';
import { loadKnown, buildRules, scanText, safeText, withSecrets } from './rules.mjs';
import { gitEnv, formatHits } from './check.mjs';

exitOnHelp(import.meta.url);

const ZERO = /^0+$/;
const IDENT = /^(author|committer|tagger) (.*>) \d+ [+-]\d{4}$/;
const isBinary = (buf) => buf.subarray(0, 8192).includes(0);

/** git in `cwd` (the repo being pushed); latin1 keeps bytes intact. Throws on a non-zero exit. */
function gitIn(cwd) {
  return (args, { input, encoding = 'latin1' } = {}) => execFileSync('git', args, { cwd, input, encoding: encoding === 'buffer' ? undefined : encoding, maxBuffer: 2 ** 31, env: gitEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
}

/** "Name <email>" of every author and committer the remote's public history (refs/remotes/<remote>/*) has. */
export function publicIdentities(git, remote) {
  const ids = new Set();
  let out = '';
  try { out = git(['log', `--remotes=${remote}`, '--format=%an <%ae>%x00%cn <%ce>'], { encoding: 'utf8' }); } catch { return ids; }
  for (const l of out.split('\n')) for (const x of l.split('\0')) if (x) ids.add(x);
  return ids;
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

/**
 * Check the commits `revArgs` selects (git rev-list arguments) in repo `cwd`. Returns {commits: [{sha, subject}],
 * merges: [sha], hits: [{id, where, line}]}. identities: see publicIdentities.
 */
export function checkCommits(cwd, revArgs, rules, { identities }) {
  const git = gitIn(cwd);
  const list = git(['rev-list', '--reverse', ...revArgs, '--'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const merges = git(['rev-list', '--merges', ...revArgs, '--'], { encoding: 'utf8' }).split('\n').filter(Boolean);
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
    for (let i = 0; i + 1 < f.length; i += 2) {
      const m = f[i].match(/^:\d+ (\d+) [0-9a-f]+ ([0-9a-f]+) ([A-Z])/);
      if (!m) continue;
      if (m[3] === 'D') continue;
      const path = Buffer.from(f[i + 1], 'latin1').toString('utf8');
      for (const h of scanText(path, rules, { allow: [] })) hit(h.id, `path@${o10}/${show(path)}`, 0);
      if (m[1] === '160000' || ZERO.test(m[2])) continue; // a submodule commit, no blob
      const l = blobPaths.get(m[2]);
      if (!l) blobPaths.set(m[2], [path]); else if (!l.includes(path)) l.push(path);
    }
  }
  const allow = rules.allow || [];
  const blobs = readBlobs(git, [...blobPaths.keys()]);
  for (const [oid, ps] of blobPaths) {
    const data = blobs.get(oid);
    const here = allow.filter((a) => ps.every((p) => a.path.test(p)));
    for (const h of scanText(data, rules, { path: ps[0], allow: here, literalsOnly: isBinary(data) })) hit(h.id, `${show(ps[0])}@${oid.slice(0, 10)}`, h.line);
  }
  return { commits, merges, hits };
}

/**
 * The pre-push lines: {revArgs, refused: [why]}. A line "<local ref> <local oid> <remote ref> <remote oid>"; a delete
 * has a zero local oid, a new remote ref a zero remote oid.
 */
export function prePushPlan(git, remote, lines) {
  const refused = [], tips = [], have = [];
  for (const line of lines) {
    const [lref, loid, rref, roid] = line.trim().split(/\s+/);
    if (!lref) continue;
    if (!loid || !rref || !roid) { refused.push(`unreadable pre-push line ${JSON.stringify(line.slice(0, 80))}`); continue; }
    if (ZERO.test(loid)) { refused.push(`deleting ${rref}: deletes are not pushed from here`); continue; }
    if (!rref.startsWith('refs/heads/')) { refused.push(`${rref}: only branches (refs/heads/*) are pushed; tags and other refs are refused`); continue; }
    try { git(['cat-file', '-e', `${loid}^{commit}`]); } catch { refused.push(`${lref} -> ${rref}: ${loid.slice(0, 10)} is not a commit`); continue; }
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
  return { revArgs: tips.length ? [...tips, '--not', ...have, `--remotes=${remote}`] : null, refused };
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
    let revArgs, refused = [];
    if (opt.prePush) ({ revArgs, refused } = prePushPlan(git, remote, stdin.split('\n').filter((l) => l.trim())));
    else revArgs = pos.length ? pos[0].split(/\s+/).filter(Boolean) : ['HEAD', '--not', `--remotes=${remote}`];
    const res = revArgs ? checkCommits(process.cwd(), revArgs, rules, { identities: publicIdentities(git, remote) }) : { commits: [], merges: [], hits: [] };
    for (const m of res.merges) refused.push(`merge commit ${m.slice(0, 10)} in the outgoing commits (Hard rule 1: rebase + fast-forward only)`);
    const out = [...res.commits.map((c) => `COMMIT ${c.sha.slice(0, 10)} ${c.subject}`), ...refused.map((r) => `REFUSED ${safeText(r, rules)}`)];
    const bad = refused.length || res.hits.length;
    process.stdout.write((out.length ? `${out.join('\n')}\n` : '') + formatHits(res.hits, rules.length) + `OUTGOING ${res.commits.length} commit(s) to ${safeText(remote, rules)}: ${bad ? 'REFUSED' : 'clean'}\n`);
    return bad ? 1 : 0;
  } catch (e) {
    console.error(`OUTGOING failed (refusing): ${safeText(String(e.stderr || e.message).trim().split('\n')[0], rules)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
