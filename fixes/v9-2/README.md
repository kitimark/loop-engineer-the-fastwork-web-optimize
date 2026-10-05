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

### Part 1 result (v9-final vs v9.2 = v9.1d; lead GO after the rev 1.3 delta PASS; ran 17:46:06-17:59:44Z)

**PART 1: INSUFFICIENT** (lead ruling (ii), after ops-reader-P142p1's read; "Rev 1.4" below): 1a no-worse, 1c rest
stops no-worse, **1c scroll INSUFFICIENT** (its window was truncated: not the registered item). As first written (04a229fc)
this section said "no-worse (0 WORSE lines)"; that was wrong for 1c scroll and is kept below, struck by this line.
NF-C not run (nf OUT, rev 1.3). Ran at head 53b0af35 (PIN line; part1.sh
cbe46b389e2f, HASHES f5f2db042aaf); 5 steps, each one try, every exit 0, no VOID-HOST (load1 at step starts 2.2-14.5).
Every load served its arm (F 647c9ef2b1e2 / e1359ab9994a, V 941aa13e5bdf / f1997edf5309); Simulator loads 6, VOID 0.
Read by `fixes/v9-2/part1read.mjs` (5e8591510912; the registered rules, N6 record selection), output
`out/v92/part1-read.txt`; records `out/v92/part1.log` (f594ed3e4601) and `out/v92/sim/p142.json` (06f1a0e71dcf).

| 1a Chrome census (per s, F / V, n = 3 each) | F | V | verdict |
|---|---|---|---|
| rest-0 mainFrames | 39, 39.5, 38.6 | 39.6, 38.5, 38.6 | no-worse |
| rest-1400 mainFrames | 41.6, 41.3, 42.1 | 41.6, 40.8, 41.3 | no-worse |
| rest-2796 mainFrames | 2.2 ×3 | 2.2 ×3 | no-worse |
| rest-3800 mainFrames / rafFire | 26.0-26.2 / 17.5-17.8 | 26.0-28.3 / 17.5-17.8 | no-worse |
| rest-end mainFrames / rafFire | 28-29.3 / 27-32.8 | 28-29 / 29-37 | no-worse (rafFire d −0.3, thr 5.8) |
| scroll top → end mainFrames | 110.7-111 | 110.7-111 | no-worse |
| scroll top → end rafFire | 288.8, 289.2, 289 | 186.8, 186.8, 187 | no-worse (−35 %, as expected from scroll-cb) |

No new rest loop. 1c Simulator census (WebKit Timeline counts, 6 s windows, F / V n = 3): every rest stop's
RenderingFrame, Layout and RecalculateStyles no-worse; [superseded: the scroll window's per-frame Layout / RecalculateStyles
"no-worse" came from a ~0.5 s top slice, see Rev 1.4] (largest
median diffs: rest-2796 RenderingFrames +22 vs threshold 20 and RecalculateStyles +23 vs 19, both with V's min 197 / 135
not above F's max 212 / 149, so no-worse by the rule; scroll per-frame +0.06 vs 0.26). Paint and Composite (report):
equal within a few counts at every stop. The scroll window's per-frame rule was read with the floor 0 (a 2-count floor on
a per-frame ratio is moot); with the floor 2 the verdict is the same.

### Rev 1.4: the 1c scroll window was truncated; "1c-scroll re-run" ticket line (lead ruling, before any of its data)

- **What went wrong (int-v8's bug, OBSERVED in the code and the records, CONFIRMED against tools/lib/wip.mjs's own note
  that WebKit ignores awaitPromise):** `sim92.mjs` line 71 did `const sc = await c.evaluate(SCROLL)` with SCROLL a page
  Promise; the inspector returned the unawaited Promise, so `frames` / `y` were never recorded and the Timeline stopped
  after the fixed 500 ms sleep. Every scroll window in both arms has RenderingFrame 31 (~744 px of 6075, the top ~12 %),
  and `part1.log` prints `frames undefined` for all six loads.
- **The sign I missed:** the pre-data sim92 smoke on arm C (`out/v92/looks-r12.log`, rev 1.2 gates) already printed
  `top->end RF31 ... frames undefined`; I read it as "works" and did not check the scroll window's frame count.
- **ops-reader-P142p1's reader finding:** `part1read.mjs` (5e8591510912, written after the data, as N6 allows) had no
  insufficient branch and no n = 3 check, so the card's "insufficient if any is" and the N6 precedence were absent and the
  truncated window went unflagged; and it read the per-frame scroll items with floor 0 where the card registers 2 counts.
- **Lead ruling (ii):** the ~12 % slice is not the registered item, so 1c scroll is INSUFFICIENT and part 1 is
  INSUFFICIENT until this line runs.

**The new ticket line, P-142 rev 1.4 "1c-scroll re-run"** (registered here before any of its data; runs after the lead's
delta check and go):
- **Fix (`sim92.mjs` 63137bdf4129):** the page stores the driver's result in `window.__p142sc`; Node polls it every 250 ms
  (timeout 30 s) and stops the Timeline as soon as it is set (the 500 ms tail is gone). `--scroll-only` skips the idle stops.
- **Hard check per load (`sim92check.mjs` 94bfa2e9bb52, used by sim92 and the reader):** full-window estimate, written now:
  docH 6850 at 430x775 → max scrollY 6075 → ceil(6075 / 24) = 254 scrollBy steps, 255 rAF callbacks, ~4.2 s at 60 Hz, at
  least one RenderingFrame per callback. A load passes only if `frames` and `y` are defined, `y ≥ max − 1`, `frames ≥
  floor(0.95 × steps)` (241) and RenderingFrames ≥ floor(0.8 × steps) (203), steps from the load's own max (from the
  estimate when max is missing), and no timeout. A failing load is VOID. Part 1's six windows fail it (frames, y and max
  undefined; RenderingFrames 31 < 203).
- **VOID re-runs:** one per VOID load (rep + 10), in a fourth session after the three; a second VOID leaves its arm short
  of 3 valid loads → INSUFFICIENT.
- **Reader (`part1read.mjs` 37ef9feb4e28):** an insufficient branch (fewer than 3 valid loads an arm on any item → that item
  INSUFFICIENT; part 1 = WORSE if any item is WORSE, else INSUFFICIENT if any is, else no-worse); a 1c scroll window counts
  only if it passes the check; `--scroll <records>` takes the 1c scroll item from the re-run's records, 1a and the 1c rest
  stops from part 1's. The no-worse rule is the card's, with the registered 2-count floor everywhere; on a per-frame ratio
  that floor means WORSE needs a rise of more than 2 per frame, so the floor-0 verdict is printed beside it as a report
  only (the lead may rule otherwise before the data). Re-read of part 1's own records with it: **PART1 INSUFFICIENT**
  (`out/v92/part1-read-r14.txt`; 1a and 1c rest stops no-worse, 1c scroll insufficient, F 0 / V 0 valid).
- **Scope and runner (`rerun14.sh` a4f4608f9d64):** the scroll window only, F vs V, n = 3, sessions F:1 V:1 · V:2 F:2 ·
  F:3 V:3 (~7 min), each its own shared simulator hold through `hostgate.sh` (N4 host clause unchanged); log
  `out/v92/part1-r14.log` (PIN line: HEAD and the five sha256/12), records `out/v92/sim/p142-scroll.json` (refuses if it
  exists); ends with the reader's line and R14DONE.
- **Self-test (`selftest142.mjs` d2ee1249f29d, SELFTEST-142 OK 51):** section 6: the part-1-shaped truncated window fails
  the check (frames undefined, RenderingFrames 31 < 203), a full window passes, short scroll / few frames / few
  RenderingFrames / timeout fail; the reader scores six truncated loads INSUFFICIENT, six equal full loads no-worse, V
  +2.45 per frame WORSE, two valid V loads INSUFFICIENT and a valid rep-12 re-run restores n = 3; 1a with one load an arm
  is insufficient.
- **The result line:** part 1 = 1a (no-worse) + 1c rest stops (no-worse) + the re-run's 1c scroll item, folded by the rule
  above. Phone part 2 does not depend on it.

**Rev 1.4a (lead rulings with the rev 1.4 delta check PASS on 3915ec27; before any rev 1.4 data; no code change):**
- **Floor 0 gates the per-frame scroll items** (1c top→end layouts/frame and styleRecalcs/frame): WORSE when V's min > F's
  max AND median(V) − median(F) > max(F's range, 10 % of median(F)). The registered 2-count floor is reported beside it
  only (on a per-frame ratio it cannot fail in practice). Stricter than the card, set before data. part1read.mjs already
  prints both: the floor-0 verdict is its "(report: floor 0 …)" field, which is now the gate; its floor-2 verdict and its
  PART1 fold line are the report. The result line folds by hand with the floor-0 verdicts.
- **Disclosure:** the fixed sim92 polls `window.__p142sc` with an inspector evaluate every 250 ms (4 Hz) while the
  Timeline records, in both arms alike; its cost on the counts is not measured (OBSERVED only: no check of ours
  isolates it).
- **Smoke (lead OK):** one fixed-sim92 run on arm C only (no ticket arm), one shared Simulator slot, records
  `out/v92/sim/smoke-r14.json` (never p142-scroll.json, never counted), log `out/v92/smoke-r14.log`. If the check fails on a
  real full window, stop (a floor problem to fix before data); if it passes, rerun14.sh runs as pinned.
- **Smoke result: FAIL, stopped (to the lead; rerun14.sh not started).** C served 1b2eecc66011 / e1359ab9994a; the
  driver's result never appeared within the 30 s timeout (frames, y, max undefined); the window held RenderingFrames 1804
  (~60 a second for 30 s), so the page was rendering and the scroll loop ran past the expected ~4.2 s. Not a floor
  problem: the driver did not finish. Hypothesis (UNRESOLVED, not checked): the driver's stop target `max` is computed once
  from `innerHeight` at the start; if Safari's toolbar collapses while scrolling, `innerHeight` grows, the reachable max
  scrollY drops below that target, `scrollY >= max - 1` never holds, and the loop runs to its 2000-frame cap (~33 s at
  60 Hz), past the 30 s poll timeout. The decisive check is a diagnostic run that logs scrollY, innerHeight and the live max at
  each poll.

**Rev 1.4b (lead ruling: the fix and the diagnostics in one re-pin, then a new uncounted smoke on C; before any counted
rev 1.4 data):**
- **Driver (`sim92.mjs` f21b2c8bca92):** re-reads the live max (scrollHeight − innerHeight) every frame and stops at it, or
  when scrollY has not moved for 10 frames (`stalled`), or at 2000 frames (`capped`); records startMax, endMax (= max) and
  innerHeight at start and end (ih0, ih1). Each 250 ms poll also logs scrollY, innerHeight and the live max into the
  window's `polls`.
- **Check (`sim92check.mjs` 72710fb51f81):** frames and y defined; frames ≥ 241 and RenderingFrames ≥ 203 from startMax
  (floor(0.95 / 0.8 × ceil(startMax / 24))); y ≥ live max − 1 at the end; endMax ≥ startMax − B; no timeout. **B is not
  set yet** (`BOUND_B = null`: every window fails "bound B not set", so nothing can count until it is pinned). B will be
  the smoke's measured innerHeight change (ih1 − ih0), rounded up to the next 10 px, written here with its basis and pinned
  before the counted run (a re-pin, to the lead's delta check). If the smoke shows no toolbar change, the hypothesis is
  refuted: stop, to the lead, before any counted run.
- **Reader (`part1read.mjs` c18e5825d812):** passes the bound through (default the pinned B); otherwise as rev 1.4 / 1.4a.
- **Self-test (`selftest142.mjs` 6b2602cc8f99, SELFTEST-142 OK 55):** adds a toolbar-collapse window (innerHeight 775 →
  815, live max 6075 → 6035, reached; passes with a test B of 50), a stall mid-page (y 3000, stalled; VOID), a drop of 100
  px > B (fails), and B unset → every window fails.
- **rerun14.sh unchanged** (a4f4608f9d64; its PIN line records the new sim92 / sim92check / part1read hashes).
- **Smoke r14b on arm C (uncounted, `out/v92/sim/smoke-r14b.json`, log `out/v92/smoke-r14b.log`): toolbar hypothesis
  REFUTED, stopped (to the lead; no counted run, B not set).** ih0 775, ih1 775 (no innerHeight change), startMax 6075,
  endMax 6075, stop reason `stalled` (scrollY 0 for 10 frames), frames 11, RenderingFrames 13; the one poll (252 ms) saw
  scrollY 4. The driver's `scrollBy(0, 24)` does not move the page by 24 px a frame: the page CSS has `html {
  scroll-behavior: smooth; }` (2.gBuqKVzi.css, pretty line 11739; `auto` only under prefers-reduced-motion), and a
  programmatic scroll without an explicit behavior follows the element's scroll-behavior (CSSOM View, scroll-behavior
  property: https://drafts.csswg.org/cssom-view/#propdef-scroll-behavior; CONFIRMED for the rule, its effect here
  OBSERVED). Each frame's call restarts a smooth scroll, so scrollY barely moves. That also explains the first smoke (2000
  frames without reaching the bottom). Proposed fix (for the lead): `scrollBy({ top: 24, behavior: 'instant' })`, with the
  rest of rev 1.4b unchanged, then a new smoke on C after the delta check.

**Rev 1.4c (lead ruling: the one-line fix; before any counted rev 1.4 data):**
- **Driver (`sim92.mjs` ce506d1e403e):** the step is `scrollBy({ top: 24, behavior: 'instant' })`. Why: the page's own
  `html { scroll-behavior: smooth; }` makes a programmatic scroll without an explicit behavior smooth (CSSOM View,
  CONFIRMED: https://drafts.csswg.org/cssom-view/#propdef-scroll-behavior); its effect on this page in the Simulator
  (scrollY stuck near 0, r14b smoke) is OBSERVED. A finger scroll is not governed by scroll-behavior, so the instant 24 px
  step per frame is the registered intent (a steady scroll top → end). Everything else in rev 1.4b is unchanged.
- **Self-test (`selftest142.mjs` 13d509f53402, SELFTEST-142 OK 57):** adds the r14b shape (scrollY never past 4 px,
  stalled, 11 frames) → VOID, and checks that sim92's step is an instant scrollBy.
- **B (lead's rule, before the smoke):** if the new smoke shows ih0 = ih1, B = 10 (measured change 0, rounded up to the
  next 10 px); if it shows a real change, that change rounded up. Pinned in a follow-up one-constant re-pin.
- **Order:** this re-pin → the lead's delta check → a new uncounted smoke on C → its lines and B to the lead → the B re-pin
  → the lead's check → GO for rerun14.sh.

**Smoke r14c and rev 1.4d (the B re-pin; before any counted rev 1.4 data):**
- **Smoke r14c on arm C** (lead GO after the 0a4a65ce delta PASS; uncounted, `out/v92/sim/smoke-r14c.json`, log
  `out/v92/smoke-r14c.log`): served 1b2eecc66011 / e1359ab9994a; ih0 775, ih1 775; startMax 6075, endMax 6075; stop reason
  reached the live max (not stalled, not capped); final y 6075; frames 263 (floor 241); RenderingFrames 270 (floor 203);
  33 polls over ~8.8 s, scrollY rising steadily from 120 to 6075 with innerHeight 775 throughout. The only failed clause
  was "bound B not set". The toolbar hypothesis stays refuted (no innerHeight change on this programmatic scroll).
- **B = 10 px** (`sim92check.mjs` de54a6c03bf9, `BOUND_B = 10`): the measured innerHeight change 0, rounded up to the next
  10 px (lead's rule). With it the smoke's window passes the check.
- **Self-test** (`selftest142.mjs` 503ac47ad791, SELFTEST-142 OK 61): adds pinned B = 10; the r14c smoke-shaped window
  passes with it; a 40 px live-max drop fails with it; B null fails every window.
- sim92 (ce506d1e403e), part1read (c18e5825d812) and rerun14.sh (a4f4608f9d64) unchanged. Then the lead's check, then
  GO for rerun14.sh.
- **Disclosed (OBSERVED, in our setup, cause unknown):** the smoke's scroll took ~8.8 s, not the estimated ~4.2 s
  (Simulator rendering slower than 60 Hz while scrolling), and the driver took 263 rAF callbacks for 254 steps (a few
  frames did not advance scrollY). Both stay inside the floors; neither changes the check.

### Rev 1.4 result: the 1c scroll re-run, and part 1 (lead check of c263104b PASS, GO; ran 18:37:25-18:39:36Z)

**1c scroll: no-worse (floor-0 gate; floor 2 no-worse beside it). PART 1 (with rev 1.4): no-worse**: 1a no-worse,
1c rest stops no-worse (part 1's records, 53b0af35), 1c scroll no-worse (this line's records). PIN head c263104b
(rerun14.sh a4f4608f9d64, sim92 ce506d1e403e, sim92check de54a6c03bf9, part1read c18e5825d812, hostgate d800dd5a5ad2,
HASHES f5f2db042aaf). Three sessions, each one try, exit 0, no VOID-HOST (load1 at step starts 2.4-7.3); 6 loads, every
check ok, VOID 0, no re-runs. Log `out/v92/part1-r14.log` (165c40303735), records `out/v92/sim/p142-scroll.json`
(03883bd68013); the reader's lines are at the log's end.

| load | served | frames | y / max | ih | RF | layouts/frame | styleRecalcs/frame | check |
|---|---|---|---|---|---|---|---|---|
| F1 | 647c9ef2b1e2 / e1359ab9994a | 266 | 6075 / 6075 | 775 → 775 | 271 | 3.129 | 1.542 | ok |
| V1 | 941aa13e5bdf / f1997edf5309 | 265 | 6075 / 6075 | 775 → 775 | 269 | 2.952 | 1.532 | ok |
| V2 | 941aa13e5bdf / f1997edf5309 | 264 | 6075 / 6075 | 775 → 775 | 271 | 2.937 | 1.509 | ok |
| F2 | 647c9ef2b1e2 / e1359ab9994a | 266 | 6075 / 6075 | 775 → 775 | 270 | 3.100 | 1.515 | ok |
| F3 | 647c9ef2b1e2 / e1359ab9994a | 264 | 6075 / 6075 | 775 → 775 | 268 | 3.175 | 1.530 | ok |
| V3 | 941aa13e5bdf / f1997edf5309 | 266 | 6075 / 6075 | 775 → 775 | 275 | 2.964 | 1.502 | ok |

- **layouts/frame:** F 3.100-3.175, V 2.937-2.964: V's min is not above F's max (V is lower: median −0.177, about −6 %)
  → no-worse at floor 0 (the gate) and at floor 2 (report).
- **styleRecalcs/frame:** F 1.515-1.542, V 1.502-1.532 (median −0.021) → no-worse at floor 0 and at floor 2.
- Paint per frame (report): F 7.73-7.80, V 7.62-7.76.

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

### Part 2 run notes (lead rulings and events during the block; for the result read)

- **Start (lead GO 20:56Z, after the iPhone reconnect).** Rebased on main 9800e2d1 (nothing in scope); selftest142
  OK 61; `serve142.sh snap` copied out/p142/snap (HASHES as pinned); servers B / C / V served-hash ok. Heat method:
  **Xcode's Device Conditions** (Thermal State Serious, induced), as the card names; `thermal.mjs` was NOT used (the
  lead's I-199 ruling: a switch to it needs the user's OK; the lead retracted an instruction to use it, 21:0xZ).
- **Pause (21:00Z, lead: the user asked for the phone, PR-026 / T-202).** The first H1a attempt was stopped after its
  WDA check, before its start gate and any item: no run file, uncounted.
- **First H1a attempt after the user (21:04-21:08Z): VOID, I-212.** Start gate PASS (Serious, induced Yes, 36.6 C);
  sCo and sCc ran; every G item aborted at its first stroke (WDA HTTP 500 `point.x != INFINITY`; the WDA session was
  stale after the USB reconnect, OBSERVED, lead). The lead restarted WDA (21:09Z) and resolved I-212 (workaround).
  Lead: rerun H1a whole (a rerun of a VOID hold, not an added run) after one uncounted 1-stroke WDA smoke inside the
  hold. Smoke 21:10-21:11Z on B: 1 stroke, not aborted, 20 moving frames (`out/p142/runs/p142-wda-smoke.json`).
  The rerun's hold142 moved the VOID attempt's run files aside (`*.json.prev-H1a-*`); they are not scored.
- **Holds:** H1a VALID 425 s (21:11-21:19Z), H1b VALID 321 s, H1c VALID 272 s (battery 36.6 -> 41.1 C over part M).
- **Lead ruling mid-block (21:3xZ, during H2a; no counted data changed by it), the heat ceiling:** the memory rule
  phone-checks-start-warm keeps "cool before the next hold" at the ceiling under both profiles; xcode-serious's "no
  cooling wait" means no pre-warm and no wait for a target state, not ignoring the ceiling.
  1. Before a hold, battery >= 43.0 C: `wait.mjs phone-temp --below 42` (<= 600 s) first. A pause only: arms inside a
     hold stay balanced, nothing counted changes.
  2. A ceiling VOID (thermal gate exit 3, at a hold's start or end): cool with `wait.mjs phone-temp --below auto`
     (<= 10 min), then rerun that hold whole, once (a rerun of a VOID hold, not an added run). A second ceiling VOID on
     the same hold stops the block: part 2 is reported as it stands.
  3. The phone hold is kept through the waits (each wait runs inside `lock.mjs run iphone --keep 120`).
  Every check and wait is logged in out/p142/chain.log (`PRE`, `COOLWAIT` lines). The runner's chain switched to a
  version with these rules at the H2a / H2b boundary (H2a ran under the first chain, which had no pre-hold check;
  H2a started at 41.1 C, below 43).
- **Outcome of the ruling:** no pre-hold read reached 43.0 C (H2b 42.29, H2c 41.5, H3a 41.89, H3b 42.59, H3c 42.89 C),
  so no cooling wait ran; no gate exited 3, so no ceiling rerun.

### Part 2 result (ran 21:11-22:11Z; scorer as registered; the result read is ops-reader-P142r's)

- **Block:** H1a VALID 425 s, H1b 321 s, H1c 272 s, H2a 418 s, H2b 311 s, H2c 270 s, H3a 390 s, H3b 302 s, H3c 213 s.
  All 18 sentinels (sCo / sCc) pass; every start and end gate PASS (Serious, induced Yes); battery 36.6-42.9 C (ceiling
  44, never reached); PMSET OK in every hold; profile xcode-serious via Xcode's Device Conditions (no thermal.mjs).
- **Scorer:** `node fixes/v9-2/phone/score142.mjs $(cat out/p142/score-args.txt) --json out/p142/score142.json`
  (score142 8960b2d9a721 wrapping p122/score.mjs d1dddb910cd9; 47 items in block order; out/p142/score142.txt).

| gate | runs valid (C / V) | result |
|---|---|---|
| GM (part M) | 3 / 1 | insufficient (need 3 an arm); path VOID: gMC1 (4 traversals of [2200,3800] < 5), gMV2 / gMV3 / gMV4 (1 traversal) |
| EX (part X, V ceiling) | V 4 | **WORSE**: 3 frames > 50 ms (twins > 46: 6, > 54: 3; not threshold-sensitive); near band 50, 48, 49 |
| ES (part S, V ceiling) | V 3 | **WORSE (threshold-sensitive)**: 1 frame > 50 ms (52 ms; > 46: 1, > 54: 0); gSV2 path VOID (out stroke too fast) |
| FLICKER (G1 per part) | C 11 / V 12 | **WORSE** on part X only: V monotone nav blinks 6 (gXV1 2, gXV2 1, gXV3 1, gXV4 2), C 0 (all 4 C X files valid for the flicker gate, which reads G runs whatever their path gate said); flicker-gate FAIL; M and S no-worse |
| BEHAVIOUR parity | | pass: M first page-up fling gap 17.5 px; X first stroke after into1 gap 2.5 px; S reported only |

**VERDICT WORSE (threshold-sensitive)** (scorer line). By the card's land rules, part 2 WORSE means NO-LAND (bisect);
the bisect waits for the lead's ruling after the result read.

**Path observation (OBSERVED in our setup, descriptive only; for the reader to judge against the card's own VOID / path
rules):** C = v9-final's part X out-flings leave the end by 840-953 px (caught at the end; all four C X runs path-VOID,
which the card expected: "C = v9-final has no rev 7d, so P-122's C rule voids C's caught X outs by design"), while
V = v9.2's leave it by 4353-4589 px, back up the page through the nav-flip zone (median nav flips per run C 3, V 13).
EX is a V-only ceiling and FLICKER X compares V's runs with C's four runs on a different path (V about 590 moving frames
a run, C about 140). Erratum (ops-reader-P142p2 N1): the first version of this section said "one valid C file, gXC4";
the gate read all four C X files. In part M, 3 of 4 V runs
crossed the [2200,3800] band once (C runs 3-5 times).

**Result read (ops-reader-P142p2, 22:2xZ): CONFIRMED with N1-N5; lead: v9.2 NO-LAND, v9-final stays the best build.**
- N2 (the path caveat, OBSERVED, does not change the verdict): the card does not make EX or FLICKER X insufficient
  through C's path-VOIDs (EX / ES are a V-only ceiling; the flicker input ignores path gates; the card's NF line already
  expected C's caught outs to be path-VOID). Located by the reader: 4 of V's 6 X blinks are at y 1890-3129 on into2,
  after V's long out-fling; V has about 590 moving frames a run, C about 140; one EX frame (gXV2, 57 ms at y 3588) is in
  into1, which both arms share.
- N3: the block's "(threshold-sensitive)" tag comes from ES alone (its 52 ms frame); EX and FLICKER are WORSE under
  both twins.
- N4: the H1a rerun and the mid-block heat ruling are recorded here as the runner's statements of the lead's rulings;
  neither changed counted data. N5: chain.log's AFTER line that repeats the VOID "PASS (same)" now has a CORRECTION
  line beside it (out/p142/chain.log, 22:31Z).
- Predictions: EX, ES and FLICKER no-worse were three misses on one model; the bisect card carries the model review.

### Part 3 result: SKIPPED (console step C-070; 22:11-22:14Z; no preference given, not "same")

- Posted from inside int-v8's phone hold after the block (block mark ended; served hashes ok; profile read Serious,
  induced, 41.4 C). Blind order by `crypto.randomInt`, kept in the step's meta only: page 1 = V, page 2 = C.
- The user swiped part 1 (22:12:06-22:12:28Z) and part 2 (22:13:02-22:13:34Z), then pressed **Start over** (22:13:43Z),
  then **skipped** the step (22:14:27Z). No pick was given: **part 3 is SKIPPED** (no preference; not "same", so neither
  pass nor fail by the card's rule). The user's note in thread T-206, paraphrased by the lead: they were watching the end
  of the morph and could not tell which page was better.
- Runner error, disclosed: the runner's script read the answer wait's exit 5 (REDO, the Start over) as an empty answer
  and logged "SWIPE RESULT C-070 ... PASS (same)" at 22:13:43Z. That line is VOID (a CORRECTION line follows it in
  out/p142/swipe.log); nothing was reported from it. The resume attempt (attempt 2) found the step skipped.
- Recordings of the first attempt (supporting only, never a verdict): out/p142/runs/p142-swipe-C-070-p{1,2}-a1.json.
- Safari parked (22:15Z) and the phone released after it. Whether to re-ask the pair is the lead's call.

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

## P-151: the P-142 bisect, which v9.1d section makes parts X / S WORSE (card; registered before any P-151 data)

Lead ruling after the P-142 read (22:3xZ): v9.2 NO-LAND; bisect, card first; suspects inside B = v9.1d: **rev 7d,
scroll-cb (scb), g11**; one phone block per suspect, failing parts only (X, plus S for ES), at most 2 blocks per question,
xcode-serious, the prebuilt reversal builds; pre-data read before any phone time; phone slot after P-147, before P-150.
P-id P-151 (reserved by mgmt-clerk-1, e3fde535).

### Why the prediction model missed (P-142 part 2: EX, ES, FLICKER no-worse were three misses on one model)

- **What the predictions assumed.** EX no-worse 0.65, ES no-worse 0.55, FLICKER G1 pass 0.85 were set from P-122 (C = v8,
  V = v9-final: EX / ES / FLICKER clean) and P-134's design, as if v9.2's three sections only took work away or were
  neutral at the page end: scb cuts rAF callbacks while scrolling (−35 %, part 1a), g11 only hides the closed panel's
  children while it is transparent (exactness 0 violations), rev 7d changes only the close fling's lift-off. FLICKER was
  set high because the two nav-touching fixes (U2, nf) were OUT, i.e. the model took "no nav code changed" for "no new
  nav flicker".
- **What it missed.** (1) The comparison's path. P-134 had chosen C = v9-final + 7d so that both arms released the X
  out-fling the same way; P-142's control is v9-final as landed, without 7d. Its out-flings are caught at the end
  (840-953 px), V's leave it and travel 4353-4589 px back up the page (P-142 N2). The V-only ceilings (EX, ES) and G1
  therefore read about four times more moving page in V (about 590 moving frames a run against 140), through the middle
  and the nav-flip band that P-122's V never crossed in part X. The P-134 card even noted that 7d releases fast X
  flings; the priors were not moved for it. (2) Where the frames are (descriptive, P-142 records; the scorer's windows
  decide): two of EX's three > 50 ms frames are right after out2 at y ≈ 5746, the out stroke that closes the menu at
  the page end (gXV1 55 ms, gXV4 56 ms); the third is in into1 at y 3588 (gXV2 57 ms), a stretch both arms share; ES's
  one frame is at the page end in into1 (gSV3 52 ms, y ≈ 6114). 4 of the 6 V blinks are on into2 at y 1890-3129, after
  V's long out-fling. So the model's "page end is cheaper" held for S's catch but not for the close moment, and its
  flicker prior ignored that scb moves the scroll callback the nav state is updated from (not checked by reading before
  the card; the bisect asks it).
- **For the next model.** A gate that is a V-only ceiling needs equal path exposure in both arms, or a prior that scales
  with the V path; a section that changes when scroll callbacks run is a nav-flicker suspect even when no nav code
  changes.

### The bisect (P-151)

```
TICKET P-151 v9-2-bisect · which v9.1d section carries P-142's part 2 WORSE (EX, ES, FLICKER X) · runner int-v8 · verdict
  owner int-v8 · registered before any P-151 data; no phone time before the pre-data read and the lead's sign
profile: xcode-serious (Xcode Device Conditions Serious, induced; thermal-gate --accept-induced at every hold's start and
  end; no pre-warm; ceiling 44 C / Critical; the lead's P-142 mid-block heat ruling applies as written there: >= 43.0 C
  before a hold -> phone-temp --below 42 first, a ceiling VOID -> cool --below auto, rerun that hold once)
builds (all prebuilt, immutable copies, served-hash checked before every item):
  V    v9.2 = v9.1d            941aa13e5bdf / f1997edf5309   out/v91d/att/V (= out/p142/snap/V)
  S    v9.2 - scroll-cb        1b2eecc66011 / f1997edf5309   out/v91d/att/S
  G    v9.2 - g11              941aa13e5bdf / e1359ab9994a   out/v91d/att/G
  C7   v9.2 - scb - g11 = v9-final + rev 7d   1b2eecc66011 / e1359ab9994a   out/v91d/att/C
  F    v9-final as landed (no 7d)   647c9ef2b1e2 / e1359ab9994a   out/p142/snap/C
  (out/v91d/att/HASHES.txt deb1e8bdb8ca; out/p142/snap/HASHES.txt as pinned in P-142.) No new build.
blocks, in this order (one question each; the next starts only if the one before did not name the cause):
  Q1 scroll-cb:  control S (V - scb), test V.  Parts X and S.
  Q2 g11:        control G (V - g11), test V.  Parts X and S.
  Q3 rev 7d:     control F (v9-final), test C7 (v9-final + 7d alone).  Parts X and S.
  Q1 and Q2 compare like with like: both arms carry 7d, so both release the X out-fling and travel the same path.
  Q3 cannot: 7d IS the path change (a user-accepted motion, PR-023 rev 5); it asks whether 7d alone, on v9-final,
  already fails the V-only ceilings and G1, i.e. whether the P-142 WORSE comes with the path 7d opens.
order, why (pointers from P-142, descriptive):
  - FLICKER X (V 6 / C 0, twins agree, the firmest WORSE): blinks on into2 in the mid-page / nav band after the long
    out-fling -> scb first (it changes when the scroll callbacks that drive the nav state run), 7d (exposure) last.
  - EX (3 frames): two at the out stroke that closes the menu at the page end -> scb (work per scroll frame during the
    fling) and g11 (the close-peak hide of the panel's children); one in into1 (shared stretch) -> scb.
  - ES (1 frame, 52 ms, threshold-sensitive) at the page end -> g11, scb.
  scb is pointed at by all three gates, g11 by two (EX, ES), 7d by the exposure only: Q1, Q2, Q3.
holds per block (P-142's part X and S holds, unchanged items; arm C = the block's control, arm V = its test):
  X  Ha sCo wgXC wgXV gXC1 gXV1 gXV2 sCc · Hb sCo gXC2 gXC3 gXV3 sCc · Hc sCo gXV4 gXC4 sCc
  S  Hd sCo wgSC wgSV gSC1 gSV1 gSV2 sCc · He sCo gSC2 gSV3 gSC3 sCc · Hf sCo gSV4 sCc
  sentinels sCo / sCc on the block's control (bottom >= 58, scroll >= 44); G items with P-122's flicker logger; the
  time guard, gates, served-hash check and PIN / PROG lines as hold142.sh; ~40 min a block (P-142's X + S holds took
  32 min plus gates); Safari parked after every block; no H, no M part.
kit (committed before the read, as copies of P-142's with the arms, folders and labels changed only): phone/serve151.sh
  (copies out/v91d/att/{C,G,S,V} and out/p142/snap/C into out/p151/snap, refuses another hash), phone/hold151.sh
  (TICKET=P-151, block arg Q1|Q2|Q3 picks the arm pair), phone/score151.mjs (P-122's scorer unchanged, d1dddb910cd9,
  with the block's arm pins), phone/selftest151.mjs.
gates and reading, per block (the scorer as P-142's, applied to the block's two arms):
  EX, ES   V ceiling as P-142 (0 frames > 50 ms over the valid test runs; twins > 46 / > 54), reported for BOTH arms
           (the control's runs are scored with the same window as the test's; in Q1 / Q2 both arms share the path).
  FLICKER  G1 per part (test monotone blinks 0), G2 / G3 report only; the control's blinks reported.
  parity   as P-142 (BEHAVIOUR FAIL leads).
  reproduced: the test arm fails the same gate(s) again in the block (else "not reproduced": report, no cause named;
           a second block of that question only on the lead's ruling, max 2).
  cleared by removal: the test fails a gate AND the control passes it, with >= 3 valid control runs in X (2 in S).
  -> CAUSE <section> for that gate (Q1 / Q2); Q3: "7d alone fails the gate" (the exposure / 7d) or "7d alone passes"
     (then the WORSE needs scb or g11 together with 7d: INTERACTION, reported as such).
  both arms fail: the suspect is not the cause alone -> next question. Insufficient (too few valid runs an arm): the
  planned second block of that question, or the lead.
outcome: the first question that clears a gate names its cause; every gate is followed to a cause or to INTERACTION /
  INSUFFICIENT. The cause section goes to its owner (scb fix-scroll-cb, g11 fix-morph-gpu, 7d fix-morph-scroll) and the
  lead decides (v9.2 minus it under its own short ticket, as P-142's land rules say).
predictions (int-v8, before any P-151 data; after the model review above):
  Q1: FLICKER X cleared by removing scb 0.45, not reproduced 0.15, both fail 0.40; EX cleared 0.35, both fail 0.45,
      not reproduced 0.20; ES reproduced at all 0.40 (threshold-sensitive, one frame).
  Q2 (if run): EX cleared by removing g11 0.25; FLICKER unchanged by g11 0.85.
  Q3 (if run): C7 fails G1 0.55, fails EX 0.50 (the exposure reading).
  Overall: scb named for FLICKER 0.45; INTERACTION or 7d-exposure for EX 0.45.
```

### P-151 kit (committed with the card, before any P-151 data)

| file | sha256/12 | what |
|---|---|---|
| fixes/v9-2/phone/serve151.sh | 47f3ef2b1f6b | per-block servers B / C / V from out/p151/snap/<Q>; `snap`, `<Q>`, `check <Q>`, `stop`; served-hash case per block |
| fixes/v9-2/phone/hold151.sh | 62ba7a43cdcf | hold142.sh with TICKET=P-151, a block argument (Q1/Q2/Q3; refuses when the running servers are another block), labels p151-<Q>-, parts X and S only (M / H / R refused), PIN line with the block's HASHES |
| fixes/v9-2/phone/score151.mjs | a7f0fa9be9c5 | score142.mjs (8960b2d9a721, refused if changed) with the block's arm pins plus the per-gate bisect reading (EX, ES, FLICKER X, FLICKER S; control pass rules as in the card) |
| fixes/v9-2/phone/selftest151.mjs | 4dc0eca6054d | SELFTEST-151 OK 32: pins = the copies' HASHES; the reading rules; M / H / R refused; P-142's X + S replayed through --block P142 give P-142's gates; hold151 / serve151 guards |

Snapshot `out/p151/snap` (made by `serve151.sh snap`, read-only): Q1 HASHES 79b821ac0e5e (C = v9.2 − scb, V = v9.2),
Q2 471153d3d360 (C = v9.2 − g11, V = v9.2), Q3 714adbd82d33 (C = v9-final, V = v9-final + 7d); every file equals the card's
pins. The replay through score151 on P-142's records (descriptive, it gates nothing here): EX control insufficient
(v9-final's X outs are caught: path-VOID), ES and FLICKER X "cleared" against v9-final, FLICKER S not reproduced; i.e.
the reading rules behave as written on known data.
Runner per block: `sh fixes/v9-2/phone/serve151.sh <Q>`, then the six holds Ha-Hf as in the card, each
`TICKET=P-151 RUNNER=int-v8 node tools/lock.mjs run iphone --owner int-v8 --block P-151 --max-seconds 900 --keep 120 --
node tools/lock.mjs run chrome-measure --owner int-v8 --no-timing --max-seconds 600 --doing "P-151 <Q> <H>" -- caffeinate
-i -s sh fixes/v9-2/phone/hold151.sh <Q> <H> <items>`, the P-142 heat ruling between holds, Safari parked at the block
end; scoring `node fixes/v9-2/phone/score151.mjs --block <Q> <item>:<file> ... --json out/p151/score-<Q>.json` over the
block's VALID holds in block order.
