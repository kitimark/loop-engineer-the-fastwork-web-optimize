# Fix: menu-layers (T-253 #10, item 2: the menu clock on its own small layer while the menu is open)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** done. Simulator counts; Chrome, iPhone Simulator and iPad desktop pixel gates T2 PASS. Phone: P-170 void (end sentinel, heat); P-170b PASS (n = 2, lead ruling, rules applied by hand). Lands as best build g0.0i (fixes/g0-0i)
**Stage:** F (build card and phone card below; the lead signs the phone card)
**Device class / gate:** render-bound, WebKit only → less-work landing rule (memory "less-work-landing-rule"): Simulator counts per morph state, pixel T2, one short phone no-worse check (G)
**Driver(s) behind the claims:** Simulator census (stepped tween, counts only); seek pixel gates (Chrome headless, iOS Simulator); phone G (P-170 below: counted read PASS, void by S1)
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
  the menu is open. Checked at desktop width on the iPad Simulator (WebKit, desktop-class Safari, 1032 CSS px): T2 PASS
  with 0 consistent pixels at every stop (table below).
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
| iPad Simulator fw-ipad, desktop-class Safari 1032 CSS px, DPR 2 (`out/menu-layers/seek-ipad-2`, --dpr 2 --top 140) | 8 (open/close at 0, 440, 560, 700 ms) | **T2 PASS**, 0 fails | **0 consistent pixels at every stop** (V's panel scene is `active` at open 440-700, so the rule applies) |

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

## Phone block P-170 (the card above, signed by the lead as P-170; run 2026-10-08)

**Result: BLOCK STOP at H9.** The end sentinel S1 failed, so by the card every counted run is void. The counted read
itself is a clean PASS. The lead decides what follows: a second and last block, accept, or drop.

| rule | C (EC1-EC3) | V (EV1-EV3) | V − C | verdict |
|---|---|---|---|---|
| triggers per run (open / close) | 13 / 12 ×3 | 13 / 12 ×3 | equal | ok |
| D1 O1.f2, median (range) | 17 (17-17) ms | 16 (16-17) ms | −1 | within +4 |
| D2 open-tween median dt | 17 (17-17) ms | 17 (17-17) ms | 0 | within +4 |
| D3 open-tween share > 34 / 30 / 38 | 0 / 0 / 0 | 0 / 0 / 0 | – | V ≤ C at all three |
| open-tween frames > 50 | 0 | 0 | – | – |
| close tween median dt (descriptive) | 17 | 17 | 0 | – |
| **S1 sentinel** (C, Timeline off, p129 gates: fps ≥ 50, slow ≤ 6 %) | **49.4 fps, slow 7.5 % → FAIL** | | | voids the block |

Read: `node fixes/g0-box/phone/g0b-read.mjs out/mlp-p170/runs --runs EC1,EC2,EC3,EV1,EV2,EV3` → DECISION PASS
(`out/menu-layers/p170-read.txt`; P-170 logs moved to `out/mlp-p170/` before P-170b; gitignored).

- **Holds.** H1-H8 were all VALID (283-288 s each). Every start gate showed thermal Serious (Xcode-induced), timer 30 ms.
- **Heat.** The battery rose from 36.0 °C (H1) to 43.0 °C (H9 end): H5 40.7, H7 41.7, H8 42.1, H9 42.7. Under
  xcode-serious there is no cooling wait between holds. P-164's S1, on the same program, passed at 54.3 fps. The
  likeliest cause of the S1 miss is heat drift over a ~50 min block (OBSERVED in our setup, from the battery trend
  only; not shown).
- **Prediction vs result.**
  - The counted rules matched the prediction: D1, D2 and D3 passed, and neither arm left the 17 ms median.
  - The prediction did not cover the validity risk that ended the block: heat over a 9-hold block.
- **Three failed starts before this run** (p170-try1..3, `out/menu-layers/`), incident I-254:
  - WDA's terminate timed out;
  - then HTTP 400 `XCTDaemonErrorDomain Code=41` "Not authorized for performing UI testing actions", which persisted
    after the user's C-131;
  - the lead restarted WDA at 19:11:36Z, and try 4 (this block) ran.
- **Simulator window for fix-cm-return (void).** The lead asked for a 6 min window between H6 (EC2) and H7 (EC3).
  - Try 1 stopped the block shell after H6 had already started. Try 2 waited for H6's end and opened the window at
    19:53:38Z with `doing iphone --between 6`.
  - The window stayed shut anyway: the lock counts the iphone hold's run (the whole block shell, stopped with SIGSTOP but
    alive) as a live phone run (`tools/lib/lock.mjs` 1249-1252).
  - The shell was resumed at 19:56:20Z, into H7. The lead opened a tool incident for this.
  - The pause (19:53:38-19:56:20Z) sits between holds. H7 started with its own heat and timer gates, so the counted runs
    are unaffected.

### P-170b card delta (the lead's ruling, 2026-10-08 ~20:15Z: P-170 void; second and last block)

Everything not listed here is unchanged from the card above: arms, pins, snapshot `snap1` HASHES 85be2a1a2113,
program 38d7fe5d7fa8, profile tool-serious, the D1-D3 rules and the gates.

| item | P-170 | P-170b |
|---|---|---|
| order | H1:WC H2:WV H3:EC1 H4:EV1 H5:EV2 H6:EC2 H7:EC3 H8:EV3 H9:TAIL | **H1:WC H2:WV H3:S0 H4:EC1 H5:EV1 H6:EV2 H7:EC2 H8:TAIL** |
| n per arm | 3 (C V V C C V) | **2 (C V V C)** |
| sentinels | S1 at the end | **S0 directly after the warm-ups, plus S1 at the end** (same procedure: C, Timeline off, p129 gates fps ≥ 50, slow ≤ 6 %). A failing S0 stops the block (exit 8). |
| start condition | none (xcode-serious, no cooling) | **battery ≤ 39 °C** (`wait.mjs phone-temp --below 39`) before the start; no cooling between holds (as before) |
| logs | `out/mlp` | `out/mlp` again (P-170's moved to `out/mlp-p170`) |
| kit change | – | `phone/ml-hold.sh` accepts an item `S0`, run and gated exactly like `S1` but written to `g-S0.json`. Nothing else changes. Dry run `out/menu-layers/kitdry2.log`. |
| read | – | `g0b-read.mjs out/mlp/runs --runs EC1,EC2,EV1,EV2` |

**Outcomes (the lead's):**
- S0 and S1 both pass, and the read is PASS: c8f69bb1 and its follow-up land as the g0.0i candidate, together with the
  iPad look check.
- A sentinel fails again: the topic lands on the less-work rule with the Simulator counts and P-170's descriptive read.
  The phone no-worse check is then recorded as not achieved.
- The read is FAIL with both sentinels passing: the card's decisions above apply.

### P-170b result (run 2026-10-08 22:00-22:50Z)

**Verdict: PASS (n = 2, lead ruling 2026-10-08 ~23:00Z; the reader's n ≥ 3 floor is not met, so the rules were applied
by hand).**
- Both sentinels passed, all 8 holds were VALID, and C and V are equal on every rule.
- `g0b-read` itself prints DECISION OPEN, because it decides only with ≥ 3 runs per arm (`g0b-read.mjs` 49, 51, 55).
- The lead's signed delta allowed n = 2, so D1-D3 were applied by hand to the pre-set rules: every diff is 0, and no
  frame is over 50 ms.

| rule | C (EC1, EC2) | V (EV1, EV2) | V − C | by the rule (applied by hand to n = 2) | reader |
|---|---|---|---|---|---|
| triggers per run (open / close) | 13 / 12 ×2 | 13 / 12 ×2 | equal | ok | ok |
| D1 O1.f2, median (range) | 16.5 (16-17) ms | 16.5 (16-17) ms | 0 | within +4 | INSUFFICIENT |
| D2 open-tween median dt | 17 (17-17) ms | 17 (17-17) ms | 0 | within +4 | INSUFFICIENT |
| D3 open-tween share > 34 / 30 / 38 | 0 / 0.00095 / 0 | 0 / 0.00095 / 0 | equal | V ≤ C at all three | open |
| open-tween frames > 50 | 0 | 0 | – | – | – |
| close tween median dt (descriptive) | 17 | 17 | 0 | – | – |
| **S0** (after the warm-ups) | 54.4 fps, slow 3.7 % → **PASS** | | | | |
| **S1** (end) | 54.0 fps, slow 4.4 % → **PASS** | | | | |

- The > 30 ms share is one frame of 515 in EC2 and one in EV1.
- **Heat.** The battery rose from 33.5 °C at H1's start to 41.9 °C at H8's end (Xcode-induced Serious throughout, no
  cooling between holds). S1 passed at 41.6-41.9 °C; P-170's S1 had failed at 42.7-43.0 °C.
- **Start.** The block was due to start on fix-cm-return's "proposal posted" or at 22:00Z, whichever came first. The
  22:00Z deadline fired at 21:59:59Z; cm-return's message arrived about 4 s later.
- **Cleanup.** The launcher shell hit Claude Code's 30 min background limit and was killed right after H8 had finished
  (VALID). No run was lost. Safari was parked, the tool-held thermal condition cleared and the servers stopped by hand.
- Read: `node fixes/g0-box/phone/g0b-read.mjs out/mlp/runs --runs EC1,EC2,EV1,EV2` (`out/menu-layers/p170b-read.txt`,
  gitignored).

### Lessons from P-170 / P-170b

1. **Check the reader's minimum n before cutting a block's n.** The P-170b delta set n = 2 per arm to keep the block
   short. `g0b-read` decides only from n = 3 (D1, D2 INSUFFICIENT; D3 open), and neither the delta nor the dry run
   caught that. A delta that changes n should run the reader on the dry-run's planned run names, or say up front that
   the rules will be applied by hand.
2. **Give every phone-block launcher an explicit Bash `timeout` (7200000 ms).** Claude Code's default background
   limit (30 min) killed the P-170b wrapper right after its last hold. The same thing hit P-159 (incident I-240). This
   time it cost no run, but the exit trap (park Safari, `thermal.mjs clear`, stop the servers) did not run and was done
   by hand. Reported as I-256, a duplicate of I-240.
3. **Heat over a long block decides the end sentinel.** P-170's 9 holds ran the battery from 36.1 to 43.0 °C, and S1
   failed at 49.4 fps. P-170b's 8 holds started at 33.5 °C, ended at 41.9 °C, and both sentinels passed (54.4 / 54.0 fps).
   A start sentinel (S0) right after the warm-ups shows the heat baseline before any counted run.
4. **SIGSTOP on the block shell does not open an I-160 Simulator window.** The lock counts the iphone hold's run (the
   whole block shell, stopped but alive) as a live phone run (`tools/lib/lock.mjs` 1249-1252). The lead opened a tool
   incident for it.

## Risks, conflicts, follow-ups

- The look is T2, not pixel-identical, mid-open in WebKit (above). At rest it is identical.
- One extra layer (1.2 MB) exists only while the menu is open.
- The `will-change` flip happens at the scene change, together with the panel's other scene flips. Its cost in the open's
  first frame is the D1 question.
- Overlap: CSS-only, appended at the end of the CSS file. fix-g0-box and fix-scrollcb-g0 edit the JS (drag-down); no
  shared lines.
- Desktop-width WebKit look: done on the iPad Simulator (T2 PASS, 0 consistent pixels). The first two tries produced no
  screenshots: my probe copy `gates/seek.mjs` read fw-sim's device id inside an iPad session. It now calls
  `useDevice(FW_SIM_DEVICE)`. The shared tool is fine.
- Not done: a phone Timeline read of the paint/composite time per roll frame (the decisive check for the UNRESOLVED Core
  Animation term above).

## Files

- `patch.diff`: the two CSS rules, stacked on g0-0h.
- `results.json`: the census and pixel-gate numbers above.
- `gates/arms.mjs`, `gates/morph-sim.mjs`, `gates/morph-read.mjs`: de-offscreen's census probe with this topic's arms.
- `gates/seek.mjs`, `gates/t2.mjs`: fix-g0-box's seek harness and T2 scorer, with out/ paths changed.
- `phone/ml-*.sh`, `phone/ml-k.env`: the phone kit (copy of the eop kit, pins above).
