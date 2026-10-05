# Ticket: hero-park cost card + phone no-worse check (fix-hero-exit-threaded, 2026-10-05, before any counted data)

P-number: P-140 (mgmt-clerk-1, reserved). Pre-data read: the lead's Opus reader. Lead signature: pending. No counted run before all three.
Rule: less-work landing rule (memory `less-work-landing-rule`; the lead, T-198 #3): cost-card counts + one short phone
no-worse check. No smoothness claim is made.

## The change (one line of JS, plus a comment)

In live CSS mode the hero's scroll listener `heSc` now also parks at once when `scrollY >= heEnd + 40` (finger down or
not), not only at `y <= heTop + 30` or 300 ms after the last scroll with no finger down (`heRest`). Parked past the end, the
baseline rules draw the completed exit from the inline `--exit-opacity` that `s()` writes (r = 0), the same transition
`heRest` already makes past the end. Going live again stays as it was: the first scroll event at `heTop + 30 < y < heEnd`.
Why: live, the exit's 8 scroll-driven animations stay relevant, and WebKit recalculates their style on every rendering
update (WebKit main 13a1f2916933, CONFIRMED, cited in the code comment); in Chrome with the Safari path faked, back-to-back
strokes kept the hero live down to y ~2800 (OBSERVED, `out/t194-census/an-wk.json`).

## Arms

| arm | build | JS sha256/12 | CSS sha256/12 |
|---|---|---|---|
| C | v9.1d (int-v8's P-134 base: v9-final + 7d + scroll-cb + g11; fixes/v9-1d/patch.diff ce2d32a1bbbb) | 941aa13e5bdf | f1997edf5309 |
| V | v9.1d + hero-park (`delta.diff`, applies with `patch -p1`, no fuzz, on v9.1d and on v9-final + 7d) | be22bf861949 | f1997edf5309 |
| C2 | C again on its own server (A/A) | 941aa13e5bdf | f1997edf5309 |

## Part 1: Simulator cost card + functional + pixels (one functional session, shared slot, weight simulator)

Runner: `fixes/hero-park/sim-park.mjs` (refuses a wrong served hash: VOID, exit 3). Per arm, a finger marked down (a
synthetic `touchstart`: heTS only sets heTouch, so heRest never parks and each park is heSc's own):
1. Functional steps (scrollTo, read `.he-css` 300 ms later), E = heEnd: E-400, E+60, E+20, E-100, E+300, 10, then
   touchend at E-200 and 700 ms.
2. Pixels at E+60, E+300, E+700: time-based animations paused at t = 0, `simctl io screenshot`; V vs C beyond the A/A
   (C2 vs C), status bar left out.
3. Counts: scripted swipe 0 -> 2800 px, 10 px per rAF, WebKit Timeline: per band (hero 0..E, past end E..track end,
   track end..2800) frames, frames live, RecalculateStyles count, engine-scheduled style invalidations, Layout count.
   Simulator ms are listed but never judged.

Predictions (written before the counted run; the dry run's numbers will be added under "Dry run" before the read):
- P1 functional: V parked at E+60 and E+20, live at E-100, parked at E+300 and at the top; C live at E+60, E+20, E+300,
  parked at the top; both parked after the rest. 0 console errors in every arm.
- P2 pixels: V vs C beyond A/A = 0 px at all three positions (T0). Fail: anything beyond A/A over the PR-010 wide numbers
  (fill 64, edge 128, 0.5 %); between T0 and that: T2, reported.
- P3 counts, past end and below: V's live frames = 0 past E+40; C's live frames = every frame. Engine-scheduled style
  invalidations per frame V < C by at least 0.5 per frame in band "past end" and "below" (C2 vs C within 0.2).
  RecalculateStyles per frame V <= C. Layout count per frame V within C ± the A/A spread.
- P4 hero band (0..E): V = C within the A/A spread on every count (nothing changes before the end).

## Part 2: phone no-worse check (short; runner per the lead)

Driver G, `fixes/morph-scroll/g-fastshort-v1.json` from a fresh load at the top (the T-194 E1 script: approach through
the hero and middle, then strokes at the end). Profile xcode-serious (no heat pre-warm, thermal gate at hold start and end,
44 C / Critical ceiling). One hold: warm-up load per arm, then C V V C, Timeline OFF in counted runs, park after each.
Counts per run, band E..2800 (moving frames, in touch or not): dt > 50 and dt > 34 with the +-4 ms twins, near bands
flagged. No-worse: median(V) - median(C) <= +1 at > 50 and <= +2 at > 34; threshold-sensitive if a twin disagrees.
Sentinel as protocol v2 (a control run must reach bottom >= 58 / scroll >= 44 fps, else the runs since the last pass are void).

## What lands, and couplings

- `delta.diff` (V vs v9.1d), `patch.diff` (V vs the baseline), README with the hunk's line range in v9.1d, the card.
- heSc is a plain `scroll` listener on window (capture, passive), not the scroll engine's callback, so scroll-cb's rAF
  cuts do not change when it parks. It touches none of int-v8's reserved ranges (scroll-cb, g11, people-word a).
