# g0.0j: g0.0i + sticky-walk fixcq (the profile deck's shells sized without aspect-ratio)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**What it is.** g0.0i plus fix-scrollcb-g0's sticky-walk change (`fixes/sticky-walk/`), named g0.0j by the lead's
ruling on P-172 (2026-10-09). The delta is CSS only, inside the mobile / coarse-pointer media rule that already holds
the deck's styles; the JS is g0.0i's, byte for byte.
- `.start-selling-profile-deck` gets `container-type: inline-size`.
- `.start-selling-profile-shell` (and its `.is-rail-in` twin selector): `aspect-ratio: 353/764` removed, `height: auto`
  becomes `height: calc(100cqi * 764 / 353)`. The shell is the deck's full content width (`flex: 0 0 100%; width: 100%`),
  so the box is the same 353:764 box: 844.078125 px at 430 wide.

**Why.**
- Any layout a dirty sticky box (`.hero`, `.pain-sticky`) triggers in WebKit re-lays out the deck's six aspect-ratio
  shells: 20-35 ms per layout in the Simulator's static map. During a finger drag toward the end of the page that is
  a stream of big layouts (stage D NAMED, lead fast path; `fixes/sticky-walk/README.md` "D card").
- With the height taken from the deck's width (100cqi), the shells no longer depend on their own layout, and the
  big layouts go away.
- `container-type: inline-size` adds style and inline-size containment only, no layout or paint containment
  (CONFIRMED: WebKit `Source/WebCore/style/computed/StyleComputedStyle.cpp` 458-468, `usedContain()`, main e8c36a19).
- This is a "does less work" change. No gain is claimed on frames over 50 ms.

**Pins** (sha256, first 12):

| file | g0.0i | g0.0j |
|---|---|---|
| `_app/immutable/nodes/2.DyWL8TcE.js` | 9162843e750f | 9162843e750f (unchanged) |
| `_app/immutable/assets/2.gBuqKVzi.css` | adb875d94c1f | bee7fce9ad56 |

- `patch.diff` is baseline-relative (the sticky-walk patch, header renamed). `node tools/fix.mjs apply g0-0j --reset`
  on fresh `site-pretty` copies gives the pins above (checked 2026-10-09).
- `delta.diff` is g0.0i → g0.0j. Applied with `patch` to g0.0i's CSS, it gives bee7fce9ad56 (checked 2026-10-09).
- These are the bytes measured in P-172 (snapshot `out/sticky-walk/snap-i/V`, HASHES.txt 903966683b4f) and in the
  restack spot check, the avatar gate and the deck split.

**Evidence** (the less-work landing rule: cost-card counts plus a phone no-worse check; lead ruling on P-172):

| check | g0.0i (or g0.0h where noted) | g0.0j (or g0.0h + fixcq) | where |
|---|---|---|---|
| Simulator G approach, finger-down layouts >= 5 ms at y 1000-3400 per run (g0.0h base) | 73, 65, 56 | 2, 2, 2 | sticky-walk gate 5 |
| Simulator G approach, layouts >= 5 ms per run (g0.0h base) | 169, 142, 129 | 2, 2, 4 | same |
| P-172 phone, Layout records >= 5 ms finger-down at y 1000-3400 | 159, 153, 152, 155 | 1, 0, 1, 1 | sticky-walk "P-172 result" |
| P-172 phone, finger-down frames > 34 ms at y 1000-3400 | 18, 12, 12, 13 | 2, 3, 5, 6 | same |
| P-172 phone, finger-down frames > 50 ms at y 1000-3400 | 3, 1, 2, 2 | 1, 1, 1, 1 | same |
| P-172 phone, whole-run frames > 50 ms | 10, 5, 7, 9 | 1, 1, 2, 2 | same |
| IO callbacks (52 targets, Chrome) | – | 0 differ | gate 2 |
| pixels, Chrome mobile / desktop / tablet 768 / reduced motion | – | consistent 0 | gate 1, 3 |
| pixels, iPhone Simulator (13 stops; restack spot check on g0.0i) | – | consistent 0, except the status-bar clock (standard exclusion) and 15 css px² at level 19 | gate 1 |
| deck geometry and snaps (Chrome 6 viewports, Simulator) | – | equal | gate 4 |
| PR-013 avatar slider (keep-st6), Chrome and Simulator | – | behaviour equal; Chrome 0 px, Simulator consistent 0 | gate 4 |

- **P-172 verdict, by the card** (G, tool-serious, C = g0.0i, V = g0.0j, n = 4 per arm, all 12 holds valid, both
  sentinels passed): the primary, > 50 ms at y 1000-3400, shows **no separation** at n = 4 (the ranges touch at 1). It is
  **threshold-sensitive**: both twins separate lower (> 46: 2-4 vs 1; > 54: 1 vs 0).
- Descriptive: > 34 separated (12-18 vs 2-6). Layout >= 5 ms 152-159 → 0-1 (prediction HIT). Whole-run > 50 no worse
  (5-10 vs 1-2).
- In plain words: fewer slow frames over 34 ms. The > 50 count is unproven at n = 4.
- The one > 50 frame left in every g0.0j run is at y ~1750 (51-52 ms; 61-63 ms in g0.0i). That is the te crossing frame
  of fix-g0-box's P-171, not the deck (finding F-368).
- **Look: T2** (lead ruling on P-172). In the iPhone Simulator, after a swipe, some deck photos are resampled at a
  different quality in the two builds; g0.0j is as sharp or sharper, and the state is settled.
  - Fill / edge split over three sessions: every step but one is within T2 (fill at most level 15, edge at most 91, at
    most 0.473 % of the screen).
  - The one step over the limits shows the vinyl card. Its record spins (`vinyl-spin`, CSS 3850-3852), and the A/A pairs
    differ there as much (A~A2 187-200, V~V2 4-220 in the same box). Without that card, the step peaks at level 63.
  - Chrome shows none of it.

**Not checked on g0.0j:**
- a finger (F) test;
- the y 0-600 static-nudge residual from `sw-map.mjs` (gone in G drags with the served CSS; see the sticky-walk README).

**Open on top of g0.0j:**
- P-171 / cm-return (fix-g0-box): the te crossing frame at y ~1750. Its C baseline on g0.0j starts at ~51 ms, not 61-63.
- PR-040: if the user picks v14's end-of-page, the deck rules do not touch it (the deck is mid-page), but the pixel gates
  run again on the stacked build.
