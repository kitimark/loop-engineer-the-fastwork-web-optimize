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
| same-owner re-entry `h.owner === owner && kind lease` | owner `(shared)` | new code refuses owners that start with `(`; no agent uses this name |
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
     `since` ≤ `group.openedAt` and now ≤ `openedAt + 30 s`).
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

- `SHARED_CAP = 4` weight units (8 cores, 16 GB). `--weight N` (1..4, default 1) is declared by the caller.
  Proposed: headless check, DOM probe, functional test:chrome file, `bench mech` = 1; `npm test` = 2
  (`--test-concurrency=3`, ~60 CPU-s, bursts to 3 cores); Simulator session = 3.
- A join (not the opener) also needs `load1 ≤ SHARED_JOIN_LOAD` (default = cpu count). This is a cheap synchronous
  read, so it adds no sampling window inside the guard. load1 lags, so the weight cap is the hard bound.
- `SHARED_MAX_SEC = 300` per reader, hard-killed at the deadline (`run`) or expired (lease), as `--short` is.
- Env overrides for tests only: `FW_LOCK_SHARED_CAP`, `FW_LOCK_SHARED_JOIN_LOAD`.
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
| nothing, same owner holds exclusively | re-enters (today; lease or same pid) | **no** re-entry by name: it queues as a reader (it can't know what the same-named hold is running) |
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
node tools/lock.mjs shared on|off chrome-measure --by lead --reason "…" [--cap 4]                             # lead only
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
