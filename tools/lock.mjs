#!/usr/bin/env node
// Cross-worktree locks for the shared physical resources (see tools/lib/lock.mjs).
//
//   node tools/lock.mjs status [resource] [--json]
//   node tools/lock.mjs acquire iphone --owner <topic> [--ttl 900] [--wait 0] [--url https://192.168.0.55:5231/] [--note "..."]
//   node tools/lock.mjs renew   iphone --owner <topic> [--ttl 900]
//   node tools/lock.mjs release iphone --owner <topic> [--force]
//   node tools/lock.mjs dequeue iphone --owner <topic>          # stop waiting
//   node tools/lock.mjs run chrome-measure --owner <topic> -- <cmd> [args...]   # hold while cmd runs
//   node tools/lock.mjs run chrome-measure --owner <topic> --short --max-seconds 150 -- npm test
//   node tools/lock.mjs run chrome-measure --owner <topic> --no-timing --max-seconds 600 -- <build>   # CPU work, no host gate
//   node tools/lock.mjs acquire chrome-measure --owner <topic> --short --max-seconds 180 --wait 1800
//   node tools/lock.mjs wait chrome-measure --until free|idle|mine|held-by:<o>|released-by:<o>|'position<=N' [--owner <you>] [--for S] [--timeout 3600]
//
// wait (run it in the background; ts-wait): blocks until the lock reaches a state, then prints ONE line and exits
// 0 MET / 3 TIMEOUT (1 usage). It only reads the lock files (polls 1 s, backing off to 10 s; each change of state
// goes to stderr): it takes no queue place and keeps none alive. To wait for your own turn use `run` or
// `acquire --wait N` (the waits that keep your place).
//   free               no live holder (someone queued may take it at once)
//   idle               no live holder and nobody queued; with --for 120: stayed so for 120 s (a quiet window for CPU work)
//   mine               held by --owner (e.g. your background `lock.mjs run` has started)
//   held-by:<o>        held by <o>
//   released-by:<o>    <o> neither holds it nor waits for it (its hold, or its queued run, is over)
//   position<=N        --owner holds it or is #N or better in the queue (as status prints it)
// e.g.  node tools/lock.mjs wait chrome-measure --until released-by:all-wave1 --timeout 2h
//       node tools/lock.mjs wait chrome-measure --until idle --for 120 --timeout 1h
//
// --short --max-seconds N (N <= 300; default 120): the short lane for jobs like `npm test` (~35 s).
// Waits for the current holder, then is served before earlier normal waiters (queued short jobs run
// back to back, all of them, while the run fits 900 s, SHORT_DRAIN_SEC (I-020); then a normal waiter; a normal
// waiter the lead moved ahead of short jobs goes before them). The hold ends at N s: `run` kills the command (and its children) and
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
// chrome-measure (incident I-020): measure in ONE `run` hold (servers started inside its sh -c), not a lease.
// A normal lease there defaults to --ttl 600 and can't outlive acquiredAt + 1200 s (--ttl above it is
// refused, renew is clamped). A normal `run` declares its length with --max-seconds (default 600): past
// it the command keeps running, but it warns and `status` shows OVERDUE; split long measurements into
// holds of 5-10 min. Hand-over: the waiter served next polls every ~1 s; a waiter not seen for 30 s is
// skipped at a hand-over (it keeps its place), so keep polling (`run`, `acquire --wait`). The iphone
// keeps strict FIFO (its waiters retry every 2-5 min by protocol). Every chrome-measure hold runs under a
// `caffeinate -i -s` assertion (I-026: Maintenance Sleep stalled a hold 472 s): -w <holder pid> for a
// process hold, -t <until expiry> for a lease (replaced on renew), ended on release (lib/awake.mjs).
// A chrome-measure `run` also records the display on/off, FullWake/DarkWake, power source and whether a
// display-sleep-preventing assertion (caffeinate -d) was active at its start and end, one JSON line per hold in
// locks/holds.log; it warns on stderr when no such assertion is active, the host is already asleep (display off or DarkWake) at the start, or the display / wake state changed (T8+, I-033).
// A host sleep inside a gate window makes that window not quiet; the grant's gate record carries sleptSec / woke (I-033).
//
// --no-timing (run only; ts-lock-bundle): a normal hold for work that measures nothing (xcodebuild, other minutes of
// CPU) while it keeps measurements out (Hard rule 7). It waits its FIFO turn like any normal job, but skips the host
// gate (it needs no quiet host: e.g. the user works at the Mac), records no display / wake state, and shows as
// "(no-timing)" in status. Nothing timed runs inside it: a nested verify.mjs / fix.mjs ab / bench / normal `run`
// refuses to start (exit 1, "no-timing hold"), timed iPhone runs refuse as during any normal hold, and every timing
// waiter after it passes the gate on a fresh window. Short jobs and nested --no-timing runs may run inside it; a
// --no-timing run nested inside a timing hold refuses (exit 1). Run only this checkout's tools inside a no-timing
// hold; an older checkout's verify/ab/bench would not refuse.
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
// entry keeps its `since` and records movedBy/movedAt (status: "moved by lead"; a move to its own position records
// them too, I-035, and is a no-op only once they are there). Positions are the live
// queue as status shows it. Waiters keep their entries (and pids) and are granted in the new order; the
// short lane serves queued short jobs first within its drain budget (I-007/I-011), except short jobs
// behind a normal waiter the lead moved: the move wins (I-020).
//
// Host gate (I-016): a normal waiter of chrome-measure whose turn it is is granted only on a quiet host
// (lib/host.mjs quiet(): CPU <= 25 % over 10 s, load1 <= 6, memory pressure normal), or after 600 s
// anyway (holder `gateTimeout: true`, a line in locks/host-alerts.log; verify.mjs marks those runs
// contaminated). Short jobs pass it only during the first 120 s of that gate wait, through the short lane
// or the gate exemption, and never a waiter the lead moved (I-030). FW_GATE_SHORT_PASS (seconds; 0 = never)
// counts in the short job's own env: its process decides its grant. `acquire` samples one 10 s window when it is its turn, so a
// single acquire may take ~10 s; BUSY then says "host not quiet". `status` samples the host for 3 s and
// prints a host line with the gate state (--no-host skips it).
import { spawn, execFileSync } from 'node:child_process';
import { tryAcquire, acquire, release, renew, dequeue, status, allStatus, staleReason, heldEnv, RESOURCES, GATED, gateSample, NEXT_POLL_MS, LEASE_POLICY, holdsLogFile } from './lib/lock.mjs';
import { sample, describe, THRESHOLDS, hostPower, hostStateSummary } from './lib/host.mjs';
import { appendFileSync } from 'node:fs';
import { doctor, repair, moveWaiter, auditFile } from './lib/lock-repair.mjs';
import { keepAwake, stopAwake, keepAwakeQueued } from './lib/awake.mjs';
import { pollUntil, parseSec, parseLockCondition, lockConditionMet, lockConditionText, EXIT as WAIT_EXIT } from './lib/wait.mjs';

const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const own = dd >= 0 ? argv.slice(0, dd) : argv;
const rest = dd >= 0 ? argv.slice(dd + 1) : [];
const opt = (n, d) => { const i = own.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = own[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : own[i + 1]; };
const flag = (n) => own.includes(`--${n}`);
const VALUED = ['--owner', '--ttl', '--wait', '--url', '--note', '--timeout', '--max-seconds', '--by', '--reason', '--guard-age', '--move', '--to', '--until', '--for'];
const [cmd, resource] = own.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(own[i - 1])));
const owner = opt('owner', process.env.FW_LOCK_OWNER);
const short = flag('short');
const noTiming = flag('no-timing'); // ts-lock-bundle: a normal run that measures nothing (builds, CPU work): no host gate, never hosts a timing run
const maxSec = short ? Number(opt('max-seconds', 120)) : undefined;
const sh = (w) => (w.short ? ` (short, max ${w.maxSec} s)` : w.noTiming ? ' (no-timing)' : '');
const NORMAL_HOLD_SEC = 600; // a normal chrome-measure hold should end within ~10 min (I-020); `run --max-seconds` declares another length
// a normal hold that declared its length (`run --max-seconds`, I-020) and passed it
const overdue = (h) => (!h.short && h.meta && h.meta.expectSec && Date.now() > Date.parse(h.acquiredAt) + h.meta.expectSec * 1000 ? ` OVERDUE (past its ${h.meta.expectSec} s; split long measurements into holds of 5-10 min, I-020)` : '');

function fmt(s) {
  const h = s.holder;
  let line = `${s.resource.padEnd(15)} `;
  if (!h) line += s.next ? `free, handing over to "${s.next}"` : 'free';
  else line += `${s.stale ? 'STALE (' + s.stale + ') ' : ''}held by "${h.owner}"${sh(h)} [${h.kind}${h.pid ? ' pid ' + h.pid : ''}] since ${h.acquiredAt}${h.expiresAt ? ' until ' + h.expiresAt : ''}${overdue(h)}\n${' '.repeat(16)}checkout ${h.checkout}${h.meta && Object.keys(h.meta).length ? '\n' + ' '.repeat(16) + JSON.stringify(h.meta) : ''}`;
  if (s.queue.length) line += `\n${' '.repeat(16)}queue: ${fmtQueue(s.queue)}`;
  return line;
}
const moved = (w) => (w.movedBy ? `, moved by ${w.movedBy}` : '');
const fmtQueue = (q) => q.map((w, i) => `${i + 1}. ${w.owner}${w.short ? ` (short, max ${w.maxSec} s, since ${w.since}${moved(w)})` : ` (${w.noTiming ? 'no-timing, ' : ''}since ${w.since}${moved(w)})`}`).join(', ');

/** host: load1 30.4 | cpu 68 % busy (sys 33 %) over 3 s | mem pressure warn | gate CLOSED (...) since ... */
function hostLine(host, list) {
  const gates = list.filter((s) => GATED[s.resource]).map((s) => {
    const w = s.queue.find((x) => x.gate && x.gate.quiet !== true && Date.now() - Date.parse(x.gate.at) < 60000);
    if (w) return `${s.resource} gate CLOSED for "${w.owner}" (${w.gate.reasons.join(', ') || 'measuring'}) since ${w.gate.since}, opens when quiet or after ${THRESHOLDS.gateMaxWaitSec} s`;
    const h = s.holder && !s.stale ? s.holder : null;
    if (h?.gateTimeout) return `${s.resource} held after a gate TIMEOUT (host was not quiet: runs contaminated)`;
    return `${s.resource} gate open`;
  });
  return `host: ${describe(host)}${gates.length ? ' | ' + gates.join(' | ') : ''}`;
}

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
    const host = flag('no-host') ? null : await sample({ windowSec: 3 });
    if (flag('json')) { console.log(JSON.stringify(host ? list.map((s) => (GATED[s.resource] ? { ...s, host } : s)) : list, null, 1)); return 0; }
    for (const s of list) console.log(fmt(s));
    if (host) console.log(hostLine(host, list));
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
      // I-035: a move to the entry's own position still writes the lead's mark (movedBy), unless it is already there
      if (!m.changed && !m.marked) console.log(`MOVE ${resource}: "${m.owner}" is already #${m.from} and moved by "${opt('by')}", nothing to do`);
      else if (!m.changed && !apply) console.log(`MOVE ${resource} (dry run, nothing changed): "${m.owner}" stays #${m.from}, marked as moved by "${opt('by')}"; apply with --apply`);
      else if (!m.changed) console.log(`MOVED ${resource}: "${m.owner}" stays #${m.from}, marked as moved by "${opt('by')}" (served before the short jobs behind it, I-020/I-035), logged to ${auditFile()}`);
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
  if (cmd === 'wait') return waitCmd();
  if (!owner && cmd !== 'release') throw new Error('--owner <name> is required (use your fix topic)');
  if (noTiming && cmd !== 'run') throw new Error('--no-timing is for lock.mjs run (a normal hold that measures nothing: builds, CPU work)');
  const meta = {};
  if (opt('url')) meta.url = opt('url');
  if (opt('note')) meta.note = opt('note');
  if (cmd === 'acquire') {
    const ttlSec = Number(opt('ttl', resource === 'iphone' ? 900 : 0)) || undefined;
    const waitSec = Number(opt('wait', 0));
    // gated resource, normal lease: pass the latest host reading; when it is our turn, measure one window and retry
    let host = GATED[resource] && !short ? { quiet: null, reasons: ['not measured yet'] } : undefined;
    const attempt = async () => {
      let r = await tryAcquire(resource, { owner, kind: 'lease', ttlSec, meta, short, maxSec, host });
      if (r.gated) { host = await gateSample(); r = await tryAcquire(resource, { owner, kind: 'lease', ttlSec, meta, short, maxSec, host }); }
      else if (host) host = { quiet: null, reasons: ['not measured yet'] };
      if (!r.ok && (!r.gated || host?.quiet === false)) keepAwakeQueued(resource); // queued behind someone or held at the host gate (also a BUSY exit 3 that comes back later): keep the Mac awake (I-026 reopened, ts-lock-bundle (a))
      return r;
    };
    let res = await attempt();
    const t0 = Date.now();
    let pause = short ? 1000 : 5000;
    while (!res.ok && (Date.now() - t0) / 1000 < waitSec) {
      // the waiter served next polls fast (I-020); others back off to 15 s, well inside the 30 s a waiter may go unseen before a hand-over skips it
      if (!res.gated) await new Promise((r) => setTimeout(r, Math.min(res.next === owner ? NEXT_POLL_MS : pause, waitSec * 1000 - (Date.now() - t0) + 10)));
      pause = Math.min(short ? 3000 : 15000, pause * 1.5);
      res = await attempt();
    }
    if (res.ok && !res.inherited) keepAwake(resource, res.holder); // a lease keeps the Mac awake until it expires (I-026)
    if (res.ok) { console.log(`ACQUIRED ${resource} for "${owner}"${res.holder.expiresAt ? ' until ' + res.holder.expiresAt : ''}${res.reentrant ? ' (renewed)' : ''}${sh(res.holder)}${res.holder.gateTimeout ? ' after a host-gate TIMEOUT: the host was not quiet, measurements in this hold are contaminated' : ''}`); console.log(JSON.stringify(res.holder, null, 1)); return 0; }
    const who = res.holder ? `held by "${res.holder.owner}" since ${res.holder.acquiredAt}${res.holder.expiresAt ? ' until ' + res.holder.expiresAt : ''}`
      : res.gated ? `free, but the host is not quiet (${res.gate.reasons.join(', ')}; waiting since ${res.gate.since}, granted anyway after ${THRESHOLDS.gateMaxWaitSec} s)` : `free, but "${res.next}" is next`;
    console.log(`BUSY ${resource}: ${who}. You ("${owner}") are #${res.position} in the queue; run acquire again within 10 min to keep your place (a hand-over serves waiters that keep polling, e.g. with --wait; one not seen for 30 s is skipped but keeps its place).`);
    return 3;
  }
  if (cmd === 'renew') { const h = await renew(resource, { owner, ttlSec: Number(opt('ttl', 900)) }); keepAwake(resource, h); console.log(`RENEWED ${resource} for "${owner}" until ${h.expiresAt}${h.capped ? ` (capped: a ${resource} lease ends by acquiredAt + ${LEASE_POLICY[resource].maxHoldSec} s; measure inside one lock.mjs run hold, I-020)` : ''}`); return 0; }
  if (cmd === 'release') {
    const h = await release(resource, { owner, force: flag('force') });
    if (h) stopAwake(resource, h.token);
    console.log(h ? `RELEASED ${resource} (was "${h.owner}"${staleReason(h) ? ', stale' : ''})` : `${resource} was not held`);
    return 0;
  }
  if (cmd === 'dequeue') { const q = await dequeue(resource, owner); console.log(`left the ${resource} queue; ${q.length} waiting`); return 0; }
  if (cmd === 'run') {
    if (!rest.length) throw new Error('usage: node tools/lock.mjs run <resource> --owner X -- <cmd> [args]');
    // a normal hold declares its length (I-020): --max-seconds, default NORMAL_HOLD_SEC on chrome-measure; past it the
    // command keeps running (a measurement is never killed), but it warns and `status` shows the hold OVERDUE
    const expectSec = !short && (opt('max-seconds') !== undefined || LEASE_POLICY[resource]) ? Number(opt('max-seconds', NORMAL_HOLD_SEC)) : undefined;
    if (expectSec !== undefined) { if (!(expectSec > 0)) throw new Error(`--max-seconds must be a number of seconds > 0 (got ${opt('max-seconds')})`); meta.expectSec = expectSec; }
    const { release: rel, holder, reentrant } = await acquire(resource, { owner, kind: 'process', meta, short, maxSec, noTiming, timeoutSec: Number(opt('timeout', 3600)) });
    // T8+ (I-033): a chrome-measure hold records the display / wake state and whether a display-sleep-preventing assertion
    // was active at its start and end (one JSON line per hold in locks/holds.log); a hold without one, or one in
    // which the display or wake state changed, warns on stderr (U1: display on ~76 fps vs DarkWake ~93 fps)
    const powerStart = GATED[resource] && !reentrant && !noTiming ? await hostPower() : null; // a no-timing hold measures nothing: no display / wake record
    if (powerStart && powerStart.displaySleepPrevented === false) console.error(`[lock ${resource}] no display-sleep assertion is active (pmset -g assertions: PreventUserIdleDisplaySleep 0): the display may sleep during this hold and change what it measures (T8+, I-033)`);
    // review-host-state N1: an assertion (caffeinate -d) keeps a lit display lit, it does not light a dark one or end DarkWake
    if (powerStart && (powerStart.display === 'off' || powerStart.fullWake === false)) console.error(`[lock ${resource}] the host is not awake at the start of this hold (${[powerStart.display === 'off' ? 'display off' : null, powerStart.fullWake === false ? 'DarkWake' : null].filter(Boolean).join(', ')}): a display-sleep assertion does not wake it; what this hold measures may not compare with an awake host (T8+, I-033)`);
    // a short job runs in its own process group, so reaching --max-seconds stops the whole tree (npm test -> node --test -> ...);
    // FW_LOCK_HELD: the command's own verify.mjs / fix.mjs ab / nested run re-enter this hold instead of queueing behind it
    const child = spawn(rest[0], rest.slice(1), { stdio: 'inherit', detached: short, env: { ...process.env, FW_LOCK_HELD: heldEnv(resource, holder.token) } });
    // I-024: a short job's tree can leave the command's group (a nested `run --short` detaches its own
    // command), and orphans lose their parent link once the command exits. So every kill also signals each
    // descendant seen so far (pid + its group, re-checked by pgid against pid reuse), not only the group.
    let seen = new Map();
    const killTree = (sig) => {
      const rows = psRows(), own = rows.find(([p]) => p === process.pid)?.[2];
      for (const [p, g] of descendants(rows, child.pid)) seen.set(p, g);
      const live = new Map(rows.map(([p, , g]) => [p, g]));
      try { process.kill(-child.pid, sig); } catch {}
      for (const [p, g] of seen) {
        if (live.get(p) !== g) continue; // gone (or the pid was reused)
        if (g !== own && g !== child.pid) { try { process.kill(-g, sig); } catch {} }
        try { process.kill(p, sig); } catch {}
      }
    };
    const kill = (sig) => { try { if (short) killTree(sig); else child.kill(sig); } catch {} };
    // acquire() releases the lock and exits on these signals; stop the command first, or it would keep
    // running (e.g. a throttled measurement) after the lock was handed to the next waiter.
    // a short job then gets SIGKILL too: acquire()'s handler releases the lock and exits right after this
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.prependListener(sig, () => { kill(sig); if (short) kill('SIGKILL'); });
    // wall-clock deadlines checked every second (I-026): a timer's clock stalls while the Mac sleeps
    // (Maintenance Sleep / DarkWake), so after a wake the cap is enforced at once, not minutes later
    let overran = false;
    const deadline = Date.now() + (maxSec || 0) * 1000;
    const timer = short && setInterval(() => {
      const now = Date.now();
      if (!overran && now >= deadline) {
        overran = true;
        console.error(`[lock ${resource}] "${rest.join(' ')}" exceeded --max-seconds ${maxSec}; stopping it and releasing the lock`);
        kill('SIGTERM');
      } else if (overran && now >= deadline + 3000) kill('SIGKILL');
    }, 250);
    const warn = expectSec && setTimeout(() => console.error(`[lock ${resource}] this hold passed its ${expectSec} s (--max-seconds; I-020): it keeps running, but split long measurements into lock.mjs run holds of 5-10 min so short jobs get in at each hand-over`), expectSec * 1000);
    const code = await new Promise((r) => child.on('exit', (c, s) => r(c ?? (s ? 1 : 0))));
    clearInterval(timer);
    clearTimeout(warn);
    if (overran) kill('SIGKILL'); // anything in the tree that ignored SIGTERM (or was orphaned when the command exited)
    if (powerStart) {
      const powerEnd = await hostPower();
      const hs = hostStateSummary([{ label: owner, run: 0, power: { start: powerStart, end: powerEnd } }]);
      try { appendFileSync(holdsLogFile(), JSON.stringify({ at: new Date().toISOString(), resource, owner, short: !!short, acquiredAt: holder.acquiredAt, code, start: powerStart, end: powerEnd, tag: hs.tag }) + '\n'); } catch {}
      if (hs.tag) console.error(`[lock ${resource}] ${hs.tag} during this hold: ${hs.reasons.join('; ')} (T8+, I-033)`);
    }
    rel();
    return overran ? 124 : code;
  }
  throw new Error(`unknown command ${cmd}`);
}

/** `lock.mjs wait <resource> --until <cond>`: read-only, no queue place (see the header). */
async function waitCmd() {
  if (opt('until') === undefined) throw new Error("usage: node tools/lock.mjs wait <resource> --until free|idle|mine|held-by:<owner>|released-by:<owner>|'position<=N' [--owner <you>] [--for S] [--timeout 3600]");
  const cond = parseLockCondition(opt('until'), owner);
  const sec = (n, d) => { const v = opt(n); if (v === undefined) return d; const x = parseSec(v); if (!(x >= 0)) throw new Error(`--${n} must be a number of seconds (or 10m, 2h), got ${v}`); return x; };
  const timeoutSec = sec('timeout', 3600), holdSec = sec('for', 0);
  status(resource); // a bad resource name fails here, before the first poll
  const what = `${resource} ${lockConditionText(cond)}`;
  const onChange = flag('quiet') ? undefined : (state, s) => console.error(`[lock wait ${new Date().toISOString().slice(11, 19)}Z +${s}s] ${resource} ${state}`);
  const r = await pollUntil(() => lockConditionMet(cond, status(resource)), { timeoutSec, holdSec, onChange });
  if (r.result === 'met') { console.log(`MET ${what}: ${r.state}${holdSec ? ` (for ${holdSec} s)` : ''} (after ${r.waitedSec} s)`); return WAIT_EXIT.met; }
  console.log(`TIMEOUT ${what} after ${r.waitedSec} s: ${r.state}`);
  return WAIT_EXIT.timeout;
}

/** [pid, ppid, pgid] of every process (ps), or [] if ps fails. */
function psRows() {
  try { return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8' }).trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number)); } catch { return []; }
}
/** [pid, pgid] of every descendant of root in the ps rows. */
function descendants(rows, root) {
  const kids = new Map();
  for (const [p, pp, g] of rows) { if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push([p, g]); }
  const out = [], stack = [root];
  while (stack.length) for (const [p, g] of kids.get(stack.pop()) || []) { out.push([p, g]); stack.push(p); }
  return out;
}

main().then((c) => process.exit(c), (e) => { console.error(e.message || e); process.exit(1); });
