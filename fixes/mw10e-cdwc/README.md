# Fix: mw10e-cdwc (morph countdown faces without will-change)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (iPhone P-017, P-029: PASS); for review
**Topic:** morph-webkit / nav-morph (owner fix-nav-morph); full history in `fixes/morph-webkit/README.md`
**Base:** stacked on `aw1-10e` (`node tools/fix.mjs apply mw10e-cdwc --on aw1-10e`); CSS only, independent of the
pin fix (g) and of R1 (gh)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css`: one rule appended (+8 lines with the comment). Frozen
CSS sha256 prefix 5dc6e8e37388; the JS is unchanged (aw1-10e 3e2f599a1632).

## Why it lags

- When the morph starts, the morph panel's scene goes from paused to active. The scene-pause rule (CSS 11809,
  `will-change: auto !important` while paused) stops applying, and each countdown digit face gets back its
  `will-change: transform` (CSS 1408). That creates ~80 composited face layers at the tween start.
- On the iPhone those face layers were repainted in 76-85 % of the frames in each tween's first 450 ms. The morph's
  first 300 ms ran at a median of 34-48 ms per frame (observed; P-017 on gh, P-029 on g).
- Mechanism (arch-claims' audit of WebKit source): CONFIRMED.
  - When layout dirties a composited layer's geometry (`updateGeometry`), WebKit repaints the whole layer if its
    device-pixel-rounded sub-pixel offset from the renderer changed (RenderLayerBacking.cpp main l.1440-1445, l.1904;
    safari-7624-branch l.1356/1761).
  - That happens in 1/6 CSS px buckets at DPR 3, and `will-change: transform` gives no exemption.
  - That these 80 repaints are this mechanism stays OBSERVED, with P-017's ablation as the device evidence.

## What changed

```css
.start-selling-morph-panel .waitlist-closing-countdown .face.svelte-1quva9c {
  will-change: auto;
}
```

- Only the morph panel's countdown is affected. The page's other countdown keeps its face layers.
- No `!important` is needed. The only other rule that sets `will-change` on these faces is the scene-pause rule,
  which also sets `auto`, so the computed value is `auto` in every scene state.
- Visually identical: the hold screenshot on aw1-10e with the rule injected, same page, animations paused, differs
  by 0.11 %, against a noise floor of 0.13 % for the same page before and after.
- No DOM, ARIA, focus or inert change.

## Why that is faster

The faces paint into the panel's own layer instead of being ~80 separate layers. The per-frame whole-layer repaints
of the faces at the tween start are gone (0 % of frames on the phone), and the layer count at the m=1 hold drops
from 113 to 33.

## Before / after

**iPhone, P-029: g vs g + this rule** (the landing stack without R1). Driver M, hold 2000 × 3, C V V C C V V C,
13:17-13:25Z. Sentinel passed.

| | g (control) | g-cdwc |
|---|---|---|
| moving frames > 50 ms per run | 1 / 2 / 3 / 27 | 0 / 0 / 0 / 0 |
| moving frames > 34 ms per run | 51 / 48 / 47 / 58 | 0 / 0 / 1 / 0 |
| ±4 ms (>46/>54, >30/>38) | 2-37 / 0-20, 56-66 / 28-55 | 0 / 0, 0-2 / 0 |
| moving p50 | 29-40 ms | 18-23 ms |
| max | 54-68 ms | 28-35 ms |
| excess per fwd tween, first 450 ms | 209-234 ms | 79-146 ms |
| face-repaint frames, first 450 ms | 85 % | 0 % |
| layers at the hold | 113 | 33 |

- The result is not threshold-sensitive.
- P-017 (gh vs gh-cdwc vs gh-cdhid, 11:57-12:07Z) showed the same mechanism and size of effect on the R1 base.

**Chrome** (`fix.mjs ab mw10e-cdwc --on aw1-10e`, regression check, mobile 6x, n=5 on main 5f188b9, whose tools are those of 5075aac (main has had no tool changes since), snapshot
b1789284481295-4ad4a84a). Chrome doesn't reproduce the WebKit repaint, so no Chrome gain was expected, and none was found.

- **No regressions.**
  - Console errors: 0 new.
  - 404s: 0 new.
  - Screenshot diff: top 0.10 %, middle 0.01 %, bottom 0 %. That is countdown phase noise.
  - morphReached: 5/5 on both sides.
- **`results.json` (n=5, 13:47Z, with `--frame-log`).** Every row is within noise:
  - scroll >34 ms: 5 [3-8] vs 5 [1-5];
  - scroll >50 ms: 1 [0-4] vs 1 [1-2];
  - morph >50 ms: 0 vs 0;
  - scroll p95: 17.1 vs 17.3 ms.
- **Host contamination.** 6 of 10 runs were contaminated (other CPU 26-41 % > 25 %), so these verdicts are provisional.
- **An earlier n=3 run said WORSE, and it was noise.** At 13:29Z (all runs clean), scroll >34 ms was 3 [3-4] vs 5 [5-6], "WORSE (ranges do not overlap)". The n=5 frame log rules that out:
  - The k≥5 frames sit at the same scroll positions on both sides: y≈700, y≈1660-1760, y≈3650, and the end at 5345.
  - Two frames have no counterpart on the other side, one on each:
    - base: y≈1456 (41 ms);
    - fix: y≈931 (42 ms, in a contaminated run).
  - The patched side adds no recurring position.
  - Per run, k≥5 counts are base 5/5/3/7/5 and fix 3/1/4/5/5. k≥7 counts are base 2/1/0/2/1 and fix 1/1/2/2/1.
  - So the n=3 split was run-to-run spread over the same recurring frames, not a cost of the rule.
  - The n=3 table is kept at `out/cdwc-ab-n3.log` (local).

## Risks, conflicts, follow-ups

- At the hold, the seconds digit's spring (~0.3 s per second) repaints a 1ch × 1.3em box inside the panel layer
  instead of moving a layer. That costs nothing measurable. P-029 held m=1 (atOne):

  | | p95 | max | frames over 34 ms |
  |---|---|---|---|
  | g-cdwc (4 runs) | 17 ms | 17-25 ms | 0 |
  | g (4 runs) | 17-18 ms | 35-57 ms | 2-7 (g8: 4 frames over 50 ms) |
- Coupling F-056: countdown-idle-raf's countdown-ca (sampled WAAPI keyframes on the faces) must keep these faces
  at `will-change: auto`, or keep their transforms still during the morph tween.
- Desktop: the same rule applies; it removes 80 layers there too and changes no pixels.
- The `.svelte-1quva9c` scope hash belongs to this frozen build.
