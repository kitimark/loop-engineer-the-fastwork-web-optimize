# st6-rb: rotator-st6 on RB, with the scene-arm coupling (PR-003 option A build)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

Owner: `fix-scroll-engine` (st6 owner since 2026-10-02, lead). Status: **prepared, not measured.** This is the build
for PR-003 option A, which the user accepted at 09:12Z: RB + st6, without blur-cubic. wi-stack writes A's ticket and
runs its checks.

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

## Not done here

- No browser check yet. wi-stack's A ticket runs the functional checks: computed `will-change` on the avatar imgs in a
  paused and an active scene, the layer count, and pixels against `RB + st6, combine only`.
- No timing. That is deferred per the user's direction, as for st6.
