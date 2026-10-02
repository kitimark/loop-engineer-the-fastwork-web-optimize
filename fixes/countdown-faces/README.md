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
