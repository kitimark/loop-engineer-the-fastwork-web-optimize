# mgmt-ops living state (updated with every digest)

Living state file (LEAD.md "Rules from mgmt-lead iteration 2"): the next mgmt-ops restarts from it (about every 2 h
or at ~60 % context). Charter: `fixes/LEAD.md` "Delegation: mgmt-ops runs the day-to-day". Current instance:
**mgmt-ops-4** (from 08:52Z; mgmt-ops-3 ran 05:04-08:55Z), worktree `.claude/worktrees/mgmt-ops-2` (sparse, on the
snapshot), branch `mgmt-ops/docs-2`. Last update: **11:19Z**.

## How mgmt-ops-3 worked (keep doing this)

- Wait in the foreground with `sh <scratchpad>/mgmt-ops/tick.sh 300` (returns on a lock-holder or incident change; Bash
  timeout 500000). No background monitors. Never end a turn with background work running.
- Messages to agents resume them if they ended; that is fine for GOs. Iphone requests: message `iphone-runner` directly
  for scripted checks (lead OK 07:25Z); finger tests only via the lead. The lead lands, resolves, reorders, spawns.
- Every docs commit: rebase on main, `npm run test:unit`, commit, then a "LAND BATCH" message with the sha(s).
- Quote goal progress as frames > 50 / > 34 ms (Chrome, within ONE hold) and iPhone numbers; > 34 ms varies ±2 across
  holds. Success is judged on the iPhone under a finger first (user decision 08:04Z).

## Digest log (newest first, 5 lines each)

- **11:19Z** Phone HELD by the user (lead): no phone calls until "phone back". Morph session: Composite carries the cost,
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

## Next actions for the next mgmt-ops (in order)

1. iphone-runner (owns the phone; every block starts with a passing control: fails if bottom/idle < 58 fps or baseline
   scroll < 44 fps). Its queue:
   (a) HERO block: DONE 09:08Z (results in DIRECTION; routed to fix-hero-exit). fix-scroll-engine rebased after it.
   (b) MORPH driver block (#1 priority): mw10e-f vs g (overscroll-behavior question), f vs fb, g vs gb, g vs ge, g vs gc,
       n=3 each; `window.__fwMorphDrive({hold:2000,cycles:3})`, poll `window.__fwMD`; serve from fix-nav-morph's worktree
       `node tools/fix.mjs serve <build> --on aw1-10e`.
   (c) N12 block: aw1-10c vs n12v5-aw1 (matched pair, fix-nav-morph's worktree); hero window esp. y≈700 (F-029 nav ee()
       forced style), middle, end, parity spots. If y≈700 goes → N12 enters the base (needs a review then).
   (b1) + `h-fixedpanel` (fix-nav-morph builds it on aw1-10e, lead 09:12Z): queue it in the morph block next to
       b-noblur as soon as fix-nav-morph sends label/URL; prediction (de-morph) h beats b by 20-35 ms per moving frame.
   (b3) HERO BISECT (sent 09:13Z): v4nocards (CSS c9a4d089), v5noblur (CSS 005c825d) vs P frozen (JS 71d76d69 / CSS
       8a14ac2e), P2 second ref, v3 (808e25a1) optional; y≈50 / y≈700 frames; fix-hero-exit 08be84c waits for it.
   (b2) ts-gesture V0 smoke (~15 min) + V1 validation (~60 min), `research/architecture/finger-simulation.md` §5c, only
       when ts-gesture reports its phone part ready (and the user's one-time setup is done); else skip to (c).
   (d) N10 ablations, rebuilt on aw1-10e (0e62ccc; base `.../agent-a1722cf5058e25591/fixes/aw1-10e/overlay`; order
       d, c, b, a; R3 logger); sent to iphone-runner 08:57Z.
   After each block ends: tell the owners whose worktree it served from that they may now rebase + sparse.
2. Results routing: hero → fix-hero-exit (then ONE Chrome A/B `--on aw1-10e` ≤ 10 min, > 50/> 34 in the hero window);
   morph → fix-nav-morph (if b names the blur → N2 composited morph: fixed radii faded by opacity; the driver hook must be
   stripped before landing; the pin-fix land patch is variants/g-pinclamp-osb.diff). N12 + #6 v05 land after the user's
   finger verdict (C/D postponed until a morph render fix exists).
3. WATCH (lead 08:31Z): canary A/A on 43e40ce fps 78.3 / > 20 ms 57 / p95 25 vs ~92 / ~25 at 04:25Z on 93b4af2. If the next
   goal-hold A/A also shows ~78 fps → incident + A/A 93b4af2 vs 43e40ce in one hold.
4. Caffeinate: now `caffeinate -d -i -s` (display on, user-approved) since 11:01:46Z; the lead restarts it every 2 h →
   remind the lead at ~12:50Z.
5. ts-gesture (WDA gesture tool, branch worktree-agent-a83a0f8d7c6fe96b6; applies once review-gesture-2 passes and the lead
   lands it; the user's WDA setup is still pending): (a) `wda build` runs only inside its own NORMAL chrome-measure hold and
   with the iphone lease, exactly `node tools/lock.mjs run chrome-measure --owner iphone-runner --max-seconds 600 -- node
   tools/iphone.mjs wda build --owner iphone-runner` (not the short lane; xcodebuild capped at 540 s; refuses under any other
   holder, incl. a short npm test). (b) Gesture summary key `pinReversals` is now `pin`: compare iphone-wave2's reversal
   counts with `pin.excursions` (wave2 counted round trips; E1b: wave2 8, excursions 7, direction changes 13);
   `pin.fight` = reversals while touching + reversals beyond the first after each lift; `pin.bounces` = lifts with exactly
   one reversal.
6. Backlog for mgmt-lead iteration 3 (none urgent): recheck pauses instead of contaminating; gate.since survives intervening
   holds; WindowServer counted as measured system in the gate (I-031 answer: steady other CPU 17-20 % = WindowServer +
   agent CLIs + iTerm; daemons tip it over 25 %); fewer concurrent agents during goal holds; verify has no measured load
   phase; iphone wip.mjs stub clock; kpi rule on topProcs; trace buffer 300 → 32 MB + opt-in V8 categories; review-10e
   note (a) JS comment 1,500 → 1,915/s.

## Where the project stands (08:55Z)

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

| address | owns | state (10:27Z) |
|---|---|---|
| `main` | lead: lands, resolves, reorders locks, spawns, user | alive |
| `mgmt-ops-4` (ID a1176a675fec4336d) | ops hub, iPhone queue, DIRECTION, handover, land batches | alive |
| `iphone-runner` (a7696771bf38f1229) | phone blocks, controls, logger | alive |
| `fix-nav-morph` (a277ea00c8773c1ea) | morph (gh, ghbn, R8/R5, R2), y≈1960 IO frame (src, noinert: no win), N12 | alive, holds rebase |
| `fix-hero-exit` (a77e2ec753b6381fb) | hero window y 0-900: v2, h1, hero-B, people-o | stopped (wakes on message) |
| fix-scroll-engine = ID `a1722cf5058e25591` | /10d, R2 bg-layers, R3a/b, y≈1250 scene gate candidate (F-045) | stopped (wakes on message) |
| `ts-gesture` | WDA gesture tool (NEEDS-WORK; user setup pending) | alive |
| arch-lead = `ae2d21af96d758d16` | measurement protocol v2 | alive |
| arch-safari = `a765c480ea490a443`, de-safari = `a4ce1669dd33aa4dc` | Safari probing / iOS time model (read-only) | alive |
| arch-devtools = `ad5593c3c7d3b8c97`, de-devtools = `a21e6c00411aba4d8` | Chrome DevTools method (read-only) | done |
| `ts-iphone-run` (T1a), `ts-analysis` (T3), `ts-render-signals` (T6+T7, I-032) | protocol v2 tools | alive |
| `doc-protocol-v2` (aa630a1a8c0adae9f) | v2 docs pass (LEAD, README DoD, AGENT_PROMPT, fix-reviewer, EXPERIMENTS, CLAUDE.md); not ops docs | alive |
| `arch-unknowns`, `de-unknowns-render`, `de-unknowns-ux` | unknowns hunt (validity, render terms, perceived smoothness) -> arch-lead merges | alive |
| `ts-gesture` (a83a0f8d7c6fe96b6 worktree) | fixing review-gesture-2 B1/B2 | alive |
| `de-pm-morph`, `de-pm-hero` | post-mortem of phone-tested refactors (morph gh/ghb/ghbn/hump/first frames; hero v2 y≈700, h1, y≈1250); Timeline captures via slot tickets with per-segment predictions | alive |
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
