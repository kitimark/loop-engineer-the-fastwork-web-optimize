# Fix: nav-fade

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (counts and look; no timing, memory "defer-timing-focus-call-tree"); counts n=2 on v9-final,
Simulator batch 9 pending
**Stage:** D (attribution card below; sent to the lead 2026-10-05, reworked on the landed v9-final the same day)
**Device class / gate:** phone-only for the visible symptom; the cost removed is Chrome- and Simulator-measurable (paints)
**Driver(s) behind the claims:** Chrome and iPhone Simulator count probes and frozen-frame look checks; phone G pending
(slot ticket to mgmt-ops-10 after P-129 and P-130)
**Topic:** nav-fade (user T-183 #4/#7: the top nav's "Join waitlist" button and language switch look not smooth as
they fade in/out at the top and the end of the page; "doesn't raise the frame lag, just animation doesn't smooth")
**Base / control:** C = the landed v9-final, `fixes/v9-best` overlay from `fix.mjs apply v9-best --reset` on main
d4830f1e (v9-best patch at 8b5ce9b3): JS 647c9ef2b1e2 / CSS e1359ab9994a (the served sha-256, first 12 hex)
**Result:** JS a03872195d3f / CSS 9646fc3da77a. Delta on v9-final: `nav-fade-on-v9final.diff` (158 lines, sha-256
f41d2854aa90). `patch.diff` is against the frozen snapshot and therefore also carries all of v9.
**v9-final + 7d (main 189ca7ed, JS 1b2eecc66011, CSS unchanged):** the delta applies cleanly (JS 2ed12145e856 / CSS
9646fc3da77a, `node --check` ok). 7d's 15 lines are all in the menu swipe's touch handlers (`__msSettle`, `__msTouchEv`,
JS 14167-14290): none writes the nav, the Join button or the language switch, and the probes send no touch events, so
the measurements below hold for +7d (not re-measured).
**Files touched (delta):** `/_app/immutable/nodes/2.DyWL8TcE.js` (nav template ~13778: two spans around the earn box;
`__ewMeasure` ~13936: writes `--fw-nf-w`; element refs ~14577), `/_app/immutable/assets/2.gBuqKVzi.css` (Join reveal
rules ~12039-12140, paused-scene list ~12380)

## Why it lags

The Join button's reveal at the 72 % flip (pill -> bar) has five moving parts. Four run on the compositor (button
`translate` and the switch wrap's `translate` from `__ewGo`, opacity, the sheen's `transform`). The fifth, the reveal
sweep, is a CSS animation of `mask-position` on `button.is-earn` (0.98 s after 0.52 s; v9-final CSS 12060-12082), and
that one runs on the main thread in both engines:

- WebKit accelerates `opacity`, `filter`, `backdrop-filter`, `transform`, `translate`, `scale`, `rotate` and neither
  `mask-position` nor `clip-path`. CONFIRMED: WebKit `Source/WebCore/css/CSSProperties.json`
  (safari-7622.2.11.14-branch, read via gh): `"animation-wrapper-acceleration": "always"` at lines 6578, 9452, 9813,
  11154, 11289, 11309, 11333; none at mask-position (5810) or clip-path (3902).
- Chrome repaints the button's mask layer on every frame of the sweep: 61 paints per reveal (63 with the button's own
  layer), whether the page holds still (topIn) or scrolls through the flip (glideThru), so the cost follows the flip's
  clock, not scrolling.

When the main thread is busy at the flip (in the Simulator the flip lands in 110-210 ms main-thread tasks), the sweep
holds and jumps while the compositor parts keep gliding: the parts of one button drift apart, with no dropped frames.
That is the user's description.

The hide and the end morph have a second main-thread part, the pill clip (`clipPath` Web Animation on the earn box,
`__ewGo` v9-final JS 13942-13978, keyframes at 13970): most of Chrome's end-of-page button paints. It is not changed
here (see "Not done").

## What changed

The same mask (same gradient `--nav-earn-mask`, 240 % of the button's width, same 0.98 s / 0.52 s / easing) now sits on a
new wrapper span `.fw-nf-mk`, 2.4 W wide. The extra width is content-box padding of 1.4 W, taken back by a negative
margin, so the button's width and intrinsic width do not change. W is `--fw-nf-w`, the button's border-box width,
written in the existing ResizeObserver callback `__ewMeasure`, where layout is clean, and only when it changed.

- `.fw-nf-mk` moves with `translate` from -7/12 of its width to 0. That is the mask image's left edge from -1.4 W (the
  original's `mask-position: 100%`) to 0.
- Its child `.fw-nf-mki`, which holds the earn box and the sheen, moves the other way from +1.4 W to 0, so the content
  stands still and only the mask moves. These are the original's frames, drawn with accelerated properties.
- The mask is applied only while the sweep runs (and during its delay): a separate constant `mask-image` animation
  with fill `backwards`. At rest the original's mask is opaque over the whole border box. The button's new
  `clip-path: inset(0 round 999px)` does that job, and also clips the end-of-page blur to the rounded border box as
  the mask did. Leaving the mask on at rest made Chrome repaint the mask layer whenever the clip animation repainted
  under it: +35 paints at the page end (variant `nav-fade--maski`, rejected).
- Reduced motion: every new rule sits in the original's `prefers-reduced-motion: no-preference` block. With reduce,
  the two spans are plain boxes.
- The two spans join the paused-scene list next to `.start-selling-top-nav-btn`. Their animations end (fill
  `backwards`), so nothing stays paused at rest (F-272 does not apply).

## Why that is faster

The sweep no longer restyles and repaints the button on every frame. It is two `translate` animations that both
engines run on the compositor, next to the button's other compositor parts. A busy main thread can no longer freeze the
sweep while the rest of the button moves on. The constant `mask-image` animation runs on the main thread but changes no
value, so it cannot make anything jump.

## Before / after (counts, no timing; control = landed v9-final)

Chrome (430x775 DPR 3, CPU 6x, shared lane), paints of the Join button's layers per scene (button + its mask layer in C;
button in nav-fade), batch 8, n=2:

| scene | C | nav-fade |
|---|---|---|
| topIn (flip, page still) | 63, 63 | 2, 2 |
| glideThru (flip while scrolling) | 63, 63 | 2, 2 |
| end morph | 46, 47 (38-39 button + 8 mask layer) | 40, 41 |
| language switch, end | 31, 32 | 32, 32 |

Chrome style recalcs / layouts per scene (n=2): topIn 176, 176 / 62, 65 vs 181, 250 / 68, 69; glideThru 404, 408 / 70, 71 vs
407, 413 / 70, 73; end 446, 464 / 133, 134 vs 439, 480 / 132, 134. topIn is a few higher in nav-fade in both runs (+5
recalcs and +3 to +7 layouts, one run +74 recalcs); that is not a per-frame cost (the sweep has ~118 frames at 120 Hz);
cause not traced.

Simulator (WebKit), whole-page Timeline Paint records per scene:

Simulator (WebKit), whole-page Timeline records per scene, batch 8, n=2 (batch 9, 5 more runs per scene, pending: it
confirms or voids the Simulator Paint claim; it does not change the look verdict):

| scene | C Paint | nav-fade Paint | C recalcs / layouts | nav-fade recalcs / layouts |
|---|---|---|---|---|
| topIn | 564, 596 | 393, 422 | 117-123 / 112-118 | 128-181 / 105-129 |
| end | 956, 1153 | 966, 1092 | 223-242 / 339-350 | 240-273 / 381-416 |

topIn Paint does not overlap (the reveal's saving). End Paint overlaps on this base (on v9c, n=3, it did not: 1152-1189
vs 954-991). End layouts are higher in nav-fade in both runs, which also rendered more frames (233-245 vs 222-225).
Recalcs at topIn are higher in nav-fade in both engines (Chrome 181/250 vs 176/176, Simulator 128-181 vs 117-123):
UNRESOLVED, cause not traced; the size says it is not a per-frame cost.

## Look check (PR-010 T2, frozen frames, nav region, A/A = C vs C2, control = landed v9-final)

Animations in the nav are paused and set to the same time on both sides; everything else on the page is paused.
Five numbers per scene (worst frame): largest shade beyond A/A, share of the screen, area in css px2, edge or fill,
static or moving.

| engine / scene | frames | largest shade | share of screen | area css px2 | edge/fill | static/moving |
|---|---|---|---|---|---|---|
| Chrome topIn (sweep, t 720-1440) | 20 | 55 (t 800) | <= 0.004 % | <= 14 | edge | moving |
| Chrome topIn (rest, t 1520-1600) | | 59 | 0.005 % | 15 | edge | static (ring at the rounded edge) |
| Chrome topOut | 11 | exact (T0/T1) | 0 | 0 | - | - |
| Chrome endOut | 13 | 24 | 0.006 % | 19 | edge | static (nav outline, same at every t) |
| Chrome endIn | 13 | 12 | 0.002 % | 7 | edge | moving (t 540-720) |
| Simulator topIn (sweep, t 640-1120) | 20 | 68 (t 800, 81 css px2) | <= 0.030 % | <= 118 (t 960, shade 34) | edge | moving |
| Simulator topIn (rest, t 1200-1600) | | 42 | 0.005 % | 14-19 | edge | static (ring) |
| Simulator topOut / endOut / endIn | 37 | exact (T0/T1) | 0 | 0 | - | - |

All 57 frames per engine are T0/T1 or T2 (fill 0 everywhere, edge <= 68, <= 0.03 % of the screen, <= 118 css px2).

Moving parts against the original, per frozen frame (geometry from the same frames, device px, DPR 3; `probe/geo.mjs`):

| part | Chrome worst abs(nav-fade - C) | Simulator worst |
|---|---|---|
| mask edge (mask image's left edge, relative to the button) | 0.01 | 0.04 |
| Join button x | 0 | 0 |
| earn box x | 0.01 | 0.35 (during the delay, 0 by t 1360) |
| earn box width | 0 | 0 |

Every moving part stays within 1 device px of the original at every frame (A/A 0 in both engines).

Reduced motion: Simulator 33 of 33 frames exact. Chrome 28 of 33 exact; 5 endOut frames have 2 isolated device px
(shade 20, 0.2 css px2) at x 94 and 199 css px, left of the Join button and the switch (A/A 0 in this run).

Probe notes:
- Frozen frame t=800 ms of the reveal: WebKit shows the button's `translate` WA past its 680 ms end shifted (C, C2 and
  every arm that keeps that WA). This is a probe artifact (OBSERVED), not used for any verdict.
- Before 2026-10-05 ~07:20Z the probe also rewound long-finished animations at the end scenes; those frames are not used.
- The geometry fields were added to `probe/motion.mjs` on 2026-10-05 (`geoV: 2` uses the button's fractional width for
  the original's mask edge; `geo.mjs` rescales the Chrome p8 run, made before that change). No tool in `tools/` changed:
  `measurementCodeChanged: false`.

## Earlier attribution runs (control v9c = v9-final + the morph-close-peak rule, batches 5-7)

v9c's CSS (bdecf48c5b32) differs from the landed v9-final only by a 6-line rule on the morph panel's visibility; the
nav rules are identical. These ablations were run there:

| arm | removes | Chrome Join paints topIn / glide / end | Sim topIn Paint |
|---|---|---|---|
| C (v9c) | - | 60-61 / 61 / 38-41 | 564-616 |
| **maskj** (= nav-fade) | sweep repaint, mask only while sweeping | 2 / 0 / 39-41 | 427-450 |
| `--maskr` / `--maski` | sweep repaint, mask left at rest | 2-3 / 0 / 59-79 | 412-459 |
| `--clip` (B) | the clip WA's repaint (clip on carrier spans) | 61 / 61 / 10-11 | 564-600 |
| `--abr` / `--abri` (A+B) | both | 2 / 0 / 10-11 | 389-434 |
| `--layer` (negative sibling) | nothing: `will-change: transform` on the button | 61 / 61 / 33-34 | 590-620 |

(Chrome counted only the button's main layer there; batch 8 counts every Join layer, hence 63 vs 61.)

## Cards (protocol v2)

```
ATTRIBUTION nav-fade · the Join button's reveal sweep at the 72 % flip · verdict asked: NAMED
control C = landed v9-final (fixes/v9-best, fix.mjs apply v9-best --reset at d4830f1e): JS 647c9ef2b1e2 / CSS e1359ab9994a;
  arm = C + nav-fade-on-v9final.diff (f41d2854aa90): JS a03872195d3f / CSS 9646fc3da77a; +7d: delta applies, 7d cannot touch the fade
1 stage: main-thread style + paint of the reveal sweep (mask-position CSS animation, v9-final CSS 12060-12082)
2 code: v9-final CSS 12060-12082, 11953; JS 13930-13978 (__ewMeasure, __ewGo; the clip WA not changed)
3 ablations (v9c, batches 5-7): positive = maskj, negative sibling = layer (61 / 61 / 33-34); confirmed on v9-final (batch 8)
  axis: time since the class flip; decoupling run glideThru = topIn -> flip clock, not scroll
4 device class: phone-only symptom (busy main thread at the flip); cost Chrome- and Simulator-measurable
look: T2 in both engines (table above), every moving part within 0.35 device px of C at every frame; reduced motion exact
  (Chrome: 2 isolated px outside the controls in 5 frames)
counts on v9-final (n=2): Chrome Join paints 63 -> 2 (topIn, glide), 46-47 -> 40-41 (end); Simulator topIn Paint 564-596 ->
  393-422, end overlapping; Simulator batch 9 pending (confirms or voids the Simulator Paint claim only)
claims: P1 CONFIRMED (WebKit CSSProperties.json); P2 Simulator counts stand in for the phone: UNRESOLVED, decisive check =
  phone slot (G); P3 t=800 frozen-frame shift: OBSERVED probe artifact; P4 the topIn recalc rise (Chrome 181/250 vs
  176/176, Simulator 128-181 vs 117-123): UNRESOLVED, not per frame, cause not traced
```

**Scenarios not run:** idle after scroll · reload while scrolled · early input · scroll up · toolbar resize · rubber
band. Desktop width not checked (the rules are the same; the button is wider).

## Not done / follow-ups

- **The pill clip (B):** carrier spans instead of the `clipPath` WA. Chrome end-of-page button paints 40 -> 10. Not in
  this fix: in the Simulator the hide's first frame puts a letter stroke 1 device px off (shade 226, over T2), and it
  is not exact under reduced motion (a faint ring). A pixel-snapped version would be a separate step.
- **Language switch:** 31-32 paints at the page end in every arm, from its `is-on-dark` background / border / colour
  transition (0.24 s, v9-final CSS ~11603-11619), main thread in both engines. A compositor version (cross-fade) cannot
  match mid-transition, so it would be a proposal.
- Phone: slot ticket to mgmt-ops-10 after P-129 and P-130 (Xcode-induced Serious, G driver).

## Risks, conflicts, follow-ups

- Owners: the morph tween is fix-morph-gpu's / fix-nav-morph's; this patch touches only the Join button's reveal (and
  writes one custom property in `__ewMeasure`, which nav-earn rev 3 owns: same function, one added read of the
  button's width inside the ResizeObserver callback).
- The button now has `clip-path: inset(0 round 999px)` while not in the pill state. It changes nothing at rest beyond
  the T2 ring above.
