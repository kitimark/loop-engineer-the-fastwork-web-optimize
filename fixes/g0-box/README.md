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

## P-165 (phone card draft: the one real-heat check of the final build; written before any P-165 data; not signed, not run)

The lead asked for it (2026-10-08, after P-164 landed): "is the final build no worse than the original anywhere on the
page under real heat, and better where we claim it?" It is the one real-heat block for the final build
(`memory/phone-checks-start-warm.md`: real heat runs once, for the final best build). After it come the goal check's
two follow-ups (end of this section).

**Precondition: I-246, landed on main (8f2d9e8c; docs 5c88c40c), this branch rebased onto it.** Before it, the phone
tools could not run under real heat:
- `iphone.mjs run|scroll|gesture` took only `--profile serious` (Xcode-induced) or `fair`.
- A real Serious phone reads "Serious, induced No", which is gate code 7 under `serious`, so every run refused with exit 8.

What the card uses (ts-246's fix):
- **`profile: real-serious`**: the flag `--profile real-serious` on `iphone.mjs run|scroll|record|gesture|profile`
  (gate real-serious: expect serious, no `--accept-induced`). It passes Serious with Is Induced = No.
- It refuses with exit 8 when the phone is induced (code 4), too cool (code 2) or over the ceiling (code 3).
- The heat pre-warm works under it with no extra flag. A `--warmup` run passes "too cool", but the ceiling, an active
  condition and a failed read still refuse it. A warm-up is never the hold's start read: the first counted run reads
  and keeps it. A warm-up is marked `meta.profile.warmup: true`.
- Each warm-up costs one xctrace read (about 25 s) until the hold has its start read. The time estimate below counts it.

**Pre-data check: Simulator start state per arm, both programs (2026-10-08 05:21-06:00Z, before any P-165 data).**
Setup:
- Arms are served as the kit will serve them (`g0b-serve.sh`): C = the plain baseline port, V = `snap4/V`.
- Records: `out/sim/fix-g0-box-{run-p165s,gesture-p165g,gesture-p165gb}-{C,V}-*.json` (gitignored). Readers:
  `out/g0box/p165s.mjs` (S), `research/end-of-page-fresh/phone/fe-start.mjs` and `g0b-read.mjs` triggers (G).
- No timing is read from these runs. The Simulator's frame numbers never pool with the phone's.

*S, `sim.mjs run --driver scroll --probe std`*: one normal session, the two arms back to back. Result: **START-STATE MATCH.**

| | C (v0) | V (g0.0f) |
|---|---|---|
| served JS / CSS (`meta.served`) | 4606120cf392 / 27776f3d4138 | 30fd80ccbb3f / 1d1e5d62a2c4 |
| geometry | ih 775; docH 6035 at the bottom; finalY 5260 | the same |
| marks | idle, scroll, bottom | the same |
| crossings (section and class changes logged by the probe) | 53 | 55 |
| state at start (the probe's `panel` fields) | no `div.start-selling-morph-panel` | `div.start-selling-morph-panel` present and inert, 21 images (V's own code, kept from v14; not a driver state) |

*G with P-164's program `g-fastshort-g0.json` (38d7fe5d7fa8)*: one functional session per arm (V shared lane; C in a
`--no-timing` hold, because its run outlasted the shared lane's 218 s). Result: **START-STATE DIFFER.**

| | C (v0) | V (g0.0f) |
|---|---|---|
| approach | drag 11 settles at y 5220; `until atEnd` holds there; the loop ends after 11 drags | drag 11 settles at y 5214; drag 12 runs into the jack (76 of 76 moves prevented) |
| what follows | no drag 12, and no passes in the first re-approach. The first 450 px down drag scrolls the page to 4780 with the menu closed. The page is pinned at 5256 only from stroke 19 on | pinned at 5214 from drag 12 on; every E stroke from the pin (as P-164's V) |
| strokes / opens / closes | 49 / 11 / 10 | 52 / 13 / 12 |
| flings / toolbar transitions | 1 / 4 | 0 / 1 |

- **Why:** the 6 px settle difference after drag 11 decides the path. At 5220, `until atEnd` (gesture-run.mjs 132,
  y >= maxY - 2) held on v0. On g0.0f (5214) and g0.0e (P-164: 5213) it did not. Which part of v0 makes drag 11 end
  6 px further is unknown (OBSERVED, one run). Either way the program, not the arms' menus, decides the path.
- **Fix (the lead approved fixing the repeats):** `fixes/g0-box/phone/g-fastshort-g0b.json`, **compiled program 31fc66329daf**
  (GESTURE_BUDGET_S 334; made by `out/g0box/mkprog-b.mjs` from v1). It is g-fastshort-g0 with fixed repeats: the
  approach is exactly 12 drags and each re-approach exactly 2, with no `until atEnd` exit. Strokes, marks, profiles,
  pauses and the optional atEnd + `y>=3000` guards are unchanged.
  - On V nothing changes: V already ran 12 approach drags and 2 passes in every re-approach.
  - On C, drag 12 now runs into the jack wherever drag 11 ended.
  - The budget is higher than g0's 229 s because no exit shortens the estimate. The Simulator run takes about 176 s.

*G with `g-fastshort-g0b.json` (31fc66329daf)*: one functional session per arm, in `--no-timing` holds, 05:51-06:00Z.
Result: **START-STATE MATCH.**

| | C (v0) | V (g0.0f) |
|---|---|---|
| run | complete, 52 strokes, no abort | complete, 52 strokes, no abort |
| settle ys | 510 1020 … 5100, then 5214 for every later stroke | identical |
| drag 12 (into the jack) | 76 of 76 moves prevented at y 5214 | 76 of 76 at y 5214 |
| moving frames, total | 465 | 497 (+6.4 %, inside fe-start's 10 %) |
| toolbar transitions / flings | 1 / 0 | 1 / 0 |
| reader triggers (`g0b-read.mjs`) | **13 opens, 12 closes**, every one a prevented move at the pin | **13 opens, 12 closes**, the same |

- In this run v0's drag 11 settled at 5214, not 5220. The 6 px of the first run is run-to-run variance in our
  Simulator setup (OBSERVED, one run each, cause unknown). With fixed repeats the path no longer depends on it.
- `fe-start.mjs` prints "first E stroke y 510" for both arms. That is cosmetic: it finds E strokes by the v1/g0 stroke
  ids, and g0b's unrolled repeats number the strokes s1-s52. The MATCH verdict compares every settle y, stroke order and
  the moving-frame total, and they agree.

**G6 re-pin check (the lead's condition, before signing; the P-164 slip).** `p129-read-g0b.mjs` is
`p129-read-g0.mjs` with only line 66 changed: `FS_HASH = '31fc66329daf'`. `p129-gates-g0b.mjs` is `p129-gates-g0.mjs`
with only its import and usage line pointed at that copy (`diff` shows those lines only). Both are committed with this
card. Test: the C g0b Simulator record, copied as a counted run (E1) and as a sentinel (S1), and read through both gate
copies (`out/g0box/g6test/`):

| gate copy | E1 | S1 |
|---|---|---|
| `p129-gates-g0b.mjs` (31fc66329daf) | INVALID G5, G1 only (a count-only record has no frames and no Timeline) | FAIL on G5 only |
| `p129-gates-g0.mjs` (38d7fe5d7fa8) | INVALID G5, **G6** ("script hash 31fc66329daf is not fs 38d7fe5d7fa8"), G1 | FAIL on G5 and **G6** |

So the g0b copy accepts the program the record carries (`program.hash` 31fc66329daf…), and the old copy would void it.
The kit's dry run must also show "PROG fs 31fc66329daf ok" and name `p129-gates-g0b.mjs` in its PIN line.

**Card** (P-164's and P-118's form; everything not named here is as P-164 for the G leg and as P-118 for the S leg):

| item | value |
|---|---|
| ticket | P-165 (draft; the lead signs before any P-165 data) |
| profile | **real-serious** (real heat, not induced). A hold counts only when `research/phone-thermal-gate/thermal-gate.mjs --expect serious --max-c 44` (no `--accept-induced`) reads PASS (Serious, Is Induced = No, battery < 44 °C, not Critical) at its start and at its end. Each read is an xctrace Thermal State read plus the timer grid on B. Heat comes from use only: a heat pre-warm on B (below); no Xcode condition, no `thermal.mjs set`. The kit runs `thermal.mjs clear` once before the block, and an induced read (gate exit 4) stops the block. Ceiling 44 °C / Critical. **Never pooled** with tool-serious (P-164), xcode-serious or real-fair blocks; its C is its own. |
| question | Under real heat, is g0.0f no worse than the original page anywhere on the page (S leg: the whole page, scripted; G leg: the end-of-page menu, finger-like), and is it better where we claim it (S leg: fewer slow frames in the whole-page scroll, DS3)? |
| arms + pins | C = **v0, the original page**: the baseline snapshot b1789284481295-4ad4a84a as served by every phone block (`site-pretty`, no overlay), JS 4606120cf392 / CSS 27776f3d4138. V = **g0.0f** (BEST_BUILDS, main 214617dd / f1003072), JS 30fd80ccbb3f / CSS 1d1e5d62a2c4, from `out/g0box/snap4/V` (read-only, HASHES 3412a08fa9ac). B = the plain baseline on its own port, the same files as C: the pre-warm page and the gate's timer page, so that C's port gets only its own warm-up. |
| kit | `fixes/g0-box/phone/p165-*` (to build after this card is read; dry run and scorer self-test before the signature). It copies the g0b kit (P-164's lessons: WDA ensure, Safari restart and park, the get-ready step on preflight AUTH, link loss, one item list per 600 s `--no-timing` chrome-measure hold, served hashes before every item, pmcheck). Changes: (1) serve C from the baseline (no overlay); (2) no `iphone.mjs rearm`, no `CM_THERMAL=serious`, no `thermal.mjs set`; (3) gates without `--accept-induced`; (4) the heat pre-warm loop of P-116's `fixes/v8-best/phone/p116/hold.sh` at every hold start (below); (5) S items through `iphone.mjs run`; (6) every run with `--profile real-serious` (I-246); (7) the ceiling cooling wait (`wait.mjs phone-temp --below 42 --timeout 600`); (8) the G program `g-fastshort-g0b.json` (PROG pin 31fc66329daf) and a time guard for S items too. Reader G: `g0b-read.mjs` (unchanged). Run gates G1-G6: **`p129-gates-g0b.mjs` with `p129-read-g0b.mjs`, FS_HASH = 31fc66329daf** (the g0 copy with only that line changed, committed with this card, and tested on the Simulator g0b records before signing: see "G6 re-pin check" below; the P-164 G6 slip must not repeat). Scorer S: `p165-score.mjs`, a copy of P-118's scorer (it imports P-105's `fixes/v7-best/phone/score.mjs` b9a29ffcc7bb unchanged) with P-165's pins, plus the S cluster bins and DS3 (below). |
| heat (start method, the same for every hold and arm) | At every hold start: the start gate. **Too cool (exit 2):** up to 2 pre-warm runs on B (`iphone.mjs run --driver scroll --probe std --profile real-serious --warmup`), each followed by the gate. Still too cool: the hold ends VOID with no counted run, a heat hold follows (pre-warm runs on B with the gate after each, at most 6 per heat hold), then the hold runs again. Pre-warm is capped at 40 min per part, then BLOCK STOP (message the lead). **Ceiling (exit 3):** `phone-temp --below 42` (≤ 10 min), then the hold again (its pre-warm restores Serious if it dropped). **Induced (exit 4):** BLOCK STOP. |
| drivers | **S**: `iphone.mjs run --driver scroll --probe std --profile real-serious --block P-165 --arm C\|V --run <n>`: reload, settle 8 s, idle 3 s at the top, `scrollBy` 250 px smooth every 300 ms to the bottom, 3 s at the bottom; Timeline off. The timed window is [idle, bottom): the idle at the top plus the scroll down (P-105). **G**: `fixes/g0-box/phone/g-fastshort-g0b.json`, **compiled program 31fc66329daf**, GESTURE_BUDGET_S 334 (fixed repeats; see the pre-data check). Otherwise as P-164: Timeline on in every counted G run, P-129 run gates G1-G6 through the g0b copy. The end of the page is the original's on both arms (g0), so both arms run the same program. **The G program differs from P-164's (38d7fe5d7fa8), and P-164 measured g0.0e against g0.0f under tool-serious, so P-164's G numbers never pool with P-165's.** |
| order | One uncounted warm-up per arm per leg, then C V V C C V V C per leg (n = 4 per arm per leg); the holds and phone holds are listed under "Order and holds" below the table. |
| sentinel | The protocol's S criterion (`meta.sentinel.pass`: bottom ≥ 58 fps and scroll ≥ 44 fps). Every counted C S run (C1, C4, C5, C8) is a heat sentinel. sC is an uncounted S run on C with `--heat-sentinel`, Timeline off: the G leg's Timeline-off control after the warm-ups (H6), after every second counted G run (H8, H10, H12) and at the block end (TAIL). **A failing sentinel voids every counted run since the last passing one**, in either leg and either arm. Then the real-heat rule: cool until the battery is at or below the last passing sentinel's minus 0.5 °C (38 °C if none today), at most 10 min (`wait.mjs phone-temp --below <°C>`). Then the next hold's heat start, and the voided items run once more in the TAIL. A second failing sentinel stops the block (BLOCK STOP; the lead decides; at most 2 blocks for this question, §5.3). Run validity otherwise as P-105 (S: served hashes, LPM, marks) and P-164 (G: G1-G6, served check, trigger counts). |
| command | `sh fixes/g0-box/phone/p165-run.sh P-165 1`, then `… 2`, then `… 3`, each as a Bash background job (as P-164's `g0b-run.sh`). Each part starts the servers, runs its holds in one phone hold with the block mark, and stops the servers. |

**Order and holds.** Each hold is a 600 s `--no-timing` chrome-measure hold: start gate, any pre-warm, the items, end gate.
- **Phone hold 1 (S leg):** H1 wC wV C1 V2 · H2 V3 C4 C5 V6 · H3 V7 C8.
- **Phone hold 2 (G leg, first half):** H4 WC · H5 WV · H6 sC EC1 · H7 EV1 · H8 sC EV2.
- **Phone hold 3 (G leg, second half):** H9 EC2 · H10 sC EC3 · H11 EV3 · H12 sC EV4 · H13 EC4 · TAIL.

How a hold fits 600 s:
- A G hold with an sC: start gate about 35 s + sC about 60 s + G (budget 334) + end gate.
- The time guard starts an item only while elapsed + budget + 30 ≤ 600 s.
- So a G hold that also needed 2 pre-warm runs ends VOID (time, exit 7) before its G item, and runs once more at once
  on the now-warm phone. That is P-164's rule.

The TAIL holds the G re-runs (≤ 2, as P-164) and the re-runs of any sentinel-voided items, then a closing sC.

Each phone hold is `lock.mjs run iphone --owner fix-g0-box --block P-165 --max-seconds 3600 --keep 120` (the signed
ticket lifts the 900 s cap to 3600 s). Each is planned to stay under 60 min (time table below), and the next one
follows at once.

**D-rules per driver (fixed before data).** Minimum 3 valid runs per arm per leg, else "insufficient" (at most one
extra hold per leg).

S leg, the whole page (scorer `p165-score.mjs`; per run the counts in the timed window):
- **DS1, no-worse:** d = median V − median C of the per-run count of frames with dt > 50 ms. **FAIL at d > +2.** The
  twins 46 / 54 are scored the same way; when a twin's verdict differs, the result is OPEN (threshold-sensitive). The
  > 34 count (twins 30 / 38) is reported with the same arithmetic, not gated (as P-105).
- **DS2, no-worse anywhere:** P-105's new-cluster rule, applied to the S timed window. Spots are fixed 250 px bins of
  the frame's scrollY. A V cluster is a bin with a dt > 50 frame in ≥ 2 valid V runs. It is NEW when no valid C run
  has one in that bin or a neighbouring bin (±250 px). **Any NEW cluster fails**; the twins 46 / 54 decide
  threshold-sensitivity.
- **DS3, better where we claim it** (the goal numbers: the whole-page scripted scroll, frames > 50 and > 34 ms per
  run; `fixes/DIRECTION.md` "GOAL STATUS"). **BETTER at T ∈ {50, 34}** when every valid V run has fewer frames over T
  than every valid C run (max V < min C, the study's non-overlap rule) and d ≤ −2. The twins (46 / 54; 30 / 38) mark
  it threshold-sensitive when their verdict differs. Not better is "not shown better": it is reported, and it is not a
  no-worse failure.
- Descriptive: a per-bin table of > 50 and > 34 frames per arm (where the remaining slow frames are), the largest dt,
  frames > 100 ms per run, battery °C and Mac load1 per run.

G leg, the page end (`g0b-read.mjs`, P-164's rules word for word, with C = v0):
- **D1:** median V O1.f2 − median C O1.f2 ≤ +4 ms (O1 = the first open after load).
- **D2:** the median over runs of the per-run median dt of all later open-tween frames (700 ms windows), V − C ≤ +4 ms.
- **D3:** the share of those frames over T, T ∈ {34, 30, 38}, V ≤ C.
- Each run's open and close trigger counts must match between the arms. PASS / FAIL / OPEN as in P-160/P-163/P-164.
- **No "better" claim at the end:** g0 gives both arms the original's end. g0.0f's end parts (join-fade,
  logo-close, v3-W, platform corners) are look fixes and memory fixes. Simulator repaints per open frame (g0.0b about 5-6
  against the original's about 20) are context only.
- Descriptive: close tweens, and finger-down frames > 50 and > 34 per run (twins), per arm.

**Block verdict.** PASS when DS1, DS2 and D1-D3 pass. FAIL when any of them fails. OPEN when none fails and one is
threshold-sensitive. Insufficient when a leg has < 3 valid runs per arm after its extra hold. DS3 is reported beside
the verdict ("better at > 50 / > 34: yes / not shown / threshold-sensitive").

**Prediction (frozen with this commit, before any P-165 data).**
- DS1 PASS, about 90 %. Every landed fix since v0 removes work in the scroll; P-105 to P-164 found no S worsening that survived.
- DS2 PASS, about 80 %. A new cluster would need V to add a slow spot that v0 lacks. The likeliest place is the end
  zone, where g0.0f adds the v3-W fills.
- DS3 BETTER at > 50, about 50 %; at > 34, about 65 %. On 10-01 v0 had 5 frames > 50 and 16 > 34 per run (scripted,
  n = 3). Real heat and the 30 ms timer grid may thin the gap; disjoint ranges with n = 4 are a strict test.
- D1 PASS, about 75 %; D2 PASS, about 80 %; D3 PASS, about 75 %. g0.0f opens the original's menu with fewer repaints per
  frame (Simulator), and P-164 found 17 ms tweens with 0 % frames > 34 ms.
- Sentinels pass on the first try, about 60 % (real heat: 10-04 had 41 of 109 hold starts off Serious).
- **Overall PASS, about 55 %.** OPEN (threshold-sensitive) is the most likely other outcome.

**Decisions (proposed; the lead states them before signing):**
- **PASS:** the final build is no worse than the original under real heat, everywhere on the page; DS3 says where it is
  better. The goal check moves on to the follow-ups below.
- **FAIL on DS1 or DS2:** the goal is not met under real heat at the named spot. A W window probe at that spot
  (attribution, Timeline on) comes before any further build; the lead tells the user.
- **FAIL on D1-D3:** the end is slower than the original's under real heat. The suspects are g0.0f's own end parts
  (v3-W first, then join-fade and logo-close), since the menu mechanism is the original's on both arms; the lead decides.
- **OPEN or insufficient:** at most one more block (sequential rule, §5.3); the lead decides.

**Phone time (estimate; real heat needs the phone warmed by use):**

| part | what | estimate |
|---|---|---|
| first heat | pre-warm S runs on B until the start gate reads real Serious | 2-31 min (10-04's four pre-warms: 1.4, 6.6, 19.4, 30.6 min); about 10 if the phone comes warm |
| phone hold 1, S leg | 3 holds: 10 S runs (about 45-60 s each with reload, settle, battery and served reads), 6 gate reads (about 35 s each), the first counted run's profile read (about 25 s), about 70 s hand-over per hold | about 17 min |
| phone hold 2, G leg | 5 holds: 2 warm-ups and 3 counted G runs (about 200 s each on the phone; P-164's one-item holds took 283-292 s with both gates, about 5.7 min with the hand-over), 2 sC | about 31 min |
| phone hold 3, G leg | 5 holds: 5 counted G runs, 2 sC, then the TAIL (0-2 G re-runs plus a closing sC, 3-15 min) | about 35-47 min |
| re-heats | on 10-04, 41 of 109 hold starts were not at real Serious: about 5 of 13 holds need 1-2 pre-warm runs (about 110 s each with the gate) | about 9 min |
| ceiling cooling | about 2 h of use under real heat may reach 44 °C: 0-2 waits of ≤ 10 min | 0-20 min |
| **total** | | **about 110 min expected; about 85 min with a warm phone and no misses, up to about 165 min** |

Each phone hold stays under the `--block` cap of 3600 s in the expected case. Hold 3 with a full TAIL and a cooling
wait can pass it: it then shows OVERDUE and is not killed. All three run back to back. Mac side: every hold is an
exclusive `--no-timing` chrome-measure hold, so Chrome measurements by others wait about 2 h in total, in ~10 min slices.

**Lead signature (2026-10-08 06:08Z, before any P-165 data).** P-165 is signed as drafted (5d6b05f5), profile
real-serious. The proposed decisions above are the lead's decisions. The signature takes effect only when all of these
hold; fix-g0-box checks them itself and records them here before part 1 (no second lead round):
1. The kit's dry run prints `PROG fs 31fc66329daf ok`, and its PIN line names `p129-gates-g0b.mjs`.
2. The served hashes are C 4606120cf392 / 27776f3d4138 and V 30fd80ccbb3f / 1d1e5d62a2c4.
3. `p165-score.mjs` passes its self-test (DS1-DS3 on synthetic runs, including one NEW-cluster and one twin-flip case).
4. Nothing in the kit sets an Xcode condition or `thermal.mjs set` (grep in the commit), and every run passes `--profile real-serious`.
5. The user's console step is answered "ready" before phone hold 1 (posted by fix-g0-box from inside its phone hold; one phone step at a time).
If a condition fails, message the lead with the line; do not run.

**Kit and the signature's conditions (checked by fix-g0-box 2026-10-08 06:16Z, before any P-165 data).**

The kit is in `fixes/g0-box/phone/`, committed with this paragraph (sha256/12):

| file | sha256/12 |
|---|---|
| `p165-run.sh` | 0132f929acb9 |
| `p165-block.sh` | 55ec25c30b71 |
| `p165-hold.sh` | 1451857b284a (after the dry run: a run's own profile refusal, exit 8, now ends the hold VOID TOOCOOL instead of reading as a failed sentinel; dry-run paths unchanged) |
| `p165-serve.sh` | de3381ca66f5 |
| `p165-score.mjs` | ac951bcba999 |
| `p129-gates-g0b.mjs` | b60fb1bcfe8d |
| `p129-read-g0b.mjs` | 9d08b2e66980 |
| `g-fastshort-g0b.json` | 9024b8a6bc1e (compiled 31fc66329daf) |

- **Copies:** the hold and block scripts copy g0b-hold.sh and g0b-block.sh (P-164's lessons kept), with P-116's heat
  pre-warm. The scorer imports P-105's scorer (b9a29ffcc7bb, refused if changed).
- **Servers:** they start in part 1 and keep their ports through part 3, so the warm-ups stay per arm port.
- **Parts:** each part runs detached (`nohup sh fixes/g0-box/phone/p165-run.sh P-165 <n> > out/g0box/p165-part<n>.log
  2>&1 &`, the I-221 workaround, the lead's order), and is watched with `wait.mjs file … --match '^EXIT' --pid`.

| condition | check | result |
|---|---|---|
| 1. dry run `PROG fs 31fc66329daf ok`, PIN names `p129-gates-g0b.mjs` | `CM_DRY=1` run of all 3 parts in a `--no-timing` hold (`out/g0box/p165dry.log`): 14 holds H1-H14, each `HOLD DRY ok` | **ok**: every hold prints `PROG fs 31fc66329daf ok, GESTURE_BUDGET_S 334`; every PIN line names `fixes/g0-box/phone/p129-gates-g0b.mjs=b60fb1bcfe8d` and `p129-read-g0b.mjs=9d08b2e66980`. PLAN lines: S items on the right arm with `--profile real-serious`, C counted runs as heat sentinels, the G items with Timeline on (counted) or off (warm-ups), gates `--expect serious --max-c 44 (no --accept-induced)` |
| 2. served hashes | `p165-serve.sh check` at every part start and before every item | **ok**: B 4606120cf392 / 27776f3d4138, C 4606120cf392 / 27776f3d4138, V 30fd80ccbb3f / 1d1e5d62a2c4 in all 3 parts and all 14 holds |
| 3. `p165-score.mjs --selftest` with a NEW-cluster and a twin-flip case | `node fixes/g0-box/phone/p165-score.mjs --selftest` | **ok**, 8 cases: PASS + BETTER; NEW CLUSTER (V's > 50 frame at y 4100 in every run, none in C within ±250 px: FAIL while DS1 stays no-worse); DS1 twin flip (52 ms frames: WORSE at > 50 and > 46, not at > 54: threshold-sensitive); DS3 twin flip; OPEN by a DS2 twin (a 48 ms cluster); the sentinel chain with re-runs; served and profile voids; G run gates plus a failing sC |
| 4. no thermal condition set; `--profile real-serious` on every run | `grep -n -E "thermal\.mjs set\|rearm\|accept-induced\|FW_PHONE_CONDITION\|Xcode" p165-*.sh`; every `iphone.mjs run\|gesture` line checked for `$PROF` | **ok**: no `thermal.mjs set`, no `rearm`, no `--accept-induced`, no Xcode step. The only hits are `unset FW_PHONE_CONDITION` (block.sh) and the PLAN text. `thermal.mjs clear` runs once before part 1 (run.sh). Every run and gesture line carries `$PROF` = `--profile real-serious`; the only line without it is the compile-only `gesture --dry-run` |
| 5a. first start (06:29-06:35Z), no counted run | part 1, ready step C-115 answered "done" 06:31Z | **BLOCK STOP at H1, no data.** The phone was Nominal at 31.3 °C. Two pre-warm runs added only about 0.35 °C each (31.3 → 32.9 °C). The third gate got no read: its `iphone.mjs open` failed because Safari had 2 pages (preflight TABS, I-037). Also, the kit's one `thermal.mjs clear` exited 1 outside the iphone lease; no condition was on (gates read induced No) |
| kit changes after 5a (before any counted data; the lead's 06:4xZ instructions, no new signature) | 725b3ffb, then the commit with this row: `p165-hold.sh` 0fa89e963ed4, `p165-block.sh` bd89a005ba58, `p165-run.sh` 5fff3a9f92d0; part-1 dry run ok (`HOLD H0h1 DRY ok`, H1-H3 as before) | (1) Park before every gate. A gate with no read gets one retry after a `safari-restart`, else the hold is VOID GATEERR. Preflight TABS (exit 11) posts one close-tabs step from inside the hold and re-runs. (2) The first heat is its own phase before H1: heat holds H0h<k> run pre-warm S runs on B back to back, with the gate after every 3rd run, capped at 60 min (`CM_FIRSTHEAT_MAX` 3600). Past the cap: BLOCK STOP 12, printing the temperature curve, and the lead decides. Item holds keep at most 2 pre-warm runs. (3) `P165_READY=0` restarts part 1 without a second ready step (C-115 was answered) |
| **heat source: live site, uncounted; user T-247** (before any counted data; the lead's instruction, no new signature) | c7abd6fe, then the commit with this row: `p165-hold.sh` 8f369230d56b, `p165-block.sh` 7af5c51546f8, `p165-run.sh` 5fff3a9f92d0 (unchanged); part-1 dry run ok (`PLAN PW heat hold: pre-warm S runs on the live page https://fastwork.com/ …`, `HOLD H0h1 DRY ok`, H1-H3 as before) | Only the heat runs move: every pre-warm run (in heat holds H0h<k> and the up-to-2 runs in an item hold) first opens https://fastwork.com/ and runs `iphone.mjs run --driver scroll --probe std --warmup --profile real-serious` there (uncounted; exit 8 "too cool" is expected and passes). If `run` fails on that page for another reason, it falls back to `iphone.mjs open` + `iphone.mjs scroll --warmup --profile real-serious` on the same page. If the live page does not open, the hold is VOID HEATOPEN (exit 10), and in the first heat that is BLOCK STOP 10. Every gate (on B, after a park), every counted run and the warm-ups wC/wV/WC/WV stay on the mirror ports; served-hash checks unchanged. The live page is a heat source only: no number from it enters any verdict |
| **heat method: heat-fling + heat-method experiment, user T-247 #3 and #7** (uncounted, no validity impact; the lead's instruction, no new signature; installed at a hold boundary during the first heat, after H0h3 started) | 7905475e, then 89d07e6d (fix-heat-fling's `heat-fling.json` 97a18127b6d5, compiled 137ef5c2c60a, 72 strokes, cherry-picked from 55436ec9), then the commit with this row: `p165-hold.sh` e32188383225, `heatread.mjs` 2cb12916dfb8; a hold-only dry run printed `HEAT fling 137ef5c2c60a ok` and `PLAN PW … heat-fling 137ef5c2c60a gesture, page mirror`; an offline check of the page choice (`out/g0box/hpagetest.sh`: alternation, a failed run not counted, faster live chosen, near-equal goes to mirror, no program → live scroll) | (1) Heat runs (heat holds and the up-to-2 pre-warm runs of item holds, so also re-heats between counted holds) are `iphone.mjs open <page>` + `iphone.mjs gesture heat-fling.json --warmup --profile real-serious`. If the program is missing or compiles to another hash, the live-page scroll runs as before. A failed fling falls back to `scroll --warmup` on the same page; it never voids a hold. (2) Heat probe: one `HEATRATE method=<fling\|scroll> page=<mirror\|live> t0 t1 sec rate(°C/min) state0 ok state1` line per heat run. It is printed and appended to `out/p165/heatrate.log`. Battery reads come from `heatread.mjs` (AppleSmartBattery; prints only the temperature) right before the open and right after the run. state0 is the run's own PROFILE read; state1 is the next read (the next run's, or the gate's). (3) Experiment: fling runs alternate mirror (B port) and live, which keeps both in the same temperature band, until each page has 3 runs with a rate. The faster page by median rate then stays for the rest of the block (`out/p165/heat-method.txt`, one `HEATMETHOD` line). Live wins only at > 1.2x the mirror's rate and > 0.05 °C/min more; otherwise mirror (no network, the same page as C). The mirror B port is the default heat page (lead, after de-heat-trace). Live runs only as the experiment's comparison arm. Note that https://fastwork.com/ lands on /selling, not our homepage, so "live" is not the same page. de-heat-trace's past rates (OBSERVED, thin): mirror pre-warm 0.53 °C/min below 34 °C vs live 0.44; live 0.24 at 34-37 °C and about 0.17 above 37; P-164 G holds on the mirror 0.27 at 36.6, 0.13 at 37-40, then a plateau near 41 °C (0.03). If the 60-min first-heat cap hits at Fair, BLOCK STOP 12 reports the curve and the lead decides. First fling run (H0h4, 07:12-07:15Z): mirror, 141 s open plus run, 38.0 → 38.69 °C, 0.294 °C/min, Fair → Serious (real heat). The alternation lagged one run, because the last run's line was pending until its state1. `p165-hold.sh` 5a06cf534342, installed by atomic mv during H0h4, counts the pending line for the alternation; the choice still uses only flushed lines. Reference before the swap: live-page scroll pre-warm took the battery from 32.0 to 36.6 °C in 13.5 min (06:47-07:01Z, gates included, about 0.34 °C/min) |
| **timer-grid gate exit 6 at real Serious (lead ruling 07:2xZ, before counted data; state OBSERVED)** | the commit with this row: `p165-hold.sh` 968dcd71ba21, installed by atomic mv during H0h14 (H0h15 on) | **What happened:** from H0h5 (07:19Z) every gate read real Serious, induced No, but a timer grid of 8 ms (grid30 0.01). That is exit 6, "timer grid disagrees", which the kit voided as a gate-only hold (exit 5) with no heat run. Holds H0h5-H0h14 looped this way while the phone cooled from 40.5 to 38.9 °C. **The lead's data:** real Serious gave a 30 ms grid in all 80 reads on 10-04, and xcode-induced Serious gave 30 today (04:23-05:07Z). In WebKit, Page.cpp:3352 aligns timers to 30 ms when isThermalMitigationEnabled; ThermalMitigationNotifier.mm:40 sets that at thermalState >= Serious in the WebContent process, via NSProcessInfoThermalStateDidChangeNotification (Page.cpp:459 → handleThermalMitigationChange, 3089). Why the WebContent process does not see it here is UNRESOLVED. Hypothesis: Safari has been running since 06:45 at Nominal and missed the change. **Kit:** (1) Once per block, on the first exit 6 with state Serious, induced No and a grid under 25 ms: `iphone.mjs safari-restart`, park, re-gate, logging `GRIDCHECK before/after` (the decisive check). (2) If it is still exit 6 the same way after that, exit 6 counts as PASS for P-165 (`out/p165/grid-accept.txt`). The gate line says "timer grid N ms recorded, not judged". The xctrace state (real Serious, induced No) is the condition, and both arms share it. P-165's result will note "timer grid 8 ms". Exit 6 any other way (for example Fair with a 30 ms grid) still fails. (3) A gate-only VOID hold now runs one fling heat run on the mirror before it ends, so the block never loops without heat. **Result (H0h15 start gate, 07:25Z):** before the restart, Serious, induced No, timer 8 ms, battery 38.5 °C; after it (safari-restart exit 0), gate exit 0 (PASS), Serious, induced No, timer 30 ms (grid30 0.87). The hold's end gate read 30 ms too. So Safari had missed the thermal change (OBSERVED, n=1), and the accept fallback was not used. The first heat ended at 07:27Z (2484 s, 15 heat holds). **Follow-up (lead 07:3xZ), `p165-hold.sh` adf8f3609d41, installed by atomic mv during H1 (H2 on):** the restart and re-gate happen on every such exit 6, not once per block, because the phone can leave Serious and come back in any re-heat. The accept fallback applies only when that gate's own restart still reads under 25 ms. The result reports the GRIDCHECK count (`grep GRIDCHECK out/p165/hold-*.log`) |
| **heat margin (lead 07:3xZ; uncounted heat runs; before any valid counted data)** | `p165-hold.sh` 91242dbd61b1 (my first version: one fling before the start gate under 39.0 °C, never used by a hold), replaced by the lead's rule in the commit with this row: `p165-hold.sh` 0c6280a0e20b, installed by atomic mv during the H1 retry (from the next hold on) | **Why:** in H1 (07:27-07:31Z) the start gate read real Serious at 38.0 °C and the end gate read Fair at 37.9 °C, so the hold was VOID (end gate exit 2) and C1/V2 were lost. The phone sits at the Serious/Fair edge near 38 °C; four S runs on the mirror lost about 0.2 °C. **Signed rule kept:** the gate must PASS at the start and at the end. **Margin:** after a passing start gate, while the battery reads under 39.5 °C (`heatread.mjs`), fling heat runs on the mirror before the first item (uncounted, `--warmup`, profile real-serious, a HEATRATE line each). There is no re-gate; the end gate still decides. That is at most 2 runs in an item hold and up to 6 in a heat hold, so heat holds aim at 39.5 °C, not only at a passing gate. Each run starts only if it (~150 s), the hold's items (S ~75 s, G ~200 s) and the end gate (~60 s) fit in the 600 s hold. The ceiling stays 44 °C. If two holds in a row still void at the end gate, I message the lead with the curve; the next step is then shorter holds of 2 items. **Fix (my error, 07:57Z):** the margin's time rule summed about 200 s per G item, but the item time check uses the G budget (334 s). In H4 (WC) it let a second margin run in (38.8 → 39.2 → 40.3 °C), and WC then failed the time check (VOID time, exit 7, no counted run; the retry started at 40.3 °C). Since `p165-hold.sh` 05d25cfb4355 (installed during the H4 retry), a margin run starts only if elapsed + 160 s + NEED ≤ 600 s. NEED is the largest (estimated time of the items before item i) + (i's budget) + 30 s, the same rule as the item time check. In G holds this allows at most one margin run, or none |
| 5. the user's "ready" step | posted by `p165-block.sh` (`CM_READY=1`, part 1) from inside the phone hold, after preflight: "about 2 hours, don't use the iPhone, keep it plugged in", with `console.mjs wait --until redo` armed in the background | **ok**: C-115 posted from inside the hold, answered "done" 06:31Z, with the redo wait armed. The restarts of part 1 use `P165_READY=0` (no second ready step) |

**Follow-ups (listed only; each is its own ticket after P-165):**
- **A short no-worse check at Fair** (`memory/phone-checks-start-warm.md`: before the goal is called done, the final
  build gets one short no-worse check on a cooler phone). Profile real-fair (`--profile fair`, gate `--expect fair`),
  S leg only, C = v0, V = g0.0f, n = 3 per arm, about 15 min.
- **A finger test by the user** (`memory/perception-tests-touch-ab.md`): a blind swipe A/B on the iPhone, original
  against g0.0f, posted by the phone holder as a console swipe-pair step (the lead sets the order).

**User break in part 2 (user T-248 #3, the lead's instruction; user steps first):** at 08:24Z, on the lead's urgent
instruction, I stopped part 2's runner (SIGTERM to its process group) during H8's EV2 gesture. H4-H7 were VALID; H8 (sC,
EV2) is lost and re-runs. The iphone lease was free at once. The servers kept running in their own process group. Console
step C-116 handed the iPhone to the user ("press Done when you hand it back"). After Done: **part 2b** (`p165-run.sh
P-165 2b`: H8 alone, with a first heat because the phone cooled), then part 3, both detached. Their heat holds re-warm
the phone, and their start gates (with the GRIDCHECK Safari restart) re-check real Serious, so nothing from before the
break is assumed. The stopped H8 has no VALID line, so the scorer reads none of its runs.
Part 2b ran 08:28-08:37Z: one heat hold (82 s), then H8 VALID (327 s). The stopped H8's partial records are kept aside as
`*.prev-H8-*`.

**Ceiling stop in part 3 (lead ruling 08:5xZ):**
- H9 (EC2) was VALID. Its start gate read 39.4 → 39.1 °C, below the margin target of 39.5 °C, so one margin fling ran
  first (39.1 → 39.6 °C). The end gate read 41.1-41.3 °C, Serious.
- H10 (sC, EC3) started Serious at 41.2 °C. Its end gate read **Critical at 41.5 °C**, below the 44 °C battery
  ceiling.
- Three re-gates in a row still read Critical (41.5, 41.3, 41.0 °C), and part 3 ended with BLOCK STOP at H10. The kit's
  ceiling cooling (`wait.mjs phone-temp --below 42`) returned at once, because the battery was already below 42 °C.
  Waiting on the battery temperature does not reach the end of Critical. The first cooling read (09:0xZ) was still
  Critical at **39.2 °C**. In our setup (OBSERVED, cause unknown), the phone's Critical state does not follow the
  battery temperature.
- **Lead ruling:**
  - The ceiling worked as a safety stop. It is not a sentinel failure, so H4-H9 stay valid.
  - Cool with the phone idle, then resume from H10.
  - Margin target 39.0 °C for the rest of P-165 (it was 39.5): no margin fling when the start gate reads 39.0 °C or more.
  - Critical again means BLOCK STOP. The lead then decides between scoring the runs we have (≥ 3 valid per arm per leg,
    the card's minimum) and a later block.
- **Part 3b** (`p165-run.sh P-165 3b`) does this in three steps:
  1. `p165-cool.sh`: Safari parked, no runs. One `thermal-gate.mjs --no-timer` state read every ~3 min, each in its own
     short phone hold, so the lease is free between reads; at most 15 min. It ends when a read is no longer Critical.
  2. Restarts the servers on the block's own ports (`P165_PORTS`; part 3 had stopped them), so the warm-ups stay per
     arm port.
  3. Runs H10-H13 and the TAIL.

### P-165 S leg (complete 07:51Z; final, the block re-score at 09:2xZ gives the same numbers; `p165-score.mjs out/p165`)

All 8 counted S runs are VALID (holds H1-H3, real Serious 38.9-39.8 °C at the gates, heat sentinels C1/C4/C5/C8 pass:
bottom 60 fps, scroll 51.7-52.9 fps). **S verdict: FAIL** (DS2, a new cluster), as signed; the lead's ruling: no
reinterpretation, the card's decision applies (a W attribution probe at each named spot before any further build).

| rule | C (v0) | V (g0.0f) | result |
|---|---|---|---|
| DS1 >50 (twins 46/54) | 5, 4, 5, 6 (median 5) | 4, 3, 3, 6 (median 3.5) | d −1.5: no-worse |
| DS2 new clusters >50 | | V bins 0-249, 250-499, 500-749, 1750-1999, 4500-4749 | **NEW at 0-249 and 4500-4749: FAIL** (the 0-249 cluster stays new at >54, so the FAIL is not threshold-sensitive) |
| DS3 >34 | 20, 22, 27, 18 | 11, 8, 11, 8 | d −11.5, max V < min C: BETTER |
| DS3 >50 | | | not better (d −1.5; threshold-sensitive) |

The two new V clusters, from the run logs' frame lines (OBSERVED, one frame per run):
- **Spot A, the first scroll frame (y 4-11 → 45-62, t+3.1 s):** V2 55, V3 51, V6 60, V7 54 ms. In every V run that frame
  adds `section.hero-track +he-css` (mutations: class 1, style 2; rafJs 7-16). C's first scroll frames are 41 ms, with no
  he-css (it does not exist in v0). C's only bin-0 frames over 46 ms are 47/48 ms in the idle phase.
- **Spot B, y ≈ 4525 (t+8.8 s):** the `div.start-selling-platform-secure +is-play` frame in both arms. C 42, 39, 42, 42 ms;
  V 51, 52, 49, 51 ms: the same trigger, about 10 ms slower in V.
- Both arms keep the about 110 ms frame at y ≈ 1850. V loses C's frames at 688-738, 1200-1250, 1600-1680 and 2600-2700.

### P-165 result (block 2026-10-08 06:2x-09:2xZ, real Serious; card signed c31626f2)

**Block verdict: FAIL**, by DS2 alone (the S leg's two new clusters, above). Every other rule passes:

| rule | C (v0) | V (g0.0f) | result |
|---|---|---|---|
| DS1, S frames >50 per run | 5, 4, 5, 6 | 4, 3, 3, 6 | d −1.5: no-worse (twins agree) |
| DS2, S new clusters | | | **FAIL**: new at 0-249 (spot A, `+he-css`) and 4500-4749 (spot B, `+is-play`); not threshold-sensitive |
| DS3, S frames >34 per run | 20, 22, 27, 18 | 11, 8, 11, 8 | **BETTER** (d −11.5, max V < min C) |
| DS3, S frames >50 | | | not shown better (d −1.5; threshold-sensitive) |
| D1, G O1.f2 | median 46.5 (16-54) | 16.5 (16-17) | −30 ms: PASS |
| D2, G later open tweens, median dt | 38.25 (37-44) | 17 (17-17) | −21.25 ms: PASS |
| D3, G open-tween share >34 / >30 / >38 | 0.58 / 0.65 / 0.50 | 0 / 0 / 0 | PASS at all three |
| triggers per G run | 13 opens, 12 closes ×4 | 13 opens, 12 closes ×4 | match |

- **Validity:**
  - All counted runs are valid: S 4+4, G 4+4 (EC1-EC4, EV1-EV4; run gates G1-G6 all `ok`).
  - All 9 heat sentinels pass (C1, C4, C5, C8 and five sC; battery at their starts 38.9-41.2 °C).
  - No Low Power Mode. Served hashes are checked before every item.
  - Every VALID hold's start and end gates read real Serious. The voided tries (H1 Fair, H10 Critical) were run again.
- **G descriptive** (no "better" claim at the end, as the card says): V's open and close tweens run at 17 ms in every run;
  C's open tweens run at 37-44 ms, its close tweens at 58-72 ms. The prediction for D1-D3 was PASS; the size of the gap
  is new.
- **Scorer fix after the block, before any G reading:** the first `p165-score.mjs` (ac951bcba999) matched only a bare
  `GATES <run> E ok`. `p129-gates-g0b.mjs` prints `ok idle <s>`, its documented format, so the first score read every G
  run as "gates missing" and printed an empty GRUNS. The fix (`gatesOf`, selftest case 9) parses that line and nothing
  else; no rule changed. The S numbers are byte-identical before and after. Scorer now 49e398dcdfcf.
- **What happened during the block:**
  - The user break in part 2 (T-248 #3; H8 run again).
  - The H10 ceiling stop and part 3b (above).
  - A time VOID of H10 after part 3b's restart: the start pre-warm from Fair plus the sC pushed EC3 past 600 s. The hold
    re-ran whole and was VALID.
  - H4 voided for time once (the margin NEED fix).
- **Timer grid (gate exit 6):** 3 starts read an 8 ms timer grid at real Serious (H0h15, H1, H10). Each time a Safari
  restart brought 30 ms back and the gate passed. No exit 6 was accepted unrestarted (`grid-accept.txt` is empty).
- **Heat method (uncounted; HEATRATE lines; user T-247 #7):**
  - Mirror fling: 6 runs, 0.17-0.50 °C/min (median 0.25).
  - Live fling: 3 runs, 0.17-0.39 °C/min (median 0.38).
  - The starting states differ. Live ran twice from Fair (0.39, 0.38); mirror once (0.29). Serious starts: mirror 0.17-0.50
    (n 5), live 0.17 (n 1). So no same-band comparison reaches 3 per arm: **not decided**, and the mirror stays the default
    (the lead's tie rule).
- **Thermal ceiling (OBSERVED, in our setup, cause unknown):** the phone read Critical at a 39.1-41.5 °C battery, and
  Fair at 38.0 °C 3 min later. Battery °C alone does not predict Critical, so a ceiling wait on `phone-temp` cannot end
  it; read the state.
- **Decision, as signed:** FAIL means no landing claim of "no worse everywhere" for g0.0f. The S clusters go to P-166
  (W attribution at spots A and B, arms v0 / g0.0e / g0.0f plus the three knock-outs). The G leg needs no follow-up for
  no-worse.

## P-166 (attribution ticket draft for P-165's two S clusters; written before any P-166 data; not signed, not run)

| | |
|---|---|
| question | Which part of the stack owns each new V frame of P-165's S leg: v0 → g0.0e (the best build before v3-W, with hero-exit-threaded's CSS mode and the earlier g0 parts) → g0.0f (= g0.0e + v3-W)? Spot A: the first scroll frame (y ≈ 0 → 60, `+he-css`). Spot B: the `+is-play` frame at y ≈ 4525 |
| arms + pins | **v0**: the baseline snapshot as P-165's C (`site-pretty`, plain), JS 4606120cf392 / CSS 27776f3d4138. **g0.0e**: `out/g0box/g00e` (BEST_BUILDS' g0.0e), JS 5c39f7a96e41 / CSS d4e684032482. **g0.0f**: `out/g0box/snap4/V`, JS 30fd80ccbb3f / CSS 1d1e5d62a2c4 (P-165's V). Each arm on its own port, served hashes checked before every run |
| known before data | `he-css` is in g0.0e's JS already (8 hits in both g0.0e and g0.0f; the CSS-mode block, JS 4835-4875: "heSc goes live on the first scroll event … s() writes the inline value …, then .he-css arrives"), i.e. hero-exit-threaded's CSS mode, not v3-W. So spot A is expected to show in g0.0e as well; spot B has no prior owner. **map-s-clusters (read-only helper, via the lead; inferred unless marked OBSERVED):** spot A: (1) heUp/heSc (patch about 2409-2416) adds `.hero-track.he-css`, which switches on `animation-timeline: --hero-exit` for 4 orbit cards, `.hero-copy` (fade + transform) and `.scroll-float` (blur + fade-up) (CSS patch 292-330; topic hero-exit-scroll-timeline, in g0.0c and later; g0.0e's JS is byte-identical); (2) the fwWCIO IntersectionObserver (patch 1436-1447) flips `data-fw-wc` on 2 elements 2 rows after the slow frame in 4/4 V runs (OBSERVED correlation); (3) v3-W's fills are least likely (present from mount; nav `--morph` stays 0 under scrollBy). Spot B: (1) the platform-idle G1 secure-card glint (patch 577-670, JS about 3076-3090: clip-path `path()` + an svg transform keyframe, started by `.is-active`); (2) a `data-fw-wc` flip at or next to the slow frame in 4/4 V runs (OBSERVED; element and value unknown); (3) the corners IO (patch 3134), less likely |
| knock-out arms (built 08:0xZ as snapshot copies in `out/g0box/p166/<arm>/` by `phone/p166-build.py` (run from the worktree root), which checks both bases' pins; diagnostic only, never candidate builds) | **e-nohe** (JS 779fc9f36fc1 / CSS d4e684032482): g0.0e with `heCss = false &&` prepended (JS 4872), so the CSS mode is off and the baseline JS writer runs, as on Chrome; spot A. **f-nowc** (JS 30fd80ccbb3f / CSS 0e2950034f24): g0.0f with `.start-selling [data-fw-wc="0"]` dropped from the `will-change: auto !important` rule (CSS 12283), i.e. `fixes/n10-c-wc-windows-off`'s change; both spots. **f-noglint** (JS 30fd80ccbb3f / CSS f5239e3f348d): g0.0f plus one appended rule `.start-selling-platform-secure-network-dash-glint.is-active svg { animation: none !important; }`, so the glint does not animate; spot B. Each is one change on its base (`diff` shows only that change) |
| kit | `phone/p166-serve.sh` (6 servers, plain http, `--latency 150`, served hashes checked against the pins above), `phone/p166-sim.mjs` (stage 1: Simulator, functional session, counts only; per arm and spot a fresh load and the W step pattern under a Timeline on its own inspector connection; a MutationObserver stamps every class / `data-fw-wc` change into the Timeline), `phone/p166-read.mjs` (stage 1 reader: the spot frame's record counts and flips, never durations; `--selftest` ok). Stage 2 uses `iphone.mjs run --driver window --timeline <out.json>` (I-247, ts-247, after it lands) |
| stages | **1. Simulator counts (functional session, counts only, no timing):** per arm (v0, g0.0e, g0.0f and the 3 knock-outs) and spot, the W step pattern with a Timeline on the Simulator: the spot frame's RecalculateStyles / Layout / Paint record counts and the elements styled. Knock-outs that remove the spot frame's extra records name the candidate owner. **2. Phone W block (this card, timing):** per spot 3 arms, picked from stage 1: the first build that shows the frame, its predecessor, and the knock-out that removes it in stage 1 (spot A expected: v0 · g0.0e · e-nohe; spot B expected: g0.0e · g0.0f · f-noglint, or f-nowc if stage 1 points there). If stage 1 points elsewhere, the arms change before signing |
| driver | **W** (`iphone.mjs run --driver window --probe std`): spot A `--from 0 --to 750` (the first 3 steps of 250 px; the first step is S's first frame); spot B `--from 4000 --to 5000` (jump, 1 s settle, idle 3 s, steps 4000 → 4250 → 4500 → 4750, where S met the frame at 4520 → 4590). `--hold 2`, `--sentinel 3` (the W sentinel: jump to the bottom and hold; it judges v0 runs as the heat sentinel) |
| Timeline | On in every counted stage-2 run: `iphone.mjs run --driver window … --timeline <out.json>`. The lead chose option (a): incident I-247, toolsmith ts-247 adds the flag, reusing gesture-run's recorder (Page.disable → Page.enable → Timeline.start, re-armed per load). It is measurement code with a covering test; the lead runs the full npm test after P-165. Stage 2 starts only after it lands; this card names the tools sha it ran on. ts-247 delivered it as commit db884e9d (not yet on main). Usage: `node tools/iphone.mjs run --driver window --probe std --from <y0> --to <y> --label <l> --timeline out/iphone/<l>-tl.json`. The Timeline starts after the reload, the probe install and the settle, and stops after the result read. The file holds {syncT, syncTL, recs, offsetMs, end}, kind 'run-timeline'; Timeline ms = probe page ms + offsetMs. The probe's fwr:<phase>:start|end marks appear as TimeStamp records. The run record carries meta.timeline. These runs are attribution runs: they never pool with Timeline-off counted runs (§5.5) |
| order | Per spot, 1 uncounted warm-up per arm's port, then 9 counted runs, 3 per arm, in a rotated Latin square over the spot's 3 arms (X Y K · Y K X · K X Y; for example v0 g0.0e e-nohe at spot A). Every counted run has Timeline on (after (a)). The block ends with a Timeline-off v0 control sentinel |
| profile | **real-serious** if the phone is still at real Serious after P-165 (gate as P-165: `thermal-gate --expect serious --max-c 44`, park before every gate, GRIDCHECK restart on exit 6, heat margin 39.5 °C, fling heat runs on the mirror). Otherwise **xcode-serious**, for attribution only. Profiles never pool, and P-166 never pools with P-165 |
| readout per spot and arm | The spot frame's dt (median of 3, twins 46/54), its RenderingFrame segments (Script, Layout, Paint+Composite, Other) and gap − frame, and the frame's mutations and prev. **Owner** = the first arm in v0 → g0.0e → g0.0f where the spot frame is > 50 ms in ≥ 2 of 3 runs and a Timeline segment accounts for the added ms (≥ 2/3 of the dt difference to the previous arm, median). Neither arm passes that: "not attributed", stated as such. Spot A, g0.0e: the owner is hero-exit-threaded's CSS-mode switch. g0.0f only: v3-W |
| pre-data check | Simulator, class flips and served hashes only, never timing: a W `run` is refused in a functional (shared) session, so this uses a normal `sim.mjs session` in a chrome-measure hold (`--max-seconds 420`; only the flip and its y are read, never dt). For each arm and spot, the W step pattern crosses the class flip inside the timed window (spot A: `+he-css` on the first step in g0.0e/g0.0f, no he-css in v0; spot B: `+is-play` between 4500 and 4750 in all three) and the served hashes match. Any spot that does not cross is re-placed before signing |
| phone time | About 20-25 min per spot (3 warm-ups, 9 counted runs of about 30 s each, a gate per hold, about 3 holds), so about 50 min for both spots, plus heat if the phone has cooled |
| decision | Spot owner g0.0e (hero-exit-threaded): a follow-up on hero-exit-threaded's first-scroll switch (for example, switch at idle, not on the first scroll), not v3-W's. Spot owner v3-W: v3-W gets a revision before landing. Not attributed: the lead decides |

### P-166 stage 1 (Simulator counts, 2026-10-08 09:4x-10:1xZ; counts only, no timing; `p166-read.mjs out/p166/sim`)

- **Setup:** 6 arms × 2 spots, one run each, plus a second run of every arm at spot A. Tools at a0a1050c: stage 1 uses
  only `lib/wip.mjs` and `sim.mjs open`, which db884e9d did not change. Served hashes match the pins.
- **Kit fixes made during stage 1, before the table was read:**
  - The page drops the `?p166=` query from `location`, so the first session found no tab. The tab is now matched by its
    port, and the run proves the load is its own by the navigation entry, which keeps the URL that was opened.
  - Each step takes ~75 s, so a step starts only with 85 s of budget left (235 s per session). The 300 s cap killed one
    run.
  - **The reader's spot-A rule changed** from "the first moving rAF frame" to **"the first frame past y 30"**. he-css
    goes live at y > heTop + 30 (JS 4908-4909, heTop 0). In the Simulator the W step's smooth scroll starts slowly
    (y 2-7), so the first moving frame comes before the switch. The phone's S step reached y 45-62 in its first frame.
    The `+he-css` stamp now lands in the read frame in every arm that has he-css.

Counts in the spot frame (records in that RenderingFrame; S = RecalculateStyles, L = Layout, P = Paint):

| arm | spot A run 1 (S/L/P) | spot A run 2 | A flips | spot B (S/L/P) | B flips |
|---|---|---|---|---|---|
| v0 | 4 / 1 / 25 | 3 / 0 / 0 | none | 5 / 2 / 11 | +is-play |
| g0.0e | 2 / 1 / 4 | 2 / 1 / 4 | +he-css | 2 / 0 / 7 | +is-play |
| g0.0f | 2 / 1 / 28 | 2 / 1 / 4 | +he-css | 1 / 0 / 7 | +is-play |
| e-nohe | 2 / 1 / 2 | 2 / 1 / 2 | none (wc flips only) | 1 / 0 / 7 | +is-play |
| f-nowc | 2 / 1 / 4 | 2 / 1 / 6 | +he-css | 2 / 0 / 7 | +is-play |
| f-noglint | 3 / 1 / 6 | 2 / 1 / 4 | +he-css | 2 / 0 / 7 | +is-play |

**What stage 1 says** (OBSERVED, Simulator counts, n = 1-2):
- **The large paint counts are timer phase, not the build.** v0's 25 and g0.0f's 28 at spot A became 0 and 4 in run 2.
  They are 18×37 px clips in a grid of small cells: a timer repaint that happened to land in that frame.
- **Spot A:** every arm with he-css does 2 styles, 1 layout and 4-6 paints in the crossing frame. e-nohe does the same
  minus 2 paints. g0.0e and g0.0f are identical there. v0 does 3-4 styles.
  - None of this is more main-thread work than v0. So the phone's 51-60 ms (V) against 41 ms (C) is not in these
    counts. It must be in their durations, or off the main thread (layer commit or raster for the new he-css
    animations).
  - The knock-out that removes `+he-css` (e-nohe) is still the one that isolates the switch.
- **Spot B:** all five g0 arms do less work than v0 (1-2 / 0 / 7 against 5 / 2 / 11), and the two f knock-outs change
  nothing. Stage 1 points at neither the glint nor will-change. The phone's ~10 ms extra in V is again not in the
  counts.
- **Consequence:** stage 2 (phone W with Timeline durations) is the decisive step at both spots. Counts cannot name the
  owner.

**Stage-2 arms, proposed for the signature** (the card says the arms change before signing when stage 1 points
elsewhere):
- **Spot A:** v0 · g0.0e · e-nohe, as expected. g0.0e carries the he-css switch alone (stage 1: g0.0e = g0.0f at A), and
  e-nohe removes only the switch.
- **Spot B:** **v0 · g0.0e · g0.0f** in place of g0.0e · g0.0f · f-noglint. Stage 1 gives no knock-out a role at B, so
  the first question is which build brings the extra ~10 ms. The phone S data compared only v0 and g0.0f. If g0.0f is
  the owner, a knock-out follows in a second block (the sequential rule allows 2 per question).

**Lead signature for stage 2 (2026-10-08 10:06Z, after stage 1, before any stage-2 data).** Signed with the proposed arm
change: spot A = v0 · g0.0e · e-nohe, spot B = v0 · g0.0e · g0.0f (Latin square, 3 counted per arm, 1 uncounted warm-up per
port). The decision row stands. Amendments: profile real-serious with P-165's final heat rules (margin target 39.0 °C, no
margin at a start gate >= 39.0 °C, GRIDCHECK Safari restart on every exit 6, cooling by thermal state on Critical); every
counted run uses `iphone.mjs run --driver window --timeline` from main db884e9d (rebase first). Self-checked conditions,
recorded here before the first counted run (no second lead round):
1. The kit's dry run prints the served hashes of all 5 stage-2 arms (v0, g0.0e, g0.0f, e-nohe) and the tools head >= db884e9d.
2. One uncounted `--timeline` run on the Simulator writes a Timeline file with RenderingFrame records and meta.timeline.
3. The user's console step is answered (posted from inside the phone hold; one phone step at a time).
4. Part runners start detached (nohup), as in P-165.

**Stage-2 kit and the self-checks (fix-g0-box, 10:0x-10:1xZ, before the first counted run).**

The kit lives in `phone/`; all of it is new for stage 2 except `p166-serve.sh`, which only gains arm B.

| file | what it does |
|---|---|
| `p166-serve.sh` | gains arm **B**: the plain baseline on its own port, used as the heat page and the gate's timer page, as P-165's B |
| `p166-hold.sh` | one hold, copied from P-165's final `p165-hold.sh`. Gate without `--accept-induced`, GRIDCHECK restart on every exit 6, heat-fling runs on the mirror's B port with a HEATRATE line each, margin 39.0 °C (none at ≥ 39.0). W items: warm-ups `<S>w<a>` (Timeline off), counted `<S><a><n>` with `--timeline`, the Timeline-off v0 control `<S>s0`. v0 counted runs are judged as heat sentinels, and served hashes are checked before every item |
| `p166-block.sh` | one part. Ceiling cooling is by state: a `--no-timer` read every ~3 min, ≤ 15 min, else BLOCK STOP 6. A failing sentinel is BLOCK STOP 8 (the lead decides; simpler than P-165's TAIL voiding). `TAIL<S>` re-runs the spot's RERUN-NEEDED items once, then runs the control sentinel |
| `p166-run.sh` | part A = spot A with the user's ready step and a first heat; part B = spot B. Each part is one phone hold with `--block P-166` |
| `p166-simtl.sh` | the Simulator `--timeline` check (condition 2 and the card's pre-data check) |
| `p166-wread.mjs` | the stage-2 reader: spot frame, its segments, the owner rule. Written before any stage-2 data; `--selftest`: 6 cases ok |

Spot frames in the reader:
- **A:** the first frame whose yEnd passes 30, the stage-1 rule.
- **B:** the `+is-play` crossing frame.

Segments are the Timeline records' self time inside the frame interval (t − dt, t]: Script, Layout (with style), Paint+Composite, and Other. The reader also gives gap − frame.

Spot orders (Latin square per spot):

| part | spot | holds | order |
|---|---|---|---|
| A | A | H1-H4 | warm-ups, A01 Ae1 An1 · Ae2 An2 A02 · An3 A03 Ae3, TAILA |
| B | B | H5-H8 | the same with f in place of n |

Self-checks against the four conditions above:
1. **OK.** The dry run of both parts (`CM_DRY=1`) printed:
   - the tools head 41b8b179, which contains db884e9d (`git merge-base --is-ancestor`);
   - the served hashes of every stage-2 arm: B and v0 4606120cf392 / 27776f3d4138, g0.0e 5c39f7a96e41 / d4e684032482, e-nohe 779fc9f36fc1 / d4e684032482, g0.0f 30fd80ccbb3f / 1d1e5d62a2c4;
   - the plan of every hold.
2. **OK.** One uncounted W run per spot with `--timeline` on the Simulator (`p166-simtl.sh`, 10:08-10:11Z; a normal session, because a functional session refuses W):

   | run | Timeline | `meta.timeline` | spot frame |
   |---|---|---|---|
   | g0.0e, spot A | kind run-timeline, 563 records, 517 RenderingFrame | stopped, no errors | `+he-css` at y 61, step 1 |
   | v0, spot B | 653 records, 652 RenderingFrame | stopped, no errors | `+is-play` at y 4599, inside the 4500-4750 step |

   The reader found both spot frames and their Timeline segments. No dt was read.
3. Checked at the start of part A: the ready step is posted from inside the phone hold, and no hold starts before its Done.
4. **OK.** Parts start with `nohup sh fixes/g0-box/phone/p166-run.sh P-166 A|B`, detached.

**Lead amendment 10:4xZ, user T-247 #12 (before any counted stage-2 data).** Stage 2 runs under **tool-serious**, not
real-serious. Spots and arms are unchanged.

What changed and why:
- **Profile.** The kit uses P-164's induced Serious through our tool. There is no manual Xcode step (user T-228 #15), no heat phase, no margin, and no cooling by state.
- **Reproduce rule (new, checked before the owner rule).** A spot is "reproduced under induced Serious" when the median spot-frame dt of its test arm is at least v0's median + 6 ms. The test arm is g0.0e at spot A and g0.0f at spot B.
  - If a spot is not reproduced, it reads "not reproduced under induced" and gets no owner. It then needs a real-heat block later (the lead's call).
- **No pooling.** Profiles never pool. P-166 numbers compare only within this block, never with P-165's.
- **What was already run.** Part A had started under real-serious. C-119 (the ready step) was Done at 10:41:12Z, the link re-check passed (attach #150), and the first heat hold H0h1 had begun (gate: Fair, 37.3 °C). I stopped it at about 10:43Z, inside H0h1. No counted or warm-up W run had started. Its logs are kept aside in `out/p166ph-realserious-1043Z` and enter nothing.

Kit changes (copied from P-164's `g0b-block.sh` condition handling):

| file | change |
|---|---|
| `p166-run.sh` | runs the block with `CM_THERMAL=serious`, with no first heat. Right after `lock.mjs run iphone` returns, whatever its exit code, it runs `node tools/thermal.mjs clear` (not in the block's exit trap). `P166_READY=0` skips the ready step when the user has already answered it |
| `p166-block.sh` | exports `CM_PROFILE=tool-serious FW_PHONE_CONDITION=tool`. One owner of the condition, `iphone.mjs rearm --settle 120` (Safari parked first). It runs:<br>• at the part start, after the preflight and the ready step;<br>• after a re-plug;<br>• when a hold voids at its start gate (exit 3 Critical, or exit 2 too cool, meaning the condition is gone) or on a profile misfit; that hold then runs again, with at most 2 re-arms per hold.<br>A rearm exit ≠ 0 is BLOCK STOP 10 (message the lead). Removed: the first heat, heat holds, ceiling cooling by state, and the heat-rate log |
| `p166-hold.sh` | both gates run `thermal-gate.mjs --expect serious --max-c 44 --accept-induced`. Every run passes `--profile serious` with `FW_PHONE_CONDITION=tool`; the hold refuses without it. Removed: pre-warm, margin, and GRIDCHECK. Kept:<br>• the link and attach check;<br>• served hashes before every item;<br>• heat sentinels on the v0 counted runs and the control `<S>s0`;<br>• `--timeline` on counted runs;<br>• the time guard;<br>• pmcheck |
| `p166-wread.mjs` | validity requires profile `serious` (a real-serious record is void here). Adds the reproduce rule and a `REPRODUCE <spot>` line. `--selftest`: 10 cases ok (new: not reproduced at +5 ms, reproduced and owned at +7 ms, exactly +6 ms counts as reproduced, a real-serious record is void) |

Dry run of part A (`CM_DRY=1`) after the change:
- every hold prints `HOLD DRY ok`;
- tools head 6240f85e contains db884e9d;
- served hashes are as in condition 1;
- PLAN lines show `--profile serious` and gates `--accept-induced`.

**Lead ruling 11:1xZ (after BLOCK STOP 8 in H1; no further round).**

What happened in H1 (11:03-11:09Z, tool-serious; both gates PASS, Serious, induced, 36.0-36.3 °C):
- The kit judged the counted, Timeline-on W run A01 as a heat sentinel. It read bottom 56 / scroll 51.5 fps and failed the 58 fps bottom.
- That judgement was against protocol §5.2 ("Timeline blocks"). The sentinel is an uncounted Timeline-OFF control run. A Timeline-on run may stand in only when it passes, and its failure voids nothing.
- A W run's "bottom" phase is the window end (y 750 at spot A), not the page bottom. H1's own Timeline-OFF v0 warm-up Aw0 also reads 56 fps in that phase, so that phase measures the page there, not heat.

The ruling:
- H1 stays VALID: A01 and Ae1 count.
- Counted W runs are never judged as sentinels.
- The sentinel is `<S>sC`: one uncounted Timeline-OFF S control run on v0 (`iphone.mjs run --driver scroll --probe std --profile serious --arm C --heat-sentinel`, to the page bottom, budget 100 s). It runs at each part's start after the warm-ups, and in the TAIL. Only a failing sC stops the block (BLOCK STOP 8).

New holds:

| part | holds |
|---|---|
| A2 (resume from H2) | `H2:AsC,An1,Ae2,An2,A02  H3:An3,A03,Ae3  H4:TAILA` |
| B | `H5:Bw0,Bwe,Bwf,BsC  H6:B01,Be1,Bf1,Be2  H7:Bf2,B02,Bf3  H8:B03,Be3  H9:TAILB` |

The Latin square order is unchanged. Both dry runs printed `HOLD DRY ok` for every hold.

Our runner had already ended the condition with `thermal.mjs clear` when part A ended, so part A2's part-start `iphone.mjs rearm` sets it again. H1's results (spot-frame dt, OBSERVED, not read against any rule yet): v0 17 ms (A01) and g0.0e 42 ms (Ae1).

Conditions 1, 2 and 4 stand as checked above. For condition 3, C-119 was answered before the kit was ready. The console refused a late ack on the answered step, so the lead tells the user that the test starts a few minutes later.

### P-166 stage 2 result (phone, tool-serious, W driver with Timeline; 2026-10-08 11:03-12:31Z; `p166-wread.mjs out/p166ph`)

**Owner at spot A: g0.0e. Owner at spot B: g0.0e.** The extra phone time in both of P-165's S clusters comes from
g0.0e, not from v3-W (g0.0f). At both spots the extra time is WebKit Paint+Composite inside the rendering frame. Both
spots are reproduced under induced Serious, and neither verdict is threshold-sensitive (the 46/54 twins agree). All
numbers are OBSERVED in our setup and compare only within this block: profiles never pool, so they never compare with
P-165.

Validity:
- All holds H1-H9 are VALID, and all 27 counted runs are valid (profile serious, no drift, served pins, a Timeline
  file each).
- All 4 heat sentinels passed: the Timeline-OFF S runs on v0, AsC in H2 and H4 and BsC in H5 and H9. Each read bottom 60
  fps and scroll 51.0-52.3 fps, at battery 33.4 / 35.2 / 35.7 / 37.0 °C.
- H1 ran under the first tool-serious kit and is VALID by the lead ruling 11:1xZ.
- The two v0 runs whose frame read over 50 ms are listed below.

Before A2 ran, it needed five restarts, all before any hold and with nothing measured:
- I-249: a transient RSD close in rearm.
- I-250: the xctrace thermal read hung twice; fixed on main in 98762cb1.
- WDA could not start twice after the re-plug. The cause was a stale CoreDeviceService; the lead restarted it (C-124).
- Holds H2-H9 ran on tools 98762cb1, which changes only rearm's thermal read, not the W driver or Timeline. H1 ran on
  7b5ab208.

| spot | arm | spot-frame dt (ms) per run | median | > 50 | > 46 / > 54 | Script | Layout | Paint+Composite | Other | gap − frame |
|---|---|---|---|---|---|---|---|---|---|---|
| A | v0 | 17 / 59 / 16 | 17 | 1/3 | 1 / 1 | 0.5 | 15.7 | 0.2 | 0.6 | 0.1 |
| A | **g0.0e** | 42 / 55 / 61 | **55** | 2/3 | 2 / 2 | 1.4 | 13.6 | **31.8** | 7.8 | 0.2 |
| A | e-nohe (knock-out) | 44 / 53 / 61 | 53 | 2/3 | 2 / 1 | 1.3 | 14.2 | 29.1 | 4.7 | 0.1 |
| B | v0 | 46 / 44 / 48 | 46 | 0/3 | 1 / 0 | 0.8 | 1.7 | 41.2 | 1.9 | 0.1 |
| B | **g0.0e** | 73 / 69 / 70 | **70** | 3/3 | 3 / 3 | 1.4 | 4.7 | **59.5** | 4.2 | 0.1 |
| B | g0.0f | 74 / 72 / 68 | 72 | 3/3 | 3 / 3 | 1.5 | 4.7 | 60.7 | 4.9 | 0.1 |

Segment columns are medians, in ms, of each run's Timeline self time inside the spot frame.

**Spot A** (the first frame past y 30, the he-css crossing):
- **Reproduce rule:** g0.0e's median is 38 ms above v0's (the rule needs ≥ 6), so the spot is reproduced.
- **Owner rule:** v0 → g0.0e is +38 ms, of which Paint+Composite is +31.6 and Other +7.2. That is ≥ 2/3 of the rise, with 2/3 runs > 50 ms, so the owner is g0.0e.
- **Knock-out:** e-nohe has no `+he-css` crossing in its spot frame, yet costs the same (median 53 ms, ≤ 50 in only 1/3). So the knock-out does not remove the frame: the paint at spot A is g0.0e's other change, not the he-css switch.
- **v0's A02:** its 59 ms frame lies almost entirely outside any RenderingFrame (union 1.5 ms, gap − frame 57.5 ms). It is a gap with no rendering work in the frame, cause unknown; it doesn't move the median.

**Spot B** (the `+is-play` frame):
- **Reproduce rule:** g0.0f's median is 26 ms above v0's, so the spot is reproduced.
- **Owner rule:** v0 → g0.0e is +24 ms, of which Paint+Composite is +18.3 (≥ 2/3 of 24 = 16), with 3/3 runs > 50 ms, so the owner is g0.0e. g0.0e → g0.0f adds only +2 ms (Paint+Composite +1.2), so g0.0f is not an owner.
- **Crossing position:** the `+is-play` crossing lands at y ≈ 4608 on g0.0e/g0.0f and at y 4562 on v0. Both are inside the same 4500 → 4750 step, about 15 frames apart within its smooth scroll. The stage-1 Simulator counts did not show this difference.

How this fits the earlier data:
- Stage 1's Simulator counts saw no main-thread difference at either spot. That fits: the added time is in WebKit's paint/composite inside the rendering update, not in Script or Layout. Counts of records cannot show durations.
- What g0.0e changes besides he-css is the next question. The lead has a ranked candidate list for spot A, and its knock-outs are pre-staged for a P-167 card.

**Timeline detail: the cost is the Composite step, not Paint** (OBSERVED; `out/g0box/tlcomp.mjs`, `tlslow.mjs`; finding posted):
- In each spot frame the time is the `Composite` record's own time, and its `Paint` children are small:

| spot | arm | Composite | Paint children |
|---|---|---|---|
| A | v0 | 0.2 ms | none |
| A | g0.0e / e-nohe | 26-36 ms | 25-27 paints, 1.2-2.5 ms in total |
| B | v0 | 40-43 ms | ≤ 3 ms in total |
| B | g0.0e / g0.0f | 58-63 ms | ≤ 3 ms in total |

- The records carry clip rects only, no layer names and no layer sizes. At spot A the clips cover about the full viewport (≈ 336k px²). At spot B they cover the platform section.
- So the extra time is WebKit's layer flush, not repaint area. That WebKit's `Composite` record is the layer flush is still to be confirmed against WebKit source.
- Over the whole spot-A window, spot A is a moved hitch, not an added one (whole-window reader `p167-wread.mjs` on P-166's runs, medians):

| window | arm | frames > 34 | > 50 | max dt | Composite sum | where the big Composite is |
|---|---|---|---|---|---|---|
| A 0-750 | v0 | 7 | 3 | 76 | 542 | y ≈ 690-740 (A02: a 186/231/178 ms burst) |
| A 0-750 | g0.0e | 5 | 1 | 55 | 301 | the first step (y 43-70) |
| A 0-750 | e-nohe | 4 | 1 | 53 | 297 | the first step |
| B 4000-5000 | v0 | 1 | 0 | 46 | 1230 | at `+is-play` |
| B 4000-5000 | g0.0e | 1 | 1 | 70 | 368 | at `+is-play` |
| B 4000-5000 | g0.0f | 1 | 1 | 72 | 353 | at `+is-play` |

  - At spot A, g0.0e is not worse over the window. At spot B the one `+is-play` frame gets 24 ms longer, while total Composite time over the window is lower on g0.0e.

**Simulator layer census for P-167** (lead 12:3xZ; counts only, a mechanism check, not a verdict; `p167-sim.mjs`, one load per arm, LayerTree.layersForNode on `<html>`; two shared sessions, because the first hit its 300 s cap after 3 arms):

| arm | top (y 0) | after the A steps (y 750) | after the B steps (y 5000) | deferred sections A / B |
|---|---|---|---|---|
| v0 | 109 layers, 12.5 MB | 105, 74.7 MB | 29, 82.9 MB | 2 / 4 |
| g0.0e | 160, 28.8 MB | 156, 108.2 MB | 51, 71.0 MB | 0 / 2 |
| ko1 (accent idle frames) | 160, 28.7 MB | 169, 96.5 MB | 51, 71.0 MB | 0 / 2 |
| **ko2 (no early un-skip)** | **142**, 28.6 MB | **136**, 108.5 MB | **41**, 71.0 MB | 2 / 4 |
| ko3 (no will-change windows) | 169, 28.7 MB | 179, 81.8 MB | 54, 71.0 MB | 0 / 2 |
| ko123 | 143, 28.7 MB | 153, 81.8 MB | 46, 71.0 MB | 2 / 4 |

- Only ko2 moves g0.0e's layer count toward v0's: −18 at the top, −20 after A, −10 at B. It also restores v0's deferred sections.
- ko3 goes the other way: without the windows every will-change element keeps its layer.
- ko1 changes nothing in the counts.
- No KO closes the gap: ko2 still has +33 layers at the top. g0.0e's extra memory at the top (28.8 vs 12.5 MB) is unchanged by every KO, so it sits in layers of the lead's candidates 4-8 (countdown will-change, the morph panel mounted at idle, ...).
- By the lead's rule (a KO that cuts the layer count toward v0's goes into P-167), **P-167's knock-out arm is ko2**. ko123 mixes ko2's cut with ko3's addition.
- The `layerTreeDidChange` count is not usable: WebKit sent one event per window. It seems to send one until the layers are requested again; that is OBSERVED, not checked against source.

## P-167 (phone card DRAFT for the lead's signature; written before any P-167 data; not signed, not run)

| item | content |
|---|---|
| question | Does g0.0e's longer Composite at spot B (the `+is-play` frame, window max 46 → 70 ms in P-166) come from its extra layers via the early un-skip of deferred sections (KO2)? And is spot A's first-step burst a moved hitch (v0's y ≈ 700 burst) rather than added cost? |
| arms | **v0** (control, plain baseline, JS 4606120cf392 / CSS 27776f3d4138) · **g0.0e** (JS 5c39f7a96e41 / CSS d4e684032482) · **k = e-ko2**: g0.0e with `fwKick` a no-op and `cE` re-deferring as the baseline (JS 43e9c65489bf / CSS d4e684032482). Built by `p167-build.py`, diagnostic only, never a candidate. `P167_K=ko123` would swap in ko123 if the lead prefers it. |
| windows | A: 0 → 750 (W `--from 0 --to 750`); B: 4000 → 5000 (W `--from 4000 --to 5000`). Both in one ticket, as part A then part B (one phone hold each, as P-166). |
| profile | **tool-serious**, as P-166 stage 2 (`iphone.mjs rearm`, gates `--accept-induced`, `--profile serious`, `FW_PHONE_CONDITION=tool`; `thermal.mjs clear` after each part). Profiles never pool: P-167 compares only within its own block, never with P-165 or P-166. |
| driver | W with Timeline on every counted run (`iphone.mjs run --driver window --probe std --hold 2 --sentinel 3 --timeline`). One uncounted W warm-up per arm port per part. |
| order | Latin square, 3 counted runs per arm per window. Part A: `H1:Aw0,Awe,Awk,AsC,A01  H2:Ae1,Ak1,Ae2,Ak2  H3:A02,Ak3,A03,Ae3  H4:TAILA`. Part B: the same with B (H5-H9). |
| sentinels | as P-166 (lead ruling 11:1xZ): only `<S>sC`, one uncounted Timeline-OFF S run on v0 (`--heat-sentinel`, bottom ≥ 58 and scroll ≥ 44 fps), at each part's start after the warm-ups and in the TAIL. A failing sC is BLOCK STOP 8. Counted Timeline-on runs are never judged as sentinels. |
| metric (primary) | whole window (`p167-wread.mjs`), the move phase [scroll start, hold end) of each run: frames > 34 and > 50 (twins 30/38 and 46/54), max dt, Composite sum and the largest Composite inside one frame. The idle phase is reported apart. Per arm: medians of 3. |
| metric (secondary) | P-166's binned spot frame (`p166-wread.mjs` rules: A = the first frame past y 30, B = the `+is-play` frame) |
| rules (written before data) | **B, reproduce:** g0.0e's median max dt ≥ v0's + 6 ms (else "not reproduced", no KO verdict).<br>**B, KO2 removes the cost:** k's median max dt ≤ v0's + 6 ms **and** k's median > 50 count ≤ v0's.<br>**B, partial:** k's median max dt at least 6 ms below g0.0e's but not "removes".<br>**B, no effect:** otherwise.<br>A rule is threshold-sensitive when the 46/54 twins give another verdict.<br>**A, moved hitch:** "g0.0e is no worse over window A" when its median > 34 count ≤ v0's and its median max dt ≤ v0's + 6 ms; the card lists each arm's slow frames with y and Composite ms (v0's y ≈ 700 burst vs g0.0e's first-step burst). k is read the same way.<br>**Mechanism line (both windows):** k's largest Composite median moves toward v0's. |
| budget | P-166's parts took 15 min (A2, 3 holds) and 23 min (B, 5 holds) once running. P-167 is 2 parts of 4-5 holds each, so about 45-50 min of phone time, not 30. The lead decides whether to cut it to window B only (about 25 min). |
| kit | `fixes/g0-box/phone/p167-{build.py,serve.sh,hold.sh,block.sh,run.sh,sim.mjs,wread.mjs}`. hold, block and run are P-166's final kit with only names, paths and arms changed. `p167-wread.mjs --selftest`: 4 cases ok. Dry runs of both parts (`CM_DRY=1`, k = ko123 at the time): every hold `HOLD DRY ok`, tools head 58bbc3b3 contains db884e9d, served hashes of B/v0/e/k ok. |
| conditions before the first counted run | (1) a dry run with `P167_K=ko2` prints its pins; (2) the user's ready step is answered (posted from inside the phone hold); (3) parts start detached, with the watchdog (`out/g0box/watchdog2.sh`); (4) USB link, WDA and the thermal read work (P-166's restarts). |

### P-167 result (phone, tool-serious, W + Timeline; 2026-10-08 12:57-13:40Z; `p167-wread.mjs out/p167ph`)

**Signed by the lead 12:55Z, budget 50 min, B before A.** The card above is unchanged (ed2a1924), with k = e-ko2, and the user said ready at 12:55Z.

**Run log.**
- Part B ran first: H5-H9.
- Part A ran second: H1-H4.
- All 9 holds were VALID; 18 counted runs, with no re-runs and no BLOCK STOP. The only thing the kit repeated was the start-gate rearm.
- Sentinels (`sC`, Timeline off, v0) all passed:

  | sentinel | battery | bottom fps | scroll fps |
  |---|---|---|---|
  | BsC H5 | 35.0 °C | 60.1 | 51.1 |
  | BsC H9 | 37.2 °C | 60.0 | 52.1 |
  | AsC H1 | 36.8 °C | 60.0 | 52.0 |
  | AsC H4 | 37.8 °C | 60.2 | 52.7 |

- After part A, `thermal.mjs clear` stopped our `set` (pid 86227). Its confirming re-read hit an RSD GOAWAY (an I-249-class transient). The condition's state was re-read in a separate hold; see "Notes" below.
- Phone time: about 43 min, inside the 50 min budget.
- Every number below is OBSERVED, in our setup, within this block; nothing is pooled with P-165 or P-166.
- The metric is the card's primary one: the move phase is [scroll start, hold end). Each cell is the median of 3 runs.
- On the y range: the W runs scroll to y ≈ 995 (A) and ≈ 5240 (B) before the 2 s hold, so "window A 0-750" covers y 0-1000 in practice.

**Window B (4000 → 5000).**

| arm | > 34 (30/38) | > 50 (46/54) | max dt | Composite max | Composite sum | spot frame (binned, secondary) |
|---|---|---|---|---|---|---|
| v0 | 1 (1/1) | 0 (0/0) | 46 (46/52/44) | 42.3 | 1234 | 46 |
| g0.0e | 1 (1/1) | 1 (1/1) | 72 (72/76/69) | 63.2 | 370 | 72 |
| e-ko2 | 1 (1/1) | 1 (1/1) | 69 (69/68/71) | 59.9 | 361 | 69 |

- **Reproduced:** 72 ≥ 46 + 6.
- **KO2: no effect.**
  - "Removes" fails: the max is 69 > 52, and the > 50 count is 1 vs v0's 0.
  - "Partial" fails: 69 is only 3 ms below g0.0e's 72.
  - The 46/54 twins give the same verdict: not threshold-sensitive.
- **Mechanism line:** k's Composite max moves 3 of the 21 ms toward v0, so the early un-skip is not what makes spot B's flush longer.
- Every slow move frame is the `+is-play` frame:
  - v0 at y 4562-4572;
  - g0.0e and e-ko2 at y 4588-4618.
- Idle: g0.0e and e-ko2 add one 37-39 ms frame at y 4000 (Composite 29-35 ms) in every run; v0 has none.

**Window A (0 → 750, scrolls to y ≈ 995).**

| arm | > 34 (30/38) | > 50 (46/54) | max dt | Composite max | Composite sum | spot frame (binned, secondary) |
|---|---|---|---|---|---|---|
| v0 | 7 (9/4) | 2 (3/1) | 61 | 41.3 | 560 | 36 |
| g0.0e | 5 (6/4) | 3 (3/2) | 60 | 32.8 | 305 | 57 |
| e-ko2 | 6 (6/5) | 3 (3/2) | 59 | 33.7 | 303 | 58 |

- **Moved-hitch rule as written: g0.0e is no worse over window A.** Its > 34 count is 5 ≤ 7 and its max is 60 ≤ 61 + 6. Both twins agree (6 ≤ 9, 4 ≤ 4). e-ko2 reads the same.
- **The pass depends on the 2 s hold.**
  - Each v0 run has 2-3 frames > 34 in the hold at y 999-1000: Composite 37-39 ms + Layout 13 ms, or a 26-31 ms Layout.
  - g0.0e and e-ko2 have none there.
- Scroll phase alone, per run:

  | arm | > 34 | > 50 |
  |---|---|---|
  | v0 | 2, 5, 4 | 1, 1, 1 |
  | g0.0e | 5, 4, 5 | 2, 3, 3 |
  | e-ko2 | 6, 5, 6 | 3, 3, 3 |

  Pooled > 50 is 3 / 8 / 9. Over the scrolling itself, g0.0e has more long frames than v0.

**Slow frames by y** (Timeline self time inside each frame, `out/g0box/tlmid.mjs`).

| arm | first step, y 20-71 | y 280-555 | y 678-745 | y 914-937 | hold, y 999-1000 |
|---|---|---|---|---|---|
| v0 | 36-41 ms in 2 of 3 runs (Composite 15-30 / Layout 16-28) | 35-44 ms, 2 of 3 runs, **Layout 24-29**, no Composite | 47-49 (Composite 24 + Layout 13-15) and **58-61 (Composite 36-38 + Layout 12)** | — | 52-57 (Composite 37-39 + Layout 13-15), plus 35-42 Layout frames |
| g0.0e | **52-59 ms, every run (Composite 30-31 + RecalculateStyles 9 + Layout 5)** | **two frames per run, 37-63 ms, Layout 21-24 + 15-16 (≈ 37-40 ms)**, no Composite | 49-55 (Composite 21-25 + Layout 16-17) | 38-39 (Composite 30) | none |
| e-ko2 | 56-65 ms, every run (Composite 31-39 + RecalculateStyles 9) | two frames per run, 36-59 ms, Layout ≈ 22-40 | 49-54 + 38-39 | 37-40 | none |

**Reading.**
- **Composite: a moved hitch (OBSERVED).**
  - v0's largest flushes are at y ≈ 735 and in the end hold.
  - g0.0e's are at the first step and at y ≈ 930.
  - g0.0e's Composite sum is about half of v0's (305 vs 560 in window A; 370 vs 1234 in window B). The cost is concentrated in fewer, larger flushes, the largest being the `+is-play` frame at spot B.
- **Layout: new cost (OBSERVED).**
  - At y 280-555, g0.0e and e-ko2 run two Layout records of about 21-24 + 15-16 ms in one frame, twice per run.
  - v0 has one such frame in 2 of 3 runs, with 24-29 ms of Layout.
  - KO2 leaves this unchanged, so it does not come from the early un-skip. It is also no layer cost.
  - This is what makes g0.0e's > 50 count higher than v0's in the scroll phase.
  - The next question for g0.0e at the top is which layout roots these two records cover. That needs a Chrome/Simulator layout probe, not a phone block.
- **KO2 is ruled out for both spots.** The census candidates ko4 and ko5 (`p167b-build.py`) target the remaining layers and memory at the top. They do not target this Layout cost.

Data: `out/p167ph/wread.json`, `out/p167ph/runs/{w,tl}-*.json`, `out/g0box/p167-part{A,B}.log`. `fixes/g0-box/results.json` key `p167`.

### After P-167: layer census per element, and the Layout frames at y 280-555 (Simulator counts plus the P-167 phone Timeline; no new phone runs)

**Layer census** (`p167-sim.mjs` with `P167_DESCRIBE=1`, `out/p167/sim2`; Simulator, counts only).

| arm | top layers | top MB | spot B layers | spot B MB |
|---|---|---|---|---|
| v0 | 111 | 12.5 | 29 | 67 |
| g0.0e | 160 | 28.9 | 51 | 71 |
| e-ko2 | 138 | 28.7 | 41 | 71 |
| e-ko4 (strip/cell will-change auto; pixels change) | 71 | 28.4 | 49 | 71 |
| e-ko5 (no idle __mnt) | 148 | 12.8 | 49 | 71 |
| e-ko245 | 38 | 13.0 | 41 | 71 |

- **Top, g0.0e − v0 = +49 layers, +16.2 MB.**
  - The countdown: 88 `span.cell` + 8 `span.strip` layers replace v0's 80 `span.face` layers (+16 layers, +0.2 MB).
  - The morph panel, which the idle `__mnt` mounts at y 0, adds about 15 MB: morph-col-track 3 layers / 7.5 MB, morph-center 5.6, morph-footer 1.3, veil 0.7, top-nav-bar 0.7.
  - Its subtree adds about 20 more zero-MB layers (platform stage, artboard, row titles, invoice card).
  - ko5 brings top memory back to v0's.
- **Spot B, g0.0e − v0 = +22 layers, +3.8 MB.**
  - The MB: secure-network shield 1.5, row titles 0.9 + 0.6, network face 0.8.
  - ko2 removes 10 zero-MB layers (zero-mark, people, pain-sticky, commission, fee). These are the un-skipped sections behind. Removing them does not change the 70 ms Composite (P-167 B).

**Layout at y 280-555** (phone, the P-167 Timeline, `out/g0box/tllay.mjs`, `tlio.mjs`; OBSERVED).

| arm (window A, move phase) | Layouts ≥ 5 ms per run | Layout sum per run | median Layout | frames with 2+ Layouts |
|---|---|---|---|---|
| v0 | 39 / 41 / 42 | 536 / 557 / 580 ms | 12.1-12.5 ms | 3 / 5 / 6 |
| g0.0e | 10 / 8 / 9 | 175 / 128 / 143 ms | 15.3-16.7 ms | 1 / 0 / 2 |
| e-ko2 | 9 / 11 / 10 | 162 / 180 / 181 ms | 13.3-16.3 ms | 1 / 2 / 3 |

- **g0.0e does about 4x less Layout than v0, but each Layout costs more.**
  - The pairs left near the W steps (y ≈ 250-320 and ≈ 500-555) take 37-40 ms in one frame, and those are the extra > 50 frames.
  - v0 has a pair at the same place (A02 y 249: 15.8 + 12.8 ms), but it is cheaper.
- **What comes before each pair.** In every g0.0e/e-ko2 run, the `fwWC` IntersectionObserver callback (JS 2741/2742, `setAttribute('data-fw-wc')`) runs 1-2 frames before the pair. This is the will-change window, rootMargin 50 %.
  - v0 has no fwWC.
  - The frame logger's MutationObserver does not count `data-fw-wc`, so the frames looked mutation-free.
- **WebKit source** (WebKit main f9dcd0ee):
  - A will-change change by itself yields only RecompositeLayer (`Source/WebCore/style/StyleDifference.cpp` 269-272; `rendering/RenderElement.cpp` 348-351).
  - But `will-change: transform` makes an element with `z-index: auto` use z-index 0 (`style/StyleAdjuster.cpp` 391-410, `shouldTreatAutoZIndexAsZero` … `willChange().canCreateStackingContext()`).
  - A flip of `hasAutoUsedZIndex` returns Layout (`StyleDifference.cpp` 428-429).
  - The path is CONFIRMED from source. That it is what happens on our page is inferred, not observed.
- **Simulator** (`p167-layout.mjs`, one load per arm, counts only, `out/p167/layout`):

  | arm | big Layouts (> 10 ms) | frames with 2+ big Layouts |
  |---|---|---|
  | v0 | 33 | 8 |
  | g0.0e | 10 | 3 (y 250, 485, 615) |
  | e-ko2 | 15 | 4 |
  | e-ko3 (fwWC a no-op) | 11 | 1 (y 599) |

  - ko3 keeps single Layouts at y 267-474 but loses the y 250 and y 485 pairs in this one load. That points at fwWC, but one load per arm decides nothing.
  - In the Simulator, Layout ms does not separate the arms (v0 and g0.0e are both 18-22 ms), so the higher per-Layout cost is seen only on the phone. Its cause is UNRESOLVED: candidates are the bigger tree that `__mnt` mounts (ko5) and the un-skipped sections.
- **Correction (14:1xZ, finding F-352): the fwWC link above is REFUTED for y 250-555.**
  - Source: `p168-wc.mjs`, Simulator, counts only, `out/p168/wc`.
  - The elements that flip there are only `article.orbit-card` (position absolute, z-index 1/2) and `div.start-selling-profile-shell` (z-index 0/2, contain: paint). Their used z-index cannot flip, so the WebKit path does not apply to them.
  - The control decides it:

    | arm | data-fw-wc flips | Layouts ≥ 5 ms per load | frames with 2+ |
    |---|---|---|---|
    | g0.0f, 2 loads | 6 | 10 / 9 | 2 / 2 |
    | g0.0g | 6 | 12 | 4 |
    | f-ko3 (fwWC a no-op) | 0 | 13 | 5 |

  - On the phone the IO came 1-2 frames before the pair only because the orbit-cards leave their ±50 % window at the same W step boundaries where every arm, v0 included, lays out.
  - The WebKit path stands only for static `z-index: auto` targets: `.start-selling-platform-card` and the platform tracks, at y ≈ 4150-4400.

## P-168 (phone card DRAFT for the lead's signature; written before any P-168 phone data; not signed, not run)

| item | content |
|---|---|
| question | **Window A:** are g0.0f's scroll-phase long frames at y 250-555 the costlier Layouts of a bigger layout tree? The test arm f-cv25 has no idle un-skip, and it keeps the idle-mounted morph panel out of layout until its trigger. **Window B:** does a constant stacking context on the fwWC targets (g0.0g) shorten the `+is-play` frame? There, platform-card and the platform tracks are the only fwWC targets whose data-fw-wc flip can change the used z-index, which WebKit answers with Layout. |
| arms | **Part A:** v0 (control; JS 4606120cf392 / CSS 27776f3d4138) · g0.0f (JS 30fd80ccbb3f / CSS 1d1e5d62a2c4) · **f-cv25** = g0.0f + ko2 (no idle un-skip; cE re-defers as the baseline) + the idle mount kept, with `html:not([data-fw-cv-live]) .start-selling-morph-panel { content-visibility: hidden }`. The attribute is set and latched by a dN effect on the original mount trigger `s(b) || s(E)` (#platform zone reached, or morph > 0.001). JS b700ddaf88b4 / CSS fa5888cfa299. **f-cv25 moves the panel's render cost (layout, paint, layers) to that trigger**, near the platform section, before the morph. It needs a morph-start check (M driver) later, not in P-168. The diagnostic f-ko25 (no idle mount at all; JS 120386db2e02) is not in the block (`P168_K=fko25` would swap it in): ko5 brings back the 40-75 ms mount task, see below.<br>**Part B:** v0 · g0.0f · **g0.0g** = g0.0f + `.start-selling [data-fw-wc] { isolation: isolate }` (JS 30fd80ccbb3f / CSS 2390e4715327; a candidate).<br>Built by `p168-build.py` and served by `p168-serve.sh` (arms B v0 f fcv25 g; fko25 only if named). If de-offscreen points that way, the lead may name g0.0g+ko25 for part B instead (it would need a build). **f+B (de-offscreen KO B) is not in P-168**: it goes to a later block, after a proposal decision (see "Composite count" below). The kit can still run it in part B on the lead's word: `P168_KB=fB` for both parts (JS 30fd80ccbb3f / CSS cafb80014f69). |
| windows | A: 0 → 750 (the W runs scroll to y ≈ 995). B: 4000 → 5000. One ticket, two parts, one phone hold each. The order is the lead's; the kit defaults to A then B (`P168_FIRST` / `P168_LAST`). |
| profile | **tool-serious**, as P-166 stage 2 and P-167 (`iphone.mjs rearm`, gates `--accept-induced`, `--profile serious`, `FW_PHONE_CONDITION=tool`; `thermal.mjs clear` after each part). Compared only within P-168. |
| driver | W with Timeline on every counted run (`iphone.mjs run --driver window --probe std --hold 2 --sentinel 3 --timeline`), plus one uncounted W warm-up per arm port per part. |
| order | Latin square, 3 counted runs per arm per window, the P-167 layout. Part A: `H1:Aw0,Awe,Awk,AsC,A01  H2:Ae1,Ak1,Ae2,Ak2  H3:A02,Ak3,A03,Ae3  H4:TAILA`. Part B: the same with B (H5-H9). In the item names, `e` is the g0.0f slot (it keeps P-167's letter) and `k` is the part's test arm. |
| sentinels | as P-166/P-167: only `<S>sC`, an uncounted Timeline-off S run on v0 (`--heat-sentinel`, bottom ≥ 58 and scroll ≥ 44 fps), at each part's start after the warm-ups and in the TAIL. A failing sC is BLOCK STOP 8. |
| metric (primary) | **the scroll phase** [scroll start, scroll end) of each run: frames > 34 and > 50 (twins 30/38 and 46/54) and max dt; per arm, the median of 3. |
| metric (secondary) | the card-P-167 move phase (scroll plus the 2 s hold) with the same counts; Layout records ≥ 5 ms per run (count, sum, median, frames with 2+) and Composite max/sum from the Timeline; P-166's binned spot frame. |
| rules (written before data) | **A, layout-tree:** f-cv25 "removes the extra scroll-phase long frames" when its median > 50 ≤ v0's **and** its median Layout record ≤ v0's + 2 ms; "partial" when its median > 50 is at least 1 below g0.0f's; otherwise "no effect". A verdict is "threshold-sensitive" when the 46/54 twins give another one.<br>**A, reproduce first:** g0.0f's median scroll-phase > 50 ≥ v0's + 1 (else "not reproduced", no f-cv25 verdict).<br>**B, g0.0g:** "shorter" when g0.0g's median max dt is ≥ 6 ms below g0.0f's; "no effect" when it is within ±6 ms; "worse" when it is ≥ 6 ms above. Also report whether g0.0g's > 34 / > 50 medians are ≤ g0.0f's.<br>**Mechanism lines:** (A) f-cv25's median Layout ms moves toward v0's; (B) g0.0g has no Layout record in the `+is-play` frame, or a shorter one. |
| budget | about 45-50 min of phone time (P-167's two parts took 43 min). Part A alone is about 22 min, part B alone about 25 min. |
| kit | `fixes/g0-box/phone/p168-{build.py,serve.sh,hold.sh,block.sh,run.sh}`. hold, block and run are P-167's kit generated by `out/g0box/mk168kit.mjs` (only names, paths and arms change; letter `e` = g0.0f, `k` = `P168_K`, set per part by run.sh: A → fcv25, B → g). Read-out: `p167-wread.mjs out/p168ph --arms 0,e,k` plus the scroll-phase split (`out/g0box/phase167.mjs`, to be folded into a p168 reader). |
| conditions before the first counted run | (1) dry runs of both parts (`CM_DRY=1`) print every pin; (2) the user's ready step is answered; (3) parts start detached with `out/g0box/watchdog2.sh`; (4) USB link, WDA and the thermal read work. |
| what ko5 changes for the user | The idle mount (`__mnt`, JS 14516-14540 in g0.0f) mounts the end-of-page morph panel (image columns, second countdown, CTAs) once the page is idle after load, invisible and inert. Without it, the panel mounts when `#platform` enters its 200 % zone. That mount was a **40-75 ms task at Chrome 6x inside a scroll frame** (the code's own note, perf(morph-panel-lazy-mount)). The menu itself has no first-open lag either way: it is mounted long before the user reaches the end. So a ko5-like fix trades the top-of-page layout cost for that mid-scroll task. It needs another form, e.g. keep the idle mount but skip the panel's layout until it is needed (`content-visibility: hidden` on the mounted panel, lifted when the morph starts). That form is f-cv25 above (lead 14:3xZ). |

### P-168 evidence before the card (Simulator and Chrome, counts and pixels only; no phone)

**Tree and layer census at the top** (`p168-tree.mjs` v2, `out/p168/tree2`; 3 fresh loads per arm). Values are listed per load. The Layout counts and the Simulator ms come from the W-like steps 0 → ~1150.

| arm | top layers | top MB | DOM elements | rendered at top | rendered after the steps | Layouts ≥ 1 ms | Layout sum (Sim ms) | frames with 2+ Layouts ≥ 5 ms |
|---|---|---|---|---|---|---|---|---|
| v0 | 105 / 105 / 105 | 12.2 / 12.2 / 12.2 | 1334 | 905 / 905 / 905 | 905 / 905 / 906 | 32 / 34 / 29 | 604 / 679 / 603 | 6 / 8 / 9 |
| g0.0f | 162 / 162 / 162 | 28.1 / 27.9 / 27.9 | 1584 | 1584 / 1584 / 1584 | 1584 | 12 / 13 / 12 | 204 / 224 / 213 | 2 / 4 / 1 |
| f-ko25 | 129 / 129 / 129 | 12.8 / 13.0 / 13.4 | 1387 | 936 / 936 / 936 | 1023 | 15 / 15 / 13 | 298 / 289 / 258 | 4 / 4 / 4 |
| f-cv25 | 130 / 130 / 130 | 12.8 / 12.8 / 12.8 | 1584 | 937 / 937 / 937 | 1024 | 19 / 15 / 15 | 390 / 299 / 292 | 5 / 5 / 4 |

- **f-cv25 matches f-ko25 at the top**: +1 layer, the same memory, the same rendered tree. The panel (197 elements) is in the DOM; its 196 descendants are skipped by `content-visibility: hidden`. Against v0 this is +25 layers, +0.6 MB, +32 rendered elements.
- **g0.0f renders the whole page from the top.** All 5 sections are un-skipped, plus the 197-element panel: 1584 rendered elements vs v0's 905, and it does the fewest Layouts.
- **f-ko25 and f-cv25 un-skip sections during the steps** (936 → 1023 rendered), as the baseline's deferral does. They do 15-19 Layouts vs g0.0f's 12.
- **Window A tests a trade-off:** a smaller tree, so cheaper Layouts on the phone (the hypothesis), against a few more of them. The Simulator does not separate Layout ms between arms (all 19-21 ms median), so only the phone can answer.

**Pixel gates at rest** (`gates/px-{chrome,sim}.mjs`, four loads A, V, A2, V2; stops 0 / 250 / 500 / 1500 / 3000 / 4600; T2 = `gates/t2.mjs`):

| V vs A = g0.0f | Chrome 430x932 | Simulator 430x775 |
|---|---|---|
| g0.0g | 0 CSS px² past the A/A band at every stop (consistent differences up to 13 levels at y 500 / 1500, inside A/A) | 0 at 5 stops; y 1500: one cluster of 57 CSS px², max 23 levels, under `section.feed > span.record`. Within T2 (23 < 64, 515 px < 2000, 0.02 %). |
| f-cv25 | 0 CSS px² past the A/A band at every stop (only y 1500 differs, 195 px at 1 level) | 0 at 5 stops; y 1500: 2 clusters of 1 CSS px² each, under the people section's community pill (bbox 48-96 x 608-656 CSS px), max 222 levels (`t2.mjs`: edge 222, flat 19). By the letter **T2 fails** (edge 222 > 128) on that 1 px² spot. Simulator A/A differs on 5.3-6.0 % of the frame at every stop (6.0 % at y 1500). **Re-check (y 1500, fresh loads, plus an f vs f A/A in the same session):** f vs f-cv25 has a consistent 37 CSS px² spot, max 240 levels. f vs **f, the same build**, has one too: 2 CSS px², max 233. Both sit in the same place, the pill's avatar row (bbox 64-176 x 608-656). The crops of the four loads (`out/g0box/p168/pill-y1500-f-vs-cv.png`, A / V / A2 / V2) show the avatar carousel at a different phase in every load, A against A2 included: the freeze does not stop it. So the spot is the carousel's phase, not f-cv25, and the same-build A/A fails T2 there too. Outside the pill, f-cv25 is exact at y 1500 and at the other 5 stops. **Verdict: f-cv25 is pixel-identical except for the unfrozen carousel**, which the gate cannot judge (`px-sim-2026-10-08T14-59-04-513Z`, `…14-59-54-463Z`). |

Files: `out/g0box/p168/px-*/px.json`.

**Re-gate of f-cv25 with the avatar carousel frozen** (lead 15:2xZ, while C-126 waits; `PX_CAROUSEL=freeze` in both gates, one shared slot each).
- **How the carousel is frozen.** Its loop (JS ~12379-12413 in g0.0f) advances only after `setTimeout(<helper>, 800)` and `setTimeout(<helper>, 220)`. The helper's text occurs once in the bundle. The gate drops exactly those timers, installed right after load at y 0, where the row is inactive. Every other timer runs.
- **Proof it held.** Every load recorded 1 stalled timer and the same slot classes at y 1500.

| check | Chrome 430x932 | Simulator 430x775 |
|---|---|---|
| g0.0f vs f-cv25, 6 stops | 0 consistent CSS px² at every stop (max 1 level) | 0 at y 250 / 500 / **1500** / 3000 / 4600. y 0: 18 CSS px², edge 187 (T2 fails by the letter, see below) |
| g0.0f vs g0.0f A/A, y 1500 | 0 | 0 consistent (1 px² beyond A/A, not repeated) |

- **The y 1500 spot is gone** once the carousel is frozen. It was the carousel's position, as the same-build A/A had suggested.
- **The new y 0 spot is the animated hero glyph** between "What" and "can" (screenshot x 179-221, y 210-257; crops `out/g0box/p168/hero-y0-f-vs-cv-carfrozen.png`).
  - The two f-cv25 loads, V and V2, are identical there.
  - The two **g0.0f** loads, A and A2, differ from each other: 2064 px over 8 levels, max 207.
  - "Consistent" only means both g0.0f loads differ from f-cv25, each at its own glyph phase.
  - The control's glyph phase varies between loads; this is not f-cv25. The earlier unfrozen runs had y 0 clean (`px-sim-2026-10-08T14-43-38-105Z`).
- **Verdict:** f-cv25 is pixel-identical wherever both controls agree. Before it lands as a build, the glyph needs the same treatment: frozen, or the y 0 stop repeated until the two control loads agree. Files: `px-mobile-2026-10-08T15-17-25-251Z`, `px-mobile-2026-10-08T15-19-31-340Z`, `px-sim-2026-10-08T15-21-34-248Z`, `px-sim-2026-10-08T15-23-35-754Z`.

**Composite count, windows A and B** (lead 14:5xZ; `p168-comp.mjs`, Simulator Timeline, 3 loads per arm, counts and Simulator ms only, no timing claim). Window A: W-like steps 0 → ~1000. Window B: jump to 4000, 3 s, then steps 4000 → 5000. Each cell is the min-max over the 3 loads. Arms: f = g0.0f, f+B = g0.0f + KO B, f+C = g0.0f + KO C, g = g0.0g.

| window | arm | frames | Composite sum ms | Composite max ms | max frame ms (y) | Layouts |
|---|---|---|---|---|---|---|
| A | f | 176-182 | 841-877 | 102.6-113.0 | 125.8-139.9 (y 599-835) | 13-17 |
| A | f+B | 177-180 | 835-920 | 88.6-123.6 | 110.5-137.6 (y 601-828) | 11-16 |
| A | f+C | 180-185 | 799-856 | 84.9-111.0 | 115.1-131.8 (y 601-831) | 11-16 |
| A | g | 170-182 | 860-927 | 70.8-130.0 | 101.7-148.3 (y 598-828) | 11-17 |
| B | f | 204 | 541-555 | 62.0-64.2 | 81.3-83.3 (y 4514) | 0-2 |
| B | f+B | 202-204 | 531-547 | **58.2-60.9** | **77.3-79.5** (y 4513-4514) | 1 |
| B | f+C | 195-205 | 506-719 | 61.2-84.0 | 79.6-102.3 (y 4505-4514) | 1 |
| B | g | 203-207 | 517-581 | 62.3-73.3 | 80.8-91.9 (y 4501-4513) | 0-1 |

- **Window A:** every arm overlaps f on every column. Neither KO B nor KO C changes the Simulator's Composite work at the top, so f+C has no case for window A.
- **Window B:**
  - f+B is the only arm whose ranges clear f's: Composite max −2.8 ms (median 60.4 vs 63.2) and max frame −3.2 ms (78.7 vs 81.9), 3 of 3 loads. Its Composite sum is within noise (531-547 vs 541-555).
  - In every arm the worst frame is the same one, at y 4501-4514.
  - g0.0g shows no Simulator signal here (it overlaps f). It stays in P-168 as the lead decided: its question (isolation on the fwWC boxes) is for the phone's Layout and Composite path, which the Simulator does not time.
- **Decision: f+B is not in P-168 window B. It goes to a later block.** Reasons:
  1. It is not pixel-identical. With KO B, the paused col-track columns restart from 0 when the menu opens (de-offscreen), so f+B is a proposal under the pixel rule (memory "illusions must be pixel-identical"). A phone gain block for it should come after the user's decision on that proposal, not before.
  2. The Simulator effect is small (−3 ms on a ~80 ms frame, about 4 %) and sits in one frame per run. On the phone that may or may not cross a >50 / >34 threshold. It is worth one phone question of its own, not a swap that would cost g0.0g's question.
  3. Swapping it in would change part B's arm after the card was drafted, with no Simulator reason to drop g0.0g: g0.0g is no worse than f on the Simulator either.
  The kit keeps the option (`P168_KB=fB`) if the lead decides otherwise.

### P-168 result (OBSERVED, within the block; signed d7bee250, GO 15:2xZ after the user's ready step C-126)

- **Runs.** Part A ran 15:28-15:48Z, profile tool-serious.
  - Holds H1-H4 all valid, no re-runs.
  - Heat sentinel AsC passed at the start (bottom 60.1 / scroll 51.6 fps, battery 34.8 °C) and at the end (60.0 / 52.3 fps, 37.1 °C).
- **Deviations from the card** (neither touches a counted run):
  - (1) `P168_READY=0`: C-126 was the ready step (condition 3), so the kit posted no second one.
  - (2) Part A started with plain `nohup`, without `out/g0box/watchdog2.sh` (condition 3). The watchdog only prints stall warnings; part A had no stall. Part B ran with it.
- **Reader:** `phone/p168-wread.mjs`, committed (859d765e) before any run was read. It fixed one definition the card leaves open: "median Layout record" = per run, the median of the Layout records ≥ 5 ms in the scroll phase; per arm, the median of the 3 runs. Data: `out/p168ph/wread-A.json`.

**Window A** (steps 0 → 750, W runs reach y ≈ 750-930; scroll phase primary; medians of 3 runs, per-run values in brackets)

| arm | > 34 (30/38) | > 50 (46/54) | max dt ms | move > 34 / > 50 | Composite sum / max, move | Layouts ≥ 5 ms: n / sum / median ms | frames with 2+ |
|---|---|---|---|---|---|---|---|
| v0 | 4 (4/3) [5, 3, 4] | 1 (2/1) [2, 1, 1] | 57 [64, 57, 54] | 7 / 3 | 529 / 41 | 12 / 177 / 12.3 | 4 |
| g0.0f | 5 (5/4) [5, 4, 5] | 2 (2/0) [1, 2, 2] | 52 [52, 56, 52] | 5 / 2 | 296 / 30 | 8 / 119 / 14.5 | 1 |
| f-cv25 | 6 (6/4) [6, 4, 6] | 3 (4/2) [3, 4, 3] | 58 [57, 58, 62] | 6 / 3 | 306 / 32 | 9 / 148 / 15.7 | 2 |

- **Reproduce first: reproduced at > 50, and threshold-sensitive.** g0.0f's median > 50 is 2, v0's + 1 = 2. Both twins say "not reproduced": at > 46 both arms have 2; at > 54 g0.0f has 0 against v0's 1.
- **f-cv25: "no effect" (threshold-sensitive).** Its median > 50 of 3 is above v0's 1, so not "removes", and above g0.0f's 2, so not "partial". The twins give "not reproduced", which voids the f-cv25 verdict at those thresholds.
- **Mechanism line (A): f-cv25's median Layout does not move toward v0.** It is 15.7 ms against g0.0f's 14.5 and v0's 12.3, with 9 Layouts ≥ 5 ms against g0.0f's 8.
  - The smaller tree at the top (937 vs 1584 rendered elements, `content-visibility` on the panel) does not make the phone's scroll-phase Layouts cheaper.
  - With ko2, f-cv25 un-skips sections while scrolling, as v0 does. That costs one more Layout, as on the Simulator (census above).
- **Reading.** The layout-tree hypothesis for g0.0f's window-A long frames is not supported: the arm that brings the tree back to v0's size does not bring the Layout cost or the long frames back to v0.
  - On this phone at tool-serious, g0.0f's window-A excess over v0 is one > 50 frame and holds only at the 50 ms threshold.
  - g0.0f's max dt (52) is below v0's (57), and its Composite work in the move phase is ~44 % lower (296 vs 529 ms).

**Window B** (jump to 4000, steps 4000 → 5000; part B 15:49-16:12Z)
- Holds H5-H9 all valid, no re-runs.
- BsC passed at the start (60.2 / 51.6 fps, 36.8 °C) and at the end (60.0 / 52.0 fps, 37.8 °C). Data: `out/p168ph/wread.json`.

| arm | > 34 (30/38) | > 50 (46/54) | max dt ms [runs] | +is-play frame: y, dt, Composite in it | Layout in it | Composite sum, move |
|---|---|---|---|---|---|---|
| v0 | 1 (1/1) | 0 (0/0) | 45 [43, 45, 46] | y 4562, 43-46 ms, 40-42 ms | none | 1198 |
| g0.0f | 1 (1/1) | 1 (1/1) | 73 [74, 73, 69] | y 4608-4609, 69-74 ms, 58-64 ms | 0-1 record, ≤ 0.3 ms | 376 |
| g0.0g | 1 (1/1) | 1 (1/1) | 69 [71, 69, 69] | y 4607-4609, 69-71 ms, 58-60 ms | 0-1 record, ≤ 0.4 ms | 351 |

- **g0.0g: "no effect".** Its median max dt is 4 ms below g0.0f's, inside the ±6 ms band. Its > 34 / > 50 medians (1 / 1) are ≤ g0.0f's (1 / 1). The twins agree.
- **Mechanism line (B): no Layout record in the `+is-play` frame on either arm.** The card's premise for window B, that the fwWC flip changes the used z-index and WebKit answers with Layout, does not show up on the phone.
- **The frame is Composite-bound.** In every run the `+is-play` frame is the only frame over 34 ms in the scroll phase, and Composite covers 84-92 % of it.
  - g0.0f's frame comes 46 px later than v0's (y 4608 vs 4562, as in P-167) and carries ~20 ms more Composite (58-64 vs 40-42 ms), although g0.0f's Composite over the whole window is a third of v0's (376 vs 1198 ms).
  - g0.0g's constant stacking context trims at most ~2-4 ms of it.

**What P-168 settles** (OBSERVED, tool-serious, 3 runs per arm)
1. **Window A:** g0.0f's excess over v0 is one > 50 frame, threshold-sensitive (the 46/54 twins do not reproduce it). f-cv25 does not remove it and does not bring the Layout cost toward v0. Not a layout-tree effect. **Recommendation: drop f-cv25 as a fix candidate.**
2. **Window B:** g0.0f's long frame is one Composite-heavy `+is-play` frame, ~25 ms over v0's, with no Layout in it. **Recommendation: drop g0.0g as a fix candidate** (no effect).
   - The next question for window B is what that one Composite costs: the layers that commit at `+is-play`. That is de-offscreen's area (layer census, KO B).
   - On the Simulator, f+B was the one arm that cut the window-B Composite max (−2.8 ms, see "Composite count" above), so the later f+B block (after the proposal decision) asks the right question.

## colpause: the menu columns' paused animation (proposal PR-039, lead 16:2xZ)

**Why.** g0.0f idle-mounts the morph panel. Its 4 col tracks run a 16 s alternate `translateY` animation, which the
morph scene pauses (`[data-start-selling-scene="paused"]`: `animation-play-state: paused`) while the menu is closed.
- A paused keyframe effect that "currently affects" transform keeps its element composited (CONFIRMED, WebKit main
  94a902b223, `RenderLayerCompositor.cpp` 3902-3910, `requiresCompositingForAnimation`).
- de-offscreen's KO B (`animation: none !important` while paused) drops those layers, but a re-opened menu then starts
  the columns from 0. The probe measures 56 px at every resume.

**f-B2 (pixel-identical variant)** = KO B plus `fwColScene` (built by `phone/p168-build.py`, arm f-B2;
JS 9162843e750f, CSS 26d28a0a263b). The helper is called in the morph scene's effect (JS ~14693) just before the
attribute flips.
- **On pause:** each track keeps its current frame as a static inline `transform` and gets `animation-delay: -(phase)`,
  where phase = `currentTime` minus its own delay, so pauses add up.
- **On resume:** the inline transform is removed and the animation restarts at that phase.
- **Before the first opening:** no animation exists to read, so a CSS rule gives the paused tracks the keyframes' 0 %
  frame (±56 px), but only under `prefers-reduced-motion: no-preference`.
- A 2D transform alone does not composite (CONFIRMED, `RenderLayerCompositor.cpp` 3949-3951, `has3DTransformOperation`).

**Checks** (`gates/colphase.mjs`: morph driver, 3 open/close cycles, rAF log of the scene state and 4 tracks' translateY;
Chrome 430x932 2 loads, Simulator 1 load; `phone/p168-tree.mjs` for layers):

| arm | jump at re-open, Chrome / Sim (px) | jump at pause | drift while paused | top layers / MB (Sim) |
|---|---|---|---|---|
| g0.0f | 0-0.19 / 0-0.36 | 0-0.02 | 0 | 158 / 27.6 |
| f-B (KO B) | 56 / 56 | 47 | 0 | 152 / 13.0 |
| f-B2 | 0-0.18 / 0-0.34 | 0-0.02 | 0 | 152 / 12.4 |

One frame of normal column motion is 0.14-0.16 px. The first f-B2 build (without the 0 % rule) jumped 56 px at the
first opening only (a hidden state). It was rebuilt and re-checked: the table shows the rebuilt arm.

- **Not claimed:** any window-B frame gain. de-offscreen's `+is-play` census (86b474a2) finds nothing KO B removes from
  that commit except tree size.
- **New suspect for window B, g0.0f only:** the glint `.is-active` start (setTimeout 1e3, JS 13285). It adds +4
  layers and +5 overlap re-composites (+2.4 MB) about 1 s after `+is-play`.
- **Proposal PR-039:** option restart = f-B, option keep-phase = f-B2 (recommended). Try-it A = g0.0f; overlays are
  local in `fixes/colpause-{a,b,b2}/overlay`, never committed. Shots: `gates/colshot.mjs` (the menu's second opening + 0.8 s).

## P-169 (phone card, window B only; written before any P-169 data)

| | |
|---|---|
| question | Is g0.0f's ~20 ms extra Composite in the window-B `+is-play` frame the cost of a bigger layer tree? P-168 ("P-168 result" above): Composite in that frame v0 40-42 ms vs g0.0f 58-64 ms, no Layout. de-offscreen's read of the same runs: the paint area is the same in all arms, so the excess is Composite work outside Paint. In the Simulator, after the flip g0.0f has 60 layers vs v0's 50; f-B2 brings g0.0f back to 50 (a different set: the hidden menu subtree goes, the row-title masks/sweeps stay). |
| arms | **v0** (control; JS 4606120cf392 / CSS 27776f3d4138) · **g0.0f** (JS 30fd80ccbb3f / CSS 1d1e5d62a2c4) · **k = f-B2** = g0.0f + KO B made pixel-identical (PR-039 option keep-phase; JS 9162843e750f / CSS 26d28a0a263b; `p168-build.py` arm f-B2, served as `fB2` by `p168-serve.sh`). Measuring f-B2 before the user's PR-039 decision is a measurement, not a landing; the arm is pixel-identical (the lead's words when asking for this card). |
| window | B only: jump to 4000, W steps 4000 → 5000, Timeline on in every counted run (P-168 part B, unchanged). |
| profile, driver | tool-serious (`iphone.mjs rearm`, CM_THERMAL=serious), W + Timeline. Never pooled with P-168 (same profile, different block). |
| order | P-168 part B's Latin square: `H5:Bw0,Bwe,Bwk,BsC  H6:B01,Be1,Bk1,Be2  H7:Bk2,B02,Bk3  H8:B03,Be3  H9:TAILB`; 3 counted runs per arm, `e` = g0.0f, `k` = f-B2. |
| sentinels | as P-168: only BsC (uncounted Timeline-off S run on v0, `--heat-sentinel`, bottom ≥ 58 and scroll ≥ 44 fps) after the warm-ups and in the TAIL; a failing BsC is BLOCK STOP 8. |
| metric (primary) | the Composite time inside the `+is-play` frame (every Composite record's overlap with [frame start, frame end)); per arm the median of 3 (`p169-wread.mjs`, committed before data). |
| rules (written before data) | **Reproduce first:** g0.0f's median ≥ v0's + 10 ms, else "not reproduced" (no f-B2 verdict).<br>**Tree size:** d = median(f-B2) − median(g0.0f): d ≤ −10 ms "tree size is the cost"; −10 < d < −6 "partly tree size"; \|d\| ≤ 6 "not tree size"; d ≥ +6 "worse". Twins ±4 ms on both bounds (6/2 and 14/10): "threshold-sensitive" when either gives another verdict.<br>**PR-039 line (for the user):** the `+is-play` frame dt, f-B2 vs g0.0f median: ≤ −6 ms "shorter frame"; within ±6 "same frame"; ≥ +6 "longer frame".<br>**Counts (as P-168 B):** whether f-B2's scroll-phase > 34 (30/38) and > 50 (46/54) medians are ≤ g0.0f's. |
| mechanism line | Not a rule. If "not tree size", the excess sits in g0.0f's own page state; de-offscreen's source read (its README): the sync buffer prepare happens only for stores that were unreachable before the flip (RemoteLayerBackingStoreCollection.mm 271-274; RemoteRenderingBackendProxy.cpp 615-634); expected equal across arms, so f-B2 mainly tests tree size. UNRESOLVED; a Simulator `RemoteLayerBuffers` log check is the decisive local test, not part of this block. |
| reader check | `p169-wread.mjs` on P-168's part B (k = g0.0g) gives v0 41.3 / g0.0f 61.5 / g0.0g 59.4 ms (d = −2.1 for g0.0g, which is P-168's "no effect"): the metric reproduces P-168's 40-42 vs 58-64 ms. |
| budget | ~25 min of phone time (P-168's part B order, unchanged); hard stop 35 min, then report what there is. |
| kit | `phone/p169-{run,block,hold}.sh` (copies of P-168's, logs `out/p169ph`), `phone/p169-wread.mjs`; servers `p168-serve.sh` (B v0 f fB2, `out/p168`). Start detached with `out/g0box/watchdog2.sh`: `nohup sh fixes/g0-box/phone/p169-run.sh P-169 B > out/g0box/p169-partB.log 2>&1 &`. |
| conditions before the first counted run | (1) a dry run (`CM_DRY=1`) prints every pin; (2) the user's ready step (the lead's); (3) USB link, WDA and the thermal read work; (4) the servers are not restarted after the dry run. |

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

- **P-167 thermal clear:**
  - After part A, `thermal.mjs clear` stopped our `set` but could not confirm (RSD GOAWAY).
  - A separate `lock.mjs run iphone -- node tools/thermal.mjs status` at 13:41:56Z read `NONE`: the induced condition is off.
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
