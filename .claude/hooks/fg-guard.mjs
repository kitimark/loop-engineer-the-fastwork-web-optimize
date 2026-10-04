#!/usr/bin/env node
// Claude Code PreToolUse hook for Bash: refuses known long commands run in the Bash tool's foreground (incident
// I-170, user T-152). An agent learns of messages, user threads and wakes only between tool rounds, so a command
// that runs for minutes in the foreground makes it deaf until it ends. CLAUDE.md "Agent communication": long commands
// run with `run_in_background: true`.
//
//   deny (exit 2, one-line reason on stderr) when tool_input.run_in_background !== true and any simple command
//   (each part of &&, ||, ;, |, newlines, $( ), sh|bash|zsh -c, eval, heredocs to a shell; through wrappers such as
//   env, timeout, nice, nohup, and every layer of `node .../lock.mjs ... -- <cmd>`) runs:
//     npm test (t, tst, run test) and any npm script whose text runs one of the commands below (test:all,
//       test:chrome*, test:bench, serve*, verify); node --test without files or on tests/e2e or tests/chrome
//     lock.mjs run; lock.mjs acquire --wait N (N > 60); lock.mjs wait
//     fix.mjs ab|serve; verify.mjs; bench.mjs; serve.mjs
//     iphone.mjs scroll|record|run|gesture; ioscap.mjs record; sim.mjs session
//     wait.mjs (any); console.mjs wait and thread wait; incident.mjs wait; finding.mjs wait; caffeinate
//   A wait with an explicit --timeout N (seconds, or Ns/Nm/Nh) with N <= 60 is allowed, as is acquire --wait N <= 60.
//   allowed: everything else (npm run test:unit|test:scope|test:hooks, node --test on tests/unit or tests/hooks
//   files, status/list/show/set/doing/release/renew/...), any tool invoked with --help or -h (before its `--`),
//   and a command started in the shell's background (`cmd > log 2>&1 &`) unless the same command line runs `wait`.
//   No escape hatch: no environment variable switches this off (CLAUDE.md Hard rules: no workarounds).
//
// The shell lexer and the wrapper stripping are git-guard's (`splitCommands`, `unwrap` with a per-layer callback),
// so both hooks see the same commands. Failure policy: fail open. Any parse error, a missing or broken git-guard,
// malformed input or a crash allows the call and logs nothing (a hook bug must never brick the Bash tool, and the
// command text may carry personal data). Known limits: a long command hidden in a script file (`sh run.sh`), started
// by a tool's own child process, or built at run time (a variable) is not seen; builds and `git commit` (whose
// pre-commit hook may run npm test) are not on the list.
//
// Input (stdin): {"tool_name":"Bash","tool_input":{"command":"...","run_in_background":true|undefined}, ...}
// No dependencies; `node .claude/hooks/fg-guard.mjs < input.json`.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REASON = 'run it with run_in_background: true; a foreground long command makes you deaf to messages (CLAUDE.md, user T-152)';
const MAX_WAIT_S = 60;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish']);
const base = (p) => p.slice(p.lastIndexOf('/') + 1);

let lib; // git-guard.mjs: splitCommands, unwrap (loaded in main, so a broken git-guard fails open)

// ---------------------------------------------------------------- option helpers
// Options that take a value in the tools below (a union: only used to find the subcommand word).
const VALUED = new Set(['--owner', '--by', '--as', '--timeout', '--wait', '--ttl', '--max-seconds', '--weight', '--doing', '--for',
  '--eta-min', '--reason', '--until', '--url', '--url2', '--note', '--text', '--label', '--seconds', '--port', '--runs', '--match',
  '--pid', '--status', '--ref', '--contains', '--path', '--grep', '--below', '--every', '--runs-dir', '--driver', '--kind',
  '--title', '--instructions', '--part', '--epoch', '--thread', '--topic', '--topics', '--since', '--poll', '--lines', '--on',
  '--root', '--latency', '--idle', '--to', '--cap', '--resource']);
const beforeDD = (args) => { const k = args.indexOf('--'); return k < 0 ? args : args.slice(0, k); };
function positionals(args) {
  const out = [];
  const a = beforeDD(args);
  for (let k = 0; k < a.length; k++) {
    if (a[k].startsWith('-')) { if (!a[k].includes('=') && VALUED.has(a[k])) k++; continue; }
    out.push(a[k]);
  }
  return out;
}
function optVal(args, name) {
  let v;
  const a = beforeDD(args);
  for (let k = 0; k < a.length; k++) {
    if (a[k] === `--${name}`) v = a[k + 1] ?? '';
    else if (a[k].startsWith(`--${name}=`)) v = a[k].slice(name.length + 3);
  }
  return v;
}
/** Seconds of a duration word (60, 60s, 1m, 2h); NaN when it is not one. */
function seconds(v) {
  const m = /^(\d+(?:\.\d+)?)(s|m|h)?$/.exec(String(v ?? '').trim());
  return m ? Number(m[1]) * ({ s: 1, m: 60, h: 3600 }[m[2] ?? 's']) : NaN;
}
const hasHelp = (args) => beforeDD(args).some((a) => a === '--help' || a === '-h');

const long = (what, hint) => ({ what, hint });
/** A wait: allowed with --<opt> N, N <= 60 s; otherwise long. */
function waitRule(what, args, opt = 'timeout') {
  const v = optVal(args, opt);
  return v !== undefined && seconds(v) <= MAX_WAIT_S ? null : long(what, `--${opt} N with N <= ${MAX_WAIT_S}`);
}

// ---------------------------------------------------------------- the tools
function checkTool(name, args) {
  if (hasHelp(args)) return null;
  const [sub, sub2] = positionals(args);
  switch (name) {
    case 'lock.mjs':
      if (sub === 'run') return long('lock.mjs run');
      if (sub === 'acquire') return optVal(args, 'wait') === undefined ? null : waitRule('lock.mjs acquire --wait', args, 'wait');
      if (sub === 'wait') return waitRule('lock.mjs wait', args);
      return null;
    case 'fix.mjs': return sub === 'ab' || sub === 'serve' ? long(`fix.mjs ${sub}`) : null;
    case 'verify.mjs': case 'bench.mjs': case 'serve.mjs': return long(name);
    case 'iphone.mjs': return ['scroll', 'record', 'run', 'gesture'].includes(sub) ? long(`iphone.mjs ${sub}`) : null;
    case 'ioscap.mjs': return sub === 'record' ? long('ioscap.mjs record') : null;
    case 'sim.mjs': return sub === 'session' ? long('sim.mjs session') : null;
    case 'wait.mjs': return waitRule(`wait.mjs${sub ? ` ${sub}` : ''}`, args);
    case 'console.mjs':
      if (sub === 'wait') return waitRule('console.mjs wait', args);
      if (sub === 'thread' && sub2 === 'wait') return waitRule('console.mjs thread wait', args);
      return null;
    case 'incident.mjs': case 'finding.mjs': return sub === 'wait' ? waitRule(`${name} wait`, args) : null;
    default: return null;
  }
}

// node [opts] <script> [args] | node --test [files] | node -e/-p (inline: not checked)
const NODE_VALUED = new Set(['-r', '--require', '--import', '--loader', '--experimental-loader', '-C', '--conditions', '--input-type',
  '--env-file', '--watch-path', '--title', '--test-reporter', '--test-reporter-destination', '--test-name-pattern',
  '--test-skip-pattern', '--test-concurrency', '--test-timeout', '--test-shard']);
function checkNode(rest) {
  let test = false;
  const files = [];
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (a === '-e' || a === '--eval' || a === '-p' || a === '--print') return null;
    if (a === '--test') { test = true; continue; }
    if (a === '--') { if (test) files.push(...rest.slice(k + 1)); else if (rest[k + 1] !== undefined) return checkTool(base(rest[k + 1]), rest.slice(k + 2)); break; }
    if (a.startsWith('-')) { if (!a.includes('=') && NODE_VALUED.has(a)) k++; continue; }
    if (test) { files.push(a); continue; }
    return checkTool(base(a), rest.slice(k + 1));
  }
  if (!test) return null;
  if (!files.length) return long('node --test (every test file)');
  const wide = files.find((f) => /(^|\/)tests\/(e2e|chrome)(\/|$)/.test(f) || /^(\.|\.\/|tests\/?)$/.test(f));
  return wide ? long(`node --test ${wide}`) : null;
}

// npm test | npm run <script>: the script's own text from package.json is checked like any command
const NPM_VALUED = new Set(['--prefix', '-C', '--workspace', '-w', '--userconfig', '--cache', '--loglevel']);
let scripts;
function npmScripts() {
  if (scripts === undefined) {
    try { scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts ?? null; } catch { scripts = null; }
  }
  return scripts;
}
function checkNpm(rest, depth) {
  const pos = [];
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (a === '--') break;
    if (a.startsWith('-')) { if (!a.includes('=') && NPM_VALUED.has(a)) k++; continue; }
    pos.push(a);
  }
  if (hasHelp(rest)) return null;
  let name, label;
  if (['test', 't', 'tst'].includes(pos[0])) { name = 'test'; label = 'npm test'; }
  else if (['run', 'run-script', 'rum', 'urn'].includes(pos[0]) && pos[1]) { name = pos[1]; label = `npm run ${name}`; }
  else return null;
  const s = npmScripts();
  if (!s || typeof s[name] !== 'string') return name === 'test' || /^test:(all|chrome)/.test(name) ? long(label) : null;
  const dd = rest.indexOf('--');
  const extra = dd < 0 ? '' : ` ${rest.slice(dd + 1).map((x) => `'${x.replace(/'/g, `'\\''`)}'`).join(' ')}`;
  const hit = analyzeText(s[name] + extra, depth + 1);
  return hit ? long(label, hit.hint) : null;
}

// ---------------------------------------------------------------- walking the command line
/** One layer of a simple command (before git-guard's unwrap strips it). */
function checkLayer(w, depth) {
  const prog = base(w[0]);
  if (prog === 'caffeinate') return long('caffeinate');
  if (prog === 'npm') return checkNpm(w.slice(1), depth);
  if (prog === 'node' || prog === 'nodejs') return checkNode(w.slice(1));
  if (prog.endsWith('.mjs')) return checkTool(prog, w.slice(1));
  return null;
}

function analyzeCmd(cmd, depth) {
  let hit = null;
  const u = lib.unwrap(cmd.words, [], (w) => { hit ??= checkLayer(w, depth); });
  if (hit || !u) return hit;
  const { argv } = u;
  if (u.viaShell) return analyzeText(argv.join(' '), depth + 1);
  const prog = base(argv[0]);
  if (prog === 'eval') return analyzeText(argv.slice(1).join(' '), depth + 1);
  if (SHELLS.has(prog)) {
    for (let k = 1; k < argv.length; k++) {
      const a = argv[k];
      if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(a)) return argv[k + 1] === undefined ? null : analyzeText(argv[k + 1], depth + 1);
      if (a === '-o' || a === '+o' || a === '-O' || a === '+O') { k++; continue; }
      if (!a.startsWith('-') && !a.startsWith('+')) return null; // `sh script.sh`: a script file, not analysed
    }
    for (const body of cmd.heredocs) { const h = analyzeText(body, depth + 1); if (h) return h; } // bash <<EOF ... EOF
  }
  return null;
}

/** The first long foreground command in a command line, or null. */
function analyzeText(text, depth = 0) {
  if (depth > 6) throw new Error('too much nesting');
  const cmds = lib.splitCommands(text);
  const waits = cmds.some((c) => c.words[0] === 'wait'); // `long & wait` blocks after all
  for (const c of cmds) {
    if (c.bg && !waits) continue;
    const hit = analyzeCmd(c, depth);
    if (hit) return hit;
  }
  return null;
}

function message(hit) {
  return `fg-guard: \`${hit.what}\` can run for minutes: ${REASON}.${hit.hint ? ` A short wait may instead pass ${hit.hint}.` : ''}`;
}

// ---------------------------------------------------------------- hook entry point
async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw); } catch { return 0; }
  if (input?.tool_name !== 'Bash') return 0;
  const ti = input.tool_input ?? {};
  if (ti.run_in_background === true) return 0;
  if (typeof ti.command !== 'string' || !ti.command.trim()) return 0;
  let hit;
  try {
    lib = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'git-guard.mjs')).href);
    hit = analyzeText(ti.command);
  } catch { return 0; } // fail open, log nothing
  if (!hit) return 0;
  process.stderr.write(message(hit).replace(/\s*\n\s*/g, ' ') + '\n');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code), () => process.exit(0));
}
