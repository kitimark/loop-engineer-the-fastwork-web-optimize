# Fix: panel-clock-layer (the morph panel's countdown gets its own layer, iOS WebKit only)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** both gates pass (Chrome 0 diff with the rule inactive; Simulator T2 0 % consistent). Offered for a v10 slot
(lead, 11:18Z). **Owner:** arch-compositor-morph (lead's item; census by fix-end-morph, T-215). No timing claim.
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only (+11 lines at the end). The CSS works on v9-final
and on the v10 base: one selector the morph panel already has, no JS.

## Mechanism

- **Today:** while the morph panel is open, the panel countdown (`.countdown.inverse`) rolls its digit strips about
  25 times a second (JS 4328, the rAF spring; tick setInterval at JS 4454).
- **The cost:** unlayered, every roll frame repaints the layer the clock paints into, the panel's veil
  (`div.start-selling-morph-veil`, 406 x 908 css px at m 1 in Chrome).
- **The change:** the clock gets its own layer (`transform: translateZ(0)`), so a roll frame repaints only the clock
  (376 x 88). The digits stay on the main thread on purpose; this is not a compositor animation (cd-roll-ca,
  JS 4286-4291).

## Why iOS only

| claim | status | reference |
|---|---|---|
| WebKit snaps a composited layer to device pixels and paints its content at the renderer's subpixel offset, so the glyphs keep their device-pixel phase | CONFIRMED (source) | WebKit `safari-7624.5.1.11-branch`, `Source/WebCore/rendering/RenderLayerBacking.cpp` 1619-1622 (`m_subpixelOffsetFromRenderer`), 3822 (`LayerPaintingInfo(..., -m_subpixelOffsetFromRenderer)`) |
| `-webkit-touch-callout` parses only on iOS-family WebKit, so `@supports (-webkit-touch-callout: none)` matches iOS Safari and nothing else we serve | CONFIRMED (source) | `Source/WebCore/css/CSSProperties.json` 13332-13348 (`enable-if: ENABLE_WEBKIT_TOUCH_CALLOUT_CSS_PROPERTY`); `Source/WTF/wtf/PlatformEnableCocoa.h` (`#if !defined(ENABLE_WEBKIT_TOUCH_CALLOUT_CSS_PROPERTY) && PLATFORM(IOS_FAMILY)` → 1); `PlatformEnable.h` default 0; Chrome check below (`CSS.supports` false, clock transform `none`) |
| Chrome 154 draws the new layer's text up to 1 device px away from where the veil painted it, in every layer variant we tried | OBSERVED (in our setup, cause unknown; no Chromium reference yet) | T2 table below |

So the rule is scoped with `@supports (-webkit-touch-callout: none)`, which only iOS WebKit matches. Chrome keeps
today's painting. The Simulator gate records `CSS.supports('-webkit-touch-callout', 'none')` and the clock's
computed transform, which proves the rule applies there.

## Chrome T2 of the unscoped variants (why the scope)

Method: `gates/cm-px2.mjs` (compositor-morph), Chrome 430x932 DPR 3, 4 loads (A, V, A2, V2), stops pre / up 0.55 /
up 1. All variants are 0 at pre and up 0.55. Results at up 1, judged against PR-010 (fill 64, edge 128, 0.5 %):

| variant | area beyond A/A | max level | where |
|---|---|---|---|
| `.countdown` translateZ(0) | 0.086 % | 162 | `span.label` ("seconds") |
| `.unit` translateZ(0) | 0.086 % | 162 | `span.label` |
| `.countdown` will-change: opacity | 0.086 % | 162 | `span.label` |
| `.countdown` will-change: transform | 0.15 % | 224 | `span.cell` (digits) |
| `.face` translateZ(0) | 0.106 % | 224 | `span.cell` |

Chrome A/A over 8 levels: 0-0.006 %. Every variant fails the edge mark (128); every area is under 0.5 %.

## Cost card (Chrome, counts only; `out/cm/clock/clock-card.mjs`, not committed)

| build | repainted area/s at m 1 | at m 0.55 | layers | est. memory |
|---|---|---|---|---|
| C = v9-final | 9.2-9.6M css px² (veil 406x908, 25-26/s) | 5.4-6.2M | 72-84 | 435-453 MB |
| unscoped layer | 0.83M (clock 376x88, 25/s) | 0.94-0.98M | 73-83 | 413-436 MB |

**Caveat (OBSERVED, in our setup):** "repainted area" is the layer's size x its paint count, an upper bound. Chrome
154 never fires `LayerTree.layerPainted`, so we have no painted-clip area. The real raster area of C may be much
smaller than the veil's size.

These Chrome numbers only show the mechanism. With the iOS scope Chrome itself does not change. The engine that gains
is WebKit.

## Gates

- Chrome, scoped delta (CSS 0f57e05f96cb), 4 loads, 2026-10-06 11:20-11:21Z: **0 css px² beyond A/A at pre, up 0.55
  and up 1** (max level 0-2, A/A 0 %). In every load `CSS.supports('-webkit-touch-callout', 'none')` is false and the
  clock's computed transform is `none`. PASS.
- Simulator T2 (iOS Simulator WebKit, `cm-px2.mjs --engine sim`, 4 loads, stops pre / up 0.55 / up 1 / dn 0),
  2026-10-06 11:23-11:25Z. In every V load the rule applies: `CSS.supports` is true and the clock's computed
  transform is `matrix(1, 0, 0, 1, 0, 0)`; in every A load it is `none`. The consistent diff (beyond A/A in both
  pairs) is **0 % at every stop, max level 1-3**. Single-pair maxima of 224-255 lie inside the A/A envelope (A/A over 8
  levels: 0.02 % at the panel stops, 0.75 % at pre, the platform section's scene phase). PASS against PR-010.

## Results summary

| gate | consistent area | max level | PR-010 (fill 64, edge 128, 0.5 %) |
|---|---|---|---|
| Chrome (rule inactive) | 0 % | 0-2 | pass |
| Simulator (rule active) | 0 % | 1-3 | pass |

What we do not have yet: a WebKit count of the gain itself (repaints per second of the veil vs the clock). The
Simulator gate checked pixels, not layers. The phone's Timeline would show it as Paint records per frame in the open
panel. Candidate for a later attribution run, after the CM block.
