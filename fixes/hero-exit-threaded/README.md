# Fix: hero-exit-threaded

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** F build done (rounds 4-8, "F rounds 4-8" below), measured by Simulator counts and frozen-frame pixels
(no timing: timing A/Bs deferred, user 2026-10-02). Not ready to land. Next: the phone block on the F build under a
new prediction (P-08x, registered by ops) in the normal condition, then the finger swipe A/B (lead, 2026-10-03).
P-074 (V build, 30 ms timer grid) sent this back to F: touchstart OUT (+2 style recalcs), rest no data. The F build
removes the touchstart style work (0 vs C 0), keeps the writer on wide layouts (R5), and parks the animations at rest.
Open for the user: the deck item (R6, T3) and the PR-010 tier of the live-frame bits ("Pixel tiers").
Earlier rounds: review round 2 (NEEDS-FIX on 66d2abe), round 3 (ACCEPT-WITH-NOTES on e36423f, P-074 ticket read
NEEDS-FIX). Current build: JS `8e43f3792dbf`, CSS `cc74cd980e72` (snapshot `out/snapshots/hext-V-8e43f3792dbf`).
**Stage:** F (build card in "F rounds 4-8"). D: ST-1 accepted by the lead 2026-10-03 01:17Z as "partly LOCATED"
(H2a and H2c not supported on the Simulator; H2b Composite open, phone slot).
**Device class / gate:** WebKit-only build (Safari / iOS). Chrome, Firefox and other engines run the baseline
code (gate below). Evidence: Simulator counts and frozen-frame pixels, Chrome parity (headless).
**Driver(s) behind the claims:** Simulator, functional sessions (scripted `scrollTo` steps, Timeline records,
`simctl io screenshot`); Chrome frozen-scroll parity. No phone run yet (S / W / M / G / F: none).
**Prediction:** brief `research/gpu-props/README.md` §6 S1 (F2): the y≈50 frame 48 → 35 ms (earlier v2 phone run).
**Topic:** `research/gpu-props/README.md` §5 F2 / §6 S1 (restack of topic 7 `hero-exit-scroll-timeline` v2 on st6-rb2).
**Base:** st6-rb2 (`fixes/st6-rb2/`, overlay JS sha256 `7bf7c4657d21…`, CSS `f523598b2a24…`).
`patch.diff` is against the baseline snapshot, so it carries st6-rb2's changes too. Apply on the st6-rb2 overlay.
**Files touched (delta over st6-rb2):**
- `/_app/immutable/nodes/2.DyWL8TcE.js`: the hero `ne(() => …)` effect (overlay lines ~4383-4640). Helpers (F
  build) `heCss`, `heLive`, `heRT`, `heRest`, `heTS`, `heTE`, `heSc`, `heUp`, `hePE`, `heWrap`, `heOff`, `heArm`,
  `heSync`. Mode switch in `d()` and `p()`, the `dE` callback, cleanup.
- `fixes/hero-exit-threaded/pF/scoreF.mjs`: the scorer for the F-build phone block (sha256 `32ed5f4e81f9`).
- `fixes/hero-exit-threaded/pF/framesF.mjs`: frame-gap counts (dt > 50 / > 34 and twins) for P-081 (sha256 `40d0d302c3f1`).
- `fixes/hero-exit-threaded/gestures/hero-pass-v1.json`: the WDA gesture of the phone attribution block (P-074).
- `/_app/immutable/assets/2.gBuqKVzi.css`: one new `@supports (animation-timeline: view()) and (animation-range:
  contain 0% contain 100%)` block after the hero rules (overlay lines ~2158-2320).

## Why it lags

st6-rb2's writer `s` (overlay JS ~4458-4467) runs on every scroll frame in y 0-855. The `dE` scroll callback calls
`c()`, which schedules `rAF(s)`. `s` then:
- reads `getBoundingClientRect()` of `.hero-track`;
- writes `--exit-opacity` on `.hero`;
- writes `pointer-events`.

The custom property feeds `--exit-scatter` and the opacity, translate, transform and blur of the copy, the deck
cards and the scroll cue. So each scroll frame restyles the hero subtree and repaints it on the main thread before
WebKit can paint.
- Brief: `research/gpu-props/README.md` row 2 and §6 S1. The C-026 band y < 1000 holds 63 of st6-rb2's 81 long
  moving frames.
- Simulator (this topic, OBSERVED): during a 12 px stepped scroll y356 → 884, C repaints a viewport-sized hero clip
  on every frame (21 frames, 20.2 Mpx of paint in the scroll phase).

## F rounds 4-8 (current build: JS `8e43f3792dbf`, CSS `cc74cd980e72`)

The lead's F instructions after P-074: (1) remove the touchstart style recalc, pixel-identical in every frame;
(2) explain or cut the rest repaint (accepted as a trade-off); (3) R5 at width 980 (accepted: wide layouts keep the
writer, OBSERVED); (4) a scorer for the F block (`pF/scoreF.mjs`), registered by ops as P-081 (ticket below).

**Root cause of the per-frame style recalc (CONFIRMED, WebKit source, main `13a1f2916933547024ee020d94031096a41eb7cb`).**
`WebAnimation::computeRelevance` counts an animation on a scroll timeline as relevant unless it is idle; the
`AnimationTimelinesController` ticks every relevant animation on every rendering update, and
`KeyframeEffect::animationDidTick` calls `invalidate()`. So while the scroll-driven animations exist, every element
that carries one gets a style recalc on every frame, whether the page moves or not. In the V build this showed up as
1 recalc per frame at rest (C 0) and, on the phone, as the +2 RecalculateStyles of the touchstart rows (`.he-tf`
arriving). Removing the animations (the class goes) stops it: 0 per frame in the Simulator.

**Design: parked at rest, live while scrolling (phone layout, width ≤ 600 px, WebKit gate unchanged).**
- **Parked** (`.he-on` only): no exit animation exists. The baseline's own rules draw the hero from the inline
  `--exit-opacity` that `s()` writes, and the `dE` callback runs the baseline writer, as in C.
- **Live** (`.he-css` added by `heUp`): `heSc` (capture-phase `scroll` listener on `window`, document scrolls only)
  goes live on the first scroll event that lands at `top + 30 < y < end`. `s()` first writes the inline value for
  the current `scrollY`, so the new animations' pending frame draws the right base values. While live the inline
  value stays (stale): every property that reads it is animated (cards, copy, float), and the cue's own exit rule
  is replaced by its value at `--exit-opacity` 1 (the float carries the cue's exit).
- **Park**: `heRest`, 300 ms after the last scroll event with no finger down, writes `s()` for the final `scrollY`,
  then removes `.he-css` (no pending frame on removal). A scroll to `y ≤ top + 30` parks at once (`heSc`).
- **The 30 px band.** Below `top + 30` the parked writer runs, as in C. There the cue's blur is under 0.7 px, and the
  float's animated blur drew the cue up to 78 levels off C at y6 (0 at y30; Simulator, OBSERVED, cause unknown).
- **Touchstart** only sets a flag (`heTS`, no class, no style work); the copy's shift animation comes with `.he-css`.
- **Wide layouts** (> 600 px: desktop and iPad Safari, a landscape phone) keep the baseline writer, so R5 cannot occur
  (`heOff` leaves CSS mode when the layout widens).
- Removed from the V build: `.he-tf`, `heOn`, `heWK`, `heTf`, `heHold`, the 600 ms disarm timer, and the inline copy
  hold.

**Rounds.** F3 (round 4, `fc640177a022`): parking; +50 paints at go-live and park. F5 (`fead8ad082d6`): no var drop
while live, which removed those paints. F6 (`62ed5e1632a2`): park at once at `y ≤ top + 1`. F7 (`8e43f3792dbf`, the
current build): the 30 px band. F8 (CSS `a022d5ad3a91`, not kept): an exact card `from` keyframe at 0 %, to remove the
deck item. It changed nothing: the deck item is C's own transient (R6 below), so the CSS went back to `cc74cd980e72`.

**Cost card (Simulator Timeline, `tools/costcard.mjs`, arms C / F / C2 = A/A; `costcard-f7.{json,md}`; the V column comes from
the round-3 card `costcard.{json,md}`, another session, whose C matched this C except at rest: C S8 L7 P5 A36k).** S = RecalculateStyles, L = Layout, P = Paint records, A = paint area (device
px). OBSERVED; Simulator counts, no ms.

| event | C | V (P-074 build) | F (current) | C2 (A/A) |
|---|---|---|---|---|
| touchstart at the top | S0 L0 P0 | S4 L0 P0 | **S0 L0 P0** | S0 L0 P0 |
| first move off the top | S1 L2 P55 A368k | S5 L2 P55 A368k | **S1 L2 P55 A368k** (= C) | S1 L2 P55 A368k |
| move (stepped scroll in the hero) | S50 L148 P111 A3.91M | S53 L147 P49 A1.01M | S51 L148 P104 A1.25M | S50 L147 P111 A3.91M |
| move2 (second pass) | S61 L136 P81 A14.9M | S43 L134 P41 A0.83M | S43 L135 P42 A0.83M | S60 L134 P82 A14.9M |
| touchstart mid-hero | S3 L3 P2 | S4 L3 P3 | S3 L3 P2 | S3 L3 P2 |
| scroll mid-hero | S6 L8 P5 A358k | S5 L7 P5 A26k | S5 L7 P8 A407k | S6 L8 P7 A360k |
| rest (park) | S5 L4 P5 A387k | S14 L6 P5 A55k | S11 L5 P10 A682k | S6 L5 P4 A34k |
| rest2 (past the end) | S0 L0 P0 | S7 L0 P0 | S5 L1 P6 A315k | S0 L0 P0 |

Per-frame style recalcs at rest (rc, timers cleared, 4 s): y0 C 0 / F 0; y300 C 36 / F 33 (V before parking: 1 per
frame more than C).
- The first move off the top is C's frame exactly: inside the 30 px band F runs C's writer.
- The rest repaint (instruction 2, the accepted trade-off): the park frame repaints the copy box (about 182k px) and
  5 small cells, because the animated layers go and the baseline draws them again. One root-layer repaint (about 333k
  px, the size of one C moving frame) follows at the page's next style change, 260-590 ms after the rest mark (the page
  timer at JS 6642). Hypothesis: deferred layer teardown (OBSERVED, not attributed). C's own rest area varies 34k-387k
  between C and C2.
- rest2: the park past the end of the hero (the exit is complete, nothing visible changes) costs the same kind of
  repaint; C does nothing there.

**Pixels (frozen frames, Simulator 1290x2796; F frame k vs C frame k+1, because C's writer is one rAF late; C2 = the
same C snapshot on its own server, a true A/A in the same session).** Tolerance report as in
`research/pixel-tolerance/README.md` §1: area beyond A/A = pixels that differ where C2 vs C does not; ">8" = over 8
levels; status-bar clock and countdown digit rows (in the A/A too) left out.

| frame | F vs C beyond A/A | > 8 levels | max | edge / fill | A/A (C2 vs C) in that area | tier (PR-010, pending with the user) |
|---|---|---|---|---|---|---|
| parked: at rest, y0, settle, drop, 300 / 700 / 1500 ms after a return to the top | 0 | 0 | 0 | | clock and digits only | T1 |
| first scroll from the top (y0 → y6, the band) | 0 | 0 | 0 | | clock and digits only | T1 |
| go-live pending frame, y306 | 4,368 px, cue | 0 | 1 | fill | 0 | T2 (B and C) |
| live y306, frames 1-2 | 5,476 px (0.152 %, 608 CSS px²): copy glyph edges 1,058, cue 4,418 | 0 | 1 | copy edge, cue fill | 0 | T2 under the report's area (> 8: 0 %); counted at any level 0.152 % > X = 0.1 %: T3 under B, T2 under C |
| live y57 | 5,884 px (0.163 %, 654 CSS px²), cue | 0 | 2 | edge | 0 | same as y306 |
| live y36 | 8,565 px (0.237 %, 952 CSS px²), cue | 2,119 px (0.059 %, 235 CSS px²) | 17 | edge (fill max 2) | 0 | T2 under B (E 17 ≤ 64, 0.059 % ≤ 0.1 %, 235 ≤ 300 CSS px²); at any level 0.237 %: T3 under B, T2 under C |
| R6: return to the top while live, frames 1 to ≥ 120 ms | 57,584 px (1.6 %, 6,398 CSS px²), deck cards | 5,332 px (0.148 %, 592 CSS px²) | 88 | edge (fill max 3) | 0 | **T3** (photos; E 88 > 64; > 8 area 0.148 % > 0.1 %) |

- No difference is "noise": the A/A arm shows none of them. The live-frame bits are motion-only: they show while
  the page scrolls and up to 300 ms after; parked frames are T1.
- PR-010 (b) defines the area as pixels over 8 levels; under that definition the y306 and y57 bits have area 0. The
  tier column gives both readings, because the user has not chosen yet.
- The other T2 conditions: (c) glyph edges and the blurred cue's gradient, no geometry, text, colour or order change;
  (d) reduced motion runs C's code (the CSS block is under `prefers-reduced-motion: no-preference`, `heSc` returns
  under reduce); (e) Chrome runs C's code (gate false; earlier parity par15), WebKit in the Simulator, phone width;
  wider layouts run C's code; (f) true A/A in the same session; (g) no motion-path change (levels only, no shift).
- **R6 (the deck after a return to the top while live).** F draws C's settled deck at once; C draws the deck cards
  differently from frame 1 until at least 120 ms after the return and settles by 300 ms. C vs C itself (topS vs
  topW300): the same 57,584 px, max 88; C2 the same as C. So F shows C's later frame early. Cross-session: F7 and
  F8 at 120 ms are identical, so F3-F7's "deck item" was always this. Cause in C UNRESOLVED. A candidate: WebKit
  paints an image whose drawn size changed recently at low interpolation quality and repaints it at high quality on a
  timer (`ImageQualityController`, `lowQualityTimeThreshold { 500_ms }`, WebKit `Source/WebCore/rendering/
  ImageQualityController.cpp`). The mechanism exists (CONFIRMED in source); that it causes C's transient here is
  not shown. Decisive check: C's paint records over the deck cards between 120 and 500 ms after the return. Options for
  the user: (a) accept (F shows C's own settled frame up to about 0.3 s early, only after a jump back to the top while
  live); (b) reproduce C's transient in F (would mean degrading F's draw on purpose; no known way yet).

**Build card (F).**
- Builds: C = st6-rb2 JS `7bf7c4657d21` CSS `f523598b2a24`; V (P-074) JS `d48d224adcd4` CSS `55ba45f138c9`; F JS
  `8e43f3792dbf` CSS `cc74cd980e72` (immutable snapshot `out/snapshots/hext-V-8e43f3792dbf`, re-checked by sha256).
- Lines for the scorer (`--fn`): C `s=4391`; F `s=4497,heRest=4449` (also `heSc` 4464, `heUp` 4471).
- Scorer `pF/scoreF.mjs` sha256 `32ed5f4e81f9` (score074 + nested heRest fires, a 'first-move' kind, a descriptive
  timer-grid flag). Lead's note: "its P-074 replay shows the scorer works, not that the fix works."
- What the scorer should see on the F build (from the Simulator, OBSERVED): (a) writer share F small but not 0: the
  parked writer runs on moving frames inside y 1-30 (and on the way back up below y 30), a few frames per pass, about
  0.01-0.03 of the moving band frames, inside 0..0.05; C 0.3..1.0. (b) touchstart: in (no style work at touchstart).
  (b) first-move: in (C's frame inside the band). (b) rest: likely OUT on paint (the park repaint above, the accepted
  trade-off).
- Measurement code changed: none. a11y: unchanged from V (the `.he-bob` span only).
- Data (gitignored): `out/hext/f7/` (cost card, rc), `out/hext/f7px1`-`f7px3`, `out/hext/f8px1` (pixels).

### P-081: phone ticket for the F build (registration; written before any F phone data)

A Timeline attribution block with frame-gap counts, not a gain block. The prediction id comes from mgmt-ops-10.
- **Question (one).** On the iPhone at real thermal Serious, under a WDA finger drag (driver G), does F stop running the
  per-frame JS writer on moving hero frames while C runs it, with touchstart and first-move frames that cost no more
  than C's same-phase frames and no more long frames than C?
- **Builds** (immutable snapshot copies, re-checked by sha256 before the block):
  - F: `out/snapshots/hext-V-8e43f3792dbf`, served `nodes/2.DyWL8TcE.js` `8e43f3792dbf` and `assets/2.gBuqKVzi.css`
    `cc74cd980e72`.
  - The one control, C = st6-rb2: `out/snapshots/st6rb2-C-7bf7c4657d21`, `7bf7c4657d21` / `f523598b2a24`.
  - Same base: site-pretty, the snapshot pinned by `baseline.json`.
- **Servers and ports**, one per arm: `node tools/serve.mjs --root site-pretty --overlay out/snapshots/<snapshot>
  --port 0 --https --vendors=local --latency 150 --no-cache --state out/hext/p081/serve-<arm>.json`. The phone loads
  the plain http twin (I-003). Ports go in the block log, never 5173. One uncounted warm-up load per arm port (C and F).
- **Driver G.** Gesture `gestures/hero-pass-v1.json` (sha256 `e3f31872b82f`, unchanged from P-074): two slow drags up
  through the hero with 1 s rests, then two drags back down.
  - **Clear of the nav morph:** the scorer band is y 1..780 and the whole gesture stays at or above the hero end
    (y ≈ 884, rest2). The page-end nav morph (fix-nav-morph's `--morph` at 0 in WebKit, OBSERVED) is never reached;
    none of this topic's Chrome, Simulator or pixel cases reach it either.
- **Condition** (user T-039 B, `memory/phone-checks-start-warm.md`): real thermal Serious.
  - Every hold runs the gate pair `research/phone-thermal-gate/thermal-gate.mjs` (sha256 `4604218c4041`,
    `--expect serious`, `--max-c 44`) at its start and end. A hold counts only when both reads say Serious with
    Is Induced = No; otherwise the hold is re-run.
  - Holds are 900 s, back to back. Stop at 44 °C battery or Critical, and cool before the next hold.
  - Every gate failure goes to the lead. Two failing holds in a row stop the block and switch to A (the lead's switch,
    recorded in the block log).
  - One start method for every run: pre-warm on the plain baseline page the same way for each arm.
  - Logged per run: battery °C, charging state, the timer-grid median.
  - A Low Power Mode run is dropped and re-run.
- **Runs.**
  - n = 2 counted runs per arm, Timeline on, in the order C F F C, after the warm-ups.
  - Sentinel (as P-074): an uncounted Timeline-OFF control run on C with `iphone.mjs run --arm C --heat-sentinel`,
    bottom ≥ 58 fps and scroll ≥ 44 fps, at the block start and the block end.
  - A failing start sentinel: no counted run starts; cool, restart the block.
  - A failing end sentinel voids every counted run of the block; cool, re-run the block once.
  - A void run (scoreF.mjs's void rules: gesture error or abort, Timeline errors or more than one epoch, over 10 %
    uncovered moving band frames; or LPM) gets one in-place re-run. A second void at one position voids the block.
  - **Files from a hold that failed either gate read are never passed to the scorers** (the P-079 lesson); the block log
    lists them as excluded.
- **Scorers** (both committed before data; every valid counted run passed in block order):
  - `pF/scoreF.mjs` sha256 `32ed5f4e81f9` with `--fn C:s=4391 --fn F:s=4497,heRest=4449`, band 1..780: (a) writer
    share, (b) hand-over units, (c) the y≈50 frame and the timer grid, descriptive.
  - `pF/framesF.mjs` sha256 `40d0d302c3f1`: frame gaps per run from the recorder's rAF stamps.
    - Thresholds: dt > 50 and dt > 34, the ±4 ms twins (>46/>54, >30/>38), and near-band frames flagged.
    - Scopes: 'band' (moving hero-band frames, the scored scope) and 'gesture' (drag1 to end, reported).
    - Per-arm medians; F − C. A threshold is threshold-sensitive when a twin's verdict differs from it or from the
      other twin.
    - Pre-registration check only, not a claim: run on P-074's V/C files it gave band V − C >50 −0.5 and >34 −3, not
      threshold-sensitive.
- **Predictions**, written as falsifiers, with P(hit) before data:

  | # | prediction | point | interval (falsified outside) | P(hit) |
  |---|---|---|---|---|
  | a-C | C writer share, every valid C run | ~0.8 | 0.3..1.0 | 0.85 |
  | a-F | F writer share, every valid F run. The parked writer runs on moving frames inside y 1-30 by design. | 0.01-0.03 | 0..0.05 | 0.8 |
  | b-ts | touchstart: every F unit dRecalc ≤ 1, dLayout ≤ 0, dPaint ≤ 0 vs C. F does no style work at touchstart (Simulator 0 recalcs, OBSERVED). | in | OUT falsifies | 0.8 |
  | b-fm | first-move: same bounds. Inside the 30 px band F runs C's writer. | in | OUT falsifies | 0.75 |
  | b-rest | rest: the park repaint, the accepted trade-off | OUT on paint | in or OUT; not a falsifier | 0.6 for OUT |
  | f50 | band dt > 50, F − C | 0 | ≤ +1 (WORSE at ≥ +2); twins >46/>54 the same bound | 0.75 |
  | f34 | band dt > 34, F − C | −2 | ≤ +2 (WORSE at ≥ +3); twins >30/>38 the same bound | 0.7 |
  | grid | timer grid 30 ms in every counted run (descriptive; a run at ~4 ms has failed the gate anyway) | grid30 | none | — |

- **Decisions** (if X then Y):
  - **a-C in, a-F in, b-ts in, b-fm in, f50 and f34 no-worse:** the mechanism holds on the phone under G at Serious.
    F goes to V with two items, and no further block runs for this question:
    - the user's pixel decision (proposal: the live bits and R6);
    - the user's finger A/B (console, through the lead, after the block).
  - **b-rest OUT:** the trade-off the lead already accepted. It does not block landing.
    - The README and the card report it with the heRest TimerFire's own S/L/P next to the next unit's, from the same
      Timeline (a labelled post-hoc diagnostic; the scorer's verdict stands).
    - Landing then rests on (a), b-ts, b-fm, the frame counts, the pixel decision and the finger A/B.
    - b-rest in: reported.
  - **b-ts or b-fm OUT:** F's hand-over costs more than C's. Name the rows, go back to F, then a new build and a new
    ticket.
  - **a-F out:** the CSS path is not active on the phone (gate or switch). Back to F, from the scorer's per-frame lines.
  - **a-C out:** the measure failed, not the fix; no claim.
    - Check the scorer on C's data, then an ops re-read, then a re-score.
    - New runs only if that still fails.
  - **Split in an arm** (runs on both sides of a range): no claim for that arm.
    - At most one second block on the same ticket.
    - A second split goes to the lead as inconclusive.
    - Fewer than 2 valid runs in an arm counts as a void block.
  - **f50 or f34 WORSE (band scope):** no landing on this build. To the lead, with the long frames' units (which
    records hold them, from the same Timelines).
  - **Threshold-sensitive f50 or f34:** to the lead, with no frame verdict.
  - **Gesture-scope WORSE with band no-worse:** reported to the lead (frames outside the hero), with no verdict on the
    fix.
  - **No data for a (b) kind:** to the lead, with no verdict on that kind. Check marks and the heRest line before any
    re-run.
  - **Block void:** no claim. Cool and re-run once; a second void goes to the lead.
- **Expected minutes:** about 40 (range 30-50).
  - 8 runs (2 warm-ups, 2 sentinels, 4 counted) at about 1.5 min each.
  - About 1.5 min of gate reads per hold.
  - Pre-warm to Serious and any ceiling cool-down.
  - It fits in 3-4 holds of 900 s.
  - The user's finger A/B comes after the block and is not part of P-081.

## What changed

On WebKit, once the entrance is over (`d()`), the exit is a set of CSS scroll-driven animations on a `--hero-exit`
view timeline of `.hero-track`. The JS writer stops; no per-frame rect read and no style write remain.
- **Range.** `contain 0.05% contain 100%`, which is the JS formula `p = clamp(-top, 0, h - innerHeight) /
  (h - innerHeight)`.
- **Timing.** `1ms linear forwards`.
- **Keyframes.** Each `from` keyframe is compensated to the baseline value at 0.05%. Nothing is active at rest at
  the top, and inside the range every value is the baseline's `a + (b - a) * p`.
- **Animated properties.** Opacity, `translate`, `transform` and `filter` only. No custom property is animated.

**Gate (lead decision 2026-10-03 03:09Z).** The CSS path runs only where both tests pass:

```js
heCss = `GestureEvent` in window &&
  !!window.CSS?.supports?.(`(animation-timeline: view()) and (animation-range: contain 0% contain 100%)`)
```

- **Why this picks WebKit.** `GestureEvent` is a WebKit-only interface: Safari 9+, iOS Safari 2+, no Chrome, Edge
  or Firefox version. CONFIRMED by MDN browser-compat-data `api/GestureEvent.json`.
- **iOS.** iOS browsers on WebKit (all of them outside the EU, and those that keep WebKit inside it) expose
  `GestureEvent`, so they get the CSS path when they support view timelines. Since iOS 17.4, browsers in the EU may
  ship another engine; those have no `GestureEvent` and keep the baseline writer (CONFIRMED: Apple, "Using
  alternative browser engines in the European Union", developer.apple.com/support/alternative-browser-engines).
- **Feature test.** The `CSS.supports` half requires view timelines with named ranges (Safari 26+; threaded on
  the compositor from Safari 26.4, WebKit blog post 17862, cited in the brief §0.3).
- **Untested slice: Safari 26.0-26.3.** The gate admits it, but there scroll-driven animations are updated on the
  main thread, not threaded, and their pending-frame behaviour may differ. Every WebKit result below is from iOS
  26.5 (Simulator) or 26.6.1 (phone).
- **What other engines get.**
  - Chrome / Edge / Opera (Blink) and Firefox (Gecko, no `GestureEvent`): the baseline writer, unchanged.
  - Older Safari (no view timelines): the baseline writer.
  - The CSS rules all key on `.he-css`, which only the JS sets, so they never apply there.
- **Why not Blink.** Blink composites the animated cards and copy and blends them on the GPU. The painted
  baseline uses 8-bit alpha and pixel snapping instead, so the pixels differ: up to 6 levels on 15-42k px in the
  deck, and a 1-device-px copy shift at boundary positions (frozen-scroll harness, earlier card). That violates
  the pixel-identity rule.

**Mechanisms that keep WebKit identical (each found by a Simulator count or pixel diff, OBSERVED).** This list
describes the V build (P-074). In the F build, items 1 (`.he-tf`), 2 (pre-arm on touchstart / wheel / keydown),
3 (rest hold of the copy shift) and 7 (`heHold`) are superseded by parking ("F rounds 4-8"); items 4, 5 and 6 stay.
1. **`.he-css` / `.he-tf`.** `.he-css` (set in `d()`, removed in `p()`) enables the exit animations. The copy's
   shift (`transform`) is a separate animation, present only with `.he-tf`. While `.hero-copy` carries a
   transform animation, even an inactive one, WebKit repaints the title's script accent about 1.4x as often (the
   accent gets its own composited layer). `.he-tf` is off:
   - at the top;
   - past the end, where the copy is at opacity 0;
   - at rest (item 3).
2. **Pre-arm.** A newly added scroll-driven animation is pending for one frame: WebKit drew the copy unshifted in
   the frame the class arrived (Simulator, OBSERVED). Partly backed by source: on the threaded-animations path
   WebKit's `KeyframeEffect::canBeAccelerated` requires `!animation->pending()` (WebKit main,
   `Source/WebCore/animation/KeyframeEffect.cpp`, read by review-hero-exit 2026-10-03); the one-frame length is
   ours. So `.he-tf` is armed before the scroll:
   - on `touchstart` (the drag starts only after the touch slop);
   - on `wheel` and `keydown` (disarmed after 600 ms if the page stays at the top).

   A scroll with none of these (programmatic, scrollbar drag, find-in-page, status-bar tap) is caught by `heSc`
   (idea: lead). The `scroll` event fires before that frame's rendering update (CONFIRMED: HTML Standard, "update
   the rendering": "run the scroll steps" comes before "run the animation frame callbacks" and the style/layout
   update), so the handler writes the inline shift for the current `scrollY` (the rest-hold formula, from
   `scrollY`, no layout read), adds `.he-tf` and arms the rest timer. The animation's pending frame then draws
   the correct shift. Without it, that first frame drew the copy shift one frame stale (residual R3, removed; see
   the hand-over table). `heSc` listens on `window` in the capture phase, which also sees inner scrollers' scroll
   events, so it acts only on the document's own (`event.target === document`).
3. **Rest hold (`heRest`).** 300 ms after the last scroll frame, with no finger down, the JS drops `.he-tf` and
   holds the copy's baseline shift as an inline `transform`. It uses the baseline formula: `translate(-50%,
   p * -8px)` on phones, `translateY(p * -10px)` on desktop. When a scroll re-adds the class, the animation
   overrides the inline value, and the inline value covers the animation's pending frame. Without the hold, the
   accent repaints 1.40x C at rest at y300; with it, 1.02x.
4. **`heWrap` / `.he-bob`.** On phones the cue's own entrance animates `--copy-in`, so its exit runs on its only
   child `.scroll-float`. The float's 2.2 s bob moves to a new span `.he-bob`, which the JS wraps around the
   float's two children (a flex column like the float, so the same layout). Two failed placements:
   - Bob and the scroll-driven exit on the same element: WebKit recalculated style on every frame at rest (241
     recalcs per 4 s at y0 vs C's 0).
   - Bob on the two children separately: the cue drew 1-2 levels off.

   The paused-scene rule `.scroll-float > *` still pauses the bob.
5. **Pointer events.** An IntersectionObserver whose top rootMargin is C's threshold `0.05 * track height + 0.95 *
   innerHeight` in px. It is re-armed on `resize`, because the toolbar changes `innerHeight`. Simulator y805-855:
   C, C2 and V all switch between y812 and y813.
6. **Blur.** Blur is its own animation from `blur(0.009px)`. Past the end it keeps `blur(18px)` (fill forwards),
   like the baseline. At rest at the top no blur animation is active, and the filter is the baseline's own rule:
   `blur(0px)` on the desktop copy and cue and on the phone cue (the baseline computes `blur(calc(... *
   var(--exit-scatter) * 18px))` there, 0 at the top), none on the phone copy. Commit 66d2abe forced `filter:
   none` there instead, which differed from the baseline and flipped none → blur on every scroll from the top
   (review round 2, fixed). One flip stays: the phone's `.scroll-float`, which carries the cue's blur in V and has
   no filter in the baseline, goes from none to `blur(0.009px)` at the top crossing. Its frame cost is in "Review
   round 2" below.
7. **Switch frame (`heHold`).** The exit animations are created when `.he-css` arrives in `d()`, so they are
   pending in that first frame and the base values show. In the baseline the base values follow the inline
   `--exit-opacity`, so `d()` writes it once for the current scroll position (`s()`), keeps it through the first
   frame, refreshes it in the next rAF and removes it one frame after every exit animation of the track reports
   `ready` (no longer pending; not after a fixed frame count, so a pending that lasts longer, e.g. on Safari
   26.0-26.3 or desktop, is covered too). A mid-hero switch then draws the exited hero, not the un-exited one:
   desktop Safari / iPad when `d()` fires 1.82 s after load while the page is already scrolled, a bfcache `pageshow`
   mid-hero, a restored scroll position. Without it, the review predicted a frame with the hero at full opacity and
   the cards in place (review round 2, item 1, from WebKit's `canBeAccelerated` / `pending()`); the Simulator did not
   reproduce that frame on 66d2abe (OBSERVED), so `heHold` is kept as a guard.

The `dE` registration stays (the scene pause and render deferral are its side effects). In CSS mode its callback
does only `heTf()`: a `scrollY` read, plus a class write when the state changes (`classList.contains` first; 66d2abe
called `add` on every scroll frame).

## Why that is faster

On WebKit the exit no longer needs the main thread per frame. The animations follow the scroll position on the
compositor (threaded scroll-driven animations, Safari 26.4+, CONFIRMED in the brief §0.3). The JS rect read, the
custom-property write and the hero-subtree restyle are gone.

Simulator counts (OBSERVED, Simulator ms never count, F-084). The build column says which V each row measured:
"ST-1" = the D-stage build (before the rest hold and `heSc`), "rest" = with the rest hold, before `heSc`,
"416e" = the build of commit 66d2abe (JS `416e4a2ed34f`, CSS `fc83846a8755`). The review-round-2 build (below) changes
only the switch frame in `d()`, the at-rest filter value, and two listener guards; it is not re-counted here.

| | build | C (st6-rb2) | V | note |
|---|---|---|---|---|
| Layout records, 12 px stepped scroll y368→884 (2 runs) | ST-1 | 241 / 247 | 175 / 196 | ST-1 card |
| RecalculateStyles, same | ST-1 | 199 / 203 | 163 / 146 | |
| full-hero repaints, scroll phase y356→884 | ST-1 | 21 frames, 20.2 Mpx | 0, 6.8 Mpx total (-66 %) | |
| stacked on cd-strip (cb45b05) | ST-1 | 12.7 Mpx | 10.3 Mpx | the rest is the #people reveal |
| compositing layers | ST-1 | 128 | 134 | orbit-cards b, d, e, hero-copy, scroll-cue, scroll-float |
| layer memory | ST-1 | 122 MB | 112 MB | stacked: 123 vs 112 |
| style recalcs at rest, timers cleared, 4 s (y0 / y300) | rest | 0 / 29-33 | 0 / 31-35 | |
| all other paints in the 5 s window at y884, arriving from y300, with a LayerTree census before the window (sim10, sim13, fin17, acc19) | rest, 416e | 15 / 9 / 10 / 13 (C2 10) | 35 / 30 / 30 / 29 | caused by the census (next row) |
| same, **no LayerTree census** (acc20; y0 / y300 / y884) | 416e | 23 / 31 / 13 (C2 18 / 29 / 17) | 14 / 38 / 13 | y884: V = C; was R4, removed |
| same, arriving from y600 (acc18) | 416e | 12 (C2 16) | 14 | no burst |

Accent census (the title's script accent, 5 s at rest, timers on): accent paints / frames with 2+ accent paints.
The paint total is bimodal in C itself (C y884: 302/70 in sim10 and 290/64 in acc19, 185-199/15 in the other runs),
so totals alone don't separate builds. The 2+ frames do: V with `.he-tf` left on at rest (before the rest hold) has
109-129 of them; every other run, C or V, has 9-26 (except C's own 64-70 above).

| run | build | C y0 / y300 / y884 | V y0 / y300 / y884 | C2 |
|---|---|---|---|---|
| sim6 | before rest hold | - / 264/20 / 283/21 | - / 387/129 / 399/127 | |
| sim7 | before rest hold | 244/15 / 242/16 / - | 351/118 / 343/112 / - | |
| sim10 | before rest hold | 247/15 / 241/17 / 302/70 | 245/15 / 338/110 / 299/70 | |
| sim13 | rest | 193/15 / 202/12 / 192/15 | 189/15 / 207/12 / 189/15 | |
| fin17 | 416e | 192/15 / 206/11 / 185/15 | 190/15 / 207/11 / 185/15 | |
| acc18 (y600 / y884 / y1000) | 416e | 213/13 / 199/15 / 208/13 | 187/17 / 232/10 / 186/16 | 189/15 / 227/12 / 187/16 |
| acc19 | 416e | 240/11 / 187/16 / 290/64 | 188/17 / 211/11 / 184/15 | 194/14 / 197/12 / 193/15 |
| acc20 (no census) | 416e | 183/15 / 217/10 / 187/16 | 196/26 / 221/9 / 187/16 | 203/13 / 191/12 / 195/15 |

R4 (an extra paint burst at y884) came from the census, not from V. With a census, V's extra paints at y884 were
single paints (1-2 each in the window) of two things (acc19, paint rects):
- the deck cards at their scattered, off-screen end positions (x -251/-246 and 514/562, which only V draws as their
  own composited layers);
- the next section's card grid below the viewport (C paints the same grid rects once it reaches y1000, acc18).

That window started 1.5 s after the jump, right after a `LayerTree.layersForNode` census. Run acc20 repeated the
same sequence (y0 → y300 → y884, C, C2 and V in one Simulator session) **without** the census: at y884 V has 13
other paints, C 13 and C2 17. The burst is gone, so it came from the census (F-149: a layer census can itself cause
paints; OBSERVED in our setup, here for V's extra composited layers). Arriving at y300 from y0, V has 38 other
paints vs C 31 and C2 29 (one session, not followed up; the accent counts at y300 are 221 vs 217 / 191).

The extra layers are the elements the compositor now animates. The phone gain is not measured (timing deferred).
The brief's earlier phone run of v2 (aw1-10e base, n = 3) had the y≈50 frame 48 → 35 ms.

## Before / after

No `fix.mjs ab` timing A/B (deferred by the user 2026-10-02). `results.json` holds the counts and pixel results.

### Pixel identity

**Chrome (gate: Chrome runs the baseline path).** Frozen-scroll parity, headless, arms C, C2 and V. Run par11:
mobile 430x932, phone 430x775, desktop 1440x900, 28 scroll positions each.
- Computed-style differences: 0 at every point.
- Pixel maxima per viewport equal the A/A maxima:

  | viewport | V max | A/A max |
  |---|---|---|
  | mobile | 254 | 255 |
  | phone | 21 | 21 |
  | desktop | 137 | 137 |

- At 8 points, V exceeded that point's single A/A sample; at many others the A/A exceeded V. Run par12 re-sampled
  7 of those positions (y50, 700, 767, 800, 839, 909, 982; all 3 viewports) with three A/A arms (C2, C3, C4 =
  st6-rb2, each vs C). The 8th, mobile y895 (V 7,037 px max 11 vs A/A 0 px), was missed there and is re-sampled in
  par15 (review round 2):
  - computed-style differences: 0 at every point;
  - max level: V never above the highest A/A arm at the same point (21 of 21); at 2 points (desktop y700 29,
    y982 1) V equals the highest A/A arm and exceeds a lower one;
  - pixel count: inside the A/A range at 20 of 21 points; desktop y50 V 73,970 px vs A/A 50,686-73,231 (1 % above,
    max 18 = A/A max 18). Its diff box reaches CSS y800, the A/A boxes end at y683; no PNGs were saved in par12,
    so the extra rows are not located. Chrome runs C's code path in V (gate false: no `.he-css`, no `.he-bob`,
    the CSS additions only match those). Run par13 re-shot that point with images (C, C2-C4, V):
    - The A/A arms fall into two whole-frame states: {C, C3, C4} and {C2}, 285k px apart (max 135, the orbit cards
      on both sides). V falls in C2's state (V vs C 284,904 px, C2 vs C 284,726 px).
    - Inside a state: C3 vs C 21.7k px max 4 (C4 vs C 37 px). V vs C2 22k px max 7, spread as speckle over one
      rotated photo card at the bottom right (CSS x 1080-1440, y 660-900), plus ~7k px max ≤ 7 on the copy and
      deck. No visible change (crop checked).
    - Open, OBSERVED (cause unknown): the 7-level speckle on that photo card exceeds the in-state A/A max of 4, with
      only one A/A sample of C2's state. On Chrome V computes the same styles as C (style diffs 0; no V rule
      matches), so only timing (load, larger CSS/JS files) can differ; it looks like resampling noise of a rotated
      image at a sub-pixel position. Re-shooting with more A/A arms would settle it.
    - Run par14 re-shot desktop y50 with six A/A arms (C, C2-C6, all st6-rb2) and V, PNGs saved (scratchpad
      `pairmat.mjs`, `clusters.mjs`):
      - The A/A arms again fall into two whole-frame states, {C, C2, C5} and {C3, C4, C6}, ~285k px apart
        (max 135). V falls in {C3, C4, C6}.
      - V vs each arm of its state: 4,927 / 4,907 / 4,966 px, max 3. All of it lies in one box, the hero copy
        ([440,200]-[1000,720] CSS px): faint outlines of the copy's text, countdown boxes and buttons. Only at 20x
        amplification is anything visible. Plus 34 px max 1 below the buttons.
      - In-state A/A: {C3, C4, C6} 35-103 px, max 2-3. {C, C2, C5} 4,089-7,303 px, max 3-7, in the same hero-copy
        box with the same outline pattern (C2 vs C 7,292 px, max 7; crops `par14-crop-V-C3.png`,
        `par14-crop-C2-C.png`, gitignored `out/hext/`).
      - par13's photo-card speckle does not recur: V vs its state has 0 px at CSS x 1080-1440, y 660-900.
      - So V's diff at desktop y50 is the kind of diff A/A arms in one state show among themselves, at a lower level
        than the highest such A/A pair (V max 3 vs 7; V 4.9k px vs 7.3k px). C1 is closed: within A/A (OBSERVED,
        cause of the copy-outline variation unknown; it occurs between identical builds).
  - So the par11 excesses fall inside the A/A spread once it has enough samples: Chrome parity is 0 within A/A
    by max level at 21 of 21 points. By pixel count it is within A/A at 20 of 21 in par12; the 21st point,
    desktop y50, is within the six-arm A/A spread in par14.

**WebKit (iOS 26.5 Simulator, frozen frames, timers cleared, document-timeline animations paused).** C and C2 are
both st6-rb2 (A/A); V is this build; VT is V with a finger down (touchstart) during the shot.

| position | V vs C | C2 vs C (A/A) | verdict |
|---|---|---|---|
| y0 | 2498 px, max 112 (cue) | 2494 px, max 106 | within A/A (V vs C2: 1969 px, max 6) |
| y171, y466, y570 (deck, copy, cue) | 0 px, except countdown digits | countdown digits | identical |
| y285 | copy ~1.1k px at max 1, plus ~150 px of max-1 bits; same at rest and finger down | 0 there | **residual R1** |
| y114-228 (deck edge cards) | ~200 px per side, max 11, in 1 of 3 sessions | C's own state differs between sessions | **residual R2** |

- **Countdown digits.** The countdown digits differ by clock time (shots taken seconds apart), in every arm pair
  including the A/A.
- **Hand-over frames (runs frz14, frz15; scratchpad `frzshot.mjs`).**
  - **Method.** The main thread is blocked from the next frame's rAF, so the screen keeps the frame under test
    while `simctl io screenshot` takes two shots 1 s apart. Every pair was still: 0 px.
  - **Setup.** Timers cleared, document-timeline animations (the bob) paused. The drop frame is triggered by a
    MutationObserver on the `.he-tf` removal; the re-add frame is the first frame after `scrollTo` 300 → 306.
  - "0 px" below means 0 outside the clock and countdown digits, which differ by load time in every pair,
    including C2 vs C.

  | frame | V vs C | note |
  |---|---|---|
  | drop (first frame after the 300 ms rest: class off, inline hold on) | 0 px vs C's frame with the same y300 values (+1 px max 1); same vs C2 | C's own rest state at y300 differs by R1, see Options |
  | re-add, armed (touchstart, then the first scrolled frame) | 0 px vs C one frame later (C's writer is one rAF late); vs C2: ~120 px max 1, the same bits as the C2 vs C A/A | C's own first frame is the stale y300 picture: ~510k px vs its next frame, cards up to 212 levels |
  | settled at y306 | 0 px | |
  | re-add, unarmed (no touch / wheel / key), before `heSc` | one frame: cards and opacity at y306, copy shift still at y300 (0.056 px); 51k px at max 26 levels on the copy text vs C one frame later | was residual R3; C's own first frame is stale on everything (~510k px) |
  | re-add, unarmed, with `heSc` (run sc16), from rest at y300 → 306 and from y0 → 6 | 0 px vs C one frame later, and vs C2 | R3 removed. Cost of that frame: S2 L3 P2 vs C's own scroll frame S2 L3 P3 |

  **Final build (run fin17, served JS `416e4a2ed34f`, CSS `fc83846a8755`, arms C and V):** drop, armed re-add,
  unarmed re-add and the frame after each: 0 px vs C one frame later (drop: vs C's stale first post-scroll frame,
  +1 px max 1), every still pair 0 px. Outside that, the only differences are the countdown digits, the status-bar
  clock and, new in this session, the title's rotating word ("あなた" in C's shots, between words in V's): ~41k px
  max 138 in every V vs C pair, and 0 between V's own frames. The rotator is st6-rb2's timer-driven word cycle,
  stopped wherever the timers were cleared, the same class as the countdown digits. In frz15 both arms stopped in
  the same phase (between words), and the title region was 0 px in V vs C (and C2 vs C) at the same frames: the
  word differs by the frozen timer phase, not by V.

### Hand-over cost (Simulator Timeline, run sim13, timers cleared)

Sequence: scroll 0 → 300, 1.2 s rest, touchstart, scroll 306, touchend. Per-frame Timeline records:

| frame | V | neighbours |
|---|---|---|
| drop (`.he-tf` off, ~300 ms after the scroll) | S2 L0 P0 | S1 L0 P0 |
| re-add (touchstart) | S2 L0 P0 | S1 L0 P0 |

Each hand-over costs +1 style recalc, 0 layout, 0 paint.
- **Copy transform values (getComputedStyle):**
  - across the drop: animation -2.807068 px, inline hold -2.807069 px, C -2.807069 px;
  - first frame of the next (armed) scroll: -2.86321 px, exact.
- **Logger caveat.** The logger's per-rAF `getComputedStyle` forces one recalc per frame in V while animations are
  live. Without the logger, the rest recalcs are equal to C (table above).

### Unarmed start (no touch, wheel or key; Simulator prearm.mjs, frame by frame)

| case | C | V before `heSc` | V (final, with `heSc`; run sc16 frozen frames) |
|---|---|---|---|
| from the top, first scrolled frame | whole frame one frame late (shift 0 at 122 ms, -2.807 at 177 ms) | copy shift one frame late (0 at 138 ms, -2.807 at 200 ms): **matches C** | first frame exact: 0 px vs C one frame later |
| from rest at y300 → 306 | whole frame one frame stale | copy shift one frame stale (0.056 px), cards/opacity current: **matches C** in timing, 51k px max 26 in pixels | first frame exact: 0 px vs C one frame later |
| armed (touchstart) | whole frame one frame late | first frame exact (y6 -0.056142 px, opacity 0.992982) | same |

### Review round 2 (review-hero-exit NEEDS-FIX on 66d2abe; build JS `301ec740291b`, CSS `55ba45f138c9`)

Code changes: `heHold` (mechanism 7), the at-rest filter back to the baseline's rules (mechanism 6), `heTf` writes a
class only when its state changes, `heSc` checks `event.target` and arms the rest timer (mechanism 2). Checks on this
build (Simulator iOS 26.5 functional sessions unless named; scratchpad `rev2.mjs`, `tb.mjs`, `rl.mjs`; frozen frames as
above, title word synced to the same drawn word in every arm before timers are cleared):

| item | check (run) | result |
|---|---|---|
| 1 switch frame mid-hero | restore at rest y300 that re-creates the animations: drop `he-css`, two frames, then `pageshow` (persisted) → `p()` + `d()`; freeze the frame after `d()` (r2h, arms C, V, V0 = 66d2abe) | V vs C: countdown digits only (V holds `--exit-opacity` 0.649 inline in that frame, as designed). **V0 vs C is also clean** (digits, clock): on the Simulator the new animations' pending frame did not show base values here, so the probe does not reproduce the flash the review predicted; `heHold` stays as a guard (it is what the review's source reading, `canBeAccelerated` / `pending()`, calls for). OBSERVED |
| 1 (other probes) | synthetic `pageshow` without dropping the class (r2b); reload while scrolled (r2f, r2g) | r2b: V = V0 = C (no animation is re-created when `p()` and `d()` run in one task). Reload: `d()` had already switched (`he-css` on 0.9 s after the reload, while Safari was still restoring the scroll, y121) before a watcher could attach; a bootstrap-script watcher did not fire. Not captured |
| 2 collapsed toolbar | WDA collapse stroke (innerHeight 775 → 815), then y150 / 230 / 300 / 500 / 700 / 840 (r2e) | V's copy opacity = C's = `1 - p` with innerHeight 815 at all 6 points (difference ≤ 1e-6) |
| 3 filter at rest | top crossing y0 → 6 → 12, Timeline records per frame, timers cleared (r2c) | the one remaining flip (phone `.scroll-float`, none → `blur(0.009px)`) costs one Layout record: V's first frame from the top S1 L2 P55 vs C's per-step frame S1 L1 P54 (+1 Layout, WebKit-only, an X1-class cost); V's later steps P0-1, C repaints P54 on every step. Left to the phone block (P-074 touchstart and y≈50 rows) |
| 4 hand-over frames, same word | drop, armed and unarmed re-add, settle at y300/306 (r2a) | drop and settle: 0 px outside clock and digits. Re-add: V's frozen frame = C's own settled y306 frame (0 px outside the digits); C's frozen frame there is still its y300 frame (= C's drop frame, ±1 level), as in frz14: C draws the scroll one update later |
| 4 (y0) | settled y0, C, C2, V (r2d) | V vs C = C2 vs C: the title accent phase and the digits only. r2b's extra card-band diff at y0 (V and V0 both vs C, max 45) was C's own session state: none in r2d |
| 5 accent census | acc20 (above) | R4 removed |
| 6 jump back into the hero | from rest at y3000, `scrollTo(300)`: first and second frame (r2b) | V vs C: browser chrome only (clock, back button). V0 (66d2abe) vs C, second frame: 460k px. Why V0 jumped and V does not is unexplained: no change in the delta targets it (candidates: `heTf` now writes the class only on a state change, `heSc` ignores non-document scrolls) |
| Chrome parity, new build | par15: mobile, phone, desktop × y50 / 895 / 909; C, C2-C4, V | computed-style diffs 0 everywhere. Max level within the A/A arms at 8 of 9 points. Mobile y909: V 7,110 px max 53, A/A there ≤ 919 px max 1; the same 53-level whole-frame pattern (same box) is C2 vs C at y895, i.e. the two Chrome raster states seen in par13/par14; Chrome runs C's code path in V (gate false). The y895 re-sample owed from par11: V 1,947 px max 1, within (C2 6,142 px max 53) |
| functional | `fix.mjs check --viewport both` (headless Chrome) | ok: morph reached, 0 errors, 0 4xx; screenshot diff 0-0.12 %. The +174 elements are st6-rb2's (start-selling morph, st5 images), not this topic |

Still untested: desktop Safari and iPad (viewport > 600 px: the Simulator is a phone, so the desktop CSS rules and the
desktop `heRest` formula have computed-value parity only); Safari 26.0-26.3 (gate slice above).

### Review round 3 (delta re-review ACCEPT-WITH-NOTES on e36423f, P-074 read NEEDS-FIX; build JS `d48d224adcd4`, CSS `55ba45f138c9`)

Code change (the only one): `heHold` drops the inline `--exit-opacity` one frame after every hero-exit animation
of the track reports `ready`, instead of a fixed frame later (mechanism 7). Wording: mechanism 7 (flash predicted,
not reproduced, OBSERVED), item 3 (+1 Layout at the top crossing), item 6 (V0's jump unexplained).

| check | how | result |
|---|---|---|
| restore switch frame | r2h's probe again (r2i, arms C, V = `d48d224adcd4`, V1 = `301ec740291b`), case pgsR and settle | V vs V1: countdown digits only (rows 1300-1400), also at settle (plus ±1-level bits): the ready-based drop draws the same frames. The var was already gone in the probe's second frame in both V builds, so on this Simulator `ready` resolves within the switch frame (OBSERVED). V vs C and V1 vs C: the same pattern in both cases, status-bar clock plus a band at y≈800-900 image px (max 91 levels), at settle too |
| the y≈800-900 band | r2j: the same probe with C, C2 (same st6-rb2 snapshot, own server) and V = `d48d224adcd4` in one session | the band is gone: V vs C and V vs C2 at pgsR show only the clock, the countdown digits and 1 px; C vs C2 shows clock and digits. At settle V vs C adds ±1-level bits (max 1, rows 700-1250, as in r2h). The band did not come back with the same V build, so it was the r2i C arm's state, not a V difference; C-vs-C did not reproduce it either (it is not shown directly, only absent on a re-run) |
| functional | `fix.mjs check --viewport both` | ok: morph reached, 0 errors, 0 4xx, screenshot diff ≤ 0.54 % (headless) |
| Chrome parity | not re-run: Chrome has no `GestureEvent`, `heCss` is false, `heHold` never runs | unchanged from par15 |
| wide branch (de-breakpoints, Chrome with a `GestureEvent` stub, run on the round-2 build `301ec740291b`, not on `d48d224adcd4`; `heHold` only defers the drop) | frozen frames at 6 stops, 932x430 DPR 3, 1440, 1440 reduced motion; C2 = A/A | V vs C 0 px beyond A/A everywhere; `he-css` on at every stop in V; 0 errors. Blink only, scripted scroll |
| WebKit at width 980 (de-breakpoints, fw-sim, test-only viewport meta `width=980` in both arms, `d48d224adcd4`; arms C, V, C2; hard freeze, instant scrollTo, 1.6 s, 1290x2796) | gate true (`GestureEvent`, width > 600, the 860 combo); V has `.he-css` and `he-bob` at every y, 14 scroll-timeline animations, C 0; hero-copy computed opacity and transform identical at every y | **not pixel-identical**: V vs C beyond C vs C2 at y150 (0.653 % vs 0.267 %), y300, y500, y800 (0.200 vs 0.044); y0 and y1400 within A/A. All of it in the tilted orbit cards (left and right columns), mostly 19-50 levels per cell, one cell 121 (y800). Center column identical apart from the countdown digits. Residual R5 |

P-074 scorer (`p074/score074.mjs`, sha256 `1d1fc26908f1`), fixes from the review and the ops read:
- V's rest hand-over frame = the heRest TimerFire record plus the next frame unit (the drop lands there), not the
  unit that holds the timer.
- A missing `--fn` line fails loudly.
- The writer and heRest tests match the page script name (`nodes/2.DyWL8TcE.js`).
- The logger-rAF-first assumption is stated in the header.
- Void runs are dropped before pairing (valid run i with valid run i, no fallback to run 1).
- An arm with fewer than 2 valid runs prints "not enough".
- (a) is reported per arm (C positive control, V claim), never combined.
- (b) is reported per kind (touchstart, rest) as in / OUT / "no data for <kind>".
- heRest fires pair with the nearest rest mark (±800 ms); unpaired fires and the past-the-end fire (rest2, y > 780)
  are printed, not scored.
- C's rest anchor is its last moving frame at or before the rest mark (the +400 ms margin is gone).
Smoke test on P-071's phone Timeline files (different build, lines adjusted): C share 0.634, two-run arms give
in / in, a single run gives "not enough", rest with no heRest line gives "no data for rest".

## Options (residuals beyond A/A, for the user)

| id | where | pixels / levels | how long it shows | cause | options |
|---|---|---|---|---|---|
| R1 | y285 and y300 (y57, 114, 171, 228, 286, 342, 399, 466, 570: 0 px): copy text in two blocks [450,720 to 930,780] and [450,1080 to 870,1140] device px | ~1.2k px, max 1 level (+~150 px max 1) | while the page rests at such a position | **C shows the same difference between two of its own frames**: C at rest at y300 vs C's first frame after a scroll 300 → 306 (which still draws the y300 values, its writer is one rAF late) differ by exactly these pixels (630 + 537 px, max 1; same in C2). V at rest at y300 equals that C frame: 0 px outside the clock digits (frz14). So V draws one of C's own two raster states for the same values. Cause of C's two states UNRESOLVED (OBSERVED) | (a) accept as within C's own variation; (b) none found that makes V pick C's rest state |
| R2 | y114-228, the screen-edge deck cards (x 0-90 and 1200-1290, y ~2100-2190 device px) | ~200 px per side, max 11 | while resting in y114-228, in sessions where C clips | fact: in 1 of 3 Simulator sessions C (and C2) drew the card-corner shadow clipped hard to an axis-aligned box, and V drew it smooth. In the other 2 sessions C was smooth and V vs C = 0 | (a) accept: V is identical to C's smooth state; (b) reproduce C's clip in V (not attempted: it is C's own session-dependent state) |
| R5 | WebKit at width 980 (desktop layout, de-breakpoints), y150-800: the tilted orbit cards in the left and right columns | 0.2-0.65 % of the frame beyond A/A, mostly 19-50 levels, one cell 121 | while resting at y150-800 | OBSERVED, cause unknown: looks like a sub-pixel position or resampling difference of the cards (CSS view-timeline progress vs JS progress), not a layout or opacity change; nothing is missing or misplaced to the eye. Decisive check: the cards' computed translate, scale and filter in V vs C at y150 and y800 | to be decided after that check: (a) match the cards' values; (b) leave the cards on the JS path at this width |
| ~~R3~~ | removed by `heSc`: the unarmed first frame (was 51k px, max 26, one frame) | 0 px vs C one frame later (sc16) | | | |
| R0 | y0 cue | 2498 px max 112 vs C | at the top | within A/A (C2 vs C 2494 px max 106; bimodal cue state across sessions) | none needed |
| ~~R4~~ | removed: the extra paint burst at y884 came from the LayerTree census (acc20 without it: V 13 = C 13, C2 17) | | | | |
| ~~C1~~ | closed: desktop y50 on Chrome is within the six-arm A/A spread (par14: V vs same state max 3, 4.9k px; same-state A/A up to max 7, 7.3k px, same hero-copy box) | | | | |

## Cards (protocol v2)

**ST-1 (attribution split, Simulator, n = 2; the lead accepted it 2026-10-03 01:17Z as partly LOCATED).**
- H2a (an extra style/layout at the 0.72 flip): not supported. V has no more records than C at the flip, and about
  25 % fewer Layout / RecalculateStyles overall.
- H2c (≥3 more Paint records in the flip pair): not supported. 18 Paint records in V vs 23 in C.
- H2b (Composite): open. It needs the phone Timeline slot; Simulator compositing cost does not transfer.

**Build card (V).** The gate, the mechanisms, the counts and the pixels are above.
- Measurement code changed: none.
- a11y: no DOM change except the `.he-bob` span wrapped around the cue's label and arrow. Text nodes keep their
  references and their order; the span has no role.
- Memory and layers: see the counts table.

**Phone ticket P-074 (run 2026-10-03 09:39-09:55Z, result below; a Timeline attribution block, not a gain block).**
- Question (one): on the iPhone, under a WDA finger drag (driver G), does V stop running the per-frame JS writer on
  moving hero frames while C runs it, with hand-over frames that cost no more than C's same-phase frames?
- Builds (immutable snapshot copies): V `out/snapshots/hext-V-<js hash>` (JS and CSS hashes: "Review round 3"
  below), C = st6-rb2 `out/snapshots/st6rb2-C-7bf7c4657d21` (JS `7bf7c4657d21`, CSS `f523598b2a24`).
- Driver G, gesture `gestures/hero-pass-v1.json` (file sha256 `e3f31872b82f`): two slow drags up through the hero
  with 1 s rests, two drags back down. Ports: one `serve.mjs --port auto` per arm (5200-5999, plain http twin per
  I-003), the actual ports in the block log; never 5173.
- Order: one uncounted warm-up per arm port, a Timeline-OFF sentinel, then C V V C with Timeline on, end sentinel;
  park Safari; each run in its own `--no-timing` hold; no user steps.
- Start band (user rule T-029 #30, `memory/phone-checks-start-warm.md`): every run starts at 38-40 °C with one start
  method for all runs: under 38 °C pre-warm on the plain baseline page, over 40 °C `wait.mjs phone-temp --below 40`;
  the temperature at which the band was met is logged per run (F-169). Low Power Mode runs are dropped and re-run.
  Expected about 25 min (8 runs at about 1.5 min, plus cooling up to 10 min).
- Scorer `p074/score074.mjs` (sha256 in "Review round 3"), `--fn C:s=4391 --fn V:s=4493,heRest=4446`, band 1..780.
  Every counted run is passed in block order; void runs are reported and dropped, valid runs pair in order.
  (a) writer share per run (C 0.3..1.0, V 0..0.05), reported per arm: in / out / split / not enough. (b) V's
  touchstart and rest hand-over frames vs C's, per kind: in / OUT / no data. (c) the y≈50 frame, descriptive.
- Confidence before data: P(V in for (a)) 0.85, P(C in for (a)) 0.85, P((b) in for both kinds) 0.5 (the +1 Layout of
  the top-crossing flip, item 3, may put touchstart 1 out).
- Decisions:
  - (a) C in, V in, (b) in for both kinds: the mechanism holds on the phone under G; V stage goes on with the user's
    residual decisions (R1, R2); no further phone block for this question.
  - (a) V out (V runs the writer on moving frames): the CSS path is not active on the phone (gate or switch); stop,
    find the failing piece from the scorer's per-frame lines, back to F, new build and new ticket.
  - (a) C out (the positive control does not see the writer): the measure failed, not the fix; no claim. Check the
    scorer on C's data (script name, line, logger), re-read by ops, re-score the same data; new runs only if that
    still fails.
  - (a) split in an arm: no claim for that arm; at most one second block with the same ticket (sequential rule); a
    second split goes to the lead as inconclusive.
  - (a) not enough valid runs in an arm: treated as a void block.
  - (b) OUT: name the rows. Only touchstart 1 (the top crossing): the known +1 Layout flip, reported as a residual
    for the user decision, not a mechanism failure. A rest row OUT: before any reading, report the heRest TimerFire's
    own S/L/P next to the next unit's for that row, from the same Timeline file (a labeled post-hoc diagnostic; the
    registered scorer is unchanged). The registered scorer's verdict stands for every row; the split changes no
    verdict. Making the split count would be a new prediction for a later block, registered before data. Any other
    OUT row: V's hand-over costs more than C's; back to F.
  - (b) no data for a kind: to the lead, no mechanism verdict on that kind; check marks and the heRest line on the
    same data before any re-run.
  - Block void (a failed sentinel, a second void at one position, Low Power Mode): no claim; cool, re-run the block
    once; a second void goes to the lead.
- Ranges, void rules and decisions are registered as P-074 in `fixes/PREDICTIONS.md` (by mgmt-ops) before any data.

**P-074 result (2026-10-03; runner iphone-runner; scored with the registered scorer `1d1fc26908f1`; condition: 30 ms
timer grid).**
- Condition (iphone-runner, from the Timelines; the lead's decision): every run had WebKit's 30 ms DOM timer
  alignment on, the same in both arms. The cause: the phone's real thermal state was Serious (not induced; checked
  with xctrace; Xcode's device condition was off; lead correction, 2026-10-03).
  - The setInterval(1000) gap median was 1020 ms, against 1005 ms in P-071.
  - One-shot timer lateness p90 was 22-26 ms, against about 4 ms.
  - rAF stayed at 59 Hz, the frame median dt at 17 ms, and the sentinels passed.
  - Source: WebKit `Page::updateDOMTimerAlignmentInterval` sets 30 ms only under Low Power Mode or thermal
    mitigation, and LPM was off.
  - The result is scored exactly as registered and labeled with this condition. It counts as milestone-2 data.
    The lead first asked for P-074b, a normal-condition repeat on the same ticket and scorer, then cancelled it:
    the next block runs on the F build under a new prediction (P-08x) in the normal condition ("F round 4").
  - Timer-driven pieces (`heRest`'s timer, the 600 ms `heT`) ran on that grid, so the rest rows' timing is
    condition-specific.
- Validity: 4 counted runs (C1, V1, V2, C2), no void runs. Sentinels passed: open 60 / 58.8, end 60.2 / 58.4.
  Low Power Mode off (median dt 17 ms). One start method, pre-warm, for every run. Band met at C1 38.59, V1 38.09,
  V2 38.5, C2 38.89 °C.
- Deviations (from iphone-runner):
  - the block ran in 2 holds, with a 12-minute gap after C1 and 4 pre-warm cycles before V1 (same method, in band);
  - the V warm-up was re-run in its own hold (the first try exited 1 and was not counted).
- (a) writer share on moving band frames (562-584 per run, 0 uncovered): C1 0.814, C2 0.794, V1 0, V2 0. **C in
  (positive control), V in (claim).** Per moving frame: C S 2.4 L 1.7 P 2.7, painting about 181-189k px; V S 1.7
  L 1.2 P 2.6, painting about 62-67k px.
- (b) touchstart: **OUT**.

  | pair | touchstart 1 (y0) | touchstart 2 (y548) | touchstart 4 (y547) |
  |---|---|---|---|
  | V1 / C1 | V S3 L1 P1, C S2 L2 P3: in | V S2 L0 P0, C S0 L0 P0: OUT | V S3 L1 P1, C S1 L1 P1: OUT |
  | V2 / C2 | V S3 L2 P3, C S1 L1 P1: OUT | V S2 L0 P0, C S0 L0 P0: OUT | V S2 L1 P1, C S2 L1 P1: in |

- (b) rest: **no data for rest**.
- (c) the y≈50 frame: S3 L2 P1 in every run (C2 S4). The writer runs there in C2 only.
- Decisions by the ticket:
  - touchstart OUT on rows other than touchstart 1: V's hand-over costs more than C's, so back to F.
  - No data for rest: to the lead, with no mechanism verdict on rest.
- POST-HOC DIAGNOSTIC (labeled; it changes no verdict, and making it count would need a new registered prediction):
  - Why rest had no data: on the phone Timeline, TimerFire is nested inside RenderingFrame. In V1, 4 heRest fires
    sit under RenderingFrame > TimerFire at line 4446. The registered scorer looks only for top-level TimerFire.
    The marks and the heRest line are right.
  - A copy of the scorer that searches at any depth (scratch only, not registered) finds the heRest timer itself
    at S0 L0 P0 every time. Comparing its next unit with C's frame:
    - V1: rest1 in, rest3 in, rest4 in.
    - V2: rest1 in, rest3 OUT (V S4 L2 P2 vs C S1 L0 P0), rest4 in.
    - The past-the-end fire (y848-856) is not scored.
  - V's rest next unit paints about 127-128k px; C's same-phase frame paints about 2k px. The paint count is the
    same, the area is far larger. The registered S/L/P counts do not see area.
  - The touchstart OUT rows are +2 RecalculateStyles with no extra Layout or Paint. The exception is V2's top
    crossing (+1 L, +2 P), where V1 was in. This fits `heTS` → `heOn` adding `.he-tf` at touchstart (JS
    4458-4462). OBSERVED, not attributed record by record.
- Data: iphone-runner's `out/p074/` (gesture and Timeline files, `runs.jsonl`). Scores: this worktree's
  `out/hext/p074/score-p074.json` (registered) and `diag-nested.json` (diagnostic). Both are gitignored.
  `results.json` `phone.P074` holds the numbers.
- Servers (written for P-074b, now cancelled; the same command serves the F build's snapshot): the immutable snapshots stay in this worktree's `out/snapshots/` (served JS
  `hext-V-d48d224adcd4` and `st6rb2-C-7bf7c4657d21`, re-checked by sha256). Restart them identically, one per arm:
  `node tools/serve.mjs --root site-pretty --overlay out/snapshots/<snapshot> --port 0 --https --vendors=local
  --latency 150 --no-cache --state out/hext/p074/serve-<arm>.json`. The ports are new on every start (the plain
  http twin always takes a free port), so the block log records them.

**Scenarios not run:**
- (idle after scroll is covered: the rest hold, Simulator counts and frozen frames above);
- reload while scrolled: tried (r2f, r2g), not captured, `d()` switches about 0.9 s after the reload, before a watcher can attach (item 1 above);
- early input during the desktop entrance: the JS path runs until `d()`, by design;
- scroll up: covered by the parity positions, not by a motion run;
- toolbar resize: values checked with the toolbar collapsed (r2e, equal to C), the resize moment itself not captured;
- rubber band;
- desktop Safari pixels: the Simulator is a phone, and Chrome takes the baseline path, so the desktop CSS rules
  are verified only by computed values in earlier parity, not by WebKit pixels;
- reduced motion: the CSS block applies under `prefers-reduced-motion: no-preference` only, and `heRest` returns
  under reduce.

## Risks, conflicts, follow-ups

- **cd-strip.** Its candidate brings back per-cell layers and 1-3 Paints per rolling digit. Under this fade, its
  current strip differs by 2-3 levels on glyph edges, and the candidate is identical (fix-cd-strip). Re-count the
  stack when its new patch lands.
- **HEflip / title accent.** While `.he-tf` is on (scrolling inside the range) the accent repaints like the
  transform-animated layer does. At rest the hold removes that. Coupling posted as F-150.
- **Nav morph F3.** No textual overlap: the nav `_` keeps its own rect read and the 0.72 flip.
- **Heavy layouts at rest at y300.** Present in both arms, not this topic (posted as F-159).
- **Pitfall for others.** `lock.mjs wait --until released-by:X` is a state check (F-161).
