# Best builds, newest first

The one list of best-build versions (user T-228 #3, 2026-10-07). The lead updates it at every build change: a new
candidate, a landing, a version replaced or dropped. Times are UTC unless marked +0700. `fixes/PROGRESS.json`'s
`best` flag is stale from v9 on (it still marks v8); read the current best from this file.

**Current best on main: v9-final rev 7d** (JS 1b2eecc66011 / CSS e1359ab9994a), the "C" arm of every test since.

| Version | Status | Best since (commit) | JS / CSS | Added over the previous one | How it was checked |
|---|---|---|---|---|---|
| **v11** (Vc + V13 + H1c) | candidate | not yet; built 2026-10-07 (c98cf5fe) | 9b4a829d15a0 / 62743920fe1a; with the People title slide (PR-031, accepted 00:09Z): 71ad4f9b82ac / 592d1f2a8af4, after a look check | Less forced layout at the end-of-page menu card (V13); hero animations paused while the People card covers them (H1c) | Chrome pixels identical; Simulator: covered title 54 → 2 layouts; user swipe test C-092 running |
| **v10 = Vc** (v10 + GPU menu card + c1) | candidate, folded into v11 | not landed | v10 a33a6c7c1f2b / 62743920fe1a; Vc b8b194b7ff56 / 62743920fe1a | End-of-page menu card on the GPU (PR-030); its first open prepared at idle (c1) | Gates passed; phone block v10cm-nw stopped at the heat ceiling (n 1-2, early read favours Vc) |
| v9.2 (= v9.1d rev 1.3) | never landed | n/a | 941aa13e5bdf / f1997edf5309 | v9.1d + new "people" word animation and nav fade | Phone P-142 part 2: worse, threshold-sensitive |
| v9.1d | never landed | n/a (built 5c526cd3) | 941aa13e5bdf / f1997edf5309 | Faster scroll callback, quieter menu close | Identity, pixel, Simulator checks; no phone data |
| v9.1 (rev 7c) | never landed | n/a | c3d36476c3ce / f1997edf5309 | Scroll callback and close rule | Pins and identity only |
| **v9-final rev 7d** | **current best** | 2026-10-05 17:21 +0700 (189ca7ed; base 8b5ce9b3) | 1b2eecc66011 / e1359ab9994a | Menu follows the swipe (rev 7d fixes fast flings); new Join button; double-drive cards | Phone P-122 insufficient, landed on the no-worse rule; user accepted PR-023 rev 5 |
| v8 | replaced | 2026-10-05 01:46 +0700 (743295de) | 3e3e94cb6e9f / f836404b3728 | Lighter countdown roll, hero countdown paused off screen, cheaper heading accent, menu fade on the GPU | Phone P-114 no-worse; user: very smooth |
| v7 | replaced | 2026-10-04 ~18:45 +0700 (built c3dc73b1) | 8c90da217745 / 308f0da70c3a | Countdown on the GPU, calmer avatar row, less work at rest | Phone P-105: worse only in hero flicks (threshold-sensitive) |
| v6 (B-R2) | replaced | 2026-10-04 07:33Z (cb497ba5) | 8018ce062d30 / 71b65c667720 | Hero cards fade on the GPU instead of script each frame | Phone P-095; user preferred it in both blind swipes |
| v5 GPU preview | never landed | n/a | c0c8ad4e36cb / d0bdf3b38ba7 | Preview: countdown, hero exit, menu reveal on the GPU | Counts only |
| v4 | replaced | 2026-10-03 15:48Z | 65052c4a3902 / e0f92804c521 | Security panel shimmer on the GPU; top bar and menu stop following past the page end | Phone P-077, P-085 |
| v3 / v2 / v1 | replaced | 2026-10-02 11:49Z / 10:40Z / 10:06Z | v1 59b23b3f57fd / d22542d0b5f8; v2 59b23b3f57fd / a3b34c3a3920; v3 7bf7c4657d21 / f523598b2a24 | v1: wave 1 + cheaper section switch + lighter avatar slider; v2: people-shrink hold; v3: leaner section switch | Phone P-061, P-062, P-063 |
| wave 1 (all-wave1) | replaced (base of v1) | 2026-10-01 (0e8f2887) | not stated | Eight scroll, countdown and animation fixes combined | Chrome A/B: fps 93.8 → 110.6 |
| v0 baseline | reference | 2026-09-30 | 4606120cf392 / 27776f3d4138 | The original page | n/a |

Sources: `fixes/v*/README.md`, `fixes/all-wave1/README.md`, `fixes/PROGRESS.json` (v1-v6 pins), git history on main
(compiled by map-best-builds, 2026-10-07). v9.1/v9.1d "never landed" and v7's date are inferred from notes and build
commits.
