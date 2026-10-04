# Fix: v8-best (wave integration: v7 + countdown K + countdown faces + exact accent + morph rev 3 + one glue line)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** built and checked by bytes (40/40), function, frozen pixels and work counts (sections below); **not timed**
(memory `defer-timing-focus-call-tree.md`). Phone gate (less-work no-worse + whole-page fast-flick G): see "Phone gate".
PROGRESS row `v8-best` is `best: false` until the lead signs it.
**Integrator:** int-v8 (wave-integrator), 2026-10-04 (status board item `v8`, user T-114 #9).
**Build:** `patch.diff` (baseline-relative, 2 files) = JS `3e3e94cb6e9f…`, CSS `f836404b3728…` (the 8 parts alone, without the glue: JS `3b4774f9a6da`) (full hashes in
`results.json`); baseline snapshot `b1789284481295-4ad4a84a`.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, `/_app/immutable/assets/2.gBuqKVzi.css` (nothing else).

## Components and order

| # | component | patch (sha256/12) | made on | its own build (JS / CSS) |
|---|---|---|---|---|
| 1 | best-build (v4) | `fixes/best-build/patch.diff` 9bf4c6e41f11 | baseline | 65052c4a3902 / e0f92804c521 |
| 2 | hero R2 delta (v6 = B-R2) | `fixes/v7-best/hero-r2-delta.diff` a8daa419b791 | best-build | v6 8018ce062d30 / 71b65c667720 |
| 3 | cd-strip strip-tc (PR-008 rev 2) | `fixes/cd-strip/patch.diff` 4f2ff4eb9afa | st6-rb2 | 6fa0e1e8a221 / 982a747d9263 |
| 4 | **cd-roll-ca K** (PR-017 rev 5 land-k; replaces V9 d48095cc16ff, kept in 1bb87be9) | `fixes/cd-roll-ca/patch.diff` 0ba6f9a0b686 | cd-strip build | b43fe790c20c / 982a747d9263 |
| 5 | **countdown-faces (b)** hide while unseen + stopped 1 s interval | `fixes/v8-best/faces-delta.diff` (moved from `fixes/countdown-faces/patch.diff` 67a9dff1eda5) | v6 + strip + K (owner: mi + strip + V9, 3d70edb5bf31) | owner's V 9c098e608a0f / 982a747d9263 |
| 6 | rest-script v4 (P-094) | `fixes/rest-script/patch.diff` be2b46a3ceaf | st6-rb2 | 520d5f1139c7 / f523598b2a24 |
| 7 | **accent-ca exact** (PR-019 option exact, user-accepted) | `fixes/accent-ca/e1-delta.diff` 7d2156af3df8 (CSS only) | v7-best | accent-ca-v7 8c90da217745 / 7eda63cc7015 (`fixes/accent-ca-v7/patch.diff` 2779e3f31376) |
| 8 | **morph-gpu rev 3** (one CSS line, `.start-selling-platform` opacity `min(var(--morph-fade), 0.9999)`) | `fixes/morph-gpu/rev3/delta.diff` 47518661e2d0 | best-build | fd 65052c4a3902 / e4c80db5e0a8 |
| 9 | **glue** faces x hero R2 (F-235; lead ruling (b), agreed by fix-hero-exit-threaded and de-countdown) | `fixes/v8-best/glue-heup.diff` | v8 parts 1-8 (3b4774f9a6da) | v8 3e3e94cb6e9f / f836404b3728 |

Command (all 9 applied, no conflicts):

```sh
node tools/fix.mjs combine v8-best best-build fixes/v7-best/hero-r2-delta.diff cd-strip cd-roll-ca \
  fixes/v8-best/faces-delta.diff rest-script fixes/accent-ca/e1-delta.diff fixes/morph-gpu/rev3/delta.diff \
  fixes/v8-best/glue-heup.diff
```

Offsets (git apply's exact context): cd-strip CSS +276, rest-script JS +471 (its later hunks), morph rev 3 CSS +203; all
others 0. v7's combine with the cd-roll-ca slot now K, plus three parts.

### The one textual interaction: countdown-faces and the hero R2 delta

- **countdown-faces on K: unchanged.** The owner's patch (made on mi + strip + V9) applies on mi + strip + K with
  exact context, offsets only (+35, +42). K's change (V9 → K: `__crQ`, `__crPath`, `__crAt`, the `__crPlay`
  keyframes) and faces' change commute: faces build + (V9 → K) = faces on K, and back.
- **countdown-faces on the hero: one context line.** faces' hunk in the hero exit writer `s()` had `o = !1,` as its
  first context line; the hero R2 delta inserts its CSS-mode block (`heCss` … `heOff`) between `o = !1,` and
  `s = () => {`. `faces-delta.diff` is that patch with this one context line dropped (unique placement checked);
  every +/- line is the owner's, hunk for hunk (13 hunks). The hero delta in turn carries faces' first changed `s()`
  line as trailing context, so the hero goes before faces; with that line trimmed the other way round, hero-then-faces
  and faces-then-hero give the same bytes.
- **Behaviour (read from the code, not measured; finding F-235).** faces sets `__cdHeroShown` in `s()` next to
  `--exit-opacity`. In R2's live CSS mode (WebKit touch phones only: `GestureEvent`, coarse pointer, short side
  ≤ 600) `s()` does not run per frame: `heUp()` runs it once before going live (inside the exit range, so `shown` =
  true), and `heRest`/`heSc` park run it again. So while live, the hero clock is never held (C's own behaviour, it
  rolls unseen); it is held again once the page parks. It is never left un-shown on a visible clock, except with stale
  `heTop`/`heEnd` geometry, and then only for the IntersectionObserver's one-frame lag. Net: a little less saving on
  the phone while live, no visual change. Chrome never takes CSS mode, so only the Simulator and phone gates exercise
  this path. Told de-countdown and fix-hero-exit-threaded.
- **The glue line (component 9).** de-countdown found the one gap in that reading: `heEnd` is cached in `heArm` with
  that moment's `innerHeight`, `s()` reads the current one; after an iOS toolbar collapse (about +40 px) a go-live just
  under `heEnd` can compute r = 0, so `shown` = false and stays false while live, and a one-frame jump back into the
  fade range could paint one frame of held digits (code reading only, not observed). Lead ruling (b): `heUp` sets
  `__cdSet(__cdHeroShown, !0)` right after `s()` (`glue-heup.diff`, 1 line changed + 2 comment lines, applied last).
  fix-hero-exit-threaded agreed: with a fresh `heEnd` a go-live always has r > 0, so nothing changes there; with a stale
  one, the cost is at most digit updates under a hidden hero until `heRest` (300 ms after the last scroll) writes the
  real value; no effect on the hero's writes, classes, timers or pixels. `__cdSet` is Svelte's `set` (`z`): `s()`'s
  false and the glue's true in one task leave the state true before any effect flush.

## Identity checks (`node fixes/v8-best/check.mjs`, 36/36 ok)

Text only (40 checks), best-build's strict applier (exact context, no fuzz), plus a context-trimming applier used only for the
hero/faces pair (it never changes a +/- line and requires one unique placement):
- every input rebuilt from its committed patch equals its owner's hashes: st6-rb2, best-build, morph-inherit, hero R2,
  v6, cd-strip, cd-roll-ca V9 (from 1bb87be9) and K, rest-script, v7-best, accent-ca-v7 (and its e1 delta on v7),
  morph-gpu rev 3 (fd), countdown-faces' base C (3d70edb5bf31) and its V (9c098e608a0f);
- the faces rebase checks above;
- all 24 orders of the groups [hero + countdown], [rest], [accent], [morph] give the same bytes, and [strip, K] before
  the hero too; `fix.mjs combine`'s overlay equals the strict build; `patch.diff` on the baseline equals v8;
- the glue: one changed line + two comment lines, JS only; v8 − glue = the pure composition (3b4774f9a6da); the glue
  applied right after faces (before rest, accent, morph) gives the same bytes;
- by reversal, from the pure composition (v8pure = v8 − glue):
  - v8pure − morph − accent − faces = v7 with K, and that − K + V9 = **v7-best** (8c90da217745 / 308f0da70c3a);
  - v8pure − morph − faces − K + V9 = **accent-ca-v7** (8c90da217745 / 7eda63cc7015);
  - v8pure − morph − accent − rest − faces − K − strip = **v6** (B-R2);
  - v8pure − accent − rest − faces − K − strip − hero = **morph-gpu rev 3** fd (65052c4a3902 / e4c80db5e0a8);
  - v8pure − hero − morph − accent − rest − faces − (best − st6) = **cd-roll-ca K** (b43fe790c20c);
  - v8pure − hero − morph − accent − rest − (best − mi) = faces on mi + strip + K = **countdown-faces' build** + (V9 → K);
  - v8pure − hero − morph − accent − faces − K − strip − (best − st6) = **rest-script v4**;
  - v8pure − all = best-build;
- `node --check` on the v8 JS.

<!-- GATES -->

## Reproduce

```sh
node fixes/v8-best/check.mjs --json out/v8-best/check.json      # --write-faces-delta rewrites faces-delta.diff
node tools/fix.mjs combine v8-best best-build fixes/v7-best/hero-r2-delta.diff cd-strip cd-roll-ca \
  fixes/v8-best/faces-delta.diff rest-script fixes/accent-ca/e1-delta.diff fixes/morph-gpu/rev3/delta.diff \
  fixes/v8-best/glue-heup.diff
node tools/fix.mjs apply v8-v7base --from v7-best
node tools/lock.mjs run chrome-measure --shared --weight check --max-seconds 300 --owner <you> -- \
  node tools/fix.mjs check v8-best --on v8-v7base --viewport both --save
node fixes/v8-best/gates/snap.mjs                                 # out/v8-best/snap/{A=v7, V=v8, Q=accent-ca-v7}
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- node fixes/v8-best/gates/px-chrome.mjs mobile
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- node fixes/v8-best/gates/px-chrome.mjs desktop
node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner <you> -- node fixes/v8-best/gates/census-run.mjs A,V
node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner <you> -- \
  node tools/sim.mjs session --functional --owner <you> -- node fixes/v8-best/gates/px-sim.mjs <ys>
```
