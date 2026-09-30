# Code navigation for fix agents: text search vs Serena

Question from the user: **"which one is better?"** Plain text search (Grep/Glob/Read, `node tools/fix.mjs
grep|show`) or the read-only Serena symbol tools (`find_symbol`, `find_referencing_symbols`,
`get_symbols_overview`, `find_declaration`, ...)? Answered with data, per task type.

## Headline

- **Accuracy is not what separates them here.** With a capable model (Sonnet helpers) on the *prettified*
  bundle, text search answered all 35 valid runs perfectly (18 tasks, 9 task types, including the traps built
  for grep: short names repeated 100+ times, shadowed locals, aliased runtime exports, CSS, multi-line
  declarations). "Serena-first" scored 0.98 (one run lost 4 of 5 lines to Serena's 0-based numbering) and
  "Serena-only" 0.90.
- **Text search was also cheaper on 14 of 18 tasks** (median 143k vs 198k total tokens per run, 37k vs 42k
  peak context, same median wall time about 21 s). Serena adds about 4-5k tokens of tool schemas, and agents
  usually re-read the code with Read or sed to verify what Serena returned.
- **Serena is better at a few things:**
  - It gives "all callers of X" with the enclosing function name path. On callers of `dE` (T03), Serena-assisted
    runs took 15-37 s against 47-58 s for grep runs, because the grep runs spent turns checking scope boundaries.
  - Its references for a local are exact once you know the name path. `uM/ne() callback/e` returned exactly the
    5 right lines out of 117 textual `e` lines. Agents seldom knew that name path.
  - It is the only tool that follows JS imports and aliases without reading them.
- **Serena is blind or unreliable for a lot of fix-agent work:**
  - CSS: the Serena-only run found nothing.
  - String arguments such as `setProperty('--exit-opacity')`: missed.
  - "Every line containing X": the Serena-only run needed 41 calls, 98 s and 1.1M tokens, against 3 calls and
    18 s for grep.
  - Child processes (`fix.mjs ab` spawns `verify.mjs`) are invisible to it.
  - Namespace destructuring (`var { onMount: ze } = s`) is missed by references.
  - Its 0-based lines leak into answers.
- **Agents mostly don't use Serena even when told to.** In the Serena-first arm, only 23 of 36 runs made any
  Serena call. Serena was 23 % of the arm's tool calls, and several runs said outright that grep and read were
  simpler.

**Verdict per task type** (details below):

- Use text search for strings, CSS, census questions, reading a function body and tooling/process flow.
- Use Serena optionally for "callers or references of a named function or variable" and for jumping to a known
  symbol's range, always with +1 line conversion and a read to confirm.
- Neither is needed for disambiguating shadowed short names in this prettified code: reading the enclosing
  block (<100 lines) was as accurate and cheaper.

## Setup

- **Code**:
  - `site-pretty/_app/immutable/nodes/2.DyWL8TcE.js` (13,510 lines, 1-3 letter names).
  - The Svelte runtime `chunks/BSBv9QXB.js` and the other chunks/entry files.
  - `assets/*.css`.
  - The repo's `tools/` and `tests/` on main `49d337b`..`413a293` (tool lines checked unchanged across that range).
- **Arms**, same prompt apart from one TOOLS paragraph (`tools/prompt.mjs` prints the exact prompts):
  - **G**: text tools only (Grep, Glob, Read, read-only Bash incl. `fix.mjs grep/show`); Serena forbidden.
  - **S**: "Serena-first": use Serena symbol tools first, text tools only for what Serena cannot do; reminded
    that Serena lines are 0-based.
  - **SO**: Serena only, plus Read on ranges located with Serena (no Grep/Glob/Bash). One run per task, on 17
    of 18 tasks, to see what Serena itself can do.
- **Helpers**: `general-purpose` subagents on **model sonnet**, background, concurrent (5-12 at a time).
  - Read-only; no docs (`research/`, `fixes/`, `.serena/memories/`, README). Serena memories and
    `fixes/TOPICS.md` contain several answers and are readable by both arms, so they would not separate the
    tools.
  - Each run answers one question and ends with a JSON block, scored automatically (`tools/score.mjs`).
  - G and S: 2 runs per task, order reversed between reps (rep 1 G first, rep 2 S first).
- **Ground truth** (`tasks.json`):
  - Built with grep plus the TypeScript compiler (`tools/gt.mjs`: enclosing function chains, language-service
    references), then checked by reading the code.
  - The TypeScript references share an engine with Serena, but every reference list was re-read by hand.
  - One reference the TypeScript-based ground truth missed (`chunks/CzkAa0og.js:540`, a namespace destructure
    of `onMount`) was found by grep runs. It is scored as neutral.
- **Scoring**:
  - List answers: F1 of line-level precision and recall. Items with a wrong enclosing function or local name
    get half credit.
  - Location answers: exact 1-based lines.
  - `offByOne` counts answered lines that are exactly ground truth minus 1 (0-based leakage).
- **Metrics per run**, from the helper transcripts (`tools/transcript.mjs`): tool calls, wall time, total
  tokens (input incl. cache read/creation plus output), peak context. Serena server-side latency comes from
  the Serena MCP log (`tools/serena-log.mjs`).
- **Runs**: 91 in total. G has 35 valid runs; its 3 invalid runs were a harness glitch (below). S has 36,
  SO 17.

## Results

### By task type (mean score, perfect/n, mean tool calls, median wall time, median total tokens)

Blocks C, F, H and I have one task each, so n is small. Treat the time and token columns as indicative.

| type (tasks) | G text | S Serena-first | SO Serena-only |
|---|---|---|---|
| A locate a definition, by name or behaviour (T01 T02 T13) | 1.00 (5/5) 3.4c 18.5s 136k | 1.00 (6/6) 5.3c 17.1s 179k | 1.00 (3/3) 7c 23.5s 263k |
| B callers / references of a named symbol (T03 T05 T14) | 1.00 (6/6) 5.2c 22.5s 196k | 0.87 (5/6) 5c 18.0s 189k | 1.00 (3/3) 8.3c 22.5s 220k |
| C cross-file refs through bundle import aliases (T04) | 1.00 (2/2) 16c 93s 629k | 1.00 (2/2) 19.5c 105s 767k | 1.00 (1/1) 28c 100s 715k |
| D disambiguate short / shadowed locals (T11 T12 T17 T18) | 1.00 (8/8) 3.4c 18.5s 116k | 1.00 (8/8) 3.4c 18.5s 127k | 0.95 (3/4) 5c 19.9s 181k |
| E call-graph-scoped API use, read a function body (T07 T08) | 1.00 (4/4) 4.5c 30.4s 162k | 1.00 (4/4) 3.8c 35.5s 195k | 1.00 (2/2) 3.5c 35s 261k |
| F who writes a CSS custom property (T06) | 1.00 (2/2) 11c 64s 441k | 1.00 (2/2) 8c 38s 333k | 0.50 (0/1) 18c 53s 481k |
| G CSS rules (T09 T10) | 1.00 (4/4) 3.3c 23.5s 139k | 1.00 (4/4) 3.5c 23.8s 156k | 0.00 (0/1) 5c 18.9s 213k |
| H text census, every line with X (T15) | 1.00 (2/2) 3c 18s 130k | 1.00 (2/2) 4.5c 22s 202k | 1.00 (1/1) 41c 98s 1111k |
| I tooling flow across processes (T16) | 1.00 (2/2) 4.5c 27s 161k | 1.00 (2/2) 7c 24s 261k | 1.00 (1/1) 13c 31s 406k |
| **all** | **1.00 (35/35)** 5.0c 21.3s 143k | **0.98 (35/36)** 5.4c 21.1s 198k | **0.90 (14/17)** 10.5c 23.5s 234k |

- **Per task**: `data/summary.txt` and `data/summary.json`.
- **Per run**: `data/runs.json` and `data/score-table.tsv`. `runs.json` keeps answers as names and line
  numbers only; prose and tool arguments are dropped (Hard rule 3).
- **Token cost of S relative to G**, per task: 0.76x to 1.70x (S cheaper on T03, T06, T09 and T12).
- **Peak context**: G 37k, S 42k, SO 42k (medians).

### Raw per-call cost (outside the agents, and as the agents saw it)

| operation | text | Serena (server-side, from its log) |
|---|---|---|
| find a definition | `grep -n '^function dE'`: 12 ms, 29 chars | `find_symbol`: median 20 ms, p90 38 ms (68 calls) |
| references of a function | `grep -nw dE`: 11 ms, 525 chars | `find_referencing_symbols`: median 119 ms, p90 0.59 s, max 1.4 s (23 calls); a very common runtime helper (`Ln`) took **33 s / 109 KB** in an earlier session |
| file outline | `grep -n '^function '`: 12 ms, 2.7k chars | `get_symbols_overview`: 10 ms but **11.5k chars** for `2.DyWL8TcE.js` (only top-level names, no ranges) |
| read a component body (367 lines) | `sed -n`: 11 ms, 10.6k chars | `find_symbol include_body`: refused over the default size ("answer too long", 11.2k chars) unless `max_answer_chars` is raised |
| `node tools/fix.mjs grep` / `show` | 62 ms / 55 ms | - |

- **Agent-side latency** (tool_use to tool_result, includes harness overhead and concurrency):
  - Serena calls: 91-183 ms median.
  - Read: 15 ms.
  - Grep tool: 2 ms.
  - **Bash: median 1.75 s**. It is bimodal (p10 76 ms) under 5-12 concurrent helpers; the git-guard
    PreToolUse hook itself costs about 30 ms.
- **What this means**: per call, both approaches are fast enough that the model's turns dominate. The cost
  difference comes from **how many turns** and **how many tokens of context** each approach needs, not from
  tool latency.
- **Tool mix**: the G arm used Bash for 166 of 175 text calls (grep/sed) and the Grep tool once. Using
  Grep/Read instead of Bash would avoid the Bash overhead.

## Failure modes observed (with examples)

### Serena

1. **0-based leakage** despite the explicit reminder in every Serena prompt (the S prompt says "Serena line
   numbers are 0-BASED, so add 1"):
   - T05 S rep 2 reported `tools/verify.mjs:220`, `tools/lock.mjs:73`, and `tests/unit/lock.test.mjs:156` and
     `:175`. All four are off by one; score 0.2. The one correct line (`vendor-shim…:18`) came from grep.
   - T04 SO's first JSON had 15 of 19 lines off by one. The agent caught it and corrected it in a second block.
   - T12 SO gave the setter line as 13217 instead of 13218.
   - In several reports ranges were quoted 0-based as "1-based", e.g. "fD spans 3989-4404 (Serena
     body_location, 1-based)".
   - The snippets in `find_referencing_symbols` output (`>10945:`) are 0-based too, which one agent took for
     1-based.
2. **Wrong symbol for a short name**:
   - `find_symbol AE/a` and its references resolve to the component-level array `a` (line 3046), not the
     effect-local rAF function `a` at 3106 that the question was about (T11, in both S and SO runs).
   - The right name path is `AE/ne() callback/a`, and nothing told the agent that. Both runs recovered by
     reading lines 3100-3155.
3. **Name-path discovery is the bottleneck**:
   - `get_symbols_overview` of the bundle returns 11.5k chars of top-level names only.
   - T17 SO concluded "Serena does not track local `let` variables in arrow callbacks". That is false:
     `find_referencing_symbols uM/ne() callback/e` returns exactly the 5 right references. The agent just
     could not find that name path.
4. **Blind spots**:
   - T09 SO found no CSS at all: `find_symbol` over `assets/` returns `[]`.
   - T06 SO found `--morph` (a quoted object key is indexed as a symbol) but missed both
     `setProperty('--exit-opacity', …)` writes.
   - T15 SO found every `innerHeight` line only by stepping `find_declaration` regex error messages through the
     file: 41 calls, 1.1M tokens, 98 s.
   - T16 SO had to read `fix.mjs` to see that `ab` spawns `verify.mjs`. No reference connects them.
   - References to `acquire` (T05) report the binding `const { acquire } = await import(…)` (vendor-shim line
     13), not the call on line 18.
   - `var { onMount: ze } = s` in `CzkAa0og.js:540` was found only by grepping for "onMount" (S runs, one G
     run), never by references.
5. **Cost on common helpers**: `find_referencing_symbols` on a hot runtime export can take 33 s and return
   109 KB. The helpers avoided it; the server is shared and serial, so one such call blocks every agent.

### Text search

- No scored errors in 35 valid runs. The costs showed up in turns instead:
  - T03: grep runs took 47-58 s and 7-8 calls to prove scope boundaries of 8 call sites.
  - T04 (aliased runtime export `Ra` imported as `ne`/`a`/`ie`): 14-18 calls and 83-104 s. It needed the
    export map, per-file aliases, and manual exclusion of 5 shadowing `ne` locals. Serena-assisted runs cost
    the same (15-24 calls, 101-109 s), because they verified by grep anyway.
- The grep traps built into the tasks did not catch Sonnet:
  - bare `innerHeight` without `window.` (T15);
  - `transition:` values spread over several lines (T10);
  - `--morph-fade` next to `--morph` (T06);
  - `tryAcquire` and CLI-string `'acquire'` (T05);
  - 117 lines of `e` in `uM` (T17).
  Every run handled them by reading the enclosing block.

### Harness (neither arm)

- 3 G runs of T01 (the shortest task) ended with a `SubagentHandback` of the literal text "placeholder" and no
  answer. They were marked invalid and excluded, and the T01 G cell has n = 1. One S run ended without the JSON
  block; its prose answer was transcribed (`data/manual-answers.json`).

## Decision rule for fix agents

1. **Default to text search**, via the Grep tool or `fix.mjs grep`, then Read or `fix.mjs show` on the
   enclosing block. This covers:
   - strings, custom properties, class names;
   - CSS;
   - "every line that X";
   - reading or understanding a function body;
   - tooling and process flow;
   - disambiguating a shadowed short name, by reading the enclosing `ne(() => …)` block, usually under 100
     lines.
   - Prefer the Grep/Read tools over Bash `grep`/`sed` (per-call Bash overhead).
2. **Use Serena when the question is "all references to this named symbol"**, and you know or can get its full
   name path (e.g. `dE`, `$T`, `uM/ne() callback/e`, `acquire` in `tools/lib/lock.mjs`). It returns the
   enclosing name path for every hit, which saves the scope-boundary reading.
   - Convert every line +1.
   - Confirm with a grep or Read before you rely on a line.
   - For a short name, pass the full path (`AE/ne() callback/a`, not `AE/a`); if the result looks like a
     different symbol, it is one.
3. **Never use Serena alone**:
   - It cannot see CSS, string arguments, namespace-destructured references or cross-process calls.
   - Do not run `find_referencing_symbols` on tiny runtime helpers (`Ln`, `z`, `s`, `e`): 30 s+ on a shared,
     serial server.
4. **Memories are the real shortcut** for known hot spots. `hot_code_map` and `fixes/TOPICS.md` already hold
   the answers to T01, T03 and parts of T02, T07, T08 and T13. They are plain files, so read them with either
   tool.

## Proposed doc changes (not applied)

**CLAUDE.md**, section "Serena (code navigation, read-only)": add after the first paragraph:

> Serena is optional. A benchmark (`research/code-navigation-benchmark/`) found text search (Grep/Read,
> `fix.mjs grep|show`) as accurate and cheaper on this prettified bundle for most fix-agent questions. Use
> Serena for "all references to a named symbol" (it returns the enclosing name path of each hit), with full
> name paths for short names (`AE/ne() callback/a`, not `AE/a`). Always add 1 to its lines (its snippets are
> 0-based too) and confirm with a Read. Serena cannot see CSS, strings (`setProperty('--x')`), child processes
> or namespace-destructured imports; use grep for those.

**fixes/AGENT_ROLES.md** "Serena (optional, read-only)", replace the "When it helps" bullet with:

> - **When it helps:** `find_referencing_symbols` on a named function or variable (`dE`, `$T`, `acquire`) with
>   the full name path, to get every call site with its enclosing function. **When it doesn't:** strings,
>   custom properties, CSS, "every line that…", reading a function body, tooling flow: use `fix.mjs grep/show`
>   or the Grep/Read tools. Don't run `find_referencing_symbols` on tiny runtime helpers (30 s+ on the shared
>   server).

**`.serena/memories/serena_usage.md`**: add:

> - Line numbers: `body_location` AND the `NNNN:` prefixes in `content_around_reference` are 0-based. The most
>   common Serena error in the benchmark was reporting them unconverted.
> - Locals inside `ne(() => …)` blocks are indexed as `<Component>/ne() callback/<name>`; `find_symbol
>   <Component>/<name>` finds the component-level symbol of the same name instead.
> - `get_symbols_overview` on `nodes/2.DyWL8TcE.js` is ~11.5k chars of top-level names without ranges: prefer
>   `find_symbol` with a name path, or `hot_code_map`.

## Limits of this study

- **Ceiling effect**: questions name the symbols and the code is prettified, so a strong model reading 50-400
  line blocks rarely errs. Results may differ on unprettified code, with weaker models (haiku), or for open
  discovery ("find everything that could force layout") across many files.
- **Wall times**: measured with 5-12 concurrent helpers sharing one machine and one serial Serena server, so
  they are indicative only. Token counts include cache reads, which dominate the totals; compare the peak
  context and output columns too.
- **Arm S measures the advice "Serena first", not Serena**: 13 of 36 S runs used no Serena. Arm SO isolates
  the tool itself.
- **Sample size**: 2 reps per G/S cell and 1 per SO cell. Differences of one run are not significant; the
  qualitative failure modes are the stronger evidence.

## Reproduce

```sh
export NAV_BENCH_TS=/path/to/node_modules/typescript     # only for tools/gt.mjs (ground truth)
node tools/gt.mjs refs site-pretty/_app/immutable/nodes/2.DyWL8TcE.js 2749 dE   # run in the main checkout
node tools/prompt.mjs T03 S                                # exact helper prompt for task x arm
# spawn helpers (model sonnet), append "task arm rep agentId" to data/runs-index.tsv, then:
NAV_BENCH_TASKS=<dir with <agentId>.output transcripts> node tools/score.mjs --write > data/score-table.tsv
node tools/summarize.mjs > data/summary.txt
node tools/serena-log.mjs ~/.serena/logs/<date>/mcp_<id>.txt --since HH:MM --json data/serena-server-calls.json
```
