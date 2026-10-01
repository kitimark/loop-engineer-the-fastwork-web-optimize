#!/usr/bin/env node
// User console (ts-user-console, user request 2026-10-01): a local page where the user sees what the agents
// need from them (finger tests, blind swipe A/B, yes/no questions), oldest first, and clicks Start when ready.
// Agents post steps and wait on the user's clicks, so a recorder starts on Start, before the user swipes.
// Store: <git-common-dir>/fastwork-mirror/console/ (every worktree sees it; $FW_STATE_DIR in tests).
// Library: tools/lib/console.mjs (state machine), tools/lib/console-server.mjs (HTTP), tools/lib/console-page.html.
//
// The page (lead or user, once; run it in the background; localhost only, never 5173):
//   node tools/console.mjs serve [--port auto|N] [--open] [--notify] [--remind <min>]   # prints CONSOLE_URL=http://localhost:<port>/
//        # already running: prints the running one's CONSOLE_URL and exits 0 (its flags stay as they were)
//        # Both pages ("/" steps, "/progress") share a top bar: "Your steps" with a live badge (open steps), "Progress",
//        # and Alerts (sound on/muted, desktop notifications after a click, remind-after minutes, test, theme). A new
//        # step shows a banner with Open, chimes (Web Audio), puts "(n) " in the tab title and, once allowed, raises a
//        # desktop notification; a step left on the user's turn for --remind minutes (default 3, 0 = never; the page
//        # can override it) is announced once more, quietly. Notifications carry only the step id and a sanitized title.
//        # --notify (off by default, macOS, local only): the server also raises a macOS notification per new step and
//        # one reminder (osascript via execFile with an argv array, no shell; tools/lib/console-notify.mjs).
//   node tools/console.mjs url                              # CONSOLE_URL of the running page (exit 3: none)
//
// Agents:
//   node tools/console.mjs post --by <agent> --kind question|choice|action|swipe-pair --title "<one line>"
//        [--instructions "<1-2 plain sentences>"] [--url <url>] [--url2 <url>] [--options a,b,c | --yesno | --text]
//        [--record] [--gate] [--no-record] [--no-gate] [--show-url | --hide-url] [--parts '<json array>'] [--meta '<json>']
//        [--scale 1-5 [--scale-label "How different did they feel?"]]   # an optional rating next to the pick
//        # prints POSTED C-007. Kinds: question (yes/no unless --options/--text), choice (--options),
//        # action (one part: Start, then Done; --record/--gate as below), swipe-pair (Page 1 = --url, Page 2 = --url2,
//        # both gated and recorded, answer 1 / 2 / same, URLs hidden from the page: blind).
//        # gate: Start stays disabled until you ack ready; record: after Start the page says "don't swipe yet"
//        # until you ack recording, then "recording… swipe now". --meta: private to agents (e.g. the blind key and
//        # the A/B order), never shown on the page, returned by wait --until answered. Forced choice: --options 1,2.
//        # A session that runs on the phone page itself: --kind action --hide-url --options "done,stopped early".
//   node tools/console.mjs wait <id> [--until started|recording|done|answered] [--part N] [--timeout 3600] [--json] [--quiet]
//        # exit 0 MET (prints MET … : <json>; --json: the JSON alone), 3 TIMEOUT, 4 NEVER (skipped/cancelled), 1 usage.
//        # in a sequence pass --part N (1-based). answered prints {value, notes, meta}.
//   node tools/console.mjs ack <id> --by <agent> [--state loading|ready|recording|done] [--part N] [--message "<short line>"]
//   node tools/console.mjs redo <id> --by <agent> [--part N] [--message "why"]   # ask part N again (e.g. the swipe was missed)
//   node tools/console.mjs reopen <id> --by <agent>      # queue a skipped (or any) step again, from the start
//   node tools/console.mjs cancel <id> --by <agent> [--note "..."]   # withdraw it (no longer needed)
//
// Swipe pair, runner side:  post … → ack C-7 --part 1 --state loading → (page ready) ack --part 1 --state ready
//   → wait C-7 --until started --part 1 → start the recorder → ack --part 1 --state recording
//   → wait --until done --part 1 → stop the recorder → the same for part 2 → wait --until answered
//
// Lead:
//   node tools/console.mjs list [--pending] [--all] [--json]    # open and finished steps with their answers
//   node tools/console.mjs show <id> [--json]
//   node tools/console.mjs answer <id> --by <who> --value <v> [--scale N] [--notes "..."]   # the user answered in chat instead
//
// Fix progress for the user (read-only; the same content as the page's Progress tab, /progress):
//   node tools/console.mjs progress [--details] [--json]   # curated fixes/PROGRESS.json + live phone/Chrome/incidents/steps
//   node tools/console.mjs progress --check [--file <path>] # validate a PROGRESS.json (schema + no personal data); exit 1 on errors
//        # mgmt-ops keeps fixes/PROGRESS.json current (schema: header of tools/lib/progress.mjs)
//
// Exit codes: 0 ok / MET, 1 usage or refused (the reason on stderr), 3 TIMEOUT (wait) / no server (url), 4 NEVER (wait).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { post, list, get, ack, redo, reopen, cancel, answer, waitCondition, line, parseId, consoleDir } from './lib/console.mjs';
import { runningServer, startServer } from './lib/console-server.mjs';
import { DEFAULT_REMIND_MIN } from './lib/console-notify.mjs';
import { pollUntil, parseSec, EXIT, httpGet } from './lib/wait.mjs';
import { autoPortBase } from './lib/paths.mjs';
import { currentView, renderText, readProgress } from './lib/progress.mjs';

const argv = process.argv.slice(2);
const VALUED = ['--remind', '--by', '--kind', '--title', '--instructions', '--url', '--url2', '--options', '--parts', '--meta', '--until', '--part', '--timeout', '--state', '--message', '--note', '--notes', '--value', '--port', '--scale', '--scale-label', '--file'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const [cmd, arg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const by = () => opt('by', process.env.FW_AGENT || process.env.FW_LOCK_OWNER);
const tri = (yes, no) => (flag(yes) ? true : flag(no) ? false : undefined);

async function serverUrl() {
  const s = runningServer();
  if (!s) return null;
  const r = await httpGet(new URL('api/health', s.url).href, 2000);
  return r.status === 200 ? s.url : null;
}

function show(s) {
  const L = [line(s)];
  if (s.instructions) L.push(`  instructions: ${s.instructions}`);
  if (s.url) L.push(`  url: ${s.url}${s.showUrl === false ? ' (hidden on the page)' : ''}`);
  s.parts.forEach((p, i) => L.push(`  part ${i + 1} ${p.label}: ${p.state}${p.gate ? ' gated' : ''}${p.record ? ' recorded' : ''}${p.url ? ` ${p.url}` : ''}${p.message ? ` — "${p.message}"` : ''}`));
  L.push(`  answer: ${s.answer.mode === 'buttons' ? s.answer.options.join(' / ') : s.answer.mode}${s.result ? ` -> ${JSON.stringify(s.result)}` : ''}`);
  if (s.meta) L.push(`  meta: ${JSON.stringify(s.meta)}`);
  L.push('  history:');
  for (const h of s.history) L.push(`    ${h.at} ${h.who} ${h.action}${h.part ? ` part ${h.part}` : ''}${h.state ? ` ${h.state}` : ''}${h.note ? `: ${h.note}` : ''}${h.value !== undefined ? ` ${JSON.stringify(h.value)}` : ''}`);
  return L.join('\n');
}

async function serve() {
  const existing = await serverUrl();
  if (existing) {
    console.log(`CONSOLE_URL=${existing}`); console.log(`already running (pid ${runningServer().pid}); store ${consoleDir()}`);
    if (flag('notify') || opt('remind') !== undefined) console.log('note: --notify/--remind apply when a server starts; stop the running one first to change them');
    return 0;
  }
  const p = String(opt('port', 'auto'));
  let candidates;
  if (p === 'auto') { const b = autoPortBase(); candidates = Array.from({ length: 60 }, (_, i) => 5200 + ((b - 5200 + 400 + i) % 800)); } // the half of the range away from this checkout's mirror port
  else if (/^\d+$/.test(p) && Number(p) !== 5173) candidates = [Number(p)];
  else throw new Error(`--port must be auto, 0 or a port number other than 5173 (got ${p})`);
  const remindRaw = opt('remind', String(DEFAULT_REMIND_MIN));
  const remindMin = Number(remindRaw);
  if (!/^\d+(\.\d+)?$/.test(String(remindRaw)) || !(remindMin >= 0 && remindMin <= 1440)) throw new Error(`--remind must be minutes, 0-1440 (0 = never), got ${remindRaw}`);
  const notify = flag('notify');
  const srv = await startServer(candidates, { notify, remindMin, onNotifyError: (e) => console.error(`notify: osascript failed: ${e.message}`) });
  console.log(`CONSOLE_URL=${srv.url}`);
  console.log(`store ${consoleDir()}; open the URL in a desktop browser; Ctrl-C to stop`);
  if (notify) console.log(process.platform === 'darwin' || process.env.FW_CONSOLE_NOTIFY_LOG ? `macOS notifications on (new steps; reminder after ${remindMin || 'never'}${remindMin ? ' min' : ''})` : 'notify: macOS notifications need macOS; ignored here');
  if (flag('open') && process.platform === 'darwin') spawn('open', [srv.url], { stdio: 'ignore', detached: true }).unref();
  const stop = () => { srv.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('SIGHUP', stop);
  return new Promise(() => {}); // until a signal
}

async function main() {
  if (!cmd || cmd === 'help' || flag('help')) { console.log('see the header of tools/console.mjs'); return cmd ? 0 : EXIT.usage; }
  if (cmd === 'serve') return serve();
  if (cmd === 'url') { const u = await serverUrl(); if (!u) { console.log('NO SERVER: node tools/console.mjs serve (run it in the background)'); return 3; } console.log(`CONSOLE_URL=${u}`); return 0; }
  if (cmd === 'post') {
    let parts = opt('parts');
    if (parts !== undefined) { const raw = parts.startsWith('@') ? readFileSync(parts.slice(1), 'utf8') : parts; try { parts = JSON.parse(raw); } catch (e) { throw new Error(`--parts is not JSON: ${e.message}`); } }
    const s = await post({
      by: by(), kind: opt('kind'), title: opt('title'), instructions: opt('instructions'), url: opt('url'), url2: opt('url2'),
      options: opt('options'), yesno: flag('yesno'), text: flag('text'), record: tri('record', 'no-record'), gate: tri('gate', 'no-gate'),
      showUrl: tri('show-url', 'hide-url'), parts, meta: opt('meta'), scale: opt('scale'), scaleLabel: opt('scale-label'),
    });
    console.log(`POSTED ${s.id}: ${s.title}`);
    const u = await serverUrl();
    console.log(u ? `on the user console ${u} (the user sees it within a second)` : 'the console page is not running: ask the lead to start `node tools/console.mjs serve`');
    return 0;
  }
  if (cmd === 'list') {
    const items = list({ all: flag('all'), pending: flag('pending') });
    if (flag('json')) console.log(JSON.stringify(items, null, 1));
    else if (!items.length) console.log(flag('pending') ? 'no open console steps' : 'no console steps');
    else for (const s of items) console.log(line(s));
    return 0;
  }
  if (cmd === 'progress') {
    if (opt('file')) process.env.FW_PROGRESS_FILE = opt('file');
    if (flag('check')) {
      const { errors, file } = readProgress();
      if (errors.length) { console.log(`PROGRESS INVALID ${file}:`); for (const e of errors) console.log(`  ${e}`); return 1; }
      console.log(`PROGRESS OK ${file}`);
      return 0;
    }
    const v = await currentView();
    console.log(flag('json') ? JSON.stringify(v, null, 1) : renderText(v, { details: flag('details') }));
    return 0;
  }
  if (!arg) throw new Error(`usage: node tools/console.mjs ${cmd} <id> … (see the header of tools/console.mjs)`);
  const id = parseId(arg);
  if (cmd === 'show') { const s = get(id); console.log(flag('json') ? JSON.stringify(s, null, 1) : show(s)); return 0; }
  if (cmd === 'ack') { const s = await ack(id, { by: by(), state: opt('state'), part: opt('part'), message: opt('message') }); console.log(`ACKED ${line(s)}`); return 0; }
  if (cmd === 'redo') { const s = await redo(id, { by: by(), part: opt('part'), message: opt('message') }); console.log(`REDO ${line(s)}`); return 0; }
  if (cmd === 'reopen') { if (!by()) throw new Error('--by <your agent name> is required'); const s = await reopen(id, { who: by(), agent: true }); console.log(`REOPENED ${line(s)}`); return 0; }
  if (cmd === 'cancel') { const s = await cancel(id, { by: by(), note: opt('note') }); console.log(`CANCELLED ${line(s)}`); return 0; }
  if (cmd === 'answer') {
    if (!by()) throw new Error('--by <who> is required (the user answered in chat: --by lead)');
    const s = await answer(id, { value: opt('value'), notes: opt('notes'), scale: opt('scale'), who: by() });
    console.log(`ANSWERED ${line(s)}`);
    return 0;
  }
  if (cmd === 'wait') {
    const w = waitCondition(id, { until: opt('until', 'answered'), part: opt('part') });
    const timeoutSec = opt('timeout') !== undefined ? parseSec(opt('timeout')) : 3600;
    if (!(timeoutSec >= 0)) throw new Error(`--timeout must be a number of seconds (or 10m, 2h), got ${opt('timeout')}`);
    const onChange = flag('quiet') ? undefined : (state, sec) => console.error(`[wait ${new Date().toISOString().slice(11, 19)}Z +${sec}s] ${state}`);
    // a local file read: poll fast, the user is waiting for "recording" after Start
    const r = await pollUntil(w.check, { timeoutSec, onChange, minMs: 200, maxMs: 500, factor: 1.2 });
    if (r.result === 'met') { console.log(flag('json') ? r.detail : `MET ${w.what}: ${r.detail} (after ${r.waitedSec} s)`); return EXIT.met; }
    if (r.result === 'never') { console.log(`NEVER ${w.what}: ${r.never} (after ${r.waitedSec} s)`); return EXIT.never; }
    console.log(`TIMEOUT ${w.what} after ${r.waitedSec} s: ${r.state}`);
    return EXIT.timeout;
  }
  throw new Error(`unknown command "${cmd}" (see the header of tools/console.mjs)`);
}

main().then((c) => { if (c !== undefined) process.exit(c); }, (e) => { console.error(e.message || e); process.exit(1); });
