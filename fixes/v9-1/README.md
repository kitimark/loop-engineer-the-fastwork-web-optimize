# Fix: v9-1 (v9.1 = v9-final + scroll-cb + the g11 close rule)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** built and pinned, **c3d36476c3ce / f1997edf5309**; function and look checks done (below); phone ticket
**P-131** drafted for the lead's sign and mgmt-ops-10's delta check. **No P-131 data exists.** Not timed (memory
`defer-timing-focus-call-tree.md`); the phone check is a no-worse check under the less-work rule.
**Integrator:** int-v8 (wave-integrator). Board row `v9-1`. Lead instruction 2026-10-05 (after v9-final landed as 8b5ce9b3).
**Build:** `patch.diff` (ab6d4761d1fc) is baseline-relative over 2 files: JS `c3d36476c3ce04cf…`, CSS `f1997edf5309…`.
Baseline snapshot `b1789284481295-4ad4a84a`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` and `/_app/immutable/assets/2.gBuqKVzi.css`, nothing else.

## Components

v9.1 is v9-final (fixes/v9-best, landed 8b5ce9b3) plus the two components the lead held out of v9:

| key | component | delta | why it was out of v9 | why it is back |
|---|---|---|---|---|
| ms7c, dd, earn, nav, glue | v9-final (rev 7c, double-drive, PR-021 rev 3, nav-hit-cache U1, glue) | as in fixes/v9-best | | |
| scb | scroll-cb (fix-scroll-cb), carried over dd | `fixes/v8-best/phone/nsc/scroll-cb-on-v8dd.diff` 7b4a7ee04d85 | the gM split: the first page-up fling in the middle stopped 500-950 px short with it (Simulator, OBSERVED); a ruling, not a proven cause (the shortfall is load-dependent and is seen without scroll-cb too) | v9.1 re-checks it with the fling-distance parity rule (Simulator here, phone in P-131) |
| g11 | the menu close, g11 form (fix-morph-gpu, landed 6f824153) | on v8 `fixes/morph-gpu/v91/close-v91-on-v8.diff` 3ab8a2fbbc68; on v9-final `close-v91-on-v9final.diff` d677884838c7 | the old close rule (`visibility: hidden` on the panel) made Chrome restyle at rest (census rest-0 60, rest-2796 22-34 main frames/s) | g11 hides only the panel's 4 children for 0.75 s, so no paused animation sits under `visibility: hidden` at rest; fix-morph-gpu's census: rest 46 / 1.6 / 0.4 like v9-final (fixes/morph-gpu/README.md "Rest recalcs from the close rule") |

## Identity checks (`fixes/v9-best/build.mjs --target v91`; `out/v91/build.log`, EXIT 0)

`build.mjs` takes `--target v9|v91` (default v9, unchanged: the v9 dry run still gives 647c9ef2b1e2 / e1359ab9994a,
`out/v91/v9-regress.log`). v91 writes `fixes/v9-1/overlay` (gitignored), `fixes/v9-1/patch.diff` and `out/v91/`.
- **Order:** the 420 legal orders of the 7 components (carry: scb after dd; after: nav after ms7c, glue after ms7c and
  nav) give the same bytes, c3d36476c3ce / f1997edf5309 (V91_EXPECT, pinned).
- **Owners' joined builds:** every JOIN matches, including fix-nav-morph's arm A (c3d36476c3ce / e1359ab9994a = v9.1
  minus g11 = v9-final + scb, the first v9-final's JS) and fix-morph-gpu's v9.1 (v9-final + g11 = 647c9ef2b1e2 /
  f1997edf5309, `out/morph-gpu/v91/snap-K91`).
- **g11 delivered twice, the same change:** v9-final built here = V9_EXPECT; v9-final + close-v91-on-v9final.diff =
  647c9ef2b1e2 / f1997edf5309 = the build of the set minus scb.
- **Reversals** (v9.1 minus each component = the others' build):

  | minus | JS / CSS |
  |---|---|
  | ms7c | 0694064c48f8 / f51fd6792520 |
  | dd | 6433d9cbee5f / a0ade57bb71b |
  | scb | 647c9ef2b1e2 / f1997edf5309 (v9-final + g11) |
  | earn | f298d50ffae4 / 7270cc082f3e |
  | nav | de237379b556 / f1997edf5309 |
  | glue | 54221230e292 / f1997edf5309 |
  | g11 | c3d36476c3ce / e1359ab9994a (v9-final + scb) |

- `node --check` OK; patch.diff reproduces the build. Snapshot `out/v91/snap-c3d36476c3ce`; comparison copies
  `out/v91/cmp` (A = v9-final, V = v9.1; HASHES.txt 4deb290ea694).

## Function and look checks (v9.1 vs v9-final; shared holds, no timing; `out/v91/looks.log`)

- **`fix.mjs check v9-1 --on v9-best --viewport both`: CHECK OK.** Mobile 1581 → 1581 elements, desktop 1423 → 1423;
  0 errors, 0 4xx, morph reached on both; screenshot diff mobile 0.18 / 0 / 0.1, desktop 0.08 / 0 / 0.
- **px-chrome** (A/A-gated, 2 loads an arm, 13 stops; PR-010 numbers). Desktop: consistent max 3 css px² (0.0002 %,
  y 0, the hero accent). Mobile: consistent 25 css px² (0.0062 %, max 27) at y 4496 (the platform image) and **36 css px²
  (0.009 %, max 232) at y 5090, a 32x16 css px box in the top nav bar** (`div.start-selling-top-nav-bar`); everything
  else 0. Both are far inside 0.5 %. fix-morph-gpu saw a single-pair 40 css px² at the same spot on v9-final + g11 that
  did not repeat; here it repeats in both pairs. Attribution (PX_ALIGN=1; A vs V, v9.1 − scb vs V, v9.1 − g11 vs V):
  PENDING-ATT.
- **dom-count:** after the walk mobile 1579 / 1579, desktop 1409 / 1409 in all four loads. Mobile t0 differs only in load
  V (1579: the morph panel and a second countdown already mounted at t0) and not in V2 (1382 = A, A2): per-load timing,
  not a change. The only token that differs after the walk is the hero accent's phase (`em.is-idle` in A/A2,
  `em.is-drawing-in` in V/V2), the word rotator's load phase (no count change).
- **Census (`gates/census-run.mjs`, Chrome work counts per second, no timing; loads A, V, V2, A2; docHeight 7210 in all):**

  | arm | rest-0 | rest-1400 | rest-2796 | rest-3800 | rest-end (y 6278) | scroll top→end: mainFrames / rafFire |
  |---|---|---|---|---|---|---|
  | A = v9-final | 38.7 | 41.8 | 2.2 | 26.1 | 28.3 | 110.9 / 289.1 |
  | A2 | 39.5 | 41.8 | 2.2 | 26.2 | 28.3 | 111.0 / 288.8 |
  | V = v9.1 | 38.8 | 42.1 | 2.2 | 28.3 | 28.3 | 111.1 / 187.1 |
  | V2 | 38.5 | 41.5 | 2.2 | 26.3 | 27.0 | 110.9 / 186.9 |

  - **No rest loop** (the old close rule's 60 / 22-34 at rest-0 / rest-2796): g11 keeps v9-final's rest level at every
    stop, as fix-morph-gpu found on v9-final + g11.
  - **scroll-cb's less-work effect shows:** rAF callbacks while scrolling 289 → 187 per s (−35 %) in both pairs;
    main frames, style recalcs, layouts and paints while scrolling unchanged (OBSERVED, Chrome counts).
- **Simulator fling parity (counts only, `sim.mjs gesture flick-middle-v2.json --count-only --param flingPx=300`,
  exclusive --no-timing holds; C = v9-final, V = v9.1; order C1 V1 V2 C2 C3 V3, one spare run an arm):** PENDING-PAR.

## P-131: v9-final vs v9.1, phone no-worse check (DRAFT for mgmt-ops-10's delta check and the lead's sign; no P-131 data)

Ticket id P-131: the next free id per ops-handover; mgmt-ops-10 confirms or renumbers. The block reuses P-122's
harness unchanged (P-121's path-matched G driver, nav-hit-cache's flicker gate, the fling-distance parity rule, the
time guard, the gates) with three changes: the arms (C = v9-final, V = v9.1), no part R, and one spare run an arm
(ops' P-122 lesson: ES ended insufficient at V 1 of 2 valid).

```
PHONE TICKET P-131 v9-1 · less-work no-worse check, v9-final C vs v9.1 V (+ scroll-cb, + the g11 close), P-121's
  path-matched G driver + nav's flicker gate (G1) + the fling-distance parity check · runner iphone-runner · verdict
  owner int-v8 · registered before any P-131 data; no counted run before the lead's sign and mgmt-ops-10's delta check
build: V = v9.1 = fixes/v9-1/patch.diff ab6d4761d1fc (v9-final + scroll-cb carry 7b4a7ee04d85 + g11 d677884838c7;
  fixes/v9-best/build.mjs --target v91, V91_EXPECT),
  JS c3d36476c3ce04cf475a33c4f59e5592b5cfb1e964230614f86b6c41231926b8, CSS f1997edf53090f2301f475c6d05675ae28f2e37808f3189276e90368ade60308
control: C = v9-final (landed 8b5ce9b3) = fixes/v9-best/patch.diff 4196eaa61d96,
  JS 647c9ef2b1e2bd7bb0f3a3f3c93cb69e2991744e91f8df48d276bbc7feab55f2, CSS e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
  Mirror snapshot b1789284481295-4ad4a84a. B = plain baseline (the gate's timer page).
copies and servers: out/p131/snap/{C,V} (read-only; `serve131.sh snap` copies C from out/v9/snap-647c9ef2b1e2-e1359ab9994a/V
  and V from out/v91/snap-c3d36476c3ce/V and refuses on any other hash), fixes/v9-1/phone/serve131.sh (a copy of
  serve122.sh with C, V, the folder and the sources changed; plain http, --port 0, --latency 150, --vendors=local);
  served-hash check before every item (case C:647c9ef2b1e2:e1359ab9994a|V:c3d36476c3ce:f1997edf5309; exit 4 on a wrong one).
question: under xcode-serious, does v9.1 add slow frames over v9-final (a) in flicks through the middle (gM: scroll-cb
  acts on scrolling), (b) in flicks into the page end and out again (gX, gS: the out strokes close the menu, where g11
  hides the panel's children for 0.75 s), (c) nav/.pain class flicker (flicker gate G1); and (d) does it change how far
  a fling travels (parity, BEHAVIOUR: scroll-cb's open question from the gM split)? No-worse only; landing basis: the
  less-work rule.
profile: xcode-serious (Xcode Device Conditions Serious, induced; thermal-gate.mjs --accept-induced at the start and end
  of every hold; no pre-warm, no cooling wait; ceiling 44 C or Critical; gate exits 2/3/7 void the hold).
sentinels: sCo/sCc in every hold (S on C: bottom >= 58 fps, scroll >= 44 fps); a failing sentinel voids every run since
  the last passing one; the hold is re-run once with the same items. New: C is now v9-final (P-122's sentinels ran on
  v8: 60.3 / 59.3 fps in H3a); a sentinel that fails on v9-final while its gates are fine goes to the lead before any
  re-run (no S-run sentinel on v9-final exists yet).
checkout: int-v8's worktree; hold131.sh prints one PIN line per hold (ticket, profile, checkout, HEAD, sha256/12 of
  hold131.sh, score131.mjs, serve131.sh, p122/score.mjs d1dddb910cd9, flicker-inject.mjs 71f7b00ce40b,
  flicker-gate.mjs 3c2bd0cb7f09, P-120's score.mjs fd9ecebcf4d0, P-111's score.mjs 26d944bf93e2, gate.mjs
  1a1d716698f0, thermal-gate ecb403b3ad25, verdict 8edb2fc77795, pmcheck d36bd7437b7c, flick-middle-v2 ca38f3627f78,
  flick-end-v2 4eb4bbc62b43, flick-return-v1 2ddbab3c23a1 (pinned, unused), out/p131/snap/HASHES.txt) and one PROG line
  per G part (N2: GESTURE_HASH/12 M 607b59612abb, X 21aaafd3a9fd, S 7312cdcd2574, unchanged from P-122). The values of
  the registering commit are the pins; any other value voids that hold.
holds (each inside the runner's exclusive no-timing chrome-measure hold, max 600 s; GESTURE_BUDGET_S 150 per G run;
  every G item with --inject flicker-inject.mjs; time guard: no G item starts after elapsed 420 s, else VOID "time",
  exit 7, re-run whole; at most 5 G runs a hold, as P-122's H3a/H4a):
  part M  H1a sCo wgMC wgMV gMC1 gMV1 gMV2 sCc · H1b sCo gMC2 gMC3 gMV3 sCc · H1c sCo gMV4 gMC4 sCc
  part X  H2a sCo wgXC wgXV gXC1 gXV1 gXV2 sCc · H2b sCo gXC2 gXC3 gXV3 sCc · H2c sCo gXV4 gXC4 sCc
  part S  H3a sCo wgSC wgSV gSC1 gSV1 gSV2 sCc · H3b sCo gSC2 gSV3 gSC3 sCc · H3c sCo gSV4 sCc
  usage per hold (the I-168 wrapper with the block mark):
    TICKET=P-131 node tools/lock.mjs run iphone --owner iphone-runner --block P-131 --max-seconds 900 -- \
      node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "v9.1 P-131 <H>" \
      -- caffeinate -i -s sh fixes/v9-1/phone/hold131.sh <H> <items>
  then iphone.mjs park; int-v8 stops the servers after the last hold. No re-runs beyond the sentinel and time-guard
  rules: the spares are planned up front, not added after data.
spares (one spare run an arm where a verdict needs it; per part: needed + spare):
  M  C 3 + 1, V 3 + 1 (GM needs 3 valid an arm; parity M needs 2 pairs; FLICKER 3 an arm)
  X  C 3 + 1, V 3 + 1 (EX needs 3 valid V; parity X 2 pairs; FLICKER 3 an arm)
  S  C 3,     V 2 + 2 (ES needs 2 valid V; FLICKER 3 an arm; V gets a second spare: P-122's gS path gate voided 2 of 3
     V runs on a touch-timestamp artifact, the last-move dt of 1-2 ms, OBSERVED; S's C runs gate nothing but FLICKER)
scorer: fixes/v9-1/phone/score131.mjs, a wrapper that imports P-122's scorer fixes/v9-best/phone/p122/score.mjs
  (d1dddb910cd9, refused if changed) unchanged and only re-pins the arms (C = v9-final, V = v9.1). Gates as P-122:
  GM (> 50 WORSE d > +2, any NEW 250 px cluster; fewer than 3 valid an arm: insufficient), EX and ES (V ceiling: 0 frames
  > 50 ms in into1..end over all valid V runs; twins > 46 / > 54, threshold-sensitive when one differs; (46, 54] flagged;
  min valid V 3 for EX, 2 for ES), FLICKER (G1, V monotone blinks 0, per part M, X, S; G2/G3 report only). BEHAVIOUR:
  the parity (M's first page-up fling after mid1, X's first stroke after into1; median gap > 300 px AND >= 2 pairs > 300
  px in the same direction; the clipped-end rule; path-voided runs included; fewer than 2 pairs: insufficient).
  Path gates per run as P-122 (gM gateM; gX V the stroke criteria, catch reported; gS gateE slow). Known, by design:
  P-122's C rule for part X (the fling leaves the end by >= 1600 px) now VOIDs C's X runs, because C has rev 7c's catch
  too; no gate reads C's X runs (EX is a V ceiling, parity and FLICKER take every counted run), so no verdict changes.
  Arm identity: G runs by the served-hash check log before each item (required "ok", else VOID); S sentinels also by
  the record's served map against the re-pinned arm C.
  Self-test: selftest131.mjs (SELFTEST-131 OK 25): with P-122's arm pins the wrapper reproduces P-122's score-final.json
  on its 43 run files (verdict, GM/EX/ES, FLICKER per part, parity, per-run voids); with P-131's pins P-122's v8
  sentinels are VOID "served not arm C" and a G run without its check log is VOID; hold131.sh's TICKET guard, part R and
  unknown items refused, the 420 / 421 s time guard; serve131.sh and score131.mjs pin the same full hashes.
verdict: BEHAVIOUR FAIL (own line, leads the block verdict) if the parity counts; frames: WORSE if any gate is WORSE or
  has a NEW cluster; else insufficient if any is; else no-worse. BEHAVIOUR FAIL or WORSE -> int-v8 splits by the
  reversal builds (v9.1 - scb = v9-final + g11, v9.1 - g11 = v9-final + scb; both pinned above) and reports to the lead,
  fix-scroll-cb and fix-morph-gpu.
F-260 (report only, every run): y90 = 0.9 docH - vh and when the run first reaches it.
predictions (int-v8, before phone data):
  - BEHAVIOUR (parity): pass 0.75, BEHAVIOUR FAIL 0.10, insufficient 0.15. Both arms now share rev 7c, the 100lvh end
    and the same open end, so X's clipped-end exemption should not be needed; M is scroll-cb's open question
    (Simulator result above).
  - GM: no-worse 0.70, insufficient 0.15, WORSE 0.15 (scroll-cb does less work on the compact path; P-122's GM was
    no-worse with 3 / 3 valid).
  - EX: no-worse 0.65, WORSE 0.15, insufficient 0.20 (g11 acts in the out strokes' close; fewer close repaints in
    Chrome and WebKit per fix-morph-gpu).
  - ES: no-worse 0.55, insufficient 0.30, WORSE 0.15 (the gS touch-timestamp voids may recur; the second V spare is for that).
  - FLICKER G1: pass 0.85, FAIL 0.10, insufficient 0.05.
  - Sentinels on v9-final: every hold passes on the first try 0.65.
  - Overall: no-worse 0.45, insufficient 0.35, WORSE or BEHAVIOUR FAIL 0.20.
minutes: ~70 (9 holds: H1a/H2a/H3a ~10 each, H1b/H2b/H3b ~7, H1c/H2c ~6, H3c ~4; gates included; no pre-warm; the
  runner's gaps between holds extra).
open items:
  - PR-023 rev 7d (fix-hero-exit-threaded, commit f387675d): if the user accepts it, v9.1 may take the 7d swap
    (v9-final + 7d = JS 1b2eecc66011); that would be a new V and a new card, not this one.
  - Page-end rest work (P-097, fix-cd-roll-ca-r4) is in both arms (rev 7c's open end); not this ticket's question.
```
