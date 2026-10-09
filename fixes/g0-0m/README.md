# Build: g0.0m (g0.0l + reveal-paint)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** rev 3 built and gated on counts, pixels and the a11y probe (snapshot b1789284481295-a455e793). D signed by
the lead 2026-10-09 (Simulator ablations + WebKit main 8f0a69f19a28; now also read on the device branch). The phone check
card below waits for the lead's signature; no phone data has been taken.
**Stage:** F (build + gates) done; V (phone) next.
**Device class / gate:** phone render-bound (raster + allocation in the people card's reveal frame). Chrome at 6x does
not show this cost. Not a less-work fix (lead ruling 1): the paint moves, it is not removed, so the phone card has a GAIN
primary (R7) and D1 no-worse.
**Driver(s) behind the claims:**
- Simulator WDA flick with LayerTree + Timeline counts (`fixes/reveal-paint/rp-sim.mjs`);
- Chrome and Simulator pixel gates (`gates/`), `fix.mjs check`;
- the phone check (G), not run yet.
**Topic:** reveal-paint (user T-265; lead's brief). Owner: fix-reveal-paint. Peer: fix-scrollcb-g0 (g0.0l's author).
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` (one block appended) and `/_app/immutable/nodes/2.DyWL8TcE.js`
(the a11y mirror of the hidden state, next to g0.0l's reveal gate `fwRevealGate`).

## In plain words

- **What it tries:** on phones, the people card ("people" section) is drawn while it is still invisible, so the moment it
  appears needs less drawing work. The look and the behaviour stay the same.
- **What it costs:**
  - about +22 MB of graphics memory from page load until the people card shows (and again after scrolling back above it);
  - find-in-page (Safari's "Find on Page") can match the hidden card's text before the card shows;
  - one extra repaint of a people-card photo deck in 1 of 3 test loads while the page sits at the top; whether that
    warms the phone is untested.
- **Whether it helps** is decided by the phone check below (P-175).

## What g0.0m is

- **g0.0l** (the best build on main, 0edb02be; `fixes/g0-0l`)
- **plus, on touch screens only** (`(hover: none) and (pointer: coarse)`, the query of g0.0l's photo preload):
  - `.start-selling-future:not(.is-visible) > .start-selling-future-card { visibility: visible }`: the hidden card is
    no longer `visibility: hidden`. It stays at opacity 0, blur 14 px and translateY 48 px, so nothing visible changes.
  - `.start-selling-future > .start-selling-future-card { will-change: transform, border-radius, opacity }`: opacity
    joins the card's will-change. WebKit then gives the opacity-0 card layer and its composited descendants backing
    stores and paints them before the reveal, instead of in the reveal frame.
  - **the hidden state's behaviour, as in g0.0l** (visibility: hidden used to give it; rev 2 and rev 3):
    - CSS: the hidden card's descendants take no tap (`pointer-events: none !important`), except the profile tabs,
      whose own rules set their visibility (g0.0l keeps them visible and tappable on phones while the card is hidden);
    - JS (`fwAx`, called from g0.0l's `fwRevealGate` at every class change): aria-hidden on the hidden branches,
      tabindex -1 on their focusables, role none and no name on the containers around the tabs; every element's own
      value is restored at the flip; a MutationObserver covers nodes and attribute changes while hidden.
    - Not `inert`: clearing inert at the flip repaints the card's content (WebKit StyleDifference.cpp 776-778;
      Simulator knock-out N, 2 of 2), which is the cost g0.0m removes.
- Desktop and mice keep g0.0l exactly (the query does not match, and `fwAx` returns at once). Reduced motion keeps
  g0.0l's own paths; only the hidden state's visibility differs, and the pixels are the same (gates).

| build | JS (sha256, 12) | CSS (sha256, 12) | how to rebuild |
|---|---|---|---|
| g0.0l (control) | 4106679e0a8a | 440582cec781 | `node tools/fix.mjs apply g0-0l --reset` |
| g0.0m rev 1 (D attribution) | 4106679e0a8a | e439b72d4482 | superseded |
| g0.0m rev 2 (taps) | 4106679e0a8a | b04a7f5c367a | superseded |
| **g0.0m rev 3** | **37af49aef32b** | **7a8ecdd8f8e4** | `fixes/g0-0m/patch.diff` (baseline-relative); `delta.diff` = g0.0l -> g0.0m |

Snapshot copies for the gates and the phone kit: `phone/g0m-snap.sh`, out/g0-0m/snap (HASHES.txt e7947589f4c9).
`g0m-snap.sh` runs `fix.mjs apply --reset`, which rebuilds the overlay from `patch.diff`: run `fix.mjs diff g0-0m`
before it (an unsaved overlay edit is lost otherwise; it happened once here).

## Why (summary of `fixes/reveal-paint/README.md`)

- **Cause, on g0.0l:** the hidden card is `visibility: hidden`, so WebKit gives its layers no visible content and no
  backing store. The reveal frame then allocates ~41 MB and paints the card, the deck's shells in view and their
  preloaded photos (Simulator: 10-20 rects, 1.2-1.6 Mpx2).
- **The fix:** with `visibility: visible` + `will-change: opacity`, the opacity-0 layers paint before the reveal. The
  flip changes only opacity, filter and transform on the composited card (RecompositeLayer).
- **The flip frame on the Simulator** (medians, n 5 each):

| | g0.0l | g0.0m |
|---|---|---|
| paint area | 1559 kpx2 | 972 kpx2 |
| paint ms | 5.6 | 0.7 |
| composite ms | 72.9 | 26.8 |

- **The cost moves; it is not removed.** The deck paints move into the 1-3 frames before the flip (10 frames before:
  472 -> 2584 kpx2, max composite 12.9 -> 52.9 ms), and ~22 MB is painted at load. Total paint over the 21 frames is
  the same.
- **The phone check decides** whether that lowers the frames > 50.

## Gates (counts and pixels; no timing; all OBSERVED in our setup)

All on rev 3 (JS 37af49aef32b / CSS 7a8ecdd8f8e4, snapshot out/g0-0m/snap HASHES e7947589f4c9), 2026-10-09 13:20-14:40Z,
snapshot b1789284481295-a455e793. Control C / A = g0.0l (JS 4106679e0a8a / CSS 440582cec781). Earlier revs' runs are
history in `fixes/reveal-paint/README.md`.

**1. Console errors and 404s** (`fix.mjs check g0-0m --viewport both`, 13:56Z): CHECK OK, 4 pages (mobile and desktop,
baseline and g0.0m), 0 errors, 0 4xx, morph reached on all; both overlay files served from the overlay.

**2. Pixels at rest** (T2: fill 64, edge 128, 0.5 %; loads A, V, A2, V2; carousel frozen; "consistent" = A~V and A2~V2
differ beyond A/A at the same pixels; Chrome with `PX_T0=12000`, Simulator `PX_T0=14000`):

| stop y | Chrome mobile 430x932 | Chrome mobile, Reduce Motion | Chrome desktop 1440x900 | Simulator 430x775 |
|---|---|---|---|---|
| 0 | 0 | 0 | 0.125 % max 212 (hero accent word, below) | 0.0007 % (3 css px2: the status bar clock) |
| 300 | 0 | 0 | 0 | - |
| 548 | - | - | - | 0 |
| 600 | 0 | 0 | 0 | - |
| 900 | 0 | 0 | 0 | - |
| 1300 | 0 | 0 | 0 | 0.037 % max 49 (deck card edge, nav bar) |
| 1600 | 0 | 0 | 0 | - |
| 2300 | 0 | 0 | 0 | - |
| 3000 | 0 | 0 | 0 | - |
| 600u / 548u | 0 | 0 | 0 | 0 |
| 0u | 0 | 0 | 0.096 % max 118 (hero button, accent phase) | 0 |

- **Chrome mobile and Reduce Motion: consistent 0 at every stop.** Single-pair diffs (mobile 0u A~V 1.04 %, A2~V2 0)
  are the hero accent word frozen at another point of its cycle in one load.
- **Desktop y 0 and 0u** are the hero's cycling accent word and its button: the crops show A with another word
  ("あなた") than A2, V and V2 ("kamu"), and the line reflows around it. Desktop runs none of g0.0m (the media query does
  not match and `fwAx` returns at once), the same-build A/A at these stops is 0.7-1.0 %, and rev 2 desktop (JS
  byte-identical to g0.0l) showed the same region (0u 0.12 % max 212). So these are freeze-phase artifacts of the gate,
  not a look change.
- **Desktop same-build A/A (A vs A2, both g0.0l), lead's check:** max level 212 at y 0 (over8 1.01 %) and 212 at 0u
  (0.71 %): the A/A max reaches the A~V max, so the desktop hero diff is within noise.
- **Simulator** (`out/g0-0m/px-sim-rev3`, stops 0 / 548 / 1300 / 548u / 0u, one session, 14:37-14:40Z): inside T2 at
  every stop. y 0 is the status bar: the clock reads 21:38 on A and V, 21:40 on V2, and load A's bar still carries the
  magenta calibration tint (F-367), which also inflates the A/A count (over8 ~5 % at every stop). y 1300 (shown card)
  is 112 css px2 at max level 49 along a deck card's edge, as on rev 2 (0.06-0.09 %, max 39-49). The hidden-card stops
  (548, 548u) are 0. Fewer stops than Chrome: a cold Simulator boot left too little session time for 8 stops x 4 loads
  (two earlier tries ended after 3 loads; `px-sim.mjs` can now resume a run, PX_RESUME, not needed this time).

**3. Behaviour: taps, AT and focus** (`fixes/reveal-paint/rp-dom.mjs`, Chrome mobile with touch; `dom-rev3e.log`):

| y | focusables C / V | AX not ignored C / V | AX role:element lists | tappable card descendants C / V | hit grid in #people |
|---|---|---|---|---|---|
| 0, 300, 600 (hidden) | 6 / 6 | 14 / 14 | identical | 13 / 13, identical | equal |
| 1400 (shown) | 25 / 25 | 83 / 83 | identical | 338 / 338, identical | equal |
| 600, 0 (hidden again) | 6 / 6 | 14 / 14 | identical | 13 / 13, identical | equal |

- The 6 focusables, the AX tablist and 13 tappable elements while hidden are g0.0l's own: the profile tabs set their own
  visibility (visible on phones), so g0.0l never hid them with the card (F-375). Rev 3 keeps exactly that.
- Every attribute is restored after the flip (aria-hidden 31 / 31, tabindex -1 0 / 0 at y 1400) and set again when the
  card hides on the way back up.
- Differing hit points only outside #people (hero accent phase) and one spinning record label at 1400.
- **Residuals (disclosed):** find-in-page can match the hidden card's text (g0.0l's visibility: hidden excluded it);
  the AX parity is Chrome's tree, VoiceOver itself was not run.

**4. The flip frame and the attributes** (Simulator, `rp-sim.mjs`, P-174's flick shape, `rp-flick-table.mjs`): rev 3's
attribute writes add no paint at the flip.

| run | arm | flip rects | flip kpx2 | flip paint ms | MB before -> after |
|---|---|---|---|---|---|
| s14 (rev 3) | g0.0l | 11 | 1579 | 9.6 | 12.5 -> 81.5 |
| s14 (rev 3) | g0.0m rev 3 | 9 | 604 | 0.7 | 34.1 -> 97.1 |
| s12/s13 knock-outs on rev 2 | M + Z (aria-hidden + tabindex) | 10-12 | 1017-1025 | 2.5-3.3 | 34.3 -> 81.7 |
| s12/s13 knock-outs on rev 2 | M + N (inert) | 8-10 | 1581-1590 (both shells) | 2.7-3.1 | 34.3 -> 81.7 |
| s6-s10 (D card, rev 1, n 5) | g0.0m median | 13 | 972 | 0.7 | 34.3 -> 81.7 |

s14 had one load per arm: the Simulator booted cold and the session's time ran out after two loads. The Simulator
ms are descriptive only; the host was loaded (load1 up to ~40 from other agents' work) during these sessions. "MB after"
depends on where each flick lands; gate 5 compares memory at fixed y.

**5. Memory and idle paint at the top** (lead ruling 2; Simulator, `rp-idle.mjs`, 30 s idle at y 0 after load + 9 s,
then the visit census at y 1400, 4000 and back at 0; sessions i4-i7, n 3 per arm):

| arm | MB at the top (range) | Timeline paints in 30 s (range) | #people layer paints in 30 s | MB at y 1400 | MB at y 4000 | MB back at y 0 |
|---|---|---|---|---|---|---|
| g0.0l | 12.6 (12.4-12.6) | 1346 (1337-1405) | 0, 0, 0 | 96.2 | 84.1 | 14.0 (12.6-14.2) |
| g0.0m rev 3 | 34.4 (34.3-34.5) | 1343 (1316-1422) | 0, 2, 0 (the active shell) | 96.2-96.3 | 84.1 | 34.3 (34.1-35.6) |

- **Memory: +21.8 MB whenever the card is hidden** (at the top on load, and again after scrolling back above the people
  section); equal from the reveal on (96.2 MB at y 1400, 84.1 at y 4000). The layer count is the same (150 at the top
  in both); g0.0m only gives the opacity-0 card's layers backing stores. So the extra stays for the whole visit while
  the reader is above the people section, never more than g0.0l below it.
- **Idle paints at the top:** the same Timeline paint count as g0.0l (the hero's own animation, ~1100 paints of
  `header.hero-copy`, dominates both). #people itself painted 2 times in 1 of 3 g0.0m loads (the active deck shell;
  also seen once in i1 and i2 on earlier revs), never on g0.0l. Small, but not zero.
- **Heat:** the effect of the extra memory and these paints on the phone's heat is untested.

**6. Kit dry runs (rev 3):**
- `CM_DRY=1` (out/g0mp/dry.log, 14:38Z): 12 holds DRY ok; the servers serve B 4606120cf392 / 27776f3d4138, C
  4106679e0a8a / 440582cec781 and V 37af49aef32b / 7a8ecdd8f8e4; both programs compile to the pinned hashes (flick
  22b636f36a82, approach 65f6de58009c), GESTURE_BUDGET_S 150 each.
- Simulator count-only run of both programs on C and V (`g0m-simdry.sh`, 14:33Z): the flick lands (one stroke), and 7
  approach drags reach y >= 3400 on both arms.
- Reader selftest (`g0m-reveal.mjs` on P-174's records): g0.0l FLICK R7 44 / 48 / 49 / 51, APPROACH 60 / 49 / 54 / 57.

## Build card

```
BUILD g0.0m rev 3 on base C = g0.0l (main 0edb02be; JS 4106679e0a8a / CSS 440582cec781), snapshot b1789284481295-a455e793
  out/g0-0m/snap (HASHES.txt e7947589f4c9): C 4106679e0a8a / 440582cec781, V 37af49aef32b / 7a8ecdd8f8e4
delta (fixes/g0-0m/delta.diff, g0.0l -> g0.0m; applies to g0.0l's overlay and gives V's hashes), touch screens only
  ((hover: none) and (pointer: coarse)):
  CSS  hidden card visibility: visible (still opacity 0, blur 14 px, translateY 48 px); will-change gains opacity;
       pointer-events: none !important on the hidden card's descendants except the profile tabs subtree
  JS   fwAx(on) from fwRevealGate: while hidden, aria-hidden on the branches without the tabs, tabindex -1 on their
       focusables, role none and no name on the containers around the tabs; own values restored at the flip;
       MutationObserver for nodes and tabindex/href/role/name changes while hidden; teardown disconnects it
mechanism (CONFIRMED, WebKit main 8f0a69f19a28 and safari-7624.5.1.11 26695efdefc6): an opacity-0 layer keeps a backing
  store only with will-change opacity; the flip is then RecompositeLayer (opacity, filter, transform) instead of the first
  paint of the card, the shells in view and their photos
served hashes: every gate load and the kit dry run record them (V 37af49aef32b / 7a8ecdd8f8e4)
gates: fix.mjs check OK (4 pages); pixels consistent 0 on Chrome mobile and Reduce Motion, desktop only hero-accent phase,
  Simulator inside T2 (hidden-card stops 0); behaviour (rp-dom): focus, AX, tappable and hit grid identical to g0.0l hidden, shown and hidden
  again; flip frame (Simulator s14): g0.0l 1579 kpx2 / 9.6 ms paint vs g0.0m 604 / 0.7
KNOWN COST: the paint is moved into the 1-3 frames before the flip (Simulator: 0.47 -> 2.6 Mpx2 painted and 13 -> 53 ms
  max composite in the 10 frames before, D card); +21.8 MB of layers whenever the card is hidden (at the top); #people
  idle paints at the top 0-2 per 30 s (g0.0l 0); heat effect untested; find-in-page can match the hidden card's text
phone path: this is all the iPhone path (touch); desktop and mice run g0.0l
```

## Phone check card P-175 (signed by the lead 2026-10-09 14:4xZ, terms as written; prediction frozen)

D was signed by the lead 2026-10-09 with these rulings:
- **Not a less-work fix.** g0.0m moves paint earlier, adds layer memory at the top and adds idle paints, so the card
  carries a GAIN primary (R7) besides D1 no-worse.
- **Memory and idle disclosed first** (Simulator; below). The heat effect of the idle paints is untested on the phone.
- **AT and focus** handled in rev 3: the hidden state's AX tree, focus order and tap targets equal g0.0l's (gates).
- **Device-branch source read** (I-261, resolved): done on safari-7624.5.1.11-branch 26695efdefc6; every function of
  the mechanism is there with the same logic, so the mechanism is CONFIRMED for the device (`fixes/reveal-paint` "I").

```
TICKET P-175 · V = g0.0m rev 3: JS 37af49aef32b / CSS 7a8ecdd8f8e4 (out/g0-0m/snap/V)
       control C = g0.0l (best on main, 0edb02be): JS 4106679e0a8a / CSS 440582cec781 (out/g0-0m/snap/C), same base
       HASHES out/g0-0m/snap/HASHES.txt (e7947589f4c9), checked by the kit before every hold; B = the plain baseline
driver G (WDA gesture), P-174's two programs, byte-identical (compiled 22b636f36a82 / 65f6de58009c):
  FLICK    reload, 4 s idle, mark flick, one flick up 300 px / 220 ms, until settled, mark landed, 3 s rest, mark flick-end
  APPROACH reload, 4 s idle, mark approach, 520 px / 1200 ms drags (300 ms pause) until y >= 3400 (at most 9), settle,
           mark approach-end
profile tool-serious (as P-174); cooling gate before EVERY hold: wait.mjs phone-temp --below 40.0 (900 s per wait, at
  most 4, then stop); stop rule: an end battery >= 43.0 C, or Critical, stops the block and the lead is messaged
question: does g0.0m shorten the longest frame around the people card's reveal (its paint moved before the flip),
  without more long frames on the flick or the approach?
windows (P-174's): FLICK = (mark flick, mark flick-end], APPROACH = (mark approach, mark approach-end]; both contain
  the frames before the flip into which g0.0m moves the paint (the flip is 1-2 s after the window opens)
primary 1, GAIN (lead ruling 1): R7 = the longest frame dt among the reveal frame k and frames k-3 .. k+3, per run
  (fixes/g0-0m/phone/g0m-reveal.mjs). FLICK: k = the first frame after pb-lite's is-visible flip; APPROACH: k = the first
  frame with scrollY >= the median FLICK flip y. d = median V - median C, FLICK decides:
    GAIN    d <= -4 ms (phone minShift) and at least 3 of 4 V runs below C's median
    NONE    -4 < d <= +2;   WORSE   d > +2
  APPROACH R7: the same reading, secondary
primary 2, no-worse: D1 frames dt > 50 per run, FLICK and APPROACH: d = median V - median C <= +2 (protocol §5.4);
  twins > 46 / > 54 must agree, else OPEN; near band (46, 54] flagged; minShift 4 ms
secondary (descriptive): reveal frame dt and Timeline Paint / Composite / Layout / Style ms; the 5 frames before it (max
  dt, Paint, Composite); P-174's FLICK reads (blurred frames, which must stay 0 on V's instant flicks; fadeInViewMs,
  deck photos, atFlick); > 34 (30 / 38); APPROACH X; whole-record > 50 / > 34
decisions:
  GAIN and D1 PASS in both windows -> g0.0m becomes the best build (the lead lands it, BEST_BUILDS, T-228)
  NONE and D1 PASS -> g0.0l stays best (g0.0m adds memory and idle paint for nothing); a finding, no landing
  WORSE, or D1 FAIL -> g0.0l stays best; the long frames go to D (window, Timeline record)
  OPEN -> at most one more block (sequential rule); the lead decides
validity: P-129's run gates G1-G6 on both records of an item (g0m-gates.mjs = P-174's); an invalid item is re-run once
  in TAIL (at most 2 per block)
sentinels: S0 after the warm-ups, S1 at the block end: the APPROACH program on C, Timeline off, no logger
logger: pb-lite.mjs on every FLICK record, both arms
order (one item per 600 s chrome-measure --no-timing hold, block under
  lock.mjs run iphone --owner fix-reveal-paint --block <ticket> --max-seconds 3600 --keep 120):
  H1 WC, H2 WV (uncounted warm-ups), H3 S0, H4-H11 EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4 (C V V C C V V C), H12 TAIL
pre-data checks: (1) iphone.mjs wda check READY; (2) Safari loads the LAN twin (I-260 probe) before H1; (3) kit dry run
  CM_DRY=1 on rev 3: 12 holds DRY ok, 3 servers serve B / C / V at the pinned hashes, both programs compile to the pinned
  hashes, GESTURE_BUDGET_S 150 each (done 14:38Z); (4) reader selftests: g0m-reveal reproduces P-174's reveal table and
  gives its R7 (g0.0l FLICK 44 / 48 / 49 / 51, APPROACH 60 / 49 / 54 / 57) (done); (5) Simulator count-only run of both
  programs on C and V rev 3: the flick lands, 7 approach drags reach y >= 3400 on both arms (done 14:33Z)
repairs: a link or WDA failure is repaired inside the hold (wda stop / start), never posted as a user step
expected minutes: ~60
```

```
PREDICTION P-175 · fix-reveal-paint · 2026-10-09
1 g0.0m rev 3 vs g0.0l (hashes above) · driver G · R7 (FLICK primary, APPROACH secondary), D1 > 50 (twins)
2 baseline: P-174 (same driver and programs, tool-serious, 2026-10-09 09:56-10:31Z), g0.0l = its V:
  FLICK R7 44 / 48 / 49 / 51 (median 48.5), APPROACH R7 60 / 49 / 54 / 57 (median 55.5); reveal frame Paint 9.5 /
  8.1 ms, Composite 36 / 40 ms; the 5 frames before it: max dt 17, Paint 0.6
3 closure: P-174's g0.0k (paint-light reveal, lazy photos): FLICK R7 35-41, APPROACH 42-47, i.e. ~10 ms below g0.0l,
  reveal Paint 2.6 / 1.2 ms. This is the floor if the moved paint costs nothing where it lands.
4 terms: | removed: in the reveal frame, the raster and allocation of the card, the two shells in view and their photos
  (phone: Paint ~+7 ms and Composite ~+10 ms over g0.0k) | added: the same paint 1-3 frames earlier, while the card
  enters the coverage rect mid-flick (Simulator: the 10 frames before the flip go from 0.47 to 2.6 Mpx2 painted and from
  13 to 53 ms max composite), ~22 MB of layers from load on |
5 prediction: FLICK R7 median V 42 ms [37, 48], d -6.5 [-12, 0]: GAIN ~55 %, NONE ~40 %, WORSE ~5 %. APPROACH R7
  median V 49 [43, 56] (the slow path also flips at 0.72 and gets the same pre-paint). D1 PASS in both windows (~85 %):
  the moved paint is spread over frames that were ~17 ms on g0.0l
6 falsified if: FLICK d > -4 (no gain), or the frames before the flip grow past 50 ms (D1 FAIL)
7 decision: as in the ticket
```
