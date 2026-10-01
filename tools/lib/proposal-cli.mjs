// `node tools/console.mjs proposal …` (ts-proposals): post, list, show, revise, publish, withdraw, decide and wait
// for the user's decision on a design engineer's PoC. Library: ./proposal.mjs; page: /proposals on the console.
// Design: research/architecture/console-proposals.md.
//
//   proposal post --by <agent> --file <proposal.json|md> [--shot-a <img> --shot-b <img> [--caption "<where>"]]…
//        [--video <clip of both> | --video-a <clip> --video-b <clip>] [--draft]          # prints POSTED PR-001: <title>
//   proposal list [--waiting] [--all] [--by <agent>] [--json]   # waiting (proposed) first; --all adds withdrawn ones
//   proposal show <id> [--json]
//   proposal revise <id> --by <agent> --note "<what changed>" [--file …] [--shot-a … --shot-b …] [--video …] [--publish]
//   proposal publish <id> --by <agent>                            # draft -> proposed
//   proposal withdraw <id> --by <agent> [--note "..."]
//   proposal decide <id> --by <who> --value accept|reject|change [--notes "..."]   # the user answered in chat (lead)
//   proposal wait <id> [--until decided|changed] [--since <ISO>] [--timeout 3600] [--json] [--quiet]
//        # decided: met while it stands decided (at once if it already is); with --since: a decision made after it
//        # that still stands (an undo alone does not wake it, the re-decision does). changed (--since default now):
//        # any decision event after --since: a decision, an undo ("Change my decision"), a changed decision (I-045).
//   proposal wait --any [--by <agent>] [--since <ISO>] [--timeout 3600] [--json] [--quiet]
//        # every decision event after --since (default now) on the agent's proposals, or on ALL proposals without
//        # --by (the lead); prints {decisions: [standing ones], events: [{id, event: decided|undecided, value, was,
//        # notes, who, at, rev, …}]} and one PROPOSAL line per event
//        # exit 0 MET (prints MET … : <json>, then a "Re-arm: …" line with --since <the last event>; --json: the JSON
//        # alone, the Re-arm line on stderr), 3 TIMEOUT, 4 NEVER (withdrawn), 1 usage. The lead's
//        # `console.mjs thread wait --as lead` also wakes on every decision event, once (header of tools/console.mjs).
// --shot-a / --shot-b / --caption repeat (or take comma lists) and pair up by order.
import { dirname, resolve } from 'node:path';
import {
  loadProposalFile, postProposal, reviseProposal, publishProposal, withdrawProposal, decide, listProposals, get,
  waitCondition, waitAnyCondition, line, showText, parseProposalId, proposalNewsText,
} from './proposal.mjs';
import { runningServer } from './console-server.mjs';
import { pollUntil, parseSec, EXIT, httpGet } from './wait.mjs';

const VALUED = new Set(['--by', '--file', '--shot-a', '--shot-b', '--caption', '--video', '--video-a', '--video-b', '--note', '--notes', '--value', '--until', '--timeout', '--since', '--as']);

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
  return { raw, baseDir: file ? dirname(resolve(file)) : process.cwd(), shotsA: a.many('shot-a'), shotsB: a.many('shot-b'), captions: a.many('caption'), video };
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
    console.log(`  ${p.compare.shots.length} screenshot pair(s)${p.compare.video ? ', video' : ''}, copied into the console store`);
    const u = await serverUrl();
    if (p.state === 'proposed') console.log(u ? `on the user console ${new URL(`proposals#${p.id}`, u).href}; wait: node tools/console.mjs proposal wait ${p.id} --until decided (in the background)` : 'the console page is not running: ask the lead to start `node tools/console.mjs serve`');
    return 0;
  }
  if (sub === 'list') {
    const items = listProposals({ all: a.flag('all'), waiting: a.flag('waiting'), by: a.one('by', a.one('as')) });
    if (a.flag('json')) console.log(JSON.stringify(items, null, 1));
    else if (!items.length) console.log(a.flag('waiting') ? 'no proposals waiting for the user' : 'no proposals');
    else for (const p of items) console.log(line(p));
    return 0;
  }
  // --any: only an explicit --by narrows it (an FW_AGENT in the lead's environment must not hide the others)
  if (sub === 'wait' && a.flag('any')) return wait(waitAnyCondition({ by: a.one('by', a.one('as')), since: a.one('since') }), a);
  if (!arg) throw new Error(`usage: node tools/console.mjs proposal ${sub} <id> … (see the header of tools/lib/proposal-cli.mjs)`);
  const id = parseProposalId(arg);
  if (sub === 'show') { const p = get(id); console.log(a.flag('json') ? JSON.stringify(p, null, 1) : showText(p)); return 0; }
  if (sub === 'revise') {
    const r = await reviseProposal(id, { by: by(), note: a.one('note'), ...inputs(a), publish: a.flag('publish') });
    report(r);
    console.log(`REVISED ${line(r.proposal)}`);
    return 0;
  }
  if (sub === 'publish') { console.log(`PUBLISHED ${line(await publishProposal(id, { by: by() }))}`); return 0; }
  if (sub === 'withdraw') { console.log(`WITHDRAWN ${line(await withdrawProposal(id, { by: by(), note: a.one('note') }))}`); return 0; }
  if (sub === 'decide') {
    if (!by()) throw new Error('--by <who> is required (the user answered in chat: --by lead)');
    console.log(`DECIDED ${line(await decide(id, { value: a.one('value'), notes: a.one('notes'), who: by() }))}`);
    return 0;
  }
  if (sub === 'wait') return wait(waitCondition(id, { until: a.one('until', 'decided'), since: a.one('since') }), a);
  throw new Error(`unknown proposal command "${sub}" (see the header of tools/lib/proposal-cli.mjs)`);
}

async function wait(w, a) {
  const timeoutSec = a.one('timeout') !== undefined ? parseSec(a.one('timeout')) : 3600;
  if (!(timeoutSec >= 0)) throw new Error(`--timeout must be a number of seconds (or 10m, 2h), got ${a.one('timeout')}`);
  const onChange = a.flag('quiet') ? undefined : (state, sec) => console.error(`[wait ${new Date().toISOString().slice(11, 19)}Z +${sec}s] ${state}`);
  const r = await pollUntil(w.check, { timeoutSec, onChange, minMs: 500, maxMs: 2000, factor: 1.3 });
  if (r.result === 'met') {
    const d = JSON.parse(r.detail);
    const hint = w.rearm(d);
    const rearm = / --any /.test(hint) ? `Re-arm: ${hint}` : `Re-arm (wakes on an undo or a changed decision): ${hint}`;
    if (a.flag('json')) { console.log(r.detail); console.error(rearm); return EXIT.met; }
    console.log(`MET ${w.what}: ${r.detail} (after ${r.waitedSec} s)`);
    for (const e of d.events || []) console.log(proposalNewsText(e));
    console.log(rearm);
    return EXIT.met;
  }
  if (r.result === 'never') { console.log(`NEVER ${w.what}: ${r.never} (after ${r.waitedSec} s)`); return EXIT.never; }
  console.log(`TIMEOUT ${w.what} after ${r.waitedSec} s: ${r.state}`);
  return EXIT.timeout;
}
