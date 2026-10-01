# Console threads: one conversation per topic (design)

ts-console-threads, 2026-10-02. Status: implemented (tools commit b30ca89 on the ts-console-threads branch); the lead's
answers to the open questions are folded in ("Decisions" at the end). User request (verbatim): "i'd like to ask you add more feature about console, do
thread feature that i can ask you reply and catch up each topics that i'd like to ask. i think i ask you in this
session it quite hard to read can catch up them cause a lot of message in there. let's investigate, design and
implement".

The problem: the user's questions to the lead get lost in the lead chat, which carries every agent report. The fix
is a **Threads** page in the user console (`tools/console.mjs serve`, localhost only). The user opens one thread
per topic. The lead, or an agent the lead hands the thread to, replies there. The user catches up thread by thread
and sees which ones have unread replies. Steps (`C-nnn`) stay as they are: a step is a task the agent needs done,
and a thread is a conversation the user starts or keeps going.

## What exists (read for this design)

- `tools/lib/console.mjs` holds the step store: one JSON file per step in `<git-common-dir>/fastwork-mirror/console/`,
  written atomically (`store.mjs writeJson`) under the `withGuard` mkdir lock.
- `tools/lib/console-server.mjs` is the HTTP server.
  - It binds 127.0.0.1, and every request needs a localhost `Host` header (421 otherwise, against DNS rebinding).
  - Every POST needs `x-console: 1`. A page on another origin can only send that header after a CORS preflight,
    and the server never answers one.
  - Every response carries a strict CSP (`default-src 'none'`, `connect-src 'self'`, `frame-ancestors 'none'`)
    plus nosniff and no-referrer.
  - `createFeed` checks the store every 500 ms and pushes `event: waiting` on `/api/events`.
- `tools/lib/console-notify.mjs` covers the waiting model and the `diffSteps` new/remind rule. The page runs the same
  rule (`console-nav.js`), checked against one table of cases. It also holds the osascript notifier (execFile with
  an argv array).
- `tools/lib/progress.mjs` provides `sanitize` and `findPersonal`, the PERSONAL shapes: URL, IPv4/6, `.local`/`.lan`
  host, e-mail, device id, home path. It also calls `redact.mjs`: UDID, team, serial, ECID, device name.
- `console.mjs wait` polls with `wait.mjs pollUntil`: exit 0 MET, 3 TIMEOUT, 4 NEVER, 1 usage.
  `finding.mjs wait --as` is the per-agent pattern.

## Data model

One file per thread: `<console>/threads/T-001.json`. It sits in its own subdirectory, so the step code never sees it,
and is written atomically under its own guard `console-threads`.

```js
{
  id: 'T-001', title: 'Why is the hero still janky on the phone?',   // title: user text as typed (agent: scrubbed)
  topic: 'hero-exit',            // optional slug ^[a-z0-9][a-z0-9-]{0,40}$: a status item / PROGRESS id (link /status#<id>)
  status: 'open' | 'closed',
  createdBy: 'user' | '<agent>', createdAt, updatedAt, rev,
  assignees: ['fix-hero-exit'],  // agents the lead handed the thread to (the lead always sees every thread)
  messages: [{ n: 1, at, by: 'user' | 'lead' | '<agent>', text, ask?: true }],   // n: 1-based, never reused
  reads: { user: 3, lead: 2, 'fix-hero-exit': 0 },  // last message n each reader has seen
  history: [{ at, who, action: 'assign'|'unassign'|'close'|'reopen', note? }],
}
```

**State.** The state is derived and never stored, so it can't drift:

| state | when | meaning for the user |
|---|---|---|
| `closed` | status closed | done; still readable; a new user message reopens it |
| `waiting-on-you` | last message is from an agent and has `ask: true` (`reply --ask`) | an agent asked you something |
| `answered` | last message is from an agent (no `ask`) | there is a reply |
| `open` | last message is from the user | waiting for the agents |

**Unread.** For the user: messages by anyone but the user with `n > reads.user`. For an agent X: user messages with
`n > reads[X]`, in the threads X sees (the lead sees all of them, an assignee only the ones assigned to it). Messages by other agents
don't wake anyone. A user message wakes, and so does an assignment: a new assignee has no read mark, so the thread's
user messages are unread for it.

**Limits.** Title 160 chars, message 8000, 500 messages per thread, assignees 8. The server refuses a body over 64 KB,
as today.

## CLI (`node tools/console.mjs thread …`)

```
thread list [--unread --as <agent>] [--all] [--json]       # open threads first, then the last closed ones
thread show <id> [--as <agent>] [--json]                   # all messages; --as marks them read for <agent>
thread new --by lead --title "…" --text "…"|--file <f> [--topic <slug>] [--to <agent>] [--ask]   # the lead opens a topic thread
thread reply <id> --by <agent> --text "…"|--file <f>|--file - [--ask]   # the lead or an assignee; scrubbed; prints REPLIED T-003 #4 (+ what was scrubbed)
thread assign <id> --to <agent>[,<agent>] --by lead [--remove]
thread close <id> --by <agent> [--note "…"]   |   thread reopen <id> --by <agent>
thread wait --as <agent> [--thread <id>] [--timeout 3600] [--json] [--quiet]
```

- **`thread wait`.**
  - It exits **0** as soon as the agent has an unread user message in a thread it sees. If one is already there, it
    exits at once, so nothing is lost between two waits.
  - It prints **every** unread user message of every thread it follows, after a 1 s settle so a burst of user
    messages arrives in one wake: `NEW T-003 "title" [topic] #4 by user at 2026-10-02T…Z:` and the text indented, then a hint
    (`reply: node tools/console.mjs thread reply T-003 --by <you> --text "…"`).
  - It then **advances the agent's read mark** past what it printed, so the next wait doesn't fire again on the same
    message. Only that reader's mark moves: the lead's wait never moves an assignee's, nor the other way round.
  - It exits **3** on TIMEOUT. With `--thread <id>`, it exits **4** when that thread is closed.
  - It polls the local file store every 0.5-2 s, the same as `console.mjs wait`.
- **`--by user` is refused on the CLI.** Only the page writes as the user. A user message the lead wants to bring over
  from chat goes in as `--by lead` with a quote.
- **The user's text is printed as typed.** In `wait`, `show` and `list` it is the user's own message to the agents,
  the same as typing it into chat. It isn't scrubbed here (lead decision). Never copy it into committed files
  without scrubbing it.

**The lead's wake-up path.** The lead keeps one background job armed and re-arms it after each wake:

```sh
node tools/console.mjs thread wait --as lead --timeout 3600     # Bash run_in_background
```

1. Claude Code wakes the lead when the job exits.
2. The lead reads the `NEW …` blocks and replies with `thread reply`, or hands the thread over with
   `thread assign T-003 --to fix-hero-exit`.
3. The lead tells the assignee to arm its own `thread wait --as fix-hero-exit`. The assignee wakes at once on the
   thread's backlog.
4. The lead re-arms its own wait.

## Page (`/threads`)

- **Menu.** A "Threads" link after "Progress", with its own badge (`data-thread-badge`): the number of threads with
  unread replies or a question for the user (waiting-on-you). ts-status-board adds "Status" between "Your steps" and "Progress".
- **List view (`/threads`).**
  - A "New thread" form: title, first message, optional topic.
  - Then the threads, sorted: unread or `waiting-on-you` first, then by last activity, newest first. Closed threads
    sit in a collapsed "Closed" section.
  - Each row shows the title, the topic chip, the state pill, last activity ("12 min ago, fix-hero-exit"), the unread
    count and the assignees.
- **Thread view (`/threads#T-003`).**
  - The messages in order. Each shows its author (You / lead / agent name) and time; `ask` replies are marked
    "asks you".
  - A reply box (Ctrl/Cmd+Enter sends) and Close / Reopen.
  - While the page is visible, it marks the thread read (`POST …/read {n}`).
- **Rendering.** All text is rendered as text (`textContent`, `white-space: pre-wrap`), never as HTML. `http://localhost:<port>/…`
  links in agent text become `<a>` elements built with `textContent` and a checked `href`. Nothing else is linkified.
- **Drafts.** An unsent reply draft is kept per thread in `localStorage` (try/catch), so a refresh doesn't lose it.

## HTTP API (added to `console-server.mjs`)

| route | |
|---|---|
| `GET /threads` | the page (menu slot filled) |
| `GET /api/threads` | `{now, unread, yourTurn, threads: [summary]}` (summary = id, title, topic, state, status, unread, lastAt, lastBy, count, assignees) |
| `GET /api/threads/T-003` | `{thread}`: the full thread for the page (no `reads` of agents, no history internals) |
| `POST /api/threads` | `{title, text, topic?}` → a new thread by the user |
| `POST /api/threads/T-003/reply` | `{text}` → a user message (reopens a closed thread) |
| `POST /api/threads/T-003/read` | `{n}` → `reads.user = max(reads.user, n)` |
| `POST /api/threads/T-003/close` · `/reopen` | the user closes or reopens it |
| SSE `event: threads` on `/api/events` | the same model as `GET /api/threads` minus per-thread details: `{now, unread, yourTurn, threads: [{id, title, state, unread, lastAgentN, lastAt}]}`, pushed on change and with the heartbeat |

## Notifications

- **The rule.** A new **reply** (an agent message the user hasn't read yet, whose number has grown since the last tick)
  triggers `{kind: 'reply'}`. It runs as a pure rule, `diffThreads(state, threads)`, which seeds silently like
  `diffSteps`. `console-threads.mjs` and `console-nav.js` run the same table of cases in a unit test, as for steps.
- **Page.**
  - A banner reads "New reply in T-003: title", with an Open button that goes to `/threads#T-003`.
  - It chimes, puts the badge and the "(n)" count in the tab title (steps + threads), and raises a desktop
    notification with only the id and the sanitized title.
  - No chime for the thread the user has open and visible.
- **`serve --notify`.** The server raises a macOS notification "Console: new reply", with the body "T-003: <sanitized
  title>". It uses the same `createNotifier` path and constant AppleScript, with the text as argv. No reminders for
  threads: a reply is information, not a task. `waiting-on-you` threads are marked on the page and in the badge, but
  aren't nagged.

## Hard rule 12 and security

- **The store.** It keeps the user's text as typed. The store is local, gitignored (`.git/fastwork-mirror/`) and
  never committed.
- **Agent text is scrubbed before it is stored.** That covers `reply`, `new`, the title, the `close` note and the
  assign note.
  - The scrub reuses `progress.mjs sanitize`: URL → `<link>`, IP → `<ip address>`, host, e-mail, device id,
    home path → `~`, plus `redact.mjs`.
  - One exception: `http://localhost:<port>/…` and `http://127.0.0.1:<port>/…` URLs are kept, so an agent can point
    to `/progress`.
  - The CLI prints `scrubbed: ip address, e-mail` so the agent knows its text changed.
  - So no LAN address, e-mail, device id or home path reaches the page, the SSE feed or a notification from agent text.
- **The user's titles in notifications and the SSE summary** go through `sanitize` too: steps already do this with
  titles.
- **POST routes.** They keep exactly the step routes' protection: a localhost `Host` (421), `x-console: 1` (403),
  and a JSON body of at most 64 KB.
  - Added for the thread routes: when the request has an `Origin` header, it must be `http://localhost:<port>` or
    `http://127.0.0.1:<port>` (403). This is defense in depth on top of the preflight; extending it to the step
    routes is left to the lead (no drive-by).
  - Ids are matched by `^T-\d{1,6}$` before they reach the file system.
- **Rendering.** The page never uses `innerHTML` with data. The CSP stays as it is, and nothing is loaded from outside.
- **Tests and fixtures** use fake addresses (`192.168.77.12`, `.invalid` hosts) and a fake home path.

## Status-board link (with ts-status-board)

A thread's `topic` is the status id (slug, the same as PROGRESS item ids). The thread view shows "Status: <topic>" as
a link to `/status#<topic>`. No change in their code.

## Tests

- **`tests/unit/console-threads.test.mjs`.**
  - The store: create, reply, ids, limits, refusing `--by user` from the agent API.
  - The derived states and unread per reader (user, lead, assignee, non-assignee).
  - `assign` wakes the assignee; `close` and `reopen`.
  - `scrubAgentText`: LAN IP, e-mail, UDID and home path are replaced; localhost links are kept.
  - The wait condition: met at once on a backlog, advance-on-MET, nothing on agent-only messages, NEVER on a closed
    `--thread`.
  - `diffThreads`, the same table run against `console-nav.js`'s copy.
- **`tests/e2e/console-threads.test.mjs`.** `serve --port 0 --notify` on a temp `FW_STATE_DIR` with
  `FW_CONSOLE_NOTIFY_LOG`.
  - The menu shows Threads with its badge on every page.
  - `/threads` is served.
  - The user creates a thread over HTTP, and a background `thread wait --as lead` exits 0 with the text.
  - `thread reply` with a LAN address is scrubbed in the store, the API and the SSE feed.
  - The SSE `threads` event arrives within 2 s.
  - The notify log gets "Console: new reply".
  - Mark-read clears the badge.
  - Assign, then the assignee's wait wakes.
  - Host/Origin/x-console guards on every new POST (421/403); a 64 KB+ body is refused.
  - No external URLs in the page.
- Port 0 only: never 5173 or 5559.

## Decisions (lead, 2026-10-02)

1. **The user's text in agent output.** `thread wait` prints the user's text unscrubbed, like chat. Agents never copy
   it into committed files without scrubbing it.
2. **Who may reply.** Only the lead (always) and the thread's assignees. Anyone else is refused with "ask the lead to
   assign you". Only the lead starts threads (`thread new`, optionally `--to <agent>`) and assigns them.
3. **Reminders.** None for threads. Waiting-on-you threads count in the badge.
4. **Restart.** After landing, the lead restarts the console: stop the running server (its pid is in
   `.git/fastwork-mirror/console/server.json`), then run `node tools/console.mjs serve --port 5559 --notify` in the
   background.
5. **Burst handling and separate marks.** A wake prints everything unread at that moment, after a 1 s settle. Read
   marks are per reader.

Also, beyond the design: the user's fixture e-mail in the tests is `someone@example.invalid`, never the user's name.
