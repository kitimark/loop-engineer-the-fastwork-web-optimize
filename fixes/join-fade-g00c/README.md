# join-fade on g0.0c (Try-it build only)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

`patch.diff` = g0.0c (`fixes/platform-corners-g00b/patch.diff`, the best build since PR-035: JS 5c39f7a96e41 /
CSS c65da97ba01f) + the join-fade block appended to the CSS, baseline-relative (JS 5c39f7a96e41 unchanged, CSS
32a2bf7c17b0, rev 2). It exists so the proposal's Try-it page B can be g0.0c + the fix (A = g0.0c). The fix itself, its causes,
gates and numbers: `fixes/join-fade/` (standalone baseline-relative delta: `fixes/join-fade/patch.diff`, the same block
appended to the baseline CSS). Nothing else differs from g0.0c.
