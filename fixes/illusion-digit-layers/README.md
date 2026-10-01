# Fix: illusion-digit-layers

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** draft (PoC; proposal to the user, awaiting accept)
**Stage:** R / I (counts only; user direction 19:27Z: no timing A/B)
**Device class / gate:** render-bound (layer count, phone GPU); Chrome shows the counts only
**Driver(s) behind the claims:** Chrome LayerTree census (counts, CPU 1x, n=1)
**Topic:** cheaper look-alikes, composite side (`research/design-engineering/illusion-composite.md`), stacked on B (`fixes/user-bplus`)
**Files touched:** `/_app/immutable/assets/2.gBuqKVzi.css` (3 rules appended after the cdwc rule)

## Why it costs

The sliding-number countdown (`$E`, JS 4023-4080 in the B overlay) renders each digit as 10 stacked faces
(0-9); `.face.svelte-1quva9c` (CSS 1414) has `will-change: transform`, so each face is its own composited layer:
8 digits x 10 faces = 80 layers for the hero countdown. In B the faces stay composited from y 0 to y 2700
(WillChangeTransform 83-86 at every census position), and the scene pause rule
(`[data-start-selling-scene=paused] :where(*) { will-change: auto !important }`) destroys and recreates all of
them at every hero scene flip. The spring writes `translateY` on the faces by rAF (parked at +-1 cell when idle,
countdown-idle-raf).

## What changed

`.face` gets `will-change: auto`; `.number.svelte-1jfovfa` (one per countdown number, 4 per countdown) gets
`will-change: transform`, so the faces paint into their number's layer. The morph panel's countdown keeps no layer
at all (the existing cdwc rule wins; the new `.number` rule is reset there too). Same transforms, same clipping
(`.digit { overflow: hidden }`), same pixels.

## Counts (hold 2, Chrome 430x932 DPR3 mobile+touch, CPU 1x, n=1, OBSERVED)

| position | B layers | PoC layers | B WillChangeTransform | PoC WillChangeTransform | repaints (layer paintCount, 2 s idle) |
|---|---|---|---|---|---|
| y 0 | 126 | 49 | 86 | 10 | PoC adds `span.number` 72x73 layer px, ~45/s (the seconds spring) |
| y 1250 | 138 | 66 | 85 | 10 | B 4.9 Mpx/s (hold 1) vs PoC 5.5 Mpx/s (nav earn button in both) |
| y 2700 | 138 | 61 | 83 | 7 | equal (future-card reveal 2/s) |

Reason counts cover the first 120 layers of the tree. B's hold-2 rows at y 1250 / y 2700 carry an artefact of the
probe (it resumed paused doc-sweep animations off-screen, `#document` 120/s); the hold-1 B rows (same build) have
none and are the reference for repaints. No console errors, no new 404s.

Screenshots (`out/dic/h2/shots/B-y0.png` vs `D-y0.png`, local only): the countdown differs only in the time shown.

## Why that is cheaper

Fewer layers: less layer-tree and compositor work per frame, less GPU memory (each face layer was 72x73 layer px
or so, but 80 of them), and ~76 fewer layer creations/destructions per hero scene flip. The cost moved to a small
repaint of one number box while a digit slides (~0.4 s per tick). On WebKit a repainted small layer costs about
0.14 ms (F-057, OBSERVED). Phone check needed for every gain.

## Risks, conflicts, follow-ups

- Implements the unscheduled N5 layer-diet / R6 "countdown strips" idea (owner fix-countdown-idle-raf); related to
  fix-nav-morph's P-037 (hero countdown tick) and the cdwc rule (P-017).
- Reduced motion: unchanged (the spring snaps; faces never move).
- Not done: per-flip layer churn counted directly; Safari Timeline records (needs the user's accept first).
