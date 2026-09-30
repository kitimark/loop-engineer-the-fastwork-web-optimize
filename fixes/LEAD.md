# Lead playbook

For the main Claude Code session in the main checkout, which runs a wave of fix owners and lands
their results. Roles, spawn mechanics and the model/effort guide are in
[`AGENT_ROLES.md`](AGENT_ROLES.md); rules in `CLAUDE.md` "Hard rules". Merges into `main` use
**rebase + `git merge --ff-only` only**: no merge commits, no `--no-ff`, no squash; if ff-only fails,
rebase again.

## 1. Before spawning

- The session must have started after `.claude/agents/` existed (restart otherwise); worktrees
  contain only committed files, so commit tooling and docs first.
- `node tools/fix.mjs doctor` and `node tools/lock.mjs status` (no stale holders).
- Noise floor once per session: `node tools/fix.mjs ab --aa --runs 5`; put its table (or the path
  of `out/ab/_aa/<stamp>/results-aa.json`) into every spawn prompt so owners don't each spend lock
  time on it.
- Pick the wave from [`TOPICS.md`](TOPICS.md): one owner per topic or conflict cluster, **3-5
  owners at a time**. Every owner's A/B waits for the same `chrome-measure` lock, so more owners mean
  a longer queue, not more measurements.

## 2. Spawn owners

Fill in the block from [`AGENT_PROMPT.md`](AGENT_PROMPT.md) (topic, scope, related owners with the
names you are giving them, A/A numbers, and `--on <combined>` for wave 2).

| | agent-team teammate | worktree subagent |
|---|---|---|
| call | `Agent(subagent_type: "fix-owner", name: "fix-<topic>", prompt: …)` | same plus `isolation: "worktree"` |
| use for | topics that must talk: clusters B, C, D, E | independent topics: 1, 9, 11 |
| worktree | none at start (runs in the main checkout); step 0 of the prompt enters `.claude/worktrees/fix-<topic>` | created from `HEAD` by Claude Code |
| model / effort | definition `model` (opus) unless the prompt names one; effort = **yours** (set `/effort high` first) | definition: opus / high |
| its helpers | foreground subagents (it waits) | background subagents, layer 2 of 3 |
| messages | teammates and you by name; permission prompts come to you | `SendMessage` by name; result arrives as a notification |

Per-call `model: "fable"` is available for L-size topics (cluster A, `morph-scrolljack-passive`,
`hero-exit-scroll-timeline`); it may bill usage credits. Spawn reviewers and mappers **without a
`name`**: a named call from your session becomes a teammate, which drops the definition's `effort`.

## 3. While owners work

- **Permission prompts** from teammates and background subagents surface here. Deny any write to
  `site/`, `site-pretty/`, `tools/`, `tests/`, `.serena/`, any `git push`/`git add -f`, any
  chrome-devtools MCP call, and any `git merge` by an owner.
- **iPhone finger tests** (only you can talk to the user): an owner holding the `iphone` lease
  messages "need a finger scroll on <URL>…" → tell the user the URL and what to do (top to bottom,
  then push past the end) and ask them to say when ready → message the owner "user ready, start
  `iphone.mjs record` now" → relay the user's remarks afterwards. One test at a time; the lease queue
  decides the order. You never navigate the phone without holding the lease yourself.
- **Broken tools:** owners report and don't patch. Reproduce, fix in your own infra worktree
  (`tools/` and `tests/` are protected; run the tests), land with rebase + ff-only, then tell the
  owners to `git rebase main`.
- **Cross-topic disputes:** decide with the conflict table in `TOPICS.md`; one owner changes the
  shared code, the other adapts.
- Wait for owners; don't do their work in the lead session.

## 4. Review

When an owner reports done: `Agent(subagent_type: "fix-reviewer", prompt: "topic <t>, worktree
<abs path>, branch <b>, A/A: <numbers>")`. NEEDS-WORK → send the blocking items to the owner, review
again after. A well-documented null or rejected result (README `Status: rejected`) is still worth
landing.

## 5. Land a fix (rebase + fast-forward only)

`git worktree list` shows each owner's worktree and branch.

```sh
git -C <owner worktree> rebase main
git -C <owner worktree> diff --stat main...HEAD   # only fixes/<topic>/{README.md,patch.diff,results.json}
git status --short                                              # main checkout: nothing modified under fixes/<topic>/
git merge --ff-only <fix branch>                                # in the main checkout; if it fails: rebase again
git worktree remove <owner worktree> && git branch -d <fix branch>   # once the owner is finished
```

`patch.diff` holds Fastwork excerpts: `main` stays local (there is no remote; never push). The
overlay is gitignored and disappears with the worktree; `node tools/fix.mjs apply <topic>` rebuilds
it from `patch.diff`.

## 6. Combine a wave and start the next

```sh
git worktree add .claude/worktrees/wave1 -b wave/1 main        # after the wave's fixes landed
cd .claude/worktrees/wave1
node tools/fix.mjs combine all-wave1 <t1> <t2> ...              # CONFLICT lines name the patches that clash
node tools/fix.mjs diff all-wave1 && node tools/fix.mjs ab all-wave1 --runs 5
```

Send a conflicting pair to its owners (or resolve a trivial clash in `fixes/all-wave1/overlay/`),
write `fixes/all-wave1/README.md` (topics, order, combined table), review it with `fix-reviewer`,
commit, land with rebase + ff-only. Wave-2 owners start with `node tools/fix.mjs apply all-wave1` in
their worktree and pass `--on all-wave1` to `edit`, `diff`, `serve` and `ab`.

## 7. Wrap up

Shut down idle teammates, `node tools/lock.mjs status` shows no holder of yours, remove landed
worktrees and branches, and leave port 5173 alone.
