# Fix: carousel-leaver (the avatar slider's leaving face on st6-rb2, moving like the baseline)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Owner:** `fix-carousel-leaver` (lead, 2026-10-03, user T-042 #10-#11: ruled a bug, OBSERVED in Chrome only).
**Status:** P-086 results in (2026-10-03). (1) Chrome hit; (1) Sim mixed (the registered scorer is weak in the Sim);
(2) **miss**: a paint-order difference in the first 50 ms of every slide, cause found; (3) hit; (4) Chrome hit, Sim carousel-rooted
just under its range. Build E is **not** offered as exact (T3).
**Now:** P-087 results in (2026-10-03). Build F (E + `z-index: 1` on the sliding leader) is pixel-exact in Chrome at
phone width but **not exact** overall:
- WebKit misses P1 at 356-2877 px. D1 traces this to st6-rb2's persistent slots: E is identical to F at rest, and S
  differs too. It is a st6-rb2 / best-build matter.
- WebKit costs about 2.4 more carousel layouts per slide.
- P5 misses on 8 quantities by up to 0.018 px.
Not landable on P-087; the route is the lead's.
**st6-rb2 follow-up (lead route on F-198, 2026-10-04): D2-D4 done (describes only). Nothing built.**
- The WebKit difference is not geometry: every face sits at the same sub-pixel position and scale at rest.
- It is image interpolation quality. Each slide puts the baseline into WebKit's page-wide Low-quality mode
  (ImageQualityController, CONFIRMED in source; that it explains our numbers is OBSERVED, decisively checked). st6-rb2
  never enters it.
- At quiet rest, what remains is 523 px at max 81 from st6's no-flip slot values.
- Options went to the lead (section "D4 result"). The exact option conflicts with st6's saving.
**Base:** st6-rb2 (`fixes/st6-rb2/patch.diff`, JS `7bf7c4657d21`, CSS `f523598b2a24`). Deliverables: `patch.diff`
(baseline-relative) and `delta-vs-st6rb2.diff` (for wi-best-build).
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only (`.is-sliding` rules and `@keyframes avatars-exit`).

## The bug

The avatar slider (`#people .start-selling-avatars.is-carousel`, 104x32, `overflow: hidden`) slides one face out
every ~1.02 s (JS `2.DyWL8TcE.js` ~L11346-11365, 220 ms slide).

- **Baseline:** a keyed `{#if}` swaps a 4-img block and a 5-img block. The leaver (`.is-exit`) runs
  `@keyframes avatars-exit` (CSS 2889-2904): width, flex-basis and margin-right shrink (32 → 0, -8 → 0),
  border-width 1 → 0, scale 1 → 0.35, opacity 1 → 0. It is a narrowing bordered ellipse in place. The followers move by
  reflow. At the slide's end the leaver's box stays about 2 px wide, so the followers sit 2 px right of their rest
  place until the swap, which snaps them back (de-pixel-rule's probe, `research/pixel-tolerance/README.md` §6).
- **st6-rb2** (layout-animations + rotator-st6): 5 persistent slots, `.is-sliding`, the leaver keeps its 32 px box,
  is cropped by `clip-path: ellipse()` and translates -16 px; the followers run `avatars-shift` (translate -24 px).
  The crop cuts the leaver's border ring at the sides, the followers land on sub-pixel positions (±1 device px vs
  layout, `fixes/layout-animations/README.md` "Visual equivalence") and the 2 px end offset and its snap are gone.

## Build E (this fix)

CSS only, on st6-rb2. The JS (5 persistent slots, `src` updated in place, `.is-sliding` toggled) is unchanged.

- `.is-sliding img.st5-lead` runs the baseline's own `avatars-exit` keyframes again (width, flex-basis, margin-right,
  border-width, scale), except that the 0 % opacity is 0.999 (st6's no-flip rest value; the baseline's is 1).
- The followers get no animation: they move by reflow, as in the baseline.
- `.st5-next` runs only `avatars-pop` (no `avatars-shift`).
- Unchanged from st6-rb2: the 5 slots and their layers (`will-change`), the no-flip rest values
  (`transform: scale(1)`, `opacity: 0.999`), the paused-scene coupling selector.

So E keeps st6-rb2's DOM saving (no img re-creation per tick) and gives back the per-frame layout of the slide.

| build | `nodes/2.DyWL8TcE.js` | `assets/2.gBuqKVzi.css` |
|---|---|---|
| baseline (A) | `4606120cf392` | `27776f3d4138` |
| st6-rb2 (S) | `7bf7c4657d21` | `f523598b2a24` |
| **E** | `7bf7c4657d21` (= st6-rb2) | `9c12648e24e1` |

Arms are served from immutable copies (`chmod a-w`) in `<scratchpad>/carousel-leaver/snap/{S,E1}` with `--no-cache`;
every hold prints the served hashes first (`served.txt`) and a mismatch voids the hold.

## P-086 registration (written before any data; id from mgmt-ops-10)

**Probes** (committed with this section; sha256, first 12):

| file | sha | what |
|---|---|---|
| `probe/hold.sh` | `eb3b5b00e30d` | Chrome hold: 3 servers (A, S snapshot, E snapshot), served hashes, then `clp.mjs` over A S E A2 E2 |
| `probe/clp.mjs` | `8c8558b0b706` | Chrome headless 430x932 DPR 3 mobile + touch: modes series, counts, pixels, paused |
| `probe/simclp.mjs` | `b63aa5821294` | Simulator (`sim.mjs session --functional`): Timeline Layout roots per slide + the same rAF series |
| `probe/score.mjs` | `fdbcae16946d` | scorer for (1) and (3): series aligned by slide start, max abs deltas per role and quantity |

Runs: Chrome hold 1 = `hold.sh series,counts <out>/h1`; hold 2 = `hold.sh pixels,paused <out>/h2` (each a shared-lane
`--weight probe --max-seconds 300` hold). Simulator: one shared-lane `--weight simulator` hold,
`simclp.mjs <out>/sim base,S=<snap>/S,E=<snap>/E1,base2,E2=<snap>/E1`. Position: `#future-heading` top at 0.5 of the
viewport (the carousel in view, scene `active`).

**A/A.** Baseline against itself on a second page load in the same hold (A vs A2; Sim: base vs base2), measured
exactly like the arms. E's own A/A (E vs E2) is reported too. The baseline's A/A is the floor for every
"matches" claim below; it is quoted with its spread (max over all matched frames, and per t for pixels).

**(1) Rect/opacity/scale series, Chrome and Sim** (`score.mjs ref other`, matched frames: same frame index after the
slide start, |Δt| ≤ 2 ms, both sliding or both at rest; the swap race frame (13 vs 14) is listed, not scored).
Roles: L leaver, F1-F3 followers, N entering face; quantities xr (left minus carousel left), w (rect width), o, s (scale).
- Point: E vs A max |Δ| per role/quantity equals the A vs A2 max (both ≤ 0.1 px in xr/w, ≤ 0.003 in o/s).
  Interval: E-vs-A max ≤ A-vs-A2 max + 0.05 px (xr, w) / + 0.003 (o, s), every role. E's followers keep the end
  offset: slot-1 xr in the last sliding frame is rest - 22 (± 0.1), and the swap frame snaps by -2 (± 0.1), as A.
- Positive control: S vs A L.w and L.xr max > 5 px, no end offset (S end -24, snap 0).
- Falsifier: any E-vs-A role/quantity max beyond the interval, or a missing 2 px end offset. P(hit) Chrome 0.85, Sim 0.7.

**(2) Frozen mid-slide crops, Chrome** (`clp.mjs` pixels mode). The first arm (A) catches a slide and names its
leaver's full src pathname (F-176); every later arm waits for the slide with that same leaver, so all arms show the
same 5 faces. At the slide's first rAF every carousel animation is paused and the rotator's 220 ms timer is held; then
`currentTime` = t for t in 0, 17, 33, 50, 67, 83, 100, 133, 167, 200, 220 ms, two rAFs, one shot each; then the timer
is released (swap) and shots at +2 rAF (`post`) and +300 ms (`post300`).
- Crop: the carousel's border box ± 4 CSS px (112x40 CSS px, 336x120 device px), document coordinates
  (`scrollX/Y` added, P14), `captureBeyondViewport: false`; a shot with no colour range is flagged `blank`.
- Metric per pair and t: pixels with any channel difference > 8 (`n8`), > 0 (`any`), and the max difference.
- Point: A vs A2 n8 = 0 at every t (A/A spread reported as min-max over t). E vs A n8 = 0 at every t and at post.
  Interval: E-vs-A n8 ≤ the A-vs-A2 n8 at the same t + 0 (no px allowance beyond the A/A). `any` may differ by the
  0.999 opacity (≤ 1 level), reported, not scored.
- Positive control: S vs A n8 > the A/A at t = 17-200 (the border ring and follower snapping).
- Falsifier: E-vs-A n8 above the A/A at any t. P(hit) 0.75.

**(3) Scene paused** (`clp.mjs` paused mode, never tested before): on the next slide after the pixel step (same faces
in every arm), 3 frames in, scroll the section 1.6 viewports past its bottom (scene `paused`), wait 1.45 s, scroll back,
sample 2.5 s, shot `pz` right after the return series.
- Point: scene reads `paused` away in every arm; on return E's series equals A's (score.mjs: no state mismatch beyond
  the A/A, same rest geometry); `pz` crop E vs A n8 within A vs A2. Falsifier: any of these out. P(hit) 0.85.

**(4) Cost against st6-rb2** (per slide, Chrome trace window 5.1 s + MutationObserver; Sim Timeline window 6 s).
- DOM writes per tick (MutationObserver attributes and childList on the carousel): E = S exactly (same JS). P 0.95.
- Chrome `Layout` events per slide: E - S = 13, interval [8, 16] (one per animation frame of the 220 ms slide).
  `UpdateLayoutTree` per slide E - S in [-3, +3]. `Paint` per slide E ≥ S. P 0.8.
- Sim, defined before looking: **view-rooted** = a Layout record whose root quad is ≥ 400 px wide and ≥ innerHeight - 2
  tall, or has no root (the document); **carousel-rooted** = root 104x32. E carousel-rooted per slide in [8, 16];
  view-rooted per slide E - S ≤ 0.3. P 0.5 (the background full-layout state of `fixes/layout-containment/README.md`
  may carry carousel layouts to the view).

**Decisions (if X then Y).**
- E has extra layouts by construction, so exact and cheap conflict in any case. I report to the lead with the numbers
  either way; I don't pick on my own.
- (1)-(3) hit and Sim view-rooted E - S ≤ 0.3 per slide: E is offered as the exact build; its cost is carousel-bounded
  layouts (Chrome count, Sim count). The lead decides whether that needs a user proposal.
- (1)-(3) hit and view-rooted E - S > 0.3 per slide: exact vs cheap goes to the lead as a user proposal with numbers
  (E exact at that cost, st6-rb2 cheap at its pixel difference). No further build without the lead's OK.
- (1) or (2) miss for E: find the cause (data first), report it; any new build is a new registration.
- (3) miss: report the paused-case difference with its cause; E is not offered until it is explained.
- A void hold (served hash mismatch, blank shots, a failed catch) is re-run once; a second void goes to the lead.

## Probe repairs and voids (written before re-running; ops rulings by mgmt-ops-10)

| file | registered | now | why |
|---|---|---|---|
| `probe/clp.mjs` | `8c8558b0b706` | see the commit | (a) shots: whole viewport, cropped in Node (no CDP clip); (b) position: the carousel itself at 0.5 vh |
| `probe/simclp.mjs` | `b63aa5821294` | see the commit | (a) Timeline failure recorded and retried once; (b) position as clp.mjs |
| `probe/shape.mjs` | (new, **post hoc**) | | phase-free description: compares at equal leaver scale; decides nothing |
| `probe/leavtab.mjs` | (new, **post hoc**) | | prints the leaver per frame for one slide; decides nothing |
| `probe/pairs.mjs` | (new) | | runs the registered `score.mjs` over pairs and prints one line each |

- **Hold 2 (pixels, paused): VOID.** Every crop was blank, including the positive control A vs S (0 px).
- **Sim run 1: VOID.** The 2nd arm's `Timeline.start` timed out after 15 s and killed the run.
- **Hold 3 (pixels, paused, after repair (a)): VOID, no data.** I ran it before committing clp.mjs, which was a
  procedural miss. It crashed at its first shot with the crop outside the viewport capture. That crash showed the real
  cause of hold 2's blank crops. The registered position, "`#future-heading` top at 0.5 of the viewport (the carousel
  in view)", is wrong: at that position the carousel's top is at about 1634 CSS px in a 932 px view. That puts it about
  700 px **below** the viewport, still inside the scene's active band (the `dE` IntersectionObserver uses rootMargin
  100%). A CDP clip of an off-screen area with `captureBeyondViewport: false` is blank. The clip rect was not the cause,
  as mgmt-ops-10 was first told.
- **What this does to the data already taken.** Chrome hold 1 (series, counts) and Sim run 2 sampled an **off-screen**
  carousel. Rects, opacity, scale and Layout and DOM-write counts are still taken from the live animation. Paint counts
  are not about the carousel at all, and the Sim view-rooted layout counts may differ in view. These runs are reported
  as "off-screen" data only. Every check is re-run with repair (b), and the in-view runs decide.
- **Amendment (lead OK, ops PASS with conditions): position = the carousel centred at 0.5 vh, border box fully in view.**
  Void rules added: an arm whose carousel is not in view is VOID in every mode. In Chrome, series and counts record
  `pos.inView`, and pixel and `pz` shots throw VOID when the crop falls outside the viewport capture. In the Sim,
  `simclp.mjs` checks this in code. A Sim arm whose Timeline fails is VOID: there is no retry, because a re-opened tab
  would not be centred. Holds 4a and 4b ran on clp.mjs `37b9e94812fa` before ops' conditions reached me. Their
  recorded `inView` is true for every arm, and no crop fell outside the capture.
- The crop region (border box ± 4 CSS px), the n8 metric, the t grid and every interval stay as registered. Only the
  capture method and the scroll position change. Hold 3 was the one re-run the rules allow, so the re-runs with (b)
  wait for the lead's OK (a second void goes to the lead).

## Results (P-086, measured 2026-10-03, in-view runs decide)

**Runs.** Chrome hold 4a (series and counts) and hold 4b (pixels and paused) ran on clp.mjs `37b9e94812fa`, hold.sh
`eb3b5b00e30d`. Sim run 3 ran on simclp.mjs `56c422d5cfbc` (ada8fb0).
- Served hashes, the same in both Chrome holds (`out/carousel-leaver/h4a/served.txt` = `h4b/served.txt`):
  A `4606120cf392`/`27776f3d4138`, S `7bf7c4657d21`/`f523598b2a24`, E `7bf7c4657d21`/`9c12648e24e1` (JS/CSS). Sim run 3
  checked every arm's served hash in code; all matched (`out/carousel-leaver/sim3/simclp.json`).
- Snapshots re-hashed after the runs: `snap/S` CSS `f523598b2a24`, JS `7bf7c4657d21`; `snap/E1` CSS `9c12648e24e1`, JS
  `7bf7c4657d21`. The overlay CSS is `9c12648e24e1`.
- In view, every arm: Chrome carousel top 449.9 / bottom 481.9 CSS px in a 932 px view. Every crop sits at
  [162, 1337, 337x121] device px, inside the capture, and no shot is blank. Sim: no arm VOID, scroll y 1730.
- Off-screen data (hold 1, Sim run 2) is not used for any verdict below. It agrees with these results wherever both have
  numbers.
- Raw files: `out/carousel-leaver/{h4a,h4b,sim3}/` (gitignored).

### (1) Rect series: score.mjs as registered

**Chrome (hold 4a): HIT.**
- Every E-vs-A max is inside A-vs-A2 max + 0.05:
  - L.w 10.247 vs 10.212; L.xr 1.733 vs 1.730; F1-F3.xr 5.078 vs 5.063;
  - N.xr 9.229 vs 9.204; N.w 8.301 vs 8.283; L.o 0.2122 vs 0.2109; N.o 0.3987 vs 0.3982.
- A-vs-E2 is inside too.
- The point prediction (A/A ≤ 0.1 px) missed, on the A side. In A's first slide the leaver's animation started one frame
  late (frame 1, t 17 ms: L.w 32 vs 21.8 in A2). That one frame sets every A-side max.
- Without A's first-slide frame: A2-vs-E max is L.w 0.035, F1.xr 0.016, N.xr 0.027. E-vs-E2 is 0.046 / 0.031 / 0.051.
- End offset as the baseline in every slide: slot 1 ends at rest - 22 and snaps -2 at the swap (A, A2, E, E2: 6/6
  slides). S ends at -23.98 to -24, snap 0 to -0.02 (positive control).
- Swap-race slides (listed, not scored): A~A2 1, A~E 3, A~E2 1, A2~E 2, E~E2 2, A~S 4. Each arm has 14 or 15 frames per
  slide.

**Sim (run 3), registered scorer: E HIT, E2 MISS.**
- The scorer matches only 6-10 of about 50 sliding frames: the Sim's rAF lands at irregular times and slides have 7-12
  frames. That makes the A/A itself L.w 14.8, N.w 14.9 and F1.xr 5.72 px.
- base~E: every max equals the A/A max (inside).
- base~E2: F1-F3.xr 7.313 > 5.719 + 0.05, which is the registered falsifier for E2. E~E2 shows the same 7.313, so it is one
  E2 frame with a phase offset.
- Lesson: frame-index matching is uninformative in the Simulator. A Sim interval should be set at equal animation
  progress, not at equal frame index.
- End offset: E -23.344 to -23.391 per slide (snap -0.61 to -0.66). base -23.344 to -23.36. S -23.98 to -24.

**Post hoc, describes only (shape.mjs, compared at equal leaver scale; medians, then max):**

| pair | L.w | visible x1 | F1.xr | max L.w | max F1.xr |
|---|---|---|---|---|---|
| Sim base~base2 (A/A) | 0.104 | 0.124 | 0.113 | 3.50 | 3.99 |
| Sim base~E | 0.068 | 0.096 | 0.080 | 4.72 | 4.86 |
| Sim base~E2 | 0.176 | 0.198 | 0.106 | 4.79 | 5.04 |
| Sim base~S | 11.06 | 0.275 | 0.312 | 12.26 | 2.54 |
| Chrome (hold 1, off-screen) A~E | 0 | 0 | 0 | 0.006 | 0.011 |

- In both engines S's visible outline (clip ellipse x scale) matches the baseline's narrowing ellipse: medians ≤ 0.3 px.
  What differs is the ring (cut at the sides in S), the end offset and snap, and the late sliver.
- WebKit snaps the leaver's border to 0.67 then 0.33 px. Its floor is 0.66 px (2 x 0.33), where Chrome's is 2 px, so the
  WebKit end offset is about 0.66 px. E follows the baseline in both engines.

### (2) Frozen crops, Chrome hold 4b: MISS for E (cause found)

n8 / any / max per t (device px; crop 337x121):

| t (ms) | A~A2 | E~E2 | A~E | A~E2 | A~S (control) |
|---|---|---|---|---|---|
| 0 | 0/4416/5 | 0/2692/4 | **1083**/3762/229 | **1083**/6395/229 | 1083/2295/229 |
| 17 | 0/4413/5 | 0/2692/4 | **477**/4698/173 | **477** | 6249/20574/177 |
| 33 | 0 | 0 | **213**/3968/128 | **213** | 7787/21812/178 |
| 50 | 0 | 0 | **78**/3893/95 | **78** | 3163/17792/95 |
| 67, 83, 100, 133, 167, 200, 220 | 0 | 0 | 0 (max 5-6) | 0 | 3963, 5051, 1134, 11567, 18682, 19725, 0 |
| post | 0 | 0 | 0 | 0 | 0 |
| post300 | 25084 (A2 already in its next slide) | 0 | 0 | 0 | 0 |

- The positive control holds: A~S n8 is above the A/A at every t from 17 to 200, so the probe is not blind.
- **Cause (data, n8box.mjs, post hoc).** Every E-vs-A n8 pixel lies in the 8 CSS px lens where the leaver overlaps its
  right neighbour (CSS columns 28-35 at t = 0, then 23-27 and 15-16 as the leaver narrows). In A the leaver is drawn **on
  top of** the first follower during the slide. In E (and in S) the follower is drawn on top. The difference fades out
  with the leaver's opacity and is 0 from 67 ms on.
- **Mechanism.**
  - Baseline: while it animates, the leaver has transform ≠ none and opacity, so it is a stacking context at stack level
    0. It paints after the non-stacking followers. CSS Color 4 §3.3: when z-index applies (it does for flex items), auto
    is treated as 0; otherwise the element is painted with the positioned elements of stack level 0.
  - st6: the rest values (transform: scale(1), opacity: 0.999) and `will-change` make **every** slot a stacking context
    at level 0, so they paint in tree order and the follower wins.
  - The data is OBSERVED in Chrome. The paint-order rule is CONFIRMED by CSS Color 4 §3.3
    (https://drafts.csswg.org/css-color-4/, "Transparency: the opacity property"). That an *animated* transform or
    opacity creates the stacking context rests on Web Animations 1 §5.6 "Side effects of animation"; I did not retrieve
    that text, so that part stays UNRESOLVED by reference and OBSERVED by data. WebKit is not yet checked with pixels.
- st6-rb2 (S) has the same paint-order difference, in addition to its crop and translate.
- **E's five tier numbers against the baseline (Chrome):**
  - largest shade: 229 of 255 (t = 0);
  - share of the screen beyond the A/A: 1083 / 3,606,840 device px = 0.030 % at t = 0 (0.013 %, 0.006 %, 0.002 % at
    17, 33, 50 ms);
  - area: 120 CSS px² at t = 0, then 53, 24 and 9;
  - edge or fill: fill (the overlap lens, about 8 x 20 CSS px: which face is on top);
  - static or moving: moving (the first 50 ms of every slide, every 1.02 s), 0 at rest.
  - So E itself is **T3** (memory illusion-must-be-pixel-identical, PR-010 wide): max shade 229 is beyond T2's fill
    limit of 64, and the difference is moving. E could only ship through a user proposal (ops result read, 757a59e).

### (3) Scene paused, Chrome hold 4b: HIT

- The scene reads `paused` at both away samples in all five arms.
- Return series (score.mjs on `back-*.json`, 2 slides, 28 matched frames, no state mismatch):
  - A~E max L.w 0.032, F1.xr 0.031, L.o 0.0011, against A~A2 0.032 / 0.031 / 0.0007;
  - end offset -22/-2 in both.
- `pz` crops: A~E n8 0, A~A2 202 (the A/A spread, a phase difference after the return), E~E2 202.

### (4) Cost

**Chrome, hold 4a, 5.1 s trace window.**

| arm | slides | Layout | UpdateLayoutTree | Paint | MO class / src / childList |
|---|---|---|---|---|---|
| A | 5 | 166 | 307 | 851 | 0 / 0 / 75+75 |
| A2 | 5 | 147 | 306 | 802 | 0 / 0 / 75+75 |
| S | 6 | 12 | 306 | 667 | 11 / 30 / 0 |
| E | 5 | 68 | 306 | 948 | 10 / 25 / 0 |
| E2 | 5 | 69 | 306 | 901 | 10 / 25 / 0 |

- DOM writes per slide: E = S (5 src + 2 class, no childList). HIT.
- Layout per slide: E 13.6-13.8, S 2.0, so E - S = 11.6-11.8, inside [8, 16]. HIT.
- Paint per slide: E 180-190, S 111, so E ≥ S. HIT.
- UpdateLayoutTree per slide: E 61.2, S 51.0, so E - S = +10.2, outside the registered [-3, +3]. MISS by the registered
  arithmetic. UpdateLayoutTree runs once per frame (306 in every arm's window). Dividing it by the slide count (5 vs 6 in
  the window) produces the gap; the totals are equal. The registration's per-slide unit was wrong for a per-frame event.
  Reported as a miss.

**Sim, run 3, 6 s Timeline.** Counts only; Sim ms never count.

| arm | slides | frames | view-rooted | carousel-rooted | per slide view / car |
|---|---|---|---|---|---|
| base | 5 | 292 | 234 | 65 | 46.8 / 13.0 |
| base2 | 5 | 297 | 231 | 62 | 46.2 / 12.4 |
| S | 5 | 310 | 236 | 9 | 47.2 / 1.8 |
| E | 6 | 293 | 221 | 45 | 36.8 / 7.5 |
| E2 | 5 | 283 | 225 | 37 | 45.0 / 7.4 |

- View-rooted per slide E - S = -10.4 / -2.2, inside ≤ 0.3. HIT. The -10.4 is partly the slide count (E had 6 slides
  in its window, S 5): the window totals are E 221 / E2 225 against S 236, and per frame E 0.75 / E2 0.80 against S
  0.76 (ops result read, 757a59e). View-rooted layouts are frame-driven, so per slide overstates the gap.
- View-rooted layouts (430x775) come in 75-80 % of all frames in **every** arm: base 0.80, S 0.76, E 0.75, E2 0.80 per
  frame. Something other than the carousel drives them (OBSERVED, cause not traced here). S has no extra view layouts
  tied to the leaver's motion: its per-frame rate is the lowest but one, so there are no S extras to place.
- Carousel-rooted per slide: E 7.5 and 7.4, just **under** the registered [8, 16]. MISS. The baseline is 12.4-13.0 at
  7-12 frames per slide. OBSERVED, cause unknown: E's carousel layouts may be folded into that frame's view-rooted layout.

### Verdict and decision (as registered)

- (2) missed for E, so E is not offered as exact. The cause is found and is a paint-order difference that st6's
  persistent stacking contexts bring in (S has it too). It is not in the leaver's motion: rects, opacity, scale and end
  offset match the baseline in both engines.
- The next build is a new registration ("any new build is a new registration"). Candidate F = E +
  `.start-selling-avatars.is-carousel.is-sliding img.st5-lead { z-index: 1 }`: the leaver paints above its neighbour only
  while it slides. z-index applies to flex items, and all slots are already stacking contexts. Expected cost: no layout;
  one restack per slide start and end, checked in the same counts. I don't build or measure F without the lead's OK and
  a P-id.
- Exact vs cheap, with numbers (Chrome, per slide): E adds about 11.6 Layouts per slide over st6-rb2 and the same DOM
  writes. In the Sim it adds about 7.4 carousel-rooted layouts per slide and no view-rooted layouts. Both are inside or
  near the registered bounds. It still gives back the per-frame layout st6 removed, and the lead decides whether that
  needs a user proposal.

## P-087 registration: build F (written before F is served or measured; id from mgmt-ops-10, lead decision "(a)")

**Build F** = E + one declaration, `z-index: 1`, on `.start-selling-avatars.is-carousel.is-sliding img.st5-lead`
(with a comment). JS unchanged (st6-rb2's).

| build | `nodes/2.DyWL8TcE.js` | `assets/2.gBuqKVzi.css` | snapshot |
|---|---|---|---|
| **F** | `7bf7c4657d21` (= st6-rb2) | `a984ae7b7715` | `<scratchpad>/carousel-leaver/snap/F1` (`chmod a-w`) |

The CSS hash is of the text this section specifies. F1 was built by copying `snap/E1` and replacing the CSS with the
overlay's; it was not served before this commit.

**Why it should work.** Flex items honour `z-index` with `position: static`. CSS Flexbox 1 §4.3 "Flex Item Z-Ordering"
says "z-index values other than auto create a stacking context even if position is static". That is CONFIRMED
(https://www.w3.org/TR/css-flexbox-1/#painting). While the slide runs, the leaver therefore paints at stack level 1 of
its nearest ancestor stacking context, after every level-0 item there, follower 1 included. When the slide ends
(`.is-sliding` removed at the swap) it goes back to level 0.

**The risk P2 checks.** Level 1 also lifts the leaver over anything else at level 0 in that context that overlaps it
and that the baseline paints over it: the scene overlay, the next slot, or an ancestor's later sibling. The carousel's
`overflow: hidden` clips the leaver to the carousel box, so only nodes that overlap that box can be affected.

**Probes** (committed with this section; sha256, first 12):

| file | sha | what |
|---|---|---|
| `probe/hold87.sh` | `d87b8f1c3d43` | Chrome hold: 4 servers (A, S, E1, F1 snapshots), served hashes, then `clp.mjs` or `pord.mjs` over the given arms; deletes its Chrome profiles; optional 5th argument `view` (C4/C5) |
| `probe/pord.mjs` | `492e7980cb65` | Chrome paint order: DOMSnapshot paint-order relations + forced-opaque lens crops, per t (below); `--view` and the `VARIANT` line (C5); repair 1 (below): variant judged after centring (was `b81ea4a401d0`) |
| `probe/simcrop.mjs` | `26f548f2dcfe` | WebKit (Simulator) frozen crops: `Page.snapshotRect`, natural and forced-opaque lens, per t |
| `probe/png.mjs` | `52d21ec3f1d5` | PNG decode/encode/crop and the pair metric (n8, any, max), the same as clp.mjs's |
| `probe/clp.mjs` | `07120dcca1ef` | P-086's (`37b9e94812fa`) plus `--view WxHxDPR[d]` only (default `430x932x3`, the P-086 setting; `d` = desktop: `mobile: false`, no touch emulation) |
| `probe/simclp.mjs` | `56c422d5cfbc` | unchanged from P-086 (Sim Timeline layout roots + rAF series) |
| `probe/score.mjs` | `fdbcae16946d` | unchanged (registered scorer, same frame index after slide start) |
| `probe/shape.mjs` | `10520d556eba` | P-086's post-hoc equal-scale scorer, **registered here** as P3's Sim decider |
| `probe/pairs.mjs` | `8a246b42bcf6` | unchanged (score.mjs over pairs) |

**Runs** (each a shared-lane hold, `--max-seconds 300`; position as the P-086 amendment, the carousel centred at 0.5 vh):

| run | command | arms | for |
|---|---|---|---|
| C1 | `hold87.sh clp series,counts <out>/c1` (probe) | A, E, F, E2, F2 | P3 Chrome, P4 Chrome |
| C2 | `hold87.sh clp pixels,paused <out>/c2` (probe) | A, S, F, A2, F2 | P1 Chrome, P5 |
| C3 | `hold87.sh pord - <out>/c3` (probe) | A, S, F, A2, F2 | P2 Chrome |
| W1 | `sim.mjs session --functional -- simcrop.mjs <out>/w1` (simulator) | base, S, F, base2, F2 | P1 WebKit, P2 WebKit |
| W2 | `sim.mjs session --functional -- simclp.mjs <out>/w2` (simulator) | base, E, F, E2, F2 | P3 Sim, P4 Sim |
| C4 | `hold87.sh clp pixels <out>/c4 … 1440x900x2d` (probe) | A, S, F, A2, F2 | P1 Chrome, desktop |
| C5 | `hold87.sh pord - <out>/c5 … 1440x900x2d` (probe) | A, S, F, A2, F2 | P2 Chrome, desktop |
| W3 | `sim.mjs --device fw-ipad session --functional -- simcrop.mjs <out>/w3` (simulator) | base, S, F, base2, F2 | P1/P2 WebKit, wide viewport |

`<out>` = `out/carousel-leaver/p87`. Raw files stay there (gitignored).

**Probe details fixed by the smoke runs** (baseline-only arms, A/A2 and base/base2; neither F, E nor S was served):
- *Smoke 1* found two probe faults, both repaired before this commit:
  - Chrome `pord`: hero columns in the header and a card in `#people` (paint order 200-264) overlap the carousel box
    and were listed as "over the leaver", though they cannot be seen there.
    - Repair: a page-side `VIS` filter. It keeps an element only if it can paint inside the carousel box: effective
      opacity > 0, `visibility: visible`, and a box that is still non-empty after clipping by every ancestor with
      `overflow` ≠ visible or `contain: paint` (up to a fixed ancestor).
    - **`rel` (VIS-filtered) decides P2-Chrome.** `relAll` (every overlapping node) is reported next to it and decides
      nothing.
  - WebKit `simcrop`: `Page.snapshotRect` was not repeatable right after a change. The A/A n8 reached 3435 px, and one
      lens shot had every face missing (OBSERVED in our setup; cause unknown: async image decode or low-quality
      interpolation are candidates).
    - Repair: **settled snapshots**. Snapshots are taken 250 ms apart until two in a row are pixel-identical, at most 8
      tries, and the settled one is kept. An arm with a shot that never settles is VOID.
  - Both probes **re-hold after the swap**: they run the held callbacks, then set `__hold = true` again. `post` and
    `post300` therefore show the swapped state, not the next slide. Settling makes WebKit's `post300` later than 300
    ms. These two points compare F against the baseline arm only, not against a time. clp.mjs is unchanged from P-086,
    so its C2 `post300` can still be A/A-limited.
- *Smoke 2* (the committed probes):
  - Chrome: A~A2 `rel` differ 0 at every t and post, and lens n8 0 at every t.
    - VIS keeps 18 of 28 overlapping nodes.
    - In A, `overLead` is empty at every t and post: nothing visible paints over the baseline's leaver. `F1 | L` = -1:
      follower 1 paints under the leaver.
    - The sticky `SECTION[2]` subtree (z-index 1-4, paint order 8-22) overlaps the box but paints under the leaver
      (170).
  - WebKit: base~base2 nat n8 0 at all 13 points (0-220, post, post300) and lens n8 0 at all 11 t. Every shot settled
    in 2-3 tries. Both arms caught the same leaver at the same rect (339x123 device px), with the same leaver state at
    t 0 and 220.

**Void rules** (P-086's, carried over):
- Served hashes are checked first. A mismatch with the tables voids the hold (`served.txt`; simcrop and simclp check in
  code).
- `inView` false voids that arm in every mode. A crop outside the capture throws VOID.
- A Sim arm whose Timeline fails (W2) is VOID, with no retry.
- A blank crop is VOID: clp voids its pixel step, simcrop and pord void the arm.
- A probe crash voids the run.
- A void arm that a prediction needs (its A/A pair, F, or the positive control) voids that prediction's run. Each run may
  be re-run once; a second void goes to the lead.

**Interval named for every prediction.** "The slide" = the frozen t grid 0, 17, 33, 50, 67, 83, 100, 133, 167, 200,
220 ms from the slide's first rAF, plus `post` (two rAFs after the swap) and `post300` (300 ms later). For series it is
every sliding frame plus the swap frame.

### P1: pixels 0 px against the baseline at every t, Chrome and WebKit

- **Chrome** (C2, clp pixels mode as registered for P-086; crop = carousel border box ± 4 CSS px from a full-viewport
  capture; metric n8 = pixels with any channel difference > 8).
  - Point: F~A n8 = 0 and F2~A n8 = 0 at every t, post and post300, with A~A2 n8 = 0.
  - Interval: F~A n8 ≤ A~A2 n8 at the same t, with no allowance. A t where A~A2 > 0 is listed as "A/A-limited" (P-086
    post300: A2 was already in its next slide).
  - Positive control: S~A n8 > 0 at t = 0 (paint order) and at 17-200 (P-086).
  - Falsifier: F~A or F2~A n8 above A~A2 at any t. P(hit) 0.8.
- **WebKit** (W1, simcrop `nat-*`).
  - Crop: `Page.snapshotRect` of the carousel border box ± 4 CSS px (viewport coordinates, rounded out to whole CSS
    px), at the Simulator's device scale. Each arm computes its own rect, so the rects are compared too.
  - WebKit paints this in software (`snapshotFrameRect`) through the same RenderLayer z-order lists that order its
    composited layers. That the composited screen shows the same order is an inference, UNRESOLVED; a screen capture
    would settle it. `backdrop-filter` is not drawn, in every arm alike (`research/architecture/safari-inspector-probing.md`
    §0.3).
  - Freeze: as clp.mjs, with the setTimeout wrapper installed after load (the rotator calls `window.setTimeout` at run
    time, JS ~L11575).
  - A/A = base vs base2: a second page load in the same Sim hold, taken the same way.
  - Point: F~base n8 = 0 and F2~base n8 = 0 at every t, post and post300, with base~base2 n8 = 0.
  - Interval and A/A-limited rule as Chrome.
  - Positive control: S~base n8 > 0 at some t in 0-200.
  - Falsifier: F~base or F2~base above the A/A at any t. P(hit) 0.6 (WebKit's snapshot of paused animations is untried
    here, and its border snaps to 0.67/0.33 px).

- **A/A-limited rule, mechanical** (addendum from the ops second read, committed before any F data):
  - A point (t 0-220, or post) whose A/A n8 is above 0, in either engine, is **undecided**. It is never a hit.
  - The run containing that point gets one re-run. If the point is still A/A-limited, it goes to the lead, and F is
    not offered as exact at that point.
  - The one pre-declared exception is Chrome clp `post300` (P-086: A2 was already in its next slide). It is reported
    as A/A-limited and does not block the T1 offer, provided WebKit `post300` has A/A 0 and F~base 0. The offer names
    this exception.

### P2: paint order over the whole slide (follower, scene overlay, next slot, anything overlapping)

- **Chrome, decides for Chrome** (C3, `pord.mjs` relations).
  - At every t and post, `DOMSnapshot.captureSnapshot({ includePaintOrder: true })` gives each layout node a global
    paint-order index.
  - Nodes taken: every node whose box overlaps the carousel's border box, whose own opacity is not 0, and that passes
    the page-side `VIS` filter (above; it decides through `rel`, while `relAll` without VIS is only reported). Carousel imgs
    are keyed by role (L, F1-F3, N while the slide runs; P0-P4 after it). Other nodes are keyed by DOM path.
  - For every pair with at least one carousel img, whose two boxes overlap each other, the relation is
    sign(paint order a - paint order b).
  - Point: F~A and F2~A have 0 differing relations at every t and post. `overLead` (the nodes painted over the leaver)
    is the same set in F as in A.
  - A/A: A~A2 must have 0 differing relations. If it doesn't, the method is noisy and P2-Chrome is VOID (to the lead).
  - Positive control: S~A differs at t = 0 on `F1 | L` (S: follower over the leaver, A: under).
  - Falsifier: any relation in F that differs from A. P(hit) 0.85.
- **WebKit, decides for WebKit; Chrome cross-check** (W1 and C3 `lens-*` crops).
  - At every t the leaver is forced opaque (inline `opacity: 0.999 !important`, which outranks the animation per CSS
    Cascade 5 §6.1, CONFIRMED: https://drafts.csswg.org/css-cascade-5/#cascade-origin). The leaver's whole area then
    shows at full strength in every lens where it overlaps something. The crop is taken, then the inline value is
    removed.
  - The same forcing in every arm. In the baseline the leaver is already a stacking context there (its running
    transform), so the forcing changes no stacking.
  - Point: F~base lens n8 = 0 at every t (WebKit), F~A lens n8 = 0 (Chrome). The A/A (base~base2, A~A2) lens n8 = 0.
  - Positive control: S~base (S~A) lens n8 > 0 at t = 0.
  - Falsifier: F above the A/A at any t. P(hit) WebKit 0.65, Chrome 0.85.

### P3: motion unchanged from E (L, F1-F3, N: xr, w, o, s)

- **Chrome** (C1, `pairs.mjs` / score.mjs, the registered P-086 scorer, ref E).
  - Point: F~E max |Δ| ≤ 0.05 px (xr, w) and ≤ 0.003 (o, s) for every role.
  - Interval: F~E max ≤ max(E~E2, F~F2) max + 0.05 px / + 0.003.
  - A slide whose first frame shows the leaver not yet animating in one arm only (P-086's late start: L.w = 32 at frame
    1) is listed and dropped from the max, mechanically.
  - End offset: slot 1 ends at rest - 22 and snaps -2 at the swap in F, as in A and E.
  - Falsifier: any role or quantity outside the interval, or a missing end offset. P(hit) 0.9.
- **Sim** (W2 series, `shape.mjs` at equal leaver scale, ref E; the frame-index scorer is uninformative in the Sim,
  P-086).
  - Point/interval: F~E medians of L.w, V.x0, V.x1 and F1.xr ≤ E~E2 median + 0.05 px. Maxima ≤ max(E~E2, F~F2) max
    + 0.5 px (rAF phase).
  - End offset per slide within E's range ± 0.05 px.
  - Falsifier: any of these out. P(hit) 0.8.

### P4: cost no more than E

The P-086 lesson decides the units. Slide-driven events are normalised per slide inside each arm's window: slides = the
MutationObserver slide starts in that window. Frame-driven events are compared as window totals over equal windows, or
per frame. Totals are always quoted next to the per-slide numbers.
- **Chrome** (C1 counts, 5.1 s trace window, ref E and E2).
  - `Layout` per slide: F within [min(E, E2) - 1, max(E, E2) + 1].
  - DOM writes per slide: F = E exactly (same JS).
  - `UpdateLayoutTree` (frame-driven), window totals: F within [min(E, E2) - 3, max(E, E2) + 3].
  - `Paint` per slide: F within [min(E, E2) - 10, max(E, E2) + 10]. P-086's E/E2 spread was about 10 per slide; a
    restack at the slide's start and end may add one paint each.
  - P(hit) 0.8.
- **Sim** (W2, 6 s Timeline, ref E and E2).
  - Carousel-rooted layouts per slide: F within [min(E, E2) - 1, max(E, E2) + 1].
  - View-rooted layouts (frame-driven), per frame: F ≤ max(E, E2) + 0.03. Totals and per-slide numbers are quoted.
  - P(hit) 0.6.

### P5: scene paused (C2 paused mode, as P-086 (3))

The scene reads `paused` away in every arm. The return series F~A is within A~A2 (score.mjs). The `pz` crop F~A n8 ≤
A~A2. P(hit) 0.85.

### P6: desktop width (addendum from the lead via the ops second read; PR-010 checks phone plus one desktop width)

The carousel rules (`2.gBuqKVzi.css` L2856-2887) and the `is-carousel` markup (JS L11257) sit outside every media
query, so the sliding variant is expected at desktop width too. The checks below confirm it per arm.

- **Widths.**
  - Chrome: 1440x900, DPR 2, `mobile: false`, no touch (`--view 1440x900x2d`). 1440x900 is the desktop width other fixes
    used; DPR 2 crops finer than DPR 1.
  - WebKit: the Simulator's `fw-ipad` (iPad Pro 13, portrait), Safari's default desktop-class viewport. Its CSS width
    is whatever Safari gives (expected about 1032) and is recorded from `geo2.vw`. simcrop is unchanged; the session's
    `--device` reaches its `sim.mjs open` through `FW_SIM_DEVICE`.
- **Runs.** C4 (clp `pixels`, natural crops), C5 (pord, paint order + lens) and W3 (simcrop, natural + lens). All three
  use the same t grid, post and post300, and the arms A/base, S, F, A2/base2, F2.
- **Variant check first.**
  - Chrome: pord logs one `VARIANT` line per arm (exists, display, visibility, w, h, img count, class, vw, vh, dpr).
    WebKit: simcrop's `geo2` (vw, carousel box).
  - If the carousel is missing, not displayed or 0-size in both baseline arms, the pass is replaced by that line,
    recorded in the results. If both baseline arms catch no slide in 25 s (the rotator off at this width), the same
    applies.
  - In any other case a missing slide or carousel is VOID under the rules above.
- **P6a (P1 at desktop).** Point: F~A and F2~A natural n8 = 0 at every t, post and post300 (Chrome C4). The same for
  F~base and F2~base (WebKit W3). The A/A (A~A2, base~base2) is 0. P(hit) Chrome 0.8, WebKit 0.6.
- **P6b (P2 at desktop).** Point: F~A `rel` differs 0 at every t and post, and `overLead` F = A (C5). Lens n8 F~A = 0
  (C5) and F~base = 0 (W3). The A/A is 0. P(hit) Chrome 0.85, WebKit 0.65.
- **Positive control** as P1 and P2: S differs from the baseline at t = 0, at this width.
- **Rules.** The A/A-limited rule (P1 addendum) applies unchanged: a point with A/A > 0 is undecided, gets one re-run,
  then goes to the lead. The only exception is Chrome clp `post300`, and it needs W3 `post300` with A/A 0 and F~base 0.
  The void rules apply unchanged (served hashes in `served.txt`, inView, blank or unsettled crops, a crash; one re-run,
  then the lead).
- **Decision.** P6 counts with P1 and P2. A desktop miss with a phone hit means F is not offered as exact; I report
  the desktop numbers to the lead as in "Chrome hits, WebKit misses".

### Decisions (if X then Y)

- **P1-P5 all hit:** F is offered as the exact build, T1: 0 px against the baseline in Chrome and WebKit, A/A 0.
  - I regenerate `patch.diff` (baseline-relative: st6-rb2 + F) and `delta-vs-st6rb2.diff` (F's CSS on st6-rb2), run
    `npm run test:unit`, commit, and send the lead a land request; a fix-reviewer follows.
  - **F landing also removes the same paint-order difference from st6-rb2 and best-build.** carousel-leaver joins
    best-build as one `COMPONENTS` `delta:` line (`fixes/best-build/README.md` "Adding one"), so best-build gets the fix
    through that line. st6-rb2 on its own keeps the difference (F-191).
- **P1 miss with P2 hit:** the remaining difference is not paint order. I find its cause (data first, `n8box.mjs`) and
  report it to the lead. Any new build needs a new P-id.
- **P2 miss** (F lifts the leaver over something the baseline paints over it): F is not offered. I report which node, at
  which t and in which engine. A repair (for example `isolation: isolate` on the carousel, so level 1 stays inside it)
  is a new registration.
- **P3 miss:** I report the motion difference; F is not offered until it is explained.
- **P4 miss with P1-P3 and P5 hit:** F is exact but costs more than E. It goes to the lead with the numbers (exact vs
  cheap); the lead decides whether that becomes a user proposal.
- **Chrome hits, WebKit misses** (P1 or P2): F is not offered as exact. I report the WebKit difference with its five
  tier numbers (PR-010 wide) to the lead.
- **Void:** the rules above, one re-run, then the lead.

## P-087 probe repair 1 (written before re-running C3/C5)

- **C3 and C5 are VOID, a probe fault.** Both ran (18:30:49-18:32:21Z and 18:33:39-18:35:21Z, no sleep inside either
  span), but every arm exited `NOT-VARIANT` before any slide was caught, so they produced no data.
  - Cause: pord's `VARIANT` check ran before the centring. Until `#people`'s section is scrolled into view, the card
    is hidden by `.start-selling-future:not(.is-visible) > .start-selling-future-card { visibility: hidden }` (CSS
    L2393-2394). That holds at 430 and at 1440 alike, and in every arm, the baseline included.
  - The P6 variant rule was written for a carousel that is hidden *at this width*. It caught the scroll-reveal instead.
- **Repair** (pord.mjs `492e7980cb65`, replacing `b81ea4a401d0`):
  - Before the centring, only the carousel element must exist; centring needs it. This is logged as `variant0`.
  - The full check (display, visibility, size) runs after the centring, next to `inView`.
  - Nothing else changed. The P2 method, VIS, the lens and the relations are byte-identical.
- C3 and C5 are re-run once each with the repaired probe (the void rule's one re-run). A second void goes to the lead.
- Data already taken (C1, C2, C4, W1-W3) does not use pord and is unaffected.

## P-087 diagnostic D1 (describes only; written before it runs; lead OK)

**Why.** W1 (WebKit, phone width) missed P1, as recorded. F~base n8 is 2877 at t 0, 905-1263 at 17-100, 356 at rest, max
shade 157. base~base2 and F~F2 are 0. The forced-opaque lens equals the natural crop, so the difference is not paint
order. The n8 pixels are column-stripe resampling patterns on whole faces, plus a whole-face edge outline on the moving
follower (OBSERVED in our setup, cause unknown).

**Question.** Is this difference inherited from st6-rb2's persistent slots (will-change, `scale(1)`, `opacity .999`), or
does F's `z-index` cause it?

**Runs.** Each is a Simulator shared hold (`fw-sim`, phone width, simcrop `26f548f2dcfe` unchanged), with a pmset check
after it.
- D1a: base, E, F, E2, base2.
- D1b: base, S, base2, S2.
Raw files go to `out/carousel-leaver/p87/d1a` and `d1b`. The split keeps each hold under 300 s, and each hold has its own
base A/A.

**Load-state caveat** (de-breakpoints, rm1440 in Chrome, OBSERVED, cause UNRESOLVED): image sharpness there depends on
when the images arrive relative to the first raster. It varied between loads of the same build, and both builds could
give the identical picture. My data already shows signs of this:
- W3 (iPad) F~F2 at rest is 687.
- C4 (Chrome 1440) A~A2 is 151-2718, on one face.
D1 therefore gives every arm it reads two loads (base/base2, E/E2, S/S2; F once, with F2 in W1). D1b adds S2 for this.
A per-arm difference counts as a build trait only if both loads of each arm agree. Otherwise it is reported as
load-state.

**Read-out** (presentation only, `probe/tier.mjs` `9aadede8e7c7`):
- Rows: E~base, F~base, E2~base (D1a) and S~base (D1b), each next to its hold's base~base2.
- Points: t 0, one mid-slide point (t 100) and at rest (post).
- The five numbers per row:
  - largest shade (max channel difference);
  - share of the Sim viewport's device px with n8 beyond the A/A;
  - CSS px² per face: n8 px / DPR², faces split by the 24 CSS px slot pitch from the leaver's left;
  - edge or fill: n8 within 1.5 CSS px of a face circle counts as edge, otherwise fill;
  - static (at rest) or moving (mid-slide only).

**Reading** (decides nothing for P-087, which is recorded as not exact):
- If E~base ≈ F~base at rest, and S~base at rest is above 0 in the same face-resampling pattern (beyond S's known
  end-offset difference), then the WebKit difference is inherited from st6-rb2. It becomes a st6-rb2 / best-build matter,
  and the lead decides the route.
- If E~base is 0 and F~base is not, F's `z-index` causes it.

## Results (P-087, measured 2026-10-03 18:26-19:01Z)

**Verdict: F is not exact.**
- Chrome at phone width is pixel-exact: P1 is 0 px at every point, with the A/A 0.
- WebKit misses P1. The difference is not F's: build E carries it identically, so it comes with st6-rb2's persistent
  slots (D1).
- WebKit costs about 2.4 more carousel-rooted layouts per slide (P4 Sim miss).
- P5 misses on 8 quantities by up to 0.018 px (ops and lead ruling).
- F cannot land on this ticket.

**Run record.** Every hold exited 0.
- Spans: C1 18:26:38-18:28:15, C2 18:28:22-18:30:43, W1 18:35:27-18:40:44, W2 18:40:50-18:46:29, W3 18:46:35-18:51:48.
- Re-runs: C3 18:52:05-18:53:11, C5 18:53:17-18:54:19, C4 18:54:25-18:55:29.
- Diagnostic: D1a 18:55:42-18:58:24, D1b 18:58:30-19:01:37.
- The first C3/C5 (18:30:49, 18:33:39) are void: probe repair 1.
- The last pmset sleep or dark-wake entries are 17:41:47Z and 17:57:12Z, before every span (I-098), so no hold overlaps a
  sleep. The log is in `out/carousel-leaver/p87/blocklog.txt`.
- Served hashes match the tables in every Chrome hold (`c*/served.txt`) and in the Sim arms (in code): A
  `4606120cf392`/`27776f3d4138`, S `7bf7c4657d21`/`f523598b2a24`, E `7bf7c4657d21`/`9c12648e24e1`, F
  `7bf7c4657d21`/`a984ae7b7715`.
- Every arm was in view, caught a slide, and had no blank or unsettled shot.

| prediction | result |
|---|---|
| P1 Chrome phone (C2) | **HIT.** F~A and F2~A n8 0 at all 13 points; A~A2 0 everywhere (post300 too); A~S 1043-18366 at t 0-200 |
| P1 WebKit phone (W1) | **MISS.** F~base n8 2877 (t 0), 905-1263 (17-100), 356 (133-167), 0 (200), 356 (220/post/post300); max shade 141-157; base~base2 0, F~F2 0. *Measured under the settle loop (D4): base was in its slide-time Low-quality state from t 17 on* |
| P2 Chrome phone (C3 re-run) | **MISS by the registered rule**; A~A2 0. See below |
| P2 WebKit lens (W1) | **MISS.** lens n8 = natural n8 at every t, A/A 0. *Measured under the settle loop (D4)* |
| P3 Chrome (C1) | **HIT.** F~E max L.w 0.064, N.xr 0.072, N.w 0.051, all else ≤ 0.047 px / 0.0016, inside E~E2/F~F2 + 0.05; end offset -22/-2 in all 6 slides of every arm |
| P3 Sim (W2, shape.mjs) | **HIT as registered (F~E); noise-limited: F~F2 and F2~E exceed the median limits** (ops ruling: the decider is F~E; F2 enters only the maxima clause through max(E~E2, F~F2); F2~E is not a registered quantity). Medians F~E L.w 0.030, V.x0 0.023, V.x1 0.057, F1.xr 0.059 against limits 0.120/0.084/0.162/0.144. F2~E 0.294/0.162/0.568/0.597. F~F2 medians 0.158/0.103/0.099/0.144. Maxima and end offsets inside |
| P4 Chrome (C1) | **HIT.** 5 slides each. Layout E 68, E2 68, F 68, F2 69. UpdateLayoutTree 306 in all. Paint per slide 192/178/192/182. Writes per slide 2 class + 5 src in all |
| P4 Sim (W2) | **MISS.** Carousel-rooted layouts per slide E 6.0, E2 6.2, F 8.4, F2 8.4 (limit 5.0-7.2). View-rooted per frame F 0.78/0.77 ≤ 0.83 (hit). Totals: layouts E 265/265, F 274/275; paints E 217/220, F 272/277 |
| P5 (C2) | **MISS on 8 quantities by up to 0.018 px.** Scene `paused` away in all arms; pz F~A 0 = A~A2 0. Return series A~F vs A~A2: L.w 10.248 vs 10.232, L.o 0.2123 vs 0.2113, L.s 0.1375 vs 0.1374, F1/F2/F3.xr 5.078 vs 5.063, N.xr 9.230 vs 9.212, N.w 8.303 vs 8.297, N.s 0.2595 vs 0.2593 (ops re-score identical). A~F2 inside or equal on every quantity |
| P6a Chrome 1440 (C4 + re-run) | **Undecided, to the lead.** A/A-limited at every point (A~A2 2715 at t 0, then 136-183, max shade 23-96; the re-run repeats it). A~F 1024-1809 (max 57-67) |
| P6a WebKit iPad (W3, 1032 CSS px, DPR 2) | **MISS** against base~base2 0. F~base 470-2012; F's own load-to-load spread F~F2 248-1440 (687 at rest). *Measured under the settle loop (D4)* |
| P6b Chrome 1440 (C5 re-run) | **MISS by the registered rule** (the same 5/7 relations as at phone width); A~A2 rel 0; lens A/A-limited |

**P2 Chrome in detail.** No relation that involves the leaver differs, and `overLead` is empty in A and F at every t.
- The 5 differing pairs (7 at post) are the container | F1-F3 and F1 | F2 | F3: A = 0 (the same paint-order index) and
  F = -1.
  - In A the followers and the carousel are not stacking contexts, so DOMSnapshot gives them one shared index (169).
  - In F every st6 slot is a stacking context with its own index, in tree order. That is the same visual order as
    the baseline's tree order.
- There is no sign flip (+1 vs -1) anywhere, and C2's pixels are 0. By the registered falsifier ("any relation in F that
  differs from A"), it is still a miss.

**P5 note** (post hoc, OBSERVED, does not change the verdict). In A's return series the leaver starts one frame late:
slide 1 still has L.w 32 at t 16, while A2 and A's slide 2 start at t 17. This fits F-175 (a CSS animation started by a
class change begins at frame 1 or 2). It sets every A-side maximum: A2~F is 0.034 and A2~F2 0.025.

### D1 (describes only): the WebKit difference comes with st6-rb2's slots, not with F

Sim fw-sim, phone width, DPR 3. Each arm loaded twice: base~base2, E~E2 and S~S2 are 0 at rest. The five numbers come from
`tier.mjs`; share = n8 beyond the A/A as a share of the Sim viewport's 2,999,250 device px.

| row | t 0 (moving) | t 100 (moving) | post (static, at rest) |
|---|---|---|---|
| E~base | max 231, 0.118 %, fill | max 179, 0.064 %, fill | **max 179, 0.029 % (862 px), fill**: 80/2/12/1 CSS px² per face (under the settle loop, D4) |
| F~base | max 168, 0.086 %, fill | = E~base | **= E~base (862 px, identical)** |
| S~base | max 230, 0.052 %, fill (49 % edge) | max 156, 0.135 %, fill | **max 157, 0.110 % (3303 px), fill**: 133/97/46/91 CSS px² per face (the settle loop holds base at Low quality here; at quiet rest S~base is 523 px, max 81, D4) |

- **E~F**: 1069, 492, 206, 59 and 17 px at t 0-67, then 0. This is F's z-index acting in WebKit, in the overlap lens,
  during the leaver's opaque part. At t 0 it reduces the difference from the baseline: 3541 → 2572 px.
- **Where E~base lies at rest.** One face's image content is outlined as if shifted by a sub-pixel amount; another face
  shows vertical column stripes, a resampling-phase pattern. E's layout geometry equals the baseline's (P-086), so this is
  how the persistent slot layers (will-change, `scale(1)`, `opacity .999`) draw the face images, compared with the
  baseline's plain imgs at fractional x (58.266 + 24k CSS px). OBSERVED, cause unknown.
- **Reading.** st6-rb2, and therefore best-build, differs from the baseline in WebKit even at rest: about 862 px, max
  shade 179, fill, static. That is beyond T2's fill limit of 64, so it is T3. F neither adds nor removes it. The route is
  the lead's (a st6-rb2 follow-up or a user proposal).
- **Desktop and iPad** (DPR 2) look different again:
  - Two loads of one build differ: iPad F~F2 687 at rest; Chrome 1440 A~A2 up to 2715, on one face.
  - That fits de-breakpoints' load-state finding (image arrival vs first raster, OBSERVED, UNRESOLVED).
  - Chrome 1440 at rest: A~S 1689 and A~F 1616, while S~F is 39. st6-rb2 differs there too, and F adds nothing.

## st6-rb2 follow-up, D2 (describes only; written before it runs)

**Route (lead, 2026-10-04, on F-198):** a bounded st6-rb2 follow-up first; a user proposal only if it fails.
- st6-rb2's landing pixel check was Chrome-only ("0 px on the avatar imgs", `fixes/st6-rb2/README.md` rows 57-60).
  PR-010's Chrome-and-Simulator rule came after it.
- Step 1 is this diagnostic (describes only). Step 2 is build G = st6-rb2 + the smallest change that puts each slot at
  the baseline's exact position and phase, with F's lines on top (G+F). G registers with mgmt-ops-10 as P-090 before
  any scoring.
- Stop condition: two build attempts. If neither reaches T2, this is written up and the lead takes st6-rb2's avatar
  difference to the user as a proposal.
- F stays parked until then.

**Question.** In WebKit at phone width, what puts st6-rb2's faces at a different sub-pixel phase or scale from the
baseline's, at rest and mid-slide?

**Probe** `probe/simgeo.mjs` (sha `65c07d103536`). One shared-lane Simulator hold (weight simulator, `--max-seconds
300`), `sim.mjs session --functional`, fw-sim (430 CSS px, DPR 3). Arms in order: base, S (`snap/S`, st6-rb2), F
(`snap/F1`), base2, S2. Served hashes are checked as in simcrop (a mismatch voids the arm). The carousel is centred at
0.5 vh as in D1, so the geometry is D1's.

States per arm:
- `rest0`: between slides, before any hold.
- `t0`, `t100`, `t220`: the caught slide (same pathname as the first arm), animations paused at t.
- `post`, `post300`: after the swap, at rest.

Each state is one synchronous read, so it reflects a single frame of style and layout:
- **env:** dpr, inner size, scroll, visualViewport.
- **carousel:** its rect, and its device-px origin with the fractional part.
- **ancestors** up to `<html>`: rect origin, transform, translate, opacity, filter, will-change, contain, isolation.
- **each img:** class, src path, natural size, rect at 5 decimals, device-px origin (left x dpr, top x dpr) with
  fractional parts, drawn content size in device px (rect minus borders, x dpr), and the computed transform,
  translate, scale, opacity, width, flex-basis, margins, border width, object-fit/-position, will-change and
  image-rendering, plus `decoding`/`loading`.

After the states, `LayerTree.layersForNode(#people)` lists every composited layer (bounds, compositedBounds,
paintCount). `reasonsForCompositingLayer` runs for the carousel and each img that has a layer.

**Readout** (in this order, written to the README as a table per face, base vs S vs F at `rest0`, `t100` and `post`):
1. Layout position: rect left/top (CSS px, and device px with the fractional part). Mid-slide positions are compared
   after removing the translate and scale each build applies on purpose: base's box from its width and margin
   keyframes, S's from translate and scale about the centre.
2. Scale: rect size, computed transform/scale, and drawn content size against natural size.
3. Ancestors: any transform, opacity, filter or will-change that differs between base and S.
4. Layers: which faces and ancestors are composited in base and in S, their reasons, and the fractional part of
   `compositedBounds`/`bounds`.
5. A/A: base~base2 and S~S2 for every value above (equal expected; any difference is a load-state effect and is
   reported).

**What it decides** (describes only; the data decides nothing about landing):
- **Fractional offset or scale:** a face's position differs between base and S/F by more than 0.001 CSS px at the
  same state, or its device-px fraction or drawn size differs. Then G targets exactly that quantity (scope item 2).
- **Geometry equal, layering differs:** every position, size and fraction agrees within 0.001 CSS px, and only the
  compositing differs (layers, reasons, ancestor opacity/filter/transform). Then the cause is in how WebKit paints the
  slot layers, not where they are. G would have to change the layering (st6's own mechanism), which is outside scope
  item 2's wording. In that case the result and a proposed G go to the lead before anything is built.
- Either reading stays OBSERVED in our setup until a WebKit source or doc reference confirms the painting path
  (CLAUDE.md "Platform claims"). The research plan for that reference goes to the lead with the result.

### D2 result (2026-10-03 19:15:42-19:18:10Z, one hold, exit 0)

The last pmset sleep or dark-wake entry was at 17:57:12Z, so the hold did not overlap a sleep. Served hashes: base
`4606120cf392`/`27776f3d4138`, S `7bf7c4657d21`/`f523598b2a24`, F `7bf7c4657d21`/`a984ae7b7715`. Every arm caught the
same slide (the video-editor face leaving). Raw data: `out/carousel-leaver/d2/simgeo.json`.

**At rest the geometry is identical.** This holds in base, S and F, at `rest0`, `post` and `post300`, with A/A equal:

| face slot | rect left (CSS px) | device px origin (x, y) | fraction (x / y) | size | drawn / natural |
|---|---|---|---|---|---|
| 1-4 | 58.26563 + 24k | 174.79688 + 72k, 1114.17188 | 0.79688 / 0.17188 | 32 x 32 | 90 x 90 device px from 480 x 480 (one face 640 x 640) |

- S/F's slot transform is `matrix(1, 0, 0, 1, 0, 0)` and base's is `none`. Neither has a translate, so the scale is 1
  in both.
- So no fractional offset and no scale tells S from base at rest.

**What differs at rest is the painting path, not the geometry:**
- **Layers.** Base has no layer for any face (12 layers under `#people`). S and F have one composited layer per slot
  (17 layers). Their reasons are `willChange`, plus `stacking` for slots 2-5. The layers' `bounds` are 33 x 33 at whole
  page px (x 58, 82, 106, 130), and `compositedBounds` are 32 x 32.
- **The card ancestor.** `.start-selling-future-card` has opacity 0.999 and `filter: blur(0px)` in S and F (st6-rb2's
  `re-keep-op` rest values), while base has 1 and `none`. Every face is painted inside it. Its transform is
  `matrix(1, 0, 0, 1, 0, 0)` in both.
- **The slots themselves** have opacity 0.999 in S and F, and 1 in base.

**Mid-slide** (t 100), the followers differ by **0.00687 CSS px** (0.021 device px):
- Base places them by reflow at 62.23438 + 24k, i.e. LayoutUnit-quantized (the leaver's width is 5.28125, a multiple of
  1/64).
- S places them by a continuous translate (-20.038113 px) at 62.22751 + 24k.
- At t 0 and t 220 they agree.
- The leaver differs by design (base narrows its box; S scales its full box). That is E/F's own matter.

**Side observation** (OBSERVED, cause unknown, does not affect the at-rest reading): base's keyed swap creates new img
elements. Two rAFs after the swap (`post`, and `t0` of the next slide), they report `naturalWidth` 0 and `complete`
false; by `post300` and `t100` they are complete. S's persistent slots stay complete throughout.

**Reading** (describes only):
- **Geometry equal, layering differs.** Per the registration, no G is built on geometry.
- Three suspects remain, all in how the faces are painted:
  - the card's opacity 0.999 plus `blur(0px)`;
  - the slot layers (will-change);
  - the slots' own `scale(1)` / opacity 0.999.
- D3 below splits them before a G is proposed to the lead.
- The mid-slide 0.007 px offset is a separate, small quantity; P-090 can score it if G goes ahead.

## st6-rb2 follow-up, D3 (describes only; written before it runs)

**Question.** Which of the three painting suspects makes S's faces differ from base's at rest in WebKit?

**Arms.** These are diagnostic overlays, never candidates. Each is S (`snap/S`) with one block appended to the CSS
(sources in the scratchpad `d3-*.css`):

| arm | change on top of S | CSS sha |
|---|---|---|
| Sc | the card back to the baseline's rest values: `.start-selling-future.is-visible > .start-selling-future-card { opacity: 1 !important; filter: none !important }` | `247e94f7b1cf` |
| Sv | no slot layers: `.start-selling-avatars.is-carousel img { will-change: auto !important }` | `dc4334967c89` |
| Sw | Sv, plus the slots at rest as base's imgs: `img:not(.st5-next) { transform: none; opacity: 1 }` (animations still override during a slide) | `303e1050b81d` |

The JS is S's (`7bf7c4657d21`) in every arm.

**Run.** One shared-lane Simulator hold with `probe/simcrop.mjs` (sha `26f548f2dcfe`, unchanged), arms in order base,
S, Sc, Sv, Sw, base2. pmset is checked after the hold.

**Readout.** For each arm against base:
- n8 and max shade at `post` and `post300` (rest) and at t 100;
- `tier.mjs`'s five numbers at `post`;
- base~base2 as the A/A.

**What it decides** (describes only):
- An arm at rest equal to base (n8 = base~base2) names the suspect it removed. That suspect is what G must change.
- If several arms do, the smallest change wins.
- If none does, the cause is a combination (Sc and Sw together) or something else, and that is reported.
- Whatever is found goes to the lead with a proposed G before anything is built. Sc touches st6-rb2's `re-keep-op`,
  and Sv/Sw touch st6's no-flip mechanism; both are outside "position and phase". G's cost then needs P-090 to score
  the gain those mechanisms bought.

### D3 result (2026-10-03 19:22:11-19:24:25Z, one hold, exit 0)

The last pmset entry was at 17:57:12Z, so the hold did not overlap a sleep. Served hashes matched the D3 table. Every arm
caught the same slide (the graphic-designer face leaving), with no blank or unsettled shot. Raw data:
`out/carousel-leaver/d3/`.

| pair | n8 at t 0 / 100 / 220 / post / post300 |
|---|---|
| base~base2 | 0 everywhere |
| base~S | 1568 / 7233 / 3303 / 3303 / 3303 |
| base~Sc, base~Sv | **identical to base~S** (S~Sc = S~Sv = 0 at every point) |
| base~Sw | 1045 / 7345 / 3500 / 3501 / 3501 (S~Sw about 520 at every point) |

**None of the three suspects explains it.** The card's opacity/blur and the slot layers change nothing. Putting the
slots' transform and opacity back to base's changes about 520 px, but away from base, not toward it.

**What the pixels show** (side-by-side crops, scratchpad `d3-face*.png`; D1a's E crops the same way). The face
geometry is equal, but the image content is resampled differently:
- Base's faces are aliased: the glasses and hair edges are dotted, as from a cheap 480 → 90 px downscale.
- S's faces are smooth.
- In E (D1a), one face is smooth and the others are aliased like base's, differing from base only in thin column
  stripes.

**The suspect this points to.** WebKit's `ImageQualityController` (`Source/WebCore/rendering/ImageQualityController.cpp`,
CONFIRMED as source; commit and line numbers in "D4 result" below):
- Each object's painted size is tracked per page view. When an image object is painted at two different sizes while
  the 500 ms timer (`lowQualityTimeThreshold`) is active, the view sets `m_animatedResizeIsActive`.
- While that flag is set, every scaled bitmap on the view paints at `InterpolationQuality::Low`, and each such paint
  restarts the timer. When the timer fires, the flag clears and the tracked objects repaint at Default quality.
- `image-rendering: optimizeSpeed` maps to Low and `optimizeQuality` to Default, both bypassing the history.

How this fits what we saw (OBSERVED, in our setup, until D4):
- Base's leaver changes its layout size every frame, so each slide puts the view into low-quality mode.
- S's leaver only scales (its layout size never changes), so S never enters it.
- E's leaver resizes again, so E is mostly low-quality, like base.
- Our settle loop snapshots every 250 ms, and each snapshot is a low-quality paint, so the loop itself would hold the
  flag set. Our rest shots may therefore show base's slide-time quality, not its quiet-rest quality.

## st6-rb2 follow-up, D4 (describes only; written before it runs)

**Question.**
1. Is the whole at-rest difference interpolation quality?
2. What does each build show after a quiet rest, with no snapshot for 1.5 s?

**Arms.** Diagnostic overlays, never candidates. Each appends one block to the arm's CSS
`.start-selling-avatars img { image-rendering: <value> }` (scratchpad `d4-q.css`, `d4-s.css`):

| arm | build | value | CSS sha |
|---|---|---|---|
| Bq | base | optimizeQuality (Default, always) | `08b095262e9e` |
| Sq | S | optimizeQuality | `ef77a221bb57` |
| Bs | base | optimizeSpeed (Low, always) | `f4a78b36b2af` |
| Ss | S | optimizeSpeed | `9fe2e88dac69` |

The JS is base's (`4606120cf392`) for B* and S's (`7bf7c4657d21`) for S*.

**Probe.** `probe/simcrop.mjs`, now at sha `809bc40fc2de`. The only change is an opt-in `CL_QUIET=<ms>`: after
`post300` it waits that long with no snapshot, then takes one settled shot `nat-quiet`. Without the variable it
behaves exactly as `26f548f2dcfe`.

**Run.** One shared-lane Simulator hold with `CL_QUIET=1500`, arms in order base, S, Bq, Sq, Bs, Ss, base2. pmset is
checked after the hold.

**Readout:** n8 and max shade at every t and at post, post300 and quiet, for:
- base~S;
- Bq~Sq and Bs~Ss (the same quality forced in both builds);
- base~Bs and S~Sq (each build against its own natural state);
- base~base2 as the A/A.

**What it decides** (describes only):
- **Bq~Sq and Bs~Ss at rest = 0 (or the A/A).** Interpolation quality explains the whole at-rest difference, and the
  slots' painting is otherwise exact.
- **base~Bs = 0 at post** while **base~S ≠ 0.** Base's rest shots are in low-quality mode; at quiet, base~Bq tells
  whether base returns to Default after 500 ms.
- Either way, nothing is built. The finding and the options go to the lead. The baseline's look then depends on a
  WebKit timing heuristic: low quality from a slide's start until 500 ms after its last scaled-image paint. Matching
  that frame by frame is a different job from "position and phase".

### D4 result (2026-10-03 19:31:32-19:34:20Z, one hold, exit 0)

The last pmset entry was at 17:57:12Z, so the hold did not overlap a sleep. Served hashes matched the D4 table. Every arm
caught the same slide (the graphic-designer face leaving), with no blank or unsettled shot. Raw data:
`out/carousel-leaver/d4/`.

Each n8 row lists, in order: t 0 / 17 / 33 / 50 / 67 / 83 / 100 / 133 / 167 / 200 / 220 / post / post300 / quiet.

| pair | n8 |
|---|---|
| base~base2 | 0 everywhere |
| **base~Bs** (base vs base pinned Low) | 3421 / **0 from t 17 through post300** / 3501 at quiet |
| **base~Bq** (base vs base pinned Default) | **0 at t 0** / 2719-3427 from t 17 through post300 / **0 at quiet** |
| **S~Sq** (S vs S pinned Default) | **0 everywhere** |
| base~S | 1568 / 3618-12714 moving / 3303 at post and post300 / **523 at quiet** |
| Bq~Sq (both Default) | 1568 / 849-6585 moving / **523 at post, post300 and quiet** |
| Bs~Ss (both Low) | 1944 / 1619-6794 moving / **971-1263 at rest** |

**Five numbers at quiet rest** (`tier.mjs`): base~S = Bq~Sq is max **81**, 523 px (0.0174 % of the viewport), fill (41 %
edge), static, on two faces (50.4 and 7.7 CSS px²). The A/A is 0.

**Reading** (statuses kept separate, as ops asked):
- **The mechanism is CONFIRMED in WebKit source**: `Source/WebCore/rendering/ImageQualityController.cpp` at WebKit
  commit `789c0d1be2b744a5edf8c23e8836b02a81c31a6a` (2026-10-03, "[Image Redux] Use
  Style::Image::interpolationQualityForImageDraw for SVG images as well"; the file's latest commit on `main` when read
  on 2026-10-04,
  https://github.com/WebKit/WebKit/blob/789c0d1be2b744a5edf8c23e8836b02a81c31a6a/Source/WebCore/rendering/ImageQualityController.cpp).
  Line numbers are at that commit.
  - L46: `lowQualityTimeThreshold { 500_ms }`. L50: the timer fires `highQualityRepaintTimerFired` after it.
  - L146-228: `chooseInterpolationQualityForBitmapOfSize(…, RenderBoxModelObject&, …)`.
    - L151-152: a style value wins first.
    - L200-204: while `m_animatedResizeIsActive` is set, it returns `InterpolationQuality::Low` and restarts the timer.
    - L209-213: a first paint, or a paint at the same size as the last one, returns Default and restarts the timer.
    - L216-219: a new size after the timer has stopped returns Default.
    - L221-227: a second size while the timer is active sets the flag and returns Low.
  - L83-101: `highQualityRepaintTimerFired` clears the flag (L89) and repaints the tracked objects (L97-98).
  - L108-122: `interpolationQualityFromStyle` maps `optimizeSpeed` to Low (L111-112) and `optimizeQuality` to Default
    (L116-117).
  - **Version gap:** the Simulator runs its iOS release's WebKit, not this `main` commit. That the release behaves the
    same is OBSERVED (D4's pinned arms match the source's predictions), not cited.
- **That it explains our numbers is OBSERVED in our setup**, now with a decisive local check:
  - Base paints its faces at Low from its first resize frame (t 17) through post300. Under our 250 ms settle loop it
    equals base pinned Low, 0 px.
  - At t 0, and after 1.5 s with no snapshot, it equals base pinned Default, 0 px.
  - S never leaves Default (S~Sq 0 everywhere): its leaver only scales, and its layout size never changes.
- **Probe caveat** (ops): the settle loop's own snapshots are Low-quality paints that keep restarting the timer.
  - Every P-087 / D1 / D3 WebKit number at post and post300 therefore shows base in its slide-time Low state, not its
    quiet rest. This applies to W1 at phone width and W3 on the iPad: "measured under the settle loop".
  - At quiet rest, st6-rb2 differs from base by 523 px at max 81, not 3303 at max 157.
- **What remains with the quality matched is the slots' own painting:**
  - At Default: 523 px, max 81.
  - At Low: 971-1263 px, max 157.
  - D3's Sw (S's slots at rest as base's imgs: transform none, opacity 1) paints exactly as base at Default (base~Sw at
    rest 3501 = base~Bq; S~Sw 523 = Bq~Sq).
  - So these pixels come from st6's no-flip rest values, `transform: scale(1)` and/or `opacity: 0.999`. Will-change
    has no effect (D3 Sv). Which of the two it is has not been split.

**What the baseline's look is**, in WebKit on screen (reasoned from the source, UNRESOLVED until checked on screen):
- Each slide switches the whole page into Low-quality image interpolation from the leaver's second resized paint.
- It switches back 500 ms after the last scaled-image paint, so roughly from 280 ms after the swap until the next slide
  starts. Faces are drawn at Default quality for only about the last 300 ms of each 1.02 s cycle.
- st6-rb2 draws them at Default throughout. F's leaver resizes again (E's layout keyframes), so F triggers the same mode.
- But F's faces sit in their own composited layers. A follower moved by reflow need not repaint, so on screen F's faces
  may keep their Default-quality backing stores through a slide.
- `Page.snapshotRect` repaints everything in software, so it cannot show that difference. Only an on-screen capture can
  (for example the Simulator's own screenshot of the composited frame, if one is allowed).

**Options for the lead** (none built; the bar is the baseline's look, not a smoother picture, per ops):
1. **G1 = F + base's rest values on the slots** (`transform: none; opacity: 1`, which is D3's Sw rule; will-change may
   stay).
   - Expected: the slot painting matches base (Sw = base at Default, 0 px). F already reproduces the Low-mode trigger.
   - Cost: it removes st6's no-flip guarantee. The leaver and the next slot cross hasTransform / isOpaque at each slide
     start and end, which brings back the whole-view Layouts st6 removed (`fixes/rotator-st6/README.md`: view Layout
     71/71 → 1/36; S7 on the phone, idle dt > 34 at 19-27 per 20 s without st6, 0 with it).
   - That is the exact-versus-cheap conflict the spawn rule sends to the user.
   - Whatever G is, it must close the quiet-rest difference too (ops, 2026-10-04): 523 px at max 81 is over T2's fill
     limit of 64, so without a quiet-rest match G cannot reach T0, T1 or T2.
2. **Split the 523 px first** (one describes-only arm pair: `transform: none` alone vs `opacity: 1` alone).
   - If only one of the two values paints differently, G could keep the other and change only it.
   - Either value still flips (st6's comment names both), so the conflict likely stays, but at half the cost.
3. **Keep st6-rb2's look** (smooth faces through the slides).
   - That is T3 at quiet rest (max 81 > fill 64), and larger during slides and the 500 ms after.
   - It becomes a user proposal, together with the rm1440 question.
4. **In any case**, checking G's on-screen look in WebKit needs an on-screen capture (option 1's composited slots
   versus base's repainted faces), not `snapshotRect`. That is a method question for the lead.

## P-090: G attempt 1 (describes only; written before it runs)

**Lead route (2026-10-04):**
- Do option 2 now: split st6's two rest values at quiet rest, then look for a no-flip value of the culprit property
  that paints like base. At most 3 candidates, five numbers at quiet rest each. This is G's attempt 1, and it targets
  the quiet-rest 523 px only.
- Don't build G1. The slide-time difference (base drops to Low quality, st6-rb2 stays Default) is a motion-only
  difference, so it goes to the user whatever we build. Option 1 (st6's saving given back) goes to the user too.
- On-screen check allowed: the Simulator's own screenshot of the composited frame (`xcrun simctl io <udid>
  screenshot`, inside a `sim.mjs` session; not a camera, not the iPhone). Use it for one slide sequence, base vs S.
- Then a proposal draft for the lead: (A) st6-rb2's look kept, plus a quiet-rest fix if one is found; (B) exact, with
  st6's saving given back. Include the five numbers and the on-screen evidence.

**Snapshot and builds.** Baseline snapshot `b1789284481295-4ad4a84a`. Base JS `4606120cf392`, CSS `27776f3d4138`. S
= st6-rb2 (JS `7bf7c4657d21`, CSS `f523598b2a24`). Diagnostic overlays are read-only scratch copies of S (or base) with
one CSS block appended. None is a candidate:

| arm | build | appended rule | CSS sha |
|---|---|---|---|
| St | S | `img:not(.st5-next) { transform: none }` (opacity 0.999 kept) | `bc0a94f73bfe` |
| So | S | `img:not(.st5-next) { opacity: 1 }` (scale(1) kept) | `d94cf79b7589` |
| Sv | S | `img { will-change: auto !important }` (D3) | `dc4334967c89` |
| Sw | S | all three: will-change auto, transform none, opacity 1 (D3) | `303e1050b81d` |
| Bs | base | `image-rendering: optimizeSpeed` (Low, always; D4) | `f4a78b36b2af` |

Selectors are under `.start-selling-avatars.is-carousel`. St/So/Sw keep `.st5-next`'s start state.

**Probes** (`fixes/carousel-leaver/probe/`, hashes at registration):
- `simquiet.mjs` `723236c5728b`. Per arm:
  - catch the target slide (the first arm names it), jump it to its end, swap, hold the rotator;
  - wait 1.5 s with no snapshot;
  - take the **on-screen frame** first (`simctl io screenshot`, the whole device);
  - then the `snapshotRect` crop, plus one more 250 ms later that must be identical (one pair, no settle loop);
  - locate the snapshot in the screenshot (least SAD; VOID above 20 levels per channel) and crop the on-screen frame
    to the same carousel ±4 CSS px rect;
  - burst arms only: release the rotator and take a screenshot every 100 ms (at most 4 in flight) for 2.6 s, with an
    in-page rAF log of slide start and end in `Date.now()`.
- `tierq.mjs` `c36772776b4a`: tier.mjs's five numbers on the quiet crops (`scrc` on screen, `nat` snapshot).
- `screenfaces.mjs` `6f16f68a1f81`: per burst shot, the inner disc of each face at rest slots 0-2 (radius 14 CSS px,
  inside its own 24 px strip) against the same face in each reference arm's quiet crop (slot + 1, shifted 72 device
  px): n8 and max. A shot matches a reference when n8 = 0 on all three discs.
- `png.mjs` `52d21ec3f1d5`, unchanged.

**F-199.** Every crop is the carousel ±4 CSS px (rect logged per arm), so the nav "EN" label is not in any crop.

**Hold A, the split** (one shared-lane Sim hold, `caffeinate -i -s` inside, pmset after):
- Arms in order: base, S, St, So, Sv, Sw, base2.
- Readout: tierq for each arm vs base with aa base2, on screen (`scrc`, primary: what the user sees) and snapshot
  (`nat`, comparable with D4); plus each arm vs S.
- "X matches base" means base~X n8 ≤ base~base2 n8 on screen.
- Decision (describes only):
  - **S matches base on screen.** The 523 px is snapshot-only. There is no quiet-rest difference on screen, so no
    candidate is needed and attempt 1 ends with that finding.
  - **Exactly one of St / So / Sv matches.** That value is the culprit, and part 2 looks for a no-flip value of it.
  - **Only Sw matches.** A combination is the culprit, and part 2 takes the pair.
  - **None match.** The slot values don't explain the on-screen difference; report it, and no candidate follows.
- Prediction, written before: snapshot as D4 (St or So carries the 523 px; source reading favours neither). On screen,
  S's slots are composited (will-change), so the compositor applies opacity 0.999. In that case Sv may matter on screen
  even though it does not in the snapshot (D3). P(S matches base on screen) 0.25.

**Hold B, the on-screen slide sequence** (one shared-lane Sim hold, pmset after):
- Arms base (burst), S (burst), Bs, base2.
- Readout: `screenfaces.mjs <dir> base:base,Bs S:S`, the quiet pairs base~Bs, base~S and base~base2 on screen, and the
  slide start and end times.
- Expectation (reasoned from the ImageQualityController source; UNRESOLVED until this runs):
  - base's shots at rest positions from the end of the slide (220 ms) to about 720 ms after its start match Bs (Low);
    later shots match base's quiet crop (Default);
  - S's shots at rest positions match S's quiet crop throughout.
- Falsifier: base's rest-position shots in 220-720 ms matching base (Default), or S's not matching S.
- Shots taken while the faces move match nothing (they are listed, not scored).

**Part 2, candidates** (only if Hold A names a culprit):
- At most 3 candidates. Each is a no-flip value of the culprit property only: hasTransform and opacity isOpaque stay
  the same at rest, at slide start and at slide end (st6's invariant).
- Each is one CSS block on S, named and hashed in an amendment sent to mgmt-ops-10 before its hold.
- Scored in one hold (arms base, S, C1-C3, base2), tierq on screen and in the snapshot, against the bar below.
- A candidate that reaches T2 on screen then needs, before any claim, each in its own hold and registered in the same
  amendment:
  - **Sim motion.** P-087's W2 form (`simclp.mjs` + `shape.mjs`). C~S medians of L.w, V.x0, V.x1 and F1.xr must stay
    within S~S2's median + 0.05 px, and maxima within max(E~E2, F~F2) max + 0.5 px (P-087's interval, medians
    reported). The candidate must not change st6-rb2's motion.
  - **Sim reduced motion.** `sim.mjs session --reduce-motion on` (I-100, 0b082d16), `CL_NOSLIDE=1`: there is no slide
    under reduced motion (JS L11346), so it is a quiet rest from load. matchMedia is recorded per arm (VOID if
    false). Arms base, S, C, base2.
  - **DPR 2 (fw-ipad).** C vs base at quiet rest against a load-to-load A/A of ≥ 3 loads per arm (de-breakpoints'
    `probe-loads.mjs` design: alternating loads, classes of identical shots).
  - **Chrome.** C~S at rest = 0 (Chrome stays 0), with P-087's Chrome rest crop and its A/A.

**Bar** (ops):
- WebKit T0 or T1, or T2 with the five numbers (fill max ≤ 64, edge max ≤ 128, ≤ 0.5 %), on screen at quiet rest,
  against base, beyond the same hold's A/A. The look to match is the baseline's, not a smoother one: anything that
  leaves S smoother than base is T3, a user proposal.
- Chrome stays 0. Reduced motion is exact.

**Stop.** This is attempt 1 of 2. If no candidate reaches T2, or no culprit is found, it is written up for the lead.
The lead takes it to the user as a proposal with the rm1440 question. Attempt 2 runs only on the lead's route.

**Statuses.** Every engine claim from these runs is OBSERVED in our setup until a source reference confirms it. The
paint paths read so far (WebKit `789c0d1`):
- `RenderLayer::paintLayerByApplyingTransform` (`RenderLayer.cpp` L4029-4057): device-pixel-snapped offset plus a
  carried sub-pixel remainder;
- `beginTransparencyLayers` (L2770-2805): an image-only layer is painted with `setAlpha`, anything else in a CG
  transparency layer. Our imgs have a visible 1 px border, so they are not bitmap-only (`isBitmapOnly`, L6650-6668).
Neither predicts max 81 by itself.

### P-090 addendum 1 (ops read of 00cb3d84; written before any hold runs)

1. **Two or more of St / So / Sv match base.** Either value alone is enough. Part 2 takes the one with the simpler
   no-flip value, or both, within the 3-candidate cap.
2. **A/A floor and direction.**
   - "X matches base" needs both directions: base~X n8 ≤ base~base2 n8 **and** base2~X n8 ≤ base~base2 n8, on screen.
   - If base~base2 on screen has n8 ≥ 523 (the size of the effect under test), Hold A is inconclusive, not "S matches
     base". It is re-run once in this ticket, and that is not a strike.
   - **Masked passes (lead ruling).** If the A/A (base~base2) masks pixels in the leaver or face region, a match or a
     T2 that holds only because of that mask is not a PASS. It goes to the lead as "mask-dependent", with the unmasked
     counts: fill max, edge max, share and CSS px. tierq subtracts the A/A count instead of masking pixels, so each
     line already prints the unmasked n8, and it is reported as printed.
3. **The overrides must have applied** (VOID rule at read-out, from `simquiet.json` `slots`, every slot except
   `.st5-next`):
   - St: transform `none` and opacity 0.999.
   - So: opacity 1 and transform still st6's `matrix(1, 0, 0, 1, 0, 0)`.
   - Sv: will-change `auto`.
   - Sw: all three.
   - S: st6's values (matrix, 0.999, `transform, translate, opacity`).
   An arm whose slots show otherwise is VOID, since S's own rule would have won and the split would mean nothing.
4. **Sleeps (I-098).** A pmset Sleep or DarkWake inside a hold's window voids that hold; it is re-run. A kill at the
   300 s limit voids only the arms that did not finish; they are re-run as a new hold. Neither is a strike.
5. **Hold B windows.**
   - A burst shot counts for a window (220-720 ms after the slide start, or after 720 ms) only if its whole simctl
     window [t0, t1] lies inside that window. Shots that straddle a boundary are listed, not scored.
   - Fewer than 2 whole shots inside 220-720 ms for base makes Hold B inconclusive, not falsified.
6. **Scoreable predictions** (for PREDICTIONS.md):
   - Hold A, on screen: P(S matches base) = 0.25.
   - Hold A, snapshot (`nat`): P(exactly one of St / So matches base) = 0.6; given one, P(it is So) = 0.6.
   - Hold B: P(the expectation holds as stated) = 0.55. That is: base's whole shots in 220-720 ms match Bs and none
     matches base; base's whole shots after 720 ms match base; every whole S shot at rest positions matches S.
7. **Part 2 bar, the five numbers.** tierq labels a whole diff fill or edge by majority. For the part-2 bar, any diff
   with fill pixels is read against max ≤ 64, whatever its majority label. Hold A's match rule (n8) is unchanged.

**Scope.** "On screen" means the Simulator's composited frame (rendered on the Mac's GPU), not the iPhone's. Claims
from it are worded that way and stay OBSERVED in our setup until a source reference backs them.

## Deliverables

- `patch.diff`: baseline-relative, st6-rb2 + **F** (CSS `a984ae7b7715` and st6-rb2's JS `7bf7c4657d21`), regenerated
  after P-087.
- `delta-vs-st6rb2.diff`: F's CSS change on top of st6-rb2 only (for wi-best-build): E's layout keyframes plus the
  `z-index: 1` line.
- Build E's versions of both are in commit 5914e37 (P-086).
- Neither is offered for landing: P-087 found F not exact. The route is the lead's.
