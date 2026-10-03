# Thread routing: replies reach the owner, the lead only when needed (design)

arch-thread-routing, 2026-10-03. Status: **proposal**, waiting for the user's OK in console thread T-050, then a
toolsmith builds it (brief at the end). Builds on `console-threads.md` (threads), I-084 (who reads a reply),
I-090 (comments with anchors) and the waits registry (`tools/lib/waits.mjs`).

The user's concern (T-050, paraphrased): every thread reply goes to the lead, who answers or hands it on; when the
user sends many replies, the main session becomes the bottleneck. The ask: investigate and find a better way.

## 1. How routing works today (read from `tools/lib/console-threads.mjs`, `tools/console.mjs`)

- **Who sees a thread.** `sees(t, reader)`: the lead sees every thread; any other agent only threads it is assigned
  to. `unreadFor` and `threadWaitCondition` follow that rule.
- **Who is woken.** A user message wakes every reader that sees the thread and has a live `thread wait --as <me>`:
  the lead always, plus the assignees. Each reader has its own read mark, so the lead's wait fires even when an
  assignee is already on it. The lead's wait also fires on every proposal decision event (I-045).
- **Who assigns.** Only the lead (`thread assign … --by lead`); the user's new threads from the page have no assignee
  and usually no topic, so every new thread starts with the lead.
- **When an assignee exits.** Nothing happens. The thread stays assigned to an agent that can no longer be woken (a
  finished subagent does not watch files; only the lead can resume it). The user is answered only because the lead
  also sees the thread. There is no notion of "this owner is listening".

## 2. Measurement: the last 24 h (store `<git-common-dir>/fastwork-mirror/console/threads/`, 2026-10-03 16:01Z)

Counts only; no user text is copied here (Hard rule 12). Script: a local read of the thread JSON files.

| measure | value |
|---|---|
| user messages | **88**, in 27 threads (24 new threads); peak 17 in one hour (15Z), 13 in another (07Z) |
| bursts (a user message right after another user message) | 5 |
| messages that woke the lead | **88 of 88** (the lead sees every thread) |
| messages in a thread already assigned to another agent | 20 of 88 |
| first reply by the lead / by an assignee / none yet | **80** / 7 / 1 |
| first reply by the lead although the thread was assigned | 13 of 20 (the assignee had finished or was not listening) |
| time to first reply, lead | median 0.6 min, p90 2.1 min, max 8.4 min |
| time to first reply, assignee | median 0.6 min, p90 4.0 min (n=7) |
| lead thread messages written | 127 (about 124 000 characters) |
| other agents' thread messages | 17 |
| assignments in 24 h | 6 (one of them 5 h after the user's first message) |

Kinds of the 88 messages (classified by hand from the local store, one kind per message):

| kind | count | needs the lead? |
|---|---|---|
| decision or go-ahead ("yes", "do both", priorities, approvals) | 19 | yes: priorities, spawns, landing |
| question about a fix, finding, rule or bug | 18 | no: the topic's owner or a desk agent answers |
| tool or console feature request | 16 | first reply no; a build needs the lead to spawn a toolsmith |
| status or catch-up ("what's the progress", "which agents", "catch up") | 14 | no: the board, handover and PROGRESS answer it |
| phone or device notice (connected, disconnected, Wi-Fi, battery) | 11 | yes: it changes the phone plan |
| idea or research direction | 10 | no for the first reply; yes if it changes the plan |

Reading:
- **Latency is not the problem yet** (median 0.6 min): the lead answers fast because it drops other work to do so.
  The cost is the lead's attention and context: 127 replies and 88 wake-ups in a day, each one interrupting landing,
  incidents and spawns. The worst case (8.4 min) is when the lead is busy, and it grows with the user's volume.
- **About half the messages (42 of 88: questions, catch-ups, ideas) never needed the lead's authority**, only
  someone who knows the topic or reads the board.
- **Assigning does not take load off the lead today**: in 13 of 20 messages on assigned threads the lead still
  answered first, because its wait fires anyway and nothing tells it the owner is listening.

## 3. Options weighed

| option | what it does | gain | cost / risk |
|---|---|---|---|
| A. auto-route to the owner | on a user write, the console server assigns the thread to the owner it can name: the comment's anchor (status row owner, step author, proposal author), else the thread's topic (status row owner) | the topic's expert answers with full context | most page threads have no anchor or topic (24 new threads, few tagged): alone it routes few messages |
| B. a desk agent for unowned threads | threads with no live owner go to one "desk" agent the lead names per session (the ops hub, mgmt-ops-N, which already reads the board, handover and PROGRESS) | covers catch-ups and general questions, the biggest unowned share | the desk must stay alive with a wait armed; one more hand-off for decisions |
| C. listening check + re-route on exit | an agent counts as listening when it has a live `console.mjs thread wait` in the waits registry, or woke/replied in the last 5 min; a thread whose assignees are not listening goes to the desk, else the lead | fixes "assigned to a finished agent" (13 of 20 today) | needs a small read-time field (`readsAt`) |
| D. lead triage wait | `thread wait --as lead --triage` wakes the lead only for: a thread nobody listening owns, a message the user marked "for the lead", an escalation by an owner (`thread escalate`), a message unanswered for 10 min, proposal decisions | the lead sleeps through what others answer | without A-C it changes nothing; the 10 min timer keeps the safety net |
| E. a cheaper "concierge" model as the desk | a sonnet agent answers catch-ups from the board/handover/PROGRESS and escalates the rest | cheaper tokens than an opus hub | a new role and spawn to manage; may answer wrong on subtle fix questions |

## 4. Recommendation: A + B + C + D, one small tool change; E later only if needed

**The flow for one user message:**

1. The console server stores it as today, then picks the thread's owner (only if no assignee is listening):
   the comment anchor's owner (status row owner, step author, proposal author) → the thread topic's status row owner
   → the desk (when listening) → nobody (the lead). It records `history: {who: 'router', action: 'assign', note:
   "<agent> (<why>)"}` and keeps former assignees on the list (they still may answer when they come back).
2. The owner's own `thread wait --as <owner>` wakes, as it does today after an assignment.
3. The owner answers in the thread. If the message needs a decision, a spawn, landing or priority, the owner (or
   desk) answers what it can and runs `thread escalate <id> --by <me> --note "<what the lead must decide>"`.
4. The lead's `thread wait --as lead --triage` wakes only for: an unowned message (no one listening), the user's
   "for the lead" mark, an escalation, a user message unanswered for **10 min** (today's worst lead reply was
   8.4 min, so the user never waits longer than today's worst before the lead is involved), and proposal decisions.
   The lead still reads any thread with `thread show`, and `thread wait --as lead` without `--triage` keeps today's
   behaviour (the lead's switch back).

**What the user sees.**
- The reply box already says who will read the reply (I-084). It now says "fix-hero-exit (listening); the lead if no
  answer in 10 min", or "the lead" when nobody else is listening.
- A **"For the lead"** tick under the reply box (off by default) sends the message straight to the lead as well:
  for decisions, priorities, "start/stop this", phone connect/disconnect.
- Answers come from the topic's owner or the desk, as fast as today when they are listening (assignee median 0.6 min
  in the data), with the lead as the 10-min backstop.

**What stays with the lead.** Decisions and priorities, spawns (including the toolsmith for a tool request), landing,
incidents, the phone plan, naming the desk each session (`thread desk set <agent> --by lead`), and the triage wake-ups
above. Estimate from the 24 h data: the lead's wake-ups drop from 88 to about 46 (19 decisions + 11 phone notices +
16 tool requests that need a spawn), fewer once owners answer tool requests themselves; this is an estimate, not a
measurement.

**Why not E now.** The ops hub already reads the board, handover and PROGRESS, so it can be the desk with no new
role. A sonnet concierge is the next step only if the hub becomes the new bottleneck (watch: desk replies per hour,
escalations it sends back).

**Rules that change (the lead edits the docs on landing).** "Only the lead assigns" becomes: the lead, the router
(automatic, recorded in history), and the desk (may hand a thread to a listening owner). CLAUDE.md "Agent
communication": the lead arms `thread wait --as lead --triage`; every agent that owns a workstream keeps its own
`thread wait --as <me>` armed while it runs; owners escalate decisions with `thread escalate`.

## 5. Toolsmith brief (after the user's OK; one incident, one commit, Hard rule 6)

Files:
- `tools/lib/console-threads.mjs`:
  - `listening(agent, {now, waits})`: a live `console.mjs thread wait` owned by `agent` in `listWaits()`, or
    `readsAt[agent]` / its last message within 5 min. Store `t.readsAt[reader] = iso` in `markRead`/`addMessage`.
  - `routeOwner(t, {statusRows, steps, proposals, desk, listening})`, pure: returns `{owner, why}` or null in the
    order of §4 step 1; an agent that is not listening is skipped.
  - In `replyUser` / `createThread({fromPage})`: when no assignee is listening, call the router and push the owner
    plus a `router` history entry (the guard is already held).
  - `escalate(id, {by, note})`: an assignee or the desk; history `{action: 'escalate', note}` (scrubbed); wakes the
    lead's triage wait. Refused for agents that don't see the thread.
  - Desk: `threads/desk.json` `{agent, setBy, at}`; `setDesk({agent, by})`, lead only; `--clear`.
  - `threadWaitCondition({as: 'lead', triage: true})`: met for a user message after the lead's mark when (a) no
    assignee is listening, or (b) the message has `forLead: true`, or (c) an `escalate` entry is newer than the
    lead's mark, or (d) the message is older than `TRIAGE_ESCALATE_MIN` (10) with no agent message after it.
    The lead's mark moves only past what was printed (unchanged rule); messages not printed stay unread for `--all`.
  - `assign` keeps `--by lead` and also accepts the desk agent.
- `tools/console.mjs`: `thread wait --triage` (lead only, refused for others), `thread escalate <id> --by <me>
  --note "…"`, `thread desk set <agent> --by lead | --clear | show`; header usage lines; `thread list` shows each
  assignee's listening state.
- `tools/lib/console-server.mjs` and the threads page: the `forLead` tick on the reply and new-thread forms (stored on
  the user's message), the recipients line with listening state and the 10-min note; `summary().to` adds the state.
- Tests (`tests/unit/console-threads.test.mjs`, plus the e2e thread-wait test):
  1. routeOwner order: anchor status owner > topic owner > desk > null; non-listening agents skipped.
  2. listening: a live wait counts; a dead pid does not; a reply 4 min ago counts, 6 min ago does not.
  3. A user message on a thread whose assignee is listening does not wake `--triage`; it wakes after 10 min with no
     agent reply (fake clock); an agent reply before then cancels it.
  4. A non-listening assignee: the router adds the desk; with no desk, `--triage` wakes at once.
  5. `forLead` wakes `--triage` at once even with a listening owner; `escalate` wakes it; both print once.
  6. `--triage` refused for non-lead; `escalate` refused for a non-assignee; `desk set` refused for non-lead.
  7. `thread wait --as lead` without `--triage` behaves exactly as today (existing tests unchanged).
  8. Agent text in escalate notes and router history is scrubbed (scrubAgentText).
- Acceptance: `npm test` green; with the desk set and an owner listening, a page message wakes the owner's wait and
  not the lead's triage wait; after 10 min with no reply the lead's triage wait wakes with a line naming the thread
  and "unanswered 10 min (owner: <agent>)".

Open questions for the lead: the 10-min backstop (5 / 10 / 15), whether the desk may assign, and whether phone
notices should always wake the lead (they change the phone plan) or go to the phone owner (iphone-runner) first.
