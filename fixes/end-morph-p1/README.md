# Fix: end-morph-p1 (morph-gpu rev 1, PR-012 rev 1, ported onto v9.2 + 7d)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` and `delta.diff` contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** port built on v9.2 (7d); stopped. v9.2 is NO-LAND, so the port to v9-final (7c) goes to a new owner,
fix-end-morph-p1 (lead, 2026-10-05). These are the handover notes.
**Credit:** the change is fix-morph-gpu's PR-012 rev 1 (`fixes/morph-gpu/delta.diff`). The user accepted it on
2026-10-04 and it is not a new proposal. Rev 3's #platform `opacity: min(fade, .9999)` is already in v9.2.
**Build:** v9.2 (JS `941aa13e5bdf`, CSS `f1997edf5309`) + `delta.diff` (229 lines) = JS `d516c1599585`, CSS `f6a12bbb4517`.

## The port (what changed against rev 1)

- The JS block (`__rvMq`, `__rvOn`, ..., `__rvFin`, `__rvOff`, `__rvW`) is inserted unchanged after `__mkW`. The one
  call `__rvW(e[`--morph`])` goes after `__mkW(e[`--morph`])` in the header's template effect. The CSS block is
  appended at the end of the file. Only the credit comments differ from rev 1. The port script (scratch) did exactly
  this, with anchor checks.
- Checked against v9.2 by reading:
  - nav-earn rev 3: its WAAPI animates `translate` on the Join button and the language wrap, and `clip-path` on the
    earn box. The reveal moves the actions box (`ie`) and keeps its CSS `-50%`.
  - g11's close-hide keyframe on the panel's children.
  - 7d's per-frame `__navMorphSet`. `__rvW` runs from the template effect at any m, and is on only at 0.001 < m < 1.
  - No clashes in any of the three.
- Side effect: during the reveal the nav's rect is full size, so `F()`'s probe point moves to y 44 (v9.2: 47.9 -> 44
  over m 0.02 -> 1). The hit element and is-on-dark are identical to v9.2 at all 17 stops (Chrome, em-px2 STATE).

## Gates run (Chrome, `fixes/end-morph/gates/em-px2.mjs`, self-test 0 at all 18 stops)

| stop | 430x775 (`out/end-morph/px2-chrome-p1-2026-10-05T22-11-41-143Z`) | 430x932 (`px2-chrome-p1-932-2026-10-05T22-25-07-254Z`) | rev 1 reference (432x932, morph-gpu README) |
|---|---|---|---|
| pre (after the gate's page walk) | 0 | 36 css px² (EN label, max 126) | - |
| m 0.5 | 977 css px² (0.29 %, max 179) | 874 (0.22 %, max 177) | 855-869 (max 175) |
| m 0.99 | 6337 (1.9 %, max 236) | 4085 (1.02 %, max 237) | 5965-6013 (1.5 %, max 237) |
| m 1 at rest | 0 | 36 (EN label) | exact |
| m 0 after a close | 357 (Join label, max 236) | 36 | exact |

## The m = 0 "residue" (explained, OBSERVED, Chrome)

- `em-p1-dn0-probe.mjs`: at m 0 after a close, the DOM is identical in v9.2 and P1: rects (label left 311.594),
  computed translate, clip and filter, inline styles, and the animations list.
- `em-p1-dn0-raster.mjs` measured the Join label's first light column (css y 42):
  - v9.2: 316.67 before the zone, 317.67 after a close.
  - P1: 316.67 both times.
  - Forced repaints (button, nav) and removing the `.fw-rv-*` elements change nothing.
- So v9.2 itself draws the label 1 css px off after a close (a raster state after nav-earn's close animations). P1
  keeps the pre-zone render.
- Lead ruling (2026-10-05): P1's m 0 after a close is judged against the reference's PRE-ZONE render (0 beyond A/A).
  The card shows the reference's own post-close shift as a separate measured line.

## For the v9-final port

- v9-final (JS `647c9ef2b1e2`, CSS `e1359ab9994a`) has the 7c morph-scroll engine: `__msEnd`, `__msTick` and
  `__navMorphSet` all exist. `fixes/end-morph-f12/delta.diff` applies there with -F0, so the header template effect
  and `__mkW` likely match. Check nav-earn's state in v9-final before porting.
- Simulator counts for P1 on v9.2 are queued in my chain (`em-sim.mjs` arm, label s2). The result goes to the new
  owner.
