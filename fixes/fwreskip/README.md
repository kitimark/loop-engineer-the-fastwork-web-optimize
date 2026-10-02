# Fix: fwreskip (scroll-engine /10f: re-skip #people together with the hero)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** variant (a), rev 2, after review NEEDS-WORK. The functional and pixel checks ran in both engines (below). **Two items are open for the user, not waived:**
- **(i) Chrome first-jump frame.** P's first frame after the first jump of a load differs from B by 182-603 px, max channel delta 4, in rounded corners (row 5f).
- **(ii) Up-pass Layout count on a reversal (Sim).** P 10 vs B 8 vs A/A 10, n=3 per arm (row 3r).

Condition 5 (no skipped section on screen) is met in every run where the baseline meets it. No timing A/B: timing is deferred by the user's direction. Simulator Timeline ms are attribution only, never a gain.

**Stage:** D signed by the lead on 2026-10-02 (option a1h). Variant (a) is the lead's NEEDS-WORK decision B1. F/V are in this README.

**Device class / gate:** WebKit-only cost (Simulator Timeline). Chrome is used for geometry, pixel parity, timing order and invariants.

**Driver(s):**
- Sim W-style scripted steps (scrollBy 250 px smooth every 300 ms) and `scrollBy(-1600, smooth)`, a stand-in for a fling.
- Chrome W steps and `Input.synthesizeScrollGesture` (touch, fling allowed).
- Instant jumps (`scrollTo`) in both engines.
- No G/F (finger) driver.

**Topic:** hero-end lag at the y≈2990 step (lead's scope: hero and page end only).

**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` only, on top of the RB build. Line numbers are in the patched file:
- `iE` 2671-2687: sync partner check;
- `sE` 2749-2756: clear `fwWith`, un-skip partners;
- `fwReskipOne` / `fwNextSection` / `fwReskip` 2826-2873, replacing RB's `fwReskip` at 2814-2823.
- `cE` is unchanged from RB. Rev 1's guard was removed with the lead's approval, see "Rev 2 changes".

**Stacking.** `patch.diff` is stacked on the RB JS (`base-sha256 dbd5fdb4…`; the CSS is untouched).
- Rebuild: `node tools/fix.mjs apply fwreskip --on rb`, with `fixes/rb/overlay` = the RB JS + CSS. That is fix-scene-scope's `snap3/rb` build (JS = user-bplus `dbd5fdb4f1fb`, CSS = scene-scope R4b `0d7dfc79e703`, P-052).
- Patched JS sha256: `96b876639c84…`. Rev 1 was `446f7c864018…`; the interim guard build was `ada1e49433d5…`.

## Why it lags (cause)

Going down past the hero end (Sim 430x775, iPhone 15 Pro Max runtime, iOS 26.5), two style changes each cost one Layout of about 20 ms. **OBSERVED** in our setup:
- y≈2988: the hero's far re-skip (`fwReskip` from `fwFar`, scroll-engine /10c) flips `.hero-track` to `content-visibility: auto`.
- y≈3047: the platform card's `data-fw-wc` flips its will-change.

The ~20 ms is a relayout of the whole profile deck in `#people`. `#people` is still rendered there: its own far edge (bottom < -1.75 vh) comes only at y≈3539.

Evidence (Sim, functional shared lane, forced-flip harness `tools/cure.mjs`, r3-r12):
- **Cost is the deck.** Hiding `#profile-showcase` (inside `#people`) or the deck drops the hero flip from 18-21 ms to 1-2 ms (r3, r4, r11). The cost is spread over the rendered deck content and adds up: non-active shells ~9-10, active shell ~9-11, active shell hero part ~1 (r11). It is a full relayout of the deck, not one box.
- **Deferring `#people` cures it.** `content-visibility` deferral with its correct intrinsic size makes both flips 2 ms (r11 X1: 18,19 → 2,1). Geometry stays identical: `#people` height 1327, next sibling top -1592, scrollY 3000. Locking the height alone changes nothing (r11 X2: 19 → 18).
- **`#people`'s own flip is cheap.** It costs 2,1 ms at y3000 (r12 Y1).
- **Sample stack (r3).** `RenderView > 7 flow > flex > flow > flex×4 > flow → simplifiedLayout → layoutOutOfFlowBox` → a full `layoutBlockChildren` with a flex relayout inside.

**D card, the "how": UNRESOLVED.** How a flip next to the deck reaches the deck is not known.

The decisive local check is the r11 X1/X2 ablation, run as a decoupled forced-flip run (`tools/cure.mjs`). It flips the hero's containment at a fixed scroll position, without scrolling, with `#people` deferred vs rendered vs height-locked:
- X1, deferred: 2 ms.
- X2, height-locked: 18 ms.
- Rendered: 19 ms.

So the cost follows "the deck is rendered", not the scroll position or the deck's height. The crossing axis is the hero's far edge (fwFar, 175 %), Sim y≈2988 / Chrome y≈3659. That is where the flip happens in a scroll. It is 0.7 vh before `#people`'s own far edge (Sim ≈3539 / Chrome ≈3892).

The engine path is not confirmed. The references are silent on this exact path. Candidate source (WebKit main, read 2026-10-02 on github.com/WebKit/WebKit; line numbers are from that read and move; not tied to the Sim's build):
- `RenderBoxModelObject::removeOutOfFlowBoxesIfNeededOnStyleChange` (Source/WebCore/rendering/RenderBoxModelObject.cpp l.921-956).
- `RenderBlock::removeOutOfFlowBoxes` (RenderBlock.cpp l.1845).
- The percent-height descendant dirtying in `RenderBlockFlow` (`dirtyForLayoutFromPercentageHeightDescendants`, RenderBlockFlow.cpp l.587/637/799-860).

A WebKit build with logging on those paths would settle it. It was not run.

### Withdrawn: the r6-r9 "re-create cures" (probe artifact)

r6-r9 reported a "persistent stale state" that re-creating the deck, the shells or the sticky wrapper cured for good. **WITHDRAWN**: it was a probe artifact.

r10 snapshot-diffed every element in `#people` around each action (`tools/cure.mjs`, `D:<action>` wrapper). Only the curing actions show `#people` changing from `content-visibility: visible` to `auto`, with height 1326.73 → 775:
1. Re-creating the subtree shrank `#people` for two frames.
2. That pushed its bottom past `fwFar`'s 175 % edge.
3. So /10c's far re-skip deferred `#people`.

That is the same state as the real cure above. mgmt-ops recorded the withdrawal in `135fa66`.

## What changed (variant (a))

`fwReskip` (called by `fwFar` when a section passes its far edge above the viewport) re-skips **`#people` together with the hero track**. `#people` is the next `deferRendering` section in document order. It is re-skipped only when it:
- is inactive (scene gate closed);
- is not already deferred;
- is wholly above the viewport.

It goes back to `content-visibility: auto` in the same style change as the hero, with its current height as the intrinsic size. **Only the hero track pairs.** It is the one pair that fires at 430 px; the other pairs (`#people` → `.pain` …) were untested and are not enabled.

The partner is tied to the hero by `fwWith`. The state machine for `#people` (P), with its owners:

| state of `#people` | how it gets there | `fwWith` | comes back (un-skip) by |
|---|---|---|---|
| rendered, untied | load; any un-skip below | `null` | n/a |
| **deferred with the hero** (between the hero's far edge ≈2988 and its own ≈3539, Sim) | `fwReskip(hero)` → `fwReskipOne(#people)` | `= hero` | (1) its scene gate opens: `cE` → `sE(#people, true)`, as in RB; (2) the hero un-skips: `sE(hero, true)` un-skips every section with `fwWith === hero`; (3) **sync path**: `iE` (the scroll listener's rAF) finds it within 0.5 vh of the viewport → `sE(#people, true)` in the scroll event's own frame |
| deferred on its own (past its own far edge) | `fwFar` → `fwReskip(#people)` sees it already deferred | **cleared to `null`** | as in RB: its own `fwRender` IO / scene gate. No sync path, so jumps behave like the baseline |

`sE(e, true)` always clears `e.fwWith`. Every un-skip ends the tie.

### Three design choices (approved by the lead), with their numbers (OBSERVED)

1. **iE rAF timing.** The partner check runs at the top of `iE`. `iE` is the rAF that `rE` (the scroll/resize listener) requests. The check runs in the scroll event's own rendering update, before style and layout:
   - Chrome c5 P example: scroll event 15750.5 ms, write 15750.9 inside the frame that began 15749.8, first paint 15763.4.
   - Same in every P jump (c5-c7: 3700/3800 starts, n=8 per start).
   - Sim v8/v9: every P J1 run wrote in the scroll frame.

   Spec ordering, **CONFIRMED**: HTML "update the rendering" runs "the scroll steps" (which fire `scroll`) before "run the animation frame callbacks", and both before "Recalculate styles and update layout" (html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering, read 2026-10-02). So a rAF requested from a scroll handler runs in the same update, before style.
2. **The 0.5 vh margin.** At the moment of pairing, `#people` is 1.04 vh above the viewport (Sim) / 1.5 vh (Chrome). At the hero's un-skip going up, it is 0.79 vh (Sim) / 1.25 vh (Chrome). These are OBSERVED from our geometry logs. 0.5 vh is below all four, so normal scrolling never takes the sync path: 0 fires in every scroll scenario below. A jump that lands `#people` within 0.5 vh does take it.
3. **`fwWith` cleared at `#people`'s own far edge.** Past it, the baseline has `#people` deferred too. From there it is an ordinary re-skipped section, and jumps from below it behave exactly like the baseline (cold deck, row 5c).

Rect reads: the partner's rect is read before any write in `fwReskip`. **OBSERVED** (Sim v5 initiators): no Layout record has this read as its initiator. In v7 down2, the one Layout at the pair re-skip (19.7 @3030) was forced afterwards by the page's own scroll component (`getBoundingClientRect` at l:11599, the hero-track and `g` rect read that toggles `.pain is-pain-dark`), not by this read.

### Rev 2 changes (from rev 1, 5204f41)

- **Sync partner un-skip in `iE` (B1).** It replaces rev 1's open "rAF form" item. The hero's own behaviour is untouched: the check only looks at sections with `fwWith` set, i.e. `#people`.
- **Hero-only pairing.** Rev 1 paired every adjacent section.
- **`cE` guard removed** (lead-approved). Rev 1 kept `#people`'s scene gate from un-skipping it while the hero was deferred. In B2 v6 (Sim, guard build) this cost two extra Layouts going up (19.2 @2931, 18.5 @2922): `#people` came back late, from `cE`, and then a `setProperty Qi:2859`, both forced by the scroll component's `getBoundingClientRect` at l:11601. Without the guard, `#people`'s un-skip joins the fwWC Layout at ≈2950 (row 3r).
- **`fwWith` lifecycle** as in the table above.

## Verification

Every check ran in the functional shared lane, with one queue entry per hold and the Chrome check nested in the Sim hold. Arms:
- B = RB (`--overlay fixes/rb/overlay`);
- P = fwreskip on RB (`--overlay fixes/fwreskip/overlay,fixes/rb/overlay`);
- A = RB again, for the A/A floor.

Each arm was served by its own `serve.mjs --port 0` with `--vendors=local --latency 150`. Served hashes were checked by curl in every hold (B/A JS `dbd5fdb4f1fb`, P `96b876639c84`, CSS `0d7dfc79e703`), and each Sim arm's server log shows Safari's own GETs (I-052).

Probes, committed under `fixes/fwreskip/tools/` (no Fastwork code):
- `vfix.mjs` (Sim) and `cfix.mjs` (Chrome headless 430x932 DPR 3, touch);
- `inv.js`: per-rAF invariant log, stack-tagged writes, `__idle` counters;
- `boot.js`: bootstrap counters;
- `tlinit.mjs`: Layout initiators;
- `vscore.py` / `vcross.py`: stamp-aligned frame compare;
- `pxcmp.py`, `vidan.py`, `calan.py`;
- `cdbg.mjs`, `cure.mjs`, `simtab.mjs`;
- hold scripts `vhold.sh` / `vinner.sh` / `chold.sh`.

Holds v6-v13 and c5-c12 are on the rev 2 build (`96b876639c84`), except v6, which ran the guard build.

**Invariant** (lead, design choice 2): FAIL = `#people` or the hero intersects the viewport **and** `checkVisibility({contentVisibilityAuto: true})` is false. It is logged per rAF in both engines, before and after `iE` (a second rAF reader registered from a scroll listener after the page's).
- WebKit honours the option: self-test `skippedChildCvAuto` false, plain true.
- "sync" = the number of times the `iE` path un-skipped something.

| # | check | B (RB) | P (fwreskip) | A (A/A) | verdict |
|---|---|---|---|---|---|
| 1 | geometry at y2990 / 3047 / 3539 and the deck after scrolling back up (Sim v13, rev 2; v2 rev 1 the same) | `#people` 1326.73 / top 855.98 / next 1407.72 / doc 6035 at every stop | identical at every stop (`#people` deferred at 2990/3047, B active) | identical | **pass** |
| 1c | same in Chrome (c12, rev 2; c1 rev 1 the same), stops 2990 / 3047 / 3539 / 3800 + deck | 1327.88 / 933 / 1328.88 / 6277 | identical (`#people` deferred at 3539/3800, B active) | identical | **pass** |
| 2 | held screenshots, animations finished/paused, countdown digits and avatar carousel hidden: Sim v13 y2990 / 3047 / deck (web content box from a magenta calibration shot); Chrome c12 y2990 / 3047 / 3300 / 3539 / 3800 / deck (rev 2; v2/c1 on rev 1 the same) | | B vs P: Sim 3/3, Chrome 6/6 IDENTICAL | B vs A: Sim 3/3, Chrome 6/6 IDENTICAL | **pass** (byte-identical) |
| 3 | Sim W down 0→3100, up →2500, down again (B2 v7, n=1 per arm; ms are attribution only) | down: 18.8+17.5 @3003 (hero re-skip + fwWC wc=1) | down: **nothing ≥ 3 ms at the re-skip or the fwWC flip** | down: 19.6+18.7 @2998 | **pass** going down |
| 3d | down Layouts in [2900, 3100] at the hero end, v7 + v11 (n=3 per arm) | 2, 2, 2: hero re-skip (`setProperty<fwReskip:2822`) and fwWC wc=1 (`setAttribute<:2709`), every run | 0, 0, 0 from the re-skip or fwWC (P2 had 2 Layouts at 2946/2968 from countdown DOM updates, `before<mi:2188` / `remove<lr:1662`, plus `#people` scene=paused) | 2, 2, 3 (A2 +1 from countdown DOM updates, 2941) | **pass**: both hero-end Layouts gone in every P run |
| 3r | **up-pass** 3100→2500, Layouts ≥ 3 ms in [2400, 3100] (v7 + v11, run order B P A \| B P A A P B) | **2, 3, 3 = 8** | **3, 4, 3 = 10** | **3, 3, 4 = 10** | **open (ii)**: P is +2 over B and equal to A/A in this sample; see below |
| 3b | flip log, every skip/un-skip of hero / `#people` with y (MutationObserver) | down: hero deferred @2995-3003; up: `#people` scene=active (rendered all along), hero active @2775-2788 | down: hero + `#people` deferred @2988-3007; up: **`#people` active exactly once** @2944-2954; hero active @2776-2792; down2: both deferred @2989 | as B | **pass**: no cycling, one `#people` un-skip per reversal |
| 4 | `npm run test:unit` | | | | **pass** |
| 5j | jumps J1 → `#people` top: Chrome from 3700 / 3800 (c5, c6, c7; n=8 per start per arm, alternating arm order), Sim from 3100 / 3450 (v8 B P A, v9 A P B; n=6 per start per arm) | FAIL 0, sync 0; hero placeholder 1 frame (heroPH 1) in every run | **FAIL 0**; sync fired once per jump, in the scroll event's frame; heroPH 1 (as B) | FAIL 0, sync 0, heroPH 1 | **pass** |
| 5c | cold deck, Chrome J1 from 4500 (past `#people`'s own far edge; c8, n=3 per arm). This is the positive control | FAIL 1 in every run (`#people` deferred and on screen in the first frame) | FAIL 1, **sync 0** (`fwWith` already cleared) | FAIL 1 | **pass** (baseline behaviour, identical) |
| 5n | negative control J1 from 3100 (hero not yet re-skipped), Chrome c9 | FAIL 0, sync 0, writes 0 | same | same | **pass** |
| 5f | Chrome post-jump frames f1-f3 vs B, stamp-aligned (c5-c7) | | **f1 of r1 (first jump after a load): 182, 182, 603, 182 px, max Δ4, rounded corners**, 4 of 4 r1 runs; r2 and later: no Δ4 | f1: 1-827 px of Δ1 shimmer; **never Δ4** | **open (i)**, see below |
| 5s | settled final shots after each jump | B vs P ≈8,000-10,000 px Δ11 in many runs | | B vs A same order (≈8-10 k px Δ11) | noise floor; **not identical in either pair** |
| 6 | deck swipe after scrolling back up (Sim v13, Chrome c12; rev 2) | active shell 0→1, 1 active shell, scrollLeft 0→390 (Sim) / 0→392 (Chrome) | same | same | **pass** |
| 7 | invariant scenarios, Chrome c9 + c11 (XB=3771): W up 3771→3200; touch fling up 1600 px; J3 end→0; J4 end→`#people`; J4w (end reached by W steps); reload at 3771, then W up | FAIL 0 except J4/J4w (FAIL 1, positive control); sync 0 | FAIL 0 except J4w (FAIL 1, as B); **sync 0 in every scenario** | as B | **pass** |
| 7s | same on Sim v10: W up 3100→2500; smooth `scrollBy(-1600)` from 3100; J3; J4 | FAIL 0 except J4 (FAIL 1); sync 0; heroPH 1 on J3/J4 | identical counts; sync 0 | | **pass** |
| 8 | idle, 10 s per spot (Chrome c10: bootstrap counters + MutationObserver; Sim v12: Timeline record counts + MutationObserver) | see "Idle" | | | **pass**: no new idle work |

### Open item (i): the first-jump frame in Chrome

On the first jump after a load, P's first painted frame differs from B's by 182-603 px with max channel delta 4, in the deck's rounded corners. This happened in 4 of 4 r1 runs (c5 3700 / 3800, c6 3700, c7 3800). It never happens on r2 or later. A/A never shows Δ4. Cross-checks (`tools/vcross.py`):
- B cold-deck r1 frame 2 (c8, J1 from 4500, where `#people` is skipped in B too) vs B warm r1 f1: 604 px Δ4 (c6) and 183 px Δ4 (c7), the same corner region.
- B cold-deck r1 frame 2 vs **P warm r1 f1: 1 px Δ1** (c6 and c7).
- B cold-deck r1 frame 2 vs A cold-deck r1: 0 px.
- P c6 r1 f1 vs P c7 r1 f1: 0 px.
- B r1 vs B r2 f1 within B: 74,871 px Δ36.

So P's r1 f1 is the frame B itself paints whenever the deck rasters fresh after a load (a cold deck). The corner pattern is a raster-timing effect that B has too. **OBSERVED, cause unknown.**

It is still a difference from B in the same scenario: r1 only, 182-603 px, max Δ4. The user's bar is byte-identical, so the lead puts it to the user. It is not waived here.

### Open item (ii): the up-pass Layout count on a reversal (Sim, attribution only)

Event Layouts on the up-pass, with initiators (`tools/tlinit.mjs`):

| run | fwWC wc=0 (≈2950-2990) | `#people` un-skip | hero un-skip (≈2775-2792) | `#platform` scene paused (≈2600) | Layouts with no initiator |
|---|---|---|---|---|---|
| B v7 | 19.2 @2987 | n/a (rendered all along) | 20.1 @2775 | below 2500 | none |
| B1 v11 | 25.2 @2980 | n/a | 23.0 @2788 | 18.7 @2597 | none |
| B2 v11 | 26.0 @2982 | n/a | 24.1 @2783 | 23.8 @2600 | none |
| P v7 | 20.0 @2954, **same Layout** as `#people` scene+render=active (`cE:2775`) | in the fwWC Layout | 20.9 @2778 | below 2500 | **20.0 @2927** |
| P1 v11 | 28.4 @2951, same Layout as `#people` active | in the fwWC Layout | 22.5 @2776 | 24.5 @2585 | **21.0 @2951** (depth 2, same frame) |
| P2 v11 | 25.5 @2950 (`#people` active; fwWC flip in the same frame) | same Layout | 21.1 @2792 | 23.3 @2602 | none |
| A v7 | 25.4 @2978 | n/a | 22.4 @2771 | below 2500 | (22.3 @2918, `cE` `#people` scene active) |
| A1 v11 | 22.7 @2990 | n/a | 22.7 @2776 | 24.0 @2585 | none |
| A2 v11 | 23.0 @2987 | n/a | 21.8 @2778 | 23.3 @2591 | **18.9 @2718** (depth 2, `IL:loop` only) |

- **The event Layouts are the same in P and B:** fwWC, hero un-skip, `#platform`. P's `#people` un-skip costs no Layout of its own; it shares the fwWC one.
- **The difference is the no-initiator Layouts.** P had one in 2 of 3 runs (20.0 @2927, 21.0 @2951). B had none in 3. A had one in 3 (18.9 @2718). With n=3 that is not separable from A/A, and it is not shown to be zero either.
- It is reported as a possible cost of the fix on reversals: at most one ~20 ms Layout near 2930-2950 going up. Against it, going down, P removes both hero-end Layouts in every run (row 3d: B 2, 2, 2 → P 0, 0, 0).

Per-250 px counts of Layouts ≥ 3 ms (`tools/bins.mjs`). These include unrelated work (countdown DOM updates `before<mi:2188`, `#platform` scene), so only the event rows above are attributable:

| dir | y | B (n=3) | P (n=3) | A (n=3) |
|---|---|---|---|---|
| down | 2500-2750 | 9 | 3 | 5 |
| down | 2750-3000 | 6 | 3 | 5 |
| down | 3000-3250 | 2 | 0 | 2 |
| up | 2500-2750 | 3 | 3 | 4 |
| up | 2750-3000 | 6 | 8 | 7 |
| up | 3000-3250 | 0 | 0 | 0 |

Rev 1 (v5, n=1, down 0→3700 and up →2500) for reference:
- B: down 0 / 4 / 3 / 1 / 0 / 0 in the bins from 2250 to 3750; up 0 / 1 / 3 / 0 / 1 / 0.
- P: down 3 / 1 / 0 / 0 / 0 / 0; up 0 / 1 / 2 / 0 / 1 / 0.

### Idle (10 s per spot)

Chrome c10 (per second; io/ro = observer callbacks, wAttr/wCls/wProp = attribute/class/style writes from bootstrap wrappers):

| spot | B | P |
|---|---|---|
| y0 | raf 33.1, wAttr 16.2, wProp 75.9, io 0, ro 0; mut style 75.9, childList 18.8 | raf 30.0, wAttr 16.0, wProp 67.8, io 0, ro 0; mut style 67.8, childList 18.8 |
| parked 3771 (band; P has `#people` deferred) | raf 19.4, wAttr 4, wCls 0.7, wProp 15.1; mut style 15.1, characterData 12.1 | **identical**: raf 19.4, wAttr 4, wCls 0.7, wProp 15.1; characterData 12.2 |
| parked 3500 after a reversal from 3771 | raf 24.4, wAttr 4, wProp 20; characterData 16.6 | **identical** |
| pin (page end) | raf 0, wAttr 4, wProp 6.6 | **identical** |

Sim v12 (Timeline records per second between two marks; MutationObserver counts):
- The bootstrap script did not survive WebKit's reload (`boot false`). So the per-callback wrappers are missing on Sim, and the Timeline types stand in for them.

| spot | B | P |
|---|---|---|
| y0 | rAF 29.5, Layout 38.7, Paint 48.6, IO cb 2.0, FunctionCall 75.5; mut style 65.8 | rAF 33.0, Layout 39.9, Paint 50.2, IO cb 2.0, FunctionCall 82.4; mut style 74.5 |
| parked 3100 (band) | rAF 21.4, Layout 24.4, Paint 63.8, IO 0.1; mut style 21.5, characterData 13.5 | rAF 24.5, Layout 27.4, Paint 78.5, IO 0.1; mut style 20.2, characterData 16.4 |
| parked 2850 after a reversal (no rAF recorded in either arm) | Layout 22.8, Paint 29.2, IO 1.9; childList 16 | Layout 19.3, Paint 26.1, IO 1.9; childList 16 |
| pin | Paint 236.2, Layout 58.2; mut style 6.6 | Paint 234.8, Layout 58.1; mut style 6.6 |

- At y0 the two builds run the same code. There P is 5-12 % above B, which puts the spread of a single 10 s window at about that size.
- In the band (3100), P's Paint (78.5 vs 63.8) and rAF (24.5 vs 21.4) are higher, by about as much as at y0. n=1, cause unknown. The same spot in Chrome is identical.
- No new observer callbacks or attribute writes appear in P at any spot, in either engine.

### Sim capture calibration

A one-rAF full-viewport magenta flash (~34 ms on screen) was recorded in **2 of 3** Simulator screen recordings. CAL-1 had 0 magenta frames (`tools/calan.py`), and ffmpeg also warned about non-monotonic timestamps. **So Sim recordings are not evidence for single frames.** The Sim frame claims in this README rest on `checkVisibility` per rAF, not on video.

Rev 1's row 5v recording claims are withdrawn as evidence. They include the J1 first-rAF gap of 110 vs 60 ms (n=1), flagged here with no claim.

### What earlier statements became

- Rev 1 line 131, "a deferred section on screen still renders": **REFUTED.** A section that a jump brings on screen while it is skipped stays skipped in that frame. We see it in both engines as heroPH 1 / FAIL 1 in the baseline. The spec agrees: "Proximity determinations other than the initial one take effect at the next rendering opportunity" (HTML, update the rendering, html.spec.whatwg.org/multipage/webappapis.html, read 2026-10-02). That is why variant (a) un-skips `#people` from `iE`, before style, in the scroll event's frame.
- Rev 1 line 133, "not caused by the patch": dropped. The Sim recordings cannot carry that claim (calibration above).
- Rev 1 row 5, "settled shots identical": wrong. The settled shots differ by ≈8-10 k px Δ11 for B vs P and for B vs A alike (row 5s). Rev 1 had no jump A/A; rev 2 has one.

### Pre-existing race (F-119, not changed by this patch)

The scene-gate IO callback (100 %) and `fwFar`'s (175 %) run in either order per load. When `fwFar`'s runs first, `e.active` is still true, and that section's far re-skip is lost until the next crossing. This happens in all arms, e.g.:
- c9 J3/J4: the end was reached by an instant jump with hero and `#people` still active (a/a) in P and A;
- c11 reload: B came back with the hero deferred, P and A did not.

The J4w scenario reaches the end by W steps to avoid it.

### Scenarios not run (B4)

- A timing A/B (deferred by direction).
- Phone runs.
- Finger / G drivers (a touch fling ran in Chrome only, and Sim used a smooth `scrollBy`).
- Toolbar collapse/expand.
- Rubber band at the page end.
- Early input during load.
- Idle after a long scroll session (beyond 10 s per spot).
- Reduced motion.
- Desktop widths.
- Reload while scrolled ran in Chrome only (c11); not on Sim.
- The short reversal is covered by B2 (rows 3, 3r, 3b).

## Risks, conflicts, follow-ups

- **Up-pass Layout (open item ii).** See above.
- **Going up, the fwWC flip at ≈2990 still costs ~20 ms in all arms**, because `#people` is rendered by then. Moving `#people`'s un-skip later is a separate decision.
- **Wider view layouts are out of scope.** Any view-level layout while `#people` is rendered re-lays the deck (B and P alike, 2400-2800). The deck's relayout itself is a separate topic (the UNRESOLVED path above).
- **Memory/layers.** `#people` goes back to `content-visibility: auto` ~0.7 vh earlier going down. This may release its paint and layers earlier. Not measured.
- **Overlap.** Only scroll-engine code (`iE`, `sE`, `fwReskip`). fix-scene-scope was told about `#people`'s callback and its new un-skip path, and replied that no re-run is needed.
- **Protocol v2 follow-ups, not done here:**
  - a phone Timeline segment card (A1/X1);
  - a phone W ABBA block with a post-hoc PREDICTIONS row;
  - G/F drivers for touch, fling and toolbar;
  - bench mech counts (DoD 8);
  - the A9 caveat: the T runs' logger reads only `scrollY` and attributes per rAF (neutral per P-023). The invariant runs (`inv.js`) also read rects and `checkVisibility` per rAF, so they are functional only, never timed.
