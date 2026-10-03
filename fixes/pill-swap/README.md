# Fix: pill-swap

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). No `patch.diff`: this topic built no fix (see "Verdict").

**Status:** closed at D without a fix: the premise does not hold on the base (st6-rb2). Proposed: drop.
**Stage:** R, I, D (D verdict proposed **UNEXPLAINED-NOT-PRESENT** on st6-rb2; the lead signs).
**Device class:** would have been phone-only (WebKit Layout); no gate run (no build).
**Drivers behind the claims:** none (rest positions, no scroll driver): Simulator Timeline at rest and Chrome trace at rest, counts only.
**Prediction:** none (no build, no timed run).
**Topic:** F-146 / F-148 follow-up (de-countdown): the community-pill avatar block swaps its template twice a second
and each swap runs a full-viewport Layout at pastHero.
**Files touched:** none. Probes: `fixes/pill-swap/simprobe.mjs` (Simulator), `fixes/pill-swap/chromeprobe.mjs` (Chrome).

## Verdict, plainly

- **F-148 is real, but on the committed baseline only.** de-countdown's probe (`fixes/countdown-faces/f146.mjs`)
  and the X1 phone block served the plain baseline (`countdown-faces/README.md` "Arms": C = `site-pretty`, JS
  `4606120cf392`), not st6-rb2.
- **st6-rb2 already contains the fix.** It stacks `rotator-st6` (fix-scene-scope's st5 + st6):
  - the 5 avatar slots stay mounted;
  - a tick writes `src` on the slots and toggles `.is-sliding` (JS 11667-11679 of the st6-rb2 overlay);
  - the `{#if S}` template swap is gone (`e(ge)` always, 11698).
  So on st6-rb2 there is no insert or remove, which F-148 named as the trigger.
- **Measured on st6-rb2:** the rotator causes no heavy layout, at any of six rest positions, in the Simulator or
  in Chrome.
- **What is left is small.** Each tick costs about 2 light layouts:
  - WebKit: one 104x32 subtree layout plus one view-rooted layout with almost nothing dirty, 0.1-0.7 Simulator ms each;
  - Chrome: 3-4 layouts per 4 s, about 13 layout objects each.
  A gate or a containment patch could save at most this, and it would carry pixel risk (P11, F-114). Not worth a fix.
- **The pill can't explain C-026's top-band frames.** At y 0-900 on st6-rb2:
  - the Simulator shows 0 heavy layouts at y 0, 600 and 900;
  - at y 300 it shows 14-15 heavy layouts per 4 s, the same with the rotator off (st6 15, norot 14). They are style-driven
    ("no JS" RecalculateStyles invalidations) and belong to the hero (hero-exit-threaded's area), not the pill.

## R: census card

```
CENSUS pill-swap · base st6-rb2 (JS 7bf7c4657d21, CSS f523598b2a24, = fixes/st6-rb2 README) + baseline b1789284481295-4ad4a84a · 2026-10-03 UTC
phone: not run (no timing; Simulator for structure, memory rule); prior phone data: X1 stage 2 on the BASELINE (countdown-faces README)
simulator: rest positions, 4 s Timeline each, 430x775        raw: out/pill-swap/sim/simprobe-2026-10-03T01-10-34-085Z.json (base, st6),
                                                                  simprobe-2026-10-03T01-24-18-482Z.json (st6, norot)
chrome: rest positions, 4 s trace each, 430x932 DPR3 6x       raw: out/pill-swap/chrome/counts-2026-10-03T01-20-12-108Z.json
```

Simulator, Layout records per 4 s at rest. "Heavy" means a record over 3 Simulator ms, used as a structure label
only (F-084). "Rotator" means the record follows an invalidation whose JS stack is inside `mM` (the pill component).

| position (Sim y) | pill on screen? | baseline: heavy (rotator) | st6-rb2: heavy (rotator) | st6-rb2 rotator layouts: roots, max ms | rotator off (norot): heavy |
|---|---|---|---|---|---|
| top 0 | no (avatars at y 2102) | 21 (7) | **0 (0)** | 8: 104x32 ×4, view/398x52 ×4; 0.3 | — |
| 300 | no | 43 (8) | 15 (0 of the >3 ms by own stack; 1 mixed frame*) | 8; 0.2 | 14 |
| 600 | no | 44 (8) | **0 (0)** | 7; 0.3 | — |
| 900 | no | 30 (8) | **0 (0)** | 7; 0.4 | — |
| pastHero 2560 | no | 47 (8) | 1 / 0 (run 1 / 2)† | 8; 0.3-0.7 | 0 |
| pill centred 1714 | yes | 25 (8) | **0 (0)** | 8; 0.3 | 0 |

\* Run 2, y 300: one of the 8 rotator-attributed records was 19.2 ms. In that frame a rotator invalidation shared
the frame with the hero's style-driven view layout; removing the rotator leaves 14 of 15 (n = 1, not separable).
† Run 1, pastHero: one 22.3 ms record. Its invalidations include the countdown's face `setProperty` chain (JS 2858)
and its tick `setAttribute` (2935), so it is a mixed frame. Run 2: 0.

Baseline mutations: childList 120 per 4 s in the avatar box (the template swap). st6-rb2: `src` 15-20 and `class` 7-8
per 4 s, childList 0.

Chrome, per 4 s at rest (counts; load1 3.8-8.5, counts are not timing):

| position (Chrome y) | st6-rb2: layouts / objects | of which avatar-invalidated (reason) | rotator off: layouts / objects |
|---|---|---|---|
| top 0 | 10 / 159 | 4 / 51 ("Size changed" ×11) | 5 / 97 |
| 300 | 109 / 1362 | 3 / 39 | 104 / 1292 |
| pastHero 2982 | 4 / 51 | 4 / 51 | **0 / 0** |
| pill 1714 | 9 / 148 | 4 / 51 | 5 / 97 |

Baseline Chrome: 192 / 246 / 78 / 182 layouts at the same positions. The avatar attribution reads 0 there because the
probe keys on the first load's img node ids, and the swap replaces those nodes. That doesn't matter for this topic.

reproducible: none attributable to the pill on st6-rb2 · rare: none.

## I: event card (short: there is no cluster to place)

```
EVENT pill-swap · cluster: none on st6-rb2 (the F-148 burst is baseline-only)
crossing table: rotator runs while #people's dE gate is active (JS 11359 baseline / st6-rb2 equivalent, onActiveChange m);
  active already at y 0 on both devices (scene "active" at every probed position), so the ticks run in the top band
  while the pill is off-screen (avatars top: Sim y 2102, Chrome y 2180 → on screen from scrollY ≈ 1330 / 1250)
hypotheses:
 | 1 | avatars block template swap (insert/remove), JS 11415-11447 | baseline only; st6-rb2 has persistent slots (0 childList) |
 | 2 | src write on 5 lazy imgs → image size change → layout | Chrome: "Size changed" ×11 / 4 s, ~13 objects per layout; WebKit: 104x32 subtree (setAttribute ← JS 2935 stack) |
 | 3 | .is-sliding toggle → style recalc of the box + clip-path main-thread animation 0.22 s | WebKit: view-rooted record, 0.1-0.3 Sim ms (toggle ← JS 11676) |
```

## D: attribution card (proposed; the lead signs)

```
ATTRIBUTION pill-swap · cluster pastHero rest burst (F-146/F-148) · verdict: NOT PRESENT on st6-rb2 (cannot be NAMED: nothing to remove)
1 stage: layout (baseline: full-view Layout after the template swap; st6-rb2: two light layouts per tick)
2 code: baseline JS 11445-11447 `s(S) ? e(ge) : e(_e, -1)`; on st6-rb2 replaced by rotator-st6 (`e(ge)` always + .is-sliding)
3 ablations (control st6, JS 7bf7c4657d21 / CSS f523598b2a24; same sessions):
  | arm | removes | role | mechanism check | result |
  | base | rotator-st6 (puts the swap back) | positive (the burst reappears) | childList 120 / 4 s | heavy rotator layouts 7-8 / 4 s at every position |
  | norot | the whole rotator loop | ablation of what is left | 0 avatar mutations | Sim heavy: pastHero 0 vs st6 0-1, y300 14 vs 15; Chrome pastHero 0 vs 4 layouts (51 objects) |
  | hero (y300 cluster) | — | negative sibling: the y300 heavy layouts are not the pill | same in st6 and norot | 15 vs 14 |
  no decoupling run needed: there is no cluster to place
4 device class: n/a (no fix)
5 platform claims relied on:
  | WebKit treats a box with non-visible overflow, fixed width and height, and a new formatting context as a layout boundary, so the avatar box (overflow hidden, 104x32, display flex) roots its own layouts | CONFIRMED | WebKit main e9fce6c19ed5 (fetched 2026-10-03), Source/WebCore/rendering/RenderObject.cpp `isLayoutBoundary` l.519-559; markContainingBlocksForLayout stops there l.648 | explains the 104x32 roots only |
  | WebKit turns a subtree layout into a full one when the view already needs layout or when two disjoint subtree roots are pending | CONFIRMED | same commit, page/LocalFrameViewLayoutContext.cpp `scheduleSubtreeLayout` l.769-835, `scheduleLayout` l.722-732; iOS fixed-position rect l.236-237 | explains why some light rotator records are view-rooted |
  | Blink never makes a flex item a relayout boundary (even with contain) | CONFIRMED | chromium main f8a31c97957d, third_party/blink/renderer/core/layout/layout_object.cc `ObjectIsRelayoutBoundary` l.1440, flex-item exit l.1514-1520 | a contain patch could not scope Chrome's layouts |
  | the baseline's insert/remove swap runs a FULL view layout in WebKit (although the box is a boundary) | OBSERVED (Sim, this probe + F-148); cause in source not pinned | — | nothing on st6-rb2 depends on it |
6 lead: —
```

## What a fix could still do (not built)

The upper bound is the residual: about 2 light layouts per tick. If anyone wants it later:
- **Gate the writes while the pill is off-screen.** Keep the `_` loop and the `x` counter running, and skip only the
  `src` / class writes behind an IntersectionObserver on the avatar box. On re-entry, write the current state.
  - If the pill enters mid-slide, the CSS animations must be started at their elapsed time (`getAnimations()`,
    `currentTime`). Otherwise the frames are not pixel-identical.
  - Saves the 4 layouts per 4 s in Chrome and the 104x32 + light view layouts in WebKit, in the top band and at pastHero.
- **`contain: strict` on `.start-selling-avatars.is-carousel`.** WebKit already treats the box as a boundary (above).
  Blink never does for a flex item. So this changes nothing measurable.

Both save under 1 Simulator ms per second. Neither is proposed.

## Scenarios not run

- Scroll (S/W) and finger (F/G) drivers: rest only. The rotator ticks on timers, not on scroll, so the per-tick cost
  is the same while scrolling. A tick that lands in a frame that already does a full layout can add its small subtree
  there (y300 footnote).
- Phone: not run (the user's timing deferral; the Simulator matches the phone's layout-record structure, F-109).
- Desktop / reduced motion: no change made, so nothing to check.

## Files

- `simprobe.mjs`: Simulator probe (Layout roots and initiators, avatar mutations per position). Run:
  `node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner pill-swap -- node tools/sim.mjs session --functional --owner pill-swap -- node fixes/pill-swap/simprobe.mjs base,st6`.
- `chromeprobe.mjs`: Chrome probe, counts only (Layout events, layout objects, avatar invalidations). Run:
  `node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner pill-swap -- node fixes/pill-swap/chromeprobe.mjs base,st6,norot top,y300,pastHero,pill`.
- `results.json`: the per-position counts of all three runs.
- Arms are copies in `out/pill-swap/snap/` (gitignored):
  - `st6` = `fixes/st6-rb2/overlay` (`fix.mjs apply st6-rb2`);
  - `norot` = st6 with JS 11589 changed to `if (!e.matches && false)`, a diagnostic ablation only.
