# Fix: illusion-accent-wipe

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (PoC, proposed to the user; not accepted yet)
**Stage:** R/I (illusion proposal, de-illusion-style 2026-10-02); no D card yet
**Device class / gate:** phone-first (WebKit SVG layout per frame); Chrome shows the repaint side
**Driver(s) behind the claims:** Chrome counts probe (no timing), screencast filmstrips; phone not run (no phone time before acceptance)
**Prediction:** none filed yet
**Topic:** illusion-accent-wipe (research/design-engineering/illusion-style.md, candidate S2)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css`, +65 lines after the accent idle-frame rules (before
`@keyframes svelte-1fn2go6-stroke-in`). **Stacked on `fixes/user-bplus`** (build B).

## Why it lags

The hero accent word (component `HE`, B JS ~3835-3945: `em.script-accent > span.frame > span.paint >
svg.accent-svg x3`, each with `path.accent-path` pathLength 1, optional `accent-fill`) runs a timer cycle
idle 1250 ms (first 2200) -> `is-drawing-out` 900 ms -> word swap -> `is-drawing-in` 900 ms. The draw animates
`stroke-dashoffset` on the paths of **all three** idle-frame SVGs (B CSS ~1274-1290), although frames 1-2 are
opacity 0 while drawing.

- WebKit: a `strokeDashOffset` change returns true from `svgDataChangeRequiresLayout`
  (`Source/WebCore/style/StyleDifference.cpp`, tag WebKit-7624.4.5 ~l.131; F-097, CONFIRMED), so every frame of
  the 1.8 s window is main-thread style + SVG layout. Phone Timeline at rest (F-081, OBSERVED): 434-445 of ~795
  small Layouts per 20 s fall inside these windows. How far the dirty bit climbs is UNRESOLVED.
- Chrome: a repaint every frame (2688 Paint events in a 9.3 s hero window, below).

## What changed

CSS only. During `is-drawing-in` / `is-drawing-out` the paths are shown fully drawn (`stroke-dasharray: none;
stroke-dashoffset: 0; animation: none`, fills at opacity 1) and the word is revealed by a counter-translated clip:
`.paint` gets `clip-path: inset(-30%)` and slides `translateX(-140%) -> none` while `.is-idle-frame-0` slides
`translateX(140%) -> none`, so the word stands still and the clip edge sweeps left to right (0.9 s, the original
`cubic-bezier(0.4, 0, 0.2, 1)`); draw-out runs it backwards. Idle state and the boil are untouched.

Visual difference (honest): stroke-order drawing becomes a left-to-right wipe; erase becomes a right-to-left wipe.
Timing, ease, word, position and the idle look are the same. Filmstrips: `out/proposals/illusion-accent-wipe/`
(local, not committed).

## Why that is faster

Two transform animations with a cubic-bezier ease are accelerated on WebKit (not excluded by F-048/F-065) and
tick no main-thread style between start and end; the start/end flip `transform: none <-> some` costs a Layout
diff once each (F-075). Expected on the phone: the ~434-445 small Layouts per 20 s inside draw windows drop to a
few per cycle. **estimate**: needs a phone Timeline count.

## Before / after

Counts only (timing deferred, user direction 2026-10-02 19:27Z). Chrome, 430x932 DPR 3 mobile + touch, CPU 1x,
`--vendors=local --latency 150`, n=1, 9.3 s parked windows, snapshot `b1789284481295-4ad4a84a`, served hashes
B JS `dbd5fdb4f1fb` / CSS `cc8d1340b449`, PoC CSS `58a4048e31f6`:

| window | build | RecalcStyle n | ULT elements | Layout n | dirty objects | Animation invalidations | Paint |
|---|---|---|---|---|---|---|---|
| hero (y 0) | B | 903 | 7501 | 29 | 475 | 6335 | 2688 |
| hero (y 0) | B + accent-wipe | 906 | 6858 | 28 | 446 | 5695 | **61** |
| commission | B | 634 | 2739 | 226 | 5201 | 2094 | 707 |
| commission | B + accent-wipe | 629 | 2669 | 225 | 5185 | 2076 | 695 |
| agents | B | 1116 | 9606 | 100 | 876 | 7224 | 2352 |
| agents | B + accent-wipe | 1116 | 9610 | 100 | 876 | 7231 | 2353 |

Chrome does not lay out for dashoffset (Layout n unchanged); its cost is the repaint, which is gone. No new console
errors or 404s. de-illusion-composite's layer census saw `header.hero-copy` repaint 55/s on B at rest; that is
this animation (boil-ca alone leaves hero Paint at 2683).

## Cards (protocol v2)

None yet. On acceptance: phone Timeline at rest at the hero (B vs B+PoC, small Layouts inside draw windows),
plus a look at every language's accent word for clipping.

**Scenarios not run:** idle after scroll · reload while scrolled · early input · scroll up · toolbar resize · rubber band.

## Risks, conflicts, follow-ups

- Look change (see above); needs the user's acceptance.
- `inset(-30%)` clip: a stroke reaching further than 30 % outside the word box would be cut (none in the captured
  words; not every language checked).
- Pixel-identical fallback (not built): keep the stroke draw but animate only `.is-idle-frame-0`'s paths
  (1 of 3 SVGs), a smaller saving with no look change.
- Hero exit (fix-hero-exit) also styles the hero; no shared rules. Combines cleanly with illusion-boil-ca.
- Re-apply: `node tools/fix.mjs apply illusion-accent-wipe --on user-bplus`.
