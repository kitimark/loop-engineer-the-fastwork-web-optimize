#!/usr/bin/env node
// Status board (ts-status-board; design research/architecture/status-board.md): one live status per workstream
// (fix topics, toolsmith jobs, research, phone blocks, reviews, ops), reported by its owner at every state change.
// The user reads it on the console's Status page (/status) or here. Library: tools/lib/status.mjs.
// Store: <git-common-dir>/fastwork-mirror/status/<id>.json (every worktree sees it; $FW_STATE_DIR in tests).
//
// Agents, at every state change, when a wait starts or ends, and on resume:
//   node tools/status.mjs set <id> --by <agent> --state <state> --note "<one plain line>" [--next "<plain line>"]
//        [--waiting-on <kind>[:<target>][:<text>] | none] [--kind fix|tool|research|phone|review|ops --title "<plain>"]
//        [--owner <agent>] [--progress <PROGRESS.json item id>] [--refs P-039,I-042] [--alias <name on the locks>]
//        # prints SET <id>: <state> (was <old>) / ADDED <id>: <state>. The first `set` of a new id needs --kind and --title.
//        # states: queued researching designing implementing testing measuring reviewing coordinating waiting ready-to-land parked
//        #         landed done closed-no-fix dropped (closed-no-fix: a topic closed without a fix, T-124; done is for
//        #         finished or landed work, and on a Progress item that never landed the board shows it "closed, no fix")
//        # parked needs --resume-on <when> (T-125): incident:I-NNN | land:<topic|sha> | after:<ISO time> |
//        #   decision:lead|user | build:v8 | never (done for good). The board shows "ready to resume" in red when it
//        #   happens, and "needs review" for a row parked over 4 h without one. Parked reads "done, agent paused" (its
//        #   work landed), "done, waits for build v8", "unfinished, paused until …" or "standing by" (ops, phone rows).
//        # Refused: parked or researching on a row whose Progress item landed (use done; follow-up work: designing,
//        #   implementing, testing or measuring).
//        # --waiting-on: chrome | phone | user | lead | agent:<name> | review[:<name>] | incident:I-0NN | item:<id> |
//        #   other:"<text>", each with an optional :"<text>" (lead:"land request"). With --state the wait is replaced
//        #   (cleared if not given); waiting needs one; ready-to-land defaults to lead:"land request".
//        #   user needs the id the user answers (I-145): user:"decision on PR-019", user:C-045, user:"yes/no in T-031".
//        #   The moment that step is answered or skipped, the proposal decided or withdrawn, the thread closed or
//        #   answered, the row leaves WAITING ON YOU by itself ("you decided PR-019 (accepted) at 13:09Z; <owner> has
//        #   not picked it up (16 min)"); you still set your next state yourself.
//        # The board adds what it already knows: your place in the Chrome/phone queue, your pending console steps,
//        # blocking incidents that name you, and every wait command you run right now (wait.mjs, lock.mjs wait, console/
//        # incident/finding waits: "now: waiting for <what> since 08:31Z (3 min, timeout 10 min)", I-058; waits whose owner has
//        # no active row are listed under OTHER WAITS). Never report a URL, address, e-mail or path (refused, Hard rule 12).
//        # --unlink incident:I-0NN[,…] | none: drop a derived "blocked by I-0NN" line when that incident (yours, still
//        #   open) is not what this workstream waits on (kept across later sets; none restores; I-044). Prints
//        #   "; unlinked I-0NN". A later --waiting-on incident:I-0NN links it again.
//   node tools/status.mjs mine --by <agent>                 # your items (on resume)
//   node tools/status.mjs list [--all] [--state s] [--kind k] [--owner a] [--json]   # priority order; --all adds finished
//   node tools/status.mjs show <id> [--json]                # one item with live waits and history
//   node tools/status.mjs stale [--json]                    # rows that may be out of date, each with why (I-108):
//        # no update for 45 min (no live wait), a ready-to-land or reviewing row whose branch's work is already on main
//        # (`set` by the owner records the branch of the checkout it runs in; a working or waiting row with landed
//        # commits is normal), or it waits on a C-/PR-/T- id already answered/decided
//   node tools/status.mjs agent <name> [--json]             # I-118: what is X doing / what did X do, in one place: running
//        # now or finished (live holds, queue places, waits, fresh rows), its status rows (owned or updated), commits on
//        # main tagged "(<name>)", holds.log lines, console steps, threads, incidents, findings, proposals, fixes/*/README.md
//        # that name it, and the timeline, newest first. A row id or alias it uses on the locks counts as the agent.
//        # Console: /agent/<name> (lib: tools/lib/agent-view.mjs)
//   node tools/status.mjs check [--json]                    # T-124/T-125: rows to fix, one line each, exit 3 when any:
//        # MISMATCH (the row contradicts fixes/PROGRESS.json, e.g. Progress diagnosing while the row says landed),
//        # READY (a parked row's --resume-on happened), REVIEW (parked over 4 h without --resume-on). The same rows are
//        # red on /status. Every row also gets one label with its Progress item: "in v7, owner testing", "closed, no fix".
//   node tools/status.mjs agents [--all] [--json]           # every agent seen anywhere: RUNNING NOW, then FINISHED by last
//        # activity (the 20 most recent without --all). Console: /agents
// Lead:
//   node tools/status.mjs priority <id> <1..99|none> --by lead [--note "<why>"]   # 1 = first; refused for anyone else
//   node tools/status.mjs seed --by <agent> [--file <seed.json>] [--apply]        # active PROGRESS fix items + a seed
//        # file (schema fw-status-seed/1: {schema, items: [{id, kind, title, owner, state, waitingOn?, note?, next?,
//        # progress?, aliases?, refs?}]}); a dry run unless --apply; ids that exist are skipped; no priority in a seed
//   node tools/status.mjs sync --by lead [--dry-run] [--json]  # T-125 #10, after every ff-only landing: rows whose
//        # Progress item landed (stage L, landed, in a landed build) or whose branch is on main get landed {at, sha, via}
//        # (the newest main commit touching fixes/<item>/); ready-to-land/reviewing on main -> landed, parked/
//        # researching/queued on a landed item -> done. Prints SYNC <id>: <from> -> <to> (<via>) or nothing to sync.
//
// Exit codes: 0 ok, 1 usage or refused (the reason on stderr), 3 check found rows to fix.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { set, setPriority, get, list, buildStatusView, itemView, renderText, showText, staleText, seedPlan, applySeed, progressData, progressContext, checkLines, sync } from './lib/status.mjs';
import { gatherLive, readProgress } from './lib/progress.mjs';
import { runMain } from './lib/exit.mjs'; // I-110, I-117: exit once stdout has flushed
import { currentAgentView, currentAgentsList, agentText, agentsText, parseAgent } from './lib/agent-view.mjs';

const argv = process.argv.slice(2);
const VALUED = ['--by', '--state', '--note', '--next', '--waiting-on', '--kind', '--title', '--owner', '--progress', '--refs', '--alias', '--file', '--unlink', '--resume-on'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const [cmd, arg, arg2] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const by = () => opt('by', process.env.FW_AGENT || process.env.FW_LOCK_OWNER);

/**
 * I-108 (3): the branch of the checkout this runs in, {name, ahead (commits not on main), head}, so the board can see
 * when that work is on main while the row is not landed. null on main, a detached HEAD, or without git.
 */
function branchInfo() {
  const run = (...a) => { const r = spawnSync('git', a, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }); return r.status === 0 ? r.stdout.trim() : null; };
  const name = run('rev-parse', '--abbrev-ref', 'HEAD');
  if (!name || name === 'HEAD' || name === 'main') return null;
  const ahead = Number(run('rev-list', '--count', 'main..HEAD'));
  return { name, ahead: Number.isFinite(ahead) ? ahead : 0, head: run('rev-parse', 'HEAD') };
}

async function main() {
  if (!cmd || cmd === 'help' || flag('help')) { console.log('see the header of tools/status.mjs; design: research/architecture/status-board.md'); return cmd ? 0 : 1; }
  if (cmd === 'list' || cmd === 'mine') {
    const owner = cmd === 'mine' ? by() : opt('owner');
    if (cmd === 'mine' && !owner) throw new Error('--by <your agent name> is required');
    const live = await gatherLive();
    const all = list();
    const v = buildStatusView({ items: all, live, progress: progressData() });
    const keep = (x) => (!opt('state') || x.state === opt('state')) && (!opt('kind') || x.kind === opt('kind')) && (!owner || x.owner === owner || x.aliases.includes(owner));
    v.items = v.items.filter(keep);
    if (owner) v.otherWaits = v.otherWaits.filter((x) => x.owner === owner);
    if (flag('json')) { console.log(JSON.stringify(v, null, 1)); return 0; }
    if (cmd === 'mine' && !v.items.length) { console.log(`no status items owned by ${owner}: node tools/status.mjs set <id> --by ${owner} --kind … --title "…" --state …`); return 0; }
    console.log(renderText(v, { all: flag('all') || cmd === 'mine' || !!opt('state') }));
    return 0;
  }
  if (cmd === 'stale') {
    const v = buildStatusView({ items: list(), live: await gatherLive(), progress: progressData() });
    if (flag('json')) { console.log(JSON.stringify(v.items.filter((x) => x.stale).map((x) => ({ id: x.id, owner: x.owner, state: x.state, ageMin: x.ageMin, why: x.staleWhy })), null, 1)); return 0; }
    console.log(staleText(v).trimEnd());
    return 0;
  }
  if (cmd === 'check') {
    const v = buildStatusView({ items: list(), live: await gatherLive(), progress: progressData() });
    const r = checkLines(v);
    if (flag('json')) console.log(JSON.stringify(r, null, 1));
    else console.log(r.count ? r.lines.join('\n') : 'CHECK ok: every row agrees with Progress; no parked row is ready or overdue');
    return r.count ? 3 : 0;
  }
  if (cmd === 'sync') {
    if (!by()) throw new Error('--by <your agent name> is required (the lead runs sync after a landing)');
    const res = await sync({ by: by(), live: await gatherLive(), progress: progressData(), apply: !flag('dry-run') });
    const changed = res.filter((r) => r.changed);
    if (flag('json')) { console.log(JSON.stringify(res, null, 1)); return 0; }
    for (const r of changed) console.log(`${flag('dry-run') ? 'WOULD SYNC' : 'SYNC'} ${r.id}: ${r.from}${r.to !== r.from ? ` -> ${r.to}` : ''} (landed: ${r.landed.via}${r.landed.sha ? ` ${r.landed.sha.slice(0, 8)}` : ''}${r.landed.at ? ` at ${r.landed.at.slice(11, 16)}Z` : ''})`);
    if (!changed.length) console.log('nothing to sync');
    return 0;
  }
  if (cmd === 'seed') {
    const { data: progress } = readProgress();
    let seed = null;
    if (opt('file')) { try { seed = JSON.parse(readFileSync(opt('file'), 'utf8')); } catch (e) { throw new Error(`seed file ${opt('file')}: ${e.message}`); } }
    const res = await applySeed(seedPlan({ progress, seed }), { by: by(), apply: flag('apply') });
    for (const r of res) {
      if (r.action === 'exists') console.log(`EXISTS ${r.id} (skipped)`);
      else if (r.action === 'error') console.log(`ERROR ${r.id}: ${r.error}`);
      else console.log(`${r.action === 'added' ? 'ADDED' : 'WOULD ADD'} ${r.id}: ${r.entry.state || 'queued'} [${r.entry.kind}] ${r.entry.title} (owner ${r.entry.owner || by()})`);
    }
    if (!flag('apply')) console.log('(dry run: nothing written; add --apply)');
    return res.some((r) => r.action === 'error') ? 1 : 0;
  }
  if (cmd === 'agents') {
    const l = await currentAgentsList({ maxAgeMs: 0 });
    console.log(flag('json') ? JSON.stringify(l, null, 1) : agentsText(l, { all: flag('all') }));
    return 0;
  }
  if (cmd === 'agent') {
    if (!arg) throw new Error('usage: node tools/status.mjs agent <name> [--json] (node tools/status.mjs agents lists every name)');
    const v = await currentAgentView(parseAgent(arg), { maxAgeMs: 0 });
    console.log(flag('json') ? JSON.stringify(v, null, 1) : agentText(v));
    return 0;
  }
  if (!arg) throw new Error(`usage: node tools/status.mjs ${cmd} <id> … (see the header of tools/status.mjs)`);
  if (cmd === 'set') {
    const r = await set(arg, {
      by: by(), state: opt('state'), note: opt('note'), next: opt('next'), waitingOn: opt('waiting-on'), kind: opt('kind'), title: opt('title'),
      owner: opt('owner'), progress: opt('progress'), refs: opt('refs'), aliases: opt('alias'), unlink: opt('unlink'), resumeOn: opt('resume-on'),
      branch: branchInfo(), // kept on the owner's own sets only (lib set)
    });
    const it = r.item;
    const ro = it.resumeOn ? `; resumes on ${it.resumeOn.kind}${it.resumeOn.target ? ':' + it.resumeOn.target : ''}` : '';
    const w = ro + (it.waitingOn ? `; waiting on ${it.waitingOn.kind}${it.waitingOn.target ? ':' + it.waitingOn.target : ''}${it.waitingOn.text ? ` "${it.waitingOn.text}"` : ''}` : '')
      + (opt('unlink') !== undefined && it.unlinked?.length ? `; unlinked ${it.unlinked.join(', ')}` : '');
    console.log(r.created ? `ADDED ${it.id}: ${it.state}${w}` : `SET ${it.id}: ${it.state}${r.prevState !== it.state ? ` (was ${r.prevState})` : ''}${w}`);
    return 0;
  }
  if (cmd === 'priority') {
    if (arg2 === undefined) throw new Error('usage: node tools/status.mjs priority <id> <1..99|none> --by lead');
    const it = await setPriority(arg, arg2, { by: by(), note: opt('note') });
    console.log(`PRIORITY ${it.id}: ${it.priority === null ? 'none' : '#' + it.priority}`);
    return 0;
  }
  if (cmd === 'show') {
    const it = get(arg);
    const items = list();
    const live = await gatherLive();
    const v = itemView(it, { live, byId: new Map(items.map((i) => [i.id, i])), progress: progressContext(progressData()) });
    console.log(flag('json') ? JSON.stringify({ item: it, view: v }, null, 1) : showText(it, v));
    return 0;
  }
  throw new Error(`unknown command "${cmd}" (see the header of tools/status.mjs)`);
}

// I-110: never process.exit() straight away: a --json view past the pipe buffer (64 KB) was still queued for a slow
// reader (`| node -e …`) and got cut. lib/exit.mjs (I-117) exits once stdout and stderr have flushed what was written.
runMain(main);
