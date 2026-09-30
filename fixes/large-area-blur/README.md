# Fix: large-area-blur

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured. Mechanism plus iPhone paint evidence (/03); Chrome A/B provisional and within noise; gain pending the combined wave A/B
**Topic:** `fixes/TOPICS.md` #8 (large-area-blur), conflict cluster D
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only. Rules (1-based, pretty baseline):
`.start-selling-future:not(.is-visible) > .start-selling-future-card` (2393-2404),
`.start-selling-future.is-visible > .start-selling-future-card` (2405-2414), the entry animations
`.start-selling-platform-cred…is-enter …cred-card` (6515-6517), `@keyframes start-selling-cred-card-in`
(6518-6529), `.start-selling-platform-profile…is-enter …profile-phone` / `…reviews …cred-card`
(7511-7518), `@keyframes start-selling-profile-phone-in` (7519-7530).

## Why it lags

Blur is a GPU/raster cost, not main-thread script, so it barely registers under Chrome's CPU throttling
(`research/cpu-throttle-calibration/README.md`: "CPU throttling does not slow the GPU process").
The research lists blur on large layers as ranked suspect 5 (`motion-inventory.md` "Ranked suspects",
and the README recommendation 5: "Don't animate `filter: blur` or `backdrop-filter` on large layers").
Every blur in `2.gBuqKVzi.css`, and what it costs:

| rule (CSS line) | what | cost | here |
|---|---|---|---|
| future-card reveal, 2393-2414 | `filter: blur(14px)` → `none` over **1.6 s**, on a card that is `min-height: 100svh` on phones (3519-3525), i.e. a full-viewport filtered layer. It toggles on scroll in both directions (JS 11310: `is-visible` when the hero track is 72 % scrolled). Opacity is done at 0.7 s, so for the last ~0.9 s the whole card is fully opaque but still filtered, at blur ≤ 1 px. Going the other way, the blur keeps animating 0.9 s after the card is fully transparent. | **iPhone:** WebKit repaints the card's contents (the six 402x857 profile panels at y≈1177) while the filter changes. Timeline: 4 repaints of each panel per run | **changed** |
| lang switch, 11115-11116 | `backdrop-filter: blur(12px)` on the language button, which sits **inside** the fixed `.start-selling-top-nav` (SSR markup in `index.html`: `header.start-selling-top-nav > … > .start-selling-language-switch-wrap > button`), which has its own `backdrop-filter: blur(calc(20px*(1-var(--morph))))` (11342) | A second backdrop pass on every scroll frame (the nav is fixed, so its backdrop changes every frame) | **tried and reverted**: not a visual no-op (see "What changed") |
| entry animations 6518-6529, 7519-7530 | `cred-card-in` / `profile-phone-in`: `filter: blur(8px)` → `blur(0)` with `animation-fill-mode: both`, so every card keeps a **permanent** `filter: blur(0)` after entering | a filter (effect node / filtered layer) that does nothing, kept forever on every entered card and the profile phone | **changed** |
| `.start-selling-platform-stage-bg` 6369-6378 | static `blur(16px)` on `service-bg.jpg` / `service-quote/bg.png` (576x1024 / 736x1349) | static: paid only when that tile is (re)painted | not changed, see follow-ups |
| `.start-selling-platform-service-bg` 7899, `-service-quote-bg` 7911, `invoice-doc-in` 8582, `service-card-in` 9217 | blur rules | **dead CSS**: those classes appear nowhere in the JS or the SSR HTML (`fix.mjs grep`) | none |
| `.start-selling-platform` 5392, nav 11342, earn button 11486, morph pill 10452/10500/10545 | `--morph*`-driven blurs | cluster D: owned by `morph-scrolljack-passive` (fix-nav-morph) | proposed to the owner, see below |
| hero 1735/1911/1927/1933 | `--exit-*`-driven blurs | cluster D: owned by `hero-exit-scroll-timeline` (wave 2) | proposed to the owner, see below |

## What changed

1. **Future-card reveal** (2393-2414): the filter transition keeps the *exact same blur-over-time
   curve* and stops once the remaining blur is invisible. The original 1.6 s
   `cubic-bezier(0.16,1,0.3,1)` curve is resampled into a CSS `linear()` easing (17 stops, max error
   0.03 px of blur) over a shorter duration:
   - show: `filter 0.9s linear(…)`. Blur matches the original up to 0.9 s, when the original is at
     0.24 CSS px (< 1 device px at DPR 3), then snaps to `none` instead of creeping to 0 over 0.7 s more.
   - hide: `filter 0.7s linear(…)`. Blur matches the original until opacity reaches 0 at 0.7 s, then
     jumps to 14 px while the card is invisible.
   - The original `transition` declaration is kept first as a fallback for browsers without `linear()`
     (Chrome < 113, Safari < 17.2). Opacity, transform and visibility timings are unchanged.
2. **Entry animations** (6515-6530, 7511-7530): the `filter` part of `start-selling-cred-card-in` /
   `start-selling-profile-phone-in` moved into a separate `@keyframes start-selling-entry-blur-in`
   (blur(8px) → blur(0)), run alongside with the same duration, delay and easing but
   `animation-fill-mode: backwards`. Opacity/transform keep `both`, so the end state is unchanged. After
   the entry the filter returns to its base value `none` instead of a permanent `blur(0)`. The stacking
   context is unchanged, because the filled `transform` keeps one.
   `prefers-reduced-motion` and `.is-static` still set `animation: none` on these elements, and that
   shorthand also cancels the new animation.

Tried and **reverted**: removing the nested `backdrop-filter` from `.start-selling-language-switch`
(11115-11116). I expected a visual no-op, because the nav's own backdrop-filter makes it a Backdrop Root.
It is not one: in Chrome the EN pill on the dark nav rendered visibly darker without it (the first A/B's
screenshot diffs, middle 0.51 % / bottom 0.50 %, are exactly the pill: x 219-290, y 25-58 CSS px). So
the cost stays, and the change needs a design decision (e.g. a slightly more opaque fill instead of a
second blur) that isn't a pure performance fix.

Visual difference: none intended. The only frames that change are the future card at ≤ 0.24 px blur (show)
and at opacity 0 (hide). Screenshot diffs: see Before / after.

## Why that is faster

- Future card: 0.7 s less full-viewport filtered layer per reveal and 0.9 s less per hide. On WebKit that
  means fewer repaints of the card's contents (measured below). In Chrome a blur transition can't run on
  the compositor (pixel-moving filter), so it also ticks main-thread style for 0.7-0.9 s less.
- Entry cards: no leftover filter layers after the entry.
- None of this is main-thread script, so the Chrome CPU-6x A/B is expected to be within noise.

## Before / after

**Provisional, contaminated:** host load1 was 19-48.8 during these runs (I-016), so no verdict can be drawn. The quiet-host re-run (/07) was abandoned by lead decision: this is GPU-only work that Chrome can't show (FINDINGS P5). Tools: before I-002 (no idle phase).

`node tools/fix.mjs ab large-area-blur --runs 5` (Chrome, mobile 430x932 DPR3, CPU 6x, ABBA order, cold cache, serve `--vendors=local --https --latency 150`):

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 68.2 [61.9-69.6] | 66 [64.8-68.8] | -2.2 (-3.2%) | within noise |
| scroll: frames >20 ms | 108 [94-119] | 108 [104-114] | 0 (0%) | within noise |
| scroll: frames >34 ms | 14 [12-19] | 14 [11-16] | 0 (0%) | within noise |
| scroll: frames >50 ms | 6 [5-8] | 5 [4-7] | -1 (-16.7%) | within noise |
| scroll: frames >100 ms | 0 [0-1] | 1 [0-2] | +1 | within noise |
| scroll: worst frame ms | 100 [99.2-108.5] | 108.1 [92-124.4] | +8.1 (+8.1%) | within noise |
| scroll: p95 frame ms | 25.9 [25.8-33.3] | 25.9 [25.7-32.6] | 0 (0%) | within noise |
| scroll: LoAF ms | 353 [325-389] | 399 [322-418] | +46 (+13%) | within noise |
| scroll: LoAF script ms | 208 [176-212] | 215 [151-232] | +7 (+3.4%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 88 [51-106] | 93 [47-113] | +5 (+5.7%) | within noise |
| morph: fps | 104.8 [101.4-108.6] | 107.1 [103.9-110.5] | +2.3 (+2.2%) | within noise |
| morph: frames >50 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |

Screenshot diff patched vs baseline: top 0.13 %, middle 0 %, bottom 0.09 %. No new errors or 404s; morph reached 5/5 on both sides. Every range overlaps, and with load this high none of the deltas mean anything. The first A/B (/01, load 4.2-12.4, with the lang-switch hunk) was also within noise on every metric.

A/A noise floor (fix-countdown-idle-raf, mobile 6x, n=5, 413a293): scroll fps 71.4-77, >20 ms frames
54-78, >34 ms 7-10, >50 ms 3-5, LoAF 195-283 ms, forced style+layout 34-83 ms; morph phase flat.
Deltas below ~15 frames (>20 ms), ~80 ms LoAF or ~40 ms forced layout are noise at n=5.

### iPhone 15 Pro Max (iOS 26.6.1 Safari), lease held 21:20-21:32 UTC

**Note:** these iPhone runs used the first patch version, which also removed the lang-switch
backdrop-filter (reverted later). That hunk can't cause paints (a backdrop-filter is a compositing
effect), and the per-rect diff below puts the whole paint-area change on the future card.

Served over plain **http** (`serve.mjs` without `--https`; incident I-003: Safari's certificate warning
page blocks `iphone.mjs` on a new https port), baseline `site-pretty` vs this overlay, same
`--vendors=local --latency 150`.

Scripted scroll (`iphone.mjs scroll`, 3 runs each, alternated B P P B B P):

| phase scroll | baseline (3 runs) | patched (3 runs) |
|---|---|---|
| fps | 52.5 / 52.7 / 52.9 | 53.0 / 53.1 / 53.3 |
| frames > 34 ms | 14 / 17 / 16 | 16 / 11 / 15 |
| frames > 50 ms | 3 / 4 / 6 | 2 / 3 / 2 |
| worst frame ms | 92 / 97 / 97 | 103 / 113 / 98 |

The fps ranges don't overlap, but the gap is 0.1 fps at the edges: **within noise** for frame times.

WebKit Timeline during the same scripted scroll (1 s Timeline chunks, the method of
`research/01-initial-investigation/tools/record.mjs`; 8 chunks per run, 3 runs each, alternated B P P B B P):

| | baseline | patched |
|---|---|---|
| paint area (Mpx CSS px²) | 53.6 / 54.0 / 54.7 | **48.1 / 49.2 / 48.9** |
| paint count | 2173 / 1957 / 2096 | 2113 / 2147 / 2159 |
| layouts | 894 / 873 / 879 | 896 / 880 / 866 |
| style recalcs | 1418 / 1422 / 1396 | 1450 / 1404 / 1420 |

Painted area is down ~10 % (~5.5 Mpx per run) and the ranges don't overlap. Per-rect diff: the 402x857
rects at y≈1177 (the six profile panels inside the future card, `#profile-showcase` is inside
`section#people > .start-selling-future-card`) are repainted 4x per run in the baseline and 2x
patched, i.e. the shortened filter transition halves WebKit's repaints of the card's contents. The small
per-frame paints (countdown, doc-sweep text) are unchanged. The backdrop-filter and entry-filter parts
don't show in paint counts: they are compositing costs, not paints.

**iPhone pending** for the final patch version: the phone was disconnected after these runs, so the final
patch (lang-switch hunk reverted) has only the Chrome A/B. Blur raster cost is a phone-GPU question
(Chrome's CPU throttle doesn't slow the GPU), so the phone is the right place to confirm. Still to do:
re-run the scripted scroll plus the Timeline paint-area check on the final overlay, and an entry-animation-only
attribution run.

Extra check for fix-nav-morph (not part of this patch, uncommitted variant overlay
`large-area-blur--platform-none`): `#platform` `filter: none` vs the baseline's permanent `blur(0px)`,
6 s idle at the page bottom, 2 runs each. Paints 1676/1766 vs 1809/1762, area 4.5/4.7 vs 4.9/7.8 Mpx:
no measurable difference at rest. Bottom-of-page idle paints are ~50/s per rect from the
`start-selling-platform-i-doc-sweep` background-position text animation (CSS ~11103), reported to
fix-layout-animations.

## Experiments tried

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status |
|---|---|---|---|---|---|---|---|---|
| large-area-blur/01 | first overlay: future-card `linear()` shortened filter transition + entry blur split to `backwards` fill + lang-switch nested backdrop-filter removed | less GPU blur work; Chrome 6x expected flat | broke (visual) | old-tools (load 4.2-12.4) | all metrics within noise, n=5; screenshots middle 0.51 % / bottom 0.50 %, exactly the EN pill (darker) | `variants/01.diff`; worktree `out/ab-first-run/results-with-langswitch.json`, `out/ab/large-area-blur/2026-09-30T21-19-11-624Z/` | the nested backdrop-filter is not a visual no-op in Chrome (FINDINGS P6: crop the diff) | superseded by /06 |
| large-area-blur/02 | overlay /01 on the iPhone, scripted scroll (`iphone.mjs scroll`, plain http) | fewer dropped frames on the phone GPU | within noise | clean (phone) | scroll fps 52.5-52.9 -> 53.0-53.3; >34 ms 14-17 -> 11-16; >50 ms 3-6 -> 2-3; n=3 each, B P P B B P | `variants/01.diff`; worktree `out/iphone/large-area-blur-*.json`; README "iPhone" | 60 Hz A17 GPU absorbs it; frame times don't separate | on branch |
| large-area-blur/03 | overlay /01 on the iPhone, WebKit Timeline paint counts during the scripted scroll | a shorter filter transition means fewer repaints of the filtered card | better | clean (phone) | paint area 53.6-54.7 -> 48.1-49.2 Mpx (disjoint), n=3 each; future-card panel (402x857) repaints 4 -> 2 per run | `variants/01.diff`; worktree `out/iphone-timeline/*-scroll-*.json`; README "iPhone" | WebKit repaints a filtered layer's contents while the filter changes; cut invisible tails | on branch |
| large-area-blur/04 | `#platform` `filter: none` instead of the permanent `blur(0px)` (CSS 5392, nav-morph's rule), iPhone Timeline, 6 s idle at the bottom | blur(0) repaints at rest | within noise | clean (phone) | paints 1809/1762 -> 1676/1766; area 4.9/7.8 -> 4.5/4.7 Mpx, n=2 | `variants/04.diff`; worktree `out/iphone-timeline/*-bottomidle-*.json` | no paint cost at rest (layers not counted); nav-morph dropped the change | dropped |
| large-area-blur/05 | lang-switch nested backdrop-filter removed (CSS 11115) | one backdrop pass fewer per frame on the fixed nav; visually a no-op (Backdrop Root) | broke (visual) | old-tools | screenshot diff 0.51 % on the pill, which renders darker | `variants/01.diff`, the CSS 11115 hunk only (no separate patch kept: never measured alone) | theory wrong in practice; needs a design-approved fill | retry when a replacement fill is agreed (N6 nav-backdrop-budget) |
| large-area-blur/06 | final overlay (/01 minus /05) | as /01 | within noise | contaminated (load 19-48.8, I-016) | fps 68.2 [61.9-69.6] -> 66 [64.8-68.8]; >20 ms 108 -> 108; LoAF 353 -> 399 ms, all ranges overlap, n=5; screenshots 0.13 / 0 / 0.09 % | `variants/06.diff` (= `patch.diff`); worktree `out/ab-first-run/results-final-provisional-load19-49.json` | host overload; no verdict | superseded by /07 |
| large-area-blur/07 | final overlay, quiet-host Chrome re-run | as /01 | abandoned | - | never ran: GPU-only, Chrome is blind to it (FINDINGS P5); the gain is shown on the iPhone (/03) and is left to the combined wave A/B (lead decision, via mgmt-ops) | `patch.diff` (= `variants/06.diff`) | a Chrome slot can't show raster cost | dropped |
| large-area-blur/08 | own CDP trace script (GPU/viz event counts, filter census) under the lock | a GPU-side metric Chrome's CPU throttle can't hide | abandoned | - | never ran | no patch kept (a measurement script, not an overlay; it stays in the scratchpad) | dropped for the one-queue-entry budget | retry when the lock queue is short |
| large-area-blur/09 | pre-blurred `.start-selling-platform-stage-bg` images instead of `filter: blur(16px)` | static blur paid on every tile repaint | abandoned | - | not built | no patch kept (never built) | needs new binary assets, and CSS blur's edge fade differs per responsive size; Timeline showed only 2-5 stage-sized repaints per run | dropped |

## Risks, conflicts, follow-ups

- `linear()` easing needs Chrome 113+ / Safari 17.2+ / Firefox 112+. Older browsers drop the second
  `transition` declaration and keep the original one (identical to baseline).
- If `is-visible` toggles mid-transition, reversal behaves as in the baseline (same properties, shorter
  filter duration); the reversing-shortening of the filter part is proportionally shorter.
- Entry-animation part: its benefit is a *layer* that goes away (a leftover `blur(0)` is still a filtered
  layer or effect node), not paints, so paint counts can't show it. A CDP `LayerTree` layer count
  before and after entering the platform rows would size it; not measured (one queue slot per agent).
  The same goes for the `#platform` `blur(0)` check above: paints were equal, and layers were not counted.
- **iPhone to size** (architecture review; later topic N6 `nav-backdrop-budget`, not this one): on iOS an
  always-on backdrop-filter re-blurs whatever scrolls under it every frame, a GPU cost Chrome can't
  show. That covers the nav's `backdrop-filter` (11342) and the nested lang-switch one (11115).
- Follow-up: the lang-switch nested backdrop-filter (11115) is still a per-frame cost on the fixed nav.
  Removing it changes the pill's look (see "What changed"), so it needs a design-approved replacement fill.
- Cluster D, not touched here, proposed to the owners:
  - fix-nav-morph: `#platform` permanent `blur(0px)` (5392); nav backdrop `blur(0)` at morph = 1 (11342);
    earn button `blur(calc(var(--earn-out)*10px))` = `blur(0)` at rest (11486); pill/panel blur(0) at
    rest (10500, 10545). The owner decided not to patch 5392 (no iPhone paint gain at rest, per the check
    above, and a containing-block risk).
  - hero-exit (wave 2): `blur(calc(var(--exit-scatter)*18px))` = permanent `blur(0)` at rest
    (1735/1911/1927/1933); the owner implemented `filter:none` at rest plus a scroll-driven exit blur.
- Not done: pre-blurring `.start-selling-platform-stage-bg` (static blur(16px) on two photos). It would
  need new image assets (outside a text `patch.diff`), and CSS blur's transparent edge fade can't be
  reproduced exactly at every responsive stage size. Static blur is paid only on repaint, and the iPhone
  timeline showed only 2-5 repaints per run of stage-sized rects (390x312), the same in baseline and patched.
