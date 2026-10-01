# Fix: illusion-nav-glass

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (PoC; proposal to the user, awaiting accept)
**Stage:** R / I (counts only; user direction 19:27Z: no timing A/B)
**Device class / gate:** phone-only (GPU backdrop blur; Chrome shows only the layer/reason counts)
**Driver(s) behind the claims:** Chrome LayerTree census (counts, CPU 1x, n=1)
**Topic:** cheaper look-alikes, composite side (`research/design-engineering/illusion-composite.md`), stacked on B (`fixes/user-bplus`)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` (one `@media (width<=640px)` block appended)

## Why it costs

The floating nav pill (`.start-selling-top-nav`, CSS 11370-11404) has `backdrop-filter: blur(calc(20px * (1 -
var(--morph))))` over a 10 % white fill. Its language switch (CSS 11160-11185) has `blur(12px)` over `#ffffffb8`.
Both are fixed over scrolling content, so every scrolled frame re-blurs the pixels under them:
- about 400x64 CSS px for the pill;
- at 3x on the phone, about 1200x190 device px through a 20 px Gaussian.

In Chrome these show as 2 BackdropFilter layers at every position. The blur's GPU cost does not show in our counts
(phone check needed).

## What changed

At phone widths (≤ 640 px):
- **Blur removed.** The pill and the switch get `backdrop-filter: none`.
- **Pill fill.** Near-opaque, in the colour the frosted pill shows over a plain section, sampled from B screenshots:
  - over light sections: `#fffffff0`;
  - over dark sections: `#2c3038fa`, chosen by the nav's existing `is-on-dark` class (JS 13599, from the `F()` hit
    test at JS 13212).
- **Morph unchanged.** The same `color-mix(... , #131922 calc(var(--morph) * 100%))` keeps the morph's
  fade into the panel colour.
- **Switch on dark.** It gets 22 % white instead of 12 %, because without its own blur it read darker than B's
  (B `#5a5e63` vs `#484a51`; P8 saw the same).

## Counts (hold 2, Chrome 430x932 DPR3 mobile+touch, CPU 1x, n=1, OBSERVED)

| | B | PoC |
|---|---|---|
| backdrop-filter elements in view | 2 at every position | 0 at every position |
| BackdropFilter compositing reasons | 1-2 | 0 |
| layers at y 0 (same scroll path) | 126 | 125 |
| layer repaints | unchanged | unchanged |

Layer totals further down the page depend on the scroll path (scene gating); hold 3 re-measures on equal paths.
No console errors; the two `post-1/2.avif` 404s exist in B too.

## Visual (hold 2, top 240 px of the viewport)

- **Over plain dark sections:** the pill matches (`#2c3038` vs `#2b2e36`).
- **Over white sections:** B shows faint blurred text through the pill; the PoC shows clean white.
- **Visible difference, 1:** where a light image card scrolls under the pill inside the dark platform section
  (y 4800), B's pill turns light and frosted, while the PoC pill stays dark grey.
- **Visible difference, 2:** headings passing under the pill are hidden instead of frosted.

This is the iOS "Reduce Transparency" look.

## Risks, conflicts, follow-ups

- The pill's look and `is-on-dark` belong to the nav theme. The morph R1-R8 work (fix-nav-morph, de-morph) touches
  the same rule; this PoC only overrides `background` and `backdrop-filter` at ≤ 640 px.
- `is-on-dark` is a hit test at the pill's centre, so a fill switch is as fast as that test. The pill's
  `background 0.7s` transition (not morphing) cross-fades the two fills: a small repaint of the pill for 0.7 s
  per switch.
- The gain is GPU-only and needs the phone; Chrome counts can't show it.
