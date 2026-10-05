# Research: end-bg (end-of-page background images, user T-193 #10)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). The test overlays contain excerpts of Fastwork's code: they stay local and are never committed.

**Status:** research (no fix). **Stage:** I (attribution): P-137 says CAUSE (§5); next, which part (sub-arm card).
**Owner:** fix-end-bg.
**Question (user T-193 #10/#12):** do the background images in the last screen cause the end-of-page lag, and would an
"optimize it like the hero card" treatment help?
**Driver(s):** Chrome probes (counts only, shared lane), phone G (`iphone.mjs gesture`) for the P-137 block.
**Prediction:** `fixes/PREDICTIONS.md` P-137 (card §3, signed; result §5).
**Base:** C = v9-final + morph-scroll rev 7d (`fix.mjs apply --from morph-scroll-v9try`), JS 1b2eecc66011, CSS e1359ab9994a.

## 1. What is in the last screen (Chrome inventory, OBSERVED)

Probe: `fixes/end-bg/endbg-chrome.mjs --mode inv` (430x775 and 430x815, DPR 3, touch, hover:none/pointer:coarse,
positions pre / m0 / mhalf / m1 of the 7d menu morph), summary `fixes/end-bg/inv-summary.mjs`. Raw file
`out/end-bg/inv-2026-10-05T11-23-24-796Z.json` (local). Geometry at 775: runway t = 775 px, max scroll 5964, #platform
430x1881 sticky (top `calc(100dvh - var(--fw-ms-h))`), menu panel 52 → 402 → 751 px tall from m0 to m1 (791 at 815).

| what (selector) | source | intrinsic | shown at | bytes | decoded (w·h·4) | sizing |
|---|---|---|---|---|---|---|
| menu photo wall (`.start-selling-morph-col img`, CSS l.10973-11021, will-change transform, 16 s drift) | roles/*.png x5 | 1282x1282 | ~138 px wide columns | 325-440 KB each | 6.6 MB each, ~33 MB | %, column flow |
| same wall | post-*, portfolio-*, cover-cafe, work-*, service-*, avatar-cat (16 more, list in §1.1) | 341x512 to 960x540 | same | 84-392 KB | 0.5-3.4 MB each | same |
| agents mesh (`.start-selling-platform-invoice-sheet::before`) | agents/mesh.jpg | 1280x1024 | cover in 640x512, opacity 0.5 | 338 KB | 5.2 MB | px |
| grain overlay (`::after`, stage-grain) | platform/grain.png | 256x256 | tiled at 128 px, mix-blend overlay | 100 KB | 0.26 MB | px |
| stage mesh (`.start-selling-platform-stage.is-mesh-bg`) | radial gradients + grain | n/a | 390x311 | n/a | n/a | px |
| secure network | hex-rings.svg, shield, flags, dash.svg | ≤ 557x615 | as drawn | ≤ 10 KB each | small | px |
| service backdrop (`.start-selling-platform-stage-bg`) | service-bg.avif | 576x1024 | blur(16px), only before the morph | 69 KB | 2.4 MB | % |
| menu veil (`.start-selling-morph-veil`) | radial gradient | n/a | panel size | n/a | n/a | follows the panel |

Large non-image painters in the same screen (blur layers, not backgrounds, out of this ablation's scope): #platform's
`filter: blur(calc((1 - var(--morph-fade)) * 12px))` (CSS l.5698) over 430x1881; the menu panel's `filter: blur(…)`
(l.10957); the header's `backdrop-filter: blur(calc(20px * (1 - var(--morph))))` (l.11792), which is the only painter whose
box changes between 775 and 815 (751 → 791 at m1). Nothing in the last screen uses `background-attachment: fixed`; no
background size depends on vh. T-193 #9 item 4 measured the blur layers (paints -16/-22 % without them).

### 1.1 The menu photo wall in detail (user T-193 #23)

The wall is 5 columns (`c`, JS 13784-13831, each with a `--col-offset` and a list of `[src, height px]`), built by the
templates `cN`/`sN` (JS 13772-13773: `<img loading="eager" decoding="async">`). Its `src` is set only once the menu shows
(`s(b) || s(E)`, JS 14621), and the box height comes from the list (`height: …px`). CSS l.11000-11005: `object-fit:
cover`, `width: 100%`, radius 12 px; the column is 138.1 CSS px wide at 430 px, so 414 device px at DPR 3. The image is a
plain `<img>` without `srcset` (the live site serves the same PNG/JPEG files here, research/image-cost §1). Files measured
on the snapshot with `sips`/`stat`; "x need" = intrinsic ÷ what cover needs at DPR 3 (> 1: larger than any phone screen
shows).

| column | image (under /selling/) | intrinsic | box CSS px | KB | x need | decoded MB |
|---|---|---|---|---|---|---|
| 1 | media/post-1.png | 368x447 | 138x360 | 253 | 0.41 | 0.7 |
| 1 | media/cover-cafe.jpg | 960x539 | 138x212 | 392 | 0.85 | 2.1 |
| 1 | roles/graphic-designer.png | 1282x1282 | 138x349 | 429 | 1.22 | 6.6 |
| 1 | media/service-kitchen.png | 410x512 | 138x167 | 366 | 0.99 | 0.8 |
| 1 | work/work-a.jpg | 736x920 | 138x212 | 126 | 1.45 | 2.7 |
| 2 | media/post-2.png | 368x460 | 138x360 | 222 | 0.43 | 0.7 |
| 2 | profile/portfolio-1.jpg | 960x540 | 138x360 | 275 | 0.50 | 2.1 |
| 2 | media/post-4.jpg | 819x1024 | 138x360 | 145 | 0.95 | 3.4 |
| 2 | roles/architect.png | 1282x1282 | 138x224 | 317 | 1.91 | 6.6 |
| 3 | media/avatar-cat.png | 341x512 | 138x295 | 290 | 0.58 | 0.7 |
| 3 | media/post-3.png | 341x512 | 138x527 | 266 | 0.32 | 0.7 |
| 3 | work/work-c.jpg | 735x893 | 138x394 | 84 | 0.76 | 2.6 |
| 3 | media/service-cafe.png | 480x270 | 138x360 | 290 | 0.25 | 0.5 |
| 4 | roles/software-engineer.png | 1282x1282 | 138x360 | 396 | 1.19 | 6.6 |
| 4 | media/post-5.jpg | 735x893 | 138x443 | 84 | 0.67 | 2.6 |
| 4 | work/work-e.jpg | 736x1042 | 138x221 | 134 | 1.57 | 3.1 |
| 4 | profile/portfolio-2.jpg | 960x540 | 138x525 | 351 | 0.34 | 2.1 |
| 5 | roles/web-developer.png | 1282x1281 | 138x360 | 357 | 1.19 | 6.6 |
| 5 | profile/portfolio-3.jpg | 960x540 | 138x360 | 369 | 0.50 | 2.1 |
| 5 | work/work-f.jpg | 600x848 | 138x417 | 90 | 0.68 | 2.0 |
| 5 | roles/project-manager.png | 1282x1281 | 138x360 | 328 | 1.19 | 6.6 |

- **Only 10 can ever be seen on a phone** (user hint T-193 #25). At `width <= 640px` columns 4 and 5 are `display: none`
  (C's CSS l.11302 media, rule l.11400; baseline l.10888/10986): 8 images, 2.1 MB, still fetched because the `<img>` is
  `loading="eager"`. In the 3 shown columns the column is shifted by `translateY(--col-offset)`, a % of its own height,
  which is the panel height H, and the track drifts ±56 px; the backdrop clips at H. Solving which items ever enter
  [0, H] (H 402 / 751 / 791): work-a, architect and service-cafe never do at H ≤ 791 (architect misses by 8 px). At H 908
  (Chrome's 430x932) 2 of them do, so Chrome at 932 shows 12. This matches the inventory's 10 in view at 775/815.
- 21 images, 5.4 MB on the wire, 61.7 MB decoded at intrinsic size. Only 7 are larger than a DPR 3 screen needs (the 5
  roles PNGs, 1.19-1.91x, and work-a/work-e, 1.45-1.57x); resizing those 7 to their need gives 45.8 MB (-16 MB). 12 are
  already smaller than the need (upscaled on the phone).
- 10 PNGs are photos (222-429 KB); JPEG/WebP/AVIF would cut bytes, not decoded memory.
- The Chrome census (§4) saw no decode in any toolbar-step window: once decoded, the wall costs raster, not decode. The
  earlier WebKit study (research/image-cost §0) found the first-paint decode in WebKit is the only size-dependent cost,
  and that images are not what makes frames slow on this page (Paint 0.25 s against Composite 8 s and Layout 11 s per
  scroll, Simulator, OBSERVED).

## 2. The ablation arm "nobg" and its fairness (Chrome, OBSERVED)

`fixes/end-bg/nobg.css` (sha d566af712894), appended to C's CSS gives V (CSS 38679ce9de15): every background image,
gradient, grain/blend layer and backdrop photo of #platform, the menu morph and the nav stops painting
(`background-image: none`, `mix-blend-mode: normal`, `visibility: hidden` on the photo `img`s). No display, size, position
or animation property changes. A TEST build, not a fix: it changes what you see.

Fairness probe `endbg-chrome.mjs --mode fair --arms C,nobg,C,nobg` (shared slot, 11:26Z; `out/end-bg/fair-…json`):

| | C run 1 | nobg 1 | C run 2 | nobg 2 |
|---|---|---|---|---|
| element boxes (1516, at pre / m0 / m1) | | all equal to C except animated ones | | |
| rAF callbacks / Layout / UpdateLayoutTree (m0 → m1 → m0, 40 steps) | 120 / 84 / 129 | 120 / 84 / 130 | 120 / 84 / 129 | 120 / 84 / 130 |
| elements restyled | 1905 | 1910 | 1905 | 1910 |
| Paint events | 564 | 564 | 564 | 564 |
| RasterTask | 827 | 556 | 804 | 544 |
| JS listeners | 168 | 168 | 168 | 165 |

- Boxes: the only element boxes that differ between C and nobg also differ between two C runs (countdown digit rolls,
  photo-wall drift, 70-84 elements), except one 73x3 box at m1 (x 244 vs 240) which is the secure-network dash glint,
  a 5 s translateX loop (CSS l.7152-7170): animation phase, not layout.
- Script and layout work are the same (rAF, layout, timers, observers); restyles +5 of 1905 (0.3 %). Paint events are
  equal, raster tasks drop by a third: the arm removes paint content only, as intended.
- Chrome's probe injects nobg.css as a `<style>` after load; the phone arm V serves it appended to the CSS file. All rules
  are `!important`, so the cascade result is the same.

## 3. P-137 phone block card (draft for the ops pre-data read)

**Question.** On the real iPhone, in the last screen after the finger lifts, do the background images and grain layers
cause the slow frames the user sees? (User T-193 #10/#12/#17: "remove all background then try to swipe", real-device proof.)

**Arms.** C = v9-final + morph-scroll 7d (JS 1b2eecc66011, CSS e1359ab9994a). V = C + nobg.css (JS 1b2eecc66011, CSS
38679ce9de15). Same base, one change, paint only (section 2). Immutable snapshots: `out/snapshots/endbg-C-e1359ab9994a`,
`out/snapshots/endbg-V-38679ce9de15` (read-only, in fix-end-bg's worktree); the server script copies them into the runner's
`out/p137/snap/{C,V}` and checks the pins.

**Driver, profile, procedure.** G (`iphone.mjs gesture`), script `fixes/morph-scroll/g-fastshort-v1.json` (compiled
program 8737f212c0ff, GESTURE_BUDGET_S 229), E procedure (first touch 4.0-5.5 s after page ready), the same script and
procedure as T-194's E1 on C. Its swipes end at the page bottom. Profile xcode-serious (thermal gate
`thermal-gate.mjs --expect serious --max-c 44 --accept-induced` on the plain baseline server B, at each phone hold's
edges). Plain http, `--vendors=local --latency 150`. Every counted run captures Timeline.

**Block.** One uncounted warm-up per arm port (WC, WV), Timeline-off sentinel S0 on C, 8 counted runs in C V V C C V V C
order (EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4), at most 2 re-runs of runs that fail a run gate, end sentinel S1 on C. 14 fs runs
at most, in 600 s `--no-timing` chrome-measure holds of 2 runs inside two `lock.mjs run iphone --block P-137` holds:

```
part 1: H1 WC,WV | H2 S0,EC1 | H3 EV1,EV2           part 2: H4 EC2,EC3 | H5 EV3,EV4 | H6 EC4 | H7 TAIL (re-runs, then S1)
```

Served JS and CSS of both arms are hashed before every item (a mismatch voids the hold). Sentinel rule and run gates are
the signed P-129 reader rev 1.1's (`research/serious-heat/p129-read.mjs`: S fps ≥ 50 and slow share ≤ 6 %; G1-G6).

**Metric (the same read as T-194).** Per counted run: moving frames in the reader's lastScreen band (scrollY ≥ docH - 2 ×
innerHeight) whose last touch event is a touchend; s(th) = those with dt > th.

**Baseline on C (T-194 E1, one run, read with `p137-read.mjs` on its files):** n 386 frames, >30 24, **>34 19**, >38 12,
>46 6, >50 5, >54 5; class split at >34 (busy) MAIN 4 / RENDER 4 / MIXED 11 (busyRF MAIN 5 / RENDER 0 / MIXED 14); 84 % of
these slow frames sit on a toolbar step (innerHeight changes next to them).

**Decision (>34, per-run counts, ≥ 3 valid runs per arm, both sentinels PASS):**

| verdict | rule |
|---|---|
| CAUSE | max(V) < min(C) and median(V) ≤ 0.5 × median(C) |
| CONTRIBUTES | max(V) < min(C) and median(V) > 0.5 × median(C) |
| WORSE | min(V) > max(C) |
| NOT SHOWN | the ranges touch or overlap |

- Denominator guard: when median n differs between the arms by more than 15 % of C's, the same rule runs on per-run
  rates s/n, and the output says so.
- Twins: the same rule at >30 and >38; any twin with another verdict marks the result "threshold-sensitive".
- >50 (twins >46/>54): reported with the same rule, decides nothing (about 5 frames per run on C: thin).
- Class split (MAIN/RENDER/MIXED, busy and busyRF) and toolbar-step share: descriptive.

**Predictions (before data).**

| # | prediction | p |
|---|---|---|
| 1 | verdict at >34: CAUSE | 0.08 |
| 1 | CONTRIBUTES | 0.30 |
| 1 | NOT SHOWN | 0.57 |
| 1 | WORSE | 0.05 |
| 2 | V's median >34 count is at least 10 (C's T-194 run: 19) | 0.80 |
| 3 | the toolbar-step share of V's slow frames stays ≥ 60 % | 0.80 |

Why: in T-194's C run the slow end frames are mostly MIXED/MAIN and 84 % sit on toolbar steps; RENDER-class frames (the only
ones paint removal can delete outright) are 4 of 19. Chrome's fairness pass shows the arm leaves layout and script alone
and cuts raster by a third. The leading candidates for the rest are the toolbar step itself (the 7d morph's m moves by
about 40/t on every innerHeight change and the whole menu re-renders; #platform's sticky top uses 100dvh) and the blur
layers, neither of which this arm removes.

**Falsification.** CAUSE (or CONTRIBUTES) with the twins agreeing means the user's instinct holds and section 4's
candidates get a fix card. NOT SHOWN means the background images are not where the end-of-page lag comes from on this
device and procedure; the next suspects are named above.

**Kit (runner: iphone-runner; nothing else needed).**

```sh
sh fixes/end-bg/phone/p137-serve.sh start            # copies + checks the snapshots, starts C, V, B (plain http)
TICKET=P-137 P137_DRY=1 sh fixes/end-bg/phone/p137-block.sh H1:WC,WV H2:S0,EC1 H3:EV1,EV2 H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL
TICKET=P-137 node tools/lock.mjs run iphone --owner iphone-runner --block P-137 --max-seconds 3600 -- \
  sh fixes/end-bg/phone/p137-block.sh H1:WC,WV H2:S0,EC1 H3:EV1,EV2
TICKET=P-137 node tools/lock.mjs run iphone --owner iphone-runner --block P-137 --max-seconds 3600 -- \
  sh fixes/end-bg/phone/p137-block.sh H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL
node fixes/end-bg/phone/p137-read.mjs out/p137/runs --json out/p137/p137-read.json
sh fixes/end-bg/phone/p137-serve.sh stop
```

Dry run (11:33Z, fix-end-bg's checkout): snapshots ok, served hashes ok for both arms, compiled program 8737f212c0ff,
budget 229 s, every hold `DRY ok`. Reader self-test `p137-read.mjs --selftest` 8 ok; on T-194's E1 files it reproduces
T-194's lastScreen after-touchend counts (24 / 19 / 5).

## 4. What repaints on a toolbar step (Chrome census, OBSERVED)

Probe `endbg-chrome.mjs --mode census --arms C,nobg,C,nobg` (shared slot, 11:45Z; read `out/end-bg/census-read.mjs`, both
local). At each morph position the page sits still with the finger down. A ~700 ms control window is followed by a
toolbar step window (innerHeight 775 → 815 or back), 3 cycles per run, 2 runs per arm, so 6 windows per cell. Chrome's
emulated resize changes every viewport unit, not only dvh, so it shows more invalidation than WebKit would. These are
counts, not timing.

| position, step | paints C / nobg | raster tasks C / nobg | layouts | nodes repainted on the step (both arms) |
|---|---|---|---|---|
| m0 (menu closed), 775→815 | 12.5 / 12.5 | 12.5 / 11.0 | 5 | page layer, row-title layers, stage artboard, pain-sticky |
| m0, 815→775 | 12.0 / 12.5 | 11.3 / 8.8 | 5 | same |
| mhalf, 775→815 | 122 / 128 | 68 / 55 | 6 | + orders card, stage artboard, menu photo wall track, svg |
| mhalf, 815→775 | 80 / 80 | 109 / 98 | 6 | same |
| m1 (menu open), 775→815 | 79 / 77 | 29 / 24 | 5 | page layer, row titles |
| m1, 815→775 | 112 / 109 | 120 / 89 | 12 | + photo wall track (16 paints, ~1.05 M px² clip), header 6 |

- Every toolbar step repaints the same nodes, the same number of times, with or without the backgrounds. The step
  (layout 5-12 per window, the same in both arms) triggers the repaint, not the pictures.
- Removing the pictures cuts the raster work of those repaints by 10-26 %, and does not touch the number of paints or
  layouts. No image decodes ran in any window (D 0): the pictures are decoded once and kept.
- The biggest repainter at the open menu is the photo wall (`.start-selling-morph-col-track`): 16 paints per shrink step
  at m1. With nobg its images are hidden, but the track still repaints.
## 5. P-137 result (phone, G driver, xcode-serious; owner's cross-check read, the official ops read pending)

Block 2026-10-05 11:51-12:47Z by iphone-runner: 7/7 holds VALID, no tail re-runs (N5: nothing ran outside the C V V C
order), sentinels S0 PASS (55.7 fps, slow 0.033) and S1 PASS (52.7, 0.055), every thermal gate Serious (Xcode-induced),
battery 36.8 → 39.3 °C. Read `node fixes/end-bg/phone/p137-read.mjs <runner>/out/p137/runs` (reader b6d24ad5e73c on
p129-read 06f74f5d19ca, N1); only the block's own C runs (N3).

| run | arm | n | >30 | >34 | >38 | >46 | >50 | >54 | busy MAIN / RENDER / MIXED at >34 | toolbar-step share |
|---|---|---|---|---|---|---|---|---|---|---|
| EC1 | C | 364 | 36 | 30 | 24 | 15 | 15 | 12 | 3 / 5 / 22 | 0.60 |
| EV1 | V | 428 | 5 | 2 | 1 | 0 | 0 | 0 | 2 / 0 / 0 | 0.50 |
| EV2 | V | 431 | 6 | 3 | 3 | 1 | 1 | 1 | 2 / 0 / 1 | 0.67 |
| EC2 | C | 387 | 23 | 17 | 9 | 3 | 0 | 0 | 5 / 2 / 10 | 0.88 |
| EC3 | C | 392 | 23 | 14 | 7 | 5 | 3 | 2 | 2 / 3 / 9 | 0.79 |
| EV3 | V | 424 | 5 | 3 | 1 | 0 | 0 | 0 | 3 / 0 / 0 | 0.67 |
| EV4 | V | 428 | 8 | 5 | 3 | 1 | 1 | 0 | 4 / 1 / 0 | 0.80 |
| EC4 | C | 390 | 29 | 15 | 10 | 2 | 2 | 1 | 4 / 3 / 8 | 0.87 |

- **Verdict CAUSE** at >34: max(V) 5 < min(C) 14, median V 3 ≤ 0.5 × median C 16. Twins >30 (26 vs 5.5) and >38 (9.5 vs 2):
  CAUSE, so not threshold-sensitive. Counts basis: median n 388.5 vs 428 (+10 %, under the 15 % guard).
- >50 (reported only): C median 2.5, V 0.5; NOT SHOWN at >50/>54 (EC2 has 0), CAUSE at >46.
- What goes away: the MIXED slow frames (49 of 76 at >34 on C, 1 of 13 on V); MAIN-class ones stay (14 vs 11). Paint of
  these layers costs main-side time on the iPhone far beyond what Chrome's census shows (OBSERVED; WebKit mechanism
  being checked against source).
- Predictions: #1 CAUSE (registered p 0.08) happened; #2 (V median ≥ 10) failed; #3 (V toolbar-step share ≥ 60 %) held
  (median 0.67, pooled 9/13). Both misses rest on one wrong model: that removing paint deletes only RENDER-class frames.
  On the iPhone it also deletes MIXED ones.
- The official read (ops-reader-P137) gives the same DECISION line and per-run numbers.
- WebKit mechanism (helper read of WebKit main a1c4dcf7, partly CONFIRMED): the paint walk runs on the WebContent main
  thread inside the rendering update (`RemoteLayerTreeDrawingArea::flushLayers`, `RemoteLayerBackingStoreCollection::
  paintReachableBackingStoreContents` paints the stores serially). On iOS DOM rendering goes to the GPU process by default
  (`ENABLE_GPU_PROCESS_DOM_RENDERING_BY_DEFAULT`, PlatformEnableCocoa.h), so the main thread records draw commands and the
  GPU process rasterizes. A layer whose size changes gets a new backing store (`ensureBackingStore` clears it): a full
  repaint. Whether GPU replay back-pressure stalls the next update: UNRESOLVED.
- User blind swipe pair C-069 (12:53-12:56Z, coin-flipped order): the user picked V (no backgrounds) as following the
  finger better, difference 3 of 5.
- The user accepted this as proof (T-193 #28): no sub-arm attribution. Next is an all-images optimization proposal.

## 6. All-images proposal (PR-025, user T-193 #28, T-197)

Every image on the page counted in Chrome (`img-scroll.mjs`, one load plus a scripted scroll at 430x775 DPR 3; "drawn" =
a PaintImage for that URL, since an IntersectionObserver misses wall images whose src is set late). Options built by
`img-build.mjs --option A|B|C` into ignored overlays (sips/avifenc in a `--no-timing` hold; no image bytes are committed
or in any patch.diff, Hard rule 3). Re-encoding is a visual change, so it is a proposal, not a silent fix.

| option | what | download on a phone | image decodes at load |
|---|---|---|---|
| today (C) | | 10.4 MB, 89 files | 36 |
| A lighter files | resize to 3x the shown size where it is over 1.15x; keep the original when the result is not smaller (5 files); wall template `loading="lazy"` (Safari 15.4, webkit.org/blog/12445) | 6.6 MB, 81 files | 27 |
| B A + AVIF | A, then AVIF q68 where the URL is a literal in JS/CSS/HTML (Safari iOS 16, webkit.org/blog/13152); 3 runtime-built seller paths right-size only | 4.5 MB, 89 files | 16 |
| C baked end backgrounds | each end stage's picture + grain + blend flattened into one JPEG at the shown size, at <= 640 px only | 11.0 MB | |

- Chrome scroll counts are the same in all options (draws ~916-920, raster ~970-985, paint ~1298-1368): Chrome can't
  show C's gain, which is a WebKit paint cost (section 5).
- Look check (`look-chrome.mjs`, full page every 0.75 viewport): C changes pixels only inside the stage boxes (mostly
  <= 20 levels); A and B change the avatars at y 2905 (0.06-0.07 %). All three are T3 (proposal) by the pixel rule.
- PR-025 rev 2 (rev 1 held because 6 resized files had come out bigger) is with the user, with Try-it pages per option.
  Its text says C may not remove the whole end-screen lag (section 7).

## 7. Pictures vs title sweeps (Chrome census, OBSERVED; finding F-289)

The nobg arm in P-137 also removed the gradient of three animated colour titles (doc, earn, secure; a 4 s
`background-position` sweep on `background-clip: text`, CSS l.6057-6118). Lead ruling: measure the split before any
title work. One shared slot, `endbg-chrome.mjs --mode census`, arms C, pictures-off (nobg minus the row-title lines),
titles-off (the 6 row-title lines only), both-off (nobg); 3 morph positions x 6 at-rest windows + 3+3 toolbar steps.
Census `out/end-bg/census-2026-10-05T15-02-55-649Z.json` (ignored).

| paints per window at the end (m1) | C | pictures-off | titles-off | both-off |
|---|---|---|---|---|
| at rest | 73.5 | 72.7 | 71.7 | 74.0 |
| step 775 -> 815 | 88.3 | 95.7 | 69.0 | 71.0 |
| step 815 -> 775 | 100.3 | 100.3 | 112.3 | 107.0 |

- All four arms are the same within their run spread at m0, m0.5 and m1. The secure and organized title spans repaint
  ~20 times per window in every arm, also with `background-image: none` (the sweep animation keeps invalidating;
  organized is in no arm).
- Both-off is the arm that cut phone slow frames 16 -> 3 in P-137, yet its Chrome counts equal C's. So the number of
  paints is not what differs; what each paint costs is (a picture with blend vs an empty box), and Chrome counts don't
  measure that. **Chrome counts cannot split pictures from titles** (OBSERVED in our setup).
- The decisive check needs per-paint cost on WebKit: a phone Timeline block with arms C / pictures-off / titles-off, or
  Simulator paint durations. Asked of the lead (ticket); no `end-titles` topic until it shows the titles' share.
- Correction to "with `background-image: none`" above (found while writing P-144, from the Chrome inventory
  `out/end-bg/inv-2026-10-05T11-23-24-796Z.json`, OBSERVED): at phone width the sweep titles take the
  `@supports (-webkit-mask-clip: text)` path, where the span's own background-image is already none and the moving
  gradient sits on its `::after`, masked to the text. nobg and titles-off set both the span and its `::after` to none
  (doc, earn, secure); the mask and the animation stay. So "the titles keep repainting with their gradient removed" holds
  for doc/earn/secure; organized keeps its gradient in every arm.

## 8. Prediction P-144: pictures vs title sweeps, paint time per toolbar step (Simulator Timeline, registered before data)

**Card rev 1, before any data.** P-id P-144 (mgmt-clerk-1). Lead ruling on F-289: the cheaper path first; a phone
Timeline ticket (G, xcode-serious) only if the Simulator can't split them. Next: the lead's Opus pre-data read, then his
signature. No run, dry run included, before the signature.

- **Question.** On the end screen of C, the nobg arm cut phone slow frames 16 -> 3 (P-137, CAUSE). nobg removes two
  things: the stage pictures, grain and blend layers (pictures-off, `pic`), and the gradients of three sweeping row
  titles, doc, earn and secure (titles-off, `tit`). Which of the two carries the paint cost of a toolbar step there?
- **Why it matters.** PR-025's option C (baked backgrounds) removes only the pictures. If the titles carry a real share,
  they get their own topic (`end-titles`, a proposal or a pixel-identical compositor version) and the user is told C alone
  is not expected to remove the lag. Chrome cannot answer it (section 7, F-289).
- **What is known** (our data only):
  - P-137 (phone G, xcode-serious): nobg CAUSE at >34 (C median 16, V 3); MIXED-class slow frames vanish.
  - Chrome census (F-289): paint counts per window equal in C, pic, tit and nobg; no durations.
  - WebKit (section 5, helper read of WebKit main a1c4dcf7, partly CONFIRMED): the paint walk runs on the WebContent main
    thread in the rendering update; on iOS DOM rendering goes to the GPU process by default, so the main thread records
    draw commands and the GPU process rasterizes. **Risk named before data:** WebKit Timeline's Paint records on the
    WebContent side may show the recording only, not the raster of a picture. Then M1 cannot see nobg's effect, the
    control fails, and the card ends CONTROL-FAILED (the outcome that sends the question to the phone ticket).
- **Base.** main as of `d9dabfc7` (this branch rebased on it). C is served from the `fixes/end-bg` overlay: v9-final +
  morph-scroll rev 7d, JS `1b2eecc66011`, CSS `e1359ab9994a` (the bytes P-137 measured as C). The driver checks the served
  hashes and `x-mirror-source: overlay` through the http twin before every hold (exit 26).
- **Arms** (`eb-inject.mjs`, appended as one `<style id="eb-arm">` after every page load, before the Timeline starts;
  paint-only properties: background-image, mix-blend-mode, visibility; the self-test checks it):

  | arm | CSS | asks |
  |---|---|---|
  | C | none | control |
  | C2 | none (C under another label) | A/A pair: the instrument's noise |
  | nob | `nobg.css` `d566af712894` (P-137's V) | positive control, in every hold |
  | pic | `sim/pictures-off.css` (nobg minus its six title lines) | pictures alone |
  | tit | `sim/titles-off.css` (the six title lines: doc, earn, secure and their `::after`) | the three titles alone |

  pic + tit = nob, selector for selector (self-test). The organized title's sweep and every title's mask and animation
  stay in all arms. All arms change the look: mechanism only, never shipped, no pixel check.
- **Applied probes** (counts and booleans, read at the end of each run): the stage grain's background
  (`.start-selling-platform-stage-grain`) and the secure title's (`.is-payment .start-selling-platform-row-title-secure`,
  span or `::after`) must be on/off as the arm says, and the style element present only in nob/pic/tit. A run that fails
  is INSUFFICIENT; a C that fails fails the replication gate.
- **Stimulus `end-cycle-v1.json`** (compiler hash `c9e62ddadacc`): reload, 3 s idle, drags of 520 px down the page until
  the end (a runtime loop, cap 20), then 6 cycles at the end: a finger-down drag of 400 px (the page goes up, the toolbar
  expands) and a finger-up drag of 440 px (back to the end, the toolbar collapses). Drags end at rest. On this build docH
  is about 6740 and max scroll about 5964, so every cycle stays in the last-screen band. Planned toolbar steps in the band:
  12 per run.
- **Instrument and filter** (`p144-lib.mjs`, frozen):
  - Frames: the longest recorded segment; a frame is BAND-MOVING when innerHeight is strictly between the run's two
    toolbar states and scrollY >= docH - 2 innerHeight (P-137's last-screen band). n = such frames; a run counts at n >= 8.
  - A Timeline record belongs to a frame when it starts in (t - dt, t].
  - **M1 (primary):** per frame, the summed duration of the Paint records (WebKit nests them in Composite); per run, the
    median over the band-moving frames.
  - **M2 (pre-registered fallback):** the same with the Composite records (the layer flush that contains the paint walk).
    M2 replaces M1 for the whole card only when M1's control (or replication) fails in every hold and M2 replicates with
    its control passing in every hold. Otherwise M2 is reported, never read.
  - Descriptive only: Paint records per frame, painted area (clip quads).
  - Ratio = arm metric / mean metric of the nearest C before and after it in its hold. LOCATES <= 0.30, PARTIAL <= 0.70,
    NONE otherwise (P-133's bands).
- **Order: three holds of 5 steps**, each with its own C pair and its own nob; pic, tit and C2 twice each, in two holds, in
  rotated positions:

  | hold | steps |
  |---|---|
  | E1 | `C:H1 nob:H1 pic:H1 tit:H1 C:H2` |
  | E2 | `C:H3 tit:H2 nob:H2 C2:H1 C:H4` |
  | E3 | `C:H5 C2:H2 pic:H2 nob:H3 C:H6` |

  The driver accepts only these holds with exactly these steps (exit 2 otherwise).
- **Dry run (count-only, after the signature, before any Timeline data).** `dry-p144.mjs`, one shared Simulator slot, no
  Timeline, no timing number: one C run and one nob run with the logger. A run passes when: no abort or error; the
  approach loop ended at the end of the page; 12 cycle strokes; the logger saw >= 8 toolbar steps in the band; the arm's
  probes are right. It times each step (open + gesture). Rule, from the mean step s (estimate = s + 10):
  - estimate x 5 + 30 <= 500 s: plan E above;
  - else estimate x 4 + 30 <= 500 s: plan F, six holds of 4 steps (`C nob X C` / `C X nob C`, X = pic, tit, C2 twice each,
    nob in every hold; `p144-lib.mjs` PLAN4);
  - else: the design fails its budget; no data; back to the ops read and the lead.
  A failing run: DRY FAIL, no Timeline data, the script is revised and the card goes back to the read.
- **Holds.** Normal exclusive holds, `--max-seconds 600 --wait 14400`, one FIFO entry at a time, in order, in the
  background; `SB_BUDGET_S=500`; DEFERRED while a phone block is marked. Hold E1 (the others the same with their steps):

  ```sh
  node tools/lock.mjs run chrome-measure --max-seconds 600 --wait 14400 --owner fix-end-bg -- sh -c \
    'node tools/fix.mjs serve end-bg > out/end-bg/serve-p144.log 2>&1 & S=$!; \
     node tools/wait.mjs serve out/serve-end-bg.json --pid $S --owner fix-end-bg --timeout 60 && \
     SB_BUDGET_S=500 node tools/sim.mjs session --owner fix-end-bg -- \
       node fixes/end-bg/sim/sim-p144.mjs E1 C:H1 nob:H1 pic:H1 tit:H1 C:H2; E=$?; kill $S; exit $E'
  ```

  The driver: served bytes (26); per step the host rule, `sim.mjs open`, `sim.mjs gesture end-cycle-v1.json --timeline
  --inject eb-inject.mjs`; the first-run gate after the first step (C applied, docH0 > 0, n >= 8; else 27); the budget
  stop (dropped steps logged, not scored).
- **Host-load rule** (P-141 rev 1.1's, unchanged): load1 > 200 at a step start exits 28 and the hold is VOID-HOST. Its
  folder moves to `<hold>-void1` (kept, reported, never scored) and the hold re-runs once from an empty folder; a second
  VOID-HOST of one hold stops the card. 200 is the lead's P-141 value, set from P-133's step-start loads on this host, not
  from any P-144 number (there is none). load1 at every step's start and end is logged and reported.
- **Per hold, right after it** (before anything is scored): `check-p144.mjs out/end-bg/simp144 <hold> --json
  fixes/end-bg/sim/p144-check-<hold>.json`. HOLD-FAIL (exit 3) when a run that ran has no Timeline file, an abort, an
  error, an approach loop not ended at the end, cycle strokes != 12, or n < 8: the hold is not scored, no rescue, and the
  remaining holds stop (to the lead). Reported, never failing: n below 12, band toolbar steps, docH, css sha.
- **Stop rules** (P-141 N3's runner): exit 0 -> the check, then the next hold; exit 28 -> the void folder, one re-run; any
  other non-zero (26, 27, 2, 124, a lock or wait timeout) or HOLD-FAIL -> stop the remaining holds, to the lead. A later
  hold runs whatever the earlier holds' values are; nothing is scored before the last hold.
- **Scoring** (after the last hold): `score-p144.mjs out/end-bg/simp144 E1 E2 E3 --json fixes/end-bg/sim/p144-score.json`.
- **Rules** (frozen before data, `p144-lib.mjs` scoreHold / armCall / cardReading):
  1. **NOT REPRODUCED** when any hold's C runs fail the replication gate: every C applied, counted, metric > 0 and Paint in
     at least half its band-moving frames. No arm is judged.
  2. **CONTROL-FAILED per hold:** nob not LOCATES or PARTIAL; that hold's other arms are not read (reported). In every
     hold: the card status is CONTROL-FAILED, which is the "Simulator can't split them" outcome.
  3. **VOID per hold:** |last C - first C| / first C > 0.30; its arms are not read.
  4. **A/A:** any C2 run PARTIAL or LOCATES in a read hold: AA-FAILED; no pic/tit reading (reported only). Each C2
     ratio's distance from 1 is reported as the noise beside the calls.
  5. **GEOMETRY:** an arm whose final docH differs from a neighbouring C's by > 2 px is not judged.
  6. **Calls per arm over its runs** in read holds: LOCATES when both LOCATE or the mean ratio <= 0.30; PARTIAL when the
     mean <= 0.70; NONE otherwise; one valid run: its call, marked "one run".
  7. **Reading** (rules 1-4 passed): pic LOCATES/PARTIAL and tit NONE: **PICTURES** (no `end-titles` topic; PR-025's
     option C is the lever on this instrument). tit LOCATES/PARTIAL and pic NONE: **TITLES** (open `end-titles`; tell the
     lead and the user that C alone is not expected to remove the lag). Both: **BOTH** (open `end-titles` too; both shares
     reported). Neither while nob passes: **JOINT** (only removing both helps, or the split is not additive; to the lead,
     no topic).
  8. A Simulator ratio is never a phone result and never a gain. Descriptive: (1 - pic) + (1 - tit) vs (1 - nob).
- **Predictions** (registered before data; informed by P-137's result and the Chrome census, the only data seen on these
  arms):

  | # | prediction | p |
  |---|---|---|
  | 1 | the dry run passes and picks plan E | 65 % |
  | 2 | all holds pass the n check | 80 % |
  | 3 | C replicates on M1 in every hold | 70 % |
  | 4 | nob LOCATES or PARTIAL on M1 in every hold (no metric switch) | 45 % |
  | 5 | the card ends READ (on M1 or M2) | 50 % |
  | 6 | given READ: pic LOCATES or PARTIAL | 75 % |
  | 7 | given READ: tit LOCATES or PARTIAL | 30 % |
  | 8 | given READ: the reading is PICTURES | 55 % |
  | 9 | both C2 runs NONE | 85 % |
  | 10 | no arm GEOMETRY | 90 % |
  | 11 | every run passes the applied probes | 85 % |
  | 12 | no VOID-HOST hold | 75 % |

  Scoring precedence (P-141 N5 style): rule 1 fails: P3 a miss, P4-P8 insufficient. CONTROL-FAILED card: P4 a miss, P5 a
  miss, P6-P8 insufficient. AA-FAILED: P9 a miss, P6-P8 insufficient. PARTIAL counts as a hit for P6 and P7.
- **Pins** (sha256/12):
  - stimulus `sim/end-cycle-v1.json` `258b9dadae1e` (compiled program `c9e62ddadacc`);
  - inject `sim/eb-inject.mjs` `20b18b4de87a`; rules and filter `sim/p144-lib.mjs` `5cc29ba45734`;
  - driver `sim/sim-p144.mjs` `a86d5b205362`; dry run `sim/dry-p144.mjs` `3ed80224b792`; check `sim/check-p144.mjs`
    `8e44588002ce`; scorer `sim/score-p144.mjs` `f1c45c4e292b`;
  - self-test `sim/p144-selftest.mjs` `c8402de03ae7`: `SELFTEST ok 87 checks` (the stimulus compiles to one approach loop
    and 12 guarded cycle strokes; pic + tit = nob selector for selector, disjoint, paint-only properties; the applied rule
    per arm; both plans: C bracket, nob in every hold, pic/tit/C2 in two holds; the budget and host thresholds; the band
    filter and the per-frame metrics on a synthetic record; every call, gate, reading and the metric switch; the dry-run,
    n-check and first-run gates);
  - arm CSS: `nobg.css` `d566af712894`, `sim/pictures-off.css` `2f316f33d828`, `sim/titles-off.css` `6bc2f3c17007`;
  - served build: JS `1b2eecc66011`, CSS `e1359ab9994a`.
- **Output.** `out/end-bg/simp144/<hold>/` and `out/end-bg/dry144/` (ignored). Committed after the last hold:
  `sim/p144-check-<hold>.json`, `sim/p144-score.json`.

### P-144 addendum rev 1.1 (ops-reader-P144 pre-data read, 15:31Z: PASS with notes N1-N7; before any data)

Text only: no pinned file changes, so the pins above stand. Where this addendum and the card differ, the addendum holds.

- **N1, plan bound to the dry run.** The plan is the one written in `out/end-bg/dry144/dry.json` (`plan`: E or F),
  committed with the results as `sim/p144-dry.json`. Only that plan's full hold set runs and is scored (E1-E3, or F1-F6);
  plans never mix; no counted hold runs before `dry.json` exists with DRY PASS. The score command names exactly that
  plan's holds.
- **N2, dropped steps.** A hold in which the budget stop dropped any step is HOLD-FAIL: not read, the remaining holds
  stop, to the lead (the card's "scored against one C" and "drift n/a" cases no longer arise).
- **N3, precedence cases the card left open:**
  - (a) DRY FAIL or a failed design budget: P1 a miss, P2-P12 insufficient; no data.
  - (b) Plan F picked: P1 a miss; the card continues.
  - (c) The card stops on a HOLD-FAIL (n, or a dropped step per N2) or a second VOID-HOST: the card is INCOMPLETE. P2 is
    a miss for an n failure, P12 a miss for a second VOID-HOST; everything else insufficient; earlier holds are not
    read alone.
  - (d) No hold usable only because of drift (every non-VOID hold failing nothing else): the status is **VOID**, not the
    CONTROL-FAILED that `cardReading` prints. P4 is scored from each hold's own control, P5 a miss, P6-P8 insufficient.
  - (e) Status READ with reading INSUFFICIENT: P5 a miss, P6-P8 insufficient.
- **N4, what informed the card (disclosure).** Before M1 was made primary, M2 the fallback and P4 set at 45 %, I read one
  Simulator Timeline file with the scratch scripts `out/end-bg/sim/tltypes.mjs` and `tlnest.mjs` (about 15:12Z):
  toolbar-resize's P-133 capture `simp133/A1/tl-C-H1.json` (fix-toolbar-resize's worktree; the hero zone, v9-final + 7d,
  no end-bg arm). In that whole run Paint records summed to about 0.28 s against about 13 s of Composite, and every Paint
  record sat inside a Composite. It is not an end-screen capture and not C or nob of this card, but it informed the M1/M2
  choice and P4. F-290 (the Chrome inventory) informed the title probe and tit's selectors.
  `research/image-cost` §0 (Simulator: Paint about 0.25 s against about 8 s of Composite per scroll) says the same; I
  can't rule out having read it before this card (an earlier part of my session is only a summary to me), so it is
  labelled as seen, informing M1/M2 and P4 too.
- **N5, text.** `chooseMetric`'s comment says "every hold that replicates on M1"; the code and the card use every hold.
  The card wins.
- **N6, what tit removes.** tit and nob remove the moving gradient only. The `::after` box, its animation, the span's
  text mask and the organized title's sweep stay in every arm. A tit call is about the titles' gradient paint, not about
  the sweep's layer or animation cost.
- **N7, base.** The branch is rebased on main `598d9efa` (docs only after `d9dabfc7`: the P-144 reservation).

### Result P-144: CONTROL-FAILED on M1 (the Simulator's Paint time does not see nobg's effect); no reading

Owner's read, for the official result read. Dry run (count-only, 2026-10-05, before the holds): DRY PASS, C 69.4 s and
nob 69.1 s per step, mean 69.3 s, plan E (`sim/p144-dry.json`, N1). Holds E1-E3, one normal exclusive hold each,
16:11-16:52Z,
every exit 0, no VOID-HOST, no dropped step, every check HOLD-OK (`sim/p144-check-E1..E3.json`). Score:
`score-p144.mjs out/end-bg/simp144 E1 E2 E3` -> `sim/p144-score.json`.

| hold | run | n | M1 paint ms | M1 ratio, call | M2 composite ms | M2 ratio (not read) |
|---|---|---|---|---|---|---|
| E1 | C-H1 | 100 | 0.638 | | 23.6 | |
| E1 | nob-H1 | 135 | 0.514 | 0.882 NONE | 14.8 | 0.685 |
| E1 | pic-H1 | 137 | 0.406 | 0.696 PARTIAL | 14.2 | 0.657 |
| E1 | tit-H1 | 121 | 0.522 | 0.895 NONE | 18.4 | 0.854 |
| E1 | C-H2 | 114 | 0.528 | | 19.5 | |
| E2 | C-H3 | 116 | 0.545 | | 20.0 | |
| E2 | tit-H2 | 123 | 0.499 | 0.902 NONE | 18.2 | 0.938 |
| E2 | nob-H2 | 129 | 0.484 | 0.874 NONE | 15.2 | 0.785 |
| E2 | C2-H1 | 124 | 0.560 | 1.012 NONE | 19.0 | 0.982 |
| E2 | C-H4 | 118 | 0.562 | | 18.7 | |
| E3 | C-H5 | 114 | 0.562 | | 19.1 | |
| E3 | C2-H2 | 111 | 0.544 | 0.957 NONE | 19.5 | 1.010 |
| E3 | pic-H2 | 134 | 0.523 | 0.920 NONE | 15.7 | 0.814 |
| E3 | nob-H3 | 133 | 0.489 | 0.860 NONE | 14.8 | 0.768 |
| E3 | C-H6 | 117 | 0.575 | | 19.4 | |

- **Rules.** Rule 1: C replicates in every hold on M1 (drift 0.172 / 0.031 / 0.023, no VOID). Rule 2: nob is NONE on M1
  in every hold (0.882 / 0.874 / 0.860), so every hold is CONTROL-FAILED and the card status is **CONTROL-FAILED**. The
  metric switch does not apply: on M2 the control passes in E1 only (0.685; E2 0.785, E3 0.768), so M2 stays reported,
  not read. No pic/tit call, no reading; `end-titles` is not opened by this card.
- **What it means (the card's pre-named outcome):** the Simulator's WebKit Timeline cannot split pictures from titles on
  this instrument; the question goes to the phone Timeline ticket (G, xcode-serious) as the lead ruled.
- **Descriptive only, decides nothing:** nob's M1 effect is small (about -13 %) next to P-137's phone effect. On M2
  (Composite, the flush that holds the paint walk) every nob and pic run is lower than its C neighbours (0.66-0.81) and
  the tit runs less so (0.85, 0.94); C2 stays at 0.98-1.01. These are unread numbers under the card's rules, not a
  split; they may inform the phone ticket's design (disclosed if they do). Paint records per frame 12-13, painted area
  about 0.83-0.96 million px per frame in every arm. Every run passed the applied probes; docH 6814 -> 6850 in all.
- **Host:** load1 at step starts 7.7-106.4 (all below 200); the Simulator's background was settled at session start.
- **Predictions** (scored with N3's precedence: a CONTROL-FAILED card makes P4 and P5 misses and P6-P8 insufficient):
  P1 hit (DRY PASS, plan E). P2 hit (all holds pass the n check, n 100-137). P3 hit (C replicates on M1). P4 miss.
  P5 miss. P6-P8 insufficient. P9 hit (C2 NONE in both runs: 1.012, 0.957). P10 hit (no GEOMETRY). P11 hit (every run
  applied). P12 hit (no VOID-HOST). 7 hits, 2 misses, 3 insufficient.
- **Official read and lead ruling.** ops-reader-P144r (2026-10-05 17:00Z): CONFIRMED with notes N1-N4 (pins, dry run
  before E1, check and score re-run deep-equal, M2 switch applied correctly). Lead ruling on N1: P9 is **insufficient**,
  not a hit (no hold was read, so the per-run C2 calls score nothing). Final tally: **6 hits, 2 misses, 4
  insufficient.** N2: P4 and P5 are two misses on one model (the Simulator's Paint time should see nobg); it did not.
- **Mechanism note (OBSERVED in our setup, cause unknown):** WebKit Timeline Paint records on the WebContent side sum to
  about 0.5 ms per band frame in every arm; the frame's Composite is about 15-24 ms. The pre-named risk (picture raster
  outside the main thread's recorded Paint) fits this, but nothing here confirms it.

### Prediction P-145: pictures vs title sweeps on the iPhone (G driver, Timeline, xcode-serious; DRAFT for the pre-data read)

Pre-staged on the lead's ruling after P-144 (2026-10-05). It runs after the user reconnects and v9.2's phone block has run.
It needs the ops pre-data read and the lead's signature before any data.

**Why a phone card.** P-144 is CONTROL-FAILED. The Simulator's WebContent Paint time did not see nobg's effect: nob's
ratio was 0.86-0.88 (NONE) in every hold, while P-137 showed CAUSE on the phone. P4 and P5 were two misses on one model,
that Simulator Paint time tracks the phone's end-screen cost (N2). That model failed, and this card does not reuse it. It
reads the phone's own slow frames with P-137's metric and rule, the read that already found CAUSE for nobg on this device.

**Question.** On the iPhone, in the last screen after the finger lifts: do the slow frames P-137 removed with nobg come
from the background pictures, from the gradient title sweeps, or from both?

**Arms.** Same base and immutable snapshots, paint only. Arms and files were fixed before P-144's data:

| arm | build | JS | CSS | snapshot |
|---|---|---|---|---|
| C | v9-final + morph-scroll 7d (P-137's C) | 1b2eecc66011 | e1359ab9994a | `out/snapshots/endbg-C-e1359ab9994a` |
| P | C + `sim/pictures-off.css` (2f316f33d828) | 1b2eecc66011 | a9fd8338d8ed | `out/snapshots/endbg-P-a9fd8338d8ed` |
| T | C + `sim/titles-off.css` (6bc2f3c17007) | 1b2eecc66011 | 8f4d806323a9 | `out/snapshots/endbg-T-8f4d806323a9` |

The snapshots are read-only in fix-end-bg's worktree. P and T are plain concatenations, built like P-137's V. P + T
covers what nobg removes, except the organized title, which is in no arm (F-290; the mask and animation stay in every
arm, §7).

**Driver, profile, procedure.** As P-137 (§3):
- driver G, `fixes/morph-scroll/g-fastshort-v1.json` (df597802d2f0), compiled program 8737f212c0ff, GESTURE_BUDGET_S
  about 229, E procedure;
- profile xcode-serious: `thermal-gate.mjs --expect serious --max-c 44 --accept-induced` on server B, at each phone
  hold's edges; no heat pre-warm and no cooling wait (CLAUDE.md "Sentinel");
- plain http, `--vendors=local --latency 150`.

**Block** (CLAUDE.md "Phone blocks", "Timeline blocks"). Items, in order:
- one uncounted warm-up per arm's port (WC, WP, WT, Timeline off, `--warmup`);
- an uncounted Timeline-OFF sentinel S0 on C after the warm-ups;
- 9 counted runs, Timeline on in every arm, in a rotated Latin square: EC1 EP1 ET1 | EP2 ET2 EC2 | ET3 EC3 EP3. This is
  the 3-arm form of C V V C. A Timeline-on C run does not replace S0: the card keeps both sentinels;
- at most 2 re-runs of counted runs that fail a run gate, then the Timeline-OFF end sentinel S1 on C;
- no attribution runs.

The sentinel rule and the run gates G1-G6 are the signed P-129 reader rev 1.1's, as in P-137. A failing S0 voids the block
before any counted run; a failing S1 voids every counted run. 14-16 fs runs in 600 s `--no-timing` holds of at most 2
runs, inside two `lock.mjs run iphone --block P-145` holds:

```
part 1: H1 WC,WP | H2 WT,S0 | H3 EC1,EP1 | H4 ET1,EP2 | H5 ET2,EC2      part 2: H6 ET3,EC3 | H7 EP3 | H8 TAIL (re-runs, then S1)
```

Before every item the served JS and CSS of all three arms are hashed; a mismatch voids the hold.

**Metric and decision: P-137's, unchanged** (`p137-read.mjs` `metric` and `verdict`, imported by `p145-read.mjs`).
- Per counted run: moving lastScreen frames after a touchend, s(th) for th 30/34/38/46/50/54.
- Per arm X in {P, T} against C at >34, with at least 3 valid runs per arm:
  - CAUSE: max X < min C and median X ≤ 0.5 × median C;
  - CONTRIBUTES: max X < min C, otherwise;
  - WORSE: min X > max C;
  - NOT SHOWN: anything else;
  - THIN: fewer than 3 valid runs.
- The denominator guard (15 %) and the twins (>30, >38: "threshold-sensitive") apply per pair. >50 is reported and decides
  nothing.
- An arm **carries** when its verdict is CAUSE or CONTRIBUTES. Readings:
  - PICTURES: P carries, T does not;
  - TITLES: T carries, P does not;
  - BOTH: both carry;
  - NEITHER: neither carries;
  - THIN: an arm is THIN;
  - VOID: a sentinel failed.
- With 3 runs per arm, separation needs all 3 X runs below all 3 C runs. That is weaker than P-137's 4 v 4. Readers should
  weigh a CONTRIBUTES accordingly; the rule does not change.
- Descriptive, decides nothing:
  - the class split (busy) and the toolbar-step share;
  - per counted run, from its Timeline, the median summed Paint and Composite ms over its metric frames (`tlCost`).

**Disclosure (P-144 N4).** P-144's M2 (Composite) ratios were never read: pic 0.66/0.81, tit 0.85/0.94, nob 0.69-0.79,
C2 0.98-1.01. They did not shape the arms or the rule; both were fixed before that data. They did shape the predictions
below: they move weight towards pictures. Under P-144's rules they remain OBSERVED, unread numbers.

**Predictions (before data).**

| # | prediction | p |
|---|---|---|
| 1 | P vs C at >34: CAUSE | 0.20 |
| 1 | CONTRIBUTES | 0.35 |
| 1 | NOT SHOWN | 0.42 |
| 1 | WORSE | 0.03 |
| 2 | T vs C at >34: CAUSE | 0.05 |
| 2 | CONTRIBUTES | 0.20 |
| 2 | NOT SHOWN | 0.72 |
| 2 | WORSE | 0.03 |
| 3 | reading: PICTURES | 0.36 |
| 3 | TITLES | 0.08 |
| 3 | BOTH | 0.14 |
| 3 | NEITHER | 0.32 |
| 3 | THIN or VOID | 0.10 |
| 4 | both sentinels PASS and every hold VALID without a second block | 0.80 |
| 5 | C's median >34 lies within P-137's C range (14-30) | 0.75 |
| 6 | both pairs decide on counts (no denominator guard) | 0.70 |

Why:
- The pictures cover far more painted area in the last screen than the three title sweeps (§1, §7).
- P-144's unread Composite numbers point the same way (disclosed above).
- NEITHER stays likely. P-137's effect could need both parts at once (joint, not additive): each half alone would then
  leave C's slow frames in place. This card cannot tell joint from absent, and a NEITHER reading says so.

**Falsification.**
- PICTURES: the image work in PR-025 is the end-screen lever.
- TITLES: the sweep animation gets its own fix card (`end-titles`).
- BOTH: both levers are needed.
- NEITHER after P-137's CAUSE: the effect is joint, or it sits in what only nobg removes (the organized title, grain
  layers counted with the pictures). A follow-up needs the lead's decision. No second block of this question without one
  (sequential rule, at most 2 blocks).

**Kit and pins** (runner: iphone-runner; scripts adapted from P-137's, which were read and run once).

| file | pin |
|---|---|
| `phone/p145-serve.sh` | 3caf4f02b3f3 |
| `phone/p145-hold.sh` | 9e002d44b9a6 |
| `phone/p145-block.sh` | 794c347a6110 |
| `phone/p145-read.mjs` | 8882725a5f23 (self-test 11 ok) |
| `phone/p137-read.mjs` | b6d24ad5e73c |
| `research/serious-heat/p129-read.mjs` | 06f74f5d19ca |
| `research/serious-heat/phone/p129-gates.mjs` | a06847c64a2e |

```sh
sh fixes/end-bg/phone/p145-serve.sh start            # copies + checks the 3 snapshots, starts C, P, T, B (plain http)
TICKET=P-145 P145_DRY=1 sh fixes/end-bg/phone/p145-block.sh H1:WC,WP H2:WT,S0 H3:EC1,EP1 H4:ET1,EP2 H5:ET2,EC2 H6:ET3,EC3 H7:EP3 H8:TAIL
TICKET=P-145 node tools/lock.mjs run iphone --owner iphone-runner --block P-145 --max-seconds 3600 -- \
  sh fixes/end-bg/phone/p145-block.sh H1:WC,WP H2:WT,S0 H3:EC1,EP1 H4:ET1,EP2 H5:ET2,EC2
TICKET=P-145 node tools/lock.mjs run iphone --owner iphone-runner --block P-145 --max-seconds 3600 -- \
  sh fixes/end-bg/phone/p145-block.sh H6:ET3,EC3 H7:EP3 H8:TAIL
node fixes/end-bg/phone/p145-read.mjs out/p145/runs --json out/p145/p145-read.json
sh fixes/end-bg/phone/p145-serve.sh stop
```

Status of the kit:
- Shell syntax was checked.
- The dry run needs the servers up, so it is the runner's first step after the signature (servers and dry run need no
  phone).
- Part 1 is 10 fs runs in 5 holds: about 2300 s of runs plus 2 gates, inside 3600 s.

## 9. Pending

- PR-025: the user's pick, then the phone test of slow frames.
- P-145 (draft above): pre-data read and the lead's signature, then the runner's block after v9.2's.
- The verdict per image and the ranked candidate fixes, after P-137. Wall candidates known now (bytes or memory, no
  frame effect expected): skip columns 4-5 below 640 px (pixel-identical, -2.1 MB fetched); resize graphic-designer.png,
  the only visible oversized wall image (1.22x, -2.2 MB decoded; pixel check needed); trimming the never-seen last
  items is height-dependent (not identical above H 791): proposal at most.
- Method note for other topics: `research/element-ablation/README.md`.
- How the hero-card fixes worked (re-keep-op: the revealed people card kept in its own layer at rest, so the end-of-reveal
  re-layouts went away; hero-exit-threaded: the hero exit moved to a scroll-driven animation off the main thread): both are
  layer/compositor changes; whether one fits the last screen depends on what P-137 and the census show.
