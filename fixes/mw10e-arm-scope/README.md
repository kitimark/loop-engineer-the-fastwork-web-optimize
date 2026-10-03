# Fix: mw10e-arm-scope (F3)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured. Phone gain card PASS (P4 block B, P-022 HIT). The Chrome regression A/B is within noise on every
row. The lead chose F3 over F1 (14:4xZ). Still open before landing: P-036 (G touch-to-scroll), then F (user console),
then review.
**Topic:** morph-webkit / nav-morph (owner fix-nav-morph). The full history is in `fixes/morph-webkit/README.md`
on the working branch `worktree-agent-a277ea00c8773c1ea`, which is not part of this landing (sections "y≈1960: the split …", "F3 `mw10e-arm-scope`", block A and block B).
**Base:** stacked on `aw1-10e` (`node tools/fix.mjs apply mw10e-arm-scope --on aw1-10e`). JS only.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, the morph listener effect: `k` (13307), arm/disarm `N`/`P`
(13319-13360) and the setup call (13370). JS sha256 prefix 7b0d62225545 (aw1-10e: 3e2f599a1632); CSS = base
(c6aad94b455f).

## Why it lags

- **The frame.** On the iPhone, the frame at y≈1960 lasts about 100-118 ms in every control run (P4 blocks A and B).
  r3 names its DOM events "src img → post-1.png ×21; inert div.start-selling-morph-panel". It comes from the IO
  edge, where #platform enters the 200 % zone.
- **What the original does at that edge.** It adds the window `wheel` (non-passive), `touchstart` (passive) and
  `touchmove` (non-passive, capture) listeners, and removes them again when #platform leaves the zone (JS 13319-13348).
- **Attribution.**
  - NAMED card P-011: `na`, with no listener add at the edge, took the frame from 104 to 34 ms.
  - Source (arch-claims, WebKit tag 7624.4.5): a window wheel listener triggers a full style rebuild only when the
    set of event-region types changes. Touch event regions are compiled out on iOS before WebKit 7625.
  - So the wheel half is the likely mechanism, but which listener costs the frame on the device is UNRESOLVED
    (F-062). P-030 (C vs lw vs lt) decides it.
  - The listener add as the cause of the frame is OBSERVED.
- **What the frame is made of** (fix-scroll-engine: Timeline split of the y≈1960 crossing frame in the P11 control
  runs, where it lasts ≥ 101 ms; lead FYI 15:2xZ):

  | phase | duration |
  |---|---|
  | Composite | 37-73 ms (median ~46 ms) |
  | Layout | 22-36 ms |
  | RecalculateStyles | 15-16 ms |
  | Paint | ~3 ms |
  | script | 1-4 ms |

  - So most of the frame is the compositing that follows the style and layout invalidation, not the listener script.
  - F3 removes the whole frame in block B (no frame >34 ms in the window, 4/4 runs), so the Composite part goes too.
    That is inferred from dt alone: there is no Timeline split on V yet.
  - Why Composite is large is OBSERVED and untested (in our setup, cause unknown). One candidate is the #people card's
    own composited layer: 430x1328, 15.9 MB (de-pm-hero post-mortem §7.9). If the edge frame re-commits or re-rasters
    that layer, its size would explain the Composite share, and also why F3's removal of the invalidation helps.
    - The decisive local check: a Timeline plus LayerTree capture of the edge frame on C vs V (driver M or S, with
      layer ids). It is not run.

## What changed

- **Listeners armed once at setup** (page load), before any scroll, and never removed while the effect lives:
  - `touchstart` (passive) and `touchmove` (non-passive, capture) go on `#platform` and
    `header.start-selling-top-nav`, not the window;
  - `wheel` stays on the window, as in F1.
- **The zone gate moves into the handlers** (`k`: `e > 0 && u && O()`), so the handlers act exactly when the
  original had them attached.
- **No visual change:**
  - screenshot diff vs aw1-10e is 0.13 / 0 / 0 % (top / middle / bottom, phase noise);
  - the morph reaches 1 in 5/5 runs on both sides;
  - a11y and hit tests are identical (`probe-results/arm-scope-check.json`).
- **Behaviour check** (`touch-check.mjs`):
  - At the end of the page #platform spans the whole viewport, so a morph touch starts on #platform or on the nav.
  - A 240 px upward swipe reaches morph 1 from y≈699 and from y≈88, as in base.

## Why that is faster

- Nothing is added at the IO edge, so the edge frame loses whatever the listener add costs there.
- Arming at setup happens once, before any scroll, at y=0.
- F3 instead of F1 (all on the window): with element listeners only the two subtrees are listener targets. The
  touch-region argument for that (F-055) is REFUTED for iOS 26.6 (F-070). So F3's case rests on two things:
  - the measured edge (block B vs block A);
  - the smaller listener footprint, whose touch delay P-036 checks.

## Before / after

**iPhone, P4 block B** (driver W top → 2500 with a 1.5 s pause at y 1248, r3 logger; C V V C C V V C; ms only;
iphone-runner 14:40-14:45Z; all sentinels pass; the phone warm, 40.9 °C at the end):

| row | C aw1-10e | V F3 | reading |
|---|---|---|---|
| edge frame y 1940-2010 | 115 / 118 / 110 / 106 ms | none >34 ms, 4/4 | card P-022 PASS (as ms, ≤ 41.7 ms). Counting run 4's 49 @2019, just past the window: 3/4 |
| frames >50 ms, y 1700-2200 | 1 / 1 / 1 / 1 | 0 / 0 / 0 / 0 | better at the 50 and 54 ms thresholds; threshold-sensitive at 46 (run 4's 49 ms) |
| scroll dt>50 / dt>34 | 2,1,2,3 / 11,9,7,11 | 1,0,0,1 / 9,10,9,10 | within noise |
| load and settle dt>50 / dt>34 / max | 2,1,2,1 / 5,6,9,8 / 55-61 ms | 1,1,0,1 / 7,5,10,8 / 46-61 ms | within noise, no new ≥54 ms frame |

Both arms leave unnamed 39-49 ms frames between y 2019 and 2250. Their cause is UNRESOLVED (in our setup, cause
unknown). They do not block F3 (lead).

**Chrome regression A/B** (`node tools/fix.mjs ab mw10e-arm-scope --on aw1-10e --runs 5 --frame-log`, one hold,
15:0xZ; mobile 430x932 DPR 3, CPU 6x, ABBA; `results.json`):
- **Host:** 1 of 10 runs contaminated (base run 4, other CPU 28.4 %), so the verdicts are provisional. Without that
  run every row is still within noise.
- **Regressions:** no new errors or 404s; screenshot diff 0.13 / 0 / 0 %; morph reached 5/5 on both sides.

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 98.6 [96.9-99] | 98 [96.6-98.9] | -0.6 | within noise |
| scroll: frames >20 ms | 25 [22-27] | 25 [20-30] | 0 | within noise |
| scroll: frames >34 ms | 5 [4-5] | 4 [4-5] | -1 | within noise |
| scroll: frames >50 ms | 2 [1-2] | 2 [1-3] | 0 | within noise |
| scroll: worst frame ms | 65.7 [58.6-92.6] | 59.2 [58.6-66.9] | -6.5 | within noise |
| scroll: LoAF ms | 92 [69-119] | 117 [62-121] | +25 | within noise |
| morph: fps / frames >50 ms | 112.8 / 0 | 112.9 / 0 | 0 | within noise |
| idle: fps / frames >34 ms | 119.7 / 0 | 119.5 / 0 | 0 | within noise |

- Chrome does not reproduce the WebKit edge frame. That is expected: the mechanism is WebKit's event-region rebuild.
- So the Chrome A/B is a no-regression check only, and passes.

## Risks, conflicts, follow-ups

- **Touch delay (P-036, VALIDATED, after P-035).**
  - G compares touch-to-scroll start by zone (`fixes/morph-webkit/gestures/arm-scope-touch-v1.json`, hash
    ed932f9b53a2 under compiler v1). I-042 (f16c65b) moved the stroke compiler to v2 (moves of at least 40 ms;
    v1 strokes played as ~50 ms flicks), so the same script now has hash d72ee13644cc (v2, 16 strokes, ~32 s).
    P-036 G runs on v2 only, recorded before any data. No v1 run counts.
  - WebKit holds the pan only for the first preventable touchmove of a sequence (C1 CONFIRMED, claims-audit §2.9).
  - So F3 can only add a wait to strokes that start on #platform or the nav before the edge. After the edge the
    original makes every stroke wait.
  - Strokes that start on the nav (screen y < 68) are outside G's safe zone. Only F covers them.
- **Behaviour.** A morph touch that starts outside #platform and the header at the end zone would not drive the morph.
  At the measured geometry #platform covers the viewport there. Other viewports (desktop touch, landscape) are not
  checked.
- **Desktop wheel** is unchanged (window listener). Reduced motion: not measured.
- **Code comment before landing.** The patch comment says "every wheel/touch listener add/remove on the window
  invalidates the … ROOT style" and argues a touch region (F-055, REFUTED on 26.6). It must be reworded to the
  source wording before landing: wheel only, on a change of the region-type set; the listener add is the observed
  cause. That changes only comments, so the JS hash changes while the code tokens stay identical. The plan is a
  comment-only re-cut with a token-identical check (the comment-stripped diff vs 7b0d62225545 is empty), so the
  measured evidence carries over.
  - **Done (lead 15:0xZ):** `mw10e-arm-scope-c`, JS c6d3590576a7…, comment-stripped sha256 identical to this build
    (13d36da9308e…).
  - That is the landing build; P-036, F and review run on it. See `fixes/mw10e-arm-scope-c/README.md`.
- **Overlap.** nav-hit-test (co-owner of the listener code). No other topic touches JS 13300-13370.
