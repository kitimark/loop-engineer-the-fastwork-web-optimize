#!/usr/bin/env node
// Shared incident log for unexpected problems (see tools/lib/incident.mjs; protocol: fixes/INCIDENTS.md).
// Visible from every worktree at once (it lives in the shared git dir, like the locks).
//
// Any agent (report; prints OPENED <id>, JOINED <id> (someone reported it already) or KNOWN <id>
// (already fixed on main, your branch lacks the fix: git rebase main)):
//   node tools/incident.mjs open --by <agent> --title "<what failed, one line>" --error "<first error line>"
//        [--class tool|env|baseline|research|fix|unknown] [--cmd "<command>"] [--output-file <log> | --output "<text>"]
//        [--repro "<steps>"] [--env "<notes>"] [--suspect <file/area>] [--blocking yes|no] [--workaround "<text>"]
//        [--sig <dedup key>] [--new]
//   node tools/incident.mjs list [--all] [--json]          # active incidents (--all: history too)
//   node tools/incident.mjs show <id> [--json]
//   node tools/incident.mjs wait <id> [--timeout 3600] [--poll 15]   # exit 0 when resolved/parked (prints the
//                                                          # announcement), 3 on timeout; run it in the background
// The lead (triage, dispatch, close):
//   node tools/incident.mjs update <id> --by lead [--status open|triaged|fixing|parked] [--class ...] [--priority P0-P3]
//        [--assignee <agent>] [--workaround "<text>"] [--affected <agent>] [--note "<text>"]
//   node tools/incident.mjs resolve <id> --by lead --commit <sha on main> [--remeasure] [--note "..."]
//        (--remeasure: the fix changed measurement code; --allow-unlanded skips the "commit is on main" check)
//   node tools/incident.mjs resolve <id> --by lead --resolution workaround|answered|not-a-bug|duplicate --note "..."
//   node tools/incident.mjs announce <id>                  # the message for every affected agent
//
// Exit codes: 0 ok, 1 usage/error, 3 wait timed out.
import { readFileSync } from 'node:fs';
import { open, list, get, update, resolve, announcement, waitFor, parseId } from './lib/incident.mjs';

const argv = process.argv.slice(2);
const VALUED = ['--by', '--title', '--error', '--class', '--cmd', '--output', '--output-file', '--repro', '--env', '--suspect', '--blocking', '--workaround', '--sig', '--status', '--priority', '--assignee', '--affected', '--note', '--commit', '--resolution', '--timeout', '--poll'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const [cmd, arg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const by = () => opt('by', process.env.FW_AGENT || process.env.FW_LOCK_OWNER);

function yesNo(v) {
  if (v === undefined) return undefined;
  if (/^(y|yes|true|1)$/i.test(v)) return true;
  if (/^(n|no|false|0)$/i.test(v)) return false;
  throw new Error(`--blocking takes yes or no, not "${v}"`);
}

function line(i) {
  const bits = [i.status, i.class, i.priority, i.assignee && `-> ${i.assignee}`, i.blocking && 'blocking', i.resolution].filter(Boolean).join(', ');
  return `${i.id}  [${bits}]  ${i.title}\n        reported by ${i.reportedBy} ${i.openedAt}; affected: ${i.affected.map((a) => a.by).join(', ')}`;
}

function details(i) {
  const L = [line(i)];
  const kv = (k, v) => { if (v !== undefined && v !== '') L.push(`  ${k}: ${String(v).includes('\n') ? '\n    ' + String(v).replace(/\n/g, '\n    ') : v}`); };
  kv('error', i.error); kv('command', i.cmd); kv('repro', i.repro); kv('suspect', i.suspect); kv('workaround', i.workaround);
  kv('environment', `${i.env.checkout} (${i.env.branch} @ ${i.env.head}), node ${i.env.node}, ${i.env.platform}, load ${i.env.loadavg1}${i.env.notes ? '; ' + i.env.notes : ''}`);
  kv('recurrence of', i.recurrenceOf);
  if (i.fix) kv('fix', `${i.fix.short} ${i.fix.subject}`);
  kv('resolution note', i.resolutionNote);
  kv('output', i.output);
  L.push('  history:');
  for (const h of i.history) L.push(`    ${h.at} ${h.by} ${h.action}${h.changes && Object.keys(h.changes).length ? ' ' + JSON.stringify(h.changes) : ''}${h.note ? ': ' + h.note.split('\n')[0].slice(0, 160) : ''}`);
  return L.join('\n');
}

async function main() {
  if (!cmd || cmd === 'help' || flag('help')) { console.log('see the header of tools/incident.mjs; protocol: fixes/INCIDENTS.md'); return 0; }
  if (cmd === 'open') {
    let output = opt('output');
    if (opt('output-file')) output = readFileSync(opt('output-file'), 'utf8');
    const r = await open({
      by: by(), title: opt('title'), error: opt('error'), cls: opt('class'), cmd: opt('cmd'), output,
      repro: opt('repro'), env: opt('env'), suspect: opt('suspect'), blocking: yesNo(opt('blocking')),
      workaround: opt('workaround'), sig: opt('sig'), forceNew: flag('new'),
    });
    const i = r.incident;
    if (r.action === 'opened') {
      console.log(`OPENED ${i.id}${i.recurrenceOf ? ` (recurrence of ${i.recurrenceOf}: its fix is in your HEAD and it still fails)` : ''}: ${i.title}`);
      console.log('The lead triages it. Meanwhile: do work that does not need it, or use a workaround; `node tools/incident.mjs wait ' + i.id + '` (background) tells you when it is resolved.');
    } else if (r.action === 'joined') {
      console.log(`JOINED ${i.id} [${i.status}${i.assignee ? ', ' + i.assignee + ' is on it' : ''}]: ${i.title}`);
      console.log(`Reported first by ${i.reportedBy}; you are now listed as affected. Don't fix it in parallel.${i.workaround ? ' Workaround: ' + i.workaround : ''}`);
    } else {
      console.log(`KNOWN ${i.id}: fixed in ${i.fix.short} on main, which your branch doesn't contain.`);
      console.log(`Run \`git rebase main\` in your worktree, then retry. (${i.title})`);
    }
    return 0;
  }
  if (cmd === 'list') {
    const items = list({ all: flag('all') });
    if (flag('json')) console.log(JSON.stringify(items, null, 1));
    else if (!items.length) console.log(flag('all') ? 'no incidents' : 'no active incidents');
    else for (const i of items) console.log(line(i));
    return 0;
  }
  if (!arg) throw new Error(`usage: node tools/incident.mjs ${cmd} <id> ...`);
  const id = parseId(arg);
  if (cmd === 'show') { const i = get(id); console.log(flag('json') ? JSON.stringify(i, null, 1) : details(i)); return 0; }
  if (cmd === 'announce') { console.log(announcement(get(id))); return 0; }
  if (cmd === 'update') {
    const i = await update(id, { by: by(), status: opt('status'), cls: opt('class'), priority: opt('priority'), assignee: opt('assignee'), workaround: opt('workaround'), note: opt('note'), affected: opt('affected') });
    console.log(`UPDATED ${line(i)}`);
    return 0;
  }
  if (cmd === 'resolve') {
    const i = await resolve(id, { by: by(), resolution: opt('resolution', 'fixed'), commit: opt('commit'), note: opt('note'), remeasure: flag('remeasure'), allowUnlanded: flag('allow-unlanded') });
    console.log(announcement(i));
    return 0;
  }
  if (cmd === 'wait') {
    get(id); // fail fast on an unknown id
    const i = await waitFor(id, { timeoutSec: Number(opt('timeout', 3600)), pollMs: Number(opt('poll', 15)) * 1000 });
    if (!i) { const now = get(id); console.log(`STILL ${now.status.toUpperCase()} ${id} after ${opt('timeout', 3600)} s: ${now.title}`); return 3; }
    console.log(announcement(i));
    return 0;
  }
  throw new Error(`unknown command ${cmd}`);
}

main().then((c) => process.exit(c), (e) => { console.error(e.message || e); process.exit(1); });
