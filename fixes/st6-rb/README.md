# st6-rb: rotator-st6 on RB, with the scene-arm coupling (PR-003 option A build)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

Owner: `fix-scroll-engine` (st6 owner since 2026-10-02, lead). Status: **checked; phone ticket A1 confirmed option A
(2026-10-02 ~10:0xZ), ready to land with A's outcome (lead).** This is the build for PR-003 option A, which the user
accepted at 09:12Z: RB + st6, without blur-cubic. wi-stack wrote A's ticket and ran its checks (sections below).

## Build

```sh
node tools/fix.mjs combine st6-rb user-bplus scene-scope rotator-st6   # RB + st6; 0 conflicts, no fuzz
# then the one coupling edit below in fixes/st6-rb/overlay/_app/immutable/assets/2.gBuqKVzi.css
node tools/fix.mjs diff st6-rb                                          # patch.diff: the full build from the baseline
node tools/fix.mjs apply st6-rb                                         # rebuild the overlay from patch.diff
```

| build | `nodes/2.DyWL8TcE.js` | `assets/2.gBuqKVzi.css` |
|---|---|---|
| RB (C) | `dbd5fdb4f1fb` | `0d7dfc79e703` |
| RB + st6, combine only | `59b23b3f57fd` | `e9603231b413` |
| **st6-rb** = RB + st6 + coupling | `59b23b3f57fd` | `d22542d0b5f8` |
| stack5 (RB + blur-cubic + st6), for reference | `59b23b3f57fd` | `6e09b2c708fa` |

The JS is stack5's byte for byte (blur-cubic is CSS only).

## The coupling (scene-scope R4)

RB's scene arm sets `will-change: auto !important` on every element whose CSS asks for `will-change`, once its scene is
paused. The list predates st6, so st6's persistent slot layers (`.start-selling-avatars.is-carousel img { will-change:
transform, translate, opacity }`, `rotator-st6/patch.diff`) stayed composited while their scene was paused (wi-stack,
stack5 README "Interaction"). The fix-scene-scope owner agreed that whichever fix lands second adds the selector, and that
is st6. One selector joins the arm, CSS ~11955:

```css
.start-selling [data-start-selling-scene="paused"] .start-selling-avatars.is-carousel img,
```

The arm's `!important` beats st6's rule, which is not `!important`, only while the scene is paused. In an active scene
st6 keeps its layers for the page's life, as designed. RB's scene gate flips at ±1 vh, off screen, so the layers are
dropped and re-made away from the viewport. The animation pause already covered these imgs (`.start-selling-avatars img`
is in RB's pause list).

## Checks (wi-stack, functional shared lane, no timing)

The A1 phone block measured **NB = RB + st6, combine only** (CSS `e9603231b413`), the build ticketed before this
coupling edit existed (lead: "Do NOT change A1's arms now"). The lead's rule: A lands as st6-rb, with no extra phone
block, if st6-rb and NB are equal by mechanism and pixels. They are:

| check | tool | result |
|---|---|---|
| computed `will-change` on `.start-selling-avatars.is-carousel img` | headless Chrome 430x932, hold `c2` | st6-rb: `auto` only while the scene is paused, st6's list while it is active; NB keeps st6's list in both. As designed. |
| pixels, frozen clock (every timer cleared, every animation paused at 1000 ms), n=3 loads per arm interleaved, A/A NB~NB on the same clock | Chrome, `checka2` (`a430`, `a1440`) | 430 y4000 (paused scene): **0 px** in all 15 pairs. 430 top: A/A 0.036-1.179 %, A/B 0.069-1.180 %, **0 px on the avatar imgs**; diffs only in the hero morphing word and the countdown seconds. 1440 y4000 (scene still active there): 0-0.001 %. 1440 top: A/A 0.067-0.852 %, A/B 0.060-0.848 %. **Pass**: A/B within A/A, no avatar pixels. |
| layers and backing store (Simulator 15 Pro Max, `LayerTree`, hold `s1`; Sim numbers, never phone memory, n=1-2) | `layers.mjs` | top 123 layers / 50 MB (NB 125/123, 51/50); hero 123 (NB 123); `#people +is-visible` 129 / 115 MB (NB 132/129, 119/115). Paused scene (y≈3490): 46 layers, the 5 avatar layers gone (V 51 there). |

All OBSERVED in our setup (Chrome headless, Simulator). The pixel and mechanism checks say st6-rb = NB everywhere
except the paused scene, where st6-rb drops the 5 avatar layers as intended.

## Phone ticket A1 (iphone-runner, 2026-10-02, 1 block, S driver; ticket and decision rows in `fixes/stack5/README.md`)

Arms C = RB, V = stack5, NB = RB + st6 (combine only; see above). All 9 counted runs valid; sentinels pass (open
60.2/58.2, end 60.2/58.1 fps bottom/scroll), every C run passes the sentinel bar; battery 37.3 -> 39.4 °C; load1
3.5-5.7, shared jobs beside most runs (each record's `mac`). Scored with `out/wi-stack/lag/frame2.py` and
`tools/stats.mjs` (wi-stack re-ran both).

| row | C | NB | V | reading |
|---|---|---|---|---|
| 1. #people frame 2 (ms) | 42, 42, 37 (med 42) | 52, 41, 44 (med 44) | 79, 74, 72 (med 74) | NB within C ± 8 and all NB below all V: **A confirmed** |
| frame 2 >50 | 0/3 | 1/3 (52 ms) | 3/3 | NB is **threshold-sensitive**: >46 1/3, >54 0/3 (52 in the near band (46, 54]) |
| 2. idle dt>34 | 3, 2, 4 (med 3) | 0, 0, 0 | 0, 0, 0 | st6 carries the idle gain; A keeps it |
| 3. scroll dt>50 | 1, 1, 2 (med 1) | 2, 1, 2 (med 2) | 1, 3, 3 | NB +1 over C, not more: no regression |
| 4. scroll dt>34 | 7, 6, 10 | 9, 8, 7 | 11, 8, 7 | context only; scroll fps 57.8-58.5, bottom 60.0-60.2 everywhere |

Prediction P-062 (`fixes/PREDICTIONS.md`): every interval hit. n=3 per arm, one block, one phone: a small sample, and the
scroll rows are within noise.

## Not done here

- No Chrome timing A/B: deferred per the user's direction, as for st6.
- A1 measured NB, not st6-rb itself; the two differ only in the paused scene (checks above), which A1's metrics do not
  touch (frame 2 and the idle phase are in active scenes).
