# Fix: menu-layers (T-253 #10, item 2: the menu clock on its own small layer while the menu is open)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured (Simulator counts, Chrome + Simulator pixel gates); the phone no-worse check (card below) has no data yet
**Stage:** F (build card and phone card below; the lead signs the phone card)
**Device class / gate:** render-bound, WebKit only → less-work landing rule (memory "less-work-landing-rule"): Simulator counts per morph state, pixel T2, one short phone no-worse check (G)
**Driver(s) behind the claims:** Simulator census (stepped tween, counts only); seek pixel gates (Chrome headless, iOS Simulator); phone G (card below, not run yet)
**Base:** g0.0h (fixes/g0-0h, landed 55f5cacd) = g0.0f + PR-039 keep-phase, JS 9162843e750f / CSS 26d28a0a263b. `patch.diff` is stacked on it (`node tools/fix.mjs apply menu-layers --on g0-0h`).
**Build:** g0.0h + clock layer, JS 9162843e750f (unchanged) / CSS adb875d94c1f
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only: two rules appended at the end (16 lines with the comment). No JS.

Scope: only item 2 of T-253 #10. Item 1 (the closed menu's overlap layers) is PR-039 keep-phase, which fix-g0-box built and
which landed as g0.0h (lead, 2026-10-08 18:1xZ).

## Why it costs

- The open menu's centre (`.start-selling-morph-center`, 406x389 CSS px at m = 1, **5.7 MB** backing at DPR 3) is a WebKit
  layer: by overlap with the animated photo columns, plus "stacking" from m ≈ 0.5 (de-offscreen §8.2; this census, below).
- The panel countdown inside it paints its digit cells unlayered on g0.0f/g0.0h (patch of v3w-g00e 1175-1196: faces,
  strips and cells `will-change: auto` in the panel; the panel clock keeps the rAF spring, JS `$E`, "hero clock only" branch).
- So every frame of a tick's roll (a roll runs about 0.4 s once per second while the menu is shown) writes the strip's
  transform, and WebKit re-displays the centre's backing store: **22 centre paints per 0.45 s at m = 1** (null-step
  control, Simulator), **196 over one stepped open**.
- What a paint costs in WebKit (source read by map-menu-layers-webkit, WebKit main 6d3243c9, CONFIRMED for the code paths):
  - The invalidated rect is already small, about the moving strip: `RenderLayer.cpp` 1361-1368, `RenderElement.cpp` 1550-1640,
    `RenderLayerBacking.cpp` 4339-4364, `GraphicsLayerCA.cpp` 1022-1054.
  - Each display of a layer still swaps that layer's buffers and re-targets a different IOSurface. It calls
    `setNonVolatile` on every display (`ImageBufferSet.cpp` 42-75) and copies the previously painted area forward (103-148).
  - The copy is the whole layer whenever the previous painted rect is lost. That happens on the first paint after a
    volatility mark, and the 200 ms timer in `RemoteLayerBackingStoreCollection.mm` 45, 124-143 can fire between two rolls.
  - The UI process hands Core Animation a new contents surface for the whole backing (`RemoteLayerBackingStore.mm` 553-639).
    No dirty-rect hint was found there (`m_paintedRect` is never assigned). UNRESOLVED whether Core Animation then
    re-uploads or composites the whole surface.
- In short: the pixels painted per roll frame are the same either way. The per-frame buffer work that scales with backing
  size runs on a 5.7 MB store, for a few digits.

## What changed

```css
html.fw-bx .start-selling-morph-center .waitlist-closing-countdown { isolation: isolate; }
html.fw-bx .start-selling-morph-panel[data-start-selling-scene="active"] .start-selling-morph-center .waitlist-closing-countdown { will-change: transform; }
```

- The panel countdown's wrapper (366x89 CSS px at m = 1, **1.2 MB**) is its own layer only while the menu scene is
  `active`. That is the same moment the photo columns run and the centre is a layer anyway (g0.0h JS ~14693; `active` =
  `--morph` > 0.001).
- While the menu is closed, the clock is frozen (`__cdLive`) and the centre is no layer (PR-039 keep-phase). A wrapper
  layer there would only add memory, so there is none.
- `isolation: isolate` at all times gives the wrapper a constant stacking context. The `will-change` flip at the scene
  change then cannot flip its used z-index (auto ↔ 0), which WebKit answers with a Layout (F-351; StyleAdjuster.cpp
  391-410 / StyleDifference.cpp 428-429 as cited there).
  - Nothing inside is positioned against an ancestor above the wrapper: the cells' containing block is `.digit`
    (position relative, inside it).
  - There is no blend mode, and nothing in the centre overlaps the wrapper. So the stacking context paints the same.
- **WebKit only** (`html.fw-bx`, set by g0.0f's own `GestureEvent in window` test, JS ~14612). Two reasons:
  - the cost is WebKit's;
  - Chrome drew the composited wrapper's digits **1 CSS px (3 device px) higher**, up to 224 levels at 5 of 22 seek stops
    (`out/menu-layers/seek-chrome-1`, the first, unscoped build CSS 28badb9b5a98; OBSERVED, in our setup, cause unknown).
  - Chrome keeps g0.0h's pixels: the rules don't match there.
- Desktop: the same rules apply in WebKit desktop Safari (`GestureEvent` exists on macOS Safari). One small layer while
  the menu is open; no look change expected (not checked at desktop width).
- Reduced motion: the clock snaps instead of rolling. A tick then repaints the wrapper once instead of the centre once.
  Nothing else changes.

## Gates

### Simulator layer census per morph state (counts only, no timing)

Probe `gates/morph-sim.mjs` is de-offscreen's `morph-sim.mjs`, with these arms (`gates/arms.mjs`). Reader:
`gates/morph-read.mjs`. One fresh load per arm, iPhone Simulator 430x775 DPR 3. Data: `out/menu-layers/morph-{b,c}.json`
(gitignored), compact `out/menu-layers/sim-morph-bc.json`. b = g0.0h, c = g0.0h + clock layer (CSS adb875d94c1f, served
hashes checked).

| state | g0.0h layers / MB | + clock layer layers / MB |
|---|---|---|
| a, mid-page pill (y 2400) | 151 / 35.1 | 151 / 35.1 |
| b, end, m = 0 | 43 / 55.2 | 43 / 55.2 |
| c, m ≈ 0.2 | 53 / 72.3 | 54 / 73.5 |
| c, m ≈ 0.5 | 53 / 78.1 | 54 / 79.3 |
| d, m = 1 | 53 / 77.3 | 54 / 78.5 |
| e, after close | 43 / 55.2 | 43 / 55.2 |

| paints | g0.0h | + clock layer |
|---|---|---|
| centre (5.7 MB), over one stepped open (paintCount at d) | **196** | **11** (= the veil's and footer's 11: morph-step repaints only) |
| clock wrapper (1.2 MB), same | – | 187 |
| per 0.45 s at m = 1 (null-step control) | centre +22 | wrapper +34 (another phase of the tick; centre 0) |
| backing re-displayed over one open (paints × MB) | ~1117 MB | ~287 MB (**−74 %**) |
| layers created / destroyed per open + close | 10 / 10 (panel set) | 11 / 11 (panel set + wrapper) |

- Closed (b, e) is unchanged: no wrapper layer, 43 layers / 55.2 MB in both arms.
- Open costs +1 layer, +1.2 MB.
- An earlier unscoped build (CSS 28badb9b5a98, `morph-c-unscoped28badb.json`) gave the same WebKit counts. In state a it
  showed +4 hero accent frame layers, from the accent rotator's timer phase (known A/A noise, F-336), not this change.

### Pixel gates (T2, PR-010 wide: flat ≤ 64, edge ≤ 128, ≤ 0.5 %, clusters ≤ 2000 CSS px²)

Probe `gates/seek.mjs` is fix-g0-box's seek harness, unchanged apart from out/ paths. It uses a virtual clock, Date.now
frozen at a future instant, and one uncaptured warm-up open (F-338). There are four loads, A V A2 V2, with open and
close tweens captured at fixed times. Scorer `gates/t2.mjs`. A = g0.0h, V = g0.0h + clock layer.

| engine | stops | result | worst consistent difference |
|---|---|---|---|
| Chrome 430x932 DPR 3 (`out/menu-layers/seek-chrome-2`) | 22 | **T2 PASS**, 0 fails | edge 59 at open@440, 29 CSS px² at the photo columns' right edge (x 416-432): load phase, the rules don't match in Chrome |
| iOS Simulator (`out/menu-layers/seek-sim-1`, --top 56) | 14 | **T2 PASS**, 0 fails | glyph edges of the countdown labels/digits at open@440 (37 levels, 28 CSS px²) and open@560 (76 levels, 80 CSS px², 0.02 %); **0 at open@700 (m = 1) and at every close stop** |

- In WebKit the mid-tween difference is antialiasing of the clock text while the panel is still scaled (0.96 + 0.04 m)
  and fading in. The wrapper's own backing is drawn at a different subpixel phase than the centre's (OBSERVED, in our
  setup).
- At rest (m = 1) the frame is identical. This is a T2 look-alike, as the user allowed ("illusion optical is
  acceptable", T-253 #10), not pixel-identical.

## Phone card (draft for the lead's signature; written before any phone data)

| item | value |
|---|---|
| ticket | P-1xx (the lead assigns and signs) |
| question | Does g0.0h + clock layer open and close the end-of-page menu no worse than g0.0h under the G gesture on the phone? A no-worse check under the less-work rule, not a "smoother" claim. |
| arms + pins | C = g0.0h, JS 9162843e750f / CSS 26d28a0a263b (`fixes/g0-0h`, 55f5cacd). V = g0.0h + clock layer, JS 9162843e750f / CSS adb875d94c1f (this patch). |
| snapshot + HASHES | `out/menu-layers/snap1` (C from `fix.mjs apply g0-0h --reset`, V from this overlay; read-only), HASHES.txt **85be2a1a2113**, checked by the kit before every start and every hold |
| kit | `fixes/menu-layers/phone/ml-{run,block,hold,serve}.sh` + `ml-k.env` (empty: no K arm). These are fix-g0-box's eop kit (main 55f5cacd) made by text substitution only: logs `out/mlp`, labels `ml-`, owner fix-menu-layers, these pins. Its P-161..P-164 lessons are unchanged (tool-serious via `iphone.mjs rearm`, Safari parked before the rearm, `thermal.mjs clear` after the hold, the unlock step, `--block`, link-loss pause). Gates `fixes/g0-box/phone/p129-gates-g0.mjs` (FS_HASH 38d7fe5d7fa8 = the program: the P-164 G6 lesson). **Dry run 2026-10-08 18:59Z** (`out/menu-layers/kitdry1.log`): 3 of 3 servers served the pinned hashes (B 4606120cf392/27776f3d4138, C, V), H1-H4 and H11 DRY ok, programs fs 38d7fe5d7fa8 (budget 229 s) and pr 7ff27a2413c8 ok, exit 0. |
| driver, profile, order | G `fixes/g0-box/phone/g-fastshort-g0.json`, compiled program 38d7fe5d7fa8 (P-164's: 13 opens and 12 closes per run on g0 builds). Timeline on in every counted run. Profile tool-serious (`CM_THERMAL=serious`, `CM_COOL=0`). Order (short: n = 3 per arm): `H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:TAIL` (warm-ups, C V V C C V, then the re-runs if any and the end sentinel S1). About 45-50 min (P-164: ~68 min for n = 4). |
| command | `sh fixes/menu-layers/phone/ml-run.sh P-1xx H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:TAIL` as a Bash background job (timeout 7200000 ms), only after the lead's GO. It starts the servers, runs the block under `lock.mjs run iphone --owner fix-menu-layers --block P-1xx --max-seconds 3600 --keep 120`, then `thermal.mjs clear`, then stops the servers. |
| metrics and decision | P-164's rules, unchanged (`node fixes/g0-box/phone/g0b-read.mjs out/mlp/runs --runs EC1,EC2,EC3,EV1,EV2,EV3`). **D1**: median V O1.f2 − median C O1.f2 ≤ +4 ms. **D2**: median over runs of the per-run median dt of all later open-tween frames (700 ms windows), V − C ≤ +4 ms. **D3**: share of those frames over T, T ∈ {34, 30, 38}, V ≤ C. PASS / FAIL / OPEN as in P-164. Each run's open and close trigger counts must match between the arms (13/12). |
| descriptive (no verdict) | close-tween median dt and share > 34 (twins); per-run finger-down frames > 50 and > 34 with twins. |
| sentinel | S1 (end, uncounted Timeline-off run on C, p129 gates: moving fps ≥ 50, slow share ≤ 6 %); a failing S1 voids every counted run. |

**Prediction (frozen with this commit, before any phone data).**
- The saving is render-side: per roll frame a 1.2 MB backing is re-displayed instead of a 5.7 MB one. P-164 measured
  17 ms medians in both arms for the same program, and Simulator paint counts have not predicted phone frame time
  well before (M6). So the expected result is "no difference in rAF dt", not a gain.
- **D1: PASS, about 70 %.** The risk is the wrapper layer's creation in the first open frame (+1 layer, +1.2 MB
  allocation at the scene flip, the same frame in which the panel's 10 layers appear).
- **D2: PASS, about 80 %.**
- **D3: PASS, about 75 %.**
- **Overall: PASS, about 60 %.** OPEN (threshold-sensitive) is the most likely other outcome.

**Decisions (proposed; the lead's to set):**
- **PASS:** g0.0h + clock layer becomes the next best-build candidate (g0.0i); the lead lands it.
- **FAIL by D1 alone, D2 and D3 passing:** the lead decides (the T-228 #30 precedent).
- **FAIL on D2 or D3:** g0.0h stays best; the clock layer stays a research result.
- **OPEN:** at most one more block (sequential rule); the lead decides.

## Risks, conflicts, follow-ups

- The look is T2, not pixel-identical, mid-open in WebKit (above). At rest it is identical.
- One extra layer (1.2 MB) exists only while the menu is open.
- The `will-change` flip happens at the scene change, together with the panel's other scene flips. Its cost in the open's
  first frame is the D1 question.
- Overlap: CSS-only, appended at the end of the CSS file. fix-g0-box and fix-scrollcb-g0 edit the JS (drag-down); no
  shared lines.
- Not done: desktop-width pixel check (WebKit desktop Safari also sets `fw-bx`); a phone Timeline read of the paint/composite
  time per roll frame (the decisive check for the UNRESOLVED Core Animation term above).

## Files

- `patch.diff`: the two CSS rules, stacked on g0-0h.
- `results.json`: the census and pixel-gate numbers above.
- `gates/arms.mjs`, `gates/morph-sim.mjs`, `gates/morph-read.mjs`: de-offscreen's census probe with this topic's arms.
- `gates/seek.mjs`, `gates/t2.mjs`: fix-g0-box's seek harness and T2 scorer, with out/ paths changed.
- `phone/ml-*.sh`, `phone/ml-k.env`: the phone kit (copy of the eop kit, pins above).
