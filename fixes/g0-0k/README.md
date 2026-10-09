# Build: g0.0k (g0.0j + PR-040's end of page)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** built and gated (Simulator and Chrome counts and pixels). Phone check card **signed by the lead as P-173**
(2026-10-09 ~04:25Z, before any data); block not yet run. Not the best build until the phone check passes.
**Stage:** F (build + gates) for PR-040, accepted by the user 2026-10-09 03:40:01Z (thread T-253).
**Device class / gate:** phone render-bound (end of page, nav morph); touch-only (G) for the phone check.
**Driver(s) behind the claims:** Simulator WDA finger strokes (`out/cm-return/simhold.mjs`, `endsim.mjs`,
`appsim.mjs`), Simulator animation log (`simsheen.mjs`), Chrome DOM probe (`bxchrome.mjs`), Chrome and Simulator
frozen-frame pixels (`fixes/g0-box/gates/px-chrome.mjs`, `px-sim.mjs`). No timing number anywhere.
**Topic:** cm-return (user T-253; PR-040 accepted); owner fix-cm-return.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (cm-return's nav and end-of-page code, plus one line),
`/_app/immutable/assets/2.gBuqKVzi.css` (cm-return's rules, g0.0j's people-deck rule, g0.0i's clock-layer rules).

## What g0.0k is

- **g0.0j** (the best build on main: g0.0h + g0.0i's menu clock layer + g0.0j's people-deck card fix)
- **plus PR-040** (`fixes/cm-return`, landed bc5c5040): above the end the page is unchanged; at the end of the page
  the menu grows with the finger again (v14's end: CM, K6's layer pre-build), with a constant 20 px glass (#27), the K6
  closed-bar jump fixed and the Join sweep replay fixed. Details and gates in `fixes/cm-return/README.md`.
- **plus one line** that keeps g0.0i's clock layer working on the new end (below).

| build | JS (sha256, 12) | CSS (sha256, 12) | how to rebuild |
|---|---|---|---|
| g0.0j (control) | 9162843e750f | bee7fce9ad56 | `node tools/fix.mjs apply g0-0j --reset` |
| **g0.0k** | **e0b7b1e7e158** | **a9d4fa8992d9** | `node tools/fix.mjs apply g0-0k --reset` |

- `patch.diff` is baseline-relative (`node tools/fix.mjs diff g0-0k`, +3576 / -339 lines); applying it to the baseline
  reproduces both g0.0k pins (checked).
- `delta.diff` is g0.0j -> g0.0k (`diff -u` of the two overlays, CSS then JS), for review.
- Immutable copies for a phone block: `out/cm-return/snapk/A` (g0.0j), `out/cm-return/snapk/V` (g0.0k), `HASHES.txt`.

### The one line: `html.fw-bx` (the clock layer's key)

- g0.0i's clock-layer CSS is scoped to `html.fw-bx`. In g0.0h-g0.0j that class was set by g0.0h's v3-W code, which tests
  the page's own WebKit marker (`` `GestureEvent` in window ``, every width; MDN browser-compat-data
  `api/GestureEvent.json`: Safari only).
- PR-040 replaces g0.0h's end with v14's, and v14's end has no v3-W. Without a fix, g0.0k would lose the clock layer.
- g0.0k sets the class with the same test, once at setup (JS, just before the setup call
  `(R && te && te.observe(R), _(), m(), N());`, pretty line ~15082):
  `` `GestureEvent` in window && document.documentElement.classList.add(`fw-bx`); ``
- B's CSS has no other `html.fw-bx` rule, so the class changes nothing else.
- g0.0i's two rules are carried unchanged (CSS end of file): `isolation: isolate` on the countdown wrapper, and
  `will-change: transform` on it while the menu panel's scene is active.

## Gates (2026-10-09, all OBSERVED in our setup)

Simulator: iPhone 15 Pro Max Simulator (iOS 26.5), functional sessions in the shared lane, 430x775 for pixels. Counts
and pixels only. J = g0.0j, K = g0.0k.

**1. The clock-layer key is off in Chrome** (lead's check: g0.0i's 1 css px digit shift must not come back;
`out/cm-return/bxchrome.mjs`, Chrome mobile emulation 430x932 DPR 3, touch, hover none, coarse pointer; and desktop
1280x800; top of the page and the bottom with the menu open):

| Chrome | top | bottom (menu open) | countdown isolation / will-change |
|---|---|---|---|
| mobile emulation | fw-bx not set | not set (`html.fw-ms.fw-cm`) | auto / auto |
| desktop | not set | not set | auto / auto |

PASS: `BX-CHROME OK: fw-bx never set in Chrome`.

**2. End-of-page counts and layers** (`endsim.mjs`, Simulator Timeline, 5 WDA swipes into the end and past the bottom,
then 5 back, 1 load per build; ms only rank arms inside one session):

| at the end | g0.0j | g0.0k |
|---|---|---|
| frames | 1418 | 1683 |
| paints / frame | 3.23 | 0.63 |
| layouts / frame | 0.81 | 0.44 |
| style recalcs / frame | 1.00 | 1.43 |
| forced style + layout ms | 669 | 1351 |
| layers / MB at rest near the end, menu closed | 46 / 77.2 | 53 / 103.6 |
| layers / MB, menu open | 57 / 100.6 | 56 / 95.3 |
| clock layer (menu open): layers / MB | 1 / 1.2 | 1 / 1.2 |

- The clock layer exists on g0.0k with the menu open, inside the CM wrapper (u3), the same size as on g0.0j: the fw-bx
  line works.
- The end-zone motion differs by design: g0.0j's menu opens by itself at the bottom (a tween on a held page); g0.0k's
  grows over 815 px of scroll. So the rows compare the end-of-page interaction, not the same motion.
- The same pattern as PR-040's gate 5 (g0.0h vs B): fewer paints and layouts per frame, more style recalcs and forced
  style + layout (v14's end code), 7 more layers at rest closed (K6's pre-built layers), fewer layers open.

**3. Finger cases at the end bar** (`simhold.mjs`, `logox.mjs`, `simsheen.mjs`; WDA finger;
`out/cm-return/simhold-2026-10-09T04-09-26-797Z`, `simsheen-2026-10-09T04-09-59-770Z`):

- Hold (finger to m 0.28 in 8 moves, held still, 12 shots): the 3 still shots are 0 px apart from the first still one
  (glass, logo, EN, Join; p64 0). No fall-back.
- Wiggle around m 0 (6 short strokes, 17 shots): glass sharpness 0.03-0.09 in every shot (frosted; a missing glass reads
  0.3-1.9). Logo / Join left edge: 37.3 / 296 css px closed before, **37.3 / 296 after the return** (no closed-bar jump;
  v14 showed 17.3 / 300); 42.3-47 / 296.3 while open near m 0, as PR-040's B.
- Join sweep (animationstart log at 9 rests): the intro plays once after load (m -1.5, as on g0.0j), then **0 replays**
  at the CM switches (pre on at m -0.5, pre off at -1.6, twice each).

**4. Pixels above the end** (T2: fill 64, edge 128, 0.5 %, cluster 2000 css px2; A = g0.0j, V = g0.0k, four loads A, V,
A2, V2; Join sweep and avatar carousel frozen):

| Simulator 430x775 (`out/g0box/p168/px-sim-*`, chain 1) | consistent diff | verdict |
|---|---|---|
| y 0, 548, 2403 | 0 | pass |
| y 1422 | 4 css px2 (0.0009 %, max 105) | pass |
| y 3384 | 4 css px2 (0.0009 %, max 27) | pass |
| **y 3875** | **3036 css px2 (0.76 %, max 77)** | **over T2** |
| **y 4200** | **4227 css px2 (1.05 %, max 232)** | **over T2** |

| Chrome 430x932 mobile (`out/g0box/p168/px-mobile-2026-10-09T03-57-50-250Z`) | consistent diff | verdict |
|---|---|---|
| y 0 | 0.0108 % (max 165), in the hero's accent word | pass |
| y 548 | 0.1457 % (max 87), the same accent word | pass |
| y 1422 | ~0 | pass |
| the other 10 stops | 0 | pass |

- The 2-of-7 Simulator stops re-checked on the restacked build (lead's item): **the same result as PR-040's gate 6**
  (0.76 % / 1.05 % there). All edge pixels (flat share 0) in the #platform section's profile card, stats and agents
  rows: the same content a fraction of a device pixel off, no whole-pixel shift aligns it. OBSERVED, cause UNRESOLVED;
  most likely the 815 px taller page (v14's end spacer) feeding #platform's scroll-linked shrink. Disclosed in PR-040
  and accepted with it; it is not new in g0.0k.
- Chrome: the hero accent word is page-own motion (A/A and V/V show it too).

**5. The approach frame at the platform crossing** (lead's item: F-368's remaining > 50 frame on g0.0j, fix-g0-box's
candidate 1; `out/cm-return/appsim.mjs`, `out/cm-return/appsim-2026-10-09T04-10-46-141Z/appsim.json`). Per load: fresh
URL, 4 s idle, instant scroll to y 900 (below the hero, above the crossing), 2.5 s rest, Timeline on, 6 WDA drags of
520 px / 1200 ms up (y after each drag 900, 1410, ... 3960 in all 6 loads), loads alternating J K J K J K. The frame
with the largest Layout + Style in y 1600-1900, against the band background (y 1000-3400 outside 1600-1900):

| load | crossing frame y | RenderingFrame ms | Layout / Style ms | Composite ms | paints | largest rAF gap in 1600-1900 | background L+S median / p90 |
|---|---|---|---|---|---|---|---|
| J-1 | 1709 | 148.6 | 22.4 / 34.8 | 96.0 | 20 | 142 ms at y 1718 | 0.5 / 1.4 |
| J-2 | 1709 | 137.2 | 21.8 / 33.0 | 82.8 | 19 | 124 ms at y 1718 | 0.5 / 1.4 |
| J-3 | 1709 | 128.5 | 19.4 / 30.4 | 77.6 | 19 | 117 ms at y 1718 | 0.9 / 1.5 |
| K-1 | 1709 | 19.8 | 3.4 / 4.4 | 3.1 | 1 | 19 ms | 0.4 / 1.5 |
| K-2 | 1709 | 28.6 | 1.9 / 3.2 | 4.4 | 1 | 59 ms at y 1856 (that frame: 7 ms, L+S 2) | 0.4 / 1.5 |
| K-3 | 1709 | 20.9 | 2.8 / 4.4 | 2.8 | 1 | 18 ms | 0.6 / 1.6 |

- **The style spike is gone on g0.0k**: L+S at the crossing 49.8-57.2 ms -> 5.1-7.8 ms, the frame 128-149 ms -> 20-29 ms,
  paints 19-20 -> 1, and the long rAF gap after it (117-142 ms) does not occur.
- Not quite the background: g0.0k's crossing frame still carries 5-8 ms of L+S (background p90 1.5). Something
  small still runs at that y in both builds (the platform zone's own IO work, presumably); it does not make a long frame
  in the Simulator.
- Why: g0.0j's `I()` calls `N()` when #platform enters the 200 % zone, which adds the non-passive window wheel and
  touchmove listeners (g0.0j pretty JS 14432-14447, read in the build). WebKit's first window wheel listener schedules a
  full style rebuild (F-360, CONFIRMED by WebKit source: `Document::invalidateEventListenerRegions` ->
  `scheduleFullStyleRebuild`, dom/Document.cpp 6648-6663). On g0.0k `N()` returns while `__msOn` (touch phones), so
  nothing is added at that crossing. That this add is the whole spike is OBSERVED (the frame's cost drops with it).
- **Lead ruling (2026-10-09 ~04:25Z): fix-g0-box's candidate 1 is CLOSED on g0.0k.** The 5-8 ms L+S residual at the
  crossing is below the card's 20 ms falsifier and shows no spike: residual, not pursued. fix-g0-box agrees (its
  status: closed-no-fix). The phone card reads the same frame (X) as a secondary only.

## Corrected cost text (PR-040)

PR-040's risk text said B adds v14's non-passive window wheel listener at setup. That misses the phone exception:

- B's end jack `N()` (pretty JS 15012-15021, called once at setup) returns early while `__msOn` is true, i.e. on touch
  phones (hover none, coarse pointer, short screen side <= 600 px, motion not reduced; JS 14454-14457).
- So **on phones g0.0k adds no window wheel listener and no non-passive touch jack**, at mount or later; only
  morph-scroll's passive touch set.
- Only where `__msOn` is false (desktop, reduced motion, screens wider than 600 px) does g0.0k add v14's non-passive
  window wheel listener once at setup (kept until teardown); g0.0h-g0.0j add theirs only when #platform reaches the
  200 % zone. In WebKit the first add triggers a full style rebuild (F-360), there in the mount frame.
- The same correction is in `fixes/cm-return/README.md` "Known costs". The accepted proposal itself is not revised: a
  revision would mark the user's decision stale (T-030), for a sentence that only removed a cost on phones.

## Phone check card: P-173 (signed by the lead 2026-10-09 ~04:25Z)

Signed as drafted below (in 62bcb5e4), before any P-173 data, with these rulings:
1. **D2 is signed as proposed**: END frames > 34, d <= +4, twins > 30 / > 38 must agree, is the no-worse rule for > 34
   (the END motions differ by design, and the user already judged the feel with PR-040). If D1 PASSES and D2 FAILS,
   the lead decides from X and the E-mark split.
2. Candidate 1 is closed on g0.0k (above); X stays a secondary on the phone.
3. PR-040 stays unrevised; the README correction is enough.
4. Phone health (user T-256, memory "phone-problems-fix-first"): `iphone.mjs wda check` and the kit dry run before H1;
   a link or WDA failure is repaired inside the hold (wda stop / start) and reported to the lead, never posted as a
   user step. Rebased on main first (I-257, 9c1d42ff): the kit runs FW_PHONE_CONDITION=tool with CM_PROFILE=tool-serious
   and `iphone.mjs gesture`, which I-257 left gated (I-257 dropped only the Xcode user steps and the gate on `record`
   without --profile).
5. The block runs under `lock.mjs run iphone --owner fix-cm-return --block P-173 --max-seconds 3600`.
6. **Pre-data ruling (lead, 04:3xZ, before any counted data):** if D2 comes out OPEN *only* because the > 30 twin
   disagrees, while D2 itself (> 34) and the > 38 twin pass, D2 counts as **PASS-with-note**. The 30-38 ms band is dense
   with two-frame 33.3 ms frames at the 60 Hz rate, so there the > 30 twin measures cadence, not stalls. The note lists
   the > 30 counts per arm. Any other disagreement (the > 38 twin, or either of D1's twins) stays OPEN under the card's
   rule. Neither case runs a second block without the lead's say. (Applied by hand to the frozen reader's per-threshold
   output; the reader itself is unchanged.)

7. **Amendment (lead, signed 04:5xZ, before the restart): option (a).**
   - Attempt 1 (04:26-04:56Z) stopped at H5 because the phone reached Critical. Battery per hold, start -> end (C):
     H1 38.4 -> 39.5, H2 39.6 -> 40.7, S0 40.8 -> 41.8, EC1 41.9 -> 42.5, EV1 42.5 -> 42.9 (Critical at the end gate,
     hold VOID). That is about +1 C per hold under tool-serious with no cooling.
   - Attempt 1's runs (S0 PASS 58.8 fps; EC1 valid; EV1 void, profileDrift) are kept in `out/g0kp-attempt1/`,
     descriptive only, never pooled.
   - The block restarts from H1 with the same card, reader and order.
   - Cooling is a gate under tool-serious, for this block only: before every hold, `wait.mjs phone-temp --below 40.0`
     (900 s per wait, waited again on a timeout, at most 4 waits, then stop). The lead chose 40.0 over 38: a hold adds
     about 1 C, so counted runs start at 40.0 or below and end near 41, under the 44 C ceiling; C V V C balances the order.
   - The block log prints the start and end battery of every hold (`BATTERY` lines); the result table gets that column.
   - New stop rule: a hold whose end battery reads >= 43.0 C, or Critical, stops the block (exit 12, or the VOID end
     gate), and the lead is messaged. No resuming without the lead.
   - Kit changes for this: `g0k-run.sh` sets CM_COOL=1; `g0k-block.sh` uses the 40.0 C cooling loop, the BATTERY lines
     and the stop rule. The reader is unchanged.

Kit and reader, frozen before the first counted run (sha256, 12; the amended block and run scripts are in the next table):

| file | sha256 |
|---|---|
| `fixes/g0-0k/phone/g0k-read.mjs` (selftest ok; also read P-172's g0.0j runs as arm C: X 51-52 ms at y 1747-1752, L+S 30-34 ms, END > 50 0, > 34 16-20) | d31bfc7a4de6 |
| `fixes/g0-0k/phone/g0k-block.sh` | 6e7632d54f91 |
| `fixes/g0-0k/phone/g0k-hold.sh` | 3aeadbf53957 |
| `fixes/g0-0k/phone/g0k-run.sh` | 80aeda4976fb |
| `fixes/g0-0k/phone/g0k-serve.sh` (snapshot out/g0kp-snap, HASHES.txt bcb64c57738b) | 937ae8dcb7dd |
| `fixes/g0-0k/phone/g0k-k.env` (no K arm) | 848094b02c9b |

Amended for attempt 2 (04:5xZ; dry run of all 12 holds ok, served hashes ok; the battery parser was checked on
attempt 1's real gate lines: 42.5 / 42.89):

| file | sha256 |
|---|---|
| `fixes/g0-0k/phone/g0k-block.sh` (40.0 C cooling loop, BATTERY lines, >= 43.0 C stop) | d4bef7eb6605 |
| `fixes/g0-0k/phone/g0k-run.sh` (CM_COOL=1) | 1892029d1a86 |
| `fixes/g0-0k/phone/g0k-read.mjs` (unchanged) | d31bfc7a4de6 |

The kit is a text-substitution copy of fix-scrollcb-g0's P-172 kit (`fixes/sticky-walk/phone/sw-*.sh`) with the
pins above; the reader imports eop-read.mjs's helpers (fix-g0-box). Note from the reader check on P-172's g0.0j data:
50-64 of g0.0j's END frames per run fall in (30, 38] (two 60 Hz vsyncs are 33.3 ms), so D2's twins sit on a dense band
and OPEN is a likely D2 outcome.

Pre-data checks, 2026-10-09 04:24Z: `iphone.mjs wda check` READY (WDA 16.13.6, iOS 26.6.1); kit dry run
(`CM_DRY=1 sh fixes/g0-0k/phone/g0k-run.sh P-173 H1:WC ... H12:TAIL`): the 3 servers serve the pinned hashes (B baseline,
C 9162843e750f / bee7fce9ad56, V e0b7b1e7e158 / a9d4fa8992d9), program fs 38d7fe5d7fa8 (GESTURE_BUDGET_S 229), all 12
holds DRY ok.

### Card as signed

```
TICKET g0.0k · V = g0.0k: JS e0b7b1e7e158 / CSS a9d4fa8992d9 (out/cm-return/snapk/V)
       control C = g0.0j (best on main): JS 9162843e750f / CSS bee7fce9ad56 (out/cm-return/snapk/A), same base
       HASHES out/cm-return/snapk/HASHES.txt, checked by the kit before every hold
driver G (WDA gesture), program fixes/g0-box/phone/g-fastshort-g0.json, compiled 38d7fe5d7fa8 (P-164 .. P-172's):
  approach (mark `approach`: up to 12 drags of 520 px in 1200 ms, x 215, 300 ms pause, until atEnd), then E20-E31 at
  the end: fast flings down (menu return) and up (menu grow) of 60 / 120 / 200 px, each followed by 2 re-approach drags
profile tool-serious (Serious induced by iphone.mjs rearm / thermal.mjs, no Xcode user step; thermal clear after the hold)
question: is g0.0k no worse than g0.0j at the end of the page under a G finger gesture (approach, menu grow and return),
  and is the approach's platform crossing frame (y ~1750) shorter?
arms differ by design at the end: C's menu opens by itself once the page reaches the pin (a tween on a held page, after
  the finger); V's grows over 815 px of scroll (100lvh) with the finger and its momentum. The same finger input in both.
parts per run (segment 0; a frame [t, dt, scrollY, innerHeight] covers (t - dt, t]):
  APPROACH = from the `approach` mark to the END start
  END      = from the END start to the run end; END start: C = eop-read's O1 (first prevented upward touchmove while
             closed, the jack at the pin); V = the first frame with scrollY >= docH - innerHeight - 815 (CM's m >= 0)
primary (no-worse), all frames in END (C's tweens run after the finger lifts, so not finger-down only):
  D1  END frames dt > 50 per run: d = median V - median C <= +2 (protocol §5.4), twins > 46 / > 54 must agree
  D2  END frames dt > 34 per run: d <= +4, twins > 30 / > 38 must agree
  near bands (30, 38] / (46, 54] flagged; minShift 4 ms
secondary (better, no landing condition):
  X   the crossing frame (p171-read's readX: the longest frame with scrollY in [1650, 1850] in APPROACH): median X.dt and
      median X's Layout + RecalculateStyles (Timeline) per arm; runs with X.dt > 50 / > 34 (twins)
descriptive: APPROACH finger-down > 50 / > 34 (twins); whole-run > 50 / > 34; END frames delivered; Timeline Layout and
  RecalculateStyles records >= 5 ms in END (count, total ms); END frames by E-mark (which stroke kind holds the slow ones)
decisions:
  D1 and D2 PASS -> g0.0k becomes the best build (lead updates BEST_BUILDS and T-228), landing on the less-work rule
  D1 FAIL -> g0.0j stays best; the END frames over 50 go to D (which E-mark, which Timeline record) before any rebuild
  D2 FAIL with D1 PASS -> the lead decides (threshold-sensitive no-worse)
  a twin disagrees -> OPEN (threshold-sensitive): at most one more block (sequential rule), the lead decides
  X decides only fix-g0-box's candidate 1 (closed on V if X's L+S sits near the band background and X.dt <= C's)
probe set: std + timeline (every counted run captures Timeline); sentinels = one uncounted Timeline-OFF control run right
  after the warm-ups (S0) and one at the block end (S1), P-129's numeric rule (moving fps >= 50, slow share <= 6 %)
order: H1 WC, H2 WV (uncounted warm-ups, one per arm port), H3 S0, H4-H11 EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4
  (C V V C C V V C), H12 TAIL (re-runs of INVALID counted runs, then S1)
gates per counted run: P-129's G1-G6 (p129-gates-g0.mjs, FS_HASH 38d7fe5d7fa8), unchanged
per run: battery temperature, charging state, thermal state; Safari parked after the block
kit: fixes/g0-0k/phone/ = text-substitution copies of fix-g0-box's P-171 kit (p171-serve/hold/block/run.sh: the eop kit,
  credit fix-g0-box) with these pins, logs out/g0kp, labels g0k-, no K arm, no analytics.js override (both arms serve the
  baseline's); reader g0k-read.mjs = eop-read's frame and Timeline helpers + the END split above + p171-read's readX,
  frozen (sha256 in the card) and selftested before any counted run
pre-data checks: (1) DONE 04:16Z, Simulator count-only run of the program on V (out/cm-return/gdry.mjs,
  out/sim/fix-cm-return-gesture-gdry-K-1791519254275.json): the approach reaches the true end (y 6035 = docH 6850 - 815)
  on drag 11 of the 12-drag cap (that drag starts at 5100 and the page runs on to 6035); every E close fling from 6035
  settles at 5220-5260 (closed, m ~0) and every E open fling from 5260 runs to 6035 (fully open); every re-approach
  ends at atEnd; 0 prevented touchmoves (no jack on phones, as the code says); 35 strokes, 1 segment. Margin: one spare
  approach drag; if a phone run needs a 12th, G5/G6 still pass, so the reader flags runs whose approach ended below
  docH - innerHeight - 815. (2) kit dry run (CM_DRY=1): servers serve the pinned hashes
expected minutes: ~65 (12 runs of ~230 s budget each in 600 s holds; P-172 took 66 min for the same layout)
```

```
PREDICTION P-173 · fix-cm-return · 2026-10-09
1 g0.0k (e0b7b1e7e158 / a9d4fa8992d9) vs g0.0j (9162843e750f / bee7fce9ad56) · driver G · END > 50 / > 34 (twins), X
2 baseline: no phone G run of g0.0j's END within 24 h (P-172 read only the approach); the block's own C runs are the
  baseline. P-172's g0.0j approach: X 51-52 ms at y 1747-1752 in every run
3 closure: Simulator only (endsim, 1 load per arm): END paints / frame 3.23 -> 0.63, layouts / frame 0.81 -> 0.44,
  style recalcs / frame 1.00 -> 1.43, forced style + layout 669 -> 1351 ms; closed-rest layers 46 -> 53, open 57 -> 56
4 terms: | removed: g0.0j's menu repaint per frame and the opening tween's relayouts | added: v14's per-frame style
  recalcs (CM keyframes' timeline, forced reads in __cmSet) | the crossing frame's listener add (none on phones in V:
  N() returns while __msOn; F-360's full style rebuild is the cost it carried on g0.0j) |
5 prediction: D1 PASS (~65 %), D2 PASS (~50 %: V's added style work could show as more 34-50 ms frames; the Simulator
  END > 34 count was higher for V, 119 vs 74, but over a longer motion and Simulator timing is never a verdict);
  X: V's median X.dt below C's and X's L+S near the band background (~75 %)
6 falsified if: V's END > 50 per-run median exceeds C's by more than 2, or X in V still carries an L+S spike >= 20 ms
7 decision: as in the ticket
```

## Not run

- No timing A/B in Chrome, no phone block (needs the lead's signature on the card above).
- Real finger (F) on the phone: not planned; the user already judged the look and feel on Try-it (PR-040 accepted).
