# Fix: end-morph-f12 (F1 + U2: less work in the end-of-page morph)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** built on v9.2. Done: Chrome counts on the final build, Chrome pixels (gate self-tested), Simulator
pixels. Simulator counts are queued. No timing run and no phone run. v9.2 is NO-LAND (lead, 2026-10-05), so this
change lands on v9-final (JS `647c9ef2b1e2`, CSS `e1359ab9994a`, engine 7c). There `delta.diff` applies with `patch -F0`
(offsets -159 / -7), giving trial JS `a6426953727a`, which is the same file as int-v8's trial. The landing gates run on
int-v8's pinned v9-final snapshot.
**Stage:** F (build) of a less-work candidate for v9.3 (lead ruling 2026-10-05: "F1 + U2", F2 dropped).
**Device class / gate:** phone-only, render-bound. Landing per memory "less-work-landing-rule": cost-card counts, then
a short phone no-worse check (later in the phone queue, through the lead).
**Driver(s) behind the claims:** Chrome counts (rAF-stepped `scrollTo`, touch held; lift + settle; emulated toolbar
steps). No S, W, M, G or F phone run.
**Base:** v9.2 = v9.1d (JS `941aa13e5bdf`, CSS `f1997edf5309`), `fixes/end-morph/overlay`.
**Build:** JS `3625c64871fa`, CSS `f1997edf5309` (unchanged). `delta.diff` = the change against v9.2 (50 lines);
`patch.diff` = against the baseline snapshot (carries v9.2 too).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only: `S()` (v9.2 line 14315, one statement) and U2's three
places (`__nsMsPend` declaration near 14193, `_()` near 14297, `__msTick` 14478-14479).
**Credit:** U2 is fix-nav-morph's (fixes/nav-hit-cache, `u2-delta-on-v91d.diff`, sha256/12 `8b5206c8b206`), applied
unchanged with `patch -p1`.

## What changed

- **F1** (`S()`): `#platform` gets inline `visibility: hidden` in the same write that sets `--morph-fade` to 0
  (m >= 0.55, `QM`), and loses it in the write that sets fade > 0. At fade 0 the section is already at opacity 0 and
  `pointer-events: none` (same statement), so nothing visible changes by construction; the frozen-frame check below
  measures it.
- **U2** (fix-nav-morph): while the 7d morph is open on touch phones, `_()` no longer runs the nav hit test `F()`
  itself; `__msTick` runs it once after it has written the new morph value (at m <= 0.2, the only range where the
  answer shows), keyed on the value that shows.
- **F2 dropped** (lead, 2026-10-05): moving `__nsOnScroll`'s `scrollY` read into the engine's rAF gave no count gain
  in Chrome (the forced style pass only moved: open 62 -> 59, close 76 -> 76; style is already dirty from animations at
  rAF time, so the read pulls the frame's own recalc forward). Not in this build.

## Why it should be less work (mechanism)

- Phone (P-137 re-read, OBSERVED in our setup, cause unknown): on Safari toolbar steps in the end zone, #platform's
  tiles and its composited parts (stage artboard, secure-network parts) repaint, also at m >= 0.55 where the section is
  at opacity 0. A `visibility: hidden` subtree paints nothing, so in the 0.55 <= m <= 1 bin those repaints cannot happen
  (27 of C's 76 slow P-137 frames sit in that bin). Whether the step repaint is the dominant cost there on the phone is
  the open question for the no-worse check.
- Chrome (below): at rest open and on toolbar steps at m = 1 Chrome itself repaints #platform's animated parts every
  frame at opacity 0; F1 stops that.
- U2: fewer `getBoundingClientRect` + `elementsFromPoint` calls per morph frame.

## Cost card (Chrome, counts only)

Run: `fixes/end-morph/em-chrome.mjs --toolbar`, Chrome 154, 430x775 DPR 3, touch, no throttle, one shared slot.
- Final build `3625c64871fa` (F1 + U2): `out/end-morph/em-f1u2-775-2026-10-05T22-41-02-487Z.json`.
- v9.2 base: `em-v92r3-775-2026-10-05T21-58-19-288Z.json`.
- An earlier run on F1+F2+U2 (`em-f12-775-...21-57-33`) agrees within a few counts.

Totals per phase, v9.2 -> F1+U2. Phases not listed are equal within 2 counts (approach, rest closed, drag open, lift +
settle to closed, every step at m 0).

| phase (frames) | Paint events | paint area (Mpx) | styled elements | dirty layout objects | hit tests `F()` from `_()` |
|---|---|---|---|---|---|
| open (40) | 324 -> 259 | 128 -> 126 | 1404 -> 1580 | 160 -> 184 | 14 -> 0 |
| rest open (40) | **122 -> 4** | **113 -> 9** | 402 -> 399 | 0 -> 0 | - |
| close (40) | 320 -> 285 | 129 -> 126 | 1074 -> 1245 | 131 -> 155 | 26 -> 0 |
| lift + settle to open (90) | **377 -> 157** | **266 -> 127** | 1176 -> 1273 | 60 -> 84 | 11 -> 0 |
| drag close (20) | 163 -> 124 | 64 -> 61 | 410 -> 660 | 57 -> 81 | 17 -> 0 |
| toolbar step up at m 0.5 (30) | **122 -> 14** | **86 -> 17** | 336 -> 420 | 16 -> 40 | - |
| toolbar step up at m 1 (30) | **85 -> 1** | **84 -> 3** | 226 -> 226 | 13 -> 13 | - |
| toolbar step down at m 1 (30) | 125 -> 41 | 86 -> 39 | 417 -> 320 | 34 -> 34 | - |

Notes on the table:
- **Forced style passes are unchanged** (open 62 -> 62, close 76 -> 77). U2 removes the hit tests from `_()`
  (`getBoundingClientRect` + `elementsFromPoint`), but the forced style pass they paid moves to `__msTick`'s
  `window.scrollY` read (`style __msTick:14467`, 14 in open, 27 in close). Chrome's style is already dirty from the
  animations by rAF time. So in Chrome, U2 saves hit tests, not style passes. WebKit's `scrollY` forces style +
  layout anyway (2.4 in `fixes/end-morph/README.md`, CONFIRMED).
- At m 0.5 the toolbar step pushes m past 0.55, so F1 hides #platform there too. Stepping down from m 0.5 stays below
  0.55: 117 -> 117.

- **One-off cost of F1 (the return frame):** each crossing of fade 0 restyles the #platform subtree once: about +150
  styled elements and +24 dirty layout objects per open and per close (rows open, close, lift). It falls in one frame
  (hide at m 0.55 going in; show at m < 0.55 coming back). The show frame also repaints #platform (it was not painted
  while hidden): the open/close Paint totals above already include it.
- **Rest check (F-268 / F-272):** no new main frames at rest open. Both builds: style recalcs 39 of 40 frames (the
  panel's own animations run frames anyway), commits 39, rAF 49 vs 50, raster 11 vs 12.
- **a11y:** while hidden, #platform is out of the accessibility tree; that is only while the menu covers it
  (m >= 0.55, the panel is `aria-hidden` only below m 0.35). Its pointer-events were already `none` there.

## Pixels (PR-010, T0 asked)

Chrome, `fixes/end-morph/gates/em-px2.mjs --engine chrome --v fixes/end-morph-f12/overlay`, 430x775 DPR 3, four loads
A V A2 V2, Date frozen, animations frozen at 4 s, synthetic held touch; 18 stops: before the zone, m 0.02 ... 1 going
up, 0.5 / 0.1 / 0 coming back (`out/end-morph/px2-chrome-f12-2026-10-05T22-04-23-884Z`). Note: this run was on build
`3625c64871fa` (F1 + U2), F2 already removed.

- 17 of 18 stops: 0 css px² consistent beyond A/A (max level 0-2).
- m 0.95: **19 css px² consistent (0.0056 %), max 40, edge (flat 0)**, in both pairs: one device-pixel row along the
  bottom edge of the panel's "Join waitlist" button (css 224-304 x 560-576). Both A loads agree with each other and both
  V loads with each other. Reading (OBSERVED, cause unknown): the panel is at scale 0.998 there, and hiding #platform
  changes which layers Chrome composites under it, so the button edge is rasterized at another sub-pixel phase. That
  is a T2 difference (edge, max 40 < 128, 0.0056 % < 0.5 %), not T0. Nothing at m 0.8, 0.99, 1.
- **Lead ruling (2026-10-05):** m 0.95 is ACCEPTED as T2 (within PR-010's fill 64 / edge 128 / 0.5 % / 2,000 css px),
  provided the Simulator leg also stays within T2. The compositing cause stays OBSERVED, cause unknown.
- Gate self-test, Chrome (v9.2 against itself, same 18 stops): 0 consistent at every stop
  (`px2-chrome-selftest-2026-10-05T22-15-17-612Z`).

Simulator (fw-sim iPhone 15 Pro Max, `--engine sim`, 7 stops: pre, m 0.1 / 0.6 / 0.95 / 1 going up, 0.5 / 0 coming back):
- Self-test (`px2-sim-selftest-2026-10-05T22-48-44-833Z`): 0 consistent at every stop. Before the zone, the A/A pairs
  differ by 7 % (over 8 levels) in the photo cards under the nav. Those cards are still changing there in the Simulator.
- F1+U2 (`px2-sim-f12-2026-10-05T22-50-36-447Z`): **0 at m 0.1, 0.6, 0.95, 1 and 0.5 coming back**. m 0 coming back:
  4 css px², max 16 (fill), in the secure-network card.
- Before the zone: 73 css px² consistent, max 134, on the photo card's image under the nav. In one of the two V loads
  the next card ("Legal consult") is already in view (V/V 4.9 %). At this stop F1+U2's code path is the same as v9.2's
  (m 0, fade 1, no inline visibility; the STATE of all four loads is equal). So this reads as the noisy region the
  self-test shows, caught by chance in both V loads. That is OBSERVED. A rerun is queued (chain 4) to settle it before
  this leg is claimed within T2.

## Pending

- Simulator pixel rerun before the zone; Simulator counts (layer paintCount per phase, the return frame).
- Landing gates on int-v8's pinned v9-final snapshot: Chrome em-px2, Simulator em-px2, Chrome counts, cost card.
- Phone no-worse check (less-work rule). The iPhone is disconnected (T-207); the lead posts the reconnect step when
  the card is ready.
