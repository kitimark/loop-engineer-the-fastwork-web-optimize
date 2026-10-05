# Fix: v9-2 (v9.2 = v9.1d; rev 1.3: U2, people-word a and nav-fade OUT)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** P-142 **rev 1.3**: v9.2 re-pinned to **941aa13e5bdf / f1997edf5309 = v9.1d** (`V92_EXPECT`): U2 OUT (rev 1.2),
pw OUT and nf OUT at the component gates (lead R1-R6, R2 reading B; "Rev 1.3" below). Rev 1.2 pinned 30f6371751f4 /
1c4161f56545 (v9.1d + pw + nf) after **U2 went OUT** (T2 fail at y 2120, lead's rule; "Rev 1.2" below). Card registered before any P-142 data (58269015, rebased c1ed6ab6); pre-data
read PASS with N1-N7 (ops-reader-P142); **SIGNED by the lead** with N1-N7 as conditions. No part 1 run until every
component gate on the new V passes and the lead's delta check passes. The iPhone is disconnected: parts 2 and 3 wait for
the lead's go after the user reconnects it.
**Integrator:** int-v8 (wave-integrator). Board row `v9-1`. Tasking: user T-199 #3, the lead's plan T-199 #4 (build v9.2
from every fix whose rendering count test passed, measure it ONCE against v9-final, a P-ticket with land rules and a
bisect plan, an Opus pre-data read).
**Build:** `patch.diff` (ce2d32a1bbbb, rev 1.3) is baseline-relative over 2 files: JS `941aa13e5bdf0b7a…`, CSS
`f1997edf5309…` (rev 1.2: 973f3f8442cc, 30f6371751f4a830… / 1c4161f56545d955…).
Baseline snapshot `b1789284481295-4ad4a84a`. Branch rebased on main (N1) before this build.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js` and `/_app/immutable/assets/2.gBuqKVzi.css`, nothing else.

## What is in it (one pinned line; lead 2026-10-05 ~16:0xZ: "v9.2 = v9.1d + pw + nf (30f6371751f4 / 1c4161f56545)")

| key | component | why IN | delta (C = v9-final + rev 7d) |
|---|---|---|---|
| (base) | v9.1d = v9-final + rev 7d + scroll-cb + the g11 close rule (`fixes/v9-1d/`, 941aa13e5bdf / f1997edf5309) | P-134 folded into this ticket (lead): v9.1d is the base and the first bisect section | build.mjs `--target v91d` |
| pw | people-word option a (fix-people-word, landed 729754eb) | the user's accepted proposal PR-024 (motion differs by design; no count pass needed): its pixel gate is against the accepted Try-it B, plus the functional checks inside v9.2 | derived from `fixes/people-word-a/patch.diff` (C → owner build; the derived delta 4f2e04403fd5 = the owner's delta file) |
| nf | nav-fade (fix-nav-fade, head 31718fc9; delta unchanged since f4c2fa0d) | lead: nav-fade IN after ops-reader-navfade-b9 CONFIRMED 7720ea3a; P-139 (its phone check) is stood in for by this block | `nav-fade-on-v9final.diff` f41d2854aa90 @f4c2fa0d |

OUT: **nav-hit-cache U2** (rev 1.2: T2 fail at y 2120; to a proposal or v9.3, fix-nav-morph; P-138 part 2 is no longer
folded here), and at the 15:00Z freeze hero-park (parked, P-140 closed before data), cd-roll-ca-r4 / P-097 (changes
motion: a proposal), toolbar-resize (nothing to stack).

## Identity checks (`node fixes/v9-best/build.mjs --target v92 --with pw,nf`; `out/v92-build-r12.log`, EXIT 0)

The extras are deltas against C (v9-final + rev 7d), checked strictly (no fuzz; CONFLICT stops):
- each owner's pin on C (pw bf75ce87958c / e1359ab9994a = the accepted Try-it B bytes; nf 2ed12145e856 / 9646fc3da77a,
  offsets 7), on v9.1d (pw 35885634a455 / f1997edf5309, offsets 82; nf 8bbe6a33dfde / 1c4161f56545) and, for nf, on
  v9-final as delivered (a03872195d3f / 9646fc3da77a);
- both orders of pw, nf on v9.1d give the same bytes; v9.2 − pw = v9.1d + nf, v9.2 − nf = v9.1d + pw, v9.2 minus both =
  v9.1d; X = C + pw + nf; F = v9-final as landed (`fixes/v9-best/patch.diff` @8b5ce9b3 4196eaa61d96 on the baseline, byte
  for byte = 647c9ef2b1e2 / e1359ab9994a).
- `node --check` OK; `patch.diff` (973f3f8442cc) reproduces the build.

Snapshot `out/v92/snap-30f6371751f4` (HASHES.txt), arms:

| arm | what | JS / CSS |
|---|---|---|
| A | v8 | 3e3e94cb6e9f / f836404b3728 |
| C | v9-final + rev 7d | 1b2eecc66011 / e1359ab9994a |
| **F** | **v9-final (P-142's control)** | **647c9ef2b1e2 / e1359ab9994a** |
| B | v9.1d | 941aa13e5bdf / f1997edf5309 |
| X | C + pw + nf | 3d7ec8343ce3 / 9646fc3da77a |
| Opw / Onf | C + that extra alone (Opw = Try-it B) | bf75ce87958c / e1359ab9994a; 2ed12145e856 / 9646fc3da77a |
| Mpw / Mnf | v9.2 minus that extra | 8bbe6a33dfde / 1c4161f56545; 35885634a455 / f1997edf5309 |
| **V** | **v9.2** | **30f6371751f4 / 1c4161f56545** |

`out/v92/cmp-r12` holds A = F and V = V for the tools that name arms A/V. Rev 1.1's snapshot `out/v92/snap-6468db04395c`
(with U2) is kept for the record only.

## Pre-data checks (component gates; shared holds, no timing; `out/v92/looks-r12.log`)

Runner `fixes/v9-2/pre/look92b.sh` (each step its own shared hold, in order): g11 exactness on v9.2 (V,F); `fix.mjs check
v9-2 --on v9-best --viewport both`; nf T2 px Chrome (Mnf vs V, mobile aligned and desktop); pw px Chrome (Mpw vs V,
mobile aligned: rule (b)); pw's functional probe on Try-it B (Opw) vs V (rule (c)); the rest census v9.1d vs v9.2
(B,V,V2,B2); dom-count v9-final vs v9.2; `geo92.mjs` (nav-fade's flip and end crossings at 430x775); nf T2 px Simulator
(px-sim, Mnf vs V); a `sim92.mjs` smoke on arm C (a non-ticket arm). Pass lines as in rev 1.1 N2 / rev 1.2. Results are
added here when they finish; a failing component gate puts that fix OUT before any data (v9.2 becomes the matching
minus-one build under a re-pinned card) and goes to the lead and the fix's owner.

## P-142: v9-final vs v9.2, counts + one phone block + one blind swipe A/B

Ticket id P-142 (mgmt-clerk-1, registered 5e8b4460). It folds in P-134 (v9.1d's phone check, card in
`fixes/v9-1d/README.md`, never run) and stands in for P-139 (nav-fade's phone check). P-138 part 2 (U2's phone check)
was folded in until rev 1.2 put U2 OUT.

```
TICKET P-142 v9-2 · v9-final (F) vs v9.2 (V): part 1 counts (Chrome census, the NF-C nav reveal band, Simulator census),
  part 2 one G phone block (parts M, X, S as P-134 + part H, the hero flip), part 3 one blind swipe A/B · runner int-v8
  · verdict owner int-v8 · registered before any P-142 data; no part runs before the lead's sign and the pre-data read
build: V = v9.2 = fixes/v9-2/patch.diff 973f3f8442cc (fixes/v9-best/build.mjs --target v92 --with pw,nf, V92_EXPECT;
  without --with, EXTRAS also brings in hp and the build fails V92_EXPECT),
  JS 30f6371751f4a83029629484b791a53c4231bec57565c80bfea9e0e42f1c5794, CSS 1c4161f56545d955d8eb99960530fb1d541dd386bbe0cc746308409d4057d1c4
  (rev 1.2; rev 1.1 pinned v9.1d + pw + nhc + nf = 6468db04395c / 1c4161f56545)
control: C = F = v9-final as landed (8b5ce9b3, fixes/v9-best/patch.diff 4196eaa61d96, build.mjs V9F / V9_EXPECT),
  JS 647c9ef2b1e2bd7bb0f3a3f3c93cb69e2991744e91f8df48d276bbc7feab55f2, CSS e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
  V differs from C by: rev 7d, scroll-cb, g11 (= v9.1d), people-word a, nav-fade. Mirror snapshot
  b1789284481295-4ad4a84a. Countdown expiry 2026-11-02 05:00Z: every part runs before it.
question: does v9.2 do no more rendering work than v9-final (part 1), add no slow frames, class flicker or fling-distance
  change on the phone (part 2), and does the user not prefer v9-final by finger (part 3)? No-worse / less-work only;
  landing basis: the less-work rule (memory "less-work-landing-rule"), with the swipe A/B as the finger check.
```

### Rev 1.1: pre-data read amendments (ops-reader-P142, 15:3xZ: PASS with notes N1-N7) and the lead's rulings at the sign; added before any part 1 data

- **N1 (rebase):** the branch is rebased on main before any part runs (it was 67 commits behind; tools/ and tests/ differ:
  I-202, I-204, I-206, I-207, I-209, I-210), after the queued pre-data probes finish (they run this checkout's tools; no
  rebase under a running job). Then the lead's delta check (steps 1-4: build identity, kit pins, SELFTEST-142) on the rebased
  head; the PIN lines (part 1, every phone hold) name the head they ran on.
- **N2 (component pass lines; lead rulings at the sign, rev 1.1):**
  - **U2: T2, not T0.** The mobile U2 px run (ended 15:26:45Z, 2 s before 58269015) showed consistent residues at y 2120
    (6 css px²) and y 6278 (23 css px²), both pairs, A/A 0 %, so a T0 line set now would be informed. The gate is the
    standing PR-010 T2 numbers, which predate the data (not informed): consistent fill ≤ 64, edge ≤ 128, ≤ 0.5 % of the
    stop, Chrome (px-chrome, mobile aligned + desktop) AND Simulator (px-sim, frozen frames at rest) A/A-gated, Mnhc vs V.
    fix-nav-morph is asked to explain the two spots (OBSERVED). **U2 fails T2 → U2 OUT of v9.2** (a proposal or v9.3),
    and v9.2 becomes the matching minus-one build (Mnhc, 30f6371751f4 / 1c4161f56545) under a re-pinned card.
  - **nf: T2 with the PR-010 numbers** (the same, Chrome + Simulator, Mnf vs V); nav-fade's own tighter numbers (fill 0,
    edge ≤ 68, ≤ 118 css px², ≤ 0.03 %) are descriptive only. Fail → nf OUT (v9.2 = Mnf).
  - **people-word vs the accepted Try-it B:** pass = (a) v9.2's word hunk is byte-identical to the Try-it B build's hunk,
    AND (b) at rest, v9.2 vs v9.2 − pw (Mpw) shows 0 px outside the word band (px-chrome mobile aligned; motion excluded by
    the user's decision), AND (c) the functional probe on V gives the same events as on Try-it B (Opw). Any miss → pw OUT.
    (a) is checked: `diff -U0` Mpw → V and C → Opw give the same 69 changed JS lines, byte for byte (hunk headers aside:
    line offsets differ), and pw leaves the CSS unchanged (Mpw CSS = V CSS) → **(a) PASS**.
  - Simulator legs added for rev 1.1: `fixes/v9-2/pre/simpx.sh` (px-sim A=Mnhc,V=V and A=Mnf,V=V; stopped before it ran; rev 1.2 runs px-sim Mnf vs V inside look92b.sh).
- **N3 (order):** part 1 starts only after every component gate result (g11 exactness, fix.mjs check, U2 T2 Chrome +
  Simulator, nf T2 Chrome + Simulator, pw (a)-(c), rest census, dom-count, geo92, the sim92 smoke) is written into this
  card and passes, or the failing fix is OUT and the card is re-pinned to the minus-one build. The gate runners are
  committed in `fixes/v9-2/pre/` (copies of the scratch scripts that ran; sha256/12: look92.sh a79c8d0d8159,
  g11exact92.mjs 5a7180ed9241, pw92.sh 13b21a035db9, pw-probe.mjs 923112f9b554 (fix-people-word's probe), geo92.sh
  a1ba37b4d9ad, simsmoke.sh f6fdf5bf9fbb, simpx.sh a9586dd44f0b); the results name them again.
- **N4 (host clause for part 1; lead ruling, as P-141 rev 1.1):** load1 > 200 at a step's start → that step is
  VOID-HOST, its record folder / files are moved to a `-void1` name, and the step is re-run once; a second VOID-HOST
  stops part 1 (to the lead). Otherwise no host VOID; load1 is logged at the start and end of every step (part1.sh).
  The check runs inside each step's hold (`fixes/v9-2/hostgate.sh`, exit 9 before the step's command, so a VOID-HOST step
  writes no record; anything it did write is moved to `-void1`).
- **N6 (records and re-runs):** 1a's records are only the files part1.sh lists as `RECORD` lines for that step (census-run
  writes beside older out/v9/census-* files); NF-C's likewise (out/nav-fade/motion-chrome-nfc*). sim92 appends to
  out/v92/sim/p142.json: a re-run of an insufficient step appends new loads; the read uses each arm's first 3 non-VOID
  loads in log order, so a re-run only replaces VOID loads. 1a, NF-C and 1c have no pinned scorer: the result read
  recomputes them from the records with the rules above. Precedence: within NF-C (and within 1a / 1c), one metric FAIL /
  WORSE plus another insufficient = FAIL / WORSE.
- **N7 (labels):** pre-data for v9.2. INFORMED: the NF-C floor (10 recalcs / 5 layouts) and the 1a / 1c expectations
  (from nav-fade's n = 2 Chrome counts and the components' own data), the part 2 predictions (from P-122 / P-138). Not informed: the U2 and nf gates (PR-010
  T2 numbers, which predate the data; no T0 line was adopted after the U2 mobile run). The queued rest census (B vs V: v9.1d vs v9.2) previews V's rest stops before
  1a; 1a's rules were registered first (58269015), so 1a is not informed by it.

### Rev 1.2: U2 OUT, v9.2 re-pinned (lead rulings ~15:4x-16:0xZ; added before any part 1 data)

- **How the T2 shade is read** (lead ruling, fixed before the Simulator leg was seen and applied as written): T2 judges
  only the pixels that are beyond A/A in both pairs (pxlib's consistent mask: > 8 levels in all four cross pairs while
  neither A/A pair is > 8 there); among them, edge pixels > 128 or fill pixels > 64 (edge / fill by pxlib's flat rule:
  the 3x3 luma range of A ≤ 2 = fill) is a T2 FAIL; the stop-wide largest shade does not decide it.
- **Disclosure: the old V's pixel data led to U2 OUT.** px-chrome mobile on rev 1.1's snapshot, Mnhc vs V (6468db04395c),
  `out/v9/px-mobile-2026-10-05T15-26-45-515Z` (ended 15:26:45Z): at y 2120 (nav bar) 57 device px (6 css px²) beyond A/A
  in both pairs: 54 edge (largest shade 192, one pixel at device 455,44; the next 67, 55, 54), 3 fill (largest 14) →
  **edge 192 > 128: T2 FAIL → U2 OUT, v9.2 = Mnhc = v9.1d + pw + nf.** y 6278 (morph CTA): 207 px, all edge, largest 19
  (within T2). Desktop: 0 consistent at every stop. Analysis script `fixes/v9-2/pre/t2shade.mjs` (reads the existing
  screenshots; no new run). fix-nav-morph's reading (OBSERVED, by code reading only): U2 cannot take its deferral path
  at y 2120 (the morph is closed there), so the 192 pixel may be a rendering phase of the different bytes, not a stale
  class; UNRESOLVED, its decisive check (per-stop class and probe logs, Mnhc vs V) goes to v9.3 with U2.
- **What was stopped:** rev 1.1's queued component gates on the old V (nf T2 mobile was running, then nf desktop, pw px and
  functional, rest census, dom-count, geo92, the sim smoke, simpx) were stopped at ~15:42Z; their partial output stays in
  `out/v92/looks.log` and gates nothing. The nf and pw gates on the new V are fresh runs (`look92b.sh`), as are g11
  exactness and fix.mjs check (V changed).
- **Re-pinned:** `V92_EXPECT` 30f6371751f4 / 1c4161f56545; the build command `--with pw,nf`; patch.diff 973f3f8442cc;
  snapshot `out/v92/snap-30f6371751f4`; serve142.sh / score142.mjs / selftest142.mjs (V), part1.sh, sim92.mjs, geo92.mjs
  and pw92.sh (snapshot); NF-C's Mnf is now v9.1d + pw (35885634a455 / f1997edf5309). The pw (a) check still holds on the
  new stack (the same hunk: Mpw → V = v9.1d + nf → v9.1d + pw + nf).
- **Unchanged:** every rule of rev 1.0 / 1.1 (part 1 rules, NF-C pass line and floor, host clause, the phone block, the
  swipe A/B, land / no-land / INSUFFICIENT), now on the new V. Part 2's FLICKER gate keeps its role (no U2 in V).

### Rev 1.2 gate results, the same-bytes run (lead R1-R6) and the resulting build (no part 1 data yet)

Component gates (`look92b.sh`, `out/v92/looks-r12.log`, LOOK92B-DONE 17:10:20Z):

| gate | result |
|---|---|
| g11 exactness (V, F) | EXIT 0 |
| fix.mjs check v9-2 --on v9-best | CHECK OK (elements mobile 1581 → 1583, desktop 1423 → 1425; 0 errors) |
| nf T2 Chrome mobile (Mnf vs V, aligned) | every both-pairs spot within T2 (largest 15 css px² at y 2120, nav, edge 58; 0 fill) |
| nf T2 Chrome desktop | y 4255: 13,879 css px² both-pairs, fill 236 (section.pain > div.pain-sticky, the cycling sticky notes) → T2 FAIL as written; y 1739 / 2577: 4,627 / 3,561 css px² (section.feed img, edge 118) → over the 2,000 css px² element cap; Join button y 5932 / 6771 / 7609 edge 119 (within) |
| nf T2 Simulator (px-sim Mnf vs V) | both-pairs clusters 4-17 css px² per stop; within T2 except one 4 css px² cluster (shade 255) at css 96-112 x 16-48, y 2796-6075, attributed to the nav bar by position: it is the Simulator's status-bar recording clock (frames show "0:02" / "0:03" / "0:04", the A frame the recording pill), not page content (OBSERVED, from the frames) |
| pw (b) Chrome mobile (Mpw vs V, aligned) | y 2120: 3 css px² both-pairs in the nav bar (edge 70); y 4496: 1 css px² in the platform text (p.is-desc, edge 11): both outside the word band → (b) fails as written |
| pw (c) functional | first run void (empty result, pw92.sh bug, fixed: an empty result now exits 5); re-run in samebytes.sh, see below |
| rest census B vs V | V ≈ B (rest-0 ~39, rest-2796 ~2, rest-end 27-28; scroll rafFire ~187-189, mainFrames ~110; no rest loop) |
| dom-count F vs V | V +2 elements (span.fw-nf-mk, span.fw-nf-mki), mobile and desktop |
| geo92 (430x775) | F and V identical (hero pill off 560 / on 556; end is-morphing 5192, is-earn-hidden 5344, both off 5187) |
| sim92 smoke (arm C) | works |

Same-bytes run (lead R1: px-chrome A=V,V=V, mobile aligned + desktop, n = 1 each, shared slots; runner
`fixes/v9-2/pre/samebytes.sh` be51a7217478, pw92.sh 9989193659db; `out/v92/samebytes.log`, SAMEBYTES-DONE 17:29:15Z;
records `out/v9/px-mobile-2026-10-05T17-13-56-214Z`, `out/v9/px-desktop-2026-10-05T17-19-32-470Z`):

| stop | both-pairs (consistent) | A~V beyond A/A, largest element | A/A, V/V raw (> 8 levels) | R2 status |
|---|---|---|---|---|
| mobile y 2120 | 0 | 1 css px² (A2~V2 65, nav bar) | ~152 / ~383 css px² (nav bar) | CLEAN |
| mobile y 4496 | 0 | 101 css px² (platform img) | ~281 / ~506 css px² | CLEAN |
| desktop y 1739 | 0 | 0 | 7,498 / 7,498 css px² (feed img, max 113) | CLEAN as reported; UNJUDGEABLE if A/A counts |
| desktop y 2577 | 0 | 0 | 5,855 / 5,855 css px² (feed img, max 118) | CLEAN as reported; UNJUDGEABLE if A/A counts |
| desktop y 4255 | 0 | 8,575 css px² (section.pain > div.pain-note.extra, max 222) | 3.24 % / 2.92 % of the stop | UNJUDGEABLE (element > 2,000) |

Reading A (R2 on the beyond-A/A residues as px-chrome reports them) and reading B (any element differing between loads of
the same bytes, A/A and V/V included, over 2,000 css px²) differ only at y 1739 / 2577; the lead picks the reading.

- **pw: OUT under both readings.** y 2120 and y 4496 are CLEAN, so (b) stands as written (R4): 3 + 1 css px² outside the
  word band. (c), read from the record (R6): the word events are the same set in all three runs and in the same order on
  mobile and desktop; on mobile reduced-motion headIO+ / stack+ / expanded+ fire within 1 ms in a different order
  (B 3027/3027/3028, V 3004/3004/3005); word classes at the 1.0-3.0 s shots are equal; listener and observer counts
  differ (V: resize@window 6 vs 3, IO 35 vs 23 on mobile) from v9.1d and nf, not pw. (c) is moot: pw is OUT on (b).
- **nf: reading A → OUT** (y 1739 / 2577 CLEAN, 4,627 / 3,561 css px² > the element cap); y 4255 is UNJUDGEABLE either way
  and its residue (pain section) is outside the nav, so it alone would not fail nf (R3). **Reading B → nf passes Chrome**
  (all three desktop stops UNJUDGEABLE, residues outside the nav), and stays in only if the Simulator status-bar cluster
  (inside the nav's box by position, not page pixels) is ruled out; R1 covered Chrome only, so that is the lead's call.
- **U2 stays OUT** (R5: y 2120 mobile CLEAN).
- **Resulting build:** reading A: **v9.2 = v9.1d** (arm B, 941aa13e5bdf / f1997edf5309). Reading B with the Simulator
  cluster ruled out: v9.2 = v9.1d + nf (arm Mpw, 8bbe6a33dfde / 1c4161f56545). Either way the card is re-pinned and part 1
  waits for the lead's go.

### Rev 1.3: lead ruling on R2 (reading B), the Simulator geometry check, v9.2 = v9.1d (no part 1 data yet)

- **The lead's R2 ruling, verbatim** (~17:3xZ): "Lead ruling on P-142 R2: reading B. R1 defines the same-bytes run as
  the A/A test of the both-pairs mask. A stop where loads of identical bytes differ in one element by more than 2 000
  css px² (the feed img at desk 1739 / 2577: 7 498 / 5 855) is a stop the mask cannot judge. That makes 1739 and 2577
  UNJUDGEABLE, and nf passes Chrome there by R3: the residues lie outside the nav. I resolved R2's wording, which was
  ambiguous on this point, by R1's stated purpose." Both readings and their builds are in the section above: reading A
  → v9.2 = v9.1d; reading B → v9.2 = v9.1d + nf if the Simulator cluster is excluded, else v9.1d.
- **The Simulator cluster, by the lead's mechanical rule** ("exclude it only by a mechanical geometry check, not from
  the frames": the box must lie entirely outside the web content's rect, above the content top, using the screenshot's
  content offset the tool already knows; if any of it lies inside, it counts and nf fails):
  - The px-sim record (`out/v9/px-sim-2026-10-05T17-01-35-729Z/px.json`) has `top: 0`, `calibrationRow: 0`: px-sim's
    magenta calibration bar (fixed, top 0) was found from screenshot row 0, so the content top it knows is css y 0.
  - The cluster box is css x 96-112, y 16-48 (device rows 48-144) at y 2796-6075: entirely below the content top 0,
    so **inside the content rect → it counts → shade 255 > 128 edge / 64 fill → nf T2 FAIL in the Simulator → nf OUT.**
  - Disclosed, not used for the call (OBSERVED, in our setup, cause unknown): in `calibration.png` the magenta covers
    device rows 0-194 (65 css px) for a 6 css px bar, the status-bar clock and the camera cut-out drawn over it; so the
    recorded content top may be the status-bar tint, not the page's top edge. Settling that needs a new Simulator run;
    per the ruling none is made without the lead's OK.
- **Outcome:** U2 OUT (rev 1.2), pw OUT ((b) at y 2120 and y 4496, both CLEAN), nf OUT (Simulator, above).
  **v9.2 = v9.1d**, `node fixes/v9-best/build.mjs --target v92 --with ''` (no extras; `out/v92-build-r13.log`, EXIT 0):
  JS `941aa13e5bdf0b7a…`, CSS `f1997edf5309…` (= V91D_EXPECT, = arm B of rev 1.2), patch.diff ce2d32a1bbbb, snapshot
  `out/v92/snap-941aa13e5bdf` (arms A, C, F, B, X, V; HASHES.txt f5f2db042aaf). P-142 now measures v9-final vs v9.1d,
  which is P-134's question (folded in here since rev 1.0).
- **Re-pinned (rev 1.3):** `V92_EXPECT` 941aa13e5bdf / f1997edf5309; serve142.sh (V source and full hashes, served-hash
  case); score142.mjs `P142.V`; selftest142.mjs (serve142 folders; SELFTEST-142 OK 44); part1.sh, sim92.mjs, geo92.mjs
  (snapshot). **part1.sh drops step 2 (NF-C)**: nf is OUT and the snapshot has no Mnf arm; steps 1 (Chrome census) and
  3 (Simulator census) and every rule of them are unchanged. The registered build line in the P-142 card block above is
  superseded by this one; the card text stays as registered.
- **Left for the lead (not changed):** part 2's part H (the hero flip, added for nav-fade) and score142's NF gate (the
  nav-fade windows) now ask a v9.1d-vs-v9-final question nobody needs for landing; they stay as registered unless the
  lead drops them. (The lead dropped both: rev 1.3a below.)

| file (rev 1.3) | sha256/12 |
|---|---|
| fixes/v9-best/build.mjs | d25885e2d428 |
| fixes/v9-2/patch.diff | ce2d32a1bbbb |
| fixes/v9-2/part1.sh | cbe46b389e2f |
| fixes/v9-2/hostgate.sh | d800dd5a5ad2 (unchanged) |
| fixes/v9-2/sim92.mjs | 2d2e7cdc00f9 |
| fixes/v9-2/geo92.mjs | bf1b2ed6bee1 |
| fixes/v9-2/phone/serve142.sh | 5eb8a96daa16 |
| fixes/v9-2/phone/hold142.sh | a9e0cbb38d8c (unchanged) |
| fixes/v9-2/phone/score142.mjs | bf977770727c |
| fixes/v9-2/phone/selftest142.mjs | 5d4d06937b6e |
| fixes/v9-2/pre/pw92.sh | 9989193659db (rev 1.2 fix: an empty probe result exits 5, VOID; was 472f81e00ded) |
| fixes/v9-2/pre/samebytes.sh | be51a7217478 |
| out/v92/snap-941aa13e5bdf/HASHES.txt | f5f2db042aaf |

### Rev 1.3a: part H and the NF gate dropped (lead ruling after the rev 1.3 delta check PASS; pre-data scope reduction)

- **Lead (~17:5xZ):** "Delta check of P-142 rev 1.3 (53b0af35): PASS. ... The nf OUT call stands by the rule as written ...
  Ruling: drop part 2's part H (the hero flip) and score142's NF gate. Both were added only for nav-fade, so with nf OUT
  they have no arm. This is a pre-data scope reduction: disclose it in the README and change no other rule." GO for part
  1 as registered at 53b0af35 (started then, before this edit; part1.sh is untouched here).
- **What changed (phone kit only; no part 2 data exists):**
  - `hold142.sh`: H items (wgH*, gH*) are refused like part R (HOLD VOID, exit 4, no run); the item patterns are
    [MXS]. PROG_H and flick-hero-v1 stay in the file for the record only (still pinned in the PIN line, never run).
  - `score142.mjs`: `score142()` refuses any H item (throws; the CLI exits 3) and computes neither FLICKER_H nor NF; the
    gates are GM, EX, ES, FLICKER; the block verdict is BEHAVIOUR FAIL (leads) / WORSE / insufficient / no-worse over those
    four. The H / NF helpers and the nf-read pin stay in the file, unused.
  - `selftest142.mjs`: the H / NF checks became refusal checks (score142 refuses gHC1, gHV2, wgHC; hold142 refuses wgHV,
    gHV1, gHC2 and a hold mixing M and H); with P-122's pins the wrapper's gates are exactly GM, EX, ES, FLICKER and its
    block verdict equals P-122's score-final.json. **SELFTEST-142 OK 38** (was 44: the H / NF synthetic checks are gone).
- **Part 2 as now planned:** holds H1a-c (M), H2a-c (X), H3a-c (S) exactly as registered; H4a-c (part H) and their spares
  (H C 3+1, V 3+1) are dropped: 9 holds, ~70 min. In the card block below, part H, FLICKER_H and NF are superseded by
  this section; every other part 2 rule (sentinels, gates, time guard, items, spares of M / X / S, scorer pins) is
  unchanged. The bisect rows that name NF / FLICKER_H no longer apply (nf is not in V).

| file (rev 1.3a) | sha256/12 |
|---|---|
| fixes/v9-2/phone/hold142.sh | aa4b9baae11e (was a9e0cbb38d8c) |
| fixes/v9-2/phone/score142.mjs | 8960b2d9a721 (was bf977770727c) |
| fixes/v9-2/phone/selftest142.mjs | 380d04acefe0 (was 5d4d06937b6e) |

### Part 1: counts (no timing; `sh fixes/v9-2/part1.sh` in the background, after the sign and the read)

Each step is its own shared hold (≤ 300 s), one queue entry at a time; served hashes checked by every probe; log
`out/v92/part1.log` (first line PIN: HEAD and sha256/12 of part1.sh, motion.mjs d34355055470, chromecount.mjs
59e033b57047, sim92.mjs, census-run.mjs, HASHES.txt).

**1a. Chrome census** (`gates/census-run.mjs`, 430x932 mobile, CPU 1x, work counts per s; loads F, V, V2, F2, then V3,
F3; stops rest-0 / 1400 / 2796 / 3800 / end and the scroll top → end: mainFrames and rafFire per s).
- Rule per stop and metric (n = 3 an arm): **WORSE** when V's min > F's max AND median(V) − median(F) > max(F's range,
  10 % of median(F), 2 per s). Else no-worse. A **new rest loop** (a rest stop where every F load is ≤ 5 per s and every
  V load ≥ 15 per s) is WORSE by itself.
- Expected from the components' own data (OBSERVED): rafFire while scrolling 289 → ~187 per s (scroll-cb, −35 %);
  rest-0 ~40 per s in both (the countdown); no rest loop.

**1b. NF-C: the nav reveal band, v9.2 − nav-fade vs v9.2** (lead's rule for P-142: "a rise beyond the A/A spread there
is a nf no-land in the bisect, even if the Simulator R5 passed"). nav-fade's own probe `fixes/v9-2/nf/motion.mjs`
(copy of `fixes/nav-fade/probe/motion.mjs` d34355055470 @f4c2fa0d/31718fc9), `--passes counts --scen topIn,glideThru,end`,
430x775 DPR 3 mobile + touch, CPU 1x (its default; fix-nav-fade's numbers are CPU 1x, corrected in 31718fc9), three runs:
r1 Mnf, V, Mnf2 · r2 V, Mnf, V2 · r3 Mnf, V, Mnf2 (Mnf 5 loads, V 4). Read with `fixes/v9-2/nf/chromecount.mjs`
(59e033b57047); a load whose served JS/CSS is not its arm's (Mnf 35885634a455 / f1997edf5309, V 30f6371751f4 /
1c4161f56545) is VOID.
- Metrics: topIn style recalcs and topIn layouts (Performance.getMetrics RecalcStyleCount / LayoutCount deltas over the
  scene). glideThru and end: reported only, same rule printed.
- A/A spread s (per metric): the largest of (a) |Mnf − Mnf2| within r1 and within r3, (b) |V − V2| within r2, (c) the range
  of Mnf over its 5 loads. Floor (stated before data, from Chrome's discrete counting and fix-nav-fade's C repeats 176/176
  recalcs and 65/62 layouts): 10 recalcs, 5 layouts.
- **Pass line:** **NF-C FAIL** (= nav-fade no-land in the bisect, whatever the Simulator said) when, for topIn style
  recalcs OR topIn layouts, V's min > Mnf's max AND median(V) − median(Mnf) > max(s, floor). Else **NF-C PASS**. A metric
  where fewer than 3 valid loads an arm exist is insufficient; insufficient goes to the lead (one re-run of 1b allowed).
- What fix-nav-fade saw (n = 2, C vs nav-fade on v9-final, CPU 1x; UNRESOLVED): topIn recalcs 176 / 176 vs 181 / 250,
  layouts 65 / 62 vs 68 / 69. One run can jump by ~70 recalcs; this rule needs all V loads above all Mnf loads.

**1c. Simulator census** (`fixes/v9-2/sim92.mjs`, WebKit Timeline record counts, no timing; loads F1 V1, V2 F2, F3 V3,
one functional session each; idle stops rest-0 / 1400 / 2796 / 3800 / end (settle 3 s, 6 s window) and a scripted rAF
scrollBy 24 px top → end; RenderingFrame, RecalculateStyles, Layout, Paint, Composite, FireAnimationFrame).
- Rule (n = 3 an arm), per rest stop on RenderingFrame, Layout and RecalculateStyles counts, and on the scroll window's
  per-frame Layout and RecalculateStyles: the same WORSE rule as 1a (V min > F max AND median diff > max(F range, 10 %
  of median F, 2 counts)). New rest work (every F load ≤ 2 RenderingFrames in the window, every V load ≥ 10) is WORSE.
- Paint and Composite: reported only (nav-fade moves paint by design: topIn Paint 564-610 → 393-438, R1 CONFIRMED).

**Part 1 verdict:** WORSE if 1a or 1c is WORSE on any stop/metric; NF-C FAIL is its own line (nf no-land); else
no-worse (insufficient if any is). Part 1 WORSE or NF-C FAIL → bisect (below) before the phone; the phone block still
runs on the lead's word if the WORSE is attributed to one section and v9.2 − that section is re-ticketed.

### Part 2: one G phone block (after the lead's go; the iPhone reconnected)

The block reuses P-134's harness unchanged (itself P-132's / P-122's: P-121's path-matched G driver, nav-hit-cache's
flicker gate, the fling-distance parity rule, the time guard, the gates); the arms, folders and labels change, and one
part is added (H, the hero flip, nav-fade's windows; P-139's stand-in).

```
build/control: as above. B = plain baseline (the thermal gate's timer page).
copies and servers: out/p142/snap/{C,V} (read-only; `sh fixes/v9-2/phone/serve142.sh snap` copies C = F and V from
  out/v92/snap-30f6371751f4/{F,V} and refuses any other hash), fixes/v9-2/phone/serve142.sh (plain http, --port 0,
  --latency 150, --vendors=local); served-hash check before every item (case C:647c9ef2b1e2:e1359ab9994a|
  V:30f6371751f4:1c4161f56545; exit 4 on a wrong one). Step 1: `serve142.sh snap` (once), then `serve142.sh`.
profile: xcode-serious (Xcode Device Conditions Serious, induced; thermal-gate.mjs --accept-induced at the start and end
  of every hold; no pre-warm, no cooling wait; ceiling 44 C or Critical; gate exits 2/3/7 void the hold).
sentinels: sCo/sCc in every hold (S on C = v9-final, P-122's V arm: bottom >= 58 fps, scroll >= 44 fps); a failing
  sentinel voids every run since the last passing one (H runs included); the hold is re-run once with the same items.
checkout: int-v8's worktree; hold142.sh prints one PIN line per hold (ticket, profile, checkout, HEAD, sha256/12 of
  hold142.sh, score142.mjs, serve142.sh, nf-read.mjs f9631790c0aa, p122/score.mjs d1dddb910cd9, the P-122 gate scripts,
  the G programs and out/p142/snap/HASHES.txt) and one PROG line per G part (GESTURE_HASH/12 M 607b59612abb,
  X 21aaafd3a9fd, S 7312cdcd2574 as P-122; H 53a8e657fa28 = fixes/v8-best/phone/g/flick-hero-v1.json 6ae05e12ace9).
  The values of the registering commit are the pins; any other value voids that hold.
holds (each inside int-v8's exclusive no-timing chrome-measure hold, max 600 s; GESTURE_BUDGET_S 150 per G run; every G
  item with --inject flicker-inject.mjs; time guard: no G item starts after elapsed 420 s, else VOID "time", exit 7,
  re-run whole; at most 5 G runs a hold):
  part M  H1a sCo wgMC wgMV gMC1 gMV1 gMV2 sCc · H1b sCo gMC2 gMC3 gMV3 sCc · H1c sCo gMV4 gMC4 sCc
  part X  H2a sCo wgXC wgXV gXC1 gXV1 gXV2 sCc · H2b sCo gXC2 gXC3 gXV3 sCc · H2c sCo gXV4 gXC4 sCc
  part S  H3a sCo wgSC wgSV gSC1 gSV1 gSV2 sCc · H3b sCo gSC2 gSV3 gSC3 sCc · H3c sCo gSV4 sCc
  part H  H4a sCo wgHC wgHV gHC1 gHV1 gHV2 sCc · H4b sCo gHC2 gHC3 gHV3 sCc · H4c sCo gHV4 gHC4 sCc
  usage per hold (the I-168 wrapper with the block mark; between holds `lock.mjs doing iphone --owner int-v8 --between <min>`):
    TICKET=P-142 RUNNER=int-v8 node tools/lock.mjs run iphone --owner int-v8 --block P-142 --max-seconds 900 -- \
      node tools/lock.mjs run chrome-measure --owner int-v8 --no-timing --max-seconds 600 --doing "v9.2 P-142 <H>" \
      -- caffeinate -i -s sh fixes/v9-2/phone/hold142.sh <H> <items>
  then iphone.mjs park; int-v8 stops the servers after the last hold. No re-runs beyond the sentinel and time-guard
  rules: the spares are planned up front, not added after data.
spares: M C 3+1, V 3+1; X C 3+1, V 3+1; S C 3, V 2+2; H C 3+1, V 3+1.
scorer: fixes/v9-2/phone/score142.mjs. Parts M, X, S: P-122's scorer (d1dddb910cd9, refused if changed) unchanged, arms
  re-pinned (C = v9-final, V = v9.2): GM (> 50 WORSE d > +2, any NEW 250 px cluster; < 3 valid an arm insufficient),
  EX and ES (V ceiling: 0 frames > 50 ms in into1..end over all valid V runs; twins > 46 / > 54, threshold-sensitive when
  one differs; (46, 54] flagged; min valid V 3 for EX, 2 for ES), FLICKER (G1, V monotone blinks 0, per part M, X, S;
  G2/G3 report only), BEHAVIOUR parity (M's first page-up fling after mid1, X's first stroke after into1; median gap
  > 300 px AND >= 2 pairs > 300 px in the same direction; the clipped-end rule; fewer than 2 pairs insufficient).
  Part H (scored in score142.mjs; P-122's refuses H): a counted H run is VOID on no record, aborted, run errors, no or
  not-ok served check log, median moving dt > 25 ms, or no flipDown and flipUp window; FLICKER_H = the flicker gate on
  H's runs (not pooled: VOID on its own run count is insufficient).
  NF (nav-fade's windows; fixes/v9-2/phone/nf-read.mjs = fixes/nav-fade/phone/nf-read.mjs f9631790c0aa, refused if
  changed; defaults lvh 815, flip window 1600 ms after y crosses 0.72 of the hero track, end windows 1000 ms after the
  morph m crosses 0.2 in / 0 out): flipDown and flipUp from part H, endIn and endOut from part X; runs = counted runs
  with a record whose only voids are path-gate ones (C = v9-final has no rev 7d, so P-122's C rule voids C's caught X
  outs by design; the frames are still good). Per kind: sum per run; **WORSE** when V's min > C's max over >= 3 runs an
  arm on the > 50 ms count (twins > 46 / > 54: threshold-sensitive); > 34 ms reported; part S's end windows reported.
  NF WORSE → nf no-land in the bisect.
  Arm identity: G runs by the served-hash check log before each item (required ok, else VOID); S sentinels by the
  record's served map against arm C. Self-test: selftest142.mjs, SELFTEST-142 OK 44 (P-122's records through the
  wrapper reproduce P-122's gates; P-142's pins void P-122's v8 sentinels and equal build.mjs V9_EXPECT / V92_EXPECT;
  synthetic H records: clean → no-worse, slow flips → WORSE, the void rules, the sentinel chain, too few →
  insufficient; hold142 guards incl. part H and R refused; the four PROG pins = the compiled programs; serve142 pins).
  Descriptive, P-122's own X records through NF (C = v8, V = v9-final): endIn / endOut > 50 ms 0-0 in both, 2 end
  windows a run.
verdict: BEHAVIOUR FAIL (own line, leads) if the parity counts; frames: WORSE if any of GM, EX, ES, FLICKER, FLICKER_H,
  NF is WORSE or has a NEW cluster; else insufficient if any is; else no-worse.
F-260 (report only, every run): y90 = 0.9 docH - vh and when the run first reaches it.
minutes: ~95 (12 holds; gates included; no pre-warm; gaps between holds extra).
```

### Part 3: one blind swipe A/B (F, the user's finger; after part 2, inside int-v8's phone hold)

- Posted from inside int-v8's `lock.mjs run iphone` hold, only when no other phone step is open (memory
  "one-phone-step-at-a-time"; never during a timed block): `node tools/console.mjs post --by int-v8 --kind swipe-pair
  --url <A> --url2 <B> --meta '{"key":…}'`, A/B order by a coin flip recorded in the key (C = v9-final, V = v9.2; the
  same out/p142/snap servers, served hashes checked first). Instructions (plain): "Swipe through the whole page on A,
  then on B, as you normally would: top to the end and back. Which one follows your finger better?" Answers: A / B /
  same, plus notes.
- Then `console.mjs wait <id>` in the background per the protocol (ack loading / ready / recording, `--until redo` armed).
- **Rule:** pass when the user picks V or "same"; **fail** when the user picks C (v9-final). One pair only; a "can't
  tell" note counts as same. A fail goes to the lead with the user's notes; the bisect below picks the pair to show next.

### Land / no-land / INSUFFICIENT (stated before data)

- **LAND v9.2** (as the next ship build, replacing v9-final) when all hold: the build identity checks (done); every
  component gate above passes (pixel: nf T2 with the PR-010 numbers, pw vs Try-it B (a)-(c); g11 exactness; fix.mjs check;
  dom-count; the rest census); part 1 no-worse and NF-C PASS; part 2 no-worse with no BEHAVIOUR FAIL; part 3 pass.
- **NO-LAND** (bisect, below) when any of: a component gate fails; part 1 WORSE; NF-C FAIL (nf no-land); part 2 WORSE or
  BEHAVIOUR FAIL; part 3 fail. A no-land on one section ships v9.2 minus that section only after its own short ticket
  (the minus builds exist and are pinned: Mpw, Mnf; B = v9.1d).
- **INSUFFICIENT** (nothing WORSE, something insufficient): to the lead. Allowed without a new ticket: one re-run of a
  part 1 step that was insufficient (VOID loads), and the planned spares in part 2 only. Anything else is a new ticket
  line, not an added run. If only part 2 is insufficient and part 1 passed, the lead may land on the less-work rule with
  the swipe A/B as the finger check, or re-run the insufficient part as a new block (max 2 blocks per question).

### Bisect plan (section by section; every arm prebuilt in out/v92/snap-30f6371751f4, served-hash checked)

Sections: **B** v9.1d (itself rev 7d, scroll-cb, g11), **pw**, **nf** (rev 1.2: nhc OUT). Reversal arms: v9.2 − pw = Mpw,
− nf = Mnf, − all extras = B (v9.1d); C + one extra = Opw, Onf. v9.1d's own reversals (− scb 1b2eecc66011 /
f1997edf5309, − g11 941aa13e5bdf / e1359ab9994a) are in out/v91d.

1. **Counts first, no phone** (cheap, shared probes): for a part 1 WORSE, run the same step on V vs each of B, Mpw,
   Mnf (n = 3 each, same rule): the section whose removal brings V back inside F's range is the cause; two such
   sections → both named; none → the interaction, report as such (X vs C + each extra next).
2. **Map the phone gate to suspects** (order to test, by what each section touches):
   - NF or FLICKER_H (hero flip / end windows): nf (Mnf), then B.
   - EX / ES (page end): B (rev 7d's release, g11), then nf (the Join hide at the end).
   - GM (middle): B (scroll-cb), then pw (the people-word card).
   - FLICKER M/X/S: nf first (it touches the nav), then B.
   - BEHAVIOUR (parity): B (scroll-cb, rev 7d) only; pw and nf do not touch scrolling (OBSERVED by reading their
     deltas).
3. **Phone bisect:** one block per suspect, v9.2 vs v9.2 − suspect, only the failing gate's part (same harness, a new
   ticket line each, max 2 blocks per question, sequential rule); the first suspect whose removal clears the gate is the
   cause and gets the no-land.
4. **Swipe A/B fail:** one more pair, v9.2 vs v9.1d (B): if the user still picks the other side, the cause is in B
   (v9.1d's sections; next pair B vs v9-final + 7d); if not, the extras (next pair by the user's notes: hero → Mnf, page
   end → Mnf, middle cards → Mpw).

### Predictions (int-v8, before any P-142 data)

- Part 1a census: no-worse 0.85 (rafFire −35 % from scroll-cb), WORSE 0.05, insufficient 0.10.
- NF-C: PASS 0.65, FAIL 0.20 (fix-nav-fade's 181 / 250 vs 176 / 176 could be real), insufficient 0.15.
- Part 1c Simulator: no-worse 0.75, WORSE 0.10, insufficient 0.15.
- Part 2: BEHAVIOUR pass 0.75; GM no-worse 0.70; EX no-worse 0.65; ES no-worse 0.55 (insufficient 0.30); FLICKER G1 pass
  0.85 (rev 1.2: U2 is not in V); NF no-worse 0.70, insufficient 0.15; sentinels on v9-final pass first try 0.70.
  Overall part 2: no-worse 0.40, insufficient 0.35, WORSE or BEHAVIOUR FAIL 0.25.
- Part 3: V or same 0.65, C 0.35.
- Ticket overall: LAND 0.30, INSUFFICIENT 0.35, NO-LAND 0.35.

### Files (registered with this card)

`fixes/v9-2/part1.sh` (part 1 runner), `hostgate.sh` (its host clause), `pre/` (the pre-data gate runners), `sim92.mjs` (Simulator census), `geo92.mjs` (pre-data geometry), `nf/motion.mjs`
and `nf/chromecount.mjs` (nav-fade's probe and reader, copied unchanged), `phone/serve142.sh`, `phone/hold142.sh`,
`phone/score142.mjs`, `phone/selftest142.mjs`, `phone/nf-read.mjs` (nav-fade's phone reader, copied unchanged),
`phone/p122-final-args.txt` (the self-test's replay list), `patch.diff`. Build: `fixes/v9-best/build.mjs --target v92 --with pw,nf`.
