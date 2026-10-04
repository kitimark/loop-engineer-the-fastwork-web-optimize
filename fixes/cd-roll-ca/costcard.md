# Rendering cost card: cd-roll-ca

Arms C8, V9; control C8; no A/A arm (tol = the 2-count floor). Counts per element event, median over page loads [min-max]. In brackets after an arm: its change against the control. "within A/A" means |change| ≤ tol = max(2·|C−C2|, 2). "low-power" means tol > C/2. FRZ = the rest of the page frozen, FULL = the page as served. ms are printed, never judged.

| Element / event | Engine | 1 Thread | 2 Layers, memory | 3 Repaint per event | 4 Layout per event | 5 Script per event | Page around it (FULL only) | A/A source |
|---|---|---|---|---|---|---|---|---|
| hero + panel countdown (full page) / tick | chrome | C8: 8 of 8 page (not element-attributed) animations not composited: TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange (properties stroke-dashoffset) (UNRESOLVED)<br>V9: 10 of 12 page (not element-attributed) animations not composited: TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange (properties stroke-dashoffset) (UNRESOLVED) | - | paints, FULL: C8 178 [155-182] · V9 178 [155-178] (+0, within A/A)<br>paint cull-rect area, whole page (layer px², upper bound, not element-attributed) (millions), FULL: C8 36591742734 [31525193744-37436167567] · V9 36591742734 [31525193744-36591742734] (+0, within A/A) | layouts, FULL: C8 2 · V9 2 (+0, within A/A)<br>objects needing layout (dirtyObjects), FULL: C8 33 [32-34] · V9 33 (+0, within A/A) | style elements recalculated, FULL: C8 417 · V9 392 [346-469] (-25)<br>style recalcs, FULL: C8 60 · V9 50 [47-52] (-10)<br>FunctionCalls (all scripts), FULL: C8 66 · V9 14 [14-16] (-52) | main frames: C8 60 · V9 50 [47-52] (-10)<br>frame rate Hz: C8 60 · V9 50 [47-52] (-10)<br>rAF rate Hz: C8 27 · V9 1 (-26)<br>Layerize: C8 60 · V9 50 [47-52] (-10) | none: 2-count floor only (chrome FULL, no A/A arm) |

Frame-driven counts (main or rendering frames, Layerize, Composite, frame and rAF rates) come from the FULL page only and are never the element's alone (README §6.2, H9). They stand beside every per-event number so a per-time reading can be checked against them.

## Details per row

### hero + panel countdown (full page) / tick (chrome)

FULL: loads C8 3, V9 3. A/A source: none: 2-count floor only (chrome FULL, no A/A arm).

| Metric | C8 | V9 |
|---|---|---|
| element events per load | 5 | 5 |
| seconds per event | 1 [1-1] | 1 [1-1] |
| main frames | 60 | 50 [47-52], change -10 tol 2 |
| rAF callbacks | 27 | 1, change -26 tol 2 |
| rAF callbacks running the element code | - | - |
| element code FunctionCalls | - | - |
| FunctionCalls in the element file (whole file) | - | - |
| FunctionCalls (all scripts) | 66 | 14 [14-16], change -52 tol 2 |
| timer fires | 5 | 5, change +0 tol 2 (within A/A) |
| style recalcs | 60 | 50 [47-52], change -10 tol 2 |
| style elements recalculated | 417 | 392 [346-469], change -25 tol 2 |
| layouts | 2 | 2, change +0 tol 2 (within A/A) |
| objects needing layout (dirtyObjects) | 33 [32-34] | 33, change +0 tol 2 (within A/A) |
| paints | 178 [155-182] | 178 [155-178], change +0 tol 2 (within A/A) |
| paint cull-rect area, whole page (layer px², upper bound, not element-attributed) | 36591742734489330 [31525193744179590-37436167566657540] | 36591742734489330 [31525193744179590-36591742734489330], change +0 tol 2 (within A/A) |
| paints of the element | - | - |
| element paint cull-rect area (layer px², upper bound) | - | - |
| PrePaint | 60 | 50 [47-52], change -10 tol 2 |
| Layerize | 60 | 50 [47-52], change -10 tol 2 |
| IntersectionObserver passes | 120 | 100 [94-104], change -20 tol 2 |
| commits | 180 | 150 [141-156], change -30 tol 2 |
| compositor frames | 60 | 60, change +0 tol 2 (within A/A) |
| frame rate Hz | 60 | 50 [47-52], change -10 tol 2 |
| rAF rate Hz | 27 | 1, change -26 tol 2 |
| script ms (unjudged) | 3.8 | 2.15 |
| style ms (unjudged) | 8.09 | 6.89 |
| layout ms (unjudged) | 0.26 | 0.23 |
| paint ms (unjudged) | 5.96 | 5.59 |

- C8 animations: avatars-shift on IMG: TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange; avatars-exit on IMG class='st5-lead': TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange; avatars-shift on IMG class='st5-next': TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange; avatars-pop on IMG class='st5-next': TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange; svelte-1fn2go6-idle-0 on svg class='accent-svg is-idle-frame is-idle-frame-0 svelte-1fn2go6': AnimationHasNoVisibleChange; svelte-1fn2go6-idle-1 on svg class='accent-svg is-idle-frame is-idle-frame-1 svelte-1fn2go6': AnimationHasNoVisibleChange; svelte-1fn2go6-idle-2 on svg class='accent-svg is-idle-frame is-idle-frame-2 svelte-1fn2go6': AnimationHasNoVisibleChange; svelte-1fn2go6-stroke-in on path class='accent-path svelte-1fn2go6': TargetHasInvalidCompositingState, UnsupportedCSSProperty
- V9 animations: avatars-shift on IMG: TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange; avatars-exit on IMG class='st5-lead': TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange; avatars-shift on IMG class='st5-next': TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange; avatars-pop on IMG class='st5-next': TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange; avatars-exit on SPAN class='cell svelte-1quva9c': TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange; avatars-shift on SPAN class='cell svelte-1quva9c': TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange; svelte-1fn2go6-idle-0 on svg class='accent-svg is-idle-frame is-idle-frame-0 svelte-1fn2go6': AnimationHasNoVisibleChange; svelte-1fn2go6-idle-1 on svg class='accent-svg is-idle-frame is-idle-frame-1 svelte-1fn2go6': AnimationHasNoVisibleChange; svelte-1fn2go6-idle-2 on svg class='accent-svg is-idle-frame is-idle-frame-2 svelte-1fn2go6': AnimationHasNoVisibleChange; avatars-pop on SPAN class='cell svelte-1quva9c': TargetHasInvalidCompositingState, UnsupportedCSSProperty, AnimationHasNoVisibleChange; svelte-1fn2go6-idle-1 on SPAN class='cell svelte-1quva9c': no failure reason; ? on SPAN class='cell svelte-1quva9c': no failure reason

## What this card cannot say

- Frame time, smoothness, finger feel and hot-only behaviour: those stay with the phone (V stage).
- Raster and GPU time. Memory and area are proxies, and Chrome memory is an estimate.
- Costs merged in from neighbours (H9). The FULL context hints at them but does not measure them.

## Status of the sources

- Field 1, Chrome: the trace "Animation" instant event with compositeFailed is CONFIRMED in source (chromium inspector_trace_events.cc inspector_animation_compositor_event::Data; devtools-frontend TraceEvents.ts, CLSCulprits.ts). Emitted on Chrome 154 with our trace categories: OBSERVED for a CSS width animation (failure UnsupportedCSSProperty, property width) and absent for a transform animation (tests/chrome/costcard.chrome.test.mjs); that every animation type on this page gets it is UNRESOLVED. A composited animation gets no compositeFailed event, so "no failure reason" is never read as "composited".
- Field 3, Chrome: a trace Paint clip is the paint layer's cull rect in layer-local coordinates (CONFIRMED, chromium paint_layer_painter.cc "Paint" event), so Chrome areas are upper bounds, never intersected with an element rect; element paints use Paint args.data.nodeId against the element's backend node ids.

