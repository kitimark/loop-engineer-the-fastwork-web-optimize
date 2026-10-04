# v7-best screen-size check (breakpoints README §5 items 2 and 5)

Question: does v7 (`fixes/v7-best/patch.diff`, JS pin 8c90da217745, CSS pin 308f0da70c3a) look and behave
like the baseline at other screen sizes, and does it add errors or work? Harness unchanged
(`research/breakpoints/{run.sh,sweep.mjs,configs.mjs,summarize.mjs,probe-accent.mjs}`), `tools/` untouched.
v7 copy built with `node fixes/v7-best/gates/snap.mjs` (`out/v7-best/snap/V`, hashes match the pins).
Everything is Chrome in the shared lane (weight probe) or the iPad Simulator (weight simulator). No timing, no iPhone.
All results are OBSERVED (our setup only) unless a status word says otherwise.

## Verdict

- No new console errors, exceptions or 404s from v7 at any of the 14 configs (0/0/0 in every arm), and none on the iPad Simulator.
- Frozen-frame pixels at the 6 stops are inside the A/A floor everywhere except items explained below; none is a v7 layout change.
- Counts: v7 does less layout and style work at every width class (layouts at rest about -95 %, while scrolling -33 to -48 %, style recalcs -58 to -72 %). It does more paint events at rest and more layers (rises listed below, cause not attributed).
- Not covered: Mac Safari, iPad landscape, live-resize crossings. See "Untested".

## 1. Pixels: config x stop

Source: `out/breakpoints/v7-pix/sweep-pix.json` (arms B baseline, S v7, B2 baseline again for A/A; 14 configs; frozen frames at 6 stops: top, hero, people, pain, commission, end; countdown masked, accent word masked with `MASK='.hero-title .script-accent'`). Cell: percent of pixels differing, v7 vs baseline / A/A.

| config | top | hero | people | pain | commission | end |
|---|---|---|---|---|---|---|
| c375 (375 touch) | 0.802 / 0.824 | 0.852 / 0.721 | 0 / 0 | 0.003 / 0.003 | 0 / 0 | 0.031 / 0.030 |
| c430 (430 touch) | 0 / 0 | **0.71 / 0** | 0 / 0 | 0 / 0 | 0.001 / 0 | 0.026 / 0.027 |
| c600 | 1.211 / 1.214 | 0 / 0.547 | 0.048 / 0 | 0.048 / 0 | 0 / 0 | 0 / 0 |
| c601 | **0.458 / 0.001** | **0.672 / 0** | 0.032 / 0 | 0.033 / 0 | 0.079 / 0.079 | 0 / 0 |
| c768t (768 touch) | 0 / 0 | 0 / 0.017 | 0 / 0 | 0 / 0 | **0.12 / 0.045** | 0.012 / 0.014 |
| c900 | 0.001 / 0.43 | 0 / 0.491 | 0 / 0 | 0 / 0.001 | 0 / 0.165 | 0.034 / 0.018 |
| c1024t (1024 touch) | **0.457 / 0.005** | **0.151 / 0** | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| c1024 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0.001 / 0 | 0 / 0 |
| c1280 | 0.005 / 0.713 | 0.104 / 0.805 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| c1440 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0.034 / 0 |
| c1920 | 0.001 / 0.001 | 0 / 0 | 0.009 / 0.009 | 0.008 / 0.007 | 0.045 / 0.071 | 0.024 / 0.014 |
| c932l (932x430 landscape) | 0 / 0.877 | 0 / 0.869 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| rm430 (reduced motion) | 0.001 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| rm1440 (reduced motion) | **3.052 / 0** | **1.318 / 0** | 0.009 / 0 | 0.009 / 0 | **0.068 / 0** | 0 / 0 |

Bold = above the A/A floor. Explanations (each checked, none is new layout):

- **c430 hero, c601 top and hero, c1024t top and hero.** All inside the hero title line, next to the accent word, whose position follows a 3 s timer. Rerun with the whole `.hero-title` masked (`out/breakpoints/v7-pixmt`, c430, c601, c1024t): c430 and c1024t drop to 0 or the A/A floor; c601 top 0.002 vs A/A 0.001. `probe-accent.mjs` (c430, c601, c1024t, c1440, 10 s each, `out/breakpoints/v7-accent.log`): accent widths and neighbour slide distances are identical in baseline and v7 (for example 40 px stop: widths 70/50/60/83.75, moves 10/5/11.88 px; 1024t 11.52/5.77/13.69; 1440 16/8/19; wiggle <= 0.01 px). The baseline's accent width creeps at load (172 distinct widths); v7 sets it at once. OBSERVED.
- **c601 people and pain 0.032/0.033 (6 big px).** Same size as the st6-rb2 sweep; a few pixels at one edge, A/A 0. Not a layout change.
- **c768t commission 0.12 % vs A/A 0.045 %.** The referral-fee counter (dollar count-up) and its bar caught mid-animation. The A/A differs at the same box ([78,633,148,673]). Phase noise.
- **rm1440 top 3.052 %, hero 1.318 %.** The known hero-photo raster difference (T-053, PR-015 decided "keep"). Not new.
- **rm1440 commission 0.068 % (882 px, max 158, edge of the "0%" glyph).** Hard-freeze recheck (`out/breakpoints/v7-rmc-base`, `v7-rmc-v6`) did not reproduce: baseline vs v7 0.09 % equals the A/A 0.091 % (diffs at the headline underline). With a v6 control the same region differs in the A/A too (0.182 %, the "0%" glyph cell). Per-load state, not v7-specific. OBSERVED, cause unknown.
- Floor noise, same in A/A: c375, c600 top (1.211 vs 1.214), c900, c1280, c932l top/hero (accent phase); c1920 people 0.009 vs 0.009; c1440 end 0.034 vs 0 (219 big px, one load, not repeated at the 5 other stops).

## 2. Errors

Exceptions / console errors / HTTP errors per arm B/S/B2 over the pixel sweep: all 0 at 14 configs. In the census (5 configs, section 3) the only errors are in the baseline arm B2 at c768t: 2 console errors and 2 HTTP 404s for `/selling/optimized/media/post-1.avif` and `post-2.avif`. Those files are missing from the mirror snapshot (only `post-5.avif` exists), they hit the baseline only (a different lazy-load path) and v7 never requested them. A mirror gap, not new in v7.

## 3. Count census (one load per arm, 5 configs, one per width class)

Source `out/breakpoints/v7-census/sweep-census.json`. Format: at rest L/R/P/layers, while scrolling L/R/P/max layers, at the end L/R/P. L layouts, R style recalcs, P paint events. B = baseline, S = v7, B2 = baseline again (control).

| config | arm | rest | scroll | end |
|---|---|---|---|---|
| c430 | B | 111/244/356/107 | 201/1039/1392/149 | 1/144/281 |
| | S | 5/180/668/151 | 115/287/1370/170 | 1/47/199 |
| | B2 | 112/241/455/107 | 199/995/1397/149 | 1/91/212 |
| c768t | B | 108/240/455/117 | 194/880/1184/163 | 23/90/226 |
| | S | 5/144/477/166 | 107/257/1227/183 | 24/67/306 |
| | B2 | 102/241/439/117 | 186/893/1179/163 | 23/93/226 |
| c1440 | B | 104/244/423/108 | 275/1461/1496/119 | 1/91/206 |
| | S | 5/241/588/152 | 188/595/1323/174 | 1/39/135 |
| | B2 | 109/241/450/108 | 287/1419/1433/117 | 1/90/206 |
| c932l | B | 133/240/402/112 | 185/1859/1849/129 | 0/90/211 |
| | S | 5/168/749/157 | 131/559/1407/180 | 0/25/52 |
| | B2 | 110/240/458/112 | 207/1863/1819/129 | 0/90/211 |
| rm1440 | B | 0/4/97/102 | 42/728/663/126 | 0/1/5 |
| | S | 0/8/135/145 | 22/229/324/147 | 0/2/6 |
| | B2 | 0/4/97/102 | 42/728/663/126 | 0/1/5 |

Gains, same direction at every width class: layouts at rest about -95 %; layouts while scrolling -33 to -48 %; style recalcs while scrolling -58 to -72 %. The F3 cover is identical across arms (88/8, 90/6, 80/16).

Counts that rise against the control (all OBSERVED, cause not attributed; v7 adds composited layers and paints in places the baseline does not):

- Paint events at rest: +130 to +350 (c430 668 vs 455, c1440 588 vs 450, c932l 749 vs 458; c768t +38).
- Layers at rest: +40 to +45 (c430 151 vs 107, c768t 166 vs 117, c1440 152 vs 108, c932l 157 vs 112, rm1440 145 vs 102). The st6-rb2 sweep showed +10 to +27.
- Max layers while scrolling: +20 to +55.
- c768t end paints 306 vs 226 (one load).
- rm1440 rest style recalcs 8 vs 4.

Paint events fall while scrolling at c430/c1440/c932l/rm1440 (e.g. c932l 1407 vs 1849) and rise slightly at c768t (1227 vs 1184). Only 5 of the 14 configs were counted.

## 4. iPad Simulator (functional, no timing)

Device fw-ipad = iPad Pro 13 (M5), portrait, viewport 1032x1244, dpr 2, hover:none, pointer:coarse, combo860 and combo1000 true, w1000 false. `research/breakpoints/sim-ipad.mjs` loads A (baseline), V (v7), A2, V2, each on its own server, Date.now frozen, scores with `fixes/v7-best/gates/pxlib.mjs` (`scoreStop`). A test-only scaffold overlay (`__errhook.js`, served as a file because the page CSP forbids inline scripts) records errors; it is not part of v7.

- Errors: no exceptions, resource failures, console errors or 4xx/5xx in any of the 4 loads.
- Hero stops (y 0 and 622, countdown unmasked): consistent 0 with the title hidden. Frozen Date.now stalls the accent word differently per build (run 1 showed it as a 2968 px² cluster, A and A2 drawn, V and V2 blank), so later runs used `--hide .hero-title`.
- Remaining clusters (css px²):

| stop | v7 vs baseline | reading |
|---|---|---|
| y 2017 vinyl label text | later 0 (settle 4000 ms) | entrance timing |
| y 2623 avatar-row rotator | different avatars, A pair identical, V pair identical | known, accepted rest-script change (PR-014) |
| y 5111 blur entrance | later 8 (max 47) with settle 4000 ms | baseline caught inside the 1.6 s entrance, v7 already done |
| y 6853 platform "secure-network" glint | 93-116, max 71, stable | by-design platform-idle glint difference (earlier proposal, up to 64 LSB) |

- Whole-device A/A 9.3 % is the first-load Safari chrome bands 0-1 only (`bands.mjs`: A vs A2 is 0 over every page band). A2 vs V2 beyond A/A is 0.08-0.12 % (bands 0-1, UI) plus the small page clusters above. OBSERVED.
- Run directories: `out/breakpoints/ipad-portrait`, `ipad-portrait-h`, `ipad-portrait-s4`. The first Simulator attempt failed with `simctl launch Safari failed (timed out after 60 s)` on a cold iPad boot under host load; the retry worked in 227-231 s of the 300 s hold.

## 5. Untested / open

- **Mac Safari** (desktop WebKit at 1024-1920 wide, both the hover and no-hover paths): not run. Open.
- **iPad landscape and iPad reduced motion**: not run. `sim-ipad.mjs --orient landscape` exists but is not exercised. The lead froze new Simulator sessions until the P-111 phone block ended.
- **Live-resize crossings** (README section 3.4, breakpoints crossed while the page is open): not run.
- **GestureEvent / hero-exit wide branch**: not re-run for v7.
- **Countdown** was masked in the Chrome pixel sweep; checked unmasked only on the iPad (hero stops 0).
- **Census** covers 5 of the 14 configs (c430, c768t, c1440, c932l, rm1440).
- **Causes of the extra layers and paint events** at rest are not attributed.
- The rm1440 hero-photo difference is accepted (PR-015), not re-argued.
- Chrome is the only engine for the width sweep; every pixel, error and count claim is OBSERVED in Chrome, and the iPad session in Safari on the Simulator, not on a real iPad.
