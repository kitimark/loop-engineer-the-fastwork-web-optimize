# Code navigation for fix agents: text search vs Serena

Question from the user: **"which one is better?"** Plain text search (Grep/Glob/Read, `node tools/fix.mjs
grep|show`) or the read-only Serena symbol tools (`find_symbol`, `find_referencing_symbols`,
`get_symbols_overview`, `find_declaration`, ...)? Answered with data, per task type.

## Headline

**Accuracy is not what separates them.** 133 Sonnet helper runs on 27 navigation questions. 18 questions were
synthetic, built with traps for grep; 9 were real questions collected from the wave-1 fix owners.

| arm | valid runs | mean score | perfect | calls | median wall | median tokens | peak context |
|---|---|---|---|---|---|---|---|
| G, text search only | 53 | 0.99 | 51 | 5.3 | 23.7 s | 170k | 37k |
| S, "Serena-first" | 54 | 0.99 | 53 | 5.4 | 23.1 s | 202k | 41k |
| SO, Serena only (+Read) | 22 | 0.92 | 19 | 9.8 | 23.5 s | 232k | 43k |

What the table means:

- **Text search is the default.** It was as accurate as Serena-first and cheaper on 20 of 27 tasks, at
  median 170k vs 202k tokens per run.
- **Agents told to go Serena-first mostly didn't.** Only 32 of 54 S runs made any Serena call, and Serena was
  20 % of that arm's tool calls. The S runs that skipped Serena scored 1.00 and were cheaper.
- **The imperfect runs**:
  - G's 2 were one line off the end of a range (T19).
  - S's 1 was 0-based line numbers leaking into the answer (T05: 4 of 5 lines one too low).
  - SO's 3 were Serena blind spots (CSS, string arguments) and one 0-based slip.

**Where Serena earns its cost** (small but real):

1. Resolving what a short name or import alias really is, from its call site, in one `find_declaration`
   call:
   - `S` at nodes/2:3860 is `$i` in `chunks/BSBv9QXB.js`;
   - `z` is `F`;
   - `ce` at 10929 is `uM/ce`, not `hD/ce`.
   Two fix owners named this as their slowest grep step (import line, then export list, then definition). Its
   ranges were exact, where two grep runs cut a range one line short.
2. "All references to this named symbol" when you have the full name path (`dE`, `$T`, `mM/y`, `AE/c`,
   `uM/ne() callback/e`). It returns every hit with its enclosing name path, which saves the scope-boundary
   reading. Callers of `dE`: Serena-assisted runs took 15-37 s, grep runs 47-58 s.

**Where it is useless or harmful**:

- Useless: CSS, strings and custom properties (`setProperty('--x')`), "every line containing X", child
  processes (`fix.mjs ab` spawning `verify.mjs`), and namespace-destructured imports. A Serena-only run needed
  41 calls, 98 s and 1.1M tokens to list `innerHeight` lines that grep finds in 1 call.
- Harmful: its **0-based line numbers** leak into answers. Short name paths (`AE/a`) silently resolve to a
  different symbol than intended. On hot runtime helpers, `find_referencing_symbols` costs 30 s+ on the
  shared, serial server.

## Follow-up study: the open questions (64 more runs, batches b1-b7)

Run by an orchestrator that planned 8 batches (specs in `batches/`); flat batch agents spawned the helpers and
recorded agent ids; all scoring came from `tools/score.mjs`. 197 runs in total, 4 invalid (same four).
Everything else in this README is the first 133 runs; this section adds 64 (44 sonnet, 20 haiku). New tasks T28-T36 have ground truth in `tasks.json`; new
arms are in `tools/prompt.mjs`; paired tables come from `tools/compare.mjs`.

| question (batch) | design | result |
|---|---|---|
| Does the written decision rule match text search? (b1) | arm **GR** (text first, Serena only for alias and named-symbol references) on T03 T04 T12 T19 T21 T24 T25, n=7, sonnet | GR 1.00 (7/7), 7.3 calls, 212k tokens. G on the same tasks 0.98 (12/14), 7.9 calls, 240k; S 1.00 (14/14), 8.0 calls, 237k. **GR made 0 Serena calls in 7 runs**, even on the two alias tasks (T19, T24) where the rule says to. It solved them with grep (G lost 2 of 4 T19/T24 reps on a range end). So GR = G, a touch cheaper. |
| Weaker model (b2, b7) | **haiku**, G vs S, T04 T11 T17 T19 T24 n=1 each, T04 +2 reps, T28-T30 n=1 each (20 runs) | G-haiku 0.89 (6/10), S-haiku 0.77 (6/10). Both cost ~10x a sonnet run (28 calls, 1.1-1.3M tokens, 100-130 s). All of the gap is T04 (aliased runtime export across 5 files): G-haiku 0.95 / 0.00 / 0.95, S-haiku 0.00 / 0.92 / 0.10. The two 0.00 runs returned `uses: []` after 20 calls. S-haiku used Serena in 6 of 10 runs, median 2-4 calls, and did not recover T04. On the other 7 tasks both arms are 0.97-1.00 except T28 S-haiku (0.67). **No evidence that Serena helps a weaker model**; if anything it adds calls. |
| Unprettified `site/` (b3) | 3 name-only tasks (T34 callers of `dE`, T35 spring params/names, T36 delegated handler) on the 366 KB one-line bundle; G (GU) vs Serena-first (SU), sonnet | both 1.00 (3/3). GU 3.3 calls, 108k tokens, 19 s. SU 4 calls, 184k, 31 s. **Serena cannot navigate `site/`**: `.serena/project.yml` ignores it and `find_symbol` returns "Explicitly requested symbols in 'site/...' while the path is ignored" (2 of 3 SU runs hit that error, then fell back to grep -o). Grep handled the single line without trouble. |
| Open-ended discovery, no names given (b4) | T28 self-rescheduling rAF loops (8), T29 classify the 8 scroll-engine callbacks, T30 census of 11 IntersectionObservers; G / GR / S, sonnet | all 1.00 (9/9). G 6.3 calls, 186k tokens; GR 6.7 calls, 228k; S 9 calls, 284k (Serena in 2 of 3 runs, 1 call each). Text search is enough and cheapest even when no symbol is named. |
| Do the project notes shortcut both arms? (b5, b5b) | `hot_code_map` + `fixes/TOPICS.md` offered (GM/SM) and then required as the first read (GN/SN), on T01 T03 T07 T13, sonnet | **Offered: 0 of 8 helpers read them** (arms GM/SM are effectively G/S). **Required: all 8 read them, and it did not help**: GN 5.3 calls / 176k tokens vs G 5.0 / 183k; SN 6.5 calls / 237k vs S 5.0 / 185k. Helpers still verified by grep, so the notes cost one or two extra calls. All 1.00 (one SN run emitted an unfenced JSON object; transcribed, see `manual-answers.json`). |
| Overlay copy paths (b6) | T31 callers, T32 definition ranges, T33 writers of a custom property, asked about a stable overlay copy (`.claude/worktrees/nav-bench/fixes/nb-overlay/overlay/...`, 12 lines inserted, one component added); G vs S | both 1.00 (3/3), no wrong-root or baseline-line answers. G 3.3 calls, 131k tokens; S 5.7 calls, 224k (Serena in 2 of 3). Serena does index a new overlay directory on the first call with the worktree-relative path, so the wrong-path risk did not show. |

Reading of the follow-up:

- **Ceiling again on sonnet**: all 44 new sonnet runs scored 1.00 (one after transcribing an unfenced JSON answer) across policy, minified, open-ended, notes and
  overlay conditions. Nothing in these conditions separates the arms on accuracy. Text search is cheaper or equal
  in every paired cell except b1 (GR 212k vs G 240k, not significant).
- **Compliance is the main finding for the policy arms**: told "text first, Serena for these two cases" (GR),
  sonnet never called Serena. Told "Serena first" (S), it called Serena in 60 % of runs, at about 1 call per run.
- **The only real divergence is haiku on T04**, and there Serena did not rescue it. 2-3 reps per cell, so treat it
  as "no sign Serena helps", not as "Serena hurts".
- **Serena is off for `site/`** (and for CSS, `research/**/data`): fix agents must work on `site-pretty/` or an
  overlay, which they already do.

## Setup

- **Code**:
  - `site-pretty/_app/immutable/nodes/2.DyWL8TcE.js` (13,510 lines, 1-3 letter names);
  - the Svelte runtime `chunks/BSBv9QXB.js` and the other chunks and entry files;
  - `assets/*.css`;
  - the repo's `tools/` and `tests/` on main `49d337b`..`413a293` (tool lines re-checked unchanged).
- **Arms**: the same prompt except one TOOLS paragraph (`tools/prompt.mjs` prints the exact prompts).
  - **G**: text tools only; Serena forbidden.
  - **S**: use Serena symbol tools first, text tools for what Serena can't do. The prompt includes the
    reminder "Serena lines are 0-BASED, add 1".
  - **SO**: Serena only, plus Read on ranges located with Serena.
- **Helpers**: `general-purpose` subagents on **model sonnet**, in the background, 5-12 at a time.
  - Read-only. They could not use research/, fixes/, `.serena/memories/` or README files (those contain
    answers and are equally readable by both arms).
  - Each helper answers one question and ends with a JSON block, scored automatically by `tools/score.mjs`.
  - G and S ran twice per task (order reversed between reps); SO ran once on 22 tasks.
- **Tasks** (`tasks.json`):
  - T01-T18 are synthetic and cover 9 types, with grep traps:
    - short names repeated 100+ times; shadowed locals (`e` on 117 lines of `uM`);
    - an aliased runtime export (`Ra` imported as `ne`/`a`/`ie`); bare `innerHeight`;
    - multi-line `transition:` values; `--morph-fade` next to `--morph`;
    - `tryAcquire` next to `acquire`; CLI-string `'acquire'`.
  - T19-T27 are the fix owners' own questions:
    - resolve `S`/`z` aliases; who mounts `cD`;
    - who toggles `.start-selling-future.is-visible`; is a CSS class dead;
    - which element `AE`'s `c`/`u` hold; which `ce` a call resolves to;
    - which `@media` encloses a CSS line; who writes `.fee-progress` width.
- **Ground truth**: grep plus the TypeScript compiler (`tools/gt.mjs`: enclosing function chains,
  language-service references), then checked by reading the code. One reference the TypeScript-based ground
  truth missed (`CzkAa0og.js:540`, a namespace destructure of `onMount`) was found by grep runs and is scored
  neutral.
- **Scoring**:
  - List answers: F1 of line-level precision and recall. A wrong enclosing function or local name gets half
    credit.
  - Location answers: exact 1-based lines.
  - `offByOne`: answered lines equal to a ground-truth line minus 1.
- **Metrics per run** come from the helper transcripts (`tools/transcript.mjs`): calls, wall time, total
  tokens (including cache reads, which dominate), and peak context. Serena server-side latency comes from its
  MCP log (`tools/serena-log.mjs`).
- **Invalid runs**: 4 of 133, all excluded. They were G runs on the two shortest tasks (T01 3x, T20 1x) that
  ended with a hand-back of the literal text "placeholder" and no answer. That is a harness quirk, not
  navigation. The T20 run was repeated; T01 G has n = 1.

## Results by task type

Each cell: mean score, (perfect/n), mean tool calls, median wall time, median total tokens.

| type (tasks) | G text | S Serena-first | SO Serena-only |
|---|---|---|---|
| A locate a definition by name or behaviour (T01 T02 T13) | 1.00 (5/5) 3.4c 18.5s 136k | 1.00 (6/6) 5.3c 17.1s 179k | 1.00 (3/3) 7c 23.5s 263k |
| B callers / references of a named symbol (T03 T05 T14 T20) | 1.00 (8/8) 4.8c 21s 181k | 0.90 (7/8) 4.6c 17.3s 181k | 1.00 (3/3) 8.3c 22.5s 220k |
| C cross-file refs through bundle import aliases (T04) | 1.00 (2/2) 16c 93s 629k | 1.00 (2/2) 19.5c 105s 767k | 1.00 (1/1) 28c 100s 715k |
| J resolve an import alias to its runtime definition (T19 T24, owner questions) | 0.92 (2/4) 7.5c 28s 255k | 1.00 (4/4) 7.8c 33.5s 317k | 1.00 (2/2) 10.5c 32.6s 443k |
| D disambiguate short / shadowed names and bindings (T11 T12 T17 T18 T23 T25) | 1.00 (12/12) 4.2c 19.8s 132k | 1.00 (12/12) 3.8c 18.5s 146k | 0.97 (5/6) 5c 19.9s 200k |
| E call-graph-scoped API use, read a function body (T07 T08) | 1.00 (4/4) 4.5c 30.4s 162k | 1.00 (4/4) 3.8c 35.5s 195k | 1.00 (2/2) 3.5c 35s 261k |
| K who writes a class / inline style / state (T21 T27, owner questions) | 1.00 (4/4) 7c 29.8s 211k | 1.00 (4/4) 6c 28.1s 229k | 1.00 (1/1) 6c 18.2s 225k |
| F strings, custom properties, class usage (T06 T22) | 1.00 (4/4) 8c 46s 307k | 1.00 (4/4) 7c 38.3s 290k | 0.50 (0/1) 18c 53s 481k |
| G CSS rules, width animations, @media context (T09 T10 T26) | 1.00 (6/6) 3.3c 22.1s 134k | 1.00 (6/6) 3c 18.8s 116k | 0.00 (0/1) 5c 18.9s 213k |
| H text census, every line containing X (T15) | 1.00 (2/2) 3c 18s 130k | 1.00 (2/2) 4.5c 22s 202k | 1.00 (1/1) 41c 98s 1111k |
| I tooling control flow across processes (T16) | 1.00 (2/2) 4.5c 27s 161k | 1.00 (2/2) 7c 24s 261k | 1.00 (1/1) 13c 31s 406k |

- **Where the per-task and per-run data are**: `data/summary.txt` and `data/summary.json` for each task;
  `data/runs.json` and `data/score-table.tsv` for each run. `runs.json` keeps answers as names and line
  numbers only, with prose and tool arguments dropped (Hard rule 3).
- **Synthetic vs owner questions**:

  | questions | G | S | SO |
  |---|---|---|---|
  | synthetic | 1.00 (35/35) | 0.98 (35/36) | 0.90 (14/17) |
  | owner | 0.98 (16/18) | 1.00 (18/18) | 1.00 (5/5) |

  The owners' questions lean toward alias and binding resolution, where Serena's `find_declaration` is exact.
  Even there it did not cut calls or time: runs verified by Read or grep anyway, e.g. 7.8 calls and 33.5 s
  (S) vs 7.5 calls and 28 s (G) on type J.

### Raw per-call cost

| operation | text | Serena, server-side (from its log) |
|---|---|---|
| find a definition | `grep -n '^function dE'`: 12 ms, 29 chars | `find_symbol`: median 18 ms, p90 38 ms (87 calls) |
| resolve an alias from a call site | 3 greps (import line, export list, definition): about 35 ms plus 3 model turns | `find_declaration`: median 113 ms, 170-280 chars (13 successful calls) |
| references of a function | `grep -nw dE`: 11 ms, 525 chars | `find_referencing_symbols`: median 0.2 s, p90 0.6 s, max 1.4 s (27 calls); **33 s / 109 KB** for a hot runtime helper (`Ln`, earlier session) |
| file outline | `grep -n '^function '`: 12 ms, 2.7k chars | `get_symbols_overview`: 10 ms, but **11.5k chars** for `2.DyWL8TcE.js` (top-level names only, no ranges) |
| read a 367-line component | `sed -n`: 11 ms, 10.6k chars | `find_symbol include_body`: refused past the default size ("answer too long") unless `max_answer_chars` is raised |
| `fix.mjs grep` / `show` | 62 ms / 55 ms | - |

- **Agent-side latency** (tool_use to tool_result, with harness overhead and 5-12 concurrent helpers):
  - Serena: 85-215 ms median.
  - Read: 15 ms.
  - Grep tool: 2 ms.
  - Bash: median 1.8 s. It is bimodal, p10 about 70 ms; the git-guard PreToolUse hook itself costs about 30 ms.
- **Tool mix**: helpers in the G arm used Bash grep/sed for about 90 % of their calls. The Grep and Read
  tools avoid the Bash overhead.
- **What this means**: per call, both approaches are fast enough that model turns dominate the cost.

## Failure modes observed

### Serena

1. **0-based leakage**, despite the prompt reminder:
   - T05 S rep 2 reported `verify.mjs:220`, `lock.mjs:73` and `lock.test.mjs:156`/`:175`, all one too low
     (score 0.2).
   - T04 SO's first answer had 15 of 19 lines one too low; the agent corrected it.
   - T12 SO gave setter line 13217 instead of 13218.
   - Several reports quoted Serena's 0-based ranges as "1-based".
   - The `NNNN:` prefixes in `find_referencing_symbols` snippets are 0-based too.
2. **Wrong symbol for a short name path**:
   - `find_symbol AE/a` resolves to the component-level array `a` (3046), not the effect-local rAF function
     at 3106. The right path is `AE/ne() callback/a`. Hit in 2 runs, both recovered by reading.
   - `find_symbol uM/r` hits `uM`'s parameter, not the eased scale at 10920 (`uM/ne() callback/r`).
3. **Name-path discovery is the bottleneck**:
   - `get_symbols_overview` gives 11.5k chars of top-level names without ranges.
   - T17 SO concluded "Serena does not track local `let` variables in arrow callbacks". That is false:
     `find_referencing_symbols uM/ne() callback/e` returns exactly the right 5 lines. The agent could not find
     the name path.
4. **Blind spots**:
   - CSS (T09 SO: nothing).
   - `setProperty` string arguments (T06 SO missed `--exit-opacity`, but found `"--morph"`, a quoted object
     key that is indexed as a symbol).
   - Census questions (T15 SO: 41 calls).
   - Child processes (T16).
   - `var { onMount: ze } = s` (T04: found only by grepping "onMount").
   - References to an `acquire` bound by `const { acquire } = await import(…)`: Serena reports the binding
     line, not the call.
5. **Cost**: hot-helper references take 30 s+, and the server is shared and serial, so one such call blocks
   every agent.
6. **Compliance**: Sonnet often decides grep plus Read is simpler and skips Serena even when told to use it
   first (22 of 54 S runs).

### Text search

- 2 imperfect runs out of 53, both the end line of `$i`'s range one short (2869 instead of 2870).
- Its costs are turns, not errors:
  - Callers of `dE` (T03): 7-8 calls and 47-58 s proving scope boundaries.
  - The aliased runtime export (T04): 14-18 calls and 83-104 s mapping export aliases per file and excluding
    5 shadowing `ne` locals. Serena-first cost the same there (15-24 calls, 101-109 s) because it also
    verified by grep.
  - Import alias to definition: 3 hops, per the owners.
- Tooling gaps the owners hit, which neither tool covers. Two read-only helpers added here:
  - CSS line to its selector and `@media` chain: `tools/css-context.mjs`.
  - Minified char offset (as quoted in research traces) to prettified line: `tools/off2line.mjs`. For example,
    `iE` @75155 maps to 2671.

## Decision rule for fix agents

1. **Default: text search.** Use the Grep tool or `fix.mjs grep`, then Read or `fix.mjs show` on the
   enclosing block. This covers:
   - strings, custom properties, class names (dead-CSS checks);
   - CSS (plus `research/code-navigation-benchmark/tools/css-context.mjs` for selector and @media context);
   - "every line that X";
   - reading a function body; "who writes this class, style or state";
   - tooling and process flow;
   - shadowed short names: read the enclosing `ne(() => …)` block, usually under 100 lines.
   - Prefer the Grep/Read tools over Bash `grep`/`sed`.
2. **Use Serena for two things**, then convert +1 and Read the lines before you rely on them:
   - **"What is this name / alias, really?"**: `find_declaration` with `relative_path` set to the file of
     the call site and a regex capturing the name at the call, e.g. `o = (S)\(i, `. It resolves import aliases
     into `chunks/BSBv9QXB.js` and scoped duplicates (`ce`) in one call.
   - **"All references to this named symbol"**: `find_referencing_symbols` with the full name path (`dE`,
     `$T`, `mM/y`, `AE/c`, `uM/ne() callback/e`). Locals inside effects are `<Component>/ne() callback/<name>`.
     A short path like `AE/a` may be a different symbol.
3. **Never use Serena alone, and never for**:
   - CSS, string literals, census questions, cross-process flow, namespace-destructured imports;
   - `find_referencing_symbols` on tiny runtime helpers (`Ln`, `z`, `s`, `e`, `ne`): 30 s+ on a shared,
     serial server.
4. **`hot_code_map` / `fixes/TOPICS.md` are for orientation, not a shortcut.** Follow-up b5b: when the notes were
   required reading they did not cut calls or tokens (helpers verified by grep anyway). Offered but not required,
   no helper read them. Read them when you do not know which component you need; do not expect them to replace
   the verification read.
5. **Weaker models (haiku) get no extra benefit from Serena** in the follow-up (n=20): same text-search default.
6. **`site/` (the minified original) is invisible to Serena** by config: navigate `site-pretty/` or your overlay.
   Overlay copies are indexed; use the worktree-relative path
   `.claude/worktrees/<wt>/fixes/<topic>/overlay/_app/immutable/...`.
7. **Final decision rule after the follow-up: unchanged.** Rules 1-3 stand; no batch moved them, so the study stops.

## Proposed doc wording (not applied)

**CLAUDE.md**, section "Serena (code navigation, read-only)": insert after the first paragraph:

> **When to use it** (benchmark: `research/code-navigation-benchmark/`): text search (Grep/Read,
> `fix.mjs grep|show`) is as accurate and cheaper for most questions on the prettified bundle and is the
> default. Serena earns its cost for two things:
> - `find_declaration` on a call site, to resolve what a short name or import alias really is (`S` →
>   `$i` in `chunks/BSBv9QXB.js`);
> - `find_referencing_symbols` with a full name path for "all references to X".
>
> It cannot see CSS, string arguments (`setProperty('--x')`), child processes or namespace-destructured
> imports. Its line numbers, including the `NNNN:` snippet prefixes, are 0-based: add 1 and Read the lines
> before relying on them (the most common error in the benchmark).

and change the bullet "Minified names repeat: …" to:

> - Minified names repeat: always pass `relative_path` and full name paths. Locals inside effects are
>   `<Component>/ne() callback/<name>`. `AE/a` finds the component-level `a`, not the effect's `a`. Never run
>   `find_referencing_symbols` on tiny runtime helpers (`Ln`, `z`, `s`): 30 s+ on the shared, serial server.

Add one more bullet to the same CLAUDE.md block (follow-up findings):

> - Serena does not index `site/` (ignored in `.serena/project.yml`); use `site-pretty/` or your overlay
>   (`.claude/worktrees/<wt>/fixes/<topic>/overlay/...`, relative to the main checkout). Haiku helpers did not
>   benefit from Serena either; `hot_code_map` orients, it does not replace the verifying read.

**`.serena/memories/serena_usage.md`**: append:

> - When to use Serena: `find_declaration` (regex on a call site) to resolve import aliases and duplicated
>   short names, and `find_referencing_symbols` with a full name path. Use grep/Read for everything else (CSS,
>   strings, census, reading bodies). Benchmark: research/code-navigation-benchmark/.
> - Line numbers: `body_location` AND the `NNNN:` prefixes in `content_around_reference` are 0-based.
> - Locals inside `ne(() => …)` blocks are `<Component>/ne() callback/<name>`; `find_symbol <Component>/<name>`
>   returns the component-level symbol of that name instead.
> - `get_symbols_overview` on `nodes/2.DyWL8TcE.js` is about 11.5k chars of top-level names without ranges.
>   Prefer `find_symbol` with a name path, or `hot_code_map`.

**fixes/AGENT_ROLES.md** "Serena (optional, read-only)", "When it helps" bullet:

> - **When it helps:** `find_declaration` on a call site (resolve `S`/`z`/`ce`-style aliases in one call) and
>   `find_referencing_symbols` with a full name path (every hit with its enclosing function). **When it
>   doesn't:** CSS, strings, custom properties, "every line that…", reading a function body, tooling flow: use
>   `fix.mjs grep/show` or the Grep/Read tools.

## Limits of this study

- **Ceiling effect**: questions name the symbols and the code is prettified, so a strong model reading blocks
  of 50-400 lines rarely errs. The follow-up tested the three suggested escapes (haiku, unprettified `site/`,
  open-ended discovery): sonnet stayed at the ceiling in all of them and haiku did not improve with Serena.
  Not tested: a much larger or unfamiliar codebase, where name-path navigation might matter more.
- **Wall times**: measured with 5-12 concurrent helpers sharing one machine and one Serena server, so they
  are indicative only. Total tokens are dominated by cache reads; also compare peak context and output.
- **Arm S measures the advice "Serena first"**, not Serena itself. Arm SO isolates the tool.
- **Sample size**: 2 reps per G/S cell and 1 per SO cell; the follow-up cells are n=1-3 (haiku T04 n=3). One-run
  differences are not significant; the failure modes are the stronger evidence.
- **New arms GR/GN/SN** reflect one wording of the rule/notes prompt; other wordings could change compliance.

## Files and reproduction

- `tasks.json`: 36 questions (T28-T36 are the follow-up tasks), answer schemas, ground truth and traps.
- `data/`:
  - `runs-index.tsv`: task, arm, rep, agent id, invalid flag.
  - `raw/<agentId>.json`: one sanitised record per run (metrics, tool calls, answer, stored score).
    Re-scoring works from these alone.
  - `runs.json`, `score-table.tsv`, `summary.json`/`.txt`, `agent-call-stats.json`,
    `serena-server-calls.json`, `manual-answers.json`.
- `batches/*.md`: the batch specs the follow-up used (one per batch, self-contained).
- `HANDOFF.md`: how to continue (task schema, one-run protocol, scoring, open batches, pitfalls).
- `tools/`:
  - Benchmark harness: `prompt.mjs`, `transcript.mjs`, `score.mjs`, `summarize.mjs`, `compare.mjs` (paired arm tables), `serena-log.mjs`,
    `gt.mjs` (needs `NAV_BENCH_TS=/path/to/typescript`).
  - Helpers for fix agents: `css-context.mjs`, `off2line.mjs` (run in the main checkout, or set
    `FW_MIRROR_HOME`).

```sh
node research/code-navigation-benchmark/tools/prompt.mjs T03 S          # exact helper prompt
# spawn helpers (model sonnet), append "task arm rep agentId" to data/runs-index.tsv, then:
# transcripts: ~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl (omit the variable to re-score from data/raw)
NAV_BENCH_TASKS=~/.claude/projects/<project>/<session>/subagents node research/code-navigation-benchmark/tools/score.mjs --write
node research/code-navigation-benchmark/tools/summarize.mjs
node research/code-navigation-benchmark/tools/css-context.mjs site-pretty/_app/immutable/assets/2.gBuqKVzi.css 5700
node research/code-navigation-benchmark/tools/off2line.mjs _app/immutable/nodes/2.DyWL8TcE.js 75155
```
