# Fix: g0-gpu-g00 (g0.1a ported onto g0.0)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** measured; a record, not part of the g0 build (the lead's ruling, 2026-10-07). **On g0.0 the card-on-WAAPI step brings no gain. The remaining per-frame cost is the box re-layout (M3).** Parity gates pass. No timing A/B and no phone, by design.
**Stage:** F (build), step 1 (g0.1) of `research/gpu-original/README.md` §4, on top of g0.0
**Base:** g0.0 = fix-g0-revert's f75c1707 (`fixes/g0-revert/`, branch worktree-agent-a9afaa9dd6dd52a9d). JS 5c39f7a96e41, CSS 95f0eff3c57f. My base copy `out/g0-gpu/g00-base` is byte-identical to it.
**patch.diff:** **relative to g0.0**, not to the baseline (`a/` = g0.0's `_app/immutable/nodes/2.DyWL8TcE.js`, `b/` = g0.1a). Apply it on a `sh fixes/g0-revert/rebuild.sh <dir>` output. The JS becomes b97c83ef9edd; the CSS is unchanged.
**Files touched:** `/_app/immutable/nodes/2.DyWL8TcE.js`, g0.0's nav effect (`T`, `E`, the cleanup; pretty lines 14373-14480 of g0.0). No CSS.

## What it does

The design and the v0 version are in `fixes/g0-gpu/README.md`. The port changes the same three things on g0.0's
nav effect:

- **The card on Web Animations.** The menu card (`.start-selling-morph-panel`) gets opacity, blur and zoom as one
  Web Animation per tween:
  - keyframes at m 0.08 and 0.80, each segment with its exact cubic-bezier;
  - `startTime` = the tween's start `o`;
  - cancelled at the end, after the final `--morph` is written.
- **Svelte state by bucket.** `x` is written only when a template threshold flips: 0.001, **0.08** (g0.0's
  `__cdPanelShown`, the panel clock), 0.2, 0.35, 0.4, 0.55 and 0.92.
- **`--morph` writes.** The per-frame `--morph` goes to `__mkW`'s targets (nav root, bar `B`, logo `re`, actions
  `ie`, Join `oe`, language wrap `__ewWrap()`) but not to the card, so g0.0's registered, non-inheriting `--morph`
  (R4b) on the card stays at the last rest value during the tween. The animation sets the card's opacity, filter and
  transform itself.
- **#platform is unchanged:** g0.0's per-frame `S()`, with R4a's registered `--morph-fade`, the 0.9999 opacity
  clamp, the pointer-events bucket and the `data-fw-pf-paused` crossing.

## Gate 1: seek parity with g0.0

Same harness and scoring as the v0 version (`fixes/g0-gpu/gates/seek.mjs`, PR-010 four loads). The frozen clock
uses a fixed future date plus a warm-up open (F-338). Without that, g0.0's countdown-faces read made the panel
digits jump mid-capture.

| engine / viewport | stops | state mismatches | worst A~V level | stops with consistent px | max consistent css px² |
|---|---|---|---|---|---|
| Chrome 430x775 | 148 | 0 | 54 | 3 | 4 |
| Chrome 430x815 | 148 | 0 | 59 | 7 | 42 (the card's right-edge column, max 12; one isolated device px at 59) |
| Chrome 430x775, reduced motion (open, close, rev1) | 111 | 0 | 51 | 11 | 22 (anti-aliasing, as in the v0 version's reduced-motion run) |
| Simulator | 148 | 0 | 255 (status-bar clock) | 0 below the status bar | 0 |

## Gate 2: work per tween (counts)

Chrome (430x775, two loads per arm, `gates/counts-chrome.mjs`):

| per tween | g0.0 | g0.1a on g0.0 |
|---|---|---|
| elements restyled, open | 1307-1407 | 1313-1316 |
| elements restyled, close | 1357 | 1342-1357 |
| Paint calls, open | 285-315 | 338-339 |
| Paint calls, close | 379-380 | 409-422 |
| Layouts, open / close | 44-46 / 66 | 44 / 66 |
| first frame of open: restyled elements / paint calls | 201 / 7 | 201 / 8 |
| first frame of close | 12 / 6 | 12 / 7 |

Simulator (`gates/counts-sim.mjs`, one load per arm, real time, descriptive):

| per tween | g0.0 | g0.1a on g0.0 |
|---|---|---|
| open: style / layout / paint (paint Mpx) | 147 / 102 / 819 (67.6) | 148 / 102 / 855 (70.8) |
| close | 185 / 134 / 938 (47.2) | 187 / 138 / 984 (49.8) |
| frames 2-3 of a tween: paint rects | 10-14 | 9-14 |
| new layers vs L0 at closed rest | 0 | 1 (the card, 384x50, 0 MB) |
| memory at open / closed rest | 109.3 / 93.1 MB | 109.3 / 93.1 MB |

**Reading:** on g0.0, g0.1a does not do less measurable work.
- **Restyle:** R4a/R4b already keep each per-frame `--morph` write to a few elements, so there is nothing left to
  save there.
- **Paint:** the card's content still repaints every frame, because the nav box re-lays out every frame. The card
  becomes its own composited layer while it animates. That adds Paint calls in Chrome (+10-20 %) and about 4-5 % paint
  in the Simulator.
- **What would help instead:** the card's per-frame cost on g0.0 is the box layout (design §3.1 M3), not the
  card's fade.

## Gate 3: rest

- No g0 animation is left at rest.
- The running animations at rest are identical to g0.0's (Chrome rest census).
- Rest frame counts vary per load in g0.0 itself (one rest segment: 31 vs 91 main frames across two g0.0 loads), not
  from g0.1a. OBSERVED, cause unknown.

## Gate 4: reduced motion

g0.0's jump branch is unchanged: `__g0Rest` writes the final `--morph` and runs `S()`, and no animation starts.

## Notes

- **Not taken:** g0.1b on g0.0 (#platform on Web Animations, with a keyframe at the 0.9999 clamp), for the same
  WebKit layer rebuild as on v0 (F-337). Overlay `fixes/g0-gpu-g00--full/`, not committed.
- **No measurement code changed.**
