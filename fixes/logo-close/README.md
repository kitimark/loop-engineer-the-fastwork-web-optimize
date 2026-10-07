# Fix: logo-close (T-245): the phone logo snaps ~15 px at the end of the menu's close

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `delta.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (look and path gates; no timing, by design)
**Stage:** F (build) on g0.0c; proposal with Try-it (A = g0.0c, B = g0.0c + this)
**Device class / gate:** look and motion fix; gates are the logo's path per frame, pixels (Chrome + Simulator), counts
**Driver(s) behind the claims:** Chrome and Simulator seek harness (settable clock, the original's 680 ms tween seeked
frame by frame); no phone (unplugged), no finger test
**Topic:** user thread T-245 (2026-10-07 19:50Z): when the end-of-page menu closes, the Fastwork logo moves toward the
left, then "wraps" the last bit to its resting place
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only: one declaration in the `@media (width<=640px)` block
(g0.0c CSS 12041-12043). Standalone delta against g0.0c: `delta.diff`; full Try-it build (baseline-relative):
`fixes/logo-close-g00c/patch.diff` (CSS 2a4ab9ec9acc, JS 5c39f7a96e41 = g0.0c's).

## Cause

At width ≤ 640 the logo is drawn at 75 % with `scale: .75` and `transform-origin: 0` (the left edge):
g0.0c CSS 12037-12040 (v0 11577-11580). While the nav is morphing, `.is-morphing` sets the origin to `50%`
(g0.0c 12041-12043, v0 11581-11583). `.is-morphing` is on while `--morph > 0.001` (g0.0c JS 14048, v0 12947; the class
at g0.0c 14704 / v0 13226). Scaling around the centre instead of the left edge moves the drawn logo right by
(1 - 0.75) × 50 % × its width = 0.125 × ~123 px ≈ 15.4 px. So:

- **close:** the tween eases out (`(1 - t/680)^3`, JS 13793-13797); at t ≈ 612 ms `--morph` falls below 0.001, the
  class goes, the origin goes back to the left edge, and the logo, which had almost stopped, jumps 15.4 px left in one
  frame. That is the "wrap" the user saw;
- **open:** the same jump the other way in the first frame (16 → 31 px of extra move in one frame, hidden inside the fast
  start of the open).

Not a Safari bug, not a transition: plain CSS. The individual `scale` property is applied around `transform-origin`
(CSS Transforms 2, "Current transformation matrix": translate by the origin, translate, rotate, scale, transform,
translate back; https://drafts.csswg.org/css-transforms-2/#ctm), CONFIRMED, and Chrome and WebKit agree to 0.01 px
(below). The original site has it (v0 = g0.0c here). v14 did not: nav-earn rev 1 (`fixes/nav-earn/README.md` 218-229,
user-visible fix in v8-v14) made the origin follow the morph, and g0.0 (gpu-original step 0) reverted it with the rest
of v14's end CSS (`research/gpu-original/README.md` §2.1, last row of the table).

## The fix

```css
@media (width<=640px) {
  .start-selling-top-nav.is-morphing.svelte-1dcozpm .start-selling-top-nav-logo:where(.svelte-1dcozpm) {
    transform-origin: calc(50% * var(--morph));   /* was 50% */
  }
}
```

nav-earn rev 1's rule, restored on g0.0c: 0 at m 0 (as at rest), 50 % at m 1 (as today), so the class flip moves
nothing. `calc(<percentage> * <number>)` is a valid `<length-percentage>` (CSS Values 4, §10.7 type checking),
CONFIRMED. The logo already reads `--morph` (scene-scope R4b `--morph: inherit`, and g0.0c's `__mkW` writes it inline
on the logo every frame, JS 14583-14586), so the value is live in WebKit too (F-183).

- **Unchanged:** the open panel (m = 1: origin 50 % as before), the rest (no `.is-morphing`), desktop and tablet (no
  `scale` above 640 px; the rule sits in the ≤ 640 block), reduced motion (the morph jumps 0 ↔ 1 there, no in-between).
- **Changed, on purpose:** while the morph runs, the logo sits 0.125 × w × (1 - m) px further left than today (15.4 px
  at the start of the open and the end of the close, 0 at the open panel). Its path is now one smooth curve.

## Path of the logo (OBSERVED, in our setup; `probe/logo-path.mjs`, `probe/logo-path-sim.mjs`)

Seek harness: the original's tween is seeked at each 120 Hz frame (t = k × 8.33 ms) and at fine stops around the class
flip; the logo's on-screen left edge (`getBoundingClientRect`, after scale and translate) in CSS px. "Flip jump" = the
move between the last stop with `.is-morphing` and the first without (m 0.0010 → 0.0010 on the close, 0.0009 → 0.0011
on the open), where the curve itself moves ≤ 0.15 px.

| | close: flip jump | close: 120 Hz frame with the flip (curve's own step around it) | open: flip jump | open: first frame (next frames) |
|---|---|---|---|---|
| Chrome 430x775 / 430x815, v0 | -15.36 px | -15.38 px (0.07-0.08) | +15.37 | 19.53 px (4.20) |
| Chrome 430x775 / 430x815, g0.0c | -15.36 | -15.38 (0.07-0.08) | +15.37 | 19.53 (4.20) |
| Chrome 430x775 / 430x815, **g0.0c + fix** | **-0.13** | **-0.15** (0.07-0.09) | **+0.14** | **4.84** (4.74) |
| Simulator (iOS 26.5, 430x775), v0 | -15.36 | -15.38 (0.07) | +15.37 | 19.51 |
| Simulator, g0.0c | -15.36 | -15.38 (0.07) | +15.37 | 19.51 (4.17) |
| Simulator, **g0.0c + fix** | **-0.13** | **-0.15** (0.07) | **+0.14** | **4.81** (4.71) |
| Chrome 768x1024, all three | -0.27 | -0.32 (0.18) | +0.29 | 9.85 (9.62) |
| Chrome 1280x800, all three | -0.39 | -0.45 (0.19) | +0.31 | 10.30 (10.45) |
| v14 (morph-scroll, stepped through its spacer), Chrome / Simulator | no jump: largest step 0.36 / 0.69 px | | 0.33 / 0.63 | |

- Gate "no jump over 1 px beyond the curve's own step": g0.0c fails it by 15.3 px; with the fix the flip frame moves
  0.15 px against 0.07-0.09 px for its neighbours: pass. 768 and 1280 have no scale and no jump in any build.
- Reduced motion (Chrome 430x775): the morph jumps, the logo goes 32.00 ↔ 169.25 px in one step in both builds, the
  same values (no in-between frame for the rule to change).
- The tween runs to exactly 0, so the logo ends at the same x as before the open (32.00 px at 430) in every build.
- Plot: `out/logo-close/plot-430x775.png` (red g0.0c, blue fix; left the open's first 120 ms, right the close's last
  200 ms); frame strip `out/logo-close/strip-close.png` (Chrome 430x775, close at 520 / 560 / 600 ms and the rest; top
  row g0.0c, bottom row the fix). Both go with the proposal.

## Pixel gates (OBSERVED; `fixes/g0-revert/gates/g0px.mjs` / `g0sim.mjs`, end phase, arms g0.0c and g0.0c + fix)

33-51 seek stops a width (closed rest, open 0-680 ms, open + held, close 0-680 ms, a reversal); each pair of shots is
split by `probe/outside-logo.mjs` into the logo's band (the nav bar row, css y 25-56, x 0-300) and the rest, leaving
out the gates' kept-v14 masks (countdowns, #platform glints) as the gates do.

| | logo band | everything else (outside the masks) | A/A or repeat |
|---|---|---|---|
| Chrome 430x775 | differs at every stop with 0 < m < 1 (the logo's new path), equal at m 0 and m 1 | max 1-3 levels at the stops showing the panel (the same 2595 px at m 1 as in the A/A); 3 stops with load-phase noise (closed-rest #platform max 14; open-520, open-done panel picture, max 19-140) | A/A g0.0c vs g0.0c: same max-1 panel pattern; repeat A/B (B loaded first): open-520 / open-done clean, the noise moved to close-320, close-520, rev-open-300. Every stop is at the A/A floor in at least one run |
| Chrome 430x815 | as 430x775 | **T0 at every stop** but 2 px (max 1) at the rest and rev-close-520 (#platform glints, masked region's edge, max 6) | |
| Chrome 768x1024, 1280x800 | identical path (the rule is inside the ≤ 640 block, so the computed style is the same) | max 1-6 levels in the panel; 768 #platform cycler noise (F-336) up to 251 and nav noise at 3 stops (max 21-61) | these widths are an A/A by construction: they show the floor |
| Chrome reduced motion 430x775 | equal | 2483 px, max 1, the same at every stop (load) | |
| Simulator 430x775 (iOS 26.5) | differs at the in-between stops (the new path), equal at open 680 / held / closed | **max 1 level** at every stop | |

So outside the logo the fix is T0 up to the measured load-to-load floor (Chrome max 1-6 levels at panel stops, phase noise from the
real-time panel and #platform content; Simulator max 1). Inside the logo band the difference is the intended new path.

## Work and layers

- Simulator Timeline counts at the end (`g0count.mjs`, real clock, A B A = g0.0c, fix, g0.0c; descriptive):

  | per rendering frame | open: style / layout / paint | close: style / layout / paint | rests |
  |---|---|---|---|
  | g0.0c (run 1) | 0.89 / 0.63 / 4.91 | 1.34 / 1.02 / 6.02 | closed 0 / 0 / 0, open 0.44 each |
  | g0.0c + fix | 0.81 / 0.52 / 4.42 | 1.40 / 1.02 / 5.71 | closed 0 / 0 / 0, open 0.43 each |
  | g0.0c (run 2) | 1.21 / 0.94 / 5.00 | 1.42 / 1.02 / 5.58 | closed 0 / 0 / 0, open 0.45 each |

  The fix sits inside g0.0c's own run-to-run range everywhere.
- By construction: `transform-origin` does not affect layout, and the logo is already restyled every frame of the
  morph (its `left` and `translate` read `--morph`), so no element is added to any frame's style work. It already has a
  transform (`scale`, `translate`), so no new layer. No JS change.

## Other v14 end-of-page nav fixes that g0.0's revert dropped (for the lead; not fixed here)

From `research/gpu-original/README.md` §2.1 and `fixes/nav-earn/delta.diff`, checked against g0.0c's CSS/JS:

1. **The Join's late collapse at the open** (nav-earn rev 1 `transition: none` on the button under `.is-morphing`, then
   rev 3's cut-and-slide `.is-earn-hidden`, and PR-032 rev 3's timed fade, user-accepted 04:44Z): g0.0c is the
   original's motion again by the lead's option (b): the button keeps width ~0.6 s into the open, the language switch
   sits ~118 px from the right edge and then slides (nav-earn README "What the user saw" 1, F-222). fix-join-fade owns
   the Join now.
2. **`.is-morphing` on at `m > 0` instead of `> 0.001`** (nav-earn rev 3, F-243; g0.0c JS 14046-14048): in the close's
   last ~68 ms the bar's `:not(.is-morphing)` width/background transitions come back and restart for sub-pixel
   changes. Sub-pixel (we see 0.12 px at 1280 after the close) and some extra style work; not visible as far as we know.
3. The language-switch `translate` under `.is-morphing` (nav-earn rev 3) is replaced by the original's gap closing:
   same picture, drawn with layout; not a visible regression.

Nothing else in v14's nav-earn end rules was user-visible.

## Files

- `delta.diff`: the change against g0.0c (one declaration + a 2-line comment).
- `../logo-close-g00c/patch.diff`: g0.0c + the fix, baseline-relative (Try-it B).
- `results.json`: the numbers above.
- `probe/`: `logo-path.mjs` (Chrome), `logo-path-sim.mjs` (Simulator), `plot.mjs`, `strip.mjs`, `outside-logo.mjs`
  (splits the gates' diff images into the logo's band and the rest, leaving out the gates' kept-v14 masks).
  Arms are built in `out/g0/` (`g00c` from `fixes/platform-corners-g00b/patch.diff`, `lcfix` = the overlay, `v14` from
  `fixes/cm-v14/patch.diff`), hashes checked by every probe. No measurement code changed.
