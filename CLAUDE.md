# fastwork-com-web-optimize: agent guide

Personal, educational scroll-performance study of the public homepage https://fastwork.com/ on a
local mirror. Not affiliated with Fastwork. Details: `README.md` (mirror tooling), `research/`
(findings), `fixes/README.md` (per-fix workflow), `fixes/TOPICS.md` (what to fix, conflicts).

## Layout: four kinds of things

| | path | in git? | who writes it |
|---|---|---|---|
| (a) shared tooling | `tools/` (`serve`, `verify`, `fix`, `lock`, `iphone`, `incident`, `finding`, `mirror`, `prettify`, `lib/`) | yes | any agent, with a covering test (Hard rule 6); usually a `toolsmith` per incident |
| (b) research write-ups | `research/<nn-topic>/` (README, data, one-off tools) | yes | append new studies; don't rewrite history |
| (c) baseline snapshot | `site/` (byte-identical), `site-pretty/` (Prettier 3.9.9 copy), pinned by `baseline.json`; agent worktrees are sparse and read the main checkout's | **yes, frozen on `main`** (local only, never pushed) | nobody; a new snapshot only by the user (`--new-snapshot`, then the authorized commit, "Baseline snapshot") |
| (d) per-fix experiments | `fixes/<topic>/` `README.md`, `patch.diff`, `results.json` (+ gitignored `overlay/`) | deliverables only, local branches | one fix agent per topic, in its own worktree |

`out/` (gitignored) holds per-checkout measurement output, Chrome profiles and certs.

<!-- BEGIN hard-rules: the single list of hard rules. Other docs link here instead of repeating them. -->
## Hard rules

For the lead and every agent. **Enforced** names what stops you mechanically ("convention": only
you). Never work around an enforcement layer (`--no-verify`, `-c core.hooksPath=…`, `--no-lock`,
`git add -f`): if a rule blocks legitimate work, stop and ask the lead.

1. **Rebase + fast-forward only.** Land a branch on `main` (or any shared branch) with `git rebase main`
   on the branch, then `git merge --ff-only <branch>` in the main checkout; if the fast-forward fails,
   rebase again. MUST NOT create merge commits (`--no-ff`, a non-fast-forward `git merge`, finishing a
   conflicted merge, `git merge --continue`) or squash-merge commits (`--squash`), and MUST NOT merge
   `main` into a branch (rebase it). `git pull` only with `--rebase`.
   *Why:* linear history: each fix is one contiguous series on `main` that can be bisected, reverted, re-stacked.
   *Enforced:* `.githooks/` (`pre-merge-commit`, `commit-msg`, and `reference-transaction`, which refuses
   any merge commit on a branch even with `--no-verify`); repo config `merge.ff=only`, `pull.rebase=true`;
   the Claude Code hook `.claude/hooks/git-guard.mjs` and deny rules in `.claude/settings.json`.
   Landing steps: `fixes/LEAD.md` "Land a fix".
2. **Never push; no remote.** MUST NOT `git push` (any form), add a remote, or publish anything from
   this repo (`gh repo create`, gists, PRs). *Why:* the mirror, overlays and the Fastwork excerpts in
   `patch.diff` stay on this machine (personal study, see `README.md`). *Enforced:* deny rules,
   git-guard, the `pre-push` hook; `git remote add` and `git config remote.*` ask the user.
3. **Never commit Fastwork-derived or secret files, except the frozen baseline snapshot:** `out/`,
   `fixes/*/overlay/`, `.serena/cache/`, `*.pem`, `site*/.mirror/missing-local.txt`; never `git add -f`.
   `site/` and `site-pretty/` ARE committed on `main` as the study's frozen snapshot (user decision
   2026-10-01), pinned by `baseline.json`: MUST NOT stage any change to them or to `baseline.json`. Only
   the user, or the lead on the user's explicit instruction, commits a new snapshot ("Baseline snapshot").
   `patch.diff` and the snapshot stay on this machine (rule 2). *Why:* third-party property; generated
   keys; every result must name the exact build it measured. *Enforced:* `.gitignore`, deny rules on
   `git add -f`/`--force`, the `pre-commit` hook (refuses those paths, and any staged snapshot change that
   is not an authorized snapshot update: `FW_BASELINE_UPDATE=<id>`, pin = staged trees, nothing else
   staged, on `main`); git-guard asks the user before a command sets `FW_BASELINE_UPDATE`; the scope
   guard (`npm run test:unit`) refuses a branch other than `main`/`baseline/*` that changed the snapshot
   or `baseline.json` (`SCOPE SNAPSHOT`, no opt-out: revert, cherry-pick, rebase and am skip pre-commit).
4. **The baseline is read-only.** MUST NOT edit `site/` or `site-pretty/`; change Fastwork code only
   in your overlay copy (`node tools/fix.mjs edit <topic> <file>`). MUST NOT run `mirror.mjs` or
   `prettify.mjs` (a new snapshot is the user's, with `--new-snapshot`), MUST NOT restore, clean or
   check out the main checkout's `site/`/`site-pretty/`, and MUST NOT set `FW_BASELINE_ALLOW_MODIFIED`.
   *Why:* every worktree measures the same committed snapshot. *Enforced:* `Edit` deny rules (also on
   worktree copies, `.claude/worktrees/*/site*/`);
   mirror/prettify ask and refuse a tracked tree without `--new-snapshot`; `fix.mjs`, `serve.mjs`,
   `verify.mjs` and `bench.mjs` refuse (exit 3, `BASELINE-MODIFIED` / `BASELINE-MISMATCH`) unless the
   baseline is the snapshot pinned by your checkout's `baseline.json`, unchanged; `verify.mjs` re-checks
   after every run and `fix.mjs ab`/`bench.mjs` prefix every verdict with `BASELINE-<STATE>: ` when the
   baseline was not that snapshot throughout; git-guard asks before `FW_BASELINE_ALLOW_MODIFIED`.
   Details: "Baseline snapshot".
5. **Your own worktree, never the main checkout.** Every agent works in its own git worktree under
   `.claude/worktrees/` on its own branch; only the lead works in the main checkout and lands on `main`.
   *Why:* the main checkout holds `main`, the baseline and port 5173. *Enforced:* `fix.mjs` refuses to
   write fixes in the main checkout, `fix.mjs doctor`; otherwise convention. Details: "Parallel agents",
   roles and who may do what: `fixes/AGENT_ROLES.md`.
6. **Tooling is guarded by tests.** Agents MAY change `tools/` to fix a bug or unblock work. Such a
   change MUST come with a covering test (new or updated in `tests/`) and `npm test` MUST pass; an
   accidental edit caught by a failing test MUST be reverted; tests MUST NOT be weakened to go green
   (change a test only for a genuine, intended behaviour change). Roles that never change tooling
   (fix owners, integrators, bench authors, architecture, management, reviewers) run
   `npm run test:unit` instead: a scope guard that fails when their branch touched tooling, then the
   unit tests (I-021). Tool fixes go in a separate commit
   from fix deliverables and are reported to the lead as an incident ("Unexpected problems"), who
   lands them on `main` first (rule 1) for everyone. Changes to measurement code (`verify.mjs`,
   `lib/cdp.mjs`, `fix.mjs ab`) MUST be called out in the fix's README and `results.json` notes: they
   affect A/B comparability. The enforcement
   layer (`.githooks/`, `.claude/hooks/`, `.claude/settings.json`) is not tooling: edits ask the user.
   *Why:* tools have bugs; tests, not a ban, keep them right for every agent. *Enforced:* the
   `pre-commit` hook runs `npm test` when tooling is staged; `fix-reviewer` checks tests and commit
   separation; ask rules on the enforcement layer. Details: "Tooling is guarded by tests".
7. **Chrome measurements only through the `chrome-measure` lock:** `tools/verify.mjs` or
   `tools/fix.mjs ab`, never `--no-lock`, and no CPU-heavy work (builds, `npx`, other Chromes) while
   anyone holds the lock. *Why:* A/B numbers only compare on a quiet machine. *Enforced:* both tools
   take the lock themselves; deny rule on `--no-lock`; `results.json` records host load.
   Details: "Shared devices".
8. **No chrome-devtools MCP performance traces.** Use `verify.mjs`, `fix.mjs ab`, `tools/lib/cdp.mjs`.
   *Why:* throttled MCP traces hang for about an hour and ignore the lock. *Enforced:* deny rules on
   `mcp__chrome-devtools__performance_*`.
9. **The iPhone only while you hold the `iphone` lease**; finger tests go through the lead.
   *Why:* one physical device, one page at a time. *Enforced:* `iphone.mjs open|scroll|record` refuse
   without the lease; the protocol is convention. Details: "Shared devices".
10. **Port 5173 is the main session's.** MUST NOT use or kill it; worktrees serve on `--port auto`
    (5200-5999); kill only processes you started. *Why:* the user's own mirror server.
    *Enforced:* `serve.mjs` defaults to `--port auto` in a worktree; otherwise convention.
11. **Serena is read-only:** navigate with it, edit with Claude Code's Edit tool, never write Serena
    memories. *Why:* Serena edits would skip the overlay and permission rules. *Enforced:*
    `.serena/project.yml` (`read_only`, `excluded_tools`) and deny rules. Details: "Serena".
12. **The user's personal data stays local.** MUST NOT send it (email, name, account ids, LAN
    addresses, device identifiers) to external services: web requests, MCP connectors, third-party
    APIs, anything published. *Why:* privacy; the study needs none of it. *Enforced:* convention.

Enforcement setup, once per clone, by the user or lead in the main checkout (repo-local config is
shared by all worktrees): `git config core.hooksPath .githooks` (= `npm run setup`; each worktree runs
the hooks of its own branch), `git config merge.ff only`, `git config pull.rebase true`. Hook tests:
`node --test 'tests/hooks/*.test.mjs'`. Known gaps: git started from a script (`node -e`, `find -exec`)
is not seen by git-guard, but the git hooks still refuse merge commits and pushes; a human can switch
the git hooks off, so for the user rule 1 stays a promise. `node tools/lock.mjs run … -- <cmd>` is
pre-approved; for any command naming `lock.mjs` (any argument order, any node options) git-guard checks
everything after the first `--` that follows it, and a `sh -c` inside that, like any other command;
still never run git through it.
<!-- END hard-rules -->

## Calibrated measurement setting

Chrome, mobile viewport 430x932 DPR 3 with touch, **CPU 6x** ≈ iPhone 15 Pro Max jank on this page
(`research/cpu-throttle-calibration/`). Serve with `--vendors=local --https --latency 150` ("lags like
live"). These are the `fix.mjs ab` defaults, plus a 6 s idle phase at the top of the page before
scrolling (`--idle 6`, I-002; `--idle 0` reproduces the pre-I-002 sequence). Compare A/B results only when both
sides were measured with the same tools version (I-002 changed phase boundaries). Confirm winners on
the real iPhone when possible.

Protocol v2 (`research/architecture/measurement-protocol-v2.md`): every topic goes R → I → D → F → V → L, each
stage closed by a card; the lead signs D (the attribution card): `fixes/LEAD.md` "Stages and gates".
- **Phone geometry for attribution.** Gain A/Bs stay at 430x932; probes that ask *where* a frame happens run at the
  iPhone's 430x775 (scripted) / 430x815 (collapsed toolbar), and positions compare by crossing (the nearest code
  threshold), never by raw y (Chrome and phone y differ by ~77 px).
- **Tick thresholds** (frame gaps quantize at 8.33 ms on both devices; whether Safari rAF runs at 60 or 120 Hz is open, arch-unknowns): k = round(dt / 8.333 ms); ">34" = dt ≥ 37.5 ms (k≥5), ">50" =
  dt ≥ 54.2 ms (k≥7); medians compare as ticks. The legacy ms columns stay for one wave; a verdict that differs
  between the two is "threshold-sensitive".

## Fix workflow in a worktree (start to finish)

```sh
node tools/fix.mjs doctor                          # baseline found? linked worktree? port? locks?
node tools/fix.mjs new <topic>                     # fixes/<topic>/README.md + overlay/
node tools/fix.mjs grep 'getBoundingClientRect'    # search the baseline (pretty JS/CSS)
node tools/fix.mjs show /_app/immutable/nodes/2.DyWL8TcE.js --lines 2660-2780
node tools/fix.mjs edit <topic> /_app/immutable/nodes/2.DyWL8TcE.js   # copy into the overlay, then Edit it
node --check fixes/<topic>/overlay/_app/immutable/nodes/2.DyWL8TcE.js
node tools/fix.mjs serve <topic>                   # run in background; prints MIRROR_URL=… and LAN URL
curl -sk -D - -o /dev/null https://localhost:<port>/_app/immutable/nodes/2.DyWL8TcE.js   # x-mirror-source: overlay
node tools/fix.mjs ab <topic> --runs 5             # A/B under the lock -> fixes/<topic>/results.json (+ patch.diff)
node tools/fix.mjs diff <topic>                    # (ab does this too) fixes/<topic>/patch.diff
npm run test:unit                                  # before each commit: scope guard (no tooling touched) + unit tests
# write fixes/<topic>/README.md from the template, then commit README.md, patch.diff, results.json
# on your worktree branch (local only). Never commit overlay/ (it is gitignored).
```

How it works: the baseline is the snapshot committed on `main` (`site/`, `site-pretty/`, pin
`baseline.json`). `fix.mjs new` makes your worktree a **sparse checkout without them** (`node tools/baseline.mjs
sparse`; a fresh worktree first checks out a 61 MB copy, `new` drops it), and `tools/lib/paths.mjs` finds the
baseline in the main checkout through `git rev-parse --git-common-dir` (or `$FW_MIRROR_HOME`). Every tool that
reads it first checks that it is the snapshot your `baseline.json` pins, unchanged (`node tools/baseline.mjs
status`; `fix.mjs doctor` shows `baseline snapshot <id> ok`), and `results.json` records the id
(`config.baselineSnapshot`). `serve.mjs --overlay` serves overlay files first and everything else
from the baseline. `fix.mjs` refuses to write fixes in the main checkout (use `--allow-main` only
when you really mean it). `fix.mjs ab --aa` measures the baseline against itself (noise floor).
`fix.mjs combine <name> <a> <b> …` applies several patches in order and reports conflicts;
`--on <other>` stacks a fix on another fix's overlay (wave 2 on top of a combined wave 1).

Reading `results.json`: `verdict` is "better"/"WORSE" only when the baseline and patched ranges
don't overlap over >= 3 runs; otherwise "within noise". Check `regressions` (new console errors,
new 404s, screenshot pixel diff: 0-0.4 % is countdown/orbit phase noise, more means a visual change,
`morphReached`) before claiming a win.
The host record's `topProcs` (top 5 non-Chrome processes per run and per recheck, I-031, log only) normally lists the
mirror server's `node`, verify's own `node` and `WindowServer`: they are part of the measured system, not contamination.

## Baseline snapshot

The study measures ONE frozen build of fastwork.com (user decision 2026-10-01): `site/` and `site-pretty/`
committed on `main`, pinned by `baseline.json` (snapshot id `b<_app/version.json build>-<hash of the two git
tree ids>`, tree ids, crawl date, Prettier version). A new live build can't silently change it: a re-mirror
shows up as a git diff, and the tools refuse to read a changed baseline.

```sh
node tools/baseline.mjs status        # snapshot id, ok / modified / mismatch, read from where (exit 0 ok, 3 not)
node tools/baseline.mjs sparse        # (fix.mjs new does it) no own copy; read the main checkout's snapshot
node tools/baseline.mjs sparse --off  # check out your branch's own committed copy (61 MB, <1 s) and read that
```

- `BASELINE-MODIFIED` (exit 3 from `fix.mjs`, `serve.mjs`, `verify.mjs`, `bench.mjs`): the snapshot has
  local changes, usually the user reviewing a new mirror in the main checkout. Don't touch the main
  checkout; run `node tools/baseline.mjs sparse --off` and keep measuring the committed snapshot on your own
  copy, and report an incident (`--class baseline`) if it blocks you. In your own copy: restore it as the
  message says.
- `BASELINE-MISMATCH`: your branch pins another snapshot than the one you read (a new pin landed on
  `main`). `git rebase main` and re-measure, or `sparse --off` to finish on your branch's snapshot. Results
  from two snapshots never compare (`config.baselineSnapshot` in results.json, `baseline` in verify.json,
  `baselineSnapshot` in bench-results.json).
- No `baseline.json` (a branch from before the snapshot commit): unchecked, as before; rebase.
- The check is not only at start: `verify.mjs` re-checks after every run (a flagged run gets `baseline:
  {snapshot, state, tag}`, verify.json `baseline.flaggedRuns`), and `fix.mjs ab` / `bench.mjs` prefix every
  verdict with `BASELINE-MODIFIED: ` (or `-MISMATCH`, `-REPINNED` for a new pin mid-run, `-TIMEOUT` when the
  check's git hung for 10 s, ...) when the baseline was not the pinned snapshot throughout
  (`FW_BASELINE_ALLOW_MODIFIED=1`, or a re-mirror mid-A/B); bench then exits 3 and stores no calibration or
  authored effect. Such a result is invalid: re-measure on the committed snapshot. (bench's own
  `BASELINE-CHANGED` is something else: a `patch.diff` made on another mirror.)
- A branch never carries a snapshot change: `npm run test:unit` fails with `SCOPE SNAPSHOT` (no `FW_TOOLING`
  opt-out) when `site/`, `site-pretty/` or `baseline.json` differ from its merge-base with `main` (a revert
  or cherry-pick skips pre-commit); restore them as the message says. The lead checks the same before
  landing (`fixes/LEAD.md` "The snapshot check").

A new snapshot, only by the user (or the lead on the user's explicit instruction), in the main checkout,
in a quiet window:

```sh
node tools/mirror.mjs --new-snapshot [--crawl --vendors] && node tools/prettify.mjs --new-snapshot
git status --short site site-pretty | head; git diff --stat -- site site-pretty    # review
# measuring it before committing: FW_BASELINE_ALLOW_MODIFIED=1 (the user's; results record state "modified")
git add site site-pretty && node tools/baseline.mjs pin --prettier <exact version> && git add baseline.json
FW_BASELINE_UPDATE=<id printed by pin> git commit -m "baseline: snapshot <id>"     # main, nothing else staged
# or discard: git restore --source=HEAD --staged --worktree -- site site-pretty && git clean -fd -- site site-pretty
```

## Tooling is guarded by tests

`tools/`, `tests/`, `.githooks/`, `.claude/hooks/`, `package.json` and `.claude/settings.json` are
shared infrastructure, covered by an automated test suite (`tests/`, Node's built-in `node --test`, no
dependencies). The tests are the hardening, not permission prompts:

```sh
npm test              # default: unit + e2e + hook tests on a tiny fixture baseline; no Chrome, network or iPhone (~3 min of wall time under load, ~60 CPU-s)
npm run test:unit     # non-tooling roles: scope guard, then the unit tests only (~5 s, ~7 CPU-s)
npm run test:scope    # the scope guard alone (node tools/scope.mjs)
npm run test:chrome   # opt-in: real Chrome, short runs, queues on the real chrome-measure lock (~2 min)
npm run test:all      # both
```

- **Who runs what.** Toolsmiths (and a fix owner's `fixes/INCIDENTS.md` section 1 self-fix) change
  tooling and run the full `npm test`. Every other role (fix owner, wave integrator, bench author,
  architecture, management) never changes tooling and runs `npm run test:unit` before
  committing; mappers and reviewers commit nothing and run no suite. The scope guard
  (`tools/scope.mjs`) fails, naming the files, when the branch changed `tools/`, `tests/`, `package.json`, `.githooks/` or `.claude/` (except `.claude/agents/`)
  since its merge-base with `main`, counting committed, staged, unstaged and untracked files (and, on
  any branch but `main`/`baseline/*`, when it changed `site/`, `site-pretty/` or `baseline.json`). An
  accident: restore the file as the message says. A deliberate tool fix: own commit, then
  `FW_TOOLING=1 npm run test:unit` (or `node tools/scope.mjs --tooling`) passes the guard, and the
  full `npm test` below is still required.
  `npm run test:unit` costs about 7 CPU-s on at most 2 cores (unit tests at `--test-concurrency=2`;
  the full suite is ~60 CPU-s and 2-3.5 min): run it directly, **not** through the short lane.

- Agents **may fix bugs in `tools/`** (or work around them) when needed. Every change to `tools/`
  comes with a test that covers it (new or updated in `tests/`), and `npm test` must pass.
- If a test fails after an accidental edit, **revert the edit**. Change a test only to reflect a
  genuine, intended behaviour change; never weaken a test just to go green.
- Tool fixes go in **their own commit**, separate from fix deliverables, and are reported to the lead
  as an incident, who lands them on main (rebase + ff-only) so every worktree gets them. The lead
  runs `npm test` on the exact commit in the **main checkout** too: it has `site/`, worktrees don't.
- `npm test` is about 55 s of CPU and 75 s wall (I-021): while others may be measuring, run it under the lock in the
  short lane, `node tools/lock.mjs run chrome-measure --owner <you> --short --max-seconds 300 -- npm test`
  (not `test:chrome`: it takes the lock itself), and hold a short lease around a commit whose hook
  runs it: `node tools/lock.mjs acquire chrome-measure --owner <you> --short --max-seconds 300 --wait 1800`,
  `git commit`, `node tools/lock.mjs release chrome-measure --owner <you>` (`fixes/INCIDENTS.md`). A
  short job waits for the current holder only, not for the queued 5-min A/Bs (incident I-007).
- Outside a lock slot run unit test files only (`node --test tests/unit/<file>`); e2e/fake-Chrome files and
  the full suite only via the short lane (they load the host and contaminate others' holds; 2026-10-01 05:56Z).
- Changes to measurement code (`verify.mjs`, `lib/cdp.mjs`, `fix.mjs ab`; `serve.mjs` and
  `vendor-shim.js` where they change what is served) must be called out explicitly: they affect the
  comparability of A/B results measured before and after. Run `npm run test:chrome` after them.
- `.githooks/pre-commit` (enable once per clone: `npm run setup`, i.e.
  `git config core.hooksPath .githooks`, shared by all worktrees) runs `npm test` when a commit
  touches the paths above and blocks the commit if it fails; it also blocks staged `out/`,
  `fixes/*/overlay/`, `.serena/cache/`, `*.pem` and `site*/.mirror/missing-local.txt`, and any staged
  change to `site/`, `site-pretty/` or `baseline.json` that is not an authorized snapshot update
  ("Baseline snapshot"). Never bypass it (`--no-verify`, `-c core.hooksPath=...`).
- Tests point the tools at a fixture baseline via `$FW_MIRROR_HOME` and at a temp lock dir via
  `$FW_STATE_DIR`; they never use port 5173, the iPhone or the live site.

## Agent roles (`.claude/agents/`)

- `fix-owner` (opus/high, `isolation: worktree`): one topic or conflict cluster end to end; spawn it
  with `subagent_type: "fix-owner"` and the filled-in prompt from `fixes/AGENT_PROMPT.md`. It may spawn
  `bundle-mapper` helpers.
- `toolsmith` (opus/high, worktree subagent): one incident in `tools/`/`tests/`, test-first, one
  separate commit; spawned by the lead per incident. `wave-integrator` (opus/high, worktree
  subagent): combines a landed wave, measures it, writes it up; spawned by the lead.
- `bundle-mapper` (sonnet/medium, read-only): map bundle code, find callers, summarize data, answer
  web-platform questions; pass `model: "haiku"` for mechanical jobs. `fix-reviewer` (opus/high,
  read-only): adversarial review of a finished fix, a combined wave or a measurement-code tool fix,
  spawned by the lead.
- Only fix owners and the integrator measure; the toolsmith runs tests; helpers and reviewers never
  run Chrome, the iPhone or the locks. The lead coordinates incidents and is the only one who lands.
- Roster, who may do what, nesting limits, what teammates take from a definition (not `effort`, not
  `isolation`), model/effort per task, Serena use: `fixes/AGENT_ROLES.md`. The project loop and
  landing: `fixes/LEAD.md`. Incidents: `fixes/INCIDENTS.md`.

## Parallel agents: worktree subagents or an agent team

Agent teams are enabled for this project (`env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in
`.claude/settings.json`; experimental). `worktree.baseRef: "head"` makes new worktrees start from
the local `HEAD`, so **commit the tooling first**: a worktree only has committed files.

- **Worktree subagents:** the lead calls the Agent tool with `isolation: "worktree"` (and a `name`
  so siblings can `SendMessage` each other). Claude Code creates `.claude/worktrees/<name>/` on branch
  `worktree-<name>` and keeps it if it has changes. A call that passes `isolation` stays a subagent
  even with agent teams on.
- **Agent-team teammates:** a named Agent call **without** `isolation` becomes a teammate, which
  runs in the lead's working directory (the main checkout). A teammate's **first action** is to
  enter its own worktree: the `EnterWorktree` tool with name `fix-<topic>`, or
  `git worktree add .claude/worktrees/fix-<topic> -b fix/<topic>` then `EnterWorktree` with that
  path. `fix.mjs` refuses to create fixes in the main checkout, which catches a forgotten step.
  Teammates load this CLAUDE.md, not the lead's conversation: put the topic and the prompt from
  `fixes/AGENT_PROMPT.md` in the spawn prompt. Permission prompts of teammates appear in the lead.

Team conventions (messages go to the owner of the question, see "Agent communication"):
- One teammate owns one topic (or one conflict cluster from `fixes/TOPICS.md`) and one worktree.
- **Read `fixes/FINDINGS.md` before you edit** (techniques that won, pitfalls that cost a review round,
  measurement lessons) and the live board: `node tools/finding.mjs list --unread --as <you>` (at start and
  on resume; ack what you read). **Post every finding that could help another topic**: a technique that
  won, a pitfall, a code coupling, a measurement surprise. Post it to the board (`finding.mjs post`, see
  "Findings board"), not only in your README.
- **Post cross-topic findings** as soon as you find them, to the owners of the affected topics, e.g.
  "scroll engine `iE` also drives the nav callback, so changing `dE`'s contract touches
  nav-hit-test" or "future `l` also toggles `.pain is-pain-dark`". Don't edit code another topic owns;
  describe the change you need and let the owner decide.
- Report when done: topic, branch, one-line verdict with the key delta and spread, files touched.
- **Scratch files go in `<scratchpad>/<your-topic>/`** (or your worktree's `out/`), never in the
  scratchpad root: all agents of a session share one scratchpad, and same-named files overwrote each
  other (incident I-006). Any Chrome `--user-data-dir` is per topic too.
- **One `chrome-measure` queue entry per agent.** Iterate with `--runs 3`, final `--runs 5` once;
  put visual checks in the same slot. Don't SIGTERM a waiting `fix.mjs ab`: it drops your queue place.
  Measure in ONE hold, not a lease (I-005, I-020): `node tools/lock.mjs run chrome-measure
  --owner <topic> -- sh -c 'node tools/fix.mjs ab <topic> --runs 5 && node <probe>'`; tools started
  inside `run` re-enter its hold instead of queueing behind it. Start any server inside that `sh -c`
  (background it, wait for MIRROR_URL, run, kill it). Never hold the lock while editing or debugging.
  No normal hold longer than ~10 min (`run --max-seconds`, default 600; past it `status` shows OVERDUE):
  split longer work into separate holds and requeue after each.
- **Use the iPhone while you wait for Chrome.** The phone renders by itself, so an iPhone check barely
  loads the Mac and runs in parallel with Chrome measurements (lease, plain http per I-003).

## Agent communication

Short form of `fixes/AGENT_ROLES.md` "Addresses and peer work" (F-046):
- **Named spawns** `<role>-<topic>` (`fix-<topic>`, `ts-<incident>`, `review-<topic>`, `de-<area>`, `arch-<topic>`,
  `mgmt-ops-<N>`), unique per session. Every spawn prompt carries the **peer directory** (live copy:
  `research/management/ops-handover.md`); if a name fails, use the agent ID; never drop the message.
- **Ask the owner of the question directly.** mgmt-ops is the hub for the rest; the lead lands, resolves
  incidents, reorders locks, spawns and talks to the user.
- Messages reach you only at your next tool round: **run long waits in the background** (lock queues, holds,
  `incident.mjs wait`, phone recordings). Send peers what they need before your final report, which goes only to
  your spawner.
- **Report your branch** with `git branch --show-current` in your own worktree, never from the git status in your
  context (it is the session's, i.e. another agent's).

## Unexpected problems: incidents

Anything that breaks outside your own topic's code (a tool crashes or reports odd numbers; Chrome,
ports, locks, the iPhone or Serena misbehave; the baseline looks wrong; a web-platform question
blocks a decision) is an **incident**: report it once, keep working, rebase when it is announced
fixed. Report fields, triage, escalation and the lead's side: `fixes/INCIDENTS.md`.

```sh
node tools/incident.mjs list                       # open problems and their workarounds (at start and on resume)
node tools/incident.mjs open --by <you> --title "<what failed>" --error "<first error line>" \
  --cmd "<command>" --class tool|env|baseline|research|fix|unknown --blocking yes|no
#   OPENED <id>: message the lead | JOINED <id>: already reported, use its workaround | KNOWN <id>: git rebase main, retry
node tools/incident.mjs wait <id> --timeout 3600   # in the background: exits with the announcement when resolved
```

The store lives in the shared git dir (`.git/fastwork-mirror/incidents/`), so every worktree sees a
report at once. Only the lead triages, sends a `toolsmith`, lands the fix and resolves. "incident
<id> RESOLVED … fixed in <sha>" means: `git rebase main` between steps (never mid-A/B) and
continue; re-measure if it says "Re-measure".

## Findings board

`node tools/finding.mjs post --by <you> --kind technique|pitfall|coupling|measurement|question --topics a,b --title "…" [--where "JS 3100-3155"] [--evidence "…"] [--body "…"]` (`POSTED F-012`, or `SIMILAR F-007`: ack that one, `--force` if yours differs);
`list [--kind k] [--topic t] [--since F-007] [--unread --as <you>]`, `show <id>`, `ack <id> --by <you> --note "applied in <topic>"|"not relevant"`,
`wait --as <you> --topic <t> --timeout 3600` in the background. Store: `.git/fastwork-mirror/findings/`, seen by every worktree at once;
only the lead folds findings into `fixes/FINDINGS.md` (`digest`) and `resolve`s them.

## Serena (code navigation, read-only)

Serena is configured in `.serena/project.yml` for **navigation only**: `find_symbol`,
`find_referencing_symbols`, `get_symbols_overview`, `find_declaration`, `read_memory`. Its editing tools
are disabled (and denied in `.claude/settings.json`): **edit with Claude Code's Edit tool**, even where
Serena's own instructions say otherwise.

**When to use it** (benchmark: `research/code-navigation-benchmark/`): text search (Grep/Read,
`fix.mjs grep|show`) is as accurate and cheaper for most questions on the prettified bundle and is the
default. Serena earns its cost for two things:
- `find_declaration` on a call site, to resolve what a short name or import alias really is (`S` →
  `$i` in `chunks/BSBv9QXB.js`);
- `find_referencing_symbols` with a full name path for "all references to X".

It cannot see CSS, string arguments (`setProperty('--x')`), child processes or namespace-destructured
imports. Its line numbers, including the `NNNN:` snippet prefixes, are 0-based: add 1 and Read the lines
before relying on them (the most common error in the benchmark).

- **One Serena per session, rooted where the session started.** Worktree subagents and teammates share
  the lead's Serena, i.e. the **main checkout**, not their worktree. Serena paths are relative to it:
  baseline `site-pretty/_app/immutable/...`; your overlay
  `.claude/worktrees/<wt>/fixes/<topic>/overlay/_app/immutable/...` (also indexed). Before editing,
  turn a Serena result into your absolute worktree overlay path and `Read` those lines.
  Never edit a `site-pretty/` path.
- Minified names repeat: always pass `relative_path` and full name paths. Locals inside effects are
  `<Component>/ne() callback/<name>`. `AE/a` finds the component-level `a`, not the effect's `a`. Never run
  `find_referencing_symbols` on tiny runtime helpers (`Ln`, `z`, `s`): 30 s+ on the shared, serial server.
  Serena's line numbers are **0-based**; `sed`, `fix.mjs show` and `fixes/TOPICS.md` are 1-based.
- Serena does not index `site/` (ignored in `.serena/project.yml`); use `site-pretty/` or your overlay
  (`.claude/worktrees/<wt>/fixes/<topic>/overlay/...`, relative to the main checkout). Haiku helpers did not
  benefit from Serena either; `hot_code_map` orients, it does not replace the verifying read.
- Memories: `hot_code_map` (verified symbol name paths and lines for every topic), `serena_usage`,
  `rules`, `project_overview`. Don't write memories; put findings in `fixes/<topic>/README.md`.
- `.serena/cache/` holds symbol data derived from Fastwork code: it is gitignored, never commit it.
  After a new mirror/prettify, warm it up with `serena project index` in the main checkout (a few seconds).
- Serena reads `.serena/project.yml` (and its tool list) only at startup: after changing it or
  `jsconfig.json` (the JS project that gives cross-file references), the user reconnects with `/mcp`.
  Never use the Serena dashboard's add/remove language: it rewrites the tracked `project.yml` from the
  running server's config. After a Serena upgrade, check `git diff .serena/project.yml`.

## Shared devices: `chrome-measure` lock and `iphone` lease

`tools/lock.mjs` (library `tools/lib/lock.mjs`) holds named locks in the shared git dir
(`.git/fastwork-mirror/locks/`), visible from every worktree. Holders are either a live process
(stale when its pid dies) or a lease with a TTL (stale when it expires). Waiters queue FIFO; a
queue entry not refreshed for 10 min is dropped. Short lane: `--short --max-seconds N` (N <= 300, on
`run` and `acquire`) is served before earlier normal waiters at the next hand-over, never preempts
the holder, drains all queued short jobs (up to 15 min) before the next normal waiter; a normal waiter
the lead moved ahead of them goes first, also while its host gate settles (I-011, I-020, I-030;
any other gated waiter is passed only in its first 120 s at the gate; `FW_GATE_SHORT_PASS` in the short
job's env changes that, 0 = never), and
ends at N s (`run` kills the command's whole process tree, exit 124, I-024; a short lease expires and
can't be renewed). A chrome-measure lease defaults to 600 s and ends by 1200 s. Keep polling while you
wait: a waiter not seen for 30 s is skipped at a hand-over but keeps its place. Only for
short, bounded jobs such as `npm test` and benchmark mechanism checks (`bench mech`, counts only,
<= 180 s); never for a timing measurement.

```sh
node tools/lock.mjs status                                   # who holds what, who is queued
# Chrome: automatic. verify.mjs / fix.mjs ab wait for chrome-measure and release on exit or crash.
# iPhone (one page at a time, ios_webkit_debug_proxy on :9221/:9222, LAN https://192.168.0.55:<port>/):
node tools/lock.mjs acquire iphone --owner <topic> --ttl 900 --url https://192.168.0.55:<port>/
#   exit 0 = yours; exit 3 = busy and you are queued: do other work, retry every 2-5 min (keeps your place)
node tools/iphone.mjs open https://192.168.0.55:<port>/ --owner <topic>    # navigates Safari (location.href)
node tools/iphone.mjs scroll --owner <topic> --label patched                 # scripted scroll, ~60 s
node tools/iphone.mjs record --owner <topic> --seconds 25 --label finger     # human finger scroll (see below)
node tools/lock.mjs renew iphone --owner <topic> --ttl 900                   # if you need longer
node tools/lock.mjs release iphone --owner <topic>
```

- Lock state looks wrong: `lock.mjs doctor`; the lead repairs with `lock.mjs repair … --apply` (audited).
  Never edit the lock JSON by hand.

iPhone protocol on top of the lease:
1. Acquire the lease, then message the lead: "iPhone acquired for <topic>: <LAN URL>".
2. Scripted checks: `iphone.mjs scroll` for baseline and patched URLs (`fix.mjs serve` for each, or
   `serve.mjs --root site-pretty --port auto --https` for the plain baseline).
3. Finger test (touch scroll-jack, toolbar resize): message the lead "need a finger scroll on <URL>,
   top to bottom then push past the end". The lead asks the user; start `iphone.mjs record` when
   the lead confirms the user is ready.
4. Release and message the lead "iPhone released (<topic>)". Never hold it while idle; never
   navigate the phone without the lease; waiters queue instead of polling faster than every 2 min.

Phone blocks (protocol v2 §5; queue and slot tickets: `fixes/LEAD.md` "Stages and gates"):
- **Blocks.** Only ticketed builds, served from immutable snapshot copies. A block: one question, one named control
  on the same base, one uncounted warm-up run, then ≤9 counted runs in C V V C C V V C order (3 arms: a rotated
  Latin square); 10 min cooling between blocks; at most 2 blocks per question (sequential rule, §5.3).
- **Sentinel** (static idle is no heat check, F-028): every control run reaches bottom ≥58 fps and scroll ≥44 fps
  (S/W) or held m=1 p95 ≤18 ms (M). A failing control voids every run since the last passing one; the phone cools
  10 min and the block restarts.
- **Drivers:** S `iphone.mjs scroll`, W window run, M morph driver (`__fwMorphDrive`), G WDA gesture, F finger via
  the lead. A claim names its driver; touch, bounce, pin and toolbar effects need G or F before landing.
- Never during a timed block: an attached Web Inspector, paint rects or debug borders, `layersForNode`, heap
  snapshots, polling faster than ~1 Hz (§5.5). Attribution runs get real Timeline durations with `Page.disable` →
  `Page.enable` → `Timeline.start` on the page target, re-sent after every navigation (F-047).
