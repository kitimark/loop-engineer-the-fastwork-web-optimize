# Phone ticket: PR-018 rev 7d G count check (fix-hero-exit-threaded, 2026-10-05, before any phone data)

P-number: `P-<ops>` (ops numbers it); lead signature: pending. No phone run before both.

**profile: xcode-serious.** Xcode-induced Serious, no heat pre-warm; `thermal-gate.mjs --accept-induced` at the start and
the end of each hold; 44 C / Critical ceiling. Not pooled with any other profile.

## The one question

Does rev 7d let a fast or long close fling leave the end screen in one fling on the phone (the v9 step 4 regression
from rev 7b/7c), while the user's kind of close (fast, short: <= 4.06 px/ms, 74-255 px) still commits to the closed
rest? Counts only (released / caught / pulled back to open / part-open; misses), no timing number.

## Arms (arm-neutral C/V, both on base v8 = msbase-3e3e94cb6e9f, CSS 659b02f7169d)

| arm | build | snapshot | JS sha256/12 | CSS sha256/12 |
|---|---|---|---|---|
| C (control) | rev 7c | out/snapshots/ms-428961bda278 | 428961bda278 | 659b02f7169d |
| V | rev 7d candidate: a close fling at lift-off is released when page Fv <= -5 px/ms or finger travel >= 300 px | out/snapshots/ms-29c0d537e0c9 | 29c0d537e0c9 | 659b02f7169d |

delta.diff (v8 -> V) c634e3fbd90b, patch.diff (baseline -> V) 38d1c30bcc18 (commit dfa06593). The hold script serves
each arm on its own plain-http port plus B (the plain baseline, the gate's timer page) and refuses a wrong served hash.

## Driver, items, probes

Driver G (WDA), `iphone.mjs wda check` first. Runner `fixes/morph-scroll/phone/g7d-hold.sh` (sha pinned at the commit
that carries this ticket), one exclusive `--no-timing` chrome-measure hold per H, iphone lease with `--block <ticket>`:
- start gate, one uncounted warm-up load per arm port (C, V), the items, park after every run, end gate.
- H1: `foC foV nlV nlC`; H2: `fsV fsC e4V e4C`.

| item | script | what |
|---|---|---|
| fo | g-flingout-v1.json (35df651e2994) | 3 x 560 px / 140 ms close fling from the open end (flick-middle's fling) |
| nl | g-nearline-v1.json (b53003eac220) | 3 x 250 px + 3 x 280 px closes from open in 120 ms (lift ~3.6 / ~4.1 px/ms) |
| fs | g-fastshort-v1.json (8737f212c0ff) | 12 short flicks at the end, 60-200 px in 50-90 ms |
| e4 | g-momentum-v1.json (658e195e77fa) | E1-E4 at the end; E4 = 200 px / 140 ms close flick |

Probe: `--inject fixes/morph-scroll/msdbg-inject.mjs` (V's debug-only touchend log: page Fv, finger travel; a passive
scroll-event log of scrollY). Counts: `node fixes/morph-scroll/sim7d-analyze.mjs out/morph-scroll/g7d`.
Expected minutes: ~6 per hold, ~13 in all.

## Predictions (before data) and decisions

| item | prediction | if it holds | if not |
|---|---|---|---|
| fo | V released >= 2 of 3; C caught 3 of 3 | step 4 (the user's blind swipe pair) | V caught: read page Fv/travel per fling; WDA travel short of 300 on the phone -> report, no threshold change without the lead |
| nl | caught 6 of 6 on both arms | as above | a near-line close released on V: the travel line is too close to the user's closes; propose 350 px to the lead before step 4 |
| fs | V misses <= C misses | as above | a new miss on V: compare its Fv/travel with the rule; fix before step 4 |
| e4 | E4 closes on both | as above | V's E4 not closed: same as nl |
| all | pulled back to open on V <= C (UNRESOLVED return-to-open in every build) | as above | more returns on V: report with positions; Risk 1 of the D card |

Simulator (count-only, I-184, same scripts): fo on V 3 of 3 released, none pulled back (s1, page Fv -6.45 / -4.74 /
-4.81, travel 560); nl and fs: session 2 (results added here before the signature).
