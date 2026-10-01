# Dry combine: wave 1 (no measurement)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). The overlay contains Fastwork's code: it stays local and uncommitted.

**Status:** dry combine only. No Chrome, no `fix.mjs ab`, no locks (host overloaded, incident I-016).
**Purpose:** find patch conflicts between the wave-1 topics now, so the real `all-wave1` combine is
mechanical. Wave 2 (`hero-exit-scroll-timeline`, `scroll-engine`) waits for it.
**Date:** 2026-10-01, on `main` at `9c43258`; re-checked with layout-animations 05 on `main` at `e99bcc5`.

## Re-check 2: layout-animations 05 (supersedes the input table below)

**Clean.** All 9 apply, reverse order gives byte-identical output (JS sha256 `89924417…1384b`, CSS
`b1858ae2…e6c`), and `node --check` passes. Inputs (sha256 of `patch.diff`):

| topic | source | sha256 |
|---|---|---|
| phone-invisible-shrink | `main` | `5e42555d4191d0a72dbfdb0f5a0c6c6567408d320bc11ed8ecaaad835fc7aede` |
| commission-forced-layout | `main` (`1cbe7b6`) | `9897e36c47d7a357fce1a05e3002d2cb91e6b8cc507c3403edf68ce2e9704099` |
| layout-animations **v10** | `main` (`5602e1d`); supersedes 05 (`6504253b…`) and 03 (`70f90017…`) | `7bf120165d54b4a79ecf89a4919ceff1432165eea019a21c9f501691ba76d7ba` |
| pain-offscreen-notes | `main` (`e26f7f3`) | `71f64449e9e6723fcee4437e24600452a4542e28d604af5dd7a94a3097e67895` |
| countdown-idle-raf | `worktree-agent-a03218c7c8f9587ed` @ `b6fdbff` (variant 03) | `160d69a043f1bcee9d86bf3c02fc9197907253ce2be9ff0b768b8bfb92fd9d17` |
| large-area-blur | `main` (`3a79f4b`) | `db12ccec57a1e93afb5c8dccd57f6597a822ceb9c032d0125cbae0b86a28e840` |
| nav-hit-test | `main` (`8b325c5`) | `e1f84630d19abc1a8c7cf146818eb10a56c824c00b75b2efc8f22be2ba36b211` |
| morph-scrolljack-passive | `worktree-agent-a277ea00c8773c1ea` @ `4eac79f` (variant 04) | `5f116f817edde26fe3483f5a6b5d9d8d568ade4efbc184b0e32e8d1cc3f532b0` |
| morph-panel-lazy-mount **v03** | `land/morph-panel-lazy-mount` @ `f5ca72e`; replaces v01 (`39072167…`) | `06c0b10c42f1bdf6f3f3fb23afca16608dde69f808d3955e22405c7c326fe900` |

**Update, layout-animations v10** (landed `5602e1d`, sha `7bf12016`). v10 = 03's RTL flip restored (the
sign flip under `html[dir=rtl]` was correct, per the owner) + 05's sweep-gate teardown. JS hunks:
- **20-26** (baseline 20-25, patched 20-26), the chunk import list: adds `X as PMpre` (Svelte `$effect.pre`). It occurs 0 times in the baseline,
  and no other patch touches the import block.
- 2587, 3669, and **3782-3790** (baseline lines): `HEflip` with the RTL sign, and `PMsweepGate`, which unobserves its titles in a
  `PMpre(() => () => …)` teardown. countdown-idle-raf's first hunk at 3824 is still separate.
- 12652.

The CSS hunks are the same as 03/05. A re-run of the combine with v10 instead of 05, and **without
morph-scrolljack-passive** (#6 is iPhone-gated and out of the combine), applies all 8 patches cleanly, and
`node --check` passes. Input order: phone-invisible-shrink, commission-forced-layout, layout-animations,
pain-offscreen-notes, countdown-idle-raf `160d69a0`, large-area-blur, nav-hit-test, morph-panel-lazy-mount
**v03** `06c0b10c` (`land/morph-panel-lazy-mount` @ `f5ca72e`; replaces v01 `39072167`).

lazy-mount v03 vs v01: the same five JS hunks (13099, 13140, 13157, 13193, 13210). The new mount effect
also waits while the page is scrolling: a passive `scroll` listener, and a 300 ms re-arm before `z(__mnt, !0)`.
All its new names are locals inside that closure, except `__mnt` (as before). The `get active()` getter for
the panel countdown is unchanged, so coupling 1 below still holds. The 8-patch combine with v03 applies cleanly
and `node --check` passes.

Changes against the first dry run:

- **layout-animations 05 vs 03.** Three changes. (1) New JS hunk at 20-25, the chunk import list: `X as PMpre`
  (Svelte `$effect.pre`, per the owner). `X` was not imported before, and `PMpre` occurs 0 times in the
  baseline. No other patch touches the import block. (2) The accent hunk grows from 3782-3790 to 3782-3791
  (the context now runs to `function GE`): `HEflip` has no RTL flip, and `PMsweepGate` unobserves on teardown.
  countdown-idle-raf's first hunk still starts at 3824, 33 lines below, in another component; no overlap.
  (3) The other hunks (2587, 3669, 12652, and CSS 564, 1226, 2884, 5799) are unchanged apart from +1 line
  offsets.
- **morph-scrolljack-passive is now variant 04** (sha `5f116f81`; the first run used variant 01, `5f60b7a6`).
  The JS is identical. It adds one CSS hunk at 5385-5390: `@property --morph-fade { inherits: false }` before
  `.start-selling-platform`. Its nearest neighbour is layout-animations CSS 5799; large-area-blur doesn't touch
  it (conflict D: the `--morph*` rules belong to topic 6). In the baseline, `--morph-fade` is read only by
  `.start-selling-platform` itself (CSS 5392-5393) and written by JS 13017.
- **countdown-idle-raf:** the committed version (`b6fdbff`) now equals the working copy used before
  (`160d69a0`, with `__cdActive`). Coupling 1 below is satisfied by the committed version.
- **commission:** the landed version is the fixed one (`_cc`); the stale `_cy` note under "Inputs" no longer
  applies.

## Result

```sh
node tools/fix.mjs combine wave1-dry phone-invisible-shrink commission-forced-layout layout-animations \
  pain-offscreen-notes countdown-idle-raf large-area-blur nav-hit-test morph-scrolljack-passive morph-panel-lazy-mount
# all 9 patches applied
node --check fixes/wave1-dry/overlay/_app/immutable/nodes/2.DyWL8TcE.js   # OK
```

- **All 9 patches apply cleanly** (`git apply`: exact context, no fuzz; only line offsets from the earlier
  patches). **No textual conflict, no overlapping hunk.**
- **Order-independent:** the same 9 patches in reverse order give byte-identical overlay files
  (JS sha256 `ab9c928b…006a`, CSS `213e21d3…4d25`). The order above can stay; any order works.
- All patches were cut from the same baseline: every `# base-sha256` header matches the current
  `site-pretty/` (JS `4606120c…acff5`, CSS `27776f3d…82f5c`).
- The "nav-hit-test" cluster (topics 3 + 6 + 13, owner fix-nav-morph) is **three patches**:
  `nav-hit-test`, `morph-scrolljack-passive`, `morph-panel-lazy-mount`. Combine all three.

## Inputs (check these before the real combine)

`sha256sum fixes/<topic>/patch.diff` must match. If an input changed, re-run this dry combine.

| order | topic | source used | committed? | sha256 of patch.diff |
|---|---|---|---|---|
| 1 | phone-invisible-shrink | `main` | landed | `5e42555d4191d0a72dbfdb0f5a0c6c6567408d320bc11ed8ecaaad835fc7aede` |
| 2 | commission-forced-layout | worktree `agent-a53f4ec08506b7442` (working copy) | **no**, see below | `9897e36c47d7a357fce1a05e3002d2cb91e6b8cc507c3403edf68ce2e9704099` |
| 3 | layout-animations | `main` | landed | `70f900178a85b194c64f49fc2f72e8791a81480be366977d642d0274d68622fc` |
| 4 | pain-offscreen-notes | worktree `agent-a700c6e710c364d49` | **no** (nothing on the branch) | `71f64449e9e6723fcee4437e24600452a4542e28d604af5dd7a94a3097e67895` |
| 5 | countdown-idle-raf | worktree `agent-a03218c7c8f9587ed` (working copy) | **no**, see below | `160d69a043f1bcee9d86bf3c02fc9197907253ce2be9ff0b768b8bfb92fd9d17` |
| 6 | large-area-blur | worktree `agent-a4091af4a88270aa0` | **no** (nothing on the branch) | `db12ccec57a1e93afb5c8dccd57f6597a822ceb9c032d0125cbae0b86a28e840` |
| 7 | nav-hit-test | worktree `agent-a277ea00c8773c1ea` | **no** (nothing on the branch) | `e1f84630d19abc1a8c7cf146818eb10a56c824c00b75b2efc8f22be2ba36b211` |
| 8 | morph-scrolljack-passive | worktree `agent-a277ea00c8773c1ea` | **no** | `5f60b7a6ef45b09cedf992016851ecaec504088523214b011c7ef34b7c001411` |
| 9 | morph-panel-lazy-mount | worktree `agent-a277ea00c8773c1ea` | **no** | `39072167b15d04693d356b125c93a4e8c2d06e9bf9049b014b1a99a3f3367b79` |

**Committed versions are stale for two topics.** The dry combine used the owners' newer working copies:

- `commission-forced-layout`: branch `worktree-agent-a53f4ec08506b7442` @ `623735f` has patch sha256
  `b02892f1…9db78`, the **pre-review version with the P1 bug**: a replace-all `cy` → `_cy` that also rewrites
  the module-level `cy` locale function and six SVG `<circle cy=…>` attributes. The working copy (`_cc`, only
  inside `a`) fixes that. The owner must commit the working copy before landing.
- `countdown-idle-raf`: branch `worktree-agent-a03218c7c8f9587ed` @ `630d944` has patch sha256
  `2feaf189…05e3`, **without** `__cdActive` (the `active` prop). `morph-panel-lazy-mount` relies on it (see
  below). The owner must commit the working copy before landing.

## Per-patch status and hunks (pretty baseline lines)

JS = `/_app/immutable/nodes/2.DyWL8TcE.js`, CSS = `/_app/immutable/assets/2.gBuqKVzi.css`. Ranges are the
hunk ranges in the baseline (`node tools/fix.mjs show <file> --lines a-b`).

| topic | status | JS hunks | CSS hunks |
|---|---|---|---|
| phone-invisible-shrink | clean | 10776-10786 (profile `oe`/`ce`), 11294-11373 (future effect, `l`), 12433-12453 (platform) | none |
| commission-forced-layout | clean | 3103-3127 (commission `a`) | none |
| layout-animations | clean | 2587-2593 (fee progress), 3669-3675 + 3782-3790 (`HE` accent, new module fns `HEflip`, `PMsweepIO`, `PMsweepGate`), 12652-12657 | 564-572, 1226-1235, 2884-2904, 5799-5804 |
| pain-offscreen-notes | clean | 4726-4731 (pain `d`) | none |
| countdown-idle-raf | clean | 3824-3963 (`$E` digit, `cD`), six hunks | none |
| large-area-blur | clean | none | 2400-2415 (future-card reveal), 6513-6528 (cred card), 7509-7529 (profile phone) |
| nav-hit-test | clean | 12952-12968 (`F`, `ee`, new `__navEls`/`__navEl`), 12999-13005 (`_`) | none |
| morph-scrolljack-passive | clean | 12987-12993, 13009-13015, 13023-13029, 13045-13087 (nav `ne` block) | none |
| morph-panel-lazy-mount | clean | 13099-13104 (new `__mnt` effect), 13140-13216 (panel template, `cD` call) | none |

Closest neighbours: `nav-hit-test` and `morph-scrolljack-passive` interleave inside the same nav `ne(() => …)`
block (12952-13087), 4-19 lines apart, disjoint (same owner; conflict B). `layout-animations` 3782-3790
and `countdown-idle-raf` 3824 are 34 lines apart, in different components. In CSS, `large-area-blur`
2400-2415 and `layout-animations` 2884 are far apart.

## TOPICS.md conflicts and FINDINGS checks

- **C (commission `a`, topics 4/5):** resolved by design. Only `commission-forced-layout` touches `a`
  (3103-3127); `phone-invisible-shrink` has no hunk there. The FINDINGS coupling "nav hit-test reads the
  commission `entering`/`shrinking` classes" holds: the commission patch keeps both toggles (`z(g, …)`,
  `z(v, …)`) and its rect reads on phones.
- **E (future `l`, topics 4/7):** in wave 1 only `phone-invisible-shrink` touches `l`. In the combined file
  both side jobs are intact and outside the phone gate: the `.hero-track` read (`z(y, …)`) and the `.pain`
  `is-pain-dark` toggle. Wave 2 `hero-exit-scroll-timeline` rebases onto this.
- **D (blur CSS):** `large-area-blur` touches none of the `--exit-*` (hero) or `--morph*` rules.
- **A (engine):** no wave-1 patch changes `rE`/`iE`/`aE`/`dE`/`uE` (2663-2780) or a `dE(...)` call.
- **P1 (short-name shadowing):** every identifier the patches add occurs 0 times in the baseline, and no
  name is added by two patches: `reducedMotionMq`, `desktopMq`, `shrinkOffMq` (twice by the same patch, in two
  separate closures), `_cq`, `_cc`, `_ce`, `_cs`, `_ch`, `_ve`, `_vs`, `_vh`, `__cdAnimate`, `__cdVisible`,
  `__cdActive`, `__cdIo`, `__navEls`, `__navEl`, `__atEnd`, `__pf`, `__end`, `__mnt`, `pwAccent`, `HEflip`,
  `PMsweepIO`, `PMsweepGate`. New CSS names (`start-selling-entry-blur-in`, `avatars-shift`,
  `data-sweep-paused`, `--fee-progress`) are new too. (`__ctaBellC`, in lazy-mount's context lines, is in the
  baseline.) The stale committed commission patch would fail this check (`_cy`, see Inputs).

## Semantic couplings (no conflict, but the real combine must keep them together)

1. **`morph-panel-lazy-mount` needs `countdown-idle-raf` (working-copy version).** Lazy mount mounts the
   panel, and with it the second countdown `cD`, from load instead of ~3 screens before the end. It passes
   `get active() { return s(E); }`, which only the working-copy countdown patch reads (`__cdActive`, used in
   the digit `animate` getter). With the committed countdown patch, or without countdown, the invisible panel
   countdown springs for the whole visit (the lazy-mount README says so). Don't land or measure lazy mount
   without it.
2. **`morph-panel-lazy-mount` needs `nav-hit-test`.** Without it, the baseline `pointerEvents` toggle on the
   nav root restyles the always-mounted panel every scroll frame (lazy-mount README).
3. So leave-one-out ablations `all-wave1--minus-countdown-idle-raf` and `--minus-nav-hit-test` also degrade
   lazy mount; read them as "minus both", or drop lazy mount in those runs.
4. `countdown-idle-raf` README "Overlap" says only `cD`'s body changed; since `__cdActive` it also defines the
   `active` prop contract that the nav/morph owner uses. Worth a line in that README.

## For the real combine

Same order (or any order), same 9 inputs, check the sha256 table first. Expect `all 9 patches applied`; no
hand resolution needed. Then `node --check`, `fix.mjs serve` + `curl` for `x-mirror-source: overlay`, and
`fix.mjs ab all-wave1 --runs 5` on a quiet host.
