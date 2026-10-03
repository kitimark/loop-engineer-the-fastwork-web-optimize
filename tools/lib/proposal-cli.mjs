// `node tools/console.mjs proposal …` (ts-proposals): post, list, show, revise, publish, withdraw, decide, hold,
// unhold (T-030) and wait for the user's decision on a design engineer's PoC. Library: ./proposal.mjs; page: /proposals on the console.
// Design: research/architecture/console-proposals.md.
//
//   proposal post --by <agent> --file <proposal.json|md> [--shot-a <img> --shot-b <img> [--caption "<where>"]]…
//        [--video <clip of both> | --video-a <clip> --video-b <clip>] [--option <name>] [--draft]   # POSTED PR-001: <title>
//        # options (I-053): the file's "options" list holds 2-6 solutions, each with its own idea, looksSame,
//        # visualDiff, gain, risk and compare {b, shots, video} against the shared compare.a; "recommended":
//        # {option, why}. --option <name>: the option the --shot-a/--shot-b/--video flags belong to (required then).
//   proposal list [--waiting] [--all] [--by <agent>] [--json]   # waiting (proposed) first; --all adds withdrawn ones
//   proposal show <id> [--json]      # --json (and list --json) adds decisionState: final | under-review | stale | null
//        # (T-030): act on a decision only when it is "final"; under-review = on hold, stale = revised since, re-decide
//   proposal revise <id> --by <agent> --note "<what changed>" [--file …] [--shot-a … --shot-b …] [--video …] [--option <name>] [--publish]
//        [--keep-decision] [--unhold]
//        # options: the new file's list replaces the old one (add, change, drop options); an option without new shots
//        # keeps those of the old option of the same name; --option <name> + --shot-a/--shot-b replaces that one's.
//        # T-030: an accepted or rejected proposal can be revised too: the decision goes STALE (kept in the history,
//        # state proposed, the page asks the user to decide again on the new revision). --keep-decision keeps it final:
//        # only for a fix that does not change what the user decided on (a typo, wording); anything that changes a
//        # number, a difference, the media or the risk goes stale. A hold stays unless --unhold (or --publish).
//   proposal hold <id> --by <agent|lead> --note "<plain words, for the user>"     # HELD PR-008 …
//        # T-030: the page shows the note on top of the proposal and turns the decision buttons off; decide and undo
//        # refuse; not counted as waiting (badge, list --waiting); list/show say "on hold". On a decided proposal the
//        # decision is kept but under review (decisionState under-review, not final). Again: replaces the note.
//   proposal unhold <id> --by <agent|lead> [--note "..."]                          # UNHELD PR-008 …
//   proposal live <id> --by <agent> [--option <name>] --patch fixes/<topic>/patch.diff [--ref <git ref, default HEAD>]
//        # I-074: what the console's "Try it" panel serves as B (A = the baseline): a committed patch, read from git
//        # here (`<ref>:<patch>` in this checkout) and kept in the console store; any state but withdrawn, no new
//        # revision, the decision stands. --clear removes it. post/revise take the same as --live-patch <path>
//        # [--live-ref <ref>] (with options: plus --option <name>), or "live": {"patch": …} in the file (per option).
//   proposal publish <id> --by <agent>                            # draft -> proposed
//   proposal withdraw <id> --by <agent> [--note "..."]
//   proposal decide <id> --by <who> --value accept|reject|change [--option <name>] [--notes "..."]   # the user answered in chat (lead)
//        # a proposal with options: accept needs --option (its name or label); change may name one; reject may not
//   proposal wait <id> [--until decided|changed] [--since <ISO>] [--timeout 3600] [--json] [--quiet]
//        # decided: met while it stands decided (at once if it already is); with --since: a decision made after it
//        # that still stands (an undo alone does not wake it, the re-decision does). changed (--since default now):
//        # any decision event after --since: a decision, an undo ("Change my decision"), a changed decision (I-045).
//        # T-030: decided is met by a FINAL decision only (not on hold, not stale); a hold or a stale decision prints a
//        # "note: …" line on stderr at the start and shows in the state; changed also wakes on held / unheld (of a
//        # standing decision) and stale events (`PROPOSAL PR-008 decision stale (was accepted on rev 1): re-decide …`).
//   proposal wait --any [--by <agent>] [--since <ISO>] [--timeout 3600] [--json] [--quiet]
//        # every decision event after --since (default now) on the agent's proposals, or on ALL proposals without
//        # --by (the lead); prints {decisions: [standing ones], events: [{id, event: decided|undecided, value, was,
//        # notes, who, at, rev, option, wasOption, …}]} and one PROPOSAL line per event
//        # I-053: every decision JSON carries "option" (the picked option's name, or null), and the printed lines say
//        # ", option: <name>" (PROPOSAL PR-004 decided accepted, option: tiles by user at …; MET … then "  option: tiles")
//        # exit 0 MET (prints MET … : <json>, then a "Re-arm: …" line with --since <the last event>; --json: the JSON
//        # alone, the Re-arm line on stderr), 3 TIMEOUT, 4 NEVER (withdrawn), 1 usage. The lead's
//        # `console.mjs thread wait --as lead` also wakes on every decision event, once (header of tools/console.mjs).
// --shot-a / --shot-b / --caption repeat (or take comma lists) and pair up by order.
import { dirname, resolve } from 'node:path';
import {
  loadProposalFile, postProposal, reviseProposal, publishProposal, withdrawProposal, decide, listProposals, get, setLive, findOption,
  waitCondition, waitAnyCondition, line, showText, parseProposalId, proposalNewsText, holdProposal, unholdProposal, withDecisionState,
} from './proposal.mjs';
import { runningServer } from './console-server.mjs';
import { pollUntil, parseSec, EXIT, httpGet } from './wait.mjs';
import { startWait } from './waits.mjs'; // I-058: live wait records for the status board

const VALUED = new Set(['--by', '--file', '--shot-a', '--shot-b', '--caption', '--video', '--video-a', '--video-b', '--note', '--notes', '--value', '--until', '--timeout', '--since', '--as', '--option', '--live-patch', '--live-ref', '--patch', '--ref']);

export function parseArgs(argv) {
  const multi = {}, pos = [], flags = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const k = eq > 0 ? a.slice(0, eq) : a;
      if (VALUED.has(k)) {
        const v = eq > 0 ? a.slice(eq + 1) : argv[++i];
        if (v === undefined) throw new Error(`${k} needs a value`);
        (multi[k] ||= []).push(v);
      } else flags.add(k);
    } else pos.push(a);
  }
  const one = (k, d) => (multi[`--${k}`] ? multi[`--${k}`].at(-1) : d);
  const many = (k) => (multi[`--${k}`] || []).flatMap((v) => (k === 'caption' ? [v] : v.split(',').map((x) => x.trim()).filter(Boolean)));
  return { pos, one, many, flag: (k) => flags.has(`--${k}`) };
}

async function serverUrl() {
  const s = runningServer();
  if (!s) return null;
  const r = await httpGet(new URL('api/health', s.url).href, 2000);
  return r.status === 200 ? s.url : null;
}

function inputs(a) {
  const file = a.one('file');
  const raw = file ? loadProposalFile(resolve(file)) : undefined;
  const video = {};
  if (a.one('video')) video.both = a.one('video');
  if (a.one('video-a')) video.a = a.one('video-a');
  if (a.one('video-b')) video.b = a.one('video-b');
  if (a.one('live-ref') && !a.one('live-patch')) throw new Error('--live-ref goes with --live-patch fixes/<topic>/patch.diff');
  const live = a.one('live-patch') ? { patch: a.one('live-patch'), ref: a.one('live-ref', 'HEAD') } : undefined; // I-074
  return { raw, baseDir: file ? dirname(resolve(file)) : process.cwd(), shotsA: a.many('shot-a'), shotsB: a.many('shot-b'), captions: a.many('caption'), video, option: a.one('option'), live };
}

function report(r) {
  for (const s of r.scrubbed) console.error(`scrubbed ${s.replace(/^(.*?): (.*)$/, '$2 in $1')} (Hard rule 12)`);
  for (const w of r.warnings) console.error(`warning: ${w}`);
}

export async function run(argv) {
  const a = parseArgs(argv);
  const [sub, arg] = a.pos;
  const by = () => a.one('by', a.one('as', process.env.FW_AGENT || process.env.FW_LOCK_OWNER));
  if (!sub || sub === 'help' || a.flag('help')) { console.log('see the header of tools/lib/proposal-cli.mjs'); return sub ? 0 : EXIT.usage; }
  if (sub === 'post') {
    if (!a.one('file')) throw new Error('--file <proposal.json|md> is required (schema: research/architecture/console-proposals.md)');
    const r = await postProposal({ by: by(), ...inputs(a), draft: a.flag('draft') });
    report(r);
    const p = r.proposal;
    console.log(`POSTED ${p.id}: ${p.title}${p.state === 'draft' ? ' (draft: not shown to the user; proposal publish ' + p.id + ')' : ''}`);
    if (p.options?.length) console.log(`  ${p.options.length} options: ${p.options.map((o) => `${o.name} (${o.compare.shots.length} pair(s)${o.compare.video ? ', video' : ''})`).join(', ')}${p.recommended ? `; recommended: ${p.recommended.option}` : ''}; media copied into the console store`);
    else console.log(`  ${p.compare.shots.length} screenshot pair(s)${p.compare.video ? ', video' : ''}, copied into the console store`);
    const u = await serverUrl();
    if (p.state === 'proposed') console.log(u ? `on the user console ${new URL(`proposals#${p.id}`, u).href}; wait: node tools/console.mjs proposal wait ${p.id} --until decided (in the background)` : 'the console page is not running: ask the lead to start `node tools/console.mjs serve`');
    return 0;
  }
  if (sub === 'list') {
    const items = listProposals({ all: a.flag('all'), waiting: a.flag('waiting'), by: a.one('by', a.one('as')) });
    if (a.flag('json')) console.log(JSON.stringify(items.map(withDecisionState), null, 1));
    else if (!items.length) console.log(a.flag('waiting') ? 'no proposals waiting for the user' : 'no proposals');
    else for (const p of items) console.log(line(p));
    return 0;
  }
  // --any: only an explicit --by narrows it (an FW_AGENT in the lead's environment must not hide the others)
  if (sub === 'wait' && a.flag('any')) return wait(waitAnyCondition({ by: a.one('by', a.one('as')), since: a.one('since') }), a);
  if (!arg) throw new Error(`usage: node tools/console.mjs proposal ${sub} <id> … (see the header of tools/lib/proposal-cli.mjs)`);
  const id = parseProposalId(arg);
  if (sub === 'show') { const p = get(id); console.log(a.flag('json') ? JSON.stringify(withDecisionState(p), null, 1) : showText(p)); return 0; }
  if (sub === 'revise') {
    const r = await reviseProposal(id, { by: by(), note: a.one('note'), ...inputs(a), publish: a.flag('publish'), keepDecision: a.flag('keep-decision'), unhold: a.flag('unhold') });
    report(r);
    const p = r.proposal;
    console.log(`REVISED ${line(p)}`);
    // T-030: what the revision did to a decision and a hold
    const mine = p.history.filter((h) => h.at === p.updatedAt);
    const stale = mine.find((h) => h.action === 'decision-stale');
    const unheld = mine.some((h) => h.action === 'unheld');
    const holdHint = p.hold ? ` (still on hold: proposal unhold ${p.id}, or revise --unhold)` : '';
    if (stale) console.log(`  the decision ${stale.was} on rev ${stale.wasRev} is stale: the user decides again on rev ${p.rev}${holdHint}`);
    else if (mine.some((h) => h.keptDecision)) console.log(`  the decision ${p.decision.value} (rev ${p.decision.rev}) is kept (--keep-decision): it stays final${p.hold ? '; under review while on hold' : ''}`);
    else if (p.hold) console.log(`  still on hold: proposal unhold ${p.id} --by <you> (or revise --unhold) when the user may decide`);
    if (unheld) console.log('  the hold is lifted');
    return 0;
  }
  if (sub === 'hold') {
    const p = await holdProposal(id, { by: by(), note: a.one('note') });
    console.log(`HELD ${line(p)}`);
    if (p.decision && p.history.at(-1).decision) console.log(`  the decision (${p.decision.value}, rev ${p.decision.rev}) is now under review: kept, but not final; \`proposal wait --until decided\` waits; a revise makes it stale (or --keep-decision)`);
    console.log(`  the page shows the note and the decision buttons are off until: node tools/console.mjs proposal unhold ${p.id} --by <you> (or revise --unhold)`);
    return 0;
  }
  if (sub === 'unhold') {
    const p = await unholdProposal(id, { by: by(), note: a.one('note') });
    console.log(`UNHELD ${line(p)}`);
    console.log(p.decision && p.history.at(-1).decision ? `  the decision (${p.decision.value}, rev ${p.decision.rev}) is final again` : p.state === 'proposed' ? '  waiting for the user again' : `  ${p.state}`);
    return 0;
  }
  if (sub === 'live') {
    const p = await setLive(id, { by: by(), option: a.one('option'), patch: a.one('patch'), ref: a.one('ref'), clear: a.flag('clear') });
    const t = p.options?.length ? findOption(p, a.one('option')) : p;
    console.log(t?.live ? `LIVE ${p.id}${p.options?.length ? ` option ${t.name}` : ''}: B = baseline + ${t.live.patch} @ ${t.live.blob.slice(0, 12)} (${t.live.files.length} file(s)); the console's "Try it" panel serves it` : `LIVE ${p.id}${p.options?.length ? ` option ${t?.name}` : ''}: removed`);
    const u = await serverUrl();
    if (u) console.log(`on the user console ${new URL(`proposals#${p.id}`, u).href}`);
    return 0;
  }
  if (sub === 'publish') { console.log(`PUBLISHED ${line(await publishProposal(id, { by: by() }))}`); return 0; }
  if (sub === 'withdraw') { console.log(`WITHDRAWN ${line(await withdrawProposal(id, { by: by(), note: a.one('note') }))}`); return 0; }
  if (sub === 'decide') {
    if (!by()) throw new Error('--by <who> is required (the user answered in chat: --by lead)');
    console.log(`DECIDED ${line(await decide(id, { value: a.one('value'), notes: a.one('notes'), option: a.one('option'), who: by() }))}`);
    return 0;
  }
  if (sub === 'wait') return wait(waitCondition(id, { until: a.one('until', 'decided'), since: a.one('since') }), a);
  throw new Error(`unknown proposal command "${sub}" (see the header of tools/lib/proposal-cli.mjs)`);
}

async function wait(w, a) {
  const timeoutSec = a.one('timeout') !== undefined ? parseSec(a.one('timeout')) : 3600;
  if (!(timeoutSec >= 0)) throw new Error(`--timeout must be a number of seconds (or 10m, 2h), got ${a.one('timeout')}`);
  const onChange = a.flag('quiet') ? undefined : (state, sec) => console.error(`[wait ${new Date().toISOString().slice(11, 19)}Z +${sec}s] ${state}`);
  const note = w.note?.(); // T-030: held or stale at the start
  if (note) console.error(note);
  startWait({ tool: 'console.mjs proposal wait', owner: a.one('by', a.one('as')), what: w.what, timeoutSec });
  const r = await pollUntil(w.check, { timeoutSec, onChange, minMs: 500, maxMs: 2000, factor: 1.3 });
  if (r.result === 'met') {
    const d = JSON.parse(r.detail);
    const hint = w.rearm(d);
    const rearm = / --any /.test(hint) ? `Re-arm: ${hint}` : `Re-arm (wakes on an undo or a changed decision): ${hint}`;
    if (a.flag('json')) { console.log(r.detail); console.error(rearm); return EXIT.met; }
    console.log(`MET ${w.what}: ${r.detail} (after ${r.waitedSec} s)`);
    for (const e of d.events || []) console.log(proposalNewsText(e));
    if (!d.events && d.option) console.log(`  option: ${d.option}`); // I-053: the option the user picked
    console.log(rearm);
    return EXIT.met;
  }
  if (r.result === 'never') { console.log(`NEVER ${w.what}: ${r.never} (after ${r.waitedSec} s)`); return EXIT.never; }
  console.log(`TIMEOUT ${w.what} after ${r.waitedSec} s: ${r.state}`);
  return EXIT.timeout;
}
