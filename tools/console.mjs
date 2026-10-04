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
//        [--record] [--gate] [--no-record] [--no-gate] [--phone] [--show-url | --hide-url] [--parts '<json array>'] [--meta '<json>']
//        [--scale 1-5 [--scale-label "How different did they feel?"]]   # an optional rating next to the pick
//        [--topic <status id>]   # I-084: the page shows "Your answer goes to: <agent> (topic <id>)"
//        [--runner-ends N[,M]|all]   # I-059: parts YOU end (ack --part N --state done), not the user; also per part
//        #   "ends":"runner" in --parts. The page shows no Done there, only "Running, please wait; this ends by itself"
//        #   with your latest --message, and refuses a user Done (403). E.g. a phone run that cycles versions by itself.
//        # prints POSTED C-007. Kinds: question (yes/no unless --options/--text), choice (--options),
//        # action (one part: Start, then Done; --record/--gate as below), swipe-pair (Page 1 = --url, Page 2 = --url2,
//        # both gated and recorded, answer 1 / 2 / same, URLs hidden from the page: blind).
//        # gate: Start stays disabled until you ack ready; record: after Start the page says "don't swipe yet"
//        # until you ack recording, then "recording… swipe now". --meta: private to agents (e.g. the blind key and
//        # the A/B order), never shown on the page, returned by wait --until answered. Forced choice: --options 1,2.
//        # A session that runs on the phone page itself: --kind action --hide-url --options "done,stopped early".
//        # I-123 (f): a phone step (swipe-pair, a recorded part, or --phone: the user handles the phone) posts only while
//        # you hold the iphone lease and no other phone step is open (pending or active), else exit 1 naming the lease
//        # holder or the open step and its owner. --by lead is exempt. Questions and plain actions post as before.
//   node tools/console.mjs wait <id> [--until started|recording|done|answered|redo] [--part N] [--epoch N] [--timeout 3600] [--json] [--quiet]
//        # exit 0 MET (prints MET … : <json>; --json: the JSON alone), 3 TIMEOUT, 4 NEVER (skipped/cancelled), 1 usage,
//        # 5 REDO (I-059): the step was reset while you waited (the user's "Start over" on the page, or a `redo`):
//        # prints REDO … : {action: restart|redo, by, part, attempts: [per part], epoch}; reset the phone and wait for the
//        # new Start. --until redo: MET on the next reset (run it in the background during a long runner-ended part).
//        # in a sequence pass --part N (1-based). answered prints {value, notes, meta}; part waits add {attempt, epoch}:
//        # label your files with the attempt (e.g. iphone.mjs record --label C-21-p2-a2).
//        # I-123: a reset that came BEFORE the wait was armed: --epoch N (the epoch of your last MET/REDO JSON) makes it
//        # REDO at once when the step is past N (--until redo: MET at once). Without --epoch, a wait armed after a Start
//        # over you have not acked yet (no entry by you since) ends REDO at once ("missed": true) while the user waits on
//        # you (a gated part not ready, a recorded part without "recording"); your next ack clears that.
//   node tools/console.mjs ack <id> --by <agent> [--state loading|ready|recording|done] [--part N] [--message "<short line>"] [--attempt N]
//        # --attempt N: refused (exit 1, "stale") when the part is at another attempt: a late ack from an earlier try
//   node tools/console.mjs redo <id> --by <agent> [--part N] [--message "why"]   # ask part N again (e.g. the swipe was missed);
//        # parts N.. get a new attempt; the user's "Start over" on the page is the same reset from part 1
//        # Later, if friction (T-019, deferred): a per-part "redo this part" for the user; an undo window for a Done.
//   node tools/console.mjs reopen <id> --by <agent>      # queue a skipped (or any) step again, from the start
//   node tools/console.mjs cancel <id> --by <agent> [--note "..."]   # withdraw it (no longer needed)
//
// Swipe pair, runner side:  post … → ack C-7 --part 1 --state loading → (page ready) ack --part 1 --state ready
//   → wait C-7 --until started --part 1 → start the recorder → ack --part 1 --state recording
//   → wait --until done --part 1 → stop the recorder → the same for part 2 → wait --until answered
// Runner-ended part (I-059), e.g. the phone cycles versions by itself: post … --runner-ends 2 → wait --until started
//   --part 2 → run it, ack --part 2 --message "version 2 of 4" as it goes → ack --part 2 --state done when finished.
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
// Editing it (the lead after the T-104 team measurement; tools/lib/progress-edit.mjs): every edit keeps the file's hand
// layout outside the changed values, stamps updatedAt/updatedBy, and is checked first: a result that fails --check is
// refused (PROGRESS REFUSED, exit 1, nothing written; problems the file had before are marked). --dry-run: check, show.
//   node tools/console.mjs progress set <json-path> <value> [<json-path> <value> …] --by <agent> [--string] [--dry-run]
//   node tools/console.mjs progress set <json-path> --file <f|-> --by <agent>   # the value from a file (- = stdin)
//   node tools/console.mjs progress set […] --delete <json-path> [--delete …] --by <agent>   # remove keys or entries,
//        # after the sets: progress set 'changes[^]' '{"at": …, "text": …}' --delete 'changes[30]' (the list keeps 30)
//        # paths: build.since, items[id=cd-strip].next, versions[6].best, changes[^] (a new first row), upcoming[+] (last)
//        # value: JSON when it parses (true, 42, "x", {...}, [...]), else the words as a string (--string: always a string)
//   node tools/console.mjs progress best <versionId> --by <agent> [--name "…"] [--summary "…"] [--dry-run]
//        # today's best build: "best": true moves to that version and the build block with it (since = its since, the
//        # T-103 rule; name; fixes = every landed version's fixes up to it; the old summary and combined rows go;
//        # items' inBuild flags follow). set and best edit $FW_PROGRESS_FILE or fixes/PROGRESS.json; --progress <path>: another
//
// Status board (read-only; the same content as the page's Status tab, /status; agents report with tools/status.mjs):
//   node tools/console.mjs status [--all] [--json]          # every workstream: priority, state, waits, owner, note
// Threads (ts-console-threads, user request 2026-10-02): the user asks one topic per thread on the page (/threads);
// the lead, or an agent the lead assigned, replies here. The user's text is printed as typed (their own message to us:
// never copy it into committed files without scrubbing it); agent text is scrubbed before it is stored (Hard rule 12).
// Links in agent text: http://localhost:<port>/… is kept; for phone links write http://lan:<port>/<path> (I-119): stored
// as written with the literal host "lan" and turned into a link to the Mac's current LAN address only when the page
// shows the thread ("Wi-Fi address not available" when there is none); `thread show` prints the placeholder. A raw IP,
// a .local/.lan host, or a lan link without a numeric port 1-65535 and a plain path is scrubbed to <link>.
//   node tools/console.mjs thread wait --as <agent> [--thread T-3] [--timeout 3600] [--json] [--quiet]
//        # background: exit 0 printing NEW <thread> #<n> by user … for EVERY unread user message in the threads you
//        # follow (the lead: all; others: the ones assigned to them), then marks them read for you only; 3 TIMEOUT;
//        # 4 NEVER (--thread closed). Re-arm it after each wake. An assignment wakes the assignee on the backlog.
//        # Without --thread it also wakes on proposal decision events (I-045): a decision, an undo, a changed decision,
//        # on every proposal for the lead and on its own for an agent, each printed once as `PROPOSAL PR-001 decided
//        # changes-requested (was rejected) by user at …: <notes>` (--json: items with kind: "proposal"). Its read mark
//        # starts when it is first armed (<console>/proposal-reads.json): older decisions are not news. On a proposal
//        # with options (I-053) the line and the JSON name the picked one: `decided accepted, option: tiles`, option.
//        # T-030: also a hold or release of a standing decision and a decision made stale by a revision:
//        # `PROPOSAL PR-008 on hold, decision accepted under review (not final) by lead …`, `… hold released, decision
//        # accepted final again …`, `… decision stale (was accepted on rev 1): re-decide on rev 2, revised by …`.
//   node tools/console.mjs thread list [--unread --as <agent>] [--all] [--json]   # open threads (--all: closed too)
//   node tools/console.mjs thread show <id> [--as <agent>] [--json]               # --as: marks it read for <agent>
//   node tools/console.mjs thread reply <id> --by <agent> --text "…" | --file <f> | --file - [--ask] [--image <path> [--caption "…"]]…
//        # the lead always; others only when assigned ("ask the lead to assign you"). --ask: you need an answer from
//        # the user (the thread shows "waiting on you"). Prints REPLIED T-003 #4 and anything that was scrubbed.
//        # For phone links write http://lan:<port>/ (never the address): the page opens the Mac's LAN address (I-119).
//        # I-146 (user T-123): the text must follow the answer format (memory/answer-format.md), checked by
//        # tools/lib/answer-lint.mjs, or nothing is posted (FORMAT REFUSED, exit 1, one line per problem with a fix):
//        # (a) a last line "What you need to do: …", (b) at most 18 non-empty lines, (c) no line over 250 characters
//        # (tables exempt), (d) every id (T-/PR-/I-/P-/F-/C-nnn, a commit sha) explained in plain words: "the heat
//        # check (P-094)". Warnings: a first line over 160 characters, a paragraph of more than 3 sentences.
//        # --check-format: check only, post nothing (exit 0 ok, 1 not). --force-format "<reason>": post anyway; the reason
//        # and the problems go to <console>/answer-lint-overrides.jsonl for the lead. Same for `thread new`, the step text
//        # of `post` and the proposal text of `proposal post|revise` (kind field: no action line, lines up to 600).
//        # `thread reply --help` prints the rule.
//   node tools/console.mjs thread lint [<id>] --text "…" | --file <f> | --file - [--kind answer|field]   # test a draft
//   node tools/console.mjs thread new --by lead --title "…" --text "…"|--file <f> [--topic <status id>] [--to <agent>] [--ask] [--image …]
//        # I-089 images: --image <path> repeats (at most 6 per message); a --caption belongs to the --image before it.
//        # PNG, JPEG, GIF or WebP by content (not by name), at most 15 MB each, copied as is into the local store
//        # (<console>/threads/T-003/m4-1.png); the page shows them as thumbnails that open full size. With an image
//        # the text may be left out. Captions are scrubbed like the text; no path or host is stored. The user can
//        # attach images on the page too; `thread wait` and `thread show` print them as [image 1: <file> "caption"].
//   node tools/console.mjs thread assign <id> --to <agent>[,<agent>] --by lead [--remove]
//        # T-050: the desk may assign too (--by <desk>), only to an agent that is listening, and never --remove.
// Routing (user T-050/T-051, research/architecture/thread-routing.md): a user message in a thread with no listening
// assignee goes to the first LISTENING one of: the comment's item owner (status row, step author, proposal author),
// the lead's topic map, the topic's status-board owner, the desk (history: router assign "<agent> (<why>)"). Listening
// = a live `thread wait --as <agent>`, or a read or reply in a thread within 5 min. The lead never gets routed to.
//   node tools/console.mjs thread wait --as lead --triage [--timeout 3600] [--json]
//        # the lead's wait: wakes only for a thread nobody listening owns, a message ticked "For the lead" (marked
//        # "(for the lead)"), an escalation, a user message unanswered for 10 min, and proposal decisions; each
//        # thread printed as TRIAGE <id> "title": <why> plus its NEW messages. Without --triage: every message.
//   node tools/console.mjs thread escalate <id> --by <owner|desk> --note "what the lead must decide"
//   node tools/console.mjs thread desk show | desk set <agent> --by lead | desk set --clear --by lead
//        # the desk counts only while it is listening (`thread wait --as <desk>` armed); otherwise the lead is the desk
//   node tools/console.mjs thread topic list | topic set <tag> --owner <agent> --by lead | topic set <tag> --clear --by lead
//        # T-051: who answers a topic's threads, before the status-board owner; skipped while that agent is not listening
//   `thread list` and `thread show` print each assignee as "fix-x (listening)" or "fix-x (not listening)".
//   node tools/console.mjs thread close <id> --by <agent> [--note "…"] [--force]   |   thread reopen <id> --by <agent>
//        # T-089: close and merge refuse while the user has replies there they have not read (a closed thread leaves the
//        # badge, a merged one the list), printing each one (m<n> by <agent> <when>: first words); --force closes anyway.
// One topic, one thread (user T-024 #13, 2026-10-04): merge a duplicate into the thread that keeps the topic.
//   node tools/console.mjs thread merge <dup> --into <keep> --by <agent> [--note "…"] [--force]
//        # closes <dup> (the page shows "Merged into T-keep" with a link), links both threads (stored in both); prints
//        # MERGED T-dup into T-keep. --into a merged thread resolves to its final kept thread; a <dup> that already took
//        # in others passes them on to <keep> (no chains). Refused: a self-merge, an unknown id, a thread already merged
//        # (unmerge it first), a cycle. The lead, the desk, or an agent assigned to both threads.
//        # A user message written later in <dup> is stored in <keep> (marked "written in T-dup"): the kept thread's
//        # owner's wait wakes and the router (T-050) routes it as a message on <keep>; <dup> stays closed.
//   node tools/console.mjs thread unmerge <dup> --by <agent>                # undo: links dropped, reopened if the merge closed it
//   node tools/console.mjs thread relate <a> <b> --by <agent> [--remove]    # same area, not a duplicate: linked both ways
//   `thread list` names "merged into T-x" and a kept thread's "merged here: …; related: …"; `--all` lists the merged
//   ones (closed); `thread show` prints one line per linked thread. The page hides merged threads unless ticked.
//   `thread new` refuses a thread like an open one: the same --topic, or a title with the same content words (the
//   check of `finding.mjs post`): prints SIMILAR T-xxx (<why>): <title>, starts nothing (exit 1); --force starts it.
//
// Proposals (ts-proposals): a design engineer's PoC for the user to compare and accept, reject or send back:
//   node tools/console.mjs proposal post|list|show|revise|live|phone|publish|withdraw|decide|wait|hold|unhold|talk …   (header of tools/lib/proposal-cli.mjs)
//        # T-030: `proposal hold <id> --by <you> --note "…"` stops the user deciding (banner, buttons off) while a card is
//        # being corrected; a revise after a decision makes it stale (re-decide) unless --keep-decision.
//        # T-048: the user asks about a proposal under it on the page ("Questions and answers", or Comment on a part):
//        # a console thread anchored on it, assigned at once to the author, so the author's `thread wait --as <you>`
//        # wakes; `proposal talk <id> [--as <you>]` shows them, `thread reply <T-id> --by <you>` answers (shown under the
//        # proposal). A question never changes the decision.
//        # I-126/T-086: `proposal phone <id> [--option <name>] [--stop]` serves its Try-it pages A and B on the Wi-Fi
//        # (plain http, detached serve.mjs, only the mirror; the console stays localhost); `proposal phone --list`.
//        # The Proposals page then shows each side's phone link (http://lan:<port>/, resolved at view time).
//
// Exit codes: 0 ok / MET, 1 usage or refused (the reason on stderr), 3 TIMEOUT (wait) / no server (url), 4 NEVER (wait).
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { post, list, get, ack, redo, reopen, cancel, answer, waitCondition, line, parseId, consoleDir, attemptOf, EXIT_REDO, recipients } from './lib/console.mjs';
import { runningServer, startServer } from './lib/console-server.mjs';
import { postRefusal } from './lib/phone-step.mjs';
import { status as lockStatus } from './lib/lock.mjs';
import { DEFAULT_REMIND_MIN } from './lib/console-notify.mjs';
import { pollUntil, parseSec, EXIT, httpGet } from './lib/wait.mjs';
import { autoPortBase } from './lib/paths.mjs';
import { currentView, renderText, readProgress, progressFile } from './lib/progress.mjs';
import { progressSet, progressBest, parseValue } from './lib/progress-edit.mjs'; // T-104: progress set|best
import { currentStatusView, renderText as statusText } from './lib/status.mjs';
import * as TH from './lib/console-threads.mjs';
import * as RT from './lib/thread-routing.mjs'; // T-050/T-051: listening, desk, topic map
import { startWait } from './lib/waits.mjs'; // I-058: live wait records for the status board
import * as AL from './lib/answer-lint.mjs'; // I-146: the answer-format check on agent text the user reads

const argv = process.argv.slice(2);
const VALUED = ['--remind', '--by', '--kind', '--title', '--instructions', '--url', '--url2', '--options', '--parts', '--meta', '--until', '--part', '--timeout', '--state', '--message', '--note', '--notes', '--value', '--port', '--scale', '--scale-label', '--file', '--as', '--text', '--to', '--topic', '--thread', '--runner-ends', '--attempt', '--image', '--caption', '--owner', '--epoch', '--into', '--progress', '--name', '--summary', '--delete', '--force-format'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const [cmd, arg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const by = () => opt('by', process.env.FW_AGENT || process.env.FW_LOCK_OWNER);
const tri = (yes, no) => (flag(yes) ? true : flag(no) ? false : undefined);
/** I-146: lint agent text the user reads; prints the outcome. Returns {proceed, exit}: post only when proceed. */
function formatGate(result, where) {
  const g = AL.gate(result, { where, check: flag('check-format'), force: opt('force-format'), by: by(), dir: consoleDir() });
  for (const l of g.out) console.log(l);
  for (const l of g.err) console.error(l);
  return g;
}
/** Ids the user already knows in a thread: its own id, ids in its title and in the user's messages. */
const knownIds = (t) => [t.id, ...AL.idsIn(t.title), ...t.messages.filter((m) => m.by === TH.USER).flatMap((m) => AL.idsIn(m.text))];

async function serverUrl() {
  const s = runningServer();
  if (!s) return null;
  const r = await httpGet(new URL('api/health', s.url).href, 2000);
  return r.status === 200 ? s.url : null;
}

function show(s) {
  const L = [line(s)];
  L.push(`  answers go to: ${recipients(s.by).join(', ')}${s.topic ? ` (topic ${s.topic})` : ''}`); // I-084: as the page says
  if (s.instructions) L.push(`  instructions: ${s.instructions}`);
  if (s.url) L.push(`  url: ${s.url}${s.showUrl === false ? ' (hidden on the page)' : ''}`);
  s.parts.forEach((p, i) => L.push(`  part ${i + 1} ${p.label}: ${p.state}${p.gate ? ' gated' : ''}${p.record ? ' recorded' : ''}${p.ends === 'runner' ? ' runner-ends' : ''}${attemptOf(p) > 1 ? ` attempt ${attemptOf(p)}` : ''}${p.url ? ` ${p.url}` : ''}${p.message ? ` — "${p.message}"` : ''}`));
  L.push(`  answer: ${s.answer.mode === 'buttons' ? s.answer.options.join(' / ') : s.answer.mode}${s.result ? ` -> ${JSON.stringify(s.result)}` : ''}`);
  if (s.meta) L.push(`  meta: ${JSON.stringify(s.meta)}`);
  L.push('  history:');
  for (const h of s.history) L.push(`    ${h.at} ${h.who} ${h.action}${h.part ? ` part ${h.part}` : ''}${h.attempt > 1 ? ` attempt ${h.attempt}` : ''}${h.state ? ` ${h.state}` : ''}${h.epoch ? ` (epoch ${h.epoch})` : ''}${h.note ? `: ${h.note}` : ''}${h.value !== undefined ? ` ${JSON.stringify(h.value)}` : ''}`);
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

/** `console.mjs progress set|best …` (T-104, see the header): edit PROGRESS.json, checked before writing. */
function progressEdit(sub) {
  const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1]))).slice(2);
  const file = opt('progress') || (sub === 'best' ? opt('file') : undefined) || progressFile();
  const usage = (why) => new Error(`usage: node tools/console.mjs progress set <json-path> <value> [<json-path> <value> …] | <json-path> --file <f|-> [--delete <json-path> …], with --by <agent>${why ? ` (${why})` : ''}`);
  const text = readFileSync(file, 'utf8');
  let r;
  if (sub === 'set') {
    const sets = [];
    if (opt('file') !== undefined) {
      if (pos.length !== 1) throw usage('with --file, one <json-path>');
      const f = opt('file');
      sets.push({ path: pos[0], value: parseValue(readFileSync(f === '-' ? 0 : f, 'utf8'), { string: flag('string') }) });
    } else {
      if (pos.length % 2) throw usage('a value for every path');
      for (let i = 0; i < pos.length; i += 2) sets.push({ path: pos[i], value: parseValue(pos[i + 1], { string: flag('string') }) });
    }
    // --delete <json-path>, repeatable, after the sets (a new first change row, then the oldest one out: the 30 cap)
    argv.forEach((a, i) => { if (a === '--delete') sets.push({ path: argv[i + 1]?.startsWith('--') ? '' : argv[i + 1], delete: true }); else if (a.startsWith('--delete=')) sets.push({ path: a.slice(9), delete: true }); });
    if (sets.some((s) => s.delete && !s.path)) throw usage('--delete needs a path');
    if (!sets.length) throw usage('nothing to set');
    r = progressSet(text, sets, { by: by() });
  } else {
    if (pos.length !== 1) throw new Error('usage: node tools/console.mjs progress best <versionId> --by <agent> [--name "…"] [--summary "…"] [--dry-run]');
    r = progressBest(text, pos[0], { by: by(), name: opt('name'), summary: opt('summary') });
  }
  const notes = r.notes.map((n) => `  ${n}`);
  if (r.errors.length) {
    const old = new Set(r.before);
    console.log(`PROGRESS REFUSED ${file}: the result would not pass --check; nothing written`);
    console.log([...notes, '  problems:', ...r.errors.map((e) => `    ${e}${old.has(e) ? '   (already in the file before this change)' : ''}`)].join('\n'));
    return 1;
  }
  if (flag('dry-run')) { console.log([`PROGRESS DRY-RUN ${file}: valid (--check OK), nothing written`, ...notes].join('\n')); return 0; }
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, r.text);
  renameSync(tmp, file);
  console.log([`PROGRESS ${sub.toUpperCase()} ${file}: valid (--check OK), written`, ...notes].join('\n'));
  return 0;
}

/** `console.mjs thread <sub> [<id>] …` (see the header). */
async function thread() {
  const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
  const [, sub, idArg] = pos;
  const as = () => opt('as', process.env.FW_AGENT);
  const textArg = () => {
    const f = opt('file');
    if (f !== undefined && opt('text') !== undefined) throw new Error('give --text or --file, not both');
    if (f === '-') return readFileSync(0, 'utf8');
    if (f !== undefined) return readFileSync(f, 'utf8');
    return opt('text');
  };
  const images = () => TH.parseImageArgs(argv); // I-089
  const imgNote = (k) => (k ? ` with ${k} image${k === 1 ? '' : 's'}` : '');
  const scrubNote = (sc) => (sc && sc.length ? `\nscrubbed before storing (Hard rule 12): ${sc.join(', ')}${sc.includes('url') ? '; for phone links write http://lan:<port>/' : ''}` : ''); // I-119
  if (!sub || sub === 'help' || flag('help')) { // I-146: the answer format at the point of use
    console.log('see the header of tools/console.mjs (Threads)');
    console.log('  thread reply <id> --by <agent> --text "…" | --file <f> [--ask] [--check-format] [--force-format "<reason>"]');
    console.log('  thread lint [<id>] --text "…" | --file <f> [--kind answer|field]   # test a draft, posts nothing');
    for (const l of AL.RULE_SUMMARY) console.log(l);
    return sub || flag('help') ? 0 : EXIT.usage;
  }
  if (sub === 'lint') { // I-146: check a draft against the answer format; nothing is posted
    const kind = opt('kind', 'answer');
    if (!['answer', 'field'].includes(kind)) throw new Error('--kind answer|field');
    const t = idArg ? TH.getThread(TH.parseThreadId(idArg)) : null;
    const text = textArg();
    if (text === undefined) throw new Error('thread lint [<id>] --text "…" | --file <f> | --file -');
    const g = AL.gate(AL.lintText(text, { kind, known: t ? knownIds(t) : [] }), { where: t ? `draft for ${t.id}` : 'draft', check: true });
    for (const l of g.out) console.log(l);
    return g.exit;
  }
  if (sub === 'list') {
    if (flag('unread') && !as()) throw new Error('--unread needs --as <agent>');
    let items = TH.listThreads();
    if (!flag('all')) items = items.filter((t) => t.status !== 'closed');
    if (flag('unread')) items = items.filter((t) => TH.unreadFor(t, as()).length);
    const ls = RT.listeningState({ threads: TH.listThreads() }); // T-050: who of the assignees is listening
    if (flag('json')) { console.log(JSON.stringify(items.map((t) => ({ ...TH.summary(t, TH.USER, ls), ...(as() && { unreadFor: TH.unreadFor(t, as()).length }) })), null, 1)); return 0; }
    if (!items.length) console.log(flag('unread') ? `no threads with unread user messages for ${as()}` : 'no threads');
    for (const t of items) console.log(TH.threadLine(t, as(), ls));
    return 0;
  }
  if (sub === 'new') {
    const text = textArg();
    const fg = formatGate(AL.lintText(text, { kind: 'answer' }), 'thread new'); // I-146
    if (!fg.proceed) return fg.exit;
    const r = await TH.createThread({ by: by(), title: opt('title'), text, topic: opt('topic'), to: opt('to'), ask: flag('ask'), images: images(), checkSimilar: !flag('force') });
    if (r.similar) { // T-024 #13: one topic, one thread
      console.log(`SIMILAR ${r.similar.id} (${r.why}) [${TH.threadState(r.similar)}]: ${TH.oneLine(r.similar.title)}`);
      console.log(`  nothing started: write there (thread reply ${r.similar.id} --by ${by()} …), or start it anyway with --force`);
      return 1;
    }
    console.log(`STARTED ${r.thread.id}: ${r.thread.title}${r.thread.assignees.length ? ` (assigned: ${r.thread.assignees.join(', ')})` : ''}${imgNote(r.thread.messages[0].images?.length)}${scrubNote(r.scrubbed)}`);
    return 0;
  }
  if (sub === 'wait') {
    const w = TH.threadWaitCondition({ as: as(), thread: opt('thread'), triage: flag('triage') });
    const timeoutSec = opt('timeout') !== undefined ? parseSec(opt('timeout')) : 3600;
    if (!(timeoutSec >= 0)) throw new Error(`--timeout must be a number of seconds (or 10m, 2h), got ${opt('timeout')}`);
    // I-045: without --thread the wait also wakes on proposal decision events (a decision, an undo, a changed decision):
    // the lead on every proposal, an agent on its own; each event once per reader (read marks, proposal.mjs).
    const withProposals = opt('thread') === undefined;
    const PR = await import('./lib/proposal.mjs');
    if (withProposals) await PR.initProposalMark(w.reader);
    const proposalNews = () => (withProposals ? PR.proposalNews(w.reader, { all: w.reader === TH.LEAD }) : []);
    const check = () => {
      const t = w.check();
      const ev = proposalNews();
      if (!ev.length) return t;
      const news = t.met ? JSON.parse(t.detail) : [];
      return { met: true, state: `${news.length} thread(s), ${ev.length} proposal decision event(s)`, detail: JSON.stringify({ news, ev }) };
    };
    const split = (c) => (c.met ? (c.detail.startsWith('[') ? { news: JSON.parse(c.detail), ev: [] } : JSON.parse(c.detail)) : null);
    const onChange = flag('quiet') ? undefined : (state, sec) => console.error(`[thread wait ${new Date().toISOString().slice(11, 19)}Z +${sec}s] ${state}`);
    // I-108: without --thread this is a listener (armed all the time, waits on nobody): marked, and worded as such
    startWait({ tool: 'console.mjs thread wait', owner: w.reader, listener: !opt('thread'), what: w.triage ? 'a thread that needs the lead (triage) or a proposal decision' : opt('thread') ? `a user reply in ${opt('thread')}` : `messages in its console threads${withProposals ? ' or a proposal decision' : ''}`, timeoutSec });
    const r = await pollUntil(check, { timeoutSec, onChange, minMs: 500, maxMs: 2000, factor: 1.3 });
    if (r.result === 'never') { console.log(`NEVER ${w.what}: ${r.never} (after ${r.waitedSec} s)`); return EXIT.never; }
    if (r.result !== 'met') { console.log(`TIMEOUT ${w.what} after ${r.waitedSec} s: ${r.state}`); return EXIT.timeout; }
    // a burst (the user sends two or three lines in a row): settle a moment, then print everything unread at once
    await new Promise((res) => setTimeout(res, 1000));
    const again = check();
    const { news, ev } = split(again.met ? again : r);
    await TH.commitWait(w.reader, news);
    await PR.commitProposalNews(w.reader, ev);
    if (flag('json')) console.log(JSON.stringify([...news, ...ev.map((e) => ({ kind: 'proposal', ...e }))], null, 1));
    else {
      for (const t of news) console.log(TH.newsText(t, w.reader));
      for (const e of ev) console.log(PR.proposalNewsText(e));
      const parts = [];
      if (news.length && w.triage) parts.push(`${news.length} thread(s) need the lead (${news.map((t) => t.id).join(', ')}), ${news.reduce((n, t) => n + t.messages.length, 0)} message(s)`);
      else if (news.length) parts.push(`${news.reduce((n, t) => n + t.messages.length, 0)} new message(s) in ${news.map((t) => t.id).join(', ')}`);
      if (ev.length) parts.push(`${ev.length} proposal decision event(s) in ${[...new Set(ev.map((e) => e.id))].join(', ')}`);
      console.log(`MET ${w.what}: ${parts.join('; ')} (after ${r.waitedSec} s); marked read for ${w.reader}. Re-arm: node tools/console.mjs thread wait --as ${w.reader}${w.triage ? ' --triage' : ''}`);
    }
    return EXIT.met;
  }
  if (sub === 'desk') { // T-050 decision 4: the desk counts only while it is listening
    if (idArg === 'show' || idArg === undefined) { console.log(`desk: ${RT.deskText({ threads: TH.listThreads() })}`); return 0; }
    if (idArg !== 'set') throw new Error('usage: thread desk show | thread desk set <agent> --by lead | thread desk set --clear --by lead');
    const agent = flag('clear') ? null : pos[3];
    if (!flag('clear') && !agent) throw new Error('thread desk set <agent> --by lead (or --clear)');
    await RT.setDesk({ agent, by: by() });
    console.log(agent ? `DESK ${agent}: ${RT.deskText({ threads: TH.listThreads() })}` : 'DESK cleared: the lead is the desk');
    return 0;
  }
  if (sub === 'topic') { // T-051: the lead's topic -> owner map, read by the router before the status board
    if (idArg === 'list' || idArg === undefined) {
      const m = RT.getTopics();
      const ls = RT.listeningState({ threads: TH.listThreads() });
      if (flag('json')) { console.log(JSON.stringify(m, null, 1)); return 0; }
      if (!Object.keys(m).length) console.log('no topic owners set (threads route by the status board)');
      for (const [k, v] of Object.entries(m)) console.log(`${k} -> ${v.owner} (${ls(v.owner).listening ? 'listening' : 'not listening'}); set by the lead at ${v.at}`);
      return 0;
    }
    if (idArg !== 'set' || !pos[3]) throw new Error('usage: thread topic list | thread topic set <tag> --owner <agent> --by lead | thread topic set <tag> --clear --by lead');
    if (!flag('clear') && !opt('owner')) throw new Error('thread topic set <tag> --owner <agent> --by lead (or --clear)');
    await RT.setTopicOwner(pos[3], { owner: flag('clear') ? null : opt('owner'), by: by() });
    console.log(flag('clear') ? `TOPIC ${pos[3]} cleared` : `TOPIC ${pos[3]} -> ${opt('owner')}`);
    return 0;
  }
  if (!idArg) throw new Error(`usage: node tools/console.mjs thread ${sub} <id> … (see the header of tools/console.mjs)`);
  const id = TH.parseThreadId(idArg);
  if (sub === 'show') {
    let t = TH.getThread(id);
    if (as() && as() !== TH.USER) { await TH.markRead(id, as()); t = TH.getThread(id); }
    if (flag('json')) { console.log(JSON.stringify(t, null, 1)); return 0; }
    console.log(TH.threadLine(t, as(), RT.listeningState({ threads: TH.listThreads() })));
    if (t.anchor) console.log(`  ${TH.anchorLine(t.anchor)}`); // I-090: a comment names its item
    for (const l of TH.relatedLines(t)) console.log(`  ${l}`); // T-024 #13: merged and related threads
    for (const m of t.messages) {
      console.log(`  #${m.n} ${m.by}${m.ask ? ' (asks the user)' : ''}${m.via ? ` (written in ${m.via})` : ''} at ${m.at}:`);
      if (m.text || !m.images?.length) for (const l of String(m.text).split('\n')) console.log(`    ${l}`);
      for (const l of TH.imageLines(t, m)) console.log(`    ${l}`); // I-089
    }
    for (const h of t.history) console.log(`  ${h.at} ${h.who} ${h.action}${h.note ? `: ${h.note}` : ''}`);
    return 0;
  }
  if (sub === 'reply') {
    const text = textArg();
    const fg = formatGate(AL.lintText(text, { kind: 'answer', known: knownIds(TH.getThread(id)) }), `thread reply ${id}`); // I-146
    if (!fg.proceed) return fg.exit;
    const r = await TH.replyAgent(id, { by: by(), text, ask: flag('ask'), images: images() });
    console.log(`REPLIED ${id} #${r.n}${imgNote(r.images)}${flag('ask') ? ' (waiting on the user)' : ''}${scrubNote(r.scrubbed)}`);
    return 0;
  }
  if (sub === 'assign') {
    const r = await TH.assign(id, { by: by(), to: opt('to'), remove: flag('remove') });
    console.log(`${flag('remove') ? 'UNASSIGNED' : 'ASSIGNED'} ${id}: ${r.thread.assignees.join(', ') || '(nobody: only the lead)'}`);
    return 0;
  }
  if (sub === 'escalate') { // T-050: an owner or the desk hands a decision to the lead
    const r = await TH.escalate(id, { by: by(), note: opt('note') });
    console.log(`ESCALATED ${id}: the lead's triage wait wakes on it${scrubNote(r.scrubbed)}`);
    return 0;
  }
  if (sub === 'merge') { // T-024 #13
    const r = await TH.mergeThread(id, { into: opt('into'), by: by(), note: opt('note'), unreadCheck: !flag('force') }); // T-089
    console.log(`MERGED ${id} into ${r.into}${r.resolved ? ` (${r.resolved} is merged into ${r.into})` : ''}${r.moved.length ? `; moved along: ${r.moved.join(', ')}` : ''}`);
    return 0;
  }
  if (sub === 'unmerge') {
    const r = await TH.unmergeThread(id, { by: by() });
    console.log(`UNMERGED ${id} from ${r.from}${r.reopened ? ' (reopened)' : ''}; messages written in ${id} after the merge stay in ${r.from}`);
    return 0;
  }
  if (sub === 'relate') {
    if (!pos[3]) throw new Error('usage: thread relate <a> <b> --by <agent> [--remove]');
    const r = await TH.relateThreads(id, pos[3], { by: by(), remove: flag('remove') });
    console.log(`${flag('remove') ? 'UNRELATED' : 'RELATED'} ${r.a} ${r.b}`);
    return 0;
  }
  if (sub === 'close' || sub === 'reopen') {
    await TH.setStatus(id, { status: sub === 'close' ? 'closed' : 'open', by: by(), note: opt('note'), unreadCheck: !flag('force') }); // T-089
    console.log(`${sub === 'close' ? 'CLOSED' : 'REOPENED'} ${id}`);
    return 0;
  }
  throw new Error(`unknown thread command "${sub}" (see the header of tools/console.mjs)`);
}

async function main() {
  if (argv[0] === 'proposal') return (await import('./lib/proposal-cli.mjs')).run(argv.slice(1));
  if (!cmd || cmd === 'help' || (flag('help') && cmd !== 'thread')) { console.log('see the header of tools/console.mjs'); return cmd ? 0 : EXIT.usage; }
  if (cmd === 'serve') return serve();
  if (cmd === 'thread') return thread();
  if (cmd === 'url') { const u = await serverUrl(); if (!u) { console.log('NO SERVER: node tools/console.mjs serve (run it in the background)'); return 3; } console.log(`CONSOLE_URL=${u}`); return 0; }
  if (cmd === 'post') {
    let parts = opt('parts');
    if (parts !== undefined) { const raw = parts.startsWith('@') ? readFileSync(parts.slice(1), 'utf8') : parts; try { parts = JSON.parse(raw); } catch (e) { throw new Error(`--parts is not JSON: ${e.message}`); } }
    const stepText = [{ path: 'title', text: opt('title') }, { path: 'instructions', text: opt('instructions') }, // I-146
      ...(Array.isArray(parts) ? parts.flatMap((p, i) => ['label', 'instructions'].map((k) => ({ path: `parts[${i}].${k}`, text: p?.[k] }))) : [])];
    const fg = formatGate(AL.lintFields(stepText), 'post');
    if (!fg.proceed) return fg.exit;
    const s = await post({
      by: by(), kind: opt('kind'), title: opt('title'), instructions: opt('instructions'), url: opt('url'), url2: opt('url2'),
      options: opt('options'), yesno: flag('yesno'), text: flag('text'), record: tri('record', 'no-record'), gate: tri('gate', 'no-gate'),
      showUrl: tri('show-url', 'hide-url'), parts, meta: opt('meta'), scale: opt('scale'), scaleLabel: opt('scale-label'),
      runnerEnds: opt('runner-ends'), topic: opt('topic'), phone: flag('phone'),
    }, { refuse: (step, steps) => postRefusal({ step, by: step.by, lease: lockStatus('iphone'), steps }) }); // I-123 (f)
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
    if (arg === 'set' || arg === 'best') return progressEdit(arg);
    if (arg !== undefined) throw new Error(`unknown progress command "${arg}" (progress [--check] | progress set <json-path> <value> … | progress best <versionId>; see the header of tools/console.mjs)`);
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
  if (cmd === 'status') {
    const v = await currentStatusView();
    console.log(flag('json') ? JSON.stringify(v, null, 1) : statusText(v, { all: flag('all') }));
    return 0;
  }
  if (!arg) throw new Error(`usage: node tools/console.mjs ${cmd} <id> … (see the header of tools/console.mjs)`);
  const id = parseId(arg);
  if (cmd === 'show') { const s = get(id); console.log(flag('json') ? JSON.stringify(s, null, 1) : show(s)); return 0; }
  if (cmd === 'ack') { const s = await ack(id, { by: by(), state: opt('state'), part: opt('part'), message: opt('message'), attempt: opt('attempt') }); console.log(`ACKED ${line(s)}`); return 0; }
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
    const w = waitCondition(id, { until: opt('until', 'answered'), part: opt('part'), epoch: opt('epoch') });
    const timeoutSec = opt('timeout') !== undefined ? parseSec(opt('timeout')) : 3600;
    if (!(timeoutSec >= 0)) throw new Error(`--timeout must be a number of seconds (or 10m, 2h), got ${opt('timeout')}`);
    const onChange = flag('quiet') ? undefined : (state, sec) => console.error(`[wait ${new Date().toISOString().slice(11, 19)}Z +${sec}s] ${state}`);
    // a local file read: poll fast, the user is waiting for "recording" after Start
    let poster; try { poster = get(id).by; } catch {}
    startWait({ tool: 'console.mjs wait', owner: opt('as') ?? by() ?? poster, what: w.what, timeoutSec });
    const r = await pollUntil(w.check, { timeoutSec, onChange, minMs: 200, maxMs: 500, factor: 1.2 });
    if (r.result === 'met') { console.log(flag('json') ? r.detail : `MET ${w.what}: ${r.detail} (after ${r.waitedSec} s)`); return EXIT.met; }
    if (r.result === 'never' && w.redo) { // I-059: reset (start over / redo) while waiting: reset the phone, then wait again
      console.log(flag('json') ? JSON.stringify(w.redo) : `REDO ${w.what}: ${JSON.stringify(w.redo)} (after ${r.waitedSec} s)`);
      return EXIT_REDO;
    }
    if (r.result === 'never') { console.log(`NEVER ${w.what}: ${r.never} (after ${r.waitedSec} s)`); return EXIT.never; }
    console.log(`TIMEOUT ${w.what} after ${r.waitedSec} s: ${r.state}`);
    return EXIT.timeout;
  }
  throw new Error(`unknown command "${cmd}" (see the header of tools/console.mjs)`);
}

main().then((c) => { if (c !== undefined) process.exit(c); }, (e) => { console.error(e.message || e); process.exit(1); });
