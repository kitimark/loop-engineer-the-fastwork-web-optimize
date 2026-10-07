# platform-corners on g0.0b (Try-it build only)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

`patch.diff` = g0.0b (`fixes/g0-revert/patch.diff`, main 45a2d3ee, PR-034 rev 2) + the platform-corners rule,
baseline-relative. It exists only so the proposal's Try-it page B can be g0.0b + the fix (the console takes a
fix's `fixes/<topic>/patch.diff`). The fix itself, its cause, gates and numbers: `fixes/platform-corners/`
(standalone baseline-relative delta: `fixes/platform-corners/patch.diff`, 7 lines appended to the CSS).
Nothing else differs from g0.0b; the JS file is g0.0b's unchanged.
