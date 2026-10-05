#!/usr/bin/env node
// Claude Code PreToolUse hook for Bash: enforces CLAUDE.md "Hard rules" 1 (rebase + fast-forward
// only) and 2 (never push, no public remote) on the command text before it runs.
//
//   deny (exit 2, reason on stderr):
//     git push / send-pack (any form)          git merge without --ff-only, --no-ff, --squash,
//     git merge --continue / --no-verify       git pull without --rebase or --ff-only
//     git commit --no-verify / -n              git -c core.hooksPath=..., -c alias.*=...,
//     GIT_CONFIG_{COUNT,KEY_n,VALUE_n,PARAMETERS} overrides
//     gh repo create|fork, gh pr create|merge, gh gist create, gh release create
//   ask (JSON permissionDecision "ask"):
//     git config writes to core.hooksPath, merge.ff, pull.*, branch.*.rebase|mergeoptions, alias.*,
//     remote.*;  git remote add|set-url|rename
//     setting FW_BASELINE_UPDATE / FW_BASELINE_ALLOW_MODIFIED (VAR=..., export, env): the user's decision
//     to commit a new baseline snapshot or to measure a modified one (CLAUDE.md Hard rules 3-4)
//     node tools/ioscap.mjs record --first-run (the run that shows the macOS Camera prompt, incident I-062)
//   deny, with the gh recipe: curl/wget to github.com, its subdomains or *.githubusercontent.com (incident I-115,
//     user T-071; refused instead of asked since I-200, user T-184 #3), and WebFetch to those hosts (this hook also
//     runs on WebFetch; the settings.json WebFetch deny rules are the backstop). *.github.io docs sites stay allowed.
//   deny, recording routes other than tools/ioscap.mjs (incident I-062, user T-018/T-019): QuickTime Player
//     (osascript, open), system_profiler SPCameraDataType (or a full report), ffmpeg -f avfoundation, imagesnap,
//     screencapture -v/-V/-g/-G, inline swift/python/ruby/perl/osascript scripts using the capture APIs,
//     ioscap.app started by hand (open, or its binary other than --selftest)
//   deny (incident I-064, review-ioscap F2-F4): Photo Booth and FaceTime (open, osascript, their binaries); ioscap
//     by name or bundle id (open -a ioscap, open -b local.fw-study.ioscap, osascript) or any ioscap binary but
//     <checkout>/out/ioscap/ioscap.app/Contents/MacOS/ioscap --selftest; swift/swiftc/swift-frontend (also through
//     xcrun, or a swift script run by path) on tools/ioscap/ sources other than a -typecheck, on any .swift file
//     that uses the capture APIs (the hook reads the file; one it cannot read is refused), on stdin or a file list,
//     and SwiftPM build/run/test/package on a package whose sources use them
//   deny (I-064 follow-up, nobody views frames): open of anything under out/iphone-screen/ or of a movie file,
//     qlmanage/mpv/vlc/iina on those, any ffplay, ffmpeg frame exports (-f image2|image2pipe|sdl|..., an image output)
//   wrappers unwrapped so every check sees the inner command (I-064): arch, caffeinate, script, launchctl
//     submit|asuser|bsexec (besides env, nice, nohup, timeout, sudo, xargs, lock.mjs ... --, ...)
//   Known limits (capture routes): xcodebuild projects are not scanned for the capture APIs; a subprocess call
//     inside a script (python/ruby/node spawning open, ffmpeg, swift ...) is not seen, only inline capture-API text
//     is; launchctl load/bootstrap of a plist and other wrappers (taskpolicy, ...) are not followed
//
// Why a parser and not only permission rules: `Bash(git push *)` doesn't match `git -C . push`,
// `/usr/bin/git push`, `sh -c 'git push'` (https://code.claude.com/docs/en/permissions.md, "What a
// Bash rule doesn't match"). This hook splits compound commands (&&, ||, ;, |, &, newlines, $( ),
// backticks, subshells), strips env assignments and wrappers (timeout, env, nice, nohup, sudo, xargs,
// command, `[node [opts]] .../lock.mjs ... --` in any argument order, ...), recurses into `sh|bash|zsh -c`, `eval` and shell heredocs, parses git's global
// options (-C, -c, --git-dir, ...), and expands git aliases.
//
// Failure policy: exit 2 is the only exit code that blocks; any other failure (crash, timeout,
// missing node) is a non-blocking error and the call proceeds (https://code.claude.com/docs/en/hooks.md
// "Exit code output", "Timeouts"). So errors are caught here: if the hook cannot parse or analyse a
// command, it BLOCKS when the raw text mentions git/gh together with merge/pull/push (fail-closed for
// the guarded patterns) and allows everything else (fail-open for unrelated commands, so a parser bug
// can't brick the Bash tool). The git hooks in .githooks/ are the backstop for anything that slips by.
//
// Input (stdin): {"tool_name":"Bash","tool_input":{"command":"..."},"cwd":"...", ...}
// No dependencies; `node .claude/hooks/git-guard.mjs < input.json`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOW = 'Land with rebase + fast-forward only: on the branch `git rebase main`, then in the main checkout `git merge --ff-only <branch>`; if that fails, rebase again. Never merge main into a branch. (CLAUDE.md "Hard rules" 1)';
const NO_PUSH = 'Pushing is never allowed: there is no remote and Fastwork-derived content never leaves this machine. (CLAUDE.md "Hard rules" 2)';

class ParseError extends Error {}

// ---------------------------------------------------------------- shell lexer
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish']);

/**
 * Split a shell command line into simple commands. Returns [{ words: string[], heredocs: string[] }].
 * Command substitutions, backticks and process substitutions are analysed recursively and added as
 * their own commands. Not a full POSIX parser: enough to find every place a program is invoked.
 */
export function splitCommands(src, depth = 0) {
  if (depth > 8) throw new ParseError('nesting too deep');
  const out = [];
  let words = [];
  let word = '';
  let inWord = false;
  let dropNext = false; // next word is a redirection target
  let heredocNext = null; // {strip} after `<<`: the next word is the delimiter
  let pendingHeredocs = []; // [{delim, strip, cmd}]
  let herestringNext = false;
  let cur = { words, heredocs: [] };
  let i = 0;
  const n = src.length;

  const endWord = () => {
    if (!inWord) return;
    if (heredocNext) {
      pendingHeredocs.push({ delim: word, strip: heredocNext.strip, cmd: cur });
      heredocNext = null;
    } else if (herestringNext) {
      cur.heredocs.push(word);
      herestringNext = false;
    } else if (dropNext) {
      dropNext = false;
    } else {
      words.push(word);
    }
    word = '';
    inWord = false;
  };
  const endCmd = () => {
    endWord();
    if (words.length || cur.heredocs.length) out.push(cur);
    words = [];
    cur = { words, heredocs: [] };
  };
  const sub = (text) => {
    for (const c of splitCommands(text, depth + 1)) out.push(c);
  };
  // Read a balanced $( ... ) / <( ... ) body starting after the opening paren.
  const readParen = () => {
    let d = 1;
    const start = i;
    let q = null;
    let delims = []; // heredocs opened inside the substitution: their bodies may hold stray quotes/parens
    while (i < n) {
      const c = src[i];
      if (q === "'") { if (c === "'") q = null; i++; continue; }
      if (q === '"') { if (c === '\\') { i += 2; continue; } if (c === '"') q = null; i++; continue; }
      if (c === '\\') { i += 2; continue; }
      if (c === "'" || c === '"') { q = c; i++; continue; }
      if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
        const m = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|()<>'"]+))/.exec(src.slice(i));
        if (m) { delims.push({ strip: m[1] === '-', delim: m[2] ?? m[3] ?? m[4] }); i += m[0].length; continue; }
      }
      if (c === '\n' && delims.length) {
        i++;
        for (const h of delims) {
          for (;;) {
            if (i >= n) throw new ParseError('unterminated heredoc in $(...)');
            let e = src.indexOf('\n', i);
            if (e < 0) e = n;
            const line = h.strip ? src.slice(i, e).replace(/^\t+/, '') : src.slice(i, e);
            i = Math.min(e + 1, n);
            if (line === h.delim) break;
          }
        }
        delims = [];
        continue;
      }
      if (c === '(') d++;
      else if (c === ')' && --d === 0) { const body = src.slice(start, i); i++; return body; }
      i++;
    }
    throw new ParseError('unterminated $(');
  };
  const readBacktick = () => {
    const start = i;
    while (i < n) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '`') { const body = src.slice(start, i).replace(/\\`/g, '`'); i++; return body; }
      i++;
    }
    throw new ParseError('unterminated backtick');
  };
  const skipHeredocBodies = () => {
    // at the start of the line after a command that opened heredocs
    for (const h of pendingHeredocs) {
      const lines = [];
      for (;;) {
        if (i >= n) break; // unterminated heredoc: body runs to the end (bash warns, still runs)
        let e = src.indexOf('\n', i);
        if (e < 0) e = n;
        let line = src.slice(i, e);
        i = e + 1;
        if (h.strip) line = line.replace(/^\t+/, '');
        if (line === h.delim) break;
        lines.push(line);
      }
      h.cmd.heredocs.push(lines.join('\n'));
    }
    pendingHeredocs = [];
  };

  while (i < n) {
    const c = src[i];
    if (c === '\\') {
      if (src[i + 1] === '\n') { i += 2; continue; } // line continuation
      if (i + 1 < n) { word += src[i + 1]; inWord = true; }
      i += 2;
      continue;
    }
    if (c === "'") {
      const e = src.indexOf("'", i + 1);
      if (e < 0) throw new ParseError('unterminated single quote');
      word += src.slice(i + 1, e);
      inWord = true;
      i = e + 1;
      continue;
    }
    if (c === '"') {
      i++;
      inWord = true;
      for (;;) {
        if (i >= n) throw new ParseError('unterminated double quote');
        const d = src[i];
        if (d === '"') { i++; break; }
        if (d === '\\' && '"\\$`\n'.includes(src[i + 1])) { if (src[i + 1] !== '\n') word += src[i + 1]; i += 2; continue; }
        if (d === '$' && src[i + 1] === '(') { i += 2; sub(readParen()); word += '$(...)'; continue; }
        if (d === '`') { i++; sub(readBacktick()); word += '$(...)'; continue; }
        word += d;
        i++;
      }
      continue;
    }
    if (c === '$' && src[i + 1] === '(') { i += 2; sub(readParen()); word += '$(...)'; inWord = true; continue; }
    if (c === '$' && src[i + 1] === "'") { // ANSI-C quoting: $'...'
      const e = src.indexOf("'", i + 2);
      if (e < 0) throw new ParseError('unterminated $\'');
      word += src.slice(i + 2, e).replace(/\\(.)/g, '$1');
      inWord = true;
      i = e + 1;
      continue;
    }
    if (c === '`') { i++; sub(readBacktick()); word += '$(...)'; inWord = true; continue; }
    if ((c === '<' || c === '>') && src[i + 1] === '(') { endWord(); i += 2; sub(readParen()); continue; }
    if (c === '#' && !inWord) { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === ' ' || c === '\t') { endWord(); i++; continue; }
    if (c === '\n') { endCmd(); i++; if (pendingHeredocs.length) skipHeredocBodies(); continue; }
    if (c === ';' || c === '|' || c === '(' || c === ')') { endCmd(); i++; continue; }
    if (c === '&') {
      if (src[i + 1] === '>') { endWord(); i += 2; if (src[i] === '>') i++; dropNext = true; continue; } // &> file
      if (src[i + 1] !== '&' && src[i - 1] !== '&' && src[i - 1] !== '|') cur.bg = true; // `cmd &`: a background job (fg-guard)
      endCmd(); i++; continue;
    }
    if (c === '>' || c === '<') {
      if (c === '<' && src[i + 1] === '<') {
        if (/^\d+$/.test(word)) { word = ''; inWord = false; }
        endWord();
        if (src[i + 2] === '<') { i += 3; herestringNext = true; continue; }
        i += 2;
        let strip = false;
        if (src[i] === '-') { strip = true; i++; }
        heredocNext = { strip };
        continue;
      }
      if (/^\d+$/.test(word)) { word = ''; inWord = false; } // 2> file
      endWord();
      i++;
      if (src[i] === '>' || src[i] === '|' || src[i] === '&' || (c === '<' && src[i] === '>')) {
        const amp = src[i] === '&';
        i++;
        if (amp && /[0-9-]/.test(src[i] ?? '')) { while (/[0-9-]/.test(src[i] ?? '')) i++; continue; } // >&2
      }
      dropNext = true;
      continue;
    }
    word += c;
    inWord = true;
    i++;
  }
  if (heredocNext) throw new ParseError('heredoc without delimiter');
  endCmd();
  if (pendingHeredocs.length) skipHeredocBodies();
  return out;
}

// ---------------------------------------------------------------- command normalisation
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const GIT_CONFIG_ENV = /^(GIT_CONFIG_PARAMETERS|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\d+|GIT_CONFIG_VALUE_\d+)=/;
// The committed baseline snapshot (CLAUDE.md Hard rules 3-4): authorizing a snapshot commit
// (.githooks/pre-commit) or measuring a modified baseline (tools/lib/baseline.mjs) is the user's decision.
const BASELINE_ENV = /^(FW_BASELINE_UPDATE|FW_BASELINE_ALLOW_MODIFIED)(=|$)/;
function envWord(w, findings) {
  const name = w.split('=')[0];
  if (GIT_CONFIG_ENV.test(w)) findings.push(deny(`git config override through the environment (${name}) is not allowed: it can disable the git hooks. ${HOW}`));
  else if (BASELINE_ENV.test(w)) findings.push(ask(`\`${name}\` authorizes ${name === 'FW_BASELINE_UPDATE' ? 'committing a new baseline snapshot (site/, site-pretty/, baseline.json)' : 'measuring a baseline that is not the committed snapshot'}: only the user decides that (CLAUDE.md Hard rules 3-4).`));
}
const KEYWORDS = new Set(['!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until', '{', '}', 'exec', 'nocorrect', 'noglob', 'builtin']);
const base = (p) => p.slice(p.lastIndexOf('/') + 1);

/**
 * Strip assignments, keywords and wrappers. Returns { argv, envCfg } or null (not an invocation).
 * onLayer(words), when given, sees each layer before it is stripped (fg-guard: `caffeinate ...`, `node lock.mjs run ... --`).
 */
export function unwrap(words, findings, onLayer) {
  let w = words.slice();
  for (let guard = 0; guard < 32 && w.length; guard++) {
    if (onLayer) onLayer(w);
    const h = w[0];
    if (ASSIGN.test(h)) { envWord(h, findings); w.shift(); continue; }
    if (KEYWORDS.has(h)) { w.shift(); continue; }
    const b = base(h);
    if (b === 'export' || b === 'declare' || b === 'typeset' || b === 'local' || b === 'readonly') {
      for (const a of w.slice(1)) envWord(a, findings);
      return null;
    }
    if (b === 'command') { if (w[1] === '-v' || w[1] === '-V') return null; w.shift(); if (w[0] === '-p') w.shift(); continue; }
    if (b === 'time') { w.shift(); while (w[0] && w[0].startsWith('-')) w.shift(); continue; }
    if (b === 'nohup') { w.shift(); continue; }
    if (b === 'nice') { w.shift(); while (w[0] && w[0].startsWith('-')) { const o = w.shift(); if (o === '-n' || o === '--adjustment') w.shift(); } continue; }
    if (b === 'timeout' || b === 'gtimeout') {
      w.shift();
      while (w[0] && w[0].startsWith('-')) { const o = w.shift(); if (o === '-s' || o === '--signal' || o === '-k' || o === '--kill-after') w.shift(); }
      w.shift(); // duration
      continue;
    }
    if (b === 'stdbuf') { w.shift(); while (w[0] && w[0].startsWith('-')) { const o = w.shift(); if (/^-[ioe]$/.test(o)) w.shift(); } continue; }
    if (b === 'env') {
      w.shift();
      while (w[0] && (w[0].startsWith('-') || ASSIGN.test(w[0]))) {
        const o = w.shift();
        envWord(o, findings);
        if (o === '-u' || o === '--unset' || o === '-C' || o === '--chdir') w.shift();
        if (o === '-S' || o === '--split-string') { const s = w.shift() ?? ''; w = [...s.split(/\s+/).filter(Boolean), ...w]; }
        else if (o.startsWith('-S') && o.length > 2) w = [...o.slice(2).split(/\s+/).filter(Boolean), ...w];
        else if (o === '--') break;
      }
      continue;
    }
    if (b === 'sudo' || b === 'doas') {
      w.shift();
      while (w[0] && w[0].startsWith('-')) { const o = w.shift(); if (/^-[ugpCDhrt]$/.test(o)) w.shift(); if (o === '--') break; }
      continue;
    }
    if (b === 'xargs') {
      w.shift();
      while (w[0] && w[0].startsWith('-')) { const o = w.shift(); if (/^-[EeIiLlnPsd]$/.test(o)) w.shift(); if (o === '--') break; }
      continue;
    }
    // `xcrun [opts] <tool> [args]` runs <tool> (I-064: `xcrun swift ...`); --find/--show-* only print a path
    if (b === 'xcrun') {
      w.shift();
      let info = false;
      while (w[0] && w[0].startsWith('-')) {
        const o = w.shift();
        if (/^--?(sdk|toolchain)$/.test(o)) { w.shift(); continue; }
        if (/^(-f|--?find|--?show-sdk-.*|--?version|--?help|-h)$/.test(o)) { info = true; break; }
        if (o === '--') break;
      }
      if (info) return null;
      continue;
    }
    // I-064 follow-up: more wrappers that run their argument as a command
    if (b === 'arch') { // arch [-arm64|-x86_64|...] [-arch name] [-e VAR=val] [-d VAR] [-c] cmd
      w.shift();
      while (w[0] && w[0].startsWith('-')) { const o = w.shift(); if (o === '-arch' || o === '-d') w.shift(); else if (o === '-e') envWord(w.shift() ?? '', findings); }
      continue;
    }
    if (b === 'caffeinate') { // caffeinate [-disimu] [-t secs] [-w pid] [cmd]
      w.shift();
      while (w[0] && w[0].startsWith('-')) { const o = w.shift(); if (/^-[a-z]*[tw]$/.test(o)) w.shift(); }
      continue;
    }
    if (b === 'script') { // script [-adeFkqr] [-t time] [file [command ...]]; -p plays a transcript back
      w.shift();
      let play = false;
      while (w[0] && w[0].startsWith('-')) { const o = w.shift(); if (o === '--') break; if (o.includes('p')) play = true; if (/^-[a-zA-Z]*[tT]$/.test(o)) w.shift(); }
      if (play) return null;
      w.shift(); // the transcript file
      continue;
    }
    if (b === 'launchctl') { // launchctl asuser|bsexec <id> cmd...; launchctl submit ... -- cmd... (or -p program)
      const verb = w[1];
      if (verb === 'asuser' || verb === 'bsexec') { w = w.slice(3); continue; }
      if (verb === 'submit') {
        const dd = w.indexOf('--');
        if (dd > 0) { w = w.slice(dd + 1); continue; }
        const p = w.indexOf('-p');
        if (p > 0 && w[p + 1] !== undefined) { w = [w[p + 1]]; continue; }
        return null;
      }
      break;
    }
    if (b === 'watch') { w.shift(); while (w[0] && w[0].startsWith('-')) { const o = w.shift(); if (/^-[nd]$/.test(o)) w.shift(); } return { argv: w, viaShell: true }; }
    // `node [node opts] <...>/lock.mjs [opts] run [opts] <resource> [opts] -- <cmd...>` (or lock.mjs run
    // directly): lock.mjs runs <cmd> under the lock, so <cmd> is what gets invoked (review-snapshot: an
    // override inside a lock run must still ask). lock.mjs takes its options anywhere before its `--`, and
    // node options may take values (-r x.cjs), so whatever the order: everything after the first `--`
    // that follows a lock.mjs word is analysed (review-snapshot-fu; over-strict at worst, never looser).
    if (b === 'node' || b === 'nodejs' || b === 'lock.mjs') {
      const at = b === 'lock.mjs' ? 0 : w.findIndex((x, i) => i > 0 && base(x) === 'lock.mjs');
      const dd = at >= 0 ? w.indexOf('--', at + 1) : -1;
      if (dd > 0) { w = w.slice(dd + 1); continue; }
    }
    break;
  }
  return w.length ? { argv: w } : null;
}

// ---------------------------------------------------------------- decisions
const deny = (reason) => ({ decision: 'deny', reason });
const ask = (reason) => ({ decision: 'ask', reason });

const GIT_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--attr-source', '--exec-path', '--super-prefix', '--list-cmds']);
const GIT_BUILTINS = new Set(('add am annotate apply archive bisect blame branch bugreport bundle cat-file check-attr check-ignore ' +
  'check-mailmap check-ref-format checkout checkout-index cherry cherry-pick citool clean clone column commit commit-graph ' +
  'commit-tree config count-objects credential describe diagnose diff diff-files diff-index diff-tree difftool fast-export ' +
  'fast-import fetch fetch-pack filter-branch fmt-merge-msg for-each-ref for-each-repo format-patch fsck gc get-tar-commit-id ' +
  'grep gui hash-object help hook index-pack init instaweb interpret-trailers log ls-files ls-remote ls-tree mailinfo mailsplit ' +
  'maintenance merge merge-base merge-file merge-index merge-one-file merge-tree mergetool mktag mktree multi-pack-index mv ' +
  'name-rev notes pack-objects pack-refs patch-id prune prune-packed pull push range-diff read-tree rebase receive-pack reflog ' +
  'refs remote repack replace replay request-pull rerere reset restore rev-list rev-parse revert rm send-email send-pack ' +
  'shortlog show show-branch show-index show-ref sparse-checkout stage stash status stripspace submodule switch symbolic-ref ' +
  'tag unpack-file unpack-objects update-index update-ref update-server-info var verify-commit verify-pack verify-tag ' +
  'version whatchanged worktree write-tree lfs subtree').split(' '));
const PROTECTED_CONFIG = /^(core\.hookspath|merge\.ff|pull\.(rebase|ff)|branch\..+\.(rebase|mergeoptions)|alias\..+|remote\..+|url\..+\.(pushinsteadof|insteadof))$/i;

function analyzeGit(argv, ctx, findings, depth) {
  const cfg = {};
  const dirs = [];
  let i = 1;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) break;
    let opt = a, val;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { opt = a.slice(0, eq); val = a.slice(eq + 1); }
    if (val === undefined && GIT_OPTS_WITH_VALUE.has(opt) && opt !== '--exec-path' && opt !== '--list-cmds') val = argv[++i] ?? '';
    if (opt === '-C') dirs.push(val);
    if (opt === '-c' || opt === '--config-env') {
      const k = (val ?? '').split('=')[0].toLowerCase();
      const v = (val ?? '').includes('=') ? val.slice(val.indexOf('=') + 1) : 'true';
      if (k === 'core.hookspath') findings.push(deny(`\`git ${opt} core.hooksPath=...\` would disable the rebase-only git hooks. ${HOW}`));
      else if (k.startsWith('alias.')) findings.push(deny(`inline git aliases (\`git ${opt} ${k}=...\`) are not allowed here: they hide the real subcommand from this guard.`));
      cfg[k] = opt === '-c' ? v : null;
    }
  }
  let sub = argv[i];
  let args = argv.slice(i + 1);
  if (sub === undefined) return;
  if (!GIT_BUILTINS.has(sub)) {
    const alias = cfg[`alias.${sub.toLowerCase()}`] ?? lookupAlias(sub, dirs, ctx);
    if (alias && depth < 5) {
      if (alias.startsWith('!')) {
        analyzeText(`${alias.slice(1)} ${args.map(shq).join(' ')}`, ctx, findings, depth + 1);
      } else {
        const expanded = splitCommands(alias)[0]?.words ?? [];
        analyzeGit(['git', ...argv.slice(1, i), ...expanded, ...args], ctx, findings, depth + 1);
      }
    }
    return;
  }
  switch (sub) {
    case 'push':
    case 'send-pack':
      findings.push(deny(`\`git ${sub}\` is not allowed. ${NO_PUSH}`));
      return;
    case 'merge': {
      if (args.includes('--abort') || args.includes('--quit')) return;
      if (args.includes('--continue')) { findings.push(deny(`\`git merge --continue\` would create a merge commit. Run \`git merge --abort\` and rebase instead. ${HOW}`)); return; }
      let ff = cfg['merge.ff'] === 'only' ? 'only' : 'default';
      let squash = false, noVerify = false;
      for (const a of args) {
        if (a === '--') break;
        if (a === '--ff') ff = 'default';
        else if (a === '--no-ff') ff = 'no';
        else if (a === '--ff-only') ff = 'only';
        else if (a === '--squash') squash = true;
        else if (a === '--no-squash') squash = false;
        else if (a === '--no-verify') noVerify = true;
      }
      if (squash) findings.push(deny(`\`git merge --squash\` is not allowed (no squash-merge commits). ${HOW}`));
      else if (ff === 'no') findings.push(deny(`\`git merge --no-ff\` creates a merge commit and is not allowed. ${HOW}`));
      else if (ff !== 'only') findings.push(deny(`\`git merge\` needs --ff-only here (no merge commits). ${HOW}`));
      if (noVerify) findings.push(deny('`git merge --no-verify` skips the rebase-only git hooks and is not allowed.'));
      return;
    }
    case 'pull': {
      let rebase = null, ffOnly = cfg['pull.ff'] === 'only', noFf = false, squash = false;
      for (const a of args) {
        if (a === '--') break;
        if (a === '--rebase' || a === '-r') rebase = true;
        else if (a.startsWith('--rebase=')) rebase = !/^(false|no|off|0)$/i.test(a.slice(9));
        else if (a === '--no-rebase') rebase = false;
        else if (a === '--ff-only') { ffOnly = true; noFf = false; }
        else if (a === '--ff') { ffOnly = false; noFf = false; }
        else if (a === '--no-ff') { ffOnly = false; noFf = true; }
        else if (a === '--squash') squash = true;
        else if (a === '--no-squash') squash = false;
        else if (/^-[a-zA-Z]+$/.test(a) && a.includes('r')) rebase = true;
      }
      if (squash) findings.push(deny(`\`git pull --squash\` is not allowed (no squash-merge commits). ${HOW}`));
      else if (noFf) findings.push(deny(`\`git pull --no-ff\` creates a merge commit. Use \`git pull --rebase\`. ${HOW}`));
      else if (!(rebase === true || ffOnly)) findings.push(deny(`\`git pull\` must be \`git pull --rebase\` (or --ff-only): a plain pull can create a merge commit. ${HOW}`));
      return;
    }
    case 'commit': {
      for (const a of args) {
        if (a === '--') break;
        if (a === '--no-verify') { findings.push(deny('`git commit --no-verify` skips the rebase-only git hooks and is not allowed.')); return; }
        if (/^-[a-zA-Z]/.test(a) && !a.startsWith('--')) {
          for (const ch of a.slice(1)) {
            if (ch === 'n') { findings.push(deny('`git commit -n` (--no-verify) skips the rebase-only git hooks and is not allowed.')); return; }
            if ('mFcCtSu'.includes(ch)) break; // the rest of the cluster is this option's value
          }
        }
      }
      return;
    }
    case 'config': {
      const READ = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '-l', '--list', '--get-color', '--get-colorbool', 'get', 'list']);
      if (args.some((a) => READ.has(a))) return;
      const keys = args.filter((a) => !a.startsWith('-') && PROTECTED_CONFIG.test(a));
      if (keys.length) findings.push(ask(`This changes protected git config (${keys.join(', ')}), which enforces CLAUDE.md "Hard rules" 1-2. Only the user/lead changes it.`));
      return;
    }
    case 'remote': {
      const verb = args.find((a) => !a.startsWith('-'));
      if (['add', 'set-url', 'rename'].includes(verb)) findings.push(ask(`\`git remote ${verb}\`: this repo has no remote on purpose (CLAUDE.md "Hard rules" 2). Only the user adds one, never a public one.`));
      return;
    }
    default:
      return;
  }
}

function analyzeGh(argv, findings) {
  const w = argv.slice(1).filter((a) => !a.startsWith('-'));
  const [group, verb] = w;
  const bad = { repo: ['create', 'fork', 'sync'], pr: ['create', 'merge'], gist: ['create'], release: ['create', 'upload'] };
  if (bad[group]?.includes(verb)) findings.push(deny(`\`gh ${group} ${verb}\` is not allowed: nothing from this repo is published and branches land by rebase + fast-forward only. ${NO_PUSH}`));
}

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function lookupAlias(sub, dirs, ctx) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sub)) return null;
  const cwd = ctx.cwd && existsSync(ctx.cwd) ? ctx.cwd : process.cwd();
  const r = spawnSync('git', [...dirs.flatMap((d) => ['-C', d]), 'config', '--get', `alias.${sub}`], { cwd, encoding: 'utf8', timeout: 3000 });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

function analyzeText(text, ctx, findings, depth = 0) {
  if (depth > 6) throw new ParseError('too much nesting');
  for (const cmd of splitCommands(text)) analyzeCmd(cmd, ctx, findings, depth);
}

function analyzeCmd(cmd, ctx, findings, depth) {
  const u = unwrap(cmd.words, findings);
  if (!u) return;
  const { argv } = u;
  if (u.viaShell) { analyzeText(argv.join(' '), ctx, findings, depth + 1); return; }
  const prog = base(argv[0]);
  if (prog === 'eval') { analyzeText(argv.slice(1).join(' '), ctx, findings, depth + 1); return; }
  if (SHELLS.has(prog)) {
    let sawC = false;
    for (let k = 1; k < argv.length; k++) {
      const a = argv[k];
      if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(a)) { sawC = true; if (argv[k + 1] !== undefined) analyzeText(argv[k + 1], ctx, findings, depth + 1); break; }
      if (a === '-o' || a === '+o' || a === '-O' || a === '+O') { k++; continue; }
      if (!a.startsWith('-') && !a.startsWith('+')) break; // `sh script.sh`: a script file, not analysed
    }
    if (!sawC) for (const body of cmd.heredocs) analyzeText(body, ctx, findings, depth + 1); // bash <<EOF ... EOF
    return;
  }
  if (prog === 'git') analyzeGit(argv, ctx, findings, depth);
  else if (prog === 'gh') analyzeGh(argv, findings);
  else if (prog === 'curl' || prog === 'wget') analyzeFetch(prog, argv, findings);
  else analyzeCapture(prog, argv, cmd, ctx, findings);
}

// ---------------------------------------------------------------- GitHub through gh (incident I-115, user T-071)
// Agents fetched GitHub with unauthenticated curl and hit its rate limit; the logged-in gh CLI has a far higher
// one. curl/wget naming a GitHub host (github.com and its subdomains, *.githubusercontent.com) and WebFetch to one
// are refused with the gh recipe (I-200, user T-184 #3: an ask put a permission prompt in front of the user whenever
// an agent forgot the rule; a settings deny alone tells the agent nothing). *.github.io (docs sites) is not GitHub.
// Known limits: a URL that reaches curl only at run time (a variable, stdin of xargs, curl -K/--config, wget -i)
// is not seen.
const GH_HOW = 'Use the gh CLI for GitHub (memory/github-via-gh.md, user T-071): gh api repos/<o>/<r>/contents/<path>?ref=<sha>';
const GH_MORE = "; raw file text: gh api -H 'Accept: application/vnd.github.raw+json' 'repos/<o>/<r>/contents/<path>?ref=<sha>'; also gh api repos/<o>/<r>/commits/<sha>, gh search code '<q>' --repo <o>/<r>, gh issue view <n> --repo <o>/<r> (read-only)";
const GITHUB_HOST = /(^|\.)(github\.com|githubusercontent\.com)$/;
/** The refusal for a fetch of `url` by `what` (curl, wget, WebFetch): the recipe, plus a ready gh command for a file URL. */
const ghRefusal = (what, url) => `${what} to ${urlHost(url)} is refused (incident I-200; GitHub is read only through gh, never curl/wget/WebFetch). ${GH_HOW}${GH_MORE}.${ghFileHint(url)}`;
/** A ready gh command for raw.githubusercontent.com/<o>/<r>/<ref>/<path> or github.com/<o>/<r>/blob|raw/<ref>/<path>; '' otherwise. */
function ghFileHint(url) {
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`); } catch { return ''; }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const p = u.pathname.split('/').filter(Boolean);
  let o, r, ref, path;
  if (host === 'raw.githubusercontent.com' && p.length >= 4) {
    [o, r] = p;
    const named = p[2] === 'refs' && ['heads', 'tags'].includes(p[3]); // raw/<o>/<r>/refs/heads/<branch>/<path>
    ref = named ? p[4] : p[2];
    path = p.slice(named ? 5 : 3).join('/');
  } else if (host === 'github.com' && p.length >= 5 && ['blob', 'raw'].includes(p[2])) {
    [o, r, , ref] = p;
    path = p.slice(4).join('/');
  }
  if (!ref || !path || [o, r, ref, path].some((s) => /['\s]/.test(s))) return '';
  return ` For this file: gh api -H 'Accept: application/vnd.github.raw+json' 'repos/${o}/${r}/contents/${path}?ref=${ref}'`;
}
/** The host of a URL-like word (scheme optional, as curl/wget accept), lower-cased; null when it has none. */
function urlHost(word) {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^/@\s]*@)?(\[[^\]]*\]|[^/:?#\s@]+)/i.exec(word);
  return m ? m[1].toLowerCase().replace(/\.$/, '') : null;
}
const isGithubUrl = (word) => GITHUB_HOST.test(urlHost(word) ?? '');
function analyzeFetch(prog, argv, findings) {
  const words = argv.slice(1).map((a) => (/^--url=/.test(a) ? a.slice(6) : a));
  const hit = words.find((a) => !a.startsWith('-') && isGithubUrl(a));
  if (hit) findings.push(deny(ghRefusal(`\`${prog}\``, hit)));
}
// Raw-text form, used only when the command could not be parsed.
const looksGithubFetch = (text) => /\b(curl|wget)\b/.test(text) && /(^|[\s'"=/@.])(github\.com|[a-z0-9-]+\.github\.com|[a-z0-9-]+\.githubusercontent\.com)\b/i.test(text);

// ---------------------------------------------------------------- recording routes (incident I-062)
// The user banned camera access (T-018: QuickTime's New Movie Recording opened the Mac's camera before the
// iPhone source was chosen; an agent listed cameras). The one allowed route to the iPhone's screen is
// `node tools/ioscap.mjs record` (T-019 #21), which can open nothing but the iOS screen device. Denied here:
// QuickTime Player automation, camera listing (system_profiler SPCameraDataType, or a full report), ffmpeg's
// avfoundation input, imagesnap, screencapture video/audio (-v/-V/-g/-G), inline scripts that use the capture
// APIs, and starting ioscap.app other than through the wrapper. Asked: `ioscap.mjs record --first-run` (the
// run that shows the macOS Camera prompt: only with the user's OK, after a console step).
const NO_CAMERA = 'The only route that records the iPhone screen is `node tools/ioscap.mjs record` (incident I-062): it opens nothing but the iOS screen device. Other recording routes can open the Mac\'s own camera or list cameras, which the user banned (T-018).';
const CAPTURE_API = /AVCapture|AVFoundation|CoreMediaIO|CMIOObject|ScreenCaptureKit|SCStream|cv2\.VideoCapture|VideoCapture\s*\(/;
const SCRIPT_RUNNERS = new Set(['swift', 'xcrun', 'python', 'python3', 'ruby', 'perl', 'osascript']); // node has no capture API binding
// I-064 (review-ioscap F2-F4)
const CAMERA_APPS = /photo\s*booth|facetime/i; // both open the Mac camera (also com.apple.PhotoBooth, facetime:// URLs)
const CAMERA_APP_BIN = /(QuickTime Player|Photo ?Booth|FaceTime)\.app\/Contents\/MacOS\//i;
const HOOK_ROOT = (() => { const r = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'); try { return realpathSync(r); } catch { return r; } })();
const IOSCAP_SRC = /(^|\/)tools\/ioscap\//;
const SWIFT_TOOLS = new Set(['swift', 'swiftc', 'swift-frontend']);
const SWIFT_INFO = /^(--?version|--?help|-h)$/;
const SWIFT_VALUED = new Set(['-e', '-swift-version', '-target', '-sdk', '-module-name', '-I', '-L', '-F', '-framework', '-Xcc', '-Xlinker',
  '-Xfrontend', '-Xswiftc', '-D', '-j', '-o', '-resource-dir', '-toolchain', '-enable-upcoming-feature', '-enable-experimental-feature',
  '--package-path', '--chdir', '-C', '--scratch-path', '-c', '--configuration', '--product']);
const SWIFTPM = new Set(['build', 'run', 'test', 'package']);
const cwdOf = (ctx) => (ctx.cwd && existsSync(ctx.cwd) ? ctx.cwd : process.cwd());
function pathOf(arg, ctx) {
  const p = resolve(cwdOf(ctx), arg.startsWith('~/') ? join(homedir(), arg.slice(2)) : arg);
  try { return realpathSync(p); } catch { return p; }
}
/** A Swift source a command names: 'ioscap' (under tools/ioscap/), 'capture' (uses the capture APIs), 'unreadable', or null. */
function swiftSource(arg, ctx) {
  const p = pathOf(arg, ctx);
  if (IOSCAP_SRC.test(arg) || IOSCAP_SRC.test(p)) return 'ioscap';
  try {
    const st = statSync(p);
    if (!st.isFile() || st.size > 8 * 1024 * 1024) return 'unreadable';
    return CAPTURE_API.test(readFileSync(p, 'utf8')) ? 'capture' : null;
  } catch { return 'unreadable'; }
}
/** SwiftPM: the package's own .swift files (no Package.swift: nothing to build). Symlinked directories and huge trees are refused. */
function swiftPackage(dir) {
  if (!existsSync(join(dir, 'Package.swift'))) return null;
  if (IOSCAP_SRC.test(`${dir}/`)) return 'ioscap';
  let files = 0;
  const walk = (d, depth) => {
    if (depth > 12) return 'unreadable';
    let ents;
    try { ents = readdirSync(d, { withFileTypes: true }); } catch { return 'unreadable'; }
    for (const e of ents) {
      if (e.name === '.build' || e.name === '.git' || e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isSymbolicLink()) { try { if (statSync(p).isDirectory()) return 'unreadable'; } catch { continue; } }
      if (e.isDirectory()) { const r = walk(p, depth + 1); if (r) return r; continue; }
      if (!e.name.endsWith('.swift')) continue;
      if (++files > 2000) return 'unreadable';
      const r = swiftSource(p, {});
      if (r) return r;
    }
    return null;
  };
  return walk(dir, 0);
}
function analyzeSwift(prog, argv, ctx, no) {
  const rest = argv.slice(1);
  const why = {
    ioscap: 'Running or compiling the recorder\'s sources (tools/ioscap/) other than through `node tools/ioscap.mjs` (selftest, build, record; a `swiftc -typecheck` is fine)',
    capture: `${prog} on Swift code that uses the capture APIs`,
    unreadable: `${prog} on a Swift file or package this guard cannot read (missing, too large, not a file, or a symlinked folder; write the file first, then run it in a separate command)`,
  };
  const check = (sources) => { for (const s of sources) { const r = swiftSource(s, ctx); if (r) return no(why[r]); } return undefined; };
  if (prog.endsWith('.swift')) return check([argv[0]]); // a swift script run by its path (#!/usr/bin/swift)
  if (rest.length && rest.every((a) => SWIFT_INFO.test(a))) return undefined;
  if (rest.some((a) => a === '-' || a.startsWith('@') || a === '-filelist')) return no(`${prog} reading its source from stdin or a file list (this guard cannot check it)`);
  if (prog === 'swift') {
    let word, pkg;
    for (let k = 0; k < rest.length; k++) {
      const a = rest[k];
      const eq = a.indexOf('=');
      if (a.startsWith('--package-path=') || a.startsWith('--chdir=')) { pkg = a.slice(eq + 1); continue; }
      if (SWIFT_VALUED.has(a)) { if (a === '--package-path' || a === '--chdir' || a === '-C') pkg = rest[k + 1]; k++; continue; }
      if (a.startsWith('-')) continue;
      if (word === undefined) word = a;
    }
    if (word === undefined) return rest.includes('-e') ? undefined : no('The Swift REPL or a script on stdin (this guard cannot check its input)');
    if (SWIFTPM.has(word)) { const r = swiftPackage(pathOf(pkg ?? '.', ctx)); return r ? no(why[r]) : undefined; }
    if (word === 'help') return undefined;
    if (word === 'repl') return no('The Swift REPL (this guard cannot check its input)');
    return check([word, ...rest.filter((a) => a !== word && a.endsWith('.swift'))]);
  }
  // swiftc / swift-frontend: every .swift argument is a source; tools/ioscap/ sources only in a typecheck that emits nothing
  const typecheckOnly = rest.some((a) => a === '-typecheck' || a === '-parse') && !rest.some((a) => /^-(o|c|emit-.+|interpret|immediate|i)$/.test(a));
  for (const s of rest.filter((a) => a.endsWith('.swift'))) {
    const r = swiftSource(s, ctx);
    if (r === 'ioscap' && typecheckOnly) continue;
    if (r) return no(why[r]);
  }
  return undefined;
}
/** <checkout>/out/ioscap/ioscap.app/Contents/MacOS/ioscap of this checkout or one of its .claude/worktrees/<name>. */
function isCheckoutIoscapExe(p) {
  const m = /^(.*)\/out\/ioscap\/ioscap\.app\/Contents\/MacOS\/ioscap$/.exec(p);
  return !!m && (m[1] === HOOK_ROOT || dirname(m[1]) === join(HOOK_ROOT, '.claude', 'worktrees'));
}
// I-064 follow-up (1): nobody views the recordings' frames; the numbers (.json beside the .mov) stay readable
const NO_FRAMES = 'Nobody views the iPhone screen recordings or their frames (user T-018/T-019, incident I-062): `node tools/ioscap.mjs record` prints numbers only; read the .json files beside the .mov.';
const MOVIE = /\.(mov|mp4|m4v|avi|mkv|webm)$/i;
const SCREEN_DIR = /(^|\/)out\/iphone-screen(\/|$)/;
const FRAME_FILE = /\.(png|jpe?g|bmp|tiff?|webp|gif|heic)$/i;
const FRAME_FORMATS = /^(image2|image2pipe|sdl2?|opengl|caca|xv|apng|gif|webp|mjpeg|singlejpeg)$/i;
const VIEWERS = new Set(['qlmanage', 'mpv', 'mplayer', 'vlc', 'iina']);
const isRecording = (a) => MOVIE.test(a) || SCREEN_DIR.test(a);
function analyzeFrames(prog, argv, findings) {
  const rest = argv.slice(1);
  const no = (what) => findings.push(deny(`${what} is not allowed. ${NO_FRAMES}`));
  if (prog === 'open' && rest.some(isRecording)) return no('Opening a screen recording or out/iphone-screen/');
  if (prog === 'ffplay') return no('ffplay (it shows the frames)');
  if (VIEWERS.has(prog.toLowerCase()) && rest.some(isRecording)) return no(`${prog} on a screen recording`);
  if (prog === 'ffmpeg') {
    const fmt = rest.some((a, k) => a === '-f' && FRAME_FORMATS.test(rest[k + 1] ?? ''));
    const imageOut = rest.some((a, k) => FRAME_FILE.test(a) && rest[k - 1] !== '-i');
    if (fmt || imageOut) return no('An ffmpeg frame export or preview');
  }
  return undefined;
}
function analyzeCapture(prog, argv, cmd, ctx, findings) {
  const rest = argv.slice(1);
  const text = [...rest, ...cmd.heredocs].join('\n');
  const no = (what) => findings.push(deny(`${what} is not allowed. ${NO_CAMERA}`));
  analyzeFrames(prog, argv, findings);
  if (prog === 'osascript') {
    if (/quicktime/i.test(text)) return no('QuickTime Player automation');
    if (CAMERA_APPS.test(text)) return no('Photo Booth or FaceTime automation (both open the Mac camera)');
    if (/ioscap/i.test(text)) return no('Starting ioscap through AppleScript (only `node tools/ioscap.mjs record` starts it)');
  }
  if (prog === 'open') {
    if (rest.some((a) => /quicktime/i.test(a))) return no('Opening QuickTime Player');
    if (rest.some((a) => CAMERA_APPS.test(a))) return no('Opening Photo Booth or FaceTime (both open the Mac camera)');
    if (rest.some((a) => /ioscap/i.test(a))) return no('Starting ioscap by hand (open -a/-b, the app bundle; only `node tools/ioscap.mjs record` starts it, with the lease and the checks)');
  }
  if (CAMERA_APP_BIN.test(argv[0]) || /^(QuickTime Player|Photo ?Booth|FaceTime)$/i.test(prog)) return no('Starting QuickTime Player, Photo Booth or FaceTime');
  if (/(^|\/)ioscap\.app\/Contents\/MacOS\//.test(argv[0]) || prog === 'ioscap') {
    if (!(isCheckoutIoscapExe(pathOf(argv[0], ctx)) && rest.length === 1 && rest[0] === '--selftest')) {
      return no('Running an ioscap binary by hand (only <checkout>/out/ioscap/ioscap.app/Contents/MacOS/ioscap --selftest; recording only through `node tools/ioscap.mjs record`)');
    }
  }
  if (prog === 'system_profiler') {
    const types = rest.filter((a) => /^SP\w+DataType$/i.test(a));
    if (types.some((t) => /^SPCameraDataType$/i.test(t))) return no('Listing cameras (system_profiler SPCameraDataType)');
    if (!types.length && !rest.includes('-listDataTypes')) return no('A full system_profiler report (it lists the cameras)');
  }
  if (/^ff(mpeg|probe|play)$/.test(prog) && /avfoundation/i.test(text)) return no(`${prog} with the avfoundation input`);
  if (prog === 'imagesnap') return no('imagesnap (it opens a camera)');
  if (prog === 'screencapture' && rest.some((a) => /^-[A-Za-z]*[vVgG]/.test(a))) return no('screencapture video or audio recording');
  if (SCRIPT_RUNNERS.has(prog) && CAPTURE_API.test(text)) return no(`An inline ${prog} script that uses the capture APIs`);
  if (SWIFT_TOOLS.has(prog) || prog.endsWith('.swift')) { analyzeSwift(prog, argv, ctx, no); return; }
  if ((prog === 'node' || prog === 'nodejs') && rest.some((a) => base(a) === 'ioscap.mjs') && rest.includes('record') && rest.includes('--first-run')) {
    findings.push(ask('`ioscap.mjs record --first-run` shows the macOS Camera prompt for the recorder app: only the lead runs it, with the user watching, after the user\'s OK in a console step (incident I-062).'));
  }
}

/** Analyse one Bash command string. Returns { decision: 'deny'|'ask'|null, reason }. */
export function analyze(command, ctx = {}) {
  const findings = [];
  analyzeText(command, ctx, findings);
  const d = findings.find((f) => f.decision === 'deny') ?? findings.find((f) => f.decision === 'ask');
  return d ?? { decision: null };
}

// Raw-text check used only when parsing failed (fail-closed for the guarded patterns).
export const looksGuarded = (text) =>
  /\bgit\b/.test(text) && /\b(merge|pull|push|send-pack)\b/.test(text) ||
  /\bgh\b/.test(text) && /\b(create|fork|merge|sync)\b/.test(text) ||
  /GIT_CONFIG_(PARAMETERS|COUNT|KEY_|VALUE_)|hookspath/i.test(text) ||
  /QuickTime|SPCameraDataType|avfoundation|\bimagesnap\b|\bscreencapture\b.*\s-[A-Za-z]*[vVgG]|ioscap\.app|AVCapture/i.test(text) ||
  /Photo\s*Booth|FaceTime|local\.fw-study\.ioscap|\b(open|osascript)\b.*\bioscap\b|\bswift(c|-frontend)?\b/i.test(text) || // I-064
  /\b(open|qlmanage|mpv|vlc|iina)\b.*(\.(mov|mp4|m4v)\b|out\/iphone-screen)|\bffplay\b|\bffmpeg\b.*(image2|\.(png|jpe?g|webp|heic)\b)/i.test(text); // I-064 follow-up

// ---------------------------------------------------------------- hook entry point
let raw = '';

async function main() {
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw); } catch {
    if (looksGuarded(raw)) block('git-guard: could not parse the hook input; blocking because it mentions a guarded git/gh operation.');
    process.exit(0);
  }
  if (input?.tool_name === 'WebFetch') { // I-200: refused with the gh recipe; the settings deny rules are the backstop
    const url = input?.tool_input?.url;
    if (typeof url === 'string' && isGithubUrl(url.trim())) block(`git-guard: ${ghRefusal('WebFetch', url.trim())}`);
    process.exit(0);
  }
  if (input?.tool_name !== 'Bash') process.exit(0);
  const command = input?.tool_input?.command;
  if (typeof command !== 'string' || !command.trim()) process.exit(0);
  let res;
  try {
    res = analyze(command, { cwd: input.cwd });
  } catch (e) {
    if (looksGuarded(command)) block(`git-guard could not parse this command (${e.message}) and it mentions a guarded git/gh operation (merge/pull/push). Rewrite it as a plain command without nested quoting. ${HOW}`);
    if (looksGithubFetch(command)) block(`git-guard could not parse this command (${e.message}) and it seems to curl/wget GitHub, which is refused (incident I-200). ${GH_HOW}${GH_MORE}.`);
    process.exit(0);
  }
  if (res.decision === 'deny') block(`git-guard: ${res.reason}`);
  if (res.decision === 'ask') {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: `git-guard: ${res.reason}` } }));
  }
  process.exit(0);
}

function block(msg) {
  process.stderr.write(msg + '\n');
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    // Unexpected crash: same policy as a parse failure (block guarded patterns, allow the rest).
    if (looksGuarded(raw)) block(`git-guard internal error (${e?.message ?? e}); blocking because the command mentions a guarded git/gh operation.`);
    process.stderr.write(`git-guard internal error: ${e?.stack ?? e}\n`);
    process.exit(1);
  });
}
