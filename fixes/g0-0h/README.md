# g0.0h: g0.0f + PR-039 keep-phase (best-build candidate)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**What it is.** The user accepted PR-039 option keep-phase on 2026-10-08 at 18:08:51Z (rev 1, no notes). The lead's
GO names the resulting build g0.0h; "g0.0g" was the dropped isolation arm of P-168. g0.0h consists of:
- g0.0f, i.e. g0.0e plus v3-W (`fixes/v3w-g00e/patch.diff`), the current best build;
- plus keep-phase, built as P-168's arm f-B2 by `fixes/g0-box/phone/p168-build.py`:
  - **CSS:** while the morph scene is paused (menu closed), the panel's four column tracks get `animation: none`
    (de-offscreen's KO B). Under `prefers-reduced-motion: no-preference` they also get the keyframes' 0 % frame
    (±56 px), which holds until the first opening;
  - **JS:** `fwColScene` runs in the scene effect just before the attribute flips.
    - On pause, each track keeps its current frame as a static 2D `transform` and a negative `animation-delay`.
    - On resume, the inline transform is removed and the animation continues at the same phase.

**Why.** A paused keyframe effect on `transform` keeps its element composited (CONFIRMED, WebKit main 94a902b223,
`RenderLayerCompositor.cpp` 3902-3910). A static 2D transform does not (3949-3951). So the hidden menu's columns and the
layers that overlap them stop holding graphics memory while the menu is closed. This is a "does less work" change; no
frame-time gain is claimed (P-169, below).

**Pins** (sha256, first 12):

| file | g0.0f | g0.0h |
|---|---|---|
| `_app/immutable/nodes/2.DyWL8TcE.js` | 30fd80ccbb3f | 9162843e750f |
| `_app/immutable/assets/2.gBuqKVzi.css` | 1d1e5d62a2c4 | 26d28a0a263b |

- `patch.diff` is baseline-relative (`node tools/fix.mjs diff g0-0h`). Applying it to fresh `site-pretty` copies
  (`node tools/fix.mjs apply g0-0h --reset`) gives the pins above (checked 2026-10-08).
- `delta.diff` is g0.0f → g0.0h: one CSS block appended at the end, plus the `fwColScene` helper before `cE` and one
  call in the scene effect (JS ~14711).
- The CSS block's comment still reads "[P-168 f-B2] … diagnostic only", from the measured build. It is left unchanged
  so that the bytes stay the ones measured and gated below.

**Evidence** (the less-work landing rule: cost-card counts plus a short phone no-worse check; accepted by the lead):

| check | g0.0f | g0.0h | where |
|---|---|---|---|
| layers / graphics memory at the top of the page (Simulator, 1 load) | 158 / 27.6 MB | 152 / 12.4 MB | `fixes/g0-box/README.md` "colpause" |
| column jump at re-open, Chrome / Simulator (3 cycles; 1 frame of motion is 0.14-0.16 px) | 0-0.19 / 0-0.36 px | 0-0.18 / 0-0.34 px | same, `gates/colphase.mjs` |
| jump at pause / drift while paused | 0-0.02 / 0 | 0-0.02 / 0 | same |
| phone no-worse, P-169 (tool-serious, W + Timeline, window B, 3 counted runs each): `+is-play` frame dt, median | 71 ms | 69 ms | `fixes/g0-box/README.md` "P-169 result" |
| P-169: scroll-phase frames > 30 … > 54, medians | 1 / 1 | ≤ g0.0f at every threshold | same |

- Visual: none found in Chrome or the iPhone Simulator (PR-039 shots: the menu's second opening + 0.8 s,
  `fixes/g0-box/gates/colshot.mjs`).
- Not checked on g0.0h: the end-of-page G (finger-gesture) menu open/close on the phone. fix-menu-layers runs the
  combined menu open/close phone check with its clock-layer change on top of g0.0h (lead, 2026-10-08).

**Open on top of g0.0h:**
- fix-menu-layers: the panel clock on its own layer while the menu is open (de-offscreen T-253 item 2).
- fix-g0-box: the drag-down candidate 1 (lift the panel's `inert` off the drag, attach the touch jack near the end),
  stacked on g0.0h.
