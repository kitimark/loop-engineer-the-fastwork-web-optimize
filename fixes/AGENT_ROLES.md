# Agent roles, delegation, model and effort

Who does what when several Claude Code agents work on `fixes/TOPICS.md` at once, how they spawn
helpers, and which model/effort each kind of task gets. Rules and mechanics live elsewhere; this
file links to them instead of repeating them.

## Roster

| role | definition | responsibility | spawned by, as | model / effort | tools (beyond Read/Grep/Glob) | writes |
|---|---|---|---|---|---|---|
| **lead** | none: the main session in the main checkout | plans waves, spawns everyone, **coordinates incidents**, relays finger tests to the user, reviews, lands on `main` (tool fixes first) | the user | the session's; `/effort high` before spawning teammates (they inherit it) | everything; `SendMessage`, `Agent` | `main` (by fast-forward only), the incident store (triage) |
| **fix owner** | [`fix-owner`](../.claude/agents/fix-owner.md) | one topic or conflict cluster end to end: evidence, overlay patch, A/B, README | lead: teammate (clusters that must talk) or worktree subagent | opus / high; per call `fable` for L-size | Edit, Write, Bash, Agent, SendMessage, EnterWorktree, Monitor, TaskStop, Web*, Serena (read) | `fixes/<topic>/` on its branch; self-fixes of small tool bugs ([`INCIDENTS.md`](INCIDENTS.md) 1) |
| **toolsmith** | [`toolsmith`](../.claude/agents/toolsmith.md) | one incident in `tools/`/`tests/`: reproduce, failing test, fix, one `tools:` commit | lead, per incident: worktree subagent (`isolation` on the call), name `ts-i<nnn>` | opus / high; per call `sonnet` for a small non-measurement bug | Edit, Write, Bash, SendMessage, EnterWorktree, Monitor, TaskStop, Web*; no Agent | `tools/`, `tests/` on its branch |
| **wave integrator** | [`wave-integrator`](../.claude/agents/wave-integrator.md) | after a wave landed: `combine`, mechanical conflicts, combined A/B, interactions, iPhone confirmation, write-up | lead: worktree subagent, name `wave<N>` | opus / high | as fix owner | `fixes/all-wave<N>/`, `research/<nn>-wave<N>-results/` |
| **mapper / researcher** | [`bundle-mapper`](../.claude/agents/bundle-mapper.md) | read-only answers: bundle code, callers, DOM reads/writes, results data, web-platform questions (incident class `research`) | a fix owner or integrator (helper), or the lead; always without `name` | sonnet / medium; per call `haiku` for mechanical jobs | Bash (read-only use), WebFetch, WebSearch, Serena (read) | nothing |
| **reviewer** | [`fix-reviewer`](../.claude/agents/fix-reviewer.md) | adversarial review of a finished fix, a combined wave, or a measurement-code tool fix | lead, without `name` | opus / high; per call `fable` for a combined wave | Bash (read-only use), Serena (read) | nothing |

Not separate agents, on purpose:
- **Incident coordinator = the lead**, backed by the shared store `tools/incident.mjs`. See
  "Why the lead coordinates incidents" below.
- **Device steward = the lead + the locks.** `tools/lock.mjs` already serializes Chrome measurements
  (FIFO `chrome-measure`) and the iPhone (`iphone` lease with TTL); what remains is talking to the
  user for finger tests and physical fixes, and only the lead can do that.
- **Researcher = `bundle-mapper`.** Web-platform and WebKit-vs-Chrome questions have the same shape
  as its code questions (read, cite, answer in ~60 lines); a second read-only definition would only
  differ in its prompt.

## Who may do what

| action | lead | fix owner | toolsmith | integrator | mapper | reviewer |
|---|---|---|---|---|---|---|
| work in the main checkout | yes (only one) | no | no | no | read only | read only |
| edit an overlay (`fixes/<t>/overlay/`) | no | own topic | no | `all-wave<N>` | no | no |
| edit `tools/`, `tests/` | own infra worktree only | small self-fix (INCIDENTS 1) | yes: its incident | no (report an incident) | no | no |
| commit | landing only | own branch | own branch | own branch | no | no |
| measure (`fix.mjs ab`, `verify.mjs`, `test:chrome`) | noise floor (A/A) | yes | tests only | yes | no | no |
| `iphone` lease | yes | yes | no | yes | no | no |
| spawn helpers | teammates and subagents | foreground (teammate) / nested subagents | no | subagents | no | no |
| open an incident | yes | yes | yes (a second bug) | yes | via its caller | via its caller |
| triage, dispatch, resolve an incident | yes | claim a self-fix only | notes only | no | no | no |
| post, ack a finding (`finding.mjs post`, `ack`) | yes | yes | yes | yes | yes | yes |
| fold (`digest`) and resolve a finding | yes | no | no | no | no | no |
| land on `main`, tell everyone to rebase | yes | no | no | no | no | no |
| talk to the user | yes | via lead | via lead | via lead | no | no |
| edit the enforcement layer | asks the user | no | no | no | no | no |

The findings board (`tools/finding.mjs`, incident I-013) is the one shared store that read-only roles
write to: a `bundle-mapper` or `fix-reviewer` posts a coupling, pitfall or technique it found (reviewers:
every pitfall that cost a review round) with its caller's topic in `--topics`. Nobody but the lead resolves
a finding or edits `fixes/FINDINGS.md`.

Where each fact lives (link, don't copy): hard rules, layout, fix commands, ports, locks, iPhone
lease, team conventions → `CLAUDE.md`. Deliverable format and per-fix done criteria →
[`README.md`](README.md) and [`_template/README.md`](_template/README.md). Topics, code locations,
conflicts, waves → [`TOPICS.md`](TOPICS.md). Per-topic steps and report format →
[`AGENT_PROMPT.md`](AGENT_PROMPT.md). The project loop, wave/project done criteria, landing →
[`LEAD.md`](LEAD.md). Unexpected problems → [`INCIDENTS.md`](INCIDENTS.md). Evidence →
`research/01-initial-investigation/` and `research/cpu-throttle-calibration/`.

## Why the lead coordinates incidents

A dedicated coordinator agent was considered and rejected:
- **Only the lead can act on a decision.** Teammates cannot spawn teammates, and the lead is fixed
  for the session (agent-teams "Limitations"). A coordinator teammate could only spawn foreground
  subagents (it would block while a toolsmith works) and could not land the fix on `main`, which
  happens in the main checkout. Every decision would go coordinator → lead → action: one more hop,
  no fewer steps for the lead.
- **Escalations end at the lead anyway.** Teammates' permission prompts appear in the lead's
  session, and only the lead talks to the user (finger tests, iPhone, approvals).
- **The expensive part is delegated anyway.** Triage is a short classification; reproduction and
  diagnosis are done by the toolsmith in its own context, and dedup and state are done by
  `tools/incident.mjs`, not by an agent's memory. The lead's context holds one line per incident.

Why the store and not the shared task list: the Task tools (`TaskCreate`, …) are off by default on
current models (Opus 5.5 among them) unless the session starts with `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`,
worktree subagents outside a team don't share a task list, and a task can't carry a dedup key, a
fix commit or a "your HEAD lacks the fix" check. Optional: with the Task tools on, the lead may mirror
an incident as a task so blocked tasks show dependencies; the store stays the source of truth.

## How spawning works (verified against the Claude Code docs, v2.1.286, 2026-10-01)

Sources: [sub-agents](https://code.claude.com/docs/en/sub-agents.md),
[agent-teams](https://code.claude.com/docs/en/agent-teams.md),
[model-config](https://code.claude.com/docs/en/model-config.md),
[worktrees](https://code.claude.com/docs/en/worktrees.md),
[tools-reference](https://code.claude.com/docs/en/tools-reference.md),
[hooks](https://code.claude.com/docs/en/hooks.md).

- **Subagents can nest.** A subagent whose tools include `Agent` can spawn subagents, up to **3
  layers below the main conversation** (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, default 3). At the
  limit the `Agent` tool is withheld. Lead → fix owner / integrator (layer 1) → mapper (layer 2)
  fits. The mapper, reviewer and toolsmith definitions leave `Agent` out, so they stay leaves.
  At most 20 subagents run at once per session (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`); teammates
  follow their own limits.
- **Teammates are different.** With agent teams on, an Agent call **from the main conversation**
  with a `name` and without `isolation` on the call becomes a teammate (an `isolation` value in the
  definition does not prevent that). Teammates **cannot spawn teammates** (no nested teams) but can
  spawn **subagents, which run in the foreground** (the teammate waits; `background: true` /
  `run_in_background` fail). A named call made by a subagent or teammate is an ordinary subagent.
  The docs don't say how teammate depth counts toward the nesting limit: keep helpers one level deep.
- **Messages and resuming.** `SendMessage` reaches teammates and named subagents by name (`main` is
  the lead). A running subagent takes a message from its launcher as a course correction; a
  **completed subagent is resumed** in the background by a message, with its full history (so a
  subagent that ended `BLOCKED on I-004` continues where it stopped); a subagent the user stopped
  with `x` is not. An in-process teammate that is no longer running is brought back by a message.
  Messages from agents never count as the user's approval.
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
  step 0 of every definition enters a worktree), `skills`, `permissionMode`, and `mcpServers` in-process.
  This is why the toolsmith and the integrator are spawned as worktree subagents: they keep their
  effort and get their worktree without a step 0.
- **Model** per subagent: aliases `fable`, `opus`, `sonnet`, `haiku`, a full ID, or `inherit`.
  Order: per-call `model` parameter → definition `model` → `CLAUDE_CODE_SUBAGENT_MODEL` → lead's
  model. A family alias equal to the lead's family resolves to the lead's exact model (incl. `[1m]`).
  `fable` is the most capable and may bill usage credits: per-call opt-in only.
- **Effort** per subagent comes **only from the definition's `effort`** (`low`, `medium`, `high`,
  `xhigh`, `max`; Opus/Sonnet 5.5 and Fable support all five, Haiku supports none). The Agent tool
  has no effort parameter, so a different effort means a different definition. `CLAUDE_CODE_EFFORT_LEVEL`
  overrides frontmatter. Opus 5.5 defaults to `medium`.
- **Worktrees:** `isolation: worktree` (definition or call) gives a subagent a fresh worktree from
  `HEAD` (`worktree.baseRef: "head"`; inside a worktree that is the worktree's `HEAD`) on branch
  `worktree-<name>`. It contains committed files only: **a helper in its own worktree would not see
  your uncommitted overlay**, so helpers run without isolation and get absolute paths. Worktrees
  without changes are removed automatically.
- **Hooks** from the project settings (the git guard) also fire inside subagents; their input
  carries `agent_id` and `agent_type`.
- **Loading:** `.claude/agents/` is watched only if it existed when the session started, and new or
  edited files are picked up within seconds after that. A session started before the directory
  existed must be restarted to see the definitions.
- **Validate** definitions with `claude plugin validate .claude/agents` (YAML only; it doesn't
  check field names, so compare keys with the list above).

## Model and effort per task

Measurements are serialized by the `chrome-measure` lock, so **only fix owners and the integrator
measure**; the toolsmith runs tests under the lock; helpers and reviewers never run Chrome, the
iPhone or the locks. Parallel helpers buy reading throughput, not measurement throughput.

| task | who does it | model / effort | why |
|---|---|---|---|
| Locate code, grep, summarize logs, `results.json`, research data | `bundle-mapper` with per-call `model: "haiku"` | haiku (effort n/a) | mechanical; the caller checks the refs anyway |
| Map a callback in the prettified bundle: DOM reads vs writes per frame, callers of `dE`, which CSS rules a property drives | `bundle-mapper` (default) | sonnet / medium | real comprehension of minified closures, but read-only and verifiable; much cheaper than opus |
| Web-platform lookups, WebKit vs Chrome behaviour (incident class `research`) | `bundle-mapper` | sonnet / medium | WebFetch + summary with sources |
| Design the fix, edit the overlay, decide what to measure next, interpret noisy A/B results | fix owner itself, never delegated | opus / high (definition) | needs the whole context; errors cost lock time |
| L-size or risky topics (cluster A engine, `morph-scrolljack-passive`, `hero-exit-scroll-timeline`) | fix owner | lead may pass `model: "fable"` per call | longest autonomous work; opt-in because of cost |
| Fix a tool bug (incident) | `toolsmith` | opus / high; `model: "sonnet"` per call for a small bug outside measurement code | everyone depends on the tools; measurement code decides A/B comparability |
| Combine a wave, judge interactions, write it up | `wave-integrator` | opus / high | conflict judgement and statistics across patches |
| Write the fix README | fix owner | (owner's) | the claims must come from whoever holds the evidence |
| Adversarial review of diff + results | `fix-reviewer`, spawned by the lead | opus / high | fresh context is the point; statistics and behaviour parity need depth |
| Review of a combined wave | `fix-reviewer` | opus / high, or `model: "fable"` | interactions between patches |
| Review of a measurement-code tool fix | `fix-reviewer` (tool mode) | opus / high | A/B comparability for every topic |
| Incident triage, landing, user contact | lead | the session's model/effort | — |

## Serena (optional, read-only)

How Serena is set up and its rules (read-only, rooted at the **main checkout** even for worktree
agents, path mapping to your overlay, 0-based lines, memories) are in the `CLAUDE.md` section
**"Serena (code navigation, read-only)"**. This section only says how to find it and when to use it.

- **Detect:** `ToolSearch` with query `+serena`. No `mcp__serena__*` tools → skip Serena and use
  `node tools/fix.mjs grep/show`. If present, call `mcp__serena__initial_instructions` first (the
  server asks for it), then `read_memory hot_code_map` for the verified symbol map. A missing
  Serena is an `env` incident only if it blocks you; `fix.mjs grep/show` usually suffices.
- **When it helps:** `find_declaration` on a call site (resolve `S`/`z`/`ce`-style aliases in one call) and
  `find_referencing_symbols` with a full name path (every hit with its enclosing function). **When it
  doesn't:** CSS, strings, custom properties, "every line that…", reading a function body, tooling flow: use
  `fix.mjs grep/show` or the Grep/Read tools (`research/code-navigation-benchmark/`).
- **Never** use Serena to edit or to write memories, even if such a tool is offered; findings go in
  `fixes/<topic>/README.md` or your report.
