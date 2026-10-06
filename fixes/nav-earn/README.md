# Fix: nav-earn (user T-148: Join waitlist and padding at the end-of-page morph)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** rev 3 built and checked (Chrome DOM counts per frame, frozen stills, pixel diff vs v8, WebKit Simulator
Timeline counts); visual change, so a proposal (PR-021 rev 3); **not timed** (memory `defer-timing-focus-call-tree.md`).
**Base:** v8 (best build, `fixes/v8-best/`, JS `3e3e94cb6e9f` / CSS `f836404b3728`, short sha256 as the probes print it).
**This build (rev 3):** JS `8df0a9eb3ec7` / CSS `29bade2fe964` (rev 2: JS `f93d34915eb5` / CSS `044f52f797e5`; rev 1: JS
unchanged / CSS `9581cd83004c`). Baseline snapshot `b1789284481295-4ad4a84a`.
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` and `/_app/immutable/nodes/2.DyWL8TcE.js` (section "Rev 3";
rev 2's `--earn-in` writer and its CSS are gone). `delta.diff` = the change on top of v8; `patch.diff` = baseline-relative
(v8 + this), what `fix.mjs apply` and the proposal's Try-it serve.
**Driver(s):** Chrome DOM probe (scripted scroll steps and glides, synthetic wheel into the page's own capture listener)
and the iOS Simulator (Safari, Web Inspector Timeline record counts). No iPhone run (memory
`simulator-for-non-perf-phone-jobs.md`).

**Known issue, fixed separately (I-219, 2026-10-06, `fixes/i219-hydrate/`):** rev 3 put
`span.start-selling-top-nav-earn-box` into the nav template `uN`, but the server HTML has only the label text in the
button. So hydration ran `e(textNode, !0)`, which appends into a Text node (HierarchyRequestError, "Failed to hydrate").
Svelte then dropped the server DOM and mounted the whole page again at every load, on every build since rev 3 (rev 7d
included). `fixes/i219-hydrate/delta.diff` puts the baseline button back in the template and creates the span from
script right after the hydration walk. The DOM is the same, and Chrome pixels are identical to rev 7d. Pitfall F-306.

## Rev 3 (PR-021 changes-requested on rev 2, T-158): original timers back, drawn without layout

The user on rev 2 (scrubbed summary; full text in PR-021's decision note and thread T-158):
1. At the end of the page the original's timed hide of the button is gone (rev 1 made it follow the morph).
2. At the top, the reveal and un-reveal of the button around the hero → people scroll still lags, both ways: not on
   the GPU yet.
3. T-158: rev 2 tied the button to the scroll position; on a fast scroll that reads as a laggy animation. The original
   does not follow the scroll, and neither should the fix.

The lead's spec for rev 3: the original look and timing at both places (timer from the 72 % flip at the top; the
original hide at the end), the width reserved so nothing lays out per frame, only opacity / clip-path / mask /
transform animated, no per-frame style writes from script, one class flip per state change; fold in F-243; numbers
per frame for both directions and the end of the page, Chrome and Simulator.

**Trace (why the original lags).** The button's look is `max-width` / `padding-inline` (0.68 s) and the actions `gap`
(0.68 s): three layout properties on CSS transitions, so every frame of the 0.68 s grow or shrink is a full nav
layout (Chrome phone: 43 layouts in the 0.7 s after the 72 % flip, 43 in the hide, vs 1-2 when still; v8 numbers
below). At the end of the page the same rules are driven by `--morph` every frame while their transitions stay on,
so every frame restarts them (the double drive, F-222 / research/v8-double-drive). Simulated in
`scratchpad sim-end.mjs` (the restarted transitions frame by frame, ZM's 680 ms ease-out cubic): the result is the
same curve as ONE 0.68 s transition started where `--earn-out` reaches 1 (morph 0.2, ~50 ms in) for the hide (max
error 0.001 of the width), and one started at morph 0 for the show (max error 0.017-0.034). So "the original timer"
at the end is a plain timer too, and rev 3 can play it as one.

**Change (rev 3, replaces rev 2's top part and rev 1's `transition: none` on the button; rev 1's phone logo rule
stays).**
- Layout reserved: the button keeps `max-width: 11rem` (9.5rem phone), `padding: 0`, no background; its dark pill and
  label move into a new inner `span.start-selling-top-nav-earn-box` (background, radius, `padding-inline` 24 / 16 px).
  The actions gap is a constant 8 / 4 px. So the nav's layout is the same in every state.
- The original's geometry is drawn with compositor-friendly properties (CSS ~11946-12010, JS ~13860-13950):
  - width w(e) = min(W − 2P(1 − e), M·e) (W = the button's full width, P = padding, M = max-width; the original's
    `max-width` / `padding-inline` pair), shown as `clip-path: inset(0 X round 999px)` on the span and
    `translate: X` on the button, X = (W − w)/2, so the visible pill has the original's width and right edge;
  - the language switch: `translate: W − w + G(1 − e)` (the width and gap the original had not grown yet);
  - e runs on the original's 0.68 s `cubic-bezier(.33, 0, .2, 1)`; a reversal mid-way starts from the current e and
    takes 680·|Δe| ms (as a reversed CSS transition shortens);
  - played as one Web Animation per element per state change (button, span, switch; 25 keyframes, linear between
    them), started by the nav's own effect when the state flips. No script runs per frame.
- States: shown ↔ hidden. Hidden = `.is-hero-pill` (the top, as before) or the new `.is-earn-hidden` (end of the
  page: on when morph ≥ 0.2, off when morph is back at 0; the original's own thresholds). The hidden CSS state equals
  the animations' end (`opacity: 0; translate: 50%`, span `clip-path: inset(0 50%)`, switch translated), so nothing
  jumps when an animation ends.
- Opacity keeps the original's transitions on the class flip (0.32 s after 0.12 s; 0.2 s back into the pill). The mask
  sweep and the sheen are the original's, unchanged.
- End of page, per frame: the original closes the actions gap with `--morph` (no timer, morph 0-0.2). Rev 3 keeps that
  as a per-frame `transform` on the switch (`translateX(clamp(morph/0.2) * 8px)`, under `.is-morphing`); `--morph` reaches
  the switch through the existing F-183 writer list (one entry added). The blur and lift on the button stay per frame
  as in the original (`filter`, `transform`).
- The full width W, P, M and G are read by one ResizeObserver on the button (writes `--earn-w` on the actions row when
  W changes, e.g. phone ↔ desktop media), never per frame.
- F-243 folded in: `.is-morphing` is now `morph > 0` (was `> 0.001`), so the bar's `:not(.is-morphing)` transitions no
  longer come back for the close's last ~68 ms and retarget ~5 times.
- Reduced motion: no Web Animation (the state is set at once, as the original's `transition: none` there).

**Engine facts used (with status).**
- WebKit can run `opacity`, `transform`, `translate`, `scale`, `rotate`, `filter`, `backdrop-filter` animations as
  accelerated (Core Animation) animations: CONFIRMED, WebKit main 67847a3bb5 `Source/WebCore/css/CSSProperties.json`
  (`"animation-wrapper-acceleration": "always"`: opacity line 7589, filter 10835, transform 12786, translate 12934).
  `clip-path` (4317), `mask-image` (6665) and `mask-position` (6761) have no such key: they animate on the main thread
  and repaint the button's layer each frame (CONFIRMED by the same file). Whether a given animation actually runs
  accelerated also depends on `KeyframeEffect::canBeAccelerated` (`KeyframeEffect.cpp` 1973-2038: on the Core Animation
  path a `steps()` or `linear()`-with-points timing or a non-replace composite blocks it; rev 3 uses plain `linear`,
  replace). That our Web Animations do run accelerated on the shipped iOS Safari: OBSERVED only where the Simulator
  numbers below say so; UNRESOLVED on the real iPhone (not run).
- Chrome composites `translate`, `transform`, `opacity`, `filter` and (Chrome 152+) `clip-path` animations: CONFIRMED,
  `third_party/blink/renderer/core/animation/compositor_animations.cc` `kCompositableProperties` (lines 78-84);
  clip-path compositing default-on since commit 1489d51728 (152.0.7951.0). A mixed effect falls back to the main thread
  as a whole, so rev 3 uses one animation per element and property group.
- So in WebKit the span's clip is main-thread paint (no layout, no style per frame from script); the original's mask
  sweep is too, in v8 and rev 3 alike.

**Known approximations (OBSERVED in the stills; small).**
- The text mask sweep is sized on the reserved width W, not on the growing width; it starts at 0.52 s, when the
  original is already within ~2 px of W.
- The original's partial reverse when a morph is opened only to 0-0.2 and let go is not modelled: rev 3 hides only
  past 0.2 and shows again at 0, the original's own thresholds.
- End-of-page show: one timer started at morph 0 vs the original's restarts (≤ 0.034 of the width).

**Rev 3 numbers (OBSERVED, Chrome headless, `probe/r3-probe.mjs`, phone 430x775 DPR 3,
out/nav-earn/r3-2026-10-04T20-59-35-520Z; A = v8, R3 = v8 + rev 3; `Performance.getMetrics` counts over the window,
divided by the rAF frames in it; not a timing claim).**

| window | frames A / R3 | layouts A | layouts R3 | layouts per frame A → R3 | style recalcs per frame A → R3 |
|---|---|---|---|---|---|
| still, full bar (1.5 s) | 91 / 91 | 1 | 2 | 0.01 → 0.02 | 0.99 → 0.99 |
| still, hero pill (1.5 s) | 91 / 90 | 1 | 3 | 0.01 → 0.03 | 0.99 → 1.00 |
| top reveal, 0-0.7 s after the 72 % flip | 126 / 129 | 43 | 2 | 0.34 → 0.02 | 0.36 → 0.36 |
| top reveal, 0.7-1.6 s | 220 / 224 | 1 | 1 | 0 → 0 | 0.25 → 0.25 |
| top un-reveal, 0-0.7 s | 42 / 43 | 43 | 3 | 1.02 → 0.07 | 1.07 → 1.05 |
| glide down 0.5 → 0.8 of the hero in 1 s (2.6 s window) | 157 / 156 | 47 | 5 | 0.30 → 0.03 | 1.39 → 1.40 |
| glide up 0.8 → 0.5 | 312 / 312 | 47 | 6 | 0.15 → 0.02 | 0.70 → 0.70 |
| end of page, still (1 s) | 60 / 60 | 0 | 0 | 0 → 0 | 1 → 1 |
| end of page, open (1.5 s) | 182 / 180 | 45 | 41 | 0.25 → 0.23 | 0.50 → 0.50 |
| end of page, close (1.5 s) | 270 / 270 | 83 | 43 | 0.31 → 0.16 | 0.33 → 0.33 |

- Page errors / failed requests: 0 / 0 in both arms.
- The ~41-43 layouts left at the end of the page are the morph itself (the bar grows into the end panel: v8's width
  and height), not the button: the button's share was 4 in the open (A 45 → 41) and 40 in the close, where the
  original re-grew it on its 0.68 s layout timer after the morph ended (A 83 → 43).
- Style recalcs per frame do not change: the page restyles every frame for its other animations in both builds; rev 3
  adds no per-frame style writes (its per-frame values are Web Animations and the existing `--morph`).
- Desktop (1440x900), the double-drive probe (rev 3 vs rev 2) and the Simulator (WebKit) Timeline counts: pending when
  rev 3 was posted (lead, roles v3: post once the phone probe passes); they follow in this section and in PR-021.

**Same look (frozen stills, `R3_RATE=0.1` slow motion then frozen per still, `probe/r3-pxdiff.mjs`; nav strip only).**
Top reveal 0-1500 ms and un-reveal 0-700 ms, every still: A vs R3 differ in ≤ 0.40 % of the strip's pixels by more
than 64 levels and ≤ 0.31 % by more than 128 (max 212), all of it on the moving language switch (its glyph and
border edges; likely sub-pixel placement under `translate` vs layout's pixel snapping, OBSERVED, cause not separated), inside the PR-010 wide numbers (fill 64, edge 128, 0.5 %). At rest (0 and ≥ 700 ms): 0 %. End of page: ≤ 1.8 %
(> 64) / ≤ 1.4 % (> 128) while the morph runs, located on the logo (rev 1's phone logo fix, the part the user kept) and
on the switch edge; the button itself matches (montages: out/nav-earn/r3-…/mont-phone-*.png).

**Hit testing.** The button takes clicks only in the full-bar state when not morphing (unchanged rules); hidden, it is
`pointer-events: none` and its reserved slot shows the language switch translated over it (hit testing follows
transforms), as in the original.

## Rev 2 (PR-021 changes-requested, T-154): the top-of-page appear follows the scroll too

The user on rev 1: the end-of-page open/close is "SOOOO ULTRA SMOOTH", but the button's appear when scrolling down
from the top "still lag a bit. i guess you didn't apply this on the scroll on the top of page". Correct: rev 1 only
touched the morph (`.is-morphing`) rules. **Rev 2 keeps rev 1's two CSS rules byte-identical** and adds the top part.

**Trace (OBSERVED, v8, `probe/top-probe.mjs`, Chrome headless, DOM samples per rAF; no timing claim).** The bar leaves
its hero-pill state in one step when the hero track is 72 % scrolled (JS `_` in the nav effect, `z(p, i / r >= 0.72)`;
`is-hero-pill` = not `p` and not morphing). From that frame the button grows on its own clock, not with the scroll:
`--nav-expand` 0 → 1 drives `max-width` / `padding-inline` through `.68s` transitions, `opacity` through `.32s` after
`.12s`, the actions gap through `.68s`, and the text is revealed by the `nav-earn-unmask` mask sweep (`.98s` after a
`.52s` delay; the sheen runs with the same timing). Scrolling back above 72 % runs the same clocks backwards.

| v8, after crossing 72 % | phone 430x775 | desktop 1440x900 |
|---|---|---|
| width full | 587 ms | 604 ms |
| opacity 1 | 436 ms | 437 ms |
| text sweep done (animations end) | 1487 ms | 1504 ms |
| frames whose layout changed | 41 | 41 |
| glide 0.50 → 0.80 in 1 s: width full after the crossing | 582 ms | 582 ms |
| scrolling back: width 0 after the crossing | 633 ms | 616 ms |

Layout counts (`Performance.getMetrics`): 43 layouts in the 0.7 s after the crossing vs 2 in a still 1.5 s window, 1
in 0.7-1.6 s; the hide is the same (42). So the button keeps moving ~0.6 s after the scroll stopped and its text keeps
sweeping in until ~1.5 s: the "lag" the user sees.

**Change (rev 2, on top of rev 1).** The button follows the scroll inside a band just before the crossing:
- JS (nav scroll callback `_`, right after the 72 % flip): `--earn-in` = clamp((progress − 0.58) / 0.14), 0 → 1 over
  hero progress 0.58 → 0.72, rounded to 0.001, written inline on the actions row (`ie`) and the button (`oe`) only
  when it changes (no writes outside the band). Written on its readers, not inherited from the header: WebKit kept
  stale `inherit` values on registered non-inheriting properties (finding F-183, OBSERVED).
- CSS, hero-pill state only, no transitions: width / padding (`--earn-layout`), gap, opacity and the mask sweep
  position (`calc((1 - var(--earn-in)) * 100%)`) read `--earn-in`. At 0.72 every value is already at its full-bar
  value, so the class flip changes nothing on screen. Outside the pill state the unmask animation is replaced by its
  end state (`animation: none`, mask kept at `0 0`: the same pixels, also under the end-of-page blur); the sheen
  keeps its own timing.
- A fast flick that jumps over the whole band in one frame lands in the bar state with the original transitions
  (width and fade catch up in ~0.6 s; the text shows at once).
- Not a CSS scroll timeline: WebKit restyles every element with a scroll-driven animation each frame (CONFIRMED in
  fixes/hero-exit-threaded/README.md, WebKit main 13a1f2916933).

**Rev 2 numbers (OBSERVED, Chrome headless, `top-probe.mjs`, out/nav-earn/top-2026-10-04T20-15-42-191Z; A = v8 from
top-2026-10-04T19-57-32-526Z).** Build JS `f93d34915eb5` / CSS `044f52f797e5`.

| glide 0.50 → 0.80 → 0.50 (1 s each way) | A phone | B phone | A desktop | B desktop |
|---|---|---|---|---|
| width at the crossing (frame before → at) | 0 → 0 | 109.2 → 110.4 | 0 → 0.3 | 136.4 → 137.6 |
| full width after the crossing | 582 ms | 0 ms | 582 ms | 0 ms |
| button starts to grow at scroll y | 569 (after the crossing, 561) | 450 (band start) | 655 | 523 |
| largest width step per frame | 9.7 px | 5.6 px | 11.2 px | 7.1 px |
| scrolling back: width 0 after the back crossing | 633 ms | 467 ms (= when the scroll leaves the band) | 616 ms | 450 ms |
| layouts in the 0.7 s after an instant step across 72 % | 43 | 2 | 42 | 1 |
| layouts 0.7-1.6 s after / in the hide step | 1 / 42 | 0 / 3 | 1 / 43 | 1 / 4 |
| page errors / failed requests | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

The instant step starts at progress 0.66 (inside the band, button at 57 %), so B completes it in the step's own frame;
the sheen still runs to ~1.5 s by design (`animsEndMs` 1501). Still windows (no scroll): 1-2 layouts in both builds.

**Pending when rev 2 was posted** (lead, 2026-10-04: post once the Try-it pages work, slower checks follow): the
Safari check in the iOS Simulator (`sim-top-probe.mjs A,B`), frozen glide stills (`glide-stills.mjs phone A,B`) and
the end-of-page identity check rev 1 vs rev 2 (`EP_RATE=0.05 earn-probe.mjs phone R1,B`), all in one shared hold.

## What the user saw (T-148 #3/#6)

At the page end, when the top nav grows into the end panel, the Join waitlist button "disappears" and the right side
of the bar looks wrong for a moment. Traced (memory `trace-before-asking.md`), two causes, both in the original site
too (v8 does not touch these rules):

1. **The button collapses ~0.6 s late.** `.start-selling-top-nav-btn.is-earn` (pretty CSS 11477-11495) sets
   `max-width`, `padding-inline` and `opacity` from `--earn-out = clamp(morph / 0.2)`, so by design it is gone when the
   morph reaches 0.2 (~50-70 ms into the 680 ms spring, JS 12694/13020-13022). But its own
   `transition: max-width .68s, opacity .32s .12s, padding-inline .68s` stays on while `.is-morphing`; only the
   actions gap has `transition: none` then (CSS 11451). So the button keeps its full width for ~0.6 s: it is blurred at
   once (`filter`, no transition) but stays opaque until ~0.2 s, a dark smudge at the right, and the language switch
   (EN) sits ~118 px from the right edge, then slides to 8 px as the width transition catches up (finding F-222).
2. **The phone logo jumps ~15 px** (≤ 640 px only). The logo is `scale: .75` with `transform-origin: 0`
   (CSS 11577-11580); under `.is-morphing` the origin becomes `50%` (CSS 11581-11583), which moves the scaled logo by
   0.125 × 122 px = 15.25 px in one frame at the morph start, and back in one frame at the morph end when closing.

## What changed (`delta.diff`, CSS only)

```css
.start-selling-top-nav.is-morphing.svelte-1dcozpm .start-selling-top-nav-btn.is-earn:where(.svelte-1dcozpm) {
  transition: none;                                  /* new: the button follows the morph like the gap does */
}
@media (width<=640px) {
  .start-selling-top-nav.is-morphing.svelte-1dcozpm .start-selling-top-nav-logo:where(.svelte-1dcozpm) {
    transform-origin: calc(50% * var(--morph));      /* was 50%: 0 at morph 0 (as at rest), 50% at morph 1 (as now) */
  }
}
```

- Rest states are unchanged: both rules only apply under `.is-morphing` (morph > 0.001); at morph 1 the origin is 50%
  as before, so the open panel is the same picture (pixel check below). The logo keeps `--morph: inherit` from v8's
  scene-scope rule, so it reads the header's value.
- Outside the morph the button keeps its transitions (hero pill ↔ full bar still animates).
- Reduced motion: already `transition: none` on the button; the morph is instant there; nothing changes.
- Desktop: the same late collapse (618 ms) shows there, so the first rule applies at every width; the logo rule is
  ≤ 640 px only (desktop logo has no scale, no jump).

## Numbers (OBSERVED, in our setup; DOM probe, no timing claim)

`fixes/nav-earn/probe/earn-probe.mjs` (Chrome headless, real-speed per-rAF samples) and `sim-probe.mjs` (iOS
Simulator, Safari). A = v8, B = v8 + this. "Lag" = time from morph ≥ 0.2 (where the design wants the button gone) to
the button's width reaching 0.

| | A lag | B lag | EN from right edge at morph 0.2: A / B |
|---|---|---|---|
| Chrome 430x775 | 617 ms | 0 | 118 px / 8 px |
| Chrome 430x932 | 617 ms | 0 | 118 px / 8 px |
| Chrome 1440x900 | 618 ms | 0 | 145 px / 8 px |
| Simulator (WebKit) 430x775 | 610 ms | 0 | 86 px / 8 px |

Logo (phone), first morphing frame and last frame of the close:

| | A | B |
|---|---|---|
| open, first frame (Chrome, m 0.07 / 0.03) | 16 → 39.7 px | 16 → 20.6 px (normal slide) |
| open, first frame (WebKit, m 0.08 / 0.07) | 16 → 40.7 px | 16 → 25.5 px |
| close, last frame (Chrome / WebKit) | 31.5 → 16 px (snap) | 16.1 → 16 px |
| Join waitlist back to full width after close (Chrome) | 1264 ms (~630 ms after the morph ended) | 606 ms (with the morph) |

Page errors / HTTP ≥ 400 in every probe load: 0 / 0.

## Pixel checks

- **Frozen stills** (`earn-probe.mjs`, slow motion: CDP `Animation.setPlaybackRate` 0.05, then 0 to freeze at each
  still; OBSERVED in Chrome headless: rAF stamps follow `document.timeline` under that rate while `performance.now`
  does not, so the probe points `performance.now` at the timeline and the page's spring freezes with the CSS
  transitions). Outside the nav box, B vs A stays within A vs A at every still (phone, levels > 8: A~A2 0-0.87 %,
  A~B 0-1.0 %, A2~B 0-0.16 %; the differing area is the animated avatar row in both pairs); at morph 1 the whole
  frame matches (outside nav 0 %, inside 0.19 % vs A/A 0.18 %: countdown digits).
- **Simulator endpoints** (before, open, closed; not frozen): A vs B differ only at the status-bar clock and the
  countdown digits.

## Proposal and Try-it

PR-021 (posted 2026-10-04, Try-it phone pages http://lan:6403/ (A) and http://lan:6404/ (B)): A = v8 (`--live-a-patch fixes/v8-best/patch.diff`), B = `fixes/nav-earn/patch.diff`; frame-by-frame
nav stills of the morph start (0, 16, 33, 50, 67, 100, 150, 200, 300, 450, 700, 1000 ms) for phone and desktop.

## Reproduce

```sh
# rev 3 (fixes/nav-earn/overlay = rev 3; A = fixes/v8-best/overlay; R3_RATE = slow-motion rate for the stills)
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- \
  node fixes/nav-earn/probe/r3-probe.mjs phone A,R3             # counts per window + frozen nav strips -> out/nav-earn/r3-<tag>
node fixes/nav-earn/probe/r3-pxdiff.mjs out/nav-earn/r3-<tag>   # A vs R3 strip pixel diff per sequence and still
node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner <you> -- \
  node tools/sim.mjs session --functional --owner <you> -- node fixes/nav-earn/probe/r3-sim.mjs A,R3   # WebKit Timeline counts
node tools/fix.mjs apply v8-best && node tools/fix.mjs apply nav-earn      # or: combine x v8-best fixes/nav-earn/delta.diff
EP_RATE=0.05 node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- \
  node fixes/nav-earn/probe/earn-probe.mjs phone A,A2,B                        # also: tall, desktop; O = plain baseline
node fixes/nav-earn/probe/summary.mjs out/nav-earn/probe-<tag>
PX_ARMS=A,B node fixes/nav-earn/probe/pxdiff.mjs out/nav-earn/probe-<tag>
python3 fixes/nav-earn/probe/montage.py out/nav-earn/probe-<tag> phone A,B
node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner <you> -- \
  node tools/sim.mjs session --functional --owner <you> -- node fixes/nav-earn/probe/sim-probe.mjs A,B
```

## Risks, conflicts, follow-ups

- The button now collapses in ~3-4 frames (up to ~50 px per frame at 120 Hz in Chrome) together with its blur and
  fade, as the `--earn-out` design (morph 0-0.2) says; the language switch moves with it. If that reads too fast, a
  later change could widen the `--earn-out` range; that would be a design change, not this fix.
- Touches only the nav's CSS. fix-nav-morph's hit cache tracks transitions on the nav element and theme sections, not
  its descendants (its note, 2026-10-04): no coupling. The morph spring (shared with fix-hero-exit-threaded's PR-018)
  is not touched.
