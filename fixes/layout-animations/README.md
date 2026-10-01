# Fix: layout-animations

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured: `patch.diff` = variant 10 (03 + sweep-gate teardown). Performance measured on 05, which runs the same LTR code: Chrome A/B with the I-002 idle phase (contaminated: load1 16-30) and own idle probe. Visual checks (fixed script) run on 10. iPhone pending.
**Topic:** see `fixes/TOPICS.md` (9, layout-animations)
**Files touched:**
- `/_app/immutable/assets/2.gBuqKVzi.css`: `.fee-progress > span` (560-575), `.script-accent.is-drawing-in` (1230-1232, removed),
  `.start-selling-avatars.is-carousel img.*` + `@keyframes avatars-exit` (2882-2904), new `[data-sweep-paused]` rule before
  `@keyframes start-selling-platform-i-doc-sweep` (5802)
- `/_app/immutable/nodes/2.DyWL8TcE.js`: `JT` fee visual render (2590), `HE` script accent (3672, 3774-3787, new
  `HEflip`), platform row each-block (12655, new `PMsweepGate`)

(Line numbers are 1-based in the prettified baseline, `site-pretty/`.)

## Why it lags

Motion inventory (`research/01-initial-investigation/motion-inventory.md`, hero "Script accent", future "Avatar
carousel", commission "Progress bar", platform "Infinite background-position animations", ranked suspect 6) lists
animations that run on the main thread and recompute layout, many of them while nobody scrolls:

| effect | code (baseline) | cost |
|---|---|---|
| hero h1 accent word ("you" → คุณ → kamu ...) | CSS 1230-1232 `transition: width 0.9s` on `.script-accent.is-drawing-in`; JS `HE` 3777 writes the new inline `width` every cycle (~3 s: 1.25 s idle, 0.9 s draw-out, 0.9 s draw-in) | 0.9 s of style + **layout every frame** per cycle inside the flex h1; runs whenever the hero is within one viewport (IO `rootMargin: 100% 0px`, JS 3714), i.e. at page top at idle |
| avatar carousel in `#people` | CSS 2882-2904 `avatars-exit` animates `width`, `flex-basis`, `margin-right`, `border-width`; JS 11345-11358 swaps the 4/5 `<img>` template every ~1.02 s | 0.22 s of layout every frame per second while the section is engine-active (±1 viewport) |
| commission `.fee-progress` count-up | JS `JT` 2485-2487 rAF tween (1.1 s) → 2590 inline `width: N%` on the bar span | layout every frame of the tween (the $ amount text also changes, but only on ~half of the frames) |
| platform gradient titles (doc / earn / secure / organized) | CSS 5707-5954 and 11085-11103 `animation: 4s linear infinite start-selling-platform-i-doc-sweep` (`background-position` + `background-clip: text`, keyframes 5802) | repaint every frame, forever; the engine pauses them only per whole `#platform` scene (±1 viewport), so all four run while only one is visible. On iPhone, fix-large-area-blur's WebKit timeline shows ~50 paints/s per title at idle at the page bottom, including one title below the viewport |

Measured cost (my idle probe, see "Before / after"): at idle at the top of the page the baseline does
**231-330 layouts** in a 5 s window (123-189 ms of throttled layout time); at the avatar carousel it does 248-279.

Not a cost / out of scope:
- `.start-selling-platform-service-card.is-animating` (CSS 9187-9366, `top/width/padding/height/max-height/gap`
  transitions) is **dead CSS**: no element with `start-selling-platform-service-card` exists in the JS templates or
  `index.html` (`grep` of `site/` finds the class only in the stylesheet). Nothing to fix.
- `@keyframes start-selling-commission-accent-sweep` (CSS 7631), `start-selling-avatars-exit` (10412) and
  `start-selling-people-o-peel` (5332) are unused keyframes (no `animation` references them).
- `.start-selling-future-people-o-face` width/margin transitions (2548) run only on hover/expand (user interaction).

## What changed

1. **Avatar carousel (CSS only).** The leaving avatar keeps its 32 px box. `avatars-exit` now animates
   `translate: 0 → -16px`, `clip-path: ellipse(16px 16px) → ellipse(0 16px)`, `transform: scale(1 → 0.35)` and
   `opacity`; the avatars after it get `avatars-shift` (`translate: 0 → -24px`, the leaving avatar's advance
   32 px - 8 px overlap) with the same easing. The entering avatar runs `avatars-shift` plus its unchanged
   `avatars-pop` (the individual `translate` property composes with `transform: scale`). Every keyframe is linear
   in the eased progress, so this is the same geometry: the old shrinking box was `32·(1-e)` wide, centred at
   `16·(1-e)`, with an elliptic border-radius clip; the followers moved `-24·e`. Only the 1 px border fading
   with the width differs (kept at 1 px while the avatar fades out and shrinks to 0.35; the clip cuts it at the
   sides), and the followers land on sub-pixel positions instead of pixel-snapped layout positions: frozen
   frames differ by up to 1 device px (see "Visual equivalence").
2. **Script accent (CSS + small JS).** The `width` transition is removed, so the new width applies in one
   layout. Because the hero title row is centred (`justify-content: center` in a centred column), a width change
   `Δ` keeps the accent's centre fixed and moves the words before it by `-Δ/2` and after it by `+Δ/2`. The new
   `HEflip` (called from `HE`'s render effect when the word's width changes) plays exactly that as a WAAPI
   transform animation on the sibling words, `translateX(±Δ/2 em) → none`, 0.9 s, the transition's easing
   (`cubic-bezier(0.4, 0, 0.2, 1)`). No layout reads. RTL: the sign is flipped for `html[dir=rtl]`. There
   `.hero-title` is `row-reverse` (CSS 1784-1789) inside `.start-selling.svelte-q2j1fg { direction: ltr }`
   (CSS 11744-11748, the only `direction` declaration), so its computed direction stays ltr, main-start is on
   the right, and the words before the accent sit on its right and move `+Δ/2`. (Variant 05 dropped the flip on
   a wrong premise and broke RTL; variant 10 restores it, see "Experiments tried" 04/05/10.)
   Reduced motion: unchanged (the cycle never starts, so the width never changes).
3. **Fee progress (CSS + one JS line).** The bar span stays `width: 100%`; `JT` writes `--fee-progress` (0-1)
   instead of `width: N%`. The fill is `clip-path: inset(0 calc(100% - w) 0 0 round 999px)` with
   `background-size: w 100%` and `w = max(4px, p·100%)`: `inset(... round 999px)` clamps its radii the same way
   `border-radius: 999px` does on a `w`-wide box, the gradient spans the visible part as it spanned the old
   width, and 4 px is the old padding box at 0 %. The 1.2 px blurred highlight ends at the clip edge instead of
   2 px before it (not visible in the frozen-frame diff).
4. **Gradient titles: pause off-screen (small JS + CSS).** `PMsweepGate(row)` (called once per platform row as
   it is created) observes the four sweeping titles with one shared IntersectionObserver and sets
   `data-sweep-paused` while a title is outside the viewport; `.start-selling-platform [data-sweep-paused]`
   sets `animation-play-state: paused !important`. The sweep itself stays a `background-position` animation:
   `background-clip: text` can't be moved on the compositor without changing the look. When a title enters
   the viewport it resumes from where it paused (the phase of a 4 s loop). When a row is destroyed, its titles
   are unobserved: `PMsweepGate` registers the cleanup with Svelte's `$effect.pre` (`X` from
   `chunks/BSBv9QXB.js`, imported as `PMpre`), which attaches to the row's each-block branch effect, so its
   returned function runs on the row's teardown. (`$effect`, `b` in this file, would defer to the component
   while it mounts and tear down with the component instead.)

The script accent's IntersectionObserver margin was left at `100% 0px` on purpose: pausing at the viewport
edge could freeze it mid draw-out (blank accent) exactly when it scrolls into view.

## Why that is faster

- Accent and avatar carousel: per-frame layout (0.9 s per ~3 s cycle, 0.22 s per ~1 s cycle) becomes one layout
  per state change; the animation itself is `transform` / `translate` / `opacity` (compositor) plus a
  `clip-path` on one 32 px image (at worst paint-only).
- Fee bar: the tween writes a custom property that only affects paint of the bar; frames where the amount
  text doesn't change no longer need layout.
- Titles: off-screen titles stop repainting (and stop forcing their style updates) while the platform scene is
  active; only on-screen titles sweep.

Expected metric movement: idle layout count/time (the I-002 idle phase of `fix.mjs ab` does not count layouts, see below) and, during
scrolling, a little less layout per frame near the hero, carousel and fee bar. The scroll phase is dominated by
the scroll callbacks (other topics), so a scroll-phase win is not expected to exceed the noise floor.

## Before / after

### Idle probe (`idle-probe.mjs` in this folder; `fix.mjs ab`'s idle phase can't see layout counts)

Exact command (worktree root; both servers started with `tools/serve.mjs --root <main>/site-pretty [--overlay
fixes/layout-animations/overlay] --vendors=local --https --latency 150 --port 5216|5217`), inside one
chrome-measure slot:

```sh
node fixes/layout-animations/idle-probe.mjs "$PWD" base=https://localhost:5216/ fix=https://localhost:5217/ \
  --runs 2 --secs 5 --spots 'top,.start-selling-avatars,.fee-progress,.start-selling-platform-row-title-doc,.start-selling-platform-row-title-secure' \
  --shots <dir> --json <file>
```

Chrome, mobile 430x932 DPR 3, CPU 6x. Scroll to a spot, wait 3 s, then a 5 s window with no input (throttle on
only for the window): `Performance.getMetrics` deltas plus the `document.getAnimations()` running list. Two runs
each, alternating (base/fix/fix/base). Values are run 1 / run 2. Variant 05, whose LTR code is identical to 10 (probe-3, 2026-09-30 23:04Z, host
load1 ~22, so treat absolute ms as contaminated; the counts don't depend on load):

| spot (idle, 5 s) | layouts base → fix | layout ms base → fix | style-recalc ms base → fix | task ms base → fix | running sweeps base → fix |
|---|---|---|---|---|---|
| top (hero accent) | 314 / 330 → **15 / 16** | 164 / 183 → **9 / 9** | 390 / 407 → 376 / 389 | 3185 / 3235 → 2749 / 2984 | 0 → 0 |
| avatar carousel (`#people`, accent still active) | 217 / 272 → **15 / 13** | 119 / 153 → **6 / 7** | 554 / 518 → 584 / 552 | 4516 / 4483 → 4306 / 4261 | 0 → 0 |
| `.fee-progress` (commission) | 67 / 66 → 48 / 46 | 53 / 51 → 45 / 43 | 476 / 529 → **373 / 381** | 2818 / 3279 → **2269 / 2410** | 4 → **0** |
| doc title (platform) | 51 / 51 → 51 / 51 | 32 / 44 → 48 / 40 | 747 / 677 → 692 / 657 | 3596 / 3459 → 3372 / 3487 | 4 → 2 (on-screen) |
| secure title (platform) | 0 → 0 | 0 → 0 | 622 / 542 → 539 / 536 | 3331 / 3265 → 3291 / 3352 | 4 → 3 (on-screen) |

Variant 03 (the landed 5c08c7a, probe-2, same command) gave the same picture: top 231 / 330 → 13 / 16 layouts,
carousel 248 / 279 → 16 / 13, fee spot style 511 / 438 → 326 / 339 ms, task 2934 / 2744 → 2045 / 2194 ms.

- At the top and at the carousel, idle layouts drop ~95 % (from ~45-66 layouts/s to ~3/s). The remaining
  ~600 style recalcs per 5 s (one per frame; headless rAF runs at ~120/s) come from other always-running
  animations (`scroll-float`, `vinyl-spin`, the accent's SVG stroke/idle frames, the countdown): other topics.
- At the fee spot the four platform sweeps were running off-screen in the baseline (the `#platform` scene is
  within ±1 viewport there). The gate pauses them: style-recalc time drops ~20-30 % and task time ~20-25 %.
- The fee count-up only runs once (1.1 s when the bar enters the viewport), so its idle rows show the
  sweep gate, not the bar. The bar's own saving is the layout during that one tween.

### Visual equivalence (frozen frames, `visual-checks.mjs`, pixel diff threshold 48, DPR 3)

All animations under the element are paused and set to the same `currentTime` in base and fix, then a
fixed clip is captured (`idle-probe.mjs ... --visual-only` runs only these checks).

**Correction: the earlier carousel and fee-bar results were false passes.** v1 of the script clipped
`Page.captureScreenshot` with the element's viewport rect after scrolling, but the clip is in document
coordinates. Every shot taken after a scroll was a blank strip of the page top, so blank was compared with
blank and reported 0 %. This affected the carousel (60 / 110 / 180 ms) and fee-bar (7 progress values) rows
in 5c08c7a's README. The hero accent shots (scrollY 0) were valid. The script now adds `scrollX` / `scrollY`
to the clip and prints `VISUAL-BLANK` when a shot has no colour range.

| check | diff |
|---|---|
| hero h1 (full width) at 150 / 300 / 600 / 850 ms of the 900 ms draw-in (valid in v1; 03 and 05 identical) | 0.09 / 0.25 / 0.35 / 0.25 % |
| hero h1 under `html[dir=rtl]`, second draw-in (112 → 80 units), 300 / 600 ms: base vs 10 | 0.19 / 0.19 % (accent width 70 → 50 CSS px in that cycle) |
| same, base vs 05 (positive control: 05 slides the neighbours the wrong way) | **5.83 / 2.98 %**: the control fails as it should, so the RTL check can tell the two signs apart |
| avatar carousel at 20 / 60 / 110 / 180 ms of the 220 ms swap (10) | 2.24 / 8.66 / 1.37 / 11.57 %: ±1 device px from non-snapped `translate`, same in 03 (identical carousel CSS; the landed '0 %' was a P14 false pass); equal by eye. Accepted by the lead as sub-pixel, see below |
| `.fee-progress` at p = 0, .01, .03, .1, .37, .77, 1 (7 clones in one shot, 10) | 0.02 % |

Run: one `--short --max-seconds 240` chrome-measure slot (ended 2026-09-30 23:55Z), three sides (base, 10, and
05 as `ctl05` for the RTL keys only), `idle-probe.mjs ... --visual-only`. Every key printed `VISUAL` (no blank,
missing or timeout). Clip sizes are equal on both sides: h1 1290 x 348 px, fee box 960 x 492 px (320 CSS px
border-box), avatars 348 x 132 px (bbox + 6 CSS px each side at DPR 3). The FREEZE lists show the real
animations: base `width:EM` and fix 2 x `waapi:SPAN` for the accent (LTR and RTL); base `avatars-exit` +
`avatars-pop`, fix `avatars-exit` + 4 x `avatars-shift` + `avatars-pop`.

**Carousel: not pixel-equivalent.** Best-alignment search per 60-px column band (device px, base vs 10):
0 px at 20 and 110 ms, +1 px at 60 ms, -1 px at 180 ms for every follower. The baseline moves the followers by
layout, which snaps them to device pixels; the fix moves them with `translate`, which lands on sub-pixel
positions. A 1-device-px (0.33 CSS px) offset of a photo gives 6-12 % of pixels above the threshold. At 20 ms
the followers match (0 px) and the remaining difference is the leaving avatar. In the baseline its 1 px border
ring follows the shrinking box; in the fix the `clip-path` ellipse cuts the ring away at the sides. By eye the
frames look the same (enlarged crops in the scratch evidence), but the check's 0.4 % bar is not met; the lead
accepted this as sub-pixel. Snapping the shift to device pixels is a look-only item in the iPhone queue.
The paint-order concern from the review does not show: at 20 ms image 2's border arc lies over the leaving
avatar in both variants.

The h1 differences are anti-aliasing at the accent glyph's edges: sub-pixel positions differ because
translate and layout land on different pixels. When the crops are aligned on the accent, the words match
exactly.

### iPhone

**iPhone pending.** The phone was disconnected before my lease came up, so no device checks were run.
Ready to run once the phone is back (plain http per I-003, scripted only):
- `iphone.mjs open` + a WebKit Timeline idle record at the top, the carousel and the bottom, base vs patched
  (Layout / RecalculateStyles / Paint counts, rAF intervals).
- `iphone.mjs scroll` base vs patched.

Expected on the device: far fewer Layout records at idle at the top and the carousel. At the bottom, the
title that sits below the viewport should stop repainting ~50/s; fix-large-area-blur saw that repaint.

### Chrome A/B (`fix.mjs ab layout-animations --runs 5` on variant 05 = 10's LTR code, tools after I-002: 6 s idle phase at the top)

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 63.5 [62.8-70] | 64.3 [61.1-67.6] | +0.8 (+1.3%) | within noise |
| scroll: frames >20 ms | 122 [112-137] | 126 [106-145] | +4 (+3.3%) | within noise |
| scroll: frames >34 ms | 15 [11-16] | 14 [14-17] | -1 (-6.7%) | within noise |
| scroll: frames >50 ms | 6 [6-7] | 6 [5-9] | 0 (0%) | within noise |
| scroll: frames >100 ms | 1 [0-2] | 2 [2-2] | +1 (+100%) | within noise |
| scroll: worst frame ms | 100.6 [91.6-125.3] | 116.8 [108.1-124.3] | +16.2 (+16.1%) | within noise |
| scroll: p95 frame ms | 33 [25.7-33.2] | 32.8 [25.9-33.1] | -0.2 (-0.6%) | within noise |
| scroll: LoAF ms | 370 [356-473] | 379 [266-502] | +9 (+2.4%) | within noise |
| scroll: LoAF script ms | 208 [197-272] | 219 [158-287] | +11 (+5.3%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 89 [60-122] | 95 [45-117] | +6 (+6.7%) | within noise |
| morph: fps | 105.4 [101.9-106.4] | 105.1 [98.4-107.4] | -0.3 (-0.3%) | within noise |
| morph: frames >50 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: fps | 119.6 [119.5-119.8] | 119.7 [119.3-120] | +0.1 (+0.1%) | within noise |
| idle: frames >20 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: frames >34 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: frames >50 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: frames >100 ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: worst frame ms | 16.7 [16.6-17.6] | 16.8 [9.4-17.5] | +0.1 (+0.6%) | within noise |
| idle: p95 frame ms | 9.2 [9.2-9.2] | 9.2 [9.2-9.2] | 0 (0%) | within noise |
| idle: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: LoAF script ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| idle: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |

**Validity: contaminated.** Host load1 was 16.3-30.5 during the runs (~22 at slot start), above the
EXPERIMENTS.md limit of 10. The arms alternate, so the comparison is fair, but the absolute numbers are inflated.

- **Scroll, morph and idle: within noise** on every metric. The scroll phase is dominated by the scroll
  callbacks (other topics). The **idle phase** records frames and LoAF only: the idle layouts this fix removes
  (~60/s at the top, 0.5-1 ms each at 6x) fit inside the frame budget, so no frame or LoAF moves. The idle win
  shows only in the layout/style counters (the probe above).
- Previous A/B of variant 03 (old tools, load 9.5-17.7): all within noise too; >20 ms frames 95 [92-112] →
  89 [76-107], forced 55 [46-88] → 42 [38-98] ms.
- Regressions: no new console errors, no new 404s, `morphReached` 5/5 on both sides.
- Screenshot diff: top 0.13 %, middle 0 %, bottom 0.52 %. The bottom difference (inspected by crop on the 03
  run, 0.56 % there) is only the gradient phase inside "Earn", "Secure" and "Organized": paused titles
  resume at a different point of the 4 s sweep than the always-running baseline. Not a visual change.

## Experiments tried

Rebuild a variant: copy `variants/<nn>.diff` to `patch.diff` in a scratch copy of this folder and run
`node tools/fix.mjs apply layout-animations`, then `fix.mjs ab` / `idle-probe.mjs` as below.

Fields as in `fixes/EXPERIMENTS.md`. "Own probe" = `idle-probe.mjs` (this folder), mobile 430x932 DPR 3, CPU 6x,
5 s idle window per spot, n = 2 per side, alternating order; it does not use verify.mjs, but runs before the
I-002 tools change are marked old-tools for consistency.

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status |
|---|---|---|---|---|---|---|---|---|
| layout-animations/01 | avatars-exit on translate/clip-path/scale/opacity + `avatars-shift`; accent width transition → WAAPI transform on neighbour words (`HEflip`, with RTL sign flip); fee bar `--fee-progress` + clip-path (no sweep gate yet) | per-frame layout from width/flex-basis/margin animations disappears; idle LayoutCount at hero and carousel drops | better (idle) | old-tools (own probe, load not recorded) | idle layouts per window: top 220-331 → 14-16, carousel 271-298 → 15-17, fee spot 69 → 46-47 (n=2) | `variants/01.diff` (rebuilt from 05: sweep gate removed, RTL flip restored); numbers: first probe, logs not kept | FINDINGS T5; composite-only animations remove idle layout almost entirely | superseded by 03 |
| layout-animations/02 | accent IntersectionObserver `rootMargin: 100% 0px` → `0px` (stop the accent cycle as soon as it leaves the viewport) | less accent work while the hero is just off-screen | abandoned | n/a (never measured) | none | no patch kept (one-line rootMargin edit, reverted before any measurement); "What changed", note under item 4 | pausing at the edge can freeze the accent mid draw-out, so a blank accent scrolls into view; T6 caveat: rootMargin 0 only when the paused frame is acceptable | dropped |
| layout-animations/03 | 01 + per-title sweep gate `PMsweepGate` (IO + `data-sweep-paused` → `animation-play-state: paused`) | the four `background-position` sweeps stop repainting while off-screen even when `#platform` is engine-active | better (idle); within noise (scroll/morph) | old-tools (A/B before 4bbd249, load 9.5-17.7) | idle at fee spot: style 511/438 → 326/339 ms, task 2934/2744 → 2045/2194 ms, running sweeps 4 → 0 (n=2); hero layouts 231/330 → 13/16; A/B n=5: >20 ms frames 95 [92-112] → 89 [76-107], forced 55 [46-88] → 42 [38-98] ms, all within noise | `variants/03.diff` (= landed patch), `results.json` of 5c08c7a | FINDINGS T6; the bottom screenshot diff 0.56 % was sweep phase only (paused titles resume at another point of the loop), not a visual change | landed (5c08c7a) |
| layout-animations/04 | `HEflip` sign flip for `html[dir=rtl]` (part of 01/03) | keep the neighbour-word slide correct in RTL | **correct** (first reported "broke" by review of 5c08c7a; that premise was wrong) | n/a (reasoning; RTL frozen frames in row 10) | the RTL `.hero-title` is `row-reverse` but its computed direction is ltr (`.start-selling { direction: ltr }`, CSS 11747), so the words before the accent sit on the right and the flip is needed | `variants/03.diff` (the flip is its `HEflip` hunk) | read the computed `direction`, not only `dir` and `flex-direction`, before reasoning about physical sides | kept (restored in 10) |
| layout-animations/05 | 03 − RTL flip + unobserve titles on row teardown (`$effect.pre` cleanup) | same performance as 03; correct RTL (wrong premise, see 04); no observer leak | broke (RTL: neighbour words jump by Δ; review-layout05); performance: better (idle, own probe), within noise (A/B incl. idle phase) | contaminated (load1 16.3-30.5) | idle layouts top 314/330 → 15/16, carousel 217/272 → 15/13, fee spot style 476/529 → 373/381 ms (n=2); A/B n=5 all within noise, e.g. >20 ms frames 122 [112-137] → 126 [106-145], idle phase frames/LoAF identical | `variants/05.diff` (= `patch.diff`), `results.json`, this README "Before / after" | the I-002 idle phase counts frames and LoAF, not layouts, so it can't see idle-layout fixes; visual checks: see row 09 | superseded by 10 (kept as the RTL positive control) |
| layout-animations/06 | accent visual check v1: cropping the h1 by the hero-title's bounding box in base and fix | frozen-frame equivalence of the accent slide | broke (measurement): 7.25 % / 3.78 % diff | n/a | aligned on the accent the same frames differ by 0.557 %, only glyph edges; fixed full-width clip: 0.09-0.35 % | no patch kept (a crop choice in my scratch visual-check script, replaced by the fixed clip now in `visual-checks.mjs`) | mid-transition the title's width differs between variants, so bbox crops misalign; always compare a fixed clip | superseded (fixed clip) |
| layout-animations/07 | `.start-selling-platform-service-card.is-animating` top/width/height/padding transitions | layout transitions on the service card | abandoned | n/a | none: the class exists only in the stylesheet (dead CSS) | no patch kept (nothing to change: dead CSS); "Why it lags" | grep the JS and HTML before "fixing" a CSS rule | dropped |
| layout-animations/08 | move the gradient-title sweep to the compositor (transform on a gradient layer instead of `background-position`) | no repaint per frame for visible titles | abandoned | n/a (not built) | none | no patch kept (never built); "What changed" 4 | `background-clip: text` ties the gradient to the glyphs; a composited layer can't reproduce it without changing the look, so only the off-screen pause was done | dropped; retry when a masked-layer version is visually verified |
| layout-animations/09 | visual-checks v1: `Page.captureScreenshot` clip from the viewport rect after scrolling | frozen-frame equivalence of the carousel and fee bar | broke (measurement): false pass, blank vs blank = 0 % | n/a | carousel 0/0/0 %, fee 0 % reported for 03; both shots blank | no patch kept (script bug, fixed in `visual-checks.mjs`: scrollX/scrollY + blank guard); this README "Visual equivalence" | CDP clip is in document coordinates; always guard pixel checks against blank images | superseded (fixed script) |
| layout-animations/10 | 05 with 03's RTL flip restored (= 03 + sweep-title unobserve on row teardown via `$effect.pre`, import `X as PMpre`) | 03's behaviour with no observer leak | better (idle; performance carried over from 05); visual: accent LTR/RTL and fee bar equivalent, carousel not pixel-equivalent (sub-pixel) | performance carried over from 05 (contaminated, load1 16.3-30.5): 10 and 05 run the same code in LTR (the sign expression is evaluated once per width change) | idle and A/B numbers: row 05; visual (fixed script, one short slot, 3 sides): accent 0.09-0.35 %, RTL 0.19 % (control 05: 5.83 / 2.98 %), fee 0.02 %, carousel 1.37-11.57 % | `variants/10.diff` (= `patch.diff`), this README "Visual equivalence" | a positive control (05) proves the RTL check can fail | on branch (wave-1 candidate) |

## Risks, conflicts, follow-ups

- Behaviour: desktop and phones use the same code paths (the hero title is centred at every breakpoint,
  CSS 1757-1783, 2053-2062); reduced motion is untouched (accent cycle and carousel loop don't start; fee
  jumps to `--fee-progress: 1`; titles have no animation). RTL: handled by the sign flip in `HEflip` (see
  "What changed" 2); checked with frozen frames under `html[dir=rtl]` against the baseline, with 05 as the
  positive control.
- `clip-path` animation (avatar) and `translate` are supported by Safari 14.1+/Chrome 104+; WAAPI
  `element.animate` everywhere relevant (guarded).
- Overlaps: `.fee-progress` lives in the commission section (told fix-commission-forced-layout; I don't touch
  JS 3085-3150 or `--commission-*`). `PMsweepGate` is one line in the platform row each-block (JS ~12655) plus
  one import (`X as PMpre`) in the node's import list,
  ~200 lines below topic 4's platform `--platform-shrink` block (12433-12447): no shared hunk. The carousel's
  driver loop (JS 11345-11358, next to topic 4's future `l`) is unchanged. No engine API change
  (`rE/iE/aE/dE/uE` untouched).
- Follow-up (not done, other owners' code): the carousel keeps swapping its DOM every ~1 s while `#people` is
  engine-active (±1 viewport), even off-screen: a visibility gate would belong with scene-gating-tighten (12).
