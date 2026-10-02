# Fix: fwreskip (scroll-engine /10f: re-skip #people together with the hero)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status (rev 3, P2):** the lead approved P2 after G1 block 1 (P's longest fling frame sat on the `#people` un-skip, 65-92 ms, vs B ≤ 50 at that point; no placeholder FAIL). P2 = rev 2.1 plus an idle un-skip of the paired `#people` after 300 ms with no scroll event (section "P2"). Its Chrome invariants, geometry, pixels (byte-identical), and Sim T with and without a pause in the band pass. Sim idle is **UNRESOLVED**: P2 was above its same-hold control in Composite at the reversal spot in 3 of 3 holds (review-fwreskip-3 #3). But in one hold with B, A and P2b (v27), same-build B vs A differs as much, and the census finds no P2-specific animation or layer state (rows R4, R5). review-fwreskip-3: PASS-WITH-FIXES; the fixes are in (P2b = P2 plus teardown, JS `b4ff6ec56cc2`; ticket G1b rev 2 with the tightened decision rule, no recordings per user T-018, flinglog v3). **Next:** phone ticket G1b (prediction P-060, amended before data for P2b), after PR-001 block B and the PR-003 A block. Everything below about rev 2.1 still describes P2 except where the P2 section says otherwise. In particular, (ii) and (iv) are re-asked by G1b. The rev 2.1 status follows.

**Status (rev 2.1):** variant (a), rev 2.1, review 2 recheck ACCEPT (README and data). The functional and pixel checks ran in both engines (below). **Landing waits on a phone G or F check (item iv): touch effects need G/F before landing (protocol), and the phone is unplugged.** Two items are open for the user, none waived: (i) and (ii). (iii) is closed by the lead's decision; (iv) is the landing gate:
- **(i) Chrome first-jump frame.** P's first frame after the first jump of a load differs from B by 182-603 px, max channel delta 4, in rounded corners (row 5f).
- **(ii) Up-pass Layouts on a reversal (Sim).** Going up, P had a Layout with no initiator in 3 of 6 runs, B in 0 of 6, A/A in 2 of 6 (row 3r). Two of P's sit at or just after `#people`'s un-skip (2927, 2951), where only P un-skips anything. Likely caused by that extra un-skip; n=6, cause unknown.
- **(iii) Sim idle: closed (lead's decision), no idle cost found** (n=4 windows from 2 holds per arm, with A/A). P's medians lie inside B's and A/A's ranges, except two at the reversal spot, by 0.1/s up (Layout) and 1/s down (Paint). One P window at y0 is high, where all builds run the same code (row 8, "Idle").
- **(iv) Finger fling up through the band (iOS), UNRESOLVED.** Our probes cannot see it; the decisive check is a phone G or F fling up from the band with a recording, B vs P. Prepared as phone ticket G1 (below), not run.

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
- `vfix.mjs` (Sim; MODE I logs per-type counts `tl` and, since v30, summed durations `ms` per second) and `cfix.mjs` (Chrome headless 430x932 DPR 3, touch);
- `inv.js`: per-rAF invariant log, stack-tagged writes, `__idle` counters;
- `boot.js`: bootstrap counters;
- `tlinit.mjs`: Layout initiators; `tsum.mjs`: per-run Layouts ≥ 3 ms with initiators on the down / up / down2 passes (rows 3d, 3d2, 3r);
- `idlesum.py`: Sim idle median and range per arm per spot (row 8);
- `fling-band-v1.json` / `fling-band-v2.json` (WDA gesture scripts) and `flinglog.mjs` (`--inject` logger; v2 holds the flash >= 3 rAFs / 50 ms; v3 adds scroll-event stamps and IntersectionObserver entries, no layout reads): phone tickets G1 and G1b. `vfix.mjs` `FLOG=1` installs it in Sim T runs (functional check);
- `vscore.py` / `vcross.py`: stamp-aligned frame compare;
- `pxcmp.py`, `vidan.py`, `calan.py`;
- `cdbg.mjs`, `cure.mjs`, `simtab.mjs`;
- hold scripts `vhold.sh` / `vinner.sh` / `chold.sh`.

Holds v6-v19 and c5-c12 are on the rev 2 build (`96b876639c84`), except v6, which ran the guard build. v14-v19 (review 2) are six Sim holds of one T run and one idle run each, B P A A P B over the holds for both (`TORDER` / `IORDER` in `vfix.mjs`).

**Invariant** (lead, design choice 2): FAIL = `#people` or the hero intersects the viewport **and** `checkVisibility({contentVisibilityAuto: true})` is false. It is logged per rAF in both engines, before and after `iE` (a second rAF reader registered from a scroll listener after the page's).
- WebKit honours the option: self-test `skippedChildCvAuto` false, plain true.
- "sync" = the number of times the `iE` path un-skipped something.

| # | check | B (RB) | P (fwreskip) | A (A/A) | verdict |
|---|---|---|---|---|---|
| 1 | geometry at y2990 / 3047 / 3539 and the deck after scrolling back up (Sim v13, rev 2; v2 rev 1 the same) | `#people` 1326.73 / top 855.98 / next 1407.72 / doc 6035 at every stop | identical at every stop (`#people` deferred at 2990/3047, B active) | identical | **pass** |
| 1c | same in Chrome (c12, rev 2; c1 rev 1 the same), stops 2990 / 3047 / 3539 / 3800 + deck | 1327.88 / 933 / 1328.88 / 6277 | identical (`#people` deferred at 3539/3800, B active) | identical | **pass** |
| 2 | held screenshots, animations finished/paused, countdown digits and avatar carousel hidden: Sim v13 y2990 / 3047 / deck (web content box from a magenta calibration shot); Chrome c12 y2990 / 3047 / 3300 / 3539 / 3800 / deck (rev 2; v2/c1 on rev 1 the same) | | B vs P: Sim 3/3, Chrome 6/6 IDENTICAL | B vs A: Sim 3/3, Chrome 6/6 IDENTICAL | **pass** (byte-identical) |
| 3 | Sim W down 0→3100, up →2500, down again (B2 v7, n=1 per arm; ms are attribution only) | down: 18.8+17.5 @3003 (hero re-skip + fwWC wc=1) | first descent: **nothing ≥ 3 ms at the re-skip or the fwWC flip**; second descent: one 19.7 @3030 at the pair re-skip (row 3d2) | down: 19.6+18.7 @2998 | **pass** on the first descent (all runs: rows 3d, 3d2) |
| 3d | **first descent**, Layouts ≥ 3 ms in [2900, 3100] at the hero end, v7 + v11 + v14-v19 (n=6 per arm; per-run table under "Open item (ii)") | hero re-skip (`setProperty<fwReskip:2822`) and fwWC wc=1 (`setAttribute<:2709`): **2 in 6 of 6**. Totals 2, 2, 2, 2, 5, 2 | from the re-skip or fwWC: **0 in 6 of 6**. Totals 0, 0, 3, 0, 0, 1: countdown DOM updates (`before<mi:2188`, `toggle<Zi:2852`), `#people` scene=paused, one with no initiator (P2 v11) | 2 in 5 of 5 captured (v15 A2's first descent is missing from its Timeline and flip log). Totals 2, 2, 3, 2, -, 2 | **pass** for the hero-end Layouts: P removes the re-skip and fwWC Layouts in every observed first descent. Other Layouts in that band remain, in P as in B |
| 3d2 | **second descent** after the up-pass, same band, v7 + v14-v19 (n=4 per arm) | hero-end 2 in 4 of 4. Totals 4, 2, 2, 2 | hero-end 0 in 3 of 4. v7: one 19.7 @3030, the pair re-skip (`fwReskipOne:2844`) laid out by the page's own `getBoundingClientRect<l:11599`. Totals 3, 0, 0, 2 | hero-end 2 in 4 of 4. Totals 4, 2, 2, 3 | **mostly**: P removes them in 3 of 4; once the pair re-skip still cost a Layout |
| 3r | **up-pass** 3100→2500, Layouts ≥ 3 ms in [2400, 3100], v7 + v11 + v14-v19 (n=6 per arm) | 3 in every run = **18**; no initiator in **0 of 6** | 4, 4, 3, 3, 3, 4 = **21**; no initiator in **3 of 6** (2927, 2951, 2677) | 4, 3, 4, 3, 4, 3 = **21**; no initiator in **2 of 6** (2718, 2743) | **open (ii)**: P +3 over B and equal to A/A in total; the P-only part is 2 of 6 runs near `#people`'s un-skip. See below |
| 3b | flip log, every skip/un-skip of hero / `#people` with y (MutationObserver) | down: hero deferred @2995-3003; up: `#people` scene=active (rendered all along), hero active @2775-2788 | down: hero + `#people` deferred @2988-3007; up: **`#people` active exactly once** @2944-2954; hero active @2776-2792; down2: both deferred @2989 | as B | **pass**: no cycling, one `#people` un-skip per reversal |
| 4 | `npm run test:unit` | | | | **pass** |
| 5j | jumps J1 → `#people` top: Chrome from 3700 / 3800 (c5, c6, c7; n=8 per start per arm, alternating arm order), Sim from 3100 / 3450 (v8 B P A, v9 A P B; n=6 per start per arm) | FAIL 0, sync 0; hero placeholder 1 frame (heroPH 1) in every run | **FAIL 0**; sync fired once per jump, in the scroll event's frame; heroPH 1 (as B) | FAIL 0, sync 0, heroPH 1 | **pass** |
| 5c | cold deck, Chrome J1 from 4500 (past `#people`'s own far edge; c8, n=3 per arm). This is the positive control | FAIL 1 in every run (`#people` deferred and on screen in the first frame) | FAIL 1, **sync 0** (`fwWith` already cleared) | FAIL 1 | **pass** (baseline behaviour, identical) |
| 5n | negative control J1 from 3100 (hero not yet re-skipped), Chrome c9 | FAIL 0, sync 0, writes 0 | same | same | **pass** |
| 5f | Chrome post-jump frames f1-f3 vs B, stamp-aligned (c5-c7) | | **f1 of r1 (first jump after a load): 182, 182, 603, 182 px, max Δ4, rounded corners**, 4 of 4 r1 runs; r2 and later: no Δ4 | f1: 1-827 px of Δ1 shimmer; **never Δ4** | **open (i)**, see below |
| 5s | settled final shots after each jump (c5 + c6, n=11 per pair; `vres/c56-px.txt`) | | B vs P differ in **7 of 11** runs (8,147-10,052 px, Δ11) | B vs A differ in **4 of 11** (948-8,467 px, Δ11) | **not identical in either pair**; P differs more often in this sample |
| 6 | deck swipe after scrolling back up (Sim v13, Chrome c12; rev 2) | active shell 0→1, 1 active shell, scrollLeft 0→390 (Sim) / 0→392 (Chrome) | same | same | **pass** |
| 7 | invariant scenarios, Chrome c9 + c11 (XB=3771): W up 3771→3200; touch fling up 1600 px; J3 end→0; J4 end→`#people`; J4w (end reached by W steps); reload at 3771, then W up | FAIL 0 except J4/J4w (FAIL 1, positive control); sync 0 | FAIL 0 except J4w (FAIL 1, as B); **sync 0 in every scenario** | as B | **pass**, but after the reload the hero came back rendered in P and A (F-119), so the paired state was **not exercised after a reload** |
| 7s | same on Sim v10: W up 3100→2500; smooth `scrollBy(-1600)` from 3100; J3; J4 | FAIL 0 except J4 (FAIL 1); sync 0; heroPH 1 on J3/J4 | identical counts; sync 0 | | **pass** |
| 8 | idle, 10 s windows per spot (Chrome c10, n=1, B and P: bootstrap counters + MutationObserver; Sim v14-v19, n=4 windows from 2 holds per arm per spot, B P A A P B: Timeline record counts + MutationObserver) | see "Idle" | | | **closed (iii)**, lead's decision: no idle cost found. Chrome identical; on Sim no P-specific increase over B and A/A (two medians outside the B/A range at the reversal spot, by 0.1/s and -1/s) |

### Open item (i): the first-jump frame in Chrome

On the first jump after a load, P's first painted frame differs from B's by 182-603 px with max channel delta 4, in the deck's rounded corners. This happened in 4 of 4 r1 runs (c5 3700 / 3800, c6 3700, c7 3800). It never happens on r2 or later. A/A never shows Δ4. Cross-checks (`tools/vcross.py`):
- B cold-deck r1 frame 2 (c8, J1 from 4500, where `#people` is skipped in B too) vs B warm r1 f1: 604 px Δ4 (c6) and 183 px Δ4 (c7), the same corner region.
- B cold-deck r1 frame 2 vs **P warm r1 f1: 1 px Δ1** (c6 and c7).
- B cold-deck r1 frame 2 vs A cold-deck r1: 0 px.
- P c6 r1 f1 vs P c7 r1 f1: 0 px.
- B r1 vs B r2 f1 within B: 74,871 px Δ36.

So P's r1 f1 is the frame B itself paints after a jump onto a cold deck. **Hypothesis**, OBSERVED, cause unknown: a raster-timing effect that B has too. An animation phase fits as well: every arm changes in the same corners from f1 to f2 (B 1,433 / 1,344, A 1,344, P 1,178 px, Δ6; B r2 1,011 px). Scope: the first jump only. A fling after load is unverified. A Chrome fling frame compare was not run: frames after a fling are not at the same scroll position across arms, so it needs frames matched by scroll position first.

It is still a difference from B in the same scenario: r1 only, 182-603 px, max Δ4. The user's bar is byte-identical, so the lead puts it to the user. It is not waived here.

### Open item (ii): the up-pass Layout count on a reversal (Sim, attribution only)

Per-run Layouts ≥ 3 ms (`tools/tsum.mjs`, initiators as `tools/tlinit.mjs`). Holds v7 (B P A), v11 (B P A A P B), v14-v19 (B P, A A, P B, B, P, A). v11 ran no second descent. "hero-end" = the hero re-skip and the fwWC wc=1 flip; countdown = DOM updates `before<mi:2188` / `toggle<Zi:2852`.

| run | first descent [2900, 3100] | up: fwWC wc=0 (≈2950-3000) | up: `#people` un-skip | up: hero un-skip (≈2757-2792) | up: `#platform` scene paused (≈2585-2605) | up: no initiator | second descent [2900, 3100] |
|---|---|---|---|---|---|---|---|
| B v7 | 2 hero-end @3003 | 19.2 @2987 | n/a (rendered all along) | 20.1 @2775 | 20.5 @2587 | none | 4: hero-end 2 @3001, countdown 19.1 @2955, no initiator 18.4 @3001 |
| B1 v11 | 2 hero-end @2995 | 25.2 @2980 | n/a | 23.0 @2788 | 18.7 @2597 | none | not run |
| B2 v11 | 2 hero-end @2996 | 26.0 @2982 | n/a | 24.1 @2783 | 23.8 @2600 | none | not run |
| B1 v14 | 2 hero-end (2989, 3042) | 24.6 @2990 | n/a | 21.6 @2775 | 21.9 @2585 | none | 2 hero-end (2987, 3040) |
| B1 v16 | 5: hero-end 2 @2999, countdown 22.8 @2945, no initiator 19.2 @2954, countdown + `#people` scene=paused 17.9 @2962 | 23.4 @3000 | n/a | 22.1 @2790 | 18.8 @2601 | none | 2 hero-end @2999 |
| B1 v17 | 2 hero-end (2987, 3040) | 21.2 @2988 | n/a | 21.2 @2792 | 20.1 @2605 | none | 2 hero-end (2987, 3021) |
| P v7 | 0 | 20.0 @2954, **same Layout** as `#people` scene+render=active (`cE:2775`) | in the fwWC Layout | 20.9 @2778 | 25.3 @2594 | **20.0 @2927** | 3: countdown 21.8 @2943, countdown + scene paused 21.3 @2989, pair re-skip 19.7 @3030 (`getBoundingClientRect<l:11599`) |
| P1 v11 | 0 | 28.4 @2951, same Layout as `#people` active | in the fwWC Layout | 22.5 @2776 | 24.5 @2585 | **21.0 @2951** (same frame) | not run |
| P2 v11 | 3: countdown 21.8 @2946, countdown + scene paused 18.8 @2968, no initiator 20.6 @2968 | 25.5 @2950, `#people` active in the same Layout | same Layout | 21.1 @2792 | 23.3 @2602 | none | not run |
| P1 v14 | 0 | 29.0 @2950, same Layout as `#people` active | same Layout | 23.9 @2774 | 19.3 @2596 | none | 0 |
| P1 v16 | 0 | 25.8 @2949, same Layout as `#people` active | same Layout | 21.8 @2792 | 23.4 @2602 | none | 0 |
| P1 v18 | 1: countdown 18.0 @2923 | 19.8 @2956, same Layout as `#people` active | same Layout | 20.6 @2757 | 20.0 @2592 | **18.5 @2677** | 2: countdown 18.3 @2941, countdown + scene paused 19.0 @2969 |
| A v7 | 2 hero-end @2998 | 25.4 @2978 | n/a (22.3 @2918, `cE` `#people` scene active) | 22.4 @2771 | 24.7 @2587 | none | 4: countdown 25.2 @2931, countdown + scene paused 19.7 @2976, hero-end 2 @3038 |
| A1 v11 | 2 hero-end (2989, 3042) | 22.7 @2990 | n/a | 22.7 @2776 | 24.0 @2585 | none | not run |
| A2 v11 | 3: countdown 22.2 @2941, hero-end 2 (2987, 3040) | 23.0 @2987 | n/a | 21.8 @2778 | 23.3 @2591 | **18.9 @2718** | not run |
| A1 v15 | 2 hero-end @2993 | 25.3 @2994 | n/a | 22.8 @2782 | 19.7 @2595 | none | 2 hero-end @2993 |
| A2 v15 | not captured (no hero re-skip or fwWC flip in the Timeline or the flip log; 501 records vs ~760 in other v14-v19 runs) | 21.3 @2980 | n/a | 21.2 @2780 | 20.9 @2597 | **20.1 @2743** | 2 hero-end @2995 |
| A1 v19 | 2 hero-end @2995 | 23.3 @2975 | n/a | 21.5 @2792 | 23.8 @2603 | none | 3: countdown 21.9 @2957, hero-end 2 @2994 |

Rev 2's row 3r counted v7 as 2 / 3 / 3 (B / P / A): it placed v7's `#platform` Layout below 2500. `tsum.mjs` maps each Layout's y from that run's frame log and puts it at 2587-2594 in all three v7 arms, so v7 counts one more in every arm here.

- **Going down, P removes the hero-end Layouts:** 0 in 6 of 6 first descents (B and A/A: 2 in every captured run) and in 3 of 4 second descents. In v7's second descent the pair re-skip still cost one Layout, forced by the page's own `getBoundingClientRect` (l:11599). Other Layouts in that band remain in P as in B: countdown DOM updates, `#people` scene=paused, and Layouts with no initiator (P2 v11 down, B v16 down).
- **Going up, the event Layouts are the same in P and B:** fwWC, hero un-skip, `#platform`. P's `#people` un-skip costs no Layout of its own; it shares the fwWC one in 6 of 6.
- **The difference is the no-initiator Layouts:** P in 3 of 6 runs, B in 0 of 6, A/A in 2 of 6. By position:
  - P v7 (2927) and P1 v11 (2951) sit at or just after `#people`'s un-skip (2954, and the same frame at 2951). Only P un-skips anything there. **Likely caused by that extra un-skip; n=6, cause unknown.**
  - P1 v18 (2677) and both A/A ones (2718, 2743) come 37-80 px after the hero un-skip, where every arm does the same work. B has none there in 6 runs; A/A has the same code as B, so this one is not attributed to the patch.
- It is reported as a possible cost of the fix on reversals: one ~20 ms Layout near 2930-2950 going up, in 2 of 6 runs. Against it, going down, P has no hero-end Layout records in every first descent (6 of 6; B: 2, of about 18 ms each).

Per-250 px counts of Layouts ≥ 3 ms (`tools/bins.mjs`, v7 + v11 only). These include unrelated work (countdown DOM updates `before<mi:2188`, `#platform` scene), so only the event rows above are attributable:

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

Chrome c10 is one window per arm, B and P only.

Sim v14-v19 (review 2): Timeline records per second between two marks, plus MutationObserver counts. n=4 windows from 2 holds per arm per spot: two 10 s windows per hold, back to back, so the windows within a hold are phase-paired; arms over the six holds B P A A P B. Median [min-max] per second (`tools/idlesum.py`, logs `vres-v14.log` … `vres-v19.log`):
- The bootstrap script does not survive WebKit's reload (v12, `boot false`), so the Sim run has no per-callback wrappers and no reload; the Timeline types stand in for them.
- The paired state is reached at the band spot: P logs `people:d` there, B and A `people:a`. At the reversal spot (2850) `#people` is rendered in every arm.

| spot | type | B | P | A (A/A) |
|---|---|---|---|---|
| y0 | rAF | 29.7 [29.3-30.0] | 29.6 [29.3-35.5] | 29.6 [29.2-29.6] |
| y0 | FunctionCall | 76.0 [75.4-76.6] | 75.5 [75.0-87.1] | 75.0 [74.2-76.0] |
| y0 | Layout | 41.4 [41.2-42.1] | 41.0 [38.0-43.5] | 41.1 [38.9-43.4] |
| y0 | Paint | 48.0 [45.1-50.6] | 48.0 [47.3-49.6] | 48.0 [47.4-48.4] |
| y0 | mut style | 66.4 [66.0-67.3] | 66.7 [66.2-82.3] | 66.1 [65.2-67.8] |
| band 3100 | rAF | 18.1 [12.1-24.4] | 18.2 [12.3-24.4] | 18.3 [12.1-24.5] |
| band 3100 | RecalculateStyles | 37.4 [35.9-38.5] | 37.7 [33.0-41.6] | 38.2 [36.4-40.6] |
| band 3100 | Layout | 26.6 [25.7-27.4] | 27.0 [26.8-27.7] | 26.8 [26.1-27.6] |
| band 3100 | Paint | 68.3 [58.3-78.0] | 67.6 [58.5-79.3] | 68.4 [59.1-78.9] |
| band 3100 | Composite | 43.8 [42.0-45.9] | 46.0 [41.1-50.4] | 44.5 [42.7-48.8] |
| band 3100 | IO callbacks | 0.2 [0.1-0.2] | 0.2 [0.1-0.2] | 0.2 [0.1-0.2] |
| band 3100 | characterData | 15.1 [13.9-16.6] | 15.1 [14.0-16.6] | 15.2 [13.9-16.6] |
| reversal 2850 | RecalculateStyles | 29.9 [28.4-30.0] | 31.6 [26.0-35.9] | 31.6 [27.7-34.3] |
| reversal 2850 | Layout | 20.2 [19.0-20.7] | 20.8 [19.4-21.2] | 20.5 [18.3-20.7] |
| reversal 2850 | Paint | 26.7 [26.4-27.0] | 25.4 [25.0-26.3] | 27.2 [26.8-27.6] |
| reversal 2850 | Composite | 32.4 [31.8-33.7] | 35.2 [28.6-42.2] | 35.4 [29.8-38.7] |
| pin | Layout | 58.1 [58.0-58.4] | 58.0 [57.8-58.1] | 58.5 [58.2-58.7] |
| pin | Paint | 236.1 [236.0-236.2] | 236.1 [235.8-236.4] | 236.4 [235.9-236.6] |

- Every P median lies inside the range of B's and A/A's eight windows at that spot, for every type logged (the full list is in `idlesum.py`'s output), except two at the reversal spot: Layout 20.8 vs at most 20.7 (+0.1/s) and Paint 25.4 vs at least 26.4 (lower). At that spot `#people` is rendered in every arm.
- One P window at y0 is high (rAF 35.5, FunctionCall 87.1, mut style 82.3). At y0 all builds run the same code, and the other three P windows sit with B and A/A.
- In the band, where P has `#people` skipped, the spread inside each arm is large (Paint 58-79 in every arm), and the three medians agree within 1-5 %. Window for window, P and B match: band Paint P 75.9 / 79.3 vs B 78.0 / 77.6 in the first window of each hold, 59.3 / 58.5 vs 59.0 / 58.3 in the second. So v12's single-window +23 % (P Paint 78.5 vs B 63.8) was a phase mismatch between the two windows, not a P cost.
- IO callback rates are equal in every arm at every spot. No new observer callbacks or attribute writes appear in P, in either engine.
- Item (iii) is closed by the lead's decision: no idle cost found (n=4 windows from 2 holds per arm, with A/A; attribution only).

### Sim capture calibration

A one-rAF full-viewport magenta flash (~34 ms on screen) was recorded in **2 of 3** Simulator screen recordings. CAL-1 had 0 magenta frames (`tools/calan.py`), and ffmpeg also warned about non-monotonic timestamps. **So Sim recordings are not evidence for single frames.** The Sim frame claims in this README rest on `checkVisibility` per rAF, not on video.

Rev 1's row 5v recording claims are withdrawn as evidence. They include the J1 first-rAF gap of 110 vs 60 ms (n=1), flagged here with no claim.

### What earlier statements became

- Rev 1 line 131, "a deferred section on screen still renders": **REFUTED.** A section that a jump brings on screen while it is skipped stays skipped in that frame. We see it in both engines as heroPH 1 / FAIL 1 in the baseline. The spec agrees: "Proximity determinations other than the initial one take effect at the next rendering opportunity". This is the HTML spec, not CSS Contain 2: event loop processing model, "update the rendering", the step that loops "Recalculate styles and update layout" and determines proximity to the viewport for each `content-visibility: auto` element (html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model, the note after that sub-step, citing [CSSCONTAIN]; read 2026-10-02). WebKit's behaviour here stays OBSERVED (Sim v8/v9 heroPH 1 in every arm). That is why variant (a) un-skips `#people` from `iE`, before style, in the scroll event's frame.
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
- Reload while scrolled ran in Chrome only (c11); not on Sim. The paired state was not reached after the reload (row 7).
- bfcache restore (back/forward to a scrolled page).
- Resize and orientation change.
- A finger fling on iOS (item iv).
- The short reversal is covered by B2 (rows 3, 3r, 3b).

### Open item (iv): touch and async scrolling (UNRESOLVED)

In the band (hero far edge to `#people`'s own far edge), B always has `#people` rendered. P has it skipped and un-skips it from the main thread: from `cE`, `sE` or `iE`. On iOS the UI process scrolls ahead of the main thread. During a fast finger fling up through the band, while a ~20 ms Layout runs, the compositor could show the skipped deck before `iE` runs. B cannot show that.
- `inv.js` cannot see it, because it runs on the main thread. Chrome's touch fling and Sim `scrollBy` cannot see it either.
- The decisive check is a phone G (WDA gesture) or F (finger) fling up from the band with a screen recording, B vs P.
- Per protocol (touch effects need G/F before landing), fwreskip does not land until that check runs. The phone is unplugged, so the fix waits for it.

### Phone ticket G1 (item iv): block 1 run by iphone-runner (summary under G1b "Why")

Owner of the run: `iphone-runner`, when the iPhone is on USB. No measurement has been made with this ticket. Recordings and run JSON stay in `out/` (Fastwork content; Hard rule 3). Since user rule T-018 (2026-10-02) no G1 run is made with a recording; G1b replaces the rest of G1.

**Question.** During a finger fling up from the band, does P ever show `#people` (the profile-card deck) as a placeholder on screen, in a frame where B shows the deck? Driver G (WDA gesture), with F as the fallback. Prediction: **P-057** (`fixes/PREDICTIONS.md`): no FAIL in block 1 (~65 %) or block 2 (~80 %).

**Builds.** Immutable snapshot copies, read-only (`chmod a-w`), in this worktree's `out/fwreskip/snap-g1/` (path from the main checkout: `.claude/worktrees/agent-a1722cf5058e25591/out/fwreskip/snap-g1/`):

| arm | role | files (sha256, first 12) |
|---|---|---|
| B = RB | control C | `nodes/2.DyWL8TcE.js` `dbd5fdb4f1fb`, `assets/2.gBuqKVzi.css` `0d7dfc79e703` |
| P = fwreskip on RB | variant V | `nodes/2.DyWL8TcE.js` `96b876639c84`, `assets/2.gBuqKVzi.css` `0d7dfc79e703` |

If the copies are gone, rebuild them: B = `fixes/rb/overlay` (fix-scene-scope's `snap3/rb`); P = the same with `fixes/fwreskip/overlay` (from this branch's `patch.diff`, `fix.mjs apply fwreskip --on rb`) on top. Check the hashes above before serving.

**Serve** (from the runner's checkout, one server per arm, restarted at the block start; `S` = the snapshot path above; plain-http twin for the phone, I-003):

```sh
node tools/serve.mjs --root site-pretty --overlay $S/B --port 0 --https --vendors=local --latency 150 --no-cache --state out/fwreskip-g1/serve-B.json
node tools/serve.mjs --root site-pretty --overlay $S/P --port 0 --https --vendors=local --latency 150 --no-cache --state out/fwreskip-g1/serve-P.json
node tools/wait.mjs serve out/fwreskip-g1/serve-B.json; node tools/wait.mjs serve out/fwreskip-g1/serve-P.json
curl -s -D - -o /dev/null http://localhost:<port>/_app/immutable/nodes/2.DyWL8TcE.js   # x-mirror-source: overlay; then shasum the body against the table
```

**Gesture** (`fixes/fwreskip/tools/fling-band-v1.json`, compiler v2; dry-run 2026-10-02: fast hash `3195734415a8`, medium `f7cded2f3ea6`):
- reload, 6 s idle at the top;
- descend with `still` strokes (no momentum): 480 px / 700 ms until y ≥ 2900, then 150 px / 500 ms until y ≥ 3250 (the band; Sim crossings: hero far edge ≈2988, `#people`'s own far edge ≈3539). The run aborts if y < 3250;
- settle, rest 2 s (the pair re-skip happens on the way down);
- mark `fling`, then ONE finger stroke down (the page scrolls up), `fling` profile at x 215, y 220→740:
  - **fast** (default): 520 px / 160 ms, lift-off ≈5,850 px/s;
  - **medium**: `--param flingPx=400 --param flingMs=220`, lift-off ≈3,240 px/s;
- 2.5 s coast, settle, mark `end`.

```sh
node tools/iphone.mjs gesture fixes/fwreskip/tools/fling-band-v1.json --owner <runner> --label G1-<arm><n> --inject fixes/fwreskip/tools/flinglog.mjs
```

`flinglog.mjs` adds no per-frame reads and forces no layout. It logs each render-attribute flip of the hero and `#people` with time and scrollY (to check the paired state at `fling` and to time `#people`'s un-skip). It also flashes the full viewport magenta for one rAF, 3 s into the idle phase, as the capture calibration.

**Recording.** One screen recording per run, from before the gesture starts to after `end`: a QuickTime USB recording of the iPhone (New Movie Recording, camera = the iPhone, quality Maximum), or iOS Screen Recording. Use the same method for every run of a block. Name each file by its label. Judge frames at the recording's native rate; extract them with `ffmpeg -i <file> -vsync 0 frames/%05d.png`.

**Block** (protocol §5; attribution only, no timing number):
1. Park Safari; start both servers.
2. Uncounted warm-up: one gesture run per arm's port (B, then P).
3. Sentinel: one uncounted Timeline-off control run, `iphone.mjs run --driver scroll --probe std --arm C` on B (bottom ≥ 58 fps, scroll ≥ 44 fps).
4. Counted: **C V V C C V V C** = B P P B B P P B, fast variant, 8 runs (4 per arm), each with a recording.
5. End sentinel as in 3, then park Safari.

Expected time: about 15 min per block. Record the heat note and the battery temperature per run. At most 2 blocks: block 2 = the same order with the medium variant, run only when block 1 has no FAIL.

**Run validity.**
- **Void** if the recording shows no magenta frame (failed capture; Sim CAL-1 lost it once).
- **Void** if P's `#people` is not `deferred` at the `fling` mark (its last flip before the mark), or B's `#people` is `deferred` there (past its own far edge: not the band).
- **Void** if the gesture aborted (y < 3250) or WDA did not play the stroke.
- A failing sentinel voids the runs since the last passing one (CLAUDE.md "Phone blocks").

**FAIL** (decided from the recordings, frames from `fling` to `end`): any frame of a P run in which `#people` is on screen as a placeholder (its area painted as plain page background, no deck), when no B run of the block shows that. The same rule applies to the hero placeholder. Report the frame, scrollY (from the run's frame log) and `#people`'s un-skip time from flinglog.

**Decision.**
- Any FAIL → fwreskip does not land; back to design (for example an earlier un-skip of the pair).
- No FAIL in 4 of 4 valid P runs in block 1 and in block 2 → item (iv) passes for G. Landing goes back to the lead with items (i) and (ii) still open for the user.
- G inconclusive (fewer than 3 valid runs per arm, or WDA cannot play the fling) → F, below.

**F fallback** (console step, through the lead).
- Position the phone in the band with the gesture at `--param fling=no` (it stops at y ≥ 3250 and leaves the page there). Start the recording, then post:
  - `--kind action --record`, title "fwreskip: one fast flick up through the people cards";
  - instructions "The page is a little below the people cards. When it says swipe: flick your finger fast DOWN the screen once, so the page shoots up, and let it coast to a stop. Do nothing else."
- One part per arm, B P P B. The recording decides FAIL by the same rule; the user's eye is a note, not the verdict.

### P2 (rev 3, lead go 2026-10-02): idle un-skip of the paired `#people`

**Change** (c6d13ca, JS `9fe824464da2`, CSS unchanged `0d7dfc79e703`). The down pass is unchanged: the pair re-skip at the hero's far edge stays, and so does the gain. New: while `#people` is paired (`fwWith` set, which only holds between the hero's far edge and `#people`'s own far edge), every scroll event re-arms a 300 ms `setTimeout`. When it fires, `#people` is un-skipped (`sE(e, true)`, which also clears `fwWith`). In that region B has `#people` rendered, so after a 300 ms pause P2's state there equals B's. Without a pause, P2 behaves as P. Past `#people`'s own far edge nothing changes. No `requestIdleCallback`: Safari support is unverified, and the lead OK'd a plain timer.
- `rE` 2668-2671: re-arm while paired;
- `fwPair` / `fwIdleArm` / `fwIdleUnskip` 2672-2685;
- `fwReskip` 2887: remember the pair and arm the timer once;
- teardown (P2b, JS `b4ff6ec56cc2`, review-fwreskip-3 #5): `oE` 2755 also clears a pending timer (`fwIdleT && (clearTimeout(fwIdleT), fwIdleT = 0)`), and `dE`'s destructor drops the pair (`fwPair === n && (fwPair = null)`). Without them, a timer pending at a SvelteKit navigation would set `data-start-selling-render=active` again on an element the destructor had stripped. Neither line runs during a page session.

The timer is armed only by scroll and resize events while a pair exists, so a page at rest runs no new code.

**Checks before the phone** (shared lane, holds v20-v25 and c13-c14; arm label `Q` = P2; B = RB; A = RB again):

| # | check | B | P2 | verdict |
|---|---|---|---|---|
| P2-1 | Sim T **pause in band**: W down to 3100, hold 1.5 s, up to 2500, down to 3100, hold (v20, B Q Q B B Q, n=3 per arm) | first descent: hero-end Layouts (re-skip + fwWC) 2, 2, - (B3's first descent not captured). Up-pass Layouts ≥ 3 ms: 3, 3, 5 | `#people` flips active **during the hold** at y 3198-3206, 300 ms in, in 3 of 3 runs (and again in every second-descent hold). Initiator `sE<fwIdleUnskip`, Layout 28.3 / 28.6 / 28.0 ms (Q1 and Q3 also have a second one, 19.8 / 22.7). B's holds at the same spot show 1-2 Layouts of 20-23 ms with no initiator. First descent: hero-end Layouts **0** in 2 of 2 captured. Second descent: 0, 0, 0. Up-pass: 3, 3, 3, **no `#people` un-skip and no no-initiator Layout** on the up-pass | **pass**: the down gain is kept, the up-pass is B-like, and the cost moves to the hold. P-060 Sim (pause): hit |
| P2-2 | Sim T **no pause** (THOLD 0: up-pass starts on the last down step; v21, n=3 per arm) | hero-end on the first descent 2, 3, - | as P: `#people` un-skips on the up-pass at 2952-2957 (cE, merged into the fwWC wc=0 Layout or its own 21.6 ms one). Up-pass totals 3, 4, 3 (one no-initiator Layout in Q2 at 2988), B 5, 3, 4. Second-descent holds again show the idle un-skip (26.7 / 21.7 / 27.9 ms) | **as predicted** (P-060 Sim no-pause: hit). Without a pause P2 = P |
| P2-3 | Chrome invariants (c13; scenarios up, fling, J3, J4w, J1n, reload from XB 3771) | FAIL 0 except J4w (FAIL 1, positive control); sync 0 | identical counts. `#people` is `a` at XB, because the 1.5 s park un-skips it. J3 started with the hero rendered in P2 (an instant jump to the end lost the far re-skip, F-119), so heroPH 0 vs 1 | **pass** |
| P2-4 | geometry + held screenshots: Chrome c14 (2990 / 3047 / 3300 / 3539 / 3800 / deck), Sim v22 (2990 / 3047 / deck, magenta-calibrated box) | | geometry identical at every stop (Chrome `#people` 1327.88 / top 933, Sim 1326.73 / 855.98, doc 6277 / 6035). Pixels: Chrome **6/6 IDENTICAL**, Sim **3/3 IDENTICAL**. Deck swipe 0→1, 1 active shell, scrollLeft 392 / 390 | **pass** (byte-identical) |
| P2-5 | Sim idle, 10 s windows (v23 B Q, v24 Q B, v25 A Q; IWIN 2) | see below | see below | **UNRESOLVED** (review-fwreskip-3 #3; was "pass"): P2 is above its same-hold control at the reversal spot in 3 of 3 holds for Composite; cause unknown (OBSERVED). B, A and P2 in one hold: v27, v29 (counts) and v30 (durations), rows R4, R6, R7: in time spent P2b is inside the same-build B-A spread (OBSERVED, n=1) |
| P2-6 | `npm run test:unit` | | | **pass** (555/555) |

**P2-5, idle.** Median [min-max] per second (`tools/idlesum.py vres-v23.log vres-v24.log vres-v25.log`). At y0 and at the pin, all arms agree to within 0.6/s. At the band and reversal spots `#people` is `a` in every arm, P2 included (its 1.5 s park un-skipped it):

| spot | type | B (n4) | P2 (n6) | A = RB (n2) |
|---|---|---|---|---|
| band 3100 | RecalculateStyles | 33.8 [32.3-35.0] | 38.2 [32.5-40.1] | 39.5 [39.3-39.8] |
| band 3100 | Layout | 23.2 [22.7-24.7] | 26.8 [22.5-27.6] | 26.9 [26.7-27.2] |
| band 3100 | Composite | 41.8 [39.0-43.3] | 46.8 [40.2-49.2] | 46.2 [45.2-47.3] |
| reversal 2850 | RecalculateStyles | 25.6 [23.7-26.9] | 31.8 [27.7-34.3] | 32.5 [31.6-33.4] |
| reversal 2850 | Layout | 15.2 [13.3-16.3] | 19.6 [16.0-20.7] | 20.2 [20.1-20.4] |
| reversal 2850 | Composite | 28.4 [27.2-29.8] | 37.1 [30.4-41.3] | 34.7 [33.4-36.0] |

**Per hold** (review-fwreskip-3 #3), median [min-max] per second, n=2 windows per arm per hold; control = the other arm of the same hold:

| hold (order) | spot | type | control | P2 | P2 above control, no overlap? |
|---|---|---|---|---|---|
| v23 (B Q) | band 3100 | RecalculateStyles | B 33.8 [33.1-34.5] | 38.2 [38.1-38.2] | yes |
| v23 | band 3100 | Composite | B 41.8 [40.4-43.3] | 46.8 [45.2-48.3] | yes |
| v23 | reversal 2850 | RecalculateStyles | B 24.5 [23.7-25.4] | 31.9 [31.6-32.3] | yes |
| v23 | reversal 2850 | Layout | B 15.4 [14.4-16.3] | 20.7 [20.7-20.7] | yes |
| v23 | reversal 2850 | Composite | B 27.6 [27.2-28.0] | 38.0 [36.9-39.0] | yes |
| v24 (Q B) | band 3100 | RecalculateStyles | B 33.6 [32.3-35.0] | 33.2 [32.5-34.0] | no |
| v24 | band 3100 | Composite | B 41.1 [39.0-43.3] | 41.5 [40.2-42.8] | no |
| v24 | reversal 2850 | RecalculateStyles | B 26.4 [25.8-26.9] | 28.0 [27.7-28.3] | yes |
| v24 | reversal 2850 | Layout | B 14.6 [13.3-15.9] | 16.5 [16.0-17.0] | yes |
| v24 | reversal 2850 | Composite | B 29.4 [28.9-29.8] | 30.8 [30.4-31.2] | yes |
| v25 (A Q) | band 3100 | RecalculateStyles | A 39.5 [39.3-39.8] | 39.6 [39.1-40.1] | no |
| v25 | band 3100 | Composite | A 46.2 [45.2-47.3] | 48.8 [48.3-49.2] | yes |
| v25 | reversal 2850 | RecalculateStyles | A 32.5 [31.6-33.4] | 33.1 [32.0-34.3] | no (overlap) |
| v25 | reversal 2850 | Layout | A 20.2 [20.1-20.4] | 19.6 [18.7-20.5] | no |
| v25 | reversal 2850 | Composite | A 34.7 [33.4-36.0] | 39.3 [37.3-41.3] | yes |

**Reading: UNRESOLVED** (OBSERVED, cause unknown). Rev 3 said "no P2-specific idle cost"; review-fwreskip-3 showed that this overclaims, and it is withdrawn:
- Composite/s at the reversal spot is above the same-hold control in **3 of 3** holds with no range overlap (+10.4, +1.4, +4.6/s). RecalculateStyles there is above in 2 of 3, band Composite in 2 of 3.
- Rev 3's argument was "A (the same build as B) came out where P2 is". That holds for RecalculateStyles and Layout in v25, but not for Composite. And B and A never ran in the same hold, so B-vs-A mixes hold drift with build.
- The DOM state per window (hero `d`, `#people` `a`) and the mutation rates are identical between arms, so the difference is not in what the page writes. One hypothesis (reviewer): animations that P2's later `#people` un-skip restarted are still running at the reversal spot.
- Why v25 used A instead of B: after v23 and v24 had put P2 above B, v25 asked whether B's low numbers were the build or the hold, so it ran the same build as B (an A/A control) against P2. It answered for RecalculateStyles and Layout, not for Composite.
- Done since (rows R4, R5 below): one hold with **B, A and P2 together** (v27, `MODE=I IORDER="B Q A" IWIN=1`) and a census at the band and reversal spots per arm (v26 `MODE=N`: running animations per section, `data-fw-wc=1` count, `#people` style and content-visibility). Results: "P2b rechecks" below.

The timer itself runs no code at rest. That does not settle the question, because the un-skip it caused earlier may leave different state behind.

**What the Sim cannot say.** On the phone, the idle un-skip frame may cost more than the Sim's ~28 ms Layout (G1: 65-92 ms when the un-skip ran during a fling). It mostly fires in a pause between descent strokes (G1b "Question"), and it can stall whatever animates on screen for one frame. That is P-060's hitch reading, decided in G1b.

**P2b rechecks** (JS `b4ff6ec56cc2`, teardown lines, review-fwreskip-3 #5; shared-lane holds v26 + c15, v27, v28; arm `Q` = P2b, B = RB, A = RB again; Sim ms are attribution only):

| # | check | result | verdict |
|---|---|---|---|
| R1 | Chrome invariants c15 (up, fling, J3, J4, J1n; B and P2b) | FAIL 0 in every scenario, sync 0. J3 heroPH 1 in P2b, as in c13 (F-119) | **pass**, same as P2's c13 |
| R2 | Sim T **pause in band** with flinglog v3 (v28, B Q A Q, TDOWN 3100, hold, up to 2500, down2 3100) | `#people` flips active **in the hold** at 3167 / 3197 (first descent) and 3167 / 3199 (second), **301-302 ms after the last scroll event** (v3 stamps: the timer, not `iE`). Layout at the flip 19.7 / 21.8 and 26.2 / 21.1 ms. Up-pass: no `#people` un-skip (its `active` record there is a same-value re-set, also in B and A). B and A never defer `#people` at 3100 | **pass**, as P2-1 |
| R3 | flinglog v3 functional (v26 and v28, 9 runs) | 177-309 scroll stamps per run, flash recorded (3 rAFs, 50-187 ms), 2-5 IO entries, **deferred-while-intersecting: none** in every run of every arm | **pass** |
| R4 | Sim idle, **B, A and P2b in one hold** (v27, IWIN 1, n=1 window per arm per spot) | Composite/s at the reversal spot: B 37.8, P2b 38.6, A 32.6. RecalculateStyles B 36.3, P2b 32.5, A 31.3; Layout 21.7 / 20.5 / 21.0. Band Composite 46.4 / 48.2 / 45.2. Same-build B vs A differs by 5.2/s at reversal Composite within one hold; P2b is inside or within 0.8/s of the B-A range at every spot | the same-hold A/A spread is as large as the P2 deltas of v24/v25; v23's +10.4 is not repeated. Still **UNRESOLVED** at n=1, with no P2-specific cost visible in this hold |
| R5 | census at band 3100 and reversal 2850 (v26, v28 `MODE=N`): running animations, `data-fw-wc=1`, `#people` style, layers (WebKit `LayerTree.layersForNode`, functional only) | Running animations: the same 7 in every arm at reversal (A once had 2 extra commission transitions at the band). `wc` identical. Layers at reversal: all 35 / 40 / 40 and `#people` 7 / 12 / 12 (B / P2b / A), so P2b = A and the B-A difference is again in-build. P2b's `#people` keeps the inline `--start-selling-intrinsic-block-size` from its earlier skip; the CSS reads it only under `deferred` (`2.gBuqKVzi.css` 11931-11934), and rev 2.1 leaves it the same way | no P2-specific animation or layer state found. The reviewer's hypothesis (restarted animations still running) is not supported here (OBSERVED, n=1-2) |
| R6 | Sim idle, B, A and P2b in one hold again (v29, `IORDER="A Q B"`, IWIN 1) | Reversal counts/s: Composite B 31.2, P2b 34.9, A 31.0; RecalculateStyles 28.9 / 31.2 / 28.2; Layout 17.2 / 21.1 / 20.4; Paint 29.3 / 25.0 / 28.1 | P2's reversal Composite count is above every same-hold control in 5 of 5 holds (v23-v25, v27, v29), and its Paint count is lower in each one. Counts only, so this shows a different composite/paint split, not necessarily more work: the decisive check is durations (R7) |
| R7 | Sim idle with **per-type durations** (v30, `IORDER="Q B A"`, IWIN 1; `vfix.mjs` MODE I now logs `ms` = summed record ms per second next to the counts) | Reversal ms/s: Composite B 53.1, P2b 52.2, A 61.6; Layout 43.8 / 54.6 / 58.4; RecalculateStyles 20.8 / 23.3 / 21.7; Paint 0.8 / 0.9 / 1.0; main-thread sum (styles, layout, paint, JS, timers, observers) 70.9 / 86.5 / 88.8. Band: P2b lowest of the three in Composite, styles and layout. Pin: Composite 742.9 / 765.3 / 734.4 (P2b +3 % over B, n=1), styles and paint lower. Reversal counts this time: Composite 41.6 / 39.1 / 33.8, so P2b is inside the B-A range (the 5-of-5 streak is now 5 of 6) | in time spent, P2b is inside the same-build B-A spread at the reversal spot and at or below it at the band. **No P2-specific idle cost found** (OBSERVED, Sim, n=1 window per arm; Sim ms are attribution only). The pin's +3 % Composite is inside what one window can show and the pin has `#people` skipped in every arm. P2-5 stays formally UNRESOLVED until the reviewer accepts durations as the deciding check |

### Phone ticket G1b (P2): both arms run 2026-10-02 (results below)

Owner of the run: `iphone-runner`. Phone order (lead, 2026-10-02): PR-001 block B, then G1b, then PR-003's block if the user picks A, then T-011; review-fwreskip-3 passed the P2 diff with fixes, and the ticket fixes it asked for before G1b are in this section (rev 2 of the ticket, pre-data). User steps jump the queue. No measurement has been made with this ticket. Run JSON stays in `out/`. **No recordings** (user rule T-018, 2026-10-02): no QuickTime movie recording, no iOS Screen Recording, no camera. Everything G1b reads comes from the page itself: the gesture's frame log and `flinglog.mjs` v3.

**Why.** G1 block 1 (iphone-runner, OBSERVED, G driver, n=1 valid B) found no placeholder FAIL. But P's longest fling frame sat on the `#people` un-skip in 4 runs (65-92 ms), and once on the hero un-skip (69 ms). B's frame at the same moment was ≤ 50 ms, and B's maximum was 51-57 ms. P2 moves that un-skip out of the scroll when it can: while `#people` is still paired, it is un-skipped after 300 ms with no scroll event. That is the region between the hero's far edge and `#people`'s own far edge, where B has it rendered.

**Question.** For a fling up from the band, two things:
- Does P2 remove P's long frame at the `#people` crossing when the user paused in the band (restMs 2000)?
- What does the idle un-skip frame cost, compared with B at the same moment? In the rest arm it will mostly fire **between descent strokes**, not in the 2 s rest (review-fwreskip-3 #2): pairing happens at ~2988, the strokes run on to 3250, and each 150 px still stroke ends with a 150 ms hold plus pauseMs 300, about 450 ms with no scroll event. So the page is not at rest when the un-skip runs: it is the "pause, then scroll again at once" case. P-060's "with the page at rest" wording is read that way (clarified here before data; the P-060 row itself is unchanged).

With no pause (restMs 0), P2 is expected to behave like P. Prediction: **P-060** (`fixes/PREDICTIONS.md`), with the decision rule below (tightened before data, review-fwreskip-3 #1).

**Scope: RB only** (review-fwreskip-3 #7). G1b measures P2 on RB, not on stack5. In stack5, st6's five persistent `will-change` avatar layers (`.start-selling-avatars.is-carousel`, inside `#people`, JS 11257) come back with every `#people` un-skip, so P2's idle frame on stack5 may cost more than G1b shows. PR-003 option A (`fixes/st6-rb`, RB + st6 with its slot avatars in the paused-scene `will-change: auto` list) is expected to land before fwreskip (lead, 2026-10-02): then P2-1 (Sim T, pause in band: idle un-skip Layout ms plus a layer count) is re-run on RB + st6-rb, not on stack5, before fwreskip lands.

**Builds.** Immutable snapshot copies, read-only, in this worktree's `out/fwreskip/snap-g1b2/`:

| arm | role | files (sha256, first 12) |
|---|---|---|
| B = RB | control C | `nodes/2.DyWL8TcE.js` `dbd5fdb4f1fb`, `assets/2.gBuqKVzi.css` `0d7dfc79e703` |
| P2b = fwreskip + idle un-skip on RB, with teardown | variant V | `nodes/2.DyWL8TcE.js` `b4ff6ec56cc2`, `assets/2.gBuqKVzi.css` `0d7dfc79e703` |

P2b is P2 (`9fe824464da2`, the old `snap-g1b/P2`, do not use) plus the two teardown lines from review-fwreskip-3 #5 (section "P2"). Neither line runs during a page session: the destructor runs only when the scene component is destroyed, and `oE` acts only when the last scene is gone. P-060 applies to P2b unchanged. Rebuild: `fix.mjs apply fwreskip --on rb` from this branch's `patch.diff`. Serve as in G1, with `$S/B` and `$S/P2b` from `snap-g1b2`.

**Gesture** (`fixes/fwreskip/tools/fling-band-v2.json`). It is v1 plus two params: `pauseMs` (the pauses between descent strokes) and `settle`. Dry-run hashes 2026-10-02:
- **rest** arm (defaults: restMs 2000, pauseMs 300, settle yes, fast fling): `e30bd43a60eb`;
- **no-pause** arm (`--param restMs=0 --param pauseMs=0 --param settle=no`): `6b3617f860f8`.

Each still stroke ends with a 150 ms hold, so even with pauseMs 0 the gap between strokes is about 190 ms plus the WDA step overhead. flinglog's scroll-event stamps decide which runs really had no 300 ms gap.

```sh
node tools/iphone.mjs gesture fixes/fwreskip/tools/fling-band-v2.json --owner <runner> --label G1b-<arm><n> --inject fixes/fwreskip/tools/flinglog.mjs [--param restMs=0 --param pauseMs=0 --param settle=no]
```

**`flinglog.mjs` v3** (in-page only, no layout reads, the same in both arms):
- `flips`: the MutationObserver log of the hero's and `#people`'s render attribute, as in v1/v2: [t, scrollY, h|p, value];
- `scroll` (new, review-fwreskip-3 #4): the `timeStamp` of every scroll event, from a passive listener that reads nothing. A P2 idle un-skip must come ≥ 300 ms after the last scroll event before it; an `active` flip less than 300 ms after one is an `iE`/`cE` un-skip, not the timer. Whether WebKit on iOS keeps sending scroll events through a momentum fling is UNRESOLVED (no reference checked); these stamps show it for our runs;
- `io` (new, for T-018): an IntersectionObserver (viewport, no margin) on the hero track and `#people`: [entry time, h|p, intersecting 0/1, render attribute at the callback];
- `flash`: the magenta flash 3 s after install, held ≥ 3 rAFs and ≥ 50 ms, as in v2. With no recording it is only an in-page run marker: `flash` = [t0, tEnd, rAFs] must be present.
Sim functional check of v3: hold v26 (section "P2").

**Blocks.** Two blocks, one per gesture arm, each with a warm-up per port, sentinels as in G1, and **C V V C C V V C** = B P2b P2b B B P2b P2b B (8 runs, 4 per arm), with the frame log and flinglog for every run:
1. **rest** arm (pause in band);
2. **no-pause** arm.

Expected time: about 15 min per block (2 warm-ups, 2 sentinels and 8 counted runs at about 1 min each, with the reload, the 6 s idle, the descent, the rest and the fling). Add the cooling between blocks (`phone-temp --below auto`, at most 10 min), so about 40 min for both. Void runs add about 1 min each.

**Phone rules for this ticket** (current as of main 2c36b62 and T-018; `research/management/ops-handover.md`):
- **No recordings, no camera** (user T-018). Nothing in this ticket needs one.
- **User steps first** (user T-017). A posted console step the user waits on takes the phone next, ahead of G1b, even mid-queue. G1b yields at a run boundary and never gates such a step on cooling or a quiet hold. The F fallback (G1's, run with flinglog v3 and the frame log and no recording; reading 3 decides, the user's eye is a note) is itself a user step: post it only when the phone is free for it, and while it runs ack every change with a plain one-line `--message` (what is happening, ETA).
- **Quiet hold: preferred, not blocking.** Run each block in the lead's Mac-quiet form when one is available: `lock.mjs wait chrome-measure --until idle --for 60`, then `lock.mjs run chrome-measure --owner <runner> --no-timing --max-seconds 600 -- <part>`, requeued between parts. The phone renders by itself, but WDA's step timing (the pauses that decide pause/no-pause) runs on the Mac. If no quiet hold comes, run anyway and log load1 at each run's start and end.
- **Cooling** between the two blocks, and after a failing sentinel: `node tools/wait.mjs phone-temp --below auto` (at most 10 min), never a fixed wait.
- **Waits:** set the board row first (`status.mjs set … --state waiting --waiting-on …`, user T-016).
- **Order:** after PR-001 block B (phone order at the top of this ticket).

**Run validity.** The gesture must reach y ≥ 3250, WDA must play the stroke, and flinglog's `flash` must be present (the page's rAF loop ran). Also:
- **Stroke-fidelity gate** (lead decision, registered before any phone data; `research/management/ops-handover.md`): a G run is **void** when any stroke's contact time is more than ±10 % off plan (symmetric), judged from the gesture's frame log. This matters here more than usual: the pause/no-pause reading depends on WDA's timing. A block that voids runs at +10-20 % keeps the rule; changing it needs a new registration before the next block.
- **Void in either arm** when the `fling` mark's y is past the phone's crossing of `#people`'s own far edge (the pair is released there, so P2's paired state cannot exist; review-fwreskip-3 #6). Such a run is void, not a falsifier.
- B's `#people` must be `active` at the `fling` mark;
- in the rest arm, P2b's `#people` must be `active` by the `fling` mark (flinglog: an `active` flip after the pair re-skip, before the mark). A valid run where it is not counts as a falsifier of P-060 (b), not as void;
- in the no-pause arm, a P2b run whose `#people` was already `active` at the mark had a ≥ 300 ms gap anyway (check `scroll`). Report it, and judge it with the rest arm.

**Thresholds** (phone, CLAUDE.md "Frame thresholds"): every frame count is given at > 50 ms and > 34 ms, with the ±4 ms twins (> 46 / > 54 for > 50; > 30 / > 38 for > 34). Frames in the near bands (30, 38] and (46, 54] ms are flagged. A verdict is **threshold-sensitive** when it changes under either twin. A **long frame** is a frame > B's block max + 17 ms, where B's block max is the longest frame from `fling` to `end` over the block's valid B runs (P-060 falsifier a); its twins are B max + 13 and + 21 ms.

**Readings, per run.**
1. The longest frame from `fling` to `end`, and the frame at `#people`'s crossing (the flinglog flip in P2b; the same crossing in B, by threshold, not raw y).
2. Rest arm, the idle un-skip: the frame that holds P2b's `active` flip (flinglog time), and
   - where it fell: in a **descent pause** (scroll events resume before the `fling` mark) or in the **rest** (the next scroll event is the fling);
   - its gap since the last scroll event (≥ 300 ms expected) and its offset to the next stroke start (the first scroll event after the flip);
   - B's frame at the **same stroke-relative offset**: the same stroke (counted from the `descend` mark by scroll-event gaps) and the same offset to the next stroke start.
   With no recording, a stall of an on-screen animation is seen only as this frame's dt. A compositor-driven animation that keeps running while the main thread stalls is not visible to G1b (not read).
3. FAIL, main-thread half: from `flips` and `io`, any span in which the hero or `#people` intersects the viewport while its render attribute is `deferred` (in a P2b run, with no such span in any B run of the block). The UI-process half (the compositor scrolling ahead of the main thread into skipped content, open item iv) cannot be seen without a recording.

**Decision** (P-060 falsifiers; tightened before data):
- **P2b replaces P** as the landing candidate only if both hold:
  - no valid rest-arm P2b run has a long frame at the `#people` crossing, and
  - the number of P2b idle un-skip frames > 50 ms (over the 4 rest-arm runs) is ≤ the number of B frames > 50 ms at the matching moment (reading 2, over the 4 B runs).
- If the second condition fails (P2b has more > 50 ms frames at the un-skip than B at the same moment), the cost has moved from the fling to the pause. That trade goes to the user with the numbers.
- Either verdict carries the threshold-sensitive label when a twin changes it.
- Any main-thread FAIL (reading 3) means back to design, as in G1.
- The no-pause arm only records the case P2b does not cover.
- This replaces the rev 1 rule ("idle un-skip frame ≤ 50 ms in at least 2 of 4 runs"), which accepted two new > 50 ms frames although the goal is dt > 50 target 0.

**What T-018 costs this ticket** (no recordings, decided before data):
- The decision rows above (long frame at the crossing, the idle un-skip frame vs B, the twins) come from the frame log and flinglog. They are unchanged.
- The FAIL rule is weaker: G1b sees only its main-thread half (reading 3). The question behind open item (iv), whether the UI process shows a skipped `#people` ahead of the main thread during a fast fling, is no longer checked by G1b. For it, fwreskip rests on G1 block 1 (recorded before T-018: no FAIL, n=1 valid B, OBSERVED); the user's eye in an F run is supporting only (a note, not a verdict). **The G1b result and any land request state this word for word (lead): the UI-process half of the FAIL rule is "not checked on the phone since T-018".**
- The rev 1 "does an on-screen animation stall" reading is dropped; only the frame's dt remains.
- The calibration-frame void rule is gone with the recording. The `flash` record replaces it as a run check.

### G1b result, rest arm (restMs 2000)

Run by iphone-runner on 2026-10-02, ticket be4c331, scored here (scratchpad scripts `g1bscore.py` / `g1bcross.py`; run JSON in iphone-runner's `out/g1b/rest/`, not committed).
- Setup: G driver, `fling-band-v2.json` (hash e30bd43a60eb), snapshot `snap-g1b2` (hashes checked), no recordings, frame log + flinglog v3.
- Block order: B P2b P2b B B P2b P2b B.
- Sentinels PASS: 60.2/57.9 at the start, 60.0/58.1 at the end. Battery 37.9 → 40.3 °C.
- Mac load1 at run start was 41.8 / 24.0 / 14.8 / 9.3 for runs 1-4 and 5.9-6.6 for runs 5-8; each record keeps `meta.mac`. The phone stamps its own frames, and the un-skip frames below show no load pattern (55 at load 24, 45 at 14.8, 54 and 46 at ~6).

**Validity.** All 8 counted runs are valid.
- Stroke gate: within ±10 % in all 8 (worst +9.0 %). The uncounted B warm-up was +10.5 %.
- Every run reached y ≥ 3250, the `flash` record is present, and there are no errors.
- `fling` mark y is 3264-3286. That is before `#people`'s own far edge (≈3539): B never defers `#people` in the block, and P2b's pair is not released before the fling.
- (b) holds: P2b's `#people` flips `active` before the mark in 4 of 4 runs.

| reading | B (4 runs) | P2b (4 runs) |
|---|---|---|
| 1. longest frame `fling`→`end` (ms) | 48, 60, 59, 49 (the 60 and 59 at y ≈3155, the fling's start); block max 60 | 48, 49, 48, 47 |
| 1. frame at `#people`'s crossing (max of the 3 frames after the post-fling `p` flip, y ≈2900-2970) | 48, 48, 47, 49 | 48, 49, 48, 46 |
| 2. idle un-skip frame (the frame whose gap holds the flip) | 17, 17-18, 18, 17-18 at the same offset before the fling's first scroll event | **55, 45, 54, 46** |
| 2. where it fell | | **at the start of the rest** in 4 of 4 runs: 301 ms after the last descent scroll event, 3.55-3.62 s before the fling's first scroll event; page still (y constant) |
| 3. main-thread FAIL (hero or `#people` intersecting while `deferred`) | none | none |

- **Long frame** threshold: > B max + 17 = 77 ms (twins 73 / 81). No P2b frame from `fling` to `end` comes near it, at the crossing or anywhere. P's 65-92 ms crossing frame from G1 is gone, and P2b's crossing frame equals B's (46-49 vs 47-49 ms).
- **Idle un-skip vs B:**
  - frames > 50 ms: P2b 2 of 4 (55, 54), B 0 of 4;
  - twins: > 46: 2 vs 0; > 54: 1 vs 0;
  - > 34 (twins > 30 / > 38): 4 of 4 vs 0;
  - near-band flag: 54 ms is in (46, 54].
- **The ticket's placement guess was wrong:** it expected the un-skip mostly between descent strokes. The pair forms during the last descent stroke (`p` `deferred` at y ≈3060-3080), so the 300 ms timer fires in the rest, as P-060's original "with the page at rest" said.

**Decision (rule registered before data).**
- Condition 1 holds: there is no long frame at the crossing.
- Condition 2 fails: 2 > 50 ms un-skip frames against 0 for B. The verdict is the same at > 46 and > 54, so it is **not threshold-sensitive**.
- So the rule's outcome is: **the cost has moved from the fling to the pause, and that trade goes to the user with the numbers.**
  - P2b removes the 65-92 ms fling frame.
  - In exchange it adds one 45-55 ms frame about 0.3 s after the user stops in the band. The page is not scrolling then, so what stalls is only what animates on screen at that moment.
  - G1b cannot see that stall without a recording.
- Reading 3 found no main-thread FAIL. The UI-process half of the FAIL rule is "not checked on the phone since T-018".
- P-060 rest-arm items: flip before the mark 4/4 (hit); no long fling frame (hit); un-skip frame ≥ 34 ms in ≥ 2 of 4 and > 50 ms in ≥ 1 of 4 with B ≤ 34 (hit); falsifier (c) (> 50 ms in 3-4 of 4) not triggered at 2 of 4.

### G1b result, no-pause arm

Run by iphone-runner on 2026-10-02 after the rest arm (same ticket, script and snapshot), scored here with the same scripts.
- **Validity.** All 8 counted runs are valid. Stroke gate after re-runs: worst +5.0 to +10.0 % (runs 4 B and 7 P2b sit exactly at the +10.0 % edge). Fling mark y 3268-3286.
- **The idle un-skip still fired in 4 of 4 P2b runs.**
  - It fired 300-301 ms after the last descent scroll event, 872-957 ms before the fling's first scroll event.
  - The WDA fling's first scroll event comes about 800 ms after its mark (OBSERVED, in our setup), so a gap of more than 300 ms is always there. "No pause" can't be reached with the G driver.

| reading | B (4 runs) | P2b (4 runs) |
|---|---|---|
| 1. longest frame `fling`→`end` (ms) | 52, 53, 48, 52 | 52, 56, 53, 50 (several maxima at y 0, the fling reaching the top) |
| 1. frame at `#people`'s crossing | 46-48 | 47-50 |
| 2. idle un-skip frame | 15-18 at the same offset | **54, 44, 51, 54** |
| 3. main-thread FAIL | none | none |

- No long frame (> 77 ms) in either arm. The fling frames are 42-50 ms in both arms, B too, around the hero's un-skip.
- **Idle un-skip vs B:**
  - > 50: 3 of 4 vs 0. Twins: > 46: 3 of 4 vs 0; **> 54: 0 of 4 vs 0**. The > 50 count is threshold-sensitive in this arm.
  - > 34: 4 of 4 vs 0.
  - Near-band flags: 51 and 54.
- **Both arms together (8 P2b runs):** un-skip frame > 50 in 5 of 8 (55, 54; 54, 51, 54), > 54 in 1 of 8, > 34 in 8 of 8. B: 0 of 8 at every threshold.
- **Decision** (same rule as the rest arm): condition 1 holds and condition 2 fails. The cost moved from the fling to the pause. The UI-process half of the FAIL rule is "not checked on the phone since T-018".
- P-060 no-pause items: the ticket expected the un-skip to fall inside the fling here. It did not, because of the WDA fling's start delay. That item can't be tested with the G driver; only a finger (F) run could.

### Variant search after G1b: keep the fling fix, lose the idle frame (Sim only, attribution)

The lead asked for this on 2026-10-02 after G1b, Simulator only, no new phone timing. Each hold is a Sim T run with a pause in the band (`TDOWN=3100 TUP=2500 TDOWN2=3100`), 2 holds per arm. B = RB; Q = the exact P2b build G1b ran (`snap-g1b2/P2b`); P = the variant. Window: 200 ms from the `#people` flip (`flipwin.py`).

| hold | variant | P2b (Q) rAF max dt | variant rAF max dt | what happened |
|---|---|---|---|---|
| v31 | P3: every profile panel `content-visibility: hidden`, `#people` un-skips, then one panel revealed per frame (active first) | 30 / 33 | 35 / 45 | The composite did spread (19, 12, 6, 7, 6, 7 ms), but each reveal cost one full ~18 ms layout (the same size as any layout on this page). Worse; dropped. |
| v32 | P4: `#people` un-skips under an inline `visibility: hidden`, unhidden 2 frames later | 35 / 33 | 31 / 33 | The ~26 ms composite still follows the un-skip's layout (P2b 30 / 27); the unhide frame is cheap (Composite 7.6). No split; dropped. |

- B at the same offset: 17 / 17 in both holds.
- **OBSERVED, in our setup, cause unknown:** the composite after the un-skip does not come from painting `#people`'s content (P4 hides it and the composite stays). Layer creation is a guess, not checked.
- **Probe effect found:** in every Sim T hold so far, the un-skip's Layout ran inside the 300 ms timer, not in the next rendering update. The reason is the probe's MutationObserver: it reads `scrollY` in the task that flipped the attribute, and that read lays the page out. So the Sim has always shown the layout and the composite in two frames (25-30, then 30-35), while the phone (no such read) shows one 45-55 ms frame. `vfix.mjs` now has `MOY=0` (no `scrollY` read in the observer) for the next hold.
- Next candidate, P5: P2b plus one forced read (`offsetHeight`) right after the un-skip in the timer. The layout then runs in the timer task, and only the composite is left for the rendering update. The lead approved one Sim T hold, B / Q / P5, with `MOY=0`.
- Moving the un-skip into a scroll step does not help: in the descent it puts back the cost fwreskip removes, and in the fling it is rev 2.1 (65-92 ms on the phone). A longer idle delay only moves the same frame.

**P5 split criterion, registered 2026-10-02 before the hold.**
- All numbers come from the `MOY=0` hold. That changes the probe, so they don't compare with any earlier Sim hold (v1-v32).
- Window: 200 ms from the `#people` `active` flip, per hold (2 holds per arm), read with `flipwin.py` and `flipdetail.py`.
- **Precondition (the Sim reproduces the phone's one frame).** In both Q holds, the un-skip's Layout (≥ 10 ms) runs inside a RenderingFrame, not inside the TimerFire. The same frame also holds a Composite of ≥ 10 ms.
  - If that fails, the check is **inconclusive**: the Sim can't show the difference P5 aims at. P5 then goes to the phone only by the lead's call.
- **P5 splits** when, in both P5 holds:
  - (a) the un-skip's Layout (≥ 10 ms) runs inside the TimerFire, and the following Composite (≥ 10 ms) runs in a later RenderingFrame;
  - (b) P5's rAF max dt is at least 8 ms below the Q hold's max dt in the same hold order.
- **P5 does not split** when (a) or (b) fails in either hold.
- **Control:** B's rAF max dt in the window is ≤ 20 ms. Otherwise the hold is void, and I re-run once.
- The criterion says nothing about the phone. A split on the Sim only earns P5 a phone block.

**P5 result, hold v33** (2026-10-02 11:16-11:19Z, `MOY=0`; not comparable with v1-v32). B `dbd5fdb4f1fb`, Q = P2b `b4ff6ec56cc2`, P = P5 `d52aa7b70366`; then S / U for P2-1, below. **Verdict: P5 does not split** — (b) fails in both holds.

| hold | Q (P2b): where the un-skip Layout ran; frames | P5: where the Layout ran; frames | (a) | (b) Q max − P5 max ≥ 8 |
|---|---|---|---|---|
| 1 | Layout 21.2 inside a 52.7 ms RenderingFrame, which also holds Composite 27.7; rAF dt 25, 33 | Layout 29.5 inside the TimerFire (32.8), Composite 28.8 after it; rAF dt 36, 35 | yes | 33 − 36 = −3: **no** |
| 2 | Layout 24.3 inside a 41.7 ms RenderingFrame with Composite 26.7, then Composite 26.1; rAF dt 28, 31 | Layout 24.5 inside the TimerFire (26.6), Composite 22.6 in the next RenderingFrame; rAF dt 28, 29 | yes | 31 − 29 = 2: **no** |

- Precondition holds: without the probe's read, P2b's layout and composite share one RenderingFrame in both holds. So the earlier Sim holds' split was the probe's doing, as suspected.
- Control: B max dt 17 / 17. Valid.
- P5 did what it was built to do: the layout moved into the timer task. The main thread still loses the same ~50 ms in a row, though: about 25 ms of layout and then 25-29 ms of composite, back to back. On the Sim, the rAF gaps come out the same (two 28-36 ms gaps in both builds). OBSERVED, in our setup. That P5 would split the phone's 45-55 ms frame into two shorter ones is not supported, so it gets no phone block (lead, 2026-10-02).
- Weakness of the criterion, noted after the fact and changing nothing: the Sim's rAF stamps spread even P2b's single 52.7 ms RenderingFrame over two gaps (25 + 33), so (b) compares two-gap pairs in both builds. The RenderingFrame durations say the same thing: P2b 52.7 / 41.7 + 26, P5 50.1 + 28.8 / 26.6 + 25.1.

**P2-1 Sim structure on st6-rb, hold v33** (S = st6-rb `59b23b3f57fd`, U = st6-rb + P5 `e15d3d7d3c52`; `MOY=0`). Sim structure only; it does not replace P2-1 on the phone.
- First descent, Layouts ≥ 3 ms at the hero end: S 20.0 at 2987 and 20.2 at 3033 (the hero's far re-skip and the `data-fw-wc` flip); U none there. On st6-rb, fwreskip removes the same two ~20 ms Sim layouts as on RB.
- Idle un-skip on st6-rb (U): Layout 20.6 / 21.4 (in the timer, P5) plus Composite 28.2 / 29.4; rAF dt 23, 33 / 24, 34. S at the same offset: 17 / 17. st6's avatar layers make the un-skip neither cheaper nor dearer than on RB (P5 on RB: Composite 28.8 / 22.6).

### P2-1 preview: the descent side in G1b's own runs (phone, G driver, RB, read after the fact)

G1b was not designed for this: its descent is WDA strokes of 150 px, each with a hold and a pause, not the W driver's steps. It does pass the hero end in all 16 runs, though, so its frame logs show what fwreskip's gain side looks like on the phone. Not registered before data; it is a preview only (scratchpad `g1bdesc.py`).
- **The hero's far re-skip** (flinglog `h` `deferred`, phone y 3081-3112): the longest frame within -50 to +250 ms of it is
  - B 29, 30, 30, 29 (rest) and 25, 29, 29, 29 (no-pause);
  - P2b 29, 25, 25, 25 and 30, 29, 33, 29.
  - P2b re-skips `#people` 3-5 ms after the hero, as designed.
- **Descent frames in y 2850-3300** (descend mark to the last descent scroll event + 100 ms, so the idle un-skip is excluded):
  - max: B 37, 60, 34, 34 / 38, 36, 33, 46; P2b 34, 42, 33, 58 / 38, 46, 34, 37;
  - > 50: B 1 of 8 runs, P2b 1 of 8; > 34: B 9 frames, P2b 7.
  - The top frames sit at y≈3260-3286, ~280-380 ms after the flip, in both arms (the end of the last stroke), not at the flip.
- So, **OBSERVED** (n=8 per arm, G driver, cause unknown): the ~20 ms Sim layout that fwreskip removes at the hero end does not show as a longer frame on the phone with this driver. B's frame at the flip is already 25-30 ms.
- What this does not cover: the W driver (scripted steps), where the hero-end lag was first described, and RB + st6-rb. Both are P2-1's job on the phone.

### Phone ticket G2: P2-1, the descent gain (pre-data; approved by the lead at second read with the gain-threshold amendment below, 2026-10-02; prediction P-064)

Owner of the run: `iphone-runner`. Phone order: right after T-009. The ioscap user step goes first if it unblocks earlier (I-064). P5 did not split on the Sim (v33), so this ticket has one part, and V is S6P2b. The lead's order (2026-10-02): the user sees no proposal until both sides of the trade have phone numbers. P2-1 decides alone.

**Question.** On the phone, with the W driver, does fwreskip shorten the frames where the descent passes the hero end? And is that gain big enough to pay for its idle un-skip cost?

**Builds** (immutable, `out/fwreskip/snap-p21/`; built by patching st6-rb's JS with fwreskip's diff against RB; st6's change sits at JS 11483-11694, far from fwreskip's 2660-2900):

| arm | build | JS / CSS sha256 (first 12) |
|---|---|---|
| C | S6 = RB + st6-rb (PR-003 A, on main) | `59b23b3f57fd` / `d22542d0b5f8` |
| V | S6P2b = S6 + fwreskip P2b (P5 did not split, v33) | `ad7f029e43c6` / `d22542d0b5f8` |

**Driver W**, the same command in both arms:
```sh
node tools/iphone.mjs run --driver window --probe std --from 2600 --to 3400 --idle 3 --hold 3 --owner <runner> --label G2-p21-<n><arm> --arm <C|V> --block G2-1
```
- The window starts below the hero's far edge and ends before `#people`'s own far edge. Phone y: hero re-skip ≈3080-3110 in G1b; `#people`'s far edge ≈3540 Sim, so ≈3620 phone.
- The 3 s hold at 3400 is where V's idle un-skip fires, 300 ms after the last scroll event. So one run measures both sides of the trade.

**Block:** warm-up per port, sentinels (bottom ≥ 58 / scroll ≥ 44), then C V V C C V V C (4 runs per arm). Phone rules as in G1b: no recordings (T-018), user steps first, quiet hold preferred, `phone-temp` cooling, waits on the board.

**Readings, per run** (frames from the std probe's rAF log; phone thresholds > 50 and > 34 with twins > 46 / > 54 and > 30 / > 38; near bands flagged):
1. **Band:** frames during the scroll whose y is in [2950, 3250]. This holds the hero's far re-skip and the platform card's `data-fw-wc` flip, by crossing, at Chrome-to-phone offset ≈ +77-100. Report the max dt and the counts.
2. **Hold:** frames during the hold (the scroll's end + 3 s). Report the max dt, the counts, and the time of the longest frame from the scroll's end. V's idle un-skip is expected at ≈ +300 ms.
3. **Rest of the window** (y < 2950 and y > 3250 in the scroll): counts only, as a check that the arms differ only at the band.

**Decision rule** (registered before data; sums over the 4 C and the 4 V runs; "frames" = frames > the threshold):
Amended 2026-10-02 at the lead's second read, before any data: the gain line is now 2 frames, because one frame over 4 runs is noise. Verdicts are checked in this order: Gain → Mixed → No gain.
- **Gain, A recommended:** both of these must hold.
  - (i) V's > 50 count in band + hold is **at least 2 lower** than C's.
  - (ii) V's > 34 count in band + hold ≤ C's.
  - This is the size of gain that buys the idle cost: after paying for the frames V adds in the hold, the band gain must still leave V at least 2 frames > 50 ahead of C. G1b's idle frame was > 50 in 5 of 8 runs.
- **Mixed, (B) still recommended, trade shown to the user:** V's band alone has at least 2 fewer > 50 frames than C's band, but the hold's added frames cancel the gain, so (i) or (ii) fails.
- **No gain, recommend (B), drop fwreskip:** anything that is neither Gain nor Mixed, including V being worse. A one-frame difference over 4 runs is inside run-to-run noise (G1b: B's own band counts spread 0-2 per run). The 45-55 ms idle frame then buys nothing.
- **Threshold-sensitive** when a twin changes the verdict. A twin that moves the verdict across the Gain line (> 46 or > 54 for (i), > 30 or > 38 for (ii)) makes it threshold-sensitive, and **threshold-sensitive counts as not Gain**. **Void run** as in G1b: sentinel failures, a run that doesn't reach 3400, and the stroke gate where it applies (W has no strokes, so it doesn't apply here).
- The UI-process half of the FAIL rule is "not checked on the phone since T-018". Main-thread FAIL is not read in this part: the W driver has no flinglog.

**Prediction P-064** (`fixes/PREDICTIONS.md`): no gain. In C, the band max ≤ 38 ms in ≥ 3 of 4 runs, and the band > 50 count is 0-1 in each arm. V's hold has ≥ 1 frame > 34 in ≥ 3 of 4 runs (G1b: 8 of 8). Based on: the G1b descent preview above, G driver, n=8 per arm, B 25-30 ms at the flip. Falsified if C's band shows ≥ 2 frames > 50 over 4 runs that V does not have.

### G2 on hold; Sim S vs T on st6-rb (hold v34); the case for (B) without G2

**G2 is on hold.** The user disconnected the iPhone (T-022, 2026-10-02 11:53Z) before any G2 run: no servers, no runs, no data. The lead's plan without the phone:
1. Run one Sim session on st6-rb, S6 vs S6P2b, counts only.
2. If S's band shows no layout beyond the two that RB has, propose A/B/C to the user with (B) recommended.
3. Both sides of the trade are then G1b's (RB, G driver), plus Sim counts on st6-rb. P-064 is marked "not run" if the user drops fwreskip.

**Hold v34** (2026-10-02 11:58-12:00Z, shared lane, one Sim boot, `MOY=0`; Sim ms are attribution only):
- Arms: S = S6 `59b23b3f57fd` and T = S6P2b `ad7f029e43c6`, CSS `d22542d0b5f8` for both. Hashes were checked from the served files.
- Mode T, `TDOWN=3400 THOLD=3000 TUP=2500 TDOWN2=3100`, order S T T S.
- Scorer: scratchpad `v34score.py`, together with vfix's own Layout list.

| run | band layouts ≥ 3 ms (y 2950-3250, both descents) | hold layouts ≥ 3 ms (+ Composite ≥ 15 ms) | Sim rAF max in the first descent's band |
|---|---|---|---|
| S1 | 20.5 @ 2999 (d), 20.6 @ 3004 (D) | none | 35 |
| S2 | 19.5 @ 2988, 20.0 @ 3041 (d); 20.0 @ 2988, 19.8 @ 3021 (D) | 20.1 @ 3207 after D (the second descent overshot past the band end) | 34 |
| T1 | none | 20.9 @ 3431 + Composite 28.7, 18.9; 20.5 @ 3181 | 17 |
| T2 | none (first descent invalid: Safari restored y 3181 on the reload, so the descent started inside the band) | 22.3 @ 3429 + Composite 21.2; 21.5 @ 3183 | (n/a) |

- **Same structure as RB (v33 S/U, and the earlier RB holds):**
  - S has the hero's far re-skip and the `data-fw-wc` flip, about 20 ms each, at y ≈ 2990-3040 on every descent.
  - T has none there.
  - T moves that work to the idle un-skip in every hold: about 21 ms of layout plus a 19-29 ms composite.
  - **There is no layout in S's band beyond the two RB has.** st6-rb neither adds band work nor makes the un-skip cheaper.
- **OBSERVED, in our setup:** the same ~20 ms Sim layout on RB did not show as a longer phone frame in G1b's descents. The frame at the flip was B 25-30 ms vs P2b 25-33 ms, with > 50 in 1 of 8 runs in both arms. What the phone showed on RB is therefore the best evidence available, for both sides of the trade.
- **What the G1b + v34 basis does not cover:**
  - the W driver's scripted descent on the phone;
  - st6-rb on the phone;
  - a finger (F) run;
  - the UI-process half of the FAIL rule, which is "not checked on the phone since T-018".

  G2 (P-064) and an F run would cover the first three. They are optional confirmation once the phone is back.

**User decision on PR-005 (2026-10-02 15:11Z): C, park and re-test** (no notes; (B) was recommended).
- fwreskip stays unlanded and parked.
- When the phone is back, G2 runs as ticketed above (P-064 stays open, pre-data), and an optional finger A/B may follow.
- The result comes back to the user as A or B.

### G2 result (phone, W driver, 2026-10-02/03): No gain, so (B)

Run by `iphone-runner` as ticketed: block G2-1, C = S6 `59b23b3f57fd`, V = S6P2b `ad7f029e43c6`, CSS `d22542d0b5f8`, one warm-up per port, then C V V C C V V C. Scorer: scratchpad `g2score.py`. It skips warm-ups and sentinels. Band = scroll frames whose y range touches [2950, 3250]. Hold = frames inside the hold mark. Rest = the other scroll frames.

| run | band n / max ms | band > 50 / > 34 (twins > 46, > 54, > 30, > 38) | hold max ms (@ ms after scroll end) | hold > 50 / > 34 | rest > 50 / > 34 | control sentinel bottom / scroll | load1 at start |
|---|---|---|---|---|---|---|---|
| 1C | 22 / 30 | 0 / 0 (0 0 0 0) | 25 (@31) | 0 / 0 | 0 / 1 | 59.0 / 59.8 | 25.9 (LOAD > 8) |
| 2V | 20 / 25 | 0 / 0 (0 0 0 0) | 23 (@1153) | 0 / 0 | 0 / 2 | - | 15.9 (LOAD > 8) |
| 3V | 22 / 21 | 0 / 0 (0 0 0 0) | 24 (@1164) | 0 / 0 | 0 / 1 | - | 11.1 (LOAD > 8) |
| 4C | 21 / 28 | 0 / 0 (0 0 0 0) | 22 (@1180) | 0 / 0 | 0 / 1 | 59.3 / 59.2 | 7.8 |
| 5C | 22 / 30 | 0 / 0 (0 0 0 0) | 26 (@29) | 0 / 0 | 0 / 1 | 59.0 / 59.8 | 5.7 |
| 6V | 23 / 29 | 0 / 0 (0 0 0 0) | 25 (@19) | 0 / 0 | 0 / 1 | - | 4.6 |
| 7V | 23 / 29 | 0 / 0 (0 0 0 0) | 25 (@1152) | 0 / 0 | 0 / 1 | - | 4.2 |
| 8C | 21 / 30 | 0 / 0 (0 0 0 0) | 25 (@1166) | 0 / 0 | 0 / 1 | 59.0 / 60.2 | 10.5 (LOAD > 8) |

- **Sums, band + hold:** > 50 is C 0 vs V 0, and > 34 is C 0 vs V 0. Every twin is 0 in both arms, and no frame falls in a near band.
  - (i) fails: V is not 2 lower.
  - V's band alone is not 2 lower either, so the result is not Mixed.
  - No twin crosses the Gain line, so the result is not threshold-sensitive.
  - **Verdict: No gain → (B), drop fwreskip.**
- **Validity:**
  - All 8 counted runs are valid. Every C run passed the sentinel. Both heat checks passed: block start 60.2 / 58.2, block end 60.2 / 57.9.
  - rAF 59 Hz. Low Power Mode off. Battery 36.6 → 38.0 °C.
  - Runs 1-3 and 8 started at load1 > 8. They are flagged, not void: each ran in its own exclusive hold, and their counts match runs 4-7.
  - A first attempt was voided whole by the Wi-Fi/LAN change (T-026). It is not used here.
  - No Timeline was recorded and nothing was recorded on screen (T-018).
- **P-064:**
  - C band max ≤ 38 ms in ≥ 3 of 4 runs: **hit**, 4 of 4 (30, 28, 30, 30).
  - Band > 50 at 0-1 per arm: **hit**, 0 and 0.
  - V hold ≥ 1 frame > 34 in ≥ 3 of 4 runs: **miss**, 0 of 4.
  - Falsifier (C band ≥ 2 frames > 50 that V lacks): not triggered.
- **Why the hold item missed (OBSERVED from the run's crossings, in our setup):**
  - The W driver overshot `--to 3400` and held at yHold 3595-3599. That is past `#people`'s own far edge: C's `#people` render-deferred crossing is at y 3539-3552.
  - In V, the hero and `#people` defer together at y 2994-3006, and `#people` is still past its far edge in the hold. So nothing gave V's idle un-skip work, and the 44-55 ms frame G1b saw never came.
  - G2 therefore measured the gain side only. That is a gap in my ticket: I did not foresee the overshoot. The cost side still rests on G1b (RB, G driver: the un-skip frame was 44-55 ms, > 50 in 5 of 8 runs).
  - The verdict does not depend on the hold. With no band gain, V cannot reach Gain or Mixed whatever its hold costs.
- **What G2 adds to G1b + v34:**
  - On the phone, with the W driver, on st6-rb, the descent past the hero's end is already short in C: band max 28-30 ms and nothing > 34. fwreskip has no long frame there to remove.
  - This matches the Sim (v34: about 20 ms Sim layouts in S's band) and G1b (B 25-30 ms at the flip).
- Main-thread FAIL is not read: W has no flinglog. The UI-process half of the FAIL rule is "not checked on the phone since T-018".
- **Answer to the user's option C (park and re-test): B.** fwreskip stays unlanded and is dropped. Its README, patch and Sim/phone data stay as the record.

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
