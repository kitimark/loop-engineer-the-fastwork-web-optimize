#!/usr/bin/env node
// Wait for one thing, then exit by itself (user request 2026-10-01): run it with Bash run_in_background
// and Claude Code wakes you when it exits, instead of `sleep N; check` or `until …; do sleep …; done`.
// Polls with backoff (1 s, growing to 10 s; git every 2-15 s), prints each change of state on stderr and
// ONE result line on stdout. Library: tools/lib/wait.mjs. Lock states: `node tools/lock.mjs wait`.
//
//   node tools/wait.mjs file <path> [--match <regex>] [--pid <pid>] [--timeout 3600]
//        # the file exists and is non-empty, or (--match) a line of it matches; reads only what was appended.
//        # --pid: the process writing it; if it exits without the line: NEVER (exit 4), no hour-long wait.
//        # e.g. a background job's log: --match '^(EXIT|exit) ' ; a recording: iphone.mjs record … > log, --match RECORDING
//   node tools/wait.mjs serve <state.json> [--pid <pid>] [--timeout 120]
//        # a mirror server is listening: serve.mjs --state <file> (fix.mjs serve <topic> writes out/serve-<topic>.json)
//        # names a live pid and its URL answers; prints MET serve: MIRROR_URL=<url> twin=<http twin> pid=<pid>
//   node tools/wait.mjs url <url> [--status 200] [--timeout 120]   # answers (any status < 500, or exactly --status)
//   node tools/wait.mjs pid <pid>[,<pid>...] [--timeout 3600]      # all of them exited
//   node tools/wait.mjs git [--ref main] [--contains <sha> | --path <path> | --grep <regex>] [--timeout 3600]
//        # the ref (default main, any checkout: refs are shared) contains a commit / has a path / has a commit
//        # whose subject matches; with none of these: it moves away from where it was when the wait started
//   node tools/wait.mjs time <ISO time | 10m | 600> --reason "<why no probe fits>"   # a fixed time (no --timeout)
//        # last resort (user T-016, I-058): wait on a probe when one exists (phone cooling is phone-temp, a job is
//        # file/pid, a server serve/url, main git, a lock `lock.mjs wait`). --reason is required (exit 1 without it)
//        # and shows on the status board next to the wait.
//   node tools/wait.mjs phone-temp --below <°C>|auto [--runs-dir out/iphone] [--driver S|W|M] [--every 60] [--timeout 600]
//        # phone cooling between blocks (protocol v2 §5.3, user T-009): the iPhone's battery temperature
//        # (AppleSmartBattery via tools/lib/iphone-run.mjs batteryInfo, over USB) is at or below <°C>. One read
//        # per --every s (default 60, floor 30), one stderr line per read; MET `phone at X °C <= Y °C`; TIMEOUT
//        # after --timeout (default 600 = the 10 min cap: go on, the sentinel decides); UNAVAILABLE exit 1 when
//        # no reading comes (no device, no libimobiledevice) or 3 reads in a row fail. --below auto (I-047): the
//        # battery temperature (end of run) of the last passing heat sentinel today minus 0.5 °C, 38 when there
//        # is none; sentinels are the run records with meta.sentinel.pass true (`iphone.mjs run`) in --runs-dir
//        # (default out/iphone of this checkout; comma-separated for several); one stderr line names the source.
//        # --driver M (the next block's driver): auto is at most 39.5 °C (M sentinels failed hotter, iphone-runner).
//        # Reads only the battery and those files: no lease, no page, no device ids.
//
// Common: --timeout <s|10m|2h> (default 3600; url/serve 120), --for <s> (the condition must hold that long),
// --quiet (no stderr change lines), --owner <agent> (or --as; default $FW_AGENT, then $FW_LOCK_OWNER, else
// "unknown"). The wait itself only reads: it never takes a lock or a queue place.
//
// The board sees every wait (I-058): while it runs, the wait registers itself (tools/lib/waits.mjs: one record in
// <git-common-dir>/fastwork-mirror/waits/, removed on exit; a killed wait's record counts as gone once its pid is
// dead), and `status.mjs list|show` and the console's /status page show it on the owner's rows: "now: waiting for
// <what> since 08:31Z (3 min, timeout 10 min)"; waits whose owner has no row go under "other waits". Pass --owner.
//
// Result line (stdout) and exit code:
//   MET <what>: <detail> (after N s)              exit 0
//   TIMEOUT <what> after N s: <last state>        exit 3   (nothing changed for you: wait again or look)
//   NEVER <what>: <reason> (after N s)            exit 4   (e.g. the --pid process exited without the line)
//   UNAVAILABLE phone-temp: <reason> (after N s)  exit 1   (no battery reading)
//   usage errors                                  exit 1
import { resolve, join, relative, isAbsolute } from 'node:path';
import { pollUntil, parseSec, EXIT, fileCondition, serveCondition, urlCondition, pidsCondition, gitCondition, timeCondition, phoneTempCondition, parseBelowC, autoBelowC, fmtC, PHONE_TEMP } from './lib/wait.mjs';
import { startWait, urlText } from './lib/waits.mjs';

const argv = process.argv.slice(2);
const VALUED = ['--match', '--pid', '--timeout', '--status', '--ref', '--contains', '--path', '--grep', '--for', '--below', '--every', '--runs-dir', '--driver', '--owner', '--as', '--reason'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const [cmd, ...pos] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));

function num(name, v, { min = 0 } = {}) {
  const n = parseSec(v);
  if (!(n >= min)) throw new Error(`--${name} must be a number of seconds (or 10m, 2h), got ${v}`);
  return n;
}
function pidOpt() {
  const v = opt('pid');
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v)) throw new Error(`--pid must be a process id, got ${v}`);
  return Number(v);
}
/** A path for the board: relative to the working directory when inside it. */
function shown(p) { const r = relative(process.cwd(), p); return r && !r.startsWith('..') && !isAbsolute(r) ? r : p; }
const TIME_USAGE = 'usage: node tools/wait.mjs time <ISO time | 10m | 600> --reason "<why no probe fits>" (shown on the status board; user T-016, I-058). '
  + "Wait on a probe instead when one exists: phone cooling `wait.mjs phone-temp --below auto`; a job `wait.mjs file <log> --match '^EXIT' --pid <pid>` "
  + 'or `wait.mjs pid <pid>`; a server `wait.mjs serve <state.json>` or `wait.mjs url <u>`; main `wait.mjs git --contains <sha>`; a lock `lock.mjs wait chrome-measure --until …`';

function regex(v, name) {
  try { return new RegExp(v); } catch (e) { throw new Error(`--${name} is not a valid regular expression: ${e.message}`); }
}

async function build() {
  const need = (what) => { if (!pos[0]) throw new Error(`usage: node tools/wait.mjs ${cmd} <${what}> (see the header of tools/wait.mjs)`); return pos[0]; };
  if (cmd === 'file') {
    const p = resolve(need('path'));
    const match = opt('match') !== undefined ? regex(opt('match'), 'match') : undefined;
    const pid = pidOpt();
    const plain = `${match ? `a line of ${shown(p)} to match /${match.source}/` : `${shown(p)} to appear`}${pid ? ` (writer pid ${pid})` : ''}`;
    return { what: match ? `file ${p} ~ /${match.source}/` : `file ${p}`, plain, check: fileCondition(p, { match, pid }) };
  }
  if (cmd === 'serve') { const p = resolve(need('state.json')); return { what: `serve ${p}`, plain: `the mirror server of ${shown(p)} to answer`, check: serveCondition(p, { pid: pidOpt() }), defTimeout: 120 }; }
  if (cmd === 'url') {
    const u = need('url');
    const status = opt('status') !== undefined ? Number(opt('status')) : undefined;
    if (status !== undefined && !(status >= 100 && status < 600)) throw new Error(`--status must be an HTTP status, got ${opt('status')}`);
    return { what: `url ${u}${status ? ` HTTP ${status}` : ''}`, plain: `${urlText(u)} to answer${status ? ` HTTP ${status}` : ''}`, check: urlCondition(u, { status }), defTimeout: 120 };
  }
  if (cmd === 'pid') {
    const pids = pos.join(',').split(',').filter(Boolean);
    if (!pids.length || pids.some((p) => !/^\d+$/.test(p))) throw new Error('usage: node tools/wait.mjs pid <pid>[,<pid>...]');
    return { what: `pid ${pids.join(',')}`, plain: `process ${pids.join(', ')} to exit`, check: pidsCondition(pids.map(Number)) };
  }
  if (cmd === 'git') {
    const ref = opt('ref', 'main');
    const grep = opt('grep') !== undefined ? regex(opt('grep'), 'grep') : undefined;
    const sel = [opt('contains'), opt('path'), grep].filter((x) => x !== undefined);
    if (sel.length > 1) throw new Error('git: give one of --contains, --path, --grep');
    const what = `git ${ref}${opt('contains') ? ` contains ${opt('contains')}` : opt('path') ? ` has ${opt('path')}` : grep ? ` subject ~ /${grep.source}/` : ' moves'}`;
    const plain = opt('contains') ? `${ref} to contain ${opt('contains')}` : opt('path') ? `${ref} to have ${opt('path')}` : grep ? `a commit on ${ref} whose subject matches /${grep.source}/` : `${ref} to move`;
    return { what, plain, check: gitCondition({ ref, contains: opt('contains'), path: opt('path'), grep }), minMs: 2000, maxMs: 15000 };
  }
  if (cmd === 'time') {
    const v = need('ISO time | 10m | 600');
    const sec = parseSec(v);
    const at = sec >= 0 ? Date.now() + sec * 1000 : Date.parse(v);
    if (!Number.isFinite(at)) throw new Error(`time: give an ISO time (2026-10-01T14:05:00Z) or a duration (600, 10m), got ${v}`);
    if (opt('timeout') !== undefined) throw new Error('time: no --timeout (the time is the timeout)');
    const reason = String(opt('reason') ?? '').trim();
    if (!reason || reason.startsWith('--')) throw new Error(TIME_USAGE);
    return { what: `time ${new Date(at).toISOString()}`, plain: `a fixed timer until ${new Date(at).toISOString().slice(11, 16)}Z`, reason, check: timeCondition(at), defTimeout: Math.max(0, (at - Date.now()) / 1000) + 5, maxMs: 30000 };
  }
  if (cmd === 'phone-temp') {
    if (opt('below') === undefined) throw new Error('usage: node tools/wait.mjs phone-temp --below <°C>|auto [--runs-dir out/iphone] [--driver S|W|M] [--every 60] [--timeout 600] (see the header of tools/wait.mjs)');
    let belowC = parseBelowC(opt('below'));
    const every = opt('every') !== undefined ? parseSec(opt('every')) : PHONE_TEMP.everySec;
    if (!(every >= PHONE_TEMP.minEverySec)) throw new Error(`--every must be a number of seconds >= ${PHONE_TEMP.minEverySec} (keep phone polling gentle, protocol §5.5), got ${opt('every')}`);
    if ((opt('runs-dir') !== undefined || opt('driver') !== undefined) && belowC !== 'auto') throw new Error('--runs-dir and --driver go with --below auto');
    const driver = opt('driver') === undefined ? null : String(opt('driver')).toUpperCase();
    if (driver !== null && !['S', 'W', 'M'].includes(driver)) throw new Error(`--driver is the next block's driver: S, W or M (got ${opt('driver')})`);
    const { batteryInfo } = await import('./lib/iphone-run.mjs'); // only here: the other waits don't load the phone code
    if (belowC === 'auto') {
      const { REPO } = await import('./lib/paths.mjs');
      const dirs = opt('runs-dir') !== undefined ? String(opt('runs-dir')).split(',').filter(Boolean).map((d) => resolve(d)) : [join(REPO, 'out', 'iphone')];
      const a = autoBelowC(dirs, { driver });
      const rel = (p) => { const r = relative(REPO, p); return r && !r.startsWith('..') && !isAbsolute(r) ? r : p; };
      belowC = a.belowC;
      console.error(a.source
        ? `auto: --below ${fmtC(belowC)} °C = ${fmtC(a.source.temperatureC)} °C (battery after the last passing heat sentinel today, ${rel(a.source.file)}, ${new Date(a.source.at).toISOString().slice(11, 19)}Z) - ${fmtC(PHONE_TEMP.autoMarginC)}`
        : `auto: --below ${fmtC(belowC)} °C (no passing heat sentinel with a battery reading today in ${dirs.map(rel).join(', ')}; ${a.scanned} record(s) from today read)`);
      if (a.capped) console.error(`auto: --driver M: capped at ${fmtC(belowC)} °C (M blocks start at or below ${fmtC(PHONE_TEMP.morphCapC)} °C)`);
      return { what: 'phone-temp --below auto', plain: `the phone to cool to ${fmtC(belowC)} °C or below (auto)`, check: phoneTempCondition(belowC, { read: batteryInfo }), defTimeout: PHONE_TEMP.timeoutSec, minMs: every * 1000, maxMs: every * 1000, never: { word: 'UNAVAILABLE', exit: EXIT.usage } };
    }
    return { what: 'phone-temp', plain: `the phone to cool to ${fmtC(belowC)} °C or below`, check: phoneTempCondition(belowC, { read: batteryInfo }), defTimeout: PHONE_TEMP.timeoutSec, minMs: every * 1000, maxMs: every * 1000, never: { word: 'UNAVAILABLE', exit: EXIT.usage } };
  }
  throw new Error(cmd ? `unknown wait "${cmd}": file, serve, url, pid, git, time or phone-temp (see the header of tools/wait.mjs)` : 'usage: node tools/wait.mjs file|serve|url|pid|git|time|phone-temp … [--timeout 3600] (see the header of tools/wait.mjs)');
}

async function main() {
  const usage = 'usage: node tools/wait.mjs file|serve|url|pid|git|time|phone-temp … [--timeout 3600] [--for S] [--quiet] [--owner <you>] (time also --reason "<why>"); exit 0 met, 3 timeout, 4 never (phone-temp: 1 unavailable); see the header of tools/wait.mjs';
  if (cmd === 'help' || flag('help')) { console.log(usage); return 0; }
  if (!cmd) { console.error(usage); return EXIT.usage; }
  const w = await build();
  const timeoutSec = opt('timeout') !== undefined ? num('timeout', opt('timeout')) : w.defTimeout ?? 3600;
  const holdSec = opt('for') !== undefined ? num('for', opt('for')) : 0;
  const quiet = flag('quiet');
  const onChange = quiet ? undefined : (state, sec) => console.error(`[wait ${new Date().toISOString().slice(11, 19)}Z +${sec}s] ${state}`);
  // I-058: the board shows this wait while it runs (one record, removed on exit)
  startWait({ tool: `wait.mjs ${cmd}`, owner: opt('owner') ?? opt('as'), what: `${w.plain}${holdSec ? `, held ${holdSec} s` : ''}`, timeoutSec, reason: w.reason });
  const r = await pollUntil(w.check, { timeoutSec, holdSec, onChange, ...(w.minMs && { minMs: w.minMs }), ...(w.maxMs && { maxMs: w.maxMs }) });
  if (r.result === 'met') { console.log(`MET ${w.what}: ${r.detail ?? r.state}${holdSec ? ` (held ${holdSec} s)` : ''} (after ${r.waitedSec} s)`); return EXIT.met; }
  if (r.result === 'never') { console.log(`${w.never?.word ?? 'NEVER'} ${w.what}: ${r.never} (after ${r.waitedSec} s)`); return w.never?.exit ?? EXIT.never; }
  console.log(`TIMEOUT ${w.what} after ${r.waitedSec} s: ${r.state}`);
  return EXIT.timeout;
}

main().then((c) => process.exit(c), (e) => { console.error(e.message || e); process.exit(EXIT.usage); });
