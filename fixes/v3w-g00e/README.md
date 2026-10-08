# g0.0f = g0.0e + v3-W (PR-038 on the current best build)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

`patch.diff` = g0.0e (`fixes/g0-0e/patch.diff`: g0.0c + join-fade PR-036 + logo-close PR-037, main 8bc50d29) + v3-W
(PR-038, accepted 03:04Z), baseline-relative (site-pretty, snapshot b1789284481295-4ad4a84a), CSS then JS.

- Files: CSS 1d1e5d62a2c4, JS 30fd80ccbb3f (g0.0e: d4e684032482 / 5c39f7a96e41). g0.0e and g0.0c share the JS, so
  v3-W's JS is the same file as on g0.0c; its CSS block applies to g0.0e without offsets or fuzz (the join-fade block
  is appended at the end of the file, logo-close changes one declaration above v3-W's block).
- Rebuilt from a fresh baseline copy with `patch -p1` and compared byte for byte with the build made as
  g0.0e + `fixes/g0-box/patch.diff` (`out/g0box/g00f`).
- The fix itself, its mechanism, gates and numbers: `fixes/g0-box/` (`patch.diff` there is the same change relative
  to g0.0e). The gates of g0.0f against g0.0e are in `fixes/g0-box/README.md` "On g0.0e".
