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
4. Single-topic clean re-runs (commission /05, layout-animations 05, countdown, pain, large-area-blur),
   only where the combined result or a Tier B benchmark needs one topic isolated; all after the host gate.
5. N4 / N10 fixes (N3 rejected 2026-10-01, F-015) as their prototypes pass Tier A.

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
| AV3 F-016 (430x932 trips apple.com base tier), F-017 (per-call debounce in Apple analytics), F-021 (`html { scroll-behavior: smooth }`: scripted scrollTo must pass `behavior:'instant'`) | yes, as pitfalls | every owner writing a probe | F-021 applies to every scripted scroll driver on our page |

iPhone scripted-check queue (when the phone is back; lease per CLAUDE.md, plain http per I-003), in order:
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
7. Look-only (N3, F-015; decides whether N3/04, a T6 pause for step-end and compositor loops, is worth building):
   (a) does WebKit tick the step-end opacity loops (three-frame at commission, agents caret) on the main thread
   every frame or only at steps (Safari Timeline, 6 s idle parked at y≈2796 on the plain baseline: style recalcs /
   paints in the underline and zero-mark rects); (b) do off-screen composited loops (scroll-float, vinyl,
   marquees) keep the render server compositing at idle (Timeline "Composite" count at an idle stop with all of
   them off-screen, vs the same stop with `animation-play-state: paused` injected). Method:
   `fixes/main-thread-infinite-animations/README.md` "iPhone pending".
