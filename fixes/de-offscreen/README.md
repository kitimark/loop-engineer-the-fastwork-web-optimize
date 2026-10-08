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
  step. Section 6 resolves this: the 46 px are mostly the long frame's own length. So the phone frame may hold other work the Simulator's stepped scroll separates: an IntersectionObserver
  delivery that is late by one or more frames, plus whatever else crosses at 4608. Inferred; not tested.
- **The g0.0f-only layer restructure is the glint start, ~1 s after the flip.** It adds +9 layers, 2 animations,
  overlap re-composite of 5 siblings and a 2-layer rebuild at +0.2 s. KO B leaves it as it is.
  - If the phone frame is to be attributed to it, the test is a phone Timeline run that marks the glint
    `.is-active` flip next to `+is-play`.
  - A knock-out that removes it: in g0.0f, keep the glint's `.is-active` off (no CSS animation). That is not
    pixel-identical (no glint), so it is diagnostic only.

## 6. The phone data (P-168, window B): what is in the `+is-play` frame

The lead's follow-up: answer section 5.4's decisive check from P-168's own phone runs, before planning any new run.
P-168 captured Timeline on every counted W run (iPhone 15 Pro Max, Safari 26.6.1, tool-serious). Source: fix-g0-box's
`out/p168ph/runs/w-B{0,e,k}{1,2,3}.json` and `tl-*.json`, read only (arms: 0 = v0, e = g0.0f, k = g0.0g). Reader:
`p168-isplay-read.mjs`, output `data/phone-p168-isplay.json`. The `+is-play` frame is p166-wread's `spotFrame`, and
a frame covers (t − dt, t]. Composite and Paint records come from the run's Timeline, on the same clock as
p168-wread uses.

| run | arm | flip seen at y | flip frame (y range, dt) | Composite in it | Paint records nested in it: n / ms / area (CSS px²) | glint `.is-active` |
|---|---|---|---|---|---|---|
| B01 | v0 | 4516 | 4516-4562, 43 ms | 1 record, 39.5 ms | 10 / 1.3 ms / 275 000 | highlight +973 ms (59 frames later) |
| B02 | v0 | 4516 | 4516-4562, 45 ms | 41.3 ms | 10 / 2.0 / 275 000 | highlight +972 ms |
| B03 | v0 | 4516 | 4516-4562, 46 ms | 41.5 ms | 10 / 1.8 / 275 000 | highlight +971 ms |
| Be1 | g0.0f | 4526 | 4526-4609, 74 ms | 63.5 ms | 8 / 2.6 / 271 326 | glint +943 ms (57 frames later) |
| Be2 | g0.0f | 4526 | 4526-4609, 73 ms | 61.5 ms | 7 / 2.5 / 263 534 | glint +944 ms |
| Be3 | g0.0f | 4525 | 4525-4608, 69 ms | 58.0 ms | 7 / 2.5 / 263 534 | glint +948 ms |
| Bk1 | g0.0g | 4526 | 4526-4609, 71 ms | 60.0 ms | 7 / 2.9 / 263 534 | glint +946 ms |
| Bk2 | g0.0g | 4526 | 4526-4608, 69 ms | 58.4 ms | 8 / 2.8 / 271 326 | glint +947 ms |
| Bk3 | g0.0g | 4525 | 4525-4607, 69 ms | 59.4 ms | 7 / 3.2 / 263 534 | glint +948 ms |

Answers, all OBSERVED on the phone, 3 runs per arm:

1. **The glint does not land in or next to the flip frame.**
   - g0.0f and g0.0g: the glint's `+is-active` comes 57 frames (943-948 ms) after the flip frame. The frame it lands
     in is 16-17 ms long, with 0-0.3 ms Composite and no Paint record.
   - v0: its `<animate>` highlight comes 59 frames (971-973 ms) later, in a 16-17 ms frame.
   - So the g0.0f-only layer restructure of section 5.2 is not part of the slow frame on the phone, and it costs
     nothing visible in its own frame.
2. **The flip frame's extra Composite is not painting.**
   - Each flip frame has exactly one Composite record. It holds 7-10 nested Paint records, together 1.3-3.2 ms,
     over almost the same area in every arm (263-275 k CSS px²). The three largest boxes are identical:
     343x380 @ y 5139, 360x312 @ y 5180, 104x115 @ y 5270.
   - g0.0f's Composite is 58-64 ms against v0's 40-42, with **fewer** Paint records and about +1 ms of Paint time.
     So ~95 % of the Composite record, and all of g0.0f's ~20 ms excess, is Composite time outside the Paint records.
   - Source (section 5.3): this Composite bracket also holds the transaction walk, `prepareBackingStoresForDisplay`
     and the commit encoding.
   - CONFIRMED by source: `RemoteRenderingBackendProxy::endPreparingImageBufferSetsForDisplay` sends a **synchronous**
     IPC to the GPU process (`PrepareImageBufferSetsForDisplaySync`) when any buffer set being prepared may have a
     volatile front buffer. Otherwise it sends an async message (RemoteRenderingBackendProxy.cpp:604-650).
     Idle backing stores are made volatile by a 200 ms repeating timer (RemoteLayerBackingStoreCollection.mm:45,
     250-276, 354-391). Front buffers are made volatile only for stores that are not reachable in the latest flush.
   - UNRESOLVED:
     - Is DOM rendering in the GPU process on this iOS build? The default depends on the build flags
       `GPU_PROCESS_BY_DEFAULT` and `GPU_PROCESS_DOM_RENDERING_BY_DEFAULT`, WebPreferencesDefaultValues.cpp:324-335.
       If it is, Paint records time only the display-list recording, which would fit 1-3 ms for ~2.4 M device px.
     - Does the flip commit take the sync path?
   - A hypothesis, not tested: g0.0f's page is otherwise idle (its other move frames have a median Composite of
     0.2 ms and 0 Paint records, against v0's 7-7.5 ms and 4 Paint records). So more of g0.0f's stores may be
     volatile when the flip commit displays them, and that costs a GPU-process round trip.
3. **Layer-tree size: not recorded** in the P-168 run records (`pre` / `post` hold docH, vh, finalY, fonts, resources).
   The Simulator census (section 5.1) gives 50 layers after the flip on v0 and 60 on g0.0f.

**Correction to "the flip lands 46 px later on g0.0f" (P-167, P-168).**
- The MutationObserver sees the class flip at y 4516 (v0) and 4525-4526 (g0.0f, g0.0g): 10 px apart, under one
  frame at the ~0.5-0.6 px/ms scroll just before it.
- The quoted y (4562 vs 4608) is the flip frame's *end*. The window driver keeps scrolling during the long frame:
  46 px in v0's 43 ms frame, 83 px in g0.0f's 74 ms frame.
- So the 46 px gap is mostly a result of the frame's length, not a later trigger. The Simulator agrees: both builds
  flip in the same 8 px step (section 5).

**What this leaves for the +20 ms.** Inside the one Composite record, and not in its Paint records:
- the transaction walk over 10 more unchanged layers;
- the buffer preparation for the 7 new and the re-displayed stores, possibly a sync IPC;
- the commit encoding.

The phone data cannot separate these. Options for the next check (no phone run planned yet):
- a phone W run of g0.0f+B, which has v0's layer count but g0.0f's idle page, as a third arm next to v0 and g0.0f
  at window B with Timeline on. If its Composite stays at g0.0f's level, tree size is ruled out.
- a WebKit `RemoteLayerBuffers` log of the flip commit, which shows whether the sync prepare path is taken. That is
  a Simulator check, so it says nothing about timing.

## 7. End of page, finger down: where P-164's frames over 50 ms come from (step 4, data only)

The question (lead, user T-228 #98/#101): on g0.0f, P-164 counted 5, 10, 8, 9 finger-down frames over 50 ms per run
(g0.0e: 7, 5, 6, 6). Which moments and code paths are they? The user's priority is first the drag down toward the
end, second the close-start frame at the end.

Data: fix-g0-box's `out/g0bp/runs` (P-164 G-gesture records with Timeline, EC1-EC4 = g0.0e, EV1-EV4 = g0.0f), read only.
Reader: `p164-fingerdown-read.mjs` (data/phone-p164-fingerdown.json). Rules:
- A frame is finger-down when its span overlaps a touchstart → touchend contact.
- Timeline records are summed per frame at their own depth. "RF-other" is RenderingFrame time not covered by any
  child record.

The reader's counts match P-164's exactly (C 7, 5, 6, 6; V 5, 10, 8, 9). All results are OBSERVED, iPhone 15 Pro Max,
tool-serious, G driver.

### 7.1 Where they are

- **Every finger-down frame over 50 ms is in the approach**: the 12 drags (520 px each) that scroll the page from the
  top to the end, at y 25-4501, with the menu closed and no move prevented. That is 24 frames on g0.0e and 32 on g0.0f.
- **At the end (the menu's open and close strokes) there are 0** in either arm.
  - Over 34 ms at the end there are 5 per arm over 4 runs, in two kinds: the close-start frame (finger down
    +237-253 ms, the frame of the jack's close trigger; 35-40 ms, Composite 33-45 ms) and a 35 ms frame at +1650 ms
    in some close strokes (Composite 31-33 ms, RF-other 17 ms).
  - Both are equal across the arms.

| y (end of frame) | moment | g0.0e / g0.0f, sum of 4 runs | what fills the frame (Timeline) |
|---|---|---|---|
| 600-670 | 2nd drag, +335-430 ms: nav leaves the hero pill (`-is-hero-pill`), `#people +is-visible` (W crossings put both at y 625-632) | 7 / 7 | Composite 35-65 ms, the scroll engine's rAF 15-32 ms (`iE`, JS 2705, forcing a 12 ms Layout), transition-start and animation-end events |
| 880-1030 | about 890: `pain +is-pain-dark` (W: y 903); about 1025: 3rd drag at +165 ms | 7 / 7 | at 890: Composite 40-66 ms with 13 ms style + 13 ms Layout. At 1025: two style+layout passes back to back (25 + 17 ms) |
| 1750-1770 | 4th drag, +575-608 ms: the end-of-page IntersectionObserver fires | 4 / 4 (1 per run, every run) | ObserverCallback (JS 14437), then style recalc 25-52 ms with 16 ms Layout, then Composite 28-40 ms |
| 1500, 2000-2020, 3010-3050, 3500 | the frame about 35 ms before the finger lifts | 4 / 7 | at 1500 / 2005: Layout 24-27 ms + RF-other 30-55 ms. At 3010 / 3500: RF-other 70-87 ms, almost nothing else |
| 4495-4501 | 9th drag: platform `+is-play` (P-169) | 1 / 3 | Composite 55-78 ms (sections 5-6) |
| 0-300 | 1st drag, +165-630 ms | 1 / 3 | Layout 36 ms or style 39 ms; mostly g0.0f, as in P-168 window A |

g0.0f's +8 over g0.0e is entirely in the last three rows. The first three rows (18 of g0.0e's 24) are the same in
both builds.

### 7.2 What is behind them

- **A. A ~13 ms style + layout pass, about 9 times per second, all through the approach** (both arms).
  - Approach Timeline, per run: 308-314 Layout records ≥ 5 ms (9.2-9.4 per s), median 12.6-12.7 ms, together
    4.1-4.2 s of 33 s. Every one has the viewport as its layout root.
  - About 110-115 per run are outer `Layout → RecalculateStyles → Layout` records that sit next to touchmove/scroll
    dispatches with no script around them. These are native layout flushes. Others are forced inside the scroll
    engine's rAF (`iE`, g0.0f JS 2705).
  - Something writes styles on every scroll frame, so each flush recalculates style and lays out the page again (a
    full pass: ~12.7 ms).
  - Frames over 50 ms in rows 1, 2 and the 1500 / 2005 drag ends are 2-3 of these passes stacked, plus Composite.
  - The v12 notes already name "a ~13 ms forced layout still in the scroll loop on WebKit" (BEST_BUILDS, P-159).
    This is the same cost, seen at every scroll position.
  - The style writer is not identified. The decisive check is a Simulator probe (counts only, no timing):
    - a MutationObserver on style and class attributes plus a CSSStyleDeclaration.setProperty hook, per scroll frame;
    - the Timeline's RecalculateStyles initiator;
    - run along 0 → 4600 on g0.0e and g0.0f.
  - **Which WebKit path flushes layout after a touchmove on iOS: UNRESOLVED.** The iOS touch-event code is partly
    outside the open source.
- **B. Row y 1750-1770 is g0's own end-of-page arming** (g0.0f JS 14437-14443; g0.0e has the same code).
  - The IntersectionObserver on `.start-selling-platform` (rootMargin 200 %) fires mid-drag. It sets `b`, which gives
    every morph-panel column image its `src` (JS 14630) and lifts the panel's `inert` (JS 14692). It also calls
    `N()`, which adds the non-passive capture `touchmove` and `wheel` jack (JS 14414-14420).
  - Cost: one 25-52 ms style recalc + 16 ms layout + 28-40 ms Composite, in every run of both builds.
  - From the next drag on (y ≥ about 2010), the first ~10 touchmoves of every drag arrive cancelable. Before that
    point they are 0 of 91-105 per drag. So each drag's start now waits on the main thread.
- **C. Row y 600-670 is the hero-pill exit.**
  - `iE`'s callbacks force a 12 ms layout at the crossing, then the nav's morph transitions start (7
    `transitionrun`, 4 `finish`).
  - The Composite of 35-65 ms holds two more nested style+layout passes (A).
- **D. Row y 880-1030** is the theme flip to dark (`section.pain +is-pain-dark`, y about 903) and, at about 1000,
  `-he-css` (g0.0f) and the avatar carousel's `is-sliding` toggles. Both are followed by double style+layout
  passes (A).
- **E. Drag-end frames are mostly not page work.**
  - Every drag has a 24-29 ms frame about 50 ms before the finger lifts. The finger is almost still there
    (0.05-0.07 px/ms, the G drag profile's lift-off). The frame's RenderingFrame holds only touchmove dispatches,
    3-8 ms of children.
  - In some drags it stretches to 54 ms (RF-other 70-87 ms; at 3010 and 3500), or stacks with the layout tax (A).
  - The web process's main thread is idle in these frames, so the time is spent outside it. Candidates: the next
    rendering update waits for the previous commit (`RemoteLayerTreeDrawingArea::updateRendering` returns early
    while `m_waitingForBackingStoreSwap`, RemoteLayerTreeDrawingArea.mm:331-334), or the UI process schedules no
    update while the finger is nearly still.
  - UNRESOLVED. The decisive check is the same frames in another build's G records, or under a finger (F) run. If
    they appear on every build, they come from the driver or the OS, not the page.

### 7.3 Candidates, ranked for the drag toward the end (the user's first priority)

Gains are guesses on g0.0f's 32 frames over 50 ms per 4 runs. None is measured.

| rank | candidate | code | expected gain | pixel-identical? | owner |
|---|---|---|---|---|---|
| 1 | **Arm the end-of-page off the drag** (B): set `b` (image `src`, un-inert) in idle time after load, or at a still moment, instead of from the 200 % IntersectionObserver mid-drag. Keep `N()` (the jack) attached only when the page can actually reach the end (e.g. a smaller rootMargin, or attach on the first still moment within 1 viewport) | g0.0f JS 14437-14443, 14414-14420, 14630, 14692 | −4 (one per run, every build), and drag starts no longer wait on the main thread from y 2010 on | yes: the panel is hidden (opacity 0) until the menu opens; the images only need to be loaded before then. Needs a check that the first open still finds them decoded | **g0-box** (g0.0 end-of-page code) |
| 2 | **Find and remove the per-scroll style writer** (A), so the native flushes after touchmove/scroll find nothing to do | unknown; candidates: the nav state handler (`__nsOnScroll`, JS 14247), the scroll engine's `iE` callbacks (JS 2705), scene/class gates | largest: rows 1, 2 and part of the drag ends sit on 2-3 stacked 13 ms passes; guess −8 to −15 | yes if writes are skipped only when the value is unchanged | first the probe above (de-offscreen or fix-g0-box's Simulator harness); then the writer's topic (scroll-engine / nav-scroll-handler) |
| 3 | **Shrink the full layout** (A): keep far sections and the hidden morph panel out of layout while the user is far from them (`content-visibility`; f-cv25 did it only near the top). Every remaining pass gets cheaper | CSS, fwDef / fwRender (JS 2709-2725) | guess −5 to −10, together with 2 | yes for `content-visibility: hidden` on off-screen, unpainted content; needs the f-cv25 pixel gate per section | g0-box (f-cv25) / scroll-engine |
| 4 | **Hero-pill exit** (C): take the forced layout out of `iE`'s callback at the crossing (read geometry from cached values, as nav-hit-cache did for the theme) | JS 2705 → the nav callbacks around 14221-14350 | −1 to −2 per run on its own, more with 2 | likely (same transitions) | nav-hit-cache / nav-morph owners |
| 5 | **Theme flip and hero-exit toggles** (D) | `pain +is-pain-dark`, `-he-css`, avatar `is-sliding` | −1 to −2 per run with 2 | likely | nav theme / hero-exit-threaded / avatar carousel |
| 6 | `+is-play` frame (P-169 running), first-drag Layout at y 0-300 (g0.0f only, P-168 window A) | sections 5-6 | −2 each, g0.0f only | f-B2 yes | g0-box |
| – | drag-end frames (E) | outside the page (UNRESOLVED) | probably none from page code | – | first a cross-build check of existing G records |

**Three earlier prototypes, checked against these items** (the lead asked, for the user):
- **v9.1d's scroll-cb ("faster scroll callback"):** it matches A, the largest group.
  - `scbGate` gated the four side jobs behind `iE`: commission, future, platform and profile ran about 146 times per
    second during a scroll, each reading 1-3 rects, with idempotent style writes on phones (fixes/scroll-cb-phone).
  - It is not in g0.0f (no `scbGate`). It left v9 on a ruling, not a proven cause: a first fling stopped short in the
    Simulator (fixes/v9-best).
  - It does not match items 3 or 4. It is the strongest prior candidate for rank 2.
- **fwreskip:** the hero's far re-skip at y≈2988 costs about 20 ms of relayout in the deck. It sits at the same y as
  the 3010-3050 drag-end frames, but those frames hold no Layout (an idle main thread), so it does not match item 4.
  P-064 saw 0 slow frames either way. Low.
- **v13's c3 ("toolbar moves no longer force a full re-measure"):** it matches only the first drag's 13-15 toolbar
  steps (innerHeight 775 → 815 at y 13-120; frames 27-44 ms, none over 50), not items 3 or 4. g0.0f's nav drops its
  geometry cache on every resize (JS 14250-14252), so c3's guard appears not to have been kept (inferred). It might
  trim the first drag's frames over 34; low for frames over 50.

### 7.4 Item E checked across builds: the drag-end frame is the driver or the OS, not the page

The same G "drag" strokes (520 px in 1200 ms, lift-off 62 px/s) also ran in the approach of two other blocks, on
builds with entirely different end-of-page code. Data, read only: arch-compositor-morph's `out/cmp160/runs` (P-160:
v9-final rev 7d and v13) and `out/cmp163/runs` (P-163), run 1 of each arm. The per-drag worst frame within ±120 ms
of lift-off:

| block, arm | drags with the 24-29 ms frame about 50 ms before lift-off | stretched frames (dt > 34) | content of the empty frames |
|---|---|---|---|
| P-164 g0.0e (EC3) / g0.0f (EV2) | 9-10 of 11 | 54 ms at y 3015 / 3507 (+ the layout-stacked 38-40 ms at y 1000-1500) | RenderingFrame children 2-8 ms; touchmove dispatches only |
| P-163 C / V | 7-9 of 11 | C: 37-58 ms at y 1001-1503, 2999; V: 54 ms at y 2011 and 3524 | same: children 2-11 ms in the plain ones |
| P-160 C / V | 7-8 of 11 | 35-46 ms at y 1005-1503, 3003 | same |

- **Every build shows the same frame at the same moment.** It appears at y 4000-5500 too, where nothing on the
  page changes, and the finger is almost still (0.05-0.07 px/ms).
- **The 54 ms stretches also appear on the v13/v14-lineage builds** (P-163 V: 54 ms at 2011 and 3524).
- **Verdict: item E comes from the G driver's lift-off (the WDA drag profile) and the OS, not from page code
  (OBSERVED, 3 blocks).** Drop it as a page-fix target.
- Frames where E stacks with the layout pass (A) at y 1000-1500 / 2005 shrink with A's fixes. A finger (F) run would
  tell whether people feel the lift-off frame at all. It is not needed for the page fixes.

**For the end itself (second priority):** the close-start frame (35-40 ms, Composite 33-45 ms, both arms) is the
first frame of the close tween, the jack's `E(0)` → `T` rAF (JS 14374-14390). Idea: keep the menu's layers
composited between the open and the close, as v14's K6 did for the open. Likely pixel-identical; gain at most one
frame over 34 ms per close; owner g0-box. The +1650 ms frame is not identified.

## 8. The nav and the end menu, layer by layer per morph state (T-228 #110, T-253)

The user saw many compositing borders on the top nav and at the end of the page. This census looks at the nav and
the menu per `--morph` state. Simulator (WebKit, Mobile Safari), counts only, no timing. Data:
`data/sim-morph.json` (`morph-read.mjs --json`). Probe: `morph-sim.mjs`.

**Method.**
- One fresh load per arm (v0; g0.0f = snap4/V), settled for 6 s.
- States:
  - a: mid-page with the nav pill (y 2400).
  - b: the end, m = 0.
  - Open, stepped: a rAF shim holds only the tween's own callback `T` (the one that calls `ZM`) and feeds it virtual
    timestamps o + 16 ... 680 ms, so m = 0.06 ... 1. Per step it takes a census 60 ms and 450 ms after the step,
    plus the owners of new layers. c is the steps at m ≈ 0.2 and 0.5.
  - d: m = 1, settled.
  - Close, stepped the same way.
  - e: settled after the close.
- Repaints per step = paintCount difference since the previous step, minus the most a layer gained over two null
  steps (same census pattern, no step) at b or d.
- The tween starts from a synthetic wheel event, which the original's jack listener `A` handles.
- CSS transitions are not held, so they settle between steps.

**Totals, layers / backing MB** (OBSERVED):

| state | v0 | g0.0f |
|---|---|---|
| a, mid-page pill | 125 / 50.9 | 161 / 50.2 |
| b, end, m = 0 | 29 / 67.0 | 53 / 74.6 |
| c, m ≈ 0.2 | 110 / 73.1 | 54 / 72.2 |
| c, m ≈ 0.5 | 110 / 87.1 | 53 / 78.1 |
| d, m = 1 | 110 / 86.8 | 53 / 77.3 |
| e, after close | 30 / 67.0 | 53 / 70.2 |

At b, 12 of g0.0f's extra layers are in the platform section, all 0 MB.

### 8.1 The nav header group (user question 2)

| layer | WebKit reason | v0 (m 0 → 1) | g0.0f (every state) |
|---|---|---|---|
| header `.start-selling-top-nav` | filters (backdrop-filter), positionFixed, stacking | 0.7 → 11.6 MB, +1 paint per step | 0 MB, never repaints |
| `.fw-bx-fill.fw-bx-light` / `-dark` | willChange (transform / opacity) | none | 2 layers, 0 MB (solid colour) |
| `.start-selling-top-nav-bar` | overlap | 0.7 MB, +1 per step | same |
| `.start-selling-top-nav-actions` | transformWithCompositedDescendants (translate -50 % over the switch's layer) | 0.2 MB | same |
| `.start-selling-language-switch` | filters (its own backdrop-filter blur 12px) | 0.1 MB | same; 9-23 paints per step around m 0-0.2 and at the close end |

- g0.0f: 6 layers / 1.0 MB in every state. v0: 4 layers, 1.7 MB at m = 0 and 12.6 MB at m = 1.
- The clip-path on g0.0f's header is a shape mask on the header's own layer, not a separate layer.
- Join `.is-earn`: no layer in either arm at a, b or e. So `filter: blur(0)` at rest, and the finished fill-both
  mask/sheen, hold no layer in these states (OBSERVED).
- The header is not flagged backdropRoot.
- One short-lived layer appears at m ≈ 0.13-0.26 in both arms. It was gone before its owner could be read
  (likely the Join fade).
- The header's `will-change: width, height, border-radius, background` composites nothing: none of these
  properties is in WebKit's will-change trigger list (`StyleWillChange.cpp` 83-110 @f9dcd0ee93e4), and no layer in
  either arm carries a willChange reason for it (CONFIRMED).
- `filter` composites in WebKit's web process: `requiresCompositingForFilters` (RenderLayerCompositor.cpp 4037-4050)
  needs FilterTrigger, which `ChromeClient::allowedCompositingTriggers` grants by default (ChromeClient.h 551,
  AllTriggers), and WebChromeClient does not override it (CONFIRMED).

### 8.2 The menu panel, its clock and the centre (user question 1)

- **Panel layers.** 11 in both arms, 15.1 MB while hidden at opacity 0 (a, b, e), 35.5 MB at m = 1:
  - morph-panel, backdrop and the 3 columns (0 MB, "with composited descendants").
  - 3 col-tracks: animation, 2.5 MB each.
  - morph-veil (0.7 → 11.6 MB), morph-center (5.6 MB) and morph-footer (1.3 MB): overlap or stacking only. They sit
    above the animated col-tracks; the overlap rule is RenderLayerCompositor.cpp 1341-1346 (@f9dcd0ee93e4, around
    1344). The earlier knock-out B (col-track animation off in the paused scene) removed all three (section 4).
- **The clock is inside morph-center** (JS 12879; `cD` 3918, the sliding digits `$E` 3820-3870).
  - v0 at m = 0: morph-center repaints about 80 times per 0.45 s while hidden. v0's `cD` ticks every second
    regardless of state (setInterval, JS 3931-3943).
  - g0.0f at m = 0: 0 (the clock is frozen while closed, `__cdLive`).
  - g0.0f at m = 1: about 21 repaints per 0.45 s, and 20-29 on some open steps. Its digits are no longer layers, so a
    tick redraws the 5.7 MB centre.
  - v0 at m = 1: 0, because there its digit faces are layers and a tick only moves them.
- **Churn, v0 only.**
  - On the first open step (m 0.06), 81 layers are created: 80 `span.face` digit faces (`will-change: transform`,
    CSS 1408; 24.6 KB each, 2.0 MB in all) plus 1 overlap layer. They are destroyed on the last close step (m back
    to 0). Nothing is created or destroyed at the close start.
  - Every face repaints once per morph step: 80 paints per tween frame. The trigger is UNRESOLVED; it fits WebKit's
    subpixel-offset repaint (`RenderLayerBacking.cpp` 1939 @f9dcd0ee93e4) as the header's width moves the centre.
- **g0.0f has no churn.** It stays at 53 layers from b through every step to e (apart from the one short-lived layer
  above).
- **Platform section.**
  - v0 at m = 1 (opacity 0): platform-card (13.3 MB) about 760 paints and the payment artboard about 380 per 0.45 s,
    from the doc-sweep title animations.
  - g0.0f sets `data-fw-pf-paused` from m ≈ 0.65 (fade 0). Its platform has 0 repaints at d, and at b too.

### 8.3 Which layers can go

| # | layers | MB | idea | pixel-identical | status / owner |
|---|---|---|---|---|---|
| 1 | v0 header repaint + backing | up to 11.6 | the nav paints nothing; 2 solid fills + clip-path | yes (PR-038) | done in g0.0f |
| 2 | v0's 80 digit faces (churn + 80 paints per frame) | 2.0 | faces `will-change: auto` + clock frozen while closed | yes (patch) | done in g0.0f |
| 3 | veil + centre + footer overlap layers | 7.6 at rest, up to 18.6 open | stop the col-track animation while closed (PR-039 option 2, f-B2) | yes | open proposal; fix-g0-box. Saves memory only: P-169 found no shorter `+is-play` flip frame (Composite medians v0 42.5, g0.0f 60.9, f-B2 59.2 ms) |
| 3b | g0.0f centre redrawn on each clock tick while open | 5.7 per tick | the clock on its own small layer while open (will-change on the countdown wrapper) | needs a pixel check (text on its own layer may differ by 1-3 levels) | proposal if not exact; fix-g0-box |
| 4 | 3 col-tracks + panel at rest | 15.1 | drop the hidden panel's layers at m = 0 | yes, but creation moves into the first open frame | not recommended |
| 5 | language-switch blur layer (+ actions) | 0.2 | drop its own backdrop blur inside the nav | no (double blur) | proposal only |
| 6 | top-nav-bar overlap layer | 0.7 | none while the fills under it are composited | – | keep |
| 7 | header `will-change` list | 0 | delete (no layer effect) | yes | cleanup, no gain |

**Decisive check, v0 with the panel clock hidden** (`morph-sim.mjs v0:noclock`, `.waitlist-closing-countdown` in the
centre set to `display: none` after load; a diagnostic knock-out, never a candidate):
- At m = 0 the centre's paintCount stays at 1 over the whole closed state. With the clock it went 87 → 194.
- The open makes 30 layers, not 110, at every step: no 80-face churn.
- So the closed-state centre repaints and the churn are the panel clock (OBSERVED, Simulator).
- In v0 the 80 panel faces exist in the DOM while closed (88 `.face` in the page with the hero clock) but are not
  layers, so their roll paints into the centre. On open they become 80 `will-change: transform` layers. This fits
  map-cd-morphcenter's reading (the paused-scene rule sets `will-change: auto`); that rule was not re-read here.

## Files

- `layers-sim.mjs`, `layers-chrome.mjs`, `common.mjs`: the probes, which can be re-run (commands in their headers;
  shared lane).
- `isplay-sim.mjs`, `ipdiff.mjs` (section 5): the `+is-play` census probe and its analysis.
- `summarize.mjs`, `rank.mjs`, `kodiff.mjs`, `export.mjs`: the analysis.
- `data/sim-layers.json`, `data/chrome-layers.json`: one row per layer per build per position.
- `data/sim-knockouts.json`: the knock-out diffs against g0.0e.
- `data/sim-isplay.json` (section 5): per load, the flip commit's diff and the layer-set changes over the next 1.6 s.
- `p164-fingerdown-read.mjs`, `data/phone-p164-fingerdown.json` (section 7): P-164's finger-down frames, their moment
  and Timeline contents.
- `p168-isplay-read.mjs`, `data/phone-p168-isplay.json` (section 6): the P-168 phone runs' flip frame, its Composite
  and nested Paint records, and the glint flips.
- `morph-sim.mjs`, `morph-read.mjs`, `data/sim-morph.json` (section 8): the per-morph-state census (stepped tween),
  its reader and the compact export.

No URLs, device ids or addresses are in `data/`.
