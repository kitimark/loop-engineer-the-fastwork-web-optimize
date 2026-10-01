# Fix: r3a-feed-fade (R3 phone diagnostic a)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** phone diagnostic (not landable as is); parity checked in Chrome.
**Owner:** fix-scroll-engine, for de-middle R3 (lead OK 09:50Z). **Base:** `aw1-10e` (JS 3e2f599a…, CSS c6aad94b…).
Standalone overlay (aw1-10e + this change). Rebuild: `node tools/fix.mjs apply r3a-feed-fade --on aw1-10e`.
Overlay CSS ac0acfe8c682effa…, JS = aw1-10e. `patch.diff` +16/-2, sha 39a6db3b69e900ac.

## Why (F-041, code reading)

de-middle §3.8: the WebKit Timeline shows the rect `36,1665,373,344` repainted 56-63 times/s over y 1708-2500. That
rect is panel 0's `.feed .body` (CSS 5143-5150: `overflow: hidden` + `mask-image` bottom fade). The deck's panel 0
is sound-composer (JS 6362-6370). Its default posts tab holds an `audio` post (JS 5981), which renders a vinyl with
`.record.spinning` (`vinyl-spin` 4 s linear infinite rotate, CSS 3880-3887; JS 7247-7271, 10256-10268), on screen in
the 2-column masonry. That is the only infinite animation in the showcase. Inference: under the masked ancestor
WebKit repaints the masked body every frame instead of compositing the rotation.

## What changed

`.body.svelte-ty4hd7` loses its `mask-image` and gets `position: relative; isolation: isolate` (the mask made a
stacking context; isolation keeps one). A `::after` (absolute, bottom 0, height 32 px, z-index 1,
`pointer-events: none`) paints `linear-gradient(#fff0, #fff)`. The panel behind is solid `#fff` (CSS 3069), so
`content·a + #fff·(1−a)` gives the same pixels as the mask fade to transparent.

## Parity (short hold 09:49Z, `scratchpad/scroll-engine/r3.sh`; CPU 1x, mobile 430x932 DPR3, animations frozen)

The feed body bottom is at viewport y 700. Ten shots, aw1-10e vs r3a: the 6 deck panels (deck scrolled to each) and
the 4 feed tabs on panel 0.
- **Feed region: 0 % in all 10 shots** (|ΔRGB| > 48). Sub-threshold max Δ 6 over the fade (gradient rounding).
- In 3 shots there are 17-43 px with Δ ≤ 114 inside the body, ≤ 0.001 %: sub-pixel raster differences of the image
  edges. I inspected the crop for tab0 (posts with the vinyl); it looks identical.
- 4 shots show 0.43-0.68 % in one box, 104 × 32 CSS px at y 698-730 below the card: the
  "3,788 people showcasing their work" avatar stack in a different animation phase (P11). It is outside the change; crop inspected.
- Containing blocks: 0 absolutely positioned descendants of any `.feed .body` have the body as `offsetParent`
  (2 bodies rendered), the same as the base. So `position: relative` moves nothing.

## Phone check (iphone-runner)

Serve (plain http): `node tools/serve.mjs --root site-pretty --overlay /Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a1722cf5058e25591/fixes/r3a-feed-fade/overlay --port auto --vendors=local --latency 150`.
Base: the same with `fixes/aw1-10e/overlay`. Compare frames > 20/34 ms over y 1600-2500. If possible, Web Inspector
paint rects at y≈1900: `36,1665,373,344` should drop from ~60/s to ≤ 2 per chunk. Companion diagnostic:
`fixes/r3b-vinyl-wc` (`will-change` only, mask kept).
