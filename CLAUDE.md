# fastwork-com-web-optimize: agent guide

Personal, educational scroll-performance study of the public homepage https://fastwork.com/ on a
local mirror. Not affiliated with Fastwork. Details: `README.md` (mirror tooling), `research/`
(findings), `fixes/README.md` (per-fix workflow), `fixes/TOPICS.md` (what to fix, conflicts).

## Layout: five kinds of things

| | path | in git? | who writes it |
|---|---|---|---|
| (a) shared tooling | `tools/` (`serve`, `verify`, `fix`, `lock`, `iphone`, `ioscap`, `incident`, `finding`, `mirror`, `prettify`, `lib/`) | yes | any agent, with a covering test (Hard rule 6); usually a `toolsmith` per incident |
| (b) research write-ups | `research/<nn-topic>/` (README, data, one-off tools) | yes | append new studies; don't rewrite history |
| (c) baseline snapshot | `site/` (byte-identical), `site-pretty/` (Prettier 3.9.9 copy), pinned by `baseline.json`; agent worktrees are sparse and read the main checkout's | **yes, frozen on `main`** (local only, never pushed) | nobody; a new snapshot only by the user (`--new-snapshot`, then the authorized commit, "Baseline snapshot") |
| (d) per-fix experiments | `fixes/<topic>/` `README.md`, `patch.diff`, `results.json` (+ gitignored `overlay/`) | deliverables only, local branches | one fix agent per topic, in its own worktree |
| (e) project memory | `memory/` (`README.md` index + one note per user rule) | yes | the lead |

`out/` (gitignored) holds per-checkout measurement output, Chrome profiles and certs.

## Project memory: user rules and lessons

Standing user rules and the lessons behind them live in `memory/`, one note per rule with its dated history.
The index below is loaded for every agent; open the note before you act in its area. Only the lead adds or
edits notes (scrubbed, Hard rule 12); send the lead what should be remembered.

@memory/README.md

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
   anyone holds the lock (builds: `lock.mjs run chrome-measure --no-timing`, see "Shared devices").
   *Why:* A/B numbers only compare on a quiet machine. *Enforced:* both tools
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

Chrome, mobile viewport 430x932 DPR 3 with touch, **CPU 6x** reproduces the iPhone 15 Pro Max's scripted-scroll jank counts on this page (display on; OBSERVED in our setup: it slows only the main thread, so it can't stand in for raster/GPU, WebKit-only costs or the finger case, claims-audit §2.6)
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
- **Frame thresholds.** Chrome (120 Hz, vsync-aligned stamps): k = round(dt / 8.333 ms), ">34" = k≥5 (dt ≥ 37.5 ms),
  ">50" = k≥7 (dt ≥ 54.17 ms), medians compare as ticks; the legacy ms columns stay for one wave, and a verdict that
  differs between the two is "threshold-sensitive". Phone (Safari: WebKit requests a 60 Hz display link as a hint
  only, CONFIRMED: pref PreferPageRenderingUpdatesNear60FPSEnabled, preferredFramesPerSecond=60; Core Animation picks
  the actual rate and may run faster, e.g. 80 Hz, claims-audit §2.7. Idle and scripted runs (S/W/M) show 16-17 ms
  gaps; finger runs show stretches of 12-13 ms gaps (~80 Hz), trigger UNRESOLVED (F-071), so fps and frame counts
  from F/G runs don't compare with S/W/M runs, the ms thresholds do. Its 1 ms stamps mark the rendering-update
  start and are not vsync-quantized above one vsync, claims-audit §2.3): goal dt > 50 ms (target 0) and dt > 34, plus the ±4 ms twin counts
  (dt>46/54 for >50, dt>30/38 for >34); a verdict is "threshold-sensitive" when either twin's verdict differs;
  frames in the near bands (30, 38] / (46, 54] ms are flagged; phone minShift 4 ms (protocol §5.3); no k forms on
  the phone; record Low Power Mode (30 Hz).

## Fix workflow in a worktree (start to finish)

```sh
node tools/fix.mjs doctor                          # baseline found? linked worktree? port? locks?
node tools/fix.mjs new <topic>                     # fixes/<topic>/README.md + overlay/
node tools/fix.mjs grep 'getBoundingClientRect'    # search the baseline (pretty JS/CSS)
node tools/fix.mjs show /_app/immutable/nodes/2.DyWL8TcE.js --lines 2660-2780
node tools/fix.mjs edit <topic> /_app/immutable/nodes/2.DyWL8TcE.js   # copy into the overlay, then Edit it
node --check fixes/<topic>/overlay/_app/immutable/nodes/2.DyWL8TcE.js
node tools/fix.mjs serve <topic>                   # in background; then node tools/wait.mjs serve out/serve-<topic>.json (MIRROR_URL=…)
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
- **Countdown expiry, 2026-11-02 05:00Z** (JS line 3905): after it the frozen page stops counting down and gets
  cheaper by itself, so results measured before and after that instant never compare (unknowns-actions D7, V-U7).
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
npm test              # default: unit + e2e + hook tests on a tiny fixture baseline; no Chrome, network or iPhone (~165 s of wall time, ~285 CPU-s at --test-concurrency=6, I-076)
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
  the full suite is ~285 CPU-s and ~165 s): run it directly, **not** through the short lane.

- Agents **may fix bugs in `tools/`** (or work around them) when needed. Every change to `tools/`
  comes with a test that covers it (new or updated in `tests/`), and `npm test` must pass.
- Every tool takes `--help` (or `-h`, before any `--`): it prints the tool's header comment and exits 0 before
  anything runs, no server, lock, phone or file (I-152 N10, `tools/lib/help.mjs`). A new tool calls
  `exitOnHelp(import.meta.url)` right after its imports; `tests/unit/help.test.mjs` checks every tool.
- If a test fails after an accidental edit, **revert the edit**. Change a test only to reflect a
  genuine, intended behaviour change; never weaken a test just to go green.
- Tool fixes go in **their own commit**, separate from fix deliverables, and are reported to the lead
  as an incident, who lands them on main (rebase + ff-only) so every worktree gets them. The lead
  runs `npm test` on the exact commit in the **main checkout** too: it has `site/`, worktrees don't.
- `npm test` takes 250-280 s wall (2026-10-04, ~1640 tests; it was 160-165 s at ~1333 tests, I-076), ~1.75 cores mean, bursts to 6 (lane doc §2/§11), so a shared npm-test job may run up to 480 s (I-114): while others may be measuring, run it under the lock in the
  shared lane, `node tools/lock.mjs run chrome-measure --owner <you> --shared --weight npm-test --max-seconds 480 -- npm test`
  (not `test:chrome`: it takes the lock itself), and hold a shared lease around a commit whose hook
  runs it: `node tools/lock.mjs acquire chrome-measure --owner <you> --shared --weight npm-test --max-seconds 480 --wait 1800`,
  `git commit`, `node tools/lock.mjs release chrome-measure --shared --owner <you>` (`fixes/INCIDENTS.md`). Shared
  jobs run beside each other, never beside a timing hold ("Shared devices"); with the lead's switch off they run as
  short jobs. A short job waits for the current holder only, not for the queued 5-min A/Bs (incident I-007).
- Outside a lock slot run unit test files only (`node --test tests/unit/<file>`); e2e/fake-Chrome files and
  the full suite only via the shared or short lane (they load the host and contaminate others' holds; 2026-10-01 05:56Z).
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
  (background it, `node tools/wait.mjs serve <state.json> --pid $!`, run, kill it). Never hold the lock while editing or debugging.
  No normal hold longer than ~10 min (`run --max-seconds`, default 600; past it `status` shows OVERDUE):
  split longer work into separate holds and requeue after each.
- **Use the iPhone while you wait for Chrome.** The phone renders by itself, so an iPhone check barely
  loads the Mac and runs in parallel with Chrome measurements (lease, plain http per I-003).

## Agent communication

Short form of `fixes/AGENT_ROLES.md` "Addresses and peer work" (F-046):
- **Named spawns** `<role>-<topic>` (`fix-<topic>`, `ts-<incident>`, `review-<topic>`, `de-<area>`, `arch-<topic>`,
  `mgmt-ops-<N>`), unique per session. Every spawn prompt carries the **peer directory** (live copy:
  `research/management/ops-handover.md`); if a name fails, use the agent ID; never drop the message.
- **User console** (`tools/console.mjs`, 4698218): anything the user must do or answer (finger tests, swipe A/B,
  yes/no, ratings) goes there, not into the lead's chat. The lead keeps `node tools/console.mjs serve` running
  (localhost only, prints `CONSOLE_URL=`) and reads answers with `console.mjs list`. The store
  `.git/fastwork-mirror/console/` is shared by every worktree and stays local; posted URLs may name the LAN host, so
  never copy them into committed files (Hard rule 12).
- **Status board** (`tools/status.mjs`, console `/status`): report your workstream's state at every transition, when
  a wait starts or ends, and on resume (`status.mjs mine --by <you>`): `node tools/status.mjs set <id> --by <you>
  --state researching|designing|implementing|testing|measuring|reviewing|coordinating|waiting|ready-to-land|parked|landed|done|closed-no-fix|dropped
  --note "<one plain line>" [--next "…"] [--waiting-on lead:"land request"|agent:<name>|incident:I-0NN|…]`. The board
  adds your Chrome/phone queue place, console steps and blocking incidents itself; only the lead sets priority.
  `parked` needs `--resume-on incident:I-NNN|land:<topic|sha>|after:<ISO>|decision:lead|user|build:vN|never` (T-125);
  a row whose Progress item landed takes `done`, not parked/researching. `status.mjs check` lists rows that contradict
  fixes/PROGRESS.json or are ready to resume (red on /status); the lead runs `status.mjs sync --by lead` after landing.
  Read-time, no writes (I-152): a ready-to-land row whose branch head is on main reads "landed on main (from git)";
  an active row whose owner's run ended with a hand-back says "owner ended" (from Claude Code's transcripts, OBSERVED
  format) unless it has a live wait; a wait whose parent chain no longer reaches a live Claude Code process (its shell
  or Monitor task is gone) reads "owner ended (orphan wait)" (I-163, `tools/lib/proctree.mjs`); an owner inside one
  foreground tool call for more than 30 s reads "deaf: in <command, 40 chars> for N min" (I-169).
- **Threads** (`console.mjs thread`, console `/threads`): the user's questions, one thread per topic. The lead keeps
  `node tools/console.mjs thread wait --as lead --triage --timeout 3600` armed in the background (re-arm after each
  wake). It wakes only for a message nobody listening owns, one the user ticked "For the lead", an escalation, a user
  message unanswered for 10 min, and proposal decisions, undos and changed decisions (I-045); without `--triage` it
  wakes on every message. The lead answers with `thread reply <id> --by lead --text "…" [--ask]` or hands a thread on
  with `thread assign <id> --to <agent> --by lead`. **Every agent that owns a topic, a step or a proposal keeps
  `thread wait --as <you>` armed**: the router (T-050) gives a user message whose assignees are not listening to the
  first listening one of the commented item's owner, the lead's topic map (`thread topic set <tag> --owner <agent>
  --by lead`), the status-board owner, the desk (`thread desk set <agent> --by lead`); listening = a live thread wait,
  or a read or reply in the last 5 min; an orphan wait counts for neither (I-163; the lead exempt), a transcript's
  hand-back is no routing rule (agents between turns keep listening). An owner whose transcript shows it inside a
  foreground tool call for more than 30 s (not a background Bash or Monitor; OBSERVED format, unparsable = the rules
  before) is **deaf**: not listening, live wait or not, and busy (I-169, `tools/lib/transcripts.mjs`; the lead exempt);
  run long commands in the background. A **busy** owner (a status row implementing,
  testing or measuring, or holding chrome-measure/iphone, or deaf; I-164, memory "busy-workers-answer-later") is skipped: the
  message goes to the next free listener or the lead, and reaches the owner as a non-waking FYI that wakes its listener
  once its step ends; the user's answer to its own `--ask` and proposal decisions still wake it. Answer in the thread, not in chat; hand a decision to the lead with
  `thread escalate <id> --by <you> --note "…"`. Questions on a proposal (T-048) reach its author: `proposal talk <id>`
  shows them, `thread reply` answers. Others are refused. The user's thread text is printed as typed: never copy it
  into committed files unscrubbed (Hard rule 12). For phone links in a thread write `http://lan:<port>/` (never the
  address): it is stored as written and the Threads page opens the Mac's current LAN address (I-119).
  Try-it pages on the iPhone (I-126, user T-086): `node tools/console.mjs proposal phone <id> [--option <name>]` serves
  A and B on the Wi-Fi (plain http, detached serve.mjs; `--stop`, `--list`); the Proposals page shows their phone links
  (http://lan:<port>/, resolved at view time). The console itself stays localhost-only.
- **Ask the owner of the question directly.** mgmt-ops is the hub for the rest; the lead lands, resolves
  incidents, reorders locks, spawns and talks to the user.
- **Long commands run in the background** (user T-152, 2026-10-04): anything that may take over ~60 s (full
  `npm test`, `lock.mjs run`/`acquire --wait`/`wait`, `fix.mjs ab`, `verify.mjs`, `bench.mjs`, `iphone.mjs scroll|record|run|gesture`, builds)
  goes through Bash `run_in_background`; a foreground command makes you deaf to messages and user threads until it
  ends. Keep only short commands (`npm run test:unit`, reads, `status.mjs set`) in the foreground.
- Messages reach you only at your next tool round. **Wait with one command that exits by itself, never a
  `sleep`/`until`/`for … sleep` loop**: run it with Bash `run_in_background` and keep working (Claude Code wakes you
  when it exits); with nothing else to do, still run it in the background with a long `--timeout` (thread waits 3500)
  and end your turn: a foreground `--timeout 580` rerun costs a full model turn every 10 min (user T-109). A thread
  listener runs as ONE persistent Claude Code `Monitor` on `node tools/console.mjs thread wait --as <you> [--triage]
  --monitor --timeout 86400` (I-147): it keeps listening and prints one line per wake, `WAKE <kind> <id> <short text>`
  (kinds new, triage, escalate, proposal; `end`/`never` when it stops), so every wake, proposal decisions included,
  reaches you with no grep and no re-arm; `thread show <id>` gives the full text. Never filter its lines. **No
  work, no listener** (user T-109 #29): an agent with no step of its own left parks (status `parked`, final report)
  instead of keeping a wait up; user messages for a parked owner reach the lead's listener (the router's fallback),
  and the lead resumes the owner with SendMessage. Light jobs (routing, lookups, summaries) go to sonnet/haiku helpers
  with a short prompt, not to a 200k-context opus agent (each wake re-reads the whole context). Every
  wait prints one line, exit 0 MET, 3 TIMEOUT, 4 NEVER, 1 usage (c4a1ee2). Pass `--owner <you>` (or set `$FW_AGENT`)
  to every `wait.mjs` and `lock.mjs wait`: without it the wait still runs, prints a NOTE, and the board shows it as
  "owner unknown" (I-108):
  - a job's line: `node tools/wait.mjs file <log> --match '^EXIT' --pid <pid>` (a plain background job needs no wait);
  - your server: `node tools/wait.mjs serve out/serve-<topic>.json` (prints `MIRROR_URL=…`); a URL: `wait.mjs url <u>`;
  - locks, read-only: `node tools/lock.mjs wait chrome-measure --until mine|free|idle|released-by:<o>|'position<=N'
    --owner <you> [--for S] [--reason "…"]` (to get your turn use `run` or `acquire --wait`); a quiet window for CPU work:
    `--until idle --for 120`;
  - main: `node tools/wait.mjs git --path <p> | --grep '<subject re>' | --contains <sha>`; a process: `wait.mjs pid
    <pid>`; phone cooling: `wait.mjs phone-temp --below auto` (never a fixed `wait.mjs time`, user T-016); `incident.mjs wait <id>`; `finding.mjs wait --as <you>`.
  - A peer's reply has no command: wait on what the reply is about, or do other work.
  - Before any wait, set your board row (`status.mjs set … --state waiting --waiting-on "<what>"`), so the user sees
    who waits for what (user T-016, I-058). Give any `wait.mjs` a `--reason "<plain words>"`: the board shows it in
    place of a path or regex (I-060).
  Send peers what they need before your final report, which goes only to your spawner.
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

## Platform claims: confirm against a reference

A limitation, a browser or engine behaviour, or an unknown ("layerPainted never fires on Chrome 154", "WebKit
lays out the whole view when …", "Safari runs `linear()` easings on the main thread") is **OBSERVED** while it
rests only on our own probes. Before it becomes a fact in a finding, a protocol rule, a card, a fix decision or
a report to the user, it is checked against a reference: the spec, official docs (CDP, MDN, WebKit/Chromium
docs and blogs), the engine source and its history (source.chromium.org, github.com/WebKit/WebKit), or the bug
tracker. Cite the link plus the line, commit or milestone.
- **Status words:** OBSERVED (our data only, in our setup), CONFIRMED (a reference agrees; cited), REFUTED
  (a reference or a decisive check disagrees), UNRESOLVED (references are silent; name the decisive local check).
  Write the status next to the claim; an OBSERVED claim says "in our setup, cause unknown".
- **Plan, then execute:** the claimant (or a verifier) first writes the research plan (docs, source, bugs, and
  how our own probe could explain the result), sends it to the claim's owner, then does it.
- Any Chrome check the research needs goes through the owner's lock hold, like any other measurement.
- **The lead** never passes an OBSERVED claim to the user as fact, and asks for verification before
  signing a card that depends on one.
- Web research sends no personal data (Hard rule 12). Roles and the claim audit: `fixes/AGENT_ROLES.md`,
  `research/architecture/claims-audit.md`.

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
queue entry not refreshed for 10 min is dropped (a `run --short|--shared` process waiter after 60 s; a re-run `acquire` keeps its place, I-113). Short lane: `--short --max-seconds N` (N <= 300, on
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
A build or other CPU work that measures nothing takes a normal hold: `node tools/lock.mjs run chrome-measure
--owner <you> --no-timing --max-seconds 600 -- <build>`. It waits its FIFO turn but skips the host gate; nothing
timed on the Mac (verify.mjs, fix.mjs ab, bench, a normal `run`) may run inside it, short jobs may, and a `--no-timing` run
inside a timing hold refuses. Run only this checkout's tools inside it. Phone runs are the exception (I-056): the phone
stamps its own frames, so `iphone.mjs run|scroll|record|gesture` run inside their own hold (its command, or the same
owner), and a phone part that wants a quiet Mac runs in one: `node tools/lock.mjs run chrome-measure --owner <you>
--no-timing --max-seconds 600 -- sh -c '<part>'`. Outside their own hold they refuse (WAIT, exit 1) beside anyone else's
normal hold; an exclusive short job does not stop them. Mac-quiet is preferred, not required: beside a shared group they
run, print a NOTE and keep the Mac state in their record (`mac`: shared jobs, load1 at start and end); `--require-quiet`
(or `FW_PHONE_REQUIRE_QUIET=1`) makes them WAIT for it instead. `--allow-during-measure` is for diagnostics only.
Every `run` hold, shared readers included, leaves one line in `locks/holds.log` (owner, weight, start, end, duration, exit code).
Shared lane (`research/architecture/lock-shared-lane.md`, switched on by the lead 2026-10-02): jobs that time nothing
(`npm test`, `fix.mjs check`, DOM probes, `bench mech`, `npm run test:chrome:fn`, a Simulator mechanism session) hold
chrome-measure together: `node tools/lock.mjs run chrome-measure --shared --weight <n|job> --max-seconds N --owner <you>
-- <cmd>` (N <= 300, killed at N like `--short`; weights: check, probe, bench-mech, test-chrome-fn 1, npm-test 2,
simulator 3; the group fits the lead's cap, 3). A reader joins a running group while it fits, load1 <= 16 and no
exclusive waiter is queued; exclusive holds (timing, `--short`, `--no-timing`) wait for the group and go first after it,
but never before a reader queued ahead of them, and a reader queued 10 min goes before any exclusive (I-049) except one the lead moved (I-097).
Nothing timed starts inside a `--shared` command (verify.mjs, fix.mjs ab, bench gain/calibrate/reconfirm, a normal or
`--short` run, `iphone.mjs scroll|record|run|gesture` refuse; they also refuse a `--shared` flag, exit 2); a nested
`--shared` job re-enters its slot. Simulator mechanism checks: `node tools/lock.mjs run chrome-measure --shared --weight
simulator --max-seconds 300 --owner <you> -- node tools/sim.mjs session --functional --owner <you> -- <cmd>` (no
scroll/record/run in it); during a marked phone block it is DEFERRED (I-160, "Phone blocks" below). The lead switches the lane with `lock.mjs shared on|off`; while off, `--shared` runs as an
exclusive `--short` job.

```sh
node tools/lock.mjs status                                   # who holds what, who is queued
node tools/lock.mjs leave chrome-measure --owner <you>       # drop your waiting entries (stop the waiting process first)
node tools/lock.mjs run chrome-measure --shared --weight npm-test --max-seconds 480 --owner <topic> -- npm test   # functional, shared (I-114)
# Chrome: automatic. verify.mjs / fix.mjs ab wait for chrome-measure and release on exit or crash.
# iPhone (one page at a time, ios_webkit_debug_proxy on :9221/:9222, LAN https://lan:<port>/ or the twin's http://lan:<twin>/):
#   host `lan`: the Mac's LAN address, resolved at run time (I-073); `node tools/lan.mjs [--url --port N]` prints it.
#   It changes on a Wi-Fi reconnect: never type it, and never write it into a committed file (Hard rule 12).
node tools/lock.mjs acquire iphone --owner <topic> --ttl 900 --url https://lan:<port>/ --wait 3600   # in the background
#   exit 0 = yours (the lease runs from now); exit 3 = still busy after --wait, your place is kept: run it again
node tools/iphone.mjs open https://lan:<port>/ --owner <topic>    # navigates Safari (location.href)
node tools/iphone.mjs scroll --owner <topic> --label patched                 # scripted scroll, ~60 s
node tools/iphone.mjs record --owner <topic> --seconds 25 --label finger     # human finger scroll (see below)
node tools/lock.mjs renew iphone --owner <topic> --ttl 900                   # if you need longer
node tools/lock.mjs release iphone --owner <topic>
```

- **Idle alarm** (I-105, user T-058): `node tools/idle.mjs check [--phone-min 5] [--chrome-min 10]` at every
  check-in (lead, ops): exit 3 and an `IDLE <lock>: … free for N min … while work waits: <owners>` line when the iPhone
  lease (default 5 min) or chrome-measure (10 min) has had no holder for longer while waiters are queued or a status
  row in state `waiting` waits on it (`--waiting-on phone|chrome`, or its wait text or note names phone/iPhone, or
  Chrome/measure/lock; never a wait on the user or an incident); exit 0 otherwise. The lead keeps
  `nohup node tools/idle.mjs watch --by lead --interval 60 > out/idle-watch.log 2>&1 &` running (polls >= 30 s): one
  console thread per idle period, assigned to the desk and the waiting owners, closed when the slot is taken. Only
  reads the locks; rules in `tools/lib/idle.mjs`.
- Lock state looks wrong: `lock.mjs doctor`; the lead repairs with `lock.mjs repair … --apply` (audited).
  Never edit the lock JSON by hand.
- **Say what a hold is for** (I-060, the progress page's "Right now"): `acquire|renew|run` take `--doing "<plain line>"
  [--for <fix/agent>] [--eta-min N]`; mid-hold `lock.mjs doing <lock> --owner <you> --text "timing test for the blur
  change, run 3 of 9" [--for …] [--eta-min N] | --clear`. Without it the page shows your board note.
  `iphone.mjs scroll|record|run|gesture` mark their own run (from `--label`, or `--doing`). Plain words, nothing personal.

iPhone protocol on top of the lease:
1. Acquire the lease, then message the lead: "iPhone acquired for <topic>: <LAN URL>".
2. Scripted checks: `iphone.mjs scroll` for baseline and patched URLs (`fix.mjs serve` for each, or
   `serve.mjs --root site-pretty --port auto --https` for the plain baseline).
3. Finger test (touch scroll-jack, toolbar resize, blind swipe A/B): post it to the **user console**, not the
   chat: `node tools/console.mjs post --by <you> --kind action --record --title "<one line>" --instructions "<1-2
   plain sentences>"`, or `--kind swipe-pair --url <A> --url2 <B> --meta '{"key":…}'` for a blind pair. Per part N:
   `ack <id> --part N --state loading|ready` while the phone loads, then `wait <id> --until started --part N` in the
   background; start `iphone.mjs record`, then `ack <id> --part N --state recording` (only now does the page say
   "swipe"); `wait <id> --until done --part N` (at your cap `ack --state done`); finally `wait <id> --until answered`
   prints `{value, notes, meta}`. Missed swipe: `redo <id> --part N --message "why"`. Exit 0 MET, 3 TIMEOUT, 4 NEVER.
   A part the runner ends itself (e.g. a phone run that cycles versions): post it with `--runner-ends N[,M]` (or
   `"ends":"runner"` in `--parts`); the page then shows no Done there, only "Running, please wait; this ends by
   itself" plus your latest `ack --message`, refuses the user's Done (I-059), and you end it with `ack --part N --state done`.
   The user can "Start over" a started step (two taps): every part runs again with a new attempt, your waits exit 5
   `REDO` (reset the phone, wait for the new Start; `wait --until redo` in the background during a long part); label
   files with the `attempt` in the MET JSON and pass `ack --attempt N` so a late ack from an old try is refused.
   One phone step at a time (I-123, memory "one-phone-step-at-a-time"): post a swipe-pair, `--record` or `--phone`
   step only while you hold the iphone lease and no other phone step is open (`post` refuses otherwise; the lead is
   exempt). From part 1 keep `wait <id> --until redo` armed in the background; re-arm a wait with `--epoch <last epoch
   you saw>` (a wait armed after a missed Start over exits 5 REDO at once). While your step is on the phone the lock
   keeps your lease up to 10 min past expiry (`lock.mjs status`: KEPT); renew anyway. `iphone.mjs` refuses (WAIT)
   while another agent's step is on the phone (`--ignore-step <id>` only for an abandoned step); `idle.mjs check`
   prints STUCK when a step waits on its runner > 2 min (`--step-min`), and the lead's watch posts one thread.
4. Release and message the lead "iPhone released (<topic>)". Never hold it while idle; never
   navigate the phone without the lease; waiters queue with `acquire iphone --wait` (first come first served,
   no hand-made retry loops).

iPhone screen recorder (I-062; user T-018/T-019): only `tools/ioscap.mjs` may record the phone's screen. Its app
(`out/ioscap/ioscap.app`, built by `ioscap.mjs build` in a `--no-timing` hold) opens nothing but the iOS screen
device; QuickTime, camera listing, ffmpeg avfoundation, imagesnap and `screencapture -v` are denied (git-guard),
and nobody opens the Mac camera. `record --owner <you> --seconds N` (max 600) needs the `iphone` lease, refuses in a
`--shared` slot and prints numbers only (frames, distinct-frame rate, PTS gaps): nobody views frames. The first
run (`--first-run`, the macOS Camera prompt) is the lead's only, with the user's console OK and the user watching.
Output stays in the checkout's gitignored `out/iphone-screen/` (`.mov`, `.frames.json`, `.result.json`, `.json`):
never commit or publish it (rule 3, 12).

Phone blocks (protocol v2 §5; queue and slot tickets: `fixes/LEAD.md` "Stages and gates"):
- **Blocks.** Only ticketed builds, served from immutable snapshot copies. A block: one question, one named control
  on the same base, one uncounted warm-up run per arm's port (A3/U5), then ≤9 counted runs in C V V C C V V C order (3 arms: a rotated
  Latin square); park Safari (`iphone.mjs park`) after every block; between blocks cool with `node tools/wait.mjs phone-temp --below auto` (≤10 min, protocol §5.3); at most 2 blocks per question (sequential rule, §5.3).
- **Block marks (I-160; the runner's steps).** At the block start: `node tools/lock.mjs doing iphone --owner <you>
  --block <ticket>` (or `acquire iphone … --block <ticket>`). After each hold of the block: `doing iphone --owner <you>
  --between <min>` (the gap until your next hold; your next chrome-measure hold or phone run ends it). At the end: `doing
  iphone --owner <you> --block none`, or release the lease. While the block is marked, a Simulator session (`--shared
  --weight simulator`, or a `run` of `sim.mjs session`) neither joins nor opens a shared group: it prints `DEFERRED`
  (acquire: exit 3; run/--wait: polls on, out of the queue; `lock.mjs status` lists it) and starts only in a window its
  `--max-seconds` fits into while you neither hold nor queue for chrome-measure, or after the block. The warm
  Simulator's keeper shuts it down when the lease holder's `--no-timing` hold is held or queued, not only for a timing hold.
- **Sentinel** (static idle is no heat check, F-028): every control run reaches bottom ≥58 fps and scroll ≥44 fps
  (S/W) or held m=1 p95 ≤18 ms (M). A failing control voids every run since the last passing one; the phone cools
  until the battery temperature is at or below the last passing sentinel's minus 0.5 °C, 38 if none today
  (`wait.mjs phone-temp --below <°C>`), at most 10 min; the sentinel still decides validity; then the block restarts. **Timeline blocks** (every counted run captures Timeline): the sentinel is one
  uncounted Timeline-OFF control run after the warm-up(s) and one at the block end (only the end one if Timeline-on
  control data already meets both criteria, bottom ≥58 and scroll ≥44); counted runs keep Timeline on in every arm
  and are judged within the block; attribution runs come after the end sentinel (protocol §5.2, 441f15f).
- **Drivers:** S `iphone.mjs scroll`, W window run, M morph driver (`__fwMorphDrive`), G WDA gesture, F finger via
  the lead. A claim names its driver; touch, bounce, pin and toolbar effects need G or F before landing.
  G runners: `iphone.mjs wda check` (no lease) before the gate; plan each run from `gesture --dry-run`'s
  `GESTURE_BUDGET_S` (max(150 s, 3x the estimate)); a gesture refuses in a hold with less time left (I-112).
- Never during a timed block: an attached Web Inspector, paint rects or debug borders, `layersForNode`, heap
  snapshots, polling faster than ~1 Hz (§5.5). Attribution runs get real Timeline durations with `Page.disable` →
  `Page.enable` → `Timeline.start` on the page target, re-sent after every navigation (F-047). The logger's rAF
  scrollY read is neutral (P0 A/A, P-023, 2026-10-01: equal layout and tick counts), so A9's caveat is lifted
  for rAF-only loggers; reads in timers or MO/cv callbacks (winrun's step timer, the pre-T1a std probe) were not tested.
