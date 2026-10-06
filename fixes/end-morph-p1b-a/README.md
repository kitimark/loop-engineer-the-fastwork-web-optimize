# Fix: end-morph-p1b-a (P1b part (a): the reveal's panel size without a layout read)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and the `delta-*.diff` files contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** **A = P1 + (a) goes into v10; (b) stays parked** (lead ruling after the P-156 read d450632e, outcome "Pr1
fails, others hold"). P-156 block 1 (B0): FAIL Pr1, Pr2-Pr4 hold (section "P-156 read"). The lead's reasons: the goal
metric is frames over 50 ms (target 0), and A takes the end zone from a median of 2 per run to 0 in every run (>34 ms
down by a median of 7), with Pr3 and Pr4 holding; the cost is one first-open frame under 50 ms, once per first open; (b)
still has three open problems (the language-menu clip, Simulator pixels while armed, unmeasured layer memory); A is
the arm that passed this block, and (a) removes the forced read in Chrome.

**Known cost (for v10's card):** first-open +11 ms (O1.f2 37.5 vs 26.5 ms, phone, P-156). One frame per first open,
over 34 ms but under 50 ms; over the first three frames +3.5 ms (f123 65.5 vs 62). Cause UNRESOLVED (likely the first
composite of P1's layers); a follow-up Timeline attribution run of O1 is queued, not blocking (P1c only if it shows a
cheap pre-warm).

The v10 candidate "A = P1 + (a)" (lead ruling 2026-10-06 09:35Z; P1b (b) parked). Measured in Chrome:
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

**Frozen build** (lead ruling 10:15Z): A1 f83aa54c2acc / A0 888ed8eb2d15, CSS cfb8b8c5b019 (overlay JS 901439d5222c,
`delta-js.diff` 27408c23ede4, `delta-css.diff` d20484088a03). The builds before it: A1 ed44af454a92, then 09d1f5b62384
(adds `aria-hidden` on P1's dark and glass layers), then f83aa54c2acc (adds the observer's width check, below).

**Which build each Chrome gate ran on:**

| gate | A build | where |
|---|---|---|
| exact size, switch-on attribution, frame counts, is-on-dark | first review build, overlay JS 79a0bd83eb06 (on P-153's C) | "Gates" above |
| hydration, install and rotation (first round) | A1 ed44af454a92 | below |
| accessibility re-run, idle triple (2 rounds) | A1 09d1f5b62384 | below |
| install and rotation, exact size (after the width check) | A1 f83aa54c2acc (frozen) | Phone card, "RO callback change" |
| hydration, accessibility, idle triple (re-run on the freeze) | A1 f83aa54c2acc (frozen) | "Re-run on the frozen A1" below |

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

**Re-run on the frozen A1** (f83aa54c2acc vs C1 fe7c668d35e8; each in its own shared probe hold of 60 s or less, 10:22-10:33Z):
- Hydration (`hydrate-probe.mjs cost --builds C,F`, one load each; out/i219/cost-2026-10-06T10-22-57-677Z): 0
  `Failed to hydrate` / `hydration_mismatch` in both; survivors 992 of 1517 (C1) vs 992 of 1518 (A1); the header is
  the same node in both. Same as on ed44.
- Accessibility tree (out/end-morph-p1/p1b/a11y-2026-10-06T10-27-21-268Z.json): A's tree and focusable list equal C's
  in all four states (top, m 0.5 with the reveal on, m 1, m 0 above the end track), same nodes, same order.
- Idle triple (one round per arm; out/end-morph-p1/p1b/idletriple-2026-10-06T10-32-25-309Z.json for C,
  idletriple-2026-10-06T10-32-57-227Z.json for A), per second:

  | spot | arm | callbacks | rAF | timers | observers | events | writes (style) | nodes |
  |---|---|---|---|---|---|---|---|---|
  | top | C / A | 6.6 / 6.8 | 1 / 1.2 | 4 / 4 | 1.6 / 1.6 | 4.6 / 4.6 | 16.8 / 19 (13.4 / 15.6) | 2.4 / 2.4 |
  | mid | C / A | 2 / 2 | 0 / 0 | 2 / 2 | 0 / 0 | 27.6 / 25.8 | 7 / 7 | 0 / 0 |
  | end | C / A | 32.8 / 28 | 31.8 / 27 | 1 / 1 | 0 / 0 | 1 / 1 | 47 / 40 | 0 / 0 |

  The same picture as on 09d1: observers equal; the top's +2.2 writes and +0.2 rAF per second are the countdown roll's
  extra tick (idle-who above); mid events now lower in A (carousel phase); end lower in A. No idle cost from A.

## Phone card P-156 (rev 2, DRAFT for the lead's signature; reserved by mgmt-clerk-1; runs after P-155; predictions fixed before any data)

Rev 2 takes the lead's FIX-FIRST list after ops-reader-P156 (2026-10-06 10:15Z): frozen build, part B windows, Pr4's two
parts, park gates and a pilot, the base ledger, block 2, the +4 ms bounds, the dry runs, and the non-blocking items.

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
  are pinned per base. `P156_DRY=1` checks the pins and the plan with no phone. `P156_DIR` puts the servers, the
  snapshot copy, the hold logs and the runs in their own folder (default `out/p156`).
- **WDA at every part start** (I-220, ts-i220's 2d6d7327, lands on main after P-155; I rebase before the dry runs):
  `iphone.mjs wda ensure`. Exit 0 goes on, and Safari is restarted only when the line says "restarted". Exit 4 (WDA
  REPLUG NEEDED) posts a re-plug step on the console, waits for its Done and runs ensure again, at most twice. Exit 3
  stops the block.
- **Base, fixed before H1.** The base goes into the P-156 ledger (mgmt-clerk-1) before H1: B1 if P-155 lands U2, else
  B0. It never changes, block 2 included. The reader takes it as `--base 1|0` and voids the read when any hold log's
  start line names another base, or a hold with runs served other pins than that base's.
- **Part A** (first open, end zone, closing band): `fixes/morph-scroll/g-fastshort-v1.json`, P-153's program
  (GESTURE_HASH 8737f212c0ff, budget 229 s).
- **Part B** (after a 30 s park near the end): `fixes/end-morph-p1/phone/g-park30-v1.json` (new; GESTURE_HASH
  6f9209453750, dry-run budget 327 s, so it fits one 600 s hold).
  - Approach to the end (menu open), 30 s with no touch, a 120 px / 60 ms close fling.
  - Back to the end track's top (menu closed), 30 s with no touch, a 120 px / 60 ms open fling.
  - At the end again, 30 s with no touch, a close fling.
  - So each run has two closes and one open after a park.
- Holds, one counted run each:
  - part 0: H0 PC, the uncounted pilot: one part B run on C, Timeline on, run gates G1-G7 (G7, the park gates, below).
    It runs before part 1 on the free phone (user T-204 #35: a free iPhone may be used for any end-of-page test). A
    pilot that fails (hold exit 9) stops here: the block does not start, and I report to the lead;
  - part 1: H1 WC, H2 WA, H3 S0, H4 EC1, H5 EA1;
  - part 2: H6 EA2, H7 EC2, H8 EC3, H9 EA3;
  - part 3: H10 EA4, H11 EC4, H12 BC1, H13 BA1;
  - part 4: H14 BA2, H15 BC2, H16 TAIL (at most 2 re-runs), then S1.
  - Part A is C A A C C A A C (4 v 4); part B is C A A C (2 v 2); the sentinels run on C.
- **Block 2** only after block 1 is VOID or INCOMPLETE (a prediction INSUFFICIENT or NOT READ). It is read alone, in its
  own folder (`P156_DIR=out/p156-b2`), never pooled with block 1; same base, scripts and pins.

**Metrics** (reader: `fixes/end-morph-p1/phone/pA-read.mjs` rev 2, written before data, `--selftest` 40 checks, `--gates`
for part B's run gates and the pilot; it imports P-153's
`p153-read.mjs` for the shared rules and copies P-155's closing band, which is not on main):
- **O1.f1, O1.f2, O1.f3 and f123** (their sum): the first open after load, P-153's definition (f1 = the gap before the
  first frame with m > 0, f2 and f3 the next two gaps).
- End zone: moving last-screen frames over 34 and 50 ms, with the ±4 ms twins (P-153's rule).
- CB34 / CB50: P-155's closing band, frames at 0.2 <= m < 0.55 while closing with dt over 34 / 50 ms. Part A: all
  closes. Part B: only the closes after a park (CBp34 / CBp50).
- Part B: Op.f2, the f2 of each open after a park.
- **Part B windows:** each close or open window runs from its mark to the next touchstart after its own stroke (the
  first touchstart at or after the mark), or to the end of the record. So P1's CBp counts only the close after the
  park, not the 450 px drag-close that follows the re-approach (no park before it).
- **Park gates (G7, part B runs and the pilot):** in each 30 s park, from its mark to the next mark (plus the last
  frame before it), no moving frame; m >= 0.99 at the open parks (P1, P3) and m <= 0 at the closed park (P2), with
  P-153's opens() form of m (lvh = the run's largest innerHeight). All three parks must be there. A run that fails G7
  is INVALID like any run gate.
- Arming frame: N/A for A. It is (b)'s concept (AB moves the layer work into an approach frame); A has no such frame,
  and the reader has no arming metric.
- Work, descriptive: busy, busyRF and cls (P-129's gapWork and classify) of the O1.f2 frame and of every CB and CBp
  frame over 34 ms, from the run's Timeline.
- Heat per run: battery °C and thermal state at the start and end gate of the run's hold (`meta.profile.start` and
  `.end`; one counted run per hold), plus the run's start time.
- Census, phone side: part A's moving frames, binned by 250 px of scrollY over the whole pass. A bin is worse when the
  median over runs of A - C is +1 or more frames over 34 ms, or over 50 ms. Frame counts only: the Chrome-tick (dt)
  criterion is dropped on the phone, and the median dt difference is printed. It decides nothing alone.

**Prior data** (exploratory, decides nothing; P-153 on the F1+U2 base):

| | C | V (= C + P1) |
|---|---|---|
| O1.f2, median | 31 ms | 41 ms |
| CB34 per run | 11 / 10 / 11 / 16 (median 11) | 4 / 5 / 7 / 5 (median 5) |
| CB50 per run | 1 / 1 / 1 / 2 | 0 / 0 / 0 / 0 |

**Predictions** (bounds fixed now):
- **Pr1, first open:** median A O1.f2 - median C O1.f2 <= +4 ms (the phone minShift, protocol §5.3; rev 1 had +2).
  P-153's +10 ms (V 41 vs C 31) still fails it. Read on at least 3 first opens per arm; a valid run with no first open
  is named in the Pr1 line, never dropped silently. Expected inside: Chrome put A's switch-on at C's level, open f2
  16.9 vs C 16.8 ms. If A - C > +4, the WebKit cost of P1's first frame is not the forced read: (b) is reconsidered,
  the lead's condition. f123 is printed next to f2 in the Pr1 line; f1, f3 and f123 decide nothing.
- **Pr2, end zone no-worse:** P-153's rule unchanged. WORSE when the runs are fully separated, or when the median is
  up by more than +2 at >34 or +1 at >50 with permutation p <= 0.05. Expected PASS, A at or below C, as P-153's V.
  The reader prints the rule's threshold-sensitive flag (the ±4 ms twins) in the Pr2 line.
- **Pr3, closing band (part A):** median CB34 A - C <= +3. Expected below C, as V was (5 vs 11).
- **Pr4, after a park (part B):** median CBp34 A - C <= +2 per run, and median Op.f2 A - C <= +4 ms (rev 2; rev 1 had
  +2). The two parts decide separately: a CBp34 miss fails Pr4 by itself. Op.f2 is read only when every valid part-B
  run of each arm (2 per arm) has a value; otherwise Op.f2, and so Pr4 if CBp34 holds, is NOT READ. No median drops a
  run (rev 2: a missing value makes the median missing). A holds nothing
  while parked: the reveal is off at m = 0 and m = 1, and the probe's observer is idle (`rotate.mjs`: no callback
  without a size change). So a park should change nothing.
- **Probabilities** (the author's, before data; rev 2 after the bounds moved to +4 ms):

  | prediction | p | why |
  |---|---|---|
  | Pr1 | 0.6 (rev 1 at +2 ms: 0.55) | Chrome removes the whole +9 ms of V's switch-on frame. On WebKit, P-153's +10 ms may be partly layer creation or paint, which (a) does not touch. |
  | Pr2 | 0.85 | A does in the end zone what V did, and V passed P-153 below C. |
  | Pr3 | 0.85 | P1 already holds the layers during every close: CB34 V 5 vs C 11. |
  | Pr4 | 0.8 (rev 1: 0.75) | A holds nothing while parked. The risk is WebKit dropping backing stores after idle and paying for them on the next close more in A (bigger layers) than in C. |
  | all four | 0.4 (rev 1: 0.35) | not independent: Pr2 and Pr3 move together. |
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
| Pr2 or Pr3 fails | A is worse than C at the end: no landing. This block has no attribution runs; the work columns are descriptive, and an attribution ticket follows if the lead asks. |
| Pr4 fails, others hold | a park makes the next close or open slow on WebKit (e.g. layers dropped after idle): attribution before landing. |
| Pr1 and Pr4 both fail, Pr2 and Pr3 hold | A neither removes P1's first-open cost on WebKit nor stays even after a park: no landing of A; the lead decides between P1 alone and (b). |
| FAIL with predictions not read | the failing prediction's row applies; the ones not read are named and get no verdict. |
| INCOMPLETE (a prediction INSUFFICIENT or NOT READ, none fails) | no verdict on those; block 2, read alone, same base. |
| VOID (a sentinel, the base or pin check, the pilot, a cooling stop) | nothing is read; block 2, read alone, after the cause is fixed. |

**Not run (scenarios this card does not cover):**
- real heat, the first-open test from 42-44 °C (milestone 2), and the Fair no-worse check;
- finger runs (F) and the blind swipe A/B;
- rotation on the phone (Chrome-only gate above);
- the collapsed-toolbar geometry (430x815), and fix-panel-height's svh/dvh panel;
- parks longer than 30 s, and a park with the screen locked or Safari in the background;
- after a park, drags and the 60 / 200 px flings (part B runs only the 120 px fling);
- a park in the middle of the morph (0 < m < 1; the page's snap leaves none in these scripts);
- a reload or back navigation that restores the scroll into the end track;
- the observer under the phone's real toolbar resize with the panel at dvh (Chrome checked height steps only);
- reduced motion, VoiceOver;
- the language menu open during the morph;
- a back/forward-cache restore;
- desktop Safari and iPad widths over 640 px (no reveal there);
- Low Power Mode (dropped by the user).

## P-156 read, block 1 (B0; 2026-10-06 13:05-14:58Z)

**Result: FAIL Pr1; Pr2, Pr3 and Pr4 hold.** Outcome row "Pr1 fails, others hold": WebKit's first-frame cost of P1 is
not the forced read that (a) removes. P1's end-zone and closing-band gain stands. The lead decides between P1 alone and
reviving (b).

Reader: `node fixes/end-morph-p1/phone/pA-read.mjs out/p156/runs --base 0` (rev 2, a01dd89e3333; JSON out/p156/read-block1.json).
Base check ok over 19 hold logs (H0-H18). Sentinels S0 PASS (fps 56.5, slow 0.023) and S1 PASS (fps 55.7, slow 0.028).
Every hold VALID (219-250 s), every start and end gate PASS at Serious (Xcode-induced), battery 36.6-38.4 °C. No run
failed a run gate; no re-run (TAIL: none).

**Gap in the block (lead ruling, option (a)).** The iPhone dropped off USB at 13:35Z, after H4 (EC1) and before H5
(incident I-222: `idevice_id -l` empty, WDA unreachable; the cooling wait read UNAVAILABLE and the kit printed a cooling
VOID). H0-H4 stayed VALID (a lost device is not a VOID case). The user re-plugged at 13:37:00Z (console step C-087); I
checked `idevice_id -l` = 1 and `wda check` READY. Then two extra uncounted warm-ups, H5 WC and H6 WA (Safari and WDA
were cold), and the rest renumbered: H7 EA1, H8 EA2, H9 EC2, H10 EC3, H11 EA3, H12 EA4, H13 EC4, H14 BC1, H15 BA1,
H16 BA2, H17 BC2, H18 S1. Arm order unchanged (part A C A A C C A A C, part B C A A C). Parts after the drop ran
detached (`nohup`, I-221).

| prediction | bound | C | A | A - C | reading |
|---|---|---|---|---|---|
| Pr1 first open O1.f2 (ms) | <= +4 | 26.5 (23-30) | 37.5 (35-39) | **+11** | FAILS, runs fully separated |
| Pr2 end zone (>34 / >50 per run) | P-153 rule | 20, 37, 18, 22 / 1, 8, 1, 3 | 13, 15, 17, 12 / 0, 0, 0, 0 | median -7 / -2 | NO-WORSE PASS, not threshold-sensitive |
| Pr3 CB34 (part A) | <= +3 | 0, 4, 1, 2 (median 1.5) | 0, 0, 0, 0 | -1.5 | holds |
| Pr4 CBp34 after a park | <= +2 | 0, 0 | 0, 0 | 0 | holds |
| Pr4 Op.f2 after a park (ms) | <= +4 | 40, 41 | 45, 44 | +4 | holds, exactly at the bound |

- **First open, the frames around it** (medians, ms): f1 C 16.5 / A 17; f2 26.5 / 37.5; f3 C 17-21 / A 10-13;
  f123 62 / 65.5 (+3.5). A's first open puts its extra work into f2, and its f3 is shorter: over three frames A is
  +3.5 ms. P-153's V had the same shape (f2 +10, f123 +0.5).
- **Work of the O1.f2 frame** (descriptive, Timeline): A 35-39 ms frames have busy 10.1-12.1 ms, busyRF 14.4-16.5 ms,
  class MIXED. C's f2 frames (23-30 ms) are under the reader's 30 ms work threshold, so they carry no work numbers. The
  extra in A is main-thread work plus rendering, not a pure compositor wait (OBSERVED, in our setup).
- **Closing band:** A had no CB34 frame in any part-A run (C 7 over four runs) and none after a park in part B.
- **Census, phone side** (descriptive, decides nothing alone): flagged bins 500-750 (+1.5 >34), 1000-1250 (+1 >50),
  5000-5250 (+1 >34), 5250-5500 (+2 >34). The first two are the hero area, where neither P1 nor (a) does anything; the
  last two are above the end track (m < 0, reveal off). The end track itself (6250-6500 area, the end zone) is better in
  A (Pr2).
- **Pilot H0** (uncounted, C): all three parks still; CBp 0; Op.f2 40 ms; it matches BC1/BC2.

**Reading.** Chrome put A's switch-on frame at C's level (the forced 198-element restyle gone, Gates above). On the
phone, A's first open f2 stays 11 ms over C, the same as P1 alone in P-153 (+10). So the WebKit cost of P1's first
frame is not the layout read: likely the first composite of the new layers (layer creation, backing store, first
paint of the clip), which (a) does not touch (cause UNRESOLVED; the decisive check is a Timeline attribution run of
the O1 frame, layer and paint records, which this block did not have). The cost is one frame per page load, and A
already gives it back in f3 (f123 +3.5 ms). Everything after the first open is better or equal in A.

**Kit changes after block 1** (lead, from map-p156-gaps' trace and I-222/I-224; `p156-block.sh`, its own commit). Block 1
ran on the old kit; **its timings do not compare with a block run on the new kit**:
- Cooling wait OFF by default (`P156_COOL=1` restores it). Block 1 waited `phone-temp --below 38` before every hold
  (13 of 107 min); under xcode-serious the rule is no cooling wait, the sentinel decides validity. The 44 °C / Critical
  ceiling stays in each hold's start and end gate.
- No park between holds when cooling is off, so the next hold's chrome-measure `lock run` is queued as soon as the
  previous hold ends (block 1 lost 13.7 min to shared jobs that slipped into the park/cooling window, I-224).
  `p156-hold.sh` still parks Safari after every run.
- Device lost: `idevice_id -l` is checked before every hold, and a phone-temp UNAVAILABLE in a cooling wait is a lost
  device too: a re-plug console step, then BLOCK STOP DEVICE LOST (exit 5), not a cooling VOID (block 1 printed
  "did not cool" for the 13:35Z drop).

## Not done

- P-156 block 1 is read (above: FAIL Pr1). Open: the lead's decision (P1 alone or reviving (b)); the cause of A's f2
  on WebKit is UNRESOLVED (one Timeline attribution run of the O1 frame would decide it); a quiet Chrome census re-run.
- History of the card (signature 10:40Z on d366186a, rebased as ec6dcc32; dry runs; census) below.
- `P156_DRY=1` (preview, before the rebase onto I-220's fix): both bases, every part (H0 pilot, H1-H16 with TAIL), all
  17 holds `DRY ok`; pins, compiled programs (fs 8737f212c0ff budget 229 s, park30 6f9209453750 budget 327 s) and
  served hashes match (base 1: C fe7c668d35e8 / A f83aa54c2acc; base 0: C 387a2b38790b / A 888ed8eb2d15); the reader's
  base check passes with the right `--base` and voids with the other (out/p1b/dry-pre-base1.log, dry-pre-base0.log).
  **Final dry run** (lead conditions of the signature, 10:40Z): after the rebase onto main with I-220's fix (5803d436,
  `wda ensure`), head f8967b1c (the signed d366186a rebased as ec6dcc32, plus census-run.sh's CENSUS_BASE), 11:31Z:
  both bases, all 17 holds `DRY ok`; programs fs 8737f212c0ff (229 s) and park30 6f9209453750 (327 s); served hashes
  equal the pins of each base; script pins unchanged (pA-read a01dd89e3333, hold 8bddb5dbbdef, block 7425f1d8ef8e,
  serve cd09f2818ca2); the reader voids a read under the other base (out/p1b/dry-r-base0.log, dry-r-base1.log).
  **Base: B0** (lead base ruling 11:33Z from P-155's signed result: U2 does not land, F1 stays out); `--base 0`.
- Reader smoke test on real data (decides nothing): P-153 block 2's records with V renamed A read FAIL Pr1, f2 A - C
  +10 ms > +4 (f123 +0.5 ms), Pr2 NO-WORSE PASS (not threshold-sensitive), Pr3 holds (CB34 -6): the +4 ms bound still
  catches P-153's first-open risk (out/p1b/smoke).
- The 250 px census, Chrome side, ran 11:44:54-11:51:04Z on B0 (`CENSUS_BASE=0 fixes/end-morph-p1/p1b/census-run.sh 2`:
  C0 vs A0, verify.mjs --frame-log, mobile 430x932, CPU 6x, idle 6, 2 runs per arm; out/end-morph-p1/p1b/census-20261006T114458Z).
  **Descriptive only and contaminated:** the lock was granted by the gate timeout (host never quiet; the user's own
  browser and system load, load1 4-10, other CPU 33-42 %), all 4 runs flagged; the hold ran 370 s, past its 300 s cap
  (warned, not killed). Medians C / A: fps 90.9 / 89.5, >34 ms 7 / 6, >50 ms 4 / 5, forced 24 / 2 ms, morph >50 0 / 0,
  0 404s and 0 errors. Bins (k>=5 / k>=7 per run, medians): one bin flagged, 500-750 px (k>=7 0.5 vs 1.5, median tick 2.5
  vs 3), in the hero area where neither P1 nor (a) does anything (the reveal is off, the probe idle); every other bin
  equal or lower in A, the morph track (6250-6500) 1/1 and 1/1. Reading: nothing points at A; 2 contaminated runs per
  arm decide nothing. A quiet re-run is worth one later gap. The phone side comes from P-156 part A (pA-read.mjs).
- The observer-only rotation path (a size change with m unchanged) is not isolated (see Install and rotation).
