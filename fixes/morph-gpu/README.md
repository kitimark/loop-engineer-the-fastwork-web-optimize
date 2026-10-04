# Fix: morph-gpu (N2, the end-of-page nav morph as a composited reveal)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** PR-012 rev 1 accepted by the user (2026-10-04 02:56:15Z, no notes); the accepted rev is the spec. Rev 1
lands as a **record only**: out of the next best build, not as a "less work" fix (lead, P-092 ruling 2026-10-04, and
review-morph-gpu B2). It stays in the GPU preview with the cost label below. Owed before it can go further: see
"Owed (review B5)" below.
**Stage:** V: the phone no-worse block P-092 ran on 2026-10-04 (05:39-06:06Z, 3 holds, all valid at Serious;
"Phone block P-092: result", below). Moving scope: '>50' Δ 0 and '>34' Δ −2, both no-worse and not threshold-sensitive.
Drive scope '>34' is threshold-sensitive (better at 34, no-worse at the twins); no gain is claimed from it.
**Lead ruling (2026-10-04 ~06:15Z): PASS as no-worse**, to land as a record. **Cost** (OBSERVED in our setup, M driver,
medians of the 4 runs per arm; corrected after review B1):
- The +7 ms is only at the 2nd and 3rd open of each run (after a full close): first frame V 62 vs C 55 ms. The next
  frame is shorter by the same amount: the first 2 frames sum to 71 vs 71 ms, the first 3 to 82-83 vs 82-84 ms.
- The first open per page load: first frame V 41 vs C 34.5 ms (n = 4, ranges 40-49 vs 33-49, overlapping).
- Close starts are SHORTER in V: first frame 33 vs 39 ms, first 3 frames 50 vs 72 ms.
- Whether a displayed frame is lost is UNRESOLVED: the phone's stamps mark the rendering-update start, not display
  (claims-audit §2.3).
Because of the open-start cost, rev 1 does NOT enter the next best build. It stays in the GPU preview, labelled with
this cost. Rev 2 (prepare the clip layer before the tween starts) did not remove it: phone block P-098 (2026-10-04,
3 valid holds, ops second read AGREE) measured the first open frame at +6.5 ms again (V 40 55 43 38 vs C 36 35 35 34,
WORSE), with the 2nd/3rd opens +5/+6. So rev 2 stays out and lands as a record only; P-099 was skipped ("Phone block
P-098: result", below). Next (lead, after 12:20Z): a Simulator Timeline attribution of the open start, no timing.
**Device class / gate:** phone-only, render-bound (WebKit paint during the morph). Gains below are Simulator counts.
**Driver(s) behind the claims:** M (`__fwMorphDrive` in the Simulator, `__fwMorphSet` frozen frames). No S, G or F yet.
**Base:** best-build (main 60df1cf: st6-rb2 + platform-idle + morph-inherit), js `65052c4a3902`, css `e0f92804c521`.
This fix's own change against that base: `fixes/morph-gpu/delta.diff` (229 lines). `patch.diff` is baseline-relative,
so it carries best-build too. Built by `node fixes/morph-gpu/build.mjs` → `rv-372b99478871` (what would land),
`rvhook-81a43009c62d` (plus the frozen-frame hook and a frame stepper, gates only), css `257507365449`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (new `__rv*` reveal writer after `__mkW`, pretty lines
~13495-13635 of the overlay; one call `__rvW(e[`--morph`])` in the nav's template effect, ~13757),
`/_app/immutable/assets/2.gBuqKVzi.css` (one appended block, `@media (width<=640px)` rules for `[data-fw-rv]`,
`.fw-rv-dark`, `.fw-rv-glass`). Lines owned by fix-nav-morph (12951-13089) are untouched.

**I-098 (Mac sleep) check**, against `pmset -g log` and `locks/holds.log`. The Mac slept 17:23:14-17:38:16Z and
17:41:45-17:57:12Z.
- Clean, ended before the first sleep:
  - Simulator paint counts (16:31-16:33Z, F-195);
  - Simulator motion frames (16:09-16:11Z);
  - Chrome motion frames (16:57-16:59Z);
  - Simulator stepped switch-off (17:17-17:20Z).
- Void: three Chrome runs. All three are counts or pixels, no timing.
  - Chrome stepped switch-off, `frames-…T17-38-38-388Z`, 17:38:50-17:39:55Z;
  - desktop, `frames-…T17-39-56-017Z`, 17:40:05-17:40:44Z;
  - Chrome per-phase counts, `restyle-chrome-…T17-58-17-031Z`, 17:58:17-17:59:21Z.
- Why they are void: all three ran during dark wakes. The first two were in a hold (17:38:38-17:57:12Z) that ran
  across the second sleep.
- Re-run in one shared slot, 18:09:58-18:13:01Z, with no sleep or dark wake in it (pmset checked after):
  - `frames-2026-10-03T18-09-59-062Z`;
  - `frames-2026-10-03T18-11-13-876Z`;
  - `restyle-chrome-2026-10-03T18-11-59-624Z.json`.
- Every number below comes from the re-runs.
- Confirmation re-run, asked for by the lead (main c5263022), one shared slot 19:23:14-19:26:15Z, no sleep or dark
  wake (last pmset event 17:57:12Z): `frames-2026-10-03T19-23-15-219Z`, `frames-2026-10-03T19-24-30-786Z`,
  `restyle-chrome-2026-10-03T19-25-14-368Z.json`. Same builds, same Chrome.
  - Counts: equal within ±0.1 (moving: M 24.2-24.3, R 34.7-34.8 elements; layouts 1.77 both; Paint events 9.13-9.2 ->
    9.84-9.95).
  - Desktop: 0 px beyond A/A in every frame (the 6 px at the first m 0 is gone).
  - Stepped, R against its own earlier frames: 0 px over 8 in 14 of 16 frames. The N+1 frame after the abrupt jump
    (19 css px, max 53) and the top-of-page frame (19 css px) vary from run to run.
  - Stepped, R against M in this run: the "EN" label in the nav sat a sub-pixel left or right per page load, in
    either build (R in `…T15-27-09-865Z`, M and M2 here; 22 css px, edge shade up to 94; frame 0, before any
    morph). Both A loads landed in the same state, so the two-load A/A mask missed it. With that strip left out
    (y > 50 css): N+1 after the jump is 25 css px, max 10, as before. N+2 after the 0.99 step shows 23 css px,
    max 18. That is the Chrome A/A two-state flip at m 1 (207 px over 8, max 19), which only R landed in here.
  - OBSERVED, cause unknown: the EN label's per-load sub-pixel position. Seen in both builds, so not from this
    change.
- Post-acceptance re-run, asked for by the lead after PR-012 rev 1 was accepted (main 6a01e287), one shared slot
  02:56:59-03:00:06Z on 2026-10-04, no sleep or dark wake in it (pmset checked after): `frames-2026-10-04T02-57-00-303Z`,
  `frames-2026-10-04T02-58-18-635Z`, `restyle-chrome-2026-10-04T02-59-03-837Z.json`. Same builds (served hashes
  checked), Chrome 154.0.8037.97. Everything matches the accepted spec:
  - Stepped, R vs M beyond A/A: 0 at m 0; 855 css px at m 0.5 (the T3 motion, as before); 1.501 % (6013 css px) at
    m 0.99 (as before); 0 at every rest from frame 8 on, 3 css px at the top of the page.
  - Switch-off chain: N+1 after the abrupt jump 25 css px, max 10, y 612 (the one fix-specific T2 difference,
    unchanged). The m 1 frame shows 23 css px, max 19, and the third chain frame 19 css px, max 53 at y 660: both are
    Chrome A/A states (M's second load against M shows the same 174 px, max 53), which only R landed in this time.
    No EN-label flip in this run.
  - Desktop: 0 beyond A/A, except 6 px (2 css px, max 18) at the first m 0, as in the 18:11Z run.
  - Counts per frame (elements restyled / layouts / Paint events): moving M 24.3 / 1.77 / 9.11 and 24.2 / 1.77 /
    9.22, R 35.2 / 1.77 / 9.85 and 36.0 / 1.77 / 9.84; at m 1 M 11.7-11.8 / 0.17-0.19, R 13.0 / 0.23; at m 0 M
    12.3-12.4 / 0.78-0.80, R 12.8-12.9 / 0.81. R's moving restyle count is up by 0.5-1.2 against 34.7-34.8 in the
    two earlier runs; layouts and Paint events are unchanged. No conclusion changes (Chrome shows no gain either way).

## Why it lags

On phones, every morph frame writes `--morph` on the nav (`__mkW`). The nav's own CSS (`.start-selling-top-nav`,
css ~11570-11600) computes width, height, radius, background colour and backdrop blur from it. So every frame lays
out the nav and repaints its whole contents: panel title, columns, veil, footer, bar and actions.

Simulator, best-build, M driver, `fixes/morph-gpu/gates/paint-sim.mjs`
(`out/morph-gpu/tween-paint-2026-10-03T16-32-21-273Z.json`, read with
`fixes/morph-inherit/gates/tween-paint-read.mjs` → `out/morph-gpu/tween-paint-read-1.json`):
- open tweens: 12.2-12.4 paints per frame, ~1.1M css px painted per frame;
- close tweens: 9.7-9.9 paints per frame, ~0.56M css px painted per frame;
- every tween frame repaints morph-center (~398x388), the header, the three column tracks (~139x512 each), the
  veil, the footer, the nav bar, the actions and the language switch.

## What changed

Phones only (`width <= 640px`), and only while the morph moves (0.001 < m < 1):
- The nav takes its final size and place (`data-fw-rv`). Today's box at m is cut out of it by an inline
  `clip-path: inset(... round 32-12m px)`.
- Every part inside takes today's place at m by a transform: bar, logo, actions, columns, veil, title block and
  footer. Text layers move by whole device pixels.
- The dark colour is `.fw-rv-dark` at opacity m over the light background.
- The backdrop blur moves to a sibling `.fw-rv-glass` sized by today's formulas.
- Settled at m = 0 and m = 1, the attribute and every inline value are off, and the nav is today's.

Switch-off:
- The clip goes in the first frame. The nav's own blur stays off for that frame, and the glass covers it.
- The nav's blur returns in the next frame.
- At m = 1 only, the nav's backdrop filter is switched off once more, two frames later. This is a workaround, see
  "Stale clip" below.

## Why that is faster (Simulator counts, OBSERVED; Simulator ms are never judged, F-084)

A changed clip-path on a composited layer is applied as a new mask shape, without repainting the content
(WebKit source, read 2026-10-03: `RenderElement.cpp` ClipPath → RecompositeLayer when `willCompositeClipPath()`;
`RenderLayerCompositor::layerStyleChanged` → `RenderLayerBacking::updateMaskingLayer`). Transforms and opacity only
move layers that are already painted.

Same paint-sim run, 2 open and 2 close tweens per arm:

| per tween | best-build (M) | reveal (R) |
|---|---|---|
| open: paints per frame | 12.2 / 12.4 | 2.3 / 2.3 |
| open: css px painted per frame (mean; median frame) | 1.10M / 1.09M (1.17M) | 38k / 36k (4k) |
| open: total painted per tween | 23.1 / 23.9 Mpx | 1.26 / 1.16 Mpx |
| close: paints per frame | 9.7 / 9.9 | 2.3 / 2.2 |
| close: css px painted per frame (mean; median frame) | 0.55M / 0.58M (0.50M) | 67k / 67k (6k) |
| close: total painted per tween | 17.5 / 17.4 Mpx | 2.41 / 2.40 Mpx |
| layouts per frame (open / close) | 2 / 1.6 | 2 / 1.6 (unchanged) |
| style recalcs per frame (open / close) | 2 / 1.6 | 2 / 1.6 (unchanged) |
| holds at m 0 / m 1, paints per frame | ~1 / 0.7-0.8 | ~1 / 0.7 (equal) |

In R a typical frame repaints only the actions (80x36). R still has these larger repaints:
- one full-panel repaint at m ≈ 0.77 on the way open, and in the first close frame (cause not traced; M repaints
  all of it every frame anyway);
- the frame that switches the reveal on;
- the last few close frames near m = 0.
Chrome counts don't move (restyle-chrome, no throttle, `out/morph-gpu/restyle-chrome-*.json`):
- Per-phase run on best-build, while moving: elements restyled 24.5 → 34.8 per frame, layouts equal (1.77-1.78), Paint
  events 9.1 → 9.9. Table under "Desktop and Chrome counts" below.

The win is WebKit paint. Chrome shows none: Chrome already composites most of this, and the CPU-6x setting can't
stand in for raster.

**Image decode (lead request):** no repeat. In R the photo columns paint once, in the frame that switches the
reveal on. In the next 1-3 frames only the 80x36 actions repaint. In M every column repaints on every frame anyway.
So no pre-decode step was added.

## Pixels (frozen frames, PR-010)

Gates: `gates/frames.mjs` (Chrome 430x932 DPR 3 mobile, and `--desktop`) and `gates/sim-frames.mjs` (iOS Simulator
15 Pro Max, page band y 60-834). M = best-build + hook, R = this fix + the same hook, M2 = a second M load (A/A).

**Rests: exact.**
- m = 0 and m = 1: Chrome 0 px over 8. Simulator: only the status-bar clock differs, the same as A/A.
- Desktop (1280x800, reveal off): see "Desktop" below.

**Motion: T3**, same in Chrome and the Simulator. The five numbers are: largest shade; share of screen; css px;
edge or fill; moving. Share and area count only pixels more than 8 levels off that are NOT also more than 8 levels
off in the A/A pair. The A/A pair is best-build against itself, the M2 load in the same session. The Simulator is
compared in the page band y 60-834 css, without the status bar: the clock is the only A/A difference outside it.

| m | Chrome | Simulator |
|---|---|---|
| 0.5 | 175 (edge; fill max 22); 0.22 %; 869 css px; logo text and the panel's lower side edges; moving | 131 (edge; fill max 18, lower side edges); 0.28 %; 1111 css px; moving |
| 0.99 | 237 (edge; fill max 28); 1.49 %; 5965 css px; panel title text, RSVP/Join buttons, countdown; moving | 233 (edge; fill max 26); 1.30 %; 5194 css px; same places; moving |
| A/A at 0.5 | max 1; 0 px over 8 | max 1; 0 px over 8 |
| A/A at 0.99 | max 33; 601 px over 8 = 67 css px (0.017 %), text edge | max 1; 0 px over 8 |

A/A shots next to the fix's diff maps: `out/morph-gpu/proposal/{chrome,sim}-m0.99-aa-{a,b,diff}.png`.

Sources:
- Chrome: `out/morph-gpu/frames-2026-10-03T16-58-45-896Z` (k1, k3).
- Simulator: `out/morph-gpu/simframes-2026-10-03T16-09-06-602Z` (k7, k5).
- Side-by-side crops and diff maps: `out/morph-gpu/proposal/{chrome,sim}-m{0.5,0.99}-{a,b,diff}.png`.

What is different: the text inside the panel sits up to about one device pixel off during the motion. Text moves by
transform here instead of being laid out at each m. The lower side edges at mid-morph differ slightly in blur
(fill ≤ 28). None of this is visible at rest.

**The switch-off frames at m = 1, frame by frame** (lead condition 1). The gate build steps the switch-off rAF chain
by hand (`window.__rvRaf`), one shot per frame. Simulator `out/morph-gpu/simframes-2026-10-03T17-17-22-105Z`, R vs M
at m = 1, after 0.5 and after 0.99:

| frame | what the nav has | Simulator (after 0.5 / after 0.99) | Chrome 430x932 (after 0.5 / after 0.99), beyond A/A |
|---|---|---|---|
| N (switch-off) | clip gone, own blur off, glass at m = 1 | 0 over 8, max 5 (fill, panel), 18.4k / 18.8k px | 0 / 0 over 8 (max 2) |
| N+1 | own blur back, glass gone | exact (max 1 / max 2, 466 px on the right edge) | 222 px = 25 css px, edge, max 10, a button text row (y ≈ 605-613 css) / exact (max 1) |
| N+2 (the extra toggle) | own blur off | 0 over 8, max 5 (fill, panel), 18.4k / 18.8k px | 0 / 0 over 8 (max 2) |
| N+3 | own blur back: today's nav | exact / exact | 0 / 0 beyond A/A (R equals the second A load exactly) |

- The max-5 frames (N and N+2) are a shade-5 change over the panel for one frame each. That is far below T2 fill
  (64) and not visible. They go into the proposal's visualDiff as a motion difference all the same.
- Chrome N+1 after the artificial 0.5 → 1 jump: 25 css px of text edge, max 10, for one frame. It is within T2.
  After 0.99 → 1 it is exact. The voided run had shown 44 css px at max 53 here.
- Chrome's own A/A at m = 1 flips between two states: 282.7k px, 207 over 8, max 19, over the panel in some
  shots. The Chrome column counts only what lies beyond that.
- Sources:
  - Simulator: `simframes-2026-10-03T17-17-22-105Z`.
  - Chrome: `frames-2026-10-03T18-09-59-062Z`. k3-k6 are the frames after 0.5, k8-k11 after 0.99. This is the
    I-098 re-run of the voided `frames-…T17-38-38-388Z`.

The stepped run did NOT reproduce the stale clip: with ~2 s between the stepped frames, frame N+1 is already
exact. In real, back-to-back frames the stale clip can show in N+1, cut to the last reveal box. On the spring's way
in, that box is m ≈ 0.999: about 0.7 css px short at the panel's bottom edge (an estimate from the geometry, not
measured frame by frame). It shows for one frame, until N+2 clears it.

## Stale clip at m = 1 (Safari): OBSERVED in our setup, cause unknown; references UNRESOLVED

What we see in the iOS Simulator:
- Without the extra toggle, after the reveal ends at m = 1, the settled panel stays cut to the last reveal clip box.
  From m = 0.5 that is half the panel: `simframes-2026-10-03T16-57-35-003Z` R-2, 1.19M px over 8. From 0.99 it is a
  1-device-px edge.
- It is not cleared by:
  - setting the clip-path to `inset(0px)`, or removing it again;
  - toggling the morph backdrop's own clip-path (R-3, R-4 in `simframes-2026-10-03T16-57-35-003Z`).
- Clip first, blur one frame later (the old two-step switch-off) did not help either
  (`simframes-2026-10-03T16-09-06-602Z`).
- It IS cleared by switching the nav's `backdrop-filter` off and on again on a later frame (diagnosis
  `simframes-2026-10-03T16-31-40-782Z`: R-3/R-4 vs M ≈ A/A). The same done two frames after the switch-off (the
  "late" variant, `simframes-2026-10-03T16-57-35-003Z` R-13, R-15) leaves m = 1 exact after 0.5 and after 0.99.
- Chrome does not show it (m = 1 exact).

References:
- bugs.webkit.org quick searches ("clip-path removed", "backdrop-filter clip", "clip-path backdrop-filter mask")
  found no matching bug.
- The WebKit source reading tried, `GraphicsLayerCA::updateMaskLayer` (l.3425-3445, sets the mask on the backdrop
  structural layer or on the content layer), is NOT supported: the switch-off it predicted would help did not.
- Status: UNRESOLVED.
- Decisive local check, done: toggling the nav's backdrop filter after the clip is gone clears it; toggling the
  clip-path does not.
- Open, unchecked on the device: whether it happens on the real iPhone, and whether the workaround clears it there.
  The phone block P-092 did not check it (frame times only; its registration lists the stale clip under "Not in this
  block"). A device check needs a pixel read at m = 1 on the phone, which no tool here does yet.

The toggle is a workaround with that status. At m = 1 the nav's blur is `blur(0px)` under an opaque panel, so it
changes nothing you can see (max 5 above).

Not used: the lead's fallback "stay in the reveal at settled m = 1, switch off only at m = 0". It is not exact at
rest:
- Chrome m = 1: 130k px, 4214 over 8, max 245 (`frames-2026-10-03T16-58-45-896Z`, variant build).
- Simulator: 2957 px over 8 in the nav bar (`simframes-2026-10-03T16-57-35-003Z` R-18).

m = 0 keeps the plain two-step switch-off. A toggle there would show (the pill's blur is 20 px), and the last clip
there is the pill itself.
- After a real close (from 0.99 through ~0.001): max 2.
- After an artificial jump 0.5 → 0: max 8 in the pill, 0 over 8 (`simframes-2026-10-03T17-17-22-105Z` k14).
  Chrome: 0 beyond A/A, max 2 (`frames-2026-10-03T18-09-59-062Z` k14).
- Scrolled back to the hero after a cycle: Simulator exact (k15); Chrome max 1, 0 over 8 (k15).

## Desktop and Chrome counts

**Desktop**, Chrome 1280x800 DPR 2, not mobile. Source: `frames-2026-10-03T18-11-13-876Z`, the I-098 re-run of the
voided `frames-…T17-39-56-017Z`, at m 0, 0.5, 1, 0.99, 1, 0.
- R vs M beyond A/A: 0 px at every m, except 6 px (2 css px, max 18) at the first m 0.
- Those same 6 px also differ between the two A loads, at the last m 0. It is a two-state flip of the page itself.
- R vs M2: max ≤ 12, and ≤ 6 px over 8 at every m.
- The reveal is off there (`width <= 640px`): unchanged.

**Chrome counts per phase**: `gates/restyle-chrome.mjs`. Source: `out/morph-gpu/restyle-chrome-2026-10-03T18-11-59-624Z.json`,
the I-098 re-run of the voided `…T17-58-17-031Z`, which gave the same numbers within ±0.1. Headless 430x932 DPR 3,
no throttle, M driver (hold 1500 ms, 2 cycles), M = best-build, order M R M R.

| per frame | moving: M | moving: R | at m 1: M | at m 1: R | at m 0: M | at m 0: R |
|---|---|---|---|---|---|---|
| style recalcs | 2 / 2 | 2 / 2 | 1.59 / 1.56 | 1.65 / 1.64 | 1.07 / 1.05 | 1.07 / 1.07 |
| elements restyled | 24.3 / 24.6 | 34.7 / 34.8 | 11.8 / 11.7 | 12.7 / 12.8 | 12.4 / 12.3 | 12.7 / 12.8 |
| layouts | 1.77 / 1.78 | 1.77 / 1.77 | 0.17 / 0.18 | 0.20 / 0.21 | 0.79 / 0.77 | 0.78 / 0.80 |
| layout dirty objects | 9.2 / 9.3 | 9.8 / 9.8 | 0.9 / 0.9 | 1.2 / 1.3 | 4.0 / 3.9 | 4.0 / 4.1 |
| Paint events | 9.13 / 9.11 | 9.93 / 9.93 | 4.57 / 4.54 | 4.74 / 4.75 | 5.47 / 5.44 | 5.63 / 5.64 |

Chrome shows no gain:
- While moving, about 10 more elements are restyled per frame: these are the inline writes on the reveal's parts.
- Layouts are the same.
- Paint events are about 0.8 per frame more.
- The paint-area column of this gate uses trace units we haven't validated, so it is not reported.

## Cards (protocol v2)

```
ATTRIBUTION morph-gpu · cluster end-of-page morph (open and close tweens, m 0 ↔ 1) · verdict LOCATED
1 pipeline stage: paint recording (WebKit). Evidence: Simulator LayerTree paintCount deltas per morph frame
  (12.2 / 9.8 paints per frame, ~1.1M / 0.56M css px per frame, every nav part); layouts per frame 2 / 1.6 (not
  the cost the fix removes); M driver, out/morph-gpu/tween-paint-2026-10-03T16-32-21-273Z.json.
  logger y source: none (m is driven by __fwMorphDrive, no scroll).
2 code: __mkW writes --morph per frame (overlay JS ~13488-13494, best-build); .start-selling-top-nav sizes, rounds,
  colours and blurs itself from --morph (css ~11570-11600), so WebKit repaints the nav's layers every frame.
3 ablations (Simulator, control best-build js 65052c4a3902 / css e0f92804c521, same driver, one session):
  | arm | removes | role | mechanism check | result |
  | R (rv-ffec8ba18b56, same motion code as rv-372b99478871) | per-frame size/colour/blur restyle of the nav; replaced by clip-path + transforms + opacity | positive | paint rects per frame (bySize lists: only 80x36 actions per frame) | paints/frame 12.3 → 2.3 open, 9.8 → 2.3 close; css px/frame 1.1M → 37k, 0.56M → 67k |
  negative sibling: none run. Decoupling run: none (axis is m; the hold frames at m 0 / 1 are equal in both arms).
  → LOCATED, not NAMED.
4 device class: phone-only, render-bound (Chrome counts show no gain: moving frames restyle 24.5 → 34.8
  elements, layouts equal, Paint events 9.1 → 9.9; CPU-6x Chrome can't stand in for raster, claims-audit §2.6).
  Phone Timeline segment card: not planned (the registered phone block is a no-worse frame check).
5 platform claims relied on:
  | claim | status | reference / check | what falls if wrong |
  | WebKit applies a changed clip-path on a composited layer as a mask-shape change, without repainting content (iOS 26 Simulator Safari) | UNRESOLVED (corrected after review B3; was "CONFIRMED in source"). The Simulator paint-count check passed; the device is unverified | WebKit main as read 2026-10-03, not the iOS 26.6.1 build on the phone: RenderElement.cpp ClipPath → RecompositeLayer (willCompositeClipPath); RenderLayerCompositor::layerStyleChanged → RenderLayerBacking::updateMaskingLayer / updateMaskingLayerGeometry, which carries "FIXME: Avoid repaints when clip path changes", so the source itself says repaints can still happen. Decisive local checks: Simulator paint counts (done, above); a phone Timeline Paint count during the tween (not run) | the paint gain |
  | Simulator paint counts stand in for the iPhone's | OBSERVED | none; the phone block measures it | the size of the gain on the phone |
  | after the reveal ends at m = 1 Safari keeps the last clip until the nav's backdrop filter is toggled | OBSERVED in our setup, cause unknown; references UNRESOLVED | decisive check run: simframes-2026-10-03T16-31-40-782Z, -16-57-35-003Z | the m = 1 workaround (two extra frames) |
6 lead: LOCATED, record only (lead, P-092 ruling 2026-10-04)
```

**Scenarios not run:** idle after scroll · reload while scrolled · early input · scroll up during the morph ·
toolbar resize · rubber band · reduced motion in the Simulator or on the phone (Chrome frames done, see Risks) · finger (G/F) ·
rapid re-entry (scroll away and back while a tween runs) · rotation · Android Chrome on a device · DPR 2 phones · the
stale clip on the device. The phone no-worse block
(P-092, registered below, condition B; ops PASS) ran on 2026-10-04; result below the registration.

## Owed (review B5, 2026-10-04)

The review (review-morph-gpu, NEEDS-WORK) listed protocol items rev 1 does not have yet. The lead's order: the idle
triple and the memory/layers note before the GPU preview goes to the user.
- **Idle triple** (protocol v2 §3.5): callbacks/s, writes/s, mutations/s and rAF/s at y = 0, parked mid-page after a
  scroll, and at the pin. **Done** 2026-10-04: no idle work added ("Idle triple and layers", below).
- **Memory / layers note:** the review expected about 10 layers promoted at each switch-on (`will-change` on the bar,
  logo, actions, morph columns, center, footer, backdrop and veil, plus the dark and glass divs). **Done** 2026-10-04
  in the Simulator: while the reveal is on, +3 layers and +3.9 MiB over best-build; at rest nothing is left behind
  ("Idle triple and layers", below). Device unverified.
- **Phone segment card** (Script / Style / Layout / Paint+Composite / Other per tween frame, phone Timeline): not run.
  It needs a Timeline block on the phone (lease, ticket); owed before rev 2 can claim where the open-start cost sits on
  the device.
- **Chrome census:** Chrome shows no gain and some extra work while moving (restyled elements 24.5 → 34.8 per frame,
  Paint events 9.1 → 9.9; "Desktop and Chrome counts"). Android Chrome is a phone with `width <= 640px`, so it gets the
  reveal and this cost; listed under Risks. No Android device run.
- **Accessibility:** no change by code. The reveal adds two `div`s with no text, no role, no focusable content and
  `pointer-events: none` (`.fw-rv-dark` inside the nav, `.fw-rv-glass` before it), and changes only clip-path,
  transforms, opacity and `will-change` while m moves. The nav's own DOM order, accessible names and focus order are
  the same as best-build; settled (m 0 or 1) its styles and hit targets are best-build's. While m moves (one tween,
  a few hundred ms) the nav's box is panel-sized and cut by the clip-path; the CSS Masking spec says the clipped-out
  area takes no pointer events, not checked here. Reduced motion: the reveal never switches on (Risks). Not checked
  with a screen reader.

## Idle triple and layers (review B5, 2026-10-04)

**Idle triple** (`rev2/idle-run.mjs` → `fixes/platform-idle/tools/idletriple.mjs`, ROUNDS 1; headless Chrome
430x932 DPR 3, CPU 1x, counts only; `out/morph-gpu/rev2/idletriple-2026-10-04T06-56-14-656Z.json`; shared-lane
probe hold 06:48-06:58Z, no Mac sleep). Per second over 5 s with no input, after 2 s settle:

| spot | arm | callbacks | rAF | timers | observers | events | writes (style) | nodes |
|---|---|---|---|---|---|---|---|---|
| top y 0 | M best-build | 36 | 29.4 | 5 | 1.6 | 18.6 | 80.8 (68.4) | 2.4 |
| top y 0 | R1 rev 1 | 32.8 | 26.2 | 5 | 1.6 | 19.2 | 71.2 (58.8) | 2.4 |
| top y 0 | A rev 2, no pre-promotion | 33.4 | 26.8 | 5 | 1.6 | 18.2 | 74 (61.6) | 2.4 |
| top y 0 | B rev 2 | 32.8 | 26.2 | 5 | 1.6 | 18.6 | 71.2 (58.8) | 2.4 |
| mid 2620 | M | 4.2 | 0 | 4.2 | 0 | 25.8 | 15.8 (6) | 0 |
| mid 2620 | R1 | 4.4 | 0 | 4.4 | 0 | 22.2 | 17 (6) | 0 |
| mid 2620 | A | 4.2 | 0 | 4.2 | 0 | 21 | 16.8 (6) | 0 |
| mid 2620 | B | 4.4 | 0 | 4.4 | 0 | 27 | 17 (6) | 0 |
| pin 5345 | M | 2 | 0 | 2 | 0 | 1 | 10 (6) | 0 |
| pin 5345 | R1 | 2 | 0 | 2 | 0 | 1 | 10 (6) | 0 |
| pin 5345 | A | 2 | 0 | 2 | 0 | 1 | 10 (6) | 0 |
| pin 5345 | B | 2 | 0 | 2 | 0 | 1 | 10 (6) | 0 |

Reading: the reveal adds no idle work. At the pin every arm is identical, and mid-page differs by at most 0.2
callbacks/s. At the top, the hero's rAF loop runs in every arm, and the reveal arms read a little lower (26-27 vs
29.4 rAF/s). The reveal is off at the top, so that is one round's phase noise, not a saving. Rev 2's scroll listener
(a 300 ms debounce timer) fires only while scrolling, so no idle window sees it.

**Layers and memory** (WebKit, iOS Simulator, `LayerTree.layersForNode`):

Census at rest and mid-morph (`rev2/layers-sim.mjs`, `out/morph-gpu/rev2/layers-sim-2026-10-04T07-13-53-927Z.json`, run 2, 07:08-07:15Z, no Mac sleep;
run 1 stopped at the glass div, which has no renderer while hidden, and agreed where it ran). iOS Simulator 15 Pro
Max, 430x775, hook builds (the arm + `__fwMorphSet` + the frame stepper). Rest = 2.5-3 s still after the walk; m set
by `__fwMorphSet` at the page end, 1.5 s each. Layers / layer memory in MiB, whole document (nav in brackets):

| spot | M best-build | R1 rev 1 | A rev 2 | B rev 2 + pre-promotion |
|---|---|---|---|---|
| top y 0 | 144 / 50.3 (15 / 16.0) | 148 / 50.3 (15 / 16.0) | 144 / 50.3 (15 / 16.0) | 144 / 50.3 (15 / 16.0) |
| mid 2620 | 58 / 93.0 (15 / 16.1) | 58 / 93.0 (15 / 16.1) | 58 / 93.0 (15 / 16.1) | 58 / 93.0 (15 / 16.1) |
| end (pin) | 54 / 88.8 (15 / 16.1) | 54 / 88.8 (15 / 16.1) | 54 / 88.8 (15 / 16.1) | 56 / 88.2 (17 / 15.6) |
| end, m 0.5 | 54 / 101.4 (15 / 28.8) | 57 / 105.3 (17 / 32.7) | 57 / 105.3 (17 / 32.7) | 57 / 105.3 (17 / 32.7) |
| end, m 1 | 54 / 105.8 (15 / 45.8) | 54 / 105.8 (15 / 45.8) | 54 / 105.8 (15 / 45.8) | 56 / 105.2 (17 / 45.2) |
| end, back at m 0 | 54 / 88.8 (15 / 16.1) | 54 / 88.8 (15 / 16.1) | 54 / 88.8 (15 / 16.1) | 56 / 88.2 (17 / 15.6) |

Reading (OBSERVED in the Simulator; device unverified):
- **While the reveal is on (m 0.5): +3 layers and +3.9 MiB** against best-build (2 more in the nav, 1 for the glass
  div). The review's "about 10 full-panel layers promoted" does not show in WebKit's layer tree: of the ~10
  `will-change` parts, WebKit reports 2 extra nav layers. So the open-start cost on the phone is not explained by
  10 new layers; which of the setup steps costs the time stays untested (the phone segment card is owed).
- **At rest nothing is left behind:** top, mid-page, the pin, m 1 and back at m 0 match best-build exactly in R1 and
  A (the R1 top 148 vs 144 is the hero; the nav is the same).
- **Rev 2 B** keeps 2 nav layers promoted at the page end at rest (56 vs 54), with 0.6 MB less memory there (the nav's
  backing is split differently). A keeps none.

Tween-start mechanism run (`rev2/tween-start-sim.mjs`, `out/morph-gpu/rev2/tween-start-sim-2026-10-04T06-46-25-542Z.json`,
430x775, driver M hold 2000 ms, 3 cycles; snapshots before the driver, in the first m = 1 hold, and at m = 0 before
the 2nd open):

| arm | layers | memory pre / m 1 / m 0 (MB) | paintCount sum, pre → m 0 before 2nd open |
|---|---|---|---|
| M best-build | 50 | 93.1 / 110.9 / 93.1 | 139 → 880 (+741) |
| R1 rev 1 | 50 | 97.4 / 110.9 / 93.1 | 135 → 511 (+376) |
| A rev 2, no pre-promotion | 50 | 97.4 / 110.9 / 93.1 | 140 → 476 (+336) |
| B rev 2 | 52 | 96.8 / 110.3 / 92.5 | 137 → 471 (+334) |

Reading (OBSERVED in the Simulator; device unverified):
- The reveal leaves no layers behind. Settled at m 1 and back at m 0, every arm has the same layer count and the same
  memory as best-build (110.9 and 93.1 MB). Rev 2 B keeps 2 more layers near the end (the pre-promoted parts).
- The `will-change` parts are promoted only while m moves, so no rest snapshot shows them; the census above has the
  mid-morph count (+3 layers).
- The +4.3 MB "pre" in R1 and A was read once per arm, 3.5 s after the scroll to the end; it is gone at m 0, and the
  census's rest reads at the end show no such difference. Cause unknown.
- Paint work over one full open and close is about half of best-build's (+376 vs +741), which is the rev 1 gain.

## Phone block: no-worse check against best-build (registration; written before any phone data)

PR-012 rev 1's gain row 5 ("Smoothness on the iPhone, pending, UNRESOLVED"). A short no-worse check under the less-work
rule (`memory/less-work-landing-rule.md`; N2 is not one of the top three, so no finger test), not a gain block. Timing:
the I-098 pause was lifted when the user answered T-052 (03:10Z, option A); a run that a Mac sleep or dark wake
falls into is VOID and re-run; after 2 sleep-VOIDs in a row the block parks (ops). Prediction id **P-092** (mgmt-ops-10); this text answers the ops
second read (R1-R3 and the pre-warm ruling); ops re-read it: PASS, registered at 55064128 with frames-n2
`f3a50b8ec2dd`. The block starts only on the lead's go. Template: P-085 (`fixes/morph-inherit/README.md`), which ran clean.
- **Question (one).** On the iPhone at real thermal Serious, under the morph driver M at the page end, does the reveal
  (V) show no more long moving frames than today's best build (C)?
- **Builds** (immutable snapshot copies, `node fixes/morph-gpu/build.mjs`; without the overlay it rebuilds V from
  best-build + the committed `delta.diff` and refuses any other hash; re-check by sha256 before the block; served
  `nodes/2.DyWL8TcE.js` / `assets/2.gBuqKVzi.css`):
  - V: `out/snapshots/rv-372b99478871`, `372b99478871` / `257507365449` (PR-012 rev 1, what would land).
  - The one control, C: `out/snapshots/best-65052c4a3902`, `65052c4a3902` / `e0f92804c521` (best-build = main 60df1cf:
    st6-rb2 + platform-idle + morph-inherit; `fixes/best-build/build.mjs --snapshot`). Both carry `__fwMorphDrive`
    (best-build's own; the reveal adds nothing to it).
  - Same base: site-pretty, the snapshot pinned by `baseline.json`. V = C + `delta.diff` (229 lines), nothing else.
  - Checkout and who runs it: the lead's call (P-085 ran on main with the runner's lease). The builds need only this
    branch's `fixes/morph-gpu/` and `fixes/best-build/`.
- **Servers and ports**, one per arm: `node tools/serve.mjs --root site-pretty --overlay out/snapshots/<snapshot>
  --port 0 --https --vendors=local --latency 150 --no-cache --state out/morph-gpu/phone/serve-<arm>.json`, plus one
  plain-baseline server for the pre-warm and the gate reads (the same command without `--overlay`, state
  `serve-base.json`; no run is counted on it). The phone loads the plain http twin (I-003). Ports go in the block log, never 5173; no LAN address in any committed file.
- **Driver M.** `iphone.mjs run --driver morph --probe std` with the defaults hold 2000 ms and cycles 3: 6 tweens per
  run through `E(1)` / `E(0)` at the page's max scrollY. The phone is 430 px wide, so the reveal is on in V
  (`width <= 640px`).
- **Condition** T-039 B (`memory/phone-checks-start-warm.md`), as P-085:
  - Real thermal Serious. Every hold runs `research/phone-thermal-gate/thermal-gate.mjs` (sha256 `4604218c4041`,
    `--expect serious --max-c 44 --url http://lan:<twin base>/`) at its start and end; a hold counts only when both reads
    say Serious with Is Induced = No, else it is re-run. Stop at 44 °C battery or Critical; cool before the next hold.
  - Two gate strikes (two gate-failed holds) → roll back to A (the lead's switch, in T-039 and the block log).
  - One start method: pre-warm on the plain baseline page (the base port) the same way before every hold and for
    every arm, as `memory/phone-checks-start-warm.md` says and P-085 did (the lead's ruling via ops on P-092, the P-073
    lesson: the start method must not confound the arm; the first draft said C's port).
  - Logged per run: battery °C, charging state, the timer-grid median. A Low Power Mode run is dropped and re-run.
  - Phone parts run inside the runner's own `lock.mjs run chrome-measure --no-timing --max-seconds 600` hold, with the
    `iphone` lease (I-056); `iphone.mjs open <twin URL>` before every run.
- **Block**, three holds: H1 gate, start sentinel, warm-ups (one uncounted load per arm port: `iphone.mjs run --driver
  morph --arm C|V --warmup`), gate; H2 gate, counted 1-4, gate; H3 gate, counted 5-8, end sentinel, gate; park Safari.
- **Counted runs:** n = 4 per arm, order C V V C C V V C: `iphone.mjs run --driver morph --probe std --owner <runner>
  --block N2 --arm C|V --pos <1-8> --build best-65052c4a3902|rv-372b99478871 --label n2-<arm>-<pos>`.
  - Arm C is the control, so iphone.mjs judges every counted C run as the M heat sentinel (held m = 1 p95 ≤ 18 ms,
    `tools/lib/iphone-run.mjs`). P-085's mi arm (best-build minus platform-idle) held 17 ms in 4 of 4 runs at Serious.
    The protocol rule applies (§5.2): a C run that does not pass voids itself and every counted run since the last
    passing one. Not passing = `pass` false (a fail), or no `meta.sentinel` / `pass` null (not judged), which counts as
    a fail (ops R1). Ops accepted arm C as the M sentinel (P-092 second read).
- **Sentinel** (as P-085): an uncounted `iphone.mjs run --driver scroll --probe std --arm C --heat-sentinel` on C's
  port, bottom ≥ 58 fps and scroll ≥ 44 fps, in H1 and H3. A failing start sentinel: no counted run starts; cool,
  restart. A failing end sentinel voids every counted run; cool, re-run the counted part once.
- **Void run** (`phone/frames-n2.mjs`'s rules): a driver error, not driver M, a warm-up, Low Power Mode, served js/css
  not the arm's build, no drive mark, no m seen by the probe, a tween-start count ≠ 6, a C run whose M sentinel did not
  pass (false, null or missing; above).
  One in-place re-run; a second void at one position voids the block. Files from a hold that failed either gate read
  are never passed to the scorer (the block log lists them as excluded).
- **Scorer**, committed before data: `phone/frames-n2.mjs`, sha256 `f3a50b8ec2dd` (ops R1; first registered as
  `fad6d7eadcb4`, which let a C run with no sentinel or `pass` null through unjudged), every valid counted run passed in
  block order. P-085's `frames-p085.mjs` (`385eb00f1564`) with: arms C / V, the protocol sentinel-void rule, a
  'better' verdict, a minimum of 3 valid runs per arm, and the A6 reports.
  - Scopes: 'moving' is scored (a frame whose m differs from the previous or next frame's m); 'drive' and 'held1'
    are reported.
  - Thresholds: dt > 50 and > 34, the ±4 ms twins (>46/>54, >30/>38), near-band frames flagged.
  - Verdict on the arm medians, d = V − C: 'better' when d ≤ −2 and every V run is below every C run; else
    'no-worse' at d ≤ +1 ('>50') / ≤ +2 ('>34'); else 'WORSE'. Threshold-sensitive when a twin's verdict differs.
    Fewer than 3 valid runs in an arm: no verdict ('insufficient').
  - A6 (reported, not scored): the |Δm|-weighted dt per run and arm, and the moving frames by time since tween start
    ([0,100) [100,250) [250,500) [500,∞) ms: n, >34, >50).
  - Pre-registration check only (synthetic files with known counts, order C V V C C V V C): better (d −6 / −24),
    equal (0 / 0, no-worse), worse (+6 / +6, WORSE), and a void case (a failing C at pos 4 voided pos 2-4; a wrong
    served js voided pos 7; C 3 / V 1 valid → insufficient), and a null-sentinel case (C pos 4 with no sentinel voided
    pos 2-4, C pos 8 with `pass` null voided pos 6-8; C 2 / V 0 valid → insufficient). All as expected. No driver-M phone run of C or V exists
    to re-score.
- **Predictions**, as falsifiers, P(hit) before data. The points come from P-085's mi arm at Serious (the same
  driver; mi = best-build minus platform-idle): moving > 50 per run 1, 0, 0, 1, > 34 1, 0, 1, 1, held m=1 p95 17 ms.
  C sits at the floor, so a 'better' verdict on these counts is close to impossible: this block can show no-worse,
  not a gain. The reveal's gain stays the Simulator paint counts (12.3 → 2.3 paints per frame), as PR-012 says.

  | # | prediction | point | interval (falsified outside) | P(hit) |
  |---|---|---|---|---|
  | f50 | moving dt > 50, V − C (arm medians) | 0 (C ~0.5) | ≤ +1 (WORSE above +1, as the scorer: medians of 4 can be half-integers); twins >46/>54 the same bound | 0.85 |
  | f34 | moving dt > 34, V − C | 0 (C ~1) | ≤ +2 (WORSE above +2); twins >30/>38 the same bound | 0.85 |
  | better | 'better' on f50 or f34 | no | a 'better' verdict falsifies the floor reading | 0.95 |
  | wdt | \|Δm\|-weighted dt, V − C (reported) | 0 ms | \|d\| ≤ 1 ms | 0.7 |
  | sentM | every counted C run passes held m = 1 p95 ≤ 18 ms | pass | one fail costs a cool and the voided runs | 0.8 |
  | sent | start and end S sentinels pass on C's page at Serious | pass | a fail costs a cool and a restart | 0.75 |

- **Decisions** (if X then Y):
  - **f50 and f34 no-worse (or better), not threshold-sensitive, drive scope no-worse:** the phone no-worse check
    passes. With PR-012 rev 1 accepted, that meets the less-work gate: land request to the lead. A 'better' verdict is
    reported as a phone smoothness result on top; it changes no landing step.
  - **f50 or f34 WORSE (moving scope):** to the lead, with the slow moving frames per run (dt @ m) and the A6 profile.
    No land request. The lead decides: drop, or a new rev to the user (e.g. the reveal only on the close tween).
  - **Threshold-sensitive f50 or f34, in the moving or the drive scope** (a twin's verdict differs, ops R3): to the
    lead, with no verdict. No land request until the lead rules.
  - **Drive-scope WORSE with moving no-worse:** to the lead (frames outside the tweens), no verdict on the fix; no land
    request until the lead rules.
  - **Insufficient / block void:** no claim. Cool and re-run the counted part once; a second void goes to the lead.
  - **Gate failures:** as condition B above (re-run the hold; two strikes → A, the lead's switch).
- **Not in this block:** the stale clip at m = 1 (a compositor paint question; a DOM read can't see it, the Simulator
  frozen frames cover it, README "Stale clip"), reduced motion, finger (G/F), Fair.
- **Expected minutes:** about 30 (range 25-45): pre-warm to Serious about 10; H1 about 6; H2 about 6 (4 runs at about
  1.2 min); H3 about 8; about 1.5 min of gate reads per hold.

## Phone block P-092: result (2026-10-04, after the registration above; nothing in it was changed)

Ran from this worktree under the `iphone` lease (05:34:52Z-06:06:15Z) in three `--no-timing` chrome-measure holds of
at most 900 s, each wrapped in `caffeinate -i -s`. Scored with `phone/frames-n2.mjs` `f3a50b8ec2dd`, all 8 counted runs
in block order (C1 V2 V3 C4 C5 V6 V7 C8). No re-runs, no void runs, no excluded files. The Mac did not sleep during the
block (`pmset`: last wake 02:37Z).

| hold | time (Z) | steps | start gate | end gate | battery °C |
|---|---|---|---|---|---|
| H1 h053928 | 05:39:28-05:42:48 | S1 wC wV | Serious, PASS | Serious, PASS | 40.3 → 40.0 |
| H2 h054715 | 05:47:15-05:51:19 | C1 V2 V3 C4 | Serious, PASS | Serious, PASS | 40.4 → 40.5 |
| H3 h060058 | 06:00:58-06:05:46 | C5 V6 V7 C8 S2 | Serious, PASS | Serious, PASS | 42.1 → 41.4 |

Sentinels:
- S on C's page: S1 bottom 60 / scroll 58.2 PASS, S2 60.1 / 57.9 PASS.
- M sentinel: every counted C run held m = 1 at p95 17 ms (≤ 18), PASS 4 of 4.
- rAF 59 Hz in every run; none ran in Low Power Mode.

Per run (frames; moving scope scored, drive scope reported):

| run | moving >50 (>46/>54) | moving >34 (>30/>38) | drive >50 | drive >34 (>30/>38) | \|Δm\|-weighted dt ms |
|---|---|---|---|---|---|
| C1 | 2 (3/1) | 8 (8/7) | 3 | 11 (14/9) | 18.51 |
| V2 | 2 (2/2) | 5 (7/3) | 2 | 6 (12/3) | 16.87 |
| V3 | 2 (2/2) | 3 (5/3) | 2 | 4 (7/3) | 15.89 |
| C4 | 2 (2/1) | 6 (7/2) | 2 | 8 (10/4) | 17.45 |
| C5 | 2 (2/2) | 5 (6/5) | 3 | 7 (9/7) | 18.13 |
| V6 | 2 (2/2) | 3 (6/3) | 2 | 4 (12/4) | 16.08 |
| V7 | 2 (3/2) | 4 (5/3) | 3 | 6 (9/5) | 16.66 |
| C8 | 2 (2/2) | 5 (6/3) | 3 | 9 (13/6) | 16.88 |

Verdicts (arm medians, d = V − C):

| scope | threshold | C | V | d | verdict | twins (d, verdict) | threshold-sensitive |
|---|---|---|---|---|---|---|---|
| moving | >50 | 2 | 2 | 0 | no-worse | >46 0, >54 +0.5, both no-worse | no |
| moving | >34 | 5.5 | 3.5 | −2 | no-worse (ranges meet at 5) | >30 −1, >38 −1, both no-worse | no |
| drive | >50 | 3 | 2 | −1 | no-worse | >46 −1.5, >54 +0.5, both no-worse | no |
| drive | >34 | 8.5 | 5 | −3.5 | better (every V run below every C run) | >30 −1, >38 −3, both no-worse (ranges overlap) | **yes** |

Predictions:

| # | prediction | result | hit |
|---|---|---|---|
| f50 | moving >50, d ≤ +1 | d = 0 | hit |
| f34 | moving >34, d ≤ +2 | d = −2 | hit |
| better | no 'better' on moving f50/f34 | none (drive >34 'better' at 34 ms only, a reported scope) | hit |
| wdt | \|Δm\|-weighted dt, \|d\| ≤ 1 ms | V 16.37 − C 17.79 = −1.42 ms | miss (in V's favour) |
| sentM | all counted C pass p95 ≤ 18 | 4 of 4 at 17 ms | hit |
| sent | S1 and S2 pass | both | hit |

C's moving >50 point was off (predicted ~0.5 from P-085's mi arm, measured 2 in every run). mi was best-build minus
platform-idle, and C here is best-build, so the two arms differ. The interval is on d, so the verdict is not affected.

**Decision (registered table):** moving f50 and f34 are no-worse and not threshold-sensitive, but drive-scope '>34' is
threshold-sensitive. That falls under "Threshold-sensitive f50 or f34, in the moving or the drive scope: to the lead,
with no verdict. No land request until the lead rules." The sensitivity points one way only: 'better' at 34 ms and
'no-worse' at both twins. No scope or threshold reads WORSE.

**Lead ruling:** PASS as **no-worse**, not 'better'. The block was registered as a no-worse check, and every scope and
threshold, the twins included, reads no-worse or better. Drive '>34' is recorded as "threshold-sensitive (better at
34, no-worse at the twins)", and no gain is claimed from it.

**Cost: the first frame of a repeat open is longer in V** (wording corrected after review B1, 2026-10-04; the first
version said "every tween-start frame", which was too broad). Every run in both arms has exactly 2 moving frames over
50 ms. Both are the first frame of the 2nd and 3rd open of the run (O2, O3: m 0.004-0.061, the [0, 100) ms
since-start bucket), i.e. a repeat open after a full close. Their length differs by arm:
- C: 54-56 ms (median 55);
- V: 60-64 ms (median 62).

All 8 of V's O2/O3 first frames are longer than every one of C's. The '>50' count is equal. The >54 twin picks this
up only as +0.5 on the median, because C's frames sit at 54-56.

Per tween, first frame and the sums of the first 2 and 3 frames (ms, median of the 4 runs per arm, `driverResult.driver.frames`;
a tween starts at the first frame whose m leaves 0 or 1):

| tween | C f1 | V f1 | C f1+f2 | V f1+f2 | C f1..f3 | V f1..f3 |
|---|---|---|---|---|---|---|
| O1, first open per page load | 34.5 (33-49) | 41 (40-49) | 49.5 | 56 | 63 | 69 |
| O2, repeat open | 55 (54-56) | 62 (60-64) | 71 | 72.5 | 83 | 83 |
| O3, repeat open | 55 (54-55) | 62 (60-63) | 70.5 | 70 | 83 | 83 |
| C1-C3, close starts | 38.5-39.5 (37-40) | 32.5-33 (30-36) | 57.5 | 38.5-43 | 71.5-72 | 50-50.5 |

Reading (OBSERVED in our setup, M driver):
- At the repeat opens the +7 ms first frame is paid back in the next frame: the first 2 frames sum to 71 vs 71 (O2
  72.5 vs 71, O3 70 vs 70.5), the first 3 to 83 vs 83.
- The first open per page load is the case a reader meets: V 41 vs C 34.5 ms, n = 4, ranges overlap (40-49 vs 33-49);
  over 3 frames 69 vs 63.
- Close starts are SHORTER in V: first frame 33 vs 39 ms, first 3 frames 50 vs 72 ms.
- Whether any displayed frame is lost is UNRESOLVED: the phone's 1 ms stamps mark the rendering-update start and are
  not vsync-quantized above one vsync (claims-audit §2.3), so a longer first gap followed by a shorter one may or may
  not drop a frame on screen.
- The cause of the longer open start is untested. The likely reading: the reveal's setup in the switch-on frame
  (creating the dark and glass divs, a forced layout read, the nav resized to the panel, new layers: +3 layers and
  +3.9 MiB in the Simulator; the Chrome mechanism check in "Rev 2" shows the forced layout and the extra paints there).

Because of the open-start cost, rev 1 does not enter the next best build. It stays in the GPU preview, labelled with the
cost, and rev 2 targets it.

Near-band frames (flagged, not scored; sums over the 4 runs per arm, `score.json`): moving (30, 38] C 10 / V 11,
(46, 54] C 3 / V 1; drive (30, 38] C 20 / V 25, (46, 54] C 7 / V 1.

Runner deviations (logged in the block log, out of the registered text):
- holds of 900 s instead of 600 (the lead's rule);
- an early pre-warm on the base page under the lease while H1 queued (T-058 hand-over rule), and a keep-warm loop on
  base (W cycles to 43 °C) while H2 and H3 queued (the lead's 05:36Z instruction);
- the phone came in at 42 °C from P-095, so H1's first pre-warm ran 0 cycles.

Files (local, `out/morph-gpu/phone/`, listed in `evidence.json`): the eight `n2-<arm>-<pos>.json`, `n2-S-S1.json`,
`n2-S-S2.json`, `n2-wC.json`, `n2-wV.json`, `score.json`, `gates.jsonl`, `holds.jsonl`, `runs.jsonl`, `batt.jsonl`,
`BLOCKLOG.txt`.

## Rev 2 (record only; P-098: does not fix the open start): the reveal's setup before the tween starts

The lead's ruling on P-092 (2026-10-04): rev 1 passes as no-worse, but the first frame of an open is longer on the
iPhone (repeat opens +7 ms, paid back the next frame; the first open per load 41 vs 34.5 ms, overlapping), so it stays
out of the next best build. Rev 2 moves the reveal's setup off that frame:
- creating the dark and glass layers;
- the layout read;
- the layer promotion (`will-change`) and the switch to the panel-sized nav.

The setup moves to a crossing on the approach, before m leaves 0. Steps: a Chrome and Simulator mechanism check that
the setup work leaves the tween-start frame (shared lane, no phone), then a pre-registered short phone no-worse block
through mgmt-ops-10. Its falsifier (after review B1): judged on the first open per page load, not on the driver's
repeats; first frame V ≤ C + 2 ms, plus the first-2 and first-3 frame sums and the close starts (V no longer than C
by more than the same bound).

**What rev 2 changes** (`rev2/delta.diff` against best-build, `rev2/rev1-to-rev2.diff` against rev 1; built by
`node fixes/morph-gpu/rev2/build.mjs`):
- `__rvPrep`, run 300 ms after scrolling stops (and once after load), on phones within 3 viewports of the page end:
  - creates the dark and glass divs;
  - measures the panel size once with a hidden probe div (no toggle of `data-fw-rv`, so no width transition);
  - B only (`__rvPP`): sets `data-fw-rvp` on the nav, which promotes the moving parts with `will-change` ahead of time.
- The switch-on in `__rvW` then reads no layout when the probe already ran.
- Snapshots: B `rv2b-f993a405620c` (js `f993a405620c`, css `f7071e9138ac`), A `rv2a-ef9d1c9d5fca` (`__rvPP` off, same
  css), hook builds `rv2bhook-9667bc5c7d9c`, `rv2ahook-5bf004426809`.

**Mechanism check, Chrome** (`rev2/tween-start-chrome.mjs`, `out/morph-gpu/rev2/tween-start-chrome-2026-10-04T06-28-43-904Z.json`;
headless 430x932 DPR 3, driver M hold 1500, 3 cycles; the switch-on frame of each open, per tween):

| arm | style recalcs (forced) | elements | layouts (forced) | dirty objects | Paint events | layers before |
|---|---|---|---|---|---|---|
| M best-build | 2 (1) | 128 | 1 (0) | 8 | 4-6 | 77 |
| R1 rev 1 | 3 (2) | 155 | 2 (1) | 19 | 15 | 77 |
| A | 2 (1) | 139 | 1 (0) | 15 | 15 | 80 |
| B | 2 (1) | 139 | 1 (0) | 12 | 15 | 83 |

Rev 2 removes rev 1's forced layout and its extra style pass from the switch-on frame. The ~10 extra paints stay: the
nav still resizes from pill to panel in that frame. (The trace's paint areas were unbounded clip quads, not usable.)

**Mechanism check, Simulator** (`rev2/tween-start-sim.mjs`, `out/morph-gpu/rev2/tween-start-sim-2026-10-04T06-46-25-542Z.json`;
430x775, driver M hold 2000, 3 cycles; WebKit Timeline counts in the switch-on frame; ms never judged, F-084):

| arm | opens O1 / O3 / O5: Paint records (k css px) | closes C2 / C4 / C6: Paint records (k css px) | styles, forced; layouts, forced (every open) |
|---|---|---|---|
| M | 10 (779) / 9 (598) / 10 (640) | 11 (1160) / 11 (1163) / 11 (1118) | 2, 1; 2, 1 |
| R1 | 8 (340) / 6 (83) / 5 (173) | 3 (450) / 9 (860) / 9 (858) | 2, 1; 2, 1 |
| A | 5 (175) / 5 (82) / 3 (50) | 1 (1) / 9 (858) / 9 (861) | 2, 1; 2, 1 |
| B | 6 (178) / 5 (82) / 3 (50) | 1 (1) / 1 (1) / 1 (1) | 2, 1; 2, 1 |

Reading (OBSERVED in the Simulator):
- In WebKit the forced style and layout counts in the open's first frame are the same in every arm, best-build
  included (the page's own `E()` start). So rev 1's extra forced layout seen in Chrome does not show as an extra
  record here.
- The open's first frame paints less in rev 2 than in rev 1: 3-5 records and 50-175k px against 5-8 and 83-340k px.
- At a close, the one ~860k px repaint lands in the first or the second frame depending on the frame cut, in every
  reveal arm. In B's three closes it fell in the second frame each time; that is not a saving, only a shift.
- A and B do not differ at the opens. B's pre-promotion adds 2 layers at rest near the end and a pixel risk (promoted
  text can rasterize differently), with no count gain here. Frozen-frame pixel checks for A and B are still to run.

**Frozen-frame pixels, rev 2** (`gates/frames.mjs --rv <hook build>`, Chrome 430x932 DPR 3; M = best-build + hook,
R = the arm + the same hook, M2 = a second M load). T2 numbers per the tier rule: pixels more than 8 levels off that are
not also more than 8 levels off in the A/A pair; edge vs fill as `research/pixel-tolerance/README.md` (flat = the 3x3
neighbourhood in M varies by 2 levels or less). Helper (local): `out/morph-gpu/rev2/t2.mjs <frames dir>`.

| frame | A (`rv2ahook-5bf004426809`) | B (`rv2bhook-9667bc5c7d9c`) | rev 1 (2026-10-03) |
|---|---|---|---|
| rest m = 0 (k0) | 0 px beyond A/A: exact | 3,178 px = 353 css px, 0.088 %, edge max **236**, fill max 51 | exact |
| rest m = 1 (k14) | 0 px beyond A/A: exact | 2,513 px = 279 css px, 0.07 %, edge max 111 | exact |
| rest m = 0 after the close (k17) | 10 px = 1 css px, edge max 14 | 3,168 px = 352 css px, edge max **236** | exact |
| motion m = 0.5 (k7) | 175 (edge; fill 87), 0.21 %, 855 css px | same as A | 175 (edge), 0.22 %, 869 css px |
| motion m = 0.99 (k13) | 236 (edge), 1.50 %, 6,006 css px | same as A | 237 (edge), 1.49 %, 5,965 css px |

- **B fails T2 at rest**: the nav's "Join waitlist" text and the logo sit about one device pixel off in the promoted
  layers (edge pixels at 236, over T2's 128). Crop and diff map: `out/morph-gpu/rev2/crop.py`, local.
- **A is exact at rest**, and its motion frames equal rev 1's within the run's noise. So the visual is rev 1's: T3
  motion, the class PR-012 rev 1 was accepted with. Nothing new to show the user.
- Today's A/A pair is noisier than on 2026-10-03 (about 530-740 px over 8 per frame, max 168-186, the same spots in
  every frame), so the A/A mask is wider. A's rest frames are 0 beyond it.
- Sources: A `out/morph-gpu/frames-2026-10-04T07-36-19-311Z`, B `out/morph-gpu/frames-2026-10-04T07-22-26-797Z`.
- Simulator (WebKit, `gates/sim-frames.mjs`, `RV=out/snapshots/rv2ahook-5bf004426809`, page band y 60-834 css,
  `out/morph-gpu/simframes-2026-10-04T07-45-21-851Z`): A is exact at rest (m 0, m 1, m 0 after the close: 0 px beyond
  A/A, max 19 / 1 / 2). Motion is rev 1's class: m 0.99 237 (edge; fill 218), 1.32 %, 5,301 css px (rev 1: 233,
  1.30 %, 5,194).

**Arms (the lead's ruling):** B fails the illusion rule at rest and showed no count gain over A (Simulator opens
3-5 paints in both). B is dropped. The phone block is two arms, C (best-build) against A.

Next: the rev 2 phone ticket to mgmt-ops-10 (registration below).

## Phone block rev 2: the open start, C against A (registration; written before any phone data)

Prediction id **P-098** (mgmt-ops-10; pre-data read PASS on 618b43b8: scorer hash, its diff against frames-n2, the
P-092 re-score and the served hashes checked). A no-worse check like P-092, with the falsifier from review B1.
Everything not named here is P-092's registered text ("Phone block: no-worse check against best-build" above):
servers and ports, condition T-039 B with the thermal gate per hold, the pre-warm on the plain baseline page,
sentinels, void rules, Mac-sleep rule, runner duties.
- **Question (one).** Does rev 2 A remove rev 1's longer first frame of the first open per page load, without giving
  back the shorter close starts or adding long moving frames?
- **Builds** (immutable copies, `node fixes/morph-gpu/rev2/build.mjs`, sha256 re-checked before the block):
  - V = A: `out/snapshots/rv2a-ef9d1c9d5fca`, js `ef9d1c9d5fca`, css `f7071e9138ac` (best-build + `rev2/delta.diff`,
    `__rvPP` off).
  - C: `out/snapshots/best-65052c4a3902`, `65052c4a3902` / `e0f92804c521`, as P-092.
  - Same base: site-pretty at the pinned snapshot. Both carry best-build's `__fwMorphDrive`.
- **Driver M**, as P-092: `iphone.mjs run --driver morph --probe std`, hold 2000 ms, cycles 3. The driver jumps to the
  page end and starts the first open 1.1 s later, so rev 2's setup (300 ms after scrolling stops) has run before O1,
  as in the Chrome and Simulator mechanism checks. The finger case is not in this block (see Risks).
- **Block**: one block, 8 counted runs in the order C V V C C V V C (n = 4 per arm), one uncounted warm-up per arm.
  **Holds (registered; the lead approved three holds, P-092 precedent):** H1 gate, start sentinel, warm-ups wC wV,
  gate; H2 gate, C1 V2 V3 C4, gate; H3 gate, C5 V6 V7 C8, end sentinel, gate; park Safari. Each hold at most 900 s
  (a single hold, about 18 min, would pass the cap).
- **Scorer**, committed before data: `phone/frames-rv2.mjs`, sha256 `fa2212d0a307`. It is frames-n2.mjs (P-092,
  `f3a50b8ec2dd`) with V's build hashes changed and one addition, the per-tween start frames:
  - a tween starts at the first driver row whose m leaves a held 0 (opens O1-O3) or a held 1 (closes C1-C3);
  - per tween f1 = that frame's gap, f2 = the sum of the first 2 gaps, f3 = the first 3;
  - 'close' = per run the median of C1-C3, then per arm the median of runs;
  - per key, d = median(V) − median(C), in ms: 'no-worse' at d ≤ +2 ms, 'better' at d ≤ −2 ms with every V run below
    every C run, else 'WORSE';
  - scored keys: O1.f1, O1.f2, O1.f3, close.f1, close.f3; O2/O3 and each close are reported;
  - a run without exactly O1 C1 O2 C2 O3 C3 in its driver rows is void.
  - Pre-registration check (`out/morph-gpu/rev2/scorer-check.mjs`, local):
    - P-092's files, with V relabelled as rv2a, reproduce the P-092 per-tween table: O1.f1 C 34.5 / V 41 (d +6.5,
      WORSE), O1.f3 63 / 69 (WORSE), close.f1 38.5 / 33 (better). So rev 1 would fail this falsifier.
    - V = C's own frames: every key d 0, no-worse.
    - A run cut to 5 tweens: void.
- **Predictions** (falsifiers, P(hit) before data). Basis: in Chrome rev 2 removes rev 1's forced layout and extra
  style pass from the open's first frame. In the Simulator the open's first frame paints 3-5 records in A against 5-8
  in rev 1 and 9-10 in best-build. P-092's O1 spread is wide (C 33-49 ms) and n = 4, so the O1 calls are close to a
  coin toss.

  | # | prediction | point | interval (falsified outside) | P(hit) |
  |---|---|---|---|---|
  | o1 | O1.f1, V − C (ms) | 0 | ≤ +2 | 0.55 |
  | o1s | O1.f2 and O1.f3, V − C | 0 | ≤ +2 each | 0.55 |
  | cl | close.f1 and close.f3 | 'better' (−5 / −20, as rev 1) | ≤ +2 each | 0.9 |
  | f50 / f34 | moving > 50 / > 34, as P-092 | 0 / −1 | ≤ +1 / ≤ +2, twins the same | 0.85 |
  | rep | O2.f1, O3.f1 (reported) | 0 | ≤ +2 | 0.5 |
  | sent | sentinels (S start and end, M on every C run) | pass | as P-092 | 0.75 |

- **Decisions** (if X then Y):
  - **Every scored tween key no-worse or better, f50 and f34 no-worse, not threshold-sensitive:** rev 2 A removes the
    open-start cost. To the lead as the candidate for the next best build, in place of rev 1. A 'better' on the closes
    is reported; no gain is claimed beyond P-092's closes.
  - **O1.f1 WORSE:** rev 2 does not fix the open start. To the lead with the per-run O1 frames. Rev 2 stays out; no
    third block on this question (§5.3).
  - **O1.f1 no-worse but O1.f2 or O1.f3 WORSE** (the cost moved to the next frame): to the lead, no verdict.
  - **close.f1 or close.f3 WORSE, or f50/f34 WORSE or threshold-sensitive:** to the lead, no verdict, no land request.
  - **Insufficient or void:** no claim; cool and re-run the counted part once; a second void goes to the lead.
- **Ops notes from the pre-data read** (reported with the result):
  - a tween that starts in the driver's last 2 rows is not found, so the run is void. That is strict, and accepted;
  - in the rev 1 data, O2.f1 and O3.f1 are +7 ms (WORSE). They stay reported in the 'rep' row, not scored;
  - P-092's drive '>34' 'better' was threshold-sensitive. If it shows again, it is reported as such.
- **Not in this block:** the finger case (F), Fair, reduced motion, desktop.
- **Ports (amended before any data, I-131, the lead 2026-10-04).** `serve.mjs` sends `/_app/immutable` files as
  `immutable, max-age=1y`, so Safari may keep an earlier build's copy on a reused port. Until ts-i131's fix lands, each
  arm is served on a fixed plain-http port that served no other build today, with no `--https` (so no random http
  twin; the phone loads plain http as before, I-003): base `--port 5791`, C `--port 5792`, V `--port 5793`, each
  with `--vendors=local --latency 150 --no-cache` as above. Checked free on 2026-10-04 at 09:20Z
  (`out/morph-gpu/rev2/ports-today.mjs`: every port in today's serve state and phone or Simulator run files). The
  runner re-checks before H1. If one is taken, it uses the next free one from 5794-5799 and logs it in the block log.
- **Before landing, a G check of a fling into the end** (the lead's ruling, 2026-10-04): P-099, registered below.
- **Expected minutes:** about 30 (25-45), as P-092.

## Phone block P-098: result (2026-10-04, after the registration above; nothing in it was changed)

**Rev 2 A does not fix the open start.** The first frame of the first open is 6.5 ms longer than best-build's, the same
as rev 1 in P-092. Under the registered decision rev 2 stays out, and there is no third block on this question. P-099
(the G check below) is skipped under ops N2.
- **Holds** (iPhone 15 Pro Max, condition T-039 B, driver M, plain http on 5791-5793 `--no-cache`, snapshot `b…`
  pinned on this branch):
  - H1 `h095732` (09:57-10:10Z): gate, S1, wC, wV, gate; valid.
  - H2 `h101729` (10:17-10:27Z): C1, V2, V3, C4; valid.
  - H3, first try `h105629`: during a 25 min queue wait the phone cooled to Nominal 34.9 °C. Three warm tries reached
    only Fair 38.2 °C, so the start gate never passed: stopped with 0 runs, no data.
  - H3, retry `h111132` (11:11-11:16Z): an early pre-warm under the lease reached 39.6 °C. C5, V6, V7, C8, S2; valid.
  - Every gate was real Serious (39.0-39.9 °C). No Mac sleep. No void run.
  - Sentinels: S1 bottom 59.6 / scroll 58.6 fps, S2 60.1 / 58.1; M sentinel true (p95 17 ms) on all 4 C runs.
- **Scored keys** (`phone/frames-rv2.mjs` `fa2212d0a307`; local output `out/morph-gpu/phone/rv2/p098-score.txt`):

  | key | C runs (ms) | V runs (ms) | C med | V med | V − C | verdict |
  |---|---|---|---|---|---|---|
  | O1.f1 | 36 35 35 34 | 40 55 43 38 | 35 | 41.5 | +6.5 | **WORSE** |
  | O1.f2 | 49 50 49 47 | 51 63 54 54 | 49 | 54 | +5 | WORSE |
  | O1.f3 | 65 67 61 58 | 58 73 68 67 | 63 | 67.5 | +4.5 | WORSE |
  | close.f1 | 41 39 40 38 | 31 31 32 41 | 39.5 | 31.5 | −8 | no-worse |
  | close.f3 | 72 71 72 72 | 50 50 50 67 | 72 | 50 | −22 | better |

  - Long frames while moving: > 50 d +0.5, > 34 d −2, both no-worse, twins the same.
  - Drive '> 34' d −0.5: threshold-sensitive (its > 30 twin is WORSE, +4.5), as ops noted for P-092.
- **Reported:**
  - O2.f1 +5 (C 55 / V 60) and O3.f1 +6 (55.5 / 61.5), both WORSE; O2/O3 f2-f3 equal.
  - Each close: C1-C3 f1 −7 to −8, f3 −20 to −22.
- **Predictions:**

  | # | result | hit? |
  |---|---|---|
  | o1 | O1.f1 +6.5 | miss |
  | o1s | O1.f2 +5, O1.f3 +4.5 | miss |
  | cl | close.f1 −8, close.f3 −22 | hit |
  | f50 / f34 | +0.5 / −2 | hit |
  | rep | O2.f1 +5, O3.f1 +6 | miss |
  | sent | all pass | hit |

- **What it says** (OBSERVED in our setup, cause unknown):
  - The second and third opens of a run cost 5-6 ms more in their first frame too. Rev 2's setup has certainly run
    before them: the page has rested at the end for seconds, and the opens follow a close.
  - So the open-start cost on the phone is not the setup that rev 2 moved out of the tween. It sits in starting the
    reveal itself.
  - Candidates, none checked:
    - compositing-layer promotion of the reveal parts at the tween start (F-213: an animation start on a
      non-composited part costs a compositing update on the main thread);
    - the first clip-path change.
  - Next step, if the lead wants one: trace it from a Timeline attribution run (Simulator or phone, no timing), not
    with a new timed block.
- **Decision (registered):** O1.f1 WORSE, so rev 2 does not fix the open start. To the lead with the per-run O1 frames
  (above). Rev 2 stays out; no third block on this question (§5.3). The closes remain faster, as with rev 1.

## What repaints at the open start (Simulator attribution, 2026-10-04; counts only, no timing)

All of this is OBSERVED in our setup: WebKit's reason for the repaint is not checked against a reference. Simulator
ms are never judged (F-084).

**Correction to earlier readings.** In the M-driver data (`rev2/tween-start-sim.mjs`), the frame that first shows
m > 0 is the window before the first logged m > 0. The logger's rAF runs ahead of the spring's rAF in the same frame,
so it still logs 0. Read that way, the first open frame repaints about 30 rects in every build and on every open,
the warm 2nd and 3rd opens included. The earlier "3-5 paints in A" counted the frame after it.

| first open frame | O1 paints / kpx | O2 | O3 | first frame of the close | end of the close (back to m = 0) |
|---|---|---|---|---|---|
| best-build | 32 / 2155 | 29 / 1490 | 29 / 1531 | 13-14 / ~1300 | 22 / 1076 |
| rev 1 | 34 / 2277 | 31 / 1651 | 31 / 1649 | 9-11 / ~900 | 22 / 1076 |
| rev 2 A | 34 / 2281 | 31 / 1648 | 31 / 1645 | 9-10 / ~785 | 21-22 / 1075 |

That frame also holds the run's largest Composite record. Frames later in the tween repaint 1 rect in rev 2.

**Ablation** (`rev2/open-cause-sim.mjs`, best-build and rev 2 A, two runs):
- Method: each write that the open's first frame makes was applied alone at m = 0, from a plain task, held 450 ms,
  then reverted; twice each, in both builds.
- Measured: paints in the frame that carries the change, and per-layer paintCount (LayerTree) before and after.

| write, applied alone | frame with the change | per-layer repaints in 450 ms |
|---|---|---|
| `--morph-fade` 1 → 0.99 on `#platform` (S(); its `filter: blur((1-f)*12px)` and `opacity: f`) | **19 paints / 1049 kpx**, a 65-123 ms frame, both ways, every time | 15-16 platform layers, 1-2 each; layer count unchanged |
| `--morph` 0 → 0.001 (header and the __mkW targets) | 2 / 28 | header 27, `.is-earn` 19 (gets its own layer, 50 → 51), actions 8: the earn button's 0.68 s max-width/padding transition (fix-nav-morph's T-107) |
| header `is-morphing` class flip | 0-1 / ≤ 21 | top bar 1 |
| root `overscroll-behavior-y` | 0 | none |
| rev 2's `data-fw-rv` alone (no clip) | 12 / 900 | panel column tracks repaint 31-53 times (this state never occurs alone; not a cause) |

**Cause (OBSERVED, cause in WebKit unknown).** About 2/3 of the open-start repaint (19 of ~30 rects, ~1.05 of
~1.6 Mpx) is `#platform` switching from no blur and full opacity to `blur(> 0)` / `opacity < 1`. The page section
under the nav is repainted in full in that frame. The reverse switch, `--morph-fade` back to 1 at the end of a close,
repaints it once more: that is the 22-rect frame. The steps in between are not repainted. Most of the remaining
~10 rects come from the earn button's transition starting (header layer).

- Neither revision touches `#platform`'s fade (`QM(m) = 1 - m / 0.55`), which is why rev 1 and rev 2 did not change
  the open start (P-098).
- This cost lands only where m leaves or returns to 0, i.e. on a push past the end (wheel or touchmove with O() true,
  JS 13303-13324). A fling that ends at the bottom with the finger up keeps m = 0.

**Next (not started; stop before rev 3, lead).** Candidate directions for a later proposal, all to be checked
pixel-identical:
- keep `#platform` in its filtered state while it sits at the end;
- or move its fade and blur onto a layer that is already composited before m leaves 0.

Before any of these, the WebKit side (why a 0 → non-zero blur or opacity < 1 repaints the subtree, while later
changes don't) goes through the claims process.

### Design check (run 4, best-build, 2026-10-04 12:59Z; lead ruling: `#platform`'s fade is this topic's)

`rev2/open-cause-sim.mjs M op,blur,wc+,fade,fade,wc-,pre+,fadeP,fadeP,pre-`: same method as above, each write applied
at m = 0 from a plain task. "Max frame" is the frame with the most paints in [change − 17 ms, change + 400 ms].
OBSERVED in our setup; cause in WebKit unknown.

| write on `#platform`, applied alone | max frame paints / kpx | platform layers repainted |
|---|---|---|
| `opacity` 1 → 0.99 (inline, fade untouched) / back | 19 / 1049, both ways | 15-16 |
| `filter: blur(0.12px)` (inline) / back | 0 / 0 | 0-1 (the morph-centre, 1 kpx) |
| `will-change: filter, opacity` on | 0 / 0 | 0 (layer count stays 50) |
| `--morph-fade` 1 → 0.99 / back, with that will-change on | 19 / 1049, both ways, twice | 15 |
| will-change off again | 5 / 983 | document 3, platform 2 |
| `--morph-fade` 1 → 0.9999 (pre-set) / back to 1 | 19 / 1049 each way | 16 |
| `--morph-fade` 0.9999 ↔ 0.99 (while pre-set) | 0-1 / ≤ 1, four switches | 0-1 (morph-centre) |

So the cost belongs to the **opacity half**: opacity leaving or returning to exactly 1. The blur half is free.
Pre-promoting with `will-change` does not help. Below 1, moving the opacity only re-composites.

**Why: CONFIRMED (WebKit source).** WebKit's style diff asks for a full layout when opacity crosses the
opaque/non-opaque line, with a FIXME saying a simplified layout is not safe there yet:
- `if (a.opacity.isOpaque() != b.opacity.isOpaque()) { … return true; }`, in the layout check of
  `Source/WebCore/style/StyleDifference.cpp`, line 214 at WebKit commit `edfe75292ddb` (2026-10-02).
- Any other opacity change only marks the `Opacity` context-sensitive property (line 576-577), so a composited layer
  just re-composites.
- `hasFilters()` is compared the same way (line 223). `blur(0px)` already counts as a filter, which is why the
  blur half is free.
- Our data agree: the 1 ↔ 0.99 frames carry `layouts: 1`, while blur and 0.9999 ↔ 0.99 carry `layouts: 0`, or
  1 with a single 1 kpx paint.
- That the Simulator's Safari carries the same rule is OBSERVED (consistent with the counts); the line is long-standing.

**Rev 3 design (exact build, not a proposal if the pixel check holds):** `opacity: min(var(--morph-fade), 0.9999)`
on `.start-selling-platform` (CSS 5479, one line; `rev3/build.mjs`, snapshot `fd-e4c80db5e0a8`, best-build JS
`65052c4a3902` unchanged, CSS `e4c80db5e0a8`; `rev3/delta.diff`).
- Every morph value below 0.9999 is unchanged.
- At rest the section is drawn at 0.9999 instead of 1, under 0.03 of a level.
- The page loads in that state, so the open and close never cross 1.

**Rev 3 counts** (Simulator, 2026-10-04 13:14Z; `open-cause-sim.mjs M,R fade,fade`; one session; driver M; window
prevT − 17 ms. Frames listed with `out/morph-gpu/rev2/open-window.mjs`.)

| | best-build (M) | rev 3 (R, fd) |
|---|---|---|
| warm open, first frame (2nd and 3rd open) | 29 / 1490 kpx, both | **10 / 446 and 10 / 443** |
| warm open, next frames to +320 ms | 9-14 each | 10-15 each (the same earn/panel work) |
| sum over the open window | 101-108 / 6.9-7.6 Mpx | 78-82 / 5.2-5.7 Mpx |
| end of the close (back to m = 0) | 22 / 1076, 64 ms frame | none above 7 paints |
| `--morph-fade` 1 ↔ 0.99 toggled alone at m = 0 | 19 / 1049, four times | 0-1 / ≤ 1, four times |
| **cold first open** (first push after load) | 32 / 2150 | **32 / 2160, unchanged** |

- Rev 3 removes the fade's share (19 rects, ~1.05 Mpx) from every warm open and from every close.
- The cold first open keeps its 32 rects: 4 layouts and 430x512 tile-sized rects over y 4608-5690. That is separate
  first-time work, not the fade (R never crosses 1). Not yet attributed; next for this topic.

**Rev 3 still pixels (PR-010, 2026-10-04 13:20-13:45Z).**
- Harness: the committed v7 gates `px-sim.mjs` / `px-chrome.mjs` (1b911a2344ef / pxlib 2bf3dd947191), dir map
  `A=B,V=R` (B = best-build, R = fd). Two samples per engine, plus a best-against-best A/A per engine.
- Folders: `out/v7-best/px-sim-…T13-20-00`, `…T13-33-25` (A/A), `…T13-35-05`; `px-mobile-…T13-23-41`,
  `…T13-39-09` (A/A), `…T13-42-40`.
- The table gives the "consistent" css px² (over 8 levels in all four cross pairs while neither same-build pair is),
  with the max level in brackets.

| engine, stop | rev 3 sample 1 | rev 3 sample 2 | best vs best (A/A) |
|---|---|---|---|
| Simulator, platform stops 4263 / 4762 / 5260 | 0 / 0 / 0 | 4 (28) / 0 / 0 | 4 (28) / 15 (232) / 0 |
| Simulator, 300 (hero) | 34 (121) | 1 (133) | 3 (63) |
| Simulator, 3267 (commission fee visual) | 146 (228) | 0 | 0 |
| Chrome, platform stops 4365 / 4856 / 5346 | 0 / 0 / 0 | 0 / 4 (232) / 0 | 0 / 0 / 0 |
| Chrome, 0 / 300 / 548 (hero heading accent) | 0 / 10 / **3360 (87)** | 222 (212) / 47 / 41 | 0 / 0 / 22 (32) |
| Chrome, 1422 / 1913 (people) | 5 / 73 (250) | 70 / 1 | 0 / 0 |

**Reading.**
- At every platform stop rev 3 is at the best-build A/A floor in both engines.
- Every larger cluster is outside `#platform`, which is the only element rev 3 touches.
- None of them repeats in the second sample.
- Each sits on an element that also varies between two loads of best-build: in Chrome's A/A, V~V2 at y 548 differs
  by 34,490 px in the same accent rows (css 239-278), against rev 3 sample 1's 35,100.
- So they are per-load states (accent phase, people images, fee visual), and the single-sample consistent rule caught
  a lucky split.

Verdict: **pixel-identical within the A/A floor** (T2 holds at every stop once a cluster must repeat). The lead decides
whether that counts as an exact build or needs a proposal.

**At rest: no extra layers, memory or paints** (`rev2/layers-sim.mjs M,R,M,R`, hook builds besthook-fef569e3c2e2
and fdhook-fef569e3c2e2 = the same JS + the fd CSS; Simulator, 2026-10-04 13:54Z).
- Layer count and layer memory are identical in every state:
  - top: 144 layers / 51,344 KB;
  - mid-page: 58 / 95,221 KB;
  - end: 54 / 90,894 KB;
  - m 0.5, m 1 and back to 0: the same in both builds.
- Cumulative paintCount, best (two loads) against rev 3 (two loads):
  - top 466/459 against 453/454;
  - mid 269/276 against 260/282;
  - end 384/389 against 377/397.
  That is load-to-load noise.

The checks first listed as owed (pixels, open-frame counts, at-rest cost) are done above.

**Still owed before landing:**
- the lead's call on exact build against proposal;
- a short phone no-worse check (less-work landing rule).

The cold first open (32 rects, unchanged) is a separate item.

## v7's y 4365 pixel point under `#platform` (mgmt-ops-10 request, 2026-10-04 13:09Z; still pixels, no timing)

**Result: not reproduced.** The earlier 16 css px² (wave-v7 run 11-38-42) is a per-load state that every build takes.

**Setup.**
- Harness: `fixes/v7-best/gates/px-sim.mjs` sha256/12 `1b911a2344ef` and `pxlib.mjs` `2bf3dd947191`, unchanged, as
  on main dccc727c (sent to mgmt-ops-10 before the run).
- Builds: copied from wave-v7's `out/v7-best/snap`; all served hashes match.
- One Simulator session, two passes: A V A2 V2, then the dir map `A=P,V=V`. Order deviation accepted pre-data.

**Scores at y 4365.**

| pass | X~V beyond A/A | X2~V2 | consistent | X/X over 8 | V/V over 8 |
|---|---|---|---|---|---|
| 1: v6 (A) vs v7 | 0 | 0 | 0 (max 0) | 5.27 % (browser strip, css 0-59 only) | 0.006 % |
| 2: best + rest-script (P) vs v7 | 2 | 0 | 0 (max 7) | 5.26 % (same strip) | 0.064 % |

**Why the earlier cluster looked like a build difference.**
- In pass 1, V~V2 differs at css y 648-654 / 706-711 (216 px): the earlier cluster's exact pixels (82 px at
  640-656, max 197).
- A = V there and A2 = V2 there, so both builds take both states.
- The earlier run's loads happened to split by build. Under the N1 rule the stop is unstable, and it is not a v7 change.
- Neighbour stops 3875 and 4856 are consistent 0 in both passes.

**What toggles there: OBSERVED, cause unknown.** Likely a transition that the harness's freeze skips; unconfirmed.
- Pass 2's V~V2 band at css 704-713, where P matches both V and V2, fits an in-between phase.
- Every build also shows a per-load band at css 166-187 (~22 device px), in both passes.

mgmt-ops-10's second read (re-scored from the PNGs with main's pxlib) AGREES. The item is closed; no further v7 check
is needed.

## G check before landing: a fling into the end, C against A (registration; written before any phone data)

**Skipped (2026-10-04):** P-098 found O1.f1 WORSE, so under ops N2 rev 2 is not land-eligible and P-099 did not run.
No P-099 data exists.

Prediction id **P-099** (asked of mgmt-ops-10). This ticket checks the risk named under Risks. Rev 2's setup runs once
the scroll has rested for 300 ms. A morph that starts sooner does the setup in its first frame, as rev 1 did. We
call that open 'cold'; an open after the setup has run is 'warm'.
- **Question (one).** When a real touch flings into the page end and pushes on into the morph, is A's first open no
  worse than best-build's (O1.f1, V ≤ C + 2 ms, P-098's bound)? And when it is cold, how much does that cost?
- **What the Simulator showed (pilots, 2026-10-04; mechanism only, no Simulator ms judged, F-084).**
  - v1 (fling until the end, then a push): the runner reads the page before every stroke. A read sent during a
    fling's momentum was answered only when the momentum stopped: 2.5-3 s, in every run. An up stroke in the last
    150 px also waits for a still page. So the push always landed on a page at rest, and A's setup ran first: 'd'
    before O1 in every A run. OBSERVED in our setup, cause unknown; F-210. The phone G runs on file have no flings, so
    whether the phone does the same is UNRESOLVED. The first counted runs will show it.
  - v2 (`phone/fling-end-v2.json`, GESTURE_HASH `6a7569615807`):
    - setup: on load the logger jumps 4.5 viewports above the scroll end, outside the setup's range;
    - fling: 560 px / 130 ms, lift-off 7316 px/s;
    - catch: a 540 px / 600 ms drag sent straight after the fling, with nothing between them that reads the page;
      it pushes past the end in the same touch and holds 300 ms;
    - then 2 s open, a 300 px close stroke, and 1.5 s.
  - If the phone answers reads during momentum, the catch lands on the moving page: a cold open.
  - In 4 of 4 Simulator runs (C A A C) the page reached the end and opened once and closed once in the catch touch.
    All A opens were warm, as expected there. 520 px / 160 ms fell short of the end once in 4 runs, so v2 flings
    harder.
  - In that v2 pilot (hold 09:12:39-09:16:06Z) the fling-to-catch gaps were 1.25-3.0 s and the catch positions
    5164-5220, in the range of the earlier pilots.
- **Builds and ports:** V = A `rv2a-ef9d1c9d5fca` and C `best-65052c4a3902`, as P-098. Same plain-http ports as
  P-098: base 5791, C 5792, V 5793 (same builds, so reusing them is safe under I-131). The runner records each arm's
  served js/css (sha256 prefixes, read from localhost) before every run into `out/morph-gpu/phone/p099-served.json`,
  keyed by the run label.
- **Per run:**
  - `iphone.mjs open http://lan:<arm port>/`;
  - then `iphone.mjs gesture fixes/morph-gpu/phone/fling-end-v2.json --inject fixes/morph-gpu/phone/rv2-flinglog.mjs
    --owner <runner> --label p099-<arm>-<pos>`.
  - The logger (`phone/rv2-flinglog.mjs`, sha256 `8ddcb77e47f7`) writes rAF rows [t, dt, scrollY, m, flags]. Flags
    'd' = rev 2's dark layer exists; 'r' = reveal on.
- **Before the block:** `iphone.mjs wda check` must say ready, and `gesture --dry-run` must give GESTURE_BUDGET_S 150.
  A run takes about 40 s; a gesture refuses to start in a hold with less than 150 s left (I-112).
- **Condition** as P-098 (T-039 B: real Serious, the thermal gate at the start and end of every hold, pre-warm on the
  base port, Low Power Mode runs dropped). Phone parts run in the runner's `--no-timing` hold with the `iphone`
  lease (I-056).
- **Block**, two holds, each at most 900 s:
  - H1: gate, start sentinel, warm-ups wC wV (one uncounted gesture run per arm port), counted C1 V2 V3 C4, gate.
  - H2: gate, counted C5 V6 V7 C8, end sentinel, gate; then park Safari.
  - Sentinels are P-098's: an S-driver `--heat-sentinel` run on C's port, bottom ≥ 58 fps and scroll ≥ 44 fps. A
    failing start sentinel: no counted run starts. A failing end sentinel voids every counted run.
  - The G runs carry no M sentinel; heat is judged by the gate and the S sentinels.
  - H1 timing: the last gesture must start by about 750 s into the hold. If the gate and the sentinel run long,
    C4 moves to H2; that is logged as a hold-layout change, not a void (ops N4).
- **Rules added after ops' pre-data read and the lead's ruling** (before any P-099 data; text only, the scorer and its
  hash are unchanged):
  - **Run only if P-098 leaves rev 2 land-eligible** (ops N2): no O1.f1 WORSE, and no WORSE or threshold-sensitive
    result on the closes or on f50 / f34. Otherwise P-099 is skipped and the report says so.
  - **Ports** (ops N3): if P-098 had to fall back to a port in 5794-5799, P-099 uses P-098's logged ports.
  - **A short catch.** If the phone answers reads during the momentum, the catch may land far above the end (about
    2000 px or more). Such a run has no O1, so the scorer voids it ("tweens none") and gives no gap or catch position.
    The runner therefore reads each warm-up's raw gesture file: the fling-to-catch gap, scrollY at the catch, the
    end scrollY and whether O1 came.
    - **Both warm-ups short** (no O1, the catch ended short of the end): stop before the counted runs. Report the gap,
      the catch scrollY and the end scrollY to the lead and ops as a finding (F-210 REFUTED on the phone). A longer
      catch would be a v3 gesture, i.e. a new ticket rev that ops reads before any data (lead ruling, rule 1).
    - **One warm-up short:** the block goes on, but any void counted run stops it at once: no in-place re-run, no
      refill; reported to the lead (lead ruling, rule 2). This replaces the in-place re-run clause below for this
      case only.
    - For any void counted run, the report gives its gap and catch scrollY from the raw file (ops N1).
- **Amendment A1-A5: runs beside the shared group** (the lead's request, the Chrome queue was 11 deep; ops pre-data read
  PASS; before any P-099 data; scorer and gesture hashes unchanged). This replaces the hold layout above.
  - **A1, Mac state.** The P-099 phone parts (gates, S1/S2, wC wV, the 8 G runs) take no exclusive chrome-measure
    hold. They run under the `iphone` lease only, beside a shared group: Mac-quiet is preferred, not required (I-056).
    `iphone.mjs gesture` records `meta.mac` (the shared jobs with weights, load1 at start and end). Beside anyone's
    exclusive hold the tools refuse, as before.
  - **A2, guard.** Before each gate and run, the runner waits while the group holds a job heavier than weight 1, or
    an exclusive hold runs (`lock.mjs wait chrome-measure --until released-by:<owner>`). It also waits while load1 >
    8 (bounded re-reads).
  - **A3, validity.** A counted run with load1 > 8 at its start (its `meta.mac`) is VOID "mac load". It gets the
    usual one in-place re-run; after one short warm-up it stops the block like any void (rule 2). Load-VOID files are
    left out of the scorer input, and the block log names them.
  - **A4, layout.** Same order: part 1 = gate, S1, wC wV, C1 V2 V3 C4, gate; part 2 = gate, C5 V6 V7 C8, S2, gate,
    park. No 900 s cap, so the H1 timing rule (N4) falls away; the lease bounds the time.
  - **A5, a new confounder.** The gap from fling to catch runs through Mac HTTP round trips to WDA, so Mac load can
    lengthen it. It is reported per run with load1.
  - **Ops notes on A1-A5:**
    - No cross-block absolutes: P-099 numbers (f1/f2/f3, catch gap, cold share) are never compared in absolute
      terms with P-098 or any quiet-Mac run. Verdicts stay within the block.
    - The A5 rule, decided before data: report the median catch gap for V and for C, and load1 at start and end
      per run. If every valid V gap is above every valid C gap (or the reverse) AND the medians differ by > 20 ms,
      the verdict line carries "confounded by catch gap". That is not a void, and the verdict is unchanged.
    - The block log lists, per counted run, the shared-group members and weights at its start (from `meta.mac`),
      and A2's waits with their duration.
- **Scorer**, committed before data: `phone/g-fling.mjs`, sha256 `a493f689422a`:
  `node fixes/morph-gpu/phone/g-fling.mjs C:<file> V:<file> … --served out/morph-gpu/phone/p099-served.json`, with
  the files in block order.
  - Tweens from the logger rows, as frames-rv2.mjs: O1 starts where m leaves a held 0, C1 where it leaves a held 1.
    f1 / f2 / f3 = the first 1 / 2 / 3 gaps.
  - Void run:
    - a runner abort or error;
    - the script hash is not `6a7569615807`;
    - served js/css not recorded or not the arm's build;
    - the logger's CSS tag is not the arm's ('none' C, 'rv2' V);
    - tweens not exactly O1 then C1;
    - O1 not inside the catch touch (from its touchstart to 50 ms after its touchend).
    - One in-place re-run per position; a second void at one position voids the block (except after one short
      warm-up, see above).
  - Scored: O1.f1, O1.f2, O1.f3. Per key, d = median(V) − median(C):
    - 'better' at d ≤ −2 ms with every V run below every C run;
    - 'no-worse' at d ≤ +2 ms;
    - else 'WORSE';
    - 'insufficient' below 3 valid runs per arm.
  - Reported: C1.f1, C1.f3. Per V run: cold or warm (cold = no 'd' in the row before O1), the rest before O1 (ms),
    the gap between the fling and the catch, and scrollY at the catch.
  - Cold subset: scored when at least 2 valid V runs are cold (O1.f1 and O1.f3 of the cold V runs against all valid
    C runs, same rule); else reported as 'cold not reached'. Warm V runs are reported the same way.
  - Pre-registration check (`out/morph-gpu/rev2/g-scorer-check.mjs`, local, on the Simulator pilot files):
    - as recorded: 4 valid, every A open warm;
    - V = C's own files: every key d 0;
    - a cut close: void;
    - wrong served js: void;
    - V = C with the setup flag removed: 4 cold runs, cold subset scored, d 0.
- **Predictions** (P(hit) before data):

  | # | prediction | point | interval (falsified outside) | P(hit) |
  |---|---|---|---|---|
  | g1 | O1.f1, V − C, all valid runs | 0 | ≤ +2 ms | 0.55 |
  | g3 | O1.f2 and O1.f3, V − C | 0 | ≤ +2 ms each | 0.5 |
  | cold | at least 2 of 4 V runs cold | no (the phone also waits for the momentum) | — | 0.6 |
  | gc | if cold is scored: cold O1.f1, V − C | +6 (rev 1's P-092 cost) | ≤ +2 ms | 0.3 |

- **Decisions:**
  - **Scored keys no-worse or better, and the cold subset no-worse (or not reached):** the G check passes. Rev 2 A
    can be landed on P-098's result. With 'cold not reached', the lead decides whether the cold case is closed or
    needs a finger test (lead, 2026-10-04).
  - **O1.f1 WORSE in all runs:** rev 2's open start under a real touch is worse than best-build's. To the lead; no
    land request.
  - **Cold subset WORSE:** the risk is real. Fallback: start the setup earlier, without waiting for a scroll rest,
    e.g. when the end comes within 3 viewports (`rev2/prepnow.diff`'s `__rvPrepNow` hook). That is a new build and a
    new ticket.
  - **Insufficient or void:** no claim; cool and re-run the counted part once. A second void goes to the lead.
- **Expected minutes:** about 20 (15-30).

## Risks, conflicts, follow-ups

- **Base.** Built on best-build, which includes morph-inherit. P-085 passed on the iPhone at Serious (main e22dd73:
  moving >50 21 -> 0.5), so the base holds. If the base changes again, this delta has to be rebuilt and re-checked on
  the new base. The proposal names the base hashes.
- **T3 motion:** text up to ~1 device px off during the motion; blur edge shades at mid-morph. It is a proposal.
- **The stale-clip workaround** rests on an OBSERVED WebKit behaviour. A different Safari could need more or less.
- **One frame of shade 5** at m = 1 (frames N and N+2). In real back-to-back frames, possibly one frame cut ~0.7 css
  px at the panel's bottom edge (N+1, estimate).
- **Phones only:** `matchMedia(width <= 640px)`. Desktop is unchanged (reveal off).
- **Android Chrome** (review B5): a phone-width Chrome gets the reveal too, and Chrome shows no gain from it: while
  moving, 24.5 → 34.8 restyled elements per frame and Paint events 9.1 → 9.9 ("Desktop and Chrome counts", headless,
  no throttle). On an Android phone that is a small extra main-thread cost with no paint gain to pay for it. No
  Android device was run.
- **Rev 2's setup waits for the scroll to rest for 300 ms.** With a finger, a fling that runs straight into a push
  past the end may start the morph before that, and then the open's first frame does the setup as rev 1 did
  (`__rvRdy` false). The M driver always waits 1.1 s, so P-098 cannot see this case. The lead requires a G
  fling-into-end check before landing (P-099, "G check before landing"). An earlier trigger, e.g. an idle callback while
  within 3 viewports of the end, is the fallback if the G check fails.
- **Reduced motion: exact in Chrome; the Simulator was not run with it.**
  - Code: with reduced motion the morph skips its spring. `E()` sets m straight to its target (JS ~13292), and the
    target is only ever 0 or 1 (`XM`, JS 12940). So m never sits between 0.001 and 1, and the reveal never
    switches on.
  - Chrome frozen frames with reduced motion emulated (`gates/frames.mjs --reduced`,
    `frames-2026-10-03T18-15-06-547Z`, `matchMedia` true in all three loads): every rest is 0 beyond A/A. That is
    m 0, m 1 after the switch-off chain, and back at the top.
  - The one exception is the frame after an artificial 0.5 → 1 jump: 23 css px, max 19. That is the same 207-px,
    max-19 two-state flip that Chrome's own A/A shows at m 1.
  - The forced in-between frames (m 0.5, 0.99) differ more with reduced motion: fill up to 92 at 0.5, 2.3 % at 0.99.
    They can't occur in real use with reduced motion, because m only jumps.
  - The `:not(.is-morphing)` transitions are not changed. A first try changed the reduced-motion background
    transition (0.32 s → 0.7 s); it was removed.
- **Ownership:** lines 12951-13089 (k/O 13041-13048, A 13049+, j/M, N/P/I, the pin) are fix-nav-morph's, untouched.
  S() at 13013-13018 was not needed.
- **Gates:** `gates/` (frames.mjs, sim-frames.mjs, paint-sim.mjs, restyle-chrome.mjs, reveal-diff.py) and
  `build.mjs` are this topic's own scripts, not tooling. No change to `tools/` or measurement code.
