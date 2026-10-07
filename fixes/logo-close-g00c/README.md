# logo-close on g0.0c (Try-it build)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

`patch.diff` = g0.0c (`fixes/platform-corners-g00b/patch.diff`, JS 5c39f7a96e41 / CSS c65da97ba01f) + the logo-close
rule, baseline-relative (JS 5c39f7a96e41 unchanged / CSS 2a4ab9ec9acc). It exists so the proposal's Try-it page B can
be g0.0c + the fix (A = `fixes/platform-corners-g00b/patch.diff`). The fix itself, its cause, the gates and numbers:
`fixes/logo-close/` (standalone delta against g0.0c: `fixes/logo-close/delta.diff`, one declaration in the CSS's
`@media (width<=640px)` block). Nothing else differs from g0.0c.
