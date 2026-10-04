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
//        #         landed done dropped
//        # --waiting-on: chrome | phone | user | lead | agent:<name> | review[:<name>] | incident:I-0NN | item:<id> |
//        #   other:"<text>", each with an optional :"<text>" (lead:"land request"). With --state the wait is replaced
//        #   (cleared if not given); waiting needs one; ready-to-land defaults to lead:"land request".
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
//        # no update for 45 min (no live wait), its branch's work already on main but the row not landed (`set` by the
//        # owner records the branch of the checkout it runs in), or it waits on a C-/PR-/T- id already answered/decided
// Lead:
//   node tools/status.mjs priority <id> <1..99|none> --by lead [--note "<why>"]   # 1 = first; refused for anyone else
//   node tools/status.mjs seed --by <agent> [--file <seed.json>] [--apply]        # active PROGRESS fix items + a seed
//        # file (schema fw-status-seed/1: {schema, items: [{id, kind, title, owner, state, waitingOn?, note?, next?,
//        # progress?, aliases?, refs?}]}); a dry run unless --apply; ids that exist are skipped; no priority in a seed
//
// Exit codes: 0 ok, 1 usage or refused (the reason on stderr).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { set, setPriority, get, list, buildStatusView, itemView, renderText, showText, staleText, seedPlan, applySeed } from './lib/status.mjs';
import { gatherLive, readProgress } from './lib/progress.mjs';

const argv = process.argv.slice(2);
const VALUED = ['--by', '--state', '--note', '--next', '--waiting-on', '--kind', '--title', '--owner', '--progress', '--refs', '--alias', '--file', '--unlink'];
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
    const v = buildStatusView({ items: all, live });
    const keep = (x) => (!opt('state') || x.state === opt('state')) && (!opt('kind') || x.kind === opt('kind')) && (!owner || x.owner === owner || x.aliases.includes(owner));
    v.items = v.items.filter(keep);
    if (owner) v.otherWaits = v.otherWaits.filter((x) => x.owner === owner);
    if (flag('json')) { console.log(JSON.stringify(v, null, 1)); return 0; }
    if (cmd === 'mine' && !v.items.length) { console.log(`no status items owned by ${owner}: node tools/status.mjs set <id> --by ${owner} --kind … --title "…" --state …`); return 0; }
    console.log(renderText(v, { all: flag('all') || cmd === 'mine' || !!opt('state') }));
    return 0;
  }
  if (cmd === 'stale') {
    const v = buildStatusView({ items: list(), live: await gatherLive() });
    if (flag('json')) { console.log(JSON.stringify(v.items.filter((x) => x.stale).map((x) => ({ id: x.id, owner: x.owner, state: x.state, ageMin: x.ageMin, why: x.staleWhy })), null, 1)); return 0; }
    console.log(staleText(v).trimEnd());
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
  if (!arg) throw new Error(`usage: node tools/status.mjs ${cmd} <id> … (see the header of tools/status.mjs)`);
  if (cmd === 'set') {
    const r = await set(arg, {
      by: by(), state: opt('state'), note: opt('note'), next: opt('next'), waitingOn: opt('waiting-on'), kind: opt('kind'), title: opt('title'),
      owner: opt('owner'), progress: opt('progress'), refs: opt('refs'), aliases: opt('alias'), unlink: opt('unlink'),
      branch: branchInfo(), // kept on the owner's own sets only (lib set)
    });
    const it = r.item;
    const w = (it.waitingOn ? `; waiting on ${it.waitingOn.kind}${it.waitingOn.target ? ':' + it.waitingOn.target : ''}${it.waitingOn.text ? ` "${it.waitingOn.text}"` : ''}` : '')
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
    const v = itemView(it, { live, byId: new Map(items.map((i) => [i.id, i])) });
    console.log(flag('json') ? JSON.stringify({ item: it, view: v }, null, 1) : showText(it, v));
    return 0;
  }
  throw new Error(`unknown command "${cmd}" (see the header of tools/status.mjs)`);
}

main().then((c) => process.exit(c), (e) => { console.error(e.message || e); process.exit(1); });
