#!/usr/bin/env node
// Shared findings board (incident I-013; library: tools/lib/finding.mjs). A live board next to the
// incidents in the shared git dir: every worktree sees a post at once, without a commit. The lead folds
// findings into the committed playbook fixes/FINDINGS.md (read that first; this board holds what is new).
//
// Any agent (fix owners, integrator, toolsmiths, bundle-mapper helpers, reviewers):
//   node tools/finding.mjs post --by <agent> --kind technique|pitfall|coupling|measurement|question
//        --topics <topic>[,<topic>...|all] --title "<one line>" [--where "JS 3100-3155"]
//        [--evidence "<numbers / results file>"] [--body "<details; for a pitfall: how to avoid it>"] [--force]
//        # prints POSTED F-012, or SIMILAR F-007 (a finding with a similar title exists: nothing posted;
//        # ack that one, or re-post with --force if yours is different)
//   node tools/finding.mjs list [--kind k] [--topic a,b] [--since F-007|<iso time>] [--unread --as <agent>] [--open] [--json]
//        # one line per finding, newest last; --unread: not posted and not acked by <agent>
//   node tools/finding.mjs show <id> [--json]
//   node tools/finding.mjs ack <id> --by <agent> [--note "applied in <topic>" | --note "not relevant"]
//   node tools/finding.mjs wait --as <agent> [--topic a,b] [--kind k] [--since F-007] [--timeout 3600] [--poll 10]
//        # background: exits 0 printing NEW <line> for each finding posted after the wait started
//        # (or after --since) by someone else for your topics (or any topic); 3 on timeout
// The lead only:
//   node tools/finding.mjs digest [--since F-007]  # markdown rows in the FINDINGS.md table shape (next T<n>/P<n>)
//   node tools/finding.mjs resolve <id> --by lead --folded T10|P8|lesson|duplicate:F-003|rejected [--note "..."]
//        # this tool never edits fixes/FINDINGS.md; the lead pastes the digest, edits and commits it
// --by / --as default to $FW_AGENT. Exit codes: 0 ok (POSTED, SIMILAR, ...), 1 usage/error, 3 wait timed out.
import { list, get, post, ack, resolve, waitFor, digest, parseId, stateLabel } from './lib/finding.mjs';

const argv = process.argv.slice(2);
const VALUED = ['--by', '--as', '--kind', '--topics', '--topic', '--title', '--where', '--evidence', '--body', '--since', '--note', '--folded', '--timeout', '--poll'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const [cmd, arg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const agent = (n) => opt(n, process.env.FW_AGENT);

function line(f) {
  const tag = f.status === 'open' ? '' : `[${stateLabel(f)}] `;
  const acks = `${f.acks.length} ack${f.acks.length === 1 ? '' : 's'}`;
  return `${f.id}  ${f.kind.padEnd(13)}${tag}${f.title}  (${f.topics.join(', ')}; ${f.by} ${f.postedAt.slice(0, 16).replace('T', ' ')}; ${acks})`;
}

function details(f) {
  const L = [line(f)];
  const kv = (k, v) => { if (v !== undefined && v !== '') L.push(`  ${k}: ${String(v).includes('\n') ? '\n    ' + String(v).replace(/\n/g, '\n    ') : v}`); };
  kv('where', f.where); kv('evidence', f.evidence); kv('body', f.body);
  kv('posted from', `${f.branch ?? '?'} @ ${f.head ?? '?'}`);
  if (f.status !== 'open') kv('state', `${stateLabel(f)} by ${f.resolvedBy} ${f.resolvedAt}${f.resolutionNote ? ': ' + f.resolutionNote : ''}`);
  if (f.acks.length) { L.push('  acks:'); for (const a of f.acks) L.push(`    ${a.by} ${a.at}${a.note ? ' ' + a.note : ''}`); }
  return L.join('\n');
}

async function main() {
  if (!cmd || cmd === 'help' || flag('help')) { console.log('see the header of tools/finding.mjs; the committed playbook: fixes/FINDINGS.md'); return 0; }
  if (cmd === 'post') {
    const r = await post({ by: agent('by'), kind: opt('kind'), topics: opt('topics', opt('topic')), title: opt('title'), where: opt('where'), evidence: opt('evidence'), body: opt('body'), force: flag('force') });
    const f = r.finding;
    if (r.action === 'posted') {
      console.log(`POSTED ${f.id}: ${f.title}`);
      console.log('Everyone sees it now (node tools/finding.mjs list). Tell the owners of the topics it affects if it changes their plan.');
    } else {
      console.log(`SIMILAR ${f.id} [${stateLabel(f)}]: ${f.title}`);
      console.log(`Not posted. If it is the same finding: node tools/finding.mjs ack ${f.id} --by ${agent('by')} --note "<what you add or where you applied it>". If it is different, re-post with --force.`);
    }
    return 0;
  }
  if (cmd === 'list') {
    if (flag('unread') && !agent('as')) throw new Error('--unread needs --as <agent> (or $FW_AGENT)');
    const items = list({ kind: opt('kind'), topic: opt('topic', opt('topics')), since: opt('since'), unreadAs: flag('unread') ? agent('as') : undefined, open: flag('open') });
    if (flag('json')) console.log(JSON.stringify(items, null, 1));
    else if (!items.length) console.log(flag('unread') ? 'no unread findings' : 'no findings');
    else for (const f of items) console.log(line(f));
    return 0;
  }
  if (cmd === 'digest') { process.stdout.write(digest({ since: opt('since') })); return 0; }
  if (cmd === 'wait') {
    const timeout = Number(opt('timeout', 3600));
    const fresh = await waitFor({ as: agent('as'), topic: opt('topic', opt('topics')), kind: opt('kind'), since: opt('since'), timeoutSec: timeout, pollMs: Number(opt('poll', 10)) * 1000 });
    if (!fresh) { console.log(`NO NEW FINDINGS after ${timeout} s`); return 3; }
    for (const f of fresh) console.log(`NEW ${line(f)}`);
    console.log(`Read: node tools/finding.mjs show ${fresh[0].id}; then ack (--note "applied in <topic>" or "not relevant") and wait again with --since ${fresh.at(-1).id}.`);
    return 0;
  }
  if (!arg) throw new Error(`usage: node tools/finding.mjs ${cmd} <id> ...`);
  const id = parseId(arg);
  if (cmd === 'show') { const f = get(id); console.log(flag('json') ? JSON.stringify(f, null, 1) : details(f)); return 0; }
  if (cmd === 'ack') {
    const note = opt('note');
    await ack(id, { by: agent('by'), note });
    console.log(`ACKED ${id} by ${agent('by')}${note ? ': ' + note : ''}`);
    return 0;
  }
  if (cmd === 'resolve') {
    const f = await resolve(id, { by: opt('by'), folded: opt('folded'), note: opt('note') });
    console.log(`RESOLVED ${f.id} (${stateLabel(f)}): ${f.title}`);
    return 0;
  }
  throw new Error(`unknown command ${cmd}`);
}

main().then((c) => process.exit(c), (e) => { console.error(e.message || e); process.exit(1); });
