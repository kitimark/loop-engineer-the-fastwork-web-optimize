# Ticket: hero-park cost card, P-140 rev 2 (fix-hero-exit-threaded, 2026-10-05, before any counted data)

P-number: P-140 (mgmt-clerk-1). Rev 1's pre-data read: FAIL, fixable before data (ops-reader-P140, items F1-F7, notes N1-N2).
Rev 2 answers each item (table at the end). Re-read: a fresh ops-reader-P140, routed by mgmt-clerk-1. Lead signature:
pending. No counted run until both are done. Nobody else signs.
Rule: less-work landing rule (memory `less-work-landing-rule`; the lead, T-198 #3): cost-card counts. This card makes no
smoothness claim.
Scope (the lead, user T-199 #3): this card is **part 1 only** (Simulator counts, functional, pixels). The phone no-worse
check (rev 1 part 2) and the blind swipe A/B (the lead's part 3) move to int-v8's combined v9.2 ticket: one phone block
and one blind swipe A/B for every fix in v9.2. hero-park joins v9.2 only if part 1 PASSes before v9.2 freezes.

## The change (delta.diff on v9.1d: one behaviour line, one writer skip, comments)

1. Park past the end. In live CSS mode the hero's scroll listener `heSc` now parks at once when `scrollY >= heEnd + 40`
   (finger down or not). Before, it parked only at `y <= heTop + 30`, or 300 ms after the last scroll with no finger down
   (`heRest`). Parked past the end, the baseline rules draw the completed exit from the inline `--exit-opacity` that `s()`
   writes (r = 0). This is the same transition `heRest` already makes past the end. Going live again is unchanged: the
   first scroll event at `heTop + 30 < y < heEnd`.
2. Skip the writer past the end (new in rev 2; added after dry run 1, see "Informed"). Parked, the scroll engine's
   callback runs the baseline writer `s()` every frame. `s()` reads the track's rect, which forces a layout. In dry run 1,
   V had +1.2 Layout records per frame past the end, and the cause was this per-frame write. Rev 2 skips the writer only
   when all three hold:
   - the last `s()` wrote r = 0;
   - `scrollY >= heEnd + 40`;
   - `innerHeight` equals the value `heArm` took `heEnd` at.
   In that state, `s()` would write r = 0 again. Any other state runs it as before. A toolbar step changes `innerHeight`,
   so it runs the writer until `resize` re-arms `heEnd`.
- Why: live, the exit's 8 scroll-driven animations stay relevant, and WebKit invalidates their style on every rendering
  update (WebKit main 13a1f2916933, CONFIRMED, cited in the code comment).
- Chrome: identical by construction. `heCss` needs `GestureEvent` in window (WebKit only), a coarse pointer and a screen
  of 600 px or less. Without it `heMode` stays false, and every changed path is behind `heMode`:
  - `heSc` returns at once;
  - the dE callback runs `c()` as in v9.1d;
  - `s()` only sets the unused flag `heZ`.
  So Chrome runs the v9.1d page apart from one boolean assignment per write. No Chrome measurement is part of this card.

## Kit (every file hash-pinned; sha256, first 12 hex)

| item | file | hash |
|---|---|---|
| v9.1d base patch (int-v8, P-134 base), committed copy | `fixes/hero-park/base-v9-1d.diff` | ce2d32a1bbbb |
| hero-park on v9.1d | `fixes/hero-park/delta.diff` | 14fb7c20781c |
| hero-park + v9.1d on the baseline | `fixes/hero-park/patch.diff` | 60a3af326659 |
| runner | `fixes/hero-park/sim-park.mjs` | 989c265774ed |
| scorer | `fixes/hero-park/score-park.mjs` | eecea296d7f3 |
| pixel probe (evidence for the freeze change, decides nothing) | `fixes/hero-park/probe-px.mjs` | 41639127bc00 |

| arm | build | JS | CSS |
|---|---|---|---|
| C, C2, C3 | v9.1d = baseline + base-v9-1d.diff (`patch -p1 -F0`) | 941aa13e5bdf | f1997edf5309 |
| V | v9.1d + delta.diff (`patch -p1 -F0`) | 8ce731d584d9 | f1997edf5309 |

- delta.diff also applies with no fuzz on v9-final + 7d (JS 1b2eecc66011, giving 6b28c3b9528e, `node --check` ok).
- N2: if int-v8 re-pins its v9.1d base, ops re-runs that apply check and the V hash before any counted run.
- Rev 1's V (be22bf861949, delta b2ed79bdbab5) is withdrawn.

## Run

- Runner: `fixes/hero-park/sim-park.mjs`. The full procedure is in its header. In short:
  - One Simulator functional session in a shared slot (weight simulator, 300 s cap).
  - Arms C, V, C2, C3, each on its own server, served hashes checked against the pins.
  - Per arm, a touch-shaped synthetic `touchstart` (one touch in `touches`). Rev 1's bare `Event` threw in the
    menu-snap handler (`e.touches.length`) in every arm.
- Labels: `--label dry` runs are uncounted; their numbers are listed under "Dry runs" and decide nothing. `--label counted`
  is the first run after the lead's signature, and only that run decides.
- VOID (exit 3) when any of these happens. The owner then re-runs the whole run once. A second VOID makes the card
  INSUFFICIENT.
  - a served-hash mismatch;
  - a thrown arm;
  - a swipe that stops short of TO (2400);
  - a band with fewer than 5 frames in any arm.
- Any change to the kit after the signature is a delta: a new rev, re-read and re-signed.

## Bands and the live flag

- E = heEnd = track top + track height - innerHeight. In the Simulator at 430x775: E 855, track end 1630.
- Bands by the frame's scrollY:
  - hero [0, E)
  - edge [E, E+40), reported only
  - past [E+40, track end)
  - below [track end, 2400]
- The live flag is sampled right after each `scrollTo`, before that step's scroll event runs `heSc`, so a park shows one
  step (10 px) late. One step can span up to 2 rendering frames, so V may show up to 2 live frames at the start of
  "past".

## Scorer and predictions (gating; scorer `fixes/hero-park/score-park.mjs`)

- Exit codes: 0 PASS, 1 FAIL, 2 INSUFFICIENT, 3 VOID.
- Rates are per frame: rs (outermost RecalculateStyles), sched (engine-scheduled style invalidations), lay (outermost
  Layout).
- Tolerance per band and rate: tol = the largest |Ci - Cj| over the three A/A pairs (C,C2), (C,C3), (C2,C3), no floor.
  cmin and cmax are taken over C, C2, C3. No tolerance comes from a single pair, and no item needs exact equality.
- Simulator ms are reported, never judged.

| item | prediction (gating) | p |
|---|---|---|
| P1 functional | C, C2, C3: live at E-400, E+60, E+20, E-100, E+300; parked at the top and after the rest. V: live at E-400, parked at E+60 and E+20, live at E-100, parked at E+300, at the top and after the rest. 0 console errors in every arm | 0.85 |
| P2 pixels | T0 at E+60, E+300 and E+700: 0 counted pixels of V vs C beyond the A/A (masks as in the runner, hero clock box masked). No T2 path on this card | 0.75 |
| P3 past and below | (a) V live ≤ 2 frames in past and 0 in below; every C arm live ≥ 0.9 × frames in both. (b) sched V < cmin - tol in both. (c) rs V ≤ cmax + tol in both. (d) lay V ≤ cmax + tol in both | 0.7 |
| P4 hero band | rs, sched and lay of V each within [cmin - tol, cmax + tol] (nothing changes before the end) | 0.85 |

- PART 1 PASS = VALID and P1-P4 all hold. Otherwise FAIL, or VOID/INSUFFICIENT as above.
- PASS makes hero-park eligible for v9.2 (T-199 #3); its phone parts are int-v8's v9.2 block.
- FAIL: hero-park does not join v9.2. The README then reports which item missed.

## Informed (what the predictions already knew)

- Dry run 1 (13:42Z, uncounted, rev 1 kit and V be22bf861949), N1:
  - Past band: V live 0/23 vs C 27/27; sched per frame 0.83 vs 1.00; rs per frame 0.96 vs 1.07 (ms 15 vs 189, descriptive).
  - Below band: sched 0.70 vs 1.00.
  - Lay per frame: past 3.74 vs 2.41, below 3.67 vs 3.05.
  - The T-194 census (Simulator, OBSERVED) was also known.
- Revised after dry run 1, each disclosed here:
  - P3(b): was "V ≤ cmin - 0.5"; the observed cut was 0.17-0.30 per frame.
  - P3(d): was two-sided; it is one-sided now, after the writer skip.
  - The writer skip itself (change 2).
  - The touch-shaped event.
  - The pixel freeze. Rev 1 paused every time-based animation at t = 0. That also rewound the one-shot reveal
    animations under the hero, at a phase that differed by arm. Dry run 1 then showed about 70 % of the screen different
    at E+300 and E+700. A probe without the freeze (`probe-px.mjs`, 13:58Z) showed the same page in both arms at E+300
    and E+700, finger down and lifted. Its remaining differences were the spinning record in the profile card and the
    toolbar blur over it.
- Dry run 2 (rev 2 kit) runs before the re-read. Its numbers are added below and decide nothing.

## Dry runs (uncounted)

- Dry run 1: `out/hero-park/sim/2026-10-05T13-42-20-599Z/` (rev 1 kit; numbers above).
- Dry run 2: (added before the re-read).

## Rev 1 read items and where rev 2 answers them

| item | answer |
|---|---|
| F1 rebase on main | done (5a9fe058) before any data |
| F2 commit the base patch, list kit hashes | `base-v9-1d.diff` committed; Kit table |
| F3/F4 p per prediction, part 2 prediction, combine line | p column; part 2/3 moved to int-v8's v9.2 ticket (T-199 #3); combine: PASS → eligible for v9.2 |
| F4(a) bands and lag | "Bands and the live flag" (E+40 split, one-step lag) |
| F4(b) tolerance not from one pair | three A/A pairs (C2, C3) |
| F4(c) "C2 within 0.2" | removed; not a gate |
| F4(d) scorer | `score-park.mjs`, exit codes above, self-test 13 checks |
| F5 VOID, re-run, dry vs counted | "Run" |
| F6 pixels | T0 only; hero clock masked; Chrome identical by construction |
| F7 part 2 pins, sentinel, thermal | moved with part 2 to the v9.2 ticket (int-v8) |
| N1 informed | "Informed" |
| N2 re-pin | Kit table note |
