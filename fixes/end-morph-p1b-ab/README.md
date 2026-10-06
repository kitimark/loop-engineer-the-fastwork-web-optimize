# Fix: end-morph-p1b-ab (P1b: P1's reveal with the switch-on work moved off the open's first frame)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and the `delta-*.diff` files contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** measured in Chrome: values, states, pixels, trace counts and one clean headed frame-timing hold (all 5
lead conditions answered for Chrome). The Simulator gates and a phone card are still to do ("Not done").
**Stage:** F (build + Chrome gates), lead GO 2026-10-06 (the P1b cost card after P-153's FIRST-OPEN RISK SEEN,
`fixes/end-morph-p1/README.md` "Lead ruling (07:05Z)").
**Builds:** C = v9-final + F1 + U2 (JS a6426953727a, CSS e1359ab9994a); V = C + P1 (JS 4da641f828bb, CSS a81b9af7b2c9);
A = V + (a) (`fixes/end-morph-p1b-a/`, JS 79a0bd83eb06, CSS cfb8b8c5b019); AB = A + (b) (this topic, JS 8d2cf961a6cd,
CSS 78f569c3b983, served hashes as recorded by the gates).
**Device class / gate:** phone render-bound (WebKit paint in the open's first frames, P-153); Chrome counts and pixels
are the second view.
**Driver(s):** frozen frames (scroll-driven 7c stops, touch held), rAF-stepped scroll (states, trace counts).
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (F() and `__navProbeY` 13863-13877, `__msTick` 14320, the reveal
block after `__rvF`, `__rvW`), `/_app/immutable/assets/2.gBuqKVzi.css` (`.fw-rv-size`, one `[data-fw-rv]:not(.is-morphing)`
rule). Deltas: `fixes/end-morph-p1b-a/delta-*.diff` (V -> A), `delta-js-on-a.diff` and `delta-css-on-a.diff` (A -> AB);
`patch.diff` is against the baseline.

## Why it lags (P-153, then Chrome attribution)

P-153 (iPhone, block 2) passed no-worse but showed FIRST-OPEN RISK SEEN: the first frame of the open (f2) took C 31 ms
vs V 41 ms (median), over the +2 ms bound. In Chrome (6x CPU, 430x775, `fixes/end-morph-p1/p1b/first-open.mjs`, trace
counts, OBSERVED) the switch-on frame costs two things:

1. **Forced style and layout, twice.** `__rvW` sets `data-fw-rv`, then reads `I.offsetWidth`/`offsetHeight` (V JS
   14693): a forced restyle of 198 elements (7.4 ms at 6x). Its writes then make the nav hit test F() (JS 13865,
   microtask from `__msTick` at m <= 0.2) restyle and lay out again (27 elements and 16 dirty objects).
2. **Layers built and painted at the open.** The settled m = 0 removes `data-fw-rv`, so every open rebuilds and
   repaints the reveal's layers in its first frame: the glass (334 k css px), the panel backdrop (324 k), the header
   (305 k) and the centre block (159 k).

## What changed

- **(a) The panel size without a layout read** (`fixes/end-morph-p1b-a/README.md`). A hidden child `div.fw-rv-size`
  has the nav's full size (`var(--panel-w)` x `var(--panel-h)`). A ResizeObserver hands that size to the switch-on.
  When the size changes while the reveal is on (toolbar, rotation), the observer re-applies the clip at the same m.
- **(b) Arm the reveal ahead of the open.** From one end-track height above the end track (the unclamped morph value
  e >= -1, read in `__msTick`, touch phones <= 640 px only), the reveal is switched on at m = 0. The nav takes its panel
  size behind a clip that is today's pill, so the layers are built and painted in an approach frame and stay built
  across opens while the user stays near the end. Above the band (e < -1) it switches off as at the end of a morph.
  Getting m = 0 to look like today's pill took three things:
  - the nav's width transition is held off while armed (the `:not(.is-morphing)` list has `width 0.68s`; inline
    `transition-property` without width, removed from m > 0, where `.is-morphing`'s own list applies);
  - the logo is not absolutely placed at m = 0 (no `.is-morphing`), so it gets only the bar's 4 px shift back
    (`translate: dx 0`), not P1's `left: 0; translate: dx + inset ...` (that put it 16 px right; caught by the box probe);
  - the bar, logo and actions get no `will-change` at m = 0 (`[data-fw-rv]:not(.is-morphing)`). As their own layers
    they snapped the text to whole device pixels: the "Join waitlist" button drew 1 device px off, max level 236.
    They become layers with the open, as in V.
  - F() and the nav-hit-cache probe line (`__navProbeY`) take today's box at m from `__rvRect` while the reveal is on
    (the nav's own box is the full panel then).
- At m > 0 every write is P1's: AB vs V is 0 css px2 at m 0.02 / 0.05 / 0.1 (below).

## Gates (Chrome; counts, values, states and pixels; no timing)

### Condition 1: (a) exact, and the switch-on frame on its own

- Exact size at 430x775 / 815 / 932: the cached box equals the nav's `offsetWidth`/`offsetHeight` under
  `[data-fw-rv]` (406x751, 406x791, 406x908), fractional box too (`p1b/exact.mjs`,
  out/end-morph-p1/p1b/exact-2026-10-06T08-16-26-551Z.json).
- With the reveal on, the viewport changes 775 -> 815 -> 932 -> 775. The clip box height against the nav's current
  height at the current m:
  - A and AB: within 0.0005 px;
  - V: stale by +17.0 px (815) and +38.7 px (932), because P1 keeps its switch-on read.
  - Armed AB at m = 0: the pill stays 52 px at every height.
- Switch-on frame, trace counts. Headless Chrome 6x, 430x775, one cold load per arm. C is from the 07:32Z run of the
  same probe, V / A / AB from 08:36Z. Spans are trace marks, **not timing**.

  | first open frame (open1 f1) | C | V | A | AB |
  |---|---|---|---|---|
  | span (ms) | 28.9 | 37.8 | 31.2 | 26.1 |
  | script (FunctionCall ms) | 20.1 | 28.0 | 20.9 | 19.5 |
  | style ms (elements) | 8.8 (203) | 11.1 (232) | 7.2 (205) | 8.1 (205) |
  | forced read in `__rvW` | none | 198 els, 7.4 ms | none | none |
  | layout dirty objects | 9 | 20 | 16 | 10 |
  | paint ms | 4.45 | 6.41 | 5.76 | 2.87 |
  | repeat open f1 span (open2) | 24.9 | 33.2 | 26.0 | 26.0 |

  With (a), the frame's only forced style is F()'s, as in C: one style pass over about 200 elements, from `.is-morphing`
  going on. (a) removes V's extra pass. (b) also removes the layer build and repaint from this frame: AB's paint has
  no glass and no centre block (2.87 ms).
- Where (b) puts that work: AB's arming frame. In this probe it is the first approach frame, the same frame in which
  every arm re-measures the nav-hit cache (`__nsMeasure`, 134 elements).

  | that approach frame (approach f1) | V | A | AB |
  |---|---|---|---|
  | span (ms) | 32.2 | 27.8 | 40.5 |
  | style ms (elements) | 7.8 (143) | 8.4 (143) | 12.3 (157) |
  | paint ms | 8.1 | 6.6 | 14.0 (+ glass 333 k, backdrop 324 k) |

  The clean frames probe (`p1b/frames.mjs`, below) moves the arming frame inside the approach, away from that
  re-measure.

### Condition 2: >34 / >50 over the approach band and the switch-on frame

Run conditions:
- Headed Chrome, 6x CPU, 430x775 DPR 3, touch held (`p1b/frames.mjs`).
- One load per arm, 4 cycles: park at e = -1.5, approach in 45 rAF-stepped frames (31 of them in the band e >= -1),
  open in 40 frames, rest, close in 40 frames, rest.
- The hold was granted at 09:01:22Z by the host gate (not after its timeout), load1 3.8 -> 5.2. Served hashes as above;
  A and AB had the size probe before the first open.
- Output: out/end-morph-p1/p1b/frames-775-2026-10-06T09-01-22-507Z.json.
- An earlier headed run at 08:14Z was granted after a gate timeout (host about 54 % CPU). Its timing is tagged
  contaminated and not used; only its states are.

**No frame over 34 ms (k >= 5) and none over 50 ms (k >= 7) in any arm or cycle:**
- the band (4 x 31 frames) and the whole approach (4 x 45);
- the switch-on frame;
- the open's first 6 frames (4 x 6).

The approach adds no >34 frame. AB's highest band frame is 32.4 ms (k 4, cycle 3); C's highest is 25.9 ms.

The switch-on frame:
- for V and A it is open f2;
- for AB it is approach frame a15, the first frame in the band;
- C has no switch-on, so its open f2 is used.

| switch-on frame dt (ms), cycles 1-4 | median | k median |
|---|---|---|
| C open f2: 25.1, 17.2, 16.3, 16.4 | 16.8 | 2 |
| V open f2: 25.9, 33.9, 24.8, 25.9 | 25.9 | 3 |
| A open f2: 25.3, 17.0, 8.4, 16.8 | 16.9 | 2 |
| AB arming frame a15: 15.7, 25.1, 16.1, 15.8 | 16.0 | 2 |
| AB open f2: 25.7, 17.7, 16.9, 16.4 | 17.3 | 2 |

In Chrome, V's open frame is one tick (8.3 ms) over C. A, and AB both at its arming frame and at the open, are at C's
level. Chrome shows no >34 frame in any arm, so it cannot reproduce the phone's f2 symptom (C 31 vs V 41 ms on the
iPhone). The ms differences are 4 cycles of one load each: a direction, not a verdict.

### Condition 3: look

- **Through the approach and at m = 0, AB vs C** (`gates/em-p1-px.mjs`, A/V/A2/V2 loads, 430x775, after the logo and
  layer fixes; out/end-morph-p1/px-chrome-p1b-ab2-approach-2026-10-06T08-26-26*):

  | stop | e | AB armed | consistent beyond A/A |
  |---|---|---|---|
  | up-1.2 | -1.2 | no | 102 css px2 (platform section, A/A over8 2.7 %) |
  | up-1 | -1.0 | yes | 0 |
  | pre | -0.5 | yes | 0 |
  | up-0.5 | -0.5 | yes | 294 css px2 (platform section, A/A over8 2.0 %) |
  | up-0.1 | -0.1 | yes | 0 |
  | up0 | 0 | yes | 0 |
  | post (after a close) | -0.5 | yes | 0 |

  The nav and its parts are pixel-identical to C. The only non-zero cells are in the page's own shrink-track content,
  where C's own two loads differ too.
  Before the fixes the same gate showed the button 1 device px off (226 css px2, max level 236). The box probe showed
  the logo 16 css px right (in that shot the logo is white on a light page, so the pixel diff hid it). The box probe
  after the fixes (`p1b/rects.mjs`): logo, actions and earn button boxes equal to C to 0.001 px, and no own layer at
  m = 0.
- **In the morph, AB vs V** (P1's look, unchanged): every stop 0 css px2 beyond A/A: pre, up0, m 0.02 / 0.05 / 0.1 / 0.19 / 0.5 / 1, down 0.5 / 0
  (out/end-morph-p1/px-chrome-p1b-ab-vsV-m1-*, -m2-*). The post stop (after a close, armed) is 68 and 9 css px2 in
  the platform section's own content (A/A over8 0.1 / 2.1 %), 0 in the nav.
- **is-on-dark per frame vs C:** equal in every frame for V, A and AB, in three runs:
  - the clean 09:01Z hold: 4 cycles x 149 frames, final AB;
  - the headless 08:49Z run: 2 x 149, final AB;
  - the 08:14Z run: 5 x 134, AB before the logo and layer fixes, which change no class.

### Condition 4: heat and memory (expected; OBSERVED in Chrome only)

- While armed, AB keeps the reveal's layers. In the trace's paint areas that is the glass 333 k, the backdrop 324 k,
  the header 305 k and the centre block 159 k css px: about 1.1 M css px, about 10 M device px at DPR 3, about 40 MB of
  tiles at 4 B/px (expected, not measured on the phone).
  - V holds them only while the morph moves.
  - AB holds them as long as the user is within one end-track height of the end, or in it.
- Per frame while armed and scrolling: the glass blurs the page under the pill, as today's nav blur does. The other
  layers are not repainted (no paint of them in the approach frames after arming, Chrome trace, OBSERVED).
- Heat on the phone: expected small (no per-frame paint added). It needs the phone block to be shown.

### Condition 5: fix-i219-hydrate

Told (08:18Z): (a) appends `div.fw-rv-size` as the nav's last element child; (b) keeps `data-fw-rv` and inline
translates on the nav bar parts during the approach. No collision (its reply): its insert uses element queries
inside the earn button only.

## Dependence on F1 and U2 (lead 09:05Z, P-152 FAIL; no new measuring)

F1 + U2 (v9-final -> C, 4 hunks):
- F1 is one line: `#platform` gets `visibility: hidden` when its `--morph-fade` reaches 0.
- U2 (nav-hit-cache) defers `_()`'s nav hit test to `__msTick` while the morph is open (`__nsMsPend`). It is keyed on
  r, the value that shows, at m <= 0.2.

**Code:**
- P1 has no line in common with F1 or U2. P1 was built on v9-final (602aae528fe3) and applies there.
- P1b (a) touches only the header component.
- P1b (b)'s `__msTick` hunk (the `__rvArm(e)` call) has U2's comment lines as its trailing context. It applies on
  v9-final + U2 but is rejected on plain v9-final; the re-port is mechanical (the same call before the clamp).
- Strict applier, `-F 0`:

  | base | P1 | P1b (a) | P1b (b) | result JS |
  |---|---|---|---|---|
  | v9-final + U2, no F1 (4389044c1ec4) | ok | ok | ok | 92d221ae3bdd |
  | v9-final (647c9ef2b1e2) | ok | ok | 1 of 7 hunks rejected (U2 context) | — |

  - On v9-final + U2 (no F1) the result equals AB except F1's one line; CSS is unchanged (78f569c3b983; F1 changed no
    CSS).
  - Intermediate JS on that base: + P1 = cd4529f7beaf, + P1b (a) = b2649198b591.

**Behaviour:**
- Neither P1 nor P1b reads or writes `#platform`, `--morph-fade` or its visibility. The reveal works on the header
  only.
- F1 acts at full fade (m around 0.55 and up). There P1's panel is opaque over the page in both arms, and `#platform`
  is at opacity 0 with or without F1.
- (b) arms at m = 0 in the approach, where F1 does nothing.
- U2:
  - F() runs in `__msTick`'s microtask with or without U2, so P1 reads the nav after Svelte's flush either way.
  - Armed at m = 0, `C()` is false, so U2 does not defer anything there; the hit test runs as without the reveal.
  - `__rvRect` gives F() today's pill box on either base.
  - Without U2, `_()` also tests in the frame before `__msTick` writes. With the reveal on, that test still sees today's
    box through `__rvRect`.

**P-153's NO-WORSE PASS on a base without F1:** expected to hold, not shown.
- P-153 compared C against V = C + P1 on one shared base. F1's change sits in a code path P1 does not touch, and is
  present or absent in both arms alike. What P1 removes (the per-frame repaint of the photo-wall tracks, header, footer and centre in the end
  zone) does not depend on `#platform`'s visibility.
- Absolute end-zone counts would differ without F1. F1's own phone result is P-152 (FAIL, its own question).
- The FIRST-OPEN RISK (P1's switch-on frame) has nothing to do with F1.
- Only a block on that base can confirm the no-worse direction (reasoning, not data).

## Simulator gates (B1 arms, `gates/em-p1-px.mjs --engine sim`, shared simulator slots, 09:11-09:22Z)

| gate | stops | consistent beyond A/A |
|---|---|---|
| approach, C1 vs AB1 | pre (e -0.5), up0, e -0.5 / -0.25 / -0.1, post | 0 |
| | e -1.2 (not armed) | 6 css px2 (#platform, max 32) |
| | e -1 | 401 css px2 (max 56); rerun with settled transitions: 16 (A/A over8 2.7 %) |
| | e -0.75 | 401 css px2 (max 56), the same in the rerun |
| morph, V1 vs AB1 | pre, up0, m 0.02 ... 1, down 0.5 | 0-2 css px2 |
| | down 0.1 / 0 / post | 42-47 css px2, in the iOS status bar (the clock), not the page |

Notes:
- The e -1 / -0.75 cluster is one card photo in `#platform` (`agents-ask-service`). The difference is identical in
  both pairs: max level 56, mostly edges (flat share 0.016), 0.1 % of the screen.
- It looks the same by eye (crops checked), and it is within T2's numbers (fill 64, edge 128, 0.5 %). It is not
  pixel-identical.
- Cause UNRESOLVED. In our setup the photo is resampled differently while the full-size nav layer is held above it, at
  those two scroll positions only.
- WebKit arms as Chrome does: `data-fw-rv` is on at every armed stop and off at e -1.2.
- The rerun needed a fix in the gate: `--settle-transitions` parsed the Simulator's already-parsed result
  (`gates/em-p1-px.mjs` line 135).
- Out: out/end-morph-p1/px-sim-sim-p1b-{approach,morph}-B1-*, px-sim-sim-p1b-approach-B1-settle-*.

## Base snapshots without F1 (lead 09:10Z: F1 is out, P-155 decides U2)

`node fixes/end-morph-p1/p1b/snap.mjs` builds read-only overlay copies in `out/p1b/snap/` (`HASHES.txt`) from
committed inputs with a strict applier:
- inputs: v9-final = P1's build base, `out/em1/c-2.DyWL8TcE.js` 647c9ef2b1e2;
- U2 = the v9-final -> P-153 C diff minus F1's one hunk (equal to P-155's U arm);
- P1 = `fixes/end-morph-p1/delta.diff`; P1b = the four delta files here and in `end-morph-p1b-a`.

| base | arm | JS | CSS |
|---|---|---|---|
| B1 = v9-final + U2 | C1 (control) | 4389044c1ec4 (= P-155's U) | e1359ab9994a |
| | V1 = C1 + P1 | cd4529f7beaf | a81b9af7b2c9 |
| | AB1 = V1 + P1b | 92d221ae3bdd | 78f569c3b983 |
| B0 = plain v9-final | C0 (control) | 647c9ef2b1e2 (= P-152's C) | e1359ab9994a |
| | V0 = C0 + P1 | 602aae528fe3 (P1's original V) | a81b9af7b2c9 |
| | AB0 = V0 + P1b, (b) re-ported | 7125cd1e7e58 | 78f569c3b983 |

Checks:
- AB1 equals this topic's overlay minus F1's line.
- AB0 differs from AB1 by exactly U2's three hunks. B0's `__msTick` hunk is the re-port: the same `__rvArm(e)` call
  after `e = t > 0 ? ... : 0;`.
- `node --check` passes on all six.

## Phone card (DRAFT, no P-id; runs after P-155; predictions written before any data)

**Question:** on the base P-155 picks (B1 if U2 lands, else B0), does P1 + P1b:
- open the end zone's first frame no slower than C;
- stay no-worse in the end zone;
- add no slow closing frames by holding the reveal's layers (about 40 MB, Chrome estimate) while armed?

**Arms:** C = the base's control (C1 or C0), X = AB1 or AB0 (table above), served from the immutable copies.

**Driver and profile:**
- driver G with P-152/P-153's gesture program and pin (`g-fastshort-v1.json` df597802d2f0);
- profile xcode-serious;
- rev 1.4 hold rules: one counted run per hold, Safari parked and cooling before every hold, thermal gates, the
  2 h background limit per part;
- sentinels S0/S1 on C.
- Order: warm-ups WC, WX, then S0; counted C X X C C X X C (4 v 4), then TAIL and S1.

**Part B, the armed-layer check** (new, two holds per arm, order SC1 SX1 SX2 SC2, after part A):
- the gesture sits armed near the end: scroll to e = -0.5, rest 8 s with no touch, open to m 0.8, rest 2 s, close to
  m 0, rest 3 s; three times per run;
- it needs a new G program (`g-sitclose-v1`, built and dry-run with `gesture --dry-run` before the lead signs);
- on C the same positions are idle, with nothing held.

**Metrics** (reader = P-153's `p153-read.mjs` plus P-155's CB34):
- O1.f2: first open, P-153's definition.
- End zone: moving last-screen frames at >34 and >50, plus twins.
- CB34 / CB50: P-155's definition, closing frames at 0.2 <= m < 0.55 with dt > 34 / > 50. Counted in part A, and
  separately in part B's closes.
- Band34: moving frames in the approach band, -1 <= e < 0, with dt > 34.
- Part B: sit34, frames over 34 ms during the armed rests (static; the expected count is 0).

**Prior data (exploratory, decides nothing):** P-153's runs, read again with CB34 (on the F1+U2 base):

| | runs | median |
|---|---|---|
| C CB34 | 11 / 10 / 11 / 16 | 11 |
| V (+ P1) CB34 | 4 / 5 / 7 / 5 | 5 |
| C CB50 | 1 / 1 / 1 / 2 | 1 |
| V CB50 | 0 / 0 / 0 / 0 | 0 |

P1 already holds the same layers during every close. CB34 went down with it, not up.

**Predictions** (bounds fixed now):
- **Pr1, first open:** median X O1.f2 - median C O1.f2 <= +2 ms, so no FIRST-OPEN RISK. In P-153, C was 31 and V
  41 ms. Chrome puts X's switch-on in the approach, and X's open frame at C's level. If X - C > +2: P1b did not move
  WebKit's cost, and the cause there is not the forced read or the layer build seen in Chrome.
- **Pr2, end zone no-worse:** P-153's rule unchanged. WORSE when the runs are separated, or when the median exceeds
  +2 at >34 or +1 at >50 with p <= 0.05. Expected PASS with X below C, as in P-153's V.
- **Pr3, armed layers on the close:** X - C median CB34 <= +3 (part A, 4 v 4). The F1-like signature,
  X - C >= +8 with every X run above every C run, reads **ARMED-LAYER COST SEEN**: X does not land, whatever Pr1/Pr2
  say. Part B is reported per arm and decides nothing alone.
- **Pr4, approach:** X - C median Band34 <= +2, with no X run separated above C (the arming frame adds at most one
  frame).

**Outcomes:**

| outcome | reading |
|---|---|
| Pr1-Pr4 hold | P1b removes P1's first-open risk at no closing or approach cost: land request. |
| Pr1 fails, others hold | the first-open cost on WebKit is elsewhere: back to attribution (Timeline on O1). |
| Pr3 or Pr4 fails | arming costs on the phone: drop (b), and consider (a) alone (its look and frames equal P1's). |
| Pr2 fails | P1b is worse than C in the end zone: no landing; read part A's Timeline. |

**Heat:** record the battery temperature and thermal state per hold. A hold at Critical or over 44 °C is void (rev
1.4). X holding its layers while armed is expected to add no per-frame work; part B's rests show whether it does.

## Not done

- Simulator gates (pixels at m = 0 and through the approach, is-on-dark, WebKit's clip-path recomposite at m = 0)
  after P-152's block.
- Phone: P1b needs its own phone card (first-open f2, no-worse) before landing.
