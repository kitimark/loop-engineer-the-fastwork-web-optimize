# Build: g0.0l (g0.0k + PR-041's instant reveal)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** g0.0l rev 2 is built and gated (counts and pixels; snapshot b1789284481295-a455e793). Every rest-pixel stop is
inside T2 in Chrome (mobile, Reduce Motion, desktop) and in the Simulator. Phone check P-174 was signed by the lead
2026-10-09 ~09:5xZ; the block is running (no result yet).
**Stage:** F (build + gates) for PR-041, which the user accepted 2026-10-09 07:23:45Z (option instant).
**Device class / gate:** phone render-bound (people section reveal); touch-only (G) for the phone check. The landing
rule is less-work: counts and pixels, plus a short phone no-worse check.
**Driver(s) behind the claims:** Chrome DOM / pixel probes (`gates/px-chrome.mjs`), Simulator pixels
(`gates/px-sim.mjs`), Simulator WDA strokes (`fixes/people-blink/pb-frames.mjs`, count-only `phone/g0l-simdry.sh`). No
timing number anywhere.
**Topic:** people-blink (user T-228 #149; PR-041 accepted). Owner: fix-scrollcb-g0.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` (the people section's mount effect: `l()`, mount and cleanup),
`/_app/immutable/assets/2.gBuqKVzi.css` (one rule appended).

## What g0.0l is

- **g0.0k** (the best build on main, `fixes/g0-0k`)
- **plus PR-041 option instant** (`fixes/people-blink--b2`; cause read and checks in `fixes/people-blink/README.md`):
  - When `.is-visible` turns on while the page scrolls at >= 0.8 px/ms, `#people` gets `data-fw-reveal="instant"` for
    400 ms, and a CSS rule takes the card's transitions off, so the card shows at once.
  - Slow scrolls, rest, scroll-up and reduced motion keep today's fade.
  - Deck photo preload: the active and the next profile's images are switched to `loading = eager` and decoded ahead.
- **rev 2** (2026-10-09, after the round-1 and round-2 gates; lead's suggestion). The preload now runs:
  - only on touch screens (`(hover: none) and (pointer: coarse)`), where the instant reveal was asked for;
  - only after the window `load` event (then 1.5 s, then an idle callback with a 2 s cap). Before, it could start before
    `load` and hold back what waits for `load` (fwBoot's arming, the deferred mount). The listener is removed at
    teardown.
  - The reveal code is unchanged. `fixes/people-blink--b2` (the proposal's Try-it build) stays rev 1.

| build | JS (sha256, 12) | CSS (sha256, 12) | how to rebuild |
|---|---|---|---|
| g0.0k (control) | e0b7b1e7e158 | a9d4fa8992d9 | `node tools/fix.mjs apply g0-0k --reset` |
| g0.0l rev 1 (gates rounds 1-2 only) | ac48233916ad | 440582cec781 | `fixes/people-blink--b2/patch.diff` |
| **g0.0l rev 2** | **4106679e0a8a** | **440582cec781** | `node tools/fix.mjs apply g0-0l --reset` |

- `patch.diff` is baseline-relative (`fix.mjs diff g0-0l`). Applying it to the baseline reproduces rev 2's pins
  (checked after the rebase on 3607d3b3).
- `delta.diff` is g0.0k -> g0.0l rev 2 (`diff -u` of the two builds, CSS then JS), for review.
- Immutable copies for the phone block: `out/g0-0l/snap/{C,V}` (C = g0.0k, V = g0.0l rev 2) with `HASHES.txt` (sha256
  12: fa8ce0315555), made by `phone/g0l-snap.sh` from the committed patches. The script refuses to rebuild an existing
  snapshot. Rev 1's snapshot (7391321242fa) was deleted; it never served a phone run.

## Gates (counts and pixels only; all OBSERVED in our setup)

Final round: round 3, 2026-10-09 09:10-09:30Z, on rev 2 and snapshot b1789284481295-a455e793. Rounds 1-2 (rev 1) are
history below; no round is pooled with another.

**1. Console errors and 404s** (`fix.mjs check`, headless, mobile + desktop, against the baseline): g0.0k
(`check people-blink`, overlay = g0.0k) and g0.0l rev 2 (`check g0-0l`): 0 errors, 0 4xx, morph reached, all 4 pages
each.

**2. Pixels at rest** (T2: fill 64, edge 128, 0.5 %).
- Loads A = g0.0k, V = g0.0l rev 2, in the order A, V, A2, V2; the avatar carousel frozen.
- "Consistent" = A~V and A2~V2 both differ beyond A/A at the same pixels.
- Chrome mobile and desktop ran with `PX_T0=12000`, see the note below the table.

| stop y | Chrome mobile 430x932 (`PX_T0`) | Chrome mobile, Reduce Motion | Chrome desktop 1440x900 | Simulator 430x775 |
|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0.0034 % max 157 (flat 0) |
| 300 | 0 | 0.0065 % max 30 | 0 | - |
| 548 | - | - | - | 0.031 % max 65 |
| 600 | 0 | 0.0065 % max 30 | 0 | - |
| 900 | 0.054 % max 63 | 0.055 % max 63 | 0 | 0.0048 % max 30 |
| 1300 | 0.061 % max 63 | 0.067 % max 63 | 0 | 0.0009 % max 28 |
| 1600 | 0.061 % max 63 | 0.067 % max 63 | 0 | 0 |
| 2300 | 0 | 0 | 0 | 0 |
| 3000 | 0 | 0 | 0.136 % max 37 | 0 |

All inside T2. What remains:

- **The deck photos on Chrome mobile (0.05-0.07 %, max 63, edges only).** The same files (equal currentSrc and
  naturalWidth) are drawn at slightly different resampling after `decode()`. Rev 2 keeps the decode on touch screens,
  and Chrome's mobile emulation counts as one (touch emulation on).
  - Attribution on desktop, rev 1, before the touch gate (`gates/run-attr.sh`; out/g0-0l/snapx: N = no decode,
    E = no eager switch): C~N 0, C~E = C~V.
  - On desktop the size of the diff depended on the stops visited before y 900: 0.03 % after a direct jump, 0.60-0.80 %
    after the 0 / 300 / 600 stops.
  - Rev 2 runs no preload on desktop: 0 at y 900-1600.
  - OBSERVED; why a decode ahead resamples differently is UNRESOLVED (it was not needed for the decision).
- **Desktop y 3000 (0.136 %, max 37, flat 0.001):** below the people section, 0 in rounds 1-2. Under T2 and not
  investigated.
- **Why `PX_T0` (Chrome).**
  - Without it, round 3's mobile run showed the hero accent word at y 0-600 (about 1 %, fill) and the avatar row at
    y 1300/1600 (0.69 %) frozen at another phase on V.
  - Cause: rev 2's preload starts its network loads after `load`, so it ends the gate's network-quiet wait later. The
    recorded settle page times were C 6238 / 5818 ms and V 7747 / 7388 ms, so V froze its self-animated content later.
  - `PX_T0=12000` makes every load wait until page time 12 s before the freeze (stall at 12003-12004 ms in all four
    loads). Both diffs are then 0.
  - So they are freeze-phase artifacts of the gate, not a look change.
- **Simulator:** inside T2 at every stop.
  - Round 1's avatar-row diff (0.43 / 0.64 %, V and V2 one slide on) did not come back in rounds 2 and 3.
  - The per-stop sliding record shows the frozen phase is random per load, not per build (round 2: A 0, V 1, A2 1,
    V2 0).

**3. The reveal mechanism** (Simulator s6-s8, `fixes/people-blink/README.md` "Checks", on rev 1 pins:
A e0b7b1e7e158/a9d4fa8992d9 = g0.0k, P ac48233916ad/440582cec781 = g0.0l rev 1). Rev 2 changes only when the preload
starts and where it runs. The reveal code (`fwRevealGate`, the CSS rule) is byte-identical, so the reveal rows carry
over. Gate 4 re-checks the preload on rev 2.

| check | g0.0k | g0.0l |
|---|---|---|
| fast flick (300 px / 220 ms): `data-fw-reveal` at the flip | never | every flick (removed +400 ms) |
| fast flick: card transitions at the reveal | opacity, filter, transform | none |
| fast flick: sharpness while the deck comes in (y 450-1260) | 1.6-3.8 | 13.3-13.8 |
| **slow drag** (520 px / 1200 ms, 0.47-0.57 px/ms at the flip): attribute / transitions | never / today's | **never / today's (no trigger)** |
| scroll up: hide transitions | today's | today's |
| **early photo loads**: deck photos (first 3 profiles) loaded before the first flick | 0 of 15 | **15 of 15** (rev 1) |

**4. Count-only dry run of the card's G programs on rev 2** (Simulator, `phone/g0l-simdry.sh`, 09:2xZ):

| | flick: yLand | deck in view / flip (ms after the flick mark) | blurred frames, fade in view | `#people` img loads before the flick | instant set | approach |
|---|---|---|---|---|---|---|
| C (g0.0k) | 1592 | 1055 / 1144 | 39, 797 ms | 10 | 0 | 7 drags to y >= 3400 |
| V (g0.0l rev 2) | 1461 | 943 / 1044 | 0, 101 ms | 29 | 1 | 7 drags to y >= 3400 |

- The preload still runs on the touch Simulator after the load event (29 loads before the flick, against 10).
- V's ~100 ms of "fade in view" is the 0.72 threshold. The deck's top enters the view about 100 ms before
  `.is-visible` turns on, in both builds; only after that does C's fade start.
- Both programs ran as 1 segment with 0 prevented touchmoves.

**History: rounds 1-2 (rev 1, ac48233916ad / 440582cec781).**
- Round 1 ran on the old snapshot, 07:27-07:41Z. Round 2 ran on b1789284481295-a455e793, 08:51-09:08Z.
- fix.mjs check: 0 / 0 in both rounds.
- Chrome mobile / Reduce Motion: at most 0.068 %, max 63, in both rounds.
- Chrome desktop y 900 was over T2: 0.60 % (round 1) and 0.80 % (round 2), max 117, the deck photos. That is the
  decode() diff that led to rev 2.
- Simulator, round 1: the avatar-row artifact. Round 2: inside T2.

## Phone check card: P-174 (signed by the lead 2026-10-09 ~09:5xZ)

Signed as drafted in a3d6ea64, before any P-174 data, with these rulings:
1. **D1 as drafted:** both windows need d <= +2, and the twins must agree, else OPEN. An OPEN runs no second block
   without the lead's say.
2. **A misfire stops the block:** if V shows blurred frames on a flick that set the instant attribute, the runner stops
   and tells the lead before any landing. The other secondary FLICK reads (fade in view, photo loads) stay
   descriptive.
3. **PX_T0=12000 is accepted as a gate-only fix:** every Chrome load freezes at the same page time; see Gates 2. The
   desktop y 3000 stop (0.136 %, max 37, inside T2) stays disclosed.
4. **Deck photos complete at each flick mark:** every FLICK run records them. `pb-lite.mjs` gains a PerformanceObserver
   on the gesture's `fwg:flick` mark, recording [page ms, complete active + next shell, total active + next, complete
   all shells, total all]. The reader prints it as `atFlick`.
   - Checked on the Simulator before any phone data (`phone/g0l-simdry.sh`, 09:4xZ): C 7 / 26, V 26 / 26.
   - The first try matched the bare name `flick` and recorded nothing; the gesture runner prefixes its marks `fwg:`
     (tools/lib/gesture-rec.mjs `markJs`).
   - This is the only kit change after the signature, in the same commit as this paragraph: pb-lite.mjs and
     g0l-read.mjs get new hashes (table below).
5. **P-173's safety rules:**
   - cool below 40.0 C before every hold;
   - stop at an end battery >= 43.0 C, or Critical;
   - `iphone.mjs wda check` first;
   - a link or WDA failure is repaired inside the hold (wda stop / start), never posted as a user step.
   The block runs with CM_TICKET=P-174 under `lock.mjs run iphone --owner fix-scrollcb-g0 --block P-174
   --max-seconds 3600`.

The card below is unchanged from a3d6ea64 apart from the ticket id. The kit is frozen at the hashes in the table.

```
TICKET P-174 · V = g0.0l rev 2: JS 4106679e0a8a / CSS 440582cec781 (out/g0-0l/snap/V)
       control C = g0.0k (best on main): JS e0b7b1e7e158 / CSS a9d4fa8992d9 (out/g0-0l/snap/C), same base
       HASHES out/g0-0l/snap/HASHES.txt (fa8ce0315555), checked by the kit before every hold; B = the plain baseline
       (the thermal gate's timer page)
driver G (WDA gesture), two programs per counted item, each ONE segment (P-129 gates):
  FLICK    fixes/g0-0l/phone/g-flick-g0l.json, compiled 22b636f36a82: reload, 4 s idle, mark flick, one flick up
           300 px / 220 ms (pb-land's stroke: on the phone it landed with the deck in view, y 1316-1440), until settled,
           mark landed, 3 s rest, mark flick-end
  APPROACH fixes/g0-0l/phone/g-approach-g0l.json, compiled 65f6de58009c: reload, 4 s idle, mark approach, P-172's
           approach drags (520 px in 1200 ms, x 215, 300 ms pause) until y >= 3400 (at most 9; Simulator: 7), settle,
           mark approach-end. 0.43 px/ms: under the 0.8 px/ms gate, so V takes the slow path here
profile tool-serious (Serious induced by iphone.mjs rearm, FW_PHONE_CONDITION=tool, no Xcode step; thermal clear after
  the hold); cooling gate before EVERY hold: wait.mjs phone-temp --below 40.0 (900 s per wait, at most 4, then stop);
  stop rule: a hold whose end battery reads >= 43.0 C, or Critical, stops the block, and the lead is messaged (P-173's)
question: is g0.0l no worse than g0.0k in long frames on the deck-landing flick and on a slow approach through the
  people section, and does the flick land with the card shown at once?
windows (a frame [t, dt, scrollY, innerHeight] of segment 0 covers (t - dt, t]):
  FLICK    = frames with t in (mark flick, mark flick-end]   (the flick, its momentum, the reveal and 3 s of rest)
  APPROACH = frames with t in (mark approach, mark approach-end]
primary (no-worse), per window:
  D1  frames dt > 50 per run: d = median V - median C <= +2 (protocol §5.4); twins > 46 / > 54 must agree, else OPEN
      (threshold-sensitive); near band (46, 54] flagged; minShift 4 ms. The card's D1 is PASS when both windows PASS
secondary (no landing condition; FLICK records, page log pb-lite.mjs):
  blurred frames = page-log rAF frames with the deck in view while the card's filter transition runs
  fadeInViewMs   = deck in view before the card is fully shown (to the opacity transitionend; with no transition, to
                   the is-visible flip): the screen's blank and fading time is part of it
  deck photos    = <img> loads in #people before the flick mark and from deck-in to flick-end; instant attribute set
descriptive: > 34 (30 / 38) per window; APPROACH X = the longest frame with scrollY in [1650, 1850] (the platform
  crossing, P-173's X); whole-record > 50 / > 34; Timeline Layout / RecalculateStyles / Paint per window
decisions:
  D1 PASS in both windows -> g0.0l becomes the best build (the lead lands it, updates BEST_BUILDS and T-228)
  D1 FAIL in either window -> g0.0k stays best; the > 50 frames go to D (which window, which Timeline record) first
  OPEN -> at most one more block (sequential rule); the lead decides
  secondaries: V's blurred frames must be 0 on every flick that set the attribute; if not, a mechanism finding for D,
  not a landing condition
validity: P-129's run gates G1-G6 on BOTH records of an item (fixes/g0-0l/phone/g0l-gates.mjs: the P-129 reader with G6
  accepting the two programs above; G4 idle 4.0-5.5 s); an invalid item is re-run once in TAIL (at most 2 per block)
sentinels: S0 after the warm-ups, S1 at the block end: the APPROACH program on C, Timeline off, no logger; P-129's rule
  (moving fps >= 50, slow share <= 6 %); a failing sentinel voids every counted run since the last passing one
logger: pb-lite.mjs on every FLICK record (counted and warm-up), both arms: a rAF scrollY log (neutral, P-023), an
  attribute observer on #people only (class, data-fw-reveal), transition and img-load listeners on #people. Not on
  APPROACH records or sentinels
order (one item per 600 s chrome-measure --no-timing hold, block under
  lock.mjs run iphone --owner fix-scrollcb-g0 --block <ticket> --max-seconds 3600 --keep 120):
  H1 WC, H2 WV (uncounted warm-ups, one per arm port: FLICK + APPROACH, Timeline off, --warmup), H3 S0,
  H4-H11 EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4 (C V V C C V V C), H12 TAIL (re-runs of invalid items, then S1)
per hold: battery start and end (BATTERY lines), thermal state, charging; Safari parked after every record and the block
pre-data checks: (1) wda check READY before H1, (2) kit dry run (CM_DRY=1, DONE 09:31Z on rev 2: 3 servers serve B / C / V
  pinned hashes, both programs compile to the pinned hashes with GESTURE_BUDGET_S 150 each, all 12 holds DRY ok),
  (3) reader selftest (DONE: FLICK window and deck metrics on the cause read's phone records, APPROACH window and X on
  P-173's EC1 / EV1, D1 on synthetic PASS / FAIL / OPEN / THIN), (4) Simulator count-only run of both programs on C
  and V (DONE on rev 2, gate 4 above)
expected minutes: ~60 (12 holds: cooling, ~2-3 min of gates, ~1.5 min of runs; P-173 took 87 min with 230 s runs)
```

```
PREDICTION P-174 · fix-scrollcb-g0 · 2026-10-09
1 g0.0l rev 2 (4106679e0a8a / 440582cec781) vs g0.0k (e0b7b1e7e158 / a9d4fa8992d9) · driver G · FLICK and APPROACH > 50
  (twins)
2 baseline: no G phone run of g0.0k's flick; the cause read's phone runs (pb-land, profile fair, 2026-10-09 06:42Z) on
  g0.0j had 0-1 frames > 50 per flick window (4 flicks) and the baseline 4-9; P-173's g0.0k approach (to the end):
  X 17-19 ms
3 closure: Simulator s6-s8 (mechanism: attribute on every fast flick, no card transitions, slow drags untouched,
  photos 15 / 15 before the flick) and gate 4 (count-only dry run)
4 terms: | removed: the card's opacity / filter (blur 14 px) / transform transitions while a fast flick lands, i.e.
  ~36-50 frames of a large blurred layer in view, and 8 lazy photo loads + decodes during the fling |
  added: one scrollY read and a division per l() call (l already runs per scroll frame), one attribute write and one
  400 ms timer per fast reveal, the eager load + decode of the active and next profile's photos 1.5 s after the
  load event plus an idle callback (touch screens only; inside the 4 s idle, before the flick: the Simulator dry run
  had 29 #people loads before the flick against C's 10; on the phone, with 150 ms latency, some may still be loading
  at the flick, in which case they land in the FLICK window like C's lazy loads do) |
5 prediction: D1 FLICK PASS (~85 %; V likely at or below C), D1 APPROACH PASS (~90 %; the same code on the slow path
  plus a cheap speed read); secondary: V 0 blurred frames and fadeInView ~100-150 ms (the 0.72 threshold only) on
  every flick, C ~35-50 blurred frames and ~800 ms
6 falsified if: V's per-run median of frames > 50 exceeds C's by more than 2 in either window, or V shows blurred
  frames on a flick that set the attribute
7 decision: as in the ticket
```

Kit (sha256, 12), frozen for P-174 (ruling 4's two files re-hashed in the signature commit):

| file | sha256 |
|---|---|
| `phone/g-flick-g0l.json` (compiled 22b636f36a82) | 7146521fa62f |
| `phone/g-approach-g0l.json` (compiled 65f6de58009c) | 3f82842a12f2 |
| `phone/g0l-hold.sh` (one hold: FLICK + APPROACH per item; pins C e0b7b1e7e158/a9d4fa8992d9, V 4106679e0a8a/440582cec781) | 5ac5c4abcc5d |
| `phone/g0l-block.sh` (P-173's block driver: 40.0 C cooling, BATTERY lines, >= 43.0 C stop) | 82f59f2bc652 |
| `phone/g0l-run.sh` (CM_COOL=1, CM_THERMAL=serious) | ad651c24606b |
| `phone/g0l-serve.sh` (snapshot pin fa8ce0315555) | 4cdb9c02cac7 |
| `phone/g0l-k.env` (no K arm) | 2ff0e9ffb678 |
| `phone/g0l-gates.mjs` / `phone/g0l-read-gates.mjs` (P-129 gates, G6 = the two programs) | 65b5f907c5da / 62c75b64e82f |
| `phone/g0l-read.mjs` (card reader; selftest ok; + atFlick, ruling 4) | 4b6a107914ee |
| `phone/pb-lite.mjs` (FLICK page log; + photos complete at the flick mark, ruling 4) | 0d2f661fbe6f |

The block and run scripts are text-substitution copies of fix-cm-return's P-173 kit (`fixes/g0-0k/phone/g0k-*.sh`, its
lineage credited in their headers). The hold script is P-173's, rewritten for two programs per item. The gates are
fix-g0-box's P-129 reader with one changed line (G6).

## Not run

- No timing A/B in Chrome.
- Real finger (F) on the phone: not planned. The user judged the feel on Try-it (PR-041 accepted).
