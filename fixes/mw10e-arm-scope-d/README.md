# Fix: mw10e-arm-scope-d (F3 + window touch listeners while the morph is active)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (behaviour checked in Chrome; no timing)
**Stage:** F (round 2 for review-f3-arm-scope: B2 fix, B1 open)
**Device class / gate:** touch-only (G/F)
**Driver(s) behind the claims:** Chrome CDP touch (behaviour), Simulator WDA-sim G (counts)
**Topic:** f3-arm-scope (`fixes/mw10e-arm-scope-c/README.md` is the build P-036 measured)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only. The changes are in the morph effect of the nav
component (pretty lines ~13286-13381 of the overlay): `E()`, `M()`, `P()`, `I()`, plus the new `__tw`, `__twOn` and `__twOff`.
**Base:** F3 `mw10e-arm-scope-c` (JS c6d3590576a7) on `aw1-10e` (JS 3e2f599a1632, CSS c6aad94b455f). Neither
is on `main`: the base builds are on the working branch `worktree-agent-a277ea00c8773c1ea`, and `patch.diff` here is
the diff from the -c overlay. Build: JS **999c4497f37e**. Immutable copy:
`out/snapshots/mw10e-arm-scope-d-999c4497f37e` (served before the aw1-10e copy).

## Why (review-f3-arm-scope B2)

F3 puts the touch listeners on `#platform` and the nav, not the window. That is fine before the morph starts. Once it
runs, two things leave parts of the viewport without a listener:
- `#platform` turns `pointer-events: none` when m > 0.5225 (`S()`: `--morph-fade` < 0.05).
- The nav does not cover the lower part of the viewport mid-tween, nor its 12 px side margins at m = 1.

A touch that starts in one of these places reaches no morph listener. Its touchmoves are not prevented, so the page
scrolls against the pin, and a down-swipe there does not reverse the morph.

## What changed

- While the morph is active, `touchstart` and `touchmove` are also on the window (capture, the touchmove one
  `{passive: false}`), as in the original.
  - Armed by `E()` on any morph target.
  - Disarmed by `I()` once `C()` is false (the end of the spring, or the reduced-motion path), and by `P()` on teardown.
- Before the morph starts, only `#platform` and the nav carry touch listeners, unchanged from F3. P-036's zone strokes
  are pre-morph, so the measured part of the card is the same code.
- `M()` now runs once per event: the first call (the window's capture) marks the event, and a second call (from the
  element) returns. A second run was already harmless (n = 0, so `XM(0)` is null and only the redundant
  preventDefault repeats).
- The desktop wheel listener is unchanged: on the window, armed at load (see Risks).

## Behaviour check: Chrome, B2 cases (n = 1 per case per build; OBSERVED, a single run each, no spread)

Probe: `fixes/morph-webkit/touch-gap-check.mjs`, shared lane. Setup: 430x932 DPR 1, CDP touch, scrolled to the end
(y 5345), an up-swipe on #platform at (215, 600) starts the morph, then a down-swipe of 12 moves x 20 px. Prevented and
cancelable counts come from a passive listener in the window's bubble phase. Results:
`out/touch-gap-check/touch-gap-2026-10-03T02-10-38-110Z.json` and `…02-13-58-640Z.json`.

| case | under the finger | C aw1-10e | V F3 (-c) | D (this) |
|---|---|---|---|---|
| edge: m = 1, down-swipe from (6, 400) | page `main` (margin) | reversed, 12/12 prevented, y fixed | **not reversed**, 0/11 prevented (1 cancelable), **y 5345 → 5325 → 5345** | reversed, 12/12 prevented, y fixed |
| mid-tween: down-swipe from (215, 880), m0 0.525, nav bottom 515 | page `main` (gap below the nav) | (C: m0 0.478, still on #platform) reversed, 12/12 | **not reversed (m → 1)**, 0/8 prevented, **y excursion 20 px** | reversed, 12/12 prevented, y fixed |
| mid-tween: down-swipe from (215, 700), m0 0.48-0.52 | #platform | reversed, 12/12 | reversed, 12/12 | reversed, 12/12 |
| late tween: (215, 700), m0 0.98-1 | nav | reversed, 12/12 | reversed, 12/12 | reversed, 12/12 |

D matches C in every case. V fails in both gap cases, as the reviewer predicted.

## B1 (end-pin collapse): what is known

- **P-036 records** (desk check, no device time; OBSERVED, in our setup, cause unknown):
  - Every pin stroke was fully prevented in both arms (47/47 touchmoves per stroke in V1, V2, C2 and C4). The B1
    strokes start at (215, 600) on the nav, so B1 is not the B2 gap.
  - In V1 the collapse starts ~600 ms after a pin stroke's touchend. dt climbs over ~1 s (42, 100, 117, 123, 162, 232,
    245 ms), then stays at ~200 ms through every later stroke and the idle, ~50 s.
  - V2 is collapsed from its arrival at the pin.
  - The collapse shows in every capped V run (2/2) and in none of the capped C records (0/5: C2, C4, wC, attempt-1's
    wC and the voided C1 hold 52-60 fps). n is small: 2 V records against 5 C records, one device, one evening.
  - The RUNLOG note fits a page that keeps working after the run: the unparked V1 page heated the phone 41.2 → 42.6 °C in 6 min.
- **Simulator** (`fixes/morph-webkit/pinhold-sim.mjs`, WDA-sim G driver, `gestures/pin-hold-v1.json`; counts only, F-084):
  - Both arms reach the capped state: y 5213, m = 1, `is-morphing is-expanded`, #platform pointer-events none, 24
    passes ended "max", 12 pin strokes, 46-51/46-51 prevented.
  - **Neither arm collapses:** 55-60 fps at the pin in both.
  - At the pin over 4 s of idle, the page-side counts are the same in both arms:
    - one rAF loop re-arming each frame, `GE` spring at JS 4039 (V 140, C 139 re-arms);
    - no setTimeout, scrollTo or scroll events;
    - countdown `.face` style writes (V 301, C 297).
  - Timeline record counts are the same within 1 % (RecalculateStyles 585 vs 588, Layout 231 vs 233, Paint 940 vs 946, FireAnimationFrame 380 vs 380).
  - So the Simulator shows **no JS loop specific to V**. Record: `out/pinhold-sim/pinhold-2026-10-03T01-55-47-432Z.json`.
- **Chrome** (pin case of `touch-gap-check.mjs`: 10 more pushes into the pin, then 3 s idle; Performance.getMetrics):
  - C, V and D are the same: 360-361 rAF frames, LayoutCount 0, RecalcStyleCount 501-503, ScriptDuration 0.018-0.023 s.
  - All 132 pushes were prevented in each build.
- **Status: UNRESOLVED.** Neither the Simulator nor Chrome reproduces it. The page-side JS and style/layout counts at
  the pin do not differ between the arms. What remains is device-side work that our counts cannot see, for example
  WebKit's handling of element-target touch listeners while the morph is active, compositing, or the UI process.
  - The decisive check is the phone ticket: G pin-hold-v2 on C, V and D, with Timeline on the collapsed state and on
    the frames where D arms and disarms its window listeners.
  - D changes the listener state at the pin: the window carries the touch listeners again, as in C, while the element
    ones stay. If the cause is the element-only listener set, D may fix B1 as well. That is untested.
  - If D still collapses, the next variant removes the element listeners while the window ones are armed, so the
    listener set during the morph is exactly C's.

## P-071 prediction card: B1 G pin-hold, C / V / D (registered before any phone data)

Second read: mgmt-ops-9. Round 1 was NEEDS-FIX (sentinel, arm-level rule, unit, Low Power Mode); this is the amended
card.

- **Builds.** Snapshot b1789284481295-4ad4a84a, CSS c6aad94b455f in every arm. All three are served from the immutable
  copies in `out/snapshots/` on the working branch, over plain http as in P-036.
  - C = `aw1-10e` (JS 3e2f599a1632).
  - V = F3 `mw10e-arm-scope-c` (JS c6d3590576a7).
  - D = this build (JS 999c4497f37e).
- **Driver.** G, `fixes/morph-webkit/gestures/pin-hold-v2.json`, GESTURE_HASH 2d3a97b742cf. The script:
  - transit strokes until `atEnd` or 24 passes;
  - 8 s idle at the pin;
  - mark `cycle`, then two close/open cycles: down 240 px / 500 ms, 2 s, up 240 px / 500 ms, 2 s.
- **Block.**
  - The runner's own `--no-timing` hold. One uncounted warm-up per arm's port.
  - Up to 9 counted runs in the order C V D / V D C / D C V, Timeline off.
  - Safari is parked after every run, with `wait.mjs phone-temp --below auto` between runs.
- **Sentinel** (the signed P-036 rule):
  - The standard S sentinel (`iphone.mjs scroll`) runs on C, on its own port, uncounted: once after the warm-ups and
    once at the block end. It passes with bottom ≥ 58 fps and scroll ≥ 44 fps.
  - A failing sentinel voids every counted run since the last pass. The phone then cools per §5.3: 0.5 °C below the
    last passing sentinel, 38 °C if none today, at most 10 min.
  - If the sentinel fails again on a cool phone and a quiet Mac, the block stops.
- **Low Power Mode** is recorded for every run. A run with it on is void, because 30 Hz would read as a collapse.
- **Attribution, after the end sentinel.** Timeline runs (`Page.disable` → `Page.enable` → `Timeline.start`) on:
  - V at the pin;
  - D's cycle phase;
  - D's pin, if D collapses.
- **Metric 1, collapse.**
  - Per run, from pin arrival (the first frame at y ≥ 5200) to the end of the run, fps in consecutive 2 s windows.
  - A run is **collapsed** when 2 consecutive windows are under 30 fps.
  - An arm **collapses** when ≥ 2 of 3 valid runs collapse, and is **clean** at 0 of 3. **1 of 3 is inconclusive.**
- **Metric 2, arm/disarm frames** (cycle phase; phone ms thresholds only, G run, F-071):
  - The arm window runs from the up stroke's first touchmove −50 ms to the stroke's lift +500 ms.
    - It is this wide because of the Simulator check (02:47Z, counts only, D and C alike): cycle 1's up stroke starts
      at y 5213 with the morph closed, so its touchmoves are not prevented (0/27-28). The page scrolls natively to
      the end, with an overscroll bounce to y 5348, and the morph reopens there, mid-stroke or in the momentum after
      it, not at the first touchmove.
    - Cycle 2's up stroke starts at y 5254-5256 and is prevented from its first move (31/31).
    - Both down strokes are prevented (33-34 of 33-34) and close the morph.
    - Every run ends at m = 1, `is-expanded`.
  - The disarm window runs from the down stroke's lift +400 ms to +1200 ms, when the spring reaches 0 and D removes
    its window listeners.
  - The unit is **the per-run max dt over that run's 2 windows of a kind**, so n = 3 vs 3, arm and disarm separately.
    Also reported: dt > 50 / > 34 counts with the ±4 ms twins and the near bands.
  - **Separated-worse:** every D run max > every C run max AND median(D) − median(C) ≥ 16.7 ms.
  - The verdict is read at > 50 ms with the twins 46 and 54. When a twin's verdict differs, the verdict is
    "threshold-sensitive".
- **Baseline.** P-036 (OBSERVED): the collapse appeared in V 2/2 and C 0/5. The Simulator (pin-hold-v1) and Chrome do
  not reproduce it.
- **Terms.** The mechanism is unknown (UNRESOLVED).
  - D restores C's window touch listeners during the morph. If B1 comes from the element-only listener set, D fixes it.
  - D's add and remove on every cycle could cost a frame like P-011's ~100 ms IO-edge frame. The WebKit source says a
    style rebuild comes only from a change in the event-region type set, and touch regions are compiled out on iOS
    26.6 (claims-audit W5/W6). So the add may be free there (UNRESOLVED on the device).
- **Predictions.**
  - C clean: ~90 %.
  - V collapses ~55 %, clean ~30 %, inconclusive ~15 %.
  - D, if V collapses: clean ~50 %, collapses ~40 %, inconclusive ~10 %.
  - Arm/disarm: D not separated-worse than C, with no D-only frame > 50 ms, ~60 %. A 50-110 ms frame at D's arm in
    most cycles, ~35 %.
- **Decision.**
  - V collapses, D is clean, and D's windows are not separated-worse → D is the candidate. Next comes the short
    P-036 confirmation on D (≥ 2 V runs vs C, arm-scope-touch-v1), then the F swipe.
  - D collapses → build E (window-only touch listeners while the morph is active). No phone time until E passes the
    Simulator and a Chrome review.
  - D is clean but its arm or disarm window is separated-worse → back to the lead with the Timeline attribution. There
    is no automatic fallback, because arming at the zone edge brings back P-011's edge frame.
  - V or D inconclusive (1 of 3) → report to the lead; no build decision.
  - V clean → B1 is not reproduced under this script and stays UNRESOLVED. Report to the lead and the reviewer. No
    second block without a new question.
- **n.** At most 3 runs per arm. This is a mechanism and regression check, not a gain block. Nothing from it goes to
  the user as fact without the Timeline attribution.

## Review round 1, non-blocking items: where each went

- Desktop wheel armed from load: CONFIRMED risk, stated in Risks below and in `fixes/mw10e-arm-scope/README.md`; not
  measurable with the CDP ack proxy.
- OBSERVED wording: `fixes/mw10e-arm-scope/README.md` (event-region rebuild now a candidate, F-062 UNRESOLVED) and
  `fixes/mw10e-arm-scope-c/README.md` (the ~190 ms level, "none detected at this block's resolution", V2's 16 frames,
  and the iOS touch-region note with its source lines, claims-audit W5/W6).
- Slips in `fixes/mw10e-arm-scope-c/README.md`: 38.7-41.2 °C (V1 ended at 41.2), V1 1.9 and C4 1.8 min, load1 18.6
  (V2) and 8.8 (V4).
- Sentinels: `fixes/mw10e-arm-scope-c/p036-score.mjs` now puts them in `sentinels` and `cardPart` (no sentinel →
  INCOMPLETE, a failed one → VOID). Re-run on the P-036 records: both sentinels pass, zones unchanged, card part PASS.
- Header ref `T`: **not in this build.** The touch target is still `document.querySelector('header.start-selling-top-nav')`
  at setup. `T` is the component's `bind:this` ref to the same element (JS ~13565-13570), so the swap is one
  expression and behaviour-identical, but it changes the JS hash, and D's hash is the one in the phone ticket. It goes
  into the build that lands after the phone answers (D's successor or E), with a token diff shown here.
- Dangling refs: `touch-check.mjs` and `probe-results/` are now named as working-branch files; `touch-gap-check.mjs`,
  `pinhold-sim.mjs` and the pin-hold gestures land with this folder.
- `aw1-10e` is not on `main`: stated in the header here and in `fixes/mw10e-arm-scope-c/README.md`.

## Risks

- **Desktop wheel, armed at load (from F3, unchanged here).** A window `wheel` listener with `{passive: false}`
  makes each wheel scroll wait for the main thread. CONFIRMED: https://developer.chrome.com/blog/scrolling-intervention-2
  says Chrome 73 made root-target (window, document, body) wheel listeners passive by default, and that
  `{passive: false}` opts back into blocking ("a noticeable delay in scroll response").
  - In the original and in aw1-10e this was true only inside the 200 % zone near the end of the page. In F3 and D it
    is true on the whole page.
  - The Chrome probe could not separate the builds. During a 400 ms main-thread busy period, the CDP
    `Input.dispatchMouseEvent` round trip was 352-372 ms in C, V and D alike, although C has no wheel listener at the
    top of the page. So the CDP ack waits for the main thread anyway, and it is no proxy.
  - The risk stands as stated (desktop only, no phone effect) and goes into the land card.
  - Option, not built and untested (a follow-up, not a blocker, per the lead): keep the wheel listener off at load
    and arm it as aw1-10e did, at the 200 % zone edge, but only where `matchMedia('(any-hover: hover), (any-pointer:
    fine)')` matches, so a touch-only phone never carries it and a desktop carries it only near the end. It would
    need its own Chrome wheel check (a real wheel, not the CDP ack, which does not discriminate) and a reading of
    what a hybrid touch laptop does with it.
- **Listener churn on every morph cycle.** D adds the two window touch listeners when the morph starts (E's
  changed-target branch, mid-gesture) and removes them when the spring is back at 0 (`I()` with `C()` false). So
  every open/close cycle at the end of the page changes the window's touch listener set twice. C never did this: it
  added its window listeners once at the zone edge and kept them inside the zone. What one add or remove costs on
  the phone is unknown (WebKit may have to update the UI process's touch event regions, cause and cost
  UNRESOLVED). Per X1, a window touch listener change needs a phone segment card, so the phone ticket times both
  the morph-start frame (arm) and the morph-end frame (disarm), C vs D, with Timeline (gesture `pin-hold-v2`: two
  close/open cycles at the pin).

## What needs re-measuring (D is a new landing build; P-036 covers only -c)

1. The B1 phone ticket (approved under the T-027 #5 F3 exception, after P-068 H2): G `pin-hold-v2`, C / V / D,
   Timeline on V (and on D if D collapses), the idle triple at the pin, and the frames around each morph start and
   end on D (arm/disarm) with dt and Timeline records, C and V side by side. Decision rule (lead): V collapses and D
   does not → D is the candidate → item 2 → F swipe. D collapses → build E (window-only listeners during the morph);
   no phone time until E passes the Simulator and a Chrome review.
2. P-036's card part transfers by argument: pre-morph D is byte-for-byte F3's listener set, and the zone strokes never
   arm the window. A confirmation run of P-036 on D (≥2 V-arm runs against C) is the honest minimum before landing.
3. The F swipe stays postponed until 1 and 2 are done.
4. The Chrome regression A/B (`fix.mjs ab`) is not needed for the touch change: Chrome has no touch on the desktop
   A/B. It is deferred under the timing rule in any case.
