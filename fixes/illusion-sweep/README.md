# Fix: illusion-sweep

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (PoC; proposal to the user, awaiting accept)
**Stage:** R / I (counts only; user direction 19:27Z: no timing A/B)
**Device class / gate:** Chrome-measurable for style and repaint counts; WebKit blend compositing needs the phone
**Driver(s) behind the claims:** Chrome LayerTree census (counts, CPU 1x, n=1)
**Topic:** cheaper look-alikes, composite side (`research/design-engineering/illusion-composite.md`), stacked on B (`fixes/user-bplus`)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` (one `@media (prefers-reduced-motion: no-preference)` block
and one `@keyframes`, appended)

## Why it costs

The four platform row titles (Document, Earn, Secure, Organized) run `start-selling-platform-i-doc-sweep`. The
keyframes are at CSS 5842 and the uses at 5743/5805/5886/5947/5994/11153 (B overlay):
- `background-position` 100 % -> 0 %, 4 s linear, infinite;
- on a 300 %-wide `linear-gradient` clipped to the glyphs (`background-clip: text`).

`background-position` is not a compositor property, so every frame does style recalc on the title and repaints it
inside the `div.start-selling-platform-card` layer (860x3762 layer px):
- **120 repaints/s** of that layer at y 4300-5345 in A and in B (hold 1 and hold 2, OBSERVED);
- de-style-recalc's trace makes it B's largest per-frame UpdateLayoutTree source in Chrome.

PMsweepGate (JS 3970-3990) already pauses titles that are off-screen.

## What changed

**The word.** It becomes `color: #fff` on a `#131922` box, the card colour. The span is an isolated group
(`z-index: 0; isolation: isolate`), clipped by `clip-path: inset(0)`. A `box-shadow: 0 0 0 3px #131922` spread gives
the clip's edge pixels an opaque backdrop.

**The band.** A `::after` carries the same gradient:
- `width: 300%`, `mix-blend-mode: darken`, `will-change: transform`;
- `fw-illusion-sweep-band` animates `translateX(-66.6667%) -> translateX(0)`, 4 s linear, infinite. That is exactly
  the image offset that `background-position` 100 % -> 0 % gives at `background-size: 300%`;
- `[data-sweep-paused]::after` is paused like the span was.

**Why darken works.** It keeps the per-channel minimum:
- over a white glyph pixel it gives the band colour;
- over the `#131922` box it gives the box, because every band colour is ≥ `#131922` per channel. The orange stop
  `#fe7b02` (blue 2) becomes `#fe7b22` for this;
- the band's white thirds are invisible.

Reduced motion keeps the site's own static rule (the new block sits inside `prefers-reduced-motion: no-preference`).

## Counts (hold 2, Chrome 430x932 DPR3 mobile+touch, CPU 1x, n=1, OBSERVED)

| position | platform-card repaints B -> PoC | doc-sweep non-GPU animations in view B -> PoC | layers B -> PoC |
|---|---|---|---|
| y 4300 | 120.5/s -> 0 | 1 -> 0 | 65 -> 71 |
| y 4800 | 120.5/s -> 0 | 2 -> 0 | 72 -> 78 |
| y 5345 | 120.5/s -> 0 | 3 -> 0 | 64 -> 70 |

- The repaint upper bound from layer size drops from ~390 Mpx/s to 0.4-6 Mpx/s. What is left is the ask-field caret
  and the SMIL dash glint.
- +4 band layers; the other 2 are path-dependent.
- No console errors. The two 404s (`post-1/2.avif`) are in B too.

## Visual

Compared with the sweep frozen at the same `currentTime` (1600 ms) on both arms:
- the colours match;
- hold 2 showed a hairline box at the clip edge. The band blended with the group's transparent initial backdrop
  (Compositing 1 §8.2) on the anti-aliased edge pixels. The box-shadow spread fixes it; see the hold 3 note in
  `research/design-engineering/illusion-composite.md`.
- Expected remaining difference: glyph edge pixels are `min(edge, band)` instead of `mix(card, band, coverage)`,
  i.e. very slightly bolder colour at glyph edges.

## Risks, conflicts, follow-ups

- WebKit: `mix-blend-mode` on a transform-animated composited layer inside a clipped isolated group. UNRESOLVED
  whether it stays on the compositor, so phone check needed (Safari Timeline: paint records at y 4300).
- Assumes the card behind the titles is flat `#131922` (`.start-selling-platform-card` background, CSS 5576). A
  future design with a textured card background would show the box.
- Desktop widths use the same rule; not checked there.
