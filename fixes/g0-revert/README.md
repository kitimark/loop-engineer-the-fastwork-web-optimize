# Fix: g0-revert (g0.0 = v14 with the original end-of-page; g0.0b = g0.0 with the Join's 8 px rise removed)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** g0.0 landed (f75c1707). g0.0b (PR-034 rev 2) measured: the pixel and state gates pass (section "g0.0b"); no timing A/B, by design
**Stage:** F (build) for step 0 of `research/gpu-original/README.md` §4 (signed design b7117d64)
**Device class / gate:** look and behaviour revert; gates are pixels (Chrome + Simulator), state parity, counts
**Driver(s) behind the claims:** Chrome seek harness (wheel gesture, stubbed clock), Simulator seek harness, Simulator Timeline counts
**Prediction:** none (step 0 is the reference build for g0.1; it is not meant to be faster)
**Topic:** user T-228 #60/#62: roll back only the end-of-page scroll behaviour to v0, keep v14 above the end;
PR-034 rev 1 decision (changes requested, option g0): add the Join waitlist fix (no lift while it fades), = g0.0b
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (nav component, pretty lines ~14040-15580 of v14),
`/_app/immutable/assets/2.gBuqKVzi.css` (nav end rules ~11867-12040, appended end blocks ~12306-12594 of v14)

## g0.0b (PR-034 rev 2): the Join without the lift

The user's PR-034 rev 1 decision (changes requested, option g0) asked to apply the Join waitlist fix: the button lifted
up while it faded out as the end-of-page menu appeared. That is PR-027 rev 5 "nolift", which the user accepted
earlier (T-204 #10/#13): the 8 px rise goes, the blur and the fade stay (lead, 2026-10-07).

**Change.** One CSS declaration fewer than g0.0: the end rule
`.start-selling-top-nav:not(.is-hero-pill) .start-selling-top-nav-btn.is-earn` no longer sets
`transform: translateY(calc(var(--earn-out) * -8px))` (v0's line 11488). The JS is g0.0's, byte for byte.

**Mechanism** (CSS 11477-11495 of the baseline). v0 drives `transform` and `filter` from `--earn-out = clamp(0, m/0.2, 1)`
with no transition, while `opacity` transitions over 0.32 s after a 0.12 s delay. So as the menu starts to open
(m reaches 0.2 after ~49 ms of the 680 ms tween) the button jumps 8 px up and blurs while it is still fully opaque, and
only then fades; on the close it comes back from 8 px up. Without the transform it blurs and fades in place.

**Reference.** v0nl = the baseline with only that line removed (`out/g0/v0nl`, CSS e1e6f26e2fc8): nolift's look on
the original structure. g0.0b's Join must equal v0nl's; the rest of the end must equal g0.0's.

**Join mid-fade stops** (`g0px.mjs join` / `g0sim.mjs join`, new). The seek stops of gate 1 are settled states: the
Join is already transparent at every open stop, so they never show the lift. The join phase opens from the closed rest
with the clock jumped to t1 in one frame, then holds the nav's CSS transitions at `currentTime` ct: `24:40` (m 0.10,
`--earn-out` 0.51, inside the 0.12 s opacity delay), `80:40`, `80:120` (m 0.31, `--earn-out` 1; before and at the end
of the delay), `80:200`, `80:300` (fading). Arms: v0, v0nl, g0.0b, g0.0, v0nl again (A/A).

The button's own rise while visible (opacity > 0.01; `rise.mjs`: the button's top against the closed rest, minus the
nav bar's own move):

| | v0 | g0.0 | v0nl | g0.0b |
|---|---|---|---|---|
| Chrome 430x775 / 430x815 | 8.00 px | 8.00 px | 0.00 | 0.00 |
| Chrome 768x1024 / 1280x800 | 8.00 | 8.00 | 0.00 | 0.00 |
| Simulator | 8.00 | 8.00 | 0.00 | 0.00 |

The nav bar itself moves 1.27 px up at 430 (-1.25 px at 768/1280) at the same stop in every arm; that is v0's bar,
not the button (PR-027 measured 3.7 px for the same reason).

Pixels at the Join stops (unmasked, all 7 stops: closed rest, the 5 mid-fade stops, closed):

| | g0.0b vs v0nl: max level, px > 8 | v0nl A/A: max, px > 8 | g0.0 vs g0.0b (the lift): max, px > 8 (share) |
|---|---|---|---|
| 430x775 | 1, 0 | 1, 0 | 140, 21207 (0.71 %) |
| 430x815 | 2, 0 | 1, 0 | 143, 29883 (0.95 %) |
| 768x1024 | 2, 0 | 1, 0 | 153, 17559 (0.56 %) |
| 1280x800 | 1, 0 | 1, 0 | 59, 3574 (0.35 %) |
| Simulator | 3, 0 (max 4 inside the masks) | 2, 0 | 89, 14646 (0.41 %); at `join-24-40` the button sits inside the panel countdown's 40 pt mask (masked max 140) |

So the Join region is T2 against nolift's accepted look (max 1-3 levels, 0 px over 8, at the A/A floor of 1-2), and
the lift is the only thing g0.0b changes there. State parity (classes, m, fade, panel, gap, Join width and x) 0
mismatches; the Join's computed transform is `none` in v0nl and g0.0b at every stop.

**End of the page against g0.0** (gate 1's 33 seek stops, arms v0nl, g0.0b, g0.0; `out/g0/gates-b/end`):

| width | g0.0b vs g0.0: max, px > 8 (where) | g0.0b vs v0nl: max, px > 8 | g0.0 vs v0 (gate 1, for reference) |
|---|---|---|---|
| 430x775 | 29, 2396 (close-320, nav) | 49, 207 (0.007 %) | 49, 22 |
| 430x815 | 30, 2452 (close-320, nav) | 39, 38 | 39, 38 |
| 768x1024 | 140, 449 (close-560, nav) | 9, 444 (0.014 %) | 4, 0 |
| 1280x800 | 44, 1558 (close-400/480, nav) | 54, 1 | 54, 1 |
| Simulator | 16, 1360 | 2, 0 | 2, 0 |

- Every g0.0b-vs-g0.0 difference over 2 levels sits in the nav's rect at the close and reversal stops where
  `--earn-out` falls below 1 again (m < 0.2, the last ~280 ms of the close): the Join comes back without the lift.
  That is the exempted "Join region during the fade". Outside the nav, g0.0b and g0.0 differ by at most 1-2 levels,
  except two loads: 768 `rev-close-680` (#platform, 69598 px, max 255, from the g0.0 load: the agents-ask cycler on
  real `setTimeout`, as in gate 1's 768 A/A) and 430x775 `closed-rest` (#platform, 52k px, max 14, from the g0.0b
  load: v14's kept PR-009 idle look, gate 1).
- Against v0nl, g0.0b keeps exactly g0.0's distance to v0 (the kept v14 parts, section "R4a/R4b"): 768's 444 px over 8
  are at `open-80` in the nav glass (max 9).
- State parity 0 mismatches at every stop and width; page height equals v0's.

**Above the end and reduced motion.** The only change is a declaration of the end rule, and above the end that rule computes `translateY(0)` (`--earn-out`
0), so the expectation is no pixel change there. Re-run of gate 2 with arms v14, g0.0b, g0.0, v14 (20 y stops a width,
`out/g0/gates-b/top`):

| width | nav rect: g0.0b vs g0.0 / vs v14 | g0.0b vs g0.0: max px > 8 (outside the nav) | v14 A/A: max px > 8 |
|---|---|---|---|
| 430x775 | T0 / T0 at all 20 stops | 23055 (y1289) | 31921 |
| 430x815 | T0 / T0 | 143735 (y3506, #platform glints) | 179656 |
| 768x1024 | T0 / T0 | 36114 (y4298, agents-ask cycler) | 47477 |
| 1280x800 | T0 at 19 stops; y3655 558 px from the g0.0 load (v14 vs g0.0b there: 0) / T0 | 116257 (y3987) | 119058 |

All the rest sits outside the nav, in the content that moves on real time (hero people, `#platform` glints and
cycler, lazily decoded photos) and stays inside the v14 A/A envelope per width; per stop, some stops exceed their own
A/A stop in both directions (g0.0 vs v14 does the same, gate 2). Class parity of the nav 0 mismatches. The Join's
box above the end is v14's (gate 2 for g0.0).

Reduced motion (arms v0nl, g0.0b, g0.0; 21 stops): the morph jumps as in v0.
- 430x775: g0.0b vs v0nl max 2 levels at every stop but `close-680` (#platform, 49671 px, max 51, 52 px over 8:
  v14's kept PR-009 idle look, which g0.0's load shows at `close-0`); the nav rect differs by max 1 level.
- 1280x800: g0.0b vs v0nl max 8, 0 px over 8; g0.0b vs g0.0 max 1.
- No transition on the Join under reduced motion (as v0): the button changes in one step, with or without the lift.

**Errors.** No exception and no `hydrat` message in any load (Chrome and Simulator); the only console lines are the
baseline's four missing `.avif` files, as in gate 3.

**Shots for PR-034 rev 2** (`out/g0/pr/`, not committed): `c-g00-join.png` / `c-g0b-join.png` (Chrome 430x775,
`join-24-40`, the nav's right half) and `s-g00-join.png` / `s-g0b-join.png` (Simulator, same stop). Closed, mid and open
shots of rev 1 stay: at those stops g0.0b equals g0.0 within 1 level outside the masks (the Join is either at rest or
transparent there).

Pins: JS 5c39f7a96e41 (unchanged), CSS a2351bd219ae (`HASHES`). Tool changes: `gates/g0px.mjs` and `gates/g0sim.mjs`
gain the `join` phase (the Join's top, transform and filter in the state); `gates/rise.mjs` (new);
`gates/summary.mjs` takes `SIMPREFIX`/`GATESKEY` and a `navMax` column. No measurement code changed.

## What g0.0 is

v14 (JS d23ee885d54f / CSS 4fafb83f1e72, `fixes/BEST_BUILDS.md`) with v0's end-of-page behaviour:

- the original 680 ms menu tween (`ZM`, ease-out cubic `1-(1-t)^3`, target from the sign of the wheel/touch delta),
  with the page held: v0's jack (`wheel`/`touchmove` with `passive:false`, capture on window, attached by the 200 %
  IntersectionObserver or while the menu is open) and v0's pin (`L`: `scrollTo(s)` while `C()`);
- the original Join motion at the end (option (b), below);
- the original nav look at the end: PR-030's glass end card (CM) is gone with the rest of v14's end code.

Everything above the end is v14's. `patch.diff` is baseline-relative (v0 → g0.0, +2356 / -315); against v14 the
change is 944 changed JS lines and 347 CSS lines, almost all deletions.

### Removed (v14's end machinery)

- morph-scroll: `__ms*`, the `.fw-ms-end` spacer, `html.fw-ms` (the page is v0's height again: `maxScroll` column);
- with it, v14's sticky `#platform` on touch phones (`html.fw-ms .start-selling-platform { position: sticky }`, v14 CSS
  ~12309-12317). This is end-of-page behaviour (it held the page under the morph), so it reverts too (lead, 2026-10-07):
  the section before the menu scrolls as in the original again. It is the only visible change above the end, and only
  in WebKit: Simulator `y3561`/`y4155` v14 vs g0.0 up to 690k px, max 232 levels (v14 A/A 30k px, max 32). The
  diagnostic run `sim-diag-noms` (v14 with `html.fw-ms` removed before the shot) drops `y4155` to 4166 px, max 28,
  32 px over 8 (OBSERVED; why sticky renders differently in WebKit is UNRESOLVED). g0.0 equals v0 there
  (`sim-diag-plain` g0~v0: max 33 / 84 levels, the PR-009 residue). Chrome at 430 shows no difference;
- CM, PR-030's GPU end card: `__cm*`, `html.fw-cm`, K6's `fw-cm-pre` layer pre-build;
- reveal: `__rv*`, `data-fw-rv`;
- `__osb`, the `__pinY`/`__pinMax` pin rework, the touch listeners on `#platform` and the header;
- the end terms of the nav state `_` (hit-skip while CM / morph-scroll ran); left in, they would throw (design §2.3).

### Kept (v14 above the end, and v14 parts the end shares)

- nav-hit-test `F()` (`elementsFromPoint`) and the nav-hit cache `_` (`__ns*`);
- the PR-021 earn animator (`__ew*`, at the top only) and its earn-box span;
- R4a/R4b: `@property --morph` / `--morph-fade` and the `--morph: inherit` consumers; `__mkW`, the inline `--morph`
  writer on `B`, `re`, `ie`, `oe`, `__mkP` and `__ewWrap()` (F-183), minus its CM branch;
- the lazy panel mount (`__mnt`), c3's `S()` with `data-fw-pf-paused`, `__cdPanelShown` and the panel countdown props;
- `#platform`'s `opacity: min(var(--morph-fade), 0.9999)`.

### Coupling fixes (where v0's code meets v14's)

- `E` (is-morphing) is back to v0's `s(x) > 0.001` (F-243's `> 0` reverted with the end; v0's sub-pixel restarts in
  the close's last ~68 ms come back, as in v0).
- `__ewGo` loses its CM-end branch; the earn gap is `pill || was` again.
- `__nsOnResize` only refreshes `__nsVh`, `__nsY` and drops the geometry (no CM/morph-scroll state left).
- The hit-test gate `__h` keeps v14's terms minus the CM/morph-scroll ones.
- `__fwMorphDrive` (the M driver) scrolls to v0's end (`scrollHeight - innerHeight`) and arms v0's `s`.
- Template: `"is-morphing": s(E)` without `fw-cm-pre` and `is-earn-hidden`; `__ewGo(!s(O), s(O))`; `__mkW(e['--morph'])`.

### The Join, option (b)

PR-021 moved the Join's padding into an earn-box span and put the background on the box, so v0's end rules can't
come back as they were (design §3.2). g0.0 keeps PR-021's structure at the top and redraws v0's end motion on it,
under `.start-selling-top-nav:not(.is-hero-pill)`:

- actions gap `(1 - clamp(0, --morph / 0.2, 1)) * 8px` (4 px at ≤640);
- button `max-width: (1 - --earn-out) * 11rem` (9.5rem at ≤640), `opacity: 1 - --earn-out`,
  `translateY(--earn-out * -8px)` (g0.0 only; g0.0b drops it, below), v0's transitions (max-width 0.68 s, opacity
  0.32 s after 0.12 s);
- the earn box's `padding-inline: (1 - --earn-out) * 24px` (16 px at ≤640), 0.68 s;
- `prefers-reduced-motion`: no transition on these (as v0).

At every Chrome seek stop the Join's width and x equal v0's to 0.01 px (state parity below).

## Gates

Harness (`fixes/g0-revert/gates/`, run only in the shared lane, `--weight probe|simulator`):

- `g0px.mjs` (Chrome, DPR 3 at 430, touch at 430): a preload stubs `performance.now` and the rAF timestamp with a
  settable clock, `Date.now` is fixed to a whole second after load; the gesture is one synthetic wheel event (±120).
  End phase: closed rest, open stops 0-680 ms, open done, held (a second wheel into the pin), close stops, closed,
  and a reversal (open to 300 ms, then close). Each stop waits for transitions to settle, pauses running CSS
  animations at `currentTime` 1000, screenshots, unpauses. Top phase: 20 y stops from the top to `#platform`.
- `g0sim.mjs`: the same method in the iOS Simulator (Safari, stub installed by evaluate, `simctl` screenshots).
- `g0count.mjs`: Simulator Timeline counts per window (rest, open, rest open, close, rest closed).
- `summary.mjs`: the tables below, `--write` stores them in `results.json` (`gates`).

Masks (lead's pre-ruling (a)/(b): v14's versions kept, so masked in the v0 comparison and compared against v14):
`.waitlist-closing-countdown` (panel and page countdowns), `.start-selling-platform-row-title-doc/-earn/-secure/-organized`
(PR-009 sweep titles), `.start-selling-platform-secure-network-dash`; each grown by 30 CSS px in Chrome and 40 pt in the
Simulator. `maskedDiffMax` reports what the masks hid.

Tolerance: T0 for state (classes, `--morph`, fade, pointer-events, panel aria/inert/scene, gap, Join box, scrollY);
pixels T0 or, per the lead's ruling (c), T2 (largest shade ≤64 fill / ≤128 edge, share of pixels >8 levels ≤0.5 %
beyond A/A).

### Gate 1: end of the page against v0 (Chrome seek stops, masks above)

33 stops per width (closed rest, open 0-680 ms by 80, open done, held, close 0-680, closed, reversal open 300 ms then
close 40-680); A/A = v0 against a second v0 server in the same run. "px > 8" = unmasked pixels more than 8 levels off.

| width | g0.0 vs v0: max level | px > 8 (share) | state mismatches | v0 A/A: max level | A/A px > 8 | page height v0 / g0.0 |
|---|---|---|---|---|---|---|
| 430x775 | 49 (open-480) | 22 (0.0007 %) | 0 of 33 | 2 | 0 | 5189 / 5189 |
| 430x815 | 39 (rev-close-40) | 38 (0.0012 %) | 0 of 33 | 1 | 0 | 5229 / 5229 |
| 768x1024 | 4 | 0 | 0 of 33 | 248 (rev-close-520, #platform cycler) | 27201 | 5337 / 5337 |
| 1280x800 | 54 (open-640) | 1 (0.0001 %) | 0 of 33 | 2 | 0 | 7794 / 7794 |

State parity: classes, `--morph`, `#platform` fade and pointer-events, panel aria/inert/scene, actions gap, the Join's
box (width and x to 0.01 px), scrollY. 0 mismatches at every stop and width. The closed rest at 430 differs from v0
inside `#platform` outside the masks (52k px, max 14, 6 px > 8). Against v14 it is 1 px, so it is v14's kept PR-009 look.

**Simulator** (iPhone Safari, 14 stops: closed rest, open 40-680, held, close 80-500, closed; arms v0, g0.0, v0):
g0.0 vs v0 max 2 levels unmasked, 0 px > 8; v0 A/A the same (max 2, 0). State parity 0 mismatches (Join by width).

**Reduced motion** (`prefers-reduced-motion: reduce`, 21 stops): the morph jumps as in v0.
- 430x775: max 2, 0 px > 8, state 0 mismatches.
- 1280x800: max 10, 3 px > 8 (the photo grid behind the open panel), state 0 mismatches.

### Gate 2: above the end against v14 (20 y stops from the top to `#platform`, arms v14, g0.0, v14)

| width | g0.0 vs v14: px > 8, worst stop | v14 A/A: px > 8, worst stop | stops where g0.0 is above the A/A envelope |
|---|---|---|---|
| 430x775 | 23034 (y1504) | 32848 (y0) | none |
| 430x815 | 154066 (y4163, #platform glints) | 74980 (y4163) | none (g0.0 vs the second v14 run: 11873) |
| 768x1024 | 27957 (y4551, agents-ask cycler) | 10307 (y2023) | y4551: a re-run with g0.0 twice (`diag768`) gives v14~g0 7 px, g0~g0#2 106k px, so it is the cycler's real-time phase |
| 1280x800 | 167139 (y4319) | 183985 (y4319) | none (moving hero/people content, both runs) |

Reduced motion, 4 stops: 430x775 T0 at all 4. At 1280x800, y0 and y1000 differ by up to 131 levels (1122 px) in
lazily decoded photos (the "COMPOSER" cover); the non-reduced 1280 A/A shows the same stop (`y997`) at the same size.
Class parity of the nav (hero pill, on-dark, Join at the top) 0 mismatches at every stop and width.

**Simulator above the end** (8 stops): T0 or within the v14 A/A envelope up to `y2968`. At `y3561` and `y4155` v14
differs (690k px, max 232): that is v14's sticky `#platform` (morph-scroll), reverted with the end (see "Removed").

**Masked regions against v14** (lead's ruling (a)/(b)): at the closed rest g0.0 vs v14 differs by 1 px unmasked and
2999 px inside the masks (max 34 levels: countdown digit and sweep-title phase). At the open end the two builds differ
by design (v14's CM end card vs v0's tween), so only the closed rests compare.

### Gate 3: errors and hydration

- Chrome, every load of every run: no exception and no `hydrat` message. The only console lines are 404s for four
  `.avif` files the mirror lacks (`/selling/optimized/media/post-1/2`, `platform/service-thumb-bot/main`). They come
  from the baseline, 12 per load, in v0, v14 and g0.0 alike.
- Simulator: no `error` or `void` run.
- The page height equals v0's at every width (no `.fw-ms-end` spacer).

## R4a/R4b and the 0.9999 opacity (ruling (c))

The only unmasked pixel differences against v0 are mid-tween (open 400-560 ms, the reversal's first close stops) and
at the closed rest inside `#platform`:

- mid-tween: up to 54 levels on at most 38 pixels (0.0012 % of the frame; 430x775 49 / 22 px, 430x815 39 / 38 px,
  768 4 / 0 px, 1280 54 / 1 px), in the nav glass edge and `#platform`'s blur. The Simulator shows none (max 2, 0 px). A diagnostic build without R4a/R4b and with v0's plain `#platform` opacity (`out/g0/g00-d`, not shipped)
  removes most of them. Cause: R4a/R4b's registered `--morph`/`--morph-fade` plus `min(fade, 0.9999)` (**OBSERVED**, in
  our setup; the computed values differ from v0's in the 6th digit, the exact raster mechanism is UNRESOLVED; decisive
  local check: the same seek stops with only R4a or only the opacity reverted). The diagnostic build itself showed a
  151k px, max 19 level nav difference at open-done/held against both v0 and g0.0, not investigated (diagnostic only).
- closed rest: `#platform` content outside the masks differs from v0 (52k px, max 14 levels, 6 px over 8); against
  v14 the same region differs by 1 px, so it is v14's kept PR-009 platform idle look, not the end revert.

All of it is inside T2, with the Chrome and Simulator A/A floors in the tables, so R4a/R4b and the 0.9999 stay.

## Gate 4: Simulator counts (descriptive only, not a gain claim)

WebKit Timeline per window on the iPhone Simulator at the page end. Windows: rest 2 s before the gesture, open 1.2 s,
rest open 2 s, close 1.2 s, rest closed 2 s. v0 and g0.0 are driven by one wheel event each way; v14 is driven by
a smooth scroll through its spacer (its own end). Two loads per arm; per load the columns are rendering frames,
style recalcs, layouts and paints.

| window | v0 (load 1 / 2) | v14 (load 1 / 2) | g0.0 (load 1 / 2) |
|---|---|---|---|
| rest closed, before | 120/236/212/526 · 102/206/163/455 | 121/121/0/0 · 121/121/0/0 | 0/0/0/0 · 0/0/0/0 |
| open (680 ms tween) | 32/62/55/633 · 25/50/33/485 | 70/72/36/68 · 59/61/35/67 | 61/68/49/352 · 53/55/42/260 |
| rest open | 120/234/175/468 · 88/178/125/356 | 121/121/54/54 · 116/116/54/54 | 121/52/52/52 · 121/52/52/52 |
| close | 32/63/62/702 · 25/50/48/548 | 68/70/11/40 · 64/66/19/62 | 67/89/69/425 · 63/86/64/378 |
| rest closed, after | 120/235/211/523 · 110/223/177/491 | 121/121/0/2 · 121/121/0/0 | 121/0/0/0 · 121/0/0/0 |

What these numbers show:
- g0.0's tween paints 5-6 times per frame against v14's ~1. v0 paints ~20 times per frame and drops frames: 25-32
  frames in 1.2 s. This per-frame paint is the cost the GPU step g0.1 targets.
- At rest at the end, g0.0 does less than v0 (v14's pauses are kept). After the first open, WebKit keeps 60 rendering
  updates a second with no style, layout, paint or script. This is OBSERVED and not investigated; likely the lazily
  mounted panel's animations.

## Rebuild and pins

```sh
sh fixes/g0-revert/rebuild.sh <out dir>     # baseline site-pretty + patch.diff, checked against HASHES, read-only
node tools/serve.mjs --root site-pretty --overlay <out dir> --port auto --vendors=local
```

- JS `_app/immutable/nodes/2.DyWL8TcE.js` 5c39f7a96e41 (sha256 5c39f7a96e41e5785d029629ea86337f48b887a76eaab8b3d5cb226d6c4adad8)
- CSS `_app/immutable/assets/2.gBuqKVzi.css` g0.0b a2351bd219ae (sha256 a2351bd219aeef3c9997f8df0d29aa82b12296a2e5dadb065e2030f87047fd13);
  g0.0 (f75c1707) was 95f0eff3c57f (sha256 95f0eff3c57f3a65fc601d6fe209df2408149937709d4696c9ff0c92316a8c13)
- baseline snapshot b1789284481295-4ad4a84a; v14 compared at d23ee885d54f / 4fafb83f1e72 (`fixes/compositor-morph/v14/rebuild.sh`).

No measurement code changed (`verify.mjs`, `lib/cdp.mjs`, `fix.mjs ab` untouched); no timing A/B was run (step 0 is
the reference, not a speed claim).

**Scenarios not run:** finger (F) and WDA (G) gestures; phone timing; toolbar resize mid-tween; reload while held at the
end. Touch on the jack is v0's code verbatim; the seek gates drive it by wheel.

## Risks, caveats, follow-ups

- The seek stops are settled states (transitions finished, CSS animations paused at a fixed time), not the frames a
  real tween paints between rAFs; they prove the curve and the end states, not frame pacing.
- `Date.now` is frozen at one whole second 1 h after the run's start, shared by all arms of a run (not a fixed instant
  across runs). F-338 (fix-g0-gpu) shows the panel clock's digits can roll on a real `setTimeout` mid-capture. Here
  those digits sit inside the countdown masks (the `maskedDiffMax` column), so the unmasked numbers don't depend on it.
  The #platform agents-ask cycler also runs on real `setTimeout`, so stops near #platform carry its phase (768 `y4551`:
  g0~g0#2 106k px, max 80, in `diag768`; v14~g0 at the same stop 7 px).
- `data-fw-pf-paused` is v14's attribute (c3), absent in v0; state parity ignores it.
- `is-morphing` is back at `> 0.001`, so F-243's sub-pixel restarts at the close's last ~68 ms return, as in v0.
- g0.1 (fix-g0-gpu) ports the GPU animations onto this build; it needs `__mkW`'s targets, the `S()` buckets and the
  v0 thresholds (pointer-events > 0.5225, aria-hidden < 0.35, tabindex, inert) unchanged.
- Performance at the end is v0's (the user asked for the original behaviour first); the GPU step is g0.1.
