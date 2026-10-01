# KPI report 2026-10-01T01:19:22.301Z (since 2026-09-30T23:06:00.000Z)

| area | KPI | now | note |
|---|---|---|---|
| Goal | Chrome frames >50 ms, A/A floor (median, quiet host) | 4 | target 0 |
| Goal | Chrome frames >34 ms, A/A floor | 8 | target ~0 |
| Goal | best patched Chrome >50 ms (single topic) | 3 | any clean? |
| Goal | best patched Chrome >34 ms (single topic) | 6 |  |
| Goal | A/Bs with a disjoint "better" on frames >50 ms / >34 ms | 0 / 0 | the goal metrics; >20 ms and fps are proxies |
| Goal | combined-overlay A/Bs measured / clean | 1 | clean: 1 |
| Goal | iPhone baseline scroll fps / >34 / >50 (median) | {"fps":null,"gt34":null,"gt50":null,"n":0} | target 60 / ~0 / 0 |
| Goal | iPhone best patched (single topic) | - |  |
| Flow | topics landed / total (TOPICS.md incl. N-list) | 8 | of 25 |
| Flow | topics in progress (branch or worktree) | 6 |  |
| Flow | topic lead time, first A/B -> landed (min) | countdown-idle-raf: 176.6 / nav-hit-test: 126.5 / phone-invisible-shrink: 62 / commission-forced-layout: 117.8 / large-area-blur: 127.3 / layout-animations: 157.1 / pain-offscreen-notes: 128.4 / morph-panel-lazy-mount: 82.7 |  |
| Flow | in-progress topics: age since first A/B, median / max (min) | {"median":196.9,"max":216.5} | nothing counts until landed and combined |
| Flow | commits on main: tool / fix / research / docs | 6 / 7 / 9 / 43 |  |
| Lock | A/B sessions started / completed / not completed (queued, running or killed) | 8 / 4 / 4 |  |
| Lock | queue wait per A/B, median / max (min, estimated) | {"median":0.6,"max":0.7} |  |
| Lock | chrome-measure utilization over the A/B window (%, lower bound) | 39 | window h: 0.7 |
| Lock | queue now: length / short / max wait (min) | 4 / 4 / 2.8 |  |
| Clean | runs started at load1 <= 6 (%) | 72 | n = 36 |
| Clean | runs started at load1 > 10 (contaminated) | 10 |  |
| Clean | median load1 at run start | 3.6 |  |
| Clean | host now: load1 / CPU busy % | 4.1 / 61 |  |
| Incidents | opened / resolved / active | 4 / 0 / 4 |  |
| Incidents | time to resolve, median / max (min) | {"median":null,"max":0} |  |
| Incidents | fix ready -> resolved, median (min) | - |  |
| Incidents | landed on main but not resolved in the store |  |  |
| Arch | scorecard rows / rows with adopted 0 or pending | 5 / 3 | adoption by owners is the real metric |
| Arch | measurement-review experiments started (E1, E3, E4, N9, N1) | nav-morph-all / anim-ablation |  |
| Learn | EXPERIMENTS.md rows / clean validity / diff kept / benchmark runnable | 73 / 14 / 37 / 0 | bench stays 0 until tools/bench.mjs lands |
| Learn | bench.json files / variant diffs / runner on main | 1 / 332 / false |  |
| Learn | findings on the board / open | 15 / 15 |  |
| Agents | worktrees / landed-or-empty (cleanup debt) / committed & untouched >30 min / >20 commits behind main | 22 / 7 / 1 / 6 |  |
| User | user prompts / loop prompts / process questions per hour | 18 / 0 / 2.8 |  |
| Lead | messages the lead handled per hour (all incoming) / max in any 10 min | 166.8 / 74 | lower is better: mgmt-ops absorbs routine |
| Lead | incoming: agent+teammate / notifications (of which interim noise) / user / interrupts | 68 / 284 (96) / 18 / 0 |  |
| Lead | incoming that needed a lead decision (%) | 14 | keyword heuristic |
| Lead | lead actions: decisions (spawn+land+triage) / routine (relay+status) / decision share % | 58 / 102 / 36 | higher share is better |
| Lead | relays (SendMessage) per hour | 32 |  |

## Chrome A/B results (mobile unless noted), medians baseline -> patched

| topic | created (UTC) | vp | n | load1 | clean | >50 ms | >34 ms | >20 ms | fps |
|---|---|---|---|---|---|---|---|---|---|
| layout-animations | 23:13 | mobile | 5 | 16.3-30.5 | no | 6 -> 6 | 15 -> 14 | 122 -> 126 | 63.5 -> 64.3 |
| nav-morph-all | 23:37 | mobile | 5 | 2.9-4.3 | yes | 4 -> 3 | 7 -> 6 | 70 -> 36 | 74.9 -> 87.3 |
| wave1-partial | 23:47 | mobile | 5 | 3-4.4 | yes | 4 -> 5 | 10 -> 6 | 65 -> 24 | 74.9 -> 95.4 |
| nav-morph-all-v2 | 23:53 | mobile | 3 | 2.9-4.6 | yes | 4 -> 3 | 7 -> 6 | 62 -> 36 | 77 -> 87.7 |

## iPhone scripted scroll (scroll phase), medians base / patched

| owner | n base / patched | fps | >34 ms | >50 ms |
|---|---|---|---|---|

## Topics

| # | topic | status | first A/B (UTC) | lead time / WIP age (min) |
|---|---|---|---|---|
| 1 | countdown-idle-raf | landed | 21:17 | 176.6 |
| 2 | scroll-engine-batching | in progress | 22:22 | WIP 177.3 |
| 3 | nav-hit-test | landed | 21:19 | 126.5 |
| 4 | phone-invisible-shrink | landed | - | 62 |
| 5 | commission-forced-layout | landed | 21:15 | 117.8 |
| 6 | morph-scrolljack-passive | in progress | - | - |
| 7 | hero-exit-scroll-timeline | in progress | 21:42 | WIP 216.5 |
| 8 | large-area-blur | landed | 21:19 | 127.3 |
| 9 | layout-animations | landed | 21:22 | 157.1 |
| 10 | toolbar-resize | not started | - | - |
| 11 | pain-offscreen-notes | landed | 21:15 | 128.4 |
| 12 | scene-gating-tighten | not started | - | - |
| 13 | morph-panel-lazy-mount | landed | 22:51 | 82.7 |
| N1 | frame-attribution | not started | - | - |
| N2 | morph-composited | not started | - | - |
| N3 | main-thread-infinite-animations | in progress | - | - |
| N4 | custom-property-scope | not started | - | - |
| N5 | layer-diet | not started | - | - |
| N6 | nav-backdrop-budget | not started | - | - |
| N7 | input-listener-diet | not started | - | - |
| N8 | morph-scroll-driven | not started | - | - |
| N9 | scene-gate-flap | not started | - | - |
| N10 | transition-frames | not started | - | - |
| N11 | vendor-scrollend | in progress | - | - |
| N12 | nav-scroll-handler | in progress | - | - |

Fix dirs in flight (branches/worktrees, not on main): main-thread-infinite-animations, scroll-engine, morph-scrolljack-passive, vendor-scrollend, hero-exit-scroll-timeline, countdown-idle-raf--layers, countdown-idle-raf-v08, abl-w1, anim-ablation, scroll-engine--10, scroll-engine--engine-only, scroll-engine--hyst, scroll-engine--unskip, se-instr, unskip-w1, nav-scroll-handler, large-area-blur--platform-none, vendor-scrollend--drop, vendor-scrollend--task, hero-exit-scroll-timeline--noblur

## Incidents

| id | class | status | assignee | resolve (min) | ready->resolved (min) | tool commit on main | stale |
|---|---|---|---|---|---|---|---|
| I-020 | tool | triaged | ts-prio | open 117.3 | - | - |  |
| I-021 | tool | fixing | ts-i021 | open 114.2 | - | - |  |
| I-022 | tool | fixing | ts-i002 | open 112.1 | - | - |  |
| I-023 | tool | fixing | ts-i017 | open 8.1 | - | - |  |

## Worktrees

| branch | ahead | behind | dirty files | last commit age (min) | kind |
|---|---|---|---|---|---|
| worktree-agent-a03218c7c8f9587ed | 0 | 4 | 2 | 65.2 | none |
| worktree-agent-a0b5fe94cfd97f3aa | 1 | 2 | 0 | 0.4 | deliverable |
| worktree-agent-a13d7bfa5a75e0fed | 0 | 2 | 0 | 65.1 | none |
| worktree-agent-a1722cf5058e25591 | 7 | 2 | 8 | 64.1 | deliverable |
| worktree-agent-a1ecf91dac9344dc2 | 0 | 0 | 3 | 0.9 | none |
|  | 0 | 0 | 8 | null | none |
| worktree-agent-a277ea00c8773c1ea | 9 | 13 | 2 | 68.2 | deliverable |
| worktree-agent-a2e856b509f7d6199 | 0 | 18 | 0 | 74.4 | none |
| worktree-agent-a304ca7f869d9823f | 0 | 2 | 1 | 65.1 | none |
| worktree-agent-a373e2f566cb7a369 | 0 | 0 | 0 | 0.9 | none |
| worktree-agent-a4091af4a88270aa0 | 0 | 42 | 1 | 112.9 | none |
| worktree-agent-a53f4ec08506b7442 | 0 | 59 | 0 | 125.8 | none |
| worktree-agent-a5ba00bc1e298fb33 | 1 | 38 | 0 | 97.9 | deliverable |
| worktree-agent-a6a570e184a2f6eba | 3 | 2 | 2 | 63.7 | deliverable |
| worktree-agent-a700c6e710c364d49 | 0 | 53 | 0 | 115.6 | none |
| worktree-agent-a77e2ec753b6381fb | 6 | 64 | 1 | 125.6 | deliverable |
| worktree-agent-a7da36df115c2e662 | 0 | 23 | 0 | 79.3 | none |
| worktree-agent-a7fad4cb1a3bb1d34 | 0 | 2 | 9 | 65.1 | none |
| worktree-agent-a8690dc08bafd5f3c | 0 | 0 | 17 | 0.9 | none |
| worktree-agent-ac3dd7811b6861c73 | 1 | 0 | 0 | -0.1 | deliverable |
| worktree-agent-ac5e1ce69c84fd93d | 0 | 18 | 0 | 74.4 | none |
| worktree-agent-ad57dbcaaef308061 | 4 | 20 | 10 | 75.3 | tool |
