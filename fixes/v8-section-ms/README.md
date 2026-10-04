# v8-section-ms: Chrome rendering time per page section, v7 vs v8 (vs baseline)

**Question (user T-151, C-048 note):** "I'd like to know about rendering time each element at v8 page." An earlier
helper gave per-section *counts* (paints, restyled elements), with no milliseconds. This measures **Chrome main-thread
milliseconds per page section**, split into script / style / layout / paint (+ other main-thread work, nav JS, hit
test, compositor thread), for v7 and v8 and the baseline. All numbers below are **OBSERVED** (our Chrome data only, in
our setup). Where the v7 and v8 ranges overlap, there is **no difference** between them.

Owner: de-v8-section-ms. Branch: see the final report. Measurement only: no Fastwork code changed, no tooling changed.

## Builds

| arm | build | node JS sha256 | CSS sha256 | served from |
|---|---|---|---|---|
| A | v7 (fixes/v7-best) | 8c90da217745 | 308f0da70c3a | `out/sec/snap/A` (copy of int-v8's `out/v8-best/snap/A`, hashes checked at copy and at every serve) |
| V | v8 (fixes/v8-best) | 3e3e94cb6e9f | f836404b3728 | `out/sec/snap/V` (copy of int-v8's `out/v8-best/snap/V`, same checks) |
| B | baseline b1789284481295-4ad4a84a | 4606120cf392 | 27776f3d4138 | the pinned snapshot, no overlay |

## Method

`probe.mjs` (this folder), run inside `chrome-measure` holds (`lock.mjs run`, normal exclusive hold, `caffeinate -i -s`
inside the hold only). Calibrated setting: Chrome 154 headed, 430x932 DPR 3 with touch, CPU 6x; each arm served by its
own `serve.mjs --vendors=local --https --latency 150 --no-http-twin` started by the probe and checked by hash; one Chrome,
a fresh isolated context per page; arms alternate per run (A V B, then B V A). One page per arm and run:

1. load + 2 s network-quiet settle + 1.5 s (as `verify.mjs`), read the section geometry (`getBoundingClientRect` of
   every top-level `<section>` plus `#people`, `#profile-showcase`, `section.feed`, `section.pain`,
   `section.commission`, `#platform`; same in all three builds, page height 6277 px), then CPU 6x, 1 s;
2. **rest "hero"** at y 0 for 6 s (this takes the place of verify's 6 s idle phase);
3. **scroll phase**: `verify.mjs`'s own scroll (`scrollBy({top: 250, behavior: 'smooth'})` every 300 ms to the bottom;
   27-28 steps, 8.4 s in every run and build), with the rAF frame log of `verify --frame-log` (`[t, dt, scrollY]`);
4. **rest windows**, 6 s each after an instant jump and 2 s settle: page end (y 5345), commission (y 3193), pain
   (y 1329), profile showcase (y 1248), people (y 933). Note people / profile showcase / pain are only 400 px apart:
   the viewport shows nearly the same content in those three.

Each phase is one devtools.timeline trace (the categories of `verify --trace-frames`) plus a V8 JS CPU profile
(200 µs sampling). Attribution:
- **Buckets:** every instant of the renderer main thread goes to exactly one bucket by self time, with
  `tools/lib/trace-frames.mjs` `selfSegments` + `kindOf` (the buckets of `verify --trace-frames`): script (JS, GC,
  timers, rAF and event callbacks), style (UpdateLayoutTree), layout, paint (PrePaint, Paint, Layerize, UpdateLayer,
  Commit, image decode), other main (task bookkeeping `ThreadControllerImpl::RunTask` self time, IntersectionObserver
  computeIntersections, HitTest, ...). A forced style/layout inside JS counts as style/layout.
  "of it layerize/commit" is the part of paint that is Layerize / UpdateLayer(Tree) / CompositeLayers / Commit.
- **Sections (scroll):** an instant belongs to the section under the viewport's **centre line** at that moment
  (scrollY from the frame log, the latest frame at or before the instant), innermost landmark wins (people starts
  inside the hero track at y 933; profile showcase and feed lie inside the people / pain ranges); "ms per scroll" is
  the total while that section was under the centre line during one top-to-bottom scroll. The scroll is timer-driven
  and took the same 8.4 s in every build, so the wall time per section is the same across builds (table "wall").
- **nav JS:** profile samples with a frame of the top-nav component (`header.start-selling-top-nav`, the function
  after its template: v7 lines 13628-14129, v8 13763-14270, baseline 12884-13251) anywhere on the stack: its scroll callback,
  its hit test (`elementsFromPoint`) and the style/layout it forces, sampled. It overlaps the buckets (it is a
  "which code" view, not a fifth bucket). **hit test**: HitTest trace events (part of "other").
- **compositor thread:** busy time (union of its trace events) of the renderer's Compositor thread. Raster and GPU
  work are not in these traces (Chrome rasterizes in the GPU process here; no GPU categories traced), so there is
  no raster column.
- Clocks: trace µs = page ms x 1000 + offset from a `performance.mark` at the start of each phase; profile samples
  share the trace clock (check: 100 % of JS sample time falls inside main-thread trace events in every phase).

## Results

**n = 2 runs per arm (one hold, see Caveats).** Every range below is the min-max of 2 runs; "lower"/"higher" (no range
overlap) at n = 2 is a weak signal, not a verdict. All numbers OBSERVED (Chrome 154, CPU 6x, traced), in our setup.

Key points (OBSERVED):
- **Whole scroll, main thread:** v7 8554 ms (8497-8610), v8 8198 ms (8025-8370), baseline 8613 ms (8401-8825) for one
  8.4 s top-to-bottom scroll. v8 draws more frames (745 vs v7 694, baseline 527), so per frame: v7 12.4 ms, v8 11.0 ms,
  baseline 16.5 ms.
- **Where the time goes in v7/v8:** paint is the largest bucket (v8 3158 ms), most of it Layerize/Commit (v8 1938 ms);
  then "other main" (2414 ms: task bookkeeping, IntersectionObserver, hit test), script (1337 ms), style (1119 ms),
  layout (171 ms). The baseline spends twice the style time (2256 ms) and less on paint (2714 ms).
- **Most expensive sections (main ms per scroll, v7 / v8 / baseline):** platform 3425 / 3103 / 3437, pain
  1918 / 1882 / 1886, commission 1404 / 1403 / 1485, hero 858 / 839 / 803, people 495 / 507 / 461, feed 422 / 434 / 484,
  profile showcase 33 / 31 / 57. These totals follow how long each section sits under the viewport centre (wall times
  below the tables), so "main ms / frame" is the fairer per-section cost.
- **v8 vs v7:** the gain sits in the platform section (main 3103 vs 3425 ms; script, style, layout and paint all lower);
  the other sections overlap or differ by a few ms. Hit test is higher in v8 (whole page 522 vs 457 ms).
- **Top nav:** samples with the nav component on the stack: v7 1005 ms, v8 1014 ms, baseline 1308 ms per scroll
  (about 12 % of main in v7/v8, 15 % in the baseline).
- **At rest:** at hero / people / pain the main thread is busy 850-980 ms of every second at 6x in all builds, mostly
  paint (Layerize/Commit alone 420-470 ms/s in v7/v8). Commission: v7 396, v8 355, baseline 904 ms/s (v7/v8 overlap).
  Page end: v7 694, v8 610, baseline 785 ms/s.

Scroll, per section (ms per one top-to-bottom scroll; median (min-max) over 2 runs; v7 / v8 / baseline)

| where | build | script | style | layout | paint | of it layerize/commit | other main | main total | nav JS (profile) | hit test | compositor thread | frames | main ms / frame | v8 vs v7 (no range overlap) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hero | v7 | 110.2 (105.5-114.8) | 208.7 (203.9-213.4) | 1.3 (1-1.6) | 345.4 (338.9-351.8) | 253.5 (253.2-253.7) | 192.4 (186.1-198.7) | 857.9 (836-879.7) | 54.4 (54.4-54.4) | 25.5 (23.5-27.4) | 59.9 (55.2-64.6) | 63.5 (61-66) | 13.5 (12.7-14.4) |  |
|  | v8 | 100.7 (98.6-102.7) | 214.3 (206.2-222.4) | 2.8 (2.6-3) | 340.8 (332.1-349.5) | 253 (241.2-264.8) | 180.1 (171.7-188.4) | 838.6 (832-845.2) | 56.4 (51.8-61) | 26.8 (26.5-27) | 57.2 (55.6-58.7) | 65.5 (65-66) | 12.8 (12.8-12.8) | script lower, layout higher |
|  | baseline | 151.6 (131.6-171.6) | 248.4 (246-250.8) | 59.3 (40.2-78.4) | 229.7 (225.4-234) | 129.6 (126.9-132.3) | 113.7 (108.8-118.6) | 802.7 (752-853.4) | 85.4 (83.3-87.6) | 10.7 (8.8-12.6) | 50.4 (49.6-51.2) | 62 (60-64) | 13 (11.8-14.2) |  |
| people (avatar rows) | v7 | 72.7 (68-77.4) | 163.6 (159.7-167.6) | 3.3 (3-3.5) | 148.7 (141.8-155.5) | 101.3 (98.3-104.2) | 106.6 (103.5-109.6) | 494.8 (491.5-498.1) | 57.4 (54.3-60.5) | 22.5 (20.9-24) | 36.4 (34.7-38) | 21.5 (21-22) | 23 (22.3-23.7) |  |
|  | v8 | 70.5 (52.6-88.4) | 166.9 (165.1-168.6) | 6.1 (3.4-8.7) | 161.8 (155.7-167.9) | 104.5 (103.2-105.7) | 101.4 (93.6-109.3) | 506.7 (491.4-521.9) | 58.4 (56.6-60.2) | 23.6 (22.4-24.8) | 36.4 (35.8-37) | 23.5 (23-24) | 21.6 (20.5-22.7) | paint higher |
|  | baseline | 73.7 (71.8-75.6) | 193.1 (180.5-205.7) | 11.3 (3.9-18.7) | 112.7 (105.6-119.8) | 56.9 (54.3-59.5) | 70.3 (66.3-74.2) | 461.1 (457.1-465) | 81.1 (76.2-86) | 10.9 (10.7-11) | 27.9 (27.3-28.4) | 21.5 (21-22) | 21.5 (21.1-21.8) |  |
| profile showcase | v7 | 5.9 (5.1-6.8) | 10.1 (6.9-13.3) | 2 (1.9-2) | 7.7 (5.7-9.6) | 4.1 (1.5-6.7) | 6.9 (4.5-9.3) | 32.6 (32.3-32.8) | 2.6 (2.5-2.7) | 1.7 (1.5-1.8) | 2.8 (2.6-2.9) | 1 (1-1) | 32.6 (32.3-32.8) |  |
|  | v8 | 6.1 (5.8-6.4) | 8.5 (8.1-8.9) | 1.3 (0.7-1.9) | 10.1 (7.5-12.7) | 6.1 (3.7-8.5) | 4.8 (3.1-6.5) | 30.8 (27-34.6) | 3 (2.5-3.5) | 1.7 (1.4-1.9) | 2.3 (2-2.6) | 1 (1-1) | 30.8 (27-34.6) | all overlap |
|  | baseline | 12.1 (10.6-13.6) | 21.8 (21.1-22.4) | 1 (0.2-1.7) | 16 (15.8-16.1) | 8.6 (8.3-8.9) | 6.3 (4.6-7.9) | 57 (56.6-57.4) | 9.3 (8.9-9.6) | 0.8 (0.2-1.4) | 4.6 (4.5-4.7) | 2 (2-2) | 28.5 (28.3-28.7) |  |
| pain | v7 | 298.5 (295.8-301.2) | 191.8 (179.8-203.7) | 18.9 (17.8-20) | 826.1 (781.6-870.5) | 553.8 (523.4-584.2) | 582.5 (560-605) | 1917.7 (1887.6-1947.8) | 284.8 (280.7-288.9) | 135.5 (133.6-137.4) | 146.1 (142.9-149.3) | 122 (111-133) | 15.8 (14.6-17) |  |
|  | v8 | 271.2 (267.4-274.9) | 180.2 (172-188.3) | 22.3 (19.3-25.3) | 830.5 (806.7-854.2) | 572.5 (539.8-605.2) | 578.3 (573.9-582.8) | 1882.4 (1872-1892.8) | 295.4 (283.1-307.7) | 150.5 (140.3-160.7) | 138.8 (136.5-141) | 129.5 (120-139) | 14.6 (13.6-15.6) | script lower, hitTest higher, compositor lower |
|  | baseline | 301.9 (297.9-305.9) | 560.6 (554.4-566.7) | 112.9 (107.3-118.5) | 564 (552.2-575.8) | 304.6 (302.3-306.8) | 346.4 (343.1-349.6) | 1885.7 (1875.2-1896.2) | 332.5 (320.3-344.6) | 51.7 (51.2-52.2) | 122.3 (117.7-126.8) | 77 (76-78) | 24.5 (24-25) |  |
| profile feed | v7 | 68.8 (67.9-69.7) | 45.9 (44.3-47.5) | 3.1 (3.1-3.1) | 177 (164.7-189.2) | 118 (108.3-127.6) | 127.3 (116.5-138) | 422 (419.8-424.2) | 75 (74.2-75.8) | 28.8 (27.9-29.7) | 34.7 (33.2-36.1) | 25.5 (24-27) | 16.6 (15.7-17.5) |  |
|  | v8 | 63.7 (60.6-66.7) | 50.1 (49.4-50.8) | 3.2 (2.4-3.9) | 184.5 (183.5-185.5) | 122.1 (114.8-129.4) | 132.4 (127.7-137) | 433.8 (423.6-443.9) | 72.8 (65.7-79.9) | 33.7 (30.2-37.2) | 34.6 (33.3-35.8) | 28.5 (27-30) | 15.3 (14.1-16.4) | script lower, style higher, hitTest higher |
|  | baseline | 123.9 (116.3-131.4) | 126.3 (112.7-139.9) | 15.1 (14.8-15.4) | 136.8 (131.8-141.8) | 71.5 (69-73.9) | 81.9 (77.3-86.6) | 484 (477.9-490.1) | 105.5 (103.3-107.6) | 9.6 (8.2-11) | 32.8 (31.1-34.4) | 24 (21-27) | 20.5 (18.2-22.8) |  |
| commission | v7 | 257 (246-267.9) | 143.9 (140-147.7) | 32.3 (31-33.5) | 436.5 (421.9-451) | 252.2 (252.2-252.2) | 534.4 (531.2-537.5) | 1403.9 (1372.6-1435.1) | 235.2 (232.6-237.8) | 125 (114.8-135.2) | 88.4 (83.6-93.3) | 131 (123-139) | 10.8 (9.9-11.7) |  |
|  | v8 | 262 (251.8-272.1) | 144.7 (137.5-151.8) | 30.3 (30.1-30.4) | 436.3 (426.4-446.2) | 252.8 (245.1-260.5) | 529.7 (511.5-547.8) | 1402.8 (1357.6-1448) | 242.7 (236.7-248.6) | 134.9 (131.4-138.3) | 87.9 (85.3-90.5) | 139 (132-146) | 10.1 (9.3-11) | layout lower |
|  | baseline | 271.1 (256-286.1) | 445.3 (423.6-467) | 35.5 (34.2-36.8) | 411.5 (411.3-411.6) | 214.8 (211.5-218.1) | 321.7 (321-322.3) | 1485 (1478.8-1491.1) | 247.6 (246.5-248.6) | 35.8 (33.8-37.9) | 76.4 (74.5-78.2) | 62 (58-66) | 24.1 (22.4-25.7) |  |
| platform | v7 | 654.4 (646.5-662.3) | 393.8 (387.5-400.1) | 161.5 (154.3-168.6) | 1351.2 (1349.5-1352.9) | 762.1 (756.8-767.3) | 863.9 (850.9-876.9) | 3424.8 (3392.1-3457.4) | 295.5 (294.6-296.3) | 117.9 (112.1-123.7) | 309.8 (298-321.5) | 329 (312-346) | 10.4 (9.8-11.1) |  |
|  | v8 | 562.8 (517.2-608.4) | 354.3 (330.5-378) | 104.9 (65.1-144.7) | 1193.8 (1054.1-1333.4) | 626.5 (508.6-744.4) | 887.1 (873.7-900.5) | 3102.8 (2867.4-3338.2) | 285.2 (280.1-290.3) | 150.6 (129.2-172.1) | 309.4 (308.5-310.2) | 357.5 (346-369) | 8.7 (7.8-9.6) | script lower, style lower, layout lower, paint lower, main lower, layer lower, hitTest higher, navJs lower |
|  | baseline | 715 (689.3-740.7) | 660.1 (650.3-669.8) | 122.8 (62.2-183.4) | 1243.7 (1207.2-1280.2) | 659.6 (640.3-678.8) | 695.8 (673.4-718.1) | 3437.3 (3282.4-3592.2) | 447.2 (432.5-461.8) | 81.5 (76.5-86.4) | 252.8 (244.4-261.2) | 278.5 (242-315) | 12.6 (10.4-14.8) |  |
| whole page | v7 | 1467.4 (1444.2-1490.7) | 1157.7 (1149.2-1166.2) | 222.2 (215.2-229.2) | 3292.3 (3259.8-3324.8) | 2044.8 (2000.1-2089.5) | 2413.9 (2363.6-2464.1) | 8553.5 (8497-8610) | 1004.9 (998.5-1011.2) | 456.8 (451.6-461.9) | 678 (650.2-705.7) | 693.5 (653-734) | 12.4 (11.6-13.2) |  |
|  | v8 | 1336.8 (1324.3-1349.3) | 1118.8 (1117-1120.6) | 170.8 (126.7-214.8) | 3157.7 (3005.2-3310.2) | 1937.5 (1795.4-2079.5) | 2413.8 (2375.3-2452.2) | 8197.8 (8025.4-8370.2) | 1013.9 (991.7-1036) | 521.7 (508.8-534.6) | 666.4 (665.2-667.6) | 744.5 (738-751) | 11 (10.9-11.1) | script lower, style lower, layout lower, main lower, hitTest higher |
|  | baseline | 1649.2 (1611.6-1686.8) | 2255.5 (2228.1-2282.8) | 357.9 (281.7-434) | 2714.3 (2673.8-2754.8) | 1445.4 (1429.3-1461.6) | 1635.9 (1605.7-1666.1) | 8612.7 (8400.9-8824.5) | 1308.4 (1279.6-1337.2) | 201 (193.5-208.4) | 567 (550.9-583.1) | 527 (480-574) | 16.5 (14.6-18.4) |  |

Rest windows (ms per second at rest; median (min-max) over 2 runs; v7 / v8 / baseline)

| where | build | script | style | layout | paint | of it layerize/commit | other main | main total | nav JS (profile) | hit test | compositor thread | v8 vs v7 (no range overlap) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hero (y 0) | v7 | 55.8 (47.3-64.3) | 71.4 (68.4-74.4) | 0.9 (0.9-1) | 523.4 (504.6-542.3) | 419.4 (408.4-430.4) | 247.1 (223.1-271) | 898.6 (844.4-952.9) | 0 (0-0) | 0.3 (0.3-0.3) | 70.5 (67.1-74) |  |
|  | v8 | 44.3 (43.9-44.6) | 66.9 (61.9-72) | 0.9 (0.8-1) | 517.4 (503.1-531.7) | 416.7 (404.6-428.8) | 215.2 (201.2-229.2) | 844.7 (811.6-877.8) | 0 (0-0) | 0.6 (0.3-0.9) | 68.3 (65.5-71.1) | script lower |
|  | baseline | 66.3 (46.8-85.8) | 74.4 (65.9-82.8) | 32.4 (32.1-32.6) | 349 (316.8-381.2) | 245.6 (225.4-265.9) | 141.6 (112.6-170.6) | 663.6 (574.3-753) | 0 (0-0) | 0.3 (0.1-0.6) | 61.3 (56.2-66.3) |  |
| people (y 933) | v7 | 49.2 (45.7-52.6) | 75.7 (70.3-81) | 3.1 (2.7-3.5) | 574.6 (555.8-593.3) | 456.8 (442.1-471.4) | 217.9 (204-231.8) | 920.5 (886.3-954.6) | 0 (0-0) | 0.9 (0.7-1) | 53 (51.8-54.2) |  |
|  | v8 | 43.5 (43.1-43.9) | 68 (64.9-71.2) | 2.7 (2.2-3.2) | 556.4 (542.1-570.7) | 445.6 (435.2-455.9) | 193.3 (184.5-202) | 863.9 (836.7-891) | 0 (0-0) | 1.5 (0.8-2.2) | 49.6 (48.5-50.6) | script lower, other lower, compositor lower |
|  | baseline | 92.6 (87.7-97.5) | 96.3 (96.3-96.3) | 35.3 (34-36.6) | 495.7 (483-508.4) | 362.2 (353.1-371.2) | 181.6 (169.8-193.5) | 901.5 (870.7-932.2) | 0 (0-0) | 0.3 (0.1-0.4) | 50.7 (49.4-52) |  |
| profile-showcase (y 1248) | v7 | 55.4 (53.8-57) | 83 (82.9-83.1) | 1.3 (1-1.6) | 592.5 (583.1-601.9) | 472.4 (465.5-479.3) | 241.3 (234.7-247.8) | 973.5 (958.7-988.2) | 0 (0-0) | 0.7 (0.3-1.1) | 68.1 (67.3-68.9) |  |
|  | v8 | 53 (52.7-53.4) | 83.4 (82.4-84.5) | 1.8 (1.7-1.9) | 581.1 (580.6-581.5) | 465.7 (465.3-466) | 232.8 (228.5-237) | 952.1 (949-955.2) | 0 (0-0) | 1.3 (0.3-2.4) | 67.8 (67.6-68.1) | script lower, layout higher, paint lower, main lower |
|  | baseline | 104 (102.5-105.5) | 103.1 (102.9-103.3) | 36.3 (35.9-36.8) | 502.3 (499.8-504.7) | 362.4 (359.7-365.2) | 201 (197-205.1) | 946.8 (943.4-950.2) | 0 (0-0) | 0.8 (0.4-1.2) | 64 (63.7-64.4) |  |
| pain (y 1329) | v7 | 58.3 (53.6-62.9) | 92.4 (91.2-93.6) | 2.1 (1.9-2.3) | 570.7 (570.2-571.2) | 449.8 (446.6-453) | 253.4 (252.8-254.1) | 976.9 (972-981.8) | 0 (0-0) | 0.6 (0.5-0.7) | 70.1 (68-72.3) |  |
|  | v8 | 53.5 (52.6-54.5) | 89.6 (88.5-90.7) | 1.8 (1.6-1.9) | 575.1 (567.4-582.9) | 460.7 (452.8-468.5) | 237.9 (237.6-238.1) | 957.9 (952.3-963.5) | 0 (0-0) | 1.2 (0.7-1.8) | 68.5 (67-69.9) | style lower, other lower, main lower |
|  | baseline | 97.8 (94.9-100.7) | 114.2 (113.3-115.1) | 35.3 (35.1-35.5) | 493.7 (488.2-499.2) | 356.8 (355-358.7) | 198 (195.2-200.8) | 939 (927.2-950.8) | 0 (0-0) | 0.5 (0.4-0.7) | 62.4 (62.1-62.7) |  |
| commission (y 3193) | v7 | 39.5 (35.8-43.2) | 43.3 (30.8-55.9) | 15.5 (14.3-16.7) | 167.1 (150.6-183.5) | 125.5 (112.4-138.6) | 130.1 (105.4-154.8) | 395.5 (337-454.1) | 0 (0-0) | 0.1 (0-0.2) | 29.9 (26.1-33.7) |  |
|  | v8 | 33.7 (30.3-37.1) | 35.9 (35.1-36.8) | 16.3 (15.8-16.7) | 154.3 (153.6-154.9) | 115.6 (112.9-118.2) | 115 (114.4-115.6) | 355.2 (351.4-359) | 0 (0-0) | 1.2 (0-2.4) | 28.9 (28.7-29.1) | all overlap |
|  | baseline | 95.7 (95.2-96.1) | 108.5 (106.4-110.5) | 20.4 (19.5-21.3) | 483.7 (475.1-492.2) | 345.6 (337.7-353.6) | 195.8 (191.2-200.4) | 904 (899.3-908.7) | 0 (0-0) | 0.4 (0.3-0.5) | 44.7 (43.8-45.6) |  |
| end (y 5345) | v7 | 53.5 (49-57.9) | 96.5 (90.8-102.3) | 15.9 (15.8-16.1) | 332.8 (325.3-340.4) | 184.7 (181.2-188.2) | 195.1 (184.6-205.6) | 693.8 (665.4-722.3) | 0 (0-0) | 0.9 (0.9-0.9) | 91.9 (87.1-96.8) |  |
|  | v8 | 43.7 (33.7-53.7) | 90.8 (83.4-98.2) | 6.6 (0-13.2) | 293 (257.3-328.8) | 154.1 (125-183.2) | 176 (174.4-177.6) | 610.1 (563.7-656.6) | 0 (0-0) | 0.5 (0.4-0.6) | 91 (87.1-94.8) | layout lower, other lower, main lower, hitTest lower |
|  | baseline | 105.5 (89-121.9) | 94.2 (84.4-104) | 13.5 (0-27.1) | 388.9 (349.9-428) | 221.7 (196.8-246.7) | 182.6 (163.9-201.4) | 784.8 (687.3-882.3) | 0 (0-0) | 0.6 (0.5-0.6) | 74.2 (73.5-74.9) |  |


Wall time each section spent under the viewport centre during the scroll (ms, v7 / v8 / baseline): hero 846 / 850 / 854,
people 496 / 508 / 462, profile showcase 33 / 29 / 58, pain 1929 / 1896 / 1892, feed 425 / 437 / 488, commission
1479 / 1496 / 1495, platform 3684 / 3662 / 3650.

## Caveats

- **OBSERVED, Chrome only, at CPU 6x.** CPU 6x stretches main-thread time only; it does not model WebKit (no
  Layerize step there), the phone's GPU or raster, or a finger scroll (claims-audit §2.6). The ms are Chrome's
  main-thread costs at the calibrated setting, not iPhone ms.
- **Tracing and profiling perturb timing.** Compare arms with each other only, never with untraced verify/ab numbers.
- **A busier main thread can mean a smoother page.** At rest and in the scroll, v7/v8 produce more frames than the
  baseline (the frame columns); total ms per second then rises with the frame rate. Use the per-frame column to
  compare the cost of one frame.
- The frame logger reads `scrollY` in its rAF callback during the scroll phase (as `verify --frame-log`); that read can
  force a style/layout that the frame would have done anyway (P-023: neutral in counts). It runs the same in every
  arm. During rest windows it does not record.
- Rest windows "people", "profile showcase" and "pain" show almost the same viewport (y 933 / 1248 / 1329).
- Rest windows after the first come after one full scroll and an instant jump (no smooth path back up).
- **n = 2 runs per arm** (one hold, h1). The planned second hold (runs 3-4) waited 60 min in the chrome-measure queue
  and timed out without measuring. With n = 2, "lower"/"higher" (no range overlap) is a weak signal, not a verdict.
  (`summarize.mjs` can also print commits/s and main ms per commit at rest, but only for pages measured after the
  event counts were added to `probe.mjs`; no such page exists yet, so those columns are left out.)

## Files

- `probe.mjs`: the measurement (servers, Chrome, traces, profiles, per-section attribution) -> `out/sec/pages.jsonl`
- `summarize.mjs`: medians and ranges per arm -> `results.json` and the Markdown tables above
- `results.json`: all tables, geometry, per-run checks (load1, host CPU busy over the scroll, trace size, data loss),
  top main-thread event names and top JS functions per section and window
