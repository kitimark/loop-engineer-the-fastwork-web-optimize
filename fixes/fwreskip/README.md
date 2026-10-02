# Fix: fwreskip (scroll-engine /10f: re-skip neighbours together)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** verified (functional and pixel checks). No timing A/B: timing is deferred by the user's direction.
Simulator Timeline ms below are for attribution only. They are not a gain.
**Stage:** D signed by the lead on 2026-10-02 (option a1h); F/V in this README.
**Device class / gate:** WebKit-only cost (Simulator Timeline). Chrome is used only for geometry and pixel parity.
**Driver(s) behind the claims:** Sim W-style scripted steps (scrollBy 250 px smooth every 300 ms), Sim/Chrome jumps (`scrollTo` instant).
**Topic:** hero-end lag at the y≈2990 step (lead's scope: hero and page end only).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only, on top of the RB build.
- RB = user-bplus JS `dbd5fdb4f1fb` + scene-scope R4b CSS `0d7dfc79e703`, P-052.
- `sE` 2739-2746 and `cE` 2761-2775 (patched lines).
- New `fwReskipOne` / `fwNextSection` / `fwReskip` 2819-2856, replacing `fwReskip` at RB 2814-2823.

**Stacking.** `patch.diff` is stacked on the RB JS (`base-sha256 dbd5fdb4…`; the CSS is untouched).
- Rebuild: `node tools/fix.mjs apply fwreskip --on rb`, with `fixes/rb/overlay` = the RB JS + CSS. That is fix-scene-scope's `snap3/rb` build. Its JS is the user-bplus JS, unchanged.
- Patched JS sha256: `446f7c864018…`.

## Why it lags (cause)

Going down past the hero end (Sim 430x775, iPhone 15 Pro Max runtime, iOS 26.5), two style changes each cost one
Layout of about 20 ms. **OBSERVED** in our setup:
- y≈2988: the hero's far re-skip (`fwReskip` from `fwFar`, scroll-engine /10c) flips `.hero-track` to `content-visibility: auto`.
- y≈3047: the platform card's `data-fw-wc` flips its will-change.

The ~20 ms is a relayout of the whole profile deck in `#people`. `#people` is still rendered there: its own far edge (bottom < -1.75 vh) comes only at y≈3539.

Evidence (Sim, functional shared lane, forced-flip harness `out/fwreskip/wk/cure.mjs`, r3-r12):
- **Cost is the deck.** Hiding `#profile-showcase` (inside `#people`) or the deck drops the hero flip from 18-21 ms to 1-2 ms (r3, r4, r11). The cost is spread over the rendered deck content and adds up: non-active shells ~9-10, active shell ~9-11, active shell hero part ~1 (r11). It is a full relayout of the deck, not one box.
- **Deferring `#people` cures it.** `content-visibility` deferral with its correct intrinsic size makes both flips 2 ms (r11 X1: 18,19 → 2,1). Geometry stays identical: `#people` height 1327, next sibling top -1592, scrollY 3000. Locking the height alone changes nothing (r11 X2: 19 → 18).
- **`#people`'s own flip is cheap.** It costs 2,1 ms at y3000 (r12 Y1).
- **Sample stack (r3).** `RenderView > 7 flow > flex > flow > flex×4 > flow → simplifiedLayout → layoutOutOfFlowBox` → a full `layoutBlockChildren` with a flex relayout inside.

How the flip reaches the deck is **UNRESOLVED**. The references are silent on this exact path. Candidate source (WebKit main, read 2026-10-02 on github.com/WebKit/WebKit; line numbers are from that read and move; not tied to the Sim's build):
- `RenderBoxModelObject::removeOutOfFlowBoxesIfNeededOnStyleChange` (Source/WebCore/rendering/RenderBoxModelObject.cpp l.921-956).
- `RenderBlock::removeOutOfFlowBoxes` (RenderBlock.cpp l.1845).
- The percent-height descendant dirtying in `RenderBlockFlow` (`dirtyForLayoutFromPercentageHeightDescendants`, RenderBlockFlow.cpp l.587/637/799-860).

The decisive local check is a WebKit build with logging on those paths. It was not run.

### Withdrawn: the r6-r9 "re-create cures" (probe artifact)

r6-r9 reported a "persistent stale state" that re-creating the deck, the shells or the sticky wrapper cured for good. **WITHDRAWN**: it was a probe artifact.

r10 snapshot-diffed every element in `#people` around each action (`out/fwreskip/wk/cure.mjs`, `D:<action>` wrapper; result `out/fwreskip/simres/r10-cure.json`, local). Only the curing actions show `#people` changing from `content-visibility: visible` to `auto`, with height 1326.73 → 775:
1. Re-creating the subtree shrank `#people` for two frames.
2. That pushed its bottom past `fwFar`'s 175 % edge.
3. So scroll-engine /10c's far re-skip (`fwFar` → `fwReskip`, RB JS 2814-2845; introduced in commit `f9b450e`, "variant 10c") deferred `#people`.

That is the same state as the real cure above. The non-curing actions (re-create panel, `display:block` toggles) did not shrink `#people` enough.

mgmt-ops recorded the withdrawal in `135fa66`.

## What changed

`fwReskip` (called by `fwFar` when a section passes its far edge above the viewport) now re-skips the **next
`deferRendering` section in document order together with it**. The general rule applies when that section:
- is inactive (scene gate closed);
- is not already deferred;
- is wholly above the viewport.

It goes back to `content-visibility: auto` in the same style change, with its current height as the intrinsic size. The rect is read before any write, so the read finds the layout the IO callback ran after (no forced layout of the flip).

The partner is tied to the upper section (`fwWith`):
- **Un-skip together.** `sE(upper, true)` un-skips the partner with it.
- **No early scene-gate un-skip.** The partner's scene gate does not un-skip it while the upper one is still deferred. This keeps /10c's 0.25 vh hysteresis.
- **Own IO still works.** The partner's own `fwRender` IO (gate + 50 %) still un-skips it, which is how it comes back first when scrolling up from far below.

Sections on this page (Sim, doc order, `[data-start-selling-render]`):
- `.hero-track` 0+1630
- `#people` 856+1327
- `.pain` 1408+2325
- `.commission` 2958+1197
- `#platform` 4155+1880

The rule pairs:
- hero → `#people`;
- `#people` → `.pain`;
- `.pain` → `.commission`;
- `.commission` → `#platform`.

Only a pair whose lower section is inactive and wholly above the viewport is tied. Going down, `#people` goes back with the hero at y≈3023 (Sim) instead of its own edge at ≈3580. In Chrome 430x932 this happens at y3512.

The visual is unchanged; see the pixel checks below.

## Why it helps (mechanism, OBSERVED)

The flips at 2988 and 3047 no longer find a rendered deck next to them. One more `content-visibility` flip at the same moment costs ~2 ms (r12). The ~20 ms Layout at the hero re-skip and the one at the 3047 will-change flip lose their deck relayout. `#people`'s own later re-skip at ≈3539 goes away.

## Verification (lead's conditions 1-6)

Every check ran in the functional shared lane: one queue entry per hold, with the Chrome check nested in the Sim hold. Arms:
- B = RB (`--overlay fixes/rb/overlay`);
- P = fwreskip on RB (`--overlay fixes/fwreskip/overlay,fixes/rb/overlay`);
- A = RB again, for the A/A floor.

Each arm was served by its own `serve.mjs --port 0` (fresh ephemeral port) with `--vendors=local --latency 150`. Served hashes were checked by curl, and every Sim arm's server log shows Safari's own GET of the JS and CSS (I-052; v3/v4 also boot with the emptied cache, 85ad9a0).

Probes:
- `out/fwreskip/wk/vfix.mjs` (Sim);
- `cfix.mjs` (Chrome headless 430x932 DPR 3);
- `cdbg.mjs` (writer stacks);
- `pxcmp.py` (exact RGBA compare; Sim shots cropped to the web content box found by a magenta calibration shot);
- `vidan.py` (Sim screen recording frames).

| # | check | B (RB) | P (fwreskip) | verdict |
|---|---|---|---|---|
| 1 | geometry at y2990 / 3047 / 3539 and the deck after scrolling back up: `#people` height, its top, next sibling top, scrollY, doc height (Sim v2) | 1326.73 / 855.98 / 1407.72 / =y / 6035 at every stop | identical at every stop | **pass** |
| 1c | same in Chrome (c1), stops 2990 / 3047 / 3539 / 3800 / deck | 1327.88 / 933 / 1328.88 / =y / 6277 | identical (A identical too) | **pass** |
| 2 | held screenshots (animations finished or paused at 0, countdown digits and avatar carousel hidden in every arm): Sim y2990, y3047, deck after scroll-up (v2) | B vs A: 3/3 IDENTICAL | B vs P: 3/3 IDENTICAL | **pass** (byte-identical pixels) |
| 2c | Chrome y2990 / 3047 / 3300 / 3539 / 3800 / deck (c1) | B vs A: 5/5 IDENTICAL | B vs P: 6/6 IDENTICAL | **pass** |
| 3 | Sim W down 0→3700, up →2500 (v1; load1 ≈ 88, ms indicative): Layout ≥ 3 ms in 2700-3600 | down: 19.5 @2796, **20.8 @2998** (hero re-skip); up: 26.1 @3335, 23.5 @2984, 23.8 @2771 | down: 18.7 @2900 (before the flip, matches B's 2796); **none at the re-skip (3023) or 3047**; up: 20.0 @3342, 18.8 @2989, 19.4 @2777 (same three as B) | **pass**: nothing ≥ 3 ms at the flips, no new Layout > 10 ms in either direction |
| 3' | repeat with initiator stacks (Timeline depth 5) and MutationObserver stamps (v5; load1 ≈ 6; same driver) | down: **19.4 @2995 from `setProperty<fwReskip:2822`** (hero render=deferred) and **17.4 @2995 from `setAttribute<:2709`** (fwWC, platform card wc=1); 22.3 @3214 (no initiator); up: 20.2 @3341 (`sE` people active), 18.7 @2984 (fwWC wc=0), 19.3 @2970, 18.9 @2780 (hero un-skip with `cE`) | down: **no Layout ≥ 3 ms from 2623 to the bottom turn** (re-skip at 3016, fwWC flip in the same band: both cheap); up: 25.9 @3331 (`sE` people active), 25.0 @2998 (fwWC wc=0), 23.7 @2788 (hero un-skip with `cE`) | **pass**: both flips at the hero end lose their ~20 ms Layout; going up, the same three events in both arms (v4 repeat: same structure) |
| 3b | attribute transitions (v1) | down: hero→def @3060, people→def @3580; up: people→act @3250, hero→act @2717 | down: both→def @3023; up: people→act @3279 (fwRender), hero→act @2735 | **pass**: `#people` is active long before its bottom reaches 0 going up (bottom 0 at y≈2183) |
| 4 | `npm run test:unit` (scope guard + 549 unit tests) | | | **pass** |
| 5 | jumps (v3 Sim, c3/c4 Chrome); after settle, B vs P pixels | J1 3100→#people, J3 end→0, J4 end→#people: settled shots identical to P | identical | **pass** (settle) |
| 5r | rAF-stamped attribute vs visibility (Sim v3) | J1: hero deferred+visible at rAF 0 (people active); J3: hero deferred+visible at rAF 0; J4: hero and people deferred+visible at rAF 0; all active at rAF 1 | J1: hero **and people** deferred+visible at rAF 0, active at rAF 1; J3, J4 as B | **not met as literally asked**, see below |
| 5v | Sim screen recording around each jump (frames vs the settled frame, mean abs diff 0-255) | J1: 3 frames (~100 ms) mostly white, people area blank although `#people` was rendered; J3: 1 white frame; J4: none | J1: 2 frames (~100 ms) show the deck card, heading/tabs area white; J3: 1 white frame (as B); J4: none | P not worse in this sample (n=1 per arm) |
| 6 | deck swipe after scrolling back up: active shell index, active-shell count, scrollLeft (Sim v2, Chrome c1) | 0→1, 1, 0→390 (Sim) / 0→392 (Chrome) | same | **pass** |

The 3b positions are the rAF sample after each IO callback. Steps are 250 px, so the y values are ±100 px.

**Condition 5, rAF form.** The un-skip is IO-driven, so on an instant jump into a section that is re-skipped (`data-start-selling-render="deferred"`), the attribute flips one rAF after the first frame at the new position. This already happens in the baseline wherever /10c re-skipped a section:
- the hero in J1/J3/J4;
- `#people` in J4.

The patch adds `#people` for jumps that start between the hero's far edge (≈2988) and `#people`'s own (≈3539).

A deferred section on screen still renders: the CSS is `content-visibility: auto`, and the deck card is painted in P's first post-jump frame.

The recordings show transient white frames after large jumps in both arms. These include B's J1, where `#people` was fully rendered. So these frames are not caused by the patch. Their cause is **OBSERVED, cause unknown**: tile painting or content-relevancy timing, UNRESOLVED.

A variant that meets the rAF form needs a scroll-event-time proximity un-skip. The scroll steps run before rAF and paint in the same rendering update. That variant also changes the baseline's hero and is not built (proposal to the lead).

**Pre-existing race found on the way (Chrome, cdbg d1, OBSERVED).** The scene-gate IO callback (100 %) and `fwFar`'s (175 %) run in either order per load. When `fwFar`'s runs first in the same frame, `e.active` is still true, and the far re-skip of that section is lost until the next crossing. This happens in both arms:
- d1 B J2: `#people` stayed rendered;
- c2 P J2: same;
- c2 B J3/J4: the page end was reached by an instant jump with hero and `#people` still active.

This is /10c behaviour, not changed by this patch. A fix would re-check in the next rAF, and is not built.

**Scenarios not run:** a timing A/B (deferred by direction); phone runs; finger/G drivers; reduced motion; desktop.

## Risks, conflicts, follow-ups

- **Un-skip cost going up.** Going up from far below, `#people` un-skips by its own fwRender at ≈3250-3346. This is as in the baseline, whose un-skip at that point costs the same Layout (v1: B 26.1 vs P 20.0; v5: B 20.2 vs P 25.9; indicative, one run each). Within the band, `#people` comes back with the hero (one style change).
- **Going up, the fwWC flip at ≈2990 still costs ~20 ms in both arms**, because `#people` is rendered again by then. Moving `#people`'s un-skip later would put it closer to the viewport. That is a separate decision, not part of (a1h).
- **Wider view layouts are out of scope.** Many ~20 ms Layouts at y 2400-2800 and at rest near 2420 in BOTH arms (v1) show that any view-level layout while `#people` is rendered re-lays the deck. This fix only removes the two at the hero end. The deck's relayout itself is a separate topic: the percent-height chain, UNRESOLVED above.
- **Generality.** The rule is generic and touches `.pain`/`.commission`/`#platform` pairs further down. Each pair only fires when the lower section is inactive and wholly above the viewport, and comes back with the upper one or by its own fwRender IO.
- **Overlap.** Only scroll-engine code (`sE`, `cE`, `fwReskip`); no other topic edits these functions.
