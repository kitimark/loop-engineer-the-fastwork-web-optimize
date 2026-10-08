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

## 5. The spot-B `+is-play` commit: which layers change (step 2, after P-168)

The lead's question after P-168: on the phone, g0.0f's worst frame at spot B is the `+is-play` frame (y 4608, max 73 ms,
Composite 58-64 ms; v0's is at y 4562, 43-46 ms, Composite 40-42 ms; no Layout in either). Which layers are created,
resized, repainted or committed in that frame on g0.0f vs v0? Simulator only, counts / MB / paints, **no timing claims**.

**Setup** (`isplay-sim.mjs`, `ipdiff.mjs`; 2026-10-08 16:20-16:39Z, three shared-lane Simulator sessions):
- Arms: **v0**, **g0.0f**, **g0.0f+B** (g0.0f with knock-out B injected as a `<style>` after the 6 s settle).
- 3 fresh loads per arm (9 loads), served hashes checked before each load (all `ok`). Viewport 430x775, DPR 3.
- A MutationObserver on the two `is-play` owners stamps each class flip (y, page time). Jump to 4000, 3 s, then
  scroll to 4460, then 8 px steps until `+is-play` lands.
- Census (`LayerTree.layersForNode`) before the step. After the flip: back-to-back censuses at the same position for
  1.6 s, each stamped with ms after the flip (tRel). Owners and reasons for every layer that changes.
- The flip landed at y 4516 in every load (`.start-selling-platform-secure.is-network`), 3-13 ms after the step; is-play was never already on at the start. The
  Simulator does not reproduce the phone's 46 px offset between the arms (both bindings are the same code:
  `"is-play": s(h) && !s(g)`, JS 12379 in v0 / 13448 in g0.0f, `h` set by an IntersectionObserver at ratio ≥ 0.35).

### 5.1 In the `+is-play` commit itself: the same 7 new layers in all three arms

| arm | loads | layers before → after | MB before → after | created (MB) | destroyed / resized | repainted layers (paints) |
|---|---|---|---|---|---|---|
| v0 | 3 | 43 → 50 | 127.5 → 129.8 | 7 (14.06) | 0 / 0 | 3-4 (8-10): platform-card 23.8 MB ×6, top-nav ×1, ask-field ×2 (load 3: + morph-center ×1) |
| g0.0f | 3 | **53 → 60** | 128.1 → 130.4 | 7 (14.08) | 0 / 0 | 1 (2): ask-field ×2 |
| g0.0f+B | 3 | 43 → 50 | 113.0 → 115.3 | 7 (14.08) | 0 / 0 | 1 (1-2): ask-field |

- **Created at the flip, every arm, every load:** `img.…-secure-network-rings` 11.71 MB (542x600 CSS px), the shield
  1.49 MB, both faces 0.42 MB each, both dashes 0.01-0.02 MB, the flags 0 MB. Each is a new backing store painted
  in full once (paints 1).
- At the same time `div.start-selling-platform-stage-artboard` drops 11.8 MB: its backing store shrinks to what is
  left after the new layers take their content.
- **Nothing is resized.** No new layer is near the tiling size, so none of them switches to a tiled layer (source below).
- **g0.0f has 10 more layers in the tree than v0 at the flip** (53 vs 43), all unchanged in the commit:
  - 8 platform row-title layers: 4 masks (doc, earn, secure, organized; `maskWithCompositedDescendants`) plus their
    4 `::after` sweeps (`animation`), 37-38 px tall, together about 1.3 MB (section 2);
  - 2 more top-nav-pill-sized layers (398x52, 0 MB).
- **g0.0f+B has v0's count but not v0's set.** KO B removes the 10 hidden morph-panel layers (col-tracks, center,
  footer, veil; 15 MB) that v0 and g0.0f both have at B. The 10 row-title and pill layers stay.
- **v0 repaints more in this commit, not less** (platform-card, 23.8 MB, 6 paints).

So the census of the flip commit does **not** show anything g0.0f adds to it: the same 7 new backing stores
(14.1 MB first paint), nothing destroyed or resized, and fewer repaints. The only difference is 10 more unchanged
layers in the tree (OBSERVED).

### 5.2 One second later, g0.0f only: the glint start rebuilds the network's layers

The glint's `.is-active` is set by `window.setTimeout(r, 1e3)` once the same IntersectionObserver reports the network
visible (g0.0f JS 13281-13294). In g0.0f (platform-idle G1) the glint is a `clip-path: path(…)` span with an SVG that
runs a 5 s infinite CSS transform animation (CSS 7180-7213). In v0 it is an SVG `<animate>` on the gradient
(JS 12152), which creates no layer.

Layer-set changes after the flip (tRel = ms after the flip). The pattern is the same in all 9 loads (data/sim-isplay.json `events`):

| tRel ms | v0 | g0.0f | g0.0f+B | what |
|---|---|---|---|---|
| 8-18 | +7 | +7 | +7 | the flip commit (5.1) |
| 479-964 | +9 / −16 | +9 / −16 | +9 / −16 | the network's intro sequence: the flags (6, 0 MB) and the shield logo appear, then every intro layer is de-composited after its entry animation; same in all arms |
| 998-999 | – | **+4** | **+4** | 2 glint SVGs (`animation`, 0 MB) and 2 glint clip spans (0 MB) |
| 1013-1017 | – | **+5** (+2.4 MB) | **+5** (+2.4 MB) | dash left (`transformWithCompositedDescendants`), dash right, both faces and the shield (`overlap`), re-composited ~50 ms after the intro dropped them. In g0.0f load 3 the +4 and +5 land in one sample at 967 ms, in the same commit as the intro's last −3 |
| 1067-1152 | +5 (+6.2 MB) | +5 | +5 | 4 `agents-ask-service` cards (3.05 MB each) + 1 container (`agents-ask-list-out`), same in all arms |
| 1211-1219 | – | **+2 / −2** | **+2 / −2** | the 2 glint clip layers are rebuilt (`clipsCompositingDescendants`) when the 0.2 s opacity transition ends |
| at 1.6 s | 48 L / 133.7 MB (3 of 3) | **67 L / 136.7 MB** (2 of 3; load 3: 65 L / 142.7 MB after a −2 at 1614 ms) | 57 L / 121.6 MB (3 of 3) | |

- **What the glint start adds:** 9 layers and 2 running animations in two commits about 15 ms apart, then a
  rebuild of 2 layers 0.2 s later. Five of the nine exist only because the animated SVGs now sit next to them
  in paint order (reason `overlap`).
- **v0 has none of these layer changes.** Its `<animate>` repaints the dash in place instead. In the Simulator Timeline,
  v0 shows a Composite record of ~16-19 ms on most frames after ~1.03 s, against ~2-5 ms on g0.0f. These are
  Simulator ms, quoted only to show where the work goes, not as a cost claim.
- **KO B does not touch either commit.** g0.0f+B shows the same +7 at the flip and the same +9 at the glint start.
  It only removes the 10 hidden panel layers from the tree.
- **P-168 says the phone's `+is-play` frame is the only frame over 34 ms in the scroll phase.** So the glint
  restructure, which comes about 1 s later, was not a > 34 ms frame there (OBSERVED, phone data). Whether it can
  coincide with the flip frame on a finger scroll is not tested.

### 5.3 WebKit source: what the Timeline's "Composite" contains, and what makes it costly

Source: WebKit main @ f9dcd0ee93e4 (read with `gh api`). Status: CONFIRMED where cited, otherwise marked.

- **Composite = building and encoding the remote layer-tree commit, painting included.** CONFIRMED:
  - `Page::willStartRenderingUpdateDisplay` / `didCompleteRenderingUpdateDisplay` emit the inspector's
    `willComposite` / `didComposite` (Page.cpp:2836-2858). The comment there says that on Apple platforms these hooks
    "wrap the non-WebKit CA commit time which is mostly painting-related".
  - In `RemoteLayerTreeDrawingArea::updateRendering` (RemoteLayerTreeDrawingArea.mm:360-447) the bracket opens
    *after* `finalizeRenderingUpdate` (:360), which runs the GraphicsLayer flush (`flushCompositingStateIncludingSubframes`,
    Page.cpp:2802). So the compositing-requirements pass and the GraphicsLayer flush are **outside** Composite.
    Inside it are `buildTransaction` (:384), the commit encoding (:419-420) and `didFlushLayers` (:424).
  - `RemoteLayerTreeContext::buildTransaction` (RemoteLayerTreeContext.mm:204-221) does three things:
    - walks every layer (`recursiveBuildTransaction`, PlatformCALayerRemote.mm:220-270; an unchanged layer adds nothing
      but is still visited);
    - prepares and **paints every backing store that needs display** (`prepareBackingStoresForDisplay`,
      `paintReachableBackingStoreContents`, RemoteLayerBackingStoreCollection.mm:69-95);
    - attaches the created and destroyed layer lists.
- **New backing stores.** A new layer's store needs display, so its whole area is painted inside this Composite
  bracket (follows from the above; inferred, the first-display path in `RemoteLayerBackingStore` was not traced).
  At the flip that is 14.1 MB in every arm, 11.7 MB of it the rings image (1626x1800 device px).
- **Tiled layers: not involved here.** CONFIRMED: `requiresTiledLayer` compares the layer size times the *page* scale,
  not the device scale, with 1280 on iOS, or 1024 at low memory (GraphicsLayerCA.cpp:102-106, 4933-4946). The type
  switches at commit (:2199-2225). The largest new layer here is 542x600.
- **Mask and clip-path layers.**
  - A `clip-path: path()` becomes a shape mask layer with no backing store (RenderLayerBacking.cpp:3265-3266, 3281).
    That is the glint's clip.
  - A CSS mask gets a painted mask layer (:3241-3282). Those are the row-title masks, unchanged in the flip commit.
- **Animations.**
  - A layer's accelerated animations are wrapped in `PlatformCAAnimation` groups, one per animated property, and set
    on the platform layer, so they travel in the commit (`updateAnimations`, GraphicsLayerCA.cpp:3524-3560).
  - Adding one notes `AnimationChanged | CoverageRectChanged` on the layer (GraphicsLayerCA.cpp:1253). A transform
    animation that starts or ends marks `CoverageRectChanged` on every descendant (:1999-2000, 2045-2049). Both happen
    in the GraphicsLayer flush, before the Composite bracket.
  - The glint start adds two transform animations.
- **Overlap re-evaluation.** A layer that changes its composited state makes the compositor re-run the requirements
  pass for the later layers, with overlap tests (RenderLayerCompositor.cpp:1303-1318, ~2539; RenderLayerBacking.cpp:1216).
  This is why the 5 network siblings come back as `overlap` 15 ms after the glint SVGs are composited. That pass runs
  before the Composite bracket.
- **UNRESOLVED:**
  - the cost per visited unchanged layer in `recursiveBuildTransaction`;
  - the cost of a first display in `RemoteLayerBackingStore`;
  - whether the GPU-process side (`backingStoreFlusher->flush`, :436-437, on the commit queue) can lengthen the
    phone's frame.
  - The decisive local check is a phone Timeline block that compares the flip frame's Composite against the
    number of Paint records nested in it, per arm.

### 5.4 What this means for the `+is-play` frame (OBSERVED, Simulator counts)

- **The census does not explain g0.0f's +20 ms Composite in the flip frame by anything it creates, resizes or
  repaints.** All three arms create the same 7 layers (14.1 MB) there, and g0.0f repaints less than v0.
- **What g0.0f does add to that commit is tree size: 10 unchanged layers** (8 row-title mask / sweep layers, 2
  pill-sized layers), each visited by `recursiveBuildTransaction`.
  - KO B does not test this. It removes 10 *other* layers, so g0.0f+B ends up at v0's count.
  - The row-title layers are KO C's (section 3).
- **The phone flip lands 46 px later on g0.0f** (y 4608 vs 4562), but in the Simulator both arms flip at the same
  step. So the phone frame may hold other work the Simulator's stepped scroll separates: an IntersectionObserver
  delivery that is late by one or more frames, plus whatever else crosses at 4608. Inferred; not tested.
- **The g0.0f-only layer restructure is the glint start, ~1 s after the flip.** It adds +9 layers, 2 animations,
  overlap re-composite of 5 siblings and a 2-layer rebuild at +0.2 s. KO B leaves it as it is.
  - If the phone frame is to be attributed to it, the test is a phone Timeline run that marks the glint
    `.is-active` flip next to `+is-play`.
  - A knock-out that removes it: in g0.0f, keep the glint's `.is-active` off (no CSS animation). That is not
    pixel-identical (no glint), so it is diagnostic only.

## Files

- `layers-sim.mjs`, `layers-chrome.mjs`, `common.mjs`: the probes, which can be re-run (commands in their headers;
  shared lane).
- `isplay-sim.mjs`, `ipdiff.mjs` (section 5): the `+is-play` census probe and its analysis.
- `summarize.mjs`, `rank.mjs`, `kodiff.mjs`, `export.mjs`: the analysis.
- `data/sim-layers.json`, `data/chrome-layers.json`: one row per layer per build per position.
- `data/sim-knockouts.json`: the knock-out diffs against g0.0e.
- `data/sim-isplay.json` (section 5): per load, the flip commit's diff and the layer-set changes over the next 1.6 s.

No URLs, device ids or addresses are in `data/`.
