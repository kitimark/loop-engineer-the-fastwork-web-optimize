# Tools refactor: readable tools that cost fewer tokens to understand

Author: `arch-refactor` (architecture team, read-only), 2026-10-01, on main `e99bcc5` (tools unchanged
through `7d86d96`). User request: "refactor the tools to be more readable, following refactoring.guru, so
whoever has to touch them needs fewer tokens to understand them."

This is a plan only. It changes no code. Each package below is sized for one `toolsmith`, is one commit
series, is behaviour-preserving, and keeps `npm test` green.

## TL;DR

- **Metric: read cost.** Read cost is the number of tokens an agent must pull into its context to answer
  a fixed set of 12 standard questions about the tools (§2). There are three layers:
  - M1: measured on helper transcripts, reusing `research/code-navigation-benchmark/`.
  - M2: a deterministic "locate cost", the tokens of the files that hold each answer.
  - M3: cheap static proxies (script in Appendix A).
- **Baseline (estimates):**
  - M2 is about **82k tokens** over the 12 questions. The target is **about 28k (-65 %)**, plus a
    1.5k-token map that is read once.
  - M1: the only measured tool questions so far are benchmark T05/T16. They added about 8-13k tokens of
    tool output per question, and each helper run cost 143-184k total tokens (sonnet, text search).
  - M3: the tools are 19 files, about 60k tokens. They contain 14 functions longer than 40 lines,
    147 lines longer than 160 characters and **8 copies of the argv parser** (9 with `bench.mjs` in
    flight). There is no `tools/README.md`.
- **Why it is expensive today.** The tools are not large. The cost comes from three things:
  - Each answer sits inside a 300-430-line file that mixes 3-5 responsibilities (`fix.mjs`, `serve.mjs`,
    `lib/lock.mjs`, `verify.mjs`).
  - Some code is duplicated with different semantics: there are two `median`s that disagree on even `n`.
  - The exit and signal cleanup is spread over five files.
- **Packages, in order** (§6):
  - **P1** `lib/cli.mjs` and the `tools/README.md` map.
  - **A** incident/finding boards, **B** `serve.mjs`, **C** `iphone.mjs`.
  - **D** lock policy split, **E** `fix.mjs` split, **F** `verify.mjs` pure moves.
  - **G** exit helper, and `measure()` Extract Method under an A/A.
- **Can start now:** P1, then A, B and C in parallel (3 toolsmiths, disjoint files). None of them touch a
  file that ts-i017, ts-prio, ts-bench, ts-i021 or ts-i002 is editing.
- **Must wait:**
  - D waits for ts-i017 and ts-prio.
  - E waits for ts-i017 and ts-prio I-020.
  - F waits for ts-i017 and ts-bench (`cdp.mjs`) and the decision on arch-tools' `verify.mjs` proposal.
  - G goes last, alone.

## 1. Vocabulary (refactoring.guru)

Source: https://refactoring.guru/refactoring (reference site; confidence: "vendor doc"-level reference).

Rules from "How to refactor" (https://refactoring.guru/refactoring/how-to):
- The result must be cleaner.
- Add no new functionality: *"Don't mix refactoring and direct development of new features. Try to
  separate these processes at least within the confines of individual commits."*
- All existing tests must pass. A break means either you made a mistake, or the tests were too low-level.

The overview page adds: *"Performing refactoring step-by-step and running tests after each change are key
elements of refactoring that make it predictable and safe."* "When to refactor"
(https://refactoring.guru/refactoring/when) gives the Rule of Three: *"When you're doing something for the
third time, start refactoring."* The argv parser is at eight copies.

Smells used below:

| smell | page | where it bites here |
|---|---|---|
| Long Method | https://refactoring.guru/smells/long-method ("any method longer than ten lines should make you start asking questions"; "if you feel the need to comment on something inside a method, you should take this code and put it in a new method") | `cmdAb` 83 lines, `measure` 89, `iphone main` 89, `serve handler` 72, `lock main` 77, `diagnose` 98 |
| Large Class (a module here) | https://refactoring.guru/smells/large-class | `fix.mjs`, `serve.mjs`, `lib/lock.mjs` |
| Divergent Change | https://refactoring.guru/smells/divergent-change | `fix.mjs` changes for overlay work, for A/B statistics and for serving |
| Shotgun Surgery | https://refactoring.guru/smells/shotgun-surgery | exit and signal cleanup in 5 files |
| Duplicate Code | https://refactoring.guru/smells/duplicate-code | argv parser ×8, `git()` ×4, JSON I/O ×3, poll loop ×2, `median`/`r1` ×2 (+2 in bench) |
| Switch Statements | https://refactoring.guru/smells/switch-statements | `if (cmd === …)` chains in the `lock`, `incident`, `finding` and `iphone` CLIs |
| Comments | https://refactoring.guru/smells/comments (fine when they explain *why*) | the 40-line lock header is a good "why" but is repeated in 3 places |
| Primitive Obsession | https://refactoring.guru/smells/primitive-obsession | `{__c: c}` body tagging in `serve send()` |
| Long Parameter List | https://refactoring.guru/smells/long-parameter-list | hidden inputs: module-level `argv`/`ON`/`BASE` read inside `fix.mjs` helpers |

Techniques used below (catalog: https://refactoring.guru/refactoring/techniques):

- Extract Method: https://refactoring.guru/extract-method
- Move Method: https://refactoring.guru/move-method
- Extract Class: https://refactoring.guru/extract-class
- Introduce Parameter Object: https://refactoring.guru/introduce-parameter-object
- Decompose Conditional: https://refactoring.guru/decompose-conditional
- Replace Conditional with Polymorphism: https://refactoring.guru/replace-conditional-with-polymorphism. In
  JS it becomes a command or route table.
- Replace Magic Number with Symbolic Constant: https://refactoring.guru/replace-magic-number-with-symbolic-constant
- Consolidate Duplicate Conditional Fragments: https://refactoring.guru/consolidate-duplicate-conditional-fragments
- Replace Parameter with Explicit Methods: https://refactoring.guru/replace-parameter-with-explicit-methods
- Rename Method: https://refactoring.guru/rename-method
- Replace Temp with Query: https://refactoring.guru/replace-temp-with-query

## 2. The metric: read cost

"Fewer tokens to understand" = fewer tokens an agent reads before it can answer a question about a tool
correctly. There are three layers, from truest (and dearest to run) to cheapest.

**M1, empirical (before and after the program, not per package).** Reuse the method of
`research/code-navigation-benchmark/` (tasks + ground truth, `tools/prompt.mjs` arms, `tools/score.mjs`,
`tools/transcript.mjs`):

- The 12 questions of §2.1 go into a `tasks-tools.json`.
- **Arm GT:** text tools only, plus `tools/README.md` and the file headers. Before the map exists, the
  arm is G.
- Model sonnet, n = 2 per question, 24 runs per side.
- **Read tokens per question** = `ctxPeak` - context after the first turn, i.e. the tool output that
  entered the context. Total tokens are dominated by cache reads of the system prompt: in T16 G, 123-158k
  of the 143-178k total was cache reads.
  - `transcript.mjs` gives `ctxPeak` today. It needs a `ctxFirst` field, a small research-only change.
- The run must score 1.0. A cheaper wrong answer counts as a failure.
- Cost is about 24 × 170k ≈ 4M tokens per side. Run it once before P1 and once after F.

Ground truth must name `file + function`, not only lines, because lines move with every package.

**M2, deterministic locate cost (every package, in its README/commit message).** For each question:

- **M2a (answer):** tokens of the minimal line ranges that answer it.
- **M2b (locate):** tokens of the files that hold those ranges. This is what an agent reads when it
  opens the file that grep or the map points to.

Refactoring should leave M2a about flat and cut M2b by moving each answer into a small file named after
it. Tokens are estimated as bytes / 3.6, the same rule for before and after.

**M3, static proxies (Appendix A, about 1 s, no agents).** Per file:
- tokens;
- functions longer than 40 lines;
- lines longer than 160 characters;
- argv parser copies;
- a contract header present (§5.1);
- a row in `tools/README.md`.

M3 is a guard against drift, not the goal.

### 2.1 The standard questions and baseline M2 (estimates, today's lines)

| # | question | answer lives in (1-based) | M2b now | M2b after | package |
|---|---|---|---|---|---|
| Q1 | How does the short lane decide who's next? | `lib/lock.mjs` 23-32, 132-155, 192-206 | 4.6k (`lib/lock.mjs`) | 1.2k (`lib/lock-policy.mjs`) | D |
| Q2 | Where does ab compute the verdict? | `fix.mjs` 294-330 (`METRICS`, `median`, `stats`) | 7.7k (`fix.mjs`) | 1.6k (`lib/ab-stats.mjs`) | E |
| Q3 | What does verify do between phases? | `verify.mjs` 15-22, 104-160 | 5.0k | 5.0k (F: header + phase banners), 2.0k after G | F, G |
| Q4 | What does ab check before measuring? | `fix.mjs` 365-376 | 7.7k | 3.0k (`lib/ab.mjs`) | E |
| Q5 | Which file does serve send for a path (overlay order, vendors)? | `serve.mjs` 21-25, 178-190, 231-241 | 6.6k | 1.2k (`lib/serve-files.mjs`) | B |
| Q6 | What releases the lock and kills children on SIGTERM? | `lib/lock.mjs` 263-279, `lock.mjs` 131-149, `fix.mjs` 356-362, `cdp.mjs` 53-56, `serve.mjs` 355-366 | 24.1k (5 files) | about 1.5k (`lib/exit.mjs` + 5 call lines) | G |
| Q7 | How does incident dedup work? (control) | `lib/incident.mjs` 10-12, 41-60, 109-123 | 3.3k | 3.3k | none |
| Q8 | Which `lock.mjs` flags take a value; how is `--` handled? | `lock.mjs` 43-54 | 3.2k | 0.8k (`lib/cli.mjs` + a spec line) | P1, D |
| Q9 | How does FW_LOCK_HELD re-entry work? | `lib/lock.mjs` 34-40, 62-72, 182-185, 253-262; `lock.mjs` 22-25, 133 | 7.7k | about 4.5k | D |
| Q10 | What phases does `iphone.mjs scroll` record? | `iphone.mjs` 13-16, 51-76, 106-139 | 3.2k | 1.2k (`lib/iphone-probe.mjs`) | C |
| Q11 | Where does a worktree find the baseline? (control) | `lib/paths.mjs` 1-9, 51-75 | 1.15k | 1.15k | none |
| Q12 | Where does `results.json regressions.morphReached` come from? | `fix.mjs` 385-411 | 7.7k | 3.0k (`lib/ab.mjs`) | E |
| | **total** | | **about 82k** | **about 28k (+1.5k map, read once)** | |

Q7 and Q11 are controls: those modules are already one responsibility each with a good header. They
should not move, and M1 on them measures the noise.

## 3. Audit (per file: size, responsibilities, top smells)

Sizes are lines / estimated tokens. "Tests" lists what covers the file today.

### Priority files (agents read these most)

**`tools/fix.mjs`, 431 lines / 7.7k tokens.** It has four responsibilities:
- CLI parsing and dispatch;
- overlay workflow (`new`, `edit`, `show`, `grep`, `diff`, `apply`, `combine`);
- `serve`;
- A/B orchestration and statistics.

Tests: `e2e/fix.test.mjs`, `e2e/ab-fake.test.mjs`, `chrome/fix-ab`.

- Divergent Change / Large Class: the four responsibilities above, in one module.
- Long Method: `cmdAb` 339-421 (83 lines) does six things in a row. It prepares, starts two servers
  (353-363), checks what is served (365-376), runs verify (378-383), derives regressions (386-399) and
  assembles and writes the result (400-420).
- Hidden inputs (Long Parameter List in disguise): `underlying()` (54), `cmdDiff` and `applyPatch` read
  the module globals `ON`, `BASE` and `argv` through `opt()`/`flag()`. `--on` is validated at import
  time (51-52), so the module cannot be imported by a unit test.
- Duplicate Code with **different semantics**:
  - `median` (294) averages the middle pair; `verify.mjs median` (215) takes the upper middle.
  - `r1` (295) is null-safe; `verify.mjs r1` (66) is not.
  - `bench-stats.mjs` / `bench-gain.mjs` / `host.mjs` in flight add a third and a fourth variant.
- Coverage gap: `stats()` verdict branches (314-319, "better" / "WORSE" at n ≥ 3) have **no test**.
  `ab-fake` runs n = 1 only (`tests/e2e/ab-fake.test.mjs:65,76`).
- Long lines: 24 lines over 160 characters, e.g. `METRICS` 297, `cmdServe` 265, served check 371, verify
  args 379.

**`tools/verify.mjs`, 274 lines / 5.0k tokens. Measurement code.** It has four responsibilities:
- CLI parsing;
- the page-side scroll script;
- the per-run measurement sequence;
- summaries, screenshot diffs and the report.

Tests: `e2e/verify-fake.test.mjs`, which asserts exact summaries (`:88-103`), and `chrome/verify`.

- Long Method: `measure` 104-192 (89 lines) covers setup, settle, throttle, idle, scroll, morph,
  screenshots and the request/404 census. `main` 217-271 (55 lines) covers lock, launch, loop, diffs,
  report and write.
- Magic Numbers on the timed path: settle 1500 (126), 1000 after throttle (137), 500 (147), 2000 (157),
  2500 per screenshot (171); `SCROLL` 250/300/280 (53-63); morph gesture 215/700/-500/1200 and 25×120
  (153-155). Naming them is a pure rename. Changing any value is not.
- Duplicate Code: `summarize` (69-102) and `iphone.mjs summarize` (67-76) plus `sum` (155) compute the
  same >20/34/50/100 ms frame counts separately.
- Comments smell: the 21-line header describes the whole phase sequence. `measure()` has one inline
  comment per phase, which the Long Method page reads as "extract here".

**`tools/lock.mjs` (155 lines / 3.2k) + `tools/lib/lock.mjs` (291 lines / 4.6k).** The library holds
four concerns:
- file layout and atomic JSON;
- the stale / guard mutex;
- **queue policy** (FIFO + short lane + I-011 last-grant repair);
- acquisition with polling, re-entry and exit hooks.

The CLI holds parsing, formatting and seven commands. Tests: `unit/lock.test.mjs` (460 lines),
`e2e/lock-cli.test.mjs`, `unit/lock-repair.test.mjs`.

- Large Class: the policy lives inside the file I/O. `nextIndex` (150-155), `shortRunStart` (145-147),
  `lastGrantShort` (140-142), `effectiveLastGrant` (136-139) and `pruneQueue` (113-115) are pure given
  `now`, but a reader has to get past `withGuard` and `tryAcquire` to find them.
- Duplicate Code + Magic Number: the short-hold grace `+ 5 + 30` (`lib/lock.mjs:141`) is restated as
  `SHORT_RECORD_GRACE_SEC = 35` in `lib/lock-repair.mjs:38`. JSON I/O is written three times:
  - `lib/lock.mjs:83-84`;
  - `lib/lock-repair.mjs:51-55`;
  - `lib/store.mjs:14-20`.
- Duplicate Code: CLI `acquire --wait` (`lock.mjs:108-115`) reimplements the backoff loop of
  `lib acquire()` (257-290), with different pauses.
- Switch Statements: `main` 76-152 is an `if (cmd === …)` chain of 8 branches.
- Comments: the lock contract is written three times: `lib/lock.mjs:1-40`, `lock.mjs:13-38` and
  CLAUDE.md "Shared devices". It is good "why" text but needs one source of truth.

**`tools/lib/cdp.mjs`, 156 lines / 2.0k tokens. Measurement code.** Already small and single-purpose.
- A 2-line header with no contract. Its "used by" list is stale: `bench` is coming.
- `launchChrome` (22-67) is 46 lines.
- Only comments should change here.

**`tools/serve.mjs`, 391 lines / 6.6k tokens.** It has seven responsibilities:
- config from argv;
- manifest, MIME and CSP tables;
- HTML rewrites;
- file cache and compression;
- routing;
- self-signed certificates;
- listening, the HTTP twin, the announcement and the state file.

Everything runs at module top level, with a top-level `await` at 301, so no part is importable. Tests:
`e2e/serve.test.mjs` (325 lines), `e2e/serve-certs.test.mjs`.

- Large Class / Divergent Change: the seven responsibilities above, all at top level.
- Long Method + Switch Statements: `handler` 200-271 (72 lines) is a chain of 8 route branches.
- Dead conditional: 262 `isHtml ? 'public, max-age=0, must-revalidate' : 'public, max-age=0, must-revalidate'`
  has identical branches. Fix: Consolidate Duplicate Conditional Fragments.
- Primitive Obsession: `send()` 150-166 tells cached from raw bodies by a magic `__c` property. Fix:
  Replace Parameter with Explicit Methods (`sendCached` / `sendBuffer`).
- Lazy alias: `ROOT_DIR = REPO` (42). `verify.mjs:31 ROOT = REPO` is the same.

**`tools/iphone.mjs`, 167 lines / 3.2k tokens.** It has four responsibilities:
- lease check;
- 4 commands;
- the page-side probe;
- summaries and saving.

Tests: `e2e/iphone.test.mjs` (fake proxy), `unit/iphone-url.test.mjs`.

- Long Method + Switch Statements: `main` 78-166 (89 lines, 4 branches).
- Duplicate Code:
  - the device string (132, 157);
  - the out-file and save block (133-137, 158-162);
  - the frame summary (73, 155) against `verify.mjs`.

**`tools/incident.mjs` (114) + `lib/incident.mjs` (248), `tools/finding.mjs` (97) + `lib/finding.mjs`
(280).** These are the cleanest modules: the library/CLI split is right and the headers are contracts.
Tests: `unit/incident|finding.test.mjs`, `e2e/*-cli`.

- Switch Statements: the CLI `main` chains are 53 and 47 lines.
- Duplicate Code:
  - `details()`/`kv()` (`incident.mjs:46-58`, `finding.mjs:39-47`);
  - `waitFor` poll loops (`lib/incident.mjs:239-248`, `lib/finding.mjs:212-224`);
  - `git()` (`lib/incident.mjs:33`, `lib/finding.mjs:32`, `lib/paths.mjs:19`, `fix.mjs:82`, with three
    different return shapes).
- Long Method, mild: `open` 96-154 (59 lines). A dedup step at 109-123 could be extracted.

### Other files (read less; lower priority)

- `lib/lock-repair.mjs` (234 lines):
  - `diagnose` is 98 lines, one block per invariant. Fix: Extract Method per invariant code, the list at
    14-27.
  - ts-prio is editing this file now.
- `lib/paths.mjs` (96), `lib/store.mjs` (47), `lib/perf-page.mjs` (37), `lib/iphone-url.mjs` (77),
  `lib/wip.mjs` (82): small and single-purpose. They only need contract headers.
- `mirror.mjs` (419) and `prettify.mjs` (36): run only by the user, rarely read by agents. They only
  need to adopt `lib/cli.mjs` and a header. `main` is 76 lines; leave it.
- In flight: `tools/bench.mjs` + `lib/bench-*` + `lib/host.mjs` (2.1k lines on the ts-bench branch).
  They add argv parser copy #9 and `r1`/`median` variants #3-#4. Ask ts-bench to adopt `lib/cli.mjs` and
  `lib/num.mjs` once they land (package E/F follow-up), not now.

## 4. Constraints the plan obeys

1. **Measurement code** is `verify.mjs`, `lib/cdp.mjs`, `fix.mjs ab`, and `serve.mjs` / `vendor-shim.js`
   where they change what is served. Only three kinds of change are allowed there:
   - (a) comments and headers;
   - (b) **pure moves and renames**: a function body moved byte-for-byte into a lib and imported,
     constants named with identical values;
   - (c) Extract Method of code that runs **after** the timed window: summaries, regressions, the report.

   Proof for (b) and (c) comes in two parts:
   - `git diff --color-moved=dimmed-zebra --color-moved-ws=allow-indentation-change` shows only moved
     blocks plus import lines;
   - a **golden run**: the `verify-fake` / `ab-fake` result JSON, plus one `serve` response snapshot
     (§6 B), are identical before and after, ignoring timestamps, ports and paths.

   Anything that reorders or wraps awaits inside `measure()` or the ab server/verify lifetime is deferred
   to package G, with an A/A before and after (`fix.mjs ab --aa --runs 5`, same tools version on both
   sides; CLAUDE.md "compare A/B only with the same tools version"). It is also called out per Hard rule 6.
2. **One commit per step, tests after each step** (refactoring.guru "how to"). No feature or bug fix in a
   refactor commit.
   - A found bug is noted in the package README and fixed in its own commit, e.g. the dead conditional
     is fine, a real `median` divergence is not.
   - The `median` divergence is **kept**. Unifying it would change verify's printed medians for even
     `--runs`. Instead: Rename Method to `median` (mean of middle pair) and `upperMedian` (verify rows),
     both in `lib/num.mjs`.
3. **Characterization tests first** where coverage is missing: `stats()` verdicts, the argv parser
   quirks, serve responses.
   - These tests pin today's behaviour, quirks included. For example, `opt('x')` returns the next token
     even if it is another flag; `fix grep -i` lands in the positionals.
   - Changing a quirk is a separate, announced behaviour change.
4. **Sequenced after the work in flight** (checked by comparing each worktree's `tools/` and `tests/` with
   main, 2026-10-01):

   | agent | files it edits now | blocks packages |
   |---|---|---|
   | ts-i017 | `fix.mjs`, `verify.mjs`, `lock.mjs`, `lib/lock.mjs`, `lib/host.mjs`, e2e/chrome tests | D, E, F |
   | ts-prio | `lock.mjs`, `lib/lock.mjs`, `lib/lock-repair.mjs` (next: I-020 yield in lock + `fix.mjs ab`) | D, E |
   | ts-bench | `bench.mjs`, `lib/bench-*`, **`lib/cdp.mjs`**, `lib/host.mjs`, `package.json`, `fixtures/fake-chrome.mjs` | F (`cdp.mjs`), follow-ups |
   | ts-i021 | `scope.mjs`, `lib/scope.mjs`, `package.json`, `unit/guardrails.test.mjs` | none (P1 adds a unit test file only) |
   | ts-i002 | `tests/chrome/*`, `e2e/chrome-lock.test.mjs` | none |
   | arch-tools (proposals, not built) | `verify.mjs` sleep time-scale knob + screenshots after lock release (`measure` 163-176, `main` 218-240); lock polling (`acquire` 257-288, CLI 110-113); grant rule in `nextIndex`/`headOk` (150-155, 196) | F, G, D (see §7) |

   **Untouched now:** `serve.mjs`, `iphone.mjs`, `incident.mjs`, `finding.mjs`, `lib/incident.mjs`,
   `lib/finding.mjs`, `lib/store.mjs`, `lib/paths.mjs`, `lib/wip.mjs`, `lib/iphone-url.mjs`,
   `lib/perf-page.mjs`, `mirror.mjs`, `prettify.mjs`.

## 5. Conventions every package applies

### 5.1 Contract header (Comments smell: say *why* and *what*, not *how*)

Every `tools/*.mjs` and `tools/lib/*.mjs` starts with at most 12 comment lines in this order:

```
// <name>: <one line: what it is for>.
// Used by: <callers>.   Tests: <test files>.
// Contract: <inputs> -> <outputs and side effects (files, processes, locks, ports)>.
// Invariants: <what must stay true; incident ids that explain why>.
// Usage: (CLIs only) one line per command; details in `--help`, not here.
```

Long "why" essays move to the incident or `fixes/*.md` they came from, with a pointer. For example, the
lock header keeps its invariants and moves the I-011 narrative. The header of a measurement-code file
also says `MEASUREMENT CODE: pure moves only (tools-refactor.md §4)`.

### 5.2 `tools/README.md`, the map (about 1.5k tokens, read once)

It has one table:

| file | one-line purpose | key functions | tests | owner rule |
|---|---|---|---|---|

It also has 12 "where is X" lines, which are the §2.1 questions with their answers as
`file:function`. It is kept honest by a unit test (P1): every tools file has a row and every row's file
exists.

### 5.3 CLI shape

Each CLI is a spec plus a command table (Replace Conditional with Polymorphism):

```js
const cli = parseArgs(process.argv.slice(2), { valued: [...], passthrough: true });
const COMMANDS = { status: { usage, run }, ... };
```

`--help` prints the usages.

## 6. The plan: packages and steps

Each step lists: smell → technique · files:lines · covering tests · expected M2/M3 effect · risk.
"Now" means it can start before the work in flight lands.

### P1: shared CLI parser + map (1 toolsmith, **now**, new files only; about half a day)

1. **Characterization tests** `tests/unit/cli.test.mjs`. They pin today's parser semantics, as written in
   `fix.mjs:34-42`, `lock.mjs:43-50`, `incident.mjs:28-31`, `finding.mjs:27-30`, `iphone.mjs:30-33`,
   `serve.mjs:45-46` and `verify.mjs:33-35`:
   - `--x=a=b` → `a=b`;
   - `--x` followed by a flag returns that flag;
   - positionals skip the value after a valued flag;
   - `--` splits off the passthrough args;
   - `-i` stays positional.

   Risk: none.
2. **Duplicate Code → Extract Function** (https://refactoring.guru/extract-method): add `tools/lib/cli.mjs`
   with `parseArgs(argv, {valued, passthrough}) → {opt, flag, positionals, passthrough}`, byte-compatible
   with the copies. No caller changes yet.
   - Effect on M3: none yet. Risk: none.
3. **`tools/README.md`** (§5.2) + `tests/unit/tools-map.test.mjs` (every tools file has a row).
   - Effect: M1 entry cost about -1 file-listing plus 1-2 grep calls per question.
   - Risk: none. The test is a new file; ts-i021 edits `guardrails.test.mjs`, so there is no conflict.

### A: incident + finding boards (1 toolsmith, **now**, after P1)

Files: `incident.mjs`, `finding.mjs`, `lib/incident.mjs`, `lib/finding.mjs`, `lib/store.mjs`, `lib/paths.mjs`.

1. Adopt `lib/cli.mjs` in both CLIs.
   - Tests: `e2e/incident-cli`, `e2e/finding-cli`. Effect: -12 lines, argv copies 8 → 6.
2. **Switch Statements → command table** (https://refactoring.guru/replace-conditional-with-polymorphism):
   `incident.mjs main` 60-112 and `finding.mjs main` 49-95.
   - Tests: the same e2e files (they assert the printed OPENED/JOINED/KNOWN/POSTED/SIMILAR lines).
   - Effect: the longest functions go from 53 and 47 lines to 15 or fewer each.
3. **Duplicate Code → Extract Function**: `pollUntil(check, {timeoutSec, pollMs})` in `lib/store.mjs`,
   used by `lib/incident.mjs:239` and `lib/finding.mjs:212`. `kv()`/`details` formatting goes to
   `lib/format.mjs`.
   - Tests: `unit/incident`, `unit/finding` (the wait tests); add a `pollUntil` unit test with a fake clock.
4. **Duplicate Code → Move Method** (https://refactoring.guru/move-method): one `git(args, {cwd,
   timeoutMs})` in `lib/git.mjs`, returning `{code, out}`. Callers keep their own shapes through two
   one-line adapters.
   - This step touches `lib/paths.mjs:19`, `lib/incident.mjs:33` and `lib/finding.mjs:32`. The
     `fix.mjs:82` copy waits for E.
   - Tests: `unit/paths`, `unit/incident`, `unit/finding`. Risk: low. Keep the 5 s timeout exactly where
     it is today (incident/finding only).
5. Contract headers (§5.1) on the six files.

Expected: Q7 unchanged (control). M3: argv copies -2, functions over 40 lines -3.

### B: serve.mjs (1 toolsmith, **now**, after P1)

`serve.mjs` is what is served, so it counts as measurement-relevant: pure moves, plus a golden snapshot.

1. **Characterization test** `tests/e2e/serve-golden.test.mjs`. It runs against the fixture baseline:
   - modes: `--vendors block|local|off` × `--compress br|none`, with and without `--overlay`;
   - paths: GET `/`, a JS file, an overlay file, a `/__vendor/` file, `/__mirror/info`, a 404,
     `/.mirror/x`, and POST `/api/x`;
   - it snapshots status, the sorted headers minus `date`, and sha256 of the body into
     `tests/fixtures/serve-golden.json`.

   It is committed before any serve change. Risk: none.
2. **Introduce Parameter Object**: `parseServeConfig(argv, env) → cfg` from 44-69, in
   `lib/serve-config.mjs`. The module-level code moves into `main()`. Top-level `await` stays only inside
   `main()`.
   - Tests: golden, `e2e/serve`. Risk: low. Startup order stays the same: cert, then listen, then twin,
     then announce.
3. **Large Class → Extract Class** (https://refactoring.guru/extract-class):
   - `lib/serve-files.mjs`: `MIME`, `COMPRESSIBLE`, `localCsp`, `DOC_HEADERS`, `rewriteHtml`,
     `vendorLookup`, `resolveFile` and the file cache (71-198). These become functions of `cfg`.
   - `lib/selfsigned-cert.mjs`: `readSelfSigned` + the guarded creation (280-318).
   - Tests: golden, `e2e/serve-certs`. Effect: **Q5 6.6k → 1.2k**.
4. **Switch Statements → route table**: `handler` 200-271 becomes `ROUTES = [{match, serve}]` for
   `/__mirror/vendor-shim.js`, `/__mirror/null`, `/__mirror/info`, `/cdn-cgi/`, `/__vendor/`,
   `/analytics.js` (off) and static.
   - The `LATENCY` delay (201) stays verbatim at the top of `handler`.
   - Tests: golden. Risk: low to medium, because route order matters. The golden covers every route.
5. **Consolidate Duplicate Conditional Fragments** at 262, and **Replace Parameter with Explicit
   Methods** for `send()` `__c`: `sendCached(c)` / `sendBuffer(buf)`.
   - Tests: golden (etag, content-length, encoding). Risk: low.
6. Header. `serve.mjs` goes from 391 lines to about 120 (config, main, listen, announce).

### C: iphone.mjs (1 toolsmith, **now**, after P1)

1. Adopt `lib/cli.mjs`. **Switch Statements → command table** for `main` 78-166.
   - Tests: `e2e/iphone.test.mjs` (fake proxy).
2. **Extract Class**: move `PROBE` (51-65) + `summarize` (67-76) + the record summary `sum` (155) to
   `lib/iphone-probe.mjs`. `DEVICE = 'iPhone 15 Pro Max, iOS 26.6.1 Safari'` becomes a constant (132, 157).
   `saveResult(owner, label, res)` replaces the duplicated out-file blocks (133-137, 158-162) via Extract
   Method.
   - Tests: `e2e/iphone`. Add a unit test for the summaries with canned frames.
   - Effect: **Q10 3.2k → 1.2k**. Risk: low. `iphone.mjs` is not Chrome measurement code, but its
     numbers are compared across days, so the summaries must stay byte-identical (the unit test pins them).
3. Headers on `iphone.mjs`, `lib/wip.mjs`, `lib/iphone-url.mjs`.

### D: lock policy split (1 toolsmith, **after ts-i017 and ts-prio land**, including I-020)

1. **Characterization**: add `tests/unit/lock-policy.test.mjs`. It calls the policy with an injected
   `now`, covering:
   - FIFO;
   - a short waiter before a normal one;
   - the drain budget running out (I-011);
   - a stale short record;
   - a live holder missing from last-grant.

   These functions are unexported today. Step 2 exports them from the new file and the test lands in
   the same commit. `unit/lock.test.mjs` (460 lines) already covers the behaviour end to end, so the move
   is guarded.
2. **Large Class → Extract Class**: move `pruneQueue`, `effectiveLastGrant`, `lastGrantShort`,
   `shortRunStart`, `nextIndex` and `staleReason` + `SHORT_*` to `lib/lock-policy.mjs`, as pure functions
   of `(queue, lastGrant, holder, now)`.
   - **Replace Magic Number**: `SHORT_HANDOVER_GRACE_SEC = 5 + 30` is exported and replaces
     `lib/lock.mjs:141` and `lib/lock-repair.mjs:38`.
   - Effect: **Q1 4.6k → 1.2k**. Risk: low. Pure move; `--color-moved` proves it.
3. **Duplicate Code**: `readJson`/`writeJson` from `lib/lock.mjs:83-84` and `lib/lock-repair.mjs:51-55`
   → `lib/store.mjs`.
   - Subtle: `lib/lock` `readJson(f, d)` returns a default; `store.readJson(f)` returns null. Add the
     default parameter and don't change callers' semantics. Tests: `unit/lock`, `unit/lock-repair`,
     `unit/store`.
4. **Switch Statements → command table** in `lock.mjs main` 76-152. Formatting (`fmt`, `fmtDoctor`,
   `fmtProblem`) goes to `lib/lock-format.mjs`. Adopt `lib/cli.mjs`.
   - Tests: `e2e/lock-cli`, `e2e/lock-repair-cli`. Effect: Q8 3.2k → 0.8k, Q9 7.7k → about 4.5k.
5. **Duplicate Code**: make CLI `acquire --wait` (108-115) call a lease-mode `lib acquire` loop. Do this
   **only if** arch-tools' polling proposal is rejected or already landed.
   - The pauses differ today (5 s → 30 s vs 2 s → 15 s), so unifying them is a behaviour change. Otherwise
     leave it with a comment pointing at the twin.
6. **Long Method → Extract Method** in `lib/lock-repair.mjs diagnose` (98 lines): one
   `check<Invariant>()` per problem-code group (holder, queue, last-grant, leftovers).
   - Tests: `unit/lock-repair` (302 lines). Only after ts-prio's `repair --move` lands.
7. Headers: one lock contract in `lib/lock.mjs`. `lock.mjs` and CLAUDE.md point to it (lead edits
   CLAUDE.md).

### E: fix.mjs split (1 toolsmith, **after ts-i017 and ts-prio I-020 land**; the ab parts are measurement code)

1. **Pure move**: `METRICS`, `median`, `r1`, `stats` and `markdown` (294-337) → `lib/ab-stats.mjs`.
   Numeric helpers → `lib/num.mjs`, with `median` (mean of the middle pair) kept as is.
   - Proof: `--color-moved` + `ab-fake` exact results.
2. **Characterization** `tests/unit/ab-stats.test.mjs`. It covers:
   - n = 3 better and WORSE for higher-is-better and lower-is-better metrics;
   - overlapping ranges;
   - even-n median;
   - `deltaPct` when the baseline median is 0;
   - idle skipped when absent;
   - markdown signs.

   This closes today's coverage gap on the verdict logic. Effect: **Q2 7.7k → 1.6k**.
3. **Hidden inputs → Introduce Parameter Object**: `ctx = {base, baseName, on, repo}` is passed to
   `underlying`, `relPath`, `overlayFiles`, `cmdDiff`, `applyPatch` and `resolvePatch`. Then **Extract
   Class** → `lib/overlay.mjs`. The `--on` check moves from import time into `main()`.
   - Tests: `e2e/fix.test.mjs` (edit, diff, apply, combine, `--on`). `ab` calls `cmdDiff` before the
     servers start, which is outside the timed window. Risk: low to medium.
4. **Long Method → Extract Method** on `cmdAb` 339-421 → `lib/ab.mjs`:
   - `startServer` + `get` (moved verbatim);
   - `checkServed(t, base, fix)` (365-376);
   - `regressionsOf(v, lb, lf)` (386-399);
   - `buildResult(...)` (400-412).

   The sequence start servers → served check → spawn verify → kill stays inline in `cmdAb`, with the
   signal wiring 356-362 verbatim. Only code that runs **before** the servers start or **after**
   `verifyProc` exits is extracted.
   - Proof: `ab-fake` results.json identical (minus times and ports) + `--color-moved`.
   - Effect: **Q4 and Q12 7.7k → 3.0k**, `cmdAb` 83 → about 30 lines.
5. `git()` → `lib/git.mjs` adapter (from A). Adopt `lib/cli.mjs`: the `--` passthrough and the `-i`
   quirk are pinned in P1. Command table: the `cmds` object at 424 is already one.
6. Header with the `MEASUREMENT CODE` marker. Call out in the commit and to the lead: "pure moves, A/B
   comparability unaffected, golden identical".

### F: verify.mjs + cdp.mjs pure moves (1 toolsmith, **after ts-i017 and ts-bench land**, and after the lead decides arch-tools' verify proposal)

1. **Header + phase banners** (comments only). The header states the phase contract in 8 lines: settle →
   throttle → idle → scroll → morph → unthrottle → screenshots (run 0) → census. `measure()` gets
   `// ---- phase: idle ----` banners.
   - Effect: M1 on Q3 should drop even though M2b stays 5.0k, because the answer can be read from 8 lines.
2. **Replace Magic Number with Symbolic Constant** on the timed path, **identical values**:
   - `SETTLE_AFTER_LOAD_MS = 1500`, `AFTER_THROTTLE_MS = 1000`, `AFTER_SCROLL_MS = 500`,
     `AFTER_MORPH_MS = 2000`;
   - `SCROLL_STEP_PX = 250`, `SCROLL_EVERY_MS = 300`;
   - `MORPH_TOUCH = {...}`, `MORPH_WHEEL = {...}`.

   Proof: `--color-moved` + `verify-fake` exact summaries (`:88-103`). This also gives arch-tools'
   test-only time-scale knob a single place to hook in. Risk: low.
3. **Pure move**: `summarize`, `pct`, `stripOrigin` → `lib/frame-stats.mjs`. `median` → `lib/num.mjs` as
   **`upperMedian`** (Rename Method: it is not the ab median). `SCROLL` → `lib/perf-page.mjs` next to
   `LOGGER`/`RESET`/`COLLECT`. `diffImages` → `lib/screenshot-diff.mjs`. Share `countOver(frames, ms)`
   with `lib/iphone-probe.mjs` (C) only if its output is byte-identical.
   - Tests: `verify-fake`, `unit/perf-page`. Effect: `verify.mjs` 274 → about 150 lines.
4. `lib/cdp.mjs`: header only (§5.1, "Used by: verify, mirror --crawl, bench").

### G: last, alone, with an A/A (1 toolsmith; after A-F; one `chrome-measure` slot of about 12 min)

1. **Shotgun Surgery → Move Method** into `lib/exit.mjs`: `onExit(fn)` / `onSignals(fn, {exitCode,
   prepend})`. It encodes the "`process.on`, not once" rule (I-008/I-009) in one place, used by:
   - `lib/lock.mjs:271-277`;
   - `lock.mjs:137`;
   - `fix.mjs:358-362`;
   - `serve.mjs:360-365`;
   - `cdp.mjs:55-56`.

   Exit codes differ per site (130 vs 0) and `lock.mjs run` uses `prependListener`, so these become
   parameters, not unified behaviour. Tests: the existing signal tests (26 SIGTERM/I-008/I-009
   references in `tests/e2e` + `tests/unit`). Add a table test per call site. Effect: **Q6 24k → about
   1.5k**. Risk: **medium to high**: signal ordering is subtle, and this touches measurement lifetimes.
2. **Long Method → Extract Method** on `verify.mjs measure()`:
   - `setupPage`, `settle`, `idlePhase`, `scrollPhase`, `morphPhase`, `screenshots`, `census`;
   - combined with arch-tools' "screenshots after lock release" move, if the lead accepts it, so there
     is one timing-path change and one A/A, not two.

   It needs:
   - `fix.mjs ab --aa --runs 5` before and after, on a quiet host;
   - `remeasure` on the incident;
   - a note in `results.json` and `fixes/README.md` per Hard rule 6.

   Effect: Q3 → 2.0k.

### Parallelism

| wave | toolsmiths in parallel | packages | files (disjoint within a wave) |
|---|---|---|---|
| now-0 | 1 | P1 | new: `lib/cli.mjs`, `tools/README.md`, 2 unit tests |
| now-1 | 3 | A, B, C | A: incident/finding/store/paths/git; B: `serve.mjs` + `lib/serve-*` + `selfsigned-cert`; C: `iphone.mjs` + `lib/iphone-*` + `wip` |
| after in-flight | 3 | D, E, F | D: `lock.mjs`, `lib/lock*.mjs`; E: `fix.mjs`, `lib/ab*.mjs`, `lib/overlay.mjs`, `lib/num.mjs` (creates it); F: `verify.mjs`, `lib/frame-stats`, `lib/perf-page`, `lib/screenshot-diff`, `cdp.mjs` (header) |
| last | 1 | G | cross-cutting |

Two details keep the waves conflict-free:
- `tools/README.md` rows are appended by each package. That is a one-line edit per package, and the lead
  resolves a trivial rebase when landing.
- `lib/num.mjs` is created by E and imported by F, so F rebases after E, or E lands `lib/num.mjs` alone
  first.

Each package runs `npm test` in the short lane, and B, E and F also run their golden. Only G needs Chrome.

## 7. Alignment with arch-tools (speed, `research/architecture/tools-speed.md`)

Reply received 2026-10-01. Its proposals are not built yet:

- **Tests:** the slow part is `verify.mjs`'s hard-coded sleeps against fake Chrome (`verify-fake` +
  `ab-fake` are about 75 of 143 s summed). It proposes one test-only time-scale knob on those sleeps,
  recorded in the result and refused by `fix.mjs ab` unless it is 1. It does **not** propose in-process
  CLI calls, since spawning costs about 0.1 s.
  - Overlap: **F2**, where naming the sleep constants gives the knob one place to hook in. Order F2 →
    knob, or both in one F commit series, with the knob as a separate, announced behaviour change.
- **Lock:**
  - head-of-queue fast polling or `fs.watch`, in `acquire` 257-288 and CLI 110-113;
  - a grant rule that skips a head waiter that hasn't polled recently, in `nextIndex`/`headOk`.

  Overlap: **D2 and D5**. Recommendation: land D2's pure policy split first. The grant-rule change then
  becomes a small, reviewable diff in `lib/lock-policy.mjs` with direct unit tests. ts-prio's I-020 lands
  before both.
- **verify:** move the run-0 screenshot pass + `diffImages` after the lock release (`measure` 163-176,
  `main` 218-240). Overlap: **F3 and G2**. Do it in G2's A/A slot so the timing path changes once.
- **serve:** no startup change is proposed, so there is no overlap with B.

## 8. How to measure before and after

1. **Before P1:**
   - M3 via Appendix A on main;
   - M2 table §2.1, already filled with estimates;
   - M1: 24 helper runs (GT arm = G, since there is no map yet), 12 questions × 2, sonnet, background,
     5-8 at a time, scored by `score.mjs`.

   The questions go in `research/code-navigation-benchmark/tasks-tools.json` or a sibling study, with
   ground truth as `file + function`.
2. **Per package:** M3 before and after, plus M2b for the questions it touches, in the commit message.
   The reviewer checks that M3 did not regress elsewhere.
3. **After F, and again after G:** M1 again with the GT arm (map allowed). Report the median read tokens
   per question, calls and score. Q7 and Q11 are the controls: a change there is noise.
4. **Success:**
   - median M1 read tokens -40 % or more on Q1-Q6 and Q8-Q12, with every score 1.0;
   - M2b -60 % or more;
   - no function over 40 lines in the priority files except `cmdAb`'s inline measurement sequence and
     `measure()` before G.

## 9. Open questions for the lead

1. Is the M1 study worth about 8M tokens (2 × 24 runs)? The alternative is M2 + M3 only, with M1 on
   6 questions (Q1-Q6), n = 1: about 2M.
2. Should G2 (Extract Method in `measure()`) happen at all? It is the only step that needs an A/A. F1's
   phase banners already answer Q3 cheaply, so G2 can be dropped if the wave schedule is tight.
3. `lib/cli.mjs` for `bench.mjs`: ask ts-bench to adopt it after P1 lands, or leave it for E/F.
4. The lock contract in CLAUDE.md "Shared devices" duplicates `lib/lock.mjs:1-40`. Can CLAUDE.md shrink
   to a pointer after D7? CLAUDE.md is lead-only.

## Appendix A: M3 static proxy script (research-only; run with `node <script> <checkout>`)

```js
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = process.argv[2] || '.';
const files = [...readdirSync(join(root, 'tools')).filter((f) => f.endsWith('.mjs')).map((f) => 'tools/' + f),
  ...readdirSync(join(root, 'tools/lib')).filter((f) => f.endsWith('.mjs')).map((f) => 'tools/lib/' + f)];
const rows = files.map((f) => {
  const src = readFileSync(join(root, f), 'utf8'), L = src.split('\n'), fns = []; let cur = null;
  L.forEach((l, i) => { const m = l.match(/^(?:export )?(?:async )?function\s+(\w+)/);
    if (m) cur = { name: m[1], start: i + 1 }; else if (cur && /^}/.test(l)) { fns.push({ ...cur, len: i + 2 - cur.start }); cur = null; } });
  fns.sort((a, b) => b.len - a.len);
  return { f, lines: L.length, tok: Math.round(src.length / 3.6), long: L.filter((l) => l.length > 160).length,
    fnOver40: fns.filter((x) => x.len > 40).length, maxFn: fns[0] ? `${fns[0].name}:${fns[0].start} (${fns[0].len})` : '-',
    argvParser: /const opt = \(n, d\)/.test(src) };
});
console.table(rows);
```

Baseline on `e99bcc5`:

| file | lines | tokens | lines >160 | fns >40 | longest function |
|---|---|---|---|---|---|
| `fix.mjs` | 431 | 7.7k | 24 | 1 | `cmdAb`:339 (83) |
| `serve.mjs` | 391 | 6.6k | 17 | 1 | `handler`:200 (72) |
| `mirror.mjs` | 420 | 6.2k | 7 | 2 | `main`:342 (76) |
| `verify.mjs` | 274 | 5.0k | 21 | 2 | `measure`:104 (89) |
| `lib/lock.mjs` | 291 | 4.6k | 6 | 1 | `tryAcquire`:162 (56) |
| `lib/lock-repair.mjs` | 235 | 4.2k | 13 | 1 | `diagnose`:71 (98) |
| `lib/finding.mjs` | 281 | 4.0k | 6 | 0 | `post`:110 (38) |
| `lib/incident.mjs` | 249 | 3.3k | 6 | 1 | `open`:96 (59) |
| `iphone.mjs` | 168 | 3.2k | 16 | 1 | `main`:78 (89) |
| `lock.mjs` | 155 | 3.2k | 8 | 1 | `main`:76 (77) |
| `incident.mjs` | 115 | 2.1k | 8 | 1 | `main`:60 (53) |
| `lib/cdp.mjs` | 157 | 2.0k | 1 | 1 | `launchChrome`:22 (46) |
| `finding.mjs` | 98 | 1.9k | 7 | 1 | `main`:49 (47) |
| 6 small files (`lib/iphone-url`, `paths`, `perf-page`, `store`, `wip`; `prettify.mjs`) | 381 | 5.8k | 7 | 0 | `connect`:10 (35) |
| **total (19 files)** | | **59.7k** | **147** | **14** | argv parser copies: **8** |
