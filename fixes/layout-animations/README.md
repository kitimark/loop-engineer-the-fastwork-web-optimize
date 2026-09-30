# Fix: layout-animations

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (Chrome A/B + own idle probe; iPhone pending; re-run `fix.mjs ab` once I-002 adds the idle phase)
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
   with the width differs (kept at 1 px while the avatar fades out and shrinks to 0.35).
2. **Script accent (CSS + small JS).** The `width` transition is removed, so the new width applies in one
   layout. Because the hero title row is centred (`justify-content: center` in a centred column), a width change
   `Δ` keeps the accent's centre fixed and moves the words before it by `-Δ/2` and after it by `+Δ/2`. The new
   `HEflip` (called from `HE`'s render effect when the word's width changes) plays exactly that as a WAAPI
   transform animation on the sibling words, `translateX(±Δ/2 em) → none`, 0.9 s, the transition's easing
   (`cubic-bezier(0.4, 0, 0.2, 1)`), mirrored for `html[dir=rtl]` (row-reverse). No layout reads.
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
   the viewport it resumes from where it paused (the phase of a 4 s loop).

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

Expected metric movement: idle layout count/time (not captured by `fix.mjs ab` yet, see I-002) and, during
scrolling, a little less layout per frame near the hero, carousel and fee bar. The scroll phase is dominated by
the scroll callbacks (other topics), so a scroll-phase win is not expected to exceed the noise floor.

## Before / after

### Idle probe (my own CDP script, not `fix.mjs ab`; I-002 adds an idle phase to verify.mjs later)

Chrome, mobile 430x932 DPR 3, CPU 6x, `--vendors=local --https --latency 150`, under the chrome-measure lock.
Scroll to a spot, wait 3 s, then a 5 s window with no input (throttle on only for the window): `Performance.getMetrics` deltas plus the
`document.getAnimations()` running list. Two runs each, alternating base and fix (base/fix/fix/base). Values
are run 1 / run 2.

| spot (idle, 5 s) | layouts base → fix | layout ms base → fix | style-recalc ms base → fix | task ms base → fix | running sweeps base → fix |
|---|---|---|---|---|---|
| top (hero accent) | 231 / 330 → **13 / 16** | 123 / 189 → **7 / 16** | 400 / 360 → 374 / 390 | 2891 / 3049 → 2711 / 2887 | 0 → 0 |
| avatar carousel (`#people`, accent still active) | 248 / 279 → **16 / 13** | 150 / 174 → **11 / 7** | 562 / 527 → 548 / 572 | 4375 / 4343 → 4086 / 4367 | 0 → 0 |
| `.fee-progress` (commission) | 68 / 69 → 48 / 46 | 49 / 50 → 42 / 37 | 511 / 438 → **326 / 339** | 2934 / 2744 → **2045 / 2194** | 4 → **0** |
| doc title (platform) | 51 / 51 → 51 / 51 | 43 / 42 → 39 / 44 | 733 / 701 → 656 / 658 | 3452 / 3554 → 3402 / 3556 | 4 → 2 (on-screen) |
| secure title (platform) | 0 → 0 | 0 → 0 | 607 / 584 → 577 / 517 | 3371 / 3430 → 3360 / 3271 | 4 → 3 (on-screen) |

- At the top and at the carousel, idle layouts drop ~95 % (from ~46-66 layouts/s to ~3/s). The remaining
  ~600 style recalcs per 5 s (one per frame; headless rAF runs at ~120/s) come from other always-running animations (`scroll-float`,
  `vinyl-spin`, the accent's SVG stroke/idle frames, the countdown), which are other topics.
- At the fee spot the four platform sweeps were running off-screen in the baseline (the `#platform` scene is
  within ±1 viewport there). The gate pauses them: style-recalc time drops ~30 % and task time ~25 %.
- The fee count-up only runs once (1.1 s when the bar enters the viewport), so its idle rows show the
  sweep gate, not the bar. The bar's own saving is the layout during that one tween.

### Visual equivalence (frozen frames, pixel diff threshold 48, DPR 3)

All animations under the element are paused and set to the same `currentTime` in base and fix, then a
fixed clip is captured:

| check | diff |
|---|---|
| avatar carousel at 60 / 110 / 180 ms of the 220 ms swap | **0 % / 0 % / 0 %** |
| `.fee-progress` at p = 0, .01, .03, .1, .37, .77, 1 (7 clones in one shot) | **0 %** |
| hero h1 (full width) at 150 / 300 / 600 / 850 ms of the 900 ms draw-in | 0.09 / 0.25 / 0.35 / 0.25 % |

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

### Chrome A/B (`fix.mjs ab layout-animations --runs 5`, scroll + morph phases, no idle phase yet)

| mobile 6x, n=5 | baseline median [min-max] | patched median [min-max] | delta | verdict |
|---|---|---|---|---|
| scroll: fps | 69.6 [66.2-72] | 71.9 [68.8-72.8] | +2.3 (+3.3%) | within noise |
| scroll: frames >20 ms | 95 [92-112] | 89 [76-107] | -6 (-6.3%) | within noise |
| scroll: frames >34 ms | 10 [8-14] | 11 [9-11] | +1 (+10%) | within noise |
| scroll: frames >50 ms | 6 [5-7] | 5 [4-6] | -1 (-16.7%) | within noise |
| scroll: frames >100 ms | 0 [0-1] | 1 [0-1] | +1 | within noise |
| scroll: worst frame ms | 99.7 [83.4-100.1] | 107.6 [84.2-134] | +7.9 (+7.9%) | within noise |
| scroll: p95 frame ms | 25.8 [25.4-32.6] | 25.6 [25.4-26] | -0.2 (-0.8%) | within noise |
| scroll: LoAF ms | 328 [291-360] | 309 [270-383] | -19 (-5.8%) | within noise |
| scroll: LoAF script ms | 164 [148-216] | 161 [128-221] | -3 (-1.8%) | within noise |
| scroll: forced style+layout ms (in LoAF) | 55 [46-88] | 42 [38-98] | -13 (-23.6%) | within noise |
| morph: fps | 109 [100.2-109.9] | 109.4 [106.3-110.2] | +0.4 (+0.4%) | within noise |
| morph: frames >50 ms | 0 [0-0] | 0 [0-1] | 0 | within noise |
| morph: LoAF ms | 0 [0-0] | 0 [0-0] | 0 | within noise |
| morph: forced style+layout ms (in LoAF) | 0 [0-0] | 0 [0-0] | 0 | within noise |

Host load avg during the runs: 9.5-17.7 (other agents' worktrees were active, but only this A/B held the lock).
Noise floor: fix-countdown-idle-raf's A/A at the same settings (mobile 6x, n=5) had >20 ms frames 54-78,
LoAF 195-283 ms, forced 34-83 ms. Rule of thumb: >20 ms deltas under ~15, LoAF under ~80 ms and forced under
~40 ms are noise.

- **Scroll and morph: within noise** on every metric, as expected. The scroll phase is dominated by the
  scroll callbacks (other topics), and the animations this fix changes only run for part of the scroll.
  Directionally, frames >20 ms went -6 (95 → 89) and forced style+layout -13 ms (55 → 42), both inside the
  noise floor.
- The win is at **idle** (the probe above): ~95 % fewer layouts at the hero and the carousel, and 25-30 %
  less style/task time where the off-screen sweeps used to run.
- Regressions: no new console errors, no new 404s, `morphReached` 5/5 on both sides.
- Screenshot diff: top 0.15 %, middle 0.01 %, **bottom 0.56 %**. I cropped and inspected the bottom
  difference. It is only the gradient phase inside "Earn", "Secure" and "Organized". Those titles were paused
  while off-screen, so they resume at a different point of the 4 s sweep than the always-running baseline.
  Glyphs, layout and colours are otherwise identical. This is a phase difference, not a visual change.

## Risks, conflicts, follow-ups

- Behaviour: desktop and phones use the same code paths (the hero title is centred at every breakpoint,
  CSS 1757-1783, 2053-2062); reduced motion is untouched (accent cycle and carousel loop don't start; fee
  jumps to `--fee-progress: 1`; titles have no animation). RTL handled by the sign flip in `HEflip`.
- `clip-path` animation (avatar) and `translate` are supported by Safari 14.1+/Chrome 104+; WAAPI
  `element.animate` everywhere relevant (guarded).
- Overlaps: `.fee-progress` lives in the commission section (told fix-commission-forced-layout; I don't touch
  JS 3085-3150 or `--commission-*`). `PMsweepGate` is one line in the platform row each-block (JS ~12655),
  ~200 lines below topic 4's platform `--platform-shrink` block (12433-12447): no shared hunk. The carousel's
  driver loop (JS 11345-11358, next to topic 4's future `l`) is unchanged. No engine API change
  (`rE/iE/aE/dE/uE` untouched).
- Follow-up (not done, other owners' code): the carousel keeps swapping its DOM every ~1 s while `#people` is
  engine-active (±1 viewport), even off-screen: a visibility gate would belong with scene-gating-tighten (12).
