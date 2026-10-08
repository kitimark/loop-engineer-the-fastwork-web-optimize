# `--morph`: how the end-of-page menu value is calculated (g0.0f)

User T-228 #108 (2026-10-08). Mapped by the helper map-morph-var from the baseline
`/_app/immutable/nodes/2.DyWL8TcE.js` (JS) and `/_app/immutable/assets/2.gBuqKVzi.css` (CSS), 1-based lines,
plus g0.0f's patch `fixes/v3w-g00e/patch.diff`. Read-only code reading; nothing measured. Layout vs compositor
classes are inferred from property types.

## The value
- One number 0..1, "how open the end-of-page menu is": 0 = nav pill, 1 = full dark menu panel.
- Not a function of scroll position. A wheel or touch push at the end of the page starts a 680 ms rAF tween
  (ease-out cubic `1-(1-t)^3`, `ZM` JS 12694-12698, `YM` 12688-12690); a push back reverses it from the current value
  (`E` 13024-13035). Reduced motion: jumps, no tween (13026-13029).
- A push may start it only while the platform section fills >= 45 % of the viewport and its bottom is within 8 px of
  the viewport bottom (`O` 13041-13047), or the morph is already on (`C` 13019). Listeners exist only while the
  platform is within 200 % of the viewport (IntersectionObserver 13080-13089).
- Written inline on the nav header (`S(I, "", te, e)`, 13234/13243); no JS reads it back from the DOM.
- Derived flags: `is-morphing` m > 0.001, `is-on-dark` m > 0.2, `is-expanded` m > 0.92, aria-hidden m < 0.35, tabindex m > 0.4.
- `--morph-fade = 1 - min(1, m/0.55)` on the platform section (13013-13018, `QM` 12699-12701): fades and blurs the
  platform section out over m 0..0.55 (CSS 5392-5393).

## CSS readers
| element | properties (CSS line) | effect | cost class (inferred) |
|---|---|---|---|
| nav header | top (11328), width (11331-11334), height (11335) | grows from pill to panel | layout every tween frame |
| nav header | background color-mix (11336-11340), border-radius (11341), backdrop-filter blur (11342-11343) | glass to dark, less rounding, blur off | paint every frame |
| logo (.is-morphing) | left (11433), translate (11432-11437) | slides to the centre | layout (left) |
| actions container | gap (11438-11440) | gap closes over m 0..0.2 | layout |
| Join button (.is-earn) | max-width, padding-inline, opacity via --earn-out = m/0.2 (11477-11485) | Join shrinks and fades out over m 0..0.2 | layout |
| menu panel | opacity, filter blur, p = (m-0.08)/0.72 (10545, 10547); transform scale 0.96 + 0.04 m (10549) | fades in over m 0.08..0.8 | compositor-capable, but restyled from rAF |

## g0.0f differences (patch)
- `@property --morph` registered non-inheriting; only the nav parts and the panel inherit it (patch 175-197), so a
  write restyles fewer elements. Extra JS writers copy the value onto those elements for WebKit (`__mkW`, ~3695).
- Phones <= 640 px, WebKit only: the nav background is two GPU fill layers (dark one opacity = m) and clip-path
  replaces border-radius (patch 1195-1230; PR-038).
- Join button: own transitions and a `--jf-gone` step at m >= 0.2 (patch 1286-1296; PR-036).
- Formula and tween unchanged.

Unconfirmed: CSS after 11485 (`.is-earn` blur/translate) and the `.is-morphing` transitions 11350-11425 were not read.
