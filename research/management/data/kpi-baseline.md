# KPI report 2026-09-30T23:12:04.555Z

| area | KPI | now | note |
|---|---|---|---|
| Goal | Chrome frames >50 ms, A/A floor (median, quiet host) | 4 | target 0 |
| Goal | Chrome frames >34 ms, A/A floor | 8 | target ~0 |
| Goal | best patched Chrome >50 ms (single topic) | 5 | any clean? |
| Goal | best patched Chrome >34 ms (single topic) | 10 |  |
| Goal | A/Bs with a disjoint "better" on frames >50 ms / >34 ms | 0 / 1 | the goal metrics; >20 ms and fps are proxies |
| Goal | combined-overlay A/Bs measured / clean | 0 | clean: 0 |
| Goal | iPhone baseline scroll fps / >34 / >50 (median) | {"fps":52.5,"gt34":17,"gt50":6,"n":15} | target 60 / ~0 / 0 |
| Goal | iPhone best patched (single topic) | {"owner":"phone-invisible-shrink","fps":55.1,"gt34":12,"gt50":5} |  |
| Flow | topics landed / total (TOPICS.md incl. N-list) | 2 | of 24 |
| Flow | topics in progress (branch or worktree) | 11 |  |
| Flow | topic lead time, first A/B -> landed (min) | phone-invisible-shrink: 56.1 / layout-animations: 62.9 |  |
| Flow | in-progress topics: age since first A/B, median / max (min) | {"median":112.85,"max":116.6} | nothing counts until landed and combined |
| Flow | commits on main: tool / fix / research / docs | 18 / 2 / 14 / 53 |  |
| Lock | A/B sessions started / completed / not completed (queued, running or killed) | 24 / 14 / 10 |  |
| Lock | queue wait per A/B, median / max (min, estimated) | {"median":17.3,"max":44.5} |  |
| Lock | chrome-measure utilization over the A/B window (%, lower bound) | 51 | window h: 1.8 |
| Lock | queue now: length / short / max wait (min) | 10 / 4 / 25 |  |
| Clean | runs started at load1 <= 6 (%) | 11 | n = 128 |
| Clean | runs started at load1 > 10 (contaminated) | 77 |  |
| Clean | median load1 at run start | 11.8 |  |
| Clean | host now: load1 / CPU busy % | 30.4 / 91 |  |
| Incidents | opened / resolved / active | 19 / 15 / 4 |  |
| Incidents | time to resolve, median / max (min) | {"median":39.3,"max":85.2} |  |
| Incidents | fix ready -> resolved, median (min) | 10.6 |  |
| Incidents | landed on main but not resolved in the store |  |  |
| Arch | scorecard rows / rows with adopted 0 or pending | 5 / 3 | adoption by owners is the real metric |
| Arch | measurement-review experiments started (E1, E3, E4, N9, N1) | anim-ablation |  |
| Learn | EXPERIMENTS.md rows / clean validity / diff kept / benchmark runnable | 72 / 14 / 36 / 0 | bench stays 0 until tools/bench.mjs lands |
| Learn | bench.json files / variant diffs / runner on main | 1 / 24 / false |  |
| Learn | findings on the board / open | 0 / 0 |  |
| Agents | worktrees / landed-or-empty (cleanup debt) / committed & untouched >30 min / >20 commits behind main | 28 / 12 / 0 / 9 |  |
| User | user prompts / loop prompts / process questions per hour | 93 / 14 / 4.6 |  |
| Lead | messages the lead handled per hour (all incoming) / max in any 10 min | 132.9 / 103 | lower is better: mgmt-ops absorbs routine |
| Lead | incoming: agent+teammate / notifications (of which interim noise) / user / interrupts | 142 / 578 (170) / 93 / 0 |  |
| Lead | incoming that needed a lead decision (%) | 14 | keyword heuristic |
| Lead | lead actions: decisions (spawn+land+triage) / routine (relay+status) / decision share % | 120 / 324 / 27 | higher share is better |
| Lead | relays (SendMessage) per hour | 29.1 |  |

## Chrome A/B results (mobile unless noted), medians baseline -> patched

| topic | created (UTC) | vp | n | load1 | clean | >50 ms | >34 ms | >20 ms | fps |
|---|---|---|---|---|---|---|---|---|---|
| _aa | 21:16 | mobile | 5 | 2.8-5.8 | yes | 4 -> 4 | 8 -> 9 | 64 -> 70 | 74.5 -> 74.5 |
| pain-offscreen-notes | 21:21 | mobile | 5 | 5.1-12.9 | no | 6 -> 5 | 15 -> 10 | 95 -> 79 | 66.2 -> 72.6 |
| countdown-idle-raf | 21:43 | mobile | 5 | 9.6-19.5 | no | 5 -> 5 | 12 -> 12 | 82 -> 99 | 71.3 -> 68.7 |
| nav-hit-test | 22:01 | mobile | 5 | 11.3-17.5 | no | 5 -> 5 | 14 -> 11 | 98 -> 62 | 69.1 -> 75.3 |
| phone-invisible-shrink | 22:07 | mobile | 5 | 8-20.2 | no | 6 -> 5 | 15 -> 10 | 104 -> 82 | 66.5 -> 71.6 |
| layout-animations | 22:16 | mobile | 5 | 9.5-17.7 | no | 6 -> 5 | 10 -> 11 | 95 -> 89 | 69.6 -> 71.9 |
| scroll-engine | 22:25 | mobile | 3 | 6.7-11.7 | no | 5 -> 5 | 13 -> 12 | 102 -> 98 | 69.2 -> 66.6 |
| hero-exit-scroll-timeline | 22:29 | mobile | 3 | 9.1-19.1 | no | 7 -> 5 | 14 -> 12 | 115 -> 91 | 63.7 -> 69.5 |
| large-area-blur | 22:46 | mobile | 5 | 19-48.8 | no | 6 -> 5 | 14 -> 14 | 108 -> 108 | 68.2 -> 66 |
| commission-forced-layout | 23:02 | mobile | 5 | 12.2-27.6 | no | 6 -> 5 | 16 -> 12 | 104 -> 78 | 66.5 -> 70.2 |

## iPhone scripted scroll (scroll phase), medians base / patched

| owner | n base / patched | fps | >34 ms | >50 ms |
|---|---|---|---|---|
| nav-morph | 3 / 3 | 52.7 / 52.5 | 16 / 17 | 5 / 7 |
| large-area-blur | 3 / 3 | 52.7 / 53.1 | 16 / 15 | 4 / 2 |
| commission-forced-layout | 3 / 3 | 51.9 / 52.4 | 17 / 16 | 6 / 5 |
| phone-invisible-shrink | 3 / 3 | 52.5 / 55.1 | 18 / 12 | 6 / 5 |
| pain-offscreen-notes | 3 / 3 | 30.9 / 36.3 | 63 / 54 | 35 / 30 |

## Topics

| # | topic | status | first A/B (UTC) | lead time / WIP age (min) |
|---|---|---|---|---|
| 1 | countdown-idle-raf | in progress | 21:17 | WIP 114.5 |
| 2 | scroll-engine-batching | in progress | 22:22 | WIP 50 |
| 3 | nav-hit-test | in progress | 21:19 | WIP 112.8 |
| 4 | phone-invisible-shrink | landed | 21:16 | 56.1 |
| 5 | commission-forced-layout | in progress | 21:15 | WIP 116.3 |
| 6 | morph-scrolljack-passive | in progress | - | - |
| 7 | hero-exit-scroll-timeline | in progress | 21:42 | WIP 89.2 |
| 8 | large-area-blur | in progress | 21:19 | WIP 112.9 |
| 9 | layout-animations | landed | 21:22 | 62.9 |
| 10 | toolbar-resize | not started | - | - |
| 11 | pain-offscreen-notes | in progress | 21:15 | WIP 116.6 |
| 12 | scene-gating-tighten | not started | - | - |
| 13 | morph-panel-lazy-mount | in progress | 22:51 | WIP 20.6 |
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

Fix dirs in flight (branches/worktrees, not on main): countdown-idle-raf, scroll-engine, nav-hit-test, commission-forced-layout, hero-exit-scroll-timeline, countdown-idle-raf--layers, main-thread-infinite-animations, anim-ablation, scroll-engine--engine-only, scroll-engine--hyst, morph-panel-lazy-mount, morph-scrolljack-passive, large-area-blur, large-area-blur--platform-none, vendor-scrollend, vendor-scrollend--drop, vendor-scrollend--task, pain-offscreen-notes, hero-exit-scroll-timeline--noblur

## Incidents

| id | class | status | assignee | resolve (min) | ready->resolved (min) | tool commit on main | stale |
|---|---|---|---|---|---|---|---|
| I-001 | tool | resolved (fixed) | - | 61.9 | 12.3 | 2a2169e |  |
| I-002 | tool | resolved (fixed) | - | 85.2 | 10.6 | 4bbd249 |  |
| I-003 | env | resolved (fixed) | ts-i003 | 61.6 | 2.7 | e20a981 |  |
| I-004 | tool | resolved (duplicate) | - | 0.1 | - | - |  |
| I-005 | tool | resolved (fixed) | ts-i005 | 58.5 | 4.6 | 0921549 |  |
| I-006 | env | resolved (workaround) | - | 0 | - | - |  |
| I-007 | tool | resolved (fixed) | ts-i007 | 14.6 | 5.7 | 25391a2 |  |
| I-008 | tool | resolved (fixed) | ts-i008 | 65.7 | 11.7 | b9d5ee8 |  |
| I-009 | tool | resolved (fixed) | ts-i008 | 60.3 | 11.7 | c890043 |  |
| I-010 | tool | resolved (not-a-bug) | ts-i005 | 30.6 | - | - |  |
| I-011 | tool | resolved (fixed) | ts-i005 | 21.8 | 19.2 | e280c98 |  |
| I-012 | tool | resolved (fixed) | ts-i012 | 42.2 | 21.2 | ba10fd0 |  |
| I-013 | tool | resolved (fixed) | ts-i013 | 39.3 | 5.9 | c2c660c |  |
| I-014 | tool | resolved (fixed) | ts-i003 | 5.4 | 1.3 | 19f25cd |  |
| I-015 | tool | resolved (duplicate) | - | 4.4 | - | - |  |
| I-016 | env | triaged | - | open 30.3 | - | - |  |
| I-017 | tool | triaged | - | open 28.1 | - | - |  |
| I-018 | tool | open | - | open 22.4 | - | - |  |
| I-019 | tool | open | - | open 9 | - | - |  |

## Worktrees

| branch | ahead | behind | dirty files | last commit age (min) | kind |
|---|---|---|---|---|---|
| worktree-agent-a03218c7c8f9587ed | 2 | 31 | 2 | 3.6 | deliverable |
| worktree-agent-a0a197b74a8dd40a4 | 0 | 38 | 0 | 38 | none |
| worktree-agent-a0b5fe94cfd97f3aa | 0 | 3 | 1 | 9.9 | none |
| worktree-agent-a13d7bfa5a75e0fed | 0 | 11 | 3 | 17.1 | none |
| worktree-agent-a1722cf5058e25591 | 5 | 4 | 3 | 8.2 | deliverable |
| worktree-agent-a1db8fc585fd1ab7a | 0 | 5 | 0 | 11.5 | none |
| worktree-agent-a1ecf91dac9344dc2 | 0 | 5 | 1 | 11.5 | none |
| worktree-agent-a1fe6184cf27dbe99 | 0 | 36 | 0 | 35.2 | none |
| worktree-agent-a277ea00c8773c1ea | 3 | 4 | 3 | 11.1 | deliverable |
| worktree-agent-a304ca7f869d9823f | 0 | 18 | 7 | 20 | none |
| worktree-agent-a3d5fe536bc00aaaf | 0 | 7 | 0 | 13.2 | none |
| worktree-agent-a4091af4a88270aa0 | 0 | 28 | 2 | 25.2 | none |
| worktree-agent-a53f4ec08506b7442 | 1 | 3 | 0 | 7.6 | deliverable |
| worktree-agent-a58b544571d084ffd | 0 | 29 | 0 | 25.3 | none |
| worktree-agent-a60136f2e6656de92 | 0 | 51 | 0 | 59.2 | none |
| worktree-agent-a6a570e184a2f6eba | 0 | 3 | 3 | 9.9 | none |
| worktree-agent-a700c6e710c364d49 | 0 | 11 | 1 | 17.1 | none |
| worktree-agent-a77e2ec753b6381fb | 5 | 2 | 1 | 1.8 | deliverable |
| worktree-agent-a7c32893a83e22c72 | 0 | 4 | 0 | 11.5 | none |
| worktree-agent-a7da36df115c2e662 | 0 | 32 | 5 | 33.2 | none |
| worktree-agent-a7fad4cb1a3bb1d34 | 0 | 0 | 5 | 2.6 | none |
| worktree-agent-a803a03397b4d1b2a | 0 | 23 | 0 | 23.9 | none |
| worktree-agent-a9d21060514191d07 | 0 | 33 | 0 | 33.8 | none |
| worktree-agent-ac1fe54025bf80d6c | 0 | 1 | 0 | 4 | none |
| worktree-agent-ac3dd7811b6861c73 | 2 | 0 | 0 | -0.2 | deliverable |
| worktree-agent-ad4c3143bc0e9c5b6 | 0 | 15 | 0 | 19.1 | none |
| worktree-agent-ad57dbcaaef308061 | 0 | 9 | 11 | 14.3 | none |
| worktree-agent-aed31cb2797d47701 | 0 | 13 | 0 | 18.5 | none |
