# Team operations plan: fewer agent-written updates, fewer coordination slips (arch-team-ops, 2026-10-04)

Asked by the user in console thread T-122 #5 (13:29Z, paraphrased): make the board and the related data update by the
tools themselves, not by agents (agent updates cost tokens and go wrong); look at the agent roles, including a role
that asks the agents what slows them down; and plan the team for the long term. The trigger was I-145: the status
board showed "accent-ca: you: decision on PR-019" for 16 min after the user had decided. The lead also missed that
decision, because its listener filter (the one CLAUDE.md prescribes) drops `PROPOSAL` lines.

Sources: all 145 incidents (`.git/fastwork-mirror/incidents/`), `memory/` (rules and their history),
`fixes/FINDINGS.md`, `fixes/AGENT_ROLES.md`, `fixes/LEAD.md`, `research/management/ops-handover.md`, the status,
console, proposal and thread stores (counts only; no user text copied, Hard rule 12),
`research/management/tools/usage.mjs`, and short answers from 9 of the 10 active agents (§4). Read-only scripts live
in the scratchpad. All counts are OBSERVED from local stores.

## 1. Coordination slips, by class

Of the 145 incidents, **72 (50 %) are coordination slips**: two agents, an agent and the user, or an agent and a
shared device getting in each other's way. The other 73 are plain tool bugs, feature requests or measurement issues.
The rows below add the slips that never became an incident (memory notes, today's agent answers).

| # | class | incidents | other evidence | count |
|---|---|---|---|---|
| 1 | Board shows a stale or wrong state (it needs an agent to write it) | I-044, I-048, I-058, I-060, I-108, I-116, I-118, I-145 | 7 of 19 user answers today reached the owner's row only after >10 min (median 9 min, §1.1) | 8 |
| 2 | User message or decision missed or late | I-045, I-068, I-084, I-137, I-139 | memory: console-step-wait-yourself (missed twice), console-server-detached; today: the lead's filter dropped PR-019's `PROPOSAL` line | 8 |
| 3 | User step stuck on its runner (the user waits on an agent) | I-059, I-122, I-123, I-140, I-143 | memory: user-steps-first, no-phone-steps-during-blocks; today: a fix owner's `acquire iphone --wait` took the phone promised to a user step (T-113) | 8 |
| 4 | Lock jams, wrong queue order, lost queue places | I-005, I-007, I-010, I-011, I-012, I-019, I-020, I-022, I-030, I-035, I-041, I-049, I-056, I-080, I-081, I-097, I-113, I-114, I-136 | 3 of 9 agents today: no way to queue a series of holds, so they write shell chains by hand | 19 |
| 5 | Idle devices, or false idle alarms | I-105, I-111, I-125, I-144 | | 4 |
| 6 | One agent's work spoils another's (shared host, disk, scratch dir, Mac sleep) | I-006, I-008, I-016, I-026, I-031, I-051, I-082, I-095, I-098, I-107, I-124 | memory: keep-awake-only-during-measurements | 11 |
| 7 | Wrong or lost data at a hand-off (stale build served, lost recording) | I-052, I-066, I-067, I-131, I-141 | today: about 3 user finger takes lost (I-141); pixel-gate snapshots copied out of another worktree by hand | 5 |
| 8 | Same thing reported or built twice | I-004 (= I-001), I-039 (= I-038), I-013 (no findings board) | the I-128 flake was filed again as I-133, I-135, I-138; today 3 agents: peers' data is hard to find, every agent writes its own re-score helper, phone block scripts are copied and edited per block | 3 (+4 in row 9) |
| 9 | Flaky shared tests block other agents' commits | I-014, I-015, I-055, I-057, I-065, I-120, I-121, I-128, I-132, I-133, I-135, I-138 | today: 2 agents lost a full re-run each (ts-phone-steps, mgmt-ops-10) | 12 |
| 10 | A rule kept only by memory slipped (no tool checks it) | | memory notes agent-spawn-names (slipped twice), proposal-decision-is-the-spec, proposal-try-it-required (missed twice before I-109 enforced it), verify-platform-claims, console-steps-only-for-actions, trace-before-asking, answer-format; today: "the fix is being built" posted before the probe it depended on had reported; a pre-data ticket sent before its card and scorer were committed | 10 |
| 11 | Harness command guard costs turns (worktree isolation) | | 6 of 9 agents today: compound commands, heredocs, `cd` into a peer worktree and shell variables are refused, so each one becomes a Write-ed script plus a retry. The refusal text is not in this repo's hooks (searched `.claude/`, `tools/`), so OBSERVED: it comes from Claude Code's worktree isolation, which we can't change | 6 reports |

Reading:
- **Rows 1-3 are the ones the user notices**, and all three have the same cause: a fact the tools already store (a
  proposal decided, a step answered, a lease taken) reaches the board, the lead or the runner only when an agent
  rereads it and writes it down.
- **Row 4 is the biggest, but mostly fixed**: 18 of its 19 incidents are resolved. What is left is ergonomics: one hold
  per call, so a design check that needs 4-5 holds means a hand-written chain.
- **Row 10 shows the pattern that works.** A rule that a tool enforces (I-109: `proposal post` refuses an option
  without a Try-it) stops slipping. A rule that lives only in a memory note slips again after a compaction.

### 1.1 How long the board lags behind a user answer (today)

For each proposal decision and console step the user answered today (19), we took the time from the answer to the
first board write on any row of its owner. That first write is a lower bound on when the row reflected the answer.

| | value |
|---|---|
| user answers today (proposals + steps) | 19 |
| median lag to the owner's next board write | 9 min |
| lags > 10 min | 7 of 19 |
| worst (lead-owned items: the lead keeps no row of its own for them) | 227 and 552 min |
| PR-019 (I-145) | 16.8 min |

### 1.2 Where coordination tokens go (usage.mjs, window 07:20-12:20Z)

| who | share of output tokens | share of weighted units | turns |
|---|---|---|---|
| lead (main session) | 52 % (414 k of 800 k) | 14 % (19.9 M of 142.9 M) | 847 |
| mgmt-ops-10 | 7 % | 10 % | 657 |
| all fix owners, toolsmiths, research | 41 % | 76 % | |

Status board writes today: **575** (475 by owners, 95 by the lead, 5 by others); 363 change a state and 321 change a
wait. At about 25 k weighted units per agent turn (the lead: 19.9 M / 847; a fix owner: 16.9 M / 635), if half of
those writes take a turn of their own, they cost about **7 M units a day, ~5 % of one 5-hour window** (estimate).
Threads today: 182 user messages; the lead wrote 148 thread messages and gave 62 of the 178 first replies. The router
(T-050) now gives the other 116 to owners or the desk. Median first reply 0.7 min, p90 5.4 min, worst 48.6 min.

## 2. What the tools already know: board fields and their events

| board field | known from events today? | event source | needs a sentence from the agent? |
|---|---|---|---|
| owner, kind | yes at spawn: agent name, worktree branch `worktree-agent-*` / `fix/<topic>` | spawn (lead), git | no |
| title | partly: the PROGRESS item, the incident title, the proposal title | stores | once, at creation |
| priority | no | lead decision | the lead (one number) |
| state `measuring` | **yes**: a timing hold (`lock.mjs run`, `fix.mjs ab`, `verify.mjs`, `iphone.mjs scroll/record/run`) started or ended | `locks/holds.log`, lock status | no |
| state `testing` | **yes**: a shared `npm-test`, `check` or `probe` hold, `npm run test:unit` | holds.log (weight) | no |
| waiting: Chrome / phone | **yes, derived today** (queue place, "#2 of 4") | lock queue | no |
| waiting: you (user) | **yes, derived today** for open steps and proposals; a *self-reported* `user:` wait stays shown after the event that ends it (I-145) | console steps, proposals | no |
| waiting: user answered / decided | **yes**: decision, answer, skip, redo, done with time and value | proposal and step `history` | no |
| waiting: incident | **yes**: blocking incident by reporter or `affected`; resolved → "over" flag | incident store | no |
| waiting: agent X | partly: a `wait.mjs` / `lock.mjs wait` record with `--reason` | waits registry | a short reason |
| waiting: lead (land request) | no: land requests travel as messages | — | today yes; a `land request` record would make it derivable |
| ready-to-land → landed | **yes**: branch head reaches `main` (`overFlags` flags it, it does not change the row) | git | no |
| implementing / designing / researching | weak: commits on the branch, overlay edits, Serena reads look alike | git, overlay mtime | **yes**: the agent's plain sentence |
| agent alive / ended / parked | **yes**: the transcript's last activity and a `SubagentHandback` call (local files, as `usage.mjs` reads them) | `~/.claude/projects/…` transcripts | no (format is Claude Code's, may change) |
| note, next | no | — | **yes: the only fields that need a person or agent** |
| listening for user messages | yes: a live `thread wait` in the waits registry; the "read in the last 5 min" rule is wrong (I-137) | waits registry | no |

Result: **only `note`, `next`, the title (once), what "implementing vs researching" means, and priority need a
sentence.** Every wait, every "measuring/testing", "the user answered", "landed", and "the agent ended" can come
from events. The board already derives the live waits. The gap is that a derived event never *overrides* an older
self-report: `overFlags` sees "PR-019 already decided" and only adds a "may be out of date" flag, while the row stays
in "Waiting on you".

## 3. What the agents said (9 of 10 replied; summarized, no personal data)

| agent | slowed by | asks for |
|---|---|---|
| iphone-runner | runner kept its own attempt counter after a redo; acks refused, nothing checked, user stuck (I-140); `record` lost whole recordings on an inspector drop (I-141); one-off helper scripts per block | ack/redo helper that reads the live attempt (done in I-140, f367c6ce); save as you go; a shared phone block kit (serve/hold/score/self-test templates, "fling at T after navigation", I-142) |
| fix-cd-roll-ca | its `acquire iphone --wait` took a phone promised to a user step; phone order changed by chat and did not match its queue entry; a step waited an hour only because a plan's prose said "after" | lead-set phone order and a "user step pending" reservation honoured by `acquire`; `--after <id>` dependencies on tickets/cards; documented command shapes for the guard |
| fix-accent-ca | Chrome and Simulator jobs share one queue; chaining them by hand, once queued twice and lost the place | a chain or `--then` form of `lock.mjs run`; shared phase-mark and "A/A first" helpers for Simulator pixel probes |
| fix-nav-morph | told the user "being built" before the deciding probe reported; guard refusals; peers' data found only by searching other worktrees | conditional user posts; a read-only peer reader; an index of probe outputs by build hash and kind |
| fix-morph-gpu | pixel gates read another worktree's snapshot (copied and hash-checked by hand); a two-state difference between page loads looked like a build difference; 4-5 background jobs per design check | a shared immutable snapshot store by hash; an automatic A/A rerun of any "consistent" cluster; a holds sequence that keeps the place |
| fix-scroll-cb | fixed thresholds set before the noise was known failed a working fix; guard refusals; queued 14 holds by a hand-written chain | a cheap noise run before a card is signed (thresholds as multiples of it); `lock.mjs run-chain <file>` |
| fix-hero-exit-threaded | guard refusals; `serve.mjs --help` starts a server; a gesture param shadowed a built-in default | a real `--help` on every tool; a warning when a param shadows a default |
| ts-phone-steps | the C-045 stale attempt (I-140, fixed); the lost recording (I-141, in progress); timing asserts in the full suite flake under load | runners check every ack's exit code; long phone reads save as they go; tolerance on wall-clock test fields |
| mgmt-ops-10 | a ticket arrived as a message with the phone booked 15 min out and nothing committed; reading other worktrees is clumsy; flaky unit tests; near-empty "finished" notices | `ticket.mjs check <commit>` before a pre-data read; `read-ref.mjs <sha> <path> [--sha256]`; quarantine I-138 |
| fix-toolbar-resize | no reply within the window | |

Common threads: (a) **chains of holds** (3 agents); (b) **reading peers' data and committed files** (4); (c) **the
command guard** (6; harness, docs only); (d) **phone hand-offs and order** (2, plus memory rules); (e) **kits instead
of per-agent scripts** (phone block kit, Simulator probe helpers, re-score; 4).

## 4. Roles: what to change

- **The lead is the coordination cost.** It writes 52 % of all output tokens and 148 thread messages a day. Today
  the router already moved 116 of 178 first replies away from it. What is left is decisions, landing, spawns,
  incident triage, and board rows it writes for others (95 today).
- **mgmt-ops (opus) is worth its 10 %** for pre-data reads and second reads (P-104, P-105, P-106 today). Its board
  nudging and "who waits on what" work goes away once rows derive themselves.
- **A "team check" role** (the user's idea): a short-lived **sonnet** agent, run every ~6 h or after each wave. It
  (1) reads a friction log the agents write as things happen (a `friction` kind on the findings board, one line,
  no extra turn), the incidents since the last check and the board's lag numbers (§1.1), (2) asks only the agents
  with no friction note the one 3-bullet question, (3) dedupes against open incidents, and (4) hands the lead
  incident-ready lines plus one FYI thread for the user. Cost per round: ~10 resumed agent turns × ~25 k ≈ 0.25 M
  units, plus the checker (sonnet, ~1 M); about 2-4 M units a day at 3-4 rounds. Today's single manual round
  produced 6 items that were not yet incidents (chains, peer reads, phone reservation, ticket check, `--help`, noise
  run). Folding it into mgmt-ops instead would grow an opus context that already hands over every ~2 h, so this plan
  recommends a separate short-lived agent.
- **Desk on a cheaper model.** The desk (thread router fallback) answers catch-ups and status questions from the
  board, PROGRESS and the handover. Those are lookups, which a sonnet agent can do. Decisions still escalate to the
  lead (`thread escalate`).
- **No new "board keeper" role.** That would just move the token cost; events do it for free (§5).

## 5. Plan

### Now: tool fixes, each one an incident a toolsmith can take (ordered by value)

| # | incident line (ready for `incident.mjs open`) | saves | risk |
|---|---|---|---|
| N1 | **status board: an event that ends a wait overrides the older self-report** (I-145). A row whose `user:`/`C-`/`PR-`/`T-` wait is decided, answered, skipped or closed leaves "Waiting on you" at once and shows "you answered PR-019 at 13:09Z; fix-accent-ca has not picked it up (N min)". `--waiting-on user` without an id is refused (or needs `other:`), so every user wait can be closed by its event. Read-time only, no writes | the whole class-1 symptom the user sees: 7 of 19 lags > 10 min today drop to 0 on the user's side | low: read-time view change; owners keep their own state and note |
| N2 | **one listener line format: `thread wait --monitor`** prints every wake (NEW, TRIAGE, PROPOSAL, ESCALATE, step answered) as one line starting with `WAKE <kind> <id>`, so a Monitor needs no grep. CLAUDE.md "Agent communication" (lead edit) drops "prints only the TRIAGE/NEW lines", which is the filter that dropped PR-019 | class 2: the missed proposal decisions; a few lead turns a day spent re-reading `proposal list` | low; doc edit by the lead |
| N3 | **router counts "listening" only from a live wait record** (I-137, open): drop the "read in the last 5 min" rule, or require the wait's pid alive | class 2: user messages routed to a dead agent (T-109 #17) | low |
| N4 | **lock: a chain of holds** `lock.mjs run-chain <file>` (or `run … --then …`): runs a list of holds in order, re-queues each next job automatically at the back (FIFO kept; no place kept unless the lead allows it), one board line per step | 3 of 9 agents' hand-written chains, double queue entries, lost places (I-113 class); ~5-10 agent turns a day | medium: lock code; tests on fairness; no change to who goes first |
| N5 | **iphone: a reservation for a promised user step or a lead-set order** `lock.mjs reserve iphone --for <owner|user-step:C-NNN> --by lead`; `acquire --wait` by anyone else waits behind it | class 3: the T-113 clash; replaces the order sent by chat | medium: one more lock state; must expire (TTL) |
| N6 | **`tools/peer.mjs` (read-only)**: `ls|cat <agent|branch> <path>` for another worktree's `out/` and committed files, `ref <sha>:<path> [--sha256]` | class 8: copied snapshots, one-off `git show` scripts (4 agents) | low: read-only; must refuse paths outside worktrees |
| N7 | **incident dedupe on flaky tests**: `incident.mjs open` joins an open or recently resolved incident with the same test name (I-128 was filed 4 times); fix or quarantine I-138 | class 8/9: re-reports and re-runs (2 agents today, 5-min reruns) | low |
| N8 | **ticket check** `ticket.mjs check <commit>`: refuses a pre-data read request unless the card, predictions, scorer hash, sentinels and served hashes are committed; the lead's phone booking confirms only after it passes | class 10: the P-106 first-read FAIL under time pressure | low-medium: needs a card schema |
| N9 | **board: landed and ended rows derive themselves**: a `ready-to-land` row whose head is on main shows "landed (from git)"; an owner whose transcript ended with a hand-back shows "owner ended" (router skips it) | class 1; about 95 lead board writes a day | medium: transcript format belongs to Claude Code (OBSERVED, may change); read-only |
| N10 | **`--help` on every tool without side effects** (`serve.mjs --help` starts a server today) | small; one hung shell per new agent | low |

Docs only (lead): a "command shapes that pass the worktree guard" box in CLAUDE.md and in the spawn prompt
(separate simple git calls; scripts via Write then `node <file>`; no `cd` into a peer's worktree, use N6). It
saves the 6 agents' retries; there is no risk.

### Next: role and process changes

| # | change | saves | risk |
|---|---|---|---|
| R1 | **Team check** (sonnet, short-lived, every ~6 h or per wave) on a **friction log** (`finding.mjs post --kind friction`, one line when it happens) | finds slips before they become incidents; ~2-4 M units a day | agents ignore the log; cap the question round at 10 agents and 5 min each |
| R2 | **Desk on sonnet** for catch-ups and status questions; decisions escalate to the lead | about 30 opus lead turns a day (~0.7 M units, estimate) | a wrong answer on a subtle fix question: the desk must cite the board/PROGRESS line or hand on |
| R3 | **Board writes shrink to note and next**: owners stop writing waits and measuring/testing (they come from events, N1/N9); the role docs say so | most of the ~7 M units a day of board writes (§1.2); the class-1 staleness | rows look "quiet" while an agent thinks; keep the 45-min stale flag |
| R4 | **mgmt-ops keeps reads and ledgers; drops board chasing** | ops context | none |
| R5 | **`--after <id>` dependencies on tickets and cards**, shown on the board | waits caused by prose order (an hour today, T-096 step 2) | low |

### Long term

| # | change | saves | risk |
|---|---|---|---|
| L1 | **One event log** (`.git/fastwork-mirror/events.jsonl`): every store appends a line when it changes (proposal decided, step answered or redone, hold started or ended, queue moved, incident resolved, commit landed, thread message). The board, the progress page and the idle alarm become projections of it | the class-1 to class-3 root cause: no fact needs an agent to copy it | medium: one more write per store; append under the existing guard |
| L2 | **One inbox wait per agent** (`wait.mjs inbox --as <me>`) on that log, replacing separate thread, proposal, incident, finding and lock waits; one `WAKE` line format | push instead of polling: fewer re-arms and missed wakes | medium: every agent changes its listener at once; ship next to the old waits |
| L3 | **Kits instead of per-agent scripts**: a phone block kit (serve, hold, score, self-test, "fling at T after navigation"), Simulator probe helpers (phase marks, A/A-first), and a shared snapshot store by hash | class 8 double work; most `out/` one-offs | the kit must stay tested (toolsmith-owned) |
| L4 | **Every memory rule gets a tool check where possible** (as I-109 did for Try-it): conditional user posts, a named spawn, an answer-format lint on thread replies | class 10 | refusals that block legitimate work; each check needs an escape the lead can grant |
| L5 | **Team KPIs, re-measured by the team check**: board lag after a user answer (today median 9 min, 7/19 > 10 min), lead output share (52 %), user minutes stuck on a step, re-reported incidents | shows whether L1-L4 work | none |

## 6. Recommendation

Do N1-N3 first (the user-visible part of I-145 and the missed decision, all low risk), then N4-N7, and R1 with the
friction log. L1-L2 are the long-term answer to the user's point that the data should not depend on agents. Build
them after N1 proves the idea on the existing stores.

The user decides in console proposal **PR-020** (3 options: tools first; tools + team check, recommended;
minimal). It has no Try-it pages because it is a team process change with no page to try; each option shows a
"today vs option" diagram.

Not changed by this agent: `tools/`, `.claude/`, `memory/`. Memory, CLAUDE.md lines and roles are the lead's.

Side note: `usage.mjs --now <past time>` appends its what-if result to the shared `usage.jsonl` (seen while
collecting §1.2; two such lines were written at 13:3xZ). A small fix: append only without `--now`.
