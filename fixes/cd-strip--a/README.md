# Fix: cd-strip--a (rejected variant of cd-strip)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** rejected (2026-10-03). This is arm (a) of `fixes/cd-strip/`: the same JS, but without the CSS rule that
keeps the morph panel's digit strips unlayered, so the panel clock's 8 strips get their own layers.
Stacked on st6-rb2 (`node tools/fix.mjs apply cd-strip--a --on st6-rb2`).

Why it is out (details, raw files and cards in `fixes/cd-strip/README.md`):
- Not pixel-identical to st6-rb2 in the panel (Chrome frozen frames): 67 of 169 shots differ by 21-32 px, in moving
  frames only. st6-rb2 paints the panel faces unlayered (cdwc), and layered glyphs rasterise differently at
  fractional offsets.
- Simulator: every strip repaints on every frame of the panel's scale tween (6-12 of 12 frames in each tween's first
  450 ms, rects follow `scale(0.96 + 0.04·--morph)`). Arm (b) and st6-rb2 have 0. Arm (a) only wins the steady hold
  (2 instead of 14-35 clock-paint frames of ~78), and arm (b)'s hold paint frames are not long ones.
- +2.06 MB of layer memory at the pin. fix-nav-morph (cdwc owner) agrees: no phone block, no (a2).
