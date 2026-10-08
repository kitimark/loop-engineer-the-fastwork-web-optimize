# de-offscreen: do g0.0e / g0.0f render what the user cannot see?

Diagnostic (T-228 #87/#89, the user's question), no fix, no phone. Agent de-offscreen, 2026-10-08 13:45-14:35Z.
Builds: **v0** = baseline snapshot b1789284481295-4ad4a84a (JS 4606120cf392 / CSS 27776f3d4138); **g0.0e** =
fix-g0-box `out/g0box/g00e` (JS 5c39f7a96e41 / CSS d4e684032482); **g0.0f** = `out/g0box/snap4/V` (JS 30fd80ccbb3f /
CSS 1d1e5d62a2c4). Served hashes checked before every load (all `ok`). Positions: the top (y 0) and spot B (y 4600).

## Answer

- **WebKit (iOS Simulator, the engine that matters), at the top: yes.** g0.0e has 164 layers / 28.8 MB against v0's
  105 / 12.2 MB. Two things the user cannot see make up the gap:
  - **The morph panel is hidden but rendered.** It is mounted at idle and hidden with `opacity: 0` (`--morph` 0).
    Its subtree holds 12 layers and all of the extra 15.9 MB. Each of those layers painted once, at mount, and not
    again.
  - **27 more layers sit fully off-screen**, 1327-5160 px below the viewport, in sections that are rendered early.
    Each holds 0 MB and paints 0 times.
- **At spot B: no meaningful off-screen addition.** g0.0e adds 5 small unseen layers (0.02 MB, 8 paints). Its other
  +11 layers at B are **on screen**. v0 paints far more at B than g0.0e (1136 + 130 paints against 16 + 0). So the
  slower card-start frame at B is **not** explained by off-screen rendering (OBSERVED). This agrees with fix-g0-box: the
  cost there is Composite.
- **g0.0f = g0.0e plus 1-2 fill layers** (`fw-bx-fill`, 0 MB), at both positions.
- **One CSS rule (knock-out B) removes the hidden panel's 12 layers and 16 MB** at the top, and the same 12 layers /
  15.8 MB at B. The panel stays mounted. This was measured in the Simulator (counts only). A second rule (knock-out C)
  removes 17 of the off-screen layers.

## How it was measured

- **Probes (this folder).** `layers-sim.mjs` (WebKit, iOS Simulator `fw-sim`, Mobile Safari, inspector protocol) and
  `layers-chrome.mjs` (headless Chrome 155, 430x775 DPR 3, mobile + touch). `common.mjs` holds the shared owner
  function. `summarize.mjs` makes the per-layer rows, `rank.mjs` ranks them, `kodiff.mjs` compares runs and
  `export.mjs` writes the committed data.
- **Load and positions.** One fresh load per build. Settle 6 s. Then per position:
  - census;
  - Timeline window: 3 s idle, then a short scroll (+250 +250 px smooth, then back);
  - census again;
  - owner of every layer.
  - Spot B is reached by a jump to 4000, 3 s, then a smooth scroll to 4600.
- **What is recorded per layer.**
  - **Owner:** `DOM.resolveNode` plus a page function, giving the selector, a 3-level path, the
    `getBoundingClientRect`, the rect clipped by every clipping ancestor, the first ancestor that hides it (opacity 0,
    visibility, display, content-visibility), the computed will-change / transform / opacity / filter / animation, and
    the running animations on the element and in its subtree (CSS animation, transition, WAAPI, with timeline kind).
  - **Compositing reasons:** `LayerTree.reasonsForCompositingLayer` (WebKit) or `LayerTree.compositingReasons`
    (Chrome).
  - **Memory:** WebKit's own `memory`; for Chrome an estimate, see below.
  - **Paints:** WebKit `paintCount` delta. A back-to-back census adds 0-6 paints in total per position (C1b-C1 and
    C0b-C0), so the census artefact noted in research/gpu-props section 4 is negligible here. The probe nets it out.
- **"seen" classes** (relative to the viewport, 430x775):
  - **on / partial:** visible, or partly visible.
  - **hidden:** the bounds meet the viewport, but the owner or an ancestor is hidden, or clipping removes it.
  - **off:** fully outside the viewport; the gap in px is given.
- **Runs.** Simulator: run 2 (14:01Z) and run 3 (14:08Z) agree within ±3 layers and ±0.3 MB at the top, and exactly at
  B. Run 1 (13:58Z) lost the owners because every `DOM.getDocument` resets node ids; that was fixed in the probe.
  Chrome: run 3 (14:15Z), with a warm-up `LayerTree.enable`, because the first enable repaints every layer once.
  Raw data: `out/de-offscreen/run{2,3}/`, `ko1/`, `ko2/` in this worktree (gitignored). Committed: `data/`.
- **Phase noise.** The hero accent idle-frame SVGs, `span.frame` and the profile `div.body` mask move ±3-4 layers
  between loads. Ignore differences of that size.

## 1. WebKit (iOS Simulator), totals by visibility

Cells: layers / MB / paints. Paints are over the ~5.5 s window. "hidden" includes the countdown digit cells or faces
that sit outside their digit window: 72 faces in v0, 80 cells in g0.0e.

| pos | build | layers | MB | on | partial | hidden | off |
|---|---|---|---|---|---|---|---|
| top | v0 | 105 | 12.2 | 15 / 7.8 / 222 | 4 / 4.2 / 14 | 72 / 0.2 / 40 | 14 / 0 / 0 |
| top | g0.0e | 164 | 28.8 | 28 / 9.3 / 218 | 4 / 4.2 / 14 | 91 / 15.3 / 81 | 41 / 0 / 0 |
| top | g0.0f | 162 | 27.6 | 26 / 8.0 / 209 | 4 / 4.2 / 14 | 92 / 15.4 / 78 | 40 / 0 / 0 |
| B | v0 | 43 | 119.3 | 11 / 33.1 / 29 | 8 / 71.2 / 1136 | 11 / 15.1 / 130 | 13 / 0 / 3 |
| B | g0.0e | 59 | 123.1 | 21 / 34.7 / 34 | 10 / 73.2 / 16 | 12 / 15.1 / 0 | 16 / 0 / 11 |
| B | g0.0f | 61 | 122.3 | 22 / 34.0 / 32 | 10 / 73.2 / 20 | 13 / 15.1 / 0 | 16 / 0 / 11 |

Engine facts behind the "off" column:
- **Every off-screen layer holds 0 MB, in every build** (OBSERVED, all runs). WebKit detaches the backing store of a
  composited layer that is outside its coverage rect. CONFIRMED by source (WebKit main @ f9dcd0ee93e4):
  - `GraphicsLayerCA::updateCoverage`, GraphicsLayerCA.cpp:3074-3116: `requiresBacking = m_intersectsCoverageRect || …`,
    then `setBackingStoreAttached(requiresBacking)`.
  - `backingStoreMemoryEstimate` is 0 when the store is detached (GraphicsLayerCA.cpp:5394-5395).
  - Non-fixed layers are always allowed to detach (`RenderLayerBacking::updateAllowsBackingStoreDetaching`,
    RenderLayerBacking.cpp:1160-1182).
- **They still cost something on every scrolled frame.** CONFIRMED by source: `GraphicsLayerCA::flushCompositingState`
  sets `ancestorHadChanges` when the visible rect changes (GraphicsLayerCA.cpp:1631). After that, every layer goes
  through `computeVisibleAndCoverageRect` / `updateCoverage` (:1974-1996), and every layer is visited in
  `PlatformCALayerRemote::recursiveBuildTransaction` (PlatformCALayerRemote.mm:220-270; it adds nothing for an
  unchanged layer). How many ms the extra layers cost on the phone is UNRESOLVED; no timing was measured here.
- **Paused CSS animations keep their layers.** OBSERVED: reason `animation`, play state `paused`, on the morph col-tracks,
  the platform row-title `::after` sweeps and the commission zero-frames. Consistent with the source as read
  (`RenderLayerCompositor::requiresCompositingForAnimation` → `KeyframeEffect::isCurrentlyAffectingProperty`, which
  checks the Active phase, not the play state; RenderLayerCompositor.cpp:3894-3921, KeyframeEffect.cpp:1701-1713).
  That reading is inferred: the pause path was not traced. Status: OBSERVED, source-consistent.

## 2. Ranked unseen layers that hold memory, paint, animate or carry will-change (WebKit)

Ranked by MB, then paints. Full per-layer rows: `data/sim-layers.json`.

**v0**
| pos | owner | seen | MB | paints | why composited / what runs |
|---|---|---|---|---|---|
| top | 72 × `span.face` (hero countdown digits) | hidden (clipped) | 0.22 total | 40 | will-change: transform |
| top | 14 other layers | off (454-1550 below) | 0 | 0 | profile shell etc. |
| B | morph panel subtree (center 5.56, 3 col-tracks 7.52, footer 1.26, veil 0.75) | hidden (panel opacity 0) | 15.1 | **130** (morph-center) | overlap / paused col animations |
| B | `div.commission-card` + 3 `svg.zero-frame` | off, 444-1219 above | 0 | 0 | three-frame-* ∞ running, will-change |
| B | `div.start-selling-platform-stage-artboard` | off, 232 below | 0 | 3 | will-change |

**g0.0e** (g0.0f is the same, plus `div.fw-bx-fill.fw-bx-dark`, hidden, 0 MB)
| pos | owner | seen | MB | paints | why composited / what runs |
|---|---|---|---|---|---|
| top | `div.start-selling-morph-center` | hidden (`.start-selling-morph-panel` opacity 0) | 5.56 | 1 | overlap |
| top | 3 × `div.start-selling-morph-col-track` (130×1290-1550 px in a 52 px pill) | hidden | 7.52 | 3 | animation (col-up/down, **paused**), will-change |
| top | `footer.start-selling-morph-footer` | hidden | 1.26 | 1 | overlap |
| top | `div.start-selling-morph-veil`, panel, backdrop, 3 cols | hidden | 0.75 | 1 | overlap / composited descendants |
| top | 80 × `span.cell` (countdown, replaces v0's faces) | hidden (clipped) | 0.22 | 75 | will-change: transform (fix-g0-box ko4) |
| top | 17 platform-section layers: `#platform`, 4 row-title masks + 4 `::after` sweeps, stage visual/artboard ×2 each, agents-ask/visual, invoice card ×2 | off, 3380-5160 below | 0 | 0 | animation (sweep ∞, paused) / mask / composited descendants |
| top | 3 × `svg.zero-frame` + title accent + underline (commission) | off, 2318-2525 below | 0 | 0 | animation (paused), perspective, 3D |
| top | `img.st5-lead`, `img.st5-next`, 2 × `img` (avatar carousel) | off, 1327-1337 below | 0 | 0 | will-change |
| B | morph panel subtree (as in v0) | hidden | 15.1 | 0 | as in v0, but no repaint |
| B | row-title secure / organized + `::after` | off, 133 / 560 below | 0 | 8 | mask / sweep animation |
| B | platform stage artboard | off, 232 below | 0 | 3 | will-change |

**What g0.0e / g0.0f add over v0 among the unseen layers:**
- **Top:**
  - morph panel subtree: +12 layers, +15.1 MB;
  - countdown: +8 hidden cells and +8 strips over v0's faces (ko4's territory);
  - off-screen: +27 layers, 0 MB, 0 paints (17 platform, 5 commission, 4 avatar imgs, 1 profile mask).
- **B:** +5 layers (row-title secure/organized + their `::after`, 1 hidden glint SVG), 0.02 MB, 8 paints. g0.0f adds
  the hidden `fw-bx-fill.fw-bx-dark`.
- **v0-only:** the commission card's off-screen layer at B, and its hidden morph-center repainting 130 times.

## 3. Knock-outs for the top g0.0e-only unseen offenders

Diagnostic only, never a candidate build. Setup:
- Each knock-out is one CSS rule, injected as a `<style>` 6 s after load, on g0.0e.
- One Simulator load each, layer census only.
- The injection happens after load, so mount-time effects are not covered (fix-g0-box's ko5 / f-cv25 cover the mount).
- Data: `data/sim-knockouts.json`.

| KO | rule | top: layers / MB (g0.0e 164 / 28.8, v0 105 / 12.2) | B: layers / MB (g0.0e 59 / 123.1, v0 43 / 119.3) | removes | test plan |
|---|---|---|---|---|---|
| **B** | `.start-selling [data-start-selling-scene="paused"] .start-selling-morph-col-track { animation: none !important; }` | **152 / 12.8** (−12, −16.0) | **47 / 107.2** (−12, −15.8) | the whole hidden panel subtree: the paused col-track animations are its only compositing trigger (center, footer and veil were "overlap"; the containers "…WithCompositedDescendants") | Simulator Timeline Composite records over windows A (0→750) and B (4000→5000), g0.0e vs g0.0e+B (counts); then a phone W block v0 / g0.0e / g0.0e+B at spots A and B if Composite drops |
| A | `.start-selling-top-nav.is-hero-pill:not(.is-expanded) .start-selling-morph-panel { display: none !important; }` | 152 / 12.9 (−12, −15.9) | 59 / 123.1 (0) | the same subtree, at the top only | superseded by B (B also works at B and keeps the panel rendered) |
| **C** | `.start-selling [data-start-selling-scene="paused"] .start-selling-platform-row [class*="start-selling-platform-row-title-"]::after { animation: none !important; }` | **147 / 28.8** (−17, 0 MB) | 59 / 123.1 (0) | all 17 off-screen platform-section layers (3380-5160 px below) | Simulator Timeline: Composite record count and duration in window A, g0.0e vs g0.0e+C, isolates the per-layer flush cost of 0-MB off-screen layers |
| D | `.start-selling [data-start-selling-scene="paused"] .zero-frame { animation: none !important; }` | 161 / 28.7 (−3) | 59 / 123.1 (0) | 3 commission zero-frame SVGs (2525 below) | stack on B+C only if C shows a per-layer effect |
| E | `.start-selling [data-start-selling-scene="paused"] .start-selling-avatars.is-carousel img { will-change: auto !important; }` | 164 / 28.6 (0) | 59 / 123.1 (0) | nothing: these imgs are not in a paused scene at y 0 (inferred) | drop |
| B+C+D+E | all four | **132 / 12.7** (−32, −16.0) | 47 / 107.2 (−12, −15.8) | panel + platform + commission | the combined Timeline check above |

Caveats:
- **KO B keeps the panel in layout** (fix-g0-box: 197 elements; 1584 rendered vs v0's 905). f-cv25's
  `content-visibility: hidden` also takes it out of layout. The two complement each other: KO B fits the time after
  f-cv25 lifts.
- **KO B changes the column phase.** `animation: none` drops the paused phase, so the columns restart from 0 when the
  scene activates instead of resuming. The panel is at opacity 0 while paused, so this only shows as a different
  column position at the moment the menu opens. Not pixel-identical at open: a proposal, not a silent fix (memory
  "illusion-must-be-pixel-identical").
- **The knock-outs ran on g0.0e only.** g0.0f has the same panel and platform layers (section 2), so the same effect is
  expected there (inferred; `f+B` did not fit in the session budget).
- **The totals agree with fix-g0-box's own census** (ko5, no idle mount: 12.8 MB at the top; spot B memory equal across
  its arms). This README adds the owner-level attribution and the visibility of each layer.
- **No timing was measured.** Whether removing 0-MB off-screen layers (KO C) shortens a phone frame is the open
  question: the source says those layers are walked on every scrolled flush, but not how long it takes.

## 4. Chrome (headless 155, 430x775 DPR 3): a first look, not WebKit

Chrome layers do not stand in for WebKit.
- **Memory is an estimate:** draws-content area × 9 × 4 B. Chrome exposes no per-layer memory (CONFIRMED,
  chromium `inspector_layer_tree_agent.cc` and `cc/layers/layer.h:64-77` @ 9bc4637e), and it rasters only tiles near
  the viewport, so off-screen MB here are upper bounds.
- **Paints are `paintCount` deltas.** That counts main-thread re-recordings (`PictureLayer::Update`,
  picture_layer.cc:139-148). Counting starts only once the LayerTree debug info is on, so the probe warms up first.
- **Owners come from the first paint chunk** (`PendingLayer::OwnerNodeId`, pending_layer.cc:159-162).

| pos | build | layers | on n/paints | hidden n/paints | off n/paints |
|---|---|---|---|---|---|
| top | v0 | 105 | 19 / 17 | 71 / 0 | 9 / 0 |
| top | g0.0e = g0.0f | 152 | 31 / 91-98 | 88 / 0 | 27 / 0 |
| B | v0 | 68 | 26 / 657 | 8 / 0 | 19 / 4 |
| B | g0.0e | 83 (100 in run 1) | 31 / 138 | 10 / 29 | 27 / 78 |
| B | g0.0f | 100 (104 in run 1) | 32 / 112 | 9 / 8 | 44 / 76 |

- **The same top-of-page groups show up in Chrome**:
  - the hidden morph panel (col-tracks `ActiveTransformAnimation`);
  - the platform section 3308-5090 px below;
  - the commission section 2105-2525 px below.
- **Two things differ from WebKit:**
  - Chrome keeps the layers of the sections behind the user at B for a while: hero, people, profile, 2500-3800 px
    above. The count varies between runs (83-100), probably with the far re-skip timing (inferred).
  - Off-screen row-title sweeps keep repainting at B: secure 61 px below, 58 paints. WebKit shows nothing like it.

## Files

- `layers-sim.mjs`, `layers-chrome.mjs`, `common.mjs`: the probes, which can be re-run (commands in their headers;
  shared lane).
- `summarize.mjs`, `rank.mjs`, `kodiff.mjs`, `export.mjs`: the analysis.
- `data/sim-layers.json`, `data/chrome-layers.json`: one row per layer per build per position.
- `data/sim-knockouts.json`: the knock-out diffs against g0.0e.

No URLs, device ids or addresses are in `data/`.
