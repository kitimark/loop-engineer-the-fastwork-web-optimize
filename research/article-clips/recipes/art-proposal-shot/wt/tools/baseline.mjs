#!/usr/bin/env node
// The committed baseline snapshot (site/, site-pretty/) and its pin baseline.json (tools/lib/baseline.mjs).
//
//   node tools/baseline.mjs status            # pinned snapshot, where it is read from, ok or why not (exit 0 ok, 3 not)
//   node tools/baseline.mjs pin [--prettier 3.9.9] [--note "..."] [--from index|HEAD]
//        write baseline.json for the snapshot STAGED in this checkout (after `git add site site-pretty`;
//        --from HEAD: the committed one). Prints the snapshot id and the authorized commit command.
//        A snapshot update is the user's decision: only the user, or the lead on the user's instruction.
//   node tools/baseline.mjs sparse [--off]    # linked worktrees: leave site/ and site-pretty/ out of the
//        checkout (default for agent worktrees; tools then read the main checkout's committed snapshot),
//        or --off: check out this branch's own committed copy (~60 MB) and measure that.
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, isLinkedWorktree, mainCheckout } from './lib/paths.mjs';
import { PIN_FILE, TREES, SPARSE_PATTERNS, EXIT_BASELINE, readPin, computePin, baselineStatus, isSparse, git } from './lib/baseline.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const cmd = argv[0];
function die(msg, code = 2) { console.error(msg); process.exit(code); }

function cmdStatus() {
  const s = baselineStatus();
  console.log(`snapshot   ${s.snapshot ?? '(none)'}`);
  console.log(`state      ${s.state}`);
  console.log(`read from  ${(s.homes || []).join(', ')}`);
  console.log(`checkout   ${REPO}${isLinkedWorktree() ? ` (worktree, ${isSparse() ? 'sparse: no own copy' : existsSync(join(REPO, 'site')) ? 'own copy' : 'no copy'})` : ' (main checkout)'}`);
  if (!s.ok || s.state !== 'ok') console.log(s.message);
  process.exitCode = s.ok ? 0 : EXIT_BASELINE;
}

function cmdPin() {
  const from = opt('from', 'index');
  const prev = readPin(REPO);
  let pin;
  try {
    pin = computePin({ cwd: REPO, from, prettier: opt('prettier', prev && !prev.error ? prev.prettier : null), note: opt('note', null) });
  } catch (e) { die(`baseline.mjs pin: ${e.message}`, 1); }
  if (!pin.build) console.error(`warning: no site/_app/version.json in the snapshot: id ${pin.snapshot}`);
  if (!pin.prettier) console.error('warning: Prettier version unknown (pass --prettier <exact version that built site-pretty/>)');
  writeFileSync(join(REPO, PIN_FILE), JSON.stringify(pin, null, 1) + '\n');
  console.log(`PINNED ${pin.snapshot}  (build ${pin.build}, site ${pin.trees.site.slice(0, 10)} ${pin.files.site} files, site-pretty ${pin.trees['site-pretty'].slice(0, 10)} ${pin.files['site-pretty']} files)`);
  console.log(`wrote ${PIN_FILE}. A snapshot commit is the user's decision; it contains only ${TREES.join('/, ')}/ and ${PIN_FILE}:`);
  console.log(`  git add ${PIN_FILE} && FW_BASELINE_UPDATE=${pin.snapshot} git commit -m "baseline: snapshot ${pin.snapshot}"`);
}

function cmdSparse() {
  if (!isLinkedWorktree()) die('baseline.mjs sparse: only for linked worktrees; the main checkout holds the committed snapshot every worktree reads.');
  if (flag('off')) {
    const r = git(REPO, ['sparse-checkout', 'disable']);
    if (!r.ok) die(`git sparse-checkout disable failed: ${r.err}`, 1);
    console.log(`OWN COPY: ${TREES.join('/ and ')}/ checked out in ${REPO}; tools measure this branch's committed snapshot ${readPin(REPO)?.snapshot ?? '(unpinned)'}`);
    return;
  }
  const pin = readPin(REPO);
  if (pin?.error) die(pin.error, 1);
  if (existsSync(join(REPO, 'site')) || existsSync(join(REPO, 'site-pretty'))) {
    // dropping the own copy is only lossless when the main checkout has exactly this pin, unchanged
    const st = git(REPO, ['status', '--porcelain', '--untracked-files=all', '--', ...TREES]);
    if (st.out) die(`baseline.mjs sparse: this worktree's ${TREES.join('/ ')}/ has local changes; not dropping them:\n${st.out.split('\n').slice(0, 5).join('\n')}`, 1);
    if (pin) {
      const main = mainCheckout();
      const bad = TREES.filter((t) => git(main, ['rev-parse', '--verify', '-q', `HEAD:${t}`]).out !== pin.trees[t]);
      const dirty = git(main, ['status', '--porcelain', '--untracked-files=all', '--', ...TREES]).out;
      if (bad.length || dirty) die(`baseline.mjs sparse: the main checkout (${main}) does not hold this branch's snapshot ${pin.snapshot} unchanged (${bad.length ? `other ${bad.join(', ')} at HEAD` : 'local changes'}); keeping this worktree's own copy.`, EXIT_BASELINE);
    }
  }
  const r = git(REPO, ['sparse-checkout', 'set', '--no-cone', ...SPARSE_PATTERNS]);
  if (!r.ok) die(`git sparse-checkout set failed: ${r.err}`, 1);
  console.log(`SPARSE: ${TREES.join('/ and ')}/ are not checked out in ${REPO}; tools read the main checkout's committed snapshot (${mainCheckout()}).`);
}

const cmds = { status: cmdStatus, pin: cmdPin, sparse: cmdSparse };
if (!cmds[cmd]) {
  console.log((await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(cmd ? 2 : 0);
}
cmds[cmd]();
