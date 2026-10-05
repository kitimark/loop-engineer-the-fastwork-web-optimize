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

## 8. Pending

- A Simulator count (WebKit) when no phone block runs.
- The verdict per image and the ranked candidate fixes, after P-137. Wall candidates known now (bytes or memory, no
  frame effect expected): skip columns 4-5 below 640 px (pixel-identical, -2.1 MB fetched); resize graphic-designer.png,
  the only visible oversized wall image (1.22x, -2.2 MB decoded; pixel check needed); trimming the never-seen last
  items is height-dependent (not identical above H 791): proposal at most.
- Method note for other topics: `research/element-ablation/README.md`.
- How the hero-card fixes worked (re-keep-op: the revealed people card kept in its own layer at rest, so the end-of-reveal
  re-layouts went away; hero-exit-threaded: the hero exit moved to a scroll-driven animation off the main thread): both are
  layer/compositor changes; whether one fits the last screen depends on what P-137 and the census show.
