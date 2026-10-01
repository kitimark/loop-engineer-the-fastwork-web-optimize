# Fix: layout-containment

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). The builds' CSS/JS stay in gitignored overlays and scratchpad snapshots; never push.

**Status:** P11 done. lc-cq3 / aw1-cq3 gives no gain: the nested Layout is removed but its cost stays in the same frame (P-028 MISS on ms, see "P11 Block A result"). P14 done (see "P14 result"). The rotator's whole-view tick Layout (C 67/67, median
20.6 ms) is gone with st4-noswap (2/67, idle long frames 0), so the escape is the swap path. re-contain-js re-roots
it at #people but keeps 57 % of the cost (P-025: V1 HIT, V2 root HIT, cost MISS). Next: an st5 candidate (proposal).
**Stage:** R + I closed. The P11 phone pass is done (Block A; Block B skipped). D for the rotator question rests on the P14 boundary block (below).
**Device class / gate:** phone-only (Chrome shows no full layouts and no style-nested layout, see the census) → phone Timeline attribution, then phone ABBA
**Driver(s) behind the claims:** none yet (Chrome census/parity are mechanism checks, not timing)
**Prediction:** `fixes/PREDICTIONS.md` P-028 (U3, lc-cq3 / aw1-cq3), P-025 is de-pm-hero's (ST-4, builds here)
**Topic:** arch-lead's P11 (R-U2 + R-U3), `research/architecture/unknowns-actions.md` §3.3; `research/design-engineering/unknowns-render.md` U2, U3; F-052. ST-4 (F-058, `postmortem-hero.md` §7) rides in the same phone pass.
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` only (lc-cq2, lc-cq3, st4-strict); `/_app/immutable/nodes/2.DyWL8TcE.js` only for st4-rotoff (diagnostic)

## Why it lags (hypothesis, from U2/U3)

- U2: every phone layout during the scroll is a full 12-17 ms layout of the 430x775 RenderView; no layouts between 1 and 10 ms.
- U3 (WebKit source): a style pass that reaches an element with size containment (`container-type: inline-size|size`)
  skips its descendants and sets `m_needsInterleavedLayout`; `Document::resolveStyle` then runs a full
  `interleavedLayout()` *inside* RecalculateStyles. Phone Timeline: Layout nested in RecalculateStyles 20.8 / 26.6 /
  24.4 ms in the rebuild frames (tc1 y≈1957, tc2 y≈1977, ta1 y≈2678), followed by another 15.9 ms Layout in Composite (ta1).
- Open: is the nested layout *extra* (the frame lays out twice) or only *moved* (one layout either way)?

## Cards (protocol v2)

### R: census card

```
CENSUS layout-containment · base lc-base = mw10e-arm-load JS c6a3ac9256ea + aw1-10e CSS c6aad94b455f · 2026-10-01
phone: none in this stage (the phone is with the user); the U2/U3 phone evidence is de-unknowns-render's tc1/tc2/ta1
chrome: census probe at 430x932 and 430x775, short lane 11:26:40-11:27:41Z, load 6.7-6.1, CPU 1x, counts only
  raw: <scratchpad>/layout-containment/census-1826/census.json (probe census.mjs, wrapper census.sh)
```

Size containers on the page (computed `container-type` ≠ normal), 430 px, identical at load+2 s, load+6 s and at
every container's own scroll position:

| # | container | type | rendered at ≤600 px | content box (cq basis) | cq dependents (CSS line, aw1-10e) | equal calc at ≤ its width |
|---|---|---|---|---|---|---|
| 10 | `.orbit` cards (desktop orbit, 8 + 2 `.float`) | inline-size | no: `.orbit{display:none}` at ≤600 (CSS 2041) | – | `--orbit-u: calc(100cqw / 302)` (1575) → avatar/online/profile sizes, borders, padding, font-size, line-height (1672-1722) | not needed at ≤600 (not rendered); desktop keeps the container |
| 4 | `.mobile-deck` slot cards `.is-a/.is-d` / `.is-b` / `.is-e` | inline-size | yes, hero y 535-900 | 118 / 158.906 / 158.625 px (border-box 120 / 160.92→160.906 LayoutUnit / 160.625 minus 2 px border) | same `--orbit-u` | `--orbit-u: calc(<content px> / 302)` per slot (widths are fixed px in CSS 2094-2131) |
| 4 | `.start-selling-platform-stage-visual` (`built-stage`) | inline-size | yes, y 4536/4996/5423/5851 (932) | 390 x 311 = 100vw − 40 px (card padding 20 px) | `.start-selling-platform-stage-artboard{transform: scale(calc(100cqw / 640px))}` (6433) | `scale(calc((100vw - 40px) / 640px))` at ≤640 px (one column); 641-720 px is two columns (stage 340 at 720), so no |
| 2 | `.start-selling-platform-secure-network-kr-arm.is-a/.is-b` | size | yes, y≈5692 (932) | 36.59375 x 31.46875 / 32.09375 x 24.9375 (flag 40 px from JS `size: 40`, 2 px border, % insets; constant at every width) | `> span{width/height: hypot(…cqw, …cqh)}` (7028-7036) | px constants |

20 containers, not 17 (U3 counted 14 + 3; there are 4 built-stage visuals, one per platform row). No `@container`
rule exists anywhere (the `built-stage` name is unused), and no other file (layout CSS `0.ChGpbVhU.css`, page JS)
uses `cq*` units or `container-type`.

Chrome's layout picture (census3, short lane 12:32:36-12:33:49Z, load 5.2 → 4.3, CPU 1x, 430x932, smooth scroll top →
bottom, one trace per build, counts only; raw `<scratchpad>/layout-containment/census3-1932/census.json`, probe
`census2.mjs`, wrapper `census3.sh`; served hashes checked in the hold):

| build (CSS) | Layout events | InvalidateLayout | rooted at the document (total ≥ 0.9 × 1691) | dirtyObjects p50 / p90 / max | Layout ms sum | nested style/layout |
|---|---|---|---|---|---|---|
| lc-base (c6aad94b455f) | 198 | 230 | 23 (dirty 7-45) | 7 / 26 / 59 | 21.6 | none |
| lc-cq2 (5f5dd1516675) | 199 | 229 | 23 (dirty 7-45) | 7 / 26 / 59 | 21.9 | none |
| lc-cq3 (8b96dc588847) | 200 | 230 | 23 (dirty 7-45) | 7 / 26 / 62 | 21.2 | none |

- The three builds are the same in Chrome. Chrome never nests a Layout in UpdateLayoutTree, and removing the
  containers changes no count.
- **Retracted:** two earlier one-trace claims.
  - "lc-cq2 adds layouts (198 vs 147)": the 11:26Z lc-base trace's 149 differs from this run's 198 on the same
    build, so it was run-to-run spread.
  - "28 full layouts": the metric divided by the layout root's subtree, not the document.
- What dirties the 23 document-rooted layouts (LayoutInvalidationTracking since the previous Layout, summed):
  - IMG removed/added from layout, 33/32 times: the avatar carousel, ST-4 / F-058;
  - IMG size changed, 7 times;
  - the `accent-path` style, 6 times;
  - is-enter/is-exit images.
  - The same in all three builds.
- Chrome does not reproduce U2 (full layouts at 12-17 ms) or U3 (layout nested in style): the class is
  phone-only, and the gate is the phone Timeline.
- **ver-webkit-layout (arch-claims, `claims-audit.md` §2.4, WebKit 7624.4.5 ≈ Safari 26.6):**
  - U2 and F-052 are WEAKENED. A Timeline Layout's root quad is the layout root, and its 12-17 ms includes
    style recalc and post-layout work.
  - The interleaved pass inside recalc runs only when the recalc visits a size container, and it lays out
    only what is dirty.
  - So P-028's "−15 ms" is an upper bound. The phone pass decides it.

### I: event card

```
EVENT layout-containment · clusters: the rebuild frames (aw1-10e y≈1960 crossing = IO edge of the morph listener arm;
  arm-load: at setup) and y≈2678 (ta1, U4) · window y 1700-2900 (phone 775) · raw: de-unknowns-render tc1/tc2/ta1
```

- Hypotheses:

  | # | element + property | Chrome | WebKit | in this frame? |
  |---|---|---|---|---|
  | H1 | the 4 deck cards (inline-size) | no nesting | SkipDescendants → interleaved layout | the deck is at y 535-900; a full style rebuild (listener add, y≈1960) still visits it |
  | H2 | the 4 built-stage visuals | no nesting | same | far below (y≥4222 at 775) but in the DOM, not display:none; a full rebuild visits them |
  | H3 | the 2 kr-arms (size) | no nesting | same | as H2 |
  | H4 | the 10 desktop orbit cards | – | assumed not visited (inside `display:none`; WebKit does not resolve display:none subtrees eagerly; **not verified** — if lc-cq3 still shows a style-nested Layout, lc-cq4 flips these too) | – |
- Per-step Chrome probe: no layout or style-nesting signal in Chrome to step (see the census). The phone pass carries the attribution.

### F: build card (probe build, not a landing candidate yet)

```
BUILD lc-cq3 on base lc-base · overlay snapshot <scratchpad>/layout-containment/snap/lc-cq3 (working copy fixes/lc-cq3/overlay)
served hashes: JS c6a3ac9256ea (= arm-load), CSS 8b96dc588847 (served-file check in census3.sh, 12:32Z)
companion: aw1-cq3 = aw1-10e JS 3e2f599a1632 + the same CSS 8b96dc588847 (snap/aw1-cq3), for the y≈1960 rebuild frame
why cq3, not cq2: `container-type: inline-size|size` also applies layout + style containment (+ inline-size/size
  containment). lc-cq3 keeps `contain: layout style` on the three rules, so it removes only the query-container
  property, which is the U3 question. lc-cq2 (CSS 5f5dd1516675, snap/lc-cq2, aw1-cq2) also drops the containment:
  an optional arm.
draft lc-cq1 / aw1-cq1 (CSS 1140cfc8fcb8): failed parity (sub-pixel slot-b and kr-arm-b constants; stage rule wrong at
  641-720 px); never ticketed
parity (lc-base vs build): computed values of every cq-dependent property (14 cards' avatar/online/profile-info/name/role,
  4 artboards' transform, 2 arms + spans) at 430x932, 430x775, 375x667, 600x900, 640x900, 641x900, 720x900, 1280x800,
  at y=0 and at the platform section. lc-cq2: 0 differing values (parity-1848). lc-cq3: 0 differing values (parity-1949, 12:49-12:51Z, load 4.4-4.9; served CSS 8b96dc588847).
  Size containers left at 430: 10 (the hidden desktop cards).
a11y diff: n/a (CSS sizing only)
mechanism delta: size containers rendered at 430: 10 → 0 (4 deck cards, 4 stage visuals, 2 kr-arms). Chrome layout
  counts: unchanged (198 / 199 / 200 Layouts, 23 rooted at the document in each; census3 above). Chrome cannot show the
  WebKit mechanism.
prediction: P-028
evidence rule: 1 capture per arm in the P11 pass = I/D evidence only; a NAMED attribution needs ≥ 3 captures per arm (A1)
debug hooks: none
```

The CSS change (`fixes/lc-cq2/overlay`, vs aw1-10e's CSS; lc-cq3 adds `contain: layout style` to the same three rules):
- `.mobile-deck .orbit-card{container-type: normal}` and `--orbit-u: calc(118px / 302)` (is-a, is-d),
  `calc(158.90625px / 302)` (is-b), `calc(158.625px / 302)` (is-e), inside the existing `@media (width<=600px)`.
- `.start-selling-platform-secure-network-kr-arm{container-type: normal}`; spans: `hypot(8.48818px, 12.72634px)` /
  `hypot(28.10557px, 18.74241px)` (is-a), `hypot(4.24526px, 6.36532px)` / `hypot(27.84849px, 18.57218px)` (is-b).
- new `@media (width<=640px) { .start-selling-platform-stage-visual{container-type: normal}
  .start-selling-platform-stage-artboard{transform: scale(calc((100vw - 40px) / 640px))} }`.

Landing caveats (F stage, if the phone says it pays): the stage rule depends on the card's 20 px padding and on
`100vw` having no classic scrollbar (true on phones; a ≤640 px desktop window with classic scrollbars would differ
by the scrollbar width); the slot and arm constants copy the CSS sizes, so a design change must update both.

## P11 phone ticket (final, sent to mgmt-ops-5)

- **Block A** (required), base aw1-10e. The rebuild frame happens mid-scroll at the y≈1960 crossing.
  - Arms: C aw1-10e, V aw1-cq3.
  - Order:
    1. 2 warm-ups, one per arm.
    2. A Timeline-OFF control sentinel.
    3. 8 counted runs, C V V C C V V C.
    4. A Timeline-OFF control sentinel.
    5. 1 uncounted lc-base run for P12.
  - About 40 min including cooling.
- **Block B** (conditional), base lc-base. The listeners attach at setup.
  - Arms: C lc-base, V lc-cq3, same structure as Block A.
  - It runs only if Block A shows the nested Layout in C and its removal in V.
- **Driver:** W at 430x775, 6 s idle at y 0, then top → y≥2900.
- **Timeline:** depth 8 on every counted run.
- **Frame columns:** dt>50 / dt>34 with the ±4 ms counts.
- **Prediction P-028, in ms (668b612, no ticks on the phone):**
  - aw1-cq3 has no Layout nested in RecalculateStyles.
  - Rebuild-frame total Layout ms: −15 [−5, −25] at most.
  - Rebuild-frame dt: −17 ms [0, −50] at most. The frame may leave dt>50.
  - Steady frames unchanged.
- **Readouts:**
  - nested-in-RecalculateStyles Layout count and ms (F-052/U3);
  - the rebuild-frame root quad and Layout ms;
  - invstack (U2);
  - P12's tldump on lc-base.

Lead decision: P11 Block A and P14 do not share sentinel runs. Each block keeps its own Timeline-off sentinels,
after the warm-ups and at the block end (protocol §5.2). Both blocks are cleared to run after the ca-check re-run,
P-029 and P10, in mgmt-ops-5's phone order.

## P11 Block A result (iphone-runner, 15:13-15:20Z; read here with iphone-runner's `p11an.mjs`)

Setup: C aw1-10e vs V aw1-cq3 (CSS 8b96dc588847), driver W at 430x775, Timeline depth 8 on every counted run.
iPhone 15 Pro Max, iOS 26.6.1 Safari, Low Power Mode off. Raw data: `out/iphone-runner/p11-*` in iphone-runner's
worktree (not committed).

**Block valid.** Both Timeline-OFF control sentinels passed: open and end each had bottom ≥58 fps (60.0 / 60.2)
and scroll ≥44 fps (57.8 / 57.9).

| run | rebuild frame dt (y) | Layout ms in that frame (records) | of which nested in RecalculateStyles | scroll phase: Layout ms (records), nested |
|---|---|---|---|---|
| C1 | 127 (1979) | 25.9 (6) | 2 recs, 24.6 ms | 463.6 (319), 35 |
| C4 | 108 (1971) | 35.4 (6) | 2 recs, 22.4 ms | 465.7 (320), 40 |
| C5 | 101 (1966) | 35.9 (7) | 2 recs, 22.1 ms | 475.5 (329), 39 |
| C8 | 107 (1961) | 34.5 (5) | 2 recs, 21.6 ms | 450.8 (324), 40 |
| V2 | 107 (1973) | 33.4 (3) | 0 | 515.6 (364), 0 |
| V3 | 108 (1984) | 34.0 (3) | 0 | 504.1 (352), 0 |
| V6 | 102 (1965) | 21.9 (4) | 0 | 461.8 (359), 0 |
| V7 | 102 (1975) | 33.5 (4) | 0 | 455.1 (354), 0 |

Frame counts per run, C1 C4 C5 C8 | V2 V3 V6 V7:

| threshold | C | V | twins: C | twins: V |
|---|---|---|---|---|
| dt>50 | 3 1 1 1 | 1 1 2 1 | >46: 3 1 3 3; >54: 3 1 1 1 | >46: 1 2 3 2; >54: 1 1 1 1 |
| dt>34 | 8 7 6 7 | 7 5 7 9 | >30: 12 8 12 10; >38: 7 4 6 6 | >30: 9 12 8 10; >38: 3 3 5 5 |

- dt>50 and dt>34 are within noise. The >38 twin leans to V (C 23 vs V 16), so dt>34 is threshold-sensitive.

**P-028 scored against its prediction:**
- **Nested Layout removed: HIT.** C has 2 nested in every rebuild frame (21.6-24.6 ms) and 35-40 per scroll
  phase; V has 0 in every run. So U3 holds on the phone: query containers make WebKit run Layout inside style
  recalc (OBSERVED, 8/8 runs).
- **Rebuild-frame Layout ms: MISS.** Medians are C 34.95 and V 33.45, so Δ −1.5 ms against a predicted −15
  [−5, −25]. The Layout that left RecalculateStyles still runs in the same frame at about the same cost.
- **Rebuild-frame dt: NULL.** Medians are C 107.5 and V 104.5 ms, so Δ −3. That is inside the predicted
  [0, −50] but at its null end, and the frame stays above 100 ms in 8/8 runs.
- **Steady frames: unchanged within noise.** Scroll-phase Layout total is 451-476 ms (C) vs 455-516 ms (V);
  V has ~30 more, smaller records.
- **Reading.** F-052/U3 is a real mechanism but not a cost. Lifting the interleaved Layout out of style recalc
  saves nothing, because the same layout work stays dirty and runs right after. P-028's "−15 ms upper bound"
  rested on U2 (WEAKENED above), and the phone confirms the weakening.
- The ≥100 ms rebuild frame at the y≈1960 crossing has only 22-36 ms of Layout. Self time by record type, all
  8 runs (`<scratchpad>/layout-containment/rebuild.mjs`):
  - Composite 37-73 ms (median ~46);
  - Layout 22-36 ms;
  - RecalculateStyles 15-16 ms;
  - Paint ~3 ms;
  - script 1-4 ms.

  So about half the frame is WebKit's Composite record, which is the layer flush (OBSERVED, cause unknown). The
  frame is the lead's headline target; its Composite share belongs to the owner of the y≈1960 crossing, not
  to this topic.

**Block B: skipped (topic owner's call).** By the literal gate it is indicated: C showed nested Layouts and V
removed them. But Block A shows that removing them saves no frame time.
- On lc-base the nested share is smaller still: the L9 run has 40 nested records worth 44 ms per scroll phase,
  and its y≈1960 frame is only 31 ms.
- So Block B could at most repeat Block A's NULL, and it is not worth a phone block.

**Verdict for lc-cq3 / aw1-cq3: no gain, not a landing candidate.** The F stage closes here. The topic's
remaining question is P14 (the rotator's whole-view Layout).

## ST-4 builds (de-pm-hero's question, P-025; built here, read out by de-pm-hero)

| build | change on aw1-10e | served hashes |
|---|---|---|
| aw1-10e (control) | – | JS 3e2f599a1632, CSS c6aad94b455f |
| st4-rotoff (A1) | rotator loop `if (!e.matches)` → `if (!1)` (overlay L11585) | JS 71572ef639cf, CSS c6aad94b455f |
| st4-strict (A2) | `.start-selling-avatars.is-carousel{contain: strict}` | JS 3e2f599a1632, CSS 364f92a42b59 |

Chrome build check (mechanism only; Chrome's Layout records are **not** evidence for WebKit; short lane
12:24:31-12:25:23Z, load 34 → 21 (other jobs ending), counts only; 430x775, y=0, load+3 s, 5 s window; raw
`<scratchpad>/layout-containment/st4-1924/st4.json`):

| build | carousel childList adds / removes in 5 s | computed `contain` | carousel rect | Chrome Layout events in 5 s (dirty / total objects) |
|---|---|---|---|---|
| aw1-10e | 75 / 75 | none | 104x32 at doc y 2024 | 14 (13-31 / 1690) |
| st4-rotoff | **0 / 0** | none | same | 6 (13-22 / 1690) |
| st4-strict | 75 / 75 | **strict** | same | 16 (13-31 / 1690) |

Both builds do what they say (A1: the rotator writes nothing; A2: `contain: strict` applied, box unchanged). Chrome
lays out from the document root in all three (total 1690) with 13-31 dirty objects, so Chrome does not show the
carousel as a layout root even with `contain: strict`; that says nothing about WebKit (W1-W3 are phone questions).

Phone question (merged P14 boundary block). Sent to mgmt-ops-5 at 12:5xZ and agreed by de-pm-hero, arch-claims and
fix-hero-exit. **Re-registered at 15:3xZ** on the lead's instruction: V1 swapped from st4-strict to st4-noswap, with
mgmt-ops-5 as second reader.

**Why V1 changed (DOM check, Chrome short lane 15:26-15:27Z, counts only).** Probe: `<scratchpad>/layout-containment/who.mjs`, at
430x775, raw `who-2226/`.
- **The 104x32 root is the carousel.** In both re-keep (the s0 build) and aw1-10e, `.start-selling-avatars.is-carousel`
  is the only 104x32 element on the page. It sits at doc (58.3, 2023.9) inside `#people > card > pill > proof`, with
  display flex, overflow hidden and contain none. The phone quad is (58, 2054): x matches to 0.3 px, and the 30 px
  y offset is within the known Chrome-phone difference.
  - So the phone's WebKit already uses the carousel as a layout root, at least for the load-time dirtying
    (OBSERVED).
  - W1 ("the carousel is not a boundary on the phone") is out. V1 = `contain: strict` on the carousel would
    only repeat C, so it is dropped.
- **Correction: the 398x52 root is the fixed top nav, not a countdown strip.** The s0 rest sits at scrollY 904
  (`s0-rk.json` marks). `.start-selling-top-nav` is `position: fixed`, 398x52 at (16, 16), i.e. page (16, 920).
  So the countdown 1 s tick's small Layout is rooted at the top nav.
- **Both rotator ticks swap DOM.** The loop at JS L11560-11580 runs `f(800)`, then S=true, then `f(220)`, then x+1
  with S=false. S picks the if-block at L11689-11690: `ge`, the 5-img exit/enter block, or `_e`, the 4-img keyed
  each, keyed by URL.
  - So both the exit-start tick and the swap tick remove and insert img renderers in the carousel.
  - In s0-rk / s0-rkop (`tick2.cjs`), the ≥10 ms whole-view Layouts fall 0-60 ms after both tick types: 31/31
    after exit-start and 21/21 after swap, out of 19 + 19 ticks.
  - During the exit animation window (60-240 ms after exit-start) only small (<5 ms) whole-view Layouts occur:
    135/142.
  - **Correction (16:4xZ): no build in P14 has exit width steps.** The re-keep (s0), aw1-10e, re-contain-js and
    st4-noswap CSS all carry the layout-animations rewrite. In it, `avatars-exit` animates opacity, translate,
    clip-path and transform; the followers animate `translate` (`avatars-shift`); the enter animates
    `avatars-pop`. There is no width, flex-basis or margin keyframe in any of them (grep, 0 hits). Only the
    original baseline has the width/flex-basis steps. So "W3 = exit width steps" does not apply to these builds.
  - **st4-noswap also drops those animations.** They match only `img.is-exit` / `.is-enter` inside the `ge`
    block, and noswap never mounts `ge`. V1 therefore removes the whole swap path at once: the img renderer
    insert/remove, and the exit/shift/pop animations with any layer gain/loss they cause (F-075). It keeps the
    tick's state writes (S, x+1) and the in-place `src` update.

**New V1, st4-noswap** (`<scratchpad>/layout-containment/snap2/st4-noswap`, read-only; JS b8c085d9b619, CSS
c6aad94b455f = aw1-10e):
- the if-block always renders `_e` (L11690);
- the keyed each is keyed by slot (`(e) => e`, L11681), so x+1 updates `src` in place.

Chrome mechanism check (5 s, counts only):

| build | carousel childList adds / removes | src changes | imgs |
|---|---|---|---|
| aw1-10e | 69 / 66 | 0 | – |
| st4-noswap | **0 / 0** | **20** | 4 |

- st4-noswap is a probe, not a landing candidate. The avatars change without the slide, which is a visible difference.

- Arms: C aw1-10e, **V1 st4-noswap** (was st4-strict), V2 fix-hero-exit's re-contain-js (CSS 288c2ebe, JS 3579d857: a ResizeObserver sizes #people, then `contain: layout size`; plain re-contain at 100svh failed parity because the card is 1329 px tall). Chrome parity PASS: rects and docH identical, 0 #people writes during the reveal. Snapshot `<scratchpad>/hero-exit/snap/re-contain-js`, CSS 288c2ebec580, JS 3579d857cab9; rotator L11571 (unchanged), RO callback L11606, write L11614.
- Order:
  1. 3 warm-ups, one per arm.
  2. 1 Timeline-OFF control sentinel. Skip it if Timeline-on control data with C ≥44 already exists.
  3. 9 counted runs with Timeline on in every arm: C V1 V2 · V2 C V1 · V1 V2 C.
  4. 1 Timeline-OFF control sentinel at the block end.
  5. 1 uncounted st4-rotoff run.
- Timeline records include Paint and Decode next to Layout/InvalidateLayout, in every arm and in the st4-rotoff run.
  This tests whether the user's "blinking" is a real blank frame (§7.8, aa5f1aa).
- Rotator cycle, from the F3 finger run: pairs of long frames about 230 ms apart, every ~1.05 s. C's baseline pairs per
  cycle come from the Timeline-OFF sentinels' idle at y 0; the arms compare in the Timeline-on idle phase. A
  Timeline-off add-on (1 run per arm, idle at y 1500, +5 min) is de-pm-hero's request to mgmt-ops-5.
- Sentinels: only the Timeline-OFF runs carry the ≥58/≥44 rule (the lead's decision). The Timeline-on C fps is
  information only. Phone time ≈ 42-43 min including cooling.
- Driver W at 430x775: 6 s idle at y 0, then top → y≥2500, with a Timeline on every counted run.
- Frame columns: dt>50 / dt>34 with the ±4 ms counts (CLAUDE.md 668b612).
- Read per rotator tick and per reveal flip: the Layout root quad (viewport, carousel or #people) and its duration.
  - **Which Layout counts for the tick.** Count the one in the frame right after the rotator TimerFire (L11571). In
    s0-rk/s0-rkop that TimerFire holds InvalidateLayout in 37/38 ticks, and its next-frame Layout is the 25-30 ms
    whole-view one (de-pm-hero §7.1).
  - **Ignore the small post-paint Layouts.** Within 0-60 ms of a tick, 23/22 small Layouts (~0.1 ms) are rooted
    at a 104x32 box at (58, 2054). Most sit inside Composite after Paint, beside a beacon PerformanceObserver
    callback, with no RecalculateStyles before them. Likely an image-load size invalidation after the src swap
    (OBSERVED; cause UNRESOLVED; idle8.cjs).
  - That box is the carousel (DOM check above), already its own layout root on the phone. Don't count these
    small Layouts under any P14 column: they are image-load Layouts, not the tick's. In V1 the `src` updates in
    place, so expect more of them there; they stay out of every column.
- Reading, re-registered at 15:3xZ for V1 = st4-noswap. It follows de-pm-hero's postmortem-hero.md §7.7 (6ed6767)
  with the carousel row replaced, because the DOM check put W1 out. Amended at 16:4xZ after mgmt-ops-5's second
  read (confound, grey zone, prediction).
  - **Tick unit.** A tick is one L11571 TimerFire (exit-start or swap). Its "view tick" means a ≥10 ms Layout
    with the whole-view root quad in the next frame. Per arm, pool the ticks of its 3 counted runs, and report
    the per-run shares beside the pool.
  - **Minimum.** A run counts for the tick readout with ≥6 ticks. An arm needs ≥2 counting runs and ≥15 pooled
    ticks; with fewer, its row is UNRESOLVED (no reading).
  - **Bands** (share of an arm's ticks that are view ticks): **gone** ≤25 %; **view** ≥50 %; **MIXED** in
    between. MIXED gives no fix direction; read the st4-rotoff run.
  - C view, V1 gone: the escape is in the swap path, i.e. the `ge` mount/unmount: img renderer insert/remove,
    or the exit/shift/pop animations' layer changes. V1 does not separate the two. Fix direction: a rotator with
    no keyed remount (fixed slots). Whether a slide can be kept without the escape needs a split arm (`ge`
    mounted with `animation: none`), in a later block if it matters.
  - C view, V1 view: the swap path is not the escape. Something noswap keeps is: the S/x+1 state writes, the
    in-place `src` update, or a full layout already pending at the tick. Read the st4-rotoff run for how many
    view-rooted Layouts remain with the rotator off.
  - C view, V1 MIXED: no direction; read rotoff.
  - V2 rooted at #people with tick Layout ≤ half of C's: the #people boundary contains it whatever the dirtier is
    (fix-hero-exit's direction). V2 still view-rooted: the escape is outside #people or the boundary does not hold
    on this WebKit build.
  - C not view (≤25 %) or MIXED: the C build moved or the escape is intermittent. Stop.
- Prediction (written before the block):
  - V1 is gone (≤25 % view ticks), because the swap path is the escape.
  - V2 is rooted at #people with a median tick Layout ≤ half of C's.
  - Info only, not scored: idle dt>34 is lower in V1 than C. The Timeline-on counted runs' 6 s idle can't
    test that, and the §7.8 Timeline-OFF add-on is not part of this ticket.
- The headline target stays the ≥101 ms rebuild frame at y≈1960 (lead's instruction); P14 does not test it.
- No overlap with lc-cq3: in the SSR HTML the mobile deck is in the hero section, the stage visuals and kr-arms are
  in a later section, and `.is-carousel` is inside #people.

## P14 result (iphone-runner, 17:42-17:54Z; scored here with `<scratchpad>/layout-containment/p14score.cjs`)

Block: driver W at 430x775, Timeline on (depth 8) in all 9 counted runs, order C1 A2 B3 · B4 C5 A6 · A7 B8 C9
(A = V1 st4-noswap, B = V2 re-contain-js). Tools: main 2cd736b (tools b80a767). Served hashes match the ticket
(C JS 3e2f599a1632 = aw1-10e, V1 b8c085d9b619, V2 3579d857cab9 / CSS 288c2ebec580, rotoff 71572ef639cf). Phone
35.6 → 36.8 °C, 78 %, no Low Power Mode noted.
- **Sentinels pass.** Timeline-OFF C: S-open bottom 60.2 / scroll 56.6 fps, S-end bottom 60.2 / scroll 56.5 fps
  (rule ≥58 / ≥44).
- **Scoring** follows the pre-registered rules. A tick is one L11571 TimerFire in the run's marks. A view tick
  has a ≥10 ms Layout with the viewport root (430x775) between the tick and the end of the first RenderingFrame
  after it. The 0-60 ms window variant gives the same bands.
  - A 1327 px tall root (430x1327) is #people, not the view. My first pass counted it as view (h ≥ 700) and was
    wrong; the fixed test is h 770-820.
- Every counted run has 22-23 ticks (idle 11-12, scroll 7, bottom 3-4). All arms qualify (3/3 runs, 67 pooled
  ticks each). The rotoff run has 0 ticks, as built.

| arm | view ticks (pooled) | per run | idle-only | median tick Layout | ≥5 ms tick Layout roots | band |
|---|---|---|---|---|---|---|
| C aw1-10e | 67/67 (100 %) | 22/22, 23/23, 22/22 | 34/34 | 20.6 ms (idle 23.8) | view 67 | view |
| V1 st4-noswap | 2/67 (3 %) | 1/22, 1/22, 0/23 | 0/36 | 0.1 ms (idle 0.1) | view 2 | **gone** |
| V2 re-contain-js | 8/67 (12 %) | 3/22, 2/23, 3/22 | 4/35 | 11.7 ms (idle 13.1) | #people 61, view 6 | gone (re-rooted) |

- **Pre-registered predictions:**
  - V1 gone: **HIT** (3 %, idle 0/36). C is view-rooted (100 %), so the block is readable.
  - V2 rooted at #people: **HIT** (61/67 ≥5 ms tick Layouts at 430x1327).
  - V2 median tick Layout ≤ half of C: **MISS**. It is 11.7 / 20.6 = 0.57 (idle 13.1 / 23.8 = 0.55), above the 0.5
    line. The #people boundary holds on this WebKit, but laying out the 1327 px card is still about 55 % of the
    whole-view cost.
- **Reading** (§7.7 as amended):
  - C view, V1 gone: the escape is in the swap path, i.e. the `ge` mount/unmount. That is either the img
    renderer insert/remove or the exit/shift/pop animations' layer changes; P14 does not separate them
    (OBSERVED, in our setup).
  - Fix direction: a rotator with no keyed remount.
  - V2's boundary contains the climb but keeps a large #people layout, so it is not the better fix for this cost.
- **Frame columns** (phone, dt>50 (>46/>54) · dt>34 (>30/>38)). Idle at y 0 is 6 s per run, Timeline on:
  - C: >50 2, 2, 0 · >34 4, 4, 5 (twins 9/4, 10/3, 7/4)
  - V1: >50 0, 0, 0 · >34 0, 0, 0 (twins 0/0 ×3, max 19-23 ms)
  - V2: >50 0, 0, 0 · >34 1, 0, 2 (twins 5/0, 2/0, 2/2)
  - Bottom phase: C >34 3, 3, 4; V1 0, 1, 0; V2 3, 1, 2.
  - Info only (not scored), the §7.8 Timeline-OFF idle at y 1500 add-on, 40 s, 1 run per arm:

    | arm | >50 (>46/>54) | >34 (>30/>38) | max | near-band frames |
    |---|---|---|---|---|
    | C | 11 (13/11) | 47 (75/30) | 63 ms | 47 |
    | V1 | 0 (0/0) | 0 (0/0) | 20 ms | 0 |
    | V2 | 0 (3/0) | 40 (61/13) | 47 ms | 51 |

  - Not threshold-sensitive for V1 vs C: every twin agrees.
  - V2's >34 count is near C's (40 vs 47), and many of its frames sit in the near bands.
- **Scroll phase is unchanged in every arm**, rotoff included: >34 5-8 (C 6, 7, 7; V1 8, 7, 5; V2 5, 3, 5; rotoff 7).
  The ≥89 ms rebuild frame at y≈1950-1990 is in every run: C 89-101, V1 91-104, V2 96-142, rotoff 105.
  - So the headline frame is not the rotator's. That matches F-082 (Composite plus Layout of the rebuild).
- **Next step (proposal, not built):** an st5 rotator that keeps 5 img slots mounted, updates `src` in place,
  and runs the slide on persistent elements whose layers never come or go (permanent `will-change: transform`,
  classes toggled, no keyed remount).
  - Then: a Chrome mechanism check (0 childList, stable layer count), then one phone block C / st5 / V1. V1
    stays as the "gone" reference.
  - If st5 is still view-rooted, the animations' layer changes are the escape. The fallback is the split arm
    (`ge` mounted with `animation: none`).

## Risks, conflicts, follow-ups

- The orbit deck and the platform stage are hero-exit / platform topics' CSS: the rules touched are sizing only and
  were not changed by those topics (aw1-10e CSS is the base).
- U2's steady full layouts are a separate question: lc-cq3 removes only the query containers; if the periodic 12-17 ms
  layouts (y 1249/1427/1749) stay full, their dirtier (reveal ends, the carousel F-058) is the next lever (ST-4).
