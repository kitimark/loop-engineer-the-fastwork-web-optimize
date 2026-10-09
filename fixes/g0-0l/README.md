# Build: g0.0l (g0.0k + PR-041's instant reveal)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** built. Gates round 1 ran on the old snapshot. The run was paused for the lead's new baseline snapshot (the
AVIF thumbnails, T-261), and round 2 is still to run. The phone card below is a DRAFT for the lead's signature; no
phone data yet.
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
  - when `.is-visible` turns on while the page scrolls at >= 0.8 px/ms, `#people` gets `data-fw-reveal="instant"` for
    400 ms, and a CSS rule takes the card's transitions off, so the card shows at once;
  - slow scrolls, rest, scroll-up and reduced motion keep today's fade;
  - the deck photos of the active and next profile are loaded eagerly and decoded 1.5 s after mount (then idle, 2 s cap).

| build | JS (sha256, 12) | CSS (sha256, 12) | how to rebuild |
|---|---|---|---|
| g0.0k (control) | e0b7b1e7e158 | a9d4fa8992d9 | `node tools/fix.mjs apply g0-0k --reset` |
| **g0.0l** | **ac48233916ad** | **440582cec781** | `node tools/fix.mjs apply g0-0l --reset` |

- `patch.diff` is baseline-relative (`fix.mjs diff g0-0l`). Applying it to the baseline reproduces both pins (checked).
- `delta.diff` is g0.0k -> g0.0l (= `fixes/people-blink--b2/delta.diff`), for review.
- Immutable copies for the phone block: `out/g0-0l/snap/{C,V}` (C = g0.0k, V = g0.0l) with `HASHES.txt` (sha256 12:
  7391321242fa), made by `phone/g0l-snap.sh` from the committed patches. The script refuses to rebuild an existing
  snapshot.

## Gates (counts and pixels only; all OBSERVED in our setup)

Round 1 ran 2026-10-09 07:27-07:41Z on the OLD snapshot. Round 2 on the new snapshot replaces these numbers; the two
rounds are never pooled.

**1. Console errors and 404s** (`fix.mjs check`, headless, mobile + desktop, against the baseline):

| | mobile | desktop |
|---|---|---|
| g0.0k (`fix.mjs check people-blink`, overlay = g0.0k) | 0 errors, 0 4xx, morph reached | 0 / 0, morph reached |
| g0.0l (`fix.mjs check g0-0l`) | 0 errors, 0 4xx, morph reached | 0 / 0, morph reached |

**2. Pixels at rest** (T2: fill 64, edge 128, 0.5 %). Loads A = g0.0k, V = g0.0l, in the order A, V, A2, V2; the
avatar carousel frozen. "Consistent" = A~V and A2~V2 both differ beyond A/A at the same pixels.

| stop y | Chrome mobile 430x932 | Chrome mobile, Reduce Motion | Chrome desktop 1440x900 | Simulator 430x775 |
|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 |
| 300 | 0 | 0.0065 % max 30 | 0 | - |
| 548 | - | - | - | 0.0019 % max 65 |
| 600 | 0 | 0.0065 % max 30 | 0 (A~V 0.52 % not repeated: V/V noise) | - |
| 900 | 0.054 % max 63 | 0.055 % max 63 | **0.60 % max 117** | 0.0048 % max 30 |
| 1300 | 0.068 % max 63 | 0.067 % max 63 | 0.014 % max 56 | **0.43 % max 243** |
| 1600 | 0.068 % max 63 | 0.067 % max 63 | 0.011 % max 56 | **0.64 % max 251** |
| 2300 | 0 | 0 | 0.009 % max 50 | 0 |
| 3000 | 0 | 0 | 0 | 0 |

- **Chrome, people photos:** every consistent diff in Chrome lies inside the deck's photos (`section.feed > img`, the
  profile card's portfolio images). The same pictures differ only at resampling level, on edges (flat share 0), and A/A
  is 0 there. Mobile stays inside T2 (max 63). On desktop the y 900 stop is over T2's share (0.60 % > 0.5 %; max 117 is
  under the edge limit 128).
  - Suspect: the preload's eager load and `decode()`. Chrome may decode an image decoded ahead at a different scale
    than one it decodes at paint. Cause UNRESOLVED.
  - Round 2 adds an attribution run: C against V without `decode()` and against V without the eager load
    (`out/g0-0l/snapx`, not committed).
- **Simulator y 1300 / 1600:** the whole consistent area is the avatar row ("people showcasing their work"). V and V2
  froze one slide further than A and A2: a new avatar on the left, every other avatar one slot right.
  - The row is a time-based carousel. The gate stalls its 800 / 220 ms timers right after load, and a slide in progress
    at that moment is frozen at its end.
  - Most likely a timing artifact of the gate, not a look change (the preload's image work moves when the first slide
    lands). UNRESOLVED.
  - Round 2 records the row's sliding state per stop (`px-sim.mjs` CARSTATE `sliding`).
  - Everything else in the Simulator is inside T2.
- **Reduce Motion:** the same as mobile (the photo-edge diff only). With reduced motion the card is always visible,
  the speed gate never fires, and the page's own reduced-motion rules apply.

**3. The reveal mechanism** (Simulator s6-s8, `fixes/people-blink/README.md` "Checks"). It ran on byte-identical builds:
s8's arms A and P are pinned e0b7b1e7e158/a9d4fa8992d9 and ac48233916ad/440582cec781 = C and V here.

| check | g0.0k | g0.0l |
|---|---|---|
| fast flick (300 px / 220 ms): `data-fw-reveal` at the flip | never | every flick (removed +400 ms) |
| fast flick: card transitions at the reveal | opacity, filter, transform | none |
| fast flick: sharpness while the deck comes in (y 450-1260) | 1.6-3.8 | 13.3-13.8 |
| **slow drag** (520 px / 1200 ms, 0.47-0.57 px/ms at the flip): attribute / transitions | never / today's | **never / today's (no trigger)** |
| scroll up: hide transitions | today's | today's |
| **early photo loads**: deck photos (first 3 profiles) loaded before the first flick | 0 of 15 | **15 of 15** |

**4. Count-only dry run of the card's G programs** (Simulator, `phone/g0l-simdry.sh`, 07:40Z):

| | flick: frames / touchmoves / yLand | deck: in view / flip (ms after the flick mark) | blurred frames, fade in view | `#people` img loads before the flick | instant set | approach: drags to y >= 3400, frames |
|---|---|---|---|---|---|---|
| C (g0.0k) | 641 / 16 / 1550 | 1080 / 1180 | 36, 797 ms | 10 | 0 | 7, 1382 |
| V (g0.0l) | 641 / 17 / 1592 | 960 / 1080 | 0, 120 ms | 24 | 1 | 7, 1489 |

- V's 120 ms of "fade in view" is the 0.72 threshold. The deck's top enters the view about 100-120 ms before
  `.is-visible` turns on, in both builds (C: 100 ms), and only after that does C's fade start.
- Both programs: 1 segment, 0 prevented touchmoves.

## Phone check card (DRAFT, for the lead's signature)

The card is drafted before any phone data. The kit is frozen at the hashes below. A fix found in round 2 would change
only V's pins and the snapshot; this card would then be re-sent.

```
TICKET <P-id from the lead> · V = g0.0l: JS ac48233916ad / CSS 440582cec781 (out/g0-0l/snap/V)
       control C = g0.0k (best on main): JS e0b7b1e7e158 / CSS a9d4fa8992d9 (out/g0-0l/snap/C), same base
       HASHES out/g0-0l/snap/HASHES.txt (7391321242fa), checked by the kit before every hold; B = the plain baseline
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
pre-data checks: (1) wda check READY before H1, (2) kit dry run (CM_DRY=1, DONE 07:35Z: 3 servers serve B / C / V
  pinned hashes, both programs compile to the pinned hashes with GESTURE_BUDGET_S 150 each, all 12 holds DRY ok),
  (3) reader selftest (DONE: FLICK window and deck metrics on the cause read's phone records, APPROACH window and X on
  P-173's EC1 / EV1, D1 on synthetic PASS / FAIL / OPEN / THIN), (4) Simulator count-only run of both programs on C
  and V (DONE, gate 4 above)
expected minutes: ~60 (12 holds: cooling, ~2-3 min of gates, ~1.5 min of runs; P-173 took 87 min with 230 s runs)
```

```
PREDICTION <P-id> · fix-scrollcb-g0 · 2026-10-09
1 g0.0l (ac48233916ad / 440582cec781) vs g0.0k (e0b7b1e7e158 / a9d4fa8992d9) · driver G · FLICK and APPROACH > 50
  (twins)
2 baseline: no G phone run of g0.0k's flick; the cause read's phone runs (pb-land, profile fair, 2026-10-09 06:42Z) on
  g0.0j had 0-1 frames > 50 per flick window (4 flicks) and the baseline 4-9; P-173's g0.0k approach (to the end):
  X 17-19 ms
3 closure: Simulator s6-s8 (mechanism: attribute on every fast flick, no card transitions, slow drags untouched,
  photos 15 / 15 before the flick) and gate 4 (count-only dry run)
4 terms: | removed: the card's opacity / filter (blur 14 px) / transform transitions while a fast flick lands, i.e.
  ~36-50 frames of a large blurred layer in view, and 8 lazy photo loads + decodes during the fling |
  added: one scrollY read and a division per l() call (l already runs per scroll frame), one attribute write and one
  400 ms timer per fast reveal, the eager load + decode of the active and next profile's photos 1.5 s after mount
  (inside the 4 s idle, before the flick) |
5 prediction: D1 FLICK PASS (~85 %; V likely at or below C), D1 APPROACH PASS (~90 %; the same code on the slow path
  plus a cheap speed read); secondary: V 0 blurred frames and fadeInView ~100-150 ms (the 0.72 threshold only) on
  every flick, C ~35-50 blurred frames and ~800 ms
6 falsified if: V's per-run median of frames > 50 exceeds C's by more than 2 in either window, or V shows blurred
  frames on a flick that set the attribute
7 decision: as in the ticket
```

Kit (sha256, 12, at this draft; frozen at the signature):

| file | sha256 |
|---|---|
| `phone/g-flick-g0l.json` (compiled 22b636f36a82) | 7146521fa62f |
| `phone/g-approach-g0l.json` (compiled 65f6de58009c) | 3f82842a12f2 |
| `phone/g0l-hold.sh` (one hold: FLICK + APPROACH per item) | 2388b06e939f |
| `phone/g0l-block.sh` (P-173's block driver: 40.0 C cooling, BATTERY lines, >= 43.0 C stop) | 79e58aca828d |
| `phone/g0l-run.sh` (CM_COOL=1, CM_THERMAL=serious) | 342a0944d57f |
| `phone/g0l-serve.sh` (snapshot pin 7391321242fa) | 2760a0d5216d |
| `phone/g0l-k.env` (no K arm) | 2ff0e9ffb678 |
| `phone/g0l-gates.mjs` / `phone/g0l-read-gates.mjs` (P-129 gates, G6 = the two programs) | 65b5f907c5da / 62c75b64e82f |
| `phone/g0l-read.mjs` (card reader; selftest ok) | 05ef38c35e57 |
| `phone/pb-lite.mjs` (FLICK page log) | 7b1692d4e515 |

The block and run scripts are text-substitution copies of fix-cm-return's P-173 kit (`fixes/g0-0k/phone/g0k-*.sh`, its
lineage credited in their headers). The hold script is P-173's, rewritten for two programs per item. The gates are
fix-g0-box's P-129 reader with one changed line (G6).

## Not run

- No timing A/B in Chrome.
- Real finger (F) on the phone: not planned. The user judged the feel on Try-it (PR-041 accepted).
