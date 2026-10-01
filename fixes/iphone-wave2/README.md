# iPhone checks, wave 2 (iphone-runner, 2026-10-01)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). No patch here: this folder holds device measurements of overlays built from patches on
> local branches. Raw logs in `raw/`.

**Device:** iPhone 15 Pro Max, iOS 26.6.1, Safari (ProMotion; Safari's rAF runs at 60 Hz), driven over
`ios_webkit_debug_proxy` (`tools/iphone.mjs`). Viewport 430 x 775 CSS px (toolbar expanded), DPR 3.
**Serving:** plain http from the Mac (I-003), `serve.mjs --vendors=local --latency 150` (the https twin
is not used), worktree ports 5441-5443, LAN. **Low Power Mode:** off (user, and idle rAF 58.5-60 fps).
**Phone temperature:** see "Thermal episode" below; every block after it starts with a control run.

**Overlays** (built in this worktree with `fix.mjs combine`, never committed):

| name | patches, in order | served sha256 (JS / CSS) |
|---|---|---|
| baseline | `site-pretty/` | 4606120c / 27776f3d |
| aw1-10c | `all-wave1`, `scroll-engine` (/10c) | 757e2cbc / c6aad94b (= `fixes/se10c-aw1` servedCheck) |
| aw1-10c-6 | + `morph-scrolljack-passive` v05 (`worktree-agent-a277ea00c8773c1ea`, applied cleanly) | 81916eab / 97a20ad3 |
| aw1-10c-n12 | + `nav-scroll-handler/patch-on-aw1-10c.diff` (v5, same branch) | dd18cb96 / c6aad94b |

**Method (scripted):** `iphone.mjs scroll`: reload, settle 8 s, rAF frame log, 3 s idle,
`scrollBy({top: 250, behavior: 'smooth'})` every 300 ms to the bottom, 3 s at the bottom. Per W2 a
rAF gap on iOS is a main-thread frame gap: the UIKit scroll animation keeps moving the page meanwhile.
Section bands used for "where" (document y, toolbar expanded, measured on the phone): hero 0-855,
#people 856-1121, #profile-showcase 1122-1407, .pain (incl. the future card) 1408-2957, .commission
2958-4154, #platform 4155-6035. A frame is placed by the scrollY at its end.

## 1. Goal check: baseline vs aw1-10c (the wave-2 base)

Scripted, n=3 each, order B P P B B P, 06:53-06:57Z, phone cool (idle and bottom phases 59.3-60.2 fps
in all six runs).

| run (order) | B1 | P1 | P2 | B2 | B3 | P3 |
|---|---|---|---|---|---|---|
| scroll fps | 44.1 | 56.8 | 57.1 | 53.4 | 52.8 | 57.1 |
| frames >20 ms | 101 | 49 | 46 | 76 | 76 | 46 |
| frames >34 ms | 39 | 10 | 9 | 13 | 16 | 9 |
| frames >50 ms | 13 | 3 | 3 | 5 | 5 | 2 |
| frames >100 ms | 6 | 1 | 1 | 1 | 1 | 1 |
| worst frame ms | 146 | 105 | 106 | 112 | 113 | 106 |
| idle fps / >34 | 59.5 / 4 | 60.2 / 3 | 59.9 / 3 | 59.5 / 2 | 59.8 / 2 | 59.8 / 3 |
| bottom fps / >34 | 59.3 / 0 | 60.1 / 0 | 60 / 0 | 60.1 / 0 | 60.2 / 0 | 60.2 / 0 |

| scroll phase, median [min-max] | baseline | aw1-10c | ranges |
|---|---|---|---|
| fps | 52.8 [44.1-53.4] | 57.1 [56.8-57.1] | disjoint |
| frames >20 ms | 76 [76-101] | 46 [46-49] | disjoint |
| frames >34 ms | 16 [13-39] | 9 [9-10] | disjoint |
| frames >50 ms | 5 [5-13] | 3 [2-3] | disjoint |
| frames >100 ms | 1 [1-6] | 1 [1-1] | overlap |
| worst frame ms | 113 [112-146] | 106 [105-106] | disjoint |

B1 (the first load of the baseline port in this Safari session) is an outlier; without it the baseline
is 52.8-53.4 fps, >34 ms 13-16, >50 ms 5, and every range above except >100 ms is still disjoint.

**Where the frames > 34 ms fall** (ms @ scrollY):

- baseline B2: 55@703 58@744 (#people) · 54@1246 41@1403 44@1619 47@1672 40@1848 **112@1973** 65@1995
  47@1995 (.pain) · 35@2663 47@2875 (.pain/commission edge) · 43@4579 (#platform)
- baseline B3: 36@21 36@50 (hero) · 55@704 56@745 (#people) · 48@999 (profile) · 53@1249 40@1406 45@1618
  48@1681 38@1825 37@1867 **113@1986** 67@1994 35@2649 (.pain) · 38@3243 (commission) · 43@4570 (#platform)
- baseline B1 adds a commission-entry cluster (114@2707 111@2715 114@2820 129@2953 73@2991) and many
  35-45 ms frames across .pain.
- aw1-10c P1: 52@52 (hero) · 51@704 36@737 (#people) · 43@895 (profile) · 41@1248 37@1416 36@1605
  **105@1968** 38@1999 (.pain) · 44@4569 (#platform)
- aw1-10c P2: 55@59 (hero) · 50@687 42@727 (#people) · 51@1000 (profile) · 36@1604 **106@1958** 40@2232
  37@2725 (.pain) · 47@4580 (#platform)
- aw1-10c P3: 51@48 (hero) · 43@687 39@720 (#people) · 46@1247 38@1600 **106@1967** (.pain) · 41@2853
  36@2996 (commission) · 45@4577 (#platform)

**Verdict:** aw1-10c is clearly better on the phone (fps +4.3, >20 ms -40 %, >34 ms 16 -> 9, >50 ms
5 -> 3, all disjoint) but **the goal is not met**: 2-3 frames > 50 ms per run remain, at the same places
every run:

1. **~106 ms at y ≈ 1958-1968** (.pain, the known "y ~ 1970" frame, 3/3; baseline 112-113 plus a 65-67 ms
   follower, which aw1-10c cuts to 38-40). This is now the single biggest frame on the phone.
2. **51-55 ms at y ≈ 48-59** (the first scroll frames out of the hero, 3/3 on aw1-10c; baseline 36 ms or
   none). New or larger on aw1-10c: a candidate /10c (or wave-1) cost at scroll start.
3. **50-51 ms at y ≈ 687-704** (#people entry, 2/3; baseline 55-58 in 3/3) and **51 ms at y ≈ 1000**
   (profile, 1/3).

What aw1-10c removed: the commission-entry cluster (y 2650-2990, 35-129 ms in the baseline), the
65-67 ms second frame at y ≈ 1995, most 35-48 ms frames in .pain; the 43-47 ms frame at y ≈ 4570
(#platform) stays on both.

## Thermal episode (06:59-07:07Z)

After ~10 min of continuous scripted scrolls the phone (on the USB cable, charging, 74 %) throttled:
a plain baseline control scroll gave 16.1 fps scroll / 32.6 fps bottom, and idle rAF at a static page
dipped to 27-50 fps for ~6 min before returning to 60. Runs in that window (`raw/ctl-B4`,
`raw/e2-base-1`, `raw/e2-base-2`) are contaminated and not used. A control at 07:08Z (`raw/ctl-B5`)
matched the cool baseline again (53.4 fps, >34 ms 12, >50 ms 5, idle 59.2, bottom 58.6). The user
let the phone cool (locked, charging to ~80 %). Rule from here: a control run (plain scripted scroll on
the baseline) before each block; a block whose control has idle/bottom < 58 fps or scroll < 44 fps is
dropped.

| control | time (UTC) | scroll fps | >34 / >50 ms | idle fps | bottom fps | verdict |
|---|---|---|---|---|---|---|
| ctl-B4 | ~07:01 | 16.1 | 40 / 34 | 60.3 | 32.6 | fail (throttled) |
| ctl-B5 | 07:08 | 53.4 | 12 / 5 | 59.2 | 58.6 | pass |
| ctl-B6 | 07:20 | 54.2 | 12 / 4 | 59.6 | 60.1 | pass (after cooling) |
| ctl-B7 | 07:30 | 36.7 | 50 / 23 | 59.7 | 48.1 | fail |
| ctl-B8 | 07:32 | 40.8 | 44 / 13 | 59.6 | 37.3 | fail |
| ctl-B9 | 07:44 | 51.8 | 19 / 6 | 59.4 | 60.0 | pass (after 10-15 min locked, case off, fan) |
| ctl-B10 | 08:16 | 22.8 | 42 / 34 | 60.4 | 45.3 | fail (right after the finger tests) |
| ctl-B11 | 08:24 | 52.6 | 19 / 8 | 59.3 | 40.4 | fail (bottom); the morph finger block ran anyway (lead) |

The failure signature: static idle rAF stays at 60, but under scroll load the scroll phase drops to
16-41 fps and the bottom phase to 32-48 fps with most frames > 20 ms (30 Hz steps), i.e. the phone
throttles while rendering. The phone stays on the USB cable (the proxy needs it), so it charges and
warms; cooling = locked, case off, fan. Mac-side CPU of this agent's tooling during a run (ps, 5 s
samples, ctl-B6): serve.mjs 0 %, iphone.mjs <= 6.6 %, ios_webkit_debug_proxy 0 %.

The first finger recording (finger-A1, 07:21Z) captured no scroll (the request to the user arrived
after the 40 s window); the protocol was changed to a 90 s recording started when the user holds the
phone, with "scroll within 1 s of load" as a look-only reload at the end of each run.

## 2. Finger tests (user, relayed by the lead), 07:45-08:13Z

Pages, blind for the user: A = baseline (:5442), B = aw1-10c (:5441). Sequence per run: slowly top to
bottom, push past the end 2-3 times (morph), fling to the top, flick down (toolbar), then a reload.
Recorder: `out/iphone-runner/rec.mjs` (same per-frame log as `iphone.mjs record`: rAF dt, scrollY,
innerHeight; drained every 2 s so it survives reloads; one segment per document). Message relay to
the user takes minutes, so the recorder runs until the lead relays "done".

**User's words:** A1 "still laggy, similar to the real fastwork.com website" (they opened the live
site on purpose to compare); B1 "laggy, the same"; overall for A and B: the lag is **at the top
(scrolling out of the hero) and at the end-of-page transition (the morph, pushing past the end)**.

**Recorded numbers** (moving = frames whose scrollY differs from the previous frame; "last screen +
morph" = y >= 4485, all frames, because the morph pins scrollY at 5220):

| run | still fps | hero 0-900 moving: >34 / >50 / worst | middle 900-4485 moving: >50 / worst | last screen + morph: >34 / >50 / worst (frames) |
|---|---|---|---|---|
| A2 pass 1 (baseline) | 55.8 | 24 / 12 / 107 @94 | 18 / 152 @1936 | 89 / 50 / 112 (399) |
| A2 pass 2 | 53.5 | 8 / 3 / 71 | 11 / 115 @2092 | 109 / 75 / 218 (2466) |
| B2 pass 1 (aw1-10c) | 53.6 | 93 / 50 / 154 (437 hero frames: much hero scrolling) | 22 / 200 @2014 | 87 / 53 / 132 (278) |
| B2 pass 2 | 27.2 (morph dwell) | 6 / 4 / 109 @299 | 8 / 190 @1694 | 753 / 593 / 258 (1456) |

- **Morph = the worst place on the page, on both versions.** While the morph is active the page sits
  at the pin (scrollY 5220) and renders a steady run of 51-112 ms frames (about 10-18 fps); B2 pass 2
  dwelt there ~60 s at ~13 fps with 201-258 ms bursts. A finger push past the end therefore feels
  stuck/laggy regardless of aw1-10c.
- **Pin vs rubber band (B2 pass 2):** with the toolbar collapsed (innerHeight 815, maxY 5220) scrollY
  alternates 5220 <-> 5312 frame to frame: the morph's `scrollTo` pin and iOS's rubber-band
  overscroll fight. This is criterion (a) "jitter between the finger scroll and the scrollTo pin" of
  FINGER_TESTS row 1, seen on aw1-10c without #6 (morph-scrolljack-passive). A2 shows 5220 <-> 5230.
- **Hero exit:** both versions have 50-116 ms frames while the finger moves through y 0-900, many in a
  run at y 620-760 (B2) / 428-733 (A2): the scripted check's 51-55 ms frame at y~50 and the #people
  entry at y~700 are what the finger feels at "the top".
- Toolbar: innerHeight 775-815 in every pass (collapse and expand seen); no separate stutter metric.
- Excluded: A1 (07:54-07:56Z: still frames at a 29.8 fps cap, the phone was throttled; then the live
  site), the first A1 attempts (no scroll in the window) and C1 (no scroll; the user stopped).
- Not done: the C/D pair (aw1-10c vs aw1-10c + #6 v05, overlay `aw1-10c-6` built and served) and the
  finger part of DIRECTION item 7; postponed by the lead until the user has time.

## 2b. Morph finger block: aw1-10c vs mw-g-pinclamp-osb (08:24-08:36Z)

**Conditions: warm phone** (control ctl-B11 at 08:24Z: scroll 52.6 fps, idle 59.3, but bottom 40.4 fps
= fail; the lead ran the block anyway, B g g B alternation spreads the heat over both sides). A 2 s idle
rAF check before every run: 59.5-60.5 fps.
Pages, blind for the user: E = aw1-10c (:5441, 757e2cbc/c6aad94b), F = g = `mw-g-pinclamp-osb` on
aw1-10c (fix-nav-morph's worktree `agent-a277ea00c8773c1ea`, served from its overlays: JS 7eb48223, CSS
c6aad94b). Instruments per run: the frame recorder (`rec.mjs`) and fix-nav-morph's
`fixes/morph-webkit/morph-log.mjs` (per frame: --morph, nav classes, page-rAF JS ms, pin
scrollTo calls, touchmoves and whether they were prevented). Order E1, (E1b), F1, F2; E2 skipped by
the lead (verdict clear, saves heat and the user's time). E1 was not per protocol (user), kept as data
only; the reload in E1 also dropped the logger until re-installed.

| run | user | morph-active frames | p50 / p95 ms | > 50 ms | worst | pin fight (scrollY reversals >= 20 px at the end) | pin scrollTo calls | touchmoves prevented |
|---|---|---|---|---|---|---|---|---|
| E1 (aw1-10c, not per protocol) | (redo) | 2848 | 23 / 37 | 45 | 132 | 1 (5220<->5267) | n/a | n/a |
| E1b (aw1-10c) | "laggy" | 949 | 24 / 73 | 94 (10 %) | 230 | **8 (5220<->5334)** | 73 | 431 / 470 |
| F1 (g) | "same laggy" | 481 | 17 / 86 | 102 (21 %) | 148 | **0** | 0 | 300 / 318 |
| F2 (g) | "same laggy" | 277 | 19 / 117 | 73 (26 %) | 199 | 1 (5260<->5412, toolbar expanded: one rubber-band bounce, not a pin fight) | 0 | 165 / 184 |

In every run the slow frames are **rendering, not script**: median page-rAF JS 0-1 ms against 39-66
ms for the rest of the frame (style/layout/paint/composite).

**Verdict:** g does what it targets (the pin `scrollTo` and its fight with the rubber band are gone:
0 pin calls, 0-1 reversals vs 73 calls and 8 reversals), but the user feels no difference, because
the morph's own render cost is unchanged or worse: 50-230 ms frames while the morph is active on
both. The morph's per-frame paint/composite (no JS) is the end-of-page lag. Next: morph render
ablations (blur/backdrop/large layers of the morph panel) with a scripted morph driver.

Earlier finger runs agree: the B2 pass 2 dwell at the pin (aw1-10c, 08:06Z) ran ~13 fps with 50
reversals 5220<->5312 (section 2).

## 3. Scripted blocks after the finger tests

Driver scripts (in `out/iphone-runner/`, not committed): `winrun.mjs` (the `iphone.mjs scroll` sequence
with a configurable idle, an optional stop at y, `document.getAnimations()` counts before scrolling, and
the optional r3 logger), `mdrive.mjs` (fix-nav-morph's `__fwMorphDrive({hold: 2000, cycles: 3})`).

### 3a. Hero block (08:53-09:02Z; control ctl-B12 pass: 54.1 / 59.6 idle / 60.0 bottom; holds 57-60 fps)

Requested by mgmt-ops-3 for fix-hero-exit. Window run: reload, 8 s settle, **6 s idle at y = 0**, the
calibrated `scrollBy` steps until y >= 1000, 2 s hold; plus one full pass per version. Served with
`--no-cache`.

| version | served JS / CSS | n | hero 0-900 > 34 | > 50 | max | y~50 frame | y~700 frame (#people entry) | idle at y=0: > 34 / max | animations |
|---|---|---|---|---|---|---|---|---|---|
| B = aw1-10c | 757e2cbc / c6aad94b | 3 | 6 [4-7] | 1 [0-2] | 53 [48-64] | 48 [42-64] | 51 [45-53] | 10 [8-11] / 51 | 17 |
| P2 = se10e = aw1-10e | 3e2f599a / c6aad94b | 6 | 4.5 [4-6] | 1 [0-1] | 52 [48-56] | 43 [37-48] | 52 [44-56] | 8 [7-9] / 50.5 | 17 |
| P = hero v2 on aw1-10e | 71d76d69 / 8a14ac2e | 3 | 3 [3-3] | 1 [1-1] | 63 [58-68] | **35 [22-37]** | **63 [58-68]** | 7 [6-10] / 50 | 24 (7 ViewTimeline) |
| P3 = hero v2 + people-o | 71d76d69 / b6e53245 | 3 | 5 [5-6] | 2 [1-2] | 61 [57-64] | 44 [38-48] | 61 [57-64] | 6 [5-9] / 44 | 24 (7 ViewTimeline) |

Order B P P2 P2 P B B P2 P, then P3 P2 P2 P3 P3 P2 (median [range]). The P overlay changed on disk
between the 07:17Z serve (JS edc967ea, aw1-10c based) and this block (JS 71d76d69, aw1-10e based); the
block measured the latter. Full passes (n=1 each): scroll fps 57.7 / 57.7 / 57.9 / 57.3 (B / P / P2 /
P3); the worst frame of every pass is the y~1965 frame (95 / 93 / 86 / 106 ms).

**Verdict:** hero v2 removes the y~50 frame (42-64 -> 22-37 ms) but makes the #people-entry frame at
y~700 ~10 ms worse (52 -> 63, ranges disjoint from P2 and B); P3 keeps the y~700 cost and loses the
y~50 gain in this sample. /10e vs aw1-10c: small (hero > 34 ms 6 -> 4.5, idle > 34 10 -> 8).

**Hero-A (10:09-10:20Z, control ctl-B17 pass; window top -> y 1500 after 6 s idle at y = 0):** de-hero's
h1 candidate. Worst frame of the flip pair at y~680-750 per run: h1v2 (JS 8c513279 / CSS 55221d1b)
77 / 35 / 52 vs P 60 / 65 / 73 (order H P P H H P); h1 (JS 94e205d6 / CSS d49a050e) 45 / 41 / 52 vs P2
56 / 59 / 52 (order K Q Q K K Q). h1 lowers the flip frame by ~11 ms on its base, h1v2 by ~13 ms but
noisily; the <= 34 ms target was met in 1 of 6 runs. The y~50 frame stays gone with v2 (h1v2 2/3
runs, P 3/3) and is unaffected by h1. No new frame ~1 s after the flip (the 41-51 ms frame at y~1250
exists in all four). Idle at y = 0 the same everywhere (59.3-60.1 fps).

### 3b. Morph driver block (09:03Z-, control ctl-B13 pass: 53.1 / 59.6 / 60.0)

Builds from fix-nav-morph (all on aw1-10e): f = pin clamp only (JS 68a00843), g = f +
`overscroll-behavior-y: none` while morphing (JS 22efa0ab), fb / gb = with the 3 per-frame blurs off
(CSS d157ed21), ge = g with columns off (CSS bb992205), gc = g with the panel on its own layer (CSS
2cd9375b). "moving" = frames with 0 < --morph < 1 (the transition), "atOne"/"atZero" = held states.

| run | moving frames | p50 | p95 | > 50 ms | max | atOne p95 / max | atZero p95 / max |
|---|---|---|---|---|---|---|---|
| f1 | 110 | 30 | 53 | 7 % | 64 | 17 / 50 | 17 / 26 |
| g1 | 106 | 34 | 54 | 10 % | 59 | 17 / 48 | 17 / 40 |
| g2 | 119 | 29 | 52 | 5 % | 56 | 17 / 37 | 17 / 24 |
| f2 | 105 | 33 | 56 | 14 % | 64 | 17 / 48 | 17 / 46 |
| f3 | 96 | 35 | 64 | 22 % | 95 | 17 / 49 | 18 / 50 |
| g3 | 125 | 27 | 47 | 3 % | 52 | 17 / 36 | 17 / 38 |
| fb1 | 126 | 27 | 45 | 1 % | 57 | 17 / 39 | 17 / 21 |
| f4, f5 | (discarded: phone throttled, idle at the pin 42.7 fps; max 764 / 686 ms) | | | | | | |

The held states are clean (p95 17 ms); the cost is the transition itself (~30 ms median, ~33 fps while
the panel morphs). Paused at 09:08Z for heat.

**gh / gb / g** (09:24-09:27Z, control ctl-B14 pass; gh = g + size-stable panel, JS 1df2484c / CSS
a2b0be9a): moving p50 median gh 26 [24-31], gb 29 [27-35], g 35 [31-36]; the third round was warm
(400-800 ms spikes in held states). **ghb** (gh + blurs off, CSS db01137a; 09:52-09:55Z, phone cool
throughout, held p95 17): moving p50 ghb 21 / 21 / 24, gh 24 / 24 / 24, g 30 / 33 / 33; p95 46-52 for
all three. gh saves ~9 ms of p50 against g, blur-off ~3 ms more; the savings don't add up to the
predicted 17-20 ms, and the p95 tail (~50 ms) is untouched by both. fix-nav-morph later noted that its
"b" variants never removed the nav's own per-frame backdrop blur (ghbn tests that; its first round at
10:03Z was discarded, phone throttled).

**ghbn / ghb / gh** (10:32-10:36Z, control ctl-B18 pass: 52.3 / 59.4 idle; ghbn = ghb + the nav backdrop off
for the whole morph, JS 1df2484c / CSS 253943ac; three rounds ghbn ghb gh | gh ghb ghbn | ghbn ghb gh;
idle rAF 60.5 after each round; held states p95 17 except gh7/gh9 with 59-100 ms held spikes):

| build | moving p50 | p95 | > 50 ms | max |
|---|---|---|---|---|
| ghbn | 21 / 25 / 25 | 45 / 52 / 53 | 1 / 9 / 10 % | 52 / 59 / 58 |
| ghb | 24 / 26 / 28 | 54 / 57 / 57 | 10 / 15 / 17 % | 58 / 67 / 67 |
| gh | 29 / 24 / 27 | 84 / 44 / 59 | 18 / 1 / 12 % | 126 / 54 / 82 |

Medians: p50 ghbn 25 / ghb 26 / gh 27, p95 52 / 57 / 59. All three blur levers together (panel, platform,
nav) are worth ~2 ms of p50 and overlap at p95: **blur is not the transition cost on the phone.** What is
left (~25 ms p50, ~50-60 ms p95) is most likely the per-frame size/shape change of the morphing box
(layout + repaint); fix-nav-morph is building a fixed-size diagnostic. ghr8 was dropped as a result.

**R2 clip probe** (`/fw-clip-probe.html`, :5466): computed B = `backdrop-filter: blur(20px)` +
`clip-path: inset(100px 40px round 24px)`. WebKit's `Page.snapshotRect` does not render
backdrop-filter at all (no blur even in the unclipped box A), so the question needs a human look.

### 3c. e1/e2 block: the y~1965 worst frame (09:41-09:48Z, control ctl-B15b pass)

The first control after ~10 min of phone idle (ctl-B15) was slow with a 60 fps bottom phase (42.3 fps
scroll): a cold-cache first run, not heat; the immediate rerun passed (53.0). Builds from fix-nav-morph
on aw1-10e: e1 = #6 v05 passive arming (JS 3645c50c / CSS 97a20ad3), e2 = morph IO rootMargin 200 %
-> 150 % (JS 1abe16f1). Scripted scroll top -> y 2500, r3 logger with `inert` and `src` added to its
watch list, order C e1 e2 | e2 e1 C | C e2 e1.

| version | long frame ms @ y (3 runs) | named by R3 |
|---|---|---|
| control aw1-10e | 90@1965, 114@1969, 94@1967 | 3/3: >= 12 img `src` sets in the frame |
| e1 passive arming | 105@1965, 94@1966, 86@1963 | 3/3: same |
| e2 IO 150 % | 96@2243, 105@2239, 85@2242 | 3/3: same, at the new position |

The panel was pre-mounted at scroll start in 9/9 runs. Moving the IO edge moves the frame; listener
arming is not the cost.

**Correction (10:31Z, mw10e-src block):** the R3 logger keeps at most 12 events per frame, and the src
sets filled that list. `mw10e-src` (JS f7716dc3) gives all 21 panel images their src in idle time
(21/21 sourced at scroll start, 0 src writes during the scroll), yet the frame stays: control 86@1966,
92@1964, 88@1942 vs src 97@1960, 84@1950, 91@1963 (order C S S C C S). With the src sets gone, the
frame's only event is `inert` being removed from `div.start-selling-morph-panel`, 3/3. **The y~1965
frame is the morph panel leaving `inert` at the IO edge** (its subtree becomes live and renders); the
src burst only rode in the same frame.

**noinert (10:26-10:31Z, control ctl-B16 pass 52.4 / 59.6):** `mw10e-noinert` (JS 972eeb01) never sets
`inert` on the panel (tabindex toggles instead). The frame stays: control 102@1962, 91@1947, 106@1965 vs
noinert 98@1962, 99@1968, 95@1962 (order C N N C C N); its only logged events are now two `tabindex`
writes on the panel CTAs. Neighbours (+-2 frames) are 15-35 ms on both: one long frame, not a smear.
So neither `inert`, nor img `src`, nor making the listeners passive (e1) is the cost; the na/nb block below
names it.

### 3d. na/nb split and the first phone Timeline (10:38-10:47Z)

**Timeline timestamps (F-047, 10:39Z):** with `Page.disable` -> `Page.enable` -> `Timeline.enable` ->
`setInstruments(['Timeline'])` -> `Timeline.start({maxCallStackDepth: 1})` on the page target, every record
carries real start/end times and `performance.mark` arrives as a `TimeStamp` (1922/1922 records in the
check), as research/architecture/safari-inspector-probing.md predicted. Timeline runs are attribution only,
never A/B numbers.

**na/nb block (10:40-10:43Z, control ctl-B19 pass: 53.7 / idle 60.2; order C A B B A C, top -> y 2500, r3
logger uncapped):** fix-nav-morph's split of the IO edge path, on aw1-10e. na = the window listeners armed at
setup instead of at the edge (JS 26d4d548), nb = no `b` write at the edge (JS 78ce0637); C = aw1-10e (JS
3e2f599a); CSS c6aad94b for all. Worst frame in y 1850-2100 with its +-2 neighbours (ms@y):

| run | neighbours | edge frame | after | scroll fps | > 50 ms (whole scroll) |
|---|---|---|---|---|---|
| C pc1 | 16 17 | **104@1962** | 23 14 | 55.4 | 3 |
| na pa1 | 16 17 | 34@2002 | 11 10 | 57.0 | 0 |
| nb pb1 | 11 17 | **84@1956** | 16 17 | 55.5 | 2 |
| nb pb2 | 16 17 | **101@1975** | 15 23 | 54.8 | 2 |
| na pa2 | 17 16 | 35@2057 | 12 11 | 57.6 | 0 |
| C pc2 | 4 13 | **107@1962** | 33 10 | 56.3 | 1 |

**na removes the frame; nb does not.** It's one long frame, not a smear. The nb frame has no logged
attribute events at all, yet costs 84-101 ms. na moves no visible cost elsewhere: hero 0-900 > 50 ms is 0/0
vs 2/0, idle at the top is 59.9/60.3 vs 60.2/60.1, and the worst load/settle frame is 61/59 vs 48/57 ms
(`early`, in noise).

**P2b attribution (Timeline on, 10:45-10:47Z):**

| pass | frame | RenderingFrame | RecalculateStyles (Layout inside) | Composite (Layout / Paint inside) | Composite rest | JS |
|---|---|---|---|---|---|---|
| C tc1 | 100@1957 | 97.6 | 34.4 (18.9) | 58 (14 / 1.6) | ~42 | 1.4 (2 IO callbacks) |
| C tc2 | 121@1977 | 128.8 | 41.9 (24.3 + 2.3) | 72 (17.8 / 2.1) | ~51 | 1.2 |
| na ta1 | none > 34 ms in y 1700-2300 (max 30) | | | | | |

The frame after it (tc1, 36 ms) holds a rAF callback with a forced 12.3 ms Layout, plus small Paints of
the panel cards. So the y~1960 frame is a document-wide style recalc plus two layouts plus a ~40-50 ms
paint-less Composite. That fits de-unknowns-render's prediction (registered before the result was known):
adding the window touch/wheel listeners, passive or not, invalidates the event-listener regions, restyles
from the root and re-walks every composited layer's event region. Arming them at setup (na) moves that to
load time, where no long frame shows. Timeline records stay in `out/` (`e-tc*.tl.json`); the frame/summary
JSON is in `raw/`.

## 4. Protocol-v2 sessions (from 10:57Z)

Protocol v2 (research/architecture/measurement-protocol-v2.md §5) is applied by hand from here:
- one question per block, and a warm-up per served origin;
- immutable snapshot copies of every overlay (`out/iphone-runner/snap/`), with hashes checked on the served files;
- at least 10 min of cooling between blocks;
- from 11:23Z, every run records battery %, charging state and battery temperature (`batt.mjs`, `idevicediagnostics ioregentry AppleSmartBattery`).

Timeline runs are attribution only: de-safari measured that the Timeline adds about 1-3 ms per frame.

### 4a. Morph attribution session (10:57-11:09Z, control ctl-B20 pass: 53.3 / 59.8 / 60.2; idle 60.5 after every run)

**P2: where the transition time goes.** One Timeline cycle each on gh, g, ghb and ghbn (`mdtl.mjs`). Per moving frame:
script ~1 ms, style 1-5 ms, layout < 1 ms, Paint recording <= 4 ms. The cost is in **Composite minus its Paint
children**:
- gh: 31 ms in the first frame, 20-39 ms in the first 300 ms, 12 ms after 400 ms;
- g: 40, 32 and 23 ms early, and it stays at 20 ms in the tail;
- ghb: 30, 29 and 21 ms early, 12 ms late;
- at rest: about 6.5 ms.

de-safari's analysis (safari-render-signals.md §6) puts the cost at about 0.14 ms per repainted layer, almost
independent of the painted area.

**P3: LayerTree census over one gh cycle** (`lt.mjs`). Layers: 35 at rest, **113 at the m=1 hold**, 33 after.
About 78 layers are created and destroyed per cycle, and memory goes from 106 to 117 MB. Repaints per tween frame
(fwd / rev):

| layer | repaints per frame (fwd / rev) |
|---|---|
| platform-card (430x1880; a tile count) | 11 / 14 |
| platform-stage-artboard | 5.3 / 7.0 |
| nav header | 1.2 / 2.6 |
| column tracks | 1.0-1.5 / 0.7-0.9 |
| veil, center, footer | ~0.6 |

So gh's size-fixed children still repaint about every frame. The nav header's backing grows from 0.9 to 13.8 MB
at the hold.

**ghbn mechanism check:** the nav's computed `backdrop-filter` is `none` in 40/40 moving frames and 81/81 m=1
frames, and `blur(20px)` at rest. Verified.

**P-016 pair (gh, hold 2000 vs hold 250): invalid by design.** The tween takes ~650 ms (629-694 measured), so with
hold 250 the panel reverses at m <= 0.81 and never rests. Re-ticketed as P-016b with hold 900.

### 4b. P0 logger y-source A/A (11:23-11:30Z; 80 %, not charging, 39.4 -> 41.7 C)

- Build: aw1-10e (snapshot JS 3e2f599a / CSS c6aad94b), S full pass, Timeline on.
- The driver uses a fixed step count and reads no scrollY itself.
- Arms, which differ only in where the rAF logger gets y:
  - R: `scrollY` read in rAF (today's logger);
  - E: a passive scroll listener;
  - N: no y read.
- Order: R E N / E N R / N R E after a warm-up, then an uncounted Heap pass.

| arm | frames with >= 2 layouts > 0.5 ms | layouts > 0.5 ms | 12-17 ms layouts | layouts > 10 ms | tick median | k >= 5 (of ~420) |
|---|---|---|---|---|---|---|
| R | 4, 6, 4 | 45, 51, 47 | 20, 21, 20 | 25, 27, 26 | 2 | 7, 5, 7 |
| E | 4, 4, 7 | 47, 59, 48 | 19, 22, 21 | 32, 29, 29 | 2 | 5, 8, 6 |
| N | 5, 5, 2 | 53, 47, 44 | 23, 18, 21 | 29, 26, 26 | 2 | 7, 7, 7 |

**The logger's rAF read is neutral:** no column moves beyond the run-to-run spread, so the rAF y source stays.
The Heap pass delivered no `Heap.garbageCollected` events (Heap.enable is probably needed too), so GC is still
unmeasured.


### 4c. P1 countdown probe (P-017) and P2 hold length (P-016b), 11:57-12:07Z

- Builds: gh (CSS a2b0be9a), gh-cdwc (CSS 66aaffb6, countdown faces `will-change: auto`) and gh-cdhid (CSS 89c1492e), all
  on JS 1df2484c. M driver, hold 2000 x 3, Latin square, warm-up per port.
- **P-017 PASS.**
  - Moving p50/p95: gh 22/42, 23/45, 27/57; cdwc 17/21, 17/23, 19/26; cdhid 17/22, 20/27 (cdhid5 disturbed).
  - Excess over 16.7 ms in the first 450 ms of a forward tween: gh 170/190/228 ms vs cdwc 38/66/101 ms.
  - Timeline: 76 % of early tween frames repaint the faces on gh, 0 % on cdwc. Composite minus Paint in the
    first 300 ms: 25.1 ms (gh) vs 13.2 / 12.5 ms.
  - Layers at the hold: gh 113, cdwc 33, cdhid 113.
- **P-016b MISS.** Median dt in the first 300 ms: hold 2000 32.5/36.5 and 33.5/28 vs hold 900 27/33 and 32/44.

### 4d. Finger batch F1-F6 (12:44-13:16Z, user via the lead)

Recorder: `iphone.mjs record` (rAF dt + scrollY; no touch listener on purpose, because a window touch listener is what
arm-load changes). Finger rAF runs at about 80 Hz while moving (F-071), so fps and counts here don't compare with S/W/M runs; ms thresholds do.

- **F1, settings:** Reduce Motion off, Low Power Mode off, charge limit 80 %, no Safari extensions, feature flag
  "Prefer Page Rendering Updates near 60fps" ON (the default). These hold for every phone run in this file.
- **F2, push past the end, blind:** gh "laggy as the same", stub "smoother, but there's no content in there".
  Pre-check (M): stub moving p50 17 ms, gh 23 ms with 7 frames > 50 ms, so F2 was valid.
- **F3, slow scroll from y 1500, blind:** aw1-10e "small user profile are blinking ... hero section and end of the
  page are laggy"; arm-load "same laggy, avatars still blinking". No felt difference.
- **F4, flicks from the top, blind:** arm-load "timer quite smoother?", aw1-10e "same laggy, timer laggy". A weak,
  single-trial preference for arm-load.
- **F5, pacing page v1** (de-unknowns-ux): 14 trials rated. The first attempt failed because serve.mjs's CSP blocks
  inline scripts (F-067). Result scored in research/design-engineering/pacing-result.md.
- **F6, apple.com/iphone-18-pro:** "smooth, way smoother than fastwork, just have a little bit laggy". The try-3
  recording moved 1385 frames: 1 > 34 ms, 0 > 50 ms, max 38 ms.

Moving frames while scrollY changes (dt > 50 / > 34, with the ±4 ms twins > 46 / > 54 and > 30 / > 38):

| page | moving | > 50 | > 34 | > 46 / > 54 | > 30 / > 38 | max |
|---|---|---|---|---|---|---|
| F2 stub | 200 | 2 | 14 | 2 / 1 | 16 / 10 | 75 |
| F3 aw1-10e | 737 | 9 | 34 | 10 / 8 | 60 / 22 | 353 (first touch) |
| F3 arm-load | 1237 | 18 | 77 | 30 / 10 | 93 / 59 | 76 |
| F4 arm-load | 955 | 11 | 90 | 27 / 4 | 125 / 64 | 74 |
| F4 aw1-10e | 551 | 23 | 86 | 29 / 20 | 110 / 62 | 102 |
| F6 apple (try 3) | 1385 | 0 | 1 | 0 / 0 | 1 / 0 | 38 |

F2 gh sat at the bottom for the whole recording (pushes only), so it has no moving frames: all frames > 50 29 (gh) vs 3
(stub). Pacing v2 (13:45-13:50Z): the late-gap clip was chosen 4/4 at full speed; scored by de-unknowns-ux.

### 4e. P-029: g vs g-cdwc, M driver (13:17-13:25Z; 80 %, 34.1 -> 37.4 C)

C = mw10e-g (JS 22efa0ab / CSS c6aad94b), V = mw10e-g-cdwc (CSS 5dc6e8e3); hold 2000 x 3, C V V C C V V C. Sentinel: C held
m=1 p95 17/17/17/18 (pass; g8 at the limit).

| run | moving | > 50 | > 34 | > 46 / > 54 | > 30 / > 38 | max | p50 | held m=1 p95 / max |
|---|---|---|---|---|---|---|---|---|
| g1 | 125 | 1 | 51 | 3 / 0 | 58 / 28 | 54 | 29 | 17 / 36 |
| g4 | 126 | 2 | 48 | 2 / 1 | 56 / 32 | 56 | 29 | 17 / 35 |
| g5 | 122 | 3 | 47 | 4 / 3 | 60 / 32 | 68 | 30 | 17 / 37 |
| g8 | 98 | 27 | 58 | 37 / 20 | 66 / 55 | 68 | 40 | 18 / 57 |
| gc2 | 203 | 0 | 0 | 0 / 0 | 1 / 0 | 31 | 18 | 17 / 20 |
| gc3 | 203 | 0 | 0 | 0 / 0 | 1 / 0 | 32 | 18 | 17 / 17 |
| gc6 | 163 | 0 | 1 | 0 / 0 | 2 / 0 | 35 | 23 | 17 / 25 |
| gc7 | 198 | 0 | 0 | 0 / 0 | 0 / 0 | 28 | 19 | 17 / 17 |

Not threshold-sensitive. Attribution (one cycle each): face-repaint frames in the first 450 ms 85 % vs 0 %, Composite
minus Paint (first 300 ms) 19.9 vs 16.3 ms, layers at the hold 113 vs 33.

### 4f. P3: ST-2 re-dur / re-keep vs Q, baseline-A, ST-2d fling-hold (13:35-13:44Z; 40.8 -> 39.8 C)

- Q aw1-10e, re-dur (CSS 890da4b0), re-keep (CSS 78047ec2), baseline-A (site-pretty, JS 4606120c / CSS 27776f3d).
- W driver: 6 s idle, then top to 1745, Timeline on in every counted run (F-047 sequence).
- Order: Q D K Q K D, then B x 2, then fling-hold on Q x 3 (W to 1100, 1.5 s hold, one 700 px flick).
- Timeline-OFF S sentinels on Q: open 58.0 scroll / 60.1 bottom, end 57.7. Both pass.
- fix-hero-exit's flip-relative reads (75d4f74): re-dur HIT (the opacity-end Layout moves from +700 to +500 ms),
  re-keep HIT (no Layout at +900 or +1150), baseline-A +1645 unresolved.
- de-pm-hero: the fling-hold rest frames (Layout 19-33 ms at y 1101-1103) are rotator ticks (JS L11571).

### 4g. P4: y≈1960 blocks, F1 arm-load and F3 arm-scope (14:22-14:45Z)

- Window driver to 2500 with a 1.5 s pause at y 1248, r3 inert logger, built-in bottom sentinel 59.7-60 fps in every
  run, C V V C C V V C. The phone was warm (37.5 -> 40.9 C).
- Slowest frame in the edge window y 1940-2010:
  - C: 100-118 ms in 8/8 runs, all named "src img x21 + inert morph panel".
  - arm-load (JS c6a3ac92): none above 34 ms, then 49, 40 and 42 ms, all unnamed. The ≤37.5 ms card is 1/4;
    at 50 ms it passes 4/4, threshold-sensitive.
  - arm-scope (JS 7b0d6222): none above 34 ms in 4/4. The nearest are 39-49 ms at y 2019-2250, unnamed.
- Scroll-phase frames > 50 ms: C 1-3 per run, arm-load 1-3, arm-scope 0-1.
- Neither arm added a frame of 54 ms or more in load or settle.
- The pause cluster at y 1248 (35-52 ms) is present in both arms.
- **T1a on/off A/A** (warm-up slot, ABBA on aw1-10e, S scroll phase), on vs off: > 50 ms 3 vs 7, > 34 ms 18 vs 21,
  fps 57.4 vs 57.3. No probe cost visible; frame timing only.
- F1 Timeline attribution run (depth 8): the edge frame did not occur (max 33 ms in y 1900-2100).

### 4h. P-033 step 0: is the re-keep-op card composited at rest? (14:47Z)

- Builds: re-keep (CSS 78047ec2) and re-keep-op (CSS 507f0ca4); 20 s rest on the card, then the LayerTree read.
- Both arms give the card its own layer (reason willChange, 430x1328, 15.9 MB).
- Whole-page Paint in the rest: 1263 records / 96.4 ms vs 1265 / 94.2 ms. fix-hero-exit does the per-cycle scoring.

### 4i. Swipe A/B of the countdown fix, pairs 1-2 (14:00-14:15Z, blind)

C = mw10e-g, V = mw10e-g-cdwc, each served from a snapshot on a neutral port. The pairs are C/V, V/C and a C/C catch, in
shuffled order; the key stays sealed until pair 3 (after the user console lands).

- Pair 1: "same".
- Pair 2: "almost same, hero and end of page are laggy".

Most > 50 ms frames sit in the hero window on every page.

### 4j. OSS P0 ca-check (P-021), 13:16Z: which animations survive a main-thread block

- Page: research/architecture/oss-rendering-libs/ca-check.html, served without CSP. serve.mjs's CSP blocked the inline
  script on the first try (F-067).
- Capture: WDA `/screenshot` at about 15/s (`wdacap.mjs`), with no inspector attached during the trials. ioscap needs
  Camera permission for the terminal (TCC), which the user's setup list has.
- 4 trials: a 1000 ms busy loop starting 300 ms into a 2000 ms animation. The page measured a rAF gap of 1001-1002 ms
  every time.

| lane | animation | moved frames in block (of ~15) | max diff |
|---|---|---|---|
| Ta | transform, cubic-bezier transition | 7, 7, 7, 7 | 54 |
| Tb | same, `linear()` 31 points | **0, 0, 0, 0** | 0 |
| Tc | WAAPI, 31 sampled keyframes | 7, 7, 7, 7 | 54 |
| Fa / Fb / Fc | filter blur, the same three easings | 7 / **0** / 7 | 6-7 / 0 / 6-7 |
| D1 / D2 | none -> blur(14px) vs blur(0) -> blur(14px) | 7 / 7 | 4 / 4 |
| E | backdrop-filter 0 -> 20px | 0 (diff 0.2-0.5, at the threshold) | unresolved |
| S | scroll() timeline control | 0 (trial 1, void), 3, 2, 3 | 66 |
| W | rAF witness | 0 | 0 |

F-048 holds: `linear()` easing freezes during the block, while cubic-bezier and keyframe-sampled animations keep
moving. Posted as F-080, CONFIRMED for iOS 26.x by device plus source (F-065: KeyframeEffect.cpp canBeAccelerated rejects linear() points; PlatformCAAnimationCocoa.mm toCAMediaTimingFunction takes only cubic-bezier or identity linear; oss-rendering-libs.md §1.3).

### 4k. P11 Block A (P-028): aw1-10e vs aw1-cq3, W + Timeline (15:13-15:20Z)

- Arms: C = aw1-10e (:5497), V = aw1-cq3 (CSS 8b96dc588847, :5495).
- Driver: W 430x775, 6 s idle at y 0, then top to 2900. Timeline depth 8 on every counted run (F-047).
- Order: C V V C C V V C, then one lc-base Timeline run (L9, for P12).
- Sentinels (S, Timeline off, on C): open 57.8 scroll / 60.0 bottom, end 57.9 / 60.2. Both pass.
- Readout: `raw/p11an.mjs`, run over `p11-*.json` (in `raw/`) plus `p11-*.tl.json`. The `.tl.json` files are about
  2.4 MB each and stay in `out/iphone-runner/`.
- Raw files in this write-up have the LAN host replaced by `LAN` (from this commit on, older files included).

| run | rebuild frame (y) | Layouts in that frame (ms) | of them nested in RecalcStyles | scroll phase nested | >30/>34/>38 | >46/>50/>54 |
|---|---|---|---|---|---|---|
| C1 | 127 ms (1979) | 6 (25.9) | 2 (24.6) | 35 (28.6 ms) | 12/8/7 | 3/3/3 |
| V2 | 107 (1973) | 3 (33.4) | 0 | 0 | 9/7/3 | 1/1/1 |
| V3 | 108 (1984) | 3 (34.0) | 0 | 0 | 12/5/3 | 2/1/1 |
| C4 | 108 (1971) | 6 (35.4) | 2 (22.4) | 40 (38.8) | 8/7/4 | 1/1/1 |
| C5 | 101 (1966) | 7 (35.9) | 2 (22.1) | 39 (38.3) | 12/6/6 | 3/1/1 |
| V6 | 102 (1965) | 4 (21.9) | 0 | 0 | 8/7/5 | 3/2/1 |
| V7 | 102 (1975) | 4 (33.5) | 0 | 0 | 10/9/5 | 2/1/1 |
| C8 | 107 (1961) | 5 (34.5) | 2 (21.6) | 40 (38.0) | 10/7/6 | 3/1/1 |
| L9 lc-base | 54 (2681) | 4 (43.2) | 2 (27.4) | 40 (44.0) | 15/9/5 | 1/1/0 |

- cq3 removes the Layout nested in style recalc: 0 in every V run, against 2 per rebuild frame and 35-40 per scroll in C.
  The same Layout cost still runs in the same frame, though. The edge frame stays at ≥101 ms in 8/8 runs.
- >50 and >34 are within noise. The >38 twin leans to V (C 23 vs V 16), so the call is threshold-sensitive.
- fix-scroll-engine's reading (README 2e364d6): nested Layout gone = HIT, rebuild-frame Layout −1.5 ms = MISS, frame
  dt NULL. Block B (lc-base vs lc-cq3) was skipped by the owner.

### 4l. User sitting via the console (15:32-16:35Z)

The first sitting through `tools/console.mjs`. Every user step was posted there; nothing went through the lead's chat.

- **Swipe pair 3 (C-001, 15:44-15:48Z):** a full redo of both pages. Answer "same", with the note "hero quite
  smoother a little bit on page 2, overall, i think they're same".
  - Key, unsealed now: page 1 = C mw10e-g (:5537), page 2 = V mw10e-g-cdwc (:5529).
  - All three pairs: the C/C catch "same", V/C "almost same", C/V "same". The cdwc fix is NOT FELT in free swipes.
  - Recordings `raw/finger/sw-p3-{1,2}-redo.json`. Moving frames >34/>50: 54/11 vs 65/13 (finger run, info only, F-071).
  - Phone 41.2 / 38.5 °C.
- **F-v3 run 1 (C-002, set 1, the user, 15:49-15:59Z):** answer "done". Saved as `fv3-set1.json`. LPM off; the toolbar
  was collapsed at the end. de-unknowns-ux scores it.
- **F-v3 run 2 (C-004, set 2, a SECOND TESTER, not the user, 16:12-16:33Z):** answer "done".
  - The tester reloaded once by accident and redid every question.
  - The saved session starts at 16:21:39Z, after the reload, and holds trials 0-11 once each, so there are no
    pre-reload partials.
  - Saved as `fv3-set2.json`. Score it separately from the user's run.
- **USB drops:** both times, within seconds of an F-v3 answer, the phone dropped off USB (15:59-16:09Z, 16:33-16:35Z).
  The iwdp device list was empty and WDA was unreachable. The user re-plugged both times (C-003, C-005). Both results
  were read from the un-reloaded tab. Logged as I-040 (env).
- The F-v3 result files are not committed here: each is about 1 MB and is de-unknowns-ux's data. They stay in
  `out/iphone-runner/`.

### 4m. P-032 G block, attempt 1 (16:52-17:04Z): void, WDA actions timeouts (I-042)

The block was hook-free: C aw1-10e (:5497) vs V mw10e-cdwc (:5492), driver G (`finger-protocol-v1.json`).

- The S-open sentinel (Timeline off, C) reached 56.9 fps, scroll ≥44 ok.
- Every gesture run aborted with "WDA POST /actions: timed out after ~15.9 s":
  - warm-ups C and V, and C3: at the drag-into-end stroke;
  - C1 and C2: at stroke 1;
  - C4: killed at its start, when I stopped the block.
- Per-stroke WDA time was 8-15 s for gestures with 0.3-0.9 s of contact (C3: 9.2, 14.7, 11.1, 15.0, 2.3 for the fling,
  6.4, 13.3, then 12.7-14.4 s). The run aborts at the first stroke that passes the limit.
- Strokes were also collapsed to ~50 ms flicks (F-085, I-042). The raw per-stroke times stay valid; the block was void
  anyway.
- WDA `/status` answered in 4 ms, ready, and `activeAppInfo` showed Safari, so the slowness is in the actions endpoint
  only. Cause UNRESOLVED (I-042).
- The phone warmed from 31.9 to 40.1 °C over the block.
- No counted run is valid. Per the lead, these runs do not count against P-032's 2-block cap.
- The gesture JSON stays in `out/` (lead ruling: no gesture records committed until N1 lands).

### 4n. Builds for the user's hand test (lead request, 17:20Z)

The sitting compares A, the original Fastwork (the plain baseline snapshot b1789284481295-4ad4a84a, no overlay), with B,
our best current stack. Both are served over `site-pretty` with `--vendors=local --latency 150`, plain http.

- **Key:** A = `:5611`, B = `:5647`. The ports were drawn at random so they don't reveal which is which.
  - A serves the baseline as is: JS `4606120cf392`, CSS `27776f3d4138`.
  - B serves `out/iphone-runner/snap/user-bplus`, a read-only copy: JS `dbd5fdb4f1fb…`, CSS `cc8d1340b449…`.
  - The served hashes were checked on both ports.
- **B's stack, on aw1-10e:**
  - mw10e-g (pin clamp + nav-morph g; it still carries the DEBUG `__fwMorphDrive` hook, which only runs when called);
  - mw10e-cdwc (CSS);
  - re-keep-op (CSS; the CSS merge is clean);
  - mw10e-arm-scope-c (F3, the landing bytes `c6d3590576a7`).
- **One hand-resolved line.** The 3-way merge of g and arm-scope-c conflicts on one line, the effect's setup call:
  - g keeps `(R && te && te.observe(R), _(), m());` and adds its debug hook after it;
  - arm-scope-c changes the call to `…, m(), N());`.
  - The resolution is the union: g's block, with the call `…, m(), N());`. `node --check` passes. The diff against g is
    exactly F3's changes.
  - The lead allowed this B+ as the user's B, as long as it passed the Chrome sanity check.
- **Plain B without F3** (g JS `22efa0ab69ba` + the same CSS) is `snap/user-b`. It was checked too.
- **Chrome sanity:** `fix.mjs ab --runs 1` against the baseline, one short hold per build, info only (n=1, no verdict).

| | new console errors | new 404s | morphReached | screenshot diff top/mid/bottom % | scroll p95 ms | scroll >34 / >50 |
|---|---|---|---|---|---|---|
| B (no F3) | 0 | 0 | true | 0.16 / 0 / 0.55 | 25.4 → 17.3 | 8→5 / 7→2 |
| B+ (served as B) | 0 | 0 | true | 0.13 / 0 / 0.55 | 25.1 → 17.4 | 7→5 / 5→1 |

  - The 0.55 % at the bottom is the animated gradient headline text ("Secure", "Organized") caught at another color
    phase. I compared the screenshots: the layout is identical.
  - `fixes/all-wave1` has the same bottom 0.55, so the difference comes from the aw1 base, not from B's patches.

### 4o. P14 (P-025): C aw1-10e vs V1 st4-noswap vs V2 re-contain-js, driver W, Timeline depth 8 (17:42-17:54Z)

- **Setup:** 430x775. Each run: 6 s idle at y 0, then scroll from the top to y ≥ 2500, then a 2 s hold.
- **Ports and served hashes:**
  - C :5497, JS `3e2f599a1632`, CSS `c6aad94b455f`;
  - V1 st4-noswap :5501, JS `b8c085d9b619`;
  - V2 re-contain-js :5502, JS `3579d857cab9`, CSS `288c2ebec580`;
  - R st4-rotoff :5503, JS `71572ef639cf`.
- **Tools:** the branch at main 2cd736b (tools last changed b80a767: the I-037 fix and the T1a series).
- **Block:** one warm-up per arm, then the S-open sentinel, 9 counted runs (C V1 V2 / V2 C V1 / V1 V2 C), the S-end
  sentinel, 3 Timeline-OFF idle runs at y 1500, and 1 uncounted R run.
- **Phone:** 35.6 → 36.8 °C, LPM off.
- **The first start (17:17Z) aborted at the warm-ups.**
  - Safari's inspector gave no page target, then a page target whose evaluate never answered.
  - The user fixed it from the console (C-009 to C-012): reload, a new tab, force-quit Safari, then typing the URL.
- **Sentinels (S, Timeline off, C):** S-open 56.6 fps, S-end 56.5 fps. Scroll ≥ 44 holds.
- **Runner's quick readout** (`p14an.mjs`, not the scorer's): Layout records ≥ 10 ms per phase. "View" means rooted at the
  whole viewport. Frame counts are dt > 34 / > 50.

| run | idle 6 s: view / other L≥10 | idle >34/>50 | scroll 3.3 s: view / other | scroll >34/>50 | hold 2 s: view / other |
|---|---|---|---|---|---|
| C1 | 15 / 0 | 4/2 | 24 / 0 | 6/1 | 5 / 0 |
| C5 | 15 / 0 | 4/2 | 29 / 1 | 7/1 | 6 / 0 |
| C9 | 15 / 0 | 5/0 | 25 / 0 | 7/2 | 5 / 0 |
| V1 A2 | 0 / 0 | 0/0 | 13 / 0 | 8/1 | 0 / 0 |
| V1 A6 | 0 / 0 | 0/0 | 15 / 0 | 7/1 | 1 / 0 |
| V1 A7 | 0 / 0 | 0/0 | 15 / 0 | 5/1 | 0 / 0 |
| V2 B3 | 1 / 10 | 1/0 | 2 / 11 | 5/2 | 1 / 3 |
| V2 B4 | 2 / 9 | 0/0 | 2 / 10 | 3/1 | 0 / 4 |
| V2 B8 | 2 / 9 | 2/0 | 2 / 9 | 5/1 | 0 / 3 |
| R10 (rotoff, uncounted) | 0 / 0 | 0/0 | 16 / 0 | 7/2 | 0 / 0 |

- **Timeline-OFF idle at y 1500, 40 s per arm** (`p14idle.mjs`):

| arm | >30 / >34 / >38 | >46 / >50 / >54 | near | max | fps |
|---|---|---|---|---|---|
| C | 75 / 47 / 30 | 13 / 11 / 11 | 47 | 63 ms | 58.3 |
| V1 st4-noswap | 0 / 0 / 0 | 0 / 0 / 0 | 0 | 20 ms | 60.0 |
| V2 re-contain-js | 61 / 40 / 13 | 3 / 0 / 0 | 51 | 47 ms | 59.1 |

- **Reading (OBSERVED, in our setup; the P-025 verdict is the scorer's):**
  - V1 (no swap) removes every ≥ 10 ms view Layout at rest, like rotoff does. Its idle frames match rotoff's.
  - V2 (contain) moves the rest-phase Layouts from the view root into subtrees. It keeps about as many ≥ 10 ms Layouts
    and fewer > 50 ms frames, but the > 34 ms idle frames at y 1500 stay (40 vs 47).
  - The scroll-phase view Layouts drop from 24-29 (C) to 13-15 (V1) and 2 (V2).
- **Files** stay in `out/iphone-runner/` (Timeline records are large): `p14-{C1,C5,C9,A2,A6,A7,B3,B4,B8,R10}.json` +
  `.tl.json`, `p14-S-{open,end}.json`, `p14-idle-{C,A,B}.json`, `p14.log`. The arm letters A/B in these file names are
  V1/V2, not the sitting's A/B.
