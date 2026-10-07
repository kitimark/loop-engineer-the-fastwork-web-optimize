# v3-W on g0.0c (Try-it build only)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

`patch.diff` = g0.0c (`fixes/platform-corners-g00b/patch.diff`, the best build since PR-035) + v3-W, baseline-relative
(site-pretty, snapshot b1789284481295-4ad4a84a). It exists only so the proposal's Try-it page B can be g0.0c + v3-W
(the console takes a baseline-relative `patch.diff`); A is `fixes/platform-corners-g00b/patch.diff`.

- Files: CSS f9b2f894dedf, JS 7f7d83162ef6 (g0.0c: c65da97ba01f / 5c39f7a96e41). Rebuilt from a fresh baseline copy
  with `patch -p1` and compared byte for byte with the measured build (`out/g0box/g00c-apply`).
- The fix itself, its mechanism, gates and numbers: `fixes/g0-box/` (`patch.diff` there is the same change relative
  to g0.0c).
- Stacks with fix-join-fade's block and fix-logo-close's delta in either order (dry runs, 2026-10-08).
