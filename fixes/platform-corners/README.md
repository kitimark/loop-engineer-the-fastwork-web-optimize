# Fix: platform-corners (user T-240)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (pixel and layer gates; no timing, none needed: a static clip on a still picture)
**Stage:** R -> F (look fix, not a speed fix; the user decides on the look through a proposal)
**Device class / gate:** WebKit-only rendering bug; Simulator (iPhone 15 Pro Max, iPad Pro 13) + Chrome pixel gates
**Topic:** platform-corners (user thread T-240, 2026-10-07)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css`: one rule appended (`.start-selling-platform-stage-bg`)

## The report

The user saw, on the iPhone, that the rounded corners of the `#platform` card holding
`.start-selling-platform-visual` ("What do you need help with?", the second of the four platform cards) are
"not transparent", unlike the related cards. The user later added that it comes from the original site.

## Cause

- The second card (`.start-selling-platform-row.is-discovered`) is the only one of the four whose stage has a
  background picture: `img.start-selling-platform-stage-bg` (`filter: blur(16px)`, `opacity: .5`, absolutely
  positioned over the whole stage, CSS 6369-6378), inside `.start-selling-platform-stage` (`border-radius: 5%`,
  `overflow: hidden`, CSS 6330-6339). The opaque artboard visual covers the picture everywhere inside the card.
- In Safari the blurred picture is not cut by the stage's rounded corner, only by its box: its faded, blurred edge
  shows as a grey square in each corner, outside the curve, over the card's navy (`rgb(19,25,34)`).
  The other cards have no blurred child, so their corners are clean.
- **CONFIRMED** (engine bug): WebKit bug 312584, "REGRESSION (303819@main): Child with filter:blur() ignores border
  radius overflow clipping" (rdar://175519148); fixed in WebKit main by 313267@main (commit b8414eccb3, 2026-05-14;
  a first try, 312531@main / 34213f695a, was reverted). The fix makes `RenderLayer::setupFilters` pass the
  ancestors' rounded clip (`applyAncestorClippingForBorderRadius`) to the filter's transparency-layer path
  (`Source/WebCore/rendering/RenderLayer.cpp` 3585-3592 in our `out/engines/WebKit` checkout). iOS 26.5's Safari
  (the Simulator, 23F77) still shows it. Whether the user's phone's iOS has the fix: UNRESOLVED (the phone itself
  shows it, per the report).
- Consistent with that, OBSERVED in our Simulator: the picture is not a composited layer (layer census equal with and
  without the fix), so this is the software filter path the bug names, not a compositor clip.

Evidence (Simulator = iOS 26.5 Mobile Safari, 430x775 at 3x; "off" = outside-the-curve pixels more than 12 away from
the card navy, out of 1598 per stage):

| build | card 1 | card 2 (the visual) | card 3 | card 4 | Chrome 430, all cards |
|---|---|---|---|---|---|
| v0 (original) | 0 | 1598 (max +42) | 0 | 0 | 0 |
| v14 | 0 | 1598 (max +42) | 0 | 0 | 0 |
| g0.0 | 0 | 1598 (max +42) | 0 | 0 | 0 |
| g0.0b | - | 1598 (max +42) | - | - | 0 |

So it is in the original page; v14, g0.0 and g0.0b inherit it unchanged (same per-corner counts 444/412/386/356).
On the iPad Pro 13 Simulator (1032 wide, 2x) card 2's corners are already clean (0 off): the bug shows on the
phone-size layout only, in our setup.

Which layer (Simulator, v0, card 2, CSS injected in the same load):

| variant | off px |
|---|---|
| as is | 1598 |
| picture `filter: none` | 0 |
| picture `display: none` | 0 |
| stage `isolation: isolate` (what the clean mesh cards have) | 1598 |
| artboard `will-change: auto` | 1598 |
| visual hidden | 1598 |

## What changed

`patch.diff` (baseline-relative, 7 lines) appends:

```css
.start-selling-platform-stage-bg { clip-path: inset(0 round 5%); }
```

The picture is clipped to the stage's own shape (same box, same 5% radii; `clip-path` applies after the filter),
so it can no longer show outside the curve. Where the engine already clips it (Chrome, the iPad layout) it is the
same clip twice. `on-g00b.diff` is g0.0b (the best build since PR-034) + this rule, baseline-relative, for the proposal's Try-it page B
(A = `fixes/g0-revert/patch.diff`, g0.0b). On v14 and g0.0 the same rule applies unchanged (appended at the end of the CSS).
The other candidate, `display: none` on that one picture (it is covered anyway), also gives 0; not chosen, because it
removes content instead of restoring the intended clip.

## Gates

Method: one page load per build, the card scrolled to the viewport centre, timers and rAF stubbed, CSS animations
paused; shots A (as served), B (the rule injected), A2 (removed again); Chrome also C / C2 with a control rule
(`clip-path: inset(0)`, the same repaint without the rounded corner) to separate repaint noise. Zones per card:
outside the curve, a 24 css px ring inside the edge, and the interior.

| check | v14 | g0.0 | g0.0b (best build since PR-034) |
|---|---|---|---|
| Simulator iPhone 430: corners off, before -> after | 1598 -> 0 | 1531 -> 0 | 1598 -> 0 |
| Simulator iPhone, served build + fix (not injected): corners off | 0 | 0 | 0 |
| Simulator iPhone: A~A2 (stability) | 0 px | 0 px | 0 px |
| Simulator iPhone: A~B interior | 0 px | 0 px | 0 px |
| Simulator iPhone: A~B outside the curve + edge ring | 2413 + 1228 px (max 53) | 2118 + 262 px (+2446 top edge row, max 45) | 2422 + 1234 px (+1170 top edge row, max 45) |
| Simulator iPad 13 (1032): corners off before / after | 0 / 0 | 0 / 0 | 0 / 0 |
| Simulator iPad 13: A~B interior; edge | 0; ~1-px edge line, max 13 | 0; same | 324 px at 1 level (same in A~A2: the caret); edge max 13 |
| Simulator layer census, card 2 (iPhone) | 78 layers 164.58 MB, same with the fix | 68 / 155.05 MB, same | 68 / 155.05 MB, same |
| Simulator 3 s at rest, card 2 (iPhone): paints / styles / layouts, base -> fix | 76/231/85 -> 69/228/81 | 69/137/98 -> 63/135/98 | 74/130/100 -> 64/132/99 |
| Chrome 430: control~B, card 2 | interior 0; 265 px on the curve's antialiased edge (max 13) | same | edge max 13; interior max 3 = Chrome repaint noise (the same 56697-px pattern shows between two identical control shots in the v14 run) |
| Chrome 768 and 1280: control~B, card 2 | interior 0; ~150 px on the curve's antialiased edge (max 8-10) | same | edge max 8-10; interior max 3, as control~control at 768 |
| Chrome all widths: corners off before / after | 0 / 0 (1280: 4 edge px in every state) | same | same |
| Chrome layers (LayerTree) A / B | equal at every card and width | equal | equal |

- Outside the curve and on the edge ring only: the grey square goes away and the 1-device-px antialiased edge where
  the hidden blurred picture used to bleed through gets the same edge as the other cards. Nothing inside the card
  changes (T0 interior in every run).
- No new layer, no new per-frame work (rest counts equal within the typing animation's own variation).
- Chrome: the corners were already right; the rule changes only the antialiased curve edge by at most 8-10 levels,
  and other cards not at all beyond Chrome's own repaint noise (C~C2 shows the same levels).
- Reduced motion: the rule is static and has no motion; unaffected.
- Not run: the Simulator at a 768-ish width (the iPad mini Simulator never launched Safari, twice; joined incident
  I-208). 768 is covered by Chrome; the Simulator covers 430 (iPhone) and 1032 (iPad Pro 13).

Kit (gitignored, `out/pc/`): `corners-sim.mjs`, `corners-chrome.mjs`, `t0-sim.mjs`, `t0-chrome.mjs`,
`corners-crop.mjs`, `stagediff.mjs`; all in the shared lane, no timing.

## Risks, conflicts, follow-ups

- Changes the original's look (a bug fix of the site's own rendering), so the user decides (proposal, PR-027
  precedent). #platform is next to the end menu (fix-g0-revert, fix-g0-box): the rule touches only the stage picture.
- Other blurred children inside rounded `overflow: hidden` boxes could show the same Safari bug; none other is
  visible on the current page (finding F-340).
