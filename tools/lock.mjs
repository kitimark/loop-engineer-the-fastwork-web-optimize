#!/usr/bin/env node
// Cross-worktree locks for the shared physical resources (see tools/lib/lock.mjs).
//
//   node tools/lock.mjs status [resource] [--json]
//   node tools/lock.mjs acquire iphone --owner <topic> [--ttl 900] [--wait 0] [--url https://192.168.0.55:5231/] [--note "..."]
//   node tools/lock.mjs renew   iphone --owner <topic> [--ttl 900]
//   node tools/lock.mjs release iphone --owner <topic> [--force]
//   node tools/lock.mjs dequeue iphone --owner <topic>          # stop waiting
//   node tools/lock.mjs run chrome-measure --owner <topic> -- <cmd> [args...]   # hold while cmd runs
//   node tools/lock.mjs run chrome-measure --owner <topic> --short --max-seconds 120 -- npm test
//   node tools/lock.mjs acquire chrome-measure --owner <topic> --short --max-seconds 180 --wait 1800
//
// --short --max-seconds N (N <= 300; default 120): the short lane for jobs like `npm test` (~35 s).
// Waits for the current holder, then is served before earlier normal waiters (queued short jobs run
// back to back while the run fits 300 s, SHORT_DRAIN_SEC; then a normal waiter). The hold ends at N s: `run` kills the command (and its children) and
// exits 124; a short lease just expires (it cannot be renewed). Keep polling while you wait (`run`
// and `acquire --wait` do): a short queue place is dropped after 60 s without a retry.
//
// acquire exit codes: 0 = you hold it (prints the holder JSON), 3 = busy (you are queued; prints
// holder + your queue position; call acquire again later to keep your place, every <= 5 min).
// --wait N blocks up to N seconds (polling with backoff) before giving up with exit code 3.
// run: waits in the FIFO queue (as a process: killing a waiting run gives up its place), then runs the
// command with FW_LOCK_HELD=<resource>:<token>, so everything inside it (verify.mjs, fix.mjs ab, a
// probe, another `lock.mjs run`) uses this one hold instead of queueing behind it; e.g.
//   node tools/lock.mjs run chrome-measure --owner <topic> -- sh -c 'node tools/fix.mjs ab <topic> --runs 5 && node probe.mjs'
// Resources: chrome-measure (verify.mjs takes it automatically), iphone (lease, TTL default 900 s).
//
// Lock state looks wrong (a stale "short" last grant starving the short lane, a queue entry that never
// goes away, a leftover guard dir)? Never edit the lock JSON by hand (incident I-012); use:
//   node tools/lock.mjs doctor [resource] [--json]      # read-only; exit 0 clean, 1 problems (each with its fix)
//   node tools/lock.mjs repair <resource> [--force-holder]                        # dry run: before/after per change
//   node tools/lock.mjs repair <resource> --by <who> --reason "<why>" --apply     # the lead applies it
// --apply takes the resource's guard (the mutex of every acquire/release), re-checks under it, applies
// only the doctor's fixes (atomic writes), and appends one JSON line per change to locks/audit.log. A
// live holder is never removed unless --force-holder (which prints it first); the iphone lease of a live
// holder never. Checks: stale holder; unparsable files; stale, dead or duplicate queue entries; last grant
// missing or not matching the live holder (I-011); a short last grant, no holder, older than its hold
// could run; a guard dir older than --guard-age (10 s); *.tmp older than 60 s. Library: lib/lock-repair.mjs.
//
// The lead reorders the queue by expected gain (fixes/DIRECTION.md; incident I-019):
//   node tools/lock.mjs repair chrome-measure --move <owner> --to <position> --by lead --reason "<why>" [--apply]
// Dry run by default (before/after queue). --apply moves that waiting entry under the guard and appends one
// "queue-move" line to locks/audit.log. Only waiting entries move (never the holder); only --by lead; the
// entry keeps its `since` and records movedBy/movedAt (status: "moved by lead"). Positions are the live
// queue as status shows it. Waiters keep their entries (and pids) and are granted in the new order; the
// short lane still serves queued short jobs first within its drain budget (I-007/I-011).
import { spawn } from 'node:child_process';
import { tryAcquire, acquire, release, renew, dequeue, status, allStatus, staleReason, heldEnv, RESOURCES } from './lib/lock.mjs';
import { doctor, repair, moveWaiter, auditFile } from './lib/lock-repair.mjs';

const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const own = dd >= 0 ? argv.slice(0, dd) : argv;
const rest = dd >= 0 ? argv.slice(dd + 1) : [];
const opt = (n, d) => { const i = own.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = own[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : own[i + 1]; };
const flag = (n) => own.includes(`--${n}`);
const VALUED = ['--owner', '--ttl', '--wait', '--url', '--note', '--timeout', '--max-seconds', '--by', '--reason', '--guard-age', '--move', '--to'];
const [cmd, resource] = own.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(own[i - 1])));
const owner = opt('owner', process.env.FW_LOCK_OWNER);
const short = flag('short');
const maxSec = short ? Number(opt('max-seconds', 120)) : undefined;
const sh = (w) => (w.short ? ` (short, max ${w.maxSec} s)` : '');

function fmt(s) {
  const h = s.holder;
  let line = `${s.resource.padEnd(15)} `;
  if (!h) line += s.next ? `free, handing over to "${s.next}"` : 'free';
  else line += `${s.stale ? 'STALE (' + s.stale + ') ' : ''}held by "${h.owner}"${sh(h)} [${h.kind}${h.pid ? ' pid ' + h.pid : ''}] since ${h.acquiredAt}${h.expiresAt ? ' until ' + h.expiresAt : ''}\n${' '.repeat(16)}checkout ${h.checkout}${h.meta && Object.keys(h.meta).length ? '\n' + ' '.repeat(16) + JSON.stringify(h.meta) : ''}`;
  if (s.queue.length) line += `\n${' '.repeat(16)}queue: ${fmtQueue(s.queue)}`;
  return line;
}
const moved = (w) => (w.movedBy ? `, moved by ${w.movedBy}` : '');
const fmtQueue = (q) => q.map((w, i) => `${i + 1}. ${w.owner}${w.short ? ` (short, max ${w.maxSec} s, since ${w.since}${moved(w)})` : ` (since ${w.since}${moved(w)})`}`).join(', ');

function fmtProblem(p, withValues) {
  let s = `  - [${p.code}] ${p.file}: ${p.message}\n    fix: ${p.fix}`;
  if (withValues) s += `\n    before: ${JSON.stringify(p.before)}\n    after:  ${JSON.stringify(p.after)}`;
  return s;
}
function fmtDoctor(d) {
  const h = d.holder ? `held by "${d.holder.owner}"${sh(d.holder)}` : 'no live holder';
  if (!d.problems.length) return `OK ${d.resource}: ${h}`;
  return `PROBLEMS ${d.resource}: ${d.problems.length} (${h})\n${d.problems.map((p) => fmtProblem(p, false)).join('\n')}\n  dry run: node tools/lock.mjs repair ${d.resource}`;
}

async function main() {
  if (!cmd || cmd === 'help' || flag('help')) { console.log(Object.entries(RESOURCES).map(([k, v]) => `  ${k}: ${v}`).join('\n')); console.log('\nsee header of tools/lock.mjs for usage'); return 0; }
  if (cmd === 'status') {
    const list = resource ? [status(resource)] : allStatus();
    if (flag('json')) console.log(JSON.stringify(list, null, 1)); else for (const s of list) console.log(fmt(s));
    return 0;
  }
  if (cmd === 'doctor') {
    const list = doctor(resource, { guardAgeSec: Number(opt('guard-age', 10)) });
    if (flag('json')) console.log(JSON.stringify(list, null, 1)); else for (const d of list) console.log(fmtDoctor(d));
    return list.some((d) => d.problems.length) ? 1 : 0;
  }
  if (cmd === 'repair') {
    if (!resource) throw new Error('usage: node tools/lock.mjs repair <resource> [--by <who> --reason "<why>" --apply] [--force-holder]');
    const apply = flag('apply'), forceHolder = flag('force-holder');
    if (opt('move') !== undefined) {
      if (forceHolder) throw new Error('--move reorders waiting entries only; it does not combine with --force-holder');
      if (opt('to') === undefined) throw new Error('usage: node tools/lock.mjs repair <resource> --move <owner> --to <position> --by lead --reason "<why>" [--apply]');
      const m = await moveWaiter(resource, { owner: opt('move'), to: Number(opt('to')), by: opt('by'), reason: opt('reason'), apply });
      if (flag('json')) { console.log(JSON.stringify(m, null, 1)); return 0; }
      const what = `"${m.owner}" #${m.from} -> #${m.to}`;
      if (!m.changed) console.log(`MOVE ${resource}: "${m.owner}" is already #${m.from}, nothing to do`);
      else if (!apply) console.log(`MOVE ${resource} (dry run, nothing changed): ${what}; apply with --apply`);
      else console.log(`MOVED ${resource}: ${what} by "${opt('by')}", logged to ${auditFile()}`);
      console.log(`  holder: ${m.holder ? `"${m.holder.owner}"${sh(m.holder)} (not touched)` : 'none'}`);
      console.log(`  before: ${fmtQueue(m.before)}\n  after:  ${fmtQueue(m.after)}`);
      if (m.note) console.log(`  note: ${m.note}`);
      return 0;
    }
    if (forceHolder) { const h = status(resource).holder; console.log(`holder: ${h ? JSON.stringify(h) : 'none'}`); }
    const d = await repair(resource, { by: opt('by'), reason: opt('reason'), apply, forceHolder, guardAgeSec: Number(opt('guard-age', 10)) });
    const n = d.problems.length;
    if (flag('json')) { console.log(JSON.stringify(d, null, 1)); return 0; }
    if (!apply) console.log(`REPAIR ${resource} (dry run, nothing changed): ${n} change(s)${n ? '; apply with --by <who> --reason "<why>" --apply' : ''}`);
    else console.log(`REPAIRED ${resource}: ${n} change(s)${n ? ` by "${opt('by')}", logged to ${auditFile()}` : ''}`);
    for (const p of d.problems) console.log(fmtProblem(p, true));
    return 0;
  }
  if (!resource) throw new Error(`usage: node tools/lock.mjs ${cmd} <resource> --owner <name>`);
  if (!owner && cmd !== 'release') throw new Error('--owner <name> is required (use your fix topic)');
  const meta = {};
  if (opt('url')) meta.url = opt('url');
  if (opt('note')) meta.note = opt('note');
  if (cmd === 'acquire') {
    const ttlSec = Number(opt('ttl', resource === 'iphone' ? 900 : 0)) || undefined;
    const waitSec = Number(opt('wait', 0));
    let res = await tryAcquire(resource, { owner, kind: 'lease', ttlSec, meta, short, maxSec });
    const t0 = Date.now();
    let pause = short ? 1000 : 5000;
    while (!res.ok && (Date.now() - t0) / 1000 < waitSec) {
      await new Promise((r) => setTimeout(r, Math.min(pause, waitSec * 1000 - (Date.now() - t0) + 10)));
      pause = Math.min(short ? 3000 : 30000, pause * 1.5);
      res = await tryAcquire(resource, { owner, kind: 'lease', ttlSec, meta, short, maxSec });
    }
    if (res.ok) { console.log(`ACQUIRED ${resource} for "${owner}"${res.holder.expiresAt ? ' until ' + res.holder.expiresAt : ''}${res.reentrant ? ' (renewed)' : ''}${sh(res.holder)}`); console.log(JSON.stringify(res.holder, null, 1)); return 0; }
    const who = res.holder ? `held by "${res.holder.owner}" since ${res.holder.acquiredAt}${res.holder.expiresAt ? ' until ' + res.holder.expiresAt : ''}` : `free, but "${res.next}" is next`;
    console.log(`BUSY ${resource}: ${who}. You ("${owner}") are #${res.position} in the queue; run acquire again within 10 min to keep your place.`);
    return 3;
  }
  if (cmd === 'renew') { const h = await renew(resource, { owner, ttlSec: Number(opt('ttl', 900)) }); console.log(`RENEWED ${resource} for "${owner}" until ${h.expiresAt}`); return 0; }
  if (cmd === 'release') {
    const h = await release(resource, { owner, force: flag('force') });
    console.log(h ? `RELEASED ${resource} (was "${h.owner}"${staleReason(h) ? ', stale' : ''})` : `${resource} was not held`);
    return 0;
  }
  if (cmd === 'dequeue') { const q = await dequeue(resource, owner); console.log(`left the ${resource} queue; ${q.length} waiting`); return 0; }
  if (cmd === 'run') {
    if (!rest.length) throw new Error('usage: node tools/lock.mjs run <resource> --owner X -- <cmd> [args]');
    const { release: rel, holder } = await acquire(resource, { owner, kind: 'process', meta, short, maxSec, timeoutSec: Number(opt('timeout', 3600)) });
    // a short job runs in its own process group, so reaching --max-seconds stops the whole tree (npm test -> node --test -> ...);
    // FW_LOCK_HELD: the command's own verify.mjs / fix.mjs ab / nested run re-enter this hold instead of queueing behind it
    const child = spawn(rest[0], rest.slice(1), { stdio: 'inherit', detached: short, env: { ...process.env, FW_LOCK_HELD: heldEnv(resource, holder.token) } });
    const kill = (sig) => { try { if (short) process.kill(-child.pid, sig); else child.kill(sig); } catch {} };
    // acquire() releases the lock and exits on these signals; stop the command first, or it would keep
    // running (e.g. a throttled measurement) after the lock was handed to the next waiter.
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.prependListener(sig, () => kill(sig));
    let overran = false;
    const timer = short && setTimeout(() => {
      overran = true;
      console.error(`[lock ${resource}] "${rest.join(' ')}" exceeded --max-seconds ${maxSec}; stopping it and releasing the lock`);
      kill('SIGTERM');
      setTimeout(() => kill('SIGKILL'), 3000).unref();
    }, maxSec * 1000);
    const code = await new Promise((r) => child.on('exit', (c, s) => r(c ?? (s ? 1 : 0))));
    clearTimeout(timer);
    if (overran) kill('SIGKILL'); // anything in the group that ignored SIGTERM
    rel();
    return overran ? 124 : code;
  }
  throw new Error(`unknown command ${cmd}`);
}

main().then((c) => process.exit(c), (e) => { console.error(e.message || e); process.exit(1); });
