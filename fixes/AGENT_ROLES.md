# Agent roles, delegation, model and effort

Who does what when several Claude Code agents work on `fixes/TOPICS.md` at once, how they may spawn
helpers, and which model/effort each kind of task gets. Rules and mechanics live elsewhere; this
file links to them instead of repeating them.

| role | definition | reads first | owns / writes |
|---|---|---|---|
| **lead** (main session, main checkout) | none (you) | `CLAUDE.md`, [`LEAD.md`](LEAD.md), [`TOPICS.md`](TOPICS.md) | spawning, the iPhone finger-test channel to the user, reviews, `combine`, landing; infra fixes to `tools/` |
| **fix owner** (one topic or conflict cluster, own worktree) | [`.claude/agents/fix-owner.md`](../.claude/agents/fix-owner.md) | its spawn prompt ([`AGENT_PROMPT.md`](AGENT_PROMPT.md)), `CLAUDE.md` | `fixes/<topic>/` in its worktree only; measurements for its topic |
| **mapper** (helper, read-only) | [`.claude/agents/bundle-mapper.md`](../.claude/agents/bundle-mapper.md) | the question it was given | nothing; returns file:line answers |
| **reviewer** (adversarial, read-only) | [`.claude/agents/fix-reviewer.md`](../.claude/agents/fix-reviewer.md) | the fix's deliverables, [`README.md` "Definition of done"](README.md#definition-of-done) | nothing; returns ACCEPT / NEEDS-WORK / REJECT |

Where each fact lives (link, don't copy): hard rules, layout, fix commands, ports, locks, iPhone
lease, team conventions → `CLAUDE.md`. Deliverable format and done criteria → [`README.md`](README.md)
and [`_template/README.md`](_template/README.md). Topics, code locations, conflicts, waves →
[`TOPICS.md`](TOPICS.md). Per-topic steps and report format → [`AGENT_PROMPT.md`](AGENT_PROMPT.md).
Lead procedure → [`LEAD.md`](LEAD.md). Evidence → `research/01-initial-investigation/`
(README findings, `motion-inventory.md`) and `research/cpu-throttle-calibration/`.

## How spawning works (verified against the Claude Code docs, v2.1.286, 2026-10-01)

Sources: [sub-agents](https://code.claude.com/docs/en/sub-agents.md),
[agent-teams](https://code.claude.com/docs/en/agent-teams.md),
[model-config](https://code.claude.com/docs/en/model-config.md),
[worktrees](https://code.claude.com/docs/en/worktrees.md),
[tools-reference](https://code.claude.com/docs/en/tools-reference.md).

- **Subagents can nest.** A subagent whose tools include `Agent` can spawn subagents, up to **3
  layers below the main conversation** (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, default 3). At the
  limit the `Agent` tool is withheld. Lead → fix owner (layer 1) → mapper (layer 2) fits. The mapper
  and reviewer definitions leave `Agent` out, so they stay leaves.
- **Teammates are different.** With agent teams on, an Agent call **from the main conversation**
  with a `name` and without `isolation` on the call becomes a teammate. Teammates **cannot spawn
  teammates** (no nested teams) but can spawn **subagents, which run in the foreground** (the
  teammate waits; `background: true` / `run_in_background` fail). A named call made by a subagent or
  teammate is an ordinary subagent. The docs don't say how teammate depth counts toward the nesting
  limit: keep helpers one level deep.
- **Frontmatter keys** (only `name` and `description` are required; unknown keys are silently
  ignored): `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`,
  `hooks`, `memory`, `background`, `omitClaudeMd`, `effort`, `isolation`, `color`, `initialPrompt`,
  `experimental`. This project uses `name`, `description`, `tools`, `model`, `effort`, `isolation`,
  `maxTurns`, `color`, nothing else. Not used on purpose: `memory` (a `project` memory dir is committed
  and would collect Fastwork code excerpts, hard rule 3), `permissionMode` (ignored whenever the lead runs
  in auto/acceptEdits/bypass mode, and not settable per teammate), `mcpServers` (Serena is already a
  session server; subagents inherit it).
- **What a teammate honours from a definition:** `tools` (plus `SendMessage` and task tools added),
  `model` (unless the spawn prompt names one), and the **body** (appended to its system prompt
  in-process). **Not honoured:** `effort` (teammates follow the lead's effort level; `/effort` while
  viewing a teammate changes it), `isolation` (a teammate runs in the lead's working directory, so
  the fix owner's step 0 enters a worktree), `skills`, `permissionMode`, and `mcpServers` in-process.
- **Model** per subagent: aliases `fable`, `opus`, `sonnet`, `haiku`, a full ID, or `inherit`.
  Order: per-call `model` parameter → definition `model` → `CLAUDE_CODE_SUBAGENT_MODEL` → lead's
  model. A family alias equal to the lead's family resolves to the lead's exact model (incl. `[1m]`).
  `fable` is the most capable and may bill usage credits: per-call opt-in only.
- **Effort** per subagent comes **only from the definition's `effort`** (`low`, `medium`, `high`,
  `xhigh`, `max`; Opus/Sonnet 5.5 and Fable support all five, Haiku supports none). The Agent tool
  has no effort parameter, so a different effort means a different definition. `CLAUDE_CODE_EFFORT_LEVEL`
  overrides frontmatter. Opus 5.5 defaults to `medium`.
- **Worktrees:** `isolation: worktree` (definition or call) gives a subagent a fresh worktree from
  `HEAD` (`worktree.baseRef: "head"`; inside a worktree that is the worktree's `HEAD`). It contains
  committed files only: **a helper in its own worktree would not see your uncommitted overlay**, so
  helpers run without isolation and get absolute paths. Worktrees without changes are removed
  automatically.
- **Loading:** `.claude/agents/` is watched only if it existed when the session started. A session
  started before these files landed must be restarted to see them.
- **Validate** definitions with `claude plugin validate .claude/agents` (YAML only; it doesn't
  check field names, so compare keys with the list above).

## Model and effort per task

Measurements are serialized by the `chrome-measure` lock, so **only the fix owner measures**:
helpers never run `fix.mjs ab`/`serve`, `verify.mjs`, `iphone.mjs` or take locks. Parallel helpers
buy reading throughput, not measurement throughput.

| task | who does it | model / effort | why |
|---|---|---|---|
| Locate code, grep, summarize logs, `results.json`, research data | `bundle-mapper` with per-call `model: "haiku"` | haiku (effort n/a) | mechanical; the caller checks the refs anyway |
| Map a callback in the prettified bundle: DOM reads vs writes per frame, callers of `dE`, which CSS rules a property drives | `bundle-mapper` (default) | sonnet / medium | real comprehension of minified closures, but read-only and verifiable; much cheaper than opus |
| Web-platform lookups (e.g. `animation-timeline` support in iOS Safari) | `bundle-mapper` | sonnet / medium | WebFetch + summary |
| Design the fix, edit the overlay, decide what to measure next, interpret noisy A/B results | fix owner itself, never delegated | opus / high (definition) | needs the whole context; errors cost lock time |
| L-size or risky topics (cluster A engine, `morph-scrolljack-passive`, `hero-exit-scroll-timeline`) | fix owner | lead may pass `model: "fable"` per call | longest autonomous work; opt-in because of cost |
| Write the fix README | fix owner | (owner's) | the claims must come from whoever holds the evidence |
| Adversarial review of diff + results | `fix-reviewer`, spawned by the lead | opus / high | fresh context is the point; statistics and behaviour parity need depth |
| Review of a combined wave | `fix-reviewer` | opus / high, or `model: "fable"` | interactions between patches |
| Lead's own coordination | lead | the session's model/effort | — |

## Serena (optional, read-only)

How Serena is set up and its rules (read-only, rooted at the **main checkout** even for worktree
agents, path mapping to your overlay, 0-based lines, memories) are in the `CLAUDE.md` section
**"Serena (code navigation, read-only)"**. This section only says how to find it and when to use it.

- **Detect:** `ToolSearch` with query `+serena`. No `mcp__serena__*` tools → skip Serena and use
  `node tools/fix.mjs grep/show`. If present, call `mcp__serena__initial_instructions` first (the
  server asks for it), then `read_memory hot_code_map` for the verified symbol map.
- **When it helps:** `get_symbols_overview` of `nodes/2.DyWL8TcE.js` (13.5k lines) to see the
  component functions; `find_symbol` with a full name path to jump to a minified closure;
  `find_referencing_symbols` for "who calls `dE` / reads this variable". Plain grep is better for
  strings, CSS (not indexed) and custom-property names such as `--future-shrink`.
- **Never** use Serena to edit or to write memories, even if such a tool is offered; findings go in
  `fixes/<topic>/README.md` or your report.
