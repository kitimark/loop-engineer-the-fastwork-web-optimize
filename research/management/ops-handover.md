# mgmt-ops living state (updated with every digest)

Living state file (LEAD.md "Rules from mgmt-lead iteration 2"): the next mgmt-ops restarts from it (about every 2 h
or at ~60 % context). Charter: `fixes/LEAD.md` "Delegation: mgmt-ops runs the day-to-day". Current instance:
**mgmt-ops-5** (from 11:26Z; mgmt-ops-4 ran 08:52-11:25Z), worktree `.claude/worktrees/mgmt-ops-2` (sparse, on the
snapshot), branch `mgmt-ops/docs-2`. Next instance: **mgmt-ops-6** (at ~60 % context). Last update: **11:3xZ**.

## How mgmt-ops-3 worked (keep doing this)

- Wait in the foreground with `sh <scratchpad>/mgmt-ops/tick.sh 300` (returns on a lock-holder or incident change; Bash
  timeout 500000). No background monitors. Never end a turn with background work running.
- Messages to agents resume them if they ended; that is fine for GOs. Iphone requests: message `iphone-runner` directly
  for scripted checks (lead OK 07:25Z); finger tests only via the lead. The lead lands, resolves, reorders, spawns.
- Every docs commit: rebase on main, `npm run test:unit`, commit, then a "LAND BATCH" message with the sha(s).
- Quote goal progress as frames > 50 / > 34 ms (Chrome, within ONE hold) and iPhone numbers; > 34 ms varies ±2 across
  holds. Success is judged on the iPhone under a finger first (user decision 08:04Z).

## Digest log (newest first, 5 lines each)

- **12:3xZ** Landed bd6762e (docs-2 P-029 row, F-059 corrections; doc-protocol-v2 layerPainted M148+, rAF 60 Hz, L13).
  P1 HIT (P-017), P2 miss (P-016b). Lead: P10 right after P-029 (same session, 10 min cooling); runs count only with the
  P0-cleared probe until T1a lands (T1a NEEDS-WORK B1, scrollHeight read). T8+ NEEDS-WORK (2 items). Gate 25 % (user).
  Caffeinate ends ~13:32Z (lead restarts). Pending: mw-stub rerun (finger batch), arch-claims layout verdicts.
- **11:5xZ** P0 CLOSED (P-023 neutral; A9 lifted for rAF-only loggers, lead 28aab81 + 747d80a, F-061; doc-protocol-v2
  carries it into protocol §3.2/§5.5 + unknowns-actions). User setup done (Developer Mode, UI Automation, cert); ts-gesture
  wda build holds the lease until <= 12:03Z, then runner: T10 -> P1+P2. P9 PASS (bbf2061). T8+ npm test in the short lane;
  C1 = lead, after T8+ review. Land: iphone-runner 8445b5f + eb107d7 (on 28aab81), docs-2.
- **11:3xZ** (mgmt-ops-5) Took over. Lead 11:30Z: P10 change approved (gh-cdwc vs gh-cdwc + A1 only if P1 passes, gated
  on the per-tween max edge leap; arch-lead writes it); user-ask bundle with the user now; ts-bench-gain (nit 1) being
  spawned; T2 only after T1a lands (nit 3 in its prompt). Landed since 11:24Z: none new (main 5a3c72b). Asked
  fix-nav-morph for the P1 ticket (gh-cdwc/gh-cdhid hashes + P-017 card). Caffeinate reminder ~12:50Z.
- **11:25Z** P0 logger-ysrc A/A RUNNING since 11:23Z (hand-patched runner yswin.mjs, aw1-10e immutable :5476; battery
  80 %, not charging, 39.4 °C logged per run). Next P1+P2 once fix-nav-morph sends gh-cdwc/gh-cdhid hashes.
- **11:24Z** HANDOVER to mgmt-ops-5 at the phone-back boundary (11:22Z). Runner has the §3 order and the P0 logger-ysrc
  ticket; ST-2 builds cleared (pr5; +1.13 s frame = `is-future-shrinking` transform none -> scale(1)). New topic N14
  layout-containment -> fix-scroll-engine (TOPICS). /10d parked until its phone check. User-ask bundle in "Next
  actions" item 2. Landed since 11:06Z: 4259051, fix-scroll-engine records 79202d8..b3e5df9, T3 stats 488b9df..e46c6bc.

- **11:17Z** Lead adopted arch-lead's ranked list (unknowns-actions.md §3, 197c2fa): phone P0 y-source A/A -> P1/P2
  countdown + P-016b -> OSS ca-check -> P3 ST-2 -> P4 y≈1960 F1/F3 -> P11/P12 containment -> P5 ST-1 -> rest. Holds:
  fixed-size, ghr85a, R7, R8 nav half, a1, h4. New: map-webkit-amplifiers (D2), ts-host-state (T8+). Phone still with
  the user. Runner has the new order.

- **11:16Z** Phone HELD by the user (lead): no phone calls until "phone back". Morph session: Composite carries the cost,
  ~78 layers/cycle, R1/R2 refuted. Display back-tag landed ddc3450 (display on since 06:22:55Z). OSS: P0 ca-check + P1
  (F3) approved, P2-P4 wait for P0; F-048 caveat (our T10 linear() blur may be main-thread). P-018..P-022 logged (ST-1,
  ST-2, ST-2d, P0, P1). Asked arch-lead for the "y-source A/A" ticket. fix-scroll-engine stack unlanded (needs review).

- **11:05Z** Tickets validated: y≈1960 F1/F2 as two 2-arm blocks after the morph session (lead confirmed), de-pm-morph
  hold-250 pair (P-016). U1 display caveat in DIRECTION (display-on from 11:01:46Z; DarkWake runs compare with nothing
  later); back-tag desk task -> fix-scroll-engine. U5/U7/U9/U2 routed (runner, ts-iphone-run, ts-analysis,
  doc-protocol-v2). Gesture tool landed 5d357b1; user asks bundled: WDA signing, Instruments pairing, finger batch.

- **10:48Z** y≈1960 NAMED: na (listeners armed at setup) 104/107 -> 34/35 ms, nb stays; P2b = style 34-42 + composite
  58-72 ms. fix-nav-morph: attribution card -> lead, then landable fix + ticket. ghr85a held (no ticket). Runner next:
  morph attribution P2/P3 + ghbn mech check (recipe from de-safari a4ce1669dd33aa4dc). PREDICTIONS P-011/012 hits.

- **10:46Z** Protocol v2 landed (670b4bf) and approved; executing §8.3 by hand. fixes/PREDICTIONS.md started (P-001..010;
  misses: gh>=25, ghb additive, src, noinert, h1<=34). F-047 Timeline clock fix PASSED. ghbn = render-bound LOCATED
  (waits for Instruments). Queue (lead): na/nb+P2b -> morph P2/P3 -> hero 2 blocks+P3b -> R2 bg -> /10d -> N12 -> R3/h3.
  New: ts-iphone-run, ts-analysis, ts-render-signals (I-032), doc-protocol-v2, arch-unknowns, de-unknowns-render/-ux.

- **10:33Z** noinert NOT a winner either (y≈1960: control 102 vs noinert 98 ms; the frame now carries only 2 tabindex
  writes -> cost is other IO-callback work). F-045 (y≈1250 scene gate) weakened by phone data (frames 35-37 ms, no flip
  in-frame): no build. Timeline clock fix (Page.disable+enable before Timeline.start; de-devtools/de-safari) -> runner
  1-min check, then a y≈1960 Timeline capture. AGENT_ROLES: naming `<role>-<topic>`, unique; general-purpose workaround.

- **10:27Z** Lead: peer-to-peer mode, mgmt-ops = hub (F-046 directory above; AGENT_ROLES "Addresses and peer work").
  noinert (fix-nav-morph 213ca19, y≈1960 inert fix) queued right after the morph driver round. y≈1250 frame candidate
  = .commission scene gate flip (F-045) -> runner adds `data-start-selling-scene` + uncapped per-type counts to the logger;
  fix-scroll-engine owns it if it confirms. /10d: no Chrome re-measure; phone check last, then reviewer (ask lead).

- **10:25Z** mw10e-src NOT a winner; y≈1960 trigger = morph panel `inert` removal (F-044 corrects F-043; logger cap 12/frame).
  PROTOCOL V2 IN PROGRESS (arch-lead, research/architecture/measurement-protocol-v2.md; ops input sent: ablation labels
  checked by computed style, uncapped per-type loggers, warm-up run, thermal checks between rounds, phone slot tickets,
  immutable served snapshots, ABBA vs one control + pre-registered prediction). Queue unchanged until the lead approves.

- **10:17Z** hero-A: h1 -11-13 ms at the flip (h1v2 52 vs P 65, h1 45 vs P2 56), <= 34 ms 1/6; y≈1250 41-51 ms frame in
  all builds (unowned). fix-hero-exit rebasing (between blocks). Runner on mw10e-src. NEW read-only research (user
  request): arch-devtools (research/architecture/devtools-methodology.md), de-devtools
  (research/design-engineering/devtools-render-metrics.md); neither measures. Runner's 2 h background limit kills servers.

- **10:08Z** (timestamps from `date -u` from here on; my 09:15-09:58 stamps ran ~10 min fast) main acce613 verified
  (npm test, test:chrome 9/9, canary 75.9/75.2 = the ~76-78 band, watch unchanged); rebase GO sent to fix-hero-exit (after
  hero-A), fix-scroll-engine (done, 77e48cf), iphone-runner (done, c45d086 write-up -> LAND). fix-nav-morph still held.
  /10d Chrome neutral (p95 flag gone) -> review recommended after its phone check. Phone cooling; queue in DIRECTION.

- **09:58Z** Landed: ts-snapshot follow-ups (..d1c324c, user approved enforcement parts), de-morph rev 1043651, de-apple
  1babddb, my bf7896d. Lead's tests + A/A canary on main RUNNING: announce NO rebase until the lead confirms. N10 dropped;
  /10d gets one normal slot after the tests (rebase on d1c324c first). Queue: morph-2 (ghb, ghbn, clip probe) -> hero-A
  -> hero-B -> apple-ref (+ idle Timeline) -> R2 -> N12 -> img-sourcing -> ts-gesture V0. Caffeinate: lead ~10:10Z.

- **09:52Z** e1/e2 CONFIRM: y≈1960 frame = morph IO img-src burst (>= 12) -> fix-nav-morph (#2), N10 a-d to the end
  (F-043). R2 clip probe needs the user's look (screenshot misses backdrop-filter; asked lead). R3 named (vinyl under mask,
  F-041) -> owner question with lead. Asked lead: /10d normal slot? Morph-2 ghb running. F-042 warm-up control.

- **09:33Z** Lead: fix-nav-morph built ghb (gh + no blurs, diagnostic) + R2 clip-path/backdrop probe page (ac40b3f,
  f63fc70) -> morph-2 slot right after e1/e2 (sent to iphone-runner). de-morph resumed to reconcile its model with the
  driver numbers. NEW (user request): `de-apple` design engineer, apple.com's rendering math ->
  research/design-engineering/apple-math.md (read-only, <= ~10 polite fetches into the scratchpad). Caffeinate: lead ~10:10Z.

- **09:30Z** Morph block done: gh ≈ gb (p50 26/29 vs g 35 ms), neither R1 nor blur dominates; fix-nav-morph has details.
  Phone heat pause ~12 min, then e1/e2 (control :5462, e1 :5463, e2 :5464, hashes match) -> hero bisect -> apple-ref (user
  request, live apple.com, write-up in apple-verify.md "iPhone Safari check") -> N12 -> N10. fix-nav-morph keeps holding
  rebase (e1/e2 + N12 serve from it). /10d prototype se10d-aw1 e920843 built (mech clean); fix-scroll-engine on R2.

- **09:25Z** All three design notes on main (5c4fc37, 7576f74, 7d60f9f); DIRECTION records the lead's ranking (gh/R1 ->
  y≈1830 IO -> h1 flip -> h3 countdown strip -> middle R2 -> h2). Phone queue: morph+gh -> e1/e2 -> hero bisect (v7, v6,
  v4, v5) -> N12 -> N10 a-d. h3 = next spawn candidate (fix-countdown-idle-raf) when a phone slot is in sight; ask lead.
  ts-snapshot ACCEPT, 3 fixups, then user OK + land; bench toolsSha changes -> re-calibration announced with it.

- **09:15Z** Hero block done (P2 /10e small gain; hero v2 kills y≈50 but y≈700 +10 ms WebKit-only, F-035) -> hero bisect
  queued after morph. Morph block partial (phone throttled 09:07, resumes ~09:23): moving p50 ~30 ms, fb n=1 p95 45 vs f
  53-64. de-morph done (5c4fc37): cost = full repaint of resized layers, not blur -> h-fixedpanel ablation (fix-nav-morph)
  joins the morph block. F-034 (freeze served overlays), F-036-039 (de-morph). fix-scroll-engine rebased 272f6c7 + sparse;
  GO /10d prototype (no normal hold before the N10 verdict).

- **09:00Z** (mgmt-ops-4) Lead: 4edb872 npm test 495/495, test:chrome 8/9 (fix-ab test CONTAMINATED by environment,
  topProcs name WindowServer/duetexpertd/zed/iTerm2/claude; accepted as an environmental pass). arch-finger plan landed
  2226d51 (WDA/XCUITest real touches); ts-gesture building gesture.mjs + wda.mjs (measurement code -> reviewer before
  landing); user setup pending. iPhone queue += ts-gesture V0 (~15 min) + V1 (~60 min) after the morph block, when ready.
  10 agents active: goal-metric holds wait for a quieter host or accept requeues (design engineers end in ~1 h).

- **08:55Z** HANDOVER. Snapshot landed (4edb872): all worktrees rebase + `baseline.mjs sparse` between steps; done:
  fix-hero-exit (7169a6a, 9e84199), mgmt-ops-2; HOLDING until their iPhone block ends: fix-nav-morph, fix-scroll-engine
  (iphone-runner serves from them). Base `aw1-10e` (/10e F-030 hotfix landed 60f66b6). Morph: g fixes the jitter, not the
  lag (rendering); scripted driver + mw10e-f/g/fb/gb/ge/gc queued on the phone as #1 after the hero block (B/P/P2/P3).
  Marquee idle check clean. Canary-fps watch still open.

- **08:33Z** Landed: ts-i021 stack 43e40ce (B-E + I-031; canary PASSED, npm test 462/462; I-027, I-031 RESOLVED), I-018.
  Morph root cause (fix-nav-morph): pin target 5312 > maxY 5220 → re-pins every frame against the bounce; candidate
  mw-g-pinclamp-osb waits for the user's finger block (lead). F-030: /10c face will-change churn ~1,500 writes/s at idle in
  the hero → fix-scroll-engine hotfix se10e (lands after parity + short review). hero-exit owns y 0-900 incl. F-032
  people-o. WATCH: canary baseline fps 78 / > 20 ms 57 vs ~92 / ~25 at 04:25Z (n=1, iPhone serving at the time).

- **08:11Z** USER FEEDBACK: no felt difference baseline vs aw1-10c on the iPhone; lag at END (morph pin at y 5220 runs
  10-18 fps under a finger, > 50 ms 50-75/pass) and TOP (hero y 0-900). New order: morph (fix-nav-morph resumed) →
  hero-exit (resumed) → N10. Landed: I-018 d61231e (traced attribution: 5 frames > 34 ms; gtag named; "other" class →
  fix-scroll-engine diagnostic on spare capacity), I-031 reviewed, docs. ts-i021 rebasing B-E + I-031 on I-018 → one
  test:chrome + one canary. npm test ~280 s (watch after B-E). Baseline freeze (ts-snapshot) in progress.

- **07:31Z** iPhone BACK (iphone-runner owns it; I may message it directly for scripted checks, finger tests via lead).
  iPhone goal check baseline → aw1-10c: > 50 ms 5→3, > 34 ms 16→9, fps 52.8→57.1; #1 target ~106 ms at y≈1970 → N10
  (fix-scroll-engine, 4 phone ablations d,c,b,a built d24a656). Chrome: page-owned > 50 ms 0 on aw1-10c, 1 vendor gtag
  frame (user-facing, lead). Landed: Q3 note d33d957 (wave1-dry ENDED), I-030 8bab8b7, docs. N13 CLOSED (0/49). N12 + #6
  land after finger verdict. I-031 opened (other CPU 20-26 % mid-hold) → ts-i021 top-5 process log after D/E.

- **06:32Z** Landed: ts-bench I-028 follow-up 1e2c402 (ts-bench ENDED for good), docs b586b9a + ff00155. N13 forced-toggle
  probe: 0 storms in 2 x 41 toggles → agents-ask visual NOT the trigger (F-027 supersedes F-026); N13 storm-catch hold
  (≤ 24 fresh loads, traced/untraced alternating) queued #2. N12 A/B `--on aw1-10c` starting 06:31 (waited 14 min: I-030,
  shorts pass a normal whose gate isn't settled; ts-i021 after I-027; workaround: no new shorts while a goal normal is #1).
  Bench pilot: tool OK (styleWrite Proxy counts), VACUOUS/FAIL rows are spec choices. Lead caffeinate until ~08:36Z.

- **06:16Z** Landed: /10c 8f9ebe5 (review-10c ACCEPT-WITH-NOTES; counts "> 50 ms 2 → 1 in the measured window, load-time
  cost bounded by mech probe, iPhone pending"), docs 1b8aeac + cc09344. Wave-2 base `aw1-10c` (hashes confirmed). E3 →
  F-026 storm → N13 (fix-scroll-engine, forced-toggle probe, before /10d). Part 4 done (diagnostic). I-018 NEEDS-WORK →
  CDP metrics opt-in, validation = one traced run + test:chrome. 05:56Z contamination = ts-i017 e2e outside the lock
  (rule now in CLAUDE.md). wave1-dry: pilot-only spec (B) + Q3-final requeue.

- **05:58Z** Landed: N11 fea23a5 (mechanism only), docs 7542538, I-028+I-029 4f5667d (ts-bench ENDED; review-i028
  ACCEPT-WITH-NOTES → one ts-bench follow-up commit, tracked in I-028 notes). /10c hold 05:39-05:46: > 50 ms 2→1 BETTER,
  > 34 ms 4→3 noise, F-011 gone 5/5, p95 +0.8 ms WORSE flag; review-10c on a7b95d1, lead lands on ACCEPT. Lead started the
  I-018 gate early (ts-i017 rebasing f71ee42 → reviewer → A/A on/off hold ahead of q3). Starvation note: shorts drained
  ahead of /10c ~13 min → ping lead when a goal-path normal waits > 10 min (mgmt-lead iteration 3 item).

- **05:17Z** (mgmt-ops-3) Lead: npm test 0e8f288 414/414; test:chrome 7/8, bench.chrome FAIL → I-028 (ts-bench, styleWrite
  probe vacuous). GO sent: ts-i021 (I-027 + I-026 reopen; no file overlap with I-028), wave1-dry (Q3 only; bench pilot held
  until I-028), fix-scroll-engine (/10c `--on all-wave1`). N11 hold 05:05-05:15: clean (0/10), goal metrics FLAT
  (> 50 ms 2→2, > 34 ms 3→4); waiting on owner phases.mjs readout before land/no-land. q3 took the lock 05:16 ahead of
  scroll-engine (normal ≤ 10 min). kpi friction: no alarms; warns IPHONE-PARKED/STALE, STRAY-CHROME (MCP Chrome 10.9 h).

- **05:02Z** GOAL HOLD done (all-wave1 42f4033 → main 0e8f288, F-022): > 50 ms 3→2, > 34 ms 5→5 within noise; fps
  93.8→110.6 hint; left > 50 ms = gtag (N11) + F-011 render frame (/10c). ts-bench batch landed (bench on main),
  ts-bench ENDED; lead's npm test + test:chrome on 0e8f288 running → then GO ts-i021 I-027. Wave 2: N11 queued (normal,
  GO given) → /10c → I-018 (f71ee42 review + A/A cdp-metrics on/off + test:chrome) → N12 → hero-exit → countdown 05/08
  → E4 (folded into attribution). DIRECTION updated (mgmt-ops/docs-2). apple-verify hold 5 done (report pending).

- **04:25Z** Landed: I-023/I-024A 48ace89+772e675+85fdeac, I-026 93b4af2 (holds keep the Mac awake), cap docs b93ec5f (npm
  test + commit lease 300 s). Canary PASSED on 93b4af2 (A/A runs 1 clean, test:chrome 7/7); I-017/22/23/24 RESOLVED,
  I-016 parked (e4 user/hooks, f P3). GO sent to wave1-dry 04:2xZ (goal hold, --max-seconds 1200). NEW floor: canary
  baseline fps 92, > 50 ms 4, > 34 ms 5 (vs ~75 fps pre-gate): never compare to old baselines. Mac slept 04:04-04:20Z
  with the lock free (I-026 gap → reopen note: assertion while anyone is QUEUED; lead caffeinate 4 h again; user asked
  about `pmset -c sleep 0`). Next: apple-verify ~4 min hold → N11 → /10c → N12; ts-bench rebase (lead) after the hold.

- **03:43Z** I-023 chain: 48ace89 (review NEEDS-WORK) + 772e675 fixup (review ACCEPT) + a 3rd commit (verify installs its own
  SIGINT/SIGTERM/SIGHUP handlers; re-entered holds had none and left Chrome running) committing now; test:chrome after it
  (772e675 was 6/7). Lead lands all 3 when 7/7, review-i023 re-checks the 3rd (1 file), then I-026 rebase, canary
  (`ab --aa --runs 1` + test:chrome), bench rebase (fake-chrome.mjs; review-bench ACCEPT-WITH-NOTES), then GO wave1-dry.
  Wave 2 ready: N11 (parity incl. pagehide flush), N12 v4 (parity 0/5, "20-34 ms band only"), scroll-engine /10c in mech-c.

- **02:55Z** Landed: I-021 0f29e7b+d10b132 (RESOLVED), I-020 4b1034e (RESOLVED), I-024B e7ce0e4, CLAUDE.md lock
  rules 10f7bee, N3 docs 6a0db1a, handover b579b78. I-027 (P2, ts-i021, after I-024A) opened. ts-i017 I-023/I-024A ETA
  ~03:35Z + queue (02:37Z probe: idle Chrome survives 80 s; sleep explains 1953 s). scroll-engine mech10: 339 ms LoAF
  in /10 only + layers 304->741 (re-run). N12 v2: nav reads ~0, parity desktop 24/168 (v3). N11: flush edge re-probe.
- **02:46Z** no change; ts-i017 moved to #1 by lead (02:37Z).

- **02:34Z** I-023/I-024A (P0, ts-i017) no sha; ts-i017 not queued yet (lead moves it to #1 on queue). No ALARM,
  host QUIET. NEW I-026 (env): Mac Maintenance Sleep/DarkWake during holds stalls timers (explains 933-940 s
  verify-fake); rec caffeinate/pmset = user. Land: mgmt-ops docs 6a0db1a (N3 rejected). User: I-026, Spotlight,
  FW_TOOLING hook, iPhone.
- **01:40Z** first digest after restart; incident candidate (hook npm test under load) became I-024 (lead).

## Next actions for the next mgmt-ops (in order; mgmt-ops-4 -> mgmt-ops-5, 11:24Z)

How mgmt-ops-4 worked (keep): **hub mode** (lead 10:35Z): owners, iphone-runner and research agents come to mgmt-ops;
the lead only lands, resolves incidents, reorders locks, spawns and talks to the user. Validate slot tickets (protocol
v2 §2.5: build + hashes, ONE control on the same base, driver, one question, prediction id, if-X-then-Y, probes,
minutes; warm-up per served port, U5), log every prediction in `fixes/PREDICTIONS.md` before the run and the result
after it, route results to the owner + the question's author, keep DIRECTION / handover / directory current, send LAND
BATCH shas. **Stamp times from `date -u`** (mgmt-ops-4 drifted ~5-10 min ahead twice). Wait with
`sh <scratchpad>/mgmt-ops/tick2.sh 150-240` (returns on incident changes; prints lock + phone state); messages arrive
between tool calls.

1. **iPhone order** (updated 13:5xZ by mgmt-ops-5; lead-ranked; 14:0xZ: P4 paused for a user blind swipe A/B of the
   countdown fix, 3 real-page pairs = first v3-style F stage): DONE: P0 (P-023), P1 (P-017 HIT), P2 (P-016b miss),
   F2 pre-check, finger batch F1-F6 (F6-try3 apple.com 0 >50 / 1 >34 moving; F6-try2 ~80 Hz stretches = F-071),
   ca-check wca2 (captured, `window.__ca` filled; analysis waits for a free chrome-measure), **P-029 HIT** (13:17-13:25Z),
   **P3 HIT** (13:35-13:44Z: P-019 re-dur + re-keep HIT, baseline-A third frame unresolved; P-020: reveal-end Layouts
   fire at rest = Card 4), **pacing v2 s1** (13:45-13:50Z: late-gap clip 8/8, P10 RELEASED). **NOW:** P4 ~14:00Z (A = F1
   arm-load P-013, B = F3 arm-scope P-022; T1a on/off A/A in its warm-up slot, definition from ts-iphone-run) -> P11
   Block A (P-028, ~40 min; Block B conditional) + **P14** (P-025, ~47-48 min; C aw1-10e, V1 st4-strict, V2
   re-contain-js `<scratchpad>/hero-exit/snap/re-contain-js`; separate sentinels) -> P12 -> **P10** (P-024, own gate: P1
   then the phone block) -> P5 ST-1 (P-018) -> P9 (P-026) -> **P-030** listener split (~25 min) -> **P-031 G** (rAF-rate
   pages; earlier if the phone idles) -> hero-B -> R2 bg -> /10d -> N12 -> P6-P8, P13. re-keep-op gain block: placed
   when fix-hero-exit sends its ticket; right BEFORE it, same session: one untimed attribution run at rest, re-keep-op vs
   re-keep (LayerTree read of the card + idle Paint events over it; ticket P-033 VALIDATED 14:1xZ, after P11 + P14, lead: no
   jump ahead), because a non-composited opacity-0.999 card may paint
   through a transparency layer on every repaint (UNRESOLVED; F-075 CONFIRMED the premise: presence flip none<->value in
   StyleDifference, claims-audit §2.8 762fc40).
   **14:1xZ:** P4 paused for the user's cdwc blind swipe A/B (pairs on mw10e-cdwc; pair 1 = "same" saved; pair 2 page 2
   running after a Safari-inspector stall); if it stalls again the phone goes back to P4 and the swipe test is
   rescheduled (lead). **review-cdwc NEEDS-WORK** (evidence + wording only): fix-nav-morph runs a short-lane
   inertness probe (panel scene paused, 0 faces with will-change at every 250 px step, both builds) + DPR 3 frozen-clock
   countdown crop (expect 0 %); a clean n=5 `--on aw1-10e --frame-log` only if the probe fails. Lead B3: NO waiver ->
   **P-032 G block aw1-10e vs mw10e-cdwc right after P4** (card from fix-nav-morph pending). P-029 (4) moving p95
   recorded OUTSIDE [28, 45] on the better side (median 23). **F-076 (UNRESOLVED) -> P-034 gate** on any countdown-ca
   ticket; put it in the fix-countdown-idle-raf spawn prompt (de-oss-map waits on it).
   **Swipe A/B (cdwc F stage) PAUSED after pairs 1-2 (both "same"; user feels the lag at the hero and the page end; tab
   stalled twice, some recordings lost); pair 3 moves to ts-user-console's console (iphone-runner keeps the key so it
   stays blind). User-facing steps go through the console once it lands, not the lead's chat.
   **LAND-REQUEST RULE (lead 14:3xZ, all agents):** before asking the lead to land, rebase on CURRENT main with a CLEAN
   tree (git status empty: commit or stash every edit); then send branch name + "tree clean, rebased on <main sha>" + SHAs.
   The lead only fast-forwards; a dirty tree or stale base bounces the request. Lead 14:3xZ also: ef802b9 (phone minShift
   4 ms, whole-ms medians) CONFIRMED, lands after ts-analysis adds the phone-platform guard (infer phone from meta.device,
   warn on explicit chrome) + review-stats OK, with doc-protocol-v2's §5 text; doc-protocol-v2 sends the lead replacement
   text for the CLAUDE.md phone-threshold line + Sentinel bullet, and updates fix-reviewer check 15. Spawned:
   ts-user-console, ts-lock-bundle (item 7b + sleep wording; branch worktree-agent-a413c9626c75bd1a3).
   **USER PRIORITY (lead 15:22Z, "make simulator task as highest priority"; overrides every order below):**
   chrome-measure: ts-sim and arch-sim before fix A/Bs and other toolsmiths (lead moved ts-sim to #1; whenever either
   queues, tell the lead to move it to the front; I-035 open, so don't trust "moved by lead" when the entry already
   sits at its own position); arch-sim fidelity holds are normal holds and outrank fix measurements. Phone: arch-sim
   real-device reference runs, if needed, go next after the current block, ahead of P-032 / P14 / P-035 (15:2xZ
   mgmt-ops-5 asked arch-sim for a ticket to iphone-runner by 15:31Z; none -> P-032 at 15:31Z, arch-sim after its
   block). Reviews/landing: anything ts-sim needs first (ts-analysis deviceOf = already on main a1fd3bc: "simulator"
   is its own device, stats refuse to pool it with iPhone/Chrome, exit 2); tell the lead THE MOMENT sim.mjs is ready
   (he spawns its reviewer). Broadcast 15:2xZ to arch-sim, ts-sim, iphone-runner, ts-analysis, ts-iphone-run,
   ts-lock-bundle, fix-nav-morph, fix-scroll-engine, fix-hero-exit, arch-claims, review-render-signals.
   **15:2xZ state:** P11 Block A DONE (P-028: HIT mechanism, MISS ms, NULL frame time; Block B DROPPED by the owner;
   lc-cq3 not a candidate) -> P14 after P-032. P-032 CLEARED: fix-nav-morph's owed (A)/(B) in the row (2 forward
   tweens/run, (4) kept; scorer <scratchpad>/fix-nav-morph/p032-score.mjs).
   **16:2xZ (resume after the usage reset):** landed f86290e (ts-analysis), c14b6b0 + a68376e (sim.mjs, review-sim
   ACCEPT-WITH-NOTES, npm test 716/716), 19a383d (arch-sim). Simulator verdict F-084: classes 1, 2, 4 not usable, class 3
   lead generator only, class 5 untested; FP-6 (gesture) not funded for now. Swipe pair 3 = "same" (0/2 V, catch passed):
   cdwc not felt, landing rests on P-032 alone. F-v3 run 1 = C-002 (fv3-set1.json), run 2 = C-004 (user, 16:2xZ). Phone
   next: C-004 -> cooling -> P-032 -> P14 -> P-035 G -> P-036 G. User question "phone over Wi-Fi, no cable": lead answered
   UNRESOLVED, check offered after C-004, HOLD until the user replies. I-032 B1 (paint units/layerScale) open with
   ts-render-signals. Digest to the lead every 30 min.
   **PHONE ORDER (lead 14:2xZ, supersedes the NOW line above):** P4 (started ~14:2xZ; block A + T1a A/A PASSED (ABBA aw1-10e S, on vs off: dt>50 3 vs 7, dt>34 18 vs 21, fps
   57.4 vs 57.3; T1a now absolute; minShift revisit CLOSED: HL p95 on-off +0.48 ms, n=2/arm (crude), stays 4 ms,
   ts-analysis 14:3xZ), 10 min, block B) -> P-033 step 0
   (lead 14:4xZ: after P4 B's end sentinel: F1 edge Timeline attribution run (fix-nav-morph), then P-033 step 0) -> 10 min cooling -> P-032 G cdwc (VALIDATED, ~20 min) -> 10 min cooling -> P-035 G-v3 (pacing v3, no user,
   ~20 min lease, filler; F-v3 waits for the user console) -> F3 G touch A/B aw1-10e vs mw10e-arm-scope (pacing v3 urls
   mode for F; G = P-036 VALIDATED 14:5xZ, runner opens the arms directly; lead 14:4xZ: F3 forward, F1 stops; P4 done
   14:45Z, phone 40.9 °C; P-033 step 0 PASS 14:47Z) ->
   P11 Block A + P14 -> P12 -> P10 -> P5 -> P-033 gain (VALIDATED; step 0 fills any free phone gap) -> P9 -> P-030 ->
   P-031 G -> hero-B -> R2 bg -> /10d -> N12 -> P6-P8, P13. P-033 "within noise" -> bundle candidate, not standalone.
   **mw10e-cdwc landing branch fix/mw10e-cdwc 6652ad9** (on 77c480e): review-cdwc round 2 resolved B1/B2/B4, B5 fixed; lands only
   after P-032 PASS (rebase on current main first); no further review round. P4 block A (P-013) done 14:25-14:30Z.
   **F-080 CONFIRMED (arch-oss-survey, 14:5xZ):** on the phone linear() freezes during main-thread blocks (transform +
   filter), cubic-bezier and sampled WAAPI keep moving. Routed: PoC 2 blur-easing-cubic -> fix-hero-exit (h1 owner);
   PoC 3 countdown-ca -> fix-nav-morph after cdwc (first attribute the countdown's 1 Hz idle spike; with P-034);
   morph-ca -> fix-nav-morph (blur/opacity/scale usable; backdrop undecided, needs a larger-contrast lane).
   arch-oss-survey: no unlanded commits. Step-0 side observation (idle whole-view Layouts at rest on #people: rotator
   ~25-30 ms per tick; ~750 x 0.75 ms per 20 s from a per-frame RecalculateStyles) -> fix-scroll-engine + de-pm-hero.
   **NAMED 15:0xZ, F-081 (OBSERVED, 1 run/arm, time association):** of ~795 small Layouts / 20 s: countdown digit spring
   rAF (re-keep JS L4039, started by the 1 s setInterval L4142; on screen, so the off-screen gate rightly keeps it) ~320;
   accent stroke-dashoffset 0.9 s animation (CSS L1274-1280, JS timers L3858/3864/3869, ~5 cycles / 20 s) ~440;
   avatars-exit ~24; other 9. Cost ~165 ms / 20 s (~0.21 ms each, ~0.8 % main thread), no long frame -> no ticket now
   (fix-scroll-engine); option: 2-3 min untimed rider (accent off + spring snapped, rest at y 904); accent fix idea:
   animate a mask/clip transform instead of stroke-dashoffset. Why stroke-dashoffset invalidates WebKit layout:
   UNRESOLVED. **CORRECTION 15:0xZ (fix-scroll-engine): the spring is REFUTED as the dirtier** (co-occurrence inside
   accent windows; spring frames have small Layouts 13 % vs 23 % without; it raises only ScheduleStyleRecalculation);
   residual outside accent windows (~65 / 7.6 s) leans to the rotator (~40 % within 60 ms of L11571 vs ~10 % expected).
   Lead: F-081 rider skipped. de-pm-hero b050627: §7.9 risk VOID at rest; D3 rotator prediction HIT (2 per cycle).
   **Lead 15:0xZ:** arch-claims owns the Instruments render-hitch lane definition; ts-iphone-run builds its tooling after
   I-037 + the probe v3 fix (not urgent). P-037 (PoC 3 idle attribution, fix-nav-morph) VALIDATED as filler after
   P-036. ts-lock-bundle implements (f) shared short holds next (short lane waited 17 min > 15 min line), reviewer gate
   kept. F-081 residual by Layout root (fix-scroll-engine, all < 5 ms): ~23 near rotator ticks = 104x32 subtree at
   (58, 2054) inside Composite-after-paint beside a Cloudflare-beacon PerformanceObserver callback (image-load size
   invalidation after the src swap? UNRESOLVED); ~31 RenderView-rooted after script-less style recalc (some CSS
   animation, UNRESOLVED); ~7 countdown tick = 398x52 subtree at (16, 920).
   **USER CONSOLE LIVE (lead 15:2xZ; tools/console.mjs 4698218, CLAUDE.md 9666bba; server from the lead at
   localhost:5559):** EVERY user-facing step goes through `node tools/console.mjs post` (then `wait --until
   started|recording|done|answered`), never the lead's chat. iphone-runner posts swipe pair 3 (redo page 1 + page 2, key
   in --meta) and de-unknowns-ux F-v3, but per lead 15:3xZ ONE BATCHED RESTED SITTING: swipe pair 3 + F-v3 + P-031 F +
   P-036 F posted together once every agent-side flow is ready and a ~20-25 min phone gap fits (after G-v3 P-035 and
   P-036 G); mgmt-ops tells the lead when posted (one heads-up to the user). Waits: wait.mjs / lock.mjs wait only, no
   sleep or until-grep loops (lead 15:3xZ). iphone-runner stops its old serve.mjs processes (ports 54xx) not needed for
   P11 / P-032 / P14 / the sitting (own processes only; 5173 is the user's).
   **P-032 BLOCKED 15:1xZ by I-038** (morph-log hook = 2nd inspector connection hangs the gesture tool; iphone-runner's
   I-039 is a duplicate -> lead merges); lead approved amendment (b) (t0 = first defaultPrevented touchmove per end push),
   second-read OK 15:2xZ with 5 conditions (see the P-032 row); runs hook-free after P11 Block A (running ~15:20Z) + cooling.
   Caffeinate: lead restarted 15:12Z for 2 h (max) -> ends ~17:12Z, remind ~17:00Z.
   **I-037 [open, blocking]:** iPhone tools pick a background app's about:blank web view instead of Safari's tab.
   Lead 15:0xZ: 7b(f) option (A) not taken to the user (rebases change the staged tree; enforcement layer); (f) stays a
   design in ts-lock-bundle's ticket; tell the lead if short-lane waits exceed ~15 min again.
   **F-076 / P-034 owner = fix-nav-morph after cdwc lands** (lead: same countdown code; no fix-countdown-idle-raf spawn).
   Toolsmith bundle: lead spawns after ts-wait's npm test on main (c4a1ee2) passes. ts-user-console (tools/console.mjs:
   user-facing step console, agents `console.mjs wait <id> --until started|answered`) in progress.
   **arch-sim** (iOS Simulator fidelity): normal chrome-measure holds <= 420 s, announced to mgmt-ops each time;
   `--port auto`; own iwdp `-c null:9231,SIMULATOR:9232` (iwdp attaches only configured devices, so never the phone);
   no iphone lease; results tagged meta.device "simulator".
   **ts-analysis eea3c06 -> review-stats NEEDS-WORK** (cross-block driver pooling unwarned; "near thresholds" line pools
   frames across runs, §5.3): ts-analysis fixing; lands only after ACCEPT. Protocol questions (lead 14:1xZ): (a) A5
   "threshold-sensitive" wording vs code (code flags when gt46 or gt54 differs from gt50, stricter) -> doc-protocol-v2;
   (b) phone p50/p95 minimum shift -> arch-claims DECIDED 14:2xZ: 4 ms (the ±4 band; phone stamps 1 ms,
   off-grid, claims-audit §2.3), phone median futility in whole ms (not ticks); revisit after P4's T1a A/A (|HL p95
   shift| >= 4 ms raises the floor); Chrome unchanged; sent to ts-analysis for the eea3c06 fix. (a) DONE doc-protocol-v2 157eeea (docs follow the code: threshold-sensitive if EITHER twin's verdict differs; near
   bands half-open (30, 38] / (46, 54]; rAF-rate text per 6f71f51). Lead-only: CLAUDE.md phone line wording, CLAUDE.md
   "Sentinel" bullet vs the Timeline-block sentinel, fix-reviewer check 15 phone tick forms.
   **Pacing v2 (de-unknowns-ux e64b6de, pacing-result §4):** verdict accepted on intent (§0/§2), OBSERVED, one user, not
   rested; §3 sign erratum added with the scoring commit, kept visible. **Lead rule 13:5xZ: pre-registered rules get a
   second reader (arch-claims or mgmt-ops) BEFORE data arrives.** de-unknowns-ux drafts a pacing v3 (touch A/B) plan; it
   could replace P-031's F part.
   **Lead 13:5xZ: pacing v3 APPROVED** (arm 3 passive vs non-passive touchmove = decision arm; load from measured phone
   long tasks; synthetic, but the swipe-and-pick UI + scorer also wrap two URLs): **F stage of every fix = a blind
   real-page swipe A/B via the v3 UI** (first user: cdwc countdown fix); second reader before data; G first, then F rested.
   doc-protocol-v2 folds this into protocol §5 when convenient.
   **F-071 [OBSERVED] (arch-claims 13:2xZ):** finger/touch scrolls show sustained 12-13 ms (~80 Hz) rAF stretches
   (F6-try2 563/1027, try3 171/1385; fastwork E1 seg1 43/352, A1 seg2 30/816); S/W runs and idle show 16-17 ms. fps
   and frame counts from F/G runs do not compare with S/W runs; ms thresholds unaffected. ver-rafrate checks the cause;
   proposed CLAUDE.md qualifier after verification: "60 Hz idle and in scripted scrolls; ~80 Hz observed in finger scrolls".
   **WDA signing profile expires 2026-10-08T12:19:35Z** (free team, ts-gesture): re-run `wda build` before then.
   Pacing v2 page: research/design-engineering/pacing/v2.html (d28c2cb); F5 result = F-069 OBSERVED n=1.
   **Phone scoring (lead, CLAUDE.md 668b612, supersedes the v>=3 decision):** dt > 50 goal (target 0) + dt > 34, counts
   at ±4 ms (dt>46/54, dt>30/38), "threshold-sensitive" if the verdict differs; no k forms on the phone; Low Power Mode
   per run. fix-reviewer check 15 updated (13da193).
   **Timeline-block sentinel (lead 12:5xZ, every Timeline block: P3, P11, P14, listener):** one uncounted Timeline-OFF
   control sentinel run after the warm-ups and one at the block end carry the >=58/>=44 rule (a failure voids the block);
   counted runs keep Timeline on in every arm, judged within the block; record counted C fps with Timeline on as info.
   If Timeline-on C >= 44 data exists, only the end sentinel is needed. doc-protocol-v2 writes it into protocol §5.
   **Probe rule (lead 13:3xZ):** T1a landed (f8e7d5a) but counts as absolute only after a T1a on/off A/A in P4's warm-up
   slot (approved); until then counted runs use the P0-cleared logger (P-029, P3 did). T1a deltas f8e7d5a on e0b3821 (npm test 630 before rebase, unit 308 after; docH null at
   y 0 / raf-legacy, told ts-analysis); phone dt>50/34 ±4 ms reporting is a separate measurement-code change (lead).
   **Holds:** fixed-size morph diagnostic, ghr85a, R7, R8 nav half, a1 (behind the countdown fix), h4.
   Countdown fix mw10e-cdwc (CSS 5dc6e8e37388 on aw1-10e; 269df637 differed only in a comment, never served) lands on phone gain evidence + review; mechanism wording stays
   OBSERVED ("repaint of the faces removed (observed)") until ver-webkit-paint reports (lead).
2. **USER-ASK BUNDLE: answered 11:3xZ.** Approved: C1 (the lead runs it himself in the main checkout after T8+ /
   I-033 lands and is reviewed, when the user is away from the Mac; P-027), F6 (phone visits the Apple page), T10
   (Instruments pairing). WDA setup by the user in progress (step 1 Xcode account done 11:4xZ). The finger batch
   F1-F7 + R2 clip look: tell the lead when its pages are built (mw-stub: fix-nav-morph; pacing page: de-unknowns-ux;
   fw-clip-probe exists) AND P1/P2 are done; the lead pings the user.
3. **Results routing:** y≈1960 -> fix-nav-morph (touch-only class: G or F before landing; F1 landing gate = touch latency,
   finger F4); morph -> fix-nav-morph + de-pm-morph (Composite carries the cost, ~78 layers per cycle; R1/R2 refuted);
   hero -> fix-hero-exit + de-pm-hero; y-source -> arch-lead; ca-check -> arch-oss-survey + de-oss-map (if F-048
   confirmed: OSS P2 blur-easing-cubic fixes our own T10 base and goes first); N14 -> fix-scroll-engine.
4. **Pending lands:** none from docs agents (12:3xZ main bd6762e: docs-2 196af02, doc-protocol-v2 1b09dad/5ffb00c/cb74826). Toolsmiths: ts-host-state
   T8+ (I-033), ts-bench-gain (I-034, nit 1), ts-render-signals (I-032), ts-iphone-run (T1a), ts-gesture follow-up. fix-scroll-engine's /10d
   stays parked until its phone check (no base change mid-queue).
5. ts-gesture notes (apply once landed): `wda build` = `node tools/lock.mjs run chrome-measure --owner iphone-runner
   --max-seconds 600 -- node tools/iphone.mjs wda build --owner iphone-runner` (normal lane, iphone lease, xcodebuild
   capped at 540 s); gesture key `pinReversals` -> `pin` (`pin.excursions`, `pin.fight`, `pin.bounces`); first G run:
   check perStroke `endLagMs` is not always 0 (review-gesture-2 B1).
6. Caffeinate: the 3 h run was killed at 30 min (background default timeout); restarted 15:12Z for 2 h -> ends ~17:12Z, remind ~17:00Z. Display has been on since 06:22:55Z (back-tag ddc3450): holds after 06:22Z compare.
7. **Toolsmith asks from ts-analysis (review-stats T3 nits; need a lead spawn):** (nit 1) `tools/bench.mjs` calls
   `gainVerdict` at :555 and :689 without try/catch; since 86424b0 bench-stats throws on non-finite input, so a null/NaN
   scenario metric crashes bench (and in reconfirm loses later topics' tier B results) instead of INCONCLUSIVE. Fix
   drafted (~15 lines + 1 test, not measurement code): `tools/lib/bench-gain.mjs` series() drops non-finite values into
   `errors`; draft in `<scratchpad>/ts-analysis/nit1-series.diff` + `bench-gain-series.test.mjs`. (nit 3, for the T2
   spawn prompt) `stats.mjs runs` scores a run with some non-finite frame times on its finite frames only (`partial`),
   so count metrics read better: T2 must auto-void a counted run that loses more than a few percent of its frames
   (reason in `meta.void`). iphone-runner voids such runs by hand until T2 exists.
   **ts-iphone-run status for the T2 prompt (relayed by mgmt-ops-4, 11:4xZ):** U7 done (e96e5b5: meta.wallStartMs,
   pre.clock {wallMs, perfMs}); U9 done (meta.settings: media queries, hardwareConcurrency, batteryPct/charging; Low
   Power, Limit Frame Rate, case, brightness, content blockers, feature flags recorded 'unknown'); U2 covered (raw dt,
   both k>=5/k>=7 and >34/>50); **U5 open -> T2**: `iphone.mjs run --warmup` is only a label, so tickets keep the
   uncounted warm-up per served port by hand until T2 lands. T1a review starts after the probeVersion bump (raf-legacy
   optional since the A9 lift, lead 747d80a).
7c2. **ts-lock-bundle 7b (f) shared short holds: NOT implemented (proposal 14:5xZ, its own ticket if wanted).** "One holder"
   is an invariant of status/release, FW_LOCK_HELD re-entry + keepAwake, last-grant + 900 s drain budget, doctor/repair,
   wda buildGate, iphone measureGuard, `lock.mjs wait --until`, verify's gate record + holds.log. Design if wanted: a
   separate `<r>.cohold.json` slot, granted only when holder AND requester are short, no live normal waiter (movedBy
   counts as normal), drain budget unspent, slot free, different checkout; normal waiters need holder + slot free and pass
   the host gate on a fresh window; release/stale/doctor/repair/status learn the slot. Gates: 2 concurrent `npm test` x3
   on an idle host, 0 failures, wall time recorded (no gain if >= 2x one); a test that a normal grant never happens while
   the slot is taken (incl. stale paths). Cheaper first: (A) pre-commit skips `npm test` when the same staged tree
   (git write-tree) passed in the last N min (pass stamp in the shared git dir; changes .githooks = USER decision);
   (B) slow fake-Chrome e2e files opt-in for commits outside their area (riskier). Today's queue: 7 entries, 6 short.
7b. **Toolsmith queue (lead 11:5xZ; spawn after T8+ / I-034 land, not urgent):** (1) I-035: `lock.mjs repair --move X
   --to <X's current position> --apply` prints "moved by lead" but writes no movedBy, so short jobs pass X (workaround:
   move to 2, then to 1). (2) Proposal: `lock.mjs run --no-timing` (or similar) that skips the host gate and marks the
   hold non-measuring (the wda build waited for quiet while the user worked at the Mac); no arch spawn (lead 12:0xZ): the
   I-035 toolsmith writes the proposal in the same task; the lead's measurement-code fix-reviewer is the sign-off (a
   non-measuring hold must never let a timing run start on a loud host). **Same ticket (lead 12:5xZ):** (a) the head
   waiter at the gate calls keepAwakeQueued while gated (lib/lock.mjs acquire); (b) a gate sleep longer than timeoutSec
   must not end in a throw on wake; (c) N2: tag a gain judged against a calibration stored in another display state.
   (d) (lead 13:4xZ) flaky fixture-server request timeout under load: tests/e2e/baseline-snapshot.test.mjs:138
   (fix.mjs:312 'timeout …/2.fixture.js'). (e) display-off detection only tested with fake readings. T8+ landed
   (21ec95a + 34f6069, I-033 RESOLVED 13:4xZ): spawn when the lead decides.
7e. **USER DECISION 12:20Z: host gate quiet-CPU threshold 20 -> 25 %** (20 % was uncalibrated, provisional per the
   09-30 post-mortem). ts-gate25 (toolsmith) makes the change and checks the existing results.json host-busy data on
   whether 30 % is safe later. A/Bs stay comparable: the config records the threshold. T8+ (599471e) is NEEDS-WORK
   (review-host-state: 2 small blocking items, with ts-host-state); I-035 + --no-timing stay queued after T8+.
7d. **NEW RULE (user, CLAUDE.md 71ad57d):** a browser/engine limitation is OBSERVED until confirmed against docs, spec,
   engine source or a bug tracker (cited). mgmt-ops signs no card that relies on an OBSERVED claim as its mechanism
   (experiments that TEST a claim are fine); route arch-claims' refuted/weakened claims to owners and amend tickets.
7c. **F-059 / F-064: CONFIRMED by source AND check (13:0xZ, F-066):** Chrome 154 0 layerPainted in all 4 arms, CfT 143
   8/10 (root contents layer); CompositeAfterPaint theory REFUTED (143 has CAP and still fires). paint-rects --on/off
   A/A: scroll 86.6 -> 66.6 fps, so "never in timing runs" stands. New caveat (res-layerpainted, OBSERVED/inference): a
   will-change layer whose only change is a solid background colour gets no layerPainted and no paint on 143 (solid-colour
   layer = property update?), so paint counts/rects may miss such changes; routed to doc-protocol-v2 + ts-render-signals.
   History (12:2xZ):
   layerPainted is dead on M148+ because of Chromium 1bf9d9eb ("[HiC] Allow cc::Layer update rect mutation during
   paint callback", crbug 488803411): `LayerTreeHost::WillCommit` resets update_rect before probe::LayerTreePainted;
   not CompositeAfterPaint. Decisive 7-arm check (Chrome 154 vs CfT 143, ~70 s short lane) -> ts-render-signals.
   Corrections routed: doc-protocol-v2 = protocol §2.4 l.124, §3.7, §6.2 + devtools-render-metrics.md l.51/214/268/
   283/292 + morph-endpage.md V3 l.333; ts-render-signals = paint-rects.mjs l.10-11 in its T6+T7 commit;
   res-layerpainted posts the correcting finding. The lead digests F-059 into FINDINGS only after the check. paintCount
   fallback stays; trace-snapshot rects are opt-in, attribution only.
8. Backlog for mgmt-lead (none urgent): as before (recheck pauses, gate.since, WindowServer in the gate, verify has no
   load phase, trace buffer, review-10e note (a)); plus T8+ host record (ts-host-state), protocol amendments A1-A9.

## Where the project stands (08:55Z; see DIRECTION for 11:2xZ)

- main = 4edb872 (snapshot) on the wave-2 base `aw1-10e` = all-wave1 + scroll-engine /10e. Chrome: page-owned > 50 ms
  frames 0; 1 vendor frame per run (gtag `onscrollend`, removable only by the site's GA "Scrolls" setting; user-facing,
  lead). I-018 attribution: remaining > 34 ms classes = gtag, nav `ee()` forced style (N12 v5 fixes), a 429-element
  restyle at +1.1 s, paint.
- iPhone (scripted, aw1-10c): > 50 ms 5→3, > 34 ms 16→9; user feels NO difference. Felt lag: morph pin (10-18 fps, render
  cost, three per-frame blur radii suspected) and the hero window (y≈50 frame, F-032 people-o reflow).
- Closed today: N11 (mechanism only, vendor), N13 (rare, not reproducible), I-018, I-026-I-031, I-028/029.

## Incidents (08:55Z; see `incident.mjs list`)

| id | state | owner | note |
|---|---|---|---|
| I-016 | parked | lead | e4 hooks via short lane (user), f orphans P3 |
| – | all others resolved today (I-018, I-026 … I-031) | – | follow-ups are in the backlog line above |

## Peer directory (F-046; keep current, send to every agent that joins)

Lead decision 10:35Z: agents work peer to peer; **mgmt-ops is the hub** for everything that is not lead-only (land,
incident resolution, lock reorder, spawn, user). Role names work only if `ListAgents` shows them; else use the ID.

| address | owns | state (12:2xZ) |
|---|---|---|
| `main` | lead: lands, resolves, reorders locks, spawns, user | alive |
| `mgmt-ops-5` (spawned by the lead; mgmt-ops-4 ended) | ops hub, iPhone queue, DIRECTION, handover, land batches, PREDICTIONS | alive |
| `iphone-runner` (a7696771bf38f1229) | phone blocks, controls, logger | alive |
| `fix-nav-morph` (a277ea00c8773c1ea) | morph (gh, ghbn, R8/R5, R2), y≈1960 IO frame (src, noinert: no win), N12 | alive, holds rebase |
| `fix-hero-exit` (a77e2ec753b6381fb) | hero window y 0-900: v2, h1, ST-2 builds, D5, hero-B | alive |
| fix-scroll-engine = ID `a1722cf5058e25591` | N14 layout-containment (R/I now), /10d (parked), R2 bg-layers, R3a/b | alive |
| `ts-gesture` | WDA gesture tool (NEEDS-WORK; user setup pending) | alive |
| arch-lead = `ae2d21af96d758d16` | measurement protocol v2 | ENDED 11:4xZ (docs follow-ups -> doc-protocol-v2) |
| arch-safari = `a765c480ea490a443`, de-safari = `a4ce1669dd33aa4dc` | Safari probing / iOS time model (read-only) | alive |
| arch-devtools = `ad5593c3c7d3b8c97`, de-devtools = `a21e6c00411aba4d8` | Chrome DevTools method (read-only) | done |
| `ts-iphone-run` (T1a f8e7d5a), `ts-analysis` (T3), `ts-render-signals` (T6+T7, I-032, in test:chrome) | protocol v2 tools | alive |
| `arch-sim` | iOS Simulator fidelity (user work stream, lead 14:0xZ): research, plan, probe the Simulator against real-device records; Simulator runs are host-heavy -> always inside chrome-measure holds (≤ 10 min), slot like research holds | alive |
| `ts-sim` | toolsmith: tools/sim.mjs from arch-sim's spec (lead spawns when the spec arrives) | not yet spawned |
| `review-cdwc` | fix-reviewer of mw10e-cdwc (fix-nav-morph 051d0aa): NEEDS-WORK 14:1xZ (B1-B4) | done |
| `review-stats` | fix-reviewer of ts-analysis eea3c06 (phone thresholds): NEEDS-WORK 14:1xZ; re-check 8409b95+ef802b9 ACCEPT-WITH-NOTES 14:2xZ | alive |
| `ts-user-console` | toolsmith: tools/console.mjs local user step console (user-facing steps go there once landed) | alive |
| `ts-lock-bundle` | toolsmith: handover item 7b (I-035, --no-timing, gate a-c, flaky fixture d, display-off tests e) | alive |
| `review-t1a` | re-check of ts-iphone-run 7c83786 / f28f47e / 8d4f6a1 | alive |
| `ts-wait` | toolsmith (lead spawn 13:3xZ, user request): blocking wait commands so agents stop sleep-loop polling; may ask iphone-runner + others what waiting hurt most | alive |
| `ts-gesture` | gesture tool landed (3a3f895, 74f5abd); WDA runner + iproxy left running for iphone-runner | done |
| `res-layerpainted` | F-059/F-064/F-066 stamped, F-068 limitation posted | done |
| `doc-protocol-v2` (aa630a1a8c0adae9f) | v2 docs pass (LEAD, README DoD, AGENT_PROMPT, fix-reviewer, EXPERIMENTS, CLAUDE.md); not ops docs | alive |
| `arch-unknowns` (ENDED; C1 spec in unknowns-validity U1), `de-unknowns-render`, `de-unknowns-ux` (a47fed2b13de28ab2: pacing page F5, P-024) | unknowns hunt | de-* alive |
| `map-webkit-amplifiers` | D2 mapper (haiku): page-wide scan for the two WebKit amplifiers | alive |
| `ts-host-state` (a2bdbbb64c7731b2e) | T8+ host record landed 21ec95a + 34f6069 (I-033 RESOLVED) | done; C1 (lead, when the user is away) |
| `ts-claims-board` | claims-audit §4: findings-board claim status + refs (lead spawn 12:5xZ) | alive |
| `ts-bench-gain` (aabf938f2344fa8fc) | I-034 landed 526642f | done |
| `arch-claims` (ae93098a3c9f77a35) | claim audit (user rule CLAUDE.md 71ad57d "Platform claims: confirm against a reference"): research/architecture/claims-audit.md, verifiers ver-webkit-style / ver-webkit-ca / ver-chrome; refutations -> owners + mgmt-ops | alive |
| `review-host-state` | fix-reviewer (measurement mode) of T8+ 599471e | alive |
| `de-pm-morph`, `de-pm-hero` (a3f2c31df32a28d11) | post-mortems (postmortem-morph.md, postmortem-hero.md §7 D3 = avatar rotator, F-058, F-063); de-pm-hero scores P14 offline (resumable) | de-pm-morph ENDED; de-pm-hero idle |
| `arch-oss-survey` (a14e692b6f530f1c0), `de-oss-map` (af4a76a52eface067) | OSS rendering libraries survey + mechanism map -> 3-5 PoC shortlist for the lead (read-only) | alive |

## Who waits on what (08:55Z)

| agent | state | waits on | next |
|---|---|---|---|
| iphone-runner | owns the phone; hero block (B/P/P2/P3) | – | morph driver block → N12 → N10 |
| fix-nav-morph | morph owner (#1); driver + mw10e-* builds 4732f6c; holds rebase/sparse until morph AND N12 blocks end; building h-fixedpanel (lead) | morph driver block results | h vs b decide → R1 size-stable panel or N2/R7 |
| fix-hero-exit | hero window owner (#2) + h1 coordinator; 6e0a49f (rebased + sparse) | hero-A (h1v2 vs P, h1 vs P2; 6e0a49f) then hero-B bisect, on the phone | if h1v2 wins: review (a11y change, 14 MB) → one Chrome A/B `--on aw1-10e` |
| fix-scroll-engine | N10 a-d deprioritized (y≈1960 -> fix-nav-morph 09:48Z); rebased 272f6c7 + sparse; N10 overlays frozen (aw1-10e 3e2f599a, d 7de8ee9a) | phone (last in queue) | R2 built: r2-bg-layers 91d7571 (CSS ce301ce3, parity 0 %, F-040), queued on the phone before N12; /10d built: se10d-aw1 e920843 (JS ff58a433, CSS = aw1-10e; idle F-030 0/s, parity 0 diffs, restore bug fixed, quiet gate works); needs review + A/B + phone after N10 verdict; /10d Chrome A/B waits for the e1/e2 verdict; offered read-only look at de-middle R3 (unowned) |
| ts-snapshot | DONE: 5 follow-up commits on worktree-agent-a29e6d138799d9fb8 (git-guard unwrap, BASELINE verdict prefix + per-run re-check in verify = MEASUREMENT CODE, SCOPE SNAPSHOT, settings.json worktree deny rules, docs) | review-snapshot-fu; user OK for the enforcement-layer commits | lead lands (never mid-block), then test:chrome + canary; owners rebase after the announcement |
| arch-finger | plan landed 2226d51 (finger-simulation.md) | – | – |
| ts-gesture | toolsmith: gesture.mjs + wda.mjs vs a fake WDA | user's one-time setup (Xcode, Developer Mode, UI Automation) | reviewer, then V0/V1 on the phone (queue b2) |
| de-morph, de-hero, de-middle | notes landed (5c4fc37, 7576f74, 7d60f9f); de-morph resumed 09:3xZ to reconcile with the driver numbers | – | – |
| arch-devtools, de-devtools | NEW (user request ~10:15Z), read-only, narrowed to Chrome: DevTools methodology / render-metric blind spots | – | report to the lead |
| arch-safari, de-safari | NEW (user request ~10:18Z), read-only: Safari Web Inspector / iOS probing (research/architecture/safari-inspector-probing.md) and the iOS per-frame time model + probes for morph and hero (research/design-engineering/safari-render-signals.md) | – | probe proposals go to the lead before anything runs on the phone |
| de-apple | landed 1babddb; NEW (user request 09:3xZ): apple.com rendering math -> research/design-engineering/apple-math.md | – | reports to the lead |
| ts-i017, ts-i021, ts-bench, wave1-dry, N11, apple-verify | ENDED | – | do not resume without the lead |

## Priority order (user feedback 08:04Z; DIRECTION "Priority from user feedback")

(1) morph on WebKit (fix-nav-morph) → (2) hero window y 0-900 (fix-hero-exit) → (3) N10 y≈1970 (fix-scroll-engine) →
/10d → countdown 05/08. Chrome-only 20-50 ms work on spare capacity. New variants `--on aw1-10e`; normal holds ≤ 10 min.

## Queue rules and monitors

- Shorts: ONE 300 s lease for commit + hook, gate open; `--timeout 14400` on every `lock.mjs run`/`acquire` wait.
- I-030 landed: shorts never pass a lead-moved normal and pass any gated normal only in its first 120 s. Still ping the
  lead when a goal-path normal waits > 10 min. Quick shorts ≤ ~90 s while a goal normal is #1 are accepted.
- Outside a lock slot: unit test files only (CLAUDE.md); no builds (combine, npx) while a normal holds chrome-measure.
- HOLDER-IDLE > 5 min with 3+ waiting → lead IMMEDIATELY. Friction scan (`node research/management/tools/kpi.mjs
  --friction`) at check-ins; ALARM in 2 consecutive check-ins → incident candidate.
- No Monitors armed. Use the foreground `tick.sh` (scratchpad `mgmt-ops/`); it points at the mgmt-ops-2 worktree.
- Measurement-code canary: any verify/cdp/fix-ab change lands only after `ab --aa --runs 1` on main + test:chrome.
- Reviewer checklist (LEAD.md §4, F-030): topics adding observers/listeners/attribute writes get an idle-counts probe at
  y=0 before landing.

## Open user-facing questions (lead holds them)

Chrome vendor residual (gtag `onscrollend`, site GA "Scrolls" setting); pmset sleep setting (caffeinate stopgap); finger
tests (C/D #6 postponed until a morph render fix exists); arch-finger's touch-simulation plan.
