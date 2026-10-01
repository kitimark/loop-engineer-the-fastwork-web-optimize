#!/usr/bin/env node
// Shared findings board (incident I-013; library: tools/lib/finding.mjs). A live board next to the
// incidents in the shared git dir: every worktree sees a post at once, without a commit. The lead folds
// findings into the committed playbook fixes/FINDINGS.md (read that first; this board holds what is new).
//
// Any agent (fix owners, integrator, toolsmiths, bundle-mapper helpers, reviewers):
//   node tools/finding.mjs post --by <agent> --kind technique|pitfall|coupling|measurement|question|limitation
//        --topics <topic>[,<topic>...|all] --title "<one line>" [--where "JS 3100-3155"]
//        [--evidence "<numbers / results file>"] [--body "<details; for a pitfall: how to avoid it>"]
//        [--claim observed|confirmed|refuted|unresolved] [--ref "<url + line/commit/milestone>"]... [--force]
//        # prints POSTED F-012, or SIMILAR F-007 (a finding with a similar title exists: nothing posted;
//        # ack that one, or re-post with --force if yours is different)
//        # platform claims (research/architecture/claims-audit.md §4): confirmed/refuted need at least one
//        # --ref (exit 1 otherwise); --kind limitation ("X never/always happens in browser Y") without
//        # --claim is posted as observed and prints a NOTE
//   node tools/finding.mjs list [--kind k] [--topic a,b] [--since F-007|<iso time>] [--unread --as <agent>] [--open]
//        [--claim observed|confirmed|refuted|unresolved] [--json]
//        # one line per finding, newest last, [OBSERVED]/[CONFIRMED]/... before the title when a claim is set;
//        # --unread: not posted and not acked by <agent>; --claim never matches a record without a claim
//   node tools/finding.mjs show <id> [--json]
//   node tools/finding.mjs ack <id> --by <agent> [--note "applied in <topic>" | --note "not relevant"]
//   node tools/finding.mjs claim <id> --by <agent> --status observed|confirmed|refuted|unresolved [--ref "..."]... [--note "..."]
//        # any agent (verifiers too): sets the claim status, appends refs; prints CLAIM F-059 observed -> refuted by <agent>
//   node tools/finding.mjs wait --as <agent> [--topic a,b] [--kind k] [--since F-007|<iso time>] [--timeout 3600] [--poll 10]
//        # background: exits 0 printing NEW <line> for each finding posted after the wait started (or after
//        # --since) by someone else for your topics (or any topic), and CLAIM F-nnn <from> -> <to> by <agent>
//        # for each claim change by someone else after the wait started (or after --since <iso time>); 3 on timeout
// The lead only:
//   node tools/finding.mjs digest [--since F-007]  # markdown rows in the FINDINGS.md table shape (next T<n>/P<n>)
//   node tools/finding.mjs resolve <id> --by lead --folded T10|P8|lesson|duplicate:F-003|rejected [--note "..."]
//        # this tool never edits fixes/FINDINGS.md; the lead pastes the digest, edits and commits it
// --by / --as default to $FW_AGENT. Exit codes: 0 ok (POSTED, SIMILAR, ...), 1 usage/error, 3 wait timed out.
import { list, get, post, ack, resolve, claim, waitFor, digest, parseId, stateLabel, claimTag, claimLabel, claimChangeLine } from './lib/finding.mjs';

const argv = process.argv.slice(2);
const VALUED = ['--by', '--as', '--kind', '--topics', '--topic', '--title', '--where', '--evidence', '--body', '--since', '--note', '--folded', '--timeout', '--poll', '--claim', '--ref', '--status'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
/** Every value of a repeatable option: --ref a --ref b, or --ref=a. */
const opts = (n) => argv.flatMap((a, i) => (a === `--${n}` ? (i + 1 < argv.length ? [argv[i + 1]] : []) : a.startsWith(`--${n}=`) ? [a.slice(n.length + 3)] : []));
const [cmd, arg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const agent = (n) => opt(n, process.env.FW_AGENT);

function line(f) {
  const tag = f.status === 'open' ? '' : `[${stateLabel(f)}] `;
  const acks = `${f.acks.length} ack${f.acks.length === 1 ? '' : 's'}`;
  return `${f.id}  ${f.kind.padEnd(13)}${tag}${claimTag(f)}${f.title}  (${f.topics.join(', ')}; ${f.by} ${f.postedAt.slice(0, 16).replace('T', ' ')}; ${acks})`;
}

function details(f) {
  const L = [line(f)];
  const kv = (k, v) => { if (v !== undefined && v !== '') L.push(`  ${k}: ${String(v).includes('\n') ? '\n    ' + String(v).replace(/\n/g, '\n    ') : v}`); };
  kv('where', f.where); kv('evidence', f.evidence); kv('body', f.body);
  kv('posted from', `${f.branch ?? '?'} @ ${f.head ?? '?'}`);
  kv('claim', f.claim ? claimLabel(f) : 'unknown (none recorded)');
  if (f.refs?.length) { L.push('  refs:'); for (const r of f.refs) L.push(`    ${r}`); }
  if (f.status !== 'open') kv('state', `${stateLabel(f)} by ${f.resolvedBy} ${f.resolvedAt}${f.resolutionNote ? ': ' + f.resolutionNote : ''}`);
  if (f.acks.length) { L.push('  acks:'); for (const a of f.acks) L.push(`    ${a.by} ${a.at}${a.note ? ' ' + a.note : ''}`); }
  return L.join('\n');
}

async function main() {
  if (!cmd || cmd === 'help' || flag('help')) { console.log('see the header of tools/finding.mjs; the committed playbook: fixes/FINDINGS.md'); return 0; }
  if (cmd === 'post') {
    const r = await post({ by: agent('by'), kind: opt('kind'), topics: opt('topics', opt('topic')), title: opt('title'), where: opt('where'), evidence: opt('evidence'), body: opt('body'), claim: opt('claim'), refs: opts('ref'), force: flag('force') });
    const f = r.finding;
    if (r.action === 'posted') {
      console.log(`POSTED ${f.id}: ${f.title}`);
      if (r.defaulted) console.log('NOTE: posted as OBSERVED; add --claim/--ref after verification');
      console.log('Everyone sees it now (node tools/finding.mjs list). Tell the owners of the topics it affects if it changes their plan.');
    } else {
      console.log(`SIMILAR ${f.id} [${stateLabel(f)}]: ${f.title}`);
      console.log(`Not posted. If it is the same finding: node tools/finding.mjs ack ${f.id} --by ${agent('by')} --note "<what you add or where you applied it>". If it is different, re-post with --force.`);
    }
    return 0;
  }
  if (cmd === 'list') {
    if (flag('unread') && !agent('as')) throw new Error('--unread needs --as <agent> (or $FW_AGENT)');
    const items = list({ kind: opt('kind'), topic: opt('topic', opt('topics')), since: opt('since'), unreadAs: flag('unread') ? agent('as') : undefined, open: flag('open'), claim: opt('claim') });
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
    const times = [];
    for (const f of fresh) {
      if (!f.claimChanges || f.newPost) { console.log(`NEW ${line(f)}`); times.push(f.postedAt); }
      for (const c of f.claimChanges || []) { console.log(claimChangeLine(f.id, c)); times.push(c.at); }
    }
    // after a claim change, an id would re-report it (or miss later ones): wait again from the time of the last news
    const again = fresh.some((f) => f.claimChanges) ? times.sort().at(-1) : fresh.at(-1).id;
    console.log(`Read: node tools/finding.mjs show ${fresh[0].id}; then ack (--note "applied in <topic>" or "not relevant") and wait again with --since ${again}.`);
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
  if (cmd === 'claim') {
    const by = agent('by');
    const f = await claim(id, { by, status: opt('status'), refs: opts('ref'), note: opt('note') });
    console.log(claimChangeLine(f.id, { ...f.history.at(-1).changes.claim, by }));
    if (f.claim === 'refuted') console.log(`Reminder: post the correction as a new finding naming the old id (--body "corrects ${f.id}: ..."), and tell the agents who acked ${f.id}.`);
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
