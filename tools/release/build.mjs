// build.mjs: build the public release copy in a folder outside this repo (I-270, memory/public-release.md). It makes
// the release repo, the Release files and the scrub report; it never pushes, adds a remote or uploads (the user does,
// after reading the report).
//
//   node tools/release/build.mjs --out <dir> --repo <owner/name> [--known <file>] [--quality 85] [--lossless]
//                                [--jobs N] [--source <repo>] [--state <dir>] [--out-root <dir>] [--tag <tag>]
//
// --repo is the GitHub repo the user will publish to: release-assets.json names it, so `npm run init` can download the
// Release files from there.
//
// Steps (each prints a STEP line; the first failure stops the build, exit 1):
//   1. rewrite   tools/release/rewrite.mjs <source> <dir>/history --known <file> (I-269): the bare release mirror
//                <dir>/history/repo.git with every branch rewritten; it runs tools/release/evidence.mjs itself before the
//                rewrite, so the evidence branches are scrubbed like the rest
//   2. worktree  <dir>/repo: a working tree of the mirror's main
//   3. export-console.mjs -> <dir>/console
//   4. pictures.mjs -> <dir>/media and <dir>/review-sheet.md
//   5. pack.mjs -> <dir>/assets/* and <dir>/repo/tools/release/release-assets.json; the snapshot's secret-shaped values
//                (third-party keys in vendored code) are redacted and listed in the manifest (I-270), REDACTED lines;
//                out/lead and out/tryit only as far as the committed write-ups cite them (CITED line);
//                pictures stripped of metadata or refused (IMAGES, IMAGE-REFUSED lines)
//   6. commit    the console export and the manifest go onto main as one last commit "release: console
//                record export" (console/.gitignore keeps the unpacked pictures out of git); they are made from the
//                store after the rewrite, so they enter history only in this commit
//   7. check     tools/release/check.mjs over the mirror (all refs, every object) and over every asset unpacked; the
//                licence files (LICENSE, LICENSES/, REUSE.toml, LICENSING.md) must come out of the rewrite byte-identical
//                (same blob ids as the source HEAD), else a rule matched them: LICENCE-CHANGED, not ready
//   8. report    <dir>/scrub-report.md: per rule id the counts replaced, allowlisted (kept, with reason) and residual
//                (must be 0), the excluded folders and why, the image review sheet, the needs-human-read list, the source
//                sha and the sha256 of every asset. It names rule ids, paths and counts only, and is scanned before it is
//                written.
// --out must be outside the source repo and empty (or new). Defaults: --known $FW_RELEASE_KNOWN or ~/.cache/fw-release/known.json, --source
// this repo's main checkout, --state its .git/fastwork-mirror ($FW_STATE_DIR), --out-root <source>/out.
// Exit 0: built, "CHECK 0 residual". 1: a step failed, a check.mjs run printed no "CHECK n residual (r rules)" line, or
// residual values, a refused picture or an unredacted snapshot file ("BUILD NOT READY"; the report lists them).
// 2: usage or a refused --out. CPU-heavy (git rewrite, cwebp, tesseract, tar): run it in a --no-timing chrome-measure hold.
import { exitOnHelp } from '../lib/help.mjs';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, cpSync, rmSync, renameSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadKnown, buildRules, scanText, safeText } from './rules.mjs';
import { parseArgs, knownFile, addHits, isDir, tarExtract, insideAny, show, scanFileLiterals } from './release-util.mjs';
import { exportConsole } from './export-console.mjs';
import { encodePictures } from './pictures.mjs';
import { packRelease, citedOutPaths } from './pack.mjs';

exitOnHelp(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
export const FINAL_SUBJECT = 'release: console record export';
/** Licence files the release must carry as they are: no scrub rule may change them. */
export const LICENCE_PATHS = ['LICENSE', 'LICENSES', 'REUSE.toml', 'LICENSING.md'];

/** Run one of the sibling release tools (I-269's); stdout is echoed and returned. */
function child(script, args, { echo = true } = {}) {
  const p = join(HERE, script);
  if (!existsSync(p)) throw new Error(`missing tools/release/${script} (I-269 not landed on this branch?)`);
  const r = spawnSync(process.execPath, [p, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 256 * 1024 * 1024 });
  if (r.stdout && echo) process.stdout.write(r.stdout);
  return { code: r.status, out: r.stdout || '' };
}
function git(args, cwd) {
  const r = spawnSync('git', cwd ? ['-C', cwd, ...args] : args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.filter((a) => !a.startsWith('/')).slice(0, 3).join(' ')} failed: ${(r.stderr || '').trim().split('\n')[0]}`);
  return r.stdout.trim();
}
/** Licence files of the source HEAD whose blob differs in (or is missing from) the release HEAD: [{path, state}]. */
export function licenceChanges(source, worktree) {
  const blobs = (cwd) => {
    const r = spawnSync('git', ['-C', cwd, 'ls-tree', '-r', '-z', 'HEAD', '--', ...LICENCE_PATHS], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ls-tree failed: ${(r.stderr || '').trim().split('\n')[0]}`);
    return new Map(r.stdout.split('\0').filter(Boolean).map((l) => { const [meta, path] = l.split('\t'); return [path, meta.split(' ')[2]]; }));
  };
  const src = blobs(source), rel = blobs(worktree);
  return [...src].map(([path, id]) => ({ path, state: !rel.has(path) ? 'missing' : rel.get(path) === id ? 'identical' : 'changed' }));
}

/** "HIT <id> <path>:<line>" lines of check.mjs. */
const hitLines = (out) => [...out.matchAll(/^HIT (\S+) (.+)$/gm)].map((m) => ({ id: m[1], where: m[2] }));
/** check.mjs's verdict line; a run without it (crashed, cut off, another tool) is no check. */
const CHECK_LINE = /^CHECK \d+ residual \(\d+ rules\)$/m;
function runCheck(args, what) {
  const r = child('check.mjs', args, { echo: false });
  if (!CHECK_LINE.test(r.out)) throw new Error(`check.mjs on ${what} printed no "CHECK <n> residual (<r> rules)" line (exit ${r.code}): not checked`);
  if (r.code !== 0 && !hitLines(r.out).length) throw new Error(`check.mjs on ${what} failed without HIT lines (exit ${r.code})`);
  return hitLines(r.out);
}

/** A known.json allow path (I-269's glob: ** any characters, * any but /, a trailing / a directory prefix, else exact). */
export function allowPathMatch(glob, path) {
  let s = '';
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] === '*' && glob[i + 1] === '*') { s += '.*'; i++; } else if (glob[i] === '*') s += '[^/]*'; else if (glob[i] === '?') s += '[^/]'; else s += glob[i].replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
  }
  return new RegExp(`^${s}${glob.endsWith('/') ? '.*' : ''}$`).test(path);
}

/** Matches each allow entry keeps in the release repo's HEAD tree: [{n, path, count, reason}]. */
export function allowCounts(worktree, allow = []) {
  if (!allow.length) return [];
  const files = git(['ls-files', '-z'], worktree).split('\0').filter(Boolean);
  return allow.map((a, i) => {
    let count = 0, re;
    try { re = new RegExp(a.pattern, 'g'); } catch { return { n: i, path: a.path, count: 0, reason: 'invalid pattern' }; }
    for (const f of files) if (allowPathMatch(a.path, f)) { try { count += (readFileSync(join(worktree, f), 'utf8').match(re) || []).length; } catch {} }
    return { n: i, path: a.path, count, reason: a.reason || 'allow entry in known.json (a test fixture or a public value)' };
  });
}

const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')).join(' | ')} |`).join('\n')}\n`;

/** The history rewrite's numbers from rewrite-report.json (counts only). */
function historyRows(h) {
  if (!h) return [['rewrite-report.json', 'missing']];
  const rows = [];
  const add = (k, v) => { if (v !== undefined && v !== null && typeof v !== 'object') rows.push([k, v]); };
  add('commits before', h.commits?.before); add('commits with evidence', h.commits?.withEvidence); add('commits after', h.commits?.after);
  add('branches', h.branches); add('evidence branches', Array.isArray(h.evidence) ? h.evidence.length : undefined); add('dropped refs', h.droppedRefs);
  for (const k of ['files', 'text', 'changed', 'binary', 'binaryChanged', 'renamed', 'shaRewrites']) add(`files: ${k}`, h.stats?.[k]);
  add('cited SHAs on main still naming an old commit', h.danglingMain?.dangling); add('rewrite residual (its own check)', h.check?.residual);
  return rows;
}

export function scrubReport(d) {
  const ids = [...new Set([...d.rules.map((r) => r.id), ...d.cons.keys(), ...d.data.keys(), ...d.residual.keys()])];
  const tok = new Map(d.rules.map((r) => [r.id, r.token]));
  const ruleRows = ids.map((id) => [id, tok.has(id) ? '`' + tok.get(id) + '`' : '', d.cons.get(id) || 0, d.data.get(id) || 0, d.residual.get(id) || 0]);
  const totalResidual = d.residualHits.length;
  const sheet = d.sheet.replace(/^# .*\n/, '').replace(/^#/gm, '###');
  return `# Scrub report\n\n`
    + `Release built ${d.at} in this folder; nothing is pushed or uploaded. Read this report, the review sheet and the needs-human-read list `
    + `before you push the release repo and upload the Release files yourself.\n\n`
    + table(['', ''], [['source repo HEAD', d.sourceSha], ['release repo', 'history/repo.git (bare, every branch); main checked out in repo/'], ['release main HEAD', d.releaseSha],
      ['baseline snapshot', d.snapshot], ['release tag', d.tag], ['GitHub repo (release-assets.json "repo")', d.repo], ['residual (check.mjs)', `**${totalResidual}**${totalResidual ? ' - NOT READY' : ' (CHECK 0 residual)'}`]])
    + `\n## Release files\n\n` + table(['name', 'kind', 'bytes', 'sha256'], d.assets.map((a) => [a.name, a.kind, a.bytes, a.sha256]))
    + `\n## Snapshot redactions\n\nSecret-shaped values in the snapshot's text files (third-party keys in vendored code) are replaced by `
    + `"[secret omitted: <rule>]", in both copies (site/, site-pretty/); release-assets.json lists each file with its original and `
    + `redacted blob ids, so npm run init and the baseline check still verify the pinned snapshot. A file whose secret held a known `
    + `value, or whose JS/JSON the redaction would break, is not redacted (the check reports it).\n\n`
    + (d.redacted.length ? `The release snapshot therefore has ${d.redacted.length} vendored file(s) with secret-shaped values redacted, listed in `
      + `release-assets.json. Served with --vendors=local they run redacted, so console errors and requests may differ from the study's runs.\n\n` : '')
    + (d.redacted.length || d.redactKept.length ? table(['path', 'rule', 'values', 'parses as', 'state'], [...d.redacted.map((r) => [r.path, r.rule, r.count, r.syntax, 'redacted']), ...d.redactKept.map((r) => [r.path, r.rule, '', '', `**not redacted: ${r.why}** - NOT READY`])]) : 'None.\n')
    + `\n## History rewrite\n\nFrom history/rewrite-report.json (git filter-repo replaces every rule in every blob and message; it counts files, not matches).\n\n`
    + table(['', 'count'], historyRows(d.history))
    + `\n## Rules\n\nReplaced: console = the console export (every text field and key), out-data = the text files of `
    + `out-data.tar.gz. `
    + `Residual = check.mjs hits in the release mirror (every ref and object) and in the unpacked Release files; it must be 0.\n\n`
    + table(['rule id', 'token', 'console', 'out-data', 'residual'], ruleRows)
    + `\n### Allowlisted (kept)\n\n` + (d.allow.length ? table(['entry', 'path', 'kept', 'reason'], d.allow.map((a) => [`allow#${a.n}`, a.path, a.count, a.reason])) : 'No allow entries in known.json.\n')
    + (d.residualHits.length ? `\n### Residual hits\n\n${d.residualHits.slice(0, 200).map((h) => `- ${h.id} ${h.where}`).join('\n')}${d.residualHits.length > 200 ? `\n- ... ${d.residualHits.length - 200} more` : ''}\n` : '')
    + `\n### Licence files\n\nThey ship as they are: a file the rewrite changed means a rule matched it (not ready).\n\n`
    + (d.licences.length ? table(['path', 'release HEAD'], d.licences.map((l) => [l.path, l.state === 'identical' ? 'identical to the source' : `**${l.state}** - NOT READY`])) : 'None in the source HEAD.\n')
    + `\n## Excluded\n\n` + table(['path', 'why'], d.excluded.map((e) => [e.path, e.reason]))
    + `\n## Picture metadata\n\nPNG and GIF ship without their text, date and EXIF chunks (stripped losslessly); a JPEG, AVIF or WebP with XMP, `
    + `IPTC, a comment, GPS, camera, owner or other non-pixel EXIF data is refused (left out, not ready). ${d.images.checked} pictures checked, `
    + `${d.images.stripped.length} stripped, ${d.images.refused.length} refused. The review sheet below names the kinds per file.\n\n`
    + (d.images.refused.length ? table(['refused picture', 'metadata'], d.images.refused.map((r) => [r.path, `**${r.kinds.join(', ')}** - NOT READY`])) : '')
    + `\n## Needs a human read\n\nThe rules cannot judge these texts: Thai text, pasted e-mails, e-mail addresses and capitalised words outside the study's `
    + `vocabulary in the user's messages (maybe a name), and every text file of out-data.tar.gz (scrubbed by rules only). Read each `
    + `(console/ in the release repo, out/ after npm run init) before the release (the list names places, not text).\n\n`
    + (d.needs.length ? d.needs.map((n) => `- ${n.where} (${n.by || 'unknown'}): ${n.kinds.join(', ')}`).join('\n') + '\n' : 'None.\n')
    + `\n## Image review sheet\n\n${sheet}`
    + `\n## Counts\n\n` + table(['part', 'count'], Object.entries(d.counts));
}

let RULES = null;
async function main() {
  const a = parseArgs(process.argv.slice(2), { booleans: ['lossless'] });
  if (!a.out || !a.repo) { console.error('usage: build.mjs --out <dir> --repo <owner/name> [--known <file>] [--quality 85] [--lossless] [--source <repo>] [--state <dir>] [--out-root <dir>] [--tag <tag>] [--jobs N]'); process.exit(2); }
  if (!/^[\w.-]+\/[\w.-]+$/.test(a.repo)) { console.error('--repo must be <owner>/<name> (npm run init downloads the Release files from it)'); process.exit(2); }
  const { mainCheckout, sharedStateDir } = await import('../lib/paths.mjs');
  const source = resolve(a.source || mainCheckout());
  const out = resolve(a.out);
  if (insideAny(out, [source, mainCheckout()])) { console.error(`REFUSED: --out ${show(out)} is inside the source repo; the release is built outside it`); process.exit(2); }
  if (isDir(out) && readdirSync(out).length) { console.error(`REFUSED: --out ${show(out)} is not empty`); process.exit(2); }
  const quality = a.quality === undefined ? 85 : Number(a.quality);
  if (!(quality >= 0 && quality <= 100)) { console.error('--quality must be 0-100'); process.exit(2); }
  const knownPath = knownFile(a);
  const known = loadKnown(knownPath);
  const rules = RULES = buildRules(known);
  const state = resolve(a.state || sharedStateDir());
  const outRoot = resolve(a['out-root'] || join(source, 'out'));
  mkdirSync(out, { recursive: true });
  const history = join(out, 'history');
  const mirror = join(history, 'repo.git');
  const repo = join(out, 'repo');
  const step = (s) => console.log(`STEP ${s}`);

  step('rewrite');
  const rw = child('rewrite.mjs', [source, history, '--known', knownPath]);
  const reportPath = join(history, 'rewrite-report.json');
  const rwReport = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  // exit 1 with a report and residual hits: go on, the check below finds and reports them; anything else stops here
  if (rw.code !== 0 && !(rw.code === 1 && rwReport?.check?.residual > 0)) throw new Error(`rewrite.mjs exited ${rw.code}`);
  if (!existsSync(join(mirror, 'HEAD'))) throw new Error('rewrite.mjs made no release mirror at <out>/history/repo.git');
  step('worktree');
  git(['--git-dir', mirror, 'worktree', 'add', '-q', repo, 'main']);

  step('export-console');
  const exp = exportConsole({ state, out: join(out, 'console'), rules });
  // out/lead and out/tryit ship only the files the committed write-ups cite by path (never a console mention)
  const cited = citedOutPaths({ source });
  step('pictures');
  const pic = await encodePictures({ state, out: join(out, 'media'), sheet: join(out, 'review-sheet.md'), outRoot, cited, rules, quality, lossless: !!a.lossless, jobs: a.jobs });
  step('pack');
  const pk = await packRelease({ source, mediaDir: join(out, 'media'), outRoot, assetsDir: join(out, 'assets'), manifest: join(repo, 'tools', 'release', 'release-assets.json'), rules, tag: a.tag, repo: a.repo, cited });
  console.log(`CITED ${pk.cited} out/lead and out/tryit file(s) ship (${cited.size} path(s) cited)`);
  console.log(`IMAGES ${pk.images.checked} checked, ${pk.images.stripped.length} stripped, ${pk.images.refused.length} refused`);
  for (const x of pk.images.refused) console.log(`IMAGE-REFUSED ${safeText(x.path, rules)}: ${x.kinds.join(', ')}`);
  for (const x of pk.redacted) console.log(`REDACTED ${safeText(x.path, rules)} ${x.rule} ${x.count}`);
  for (const x of pk.redactKept) console.log(`NOT-REDACTED ${safeText(x.path, rules)} ${x.rule}: ${x.why} (the check reports it)`);

  step('commit');
  rmSync(join(repo, 'console'), { recursive: true, force: true });
  cpSync(join(out, 'console'), join(repo, 'console'), { recursive: true });
  writeFileSync(join(repo, 'console', '.gitignore'), '# proposal pictures and videos: a Release file (proposal-media.tar), unpacked by npm run init\nproposals/*/\n');
  git(['add', '-A', '--', 'console', 'tools/release/release-assets.json'], repo);
  git(['commit', '-q', '-m', FINAL_SUBJECT], repo);
  const releaseSha = git(['rev-parse', 'HEAD'], repo);

  step('check');
  const residualHits = [];
  // check.mjs's own lines are not echoed: its per-target "CHECK 0 residual" is not the build's verdict
  const checked = (what, hits) => { for (const h of hits) console.log(`HIT ${h.id} ${h.where}`); console.log(`CHECKED ${what}: ${hits.length} residual`); };
  // --source: the identities of the source history are the user's chosen public ones (I-269)
  residualHits.push(...runCheck([mirror, '--known', knownPath, '--source', source], 'the mirror').map((h) => ({ id: h.id, where: `history/repo.git ${h.where}` })));
  checked('history/repo.git', residualHits);
  // one check per Release file, unpacked as `npm run init` does (at the repo root), so its paths and allow globs are
  // the release repo's
  const unpacked = join(out, 'check-assets');
  for (const x of pk.assets) {
    const d = join(unpacked, x.name);
    mkdirSync(d, { recursive: true });
    tarExtract(join(out, 'assets', x.name), d);
    let found;
    try { found = runCheck([d, '--known', knownPath], x.name); } finally { rmSync(d, { recursive: true, force: true }); }
    const hits = found.map((h) => ({ id: h.id, where: `assets/${x.name} ${h.where}` }));
    // the archive's own bytes too (tar headers: owner names, file names), decompressed for .gz
    for (const b of await scanFileLiterals(join(out, 'assets', x.name), rules, { gunzip: /\.(tar\.gz|tgz)$/.test(x.name) })) hits.push({ id: b.id, where: `assets/${x.name} (archive ${b.where}, ${b.count}x)` });
    checked(`assets/${x.name}`, hits);
    residualHits.push(...hits);
  }
  rmSync(unpacked, { recursive: true, force: true });
  const licences = licenceChanges(source, repo);
  const badLicences = licences.filter((l) => l.state !== 'identical');
  for (const l of badLicences) console.log(`LICENCE-CHANGED ${l.path} ${l.state}`);
  const residual = new Map();
  for (const h of residualHits) residual.set(h.id, (residual.get(h.id) || 0) + 1);

  step('report');
  const report = scrubReport({
    at: new Date().toISOString(), sourceSha: git(['rev-parse', 'HEAD'], source), releaseSha, snapshot: pk.snapshot, tag: pk.manifest.release, repo: pk.manifest.repo,
    assets: pk.assets, redacted: pk.redacted, redactKept: pk.redactKept, rules, history: rwReport, cons: addHits(new Map(), exp.hits), data: addHits(new Map(), pk.hits), residual, residualHits,
    allow: allowCounts(repo, known.allow || []), licences,
    excluded: [...exp.excluded.map((e) => ({ path: `.git/fastwork-mirror/${e.path}`, reason: e.reason })), ...pk.excluded],
    // every shipped out-data text file was scrubbed by rules only: a human reads it too
    needs: [...exp.needsHumanRead, ...pk.textFiles.map((p) => ({ where: `out-data.tar.gz ${p}`, by: 'out/', kinds: ['shipped text file'] }))],
    images: pk.images, sheet: readFileSync(pic.sheet, 'utf8'),
    counts: { ...exp.counts, 'snapshot files redacted': pk.redacted.length, pictures: pic.pictures, 'pictures listed for review': pic.flagged.length, videos: pic.videos, ...Object.fromEntries(Object.entries(pk.counts).map(([k, v]) => [`files in ${k}`, v])) },
  });
  const leaks = scanText(report, rules, { path: 'scrub-report.md' });
  if (leaks.length) throw new Error(`the report would hold a value (${leaks.map((l) => `${l.id} line ${l.line}`).join(', ')}); not written`);
  writeFileSync(join(out, 'scrub-report.md.tmp'), report);
  renameSync(join(out, 'scrub-report.md.tmp'), join(out, 'scrub-report.md'));
  for (const x of pk.assets) console.log(`ASSET ${x.name} ${x.bytes} ${x.sha256}`);
  if (residualHits.length || badLicences.length || pk.images.refused.length || pk.redactKept.length) { console.log(`BUILD NOT READY: ${residualHits.length} residual hit(s), ${badLicences.length} licence file(s) changed by the rewrite, ${pk.images.refused.length} picture(s) refused, ${pk.redactKept.length} snapshot file(s) not redacted; see ${show(join(out, 'scrub-report.md'), rules)}`); process.exit(1); }
  console.log('CHECK 0 residual');
  console.log(`BUILD OK ${show(out, rules)} (release main ${releaseSha.slice(0, 12)}, ${pk.assets.length} release files); report: ${show(join(out, 'scrub-report.md'), rules)}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`build: ${show(e.message, RULES)}`); process.exit(1); });
