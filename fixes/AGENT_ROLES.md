# Agent roles, delegation, model and effort

Who does what when several Claude Code agents work on `fixes/TOPICS.md` at once, how they spawn
helpers, and which model/effort each kind of task gets. Rules and mechanics live elsewhere; this
file links to them instead of repeating them.

## Roster

| role | definition | responsibility | spawned by, as | model / effort | tools (beyond Read/Grep/Glob) | writes |
|---|---|---|---|---|---|---|
| **lead** | none: the main session in the main checkout | plans waves, spawns everyone, **coordinates incidents**, relays finger tests to the user, reviews, lands on `main` (tool fixes first); turns repeated problems into tool fixes (devices: mgmt-devices watches, the lead fixes the cause) | the user | the session's; `/effort high` before spawning teammates (they inherit it) | everything; `SendMessage`, `Agent` | `main` (by fast-forward only), the incident store (triage) |
| **fix owner** | [`fix-owner`](../.claude/agents/fix-owner.md) | one topic or conflict cluster end to end: evidence, overlay patch, A/B, README | lead: teammate (clusters that must talk) or worktree subagent | opus / high; per call `fable` for L-size | Edit, Write, Bash, Agent, SendMessage, EnterWorktree, Monitor, TaskStop, Web*, Serena (read) | `fixes/<topic>/` on its branch; self-fixes of small tool bugs ([`INCIDENTS.md`](INCIDENTS.md) 1) |
| **toolsmith** | [`toolsmith`](../.claude/agents/toolsmith.md) | one incident in `tools/`/`tests/`: reproduce, failing test, fix, one `tools:` commit | lead, per incident: worktree subagent (`isolation` on the call), name `ts-i<nnn>` | opus / high; per call `sonnet` for a small non-measurement bug | Edit, Write, Bash, SendMessage, EnterWorktree, Monitor, TaskStop, Web*; no Agent | `tools/`, `tests/` on its branch |
| **wave integrator** | [`wave-integrator`](../.claude/agents/wave-integrator.md) | after a wave landed: `combine`, mechanical conflicts, combined A/B, interactions, iPhone confirmation, write-up | lead: worktree subagent, name `wave<N>` | opus / high | as fix owner | `fixes/all-wave<N>/`, `research/<nn>-wave<N>-results/` |
| **mapper / researcher** | [`bundle-mapper`](../.claude/agents/bundle-mapper.md) | read-only answers: bundle code, callers, DOM reads/writes, results data, web-platform questions (incident class `research`) | a fix owner or integrator (helper), or the lead; always without `name` | sonnet / medium; per call `haiku` for mechanical jobs | Bash (read-only use), WebFetch, WebSearch, Serena (read) | nothing |
| **reviewer** | [`fix-reviewer`](../.claude/agents/fix-reviewer.md) | adversarial review of a finished fix, a combined wave, or a measurement-code tool fix | lead, without `name` | opus / high; per call `fable` for a combined wave | Bash (read-only use), Serena (read) | nothing |
| **verifier** | none yet (proposed `claim-verifier`); today `general-purpose` + `model: "sonnet"` + the brief in "Verifier" below | checks one platform claim (or a batch) against references and returns a claim card: CONFIRMED / WEAKENED / REFUTED / UNRESOLVED + the decisive local check | the lead, mgmt-ops, an architecture agent or a fix owner whose card needs the claim; name `ver-<claim>` | sonnet / medium; opus / high when the claim decides a phone block or the source is subtle (layout/compositing internals) | Bash (read-only use), WebFetch, WebSearch, Serena (read) | its claim card, sent to the claim's owner + mgmt-ops; no commits |

Not separate agents, on purpose:
- **Incident coordinator = the lead**, backed by the shared store `tools/incident.mjs`. See
  "Why the lead coordinates incidents" below.
- **Device steward = `mgmt-devices` + the locks** (user T-149 #10, 2026-10-04 18:5xZ; was "the lead + the locks").
  `tools/lock.mjs` serializes Chrome measurements (FIFO `chrome-measure`) and the iPhone (`iphone` lease); a light
  agent (`mgmt-devices`, sonnet) watches both every minute and acts on an idle or stuck holder (Delegated authority
  below), because the lead, busy landing, noticed idle phones after the user did (18 alarms, 204 min on 10-04).
  The long-term fix is in the tools (`research/architecture/phone-hold-v2.md`, arch-phone-hold); the steward stays
  as the backstop. Talking to the user stays with the lead.
- **Researcher = `bundle-mapper`.** Web-platform and WebKit-vs-Chrome questions have the same shape
  as its code questions (read, cite, answer in ~60 lines); a second read-only definition would only
  differ in its prompt.
  The exception is the **verifier** (2026-10-01, after F-059): a mapper answers "what does the platform
  do", a verifier is handed a claim the team already relies on and must try to break it (versions, how our
  own probe could have produced the result) and return a status. Same tools, different stance and output,
  so it gets its own name and brief ("Verifier" below), not a new permission set.

## Who may do what

| action | lead | fix owner | toolsmith | integrator | mapper | reviewer |
|---|---|---|---|---|---|---|
| work in the main checkout | yes (only one) | no | no | no | read only | read only |
| edit an overlay (`fixes/<t>/overlay/`) | no | own topic | no | `all-wave<N>` | no | no |
| edit `tools/`, `tests/` | own infra worktree only | small self-fix (INCIDENTS 1) | yes: its incident | no (report an incident) | no | no |
| commit | landing only | own branch | own branch | own branch | no | no |
| measure (`fix.mjs ab`, `verify.mjs`, `test:chrome`) | noise floor (A/A) | yes | tests only | yes | no | no |
| tests before a commit (I-021) | full `npm test` when landing tooling; else `test:unit` | `npm run test:unit`; full `npm test` only for a self-fix | full `npm test` | `npm run test:unit` | none | none; `node tools/scope.mjs --dir <wt>` as a check |
| `iphone` lease | yes | yes | no | yes | no | no |
| spawn helpers | teammates and subagents | foreground (teammate) / nested subagents | no | subagents | no | no |
| open an incident | yes | yes | yes (a second bug) | yes | via its caller | via its caller |
| triage, dispatch, resolve an incident | yes | claim a self-fix only | notes only | no | no | no |
| post, ack a finding (`finding.mjs post`, `ack`) | yes | yes | yes | yes | yes | yes |
| fold (`digest`) and resolve a finding | yes | no | no | no | no | no |
| land on `main`, tell everyone to rebase | yes | no | no | no | no | no |
| talk to the user | yes | via lead | via lead | via lead | no | no |
| edit the enforcement layer | asks the user | no | no | no | no | no |

### Delegated authority (user T-134 #11, 2026-10-04 14:5xZ; lead decision)

Each role decides these itself, without asking the lead, and reports them in its status row or its digest:

| role | decides itself |
|---|---|
| fix owner | its next probe, build or measurement inside its topic and protocol v2; asks mgmt-ops directly for card reads; posts its own proposal (`proposal revise`, `phone`) and answers the user in its own topic threads; takes the iPhone only when its hold can start at once and releases it as soon as it stops using it (incident I-155) |
| mgmt-desk (deputy lead) | queue order inside the board's priority order (`lock.mjs repair <lock> --move <owner> --to N`, `--reason`); releases a lease idle > 5 min with waiters after one nudge to its holder (and `user-try` on the user's "done"); corrects stale status rows; opens incidents, sets P2/P3, dispatches them to a running toolsmith; wakes parked owners within the cache rule |
| mgmt-devices (device steward) | every minute `idle.mjs check --phone-min 2`; on an idle or stuck holder reads its processes (`ps`, its board row) and sends it one exact correction; the desk's lock powers: moves inside the board's priority order at any time (R4 below), and after the nudge and 3 min with no reaction releases an idle lease with waiters (`--reason`); opens or joins incidents for tool causes; owns the **long-term fix** too (user T-149 #12): investigates the cause, opens or joins the incident with the fix plan, hands it to a running toolsmith (or asks the lead for a spawn in one line), follows it to landing, and owns the device design (`research/architecture/phone-hold-v2.md`); **plans the devices ahead** (user T-159 #12, lead decision 2026-10-04 21:1xZ, I-182): keeps a rolling 3 h device plan on the board (row `device-plan`: per device who holds, who is next, what each next job waits on, startable yes/no, ETA), and when a device has been free 2 min or its holder's `until` is within 10 min sends the lead ONE line naming the next startable job in the lead's order (DIRECTION); may ask owners to pre-stage a slot (build, hashes, warm-up, cooling gate) and fix owners whose next step names the phone whether the phone part can start before their Simulator step; **may tell iphone-runner "go" (a nudge, never a signature) only when** the ticket is signed, its arms are hashed and it is arm-neutral, it is the top one in the lead's order, no user phone step is open, and the same "go" line goes to the lead (the lead can veto at any time); never signs a ticket, ranks the queue or reorders a block; reports phone and Chrome busy % and minutes free with startable work per 3 h window to the lead; reports the pattern (cause, minutes, fix, owner) to the lead from the 3rd idle period a day. **First tier for device threads** (user T-155 #4, 2026-10-04 19:49Z): idle-alarm, stuck-holder and other phone/Mac-lock threads are assigned to mgmt-devices first and the lead second, never to worker agents; mgmt-devices gets the holder's facts by SendMessage (the worker does not reply in the thread), answers the user there in the answer format, and escalates to the lead (`thread escalate`) only what needs the lead (a spawn, a rule, a user decision). Never runs Chrome, the phone or tests, never kills a process; posts to the user only in device threads. **Exit:** the lead measures both (idle-with-waiters minutes per 3 h window, and lead device interventions); when two windows in a row are ≤ 2 min idle-with-waiters (user-Start waits excluded) and need no lead action, mgmt-devices parks gracefully and the tools carry it |
| mgmt-ops | tickets phone blocks and sets their order within the priorities; signs pre-data and second reads; signs I, F and V cards (the lead still signs D) |
| toolsmith | rebases its own branch on the current `main` tip and runs the full `npm test` on exactly that commit; when `main` has not moved, the lead lands it without re-running the suite |
| lead | **the issue loop first** (user T-154 #11): every issue the user raises gets cause, which cases, a workaround now and a long-term fix with an owner, all four in the first answer (memory `lead-owns-issue-loop`, LEAD.md "The issue loop"); priorities, landing, the user's proposal decisions, spawns, other lock repairs, rule changes, the enforcement layer; **area owners** (user T-149 #14): a problem that repeats in one area gets an owner agent that investigates, owns the long-term fix and delegates it; the lead only measures the area (one or two numbers, an exit target), reports the trend to the user and parks the owner when the tools carry it (memory `lead-delegates-areas-measures`; first: mgmt-devices); and the **inspection**: at every check-in, from the board and each agent's last activity, find a stale row or an agent waiting on nobody and send it one correction line; idle leases and holds are mgmt-devices' (the lead is the **second tier** in device threads: it answers there only on mgmt-devices' escalation or when mgmt-devices is parked; the lead reads its pattern reports and owns the long-term tool fix: a repeated cause gets a design and a toolsmith, not more nudges, memory `idle-alarms-are-a-pattern`) |

**Every problem the user reports, any role (user T-140 #7):** whoever owns the thread does both halves without
asking the lead: (1) the **workaround** now, inside its own powers (a note, a status-row fix, a re-run, a queue move
for the desk), told to the user in the thread; (2) the **long-term fix**: finds the cause, opens or joins an incident
with the cause and the fix plan, and sends it to the toolsmith that owns that tool (a running one, or a parked one
woken within the cache rule). Only a fix that needs a new agent, or more than ~30 min of agent time, goes to the
lead, as one line with the plan. The thread owner posts in the thread when the fix lands. It also sends the lead
one FYI line per workaround (thread, what was wrong, workaround, long-term fix and its owner; user T-140 #10), so
the lead knows what changed; the lead answers only if it disagrees.

Hard rules are unchanged: only the lead lands on `main` and works in the main checkout.

### Proactive by default (user T-160 #7, 2026-10-04 ~21:30Z; evidence: `research/management/roles-v3-proactive.md`)

The user wants no reactive agents. These rules beat any older line that makes an agent wait for an order:
- **R1 Pull the next step.** A finished step's next step inside your topic needs nobody's OK: take it. Park only when
  no next step is left. `resume-on decision:lead` only for the lead's own decisions (sign D or a ticket, land, rank,
  spawn, a rule, a user decision); otherwise name the agent, lock or landing you wait on.
- **R2 Results go to their consumers, not through the lead.** Send each result at once to: the best-build integrator
  (today `int-v8`) for anything that enters the build; mgmt-ops for card reads; mgmt-devices when it changes what a
  device can start next; the owners of topics whose code it touches. The lead gets one FYI line, not a relay job.
- **R3 Pre-stage while you wait.** While a step waits on a lock, a device or a peer, prepare the step after it. A
  phone ticket goes to ops only complete: arms built and hashed, `serve.sh`, `hold.sh`, scorer plus self-test, P-id
  requested, coverage (y range, driver) and an order line.
- **R4 The queue is mgmt-devices'.** It keeps chrome-measure in board-priority order at any time, no 3-min wait
  (tool: I-171); the lead moves only to break a tie or on a user request. Long-term the queue follows board priority
  by itself (I-185).
- **R5 One owner per row and per answer.** Every agent creates its own board row at spawn (`--owner` itself) and
  closes it. In a thread with several assignees, the question's owner answers: priority, ranking, signing, landing,
  rules → lead; devices → mgmt-devices; a topic → its owner. The others stay silent unless the owner asks them.
- **R6 The `direction` row.** The lead keeps one board row, `direction`: the order of the day, the next decisions and
  who unblocks what. Read it before asking the lead what to do next.
- **R7 The lead's loop is proactive.** Every check-in, in order: rows waiting on the lead, idle devices, unanswered
  user messages, land requests; each decision asked of the lead gets an answer or a named delegate in that check-in.
- **R9 mgmt-devices decides device work itself** (user T-161 #7, 2026-10-04 21:29Z: "if you found the improvement
  you could delegate by yourself, proactively, and just report what you did to the lead; no need for the lead to decide").
  Without asking the lead: it starts the next phone or Mac slot in the direction order (a phone no-worse ticket that
  mgmt-ops validated, with arms hashed and served-checked, gets mgmt-devices' start in place of the lead's signature;
  a D (attribution) card is still signed by the lead); it moves the chrome-measure queue; it briefs and hands device or
  lock incidents to a running toolsmith, or asks the lead for a spawn in one line; it changes its own device plan. It
  reports each action to the lead as one FYI line (what, why, owner). The lead keeps the order of the day (the
  `direction` row), landing and user-facing decisions outside devices.
- **R8 (pending the user's OK; Hard rules 1/5)** mgmt-ops lands docs-only commits with the lead's checks. Until
  the user says yes, only the lead lands.

The **verifier** has the mapper's column (read only, posts and acks findings, commits nothing, never measures,
never holds a lock or the iPhone), plus one duty: it sends each REFUTED or WEAKENED verdict to the claim's
owner and mgmt-ops at once, CC the lead when the claim reached the user.

**Tooling roles vs the rest (I-021).** Only the toolsmith changes tooling (`tools/`, `tests/`,
`package.json`, `.githooks/`, `.claude/` except `.claude/agents/`), plus a fix owner's section 1
self-fix in its own commit; they run the full `npm test`. Every other role, including those outside
this table (bench authors, the architecture team in [`ARCH_TEAM.md`](ARCH_TEAM.md), management
agents), never does, and runs `npm run test:unit` before a commit: its scope guard fails, naming the
files, if the branch touched tooling anyway. Details and the lane rule: `CLAUDE.md` "Tooling is
guarded by tests".

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

## Automated threads: who answers (lead's routing map, user T-155 #4/#5, 2026-10-04 19:5xZ)

The tools open some console threads by themselves (posted as the lead). The lead defines who answers each kind;
**worker agents are never assignees** of these threads (they are busy; the first tier gets their facts by SendMessage
and nudges them there). The lead sees every thread anyway and is always the second tier.

| automated thread (tool) | first tier: answers the user, acts | second tier | when the first tier is parked |
|---|---|---|---|
| idle phone or Mac lock (`idle.mjs watch`, I-105) | mgmt-devices (nudge, move, release by its powers above) | lead (spawns, rules, user decisions) | lead |
| stuck console step (`lib/step-alarm.mjs`, I-123) | mgmt-devices (messages the step's runner) | lead | lead |
| disk nearly full (`lib/space-watch.mjs`, I-124) | mgmt-devices (asks the owners of the big out/ folders to prune) | lead | lead |
| a new kind of automated thread | the lead names its first tier here before the tool ships | lead | lead |

Tool side: I-175 (the three alarms address the first tier and the lead only, read from one setting the lead keeps,
not the holder or the waiters). Until it lands the lead re-assigns such threads by hand (`thread assign --remove`).

## Status board: who reports what

User request 2026-10-02: one live status per workstream (priority, state, what it waits on). Tool: `tools/status.mjs`;
page: the console's Status tab (`/status`); design: `research/architecture/status-board.md`. Store:
`.git/fastwork-mirror/status/` (shared by every worktree, local only).

| who | reports | how |
|---|---|---|
| fix owner, wave integrator, toolsmith, de-/arch- agents | their own workstream, at every state change, when a wait starts or ends, and on resume | `status.mjs set <id> --by <you> --state … --note "<plain line>" [--next …] [--waiting-on …]`; `status.mjs mine --by <you>` on resume |
| reviewer | its review item: `reviewing` at start, `done` with the verdict | the same; the one write a reviewer makes (store only, no commit) |
| mgmt-ops | the ops item; seeds new workstreams; nudges owners of items flagged "not updated" (2 h); may correct an item for an owner who ended | `status.mjs set … --by mgmt-ops-N`; `status.mjs list` replaces the hand-written "Who waits on what" table |
| lead | priority only (1 = first, ties allowed, `none` clears) | `status.mjs priority <id> <n> --by lead`; anyone else is refused |
| bundle-mapper, verifiers | nothing (the spawning owner reports) | – |

- States: queued, researching, designing, implementing, testing, measuring, reviewing, coordinating, waiting (needs
  `--waiting-on`), ready-to-land (waits on the lead), parked, landed, done, dropped. Plain words for each are on the page.
- The board derives what it can see by itself and shows it beside the owner's report: the Chrome/phone queue place
  ("#2 of 3"), holding a lock, the owner's pending console steps ("waiting on you"), blocking incidents naming the
  owner. Owner names are matched against the lock owner and the step author; work that queues under another name
  adds it once with `--alias <name>`.
- Fix workstreams reuse their `fixes/PROGRESS.json` item id and link it with `--progress <id>`; PROGRESS stays the
  curated results summary, the board the live state (each Progress card shows the linked live state).
- Hard rule 12: no URL, LAN address, e-mail, device id or home path in any field (refused).

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
- **Addresses and peer work (lead decision 2026-10-01 10:35Z, F-046).** In this setup a spawned agent
  may have **no registered name**: a role name ("de-safari") resolves only if `ListAgents` shows it,
  otherwise use the agent ID (`a…`). All four "No agent named X is reachable" failures on 2026-10-01
  were such role names; tail latency (up to 26 min) came from recipients blocked in long foreground
  commands. Rules:
  1. **Every spawn prompt includes the peer directory** (name or ID, what each owns, alive or stopped;
     the live copy is in `research/management/ops-handover.md` and F-046), so the agent can message peers
     directly.
  2. **Message the peer who owns the question directly**, not through the lead. mgmt-ops is the hub for
     everything that is not a lead-only decision (queue and priority calls, routing results, rebase gos);
     the lead only lands, resolves incidents, reorders locks, spawns and talks to the user.
  3. **If a name fails, use the ID** from the directory or `ListAgents`; never drop the message.
  4. **Long waits run in the background** (lock queues, holds, `incident.mjs wait`, phone recordings), so
     messages reach the agent mid-wait, each as **one command that exits by itself**, never a hand-made
     `sleep`/`until`/retry loop (`CLAUDE.md` "Agent communication"): your turn on a lock with `lock.mjs run`
     or `acquire … --wait` (the iPhone too: `lock.mjs acquire iphone --owner <you> --ttl 900 --url <u> --wait 3600`,
     FIFO, exit 3 keeps your place), a lock state read-only with `lock.mjs wait <res> --until …`, a log line,
     server, URL, commit or pid with `wait.mjs`. Send peers what they need before the final report, which goes
     only to the spawner.
  5. **Every spawn gets `name: <role>-<topic>`**: `fix-<topic>`, `ts-<incident or topic>`,
     `review-<topic>`, `de-<area>`, `arch-<topic>`, `mgmt-ops-<N>`. Names are **unique per session**: a
     reused name re-resolves to the newest agent (two such refusals on 2026-10-01), so pick a fresh one.
  6. **Report your branch from your own worktree** (`git branch --show-current` there), never from the
     git status in your context: every subagent inherits the session's starting git status, which names
     another agent's branch (de-apple and arch-safari reported iphone-runner's branch on 2026-10-01).
  7. **Assigned a console thread (T-nnn):** keep ONE Claude Code `Monitor` on `node tools/console.mjs thread wait --as <you>
     --monitor --timeout 86400` (I-147: one `WAKE <kind> <id>` line per wake, never filter its lines); reply with `thread reply T-nnn --by <you> --text "…"` (`--ask` when you need the user's
     answer, `--file` for long text) in plain words for the user; close with `thread close T-nnn --by <you> --note
     "…"` once answered. Never paste the user's thread text into commits or findings unscrubbed.
  8. **Design engineers post a PoC to the user as a proposal** (ts-proposals, `research/architecture/console-proposals.md`
     §7): `node tools/console.mjs proposal post --by <you> --file out/proposal-<slug>.json` with screenshot pairs at
     matching scroll positions (localhost pages in Chrome, 430x932) and an honest `visualDiff`; arm `proposal wait <id>
     --until decided` in the background, then re-arm the printed `--until changed --since …` line (the user may undo or
     change a decision, I-045); on `changes-requested` revise with `proposal revise <id> --note …`; never land
     a PoC the user has not accepted. Look-alikes must be pixel-identical to the user (frame sequences / video welcome).
     A `changes-requested` decision is the spec for the next revision of the SAME proposal (user, T-006, PR-001 lesson):
     read it in full (`proposal show <id>`; list views truncate notes), relay it verbatim, answer it with `proposal revise
     <id>` quoting the request in the first lines and answering each point. Arms the user didn't ask for go only into an
     "also tried, not chosen" section, never as new proposals.
  - **Why agents went unnamed (verified by the lead, 10:3xZ):** after a context compaction the lead's
    Agent schema no longer listed `name`, but the tool still accepts it (a probe spawn registered as
    "probe-name"). The agent type is not the blocker: named general-purpose agents message each other
    fine.
  - **Why every agent is general-purpose:** the project types in `.claude/agents/` landed (2026-09-30
    20:20Z) after the lead session started (17:05Z), and agent types load only at session start.
    Workaround in this session: `general-purpose` + `name` + the role's model + "read
    `.claude/agents/<role>.md` first" in the prompt. Long term, a fresh lead session loads the real types
    (the user's decision).
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
iPhone or the locks. Parallel helpers buy reading throughput, not measurement throughput. Jobs that time nothing
(`npm test`, `fix.mjs check`, `bench mech`, `test:chrome:fn`, `sim.mjs session --functional`) share the lock in
the shared lane (`CLAUDE.md` "Shared devices"), so up to three agents' checks run at once; timing still runs alone.

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
| Check a platform claim against spec, docs, engine source, bug trackers | verifier `ver-<claim>` | sonnet / medium; opus / high when it decides a phone block | read and cite; the stance (try to break it, check versions and our probe) matters more than depth |
| Review of a combined wave | `fix-reviewer` | opus / high, or `model: "fable"` | interactions between patches |
| Review of a measurement-code tool fix | `fix-reviewer` (tool mode) | opus / high | A/B comparability for every topic |
| Incident triage, landing, user contact | lead | the session's model/effort | — |

## Verifier (`ver-<claim>`): platform claims against references

Why: on 2026-10-01 a probe result ("LayerTree.layerPainted never fires on Chrome 154", F-059) became a protocol rule,
a tool design and a statement to the user before anyone read a reference. CLAUDE.md "Platform claims: confirm
against a reference" sets the rule; this is the role that does the checking. The audit and its history:
[`research/architecture/claims-audit.md`](../research/architecture/claims-audit.md).

- **What counts as a platform claim:** any statement about what a browser, engine, OS or device does (cost,
  invalidation, threading, event timing, what a CDP/Web Inspector record means, tool overhead, the Mac's display
  state, the CPU-throttle equivalence). Not: what our code does (that is read from the bundle).
- **Who spawns:** the claim's owner (fix owner, de-/arch- author) as soon as a card, prediction or ticket leans on
  an OBSERVED claim; mgmt-ops when a slot ticket does; the lead when a D signature or a user report would. One
  verifier per claim or per batch of 3-6 claims of one subsystem; at most 3 at once per spawner.
- **Model / effort:** sonnet / medium by default. Opus / high when the verdict decides a phone block or the source
  path is long (WebKit layout/compositing invalidation, Chromium compositor/CDP agents).
- **Read-only:** no Chrome, no iPhone, no locks, no commits, no repo edits. Web research carries no personal data
  (Hard rule 12). Scratch: `<scratchpad>/<spawner-topic>/ver-<claim>/`.
- **Plan, then execute.** First a 5-10 line plan per claim: which spec/docs/source files/bugs, and **how our own
  probe could have produced the result another way** (event not enabled, wrong target, coalescing, a cap, the
  wrong version); sent to the spawner (who forwards to the claim's owner), then executed.
- **References, in order of weight:** spec; vendor docs (CDP, MDN, WebKit/Chromium blogs, release notes, Web
  Inspector docs); engine source with its history (github.com/WebKit/WebKit, source.chromium.org; say when the
  code landed so it is known whether **iOS 26.6.1 / Chrome 154** have it: `main` alone is not the device); bug
  trackers (bugs.webkit.org, issues.chromium.org). Cite URL + line/commit/milestone.
- **Output:** one claim card per claim ([`_template/CARDS.md`](_template/CARDS.md) "Claim card"): verdict
  CONFIRMED / WEAKENED (which part stands) / REFUTED / UNRESOLVED, the version it applies to, the references, how
  our probe could mislead, the decisive local check when references are silent (a Chrome counts-only short-lane
  probe run by the topic owner, or a phone ticket through mgmt-ops), and what depends on it.
- **Where it sits in R → I → D → F → V → L:** claims are born in I (hypotheses) and in desk research; the verifier
  runs **in parallel with I and D**, never blocking a measurement that is already ticketed. Its verdict is due
  **before the lead signs D** (`LEAD.md` "Stages and gates": no NAMED on an OBSERVED claim) and before a
  prediction card uses the claim as a constant in F. V: `fix-reviewer` checks the card's "Platform claims relied
  on" table like any other evidence. A verdict that lands after D re-opens D only if it is REFUTED or WEAKENED in
  the part the mechanism uses.
- **Findings board:** until the board has a status field (toolsmith spec in the audit), a finding that states a
  platform claim begins its title with the status (`[OBSERVED]`, `[CONFIRMED]`), and the verifier posts the
  verdict as a new finding that names the old id ("Correction to F-nnn" / "Confirms F-nnn").

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
