#!/usr/bin/env node
// Make a readable copy of the mirror: site/ -> site-pretty/ with every JS and CSS file run
// through Prettier (npx one-off, nothing installed globally). site/ itself is never touched, so
// `serve.mjs` keeps serving byte-identical production files by default.
//
//   node tools/prettify.mjs [--prettier 3.9.9]   # (re)build site-pretty/
//   node tools/prettify.mjs --new-snapshot       # required once site-pretty/ is the committed snapshot
//   node tools/serve.mjs --root site-pretty --port 5180   # optional: run the formatted copy;
//                                      # LoAF/DevTools line numbers then point at readable code
//
// site-pretty/ is part of the study's frozen baseline snapshot, committed on main and pinned by
// baseline.json (tools/lib/baseline.mjs). Over a tracked site-pretty/ prettify.mjs refuses (exit 2,
// PRETTIFY-REFUSED) unless --new-snapshot is given (the user's decision): it then rebuilds the working
// tree only, and the result is a git diff to review; it never stages or commits anything.
// Prettier runs at the EXACT version pinned in baseline.json ("prettier"; --prettier <v> overrides): even
// a patch release reformats code, and every patch.diff is a diff against site-pretty/.
//
// HTML is copied verbatim on purpose: SvelteKit hydrates against the exact SSR markup
// (<!--[--> markers, whitespace), so reformatting index.html would break hydration.
// Production publishes no source maps (checked by mirror.mjs), so this is the closest
// thing to source that is available.
import { cpSync, rmSync, existsSync, readFileSync, writeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// I-152 N10 inline help: --help/-h (before any `--`) prints the header above and exits 0 before anything runs. Inline,
// not tools/lib/help.mjs: this tool also runs standalone (copied alone, as its tests do).
{
  const a = process.argv.slice(2), end = a.indexOf('--');
  if ((end < 0 ? a : a.slice(0, end)).some((x) => x === '--help' || x === '-h')) {
    const head = [];
    for (const l of readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1)) { if (!l.startsWith('//')) break; head.push(l.replace(/^\/\/ ?/, '')); }
    const b = Buffer.from(`${head.join('\n').trimEnd()}\n`);
    for (let off = 0; off < b.length;) { try { off += writeSync(1, b, off); } catch (e) { if (e.code !== 'EAGAIN') throw e; } }
    process.exit(0);
  }
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'site');
const DST = resolve(ROOT, 'site-pretty');
const argv = process.argv.slice(2);
const NEW_SNAPSHOT = argv.includes('--new-snapshot');
const pi = argv.indexOf('--prettier');
let pinned = null;
try { pinned = JSON.parse(readFileSync(resolve(ROOT, 'baseline.json'), 'utf8')).prettier || null; } catch {}
const PRETTIER = (pi >= 0 ? argv[pi + 1] : null) || pinned || '3';
if (!existsSync(SRC)) { console.error('site/ missing — run node tools/mirror.mjs first'); process.exit(1); }

const tracked = existsSync(DST)
  ? (spawnSync('git', ['ls-files', '--', '.'], { cwd: DST, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).stdout || '').split('\n').filter(Boolean).length
  : 0;
if (tracked && !NEW_SNAPSHOT) {
  console.error(`PRETTIFY-REFUSED: ${DST} is part of the committed baseline snapshot (${tracked} tracked files, pinned by baseline.json);
rebuilding it would change the code every patch.diff is a diff against. A new snapshot is the user's decision only:
  node tools/prettify.mjs --new-snapshot   # after node tools/mirror.mjs --new-snapshot; updates the working tree, never commits
then review and commit in the authorized form (CLAUDE.md "Baseline snapshot"), or discard:
  git restore --source=HEAD --staged --worktree -- site site-pretty && git clean -fd -- site site-pretty`);
  process.exit(2);
}
if (PRETTIER === '3') console.error('warning: no exact Prettier version pinned (baseline.json "prettier", or --prettier <version>): using the newest 3.x, which may format differently');

rmSync(DST, { recursive: true, force: true });
cpSync(SRC, DST, { recursive: true, filter: (p) => !p.includes('/.mirror/chrome-profile') });
const common = ['--yes', `prettier@${PRETTIER}`, '--write', '--log-level', 'warn', '--print-width', '110', '--ignore-path', ''];
let r = spawnSync('npx', [...common, 'site-pretty/**/*.{js,css}', '!site-pretty/__vendor/**'], { cwd: ROOT, stdio: 'inherit' });
if (r.status !== 0) console.error('prettier reported problems for some first-party files (they were left as-is)');
// third-party scripts saved by `mirror.mjs --vendors` have odd names (.br, .gz, query hashes): force the JS parser
const manifest = JSON.parse(readFileSync(resolve(SRC, '.mirror/manifest.json'), 'utf8'));
const vendorFiles = Object.values(manifest.vendors || {}).map((v) => 'site-pretty/' + v.file);
if (vendorFiles.length) {
  r = spawnSync('npx', [...common, '--parser', 'babel', ...vendorFiles], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) console.error('prettier reported problems for some vendor files');
}
console.log(`readable copy: site-pretty/ (prettier@${PRETTIER})  (serve with: node tools/serve.mjs --root site-pretty)`);
if (tracked) console.log('NEW SNAPSHOT CANDIDATE in site-pretty/ (working tree only). Review: git diff --stat -- site site-pretty; keep: node tools/baseline.mjs pin --prettier <exact version>, see CLAUDE.md "Baseline snapshot".');
