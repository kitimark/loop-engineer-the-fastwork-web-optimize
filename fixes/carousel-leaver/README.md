# Fix: carousel-leaver (the avatar slider's leaving face on st6-rb2, moving like the baseline)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Owner:** `fix-carousel-leaver` (lead, 2026-10-03, user T-042 #10-#11: ruled a bug, OBSERVED in Chrome only).
**Status:** registered (P-086), no data read yet.
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

## Results

(none yet)
