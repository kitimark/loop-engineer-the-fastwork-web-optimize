# GPU preview: the best build plus the three GPU fixes, for trying by hand

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** built; text identity checks pass; Chrome and Simulator checks below (counts and pixels, no timing).
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

## Checks (no timing, no phone)

Pending: filled in from the shared-lane runs (`gates/run-all.sh`).
