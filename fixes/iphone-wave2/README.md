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

## 3. Scripted queue (DIRECTION "iPhone scripted-check queue")

(pending)
