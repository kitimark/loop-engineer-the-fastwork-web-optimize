# Fix: scene-scope

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** RB landed (8207797). **RBi40p** (`patch.diff` = `variants/17.diff`, CSS 24c2e85682fe) is the landing
candidate. It replaces RBi40, which the lead's review (8690486, NEEDS-WORK) sent back.
- Its #platform cut is checked by querySelectorAll: no kept hero/people/commission/nav/sb-* entry matches anything under
  #platform.
- Pixels: identical to RB at forced phase above #platform (OBSERVED). Inside #platform the claim rests on state
  evidence; frames there are not deterministic in any arm, the A/A included (section "RBi40p: #platform pixels").
- One-shot scenarios (a) reload, (b) early jump x3, (c) fling: inside the A/A. (d) Sim bfcache back: restored from the
  bfcache, no held one-shot. The positive control separates in each.
- The rotator-tick layout stays: the st5/st6 family is not byte-identical, and rotator-st6 is parked.

**Stage:** F. Waiting for the fix-reviewer and the phone ticket (T-011). The D card below is **unsigned** (no signed
"D:" line exists); it goes to the lead to sign or return.
**Device class / gate:** phone-only (WebKit's nested style/layout rounds, F-099). Gate: phone Timeline attribution (counts).
**Driver(s) behind the claims:**
- Chrome counts and state probes (`out/scene-scope/*.mjs`, not committed).
- Simulator W driver (`srwin-sim.mjs`, Timeline depth 10) for the switch structure; ms there are attribution only.
  Copies for reproduction (P-053/P-055/P-056) in `fixes/scene-scope/tools/`: `srwin-sim.mjs` + `simtab.mjs` (from
  de-counts-sim's untracked `research/design-engineering/work-counts-webkit/`), `rsstat.mjs` (switch and scroll-phase
  scoring, view-rooted counts) and `pageframes3.mjs` (deterministic frozen frames).
- Phone: S (blocks 1-2) and M (block 3), with Timeline, run by iphone-runner.
**Predictions (strict scoring, fixes/PREDICTIONS.md):** P-040 MISS, P-041 HIT, P-045 HIT, P-046 HIT, P-047 FAIL,
P-048 FAIL, P-049 MISS, P-050 MISS, P-051 MISS, P-052 HIT, P-053 HIT, P-054 inCQ HIT / restyled MISS, P-055 (a) HIT,
(b) inCQ HIT / restyled MISS, P-056 (b) inCQ HIT / restyled MISS, (c) frames HIT / play state HIT / phase MISS at 1440,
P-056a pending (RBi40pti).
**Topic:** see `fixes/TOPICS.md` (scene-scope); user priority 1 ("style recalc")
**Base:** STACKED on B = `fixes/user-bplus/patch.diff` (rebuilt as overlay `bplus`: JS dbd5fdb4f1fb, CSS cc8d1340b449)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only: the paused-scene rule (B 11804-11815, baseline
11754-11758). No JS.
**Line numbers:** "JS NNNN" means `/_app/immutable/nodes/2.DyWL8TcE.js` as served in B and in every arm here (the
bplus overlay, dbd5fdb4f1fb), unless it says "baseline JS". "CSS NNNN" means `/_app/immutable/assets/2.gBuqKVzi.css` of
the arm named. Sim stack frames print one line higher than the file (rootscore adds 1 to a line WebKit already
reports 1-based): `setAttribute<cE@2.DyWL8TcE.js:2763` is the `setAttribute` call at JS 2762.

**Tools version (I-046, d00ee9a changed headless `--screen-info`).**
- Ran on tools before d00ee9a, with a headless screen of 756x491 CSS px at DPR 2: every headless Chrome result here
  except the RBi, RBi40 and RBi40p checks and the idle triple. That covers the mechanism check, the functional check
  with its bottom-shot A/A, the carousel frame check (carf, carf2, carf3) and the visual-risk probe.
- The page viewport was the device-metrics override in every run.
- Ran after d00ee9a: the RBi, RBi40 and RBi40p pixel and state checks, flipprobe2, the layer probe, the idle triple
  and all Simulator runs. The Simulator does not use headless Chrome.

Timing is deferred by the user (2026-10-01 19:27Z): this README makes **no timing claim**. Chrome numbers below are
counts (elements restyled, invalidations, dirty layout objects, layers); durations are info only, and Sim ms are
attribution only.

## What RBi40p removes, stated plainly

**Fewer elements per recalc at the #platform switch, and the switch RS no longer contains a Layout (Sim self 1.1-1.4 →
0.2 ms, attribution only); the same Layout runs right after; switch cost unchanged.** Over the whole scroll the number
of style recalcs does not change.

At the #platform switch (Chrome flipprobe2 for elements, 3 reps; Sim W for the records, n≥2; B, RB and RBi40p all on
JS dbd5fdb4f1fb):

| | B (bplus, no scene-scope) | RB (landed) | RBi40p |
|---|---|---|---|
| Chrome: elements restyled in the flip's recalc | 345 | 99 / 99 / 104 | 66 / 66 / 66 |
| Chrome: of those, "invalidation set matched class" | (subtree invalidation, 2 per flip) | 38 | 5 |
| Chrome: subtree invalidations | 2 | 0 | 0 |
| Chrome: listed elements under a size container | 279 of 341 descendants, depth 2 | 36, depth 1 | 0 |
| Sim: the switch RecalculateStyles, self ms (attribution) | 3.1, 3.2 | 1.1-1.4 (4 runs) | 0.2, 0.2 |
| Sim: view-rooted nested Layouts inside it | 2, 2 [VIEW 18.1-19.0 + VIEW 1.5-1.6] | 1 (4 runs) [VIEW 18.2-20.1] | 0, 0 |
| Sim: other nested Layouts inside it | 0 | 1 (4 runs): a 390x312 root, 0.1 ms, UNEXPLAINED | 0 |
| Sim: view Layout right after it (initiator cE `setAttribute`, JS 2762) | none | none | 1, 1 (18.1, 18.1 ms) |
| Sim: RS + that Layout (attribution) | 22.8, 23.7 ms | 19.4-21.4 ms | 18.3, 18.3 ms |

- WebKit's Timeline gives no element counts per recalc, so the element column is Chrome only. In Chrome, 54 of
  RBi40p's 66 are "invalidation set matched tagName" in every arm (RB and RBi40pw too): the kept bare-tag subjects
  `.commission-underline path` and `.start-selling-avatars img` make Chrome invalidate every `path` / `img` under the
  flipped scene by tag. OBSERVED from the trace reasons. WebKit invalidates only elements that match the full rule
  (`StyleInvalidator.cpp` 163-180 at 29dd51e, `Invalidator::invalidateIfNeeded` → `matchesAnyAuthorRules`,
  CONFIRMED in source, see "Why it lags"), so "that part is Chrome-only" comes from reading the source; it was not
  checked on the device.
- Over the scroll and push phases (Sim, about 6.2 s per run; counts, ms as attribution):

| | B (2 runs) | RB (4 runs) | RBi40p (2 runs) |
|---|---|---|---|
| outermost RecalculateStyles | 355, 363 | 352-368 | 350, 368 |
| their total ms | 263, 270 | 254-281 | 225, 251 |
| Layouts nested in them | 24 / 44.3 ms, 25 / 42.8 ms | 23-24 / 43.3-46.0 ms | 20 / 26.5 ms, 25 / 26.8 ms |
| Layouts outside any RS | 315 / 543 ms, 318 / 562 ms | 308-320 / 473-540 ms | 313 / 487 ms, 311 / 517 ms |

  The recalc count is unchanged. Total RS ms is **below** RB's range in both RBi40p runs (225.1 and 251.4 vs
  254.1-280.7; n=2, attribution only, no gain claim); RS self ms and total Layout ms overlap RB's range. The ~18 ms
  shift from the nested to the outside column shows only at the switch; it is not visible in the scroll totals, which
  swing by about ±35 ms between runs. Scored by `rsstat.mjs` (copy in `fixes/scene-scope/tools/`) on
  `out/scene-scope/simres/w40p-*`, `w40pw-*`, `w40b-B*`.
- **"The layout moves rather than goes away" is OBSERVED** (Sim, n=2 per arm; in our setup, cause unknown). It matches
  phone block 2: I40 (the same #platform lists) had 0/0/0 nested Layouts at the switch, but its switch window sums
  (49.3 / 71.2 / 51.0 ms) did not drop against C's (60.9 / 61.1 / 50.2 ms). The phone ticket (T-011) checks it on the
  device.

**The next target is that ~18 ms view Layout** (initiator cE `setAttribute`, JS 2762). Split diagnostics (Sim W,
diagnostic arms only, never landing arms):

| arm | #platform-matching entries left | view Layout at the switch (Sim) |
|---|---|---|
| RBi40p | scene root (both lists), 4 row titles, platform-card (will-change) | 18.1, 18.1 ms, right after the RS |
| RBi40p0 = RBi40p minus scene root and row titles | platform-card only | none (2/2 runs; RS 0.3, 0.5 ms) |
| RBi40pr = RBi40p minus the scene-root entries | 4 row titles, platform-card | 21.0 ms, right after the RS (1 run) |
| RBi40pt = RBi40p minus the 4 row-title entries | scene root, platform-card | none (1 run; RS 0.4 ms) |

- So the moved layout follows the 4 row-title animation entries (`.start-selling-platform-row-title-{doc,earn,secure,
  organized}`), not the scene root. OBSERVED, n=1 per split arm; why a play-state change on 4 inline-block gradient
  titles lays out the whole view in WebKit is not known. In RBi40pt the rotator tick at y≈2516 is the only big
  layout in the window.
- Cutting those entries is **not** in RBi40p: the row titles are infinite sweeps (V1i's list keeps them), so a cut
  would let them run while #platform is paused. Before it can land it needs the pixel check of wherever a paused
  #platform is visible, plus its own prediction. Not built as a candidate.

## RBi40p: what it cuts and why the cut is #platform-only

RBi40p = RB (landed) minus, from the animation arm, the 32 #platform-internal entries (29 one-shots that are
IO-gated or dead, plus the 3 tracks: cred, secure-currencies, profile-reviews), and minus, from the will-change arm,
stage-artboard and the same 3 tracks (S0 CSS 11864-11895 and 11920-11923). The hero, people, commission, nav and
sb-* entries stay as in RB. CSS only; JS byte-identical to RB's.

- **querySelectorAll census** (`out/scene-scope/scenprobe.mjs` census, walk 0 → end → 0, max per entry; q40pc).
  Entries of RBi40p's lists that match anything under #platform: animation arm: the scene root and the 4 row titles;
  will-change arm: the scene root, `.start-selling-platform-card`, and the `[data-fw-wc="0"]` gate (6 elements). **No
  kept hero/people/commission/nav/sb-* entry matches an element under #platform**, and every cut entry matches 0
  elements outside #platform (S0 census, same walk).
- Cut entries never hold an unfinished one-shot in a paused scene: 0 over the walk, and 0 after each of 8 #platform
  jumps (search visual, invoice, profile, secure network; each centred until its IO class is on, then 150 ms later
  an instant jump to the top or the page end; 12 rAFs logged).
- RBi40pw (diagnostic, `variants/19.diff`) = RBi40p with the 4 will-change entries kept. Its census adds
  wc stage-artboard x4 and the reviews track (q40pc3).

## RBi40p: #platform pixels

**Deterministic frames (2026-10-02 04:11-04:21Z, supersedes the state-evidence verdict below): RBi40p and RBi40pt
are byte-identical to RB in 22/22 frozen frames at y 3200-5300, and so is the A/A.**

- Method (`pageframes3.mjs`, copy in `fixes/scene-scope/tools/`; headless, 430x932 DPR 3, served hashes and GET
  counts checked, fresh ports, `--no-cache`):
  - **Virtual JS clock.** An init script records every setTimeout / setInterval / rAF / requestIdleCallback while the
    page loads on the real clock. After load, `__vt.start()` moves the pending ones onto a virtual clock (remaining
    delays rounded up to 100 ms). From then on performance.now, Date (fixed epoch), timers, intervals, rAF (every 16
    virtual ms) and rIC advance only when the probe calls `__vt.advance(ms)`. This generalises the carousel timer
    hold (39/39) to every JS clock, the fee loop included.
  - Per y: instant scrollTo, 200 ms real, advance 300, 150 ms real, advance 200, then freeze. The freeze pins CSS
    animations (paused; infinite at 0, finite at their end) and SVG SMIL (the secure-network dash `<animate>`, paused
    at document time 0). Then decode the imgs, wait 2 real rAFs and a 600 ms settle, re-freeze anything new, wait 2 rAFs
    and take a full-viewport PNG.
  - One warm-up load per browser, which is not compared.
  - **Measurement condition: Chrome runs with `--disable-checker-imaging --disable-gpu-rasterization`.** Without them
    the A/A is not byte-identical: the secure-network faces inside the scaled will-change artboard rasterised
    differently from load to load in every arm, RB included (12 loads at y 4400-4800: 22.3k px, max delta 14, in S0 and
    RBi40pt alike). The flags change Chrome's raster path (software raster, synchronous image decode). They are a
    condition for a deterministic comparison, **not a shipping configuration**, and say nothing about GPU-raster pixels.
- Results (comparisons against S0 run 1; the runs are from three separate holds at load1 1.3-2.3):

| arm | runs | frames byte-identical to S0 run 1 |
|---|---|---|
| S0 = RB (A/A across holds) | 3 | 22/22, 22/22, 22/22 |
| S0b (same files, second server) | 1 | 22/22 |
| RBi40p | 2 | 22/22, 22/22 |
| RBi40pt (row-title cut, P-056) | 2 | 22/22, 22/22 |
| PCp (positive control: reviews track paused, rows moved 1 px) | 1 | 5/22 (differs at y 3700-5300) |

- In the same runs the row-title sweep census (`data-sweep-paused`, visibility) is the same in every arm at every y.
  Play state comes from the earlier walk (q40tp, the real clock): equal at every step at 430, and at 1440 (q40tw).
- This settles the frames at 430 and the freeze phase. It does not settle the sweep **phase** of RBi40pt at 1440:
  see "RBi40pt: sweep phase at desktop".

Earlier method (superseded): **the claim rested on state evidence, and said so.** Frozen frames inside #platform were
not deterministic in any arm, the A/A included, because page JS kept running after the CSS freeze.

- Method (`out/scene-scope/pageframes.mjs`, headless, 430x932 DPR 3, tools at or after d00ee9a; fresh ports,
  `--no-cache`, served hashes checked): walk down in 100 px steps; at y 3200..5345 step 100 (22 frames) freeze every
  animation at the same phase (finite at the end, infinite at 0), decode imgs, 2 rAFs, full-viewport PNG. Arms: S0
  (RB), S0b (the same files on a second server: the A/A), RBi40p, and PCp = S0 + `profile-reviews-track` paused and
  `#platform .start-selling-platform-rows { translate: 1px 0 }` (positive control).

| check | S0 vs S0b (A/A) | S0 vs RBi40p | S0 vs PCp (positive control) |
|---|---|---|---|
| q40pp: frames byte-identical | 9/22 | 6/22 | 3/22; 0.3-1.8 M device px differ over y 3700-5100 |
| q40pw: frames byte-identical | 11/22 | 10/22 (RBi40pw 10/22) | — |
| paused-set walk, y ≥ 3100: on-screen paused animations per step | 3 per step | 3 per step | 4 at y 3800-4700 |

- Every difference, the A/A's included, sits in a JS-driven region: the fee typing caret (page y≈3964), the
  fee/referral area, and #platform visuals at y 4400 / 4600 / 5000 / 5100; plus isolated delta-1 pixels, which the A/A
  also shows.
- The fee visual (commission section, JS ~2440-2510) is an IO-started loop of timers and rAF tweens (about 5.4 s per
  cycle); `.referral-fee.shown` has opacity and filter transitions. It keeps running after the freeze and starts new
  animations. Frame data (q40pe, y 3200-4100, 10 frames, the old method): the A/A S0 vs S0b had 7/10 identical,
  RBi40p 6/10 and RBi40pb (RBi40p on a second server) 7/10. Every arm differs at y 3700: 15.5k-18.2k px, max delta 210,
  css x 100-281 y 365-405, the fee visual. A few hundred px at y 3300/3400 (max delta 231, the typing caret), and 16 px
  with delta 1 at y 3800. So the frame differences track JS phase, not the arm.
- Spot check (q40pq) at (266, 5048): the elementFromPoint chain `p.agents-ask-title` → `stage-artboard`
  (will-change transform, `data-fw-wc="1"`) → `platform-card` is identical in S0, S0b, RBi40p, RBi40pw and RBi40pb.
  The artboard keeps its layer on screen in RBi40p too, because #platform is active there.
- `Emulation.setVirtualTimePolicy` was not used; the in-page virtual clock above does the same job for page JS.
- Verdict: within #platform, RBi40p pauses exactly what RB pauses on screen (paused sets equal at every step), the
  positive control separates on both metrics, and the frame differences stay at the A/A's level. Above #platform the
  RBi40 checks hold unchanged (carousel 39/39 and the switch region 15/15 byte-identical, below): RBi40p changes no
  entry that matches there.

## RBi40pt: sweep phase at desktop

RBi40pt (`variants/21.diff`) = RBi40p minus the 4 row-title entries of the scene-paused animation list (CSS
11860-11863). P-056 (committed before the data) predicted the same play state at every y and a sweep phase within
250 ms of RB at first visibility.

- Play state (vis / `data-sweep-paused` / playState of `start-selling-platform-i-doc-sweep` on the 4 titles, every
  walk step; q40tp at 430, q40tw at 1440): equal to S0 in every arm at every step. HIT.
- Phase: currentTime of each sweep while every title is still off screen (step 0, after load):

| width | S0 | S0b | RBi40p | RBi40pt |
|---|---|---|---|---|
| 430 (q40tp, load1 57: not quiet) | 100 | 50 | 50 | 83 |
| 1440 (q40tw, load1 2.3) | 0 | 0 | 0 | **3433** |

  At 1440, RBi40pt's sweeps appear mid-cycle (3683 ms of 4000 at the first visible step) where RB's start from 0:
  every sweep frame differs in phase. **P-056(c) MISS** (offset > 250 ms). P-056(b) restyled 58/58/63 vs [60-63]:
  MISS (third miss of the restyled model, cause unchecked); inCQ 0: HIT. P-056(a) was not run (no Sim time on RBi40pt
  without the JS line, lead 10-02).
- Why the pause is late (`out/scene-scope/iolate.mjs`, q40ti2: MutationObserver + IO + `contentvisibilityautostatechange`
  log, `getAnimations()` only at 4 fixed times, because a per-frame read forces style and hides the effect; 1440x900 and
  430x932, S0 / RBi40pt and second-server copies):
  - The IO callback is **not late**. PMsweepIO's first callback (all 4 titles out) comes 0-10 ms after the first
    `data-start-selling-scene=paused` write in every run, at both widths. What is late is the pause taking effect.
  - In RBi40pt the deferral write `data-start-selling-render=deferred` (sE, JS ~2753; CSS 11893 gives it
    `content-visibility: auto`) lands in the same frame as the `data-sweep-paused` writes, and the subtree is reported
    skipped 0.1-1.5 ms later. When the skip wins, the paused style is not applied until `render=active` (2.7 s, 6.4 s
    after load): 1440 warm: sp 909.0, deferred 907.3, skipped 909.1, active 2719.9, the sweep paused at **1917**; cold:
    paused at 183. At 430 it landed in both runs (83). So it is a race, not a fixed delay.
  - In S0 the `scene=paused` write (the scene-paused list holds the titles) comes 8-10 ms before the deferral, a frame
    apart, so the pause lands every time: paused at 33-67 ms in all 4 runs.
  - Chromium: a locked (skipped) subtree's style recalc is blocked and kept until unlock: `ShouldStyleChildren()` and
    `NotifyChildStyleRecalcWasBlocked` / `TakeBlockedStyleRecalcChange` in
    third_party/blink/renderer/core/display_lock/display_lock_context.h l.92-106 and l.185-192 (main 9ee52e23a8cd,
    read 2026-10-02); CSS animations keep their time in a skipped `content-visibility: auto` subtree (WPT
    css/css-contain/content-visibility/content-visibility-animation-in-auto-subtree.html; CSS Contain 2: the UA
    "should additionally avoid as much layout/rendering work as possible for skipped contents"). Status: the two parts
    CONFIRMED by those references; that the blocked recalc is what holds back the play-state change is our reading,
    OBSERVED in our setup (q40ti2), no test asserts it.
- The lead's decision (2026-10-02): the bar is byte-identical at every viewport, so RBi40pt does not land as is. The
  candidate becomes RBi40pti = RBi40pt + one JS line in PMsweepGate: each title starts with `data-sweep-paused`,
  and the IO callback lifts it when the title is on screen (P-056a, committed before the build).

## RBi40p: one-shot scenarios

`out/scene-scope/scenprobe.mjs` parts a/b/c, compared by `scencmp.mjs`: every finite CSS animation unfinished in the
first 90 rAFs after `scrollTo(0)`, its play state and currentTime at rAF 0, and its last unfinished rAF. Arms S0, S0b
(A/A), RBi40p, PCcue = S0 + `.scroll-cue { animation-play-state: paused !important }` (positive control).

| scenario | RBi40p vs S0 | S0b vs S0 (A/A) | PCcue vs S0 |
|---|---|---|---|
| (a) reload at y 4000 (restored), 2.5 s, scrollTo(0) (q40ps) | same keys; ct0 diff 0 ms; last-frame diff 1 | same keys; 33 ms; 0 | cue paused 90 of 90 rAFs (S0: 1) |
| (b) early jump: 300 ms after the cue exists, jump to y 4000, 3 s, scrollTo(0); 3 reps (q40pb) | same keys; ct0 ≤17 ms; last ≤2; paused frames ≤2 | same keys; ≤33 ms; ≤2; ≤2 | reps 1 and 3: cue paused 89-90 rAFs; rep 2: cue absent |
| (c) fling at 350 px/frame during `.is-drawing-in` (q40ps) | identical | identical | — |
| (d) Sim bfcache back: scrolled to y 4000, away to a same-origin page, `history.back()`, scrollTo(0), 60 rAFs (simbf-bf40p) | restored from the bfcache (pageshow persisted, window mark kept); 0 paused unfinished one-shots; same keys as S0 except the hero accent's stroke-in (phase) | restored; 0 paused; stroke-in and the avatar tick at another phase | restored; the cue's copy-in paused in 60 of 60 rAFs |

- (b) rep 1 is a cold first load in every arm (cue seen after 1.6-1.9 s, not running at the jump); reps 2-3 jump
  while the cue's copy-in runs (117-133 ms in). The single run in q40ps had S0 without the cue key while S0b, RBi40p
  and PCcue had it: phase, which the 3 reps show.

## RBi40p: layers and the will-change gate

- With bplus's fw-wc gate (scroll-engine /10, JS 2696-2714: `fwWCSel` includes `.start-selling-platform-stage-artboard`
  and the 3 tracks; IntersectionObserver `rootMargin: 50% 0px 50% 0px`; CSS `[data-fw-wc="0"] { will-change: auto
  !important }`), an element's will-change is `auto` whenever it is more than half a viewport off screen.
- #platform is paused only far from the screen (it switches to active about one viewport before it enters), so the
  gate already holds the cut elements at `auto` there. Layer probe (`out/scene-scope/layprobe.mjs`, 430x775): at
  y 2407 (#platform paused) no element under #platform has a non-auto will-change in S0, RBi40pw or RBi40p, and
  #platform has 4 animations, none running, in every arm. At y 5188 (the end at 775 px, #platform active) layers are
  65 in all three arms.
- Layer totals at y 2407: S0 54, RBi40pw 59, RBi40p 64. The extra layers are hero/people phase elements
  (accent-svg idle frames, `span.digit`, `hero-cta`, avatar imgs), none under #platform. flipprobe2 shows the same
  phase spread (layers before the #platform flip: RBi40pw 62/62/67, the others 57).
- So "the artboard and tracks keep their will-change layers while #platform is paused" (written for RBi40 / I40) is
  **wrong under the fw-wc gate**. The remaining exception is the first scan: `fwWC()` sets `data-fw-wc="1"` 500 ms
  after load plus idle, before the IO's first callback sets the real value. In that window RB's paused arm forces
  `auto`, RBi40p does not. Not counted; it is off screen.

## RBi40p: Sim switch structure (W driver)

Simulator (fw-sim 15 Pro Max), `srwin-sim.mjs` (Timeline depth 10, 6 s idle, push, hold), shared functional lane;
fresh random ports per arm, `--no-cache`, served hashes and GET counts checked. Sessions w40p (S0 RBi40p RBi40p S0),
w40pw (S0 RBi40pw RBi40pw S0), w40p0 (RBi40p0 x2), w40b (B B RBi40pt RBi40pr). Structure only; ms are attribution.

| arm | runs | switch RS (y≈2610) view-rooted nested Layouts | detail |
|---|---|---|---|
| B | 2 | 2, 2 | RS 22.8-23.7 ms, self 3.1-3.2, [VIEW 18.1-19.0 + VIEW 1.5-1.6] |
| S0 = RB | 4 | 1 every run | RS 19.4-21.4 ms, [VIEW 18.2-20.1 + 390x312 0.1]; the 0.1 ms 390x312 Layout is not view-rooted and UNEXPLAINED |
| RBi40pw | 2 | 1, 1 (P-055a HIT) | RS 19.6-19.7, [VIEW 18.9-19.0] |
| RBi40p | 2 | 0, 0 (P-053 HIT) | RS 0.2; VIEW 18.1 ms right after it, initiator cE |
| RBi40p0 | 2 | 0, 0 | RS 0.3-0.5; no cE-initiated layout |
| RBi40pr | 1 | 0 | RS 0.1; VIEW 21.0 right after it, initiator cE |
| RBi40pt | 1 | 0 | RS 0.4; no cE-initiated layout |

- Counts are view-rooted nested Layouts only (root covers 0,0 to 430 x viewport height, as in `rootscore.mjs`):
  B 2, RB 1, RBi40pw 1, RBi40p 0, matching nesting depth 2/1/1/0. P-053/P-055 counted raw nested Layouts (RB 2),
  which mixed in RB's 0.1 ms non-view Layout (P-040's lesson: count roots, not records).
- The container-depth model holds for the nested count in both directions: keeping the 4 will-change entries
  (artboards and the reviews track, under the stage-visual containers, depth 1) gives 1, cutting them gives 0.
- Rotator-tick layouts (`before<mi@BSBv9QXB:2188`, F-111) appear in every arm at y≈2510-2614 and are split out.

## RBi40p: Chrome flip counts (flipprobe2)

`out/scene-scope/flipprobe2.mjs` (430x775 DPR 3, 250 px step across each gate at CPU 6x, 3 reps, q40pf2):

| flip | arm | elements restyled | class-matched / tag-matched invalidations | subtree inv. | listed under a container | layers |
|---|---|---|---|---|---|---|
| #platform enter | S0 (RB) | 99 / 99 / 104 | 38 / 54-58 | 0 | 36 (4 stage-visual containers), depth 1 | 57→57 |
| | RBi40pw | 71 / 71 / 76 | 10 / 54-58 | 0 | 5, depth 1 | 62→62 |
| | RBi40p | 66 / 66 / 66 | 5 / 54 | 0 | 0, depth 0 | 57→57 |
| hero-track leave (rep 0) | all three | 138-143 | — | 1 | 0 | 135-145→59 |
| people leave (rep 0) | all three | 28-90 (phase) | — | 0 | 0 | 54-59→51 |

- List completeness at the top: 0 animation misses, 0 will-change misses in every arm.
- P-054 and P-055(b): listed-in-container HIT (0 and 5); the restyled bounds (≤23, ≤30) MISS, because they ignored
  Chrome's 54 tag invalidations (see "What RBi40p removes").

## Functional check (RBi40p)

`node tools/fix.mjs check scene-scope --viewport both --save` (shared lane, weight check, 2026-10-02 03:11Z; headless,
tools at or after d00ee9a; `fixes/scene-scope/check.json`). The overlay holds RBi40p's CSS only, so this check runs
it on the baseline JS, not on bplus's.
- CHECK OK, mobile and desktop: morph reached on both sides, 0 console errors, 0 4xx, element counts equal
  (mobile 1337 → 1337, desktop 1180 → 1180).
- Screenshot diff vs base: mobile top 0.11 %, middle 0.01 %, bottom 0; desktop top 0.10 %, middle 0, bottom 0. All
  inside the 0-0.4 % countdown / orbit phase band.

## Why it lags

- Phone (iphone-runner, inspector-clean, B, OBSERVED): the largest style record on the page is the `#platform`
  paused→active switch at y≈2615: RecalculateStyles 29.2-32.2 ms = self 3.7-4.7 + **2 nested Layouts** 25.5-27.5 ms
  (A: 16.7-19.1 = 2.4-2.9 + 14.3-16.2). `research/design-engineering/style-recalc-images.md` §2.1.
- Trigger: `cE` (B JS 2759-2771) writes `data-start-selling-scene` on the scene element (JS 2762).
- The CSS that makes it expensive (B CSS 11804-11815):
  `.start-selling [data-start-selling-scene="paused"] :where(*) { animation-play-state: paused !important }` plus the
  will-change arm. Its subject is universal, so the attribute change invalidates **every descendant** of the scene.
  - WebKit: `AttributeChangeInvalidation` invalidates before and after the change, and only descendants that match
    the full rule (`Invalidator::invalidateIfNeeded` → `ElementRuleCollector::matchesAnyAuthorRules`); with `:where(*)`
    all match. CONFIRMED (WebKit main, `Source/WebCore/style/StyleInvalidator.cpp`, last changed 29dd51e).
  - Blink: universal subject → "invalidates subtree" (Chrome trace, OBSERVED: 2 per flip in C).
- Why the restyle turns into nested Layouts on WebKit (F-099, CONFIRMED by source): a size container on the dirty
  path makes the style resolver skip its descendants (`updateStateForQueryContainer` → `SkipDescendants`, WebKit
  `StyleTreeResolver.cpp`, c0726d0), and `Document::resolveStyle` loops `while (resolver.needsInterleavedLayout())`
  with an interleaved whole-view layout when the render tree needs layout (`Document.cpp`, 079c1e3). One round per
  container nesting level. In B, 279 of #platform's 341 descendants sit under 6 containers, nesting depth 2
  (`.start-selling-platform-stage-visual` `container: built-stage/inline-size` > `.start-selling-platform-secure-
  network-kr-arm` `container-type: size`).
- Why B is larger than A at that flip (lead's question): in A, #platform is still `content-visibility`-skipped at the
  switch (the flip un-skips it: Chrome Layout 17-28 ms, dirty 17-23/1653, layers 64→78); B's one-way un-skip has
  already rendered it, so the switch restyles a live subtree under the containers (Chrome Layout 1.3-3.4 ms, dirty
  15/1653, layers 57→57). The will-change arm does not change the layer count at B's flip (57→57 in C, V1, V1i).

## What changed

**Landing candidate now (`patch.diff` = `variants/17.diff`, regenerated 2026-10-02) = RBi40p (CSS 24c2e85682fe),
stacked on bplus.** RB with the #platform-internal entries cut (section "RBi40p: what it cuts" above).
- Against RB (landed in 8207797): the animation arm goes from 68 to 36 entries, the will-change arm from 17 to 13. The
  hero, people, commission, nav and sb-* entries are RB's; the R4a / R4b parts are as in RB.
- CSS only. It adds or removes no observers, listeners or JS writes; the JS is byte-identical to RB's
  (dbd5fdb4f1fb).
- Evidence: the census, the #platform state evidence and the one-shot scenarios (above); the Sim structure count
  (P-053 HIT); flipprobe2 (P-054).
- Still open: the phone ticket (T-011).

**Previous candidate RBi40 (CSS f54dbf45fc55; returned by the review 8690486, NEEDS-WORK).** RBi40 = RB with V1i's
animation list (that step alone is RBi), minus the 4 platform classes, so it also cut hero, people and commission
one-shots. The review asked to keep the hero, people, commission, nav and sb-* entries and cut only inside #platform:
that is RBi40p. RBi40's checks (pixel A/B, idle triple, Sim count) are kept below as history.

**Landed: RB = V1 + R4a + R4b (CSS 0d7dfc79e703), stacked on bplus, 8207797.**
- `results.json` is hold 3's run of V1 alone (`fix.mjs ab --on bplus --runs 3`). Its timing columns are host-
  contaminated and not used; only its regression checks count. Its `patch.sha256` (7bbae8c6…, V1) is stale: it does
  not describe the current `patch.diff`. The `fix.mjs check` of RBi40p is in
  "Functional check (RBi40p)" below.
- RB has no Chrome A/B, because timing is deferred. Its evidence is the counts, the pixel diffs and phone block 3.
- The V1-only CSS is kept in the untracked `fixes/scene-scope--v1` (851c397012bc).

V1 (overlay `fixes/scene-scope`, CSS 851c397012bc): the two `:where(*)` arms become flat selector lists.

- Animation arm: the scene element itself plus the subject compound of all **110** non-`none` animation rules in
  `2.gBuqKVzi.css` and DialogHeader (`.frame-0`, `.typing-caret`, the 4 row titles, cred/secure/profile tracks, paid,
  agents, morph-col-track, `.ring.svelte-16rtsv6`, …), `{ animation-play-state: paused !important }`.
- Will-change arm: the scene plus the **16** classes with a non-`auto` will-change, then the /10b
  `[data-fw-wc="0"] { will-change: auto !important }` gate as before.
- Pseudo-elements were never matched by `:where(*)`, so nothing changes there.
- Written as **flat** selectors, not `:is(<list>)`: a multi-argument `:is()`/`:where()` subject is not bucketed and
  is matched against every element on every recalc (F-098 OBSERVED: flip ULT 17-23 ms vs 7-12 flat; F-100
  CONFIRMED: Blink `rule_set.cc` `ExtractBucketingValues` buckets only `IsSingleComplexSelector`; WebKit
  `RuleSet.cpp` `addRuleToBucket` unwraps only `selectorList->size() == 1`, else `m_universalRules`).

V1i (overlay `fixes/scene-scope--inf`, CSS 298587e0bb94, diagnostic arm): the animation list cut to the **18 infinite**
animations; one-shot entrance animations (≤1.7 s) finish even if their scene pauses mid-way. Not a landing candidate
unless the lead/user accepts that difference.

Visual: identical. `fix.mjs ab scene-scope --on bplus --runs 3` (hold 3) screenshot diff top 0.14 % / middle 0.01 % /
bottom 0 (phase noise band), no new console errors, no new 404s, morphReached 3/3 both sides. Its timing columns
are not used (5 of 6 runs host-contaminated, and timing is deferred).

## Mechanism check (Chrome, counts)

`out/scene-scope/flipprobe.mjs`, 430x775 DPR 3 mobile + touch; park 125 px before each gate, then at CPU 6x trace one
instant 250 px step across it (devtools.timeline + invalidationTracking); 3 reps per flip; hold 2 load1 4.1, hold 3
load1 4.2-9.2 (counts only). Served hashes checked per arm (C css cc8d1340b449 / V 851c397012bc / Vi 298587e0bb94 /
AV 427c6541ddce; JS dbd5fdb4f1fb, A/AV 4606120cf392).

| flip | arm | elements restyled (max ULT) | subtree invalidations | Layout dirty/total | layers before→after |
|---|---|---|---|---|---|
| #platform enter | C = B | 345 | 2 | 15/1653 | 57→57 |
| | V1 | **99** | **0** | 15/1653 | 57→57 |
| | V1i | **23** | 0 | 15/1653 | 57→57 |
| | A (baseline) | 344-354 | 2 | 17-23/1653 | 64-66→78 |
| | A+V1 | 101-109 | 0 | 17-23/1654 | 69-71→83 |
| hero-track leave | C | 239-242 | 2-3 | 15-36/1652 | 135-137→54-59 |
| | V1 | 135-138 | 0-1 | 15-36/1652 | same |
| | V1i | 103-106 | 0-1 | 15-36/1652 | same |
| people leave | C | 272-273 | 2 | 47-48/1233 | 49-54→51 |
| | V1 | 72-89 | 0 | 47-48/1233 | same |
| | V1i | 39-58 | 0 | 47-48/1233 | same |

- Functional, every arm and flip: 0 running CSS animations inside paused scenes; list completeness (in every active
  scene `getAnimations({subtree:true})` targets and every non-`auto` will-change element match the lists): 0 misses.
- Restyled under size containers at the #platform switch: C 279/341 under 6 containers, depth 2; V1 lists 36/41 under
  the 4 stage-visual containers, depth 1, none under `kr-arm`. V1i keeps the same will-change arm (stage-artboard,
  tracks under stage-visual) → also depth 1.
- Info (durations, not judged): #platform ULT C 9.7-12.2 ms, V1 7-12.1, V1i 2-4.6. V1 does not meet the "≤~50
  elements / ULT ≥3x" Chrome target; ~58 other elements restyle in the same recalc. V1i does (23 elements).
- V1-anim-only (the will-change arm left as `:where(*)`) changed nothing: the will-change arm alone still invalidates
  the subtree.

## Phone attribution blocks (iphone-runner, iPhone 15 Pro Max, Timeline, OBSERVED)

### Block 1 (S driver; C = B, V = B+V1, I = B+V1i; 3 counted runs per arm)

#platform switch RS (y≈2615):

| arm | nested Layouts in the switch RS | nested ms |
|---|---|---|
| C | 2/2/2 | 14.2-16.5 + 1.1-1.5 |
| V | raw 2 | 13.7-16.6 + one 0.1 ms non-view layout |
| I | 1/1/1 | 16.3-17.8 |

- RS self: I < V < C.
- P-040 (V: 2 → 1) is a strict MISS. The raw count is 2, and my ticket had no ≥2 ms or view-rooted filter.
  Lesson: define the filter in the ticket.
- P-041 (I: 2 → 1) is a HIT.
- The cost moved: the next big RS, at the y≈2990 crossing (fwReskip, see below), grew. Its RS was
  C 14.0-14.6 ms, V 17.9-21.5, I 21.4-22.6.

### Block 2 (S driver; C = B, I4 = V1i + V4, I40 = I4 minus 4 platform classes from both lists)

V4 is `@property --start-selling-intrinsic-block-size { syntax: "*"; inherits: false }`. I40 is diagnostic only.

| arm | switch nested Layouts | y≈2990 nested Layouts | switch window sum (ms) |
|---|---|---|---|
| C | 2 + a 13-17 ms outside Layout in the same frame | 1/1/1 | 60.9 / 61.1 / 50.2 |
| I4 | 1/1/1 (P-045 HIT) | 1/1/1, 14-19 ms (P-047 FAIL) | 40.7 / 44.3 / 51.9 |
| I40 | 0/0/0, RS 0.1-0.2 ms (P-046 HIT) | 1/1/1, 18-20.5 ms (P-048 FAIL) | 49.3 / 71.2 / 51.0 |

Readings:
- The narrowed lists remove the switch's nested layouts one container level at a time, as the depth model predicts.
- A **12-18 ms view-rooted Layout outside the RS stays in every arm**. Something other than the restyle dirties
  layout at the switch.
- Registering the intrinsic-size property did not remove the y≈2990 nested layout, so that layout is not the
  custom-property restyle.

### Root hunt

- **Correction to an earlier claim.** #platform is already `render=active` at y 2200 (hold 6 pre-state). The un-skip
  does not happen at the switch; the `render` write there writes the same value.
- **H1: the will-change arm restores `will-change` at the switch → Layout. REFUTED (F-106).**
  - WebKit main 7983f7f0e4be:
    - `StyleDifference.cpp` L269-272: `rareDataChangeRequiresLayout` only adds the WillChange context bit.
    - `RenderElement.cpp` L348-351: `adjustStyleDifference` raises the bit to RecompositeLayer, never to Layout.
    - The logic dates from 4046e637b7ca (2015).
  - Chrome state map (hold 7): `.start-selling-platform-card`'s will-change stays `auto` at the switch, because
    bplus's `data-fw-wc="0"` gate holds it until y 2920.
- **The y≈2990 crossing carries two writes in one scroll step (F-107; Chrome y 2920, C and I40):**
  - hero-track `data-start-selling-render=deferred`, which turns `content-visibility` from visible to auto;
  - platform-card `data-fw-wc` 0→1, which restores `will-change: transform, border-radius`.
  - #people pauses one step earlier.
  - Per H1's source, the fw-wc write is compositing only, which makes the c-v flip the lead (H3).
- Simulator check (de-counts-sim's `wkcounts.mjs`, Timeline with initiator stacks): arms C, I40,
  X1 = I40 + `#platform` `animation: none`, and X2 = I40 + deferred render never skips. X1 and X2 are diagnostic only.
- Parked 20:41Z (user T-002), resumed under T-005 (lead: the platform switch only; fwreskip at y≈2990 went to
  fix-scroll-engine with the F-107 notes). X1 and X2 were then dropped for the S0 vs ST check below.
- Method rules kept from the park:
  - Use the W driver (`srwin-sim.mjs`, Timeline depth 10), never a 250 px step walk (de-counts-sim's n2 misses the
    nested layouts).
  - de-counts-sim's w1 shows that the Sim matches the phone's structure at the switch and at y≈2990.
  - Record structure only (nested count, root class, initiator), never Sim ms.
  - F-108 reading rule: note each layout's root, and whether a view-rooted layout was already pending.

### Switch root: the outside layout is the hero avatar rotator (F-111), fixed by rotator-st6 (F-112)

**Phone, existing block 1-2 Timeline** (control B, 6 of 6 runs ss-C1/C6/C8/C11/C16/C18; OBSERVED).
- Scored with `out/scene-scope/rootscore.mjs`: outermost RS with nested Layouts, Layouts outside any RS, and the
  InvalidateLayout / ScheduleStyleRecalculation initiators since the previous Layout.
- Every "12-18 ms view-rooted Layout outside the RS" near the switch is initiated by `before<mi@BSBv9QXB:2188` (SS)
  and `remove<lr@BSBv9QXB:1662` (IL), inside the rotator's setTimeout task (B JS L11571). That task is the keyed
  `{#if}` swap of the 4-img and 5-img carousel blocks (F-088).
- Each 800 + 220 ms cycle gives:
  - S=true (slide start): the swap Layout (12-25 ms), then a second view Layout one frame later (12-17 ms), which is
    the slide-start flip that st6 removes. It shows as "IL loop" because the logger's rAF read forces it.
  - S=false: one swap Layout (12-18 ms).
- The tick is not tied to the switch write. It follows the rotator's own rhythm, and a scripted driver puts it in or
  next to the switch frame in every run:
  - same frame, after the switch RS: C1, C8, C16, C18;
  - C11: the slide-start follow-up lands 18 ms before the RS;
  - C6: ticks at y 2497 / 2528 / 2731.
- The last tick is at y 2731-2812, so the y≈2960 / 2990 layouts are not the rotator. Their initiators are the cE
  write, fwReskip and fwWC (JS 2709); all three were sent to fix-scroll-engine.
- Attribution rule from this: switch (or any crossing in y 1800-2820) attributions must split out layouts whose
  initiators trace to the rotator timer.

**Fix tried: no new code** (withdrawn, see "Result" below: not byte-identical). Stack the landed rotator-st6 (f7d3b1b;
user blind finger pick on aw1-10e) on bplus + RB.
- ST = S0 + `fixes/rotator-st6/patch.diff`. It applies cleanly: JS 59b23b3f57fd, CSS e9603231b413. S0 = bplus + RB:
  JS dbd5fdb4f1fb, CSS 0d7dfc79e703.
- Immutable copies are in `out/scene-scope/snap2/{S0,ST}` (not committed).

**Sim, W driver** (hold w1, 22:18-22:22Z, shared functional lane, 430x775, 4 runs S01 ST2 ST3 S04; structure only).
Rotator ticks in y 1500-2800:

| arm | ticks | keyed DOM swap | view Layouts ≥1 ms within 60 ms of a tick |
|---|---|---|---|
| S0 | 8 | 8/8 | S=true: 2-3 (~20 ms each); S=false: 1 (~19-21 ms) |
| ST | 8 (same times) | 0/8 | 0 after every tick, S=true and S=false |

- So st5's persistent slots remove the S=false swap Layout, and st6's no-flip rest state removes the slide-start one.
- In ST2 and ST3 a tick lands in the switch frame itself (y 2610/2611, 23 ms after the cE write) and adds nothing.
- The switch RS is unchanged, as expected: S0 19.3-21.5 ms, ST 21.6-22.0 ms, nested 2 in both
  [VIEW 18-20 + 390x312 0.1].
- Left in ST, not the rotator:
  - one engine-initiated 20.7 ms view Layout inside Composite (ST3 y 2712, no JS initiator; F-108 background state);
  - fwWC layouts at y 3041-3073 (fix-scroll-engine).

**Chrome, headless functional check** (`check.mjs`, shared lane, 22:39Z; counts and parity, no timing).
- CHECK OK for both arms: morph reached, 0 console errors, 0 4xx. Element count 1507 → 1508 (the 5th slot stays
  mounted).
- Rotator probe (`out/scene-scope/rotprobe.js`, 5.2 s with the carousel centred, 313 rAFs):

| arm | DOM inserts / removes | imgs | src writes | carousel class toggles | flips (transform none / opacity 1 between rAFs) |
|---|---|---|---|---|---|
| S0 | 81 / 84 | 4-5 | 0 | 0 | 7 |
| ST | 0 / 0 | 5 | 30 | 11 | 0 |

- Screenshots, run 1, ST vs S0: top 0.23 %, middle 0.01 %, bottom 0.51 %. Run 2 (22:59Z) was one check with
  S0, S0b (the same S0 files on a second server: an A/A) and ST:

| shot | S0b vs S0 (A/A) | ST vs S0 | ST vs S0b |
|---|---|---|---|
| top | 0.08 % | 0.12 % | — |
| middle | 0.01 % | 0.01 % | — |
| bottom | 0.00 % | 0.02 % | 0.11 % |

- Run 1's bottom 0.51 % was S0's own variation. `out/scene-scope/pngbbox.mjs` applies the same rule (RGB sum > 48)
  and locates the differing pixels:
  - S0 run 1 vs S0 run 2: 0.44 %, in the same box (css x 22-374, y 0-868);
  - ST run 1 vs ST run 2: 0.00 %.
- Every bottom diff, A/A included, sits in the page-end band (countdown and morph area). The carousel (y≈2130) is not
  in that shot.
- The top diff sits in the A/A's box (x 248-375, y 254-440: orbit and countdown).
- These full-viewport shots do not cover the carousel (it is not in any of the three shots). They say nothing about
  ST's own pixels: see the carousel frame check below, which finds a real difference.
- Run 2's rotator probe repeats run 1: S0 75 inserts / 75 removes and 7 flips; ST 0 / 0 and 0 flips.
- Stacking note: RB's will-change arm does not list `.start-selling-avatars.is-carousel img`. On RB + st6 the 5 slots
  therefore keep their layers while #people is paused, which is st6's stated intent ("its own layer for the page's
  life"). RB's animation arm already covers the st6 imgs through `.start-selling-avatars img`.
- Phone attribution ticket: waits until the phone is reconnected (user T-011).

**Carousel frame check: ST is NOT pixel-identical in Chrome** (headless, shared lane, 23:2x-23:50Z; counts and
pixels, no timing; `out/scene-scope/carframes.mjs`, `carframes2.mjs`, `carcmp.mjs`).
- Method. 430x932 DPR 3, the carousel centred. A setTimeout wrapper keeps the rotator's timers; a MutationObserver
  holds the rotator at every state change: it clears the pending 220 / 800 ms timer (kept for later) and pauses every
  animation. Each slide is captured at carousel-animation phases 0, 20, ..., 220 ms (other animations: finite ones at
  their end, infinite ones at 0, the same in every arm), each rest state once; imgs decoded, 2 rAFs, full-viewport PNG.
  Then the kept callback runs the next tick. 6 holds = 3 rotator cycles = 39 frames per arm. Frames pair across arms by
  state, phase and the visible avatar set, and compare byte-exact over the community pill (390x85 CSS px + 4 px).
- Screen: these runs, the bottom-shot A/A and the visual-risk probe below ran on tools before d00ee9a (I-046), so the
  headless screen was the old `--screen-info` value (756x491 CSS px at DPR 2); the page viewport was the
  device-metrics override (430x932 DPR 3) in every run.
- A/A, S0 vs S0b: byte-identical in 39/39 frames (run 1), 13/13 (run 3, fewer pairs because the arms started at
  different rotator indexes). Positive control: the method sees ST's difference in every frame.

| arm (each vs S0) | what it changes | frames identical | max channel delta | differing device px (of 333,126 in the crop) |
|---|---|---|---|---|
| S0b (A/A) | nothing | 39/39 | 0 | 0 |
| ST | rotator-st6 | 0/39 | 72 | 16.7k-22.7k |
| S0wc | S0 + `will-change: transform, translate, opacity` on the carousel imgs | 0/26 | 71 | ~22k |
| STnw | ST + `will-change: auto` | 0/39 | 7 | ≤2.8k |
| STwo | ST with `will-change: opacity` only | 0/39 | 2 (slide frames 1) | 0.4k-9.1k |
| STwot | ST with `will-change: opacity, translate` | 0/39 | 2 | 0.4k-9.1k |
| STwo1 | STwo + rest opacity 1 instead of 0.999 | 0/39 | 2 | ≤2.8k |
| S0wo | S0 + `will-change: opacity` | 36/39 | 2 | ≤1.5k |

- What it looks like: in ST every avatar is softer (blurred) in every rest and slide frame; the diff is an edge map of
  the photos (`out/scene-scope/carf-rest.png`, `carf-slide100.png`). All differing pixels are inside the 104x32
  carousel; nothing else in the viewport differs beyond the A/A.
- Cause: `transform` in st5's `will-change` list. S0wc (the old keyed carousel with st5's will-change and nothing else)
  reproduces the full difference; any arm without `will-change: transform` drops it to delta ≤7. That Chrome stops
  re-rastering a `will-change: transform` layer when its scale changes ("rastered into a fixed bitmap, which
  subsequently never changes under transform updates") is CONFIRMED by the Chrome 53 note
  (developer.chrome.com/blog/re-rastering-composite). Which raster scale Chrome picks here is UNRESOLVED; the decisive
  check would be the layer's raster scale in a Chrome layer dump.
- Residual without will-change: transform: max delta 1-2 per channel, inside the carousel only. ST vs STo1 (rest
  opacity 1 only) differs by delta 1, so part of it is st6's opacity 0.999.
- Where the residual sits (carf3, vs S0):
  - STwo1 (will-change: opacity, opacity 1 at rest and at the keyframe ends, transform: scale(1) kept): 0/39
    identical. Slide frames delta 1, 1.1k-2.8k px. Rest frames delta 2, ~1.4-1.5k px over all 4 visible slots.
  - Control S0wo = S0 + `will-change: opacity` only: 36/39 identical. The only 3 differing frames are the 3 rest
    frames (delta 2, 1.4-1.5k px).
  - S0's slide frames match because its imgs carry layers anyway while their animations run. At rest, S0 paints them
    without a layer. So a layer on a resting img alone changes Chrome's pixels.

**Simulator held frames** (`out/scene-scope/simframes.mjs`, `simcmp.mjs`; functional shared lane, 00:15-00:19Z;
Mobile Safari 430x775 at 3x; 12 frames per arm: 2 slides at 0/60/120/180/220 ms plus 2 rests, all arms synced on the
same avatar set; the carousel crop is located by a magenta overlay; byte-exact).
- Fresh files (I-052): every arm on a new random port. Each server log shows 2 GETs of the CSS and 2 of the JS
  (curl's hash check plus Safari's own). CSS: S0 0d7dfc79e703, ST e9603231b413, STwo a03eb1034898, STwo1 60b62257a761.
- A/A S0 vs S0b: carousel 12/12 byte-identical. The rest of the screen differs by 475-3.5k px elsewhere on the page.
- ST, STwo and STwo1 are byte-identical to each other in all 12 frames. So in Safari, will-change: transform does
  not blur, and opacity 0.999 vs 1 does not show.
- Each vs S0: 5/12 identical.
  - Slide at 120 and 180 ms: identical.
  - Slide at 0 and 60 ms: 3-12 px at delta 1.
  - Slide at 220 ms (animations ended) and rest: 10.2k-12.3k of 51.8k crop px, max delta 16-17, an edge map over all
    4 avatars (`out/scene-scope/simf-rest.png`). Not a visible blur, but not byte-identical.
- The same pattern as Chrome's S0wo: the frames differ where S0's imgs rest without running animations.

**Result: no byte-identical fix in the st5/st6 family; the resting layer changes raster in both engines (Chrome blur
up to 72/255; Safari edge delta 16-17).** OBSERVED in our setup, cause unknown.
- Chrome: 72/255 with will-change: transform; 2/255 with any other persistent layer (S0wo).
- rotator-st6's own 0.00 % check compared st6 with st5, both carrying the persistent layer, so it could not see this.
  F-114.
- rotator-st6's owner (fix-scroll-engine) parked it, and the lead agreed (00:2xZ). Stacking ST on RB is withdrawn.
  The Sim structure rerun of STwo/STwo1 was skipped by the lead's decision: no arm in this family can land under
  byte-identity.
- The switch window's rotator-tick layout (F-111) therefore stays. Any fix for it has to keep the imgs without a layer
  at rest.
- Idea sent to the lead and fix-scroll-engine, not built: "st5-nolayer". It keeps st5's JS (persistent slots, src set
  in place, is-sliding toggle), which removes both keyed-swap layouts, and drops will-change and st6's resting
  transform/opacity, so rest frames paint like S0. The slide-start flip layout probably stays. Animating `scale` /
  `translate` instead of `transform` might avoid the flip: UNRESOLVED until someone checks the WebKit source.
  - Lead's ruling: it is an idea for fix-scroll-engine, to be taken up only after fwreskip (a1h) is built and verified.
  - Bar: byte-identical at every frame, mid-slide included; held rest frames alone do not prove it.
  - Nothing is built until fix-scroll-engine picks it up and the lead has seen the plan.

### The switch's own RS: I4 vs I40 (recommendation for the lead)

With the rotator tick removed, what is left at the switch is the RS's own nested layouts. Phone block 2 (S driver,
on B, 3 runs per arm):

| arm | list change on top of V1 | switch nested Layouts |
|---|---|---|
| V1 / RB (landed) | — | 2 |
| I4 = V1i + V4 | animation arm cut to the 18 infinite animations; V4 = `@property --start-selling-intrinsic-block-size` | 1/1/1 (P-045 HIT) |
| I40 = I4 minus 4 | also drops `.start-selling-platform-cred-track`, `-secure-currencies-track` and `-profile-reviews-track` from the animation arm, plus those 3 and `-stage-artboard` from the will-change arm | 0/0/0, RS 0.1-0.2 ms (P-046 HIT) |

The model: each arm removes one container nesting level of restyled elements under #platform (F-099).

**Visual-risk probe** (headless, S0 = V1's full list; `out/scene-scope/heldprobe2.js`, walk top → bottom → top,
250 px every 100 ms, 44 steps; tools before d00ee9a (I-046): headless screen 756x491 CSS px at DPR 2, page viewport
430x932 DPR 3 by device-metrics override):
- Positive controls:
  - 372 infinite-animation samples held paused inside paused scenes (the probe sees pausing);
  - 667 finite-animation samples seen, 538 of them running, over 23 names (entry-blur-in, cred-card-in,
    secure-network-*, invoice-*, fee-avatar-pop, …).
- **One-shot animations held paused and unfinished inside a paused scene: 0.** So V1's extra one-shot entries never
  hold anything in this walk, and V1i's cut changes nothing visible here.
- **Paused scenes on screen:** only the morph panel, which is not touched by I4 or I40. #platform is never on screen
  while it is paused. It switches to active about 1 viewport before it enters (Chrome geometry: switch at y 2560,
  #platform top 4082, viewport 775).
- Not covered by the probe: interaction-started one-shots inside a paused scene (menus, tooltips, dialogs in the
  morph panel), and a finger fling that pauses a scene mid-entrance faster than one 100 ms step.

**Risks per arm:**
- I4 (V1i): a one-shot entrance that is running when its scene pauses would finish offscreen instead of resuming
  later. The probe saw none. V4 is inert for visuals: no initial value, so the 100vh fallback still applies.
- I40: the 3 marquee tracks keep animating while #platform is paused. (This bullet first also said "the artboard and
  tracks keep their will-change layers while #platform is paused". That is **wrong under bplus's fw-wc gate**: their
  will-change is `auto` whenever they are more than half a viewport off screen, and #platform is paused only then;
  see "RBi40p: layers and the will-change gate".) They are never on screen then, so pixels cannot change. The cost
  moves, though:
  - after the one-way un-skip at y≈2200, these animations run for the rest of the page life, including at the top
    and at the page end;
  - block 2 also saw the y≈2990 nested layout at 18-20.5 ms, against I4's 14-19 (ms are info only; host noise is
    possible).
  - Neither is a pixel risk. Both are a work risk that nothing here has counted yet.
  - Superseded by the RBi40 count below: in this build the first bullet does not happen.

**Recommendation.**
1. Land the I4 list cut on the current stack first: "RBi" = RB with V1i's animation list, with or without V4.
   - Expected: switch nested 2 → 1.
   - Visual risk: none observed (above).
   - Before landing: a pixel A/B of RBi vs RB with an A/A (full-viewport shots, plus held frames of any region whose
     animations RBi changes), on tools at or after d00ee9a, and the phone ticket when the phone is back.
   - Independent of ST: RBi touches only animation-skip lists, not the carousel.
2. Hold I40 until a Sim structure count shows that the unpaused tracks add no background work: idle at the page end
   and back at the top after passing #platform, RS / Layout records per second, RBi vs RBi40.
   - If that count is equal, I40 is the better arm (0 nested, RS ≈0) at the same pixel risk (none).
   - Otherwise stop at RBi.

The lead signed this recommendation as written.

**RBi pixel A/B** (headless Chrome, tools include d00ee9a (I-046), shared lane, 00:3x-00:47Z; pixels and states, no
timing; `out/scene-scope/rbicheck.sh`, `carframes.mjs`, `pageframes.mjs`, `pagecmp.mjs`).
- Build: S0 = RB (CSS 0d7dfc79e703, JS dbd5fdb4f1fb). RBi = S0's CSS with V1i's animation list: CSS 7eec24b73ba5,
  same JS.
- Served from fresh servers with `--no-cache`. curl hashes were checked on every port.
- Arms: S0; S0b = the same files on a second server (the A/A); RBi; S0pc = S0 plus
  `#people, #people * { animation-play-state: paused !important }`, the positive control for the state walk.

| check | S0 vs S0b (A/A) | S0 vs RBi | S0 vs S0pc (positive control) |
|---|---|---|---|
| carousel held frames (method above, 39 per arm) | 39/39 byte-identical | 39/39 byte-identical | — |
| switch region: frozen full-viewport frames at y 2300..3000 step 50 | 15/15 byte-identical | 15/15 byte-identical | 15/15 (#people is not in these frames) |
| on-screen animation state walk, y 0..3400 step 100: steps with equal state sets | 32/35 | 29/35 | 12/35 |
| on-screen samples paused / running, summed over the walk | 105 / 223 | 105 / 220 (S0: 105 / 220) | 164 / 207 |

- Frozen frames: every animation is set to the same phase in every arm (finite ones at their end, infinite ones at 0),
  imgs are decoded, then 2 rAFs pass before the shot.
- Every RBi walk difference is the phase of a running cycle: the hero accent's stroke-in / stroke-out / idle (y 200,
  500, 800, 1200) and the avatar tick (y 1500, 2100). The A/A shows the same kind at y 800, 1000 and 1100. RBi pauses
  nothing on screen that S0 runs, and the paused count is equal.
- The positive control works: it flips the on-screen #people animations (profile-fade, vinyl-spin, avatars-*) to
  paused, and the walk sees it.
- Verdict: RBi is byte-identical to RB in the carousel and the switch region, within the A/A. The lead accepted it.
  RBi is the "also verified" arm.

**RBi40 pixel A/B** (same design and scripts as RBi's, `out/scene-scope/rbi40check.sh car|page`).
- Tools include d00ee9a; two shared slots, 01:02-01:06Z.
- Fresh random ports, `--no-cache`. Served CSS: S0 and S0b 0d7dfc79e703, RBi40 f54dbf45fc55; JS dbd5fdb4f1fb in all.
- GETs of the CSS / JS per server log:
  - carousel slot: 2 / 2 per arm;
  - page slot: S0 3 / 3 (S0pc uses the S0 server), S0b 2 / 2, RBi40 2 / 2.

| check | S0 vs S0b (A/A) | S0 vs RBi40 | S0 vs S0pc (positive control) |
|---|---|---|---|
| carousel held frames (39 per arm) | 39/39 byte-identical, max delta 0 | 39/39 byte-identical, max delta 0 | — |
| switch region: frozen frames at y 2300..3000 step 50 | 15/15 byte-identical | 15/15 byte-identical | 15/15 (#people not in frame) |
| state walk: steps with equal full state sets | 16/35 | 16/35 (S0b vs RBi40: 33/35) | 15/35 |
| state walk: steps with equal **paused** sets | 35/35 | 35/35 | 17/35 |
| paused / running samples over the walk | 105 / 220 (S0: 105 / 231) | 105 / 223 | 164 / 203 |

- In this slot S0 ran out of phase with the other arms: the hero accent and avatar cycles were at different points.
  So the full-state metric drops to 16/35 even in the A/A, and it no longer separates the positive control.
- The paused-set metric ignores which running cycle is at which phase. It compares, per step, only the on-screen
  animations that are paused.
  - It gives 35/35 for the A/A and for RBi40, and 17/35 for the positive control.
  - RBi's run (rbip) gives the same: S0 vs S0b 35/35, S0 vs RBi 35/35, S0 vs S0pc 17/35.
- Verdict: RBi40 is byte-identical to RB in the carousel and the switch region, and pauses exactly what RB pauses on
  screen.

**Idle triple** (protocol v2 §3.5; `out/scene-scope/idletriple.mjs`; headless Chrome, CPU 1x, 430x932 DPR 3;
counts only).
- Two shared slots, 01:11Z (2 rounds; S0, S0b, RBi40, RBi) and 01:15Z (3 rounds; S0, RBi40). Fresh ports; GETs 3 / 3
  and 4 / 4 per arm.
- Spots: top (y 0); mid (walked down 250 px every 100 ms to y 2620, the switch, then parked); end (walked on to the
  page end, y 5345, the morph pin).
- At each spot: 2 s settle, then a 5 s window with no input. A document-start shim counts the page's own:
  - callbacks: rAF + timer (setTimeout/setInterval) + observer (IO/RO/MO/PerformanceObserver);
  - events: scroll, animation* and transition* events at window capture;
  - writes: attribute mutation records (style / class / other);
  - childList nodes added or removed.

Per second; each cell lists the runs.

| arm | spot | callbacks/s | rAF/s | writes/s | style writes/s | nodes/s | events/s |
|---|---|---|---|---|---|---|---|
| S0 (RB) | top | 38.6, 38.8, 50.4, 39.6, 38.6 | 26-38.8 | 64.2, 64.2, 96, 65.8, 63.8 | 58.4-90.6 | 31.2-32.4 | 12.8-13.4 |
| S0b (A/A) | top | 38.6, 39.6 | 27, 27 | 64.2, 65.8 | 59.2, 60.4 | 31.2, 32.4 | 12.8, 13.2 |
| RBi | top | 38.8, 38.6 | 27.2, 26 | 64.6, 63.8 | 59.6, 58.4 | 31.2, 32.4 | 13.4, 13.2 |
| RBi40 | top | 37.6, 46.4, 39.8, 51.6, 46.4 | 26-39 | 62.2, 81.8, 66.6, 97.6, 82.2 | 57.2-91.8 | 31.2-32.4 | 13.2-13.4 |
| S0 (RB) | mid | 10.4 (all 5) | 0 | 11.2, 11.2, 11.2, 10, 15.6 | 6-11.2 | 30 | 16.2-21.2 |
| S0b (A/A) | mid | 9.6, 10.4 | 0 | 12.8, 10 | 8.6, 6 | 27, 30 | 16.2, 21.2 |
| RBi | mid | 10.4, 10.4 | 0 | 10, 11.2 | 6, 7.2 | 30 | 16.2, 21.2 |
| RBi40 | mid | 10.4 (all 5) | 0 | 10, 15.6, 11.2, 10.6, 11.2 | 6-11.2 | 30 | 16.2-21.2 |
| S0 (RB) | end | 2 (all 5) | 0 | 11.2, 15.6, 11.2, 10.6, 11.2 | 6.6-11.2 | 0 | 0.6 |
| S0b (A/A) | end | 2, 2 | 0 | 11.2, 10 | 7.2, 6 | 0 | 0.6 |
| RBi | end | 2, 2 | 0 | 11.2, 11.2 | 7.2, 7.2 | 0 | 0.6 |
| RBi40 | end | 2 (all 5) | 0 | 11.2, 10, 11.2, 10, 10 | 6-7.2 | 0 | 0.6 |

- Equal at all three spots. Timer and observer callbacks, class and other writes, nodes and events match within the
  A/A's spread: run for run equal, except S0b's one mid round at 0.6/s fewer observer callbacks.
- The only spread is at the top, in rAF and style writes. It ranges from about 26 rAF / 64 writes per s to about
  39 rAF / 96 writes per s, and the base covers the same range (S0, first round of the second slot: 38.8 rAF, 96
  writes). So the arm does not cause it. Which hero work produces it was not checked.
- The patch is CSS only. It adds or removes no observer, listener or JS write, and the JS is byte-identical.

**RBi40 Sim count** (recommendation step 2; Simulator, functional shared lane, 00:48-00:52Z; record counts per
second, no ms verdicts; `out/scene-scope/simidle.mjs`, `simidle.sh`).
- Build: RBi40 = RBi minus the 4 platform classes (CSS f54dbf45fc55, JS dbd5fdb4f1fb).
- Run order: RBi, RBi40, RBi40, RBi.
- Each run:
  - navigate, wait 6 s, then walk to the page end (250 px every 150 ms; this passes #platform and its un-skip);
  - Timeline at depth 2: 8 s idle at the end, then scroll to the top, wait 2 s, and 8 s idle at the top;
  - count outermost RecalculateStyles, Layout, Paint and Composite records, and take an animation census.
- Fresh files (I-052): each arm on a new random port, `--no-cache`.
  - CSS GETs: RBi 4 (curl + the first open + 2 runs), RBi40 3 (curl + 2 runs).
  - JS GETs: RBi 3, RBi40 2. The JS is identical in both arms.

| run | end: RS/s | end: Layout/s (nested) | end: Paint | end: anims / running | top: RS/s | top: Layout/s | top: Paint | top: anims / running |
|---|---|---|---|---|---|---|---|---|
| RBi 1 | 118.5 | 58.4 (0) | 1892 | 42 / 3 | 55.0 | 44.5 | 440 | 24 / 8 |
| RBi40 2 | 117.1 | 57.2 (0) | 1864 | 42 / 3 | 55.6 | 38.4 | 398 | 22 / 6 |
| RBi40 3 | 118.2 | 58.2 (0) | 1884 | 42 / 3 | 55.1 | 44.5 | 444 | 24 / 8 |
| RBi 4 | 118.1 | 58.1 (0) | 1895 | 42 / 3 | 57.6 | 44.6 | 447 | 24 / 8 |

- Equal. RBi40's ranges sit inside or at RBi's, except one top window (run 2) that is lower, with 2 fewer animations
  on screen at the top. Same census at the end (42 / 3) in every run.
- Why the 3 un-skipped tracks add nothing in this build (code read, CONFIRMED against the baseline source; CSS lines
  are RBi40's):
  - `.start-selling-platform-cred-track` and `.start-selling-platform-secure-currencies-track` have no markup. No JS
    or HTML in `site-pretty/` emits `platform-cred-row`, `is-marquee-*` or `secure-currencies`; only the CSS has them
    (CSS 6523-6547, 6687-6697). The rules are dead, so un-skipping them cannot start an animation.
  - `.start-selling-platform-profile-reviews-track` animates only under
    `.start-selling-platform-profile:not(.is-static).is-enter` (CSS 7569). `is-enter` is set by an IntersectionObserver
    and cleared again when the profile visual drops below 35 % visible (baseline JS 12024-12030, class at baseline JS
    12135; JS 12379 in B). So it runs only while its own visual is on screen, whatever the paused-scene rule says.
  - `.start-selling-platform-stage-artboard` exists (JS). This bullet first said "In RBi40 it keeps its `will-change`
    layer while #platform is paused off screen". Wrong under the fw-wc gate (JS 2696-2714): the artboard is in
    `fwWCSel`, so its will-change is `auto` while it is more than half a viewport off screen, which is whenever
    #platform is paused. The layer probe confirms it for RBi40p (no non-auto will-change under #platform at y 2407).
    The count above shows no main-thread difference.
- Verdict for the recommendation's step 2: the count is equal. By the signed rule, I40 is the better arm (phone block
  2: switch nested 0/0/0 vs I4's 1/1/1) at the same pixel risk.
  - Its pixel A/B and idle triple have run since (above): byte-identical, and equal. RBi40 was then the landing
    candidate; the review (8690486) replaced it with RBi40p (top of this README).

## Morph start (R4 / V3)

- B's morph start at the page end: RS 16.9-18.8 ms, self 13.7-15.1 (phone, OBSERVED). Writes in one task:
  `--morph` on `.start-selling-top-nav` (JS 13614), `--morph-fade` + pointer-events on `.start-selling-platform`
  (JS 13279), class toggles, and the panel's `data-start-selling-scene` (JS 13567).
- V3 (panel scene) needs no separate change: the panel uses the same attribute, so V1's narrowed rules apply.
- R4a (overlay `fixes/scene-scope--r4` = V1 + `@property --morph-fade { syntax: "<number>"; inherits: false;
  initial-value: 1 }`): `--morph-fade` is read only by `.start-selling-platform`'s own filter/opacity (CSS 5425-5429;
  no other file), so registering it non-inheriting is safe without JS. Same hunk as fix-nav-morph's v04.
- R4b (overlay `fixes/scene-scope--r4b`, CSS 0d7dfc79e703) = R4a plus a CSS-only change, no JS:
  ```css
  @property --morph { syntax: "<number>"; inherits: false; initial-value: 0; }
  .start-selling-top-nav-bar, .start-selling-top-nav-logo, .start-selling-top-nav-actions,
  .start-selling-top-nav-btn.is-earn, .start-selling-morph, .start-selling-morph-pill,
  .start-selling-morph-panel { --morph: inherit; }
  ```
  - JS 13614 writes `--morph` on the nav header. Each of its 7 consumer classes, and the bar between the header and
    the logo/actions, pulls the value with an explicit `inherit`.
  - The rest of the nav subtree no longer restyles per tween frame.
  - `.start-selling-morph` and `-morph-pill` match no element today (dead CSS); they are listed so they stay correct.
  - Chrome (holds 4-5, counts):
    - consumers' computed `--morph` is equal to C's at forced 0, 0.5 and 1;
    - screenshots differ from C by 0-0.15 % at m=1 and m=0.5, against a C-vs-C floor of 0.11-0.14 %;
    - elements restyled at the morph start: C 397 → B+V1 377 → R4a 171 → R4b 124;
    - per tween frame: C 77-80 elements → R4b ≤~25.

Phone block 3 (iphone-runner, M driver `__fwMorphDrive`, 3 forward tweens per run, counted C1 A2 B3 A4 B5 C6 B7 C8 A9;
C = B+V1 851c397012bc, RA = R4a dfb29cc686ee, RB = R4b 0d7dfc79e703, JS dbd5fdb4f1fb in all arms; M sentinels
atOne p95 17/17 ms, pass; phone 35.7 → 38.6 °C, so arms compare at matched positions; OBSERVED):

| arm | start RS total/self ms (tween 1) | nested Layouts in the start RS | nested Layout sum per tween ms (tw1/tw2/tw3, 3 runs) | median tween RS self ms | per-frame RS self median / max ms | fade frames 2-5: self ms / nested |
|---|---|---|---|---|---|---|
| C | 15.3/9.4, 15.5/9.3, 15.0/9.2 | 2/2/2 | 33/44/42, 35/33/30, 38/33/32 | 0.5-0.7 | 1.6-2.7 / 4.1-7.4 | 3.2-7.4 / 1-3 |
| RA | 13.7/8.3, 14.7/9.1, 15.4/9.9 | 2/2/2 | 33/35/33, 33/34/29, 32/26/25 | 0.5-0.8 | 1.6-2.7 / 3.2-5.2 | 1.3-3.0 / 0-2 |
| RB | 15.4/10.0, 15.0/9.4, 16.3/10.4 | 2/2/2 | **3/1/1, 2/2/1, 2/2/1** | **0.1-0.2** | **0.6-0.8 / 2.1-3.5** | **0-1.8 / 0** |

- No arm has an outside Layout ≥2 ms in the tween or its 300 ms lead-in.
- Tweens 2 and 3 have no big start RS in any arm (0.2-0.5 ms), so the start metric is tween 1.
- Strict scoring:
  - P-049 MISS: the start keeps 2 nested Layouts in every arm.
  - P-050 MISS: RA equals C; RB leaves 1-3 ms, not 0.
  - P-051 MISS: start self is equal across arms.
  - P-052 HIT.
- What it means: **RB cuts the morph tween's nested Layouts from 30-44 ms to 1-3 ms per tween.** That is the layout
  that inherited `--morph` dragged through the nav subtree on every tween frame. RA only trims the fade frames.
  The morph start's own 2 nested Layouts come from something else; that is not attributed yet.
- RB still needs an F (finger) correctness and touch check before landing, through the lead's console. G is blocked
  by I-042.
- **Overlap with fix-nav-morph (parked):**
  - fix-nav-morph owns the nav CSS. RB adds the `@property --morph` rule and the `--morph: inherit` hunk on the 7
    consumer classes listed above.
  - RA's `@property --morph-fade` is the same hunk as nav-morph's v04.
  - The lead settles the stacking when nav-morph unparks. Until then, RB lives under r4-v3, which I own.

## Experiments tried

Rows for `fixes/EXPERIMENTS.md` (DoD 7a). Every variant's diff is `fixes/scene-scope/variants/<nn>.diff` (stacked on
bplus like `patch.diff`, except 18). Timing is deferred, so no row has a timing result; "validity" is about the counts.
Abbreviations: Sim W = Simulator W driver (structure only); flipprobe = Chrome counts at the #platform enter flip.

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status | bench | driver | prediction | attribution |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| scene-scope/01 | V1: both `:where(*)` arms → flat lists (110 animation subjects, 16 will-change classes); CSS 851c397012bc | universal subject restyles the whole scene on the flip; flat lists stop the subtree invalidation | better (counts) | clean (counts, tools before d00ee9a) | #platform flip restyled 345 → 99, subtree inv 2 → 0; phone block 1 switch nested raw 2 (P-040 MISS) | README "Mechanism check", "Block 1" | flat lists, never `:is(<list>)` (F-098, F-100) | landed in RB (8207797) | `variants/01.diff` | chrome-probe; S | P-040 | NAMED (positive) |
| scene-scope/02 | V1 written as `.scene :is(<list>)` (overlay scene-scope--is) | same as /01 in one selector | WORSE (flip ULT duration, info only) | clean (counts) | flip ULT 17-23 ms vs 7-12 flat (info) | F-098 | a multi-argument `:is()` subject is not bucketed | dropped | `variants/02.diff` | chrome-probe | none (probe) | NAMED (negative) |
| scene-scope/03 | V1-anim-only: animation arm flat, will-change arm left `:where(*)` | the animation arm alone carries the subtree restyle | no change | clean (counts) | subtree inv 2 = C | README "Mechanism check" | either universal arm invalidates the subtree | dropped | `variants/03.diff` | chrome-probe | none (ablation) | NAMED (negative sibling) |
| scene-scope/04 | V1i: animation list cut to the 18 infinite animations; CSS 298587e0bb94 | fewer listed elements under containers, one nesting level less | better (structure) | clean | flip restyled 23; phone block 1 nested 1/1/1 (P-041 HIT) | "Block 1" | one container level per listed depth (F-099) | superseded by RBi / RBi40p | `variants/04.diff` | chrome-probe; S | P-041 | NAMED |
| scene-scope/05 | I4 = V1i + V4 (`@property --start-selling-intrinsic-block-size`) | V4 removes the y≈2990 nested layout | switch nested 1/1/1 (P-045 HIT); y≈2990 unchanged (P-047 FAIL) | clean (phone) | block 2 | "Block 2" | the y≈2990 layout is not the custom-property restyle | dropped (V4) | `variants/05.diff` | S | P-045, P-047 | LOCATED |
| scene-scope/06 | I40 = I4 minus the 4 platform classes in both lists | depth 1 entries gone → 0 nested | switch nested 0/0/0 (P-046 HIT), window sums not lower; y≈2990 1/1/1 (P-048 FAIL) | clean (phone) | block 2 | "Block 2" | the layout moves out of the RS (see RBi40p) | superseded by RBi40 / RBi40p | `variants/06.diff` | S | P-046, P-048 | LOCATED |
| scene-scope/07 | I40w = I40 minus `.start-selling-platform-card` from the will-change arm | platform-card's will-change restore triggers layout (H1) | abandoned (built; H1 refuted from source, F-106) | n/a | none | "Root hunt" | will-change changes recomposite, not layout (WebKit StyleDifference) | dropped | `variants/07.diff` | none | none | n/a |
| scene-scope/08 | R4a = V1 + `@property --morph-fade` (non-inheriting); CSS dfb29cc686ee | the fade write stops restyling the section | within noise vs C at the start; trims fade frames | clean (phone) | block 3: start nested 2/2/2; tween nested 25-35 ms vs C 30-44 | "Morph start" | the fade is a small term | landed in RB | `variants/08.diff` | M | P-050 | LOCATED |
| scene-scope/09 | R4b = RB: R4a + `@property --morph` + `--morph: inherit` on 7 consumers; CSS 0d7dfc79e703 | the per-frame `--morph` write stops restyling the nav subtree | better (structure) | clean (phone) | tween nested 30-44 → 1-3 ms; tween RS self 0.5-0.7 → 0.1-0.2 ms (P-052 HIT) | "Morph start" | register-and-inherit scopes a custom property (F-103) | landed (8207797) | `variants/09.diff` | M | P-049..P-052 | NAMED |
| scene-scope/10 | X1 = I40 + `#platform { animation: none }` | animations under #platform cause the switch layout | abandoned (dropped for the rotator check) | n/a | none | "Root hunt" | the outside layout was the rotator (F-111) | dropped | `variants/10.diff` | none | none | n/a |
| scene-scope/11 | X2 = I40 + deferred render never skips | the c-v flip at y≈2990 | abandoned (sent to fix-scroll-engine) | n/a | none | "Root hunt" | fwReskip belongs to fix-scroll-engine (F-107) | dropped | `variants/11.diff` | none | none | n/a |
| scene-scope/12 | ST = RB + rotator-st6 (JS 59b23b3f57fd) | removes the rotator-tick layout from the switch window | broke (pixels): carousel 0/39 identical, max delta 72 | clean (counts, pixels) | Sim ticks with a view Layout 8/8 → 0/8 | "Switch root" | a resting layer re-rasters (F-114) | dropped (st6 parked) | `variants/12.diff` | chrome-probe; W | none (stack check) | NAMED (rotator) |
| scene-scope/13 | STwo: ST with `will-change: opacity` only | keep st6 without the blur | broke (pixels): 0/39, delta 2 | clean | Chrome 0.4k-9.1k px | "Carousel frame check" | any resting layer changes Chrome raster | dropped | `variants/13.diff` | chrome-probe | none | n/a |
| scene-scope/14 | STwo1: STwo + rest opacity 1 | as /13 | broke (pixels): 0/39, delta 2; Sim rest delta 16-17 | clean | ≤2.8k px | "Carousel frame check", "Simulator held frames" | same | dropped | `variants/14.diff` | chrome-probe; Sim frames | none | n/a |
| scene-scope/15 | RBi = RB with V1i's animation list; CSS 7eec24b73ba5 | /04 on the landed stack | verified (pixels identical, state equal) | clean | carousel 39/39, switch 15/15 identical | "RBi pixel A/B" | — | superseded by RBi40p | `variants/15.diff` | chrome-probe | none | NAMED |
| scene-scope/16 | RBi40 = RBi minus the 4 platform classes; CSS f54dbf45fc55 | /06 on the landed stack | verified, then returned by review 8690486 (cuts hero/people one-shots too) | clean | carousel 39/39, switch 15/15; Sim idle count equal | "RBi40 pixel A/B", "RBi40 Sim count" | cut only where the mechanism is | superseded by /17 | `variants/16.diff` | chrome-probe; Sim idle | none | NAMED |
| scene-scope/17 | **RBi40p** = RB minus the 32 #platform animation entries and 4 will-change entries; CSS 24c2e85682fe | listed elements under #platform's containers → 0, so 0 nested Layouts at the switch | attribution only (Sim n=2), no gain claim; same switch cost | clean (counts; Sim n=2) | flip restyled 99 → 66, listed in CQ 36 → 0; Sim switch view-rooted nested 1 → 0, RS self 1.1-1.4 → 0.2 ms, RS + following Layout 19.4-21.4 → 18.3 ms | top of this README | the nested count can drop while the layout moves out of the RS | **landing candidate** | `variants/17.diff` = `patch.diff` | chrome-probe; W | P-053 (HIT), P-054 (inCQ HIT, restyled MISS) | NAMED (D card unsigned) |
| scene-scope/18 | A+V1: V1 on the plain baseline (overlay scene-scope--a) | the mechanism without bplus | better (counts) | clean (counts) | restyled 344-354 → 101-109 | "Mechanism check" | the A vs B difference is liveness, not y | done (decoupling arm) | `variants/18.diff` (on the baseline) | chrome-probe | none | NAMED (decoupling) |
| scene-scope/19 | RBi40pw = RBi40p with the 4 will-change entries kept; CSS f43d10d644ce | the will-change entries are the depth-1 term | as predicted: nested 1 | clean (Sim n=2) | Sim nested 1/1; flip restyled 71, inCQ 5 | "RBi40p: Sim switch structure" | depth model holds for will-change entries too | diagnostic | `variants/19.diff` | W; chrome-probe | P-055 ((a) HIT, (b) inCQ HIT, restyled MISS) | NAMED (positive, depth) |
| scene-scope/20 | RBi40p0 = RBi40p minus scene root (both lists) and the 4 row titles; CSS a80e69b94055 | the moved view Layout comes from the kept #platform matches | no switch layout | clean (Sim n=2) | cE-initiated layout 18.1 → none | "What RBi40p removes" | locates the next target | diagnostic (changes every scene root: not landable) | `variants/20.diff` | W | none (diagnostic) | LOCATED |
| scene-scope/21 | RBi40pt = RBi40p minus the 4 row-title entries; CSS 10cf34974e67 | split /20: row titles | no switch layout | clean (Sim n=1) | none vs 18.1 ms | "What RBi40p removes" | the row titles carry it | diagnostic (needs a pixel check before any candidate) | `variants/21.diff` | W | none (diagnostic) | LOCATED |
| scene-scope/22 | RBi40pr = RBi40p minus the scene-root entries; CSS 8184bceef75b | split /20: scene root | layout stays (21.0 ms) | clean (Sim n=1) | 21.0 ms after the RS | "What RBi40p removes" | the scene root is not it | diagnostic | `variants/22.diff` | W | none (diagnostic) | LOCATED (negative) |

## Cards (protocol v2)

Attribution card (D), for the lead. **UNSIGNED**: no signed "D:" line exists; sent to the lead to sign or return.
- Mechanism: universal-subject paused-scene rule → whole-subtree restyle on the attribute flip → restyled elements
  under size containers → one style round + interleaved layout per nesting level. The card explains the nesting
  structure and the RS self time (Sim 3.1 → 0.2 ms) plus B's second ~1.5 ms round, not the ~18 ms layout, which exists
  without the nesting.
- Frame (where it shows): phone y≈2615 RS (B: 29-32 ms; 2 nested Layouts). Axis: crossing of the #platform enter
  gate (top − 2 vh).
- Positive ablation: V1 (narrow lists) — Chrome: subtree invalidations 2 → 0, restyled 345 → 99. Negative sibling:
  V1-anim-only (no change). Decoupling: A vs B (same flip, #platform skipped vs live) moves the cost with liveness, not
  with y.
- Depth ablation (Sim W, structure, view-rooted nested Layouts only): B 2 → RB 1 → RBi40pw (depth-1 will-change
  entries kept) 1 → RBi40p 0, matching depth 2/1/1/0. RB's extra 0.1 ms 390x312 nested Layout is not view-rooted and
  UNEXPLAINED (P-040's lesson). P-053/P-055a were scored on raw counts (RB 2); on view-rooted counts their V values
  are unchanged.
- What the card does **not** cover: the ~18 ms view Layout that follows the RS in RBi40p (OBSERVED, Sim n=2; it moves
  out of the RS rather than going away). The split puts it on the 4 row-title entries (RBi40pt none, RBi40pr 21.0 ms;
  n=1 each). Its mechanism is UNEXPLAINED; that is a separate card for the next target.
- Platform claims relied on: WebKit attribute invalidation (CONFIRMED, StyleInvalidator.cpp 29dd51e); WebKit CQ
  interleave per nesting level (CONFIRMED, StyleTreeResolver.cpp c0726d0, Document.cpp 079c1e3); non-bucketed
  `:is()` (CONFIRMED, F-100). WebKit `main` vs iOS 26.6.1: to be checked against the phone counts. Chrome's tag
  invalidation of the bare-tag subjects: OBSERVED (trace reasons), Chrome-only, not relied on for the phone.

**Scenarios run for RBi40p:** reload while scrolled (a), early jump (b, 3 reps), fling during an entrance (c), Sim
bfcache back (d), walk down and back up (census), idle at top / mid / end (idle triple, RBi40). **Not run:** early input
(tap), toolbar resize, rubber band; these need G or F on the phone (T-011).

## Risks, conflicts, follow-ups

- A future animated class not in the list keeps running while its scene is paused (cost, not visual). The list is
  complete for this snapshot (0 misses). If st5 (scroll-engine) lands, add its carousel selectors
  (`.start-selling-avatars.is-carousel img` will-change; `.is-carousel.is-sliding img.st5-lead`, `img.st5-lead ~ img`,
  `~ img.st5-next` animations); whoever lands second adds them.
- **Coupling with the fw-wc gate (fix-scroll-engine, acknowledged).** RBi40p drops stage-artboard and the 3 tracks
  from the will-change arm because bplus's fw-wc gate already holds them at `auto` while #platform is paused. That
  rests on two things fix-scroll-engine owns: those 4 classes staying in `fwWCSel` (JS 2702), and the
  IntersectionObserver margin of 50 % (JS 2710) staying smaller than the distance between the #platform switch
  and the screen (about one viewport). If either changes, the artboards could keep a will-change layer while #platform
  is paused: layer memory and compositing, not pixels (off screen). Whoever changes the gate re-runs
  `out/scene-scope/layprobe.mjs` (non-auto will-change under #platform at y 2407 must stay 0).
- The first fw-wc scan sets `data-fw-wc="1"` 500 ms after load plus idle, before the IO's first callback; in that
  window RB's paused arm forced `auto` on the 4 classes and RBi40p does not. Off screen, transient, not counted.
- Next target (not in RBi40p): the ~18 ms view Layout right after the switch RS, which follows the 4 row-title entries
  (split above). Any cut there lets the row-title sweeps run while #platform is paused, so it needs a pixel check of
  every place a paused #platform is visible and its own prediction first.
- Chrome-only: the kept bare-tag subjects (`.commission-underline path`, `.start-selling-avatars img`) invalidate
  every `path` / `img` under a flipped scene by tag (54 at the #platform flip). WebKit is not affected (full-match
  invalidation), so this is not a phone target.
- fix-nav-morph: the cdwc `.face` will-change must stay `auto` in the panel; V1 only ever sets `auto`, so it holds.
- V1b (pause via `getAnimations` in `cE`) needs fix-scroll-engine's approval; not built.
- V2 (flip at idle): only if V1 leaves cost.
- V4 (`@property --start-selling-intrinsic-block-size`): measured in block 2 (I4). It did not remove the y≈2990
  nested layout, so it is not a landing candidate on its own.
- Custom-property scope (F-103, CONFIRMED in source):
  - WebKit main c59d70e: an unregistered custom property is inherited rare data, so a change is Change::Inherited and
    all children restyle. A registered `inherits: false` property gives Change::NonInherited, so only children with an
    explicit `inherit` restyle. The exception is a name used in a style container query.
  - Blink b2fe636: `computed_style.cc` ComputeDifference, kInherited vs kNonInherited (source only).
