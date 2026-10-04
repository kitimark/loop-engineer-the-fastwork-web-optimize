# Phone hold v2: the iPhone is held while a command runs, not while an agent thinks

arch-phone-hold, 2026-10-05, for the lead (user T-149 #8: "harden with tools more proper ... what's the issue that lead
this problem? Tools? instructions? investigate it"). Read-only investigation; a toolsmith implements.

**Answer.** Mostly the tools. The `iphone` lock is a renewable lease that nothing ties to a running command, so an
agent can keep the phone while it runs nothing. Nothing gives the phone back on its own: the idle alarm only posts a
thread. Agents also take the phone before their Mac hold is available. The prose rule ("never hold it while idle") was
broken 3 times in the 4 hours after the lead repeated it at 14:41Z. About 92 of today's ~223 idle minutes are lease
semantics, about 14 are phone-before-Mac ordering, 62 are user-attended waits (6 of them a stuck step), 44 were on
purpose, and 11 were a false alarm. Fix: make the phone a process hold, let a phone part take the phone and its Mac hold together, use leases
only for user steps, and have the alarm act at 2 min instead of only posting a thread.

## 1. Evidence

Sources: the 18 idle threads (T-081 ... T-150; `.git/fastwork-mirror/console/threads/`), `out/idle-watch.log` (IDLE and
ENDED lines from 08:20Z on), `locks/holds.log` (every chrome-measure `run` hold), `locks/iphone*.json`,
`locks/audit.log`, incidents I-105, I-111, I-125, I-144, I-148, I-149, I-155, I-160, I-165, and the code
(`tools/lib/lock.mjs`, `tools/lock.mjs`, `tools/iphone.mjs`, `tools/lib/idle.mjs`). Each period runs from the alarm's
"since" (the last use, or the lease grant) to its ENDED line, or to the thread close where the log does not cover it
(before 08:20Z). Sum ≈ 223 min. The lead's 204 used other end points, and the split is the same.

| # | thread | holder | idle (Z) | min | what the logs show | class |
|---|---|---|---|---|---|---|
| 1 | T-081 | iphone-runner | 06:42-07:10 | 29 | step C-038 ready, user away (ops reply); before I-125 | U |
| 2 | T-083 | fix-nav-morph | 07:22-07:30 | 9 | step C-041 ready for the user's Start (ops close note) | U |
| 3 | T-088 | fix-nav-morph | 07:42-07:50 | 8 | last run 07:42, its next user step 07:50: preparing between own parts | H-gap |
| 4 | T-090 | fix-rest-script | 08:20-08:32 | 12 | its hold failed (exit 4) 08:21; Mac **free** 08:22-08:27; fix-morph-gpu timed hold 08:27-08:30; its next hold 08:31 | H-gap 7 + M ≤5 |
| 5 | T-093 | cd-roll-ca | 08:36-08:44 | 8 | lease taken, no phone run until 08:44 | H-early |
| 6 | T-095 | cd-roll-ca | 08:55-09:07 | 12 | hold ended 08:56; Mac **free** 09:01-09:06; next hold 09:06 | H-gap 8 + M ≤4 |
| 7 | T-097 | fix-nav-morph | 09:20-09:31 | 11 | lease taken, no phone run | H-early |
| 8 | T-110 | (free) | 11:17-11:42 | 25 | lead paused phone work for the usage reset | P |
| 9 | T-115 | iphone-runner | 12:28-12:40 | 12 | block hold ended 12:29; lease kept until cd-roll-ca took it | H-done |
| 10 | T-117 | iphone-runner | 12:48-12:54 | 6 | C-045 part 3 stuck: runner's ack for the old attempt was refused (T-116) | R |
| 11 | T-121 | user-try | 13:07-13:19 | 12 | the user's own hand test (I-144) | U |
| 12 | T-128 | cd-roll-ca | 14:06-14:13 | 7 | last run 14:06, lease kept until user-try took it | H-done |
| 13 | T-129 | user-try | 14:13-14:19 | 6 | the user's own hand test | U |
| 14 | T-134 | cd-roll-ca | 14:32-14:48 | 16 | 14:32-14:37 lease taken before its pre-data read passed (H-early 5); 14:37-14:48 xctrace records ran = phone in use, alarm wrong (F 11) | H-early 5 + F 11 |
| 15 | T-141 | fix-hero-exit-threaded | 15:14-15:22 | 8 | lease taken, ran a shared functional job, no phone run | H-early |
| 16 | T-142 | (free) | 16:37-16:56 | 19 | free on purpose: Simulator jobs before the next block | S |
| 17 | T-143 | iphone-runner | 16:55-17:03 | 8 | lease 16:55, its no-timing hold 17:02; no logged Mac hold 16:54-17:02 (cause not in the logs) | H-early (or M) |
| 18 | T-150 | fix-hero-exit-threaded | 18:28-18:44 | 16 | 18:28-18:38 `lock.mjs wait iphone --until mine --for 570` still running on its own lease (I-165, W 10); 18:38-18:43 queued for its Mac hold behind a shared group (M 5); hold 18:42:50, phone run 18:43:54 | W 10 + M 5 + 1 |

Classes: **H-early** took the lease before its part could run; **H-gap** between its own parts; **H-done** finished but did
not release; **W** wrong wait; **M** waited for its chrome-measure hold while holding the phone; **U** a user-attended
wait (step ready for Start, or the user's own test); **R** the runner did not answer its own step; **F** false alarm
(phone in use); **P** paused by the lead; **S** free on purpose.

Lease facts from the code: `LEASE_POLICY` caps only chrome-measure (`tools/lib/lock.mjs:225`). An iphone lease
defaults to 900 s and has no maximum hold, so every renew extends it. `tools/lib/idle.mjs` is "read-only on the locks: it never
takes, renews or releases a lock". `lock.mjs run <resource>` is already a generic process hold, released when its
command exits (`tools/lock.mjs:426`). Only convention (CLAUDE.md, `iphone.mjs` usage text) points agents to the lease.
There is no per-lease history: `iphone.last-grant.json` and `iphone.last-release.json` keep the latest one only, and
holds.log logs chrome-measure only. So idle gaps under 5 min, and any gap with nobody waiting, are invisible today.

## 2. Root causes, ranked by minutes

| rank | cause | classes | min | share | the lead's hypothesis |
|---|---|---|---|---|---|
| 1 | **The phone is a lease, not tied to a running command.** It stays taken before the first run, between runs and after the last run | H-early 40, H-gap 23, H-done 19, W 10 | **92** | 41 % | gap 1: **confirmed**, the largest |
| 2 | **User-attended waits.** The phone sits ready for the user's Start, or the user is testing | U 56, R 6 | 62 | 28 % | mostly the user's pace; 29 min is one period (T-081) when the user was away, before "post only after the user says ready" existed in the tools |
| 3 | **On purpose** (lead pause, Simulator window) | P 25, S 19 | 44 | 20 % | not waste, but the alarm can't tell (no pause mark) |
| 4 | **Phone taken before the Mac hold** | M ≤14 (+8 if T-143 was a Mac wait) | ≤14-22 | 6-10 % | gap 2: **confirmed but smaller** than the lead assumed (T-150 was 10 min wrong wait + 5 min Mac wait). On 2 of 3 occasions (T-090, T-095) the Mac was **free** for 5 min first, so most of that time was the agent's own gap (cause 1), not the Mac |
| 5 | **Alarm accuracy** | F 11 | 11 | 5 % | fixed by ts-lock-rules (I-155: `run iphone` marks use) |

**Gap 3 (the alarm only talks) multiplies causes 1, 2 and 4.** About 106 min accrued before the 5-min alarms fired,
and 117 min after them: from the alarm to the period's end took 22, 3, 2, 6, 2, 6, 5, 19, 6, 1, 6, 1, 1, 10, 2,
13, 2 and 10 min. Half of the idle time came after the tool already knew, because the tool could only post a
thread and wait for an agent's next tool round.

**Instruction gap: confirmed.** At 14:41Z the lead posted the rule "take the phone only when the test can start at
once", and AGENT_ROLES got it too (I-155). After that, 3 of the 4 held-idle periods were H-early or W (T-141,
T-143, T-150). The rule is one line in a ~700-line CLAUDE.md. The tool still accepts `acquire iphone` from anyone,
at any time, renewable without limit. Telling agents again won't fix this; the tool has to stop accepting it.

## 3. Candidate directions: keep, change or drop

| | direction | verdict | why | cost |
|---|---|---|---|---|
| a | Phone as a process hold (`lock.mjs run iphone -- <cmd>`), leases only for user time | **keep: the core** | Removes H-done and W, and H-early by construction (you hold the phone only while your part runs). It caps H-gap with a short keep window (below). `run` already supports it; only convention and `iphone.mjs` usage text point to the lease | Agents wrap each phone part in a command (they already do for the Mac). A multi-part agent loses its place between parts unless it uses the keep window or one block script |
| b | Atomic multi-lock (iphone + chrome-measure together) | **keep, narrowed**: one pair only (iphone + chrome-measure `--no-timing`), for a part's *first* Mac hold | Removes M. A general N-lock scheduler is not needed: the only other resource is the Simulator, which I-160 already defers | The most code in `lib/lock.mjs`: two guards in a fixed order, a paired queue entry and a bounded reservation. Review by review-lock |
| c | Auto-yield of an idle lease | **change**: auto-yield applies to **leases only** (user steps, user-try exempt). A process hold can't be preempted safely, so it gets a hard `--max-seconds` bound plus an in-hold alarm to the holder at 2 min | After (a), the only leases left are user time; a step's Start timeout is the remaining lever (U 29 min in T-081) | Start-timeout yield changes what the user sees: **user's decision** (it touches user-steps-first) |
| d | Readiness flag (`--not-ready`, I-155) | **keep** (ts-lock-rules lands it) | Reused by (b) (a pair waiting for its Mac hold is "not ready" for the phone) and (e) (reservations) | none extra |
| e | Chained holds (I-148), reservations (I-149) | **change**: I-148 → a `--keep <s>` re-entry window (≤ 180 s) on `run iphone`; a full `run-chain` is optional, later. I-149 → `lock.mjs reserve iphone` = a lead-made not-ready head entry that the user's "ready" (or its expiry) turns into a step | The keep window covers H-gap without holding the phone while the agent reads results for minutes. A reservation is just a not-ready queue entry, so no new state is needed | small |
| f | Instructions: short and enforced | **keep**: the tool refuses `acquire iphone` for agent owners. CLAUDE.md's iPhone paragraph shrinks to 6 lines that name the command | A refusal teaches at the moment of use; prose does not (3 of 4 after 14:41Z) | Update CLAUDE.md, the `fix-owner`/`iphone-runner`/`wave-integrator` agent texts and `fixes/AGENT_PROMPT.md` in the same land |

Guarantees v2 must keep, each with a test that exists or that T2-T5 add:
- **User steps first** (memory `user-steps-first`): a step's queue entry is served at the next hand-over, ahead of every
  agent part, with no cooling and no Mac-quiet gate.
- **One phone step at a time** (memory `one-phone-step-at-a-time`, I-123): only the phone's holder posts a step, and the step
  lives inside the step lease. `iphone.mjs` refuses under another owner's open step.
- **Blocks with sentinels and cooling** (protocol v2 §5): one block runs as **one** process hold (its script), so the
  phone stays with the block between runs. `wait.mjs phone-temp` inside the hold counts as use (cooling), and the I-160
  between-holds marks stay.
- **Mac-quiet preference** (I-056): a phone part's first Mac hold is the pair grant (b). Later holds inside a block keep
  the existing phone-block priority (`queuePhoneBlock`, ahead of later shared readers).
- **ioscap and every `iphone.mjs` lease check** accept the holder when the holder is the caller's own process hold
  (owner match, or the iphone token in `FW_LOCK_HELD`), exactly as they accept the lease today.
- **Strict FIFO with lead moves** (`repair --move`, audited) still works.

## 4. Design: phone hold v2

1. **Agents hold the phone only while a command runs.**
   `node tools/lock.mjs run iphone --owner <you> [--max-seconds 900] [--keep 120] -- <phone part>` takes the
   phone when the command starts and gives it back when the command exits. `--max-seconds` defaults to 900 and caps at
   900; a ticketed block (`--block <ticket>`, the I-160 mark) may ask up to 3600. Past it, the hold is OVERDUE, it
   warns, and the alarm escalates. A phone part is not killed (a timed run must finish cleanly).
   `--keep S` (≤ 180) keeps the phone for the same owner for S seconds after the command exits. Re-entering within that
   time continues the hold; otherwise it is released. This replaces hand-built chains between an agent's parts (H-gap).
   `lock.mjs acquire iphone` is refused (exit 2, the message names the `run` form) unless the owner is `user`/`user-*`,
   or the call comes from `console.mjs` for a step. The lead keeps `--lead --reason "…"` (audited) for a repair.
   This refusal is the enforcement.
2. **A phone part takes the phone and its Mac hold together.**
   `lock.mjs run iphone --with chrome-measure --no-timing -- <part>` queues in both queues with one linked entry and
   is granted only when it can take both at once. Both guards are taken in the fixed order iphone then
   chrome-measure, so there is no deadlock. While the pair is next for the phone but not yet for the Mac, the phone
   is **reserved** for it and shows "reserved for X: waits for the Mac, ≤ N min" (N from the Mac holder's remaining
   `--max-seconds`). It is backfilled only by a phone-only part whose `--max-seconds` ends inside that wait (EASY
   backfill); such backfill parts are bounded (killed at their max). While the pair is next for the Mac but the phone is busy, the
   Mac is **not** held for it: the I-155 not-ready skip serves the next Mac waiter, and the pair keeps its place in both
   queues. Later Mac holds inside a block use the existing phone-block priority. The ledger counts their waits, and the
   alarm reports any over 5 min.
3. **Leases only for user time, and they end with it.**
   A console phone step (`console.mjs post --phone|--record|--kind swipe-pair`) queues a **step lease** owned by the
   posting agent and bound to the step id. It is served first (user-steps-first) and released when the step closes
   (done, answered, cancelled). The runner's `iphone.mjs record` and `ioscap.mjs record` run under that lease through
   its token. `user-try` stays a plain lease for the user's own hand test. The lead's `lock.mjs reserve iphone
   --for <owner|user-step> --minutes N` is a not-ready head entry (I-149), turned ready by the user's "ready" or
   dropped at expiry. **Option for the user** (not default): a step whose Start is not pressed within 5 min while
   others wait yields the phone and keeps the head place ("the phone went back to the robot queue; press I'm ready to get
   it next"). That would have saved ~24 of T-081's 29 min.
4. **The alarm acts, and every hold is on a ledger.**
   Every iphone hold or lease writes one line to `locks/holds.log` at its end: owner, kind (process, step, user,
   keep), acquiredAt, endedAt, runSec, coolingSec, macWaitSec, userWaitSec, idleSec, waitersPresentSec. `node tools/idle.mjs
   report --day` prints the day's idle minutes by cause, so the review in §1 becomes one command and gaps under 5 min
   become visible. The alarm sends a NOTIFY to the holder after 2 min with no use inside a hold (process: a phone run,
   a cooling wait, a pair or block Mac hold; step: the user on the step). It auto-yields only a step lease (if the user
   approves 3) and posts a user thread only after 15 min (the I-155 plan). `lock.mjs pause iphone --until <t> --reason`
   (lead) and the I-160 Simulator window mark intentional idle, so P and S stop alarming.
5. **Instructions shrink to what the tool enforces.** CLAUDE.md "Shared devices" iPhone part (replacing the
   acquire/renew/release lines and the "never hold it while idle" prose):
   "Phone parts: `lock.mjs run iphone [--with chrome-measure --no-timing] [--keep 120] -- <part>`; blocks: one script,
   `--block <ticket>`. User steps: `console.mjs post --phone ...` takes the phone for the step. `acquire iphone` is for
   `user-try` only." mgmt-devices stays as the backstop until the acceptance checks hold for one full day, then its
   push duty ends.

Where today's minutes go under v2 (replay of §1): H-done 19 → 0, W 10 → 0, H-early 40 → 0 (you hold the phone only
while your command runs; queueing early means a not-ready entry, not a hold), H-gap 23 → ≤ 2 min per gap (keep
window), M ≤14 → ≤ 2 min per part (pair grant), F 11 → 0 (ts-lock-rules), R 6 → unchanged (an I-123 step-runner bug,
stuck alarm at 2 min), U 56 → unchanged without the Start-timeout option, ~32 with it, P/S 44 → marked, no alarm.
Avoidable idle with waiters (lease semantics + Mac ordering): ~106 min → ≤ ~15 min.

## 5. Note on the in-flight ts-lock-rules work (lands first)

ts-lock-rules (I-160 committed as 4fb18e39 in its worktree; I-155 and I-165 uncommitted there) adds `--not-ready`, `run iphone`
under the lease as a use mark, and `chromeUse()`, which counts the holder **holding or queued for** chrome-measure as
use. Holding is right. **Queued is not use:** it makes the T-150 kind of wait (M) silent instead of fixing it. Until
the pair grant lands, the lead should ask ts-lock-rules to report `queued` as its own state (`OK iphone: … waits for
its Mac hold since hh:mm`), with a NOTIFY to the holder after 5 min, not as "in use". It is a one-line change in
`assess()`/`lineFor()` plus its test. Everything else there is reused as is: the not-ready skip in `nextIndex`
(used by the pair and by reservations), the `run iphone` use mark, the board alerts and the I-165 refusal.

## 6. Migration plan (one toolsmith per step, each its own commit and incident; order after ts-lock-rules)

| step | incident (new) | tools | tests | depends on |
|---|---|---|---|---|
| T0 | (I-155, I-160, I-165) | ts-lock-rules lands; the §5 "queued is not use" tweak | its own | — |
| T1 ledger | phone ledger | `lib/lock.mjs` (iphone hold/lease end → holds.log line with use breakdown), `lib/idle.mjs` + `idle.mjs report --day` | unit: ledger accounting from synthetic holder/run marks; e2e: `report` on a fixture state | T0 |
| T2 process phone holds | phone as process hold | `lock.mjs run iphone --keep/--max-seconds/--block`, refusal of agent `acquire iphone`, `iphone.mjs requireLease` and `ioscap.mjs` accept a process holder (owner or `FW_LOCK_HELD` token); `wait.mjs phone-temp` marks cooling use under a hold; CLAUDE.md (Hard rule 9 wording, "Shared devices" iPhone part, the "use the iPhone while you wait for Chrome" line), agent texts, AGENT_PROMPT | unit: keep window re-entry/expiry, refusal (exit 2) for `fix-x` and acceptance for `user-try`; e2e: phone released ≤ 5 s after exit (+keep), `iphone.mjs` passes inside `run iphone` and refuses outside; existing I-123/I-144 tests stay green | T1 |
| T3 step leases + reserve | phone step lease, I-149 | `console.mjs post --phone/--record/swipe-pair` queues and owns the step lease, released on close; `lock.mjs reserve iphone`; Start-timeout yield behind a switch (off until the user decides) | unit: a step is served next (user-steps-first), one step at a time, lease ends with the step, reserve expires; e2e: the console flow with a fake phone | T2 |
| T4 pair grant | iphone + Mac together | `lib/lock.mjs`: linked entries, fixed guard order, reservation and bounded backfill, not-ready skip on the Mac side; `lock.mjs run iphone --with chrome-measure --no-timing` | unit: both free → atomic grant; phone free and Mac busy → reserved, backfill fits or waits; Mac free and phone busy → Mac served to the next waiter, pair keeps its place; no deadlock with two pairs; aging bound; the **replay fixture** of today's 18 periods | T2; review by review-lock; `npm run test:chrome` (it changes when timed holds start: called out, though no timing code changes) |
| T5 alarm v2 | alarm acts | `lib/idle.mjs`: in-hold 2-min NOTIFY, Mac-wait > 5 min, `lock.mjs pause iphone`, user thread only > 15 min, step-lease Start-timeout yield (if switched on) | unit per rule; e2e `idle.mjs check` on fixtures | T1-T4 |

T1 and T2 alone remove ~86 of the ~106 avoidable minutes (H-done, W, H-early, most of H-gap). Ship them first. T4 is the
largest and riskiest change and buys ≤ 14-22 min/day, so it lands after one day of T1 ledger data confirms M is
still worth it.

## 7. Acceptance checks

1. **Replay** (unit test fixture, T4): today's 18 periods as lock/queue timelines under v2 → H-done, W and H-early
   give 0 idle minutes with waiters; each H-gap and M gap is ≤ 2 min.
2. **Live, one full working day, from `idle.mjs report --day`:** phone held or free with a ready waiter, excluding
   (a) a step waiting for the user's Start, (b) the user's own test, (c) a declared pause or Simulator window: **≤ 2 min
   per episode, ≤ 15 min per day** (today ≈ 106 min, plus 6 for the stuck step).
3. `lock.mjs acquire iphone --owner fix-x` exits 2 naming the `run` form; `--owner user-try` succeeds.
4. A `run iphone` hold is gone ≤ 5 s after its command exits (plus `--keep`); a crash (SIGKILL) frees it at the next
   status read (pid gone).
5. A pair never holds the phone with no Mac hold for > 2 min unless a bounded backfill part runs (the ledger's
   macWaitSec, p95).
6. User steps: a posted step is served at the next hand-over; a second phone step is refused; existing I-123 and
   I-144 tests are green.
7. No user thread for an idle period under 15 min; the holder gets its NOTIFY at 2 min (board red alert).
