# Fix: scrollcb-g0 (scroll-cb gate ported onto g0.0f): closed, no fix

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** rejected (closed-no-fix, lead 2026-10-09)
**Stage:** I (no D card: the gate removes no pass)
**Driver(s) behind the claims:** Chrome trace probe (430x775 DPR 3, touch and per-frame drivers), Simulator G and W approach drivers (counts only, no timing)
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only (AE commission, uM profile, mM future); GM (platform) was dropped because g0.0f already gates it through c3b's IntersectionObserver
**Base:** stacked on g0.0f (`fix.mjs apply scrollcb-g0 --on g00f`), arms C = g0.0f JS 30fd80ccbb3f / CSS 1d1e5d62a2c4, V = JS 82fabdcf7230 / same CSS

## Result

The gate (`scbGate`) makes the off-screen side callbacks idle. That cuts JS reads, but no style or layout pass goes away, because the
pending flush is paid by the next reader instead: the nav's `dN`/`__nsOnScroll` `window.scrollY` read (JS 14247-14249). WebKit's
`scrollY` getter forces layout whenever scrollY != 0 (CONFIRMED: `Source/WebCore/page/LocalDOMWindow.cpp:1512` @ b4925b759d58).

| per run (approach y 0-4600) | C g0.0f | V gate |
|---|---|---|
| Chrome 775: side rAF callbacks / step | 1.79 | 0.56 |
| Chrome 775: rect reads / step | 3.07 | 1.35 |
| Chrome 775: forced style passes | 232-243 | 230-231 |
| Chrome 775: forced layout passes | 123-124 | 125-126 |
| Sim G (3 loads/arm): layouts | 843-886 | 835-875 |
| Sim G: layouts >= 5 ms | 144-154 | 141-155 |
| Sim G: style recalcs | 1016-1063 | 1035-1064 |
| Sim G: forced layouts | 257-289 | 237-247 |
| Sim W (1 load) | no change | no change |

The ranges overlap on every count that matters for frames (OBSERVED, Simulator and Chrome counts). The gate is dropped. So the four old scroll-cb
bugs from T-228 #106 were not re-tested: Sim nav parity, commission `--start-selling-intrinsic-block-size` 1203 vs 1166, profile/nav one step late after a desktop
resize, and the short first fling. Without the gate they cannot occur.

## Per-frame invalidators on the approach (lead's question)

The question: which writes dirty style or layout before the first forced read?

**Chrome** (`probe/inval-probe.mjs`, `invalidationTracking` trace, each forced pass charged to its invalidators):
- CSS animations dominate:
  - `.zero-frame` / `.underline-frame`: three-frame `step-end` opacity;
  - `.record.spinning`;
  - an `::after` animation.
- The reader that pays for them is the nav `__nsOnScroll` `scrollY` read (JS 14247-14249).

**WebKit / Simulator** (`sim-approach.mjs`, Timeline `ScheduleStyleRecalculation` / `InvalidateLayout` stacks, `--driver g|w`):
- 847 of about 1000 style schedules per run have no JS stack: they are native (animations, scroll). OBSERVED.
- JS writes that change a value:
  - `--fee-progress` in JT (JS 2625), about 55 per run;
  - `is-sliding` in mM (JS 12491);
  - `--exit-opacity` in fD (JS 4948).
- Idempotent writes (same value written again):
  - the `is-pain-dark` toggle;
  - `--profile-scale` in uM (JS 11880);
  - `img.src` set to its current value in mM (JS 12490) and dN (JS 14630).
- W knock-out: removing the SVG frame animations takes layouts from 304 to 222 per run. This applies to scripted scroll only.

**The big finger-down layouts are sticky relayout, not JS.**
- 97 % of the layouts >= 5 ms in G runs happen with the finger down. They sit in the RenderingFrame, not inside a script, at about 9/s.
- A knock-out per arm (`out/scrollcb-g0/kog/`, CSS injected after settle) pins them on `.hero` + `.pain-sticky` together:

| G arm | layouts >= 5 ms / run | frames delivered |
|---|---|---|
| base (g0.0f) | 135-150 | 1075-1114 |
| all animations paused | 159 | |
| SVG frame animations removed | 142 | |
| shell | 146 | |
| end panel display:none | 150 | |
| nav display:none | 137 | |
| only `.hero` relative | 151 | |
| only `.pain-sticky` relative | 156 | |
| **`.hero` + `.pain-sticky` relative** (2 runs) | **19-20** | **1164-1205** |

Mechanism, with WebKit source checked via gh:
- CONFIRMED: fixed and sticky boxes are viewport-constrained objects (`StyleComputedStyle+GettersInlines.h:382-385` @6cb05bb8). They are registered in `RenderLayerModelObject.cpp:247-254` @6cb05bb8.
- CONFIRMED: `LocalFrameView::setViewportConstrainedObjectsNeedLayout` marks every one of them for layout (`LocalFrameView.cpp:3822-3834` @6cb05bb8).
- CONFIRMED, it is called from two places:
  - `setBaseLayoutViewportOrigin` (`LocalFrameView.cpp:1952-1961`; default `TriggerLayoutOrNot::Yes`, `LocalFrameView.h:309-317` @ee36cd61);
  - `setLayoutViewportOverrideRect` (`LocalFrameView.cpp:1970-1990`).
- CONFIRMED: iOS `WebPage::updateVisibleContentRects` passes `Yes` only in a stable state (not while obscured insets change interactively) or on a size change (`WebPageCocoa.mm:4218-4229` @5b3924cd).
- UNRESOLVED: why the relayout fires mid-drag, when the finger is down. The decisive check belongs to the sticky-far D card.
- Only `.hero` and `.pain-sticky` are sticky on phones. `.commission-sticky` (min-width 1001) and `.start-selling-profile-sticky` (min-width 861) are desktop-only.

**Phone cross-check** (de-offscreen, P-164 tl-EC1-4 / tl-EV1-4):
- Every Layout record of 5 ms or more is rooted at the full 430x775 view, with no node and no subtree root (OBSERVED).
- That fits whole-view relayout of the viewport-constrained boxes, but it cannot name the box.
- Correction carried here for de-offscreen README §7.2 item A: its "per-scroll style writer" is mostly this sticky relayout plus CSS animations, not a JS writer.

Follow-up: topic **sticky-far** (lead 2026-10-09). It takes the sticky box out of sticky while its container is far off-screen, prototyped on g0.0h.

## Probes (committed here, all counts only)

- `build.mjs`: immutable arm snapshots (`$SCB_SNAP`, default `out/scb/snap1`), with pins checked.
- `sim-approach.mjs`:
  - Simulator approach counter, `--driver g` (WDA strokes: 520 px in 1200 ms, 300 ms pause) or `--driver w`.
  - Counts per run: frames, style and layout passes (forced or not), layouts >= 5 ms, and invalidators by writer.
  - Env options: `SCB_KO_CSS` (knock-out CSS), `SCB_ANIM=1` (animation census).
  - `--selftest`.
  - y comes from a passive scroll listener, so the probe does no rAF reads of its own.
- `probe/inval-probe.mjs`: Chrome invalidation-tracking trace. Readers by stack line, writes classed changed or same, forced passes charged to invalidators.
- `probe/scb-probe.mjs`: the scroll-cb-phone parity harness, copied with output paths moved to `out/scrollcb-g0`. Its siblings (`simcount`, `score-p108`, `fling-probe`, `pixcheck`) are used unchanged from `fixes/scroll-cb-phone/`.

Data stays in `out/scrollcb-g0/` (gitignored):
- `counts-phone775.json`, `inval-775*.json`;
- `sim-g.json`, `sim-w.json`, `sim-anim.json`;
- `ko/`, `kog/`.

No measurement code was changed.
