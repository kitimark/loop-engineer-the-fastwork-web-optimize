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
template, copied by `fix.mjs new`), `AGENT_ROLES.md` (roster: lead, fix owner, toolsmith, wave
integrator, mapper, reviewer; who may do what, model and effort per task), `LEAD.md` (the lead's
playbook: the project loop, definitions of done, landing), `INCIDENTS.md` (reporting and fixing
unexpected problems during parallel work). Agent definitions: `.claude/agents/`.

## Definition of done

A fix is done when its branch has exactly `fixes/<topic>/README.md`, `patch.diff` and
`results.json` committed (nothing else), and the README, written from
[`_template/README.md`](_template/README.md), shows:

1. **Why it lags, with evidence:** the mechanism, 1-based line refs in the baseline, and the
   measurement or research finding that shows the cost (LoAF script/char position, forced
   style+layout, iPhone symptom).
2. **What changed**, hunk by hunk in words, and what is visually identical or different.
3. **Why that is faster:** the mechanism removed, and which metrics it should move.
4. **Before/after** from `fix.mjs ab <topic> --runs 5` or more at the calibrated setting, pasted from
   `results.json` `markdown`, with the noise context: min-max ranges, verdicts, the A/A floor if
   known, and the host load1 range of the runs (`results.json` `host`; above ~6 the numbers are
   inflated, I-017). "Within noise" is reported as such; no run is dropped or picked.
5. **Regressions triaged:** no new console errors or 404s, `morphReached` on both sides, screenshot
   diff <= 0.4 % per shot or explained; behaviour kept on desktop, phones and reduced motion.
6. `patch.diff` and `results.json` come from the same overlay (`results.json` `patch.sha256`), i.e.
   the patch wasn't edited after the A/B.
7. **Risks and overlaps** with other topics, and iPhone notes if the lease was used.
8. **Automated benchmark (required, user decision 2026-10-01).** Every fix ships a benchmark that
   re-confirms it without a human: a deterministic *mechanism check* (exact counters, e.g. "no layout
   or property writes from this callback on phones") plus a statistical *gain check* (throttled timing
   vs baseline and the A/A floor, with the host load recorded). It must pass against the fix's own
   overlay and every later combined overlay (`--on`), so a later wave or tool change can't silently undo
   the gain. Format, runner and role: `research/architecture/automated-benchmarks.md` (arch-bench,
   in progress). Until the runner lands, a fix is done without it, but gets a `bench-author` afterwards.

The lead has each fix checked against this list by a `fix-reviewer` agent
([`AGENT_ROLES.md`](AGENT_ROLES.md), [`LEAD.md`](LEAD.md)).

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

Run `node tools/fix.mjs ab --aa --runs 5` once per session to know the noise floor, and again after
a measurement-code change (I-002 added the idle phase and changed phase boundaries).

## Merging

`node tools/fix.mjs combine all-wave1 <topicA> <topicB> ...` (in a worktree that has the patches, e.g.
after landing the fix branches with rebase + `--ff-only`, see [`LEAD.md`](LEAD.md)) applies the patches in order, reports which ones conflict, and
leaves a combined overlay that `fix.mjs ab all-wave1` can measure. `--on <combined>` lets a later fix
build on top of it (`edit`, `diff`, `serve`, `ab` all accept it).
