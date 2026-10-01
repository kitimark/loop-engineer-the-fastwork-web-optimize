# Management: the user's decisions, execution principles, KPIs, plan, loop

By `mgmt-lead` (management team, read-only; charter in `fixes/LEAD.md` "Management team"). Iteration 1,
2026-09-30 ~23:12Z. Sources: the user's own prompts in the session transcript (read locally, never sent
anywhere, not quoted beyond short phrases), `git log`, the shared store (`.git/fastwork-mirror/`), every
checkout's `fixes/*/results.json` and `out/`, and the docs named below. `mgmt-ops` (the operator,
`fixes/LEAD.md` "Delegation") executes this plan; the lead keeps landing, incidents, spawns, priorities and
anything user-facing.

Re-run the numbers: `node research/management/tools/kpi.mjs --transcript <session.jsonl>` (section 5).
Baseline: [`data/kpi-baseline.md`](data/kpi-baseline.md) and `data/kpi-baseline.json`.
Usage meter (user T-010, every 30 min): `node research/management/tools/usage.mjs [--reset 2026-10-01T21:20Z]`, tokens per 5-h window, last 30 min, agent and model from the local transcripts (counts only, no text); appends to `<git-common-dir>/fastwork-mirror/usage/usage.jsonl` (local, survives sessions); plan % is an ESTIMATE from the user's readings (`--calibrate <ISO>=<percent>`, `usage/calibration.jsonl`).

## 1. The user's decisions

Times UTC, 2026-09-30 (commit times in `git log` are UTC+7). "Intent" is the goal behind the literal request.

| # | time | decision (literal) | what it produced | intent |
|---|---|---|---|---|
| D1 | 17:05 | connect the iPhone's Safari and measure fastwork.com; probe together | `research/01-initial-investigation` (4764e8d) | ground truth is the real device, analysed together |
| D2 | 17:30 | reframe: "I don't work at Fastwork", personal educational study of iPhone scroll lag; "ask me to scroll" | README/CLAUDE.md disclaimer; hard rules 2, 3, 12 | stay legitimate and private; the user is a test resource, on request |
| D3 | 17:53 | "laggy at the top and ending of the website" | topics 6, 7, 13 (hero exit, bottom morph) | fix what a person feels, where they feel it |
| D4 | 17:56 | desktop Chrome 4x is laggy too: same code? | calibration question | a fast desktop proxy for the phone |
| D5 | 18:06 | fork the site locally, it should lag the same | mirror tooling (4df6461) | a controllable, reproducible baseline |
| D6 | 18:22 | chrome-devtools MCP got stuck | hard rule 8 (no MCP traces) | tools must not hang the team |
| D7 | 18:30 | probe 4x/6x/20x, calibrate, subagents, commit to main | `research/cpu-throttle-calibration` (CPU 6x) | a calibrated proxy, recorded in the repo |
| D8 | 19:33 | one subagent per topic in worktrees, each with a diff and a "why"; re-architect for parallel work (ports, harness) | parallel fix workflow (a17b6bf) | throughput with isolation; explainable deliverables |
| D9 | 19:38 | agent teams; agents occupy and release the one iPhone | locks and `iphone` lease (a17b6bf) | share a scarce device safely |
| D10 | 19:54 | Serena for worktrees | 30996ec, 76298e5, 611a6ac | better code navigation |
| D11 | 20:00 | tests for the tools: "no one should accidentally break them" | test suite, pre-commit hook (167a083, 971e343) | shared infrastructure stays correct |
| D12 | 20:03 | move every working agent into its own worktree | hard rule 5 | isolation for everyone, now |
| D13 | 20:09 | agent instructions; helpers pick model and effort per task | `.claude/agents/`, AGENT_ROLES.md (99f8a2f) | right-size cost and delegate |
| D14 | 20:15-20:17 | merge with rebase; make it a MUST | hard rule 1, hooks (2388596..a41f52c) | linear, bisectable history |
| D15 | 20:37 | loosen tool edits: "the test is enough", agents may fix tools | hard rule 6 (a41f52c, 49d337b) | unblock agents; trust tests over approvals |
| D16 | 20:41 | measure grep vs Serena | `research/code-navigation-benchmark` | adopt a tool on evidence |
| D17 | 20:46 | full-loop team roles: toolsmith, incident coordinator, announce fixes | incident.mjs, toolsmith, integrator (eb4ccbb, 54a8298) | exceptions are a first-class loop |
| D18 | 20:49 | rebase landing shouldn't need my approval | pre-approved landing (413a293); user set git config | automate the safe path, remove the human |
| D19 | 21:10 | "let's go": owners per topic, measure, new findings get new agents | wave 1 | start delivering |
| D20 | 21:14 | toolsmith for I-001; the lead orchestrates until done | standing authority (252008e) | autonomy; stop asking per step |
| D21 | 21:16 | memory inside the project | docs in repo | knowledge stays local and shared |
| D22 | 21:21 | `/goal` "SOOOOO ULTRA SMOOTH" | goal targets in LEAD.md | the outcome, not activity |
| D23 | 21:25 | a context-heavy agent wraps up; orchestrator + batch agents; "keep low context" | nav-bench handoff (de7bd60) | context is a budget |
| D24 | 21:35-21:46 | what issues as a team? why no subagent for some incidents? | toolsmith per incident | every problem gets an owner |
| D25 | 21:49, 21:58 | main is dirty: commit it | I-007 short lane (25391a2) | main always clean; housekeeping is the lead's |
| D26 | 21:50-21:55 | why no one uses Chrome/iPhone? run Chrome in parallel, measure the load, prioritize resources | `research/measurement-parallelism`, host budget (9c43258) | use the devices; optimise resources |
| D27 | 22:03 | `/loop 5m` blockers and team improvement | 5-min loop | continuous improvement |
| D28 | 22:04 | run long scripts in the background: "you will be a main blocker" | lead habit | the lead must stay responsive |
| D29 | 22:09-22:15 | skip the iPhone (disconnect), document what I must do, ping me later | FINGER_TESTS.md (c15f65e..138e641) | never block on the human; queue human work |
| D30 | 22:19 | `/loop 10m` check agents waiting on something forgotten | idle-agent check | no idle agents |
| D31 | 22:21 | make harness-blocked scripts safer | I-012 `lock.mjs doctor/repair` (ba10fd0) | audited tools instead of raw writes |
| D32 | 22:23 | the team shares findings | I-013 board (c2c660c), FINDINGS.md (31354c5) | knowledge reaches the next owner |
| D33 | 22:28-22:30 | architecture team of experts, public research, mentoring, 1:1 scorecards, scale up/down; on opus | ARCH_TEAM.md (87b849f, 46a302c) | outside expertise, measured by adoption |
| D34 | 22:36, 22:45 | automated benchmark per topic, new role | arch-bench design, DoD item 8 (6bcb6a7, c318e80, 490620a) | wins can't silently regress |
| D35 | 22:39 | overloaded: postmortem and fix | postmortem (080cdd4), rules (476a9fd) | blameless, systemic learning |
| D36 | 22:43 | do we need to re-measure what ran then? | validity tags (clean / provisional / contaminated) | trust in numbers |
| D37 | 22:51 | architects review measurements vs experiments for new ideas | `measurement-review.md` (a7d91af), DIRECTION.md (6407cba) | learn from the data we have |
| D38 | 22:54-22:56 | record every experiment, even bad ones, each with a benchmark | EXPERIMENTS.md (bba2d7d, e0bdffb, 2c94e26: 72 rows) | no repeated dead ends; reproducible |
| D39 | 22:59 | management team: understand my decisions, principles, improve, measure, loop | this directory (37a3a48) | a feedback loop on how the team works |
| D40 | ~23:05 | delegate as much as possible; lead keeps important decisions ("you were interrupted a lot") | `mgmt-ops` operator (6ab6820) | protect the lead's attention |
| D41 | ~23:25 | "for design team who didn't touch the tools, should run only unittest. we could make the unittest can ensure they won't touch tools by accident. delegate to the roles that need to do investigation, distinguish, make decision and implement." | I-021; toolsmith ts-i021 (short lane only): tooling vs non-tooling roles, a fast unit-only run plus a guard that no tooling was touched, docs; hook changes go to the user via the lead | stop spending the lock slot and CPU on the full suite for agents that never touch tools |

**Themes.** (a) *Evidence and validity* D1, D4, D5, D7, D16, D34-D38: numbers must be real, reproducible
and comparable. (b) *Throughput by parallelism* D8, D9, D12, D19, D26. (c) *Resource discipline* D23, D26,
D28, D35: context, CPU, the one Chrome slot, the one phone. (d) *Autonomy / don't block* D15, D18, D20, D28,
D29, D30, D40: neither the lead nor the user may be the bottleneck. (e) *Team structure and roles* D13, D17,
D24, D33, D39, D40, D41. (f) *Knowledge sharing* D21, D32, D38. (g) *Tooling reliability* D6, D11, D15, D31, D41.
(h) *iPhone is the truth, Chrome the proxy* D1-D4, D7, D9, D29. (i) *Safety and privacy* D2, D14, D31.
(j) *Continuous improvement* D27, D30, D33, D39.

**Pattern.** Of 92 user prompts, about 5 per hour are process questions ("why no one uses Chrome?",
"what are they doing?", "main is dirty"): the user keeps finding team problems before the lead reports
them. Nearly every structural piece (tests, hooks, incidents, board, arch team, ledger, benchmarks,
management, delegation) was created in response to such a prompt.

## 2. Execution principles (ranked)

1. **Measure what the goal measures, on a quiet host, on the combined page.** Progress is frames >50 ms and
   >34 ms (Chrome 6x) and iPhone fps / >50 ms, measured clean (load1 ≤ 6) on the combined overlay. Single
   topic "better" on >20 ms or fps is a hint, not progress. *From* D22, D35, D36, D7, D1; the postmortem;
   measurement-review §0. *Loop:* a wave is done only with a clean combined A/B; plan quiet windows.
   *Check:* clean-run share, combined A/Bs per wave, disjoint "better" on gt50/gt34.
2. **Remove whole frame classes, biggest expected gain per slot first.** Every slot names the frame it
   deletes (a LoAF entry such as the morph IO mount, `iE`, `l`; an iPhone transition cluster) and the
   expected delta. *From* D3, D37, DIRECTION.md principle 1; measurement-review: no fix so far targets a
   >50 ms frame, gt50 is flat in every A/B. *Loop:* queue order by DIRECTION, not arrival. *Check:* share of
   slots whose hypothesis names a >34/>50 ms frame.
3. **The one Chrome slot is the constraint: feed it only ready, non-blind work on a quiet host.** Prototype,
   parity and Tier A counts happen before queueing; GPU and touch topics go to the iPhone; nothing heavy runs
   next to a holder. *From* D26, D28, D35; I-007, I-011, I-016, I-017; parallelism study (N = 1 slot).
   *Loop:* slot ticket at queue time. *Check:* queue wait, clean share, blind A/Bs (target 0).
4. **Land small, integrate early; work in progress is inventory.** Nothing helps the goal until it is landed
   and combined. *From* D8 (diff + why per topic), D14, D20, D25; LEAD.md definitions of done. *Loop:*
   land batches every ≤ 30 min, WIP limit tied to slot throughput, combine as soon as a wave's topics land.
   *Check:* lead time first A/B → landed, topics in progress, combined A/Bs.
5. **Probe the mechanism first; keep every experiment reproducible.** Counter probes before fixes, Tier A
   mechanism checks before timing slots, variant diffs and benchmarks for every row. *From* D16, D34, D38;
   FINDINGS P10 (the pain premise was wrong), EXPERIMENTS.md (8 `broke`, 7 abandoned only for budget).
   *Loop:* E2/E5 probes before N10 fixes; the bench runner is P0 tooling. *Check:* runnable benchmark rows.
6. **Protect attention: the lead decides, the operator routes, agents self-serve.** *From* D18, D20, D28,
   D29, D30, D40. *Loop:* reports go to mgmt-ops; the lead sees land batches, decisions, user-facing needs
   and a 30-min digest. *Check:* lead incoming per hour, decision share of lead actions, user process
   questions per hour.
7. **Every surprise becomes an incident with an owner, a test and an announcement; fix the system.** *From*
   D11, D15, D17, D24, D31, D35. *Loop:* triage ≤ 10 min, toolsmith per tool incident, tool fixes land first,
   store kept in sync. *Check:* time to resolve, active unassigned incidents.
8. **Knowledge reaches the next owner in the repo; advice counts when adopted.** *From* D21, D32, D33, D37.
   *Loop:* owners post to the board, mgmt-ops folds; each arch recommendation gets an owner and a slot or an
   explicit "no". *Check:* findings posted/acked, recommendations started.
9. **Size the team to the constraint.** More agents than the slot can measure add load, not speed. *From*
   D23, D33 (scale by 1:1), postmortem (≤ 6 CPU-active agents; 13 agents + 19 servers held load 10-14 with no
   Chrome). *Loop:* retire finished agents and worktrees at landing; rebase or retire stale ones.
   *Check:* worktrees vs active owners, idle host load.
10. **The guard rails are fixed; improve inside them.** Local only, no push, rebase-only, read-only
    baseline, device leases. *From* D2, D9, D14, hard rules. *Check:* zero violations, hooks enabled.

## 3. KPI baseline (2026-09-30 23:12Z)

Full report: [`data/kpi-baseline.md`](data/kpi-baseline.md). Script: `tools/kpi.mjs` (read-only, local).

| area | KPI | baseline | target |
|---|---|---|---|
| Goal | Chrome A/A floor (quiet): frames >50 / >34 ms per run | 4 / 8 | 0 / ~0 |
| Goal | best single-topic patched Chrome >50 / >34 ms | 5 / 10 (all contaminated) | - |
| Goal | A/Bs with a disjoint "better" on >50 / >34 ms | 0 / 1 (pain, provisional) | ≥ 3 per wave |
| Goal | combined-overlay A/Bs (clean) | 0 (0) | 1 clean per wave |
| Goal | iPhone baseline scroll: fps / >34 / >50 ms | 52.5 / 17 / 6 (n = 15) | 60 / ~0 / 0 |
| Goal | iPhone best patched (phone-invisible-shrink) | 55.1 / 12 / 5 | - |
| Flow | topics landed / listed (13 + N1-N11) | 2 / 24 | wave 1 (≥ 7) landed |
| Flow | lead time first A/B → landed | 56, 63 min | ≤ 60 min |
| Flow | in-progress topics / WIP age median | 11 / 111 min | ≤ 6 / ≤ 60 min |
| Flow | commits on main: tool / fix / research / docs | 18 / 2 / 14 / 53 | more fix commits than doc commits |
| Lock | A/B sessions started / completed | 24 / 14 | - |
| Lock | queue wait per A/B, median / max (estimated) | 17 / 45 min | ≤ 10 / ≤ 20 min |
| Lock | queue now: length / max wait | 9 / 23 min | ≤ 3 |
| Clean | runs started at load1 ≤ 6 / > 10 | 11 % / 77 of 128 | ≥ 80 % / 0 |
| Clean | median load1 at run start; host now | 11.8; 25.5 at 91 % CPU | ≤ 6 |
| Incidents | opened / resolved / active | 19 / 15 / 4 (I-016..I-019) | active ≤ 2 |
| Incidents | time to resolve median / max; fix ready → resolved | 39 / 85 min; 11 min | ≤ 30 min |
| Arch | scorecard members with adoption 0 or pending; E1/E3/E4/N1/N9/N10 started | 3 of 5; 1 of 6 (anim-ablation) | ≥ 4 of 6 |
| Learn | EXPERIMENTS.md rows / clean / diff kept / benchmark runnable | 72 / 14 / 36 / 0 | all landed topics runnable |
| Learn | findings board posts | 0 | ≥ 1 per owner |

Iteration 2 interim values (recorded by mgmt-ops, 2026-09-30 23:55Z; mgmt-lead re-measures all rows):

| area | KPI | now | source |
|---|---|---|---|
| Goal | combined-overlay A/Bs (clean) | 1: `wave1-partial` (5 landed wave-1 topics, unreviewed partial combine), load1 3.0-4.4, mobile 6x n=5: fps 74.9 [73.8-78.5] -> 95.4 [93.2-95.7], >20 ms 65 [55-75] -> 24 [21-28] (disjoint), >34 ms 10 -> 6 and >50 ms 4 -> 5 within noise | `fixes/wave1-partial/` (4494f0c) |
| Goal | clean single-run mechanism check | E1 nav-morph-all at load1 2.9-4.3: morph IO LoAF 5/5 -> 0/5, fps 74.9 -> 87.3, >20 ms 70 -> 36 | `fixes/nav-morph-all/` (branch) |
| Goal | what remains > 50 ms in Chrome | gtag `onscrollend` (N11), the #13 mount (lands with countdown), `iE` (scroll-engine diagnostics name it) | F-005, wave1-partial README |
| Flow | topics landed | 5 of wave 1 (phone-invisible-shrink, commission, pain, nav-hit-test, large-area-blur) | main |
| Agents | worktrees / landed-or-empty / > 20 commits behind main | 28 / 13 / 9 | ≤ active + 3 / 0 / 0 |
| User | process questions per hour | 4.6 (6.0 in wave 1) | ≤ 1 |
| Lead | messages handled per hour (all) / max in 10 min | 133 (303 in wave 1) / 103 | ≤ 25 |
| Lead | incoming needing a lead decision | 14 % (169 interim notifications) | ≥ 50 % |
| Lead | lead actions: decisions / routine / decision share | 120 / 324 / 27 % | ≥ 60 % |
| Lead | relays (SendMessage) per hour | 29 (78 in wave 1) | ≤ 5 |

Caveats: queue wait = A/B wall time minus the fastest observed per-run time (no grant history exists:
`locks/audit.log` only logs repairs); the lead's "decision vs routine" split is a keyword heuristic on the
transcript; "wave 1" = since 21:10Z.

## 4. Improvement plan (ranked)

| # | principle | action (who: what) | expected KPI change | measure (when) |
|---|---|---|---|---|
| 1 | 1, 3 | **Make clean measurement the default.** Lead: land ts-i017's host gate + per-run contamination flag (postmortem (a)+(d)) before more timing A/Bs, set I-017's assignee (`incident.mjs update I-017 --assignee ts-i017`). mgmt-ops: hold normal A/Bs while load1 > 8 (short lane and iPhone continue); ask the user (via the lead) to close heavy desktop apps before a clean window; ≤ 6 CPU-active agents. | clean runs 11 % → ≥ 80 %; median run load 11.8 → ≤ 6; contaminated runs → 0 | Clean rows, after the next 5 A/Bs |
| 2 | 1, 4 | **Get the first goal number: land wave 1 and measure it combined.** mgmt-ops: land batch of the reviewed wave-1 topics; lead lands it; spawn `wave1` integrator: `node tools/fix.mjs combine all-wave1 <landed topics>` (wave1-dry: no conflicts) then `fix.mjs ab all-wave1 --runs 5` in the first quiet window. Then stack E1 and wave 2 `--on all-wave1`. This moves DIRECTION's slot 4 before slot 3's re-runs: single A/Bs on the plain baseline must be redone on the combined base anyway (cost migrates to the next reader, FINDINGS). | topics landed 2 → ≥ 7; combined clean A/Bs 0 → 1; first honest gt50/gt34 vs the floor (4 / 8) | Goal and Flow rows, after the integrator reports |
| 3 | 2, 3, 5 | **Slot ticket: only ready, targeted, non-blind work enters the queue.** mgmt-ops: before an owner queues, it posts: frame class targeted (LoAF entry or iPhone cluster), expected delta, parity + Tier A counts passed. No Chrome slots for GPU/touch topics (large-area-blur re-runs, morph-scrolljack): iPhone or finger only. Lead: reorder by DIRECTION (`lock.mjs repair --move`, I-019). | queue wait median 17 → ≤ 10 min; A/Bs with disjoint "better" on gt50/gt34: 0/1 → ≥ 3 per wave; queue length ≤ 3 | Lock and Goal rows, hourly |
| 4 | 6 | **Take routine off the lead.** Lead, once: message every active agent "report to mgmt-ops (ac3dd7811b6861c73), not the lead; hand back once at the end, no interim reports". mgmt-ops: land batches and a 5-line digest at most every 30 min; answers the user's status questions proactively in the digest. | lead incoming 133/h → ≤ 25/h; decision share 27 % → ≥ 60 %; relays 29/h → ≤ 5/h; user process questions 4.6/h → ≤ 1/h | `kpi.mjs --since 2026-09-30T23:06Z --transcript …`, after 1 h |
| 5 | 5, 2 | **Ship the measuring tools before more fixes: bench runner, E5 per-frame log, N1 attribution.** Lead: toolsmiths for `tools/bench.mjs` (arch-bench design), E5 (`verify.json` per-frame `[t, dt, scrollY]` + `Performance.getMetrics` deltas; measurement code: reviewer + `test:chrome`) and I-018; they need no timing slot, only the short lane. | benchmark-runnable ledger rows 0 → every landed topic; I-018 resolved; every A/B readable per cluster | Learn row, Incidents row, at the next iteration |
| 6 | 9, 4 | **Retire finished agents and worktrees at landing; rebase the stale ones.** mgmt-ops: list worktrees with 0 commits ahead (13) and > 20 behind main (9) in each land batch; lead removes landed ones (`git worktree remove`, `git branch -d`) and shuts idle agents down; stale agents `git rebase main` or retire (old tool code caused I-011). | worktrees 28 → ≤ active owners + 3; stale 9 → 0; lower idle host load | Agents row and idle load1, next iteration |
| 7 | 8 | **Close the adoption loop.** mgmt-ops: every measurement-review item (E1-E5, W1-W3, R1-R3) and every DIRECTION "started" topic gets an owner and a slot ticket, or a recorded "no"; owners post findings with `finding.mjs post`; the arch scorecard counts adoptions per recommendation. | recommendations started 1/6 → ≥ 4/6; board posts 0 → ≥ 1 per owner; arch members with 0/pending adoption 3 → ≤ 1 | Arch and Learn rows, next iteration |

**Stop doing** (doesn't serve the goal):
- Timing A/Bs at load1 > 10 (77 of 128 runs so far): not comparable, rarely decisive. Wait for the gate.
- Chrome slots for GPU- or touch-only effects (blur re-runs, passive listeners): blind by construction.
- Lock-bypass exceptions and multi-Chrome experiments outside an announced quiet window.
- Quoting fps or frames >20 ms as goal progress: report >34 / >50 ms and the iPhone.
- Keeping finished agents, worktrees and serve.mjs processes alive; agents on old tool code.
- Relaying routine messages through the lead; interim task notifications (169 so far).
- Widening WIP (new N-topics beyond one prototype at a time) before wave 1 is combined.
- New process documents that no KPI above needs: 53 doc commits vs 2 fix commits on main.

## 5. Loop

**Re-measure** (read-only, ~6 s, safe while others measure; it takes no lock and runs no Chrome):

```sh
node research/management/tools/kpi.mjs \
  --transcript ~/.claude/projects/<this-project>/<session>.jsonl \
  --compare research/management/data/kpi-baseline.json \
  --json research/management/data/kpi-<yyyy-mm-ddThhmm>.json > research/management/data/kpi-<yyyy-mm-ddThhmm>.md
# window KPIs (lead load, A/Bs, incidents) only since a change, e.g. the delegation to mgmt-ops:
node research/management/tools/kpi.mjs --since 2026-09-30T23:06Z --transcript <session.jsonl>
```

`--compare` adds a baseline column to the KPI table. Each iteration commits its `kpi-<stamp>.{md,json}` and a
short "Iteration N" section here: what the lead executed, the KPI deltas, what moved and what didn't, and
the next plan (≤ 7 items).

**Triggers for the next iteration** (whichever comes first):
- the lead has executed plan items 1-4, or 90 minutes have passed;
- the wave-1 combined A/B has reported (the goal numbers change);
- a KPI alarm: clean-run share < 50 % over the last 5 A/Bs, queue wait > 30 min, lead incoming > 40/h,
  an incident active > 60 min, or the user asks a process question the digest should have answered;
- a new user decision (add it to section 1 first: literal request, what it changed, intent).

## Iteration 1.5: retro on the short-lane blockage (user question, 2026-09-30 23:30Z)

**What happened.** Non-tooling agents ran the full `npm test` in the chrome-measure short lane, and short
jobs waited behind 25-40 min A/B leases. ts-bench was queued from 23:01, and from 23:07 there were 4-6 short
waiters at once. The user noticed first; the lead then opened I-020 and I-021.

**Root cause: management watched throughput and order, not waiting time.**
- The signals were visible:
  - `lock.mjs status` listed the short waiters with their `since` times;
  - agents wrote "queued short to commit";
  - the baseline had queue wait 17/45 min with 9 in the queue.
- Nobody had a threshold that turned them into a defect:
  - kpi.mjs estimated wait per A/B, not per lane, and ran only on request;
  - mgmt-ops read the waiters as queue order, because CLAUDE.md says short jobs "wait for the current holder only";
  - the lead was saturated by relays (133 messages/h) and read the waits as expected.
- No routine asked what each agent was waiting on, or checked a holder's age and CPU against its expected
  length.

**Detection change.** `node research/management/tools/kpi.mjs --friction` takes about 6 s, reads the store
only and exits 2 on an alarm. For every holder and waiter it prints the lane, the age, the checkout's lag
behind main, and the holder's process-tree CPU.
- Alarms: SHORT-WAIT > 10 min, NORMAL-WAIT > 30 min, QUEUE-LONG > 3, HOLDER-OVERDUE > 2x expected,
  HOLDER-IDLE (holder tree ~0 CPU while others wait), QUIET-WASTED (quiet host but blocked lock),
  INCIDENT-UNOWNED > 60 min.
- Warnings: OLD-TOOLS holder or waiter (> 20 commits behind), IPHONE-PARKED / IPHONE-STALE, TOOLS-TOUCHED
  on fix branches, ORPHAN-SERVERS, STRAY-CHROME.
- The routine (mgmt-ops, every check-in): paste the ALARM lines into the digest. An alarm present in two
  consecutive check-ins becomes an incident candidate for the lead, with a recommendation.
- First run (23:28Z): 5 SHORT-WAIT alarms (11-21 min) and QUEUE-LONG (9 waiting, 6 of them short) on a quiet
  host (load1 3.3). It would have fired at about 23:12.

## Iteration 2 (2026-10-01 01:20Z)

Data: `data/kpi-2026-10-01T0120.md` (full history, `--compare` with the baseline) and `data/kpi-since-2306.md`
(window since the delegation to mgmt-ops). Inputs: main eb8a447 + handover (e307e90), `ops-handover.md`,
incidents I-020..I-023.

**What moved**
- **Flow.** Wave 1 landed: 2 → 8 topics. Lead time from first A/B to landing was 62-177 min (median ~127).
  In-progress topics went 11 → 6.
- **Clean measurement.**
  - Since 23:06, 72 % of 36 runs started at load1 ≤ 6 (baseline 11 %); median load1 at run start is 3.6.
  - First clean combined A/B: wave1-partial. fps 74.9 → 95.4 and frames >20 ms 65 → 24.
  - E1 (nav-morph-all), clean: frames >20 ms 70 → 36, fps +12.
- **Knowledge.** 15 findings on the board (was 0); E1 is now done as well.
- **Friction.** No alarms at 01:37 (they fired at 23:28); queue wait since 23:06 under 1 min.

**What did not move**
- **Goal metrics.** Frames >50 ms and >34 ms are still within noise in every clean A/B:
  - wave1-partial: >50 ms 4 → 5, >34 ms 10 → 6;
  - E1: >50 ms 4 → 3, >34 ms 7 → 6;
  - disjoint "better" verdicts on >50 / >34 ms are still 0 / 1.
  - Wave 1 removed the medium frames, but the long tail is untouched: the named LoAF entries (gtag `onscrollend`,
    engine `iE`, future `l`) are still there.
- **Throughput.** Only 4 of the 8 A/B sessions started since 23:06 completed. The all-wave1 goal run (00:18-00:53)
  produced nothing (I-023).
- **Lead load went up, not down.** 133 → 167 incoming messages per hour, 32 relays per hour, decision share 27 → 36 %.
  Task notifications go to whoever spawned the agent, which is the lead. Agents that end a turn with background work
  still running produce interim notifications (96 since 23:06).
- **iPhone dark for 3.4 h.** No benchmark is runnable yet (`tools/bench.mjs` isn't on main). I-016/I-017 landed in
  f144d8f but are still "triaged" in the store.

**New failure modes**
1. **Measurement code shipped without a field test.**
   - The host gate passed `npm test` against a fake host.
   - Its per-run recheck never ran against a real Chrome on a busy host, and `test:chrome` was itself broken (I-022).
   - So the first real use was the night's most valuable slot: a 33-min hang holding the lock, then a broken
     contaminated run.
   - Rule: measurement code lands only after a canary in the main checkout (`fix.mjs ab --aa --runs 1`, plus
     `test:chrome` passing), and `verify.mjs` needs a watchdog: no progress for N s → fail and release the lock.
2. **Ops hit its context limit** after about 2 h of relays, monitors, digests and queue moves.
   - The handover file saved it.
   - Rule: `ops-handover.md` is a living state file, updated with every digest, so a restart costs minutes.
   - Restart mgmt-ops on schedule (about every 2 h, or at ~60 % context), not on exhaustion.
   - Monitors stay background scripts, and their output stays out of the context.

**Team size.** Holds are now 5-7 min, but the slot's real throughput is about 2 completed A/Bs per hour. The limits
are the gate (Spotlight and mediaanalysisd hold "other CPU" above 20 %), I-023, and the short-lane starvation
(I-020), not hold length. Wave 2 needs about 6 holds (N11, scroll-engine /10, N12, hero-exit, countdown 05/08, E4),
about 1 slot-hour once the gate is open. About 12 agents is too many for that: they add CPU and messages. Run about 8
active: wave1-dry/all-wave1 as integrator, 3 owners with no more than 2 ready-to-measure at a time, 2 toolsmiths
(I-023, then I-020), mgmt-ops, and arch on demand. Stop the finished agents (countdown, layout-animations).
Signal to scale back up: owners idle with a built variant for more than 30 min while the gate is open.

**Plan, iteration 2**

| # | action | KPI change |
|---|---|---|
| 1 | I-023 P0: fix plus a verify watchdog. Land after a canary A/A `--runs 1` and `test:chrome`. Then the announced goal hold: A/A + `all-wave1 --runs 5`. | clean all-wave1 measured: 0 → 1; goal gap known |
| 2 | Wave 2 targets only the long tail: se/10 (`iE`), E4 (`l`), N11 (gtag), N12. Land the E5/I-018 attribution first (ts-i017), so every hold names the frame it removes. | disjoint "better" on >50 / >34 ms: 0/1 → ≥ 2 |
| 3 | Host: the lead asks the user once about Spotlight (`mdutil` off, or a scheduled pause), with the numbers. A gate timeout stains the run instead of stalling it. | sessions completed / started: 4/8 → ≥ 90 %; clean ≥ 85 % |
| 4 | Short lane: land I-020 drain-all and I-021. Raise `lock.mjs run`'s 1 h acquire timeout: queue entries were dropped silently. | SHORT-WAIT alarms 0; no silent drops |
| 5 | Lead load: owners don't end a turn while background work runs. mgmt-ops resumes agents, so their hand-backs go to it. The lead lands only in batches. | lead incoming 167 → ≤ 40/h; decision share ≥ 50 % |
| 6 | Ops durability: living `ops-handover.md`, scheduled restarts, monitors out of context. | unplanned ops restarts 0 |
| 7 | Size: about 8 active agents (above). The iPhone queue (DIRECTION) goes first when the user is back. Resolve I-016/I-017 in the store. | idle host load lower; iPhone ≥ 1 run per wave |

Stop: landing measurement code without a canary; ending turns with background work; queueing from checkouts more than
20 commits behind main; reporting fps or frames >20 ms as goal progress (the wave1-partial headline is a proxy).
