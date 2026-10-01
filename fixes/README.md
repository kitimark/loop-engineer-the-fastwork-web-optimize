# fixes/: one directory per scroll-performance fix

Each fix is developed in its own git worktree, served on its own port on top of the shared mirror
baseline, measured A/B against that baseline under a cross-worktree lock, and delivered as:

```
fixes/<topic>/
  README.md      why it lags (evidence), what changed, why that is faster, before/after table
  patch.diff     unified diff of overlay vs baseline (URL paths; Fastwork excerpts: local branches only)
  results.json   fix.mjs ab output: medians, min-max spread, per-run values, deltas, verdicts, regressions;
                 since I-002 (c1124ec + 4bbd249) also `config.idle` and `metrics.idle` (the same 10 metrics for
                 a 6 s idle phase at the top before scrolling, "idle: …" rows in `markdown`; absent with
                 `--idle 0`). Compare A/B, A/A and bench numbers only within one tools version: I-002 also
                 moved the scroll/morph start by 6 s and drops the frame and late LoAF entries that straddle
                 a phase reset
  overlay/       GITIGNORED full copies of the modified files (rebuild: node tools/fix.mjs apply <topic>)
```

Other files here: `TOPICS.md` (proposed topics, code locations, conflict clusters, waves),
`AGENT_PROMPT.md` (prompt template for a fix agent/teammate), `_template/README.md` (deliverable
template, copied by `fix.mjs new`), `_template/CARDS.md` (the protocol v2 stage cards), `EXPERIMENTS.md` and
`PREDICTIONS.md` (ledgers of every variant and every prediction), `AGENT_ROLES.md` (roster: lead, fix owner, toolsmith, wave
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
7a. **Experiments tried, all of them** (user decision 2026-09-30): every variant measured, probed or
   abandoned, including the ones that lost or broke something, in the fields of
   [`EXPERIMENTS.md`](EXPERIMENTS.md). The lead copies them into that ledger on landing. **Each
   experiment is re-verifiable** by a benchmark too: keep its diff as `fixes/<topic>/variants/<nn>.diff`
   (`node tools/fix.mjs diff` of that overlay; local branch only, like `patch.diff`) and give it an entry in
   `bench.json` `experiments[]` with the expected outcome (better / within noise / broke), so a later run
   can confirm a failure as well as a win. These two paths join the allowed deliverables.
8. **Automated benchmark (required, user decision 2026-10-01).** Every fix ships a benchmark that
   re-confirms it without a human: a deterministic *mechanism check* (exact counters, e.g. "no layout
   or property writes from this callback on phones") plus a statistical *gain check* (throttled timing
   vs baseline and the A/A floor, with the host load recorded). It must pass against the fix's own
   overlay and every later combined overlay (`--on`), so a later wave or tool change can't silently undo
   the gain. Format, runner and role: `research/architecture/automated-benchmarks.md` (arch-bench,
   in progress). Until the runner lands, a fix is done without it, but gets a `bench-author` afterwards.

Protocol v2 items (lead decision 2026-10-01; stages and sign-offs in [`LEAD.md`](LEAD.md) "Stages and gates", card
templates in [`_template/CARDS.md`](_template/CARDS.md), rationale in
`research/architecture/measurement-protocol-v2.md`). The README's "Cards" section carries them:

9. **Attribution card, NAMED**, signed by the lead (or the lead's fast-path one-liner, "counts X→0, by code"): pipeline
   stage, the single mechanism with file:line, a positive and ≥1 negative sibling ablation measured in one block
   against one control, each arm with its mechanism check (computed style, mutation counts, layer count; an arm
   without it is void), and the device class. No evidence from a capped logger. LOCATED or UNEXPLAINED builds no fix.
10. **Prediction row** in [`PREDICTIONS.md`](PREDICTIONS.md), written before the first timed run (prediction card:
    same-driver baseline ≤24 h old, closure check passed, every constant calibrated or assumed), with the measured
    median [IQR] and error ratio filled in after; its id in the README and in the `EXPERIMENTS.md` row.
11. **Evidence on the device class's gate:** Chrome-measurable → the Chrome A/B is the gate, a phone run confirms;
    phone-only → a phone ABBA block (≤2 blocks, sequential rule) is the gate, Chrome is a no-regression check;
    render-bound → Instruments render-hitch time per s and Renders/GPU (held LOCATED until that route is verified),
    rAF a no-regression check; touch-only → G or F runs before landing. Plus the **position-bin census diff on both
    devices**: no 250 px bin worse by ≥1 tick median or +1 frame k≥5 per run. Phone blocks carry heat notes, a
    passed sentinel, a warm-up run and the served hashes of the ticket.
12. **Scenarios not run**, listed by name: idle after scroll, reload while scrolled, early input, scroll up,
    toolbar resize, rubber band (and which of them did run).
13. **Idle triple:** callbacks/s, writes/s, mutations/s by type and rAF/s at y=0, parked mid-page after a scroll,
    and at the pin, base vs fix; none higher without a stated reason.
14. **Driver scope:** every claim names its driver (Chrome A/B, phone S / W / M / G / F) and what that driver never
    covers (S: toolbar, touch, bounce; W: touch; M: touch, bounce, pin; G: real finger variance). A morph change
    lands only with G or F. Plus the build card's parity items: frozen-frame diff 0 %, backdrop look check, a11y
    diff when `inert` / `visibility` / `aria-*` / focusable content changes, memory/layers note, debug hooks stripped.

The lead has each fix checked against this list by a `fix-reviewer` agent
([`AGENT_ROLES.md`](AGENT_ROLES.md), [`LEAD.md`](LEAD.md)).

## Why an overlay instead of a copy of the site

`site/` (29 MB) and `site-pretty/` (31 MB) are Fastwork's files, committed on `main` as the study's
frozen snapshot (user decision 2026-10-01, pinned by `baseline.json`, local only, never pushed; CLAUDE.md
"Baseline snapshot"). `fix.mjs new` makes a fix worktree a sparse checkout without them. Instead of
keeping a 61 MB copy in every worktree (or symlinking it, which would let one agent's edit change
everyone's baseline), the tools read the main checkout's committed snapshot via `git rev-parse
--git-common-dir`, check that it is the one the branch pins, unchanged, and each fix keeps only
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

**Functional check first (headless, no timing).** `node tools/fix.mjs check <topic> [--viewport mobile|desktop|both]
[--no-screens] [--save]` asks "does my overlay break anything?" before you queue an A/B or a user sitting. It uses the
same two servers and served-file check as `ab`, then runs `tools/check.mjs` in one headless Chrome on both sides:
- what it checks: load, verify's state probe, a DOM fingerprint, a stepped walk to the bottom, the morph gestures,
  top/middle/bottom screenshots, console errors, first-party 404s and failed requests;
- result: `out/check/<topic>/<stamp>/check.json`, scrubbed of origins, LAN addresses and paths; `--save` copies it to
  `fixes/<topic>/check.json`. Commit that copy only when your README cites it;
- exit 1 on a new error, a new 404, a new failure (no scroll to the bottom, nav missing) or a morph lost on the
  patched side;
- the screenshot diff compares headless with headless only.

It gives no timing and never a verdict on gain; that stays with `ab`. `ab`, `verify.mjs` and `bench gain` refuse headless
Chrome (exit 2). `check.mjs` also takes plain URLs: `node tools/check.mjs a=<url> b=<url> [--probe name=<js>]`.
Headless is made to see the page a headed Chrome does: the User-Agent override and `--screen-info` 1512x982 DPR 2. Its
limits are in `research/architecture/headless-functional.md`.

## Merging

`node tools/fix.mjs combine all-wave1 <topicA> <topicB> ...` (in a worktree that has the patches, e.g.
after landing the fix branches with rebase + `--ff-only`, see [`LEAD.md`](LEAD.md)) applies the patches in order, reports which ones conflict, and
leaves a combined overlay that `fix.mjs ab all-wave1` can measure. `--on <combined>` lets a later fix
build on top of it (`edit`, `diff`, `serve`, `ab` all accept it).
