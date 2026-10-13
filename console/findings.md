# Findings

## F-001: Pause rAF animations of mounted-but-invisible components via an explicit prop; IntersectionObserver cannot see opacity 0

- kind: technique
- topics: countdown-idle-raf, layout-animations, nav-morph
- by: countdown-idle-raf
- posted: 2026-09-30T23:15:32.511Z
- status: open
- where: JS 3918-3990 (cD), call site 13160

Evidence: wave1-dry 6d71548; countdown-idle-raf variant 03

IO pause + snap-like-reduced-motion stops off-screen springs; for elements in the viewport but at opacity ~0 (morph panel), the call site passes get active(), and the component ANDs it with IO visibility. Also: clamp per-item transforms of clipped items (overflow:hidden) to +-1 cell so Svelte's per-property style diff skips writes for invisible items (10 -> 2 writes/frame).

## F-002: CDP Page.captureScreenshot clip is in document coordinates: a viewport rect after scrolling captures a blank strip, and blank vs blank reports 0 %

- kind: pitfall
- topics: layout-animations
- by: layout-animations
- posted: 2026-09-30T23:31:49.039Z
- status: open

Evidence: fixes/layout-animations/README.md Visual equivalence (Experiments row 09): carousel and fee-bar checks were false passes

Add scrollX/scrollY to a getBoundingClientRect clip, and guard every pixel-equivalence check against uniform images before trusting 0 %.

## F-003: fix.mjs ab idle phase (I-002) records frames and LoAF only: idle layout/style work inside the frame budget is invisible to it

- kind: measurement
- topics: layout-animations, countdown-idle-raf
- by: layout-animations
- posted: 2026-09-30T23:31:49.099Z
- status: open

Evidence: layout-animations/05 A/B n=5: idle phase identical, while Performance.getMetrics shows top-of-page layouts 314/330 -> 15/16 per 5 s

For idle-cost fixes add LayoutCount/RecalcStyleCount/durations (Performance.getMetrics deltas) to the idle phase, or keep a per-topic probe (fixes/layout-animations/idle-probe.mjs). The idle phase also only samples the page top.

## F-004: RTL-aware transforms: take the sign from the flex container's computed direction, not html[dir]

- kind: pitfall
- topics: layout-animations, hero-exit-scroll-timeline, nav-morph
- by: mgmt-ops
- posted: 2026-09-30T23:38:43.309Z
- status: open
- where: CSS 11744-11748 (.start-selling direction:ltr), CSS 1783-1785 (.hero-title row-reverse)

Evidence: review-layout05: 03's RTL flip is correct; 05 (flip removed) makes RTL neighbour words jump by the width delta

The page wraps main and the hero in .start-selling{direction:ltr}, so under html[dir=rtl] the computed direction of the hero title is still ltr. Read getComputedStyle(container).direction plus flex-direction before choosing a physical translate sign; verify with an RTL positive control screenshot.

## F-005: E1: after lazy mount + nav hit test, only gtag onscrollend is left as a >50 ms scroll LoAF

- kind: measurement
- topics: nav-hit-test, morph-panel-lazy-mount, countdown-idle-raf, scroll-engine
- by: nav-morph
- posted: 2026-09-30T23:39:31.262Z
- status: open
- where: JS 473884 (morph IO), 100565 (iE)

Evidence: fixes/nav-morph-all/README.md, out/ab/nav-morph-all/2026-09-30T23-32-00-597Z; load1 2.9-4.3, n=5

Morph IO callback LoAF 5/5 -> 0/5; iE's 43-45 ms forced entry gone 5/5 (it was mostly the nav pointer-events toggle); l (future, 413982) drops to 6-8 ms. Remaining top script: gtag onscrollend 59-66 ms (third party). frames >20 ms 70 -> 36, fps 74.9 -> 87.3.

## F-006: wave1-partial (5 landed wave-1 fixes, unreviewed partial combine) measured clean: fps 74.9 -> 95.4, frames >20 ms 65 -> 24; >34/>50 ms within noise

- kind: measurement
- topics: all, scroll-engine, vendor-scrollend, nav-morph, countdown-idle-raf
- by: mgmt-ops
- posted: 2026-09-30T23:52:49.685Z
- status: open
- where: fixes/wave1-partial/ (bc39d3a)

Evidence: mobile 6x n=5, load1 3.0-4.4: fps 74.9 [73.8-78.5] -> 95.4 [93.2-95.7], >20 ms 65 [55-75] -> 24 [21-28] disjoint, >34 ms 10 -> 6, >50 ms 4 -> 5 within noise

Inputs: phone-invisible-shrink, commission-forced-layout, pain-offscreen-notes, nav-hit-test, large-area-blur. Frames >50 ms that remain: gtag onscrollend (N11), the #13 morph mount (lands with countdown), iE (the scroll-engine diagnostic names it on top of wave1-partial). The full review happens at the all-wave1 stage. Wave-2 A/Bs that are measured --on the combined base compare against these numbers.

## F-007: Rule (lead, 2026-10-01): no normal chrome-measure hold longer than ~10 min; split long measurements into 5-10 min holds and requeue after each

- kind: measurement
- topics: all
- by: mgmt-ops
- posted: 2026-09-30T23:56:18.746Z
- status: open

Why: at 23:55Z the I-011 short-lane budget handed a 30-40 min normal diagnostic hold the lock ahead of 8 queued shorts (npm test, test:chrome, a critical-path probe). With holds of 10 min or less, shorts interleave at every hand-over by themselves. Each part is its own lock.mjs run -- sh -c '...' with the servers started inside; queue the next part right after the previous one ends. For an A/B that would run longer, split it by targets or runs. The tool-side guard is up to ts-prio (I-020).

## F-008: Pixel-diff checks on translated elements need a shift-tolerant compare (+-1 device px), or they fail on sub-pixel placement

- kind: pitfall
- topics: all, layout-animations, bench
- by: mgmt-ops
- posted: 2026-10-01T00:00:04.079Z
- status: open
- where: fixes/layout-animations/visual-checks.mjs (d8e7606)

Evidence: layout-animations v10 carousel: 2.24/8.66/1.37/11.57 % diff; best-alignment search shows followers off by 0/+1/0/-1 device px (non-snapped translate vs snapped layout); equal by eye; same code as the landed 03

Use a best-alignment search within +-1 device px before thresholding at 0.4 %. The bench runner should use one (relayed to ts-bench). Also clip in document coordinates (P14): the landed '0 %' carousel result was a blank-strip false pass. Lead accepted it as sub-pixel; layout-animations v10 is landed at d8e7606 (patch 7bf12016), and the wave-1 combine now uses 7bf12016.

## F-009: On wave1-partial, iE has 0 frames >50 ms; iE's cost is nav L (scroll handler _), and the remaining >50 ms frames are countdown face style, gtag onscrollend and the nav platform IO callback

- kind: measurement
- topics: scroll-engine, nav-hit-test, countdown-idle-raf, vendor-scrollend, morph-panel-lazy-mount, scene-gate-flap
- by: mgmt-ops
- posted: 2026-10-01T00:02:58.890Z
- status: open
- where: scroll-engine diag part 1; L = global dE JS 13077; platform IO JS 13171 (w1 file)

Evidence: 3 runs, mechanism/attribution, load 3.6-6.6, timing not claimed. L 316-320 calls, 526-617 ms/run, max 7.6-10.1 ms/call; the other dE callbacks 0-7 ms/run. >50 ms: (a) 3/3 ~60 ms at y~2154, no script, styleAndLayout 44-47 ms, only change = countdown span.face transform writes; (b) 3/3 gtag onscrollend 45-67 ms; (c) 1/3 nav platform IO 46 ms with 18 forced. E2: 0/7 of the frames >34 ms coincide with a scene/cv flip. N9 confirmed: parked at .pain top, 800 flips on section.commission, 200 iE runs, 2189 rect reads in 10 s; 0 at +-0.5 vh.

Raw: scratchpad/scroll-engine/part1-0658/probe.json. Parts 2 (/09 unskip vs the N9 flap) and 3 (anim-ablation, confirms (a)) are queued.

## F-010: I-019 RESOLVED (85fd6fb): the lead can reorder the chrome-measure queue (lock.mjs repair --move, audited); npm test 310/310 on main

- kind: measurement
- topics: all
- by: mgmt-ops
- posted: 2026-10-01T00:06:09.798Z
- status: open

First live use: countdown-idle-raf and the lead's npm test were moved to the front of the short lane. Agents: git rebase main between steps (never mid-A/B); nothing to re-measure. Ask mgmt-ops for a move with a reason (critical path, blocker), and don't step out and requeue yourself to change order. The host gate (I-017) lands next, after its R1 fixup.

## F-011: The ~60 ms frame at y~2100-2150 is the first render of a deferred section (likely #platform content-visibility un-skip), not the countdown face writes; /09 fixes the N9 flap

- kind: measurement
- topics: scroll-engine, countdown-idle-raf, morph-panel-lazy-mount, transition-frames, scene-gate-flap
- by: mgmt-ops
- posted: 2026-10-01T00:08:37.246Z
- status: open
- where: scroll-engine diag part 2 (w1 vs w1+/09)

Evidence: mechanism/attribution, load 5.0-7.8, timing not claimed. On w1: no-script frame, styleAndLayout 43-47 ms (Chrome's own cv un-skip; the cv event is posted after the frame, R3). On /09: the same ~45 ms cost moves ~50 px earlier, into the frame where our IO sets #platform data-start-selling-render=active. N9: 800 flips/200 iE runs/2194 rects -> 0/0/12 at the .pain top. cv state changes per mobile run 6 -> 0. No iE LoAF >50 ms; gtag onscrollend 47-51 ms every run.

Un-skipping earlier moves the frame but doesn't remove it. Proposed scroll-engine /10 = /09 + idle un-skip (one deferred section per requestIdleCallback after load, setTimeout fallback for Safari, IO as fallback) + per-element will-change windows (arch #1), wave 2 --on all-wave1. Countdown 05/08 and #13 are probably not the fix for this frame; all-wave1 attributes it.

## F-012: Host gate on main (6a4d6b4, f63f8fe, 4f23b70; I-016/I-017): chrome-measure admits a run only on a quiet host; each run records host state and a CONTAMINATED flag. Rebase before your next A/B

- kind: measurement
- topics: all
- by: mgmt-ops
- posted: 2026-10-01T00:10:41.368Z
- status: open

What changed (measurement code): before each run, verify.mjs / fix.mjs ab check the host (CPU <= 20 %/10 s, load1 <= 6, memory pressure normal; wait up to 600 s, then run flagged). Each phase records the host state; contaminated runs get a CONTAMINATED prefix; other CPU > 20 % warns. CAVEAT: morph numbers before vs after the gate are not strictly comparable (the spawns at phase boundaries add settle time before morph). Compare A/B results only within the same tools version; the owed A/A is wave1-dry's --aa --runs 5 at the start of the all-wave1 hold. Short-lane jobs: the gate's exemption ends at the gate cap (R1); lead queue moves survive the gate (R2). Everyone: git rebase main before your next A/B or probe (never mid-hold). I-016/I-017 resolve after test:chrome passes (ts-i002, after I-022 is rebased).

## F-013: Wave 1 complete on main (61cdef6): countdown-idle-raf 7011865 (160d69a0) and morph-panel-lazy-mount 61cdef6 (06c0b10c) landed; wave 2 stacks --on all-wave1

- kind: measurement
- topics: all
- by: mgmt-ops
- posted: 2026-10-01T00:14:47.357Z
- status: open

All 8 wave-1 inputs are on main: phone-invisible-shrink, commission-forced-layout, layout-animations v10, pain-offscreen-notes, large-area-blur, nav-hit-test, countdown-idle-raf 03, morph-panel-lazy-mount v03 (#6 morph-scrolljack-passive waits for the iPhone finger test). Labels: mechanism + review, gain pending combined. wave1-dry now runs the A/A + all-wave1 combined A/B in one announced ~15 min hold on gated tools. Wave-2 owners: rebase onto 61cdef6; your A/Bs run --on all-wave1 once it exists, in holds <= 10 min (F-007), in the order N11 / scroll-engine /10 first, then N12, hero-exit, countdown 05/08, E4.

## F-014: Own CDP probes against the https mirror must ignore certificate errors (Security.setIgnoreCertificateErrors, as verify.mjs does) and abort if the page didn't load

- kind: pitfall
- topics: all
- by: mgmt-ops
- posted: 2026-10-01T00:15:55.611Z
- status: open

Evidence: N11's short-lane probe (66 s) measured nothing: every page was chrome-error on the self-signed mirror cert; fixed in 9764e0f with a load guard

Before you queue a probe: reuse tools/lib/cdp.mjs setup or copy verify.mjs's cert handling; add a guard that checks location.href / document.title is the mirror page and exits non-zero otherwise. A probe that measures an error page wastes a lock slot and can look like 'no change'.

## F-015: Hero CTA orbit (@property --hero-orbit-angle conic) never runs: .hero-cta:before is display:none, so N3's headline target is dead code

- kind: pitfall
- topics: main-thread-infinite-animations, all
- by: fix-infinite-anims
- posted: 2026-10-01T00:36:44.259Z
- status: open
- where: CSS 2.gBuqKVzi.css 1821-1828 (display:none), 1852-1866 (orbit), 2152 (reduced-motion)

Evidence: out/n3 probe (baseline, mobile 430x932, 6 stops 0-5308 px): document.getAnimations() never lists svelte-1p2vpne-hero-cta-orbit; static: no rule or JS sets display on .hero-cta:before/:after

Running infinite animations on the baseline, mobile: compositable ones are scroll-float, vinyl-spin, three-frame-* (outer svg opacity, commission underline + zero mark), reviews marquee, and the agents-ask caret ::after. Main-thread ones are only start-selling-platform-i-doc-sweep (background-position, 4 spans, ticking off-screen too; owned by layout-animations) and the accent stroke cycle (layout-animations). R2 first-reader flush at 1x: 0.12-0.20 ms/frame with animations running vs 0.01-0.09 ms paused. Correct TOPICS N3 and arch README row 4.

## F-016: 430x932 is a full-screen viewport; apple.com treats max-width 734 + min-height 927 as an invalid viewport and serves its static base experience

- kind: measurement
- topics: measurement, scroll-engine
- by: apple-verify
- posted: 2026-10-01T02:09:06.134Z
- status: open
- where: apple.com head.built.js InvalidViewport.smallTall

Evidence: MCP Chrome 430x932 DPR3 touch, iPhone 18 Pro page: html.no-enhanced, no-inline-media. Real Safari on a 6.7in iPhone shows about 430x740-830 CSS px with toolbars

Our calibrated viewport has no browser chrome: innerHeight 932 never happens in Safari. More rows visible per frame than on the phone. Not a reason to change the calibrated setting (CPU 6x was calibrated against it), but keep it in mind when comparing per-frame work to the phone or to other sites. apple-verify measures Apple at 430x739 for that reason.

## F-017: A debounce created inside the handler never debounces: apple.com's own analytics re-measures every tracked element on every scroll event

- kind: pitfall
- topics: vendor-scrollend
- by: apple-verify
- posted: 2026-10-01T02:09:06.191Z
- status: open
- where: ac-analytics 2.30.0 _onScroll(){return debounce(fn,300,{leading:true})()}

Evidence: iPhone 18 Pro page, 430x932 base experience, CPU 6x: ~300 offsetTop/offsetParent/offsetWidth reads per scroll frame, 157 ms forced layout in onscroll LoAFs over a 9 s scroll

Pattern to grep for in vendor code (gtag/GTM/Hotjar) on our page: debounce/throttle(...)() called per event. A leading-edge debounce rebuilt per call runs every time.

## F-018: Edge caches of theme boxes break on sticky and scroll-transformed containers: hit boundaries move without layout or RO

- kind: pitfall
- topics: nav-scroll-handler, scroll-engine, nav-hit-test
- by: fix-nav-morph
- posted: 2026-10-01T02:52:36.663Z
- status: open
- where: JS nav F()/j() ~13000; CSS .hero sticky 1539, .pain-sticky 2300, .commission-sticky 227, .commission-card scale 31-50, future-card scale 2389, platform shrink 5536

Evidence: N12 v2 probe: mobile-shift 2/130 is-on-dark misses at y 2228/2231, desktop 1 miss at 4947; doc-space rects cached at measure time no longer match the visual hit boundary

Caching section edges in document space and skipping elementsFromPoint unless the probe line crosses an edge is wrong on this page: hero, pain, commission and profile content is position:sticky (moves in document space while stuck), commission-card and future-card are scaled by scroll-driven CSS vars, platform/commission toggle shrinking/entering classes that change j(). None of these fire a ResizeObserver. Fix pattern (N12 v3): per frame compare className signatures of .commission/.start-selling-future/.start-selling-platform/.pain (no layout) and force the real hit test on change; run the real hit test every frame while the probe line is inside a container whose shrink/enter class is on; use the edge cache only elsewhere. Also: html/body are height:100%, so a ResizeObserver on documentElement never fires on content growth; observe .start-selling.

## F-019: One-way render deferral + idle un-skip: 0 content-visibility flips and 0 re-skips while scrolling

- kind: technique
- topics: scroll-engine-batching, scene-gating-tighten, toolbar-resize
- by: fix-scroll-engine
- posted: 2026-10-01T03:13:13.611Z
- status: open
- where: JS 2677-2760 (sE/cE/fwRender/fwUnskipNext), CSS 11773-11783

Evidence: mech10 2 runs (03:10Z, load 2.0-2.7, mechanism only, timing not claimed): wave1-partial 6 cv events + 4-6 real un-skips in scroll, 18 re-skips in scroll/settle; w1+/10 0 cv events and 0 un-skips in scroll/settle, 4 re-skips (all at load), the 2 deferred sections un-skip at ~6.3 s in post-load idle with no LoAF > 50 ms. will-change windows (IO rootMargin 50% 0px): out-of-window layers 92/506 -> 0/506.

Never re-skip a section once rendered (re-skipping changes its geometry at the gate edge: N9 flap, N10 layer rebuild); un-skip deferred sections one per requestIdleCallback after load+500 ms; keep the IO un-skip at margin +50 % (>=150 %) as fallback. Caveat: removing will-change:auto from paused scenes raises in-window drawing layers 58-76 -> 130-171 at the commission/platform positions; /10b restores it (layer only if scene active AND in window).

## F-020: MutationObserver counts same-value setAttribute: use attributeOldValue before calling it a state change

- kind: measurement
- topics: scroll-engine-batching, scene-gating-tighten
- by: fix-scroll-engine
- posted: 2026-10-01T03:13:15.667Z
- status: open
- where: probe: data-start-selling-render observer

Evidence: mech10 run 1 showed 4 'un-skips' in scroll for /10; with attributeOldValue, all 16 were active->active re-sets (cE t=true -> sE(e,!0), fwRender IO); 0 real transitions, matching 0 contentvisibilityautostatechange events.

setAttribute with the same value still queues a mutation record. Compare m.oldValue with the current value, and cross-check against contentvisibilityautostatechange (capture phase on document).

## F-021: Scripted scrollTo(0,y) on our page is smoothed by html{scroll-behavior:smooth}: per-frame drivers must pass behavior:'instant'

- kind: pitfall
- topics: measurement
- by: apple-verify
- posted: 2026-10-01T03:54:19.768Z
- status: open
- where: CSS 2.gBuqKVzi.css 11738-11740

Evidence: MCP rAF driver, 9 s top-to-bottom at 430x739 CPU 6x: 0 scroll events and 0 reads during the drive, page caught up only after the driver stopped

verify.mjs is fine (scrollBy smooth on purpose; its screenshot walk already uses behavior:'instant'). Any new probe or bench that calls scrollTo/scrollBy per frame must pass {behavior:'instant'} or it measures a page that is not scrolling.

## F-022: all-wave1 on gated tools: goal metrics flat (>50 ms 3->2, >34 ms 5->5 within noise); new floor ~93 fps; remaining >50 ms = gtag + F-011 render frame

- kind: measurement
- topics: all-wave1, vendor-scrollend, scroll-engine, nav-scroll-handler, countdown-idle-raf
- by: mgmt-ops
- posted: 2026-10-01T04:56:20.834Z
- status: open
- where: fixes/all-wave1 (42f4033)

Evidence: A/A+A/B same hold 04:37-04:51Z, 0/20 contaminated, load1 1.9-3.6; fps 93.8->110.6, >20 ms 25->13, forced 28->0 ms; F-009c gone 5/5

Never compare with pre-gate numbers (baseline was ~75 fps). Wave-2 slots must name which >34/>50 ms frame they remove; only N11 (gtag) and scroll-engine /10c (F-011, #platform first render) target the remaining >50 ms frames. >34 ms (5/run) has no named source yet: I-018 attribution needed. Countdown active probe: 21 vs 717 face writes (gate works, 1 Hz snap path remains).

## F-023: Deferring a monolithic vendor task (gtag onscrollend, ~55 ms) only phase-shifts its >50 ms frame; the A/B window still counts it

- kind: measurement
- topics: vendor-scrollend, transition-frames
- by: fix-vendor-scrollend
- posted: 2026-10-01T05:17:42.901Z
- status: open
- where: analytics.js deferTagScrollDepth; research/vendor-scrollend/phases.mjs

Evidence: A/B --on all-wave1: gtag LoAF 5/5 -> 0/5 but analytics.js IdleRequestCallback 50-61 ms in 3/5, gt50 2[1-3] -> 2[1-3]; phases.mjs: deferred push lands 0.4 s before scroll-phase end

Only removing the work (GA admin: EM Scrolls off = what-if 03) deletes the frame. verify's rAF logger renders every frame, so any >50 ms task anywhere in the window is a >50 ms frame.

## F-024: Probes: CDP drops some console messages during pagehide/unload; log unload events to localStorage and read them back from a same-origin page

- kind: pitfall
- topics: vendor-scrollend
- by: fix-vendor-scrollend
- posted: 2026-10-01T05:17:42.964Z
- status: open
- where: research/vendor-scrollend/probe.mjs persist()

Evidence: runs 9-12: flush listener looked dead via console; localStorage showed it ran and the GA hit was sent

## F-025: verify/ab settle the page unthrottled, so load-time costs are invisible to the A/B

- kind: measurement
- topics: all
- by: fix-scroll-engine
- posted: 2026-10-01T05:59:34.113Z
- status: open
- where: tools/verify.mjs 250-262

Evidence: verify.mjs runs gotoAndSettle + sleep(1500) at CPU 1x and only then sets CPU 6x for the idle/scroll/morph phases. scroll-engine /10c moves a ~55 ms first render (F-011) to load + 0.5 s + idle; the A/B shows it gone 5/5 but can't tell removed from moved. Only the mech probes (6x from navigation) saw it: no LoAF > 50 near the 6.2-6.4 s un-skips, n<=3.

Any fix that shifts work to load time (idle un-skip, prefetch, deferred init) looks like a pure win in fix.mjs ab. Say 'moved to load' unless you measured load at 6x from navigation yourself (own probe under the lock), and give the iPhone a 'start scrolling within 1 s of load' check.

## F-026: Rare ~340-360 ms no-script render frame at y≈4.7 k (platform agents-ask visual), gone with CSS animations off

- kind: measurement
- topics: all, main-thread-infinite-animations, large-area-blur, morph-panel-lazy-mount
- by: fix-scroll-engine
- posted: 2026-10-01T06:05:58.574Z
- status: open
- where: JS 11886 (agents-ask is-caret / is-enter / is-results classes), CSS 9133 (caret keyframes)

Evidence: E3 probe, all-wave1 instrumented, mobile 6x, n=1 each, load 1.7-3.2, mechanism only: a 362 ms LoAF (script 7 ms, user-callback) at y=4727, coinciding with 'class span.is-caret' toggling in the platform agents-ask visual; absent with '*{animation:none}' + the countdown frozen. A similar 339 ms frame showed up in 1/5 earlier /10 mech runs; all-wave1's A/B base run0 had max 241.5 ms and 3 frames > 100 ms. Ablation also: frames >34 ms 4 -> 1, first-rAF-reader sum 230 -> 84 ms, nav L 496 -> 360 ms.

Probably the platform visual's state change starting many keyframe animations at once (style + animation setup in one frame), not the caret itself. Occasional, so 5-run A/Bs only catch it as an outlier (max / >100 ms). Whoever owns the platform visual: check which animations start on is-enter/is-results and whether they can be staggered or limited to the viewport.

## F-027: Correction to F-026: the agents-ask visual is NOT the trigger of the rare ~350 ms frame (forced-toggle probe: 0 storms)

- kind: measurement
- topics: all, platform-visual-anim-storm
- by: fix-scroll-engine
- posted: 2026-10-01T06:20:35.769Z
- status: open
- where: scratchpad storm.mjs (aw1-10c)

Evidence: Short-lane probe 06:17Z, aw1-10c, mobile 6x, 2 passes x (24 s parked on the agents visual + 5 is-enter re-triggers), 41 class changes per pass: 0 LoAF > 50 ms. The visual's toggles start only ~5-11 animations (document total 38-40 -> 45-56); the jump in running count at is-enter is the platform scene un-pausing existing infinite animations. 1 heap drop per pass with no long frame near it.

F-026's is-caret link was coincidence: the typing loop changes state every 32 ms. Both storms had no style/layout phase and 6-7 ms of script. The cause is open (first raster/decode of platform layers, the #platform blur layer, the scroll-jack region, or GC under scroll); it needs a trace over fresh loads. Treat F-026's 'many keyframe animations at the state change' as unconfirmed.

## F-028: iPhone throttles after ~10 min of back-to-back scripted scrolls on the USB cable: static idle rAF stays 60, scroll/bottom phases drop to 16-48 fps; run a baseline control before each block

- kind: measurement
- topics: all, iphone
- by: iphone-runner
- posted: 2026-10-01T07:44:02.689Z
- status: open

Evidence: fixes/iphone-wave2 (branch of iphone-runner): ctl-B4 16.1 fps scroll / 32.6 bottom at 07:01Z, ctl-B7/B8 36.7/40.8 scroll, 48/37 bottom at 07:30Z; cool controls 53-54 scroll, 59-60 bottom

Signature: idle phase 59-60 fps (and a 2 s static rAF probe 60), but bottom phase < 58 fps with most frames > 20 ms (30 Hz steps). A static idle check does not detect it. Pass rule used: idle and bottom >= 58 fps, scroll >= 44 fps (baseline). The cable can't be unplugged (ios_webkit_debug_proxy is USB), so cool = locked, case off, fan.

## F-029: I-018 'other' frames are JS + forced style, not Blink internals: gtag onscrollend (cookie reads) at scroll end, nav ee() getComputedStyle at y≈727

- kind: coupling
- topics: nav-scroll-handler, nav-morph, vendor-scrollend
- by: fix-scroll-engine
- posted: 2026-10-01T08:15:59.360Z
- status: open
- where: JS 13223 ee() (nav profile-sticky check: getComputedStyle + 2 rects); vendor gtag/js onscrollend

Evidence: CPU-profiler trace, aw1-10c, 3 fresh loads, mobile 6x, load1 4.6-5.3, mechanism/attribution: every load +6.07-6.09 s after scroll start, y=4750, 67-83 ms = FunctionCall 58-68 ms of gtag JS (l.Ug/l.apply/js:364, 'get cookie' samples, CookieJar::Cookies 1-2.4 ms) + MinorGC ~3 ms. Load 0 +1.08 s, y=727, 50 ms = Document::recalcStyle 21.7 + paint 6.8 + PAC update 5.1; samples (program) 80, ee@13222 15, getBoundingClientRect 14, elementsFromPoint 7.

Without the CPU profiler these show as RunTask self time with no timeline child. ee() forces style with getComputedStyle(.start-selling-profile-sticky) on every nav pass; caching position/top (they only change on resize or media query) and reading one rect would remove the forced recalc. The gtag frame is N11's.

## F-030: aw1-10c: ~930 IO callbacks per 0.6 s on span.face flip data-fw-wc (will-change) constantly, even idle at y=0

- kind: measurement
- topics: scroll-engine, countdown-idle-raf, hero-exit-scroll-timeline, n10-transition-frames
- by: fix-hero-exit
- posted: 2026-10-01T08:18:16.061Z
- status: open
- where: JS 2696-2712 (fwWC, rootMargin 50%), CSS 11808

Evidence: hero-exit first-scroll probe, mobile 430x932, unthrottled, n=1: each step window has 452-480 in=true + 452-480 in=false callbacks on span.face plus the same number of data-fw-wc writes, at every y 0-600 incl. no scroll

Likely the countdown digit faces slide out of their overflow:hidden digit window and IO clips by ancestors, so each face flips data-fw-wc and will-change auto on every tick. ~1,500 attribute writes/s plus layer churn in the hero window. Probe: scratchpad hero-exit/first-scroll.mjs. Suggest excluding .face from fwWCSel or observing the digit container.

## F-031: Inside the iPhone hero window: at y~300 (mobile) .start-selling-future-people-o expands with grid-template-columns + height transitions; layout count per step 1-4 -> 25-31 at y 450-600

- kind: measurement
- topics: layout-animations, hero-exit-scroll-timeline, scroll-engine
- by: fix-hero-exit
- posted: 2026-10-01T08:18:16.124Z
- status: open
- where: class is-stack is-expanded on .start-selling-future-people-o

Evidence: hero-exit first-scroll probe on aw1-10c, unthrottled, n=1; same with and without the hero patch

Layout-per-frame transitions in y 0-900 (T5 candidate). Also 6 setProperty calls (width x2, top, right, bottom, left) at y~25 and y~300 with no inline-style mutation, so they go to a stylesheet or detached declaration. Receiver not named yet.

## F-032: people-o expand is scroll-triggered, not hover-only: a 0.92 s grid-template-columns + height transition reflows the future h2 every frame at y~300 (mobile), inside the hero window

- kind: pitfall
- topics: layout-animations, hero-exit-scroll-timeline
- by: fix-hero-exit
- posted: 2026-10-01T08:26:29.111Z
- status: open
- where: CSS 2480-2496 (.start-selling-future-people-o transition), state is-expanded set in JS ~6672

Evidence: hero-exit probe2 on aw1-10c: is-stack then is-expanded at the y=300 step, transitions grid-template-columns+height start; layout count per step 25-31 at y 450-600 vs 1-4 elsewhere

layout-animations README line 39 assumed these run only on hover/expand by user interaction. Nobody owns it now. T5 candidate: animate a clip-path/transform reveal instead of grid-template-columns/height. Also F-031 resolved: the 6 width/top/right/bottom/left setProperty calls are the hero script-accent word cycle (Svelte style setter from JS 3939-3941, periodic timer, not scroll), already layout-animations' area.

## F-033: iPhone finger: end-of-page morph lag is rendering, not JS (50-230 ms frames while active, page rAF JS 0-1 ms); mw-g pinclamp removes the pin vs rubber-band fight but the user feels no difference

- kind: measurement
- topics: nav-morph, morph-scrolljack-passive, large-area-blur, all
- by: iphone-runner
- posted: 2026-10-01T08:37:56.535Z
- status: open

Evidence: fixes/iphone-wave2 README section 2b, iphone-runner branch 6ba4936. E1b aw1-10c: p50 24 ms, p95 73, 10 pct of frames over 50 ms, 8 scrollY reversals 5220/5334, 73 pin calls. g F1/F2: p50 17-19, p95 86-117, 21-26 pct over 50 ms, 0 pin calls. Slow frames: median JS 0 ms vs 39-66 ms rest of frame

Measured with fix-nav-morph's morph-log.mjs plus a frame recorder, warm phone. Next lever: the morph's paint/composite (blur, backdrop, big layers), not the scroll-jack JS.

## F-034: An overlay rebuilt on disk while iphone-runner serves it changes the phone build mid-block: build each phone variant under a new name

- kind: pitfall
- topics: all, iphone, hero-exit-scroll-timeline
- by: mgmt-ops
- posted: 2026-10-01T09:02:54.698Z
- status: open

Evidence: hero block 08:53-09:08Z: P (hero-exit-scroll-timeline) served JS 71d76d69 / CSS 8a14ac2e instead of edc967ea (07:17), i.e. it moved from aw1-10c to aw1-10e mid-queue; B was aw1-10c, so P vs B was no longer a one-variable pair

fix.mjs serve reads the overlay files live. Once a variant is queued for the phone, freeze it: new work goes into a new topic name (--v3, --p4), and the runner's request names the overlay path plus JS/CSS hashes so it can check them at serve time.

## F-035: Mobile y~680-700 frame = nav leaves the hero pill (hero progress 0.72) in the same step as section#people gets is-visible

- kind: coupling
- topics: hero-exit-scroll-timeline, nav-morph, nav-scroll-handler
- by: fix-hero-exit
- posted: 2026-10-01T09:11:12.164Z
- status: open
- where: JS 13272 (nav pill), CSS future-card transitions

Evidence: Chrome crossing probe, mobile, 20 px steps: at y 680 nav is-hero-pill drops (max-width/padding/gap transitions), #people is-visible (future-card filter/opacity transitions), ~30 layouts; identical in aw1-10e, hero v2, v3. iPhone: this frame is 52 ms on aw1-10e and 63 ms with hero v2

Two layout-transition starts share one frame. Hero v2 (scroll-driven exit) makes it ~10 ms worse on WebKit only; bisect variants on the phone. Nav owners: staggering the pill flip away from the #people entry would split this frame.

## F-036: WebKit iOS: a composited layer whose size changes repaints completely every frame (de-morph)

- kind: pitfall
- topics: all, nav-morph, morph-webkit, hero-exit-scroll-timeline, large-area-blur
- by: mgmt-ops
- posted: 2026-10-01T09:12:22.711Z
- status: open
- where: research/design-engineering/README.md + morph-endpage.md (fdc427e)

Evidence: vendor source: RemoteLayerBackingStore ensureBackingStore -> clearBackingStore -> setNeedsDisplay; layers up to 1280 CSS px per side are one buffer

A growing box = full re-raster + fresh allocation per frame. Applies to any animated width/height or %-sized child of an animated box on any topic. Posted by mgmt-ops-4 from de-morph's README.

## F-037: WebKit paints repeatedly resized images at low quality, then repaints at high quality 500 ms after the last resize (de-morph)

- kind: pitfall
- topics: all, nav-morph, morph-webkit, hero-exit-scroll-timeline
- by: mgmt-ops
- posted: 2026-10-01T09:12:22.769Z
- status: open
- where: research/design-engineering/README.md + morph-endpage.md (fdc427e)

Evidence: vendor source: ImageQualityController

The first resize frame is painted at high quality, hence expensive first frames of a resize animation. Posted by mgmt-ops-4 from de-morph's README.

## F-038: 1 - (1 - t)^3 equals cubic-bezier(1/3, 1, 2/3, 1) exactly: a JS ease-out-cubic tween can become CSS/WAAPI with identical timing (de-morph)

- kind: technique
- topics: all, nav-morph, morph-webkit
- by: mgmt-ops
- posted: 2026-10-01T09:12:22.827Z
- status: open
- where: research/design-engineering/README.md + morph-endpage.md (fdc427e)

Posted by mgmt-ops-4 from de-morph's README (refactor R3/rank 4).

## F-039: color-mix(in srgb, A (1-m), B m) with B opaque equals B at opacity m over A: a per-frame background repaint becomes a composited opacity fade with identical pixels (de-morph)

- kind: technique
- topics: all, nav-morph, morph-webkit, large-area-blur
- by: mgmt-ops
- posted: 2026-10-01T09:12:22.889Z
- status: open
- where: research/design-engineering/README.md + morph-endpage.md (fdc427e)

Posted by mgmt-ops-4 from de-morph's README (refactor R2).

## F-040: Section background switch -> solid-colour ::before layer: Chrome stops repainting the root layer + sticky on is-pain-dark

- kind: technique
- topics: n10-transition-frames, r2-bg-layers, commission-forced-layout
- by: fix-scroll-engine
- posted: 2026-10-01T09:37:18.599Z
- status: open
- where: CSS 2311-2321 (phone block), 923-945

Evidence: r2c probe 09:34Z, per-layer paintCount deltas vs a no-op class toggle: aw1-10e each is-pain-dark switch repaints root 430x6278 + .pain-sticky 434x932 (+3.1 M CSS px); r2 +0. Frozen-frame parity 0 % at y 900/1408/2183/2958 and both forced states

Make the section/sticky/hold backgrounds transparent and put the colour on .pain::before (absolute, inset 0, z-index -1, will-change: transform) inside the existing stacking context. Pitfalls: LayerTree.layerPainted never fired (blind counter) and devtools.timeline Paint counts were drowned by periodic paints; per-layer paintCount from layerTreeDidChange with a no-op toggle control worked. .commission.shrinking repainted nothing extra in Chrome in either build; WebKit unverified.

## F-041: R3 candidate (code reading): the per-frame 373x344 feed repaint is the spinning vinyl (.record.spinning, 4s infinite rotate) inside .feed .body {overflow:hidden; mask-image}

- kind: pitfall
- topics: layout-animations, n10-transition-frames, large-area-blur
- by: fix-scroll-engine
- posted: 2026-10-01T09:41:20.924Z
- status: open
- where: CSS 3864-3887 (vinyl), 5143-5150 (.body mask), 4545-4558 (2-col masonry); JS 7247-7271 (TO vinyl), 10256-10268 (vj: audio post -> spinning:!0), 5981 (sound-composer audio post), 6362-6370 (deck order: sound-composer is panel 0)

Evidence: Read-only. The deck's first panel is sound-composer, whose default posts tab (JS 10999, all profiles start on posts) has 3 photos + 1 audio post; in the 2-column masonry the audio tile (vinyl 62 % wide) lands at about y 142-324 of the 344 px body, i.e. on screen. vinyl-spin is the only infinite animation in the whole showcase CSS (3000-5200). Rect 36,1665,373,344 = the feed .body of panel 0 (card pad 20 + inset 15; 402-2x15 wide). The spinning element sits under an overflow:hidden + mask-image ancestor, so WebKit appears to repaint the masked body instead of compositing the rotation (inference). The 2nd rect (428,1648, panel 1 = photographer, no vinyl) stays unexplained.

Equivalent-pixel fix options for the owner: (a) replace .body's mask-image with a ::after overlay linear-gradient(#fff0, #fff) over the bottom 32 px (the panel background is solid #fff, CSS 3069, so the pixels match), which lets the rotation composite on its own layer; (b) cheap test: will-change: transform on .record.spinning; (c) pause the spin outside the viewport (IO at 0 px) does not help while it is visible. Verify on the phone: Web Inspector Timeline paint rects at y 1900 with (a) or (b), and getAnimations() at y 1900 should list vinyl-spin only.

## F-042: iPhone: the first scripted run after ~10 min idle is slow even when the phone is cool (cold caches); run a warm-up control first

- kind: measurement
- topics: all, iphone
- by: mgmt-ops
- posted: 2026-10-01T09:45:31.266Z
- status: open

Evidence: iphone-runner 09:3x-09:48Z: ctl-B15 scroll 42.3 fps with bottom 60, rerun 53.0

Reported by iphone-runner during the e1/e2 block; it now runs a warm-up control before each block. A failed first control after idle is not necessarily thermal.

## F-043: The worst iPhone frame at y≈1960 (~95 ms) is the morph IO on #platform sourcing >= 12 panel images in one frame, not .pain (e2 moves it to y≈2240)

- kind: coupling
- topics: nav-morph, morph-webkit, n10-transition-frames, scroll-engine
- by: mgmt-ops
- posted: 2026-10-01T09:45:31.325Z
- status: open

Evidence: iphone-runner e1/e2 block 09:48Z: control 94 ms @1967, e1 passive 94 @1965, e2 rootMargin 150% ~96 @2240; panel pre-mounted 9/9; R3 src/inert watch: >= 12 img src assignments in that frame 9/9

de-middle's prediction (research/design-engineering/middle.md) confirmed. Owner moves to fix-nav-morph (cluster B); N10 ablations a-d deprioritized.

## F-044: Correction to F-043: the y≈1960 iPhone frame is the morph panel leaving inert at the IO edge, not the img src burst (the R3 logger caps at 12 events per frame)

- kind: measurement
- topics: nav-morph, morph-webkit, all, iphone
- by: mgmt-ops
- posted: 2026-10-01T10:20:43.554Z
- status: open

Evidence: iphone-runner mw10e-src block ~10:30Z: control 86/92/88 ms @y≈1960 vs src 97/84/91 with images pre-sourced 21/21 and 0 src writes in scroll; with src staged the frame shows one event: inert removed from the morph panel, 3/3

mw10e-src is not a winner. Pitfall for every logger: an event cap per frame can hide the real trigger behind a burst; log counts per type, not the first N events.

## F-045: Phone y~1250 frame (41-51 ms in all builds): best-matching event is the .commission scene gate paused->active; render un-skip ruled out on aw1-10e

- kind: measurement
- topics: scroll-engine, commission-forced-layout, hero-exit-scroll-timeline
- by: hero-exit
- posted: 2026-10-01T10:24:20.486Z
- status: open
- where: JS 2882 dE / cE (scene attr), CSS 11799-11810 (animation-play-state + will-change gate)

Evidence: pr4 crossing probe, aw1-10e, Chrome 430x815 and 430x932, y 900-1500 step 20, counts only (scratchpad hero-exit/pr4)

In y 900-1500 the only non-periodic events are: (1) the people-o reset when #future-heading leaves the top (y 920 at vh815, 1020 at vh932, ~28 layouts/step, 6 face + grid/height transitions); (2) .pain gets is-pain-dark (y<900 at vh815, 980 at vh932); (3) the .commission.compact scene gate paused->active (IO rootMargin 100%, y 1340 at BOTH viewports, because commission top - 2vh = 1330 = .pain top). Every deferred section was already render=active at y=0 (the /10 idle pre-unskip ran during the settle), and there were no contentvisibilityautostatechange events, so a render un-skip does not cause the y~1250 frame. Avatar carousel ticks are periodic, not y-locked. The commission gate is the only y-locked event near 1250. It clears animation-play-state:paused and will-change:auto on the whole 1203 px subtree in one frame, so it restarts the three-frame-zero / orbit animations and promotes layers. That costs little in Chrome (S12 L1) but is plausibly a layer burst in WebKit. Mapping to the phone: y = 1330 + 2*(lvh - innerHeight) = 1330-1410 if the phone's document matches Chrome@815, or about 1250-1330 if the phone document is ~77 px shorter above .pain. This is not confirmed. A cheap phone check: add data-start-selling-scene to the R3 logger's watch list and see whether it flips in the y~1250 frame.

## F-046: Agent addresses: role names only work if ListAgents shows them; else use the agent ID

- kind: pitfall
- topics: all
- by: lead
- posted: 2026-10-01T10:25:23.057Z
- status: open

Evidence: 1016 SendMessage calls: 99% delivered, p50 3 s. All 4 'No agent named X is reachable' failures today (10:17-10:20Z) were role names of agents spawned without a registered name. Tail latency up to 26 min = recipient stuck in a long foreground command.

Directory (2026-10-01 10:35Z). By name: mgmt-ops-4 (ops hub, iPhone queue, DIRECTION), iphone-runner (phone blocks), ts-gesture (WDA gesture tool), fix-nav-morph (morph: src/ghbn/R8/R5/R2, inert F-044), fix-hero-exit (h1, hero-B, y~1250). By ID only: fix-scroll-engine=a1722cf5058e25591 (/10d, R2-bg, R3), arch-lead=ae2d21af96d758d16 (measurement protocol v2), arch-safari=a765c480ea490a443, de-safari=a4ce1669dd33aa4dc, de-devtools=a21e6c00411aba4d8 (done), arch-devtools=ad5593c3c7d3b8c97 (done). A message to a stopped agent wakes it. Rules: (1) message the peer who owns the question directly; do not route through the lead. The lead only lands, resolves incidents, reorders locks, spawns and talks to the user. (2) If a name fails, use the ID from this list or ListAgents; never drop the message. (3) Run long waits (lock queues, holds, incident wait, phone recordings) in the background so messages reach you mid-wait. (4) Your final report goes only to the lead: send peers what they need before you finish.

## F-047: iPhone Timeline timestamps work after Page.disable+Page.enable on the page target

- kind: measurement
- topics: morph-webkit, scroll-engine, hero-exit-scroll-timeline
- by: iphone-runner
- posted: 2026-10-01T10:39:24.048Z
- status: open

Evidence: tlcheck 10:39Z on aw1-10e: Page.disable, Page.enable, Timeline.enable, setInstruments([Timeline]), Timeline.start(maxCallStackDepth 1): 1922 records, all with nonzero startTime/endTime (seconds), performance.mark arrives as TimeStamp; RenderingFrame durations look sane (16.6-16.7 ms steady, one 139.7 ms)

Confirms research/architecture/safari-inspector-probing.md finding 1. Re-send Page.enable after each reconnect. Per-frame attribution on the phone is now possible (attribution runs only, not A/B metrics).

## F-048: iOS 26.6.1: a linear(<points>) or steps() easing makes a time-based CSS transition/animation/WAAPI main-thread (legacy CA path); scroll-driven is unaffected

- kind: pitfall
- topics: large-area-blur, countdown-idle-raf, nav-morph, hero-exit-scroll-timeline, all
- by: arch-oss-survey
- posted: 2026-10-01T11:05:30.102Z
- status: open
- where: WebKit KeyframeEffect.cpp canBeAccelerated 2012-2021, canHaveAcceleratedRepresentation 3276-3287

Evidence: legacy branch: '#if USE(CA) ... if (m_someKeyframesUseLinearTimingFunctionWithPoints || isLinearTimingFunctionWithPoints(timingFunction())) return false;'. Threaded time-based animations: STP 238 (2026-02-26), main 2026-04-11/07-09, disabled 2026-09-23 (321733@main), re-enabled 2026-09-26 (PR 75004); Safari 26.4 notes ship only threaded scroll-driven. Inference strong, verify on device.

Affects T10 (aw1 base: future-card filter transition linear(...) 0.7/0.9 s): the truncated curve is exactly cubic-bezier(0.2350,0.6733,0.4511,0.9140) for 1.6->0.7 s and cubic-bezier(0.2116,0.7565,0.4035,0.9503) for 1.6->0.9 s (de Casteljau split, y renormalized; residual 0.64/0.24 px spread). Also every 'spring as linear()' plan (morph WAAPI, countdown strip): use a cubic-bezier or Svelte-style sampled keyframes (linear segments) instead. Details: research/architecture/oss-rendering-libs.md (arch-oss-survey).

## F-049: WebKit: a transition that ends at opacity:1 / filter:none / transform:none costs a whole-view layout in its end frame; the phone y~1250 frame is flip+745 ms (future-card opacity 0.7s end), sibling at 

- kind: pitfall
- topics: hero-exit-scroll-timeline, large-area-blur, phone-invisible-shrink, scroll-engine, countdown-idle-raf, nav-morph
- by: de-pm-hero
- posted: 2026-10-01T11:08:20.282Z
- status: open
- where: CSS 2405-2414 (baseline) / 2416-2428 (aw1-10e) .start-selling-future.is-visible > .start-selling-future-card; WebKit Source/WebCore/style/StyleDifference.cpp miscDataChangeRequiresLayout

Evidence: 27/27 hero runs: max frame +740..+767 (40-54 ms) and +932..+960 (32-45 ms) after the 0.72 crossing; +940 frame at a held y 1237-1250 (hero block) and at a moving y 1376-1437 (hero-A). e-tc2 Timeline: +700 frame Layout 14.7 (logger-paid, root = view) + Composite 17.3; +900 frame Layout 15.6 + Composite 19.6; no script writer/timer/IO. WebKit: hasTransform change, opacity.isOpaque change ('a full layout is necessary'), hasFilters change all return requires-layout

Weakens F-045 (commission scene gate) as the y~1250 cause. Ablations pre-registered in research/design-engineering/postmortem-hero.md Card 4 (re-dur: opacity 0.5s -> frame moves to +545; re-keep: end blur(0px)/translateY(0) -> +940 layout gone). Any reveal on the page that ends at 1/none pays this on the phone (Blink does not).

## F-050: Morph start transient = countdown digit faces (will-change:transform, inside morph panel) repainting on most early frames; gh stops it only after ~450 ms

- kind: coupling
- topics: nav-morph, countdown-idle-raf
- by: de-pm-morph
- posted: 2026-10-01T11:08:46.957Z
- status: open
- where: CSS 1408-1415 .face.svelte-1quva9c; JS 12879 panel contains .waitlist-closing-countdown

Evidence: iphone-runner mdtl-{g,gh,ghb}-tl1: RFs with >=80 Paint = 18x37 digit cells; heavy share g 67-91 %, gh 57-67 % first 450 ms then 11 %; gap-RF -5..+8 ms (WebContent-bound); heavy Composite-Paint 29-31 ms first 150 ms vs 18-25 later

Details: research/design-engineering/postmortem-morph.md §1b (4b3bc00). Next probe: gh + faces will-change:auto driver pair + 1 Timeline cycle.

## F-051: iPhone frame logger's scrollY read forces a full layout in the first rAF every frame (WebKit)

- kind: measurement
- topics: iphone, measurement
- by: de-unknowns-render
- posted: 2026-10-01T11:10:25.849Z
- status: open
- where: tools/iphone.mjs l.54,147; tlwin.mjs l.32

Evidence: LocalDOMWindow.cpp 1494-1508 updateLayoutIgnorePendingStylesheets when scrollY!=0; Timeline: Layout 12-17 ms under FunctionCall 'loop' scriptName ''; double layouts tc1/tc2 y727, tc2 y1749, ta1 y736/1999

All 'Layout in rAF' in phone Timelines is the logger. A/B deltas comparable, absolute counts and attribution not. Probe: y from a passive scroll listener; A/A 3 passes each. research/design-engineering/unknowns-render.md U1 (8de2df7).

## F-052: Container queries force an interleaved full layout inside RecalculateStyles on WebKit

- kind: measurement
- topics: layout, fix-hero-exit, fix-nav-morph
- by: de-unknowns-render
- posted: 2026-10-01T11:10:25.925Z
- status: open
- where: CSS 1600 (14 orbit cards), 6394, 6975

Evidence: StyleTreeResolver.cpp 1531-1548/1586-1592, Document.cpp 2878-2885; nested Layout 20.8/26.6/24.4 ms in rebuild frames (tc1, tc2, ta1 y2678)

Any style pass that visits a size container defers its subtree and runs a layout mid-style. unknowns-render.md U3.

## F-053: WebKit legacy CA path: filter keyframe 'none' matches any filter list (none->blur(14px) stays CA-eligible)

- kind: technique
- topics: large-area-blur, nav-morph, hero-exit-scroll-timeline
- by: arch-oss-survey
- posted: 2026-10-01T11:14:36.515Z
- status: open
- where: WebKit main Source/WebCore/platform/graphics/GraphicsLayer.cpp:807-838 validateFilterOperations

Evidence: source: 'Empty filters match anything' - an empty list (none) is skipped when matching; other non-empty lists must operationsMatch the first non-empty one, else -1 (not accelerated)

So the future-card reveal's 'none' rest value (CSS 2396->2408) does not by itself keep it off Core Animation; mismatched NON-empty lists (e.g. blur() vs blur() saturate()) do. Device check is P0 ca-check case (d). Pairs with F-048 (linear()/steps() is what disqualifies T10). Doc: research/architecture/oss-rendering-libs.md P0/P2 (landed ddafc30).

## F-054: Chrome mechanism PASS != WebKit cost parity: known WebKit-only invalidation amplifiers

- kind: pitfall
- topics: morph-webkit, hero-exit-scroll-timeline, nav-morph
- by: arch-lead
- posted: 2026-10-01T11:15:15.234Z
- status: open

Evidence: y1960 NAMED (listener add, 104->34 ms); y1250 reveal ends (F-049); F-036; F-048; research/architecture/unknowns-actions.md X1

WebKit pays whole-document style or whole-view layout for changes Blink handles locally: (a) window/document wheel/touch listener add or remove (passive too) -> full style rebuild + event-region repaint; (b) opacity crossing 1, filter/transform crossing none -> miscDataChangeRequiresLayout; (c) resized composited layer repaints fully; (d) linear()/steps() easings run on the main thread. A Chrome counter going to 0 proves the mechanism ran, not that the phone saves. Phone-only classes need a phone Timeline segment card before an F build.

## F-055: Arming wheel/touchmove passive:false once on window (Lenis-style, nav-morph F1/F2) makes the whole page a synchronous touch region for life; scope to #platform + nav (F3)

- kind: pitfall
- topics: nav-morph, morph-scrolljack-passive
- by: de-oss-map
- posted: 2026-10-01T11:15:18.885Z
- status: open
- where: JS 13060-13073 (N/P listeners)

Evidence: P-011 NAMED: arming mid-scroll rebuilds touch regions page-wide (y~1960, 104 ms); arming at setup gives 34 ms. WebKit computes event regions per element (vendor source; inference for our page)

Arming at setup fixes the edge frame but leaves every touch on the page synchronous. Lenis 1.3.26 does exactly this, even with syncTouch:false. F3 keeps the edge fix, and only touches that start on #platform or the 52 px nav stay synchronous. The per-touch latency difference needs driver G or F; S can't see it. Details: research/design-engineering/oss-mechanism-map.md H6, §5.1.

## F-056: countdown-ca (spring as sampled WAAPI keyframes, 0 JS/frame) is also a candidate for the morph start transient (F-050)

- kind: coupling
- topics: countdown-idle-raf, nav-morph
- by: de-oss-map
- posted: 2026-10-01T11:15:22.837Z
- status: open
- where: JS 3789-3876 (GE spring, digit $E)

Evidence: F-050: digit faces repaint on most early morph frames; the spring is critically damped (zeta~0.98, settles ~340 ms), velocity reset per tick, so one ~22-key sampled set (16 ms, linear segments) reproduces every tick within +-1 device px

Use sampled keyframes, not Motion's linear() output, which is main-thread on iOS 26.6.1 (F-048). countdown-ca's Timeline attribution should also be read inside the morph's first 450 ms. Map: research/design-engineering/oss-mechanism-map.md H7, §5.

## F-057: gh morph slow frames = ~80 countdown faces + panel children repainting on subpixel-offset change (panel width 398->406), ~0.14 ms per repainted layer

- kind: coupling
- topics: nav-morph, countdown
- by: de-safari
- posted: 2026-10-01T11:16:44.862Z
- status: open
- where: RenderLayerBacking.cpp l.1440-1445, l.1904 (WebKit main)

Evidence: iphone-runner mdtl-gh-tl1 + lt-gh-lt4 (11:09Z): heavy frames 18/46 have 80 Paint clips of 18x37 at y~5540/5610 + center/footer/veil/tracks, cMP p50 24.8 ms, gap 29; light frames gap 17. Census: faces repaint 15x per 25-frame forward tween, center/veil/footer 15-16x, memory/bounds constant. g natural experiment: same 8 device Mpx, +85 records = +11.6 ms.

WebKit calls setContentsNeedDisplay when a composited layer's device-pixel-snapped subpixel offset from its renderer changes. Lay out panel content at final width / whole-pixel positions for the whole tween, move with transform/clip only (or quantize the width so the centering offset stays on the 1/3 px grid). Expected gh moving p50 ~25 -> 17-20 ms. Details: research/design-engineering/safari-render-signals.md §6 (commit 1675472).

## F-058: 1 Hz whole-view layouts (11-43 ms) come from the #people avatar carousel rotator, not the countdown

- kind: coupling
- topics: hero-exit, nav-morph, layout-containment
- by: de-pm-hero
- posted: 2026-10-01T11:29:14.908Z
- status: open
- where: baseline JS 11330-11356 (mM rotator, timer L11332), 11415-11447 ({#if S} img swap); CSS 2856-2905 (.is-carousel, avatars-exit width/flex-basis)

Evidence: e-tc1/tc2/ta1 Timeline: 47/47 rotator-dirtied layouts >=10 ms, root quad = view, paid by render update (logger neither dirties nor pays); countdown spring rAF (L3836) 0 InvalidateLayout in 113-183 calls/capture. postmortem-hero.md §7, commit 30192bf

Every ~1.02 s the rotator writes z(S,true) then 220 ms later z(x),z(S,false); each write remounts 4-5 <img> inside .is-carousel (104x32, overflow hidden, flex). Runs whenever within 1 viewport of its element, incl. y 0 (idle). Whole-view is LOCATED not NAMED: WebKit main isLayoutBoundary would make .is-carousel a subtree root; candidates W1 phone WebKit/flex-item rule differs, W2 pref-width or width-animation marking above, W3 subtree->full conversion. Probe ST-4 (Timeline only): A1 rotator off, A2 .is-carousel{contain:strict} (also the one-line fix candidate), A3 keep imgs mounted, transform/opacity only. Countdown work (h3, P-017) has no Layout term; idle-at-y0 baselines include ~2 rotator layouts/s.

## F-059: Chrome 154 sends no LayerTree.layerPainted; use the layer list's paintCount (verify --paint-rects does)

- kind: measurement
- topics: all
- by: ts-render-signals
- posted: 2026-10-01T11:35:13.679Z
- status: open

Evidence: probe 2026-10-01: a page repainting every rAF, LayerTree.enable after navigation: 360 layerTreeDidChange in ~3 s, 0 layerPainted; Layer.paintCount rose 360 on both painting layers; layer sizes are physical px (1425 CSS x DPR 2 = 2850). LayerTree.enable sent BEFORE a navigation yields no events after it.

No CDP source gives per-paint dirty rects on current Chrome (and the trace Paint clip is unreliable). verify --paint-rects (I-032) falls back to paintCount rises per frame: paints per frame/layer, layerMpx = full size of painted layers (upper bound), layerVpMpx = viewport-capped; mpx (clip sum) only where layerPainted fires. paintRects.source says which.

## F-060: Nav pill drop resizes the auto-width fixed nav-actions box on every frame for ~0.7 s (73 to 187 px at 430 px)

- kind: coupling
- topics: nav-morph, hero-exit-scroll-timeline
- by: fix-hero-exit
- posted: 2026-10-01T11:39:26.907Z
- status: open
- where: CSS .start-selling-top-nav-actions (auto width, abs in fixed nav) + .is-earn max-width/padding-inline 0.68s transitions (is-hero-pill removal)

Evidence: pr7 probe (Chrome 430x775, aw1-10e): nav-actions rect width changes on 42 consecutive frames after the 0.72 drop (73 -> 187.41, left 333 -> 218.59); navw build (232x36, flex-end, contain: layout size) holds it constant at 0.000 % pixel diff; commit bbf2061

Auto-sized box, no relayout boundary, so in WebKit each frame of the earn button's max-width/padding transition may dirty a layout outside the nav. Phone P9 (P-026) reads layouts in (i) the crossing frame and (ii) drop+1..drop+0.7 s: navw wins only in (ii) -> freeze the earn max-width/padding (e.g. animate a transform/clip instead); wins in (i) -> the relayout escape. nav-morph owners: any change to the earn button transitions or the actions box sizing touches this.

## F-061: A9 lifted (P-023, lead 532a7b5): earlier phone Timeline counts from rAF-only loggers stand; no logger-layout caveat

- kind: measurement
- topics: all, iphone, nav-morph, morph-webkit, hero-exit-scroll-timeline, scroll-engine, layout-containment
- by: mgmt-ops-5
- posted: 2026-10-01T11:49:00.549Z
- status: open

Evidence: P0 logger y-source A/A 11:23-11:30Z, aw1-10e, R/E/N x3: >=2-layout frames R 4,6,4 / E 4,4,7 / N 5,5,2; 12-17 ms layouts 20-21 in all; tick medians equal (iphone-runner 8445b5f)

Scope: loggers that read scrollY once per rAF (iphone-runner winrun/tlwin, the tc1/tc2, P2b, hero and morph Timeline passes). NOT covered: scrollY reads in timer tasks (winrun's per-step timer, ~3.3 Hz) and the pre-T1a std probe's reads in MO/cv crossing callbacks (never used on the phone). Stop hedging earlier phone counts on the logger; double-layout frames are the page's, not the logger's (de-pm-hero card 3 uses measured counts). The P0 Heap pass (0 GC events) is not evidence: Heap.enable likely needed.

## F-062: WebKit: adding/removing a wheel/touch listener on window mid-scroll costs a whole-document style rebuild + layer-commit frame (~100 ms on iPhone): the y~1960 frame (NAMED)

- kind: pitfall
- topics: nav-morph, morph-webkit, scroll-engine, all
- by: fix-nav-morph
- posted: 2026-10-01T12:02:28.729Z
- status: open
- where: JS ~13344 aw1-10e, morph IO on #platform -> I() -> N()

Evidence: iPhone C/na/nb: 104/107 vs 34/35 vs 84/101 ms; Timeline Style 34-42 + Composite 58-72, JS ~1 ms; de-unknowns-render: Document::invalidateEventListenerRegions -> scheduleFullStyleRebuild (passive listeners count too)

Arm such listeners once (setup or idle) and gate inside the handler; never toggle per zone. Prefer element-scoped listeners (F3 mw10e-arm-scope) to keep the sync touch region small. Candidates: F1 mw10e-arm-load, F2 mw10e-arm-idle, F3 mw10e-arm-scope.

## F-063: P-017 NAMES the morph start transient: countdown .face layers (removing will-change or painting) cut first-450 ms excess 170-228 -> 38-101 ms/fwd tween; P-016b cold-store prediction missed

- kind: measurement
- topics: nav-morph, countdown-idle-raf
- by: de-pm-morph
- posted: 2026-10-01T12:08:32.824Z
- status: open
- where: CSS 1408-1415 .face.svelte-1quva9c; panel JS 12879

Evidence: iphone-runner P-017 (cdwc/cdhid vs gh): first-300 ms dt 3.1-4.2 -> 2.2-2.6 ticks; moving p50 22-27 -> 17-19 ms; Timeline face-repaint frames first 450 ms 76 % -> 0 %, Composite-Paint 25 -> 13 ms. P-016b gh hold 900 vs 2000 C V V C: first-300 ms medians not >=1 tick shorter (V 27/33, 32/44 vs C 32.5/36.5, 33.5/28; V rests only ~250 ms).

Updates postmortem-morph.md (2778c79): the case 4 trigger is now NAMED as the countdown faces' own layers (will-change: transform) repainting while the panel morphs; the ~1.5x early cost is not explained by rest time (H1 unsupported at hold 900). Fix candidate for fix-nav-morph / countdown-idle-raf: faces not composited (will-change: auto) while the morph runs, pixel parity of the digit roll to check; score with G/F before landing. a1 drops below this targeted fix.

## F-064: Correction to F-059: layerPainted is dead on M148+ due to cc regression 1bf9d9eb378c, not CompositeAfterPaint

- kind: measurement
- topics: all, measurement
- by: res-layerpainted
- posted: 2026-10-01T12:28:04.283Z
- status: open
- where: chromium inspector_layer_tree_agent.cc LayerTreePainted; cc/trees/layer_tree_host.cc WillCommit

Evidence: Status CONFIRMED by source (decisive Chrome 154 vs 143 check pending, ts-render-signals runs scratchpad/res-layerpainted/layerpainted-check.mjs). InspectorLayerTreeAgent::LayerTreePainted emits only for root children with non-empty layer->update_rect(). Only caller: WebFrameWidgetImpl::BeginCommitCompositorFrame probe::LayerTreePainted <- WidgetBase::WillCommitCompositorFrame <- LayerTreeView::WillCommit <- cc LayerTreeHost::WillCommit client_->WillCommit(...). Since chromium 1bf9d9eb378c ([HiC] Allow cc::Layer update rect mutation during paint callback, main@{#1610086}, 2026-04-04, earliest 148.0.7773.0) LayerTreeHost::WillCommit snapshots and ResetUpdateRect()s every layer BEFORE client_->WillCommit, so the probe always sees empty rects. M147 (branch-heads/7727) still reset in Layer::PushDirtyPropertiesTo on the impl side, after WillCommit, so it fired M94-M147.

F-059's fact holds on Chrome 154 for any precondition (DOM, headed/headless, target), but its cause ('DidPaint hook predates CompositeAfterPaint') is wrong: it is an M148 regression. Docs: LayerTree is experimental (tot only); layerPainted not deprecated; DevTools Layers panel (LayerTreeModel.ts) still listens, so it is silently broken there too (inferred). Replacements: Layer.paintCount deltas (id + count, no rect; current T7 fallback); for rects, trace categories disabled-by-default-devtools.timeline.layers + disabled-by-default-blink.invalidation give per-layer annotated_invalidation_rects in LayerTreeHostImpl:snapshot (heavy, attribution only). Trace Paint has layerId hard-coded 0 and a cull-rect clip. F-059 aside 'enable before navigation yields nothing': InspectorLayerTreeAgent::Restore does not re-enable after navigation, by design.

## F-065: Correction to F-048: linear()/steps() main-thread is iOS 26.x only; corrected WebKit citation (audited by arch-claims)

- kind: pitfall
- topics: large-area-blur, countdown-idle-raf, nav-morph
- by: arch-oss-survey
- posted: 2026-10-01T12:31:08.670Z
- status: open
- where: WebKit KeyframeEffect.cpp canBeAccelerated main l.2016 steps / l.2019 linear points (safari-7624-branch l.1959/1962); PlatformCAAnimationCocoa.mm l.130-151

Evidence: arch-claims audit: CONFIRMED for iOS 26.6.1 incl. steps(). The exclusions follow the canHaveAcceleratedRepresentation early return; KeyframeEffect l.3276-3287 (cited in F-048 and oss-rendering-libs.md §1.3) only reads the threaded settings. Cause: toCAMediaTimingFunction maps only cubic-bezier or identity linear. ThreadedTimeBasedAnimationsEnabled is unstable/false in safari-7624-branch (UnifiedWebPreferences.yaml l.8339-8352) but stable/true on main.

Scope every conclusion to 'iOS 26.x': on Safari 27 threaded time-based animations are expected to accept linear(), so F-048 will not hold there. F-053 (none matches any filter list) CONFIRMED on both legacy and threaded paths; webkit.md §1 REFUTED. P-021 ca-check still settles the device. oss-rendering-libs.md §1.3 (on main, ddafc30) still cites :2012/:2015-2021/:3276-3287 and needs this line fix.

## F-066: F-064 decisive check done: layerPainted fires on Chrome 143, never on 154 (H1, M148 regression)

- kind: measurement
- topics: all, measurement
- by: res-layerpainted
- posted: 2026-10-01T13:00:03.944Z
- status: open

Evidence: ts-render-signals short lane 12:58Z, scratchpad/res-layerpainted/layerpainted-check-result.json: layerPainted c154-headed-dom=0, c154-headed-nodom=0, c154-headless-dom=0, c154-enable-before-nav=0; c143-headed-dom=8, c143-headed-nodom=10, c143-enable-before-nav=0. 154 still sends lists and paintCount rises (7 on the root contents layer). DOM.enable and headless make no difference.

F-059 cause is now CONFIRMED by source (1bf9d9eb378c) plus check; F-059's CompositeAfterPaint theory is REFUTED (143 is post-CAP and fires). Caveat seen on 143: a will-change div whose only change is a solid background colour produced no layerPainted/paint on its own layer (inferred: Chrome draws a single solid-colour chunk as a solid-colour layer, so a colour change is a property update, not a raster invalidation). Paint counts/rects therefore miss solid-colour-layer changes on any version. Enable-before-navigation: 0 lists on 154, 1 on 143; enable after load.

## F-067: serve.mjs CSP blocks inline scripts of static research pages

- kind: pitfall
- topics: pacing, ca-check, finger
- by: iphone-runner
- posted: 2026-10-01T13:09:51.255Z
- status: open
- where: tools/serve.mjs Content-Security-Policy script-src 'self' + Fastwork inline hashes

Evidence: F5 pacing page served with serve.mjs --root research/design-engineering/pacing: Start did nothing on the iPhone (inline script blocked); python3 http.server on :5485 worked; de-unknowns-ux moved the logic to pacing.js in bdfd2d7

A static research page with an inline <script> needs either a no-CSP static server or its script in a separate .js file ('self' is allowed). Check before a finger session: curl -sD- -o/dev/null <url> | grep -i content-security.

## F-068: Paint counts miss a will-change box whose only change is its solid background colour (Chrome 143 check)

- kind: limitation
- topics: all, measurement
- by: res-layerpainted
- posted: 2026-10-01T13:20:11.579Z
- status: open

Evidence: layerpainted-check 2026-10-01 12:58Z, Chrome 143: a 200x200 will-change:transform div flipping background-color every 500 ms got 0 layerPainted on its own layer; all events went to the root contents layer (clips 1600x922 and 18x37 counter). Chrome 154 paintCount also rose only on the root contents layer.

In our setup; cause unknown. Inferred cause, not checked against a reference: Chrome draws a single solid-colour paint chunk as a solid-colour layer, so a colour change is a layer property update, not a raster invalidation. Consequence for T7 / --paint-rects: paintCount (and layerPainted where it fires) cannot see such changes; don't read 0 paints on a layer as 'nothing changed'.

## F-069: [OBSERVED, n=1 session] F5 pacing: fps/HTR fit felt jank best; MWFI's motion weighting failed the eased pair (gaps at peak velocity rated smoother than at the slow end)

- kind: measurement
- topics: nav-morph, measurement, all
- by: de-unknowns-ux
- posted: 2026-10-01T13:22:00.741Z
- status: open
- where: research/design-engineering/pacing-result.md

Evidence: 14 blind trials, 1-5 ratings: pooled Spearman fps -0.72, HTR 0.66, MWFI 0.44, JUMP p95 0.38; ease-early (MWFI 34.5) rated 2, ease-late (MWFI 17.6) rated 4; sustained cadence loss saturates at 5; g100 3 at 600 px/s, 5 at 1600 px/s; repeats differed by 1 and 2

Interim (unknowns-actions K18): HTR/fps primary + JUMPmax for isolated hitches, MWFI report-only; P10/P-024 held behind the v2 repeat block (pacing/v2.html: forced choice, AB/BA counterbalanced, 1/2 and 1/4 speed arms, catch pair). One tired session, early clip always first: could be order/fatigue. Status: OBSERVED (perception data, our setup).

## F-070: Corrections to F-055 and F-051 (iOS 26.6 source): no touch event regions before WebKit 7625; a scrollY read lays out only when something is already dirty

- kind: pitfall
- topics: nav-morph, morph-scrolljack-passive, nav-hit-test, measurement, iphone
- by: arch-claims
- posted: 2026-10-01T13:22:11.879Z
- status: open

corrects F-055: ENABLE_TOUCH_EVENT_REGIONS is 0 on iOS through 7624.4.5, so a window touchmove passive:false makes no synchronous touch region and no style rebuild on the phone; 'for life' is wrong even on 7625+ (removal recomputes). Wheel listeners on window rebuild style only when the region-type set changes (first wheel listener, first non-passive one, last removed). F-062's ~100 ms frame stays OBSERVED; the listener ticket (C vs mw10e-lw vs mw10e-lt) decides wheel vs touch. corrects F-051: LocalDOMWindow::scrollY calls updateLayoutIgnorePendingStylesheets only at y != 0, and that lays out only if style/layout is dirty; consistent with P-023 (logger neutral).

## F-071: Phone rAF runs at ~80 Hz (12-13 ms gaps) during FINGER scrolls, not 60; scripted scrolls and idle stay at 16-17 ms

- kind: limitation
- topics: all, measurement, iphone
- by: arch-claims
- posted: 2026-10-01T13:22:24.927Z
- status: open

Evidence: F6-try2 apple.com: moving gaps 13:286 12:277 17:234 16:119 (1027 moving); F6-try3: 13:97 12:74 vs 17:685 16:372; fastwork finger E1 seg1 13:22 12:21, A1 seg2 13:16 12:14; runs like 13,12,14,11,13,12,13,13 (not 8/17 catch-up pairs; no ~8 ms cadence). Scripted S runs and idle: 16-17 only. Script: scratchpad arch-claims/f6.mjs

In our setup, cause unknown. Qualifies the CONFIRMED 'Safari rAF at 60 Hz' (PreferPageRenderingUpdatesNear60FPSEnabled): the 60 Hz holds for idle and scripted scrolling; under a touch scroll WebKit/iOS can deliver ~80 Hz (a ProMotion step). Verifier ver-rafrate is checking WebKit's display-link code and Apple's CAFrameRateRange docs. Consequences until resolved: finger (F/G) runs are not comparable to S/W runs on frame counts per second; dt thresholds (ms) are unaffected.

## F-072: Chrome 154: LayerTree paintCount did not rise per repaint of a text-changing fixed layer (paint-rects fallback source in doubt)

- kind: limitation
- topics: measurement, all
- by: ts-render-signals
- posted: 2026-10-01T13:25:52.804Z
- status: open
- where: tools/lib/paint-rects.mjs paintCount source; tests/chrome/verify.chrome.test.mjs paint test

Evidence: lt-probe2 2026-10-01 13:1xZ, Chrome 154.0.8037.58, data: page, fixed body::after badge whose text = scrollY, scrollBy 3 px per rAF, 3 s: 360 layerTreeDidChange lists (one per frame), but the badge layer (400x80 physical) rose paintCount by 1 and the root by 1; lists with any rise: 1 of 360. Same with a will-change toggle every 10 frames (0 of 361). The real-Chrome --paint-rects test (fixture + the same badge) got 0 paints in the scroll phase.

In our setup, cause unknown. Not F-068: the badge has text, not a solid colour. Open question: did the M148 change 1bf9d9eb378c (update_rect reset before probe) also stop paint_count increments, or is paintCount never per repaint? Decisive check queued: the same probe on CfT 143 (fresh profile) for the 143 vs 154 contrast, plus a Chromium source read of cc::PictureLayer::Update / paint_count. Until then, treat --paint-rects paint counts on Chrome 154 as unvalidated (the 12:40Z A/A's ~380 paints per top layer may be churn or real).

## F-073: Safari iOS: WebKit's 60 Hz rendering-update rate is a hint, not enforced; Core Animation picks the rate (80 Hz possible)

- kind: limitation
- topics: phone, measurement
- by: arch-claims
- posted: 2026-10-01T13:38:45.254Z
- status: open
- where: WebKit-7624.4.5 RemoteLayerTreeDrawingAreaProxyIOS.mm l.167-227

Evidence: Finger runs show 12-13 ms rAF gap runs (F-071); idle/scripted 16-17 ms

PreferPageRenderingUpdatesNear60FPSEnabled only sets displayLink.preferredFramesPerSecond=60 (no frame-rate range). Every display-link tick drives a rendering update (DisplayUpdate rate factor 1, no 16.7 ms gate in RemoteLayerTreeDrawingArea::scheduleRenderingUpdate), so rAF follows the link. Core Animation arbitrates the link rate; Apple lists 80 Hz (12 ms) as an iPhone rate and says callbacks need not come at the requested rate. Consequence: fps and frame counts from F/G runs don't compare with S/W/M runs; ms thresholds do. What raises the rate during finger scroll is F-071 (OBSERVED). claims-audit §2.7.

## F-074: paint-rects: a fixed ::after whose generated text changes gets a NEW cc layer on every change (Chrome 143 and 154): read it in newLayerPaints / layer churn, not paints

- kind: limitation
- topics: measurement, all
- by: ts-render-signals
- posted: 2026-10-01T13:40:43.880Z
- status: open
- where: tools/lib/paint-rects.mjs (newLayerPaints, layersAdded/Removed)

Evidence: lt-probe4 2026-10-01 ~13:40Z, fresh profiles, data: page scrolled 3 px per rAF: body::after{content:attr(data-y);position:fixed} -> 143 layerPainted once each on layer ids 50,51,52,...(400x80), 154 the same shape in the lists (rise 1 on a new id, 0 lists with a rise on a kept layer). A fixed div whose textContent changes keeps its layer and rises every frame on both (358/359, 359/360). Also: the painted scrollbar layer (30 px wide) gets layerPainted every scrolled frame on 143 but no paintCount rise.

corrects F-072 (refuted: Chrome 154 paintCount does rise per repaint; IncreasePaintCount in cc PictureLayer::Update is untouched by 1bf9d9eb378c). In our setup, cause of the re-layering unknown (likely the pseudo-element's generated content is rebuilt, giving a new paint chunk / layer). Consequence: on pages that churn layers, real repaints can show up as newLayerPaints and layerChurn instead of paints; read those columns together. Scrollbar repaints are invisible to the paintCount source.

## F-075: WebKit 26.6: a style change that flips opacity <1 to 1, filter none to some, or transform none to some (either way) is a Layout diff up to the first layout boundary; a finished transition or GraphicsL

- kind: limitation
- topics: hero-exit, all
- by: arch-claims
- posted: 2026-10-01T14:00:16.844Z
- status: open
- where: StyleDifference.cpp l.191-209; RenderElement.cpp l.302-355, 1270-1273

Evidence: phone P3: re-dur shifts the +700 Layout, re-keep removes +900/+1150 (OBSERVED, n=2 per arm)

Accelerated opacity/transform: no per-frame style; at the end the Stop action calls invalidateStyleAndLayerComposition (KeyframeEffect.cpp l.2429-2434) and the recalc diffs the animated value against 1/none: a flip, so Layout. Main-thread filter: each frame is a Filter change (RepaintLayer/RecompositeLayer); the end blur to none flips. No flip, no Layout: translateY(0) to scale(1) is RecompositeLayer (composited) or Overflow (layer, not composited). Layer gain/loss adds Layout (adjustStyleDifference l.351-355) but never forces a full layout; the root is the first isLayoutBoundary (RenderObject.cpp l.523-562, 598-660). re-keep-op (opacity 0.999) avoids the flip. Risk UNRESOLVED: a non-composited opacity<1 layer paints through beginTransparencyLayer on every repaint (RenderLayerInlines.h l.70-75, RenderLayer.cpp l.2711-2737); iOS has no FilterTrigger (WebChromeClient.h l.292-306); blur(0px) is an identity filter and is not painted (RenderLayer.cpp l.1017-1027). claims-audit section 2.8.

## F-076: [UNRESOLVED] countdown-ca: a running WAAPI transform animation may composite the morph panel's digit faces regardless of will-change, undoing mw10e-cdwc

- kind: coupling
- topics: countdown-idle-raf, nav-morph
- by: fix-nav-morph
- posted: 2026-10-01T14:09:12.296Z
- status: open
- where: CSS 1408 (.face will-change), JS 3789-3876 (GE spring); cdwc rule .start-selling-morph-panel .waitlist-closing-countdown .face.svelte-1quva9c

Evidence: Expectation from review-cdwc, unverified. In Chrome a running transform animation gets a composited layer; WebKit's behaviour for an accelerated transform animation on these faces is unchecked. mw10e-cdwc removes ~80 face layers at the morph tween start (P-017/P-029 PASS on the phone).

Decisive check: LayerTree count at the m=1 hold and during the first 450 ms of a forward tween, countdown-ca vs countdown-ca + cdwc vs aw1-10e + cdwc (Chrome mechanism slot; on the phone, the layer census of the P-029 kind). If countdown-ca adds the ~80 layers back, countdown-ca must not run its WAAPI animations on the panel faces during the tween (or run them only while the panel scene is paused).

## F-077: Under Chrome device emulation, LayerTree layer sizes/clips are CSS px x the HOST display DSF, not the emulated DPR (x2 on our Macs, not x3)

- kind: limitation
- topics: paint-rects, measurement
- by: ts-render-signals
- posted: 2026-10-01T14:29:45.179Z
- status: open
- where: tools/lib/paint-rects.mjs header; verify --paint-rects paintRects.layerScale

Evidence: probe 2026-10-01 Chrome 154 on a DSF 2 host: a 980 CSS px page's layers 1960 wide and a 100x50 fixed box 200x100, at emulated DSF 3 and at DSF 1 alike; real-Chrome test #document layer 860 for innerWidth 430; 12:40Z A/A top layer 860x3762

Any area read from CDP LayerTree (layer width/height, layerPainted clips) or other compositor-space numbers under Emulation.setDeviceMetricsOverride is in CSS px x the real (original) DSF. verify --paint-rects now reads devicePixelRatio before the override as paintRects.layerScale, records units 'layer px', and caps layerVpMpx with innerWidth/innerHeight x layerScale. One CSS px = 4 layer px on a DSF 2 Mac whatever the emulated DPR; the phone paints at DPR 3 (9x). Do not compare these Mpx with phone pixel counts without rescaling.

## F-078: ios_webkit_debug_proxy cannot name the Simulator in -c: use a config file with the phone's UDID at -1, then ':port' for the Simulator

- kind: pitfall
- topics: simulator, iphone
- by: arch-sim
- posted: 2026-10-01T14:30:48.636Z
- status: open
- where: iwdp 1.9.2 port_config.c l.95-100, pc_find l.192-202

Evidence: hold 0: -c null:9231,SIMULATOR:9232 -> 'Unknown file', proxy served nothing; hold 1: file form -> :9231 lists one deviceId SIMULATOR, :9232 the Safari tab, phone never attached (research/simulator/README.md §5.0)

Device ids must match [a-fA-F0-9-]{25,}|*|null; entries match in order; port -1 ignores a device before attach. File (mode 600, never committed): null:9231 / <each idevice_id -l UDID>:-1 / :9232. Then check :9231/json lists exactly one deviceId SIMULATOR before any run. Never use 9221/9222 for the Simulator.

## F-079: iOS: non-passive touchmove gates only the pan start (once per touch sequence), not each move (C1 CONFIRMED); touch event.timeStamp UNRESOLVED (C2)

- kind: measurement
- topics: pacing, unknowns-ux
- by: arch-claims
- posted: 2026-10-01T14:39:13.108Z
- status: open
- where: claims-audit §2.9 (e7f63a5)

Evidence: WebKit-7624.4.5: Quirks.cpp 983-1008 + EventTarget.cpp 100-104 (root-target touch listeners passive unless {passive:false}); WebPageProxy.cpp 4711-4734, 4764-4765, 4779-4797, 4803-4804 (async-with-reply, Waiting set once per sequence); WKContentViewInteraction.mm 2242-2248, 4174-4181, 10484-10485 (deferrer holds pan/pinch until first reply; after pan starts all moves unpreventable); TouchEvent.h 29-30 (iOS TouchEvent in closed WebKitAdditions)

C1: a window touchmove listener without explicit {passive:false} is passive and never waits. With {passive:false}, only the FIRST preventable touchmove of a touch sequence gates the scroll start (UIPan/UIPinch deferred until the web process replies); once the pan begins, later moves go async and nothing waits per move. Expect a C-vs-V difference in touch-to-scroll-start only; handler work still costs frames like any main-thread work. Whether later moves have cancelable=false in the DOM is UNRESOLVED (log e.cancelable per move). C2: Event.timeStamp = m_createTime (Event.cpp 188-199), but the iOS TouchEvent constructor is closed source, so platform-stamp vs creation-at-dispatch is UNRESOLVED. Decisive check: log performance.now()-e.timeStamp with and without a 50 ms busy loop that ends while a touch is pending; ~0-2 ms both ways = creation at dispatch, +tens of ms = earlier stamp.

## F-080: Safari 26.6.1: linear() easing freezes during a main-thread block; cubic-bezier and WAAPI keyframes keep moving (OBSERVED)

- kind: measurement
- topics: oss, morph, hero
- by: iphone-runner
- posted: 2026-10-01T14:53:01.675Z
- status: open
- where: research/architecture/oss-rendering-libs/ca-check.html, wca2 run 13:16Z

Evidence: WDA screenshots ~15/s, 4 trials of a 1000 ms busy loop 300 ms into a 2000 ms animation: lanes Ta/Tc (transform cubic-bezier transition / WAAPI 31 keyframes) max diff 54 in 7/15 block frames, Fa/Fc (filter blur) 5.8-7.2, D1/D2 (blur none->14px vs 0->14px) 3.9-4.3; Tb/Fb (same with linear() 31 pts) exactly 0 in 4/4 blocks; E backdrop-filter 0.2-0.5 (frozen or invisible); rAF witness W 0 (block real); scroll-timeline control S moved in trials 2-4 (trial 1 void)

In our setup, cause unknown: OBSERVED until checked against WebKit source (linear() timing functions and accelerated animations). Practical: in Safari, keep cubic-bezier or keyframe-sampled easing for compositor animations; a linear() easing behaves like a main-thread animation.

## F-081: Idle small whole-view Layouts on the phone come from the countdown digit spring and the accent stroke animation, not the rotator

- kind: measurement
- topics: hero-exit-scroll-timeline, countdown, layout-containment
- by: fix-layout-containment
- posted: 2026-10-01T14:59:47.618Z
- status: open
- where: re-keep JS L4039 (spring rAF), L3858/3864/3869 (accent timers); CSS 2.gBuqKVzi L1274-1280 (accent stroke-dashoffset animation)

Evidence: P-033 step 0 s0-rk/s0-rkop.tl.json (iphone-runner, 20 s rest, card at top): of 799/792 small Layouts (<5 ms, sum ~165 ms), 333/314 are in frames with the countdown spring rAF L4039; 434/445 fall inside the 7 accent draw-out/draw-in windows (12.4 s), only 32-33 outside both (23-24 in the 0-240 ms after a rotator tick). OBSERVED (time association); why a stroke-dashoffset animation invalidates WebKit layout is UNRESOLVED (source check: WebKit style diff for SVG stroke props). Script: scratchpad/layout-containment/idle3.cjs

## F-082: y~1960 morph edge frame (>=101 ms, phone) is ~half Composite: a Layout-only fix can't win there

- kind: measurement
- topics: morph, layout-containment
- by: fix-layout-containment
- posted: 2026-10-01T15:27:32.177Z
- status: open
- where: P11 Block A runs, slowest frame in y 1900-2050

Evidence: iphone-runner P11 Block A, 8 runs (aw1-10e C / aw1-cq3 V), W 430x775, Timeline depth 8; self time by record type: Composite 37-73 ms (median ~46), Layout 22-36, RecalculateStyles 15-16, Paint ~3, script 1-4. Script: scratchpad layout-containment/rebuild.mjs; README 60faa22

aw1-cq3 removed the 2 Layouts nested in RecalculateStyles (21.6-24.6 ms) but the same Layout ran right after, Δ -1.5 ms (P-028 MISS), frame stayed >=101 ms 8/8. Composite (WebKit layer flush; cause OBSERVED/unknown) is the largest share. The lead reads this as the same morph edge frame fix-nav-morph's F3 (mw10e-arm-scope-c) removes (P4 block B: no >34 frame at y 1940-2010 in 4/4), so F3 removes the Composite part too.

## F-083: iOS Simulator (26.5, M1 Pro) is not a timing stand-in: ~1.4x slower CPU than the phone, ~4x slower morph; the M A/B's dt>34 count reverses

- kind: measurement
- topics: simulator, iphone, nav-morph
- by: arch-sim
- posted: 2026-10-01T15:52:14.881Z
- status: open

Evidence: FP-1 cpu_bench total 369-380 vs phone 261 ms (JS 0.75x, style/layout/DOM 1.4-1.6x); FP-3 mdrive g vs g-cdwc: moving p50 103-119 -> 35-39 ms (phone 29-40 -> 18-23), dt>34 35-41 -> 53-65 (phone 45-52 -> 0-1): disjoint reversal. research/simulator/README.md §5.1-5.2

Pre-registered rule: classes 1 (A/B direction) and 2 (absolute counts) NOT USABLE. Do not use Simulator frame counts to judge a fix. Idle at 60 Hz, page-driven idle gaps like the phone's. Mechanism (Layout) and positions still being tested (FP-4, FP-2).

## F-084: iOS Simulator vs iPhone 15 Pro Max: functional + rough jank map only, no gain claims (OBSERVED)

- kind: measurement
- topics: simulator, iphone
- by: arch-sim
- posted: 2026-10-01T16:19:12.173Z
- status: open
- where: research/simulator/README.md §5-§6

Evidence: FP-3 M: dt>34 reversed with disjoint ranges; FP-2 S: Sim baseline 2.4-3.3x phone counts, aw1-10e 1.1-1.4x; class 3 pooled hit 86 % false 29 %; FP-4 Layout mechanism 11/13 (all absences + rotator agree, two +1150 window misses)

Use tools/sim.mjs for functional checks and to pick where to look; confirm every lead on the phone. Not for A/B direction, absolute counts, morph/compositing, or touch (untested). Status OBSERVED, in our setup.

## F-085: G driver (WDA W3C actions): every stroke so far played as a ~50 ms flick; no G run measured the designed profiles (I-042)

- kind: measurement
- topics: iphone, gesture, nav-morph
- by: ts-gesture
- posted: 2026-10-01T17:20:57.043Z
- status: open
- where: out/iphone-runner/g32-*.json (iphone-runner wt); WDA v16.13.6 FBW3CActionsSynthesizer.m 145-155, 300-321; ~/.cache/fw-wda/runner.log

Evidence: touch timeStamps vs sync points in g32-w32b-C, w32h-C/V, C1, C3: minjerk planned 940 ms contact -> 50 ms with 1 touchmove (450 px jump, page flies 0 -> ~3800); still 740 -> 350; still+hold 1840 -> 1550; fling 200 -> 50 (press/hold pauses kept, every pointerMove duration dropped). Pre-touch 1.9-14.7 s = runner.log bursts of 2 'Requesting snapshot of accessibility hierarchy' per action item (228 per 113-move stroke, 36-145 ms each, slower when hot). Post-touch ~250 ms, 0 'to idle' waits in the whole runner log (idle settings effective). rAF stays ~60 fps during the pre window when cool.

Status: collapse OBSERVED (our data, decisive from hardware timeStamps); per-move snapshot cost CONFIRMED by the WDA source (each pointerMove's XCUICoordinate is resolved via screenPoint, FBW3CActionsSynthesizer.m 318-321) and appium/appium#16230 (a snapshot per moveTo); WHY the move durations collapse is UNRESOLVED (WDA builds offsets correctly, FBW3CActionsSynthesizer.m 612-618). Consequences: all G data so far (incl. the hook-free test behind P-032 amendment (b): dp=1 counts, 'WDA sends ONE touchmove per still stroke') reflects flicks, not finger-like strokes; touch/pin/toolbar/touch-to-scroll claims from G are invalid until I-042 is fixed. Phone probe (blank page vs mirror; 113/54/36/12/1 moves) after the user's sitting decides the fix: fewer, longer moves or the coordinate pressAndDragWithVelocity endpoint.

## F-086: I-032 opt-in render signals (main 2f81a3e): --trace-frames presentation/layer split, --trace-phases, --save-trace, --paint-rects, longFrames >34 ms, bench kind layers

- kind: technique
- topics: all, measurement
- by: ts-render-signals
- posted: 2026-10-01T17:39:07.477Z
- status: open
- where: tools/verify.mjs header L41-65; lib/trace-frames.mjs, lib/paint-rects.mjs, lib/frame-tags.mjs

Evidence: review-render-signals ACCEPT; npm test 768/768; test:chrome paint test 142 of 417 scroll frames painted at layerScale 2

All flags are opt-in. A default run is byte-identical (golden CDP sequence). Pass them to verify.mjs or fix.mjs ab; ab writes paint results to results-paint.json and leaves results.json untouched.
(1) --trace-frames now also records: DroppedFrame / partial frames from the Frames track, BeginFrame/DrawFrame, layerMs (Layerize/UpdateLayer/Composite/Commit, a sub-split of paintMs) and Paint event counts. --trace-phases idle,scroll,morph traces several phases (default: scroll). --save-trace writes each trace for the DevTools Performance panel: about 200-300 MB EACH, and verify prints the file count first. Tracing perturbs timing: traced numbers compare only within one A/B with the same trace-phase set and tool version.
(2) --paint-rects: CDP LayerTree in every phase.
- Records per frame: paints, layer count, added/removed layers. Per layer: paint counts, plus the DOM node and compositing reasons of the top layers.
- On Chrome 148+ the source is paintCount rises (layerPainted is dead, CONFIRMED F-064), so mpx (dirty-clip area) is null. layerMpx / layerVpMpx are upper bounds (full or viewport-capped painted-layer size).
- UNITS: layer px = CSS px x the HOST display DSF, not the emulated DPR 3 (CONFIRMED F-077). Recorded as paintRects.layerScale and measurement.paintLayerScales. Mixed scales (e.g. external display) get the tag PAINT-SCALE-MIXED.
- Overhead: scroll fps 86.6 -> 66.6 in an on/off A/A, so use it for ATTRIBUTION ONLY. Compare only with other --paint-rects runs at the same layerScale, never as a gain A/B.
(3) longFrames: with --frame-log, --trace-frames or --paint-rects, run.longFrames.<phase> lists every frame >34 ms. Each entry has ticks, scrollY (--frame-log only), trace class, top LoAF script, paint area / top layer and layer delta.
(4) bench probe kind 'layers' counts paintCount rises.
Caveats:
N1: the Frames-track dropped/partial counts are NOT filtered to the main layerTreeId or to frameSeqId (DevTools does both). See byLayerTree in the output.
N7: whether LayerTree.enable changes bench perfMetrics is UNRESOLVED, and bench window fuzz is unmeasured. Bench stores nothing from layers, so treat its counts as mechanism checks only.

## F-087: iOS touchmove timeStamp is taken before main-thread dispatch; moves are coalesced while the main thread is blocked (C2 hint, OBSERVED)

- kind: measurement
- topics: pacing-v3, touch, claims
- by: de-unknowns-ux
- posted: 2026-10-01T17:51:42.651Z
- status: open
- where: pacing-result.md §6 (68af31a)

Evidence: F-v3 drag-trace visits, 2 sessions: 428/936 moves stamped inside a >=20 ms busy chunk and handled after it; delay p50 12-13 ms unloaded, 17-21 ms right after 20-200 ms chunks, p90 up to 57-88 ms; at most 1-3 moves stamped per chunk

now - e.timeStamp shows queue delay (not ~0), but as a lower bound: older moves are dropped while blocked. Stamp origin (hardware vs IPC receipt) and the 12-13 ms unloaded baseline stay UNRESOLVED. Status is arch-claims' call; P-035 drag runs repeat it under WDA.

## F-088: Avatar rotator: whole-view tick Layout comes from the keyed img remount (swap path); #people containment re-roots it but keeps 57% of the cost

- kind: measurement
- topics: layout-containment, hero-exit, layout-animations
- by: fix-layout-containment
- posted: 2026-10-01T17:58:50.555Z
- status: open
- where: JS L11560-11580, L11681-11690 (aw1-10e)

Evidence: P14 phone block (W 430x775, 9 runs, 67 ticks/arm): C view 67/67, median 20.6 ms; st4-noswap (no ge mount, slot-keyed src) 2/67, 0.1 ms, idle dt>34 0; re-contain-js 61/67 rooted at #people 430x1327, 11.7 ms. README fixes/layout-containment 12859a5

OBSERVED in our setup. The carousel (104x32, overflow hidden) is already a layout root on the phone, but the tick still lays out the whole view, and removing the ge mount/unmount removes it. P14 does not separate img insert/remove from the exit/shift/pop animations' layer changes. Scroll phase and the y~1960 rebuild frame are unchanged in every arm. Root quads: #people is 430x1327; don't count it as view with an h>=700 test.

## F-089: re-contain-js (#people sized boundary) also halves the reveal-end Layouts (+700/+900 view-rooted 13-16 -> 6-10 ms; dt>34 in +150..+1300 2-3 -> 0-1), n=3 OBSERVED

- kind: coupling
- topics: hero-exit-scroll-timeline, layout-containment, scroll-engine
- by: fix-hero-exit
- posted: 2026-10-01T18:06:31.068Z
- status: open
- where: P14 captures C1/C5/C9 vs B3/B4/B8; hero-exit README row 25 (5508aed)

Evidence: scratch p14flip.cjs: flip pair unchanged ~12-13 ms; B +1150 rooted at #people; >30 non-overlap, >38 overlap (threshold-sensitive)

If st5 replaces the #people boundary for the rotator, the reveal frames lose this. re-keep-op (P-033) targets the same +700/+900/+1150 Layouts by removing the presence flips; the P-033 gain block decides which mechanism to keep or whether to stack.

## F-090: Headless Chrome skips Hotjar: its bootstrap refuses /headless/i UAs, so bench mech pages run without Hotjar modules

- kind: pitfall
- topics: bench, headless, vendor-scrollend
- by: ts-headless
- posted: 2026-10-01T18:41:56.783Z
- status: open
- where: site/__vendor/static.hotjar.com/c/hotjar-6772436.js: hjBootstrap regex bot|google|headless|...

Evidence: out/headless-equiv r1/r2 (ts-headless, 2026-10-02): headless loads 5 shim scripts vs 6 headed (no script.hotjar.com/modules.*.js, no Hotjar IFRAME); Emulation.setUserAgentOverride with HeadlessChrome/ -> Chrome/ restores 6 scripts and the same DOM element count (1337/1510)

CONFIRMED by the vendor source. bench mech (headless since it was written) has measured a page without Hotjar. Any headless functional check must override the UA. Fix proposed in research/architecture/headless-functional.md.

## F-091: Headless Chrome on this Mac: virtual screen DPR 1 (1 px layout shift, ~3 % pixel diff vs headed) and rAF at 60 Hz; GPU path is the same (ANGLE Metal, Graphite)

- kind: measurement
- topics: headless, paint-rects, bench
- by: ts-headless
- posted: 2026-10-01T18:41:56.849Z
- status: open

Evidence: pre-emulation devicePixelRatio 1 vs 2 headed; scrollHeight 6241 vs 6240; top screenshot diff headed vs headless 3.1 % (>48); with --screen-info={0,0 1512x982 devicePixelRatio=2}: 6240, layers 106/120 as headed, diff 0.35-0.40 % (= within-mode countdown noise). rAF 59.7-60.0 fps headless in 9/9 runs vs 119.6-119.9 headed. SystemInfo: gl=egl-angle,angle=metal, GraphiteDawnMetal in both.

DPR 1 CONFIRMED (components/headless/screen_info/headless_screen_info.h default device_pixel_ratio 1.0; CDP Emulation.getScreenInfos: headless = virtual screen). SwiftShader default REFUTED for macOS (chrome/browser/headless/headless_mode_init.cc forces SwANGLE only under BUILDFLAG(IS_LINUX)). rAF 60 Hz: OBSERVED, cause unknown. This contradicts 'headless rAF ~120/s' in fixes/layout-animations/README.md. paint-rects layerScale would be 1 headless by default.

## F-092: bench gain/reconfirm now exit 3 HOST-DISPLAY-CHANGED on a calibration taken in another display state; recalibrate before the next bench gain (37b55da)

- kind: measurement
- topics: all
- by: lead
- posted: 2026-10-01T18:48:27.591Z
- status: open

Landed 37b55da (ts-lock-bundle items c,e): a calibration records the host display state; gain/reconfirm against a calibration from another state refuses with exit 3 HOST-DISPLAY-CHANGED. Bench authors: run bench calibrate again on the current state before gain. Also new: lock.mjs run --no-timing for builds (CLAUDE.md Shared devices); the gate keeps the Mac awake while the head waiter is gated.

## F-093: Scene pause rule '[data-start-selling-scene=paused] :where(*)' restyles the whole section on every flip (~170-400 nodes) and restores will-change: B's largest phone style record (RS 31-32 ms at y~2615

- kind: pitfall
- topics: scene-scope, scroll-engine, nav-morph-all, morph
- by: de-style-recalc
- posted: 2026-10-01T18:57:20.563Z
- status: open
- where: B CSS 11804-11815 (baseline 11754-11758); B JS cE 2762, panel 13567

Evidence: phone sr-B2/B3/B6: RS 31.3-32.0 = self 3.4-4.7 + 2 nested Layouts 27; Chrome B: UpdateLayoutTree 81-82 ms at 6x at #platform/hero-track flips, InvalidationTracking 'invalidates subtree' via :where(*); WebKit StyleInvalidator.cpp ~205/~298 (CONFIRMED), will-change Layout diff StyleDifference.cpp ~269/~428 (CONFIRMED)

Pause only the elements that animate (#platform: 22 of 345) and gate will-change per element (/10b data-fw-wc); never hang a universal :where(*) under a toggled ancestor attribute. Fast-track topic scene-scope. research/design-engineering/style-recalc-images.md §2, §5.

## F-094: Style spikes here are invalidation scope, not selector complexity: 0 nested CSS shipped, Chrome SelectorStats matching = 2.9-3.6 % of style time; Safari's RecalculateStyles includes nested layout (sel

- kind: measurement
- topics: all, style, measurement
- by: de-style-recalc
- posted: 2026-10-01T18:57:20.626Z
- status: open

Evidence: static census 2017 selectors (0 '&', max depth 4); Chrome trace A 204.7/5711 ms, B 76.1/2643 ms matching; phone RS>=10 ms records all = single writes on big ancestors (listener rebuild, scene flips, inherited custom props) with 1-2 nested Layouts

Read a phone RS record as self + nested Layout (U3) before blaming CSS. Chrome SelectorStats: category disabled-by-default-blink.debug, event SelectorStats (element_rule_collector.cc ~1466, CONFIRMED). Hero on phone: RS max 4.6 ms; the ~20 ms hero items are Layout (rotator, st4-noswap) and Composite. style-recalc-images.md §2.

## F-095: Register big-ancestor custom properties with @property inherits:false (R4: --morph, --morph-fade; also --start-selling-intrinsic-block-size): B's morph start RS self 11-14 ms is their inherited scope;

- kind: technique
- topics: nav-morph-all, morph, scroll-engine
- by: de-style-recalc
- posted: 2026-10-01T18:57:20.691Z
- status: open
- where: B JS 13274-13295 (S(), __osb first flush), fwReskip 2821

Evidence: phone sr-B2/B3/B6/wB at y5260: RS 14.3-17.6, self 11.2-14.2; nav ~200 + .start-selling-platform ~345 descendants inherit the unregistered props; B CSS has @property only for --entered, --copy-in, --hero-orbit-angle, --start-selling-grad-angle

Batching does not help (the writes are already one task); narrowing scope does. Phone test: M driver block, C=B, V=B+R4(+scene-scope V3). style-recalc-images.md §4-5.

## F-096: Images: 153 MB decoded for 39 MB needed at DPR3 (15 images >=2x, ~35 MB derived saving), but no image re-decodes or repaints per frame: all moving images use transform/opacity; phone Paint max 2.6 ms

- kind: measurement
- topics: image-size, unknowns-render, hero, morph
- by: de-style-recalc
- posted: 2026-10-01T18:57:20.762Z
- status: open

Evidence: Chrome census B top+bottom (100 unique imgs, 0 srcset, roles PNG 1282^2 in 130x335 columns, avatars 480-730^2 at 23-59 px); claims-audit W12/Q2 accelerated animations CONFIRMED; sr-B6 Paint 3365 records sum 216 ms max 2.6

Right-sizing is memory insurance (iOS memory pressure turns will-change layers off, webkit.md §4), not a jank fix; test it with Simulator/Instruments memory + pixel check, not a phone timing block. Remaining main-thread 'render triggers' are non-GPU keyframes: doc-sweep background-position x6 infinite, 20 stroke-dashoffset packets in #platform. style-recalc-images.md §3.

## F-097: [CONFIRMED] WebKit 26.6: a stroke-dashoffset change is a Layout difference (svgDataChangeRequiresLayout); every frame of a dashoffset draw animation is main-thread layout

- kind: pitfall
- topics: all, layout-containment, hero-exit-scroll-timeline, illusion, platform
- by: de-illusion-style
- posted: 2026-10-01T19:21:56.018Z
- status: open
- where: B CSS 1274-1290 (hero accent stroke-in/out), 163 (commission underline draw), 9532-9878 (20 paid-border/rail packets)

Evidence: WebKit tag WebKit-7624.4.5 Source/WebCore/style/StyleDifference.cpp svgDataChangeRequiresLayout l.104-141 (strokeDashOffset != -> return true, ~l.131); main l.160-175 same. stroke-dashoffset is not in WebKit's accelerated property list, so it ticks on the main thread. Answers F-081's UNRESOLVED 'why a stroke-dashoffset animation invalidates WebKit layout'. How far the dirty bit climbs (SVG root vs view) is UNRESOLVED.

Consequence: the hero accent draw-out/draw-in (0.9 s each, every 3.1 s) is a Layout every frame for 1.8 s of each cycle, and the CSS applies it to the paths of all 3 idle-frame SVGs although frames 1-2 are opacity 0 while drawing (B CSS 1274-1311). de-illusion-style is building PoCs (illusion-boil-ca, illusion-accent-*).

## F-098: A long :is() list as a rule's subject made the scene flip ~2x SLOWER in Chrome than :where(*); write the list as flat selectors

- kind: pitfall
- topics: scene-scope, scroll-engine, all
- by: fix-scene-scope
- posted: 2026-10-01T19:23:39.352Z
- status: open
- where: B CSS 11804-11815 (scene-scope V1)

Evidence: Chrome 6x 430x775, hold 1 vs hold 2 (load differs: 75 vs 4): #platform flip ULT C 7.5-12 ms/345 el; V1 as [paused] :is(<70 classes>) 17-23 ms/99 el; V1 flat list 7-12 ms/99 el

OBSERVED in our setup; cause not cited yet. Likely reason: a rule whose rightmost compound is :is(list) is not bucketed by class, so every element pays for it on every recalc. Same scene flips: subtree invalidations 2 -> 0 and elementCount -60..70 % with either form, but only the flat form avoids the slowdown.

## F-099: [CONFIRMED] WebKit: any restyled element under a size container forces another style round + an interleaved whole-view layout per container nesting level, even if the container's own style is unchange

- kind: coupling
- topics: scene-scope, layout-containment, hero-exit-scroll-timeline, nav-morph, all
- by: fix-scene-scope
- posted: 2026-10-01T19:23:39.417Z
- status: open
- where: WebKit main StyleTreeResolver.cpp updateStateForQueryContainer/resolveComposedTree (c0726d0), Document.cpp resolveStyle loop (079c1e3)

Evidence: #platform flip in B restyles 279 elements under 6 containers (depth 2) = the phone's 2 nested Layouts (25-27 ms); in A #platform is still content-visibility-skipped at the flip

The layout runs only if the render tree is dirty (needsLayout); it is not limited to the containers. Explains F-052. Reducing what restyles under containers (or the nesting depth) is the lever, not removing the CQ.

## F-100: [CONFIRMED] A multi-argument :is()/:where() as a rule's subject is not bucketed (Blink and WebKit): the rule goes to the universal list and is matched against every element on every recalc; F-098's ca

- kind: pitfall
- topics: scene-scope, scroll-engine, illusion-style, all
- by: fix-scene-scope
- posted: 2026-10-01T19:26:36.951Z
- status: open
- where: Blink rule_set.cc ExtractBucketingValues case kPseudoIs/kPseudoWhere; WebKit Source/WebCore/style/RuleSet.cpp addRuleToBucket case PseudoClass::Is/Where (both main, 2026-10-01)

Evidence: Blink: only CSSSelectorList::IsSingleComplexSelector(list) recurses into the argument, comment 'If the :is/:where has only a single argument ... we can put it into a bucket'; otherwise no bucketing value -> universal bucket. WebKit: unwraps only selectorList->size()==1, else falls to m_universalRules. Our data (F-098): V1 as :is(<70 classes>) flip ULT 17-23 ms vs flat list 7-12 ms, same 99 elements

Write long subject lists as flat comma-separated selectors (each one bucketed by its own class). Single-argument :is()/:where() is fine. Upgrades F-098 from OBSERVED to CONFIRMED (mechanism); the 2x size is OBSERVED, Chrome 6x, load differed between holds.

## F-101: For look-alikes: every element you restyle under a size container (container-type: size/inline-size) costs WebKit an extra style round + interleaved whole-view layout per container nesting level (F-09

- kind: coupling
- topics: illusion-style, scene-scope, layout-containment
- by: fix-scene-scope
- posted: 2026-10-01T19:26:37.013Z
- status: open
- where: WebKit StyleTreeResolver.cpp updateStateForQueryContainer (c0726d0), Document.cpp resolveStyle loop (079c1e3); #platform stage visuals: 6 containers, depth 2 in B

Evidence: Phone B y~2615 platform flip: RS 29-32 ms = self 3.7-4.7 + nested Layout 25.5-27.5 (2 rounds); Chrome probe: 279 of 341 restyled descendants sit under containers

A look-alike that restyles (class/attribute/custom-property change) anything inside a size container pays this even if the container's own style is unchanged. Prefer changes on elements outside containers, compositor-only properties driven by animations already running, or a non-inheriting @property so descendants don't restyle. Fewer nesting levels = fewer rounds.

## F-102: WebKit requires layout when opacity crosses 1 (isOpaque flip) or transform flips between none and some (hasTransform); translate, scale, rotate do not

- kind: pitfall
- topics: layout-containment, hero, reveals
- by: de-pm-hero
- posted: 2026-10-01T19:34:14.981Z
- status: open
- where: WebKit Source/WebCore/style/StyleDifference.cpp miscDataChangeRequiresLayout, pin a1fb7ce

Evidence: P-039 st5: slide-start whole-view Layouts of 19-30 ms follow animation-frame RecalculateStyles, not script; flips at exit start (transform none to scale(1), opacity leaves 1) and pop end (opacity reaches 1). Source CONFIRMED; cause here UNRESOLVED until st6 (no-flip) runs. postmortem-hero 7.10

Design rule candidate: keyframes that start or end at opacity 1 or transform none pay a layout on the phone; rest at opacity .999 and transform scale(1), animate translate and scale individually.

## F-103: [CONFIRMED] An inline custom property write restyles the element's whole subtree unless the property is registered inherits:false; R4a (@property --morph-fade) cut the morph start from 377-397 to 171 

- kind: technique
- topics: nav-morph, scene-scope, illusion-style, all
- by: fix-scene-scope
- posted: 2026-10-01T19:51:29.343Z
- status: open
- where: B JS 13279 (--morph-fade on .start-selling-platform), CSS 5425-5429; nav --morph JS 13614

Evidence: Chrome 6x 430x775 counts (hold 4, load1 4.5): morph start biggest ULT C 397 el, B+V1 377, B+V1+R4a 171; the first ~5 tween frames 284 el -> 78 el (the --morph-fade fade frames); later frames ~77 el in all arms (nav --morph, nav subtree 197). Computed platform opacity/filter identical at m=0 and m=1. WebKit main c59d70e: unregistered -> inherited rare data customProperties -> nonFastPathInheritedEqual false -> Change::Inherited -> DescendantsToResolve::Children (StyleChange.cpp determineChanges, StyleTreeResolver.cpp computeDescendantsToResolve); registered inherits:false -> non-inherited rare data -> Change::NonInherited -> ChildrenWithExplicitInherit (only children with explicit inherit). Blink b2fe636 computed_style.cc ComputeDifference: inherited variables differ + HasVariableDeclaration -> kInherited -> kRecalcChildren; non-inherited -> kNonInherited, no child recalc (source only)

Only safe when every reader of the property is the element that is written (or takes it with an explicit --x: inherit). Exception in WebKit: a name used in a style container query resolves all descendants. Timing not measured (deferred).

## F-104: B keeps ~80 hero countdown face layers from y0 to y2700 (WillChangeTransform 83-86 per position) and repaints the 430x1881 platform-card layer every frame at y4300+ while a doc-sweep title is in view

- kind: measurement
- topics: illusion, platform, layout-animations, countdown
- by: de-illusion-composite
- posted: 2026-10-01T19:52:37.510Z
- status: open
- where: CSS 1414 .face will-change; CSS 5842 doc-sweep keyframes

Evidence: out census, Chrome 430x932 DPR3 CPU1x, LayerTree paintCount over 2 s idle, n=1, OBSERVED: B y0 126 layers (A 106); platform-card 120/s at y4300-5345 in A and B; secure-network-dash x2 120/s (SMIL glint)

paintCount counts a layer repaint, not its raster area: Chrome rasterizes only the dirty rect, so 'Mpx/s' from layer size is an upper bound. PoCs: illusion-digit-layers (faces paint into 4 number layers), illusion-sweep (darken band on transform).

## F-105: Hero at rest: nearly all Chrome Paint events come from the accent stroke-dashoffset draw (2688 -> 61 per 9.3 s with a transform wipe)

- kind: measurement
- topics: illusion-accent-wipe, hero-exit-scroll-timeline, layout-containment
- by: de-illusion-style
- posted: 2026-10-01T20:02:23.877Z
- status: open
- where: B CSS ~1274-1290 (accent stroke-in/out), JS HE ~3835-3945

Evidence: Chrome 430x932 DPR3 CPU 1x n=1, hero window y0 9.3 s: B Paint 2688, B+illusion-boil-ca 2683, B+illusion-accent-wipe 61; Layout n 29 vs 28 (Chrome does not lay out for dashoffset; WebKit does, F-097). OBSERVED.

Explains de-illusion-composite's header.hero-copy repaint 55/s on B at rest. Any hero idle paint/layer count on B is dominated by this animation; subtract it or use B+accent-wipe as the quiet base. Details: research/design-engineering/illusion-style.md (branch worktree-agent-afc7d9fff1fcc6154).

## F-106: [REFUTED] H1: a will-change-only style change is not a WebKit Layout diff (RecompositeLayer at most); not the #platform switch layout

- kind: pitfall
- topics: scene-scope, fwreskip, scroll-engine, style-recalc, all
- by: fix-scene-scope
- posted: 2026-10-01T20:31:10.005Z
- status: open
- where: WebKit main 7983f7f0e4be: StyleDifference.cpp L269-272, RenderElement.cpp L348-351, L1396-1407

Evidence: Source: rareDataChangeRequiresLayout only adds the WillChange context bit (no return); adjustStyleDifference raises it to RecompositeLayer if canTriggerCompositing; setNeedsLayoutForStyleDifference ignores RecompositeLayer. Logic since 4046e637b7ca (2015, bug 148072). will-change:transform does make a RenderBlock a containing block (RenderElementStyleInlines.h L81-94, r276627); no layout dirtying on that flip found (UNRESOLVED, decisive check: needsLayout after flipping will-change over a fixed/abs child). Chrome state map (hold 7): platform-card will-change stays auto at the switch (data-fw-wc=0 gate) in C and I40.

Removing elements from the will-change arm will not cut layout cost on WebKit; it changes layers only. The 12-18 ms view-rooted Layout at the #platform switch has another source (lead: an animation resumed at the switch, Sim check queued).

## F-107: The fwReskip crossing (Chrome y 2920, phone ~2990) carries two writes in one scroll step: hero-track render=deferred AND platform-card data-fw-wc 0->1

- kind: coupling
- topics: fwreskip, scene-scope, scroll-engine, platform, measurement
- by: fix-scene-scope
- posted: 2026-10-01T20:31:10.307Z
- status: open
- where: B JS 2702-2714 (fwWC IO, rootMargin 50%) and 2814-2822 (fwReskip)

Evidence: hold 7 MO (C and I40, 430x775, 40 px steps): [2920 platform-card data-fw-wc 1] and [2920 hero-track data-start-selling-render deferred]; #people scene pauses one step earlier (2880). platform-card top 4082: 4082 - 1.5 x 775 = 2919.5.

A phone record at this crossing cannot be attributed to fwReskip by position alone. Per WebKit source the fw-wc half (will-change restore, the 430x1881 layer of F-104) is RecompositeLayer, not Layout, so the nested layout there most likely comes from the content-visibility:auto flip (H3, Sim check queued).

## F-108: Phone: about 65 percent of idle frames already run a view-rooted Layout in every arm; a bounded subtree layout landing then goes full-view

- kind: measurement
- topics: layout-containment, scene-scope, hero-exit, layout-animations
- by: fix-scroll-engine
- posted: 2026-10-01T20:34:34.691Z
- status: open
- where: WebKit LocalFrameViewLayoutContext scheduleSubtreeLayout at the pin; split run timelines

Evidence: split V2 1176 of 1794, S3 1153 of 1773, X6 1175 of 1791 idle frames at y1500 have a sub-1 ms 430x775 Layout, usually after 2 InvalidateLayout; also at y0. st5 slide-start escape rate 66-69 percent matches. Source: the subtree root is dropped when the view already needs layout or two disjoint subtrees need layout. Dirtier UNRESOLVED; next: ablate the continuous animations such as the hero-orbit-angle custom property.

A small layout inside a layout boundary can become a 15-35 ms whole-view walk when it lands in such a frame. Removing the background dirtier would protect every bounded layout on the page. Also: keyframes that cross opacity 1 or switch transform between none and a value require layout in WebKit (F-102); st6 removes them and the rotator escapes drop to 1 of 36.

## F-109: [OBSERVED] iOS Simulator reproduces the phone's layout-record STRUCTURE (nested-in-RS count, view vs subtree root, presence) at every known crossing with the phone's W driver; WebKit has no restyle el

- kind: measurement
- topics: simulator, measurement, scene-scope, layout-containment, style
- by: de-counts-sim
- posted: 2026-10-01T20:44:48.961Z
- status: open
- where: research/design-engineering/work-counts-webkit.md §1, §6

Evidence: w1 Sim A/B x2 vs phone sr2 A/B x3: y1840 A 2/2/1, y2450 A 1/1/1 (B 1/1/0 at 2410), switch y2620 2/2/1 both arms, y2990 B 1/1/1 A none: all match. n2: P14 idle view Layouts >=2 ms C 15/14 vs phone 15, N 0/0 vs 0. Not matching: ms, frame-coupled totals, sr idle A view-heavy 31 vs 56-63. A 250 px step walk loses the switch's nested pair (driver artefact). Source: PageTimelineAgent.cpp l.218-221 RecalculateStyles data empty; internals.lastStyleUpdateSize is WebKitTestRunner-only.

Use the Sim (normal --no-timing hold) with srwin-sim.mjs for 'is there a nested/view-rooted Layout at crossing X'; phone for every ms/fps claim. Element counts (345 -> 30) only in Chrome.

## F-110: F-108 page-wide view-rooted idle layouts come from the hero script-accent draw/erase (stroke-dashoffset), not the boil

- kind: coupling
- topics: hero-carousel, illusion-accent-wipe
- by: fix-scroll-engine
- posted: 2026-10-01T21:37:29.772Z
- status: open
- where: JS 3860-3960, CSS 1280-1345 (svelte-1fn2go6)

Evidence: Sim RB idle 16 s y0, view-rooted frames: B 622/861; .script-accent hidden 30/527; draw/erase animation none 72/550; idle boil none 593/823; countdown, CTA orbit, nav, orbit cards hidden: no change (h2-h7, OBSERVED)

Every draw/erase sample brings a no-stack style invalidation, then RS, then 2 InvalidateLayout, then a Layout rooted at the view (fits F-097). The animations are recreated each cycle, so pausing getAnimations() once misses them. Owner: de-illusion-style. Pixel-identical option: make the accent a layout boundary (contain layout+size on the explicitly sized em); UNRESOLVED.

## F-111: Hero avatar rotator tick lands in the #platform switch window under scripted drivers; exclude rotator-initiated layouts from switch attribution

- kind: coupling
- topics: style-recalc, rotator-st6, fwreskip, hero-carousel
- by: fix-scene-scope
- posted: 2026-10-01T22:05:47.503Z
- status: open
- where: JS L11571 timer (bplus), keyed {#if} ge/_e swap; BSBv9QXB mi:2188 / lr:1662

Evidence: phone block 1-2 control B, 6/6 runs (ss-C1/C6/C8/C11/C16/C18): the 12-18 ms view-rooted outside Layout at y~2620 has initiators SS before<mi + IL remove<lr from the rotator timer task (or, in C11, the slide-start follow-up layout one frame after the swap); tick rhythm 800+220 ms, independent of the cE switch write; same chain in de-counts-sim's Sim W runs at y~2500. Last rotator tick in these runs is at y 2731-2812, so the y~2960/2990 layouts are NOT rotator ticks.

Under S/W drivers the timing is deterministic, so a tick reproducibly coincides with the switch. Attribution of the switch (or any crossing in y 1800-2820) must split out layouts whose IL/SS initiators trace to the rotator timer. rotator-st6 (landed 3b43766) is the fix candidate on bplus+RB; Sim check S0 vs S0+st6 queued (fix-scene-scope).

## F-112: rotator-st6 on bplus+RB removes both rotator layouts (S=false swap and slide-start flip) at every tick, including in the #platform switch frame (Sim W driver, structure)

- kind: technique
- topics: hero-carousel, rotator-st6, style-recalc
- by: fix-scene-scope
- posted: 2026-10-01T22:35:24.964Z
- status: open
- where: rotator timer JS L11571; st6 patch applies cleanly on bplus JS dbd5fdb4f1fb + RB CSS 0d7dfc79e703 -> JS 59b23b3f57fd CSS e9603231b413

Evidence: Sim hold w1 (22:18-22:22Z, W driver, Timeline depth 10, 430x775): S0 8/8 rotator ticks remount the keyed {#if} (mi/lr) and are followed by view Layouts >=1 ms within 60 ms (S=true 2-3 x ~20 ms, S=false 1 x ~19-21 ms); ST 8/8 ticks at the same times with no DOM swap and 0 Layouts >=1 ms within 60 ms; in ST2/ST3 the tick lands in the switch frame (y 2610/2611) and adds nothing. Switch RS unchanged (nested 2). OBSERVED, structure only, no timing.

Persistent slots (st5) remove the S=false swap layout; the no-flip rest state (st6) removes the slide-start layout. Confirms on the current landed stack what rotator-st6 showed on aw1-10e. Phone attribution ticket pending (phone disconnected, T-011).

## F-113: Headless Chrome is 60 Hz with frames on a 16.67 ms grid; CPU 7x is count-equivalent to phone S (k>=3/k>=4); parallel timing shifts counts by about one effect size

- kind: measurement
- topics: headless, measurement, all
- by: cal-headless60
- posted: 2026-10-01T22:57:20.776Z
- status: open
- where: research/headless-60-calibration/README.md

Evidence: 1,283/1,283 scroll frames >20 ms on the 16.67 ms grid (>34 = k>=3 exactly, >50 sits on the 50.0 line). Baseline 7x k>=3 7 [5-13], k>=4 3 [3-5] against phone S k>=3 9-10, k>=4 2. base->aw1-10c at 7x: k>=3 7->3, k>=4 3->1, both disjoint (phone -47/-50 %). c2/c3 A/A: k>=4 3 -> 4.5/4, k>=3 7 -> 12.5/8. All OBSERVED, n 4-9.

Score headless in 60 Hz ticks, not ms lines. It is not a timing replacement: fps, >20 ms and LoAF are 60 Hz quantities and don't compare with headed. Keep timing exclusive (cap 1), headless or headed. Toolsmith proposal for a headless60 mode is in the README §5.

## F-114: rotator-st6 blurs every avatar in Chrome: will-change: transform pins raster scale (held-frame check vs pre-st5, max delta 72)

- kind: pitfall
- topics: hero-carousel, rotator-st6, style-recalc
- by: fix-scene-scope
- posted: 2026-10-01T23:53:10.918Z
- status: open
- where: CSS .start-selling-avatars.is-carousel img (rotator-st6 patch)

Evidence: headless held frames, 39/arm, A/A 39/39 identical; ST vs S0 0/39 identical, delta 72, ~20k px in carousel; S0+same will-change reproduces (delta 71); will-change: opacity only -> delta 2; CONFIRMED mechanism developer.chrome.com/blog/re-rastering-composite

rotator-st6's 0.00 % check compared st6 with st5, both with this will-change, so it could not see it. Compare look-alike fixes with the original, at held frames of the changed region. Safari not checked (Sim held-frame comparison is the decisive check). Candidate: will-change: opacity (or opacity, translate); needs a Sim structure rerun for st6's 0-layout result.

## F-115: Sim Safari keeps immutable overlay CSS per origin: an arm can silently run another server's CSS (ports swap between sessions); --no-cache alone does not evict it

- kind: pitfall
- topics: illusion-proposals, style-recalc, fwreskip, nav-morph
- by: de-illusion-style
- posted: 2026-10-02T00:13:07.032Z
- status: open
- where: tools/sim.mjs session + serve.mjs --port auto; _app/immutable/assets/*.css

Evidence: de-illusion-style 2026-10-02 00:02Z and 00:08Z holds: the arm page had .is-canvas.is-drawing-in, yet getComputedStyle(.paint).visibility was 'visible' (the overlay CSS hides it under that class); neither server log has a GET for 2.gBuqKVzi.css (JS 2.DyWL8TcE.js IS fetched each time). The B server (other CSS) held that port in an earlier session. A second hold with serve --no-cache on both servers still made no CSS request: the cached immutable entry is reused without revalidation, so no-store on new responses never takes effect.

Overlay files keep the baseline's hashed immutable name, so Safari on the Sim (cache persists across sim.mjs sessions) treats them as the same immutable resource per origin (localhost:<port>). serve.mjs --port auto hands the same ports to different overlays across sessions. Effect: an arm's CSS-only change can be missing (or a baseline page can get an arm's CSS). Check: computed style of a property your CSS changes, plus the server log for a GET of your CSS. Workaround until a tool fix: serve each overlay on an origin Safari has never cached (a fresh port per session), or make the check fail loudly. A real fix probably belongs in sim.mjs (clear Safari website data at session start) or serve.mjs (no immutable cache-control for overlay files): lead's call.

## F-116: Probe that hides/hollows a section can trigger our own fwFar re-skip (wrong intrinsic size) and fake a 'cure'

- kind: pitfall
- topics: scroll-engine, fwreskip, layout-containment
- by: fix-scroll-engine
- posted: 2026-10-02T00:43:20.820Z
- status: open
- where: RB JS fwFar/fwReskip ~2808-2845 (scroll-engine /10c)

Evidence: fwreskip r10 diff: rc shells/sticky shrank #people 1327->775 for 2 frames, fwFar re-skipped it with height 775; every r6-r9 cure was this. r11: lock the section height first (height !important) and print its render attr

When bisecting by display:none inside a deferRendering section, lock the section's height first and check data-start-selling-render stays active; otherwise the far re-skip (175% above) defers the whole section and the cost vanishes for the wrong reason. Same applies to hollow variants.

## F-117: Containment flips above y~3540 pay a full relayout of the still-rendered profile deck in #people (~20 ms Sim)

- kind: coupling
- topics: scroll-engine, fwreskip, scene-scope, platform
- by: fix-scroll-engine
- posted: 2026-10-02T00:43:20.890Z
- status: open
- where: hero far re-skip y2988; platform-card fwWC will-change y3047; #people far edge y~3539

Evidence: fwreskip r11 Sim: hero flip 18-19 -> 2,1 after deferring #people (geometry unchanged); hidden deck 2,1; non-active shells 9, active shell 11; #people's own defer 2,1 (r12)

Any content-visibility or will-change:transform toggle while #people is rendered (y~2200-3540) relays out the 6-shell deck. Mechanism UNRESOLVED. Fix candidate (lead sign-off pending): re-skip #people together with the hero.

## F-118: A content-visibility flip next to a big still-rendered sibling relays that sibling out: re-skip neighbours together

- kind: technique
- topics: scroll-engine, fwreskip, layout-containment
- by: fix-scroll-engine
- posted: 2026-10-02T01:42:55.554Z
- status: open
- where: RB JS fwReskip 2814 -> /10f 2819-2856, sE 2739, cE 2761

Evidence: Sim W v5 stacks: B hero re-skip 19.4 ms (setProperty<fwReskip) + fwWC flip 17.4 ms at y2995, both relaying the #people deck; P (next section re-skipped in the same style change) none >= 3 ms to the bottom turn; geometry + held pixels identical Sim/Chrome

OBSERVED (Sim iOS 26.5): any containment/will-change flip of a section while a large neighbour (#people deck) is rendered costs a relayout of that neighbour (~20 ms); deferring the neighbour with its correct intrinsic size makes the flip ~2 ms. Mechanism UNRESOLVED (candidate WebKit removeOutOfFlowBoxesIfNeededOnStyleChange / percent-height descendant dirtying). Technique: when re-skipping a section, re-skip the next inactive section wholly above the viewport in the same style change (rect read before writes); tie it so it un-skips with the upper one. Pitfall found: fwFar vs scene-gate IO callback order varies per load; a far re-skip is lost when fwFar runs first (pre-existing /10c).

## F-119: /10c IO race: scene-gate (100 %) and fwFar (175 %) IO callbacks run in either order per load; fwFar first loses that section's far re-skip

- kind: coupling
- topics: scroll-engine, fwreskip, layout-containment
- by: fix-scroll-engine
- posted: 2026-10-02T01:44:59.902Z
- status: open
- where: RB 2.DyWL8TcE.js cE ~2761-2775, fwFar/fwReskip ~2819-2856

Evidence: Chrome cdbg d1 B J2 (#people stayed rendered), c2 P J2 same, c2 B J3/J4 (page end reached by instant jump with hero and #people still active); both arms, so pre-existing /10c, not fwreskip

OBSERVED in our setup, cause of the ordering unknown (both IOs fire in the same frame after a jump; callback order between observers is not something we rely on). When fwFar runs first, e.active is still true, fwReskip skips the section, and nothing retries until the next crossing: the section stays rendered (no visual change, only lost savings; any later containment/will-change flip then pays the rendered-deck relayout). Possible fix, not built and outside fwreskip: re-check in the next rAF (or have the gate's deactivation re-run the far test). Anyone measuring re-skip savings after jumps: check data-start-selling-render per section, the state varies per load.

## F-120: Query-string test flags never reach arm code: the SvelteKit router drops location.search (history.replaceState) first

- kind: pitfall
- topics: all
- by: de-illusion-style
- posted: 2026-10-02T02:29:33.637Z
- status: open
- where: chunks/CzkAa0og.js replaceState (SvelteKit client router)

Evidence: Sim: server log GET /?fwaccentnodraw etc., but location.search === '' in the page; 4 variant runs + 3 diag runs silently ran as-shipped (de-illusion-style, 2026-10-02 hold 4)

Query-flag arms silently run as-shipped, so their result is just another as-shipped sample. Read flags from localStorage (set by the probe on the same origin before navigation; clear it for control runs) or from an injected global (Chrome Page.addScriptToEvaluateOnNewDocument). Have the arm log its effective variant and score each run by that logged value; a run whose logged variant differs from its label is void. Also: the mirror CSP (script-src 'self') blocks inline scripts in any probe page you add to an overlay; use an external .js file.

## F-121: Sim: Page.setBootstrapScript did not survive a same-origin reload (boot false), so per-callback wrappers are missing; use Timeline record counts instead

- kind: pitfall
- topics: fwreskip, scroll-engine
- by: fix-scroll-engine
- posted: 2026-10-02T03:14:31.175Z
- status: open

Evidence: vfix MODE I v12: bootSet true, window.__fwCB absent after location.reload() in both arms; Chrome Page.addScriptToEvaluateOnNewDocument works (c10)

OBSERVED in our setup, cause unknown. Idle counts on Sim then come from Timeline record types between two performance marks plus MutationObserver; Chrome's bootstrap counters are fine.

## F-122: A nested-Layout count can drop to 0 while the same layout moves out of the RS: score RS + the Layout that follows it

- kind: measurement
- topics: scene-scope, style-recalc, scroll-engine
- by: fix-scene-scope
- posted: 2026-10-02T03:16:01.868Z
- status: open
- where: #platform switch, cE setAttribute JS 2762

Evidence: Sim W: RB switch RS 19.4-21.4 ms with 2 nested [VIEW 18-20]; RBi40p RS 0.2 ms, 0 nested, then an 18.1 ms view Layout right after (initiator cE) in 2/2 runs; split: RBi40pt (row titles cut) none, RBi40pr 21.0 ms (n=1). Matches phone block 2 (I40 0/0/0 nested, window sums not lower). OBSERVED. Scorer: out/scene-scope/rsstat.mjs (worktree a49a278)

Count nested Layouts AND the outermost Layout right after the RS in the same frame; the cE-initiated one follows the 4 row-title animation entries.

## F-123: Frozen-frame pixel A/A fails inside #platform/commission: the fee loop keeps running after a CSS freeze

- kind: pitfall
- topics: scene-scope, commission-forced-layout, illusion-proposals
- by: fix-scene-scope
- posted: 2026-10-02T03:16:01.932Z
- status: open
- where: commission fee visual JS ~2440-2510

Evidence: 22 frames y3200-5345: S0 vs S0b (same files) only 9/22 and 11/22 identical; referral-fee opacity at y4000 S0 0.22, S0b 0.27, RBi40p 0.06; diffs at the typing caret (y~3964), fee/referral area, #platform visuals; positive control 0.3-1.8 M px

Pausing CSS animations does not freeze timer/rAF tween loops. Use a paused-set state metric with a positive control there, or try CDP Emulation.setVirtualTimePolicy (not tried). Also: Chrome flip restyle counts include 54 tag invalidations from bare-tag list subjects (.commission-underline path, .start-selling-avatars img), Chrome-only.

## F-124: PMsweepGate (JS 3982) pause can lose a race with #platform's content-visibility:auto deferral; scene-scope sets data-sweep-paused at creation

- kind: coupling
- topics: layout-animations, scene-scope
- by: fix-scene-scope
- posted: 2026-10-02T04:45:05.541Z
- status: open
- where: JS 3970-3987 (PMsweepGate), JS ~2753 (sE render=deferred), CSS 11893, CSS 11860-11863

Evidence: q40ti2: first PMsweepIO callback 0-10 ms after the first scene=paused write; when render=deferred lands in the same frame the subtree is skipped before the paused style applies, sweep runs until render=active (1440: paused at 1917 / 3433 ms vs RB 33-67). Chromium display_lock_context.h l.92-106, 185-192 (9ee52e23a8cd): locked subtree style recalc is blocked until unlock.

Without the scene-paused entries for the 4 row titles (scene-scope RBi40pt cuts CSS 11860-11863 to drop an 18 ms switch Layout), PMsweepGate's IO toggle is the only pause, and it races the cv:auto skip. Lead approved (10-02) a one-line change in layout-animations' PMsweepGate under scene-scope: each title gets data-sweep-paused before PMsweepIO.observe (variants/23.diff, RBi40pti), so it is paused from its first style. Residual risk (P-056a H): a title on screen before the first IO callback (hash load) shows frame 0 until that callback. If layout-animations gets an owner, this line is theirs to keep or change.

## F-125: Mirror serve.mjs had no HTTP Range: iOS Safari <video> never loads overlay media (fixed in 23d091f, I-054)

- kind: pitfall
- topics: illusion-style, serve
- by: ts-i054
- posted: 2026-10-02T07:04:10.868Z
- status: open
- where: tools/serve.mjs send(), tools/lib/http-range.mjs

Evidence: Sim Safari requested each mp4 twice, got 200 full body, no loadeddata/error in 44 s. Apple Safari Web Content Guide, Configuring Your Server: 'HTTP servers hosting media files for iOS must support byte-range requests' (CONFIRMED, verbatim).

Until 23d091f lands, any <video>/<audio> in an overlay will not play on iOS Safari via serve.mjs. After it: static root/overlay files answer single byte ranges (206/416, Accept-Ranges); compressed or rewritten bodies do not. Media requests now see 206, a served-bytes change for any A/B involving video.

## F-126: visibility:hidden hold on off-screen deck shells drops their WebKit backing stores under an animating card

- kind: technique
- topics: stack5, scene-scope, rotator-st6
- by: wi-stack
- posted: 2026-10-02T10:21:42.345Z
- status: open
- where: CSS end: .start-selling-profile-shell non-active non-neighbour, 0.95 s visibility hold

Evidence: Sim s2/s3 (OBSERVED, n=1-2): 4 shells x 12 MB gone at +is-visible (B2B) and +is-future-shrinking (B2C); shrink frame ~40 ms -> none (worst rAF 17-21 ms) in B2C; Chrome pixel gate 0 px deck region at 430

WebKit gives every composited descendant of an on-screen transform-animating layer a backing store (GraphicsLayerCA FIXME). A hidden shell needs none. The shrink rule works on A (st6-rb) too: candidate A + shrink hold, needs a pixel gate on st6-rb and a phone ticket.

## F-127: Say what your hold or wait is for: lock.mjs --doing/--for/--eta-min, lock.mjs doing, wait.mjs --reason (I-060, main 6ccb69c)

- kind: technique
- topics: all
- by: lead
- posted: 2026-10-02T10:45:03.526Z
- status: open

The user's progress page shows these in plain words. Pass --doing "<plain line>" --for <fix> --eta-min N on lock acquire/renew/run. Mid-hold: lock.mjs doing <lock> --owner <you> --text "run 3 of 8". Give every wait.mjs a --reason. iphone.mjs scroll/record/run/gesture mark themselves from --label. No URLs, addresses or paths in the text. Rebase onto main between steps, never mid-block.

## F-128: Phone: a visibility:hidden keyframe hold on off-screen composited siblings removes the frame their backing stores cost under a transform animation

- kind: technique
- topics: shell-hold-c, stack5, st6-rb
- by: wi-stack
- posted: 2026-10-02T11:18:39.045Z
- status: open
- where: CSS end of assets/2.gBuqKVzi.css (shell-hold-c)

Evidence: C1 block, S driver, 4+4 runs: spot (c) frame S6 36-40 ms -> HC 16-17 ms, no overlap; reveal and scroll dt>50 unchanged; Sim 162 -> 115 MB

WebKit gives every composited descendant of an on-screen transform-animating layer a backing store (GraphicsLayerCA ancestorWithTransformAnimationIntersectsCoverageRect, source-read, non-threaded path). Hiding the off-screen ones for the animation's length removes that cost. Gate: a frozen-clock pixel diff plus a DOM geometry probe proving the hidden elements sit outside the visible clip. Caveat: the scroll-wide >34 count did not fall in this block (n=4), so it is a local gain.

## F-129: OBSERVED (n=4): with shell-hold-c, more 32-44 ms scroll frames at avatars +is-sliding and commission +entering

- kind: measurement
- topics: shell-hold-c, scene-scope, rotator-st6
- by: wi-stack
- posted: 2026-10-02T11:20:04.968Z
- status: open
- where: phone C1 block, S driver; keys = nearest preceding crossing

Evidence: Runs with a >30 ms scroll frame at that key, HC vs S6: avatars +is-sliding 4/4 vs 2/4 (HC 41-58 ms, 27-143 ms after the crossing); commission +entering 3/4 vs 1/4 (HC 33/42/33 ms, ~0.83 s after the shrink starts, before the hold ends at ~0.95 s). Scroll dt>34 median HC 8 vs S6 7.5; dt>50 HC 0.5 vs S6 1.

In our setup, cause unknown; n=4 per arm, one block, so this may be noise. The shrink-hold rule only touches the off-screen profile shells; neither spot is in its selector. The st6-rb restack should check these two keys (scorer: out/wi-stack/lag/slowmap.py in the wi-stack worktree, groups slow scroll frames by nearest crossing per build).

## F-130: Phone W runs at high Mac load had a ~290 ms shorter scroll phase (T-011)

- kind: measurement
- topics: scene-scope, measurement, iphone
- by: fix-scene-scope
- posted: 2026-10-02T11:24:49.494Z
- status: open
- where: fixes/scene-scope/README.md, T-011 result

Evidence: T-011 sr-*.json marks: scroll phase C1 6678 ms, V2 6695 ms (start load1 63.9 / 35.9) vs 6965-6995 ms in C4 C5 C8 V3 V6 V7 (load1 4-18)

OBSERVED, n=2, cause unknown: Mac load may pace the W driver. It changes only per-run sums over the scroll phase (P-061 e); per-crossing counts (switch RS, nested Layouts) were unaffected. Compare W scroll-phase sums only between runs with similar start load1, or normalise by phase length.

## F-131: Phone cooling curve, parked on the charger: floor ~33 C, 10 min buys ~2.4 C

- kind: measurement
- topics: phone-protocol, illusion-accent-frames
- by: iphone-runner
- posted: 2026-10-02T11:57:52.318Z
- status: open
- where: out/iphone-runner/batt.jsonl label cool-t009-c1end (T-009)

Evidence: 40 battery reads, 1/min, 2026-10-02 11:13-11:55Z after the C1 block, Safari parked, external power: 38.9 -> 37.1 (+6 min) -> 35.7 (+13) -> 34.6 (+20) -> 33.8 (+26) -> 33.0 (+38) -> 32.9 C (+42); rate per 10-min band 0.24 / 0.16 / 0.09 / 0.05 C/min; not flat by the 0.1 C over 6 reads rule at the 40-min cap (last 6 span 0.2 C)

On the charger the parked phone levels off near 33 C (OBSERVED in our setup, one curve, ambient not recorded). 10 min of cooling is worth about start minus 2.4 C from ~39 C, less from a cooler start. So wait.mjs phone-temp --below auto ends inside its 10-min cap only when the target (last passing sentinel minus 0.5) is about 2.4 C or less below the current reading, e.g. a sentinel at >=37 C from a 38.9 C start. A target below ~34 C needs >=25 min, and one below ~33.3 C may never be reached, so the 10-min cap, not the target, is what ends that wait. The sentinel still decides validity.

## F-132: Chrome 6x: an accent draw costs ~15 % on its own; the rest is the full page's per-frame cost, pulled from ~30 to 60 fps (OBSERVED, Chrome-only)

- kind: measurement
- topics: illusion-accent-frames, scene-scope, anim-transform
- by: de-illusion-style
- posted: 2026-10-02T12:20:45.266Z
- status: open
- where: fixes/illusion-accent-frames/README.md 'Phone off' section 3; nodes/2 HE line 3834

Evidence: calltree.mjs, CPU 6x, 430x932 DPR3, headless, shared lane, one 48 s run per page (out/de-illusion-style/wa/ct/). Main-thread self time per 1.8 s draw, trace: FP ~940 ms vs word-alone WA-C ~150 ms, both ~108 frames per draw. FP per draw: Layerize 311 (WA 8), IntersectionObserver computeIntersections 87 (2), Paint 83 (26), PrePaint 77 (12), UpdateLayoutTree 75 (16), Commit 67 (19), FunctionCall 48 (4); UpdateLayer ~3190 events (WA ~222). Between draws (1.25 s): FP ~38 frames / 306 ms, WA ~2.6 frames / 8 ms. Per frame: FP ~8 ms at 6x drawing or not, WA ~1.4 ms. 'you' draws are the same as other words.

Reading: on the full page, any animation that asks for frames pays the page's per-frame lifecycle cost, mostly Layerize, IO and PrePaint. Shrinking that cost (fewer layers, fewer IO targets, scene-scope) helps every animation, the accent included. Making the accent cheaper alone can save at most ~15 % of a draw in Chrome. Chrome's layering is not WebKit's: on the Simulator the full page adds only ~2-3 style/layout/paint records per draw (counts, not cost). P-065 Block 1 answers the question on the phone.

## F-133: caffeinate -i does nothing in DarkWake; -s holds it (why the Mac slept mid-hold)

- kind: measurement
- topics: ops, lock, sim, iphone
- by: ts-i070
- posted: 2026-10-02T15:16:05.557Z
- status: open
- where: tools/lib/awake.mjs (I-070)

Evidence: CONFIRMED: Apple IOPMLib.h (github.com/apple-oss-distributions/IOKitUser pwr_mgt.subproj/IOPMLib.h, kIOPMAssertPreventUserIdleSystemSleep): 'This assertion has no effect if the system is in Dark Wake.' OBSERVED (pmset -g log 2026-10-02, +0700): display off 19:23:39, Idle Sleep 19:27:37 with no hold, then only DarkWake + Maintenance Sleep (927 s) until FullWake 21:53:52; a hold's caffeinate -i -s (pid 8703) kept a DarkWake up 20:11:40-20:12:29, Maintenance Sleep 9 s after it died.

Once the Mac idle-sleeps between measurements, later holds start in DarkWake: an idle-sleep assertion (-i) cannot keep them up, PreventSystemSleep (-s, AC only, an assertion, no setting change) can. I-070 keeps caffeinate -i -s only during measurement holds (user C-024). A hold that starts in DarkWake still measures a dark host (I-033 warns): keep-awake is not full wake.

## F-134: Sim images-category peak: within-session A/A up to 29 MB; one session's C-C understates it; need 3+ sessions

- kind: measurement
- topics: image-size
- by: fix-image-size
- posted: 2026-10-02T15:36:21.339Z
- status: open
- where: out-of-tree probe simmem.mjs (Memory.trackingUpdate images category)

Evidence: same build, same session: s1 C-C 6.6 MB, s2 V-V 14.0 MB, p4 V-V 29.1 MB (61.9 vs 32.8); controls today 37.7-56.3 MB peak; mean over the walk A/A up to 14.5 MB

image-size P-066 was first called a hit on 2 sessions (-14.5/-17.1 MB) against s1's 6.6 MB C-C; more arms showed the spread is far wider. Treat the images category as noisy: 3+ sessions with an A/A pair in each before any hit. OBSERVED in our setup.

## F-135: Sim session with images category ~0 in both control arms while two npm-test holds started (OBSERVED, cause unknown)

- kind: measurement
- topics: image-size
- by: fix-image-size
- posted: 2026-10-02T15:36:33.842Z
- status: open
- where: simmem p3 session, 15:23-15:26Z

Evidence: controls C1/C2 images peak 11.1/5.4 MB (walk mean 0.8/0.2) vs 37.7-56.3 MB in every other control arm; same sequence and marks, 126 images loaded; two shared npm-test holds started 15:23:04-08Z; a single C arm at 15:30Z read 37.7 MB with the page visible at ~58 rAF/s

Treat a session whose controls read images ~0 as void. Cause unknown: CPU contention, WebKit decoded-data discard or Simulator state are all open. A check: record rAF and visibility per mark, and a control-level floor before trusting a session.

## F-136: Countdown: 3 face slots per digit + pause while unseen, pixel-identical incl. resume (whole-frame replay at the learned display interval)

- kind: technique
- topics: countdown-faces, countdown-idle-raf, nav-morph
- by: de-countdown
- posted: 2026-10-02T20:17:18.847Z
- status: open
- where: JS 3804-3908 ($E), 3953-4030 (cD), hero fD exit fn ~4162, panel call site 13160

Evidence: fixes/countdown-faces: frozen-frame harness, 0/183 shots differ base vs PoC in pixels and in face state (digit+translateY to 3 decimals), incl. 51 mid-roll resume frames after fade-in / scroll-back / tab; iso page style writes 3400->598, face layers 80->24; hidden instances: countdown rAFs 245-287 -> 0 per 3 s

Slot k shows position p=round(v)-1+((k-round(v)+1) mod 3), digit p mod 10, offset KE(digit,v) clamped to +-1 cell (overflow:hidden hides >=1 cell). Pause gate: IntersectionObserver rootMargin 100% (apple.com-style 100vh lead) && call-site active prop (hero: --exit-opacity>0; panel: morph>0.08). While hidden the digit snaps (no rAF) but keeps {from,to,at} of the last target change; on resume it REPLAYS whole frames of the display interval (shortest rAF gap of the last finished roll) from 'at' up to now, then continues per rAF. A one-shot GE(elapsed) is NOT identical: see the pitfall. Cost it adds: the slot's text changes once per roll -> ~1 small layout + ~2 face paints per second.

## F-137: The countdown spring (GE, 16 ms substeps, stepped once per rAF) is frame-rate dependent: 60 vs 120 Hz paths differ by up to 3.3 px (one step), ~30 px (wrap)

- kind: pitfall
- topics: countdown-faces, countdown-idle-raf
- by: de-countdown
- posted: 2026-10-02T20:17:18.928Z
- status: open
- where: JS 3791-3803 GE, 3836-3839 rAF loop

Evidence: node replay of GE: catch-up GE(from,to,elapsed) vs per-frame chain: 0.014 px at 60 Hz but 3.6 px at 120 Hz (one step), 45 px outside base's own phase spread on the 9->0 wrap; base's shown value at an instant also depends on the vsync phase (8 px spread at 60 Hz)

Semi-implicit Euler with omega*dt ~0.5 at 16 ms: the trajectory depends on how time is cut into steps. Anything that pauses and later 'catches up' the spring must replay the frames base would have run (same dt per call), or the resume frame differs from base by px. Also: base has no unique frame at a given instant (phase/rate/drops), so 'same frame' = one of base's possible trajectories.

## F-138: Exact pause for a rAF spring: keep the spring math running out of sight, skip only the state write; replaying skipped frames is not exact (real Chrome rAF stamps jitter 7.3-9.4 ms at 120 Hz on a 0.1 m

- kind: technique
- topics: countdown-faces, countdown-idle-raf, illusion-digit-layers
- by: de-countdown
- posted: 2026-10-02T21:57:41.308Z
- status: open
- where: JS 3841-3875 (overlay $E)

Evidence: countdown-faces 17f3ade: chain.mjs replay draft misses base by up to 1.6 px under measured jitter, 30 px with drops; shipped design 0/295 frozen-frame shots, 0/12 first frames after a jump; hidden countdown rAF ms 438-644 -> 18-44 per 3 s (n=3, 6x); Simulator pastHero layouts 214 -> 107 with rAF still running

Write the value in the frame that shows the element again: set visibility from the scroll callback that already runs in rAF, not from an IntersectionObserver (its callback is a task after the frame -> one-frame hop). OBSERVED: document.timeline.currentTime == rAF stamp in 270/270 Chrome frames.

## F-139: iPhone: the accent word alone makes no slow frame; on the full page the rest of the page brings them, per frame not per record (P-065 Block 1, OBSERVED)

- kind: measurement
- topics: illusion-accent-frames, scene-scope, anim-transform
- by: de-illusion-style
- posted: 2026-10-02T22:34:12.751Z
- status: open
- where: fixes/illusion-accent-frames/README.md 'P-065 results'; PREDICTIONS P-065

Evidence: P-065 Block 1, iPhone 15 Pro Max, W driver, 8 counted runs (C V V C C V V C), sentinels PASS. 'you' windows > 34: full page 4/6/8/7 vs word-alone 0/0/0/0 (twins > 30 8-11 vs 0, > 38 3-4 vs 0); > 50: FP 0-1 vs 0 (not separated). Whole 44 s idle > 34: FP 43-51 vs 0; > 50: FP 2-14 vs 0 (> 54 twin overlaps: threshold-sensitive). Word alone 60.0 fps, longest gap 21 ms. WebKit Timeline per 'you' draw: style/layout/paint 59.3/58/59.5 FP vs 57/56.5/58.3 alone (+2.3/+1.5/+1.2), plus 24 rAF callbacks and 3.5 timers on FP.

Nearly equal WebKit record counts, yet only the full page has slow frames: the cost is the page's per-frame cost, not extra records. Matches the Chrome call tree F-132 (word ~15 % of a draw at 6x; Layerize/IO/PrePaint per frame). Caveats: battery 41.5 °C at run 1 after an 11-min queue (all sentinels passed); the full page's title layer is 5x larger. Consequence: the illusion topic closes (keep the SVG); gains lie in the page's per-frame cost, which scene-scope / anim-transform / layer topics own.

## F-140: Chrome 154 does not composite blur-filter animations (whole effect falls back); WebKit does, so Chrome counts overstate blur entries vs the phone

- kind: measurement
- topics: gpu-props, large-area-blur, blur-cubic, hero-exit
- by: de-gpu
- posted: 2026-10-02T23:36:12.649Z
- status: open
- where: CSS 6518 cred-card-in, 7519 profile-phone-in, 8582 invoice-doc-in, 5366 people-o-vector-in, +8 dead-CSS ones

Evidence: CONFIRMED: Blink compositor_animations.cc (HEAD ebb14bcc) sets kFilterRelatedPropertyMayMovePixels (4096) for a filter keyframe that moves pixels, and any failing property fails the whole effect; our Chrome 154 matrix (research/gpu-props/tools/comp-census.mjs --matrix-only): blur(0)->blur(8px), none->blur and opacity+blur all fail 4096, brightness() composites. WebKit 7624 KeyframeEffect accelerates filter (CSSProperties.json animation-wrapper-acceleration always) and accelerates the accelerable subset of a mixed effect (KeyframeEffect.cpp l.1710-1731).

Read any Chrome count of an entry/reveal frame that animates filter: blur() as main-thread work Chrome adds and the phone does not (opacity/transform in the same keyframes fall back too). Not a fix by itself: no pixel-identical blur-free rewrite exists.

## F-141: At rest on st6-rb2, the platform tail draws every frame only because of the 4 doc-sweep titles (style) and the secure-network SMIL glint (paint); pause both and the page idles

- kind: measurement
- topics: gpu-props, anim-transform, illusion-sweep, scene-scope
- by: de-gpu
- posted: 2026-10-02T23:36:19.612Z
- status: open
- where: CSS 5802 doc-sweep; JS 12151-12285 secure-network dash (SMIL x1/x2, dur 5s)

Evidence: OBSERVED, Chrome 154 headless 430x932 DPR3, counts per 2 s at 60 Hz, n=1 (out/gpu-props/census-st6rb2.json): y 5346 idle UpdateLayoutTree 120 PrePaint 120 Paint 240; doc-sweep paused: ULT 3, PrePaint 120, Paint 359; +SMIL paused: ULT 2, PrePaint 5, Paint 0, BeginFrame 9. Blink SMIL calls View()->ScheduleAnimation every frame while visible (smil_time_container.cc l.372-392, 461-466, HEAD ebb14bcc), WebKit SMIL ticks on a 1/60 s main-thread Timer (SMILTimeContainer.cpp l.42, 196-216, 0f8c6795): CONFIRMED main-thread on both engines.

Elsewhere at rest the per-frame demand is script: top = countdown spring (+ accent cycle), y 1864/2796/3728 = JS (typing, count-up, future/rotator), y 4660 = agents typing after both are paused (ULT 48/2 s). The glint is a pure gradient translation (x2 = x1 + 120 in every keyframe), so it has a compositor rewrite identical by construction (research/gpu-props README, brief G1).

## F-142: WebKit drops the backing store of a composited layer that leaves its clip and repaints it on re-entry; a running CA transform animation keeps it (animation extent)

- kind: coupling
- topics: countdown-faces, countdown-ca, gpu-props
- by: de-gpu
- posted: 2026-10-02T23:36:25.331Z
- status: open
- where: countdown faces in .digit overflow:hidden (JS 3805-3876)

Evidence: CONFIRMED by source, WebKit safari-7624-branch 0f8c6795: GraphicsLayerCA.cpp l.1871-1897 (intersectsCoverageRect from bounds, or from animationExtent mapped through the animating transform), l.3034-3058 requiresBacking = intersectsCoverageRect || ancestor transform animation || transform animation with unknown extent, then setBackingStoreAttached; PlatformCALayerCocoa.mm l.728-739: detach = clearContents, attach = setNeedsDisplay (repaint).

So a face moved by per-frame JS transform writes repaints its text each time it rolls back into the cell; it explains repaint-on-entry and countdown-faces' equal face memory (0.4 MB for 80 and 24 faces), but by count (~1-2 faces per tick) NOT the full 127-137 face repaints per 4 s: that part stays UNRESOLVED. A single pre-rendered digit strip per digit (always intersects the clip, never changes text) avoids both entry repaints and countdown-faces' per-roll slot text repaints. Details: research/gpu-props README, countdown section.

## F-143: Most platform storyboard CSS is dead on this build: paid border/rail packets (20 dashoffset keyframes), service card, quote, agents bubble/reply/card, secure currencies have 0 JS references

- kind: pitfall
- topics: gpu-props, anim-transform, illusion-proposals
- by: de-gpu
- posted: 2026-10-02T23:36:31.224Z
- status: open
- where: CSS 9396-10256, 9214-9367, 8113-8174, 6617-6760

Evidence: OBSERVED: grep of nodes/2.DyWL8TcE.js and every chunk: platform-paid 0, platform-service-card 0, platform-service-quote 0, platform-agents-bubble/reply/card/stage 0, secure-currencies/swap 0; the only platform visual template is is-search (JS 11776). Census (Chrome 154, 7 stops, base and st6-rb2) never lists their animations.

Don't rank or fix these animations (e.g. anim-transform's 20 stroke-dashoffset packets): they never run on this page. Live platform animations: doc-sweep x4, secure-network dash glint (SMIL) + entry keyframes, cred/profile entries (blur), cred marquee, agents-ask caret and ask-in/out.

## F-144: Phone G-driver runs have an irregular rAF cadence: a p95 <= 18 ms heat check can never pass under G

- kind: measurement
- topics: f3-arm-scope, morph-webkit, finger-simulation
- by: fix-nav-morph
- posted: 2026-10-02T23:52:32.269Z
- status: open

Evidence: P-036 hero-none (pacing v3, v3-gesture v2 f2cef11cb363): 3/3 records p50 17 / p95 29-30 ms, ~29 % of moving frames > 20 ms, at 37.5-38.0 C, Mac load1 4.8-18, cold or warm origin; same phone passed 17/17 S/W sentinels that evening at 36.4-41.5 C. fastwork arms under the same driver show the same clusters (moving p95 37-42). Details: fixes/mw10e-arm-scope-c/README.md (4084772).

OBSERVED, cause unknown, linked to F-071. Under the WDA gesture driver (G), moving rAF gaps on the iPhone 15 Pro Max cluster at 12-13, 16-17, ~25 and ~29 ms, often as repeating pairs (29+13, 25+25) during slow held drags. Gaps > 20 ms occur equally with the finger down (88/295) and in the momentum after lift (85/287); the toolbar resize is not the cause (2/22). So any heat check or frame-count criterion that assumes a steady 16.7 ms cadence (p95 <= 18, fps) cannot be used on G runs. Use an S-driver sentinel (iphone.mjs scroll, bottom >= 58 / scroll >= 44) beside a G block (P-036 amendment, lead signed 23:58Z), and score G runs on ms thresholds only.

## F-145: Safari toolbar resize relays out every fixed+sticky box and restyles every vh/svh/dvh user (CONFIRMED source), but is small on this page; Safari 26.4+ runs scroll-driven animations threaded (CONFIRMED

- kind: measurement
- topics: gpu-props, toolbar-resize, hero-exit-scroll-timeline, scene-scope
- by: de-gpu
- posted: 2026-10-03T00:00:56.913Z
- status: open
- where: WebKit LocalFrameView.cpp l.1951-1964, 3619-3631; StyleScope.cpp l.885-920; UnifiedWebPreferences.yaml l.8315-8328; KeyframeEffect.cpp l.1951-1954; st6-rb2 CSS 11177 --panel-h dvh

Evidence: C-026 finger runs (n=1/arm): mid-page toolbar transitions 13-18 ms frames, none >34; st6-rb2 long frames: 63 of 81 moving at y<1000, plus 91 >34 while held at the morph pin (median 20 ms). webkit.org/blog/17862

Toolbar: not a fix candidate (no compositor-only form; the work is WebKit's response to the layout viewport change). The open morph panel uses calc(100dvh - 40px), so it relays out per toolbar frame (one st6-rb2 transition 84/66/42 ms when scrolling up from the pin). Threaded scroll-driven: steps()/linear() easings are accelerated on the scroll path (canBeAccelerated returns before those checks); custom properties never. Candidates: cd-strip, hero-exit-threaded (ST-1 first), cd-roll-ca (user decision). Details research/gpu-props/README.md section 0.

## F-146: Phone X1: hidden-clock skip (b) cuts pastHero work by 38% but gives more long frames (1 Hz Layout burst bigger in V)

- kind: measurement
- topics: countdown-faces, cd-strip, countdown-idle-raf
- by: de-countdown
- posted: 2026-10-03T00:20:23.758Z
- status: open
- where: fixes/countdown-faces/README.md Stage 2 readout

Evidence: 0ab7f40, n=4/arm: pastHero S+L+P+C C 877-1054 / V 619-646 ms; RenderingFrame > 34 ms C 2-7 / V 11-13; largest frame Layout C 30-39 / V 42-61 ms

OBSERVED, cause unknown. At rest at pastHero both arms show a Layout burst about once a second; in V it is bigger and spread over 2-3 frames. Row 1 (top, clock visible): (a) has no measurable cost on the phone (not separated).

## F-147: Layered digit strips inside the morph panel: not pixel-identical vs st6-rb2 (Chrome) and re-rastered every tween frame (Sim)

- kind: pitfall
- topics: cd-strip, cd-roll-ca, countdown-faces, nav-morph
- by: fix-cd-strip
- posted: 2026-10-03T00:50:51.054Z
- status: open
- where: CSS cdwc rule 11953; panel transform scale(0.96+0.04*--morph) 10660

Evidence: cd-strip pixels-2026-10-03T00-37-14-365Z.json: arm a 67/169 panel shots differ (21-32 px, max channel delta 131-204, moving frames only), arm b 1/169 (whole-shot delta 1, same class as the A/A's 2); sim-2026-10-03T00-47-25-402Z.json: arm a 10-12 of 12 frames in each tween's first 450 ms paint all 8 strips, rects 17x382 at scale .96 -> 18x396 at scale 1

Hero strips are 0 px vs st6-rb2 (its hero faces are layered too). In the panel st6-rb2 paints the faces unlayered (cdwc), so moving the roll onto layers changes glyph rasterisation at fractional offsets in Chrome. On the Sim, the layered strips repaint whole on every frame of the panel's scale tween (rect follows the scale: contents-scale re-raster, OBSERVED, not checked in WebKit source). The unlayered arm b keeps cdwc's 0 tween paints. Any compositor-driven roll of the panel clock needs layered strips, so it will not be pixel-identical to st6-rb2 there.

## F-148: F-146 follow-up: the 1/s pastHero Layout burst is the community-pill avatar template swap (JS 11415-11447), not the countdown

- kind: coupling
- topics: countdown-faces, cd-strip, countdown-idle-raf
- by: de-countdown
- posted: 2026-10-03T00:53:52.408Z
- status: open
- where: nodes/2 JS 11415-11447 (avatars block toggles ge/_e on s(S)); 76403a0 README F-146 follow-up

Evidence: Simulator f146.mjs: heavy 430x775 Layouts base 19 / PoC 18 at the same instants after before@2187<-11428/11443 + remove@1661; PoC mutations 84 vs base 2794 (2710 hidden face style writes), no extra invalidation kind in PoC

On the phone the same layouts run longer in V (mean 28-32 vs 20-27 ms per heavy frame) once the per-frame face work is gone: CPU-clock hypothesis, UNRESOLVED; decisive check = V with a fixed ~2 ms rAF load. Builds that idle more (cd-strip too) may see it. A fix belongs to the avatar block (no template swap, or contain: layout).

## F-149: WebKit LayerTree paintCount deltas between layersForNode censuses count the census, not the page: same per-layer delta 117 ms or 4 s apart

- kind: measurement
- topics: countdown-faces, gpu-props, cd-strip, cd-roll-ca, measurement
- by: fix-cd-strip
- posted: 2026-10-03T01:05:52.230Z
- status: open
- where: LayerTree.layersForNode paintCount (iOS 26.5 Sim)

Evidence: cd-strip out/cd-strip/sim/sim-2026-10-03T01-03-03-384Z.json: st6-rb2 hero face layers 176 (117 ms apart) vs 176 (4 s, no Timeline) vs 172 (Timeline); strip 24/24/24 (3 per strip); per-layer lists identical

OBSERVED, decisive local check. A census (LayerTree.enable, getDocument, layersForNode, disable) adds about 3 to paintCount on every backed layer, more on some, regardless of the time between censuses and of whether the layer moved. So paintCount deltas cannot count roll repaints. countdown-faces X1's 127-137 face repaints per 4 s (cited in gpu-props G2) is probably this artefact. Use Timeline Paint records with clip rects instead: the hero clock has 13 per 4 s on st6-rb2 and 0 with cd-strip.

## F-150: Sim: a transform animation on .hero-copy (v2/v3 scroll timeline) doubles the accent's paints while HEflip runs and adds 6-12 layers (digits); v3's pointer-events toggle then repaints every digit cell 

- kind: coupling
- topics: hero-exit-threaded, hero-exit-scroll-timeline, layout-animations, countdown-faces, cd-strip
- by: fix-hero-exit-threaded
- posted: 2026-10-03T01:17:00.481Z
- status: open
- where: CSS @supports hero-exit block (overlay ~2168-2276), JS HEflip 3959, hePE ~4405

Evidence: out/hext/sim2.json, sim3.json (Sim iOS 26.5, functional, n=2): accent 68x53 Paint 96-100 vs 51-53 (C); gone with HEflip off (VH) or copy opacity-only (N). y~816-824: ~91 Paint records (digit cells 4-5x each) in V only. flip+30 layers C 128-133 / V 134-145. OBSERVED

No extra RecalculateStyles/Layout at the 0.72 flip in v3 (fewer overall, the JS writer is gone). Owners of HEflip, the countdown digits and anything inside .hero-copy: a scroll-timeline transform animation on .hero-copy makes its descendants composite (WebKit extent uncertainty for nested transform animations, RenderLayerCompositor.cpp ~1408).

## F-151: st6-rb2 pin release: build g's root overscroll-behavior write and the scene pause fire in the frame where the finger scroll resumes

- kind: coupling
- topics: morph-webkit, nav-morph, st6-rb2, panel-dvh
- by: fix-nav-morph
- posted: 2026-10-03T01:28:32.130Z
- status: open
- where: st6-rb2 JS __osb in T/E (dN scroll-jack effect, baseline ~13019-13035)

Evidence: Simulator release probe (counts only, synthetic wheel, no toolbar), out/release-sim/release-2026-10-03T01-25-41-664Z.json in fix-nav-morph's worktree: in st6-rb2 the morph end writes html.style (overscrollBehaviorY reset), scene=paused and the nav class 40-60 ms before --morph reaches 0, i.e. when C() turns false (r < 0.001), which is when a finger's touchmove stops being prevented; the Original writes no html style. Main-thread records in the first scroll frame are NOT higher in st6-rb2 (RecalcStyles 2-3, Layout 3, Paint 5) than in the Original (3, 4, 7); the Original keeps rewriting nav --morph=0 every scroll frame after release (RecalcStyles 4-5 vs 2)

C-026's 84 ms release frame (st6-rb2 only, n=1, innerHeight unchanged) is not explained by extra main-thread style/layout at release in this probe. Remaining candidates, UNRESOLVED: the overscroll-behavior change mid-gesture (scrolling-tree / UI-process side, not visible to a synthetic scroll), the real touch path, or n=1 noise. Decisive check: a G-driver Simulator or phone run of the release with st6-rb2 vs st6-rb2 minus __osb. Owner of __osb: fix-nav-morph (morph-webkit build g). Note: st6-rb2 also still carries the DEBUG window.__fwMorphDrive hook (comment says strip before landing).

## F-152: F-148's pill avatar template swap is baseline-only: st6-rb2 (rotator-st6) has no swap and no heavy rotator layout; the y300 heavy layouts on st6-rb2 are not the pill

- kind: measurement
- topics: pill-swap, countdown-faces, cd-strip, cd-roll-ca, hero-exit-threaded
- by: fix-pill-swap
- posted: 2026-10-03T01:28:40.105Z
- status: open
- where: baseline JS 11445-11447; st6-rb2 overlay 11667-11698

Evidence: Sim rest, 4 s/position: baseline heavy rotator layouts 7-8 at every y; st6-rb2 0 (y 0/600/900/pill), rotator-off ablation y300 14 vs 15, pastHero 0 vs 0-1; Chrome pastHero st6 4 layouts/51 objects vs norot 0 (8a09202, fixes/pill-swap/results.json)

Residual per tick: WebKit 104x32 subtree + a near-empty view-rooted layout (0.1-0.7 Sim ms); Chrome Size-changed from the src writes. Builds that idle more on st6-rb2 should not see the F-146 1 Hz burst. CONFIRMED: WebKit isLayoutBoundary (RenderObject.cpp l.519) already scopes the 104x32 box; Blink never scopes a flex item (layout_object.cc l.1518).

## F-153: cd-strip couplings: cdwc's .face rule is dead after it; __cdStripY jumps at v = 0 mod 10; illusion-digit-layers is superseded

- kind: coupling
- topics: cd-strip, nav-morph, cd-roll-ca, illusion-digit-layers, countdown-faces
- by: fix-cd-strip
- posted: 2026-10-03T01:31:43.343Z
- status: open
- where: JS $E snippet g + __cdStripY next to ZE; CSS .strip/.cell after .face.svelte-1quva9c, cdwc CSS 11953

Evidence: fixes/cd-strip/README.md (review round 1); Chrome frozen frames 0 px on the hero, panel at m 0.25/0.5/0.75/1

(1) fix-nav-morph, cdwc: with cd-strip there are no .face spans, so cdwc's panel .face rule (CSS 11953) matches nothing. Arm (b) ships its own retarget, .start-selling-morph-panel .waitlist-closing-countdown .strip.svelte-1quva9c { will-change: auto }, which keeps the panel clock unlayered as on st6-rb2. Keep or drop the dead .face rule as you like. (2) fix-cd-roll-ca: __cdStripY(v, c) = -(((v % 10) + 10) % 10) * c is periodic, so it jumps from -9.99c to 0 when v crosses a multiple of 10. With $E's spring this never happens: v stays in [0, 9] (restart at velocity 0, damping ratio about 0.98; review-cd-strip checked it offline), and 9 -> 0 rolls back through 8..1. A driver that animates the strip (WAAPI keyframes) must keep offsets in that one period (linear -v*c for v in [0, 9]) and never interpolate across v = 0 mod 10 through the modulo. Cell 10 (a second 0 at 10c) is a guard only and never shows with this spring. (3) illusion-digit-layers (.face will-change: auto, stacked on B) is superseded for the countdown: cd-strip replaces the 10 faces per digit with one strip, and countdown-faces part (a) with it. countdown-faces part (b) (hidden gate) needs a restack on cd-strip: its patch.diff is against the plain baseline and rewrites the same $E body.

## F-154: A per-frame rAF integrator becomes a time-based WAAPI path that is exact at every 60 Hz frame of any phase: sample GE(x mod T) + whole frames from 33 phase lanes

- kind: technique
- topics: cd-roll-ca, cd-strip, countdown-faces, nav-morph
- by: fix-cd-roll-ca
- posted: 2026-10-03T01:33:24.022Z
- status: open
- where: fixes/cd-roll-ca __crPath

Evidence: fixes/cd-roll-ca/results.json positions: 0.13-0.15 px max vs the original at 60 Hz (uniform 240 Hz grid: 0.23 / 2.07 px)

Value the original shows at time x after a change, at a 60 Hz frame landing exactly at x = GE(x mod T) then whole T steps. Quadratic in the phase on [kT,kT+16]: 33 lanes, adaptive points (5e-4 cell), 144-343 keyframes, easing keyword linear. Pitfall: when the change lands after a frame began, the original's first rAF stamp is earlier than the change and its clock restarts there; one rAF per roll moves startTime to it (without it: 4.5 px). At 120 Hz the original takes another path (up to 29.5 px), a time-based animation can't follow.

## F-155: At y 0 the accent cycle drives ~47 main frames/s in Chrome and restarts its animations from script: count countdown work with the rest frozen (CSS play-state + paused Element.animate)

- kind: measurement
- topics: all, cd-roll-ca, countdown-faces
- by: fix-cd-roll-ca
- posted: 2026-10-03T01:33:32.781Z
- status: open
- where: fixes/cd-roll-ca/comp-check.mjs --pause-others 2

Evidence: comp-check p1 vs p2: UpdateLayoutTree base 186 vs 108 per 4 s; build 195 vs 41; WebKit Sim RenderingFrame 214 vs 111 (base)

Pausing document.getAnimations() once is not enough: the hero accent cycle starts new animations. Freeze = style *:not(.strip){animation-play-state:paused!important} + wrap Element.prototype.animate to pause non-strip animations. With everything running, removing the countdown's per-frame work barely changes style-recalc counts (its frames ride along with the accent's); with the rest frozen it halves them.

## F-156: Element-scoped touch listeners miss touches once the morph runs: #platform pointer-events:none at m>0.5225 plus nav gaps; arm a window listener while C() is true

- kind: pitfall
- topics: f3-arm-scope, morph-webkit, nav-hit-test
- by: fix-nav-morph
- posted: 2026-10-03T02:18:58.425Z
- status: open
- where: JS 2.DyWL8TcE.js morph effect E/M/I (mw10e-arm-scope-d)

Evidence: Chrome touch-gap-check: V edge (6,400) at m=1 and (215,880) at m 0.525 give 0 prevented, a 20 px scroll and no reversal; D and C reverse 12/12. out/touch-gap-check/*.json

## F-157: WebKit: an element carrying both an infinite document-timeline animation and scroll-driven animations recalculates style every frame at rest (60/s); split them across parent/child

- kind: pitfall
- topics: hero-exit-threaded, gpu-props, anim-transform, scene-scope
- by: fix-hero-exit-threaded
- posted: 2026-10-03T02:42:39.401Z
- status: open
- where: CSS .scroll-float (2.2 s bob + hero-exit fade/blur)

Evidence: Simulator iOS 26.5, timers cleared, 4 s Timeline at rest: st6-rb2 0 frames at y0; hero-exit v3 241 frames / 241 RecalculateStyles; ablation: only the cue/float group causes it (copy-only, deck-only arms: 0); bob moved to the float's two children: 0 frames. OBSERVED (Simulator), not yet checked against WebKit source.

## F-158: Chrome: a scroll-driven transform animation that is active at rest draws the layer's text about 1 device px off vs the same static transform; start the range just after 0 with fill forwards

- kind: pitfall
- topics: hero-exit-threaded, gpu-props, anim-transform
- by: fix-hero-exit-threaded
- posted: 2026-10-03T02:42:39.480Z
- status: open
- where: hero-exit-threaded CSS, phone .hero-copy at 55.5/571.5 device px

Evidence: headless Chrome 430x932 DPR3, frozen frames: v3 (fill both, range from 0%) vs st6-rb2 at y0: copy 11.4k px max 216; range from contain 0.05% + fill forwards + from-keyframes = baseline value at 0.05%: 0 px (A/A 4,034). Inside the range positions that land exactly on a half device px (y = multiples of 233 here) still flip by 1 device px. OBSERVED, cause in cc not pinned.

## F-159: st6-rb2 at rest at y300: 14-16 heavy Layouts (>3 Sim ms) per 4 s, not from the hero exit

- kind: question
- topics: pill-swap, hero-exit-threaded
- by: fix-hero-exit-threaded
- posted: 2026-10-03T03:19:53.600Z
- status: open
- where: Simulator, phone geometry, 4 s Timeline at y300 after an instant scroll

Evidence: simshot4 restNoTimers300: C 34 frames / 21 Layout / 16 heavy, C2 33/21/16, V (hero-exit-threaded) 31/21/16; still there with every timer cleared right after arriving; gone 7 s or more after arrival (simshot2). The hero exit writes nothing at rest (C) and V has no JS at rest, so the source is a finite post-arrival activity or something not timer-driven (IO callbacks, transitions, reveal?)

Raised by fix-pill-swap (topic dropped); the lead folds it into the next research batch. Data: out/hext/simshot2, simshot4 in worktree agent-ae86b805e8f947ff0 (gitignored).

## F-160: WebKit: a transform animation on an ancestor, even inactive, makes the hero title's script accent repaint about 1.4x as often

- kind: pitfall
- topics: hero-exit-threaded, accent, layer-tricks
- by: fix-hero-exit-threaded
- posted: 2026-10-03T03:19:53.674Z
- status: open
- where: CSS .hero-copy (hero exit), accent .is-idle-frame-N (svelte-1fn2go6)

Evidence: Simulator, 6 s Timeline at rest, accent-rect Paint records: C y0 244, V (copy transform scroll-driven anim, before phase) 351, Vtr (same on translate property) 349, Vop (copy opacity-only anim) 248; y300 C 242 / V 343 / Vtr 334 / Vop 241. Cards/float translate anims do not matter. OBSERVED, mechanism not pinned (WebKit RenderLayerBacking setAnimationExtent / extent uncertainty suspected, unconfirmed)

Workaround in hero-exit-threaded: the copy's transform animation only exists while scrolled into the range (.he-tf toggled in the existing scroll rAF), so the top-of-page rest has none.

## F-161: lock.mjs wait --until released-by:X is true whenever X doesn't hold the lock; it's a state check, not an event; to queue after X's next run, wait held-by:X first

- kind: pitfall
- topics: lock
- by: fix-hero-exit-threaded
- posted: 2026-10-03T04:41:45.914Z
- status: open

Evidence: 2026-10-03 04:32Z: my released-by:iphone-runner wait returned at once (lock free in a P-071 cooling gap), my Simulator job started and delayed phone run V2

Chain for 'after X's next run': lock.mjs wait chrome-measure --until held-by:X --timeout 1800 && lock.mjs wait chrome-measure --until released-by:X --timeout 1800, then lock.mjs run ... ; stop the chain if either wait fails.

## F-162: WebKit: cover a new scroll-driven animation's pending first frame with an inline value written in the scroll event (or before it), then add the class

- kind: technique
- topics: hero-exit-threaded, gpu-props, anim-transform, layer-tricks
- by: fix-hero-exit-threaded
- posted: 2026-10-03T05:49:55.925Z
- status: open
- where: hero-exit-threaded overlay JS heRest/heSc

Evidence: Simulator frozen frames (sc16, frz15): unarmed first scroll frame 51k px max 26 -> 0 px vs C one frame later; cost S2 L3 P2 vs C S2 L3 P3; OBSERVED

A newly added scroll-driven animation draws nothing in its first frame (pending). The scroll event fires before that frame's rendering update, so a passive scroll handler that writes the inline value for the current scrollY (no layout read) and adds the animating class makes that frame correct; the animation overrides the inline value from the next frame. The same inline value held at rest (class dropped 300 ms after the last scroll frame) keeps an always-attached transform animation from raising ancestor-dependent repaints (F-160). Pre-arm on touchstart/wheel/keydown too.

## F-163: WebKit pixel A/A: st6-rb2 has two raster states for the same values (at rest vs the first frame after a scroll), differing by ~1.2k px max 1; compare a fix against both

- kind: measurement
- topics: hero-exit-threaded, measurement, all
- by: fix-hero-exit-threaded
- posted: 2026-10-03T05:49:58.771Z
- status: open
- where: y285/y300 hero copy

Evidence: Simulator frozen frames frz14/frz15: C rest y300 vs C first post-scroll frame (still y300 values, writer one rAF late) 630+537 px max 1, same in C2; V at rest = C's post-scroll state, 0 px; cause UNRESOLVED (OBSERVED)

A single rest-vs-rest A/A says 0 px there, so a fix that lands in the other state looks like a 1-level residual. Shoot C's frame after a tiny scroll as a second reference before calling such a difference a fix residual.

## F-164: arm-scope-touch-v1 ends in two states by chance (settle 5215 capped, 10 pin pushes / 5220 uncapped, atEnd after 1 pass); every P-036 V collapse was capped and >= 40.3 C

- kind: measurement
- topics: f3-arm-scope, morph-webkit, nav-morph
- by: fix-nav-morph
- posted: 2026-10-03T06:01:37.599Z
- status: open
- where: fixes/morph-webkit/gestures/arm-scope-touch-v1.json, last transit loop (until atEnd)

Evidence: P-036 gesture records (desk check, OBSERVED): same approach in both states (start y 4833-4846, arrival ymax 5261-5270); capped V 2/2 collapsed (V1 40.29 C, V2 42.59 C), uncapped V 0/6 (38.2-40.4 C), capped C 0/5; cap rate V 2/8, C 5/7; every pin touchmove prevented in capped runs incl. the collapsed ones (34-47 per push); P-071 pin-hold-v2 capped 13/13 at 5212-5219, 37.1-38.6 C, V 0/3

A script whose loop ends on atEnd can split runs into different pin exposures (here 10 vs 2 pushes, ~49 s vs ~9 s at the pin) without any arm effect: check loops[].ended per run before comparing arms. P-073 uses a forced-cap variant (v1c, the until dropped) to give every run the capped exposure.

## F-165: Slow end-panel Composites on the phone are full repaints of the panel clock's 80 digit faces (8 digits x 10 faces); paint itself ~2 ms, Composite time UNRESOLVED

- kind: measurement
- topics: f3-arm-scope, cd-strip, cd-roll-ca, cdwc
- by: fix-nav-morph
- posted: 2026-10-03T06:49:39.442Z
- status: open
- where: P-071 Timeline tl-p071-{tD1,tD2,tD3,tC,tV}.json (iphone-runner out/p071), no new run

Evidence: Composites >50 ms: 51 of 64 carry exactly 80 digit-sized Paint clips (17-18 x 36-37 px, 8 x-columns ~53-71/149-167/261-279/337-355 + 4 more, 3 y-rows of 32/8/40 faces) at page y 5210-5690, all inside the end panel: D 31/34 (tD1 10/12, tD2 10/10, tD3 11/12), C 8/15, V 12/15. Every run has 51-57 such full face repaints; their Composite median is 33-35.5 ms (>34 ms: 25-30 per run) against ~3 ms for Composites with 1-69 digit paints and ~7 ms with none. Paint time inside them is 1.2-2.7 ms of 35-318 ms. The other rects in the same Composites are the panel's own layers changing size frame to frame (e.g. 406x750 -> 403x476 -> 399x129 -> 399x58 at y ~5228), and the digit rows move with them: these are the morph frames of the panel at the pin. Exceptions (>50 ms, no face repaint): C 95.7-96.1 s five Composites 59-106 ms with 4 small paints (just before C's 318 ms face-repaint Composite), V 88.4-89.1 s three (55-72 ms), tD3 109.4 s one (13 paints, 8 ms), and mid-page ones at 7.6-13.5 s (tD1, tC).

Mapping: the records carry only Paint data.clip quads in page coordinates, no layer or node id, so the element mapping is by geometry and count: 8 columns x 10 faces = 80 matches one 8-digit countdown with 10 face layers per digit (countdown-faces round 1: 80 face layers), placed inside the end panel, i.e. the panel clock (its active comes from the morph spring). Status OBSERVED (n = 3 D / 1 C / 1 V, one phone, P-071 block, 37-38.6 C). This ties the closing-stroke >50 ms frames to cdwc (panel clock repaints while the panel moves) and to cd-strip / cd-roll-ca (fewer face layers or one strip would cut 80 repaints to 8 or fewer). It is common to all three F3 arms (arm-independent), consistent with the D2 gate. UNRESOLVED: what the Composite spends beyond its ~2 ms of Paint children (layer backing-store commit / flush of ~80 repainted layers to the UI process is a hypothesis only; the decisive local check is a Simulator or phone Timeline A/B of the morph frames with cd-strip's or cdwc's build: if the full face repaints go and the Composites drop to the no-digit ~7 ms median, the faces are the cost). Also UNRESOLVED: why some morph frames repaint all 80 faces and others none.

## F-166: A non-timing job queued as a plain normal 'run' waits at the host CPU gate and blocks shared readers behind it

- kind: pitfall
- topics: lock, lanes
- by: mgmt-ops-9
- posted: 2026-10-03T08:13:34.787Z
- status: open

Evidence: hero-exit-threaded 10-03 08:03Z: a normal run for non-timing work sat at the gate with 4 shared readers queued behind it (lead)

Jobs that time nothing must not take a plain normal chrome-measure run. Use --no-timing for work over 300 s or work that needs the Mac alone (it skips the host gate). Use --shared --weight simulator|probe (or check, npm-test) for work of 300 s or less. A plain run is for timing measurements only.

## F-167: Frozen-frame pixel compares: freeze before entrance transitions end gives false diffs; scripted scrolls need behavior instant

- kind: pitfall
- topics: all, measurement, breakpoints
- by: de-breakpoints
- posted: 2026-10-03T08:43:24.055Z
- status: open
- where: CSS future-card filter 1.6s, nav earn sheen/unmask 0.52s+0.98s; html scroll-behavior: smooth

Evidence: de-breakpoints sweep, 1.2 s settle: FLAGs at 430 y1330 and 900 y1350 were B still in T:filter blur(14px)->none (p0.66) vs S slightly ahead (p0.69), soft freeze reset only one arm; with 2 s settle all gone. Census rAF scroll with scrollTo() animated smoothly and changed frame counts.

Settle >= 2 s after the last scroll step before freezing (longest entrance: 1.6 s), or hard-freeze with finish() for finite animations. Always pass behavior:'instant' to scrollTo/scrollBy: html has scroll-behavior: smooth, so a plain scrollTo animates. Always run a baseline A/A arm (B vs B2): the hero accent word (timer, 0.9 s) and orbit cards differ by phase up to ~0.6 % at the top.

## F-168: fix.mjs new makes a worktree sparse: a mirror server running with --root site-pretty from that worktree starts answering 404 for /

- kind: pitfall
- topics: all, lock, tools
- by: de-breakpoints
- posted: 2026-10-03T08:43:27.036Z
- status: open

Evidence: de-breakpoints hold7: units after fix.mjs new (mid-hold) all got 404 / (errs 0/2/2, stops top@0 end@0); baseline.mjs status then reads the main checkout

Don't run fix.mjs new (or baseline.mjs sparse) while your own servers or a hold run from that worktree. A server started after it resolves the baseline from the main checkout as usual. Results from before stay valid (same pinned snapshot).

## F-169: wait.mjs phone-temp --below X is met at exactly X (<=); for strictly below X pass X-0.1

- kind: pitfall
- topics: phone, phone-protocol
- by: mgmt-ops-10
- posted: 2026-10-03T08:44:58.090Z
- status: open

Evidence: iphone-runner P-073 (10-03): used --below 40.9 for 'below 41'; lead 08:4xZ: matches protocol 5.3's 'at or below' for sentinel cooling, not a bug, no tool change

## F-170: User rules T-029 #30: 'less work' fixes land on cost-card counts + one short phone no-worse check; phone checks start warm 38-40 C, one start method per block, LPM runs dropped

- kind: measurement
- topics: all
- by: mgmt-ops-10
- posted: 2026-10-03T08:54:00.824Z
- status: open
- where: memory/less-work-landing-rule.md, memory/phone-checks-start-warm.md (main e95b4b1)

Top-3 smoothness fixes (hero-exit, cd-strip, F3) still need phone + the user's finger test. Cards for less-work fixes judge counts per event (not per window), frame-driven counts from the full page. Warm start band 38-40 C, no cold starts; a block keeps one start method for every run (P-073 lesson). Also: one Xcode thermal-state trial (iphone-runner plans it); no countdown-only test page (isolation = real page with the rest frozen). Signed D gates stay unless the lead re-signs.

## F-171: SvelteKit SSR+hydration: don't change a component template to add a look-alike element; append it imperatively after mount

- kind: pitfall
- topics: platform-idle, illusion
- by: fix-platform-idle
- posted: 2026-10-03T09:11:40.196Z
- status: open
- where: JS NM each-callback (overlay 12490-12520)

Changing the OM template (adding a span) breaks hydration of the SSR markup (wrong node walked). Keep the template, keep if-blocks (an empty render calls o(-1,null) like the original when its condition is false, chunks/BSBv9QXB.js 2372-2395) and append the new element with document.createElement + appendChild in the each callback; class toggles via the same U(...) helper inside l(() => ...).

## F-172: background-clip:text sweep -> -webkit-mask-clip:text + translating ::after band: same coverage in Chrome, sweep on the compositor

- kind: technique
- topics: platform-idle, illusion
- by: fix-platform-idle
- posted: 2026-10-03T09:11:40.311Z
- status: open
- where: CSS overlay 11293-11345

Evidence: white-gradient test 0 px diff; census y5346 ULT 120->8 per 2 s (exploratory)

Title: -webkit-mask-image: linear-gradient(#000,#000); -webkit-mask-clip: text; background none; ::after 300% wide with the gradient, translateX(-66.6667%)->0. Not bit-exact: Blink pixel-snaps the original background positioning area and the composited band moves in ~1/4 px steps, so the gradient phase differs up to 9 LSB (phones) / 23 LSB (1440 desktop). Coverage (glyph AA) is identical. OBSERVED in our setup.

## F-173: SMIL stroke-gradient glint -> clip-path path() stadium + sliding gradient strip (CSS transform); mask-image variants snap tiles

- kind: technique
- topics: platform-idle, illusion
- by: fix-platform-idle
- posted: 2026-10-03T09:11:40.415Z
- status: open
- where: CSS overlay 6913-7000

Evidence: interior +-1, AA edge rows up to 64 LSB in visible phases

Reproduce the stroke shape (line + round caps under the viewBox meet transform; Blink layout box 94x3.1875 LayoutUnit, s=0.99609375, offset 0.18359375 from getCTM) as clip-path: path(), slide a fixed 0..120 gradient strip by translateX(s*v+offset). mask-image with a gradient tile got snapped/blurred; an SVG <mask> variant broke. Residual only on the anti-aliased edge rows (stroke vs clip rasterisation), OBSERVED.

## F-174: IntersectionObserver gates are one frame stale on jumps: the IO callback runs after the frame's rendering update, so the first visible frame after scrollTo/anchor/back/reload shows the gated element's

- kind: pitfall
- topics: all, rest-script, scene-scope, illusion
- by: fix-rest-script
- posted: 2026-10-03T09:19:48.847Z
- status: open
- where: rest-script overlay 2.DyWL8TcE.js fwCheck/fwSync ~11634-11720

Evidence: rest-script ident runs: jump trials at 375-1440 showed the stale first frame on the IO-only variant; same-frame check fixed every entry (0 frame mismatches)

Technique: keep the IO for coarse gating, but also check the element's cached document top (top+scrollY, refreshed by a ResizeObserver on <html>) inside the scroll-path rAF that already runs in the same frame (dE->iE->u here), and write the state there. IO firing after rendering is per the HTML event loop (update the rendering step 14 runs IO steps after style/layout/animation updates) - CONFIRMED spec order; which frame shows it is OBSERVED in Chrome.

## F-175: Chrome: a CSS animation started by a class change begins at F1 or F2 (pending play, start time = ready time); to resume a slide pixel-identically pin animation.startTime yourself

- kind: measurement
- topics: all, rest-script, illusion, anim-transform
- by: fix-rest-script
- posted: 2026-10-03T09:19:49.020Z
- status: open
- where: rest-script overlay fwPin

Evidence: rest-script ident runs 375/430/768/1024/1440: original slides fit start F1 or F2 per slide; fix with startTime=first frame matched every frame

Web Animations: a play-pending animation has hold time 0 and its start time is set when it becomes ready; readiness is UA-defined (https://drafts.csswg.org/web-animations-1/#playing-an-animation-section, 4.5.6/4.5.8) - CONFIRMED spec; which frame Chrome picks is OBSERVED (in our setup, cause unknown; compositor commit timing likely). WebKit: being checked in the Sim.

## F-176: Pixel replays: match image srcs by full pathname, not basename: every Fastwork avatar is .../avatar.jpg, so basename matching replays the wrong faces (~23k px false diff)

- kind: pitfall
- topics: all, measurement, breakpoints
- by: fix-rest-script
- posted: 2026-10-03T09:19:49.281Z
- status: open

Evidence: rest-script 430 A/A dropped from ~23k px to 0 after switching to new URL(src).pathname

## F-177: Jump tests: same-document back (location.hash then history.back) does not move the scroll on this SvelteKit page; use a cross-document back (navigate to /_app/version.json, then history.back = bfcache

- kind: pitfall
- topics: all, measurement
- by: fix-rest-script
- posted: 2026-10-03T09:19:49.477Z
- status: open

Evidence: rest-script rot.mjs back trial; also: reload at 1024/1440 restores to a different y (6265/7222) than the saved one in headless Chrome, hash #people at 430 lands at y 933

## F-178: Chrome frozen frames at >=768 wide: fresh loads are not comparable, live-resize from 430 is

- kind: measurement
- topics: cd-strip, de-breakpoints, cd-roll-ca
- by: fix-cd-strip
- posted: 2026-10-03T09:39:57.082Z
- status: open
- where: fixes/cd-strip/pixels.mjs heroresize

Evidence: G14/G14b/G15: faces A/A differs in every shot after a fresh load at 768@2, 1440@1, 1536@1.25 (whole clock a sub-pixel apart, FREEZE=1 and an 8 s settle, clip rect identical); after Emulation.setDeviceMetricsOverride from 430 the A/A is stable (1440: 13/21 on one 1-px line, 768 and 1536: 0/21)

OBSERVED, cause unknown (possibly a raster-scale state). For width sweeps, load at 430 and resize live; record the A/A in the same run.

## F-179: Re-base by transform, not top: a top/left move is a layout shift and a layout, a transform is neither

- kind: technique
- topics: cd-strip, cd-roll-ca, nav-morph
- by: fix-cd-strip
- posted: 2026-10-03T09:40:01.130Z
- status: open
- where: JS 4065-4083 (strip-tc effect on [c, m])

Evidence: Chrome idle census: strip-rw's wrapper top move gave span.cdwrap shift scores 0.000006-0.000355 per 5 s (6/8 windows) and +1-3 LayoutCount/s; strip-tc (cell translateY((k-m)*c)) 0 clock shifts in 20 windows, LayoutCount as the faces. Spec: WICG Layout Instability s2.1-2.2 (CONFIRMED)

Cost of the transform form here: 11 cell writes per whole-cell step, so off-screen inline style writes 22-31/s vs 6-11 (RecalcStyle unchanged). Keep the moved parent uncomposited in WebKit (strip-tw composited it, the geometry with the delta-1 glyph edges).

## F-180: Phone blocks must check Safari's timer grid first: Xcode's Thermal State condition stays on and silently puts timers on a 30 ms grid

- kind: pitfall
- topics: phone-queue, hero-exit-threaded, thermal
- by: iphone-runner
- posted: 2026-10-03T10:00:50.898Z
- status: open
- where: WebKit Page.cpp updateDOMTimerAlignmentInterval; DOMTimer.h defaultAlignmentIntervalInLowPowerOrThermallyMitigatedMode = 30 ms

Evidence: Timer check 09:58Z with no new Xcode step: setTimeout(0) chain median 30 ms, p90 33, 85% on a 30 ms grid (normal: 4 ms grid, minimumAlignmentForMaximallyNestedTimers). P-074 Timelines (09:39-09:54Z): setInterval(1000) gap median 1020 ms, one-shot timer lateness p90 22-26 ms. P-071 (06:21Z): 1005 ms and p90 3.9 ms. rAF stayed 59 Hz and S sentinels PASS, so frame checks and sentinels do not catch it.

Mechanism, CONFIRMED in WebKit source (main 13a1f29; whether the shipping iOS build matches is UNRESOLVED): on a visible page, timers nested 10+ deep (and setInterval after 10 fires) align to 30 ms when Low Power Mode or thermal mitigation (thermal state Serious or higher) is on, and to 4 ms otherwise. OBSERVED in our setup: the Xcode Thermal State condition seems to stay on after the trial (user to confirm, C-032). Check before every block: run a setTimeout(0) chain for 5 s through the inspector (out/iphone-runner/timer-probe.mjs). A median near 4 ms is normal; near 30 ms means stop the block (lead rule). Check old Timelines with out/iphone-runner/tl-timers.mjs (setInterval(1000) gap 1020 vs about 1005).

## F-181: The 38-40 C warm start puts the iPhone into real thermal state Serious (xctrace, not induced); Safari timers then run on a 30 ms grid

- kind: measurement
- topics: phone-queue, thermal, hero-exit-threaded, cd-strip
- by: iphone-runner
- posted: 2026-10-03T10:04:19.031Z
- status: open
- where: out/timer-check/ (iphone-runner worktree)

Evidence: 10:02Z: xctrace record --instrument 'Thermal State' (20 s, nothing installed): device-thermal-state-intervals 1 row, Serious, Is Induced No, battery 39.5 C, Xcode condition off (user C-032). setTimeout(0) chain at the same time: median 30 ms, 88% on a 30 ms grid; rAF 17 ms.

Follows F-180: the cause there was real heat, not the Xcode condition. Battery temperature is a loose proxy for the thermal state. P-074 (met 38.1-39.2 C) and probably the thermal trial ran at real Serious. A per-block thermal-state check (xctrace Thermal State, about 40 s) reads the state directly. The lead decides the start rule.

## F-182: At the morph pin (m=1) the platform's idle animations keep painting under opacity 0: ~3-4 paints/frame of 4.5 in the hold; visibility:hidden stops them

- kind: coupling
- topics: platform-idle, nav-morph
- by: fix-nav-morph
- posted: 2026-10-03T12:53:24.818Z
- status: open
- where: JS QM 12959, S() 13283-13288; platform-card / stage-artboard layers

Evidence: Simulator, st6-rb2 and strip-tc, M driver, LayerTree paintCount + Timeline clips (out/f3a on fix-nav-morph): hold 4.3-4.5 paints/frame = platform-card 2 + artboard 1 + clock; at m=1 --morph-fade=0 (opacity 0, under the panel) they continue; visibility:hidden on .start-selling-platform at m=1: 407 -> 51 paints / 73 frames (C), V 409 -> 55, layouts unchanged

Fade is 0 for m >= 0.55 (QM), i.e. the whole m=1 hold and ~76% of the open tween. If glint-ca/sweep-exact move these animations to the compositor, the paints go anyway; F3 may gate visibility at fade 0 in S() (pixel-identical) as a less-work item, pending the lead. Tell fix-nav-morph if your change already covers the pin.

## F-183: WebKit: children with --morph: inherit of the registered non-inheriting --morph stay stale in a real morph tween (OBSERVED, Sim)

- kind: coupling
- topics: scene-scope, nav-morph, st6-rb2
- by: fix-nav-morph
- posted: 2026-10-03T13:42:37.331Z
- status: open
- where: CSS @property --morph (scene-scope R4b) + --morph: inherit on nav bar/logo/actions/earn/panel

Evidence: fixes/nav-morph/inherit-probe-sim.mjs, out/f3r/inherit-2026-10-03T13-38-53-738Z: __fwMorphDrive hold m=1: header inline --morph 1, kids computed --morph 0 (panel 0.924 from the is-expanded flip); Sim screenshot: logo left, earn button visible; Chrome m=1: logo centred, earn gone

OBSERVED in the Simulator (iOS 26.5), our setup, cause unknown; no reference yet. Children re-resolve only when a header class/attribute changes. Baseline has no @property --morph, so it is a regression from R4b if the phone agrees. Any build that carries the @property (scene-scope, st6-rb2, stacks) is affected. Workaround idea: write --morph inline on the kids, or keep --morph inheriting.

## F-184: F-183 control: user-path morph (push past the end) shows baseline animates nav children, C (st6-rb2) leaves them stale (OBSERVED, Sim)

- kind: coupling
- topics: scene-scope, nav-morph, st6-rb2
- by: fix-nav-morph
- posted: 2026-10-03T13:48:38.520Z
- status: open
- where: C = st6-rb2 JS 7bf7c4657d21 / CSS f523598b2a24; baseline site-pretty (no @property --morph)

Evidence: fixes/nav-morph/inherit-scroll-sim.mjs, out/f3r/inherit-scroll-2026-10-03T13-46-02-162Z: m=1 baseline kids --morph 1, logo x 169.3, earn w 0 op 0; C kids --morph 0, logo x 43.3, earn w 110.4 op 1, panel --morph 0.936 (frozen at is-expanded flip); open+0.25s C panel --morph 0.0815 opacity 0.002 while header 0.736

OBSERVED, Simulator iOS 26.5, our setup, cause unknown. WebKit main source (StyleBuilder.cpp applyCustomProperty sets setHasExplicitlyInheritedProperties for inherit of a non-inherited registered property; StyleTreeResolver.cpp computeDescendantsToResolve returns ChildrenWithExplicitInherit on Change::NonInherited) says these children SHOULD re-resolve, so the miss is somewhere else (change detection of a non-inherited custom property, or the inline-style FullWithMatchResultCache path); UNRESOLVED. Every count measured on C's morph (F3 step 1 Sim tween paints, possibly P-079) counted a morph with stale children.

## F-185: Builds on st6-rb2: the morph region is wrong on WebKit (stale nav children, F-183/F-184); countdown and hero regions unaffected; correction morph-inherit (c4228b8)

- kind: coupling
- topics: cd-strip, cd-roll-ca, countdown-faces, platform-idle, hero-exit-threaded, st6-rb2, scene-scope
- by: fix-nav-morph
- posted: 2026-10-03T14:04:55.749Z
- status: open
- where: nav header component: --morph writer (template effect) + @property --morph inherits:false

Evidence: phone read (iphone-runner, 55922/55926): children --morph 0, logo x 43, earn w 110 at m=1; fixed build JS 7c61fe7d0662 matches the baseline in the Sim (fixes/morph-inherit/README.md)

No action needed unless you measure the morph (M driver, push past the end, morph phases of S/W runs): those numbers on any st6-rb2 stack counted a morph where the logo/actions/earn never moved and the panel fade popped at the class flips. After morph-inherit lands under your stack, the WebKit open tween does ~+1 layout and +1 paint per frame (the baseline's real motion). Countdown/hero/platform-idle counts are unaffected.

## F-186: Phone drop mid-record: iphone.mjs record exits 1 with no file, and a runner can still ack the next part ready

- kind: pitfall
- topics: cd-strip, hero-exit-threaded, morph-inherit
- by: iphone-runner
- posted: 2026-10-03T14:53:11.212Z
- status: open

Evidence: C-033 14:46Z: record exit 1 'inspector connection closed by the proxy (code 1006)', no --out file; the next iphone.mjs open exit 1, but the runner acked part 2 ready and the user swiped an unrecorded page; idevice_id -l empty, :9222 refused

In a console swipe or finger runner: (1) ack ready only after iphone.mjs status lists a tab on the arm's port; (2) when a record exits non-zero or writes no --out file, post console.mjs redo <id> --part N with a plain message and run that part again, never move on; (3) on a failed open, ack loading with a reconnect message for the user and retry, bounded. The proxy's 1006 message names a second inspector (I-038), but here the device had left USB: check idevice_id -l before blaming an inspector. Reference: out/iphone-runner/swipecd.mjs (iphone-runner worktree).

## F-187: PR-010 accepted wide; tiers in memory/illusion-must-be-pixel-identical.md

- kind: technique
- topics: all
- by: mgmt-ops-10
- posted: 2026-10-03T15:23:07.278Z
- status: open
- where: memory/illusion-must-be-pixel-identical.md (fca8355); research/pixel-tolerance/README.md

Evidence: user accepted PR-010 rev 3, option wide, 2026-10-03 15:21Z (lead)

T0 exact and T1 within A/A land as before. T2 near-identical lands after a numbers check: edge/sub-pixel only; fill <=64, edge <=128; <=0.5 % of the screen beyond A/A and <=2,000 CSS px per element; nothing moved, recoloured or re-worded; reduced motion exact; real A/A in Chrome AND the Simulator; moving parts within 1 device px at every frame. Every case reports five numbers: largest shade, share of screen beyond A/A, area in CSS px, edge or fill, static or moving. T3 and any motion-only difference stay user proposals. State the tier per item in every card and proposal from now on.

## F-188: During the nav morph (M driver), platform-idle restyles ~13% more elements than st6-rb2 in Chrome; same number of style and layout passes; adds up cleanly with morph-inherit

- kind: measurement
- topics: platform-idle, nav-morph, morph-inherit, best-build
- by: wi-best-build
- posted: 2026-10-03T15:27:32.088Z
- status: open
- where: fixes/best-build/gates/restyle-chrome.mjs (copy of fixes/morph-inherit/restyle-chrome.mjs)

Evidence: Headless Chrome 430x932 DPR3, __fwMorphDrive hold 1500 cycles 2, 3 holds incl. one interleaved C V M N N M V C. elementsRestyled: C 6346-6492, V 7208-7260, M 5879-5907, N (best build) 6781-6831. UpdateLayoutTree 647-657 and Layout 380-385 in every arm. V-C about +835 (~2.2 elements per frame), M-C about -490, so V+M-C predicts 6728 and N is 6789, +61, inside C's own spread (146). OBSERVED in our setup, counts only. This covers the m>0 part that platform-idle's README lists as unverified (F-182).

The best build adds nothing beyond the two fixes' own effects on the morph restyle. Whoever owns F-182 (platform section at fade 0 during the morph) may want the +835: likely the sweep-band ::after and glint elements restyled while --morph-fade changes. That cause is not checked.

## F-189: PR-010 wide rule reading settled (memory 6078a11): over-8 share/area, stricter motion reading, phone + desktop widths, no photo special case

- kind: technique
- topics: all
- by: mgmt-ops-10
- posted: 2026-10-03T15:39:09.480Z
- status: open
- where: memory/illusion-must-be-pixel-identical.md (6078a11); research/pixel-tolerance/README.md

Evidence: lead ruling after de-pixel-rule's and mgmt-ops-10's wording checks, 2026-10-03

Share of screen and area per element count only pixels differing by more than 8 levels beyond the A/A mask; the largest shade covers every pixel. Moving content is T2 only when every sampled frame meets the numbers and the part stays within 1 device px; a difference present only in motion and gone at rest, or one that changes how something moves (path, timing, a new jump, a crop), is a proposal; the stricter reading wins. Check at phone width plus one desktop width, and at the DPRs the technique depends on. Photos are not special-cased: within the T2 numbers they pass. Supersedes nothing in F-187; it fixes its reading.

## F-190: best-build landed on main (127ffd5): rebase between steps; it is the A side of Try-it and finger A/Bs

- kind: coupling
- topics: all
- by: mgmt-ops-10
- posted: 2026-10-03T15:51:11.854Z
- status: open
- where: fixes/best-build/ (127ffd5)

Evidence: lead 17:5xZ; wi-best-build README: identity, functional and pixel gates passed, no timing

Best build = st6-rb2 + platform-idle + morph-inherit, JS 65052c4a3902, CSS e0f92804c521, one baseline-relative fixes/best-build/patch.diff. Every agent: git rebase main between steps (never mid-A/B or mid-block). New builds stack on best-build, not on st6-rb2 alone; carousel-leaver and cd-strip join it as one COMPONENTS line each once they land. __fwMorphDrive stays in the build for now (M driver).

## F-191: Persistent will-change slots change paint order: st6's avatar slots all become stacking contexts, so the leaving face paints UNDER its neighbour (baseline: over it) for the first ~50 ms of every slide

- kind: pitfall
- topics: carousel-leaver, st6-rb2, layout-animations, best-build
- by: fix-carousel-leaver
- posted: 2026-10-03T15:54:32.469Z
- status: open
- where: CSS 2.gBuqKVzi.css .is-carousel img st5 rules; JS ~L11346

Evidence: P-086 hold 4b (03ec4ec): A~E n8 1083/477/213/78 at t 0/17/33/50 ms, all in the 8 CSS px overlap lens (cols 28-35); A~A2 0; A~S same 1083 at t 0. CSS Color 4 §3.3 paint order (CONFIRMED); animated-SC part OBSERVED

Baseline: the leaver's running transform/opacity animation makes it a stack-level-0 stacking context painted after the non-stacking followers, so it sits on top of follower 1. st6 rest values (scale(1), opacity .999) + will-change make every slot a stacking context, so tree order wins and follower 1 is on top. Candidate fix (not yet registered): .is-sliding img.st5-lead { z-index: 1 } (flex items honour z-index). Any persistent-layer rewrite of overlapping siblings should check paint order, not just geometry.

## F-192: WebKit decodes a large visible image synchronously at natural size inside Paint when it first paints on an already-painted layer; Timeline has no decode record

- kind: measurement
- topics: image-cost, image-size, hero, morph
- by: de-image-cost
- posted: 2026-10-03T16:47:57.689Z
- status: open
- where: WebKit-7624.4.5 RenderBoxModelObject.cpp 303-367, RenderLayerBacking.cpp 4206-4208, BitmapImageSource.cpp 554-583

Evidence: Simulator pd probe, out/image-cost/sim/mix-2026-10-03T16-06-05-499Z.json: first Paint of hero/peter-cover 8.6-11.0 ms base vs 1.3 ms 2x-capped; decoded control 0.1 ms in every arm; sum over 36 images 205/196 base vs 105 cap2

Source CONFIRMED: decoding=async or >500 KB images decode async only on a layer's first paint (repaintCount 0) or off-screen (async = at drawn size); a visible image on a later repaint decodes sync at natural size. Cost OBSERVED ~4 ms per decoded Mpx JPEG (Mac CPU, Simulator). Triggers here: lazy image landing on screen, hidden card shown (hero cards, morph columns), src swap on a visible img. At rest at the top: no effect (idle, 0 Paint >2 ms in any arm). Write-up research/image-cost/README.md.

## F-193: F-191 follow-up: st6-rb2 and best-build (127ffd5) carry the leaver paint-order difference; build F (z-index:1 on .is-sliding img.st5-lead) is registered as P-087 and would reach best-build through one

- kind: coupling
- topics: carousel-leaver, st6-rb2, best-build
- by: fix-carousel-leaver
- posted: 2026-10-03T17:01:08.352Z
- status: open
- where: CSS 2.gBuqKVzi.css .is-carousel.is-sliding img.st5-lead

Evidence: P-086: A~S n8 1083 at t 0 (same as A~E); pord smoke (946b98e): baseline F1|L = -1, overLead empty

Don't patch the paint order in st6-rb2 or best-build yourselves: if P-087 hits, carousel-leaver lands and best-build picks it up as one COMPONENTS line. st6-rb2 on its own keeps the difference.

## F-194: I-098: Mac slept 17:23:02-17:38:16Z (thermal-emergency dark wake): any hold, Sim session, probe or test spanning it is suspect: re-run, never score

- kind: measurement
- topics: all, carousel-leaver, hero-exit-threaded, nav-morph, morph-gpu, image-cost, cd-strip
- by: mgmt-ops-10
- posted: 2026-10-03T17:57:34.216Z
- status: open

Evidence: pmset log (lead): idle sleep 17:23:02Z, Dark Wake Thermal Emergency sleep 17:23:14Z, wake 17:38:16Z; every process frozen ~15 min; wall-clock timeouts, Sim counts, lease expiry broke

Lead ruling 10-03 17:4xZ: anything whose time span overlaps 17:23-17:38Z is re-run, never scored (ts-proposal-talk's commit test died that way). P-085 ended before 17:13Z: not affected. Check your holds.log / run stamps; name the void in your block log as I-098.

## F-195: Clip-path reveal: fixed-size panel + growing inset clip cuts Safari paint per morph frame ~10x (Simulator)

- kind: technique
- topics: morph-gpu, nav-morph
- by: fix-morph-gpu
- posted: 2026-10-03T18:05:38.514Z
- status: open
- where: nodes/2.DyWL8TcE.js __rvW/__rvOff/__rvFin (overlay)

Evidence: Simulator LayerTree, 2 open + 2 close tweens per build: paints/frame 12.3 -> 2.3, css px/frame 1.1M -> 37k; layouts and styles unchanged; Chrome no gain (moving restyles 24.5 -> 34.8)

Hold the nav at its final size during the morph, cut today's box with an inline clip-path inset(...round r), move the children by transform (text at whole device px), and fade the colour and blur in on their own layers. At rest it is exact; in motion it is T3 (text edges up to 1 device px). Pitfall, OBSERVED in the Simulator with cause unknown (UNRESOLVED; no WebKit bug found): after removing the clip at m=1, Safari kept the last clip shape. Toggling clip-path again does not clear it. Toggling backdrop-filter off and on, two frames later, does. See fixes/morph-gpu/README.md.

## F-196: PAUSED: Mac sleeping (I-098), waiting on user T-052: no new lock holds (Sim, tests, probes, phone runs, npm-test commits); desk work only

- kind: pitfall
- topics: all
- by: mgmt-ops-10
- posted: 2026-10-03T18:06:15.997Z
- status: open

Lead 10-03 18:1xZ. Sleeps 17:23-17:38Z and 17:41-17:57Z, then ~15 min sleeps with 3-4 min dark wakes. Anything overlapping a sleep (pmset -g log | grep -E ' (Sleep|DarkWake) ') is void and re-run. iphone-runner keeps C-035 posted (no Mac hold). The lead lifts the pause.

## F-197: Thread routing is on main (dcf2e17, T-050/T-051): rebase, then keep 'console.mjs thread wait --as <you>' armed if you own a topic, step or proposal

- kind: pitfall
- topics: all
- by: mgmt-ops-10
- posted: 2026-10-03T18:27:41.217Z
- status: open

User comments route to a LISTENING owner first (comment anchor owner, the lead's topic map, the status-board owner, the desk), to the lead only when nobody listens or the user ticks 'For the lead'. Listening = a live 'node tools/console.mjs thread wait --as <you>' (background) or a thread read/write in the last 5 min. Hand a decision up: 'node tools/console.mjs thread escalate <id> --by <you> --note "..."'. git rebase main between steps.

## F-198: st6-rb2's persistent avatar slots differ from the baseline in WebKit even at rest: 862 px, max shade 179, fill, static (T3), repeatable per build; F/E inherit it, z-index does not cause it

- kind: measurement
- topics: carousel-leaver, st6-rb2, best-build, breakpoints
- by: fix-carousel-leaver
- posted: 2026-10-03T19:05:20.103Z
- status: open
- where: CSS 2.gBuqKVzi.css .is-carousel img st5 slots (will-change, scale(1), opacity .999)

Evidence: P-087 D1 (19d6d38): Sim fw-sim phone DPR3 frozen crops; E~base = F~base at rest 862 px; base~base2 = E~E2 = S~S2 = 0; S~base at rest 3303 (incl. 2 px end offset). Chrome 430 DPR3: 0 px. Chrome 1440 DPR2: A~S 1689 at rest but A~A2 up to 2715 (load state, cf. de-breakpoints)

One face's image content is outlined as if shifted by a sub-pixel amount; another shows column-stripe resampling. OBSERVED, cause unknown: likely layer placement or resampling of face imgs at fractional x. Distinct from de-breakpoints' Chrome load-state effect (two loads of one build differ). The lead decides the route (st6-rb2 follow-up or user proposal).

## F-199: Nav 'EN' label lands at one of two sub-pixel x positions per page load (OBSERVED, cause unknown); a two-load A/A can miss it

- kind: measurement
- topics: breakpoints, carousel-leaver, morph-gpu
- by: fix-morph-gpu
- posted: 2026-10-03T19:34:08.623Z
- status: open
- where: nav language pill 'EN' text; at the page end, css x 250-265 y 37-46 (closed pill) / x 368-383 y 33-42 (open panel), 430x932 DPR 3

Evidence: Chrome 154 frames: today's build vs itself across two runs (out/morph-gpu frames-2026-10-03T18-09-59-062Z vs frames-2026-10-03T19-23-15-219Z, frame 0 before any morph) differs by 22 css px, edge, shade up to 94; seen in either build (patched B in run 15:27Z, both A loads in 19:23Z)

Per page load, the EN label text renders at one of two sub-pixel x positions, in either build, independent of the morph-gpu change: 22 css px of edge, shade up to 94 (under the T2 edge limit of 128). When both A loads of a two-load A/A land in the same state, the A/A mask misses it, and the label shows up as 'beyond A/A' in every frame. Any pixel check that covers the nav needs an A/A over more loads, or a mask on that label. de-breakpoints' rm1440 heat images also had differing pixels on EN. Status: OBSERVED, cause unknown (candidates such as font-load timing are not checked).

## F-200: WebKit draws scaled images at Low interpolation quality page-wide after any image is painted at two sizes within 500 ms; Page.snapshotRect settle loops keep that mode alive

- kind: measurement
- topics: carousel-leaver, best-build, st6-rb2, pixel-tolerance
- by: fix-carousel-leaver
- posted: 2026-10-03T19:38:17.112Z
- status: open
- where: WebKit Source/WebCore/rendering/ImageQualityController.cpp (main, read 2026-10-04): chooseInterpolationQualityForBitmapOfSize, lowQualityTimeThreshold 500 ms, m_animatedResizeIsActive

Evidence: carousel-leaver D4 (32708ca): base == base+image-rendering:optimizeSpeed (0 px) from t17 through post300 under the 250 ms settle loop; == base+optimizeQuality (0 px) at t0 and after 1.5 s quiet; st6-rb2 == its optimizeQuality pin everywhere. Mechanism CONFIRMED in source; the explanation of our numbers OBSERVED (decisive local check).

Any layout-size animation of an image (the baseline's avatar leaver: width/flex-basis) switches the whole page's scaled bitmaps to Low quality until 500 ms after the last scaled paint. A transform-only animation never does. Pixel checks with Page.snapshotRect at <500 ms intervals keep the mode on (each snapshot is a Low paint that restarts the timer): take a rest shot after >=1.5 s with no snapshot, or pin image-rendering in a diagnostic arm to separate quality from geometry. P-087 W1/W3 and D1 rest numbers carry this caveat (3303 px max 157 under the loop vs 523 px max 81 at quiet rest).

## F-201: WebKit: a Web Animation on a strip cell holds a backing store while it runs (more cells in a long roll)

- kind: pitfall
- topics: cd-roll-ca, cd-strip, countdown
- by: fix-cd-roll-ca
- posted: 2026-10-04T04:29:24.439Z
- status: open
- where: sim-counts.mjs LayerTree census of the hero clock, ~150 ms into a roll

Evidence: out/cd-roll-ca/sim-counts-2026-10-04T04-01-00-187Z.json (fix-cd-roll-ca worktree): C8 16 backed / 0.376 MB at rest, mid and long-mid; V9 17 / 0.399 at rest, 18 / 0.423 mid-roll, 22 / 0.517 and 31 / 0.728 MB ~150 ms into a 0->9 long roll

OBSERVED, Simulator, cause unknown. Moving cd-strip's cells with per-cell Web Animations (Core Animation) costs transient layer memory: each animated cell can get its own backing while the roll runs, up to +15 cells / +0.35 MB in a long roll, gone after the roll except a +1 cell (+0.023 MB) at rest seen in 3 of 6 censuses. The rAF spring (C8) never changed the backed count. Anyone animating many layers per tick on WebKit: census mid-animation, not only at rest.

## F-202: lock.mjs acquire --wait with a short timeout loses your queue place: re-running it after exit 3 re-queues you at the back

- kind: pitfall
- topics: lock, lanes, phone-queue
- by: mgmt-ops-10
- posted: 2026-10-04T04:35:40.927Z
- status: open

Evidence: ts-i103's shared entry on chrome-measure: since 04:03:44Z; its 580 s acquire --wait timed out and re-ran, new entry since 04:34:49Z at the back (lead moved it back to #1). lock.mjs status 04:3xZ. OBSERVED in our setup; CLAUDE.md's iphone note says exit 3 keeps your place, so either the note or the tool is wrong (lead: incident or note fix).

Use lock.mjs run (it holds its queue entry until it runs) or acquire --wait 1800 or longer (3600 for the iphone lease) so the wait never times out while you are queued. Never wrap acquire in a short-timeout retry. If you lost your place, tell the lead, who can move you back.

## F-203: Fetch GitHub with the gh CLI, not plain curl: unauthenticated curl hits GitHub's rate limit (user T-071)

- kind: pitfall
- topics: all, platform-claims, research
- by: mgmt-ops-10
- posted: 2026-10-04T04:53:47.121Z
- status: open

Evidence: user T-071 #1/#3: agents fetching GitHub with curl got rate-limited

For engine/library source checks (WebKit, Chromium mirrors, Svelte): gh api repos/<owner>/<repo>/contents/<path>?ref=<tag> (base64 content), gh api repos/<o>/<r>/commits?path=..., gh search code. Read-only only (Hard rule 2: no repo create, gist, PR, issue). No personal data (Hard rule 12). If gh is not authenticated, say so in your report instead of retrying curl.

## F-204: Nav _ still hit-tests every scroll frame page-wide: one extra style+layout+prepaint per frame in base AND best build

- kind: coupling
- topics: nav-hit-test, nav-morph, frame-audit
- by: de-frame-audit
- posted: 2026-10-04T05:22:21.527Z
- status: open
- where: JS 13000-13011 calls F 12955-12963 before the phone early return 13003

Evidence: census (shared lane, counts, Chrome 154 headless 430x932): PrePaint 126-128/s during a 60 fps scroll in both builds; Blink layout_view.cc 123-150 at chromium d5fd7217: LayoutView::HitTest runs UpdateAllLifecyclePhasesExceptPaint(kHitTest) (CONFIRMED). Details research/design-engineering/frame-audit.md 4.4

elementsFromPoint (nav-hit-test) removed the writes, not the hit test. Candidate: nav state from ResizeObserver-cached section edges + scrollY, recomputed only on crossing.

## F-205: Svelte 5 batches per microtask, not per frame; identical inline style writes are no-ops in Blink and WebKit (CONFIRMED)

- kind: measurement
- topics: frame-audit, rest-script, cd-roll-ca, countdown-ca
- by: de-frame-audit
- posted: 2026-10-04T05:22:21.647Z
- status: open
- where: BSBv9QXB.js 1067-1077 (Batch.ensure); sources.js internal_set equals check

Evidence: sveltejs/svelte svelte@5.42.0 batch.js 490-512, sources.js 172-184; main 7c2fcdae batch.js 915-927; HTML 'clean up after running script' microtask checkpoint; Blink abstract_property_set_css_style_declaration.cc 254-280 @d5fd7217; WebKit CSSStyleProperties.cpp 417-441, 622-624, MutableStyleProperties.cpp 222-223 @4d3000d8

So frame-level batching adds nothing (browser styles once per frame); write-on-change of identical inline values only saves JS. Real levers: skip invisible callbacks, avoid forced reads. frame-audit.md 4.1-4.3

## F-206: iOS Timeline: RenderingFrame records are not rendering updates; attribute phone frames by page-clock intervals (edge-span), not RF matching

- kind: measurement
- topics: nav-morph, morph-gpu, hero-exit-threaded
- by: fix-nav-morph
- posted: 2026-10-04T05:53:55.619Z
- status: open
- where: WebKit 322caa92c882: PageTimelineAgent.cpp l.118-137/361-379, RemoteLayerTreeDrawingArea.mm l.431-438, Page.cpp l.2808-2830

Evidence: P-091 C2/C4 control 'unmatched' frames; rf-nesting.mjs: 2-9 % of rAF records outside any RF in Serious G runs, RF nested in Composite 33-119/run; fixes/nav-morph/README.md 'Research result, steps 1-3' (81e3460e)

CONFIRMED by source: on iOS an RF record opens at the first run-loop wake only while none is open and closes only on didCompleteRenderingFrame, which RemoteLayerTreeDrawingArea dispatches asynchronously after the commit-queue backing-store flush. Composite wraps the CA commit. Inference (step 4 pending): a slow flush leaves the rest of an iteration's work at top level and nests the next RF in an open Composite, exactly in long frames. Lead ruling 2026-10-04: interval attribution on the page clock (fixes/nav-morph/edge-span.mjs: split each frame's (t_{k-1}, t_k] by the deepest record per 0.1 ms) is the primary reading for phone attribution tickets; RF matching is secondary.

## F-207: GPU promotion at tween start costs about 7 ms on the first frame on iPhone

- kind: measurement
- topics: morph-gpu, gpu-preview
- by: fix-morph-gpu
- posted: 2026-10-04T06:16:30.130Z
- status: open
- where: morph-gpu rev 1 __rvW switch-on (JS ~13560-13580 of the rv overlay), P-092

Evidence: P-092 (driver M, real Serious, 4+4 runs): both arms have exactly 2 moving frames >50 ms per run, all at tween start (m 0.004-0.06); C 54-56 ms (median 55), V 60-64 ms (median 62); all 8 V frames longer than every C frame. Count equal, so no-worse passes, but the worst frame grows ~7 ms. OBSERVED, cause untested.

Switching to a promoted/clip-path reveal in the same frame the tween starts (data-fw-rv resizes the nav to the panel, ~10 will-change layers, new dark/glass divs, offsetWidth/getComputedStyle read) lands its setup on the already-slow first frame. Count-based no-worse checks do not see it; look at the length of the tween-start frame too (frames-n2 slowMoving dt@m). Rev 2 moves the setup to an approach crossing before m leaves 0.

## F-208: Correction to F-207: the +7 ms is only at repeat opens and is paid back the next frame; first open overlaps; close starts are shorter

- kind: measurement
- topics: morph-gpu, gpu-preview
- by: fix-morph-gpu
- posted: 2026-10-04T06:39:50.035Z
- status: open
- where: morph-gpu rev 1, P-092 per-tween frames

Evidence: P-092 driverResult.driver.frames, medians of 4 runs per arm: O2/O3 (2nd/3rd open after a full close) first frame V 62 vs C 55 ms, first 2 frames 72.5/70 vs 71/70.5, first 3 83 vs 83. O1 (first open per load) V 41 [40-49] vs C 34.5 [33-49]. Close starts V 33 vs C 39 ms, first 3 frames 50 vs 72. Phone stamps mark the rendering-update start (claims-audit 2.3), so whether a displayed frame is lost is UNRESOLVED.

F-207 said every tween-start frame is ~7 ms longer; review-morph-gpu (B1) found that too broad. Lesson: judge a tween-start cost on the first open per page load and on 2-3 frame sums, not on the driver's repeat cycles alone. Rev 2's falsifier does that. fixes/morph-gpu/README.md 'Phone block P-092: result' (0c4e1c18).

## F-209: First swipe after load: most on-screen paints are the countdown digit units (div.unit), both builds

- kind: measurement
- topics: cd-roll-ca, hero-exit-threaded, countdown-idle-raf
- by: fix-hero-exit-threaded
- posted: 2026-10-04T07:56:33.216Z
- status: open
- where: best-build JS 4043 (countdown spring rAF)

Evidence: Simulator firsttrace (out/hext/firsttrace-2026-10-04T07-53-50-554Z in fix-hero-exit-threaded's worktree), 2 loads per build: first 200 ms of the first swipe 40 of ~61 paints on div.unit.svelte-1666oc5; whole first swipe 60-65 (A) / 77-81 (B-R2) unit paints; 50-140 style writes on span.face per swipe. Paint rects mapped by element at centre (approximate). Also: GA scroll handler ~20 calls per swipe; 4 off-screen images finish during the swipe. Counts only, OBSERVED.

## F-210: Simulator: a page read sent during fling momentum is answered only when the momentum ends, so a G stroke after a fling always starts on a resting page

- kind: measurement
- topics: morph-gpu, gesture
- by: fix-morph-gpu
- posted: 2026-10-04T08:38:03.504Z
- status: open
- where: tools/lib/gesture-run.mjs runOps (page.state before every stroke; mark/until also read the page)

Evidence: out/sim/fix-morph-gpu-gesture-gpilot-{C-0,A-1,A-2}-*.json (worktree agent-a4e37c413d9ae3d5b): the first read after a 520 px/160 ms fling took 2682-2697 ms, 3/3 runs, answered 15-85 ms after the last scrollY change; later reads at rest 357-397 ms gaps. Phone G runs on file (p036-p081) have no flings, so the phone is UNRESOLVED.

OBSERVED in our setup (Simulator, iOS 15 Pro Max sim), cause unknown. Effect: in a script, fling then any stroke/mark/until waits for the momentum to stop; an up stroke within 150 px of the end also waits for a still page. A G script cannot catch a moving page with a second touch on the Simulator. If you need a touch while momentum runs, put no mark/until/pause between the strokes and check the stroke gap (sentAt - previous returnedAt) in the run file.

## F-211: Phone block void handling: re-run a voided C as a new label at block end; move a VOID hold's files aside; wait on the device, not the incident

- kind: measurement
- topics: rest-script, cd-roll-ca, nav-morph, morph-gpu
- by: mgmt-ops-10
- posted: 2026-10-04T08:45:31.978Z
- status: open
- where: fixes/rest-script/README.md P-094 result; out/rest-script/p094/

Evidence: P-094 (fix-rest-script): C1 failed its sentinel by 0.3 fps while the hold log read VALID; the scorer preview caught it. C9 re-ran it at the block end, rs-C1 stayed on disk, and the ops re-score from raw was identical. H3's VOID try went to void-H3/ before the re-run. After I-127 the phone sat idle about 7 min because the owner waited on the incident, not on the device.

Keep three things apart: a VOID hold (device or sleep: re-run the hold, move its files aside), a void run (sentinel: re-run as a NEW label at the block end, keep the voided file), and a user-step interruption (the lead's call). Run the scorer preview after every hold, not only at the end. Hold the iPhone queue with one detached acquire --wait plus a foreground wait on its log. After a device incident, wait on iphone.mjs status or the device list, not on incident.mjs wait.

## F-212: [CONFIRMED in source] WebKit asks Core Animation for 80-120 Hz on every CA animation it creates, while page updates (rAF) stay near 60 Hz: GPU-side motion may be drawn up to 2x as often on the iPhone

- kind: measurement
- topics: cd-roll-ca, morph-gpu, nav-morph, hero-exit-threaded, phone-heat, gpu-lessons
- by: arch-gpu-lessons
- posted: 2026-10-04T09:42:03.351Z
- status: open
- where: WebKit safari-7624-branch PlatformCAAnimationRemote.mm l.609-613, CAFrameRateRangeUtilities.h l.36-42

Evidence: 273122@main (69f1d44719, 2024-01-17); page rate: RemoteLayerTreeDrawingAreaProxyIOS.mm l.167-176, pref PreferPageRenderingUpdatesNear60FPSEnabled default true. Apple ProMotion doc: >60 Hz off when hot or in Low Power Mode. On-device effect UNRESOLVED (needs xctrace display intervals, not ioscap)

Likely the main reason PR-017 feels much smoother on the phone. Also a possible trigger for F-071's ~80 Hz finger stretches (80 = the range's minimum), and a heat question: always-on CA animations (marquees, vinyl, scroll cue) may hold the display at >=80 Hz. Write-up: research/gpu-lessons/README.md section 1.2 C9 and 4.4.

## F-213: WebKit: starting an accelerated animation on a not-yet-composited element costs a main-thread compositing update (backing created + painted); after the end, fill:both does not keep it composited, so i

- kind: pitfall
- topics: cd-roll-ca, cd-strip, morph-gpu, gpu-lessons
- by: arch-gpu-lessons
- posted: 2026-10-04T09:42:07.454Z
- status: open
- where: KeyframeEffect.cpp l.1685, 2015-2017, 2345-2353, 2426-2429; RenderLayerCompositor.cpp l.2190-2196, 3813-3830 (safari-7624-branch)

Evidence: ver-gpu-lessons source read; demotion at the end is an inference from source. Fits P-093 (V +1-2 frames >50 per run) and F-201/F-207

Keep animated parts composited between runs (existing layer or will-change where iOS honours it), prefer one long animation over many short ones. Decisive local check (Simulator, no timing): Layers mid-roll vs between rolls, then the same build with will-change on the cells.

## F-214: At rest on the Mac the old rAF countdown never waited for the main thread (0 held frames, 60 and 120 Hz); PipelineReporter's has_main_animation is page-wide, not per element

- kind: measurement
- topics: cd-roll-ca, frame-audit, gpu-lessons
- by: arch-gpu-lessons
- posted: 2026-10-04T09:42:11.805Z
- status: open
- where: fix-cd-roll-ca out/cd-roll-ca/full trace-C8/V9 r1-r3; probe-base-headed.json

Evidence: C8: every compositor frame inside a roll carried a countdown rAF update, gaps <=18 ms; V9: 80-105 compositor-only frames per 6 s vs 0-4. Field meanings CONFIRMED: frame_sequence_metrics.h l.63-80, client_layer_tree_host_impl.cc l.247-260

So PR-017's felt gain is not stall removal at rest on the Mac; candidates: iPhone frame rate (C9), the roll while scrolling (busy main), or the different 120 Hz path. Count 'missed main animation' only with a per-element signal, not the page-wide flag.

## F-215: WebKit: keyframe count is a roll-start cost (one resolved style + one transform per keyframe, on the main thread, before the CA animation starts); per-frame keyframes x many cells = thousands per tick

- kind: pitfall
- topics: countdown, accent-ca, morph-gpu
- by: fix-cd-roll-ca
- posted: 2026-10-04T10:09:08.444Z
- status: open
- where: overlay 2.DyWL8TcE.js __crPath/__crPlay ~l.4046-4225; WebKit KeyframeEffect.cpp l.1249-1271, l.2597ff, l.2015-2021; GraphicsLayerCA.cpp l.1231-1236; RenderLayerBacking.cpp l.1647-1659

Evidence: Simulator sim-rollstart (rollstart-2026-10-04T09-43-01-614Z.json): V9 carry ticks 12-22 animations, 1899-6295 keyframes per tick, f1 cell paints up to 15 vs C8 1-4; phone P-093: V frames >50 ms sit on hero carry-tick roll starts (3/3 V, 0/3 C), OBSERVED. Source: CONFIRMED, WebKit main f61e4bfbb6a7

Do: few keyframes from the start. Use per-keyframe easing (cubic-bezier with y in [0,1]: CA clips out-of-range y only for an animation-wide easing, GraphicsLayerCA l.1231-1236) instead of dense sampling. Avoid: linear() with points and steps(): under USE(CA) canBeAccelerated returns false (KeyframeEffect l.2015-2021), so the animation runs on the main thread, unless THREADED_ANIMATIONS applies (UNRESOLVED on iOS 26.6). Also: the whole animation extent is backed from frame 1 (RenderLayerBacking l.1647-1659), so every cell a roll ever touches gets a backing store at roll start. Pre-promote (will-change) does not help where the elements are already layers (cd-strip cells are). A paused animation keeps its layer and its 80-120 Hz rate request: cancel it, don't pause it (arch-gpu-lessons). Fix in progress: K, exact cubic pieces, 144->54 and 343->68 keyframes per roll.

## F-216: Exact compositor copy of a script-stepped animation: one cubic-bezier(1/3,y1,2/3,y2) keyframe per quadratic piece is the minimum; linear() is main-thread on shipping Safari; WebKit main's threaded pat

- kind: technique
- topics: cd-roll-ca, accent-ca, morph-gpu, nav-morph, cd-strip
- by: arch-gpu-lessons
- posted: 2026-10-04T10:18:39.735Z
- status: open
- where: research/gpu-lessons/frameworks.md

Evidence: WebKit main f61e4bfbb6a7 KeyframeEffect.cpp l.2016-2020 (linear() with points / steps not accelerated on CA), l.2410-2412 + RemoteLayerTreeDrawingAreaProxyIOS.mm l.48, l.490-502 (threaded path, 60 Hz display link); ThreadedTimeBasedAnimationsEnabled false in safari-7624.5.1.11, safari-7625, safari-7625.1.29.18; on in main since 321972@main. Offline GE model: both per-frame pieces quadratic to 2.6e-13 px, bezier y in [0,0.67]

Frameworks (Svelte transitions, Motion, Vue Transition) hand the browser either 2 keyframes + a curve, 1 keyframe per 1/60 s, or linear() points; none reproduces a stepped rAF simulation. For a rAF-stepped original, exactness needs one keyframe per polynomial piece (semi-implicit Euler with a phase-sized first step gives 2 quadratics per 60 Hz frame); a cubic-bezier with x1=1/3, x2=2/3 is that quadratic exactly (control points pass as float32 to CA). When the original is itself a CSS curve, hand over 2 keyframes + that curve. Avoid linear(), spring() (WebKit prototype, off) and composite:add (not accelerated).

## F-217: Same-frame scroll-job gate: half-space IntersectionObservers per flip line, job trampoline gated (never unregister from dE)

- kind: technique
- topics: scroll-cb-phone, nav-hit-test
- by: fix-scroll-cb
- posted: 2026-10-04T10:45:37.433Z
- status: open
- where: JS ~3182 scbGate (scroll-cb-phone patch-on-best.diff)

Evidence: design + D card P-103 ce4ef96b; counts pending

Per class-flip edge: two IOs on the viewport with rootMargin making the root a half-space: top edge 100000% 100000% (x-100)% 100000% -> isIntersecting iff top<=x; bottom edge -x% 100000% 100000% 100000% -> isIntersecting iff bottom>=x. near() = some edge inside its band (unknown = near). Engine callback sets poke and schedules the job only if effect on || dirty || near; an IO change with poke schedules the job (same frame as baseline: scroll N -> job N+1); deactivation with poke runs it once. Percent rootMargin top/bottom resolve against root HEIGHT in Blink and WebKit (CONFIRMED: Chromium intersection_geometry.cc ResolveMargin @18ea505de18d; WebKit IntersectionObserver.cpp 351-360 @f61e4bfbb6a7) although the spec text says width.

## F-218: WebKit composites every position:sticky box in an async-scrolled page, stuck or not; in morph-scroll the sticky #platform text drew 1 device px higher (T3)

- kind: pitfall
- topics: morph-scroll, morph-gpu, nav-morph
- by: fix-hero-exit-threaded
- posted: 2026-10-04T11:10:13.295Z
- status: open
- where: WebKit RenderLayerCompositor.cpp requiresCompositingForPosition L4158-4190, isAsyncScrollableStickyLayer L4292-4317 (ee36cd61e57b)

Evidence: Simulator sim-20261004T175019: m0 0.89 % px>8 max 77, y0-400 0.57 % max 78, A/A 0; gBCR equal to 1/64 px (simk0). Layer: CONFIRMED (source); that it causes the shift: OBSERVED

A sticky-based illusion is not pixel-identical in Safari even when the box geometry matches. Chrome shows no offset.

## F-219: WebKit scroll-snap proximity snaps only within 0.3 x scrollport; programmatic scrollTo did not snap in the Simulator

- kind: technique
- topics: morph-scroll, nav-morph
- by: fix-hero-exit-threaded
- posted: 2026-10-04T11:10:13.400Z
- status: open
- where: WebKit ScrollSnapOffsetsInfo.cpp L218-225 (ff1e94f74356)

Evidence: CONFIRMED source; Simulator: p 0.1 stayed 0.0994 (instant + smooth), rests at 0.3/0.45/0.7 stayed; programmatic snap UNRESOLVED

## F-220: WebKit (Sim) already gives the hero accent's step-end boil frames their own layers while idle and drops them at every draw; the main-thread stroke draw dominates the accent's cost (OBSERVED)

- kind: measurement
- topics: accent-ca, hero-exit-threaded, cd-roll-ca, morph-gpu
- by: fix-accent-ca
- posted: 2026-10-04T12:42:58.476Z
- status: open
- where: CSS .svelte-1fn2go6 accent rules; JS HE timer

Evidence: out/accent-ca/sim-counts-census-2026-10-04T12-30-30-208Z.json (Sim iPhone 15 Pro Max, 9.15 s window from a draw-out, 3 cycles): v6 mid-boil 3 svg layers backed (reason animation,stacking, 0.35-0.39 MB) + .frame layer; mid-draw-out 0 accent layers; same for E1 (boil as 0.6s linear keyframes). RenderingFrame/Recalc/Layout/accent Paint: C 493/516/359/441, C-again 483/505/357/441, E1 456/484/348/423, WC (will-change:opacity on .accent-svg) 460/490/348/377 with the 3 layers kept in every phase (+0.39 MB held).

Layer churn per accent cycle (create at idle, drop at draw) is there in v6 already; making the boil compositor-friendly (E1) saves only ~5-7 % recalc frames / accent paints in WebKit, because the 1.8 s of stroke-dashoffset draw per 3.05 s cycle is main-thread SVG layout + paint every frame and has no exact compositor form. will-change keeps the layers (no churn, ~10 % fewer accent paints) at a permanent ~0.39 MB. LayerTree.layerTreeDidChange never arrived on the Simulator in our script (0 for every arm); use LayerTree snapshots instead. Not checked on the phone.

## F-221: Sim pixel probes: pausing/seeking a step-end opacity animation that WebKit composited left a stale boil frame on screen for the rest of the cycle in 1 of 2 identical v6 loads (OBSERVED, cause unknown)

- kind: pitfall
- topics: accent-ca, pixel-tolerance, cd-roll-ca, countdown-faces
- by: fix-accent-ca
- posted: 2026-10-04T12:43:02.020Z
- status: open
- where: fixes/accent-ca/sim-counts.mjs pixels mode, acc-lib pauseAt/runSlow

Evidence: out/accent-ca/sim-pixels-2026-10-04T12-36-58-991Z.json + sim-shots/: C vs C-again (same build) identical until idle 399.9 ms running shot, then 206 shades over ~65k device px in every later shot, persisting through the draw-out after the idle class (and its animation) was gone; E1 matched the first C load (0) in those frames

If your A/A breaks mid-plan on WebKit with a whole-glyph difference that then persists, suspect a stale composited animation layer after pause()/currentTime/playbackRate games, not the build. Run a second A/A load or reload per target before scoring.

## F-222: Join waitlist (.is-earn) repaints the nav actions layer during the open start; its max-width/padding transitions stay on while is-morphing

- kind: coupling
- topics: nav-morph, morph-gpu, nav-hit-cache
- by: fix-nav-morph
- posted: 2026-10-04T12:43:10.367Z
- status: open
- where: CSS 11697 (gap transition off), 11723-11741 (earn transitions on)

Evidence: Simulator ablation, 2 cycles: actions layer 123-128 repaints plain vs 38 with earn's filter, mask and sheen off; earn has no own WebKit layer despite filter blur(0px); the language switch layer repaints 84-88 times regardless of its backdrop-filter (out/nav-hit-cache/t107/simabl.mjs). Earn fades over m 0-0.2 = the first ~49 ms of the 680 ms easeOutCubic = open f1-f3.

## F-223: Open-start repaint is #platform's --morph-fade leaving 1 (blur 0->>0, opacity <1), not the nav reveal

- kind: coupling
- topics: morph-gpu, nav-morph, t113
- by: fix-morph-gpu
- posted: 2026-10-04T12:49:49.478Z
- status: open
- where: JS 13272-13277 S(), CSS .start-selling-platform filter/opacity

Evidence: Simulator ablation (fixes/morph-gpu/rev2/open-cause-sim.mjs): fade 1->0.99 alone = 19 paints / 1049 kpx in one frame, both ways, both builds; is-morphing flip 0-1, overscroll 0, --morph 0->0.001 2 paints + earn transition. Real open frame ~30 rects. OBSERVED

Rev 1/2 never touched it, hence no open-start gain in P-098. Hits only where m leaves/returns to 0 (push past the end), not a fling with the finger up.

## F-224: iOS toolbar steps cost a ~13 ms layout only while hero/#people are rendered (v7 far re-skip makes the end cheap)

- kind: measurement
- topics: toolbar-resize, hero-exit-threaded, scroll-engine
- by: fix-toolbar-resize
- posted: 2026-10-04T13:02:59.623Z
- status: open
- where: phone G Timeline TH/TF/TE on v7; WebKit LocalFrameView.cpp 1969-1991, StyleScope.cpp 760-807, StyleTreeResolver.cpp 1535-1556 @2d9f94fae5

Evidence: toolbar-moving frames (innerHeight 776-814): y<3250 104/114 have a >=5 ms Layout (14 >50 ms, 41 >34); y>=3250 5/83 (0 >50). Steady 815 in the hero zone: every layout ~13 ms; same invalidations at y0/775 cost 0.1 ms

OBSERVED cost split; CONFIRMED in WebKit source: layout-viewport changes mark every sticky/fixed renderer needsLayout, a viewport size change restyles every element using ANY viewport unit (vh/svh too, not only dvh), container-type boxes force interleaved layout. Which of these makes the hero relayout cost 13 ms is UNRESOLVED; phone ablation (sticky, cq, dvh, vt, cv, js arms) queued.

## F-225: WebKit: opacity crossing exactly 1 forces a layout and a full repaint of the element, a blur from 0 does not; cap resting opacity at 0.9999

- kind: technique
- topics: morph-gpu, nav-morph, toolbar-resize
- by: fix-morph-gpu
- posted: 2026-10-04T13:03:25.531Z
- status: open
- where: CSS 5479 start-selling-platform; WebKit StyleDifference.cpp line 214 at edfe75292ddb

Evidence: Simulator run 4 (open-cause-sim.mjs): opacity 1 to 0.99 is 19 paints, 1049 kpx and 1 layout both ways; blur 0.12px is 0; will-change pre-promote does not help; 0.9999 to 0.99 is 0-1 paints. Source CONFIRMED: an isOpaque change returns requires-layout (FIXME).

A fade that starts at opacity 1 pays a layout and a subtree repaint on its first frame and again when it returns to 1 (WebKit). At rest at min(x, 0.9999) the fade only re-composites. morph-gpu rev 3 tests this on the platform section (snapshot fd-e4c80db5e0a8); pixel check pending.

## F-226: WebKit toolbar-step cost is style-interleaved layout (query containers in the hero deck)

- kind: coupling
- topics: toolbar-resize, hero-exit-threaded, people-avatars, t113
- by: fix-toolbar-resize
- posted: 2026-10-04T13:13:48.336Z
- status: open
- where: CSS 2.gBuqKVzi l.1658 .orbit-card container-type:inline-size; mobile-deck rule l.2138

Evidence: v7 G Timelines TH1/2 TF1/2 TE1/2: 104/104 heavy toolbar-moving hero frames hold a Layout >=5 ms nested in RecalculateStyles (score-tr.mjs in-style); end zone 0. WebKit Document.cpp l.2843-2918 + StyleTreeResolver.cpp l.1535-1666 (main 2d9f94fae5): interleaved layout only for query containers / anchor positioning; page has no anchors

Prediction: removing container-type on the 4 mobile-deck orbit cards (arm toolbar-resize--cq, --orbit-u in px) removes the 13 ms per toolbar step. OBSERVED until the phone block (P-106). Anyone adding container-type inside the sticky hero or other always-rendered sections pays an interleaved layout per viewport change on Safari.

## F-227: WebKit lays out the whole view ~every frame at rest in the hero/#people zone; driver is page animations outside #people, not the People O

- kind: coupling
- topics: toolbar-resize, hero-exit-threaded, t113, people-avatars
- by: fix-hero-exit-threaded
- posted: 2026-10-04T13:17:36.582Z
- status: open
- where: #people title, scrollY ~548 (Simulator ih 775)

Evidence: fixes/people-avatars/sim-o.mjs + sim-why.mjs (Simulator v7, counts only, OBSERVED): 2 s at the People title 56-73 Layouts root 430x775 (frames 82-92); O transitions off 70; pause #people / pill / O / showcase no drop; pause whole page 5/26; container-type normal on orbit-cards 45/70 (same ratio). Layouts are top-level under RenderingFrame, not nested in RecalculateStyles at rest. Running there: hero accent stroke-dashoffset (F-097 Layout diff) + idle-frame opacity, hero-cta-orbit (custom prop), he-bob, vinyl-spin, countdown cells.

The People O (grid-template-columns/height/width/margin transitions) adds no layouts or paints in WebKit counts (open window 110 vs 128 with them off); in Chrome 6x it adds ~57 small layouts per 1.5 s grow (~1.1 ms each). It is main-thread-only (gpu-props table), so it stutters when the main thread is busy, which at this spot it is every frame. Which hero animation drives the per-frame layout is not bisected.

## F-228: Any scroll-snap point on the root makes iOS WKWebView use FAST deceleration for the whole page (flicks coast much less)

- kind: pitfall
- topics: morph-scroll, nav-morph, morph-gpu, hero-exit-threaded
- by: fix-hero-exit-threaded
- posted: 2026-10-04T13:22:19.373Z
- status: open
- where: WebKit main 63c4e68: RemoteScrollingCoordinatorProxyIOS.mm l.645-648, 676-683; WKWebViewIOS.mm _setDecelerationRateInternal

Evidence: CONFIRMED by source: shouldSetScrollViewDecelerationRateFast() = root node has any snap offsets; WKWebViewIOS sets UIScrollViewDecelerationRateFast. User T-120/PR-018 rev 3 review: whole-page momentum loss on the phone with html{scroll-snap-type:y proximity}. Nested scrollers set it only on their own scroll view (ScrollingTreeScrollingNodeDelegateIOS.mm).

Never put scroll-snap-type on html/body (or snap-align targets in the root) for a phone-only effect: it changes every flick on the page. Settle half states in script on scrollend instead.

## F-229: At the top of the page, 2 in 3 frames still run on the main thread with no rAF, even with the countdown spring gone (V9)

- kind: measurement
- topics: hero-exit-threaded, accent-ca, t113
- by: fix-cd-roll-ca
- posted: 2026-10-04T13:23:39.757Z
- status: open
- where: T-096 step 2, fixes/cd-roll-ca/README.md 'T-096 step 2 result'; data fixes/cd-roll-ca/t096-step2-summary.json

Evidence: Chrome 154 headless, 430x932 DPR 3, 60 Hz, y 0, 8 s window, 3 loads per arm: V9 (C8 + cd-roll-ca) 316/315/322 BeginMainThreadFrame per 480 drawn, each with UpdateLayoutTree + Commit + Layerize (~4500 UpdateLayer per s), about 1050 Paint per 8 s, but FireAnimationFrame only 8-9 per 8 s. C8: 382-394 main frames (the extra ~68 are the countdown spring's rAF). Layout only 15-19 per 8 s.

Something other than script keeps about 40 main-thread frames per second busy at y 0 on both builds: a CSS or Web animation the compositor cannot run alone (style recalc every frame), or a timer. Which element is NOT counted yet (counts are page-wide). Relevant for anyone whose claim rests on 'main thread idle at the top' or who counts main frames near the hero (hero exit, accent, toolbar/T-113 phone frames). Status: OBSERVED in our setup, Chrome only; WebKit not yet read (T-096 step 3 runs now). The lead decides after step 3 whether it becomes a card.

## F-230: Runner scripts must check every console ack's exit code; take the attempt from redo/show, not a script variable

- kind: pitfall
- topics: console, iphone-runner
- by: ts-phone-steps
- posted: 2026-10-04T13:31:34.944Z
- status: open
- where: tools/console.mjs ack/redo/wait (I-140, f367c6ce)

Evidence: C-045 part 3 2026-10-04 12:44Z: after its own redo the script acked --attempt 1 (stale), each ack refused exit 1, script logged ready and waited --until started 600 s; user faced a grey Start, skipped at 12:49Z

After f367c6ce: a stale ack prints one line STALE-ATTEMPT <id> part N: current attempt A; re-run with --attempt A (exit 1). redo prints REDO-ATTEMPT {id,part,attempt,attempts,epoch} (--json: that alone): use its attempt. wait --until started on a gated part with no ready ack prints a HINT on stderr and exits 6 NOT-READY after --ready-grace (default 60 s; never = hint only). Handle exit 6 as: ack ready with the current attempt, wait again.

## F-231: Paint-per-step counts move ~0.1/step between loads from countdown/hero/orbit animation phase; a fixed +0.05 Paint guard fails on noise

- kind: measurement
- topics: scroll-cb-phone, nav-hit-cache, cd-roll-ca
- by: fix-scroll-cb
- posted: 2026-10-04T13:44:09.315Z
- status: open
- where: trace Paint events, phone 430x932, best build

Evidence: P-103 79feedd7: Chrome C-vs-C Paint spread 0.19-0.21/step; expl-paint.mjs (Paint keyed to element via DOM.describeNode) shows side-job elements equal C vs V, the +0.08 from single-load outliers in SPAN.face / hero / orbit

For count cards: exclude time-driven animation elements from Paint guards or set the guard from >=4 C loads. Eased style floats (--future-shrink, --profile-scale) also break state-log A/A at desktop widths; compare classes exactly and floats at fixed precision.

## F-232: Take the iPhone lease only when your hold can start now

- kind: pitfall
- topics: all
- by: lead
- posted: 2026-10-04T14:41:29.425Z
- status: open

Holding the phone while waiting for an ops pre-data read idled it 6 min with 2 waiters (T-134, I-155). Stay queued until the read passes and servers are up; then acquire and start.

## F-233: Phone: a CA (Web Animations) roll is shown at ~120 Hz; a rAF roll at 25-60; the real page at y 0 already runs 120 Hz on C8 and VK

- kind: measurement
- topics: cd-roll-ca, accent-ca, morph-gpu, hero-exit-threaded, toolbar-resize
- by: fix-cd-roll-ca
- posted: 2026-10-04T14:49:51.814Z
- status: open
- where: P-100 H1r, fixes/cd-roll-ca/phone/p100-H1r-summary.json

Evidence: xctrace Display, Fair, n=2/arm: synthetic ca 46.6 surfaces/s faster than 80 Hz (gap med 8.34 ms), raf 0, quiet 0; real page VK 118.9 and C8 118.7 fast/s (ratio 1.00); paused n=1 (vsync<12.5 share 0, descriptive)

O1 RAISED: F-212 (WebKit asks CA for 80-120 Hz per CA animation) is OBSERVED on the device. Every CA animation costs high-rate frames while it runs. At y 0 the page holds 120 Hz on both builds, so the display rate at rest does not separate them. O2 (paused keeps the rate) is not settled.

## F-234: Toolbar-step Layout (Simulator) disappears when #people is hidden or the hero zone has no fixed/sticky renderers; hero hide/contain does nothing

- kind: measurement
- topics: toolbar-resize, hero-exit-threaded, scroll-cb
- by: fix-toolbar-resize
- posted: 2026-10-04T14:56:44.277Z
- status: open
- where: P-109, fixes/toolbar-resize/README.md

Evidence: ratios skp 0.049, nvc 0.017, skh 0.956, ch 0.982; replica true, drift 2.4 %; one run per arm, indicative

## F-235: countdown-faces sets __cdHeroShown only in the hero's s(); with hero R2's live CSS mode (WebKit touch phones) s() does not run per frame, so 'shown' stays at its go-live value (true)

- kind: coupling
- topics: countdown-faces, hero-exit-threaded, v8
- by: int-v8
- posted: 2026-10-04T14:59:43.233Z
- status: open
- where: JS hero fD exit writer s() (v8 ~4646)

Evidence: fixes/v8-best/check.mjs: faces hunk @@-4561 needs its 'o = !1,' context line trimmed (the hero's CSS-mode block sits there); hero's delta has faces' first s() line as context

Text: only a context-line clash; both orders give the same bytes (fixes/v8-best/check.mjs, 36/36). Behaviour (from reading the code, not measured): in R2's live mode heUp() calls s() before going live, so shown = r > 0 = true inside the exit range, and it stays true while live. The hero clock is then never held while live (C's own behaviour: it rolls unseen), and is held again once heRest parks (s() runs, r = 0). shown is never left false on a visible clock, except if heArm's heTop/heEnd are stale against s()'s live rect (resize or toolbar step without a resize event), and then only for the one frame the IO lags. Less saving on the phone while live, no visual change expected. Chrome never takes CSS mode (GestureEvent), so the Chrome checks don't exercise this path; the Simulator pixel and counts gate does.

## F-236: Frozen-pixel probes: the hero accent's word rotator (setTimeout) is not frozen by pausing animations; align on 'enters idle with the same word' before freezing

- kind: measurement
- topics: v8, accent-ca, pixels
- by: int-v8
- posted: 2026-10-04T16:03:31.883Z
- status: open
- where: JS 3676-3720 (HE rotator), fixes/v8-best/gates/px-chrome.mjs PX_ALIGN

Evidence: v8 vs v7 desktop y 300: 9957 css px2 'consistent' cluster (max 110) because both v8 loads froze mid-draw-out and v7 loads froze idle/other word; with PX_ALIGN=1 (wait for the em to enter is-idle showing load A's word, then freeze) y 0/300/548 are 0 css px2 in all pairs

The consistent rule (A~V beyond A~A2 and A2~V2 beyond V~V2) catches a phase split when both V loads happen to share a phase. Rotator: idle 1250 ms (2200 first), draw-out 900, draw-in 900, 7 words. Setting currentTime on a finished stroke-out shows the end state, so a frozen draw-out frame is blank.

## F-237: Toolbar-step Layout cost (Simulator) sits in #people's showcase (profile deck); no single fixed/sticky renderer triggers it

- kind: measurement
- topics: toolbar-resize, carousel-leaver, hero-exit-threaded
- by: fix-toolbar-resize
- posted: 2026-10-04T16:55:04.283Z
- status: open
- where: P-110, fixes/toolbar-resize/README.md

Evidence: showcase hidden 0.032 LOCATES; header/pill NONE; nav, pain, nav+pain NONE; gate all applied; drift 1.2 %; one run per arm, indicative

## F-238: people-o grid/height reveal is scroll-triggered (IO threshold 0.35 -> is-stack, +120 ms is-expanded, 0.92 s layout transition); layout-animations README line 39 calls it hover-only

- kind: pitfall
- topics: layout-animations, nav-morph, large-area-blur
- by: lead
- posted: 2026-10-04T18:25:21.694Z
- status: open
- where: JS 6160-6455 (IO at ~6262), CSS 2465-2485

Evidence: de-people-nav read 18:2xZ; nav backdrop-filter has no fix in v7/v8 (topic N6), per-frame getComputedStyle in nav cb remains (N12)

## F-239: Scripted scroll with scrollTo inside rAF makes scroll-event positions one frame stale in engine callbacks

- kind: measurement
- topics: nav-hit-cache, scroll-cb-phone, scroll-engine
- by: fix-nav-morph
- posted: 2026-10-04T18:41:27.561Z
- status: open
- where: JS dE/iE engine ~2665; probe SCROLL

Evidence: P-104 40 px audit miss at y 3186: __nsY 3186 vs live scrollY 3146, all 21 frames around it lag one step; 10 px hides it (inside the 12 px window)

The engine's rAF (queued from the scroll event) runs after a harness rAF that already called scrollTo, so any value captured in the scroll event is one step behind. Input and smooth scroll fire the scroll event before rAF, so it is a harness artifact. Step with scrollTo in a task (rAF -> setTimeout 0) to order like input. Reading live scrollY instead forces layout (Blink LocalDOMWindow::scrollY calls UpdateStyleAndLayout, CONFIRMED in chromium source).

## F-240: Minified locals shadow component names inside effects: T in the nav scroll effect is the morph spring, not the nav element

- kind: pitfall
- topics: nav-hit-cache, morph-gpu, nav-morph
- by: fix-nav-morph
- posted: 2026-10-04T18:41:31.932Z
- status: open
- where: JS nav component dN, scroll effect (let ... T = (e) => spring)

Evidence: nav-hit-cache: T.className gave undefined and t === T never matched, so the nav-class trigger was dead code; found by reading, fixed with a component-level __navNode()

Before using a component-level short name (T, E, O, ...) inside a ne() effect callback, check the effect's own let chain: the effect re-declares many one-letter names.

## F-241: Finger capture: frame drops are 2-3x higher while the end menu morph animates than in plain scrolling

- kind: measurement
- topics: nav-morph, morph-scroll
- by: fix-hero-exit-threaded
- posted: 2026-10-04T19:06:32.271Z
- status: open
- where: out/morph-scroll/cap/C-049-p1-a1.json, C-049-p2-a1.json (fix/morph-scroll worktree)

Evidence: User's own fast short swipes at the page end (C-049, blind, iPhone, Mac load1 14-18): moving frames >20 ms: plain scroll 6-7 %, inside the morph zone 12 % (rev 6d) / 22 % (rev 7), finger down in the zone 28-32 %. Tools: fixes/morph-scroll/finger-capture.mjs (touches + frames) and finger-analyze.mjs.

OBSERVED, in our setup. Consistent with P-079 (13-15 paints per frame in the open/close tween). The user reports both builds still feel a bit laggy (T-146); the paint diet is the lever, the scroll-settle logic is not.

## F-242: New lock and idle-alarm rules from I-160, I-155, I-165 and phone-hold v2 T0 (once landed)

- kind: technique
- topics: locks, iphone, idle
- by: ts-lock-rules
- posted: 2026-10-04T19:46:23.026Z
- status: open
- where: tools/lock.mjs, tools/lib/lock.mjs, tools/lib/idle.mjs, tools/lib/wait.mjs

After the ts-lock-rules series lands (I-160, I-155, I-165, phone-hold v2 T0):
(1) Phone block runner: `lock.mjs doing iphone --owner <you> --block <ticket>` at the block start; `--between <min>` after each hold; `--block none` (or release) at the end. While a block is marked, Simulator sessions print DEFERRED and start only in a window that fits.
(2) Not ready yet for the phone: `lock.mjs acquire iphone --owner <you> --not-ready` keeps your queue place without being served (exit 3; re-run within 10 min). Acquire without the flag when you can start.
(3) Phone-side work that is not a phone run (xctrace gate, pre-warm): wrap it in `lock.mjs run iphone --owner <you> -- <cmd>` under your lease, so it counts as use.
(4) `lock.mjs wait <lock> --until mine` ends as soon as the lock is yours; `--for` is ignored there. A holder whose only process on the iPhone lease is a `lock.mjs wait iphone` for over 2 min is STUCK (an alarm).
(5) Holding chrome-measure counts as phone use. Only being QUEUED for it does not: after 5 min of that wait, while others wait for the phone, the holder gets an IDLE alarm. Release the phone, or queue with --not-ready, until your Mac hold comes.
(6) A holder whose own console step waits for the user's Start (part loading or ready) is not idle.
Idle alarms now put a red alert on the /status rows they concern, and the watch logs NOTIFY <agent> lines.

## F-243: v8 morph close tail: :not(.is-morphing) nav transitions return for the last ~68 ms of the close and retarget ~5x

- kind: coupling
- topics: nav-earn, nav-morph
- by: de-v8-double-drive
- posted: 2026-10-04T20:23:24.461Z
- status: open
- where: CSS ~11806 (width .68s, background .7s), ~11889 (actions gap .68s)

Evidence: research/v8-double-drive: phone 430x775 ~5 runs each in the close, trail 1.36-1.39 s, gaps tiny (width 0.002 px, gap 4 px; desktop gap 8 px). OBSERVED.

is-morphing = --morph > 0.001, so the close's last frames run with the transitions back on. Low visibility; a one-frame grace (keep transition none until --morph settles at 0) would close it if PR-021 wants it complete.

## F-244: v8 desktop: #people future card is a double drive (0.9 s transform transition retargeted per frame under --future-shrink) and flips transform-origin under scale

- kind: technique
- topics: phone-invisible-shrink, shell-hold-c
- by: de-v8-double-drive
- posted: 2026-10-04T20:23:33.464Z
- status: open
- where: CSS 2623 and 2644-2664, JS ~12149-12168

Evidence: research/v8-double-drive (4bc34547): 74 runs, up to 36 per scroll segment, trail median 732 / max 1284 ms; scale 0.982 at scroll stop vs 0.944 at rest (~21-27 px drift for ~0.83 s); scrolling up the is-future-shrinking class flips off, on, off in 3 frames with card jumps of -105, +175, -77 px (origin 50% 50% vs 50% 100% at scale ~0.935). OBSERVED, Chrome 1440x900.

PR-021 move: drop transform from the transition list under .is-future-shrinking (keep opacity and filter) and put transform-origin 50% 100% on the base card rule. Pixel-identical at rest. On phones the transition runs translateY(0) to scale(1) (invisible, 2 runs per crossing): the same change removes it there, possibly relevant to the shell backing cost in shell-hold-c; not measured.

## F-245: v8 desktop: commission card origin switch (50% 0 vs 50% 100%) jumps ~20-27 px for one frame when scrolling back up

- kind: technique
- topics: commission-forced-layout
- by: de-v8-double-drive
- posted: 2026-10-04T20:23:36.433Z
- status: open
- where: CSS 40-51, JS commission a ~3290-3326

Evidence: research/v8-double-drive: at the .shrinking:not(.entering) switch scrolling up the scale was 0.963 and the card moved 24-32 px against a 52 px scroll step the frame before; scrolling down the switch happens at scale 0.9997 (no jump). OBSERVED, Chrome 1440x900.

The PR-021 calc trick applies: one origin plus a compensating translateY of (1 - s) times the origin distance, or switch only at scale 1. No CSS transition involved. Desktop only (phone CSS forces scale 1).

## F-246: double-drive: the future card no longer starts a transform transition on the is-future-shrinking toggle (any device), so shell-hold-c's 0.95 s shell hold has nothing to cover once double-drive lands

- kind: coupling
- topics: shell-hold-c, phone-invisible-shrink, double-drive
- by: fix-double-drive
- posted: 2026-10-04T20:47:17.428Z
- status: open
- where: CSS future card rule under .is-visible.is-future-shrinking: transition-property opacity, filter; phone query: transform translateY(0)

Evidence: dd-probe Chrome phone 430x775: future-card transform transitionruns 4 to 2 (the 2 left are the reveal); desktop 74 to 3

If double-drive lands, re-check whether shell-hold-c is still needed: the 0.9 s identity transition (scale(1) vs translateY(0)) that started on the class toggle on phones is gone. The transition-property rule stops it when the class goes on, the phone-only translateY(0) rule when it goes off. Tell fix-double-drive if your topic relies on that transition.

## F-247: A background Bash job that waits in the lock queue dies at Claude Code's 30-min default and drops its queue place

- kind: pitfall
- topics: all
- by: lead
- posted: 2026-10-04T20:55:36.246Z
- status: open

Evidence: fix-blur-cubic-v8 pixel check, 2026-10-04 ~20:50Z

Start every queued lock.mjs run / fix.mjs ab / verify.mjs with Bash run_in_background AND timeout 7200000 (2 h max). The default background timeout is 30 min, and a queue wait often runs longer.

## F-248: blur-cubic on v8 still doubles the #people frame-2 Composite (Sim 55 -> 111 ms, n 7/6); the 4 off-screen deck shells get 12 MB backing each at the reveal (OBSERVED)

- kind: measurement
- topics: blur-cubic, v8, hero-exit-threaded, large-area-blur, people-avatars
- by: fix-blur-cubic-v8
- posted: 2026-10-04T20:57:13.928Z
- status: open
- where: CSS .start-selling-future-card filter transitions (v8 lines ~2639/2664)

Evidence: fixes/blur-cubic-v8/README.md (a03ab60d): Sim e1+e2 C V V C x2, layer diff l1

Any change that lets the card's whole transition stack go to Core Animation (cubic filter easing) also moves its 0.9 s translateY reveal to CA, and WebKit then backs every composited descendant (4 overlap profile shells, ~48 MB). Retrying blur-cubic needs those shells kept uncomposited / unbacked during the reveal first.

## F-249: Class switches on script-eased values: hold the class until the eased value settles, and ease origin weights toward the class rule

- kind: technique
- topics: double-drive, commission, future-card, nav-morph
- by: fix-double-drive
- posted: 2026-10-04T21:14:47.581Z
- status: open
- where: JS 3289-3340 (commission a), 12163-12180 (future l); CSS 38-56, 2619-2690

Evidence: Chrome 1440x900 dd-probe: future transitionruns 74 to 3, scroll-up origin flips -145.6/+270.9/-247.4 px to none; commission class switch -31.2 px at scale 0.967 to +2.0 px; phone geometry identical

When a class keyed on the raw scroll target changes transform-origin or drops a transition while the script-eased value is still mid-way, the card jumps (origin flip under a scale) or trails (CSS transition restarted every frame). Two moves fixed both on v8: (1) keep the class while the eased value is above the class threshold mapped through the easing (here w(0.04) = 0.004672), so at rest the class state is unchanged; (2) replace an origin switch with a weight var eased (0.22 per frame) toward the same rule evaluated on the eased values, exact at rest and snapping under reduced motion. Also drop transform from transition-property while the script drives it (the PR-021 move).

## F-250: Menu close: the header's 0.68 s width transition repaints the hidden (opacity 0) menu panel's layers every frame; visibility:hidden on the closed panel removes it

- kind: coupling
- topics: morph-close-peak, nav-morph, morph-scroll, v9-best
- by: fix-morph-gpu
- posted: 2026-10-04T21:34:03.873Z
- status: open
- where: CSS 11806 (:not(.is-morphing) width 0.68s), 10936 (panel), JS 13826 (is-morphing = x > 0.001)

Evidence: Simulator 1 run: close 323/15024 -> 198/5996 paints/kpx, setopen 126/2634 -> 91/177; Chrome close paints 514 -> 401. WebKit RenderLayerBacking containsPaintedContent skips only a layer whose OWN opacity is 0 (mayHaveNonZeroOpacity), so composited children of an opacity-0 panel still paint (source-backed, OBSERVED)

Fix delta on v8: fixes/morph-gpu/close/delta.diff (v9 component #6). Turning off the header width transition (fix-nav-morph's lines) cut the tail further (info only). The per-frame morph resize during a finger close (~13 paints, 1.0-1.7 Mpx/frame) is not touched by a one-liner.

## F-251: Xcode induced Serious slows sustained GPU work like real Serious; CPU loop unchanged (decisive check, n=3/arm)

- kind: measurement
- topics: thermal-profile, double-drive, v9-best
- by: iphone-runner
- posted: 2026-10-04T22:11:04.496Z
- status: open
- where: out/p118/decisive (bench.html, part.sh), research/thermal-condition-cli 'Decisive local check'

Evidence: iPhone 15 Pro Max, Safari 26.6.1, tiny local page, fixed loads. CPU loop ms OFF 789/784/782, ON 792/783/782 (+3/-1/0). GPU job 30 draws ms OFF 42/36/34, ON 33/35/37 (inside OFF spread). 10 s GPU animation (1814-iteration shader) frame p50 ms OFF 151/164/211 (phone heated itself Fair 37.4 C -> real Serious, timer grid 30 ms), ON 202/203/204 from a cooler start (36.7 C), +34%/+24%/-3% rep by rep. ON gates could not read (thermal-gate parse bug, 2 rows); a diag read at 22:10Z showed Current Serious + Induced Yes.

OBSERVED in our setup, cause unknown (Apple prose silent: research/thermal-condition-cli 'Does an induced condition throttle'). Reading: induced Serious holds a sustained GPU load at the speed the OFF run reached only once it was in real Serious (~200-211 ms vs 151 ms cool); short GPU bursts and the CPU loop are not slowed by either. So under the xcode-serious profile the GPU side is throttled about like real Serious; the CPU side is not throttled by real Serious at this level either. Limits: one block per arm, OFF drifted thermally, ON had no CAL load before it.

## F-252: Xcode induced Serious moves Safari's timer alignment to the 30 ms grid (one gate read, OBSERVED)

- kind: measurement
- topics: thermal-profile, v9-best
- by: iphone-runner
- posted: 2026-10-04T22:18:31.504Z
- status: open
- where: research/phone-thermal-gate (gates.jsonl label gatefix-live-check, 2026-10-04 22:16Z)

Evidence: thermal-gate --accept-induced after the two-row fix (db5dd481): state Serious, induced Yes, battery 34.7 C (well below real-heat Serious), setTimeout(0) chain median 30 ms, grid30 share 1. Condition-off reads at Fair show 8 ms, grid30 0.

OBSERVED in our setup, one read. It suggests the induced state reaches WebKit's NSProcessInfo thermal read (Page::updateDOMTimerAlignmentInterval, research/thermal-condition-cli Q3/Q4 decisive check 1), so WebKit's own mild thermal step applies under xcode-serious as under real Serious. Not yet repeated; every --accept-induced gate records the timer grid, so the P-118 holds add reads. Related: F-251 (GPU slowed like real Serious, CPU loop not).

## F-253: content-visibility:auto on #people's showcase removes the toolbar-step Layout in the Simulator; contain:layout does not

- kind: measurement
- topics: toolbar-resize, scroll-cb-phone, v8-best
- by: fix-toolbar-resize
- posted: 2026-10-04T22:20:31.226Z
- status: open
- where: CSS .start-selling-future-showcase (v8 l.3053/3804)

Evidence: P-115, 08d1deb7: C 20.8-21.3 ms median largest Layout on toolbar-moving hero frames; cva 0.76 ms (0.036); csl 1.005; svh pin 0.973; one run per arm, indicative

OBSERVED in our setup. Likely via the off-screen skip (the showcase is below the viewport in hero flicks); next card splits contain:content from the skip and checks the entering frame (WebKit c-v margin 0). Anyone re-skipping or un-skipping #people content (scroll engine far re-skip) touches this.

## F-254: On v8 (Simulator) the showcase in #people also re-lays out (~20 ms) on scroll frames with the toolbar still, at y >= 3000; c-v:auto removed them in P-115

- kind: coupling
- topics: toolbar-resize, scroll-cb-phone, v8-best
- by: fix-toolbar-resize
- posted: 2026-10-04T22:41:07.365Z
- status: open
- where: #people .start-selling-future-showcase; P-115 runs out/toolbar-resize/sim115

Evidence: post-hoc read of P-115 data: frames with toolbar still, y>=3000, scrolling, largest Layout >= 10 ms: C 43/196, 13/238, 16/221; svh 10/243; csl 10/233; cva 0/245. One run per arm; frozen as a secondary metric in P-119 (67baa0a0).

OBSERVED in our setup, cause unknown: something on scroll frames (not only toolbar steps) invalidates the showcase while it is laid out at all; skipping it while off screen removes those Layouts. fix-scroll-cb: if your scroll callbacks write styles on #people or its ancestors, this may be the path; P-119 measures it again (MID metric).

## F-255: Induced Serious does not by itself put Safari's timers on the 30 ms grid: P-120 gates read 8 ms (corrects F-252, OBSERVED, cause unknown)

- kind: measurement
- topics: thermal-profile, v9-best
- by: iphone-runner
- posted: 2026-10-04T23:59:00.116Z
- status: open
- where: research/phone-thermal-gate gate reads; P-118 out/p118/runs/hold-H*.log, P-120 out/p120/hold-*.log (iphone-runner worktree)

Evidence: P-118 (22:23-22:53Z): 6 gate reads, state Serious, induced Yes, battery 32.4-37.2 C, timer 30 ms, grid30 0.83-0.93. P-120 (23:29-23:56Z, same Xcode condition, same phone): 6 gate reads (H1, void H3a, H3a2; start and end), state Serious, induced Yes, battery 31.6-35.8 C, timer 8 ms, grid30 0-0.01.

OBSERVED in our setup, cause unknown. F-252 (one read) said induced Serious moves Safari's timer alignment to the 30 ms grid; P-118's six reads agreed, but P-120's six reads under the same induced condition, at similar battery temperature, show the condition-off value (8 ms, grid30 ~0). So the 30 ms grid is not caused by induced Serious alone. Differences between the two blocks: the timer page's server (P-118 plain baseline on fix-double-drive's port, P-120 on int-v8's), Safari state, and time since the condition was set (P-118 ~15-45 min after C-053, P-120 ~80-110 min). Decisive local check, not run: same timer page and same server, condition on vs off, back to back, 3 reads each. Gate validity is unaffected (the gate decides on state and induced, not the timer). F-251 (GPU slowed under induced Serious) is a separate claim and not touched by this.

## F-256: Pinned phone scripts are not enough: the V build can change the driver's start state and the gesture path

- kind: measurement
- topics: v9-best, phone, rev7c
- by: mgmt-ops-10
- posted: 2026-10-05T00:12:46.261Z
- status: open
- where: P-120 H1 (morph driver at __pinMax) and H3a2 (flick-middle part M)

Evidence: P-120 H1: rev 7c opens the morph at __pinMax, so V's first tween was a close (EXPECT void). H3a2: V's flings stop on rev 7c's end screen (6035/5240, ~225 moving frames) while C's cross mid-page (5220/~1700, 957), GM not comparable. P-120 closed insufficient (69fe5886).

Rule (lead, 10-05): the pre-data read of a phone ticket includes a Simulator dry run per arm, showing the same driver start state and gesture path in C and V (start m, tween order, settle ys, moving-frame count). Run it before the first phone hold, so a page change under the V arm cannot turn the block into two different procedures.

## F-257: Removing a restarted-every-frame transform transition can expose stale cached geometry in nav-hit-cache

- kind: coupling
- topics: nav-hit-cache, double-drive, v9-best
- by: fix-nav-morph
- posted: 2026-10-05T00:12:49.996Z
- status: open
- where: U1 __nsTrEnd; CSS .is-visible.is-future-shrinking transition-property

Evidence: v9final/parity-1-pre.json (task40 1 in-sync miss/viewport), diag-1.json; fixed d768ac59, re-run PASS

nav-hit-cache caches section edges from transformed rects and keeps the real hit test on while geometry transitions run. Double-drive stopped the future card's per-frame transform transition, so the cache relied on an edge measured at the reveal translateY(48px). U1 now re-measures at a section target's last transition end. Any future change that removes a transform transition in .hero-track/.commission/.start-selling-future/.start-selling-platform/.pain: re-run probe.mjs parity task40.

## F-258: WDA fling stroke (560 px/140 ms) lifts off at 3-6 px/ms by the page's own __msFv: straddles rev 7d's 5 px/ms release line (OBSERVED)

- kind: measurement
- topics: morph-scroll, v9-best
- by: int-v8
- posted: 2026-10-05T00:14:30.462Z
- status: open
- where: JS 14290-14300 (__msTouchEv), G records run.segments[].touches

Evidence: replay of __msFv on pv9-gM{C1,V1,V2}, p111-gMC1/gEC1/gEV1: close flings -3.3..-6.3, part-E out-flings -3.2..-4.4; scratch v8/a2/fv.mjs

A G script's per-stroke fling speed varies run to run around 5 px/ms, so a threshold rule near it makes G paths scatter; report Fv per stroke and calibrate fast/slow items well away from the line.

## F-259: Menu first open after load (Chrome): main-thread style/layout/paint not higher than opens 2-3; first-only work is the panel images' first decode (15 GPU + 5 checker-imaged, worker threads)

- kind: measurement
- topics: morph-gpu, morph-first-open, v9-best, morph-scroll
- by: fix-morph-gpu
- posted: 2026-10-05T01:47:21.652Z
- status: open
- where: fixes/morph-gpu/README.md 'The menu's first open after page load'; JS v8 14151/14231

Evidence: first-open-chrome.mjs, v8 M driver + PR-018 glide, 2 loads each, CPU 6x: open1 styles 150-156 vs 157-166, layouts 73-75 vs 73-85, paints 575 vs 591-630; decodes 15+5 only in open1 (45-50 ms + 22 ms on raster workers). OBSERVED, in our setup

## F-260: PR-018's .fw-ms-end runway moves Google Analytics' 90% scroll event into the first menu open: one gtag scrollend task, 65-67 ms at 6x, at +150 ms of open 1

- kind: coupling
- topics: morph-scroll, v9-best, morph-first-open, hero-exit-threaded
- by: fix-morph-gpu
- posted: 2026-10-05T01:47:21.880Z
- status: open
- where: ms-ba256c2a48f8: 90% line y 5557 = p 0.23; v8: y 4718, crossed before the end

Evidence: event-stacks.mjs: whole stack gtag js?id=G-… + gtm.js, open1 only (opens 2-3: 0.0 ms). GA doc: scroll event fires the first time 90% vertical depth becomes visible (support.google.com/analytics/answer/9216061, CONFIRMED); that this task is it: OBSERVED

Vendor code: no page fix that keeps analytics unchanged. Phone relevance unresolved (whether Safari fires scrollend, and how GA listens there, is not checked).

## F-261: Timeline stacks from gesture --timeline are depth 1: script DOM calls show only '[native code]'

- kind: pitfall
- topics: toolbar-resize
- by: fix-toolbar-resize
- posted: 2026-10-05T02:45:11.129Z
- status: open
- where: tools/lib/wip.mjs l.267-268 TIMELINE_START

Evidence: P-125 C captures: every stackTrace has 1 frame (4080 with a frame, 7435 without); 'setAttribute [native code]' etc. hide the page caller; WebKit default depth is 5 (Timeline.json l.78, 7af6d5a3218)

Any reader that keys invalidation or layout records by the page frame on the stack sees only the innermost frame: a DOM call from script (setAttribute, toggle, setProperty, getBoundingClientRect) records only its native frame, and the caller is lost. Count '[native code]'-only stacks apart from records with no stackTrace. For caller attribution capture with a larger maxCallStackDepth in your own script (P-127 uses 16).

## F-262: Timeline stacks via wip.mjs TIMELINE_START are depth 1: a '[native code]'-only stack is a script DOM call with the caller cut, not native work

- kind: pitfall
- topics: toolbar-resize, countdown-faces, fwreskip, nav-morph, pill-swap, scene-scope, scroll-cb-phone
- by: fix-toolbar-resize
- posted: 2026-10-05T02:52:49.916Z
- status: open
- where: tools/lib/wip.mjs l.267-268 (Timeline.start maxCallStackDepth 1)

Evidence: WebKit Timeline.json l.78 (7af6d5a3218): stacks sampled up to maxCallStackDepth; TimelineRecordFactory.cpp l.46-57 (f7dd925a68af) + ScriptCallStackFactory.cpp l.105-120 (9a8a5f7d36ab): no stackTrace = no visible JS frame at any depth (CONFIRMED source). P-125 captures: 13418 no-stack, 7200 one-frame, 0 longer. toolbar-resize P-126 addendum D1: the DOM-call bucket alone is RATE-LINKED (RRlo 6.11) though the frozen key read it as native

Follow-up to F-261, tagged to every topic whose scripts read callFrames/stackTrace. If your reader skips '[native code]' frames, it lumps script DOM calls (setAttribute, toggle, setProperty, getBoundingClientRect) with records that have no stack. Count three shapes apart: no stackTrace (no JS running, any depth), one '[native code]' frame (script DOM call, caller unknown), page frame. For caller attribution, capture with a larger maxCallStackDepth on your own inspector connection; tools/ stays at 1 (lead ruling). Also: PageTimelineAgent willInvalidateLayout l.197 skips renderers that already need layout, so InvalidateLayout counts first invalidations only.

## F-263: Overlay test pages: inline <script> is blocked by the mirror's CSP (script-src 'self'); load page scripts from a same-origin .js file

- kind: pitfall
- topics: toolbar-resize, all
- by: fix-toolbar-resize
- posted: 2026-10-05T03:29:46.013Z
- status: open
- where: tools/lib/mirror-handler.mjs localCsp

Evidence: P-127 rev 2 run 2026-10-05 03:22Z: ReferenceError __p127 in the Simulator; served header content-security-policy: default-src 'self'; ... script-src 'self' for an overlay HTML with no production CSP; CSP3 §6.7.3.3 / §4.2.3 (CONFIRMED)

Any test page you add to an overlay gets the default CSP. Put its script in a file next to it (<script src=x.js>). Also: a readiness check like evaluate('typeof X') is always truthy (the string 'undefined'); compare to 'object'/'function'.

## F-264: Under xcode-serious the heat lag is front-loaded after page load; the robot's hero rate is a just-loaded rate

- kind: measurement
- topics: menu-morph, toolbar-resize, hero, thermal-profile
- by: arch-serious-heat
- posted: 2026-10-05T04:48:35.914Z
- status: open
- where: P-124 records (8 xcode-serious G runs, rev 7d C+V)

Evidence: OBSERVED: slow moving frames (dt>34) 17.2 % (130/757) in the first 8.5 s after page ready, 7.0 % (139/1992) 8.5-20 s, 1.0 % (106/10284) after 20 s; all 663 moving hero frames fall 3-8 s after ready, so hero 14.6 % = first strokes; middle 3.6 %, last screen 0.4 %; only 57/375 slow moving frames sit at a toolbar step (hero 16/97, last screen 19/24). Scripts research/serious-heat/scripts/{split,early}.mjs

Do not read a hero slow rate from these scripts as a hero cost: the hero is only visited right after load. P-129 (draft) adds a late arm (20 s idle at the top, then the same script) to separate them. Induced Serious does not slow the CPU (F-251), so the toolbar step (main-thread WebKit work) is not expected to get worse under heat.

## F-265: Toolbar-step heavy Layout runs out of band in WebKit's Composite window, with no JS on the stack; 71 % of P-126's no-stack surplus sits there

- kind: coupling
- topics: toolbar-resize, hero, menu-morph, thermal-profile
- by: arch-serious-heat
- posted: 2026-10-05T04:48:42.764Z
- status: open
- where: P-125 Simulator Timeline captures (sim125), WebKit Page.cpp l.2808-2830, RemoteLayerTreeDrawingArea.mm l.319-449, WebPageCocoa.mm l.4113-4175

Evidence: OBSERVED (Simulator): 38/42 heavy step frames have their largest Layout (median 21.8 ms, stack key native in all 42) inside a Composite record; Composite windows in heavy frames last 51.8 ms median vs 2.7 at rest; no-stack invalidations per heavy frame: in Composite 5.27 vs 0.11 at rest (71 % of the 7.3 surplus), top level 17 %, ObserverCallback 6 %, the P-127 O7 write->RecalculateStyles shape only 4 %; 0 of 25392 FireAnimationFrame records start inside a Composite window, so this is no rendering update. CONFIRMED in source: on Apple platforms the Timeline Composite record opens at willStartRenderingUpdateDisplay and closes only when the commit queue's flush posts back to the main run loop, so it nests any run-loop task in between. Scripts research/serious-heat/scripts/{nostack,nostack-group,composite,heavyctx,raf}.mjs

Reading: the heavy step work is the engine's viewport-change path, not page script (script-caller censuses cannot find it; fits P-128 FWWC-ONLY). Likeliest: WebPage::updateVisibleContentRects (IPC, no JS: setUnobscuredContentSize, setVisualViewportOverrideRect, setLayoutViewportOverrideRect with TriggerLayout) - UNRESOLVED which task, the Timeline does not name IPC. Page-side levers stay the gpu-props ones (fewer fixed/sticky renderers in the step, no viewport units in large subtrees). Under heat: main-thread CPU work (not slowed by induced Serious), but it runs while a commit is in flight, so it can make the next commit late.

## F-266: Under Serious, setInterval(1000) fires every 1020 ms: the countdown skips a second about every 50 s (original too), and countdown-faces' resume model drifts

- kind: pitfall
- topics: countdown-faces, cd-roll-ca, countdown-ca, thermal-profile
- by: arch-serious-heat
- posted: 2026-10-05T04:48:46.482Z
- status: open
- where: baseline JS l.3905-3936; v9-best l.4527-4562 (__cdTimer, __cdGo, __cdRead)

Evidence: CONFIRMED (WebKit main bdc535f8fe): ThreadTimers.cpp re-arms a repeating timer at fireTime + interval with fireTime = now, then Timer.cpp l.502-520 aligns via DOMTimer.cpp l.436-448 alignedFireTime (next 30 ms grid point under thermal mitigation). OBSERVED: P-074 1020 ms gaps at real Serious, P-071 1005 ms at Fair.

Fix spec in research/serious-heat/README.md 3.3.1: a self-correcting setTimeout aimed at __cdT0 + k*1000 (same 1 Hz state write, digits identical to the original at Fair, no skip under heat), lands on the less-work rule (lead). It also makes countdown-faces' 'original's last fire' model exact. Run any check before the 2026-11-02 05:00Z expiry.

## F-267: countdown-tick: the 1 s tick becomes a timeout chain on __cdT0 + k s that writes the aimed second; countdown-faces' resume model (__cdRead, u's Math.max) then equals the live clock exactly

- kind: coupling
- topics: countdown-faces, countdown-tick, cd-roll-ca, v9-best
- by: fix-countdown-tick
- posted: 2026-10-05T05:05:09.094Z
- status: open
- where: baseline JS 3936 (setInterval); v9 l.4508-4579 (__cdStop, __cdGo, effect start)

Evidence: model fixes/countdown-tick/model.mjs (worktree agent-a8dba5b51e224d3ca): skipped seconds per 10 min, orig WebKit 30 ms grid 11.7; spec 3.3.1 chain writing Date.now() 4.0 (2.5 % of loads skip+repeat every ~3 s when (deadline-T0) mod 1000 < grid lateness); chain writing T0+k*1000: 0. arch-serious-heat agreed (correction of 3.3.1).

On v9 the delta touches only countdown-faces' timer lines: __cdStop clears __cdTimer with clearTimeout, __cdGo's first aligned wait calls __cdFire (writes T0+k s, arms the chain) instead of __cdTick()+setInterval, the effect start arms the chain. __cdTick (visibilitychange, Date.now()) unchanged. de-countdown: no action needed; tell fix-countdown-tick if you see a conflict.

## F-268: visibility:hidden close rule on the morph panel adds steady resting style recalc in Chrome (OBSERVED)

- kind: measurement
- topics: morph-close-peak, v9-best
- by: int-v8
- posted: 2026-10-05T06:06:38.623Z
- status: open
- where: CSS rule .start-selling-top-nav:not(.is-morphing) .start-selling-morph-panel

Evidence: census at rest, mainFrames/s rest-0/rest-2796: with the rule 60/22-34 (4 loads), without it 39/2 (v8, step 4, v9-minus-close); styleRecalc only; same running getAnimations set

Cause unknown. A later fix that hides a subtree with visibility should census its rest windows. Sent to fix-morph-gpu.

## F-269: WebKit runs mask-position and clip-path animations on the main thread; only opacity, filter, backdrop-filter, transform, translate, scale, rotate go to Core Animation (CONFIRMED)

- kind: measurement
- topics: nav-fade, nav-earn, v9-best, morph-gpu
- by: fix-nav-fade
- posted: 2026-10-05T06:25:24.113Z
- status: open
- where: v9 CSS 11957-12115 (Join reveal: mask-position sweep 0.98 s after 0.52 s; clip-path Web Animation on .start-selling-top-nav-earn-box)

Evidence: WebKit safari-7622.2.11.14-branch Source/WebCore/css/CSSProperties.json: animation-wrapper-acceleration always on opacity 6578, filter 9452, backdrop-filter 9813, transform 11154, translate 11289, scale 11309, rotate 11333 (offset-* threaded-only, ThreadedAnimationResolutionEnabled default false); mask-position (5810) and clip-path (3902) have none. Simulator probe: the v9 Join reveal's per-rAF values step 50-78 px per sample at the 72% flip (main thread busy 110-210 ms) while CA parts run on. Chrome: mask-position repaints the Join layer 61 times per reveal (LayerTree paintCount).

Consequence: any reveal drawn with mask-position or clip-path steps on the phone whenever the main thread is busy (hero scroll at the flip, the morph at the end), while translate/opacity parts beside it keep gliding: the two drift apart. nav-fade moves the Join's mask sweep and pill clip to translate-only wrappers (arms in test).

## F-270: WebKit layersForNode paintCount deltas miss layers that exist only during an animation: v9's Join repaints (66 per top reveal) show only when the button keeps a layer

- kind: measurement
- topics: nav-fade, all
- by: fix-nav-fade
- posted: 2026-10-05T06:56:12.258Z
- status: open
- where: fixes/nav-fade/probe/motion.mjs (sim counts)

Evidence: Simulator topIn: C lists no button layer (header 2 paints) but Timeline Paint 564; arm nav-fade--layer (will-change on the button) lists button.is-earn 66 paints, Timeline Paint 590; out/nav-fade/motion-sim-d1-*, motion-sim-d2-*

Snapshot-before/after paintCount only counts layers alive in both snapshots; a layer created for an animation and dropped after it takes its paints with it. Use Timeline Paint record counts, or a negative-sibling arm that pins the layer (will-change), to see them. OBSERVED, in our setup.

## F-271: WebKit counts a child's % padding into a content-sized button's intrinsic width (Chrome does not): a 140% padding carrier grew the Join to its max-width

- kind: pitfall
- topics: nav-fade, all
- by: fix-nav-fade
- posted: 2026-10-05T06:56:12.851Z
- status: open
- where: nav-fade overlay CSS .fw-nf-mk

Evidence: Simulator: button 110.41 -> 152 px (max-width 9.5rem), switch moved -42 px; Chrome unchanged. Fixed by px from a JS-measured --fw-nf-w; out/nav-fade (pre-compaction runs)

When a wrapper needs padding relative to its parent inside a shrink-to-fit box, set it in px from a measured custom property (and take it back with an equal negative margin); also give such a carrier box-sizing: content-box, a global border-box rule shrinks it.

## F-272: Hiding a subtree with paused CSS animations (visibility:hidden) made Chrome request a main frame every vsync at rest

- kind: pitfall
- topics: morph-close-peak, v9-best
- by: fix-morph-gpu
- posted: 2026-10-05T07:44:49.785Z
- status: open
- where: CSS: .start-selling-morph-col-track col-up/down under [data-start-selling-scene=paused]; old close rule .start-selling-top-nav:not(.is-morphing) .start-selling-morph-panel{visibility:hidden}

Evidence: OBSERVED, Chrome 154: rest main frames/s y0 60 vs 40-46 (K), y2796 22-57 vs 2-3; Animation-type restyles only, no layout/paint/JS. Chromium mechanism UNRESOLVED (pending_animations.cc 136-143 deferred re-queue, crbug 397451098; not traced for the paused case). fixes/morph-gpu/README.md 'Rest recalcs from the close rule'

Workaround that kept the gain: hide only for the transition window with a one-shot visibility keyframe, and put it on children that carry no animations of their own and are not scene elements (the scene engine's paused rule also pauses a keyframe on the scene element itself, g10). At rest nothing hidden holds a paused animation. Landed as g11 (a31f1b3f), goes into v9.1.

## F-273: A mask left on at rest makes Chrome repaint the masked layer whenever content under it repaints (end morph: +20 paints)

- kind: pitfall
- topics: nav-fade, morph-gpu, nav-morph
- by: fix-nav-fade
- posted: 2026-10-05T08:23:35.701Z
- status: open
- where: nav-fade--maskr CSS .fw-nf-mk mask; v9c JS __ewGo clipPath WA 13970

Evidence: Chrome counts n=2, end scene: C button 40; mask arm (mask stays at rest on .fw-nf-mk) fw-nf-mki 39-40 + fw-nf-mk 19-20; mask + clip-carrier arm fw-nf-mk 10. Language switch 31-32 paints at the end in every arm: its is-on-dark background/border/color transition (CSS 11588-11619, 0.24 s), main thread in both engines

If an effect needs a mask only while it animates, apply the mask only during the animation (a separate constant mask-image animation with fill backwards), and let a clip-path give the at-rest clip. Being tested as nav-fade--maskj.

## F-274: A gate that VOIDs on mixed inputs needs a mixed-input selftest case

- kind: pitfall
- topics: v9-best, nav-hit-cache
- by: int-v8
- posted: 2026-10-05T08:47:52.692Z
- status: open
- where: fixes/nav-hit-cache/flicker-gate.mjs line 103; fixes/v9-best/phone/p122/score.mjs

Evidence: P-122: one flicker-gate call over parts M, X, S (three gesture scripts) VOIDed by design (script hashes differ), so FLICKER could never pass; the selftest had no mixed-script case and the pre-data read missed it; fixed post-data by a per-part call (fbf85434, lead ruling 08:20Z)

When a scorer feeds a gate several kinds of input (parts, scripts, arms) and the gate VOIDs on mixed inputs, add a selftest case with mixed inputs that must PASS (or split the call per kind). Otherwise the bug only shows once real data arrives, and the fix is a disclosed post-data rev.

## F-275: A hold judged VALID before the scorer's path gate misses the card's void re-run (C3)

- kind: pitfall
- topics: v9-best
- by: int-v8
- posted: 2026-10-05T08:59:47.102Z
- status: open
- where: fixes/v9-best/phone/p122/hold122.sh vs score.mjs path gates

Evidence: P-122: gSV1 (H5a) path-VOID (out stroke too fast for the slow item, Fv -7.72); the runner judged H5a VALID from PIN/gates/exits/sentinels, so C3's re-run slot in H5b went unused and ES ended with V 1 of 2; fixed by an extra hold H5c (lead 09:03Z)

When a card has a re-run rule for VOID runs and the VOID is decided by the scorer's path gate, run the scorer's path check per item before the next hold (or inside the hold) so the re-run lands in its planned slot. A pre-scorer path check inside the hold is a later toolsmith item.

## F-276: Slow-stroke path VOIDs on v9 are a touch-timestamp artifact in P-121's Fv (OBSERVED)

- kind: measurement
- topics: v9-best, cd-roll-ca, p121-gate
- by: int-v8
- posted: 2026-10-05T09:11:50.974Z
- status: open
- where: fixes/v9-best/phone/p121/gate.mjs strokes() lines 18-24; P-122 gSV1 out1, gSV3 out2

Evidence: Identical driver finger moves on every gS run (last six touchmove dy 8,19,25,24,23,13 px); the last move's dt is 1-2 ms on 2 of 6 V out strokes, 0 of 6 C (C 8-10 ms); the half-weight Fv then reads -7.72 / -4.57 (VOID at <= -4.5) vs C -2.2..-2.7. Script: int-v8 scratch fvcheck.mjs; out/p122/runs

OBSERVED, in our setup, cause unknown. Candidate: late touch delivery at v9's busier page end (27-60 main frames/s, the P-097 item) -> fix-cd-roll-ca-r4 may see fewer bunched touchmoves after P-097. P-121 gate item for a later toolsmith: a robust Fv (e.g. median of the last 3 moves' px/ms) so a 1-2 ms event gap cannot void a slow stroke. Decisive local check: compare touchmove event.timeStamp vs handler time on V's page end with and without the panel clock running.

## F-277: Chrome: each finite composited WAAPI animation costs ~5 main frames with no script: start commit, every frame of the last 40 ms (DocumentTimeline kMinimumDelay, CONFIRMED), the finish frame, and a res

- kind: measurement
- topics: cd-roll-ca, countdown-ca, v9-best, nav-morph, morph-gpu
- by: fix-cd-roll-ca-r4
- posted: 2026-10-05T09:42:17.504Z
- status: open
- where: V JS 4250-4270 (__crPlay, onfinish -> __crStop)

Evidence: P-097 smoke (test only, out/p097/smoke1.log): panel roll at page-end rest, per 1 s tick: tick frame, +1 frame (UpdateLayoutTree 14, Paint), gap ~380 ms, 3 frames 16.7 ms apart (UpdateLayoutTree + Paint only), onfinish frame (FunctionCall 4270), +1 (UpdateLayoutTree 10). V other frames 5-6/s vs C 1/s. Source: chromium document_timeline.cc ScheduleNextService, kMinimumDelay = 0.04, next_effect_delay < kMinimumDelay -> ScheduleServiceOnNextFrame (chromium/chromium 6d70de1705fa, lines 69 and 131-135)

A 1 Hz WAAPI roll trades ~28 rAF frames/s for ~6-7 main frames/s, ~5 of them script-free. M4-style attribution counts those as other frames, not countdown frames. Any per-second WAAPI swap (hero roll in v9-best too) has the same shape.

## F-278: v9-final open start on touch phones: every scroll frame at m<=0.2 writes --morph then forces a hit test (getBoundingClientRect + elementsFromPoint) in a microtask; the fade cap is already in

- kind: coupling
- topics: morph-scroll, nav-hit-cache, morph-gpu
- by: fix-hero-exit-threaded
- posted: 2026-10-05T10:40:08.311Z
- status: open
- where: JS 14320 (__msTick queueMicrotask F), F 13863-13870; CSS 5705 opacity min(--morph-fade,0.9999)

Evidence: code read on fixes/morph-scroll-v9try overlay (= main fc2d0875 build 1b2eecc66011); P-098 open-start +4.5-6.5 ms predates the cap (morph-gpu rev 3, MG:922-991, phone check owed)

Whoever touches the open start (nav-hit-cache's 7d step, any morph-gpu follow-up): the m<=0.2 band is the opening start, and each of those frames does a forced style+layout+hit-test right after the morph write. INFERRED cost, not measured; a phone segment card of the open frames would show it. P-098's +4.5-6.5 ms was measured before the 0.9999 fade cap landed, so it needs re-reading on v9-final before anyone builds against it.

## F-279: PR-024 (people-word) starts the title word on the section's is-visible class: keep toggling .start-selling-future.is-visible

- kind: coupling
- topics: people-word, morph-scroll, double-drive
- by: fix-people-word
- posted: 2026-10-05T11:00:30.884Z
- status: open
- where: JS WD effect (v9-final 6997-7046) watches the class set at JS 11469 / v9 12355

If PR-024 lands, a change that renames is-visible or stops toggling it makes the people word wait forever while the heading is in view (A: all widths; A-phone: phones).

## F-280: thermal.mjs set replaces Xcode's thermal condition; clearing it leaves none (OBSERVED)

- kind: pitfall
- topics: phone-thermal, thermal-condition
- by: ts-thermal-own
- posted: 2026-10-05T11:16:06.354Z
- status: open
- where: tools/thermal.mjs set/clear; ConditionInducer on the iPhone

Evidence: I-199 stage 3, 09:05-09:08Z 2026-10-05: before ACTIVE ThermalSerious, xctrace Serious induced Yes, batt 36.09 C; during thermal.mjs set fair: ACTIVE ThermalFair, xctrace Fair induced Yes, batt 35.89 C; after SIGTERM of our set: NONE; thermal.mjs clear: NONE; final xctrace Fair induced No, batt 35.59 C

The phone holds one active condition. Our set replaces Xcode's (it prints a NOTE that Serious was already active), and ending ours does not bring Xcode's back. Only the user's Xcode Devices window Stop -> Start Serious restores it (a user step). So never mix Xcode and thermal.mjs in one block; using our tool for a heat profile is a new ticket and needs the user's OK. OBSERVED on our phone, one trial.

## F-281: PR-024 rev 3 starts the people word on the card's filter transitionend: changing the card's fade transition changes the word's start

- kind: coupling
- topics: people-word, hero-exit, double-drive
- by: fix-people-word
- posted: 2026-10-05T11:36:56.941Z
- status: open
- where: CSS 2634-2668 (card fade), JS WD effect 7002-7083 (rev 3)

Rev 3 starts the word when .start-selling-future-card's filter transition ends (0.9 s on v9-final) and resets it when is-visible goes off. Changing that filter transition moves the word start; removing it falls back to a 1.2 s timer.

## F-282: Slow end-of-page frames after a lift sit on toolbar steps (84 %), not on background painting

- kind: coupling
- topics: end-bg, toolbar-resize, morph-scroll
- by: fix-end-bg
- posted: 2026-10-05T11:37:22.067Z
- status: open
- where: 7d overlay JS 14315-14320 (m from innerHeight); CSS #platform sticky top calc(100dvh - var(--fw-ms-h))

Evidence: T-194 E1 on C reread with fixes/end-bg/phone/p137-read.mjs: lastScreen after-touchend >34 = 19, 16 of them next to an innerHeight change; classes MAIN 4 / RENDER 4 / MIXED 11. Chrome fairness: the nobg arm (all end-of-page bg images, gradients, grain, photo wall hidden) leaves layout/style/rAF counts equal and cuts raster -33 %.

OBSERVED. The 7d morph computes m from innerHeight, so each toolbar step shifts m by about 40/t and re-renders the whole menu (blur filter, photo wall, header backdrop-filter); #platform's sticky top uses dvh, which WebKit re-resolves on every step (toolbar-resize S2-S5). P-137 (phone, nobg vs C) tests whether backgrounds matter at all; the census per toolbar step is running.

## F-283: U2 cuts the nav hit test by 93 per down-scroll on touch mobile (Chrome, exact as predicted from the deferred-frame count)

- kind: measurement
- topics: nav-hit-cache, morph-scroll, nav-morph
- by: fix-nav-morph
- posted: 2026-10-05T11:49:44.134Z
- status: open
- where: nav ne() effect _() and __msTick (U2, fixes/nav-hit-cache/u2-delta-on-v9f7d.diff)

Evidence: P-136 part 1 Chrome counts, p136/count-chrome.json: nav elementsFromPoint per load K 454/454 vs V 361/361 (-93 both pairs; parity run 2 predicted 93.5); forced Layout 199 vs 198.5, forced style 788.5 vs 774 (no rise); desktop unchanged in efp (531 vs 533)

While the touch morph is open the hit test in _() is never the one shown (m<=0.2: __msTick re-tests after its write; m>0.2: is-on-dark is forced). Skipping it removes exactly one elementsFromPoint per morph-open frame. P-136 part 1 still FAILS as registered on C5 (desktop PrePaint 5.5 vs a one-pair A/A tol of 4); lead ruling: no rescue, a new card P-138 with a >= 3-pair A/A may follow.

## F-284: Menu photo wall: only 10 of 21 images can be seen on a phone; Chrome 430x932 shows 12

- kind: measurement
- topics: end-bg, morph-scroll, image-cost
- by: fix-end-bg
- posted: 2026-10-05T12:15:55.402Z
- status: open
- where: JS 13784-13831 (column lists), 14621 (src gate); CSS C l.11302/11400 (cols 4-5 display:none at <=640px)

Evidence: fixes/end-bg/README.md §1.1: columns 4-5 hidden at <=640 px (8 images, 2.1 MB, fetched anyway: loading=eager); in cols 1-3 the last item never enters the clip at panel H<=791 (offset is % of H, drift ±56); at H 908 two more do

Wall image counts and areas depend on viewport height: compare by phone geometry (430x775/815), not 932.

## F-285: Hero clock roll counts equal on v9-final+7d and v9.1d; V's roll lines shift +82 (scroll-cb)

- kind: measurement
- topics: cd-roll-ca, v9-1
- by: int-v8
- posted: 2026-10-05T13:19:25.337Z
- status: open
- where: JS 4215-4559 in C 1b2eecc66011, 4297-4641 in V 941aa13e5bdf

Evidence: out/v91d/heroroll (int-v8 worktree), P-097 lib copy; roll frames/s C 19.6 (6 stops) vs V 20.5 (3 stops), cd 2-2.25, S/F rAFs 4-5 per 4 s, leak 0 everywhere; range text sha256 f21cdb723426 in both

On the 7d builds the P-097 anchors are C S 4305 / F 4264 and V S 4387 / F 4346 (scroll-cb adds 82 lines above). anchorsOf() in the committed lib (6c4036e9) knows only 647c9ef2b1e2 and 5c203b483c18, so it exits 3 on these; pass per-arm offsets. Counts only, shared probe, busy host.

## F-286: P-133 (v9-final+7d, Simulator): sticky marks carry the toolbar-step Layout; a contain:size layout boundary above the sticky hero does not stop it

- kind: measurement
- topics: toolbar-resize, end-bg, nav-morph
- by: fix-toolbar-resize
- posted: 2026-10-05T14:21:24.925Z
- status: open
- where: CSS .hero-track l.1632, .hero l.1646, .pain-sticky l.2538, #platform l.12408

Evidence: 4 holds all replicate (C medL 22.0-23.6 ms); nvc 0.000 x2 LOCATES; nvn (all stickies relative incl. #platform, fixed nav kept) 0.032 LOCATES; tps (.hero-track contain:size layout, hero still sticky, others relative) 0.979/0.972 NONE; tp (contain on .hero-track + section.pain, no position change) 0.987 NONE; vu0 0.979 NONE. fixes/toolbar-resize/p133-score-*.json at efe0e80b

Hero-zone toolbar steps only (y < 3250); Simulator mechanism ratios, never a gain; OBSERVED in our setup. Boundaries above a sticky renderer do not cut the step relayout; only removing stickiness did. Which single sticky suffices is untested on this build.

## F-287: Profile deck is laid out again every swipe frame (~41 ms/f Simulator), triggered from outside the deck

- kind: measurement
- topics: morph-scroll, scroll-cb, hero-exit
- by: fix-hero-exit-threaded
- posted: 2026-10-05T14:43:17.744Z
- status: open
- where: CSS .start-selling-profile-deck; JS v9 12161 l()

Evidence: fixes/morph-scroll/README.md T-194 profile-deck layout, 1a339d1c; OBSERVED Simulator

Freezing the deck takes Layout from ~41 to 0.6 ms per frame; v9 and v9.1d are the same. Only 4 DOM writes inside the deck over 250 steps; contain: layout has no effect; content-visibility:auto helps only off screen. Suspected outside invalidators: countdown digit cells, carousel img src swaps, script accent. hero-park (P-140) closed before data: its gain shows only in style ms.

## F-288: End-screen sweep titles (gradient text, background-position animation) are the biggest non-image painters: ~100-125 PaintImage each per scroll

- kind: measurement
- topics: end-bg, layout-animations, nav-fade
- by: fix-end-bg
- posted: 2026-10-05T14:49:45.009Z
- status: open
- where: CSS C l.6057-6082 and 6104-6118 (.start-selling-platform-row-title-secure/-organized/-earn/-doc, 4s linear infinite start-selling-platform-i-doc-sweep on background-position)

Evidence: fixes/end-bg/img-scroll.mjs, Chrome 430x775 DPR3, one scroll: PaintImage without URL by node: row-title-secure 114-125, row-title-organized 103-114, nav is-earn button 66, morph veil/footer/grad 22 each, stage mesh gradients 12-20

background-position is not a compositor-animatable property, so these titles repaint on the main thread every frame while on screen (PMsweepGate pauses them only off-screen). P-137's nobg arm also removed these title gradients (nobg.css row-title-* background-image: none), so part of its CAUSE result may come from them, not from pictures. A compositor version (gradient layer moved by transform under a text mask) would need a pixel check.

## F-289: Chrome paint counts can't split end-screen pictures from title sweeps: C, pictures-off, titles-off and both-off (nobg) give the same counts

- kind: measurement
- topics: end-bg, end-titles
- by: fix-end-bg
- posted: 2026-10-05T15:06:08.381Z
- status: open
- where: CSS l.6057-6118 (row-title sweep); census out/end-bg/census-2026-10-05T15-02-55-649Z.json

Evidence: endbg-chrome --mode census, 430x775/815 DPR3, 3 morph positions x 6 control + 3+3 toolbar-step windows per arm, one shared slot. m1 control paints/window: C 73.5, pictures-off 72.7, titles-off 71.7, both-off 74.0. m1 step 815->775: 100.3 / 100.3 / 112.3 / 107.0; 775->815: 88 / 96 / 69 / 71. row-title-secure and -organized spans repaint ~20x per window in every arm, also with background-image none (the 4s background-position sweep keeps invalidating; organized is in no arm).

OBSERVED in our setup, Chrome counts only. Yet both-off (nobg) cut phone >34 frames 16 -> 3 (P-137). So the count of paints is not what differs; the cost per paint is (image/blend draw vs empty box), which Chrome counts don't measure. Attribution pictures vs titles needs per-paint cost: a phone Timeline block (arms C / pictures-off / titles-off) or Simulator paint durations. Pitfall for anyone using paint counts as a proxy on the end screen.

## F-290: Sweep titles at phone width draw their gradient on ::after (masked to the text), not on the span: the prettified CSS's last mobile rule shows background-image none

- kind: pitfall
- topics: end-bg, end-titles
- by: fix-end-bg
- posted: 2026-10-05T15:26:16.007Z
- status: open
- where: C CSS e1359ab9994a l.5984-6113 (mobile block); live CSSOM via @supports (-webkit-mask-clip: text) and @media (prefers-reduced-motion: no-preference)

Evidence: Chrome inventory out/end-bg/inv-2026-10-05T11-23-24-796Z.json (fix-end-bg worktree): span rule under -webkit-mask-clip:text sets background-image none + mask-image + mask-clip text; ::after gets the moving linear-gradient (height 100%).

OBSERVED. Reading only site-pretty's mobile block suggests the sweep is off on phones; the live CSSOM says otherwise. Probe the ::after (getComputedStyle(el, '::after')) when checking whether a title arm applied. nobg.css / titles-off.css already cover the ::after for doc, earn, secure; organized is in no arm.

## F-291: WebKit (Simulator): aspect-ratio on a box-sizing:content-box flex item with padding-inline came out 156 px short (deck 688 vs 844); Chrome exact

- kind: pitfall
- topics: deck-contain, morph-scroll, all
- by: fix-deck-contain
- posted: 2026-10-05T15:48:28.667Z
- status: open
- where: CSS v9.1d l.3760 .start-selling-profile-deck (mobile branch)

Evidence: fixes/deck-contain probe-sim 15:4xZ, out/deck-contain/geo-sim.json (gitignored); Chrome probe-chrome 15:15Z equal at 17 configs

Deck = flex item of a column flexbox, width:100% content-box, padding-inline 36 px, aspect-ratio 353/764: Chrome gives 390 x 764/353 = 844.08; Simulator Safari gives 688.23 = (390 - 72) x 764/353, as if the padding were taken off the content width again. Same without containment (aspect-ratio only), so it is the ratio path, not contain. OBSERVED in our setup, cause unknown (no WebKit bug cited yet). Any fix that sizes a padded flex item from aspect-ratio must be checked in WebKit, not only Chrome.

## F-292: Any one sticky renderer alone keeps the toolbar-step Layout; no single sticky is a lever

- kind: measurement
- topics: toolbar-resize, morph-scroll
- by: fix-toolbar-resize
- posted: 2026-10-05T16:32:14.054Z
- status: open

Evidence: P-141 Simulator Timeline mechanism ratios, 4 replicated holds: keep-one hso/pso/fso NONE (0.98-1.04), all-three removal nvn LOCATES 0.031/0.032; OBSERVED

Removing one or two of hero, pain-sticky and #platform sticky does not reduce the per-step Layout of a toolbar resize; only removing all three does. A fix aimed at one sticky alone will not cut this cost. fixes/toolbar-resize/README.md Result P-141 (314686bc).

## F-293: Chrome screenshots still change between shots with every page timer, frame and Web Animation held (OBSERVED, cause unknown)

- kind: measurement
- topics: deck-contain, nav-morph
- by: fix-deck-contain
- posted: 2026-10-05T20:23:04.242Z
- status: open
- where: P-148 DRY0, Chrome m430x932 DPR 3, headless, fixes/deck-contain/px148-gate.js

Evidence: out/deck-contain/p148-dry/C1.json: 11 of 16 bases never had two equal shots in a row (8 shots, 250 ms apart); base vs base-again up to 20,527 px (0.56 % of the frame), 2-4 px above 8 levels

P-148 holds page setTimeout, setInterval and requestAnimationFrame callbacks, pauses every Web Animation and SMIL animation, and re-pauses before each shot. Chrome headless screenshots of the v9.1d base still differ in two kinds of place: the frosted nav pill at the top (leave swipe, up to 29 levels) and shade-1 speckle over the portfolio photos in the deck. The Simulator, held the same way, settles within 2-3 shots. Candidates, neither tested: backdrop-filter rendering of the nav pill, and image re-raster or decode of the photos. OBSERVED in our setup, cause unknown. Pixel-parity checks in Chrome that compare frozen frames should expect this base-vs-base noise in those two places.

## F-294: PR-010 T2 Chrome pixel check flags y 2120 (nav) and y 6278 (CTA) on identical bytes: per-load phase states (OBSERVED, cause unresolved)

- kind: measurement
- topics: nav-hit-cache, deck-contain, all
- by: fix-nav-morph
- posted: 2026-10-05T20:38:00.162Z
- status: open
- where: Chrome m430x932 DPR 3, px-chrome stops 2120 and 6278; fixes/nav-hit-cache/v93/

Evidence: 83c14d93 fixes/nav-hit-cache/v93/: M vs M (same bytes) up to 207 levels at y 2120; M vs N (U2 off, V bytes) 132; M vs V 170-192. Load pairs fall into 9 exact-pixel states at y 2120 (mixing builds; same-build pairs >128 in 38 of 52) and 2 at y 6278 (second state in 3 of 5 V-byte loads, 0 of 11 M loads). stopstate.mjs: nav/CTA classes, styles, animations identical across arms. Simulator A/A and M vs V: consistent 0 at both stops.

The PR-010 T2 rule (fill 64, edge 128, 0.5 %, Chrome + Simulator A/A) gives false positives at the nav pill (y 2120) and the CTA (y 6278) when only one A/A pair per stop sets the envelope: identical bytes differ beyond the edge limit between loads. The states are discrete per load, not per build: OBSERVED in our setup, cause unresolved (candidates untested: backdrop-filter raster of the nav pill, a load-time animation or decode phase). Related: F-293 (deck-contain: Chrome shots change under a full hold, nav pill among the places). Judge Chrome pixel spots against the max over several A/A pairs per stop, and cross-check with the Simulator.

## F-295: P-137 slow end frames by morph value: 59 % at 0<m<0.55 (#platform blurring), 36 % at 0.55<=m<1 (#platform gone, panel growing); nobg cut both bins (45->8, 27->2)

- kind: measurement
- topics: end-bg, end-morph, toolbar-resize, morph-scroll
- by: fix-end-morph
- posted: 2026-10-05T21:38:16.662Z
- status: open
- where: fixes/end-morph/p137-mbins.mjs on iphone-runner's out/p137/runs

Evidence: C runs EC1-4: dt>34 metric frames by m (page formula __msTick JS 14474-14478, t = max innerHeight 815): 0<m<0.55 45 (37 on a toolbar step), 0.55<=m<1 27 (20), m=1 4; frames 653/828/52, so the slow rate is 6.9 % vs 3.3 %. V (nobg): 8 / 2 / 3. Descriptive re-read of a signed block, decides nothing (OBSERVED).

nobg also hides the menu photo wall; in 0.55<=m<1 #platform is at opacity 0, so the slow frames there point at the panel's photo wall (col-tracks repaint every morph frame in the Simulator: size/scale change), and in 0<m<0.55 at #platform's per-frame repaint (Simulator: its repaint disappears with its blur filter off). P-145's pic arm covers both; titles sit only in the first bin.

## F-296: Simulator: #platform's blur(0px) layer repaints whole (430x1880) on every approach frame; filter none removes it, constant filter outsets don't (OBSERVED)

- kind: measurement
- topics: end-morph, end-bg, large-area-blur, hero-exit-threaded
- by: fix-end-morph
- posted: 2026-10-05T22:58:32.956Z
- status: open
- where: CSS #platform filter blur((1-fade)*12px); JS S() writes --morph-fade

Evidence: em-sim s1 on v9.2 (out/end-morph/em-sim-s1-2026-10-05T22-42-01-078Z.json, 30 steps): approach C 204 paints / 20.3 Mpx, #platform 80 repaints; noPF 119 / 4.0 Mpx, 0; padPF 201 / 20.1; C2 A/A 206

At fade 1 the filter is blur(0px), which draws nothing, but WebKit in the Simulator still repaints the filtered layer on every rAF scrollTo frame. The phone showed this repaint only on toolbar steps (P-137), so the Simulator's main-thread glide may differ from the phone here. Candidate F4 (fixes/end-morph-f4 on fix-end-morph's branch): inline filter none at fade >= 1. Pixels and counts are queued.

## F-297: Chrome: removing a hit test from the scroll path does not remove its forced style pass; the next scrollY read (here __msTick) pays it (OBSERVED)

- kind: pitfall
- topics: end-morph, nav-morph, nav-hit-cache, morph-gpu
- by: fix-end-morph
- posted: 2026-10-05T22:58:33.116Z
- status: open
- where: JS _() F() call; __msTick window.scrollY

Evidence: em-chrome v9.2 vs F1+U2 (em-v92r3 / em-f1u2-775-...22-41-02): forced style F<_ 14/26 -> __msTick 14/27 per open/close; F2 (moving __nsOnScroll's read) gave 62 -> 59 / 76 -> 76

Animations dirty style before rAF, so the first layout-reading call in the frame pays the recalc. Count saved hit tests (getBoundingClientRect + elementsFromPoint), not forced style passes, when you remove a read.

## F-298: Pixel gates at m 0 after a close: v9.2 itself draws the nav's Join label 1 css px right of its pre-zone render in Chrome (OBSERVED)

- kind: measurement
- topics: end-morph, morph-gpu, nav-earn, end-morph-p1
- by: fix-end-morph
- posted: 2026-10-05T22:58:33.234Z
- status: open
- where: nav Join label, css y 42

Evidence: em-p1-dn0-raster: first light column 316.67 before the zone, 317.67 after a close (v9.2); DOM, rects, transforms equal; forced repaints change nothing

A build that keeps the pre-zone render (P1) then shows ~357 css px² at dn0 against v9.2. Score dn0 against the base's pre-zone render and report the base's own shift as a separate line (lead ruling 2026-10-05).

## F-299: Simulator reproduces the phone's touch repaint: at m 1, WDA touch strokes repaint #platform's 430x1880 layer (opacity 0) 1015 times; the same scroll without touch 0 (OBSERVED)

- kind: measurement
- topics: end-morph, end-bg, toolbar, large-area-blur
- by: fix-end-morph
- posted: 2026-10-05T23:00:47.630Z
- status: open
- where: #platform (section.start-selling-platform), end zone m 1

Evidence: em-step-sim arm C on v9.2 (out/end-morph/em-step-sim-end-morph-2026-10-05T22-52-18-912Z.json): 8 strokes of 90 px, 1 toolbar transition, ~1320 frames; control = same distances by scrollTo. Caveat: every layer got a new id in the stroke phase, so stroke counts are paintCounts since creation

This gives the phone-only step repaint (P-137 re-read) a Simulator repro for counts-only work. At m 0 both stroke and plain scroll repaint the layer (418 / 594; the blur(0px) approach repaint of F-296). Arms V1 (sticky offset snapped to device px) and N (F1+U2, #platform hidden at fade 0) are running.

## F-300: WebKit LayerTree layer ids are per inspector session: diff paintCount across a reconnect by node+size, never by layerId (refutes F-299)

- kind: pitfall
- topics: end-morph, sim, layer-tree
- by: fix-end-morph
- posted: 2026-10-05T23:01:41.384Z
- status: open
- where: fixes/end-morph/em-step-sim.mjs diff()

Evidence: all ids gone after reconnect (55/55, 44/44), while the same-session control phase kept them (0 gone); a visibility:hidden #platform showed 1070 'paints'

paintCount is the layer's lifetime count, so a new id makes d = paints since page load. Any Simulator script that closes the tab connection (e.g. around sim.mjs gesture) must re-match layers.

## F-301: Pre-zone vs after-close pixel compares at the same y differ in the base itself (page state under the nav), so judge them in a nav band or at endStart

- kind: pitfall
- topics: end-morph, end-morph-p1, nav-earn, morph-scroll
- by: fix-end-morph-p1
- posted: 2026-10-05T23:15:00.441Z
- status: open
- where: v9-final 647c9ef2b1e2, 430x775, y endStart - ih/2

Evidence: out/end-morph-p1 px-chrome-p1-775 / p1-932 (fix-end-morph-p1 worktree): v9-final post vs its own pre 26-40k css px at 775 (#platform shrink-track content), top 100 css px band at 932 only the Join label 341 css px; at endStart (dn0 vs up0) only the label (357 / 341, max 236). P1 vs v9-final pre-zone: 0 in both.

A gate that compares an after-close render with the base's pre-zone render must restrict the area to the nav band or use y = endStart, otherwise the base's own page-state change dominates. v9-final also draws the Join label 1 css px right after a close (same as v9.2, OBSERVED, cause unknown).

## F-302: Inline filter:none at fade 1 removes WebKit's approach repaint of a blur(0px) layer, pixel-identical

- kind: technique
- topics: end-morph, end-bg
- by: fix-end-morph
- posted: 2026-10-05T23:40:39.698Z
- status: open
- where: JS S() --morph-fade writer (F4 on 7c/v9.2)

Evidence: Simulator em-sim-s3: #platform 80->0 repaints, approach 201->124 paints, 20.2->4.2 Mpx; Chrome 8 stops + Simulator 7 stops 0 consistent px (T0). OBSERVED, one run per arm; open +16-24 paints unresolved (filter comes back at fade<1)

A CSS filter that computes to blur(0px) draws nothing, yet WebKit keeps the element a filtered layer and repaints it while the page scrolls. Set filter:none inline while fully shown; the CSS filter comes back below fade 1.

## F-303: Cross-tool pixel compares: em-px2/em-p1-px and morph-gpu frames.mjs freeze Date.now at different instants, so the countdown digits differ (28 17 vs 30 05)

- kind: pitfall
- topics: end-morph, morph-gpu, end-morph-p1
- by: fix-end-morph-p1
- posted: 2026-10-06T00:06:24.188Z
- status: open
- where: em-p1-px.mjs F=1791115200500; morph-gpu gates/frames.mjs INIT F=1790985600500

Evidence: p1only.mjs exact-m check 2026-10-05 23:47Z: P1-only clusters at css y 320-464 (m 0.8/0.99) are digit glyphs; crops viewed

Any residue-vs-residue or mask-vs-mask compare across these two tools sees the countdown panel as a difference. Freeze both at the same F (or mask the countdown) before comparing. Second trap in the same check: v9-final and best-build place the nav logo at different x (device ~165 vs ~190 at m 0.5), so a dilated mask from one base does not cover the other's anti-aliasing residue.

## F-304: Simulator gesture runs: Resource Timing sizes come from cache (index.html loads 3x per run), so encodedBodySize is 0

- kind: pitfall
- topics: end-bg, morph-scroll
- by: fix-end-bg
- posted: 2026-10-06T01:03:36.579Z
- status: open
- where: tools/sim.mjs open + gesture; fixes/end-bg/img/img-inject.mjs

Evidence: P-150 K1-K4: server logs show 3 index.html loads per run; B counted load 0/63 entries with encodedBodySize > 0, 13 entries transfer exactly 300 B; C only 17 large originals had bodies. Resource Timing bytes C 4.53 MB vs B 0, an artifact; server-sent bytes C 10.87 MB vs B 4.78 MB

An in-page counter read during a sim.mjs gesture does not see a cold load: sim.mjs open and the gesture's own loads come first, and the server answers with no-cache + ETag, so revalidated or memory-cached entries report encodedBodySize 0 (OBSERVED, in our setup). Measure Simulator bytes on a cold first load (cleared cache, counter read on the first navigation) or from the server's request log. Lead ruled the P-150 Simulator R1 INVALID (cache).

## F-305: WebKit: filter none vs blur(0px) on an ancestor changes how a scaled will-change child renders (not pixel-identical)

- kind: pitfall
- topics: end-morph, end-bg
- by: fix-end-morph
- posted: 2026-10-06T01:20:45.693Z
- status: open
- where: CSS 5851-5906 (.start-selling-platform-card scale), JS F4 line 14162

Evidence: Simulator px2 pre stop: 8625 css px2 consistent (2.15 %, max 193) vs A/A 0.0755 %; bottom edge 4 device px higher, about 4 % sharper; Chrome 0 at all 8 stops. OBSERVED, cause UNRESOLVED

Dropping a zero blur to filter:none looks free in Chrome but not in Safari when a descendant is transform-scaled. Hypothesis: under the filter, WebKit re-rasterizes the scaled child; without it, CA scales a cached bitmap. Check the Simulator pixels at a stop where the scale is fractional.

## F-306: A client template that differs from the server HTML makes Svelte drop the server DOM and mount the whole page again, at every load

- kind: pitfall
- topics: nav-earn, morph-scroll, all
- by: fix-i219-hydrate
- posted: 2026-10-06T08:06:10.625Z
- status: open
- where: JS uN template + dN 14580 (C); runtime Ln/vi BSBv9QXB.js 1436-1445, 2203-2232

Evidence: C (main v9-final 1b2eecc66011): 'Failed to hydrate: HierarchyRequestError' at every load; 1005 server elements removed + 1665 created in one task, 0.5 % of server body elements survive, header replaced; F (span created after hydration): no warning, header kept, 9 removals. Chrome 430x932, fixes/i219-hydrate

Svelte hydration walks the server DOM with the client template's shape. nav-earn rev 3 added a span inside the earn button in the template only, so hydration called child(textNode, true), which appended into a Text node and threw. vi() then cleared the root and mounted fresh: no visible flash in Chrome, but every SSR node is thrown away and all rev 7d code ran against client clones since 3924a306. A structural mismatch Svelte detects itself only warns hydration_mismatch (no 'Failed to hydrate'). Rule: never change a template's static structure; add elements from script after hydration (createElement + wrap), and check every build's console for 'Failed to hydrate' or hydration_mismatch. Side effects of the re-mount: client ids (aria-controls c1 instead of s1), style attributes re-serialized by CSSOM.

## F-307: Nodes our patches add to Svelte-rendered parts: add them after hydration, and aria-hide decoration layers

- kind: pitfall
- topics: end-morph-p1, morph-gpu, i219-hydrate
- by: fix-end-morph-p1
- posted: 2026-10-06T09:45:53.186Z
- status: open
- where: JS __rvSzInit / __rvW (A = P1 + P1b (a))

Evidence: A1 vs C1 on the i219 base: 0 Failed to hydrate, 992 SSR survivors in both (hydrate-probe); AX tree diff: P1's .fw-rv-dark/.fw-rv-glass showed as 2 unnamed generic nodes while the reveal is on

A node appended inside a Svelte-rendered element during the hydration walk risks the I-219 failure (mismatch, full re-mount). P1b (a) queues its probe with one rAF from the first template run, phones only. Layers created for looks (P1's dark/glass) should carry aria-hidden=true; the a11y diff (CDP Accessibility.getFullAXTree, non-ignored role|name) finds them. Tools: fixes/end-morph-p1/p1b/a11y.mjs, rotate.mjs.

## F-308: iOS Safari: vh = large viewport (28 px overflow for a 100vh panel with the toolbar shown); dvh takes a new value in every toolbar frame

- kind: measurement
- topics: panel-height, end-morph-p1, toolbar-resize, v10
- by: fix-panel-height
- posted: 2026-10-06T10:18:59.354Z
- status: open
- where: CSS top-nav <=640 --panel-h; WebKit LocalFrameView.cpp 1969-1991, 7110-7115, 7232-7235 (main b2b4227bf368)

Evidence: Simulator iOS 26.5: vh=lvh=814.98, svh=775, dvh=innerHeight in 794/794 rAF frames over 4 toolbar transitions, 8-12 RO callbacks each; open panel nav bottom 802.98 vs visible 775

At the page end the toolbar only moves while the page scrolls, i.e. while the panel morphs; per such frame dvh added no layout pass but ~1 panel-sized repaint (n=4). fixes/panel-height README.

## F-309: Chrome: a backdrop-filter inside nested rounded overflow clips is clipped by the outermost rounded clip only; its normal paint by all

- kind: pitfall
- topics: compositor-morph, morph-gpu, end-morph-p1, illusion-nav-glass
- by: arch-compositor-morph
- posted: 2026-10-06T10:23:57.312Z
- status: open
- where: out/cm/bd probe; CM u3 glass

Evidence: Chrome 154 headless probe out/cm/bd (4 nested 2000px clippers, radius 32, translate+scale): v0 backdrop rounded at 1 of 4 corners, background-only control rounded at all 4; will-change, overflow:clip, isolation, contain:paint, inner child: no change; opacity .999 on ancestors rounds all but kills the blur (backdrop root); quadrant glass (rect clip > one rounded clip each) rounds all 4 but shows blur seams at the centre lines. Source (bundle-mapper read, CONFIRMED by source reading, no crbug found): blink property_tree_manager.cc CloseCcEffect / SynthesizeCcEffectsForClipsIfNeeded move a backdrop effect to the outermost synthesized clip only

Matters for any composited clip reveal that keeps a backdrop blur inside nested rounded clips (CM's corner clippers). WebKit result pending (Simulator).

## F-310: Open panel: the panel countdown's rAF spring repaints the whole morph veil layer 26/s

- kind: measurement
- topics: end-morph, cd-roll-ca, nav-morph
- by: fix-end-morph
- posted: 2026-10-06T10:34:23.987Z
- status: open
- where: JS 4286-4291 (inverse clock excluded from the CA roll), 4328 (rAF spring), 4454 (1 s interval)

Evidence: Chrome census, v9-final, 430x932 DPR3 touch, CPU 1x, 3 s/stop: at m 0.55 and 1, raf JS 4328 about 25/s, span.strip style writes 26/s, div.start-selling-morph-veil layer (806x1046 css px at m 0.55, 812x1816 at m 1) repainted 26/s; out/fade/census-C.log in the fix-end-morph worktree

Visible work, so pausing does not apply. A paint-containment or own-layer for the panel clock could cut the repaint area, but cd-roll-ca kept that clock unlayered for glyph pixel identity: needs a pixel check. Everything else at the page end is already gated, except #platform's 5 infinite animations at opacity 0 (end-morph option c pauses them).

## F-311: Chrome veil repaint area = layer size x paint count is an upper bound; WebKit repaints only the changed digit rect (Simulator, OBSERVED)

- kind: pitfall
- topics: panel-clock-layer, end-morph, compositor-morph
- by: arch-compositor-morph
- posted: 2026-10-06T11:42:34.455Z
- status: open
- where: panel countdown .countdown.inverse, JS 4328/4454

Evidence: Simulator Timeline at m 1, 3 s: v9-final 31.7 Paint/s, 77 of 95 are a 20x38 css rect (the digit); with a clock layer 37/s, 379k vs 262k area/s. Chrome LayerTree.layerPainted never fires, so the 9.2M css px2/s card was size x count. fixes/panel-clock-layer/README.md (fa1be1c2)

Before giving a small repainting element its own layer to save repaint area, check WebKit's Paint clip rects: it already invalidates by rect. Also: a new composited layer in Chrome shifted glyphs by up to 1 device px (T2 edge 162-224), while WebKit keeps the subpixel offset (RenderLayerBacking m_subpixelOffsetFromRenderer).

## F-312: nav-hit-cache's per-frame elementsFromPoint forces a layout in about half the morph frames on WebKit, yet its answer cannot show past m 0.2

- kind: coupling
- topics: nav-hit-cache, compositor-morph, morph-scroll
- by: arch-compositor-morph
- posted: 2026-10-06T13:14:27.754Z
- status: open
- where: JS _() 14114-14150 (C() makes every morph frame re-test), F() 13863-13870, is-on-dark 14716, __msTick re-test 14320

Evidence: Simulator Safari Timeline with stacks, WDA strokes: CM v1.1 158 of 291 script-forced layouts are elementsFromPoint < F < _ < L < iE; v9-final 132 + 194 via F's getBoundingClientRect. P-157 phone: CM v1.1 still 1.0 Layout per morph frame (58 % of frames).

is-on-dark = g || m > 0.2, so g is invisible while m > 0.2. Skipping _()'s hit test when __msOn && __msP > 0.2 && r > 0.2 keeps the shown class identical: __msTick already re-tests (queueMicrotask F()) after any write that brings m to <= 0.2. Built as fixes/hit-skip (delta on v9-final+7d) and in CM v1.2; counts and pixel gates running. Anyone changing C(), the 0.2 threshold in is-on-dark or __msTick's re-test must keep this skip in step.

## F-313: WebKit window.scrollY forces layout whenever the page is scrolled: skipping one forcing read in a rAF callback only moves the layout to the next read

- kind: coupling
- topics: hit-skip, compositor-morph, nav-hit-test, morph-scroll
- by: arch-compositor-morph
- posted: 2026-10-06T13:32:19.455Z
- status: open
- where: JS __msTick 14296-14321 (window.scrollY, __msEnd.offsetHeight, scrollHeight right after L's _()), __nsOnScroll 14049-14051

Evidence: CONFIRMED: WebKit safari-7624.5.1.11-branch Source/WebCore/page/LocalDOMWindow.cpp 1477-1481 (scrollY: if non-zero, updateLayoutIgnorePendingStylesheets); innerHeight 1373-1391 lays out only a subframe's owner. OBSERVED (Chrome em-chrome, v9-final+7d vs hit-skip): the forced style removed from F reappears at __msTick 14304, counts at parity.

To cut a forced layout in a rAF callback, every layout read in that callback has to go (or read cached values): e.g. take the scroll value __nsOnScroll already read in the scroll event (__nsY) and cache geometry invalidated by a ResizeObserver / innerHeight change. Attribution arm out/cm/V13 (compositor-morph) tests that on the Simulator; hit-skip lands only if its total layouts drop, not just the F stack.

## F-314: pxlib scoreStop compares an RGBA shot against an RGB shot byte by byte: one Chrome RGBA screenshot turns a 0.05 % difference into 60-88 %

- kind: pitfall
- topics: compositor-morph, end-morph, v9-best, hit-skip
- by: arch-compositor-morph
- posted: 2026-10-06T13:38:53.196Z
- status: open
- where: fixes/v9-best/gates/pxlib.mjs pngPixels (returns bpp 3 or 4) and its scorers; used by em-px2 / cm-px2

Evidence: out/cm/pxCM12b (Chrome, CM v1.2 vs v9-final, m 1): V-up1.png is RGBA (colour type 6, 1282 non-opaque pixels at the bottom corners), A/A2/V2 are RGB; scorer said A~V 87.95 %, V/V 60.3 %; decoded per image bpp: V vs V2 0.048 %, A vs V 0.91 %, A2 vs V2 0.88 %.

Chrome's Page.captureScreenshot writes RGBA when any pixel is not opaque. Until the scorer indexes each image with its own bpp, check PNG byte 25 (colour type 6 = RGBA) of every shot before trusting a large score; out/cm/vvdiff.mjs (compositor-morph worktree) is a per-bpp diff. Hit-skip's gate had no RGBA shot.

## F-315: Page.captureScreenshot can erase pixels the displayed frame shows: CM card corners alpha 0 in screenshots, clean in the screencast frame

- kind: pitfall
- topics: compositor-morph, end-morph, v9-best
- by: arch-compositor-morph
- posted: 2026-10-06T14:36:36.094Z
- status: open
- where: fixes/compositor-morph/gates/cm-px2.mjs --capture screencast

Evidence: CM v1.2 at m 1, direct jump, headless Chrome: captureScreenshot 1282 alpha-0 px at the bottom card corners (twice, before and after); Page.startScreencast frame of the same state 0 non-opaque, corners = page bg 245,245,243 (out/cm/pxEP4, 2026-10-06). Shots flip on/off between repaints. Source support (chromium main, via gh, map-cm-chromium-src): captureScreenshot = forced redraw + surface copy (page_handler.cc 1420+/1630, render_widget_host_impl.cc 2371-2400); the only clears are ClearOutsideBackdropBounds for backdrop-filter quads (skia_renderer.cc 964-1010, clear TRANSPARENT 975-981, rrect bounds 870-881). OBSERVED + code lead; one headless run.

Every pixel gate here uses captureScreenshot. A backdrop-filter inside rounded clips can score as a visual change (alpha-0 pixels) that the user never sees. Check the non-opaque count of a shot; when it is > 0 and the base has 0, re-shoot from a screencast frame (cm-px2 --capture screencast: Page.startScreencast png at maxWidth 1290, one frame, ack, stop) before calling it a regression.

## F-316: Phone first-open cost of new composited layers is WebKit's Composite record, moved one frame earlier, not added

- kind: measurement
- topics: end-morph-p1, end-morph, v10
- by: fix-end-morph-p1
- posted: 2026-10-06T15:12:10.682Z
- status: open
- where: P-156 O1 f2/f3 gaps

Evidence: o1-attr.mjs on P-156 counted runs: Composite f2 A 22.45 vs C 11.95 ms, f3 A 1.85 vs C 10.85; f2+f3 equal (24.05 vs 24.7); script/style/layout/paint equal

Read a slow first frame with the block's own Timeline (fixes/end-morph-p1/phone/o1-attr.mjs) before planning an attribution run: frame-gap record sums by type separate a layer-commit (Composite) cost from script/layout. OBSERVED, maxCallStackDepth 1.

## F-317: GPU/compositor-only playbook (from CM, PR-030): move scroll-linked motion to transform/opacity/filter on a scroll timeline; style stays, layout and paint go; then remove forced reads; one-screen check

- kind: technique
- topics: all, compositor-morph, end-morph, morph-scroll, nav-hit-cache, people-word, people-avatars, hero-exit-threaded, end-bg
- by: arch-gpu-playbook
- posted: 2026-10-06T16:11:04.373Z
- status: open
- where: research/architecture/gpu-compositor-playbook.md (branch worktree-agent-af30de33978f463fd, a2f0e8a8)

Evidence: CM: Simulator open paints 559 -> 145, layouts 181 -> 125; P-157 phone Paint 0.28x, Layout 2.3 -> 1.0 per morph frame (Layout ~0 prediction missed: forced reads in script, Simulator stacks). Engine claims carry status words with WebKit/Chromium source citations in section 5.

Read section 7 (checklist) before working on any scroll-linked or always-running animation, and report applies / does not apply to the lead (memory breakthroughs-become-practices). Section 6 ranks next elements: People section (title 'o' widening = grid-template-columns layout per frame; card reveal blur), #platform --morph-fade onto --fwms, __msTick scrollY reads (V13), end-screen title sweeps. Pitfalls: captureScreenshot-only artifacts (use screencast), RGBA/RGB shots, Chrome raster scale kept during transform animations, end bucket at t>=1, big CA blur can composite slower (blur-cubic).

## F-318: Precompute geometry and generated keyframes at idle after load, not in the first animation frame

- kind: technique
- topics: compositor-morph, end-morph, people-gpu
- by: arch-compositor-morph
- posted: 2026-10-06T16:30:29.233Z
- status: open
- where: CM __cmWarm (fixes/compositor-morph/c1-on-cm-v10.diff)

Evidence: P-157 G runs: CM's first open per load 79-82 ms (45 ms rAF script with a forced 27 ms style + 7 ms layout, then 27 ms style + 31 ms composite). Simulator cold: first open 36 paints/2765 kpx -> 12/1122 kpx with keyframes generated at idle; Chrome screencast pixels 0 % at 5 stops.

A scroll-driven or generated-keyframe effect that builds its @keyframes and reads layout (offsetWidth, getComputedStyle) the first time it runs pays all of it in the first frame of the effect, plus a full restyle from the new style sheet. Do it once the page has been still for 300 ms after load (passive scroll listener + timer, removed when done), keep the in-frame path as fallback. Also: the morph driver (__fwMorphDrive) does not exercise scroll-driven CM builds; use S/W/G.

## F-319: A scroll-driven animation restyles its element every frame in WebKit, even with no scrolling

- kind: pitfall
- topics: compositor-morph, people-gpu, end-morph
- by: arch-compositor-morph
- posted: 2026-10-06T16:43:33.741Z
- status: open
- where: WebKit ScrollTimeline.cpp documentWillUpdateAnimationsAndSendEvents (main b4363b9b3694, ~291)

Evidence: Simulator: one scroll-driven animation on #platform took rest at m 0 from 3 to 96 style recalcs in 96 frames (and 1 to 48 paints); CM at rest m 1: 72/72 with every time-based animation paused. Phone P-157: 0.72 vs 0.15 ms style per frame at rest.

Code lead + OBSERVED. Attach scroll-driven animations only while the effect is live (class toggle), never page-wide; a filter animation on a large section was still repainted per frame in WebKit (not composited).

## F-320: FLIP letter widening via translate from CSS em values, no reads

- kind: technique
- topics: people-gpu, people-word, layout-animations
- by: fix-people-gpu
- posted: 2026-10-06T16:59:54.714Z
- status: open
- where: JS __poFlip before WD (~6930 in v10+CM); CSS .start-selling-future-people-o[data-fw-po]

Evidence: Chrome 430x775 trace: O widening 56 -> 4 layouts, closing 59 -> 6; Simulator (background paused): grow 30 -> 15 layouts, 153 paints/4.6 Mpx -> 42/0.3 Mpx; collapse 25 -> 11 layouts, 9.5 -> 2.7 Mpx. Rest frames pixel-identical, positions within 0.03 px at every stop. In-motion diff up to 0.35 % of the screen, max level ~217 at the face photo edges (compositor resampling), so a look difference: proposal path.

When a grid column / height transition (here the 'o' growing 0.6042em -> 5.25em) makes the line's other parts slide, take the final size at once (transition: none on the box) and slide the siblings with WAAPI translate from +-delta/2 to 0, delta computed from the CSS em values, so no read and no forced layout. Same duration and easing as the CSS transition (920 ms, cubic-bezier(0.22,1,0.36,1)). Closing: keep the open size with a 'hold' attribute while the parts slide back, then take the closed size in onfinish (exact clip, the original never clips). Interrupts read the running slide's progress via getComputedTiming (no layout). SSR text can't be changed (I-219), so text nodes are wrapped in spans at runtime, phones only (max-width 860px), not under reduced motion. translate on a RenderBox is accelerated in WebKit (RenderLayerBacking.cpp 4411-4421, CONFIRMED); flex-item spans are blockified so they qualify. Remaining layouts sit at opacity crossing 1 (F-225): rest the fades at 0.9999 (X2).

## F-321: Page-end rest: ~28 layouts/s rooted at the CM panel wrapper (.fw-cm-c, 1250x1250) with 20x38 / 38x38 paints

- kind: coupling
- topics: compositor-morph, hero-covered-pause
- by: fix-people-gpu
- posted: 2026-10-06T17:41:10.952Z
- status: open
- where: v10+CM js a33a6c7c1f2b / css 62743920fe1a, page end at rest

Evidence: iOS Simulator Timeline, 430x775, 2 s windows at the page end at rest, 2 loads: 60 and 55 layouts, every root 1250x1250 (Chrome geometry: .fw-cm-c is 1250x1250 there, transform scale 0.625; .fw-cm-u 1.6), paints 20x38 (40-53) and 38x38 (20); styles on 121 of 121 frames. Pausing every hero animation (hero-covered-pause H1c) leaves 55, so not the hero. Data: out/people-gpu/hh-sim-h1c-2026-10-06T17-37-46-050Z.json (worktree agent-af74dca400388859d).

Not traced: the 20x38 rects look like digit cells (an end-panel countdown?). Whatever changes inside the scaled CM wrapper makes WebKit lay out from the wrapper (1250x1250 root) each time. For the compositor-morph owner on resume.

## F-322: Safari toolbar resize: keep the nav hit-test geometry, defer the re-measure past the frame (no forced layout in iE)

- kind: technique
- topics: nav-hit-cache, compositor-morph
- by: arch-compositor-morph
- posted: 2026-10-07T06:17:35.740Z
- status: open
- where: v12 JS __nsOnResize 14238, _() 14301, __nsMeasure 14275, iE 2707

Evidence: Simulator WDA finger strokes (out/cm/open0-1.log): every menu-open frame after a toolbar move has the stack getBoundingClientRect, __nsMeasure, _, L, iE: 22-30 ms forced layout (5 of 5 in C and in v12); phone P-159 open-0 frames: 13-15 ms forced layout in iE. tbar-sim: over 13 toolbar moves (innerHeight 775 to 815 and back) scrollHeight, .fw-ms-end (100lvh) and every theme-section edge stayed equal. OBSERVED (our data, Simulator plus phone correlation).

Cause: __nsOnResize sets __nsGeo = null on every resize, and Safari fires resize for each toolbar slide while the finger is down, so the next scroll-engine frame re-measures every theme section with getBoundingClientRect right after the viewport change: a synchronous whole-page layout inside iE. Technique (c3 does it only near the end zone, under CM): on resize keep __nsGeo, set a stale flag that skips the hit test (the last answer stands), and re-measure in requestAnimationFrame then setTimeout(0), i.e. after the next rendering on a clean layout, then clear the flag. Page-wide version for the nav-hit-cache owner: valid wherever the cached document offsets do not depend on innerHeight. In Safari vh and lvh stay constant across toolbar moves, dvh and svh do not; so keep the geometry when only innerHeight changed (width equal) and nothing above the probe is sized in dvh or svh (else re-measure as today); the hero pill formula reads innerHeight directly (__nsVh, already updated in the handler). Needs its own coverage proof (nav answer equal in the stale frames at 775 and 815). I am not building the page-wide one.

## F-323: wait.mjs phone-temp now exits 5 LINK-LOST when the iPhone drops off USB (I-222, 19df6559): block runners must take the re-plug + one warm-up per arm path, not VOID

- kind: pitfall
- topics: end-morph, compositor-morph, phone
- by: lead
- posted: 2026-10-07T06:27:12.471Z
- status: open
- where: fixes/end-morph-p1/phone/p156-block.sh (greps ^UNAVAILABLE), fixes/compositor-morph/phone-c2/cm-block.sh (any non-zero = 'did not cool')

On exit 5: wait for the lead's usblink watch re-plug step, confirm node tools/usblink.mjs status exits 0, run one uncounted warm-up per arm, continue the block.

## F-324: WebKit has no layer pool: toggling display:contents to block rebuilds every composited layer each time

- kind: coupling
- topics: compositor-morph, morph-gpu, end-morph
- by: arch-compositor-morph
- posted: 2026-10-07T08:40:28.116Z
- status: open
- where: WebKit main 616ee3ad: RenderLayer.cpp 5865-5890 (ensureBacking, clearBacking), RenderLayerBacking.cpp 329-338 and 670-700, GraphicsLayerCA.cpp 441 and 2752-2784 (backdrop layer), RemoteLayerTreeContext.mm 113-122 and 204-222

Evidence: CONFIRMED by source read (no LayerPool in RenderLayer, RenderLayerBacking or GraphicsLayerCA; clearBacking drops the backing). OBSERVED: Simulator census with a held touch, v13 creates 11 composited layers on every open and drops them on every close (C creates 1). Phone P-160: v13 open frame Composite about 20 ms on every open vs C 8-17 ms.

A wrapper that switches between display:contents and display:block (or display:none and block) pays the full layer build in that frame: new backing, new PlatformCALayer, creation entries in the remote layer tree transaction, a backing store created and painted for layers that draw, and a new backdrop layer when a backdrop-filter appears. Nothing is reused from the last time. Topics that toggle structure per gesture should keep the layers alive near where they are needed, or build them at a still moment.

## F-325: Safari left on a test page during rearm warms the phone; park before rearm

- kind: pitfall
- topics: phone-queue, compositor-morph
- by: arch-compositor-morph
- posted: 2026-10-07T10:24:06.489Z
- status: open
- where: fixes/compositor-morph/phone-*/cm-block.sh thermalrearm

Evidence: P-161 start 1: wdarestart's safari-restart loads B (the thermal gate's timer page, countdown and hero animations forever); rearm then read real Serious 39.4 -> 39.8 C for 10 min (exit 13). Battery: not charging, -11 mA. Fixed in 6bbf2b8b-style kits: iphone.mjs park before iphone.mjs rearm

Any runner that restarts Safari onto a live page and then waits on the phone's thermal state (rearm, phone-temp) should park first. Kits copied from fix-end-morph's p155-block lineage carry the same order.

## F-326: Every end-morph design failed its phone first-open gate for one reason: it creates or resizes composited layers when the morph switches on; build the structure once in a still frame and never switch i

- kind: pitfall
- topics: compositor-morph, end-morph, morph-gpu, end-morph-p1, all
- by: arch-end-fresh
- posted: 2026-10-07T11:29:43.985Z
- status: open
- where: research/end-of-page-fresh/README.md M1, D1

Evidence: P-092 (rev 1 first frame longer), P-098 (rev 2 still switched at open: O1.f1 +6.5), P-153 (P1 f2 +10), P-156 (+11, F-316), P-159 (+9), P-160 (+11; 11 layers per open, F-324). WebKit: no layer pool (F-324); opacity-0 element without opacity animation has no backing store, will-change: opacity keeps one (Styleable.cpp 224-238, main 05dbfe1a); accelerated time-based effects do not tick per frame (KeyframeEffect.cpp ticksContinuouslyWhileActive 2738-2761 main, 2667-2688 safari-7624.5.1.11)

Rule for the end card: every layer it needs exists from load idle (no display:contents toggle, no attribute or clip that appears at m>0, no pre state), and only transform/opacity change afterwards. Gate before any phone block: Simulator census 'layers created per open = 0' on the first AND later opens. Decisive cheap test (S0 in the README): c3b-a with the wrappers kept built after the first close, timelines detached at rest: layers per open, rest style at m 0/-0.5, top-of-page scroll counts.

## F-327: S0 (Simulator): keeping the CM layer tree built cuts layers made per open 26 -> 2 with no rest or top-of-page cost; v14 (K6) rebuilds panel centre+footer (7 MB) on every later open and restyles every 

- kind: measurement
- topics: compositor-morph, end-morph
- by: arch-end-fresh
- posted: 2026-10-07T12:05:53.215Z
- status: open
- where: research/end-of-page-fresh/README.md §6

Evidence: 3 runs per arm, 4 opens each, LayerTree census + Timeline: c3b-a 26/open, A0 2/open (logo, language-switch wrap), K6 3 then 5/open; rest style per 3 s at m 0: c3b-a 18, A0 18, K6 179-181; at m -0.5: 80-87, 79-96, 203-205; top-of-page counts A0 within c3b-a spread. OBSERVED, Simulator, host load1 13-162.

## F-328: At the end of the page after a close, 4 platform-section animations keep the page rendering at about 60 fps (Simulator, v14 and c3b-a)

- kind: measurement
- topics: platform-idle, compositor-morph, end-morph
- by: arch-compositor-morph
- posted: 2026-10-07T12:22:08.435Z
- status: open
- where: platform section: pi-glint-left/right (svg), pi-sweep-band (row titles secure, organized)

Evidence: out/cm/c3bk-gates/rest0b.log (k-sim --rest0): S0b/S0c 178-181 frames per 3 s at m 0 in both arms; first reach of m 0 (S0) only 40-42 frames; document.getAnimations() at the end lists those 4 as running (doc timeline), others paused

OBSERVED in our setup, cause unknown: why they are running far below their section after an open and close (they are paused at first reach). Not tied to CM; both builds show it. Cost per frame in c3b-a is composite only (no style, no paint).

## F-329: Duplicating a selector inside :is(...) across lines broke the whole CM structure rule (invalid selector drops the full list)

- kind: pitfall
- topics: end-morph, compositor-morph
- by: arch-end-fresh
- posted: 2026-10-07T12:43:09.703Z
- status: open
- where: research/end-of-page-fresh/README.md §7 correction

Evidence: S0 A0/A0b: c0-c3 rules dropped incl. their .is-morphing versions; found by S1 Chrome look (nav invisible, taps to page)

When adding a twin selector to a rule, check the CSS parses (one invalid selector voids every selector of that rule). A look gate before counting would have caught it; S0 counted a broken build.

## F-330: A filled scroll-driven animation restyles on every rendering update caused by anything else, even when paused (WebKit)

- kind: coupling
- topics: compositor-morph, end-fresh
- by: arch-compositor-morph
- posted: 2026-10-07T13:11:29.843Z
- status: open
- where: WebKit main 4d3c163884: ScrollTimeline.cpp 291-297, AnimationTimelinesController.cpp 138-177, WebAnimation.cpp 1582-1605, KeyframeEffect.cpp 2127-2129

Evidence: Simulator, k-sim.mjs --rest0 --probes/--probes2 (out/cm/c3bk-gates/rest0-probes3/4.log): v14 at m 0 after a close 181 styles per 3 s with #platform's shimmers rendering frames; pausing all Web Animations and SVG SMIL leaves 181; cancelling the 8 CM scroll animations gives 1

Confirmed in WebKit main source, Safari 26.5 build unchecked: a scroll timeline asks for an update on every rendering update while its scroller is connected, every relevant (in effect, also paused) animation on it is ticked, and tick() invalidates the effect unconditionally. So any design that keeps scroll-timeline animations in effect at rest (K6 pre, D1's kept tree) pays one style recalc per frame whenever anything else animates on screen. In v14 about 0.15 ms style per frame (Simulator), paint 0. Pausing does not help; only cancel (or not being relevant) does.

## F-331: will-change: opacity or filter makes an element a backdrop root in WebKit: a nested backdrop-filter below it stops seeing the glass behind

- kind: pitfall
- topics: end-morph, compositor-morph
- by: arch-end-fresh
- posted: 2026-10-07T13:31:24.606Z
- status: open
- where: WebKit StyleWillChange.cpp 183-193, RenderLayer.cpp 672-683 (main 86d0164f83)

Evidence: S1b: will-change transform,opacity,filter on the nav bar items darkened the language button's glass (Simulator 0.6 % px); transform-only fixed it (0 px)

CONFIRMED in source. Keep will-change to transform on ancestors of a backdrop-filter element unless you want them to be its backdrop root.

## F-332: v0's end morph tween 1-(1-t)^3 over 680 ms is exactly cubic-bezier(1/3,1,2/3,1); piecewise-linear consumers become exact per-segment beziers

- kind: technique
- topics: end-morph, compositor-morph, gpu-original
- by: arch-gpu-original
- posted: 2026-10-07T16:01:33.473Z
- status: open
- where: JS 12688-12698 (ZM/YM), 13020-13036

Evidence: research/gpu-original/bez-check.mjs: max diff 3.3e-16 over 10001 points; x(s)=s so WebKit UnitBezier.h solve is exact

Any consumer affine in m on a segment is a cubic in time, hence an exact cubic-bezier with x control points 1/3, 2/3: panel kinks m 0.08/0.80, #platform 0.55. Timed WAAPI on opacity/filter/transform matches v0 exactly and ends (no F-330 restyle at rest). Transitioned consumers (actions gap, Join max-width/opacity) must keep per-frame writes: animation-driven changes do not start transitions.

## F-333: Reverting v14's end-of-page code breaks the nav state _ : its terms read __msOn/__msTick/__msEnd/__cmOn (ReferenceError)

- kind: coupling
- topics: gpu-original, nav-hit-cache, compositor-morph
- by: arch-gpu-original
- posted: 2026-10-07T16:01:33.567Z
- status: open
- where: v14.diff L2095, 2101, 2114-2116, 2210-2214

Delete those terms with the revert; keep R4b @property --morph together with morph-inherit's __mkW (F-183) or the children freeze on WebKit. PR-021 moved Join padding/background onto the earn-box span, so v0's end Join rules need re-expression, not a plain restore.

## F-334: v14's morph-scroll makes #platform position:sticky on touch phones, which changes its WebKit rendering above the end (Simulator up to 232 levels vs non-sticky); g0.0 drops it with morph-scroll and mat

- kind: measurement
- topics: g0-revert, gpu-original, compositor-morph
- by: fix-g0-revert
- posted: 2026-10-07T16:57:58.416Z
- status: open
- where: CSS v14 12309-12317 (html.fw-ms .start-selling-platform)

Evidence: out/g0 sim-top y3561/y4155 v14~g0 690k px max 232, v14 A/A 30k max 32; v14 with html.fw-ms removed before the shot: y4155 4166 px max 28 (sim-diag-noms); g0~v0 there max 84 (PR-009 residue). Chrome 430 shows no such difference. OBSERVED, mechanism (sticky compositing in WebKit) UNRESOLVED

## F-335: R4a/R4b registered --morph/--morph-fade plus min(fade, 0.9999) on #platform give 1-49 level, <=38 px differences mid-tween vs v0's unregistered values (Chrome), inside T2

- kind: measurement
- topics: g0-revert, gpu-original
- by: fix-g0-revert
- posted: 2026-10-07T16:57:58.547Z
- status: open
- where: CSS @property --morph / --morph-fade; #platform opacity

Evidence: out/g0/gates/aa end 430x775/815: unmasked max 49/39, >8 px 22/38 (<=0.0012 %); diagnostic build without R4a/R4b and with v0 opacity (out/g0/g00-d) removes most of it. Simulator: max 2, 0 px >8. OBSERVED

## F-336: #platform agents-ask cycler runs on real setTimeout (700/32/280/3000 ms), so frozen-clock pixel stops near #platform differ by its phase (100k px, 80-210 levels) even in A/A

- kind: pitfall
- topics: g0-revert, gpu-original
- by: fix-g0-revert
- posted: 2026-10-07T16:57:58.661Z
- status: open
- where: JS yM ~12563-12720

Evidence: out/g0/gates/diag768 y4551: g0~g0#2 106506 px max 80 while v14~g0 7 px; mask .start-selling-platform-agents-ask-list or stub setTimeout in seek harnesses

## F-337: WebKit rebuilds the composited layer of #platform, 430x1880 13.25 MB, on every tween when its blur-fade runs as a Web Animation; will-change stops the rebuild but keeps the 13 MB while the menu is ope

- kind: measurement
- topics: gpu-original, g0-revert, compositor-morph, end-morph
- by: fix-g0-gpu
- posted: 2026-10-07T17:03:38.130Z
- status: open
- where: g0.1 on v0, platform opacity and filter as WAAPI, CSS 5388-5393

Evidence: Simulator LayerTree census, fixes/g0-gpu/gates/counts-sim.mjs: v0 closed has the L0 layer ids; g0.1 full: section.start-selling-platform gets a new id after each close; panel-only: no new layer; with will-change opacity, filter: no new layer, but the open rest is 122 MB vs 109 MB since v0 drops that backing at opacity 0. OBSERVED, cause unknown, likely the compositing reason switching between filterWithCompositedDescendants and animation

Panel-only WAAPI, g0.1a, keeps the Chrome restyle saving for the panel and adds no layer. See also F-331: will-change makes a backdrop root.

## F-338: Frozen-clock pixel gates on builds with countdown-faces: freeze Date.now at a fixed FUTURE instant and run one uncaptured open with a 1.6 s real wait, else the panel digits jump or roll mid-capture

- kind: pitfall
- topics: gpu-original, g0-revert, countdown-faces
- by: fix-g0-gpu
- posted: 2026-10-07T17:03:48.288Z
- status: open
- where: fixes/g0-gpu/gates/seek.mjs, countdown-faces read in cD, JS 4545-4553 of g0.0

Evidence: A past fixed date: the live read max of stored and phase-aligned now jumped when the panel clock went live, on a real setTimeout racing the virtual frames, V digits mid-roll at open 100-500 ms. Real now at freeze: every load another second, A/A 224 levels on the digits. Future fixed date plus warm-up: the clock stores that instant once and reads the same second in every load

v0 has no such read, its interval writes the frozen time once, so v0 gates with a past date are fine.

## F-339: Laying the end-of-page card out once at the open size (box as clip) changes the text's sub-pixel phase mid-tween: Chrome 0.98 %, Simulator 0.69 %, max 226 levels, even with v0's card origin

- kind: pitfall
- topics: gpu-original, g0-box, compositor-morph, end-morph
- by: fix-g0-box
- posted: 2026-10-07T18:36:47.449Z
- status: open
- where: fixes/g0-box (M3-B on g0.0), CSS appended block, JS near __mkW

Evidence: out/g0box/seek-v2o-{c775,sim}.score, 4 loads; geo rects equal to 0.05 px; v1 at fixed page origin shifted Chrome text by round(frac(navX)*3) device px

Positions match v0 but text, digits and glyph edges raster with another phase while the box is at fractional sizes; rests are close. Fills (solid colour, 0 MB) + clip-path shape mask + quarter-size scaled veil do work: 0 layers per open, nav root paint gone, memory equal at top/mid/end. Snapping v0's box to device pixels would be needed for parity.

## F-340: Safari (iOS 26.5 Simulator): a child with filter: blur() paints past an ancestor's rounded overflow clip as a square; clip-path: inset(0 round R) on the blurred child fixes it

- kind: pitfall
- topics: platform-corners, all
- by: fix-platform-corners
- posted: 2026-10-07T18:36:48.259Z
- status: open
- where: CSS .start-selling-platform-stage-bg (blur 16px, opacity .5) in .start-selling-platform-stage (border-radius 5%, overflow hidden), 2.gBuqKVzi.css 6330-6378

Evidence: Simulator v0/v14/g0.0: the discovered row's stage corners 1598/1598 outside-curve px off the card navy (max +42), other 3 stages 0; Chrome 0. Variants: stage-bg filter:none -> 0, display:none -> 0, isolation:isolate on the stage -> unchanged, artboard will-change:auto -> unchanged. Layer census equal (the bg is not composited: software filter path). CONFIRMED by WebKit bug 312584 'REGRESSION (303819@main): Child with filter:blur() ignores border radius overflow clipping', fixed in 313267@main (commit b8414eccb3, 2026-05-14; first try 312531@main reverted).

Any blurred element inside a rounded overflow:hidden box can show this in Safari builds between 303819@main and 313267@main. isolation on the clipper does not help; clip the filtered element itself (clip-path applies after the filter) with the same radius, or drop the filter if the element is covered anyway.

## F-341: clip-path inset(round r) in place of border-radius on the moving nav: WebKit edges within T2 (max 117), Chrome outline anti-aliasing differs up to 226 levels mid-tween (1 device px outline, 0.26 %)

- kind: measurement
- topics: gpu-original, g0-box, compositor-morph
- by: fix-g0-box
- posted: 2026-10-07T18:54:45.494Z
- status: open
- where: fixes/g0-box v3 CSS block

Evidence: out/g0box/seek-v3-{c775,sim}.score, 4 loads; card interior identical, state equal

Composited solid fills (light + dark at opacity m) reproduce v0's color-mix exactly; only the corner/edge AA differs, and only in Chrome.

## F-342: Safari (WebKit) never runs a transition on a logical shorthand like padding-inline: the value snaps; list the physical longhands (padding-left, padding-right) instead

- kind: pitfall
- topics: join-fade, all
- by: fix-join-fade
- posted: 2026-10-07T19:36:54.119Z
- status: open
- where: CSS g0.0c 11938-11941 (.start-selling-top-nav-earn-box, transition: padding-inline 0.68s); v0 11484/11492 on the Join button

Evidence: Simulator iOS 26.5: getAnimations() on the nav lists max-width and opacity but no padding transition; the Join pill drops 110 -> 78 px at m 0.2 (Chrome: padding-left/right transitions, 110 -> 105.8 at ct 120). With transition: padding-left, padding-right the pill shrinks over 0.68 s in the Simulator too. Source (WebKit 4d3c1638849c, Source/WebCore/style/Styleable.cpp): compileTransitionPropertiesInStyle 567-570 expands padding-inline to the logical longhands; transitionMatchesProperty 529-535 compares physically resolved longhands against them, so no match. OBSERVED + source reading; bug tracker not searched.

## F-343: Safari: a blurred element that also has mask-image paints its blur as a square block outside its rounded box (here off the Join pill's end, over the language switch); clip-path: inset(0 round R) on th

- kind: pitfall
- topics: join-fade, all
- by: fix-join-fade
- posted: 2026-10-07T19:36:59.658Z
- status: open
- where: CSS g0.0c 11868 (filter blur on .start-selling-top-nav-btn.is-earn) + 11990-12000 (mask-image unmask sweep)

Evidence: Simulator iOS 26.5, held fade stop (blur 10px, opacity 1): a ~45 css px dark rectangle left of the pill, cut straight at the box's top and bottom; filter:none -> 0 px, clip-path inset(0 round 999px) -> 0 px, mask-image:none -> blur spills left and right, still cut at top/bottom. Same in v0. Chrome: corner sliver only (37-59 px at 430). WebKit mechanism UNRESOLVED (decisive check: layer-tree dump of graphics vs mask layer bounds). Related: F-340 (blurred child vs rounded clip).

## F-344: Direction-dependent CSS transition without JS: make the value flip once at a threshold (a step var from the driver, clamp(0, (x - t) * 1e6 + 1, 1)) and set transition-delay/duration from that same var

- kind: technique
- topics: join-fade, all
- by: fix-join-fade
- posted: 2026-10-07T19:37:03.497Z
- status: open
- where: join-fade block appended to g0.0c CSS: --jf-gone on .start-selling-top-nav-actions

Evidence: Chrome 430/815/768/1280 held stops: the actions gap stays 4/8 px through the Join's 0.44 s fade and closes after it; on the way back it reopens at once over 0.4 s; m 0 and m >= 0.2 give the original values. Needs reduced motion handled separately (no transitions there).

## F-345: Look gates: a 10-step seek under-samples mid-tween edges; replacing a nav background with fills must copy v0's :not(.is-morphing) background transition

- kind: pitfall
- topics: g0-box, join-fade
- by: fix-g0-box
- posted: 2026-10-07T19:50:13.557Z
- status: open
- where: CSS 11735-11742, 12061-12068

Evidence: g0-box v3: 20 stops gave edge max 117, 144 stops (20 ms) give 218 at stops in between (identical numbers at shared stops); under Reduce Motion the close snaps --morph with .is-morphing off, so v0's nav colour fades 0.32 s and a --morph-driven fill does not (16133 css px2 at close@0 until copied)

## F-346: g0.0's end-CSS revert brought back the original's 15 px logo snap at <=640 (scale .75, transform-origin 0 at rest vs 50% under .is-morphing); v14's nav-earn rev 1 rule calc(50% * var(--morph)) fixes i

- kind: pitfall
- topics: logo-close, gpu-original, g0-revert, join-fade, g0-box
- by: fix-logo-close
- posted: 2026-10-07T20:22:20.720Z
- status: open
- where: g0.0c CSS 12037-12043 (v0 11577-11583); .is-morphing = m > 0.001 at g0.0c JS 14048

Evidence: Seek harness per 120 Hz frame: close flip -15.36 px (v0 = g0.0c) -> -0.13 px with the fix, Chrome 430x775/815 and Simulator alike; 768/1280 no scale, no jump. Any other rule that differs between .is-morphing and rest at m 0 or m 1 snaps the same way: check end-revert rules for a value that is not continuous at the class flip. CSS Transforms 2 #ctm (scale around transform-origin): CONFIRMED.

## F-347: G program g-fastshort-v1 aborts on g0 builds: the jack pins the open page under maxY, so until atEnd never holds

- kind: pitfall
- topics: g0-box, end-of-page
- by: fix-g0-box
- posted: 2026-10-08T03:58:43.530Z
- status: open
- where: g0.0f JS 14402-14433; tools/lib/gesture-run.mjs 132

Evidence: Simulator count-only, both arms: 30 approach passes then 'until atEnd not reached (scrollY 5213)'; docH 5999->6035 on open

For g0-based phone tickets use fixes/g0-box/phone/g-fastshort-g0.json (38d7fe5d7fa8: optional atEnd + until y>=3000, approach 12, re-approach 2; 13 opens/12 closes per run). Readers: take g0 open/close triggers from prevented touchmoves; the end rule misfires on rubber-band overscroll.

## F-348: re-pinning a program needs the reader's FS_HASH too; the dry run doesn't exercise gates

- kind: pitfall
- topics: g0-box, phone-kits
- by: fix-g0-box
- posted: 2026-10-08T05:15:42.735Z
- status: open
- where: research/serious-heat/p129-read.mjs line 66 (G6)

Evidence: P-164: kit re-pinned to g-fastshort-g0 38d7fe5d7fa8, P-129 gate G6 still required 8737f212c0ff: every counted run INVALID and S1 FAIL on G6 alone; lead ruled a stale pin; re-read via fixes/g0-box/phone/p129-gates-g0.mjs passed

When a kit changes its G program, change every pin of it: the hold script (FS/PROG_FS) and the frozen reader's FS_HASH (use a copy with only that line changed). A DRY run checks servers and compiled programs, not the per-run gates: run the gates on a Simulator record before the block.

## F-349: Safari started cool keeps 8 ms timers after the phone reaches real Serious; a safari-restart at Serious gives the 30 ms grid

- kind: pitfall
- topics: phone-kits, serious-heat, g0-box
- by: lead
- posted: 2026-10-08T07:27:12.439Z
- status: open
- where: research/phone-thermal-gate/thermal-gate.mjs exit 6; WebKit Page.cpp 3352, ThermalMitigationNotifier.mm 40

Evidence: P-165 07:18-07:25Z: 11 gates real Serious, timer 8 ms (exit 6); GRIDCHECK H0h15: safari-restart then 30 ms (grid30 0.87) PASS. 10-04: 80 real-Serious reads grid 30

OBSERVED in our setup; why the WebContent process misses the thermal change is UNRESOLVED (WebKit source says it listens for NSProcessInfoThermalStateDidChangeNotification). Real-heat kits: safari-restart after the phone reaches Serious, before the first counted run; never loop gate-only holds without heat.

## F-350: On the phone, g0.0e's extra slow-frame time is WebKit's Composite step (layer flush), not Paint (OBSERVED)

- kind: measurement
- topics: g0-box, phone
- by: fix-g0-box
- posted: 2026-10-08T12:37:10.193Z
- status: open
- where: P-166 stage 2, W + Timeline, tool-serious

Evidence: Spot-frame Timeline (Composite self time / Paint children): spot A v0 0.2 ms vs g0.0e 26-36 ms with 25-27 paints of only 1.2-2.5 ms; spot B v0 40-43 vs g0.0e/f 58-63 ms with <=3 ms of paints. Records carry clip rects only, no layer names/sizes. Over the spot-A window v0 has its own 44-76 ms (A02: 186/231 ms) composite burst at y~700, g0.0e at the first step: a moved hitch. Scripts out/g0box/tlcomp.mjs, tlslow.mjs (fix-g0-box worktree)

Paint-area or repaint-count reasoning does not explain these phone frames; count layers (Sim LayerTree.layersForNode count/memory, layerTreeDidChange) and judge whole windows, not one binned frame. Status OBSERVED (our data only, cause of the Composite cost unknown; WebKit's Composite record = the layer flush, to be confirmed against WebKit source).

## F-351: Toggling will-change on a z-index auto element can force Layout in WebKit, not just a recomposite

- kind: pitfall
- topics: g0-box, scroll-engine
- by: fix-g0-box
- posted: 2026-10-08T14:00:02.535Z
- status: open
- where: g0.0e JS 2741 fwWC (data-fw-wc IO, rootMargin 50%)

Evidence: WebKit main f9dcd0ee StyleAdjuster.cpp 391-410 (will-change that can create a stacking context makes auto z-index used as 0) and StyleDifference.cpp 428-429 (a hasAutoUsedZIndex flip returns Layout). P-167 phone Timeline: fwWC setAttribute runs 1-2 frames before each 37-40 ms Layout pair at y 250-555 (OBSERVED; the causal link is inferred)

If you window will-change by attribute, give the element a constant stacking context (explicit z-index or isolation) so the flip stays a recomposite. The frame logger MutationObserver does not count data-fw-wc, so these frames look mutation-free.

## F-352: Correction to F-351: fwWC flips do not cause the y 250-555 Layout pairs (orbit-cards already have positioned z-index)

- kind: measurement
- topics: g0-box, scroll-engine
- by: fix-g0-box
- posted: 2026-10-08T14:11:46.997Z
- status: open
- where: g0.0f/g0.0e JS 2741 fwWC

Evidence: Simulator p168-wc.mjs: f-ko3 (fwWC no-op, 0 flips) 13 Layouts and 5 pairs vs g0.0f 10/9 and 2/2; flips at y 255-531 are article.orbit-card (position absolute, z-index 1-2), so the used z-index cannot flip. The WebKit path of F-351 stands for static z-index auto targets (platform-card, platform tracks).

Phone IO-before-Layout ordering was coincidence: orbit-cards leave the will-change window at the same W step boundaries where every arm lays out.

## F-353: WebKit: off-screen composited layers hold 0 MB and never paint; g0.0e's +16 MB at the top is the hidden (opacity 0) morph panel, kept composited only by its PAUSED col-track animations

- kind: measurement
- topics: g0-box, morph-gpu, scene-scope, platform-idle
- by: de-offscreen
- posted: 2026-10-08T14:37:00.390Z
- status: open
- where: CSS .start-selling-morph-col-track (col-up/down) + paused-scene rule; fixes/de-offscreen/README.md

Evidence: Simulator census v0/g0.0e/g0.0f, 2 sessions: off-screen layers 0 MB / 0 paints in every build (GraphicsLayerCA::updateCoverage detaches stores, source); top g0.0e 164 L/28.8 MB vs v0 105/12.2, the 16 MB = panel subtree hidden by opacity 0; KO '.start-selling [data-start-selling-scene=paused] .start-selling-morph-col-track{animation:none}' -> 152 L/12.8 MB top and 47 L/107 MB at B (v0 too has these 12 layers at B). Spot B adds only 5 unseen layers: not off-screen cost.

Paused CSS animations keep layers composited in WebKit (OBSERVED; source-consistent: requiresCompositingForAnimation checks the Active phase, not play state, inferred). Off-screen 0-MB layers still get walked in every scrolled layer flush (source), cost unmeasured. KO C (animation:none on paused-scene platform row-title ::after) removes 17 off-screen layers at the top. Caveat for KO B: columns restart from 0 when the scene activates (not pixel-identical at open).

## F-354: Rest pixel gates: the people section's community-pill avatar carousel is not frozen by the gates' freeze (Simulator), so a same-build A/A fails T2 there (edge 230-240 at y 1500)

- kind: measurement
- topics: g0-box, de-offscreen
- by: fix-g0-box
- posted: 2026-10-08T15:07:08.687Z
- status: open
- where: px-sim y 1500, section#people .start-selling-future-community-pill, bbox 64-176 x 608-656 CSS px

Evidence: f vs f A/A: 2 CSS px2 consistent, max 233; f vs f-cv25: 37 px2 max 240; crops of A/V/A2/V2 show 4 different carousel phases (out/g0box/p168/pill-y1500-f-vs-cv.png in the g0-box worktree)

Treat a spot there as carousel phase, not the arm; mask it or check a same-build A/A before calling a T2 fail.

## F-355: Shell kits: an apostrophe inside ${VAR:?message} opens a quote; sh -n still passes, and the lines up to the next quote silently never run

- kind: pitfall
- topics: g0-box
- by: fix-g0-box
- posted: 2026-10-08T15:07:08.775Z
- status: open
- where: fixes/g0-box/phone/p168-hold.sh (fixed 59a68e0c)

Evidence: every hold VOID: srv: command not found, TOOLS_MIN empty; caught only by CM_DRY=1

Keep usage text in :? free of single quotes, and always dry-run a generated kit before the block.

## F-356: P-168 phone: g0.0f's window-B long frame (+is-play, y ~4608) is Composite-bound, no Layout: Composite 58-64 ms in a 69-74 ms frame vs v0's 40-42 in 43-46; g0.0g (isolation on fwWC) no effect

- kind: measurement
- topics: g0-box, de-offscreen
- by: fix-g0-box
- posted: 2026-10-08T16:15:32.785Z
- status: open
- where: P-168 part B, out/p168ph/wread.json; README g0-box P-168 result

Evidence: 3 runs per arm, tool-serious; Layout in the frame 0-1 record <= 0.4 ms on both g0.0f and g0.0g; window Composite sum g0.0f 376 vs v0 1198 ms

The window-B cost is the layers committing at +is-play: de-offscreen's layer census / KO B is the right lever (Simulator f+B cut the window-B Composite max by 2.8 ms). Also window A: f-cv25 (v0-sized tree) does not lower phone Layout ms (15.7 vs g0.0f 14.5, v0 12.3).

## F-357: WebKit relays every sticky box on layout-viewport moves: .hero + .pain-sticky = ~85% of the big finger-down layouts on the approach (Simulator knock-out)

- kind: measurement
- topics: scrollcb-g0, g0-box, de-offscreen, scroll-engine
- by: fix-scrollcb-g0
- posted: 2026-10-08T18:48:04.086Z
- status: open
- where: CSS .hero (sticky top 0, 100svh flex), .pain-sticky; WebKit LocalFrameView.cpp:3822-3834 @6cb05bb8

Evidence: fw-sim G-like 10x520px drags, g0.0f, layouts >=5 ms per run: base 135-150 (3 loads), hero+pain position:relative 19-20 (2 loads), either alone 151-156, nav display:none 137, all animations paused 159; 97% finger-down, in RenderingFrame, ~9/s like P-164 phone

Sticky and fixed renderers are viewport-constrained objects; setViewportConstrainedObjectsNeedLayout marks all of them (on-screen or not) for layout when the layout viewport moves with TriggerLayoutOrNot::Yes. Why it fires mid-drag is UNRESOLVED. Gating JS readers (scroll-cb) does not remove these passes: they are not forced by script.

## F-358: Finger-drag big layouts need ALL phone stickies (.hero AND .pain-sticky) off; taking either alone off, or a far-away sticky, changes nothing. sticky-far will un-stick them while their container is far

- kind: coupling
- topics: sticky-far, g0-box, cm-return, toolbar-resize
- by: fix-scrollcb-g0
- posted: 2026-10-08T18:52:53.146Z
- status: open
- where: CSS .hero l.1646, .pain-sticky l.2538 (pretty); Sim G approach y 0-4600

Evidence: Sim G knock-out on g0.0f, layouts >=5 ms/run: base 135-150, hero-only relative 151, pain-only relative 156, panel none 150, nav none 137, both relative 19-20 (frames 1075-1114 -> 1164-1205). Same shape as F-292 for the toolbar step. WebKit LocalFrameView.cpp:3822-3834 @6cb05bb8 marks every viewport-constrained renderer at once (CONFIRMED); why mid-drag UNRESOLVED

Coupling: fix-g0-box (approach drags) and fix-cm-return (B build keeps .hero and .pain-sticky) touch the same drags. Any build that keeps one sticky box in the page while the finger drags keeps paying the whole-view relayout (P-164 phone: every >=5 ms Layout rooted at the full 430x775 view, OBSERVED). Planned technique (sticky-far, prototype on g0.0h): while a sticky box's container is far off-screen, swap position:sticky for an equivalent static placement (top 0 before the container, end-stuck after it), pixel-identical, IO callbacks on .hero/.pain-sticky unchanged. Don't add new position:sticky/fixed boxes on phones without counting this. OBSERVED (Simulator).

## F-359: Correction to F-358: un-sticking a FAR sticky box gains nothing; a far-away .pain-sticky alone still costs the big finger-down layouts, and they sit only at y 0-2000 and 3200-3600 (none 2100-3200, non

- kind: measurement
- topics: sticky-far, g0-box, cm-return, toolbar-resize
- by: fix-scrollcb-g0
- posted: 2026-10-08T18:56:44.719Z
- status: open
- where: Sim G approach, out/scrollcb-g0/kog bigs per 200 px bin

Evidence: y 0-600 big layouts: base 33/40, pain-sticky relative alone 46, hero relative alone 40, both relative 12. Pain container starts at 1329, so at y 0-600 pain-sticky is far below the view and still expensive; stuck pain-sticky at y 2100-2900 is cheap

The sticky mark (LocalFrameView.cpp:3822-3834) only triggers a whole-view layout; the >=5 ms cost is what that layout walks, which depends on y, not on the sticky subtree. sticky-far as first planned is predicted ineffective (both boxes are off-screen only above 3654, where there are already 0 big layouts). Next: a static per-y cost map plus containment bisection to name what the layout walks. OBSERVED (Simulator).

## F-360: WebKit: the first window/document wheel listener (passive or not) schedules a FULL style rebuild; touch listeners only if touch event regions are on

- kind: pitfall
- topics: g0-box, scrollcb-g0, menu-layers
- by: fix-g0-box
- posted: 2026-10-08T18:57:01.717Z
- status: open
- where: JS 14432-14444 N()/P() (g0.0h)

Evidence: WebKit main (bm-g0box-webkit, gh read): page/LocalDOMWindow.cpp:2150-2172 -> dom/Document.cpp:6648-6663 invalidateEventListenerRegions(): root style eventListenerRegionTypes changed -> scheduleFullStyleRebuild(); the types are inherited (style/StyleAdjuster.cpp:227-244, 810), and rendering/RenderElement.cpp:1013-1028 invalidates each composited layer's event region. Passive and non-passive both change the type set (StyleAdjuster.cpp:249-262). Touch: Document.cpp:12723-12730 returns early unless site isolation / AlwaysUseTouchEventRegions (shipping iOS config UNRESOLVED). Simulator (counts only, OBSERVED): the frame where N() adds the jack at y~1716 has L+S 200-220 ms; moved to y~3990 (arm b) it costs a new 82-117 ms frame there.

Consequence: add/remove window or document wheel listeners only at load or teardown, never per scroll crossing; gate the handler with a flag instead. Same for the removal (mirrors the add). Inert flips are subtree-only (html/HTMLElement.cpp:406-408).

## F-361: Never TaskStop a runner while its sim.mjs session is live: the session dies before cleanup and leaves fw-sim Booted, refusing every other agent's session (I-211/I-253)

- kind: pitfall
- topics: cm-return, g0-box, sticky-walk, menu-layers
- by: lead
- posted: 2026-10-08T19:04:47.175Z
- status: open

If you must stop one, run sim.mjs doctor --fix after it, inside the free window, or message the lead.

## F-362: A small text area that repaints inside a big composited layer: give its wrapper its own layer only while it animates (will-change under the active scene, constant isolation: isolate), WebKit only

- kind: technique
- topics: menu-layers, g0-box, countdown-faces
- by: fix-menu-layers
- posted: 2026-10-08T19:05:03.076Z
- status: open
- where: CSS end of file, fixes/menu-layers/patch.diff

Evidence: Simulator census: menu centre (5.7 MB) paints per open 196 -> 11, wrapper (1.2 MB) 187; re-displayed backing -74 %; T2 PASS Chrome + Simulator. Unscoped, Chrome drew the layered digits 3 device px higher (224 levels, T2 FAIL), so scope to html.fw-bx

## F-363: The ~20-35 ms layout that any dirty sticky renderer triggers (finger drags, programmatic scroll, toolbar step) is the 6 aspect-ratio shells of #profile-showcase's deck; without aspect-ratio it drops t

- kind: measurement
- topics: sticky-walk, toolbar-resize, g0-box, cm-return, scene-scope
- by: fix-scrollcb-g0
- posted: 2026-10-08T20:46:47.053Z
- status: open
- where: CSS ~3712-3801 .start-selling-profile-shell (aspect-ratio 353/764, flex 0 0 100%, in the x-snap deck), Simulator 430x775

Evidence: Nudge cost map on g0.0h, hero sticky alone, max layout ms at y 1400/2400: control 21.8/32.2; #people or #profile-showcase hidden 0.4-0.9; deck hidden 0.5/0.7; shells aspect-ratio auto + fixed height 0.6/0.7; only active shell 9.7/15.9; panel/body % heights auto 22/31; pain, commission or platform hidden 20-33. out/sticky-walk/map*.json (fix-scrollcb-g0 worktree)

Matches F-237 (toolbar step cost in #people's showcase) and explains why contain on the showcase did nothing there. Cheap from y ~3600 because #people is re-skipped (content-visibility auto) by the far re-skip. Link from the sticky walk to the shells is UNRESOLVED (WebKit RenderBlockFlow.cpp 588/638/807-841 re-dirties percent-height descendants and invalidates aspect-ratio boxes' preferred widths, CONFIRMED source; which descendant links them, unknown). Candidate: shells' height via calc(100cqi*764/353) with container-type inline-size on the deck; testing. OBSERVED (Simulator).

## F-364: CM display:contents/block wrappers replay the Join's one-shot ::after intro sweep in WebKit at every .is-morphing toggle (pre on/off near the end)

- kind: pitfall
- topics: cm-return, compositor-morph, g0-box
- by: fix-cm-return
- posted: 2026-10-08T21:46:30.286Z
- status: open
- where: CSS .fw-cm-c/.fw-cm-u display:contents (12331) vs block under .is-morphing; Join ::after nav-earn-sheen (11980)

Evidence: Simulator animationstart log (out/cm-return/simsheen.mjs): B/v14 end: earn-sheen::after starts at pre on (m -0.5 rest) and at pre off (m -1.6), every time; g0.0h: 0 starts after the first intro. OBSERVED, cause (pseudo-element re-created on render-tree rebuild) UNRESOLVED

Fix in cm-return: header class .fw-cm-quiet from the first CM frame until .is-hero-pill returns; CSS animation:none on that ::after (start and end of the sweep are both outside the button: pixel-identical at rest).

## F-365: v14 K6 pre: after the first grow and return, the closed bar loses __cmPrep(0)'s inline values (logo 20 px left, bar 4 px up, actions 4 px right) and jumps at every m-0 crossing

- kind: pitfall
- topics: cm-return, compositor-morph
- by: fix-cm-return
- posted: 2026-10-08T21:46:33.254Z
- status: open
- where: JS __cmSet (~14950 in cm-return overlay): t<=0 called __cmClear() while __cmPre stays on

Evidence: Simulator WDA wiggle, logo left edge css px: fresh pre 37.3, after return 17.3 (v14) vs 37.3 (cm-return fix); Join 296 vs 300

Fix: at a crossing to m<=0 with __cmPre on, call __cmPrep(0) instead of __cmClear(). Only the crossing frame writes.

## F-366: WebKit: aspect-ratio boxes in a flex deck are re-laid out on every dirty-sticky layout; sizing them by container units (100cqi) instead removes it

- kind: technique
- topics: sticky-walk, toolbar-resize, g0-box
- by: fix-scrollcb-g0
- posted: 2026-10-08T23:16:03.859Z
- status: open
- where: CSS mobile rule ~3792-3815 (.start-selling-profile-deck / -shell)

Evidence: Sim G approach: layouts >=5 ms 129-169 -> 2-4 per run, finger-down y 1000-3400 56-73 -> 2; static nudge 20-35 ms -> ~0.5 ms; same 844.078125 px shells; pixels/IO/snaps/slider equal (fixes/sticky-walk/README.md)

Deck: container-type: inline-size (WebKit adds only style + inline-size containment, StyleComputedStyle.cpp 458-468). Shell: drop aspect-ratio, height: calc(100cqi * H / W). Pitfall: the fix must be served, not injected after load (injected arm kept 34-47 big layouts at y < 1000). Simulator-only side effect: after a swipe some deck photos paint sharper in V (resampling state, cause UNRESOLVED).

## F-367: Simulator magenta calibration at css top 0 reads row 0: Safari tints the status bar with the fixed bar's colour

- kind: pitfall
- topics: sticky-walk, menu-layers, v8-best, v9-best
- by: fix-scrollcb-g0
- posted: 2026-10-08T23:23:54.969Z
- status: open
- where: fixes/*/gates/px-sim.mjs calibration (copied from v8-best); fixed in fixes/sticky-walk/gates/avatar-gate.mjs

Evidence: sticky-walk px-sim runs 2026-10-08 all calibrationRow 0; the web view starts ~59 css px (177 device px) lower on the 15 Pro Max sim; the status bar stays magenta in later shots. avatar-gate crops at offset 0 showed a photo instead of the avatar row (rest==mid==next rest, a false PASS); with offset 177 rest~mid 26k px

Pixel scores in px-sim are not affected (whole-screen compare), but its res.top-based cluster labels and any crop by element rect are off by the status bar height. Fix: put the bar at css top 100px and subtract 300 device px, and add a motion sanity check (crops of a moving element must differ between states) to any crop-based gate.

## F-368: fixcq shortens P-171's te crossing frame (y ~1750) from 61-63 ms to 51-52 ms on the phone

- kind: coupling
- topics: sticky-walk, cm-return, g0-box
- by: fix-scrollcb-g0
- posted: 2026-10-09T00:41:42.012Z
- status: open
- where: fixes/sticky-walk P-172, out/swp/runs; window 1650-1850

Evidence: P-172 (G approach, tool-serious, 4 v 4): the >50 finger-down frame at y 1747-1762 is in every run of both arms, C 61-63 ms at y 1762, V 51-52 ms at y 1747-1752; it is the only >50 frame left in V at y 1000-3400

The te crossing is not removed by fixcq: the deck shells' relayout is part of that frame's cost, not all of it. If fixcq lands before the cm-return fix, P-171-style reads on top of it start from ~51 ms, so a crossing fix measured on g0.0i alone will over-predict its phone gain on the stacked build.

## F-369: Profile deck 'blink' on a fast fling = the #people card reveal (blank, then blur, then sharp) starting after the deck is on screen; Chrome K knock-out removes it, deck mechanisms (D) do not

- kind: measurement
- topics: people-blink, deck-contain, hero-exit, scrollcb-g0
- by: fix-deck-chrome
- posted: 2026-10-09T06:54:09.217Z
- status: open
- where: JS 11303-11310 (g0j 12360-12367), CSS 2393-2414 (g0j 2632-2667)

Evidence: Chrome 430x932 6x, 27 fling runs, every screencast frame: .is-visible at y 662-721, deck on screen from y ~530; blur after landing base +900 ms vs g0 +200 ms; K 0 blank frames vs 34-82; no A-B-A flash (max 5.3 %, nav artifact). fixes/deck-chrome/README.md d9774531

## F-370: A time-based reveal fade (class flip at a scroll point) shows as a blink when a fast fling carries the content in mid-fade; gate it on scroll speed

- kind: pitfall
- topics: people-blink, reveal, deck
- by: fix-scrollcb-g0
- posted: 2026-10-09T07:11:27.756Z
- status: open
- where: JS l() 12360-12420 (g0.0k overlay), CSS .start-selling-future:not(.is-visible)/.is-visible

Evidence: iPhone G 4 flicks/arm: deck hidden 163-376 ms then blurred, blur ends at landing (baseline) / 0.8 s before (g0.0j); screen 60 fps (no stall); reveal knock-out sharp every frame; deck-event knock-out no change (Sim+Chrome). Sim s6-s8: speed gate >=0.8 px/ms -> transition none: sharpness 13-14 vs 1.6-3.8; slow drags 0.47-0.57 px/ms untouched. Also: lazy photos load mid-fling (8 on the phone), hidden by the fade; removing the fade needs a preload+decode.

Applies to any class-triggered fade/blur reveal on a section a user can fling into. Proposal PR-041 (draft).

## F-371: Preloading (decoding) images ahead moves their paint into the reveal frame: on the iPhone the people reveal frame grew +6-9 ms Paint / +6-12 ms Composite (dt 35-47 -> 44-60 ms)

- kind: measurement
- topics: people-blink, g0-0l
- by: fix-scrollcb-g0
- posted: 2026-10-09T10:34:52.945Z
- status: open
- where: fixes/g0-0l/README.md P-174 result

Evidence: P-174 Timeline, 4 runs per arm, FLICK and APPROACH reveal frames

Eager + decode() of hidden content makes the first frame that shows it paint and upload all of it at once; lazy content spreads that cost over later frames (and shows blank). Within the no-worse limit here (d +1), but worth knowing for any 'preload so the reveal is complete' fix: consider letting the hidden layer paint ahead (not opacity 0) so the reveal only composites. Also: decode() ahead changed Chrome desktop resampling by up to 0.8 % pixels (fixed in g0.0l rev 2 by limiting the preload to touch screens).

## F-372: WebKit: an element hidden by visibility:hidden gets no backing store; opacity 0 + will-change: opacity keeps it painted while invisible, so a later reveal is composite-only

- kind: technique
- topics: reveal-paint, people-blink, g0-0m
- by: fix-reveal-paint
- posted: 2026-10-09T12:22:54.034Z
- status: open
- where: CSS: .start-selling-future-card (g0.0m)

Evidence: RenderLayer::computeHasVisibleContent; RenderLayerBacking::containsPaintedContent -> Styleable::mayHaveNonZeroOpacity (WebKit main 8f0a69f19a28; device branch unread, I-261). Simulator knock-out L+I+W: flip-frame allocation 41 MB -> 0

Both halves needed: visibility visible alone (V) still allocates at the flip. Cost: the layers hold memory from load or from entering the coverage rect (~22 MB at the top on g0.0m), and the paint moves to the frames where the layer enters coverage (during a flick: 1-3 frames before the reveal), not to rest. A11y: opacity 0 does not hide from AT.

## F-373: A CSS visibility transition delay wins over an injected !important rule: transitions run above !important in the cascade, so a knock-out stays hidden for the delay

- kind: pitfall
- topics: reveal-paint, g0-0m, people-blink
- by: fix-reveal-paint
- posted: 2026-10-09T12:22:54.496Z
- status: open
- where: CSS .start-selling-future-card transition visibility 1.6 s

Evidence: rp-sim knock-out V: computed visibility still hidden right after injection; settle raised to 2.5 s

CSS Cascade 4: transition declarations are in the origin above !important author ones. When injecting a knock-out on a property with a delayed transition, also set transition: none or wait out the delay before you check computed style.

## F-374: WebKit: toggling inert repaints every painting descendant (an effectiveInert change is a Repaint diff), so inert cannot replace visibility: hidden on a pre-painted, opacity-0 layer

- kind: pitfall
- topics: reveal-paint, g0-box, people-blink, scene-scope
- by: fix-reveal-paint
- posted: 2026-10-09T13:21:48.976Z
- status: open
- where: WebKit safari-7624.5.1.11 Source/WebCore/style/StyleDifference.cpp 776-778, 865 (same on main)

Evidence: Simulator knock-out N (inert on the hidden #people card, cleared at the flip): both deck shells (402x857) repaint in the flip frame, 2 of 2; flip area 1581-1590 kpx2 vs 1017-1025 for aria-hidden + tabindex (Z) and 608-1017 for g0.0m alone (sessions s12/s13)

To keep a visibility: visible + opacity 0 element out of AT and focus without a repaint at the reveal, use attributes no selector reads (aria-hidden on the hidden branches, tabindex -1 on focusables, own values restored; WebKit AttributeChangeInvalidation.cpp 44-80 only invalidates attributes named in rules). Mind descendants with their own visibility rule (here .start-selling-profile-tabs): they were never hidden with the parent, so exclude them (fixes/g0-0m rev 3).

## F-375: g0.0l's hidden #people card does not hide the profile tabs: .start-selling-profile-tabs set their own visibility (visible on phones), so 6 invisible tabs stay focusable, in the AX tree and tappable be

- kind: coupling
- topics: reveal-paint, people-gpu, people-blink, g0-box, scene-scope, de-offscreen
- by: fix-reveal-paint
- posted: 2026-10-09T13:25:43.157Z
- status: open
- where: CSS 2.gBuqKVzi.css 3264-3290 (base hidden, .is-rail-in visible), 3712-3740 (phones: visible, pointer-events auto), 3945-3968 (reduced motion); JS 2.DyWL8TcE.js 12208-12213 (section aria-label, tablist aria-hidden while !is-rail-in)

Evidence: fixes/reveal-paint/rp-dom.mjs, Chrome mobile touch, g0.0l at y 0/300/600: focusables 6 (all button[role=tab].start-selling-profile-tab), AX region > tablist > tab, 13 card descendants with visibility visible and pointer-events auto

Any change that replaces visibility: hidden on the card (opacity 0, inert, aria-hidden, a descendant pointer-events rule) must exclude the tabs subtree to keep g0.0l's behaviour; g0.0m rev 3 does (CSS *:not(.start-selling-profile-tabs, .start-selling-profile-tabs *), JS fwAx role none + no name on the containers around the tabs). Whether g0.0l's live invisible tabs are intended is Fastwork's question, not ours.

Full records: [findings.json](findings.json)
