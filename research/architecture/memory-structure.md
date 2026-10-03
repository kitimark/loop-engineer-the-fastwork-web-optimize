# Agent memory in the project: inventory and one proposed structure

arch-memory, 2026-10-03, for console T-032 #3/#4. **Proposal only: nothing has moved.** The lead posts it to the user,
and the notes move only after the user's OK.
**Update 2026-10-03:** the user approved 5.1 and 5.3 (T-032 #7). Move-plan step 1 is done on this branch: `memory/` (index + 15
notes generated from section 7), the CLAUDE.md section and Layout row, and the Serena pointers. Steps 2-3 are the lead's.

## 1. What Claude Code loads, and for whom (docs checked 2026-10-03)

| mechanism | who loads it | cost | status |
|---|---|---|---|
| `CLAUDE.md` and its `@path` imports | lead, every subagent (worktree subagents take the **main conversation's** files, not their worktree's), every teammate | everything at launch; "imports … don't reduce its context cost" | CONFIRMED: [memory](https://code.claude.com/docs/en/memory) "Import additional files", [sub-agents](https://code.claude.com/docs/en/sub-agents) "What loads at startup", [worktrees](https://code.claude.com/docs/en/worktrees) "Isolate subagents with worktrees", [agent-teams](https://code.claude.com/docs/en/agent-teams) "Context and communication" |
| auto memory `~/.claude/projects/<repo>/memory/` | the lead: first 200 lines / 25 KB of `MEMORY.md`; topic files only on demand | ~2.5 KB today | CONFIRMED: memory "Auto memory". Machine-local, one dir per repo, shared by all worktrees |
| … same, in subagents | docs: "The main conversation's auto memory isn't loaded into subagents" (forks excepted) | – | CONFIRMED by docs, **but OBSERVED otherwise in our setup**: this worktree subagent's context holds the lead's `MEMORY.md` index (2026-10-03). Topic files never arrive. Cause unknown |
| … same, in teammates | docs list "CLAUDE.md, MCP servers, and skills"; silent on auto memory | – | UNRESOLVED. Decisive check: ask a fresh teammate whether a `MEMORY.md` block is in its context |
| subagent `memory:` frontmatter | that agent type: `.claude/agent-memory/<name>/` (project), `-local/`, or `~/.claude/agent-memory/` (user) | first 200 lines / 25 KB of its `MEMORY.md` | CONFIRMED: sub-agents "Enable persistent memory". It also "automatically enable[s]" Read, Write and Edit |
| `.claude/rules/*.md` (optional `paths:`) | everyone; path-scoped rules only when a matching file is read/edited | per rule | CONFIRMED: memory "Organize rules" |
| `autoMemoryDirectory` | moves the auto-memory dir; absolute path; any settings file | – | CONFIRMED: [settings-reference](https://code.claude.com/docs/en/settings-reference) |

Upshot: **today the 15 lead notes reach only the lead**, and only as one index line each. The rules in them
("no camera", "user steps first", "Simulator for non-timing jobs", …) are invisible to the agents that break them,
unless a spawn prompt repeats them. The only channel that reaches every agent is `CLAUDE.md` plus its imports.

## 2. Inventory

Proposed home `memory/` is a new top-level directory (section 3). "All" = imported index, so every agent loads it.

| item | kind | proposed home | how agents load it |
|---|---|---|---|
| 12 lead notes for everyone: console-step-wait-yourself, defer-timing-focus-call-tree, illusion-must-be-pixel-identical, keep-awake-only-during-measurements, no-camera-access, no-phone-steps-during-blocks, perception-tests-touch-ab, proposal-decision-is-the-spec, simulator-for-non-perf-phone-jobs, user-steps-first, user-tasks-via-console, verify-platform-claims | user rule / feedback (one `project`: defer-timing) | `memory/<same-name>.md` | All: index line via `@memory/README.md` in CLAUDE.md; the note itself on demand (Read) |
| 3 lead-only notes: agent-spawn-names, console-server-detached, usage-meter-every-30-min | lead operating rule | `memory/<same-name>.md`, under "Lead" in the index | same import (3 lines for everyone, cheap); the lead acts on them |
| `MEMORY.md` (auto-memory index) | Claude Code's own index | **stays outside**, rewritten as a 3-line pointer (section 4) | the lead, automatically |
| usage data (`.git/fastwork-mirror/usage/`) | account usage numbers | **stays local** | the meter tool |
| Serena memories `.serena/memories/` (tracked) | code-navigation reference | stay where they are: Serena's `read_memory` reads only there | on demand via `read_memory`; `serena_usage`, `hot_code_map` are fine. **`rules.md` and `project_overview.md` are stale**: both still say `site/`, `site-pretty/` are gitignored and never committed, which the 2026-10-01 snapshot decision reversed. Proposal: replace both bodies with a 3-line pointer to CLAUDE.md (diff in 5.3; rule 11 makes this the user's call) |
| findings board `.git/fastwork-mirror/findings/` + `fixes/FINDINGS.md` | cross-agent technique/pitfall memory | unchanged: live board local, committed digest in `fixes/FINDINGS.md` | CLAUDE.md tells every agent to read both |
| console threads/steps store `.git/fastwork-mirror/console/` | user's own words, LAN URLs | **stays local** (Hard rule 12) | `console.mjs` |
| status board, incidents, locks, waits, sim, wda stores | live operational state, not memory | stay local | their tools |
| `research/management/ops-handover.md` (177 KB), `fixes/PROGRESS.json`, `fixes/LEAD.md`, `fixes/DIRECTION.md` | role memory of mgmt-ops / the lead; already in git | unchanged; they should **link** to `memory/` notes instead of restating user rules (ops-handover repeats several) | read on demand by their role |
| `CLAUDE.md`, `.claude/agents/*.md`, `fixes/AGENT_ROLES.md` | rules and role definitions | unchanged except the import (5.1) | CLAUDE.md: all; agent body: that role |
| per-agent memory dirs, `memory:` frontmatter | – | **none exist** (`.claude/agent-memory*`, `~/.claude/agent-memory` absent; no agent sets `memory:`). Proposal: don't add them (section 3) | – |
| `~/.claude/CLAUDE.md` (empty), `~/.claude/agents/code-reviewer.md` | user-level, all projects | stay outside: not this project's | – |
| `.claude/settings.local.json` (main checkout, gitignored) | personal permissions | stays local | Claude Code |
| session transcripts | raw history | stay outside (personal, huge) | – |

Two defects found: both `agent-spawn-names` and `verify-platform-claims` link `[[lead-delegated-mode]]`, a note that
does not exist anywhere (auto-memory dir or repo). The drafts drop the link; the lead may say if it should be rewritten.

## 3. The structure (one proposal)

```
memory/
  README.md                         index, <= 40 lines (~3 KB): "Every agent" and "Lead" sections,
                                    one line per note; imported by CLAUDE.md
  agent-spawn-names.md              one note per rule: front matter (name, description, type,
  console-server-detached.md        since/updated dates), the rule, Why, How to apply,
  ...                               dated history; scrubbed (Hard rule 12)
```

- **Why a top-level `memory/`:** not under `.claude/` (the scope guard counts `.claude/` except `agents/` as tooling,
  so every non-tooling role would fail `npm run test:unit` on it); not under `fixes/` (its subdirs are topics); not
  `research/` (findings, not standing rules). Plain markdown, no tool change, no enforcement-layer change.
- **Loading:** one `@memory/README.md` import in CLAUDE.md (diff 5.1). Index for everyone at launch; notes on demand.
- **Writing:** only the lead (in the main checkout, committed on `main` like other lead docs) adds or edits a note,
  scrubbed. Other agents propose a note to the lead (SendMessage), as with findings.
- **Not chosen, and why:**
  - `autoMemoryDirectory` pointed at `memory/`: Claude Code then writes notes straight into the repo **unscrubbed**
    (verbatim user quotes, session ids in front matter), needs an absolute home path in a settings file (rule 12;
    `.claude/settings*` asks the user), and the lead would load the index twice (auto + import).
  - `memory:` frontmatter per role: auto-enables Write/Edit on read-only roles (mapper, reviewer), lives under
    `.claude/agent-memory/` (scope guard: tooling), and parallel owners in separate worktrees would each write their
    own branch copy (where `project` scope resolves in a worktree is UNRESOLVED in the docs). The findings board
    already does cross-agent learning with dedup and a lead digest.
  - `.claude/rules/`: same scope-guard problem; path scoping buys nothing for process rules.
  - Inlining the notes into CLAUDE.md: +~20 KB on a file already 585 lines / 51 KB (docs target: under 200 lines).

## 4. What stays outside the repo, and why

- **The auto-memory dir itself** (Claude Code owns it; it is loaded automatically). After the move, `MEMORY.md`
  becomes a pointer and the 15 topic files are deleted (after the move lands and `/context` shows the import):
  ```
  - All project memory lives in the repo: memory/README.md (imported by CLAUDE.md, loaded by every agent).
  - Save new notes there, scrubbed (Hard rule 12), committed on main by the lead. Never save here.
  - If Claude Code saved a note here anyway, move it to memory/ at the next check-in.
  ```
  Optional later, if stray saves keep appearing: `"autoMemoryEnabled": false` in `.claude/settings.local.json`
  (local, the user's OK). Not proposed now: the pointer is the cheaper fix.
- **Local stores in the shared git dir** (console, usage, status, incidents, locks, findings board): the user's own
  words, LAN URLs and account usage must stay on this machine (Hard rule 12); the rest is live state, not memory.
- **Transcripts and user-level config** (`~/.claude/`): personal, all-project scope.

## 5. Proposed diffs (for the user's OK; not applied)

### 5.1 CLAUDE.md (after the Layout table)

```diff
+## Project memory: user rules and lessons
+
+Standing user rules and the lessons behind them live in `memory/`, one note per rule with its dated history.
+The index below is loaded for every agent; open the note before you act in its area. Only the lead adds or
+edits notes (scrubbed, Hard rule 12); send the lead what should be remembered.
+
+@memory/README.md
```
and one Layout row: `| (e) project memory | memory/ (README index + one note per user rule) | yes | the lead |`.
Context: about +3.3 KB for every agent (CLAUDE.md 51 KB → ~54 KB, +6 %); for the lead roughly net zero, because
`MEMORY.md` shrinks from 2.5 KB to ~0.3 KB.

### 5.2 `memory/README.md` (draft, ~3 KB)

```
# Project memory (index; imported by CLAUDE.md)

Every agent:
- [Verify platform claims](verify-platform-claims.md): probe-found browser behaviour stays OBSERVED until a doc, source or bug confirms it; rule text in CLAUDE.md "Platform claims"
- [User tasks via console](user-tasks-via-console.md): user steps go into the local console (Start, answer, next), never relayed through the lead's chat
- [Console steps: wait yourself](console-step-wait-yourself.md): post a step, arm `console.mjs wait <id>` in its own background call in the same turn
- [User steps first](user-steps-first.md): a posted user step takes the phone next; no cooling or Mac-quiet gate on it
- [No phone steps during blocks](no-phone-steps-during-blocks.md): never ask the user to touch the iPhone while a timed block runs
- [Perception tests: touch A/B](perception-tests-touch-ab.md): the user judges lag by finger-following; blind swipe A/B, not watched clips
- [Simulator for non-timing phone jobs](simulator-for-non-perf-phone-jobs.md): no timing or perception number needed, use the Simulator
- [Defer timing; call tree + layout](defer-timing-focus-call-tree.md): no timing A/Bs or phone gain blocks except the listed exceptions
- [Illusions must be pixel-identical](illusion-must-be-pixel-identical.md): look-alike fixes may not change the visual (PR-001 exception)
- [Proposal decision is the spec](proposal-decision-is-the-spec.md): changes-requested means rev N+1 of the same proposal, every point answered
- [No camera access](no-camera-access.md): never open a Mac camera; screen recording only via `ioscap.mjs`
- [Keep awake only during measurements](keep-awake-only-during-measurements.md): `caffeinate -i -s` inside measurement holds only

Lead:
- [Agent spawn names](agent-spawn-names.md): every spawn gets `name: <role>-<topic>`; check the first spawn after each compaction
- [Console server detached](console-server-detached.md): run `console.mjs serve` with nohup; check `console.mjs url` each check-in
- [Usage meter every 30 min](usage-meter-every-30-min.md): re-create the 30-min cron each session; data stays local
```

### 5.3 Serena memories (rule 11: the user's call)

Replace the bodies of `.serena/memories/rules.md` and `project_overview.md` with a pointer, so they cannot drift again:
```
This summary went stale (it said site/ and site-pretty/ are gitignored; they are the committed snapshot since
2026-10-01). Read CLAUDE.md ("Hard rules", "Layout", "Baseline snapshot") instead; for Serena itself see
serena_usage, for code locations hot_code_map.
```

## 6. Move plan (after the user's OK)

1. arch-memory, on its branch: write `memory/README.md` and the 15 notes from the drafts in section 7; apply 5.1 if
   the user approved it; `npm run test:unit`; commit; land request to the lead.
2. The lead lands; checks with `/context` that `memory/README.md` is listed under memory files.
3. The lead rewrites the auto-memory `MEMORY.md` to the pointer (section 4) and deletes the 15 topic files there.
4. Separately, if approved: 5.3 (Serena), and ops-handover/LEAD.md replace restated user rules with links.

## 7. Scrubbed drafts of the 15 lead notes

Scrubbing applied to all: no session ids, no names, no device names, no LAN addresses, no account usage figures;
user quotes paraphrased (the user's words stay in the local console store); local-time stamps converted to UTC;
broken `[[lead-delegated-mode]]` links dropped; wiki links turned into relative links. Front matter for each file:
`name`, `description`, `type` (feedback/project), `since`, `updated`.

### agent-spawn-names.md (Lead; feedback; since 2026-10-01, updated 2026-10-03)

**Rule.** Pass `name: "<role>-<topic>"` (e.g. `fix-nav-morph`, `review-10d`) on every Agent spawn, even when the
Agent schema shown after a compaction does not list `name` (it is accepted; checked with a probe spawn 2026-10-01).

**Why.** After a compaction on 2026-10-01 (09:13Z) the lead stopped naming spawns; research agents could not message
each other ("no agent named X is reachable") and routed their notes through the lead. The user wants agents to work
together directly, without the lead as a bottleneck.

**How to apply.**
- Names are unique per session; a reused name resolves to the newest agent. Restarts get a suffix (`mgmt-ops-4`).
- Put the peer directory (names, owners) in every spawn prompt.
- Project agent types in `.claude/agents/` load only at session start. If they are missing from the agent list,
  spawn `general-purpose` with `name`, the role's `model`, and "read `.claude/agents/<role>.md` first".
- Check this on the **first spawn after every compaction**: it slipped again on 2026-10-03 ~00:00Z (three unnamed
  spawns); the user noticed it in console thread T-032 and asked for the naming convention to be followed.

Related: [verify-platform-claims](verify-platform-claims.md).

### console-server-detached.md (Lead; feedback; since 2026-10-02)

**Rule.** Run the user console server detached, not as a Claude Code background job:
`nohup node tools/console.mjs serve --port 5559 > out/console-serve.log 2>&1 < /dev/null & disown` (localhost only).
Check `node tools/console.mjs url` at every lead check-in; if it is down, restart it and tell the user.

**Why.** On 2026-10-02 the server ran as a Bash `run_in_background` job; those are killed at the 2-hour cap. It died
at 01:50Z and stayed down about 4.5 h unnoticed; the user asked in T-012 why the console had stopped. The user does
every step through the console, so a dead console blocks them.

**How to apply.** The "no `&`" rule for console *waits* does not apply to the server.

Related: [user-tasks-via-console](user-tasks-via-console.md), [console-step-wait-yourself](console-step-wait-yourself.md).

### console-step-wait-yourself.md (Every agent; feedback; since 2026-10-01)

**Rule.** Whoever posts a console step (`console.mjs post`) arms `node tools/console.mjs wait <id> --until answered`
in the same turn, in **its own** Bash call with `run_in_background`, and acts on the answer (or hands it on) when it fires.

**Why.** On 2026-10-01 17:26Z the user pressed Done on C-009 (reload Safari); the lead had left the waiting to the
phone runner and nobody reacted for about 4 minutes. The user asked why it was not caught.

**How to apply.**
- Never assume another agent watches the item.
- Never start a console wait (`thread wait`, `wait <id>`, `proposal wait`) with a shell `&` tacked onto another
  command: the detached wait marks the user's message read and nothing wakes you (happened twice on 2026-10-01,
  21:21Z and 21:57Z).

Related: [user-tasks-via-console](user-tasks-via-console.md).

### defer-timing-focus-call-tree.md (Every agent; project; since 2026-10-01, updated 2026-10-02)

**Rule (user direction, 2026-10-01 19:27Z).** Timing/performance measurement is deferred. Work on the Chrome call tree
(what runs, how often, style/layout counts, roots) and Safari layout and rendering attribution (Timeline
layout/style/paint records, roots, nested layouts), not fps or dt>50 verdicts. Chrome may run 3 agents in parallel
(nothing timed while shared); more only after the headless lane is released.

**Why.** The single exclusive `chrome-measure` lock and phone timing blocks serialized everything (24 h retrospective:
the inner loop must be counts).

**How to apply.** Don't queue timing A/Bs (`fix.mjs ab` gain runs, bench timing) or phone gain blocks. Phone time goes
to Timeline attribution runs, and to the Simulator where its records match the phone. Push the shared lane first.
Revisit when the user lifts the deferral.

**Exceptions.**
- 2026-10-02: PR-001 (accepted 06:31Z: pick the best-performing option) and the stack test (T-014, 07:07Z): one phone
  session comparing the best build with the five ready fixes stacked (cdwc, f3-arm-scope, re-keep-op, blur-cubic,
  st6), plus a blind swipe for the user.
- 2026-10-02 21:57Z (T-027 #5): the user asked the two highest-gain fixes to move; the lead picked hero-carousel st6
  and f3-arm-scope. Their phone timing tests (st6 scripted at rest, F3 P-036 robot finger) may run, queued after G2
  and P-065.
- Everything else stays deferred unless the user lifts it.

Related: [simulator-for-non-perf-phone-jobs](simulator-for-non-perf-phone-jobs.md), [verify-platform-claims](verify-platform-claims.md).

### illusion-must-be-pixel-identical.md (Every agent; feedback; since 2026-10-02)

**Rule.** An "illusion" fix must be indistinguishable from the original at every frame, not only at rest. A cheaper
animation that looks different is not acceptable.

**Why.** On 2026-10-02 the user rejected PR-001 rev 1 (hero accent word: a sliding wipe instead of the stroke-by-stroke
draw) because it changed the visual, and asked instead for the apple.com approach: pre-rendered image frames or video.

**How to apply.** Use containment/layout boundaries, layer tricks, or pre-rendered frame sequences (canvas image
sequence or video, checked for 3x sharpness, size and transparency). State any visible difference up front and
expect rejection if there is one.

**Exception (PR-001 rev 2, accepted 2026-10-02 06:31Z).** For PR-001 only, the user accepted a small pixel difference
and asked the team to pick the option with the best measured phone performance: quantify each option's pixel
difference and choose by phone timing (this also lifts the timing deferral for PR-001). The user also asked that one
proposal carry several options to pick from (I-053). Other illusions stay pixel-identical.

Related: [perception-tests-touch-ab](perception-tests-touch-ab.md), [proposal-decision-is-the-spec](proposal-decision-is-the-spec.md).

### keep-awake-only-during-measurements.md (Every agent; feedback; since 2026-10-02)

**Rule (user choice in console step C-024, 2026-10-02 14:54Z).** Keep the Mac awake only during measurements; never
session-wide or time-boxed.

**Why.** On 2026-10-02 the Mac idle-slept five times between 12:27Z and 14:36Z (~15 min each), freezing every agent
and lease and voiding a Simulator session. Of three options offered (awake 4 h, awake only during measurements, let it
sleep) the user chose "only during measurements": idle sleep is fine otherwise.

**How to apply.**
- Assertions only, around a timing hold, a Simulator session or a phone run; never around waits, builds, `npm test`
  or queueing. Use `caffeinate -i -s` (no settings change): `-i` alone does nothing once the Mac is in DarkWake
  (Apple IOPMLib.h, kIOPMAssertPreventUserIdleSystemSleep; CONFIRMED by ts-i070). The five "15-min sleeps" were
  Maintenance Sleeps out of DarkWake.
- The tooling does this: I-026 (`lib/awake.mjs`) kept the Mac awake on every hold and for waiters; I-070 narrows it
  to measurement holds. Rely on it.
- A run that spans a sleep is void.

Related: [defer-timing-focus-call-tree](defer-timing-focus-call-tree.md), [simulator-for-non-perf-phone-jobs](simulator-for-non-perf-phone-jobs.md).

### no-camera-access.md (Every agent; feedback; since 2026-10-02)

**Rule.** No agent opens a Mac camera, even briefly: no QuickTime movie recording, no capture API, no camera device
listing (e.g. `system_profiler SPCameraDataType`). The iPhone screen is recorded only with `tools/ioscap.mjs`
(CLAUDE.md "iPhone screen recorder"). Any new recording route needs the user's explicit OK before its first run.

**Why.** On 2026-10-02 (T-018) the user raised a privacy objection: the iPhone screen-recording route had turned on
the Mac camera. QuickTime's "New Movie Recording" opens on the built-in camera before the iPhone source is selected,
and a camera-listing command had raised a camera permission prompt earlier that day. No measurement needs the camera;
recordings are only supporting evidence.

**How to apply.**
- Flash and jank checks run inside the page (in-page loggers) or on the phone.
- Check new phone tooling for camera side effects before it runs.
- When a privacy stop arrives, get a full factual account from the agent and give the user all of it, never only
  the first, milder explanation.
- For any step the user watches, pre-arm one background script (wait `--until started`, ack recording, record) so
  the run starts within seconds of Start, and do nothing else in between.

**History (disclosed to the user in T-018).** The route recorded the Mac camera for about 80 s, then made a second,
unsaved recording; the agent viewed one still frame and listed the cameras (a device name carried personal data). All
files were deleted and the deletion verified. The user decided the session log stays as evidence of the mistake: never
delete it. The user then asked for a hardened Mac-side recorder (T-019): it queries only the iPhone screen device,
refuses any camera and never falls back; hook rules block QuickTime recording, camera listing and other recorders;
tests check the refusal; numbers only, files under `out/`. Built as I-062 (`tools/ioscap.mjs` plus a small signed
app). First run 2026-10-02 21:30Z (C-025): the app opened only the iOS device; the Camera permission was already
granted (when is unknown); the user's Done arrived before the recording ran, so it was disclosed and a re-run offered;
the user confirmed the camera light stayed off, and the first run counts as passed.

Related: [user-steps-first](user-steps-first.md).

### no-phone-steps-during-blocks.md (Every agent; feedback; since 2026-10-02)

**Rule.** Never post a console step that makes the user touch the iPhone (settings, placement, finger tests) while a
timed phone block runs. Check `lock.mjs status` first; post it between blocks and tell the next runner to wait for the
answer.

**Why.** On 2026-10-02 23:50Z a phone-settings step (C-027, P-068) went out while X1 stage 2 part A was starting; the
user handled the phone for about 1.5 min, voiding overlapping runs ("phone touched") and changing brightness mid-block.

**How to apply.** A step that is itself the phone job (a swipe test) still goes first, per [user-steps-first](user-steps-first.md).

### perception-tests-touch-ab.md (Every agent; feedback; since 2026-10-01)

**Rule.** Smoothness perception tests on the iPhone are blind touch A/B pairs: the user swipes A and B and picks the
one that follows the finger better. Not watched clips.

**Why.** On 2026-10-01, after pacing v2 (watched clips), the user explained that the lag they notice is the content
not following the finger, so swiping A/B would be more accurate. That is a touch-latency effect clips cannot show.

**How to apply.** Forced choice, AB/BA counterbalancing, a catch pair; pair each arm with an objective
finger-to-pixel latency from the gesture driver (`touchToScrollMs`). Watched clips only for questions about playback
pacing.

Related: [verify-platform-claims](verify-platform-claims.md).

### proposal-decision-is-the-spec.md (Every agent; feedback; since 2026-10-01)

**Rule.** A user's changes-requested decision on a proposal is the spec for rev N+1 of the **same** proposal.

**Why.** PR-001 rev 1 (a wipe) got changes-requested asking for apple.com-style image frames or video and for research
into them. The team built other arms instead (CSS contain; "onecopy", the fallback rev 1 already listed), planned them
as separate PRs, dropped the "research them" part when relaying the note, and left PR-001 at rev 1. On 2026-10-01
22:43Z (T-006) the user asked the lead to study this case and redesign how decisions are handled.

**How to apply.**
- Read the full decision with `console.mjs proposal show <id>` (list views truncate notes).
- Answer with `proposal revise <id>`: quote the request in the first lines and answer each point.
- Other arms only under "also tried, not chosen". Relay the user's note to the author unshortened.
- Post nothing that changes the visual unless stated up front.

Related: [illusion-must-be-pixel-identical](illusion-must-be-pixel-identical.md), [user-tasks-via-console](user-tasks-via-console.md).

### simulator-for-non-perf-phone-jobs.md (Every agent; feedback; since 2026-10-01)

**Rule.** A job that needs an iPhone but no timing or perception number runs on the iOS Simulator (`tools/sim.mjs`,
WDA-sim): mechanism checks, WDA/gesture compile tests, inspector-connection bugs, Safari restart tooling, DOM/page-state
checks, script dry runs. The real phone is for S/W/M/G timing blocks, sentinels, Timeline attribution, finger tests
and user sittings.

**Why.** On 2026-10-01 ts-gesture sat idle waiting for a phone slot to probe a WDA behaviour that was not a
performance question; the user asked why the Simulator was not used for such jobs.

**How to apply.** Before ordering the phone queue or spawning a phone task, ask whether it needs a timing or
perception number; if not, send it to the Simulator and keep at most a short phone confirmation when the result
depends on the device. A Simulator job still runs in a chrome-measure hold (it loads the Mac). Simulator timing never
decides a verdict (F-084).

Related: [verify-platform-claims](verify-platform-claims.md).

### usage-meter-every-30-min.md (Lead; project; since 2026-10-01)

**Rule (user request T-010, 2026-10-01 22:02Z).** Measure the session's plan usage every 30 minutes and carry the
series across sessions.

**How to apply.**
- At every session start, re-create the 30-minute cron (crons are session-only).
- Meter: `node research/management/tools/usage.mjs` (read-only, reads the local transcripts). Each run appends to
  `<git-common-dir>/fastwork-mirror/usage/usage.jsonl`; the user's own readings go in `usage/calibration.jsonl`. Both
  stay local: account usage is personal data (Hard rule 12), so readings and window times are not copied here.
- Post a 3-line summary to thread T-010 each time. If the estimate passes ~85 % of the window, propose in T-010 what
  to park.

**Why.** The user watches plan usage and wants work prioritised against it.

Related: [user-tasks-via-console](user-tasks-via-console.md).

### user-steps-first.md (Every agent; feedback; since 2026-10-02)

**Rule.** A console step the user is waiting on (swipe pair, finger test) takes the phone next, ahead of every
measurement block and every Mac-quiet wait.

**Why.** On 2026-10-02 08:28Z (T-017) the user asked why C-019 took so long: a second stack-test block had run first,
and then the swipe pair waited on cooling and a Mac-quiet hold. The user asked for C-019 to be top priority and not to
be kept waiting. The user's time is the scarcest resource.

**How to apply.**
- No cooling or Mac-quiet gate on a user step; recordings are supporting evidence, so log the Mac load instead.
- If a step really must wait, say so in the step with an ETA.
- Check the posting agent acts at once (messages arrive only between tool rounds).
- The runner acks every change on the step with a plain one-line `--message` (doing what, ETA), so the user can
  follow on the step page (user request, T-017).

Related: [user-tasks-via-console](user-tasks-via-console.md), [console-step-wait-yourself](console-step-wait-yourself.md), [perception-tests-touch-ab](perception-tests-touch-ab.md).

### user-tasks-via-console.md (Every agent; feedback; since 2026-10-01)

**Rule.** The user's to-dos (finger tests, swipe A/B pairs, ratings, yes/no questions) go through the local web console
(`tools/console.mjs`): a queue of steps with Start and answer buttons. Not relayed through the lead's chat; in chat the
lead keeps to short pointers ("2 steps waiting in the console").

**Why.** On 2026-10-01 the user found the lead's chat too busy to follow and asked for a click-through list of
questions. Relaying also lost data: swipe recordings started after the user had already swiped.

**How to apply.** Post steps there and wait on Start (CLAUDE.md "User console"). The console stays local (localhost,
never published).

Related: [perception-tests-touch-ab](perception-tests-touch-ab.md).

### verify-platform-claims.md (Every agent; feedback; since 2026-10-01)

**Rule.** A browser/engine limitation found by our own probes stays OBSERVED until checked against a reference (spec,
CDP/MDN/WebKit/Chromium docs, engine source and history, bug tracker), cited with link plus line or commit. Plan the
research, then do it. Rule text: CLAUDE.md "Platform claims: confirm against a reference".

**Why.** On 2026-10-01 the lead passed "Chrome 154 never sends layerPainted" to the user as fact, resting on two probes
that saw zero events. The user asked whether anyone had checked reference docs, and asked for the rule to be written
down and the team structure revised.

**How to apply.** Before telling the user about a limitation, check its status; if OBSERVED, say so and route
verification. Before signing a card that depends on such a claim, ask for verification.

Related: [agent-spawn-names](agent-spawn-names.md).

## 8. Summary for the user

- Today the lead's 15 memory notes live outside the repo and reach only the lead, one index line each; the agents that
  must follow those rules (no camera, user steps first, Simulator for non-timing jobs, …) never see them.
- Proposal: a new top-level `memory/` folder: one scrubbed note per rule plus a short index, imported by CLAUDE.md so
  every agent loads the index (~3 KB more context each; the lead's own load stays about the same).
- Nothing new under `.claude/`, no tool change; one small CLAUDE.md addition needs your OK (diff in the doc).
- Stays local: Claude Code's own memory folder (becomes a 3-line pointer), the console/usage/status stores (your words,
  LAN links, account usage), transcripts.
- Also found: two stale Serena notes (they still call the snapshot gitignored) and a broken note link; fixes proposed.
- Per-agent memory folders (Claude Code's `memory:` setting) are not recommended: they would give read-only reviewers
  write access and trip the tooling guard; the findings board already covers shared lessons.
- On your OK, arch-memory writes the notes and the index; the lead lands them and empties the outside folder.
