# Cheaper look-alikes, composite side (de-illusion-composite)

User request (2026-10-02, priority 2): find more topics that cut style recalc and compositing cost while the page
still looks like the Fastwork design ("optical illusion rendering is acceptable"); build PoCs and ask the user to
accept each one. This note covers compositing, layers, blur/filters, raster and paint. The style/layout half is
`de-illusion-style` (PoCs illusion-boil-ca, illusion-accent-wipe, illusion-typing-chunks).

User direction 19:27Z (relayed by mgmt-ops-6): timing is deferred. Every number here is a **count** (layers,
compositing reasons, layer repaints) from Chrome, with a visual compare. There are no timing A/Bs and no phone runs.
Every gain says "phone check needed".

## Method

- Probe: `census.mjs` (scratch, `out/dic/`, not committed). It uses Chrome with its own profile: 430x932 DPR 3
  mobile + touch, **CPU 1x** (counts, not timing), served `--vendors=local --latency 150`.
- For each scroll position it waits 1.2 s, then records over a 2 s idle window:
  - the layer tree (`LayerTree.layerTreeDidChange`): count, drawing layers, total layer area;
  - per-layer `paintCount` deltas, i.e. repaints per second;
  - compositing reasons of the first 120 layers;
  - in-viewport counts of will-change, filter, backdrop-filter and mix-blend-mode;
  - running animations whose keyframes animate a non-GPU property;
  - a screenshot, with the sweep animations paused at the same `currentTime` on both arms for the visual compare.
- Layer px = CSS px x 2 (host DSF, F-077), not x 3.
- `paintCount` counts layer repaints, not raster area. Chrome re-rasters only the dirty rect, so "Mpx/s" built from
  layer size is an upper bound (OBSERVED in our setup; Chrome's per-rect raster invalidation is the documented
  design, but this note does not cite it, so it stays OBSERVED here).
- Holds, all short lane and counts only:
  - hold 1: A (baseline) and B (`user-bplus`), 9 positions plus a morph hold;
  - hold 2: B against the three PoCs, each stacked on B;
  - hold 3: re-shot after two visual fixes.
- n = 1 per arm. Layer totals depend on the scroll path, because scene gating keeps or drops layers. Totals are
  compared only between arms that took the same path.

## Inventory: what B composites and repaints (hold 1, OBSERVED, n=1)

| what | where | B count | note |
|---|---|---|---|
| hero countdown digit faces | CSS 1414 `.face` will-change: transform; JS 4023-4080 | 80 layers, kept from y 0 to y 2700 (WillChangeTransform 83-86 per position); 126 layers at y 0 (A: 106) | created/destroyed at every hero scene flip by the pause rule |
| platform row title sweep (doc-sweep) | CSS 5842 keyframes, uses 5743/5805/5886/5947/5994/11153; 4 titles | `div.start-selling-platform-card` (860x3762 layer px) repaints **120/s** at y 4300-5345 in A and B | main-thread `background-position` animation on a `background-clip: text` gradient; de-style-recalc's trace: B's #1 per-frame style emitter in Chrome (314 UpdateLayoutTree / 323 ms per scroll at 6x) |
| nav pill + language switch glass | CSS 11392 pill `backdrop-filter: blur(20px*(1-morph))`, 11165 switch `blur(12px)` | 2 BackdropFilter layers in view at every position | phone GPU cost: re-blur of what scrolls under them; invisible to Chrome counts |
| secure-network dash glint | JS 12395-12470 (SMIL `<animate>` on linearGradient x1/x2, 5 s indefinite) | 2 layers (188x9 layer px) repaint 120/s at y 4800+ | small area; SMIL ticks on the main thread |
| hero copy | `header.hero-copy` 786x923 layer px | 55/s at idle y 0 (A: 90/s) | de-illusion-style: the accent stroke-dashoffset draw (their illusion-accent-wipe); not counted here |
| future card reveal | `div.start-selling-future-card` | 54/s at y 700 | reveal; others' topic |
| fee count-up, typing caret | `fee-visual` 37/s at y 3500; `agents-ask-field` 4-24/s | | de-illusion-style (typing-chunks) |
| morph veil | `morph-veil` 46/s during the morph hold | | morph owners (fix-nav-morph, de-morph) |
| grain blends | CSS 6399, 8257, 8958 `mix-blend-mode: overlay` + grain.png; 8955 soft-light; 11563 screen | 1-2 blend layers at the bottom | static; low gain |
| paid-border/rail packets | CSS 9521-10030, ~20 one-shot stroke-dashoffset draws | | F-097 (CONFIRMED): a Layout difference on WebKit; style/layout side |
| static stage blurs | CSS 707 (16px), 4255, 10401 (6px), 11668 (8px) backdrop; `blur(16px)` stage backgrounds | | static or off the scroll path; large-area-blur (09) already dropped the big one |

Ranking by gain x visual safety gives three PoCs:

1. digit-layers: highest safety, pixels unchanged;
2. sweep: largest repaint and style term, near-identical look;
3. nav-glass: phone-GPU only, a visible but design-consistent change.

Not built:
- the glint: tiny area;
- grain: static;
- packets: layout, and the style side's;
- morph, hero exit, scene flip, boils, carets, typing and accent: owned by other topics.

## PoC 1: illusion-digit-layers (`fixes/illusion-digit-layers/`)

`.face` drops `will-change`; `.number` (4 per countdown) takes it. Faces paint into their number's layer. Same
transforms and pixels; the morph panel stays layer-free (cdwc).

| position (hold 2) | B layers | PoC layers | WillChangeTransform B -> PoC |
|---|---|---|---|
| y 0 | 126 | 49 | 86 -> 10 |
| y 1250 | 138 | 66 | 85 -> 10 |
| y 2700 | 138 | 61 | 83 -> 7 |

Cost side: the seconds number box (72x73 layer px) repaints ~45/s while it slides (one ~0.4 s spring per second).
Visual: no difference beyond the time shown. Status: **OBSERVED**. Phone check needed: WebKit layer count and
per-flip churn.

## PoC 2: illusion-sweep (`fixes/illusion-sweep/`)

**What changes.** The four titles (Document, Earn, Secure, Organized) become plain white text on a box in the card
colour `#131922`. The span is an isolated group (z-index: 0) clipped by `clip-path: inset(0)`. The same gradient
rides over the word on a `::after` band:
- 300 % wide, `mix-blend-mode: darken`, `will-change: transform`;
- animated `translateX(-66.67%) -> 0` over 4 s linear, which is the same path as `background-position` 100 % -> 0 %
  at `background-size: 300%`;
- paused off-screen by the same `[data-sweep-paused]` gate.

**Why darken works.** Darken keeps the per-channel minimum:
- over a white glyph pixel the band colour shows;
- over the `#131922` box it leaves the box, as long as every band colour is ≥ `#131922` per channel. The orange stop
  `#fe7b02` has blue 2 < 34, so the band uses `#fe7b22` (the only colour change);
- the white parts of the band are invisible.

| position (hold 2) | B: platform-card repaints | PoC | B non-GPU animations in view | PoC |
|---|---|---|---|---|
| y 4300 | 120.5/s (391 Mpx/s upper bound) | 0 | 1 (doc-sweep) | 0 doc-sweep (1 = nav earn mask) |
| y 4800 | 120.5/s | 0 | 2 | 0 |
| y 5345 (bottom) | 120.5/s | 0 | 3 (doc-sweep; the SMIL glint is not in getAnimations) | 0 |

- Layers: +4 band layers, plus about 2 that are path-dependent.
- Visual (frozen at the same phase):
  - the colours match;
  - hold 2 showed a hairline box at the clip edge, from the band's white blending with the transparent edge of the
    group. Fixed with a 3 px `#131922` box-shadow spread inside the clip; re-shot in hold 3 (below).
- Status: **OBSERVED** in Chrome. Phone check needed: WebKit `mix-blend-mode` on a composited, transform-animated
  layer; UNRESOLVED without a reference or a Safari record.

## PoC 3: illusion-nav-glass (`fixes/illusion-nav-glass/`)

**What changes**, at phone widths (≤ 640 px):
- the pill and the language switch lose `backdrop-filter`;
- the pill fill is near-opaque, in the colour the frosted pill shows over a plain section:
  - white over light sections;
  - `#2c3038` over dark ones (sampled from B screenshots);
  - picked by the nav's existing `is-on-dark` hit test (JS 13212, `F()`);
- the morph still mixes into `#131922` by `--morph`;
- the switch on dark gets 22 % white instead of 12 %, to match B's lighter frosted switch (P8 saw it go darker
  without blur).

| count (hold 2) | B | PoC |
|---|---|---|
| backdrop-filter elements in view | 2 at every position | 0 |
| BackdropFilter compositing reasons | 1-2 | 0 |
| layers at y 0 (same path) | 126 | 125 |

**Visual** (hold 2, top 240 px of the viewport):
- over plain dark sections the pill matches (fill `#2c3038` vs `#2b2e36` before the alpha tweak);
- over white sections, B shows faint blurred text through the pill and the PoC shows clean white;
- **visible difference:** where a light image card scrolls under the pill inside a dark section (y 4800), B's pill
  turns light, frosted from the card, while the PoC stays dark. This is the iOS "Reduce Transparency" look.

Status: **OBSERVED** (counts). The gain is phone-GPU only and cannot be seen in Chrome counts: phone check needed.

## Hold 3 re-shot: pending

Queued in the short lane but not run: parked at 20:41Z for the usage reset. On resume, one short hold of about 2 min
shoots B, sweep and nav-glass on the **same** scroll path (0, 2700, 4300, 4800, bottom), with the sweep frozen at
1600 ms. It checks two fixes:
- the sweep's clip-edge hairline, fixed by the box-shadow spread;
- the nav switch tint (22 % white).

It also gives path-equal layer totals for nav-glass. Proposals 2 and 3 are posted after that.

## Claims status

- WebKit `mix-blend-mode` on a composited layer, as a Core Animation compositing filter: UNRESOLVED. The decisive
  check is a Safari Timeline record of the sweep PoC (layer count, paint records at y 4300).
- "Chrome rasters only the dirty rect of a repainted layer": OBSERVED (not cited here); used only to call layer-size
  Mpx/s an upper bound.
- Isolated groups: per Compositing and Blending Level 1 §3.2, an element that creates a stacking context is an
  isolated group, and §8.2 says the initial backdrop of an isolated group is "black and fully transparent" (spec,
  https://www.w3.org/TR/compositing-1/, §3.2 "Behavior specific to HTML", §8.2 "Isolated Groups"). CONFIRMED. This is
  why the sweep span carries its own opaque `#131922` box. It also explains the hold-2 hairline: on the clip's edge
  pixels, the band blended with the transparent backdrop.
