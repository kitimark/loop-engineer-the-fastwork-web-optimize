# Fix: morph-gpu (N2, the end-of-page nav morph as a composited reveal)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft. Proposal only: the motion is T3, so this lands only if the user accepts it.
**Stage:** D (attribution card below, for the lead to sign) → proposal draft `fixes/morph-gpu/proposal.json`
**Device class / gate:** phone-only, render-bound (WebKit paint during the morph). Gains below are Simulator counts.
The phone gain block comes after the user's decision, through the lead and ops.
**Driver(s) behind the claims:** M (`__fwMorphDrive` in the Simulator, `__fwMorphSet` frozen frames). No S, G or F yet.
**Base:** best-build (main 60df1cf: st6-rb2 + platform-idle + morph-inherit), js `65052c4a3902`, css `e0f92804c521`.
This fix's own change against that base: `fixes/morph-gpu/delta.diff` (229 lines). `patch.diff` is baseline-relative,
so it carries best-build too. Built by `node fixes/morph-gpu/build.mjs` → `rv-372b99478871` (what would land),
`rvhook-81a43009c62d` (plus the frozen-frame hook and a frame stepper, gates only), css `257507365449`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (new `__rv*` reveal writer after `__mkW`, pretty lines
~13495-13635 of the overlay; one call `__rvW(e[`--morph`])` in the nav's template effect, ~13757),
`/_app/immutable/assets/2.gBuqKVzi.css` (one appended block, `@media (width<=640px)` rules for `[data-fw-rv]`,
`.fw-rv-dark`, `.fw-rv-glass`). Lines owned by fix-nav-morph (12951-13089) are untouched.

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
- Per-phase run on best-build, while moving: elements restyled 24.5 → 34.8 per frame, layouts 1.78 → 1.77, Paint
  events 9.2 → 9.9. Table under "Desktop and Chrome counts" below.

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

**Motion: T3**, same in Chrome and the Simulator. The five numbers (largest shade; share of screen beyond A/A;
css px; edge or fill; moving):

| m | Chrome | Simulator |
|---|---|---|
| 0.5 | 175 (edge; fill max 22); 0.22 %; 869 css px; logo text and the panel's lower side edges; moving | 131 (edge; fill max 59 at the lower side edges); 0.28 %; 1111 css px; moving |
| 0.99 | 237 (edge; fill max 28); 1.49 %; 5965 css px; panel title text, RSVP/Join buttons, countdown; moving | 233 (edge; fill max 26); 1.30 %; 5194 css px; same places; moving |
| A/A at 0.99 | 601 px over 8, max 33 | 0 over 8 |

Sources:
- Chrome: `out/morph-gpu/frames-2026-10-03T16-58-45-896Z` (k1, k3).
- Simulator: `out/morph-gpu/simframes-2026-10-03T16-09-06-602Z` (k7, k5).
- Side-by-side crops and diff maps: `out/morph-gpu/proposal/{chrome,sim}-m{0.5,0.99}-{a,b,diff}.png`.

What is different: the text inside the panel sits up to about one device pixel off during the motion. Text moves by
transform here instead of being laid out at each m. The lower side edges at mid-morph differ slightly in blur
(fill ≤ 59). None of this is visible at rest.

**The switch-off frames at m = 1, frame by frame** (lead condition 1). The gate build steps the switch-off rAF chain
by hand (`window.__rvRaf`), one shot per frame. Simulator `out/morph-gpu/simframes-2026-10-03T17-17-22-105Z`, R vs M
at m = 1, after 0.5 and after 0.99:

| frame | what the nav has | Simulator (after 0.5 / after 0.99) | Chrome 430x932 (after 0.5 / after 0.99), beyond A/A |
|---|---|---|---|
| N (switch-off) | clip gone, own blur off, glass at m = 1 | 0 over 8, max 5 (fill, panel), 18.4k / 18.8k px | 0 / 0 over 8 (max 2) |
| N+1 | own blur back, glass gone | exact (max 1 / max 2, 466 px on the right edge) | 396 px = 44 css px, edge, max 53, RSVP/Join text / exact |
| N+2 (the extra toggle) | own blur off | 0 over 8, max 5 (fill, panel), 18.4k / 18.8k px | 0 / 0 over 8 (max 2) |
| N+3 | own blur back: today's nav | exact / exact | exact / exact |

- The max-5 frames (N and N+2) are a shade-5 change over the panel for one frame each. That is far below T2 fill
  (64) and not visible. They go into the proposal's visualDiff as a motion difference all the same.
- Chrome N+1 after the artificial 0.5 → 1 jump: 44 css px of text edge, max 53. That is T2 (edge ≤ 128), for one
  frame; after 0.99 it is exact.
- Chrome's own A/A at m = 1 flips between two states: 282.7k px, 207 over 8, max 19, over the panel in some
  shots. These counts are beyond that.
- Sources: Simulator `simframes-2026-10-03T17-17-22-105Z`, Chrome `frames-2026-10-03T17-38-38-388Z` (k3-k6 from
  0.5, k8-k11 from 0.99).

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
  Chrome: 0 beyond A/A (`frames-2026-10-03T17-38-38-388Z` k14).
- Scrolled back to the hero after a cycle: Simulator exact (k15); Chrome 3 css px beyond A/A, max 11 (k15).

## Desktop and Chrome counts

**Desktop**, Chrome 1280x800 DPR 2, not mobile (`frames-2026-10-03T17-39-56-017Z`, m 0, 0.5, 1, 0.99, 1, 0):
- R vs M: 0 px over 8 at every m, max ≤ 7.
- A/A: 15 over 8, max 12.
- The reveal is off there (`width <= 640px`): unchanged.

**Chrome counts per phase**: `gates/restyle-chrome.mjs` (`out/morph-gpu/restyle-chrome-2026-10-03T17-58-17-031Z.json`).
Headless 430x932 DPR 3, no throttle, M driver (hold 1500 ms, 2 cycles), M = best-build, order M R M R.

| per frame | moving: M | moving: R | at m 1: M | at m 1: R | at m 0: M | at m 0: R |
|---|---|---|---|---|---|---|
| style recalcs | 2 / 2 | 2 / 2 | 1.59 / 1.57 | 1.64 / 1.63 | 1.07 / 1.05 | 1.07 / 1.07 |
| elements restyled | 24.4 / 24.7 | 34.8 / 34.7 | 11.8 / 11.7 | 12.8 / 12.6 | 12.4 / 12.3 | 12.8 / 12.8 |
| layouts | 1.78 / 1.77 | 1.77 / 1.77 | 0.17 / 0.17 | 0.22 / 0.20 | 0.79 / 0.77 | 0.79 / 0.79 |
| layout dirty objects | 9.2 / 9.2 | 9.8 / 9.8 | 0.9 / 0.9 | 1.3 / 1.2 | 4.0 / 3.9 | 4.1 / 4.1 |
| Paint events | 9.13 / 9.19 | 9.84 / 9.93 | 4.57 / 4.42 | 4.77 / 4.72 | 5.47 / 5.43 | 5.62 / 5.63 |

Chrome shows no gain:
- While moving, about 10 more elements are restyled per frame: these are the inline writes on the reveal's parts.
- Layouts are the same.
- Paint events are about 0.7 per frame more.
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
  elements, layouts 1.78 → 1.77, Paint events 9.2 → 9.9; CPU-6x Chrome can't stand in for raster, claims-audit §2.6).
  Phone Timeline segment card: not yet (phone block after the user's decision).
5 platform claims relied on:
  | claim | status | reference / check | what falls if wrong |
  | WebKit applies a changed clip-path on a composited layer as a mask-shape change, without repainting content (iOS 26 Simulator Safari) | CONFIRMED in source + OBSERVED in counts | WebKit main 2026-10-03: RenderElement.cpp ClipPath → RecompositeLayer (willCompositeClipPath); RenderLayerCompositor::layerStyleChanged → RenderLayerBacking::updateMaskingLayer / updateMaskingLayerGeometry ("FIXME: Avoid repaints when clip path changes"); counts above | the paint gain |
  | Simulator paint counts stand in for the iPhone's | OBSERVED | none; the phone block measures it | the size of the gain on the phone |
  | after the reveal ends at m = 1 Safari keeps the last clip until the nav's backdrop filter is toggled | OBSERVED in our setup, cause unknown; references UNRESOLVED | decisive check run: simframes-2026-10-03T16-31-40-782Z, -16-57-35-003Z | the m = 1 workaround (two extra frames) |
6 lead: <to sign>
```

**Scenarios not run:** idle after scroll · reload while scrolled · early input · scroll up during the morph ·
toolbar resize · rubber band · reduced motion on the phone · finger (G/F). The phone block (pre-registered,
condition B) comes after the user's decision.

## Risks, conflicts, follow-ups

- **Base.** Built on best-build, which includes morph-inherit. P-085 is checking morph-inherit on the phone now. If
  it misses, the base changes and this delta has to be rebuilt and re-checked on the new base. The proposal names
  the base hashes.
- **T3 motion:** text up to ~1 device px off during the motion; blur edge shades at mid-morph. It is a proposal.
- **The stale-clip workaround** rests on an OBSERVED WebKit behaviour. A different Safari could need more or less.
- **One frame of shade 5** at m = 1 (frames N and N+2). In real back-to-back frames, possibly one frame cut ~0.7 css
  px at the panel's bottom edge (N+1, estimate).
- **Phones only:** `matchMedia(width <= 640px)`. Desktop is unchanged (reveal off).
- **Reduced motion:** the reveal runs whatever the motion setting, the same as today's morph. The `:not(.is-morphing)`
  transitions are not changed. A first try changed the reduced-motion background transition (0.32 s → 0.7 s); it was
  removed.
- **Ownership:** lines 12951-13089 (k/O 13041-13048, A 13049+, j/M, N/P/I, the pin) are fix-nav-morph's, untouched.
  S() at 13013-13018 was not needed.
- **Gates:** `gates/` (frames.mjs, sim-frames.mjs, paint-sim.mjs, restyle-chrome.mjs, reveal-diff.py) and
  `build.mjs` are this topic's own scripts, not tooling. No change to `tools/` or measurement code.
