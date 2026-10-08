# Fix: g0-box (gpu-original M3-B: the nav box as a clip over a card laid out once)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** PR-038 **accepted by the user (03:04Z, 2026-10-08)**; rebuilt on the new best build as **g0.0f = g0.0e +
v3-W** (`fixes/v3w-g00e/patch.diff`, CSS 1d1e5d62a2c4, JS 30fd80ccbb3f). Its gates against g0.0e reproduce PR-038
exactly ("On g0.0e" below). The phone kit is re-snapped to C = g0.0e, V = g0.0f, dry-run, not run (waits for the
lead's card and the I-244 WDA check). The rest of this summary is the PR-038 state on g0.0c.

**PR-038 summary:** measured; **a T3 look-alike proposal** (lead's decision after 043143d2). It is not a T2 fix.
- v3-W = v3 in WebKit only. Chrome is T0 against g0.0c by construction, checked with a 148-stop seek.
- WebKit misses T2 only on the nav's outline anti-aliasing, mid-motion: up to **218 levels** against T2's edge limit
  of 128, at 6 of 144 stops. Fills are within T2 (flat max 31 ≤ 64). Rests are identical.
- **Gain (Simulator, 2 sessions; "Gain" below):**
  - about **11 MB less layer memory while the menu is open** (open minus closed: 16-18 MB → 5-7 MB);
  - redraw area per open 5-16 % lower, per close mixed (+10 % / -6 %);
  - after a close and during a top-of-page scroll, 0 bar repaints (86 and 65 today).
  - Not timed, not on the phone.
- Reduce Motion: v3-W steps aside, and the page is T0 against g0.0c (24 stops, 0 consistent px).
- The earlier "Simulator within T2, max 117" (e3857c4f) came from a 10-step seek (20 stops). **I withdraw it.** The
  same 20 stops re-scored give the same numbers; the denser seek finds the worse stops in between.
- It stacks with fix-join-fade's block and fix-logo-close's delta in either order (dry runs).
- Try-it build: `fixes/v3w-g00c/patch.diff` (baseline-relative, B); A = `fixes/platform-corners-g00b/patch.diff`.
  The build to land is `fixes/v3w-g00e/patch.diff` (g0.0f).

**Stage:** F (build), step M3-B of `research/gpu-original/README.md`, on g0.0c (the best build since PR-035).

**Base:** g0.0c = g0.0b + `fixes/platform-corners-g00b/patch.diff` (main fbf96d8c, BEST_BUILDS e1291f8d), built in
`out/g0box/g00c`: JS 5c39f7a96e41, CSS c65da97ba01f. Baseline snapshot b1789284481295-4ad4a84a.

**patch.diff = v3-W**, now relative to **g0.0e** (`a/` = g0.0e's files, `out/g0box/g00e`: JS 5c39f7a96e41, CSS
d4e684032482), made with `diff -u`; it applies cleanly to a fresh g0.0e copy and rebuilds g0.0f byte for byte. The
change itself is the same as on g0.0c (the same 103-line diff, other line numbers; the PR-038 version relative to g0.0c
is in 8b56a6a1). Final v3-W: JS 30fd80ccbb3f, CSS f9b2f894dedf (the reduced-motion step-aside). JS 30fd80ccbb3f differs from the measured 7f7d83162ef6 only in a comment (the stale "WebKit stays within T2" now reads T3, PR-038); every run in this README used 7f7d83162ef6. Earlier CSS:
2c9deee5b885 (the dark fill's RM transition, superseded) and 70df8114a809 (before any RM fix).
- v3 (both engines) relative to g0.0 is in this branch's history (e3857c4f); v2 is in 7da9b47e.

**Files touched (v3-W):**
- `/_app/immutable/nodes/2.DyWL8TcE.js`: the nav component near `__mkW` (pretty lines 14586-14606), +19 lines.
  When `'GestureEvent' in window` (WebKit only; MDN browser-compat-data `api/GestureEvent.json`; the same test as
  heCss and K6), it adds `html.fw-bx`, creates the two fills, and adds the dark fill to `__mkW`'s `--morph` targets.
- `/_app/immutable/assets/2.gBuqKVzi.css`: one block after line 12331, before the platform-corners rule, all under
  `html.fw-bx` and `(width<=640px)`.
- Elsewhere (Chrome, Firefox, widths over 640 px) nothing is created and no rule applies.

## On g0.0e: g0.0f = g0.0e + v3-W (after PR-038's acceptance)

**Build.** g0.0e = baseline + `fixes/g0-0e/patch.diff` (main 8bc50d29: g0.0c + join-fade PR-036 + logo-close PR-037),
rebuilt here as `out/g0box/g00e` (CSS d4e684032482, JS 5c39f7a96e41, the pinned values). g0.0e and g0.0c share the
JS, so v3-W's JS is the same file (30fd80ccbb3f). Its CSS block applies to g0.0e with no offset or fuzz (join-fade's
block is appended at the file end; logo-close changes one declaration above v3-W's block): g0.0f CSS 1d1e5d62a2c4.
`fixes/v3w-g00e/patch.diff` (baseline-relative, CSS then JS) rebuilds the same two files from a fresh baseline copy.
The overlay now holds g0.0f's files.

**Gates, g0.0f (V) against g0.0e (A),** 2026-10-08 03:08-03:40Z, every step in the shared lane (`--shared --weight
probe|simulator --max-seconds 300`), one hold per arm, each background call under 20 min (I-240). No timing.

| gate | stops | result |
|---|---|---|
| Chrome 430x775, full seek, four loads (`out/g0box/seekF-c775`) | 148 | **T0 within A/A**: state equal at every stop; t2.mjs passes (worst flat 14, edge 33, 0.05 %). One stop, open@320, scored 180 CSS px² "consistent" (max 23): the known intermittent whole-nav frame (~160 k px at max 11-55, which also hits g0.0e's own A/A at other stops in this run and in PR-038's). It came in both A loads, not in the V loads, so the consistency rule counted it. A re-check of open@280-360, four loads (`seekF-c775re`): open@320 0 px, and the frame moved to other stops and pairs (A/A or V/V each time, so never consistent). The rest is the countdown area (x 224-320, y 490-590, max ≤ 18). v3-W does nothing in Chrome by construction (no `GestureEvent`, so no `html.fw-bx`). |
| Simulator (fw-sim), full seek, four loads in two halves (`seekF-sim`) | 144 | **Same as PR-038, stop for stop:** state equal (148), the same 6 failing stops with the same maxima and areas (open@240 164, open@260 161, open@340 182, open@440 218, rev2@0 217, rev2@60 164), flat max 31, area ≤ 0.18 %, biggest cluster 678 CSS px². The t2 reports of this run and PR-038's (`seekW3-sim.t2`) are identical at all 144 stops. Nothing new. |
| Simulator, Reduce Motion on (open/close 0-360 by 40, 500, 700; `seekF-simrm`) | 24 | **T0**: 0 consistent px at every stop (worst flat 0, edge 0), state equal. Reduce Motion on was confirmed by the session and restored after. |
| The Join under the nav clip (fix-join-fade's `out/jf/jfsim.mjs` + `remetric2.mjs`, their variants `v3.json`: reference = the same stop with the Join hidden by a stylesheet from load; their stops 24:40, 80:0, 80:200, 400:280, 400:340; `out/g0box/jf2-{e,f}`) | 7 per arm | **Unchanged:** corners off 0 and dark px over EN 0 at every stop in both builds (corner max ≤ 1); outside the box 20 (g0.0e) / 18 (g0.0f) at join-24-40, 0 elsewhere; pill widths, opacities and the 4 px gap identical. The g0.0e numbers equal fix-join-fade's committed fix numbers. |
| Logo path (fix-logo-close's `probe/logo-path-sim.mjs`, Simulator, arms g0.0e and g0.0f; `out/g0box/logoF`) | open + close seeks | **Unchanged:** close flip jump -0.13 px, open flip jump +0.14 px in both builds (≤ 1 px), the same as logo-close's committed fix numbers. |

- A first Join run with jfsim's built-in reference (the Join hidden by inline style at shot time, `out/g0box/jfF-*`)
  gave non-zero corner and over-EN counts in **both** builds, g0.0e included (e.g. join-80-0: 906 / 904 corners off).
  The reference is wrong for this question: fix-join-fade replaced it with the stylesheet-from-load reference
  (`remetric2.mjs`), which is what the table uses. In that run the two builds were also equal except join-24-40
  (corners 223 / 373), which the correct reference shows as 0 / 0.
- No tool changed; the copies of fix-join-fade's probes live in this worktree's gitignored `out/jf/`.

## v3-W (lead's decision after e3857c4f): v3 in WebKit only, on g0.0c

All runs were Simulator or Chrome seeks in the shared lane (`fixes/g0-box/gates/run4.sh`: one `--shared` hold per
arm, four loads A V A2 V2, A = g0.0c, V = the overlay). New scorer: `fixes/g0-box/gates/t2.mjs`. It applies the PR-010
consistent rule (over 8 levels in all four cross pairs, while neither A/A pair is over 8 there) and leaves out the
Simulator's status bar (rows above 56 CSS px). It splits each consistent pixel into **edge** (the 3x3 luma range around
it is over 16 levels in A or in V) or **flat** (everything else), and reports both maxima, the area and the biggest
cluster against T2 (flat ≤ 64, edge ≤ 128, ≤ 0.5 %, cluster ≤ 2000 CSS px²).

| gate | build | stops | result |
|---|---|---|---|
| Chrome 430x775, full seek (open, close, rev1, rev2; 0-700 ms by 20) | v3-W before the RM fix | 148 | **T0 within A/A**: state equal at every stop; consistent pixels at 3 stops only, max 8 CSS px², level 53 (A/A max 59), in the countdown/cycler area (x 224-320, y 480-592), not the nav. The RM fix is CSS under `html.fw-bx`, so Chrome is unaffected. |
| Simulator (fw-sim), full seek | v3-W before the RM fix (the fix changes nothing outside a reduced-motion close; see below) | 144 | **FAILS T2 on the edge level.** Flat max 31 (≤ 64, everywhere). Edge max 218 at open@440; failing stops: open@240 (164), open@260 (161), open@340 (182), open@440 (218), rev2@0 (217), rev2@60 (164). Area ≤ 0.18 %, biggest cluster 678 CSS px² (both within T2). State equal everywhere. |
| Simulator, Reduce Motion on (open/close, 10 steps) | before the fix | 20 | **FAIL, real bug:** close@0 and close@100: the nav shows the light fill while g0.0c is still dark (16133 CSS px², max 219). |
| Simulator, Reduce Motion on (open/close, 0-360 by 40, 500, 700) | with the fix | 24 | **Fixed except one stop.** close@0: 58 CSS px², max 48 (was 16133 / 219); close@80 and later ≤ 19 px², max ≤ 28; opens ≤ 20 px² (the box corner, max 69). Still **FAIL at close@40**: 2310 CSS px² (0.61 %), flat max 70, all on the EN language switch (x 208-304, y 80-128). In V it is lighter than in g0.0c in the middle of the colour fade, while the nav fill around it matches (crop `out/g0box/rm40.png`; A/A crop `rm40aa.png` is black). The switch has its own `backdrop-filter: blur(12px)` over a translucent background (CSS 11490-11521), so it samples the nav's colour. In V that colour is the dark fill's opacity transition, not the painted background. Cause OBSERVED in our setup, unknown. |
| Simulator, Reduce Motion on (same steps) | final: v3-W steps aside under reduced motion (CSS f9b2f894dedf) | 24 | **T0**: 0 consistent px at every stop, state equal (`out/g0box/seekW3-simrm`) |
| Simulator, full seek | final (CSS f9b2f894dedf) | 144 | Same as the pre-fix run at every stop: state equal (148 stops), flat max 31, edge max 218 at the same 6 stops, area ≤ 0.18 %, biggest cluster 678 CSS px² (`out/g0box/seekW3-sim.t2`). Proposal crops from this run: `fixes/g0-box/gates/crops.mjs` → `out/g0box/crops/`. |
| iPad width (over 640 px; v3-W does not apply) | — | — | not run: the iPad session timed out at the 300 s hold cap during boot. The CSS is under `(width<=640px)`, so a wider page gets no v3-W rule, but the JS still adds `html.fw-bx` and the two hidden fills (`display: none`). |

**The edge difference.** It is the same thing that failed Chrome for v3: a 1-device-pixel line along the nav's
rounded corners and side edges, where the dark box meets the light page (crops: `out/g0box/o440c.png` A | V | diff;
the A/A crop `o440aa.png` is black). WebKit anti-aliases the `clip-path: inset(round)` mask differently from v0's
border-radius background plus rounded overflow clip, while the box is mid-tween at fractional device positions
(OBSERVED in our setup, cause unknown). Between the 10-step stops the Simulator's difference is up to 218. It is
deterministic: the 20 stops shared with e3857c4f's run give identical numbers.

**The Reduce Motion bug and its fix.** Under reduced motion the close snaps `--morph` to 0 while the nav is not
`.is-morphing`. v0's nav then runs its background transition (`:not(.is-morphing)`: 0.32 s
`cubic-bezier(0.16, 1, 0.3, 1)` under reduced motion, CSS 12061-12068; 0.7 s otherwise, 11735-11742; 0.7 s for the
ready hero pill at 601-640 px, 11777-11784), so the colour fades dark to light. v3-W's dark fill followed `--morph`
at once.
- First fix (CSS 2c9deee5b885): the dark fill's opacity takes the same transition. That fixed close@0, but left
  close@40 at T2 fail (the EN switch, row above).
- Final fix (CSS f9b2f894dedf): under `(width<=640px) and (prefers-reduced-motion: reduce)` v3-W steps aside. The nav
  gets back v0's own `color-mix` background and `border-radius`, with no clip-path, and the fills are
  `display: none`. Under reduced motion g0 opens and closes without a tween (JS 14156 returns before the tween), so
  there is no per-frame paint to save, and the page is v0's by construction (T0 in the re-seek).
- The 0.7 s fill transition outside `.is-morphing` stays for the normal case. v0 runs that background transition at
  rest after a close (the 398x52 pill repaints 86 times in "Gain"); in V the fill fades on the compositor instead.

## Gain against g0.0c (Simulator, counts only; lead's step 1)

`fixes/g0-box/gates/counts-sim.mjs A=out/g0box/g00c V=fixes/g0-box/overlay`, two sessions with the arm order swapped
(`out/g0box/counts/counts-sim-2026-10-07T19-56-04-875Z.json`, `…T20-00-19-719Z.json`). Each session runs per arm:
3 opens and 3 closes in a real-time Timeline pass (segments open and close, 900 ms each, summed over the 3), and a
census pass (layers and MB at L0, mid-open, open, mid-close, closed, twice). Per-rect splits:
`out/g0box/navrects.mjs`. The top of the page: `top-sim.mjs` (`out/g0box/counts/top-sim-2026-10-07T20-04-41-371Z.json`;
its V load may have read the overlay just before or after the reduced-motion edit, which only touches
`prefers-reduced-motion: reduce` rules and doesn't apply in that run). All OBSERVED, Simulator, one load per arm per
session; Simulator ms are not judged.

| what | g0.0c (run 1 / run 2) | v3-W (run 1 / run 2) | change |
|---|---|---|---|
| layer memory added by opening (open − closed, same arm; open and open2) | +16.3, +17.9 / +16.2, +17.9 MB | +5.4, +7.0 / +5.5, +7.1 MB | **about −11 MB** both runs |
| layer memory, absolute, open | 117.3 / 109.3 MB | 113.6 / 97.8 MB | −3.7 / −11.5 MB |
| layer memory, closed | 101.0 / 93.1 MB | 108.2 / 92.3 MB | +7.2 / −0.8 MB (run 1's V started 7.2 MB higher at L0, same 52 layers) |
| redraw area, 3 opens | 49.58 / 65.77 Mpx | 47.02 / 55.47 Mpx | −5 % / −16 % |
| redraw area, 3 closes | 38.22 / 44.78 Mpx | 42.21 / 42.04 Mpx | +10 % / −6 % (mixed) |
| redraw area per frame, opens / closes | 0.54, 0.60 / 0.35, 0.36 | 0.45, 0.48 / 0.32, 0.32 | −17..−20 % / −7..−11 % |
| bar-wide rects (w ≥ 380 CSS px) per 3 opens | 35.1 / 46.1 Mcss px | 28.0 / 33.3 Mcss px | −20 % / −28 % |
| the 406x791 (full box) rect, 3 opens | 26 / 29 | 11 / 14 | the nav root's own repaint mostly gone |
| bar pill repaint (398x52) at rest after the close | 86 / 88 | 0 / 0 | the v0 colour fade now runs on the compositor |
| layers new per open (vs L0) | Join only | Join only (run 1: + the language-switch wrap, 0 MB, first open only) | equal |
| top scroll (110 frames): paints, area | 659, 40.48 Mpx | 498, 35.79 Mpx | −24 % paints, −12 % area; the 398x52 bar repaint 65 → 0 |
| layer memory top / mid / end | 52.2 / 101.1 / 93.1 MB | 51.7 / 100.4 / 92.3 MB | within 1 MB; +2 layers (the fills, 0.00 MB each) |

- **Where the 11 MB goes.** It is the nav's own backing store at panel size: 406 × 791 CSS px × 9 (DPR 3) × 4 bytes =
  11.6 MB. The census lists the same 52 layers in both arms, so in V the nav keeps a layer but no backing store
  (OBSERVED; the census reports layer MB per node).
- **What still repaints per frame** in V: v0's card at the box size (406x388, 406x88, 430x513 …). M3-B v3 keeps the card
  untouched, by the lead's option 3, so that work stays; it is what limits the paint-area gain.
- **Decision rule (lead):** end-open memory ≥ 10 MB, measured as open minus closed (the lead's reading), passes in
  both runs. No new layers per open, and top counts are not worse. → T3 proposal with Try-it.

## Stacking with the other nav fixes

On g0.0c, v3-W (fixes/g0-box/patch.diff) plus fix-join-fade's block (their `out/jf/block.css`, g0.0c + block = CSS
32a2bf7c17b0) and fix-logo-close's `delta.diff` (one declaration at g0.0c CSS 12038-12045): each pair applies in
either order with the same bytes, and all three together give CSS e434bb66fa5c, JS 7f7d83162ef6 (before the comment fix)
(`out/g0box/stack-jf.sh`, `stack-lc.sh`). Couplings: v3-W's nav clip-path is an ancestor of join-fade's Join clip (no
paint outside the nav) and of the logo (stays inside the box).

## Phone kit (draft, for after the user's decision; not signed, not run)

`fixes/g0-box/phone/`: copies of the P-163 kit (`g0b-serve.sh`, `g0b-hold.sh`, `g0b-block.sh`, `g0b-run.sh`).
- It carries the P-161/P-163 lessons: tool-serious via `iphone.mjs rearm`, Safari parked before the rearm,
  `thermal.mjs clear` after the hold, the get-ready step on preflight AUTH, and `--block`.
- `g0b-read.mjs` reuses p161-read's decision code, with opens taken from touch rows: g0 opens are a time tween on a
  held page, never a scroll crossing (selftest 8 checks ok; since P-164 the triggers are prevented touchmoves, see "P-164").
- Pins (re-snapped after PR-038's acceptance, on the new best build): C = **g0.0e** (JS 5c39f7a96e41 / CSS
  d4e684032482), V = **g0.0f** = g0.0e + v3-W (JS 30fd80ccbb3f / CSS 1d1e5d62a2c4); snapshot `out/g0box/snap4` (C from
  `out/g0box/g00e`, V from `out/g0box/g00f`, read-only), HASHES 3412a08fa9ac. Earlier snapshots (snap3: g0.0c against
  g0.0c + v3-W, HASHES 6710a7e52104) are superseded and not served.
- Dry run 2026-10-08 03:10Z (`out/g0box/kitdry4.log`): 3 of 3 servers up, served hashes C 5c39f7a96e41/d4e684032482 and
  V 30fd80ccbb3f/1d1e5d62a2c4 ok, H1-H4 and H11 DRY ok, programs fs 8737f212c0ff (budget 229 s) and pr 7ff27a2413c8
  ok, exit 0.
- Still to check before any block: I-244's WDA check (the lead's hold). The reader finding touch rows in a G record is checked (P-164 pre-data check 2).
- Card: see "P-164" below (it supersedes this draft: the G program is now g-fastshort-g0, 38d7fe5d7fa8). Order
  H1:WC H2:WV EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4 H11:TAIL. Decision D1-D3 as P-163: D1 O1.f2 V−C ≤ +4 ms, D2 open
  median dt V−C ≤ +4 ms, D3 share > 34 / 30 / 38 ms. Command: `sh fixes/g0-box/phone/g0b-run.sh <ticket>`.
- The user accepted PR-038, so this test is next; the lead signs the card and books the phone with the user.

## P-164 (phone card; written before any P-164 data)

**Pre-data check 2, with the g0 program (2026-10-08 03:47-03:55Z, before any P-164 data). Result: START-STATE
MATCH.** The lead chose option (a) below. The program is `fixes/g0-box/phone/g-fastshort-g0.json` (made by
`out/g0box/mkprog.mjs` from v1), **compiled program 38d7fe5d7fa8**, GESTURE_BUDGET_S 229. Changes from v1:
- every `until atEnd` is optional with a 1500 ms timeout, followed by a non-optional `until y>=3000` (the compiler's
  pull-to-refresh guard needs a guaranteed scrollY before a down stroke, and the run aborts if the page is lost);
- the approach repeat is capped at 12 passes and each re-approach repeat at 2;
- strokes, marks, profiles and pauses are v1's.

I ran it as before: one functional Simulator session per arm, shared lane, served from snap4, `--count-only`
(`out/sim/fix-g0-box-gesture-p164g0-{C,V}-*.json`).

| | C (g0.0e) | V (g0.0f) |
|---|---|---|
| run | complete, 52 strokes, no abort | complete, 52 strokes, no abort |
| start of the first E stroke (E20) | y 5213 (m 0.939 at ih 775), the pin | y 5214 (m 0.941) |
| stroke order | 12 approach drags, then s2 … s31 (E20-E31 with their re-approaches and 450 px down drags) | identical |
| settle ys | 509 1019 … 5099, then 5213 for every later stroke | 510 1020 … 5100, then 5214 for every later stroke |
| moving frames, total | 529 | 518 (-2.1 %) |
| toolbar transitions / flings | 1 / 0 | 1 / 0 |
| reader triggers (`g0b-read.mjs`) | **13 opens, 12 closes**, every one a prevented move at the pin | **13 opens, 12 closes**, the same |

- Verdict: **START-STATE MATCH** (`fe-start.mjs`): the same program, geometry, stroke and mark order, every settle y
  within 1 px, moving frames within 3 %.
- **E strokes are reached.** The page never leaves the pin after the first open: the 450 px down drags close the
  menu inside the jack, and the re-approach drags re-open it.
- **Opens per run.** O1 plus 12 later opens, i.e. 12 open windows for D2/D3 per run. That meets the lead's floor
  (≥ 10 opens per run), and the closes (12) are the descriptive population. The per-stroke split is: O1 on approach
  drag 12; then each E-close fling closes, the re-approach's first drag re-opens, each 450 px down drag closes, and
  each E-open fling opens. g0's pin does not cut the count. It changes what opens the menu: on g0 every flick or drag
  opens or closes fully, so "fast short flick" is not the question here (unlike PR-018 on v14).
- Kit dry run with the new program, 03:54Z (`out/g0box/kitdry5.log`): 3 of 3 servers, served hashes ok, H1-H4 and H11 DRY ok, PROG fs 38d7fe5d7fa8 ok (budget 229 s), pr 7ff27a2413c8 ok, exit 0.

**Pre-data check 1: Simulator start state per arm with the P-163 program (2026-10-08 03:45Z, before any
P-164 data). Result: STOP.** I ran one functional Simulator session per arm (shared lane, weight simulator), each arm
served from snap4 by `g0b-serve.sh start` (served hashes ok). Each session ran `sim.mjs gesture
fixes/morph-scroll/g-fastshort-v1.json --count-only` (`out/g0box/p164pre.sh`). Records:
`out/sim/fix-g0-box-gesture-p164-{C,V}-*.json` (gitignored); read with `research/end-of-page-fresh/phone/fe-start.mjs`
and `out/g0box/p164prev.mjs`. Counts only, no timing.

| | C (g0.0e) | V (g0.0f) |
|---|---|---|
| run | **aborted**: "until atEnd not reached in 4000 ms (scrollY 5213)", after 30 strokes | **aborted**, the same way (scrollY 5214) |
| start of the first E stroke | never reached | never reached |
| stroke order | 30 approach drags (520 px up), the repeat's maximum; no E stroke | identical |
| settle ys | 500 1010 … 5090, then 5213 ×19 | 510 1020 … 5100, then 5214 ×19 (the Simulator's own 10 px drag variance from stroke 1) |
| where g0's jack takes over | drag 12, first prevented move at y 5213 (drag 11 ended in a rubber band to 5391 and settled at 5213) | drag 12, y 5214 |
| prevented touchmoves | 1370 of 2006, every one at y 5213 | 1386 of 2038, at y 5214 |
| moving frames, total / toolbar transitions | 511 / 1 | 560 / 1 |

Why the G program cannot run on g0 builds (OBSERVED, both arms; mechanism from the code):
- g0's jack (g0.0f JS 14402-14413: `k(n)`, then `preventDefault`) opens the menu on the first upward move at the end.
- `L` (14431-14433) pins the page at the scrollY where the jack fired (5213). Opening grows docH from 5999 to 6035,
  so maxY becomes 5260.
- The driver's `atEnd` (y >= maxY - 2, `tools/lib/gesture-run.mjs` 132) can never hold while the menu is open or
  pinned.
- The approach repeat runs all 30 passes (19 of them prevented drags), then the program's first non-optional `until
  atEnd` aborts the run. On the phone, H1 would abort the same way. The arms themselves match (same path, same pin
  within 1 px), so the stop comes from the driver, not from an arm difference.

**Reader check (the open point): the touch rows are there, and the reader now finds the open.**
- Count-only records keep the touch rows (2066 / 2098) but no frame rows.
- `g0b-read.mjs`'s end rule (scrollY >= docH - ih - 8) found no open: the pin is 39-47 px under that line. With ih
  taken from vh0, it fired falsely on drag 11's rubber band (y 5260, not prevented), one drag before the jack.
- **Pre-data change** (before any P-164 data): triggers now come from prevented touchmoves. An open is an upward move
  the page prevented while closed; a close is a prevented downward move while open. g0's jack prevents every move that
  opens or closes it, and the recorder sees that. The end rule stays only as the fallback for a record with no
  prevented move at all, and ih falls back to vh0. Selftest: 8 checks ok, including the P-164 Simulator shape.
- On the two records the reader finds the real open: C open@35886 (y 5213, prevented), V open@35014 (y 5214); 1 open
  and 0 closes per arm, since the program died before E20. f1/f2 are null because count-only keeps no frames.

**Driver options after check 1** (message to the lead 2026-10-08; the lead chose (a), checked above as pre-data check 2):
- (a) **Taken:** a g0 copy of the program, `fixes/g0-box/phone/g-fastshort-g0.json`. It keeps the same strokes,
  marks and profiles. Each `until atEnd` becomes optional with a short timeout, the approach repeat is capped at 12,
  and the 11 re-approach repeats run 1-2 passes (on g0 the page never leaves the end, and one up-drag re-opens). It
  is a new program hash, so a Simulator pre-data check per arm, as above, comes before signing.
- (b) v1 with only `optional: true` on its 12 `until atEnd` steps. That adds about 190 s of prevented drags and
  timeouts per run.

**Card** (P-163's form; everything not named here is as P-163):

| item | value |
|---|---|
| ticket | P-164 (signed by the lead 2026-10-08 04:00Z, before any P-164 data; driver option (a) chosen by the lead, its pre-data check 2 above passed; swipe robot checked READY 03:37Z after the re-plug, I-244) |
| question | Does g0.0f (g0.0e + v3-W) open and close the end-of-page menu no worse than g0.0e under a G finger gesture on the phone? This is a no-worse check for an accepted look (PR-038), not a "smoother" claim. |
| arms + pins | C = g0.0e (g0.0c + join-fade + logo-close, main 8bc50d29), JS 5c39f7a96e41 / CSS d4e684032482 (`out/g0box/g00e`). V = g0.0f = g0.0e + v3-W (`fixes/v3w-g00e/patch.diff`, main 214617dd), JS 30fd80ccbb3f / CSS 1d1e5d62a2c4 (`out/g0box/g00f`). |
| snapshot + HASHES | `out/g0box/snap4` (C from g00e, V from g00f, read-only), HASHES 3412a08fa9ac, checked by the kit before every start and every hold |
| kit | `fixes/g0-box/phone/`: g0b-serve.sh, g0b-hold.sh, g0b-block.sh and g0b-run.sh are copies of the P-163 kit with these pins and the P-161/P-163 lessons (tool-serious through `iphone.mjs rearm`, Safari parked before every rearm, `thermal.mjs clear` after the hold, the unlock step on preflight AUTH, `--block`). The hold script pins the g0 program (`FS=fixes/g0-box/phone/g-fastshort-g0.json`, `PROG_FS=38d7fe5d7fa8`). Dry run 03:54Z: 3 of 3 servers serve the pinned hashes; H1-H4 and H11 DRY ok; programs fs 38d7fe5d7fa8 and pr 7ff27a2413c8 ok. Reader: `g0b-read.mjs` (opens and closes from prevented touchmoves, above; selftest 8 checks ok) on `out/g0bp/runs`. |
| driver, profile, order | G **`fixes/g0-box/phone/g-fastshort-g0.json`, compiled program 38d7fe5d7fa8** (GESTURE_BUDGET_S 229): g-fastshort-v1's strokes, marks and profiles, with optional `until atEnd` (1500 ms) plus `until y>=3000`, the approach capped at 12 passes, the re-approaches at 2. **The G program changed against P-161/P-163 (v1, 8737f212c0ff, which aborts on g0), so P-164's numbers do not compare with those tickets.** Per run: 13 opens (O1 + 12 later) and 12 closes in the Simulator check. Timeline on in every counted run. Profile tool-serious (`CM_THERMAL=serious`, `CM_COOL=0`). Order H1:WC H2:WV, then EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4 (C V V C C V V C), then H11:TAIL with the end sentinel. Link loss as P-161. |
| command | `sh fixes/g0-box/phone/g0b-run.sh P-164` as a Bash background job (timeout 7200000 ms). It starts the servers, runs the block under `lock.mjs run iphone --owner fix-g0-box --block P-164 --max-seconds 3600 --keep 120`, then `thermal.mjs clear`, then stops the servers. |
| metrics and decision | P-163's rules, with g0's open: an open is a time tween on a held page, triggered by the first prevented upward touchmove. D1: median V O1.f2 - median C O1.f2 <= +4 ms (O1 = the first open after load). D2: median over runs of the per-run median dt of all later open-tween frames (700 ms windows), V - C <= +4 ms. D3: the share of those frames over T, T in {34, 30, 38}. PASS / FAIL / OPEN as in P-160/P-163; each run's open and close trigger counts must match between the arms. |
| descriptive (no verdict) | The close-tween frames (median dt, share > 34 with twins); per-run finger-down frames > 50 and > 34 with twins, per arm. |

**Prediction (frozen with this commit, before any P-164 data).**
- **D1: PASS, about 65 %.** v3-W builds its two fills at setup and adds no layer per open (Simulator census), so the
  first open's second frame should not cost more. The risk is that WebKit's first `clip-path` mask on a still-small
  box costs one extra commit.
- **D2: PASS, about 70 %.** v3-W removes the nav root's per-frame repaint and its 11.6 MB backing store; Simulator
  redraw area per open is 5-16 % lower. Simulator counts have not predicted phone frame time well before (M6).
- **D3: PASS, about 60 %.** The same direction, but the share is the noisier measure.
- **Overall: PASS, about 50 %.** OPEN (threshold-sensitive) is the most likely other outcome.

**Decisions (the lead's, word for word):**
- **PASS:** g0.0f (g0.0e + v3-W) becomes the best build; the lead updates BEST_BUILDS and T-228.
- **FAIL by D1 alone, D2 and D3 passing:** by the user's T-228 #30 ruling it may still land; the lead decides from the later-open numbers.
- **FAIL on D2 or D3:** g0.0e stays best; v3-W stays a research result, and the user is told the no-worse check failed despite the accepted look.
- **OPEN (threshold-sensitive):** at most one more block (sequential rule); the lead decides.

### P-164 result (block run 2026-10-08 04:00-05:08Z; the lead decides on the G6 gate)

**As the kit ran it, the block is VOID**, and the reason is a kit error of mine, not the phone:
- The run gates come from P-129's frozen reader (`research/serious-heat/p129-read.mjs`). Its gate G6 requires the
  gesture program hash to start with v1's `8737f212c0ff` (`FS_HASH`, line 66).
- When I moved the kit to the g0 program (38d7fe5d7fa8) I re-pinned the hold script but not this gate, and the dry run
  does not exercise gates.
- So every counted run printed `INVALID G6`, the block used its two re-runs (EC1r, EV1r) on that, and the end sentinel
  S1 failed on G6 alone ("SENTINEL S1 FAIL fps 54.3 slow 0.039 (G6 script hash 38d7fe5d7fa8 is not fs 8737f212c0ff)"),
  which by the protocol voids every counted run (exit 8).

**Every other gate passes** (`out/g0box/p164gates.mjs`, P-129's readRun on each record):
- G1-G5 hold on all 10 counted runs (EC1-EC4, EV1-EV4, EC1r, EV1r); idle 4.68-4.86 s (window 4.0-5.5).
- S1 meets the numeric sentinel: moving fps 54.3 ≥ 50, slow share 3.9 % ≤ 6 %.
- Every hold was VALID; the run hash on every record is the signed program 38d7fe5d7fa8.
- Heat: tool-serious; Serious (induced) at every gate; battery 38.8-41.0 °C, under the 44 °C ceiling; no Critical.
- The swipe robot and USB held for the whole block (no link loss, no re-plug).

**Reading with the card's rules** (`g0b-read.mjs out/g0bp/runs`; the block's own counted runs, EC1-EC4 and EV1-EV4;
valid for a decision only if the lead rules G6 a pin error, since the card names 38d7fe5d7fa8):

| | C (g0.0e) | V (g0.0f) | V − C | rule |
|---|---|---|---|---|
| triggers per run (open / close) | 13 / 12 in all 4 runs | 13 / 12 in all 4 runs | equal | must match: ok |
| D1: O1.f2, median (range) | 16.5 ms (16-17) | 16.5 ms (16-17) | 0 | ≤ +4: pass |
| D2: later-open tween median dt, median of runs (range) | 17 ms (17-17) | 17 ms (17-17) | 0 | ≤ +4: pass |
| D3: later-open share > 34 / twins > 30, > 38 | 0 / 0, 0 | 0 / 0, 0 | 0 | ≤: pass at all three |
| open-tween frames per run | 513-515 | 514-516 | | |
| descriptive: close-tween median dt / share > 34 | 17 ms / 0-0.2 % | 17 ms / 0-0.2 % | | |
| descriptive: finger-down frames > 50 (46 / 54) per run | 7, 5, 6, 6 (7-10 / 2-3) | 5, 10, 8, 9 (7-12 / 5-7) | | |
| descriptive: finger-down frames > 34 (30 / 38) per run | 29, 31, 34, 28 (53-65 / 16-21) | 32, 32, 30, 39 (60-69 / 19-23) | | |

- **Reading: PASS** (D1, D2 and D3 pass with zero difference; no twin changes a verdict), conditional on the lead's
  G6 ruling. Single runs reach ~0.2 % close-tween frames over 34 ms in both arms; the open tweens have none in either.
- Finger-down frames are the whole run's touch-down time (approach drags included), descriptive only. V's > 50 count
  has a median of 8.5 per run against C's 6 (> 34: 32 against 30); with 4 runs a side this decides nothing.
- Records: `out/g0bp/runs/` (gitignored); reader output `out/g0bp/p164-read.json`; run log `out/g0bp/p164-run.log`.

**Lead ruling (2026-10-08, after the block): option (a), G6 was a stale pin.** G6 exists to prove that the signed
program ran. The signed card names 38d7fe5d7fa8, and every record carries it, so the gate's intent is met; it failed
on the kit's stale pin, not on data. The condition was a shown re-read, not an assumed one:
- **The g0 gates copy:** `fixes/g0-box/phone/p129-read-g0.mjs` is `research/serious-heat/p129-read.mjs` with one line
  changed (line 66, `FS_HASH = '38d7fe5d7fa8'`; `diff` shows only that line).
  `fixes/g0-box/phone/p129-gates-g0.mjs` is `research/serious-heat/phone/p129-gates.mjs` with only its import pointed at
  that copy (and its usage line). `g0b-hold.sh` now uses it, for future g0 tickets.
- **Re-read of every P-164 record through it** (`node fixes/g0-box/phone/p129-gates-g0.mjs out/g0bp/runs EC1 … S1`, exit 0):
  G1-G6 ok on EC1-EC4, EV1-EV4, EC1r and EV1r (idle 4.68-4.86 s); **SENTINEL S1 PASS** (54.3 fps, 3.9 % slow).
- **D1-D3 re-read:** `g0b-read.mjs` gives byte-identical output (`out/g0bp/p164-read2.json` = `p164-read.json`): D1 0,
  D2 0, D3 0/0/0, triggers 13/12 in every run. **P-164: PASS.**
- **What counts:** the planned runs EC1-EC4 and EV1-EV4, as the card says. The re-runs EC1r and EV1r were spent on the
  stale G6 and are **descriptive only**:

| re-run (descriptive) | triggers open/close | O1 f1 / f2 | later-open n, median dt, share > 34/30/38 | close median, > 34 | finger-down > 50 (46/54), > 34 (30/38) |
|---|---|---|---|---|---|
| EC1r (C) | 13 / 12 | 12 / 17 ms | 516, 17 ms, 0/0/0 | 17 ms, 0.2 % | 9 (9/4), 32 (56/19) |
| EV1r (V) | 13 / 12 | 11 / 17 ms | 513, 17 ms, 0/0/0 | 17 ms, 0 % | 6 (7/3), 29 (63/17) |

- Lesson (posted as a pitfall finding): re-pinning a program needs the reader's FS_HASH too; the dry run doesn't
  exercise the gates.

### Options considered after the stop (the lead chose (a))

- (a) A T3 look-alike proposal: the outline differs mid-motion only. **Taken.**
- (b) Keep `border-radius` on the nav with no background and no clip-path (fills only). The outline would use v0's
  mechanism, but WebKit counts a border-radius as a box decoration (`RenderLayerBacking.cpp` 3440-3447, 3657-3686), so
  the nav would keep a backing store, and with it the 11 MB. Not built.
- (c) Drop M3-B.

## v3 (lead's option 3, e3857c4f): fills + clip only, v0's card untouched

**Correction (2026-10-08):** the "Simulator passes" below rests on a 10-step seek. The 144-stop seek in "v3-W" finds
edge levels up to 218 in WebKit too.

v3 keeps v0's box and card exactly as they are. It only removes the nav's own paint:
- the background becomes two composited solid fills (light `#ffffff1a`, dark `#131922` at opacity m);
- `border-radius` becomes `clip-path: inset(0 round 32-12m px)`.

Gate 1 used the same seek against g0.0, four loads per engine (`out/g0box/seek-v3-{c775,sim}.score`; v3 run on
2026-10-08, before the g0.0b rebase).

| engine | worst consistent beyond A/A | max level of that cluster | where | T2 wide limit |
|---|---|---|---|---|
| Chrome 430x775 | 866 CSS px² (0.26 %), open@420 | 226 (open@300-420) | the nav's outline only: left, right and bottom edges and the round corners | edge ≤ 128: **fails** |
| Simulator | 553 CSS px² (0.14 %), open@420 | 117 | the nav's right/left edge and corners | **passes** on edge level, area and per-element size; the 2-3 % flat pixels' own max is not split out (≤ 117) |

- **Simulator status bar:** one 18 px² cluster of max 255 at x 80-112, y 16-48 (shot coordinates) appears at every
  stop, rests included. It sits in the Simulator's status bar above the page, as in g0-gpu's "T0 below the status
  bar", and is not counted.
- **The card in v3:**
  - Chrome: the interior is identical.
  - Simulator: the clusters are the outline too. At open@100 the 388 px² cluster (max 81) is the outline of the
    still-small box, 0-416 x 64-416. The flat share is 0.02-0.03 at open@100, open@420 and close@100, so 97-98 % of
    the differing pixels are edge pixels.
  - Unlike v2, there are no text or digit phase differences.
- **State:** equal at every stop in both engines (morph, classes, aria, focus, hit targets, geometry). There are no
  backdrop/column differences, since the card is v0's.
- **Rests:** Chrome ≤ 38 px² (open and close rest, max 113 at the bottom-left corner). Simulator ≤ 38 px² below the
  status bar.
- **Reading** (OBSERVED in our setup, cause unknown): Chrome anti-aliases a `clip-path: inset(round)` edge
  differently from v0's border-radius background plus its rounded clip of the card, while the box sits at fractional
  device positions mid-tween. The difference is a 1 device px outline, up to 226 levels where the dark card meets
  the light page. WebKit's edges stay within 117.
- **Not run, because of the stop rule:** Chrome 430x815, widths 768/1280, reduced motion, and gates 2-3 for v3.
  The v2 counts below show what the fills and the clip alone save only in part: v2 also changed the card.

### v3's options (e3857c4f; the lead took (a), which became v3-W)

- (a) **Scope the clip to WebKit**, where v3 is within T2, and let Chrome keep v0's border-radius. Chrome would then
  be T0 by construction and lose its share of the gain. This needs an engine test in CSS or JS, which this study has
  not used so far.
- (b) **Keep `border-radius` on the nav with no background** (fills only, no clip). The outline would be v0's in
  both engines. But in WebKit a border-radius counts as a box decoration (`RenderLayerBacking.cpp` 3440-3447,
  3657-3686), so the nav keeps a backing store that repaints when the radius changes. I have not measured how much
  of the saving that keeps.
- (c) Take v3 to the user as a look-alike proposal: a 1 px outline difference mid-tween in Chrome.

The v2 sections below are unchanged from 7da9b47e.
**Driver(s):** Chrome seek harness (frozen clock), Simulator seek, Simulator Timeline and LayerTree census. No
timing A/B and no phone, by design.

## What it does

On g0.0 every tween frame changes the nav's (`header.start-selling-top-nav`) width, height, top, radius,
background and backdrop blur. As a result the nav's own 406x791 layer repaints each frame, and the card inside it is
re-laid out at the box size. M3-B keeps v0's box formulas but stops the box from painting:

- **Colour:** two composited solid fills in place of the nav's background. They are light `#ffffff1a` and dark
  `#131922` at `opacity: var(--morph)`. Source-over of the two equals v0's premultiplied
  `color-mix(#ffffff1a (1-m), #131922 m)`. Both have 0 MB backing (solid-colour layers).
- **Corner:** `clip-path: inset(0 round calc(32px - 12px*m))` in place of `border-radius`. This is a shape mask on
  the composited layer (WebKit `RenderLayerBacking.cpp` 2041-2078, 3238-3284), so a radius change repaints nothing.
  When the locale menu is open, the nav keeps `border-radius` and gets no clip.
- **Card** (`.start-selling-morph-panel`): laid out once at the open size (`--panel-w` x `--panel-h`).
  - Its origin is v0's box origin; the clip cuts what overhangs.
  - The backdrop columns keep their width. The backdrop is centred by a transform, and the columns get
    `will-change: transform`.
  - The veil is drawn at a quarter of the open size and scaled onto v0's box (JS `--fw-bx-sx/sy`). That backing is
    0.75 MB; a full-size veil would be 11.6 MB.
  - The zoom origin is v0's box centre.
  - The centre block and the footer still follow v0's box by layout.
- **Built once:** the fills at component setup and the card's parts at its idle mount. Nothing is created or
  resized when the menu opens.

**The box's per-frame layout stays. Only its paints go.** The lead accepted this deviation from the design: keeping
the backdrop exact matters more than removing the box layout. The nav's width, height and top still change every
frame, and the bar, centre block and footer are still laid out every frame. So the gain claim is **"no box
repaint"**, not "no layout". Gate 2 confirms this: Simulator layouts per open are equal (V 120, A 109; close 143 vs
144).

The structure is permanent from page load (two fills, the clip mask and the full-size card), so I measured the
census, memory and a top-of-page scroll as well (lead's added gates).

### v1 and v2

- **v1** held the card at the page position (12, 12), the open nav's corner, with each part's left and top
  following the box. Geometry matched v0 to 0.05 CSS px, but Chrome put the text 1-2 device px off mid-tween. The
  offset tracked `round(frac(navX) * 3)` device px, for example `open@360` navX 12.42 gives dx 1 and `close@100`
  gives dx -2 (`out/g0box/shiftscan.mjs`). WebKit drew some glyphs with another sub-pixel phase.
  - My reading (OBSERVED, cause not confirmed from source): the parts sit at another sub-pixel offset inside their
    composited layer than in v0, so both engines raster text with another phase.
- **v2** (this patch) puts the card's origin back at v0's box origin. Every part then has v0's offset from the
  card's layer. Chrome improved at some stops but not enough, and WebKit did not change.

## Gate 1: seek parity with g0.0 — FAILS T2

Seek harness `fixes/g0-box/gates/seek.mjs`: a frozen-clock copy of fix-g0-gpu's, plus `rad`, `geo`, `focus` and
`hit` in the state. It was run through `run4.sh` with four loads per engine (A, V, A2, V2), so every V difference is
scored beyond the A/A pair. Scenes were open and close at steps 0, 100, 200, 300, 360, 420, 500, 580, 640 and
700 ms. Outputs are `out/g0box/seek-v2o-{c775,sim}.score`.

| engine | worst stop | consistent beyond A/A | max level | T2 wide limit |
|---|---|---|---|---|
| Chrome 430x775 | open@200 | 3251 CSS px² (0.98 %) | 177 | 0.5 %, 2000 px², fill 64 / edge 128 |
| Chrome 430x775 | close@100 | 3087 CSS px² (0.93 %) | 159 | |
| Chrome 430x775 | open@300 / 360 / 420 | 2078 / 2127 / 1024 px² | 226 | |
| Simulator | open@360 | 2305 CSS px² (0.69 %) | 116 | |
| Simulator | open@580 / 640 | 1064 / 983 px² | 226 / 225 | |
| Simulator | close@200-700 | ≤ 33 px² | ≤ 35 | |

- **Rests** (open@700, close@700, close@0): Chrome ≤ 60 px², max 113 at open rest. The Simulator open rest is
  956 px², max 84.
- **What differs:**
  - Chrome: text, digit and button edges across the whole card, at low level inside the blurred phase. There is
    also a line along the nav's right edge while blurred (the wider backdrop is sampled by the 12 px blur).
  - Simulator: single glyphs (`s`, `ho`, `S`, `d`, `u`, `c`) with another anti-aliasing phase, up to 226 levels,
    plus the card's left and right edges.
  - All of these are sub-pixel phase differences, not layout: `geo` rects of the centre, title, footer, bar, logo,
    actions and veil match to 0.05 px. They are still far over the edge limit (128) and the area limit (0.5 %).
- **State:** morph, classes, aria, focus and hit targets are equal at every stop. The only state differences are
  the backdrop and column rects, whose fixed width is by design. The radius is compared through `rad` and the
  pixels.
- **A/A (Chrome):** 0 at most stops, at worst 20 levels. Simulator A/A max is 255 in the status bar and the
  #platform cycler (F-336); the score masks those pixels.
- **Not run, because of the stop rule:** Chrome 430x815, widths 768 and 1280 (M3-B has no CSS above 640 px, so they
  should be unchanged), and gate 4, prefers-reduced-motion.

## Gate 2: work per tween and layers per open (Simulator, counts only)

`fixes/g0-box/gates/counts-sim.mjs`, one load per arm at the page end, real time. Simulator ms are only a rank
(F-084). Output: `out/g0box/counts/counts-sim-2026-10-07T18-30-21-146Z.json`.

| segment | g0.0 style / layout / paint (Mpx) | M3-B v2 style / layout / paint (Mpx) |
|---|---|---|
| open (900 ms) | 159 / 109 / 928 (78.9) | 189 / 120 / 767 (42.1) |
| close (900 ms) | 192 / 144 / 1048 (53.7) | 194 / 143 / 798 (39.7) |
| rest after open | 101 / 101 / 134 (2.3) | 97 / 97 / 130 (2.2) |
| rest after close | 102 / 84 / 243 (3.8) | 98 / 83 / 152 (2.0) |

- **Paints:** -17 % calls and -47 % area on open; -24 % and -26 % on close.
  - The nav root's 406x791 repaint (29 per open in g0.0) is gone.
  - The bar (398-406 x 52) still repaints, as in g0.0: open 49 vs 34, close 31 vs 62.
  - The tracks (131-139 x 492-512) no longer make the top of V's open list. They still repaint in the first frames
    and in rests, as in A.
  - v1 had A 50.0 / V 42.4 Mpx open. Real-time runs vary, so only the direction is a result.
- **Layouts and styles** are not fewer, as stated above.
- **First frames:** no work moved into frame 1 of an open or close (both arms: frame 1 is empty).
- **Layers built per open/close: 0 in M3-B.** The census at rest, mid-open, open, mid-close and closed, three
  cycles, finds only the Join button's own animation layer (79x37, 0.21 MB). g0.0 shows the same layer, and the
  language-switch wrap (0 MB) appears in one cycle of each arm.

## Gate 3: memory and layers at rest, top / mid / end (lead's added gate)

`fixes/g0-box/gates/top-sim.mjs`, Simulator, one load per arm. Output:
`out/g0box/counts/top-sim-2026-10-07T18-31-42-603Z.json`.

| place | g0.0 layers / MB | M3-B v2 layers / MB |
|---|---|---|
| top (y 0, after the idle mount) | 163 / 52.4 | 161 / 52.0 |
| mid (y 3018) | 53 / 101.1 | 55 / 100.5 |
| end, closed (y 5260) | 54 / 93.1 | 56 / 92.5 |
| end, open (counts-sim) | 54 / 109.3-111.0 | 56 / 86.9-88.6 |

- The two extra layers are the fills, each 0.00 MB. The nav root layer drops from 0.75 MB to 0.00 MB.
- v1, with a full-size veil, was +10.4 MB at every place (veil 11.57 MB). The quarter-size veil removes that.

**Top-of-page scroll** (110 rAF steps of 24 px):

| arm | frames | style | layout | paints (Mpx) |
|---|---|---|---|---|
| g0.0 | 54 | 77 | 201 | 401 (28.3) |
| M3-B | 57 | 80 | 204 | 372 (26.3) |

- g0.0 repaints a 398x52 rect (the nav) 54 times; it is not among M3-B's top six rects.
- M3-B's top rects include 22 paints of 430x775, which g0.0's top list does not show. With one load each I can't
  attribute them. The totals are not higher.
- At rest before the scroll, M3-B logged 25 frames and 21 layouts against 10 and 2. That is one real-time load (a
  43x49 hero animation in both arms) and is not judged.
- So the permanent fills and mask add no measurable work far from the end; the evidence is single loads.

## Notes

- **Measurement code:** I changed no tool. The gate scripts in `fixes/g0-box/gates/` are copies of fix-g0-gpu's,
  plus `avscan.mjs` (a two-arm scan, diagnostic only), `top-sim.mjs` and `t2.mjs` (the T2 report with the flat and
  edge maxima split; no browser). Everything ran in the shared lane
  (`--shared --weight probe|simulator`), one hold per arm.
- **v1 run:** the v1 Chrome four-load run (`out/g0box/seek-v1-c775`) is invalid as a gate. I edited the overlay
  while it ran, so V2 saw another build. It is cited only for the v1 shift diagnosis.
- **WebKit references** (read in `out/engines/WebKit`):
  - CONFIRMED: clip-path makes a shape-mask layer and a backdrop root (`RenderLayer.cpp` 663-684, line 678).
  - CONFIRMED: a composited layer repaints when its device-pixel sub-pixel offset changes (`RenderLayerBacking.cpp`
    1474-1479, 1938-1939). This is why the backdrop is centred by a transform, not by layout.
  - The Chrome text shift and the WebKit glyph phase are OBSERVED in our setup; cause unknown.
- **Possible next steps** (not taken, per the stop rule; the lead decides):
  - (a) Accept M3-B's look as a T3 proposal. The differences are sub-pixel text phase mid-tween only; layout is the
    same.
  - (b) Snap v0's box to device pixels in both A and V. That is a v0 change and would need its own parity question.
  - (c) Keep v0's card at the box size, which brings back the column relayout and repaint, and take only the nav
    fills and clip. That would be M3-A-like, with no change to the card.
