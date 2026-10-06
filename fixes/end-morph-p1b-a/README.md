# Fix: end-morph-p1b-a (P1b part (a): the reveal's panel size without a layout read)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and the `delta-*.diff` files contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** the v10 candidate "A = P1 + (a)" (lead ruling 2026-10-06 09:35Z; P1b (b) parked). Measured in Chrome:
- values, trace counts, states and pixels, and one clean headed timing hold;
- after the rework: hydration on the i219-fixed base, install, rotation, teardown.

The phone card is drafted below ("Not done"). The overlay here is built on V of card P-153 (C + P1). There
C = v9-final + F1 + U2 (JS a6426953727a, CSS e1359ab9994a) and V = C + P1 (JS 4da641f828bb, CSS a81b9af7b2c9). The
phone arms are rebuilt without F1 and with i219 (below). The P1b write-up with (b) is `fixes/end-morph-p1b-ab/README.md`.
**Stage:** F (build + Chrome gates), lead GO 2026-10-06 (P1b cost card, after P-153's FIRST-OPEN RISK SEEN).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (the reveal's vars after `__rvF`, `__rvW`, one `ne` cleanup
before `var W = V(B, 2)`) and `/_app/immutable/assets/2.gBuqKVzi.css` (one rule, `.fw-rv-size`). Delta against V:
`delta-js.diff`, `delta-css.diff`. `patch.diff` is against the baseline.

## Why it lags

P1's switch-on (the first frame with 0.001 < m < 1) sets `data-fw-rv` on the nav and then reads `I.offsetWidth` /
`I.offsetHeight` and `getComputedStyle(B)` (V JS 14691-14693). That forces style (198 elements) and layout in the frame,
and P1's own writes after it make the nav hit test (F(), JS 13863, microtask from `__msTick` at m <= 0.2) force a second
style (27 elements, 2.3 ms) and a layout of 16 dirty objects (1.5 ms) (Chrome 6x, 430x775, `p1b/first-open.mjs`,
OBSERVED). This is cause 1 of P-153's FIRST-OPEN RISK SEEN (`fixes/end-morph-p1/README.md`).

## What changed

- A hidden child `div.fw-rv-size` (aria-hidden, `position: fixed`, `visibility: hidden`, `pointer-events: none`) is
  appended to the nav. It is sized `var(--panel-w)` x `var(--panel-h)`, the same custom properties the nav takes under
  `[data-fw-rv]`, so it has the nav's full size at every viewport size.
- **When and where it is installed** (rework after review-p1b, lead ruling 09:35Z). Phones only: the probe and its
  observer are created only while the reveal's media query `(width <= 640px)` matches (`__rvMq`), so desktop gets
  neither (the first review build installed them on desktop too). The first `__rvW` call (the nav's first template
  run) only queues one `requestAnimationFrame`; the probe is appended in that frame, after hydration has walked the
  server's nav. A node added inside the walk would not match the server HTML (I-219 was exactly that kind of failure).
  A page that loads wide and becomes narrow gets the probe at the next `__rvW` call after that.
- A ResizeObserver hands over its border box (rounded, like `offsetWidth`) and `--nav-bar-inset-x`. The switch-on uses
  these cached values. P1's read runs only if no observation came yet.
- The observer reads `--nav-bar-inset-x` only when the probe's width changed (the value comes only from the
  `(width <= 640px)` rule), so a height-only change reads no style. It writes nothing while the reveal is off.
- When the size changes while the reveal is on, the observer callback re-applies the clip and the parts at the same m
  in that frame. On phones today only a rotation changes it: `--panel-h` is `calc(100vh - 24px)` (the `<= 640px` rule
  beats the `100dvh` one), and `100vh` does not follow the toolbar. That last point is the usual reading of Safari's `vh`
  as the large viewport; the WebKit source citation is fix-panel-height's open item, so here it is OBSERVED (the phone
  logs show a constant panel height in a scroll). A `100dvh` panel (fix-panel-height's T-204 option)
  would make it follow every toolbar step; fix-panel-height has the details. P1 kept the size it read at switch-on.
- **Teardown.** An `onMount` cleanup (`ne(() => () => …)`; `ne` is Svelte's `onMount`, `chunks/BSBv9QXB.js` `Ra`,
  3430-3438, the same pattern as its `onDestroy` `za` at 3439-3441) runs when the header component is destroyed. It
  cancels a queued probe frame and a pending off step, disconnects the observer, removes the probe, and removes P1's
  glass. The glass needs this because it sits in the nav's parent, outside what Svelte removes with the header.
- Nothing else changes. The look is P1's: same writes, same values.

## Gates (Chrome, counts and values only)

- **Exact size** (`fixes/end-morph-p1/p1b/exact.mjs`, out/end-morph-p1/p1b/exact-2026-10-06T08-16-26-551Z.json). The
  cached box equals the nav's own `offsetWidth`/`offsetHeight` under `[data-fw-rv]` (fractional box too):

  | viewport | nav (P1's read) | cached | equal |
  |---|---|---|---|
  | 430x775 | 406 x 751 | 406 x 751 | yes |
  | 430x815 | 406 x 791 | 406 x 791 | yes |
  | 430x932 | 406 x 908 | 406 x 908 | yes |

- **Resize with the reveal on** (m inside the end track, viewport 775 -> 815 -> 932 -> 775). Clip box height against
  52 + (H - 52) m from the nav's current H:

  | after resize to | V (P1) | A (this) |
  |---|---|---|
  | 815 | +17.03 px (stale) | 0.0005 px |
  | 932 | +38.74 px (stale) | 0.0003 px |
  | back to 775 | 0 | 0 |

- **is-on-dark per frame**: equal to C in every frame, in three runs of `p1b/frames.mjs` (see the ab README).
- **Switch-on frame on its own** (trace counts, headless 6x, one cold load):
  - the forced 198-element restyle in `__rvW` is gone; the only forced style left is F()'s, as in C;
  - open f1: style 7.2 ms (205 elements) vs V 11.1 (232) and C 8.8 (203); script 20.9 vs V 28.0 and C 20.1 ms;
  - repeat open f1 span: 26.0 vs V 33.2 and C 24.9.
- **Frame timing** (clean headed hold 09:01Z, 6x, 4 cycles): no frame over 34 ms in any arm. Switch-on frame
  (open f2) median 16.9 ms (k 2) vs V 25.9 (k 3) and C 16.8 (k 2): a direction, not a verdict (one load per arm).
  Table in the ab README, condition 2.

The gates above ran on the first review build (JS 79a0bd83eb06: probe added on the first `__rvW` call, on every
width, no teardown). The rework changes only when and where the probe is created and adds the teardown, so the sizes,
clips and switch-on values above are unchanged in kind. The phone card's arms are rebuilt (below).

## Gates after the rework (lead ruling 09:35Z), on the i219-fixed bases

**Arms.** `node fixes/end-morph-p1/p1b/snap.mjs` (default since 09:35Z) builds read-only copies in `out/p1b/snapi/`
(`HASHES.txt`). Every base carries fix-i219-hydrate (main fd36b0c5, `fixes/i219-hydrate/delta.diff`), and the arms are
C / V / A:

| base | arm | JS | CSS |
|---|---|---|---|
| B1 = v9-final + U2 + i219 | C1 (control) | fe7c668d35e8 | e1359ab9994a |
| | V1 = C1 + P1 | fbc3acdc87a3 | a81b9af7b2c9 |
| | A1 = V1 + (a) | f83aa54c2acc | cfb8b8c5b019 |
| B0 = v9-final + i219 | C0 (control) | 387a2b38790b | e1359ab9994a |
| | V0 = C0 + P1 | a145c7de6507 | a81b9af7b2c9 |
| | A0 = V0 + (a) | 888ed8eb2d15 | cfb8b8c5b019 |

The hydration and rotation checks below ran on the previous A1, ed44af454a92. The current A1 differs from it only in two
`aria-hidden` attributes on P1's dark and glass layers, which are created when the reveal turns on, long after hydration.
The attributes were added after the accessibility diff (below).

Delta files: `delta-js.diff` 27408c23ede4 (V -> A, 4 hunks), `delta-css.diff` d20484088a03. They apply with `-F 0` on
both bases. The overlay here (on P-153's C, which has F1) is JS 901439d5222c, CSS cfb8b8c5b019.

**Hydration** (fix-i219-hydrate's `probe/hydrate-probe.mjs cost --builds C,F,C,F --c out/p1b/snapi/C1 --f
out/p1b/snapi/A1`; one shared probe hold; CPU 6x, 430x932; out/i219/cost-2026-10-06T09-32-04-572Z):

| per load (2 loads each) | C1 | A1 |
|---|---|---|
| `Failed to hydrate` / `hydration_mismatch` | 0 / 0 | 0 / 0 |
| server-parsed body elements still in the DOM | 992 of 1517 | 992 of 1518 (+1 = the probe) |
| `header.start-selling-top-nav` is still the parsed node | yes | yes |
| the lazy sections' burst (425 elements added, ~6-8 s) | same | same |

The 992 survivors are i219's fixed figure (its README: B and F 992). A hydrates like the fixed base. The probe is the
one extra element, added after hydration.

**Install and rotation** (`fixes/end-morph-p1/p1b/rotate.mjs --arm A=out/p1b/snapi/A1`; headless, counts and states,
no timing; out/end-morph-p1/p1b/rotate-2026-10-06T09-36-56-887Z.json):
- Desktop 1280x800, no touch: no probe, no observer, no glass.
- Phone 430x932 after load: one probe, the nav's direct child, `aria-hidden="true"`. One observer, one callback.
- Steps (ResizeObserver callbacks counted by wrapping the constructor):

  | step | m | `data-fw-rv` nav / glass | reveal inline styles | clip vs current size | probe = nav | RO callbacks so far | errors |
  |---|---|---|---|---|---|---|---|
  | portrait, end track m 0.5 | 0.5 | on / on | set | exact | 406x908 = 406x908 | 1 | 0 |
  | landscape 932x430 | 0 | off / off | none left | - | probe 892x390 | 2 | 0 |
  | landscape +1.2 s | 0 | off / off | none left | - | | 2 | 0 |
  | back to portrait | 1 | off / off | none left | - | 406x908 | 3 | 0 |
  | m 0.5 again | 0.5 | on / on | set | exact | 406x908 = 406x908 | 3 | 0 |
  | m 0 above the end track | 0 | off / off | none left | - | | 3 | 0 |
  | m 1 (bottom) | 1 | off / off | none left | - | | 3 | 0 |

  - "Reveal inline styles" are the properties P1 writes: clip-path, translate, left, transform-origin, opacity,
    transition-property and backdrop-filter on the header, its bar, logo and actions, the panel's backdrop, columns,
    centre and footer, the dark layer and the glass. "None left" means none of them is on any of those elements.
    What remains is the page's own inline styles (`--earn-w`, `--col-offset`, image heights, the photo strips),
    present in every state.
  - No `ResizeObserver loop` error, no uncaught exception, no console error (the only console line is Hotjar's
    headless warning).
- The rotation also moved the scroll position: the page re-laid out and m became 0, then 1 after the rotation back. So
  the switch-off came through the next `__rvW` call. The observer's own path for a size change with m unchanged
  (`__rvW(v)` with the query no longer matching, so `__rvOff`) was not isolated by this probe.

**Teardown.** On this build the header is destroyed only with the page: the route table has one route
(`"/": [2]`, `entry/app.HSR43Bkx.js` 4005), and the page component mounts the header unconditionally (`yN`, JS 15132).
I found no in-page way to unmount the header without unloading the document. So the cleanup is checked by reading
only: `ne` is
`BSBv9QXB.js`'s `Ra` (Svelte's `onMount`). It runs its callback untracked and returns the function the callback returns
as the effect's teardown, the same way Svelte's own `onDestroy` (`za`) is built. Svelte's docs say the same: "If a
function is returned from onMount, it will be called when the component is unmounted"
(https://svelte.dev/docs/svelte/lifecycle-hooks#onMount). CONFIRMED (reference plus the runtime code).

**Accessibility tree** (`fixes/end-morph-p1/p1b/a11y.mjs --arm C=… --arm A=…`, CDP `Accessibility.getFullAXTree`,
headless 430x932, non-ignored nodes as role and name, countdown digits masked; out/end-morph-p1/p1b/a11y-2026-10-06T09-43-05-858Z.json):
- At the top, at m = 1 and at m = 0 above the end track, A's tree and focusable list equal C's: same nodes, same order.
- Under the reveal (m 0.5), A had two more nodes, both `generic` with no name: P1's `.fw-rv-dark` and `.fw-rv-glass`,
  shown while `[data-fw-rv]` is set. The probe does not appear (aria-hidden, visibility hidden). Focusable lists are
  equal in every state.
- Both layers now get `aria-hidden="true"` when they are created (JS 2cb04208b57e; A1 09d1f5b62384). Re-run on that
  build (out/end-morph-p1/p1b/a11y-2026-10-06T09-48-57-494Z.json): A's tree and focusable list equal C's in all four states, same
  nodes and same order.

**Idle triple** (protocol v2 §3.5; `fixes/end-morph-p1/p1b/idle-run.mjs`, which runs fix-platform-idle's
`idletriple.mjs`: headless, CPU 1x, 430x932, 5 s windows, one load per arm and round, two rounds, each arm in its own
60 s shared hold; per second; out/end-morph-p1/p1b/idletriple-*.json):

| spot | arm | callbacks | rAF | timers | observers | events | writes (style) | nodes |
|---|---|---|---|---|---|---|---|---|
| top (y 0) | C r1 / r2 | 6.6 / 6.6 | 1 / 1 | 4 / 4 | 1.6 / 1.6 | 4.6 / 5.4 | 16.8 / 16.8 (13.4) | 2.4 / 2.4 |
| | A r1 / r2 | 6.8 / 6.8 | 1.2 / 1.2 | 4 / 4 | 1.6 / 1.6 | 4.6 / 6 | 19 / 19.2 (15.6) | 2.4 / 2.4 |
| mid (y 2620, parked after a scroll) | C | 2 / 2 | 0 | 2 / 2 | 0 | 22.2 / 22.2 | 7 / 7 | 0 |
| | A | 2 / 1.8 | 0 | 2 / 1.8 | 0 | 27 / 25.8 | 7 / 5.8 | 0 |
| end (bottom, m = 1) | C | 40.2 / 27 | 39.2 / 26 | 1 / 1 | 0 | 1 / 1 | 76.6 / 39 | 0 |
| | A | 27 / 27 | 26 / 26 | 1 / 1 | 0 | 1 / 1 | 39 / 39 | 0 |

- Observers: equal everywhere. The probe's ResizeObserver adds no callback at rest.
- Top, A +2.2 style writes/s and +0.2 rAF/s. `idle-who.mjs` (same windows, writes grouped by element;
  out/end-morph-p1/p1b/idle-who-2026-10-06T09-51-53-467Z.json) puts all of it on the countdown's roll:
  - `.cell` transform writes C 55 vs A 66, and the roll's rAF (JS 4305, cd-roll-ca) 5 vs 6;
  - that is 11 cell writes per roll in both arms, i.e. one more seconds tick inside A's window;
  - `.script-accent`'s per-second class flip is 5 vs 6 as well.

  Neither P1 nor (a) touches the countdown. The difference is the window's phase against the clock's seconds
  (OBSERVED; A drew the extra tick in all three windows, so the phase may follow the load time, cause unknown).
- Mid, events +3.6-4.8/s: CSS animation events of the photo carousel (`.st5-*`, img). They split both ways (C has
  more `animationcancel`, A more `animationend`), so this is carousel phase, not new work. Writes are equal or lower.
- End: equal in round 2. C's round 1 (40 / 76.6) is the outlier.
- **Reading: no idle cost from A**, with the stated reasons above for the two top/mid differences.

## Phone card P-156 (DRAFT for the lead's signature; reserved by mgmt-clerk-1; runs after P-155; predictions fixed before any data)

**Question:** on the landing base, does A = P1 + (a):
- open the end zone's first frame no slower than C;
- stay no-worse in the end zone;
- add no slow closing frames after the page sits still near the end?

P-153 found P1's FIRST-OPEN RISK: f2 V 41 vs C 31 ms. In Chrome, (a) removes the forced 198-element restyle from that
frame.

**Arms** (served from the immutable copies in `out/p1b/snapi/`, HASHES.txt):
- C = the base's control;
- A = C + P1 + (a).
- Base B1 (v9-final + U2 + i219: C1 fe7c668d35e8 vs A1 f83aa54c2acc) if P-155 lands U2. Otherwise B0 (v9-final + i219:
  C0 387a2b38790b vs A0 888ed8eb2d15).
- CSS: C e1359ab9994a, A cfb8b8c5b019.
- No V arm: P-153 already measured P1 against C on the same mechanism.

**Driver, profile, order:**
- driver G, profile xcode-serious;
- rev 1.4 hold rules, as P-153 block 2: one counted run per hold, Safari parked, the cooling or thermal gate before
  every hold, start and end gates, a hold at Critical or over 44 °C is void;
- the runner's scripts: `fixes/end-morph-p1/phone/p156-serve.sh`, `p156-hold.sh` and `p156-block.sh`, copies of
  P-153's with the arms C / A and part B. `P156_BASE=1|0` picks the base at the first server start; the served hashes
  are pinned per base. `P156_DRY=1` checks the pins and the plan with no phone.
- **Part A** (first open, end zone, closing band): `fixes/morph-scroll/g-fastshort-v1.json`, P-153's program
  (GESTURE_HASH 8737f212c0ff, budget 229 s).
- **Part B** (after a 30 s park near the end): `fixes/end-morph-p1/phone/g-park30-v1.json` (new; GESTURE_HASH
  6f9209453750, dry-run budget 327 s, so it fits one 600 s hold).
  - Approach to the end (menu open), 30 s with no touch, a 120 px / 60 ms close fling.
  - Back to the end track's top (menu closed), 30 s with no touch, a 120 px / 60 ms open fling.
  - At the end again, 30 s with no touch, a close fling.
  - So each run has two closes and one open after a park.
- Holds, one counted run each:
  - part 1: H1 WC, H2 WA, H3 S0, H4 EC1, H5 EA1;
  - part 2: H6 EA2, H7 EC2, H8 EC3, H9 EA3;
  - part 3: H10 EA4, H11 EC4, H12 BC1, H13 BA1;
  - part 4: H14 BA2, H15 BC2, H16 TAIL (at most 2 re-runs), then S1.
  - Part A is C A A C C A A C (4 v 4); part B is C A A C (2 v 2); the sentinels run on C.

**Metrics** (reader: `fixes/end-morph-p1/phone/pA-read.mjs`, written before data, `--selftest` 18 checks, `--gates` for part B's run gates; it imports P-153's
`p153-read.mjs` for the shared rules and copies P-155's closing band, which is not on main):
- **O1.f1, O1.f2, O1.f3 and f123** (their sum): the first open after load, P-153's definition (f1 = the gap before the
  first frame with m > 0, f2 and f3 the next two gaps).
- End zone: moving last-screen frames over 34 and 50 ms, with the ±4 ms twins (P-153's rule).
- CB34 / CB50: P-155's closing band, frames at 0.2 <= m < 0.55 while closing with dt over 34 / 50 ms. Part A: all
  closes. Part B: only the closes after a park (CBp34 / CBp50).
- Part B: Op.f2, the f2 of each open after a park.
- Heat per run: battery °C and thermal state at the start and end of every hold (the runner's gate lines), plus the
  run's start time and the gap since the previous hold.
- Census, phone side: part A's moving frames, binned by 250 px of scrollY over the whole pass. A bin is worse when its
  median is up by 1 or more frames over 34 ms, or by 1 frame per run over 50 ms. Reported per arm; it decides nothing
  alone.

**Prior data** (exploratory, decides nothing; P-153 on the F1+U2 base):

| | C | V (= C + P1) |
|---|---|---|
| O1.f2, median | 31 ms | 41 ms |
| CB34 per run | 11 / 10 / 11 / 16 (median 11) | 4 / 5 / 7 / 5 (median 5) |
| CB50 per run | 1 / 1 / 1 / 2 | 0 / 0 / 0 / 0 |

**Predictions** (bounds fixed now):
- **Pr1, first open:** median A O1.f2 - median C O1.f2 <= +2 ms. Expected inside: Chrome put A's switch-on at C's level,
  open f2 16.9 vs C 16.8 ms. If A - C > +2, the WebKit cost of P1's first frame is not the forced read: (b) is
  reconsidered, the lead's condition. f1, f3 and f123 are reported next to f2 and decide nothing.
- **Pr2, end zone no-worse:** P-153's rule unchanged. WORSE when the runs are fully separated, or when the median is
  up by more than +2 at >34 or +1 at >50 with permutation p <= 0.05. Expected PASS, A at or below C, as P-153's V.
- **Pr3, closing band (part A):** median CB34 A - C <= +3. Expected below C, as V was (5 vs 11).
- **Pr4, after a park (part B):** median CBp34 A - C <= +2 per run, and median Op.f2 A - C <= +2 ms. A holds nothing
  while parked: the reveal is off at m = 0 and m = 1, and the probe's observer is idle (`rotate.mjs`: no callback
  without a size change). So a park should change nothing.
- **Probabilities** (the author's, before data):

  | prediction | p | why |
  |---|---|---|
  | Pr1 | 0.55 | Chrome removes the whole +9 ms of V's switch-on frame. On WebKit, P-153's +10 ms may be partly layer creation or paint, which (a) does not touch. |
  | Pr2 | 0.85 | A does in the end zone what V did, and V passed P-153 below C. |
  | Pr3 | 0.85 | P1 already holds the layers during every close: CB34 V 5 vs C 11. |
  | Pr4 | 0.75 | A holds nothing while parked. The risk is WebKit dropping backing stores after idle and paying for them on the next close more in A (bigger layers) than in C. |
  | all four | 0.35 | not independent: Pr2 and Pr3 move together. |
- **RO callback change** (lead, after fix-panel-height's dvh counts): the observer reads `--nav-bar-inset-x` only when
  the probe's width changed. The value comes only from the `(width <= 640px)` rule (CSS 12094/12104), so a height-only
  change reads no style; with a dvh panel that means every toolbar step. It writes nothing while the reveal is off;
  while it is on, it re-applies as before. A small change on the same path: JS 901439d5222c, A1 f83aa54c2acc,
  A0 888ed8eb2d15. Re-run on it:
  - `rotate.mjs` (out/end-morph-p1/p1b/rotate-2026-10-06T10-03-45-445Z.json): the same states as above, 3 RO callbacks, 0 errors;
  - `exact.mjs` (out/end-morph-p1/p1b/exact-2026-10-06T10-04-08-265Z.json): size equal at 775/815/932, and the clip is
    exact after the height-only steps 775 -> 815 -> 932 -> 775 with the reveal on, using the cached inset.

**Outcomes:**

| outcome | reading |
|---|---|
| Pr1-Pr4 hold | A removes P1's first-open risk at no closing or end-zone cost: land request for v10. |
| Pr1 fails, others hold | WebKit's first-frame cost is not the forced read. P1's end-zone gain stands; the lead decides between P1 alone and reviving (b). |
| Pr2 or Pr3 fails | A is worse than C at the end: no landing. Read the Timeline attribution runs. |
| Pr4 fails, others hold | a park makes the next close or open slow on WebKit (e.g. layers dropped after idle): attribution before landing. |

**Not run (scenarios this card does not cover):**
- real heat, the first-open test from 42-44 °C (milestone 2), and the Fair no-worse check;
- finger runs (F) and the blind swipe A/B;
- rotation on the phone (Chrome-only gate above);
- the collapsed-toolbar geometry (430x815), and fix-panel-height's svh/dvh panel;
- reduced motion, VoiceOver;
- the language menu open during the morph;
- a back/forward-cache restore;
- desktop Safari and iPad widths over 640 px (no reveal there);
- Low Power Mode (dropped by the user).

## Not done

- P-156 (reserved by mgmt-clerk-1, PREDICTIONS row on main) needs the lead's signature and the pre-data ops-reader.
- The block scripts are written and syntax-checked (`sh -n`); `P156_DRY=1` needs the servers, so it runs once the base is known.
- The 250 px census, Chrome side: `fixes/end-morph-p1/p1b/census-run.sh` (C1 vs A1, verify.mjs --frame-log, 6x), one
  timing hold of 300 s or less. It runs after P-155 (the lead allows no timing hold during the phone block). The phone
  side comes from P-156 part A (pA-read.mjs).
- The observer-only rotation path (a size change with m unchanged) is not isolated (see Install and rotation).
