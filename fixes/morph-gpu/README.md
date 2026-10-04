# Fix: morph-gpu (N2, the end-of-page nav morph as a composited reveal)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** PR-012 rev 1 accepted by the user (2026-10-04 02:56:15Z, no notes); the accepted rev is the spec. Lands
as a "less work" fix once the phone no-worse block below passes.
**Stage:** V: the phone no-worse block P-092 ran on 2026-10-04 (05:39-06:06Z, 3 holds, all valid at Serious;
"Phone block P-092: result", below). Moving scope: '>50' Δ 0 and '>34' Δ −2, both no-worse and not threshold-sensitive.
Drive scope '>34' is threshold-sensitive (better at 34, no-worse at the twins); no gain is claimed from it.
**Lead ruling (2026-10-04 ~06:15Z): PASS as no-worse**, land request sent. **Cost:** every tween-start frame is longer
in V (60-64 ms against C's 54-56 ms, about +7 ms at the worst frame; OBSERVED, cause untested). Because of that cost,
rev 1 does NOT enter the next best build. It stays in the GPU preview, labelled with this cost. Rev 2 (prepare the clip
layer before the tween starts) is in work ("Rev 2", below).
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
- Open: whether it happens on the real iPhone (the phone block would show it at m = 1).

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
  | WebKit applies a changed clip-path on a composited layer as a mask-shape change, without repainting content (iOS 26 Simulator Safari) | CONFIRMED in source + OBSERVED in counts | WebKit main 2026-10-03: RenderElement.cpp ClipPath → RecompositeLayer (willCompositeClipPath); RenderLayerCompositor::layerStyleChanged → RenderLayerBacking::updateMaskingLayer / updateMaskingLayerGeometry ("FIXME: Avoid repaints when clip path changes"); counts above | the paint gain |
  | Simulator paint counts stand in for the iPhone's | OBSERVED | none; the phone block measures it | the size of the gain on the phone |
  | after the reveal ends at m = 1 Safari keeps the last clip until the nav's backdrop filter is toggled | OBSERVED in our setup, cause unknown; references UNRESOLVED | decisive check run: simframes-2026-10-03T16-31-40-782Z, -16-57-35-003Z | the m = 1 workaround (two extra frames) |
6 lead: <to sign>
```

**Scenarios not run:** idle after scroll · reload while scrolled · early input · scroll up during the morph ·
toolbar resize · rubber band · reduced motion in the Simulator or on the phone (Chrome frames done, see Risks) · finger (G/F). The phone no-worse block
(P-092, registered below, condition B; ops PASS) ran on 2026-10-04; result below the registration.

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

**Cost: the tween-start frame is longer in V.** This is a real cost of rev 1. Every run in both arms has exactly 2
moving frames over 50 ms, all at the start of a tween (m 0.004-0.061, the [0, 100) ms since-start bucket). Their
length differs by arm:
- C: 54-56 ms (median 55);
- V: 60-64 ms (median 62).

All 8 of V's frames are longer than every one of C's. The '>50' count is equal, but the worst frame is about 7 ms
longer with the reveal. OBSERVED; the cause is untested (a setup cost when the reveal starts is the likely reading).
Because of this cost, rev 1 does not enter the next best build. It stays in the GPU preview, labelled with the cost,
and rev 2 targets it. The >54 twin picks this up only as +0.5 on the median, because
C's frames sit at 54-56.

Runner deviations (logged in the block log, out of the registered text):
- holds of 900 s instead of 600 (the lead's rule);
- an early pre-warm on the base page under the lease while H1 queued (T-058 hand-over rule), and a keep-warm loop on
  base (W cycles to 43 °C) while H2 and H3 queued (the lead's 05:36Z instruction);
- the phone came in at 42 °C from P-095, so H1's first pre-warm ran 0 cycles.

Files (local, `out/morph-gpu/phone/`, listed in `evidence.json`): the eight `n2-<arm>-<pos>.json`, `n2-S-S1.json`,
`n2-S-S2.json`, `n2-wC.json`, `n2-wV.json`, `score.json`, `gates.jsonl`, `holds.jsonl`, `runs.jsonl`, `batt.jsonl`,
`BLOCKLOG.txt`.

## Rev 2 (in work): the reveal's setup before the tween starts

The lead's ruling on P-092 (2026-10-04): rev 1 passes as no-worse, but its tween-start frame is about 7 ms longer on
the iPhone, so it stays out of the next best build. Rev 2 moves the reveal's setup off that frame:
- creating the dark and glass layers;
- the layout read;
- the layer promotion (`will-change`) and the switch to the panel-sized nav.

The setup moves to a crossing on the approach, before m leaves 0. Steps: a Chrome and Simulator mechanism check that
the setup work leaves the tween-start frame (shared lane, no phone), then a pre-registered short phone no-worse block
(falsifier: tween-start frame V ≤ C + 2 ms) through mgmt-ops-10.

## Risks, conflicts, follow-ups

- **Base.** Built on best-build, which includes morph-inherit. P-085 passed on the iPhone at Serious (main e22dd73:
  moving >50 21 -> 0.5), so the base holds. If the base changes again, this delta has to be rebuilt and re-checked on
  the new base. The proposal names the base hashes.
- **T3 motion:** text up to ~1 device px off during the motion; blur edge shades at mid-morph. It is a proposal.
- **The stale-clip workaround** rests on an OBSERVED WebKit behaviour. A different Safari could need more or less.
- **One frame of shade 5** at m = 1 (frames N and N+2). In real back-to-back frames, possibly one frame cut ~0.7 css
  px at the panel's bottom edge (N+1, estimate).
- **Phones only:** `matchMedia(width <= 640px)`. Desktop is unchanged (reveal off).
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
