# Fix: carousel-leaver (the avatar slider's leaving face on st6-rb2, moving like the baseline)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Owner:** `fix-carousel-leaver` (lead, 2026-10-03, user T-042 #10-#11: ruled a bug, OBSERVED in Chrome only).
**Status:** P-086 results in (2026-10-03). (1) Chrome hit; (1) Sim mixed (the registered scorer is weak in the Sim);
(2) **miss**: a paint-order difference in the first 50 ms of every slide, cause found; (3) hit; (4) Chrome hit, Sim carousel-rooted
just under its range. Build E is **not** offered as exact. A z-order follow-up build needs a new registration (lead).
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

- View-rooted per slide E - S = -10.4 / -2.2, inside ≤ 0.3. HIT.
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

## Deliverables

- `patch.diff`: baseline-relative, st6-rb2 + E (CSS and st6-rb2's JS).
- `delta-vs-st6rb2.diff`: E's CSS change on top of st6-rb2 only (for wi-best-build). It does not include the z-order fix
  above.
