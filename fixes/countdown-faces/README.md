# Fix: countdown-faces

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** round 2 (review r1 NEEDS-WORK addressed). Measured: counts, call-tree attribution, frozen-frame pixel
identity. No timing A/B, by design.
**Stage:** I (instrumented and attributed). A proposal (PR-007) decides whether it goes on to F. A phone segment
card is needed before F/L (WebKit, see "WebKit").
**Device class / gate:** Chrome counts and call tree; WebKit counts on the Simulator. No phone timing blocks and no
timing A/B gain claim (timing was deferred project-wide when this ran).
**Driver(s) behind the claims:**
- Chrome CDP probe (`probe.mjs counts|profile`);
- frozen-frame harness (`probe.mjs pixels`);
- spring model (`chain.mjs`);
- Simulator Timeline counter (`sim-counts.mjs`).

**Topic:** user thread T-024 (the countdown re-renders while nobody can see it; each digit has 10 faces).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (pretty line numbers of the baseline):
- spring/digit `$E` and its helpers (3805-3876);
- `tD` (3894);
- countdown `cD` (3920, 3958);
- the hero `fD`: a state (4026), its exit-opacity function (4162-4174) and the `cD` call (4330);
- the morph panel's `cD` call (13157).

No CSS change.

## What the countdown costs today (research)

The countdown is `cD`: one row of `tD` numbers. Each digit is a `$E`, which holds 10 absolutely positioned `.face`
spans (0-9, `will-change: transform`), each on its own layer. It runs a spring `GE` (stiffness 280, damping 18,
mass 0.3, 16 ms substeps) on rAF at every target change, i.e. every second. Every frame it writes the spring value to
a Svelte state, and the 10 faces of each rolling digit rewrite their `transform`.

There are two instances, and neither ever stops:
- the hero, `cD(xe, {})` at 4330;
- the morph panel, `cD(e(h), {inverse: true})` at 13157, mounted once the page reaches it.

**Which instances render while nobody can see them** (census per `[role=timer]`: viewport, product of ancestor
opacities, `data-start-selling-scene`, content-visibility). Chrome, 430x932:

| position | hero countdown | panel countdown |
|---|---|---|
| top (y 0) | visible | not mounted |
| heroExit (y = vh) | **in the viewport at opacity 0** (`.hero-copy` opacity × `--exit-opacity` = 0) | not mounted |
| pastHero / mid / end | off-screen (content-visibility:auto ancestor) | mounted at **opacity 0**, scene paused |

So the clock rolls in four hidden cases:
1. off-screen;
2. faded out in place (the hero's exit fade), a case the original brief did not list;
3. the panel's opacity-0 mount;
4. a background tab.

In a background tab the browser runs no rAF callbacks: "requestAnimationFrame() calls are paused in most browsers
when running in background tabs or hidden iframes" (CONFIRMED, MDN
`developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame`). So the tab case is already free, apart
from the 1 Hz tick.

- **Transform writes skip layout and paint:** CONFIRMED for compositor-layer elements. web.dev "Stick to
  compositor-only properties and manage layer count": "The best-performing version of the pixel pipeline avoids
  both layout and paint, and only requires compositing changes". The faces are on their own layers
  (`will-change: transform`).
- **Most of the cost is Svelte's reactive flush and style recalc, not the spring math:** OBSERVED, in our setup
  (Chrome traces). It is not checked against Svelte docs.
  - Round 2 isolates it: the PoC runs the same rAF frames with the same spring math as the original and only skips
    the state write while hidden.
  - With that, the countdown's FireAnimationFrame time drops from 438-644 ms to 18-44 ms per 3 s (medians, n=3,
    table below).

## What changed (PoC)

**(a) 3 faces per digit instead of 10.** Each digit has 3 slots (`__cdSlots = [0,1,2]`).
- Slot k shows cell position `p = round(v) - 1 + ((k - round(v) + 1) mod 3)`, digit `p mod 10`, at offset
  `KE(digit, v)`. That is the same offset the original gives the face of that digit, clamped to ±1 cell.
- The two faces that can be inside the cell (`floor(v)`, `ceil(v)`) always have a slot.
- A face at ≥ 1 cell is hidden by `.digit { overflow: hidden }`, just as the original parks its other 8 faces.
- A node check over 110,002 values in [-1, 10] found 0 mismatches against the 10-face visible set.
- The DOM changes:
  - Face order differs.
  - Each digit's text is 3 digits instead of "0123456789". Find-in-page and text copied from the clock change with
    it.
  - Faces are `aria-hidden`, so screen readers are unaffected. The readable value stays in `role=timer` /
    `aria-label` and in `data-value`.

**(b) No state writes while the clock can't be seen.** The digit's spring keeps running exactly as in the
original: the same rAF frames, the same `GE(t, e, o - n)` steps and the same start value. While the clock is
hidden, each frame only stores the value in a plain variable (`__cdV`). It does not write the Svelte state, so
there is no flush, no face style write and no style recalc.

When the clock becomes visible again, a second effect writes the stored value at once.
- The hero's visibility is set in its exit-opacity function, and the panel's in its morph spring. Both run inside
  a frame (rAF), so the write lands in the frame that shows the clock again.
- If the spring's own callback for that frame runs later in the same frame, it writes that frame's value itself.
- Svelte flushes the write from a microtask. The HTML standard runs a microtask checkpoint after each callback it
  invokes ("clean up after running script"), and that includes each rAF callback in "run the animation frame
  callbacks". So the flush happens inside the same rendering update, before style and paint. This is the spec
  reading, not separately verified in WebKit; see "WebKit".
- The first frame that shows the clock therefore shows what the original shows for that frame. This fixes review
  r1 Blocking 2 (the one-frame hop after an instant jump). The IntersectionObserver whose late callback caused it
  is gone.

`live` comes from the call site, through an optional `active` prop on `cD` (the same name and meaning as topic #1's
prop: false = mounted but not shown):
- **Hero:** the exit function reads the rect of `div.hero` (`x`, bound at JS 4368, the element it writes
  `--exit-opacity` on) next to the rect it already reads, and sets
  `active = --exit-opacity > 0 && div.hero within one viewport`.
  - `r > 0` is exactly opacity > 0 (CSS 1734/1910/1932/2043, confirmed by review r1).
  - Below the hero, `r` is already 0, so the one-viewport term rarely matters.
  - `fD` shadows `N`/`z`/`s`, so it uses module aliases.
- **Panel:** `morph > 0.08`, where its opacity formula `clamp(0, (morph - 0.08) / 0.72, 1)` leaves 0 (review r1:
  equal to opacity > 0).
- **No tab gate:** the browser already stops rAF in a background tab.
- **Reduced motion** is unchanged (snap).

### Why no replay (round 2 finding)

Round 1 skipped the rAF frames while hidden and replayed them on resume. The review showed that this was not exact
when a tick falls mid-frame. A round-2 draft anchored the replay to real frame stamps (the first frame after the
change, and the resume frame) and spread the frames in between evenly. `chain.mjs` runs that draft against the
original, using the baseline's real `GE`. Results are the maximum shift over 300 random phases per case and every
frame of the resume:

| frame stamps | replay draft, 60 Hz | 120 Hz | shipped PoC |
|---|---|---|---|
| regular grid | ≤ 2.3e-11 px | ≤ 1.3e-10 px | 0 |
| regular, 100 µs grid | ≤ 0.010 px | ≤ 0.093 px | 0 |
| jittered ±1 ms on a 100 µs grid (like Chrome below) | ≤ 0.94 px | ≤ 1.58 px | 0 |
| 1 frame dropped in 7 | ≤ 0.67 px | ≤ 30 px (9→0 wrap) | 0 |

Real Chrome frames are not a regular grid. In the same pages the probe recorded 90 real rAF stamps per arm: 120 Hz
gaps of 7.3-9.4 ms (mean 8.333) on a 0.1 ms grid (OBSERVED in our setup: Chrome, display on, no throttling;
`results.json` → `pixels.realFrameStamps`). A replay can't know frames it did not see. So the shipped PoC keeps the
frames and drops only the writes.

"Shipped PoC: 0" is true by construction: it makes the same `GE` calls with the same arguments as the original. The
model only confirms the bookkeeping.

The precise claim: **for any sequence of frames, the PoC shows what the original computes for that sequence.** The
original's own path also depends on which frames it gets (60 vs 120 Hz differ by 3.3 px; frame drops change it).
The PoC page is cheaper, so its frame sequence can differ from the original's on the same device. That changes the
clock's path only within the variation the original already has between runs.

Side notes:
- In those 270 real frames, `document.timeline.currentTime` equalled the rAF stamp every time. Between frames it
  held the last stamp while `performance.now()` moved on (OBSERVED, Chrome).
- Web Animations §4.3.2 states that `document.timeline.currentTime` "does not change in between calls to the update
  animations and send events procedure" (CONFIRMED, w3.org/TR/web-animations-1). The round-2 draft relied on this;
  the shipped PoC no longer needs it.

## The apple.com pattern this follows

User reference: https://www.apple.com/iphone-18-pro/, `media-card-gallery-content`. We read the public
`https://www.apple.com/v/iphone-18-pro/c/built/scripts/overview/main.built.js` and `.../styles/overview.built.css`
(no personal data sent):
- **Play range, not IntersectionObserver.** The gallery's animations play and pause from an AnimSystem scroll-range
  keyframe (`play-pause-kf`, starting one viewport early, `a0t - 100vh`): `onEnter` plays, `onExit` calls `pause()`.
  The bundle's only IntersectionObserver serves keyboard navigation. Neither file uses `content-visibility`.
- `pause()` adds the class `paused` (`animation-play-state: paused` on the progress) and pauses the TimeGroup.
  **Resume continues where it stopped; it does not restart.**
- `.gallery-item.out-of-view .card { display: none }` keeps only the slots next to the current one rendered. That is
  the same idea as keeping 3 faces.
- We found no explicit background-tab code in those two files. UNRESOLVED whether Apple handles tabs elsewhere; the
  browser stops rAF there anyway (MDN above).

The PoC follows the same pattern: the call site decides visibility from scroll position, inside the scroll frame,
and there is no IntersectionObserver. It differs in one way. The paused clock keeps its spring time running, so on
return it shows the frame an always-running clock shows. It does not continue from where it stopped. A countdown
must show the current time, so continuing from where it stopped would be wrong for it.

## Pixel identity (frozen frames)

`probe.mjs pixels base,poc`: the arms run in order A B A, where the second A is an A/A control.
- **Virtual clocks for the countdown's own code.** `Date.now` (the countdown value), `performance.now` (the time
  of a target change) and `document.timeline.currentTime` are virtual. The code is matched by stack line, inside
  the countdown's line range of each arm's file (`cdRange`: from `var UE` to `var lD`; no fixed regex, review r1
  #10). The countdown's rAF callbacks are queued and stepped by the harness. Everything else on the page runs
  normally.
- **Frame stamps are jittered like real ones:** `G + k·FR + J(k)`, J in [-1, 1] ms on a 0.1 ms grid.
- **Ticks fall mid-frame:** `T1 = G + FR/3` (review r1 Blocking 1c).
- Screenshot clip: the hero `[role=timer]`, 384x96 CSS px at DPR 3.
- Each shot also records the face state: every face inside the cell, as digit@translateY to 3 decimals.
- **First visible frame after an instant jump back:** a recorder reads, after each real frame, the hero copy's
  opacity and the face state. It compares the first frame in which the hero copy is visible again.

| comparison | shots | differ in pixels | differ in face state | first visible frame after the jump (face state) |
|---|---|---|---|---|
| base vs PoC | 295 | **0** | **0** | **0 of 12 differ** |
| base vs base (A/A) | 295 | 0 | 0 | 0 of 12 |

There were no blank shots and no page errors. Shots by kind (base vs PoC, all 0 diffs):
- **Rolls at 60 Hz (102):** 6 kinds × 17 phases, frame 0 to 60. One step down, one step up, the ones wrap 0→9 with
  tens 4→3, 9→0 with tens 3→4 going up, a 4-unit carry (3d 04:00:00 → 03:59:59), and tens 10→09.
- **Rolls at 120 Hz (40):** the first 4 kinds × 10 phases.
- **Resume, 40→39 (81 at 60 Hz, 54 at 120 Hz):**
  - the clock comes back 6, 15 or 40 frames after the change at 60 Hz, and 12 or 40 at 120 Hz;
  - shots at +0 to +40 frames;
  - three ways of hiding: faded to opacity 0 (y = vh), more than one viewport away, and a tab switch.
- **Resume after two target changes while hidden (9 + 9):** 40→39, then 39→38 200 ms later, mid-roll (review r1
  #7). Back 8 frames later at 60 Hz, 16 at 120 Hz.
- **Example of a first visible frame**, 6 frames after the change, hero faded in at opacity 0.975: both arms show
  `3@-5.124 4@30.876 | 7@-25.886 8@10.114`, mid-roll.

Not shot:
- the panel clock (the same digit code; its `active` comes from the morph spring, also in a rAF);
- WebKit;
- real 120 Hz hardware (the harness steps virtual 120 Hz stamps).

## Before / after: counts

**Full page, round 2.** Base vs PoC, n=3 per arm, one exclusive hold. Each 3 s window starts 700 ms after a second
tick, so it holds exactly three ticks and their rolls (review r1 #3). The tables give medians, with ranges for
the noisy ones. ms values are rough (CPU 6x, not a timing A/B).

| position (both clocks hidden) | face style writes | elements styled | style recalcs | layouts | paints | countdown rAF frames | countdown rAF ms (rough) |
|---|---|---|---|---|---|---|---|
| heroExit, base | 1580 (1200-1670) | 3068 | 253 | 153 (145-157) | 736 | 158 | 438 |
| heroExit, PoC | **0** | **1709** | 286 | 164 (161-178) | 833 | 141 | **18** |
| pastHero, base | 2260 (2150-3180) | 6416 | 287 | 73 | 769 | 223 | 571 |
| pastHero, PoC | **0** | **5541** | 358 | 79 | 872 | 287 | **18** |
| end, base | 2750 (2320-2870) | 5576 | 319 | 0 | 638 | 228 | 644 |
| end, PoC | **0** | **5040** | 360 | 0 | 720 | 287 | **44** |

**Why some counts go up with the PoC** (review r1 #5):
- **More frames.** Hidden countdown frames now cost almost nothing, so Chrome at 6x produces more of them:
  countdown rAF frames are 287 vs 223 at pastHero.
- **Per frame, the PoC does less.** Elements styled per countdown frame are 19.3 vs 28.8 at pastHero and 17.6 vs
  24.5 at end; paints per frame are 3.04 vs 3.45 and 2.51 vs 2.80.
- **Recalcs and paints follow the frame count.** Style recalcs and paints scale with the number of frames. Most
  of them are the rest of the page: the PoC writes no countdown style there at all.
- **heroExit is not explained.** Layouts are +7 % and paints +13 % with fewer countdown frames (141 vs 158).
  OBSERVED, cause unknown; not repeated beyond n=3.

**Isolated page (round 1, n=1).** One countdown alone with the page CSS, 8 digits, 6 s window. It is visible, so it
rolls. The round-2 PoC runs the same visible path as round 1, a state write on every frame, so these numbers still
describe it. Per countdown frame, the windows were not tick-aligned:

| | base | PoC | faces only (a) | still (floor) |
|---|---|---|---|---|
| face style writes per frame | 9.8 | **2.1** | 2.1 | - |
| elements styled per frame | 9.8 | **2.0** | 2.0 | - |
| layouts / paints per frame | 0 / 0 | 0.021 / 0.042 | 0.022 / 0.044 | 0 / 0 |
| layers (face layers) | 86 (80) | **30 (24)** | 30 (24) | 86 (80) |
| countdown rAF frames in 6 s | 347 | 283 | 276 | 0 |

**What (a) costs.** A slot's digit text changes once per roll: 6 text changes in 6 s, giving about 1 small layout
and 2 paints per second while the clock is visible. Base has none. That is the price of 3 faces instead of 10.

The face-layer repaint counts (2 in the faces arm, 11 in the PoC arm) come from a separate 2 s LayerTree window
that is not tick-aligned. The trace paint counts of the two arms are equal (12 / 12). The 2 vs 11 gap is
unexplained (OBSERVED, n=1) and was not repeated.

Round 1's full-page `base`/`still` counts came from a shared-lane hold at load1 4.2-7.1, so their ms values are
void. Its `faces` arm was an earlier build (range end 4038, not 4055). Both are kept in `results.json` → `round1`,
labelled, and not used above.

## Call tree (Chrome CPU profile, round 2, n=1)

`probe.mjs profile base,poc`: 100 µs sampling plus a trace, 6 s windows, CPU 6x, in the same hold.

| window | busy ms base / PoC | countdown stack ms base / PoC | style ms base / PoC | elements styled base / PoC |
|---|---|---|---|---|
| top (visible) | 3468 / 3181 | 81 / 77 | 333 / 326 | 7280 / 4900 |
| pastHero (hidden) | 4015 / 3251 | 59 / 29 | 476 / 376 | 18042 / 11169 |
| end (hidden) | 4161 / 3346 | 81 / 40 | 583 / 491 | 12848 / 10122 |

- **Hidden clock:** busy time is lower by ~760-815 ms per 6 s at 6x, about 19-20 % of base's busy time.
  OBSERVED, n=1, Chrome 6x, not a timing A/B.
  - Round 1's "28-40 %" (base − still) is withdrawn as a number. It was n=1, its busy-ms deltas did not add up
    (review r1 #4), and the PoC no longer stops the rAF.
- **Visible clock (top):** within noise at n=1.
- The "countdown stack" column counts only samples whose stack contains countdown code. The Svelte flush runs from
  the scheduler's microtask with runtime frames only, so this column misses it.

## WebKit (iOS Simulator, counts only, round-2 build)

`sim-counts.mjs` runs in a functional Simulator session: Mobile Safari, Web Inspector Timeline, 4 s windows, plain
http on localhost. Simulator times never count, so these are record counts (n=1):

| position (Simulator y) | base RecalcStyles / Layout / Paint / countdown rAF | PoC |
|---|---|---|
| top (0) | 197 / 156 / 151 / 136 | 203 / 173 / 157 / 135 |
| heroExit (775) | 200 / 189 / 319 / 126 | 201 / 212 / 319 / 118 |
| pastHero (2560) | 201 / **214** / **180** / 201 | 106 / **107** / **82** / 215 |

- **pastHero (hidden clock):** the spring still runs every frame (215 countdown rAF), but WebKit's style recalcs,
  layouts and paints halve. This fits F-081 (WebKit's idle small layouts tied to the countdown spring): they come
  from the writes, not from the rAF itself (OBSERVED, n=1, Simulator).
- **heroExit:** both arms still roll. UNRESOLVED: the Simulator's shorter viewport probably leaves the hero partly
  visible at y = innerHeight (`--exit-opacity` > 0), and then the PoC rolls by design. The decisive check is to read
  `--exit-opacity` on `.hero-copy` at that y in a session.
- **Not checked on WebKit (review r1 #9):**
  - There is no WebKit pixel or resume check.
  - Two WebKit cost triggers were not measured on the phone: face layers going from 80 to 24, and text repaints
    inside composited face layers (X1, F-054).
  - Whether WebKit runs the exit callback and the write in the same rendering update is UNRESOLVED.
  - The 120 Hz path on a real display is UNRESOLVED.
  - A phone segment card is required before F/L.

## X1 phone segment card: ticket (pre-data; prediction P-069)

**Owner:** de-countdown. **Phone runner:** `iphone-runner`. **Order (lead, 10-02 22:1xZ):** Simulator first. The phone
segment runs only if the Simulator leaves a WebKit cost question open; it is queued after st6 S7 and F3 in
iphone-runner's queue. **Rules:**
- No timing gain claim: this is attribution (Timeline segments and counts), not an fps or gain verdict.
- No recordings (T-018).
- Timeline-block rules from protocol v2 §5.2.
- Written before any X1 data.

**The question (one):** what does the PoC change in WebKit's rendering work?
- **Clock visible:** 3 faces with changing text against 10 composited faces.
- **Clock hidden:** no state writes.
- **Resume:** the first frame back.
- On the phone, in which Timeline segments (Script / Style / Layout / Paint+Composite / Other) does it land?

**Arms.** Snapshot `b1789284481295-4ad4a84a`; both arms serve the baseline CSS `2.gBuqKVzi.css` `27776f3d4138`.

| arm | build | `nodes/2.DyWL8TcE.js` | served from |
|---|---|---|---|
| C (control) | base | `4606120cf392` | `--root site-pretty`, no overlay |
| V | PoC as landed (6890fe5, `patch.diff`) | `638b8e03e81c` | `--overlay .claude/worktrees/agent-a097ffbf8f44a4d14/out/countdown-faces/snap-x1/poc` (immutable copy, `chmod a-w`) |

C → V differs only by `patch.diff` (+79 −16), with no CSS change. `x1.mjs` checks both served hashes at the start of
every run; a wrong hash makes the run VOID (exit 3).

**Tool:** `fixes/countdown-faces/x1.mjs` (committed with this ticket). One sequence per page load, the same on the
Simulator and on the phone, with 4 windows. Each window starts 650 ms after a seconds tick and lasts 4 s, so it holds
exactly 4 ticks and their rolls.
1. `top` (y 0): the hero clock is visible and rolls.
2. `heroExit`: the first y where `div.hero`'s `--exit-opacity` reads 0, plus 8 px. The tool finds it and logs
   `--exit-opacity` at y = innerHeight. This settles round 2's UNRESOLVED heroExit, which sat at y = innerHeight.
3. `pastHero` (hero-track bottom + 1.2 vh): both clocks are hidden.
4. `resume`: the window starts at pastHero after the clock has been hidden ~9 s. 300 ms later there is an instant jump
   to y 0.

Per window, the tool records:
- Timeline record counts: RenderingFrame, RecalculateStyles, Layout, Paint, Composite, countdown rAF.
- Paint records with a digit-sized clip (≤ 1.5 × the digit's box): a face repaint.
- Layout records with a view-sized root.
- Exclusive ms per segment.
- rAF dt counts > 34 / > 50 with their ±4 ms twins.

With `--lt`, the tool also takes a LayerTree census before and after each window: layers, face layers, layer memory,
and paintCount deltas on face layers, i.e. text repaints inside the composited face layers.

With `--resume-check`, the tool hides the clock 8 s at pastHero, jumps to y 0, and reads the hero clock's digits in a
ResizeObserver callback of every rendering update. That callback runs after the rAF callbacks and layout, before
paint. The check: does the first update at y 0 show the live value (each digit equals `data-value`, or is mid-roll)?
This is the decisive local check for "WebKit runs the exit callback and the write in the same rendering update"
(UNRESOLVED above).

### Stage 1: Simulator mechanism session (counts only; Simulator ms never count, F-084)

```sh
node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner countdown-faces -- \
  node tools/sim.mjs session --functional --owner countdown-faces -- node fixes/countdown-faces/x1.mjs sim base,poc
# second session, reversed order (n=2 per arm):
node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner countdown-faces -- \
  node tools/sim.mjs session --functional --owner countdown-faces -- node fixes/countdown-faces/x1.mjs sim poc,base
node fixes/countdown-faces/x1.mjs score out/countdown-faces/x1/x1-sim-*.json
```

- `--lt` and `--resume-check` are always on in the Simulator. Each session is one shared hold of ≤ 300 s.
- **Sentinel and validity (stage 1):** there is no heat sentinel; the Simulator gives counts only. A session counts
  only if all of these hold:
  - both served hashes match;
  - every window holds ≥ 3 detected ticks;
  - `--exit-opacity` reads 0 at the heroExit y.
  Otherwise it is redone once, in a new hold.
- **Statistic (stage 1):** per window, the record counts; per arm, the two sessions' values. "Above / below C's
  range" means both V values lie beyond both C values. No twins or near bands: these are counts, not frame times.

**Stage-1 readout → stage 2** (fixed now; the trigger is exact). The phone segment **runs if (i) or (ii)** holds:
- (i) At `top`, either V's face-layer repaints (LayerTree) or V's digit-sized Paints lie above C's range. Here "above"
  means both V sessions exceed both C sessions. That is the expected outcome (S2 predicts it): **a hit on S2 opens
  stage 2.** The Simulator counts the added text repaints but can't time them, so whether they cost anything on the
  device stays open. A hit on S3 alone (Layouts up, repaints not) also opens it.
- (ii) At `resume`, V's Layout or digit-Paint count lies above C's range.

The phone segment **does not run**, and X1 goes back to the code instead, if:
- (iii) at `pastHero` or `heroExit`, V's RecalculateStyles, Layout or Paint is > 0.8 × C's in either session: the
  hidden skip does not work on WebKit, which is a mechanism failure; or
- (iv) the resume check fails: V's first update at y 0 shows a stale digit, a one-frame hop on WebKit.

(iii) and (iv) take precedence over (i) and (ii). If none of (i)-(iv) holds, X1 closes on the Simulator: no added
WebKit work, so there is no phone cost question.

### Stage 2: phone segment (only if (i) or (ii); after st6 S7 and F3)

**Stage 2 needs the user's timing lift (deferral since 2026-10-02 02:27 +07).** It measures Timeline ms, so it is a
timing block. If stage 1 triggers it, it is not queued with iphone-runner. The stage-1 readout and the trigger go to
the lead, who asks the user in the console; stage 2 queues only after the user's yes (lead, 10-02 22:4xZ).

**Ticket.**
- **TICKET** countdown-faces X1 · V PoC `638b8e03e81c` / CSS `27776f3d4138` · control C base `4606120cf392` / CSS
  `27776f3d4138`, same snapshot.
- **Driver:** W, as the `x1.mjs phone` window sequence above. These are jumps and holds at fixed y with the page not
  touched, at 430x775 (scripted geometry).
- **Question:** the one above, read on the phone. **Prediction:** P-069.
- **Probe set:** Timeline (depth 1) in every counted run, plus the in-page rAF logger. The std probe is not used in
  counted runs: one inspector client per page (I-038), and x1 holds it.
- **Expected time:** ~20 min, plus cooling.

**Serve.** One server per arm, restarted at the block start. The phone opens each server's plain-http twin (I-003),
host `lan` (I-073; never written down resolved).

```sh
node tools/serve.mjs --root site-pretty [--overlay <snap-x1/poc>] --port 0 --https --vendors=local --latency 150 --no-cache --state out/x1/serve-<arm>.json
node tools/wait.mjs serve out/x1/serve-<arm>.json
```

**Per run:**

```sh
node tools/iphone.mjs open http://lan:<twin C|V>/ --owner iphone-runner
node fixes/countdown-faces/x1.mjs phone --url http://lan:<twin>/ --arm C|V --build base|poc --label X1-<n><arm> --run <n>
```

`x1.mjs phone` reads the battery temperature and charging state at the start and end of each run (A4), checks the
served hashes and parks Safari after the run. Low Power Mode must be off.

**Block** (protocol v2 §5.2 Timeline-block order; attribution only, so no fixed cooling between blocks):
1. Cool with `node tools/wait.mjs phone-temp --below auto` (≤ 10 min). Park Safari.
2. Run one uncounted warm-up per arm's port (A3): `x1.mjs phone … --warmup`, C then V.
3. **Heat check, open:** one uncounted Timeline-OFF control run on C's port,
   `iphone.mjs run --driver scroll --probe std --arm C --block X1 --build base --low-power off`. It must reach bottom
   ≥ 58 fps and scroll ≥ 44 fps. x1's Timeline-on C runs have no S scroll phase, so they can't replace this run.
4. Run 8 counted runs, Timeline on in every arm: **C V V C C V V C** (`--run 1..8`).
5. **Heat check, end:** as in step 3.
6. Run the attribution runs, uncounted, after the end heat check: one per arm, `x1.mjs phone … --lt --resume-check`.
   They give the device's LayerTree census, face-layer repaints and the resume check. `layersForNode` is never used in
   a counted run (§5.5).
7. Park Safari and stop the servers.

**Validity:**
- A failing heat check voids every counted run since the last passing one. Cool by `wait.mjs phone-temp`, then redo
  (§5.2).
- A run is void for:
  - a wrong served hash;
  - Low Power Mode;
  - a touched phone;
  - an attached Web Inspector (§5.5);
  - a window with fewer than 3 detected ticks.
- Log load1 per run. A LOAD > 8 run is flagged, not void.
- At most 2 blocks for this question (§5.3).

**Scoring:** `node fixes/countdown-faces/x1.mjs score out/countdown-faces/x1/X1-*.json`.
- **Statistic:** for each run and window, the sum of the named segments' exclusive ms over the 4-tick window. Per arm,
  the range (min-max) and the median over its 4 counted runs.
- **"Separated"** means every V run lies beyond every C run (4 vs 4; U = 0), by at least 4 ms between the nearest V
  and C runs. The 4 ms is the phone minShift, protocol §5.3.
- **No twins or near bands** for these rows: they are ms sums, not frame counts. The dt > 50 / > 34 counts in row 4
  carry their ±4 ms twins as usual.

| row | read (per run, per 4-tick window) | decision |
|---|---|---|
| **1. top (clock visible)** | Layout + Paint+Composite exclusive ms; digit Paints; view Layouts | **V separated above C** → (a) has a WebKit cost on the device. The lead gets the segment card; PR-007 rev 7 offers "pause-only" ((b) alone, 10 faces kept) to the user; (a) is not landed until the user decides. **Not separated, or V below** → (a) has no measurable WebKit cost; "full" stays and X1 closes. |
| 2. pastHero (clocks hidden) | Style + Layout + Paint+Composite ms; record counts | **V separated below** → (b) confirmed on the device (attribution, not a gain claim). **Not separated** → reported; (b) keeps its count claim only. **V separated above** → stop and report (regression). |
| 3. resume | Layout + Paint+Composite ms, digit Paints | Reported with row 1. A resume window with V separated above C is read as row 1's cost. |
| 4. context | dt > 50 / > 34 (twins), heroExit rows | Information only. A V frame > 50 in `top` that no C run has, in ≥ 2 V runs, counts as row 1's cost. |

**The segment card** (A1) is the per-RenderingFrame table in each run file: Script / Style / Layout / Paint+Composite /
Other, gap − frame. Per arm it holds ≥ 3 captures (4 counted runs) and names the segment the fix removes: Style +
Layout + Paint at pastHero.

**Stage 2 block plan** (pre-data, before the iphone lease; after the user's timing lift in T-024 #8, 23:31Z, relayed
by the lead). It adds only operational detail. The ticket, the block order, validity, the statistic, the table rows
1-4 and P-069 above are unchanged.
- **Operator:** de-countdown runs the block itself, under the lease owner `countdown-faces`, queued with
  `lock.mjs acquire iphone --wait` (phone order: the blind swipe test, F3 P-036, then X1, then P-068). The commands
  above that name `--owner iphone-runner` run with `--owner countdown-faces`.
- **Arms on immutable copies.** Both arms run the same snapshot b1789284481295-4ad4a84a.
  - C is the committed baseline `site-pretty`, served from the main checkout and checked by the baseline guard.
  - V is the read-only copy `out/countdown-faces/snap-x1/poc` (chmod a-w, JS sha256 `638b8e03e81c`).
  - Every run fetches both files again and checks their hashes (`x1.mjs phone`, VOID exit 3 on a mismatch).
- **Servers:** one per arm, started at the block start and kept running to its end:
  `serve.mjs --root site-pretty [--overlay out/countdown-faces/snap-x1/poc] --port auto --https --vendors=local --latency 150 --no-cache --state out/countdown-faces/x1/serve-<C|V>.json`.
  The phone opens each server's plain-http twin, `http://lan:<twin>/` (resolved at run time, never written down).
- **Driver:** `fixes/countdown-faces/x1-block.mjs A|B|C`. It runs the block's steps in order, renews the lease, and
  stops on a failed heat check (exit 4).
- **Holds.** Each part runs in its own `lock.mjs run chrome-measure --no-timing --max-seconds 600` hold, inside
  `caffeinate -i`, so the Mac stays quiet. No part goes past 10 min:
  - **Before A:** cool with `wait.mjs phone-temp --below auto` (≤ 10 min).
  - **A:** warm-up C, warm-up V, heat check (open), counted runs 1 C, 2 V, 3 V, 4 C. About 8 min.
  - **B:** counted runs 5 C, 6 V, 7 V, 8 C, then heat check (end). About 6 min.
  - **C:** the attribution runs, C then V (`--lt --resume-check`). About 5 min.

  Between holds the phone sits parked. A heat check that fails voids the counted runs since the last passing one;
  the phone cools (`wait.mjs phone-temp`), and the voided runs are redone (§5.2). At most 2 blocks (§5.3).
- **Validity, per run:**
  - `ticksInWindow` ≥ 3 in every window (recorded since A1);
  - the served hashes match;
  - Low Power Mode is off (the user's setting; recorded as `--low-power off` on the heat checks);
  - no Web Inspector attached;
  - the phone is not touched.
- **Scoring (i)** is row 1, as pre-registered:
  - per counted run, the top window's Layout + Paint+Composite exclusive ms (`lpcMs`), 4 C runs vs 4 V runs;
  - "V separated above" needs every V run above every C run by ≥ 4 ms. The scorer now applies this gap to every ms
    sum; until now it compared ranges only.
  - Rows 2-4 as in the table.
  - The (i) trigger metric (face-layer repaints) is not a phone row: on the phone it is read only in the attribution
    runs (`--lt`), as information.
- **Outside the block:** any GPU-friendly variant from de-gpu's review is a separate PoC and a separate question. It is
  not in these arms.

**Prediction P-069** (`fixes/PREDICTIONS.md`, committed before any data):
- **Simulator, n=2 per arm:**
  - S1: face layers at top go 80 → 24 exactly, and total layers C − V = 56 ± 2. Face-layer memory V/C is 0.30
    [0.20, 0.45]; near 1.0 would mean WebKit backs only the faces inside the clip.
  - S2: face-layer repaints at top: C 0 [0, 3], V [4, 30]. Digit-sized Paints: C [0, 4], V [4, 30].
  - S3: Layout at top, V − C is [+2, +30].
  - S4: at pastHero, V/C RecalculateStyles, Layout and Paint are each ≤ 0.6. Countdown rAF V/C is [0.8, 1.25].
  - S5: at heroExit, `--exit-opacity` is 0 in both arms. V/C Layout and Paint are ≤ 0.7. `--exit-opacity` > 0 at
    y = innerHeight.
  - S6: the resume check is live at the first frame at y 0 in both arms, 2/2. While hidden, C is live and V is stale.
    Resume-window digit Paints, V − C, are [+1, +24].
  - Stage 2 is triggered by (i) (~85 %).
- **Phone:**
  - Row 1: not separated, with |median V − median C| < 4 ms (~65 %).
  - Row 2: V separated below, with median V/C 0.5 [0.3, 0.75] (~75 %).
  - Frames > 50 per window: 0-1 per run in both arms.
- **Falsified if:**
  - S1's face layers are not 24;
  - any S4 ratio is > 0.8;
  - S6 is not live at the first frame;
  - phone row 2 is not separated, or has V above.

### Stage 1 readout (Simulator, 2026-10-02 22:38Z and 22:51Z, n=2 per arm; counts only)

Data: `x1-stage1.json` (counts, LayerTree deltas, resume-check updates; no Simulator ms), from
`out/countdown-faces/x1/x1-sim-2026-10-02T22-38-47-266Z.json` (order base, poc) and `…T22-51-47-268Z.json` (poc, base).
Each session was one shared hold, weight simulator, a functional `sim.mjs` session (fw-sim 15 Pro Max).

**Tool changes after the ticket** (x1.mjs was 9de230198cf8 in the ticket, now 9a6f3f9ed143). They change only how the
sequence reaches its positions and what the resume check records; no window, count or rule changed.
- Session 1 (22:30Z) is **VOID**. The page sets `html { scroll-behavior: smooth }` (CSS 11738), so the bare
  `scrollTo(0, y)` calls animated. As a result:
  - every window started off its y;
  - the heroExit search landed at 775 vs 1552;
  - `--exit-opacity` read "1" at heroExit;
  - the panel clock was mounted at `top` in V only.
- Fixes:
  - every scroll is now `behavior: 'instant'`;
  - a prime visit to pastHero mounts the panel clock in both arms before `top`;
  - each window records `yAtStart`;
  - each resume-check update records the hero's `--exit-opacity`.
- The resume check also records `op`, the product of computed `opacity` up the hero timer's ancestors. It read 0 in
  every update, in both arms, also with `--exit-opacity` 1, so it is broken (in our setup, cause unknown) and is not used.
- **Gap.** The tool does not record the tick count inside each window, so validity check "≥ 3 ticks per window" was
  not recorded. Indirect evidence that the clock ran:
  - each window starts 650 ms after a detected tick and lasts 4 s;
  - C's digit Paints are 80-129 per window;
  - the resume check shows `data-value` advancing 1/s in both arms.

**Validity.**
- Served hashes match in all 4 arm runs: JS `4606120cf392` / `638b8e03e81c`, CSS `27776f3d4138`.
- yExit is 855 in all 4 runs. Every window's `yAtStart` equals its y.
- `--exit-opacity` reads 0 at heroExit (863) and 0.094 at y = innerHeight, in all 4 runs.
- Ticks: not recorded (see the gap above).

**Counts per 4 s window** (C = base, V = PoC; session 1, session 2; ratio = V/C within a session):

| window | metric | C | V | V/C |
|---|---|---|---|---|
| top | face layers (LayerTree) | 80, 80 | 24, 24 | |
| top | total layers | 122, 122 | 68, 68 | Δ 54, 54 |
| top | face-layer memory MB | 0.4, 0.4 | 0.4, 0.4 | 1.0 |
| top | face-layer repaints (layers repainted) | 127 (34), 129 (32) | 137 (24), 130 (24) | 1.08, 1.01 |
| top | digit-sized Paints | 106, 96 | 4, 4 | 0.04 |
| top | Layout / Paint (records) | 196 / 284, 200 / 279 | 196 / 172, 190 / 169 | 1.00 / 0.61, 0.95 / 0.61 |
| heroExit | RecalcStyles / Layout / Paint | 211 / 195 / 391, 207 / 187 / 339 | 166 / 187 / 244, 167 / 183 / 245 | 0.79 / **0.96** / 0.62, **0.81** / **0.98** / 0.72 |
| heroExit | view-sized Layouts; digit Paints | 167, 148; 83, 80 | 150, 149; 0, 0 | |
| pastHero | RecalcStyles / Layout / Paint | 234 / 247 / 194, 211 / 227 / 177 | 110 / 108 / 80, 93 / 106 / 80 | 0.47 / 0.44 / 0.41, 0.44 / 0.47 / 0.45 |
| pastHero | countdown rAF; digit Paints | 277, 192; 85, 97 | 267, 209; 0, 0 | 0.96, 1.09 |
| resume | Layout / Paint / digit Paints | 246 / 423 / 129, 210 / 343 / 110 | 184 / 290 / 31, 174 / 259 / 23 | 0.75 / 0.69 / 0.24, 0.83 / 0.76 / 0.21 |

At top and heroExit, both clocks are in the viewport (census). Face layers belong to the hero clock: the panel clock's
faces are not composited, and C's digit Paints come from them. At pastHero, only the panel clock is in the viewport.

**Resume check** (hidden 8 s at pastHero, instant jump to y 0, then every rendering update is read).
- Both arms, both sessions: the first 2 updates at y 0 still have `--exit-opacity` 0. Session 2 recorded this
  directly: at 74/209 ms in V and 122/253 ms in C. Session 1 shows the same 2-update pattern, but it has no opacity
  field. The exit callback that writes `--exit-opacity` runs from the scroll engine's rAF, 2 rendering updates after
  the jump on the Simulator.
- **V** shows the seconds value from 8 s before (session 1: "17" for "09"; session 2: "14" for "05") in those 2
  updates. It shows the live value in the 3rd update, the first one with `--exit-opacity` 1 (279 ms and 297 ms).
- In the PoC code, the hero gate and `--exit-opacity` are set in the same call (exit callback, JS 4214 and 4221-4223
  of the PoC build, sha256 638b8e03e81c). `.hero-copy`, which holds the clock, has `opacity: calc(var(--copy-in) * var(--exit-opacity))`
  (CSS 1734; 2043 at this width).
- So the stale digits are painted only at `--exit-opacity` 0. The tool's opacity-product field could not confirm this
  (broken, above).
- **C** is live in every update.

**Trigger, as pre-registered (literal):**
- (i) **holds, narrowly.** V's face-layer repaints at top (137, 130) are above C's range (127, 129), by 1-8 records
  (1-8 %). V's digit Paints (4) are far below C's (96-106).
- (ii) does not hold. At resume, V's Layout and digit Paints are below C's.
- (iii) **holds.** At heroExit, V/C Layout is 0.96 and 0.98, and RecalcStyles is 0.81 in session 2. All are > 0.8.
- (iv) **holds.** V's first update at y 0 shows a stale digit (2/2).

(iii) and (iv) take precedence, so **the ticket's outcome is "no phone segment; X1 goes back to the code"**. The
outcome and the readings below are sent to the lead, who decides. Stage 2 would need the user's timing lift in any
case.

**What each trigger rests on (for the lead's decision; not a re-scoring):**
- **(iii)** was written to catch "the hidden skip does not work on WebKit". The skip does work:
  - at pastHero, all three ratios are 0.41-0.47;
  - at heroExit, digit Paints go 80-83 → 0 and Paint is 0.62-0.72.

  The heroExit Layout count is not the clock's. 148-167 of C's and 149-150 of V's Layouts there are view-sized, about
  the same in both arms. At pastHero, by contrast, C's Layouts drop out in V. Nothing in the clock code would change
  that number.
- **(iv)** was written to catch a visible one-frame hop. The stale updates are the 2 updates in which `--exit-opacity`
  is still 0 in both arms. V goes live in the same update in which the clock becomes visible again. This rests on the
  recorded `--exit-opacity` plus the CSS and code above. Whether the clock is visible on screen is OBSERVED in our
  setup, not measured.
- **(i)** holds on face-layer repaints only, by 1 and 8 records. At top, V has 40 % fewer Paint records than C and
  about the same Layouts. The added per-layer repaints (V 5.4-5.7 per layer vs C 3.7-4.0) are real. Whether they cost
  anything on the device is still a timing question.

**P-069, Simulator part** (hit / miss against the pre-registered values):

| | predicted | observed | |
|---|---|---|---|
| S1 face layers | 80 → 24 | 80 → 24 (2/2) | hit |
| S1 total layers C − V | 56 ± 2 | 54, 54 | hit (edge) |
| S1 face memory V/C | 0.30 [0.20, 0.45] | 1.0 (0.4 vs 0.4 MB) | **miss**. As the ticket allowed: WebKit seems to back only the faces inside the clip (OBSERVED, in our setup) |
| S2 face repaints at top | C 0 [0, 3], V [4, 30] | C 127-129, V 130-137 | **miss** (C's face layers repaint too, cause unknown) |
| S2 digit Paints at top | C [0, 4], V [4, 30] | C 96-106, V 4 | **miss** for C (the panel clock's non-composited faces), V hit (edge) |
| S3 Layout at top V − C | [+2, +30] | 0, −10 | **miss** |
| S4 pastHero ratios ≤ 0.6; rAF [0.8, 1.25] | | 0.41-0.47; 0.96, 1.09 | hit |
| S5 opacity 0 at heroExit, > 0 at vh | | 0 / 0.094 (4/4) | hit |
| S5 heroExit Layout, Paint V/C ≤ 0.7 | | Layout 0.96, 0.98; Paint 0.62, 0.72 | **miss** |
| S6 live at the first frame at y 0, 2/2 | | C 2/2, V 0/2 (live at the first update with `--exit-opacity` 1, 2/2) | **miss as written** |
| S6 V stale while hidden | | 2/2 | hit |
| S6 resume digit Paints V − C | [+1, +24] | −98, −87 | **miss** |
| stage 2 via (i) | ~85 % | (i) holds, but (iii) and (iv) take precedence | |

The falsifier "S6 is not live at the first frame" is met as written. The phone parts are unscored.

### Lead decisions on the stage-1 trigger (2026-10-02)

- **(iii): explained post-data, lead 2026-10-02** (a signed lead deviation; the rule's text is unchanged). The
  heroExit Layouts are page-driven:
  - the view-sized Layouts are equal in both arms (C 148-167, V 149-150);
  - the clock's own digit Paints go 80-83 → 0.
- **(iv): not decided yet.** The "invisible at `--exit-opacity` 0" reading rested in part on the opacity field that
  was broken. It gets a decisive re-check (amendment A1 below) before anyone reads it as explained.
- **(i): goes to the user as one question after A1**, if (iv) is explained: run stage 2 (needs the user's timing
  lift), or accept the small repaint rise as is.

### Amendment A1: the decisive (iv) check (pre-registered before the re-run, lead 2026-10-02)

**What is checked.** One Simulator session, base then PoC (`x1.mjs sim base,poc`), with the same sequence and
windows as stage 1. It runs in the shared lane with weight simulator, counts only. x1.mjs goes from 9a6f3f9ed143 to
5d0c9e4c41db and changes only in what the resume check and the windows record:
- **Rendered opacity, per rendering update after the jump** (ResizeObserver callback: after rAF and layout, before
  paint):
  - `op` is the product of the computed `opacity` of the hero timer and every ancestor up the `parentElement` chain;
  - a value that does not parse as a number is skipped and counted (`opSkip`), never read as 0. The 9a6f3f9ed143 field
    used `Number(…)`, so an empty string, e.g. on a `display: contents` wrapper, became 0; this is a suspected cause,
    to be confirmed by the chain dump;
  - `zeroAt` names the first element whose computed opacity is 0.

  Each update also records the shown digits (the face nearest offset 0 per digit), the live `data-value`, and
  `--exit-opacity`.
- **`checkVisibility({opacityProperty: true, visibilityProperty: true})`** is recorded as `cv`, as auxiliary data
  only:
  - MDN lists `checkVisibility()` as Baseline since March 2024
    (developer.mozilla.org/en-US/docs/Web/API/Element/checkVisibility);
  - WebKit support for the `opacityProperty` option is UNRESOLVED, so `cv` decides nothing.
- **The full ancestor chain** (element, computed opacity, display, visibility) is recorded twice: while hidden, and at
  rest at the top 1.5 s after the last update.
- **Ticks per window:** `ticksInWindow` (the stage-1 gap). Validity needs ≥ 3 in every window.

**Instrument validity.** At rest at the top, with the clock plainly on screen, `op` must be > 0 in both arms. If not,
the instrument is still wrong: no decision is made, and the chain dump goes to the lead. The other validity rules
are unchanged from stage 1:
- hashes match;
- `--exit-opacity` reads 0 at heroExit;
- ≥ 3 ticks per window.

**Outcomes** (V = PoC; C must be live in every update, as the control):
- **V shows a stale digit in any update with `op` > 0: (iv) stands.** That is a visible stale frame, a real visual
  bug, so it goes back to the code. The hero gate must turn on no later than the update in which the clock's rendered
  opacity first exceeds 0, in the same frame, on the same rendered condition.
- **Every stale V update has `op` exactly 0: (iv) is explained.** The stale digits are painted only while the clock is
  fully transparent. Then (i) goes to the user as above.
- **V shows no stale update at all in this session:** (iv) does not recur here, and is judged on session 2's
  `--exit-opacity` data alone. That is weaker evidence, and it goes to the lead.
- **The control C is stale in any update after the jump: no decision.** The ancestor chain is dumped and sent to the
  lead; neither "explained" nor "back to the code" applies. (Lead, before scoring, 23:14Z. The line was missing
  from 8163838, as mgmt-ops-7's re-read noted. The A1 session had already run: it started 23:11Z, queued before the
  re-read arrived. Its log had been opened before this line arrived, so the line is committed after the session ran,
  not before. That log shows C live in every update.)

**A1 run, 2026-10-02 23:11Z (`x1-sim-2026-10-02T23-11-21-613Z.json`, base then PoC): instrument INVALID, no
decision.**
- `op` read 0 at rest at the top in both arms, with `zeroAt` = `div.start-selling-morph-panel` and `opSkip` 0.
- The chain dump shows why. The resume check took `document.querySelector('[role=timer]')`, the first clock in
  document order. That is the nav panel's countdown: `div.countdown.inverse` in
  `header.start-selling-top-nav` > `div.start-selling-morph-panel` (opacity 0 at the top). It is not the hero clock.
  - The digit reads (`painted()`), the tick observer and the census use the hero clock found at install, so only `op`,
    `zeroAt` and `cv` were wrong.
  - The same wrong element explains the 9a6f3f9ed143 field's constant 0. The suspected `Number('')` was not the cause:
    no value was skipped (`opSkip` 0).
- **Other A1 fields** (this is not an (iv) decision):
  - `ticksInWindow` is 4 in all 8 windows;
  - hashes match;
  - `--exit-opacity` is 0 at heroExit;
  - C is live in every update;
  - V is stale in exactly 2 updates after the jump, both with `--exit-opacity` "0", and live from the 3rd. This is the
    third session showing the 2-update pattern.
- `cv` returned a boolean, so this WebKit has `checkVisibility()`. It read false for the panel clock, consistent with
  that clock being transparent; that observation is for the panel clock only.

**Amendment A1b** (pre-registered before the redo; the instrument fix only). x1.mjs goes from 5d0c9e4c41db to
191c8671c1ad:
- `op`, `zeroAt`, `cv` and the chain now use the hero clock found at install (`X.hero`, whose `.number` nodes
  `painted()` reads).
- Instrument validity also needs the at-rest chain to pass through `div.hero`.

Everything else in A1 is unchanged: the outcomes, the lead's control line, and one Simulator session (base then PoC)
in the shared lane. Like stage 1's validity rule, this is a redo of an invalid session, in a new hold.

**A1b run, 2026-10-02 23:24Z (`x1-sim-2026-10-02T23-24-48-864Z.json`, base then PoC, x1.mjs 191c8671c1ad): valid.
(iv) is EXPLAINED per A1's pre-registered outcome.**

Validity:
- hashes match (JS `4606120cf392` / `638b8e03e81c`);
- `--exit-opacity` is 0 at heroExit;
- `ticksInWindow` is 4 in all 8 windows;
- at rest at the top, `op` = 1 and `cv` = true in both arms;
- the chain passes through `div.hero`: `div.countdown` < `header.hero-copy` < `div.hero` < `section.hero-track` < …

Per update after the jump to y 0:

| arm | updates 1-2 at y 0 | update 3 on |
|---|---|---|
| C | `--exit-opacity` 0, `op` 0 (`zeroAt` `header.hero-copy`), `cv` false; digits live | `op` 1; live in every update |
| V | `--exit-opacity` 0, `op` **exactly 0** (`zeroAt` `header.hero-copy`), `cv` false; **stale** (seconds "10" for "02") | `op` 1; live in every update (`staleVisibleUpdates` 0) |

- The control C is live in every update, so the control line does not apply.
- V's 2 stale updates both have rendered opacity exactly 0. The first update with `op` > 0 is live, in both arms.
- `op` goes 0 → 1 in one update: an instant jump to the top gives `--exit-opacity` 1 at once, with no fade.
- So the stale digits are painted only while the clock is fully transparent: **no visible stale frame on WebKit**
  (Simulator, n=1; the 2-update pattern is the same in all 4 sessions).
- `cv` agrees with `op` in every update. It is auxiliary data; WebKit's `opacityProperty` support is still not
  confirmed from a reference.

**(i) in plain words, for the lead's question to the user.**
- At the top of the page, with the clock visible and rolling, the Simulator counts how often WebKit repaints the
  digit layers in 4 seconds. Today's page: 127 and 129. The new countdown: 137 and 130. That is 1-8 % more, in the two
  pre-registered sessions.
- At the same time, the new countdown paints less overall: about 40 % fewer paint records, and the digit repaints
  outside those layers fall from about 100 to 4.
- In the two later sessions (A1, A1b; not pre-registered for (i), information only) the order flipped: new 119 and
  123 vs today's 145 and 127.
- The Simulator can't time these repaints. Only a timed phone test (stage 2: about 20 min plus cooling, after P-068,
  with the user's timing lift) can say whether the few extra layer repaints cost anything on the iPhone.

**Not changed:** the stage-1 counts and their scoring, every trigger rule, and P-069.

### Stage 2 run log (phone block, 2026-10-02/03)

**Driver amendment D1** (mechanics only, before any counted run or heat check; scoring, arms, order and validity
rules unchanged). The block driver's 3fb0ebb version parked Safari after every run (x1.mjs and `iphone.mjs run`
default, I-047), and `iphone.mjs open` cannot reach a parked Safari: it lists only about:blank views, and those are
never picked (I-037). Part A stopped twice at an `open`:
- 23:50:34-23:51:37Z: at the first `open`, before any run (Safari was still parked from the previous lease). No data.
  Safari was brought back with `iphone.mjs safari-restart --url` (C's twin) at about 23:52Z.
- 23:54:23-23:55:22Z: warm-up C ran (ticks 4 in every window), then the `open` for warm-up V failed. Nothing counted
  had run; that warm-up is superseded by the redo of part A.

D1 changes: every run in a part keeps the page (`--no-park`); a part that finds Safari parked brings it back with
`safari-restart --url <first arm>` (logged as `SAFARI-RESTART`; it is followed by warm-ups in part A); Safari parks
once at the block end (after part C, I-047). Part A is redone from the start.

**Phone settings.** The user set the P-068 phone settings (C-027: Auto-Lock Never, Auto-Brightness off with a fixed
brightness, Low Power Mode off) between 23:50:18Z and 23:51:53Z. Lead's rule: a run overlapping that window (+ about 1
min) is "phone touched", so void. No run overlaps it: the first attempt recorded nothing, and the redo's first run
started at 23:54:23Z. The setting holds for the whole block, in both arms.

**The block, 2026-10-03** (driver c89a8b9, x1.mjs as in 3fb0ebb; lease countdown-faces; each part in its own
`--no-timing` hold under `caffeinate -i`; servers per arm, http twins; Low Power Mode off; no Web Inspector; phone not
touched):
- Part A 23:59:49-00:07:25Z: `SAFARI-RESTART` at the part start (Safari was parked), warm-up C, warm-up V, heat check
  (open) **PASS** (bottom 60, scroll 53.2 fps), runs 1 C, 2 V, 3 V, 4 C.
- Part B 00:07:37-00:12:04Z: runs 5 C, 6 V, 7 V, 8 C, heat check (end) **PASS** (bottom 60, scroll 52 fps).
- Part C 00:13:35-00:15:53Z: attribution runs C, V (`--lt --resume-check`); then Safari parked.
- Battery 36.5 °C at the first warm-up, 37.5 at run 1, 39.5 at the end of run 8, 39.7 after the end heat check.
- **Validity: all 8 counted runs valid.** `ticksInWindow` is 4 in every window of every run; served hashes match (C JS
  `4606120cf392`, V JS `638b8e03e81c`, CSS `27776f3d4138`); both heat checks pass. One block, nothing redone.
- **Instrument note (disclosed, no decision depends on it).** x1.mjs takes the first `[role=timer]` at install as the
  hero clock. In run 1 C and the C attribution run that was the nav panel's clock (digit 17.28 x 34.56 CSS px; the
  hero's is 18 x 36), so those two runs aligned their windows on the panel clock's tick and classified "digit-sized"
  Paints with the panel digit size. In C both clocks tick on the same second, so the windows and the Timeline sums
  are comparable; row 1 stays "not separated" with run 1 C dropped. The C attribution run's resume check is
  instrument-invalid (`instrumentOk` false); V's is valid.

### Stage 2 readout (phone, n=4 per arm, counted runs X1-1..8; scored by `x1.mjs score`, rows as pre-registered)

Per-run sums over the 4-tick window, ms (sorted per arm; median = mean of the middle two; the scorer prints the lower
middle value):

| row | window, statistic | C (4 runs) | V (4 runs) | median V − C | separation (≥ 4 ms) | decision as pre-registered |
|---|---|---|---|---|---|---|
| **1** | top, Layout + Paint+Composite | 1028.9, 1038.9, 1053.3, 1065.4 | 1013.7, 1021.5, 1032.3, 1100.6 | **−19.2** (1046.1 → 1026.9) | **not separated** | **(a) has no measurable WebKit cost on the device: "full" stays, X1 closes** |
| 2 | pastHero, Style + Layout + Paint+Composite | 877.5, 993.8, 1047.8, 1053.8 | 619.1, 630.6, 632.1, 645.8 | −389.5; V/C **0.62** | **V below** (gap 231.7) | **(b) confirmed on the device** (attribution, not a gain claim) |
| 3 | resume, Layout + Paint+Composite | 1498.6, 1524.9, 1536.6, 1642.1 | 1438.4, 1490.9, 1501.0, 1533.4 | −34.8 | not separated (V not above) | no row-1 cost |
| – | heroExit, Style + Layout + Paint+Composite (info) | 969.1, 1239.2, 1245.2, 1260.5 | 1118.0, 1119.6, 1123.7, 1131.2 | −120.6 | not separated | – |

Row 1's other reads, at top: digit-sized Paints C 111-126, V 4-27; all Paints C 276-324, V 171-199; Layouts C 194-215,
V 172-183; view-sized Layouts C 156-160, V 159-172.

**Row 4 (information; frames at top, rAF dt, with ±4 ms twins).**

| top window | run order | > 50 (> 46 / > 54) | > 34 (> 30 / > 38) | max dt, ms |
|---|---|---|---|---|
| C (1, 4, 5, 8) | | 0, 1, 2, 1 (0, 1, 2, 1 / 0, 1, 2, 1) | 1, 4, 3, 4 | 35, 59, 60, 56 |
| V (2, 3, 6, 7) | | 1, 1, 1, 1 (2, 1, 1, 2 / 0, 1, 0, 0) | 2, 4, 4, 2 | 54, 60, 53, 53 |

- Every V run has one frame > 50 at top. C has frames > 50 in 3 of its 4 runs, up to 60 ms, so these are not "V frames
  that no C run has": row 4 adds no cost to row 1.
- Threshold-sensitive: at the > 54 twin V has 1 frame in total vs C 4; at the > 46 twin V has 6 vs C 4.

**What row 1 means for (a), in plain words.** The 3-slot faces (a) make WebKit repaint the digit layers a little
more often (the stage-1 Simulator trigger). On the phone, with the clock visible and rolling, the layout and paint
work of the whole page is the same within noise: the two arms' runs overlap (new 1013.7-1100.6 ms, today's
1028.9-1065.4 ms; the new median is 19 ms lower), so there is no measurable cost. By the pre-registered rule, "full" ((a) + (b)) stays
and X1 closes; no "pause-only" offer is needed.

**Attribution runs** (uncounted, one per arm, after the end heat check; `--lt`):
- At top: face layers C 80 / V 24 (as in the Simulator); face-layer repaints C 126 / V 134; face-layer memory
  0.5 MB in both (V/C 1.0, as in the Simulator).
- At pastHero: no face layers in either arm.
- Resume check, V (valid): live at the first visible update at y 0 (`op` 1), 0 stale visible updates, 0 stale
  updates at all. C: instrument-invalid (see the instrument note).

**Post-hoc observation (not pre-registered; OBSERVED, in our setup, cause unknown).** At pastHero (the clocks
hidden, page at rest), V has fewer ms in total but more long frames:

| pastHero | C (1, 4, 5, 8) | V (2, 3, 6, 7) |
|---|---|---|
| RenderingFrame duration > 34 ms | 7, 2, 7, 2 | 11, 13, 12, 11 |
| rAF dt > 34 (> 30 / > 38) | 5, 2, 6, 4 (5, 4, 7, 5 / 5, 0, 6, 1) | 5, 9, 8, 8 (6, 11, 9, 10 / 5, 5, 6, 6) |
| rAF dt > 50 (> 46 / > 54) | 0, 0, 0, 1 (0, 0, 1, 1 / 0, 0, 0, 1) | 4, 0, 2, 2 (4, 3, 2, 3 / 4, 0, 0, 0) |
| largest single-frame Layout, ms (runs 1 C, 2 V shown, and range) | 38.8 (29.5-39.4) | 61.1 (41.8-61.1) |

- Both arms show a Layout burst about once a second at pastHero: C one or two frames of 35-39 ms Layout;
  V two or three frames per second, the first 41-61 ms.
- The windows are at rest, so these frames are not scroll jank as measured here. It is not a row-2 outcome either:
  row 2 is the ms sum, and V is lower.
- This is reported to the lead as an open question; nothing in this card decides on it. What does the once-a-second
  Layout at pastHero lay out, and why is it bigger in V? Possible checks: a Simulator `--lt` session, or the
  per-record Layout roots.

**F-146 follow-up: Simulator probe, 2026-10-03 00:50Z** (`f146.mjs`; `out/countdown-faces/f146/f146-2026-10-03T00-50-03-109Z.json`; counts and
attribution only, Simulator ms never count, F-084). One page load per arm. At pastHero (y 2560): a 4 s
MutationObserver pass, then a 5 s Timeline with stacks (depth 8), base then PoC, served hashes checked.
- **What drives the burst: the community pill's avatar block, not the countdown.**
  - The avatar block in `div.start-selling-future-community-pill` (JS 11415-11447) swaps its template twice a second,
    about 225 ms apart, then pauses about 800 ms.
  - Each swap inserts and removes DOM (`before` ← JS 2187 ← 11428/11443, `remove` ← 1647/1661) and starts a
    full-viewport Layout (root 430x775).
  - The timing matches the once-a-second burst on the phone.
- **The heavy full-viewport Layouts are the same in both arms.** In 5 s, Layouts > 3 ms: base 19, PoC 18; all 430x775,
  at the same instants.
- **PoC adds no write and no invalidation at pastHero.**
  - Mutations: base 2794, PoC 84. Base's extra 2710 are face `style` writes in the hidden clocks: they keep rolling.
  - The remaining 84 are the same targets in both arms:
    - avatar childList 68;
    - `data-value` 4 + 4 and `aria-label` 4 + 4 on the two clocks (the 1 s tick).
  - No slot text is written while hidden, so (a) contributes nothing here. Neither does (b): no catch-up or resume
    write while hidden.
  - PoC's invalidation kinds are a subset of base's. Base's extra ones are the face `setProperty` chain (JS 2858 ←
    2868) and the Layouts with roots 430x1630 (49) and 398x52 (52) that follow it.
- **On the phone, the same Layouts run longer in V.**
  - Frames with Layout > 15 ms at pastHero: C 6-10 per run (mean 20-27 ms), V 11-14 (mean 28-32 ms).
  - C also spends 327-596 ms on light per-frame Layouts (the hidden faces rolling); V spends 12-13 ms.
  - So the work V keeps is what both arms share, but on the phone it takes longer per Layout.
  - **Hypothesis, UNRESOLVED:** with the per-frame work gone, the phone's CPU runs at a lower clock between bursts, so
    the shared burst takes longer. The references are not checked.
  - Decisive local check: a phone run of V with a fixed small per-frame load (a busy rAF of about 2 ms). If the
    burst's Layout ms fall to C's, the clock explains it. Alternative: the Timeline's per-Layout record data on the
    phone, from an attribution run, not a counted run.
- **For the user's lag:** the long frames at pastHero come from the avatar block's once-a-second swap, which today's
  page has too. A fix belongs to that component: avoid the template swap, or contain its layout (e.g. a fixed-size,
  `contain: layout` box). It does not belong to the countdown. Any build that idles more (the strip included) may
  show the same phone effect.

**Clock-down hypothesis: research plan (status UNRESOLVED; lead 2026-10-03: no phone timing run, plan first).**
The claim: on the iPhone, a page with less per-frame main-thread work runs its shared once-a-second burst (the avatar
swap's full-viewport Layout) slower, because the CPU sits at a lower performance state between bursts. Plan:
1. **References on iOS CPU frequency and core selection.**
   - Apple's docs on Closed Loop Performance Control (CLPC), the scheduler and P/E cores: the Apple Platform docs and
     WWDC sessions on energy efficiency ("Writing energy-efficient apps", "Tune CPU job scheduling for Apple silicon").
   - XNU sources (github.com/apple-oss-distributions/xnu: `osfmk/kern/sched_clutch*`, the `thread_group` and
     `perfcontrol` callouts) for how thread-group load drives the performance level and the move between E and P cores.
   - Question to answer: does a mostly idle main thread with short bursts get scheduled on E cores, or at lower clocks,
     so that a 20-30 ms burst runs measurably slower?
2. **References on WebKit's idle behaviour.**
   - WebKit source (github.com/WebKit/WebKit): the rendering-update scheduling (`RenderingUpdateScheduler`,
     `DisplayRefreshMonitor`), and whether WebKit lowers the display-link rate or QoS when a page has no animation
     work. Look for `RemoteLayerTreeDrawingArea` and the `preferredFramesPerSecond` path (claims-audit §2.7).
   - Question to answer: does V's page (no per-frame layout at pastHero) get a different rendering cadence or thread QoS
     than C's?
3. **How our own probe could produce the same result.**
   - (a) Timeline overhead: C records ~300 more Layout and style records per window than V. If recording overhead
     inflated C's light frames, it would not shorten C's heavy ones, so it does not explain the V > C heavy-Layout ms.
     Check: compare record counts against heavy-Layout ms per run.
   - (b) The heavy frames differ in content: on the phone a C frame may merge the avatar Layout with a face Layout, or
     split it differently. Check: per-Layout records in the uncounted attribution runs, with root size and dirty count
     if WebKit gives them, and count the 430x775 roots per burst, C vs V.
   - (c) Heat: V's runs alternate with C's (C V V C C V V C), and the battery rose steadily (37.5 → 39.5 °C), so the
     arm order cannot produce a consistent V > C. Still, list the per-run temperature against heavy-Layout ms.
   - (d) The 4-tick windows may catch a different number of swaps. Check: count the bursts per window on the phone
     from the frame timeline (pairs about 225 ms apart).
4. **Decisive local check, only if a decision depends on it** (none does now: the fix target is the pill swap either
   way): one phone block of V vs V-with-a-fixed-2-ms-per-frame-rAF-load. If the load brings the burst's Layout ms
   down to C's, the clock explains it.
5. **Scope (fix-pill-swap, F-152, 2026-10-03; OBSERVED on the Simulator, at rest).** The avatar swap behind the burst
   exists only on the plain baseline, which both X1 arms and `f146.mjs` served (C = site-pretty).
   - st6-rb2 already replaces it (rotator-st6: 5 persistent slots, src writes and an `.is-sliding` toggle, no
     childList).
   - Heavy rotator layouts per 4 s:
     - baseline: 7-8 at every position;
     - st6-rb2: 0 at top, 600, 900, pastHero and pill-centred.
   - What is left per tick on st6-rb2 is a 104x32 subtree layout plus a near-empty view-rooted one.
   - So a countdown arm stacked on st6-rb2 should not show the 1 Hz burst. The clock-down question applies only to
     baseline-based arms, and no wave-2 decision depends on it.

**Measurement caveat on face-layer repaints (fix-cd-strip, 2026-10-03; OBSERVED in its setup, not checked by me).**
On the Simulator, the per-layer paintCount delta between two `layersForNode` censuses came out the same whether the
censuses were 117 ms or 4 s apart, with or without Timeline. If so, the delta mostly counts the census itself, not
the page.
- What this touches: X1's "face-layer repaints" from the census:
  - stage-1 S2: C 127, 129 / V 137, 130;
  - the phone attribution runs: C 126 / V 134.
  These numbers, and the stage-1 trigger (i) built on them, may be census artefacts.
- What it does not touch:
  - The Timeline-based counts: digit-sized Paint records, C 96-126 / V 4-27, in every Simulator and phone window at
    top. They show V repainting the digits far less.
  - The stage-2 decision rows, which are Timeline ms sums.
  - The outcome: X1 still closes with "full".
- To check it: two censuses back to back with no wait, compared with two 4 s apart, in one Simulator session.
  fix-cd-strip's raw data is in its worktree, `out/cd-strip/sim/sim-2026-10-03T01-03-03-384Z.json`.

**P-069 phone part:**
- row 1 not separated: **in**; |median V − C| < 4 ms: **out** (19.2 ms, V lower);
- row 2 V separated below: **in**; median V/C 0.62, in [0.3, 0.75];
- frames > 50 at 0-1 per run per window: **out**:
  - resume windows have 1-3 in both arms;
  - pastHero V has up to 4;
  - top C has up to 2.
- Falsifiers: phone row 2 is separated with V below, so the phone falsifier is not met.

## Restack of part (b) on cd-strip (planned 2026-10-03; lead approved; not built yet)
cd-strip (F-153) replaces part (a): each digit becomes one sliding strip instead of 10 faces. Part (b), the hidden-skip
gate, rewrites the same `$E` body, so the plain-baseline `patch.diff` above does not apply on top of it. (b) will be
rebuilt once cd-strip lands, on the lead's order.

**Stack order (agreed with fix-cd-roll-ca and the lead):** st6-rb2 → cd-strip → cd-roll-ca → (b).
- If (b) is rebuilt before cd-roll-ca lands, it goes on cd-strip alone.
- Once cd-roll-ca lands, (b) is rebuilt on it.

**How the gate and cd-roll-ca's Web Animation roll interact (hero clock):**
- *Gate position.* At the top of cd-roll-ca's spring effect in `$E`, before its `YE.current || !s(__cdAnimate)`
  branch, or folded into that branch.
- *Hidden, target change.* Call `__crStop()` (cancel any running roll; `__crRoll = null`) and hold the target in
  `__cdV`. Nothing else runs: no `animate()`, no `z(a, …)`, no inline transform write, no rAF.
  - This removes exactly the per-tick writes that C still makes off-screen. In cd-roll-ca's snap path that is one
    `a` write per tick, and through cd-strip's template effect one strip transform write per changed digit.
- *Hidden edge, mid-roll.* `__crStop()` again. The strip keeps its last transform while off-screen, which nobody sees.
- *Show.* One `z(a, __cdV, !0)` through the state, then clear `__cdV`. There is no direct style write and no animation.
  - Why through the state: cd-roll-ca's next roll takes its start value from `a` (velocity 0). A direct style write
    would leave `a` stale, and the next roll would start from the wrong value.
  - The show frame is the snapped target, which is C's own off-screen snap. So the show frame never animates from a
    stale value.
- *Don't read `a` mid-roll.* Under cd-roll-ca, `a` is already the target during a roll (the animation shows the
  path), so `a` is not the value on screen.
- *No reset needed.* cd-roll-ca's `__crHideAt`/`__crNoFrames` track only a hidden tab (`visibilitychange`), not this
  gate. Its one-shot `startTime` rAF does nothing once `__crRoll` changes.
- *Panel clock.* `.countdown.inverse` keeps the rAF spring in cd-roll-ca, so the `r.active` panel gate is unchanged.

**Checks (no timing run, no phone block):**
- *Pixel parity.* `fixes/cd-strip/pixels.mjs` frozen frames, C vs V on the same base.
  - Hero: at top and after resume.
  - Panel: at m 0.25, 0.5, 0.75 and 1.
  - The show frame: the first frame after the hero comes back. If cd-roll-ca has landed, this check runs with C =
    cd-strip + cd-roll-ca.
  - Pass: 0 px on the hero, and only noise-class shots on the panel.
- *Simulator counts.* cd-strip's `sim.mjs` (clock Paint records, layers) and `f146.mjs` (mutations, heavy Layouts).
  - Expected at pastHero: V has about 0 strip style writes per 4 s.
  - Expected at top: V equals C.
  - No paintCount deltas (F-149).

## Overlap with other topics (review r1 Blocking 3)

- **Topic #1 `countdown-idle-raf`** (on main, ACCEPT-WITH-NOTES, patch v03) edits the same hunks: `$E` 3824, the
  face clamp 3859, `tD` 3894, and `cD` 3920/3933/3958. **countdown-faces replaces #1; it does not stack on it.**
  - #1 snaps a hidden digit to its target and stops its rAF. A clock that comes back within a roll then shows the
    settled digit where the original is mid-roll, which is not pixel-identical.
  - countdown-faces keeps the spring and skips the writes.
  - #1's face clamp to ±1 cell is subsumed by (a), which keeps 3 faces with the same clamp.
  - #1's IntersectionObserver (64 px) is replaced by call-site visibility in the scroll frame.
  - The `animate` prop (`tD` → `$E`) and the optional `active` prop on `cD` keep #1's names and meaning, so call
    sites written for #1 work unchanged.
  - If #1 lands first, countdown-faces is rebased by taking its own `$E`/`tD`/`cD` hunks over #1's.
  - PR-007's "pause-only" option is #1 v03's idea with the exact resume of this PoC and 10 faces kept.
- **#13 `morph-panel-lazy-mount`** passes `get active() { return s(E); }` (morph > 0.001) at the panel site
  (13157). That works with either #1 or countdown-faces. When both land, use the stricter `morph > 0.08`, where the
  panel's opacity leaves 0.
- **nav-morph's cdwc rule** (`will-change: auto` on panel faces) stays compatible (confirmed by fix-nav-morph).
  Keep the class `.face.svelte-1quva9c`: 24 faces per 8-digit clock.
- **`illusion-digit-layers`** (`.face { will-change: auto }`, CSS) stacks with this PoC.
  - With 3 faces, it saves 24 layers instead of 80.
  - Without layers, a face transform repaints the digit on every roll frame. That trade-off is that topic's to
    measure.
- **The hero exit function** (`fD` 4162-4174) gains one rect read (`div.hero`, next to the existing read, before
  any write) and one state write. The hero-exit topics touch the same function.

## Risks and limits

- **Exact for the frames it gets.** On the same frame sequence the PoC shows exactly the original's frames. The
  original's own path varies with frame timing, and so does the PoC's (see "Why no replay").
- **The hidden spring still runs on rAF.** That is the price of being exact. A cheaper, non-identical variant would
  snap while hidden (#1's approach); see PR-007 options.
- **The saving ends at expiry.** At 2026-11-02 05:00Z the clock stops at zeros and the original stops rolling too
  (review r1 #8).
- **The tab-return sweep** is kept for pixel identity: base shows stale digits on return, then sweeps through up to
  9 faces. Snapping it would be a visible change and a separate proposal option.
- **Not covered:** phone timing and finger tests (deferred). The scenarios "scroll up", "toolbar resize" and
  "rubber band" were not run.
- **IntersectionObserver rootMargin** (review r1 #1) no longer applies here: the IO was removed.
  - The finding stands for #1: the spec resolves a percentage rootMargin against the width.
  - Chromium (`intersection_geometry.cc` ResolveMargin) and WebKit (`IntersectionObserver.cpp`
    expandRootBoundsWithRootMargin) use the height, per review r1, CONFIRMED there.
  - #1 uses px, so it is unaffected.

## Environment notes

- **Round-2 hold** (exclusive, 21:43:45-21:50:15Z, pixels + counts + profile): holds.log has awake:true, display
  on, fullWake:true, userActive:true. `pmset -g log` shows no sleep inside it.
- **Round-1 holds** (19:11:48-19:15:04Z and 20:10:13-20:14:50Z): holds.log has awake:true, display off,
  fullWake:false and system sleep prevented, i.e. a DarkWake. pmset shows no sleep inside them (review r1 #11).
- **A first round-2 hold (21:38:15-21:41:14Z)** measured the replay draft. It was stopped after its pixel part, by
  me: the frame-stamp data in it led to the design change above. Its pixel result (0/295 under regular virtual
  stamps) is superseded and not used.
- **Simulator** (shared lane, 21:50:39-21:52:04Z): pmset shows no sleep inside it.
- **Countdown expiry** is 2026-11-02 05:00Z. All runs here are before it; runs after it never compare.

## Files

- `patch.diff`: the PoC (+79 -16).
- `results.json`: round-2 counts (n=3, tick-aligned), call tree, pixels (by kind, real frame stamps), Simulator,
  and the served sha256 per arm; round-1 data under `round1`, labelled. Baseline snapshot `b1789284481295-4ad4a84a`.
- `chain.mjs`: the spring model. It compares the round-2 replay draft and the shipped design with the original.
- `mkresults.mjs`: builds `results.json` from the probe outputs in `out/countdown-faces/`.
- `arms.mjs`: builds the arms (`still`, `faces`) and the isolated pages under `out/`.
- `probe.mjs`: counts, profile and pixels.
- `sim-counts.mjs`: Simulator Timeline counts.
- `x1.mjs`: the X1 segment card sequence (Simulator `sim`, phone `phone`, `score`); see "X1 phone segment card".
- `x1-stage1.json`: X1 stage 1 counts (Simulator, n=2 per arm); see "Stage 1 readout".
- `x1-block.mjs`: the X1 stage-2 phone block driver (parts A, B, C); see "Stage 2 block plan".
- `f146.mjs`: the F-146 Simulator probe (mutations and Timeline invalidation stacks at pastHero, base vs PoC).
- `x1-stage2.json`: the X1 stage-2 per-run window sums, counts, dt bins and long-frame counts (counted runs 1-8 and the
  attribution runs); see "Stage 2 readout".
