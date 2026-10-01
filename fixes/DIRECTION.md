# Direction: the road to "ultra smooth" (set by the lead, 2026-09-30)

The user asked the team to find the best animation-render optimisation on its own. This is the lead's
roadmap, ranked by what stands between us and the goal (`LEAD.md`: iPhone steady 60 fps under a finger,
no frame > 50 ms; Chrome mobile 6x: frames > 50 ms -> 0, > 34 ms -> ~0). Evidence:
`research/architecture/measurement-review.md`, `README.md`, `webkit.md`, `render.md`,
`research/measurement-parallelism/`. Revisit after every clean combined measurement.

## What is left, by kind of frame

| frame class | where it comes from (evidence) | lever | topics |
|---|---|---|---|
| **> 50 ms, Chrome** | only 4 LoAF entries: gtag `onscrollend` (vendor), morph IO callback (panel mount), engine `iE`, future `l` | remove each entry | E1 lazy mount (13), E4 `.hero-track` IO, engine scope (9/10/12), N11 vendor-scrollend |
| **> 34 ms, iPhone** | ~10 per run at 7 fixed scroll positions: section state flips (scene gate, `will-change`, `content-visibility`); worst 89-119 ms at y~1970 | make transitions cheap: no whole-subtree flips, pre-warm before entry, hysteresis | N10 transition-frames, N9 scene-gate-flap, W1/W3 answers |
| **20-34 ms, both** | per-frame style recalc (UpdateLayoutTree ~2x script in old traces), inherited custom properties, main-thread infinite animations | fewer, narrower style invalidations; declarative/compositor animations | N4 custom-property-scope, N3 main-thread-infinite-animations, scroll-driven conversions (hero-exit done; future/platform/commission/profile next) |
| **GPU, iPhone only** | backdrop-filter re-blur, large blur layers | smaller area/radius, fixed radius, opacity fades | large-area-blur, N6 nav-backdrop-budget, N2 morph-composited |
| **touch path** | non-passive wheel/touch listeners near the morph | passive listeners, scroll-driven morph | morph-scrolljack-passive, N8 |

## Principles for choosing work

1. **Remove a whole frame class, not a percentage.** Prefer changes that delete a LoAF entry or a transition
   cluster over changes that shave a few ms everywhere.
2. **Declarative beats per-frame JS**: scroll-driven CSS, WAAPI with `linear()` springs, compositor-only
   properties (opacity, transform, filter with matching lists).
3. **Narrow every invalidation**: `@property ... inherits: false`, write on the element that uses it,
   `contain`, no subtree-wide `will-change` / `content-visibility` flips during scroll.
4. **Prototype in parallel, measure in series**: owners build and self-check (parity, probes, Tier A
   benchmark counts in the short lane) while waiting; the one Chrome slot goes to the highest expected gain.
5. **Every claim reproducible**: experiment rows + variant diffs + benchmarks (`EXPERIMENTS.md`,
   `fixes/README.md` 7a/8); clean host or it is provisional.

## Lock-slot priority (the lead reorders owners' queue entries by this, not by arrival)

1. E1 nav-morph-all (lazy mount + hit test + passive + countdown active): removes the morph IO LoAF.
   **Done 2026-09-30 23:37Z, clean host (load1 2.9-4.3), mobile 6x n=5:** morph IO LoAF 5/5 -> 0/5, frames >50 ms (within noise)
   4 [4-5] -> 3 [2-4], >20 ms 70 [57-89] -> 36 [29-40], fps 74.9 -> 87.3, forced 41 -> 13 ms; iE's 43-45 ms forced
   entry gone 5/5. Only gtag `onscrollend` (59-66 ms) is left above 50 ms in Chrome (F-005). `fixes/nav-morph-all/`.
2. scroll-engine diagnostic slot: E2 state-change probe (explains the iPhone clusters), N9 idle probe, E3 animation ablation (decides N3's rank).
3. Wave-1 combined A/B on a quiet host (the number for the goal). Changed 2026-10-01 per mgmt-lead plan item 2:
   it moves ahead of the single-topic finals. Wave-1 topics land on mechanism evidence + review
   ("gain pending combined"), and the combined A/B is the gain check. Before it, a partial combine of the
   5 landed topics (`wave1-partial`) takes the first quiet slot after E1. Then wave 2 `--on` it, in this order:
   **N11 vendor-scrollend first** (lead decision 2026-10-01: gtag `onscrollend` is the only Chrome frame
   > 50 ms left; until all-wave1 exists N11 runs short-lane validation only), then hero-exit,
   scroll-engine (+ un-skip-once/hysteresis, W1), E4.
   **wave1-partial done** (2026-09-30 ~23:50Z, clean, load1 3.0-4.4; unreviewed partial combine of the
   5 landed topics, `fixes/wave1-partial/`, 4494f0c): fps 74.9 → 95.4, frames > 20 ms 65 → 24 (disjoint),
   > 34 ms 10 → 6 and > 50 ms 4 → 5 within noise. Still > 50 ms: gtag `onscrollend` (N11), the #13 mount
   (lands with countdown), iE (scroll-engine diagnostic names what remains on top of wave1-partial).
   Full review at the all-wave1 stage.
   **scroll-engine diag part 1 on wave1-partial** (2026-10-01 ~00:05Z, mechanism/attribution, load 3.6-6.6,
   timing not claimed; F-009): iE has 0 frames > 50 ms (0/3 runs); its cost is nav `L` (JS 13077, 526-617 ms
   per run, max 10 ms per call), so the iE fix becomes the new topic **N12 nav-scroll-handler** (owner
   nav-morph, lead decision). Left > 50 ms on w1: (a) ~60 ms pure style/layout frame at y≈2154 from the
   countdown `span.face` writes (3/3; countdown must say whether 160d69a0 covers it, else a next variant
   before it lands); (b) gtag `onscrollend` (3/3) → N11; (c) nav platform IO callback 46 ms (1/3) →
   re-check in all-wave1 with #13 v03 in. N9 confirmed (gate flaps at its rootMargin edge when parked at
   the `.pain` top: 800 flips, 200 iE runs in 10 s).
   **scroll-engine diag part 2** (w1 vs w1 + /09, mechanism/attribution, load 5.0-7.8, timing not claimed;
   F-011): /09 fixes N9 (800 flips / 200 iE runs / 2194 rects → 0 / 0 / 12 at the `.pain` top) and cv churn
   (6 → 0 state changes per mobile run). Frame (a) above is **not** the countdown faces: it is the first
   render of a deferred section (likely `#platform`'s content-visibility un-skip), and /09 only moves its
   ~45 ms about 50 px earlier into our IO frame. Countdown 160d69a0 does not cover it (owner and F-011
   agree); 03 lands as is (lead decision), 05/08 become countdown's wave-2 variant.
   **Wave-2 order (lead decision 2026-10-01, revised after part 2): N11 and scroll-engine /10 first**
   (whichever is ready takes the first slot; each one ~7 min hold), **then N12 → hero-exit → countdown
   05/08 → E4** (countdown 05/08 moves ahead of N12 only if all-wave1 still shows the y≈2100-2150 frame).
   Each A/B `--on all-wave1`, holds ≤ ~10 min (F-007). Why /10 first: it is the only candidate that hits
   both a Chrome > 50 ms frame (the first render at y≈2100-2150, every run) and the iPhone transition
   clusters (N10/W1). /10 = /09 + idle un-skip (one deferred section per idle callback after load,
   `setTimeout` fallback for Safari, IO as fallback) + per-element `will-change` windows (arch-apple #1).
   /10 mechanism check (short lane, before its A/B): the R3 `contentvisibilityautostatechange` logger shows
   every un-skip before the first scroll (idle phase) and 0 during scroll; cv churn stays 0; `will-change`
   per element only inside its window; no new idle-phase LoAF > 50 ms (one section per idle slice).
   **all-wave1 goal hold done** (2026-10-01 04:37-04:51Z, gated tools 93b4af2, 0/20 contaminated, load1 1.9-3.6;
   `fixes/all-wave1/`, 0e8f288; F-022). Same-hold A/A is the new floor (baseline ~93 fps on the gated tools vs ~75 before:
   never compare with pre-gate numbers). Goal metrics flat: frames > 50 ms 3 [2-4] -> 2 [1-3], > 34 ms 5 [4-6] -> 5 [4-6],
   both within noise. Hints: fps 93.8 -> 110.6, > 20 ms 25 -> 13, forced style+layout 28 -> 0 ms. F-009c (nav IO 46 ms)
   gone 5/5. Left > 50 ms per run: gtag `onscrollend` (48-52 ms, N11) and one script-less 55-70 ms render frame (likely
   F-011, `#platform` first render, scroll-engine /10c). Countdown `active` probe 21 vs 717 face writes: gate works,
   the 1 Hz snap residual goes to countdown 05/08.
   **Wave-2 order (lead decision 2026-10-01 05:00Z, replaces the one above):** N11 -> scroll-engine **/10c** (= /09 + /10
   idle un-skip + /10b per-scene `will-change` + far re-skip behind the user; replaces /10: layers <= w1 at all 8
   positions, F-019) -> **I-018 attribution** (f71ee42: review + A/A with/without cdp-metrics in one hold + test:chrome),
   so wave-2 slots can name the > 34 ms frames (5/run, no named source yet) -> N12 nav-scroll-handler ("20-34 ms band
   only") -> hero-exit -> countdown 05/08 (behind N12 unless /10c fails to remove the y≈2100-2150 frame) -> E4 (folded
   into the attribution step). Every A/B `--on all-wave1` (`fix.mjs apply all-wave1` after rebasing on 0e8f288), holds
   <= 10 min.
   **N11 done 2026-10-01 05:15Z: mechanism only, not counted** (fea23a5; ledger row below). Left > 50 ms targets: the
   F-011 render frame (/10c) and the analytics.js idle-callback frame (whether it lands in the scroll phase is a question
   for the I-018 attribution slot).
   **scroll-engine /10c done 2026-10-01 05:39-05:46Z** (`ab se10c-aw1 --on all-wave1 --runs 5`, 0/10 contaminated, load1
   1.5-2.9; a7b95d1): frames > 50 ms 2 [2-7] -> 1 [0-1] **better** (ranges disjoint), > 34 ms 4 [3-8] -> 3 [2-4] within
   noise; F-011 no-script render frame gone 5/5, the one > 50 ms left is gtag `onscrollend` (N11: page-side fix only
   phase-shifts it). Flag: scroll p95 15.8 -> 16.6 ms WORSE (+1 vsync on ~5 % of frames; /10d wider `will-change` window
   is an open item). **review-10c ACCEPT-WITH-NOTES** (lead lands after a README-only commit). Counted as "> 50 ms 2 -> 1
   in the measured window; load-time cost bounded by the mech probe, iPhone pending": the F-011 render moved to page load,
   which verify settles unthrottled before any measured phase, so the A/B cannot tell removed from moved; the 6x
   from-navigation mech probe (n <= 3) shows no > 50 ms LoAF there. On Safari (no rIC) the un-skips fire on `setTimeout`
   at ~load + 0.65-0.8 s whatever the user does. Tool gap (mgmt-lead iteration 3 / toolsmith backlog, no incident yet):
   verify has no measured load phase at 6x, so load-time costs are invisible. Next: I-018 attribution hold, then
   scroll-engine E3/part-4 diagnostics, then /10d (Safari quiet-input gate, fwReskip fix, wider `will-change` window).
   **Wave-2 stacking base from 2026-10-01 06:10Z: `aw1-10c`** = `node tools/fix.mjs combine aw1-10c all-wave1 scroll-engine`
   (hashes confirmed identical to se10c-aw1 on 8f9ebe5: JS 757e2cbc…, CSS c6aad94b…); every later wave-2 A/B runs
   `--on aw1-10c`. **E3 (06:03-06:05Z, n=1, timing not claimed):** the animation ablation takes > 34 ms 4 -> 1 and finds a
   rare 340-362 ms render storm near the platform agents-ask visual (F-026) -> **new topic N13 platform-visual-anim-storm**
   (fix-scroll-engine, lead 06:10Z), ordered after part 4 and **before /10d** (a > 100 ms frame beats a p95 flag).
   **I-018 (06:1xZ, review-i018 NEEDS-WORK):** CDP metrics become opt-in (default = main exactly, golden test), so no
   on/off A/A gate; validation = one traced real-site 6x run + test:chrome after re-review. Part 4 and q3 may run before
   its hold.
   **Part 4 (06:06-06:11Z, `ab abl-aw1i --on se-aw1i --runs 3`, 0/6 contaminated, diagnostic):** > 50 ms 3 -> 3, > 34 ms
   3 -> 5 (noise), > 20 ms 11 -> 17 worse (`animation:none` changes painted end states, not a clean ablation); the storm
   occurred in 0/6. CSS animations are not the source of the steady > 34/> 50 ms frames, only of the rare storm (~3 in ~22
   scroll passes, ≈ 15 %), so N13 uses a forced-toggle probe, not a plain 5-run A/B.
   **N13 probe (06:17-06:19Z, short, aw1-10c, forced-toggle, 2 passes x 41 class changes):** 0 storms, 0 LoAF > 50 ms;
   the visual's toggles start only ~5-11 animations, so the agents-ask visual is **not** the trigger (F-026's `is-caret`
   attribution was coincidence; cause unknown). The storm needs scrolling and/or first entry into the platform region
   (~15 % of fresh loads, y≈4.7k): candidates first raster/decode of the platform layers, the #platform blur layer, the
   scroll-jack region, GC under scroll. Next: one diagnostic hold (~15-20 fresh loads with CDP tracing, storm traces only).
   **N12 nav-scroll-handler on aw1-10c (06:31-06:39Z, `ab n12-aw1 --on aw1-10c --runs 5`, 1/10 contaminated, provisional):**
   > 50 ms 2 [1-3] -> 2 [1-2], > 34 ms 5 [5-9] -> 5 [5-5], both within noise; AV1 forced style+layout already 1 [0-2] on
   aw1-10c (nothing left to remove); hints > 20 ms 24 -> 18, fps 95.3 -> 99. Parity regressed on the /10c base (sticky
   re-measured mid-scroll after a re-skip; 0.9 s future-card transition) -> v5. **Lead decision 06:46Z:** after v5 parity
   = 0, land as a record ("mechanism + parity, gain 20-34 ms band not shown in Chrome, not in the wave-2 base"), no further
   Chrome slot; land-into-base waits for the iPhone scripted check (iPhone queue item 9).
   **Measurement note:** the aw1-10c baseline gave > 34 ms 5 [5-9] in N12's hold vs 3-4 in /10c's own hold: the
   cross-session spread on > 34 ms is about ±2, so quote > 34 ms only within one hold (A vs B), never across holds.
   **N13 storm-catch (06:45-06:54Z, 24 fresh loads of aw1-10c, 12 traced, load1 3.6-8.1, mechanism only):** 0/24 storms
   (0/29 on any /10c base vs 2/12 without, Fisher p ≈ 0.08); one confirm hold on all-wave1 without /10c decides: >= 2
   storms -> /10c credited with removing it, 0 -> N13 closed "rare, not reproducible" (587df6f).
   **N13 CLOSED 07:18Z: rare, not reproducible** (confirm hold on all-wave1 without /10c: 0/25; 0/49 over both dedicated
   holds; /10c not credited). By-product confirming /10c: the F-011 no-script render frame (54-70 ms at y≈2227-2244) is in
   25/25 all-wave1 loads vs 0/24 aw1-10c loads (39859a5).
   **GOAL STATUS 2026-10-01 07:00Z.** *Chrome (mobile 6x):* page-owned > 50 ms frames 0 on aw1-10c; 1 vendor frame per run
   (gtag `onscrollend`, GA Enhanced Measurement "Scrolls"), removable only by the site's GA setting (N11/03 what-if shows
   it); the lead takes it to the user. *iPhone goal check* (iphone-runner, scripted n=3, B P P B B P, baseline -> aw1-10c):
   fps 52.8 -> 57.1 (disjoint), > 20 ms 76 -> 46, **> 34 ms 16 -> 9, > 50 ms 5 -> 3**, > 100 ms 1 -> 1 (worst 113 -> 106).
   Goal not met on the phone. Left > 50 ms every run: **~106 ms at y≈1960-1970 (pain entry, the N10 "unexplained" frame) =
   #1 iPhone target**; 51-55 ms at y≈50 (first scroll out of the hero); ~50 ms at y≈700 (people) and ~1000 (profile) in
   2/3. The commission cluster (2650-2990) is mostly gone.
   **Lead decision 07:07Z: N10 transition-frames -> fix-scroll-engine, the #1 target** (the y≈1970 frame); /10d behind
   it; the N13 confirm hold stays. Plan: (1) iphone-runner, after the finger tests: iPhone item 1 (R3 cv logger +
   MutationObserver) on aw1-10c through y 1700-2200, n=3, plus a Safari Timeline capture if possible; (2) fix-scroll-engine
   builds aw1-10c ablation overlays (only while chrome-measure is free or short-held): (a) `.pain`/commission-card blur off,
   (b) `.pain` content-visibility visible from load, (c) will-change windows off at the pain boundary, (d) `is-pain-dark`
   frozen; iphone-runner runs each vs aw1-10c, n=3 through y 1700-2200 plus one full-page pass; (3) the ablation that
   removes the frame names the cause class -> real fix (pre-warm / hysteresis / smaller blur) -> Chrome parity + mech
   (short lane) -> iPhone A/B. hero-exit resumes for the y≈50 frame once N10 has a cause.
   **I-018 attribution, first traced run (2026-10-01 07:42-07:44Z, aw1-10c, n=1, traced: direction only; I-018 landed
   d61231e):** trace complete (no data loss), logger/trace windows identical (747 frames, 34 > 20 ms). 5 frames > 34 ms:
   +1100 ms 42.5 style (429 elements restyled); +2300 ms 42.1 paint (+ some script); **+2475 ms 50.2 "other"** (24.8 ms
   RunTask self time, no timeline child = un-instrumented work, not idle); +4817 ms 49.3 "other" (37.8 ms self time);
   **+7042 ms 66.5 script** (one 55 ms FunctionCall = gtag `onscrollend`, the N11 vendor frame; same in the baseline at
   66.4 ms with a 67 ms gtag LoAF). offMain (compositor/raster/GPU) 0-2 ms everywhere; layout is gone from the long frames
   (baseline: a 100 ms layout-dominated frame among 13 frames > 34 ms). Chrome next targets: (1) the two "other" frames
   (needs V8 sampling + GC categories and `--frame-log` for scrollY), (2) the 429-element style recalc at +1.1 s; the
   gtag frame stays the vendor residual.
   **"Other" class named (fix-scroll-engine, 08:14Z, aw1-10c, 3 loads, CPU-profiler trace, load1 4.6-5.3, attribution
   only; F-029):** with V8 sampling the RunTask self time is JS: (1) y=4750, 3/3 loads, 67-83 ms = gtag `onscrollend`
   (+ `document.cookie`, ~3 ms MinorGC), the vendor residual; (2) y=727, 1/3 loads, 50 ms = `Document::recalcStyle` 21.7 ms
   forced by the nav's `ee()` (JS 13223: getComputedStyle on `.start-selling-profile-sticky` + 2 rects per nav pass) =
   N12's area; N12 v5 removes that getComputedStyle. Candidate match for the iPhone's ~50 ms frame at y≈700.
   **F-030 (fix-hero-exit's first-scroll probe, 08:20Z, aw1-10c, Chrome mobile unthrottled, n=1):** /10c's will-change
   window flips `data-fw-wc` on countdown `span.face` ~930 times per scroll step, ~1,500 attribute writes/s plus layer churn
   **even at y=0 at idle, inside the hero** (faces slide out of their overflow:hidden digit window; IO clips by ancestors).
   A regression we introduced, in the area the user feels. Lead decision: if the counts probe confirms, the /10c hotfix
   (`se10e-aw1`: drop `.face` from fwWCSel or observe the digit container) lands after parity + a short review, before
   the phone confirms gain; on the phone it joins the hero block as P2. **Lesson:** review-10c missed idle churn; every
   topic adding observers/listeners/attribute writes now gets an idle-counts probe at y=0 before landing (LEAD.md §4).
   **Order from 07:07Z:** N13 confirm hold -> N10 (iPhone-led) -> /10d -> hero-exit (y≈50) -> countdown 05/08; I-018's traced
   run ahead of later normals; N12 + #6 land after the finger verdict. -> N12 `--on aw1-10c` -> /10d -> hero-exit -> countdown 05/08; I-018's traced run goes
   ahead of any later normal once re-reviewed (N13 before N12: > 100 ms frame class before the 20-34 ms band, principle 1).
4. Single-topic clean re-runs (commission /05, layout-animations 05, countdown, pain, large-area-blur),
   only where the combined result or a Tier B benchmark needs one topic isolated; all after the host gate.
5. N4 / N10 fixes (N3 rejected 2026-10-01, F-015) as their prototypes pass Tier A.

## Priority from user feedback (2026-10-01 08:04Z, replaces the slot-3 order where they differ)

The user finger-tested baseline vs `aw1-10c` on the iPhone and feels **no difference** ("laggy, the same"). The user feels
the lag at (1) the **end of the page** (morph, push past the end) and (2) the **top** (hero and scrolling out of it).
iPhone finger evidence (A2 = baseline, unthrottled): the end-of-page morph runs at ~10-18 fps, a steady run of 51-112 ms
frames at scrollY 5220 (the morph pin) while the user pushes past the end, > 50 ms 50-75 per pass, worst 112-218 ms;
Chrome's morph phase never showed this. Hero window y 0-900: > 50 ms 3-12 per pass, worst 71-107 ms. Middle: worst
115-152 ms at y≈1936-2092.
**Order:** (1) **morph on WebKit** (end of page; owner proposed: fix-nav-morph resumed, or a fresh fix-owner from its
READMEs; #6 v05 C/D finger pair first, then name the pin frames with a logger during finger runs, phone ablations: the
`scrollTo` pin loop, morph-panel backdrop blur, panel mount/layout, non-passive touch listeners); (2) **hero-exit**
(resumed 08:06Z; from 08:30Z owns the whole hero window y 0-900: topic 7 hero v2 + F-032 people-o grid/height
transition as variant P3; iPhone block B aw1-10c / P hero v2 / P2 + scroll-engine face fix (F-030) / P3 + people-o); (3) **N10** y≈1970 (fix-scroll-engine,
ablations ready). Chrome-only 20-50 ms work (the "other" class diagnostic, the 429-element restyle) runs only on spare
Chrome capacity. Success is judged on the iPhone under a finger first, then Chrome > 50/> 34 ms.
**Wave-2 base from 2026-10-01 08:38Z: `aw1-10e`** = `node tools/fix.mjs combine aw1-10e all-wave1 scroll-engine` (JS
3e2f599a…, CSS c6aad94b…): /10e hotfix landed (60f66b6, review-10e ACCEPT-WITH-NOTES; F-030 face will-change churn
1,915 IO entries/s at idle → 0, parity 0 diffs). Owners rebase between steps and build new variants `--on aw1-10e`;
in-flight iPhone blocks keep their matched pairs.
**Morph finger block (08:15-08:37Z, warm phone, user released after it):** E1b (aw1-10c) morph-active p50 24 / p95 73 ms,
> 50 ms 10 %, worst 230, pin fight (scrollY 5220↔5334); F1/F2 (g = pin clamp + `overscroll-behavior-y: none` while
morphing) p50 17-19 / p95 86-117, > 50 ms 21-26 %, worst 148-199, pin fight gone. Slow frames are rendering
(paint/composite), not JS. User: "laggy" for both. Root cause of the jitter: pin target 5312 > maxY 5220 when the morph
starts in the bounce. g stays (the jitter fix is real); render cost next: three blur radii rewritten every morph frame
(panel filter, backdrop-filter, `.start-selling-platform` filter blur(…12px), CSS 5423). Next: a scripted morph driver
so iphone-runner runs f vs g (is overscroll-behavior costlier on WebKit?), g+b (no blurs), g+e (no columns), g+c
(prelayer) without the user; if b names the blur -> N2 composited morph (fixed radii faded by opacity).
**Finger simulation (user request 08:38Z):** arch-finger researches real OS-level touch on the iPhone (WDA/XCUITest,
safaridriver touch actions, simulator) so finger tests stop depending on the user. **Plan landed 2226d51**
(`research/architecture/finger-simulation.md`: WebDriverAgent/XCUITest real touches over USB); toolsmith `ts-gesture`
builds `gesture.mjs` + `wda.mjs` (measurement code: reviewer before landing); the user's one-time setup (Xcode Apple
account, Developer Mode, Enable UI Automation) is pending. On the phone: V0 smoke (~15 min) + V1 validation (~60 min)
after the morph block, when ready.
**Design engineering (lead 08:55Z, user request):** de-morph (team lead), de-hero, de-middle build per-frame cost models
(read-only, report to the lead; proposals routed to owners). **de-morph done (5c4fc37,
`research/design-engineering/README.md`, `morph-endpage.md`):** the morph's moving-frame cost is a full repaint of the
resized layers every frame (4-10 Mpx; WebKit drops a resized backing store, F-036), not the blur. Ranked refactors: R1
size-stable morph panel (p50 58-68 -> ~17-33 ms, derived), R2 clip-path morph + color-mix cross-fade, R5/R6 no layer
creation at the tween start, R3 WAAPI tween. Test (lead): fix-nav-morph builds the `h-fixedpanel` driver ablation on
aw1-10e, run in the morph driver block next to b-noblur; the model predicts h-fixedpanel beats b-noblur by 20-35 ms per
moving frame; whichever wins sets the morph direction (blur wins -> R7 fixed-radius blur fades above R1). The README's
de-hero and de-middle rows are placeholders, merged when their notes land. General findings on the board: F-036-F-039.
**iPhone hero block (08:53-09:08Z, iphone-runner, control passed, window y 0-900, median [range]):** P2 /10e (n=6) vs B
aw1-10c: > 34 ms 6 -> 4.5, > 50 ms 1 -> 1; hero v2 (P, n=3, on aw1-10e, read against P2): **y≈50 frame 43 -> 35 ms
(gone)** but **y≈700 frame 52 -> 63 ms (worse, disjoint)**; P3 (+ people-o) same y≈700 cost, y≈50 gain not kept. y≈700
is a baseline frame (nav leaves `is-hero-pill` + `section#people` `is-visible` start transitions in the same step,
F-035); v2's +10 ms there is WebKit-only. Next: hero bisect on the phone (v4nocards, v5noblur vs P), then the real fix,
then one Chrome A/B `--on aw1-10e`. Worst frame in every full pass stays y≈1965 (N10): 86-106 ms. Process rule (F-034):
an overlay queued or served on the phone is frozen; new work goes under a new name, the runner checks hashes.
**Design-engineering notes complete (09:25Z; main 7576f74 `middle.md`, 7d60f9f `hero.md`, README merged ranking).**
Lead decisions:
- **y≈1960 worst iPhone frame (86-106 ms) = the morph IntersectionObserver threshold, not `.pain`** (de-middle): in 11/11
  phone runs it starts at scrollY 1834-1867, where the morph IO on `#platform` (`rootMargin: 200%`, JS 13080-13088)
  fires at y = 1830; it predicts N10 ablations a-d all leave a 95-115 ms frame there. Test first on the phone, both vs
  the aw1-10e control (fix-nav-morph 34941df; owner chose a 10e rebuild of #6 v05 over `aw1-10c-6` so the pair differs
  in one thing): **e1** = `mw10e-e1` passive listeners (JS 3645c50c, CSS 97a20ad3), **e2** = `mw10e-e2` IO margin 200 %
  -> 150 % (JS 1abe16f1; prediction: the frame moves to y≈2218); R3 logger gains a panel-present flag + `inert`/`src`
  (H1a listener arming vs H1b pre-mount not run). If e1/e2 confirm, the frame moves from fix-scroll-engine (N10) to
  fix-nav-morph (cluster B; de-middle R1: take every side effect out of the IO frame) and N10 a-d drop in priority.
- **de-middle R2** (`::before` solid-colour layer for `is-pain-dark` / `.commission.shrinking`, 10-20 ms -> < 2 ms per
  switch) -> **fix-scroll-engine**. **de-middle R3** (unexplained per-frame repaint of the 373×344 feed rect over y
  1600-2500, -2-5 ms per frame) -> **unowned candidate** (needs one Web Inspector Timeline capture at y≈1900 first).
- **Hero y≈625-745 frames (43-63 ms) = the "0.72 flip"** (de-hero): nav drops `is-hero-pill` and `#people` goes
  `visibility: hidden` -> visible, starting a 1.6 s `blur(14px)` on a 430×775 layer, all in one frame (F-035). N12
  removes the forced read, not the style work: **judge N12 by forced ms, not by the y≈700 frame.** **h1** (opacity 0 +
  `inert` instead of `visibility: hidden`, pre-raster while invisible, blur 14px -> 0) -> fix-hero-exit coordinates,
  touching large-area-blur / phone-invisible-shrink code. Hero bisect gains de-hero's variants (HEflip off = v6noflip,
  `.hero-copy` exit opacity-only = v7copyop, cards-only = v4nocards) + a Web Inspector Layers capture y 580-780 on P2 vs P.
- **h3 countdown strip** (one 12-glyph strip per digit, no per-face `will-change`; 160 -> 0-16 layers; also morph R6 and
  the 1 Hz idle spikes): no active owner; **next spawn candidate (fix-countdown-idle-raf)**, spawned by the lead when an
  iPhone slot for it is in sight.
- **Lead's ranking (09:25Z, replaces the README order where they differ):** (1) morph gh / R1 size-stable panel;
  (2) y≈1830 morph IO (if e1/e2 confirm); (3) h1 flip; (4) h3 countdown strip; (5) middle R2; (6) h2; (7) the rest.
**Morph driver block result (09:27Z, iphone-runner, scripted driver, no touch/rubber band/pin):** moving-frame p50
median gh 26 / gb 29 / g 35 ms, p95 56-58 / 50-52 / 62-114 (clean rounds; the phone warmed in round 3). gh ≈ gb, both
~6-9 ms better than g: **not** the predicted >= 25 ms drop for gh; neither de-morph's R1 (size-stable panel) nor the blurs
dominate alone. f vs fb, g vs ge, g vs gc not run (lower priority). Next step for fix-nav-morph.
**Morph next (lead 09:3xZ):** no landing decision from the driver block. fix-nav-morph built `mw10e-ghb` (gh + the three
blurs off, diagnostic: additive -> moving p50 ~17-20 ms, else a third term dominates) and an R2 probe page (does WebKit's
`clip-path` clip `backdrop-filter`?); R2 (clip-path morph) is built only after the probe. de-morph reconciles its model
with the driver numbers. **de-apple** (user request): apple.com's rendering math, `research/design-engineering/apple-math.md`.
**h1 built (fix-hero-exit 6e0a49f, Chrome short lane only):** `--h1` (aw1-10e + h1, vs P2) and `--h1v2` (aw1-10e + v2 + h1,
vs P; final candidate). Hidden `#people` card = opacity 0 + `inert` (armed at mount, rastered before the flip); the flip
changes only opacity/filter/transform; blur 14px -> 0px, then `filter: none` + inert off after ~1 s. Parity 0-0.21 %
across the reveal; idle at y=0 identical; cost: ~14 MB backing for the hidden card from mount; a11y stricter than the
baseline (the hidden profile tabs leave the a11y tree; reviewer to confirm). Phone decides (flip pair target <= 34 ms).
**de-middle R2 built (fix-scroll-engine 91d7571, `r2-bg-layers` on aw1-10e, CSS only):** frozen-frame parity 0 %
(is-pain-dark forced on/off too); Chrome paint counts: each `is-pain-dark` switch repainted the root layer + `.pain-sticky`
(+3.1 M CSS px) on aw1-10e, +0 on r2 (F-040); `.shrinking` repaints nothing extra in Chrome, so its WebKit effect needs
the phone. **/10d prototype** `se10d-aw1` (e920843): mech clean (idle F-030 0/s, parity 0, scroll-restore fix, quiet-input
gate); Chrome A/B after the e1/e2 verdict.
**e1/e2 block (iphone-runner, ended 09:48Z): de-middle CONFIRMED.** Control 94 ms median @y≈1967; e1 (passive) 94 @1965
(H1a rejected); e2 (IO margin 150 %) moves it to y≈2240 at ~96 ms; panel pre-mounted at scroll start 9/9 (not H1b); the
R3 src/inert logger names it 9/9: **a burst of >= 12 img `src` assignments in that frame (the morph IO sourcing the panel
images)** (F-043). Per the lead's standing decision the frame moves to **fix-nav-morph** (cluster B; de-middle R1: image
sourcing at idle / `decode()` before the swap / spread over frames), ranked #2; **N10 a-d drop to the end of the queue.**
Measurement note (F-042): the first scripted run after ~10 min idle is slow even on a cool phone; warm-up control first.
**R2 clip probe:** WebKit computes both properties, but `Page.snapshotRect` doesn't capture `backdrop-filter`, so the
answer needs the user's 2-second look (asked via the lead).
**de-middle R3 named (F-041, fix-scroll-engine read-only):** the per-frame 373×344 feed repaint is likely the spinning
vinyl (`.record.spinning` rotate, CSS 3880-3887) under `.feed .body` `overflow: hidden` + `mask-image` (CSS 5143-5150);
fix options (a) mask -> `::after` white gradient overlay (equivalent pixels), (b) `will-change: transform` test. Owner: lead.
**Lead decisions 09:55Z:** **N10 a-d dropped** from the phone (fix-scroll-engine stops N10; /10d continues on its own merits:
one normal slot `--on aw1-10e` after the main tests, rebased on d1c324c). Builds at fix-nav-morph, in order: img-sourcing
fix (y≈1960) -> R8 (exact class toggle at m >= 0.55 that kills the nav backdrop and platform filter, de-morph/de-apple)
-> R5 (no layer creation at the tween start); R2 clip-path waits for ghb/ghbn. R3: fix-scroll-engine builds (b)
`will-change: transform` and (a) `::after` gradient (0 % parity first) as phone diagnostics. h3 countdown: no spawn yet
(de-apple: 160 layers is under the count budget); attribute the 1 Hz 35-58 ms idle spike on the device first (idle-at-top
Timeline capture in apple-ref or a spare minute). ts-gesture NEEDS-WORK (6 findings); the user's WDA setup is pending.
**Results 09:50-10:08Z (date -u):** morph-2 ghb (clean phone): moving p50 ghb 21 / gh 24 / g 33 ms, p95 ~46-52 all; the
"b" builds only removed the panel and platform filters; the per-frame variable backdrop blur sits on the nav itself (CSS
11387) -> `mw10e-ghbn` (nav backdrop off while morphing). Built for the phone: `mw10e-src` (y≈1960 fix candidate: panel
images sourced at idle after pre-mount, 2 per slice; Chrome: 21/21 decoded at y=0 within 1 s, 0 src writes in scroll, no
new > 50 ms task, morph diff 0.05 %; lead: if it wins with clean parity -> review -> first wave-2 landing candidate);
`mw10e-ghr8` (R8) and `mw10e-ghr85a` (R8 + R5a), upper-bound diagnostics (nav half not pixel-exact before m≈0.9).
**/10d Chrome A/B (10:05Z, `ab se10d-aw1 --on aw1-10e`, n=5, 1/10 contaminated, provisional):** > 50 ms 2 [1-2] -> 2 [1-2],
> 34 ms 4 [4-6] -> 4 [4-5], p95 17.3 -> 17.2 ms (the /10c +0.8 ms flag does not recur), screens <= 0.09 %. Neutral in
Chrome; its value (Safari quiet-input gate, scroll-restore fix) shows only on the iPhone (check at the end of the queue).
**hero-A (iPhone, ended ~10:16Z, control passed; worst frame in the y≈680-750 flip window, median of 3):** h1v2 52 (77/35/52)
vs P 65; h1 45 vs P2 56 -> h1 cuts the flip ~11-13 ms, target <= 34 ms met in 1/6; v2's extra flip cost remains (h1v2 52
vs h1 45) -> hero-B (v7copyop, v6noflip) tests it. y≈50 stays gone with v2; no new frame ~1 s after the flip; idle
identical. A 41-51 ms frame at y≈1250 is in all four builds (unowned; fix-hero-exit names a candidate read-only).
**mw10e-src (iPhone, ~10:30Z): NOT a winner** (y≈1960 long frame: control 86/92/88 vs src 97/84/91 ms, images pre-sourced
21/21, 0 src writes in scroll). **Correction (F-044):** the R3 logger capped at 12 events per frame; with src staged the
frame shows one event, **the morph panel's `inert` removal at the IO edge** (3/3). The trigger is the panel leaving
inert, not the img burst; fix-nav-morph's #2 item becomes "take the inert flip out of the scroll frame".
**mw10e-noinert (iPhone, ~10:36Z): NOT a winner** (y≈1960: control 102 vs noinert 98 [95-99] ms; idle mount at y=0 not
heavier). The frame now carries only 2 tabindex writes, so its cost is other IO-callback work (style breadth / layout /
paint / composite) that the attribute logger can't see. Next: the iPhone Timeline clock fix (`Page.disable` +
`Page.enable` before `Timeline.start`, from de-devtools/de-safari) to get per-frame style/layout/paint records on the
phone, then one Timeline capture of that frame. **F-045** (y≈1250 = `.commission` scene gate) is weakened by phone data
(those frames are 35-37 ms, no flip in-frame): no build.
**Protocol v2 APPROVED and landed (670b4bf, `research/architecture/measurement-protocol-v2.md`; lead ~10:45Z).** Stages
R/I/D/F/V/L with gates; the lead signs attribution cards and fast-path calls; mgmt-ops validates slot tickets; iPhone
§5 applied by hand until T1a/T2 land; predictions in `fixes/PREDICTIONS.md`. Toolsmiths: ts-iphone-run (T1a),
ts-analysis (T3), ts-render-signals (T6+T7, I-032); doc pass doc-protocol-v2. **F-047: the iPhone Timeline clock fix
works** (Page.disable -> Page.enable -> Timeline.start on the page target: real start/end on all records,
performance.mark arrives as TimeStamp, RenderingFrame 16.6-16.7 ms steady) -> §5.5's "inference" is confirmed.
**ghbn (lead 10:5xZ):** ghbn ≈ ghb ≈ gh in rAF (moving p50 25/26/27) = the expected reading under L13 (backdrop GPU time
is invisible to rAF): **render-bound, LOCATED**, no more rAF blocks; 1-min computed-style mechanism check owed; the real
verdict waits for T10 / Instruments hitches (the user's Instruments pairing gates the render-bound class). ghr8 dropped
for now, revisit after hitches.
**y≈1960 frame NAMED (iPhone, na/nb block ended ~10:43Z + P2b Timeline):** edge frame C 104/107 ms, **na (wheel/touch
listeners armed once at setup) 34/35 = gone**, nb (no `b` at the edge) 84/101 = stays; na costs nothing elsewhere
(scroll fps 57.0/57.6 vs 55.4/56.3, whole-scroll > 50 ms 0/0 vs 3/1, idle and load equal). P2b: RecalculateStyles 34-42 ms
(incl. Layout 19-24) + Composite 58-72 ms, JS ~1 ms. Mechanism: the window wheel/touch listener add at the morph IO edge
(likely event-region invalidation over all layers). fix-nav-morph sends the attribution card to the lead, then builds the
landable fix (listeners armed at idle + a cheap touchmove gate); touch-only class -> G or F before landing.
**CAVEAT, host display state (arch-unknowns U1, `research/architecture/unknowns-validity.md`; lead 11:0xZ):** Chrome
baseline fps is ~76 with the display on vs ~93 in DarkWake, so the "~93 fps floor" (04:25Z) and the canary drift 92 -> 76
may be the host, not the tools. **From 11:01:46Z every hold runs display-on** (`caffeinate -d -i -s`, user-approved; lead
restarts it every 2 h), which matches how the user uses the site. Chrome results before 11:01Z compare with later ones
**only if `pmset` shows the display was on**; **the DarkWake runs (00:17-06:21Z, ~93 fps baselines) compare with nothing
after them.** Back-tagging existing results.json/canaries from `pmset -g log` is a desk task (fix-scroll-engine, for the
T8 host-record ticket). Also U2: phone rAF timestamps are off the vsync grid -> every phone verdict in k-ticks AND
legacy ms; U5: the warm-up covers every arm's port; U7/U9: `Date.now()` + settings fingerprint per run (T2 schema).
**Gesture/WDA tool landed (main 5d357b1, review-gesture-2 ACCEPT):** the G driver exists; its first real run (V1: aw1-10c
vs mw-g) waits for the user's one-time WDA signing setup. **Bundled user asks (lead presents after arch-lead's
synthesis):** WDA signing setup, Instruments pairing (gates the render-bound class), finger batch (incl. the R2 clip look).
**iPhone queue (v2, lead-approved 10:5xZ, + 10:59Z y≈1960 blocks):** morph attribution session (P2/P3 + ghbn mech check +
P-016 hold-250 pair) -> y≈1960 block A (F1 mw10e-arm-load) -> block B (F2 mw10e-arm-idle) -> hero 2 blocks + P3b -> R2 bg
-> /10d -> N12 -> R3/h3.
**iPhone queue (v2, lead-approved 10:5xZ, superseded):** na/nb + P2b (Timeline attribution of the y≈1960 frame) -> morph attribution
session (de-safari P2/P3) -> hero 2 blocks + P3b (LayerTree census y 580/780 before any v6/v7 bisect) -> R2 bg -> /10d ->
N12 -> R3/h3. Only ticketed builds; reorders only at block boundaries. Ticket and queue rules: `fixes/LEAD.md` "Stages and
gates", paragraph "Slot tickets (phone access)"; card templates (incl. the prediction card): `fixes/_template/CARDS.md`.
**Measurement protocol v2 (in progress, user request ~10:20Z):** arch-lead drafts
`research/architecture/measurement-protocol-v2.md` (research -> investigate -> distinguish -> fix -> review) with inputs
from the owners, ops and the devtools/safari notes; execution after the lead's approval; the current queue runs unchanged
until then.
**iPhone queue (10:08Z):** hero-A -> mw10e-src (vs aw1-10e, warm-up control) -> ghbn (vs ghb, gh) -> ghr8 / ghr85a (vs gh)
-> hero-B -> apple-ref (+ idle Timeline) -> R2 (+ r3a/r3b if cool) -> N12 -> /10d check; ts-gesture V0 after the user's
setup. Blocks of ~9 runs with a 10 min gap (the phone heats after 15-20 min of back-to-back runs).
**iPhone queue (09:55Z, lead; superseded):** morph-2 (ghb + ghbn nav backdrop off while morphing; R2 clip
probe when the user can look) -> hero-A (h1v2) -> hero-B (drop v4/v5 if h1v2 wins) -> apple-ref (+ idle-at-top Timeline)
-> R2 bg-layers -> N12 -> img-sourcing candidate -> ts-gesture V0 after the user's setup.
**iPhone queue (09:38Z, superseded):** e1/e2 (aw1-10e control) -> morph-2 (ghb ABBA vs gh, g control; R2 clip probe) -> hero-A (h1v2 vs
P, h1 vs P2) -> hero-B bisect (v7copyop, v6noflip, v4nocards, v5noblur vs P; v3
dropped) -> **apple-ref** (user request via the lead: live apple.com AirPods Pro page, plus iPhone 18 Pro if the phone is
cool, same driver and Timeline counts as aw1-10e, one block with a control; write-up in
`research/architecture/apple-verify.md` "iPhone Safari check") -> R2 bg-layers (B P P B, y≈850-1000 + commission end) ->
N12 -> N10 a-d; ts-gesture V0/V1 when ready.

## Baseline freeze (user decision, 2026-10-01 ~07:35Z)

The user froze today's mirror build as the baseline: `site/` and `site-pretty/` get **committed on main** (Hard rule 3
changes for those two paths only; rule 2, never push / no remote, stays). Toolsmith `ts-snapshot` builds it: `.gitignore`
and pre-commit changes (the user approves the enforcement edits), a committed pin `baseline.json`, start-up checks that
report BASELINE-MODIFIED, worktree access (sparse checkout or copies), a guard on `mirror.mjs`/`prettify.mjs`, and the
CLAUDE.md wording. **LANDED 2026-10-01 ~08:48Z: main 4edb872 "baseline: snapshot b1789284481295-4ad4a84a"** (tooling
01db299..a27e872, review-snapshot ACCEPT-WITH-NOTES). Every worktree, between steps (never mid-A/B or mid-iPhone-block):
`git rebase main`, then `node tools/baseline.mjs sparse` (drops the 61 MB copy; `fix.mjs doctor` shows the snapshot id).
Results before and after are comparable (bytes identical, metadata only); a modified baseline makes the tools refuse with
BASELINE-MODIFIED. Side effect: bench toolsSha changed, so stored gain calibrations read stale. **Nobody runs `mirror.mjs`
or `prettify.mjs`.** All results so far are on this build; the
pin makes later rebuilds comparable or explicitly not. arch-snapshot (research) wrote the versioned-baseline design.

## iPhone status (07:35Z)

The phone throttles thermally again (control run failed 2x); the user is cooling it. Order once a control passes: finger
tests (via the lead) -> N10 R3 logger + ablations d, c, b, a -> item 9 (N12) -> 2, 4-8. **Standing rule (lead 07:41Z):**
every iPhone block (a session or a block of scripted runs) starts with a passing control run; a failed control voids
that block's numbers; a control fails if bottom/idle < 58 fps or baseline scroll < 44 fps.

## Started now (prototype while the queue drains)

- N3 `main-thread-infinite-animations`: **rejected 2026-10-01** (F-015, a49e591): the orbit is `display:none`, all CSS animations ~1 ms/frame at 6x; owner done. Its iPhone questions are look-only item 7 below.
- N11 `vendor-scrollend`: new owner, research first (can the page avoid gtag's 45-74 ms `onscrollend`
  without breaking analytics? Label any vendor-config change as "needs the site's GA setting").
- W1-W3 / R1-R3 answers (arch-research2) feed N10 and the touch-path metrics.

## Adoption ledger: every review item has an owner and a slot, or a recorded "no" (mgmt-lead item 7, 2026-10-01)

Sources: E1-E5 `research/architecture/measurement-review.md`; W1-W3 / R1-R3 `research/architecture/answers-2.md`.
"Ticket" = target frame class, expected change, parity + mechanism checks passed (slot entry ticket, item 3).

| item | decision | owner | slot / ticket |
|---|---|---|---|
| E1 lazy mount + hit test + passive + countdown `active` | yes | fix-nav-morph | normal slot, priority 1; ticket: morph IO LoAF (>50 ms) gone; mechanism/attribution run at current load, timing not claimed |
| E2 state-flip probe | yes | fix-scroll-engine | diagnostic slot, priority 2; uses R3 (capture-phase `contentvisibilityautostatechange` + MutationObserver); iPhone part when the phone is back |
| E3 animation ablation | yes | fix-scroll-engine (part 3; N3 rejected, E3 stays) | diagnostic slot, priority 2; N3's cheaper first-reader probe (R2) goes in the short lane |
| E4 `.hero-track` IO (T7) | yes, wave 2 | fix-nav-morph | after E1, `--on all-wave1` |
| E5 per-frame log + getMetrics deltas | yes | ts-i017 (after the host gate) | tool, no slot; `--frame-log` opt-in (a per-rAF scrollY read can force layout), getMetrics deltas on by default |
| W1 WebKit content-visibility un-skip at 0 margin + layer rebuild | yes -> N10 | N10 owner after the wave-1 combine (no new N-topics before it); fix-scroll-engine applies it in its hysteresis variant now | wave 2, biggest expected iPhone gain; iPhone check: R3 capture-phase logger |
| W2 iPhone rAF gaps are main-thread frame gaps | yes (metric naming) | everyone writing iPhone results | iPhone check: 300 ms busy loop mid-scroll (page keeps moving, scrollY jumps) |
| W3 background flips on an empty composited child | yes -> N10 (N9 candidate 3) | as W1 | wave 2 |
| R1 touch latency histograms | **no** for now | - | not a goal metric, and it needs a measurement-code toolsmith; revisit only if N7 input-listener-diet becomes a topic |
| R2 animation update runs before rAF | yes | fix-infinite-anims (N3) | **done** (N3/02): ≤ 0.2 ms/frame at 1x for the first reader, animations running vs paused |
| R3 statechange event timing | yes | fix-scroll-engine (E2) | inside the E2 slot |
| AV1 apple-verify: scroll-metrics-cache success metric (`research/architecture/apple-verify.md`) | yes | fix-nav-morph (N12) | success = forced style+layout ms in the scroll phase -> ~0 (all-wave1 already 0 in Chrome); judge N12 on it plus > 34 ms |
| AV2 apple-verify: "countdown-idle-raf moves up" | **no** (lead 05:05Z) | - | idle rAF 48-95/s at rest is a battery/idle-cost item, not a > 50/> 34 ms frame source; all-wave1 already gates countdown writes; countdown 05/08 stays after hero-exit |
| N11 vendor-scrollend result (lead 2026-10-01 05:2xZ) | **mechanism only, not counted**; 02 not in wave-2 combines | - (owner done) | gtag frame phase-shifted, not removed (analytics.js idle-callback LoAF 50-61 ms in 3/5); > 50 ms 2 → 2, > 34 ms 3 → 4 within noise (fea23a5). 03 = site-owner GA advice. Open for the I-018 attribution slot: does that idle-callback frame fall inside the scroll phase? |
| AV3 F-016 (430x932 trips apple.com base tier), F-017 (per-call debounce in Apple analytics), F-021 (`html { scroll-behavior: smooth }`: scripted scrollTo must pass `behavior:'instant'`) | yes, as pitfalls | every owner writing a probe | F-021 applies to every scripted scroll driver on our page |

iPhone scripted-check queue (lease per CLAUDE.md, plain http per I-003). **The phone is back (2026-10-01 ~06:50Z):
`iphone-runner` owns it and works in this order: goal check baseline vs `aw1-10c` (n=3, B P P B B P), finger tests via the
lead (`FINGER_TESTS.md`), then items 1, 2, 9, 4-8.** Items:
1. R3 capture-phase `contentvisibilityautostatechange` logger on the plain baseline, together with E2's
   iPhone part (moved up 2026-10-01: in Chrome, scene/content-visibility flips name 0 of 7 slow frames on
   wave1-partial, so only the phone can tell whether they cause the iPhone clusters).
2. W2 busy-loop check (300 ms busy loop mid-scroll: the page keeps moving, scrollY jumps).
3. Wave-1 combined confirmation (after the combined overlay exists).
4. Combined wave-1 vs combined minus large-area-blur, /03 Timeline paint-area method, n=3, order B P P B B P: how much blur paint remains once phone-invisible-shrink is in (review-blur).
5. large-area-blur final overlay (/06) scripted scroll + Timeline paint check, and a LayerTree count for the entry-animation part (owner's open items).
6. Look-only: carousel follower alignment (device-pixel snap) on layout-animations v10 (5602e1d). Chrome
   pixel diffs showed followers 0/±1 device px off from non-snapped `translate` (same in 03; equal by eye
   in Chrome). Check whether the offset is visible on the phone; only then a snap follow-up slot (F-008).
7. /10c (a7b95d1, review-10c), finger + look: (a) finger scroll within 1 s of load (un-skips fire at ~load + 0.65-0.8 s
   on Safari regardless of input); (b) fast fling bottom -> top: hero-track / #people blank or jump at y≈4.0-4.5k;
   (c) toolbar collapse stutter; (d) reload while scrolled mid-page; (e) scroll-up re-render at 1.5 vh; (f) the Chrome
   p95 flag (+1 vsync): visible on the phone?
8. Look-only (N3, F-015; decides whether N3/04, a T6 pause for step-end and compositor loops, is worth building):
   (a) does WebKit tick the step-end opacity loops (three-frame at commission, agents caret) on the main thread
   every frame or only at steps (Safari Timeline, 6 s idle parked at y≈2796 on the plain baseline: style recalcs /
   paints in the underline and zero-mark rects); (b) do off-screen composited loops (scroll-float, vinyl,
   marquees) keep the render server compositing at idle (Timeline "Composite" count at an idle stop with all of
   them off-screen, vs the same stop with `animation-play-state: paused` injected). Method:
   `fixes/main-thread-infinite-animations/README.md` "iPhone pending".
9. N12 nav-scroll-handler v5 vs aw1-10c (scripted scroll, n=3 each, order B P P B B P): > 34 ms frames and their scroll
   positions, nav `L` time per scroll if the Web Inspector timeline shows it, and the parity spots (is-on-dark at
   y≈2231/2251, profile-sticky at ≈2001). Decides whether N12 enters the wave-2 base (lead decision 06:46Z).
