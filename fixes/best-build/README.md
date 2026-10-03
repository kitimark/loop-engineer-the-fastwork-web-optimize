# Best build: every landed fix in one patch

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** built and checked (identity, functional and pixel gates; no timing, per the user's "defer timing" rule)
**Owner:** wi-best-build (wave integrator), user task T-046
**Baseline snapshot:** b1789284481295-4ad4a84a
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, `/_app/immutable/assets/2.gBuqKVzi.css`
**Use:** the A side for the console's Try-it panels (I-093) and for phone finger A/Bs.

## In plain words

Every fix on `main` was built on st6-rb2, and every fix's `patch.diff` is relative to the plain baseline. So each
patch carries all of st6-rb2, and the patches can't be stacked as they are: st6-rb2 would be applied twice.

`build.mjs` takes st6-rb2 once. For each later fix, it works out only that fix's own change on top of st6-rb2 (its
"delta"), then applies those deltas one after another. The result is one baseline-relative `patch.diff`: the best
build.

The two deltas don't touch the same code. Their nearest changes are about 960 lines apart, so no judgment was needed.
The checks below show three things:
- Wherever only one fix changed the code, the build is byte for byte that fix's own build.
- The build passes each fix's own gates.
- The build looks like each fix's own build wherever that fix is the one that decides the pixels.

## Components

| order | fix | source on `main` | patch.diff sha256 | its own build (JS / CSS, sha256/12) |
|---|---|---|---|---|
| base | st6-rb2 | cff1a03 | 457dc775e360… | 7bf7c4657d21 / f523598b2a24 |
| 1 | platform-idle (G1 glint + G3 sweep on the compositor; PR-009 accepted) | d680796, 757a526 | 17990391eb48… | de29ff8aa622 / e0f92804c521 |
| 2 | morph-inherit (writes `--morph` inline on the nav children; F-183) | b11f977 | b4d4ccc97ec9… | 7c61fe7d0662 / f523598b2a24 |
| **=** | **best build** | this branch | 9bf4c6e41f11… | **65052c4a3902 / e0f92804c521** |

The baseline itself is 4606120cf392 / 27776f3d4138.

The components were built from `main` at 2f4926f. `main` is now at 95ba751, and none of the three fixes' files changed in
between.

Deltas against st6-rb2, each derived as `diff -u st6-rb2 <fix's own build>` (`out/best-build/work/`, local):

| delta | sha256/12 | hunks (st6-rb2 lines) | offset when stacked |
|---|---|---|---|
| platform-idle | 31897bc8e56d | JS -12449,14 / -12495,26 / -12525,8 (net -11 lines); CSS -6909,6 / -7284,7 / -11201,8 | 0 |
| morph-inherit | cd8804c0ff0b | JS -13490,10 / -13611,6 | -11 (from platform-idle's net -11 lines above it) |

- The morph-inherit delta is the same as the committed `fixes/morph-inherit/delta-vs-st6rb2.diff`; only the header labels differ.
- **Conflict check:** two deltas whose changed lines come closer than 3 lines (they would share diff context) stop
  the build with `CONFLICT`. The closest pair here is ~960 lines apart.
- **Order:** the build is applied forward (platform-idle, morph-inherit) and in reverse order, and both orders must give
  the same bytes. They do.
- **Applier:** strict. The diff context must match exactly; there is no fuzz. A hunk may shift by an offset, and every
  offset is reported.

## Not included (yet)

- **cd-strip:** not landed (its finger test is pending).
- **carousel-leaver:** the fix for st6-rb2's leaving-face bug in the avatar slider; not landed. **The best build still
  has that bug**, because st6-rb2 has it.
- **Adding one:** add ONE line to `COMPONENTS` in `build.mjs`. The commented `cd-strip` line shows the form.
  - Use `patch:` for a baseline-relative patch built on st6-rb2. Use `delta:` for a diff against st6-rb2 (what
    carousel-leaver produces).
  - Add the `expect` hashes the owner measured.
  - Then:
    ```sh
    node fixes/best-build/build.mjs --no-expect      # prints the new hashes; CONFLICT (exit 1) = report it to the lead, don't resolve it
    node tools/fix.mjs diff best-build               # new patch.diff
    node fixes/best-build/check.mjs                  # identity checks; then pin BUILD_EXPECT in build.mjs
    node fixes/best-build/build.mjs --snapshot       # read-only copy in out/snapshots/best-<js12>/ for serving
    ```
  - Then add the new arm and hashes to `gates/arms.mjs` (`PIN`) and re-run the gates that touch the new fix.

## The `__fwMorphDrive` debug hook (open point for the lead)

The build still carries st6-rb2's `window.__fwMorphDrive` ("DEBUG ONLY … strip before landing", JS ~13385-13415). It only
defines a function on `window`. Nothing calls it unless a driver does: the M driver and the restyle gate use it.

platform-idle's README says stripping it is "st6-rb2's (or the integrator's) job". I left it in, for two reasons:
- Stripping it is a code change, which isn't mechanical. The task said not to make such calls by judgment.
- The phone M-driver runs need it.

If the lead wants a strip, it can be one more `COMPONENTS` line (a delta that removes the hook).

## How to rebuild

```sh
node fixes/best-build/selftest.mjs        # 8 synthetic cases: conflict rule, strict applier, offsets, reverse
node fixes/best-build/build.mjs           # fixes/best-build/overlay/ (gitignored) + out/best-build/build.json
node fixes/best-build/check.mjs           # 17 identity checks
node fixes/best-build/build.mjs --snapshot   # out/snapshots/best-65052c4a3902/ (read-only), the A side to serve
# or, independently of build.mjs: node tools/fix.mjs apply best-build --reset   (git apply of patch.diff; gives the same hashes)
```

## Identity checks (`check.mjs`, all 17 ok)

1. The overlay on disk, the build and the pinned `BUILD_EXPECT` all match, for both files. `patch.diff` applied to the
   baseline (strict applier) gives the build, and so does `fix.mjs apply best-build --reset` (git apply).
2. The build with morph-inherit's delta reversed equals platform-idle's own build, byte for byte (de29ff8aa622 /
   e0f92804c521).
   - The build with platform-idle's delta reversed equals morph-inherit's own build (7c61fe7d0662 / f523598b2a24).
   - With both reversed, it equals st6-rb2 (7bf7c4657d21 / f523598b2a24).
   - So everywhere only one fix touches, the build is that fix's build.
3. The same, a second way. The lines `diff(fix's own build, build)` adds and removes are exactly the other delta's lines,
   counted as multisets.
4. `node --check` (as an ES module) on the build JS passes.

## Functional gates (each fix's own, re-run on the build)

Every gate is a copy in `gates/`. Each copy runs the same steps as the original; only the arm table (`gates/arms.mjs`)
and the output folder change.
- Arms are served from read-only snapshot copies, each from its own server and origin.
- Every load checks the served JS and CSS hashes against the pin. A mismatch is VOID; there were none.
- Arms:
  - C = st6-rb2, V = platform-idle, M = morph-inherit, N = the best build.
  - VH / MH / NH = the same builds plus morph-inherit's `__fwMorphSet` frozen-frame hook (MH is morph-inherit's own
    mhook d9898e0a2e15).
  - A `2` suffix = the same build from a second server (the A/A pair).
- Runs:
  - Chrome: headless, shared-lane probe holds of at most 300 s.
  - Simulator: `sim.mjs session --functional`, shared-lane simulator holds.
  - Logs and raw data are local, in `out/best-build/`.
- All on 2026-10-03, about 15:06-15:43Z, with the Mac shared with other agents. These are counts, not timing.

### platform-idle: idle counts at the platform tail (P-077's harnesses)

Chrome: the unmodified `fixes/platform-idle/tools/idlecount.mjs`, run by `gates/idle-chrome.mjs` (the node form of
its `run-chrome.sh`). Order V1 N1 C1, then N2 V2. Counts per 20 s window:

| stop | count | C | V | **N** |
|---|---|---|---|---|
| 5346 (primary) | UpdateLayoutTree | 1200 | 40 / 40 | **40 / 40** |
| 5346 | PrePaint | 1200 | 40 / 40 | **40 / 40** |
| 5346 | Paint | 2409 | 169 / 164 | **169 / 169** |
| 5346 | Layout / Layerize | 0 / 1200 | 0 / 40 | **0 / 40** |
| 4660 | UpdateLayoutTree / PrePaint | 1200 / 1201 | 1200 / 1201, 267 / 268 | **1201 / 1202, 1200 / 1201** |
| 4660 | Paint | 6222 | 3822, 1027 | **3825, 3822** |

- P-077 measured V at 40 / 40 / 163-169 at 5346 and 1200 / 1201 / 3825-3829 at 4660.
- V2's low 4660 window (267 style passes) is in V, not N, and is less work. At 4660 the agents-typing loop keeps one
  style pass per frame, and platform-idle's README notes that its windows vary with that loop's phase. OBSERVED, cause
  not checked.
- Element checks in every V and N window: no SMIL `<animate>`, 2 glints active, glint animations running, a sweep band
  running per sweep title in view. C keeps its SMIL glint.

Simulator: `gates/simcount.mjs`, a copy of platform-idle's `simcount.mjs` that adds the served-hash pin. Order V1 N1,
then N2 V2. Counts per 20 s window:

| stop | count | V | **N** |
|---|---|---|---|
| bottom (primary) | RecalculateStyles / Layout / Paint | 40 / 40 / 20, 40 / 40 / 20 | **40 / 40 / 20, 40 / 40 / 20** |
| bottom | RenderingFrame / Composite | 60 / 60, 60 / 60 | **49 / 49, 60 / 60** |
| y 4660 | RecalculateStyles / Layout / Paint | 556 / 398 / 327, 593 / 397 / 324 | **529 / 368 / 305, 588 / 401 / 321** |

- P-077's V ranges: bottom 40 / 40 / 20 with rendering frames 41-60; y 4660 514-583 / 400 / 315-328.
- Platform-section layers at the bottom: 26 in both arms, with 0 repainting over 5 s.

`gates/idle-compare.mjs` applies platform-idle's element rules (`score.mjs` voidReason) to V and N. It then requires,
per stop:
- each judged count of N within V's range, ± max(2, 10 %);
- each guard count of N at most V's max + tolerance;
- at Chrome's primary stop, N below C.

Result: **Chrome PASS, Simulator PASS.**
- One disclosure about the rule. My first version also held the guard counts (RenderingFrame, Composite) to a
  two-sided rule. N1's 49 rendering frames at the bottom fell below my two V loads (60 / 60), though inside P-077's own
  V range (41-60).
- platform-idle's rules treat guard counts as no-worse only, so I changed the comparer to match, after seeing these
  data. Fewer rendering frames is less work.
- The Simulator has no C loads here. P-077 already compared C and V there.

### morph-inherit: gate (a) user path in WebKit (`gates/inherit-scroll-sim.mjs C,M,N`)

Open the morph the way a user does (wheel push past the end), then close it:

| sample | C | M | **N** |
|---|---|---|---|
| open + 2 s: the children's computed `--morph` | 0 (panel 0.948) | 1 | **1** |
| open + 2 s: logo x | 43.3 | 169.3 | **169.3** |
| open + 2 s: earn button width / opacity | 110.4 / 1 | 0 / 0 | **0 / 0** |
| rest, closed + 2 s | same in all three | | |

At every sample, N equals M in every child's `--morph`, x and opacity, and in the earn box. At open + 0.25 s, every child
equals the header's live value in both M and N. C shows the F-183 bug, as expected.

### morph-inherit: gate (c) restyle counts in Chrome (`gates/restyle-chrome.mjs`)

Setup: the M driver, hold 1500, 2 cycles, 377-378 frames per run. Three holds: M N M N, C V C V, and one interleaved
C V M N N M V C.

| per run | C | V | M | **N** |
|---|---|---|---|---|
| UpdateLayoutTree | 647-657 | 649-651 | 648-652 | **650-652** |
| Layout | 380-385 | 385 | 380-385 | **381-385** |
| elements restyled | 6346-6492 | 7208-7260 | 5879-5907 | **6781-6831** |

- No extra style or layout passes in any arm.
- Elements restyled:
  - morph-inherit's saving is about -490 vs C (its README: 5929-6056 vs 6329-6348).
  - platform-idle **adds about +835 elements over the drive (~2.2 per frame)**. platform-idle never measured this; its
    README lists the morph (m > 0) as unverified (F-182). Posted as **F-188**.
  - N is 6789 (median). That is 61 above the additive prediction (V + M - C = 6728), which is inside C's own run-to-run
    spread (146).
- So the build adds nothing beyond the two fixes' own effects. OBSERVED, counts only.

## Pixel checks (same scene state, with a real A/A)

### Nav morph frozen frames

Chrome (`gates/reveal-frames.mjs`, headless 430x932 DPR 3, `__fwMorphSet(m)` at m 0, 0.002, 0.1, 0.25, 0.5, 0.75,
0.9, 1, 0; Date.now and the animations frozen). Diffs by `gates/reveal-diff.py`, which is morph-inherit's script
with multi-letter arm names and `--masks`. Two runs:
- **NH vs VH:** the pixels over 8 match the NH~NH2 A/A at every m (195-280), in the same box. That box is a 15 px patch
  at the top (y 33-46) whose bytes differ even between loads of the same build, so it is a per-load state, not a build
  effect.
  - The one exception: at m 0, about 10 more px over 8 sit on the platform dashes.
  - The same few px show between MH and VH2 in run 2 (10 px, max 14).
  - This is glint-phase noise between loads, not something only N has.
- **NH vs MH, m 0.1 to 1:** within the A/A. In run 2, MH~NH is 325 px at m 1, against the MH~MH2 floor of 240 px.
  - A thin line on the button edges (y ~608-613) and large areas below 8 LSB appear between some loads.
  - Hashing the crops shows the same state in loads of different builds, and different states in two loads of one
    build (NH~NH2). So it is per-load, not a build difference.
- **NH vs MH, m 0, 0.002 and the final 0:** extra pixels over 8 on the platform section's secure-network dashes
  (y ~225-228, the glint) and the shield. That is platform-idle's accepted visual change (PR-009), seen through the
  nav at the page end. morph-inherit's own README found this band in its C vs M frames too, and read it as glint
  phase.

Simulator (`gates/reveal-sim-frames.mjs NH,VH,MH,NH2`, the iOS Simulator, `simctl` screenshots, page band 60-834):

| m | NH~NH2 (A/A) max / over 8 | **NH~MH** max / over 8 | NH~VH over 8 |
|---|---|---|---|
| 0 (start) | 0 / 0 | 61 / 666 | 0 |
| 0.1 / 0.25 / 0.5 | 2 / 0, 1 / 0, 1 / 0 | **2 / 0, 1 / 0, 1 / 0** | 0, 814462, 1500069 |
| 0.75 / 0.9 / 1 | 1 / 0, 1 / 0, 1 / 0 | **1 / 0, 1 / 0, 1 / 0** | 2165038, 2483702, 51591 |
| 0 (end) | 1 / 0 | 236 / 1685 | 39077 |

- **NH equals MH within the A/A at every m > 0.** The children's `--morph`, x and opacity are identical to MH at every
  frame.
- At m 0, NH~MH differs on the sweep titles ("Secure", "Organized") and on the secure-network glint and shield: platform-idle's
  accepted change.
- VH (platform-idle without morph-inherit) shows the F-183 stale children from m 0.25 on: its child state differs from NH
  in 6 of 8 frames. This is the bug morph-inherit fixes, and it is gone in the build.

### Platform sweep and glint frozen frames (`gates/pi-frames.mjs`, from platform-idle's review probe9)

Arms N, V, P (V from a second server: the A/A floor) and C. Values are max LSB / differing px:

| viewport | sweep N~V | sweep P~V | glint N~V | glint P~V | sweep / glint N~C | reduced motion N~V |
|---|---|---|---|---|---|---|
| m430 | 1 / 2024 | 1 / 2415 | 3 / 8763 | 3 / 13000 | 9 / 56 | 0 |
| d1440 | 1 / 2132 | 1 / 2549 | 3 / 6373 | 3 / 7514 | 22 / 64 | 0 |

- N~V sits at the P~V floor.
- N~C repeats platform-idle's PR-009 numbers (m430 9 / 56, d1440 22 / 64).
- Every title stays one line, and `-webkit-mask-clip: text` is supported in every arm.
- d1440 reduced motion: P~V differs by 16 LSB on the dash crop. That is the face photos' known per-load raster state
  (platform-idle review round 1, probe10). N~V is 0.

### Whole page (`gates/page-frames.mjs`, from wi-stack's checka2)

Arms N, V, M and N2 at 430x932 DPR 3. Timers are cleared and the animations paused at 1000 ms. Values are the share of
pixels with a channel over 8:

| y | N~N2 (A/A) | N~V | N~M |
|---|---|---|---|
| 0 (hero) | 1.19 % | 0.97 % | 0.12 % |
| 2620 | 0 | 0 | 0 |
| 5346 (end) | 0 | 0 | 4 px (the dash, platform-idle's glint) |

- At the top, every pair varies between loads in the hero band (y 242-442), and the A/A is the largest.
- No pixel lands on the avatars in any pair.

## Scenarios not run

- Timing of any kind (the user's "defer timing" rule).
- The iPhone (not mine to touch; the Try-it and finger A/Bs that use this build are the lead's).
- Desktop widths other than d1440 for the morph.
- Firefox.
- The phone M driver on the build.
- carousel-leaver and cd-strip, which are not in the build.

## Files

| file | what |
|---|---|
| `build.mjs` | builds the best build from the component list (conflict check, strict applier, both orders) |
| `check.mjs` | the 17 identity checks |
| `selftest.mjs` | synthetic tests of build.mjs's applier and conflict rule (no Fastwork code) |
| `patch.diff` | the best build against the baseline (`fix.mjs diff best-build`) |
| `gates/arms.mjs` | arm table, pinned hashes, read-only snapshots in `out/snapshots/` |
| `gates/idle-chrome.mjs`, `gates/simcount.mjs`, `gates/idle-compare.mjs` | platform-idle idle-count gate |
| `gates/inherit-scroll-sim.mjs`, `gates/restyle-chrome.mjs` | morph-inherit gates (a) user path, (c) counts |
| `gates/reveal-frames.mjs`, `gates/reveal-sim-frames.mjs`, `gates/reveal-diff.py` | nav-morph frozen frames, Chrome and WebKit |
| `gates/pi-frames.mjs`, `gates/lib.mjs` | platform sweep and glint frozen frames (platform-idle's probe9 and helpers) |
| `gates/page-frames.mjs` | whole-page frozen frames (wi-stack's checka2) |
