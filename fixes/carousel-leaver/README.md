# Fix: carousel-leaver (the avatar slider's leaving face on st6-rb2, moving like the baseline)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Owner:** `fix-carousel-leaver` (lead, 2026-10-03, user T-042 #10-#11: ruled a bug, OBSERVED in Chrome only).
**Status:** P-086 results in (2026-10-03). (1) Chrome hit; (1) Sim mixed (the registered scorer is weak in the Sim);
(2) **miss**: a paint-order difference in the first 50 ms of every slide, cause found; (3) hit; (4) Chrome hit, Sim carousel-rooted
just under its range. Build E is **not** offered as exact (T3).
**Now:** P-087 registered (build F = E + `z-index: 1` on the sliding leader), probes smoke-tested with A/A 0 in
Chrome and WebKit; F not yet served or measured.
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

## Deliverables

- `patch.diff`: baseline-relative, st6-rb2 + E (CSS and st6-rb2's JS).
- `delta-vs-st6rb2.diff`: E's CSS change on top of st6-rb2 only (for wi-best-build). It does not include the z-order fix
  above.
