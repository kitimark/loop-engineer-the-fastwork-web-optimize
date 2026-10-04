# GPU preview: the best build plus the three GPU fixes, for trying by hand

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** built; text identity checks pass; Chrome and Simulator checks below (counts and pixels, no timing); not yet tried on the phone.
**Owner:** wi-gpu-bundle (wave integrator), user priority T-073 #2 ("GPU rendering fixes, bundled into the new best build
for me to test").
**What it is for:** a page the user can try by hand (console Try-it: A = today's best build, B = this preview). It is
**not** a landing candidate as a whole: each fix still lands on its own, through its own phone check.
**Baseline snapshot:** b1789284481295-4ad4a84a
**Build:** JS `c0c8ad4e36cb`, CSS `d0f1017e692d` (sha256/12). `patch.diff` (baseline-relative) sha256/12 `17a2764ec8a7`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, `/_app/immutable/assets/2.gBuqKVzi.css`

## What is in it

| order | part | source | its own build (JS / CSS) | phone status (2026-10-04 ~05:40Z) |
|---|---|---|---|---|
| base | best build = st6-rb2 + platform-idle + morph-inherit | main `fixes/best-build/patch.diff` (60df1cf) | 65052c4a3902 / e0f92804c521 | landed |
| 1 | cd-strip (strip-tc): one static strip per countdown digit | main `fixes/cd-strip/patch.diff` (5d1ca102, landed, **not yet in the best build**) | 6fa0e1e8a221 / 982a747d9263 (on st6-rb2) | P-079 hit; landed under the less-work rule |
| 2 | cd-roll-ca: the countdown roll as Web Animations on the cells (compositor) | fix-cd-roll-ca, branch commit 3f7ce94a, `patch.diff` d48095cc16ff (on cd-strip) | V9 582d120c9f8f / 982a747d9263 | **unconfirmed**: P-093 (no-worse block) not run yet |
| 3 | hero R2: the hero exit as CSS scroll-driven animations, touch phones only | fix-hero-exit-threaded, branch commit 93705754, `patch.diff` 168233b0a4ae | R2 924be86afac8 / cc74cd980e72; on best: B-R2 8018ce062d30 / 71b65c667720 | P-095 (no-worse on best) passed per its owner; the finger swipe A/B is still to come |
| 4 | morph-gpu: the end-of-page nav morph as a clip-path reveal (phones, width <= 640) | fix-morph-gpu, branch commit 9693eb5e, `delta.diff` 27c4905900a4 (on best) | rv 372b99478871 / 257507365449 (PR-012 rev 1, accepted) | **unconfirmed**: P-092 (no-worse block) running now |

So the preview carries one landed fix the best build does not have yet (cd-strip) and three GPU fixes, none of which
has landed. Hero R2 and morph-gpu only change Safari on touch phones (R2's gate: `GestureEvent`, scroll-driven animation
support, coarse pointer, no hover, screen short side <= 600; morph-gpu: width <= 640). In desktop Chrome the preview is
the best build plus the countdown changes.

## How it is built (`build.mjs`)

Every input is rebuilt from its own committed patch and checked against the hashes its owner measured (refused on any
difference). Inputs not on `main` are read with `git show <pinned commit>:<path>` from the owners' branches. Then each
fix's own change is taken against the build it was made on, and the four changes are applied to the best build with
best-build's strict applier (exact context, no fuzz, offsets reported):

| delta | = | sha256/12 | hunks (JS / CSS) |
|---|---|---|---|
| cd-strip | cd-strip build - st6-rb2 | a0c9837fe49b | 2 / 3 |
| cd-roll-ca | V9 - cd-strip build | c52e108c50db | 3 / 0 |
| hero-r2 | R2 - morph-inherit build (R2 = st6-rb2 + morph-inherit + hero) | 898f7c24b73e | 4 / 1 |
| morph-gpu | rv - best build (equal, hunk for hunk, to its committed `delta.diff`) | 96bc51c6a896 | 2 / 1 |

Checks, all passing:
- **Order:** all 6 orders of the three independent groups ([cd-strip, cd-roll-ca], [hero-r2], [morph-gpu]) give the same
  bytes.
- **Conflicts:** none. The closest changed lines of two groups are 14 lines apart: cd-strip's `.cell` rules (bundle CSS
  12245-12257) and morph-gpu's appended phone block (12272-12280). No two groups share diff context.
- **Identity** (the bundle with the other groups' deltas reversed equals each fix's own build, byte for byte):
  - bundle - morph-gpu - cd = **B-R2** (8018ce062d30 / 71b65c667720), the hero owner's own best-build stack (P-095's V arm);
  - bundle - hero-r2 - cd = **rv** (372b99478871 / 257507365449), the morph-gpu build PR-012 accepted;
  - bundle - hero-r2 - morph-gpu - (best - st6-rb2) = **V9** (582d120c9f8f / 982a747d9263), the cd-roll-ca build;
  - bundle - all three = the best build (65052c4a3902 / e0f92804c521).
  So wherever only one fix touches the code, the preview is byte for byte that fix's own build.
- `node --check` (ES module) on the JS: ok. `fix.mjs apply gpu-preview --reset` from `patch.diff` gives the same hashes.
- No conflict needed resolving, so no other topic's code was edited.

```sh
node fixes/gpu-preview/build.mjs --snapshot   # overlay (gitignored) + out/snapshots/gpu-c0c8ad4e36cb/ + out/gpu-preview/build.json
node fixes/gpu-preview/snap.mjs               # gate arms in out/gpu-preview/snap/ (A, G, GH, H, MH, V9, BC) + HASHES.txt
sh fixes/gpu-preview/gates/run-all.sh         # the shared-lane checks below, one queue entry at a time
```

## Try-it (console proposal PR-016, a draft until the lead publishes it)

- A = baseline + `fixes/best-build/patch.diff` (today's best build); B = baseline + `fixes/gpu-preview/patch.diff`.
  Both were read when PR-016 was posted (pre-rebase commit cc9464da; `patch.diff` sha256/12 `17a2764ec8a7`, unchanged
  since) and are kept in the console store.
- When it was posted, the console warned that B lacks 3 lines of A's JS. This is expected and intended. The 3 lines
  belong to st6-rb2's countdown face snippet in the best build (`__cdAnimate`, the countdown-idle-raf face parking
  transform and its comment). cd-strip, landed on `main`, replaces the 10 faces per digit with one static strip, so
  those lines are gone in B by design. No other line of the best build is changed or dropped.
- The lead publishes PR-016 only between phone blocks, never while a timed block runs. The user tries it on the phone.

## Known costs and caveats (read before trying it)

- **morph-gpu rev 1 (its owner's label, after review-morph-gpu):** phone P-092 no-worse on counts (moving >50 equal,
  >34 -2), but the tween-start frame costs more: the first frame of a repeat open is about +7 ms (62 vs 55 ms; the
  lead's summary: V 60-64 ms vs C 54-56 ms, 8 of 8) and is paid back the next frame (first 2 frames 71 vs 71). The
  first open per page load is 41 vs 34.5 ms (ranges overlap); close starts are shorter (33 vs 39 ms). Whether a frame
  is lost on screen is unresolved. Owed by its owner: idle triple, layers/memory note (about 10 layers promoted at each
  switch-on), phone segment card, Android Chrome cost (restyles 24.5 -> 34.8, Paint 9.1 -> 9.9 per moving frame).
  The preview carries rev 1 as labelled; rev 2 (clip layer prepared before the tween) is in progress, and the preview
  moves to rev 2 once that passes its own checks.
  Its owner's idle triple (headless Chrome 430x932, CPU 1x, callbacks per s, best vs rev 1): pin 2 vs 2, mid-page 4.2
  vs 4.4, top 36 vs 32.8 (the reveal is off at the top: phase noise), so the reveal adds no idle work. Simulator layers
  (first census run, to be confirmed by its owner): at rest the same layer count and memory as the best build; mid-morph
  (m 0.5) 3 more layers (57 vs 54) and about +4 MB in the nav (33.4 vs 29.5 MB).
- **cd-roll-ca:** its phone no-worse block (P-093) has not run.
- **hero R2:** P-095 (no-worse on best) passed per its owner; the finger swipe A/B is still to come.
- **`__fwMorphDrive`:** the best build ships this debug driver on `window` (best-build `patch.diff`); the preview keeps
  it unchanged, so A and B carry the same hook. Stripping it is the best build's call, not this preview's.

## Checks (no timing, no phone)

All in the shared lane (`gates/run-all.sh`, 2026-10-04 05:38-06:55Z; Simulator: the `fw-sim` iPhone 15 Pro Max,
430x775, functional sessions). Raw output stays in the worktree's gitignored `out/gpu-preview/`. Everything below is
counts and frozen pixels; nothing here is a timing or smoothness claim.

**1. Chrome functional check** (`fix.mjs check gpu-preview --on best-build --viewport both`): ok.

| viewport | console errors | 4xx | morph reached | elements (best -> preview) | screenshot diff % top / middle / bottom |
|---|---|---|---|---|---|
| mobile 430x932 | 0 | 0 | yes | 1532 -> 1580 | 0.11 / 0 / 0.22 |
| desktop | 0 | 0 | yes | 1375 -> 1423 | 0.11 / 0 / 0 |

The +48 elements are not split per fix here (the countdown fixes change the timer's cell markup). The diffs are
inside the 0-0.4 % countdown/orbit phase band.

**2. Chrome work counts** (de-frame-audit `census.mjs`, 430x932 DPR 3, one load per arm; per second; reference: the
committed `census-best.json`, the same build measured earlier, as the A/A):

| window | count | best (ref) | best (A, today) | preview (G) | G - A |
|---|---|---|---|---|---|
| rest y 0 | main frames | 49.0 | 49.6 | 41.2 | -8.4 |
| rest y 0 | rAF fires | 29.8 | 27.0 | 1.2 | -25.8 |
| rest y 0 | elements restyled | 422 | 419.5 | 449.8 | +30.3 |
| rest y 0 | paint | 142.5 | 146.7 | 143.4 | -3.3 |
| rest y 1400 | main frames / rAF | 48.6 / 26.0 | 49.3 / 27.0 | 41.8 / 1.2 | -7.5 / -25.8 |
| rest y 2796, 3800, end | all counts | | | | within the A/A spread |
| scroll top -> end | main frames | 126.2 | 126.0 | 126.0 | 0 |
| scroll top -> end | style recalcs | 77.7 | 77.8 | 71.8 | -6.0 |
| scroll top -> end | elements restyled | 2063 | 2042 | 2238 | +195 (A/A 21) |
| scroll top -> end | paint | 247.4 | 225.2 | 215.9 | -9.3 (A/A 22) |
| scroll top -> end | layout / rAF | 21.9 / 310 | 21.4 / 313 | 21.8 / 305 | +0.4 / -7.9 |

Read: the countdown's rAF loop (`4043:50 i /raf`, 27 per s) is gone at rest in the preview (cd-roll-ca: the roll runs
as Web Animations, about one `onfinish` per second instead), so the hero idles at about 41 instead of 50 main frames
per second. Elements restyled go up: +30 per s at rest (the rolling cells) and +195 per s (+10 %) over the scroll,
about the size morph-gpu's own Chrome counts predict (+10 elements per moving morph frame, the reveal's inline
writes). OBSERVED (one load per arm, our setup).

**3. Simulator work counts** (WebKit Timeline records, `gates/sim-hero-counts.mjs counts`, arms A, G, A2, G2; counts
per window, two loads per build):

| window | count | best A / A2 | preview G / G2 |
|---|---|---|---|
| y 0 idle 10 s | rendering frames | 513 / 528 | 464 / 479 |
| y 0 idle 10 s | rAF fires | 297 / 298 | 11 / 11 |
| y 0 idle 10 s | function calls | 356 / 357 | 79 / 81 |
| y 0 idle 10 s | layouts / paints | 378, 498 / 389, 509 | 346, 453 / 356, 466 |
| hero scroll 0 -> 900 | rAF fires | 497 / 459 | 269 / 287 |
| hero scroll 0 -> 900 | function calls | 867 / 778 | 679 / 711 |
| hero scroll 0 -> 900 | style recalcs / layouts | 316, 391 / 303, 337 | 255, 272 / 258, 294 |
| hero scroll 0 -> 900 | paints | 804 / 773 | 807 / 759 |
| bottom idle 6 s | all | 18 frames, 6 paints / 12, 6 | 18, 6 / 18, 6 |
| morph driver (hold 1500, 1 cycle) | frames / style recalcs | 112, 131 / 184, 197 | 193, 220 / 194, 222 |
| morph driver | paints | 427 / 847 | 413 / 403 |

Read: in WebKit the preview does less main-thread work at rest and in the hero scroll (rAF fires -96 % at rest,
function calls -78 % at rest, -15 % in the scroll; fewer style recalcs and layouts in the scroll, both loads), and
paints about the same. In the morph window the best build's two loads disagree (112 vs 184 frames, 427 vs 847 paints),
so only the preview's side is stable there: about half the paints of A2 with about 7 % more style recalcs per frame,
the same direction as morph-gpu's own Simulator paint counts. No page errors in any load. OBSERVED, Simulator, counts
only (Simulator ms are not judged, F-084).

**4. Simulator pixels, each fix alone vs the preview** (the illusion rule: where only one fix draws, the preview must
draw exactly what that fix alone draws):

- **Morph** (`gates/morph-frames.mjs`, arms MH = morph-gpu alone with its gate hook, GH = the preview + the same hook,
  MH again as the A/A; 12 frozen morph values m 0 -> 1 -> 0; page band y 60-834 css): preview vs morph alone, max
  channel delta **1** at every m, 0 pixels over 8; the A/A pair shows max 3, 0 over 8. Equal within the A/A.
- **Hero** (`gates/sim-hero-counts.mjs frames`, arms H = hero R2 alone on the best build, G = preview, H2 = H again;
  y 0 / 300 / 548, animations paused at 4000 ms, Date.now frozen): preview vs the H2 load **0 pixels differ** at all
  three positions; the hero track reads `he-on` in every arm at every stop (R2's gate is live in the Simulator), no
  page errors. The first load (H) differs from both G and H2 by the same amount (the hero's rotating word and the
  orbit cards' phase: they run on timers this freeze does not stop), so that pair is the A/A noise, not a change.
- **Countdown** (`gates/simpx.mjs`, cd-roll-ca's frozen-frame check with virtual clocks; arms V9 = cd-roll-ca alone,
  G = preview, V9 again as the A/A; fade50 wrap scenario, 42 shots per arm, paused and running): preview vs V9, 9 of
  42 shots differ, max channel delta **1**, 0 pixels over 1, layout rects within 0.001 px (under 1/64), state 0; the A/A
  pair shows the same (9 of 42, max 1). Every digit roll shares one startTime and plays as running Web Animations in all
  three arms (35 of 35); the hero layer tree is the same in all three (84 layers, 0.329 MB, 77 cell layers, 14 with
  backing, the same compositing reasons). The roll-end pair (no jump at the roll end) shows 42 pixels at max 1 in G.
  The first try at this hold ran out of time in the A/A arm (exit 124, the real-time rate sweep); the rerun skips that
  sweep (`SIMPX_RATES=`), which is cd-roll-ca's own timing cross-check and is not part of the pixel question.

**Result:** no errors or 404s; where only one fix draws, the preview draws what that fix alone draws (morph and
countdown within the A/A at max delta 1; hero 0 pixels against the repeat load). Counts: less main-thread work at rest
and in the hero scroll on both engines; more elements restyled in Chrome (rolling cells, morph reveal). All of it is
counts and frozen pixels; how the preview feels on the phone is for the user's Try-it.
