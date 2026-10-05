#!/usr/bin/env node
// Cross-worktree locks for the shared physical resources (see tools/lib/lock.mjs).
//
//   node tools/lock.mjs status [resource] [--json]
//   node tools/lock.mjs acquire iphone --owner <topic> [--ttl 900] [--wait 0] [--url https://lan:5231/] [--note "..."]
//       --url host `lan` (or `lan-host`): this Mac's LAN address, kept as given and resolved by the phone tools at run time
//       (lib/lan.mjs, `node tools/lan.mjs`; it changes on a Wi-Fi reconnect, I-073); acquire checks that it resolves now
//   node tools/lock.mjs renew   iphone --owner <topic> [--ttl 900] [--no-shorten]
//       sets the expiry to now + ttl; --no-shorten (an automatic renew, e.g. iphone.mjs run before every run) keeps a
//       later expiry the owner set (I-091). A re-entrant acquire by the same owner never shortens a live lease either.
//   node tools/lock.mjs doing   iphone --owner <topic> --text "<plain line>" [--for <topic/agent>] [--eta-min N] | --clear
//       acquire|renew|run take the same as --doing "<plain line>" [--for X] [--eta-min N] (I-060): what the hold is for,
//       in plain words, shown on the progress page's "Right now" (lib/hold-job.mjs; nothing personal, Hard rule 12)
//   node tools/lock.mjs doing   iphone --owner <runner> --block <ticket>|none [--between <min>]       # I-160
//       a ticketed phone block on the lease (also `acquire iphone --block <ticket>`): while it is on, Simulator sessions
//       (run|acquire chrome-measure --shared --weight simulator, or a `run` of sim.mjs session) neither join nor open a
//       shared group; they are DEFERRED (not queued, they poll on) until the runner opens a between-holds window with
//       `--between <min>` after a hold ends (a session starts only if its --max-seconds ends inside it; the window is shut
//       while the runner holds or queues for chrome-measure or runs the phone, and ends at its next exclusive hold or phone
//       run; `--between 0` ends it), or until `--block none` / the lease's end. The lease owner's own sessions are never deferred.
//   node tools/lock.mjs acquire iphone --owner <topic> --not-ready [--wait N]                    # I-155
//       queue for the phone before your part can start (pre-data read, cooling, a Mac-side gate): your entry keeps its
//       place but is never served (the next ready waiter is); QUEUED … (not ready), exit 3. Re-run within 10 min to keep
//       the place; the first acquire without --not-ready marks you ready (at the head: the lease is yours).
//   node tools/lock.mjs run iphone --owner <lease holder> -- <cmd>     # I-155: phone-side work that is no phone run
//       (xctrace thermal gate, pre-warm) under your own lease: marks the lease in use (meta.run, lockRun) while <cmd>
//       runs, so the idle alarm does not call it unused; a phone run inside it gives the marker back at its end.
//   node tools/lock.mjs release iphone --owner <topic> [--force]
//   node tools/lock.mjs release iphone --owner <holder> --by lead|mgmt-devices|mgmt-desk*|<the desk> --reason "<why>"
//       I-171: the lead or a delegate releases another owner's idle lease, audited ("lease-release" in locks/audit.log):
//       a user/user-* lease any time; any other only while the idle alarm counts it idle >= 5 min (no phone run, no Mac
//       hold, no user step) with a ready waiter queued and no phone block marked; never a process hold.
//   node tools/lock.mjs dequeue iphone --owner <topic>          # stop waiting
//   node tools/lock.mjs leave chrome-measure --owner <o> [--by <who>] [--reason "<why>"] [--json]
//       removes every waiting entry of <o> at once (exclusive, short, shared reader; process or lease; live or stale) and
//       prints each; one "queue-leave" line in locks/audit.log (by defaults to <o>). Never touches a holder or a shared
//       reader. Exit 0 also when nothing was queued (NOT QUEUED). A removed process entry whose process still runs
//       re-queues at the back on its next poll: stop that process first. (dequeue: the caller's own entries, not audited.)
//   node tools/lock.mjs run chrome-measure --owner <topic> -- <cmd> [args...]   # hold while cmd runs
//   node tools/lock.mjs run chrome-measure --owner <topic> --short --max-seconds 150 -- npm test
//   node tools/lock.mjs run chrome-measure --owner <topic> --no-timing --max-seconds 600 -- <build>   # CPU work, no host gate
//   node tools/lock.mjs acquire chrome-measure --owner <topic> --short --max-seconds 180 --wait 1800
//   node tools/lock.mjs wait chrome-measure --until free|idle|mine|held-by:<o>|released-by:<o>|'position<=N' --owner <you> [--reason "<why>"] [--for S] [--timeout 3600]
//        # pass --owner (or $FW_AGENT / $FW_LOCK_OWNER): without one it prints a NOTE and the board shows "owner unknown" (I-108)
//
// wait (run it in the background; ts-wait): blocks until the lock reaches a state, then prints ONE line and exits
// 0 MET / 3 TIMEOUT (1 usage). It only reads the lock files (polls 1 s, backing off to 10 s; each change of state
// goes to stderr): it takes no queue place and keeps none alive. To wait for your own turn use `run` or
// `acquire --wait N` (the waits that keep your place). While it runs, the status board shows it on --owner's rows
// (default $FW_LOCK_OWNER; tools/lib/waits.mjs, I-058).
//   free               no live holder (someone queued may take it at once)
//   idle               no live holder and nobody queued; with --for 120: stayed so for 120 s (a quiet window for CPU work)
//   mine               held by --owner (e.g. your background `lock.mjs run` has started)
//   held-by:<o>        held by <o>
//   released-by:<o>    <o> neither holds it nor waits for it (its hold, or its queued run, is over)
//   position<=N        --owner holds it or is #N or better in the queue (as status prints it)
// e.g.  node tools/lock.mjs wait chrome-measure --until released-by:all-wave1 --owner <you> --timeout 2h
//       node tools/lock.mjs wait chrome-measure --until idle --for 120 --owner <you> --timeout 1h
//
// --short --max-seconds N (N <= 300; default 120): the short lane for jobs like `npm test` (~35 s).
// Waits for the current holder, then is served before earlier normal waiters (queued short jobs run
// back to back, all of them, while the run fits 900 s, SHORT_DRAIN_SEC (I-020); then a normal waiter; a normal
// waiter the lead moved ahead of short jobs goes before them). The hold ends at N s: `run` kills the command (and its children), waits up to 1.5 s until they are gone (I-099), and
// exits 124; a short lease just expires (it cannot be renewed). Keep polling while you wait (`run`
// and `acquire --wait` do): a short `run` waiter's place is dropped after 60 s without a retry; an `acquire` waiter
// (short or shared too) keeps it for 10 min (I-113), and a hand-over skips it while it is not polling.
// I-106: after such a hard kill (max-seconds, or a signal past its 3 s grace; also --shared), `run` removes the throwaway
// Chrome profiles (lib/cdp.mjs tempProfileDir) its killed tree left: its command gets FW_RUN_PROFILES=<per-run list>,
// each profile made in the tree is listed there, and only a listed folder whose marker names a killed process of the
// tree, made during the run, goes ("removed N throwaway Chrome profile(s)" on stderr, profilesRemoved in holds.log).
//
// acquire exit codes: 0 = you hold it (prints the holder JSON), 3 = busy (you are queued; prints
// holder + your queue position; call acquire again later to keep your place, every <= 5 min).
// --wait N blocks up to N seconds (polling with backoff) before giving up with exit code 3.
// run: waits in the FIFO queue (as a process: killing a waiting run gives up its place), then runs the
// command with FW_LOCK_HELD=<resource>:<token>, so everything inside it (verify.mjs, fix.mjs ab, a
// probe, another `lock.mjs run`) uses this one hold instead of queueing behind it; e.g.
//   node tools/lock.mjs run chrome-measure --owner <topic> -- sh -c 'node tools/fix.mjs ab <topic> --runs 5 && node probe.mjs'
// Resources: chrome-measure (verify.mjs takes it automatically), iphone (lease, TTL default 900 s; I-123: a lease that runs
// out while its owner has a console step on the phone stays the owner's for up to 10 min more, `status` says KEPT).
//
// chrome-measure (incident I-020): measure in ONE `run` hold (servers started inside its sh -c), not a lease.
// A normal lease there defaults to --ttl 600 and can't outlive acquiredAt + 1200 s (--ttl above it is
// refused, renew is clamped). A normal `run` declares its length with --max-seconds (default 600): past
// it the command keeps running, but it warns and `status` shows OVERDUE; split long measurements into
// holds of 5-10 min. Hand-over: the waiter served next polls every ~1 s; a waiter not seen for 30 s is
// skipped at a hand-over (it keeps its place), so keep polling (`run`, `acquire --wait`). The iphone
// keeps strict FIFO (its waiters retry every 2-5 min by protocol).
// Keep awake only during measurements (I-070, user C-024; narrows I-026): a chrome-measure TIMING hold (a normal `run`,
// verify.mjs / fix.mjs ab / bench taking the lock, a normal lease) runs under a `caffeinate -i -s` assertion: -w <holder
// pid> for a process hold, -t <until expiry> for a lease (replaced on renew), ended on release; so does a --no-timing
// `run` whose command wraps a phone part (iphone.mjs scroll|record|run|gesture) or a Simulator session (sim.mjs session),
// and those tools keep themselves awake wherever they run (-w <own pid>). Never --shared or --short jobs, plain
// --no-timing holds (builds), queue or gate waits. The holder record says `awake: true`, the holds.log line `awake`, and
// `status` shows "keeping Mac awake" (with the per-process assertions). FW_NO_CAFFEINATE=1 turns it off (lib/awake.mjs).
// Every chrome-measure `run` hold (exclusive, short, no-timing, shared reader; not a re-entry) writes one JSON line to
// locks/holds.log at its end (I-056 (d)): owner, mode, weight / maxSec (shared), queuedAt (when `run` began to wait, I-167),
// acquiredAt, endedAt, durationSec and
// the exit code (124 with killed: "max-seconds" when --max-seconds stopped it, 130 with the signal when `run` was
// signalled; survivors: [pid, ...] when a process of the killed tree still ran 1.5 s after the SIGKILL, I-099;
// profilesRemoved: n when the kill left throwaway Chrome profiles that `run` removed, I-106). A timing or short hold's line also records the display on/off, FullWake/DarkWake, power source and whether a
// display-sleep-preventing assertion (caffeinate -d) was active at its start and end; it warns on stderr when no such assertion is active, the host is already asleep (display off or DarkWake) at the start, or the display / wake state changed (T8+, I-033).
// A host sleep inside a gate window makes that window not quiet; the grant's gate record carries sleptSec / woke (I-033).
// I-186: when a phone run (iphone.mjs run|scroll|record|gesture) inside an exclusive `run` hold left its thermal-profile
// ledger (lib/thermal-profile.mjs), the hold makes the phone's END read after its command (~25 s, still inside the hold),
// stamps the hold's run records (meta.profile.end, meta.profileDrift) and adds phoneProfile: [{profile, gate, start, end,
// drift, runs, stamped}] to its holds.log line. The exit code stays the command's.
// Every iphone hold or lease (a release, a process hold's end, a stale lease cleared, a repair) writes one ledger line to
// holds.log too (I-167, lib/phone-ledger.mjs): resource "iphone", ledger 1, kind, and its seconds by cause (runSec,
// coolingSec, userWaitSec, macHoldSec, macWaitSec, idleSec with idleBefore/Between/AfterSec, waitersPresentSec,
// idleWaitersSec, macWaitWaitersSec); `node tools/idle.mjs report --day` sums a day of them.
//
// DISK-LOW (I-124, lead's ruling 2026-10-04): under FW_TIMING_MIN_FREE_GB free (default 8; 0 = off) a NEW timing hold of
// chrome-measure is refused (error, its queue entry dropped) with how to free space (space.mjs prune / report, the folder
// owners). Holds already running and re-entries, shared, short and --no-timing holds and phone runs are never refused.
//
// --no-timing (run only; ts-lock-bundle): a normal hold for work that measures nothing (xcodebuild, other minutes of
// CPU) while it keeps measurements out (Hard rule 7). It waits its FIFO turn like any normal job, but skips the host
// gate (it needs no quiet host: e.g. the user works at the Mac), records no display / wake state, and shows as
// "(no-timing)" in status. Nothing timed runs inside it: a nested verify.mjs / fix.mjs ab / bench / normal `run`
// refuses to start (exit 1, "no-timing hold"), and every timing waiter after it passes the gate on a fresh window. Phone
// runs (iphone.mjs run|scroll|record|gesture) refuse during someone else's no-timing hold, but run inside their own (the
// command of this `run`, or the same owner; I-056): the phone stamps its own frames, and the hold keeps the Mac quiet
// while it records the phone's screen and drives it. Short jobs and nested --no-timing runs may run inside it; a
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
// "queue-move" line to locks/audit.log. Only waiting entries move (never the holder); only --by lead, or (I-171) a
// delegate: mgmt-devices, mgmt-desk*, or the agent `console.mjs thread desk set` names. A delegate's move stays inside
// the board's priority order: it never puts an entry ahead of a user step (user, user-*), a queued timing hold (except
// the iphone holder's --no-timing hold, as I-172 does), the lead's move or an owner ranked higher on the board
// (status.mjs priority); refused, dry run included. The
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
//
// Shared lane (ts-lock-share, research/architecture/lock-shared-lane.md): jobs that only confirm functionality (npm test,
// headless checks, DOM probes, bench mech, a Simulator mechanism session) run in parallel with each other, never beside
// an exclusive (timing) hold:
//   node tools/lock.mjs run chrome-measure --shared --max-seconds 480 --weight npm-test --owner <you> -- npm test
//   node tools/lock.mjs acquire chrome-measure --shared --max-seconds 480 --weight npm-test --owner <you> --wait 1800   # the commit hook's npm test
//   node tools/lock.mjs acquire chrome-measure --shared --max-seconds 240 --owner <you> --wait 1800   # a lease reader
//   node tools/lock.mjs release chrome-measure --shared --owner <you>
//   node tools/lock.mjs shared on|off chrome-measure --by lead --reason "<why>" [--cap N] [--join-load L] [--join-busy P]   # the lead's switch
// --max-seconds N (1..300) is required, 1..480 for --weight npm-test (I-114: the suite takes ~250 s; only by that name,
// a plain --weight 2 keeps 300, and the switch-off --short stand-in keeps the 480); --weight is 1..4 or a job name
// (check, probe, bench-mech, test-chrome-fn 1; npm-test 2; simulator 3); the readers' weights fit the switch's --cap (default 3, max 6 since I-136). A reader joins the running
// group while it fits, CPU busy over its own polls <= --join-busy (default 75 %; before its first busy sample load1 <=
// --join-load, default 2x the cpu count; I-051) and no exclusive waiter is queued ahead of it (writer preference; I-136:
// a reader queued ahead of every exclusive waiter joins; readers queued before the group opened may still join for 30 s).
// A --no-timing run of the iphone holder (a phone part's quiet-Mac hold) queues ahead of every non-phone waiter, timing
// holds and readers included, never past a user step (user, user-*) or a hand-made move (I-172; I-136 passed only the
// readers that queued after the lease began); status shows it "moved by phone-block priority". `run --shared` kills its command at --max-seconds like --short (exit 124) and
// gives it FW_LOCK_SHARED=<resource>:<reader token>: a nested shared run re-enters that slot, a nested exclusive one
// (verify.mjs, fix.mjs ab, bench gain, a normal or --short run) is refused at once. Timing tools refuse --shared.
// The lane is OFF unless the lead switched it on; while off, --shared runs as an exclusive --short job (same
// --max-seconds; a notice on stderr) whose command gets FW_LOCK_SHARED too, so nothing timed starts inside it. `status` shows the group, its readers and the switch.
import { spawn } from 'node:child_process';
import { psTable, descendants, treeState, waitTreeGone } from './lib/proc-tree.mjs'; // I-024, I-099: the command's tree, and the wait until it is gone
import { graceText } from './lib/phone-step.mjs';
import { tryAcquire, acquire, release, renew, dequeue, status, allStatus, staleReason, heldEnv, RESOURCES, GATED, gateSample, NEXT_POLL_MS, LEASE_POLICY, holdsLogFile, SHARED_LANE, sharedMaxSec, sharedSwitch, setSharedSwitch, isGroup, cpuTimes, cpuBusyPct, handoverText } from './lib/lock.mjs';
import { sample, describe, THRESHOLDS, hostPower, hostStateSummary } from './lib/host.mjs';
import { appendFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { RUN_PROFILES_ENV, removeRunProfiles } from './lib/cdp.mjs'; // I-106: throwaway profiles a hard kill left
import { doctor, repair, moveWaiter, leaveQueue, releaseIdleLease, auditFile } from './lib/lock-repair.mjs';
import { keepAwake, stopAwake, wrapsMeasurement, holdAwake, awakeProcesses } from './lib/awake.mjs';
import { wrapsPhoneRun } from './lib/disk.mjs';
import { pollUntil, parseSec, parseLockCondition, lockConditionMet, lockConditionText, lockHoldSec, EXIT as WAIT_EXIT } from './lib/wait.mjs';
import { startWait, waitOwner, UNKNOWN, NO_OWNER_NOTE } from './lib/waits.mjs'; // I-058: live wait records for the status board
import { describeHold, isUserOwner } from './lib/lock.mjs';
import { warmLine, warmSummary } from './lib/sim-warm.mjs';
import { parseJob } from './lib/hold-job.mjs'; // I-060: what a hold is for
import { resolveLanUrl } from './lib/lan.mjs';
import { lowSpaceWarning } from './lib/space.mjs'; // I-095: free-space warning in status
import { fileURLToPath } from 'node:url';
import { runMain } from './lib/exit.mjs'; // I-117: exit once stdout has flushed (status --json past 64 KB)
import { exitOnHelp } from './lib/help.mjs';

exitOnHelp(import.meta.url); // I-152 N10: --help prints the header above and exits before anything runs
const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const own = dd >= 0 ? argv.slice(0, dd) : argv;
const rest = dd >= 0 ? argv.slice(dd + 1) : [];
const opt = (n, d) => { const i = own.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = own[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : own[i + 1]; };
const flag = (n) => own.includes(`--${n}`);
const VALUED = ['--owner', '--ttl', '--wait', '--url', '--note', '--timeout', '--max-seconds', '--by', '--reason', '--guard-age', '--move', '--to', '--until', '--for', '--weight', '--cap', '--join-load', '--join-busy', '--doing', '--text', '--eta-min', '--block', '--between'];
const pos = own.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(own[i - 1])));
// `shared on|off <resource>` has one more word
const [cmd, resource] = pos[0] === 'shared' ? [pos[0], pos[2]] : pos;
const owner = opt('owner', process.env.FW_LOCK_OWNER);
const short = flag('short');
const noTiming = flag('no-timing'); // ts-lock-bundle: a normal run that measures nothing (builds, CPU work): no host gate, never hosts a timing run
const shared = flag('shared') && cmd !== 'shared';
const maxSec = short ? Number(opt('max-seconds', 120)) : shared ? Number(opt('max-seconds')) : undefined;
const weightOpt = opt('weight', '1');
const weight = /^\d+$/.test(weightOpt) ? Number(weightOpt) : SHARED_LANE.weights[weightOpt] ?? NaN;
// I-114: a job name brings its --max-seconds bound too (npm-test: 480); a plain number is any job (300)
const job = !/^\d+$/.test(weightOpt) && Object.hasOwn(SHARED_LANE.weights, weightOpt) ? weightOpt : undefined;
const sh = (w) => (w.shared ? '' : w.short ? ` (short, max ${w.maxSec} s)` : w.noTiming ? ' (no-timing)' : '');
const OFF_NOTICE = (r) => `[lock ${r}] the shared lane is off: running as an exclusive --short job (same --max-seconds); the lead switches it on (lock.mjs shared on ${r})`;
const NORMAL_HOLD_SEC = 600; // a normal chrome-measure hold should end within ~10 min (I-020); `run --max-seconds` declares another length
// a bounded run's tree gets this long after SIGTERM (at --max-seconds, or a signal to the run) before the SIGKILL (I-024);
// it stays inside a reader's recorded deadline grace (SHARED_LANE.killGraceSec, 5 s)
const KILL_GRACE_MS = 3000;
// I-099: after the SIGKILL, a bounded run waits up to this long until every process of the killed tree is gone (or a
// zombie this process reaps) before it releases and exits; grace + this (4.5 s) stays inside killGraceSec (5 s).
// A process still running at the bound is named on stderr and in the holds.log line (`survivors`).
const TREE_GONE_MS = 1500;
// a normal hold that declared its length (`run --max-seconds`, I-020) and passed it
const overdue = (h) => (!h.short && h.meta && h.meta.expectSec && Date.now() > Date.parse(h.acquiredAt) + h.meta.expectSec * 1000 ? ` OVERDUE (past its ${h.meta.expectSec} s; split long measurements into holds of 5-10 min, I-020)` : '');

function fmt(s) {
  const h = s.holder, pad = ' '.repeat(16);
  let line = `${s.resource.padEnd(15)} `;
  if (!h) line += s.next ? `free, ${handoverText(s.handover || { to: s.next })}` : 'free'; // I-051: and why it waits
  else if (isGroup(h) && Array.isArray(h.readers)) {
    // a shared group (ts-lock-share): its readers hold it together
    const used = h.readers.reduce((a, x) => a + (x.weight || 1), 0), n = h.readers.length;
    const writer = s.queue.find((w) => !w.shared);
    line += `${s.stale ? 'STALE (' + s.stale + ') ' : ''}shared by ${n} reader${n === 1 ? '' : 's'} (weight ${used}/${sharedSwitch(s.resource).cap})${writer ? `, joins closed: "${writer.owner}" waits for an exclusive hold` : ''} since ${h.acquiredAt} until ${h.expiresAt}`;
    for (const x of h.readers) line += `\n${pad}reader ${x.owner} (w${x.weight}, ${x.kind === 'process' ? `pid ${x.pid}` : 'lease'}, until ${x.deadline}) checkout ${x.checkout}${x.meta && Object.keys(x.meta).length ? ' ' + JSON.stringify(x.meta) : ''}`;
    if (h.format !== 'rw1') line += `\n${pad}format "${h.format}": unknown to this lock code (it waits as for an exclusive holder)`;
  }
  else line += `${s.stale ? 'STALE (' + s.stale + ') ' : ''}held by "${h.owner}"${sh(h)} [${h.kind}${h.pid ? ' pid ' + h.pid : ''}] since ${h.acquiredAt}${h.expiresAt ? ' until ' + h.expiresAt : ''}${overdue(h)}${awakeText(s)}\n${pad}checkout ${h.checkout}${h.meta && Object.keys(h.meta).length ? '\n' + pad + JSON.stringify(h.meta) : ''}`;
  if (s.grace) line += `\n${pad}KEPT: ${graceText(s.grace)}`; // I-123: not handed over in the middle of the user's step
  if (s.queue.length) line += `\n${pad}queue: ${fmtQueue(s.queue)}`;
  if (s.deferred?.length) line += `\n${pad}deferred by a phone block (I-160; not queued, they poll on): ${s.deferred.map((w) => `${w.owner} (since ${w.since})`).join(', ')}`;
  // the lane's line only while it is in use (review-lock-share N1: with the switch off and nothing shared, status reads as on main)
  if (laneInUse(s)) { const sw = sharedSwitch(s.resource); line += `\n${pad}shared lane: ${laneText(sw)}`; }
  if (s.resource === 'simulator') { const w = warmLine(); if (w) line += `\n${pad}${w}`; } // I-063: the booted, idle fw-sim and its keeper
  return line;
}
// I-070: a measurement hold's sleep assertion (caffeinate pid), or that it asked for one and none runs (off / no binary)
const awakeText = (s) => {
  if (!s.holder?.awake || s.stale) return '';
  const a = holdAwake(s.resource, s.holder);
  return a ? `, keeping Mac awake (caffeinate pid ${a.pid})` : ', a measurement hold, but no caffeinate runs (FW_NO_CAFFEINATE, no binary, or not macOS)';
};
const awakeLines = (list) => list.map((a) => `awake: keeping Mac awake for ${a.what} (pid ${a.pid}, caffeinate pid ${a.caffeinate}) since ${a.since}`);
const laneText = (sw) => (sw.enabled ? `on (cap ${sw.cap}${sw.joinLoad ? `, join load ${sw.joinLoad}` : ''}${sw.joinBusy ? `, join busy ${sw.joinBusy} %` : ''})` : 'off');
const laneInUse = (s) => !!GATED[s.resource] && (sharedSwitch(s.resource).enabled || isGroup(s.holder) || !!s.holder?.functional || s.queue.some((w) => w.shared || w.functional));
const moved = (w) => (w.movedBy ? `, moved by ${w.movedBy}` : '');
const fmtQueue = (q) => q.map((w, i) => `${i + 1}. ${w.owner}${w.notReady ? ' [not ready, I-155]' : ''}${w.shared ? ` (shared w${w.weight}, max ${w.maxSec} s, since ${w.since}${moved(w)})` : w.short ? ` (short, max ${w.maxSec} s, since ${w.since}${moved(w)})` : ` (${w.noTiming ? 'no-timing, ' : ''}since ${w.since}${moved(w)})`}`).join(', ');

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
    const procs = awakeProcesses(); // I-070: phone parts and Sim sessions keeping the Mac awake themselves
    // review-i063: the simulator entry carries the warm device (simWarm: lib/sim-warm.mjs warmSummary) when there is one
    const withWarm = (s) => { const w = s.resource === 'simulator' ? warmSummary() : null; return w ? { ...s, simWarm: w } : s; };
    // I-095: a WARNING line when the disk holding the repo has under 10 GB free ($FW_SPACE_WARN_GB); stderr with --json
    const space = lowSpaceWarning(fileURLToPath(new URL('..', import.meta.url))); // the disk of this checkout (statfs, no spawn)
    if (flag('json')) { console.log(JSON.stringify(list.map((s) => withWarm(GATED[s.resource] ? { ...s, ...(host ? { host } : {}), ...(laneInUse(s) ? { sharedLane: sharedSwitch(s.resource) } : {}), awake: s.holder && !s.stale ? holdAwake(s.resource, s.holder) : null, awakeProcesses: procs } : s)), null, 1)); if (space) console.error(space); return 0; }
    for (const s of list) console.log(fmt(s));
    if (!resource || GATED[resource]) for (const l of awakeLines(procs)) console.log(l);
    if (host) console.log(hostLine(host, list));
    if (space) console.log(space);
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
      if (opt('to') === undefined) throw new Error('usage: node tools/lock.mjs repair <resource> --move <owner> --to <position> --by lead|<delegate> --reason "<why>" [--apply]');
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
  if (cmd === 'shared') {
    // the lead's switch for the shared lane (audited in locks/audit.log)
    const onOff = pos[1];
    if (!['on', 'off'].includes(onOff) || !resource) throw new Error('usage: node tools/lock.mjs shared on|off <resource> --by lead --reason "<why>" [--cap N] [--join-load L] [--join-busy P]');
    const num = (k) => (opt(k) === undefined ? undefined : Number(opt(k)));
    const sw = await setSharedSwitch(resource, { on: onOff === 'on', by: opt('by'), reason: opt('reason'), cap: num('cap'), joinLoad: num('join-load'), joinBusy: num('join-busy') });
    console.log(`SHARED LANE ${resource}: ${laneText(sw)}, by "${opt('by')}", logged to ${auditFile()}${sw.enabled ? '' : ' (readers already in a group finish; new --shared jobs run as exclusive --short jobs)'}`);
    return 0;
  }
  if (!resource) throw new Error(`usage: node tools/lock.mjs ${cmd} <resource> --owner <name>`);
  if (cmd === 'wait') return waitCmd();
  if (shared) {
    if (!['acquire', 'run', 'release', 'dequeue'].includes(cmd)) throw new Error(`--shared is for run, acquire, release and dequeue (not ${cmd})`);
    if (short) throw new Error('--shared and --short do not combine: a shared job is bounded by its --max-seconds already');
    if (noTiming) throw new Error('--shared and --no-timing do not combine: a shared job is a bounded functional reader already; a build that needs the Mac alone is --no-timing');
    if (cmd !== 'release' && cmd !== 'dequeue' && opt('max-seconds') === undefined) throw new Error(`--shared needs --max-seconds N (1..${sharedMaxSec(job)}${sharedMaxSec(job) !== SHARED_LANE.maxSec ? ` for ${job}` : ''}): a shared job is bounded`);
    if (cmd !== 'release' && cmd !== 'dequeue' && Number.isNaN(weight)) throw new Error(`--weight must be 1..${SHARED_LANE.maxWeight} or a job name (${Object.entries(SHARED_LANE.weights).map(([k, v]) => `${k} ${v}`).join(', ')}), got "${weightOpt}"`);
  }
  if (!owner && cmd !== 'release') throw new Error('--owner <name> is required (use your fix topic)');
  if (noTiming && cmd !== 'run') throw new Error('--no-timing is for lock.mjs run (a normal hold that measures nothing: builds, CPU work)');
  const meta = {};
  if (opt('url')) { meta.url = opt('url'); if (cmd === 'acquire') resolveLanUrl(meta.url); } // a `lan` placeholder must resolve now (I-073)
  if (opt('note')) meta.note = opt('note');
  // I-060: --doing "<plain line>" [--for X] [--eta-min N]; checked before anything is written
  const jobOf = (text) => parseJob({ text, forWhom: opt('for'), etaMin: opt('eta-min') });
  const jobLine = (j) => {
    const extra = [j.for ? `for ${j.for}` : null, j.etaAt ? `about ${Math.max(0, Math.round((Date.parse(j.etaAt) - Date.now()) / 60000))} min left` : null].filter(Boolean);
    return `${j.text}${extra.length ? ` (${extra.join('; ')})` : ''}`;
  };
  if (['acquire', 'run', 'renew'].includes(cmd) && opt('doing') !== undefined) meta.job = jobOf(opt('doing'));
  // I-160: the phone block marks (iphone only): --block <ticket|none>, --between <min> (0 ends the window)
  const blockOpt = opt('block'), betweenOpt = opt('between');
  const blockArg = blockOpt === undefined ? undefined : blockOpt === 'none' ? null : blockOpt;
  const betweenMin = betweenOpt === undefined ? undefined : Number(betweenOpt);
  const marks = { ...(blockArg !== undefined ? { block: blockArg } : {}), ...(betweenMin !== undefined ? { betweenMin } : {}) };
  const marked = Object.keys(marks).length > 0;
  if (marked && !['doing', 'acquire'].includes(cmd)) throw new Error('--block and --between are for lock.mjs doing iphone (and --block for acquire iphone)');
  if (marked && resource !== 'iphone') throw new Error(`--block and --between mark a phone block on the iphone lease (not ${resource})`);
  if (cmd === 'acquire' && betweenMin !== undefined) throw new Error('--between is for lock.mjs doing iphone, after a hold of the block ends');
  const markLine = (h) => {
    const b = h?.meta?.block, w = h?.meta?.between;
    return b ? `; phone block ${b.id}${w ? `, between holds until ${w.until} (Simulator sessions that fit may start; I-160)` : ', no between-holds window (Simulator sessions wait; I-160)'}` : '';
  };
  if (cmd === 'doing') {
    if (flag('clear')) { await describeHold(resource, { owner, job: null }); console.log(`CLEARED ${resource} "${owner}": no job description`); return 0; }
    if (opt('text') === undefined && !marked) throw new Error(`usage: node tools/lock.mjs doing ${resource} --owner <you> --text "<plain line>" [--for <topic/agent>] [--eta-min N] | --clear; iphone also [--block <ticket>|none] [--between <min>] (I-160)`);
    const job = opt('text') === undefined ? undefined : jobOf(opt('text'));
    const h = await describeHold(resource, { owner, job, ...marks });
    console.log(`DOING ${resource} "${owner}": ${job ? jobLine(job) : h.meta?.job ? jobLine(h.meta.job) : '(no job description)'}${markLine(h)}`);
    return 0;
  }
  // I-155: --not-ready (acquire iphone): queue without being served yet
  const notReady = flag('not-ready');
  if (notReady && (cmd !== 'acquire' || resource !== 'iphone')) throw new Error('--not-ready is for lock.mjs acquire iphone (queue for the phone before your part can start; I-155)');
  if (notReady && blockArg !== undefined) throw new Error('--not-ready and --block do not combine: mark the block once the lease is yours');
  if (cmd === 'acquire') {
    const ttlSec = Number(opt('ttl', resource === 'iphone' ? 900 : 0)) || undefined;
    const waitSec = Number(opt('wait', 0));
    // gated resource, normal lease: pass the latest host reading; when it is our turn, measure one window and retry
    let host = GATED[resource] && !short && !shared ? { quiet: null, reasons: ['not measured yet'] } : undefined;
    // N7: FW_LOCK_SHARED from an enclosing slot (a `run --shared` command): a shared lease re-enters it, an exclusive
    // one is refused, as in acquire()
    const sx = { ...(shared ? { shared, weight, job } : {}), ...(notReady ? { notReady } : {}), sharedHeld: process.env.FW_LOCK_SHARED };
    // I-051: a shared waiter measures CPU busy over its own polls; the join check uses it once it has one
    let cpuBase = shared ? { at: Date.now(), t: cpuTimes() } : null;
    const attempt = async () => {
      if (cpuBase && Date.now() - cpuBase.at >= SHARED_LANE.busyWindowMs) {
        const t = cpuTimes(), b = cpuBusyPct(cpuBase.t, t);
        if (b !== null) sx.busyPct = b;
        cpuBase = { at: Date.now(), t };
      }
      let r = await tryAcquire(resource, { owner, kind: 'lease', ttlSec, meta, short, maxSec, host, ...sx });
      if (r.gated) { host = await gateSample(); r = await tryAcquire(resource, { owner, kind: 'lease', ttlSec, meta, short, maxSec, host, ...sx }); }
      else if (host) host = { quiet: null, reasons: ['not measured yet'] };
      return r;
    };
    let res = await attempt();
    const t0 = Date.now();
    let pause = short || shared ? 1000 : 5000;
    while (!res.ok && (Date.now() - t0) / 1000 < waitSec) {
      // the waiter served next polls fast (I-020); others back off to 15 s, well inside the 30 s a waiter may go unseen before a hand-over skips it
      if (!res.gated) await new Promise((r) => setTimeout(r, Math.min(res.next === owner ? NEXT_POLL_MS : pause, waitSec * 1000 - (Date.now() - t0) + 10)));
      pause = Math.min(short || shared ? 3000 : 15000, pause * 1.5);
      res = await attempt();
    }
    if (res.ok && !res.inherited) keepAwake(resource, res.holder); // a timing lease (holder.awake) keeps the Mac awake until it expires or is released (I-070)
    if (res.ok && res.reader) {
      const x = res.reader;
      console.log(`ACQUIRED ${resource} for "${owner}" (shared, weight ${x.weight}, max ${x.maxSec} s) until ${x.deadline}${res.reentrant ? ' (already held: the same reader)' : ''}; leave with: node tools/lock.mjs release ${resource} --shared --owner ${owner}`);
      console.log(JSON.stringify(x, null, 1));
      return 0;
    }
    if (res.ok && shared && res.mode === 'short') console.error(OFF_NOTICE(resource));
    if (res.ok && blockArg !== undefined) res.holder = await describeHold(resource, { owner, block: blockArg }); // I-160
    if (res.ok) { console.log(`ACQUIRED ${resource} for "${owner}"${res.holder.expiresAt ? ' until ' + res.holder.expiresAt : ''}${res.reentrant ? ' (renewed)' : ''}${sh(res.holder)}${res.holder.gateTimeout ? ' after a host-gate TIMEOUT: the host was not quiet, measurements in this hold are contaminated' : ''}`); console.log(JSON.stringify(res.holder, null, 1)); return 0; }
    if (res.notReady) { console.log(`QUEUED ${resource} (not ready): you ("${owner}") are #${res.position} in the queue and keep the place, but a hand-over serves the next ready waiter (I-155). Run acquire again within 10 min to keep it; without --not-ready when your part can start.`); return 3; }
    if (res.deferred) { console.log(`DEFERRED ${resource}: ${res.why}. You ("${owner}") are not queued while deferred; run acquire again (or --wait) to retry.`); return 3; }
    const hh = res.holder;
    const who = hh ? (isGroup(hh) ? `shared by ${(hh.readers || []).map((x) => `"${x.owner}"`).join(', ')} until ${hh.expiresAt}` : `held by "${hh.owner}" since ${hh.acquiredAt}${hh.expiresAt ? ' until ' + hh.expiresAt : ''}`)
      : res.gated ? `free, but the host is not quiet (${res.gate.reasons.join(', ')}; waiting since ${res.gate.since}, granted anyway after ${THRESHOLDS.gateMaxWaitSec} s)` : `free, but "${res.next}" is next`;
    console.log(`BUSY ${resource}: ${who}${res.why ? ` (${res.why})` : ''}. You ("${owner}") are #${res.position} in the queue; run acquire again within 10 min to keep your place (a hand-over serves waiters that keep polling, e.g. with --wait; one not seen for 30 s is skipped but keeps its place).`);
    return 3;
  }
  if (cmd === 'renew') { const ttlSec = Number(opt('ttl', 900)), h = await renew(resource, { owner, ttlSec, noShorten: flag('no-shorten') }); keepAwake(resource, h); if (meta.job) await describeHold(resource, { owner, job: meta.job }); console.log(`RENEWED ${resource} for "${owner}" until ${h.expiresAt}${h.kept ? ` (kept: already held longer than --ttl ${ttlSec} s)` : ''}${h.capped ? ` (capped: a ${resource} lease ends by acquiredAt + ${LEASE_POLICY[resource].maxHoldSec} s; measure inside one lock.mjs run hold, I-020)` : ''}`); return 0; }
  if (cmd === 'release') {
    if (opt('by') !== undefined && opt('by') !== owner && !shared && !flag('force')) {
      // I-171: the lead or a delegate releases another owner's idle iphone lease, audited
      const x = await releaseIdleLease(resource, { owner, by: opt('by'), reason: opt('reason') });
      stopAwake(resource, x.released.token);
      console.log(`RELEASED ${resource} (was "${x.released.owner}"${isUserOwner(x.released.owner) ? ', the user\'s hand test' : `, idle ${x.idleMin} min with waiters`}; by "${opt('by')}"), logged to ${auditFile()}`);
      return 0;
    }
    const h = await release(resource, { owner, force: flag('force'), shared });
    if (h?.sharedReader) { console.log(`RELEASED ${resource} (shared reader "${h.owner}"${h.closed ? '; the group closed' : ''})`); return 0; }
    if (h) stopAwake(resource, h.token);
    console.log(h ? `RELEASED ${resource} (was "${h.owner}"${staleReason(h) ? ', stale' : ''})` : `${resource} was not held`);
    return 0;
  }
  if (cmd === 'dequeue') {
    // --shared: only the owner's lease-reader entries; without it: only its exclusive entries (B3: a process reader's
    // entry belongs to its process, which drops it when it stops waiting)
    const q = await dequeue(resource, owner, shared ? (w) => !!(w.shared || w.functional) && w.kind !== 'process' : (w) => !w.shared);
    console.log(`left the ${resource} queue; ${q.length} waiting`);
    return 0;
  }
  if (cmd === 'leave') {
    // every waiting entry of --owner (any kind, live or stale), audited; never a holder (lib/lock-repair.mjs leaveQueue)
    const by = opt('by') || owner;
    const x = await leaveQueue(resource, { owner, by, reason: opt('reason') });
    if (flag('json')) { console.log(JSON.stringify(x, null, 1)); return 0; }
    const holdNote = x.holds ? `; it holds ${resource}, which leave never touches (release it: node tools/lock.mjs release ${resource}${isGroup(x.holder) ? ' --shared' : ''} --owner ${owner}${isGroup(x.holder) ? ', or a process reader ends with its process' : ''})` : '';
    if (!x.removed.length) { console.log(`NOT QUEUED ${resource}: "${owner}" has no waiting entry${holdNote || ` (queue: ${x.after.map((w) => w.owner).join(', ') || 'empty'})`}`); return 0; }
    console.log(`LEFT ${resource}: removed ${x.removed.length} waiting entr${x.removed.length === 1 ? 'y' : 'ies'} of "${owner}" (by "${by}"), logged to ${auditFile()}`);
    for (const { entry: w, position, running } of x.removed) {
      const kind = [w.shared ? `shared w${w.weight || 1}` : w.short ? `short, max ${w.maxSec} s` : w.noTiming ? 'no-timing' : null, w.kind === 'process' ? `process pid ${w.pid}` : 'lease', `since ${w.since}`].filter(Boolean).join(', ');
      console.log(`  - ${position ? `#${position}` : '(stale)'} "${w.owner}" (${kind})${running ? `: its process still runs and re-queues at the back on its next poll; stop it (kill ${w.pid})` : ''}`);
    }
    console.log(`  holder: ${x.holder ? `${isGroup(x.holder) ? `the shared group (${(x.holder.readers || []).map((r) => `"${r.owner}"`).join(', ')})` : `"${x.holder.owner}"${sh(x.holder)}`} (not touched)` : 'none'}`);
    console.log(`  queue now: ${fmtQueue(x.after) || 'empty'}`);
    return 0;
  }
  if (cmd === 'run') {
    if (!rest.length) throw new Error('usage: node tools/lock.mjs run <resource> --owner X -- <cmd> [args]');
    // a normal hold declares its length (I-020): --max-seconds, default NORMAL_HOLD_SEC on chrome-measure; past it the
    // command keeps running (a measurement is never killed), but it warns and `status` shows the hold OVERDUE
    const expectSec = !short && !shared && (opt('max-seconds') !== undefined || LEASE_POLICY[resource]) ? Number(opt('max-seconds', NORMAL_HOLD_SEC)) : undefined;
    if (expectSec !== undefined) { if (!(expectSec > 0)) throw new Error(`--max-seconds must be a number of seconds > 0 (got ${opt('max-seconds')})`); meta.expectSec = expectSec; }
    // I-070: a --no-timing hold is a measurement (keeps the Mac awake) only when its command wraps a phone part or a Sim session
    const awake = noTiming && wrapsMeasurement(rest) ? true : undefined;
    if (wrapsPhoneRun(rest)) meta.phoneRun = true; // I-124: a phone run is never refused for disk space (lead's ruling)
    // I-160: a Simulator session (--weight simulator, or a command that runs sim.mjs session) waits out a phone block
    const sim = shared && (job === 'simulator' || /\bsim\.mjs['"]?\s+session\b/.test(rest.join(' ')));
    const queuedAt = new Date().toISOString(); // I-167: the phone ledger counts the iphone holder's Mac wait from here
    const { release: rel, holder, reader, reentrant, mode, env: lockEnv } = await acquire(resource, { owner, kind: 'process', meta, short, maxSec, noTiming, awake, ...(shared ? { shared, weight, job, sim } : {}), timeoutSec: Number(opt('timeout', 3600)) });
    if (shared && mode === 'short') console.error(OFF_NOTICE(resource));
    // a shared run (or its off-mode stand-in, an exclusive short) is bounded like a short one: killed at --max-seconds
    const bounded = short || shared;
    // what the command needs to re-enter this hold: a reader's FW_LOCK_SHARED (never FW_LOCK_HELD, B1), an exclusive
    // hold's FW_LOCK_HELD (acquire() returns it, also for a re-entered hold or slot)
    // I-106: a bounded run hard-kills its tree (SIGKILL at --max-seconds + 3 s, or after a signal's grace), which no
    // throwaway Chrome profile cleanup in the tree survives. Its command gets a per-run list ($FW_RUN_PROFILES, under
    // locks/run-profiles/) where lib/cdp.mjs records each throwaway profile the tree creates; after the kill, the run
    // removes those whose marker names a killed process of its tree. A nested bounded run keeps the outer list.
    const ownList = bounded && !process.env[RUN_PROFILES_ENV] ? join(dirname(holdsLogFile()), 'run-profiles', `${process.pid}-${randomBytes(4).toString('hex')}.list`) : null;
    if (ownList) { try { mkdirSync(dirname(ownList), { recursive: true }); writeFileSync(ownList, ''); } catch {} }
    const profileList = ownList || (bounded ? process.env[RUN_PROFILES_ENV] : null);
    const runStart = Date.now();
    const childEnv = { ...lockEnv, ...(ownList && { [RUN_PROFILES_ENV]: ownList }) };
    // T8+ (I-033): a chrome-measure hold records the display / wake state and whether a display-sleep-preventing assertion
    // was active at its start and end (one JSON line per hold in locks/holds.log); a hold without one, or one in
    // which the display or wake state changed, warns on stderr (U1: display on ~76 fps vs DarkWake ~93 fps).
    // A no-timing hold and a shared reader measure nothing: no display / wake record
    const powerStart = GATED[resource] && !reentrant && !noTiming && mode !== 'shared' ? await hostPower() : null;
    if (powerStart && powerStart.displaySleepPrevented === false) console.error(`[lock ${resource}] no display-sleep assertion is active (pmset -g assertions: PreventUserIdleDisplaySleep 0): the display may sleep during this hold and change what it measures (T8+, I-033)`);
    // review-host-state N1: an assertion (caffeinate -d) keeps a lit display lit, it does not light a dark one or end DarkWake
    if (powerStart && (powerStart.display === 'off' || powerStart.fullWake === false)) console.error(`[lock ${resource}] the host is not awake at the start of this hold (${[powerStart.display === 'off' ? 'display off' : null, powerStart.fullWake === false ? 'DarkWake' : null].filter(Boolean).join(', ')}): a display-sleep assertion does not wake it; what this hold measures may not compare with an awake host (T8+, I-033)`);
    // a short job runs in its own process group, so reaching --max-seconds stops the whole tree (npm test -> node --test -> ...);
    // FW_LOCK_HELD: the command's own verify.mjs / fix.mjs ab / nested run re-enter this hold instead of queueing behind it
    const child = spawn(rest[0], rest.slice(1), { stdio: 'inherit', detached: bounded, env: { ...process.env, ...childEnv } });
    // I-155: a `run iphone` under the owner's lease is phone-side work (thermal gate, pre-warm): the lease is in use while it
    // runs (meta.run, lockRun: it keeps a between-holds window; the idle alarm reads it as use)
    const runMark = resource === 'iphone' && child.pid
      ? describeHold('iphone', { owner, run: { text: String(opt('doing') ?? rest.join(' ')).slice(0, 120), since: new Date().toISOString(), pid: child.pid, lockRun: true } }).then(() => true, () => false)
      : null;
    // I-024: a short job's tree can leave the command's group (a nested `run --short` detaches its own
    // command), and orphans lose their parent link once the command exits. So every kill also signals each
    // descendant seen so far (pid + its group, re-checked by pgid against pid reuse), not only the group.
    let seen = new Map();
    // tests only (I-099): the SIGKILL to a process outside the command's own group lands this many ms late, as a kill
    // not yet delivered would; confirmGone() delivers it when it is due
    const killDelayMs = Number(process.env.FW_LOCK_TEST_KILL_DELAY_MS) || 0;
    let deferred = null; // { at, targets: Map pid -> pgid }
    const signalOne = (p, g, own, sig) => {
      if (g !== own && g !== child.pid) { try { process.kill(-g, sig); } catch {} }
      try { process.kill(p, sig); } catch {}
    };
    const killTree = (sig) => {
      const rows = psTable(), own = rows.find(([p]) => p === process.pid)?.[2];
      for (const [p, g] of descendants(rows, child.pid)) seen.set(p, g);
      const live = new Map(rows.map(([p, , g]) => [p, g]));
      try { process.kill(-child.pid, sig); } catch {}
      for (const [p, g] of seen) {
        if (live.get(p) !== g) continue; // gone (or the pid was reused)
        if (sig === 'SIGKILL' && killDelayMs && g !== child.pid) { deferred ||= { at: Date.now() + killDelayMs, own, targets: new Map() }; deferred.targets.set(p, g); continue; }
        signalOne(p, g, own, sig);
      }
    };
    const kill = (sig) => { try { if (bounded) killTree(sig); else child.kill(sig); } catch {} };
    const deliverDeferred = () => {
      if (!deferred || Date.now() < deferred.at) return;
      for (const [p, g] of deferred.targets) signalOne(p, g, deferred.own, 'SIGKILL');
      deferred = null;
    };
    // I-099: after the hard kill, wait (synchronously, at most TREE_GONE_MS) until every process of the killed tree is
    // gone, so the lock is never released beside a dying process; what still runs at the bound is reported on stderr
    // and returned for the holds.log line ({ survivors: [pid, ...] })
    const confirmGone = () => {
      const r = waitTreeGone(() => treeState(psTable(), child.pid, seen), { boundMs: TREE_GONE_MS, onPoll: deliverDeferred });
      if (r.gone || !r.alive.length) return {};
      console.error(`[lock ${resource}] ${r.alive.length} process${r.alive.length === 1 ? '' : 'es'} of the command's tree still ran ${TREE_GONE_MS} ms after the SIGKILL (pid ${r.alive.join(', ')}); releasing the lock anyway (I-099)`);
      return { survivors: r.alive };
    };
    // acquire() releases the lock and exits on these signals; stop the command first, or it would keep
    // running (e.g. a throttled measurement) after the lock was handed to the next waiter.
    // a bounded (short or shared) job then gets SIGKILL too, after its grace (graceKill below): acquire()'s handler releases the lock and exits right after this
    // I-056 (d): every own chrome-measure hold of a `run` (exclusive, short, no-timing, a shared reader; not a re-entry,
    // whose outer hold logs) writes one holds.log line at its end: owner, mode, weight, start, end, duration, exit code
    // (124 on the max-seconds kill, 130 on a signal), so shared failures and no-timing holds can be audited too
    const logged = !!GATED[resource] && !reentrant;
    const holdStart = mode === 'shared' ? reader.acquiredAt : holder.acquiredAt;
    const logHold = (end, rec) => {
      if (!logged) return;
      const line = { at: new Date().toISOString(), resource, owner, short: !!short || mode === 'short', mode, ...(noTiming ? { noTiming: true } : {}), ...(shared ? { functional: true, weight: reader?.weight ?? weight, maxSec } : {}),
        awake: mode !== 'shared' && !!holder?.awake, // I-070: this hold kept the Mac awake (a measurement hold)
        queuedAt, acquiredAt: holdStart, endedAt: new Date(end).toISOString(), durationSec: Math.round((end - Date.parse(holdStart)) / 100) / 10, ...rec };
      try { appendFileSync(holdsLogFile(), JSON.stringify(line) + '\n'); } catch {}
    };
    // a bounded run's tree gets the max-seconds path's grace (KILL_GRACE_MS) to clean up (temp Chrome profiles, I-095)
    // before the SIGKILL that still reaches the whole tree (I-024); it waits synchronously: acquire()'s listener, which
    // releases the lock and exits, runs right after this one, so the lock stays held until the tree is gone (I-099:
    // confirmed after the SIGKILL too)
    const graceKill = () => {
      for (const t = Date.now() + KILL_GRACE_MS; Date.now() < t && treeState(psTable(), child.pid, seen).alive.length;) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      kill('SIGKILL');
      return confirmGone();
    };
    // I-106: after the hard kill (and the wait until the tree is gone), the throwaway profiles the killed tree left:
    // only folders on this run's list whose marker names a process of the tree (the command or a descendant the kill
    // saw), made since the run started, whose creator no longer runs. Returns {profilesRemoved?: n} for holds.log.
    const cleanProfiles = () => {
      if (!profileList) return {};
      const rows = psTable(), running = new Set(rows.filter((r) => !r[3].startsWith('Z')).map((r) => r[0]));
      const r = removeRunProfiles(profileList, { pids: new Set([child.pid, ...seen.keys()]), since: runStart, isAlive: (p) => running.has(p) });
      if (r.removed.length) console.error(`[lock ${resource}] removed ${r.removed.length} throwaway Chrome profile${r.removed.length === 1 ? '' : 's'} the killed command left (I-106): ${r.removed.join(', ')}`);
      for (const k of r.kept) console.error(`[lock ${resource}] kept ${k.dir}: ${k.why} (I-106)`);
      return r.removed.length ? { profilesRemoved: r.removed.length } : {};
    };
    const dropList = () => { if (ownList) { try { rmSync(ownList, { force: true }); } catch {} } };
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.prependListener(sig, () => { kill(sig); const left = bounded ? { ...graceKill(), ...cleanProfiles() } : {}; dropList(); logHold(Date.now(), { code: 130, signal: sig, ...left }); });
    // wall-clock deadlines checked every second (I-026): a timer's clock stalls while the Mac sleeps
    // (Maintenance Sleep / DarkWake), so after a wake the cap is enforced at once, not minutes later.
    // A reader counts from its own acquiredAt: its SIGKILL (deadline + 3 s) lands inside its recorded deadline
    // (+ killGraceSec 5 s), as does the wait until its tree is gone (+ TREE_GONE_MS 1.5 s, I-099), which the group's
    // expiresAt exceeds by 10 s, so old lock code never clears the group
    // while this command can still run
    let overran = false;
    const deadline = (mode === 'shared' ? Date.parse(reader.acquiredAt) : Date.now()) + (maxSec || 0) * 1000;
    const timer = bounded && setInterval(() => {
      const now = Date.now();
      if (!overran && now >= deadline) {
        overran = true;
        console.error(`[lock ${resource}] "${rest.join(' ')}" exceeded --max-seconds ${maxSec}; stopping it and releasing the lock`);
        kill('SIGTERM');
      } else if (overran && now >= deadline + KILL_GRACE_MS) kill('SIGKILL');
    }, 250);
    const warn = expectSec && setTimeout(() => console.error(`[lock ${resource}] this hold passed its ${expectSec} s (--max-seconds; I-020): it keeps running, but split long measurements into lock.mjs run holds of 5-10 min so short jobs get in at each hand-over`), expectSec * 1000);
    const code = await new Promise((r) => child.on('exit', (c, s) => r(c ?? (s ? 1 : 0))));
    const endedAt = Date.now();
    if (runMark && (await runMark)) { try { await describeHold('iphone', { owner, run: null, runPid: child.pid }); } catch {} }
    clearInterval(timer);
    clearTimeout(warn);
    // I-186: a phone run (iphone.mjs run|scroll|record|gesture) inside this hold left its thermal-profile ledger: the hold's
    // end read now, still inside the hold (~25 s); it stamps the hold's run records (profileDrift) and joins holds.log
    const phoneProfile = !reentrant && mode !== 'shared' && holder?.token ? await closePhoneProfile(resource, holder.token) : null;
    // anything in the tree that ignored SIGTERM (or was orphaned when the command exited); I-099: then wait until it is gone
    let left = {};
    if (overran) { kill('SIGKILL'); left = { ...confirmGone(), ...cleanProfiles() }; }
    dropList();
    const exit = { ...(overran ? { code: 124, killed: 'max-seconds', ...left } : { code }), ...(phoneProfile ? { phoneProfile } : {}) };
    if (powerStart) {
      const powerEnd = await hostPower();
      const hs = hostStateSummary([{ label: owner, run: 0, power: { start: powerStart, end: powerEnd } }]);
      logHold(endedAt, { ...exit, start: powerStart, end: powerEnd, tag: hs.tag });
      if (hs.tag) console.error(`[lock ${resource}] ${hs.tag} during this hold: ${hs.reasons.join('; ')} (T8+, I-033)`);
    } else logHold(endedAt, exit); // a no-timing hold or a shared reader: no display / wake record
    rel();
    return overran ? 124 : code;
  }
  throw new Error(`unknown command ${cmd}`);
}

/** I-186: the end read of the phone's thermal profile for a hold whose phone runs left a ledger (lib/thermal-profile.mjs
 *  closeHold), or null; never throws. Lines go to stderr with the lock prefix. */
async function closePhoneProfile(resource, token) {
  try {
    const P = await import('./lib/thermal-profile.mjs');
    if (!P.openLedgers({ resource, token }).length) return null;
    const s = await P.closeHold({ resource, token, log: (l) => console.error(`[lock ${resource}] ${l}`) });
    return s.length ? s : null;
  } catch (e) { console.error(`[lock ${resource}] phone profile end read failed: ${e.message} (I-186)`); return null; }
}

/** `lock.mjs wait <resource> --until <cond>`: read-only, no queue place (see the header). */
async function waitCmd() {
  if (opt('until') === undefined) throw new Error("usage: node tools/lock.mjs wait <resource> --until free|idle|mine|held-by:<owner>|released-by:<owner>|'position<=N' --owner <you> [--reason \"<why>\"] [--for S] [--timeout 3600]");
  // I-108 (6): a wait nobody owns belongs to no row: say so once, then run as before (shown as "owner unknown")
  if (waitOwner(owner) === UNKNOWN) console.error(NO_OWNER_NOTE);
  const cond = parseLockCondition(opt('until'), owner);
  const sec = (n, d) => { const v = opt(n); if (v === undefined) return d; const x = parseSec(v); if (!(x >= 0)) throw new Error(`--${n} must be a number of seconds (or 10m, 2h), got ${v}`); return x; };
  const timeoutSec = sec('timeout', 3600), hs = lockHoldSec(cond, sec('for', 0), owner), holdSec = hs.holdSec;
  if (hs.note) console.error(hs.note); // I-165: --until mine --for N kept the lease idle N s after it was already yours
  status(resource); // a bad resource name fails here, before the first poll
  const what = `${resource} ${lockConditionText(cond)}`;
  const onChange = flag('quiet') ? undefined : (state, s) => console.error(`[lock wait ${new Date().toISOString().slice(11, 19)}Z +${s}s] ${resource} ${state}`);
  const reason = String(opt('reason') ?? '').trim(); // I-108: like wait.mjs, the board shows why
  startWait({ tool: 'lock.mjs wait', owner, what: `lock ${what}${holdSec ? `, for ${holdSec} s` : ''}`, timeoutSec, ...(reason && !reason.startsWith('--') ? { reason } : {}) }); // I-058: shown on the status board
  const r = await pollUntil(() => lockConditionMet(cond, status(resource)), { timeoutSec, holdSec, onChange });
  if (r.result === 'met') { console.log(`MET ${what}: ${r.state}${holdSec ? ` (for ${holdSec} s)` : ''} (after ${r.waitedSec} s)`); return WAIT_EXIT.met; }
  console.log(`TIMEOUT ${what} after ${r.waitedSec} s: ${r.state}`);
  return WAIT_EXIT.timeout;
}

runMain(main);
