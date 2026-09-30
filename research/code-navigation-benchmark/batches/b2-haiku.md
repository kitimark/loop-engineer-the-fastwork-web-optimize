# Batch b2-haiku

Question this batch answers: Does Serena help a weaker model (haiku) more than it helps sonnet? Same tasks as the sonnet G/S runs, model haiku.

You are a low-context BATCH agent. Your whole job is to spawn 10 single-question helper agents (one per row below), record their agent ids, and report. You do NOT evaluate answers.

## Rules

- Work dir for commands: `/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/nav-bench` (the `wt/nav-bench` worktree). The helpers read the MAIN checkout `/Users/<user>/source/fastwork-com-web-optimize` themselves; you never need to.
- Do NOT read the helpers' answers or transcripts, do not score, do not comment on correctness. Their hand-back text is noise to you: ignore it apart from the agent id.
- Never nudge, resume or message a helper mid-run (it contaminates the metrics). Never message other agents. No Chrome, no ports, no locks, no edits to any file except appending to `data/runs-index.tsv`.
- Serena is a shared, serial server: obey the wave sizes below (S-type arms: `S`, `SU`, `SM`, `S-haiku`, never more than 3 at once).

## Runs (batch id `b2-haiku`, model for every helper: `haiku`)

| # | task | arm | model | rep |
|---|---|---|---|---|
| 1 | T04 | G-haiku | haiku | 1 |
| 2 | T11 | G-haiku | haiku | 1 |
| 3 | T17 | G-haiku | haiku | 1 |
| 4 | T19 | G-haiku | haiku | 1 |
| 5 | T24 | G-haiku | haiku | 1 |
| 6 | T04 | S-haiku | haiku | 1 |
| 7 | T11 | S-haiku | haiku | 1 |
| 8 | T17 | S-haiku | haiku | 1 |
| 9 | T19 | S-haiku | haiku | 1 |
| 10 | T24 | S-haiku | haiku | 1 |

Wave 1: the 5 G-haiku runs in one message. Wave 2: the 5 S-haiku runs, at most 3 concurrently (3, then 2).

## How to spawn each helper

1. Get its exact prompt: `cd /Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/nav-bench && node research/code-navigation-benchmark/tools/prompt.mjs <task> <arm>`. Drop the first output line (`=== <task> <arm>`) and use everything else, verbatim, as the helper prompt. Add nothing, hint at nothing.
2. Spawn with the Agent tool: `subagent_type: "general-purpose"`, `model: "haiku"`, no `isolation`, `description: "nav <task> <arm>"`. Send all helpers of a wave in ONE message so they run concurrently.
3. When a helper returns, take its agent id from the spawn result (format `a...`) and append one line, tab-separated, to the index (one `printf` per helper, appended with `>>`; other batches append to the same file concurrently):

   `printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' <task> <arm> 1 <agentId> '' haiku b2-haiku >> /Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/nav-bench/research/code-navigation-benchmark/data/runs-index.tsv`

   (5th column empty = valid; the 6th is the model and the 7th is this batch id.)
4. Harness glitch: if a helper's hand-back is the bare word "placeholder", empty, or has no JSON block at all, still record its line but put `invalid:placeholder-handback` in the 5th column, then re-run that one row once and record the new agent id as a normal line (rep 2). Do not retry more than once.
5. If you have no Agent tool, stop immediately and report exactly that.

## Your final report (max 6 lines)

`batch b2-haiku done: <n> helpers recorded, <k> flagged invalid, <list of any task/arm that failed to spawn>` and nothing else.
