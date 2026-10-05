# chrome-measure shared lane: functional jobs in parallel, timing stays exclusive

ts-lock-share, 2026-10-02. Status: DESIGN, waiting for the lead's approval (Phase 1). No code yet.

User request (2026-10-02): timing and benchmark work keeps its exclusive slot. Jobs that only confirm that
something works (npm test, functional test:chrome, Simulator mechanism checks, `bench mech`, load-only Chrome
sanity checks, DOM/page-state probes, ts-headless's headless checks) may run in parallel with each other, but
never beside a timing hold.

Inputs read: `tools/lib/lock.mjs`, `tools/lock.mjs`, `tools/lib/lock-repair.mjs`, `tools/lib/wait.mjs`, `tools/sim.mjs` +
`lib/sim.mjs` `holdGate`, `tests/helpers.mjs` `chromeLock`, `bench.mjs` `takeLock`, `iphone-run.mjs` `measureGuard`,
incidents I-007/011/020/024/030/035/041, the shelved (f) branch `ts-lock-bundle-f-shelf` (60717c8, b9dc023, note
2a85321: B1 re-entry, B2 mixed versions, B3 same owner), ts-lock-bundle's unlanded fb59f13 (`run --no-timing`) and
a17909d (awake while gated).

## 1. Model: one reader-writer lock, readers stored as a group *inside the holder file*

Separate lock names don't work. Old code (every worktree that has not rebased) only looks at
`locks/chrome-measure.json`. If readers lived in another file, an old-code A/B would see the lock as free and
start next to them. The shelved (f) attempt failed this way (B2: a co-holder file that old code ignored or deleted).

So the readers are **a single holder record that old code reads as an ordinary live lease**:

```json
{ "resource": "chrome-measure", "owner": "(shared)", "kind": "lease", "short": true, "maxSec": 300,
  "shared": true, "format": "rw1", "token": "<group token>", "openedAt": "…", "acquiredAt": "…",
  "expiresAt": "<max reader deadline + 10 s>", "checkout": "<opener>", "host": "…",
  "meta": { "readers": "npm-x (w2), check-y (w1)" },
  "readers": [ { "owner": "npm-x", "token": "<reader token>", "kind": "process", "pid": 123, "checkout": "…",
                 "acquiredAt": "…", "deadline": "…", "maxSec": 300, "weight": 2, "meta": {} } ] }
```

How old lock code treats this record (every path checked against main's `lib/lock.mjs` and `lock-repair.mjs`):

| old-code path | sees | result |
|---|---|---|
| `staleReason` | lease, `expiresAt` in the future | live: it waits (never grants beside readers) |
| same-owner re-entry `h.owner === owner && kind lease` | owner `(shared)` | no agent uses this name; new code never re-enters a group by name (it checks `shared: true`), so the `(` refusal was dropped (review N1) |
| FW_LOCK_HELD re-entry | group token | never exported (readers export their own token in another variable, §5) |
| `release` without `--force` | owner mismatch | throws |
| `renew` | `short: true` | refuses |
| `effectiveLastGrant`, short-lane ordering | a short grant | readers count as short jobs in old code's drain budget |
| `status` | `held by "(shared)" (short, max 300 s) [lease] … until …` + the meta line listing the readers | readable |
| `measureGuard` (iPhone) | `short` | timed iPhone runs allowed, as during shorts today |
| `wait --until free/idle` | holder present | not free |
| doctor / repair | live lease, valid JSON | no problem flagged; only `--force-holder` removes it, which removes any live holder today too |

New code invariant: **`expiresAt` ≥ every reader's hard deadline at all times** (raised on every join, lowered only
when a reader leaves). An expired group therefore has no reader that can still be running: process readers
are killed at their deadline (as `--short` today), and lease readers simply expire (as a short lease today).
Old code that clears an expired group can't put a writer beside a live reader.

`format: "rw1"` is the version field. New code joins only a group whose `format` it knows. A `shared` holder
with an unknown format is treated as an exclusive holder, so a reader waits. That protects this code from a
future rw2.

**Writers** (exclusive holders) are unchanged: same record, same short lane, same host gate, same lease policy.
`--short` (exclusive, bounded) stays for jobs that need the machine alone but are short, e.g. `host-real.chrome`.

### Admission rules (tryAcquire with `shared: true`), under the existing guard

1. Prune: drop readers whose pid is gone or whose deadline passed. If none are left, remove the group
   (`last-stale.json` as today). The lock is then free.
2. `FW_LOCK_HELD` names the live exclusive holder's token: re-enter the writer's hold (its own sequential
   work, e.g. `sh -c 'fix.mjs ab && npm test'`). No group.
3. `FW_LOCK_SHARED` names a live reader token: re-enter that reader slot (no new slot, no new weight).
4. The holder is exclusive (or a group in an unknown format): queue, with entry `{shared: true, short: true, maxSec, weight}`.
   Old code orders it like a short job.
5. The holder is a group: **join** iff
   - capacity: Σweight + weight ≤ `SHARED_CAP` and `os.loadavg()[0]` ≤ `SHARED_JOIN_LOAD` (§2), **and**
   - writer preference: no exclusive waiter is in the queue (any entry without `shared`, old code's included,
     fresh or not, within the 10 min queue TTL), **or** this reader is in the opening batch (its queue entry's
     `since` ≤ `group.openedAt` and now ≤ `openedAt + 30 s`), except when an exclusive waiter the lead moved is
     ahead (I-097): then no join, not even the batch.
   Otherwise queue.
6. No holder: `nextIndex` as today. Reader entries are short entries, so the short lane, the drain budget, I-030's
   gate pass window and lead moves apply to them unchanged. If this reader is served next (or is the first short
   job passing a gate-holding head writer), it **opens a group** (`openedAt = now`). The other queued readers join
   on their next poll as the batch. last-grant.json records the group as a short grant.

   *Amended in implementation:* last-grant.json records the group as a short grant **whose drain budget is
   spent** (`groupGrant(g, now)`: owner `(shared)`, `runStart = now - SHORT_DRAIN_SEC`), written at open and at
   every join. So after a group both old and new `nextIndex` serve a queued normal waiter first, and FIFO among
   short-lane entries when no normal waiter is queued. An extra "after a group" rule in new `nextIndex` alone made
   old and new code pick different waiters and livelocked (old code granted a reader entry that new code would not);
   the agreement is tested against main's pinned `lib/lock.mjs`. Side effect: an exclusive `--short` job queued
   right after a group waits for a queued normal waiter.

Writer preference bound: once a writer is queued, no reader joins except the opening batch. The readers still in
the group end by their deadlines. The writer therefore waits at most `30 s + SHARED_MAX_SEC (300) + 5 s ≈ 335 s`
after the group opened, or `≤ 305 s` after the writer arrived in a running group, and then passes the host gate as
always. Today's short lane allows 900 s of back-to-back shorts, so this is shorter. A writer's gate wait after the
readers drain is protected by I-030 unchanged: readers pass a gated head writer only during its first 120 s, never
one the lead moved.

Release: remove one reader by token. If it was the last one, unlink the holder file (the hand-over then
runs as today). Otherwise lower `expiresAt` to the remaining maximum. The `exit` handler is synchronous, so it
uses a bounded synchronous guard (`mkdirSync` spin with `Atomics.wait`, ≤ 2 s). On contention it gives up, and the
dead pid is pruned at the next acquire.

## 2. Capacity: weight cap plus a load check on joining

- `SHARED_CAP = 4` weight units at most (8 cores, 16 GB); *as built after review:* the default cap is **3** (`SHARED_LANE.defaultCap`, lead decision 2026-10-02: three Chrome agents in parallel), the switch's `--cap` sets 1..4. `--weight N` (1..4, default 1) is declared by the caller.
  Proposed: headless check, DOM probe, functional test:chrome file, `bench mech` = 1; `npm test` = 2
  (`--test-concurrency=3`, ~60 CPU-s, bursts to 3 cores); Simulator session = 3.
  *Changed by I-076 (f8aa122, 2026-10-03, lead GO):* `npm test` now runs at `--test-concurrency=6`: ~160-164 s of
  wall time (was 285-299 s at 3, too close to the 300 s cap), 280-290 CPU-s, about **1.75 cores on average, bursts up
  to 6 cores** (was ~0.94 cores, bursts to 3). Its weight stays 2 and `--max-seconds` stays 300; no lock-policy change.
- A join (not the opener) also needs `load1 ≤ SHARED_JOIN_LOAD` (*as built after review:* default **2x the cpu count**, 16 here, the switch's `--join-load L` overrides it; lead decision: while timing is deferred the load gate matters only for timing jobs, which stay exclusive). This is a cheap synchronous
  read, so it adds no sampling window inside the guard. load1 lags, so the weight cap is the hard bound.
  *Changed by I-051 (§12):* a join now needs CPU busy ≤ `--join-busy` (default 75 %), sampled over the reader's own
  polls; load1 ≤ join load applies only before the reader's first busy sample.
- `SHARED_MAX_SEC = 300` per reader, hard-killed at the deadline (`run`) or expired (lease), as `--short` is.
- Env overrides for tests only: `FW_LOCK_SHARED_CAP`, `FW_LOCK_SHARED_JOIN_LOAD`, `FW_LOCK_SHARED_JOIN_BUSY` (I-051).
- I-024 risk (e2e timeouts on a loaded host): two npm tests (2+2) is the most the cap allows. Tests already use the
  fake host since 48ace89. If flakes show up, the lead lowers the cap via the switch file (§7) without a code change.

## 3. Simulator: one device, its own exclusive `simulator` lock

Per-job clones (`simctl clone`) would mean a boot per job (~1-2 GB RAM, GPU and CPU heavy), a WDA build or install
per clone, port allocation for the proxy (:9231/:9232) and WDA (:8101), and a new leak class. That is not the
simplest safe option.

Choice: **one fw-sim, one session at a time**. `sim.mjs session --functional` takes a new process lock `simulator`
(exclusive, not gated, strict FIFO). It runs inside a shared reader of weight 3, so at most one light job runs
beside it. Today `session` refuses a second live session only by reading the session record, which is racy; the
lock closes that race. Changes in `lib/sim.mjs`:
- `holdGate` accepts a live shared reader slot (FW_LOCK_SHARED) only with `--functional`. Without it, the
  current rule stays (own normal hold).
- the session record gets `functional: true`, and sim records `meta.lock.mode: "shared"`, so `stats.mjs` never pools
  them with timing runs (the record already never pools with phone or Chrome numbers).
- `wda build` keeps its normal (or `--no-timing`) hold: minutes of xcodebuild is not a shared-lane job.
This is the last step of Phase 2 and can be split out if ts-sim/arch-sim prefer to own it.

*As built (own commit, after the core lane):*
- `holdGate(…, {functional: true})` accepts this process's live reader slot of weight ≥ 3 (`--weight simulator`), its
  own short hold (what `run --shared` is while the switch is off), or a normal hold, and names the `mode`. A lighter
  slot is refused.
- **Every** session, functional or not, holds the exclusive `simulator` process lock (a new entry in `RESOURCES`,
  not gated). It is polled through `tryAcquire`, not `acquire()`, because `acquire()`'s signal handlers exit at once
  and would skip the Simulator shutdown. The wait is bounded so that boot, command and cleanup still fit the hold.
- A functional session **refuses** the timing commands (`scroll`, `record`, `run`) instead of tagging their records,
  so no functional number can reach `stats.mjs`. `open` and `wda start` work. The session record carries
  `functional: true, lock: {mode}`.

## 4. Mixed versions (B2)

- Old code vs. group: §1 table. Old code waits until `expiresAt`, and that is never before the last reader's
  deadline.
- New reader vs. old holder: an exclusive record, so the reader queues.
- Old waiters in the queue: entries without `shared` count as exclusive waiters, so they close joins (writer
  preference) and are served at the hand-over.
- After a reader dies, old code waits up to its remaining deadline (≤ 300 s), because it doesn't prune by pid.
  New code prunes at once. This costs only during migration.
- Old `release --force` / `repair --force-holder` delete the group with readers still running. That is the same
  as for any live holder today: lead-only, audited, and the lead's doc says so.
- Cutover switch (2a85321's suggestion): `locks/chrome-measure.shared.json`, written only by
  `lock.mjs shared on|off <resource> --by lead --reason "…"`. Each change is a line in `audit.log`, and the file can
  also carry `cap`. **Absent = off.** While it is off, `--shared` runs as an exclusive `--short` with the same max
  seconds (a one-line notice), so callers can switch to `--shared` before the lead turns the lane on.
  Turning it off while a group is live affects new readers only; the group drains.

## 5. Re-entry (B1) and owner identity (B3)

A reader's child env gets **`FW_LOCK_SHARED=<resource>:<reader token>`** (same syntax as FW_LOCK_HELD, its own
variable). FW_LOCK_HELD is never set to a group or reader token. Every combination:

| inside ↓ / acquirer → | exclusive (verify, fix.mjs ab, bench gain, normal or `--short` run, chromeLock) | shared |
|---|---|---|
| exclusive hold (FW_LOCK_HELD = holder) | re-enters (today) | re-enters the exclusive hold (like `--short` today) |
| shared hold (FW_LOCK_SHARED) | **refused at once**: "a timing/exclusive job never runs inside a shared functional hold (owner X); run it in its own hold" | re-enters the same reader slot |
| nothing, same owner holds exclusively | re-enters (today; lease or same pid) | *after review N1:* re-enters (`reentrant-exclusive`) like a `--short` job does on main, in both switch states, so `bench mech` inside a fix owner's own lease behaves as before; its command gets FW_LOCK_HELD **and** FW_LOCK_SHARED (holder token), so nothing timed starts inside it |
| nothing, same owner is a reader | no re-entry (the group owner is `(shared)`), it queues | a new, separate reader (own token, own weight); *amended:* a **lease** reader of the same owner from the same checkout is re-entered (`reentrant-shared`, so `acquire --shared` around a commit and the commit's own `--shared` acquire don't stack) |

- Old-code tools inside a new reader (only possible across checkouts) don't know FW_LOCK_SHARED. They queue
  behind the group and are killed at the reader's deadline. They never co-hold.
- B3: readers are keyed by **token**, never by owner. A process reader is removed only by its own process (token)
  or by pid-death pruning. A lease reader is released by `release --shared --owner X` from the **same checkout**;
  another checkout needs `--force`. Exclusive `release` never touches a group. Queue entries of readers are keyed
  by `(owner, pid)` (lease readers: `(owner, checkout)`), so two processes of one agent don't merge. Doctor's
  `queue-duplicate` follows the same key.
- fb59f13's `noTimingRefusal` is the same idea for no-timing holds. If review-lock-bundle accepts fb59f13 and it
  lands first, I rebase on it and add the shared refusal next to it (one helper `refuseInside(h, ctx)`). If it does
  not land, the shared lane does not depend on it. I don't build on a17909d (awake while gated), and it doesn't
  conflict. A group gets one awake record (`keepAwake(r, group)` at open, `stopAwake` at close), so readers keep the
  Mac awake as holders do.

## 6. CLI and callers

```sh
node tools/lock.mjs run chrome-measure --shared --weight 2 --max-seconds 300 --owner <you> -- npm test
node tools/lock.mjs acquire chrome-measure --shared --weight 2 --max-seconds 300 --wait 1800 --owner <you>   # lease around a commit
node tools/lock.mjs release chrome-measure --shared --owner <you>
node tools/lock.mjs shared on|off chrome-measure --by lead --reason "…" [--cap N] [--join-load L]            # lead only (cap 3, load 2x cpus by default)
```
`--shared` requires `--max-seconds` (1..300). It is refused with `--short`, with `--no-timing`, on `iphone`, and on
any non-gated resource. Library: `acquire(r, {shared: true, weight, maxSec, …})` returns `{holder: group, reader,
release, reentrant, env}`, and `sharedEnv(r, token)`.

Callers that switch (each is a one-line change plus a test; behaviour is identical while the switch is off):
- `package.json`: `test:chrome` stays exclusive `--short` (verify/fix-ab/bench/host-real time things). The new
  `test:chrome:fn` (ts-headless's functional files) uses `--shared --weight 1`. `chromeLock(owner, meta, {shared,
  weight})` re-enters FW_LOCK_SHARED.
- `bench.mjs mech`: `takeLock` with `shared: true, weight: 1` (MECH_MAX_SEC 180 unchanged). gain/reconfirm stay
  exclusive. *As built:* mech always asks for the shared lane (weight `bench-mech`); while the switch is off that
  is the exclusive short job it was. Its Chrome profile `out/chrome-bench-profile` is per checkout, so two mech runs
  of one worktree would collide: the per-job profile (and recording `lock.mode` in mech results) is ts-headless's.
- `tests/chrome/vendor-shim.chrome` and `bench.chrome` take a shared `chromeLock(…, {shared: true, weight: 1,
  maxSec: 300})`; under the exclusive `test:chrome` wrapper they re-enter its hold, under `test:chrome:fn` its
  reader slot.
- `sim.mjs session --functional` (§3).
- Docs: CLAUDE.md "Tooling is guarded by tests" and "Shared devices", and AGENT_ROLES. npm test guidance becomes
  `run … --shared --weight 2 --max-seconds 300 -- npm test`, and a commit's lease becomes `acquire --shared …`.
  This is a separate docs commit, wording approved by the lead.
- `verify.mjs`, `fix.mjs ab`, `bench gain|reconfirm`: refuse `--shared` explicitly (exit 2), and refuse to start
  under FW_LOCK_SHARED (that check is in `acquire`).
- `.githooks/pre-commit` doesn't take the lock, so no hook change is needed. No deny/ask rule needs to change:
  `node tools/lock.mjs run …` is already pre-approved.

## 7. status, doctor, repair, wait, migration

- `status`: `chrome-measure   shared by 2 readers (weight 3/4, joins closed: "fix-x" waits) until <exp>` and one
  line per reader `npm-x (w2, pid 123, until …)`. Queue entries show `(shared w2, max 300 s, since …)`. The
  `--json` output keeps `holder` (the group, with `readers`). The host line is unchanged.
- `wait`: `held-by:<o>`, `mine` and `released-by:<o>` count a reader owner as holding. `free`/`idle` are false
  while the group lives.
- `doctor` new checks: `group-reader-dead` / `group-reader-expired` (fix: prune the reader),
  `group-empty` (fix: unlink), `group-expiry-short` (`expiresAt` < a reader's deadline; fix: raise it),
  `group-format-unknown` (report only), `shared-switch-unparsable`. `queue-duplicate` uses the reader key (§5).
- `repair --apply` applies those fixes under the guard, audited as today. `--force-holder` on a group prints every
  reader first.
- `repair --move` works on reader entries like on shorts.
- **Migration.** Landing changes no live state file. The holder, queue and last-grant formats stay readable both
  ways, and no group exists until the lead runs `shared on`. Order: (1) land the lock code, switch off; (2) the lead
  runs `npm test` on main; (3) land the caller switches and docs; (4) the lead turns the switch on when
  `lock.mjs status` shows no normal holder (or at any time: old waiters keep working, §4); (5) canary: two
  `run --shared` sleep jobs and one queued exclusive `run` against the live lock, and `status` shows the order. On
  any surprise: `shared off`.

## 8. Tests (test-first; all on a temp FW_STATE_DIR, never the live lock, I-041)

Unit (`tests/unit/lock-shared.test.mjs`):
- exclusivity: a reader never joins beside an exclusive holder (process, lease, short, no-timing). An exclusive
  acquire never succeeds while a group has a live reader. Both directions, with the holder written by **main's
  lock code**: the test imports the pinned old `lib/lock.mjs` from `git show main:…` into a temp module dir, so B2 is
  tested against the real old code, not a model of it.
- B2: old `tryAcquire` sees the group as busy (normal, short, same owner `(shared)` excluded, FW_LOCK_HELD with
  a reader token). Old stale-clearing only after the last deadline. Old `release` without force throws.
- writer preference: an exclusive waiter queued → a new reader queues; the batch joins within 30 s; after 30 s it
  doesn't. The writer is granted after the last reader leaves (bounded: simulated clock). An old-code waiter also
  closes joins.
- cap: weights 2+2 ok, 2+2+1 queued; join refused when load1 > threshold (stubbed); the opener ignores load.
- stale readers: a dead pid is pruned, the last prune unlinks the group, the hand-over follows; an expired lease
  reader is pruned; `expiresAt` invariant after join and leave.
- re-entry table §5, each cell: FW_LOCK_SHARED → same slot; exclusive under FW_LOCK_SHARED → throws; shared under
  FW_LOCK_HELD → re-enters exclusive; same owner by name → no re-entry.
- B3: two readers with one owner from two checkouts, each released by token. A lease release from another checkout
  without --force throws. Exclusive `release` doesn't touch a group.
- switch off → `--shared` behaves as an exclusive short (same grant order as today's short-lane tests).
- unknown `format` → treated as exclusive.
- I-030/lead move: readers don't pass a moved or gate-settled head writer.
E2E (`tests/e2e/lock-shared-cli.test.mjs`): two `run --shared` children overlap (both write start/end stamps, which
overlap); a third `run` (exclusive, fake host) starts after both end and no shared run starts while it holds;
`--max-seconds` kill; FW_LOCK_SHARED in the child env; `verify.mjs --shared` exits 2; status/doctor/wait output.
Existing lock tests stay green unchanged (no behaviour change for writers).

## Open questions for the lead

1. Cap 4 units with weights 1/2/3, join load ≤ 8: ok? (The switch file can carry `cap` for tuning.)
2. Switch off by default at landing, turned on by the lead after a canary: ok?
3. Build on fb59f13 if review-lock-bundle accepts it, independent otherwise: ok?
4. Simulator part in this branch (last step), or handed to ts-sim?

## 9. Review round 1 (review-lock-share NEEDS-WORK), as built

[MEASUREMENT CODE]: this round changes `tools/lib/lock.mjs` (what every measurement's hold is), `tools/lock.mjs`,
`tools/lib/sim.mjs`, `tools/iphone.mjs` and `tests/helpers.mjs` `chromeLock`. Timing jobs keep the exact hold they had
on main (exclusive, host gate); what changes for them is only what may run *inside* a functional slot (nothing timed).

**One rule for both switch states (N2): a functional slot.** A slot is a live group reader, the switch-off stand-in
(the exclusive short hold a `--shared` acquire becomes while the lane is off; its holder and queue entry carry
`functional: true` and the weight), or an exclusive hold a `--shared` job re-entered (weight = the full cap). Its
command always gets `FW_LOCK_SHARED=<r>:<token>`; the stand-in's command gets no FW_LOCK_HELD. Inside a slot:
- an exclusive acquire (verify.mjs, fix.mjs ab, bench gain/calibrate/reconfirm, a normal, `--short` or `--no-timing`
  run, an exclusive `lock.mjs acquire` lease, N7) is refused at once, in either switch state;
- a shared acquire re-enters the slot if it is no heavier than the slot (N8), else it is refused;
- `iphone.mjs scroll|record|run|gesture` exit 2, and `sim.mjs` timed commands (`scroll`, `record`, `run`) refuse,
  whenever FW_LOCK_SHARED names chrome-measure or FW_SIM_FUNCTIONAL=1 (set by `sim.mjs session --functional` for its
  command, so it also covers FW_IPHONE_PORT pointing at the Simulator) (N5/N6, `timedInSlotRefusal`);
- `sim.mjs` holdGate: a functional session accepts a slot of weight >= 3 (reader: mode `shared`; stand-in: `short`;
  re-entered exclusive: `exclusive`); a non-functional session inside a slot is refused even if it also inherits
  FW_LOCK_HELD; a plain `--short` hold is no longer accepted for a functional session (only the stand-in is).

**Argv refusals (exit 2, unchanged since round 0):** `verify.mjs --shared`, `fix.mjs ab --shared`,
`bench.mjs gain|calibrate|reconfirm --shared` ("a timing measurement and never runs in the shared lane"). `bench mech`
always asks for the shared lane.

**B1 (`chromeLock`):** a `tests/chrome` file declared `{shared: true}` takes a shared hold only when it runs inside a
slot (FW_LOCK_SHARED names chrome-measure, i.e. under `npm run test:chrome:fn`), where it re-enters that slot. Run on its
own, or under `test:chrome`, it takes main's exact exclusive process hold (no `short`, `shared`, `functional` or
`expiresAt`; its tools get FW_LOCK_HELD), so no bounded hold exists that nobody kills.

**N1 (switch off = main):** same-owner re-entry also for shared acquirers (never into a group); no `(` owner refusal;
`status` prints the `shared lane:` line (and `--json` its `sharedLane`) only while the lane is on, a group lives, the
holder is a stand-in, or a shared/functional entry is queued. **N3:** the deadline e2e asserts the kill lands before
the reader's own deadline (acquiredAt + maxSec + killGraceSec), not only before the group's expiresAt. **N4:** readers
join in queue order (a fresh earlier reader entry blocks a later one, even a lighter one that would fit; the opener
is the waiter served next). **N10:** a waiter's entry converts in place when the lead flips the switch (its place is
kept).

**Known gaps (not safety issues; left for a later round):**
- N9: `lock.mjs repair --move <owner>` on an owner with both a reader entry and an exclusive entry moves the first
  match only; the lead names the entry by position if it matters.
- A slot token is checked only against the live holder: a tool started inside a slot that has already ended (its
  `run` killed at --max-seconds) refuses timed commands by env (iphone/sim), but an exclusive acquire there just
  queues as a normal job (the slot is gone, so nothing runs beside it).
- Old-code tools in another checkout do not know FW_LOCK_SHARED (§5): they queue behind the slot and are killed at its
  deadline; they never co-hold.

Switch-on line for the lead (after the canary): `node tools/lock.mjs shared on chrome-measure --by lead --reason
"<why>"` (cap 3 and join load 2x cpus by default; `--cap N` 1..4, `--join-load L`, `--join-busy P` since I-051).
Off again: `shared off`.

## 10. I-049: readers starved by later exclusive waiters (as built)

Seen live on 2026-10-02: the lead's npm test (shared w2) was #1 in the queue from 22:15Z to after 22:44Z. Exclusive
holds queued after it passed it at three hand-overs (22:14, 22:34 and 22:43:35; the last one queued about 22:39).
Cause: §1 step 6 ("right after a group, the exclusive waiters go first") picked the first normal waiter whatever its
queue place, and gatePassDone did the same, while a waiting writer kept joins closed.

Rule now (`nextIndex`, test-first in tests/unit/lock-shared.test.mjs "I-049"):
- **FIFO between readers and exclusive waiters.** An exclusive waiter never passes a reader queued before it: not after
  a group, and not through its gate pass window. The short-lane entries go in queue order. Writer preference only
  closes joins to a running group; it does not reorder the queue. Earlier exclusive waiters still go first after a
  group, and readers still pass later normal waiters through the short lane, as before.
- **Age bound.** A reader queued `readerMaxWaitSec` (600 s) goes before any exclusive waiter at the next hand-over,
  except right after a shared group (I-210, below).
- A lead move (`movedBy`) of an exclusive waiter ahead of the short-lane entries wins over FIFO and over the age
  bound (I-097, 6deb294); such a waiter also closes joins for the opening batch, so a running group only drains and
  the moved hold goes next.
- **Head-of-line (amends N4).** Seen live: with the group at weight 3/4, the head reader fwreskip (w3) could not join,
  and test-chrome-fn (w1, waiting since 22:30Z) behind it could not either. Now a reader that fits may join past fresh
  readers ahead that do not fit now, as long as each of them has waited less than `readerBypassSec` (300 s). After
  that the group drains for the head. A reader ahead that fits is never passed.

- **I-210: an exclusive head waits for at most one group.** Seen live 2026-10-05: with a long queue of shared Simulator
  and probe jobs every reader soon aged past 600 s, and each aged reader queued after an exclusive head (a `--no-timing`
  build, a normal hold) opened the next group before it: fix-end-bg waited 13:17-13:52Z, int-v8 13:50-14:25Z, and the
  lead hand-moved four heads in an hour. Now the age bound does not apply at a hand-over right after a shared group
  (`nextIndex`: the last-grant record is the group's, `groupGrant`, `shared: true`; it stays until the next grant). The
  head has then waited out one group, so it goes first (the short-drain budget is spent, as before). The age bound still
  lets the first aged reader pass the head once, after an exclusive or short hold, and that group is the one group. A
  reader queued before the head is untouched: it goes first by FIFO, aged or not, and may still open or join the next
  group. Lead moves (I-097), the phone block's gap (I-207), the short lane (I-011/I-020/I-030) and host-gate passes
  (I-185) are unchanged. Test: tests/unit/lock-shared.test.mjs "I-210".

Mixed versions: where the new rule picks a reader and pre-I-049 code picks the normal waiter, each takes its own turn,
and the guard settles the race. One mutual wait stays possible until every worktree rebases: a pre-I-049 reader defers
to an I-049 writer that defers to it. It is bounded by the group's last-grant record, which expires 335 s after the
group's last grant; after that both versions serve the short lane first.

Seen live (lead, 2026-10-02): chrome-measure was free from about 23:34:30Z to 23:38:13Z. The hand-over went to
de-illusion-style, whose waiter ran pre-I-049 code. fix-nav-morph's exclusive waiter was queued behind it, gated on
host load. Neither took the lock for about 3.7 min, and the wait cleared by itself within the bound. Nothing showed the
stall while it lasted. Built under I-051 (§12): `lock.mjs status` and the progress page now say whom a free lock hands
over to, and why that waiter has not taken it.

## 11. Capacity: cap 3 vs cap 4 (T-008, measured 2026-10-02)

Host: 8 cores (6P+2E), 16 GB. Each mix ran real jobs as `--shared` readers, re-entered inside one `--no-timing`
exclusive hold of mine, so nothing else ran beside them and the cap did not limit the mix. One run per mix. CPU busy is
the share of all cores, sampled every 1 s; "bg" is the 10 s before the mix. Jobs: npm = `npm test` (w2), check =
`fix.mjs check large-area-blur` (w1), sim = `sim.mjs session --functional -- sim.mjs open <url>` (w3, cold boot).

| mix | weight | wall | result | CPU busy mean / p90 | s above 90 % | load1 max |
|---|---|---|---|---|---|---|
| s-npm (npm) | 2 | 195 s | 942/942 | 40 % / 57 % (bg 28 %) | 0 | 7.9 |
| s-check (check) | 1 | 69 s | pass | 37 % / 48 % | 0 | 8.1 |
| m3 (npm + check) | 3 | 198 s (check 70 s) | pass | 45 % / 71 % | 5 | 7.7 |
| m4a (2 npm) | 4 | 205 s, 207 s | 950/950 each | 54 % / 79 % | 4 | 10.8 |
| m4b (4 checks) | 4 | 73-74 s | all pass | 57 % / 80 % (bg 20 %) | n/a | 11.7 |
| m5 (2 npm + check) | 5 | 218 s, 219 s (check 74 s) | 965/965 each | 58 % / 96 % | 35 | 13.6 |
| s-sim2 (sim) | 3 | 24 s (boot 11 s) | pass | 85 % / 100 % | 18 | 95 (43 at start) |
| m4c2 (sim + check) | 4 | 78 s (sim 27 s, boot 12 s) | pass | 48 % / 100 % | 22 | 139 (75 at start) |

- **No failures.** No I-024 e2e timeout in any mix. `npm test` takes 195-219 s of wall time; the note "75 s wall" in
  CLAUDE.md (I-021) is out of date. Against the 300 s `--max-seconds` that leaves about 80 s of margin at weight 5.
- **Cap 3 vs 4.** Cap 3 lets one npm test (w2) and one w1 job run together, so a second npm test waits about 200 s.
  Cap 4 (two npm tests, or four checks) keeps the CPU p90 near 80 % and load1 below 12. Weight 5 still passed, but
  it held the CPU above 90 % for 35 s and slowed each npm test by about 10 %.
- **Simulator weight.** A cold boot uses the whole machine for about 20 s (CPU 100 %, load1 to 95-139). After that
  the session costs little. Weight 3 stays: one check fits beside it at cap 4, and m4c2 passed with the check about
  10 % slower (78 s vs 69-74 s). Two Simulator sessions never overlap anyway (the `simulator` lock, §3).
- **The join load binds only after a Simulator boot.** Mixes without one never reached load1 16. After a boot, load1
  stays above 16 for about 2-2.5 min while the CPU is back near 25 % busy, because load1 decays over one minute
  (139 to 62 took 50 s). Joins stay closed for that time although the host has room. That cost is incident I-051;
  joins now use CPU busy instead (§12).
- **Above cap 4 needs code.** `SHARED_LANE.cap` (4) bounds the switch's `--cap` and `--weight` and the weight of the
  exclusive slot that re-entered jobs use. Raising it is a tool commit with the config and switch tests updated.
- **Recommendation:** keep cap 4 and join load 16 (both are the lead's setting since 22:48Z). Don't go above 4 on this
  host.

## 12. I-051: joins after a Simulator boot (measured 2026-10-02, as built)

**Measured.** Every `sim.mjs session` boots fw-sim from cold. Host samples every 2 s from 23:57Z to 00:51Z (a gap
00:27:46-00:31:18Z), with the lock state at each sample; 17 Simulator session starts:
- A cold boot takes 11-12 s of wall time. It holds the CPU at 90 % busy or more for 4-22 s (median about 14 s), and
  load1 peaks at 72-182. After a single boot load1 stays above 16 for about 150 s. An idle booted Simulator (about
  230 processes) kept the CPU 40-55 % busy against a 20 % background for the first 2.5 min, with load1 still 26 at
  165 s; after shutdown busy was back at 20 % at once.
- Over the whole window load1 was above 16 for 2432 of 3000 s; for 2016 s of that the CPU was 75 % busy or less.
- Join time lost (a group running, a queued reader that fits by weight, no exclusive waiter, load1 > 16): 0 s in the
  first 30 min, 376 s in the last 20 min, in two episodes (00:31:20-00:33:07Z and 00:42:29-00:46:56Z). 370 of the
  376 s would have joined under "CPU busy ≤ 75 % over 4 s".
- Keeping fw-sim booted between sessions (option a) was rejected: an idle booted Simulator costs about 2.5 GB of
  memory and 20-35 points of CPU for minutes, and needs Safari parked between sessions.

**Rule now (option b; `readerAttempt`, test-first in tests/unit/lock-shared.test.mjs "I-051").**
- A waiting reader samples host CPU busy from `os.cpus()` deltas between its own polls, at least
  `SHARED_LANE.busyWindowMs` (1 s) apart, so no sampling window is added inside the guard.
- A join needs busy ≤ `--join-busy` (switch, 0 < P ≤ 100), default `SHARED_LANE.joinBusyPct` = 75. load1 ≤ join
  load (16) applies only before the reader's first busy sample. The opener is unchanged (no load check).
- Mixed versions: pre-I-051 readers still check load1 and only join later; nothing else differs.
- Not measurement code: the timing host gate (load1 ≤ 6, busy ≤ 25 %) is unchanged.

**Hand-over line (also I-051).** While the lock is free and someone waits, `lock.mjs status` (and `--json`, field
`handover`) and the progress page show: `free, handing over to "X" (gated: <reasons>)` when the waiter served next is
held at its host gate (gate record at most 60 s old), `(not seen for N s)` when it has not polled for more than 5 s,
else `(seen N s ago)`. In the sample the lock stood free with a gated waiter served next for 182 s in the first 30 min
(e.g. 00:21:52-00:22:54Z and 00:24:22-00:25:12Z), and status showed only "handing over to X".

### When timing resumes

Timing A/Bs are deferred by the user (2026-10-02), so this is a candidate, not built. The timing gate (load1 ≤ 6 and
busy ≤ 25 %) was open for 6 s in the 50 min sample: with Simulator sessions starting every few minutes, a timing
waiter at the head of the queue mostly times out at the gate. fix-nav-morph's hold hit the gate timeout at 00:25:12Z
after 603 s (load1 70.8, CPU 32.5 % busy); that hold was counts-only, so nothing was contaminated. Candidate rule: no
new Simulator-weight reader opens a group while a gated timing waiter is at the head, so the host can settle for it.
Decide it with fresh numbers when timing resumes.
