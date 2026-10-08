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

### P-165 S leg (complete 07:51Z; interim until the block ends; `p165-score.mjs out/p165`)

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

## P-166 (attribution ticket draft for P-165's two S clusters; written before any P-166 data; not signed, not run)

| | |
|---|---|
| question | Which part of the stack owns each new V frame of P-165's S leg: v0 → g0.0e (the best build before v3-W, with hero-exit-threaded's CSS mode and the earlier g0 parts) → g0.0f (= g0.0e + v3-W)? Spot A: the first scroll frame (y ≈ 0 → 60, `+he-css`). Spot B: the `+is-play` frame at y ≈ 4525 |
| arms + pins | **v0**: the baseline snapshot as P-165's C (`site-pretty`, plain), JS 4606120cf392 / CSS 27776f3d4138. **g0.0e**: `out/g0box/g00e` (BEST_BUILDS' g0.0e), JS 5c39f7a96e41 / CSS d4e684032482. **g0.0f**: `out/g0box/snap4/V`, JS 30fd80ccbb3f / CSS 1d1e5d62a2c4 (P-165's V). Each arm on its own port, served hashes checked before every run |
| known before data | `he-css` is in g0.0e's JS already (8 hits in both g0.0e and g0.0f; the CSS-mode block, JS 4835-4875: "heSc goes live on the first scroll event … s() writes the inline value …, then .he-css arrives"), i.e. hero-exit-threaded's CSS mode, not v3-W. So spot A is expected to show in g0.0e as well; spot B has no prior owner. **map-s-clusters (read-only helper, via the lead; inferred unless marked OBSERVED):** spot A: (1) heUp/heSc (patch about 2409-2416) adds `.hero-track.he-css`, which switches on `animation-timeline: --hero-exit` for 4 orbit cards, `.hero-copy` (fade + transform) and `.scroll-float` (blur + fade-up) (CSS patch 292-330; topic hero-exit-scroll-timeline, in g0.0c and later; g0.0e's JS is byte-identical); (2) the fwWCIO IntersectionObserver (patch 1436-1447) flips `data-fw-wc` on 2 elements 2 rows after the slow frame in 4/4 V runs (OBSERVED correlation); (3) v3-W's fills are least likely (present from mount; nav `--morph` stays 0 under scrollBy). Spot B: (1) the platform-idle G1 secure-card glint (patch 577-670, JS about 3076-3090: clip-path `path()` + an svg transform keyframe, started by `.is-active`); (2) a `data-fw-wc` flip at or next to the slow frame in 4/4 V runs (OBSERVED; element and value unknown); (3) the corners IO (patch 3134), less likely |
| knock-out arms (to build before signing, each with its served hashes) | **e-nohe**: g0.0e with `heCss = false` (the CSS mode off, the baseline JS writer as on Chrome; spot A). **f-nowc**: g0.0f with fwWC windows off (`fixes/n10-c-wc-windows-off`'s patch on top; both spots). **f-noglint**: g0.0f with the secure-card glint off (a CSS rule that removes its animation; spot B). Each is one change on its base, checked in Chrome and the Simulator for the same layout as its base apart from the knocked-out effect |
| stages | **1. Simulator counts (functional session, counts only, no timing):** per arm (v0, g0.0e, g0.0f and the 3 knock-outs) and spot, the W step pattern with a Timeline on the Simulator: the spot frame's RecalculateStyles / Layout / Paint record counts and the elements styled. Knock-outs that remove the spot frame's extra records name the candidate owner. **2. Phone W block (this card, timing):** per spot 3 arms, picked from stage 1: the first build that shows the frame, its predecessor, and the knock-out that removes it in stage 1 (spot A expected: v0 · g0.0e · e-nohe; spot B expected: g0.0e · g0.0f · f-noglint, or f-nowc if stage 1 points there). If stage 1 points elsewhere, the arms change before signing |
| driver | **W** (`iphone.mjs run --driver window --probe std`): spot A `--from 0 --to 750` (the first 3 steps of 250 px; the first step is S's first frame); spot B `--from 4000 --to 5000` (jump, 1 s settle, idle 3 s, steps 4000 → 4250 → 4500 → 4750, where S met the frame at 4520 → 4590). `--hold 2`, `--sentinel 3` (the W sentinel: jump to the bottom and hold; it judges v0 runs as the heat sentinel) |
| Timeline | The card asks for Timeline on. **Tool gap:** `iphone.mjs run` has no `--timeline`; only `gesture --timeline` records one (gesture-run.mjs, TIMELINE_START, re-armed per load, I-079). Options for the lead: (a) a toolsmith adds `--timeline <out>` to `iphone.mjs run`, reusing gesture-run's arm. That is measurement code, so it needs a covering test and is named in this card. (b) No Timeline: attribution from the W record's per-frame fields only (dt, mutations, prev, rafJs, crossings), which already name the class flip in each frame but cannot split Script / Layout / Paint+Composite. I recommend (a); P-166 does not start before it lands |
| order | Per spot, 1 uncounted warm-up per arm's port, then 9 counted runs, 3 per arm, in a rotated Latin square over the spot's 3 arms (X Y K · Y K X · K X Y; for example v0 g0.0e e-nohe at spot A). Every counted run has Timeline on (after (a)). The block ends with a Timeline-off v0 control sentinel |
| profile | **real-serious** if the phone is still at real Serious after P-165 (gate as P-165: `thermal-gate --expect serious --max-c 44`, park before every gate, GRIDCHECK restart on exit 6, heat margin 39.5 °C, fling heat runs on the mirror). Otherwise **xcode-serious**, for attribution only. Profiles never pool, and P-166 never pools with P-165 |
| readout per spot and arm | The spot frame's dt (median of 3, twins 46/54), its RenderingFrame segments (Script, Layout, Paint+Composite, Other) and gap − frame, and the frame's mutations and prev. **Owner** = the first arm in v0 → g0.0e → g0.0f where the spot frame is > 50 ms in ≥ 2 of 3 runs and a Timeline segment accounts for the added ms (≥ 2/3 of the dt difference to the previous arm, median). Neither arm passes that: "not attributed", stated as such. Spot A, g0.0e: the owner is hero-exit-threaded's CSS-mode switch. g0.0f only: v3-W |
| pre-data check | Simulator, class flips and served hashes only, never timing: a W `run` is refused in a functional (shared) session, so this uses a normal `sim.mjs session` in a chrome-measure hold (`--max-seconds 420`; only the flip and its y are read, never dt). For each arm and spot, the W step pattern crosses the class flip inside the timed window (spot A: `+he-css` on the first step in g0.0e/g0.0f, no he-css in v0; spot B: `+is-play` between 4500 and 4750 in all three) and the served hashes match. Any spot that does not cross is re-placed before signing |
| phone time | About 20-25 min per spot (3 warm-ups, 9 counted runs of about 30 s each, a gate per hold, about 3 holds), so about 50 min for both spots, plus heat if the phone has cooled |
| decision | Spot owner g0.0e (hero-exit-threaded): a follow-up on hero-exit-threaded's first-scroll switch (for example, switch at idle, not on the first scroll), not v3-W's. Spot owner v3-W: v3-W gets a revision before landing. Not attributed: the lead decides |

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
