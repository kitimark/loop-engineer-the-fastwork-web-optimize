# Research: end-bg (end-of-page background images, user T-193 #10)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). The test overlays contain excerpts of Fastwork's code: they stay local and are never committed.

**Status:** research (no fix). **Stage:** R → I (attribution). **Owner:** fix-end-bg.
**Question (user T-193 #10/#12):** do the background images in the last screen cause the end-of-page lag, and would an
"optimize it like the hero card" treatment help?
**Driver(s):** Chrome probes (counts only, shared lane), phone G (`iphone.mjs gesture`) for the P-137 block.
**Prediction:** `fixes/PREDICTIONS.md` P-137 (card below; registration pending the ops pre-data read).
**Base:** C = v9-final + morph-scroll rev 7d (`fix.mjs apply --from morph-scroll-v9try`), JS 1b2eecc66011, CSS e1359ab9994a.

## 1. What is in the last screen (Chrome inventory, OBSERVED)

Probe: `fixes/end-bg/endbg-chrome.mjs --mode inv` (430x775 and 430x815, DPR 3, touch, hover:none/pointer:coarse,
positions pre / m0 / mhalf / m1 of the 7d menu morph), summary `fixes/end-bg/inv-summary.mjs`. Raw file
`out/end-bg/inv-2026-10-05T11-23-24-796Z.json` (local). Geometry at 775: runway t = 775 px, max scroll 5964, #platform
430x1881 sticky (top `calc(100dvh - var(--fw-ms-h))`), menu panel 52 → 402 → 751 px tall from m0 to m1 (791 at 815).

| what (selector) | source | intrinsic | shown at | bytes | decoded (w·h·4) | sizing |
|---|---|---|---|---|---|---|
| menu photo wall (`.start-selling-morph-col img`, CSS l.10973-11021, will-change transform, 16 s drift) | roles/*.png x5 | 1282x1282 | ~138 px wide columns | 325-440 KB each | 6.6 MB each, ~33 MB | %, column flow |
| same wall | post-*, portfolio-*, cover-cafe, work-*, service-* (15 more) | 341x512 to 960x540 | same | 86-402 KB | 0.7-2.1 MB each | same |
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
## 5. Pending

- A Simulator count (WebKit) when no phone block runs.
- The verdict per image and the ranked candidate fixes, after P-137.
- How the hero-card fixes worked (re-keep-op: the revealed people card kept in its own layer at rest, so the end-of-reveal
  re-layouts went away; hero-exit-threaded: the hero exit moved to a scroll-driven animation off the main thread): both are
  layer/compositor changes; whether one fits the last screen depends on what P-137 and the census show.
