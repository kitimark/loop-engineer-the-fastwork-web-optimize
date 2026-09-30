# Handoff: continuing the code-navigation benchmark

This is for a successor setup:

- A small **measurement orchestrator** plans batches.
- The lead spawns **flat, short-lived batch agents**, one batch each, with low context.
- Results live in files, not in anyone's context.

Findings so far are in `README.md`. This file says how to run more of it.

## 1. Tasks and ground truth (`tasks.json`)

```jsonc
{ "note": "...",
  "tasks": [{
    "id": "T03",                           // stable id, T01..T27 used
    "type": "callers of a function",       // free text; groups in tools/summarize.mjs GROUPS
    "source": "real question from fix-…",  // optional: owner-sourced vs synthetic
    "question": "…full question, names the file(s); 1-based lines…",
    "schema": "{\"callers\":[{\"line\":0,\"component\":\"\",\"callback\":\"\"}]}",  // JSON shape the helper must end with
    "gt": { … }                            // ground truth; free-form, read only by this task's scorer
  }]}
```

- **Every task needs a scorer** `scorers.Txx(answer, gt)` in `tools/score.mjs`. It returns
  `{score 0..1, precision?, recall?, offByOne, …}`.
  - For list answers, use `listScore(gt, answers, match, credit)`: F1 of credit-weighted recall and
    precision.
  - Always compute `offByOne` (answered line = ground truth - 1). It is how Serena's 0-based leakage shows up.
  - Make fields neutral (neither required nor penalised) when the ground truth is debatable, as T04 does for
    the namespace getter 3420 and the destructure CzkAa0og:540.
- **Build ground truth independently of both arms**:
  - `tools/gt.mjs` gives enclosing-function chains (`scope`, `funcs`), call sites by callee regex (`calls`)
    and TypeScript language-service references (`refs`). It needs `NAV_BENCH_TS=/path/to/typescript`; one is
    in `~/.npm/_npx/*/node_modules/typescript`.
  - Grep for strings and CSS.
  - `tools/css-context.mjs` gives CSS selector and @media chains.
  - **Then read the code.** TypeScript references share Serena's engine, so re-read every list.
- **Ground truth for `tools/`/`tests/` changes when main moves.** Record the main SHA in `tasks.json` "note"
  and re-verify before scoring. The `site-pretty/` baseline only changes on re-mirror or re-prettify.

## 2. One run = one task × arm × rep, one batch agent per run

- **Spawn**:
  - Tool: `Agent`, `subagent_type: "general-purpose"`, `model: "sonnet"` (the model used so far; pass
    `haiku` to test weaker models), background.
  - No `isolation`: the helper is read-only and reads the main checkout.
  - One prompt per run. Get it with `node research/code-navigation-benchmark/tools/prompt.mjs <Txx> <G|S|SO>`
    and paste it verbatim. Never add hints.
- **Prompt template**, built by `prompt.mjs`:
  1. Repo path; ignore `.claude/worktrees/` copies.
  2. READ-ONLY. No docs: `research/`, `fixes/`, `.serena/memories/`, README (they contain answers).
  3. "site-pretty/ holds prettified minified bundles…; all line numbers 1-based".
  4. The TOOLS paragraph for the arm:
     - **G**: Grep, Glob, Read and read-only Bash (`fix.mjs grep|show`). Do NOT load any `mcp__serena__`
       tool.
     - **S**: Serena-first. `ToolSearch "+serena"`; symbol tools first; text tools only for strings, CSS and
       comments; Serena lines 0-based, add 1; pass `relative_path`; skip `initial_instructions` and memories;
       at most 3 Serena calls in parallel.
     - **SO**: Serena plus Read on located ranges only. No Grep, Glob or Bash. "Say so if Serena cannot answer."
     - Possible new arm, **G+R**: text first, plus a written decision rule saying when to call
       `find_declaration` or `find_referencing_symbols`. This tests the recommended policy.
  5. `QUESTION (Txx): …`
  6. "End with a short answer, then a fenced json block of exactly this shape: <schema>".
- **Raw result, one file per run, nothing in agent context**:
  1. When the spawn returns, the orchestrator (or lead) appends `Txx<TAB>arm<TAB>rep<TAB>agentId` to
     `data/runs-index.tsv`. Add a 5th column `invalid:<reason>` for harness glitches.
  2. The helper's full transcript persists at
     `~/.claude/projects/-Users-<user>-source-fastwork-com-web-optimize/<session>/subagents/agent-<id>.jsonl`,
     also symlinked as `<scratchpad>/tasks/<id>.output`.
  3. `score.mjs` turns each transcript into `data/raw/<agentId>.json`. That file holds metrics, tool calls
     (no arguments), the answer with free text stripped, and the transcript-based score.
  4. Re-scoring later works from `data/raw/` alone.
  - Nothing needs to flow through the lead's context. Ignore the hand-back message; the scorer reads the
    last ```json block in the transcript (hand-back message or final text).
- **Batch agents vs helpers**: a "batch agent" may spawn its helpers itself, as long as it only records
  agent ids and never reads their answers. Or the lead spawns them flat. Either way, keep each helper to
  exactly one question.

## 3. Scoring and aggregation

```sh
cd <repo>/research/code-navigation-benchmark      # or use absolute paths
NAV_BENCH_TASKS=~/.claude/projects/-Users-<user>-source-fastwork-com-web-optimize/<session>/subagents \
  node tools/score.mjs --write > data/score-table.tsv     # new runs: transcript -> data/raw/<id>.json; all: runs.json
node tools/score.mjs --write > data/score-table.tsv       # without NAV_BENCH_TASKS: re-score from data/raw only
node tools/summarize.mjs > data/summary.txt              # by task, arm, group, source; data/summary.json
node tools/serena-log.mjs ~/.serena/logs/<date>/mcp_<id>.txt --since HH:MM --json data/serena-server-calls.json
```

- **`score.mjs`**:
  - Reads `runs-index.tsv`.
  - For each run, it uses the transcript if found (`<id>.output` or `agent-<id>.jsonl` in
    `NAV_BENCH_TASKS`), else `data/raw/<id>.json` with its stored score.
  - When the answer is missing, it falls back to `data/manual-answers.json`, which holds prose answers
    transcribed by hand for runs that forgot the JSON block.
  - It flags `firstAnswerScore` when a run self-corrects in a second JSON block.
- **`summarize.mjs`**:
  - Excludes invalid runs.
  - Reports by arm, by task and by group. Edit `GROUPS` when you add task types.
  - Reports by source: synthetic T01-T18 vs owner questions T19+. Edit the `real` set.
  - Writes per-tool latency (`agent-call-stats.json`).
- **Hard rule 3**: committed data holds names and line numbers only. `score.mjs` strips `what`, `use`, `how`,
  `mechanism` and `holds`, and drops tool arguments and prose. Keep it that way: never commit transcripts.

## 4. Measured so far, and what is open

**Measured**: 133 runs, 4 invalid. 27 tasks × G/S (2 reps each) plus SO (1 rep, 22 tasks), all Sonnet on the
prettified baseline. See README for the table and decision rule. In short:

- Text search is the default.
- Serena helps for `find_declaration` on call sites (aliases, duplicated short names) and for
  `find_referencing_symbols` with full name paths.
- Serena is blind to CSS, strings, census questions and child processes.
- 0-based leakage is its top error.

**Open, worth measuring.** Each batch is sized for one agent: about 6-10 helper runs, one Serena-heavy batch
at a time.

| batch | runs | question it answers |
|---|---|---|
| B1 policy arm | T03 T04 T12 T19 T21 T24 T25 × arm **G+R** (text + written Serena decision rule) × 1 rep = 7 | Does the recommended rule beat pure G on cost without losing accuracy? |
| B2 weaker model | T04 T11 T17 T19 T24 × G and S × model **haiku** × 1 = 10 | Does Serena help weaker models more, where grep scoping errors appear? |
| B3 minified code | 5 new tasks on `site/` (unprettified one-line files) × G/S × 1 = 10 | Grep on 300 KB single lines vs Serena (the `hot_code_map`-less case) |
| B4 open discovery | 3 new tasks ("find every forced-layout read/write interleave in scroll callbacks", "everything that writes `.pain` classes", "all rAF loops that never stop") × G/S × 1 = 6 | Recall on broad questions without names given |
| B5 memory effect | T01 T03 T07 T13 × G and S **with** `hot_code_map`/TOPICS allowed × 1 = 8 | How much memories shortcut both arms (the realistic setting) |
| B6 overlay paths | 3 tasks asked about a fix overlay copy (`.claude/worktrees/<wt>/fixes/<t>/overlay/…`) × G/S × 1 = 6 | Wrong-root / wrong-path errors (Serena roots at the main checkout) |
| B7 reps for noise | T03 T04 T19 T24 × G/S × 2 more reps = 16, split over 2 agents | Tighten the few tasks where the arms differed in time or tokens |

## 5. Pitfalls (all seen in this study)

- **Harness quirk: "placeholder" hand-backs.** 4 G runs on the shortest tasks handed back the literal
  "placeholder" with no answer. Mark them `invalid:placeholder-handback` and rerun. Never nudge a helper
  mid-run, since that contaminates the metrics.
- **Missing JSON block** (2 runs): transcribe the prose into `data/manual-answers.json` with a note.
- **Serena is shared and serial**, with the lead and all fix owners.
  - Keep one Serena-heavy batch at a time, at most about 5 S/SO helpers concurrently.
  - Never ask helpers to run `find_referencing_symbols` on hot runtime helpers (`Ln` took 33 s / 109 KB).
- **Serena lines and snippet prefixes are 0-based.** Score with exact 1-based lines and keep the
  `offByOne` column.
- **Short Serena name paths resolve to the wrong symbol**: `AE/a` is the component-level array; the effect
  local is `AE/ne() callback/a`. Build ground truth with full paths.
- **Do not message fix owners from a benchmark agent.** A `SendMessage` resumes the owner and re-routes its
  completion notices to the sender. Route owner questions through the lead.
- **Main moves under you.** `tools/`/`tests/` line numbers shifted once mid-study (`cmdAb` 333 → 336). Re-check
  tooling ground truth before scoring and record the SHA.
- **Wall times** include queueing with 5-12 concurrent helpers. Compare tokens, calls and peak context too.
  Total tokens are mostly cache reads.
- **Bash vs Grep tool.** Helpers use Bash grep/sed (about 1.8 s median per call under load) far more than
  the Grep tool (2 ms). If you measure speed, say which one you mean.
- **Ceiling effect.** Sonnet on prettified code with named symbols is near 100 % in every arm. Differences
  show up only with weaker models, unprettified code or open-ended questions (batches B2-B4).

## 6. Follow-up status (2026-10-01)

Batches b1-b7 answered the open questions in section 4 (B1 policy arm, B2 haiku, B3 minified, B4 discovery, B5
memory, B6 overlay, B7 haiku reps): see README "Follow-up study". Sonnet stayed at the ceiling in every
condition; haiku showed no Serena benefit (T04 is the only task that separates the arms). The decision rule is
unchanged. Extra arms in `tools/prompt.mjs`: GR, GM/SM (notes allowed), GN/SN (notes required), GU/SU
(minified `site/`), and `-haiku` labels; `runs-index.tsv` has optional columns 6 (model) and 7 (batch id). Batch
specs are in `batches/`. The overlay tasks T31-T33 read `fixes/nb-overlay/overlay/` inside the nav-bench worktree
(gitignored, not committed): recreate it by inserting 12 comment lines after line 2000 of the baseline bundle and
appending the `NB1` function described in tasks.json before re-running them.
Untested: a much larger codebase; other wordings of the GR rule.
