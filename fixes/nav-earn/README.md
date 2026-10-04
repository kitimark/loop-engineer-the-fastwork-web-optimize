# Fix: nav-earn (user T-148: Join waitlist and padding at the end-of-page morph)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** built and checked (DOM probe, frozen stills, pixel check, WebKit Simulator); visual change, so a proposal
(PR-021); **not timed** (memory `defer-timing-focus-call-tree.md`; this is a visual bug, not a cost fix).
**Base:** v8 (best build, `fixes/v8-best/`, JS `3e3e94cb6e9f` / CSS `f836404b3728`). **This build:** JS `3e3e94cb6e9f`
(unchanged) / CSS `9581cd83004c`. Baseline snapshot `b1789284481295-4ad4a84a`.
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only (2 rules). `delta.diff` = the change on top of v8;
`patch.diff` = baseline-relative (v8 + this), what `fix.mjs apply` and the proposal's Try-it serve.
**Driver(s):** Chrome DOM probe (synthetic wheel into the page's own capture listener, per-rAF samples) and the same in
the iOS Simulator (Safari). No iPhone run (memory `simulator-for-non-perf-phone-jobs.md`).

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
