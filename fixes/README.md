# fixes/: one directory per scroll-performance fix

Each fix is developed in its own git worktree, served on its own port on top of the shared mirror
baseline, measured A/B against that baseline under a cross-worktree lock, and delivered as:

```
fixes/<topic>/
  README.md      why it lags (evidence), what changed, why that is faster, before/after table
  patch.diff     unified diff of overlay vs baseline (URL paths; Fastwork excerpts: local branches only)
  results.json   fix.mjs ab output: medians, min-max spread, per-run values, deltas, verdicts, regressions
  overlay/       GITIGNORED full copies of the modified files (rebuild: node tools/fix.mjs apply <topic>)
```

Other files here: `TOPICS.md` (proposed topics, code locations, conflict clusters, waves),
`AGENT_PROMPT.md` (prompt template for a fix agent/teammate), `_template/README.md` (deliverable
template, copied by `fix.mjs new`).

## Why an overlay instead of a copy of the site

`site/` (29 MB) and `site-pretty/` (34 MB) are Fastwork's files: gitignored, never committed, and
only present in the main checkout. A fresh worktree has neither. Instead of copying 63 MB into every
worktree (or symlinking it, which would let one agent's edit change everyone's baseline), the tools
find the baseline in the main checkout via `git rev-parse --git-common-dir`, and each fix keeps only
the files it changes in `overlay/`. `serve.mjs --overlay` serves those first. A typical fix touches
one or two files (the 500 KB page chunk and/or the 274 KB page CSS).

The baseline for fixes is `site-pretty/` (readable, same behaviour; parse/compile time differs from
production a little, equally on both sides of an A/B). Vendor scripts are always served from the
byte-identical `site/` because some load with SRI `integrity`.

## Measuring

`node tools/fix.mjs ab <topic> --runs 5` starts two servers on free ports (baseline, and baseline +
overlay), checks that every overlay file is served from the overlay and differs from the baseline,
then runs `tools/verify.mjs` with both targets: Chrome, mobile 430x932 DPR 3, CPU 6x, cold isolated
context per run, alternating order per run (ABBA), under the `chrome-measure` lock. It reports, per
metric (frames >20/>34/>50/>100 ms, fps, worst and p95 frame, LoAF ms, LoAF script ms, forced
style+layout ms; scroll phase and morph phase): baseline and patched median with min-max, per-run
values, delta, and a verdict that only says better/worse when the ranges don't overlap over >= 3 runs.
It also lists console errors/404s that only the patched page has, the screenshot pixel diff, and the
host load average during the runs.

Run `node tools/fix.mjs ab --aa --runs 5` once per session to know the noise floor.

## Merging

`node tools/fix.mjs combine all-wave1 <topicA> <topicB> ...` (in a worktree that has the patches, e.g.
after merging the fix branches locally) applies the patches in order, reports which ones conflict, and
leaves a combined overlay that `fix.mjs ab all-wave1` can measure. `--on <combined>` lets a later fix
build on top of it (`edit`, `diff`, `serve`, `ab` all accept it).
