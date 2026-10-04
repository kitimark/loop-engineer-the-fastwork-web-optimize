# Fix: accent-ca-v7 (the exact accent boil, PR-019 option "exact", on v7)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** ready to land (user accepted PR-019 option `exact`, 2026-10-04 13:09Z); "less work" rule: cost counts
below, the short phone no-worse check comes in v8's phone block (lead).
**Build:** `patch.diff` (baseline-relative, 2 files) = v7-best (JS `8c90da217745`, CSS `308f0da70c3a`) +
`fixes/accent-ca/e1-delta.diff` (CSS only) = JS `8c90da217745`, CSS `7eda63cc7015`. Made with
`node tools/fix.mjs combine accent-ca-v7 v7-best fixes/accent-ca/e1-delta.diff`; the delta applied cleanly (no rule
it touches is changed by v7's components).
**Files touched (delta):** `/_app/immutable/assets/2.gBuqKVzi.css`, the accent block `.svelte-1fn2go6` only.

What it does, why, every check and the cost card: `fixes/accent-ca/README.md` ("On v7: land build").
