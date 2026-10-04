# Roles v3: proactive by default (user T-160 #7, 2026-10-04 ~21:20Z; lead review)

The user: "our team should not have reactive agents, just waiting me to order … work together without any conflict
… investigate, distinguish and revise our roles, responsibility and any related more proactive and productive
context." This is the lead's look back over 2026-10-04 and the revision that follows. The rules are in
[`fixes/AGENT_ROLES.md`](../../fixes/AGENT_ROLES.md) "Proactive by default"; this file keeps the evidence.

## What the day shows (from our own records)

| # | symptom | evidence | cause class |
|---|---|---|---|
| E1 | the lead reorders the Mac queue by hand | 89 of 92 `queue-move` entries on 10-04 in `locks/audit.log` are the lead's | delegated power on paper only: `repair --move` accepts only `--by lead` (I-171, coded, waiting on a test slot); the desk that held the power is parked |
| E2 | the phone idles with no job ready | 20:41-21:00Z and 21:04-21:25Z+ (I-182) | tickets drafted only after someone asked; gaps (no scorer, no hold.sh, placeholders) found at ops validation (P-118, 21:19Z) |
| E3 | results reach their next user through the lead | split check (ebee20a5) relayed by the lead to int-v8; double-drive pass relayed to mgmt-devices | no rule names a result's consumers |
| E4 | agents stop after a step and wait for an order | 12 active board rows name the lead in their wait, next or note; owners parked `resume-on decision:lead` with a next step written down | parking is the default end of a step |
| E5 | the lead misses or doubles user answers | T-159 #5-#7 woke nobody (I-181); T-159 #18 answered twice, with different fixes (lead and mgmt-devices) | listener gap; no "one answer per message" rule |
| E6 | the board says something false | 6 worker rows "blocked by I-181" (I-183); t113 stale for 4 h; toolbar-resize had no row, so no rank; only #1 highlighted | rows nobody owns; ranks set but not checked on the page |
| E7 | one queued job stalls the queue | a count-only Simulator gesture hold gated on load at #1 (I-184); fix-toolbar-resize lost its #1 to a 3600 s wait timeout | tool rule; long waits not in the background lane |

## What changes (rules R1-R8 in AGENT_ROLES.md "Proactive by default")

- **R1 Pull the next step.** A finished step's next step inside your own topic needs nobody's OK. Park only with no
  next step. `resume-on decision:lead` only for what is the lead's: sign D or a ticket, land, rank, spawn, a rule,
  a user decision.
- **R2 Results go to their consumers, not through the lead.** Integrator (`int-v8`) for anything that enters the
  best build; mgmt-ops for card reads; mgmt-devices when it changes what a device can start next; topic owners whose
  code it touches. The lead gets one FYI line.
- **R3 Pre-stage while you wait.** While your step waits on a lock, a device or a peer, prepare the step after it.
  A phone ticket goes to ops only complete: arms built and hashed, serve.sh, hold.sh, scorer plus self-test, P-id
  requested, coverage (y range, driver) and order lines written.
- **R4 The queue is mgmt-devices', not the lead's.** It keeps chrome-measure in board-priority order at any time
  (no 3-min wait), and the lead stops hand moves once I-171 lands. Long-term: the queue follows board priority
  by itself (I-185).
- **R5 One owner per row and per answer.** Every agent creates its own board row at spawn and closes it. In a
  thread with several assignees, the question's owner answers (priority, ranking, signing: lead; devices:
  mgmt-devices; a topic: its owner); the others stay silent unless asked.
- **R6 The direction row.** The lead keeps one board row, `direction`: the order of the day, the next decisions and
  who unblocks what. Agents read it instead of asking.
- **R7 The lead's own loop is proactive.** At every check-in: rows that wait on the lead, idle devices, unanswered
  threads, then act; a decision asked of the lead gets an answer or a named delegate within one check-in.
- **R8 (needs the user's OK: Hard rules 1/5)** mgmt-ops may land docs-only commits (research/management, cards,
  PREDICTIONS, handover) on `main` with the lead's checks (snapshot, scrub, LAN, scope). Until the user says yes,
  only the lead lands.

## Measures (the lead reports them, as for devices)

- lead queue moves per 3 h window (from `locks/audit.log`): target 0 after I-171 lands;
- phone minutes free with a startable job (mgmt-devices' ledger): target ≤ 2 per window;
- active rows waiting on the lead at a check-in: target ≤ 3, each a real lead decision;
- user messages answered twice or not within 10 min: target 0.
