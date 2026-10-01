# Fix: layout-containment

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). The builds' CSS/JS stay in gitignored overlays and scratchpad snapshots; never push.

**Status:** draft (probe builds, no timing claim yet)
**Stage:** R + I closed (desk + Chrome short lane, counts only); D needs the P11 phone Timeline pass (arms aw1-10e / aw1-cq3, lc-base / lc-cq3; F-052 folded in via the nested-in-RecalculateStyles count) and the merged P14 boundary block (below)
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

Phone question (merged P14 boundary block, sent to mgmt-ops-5 at 12:5xZ; agreed by de-pm-hero, arch-claims and fix-hero-exit):
- Arms: C aw1-10e, V1 st4-strict, V2 fix-hero-exit's re-contain-js (CSS 288c2ebe, JS 3579d857: a ResizeObserver sizes #people, then `contain: layout size`; plain re-contain at 100svh failed parity because the card is 1329 px tall). Chrome parity PASS: rects and docH identical, 0 #people writes during the reveal. Snapshot `<scratchpad>/hero-exit/snap/re-contain-js`, CSS 288c2ebec580, JS 3579d857cab9; rotator L11571 (unchanged), RO callback L11606, write L11614.
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
- Reading, pre-registered in de-pm-hero's postmortem-hero.md §7.7 (6ed6767, was 84bb7a2 before rebase) and agreed by arch-claims. A self-dirtied
  renderer's climb starts at its container, so `contain: strict` on the carousel cannot stop a self-dirty; only
  the #people boundary can.
  - C view, V1 carousel: W1. The phone's WebKit did not treat the carousel as a boundary in C (the WebKit build
    string matters).
  - C and V1 view, V2 #people: the escape is inside #people but above the carousel (a self-dirty, which is UNRESOLVED
    with no trigger found, or a second dirtier, or W2). The fix belongs above the carousel.
  - All three view: W3, or a dirtier outside #people. The rotoff run says how many view-rooted layouts remain.
  - C not view-rooted: the C build moved. Stop.
- No overlap with lc-cq3: in the SSR HTML the mobile deck is in the hero section, the stage visuals and kr-arms are
  in a later section, and `.is-carousel` is inside #people.

## Risks, conflicts, follow-ups

- The orbit deck and the platform stage are hero-exit / platform topics' CSS: the rules touched are sizing only and
  were not changed by those topics (aw1-10e CSS is the base).
- U2's steady full layouts are a separate question: lc-cq3 removes only the query containers; if the periodic 12-17 ms
  layouts (y 1249/1427/1749) stay full, their dirtier (reveal ends, the carousel F-058) is the next lever (ST-4).
