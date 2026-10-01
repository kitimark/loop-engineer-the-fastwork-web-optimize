# Status board: a live status per workstream (design, ts-status-board, 2026-10-02)

User request (2026-10-02): "i'd like to know about each progress status like priority, state (researching,
implementing, testing, waiting on something or anything related)". Lead's direction: agents self-report through a
small CLI into the shared git dir; the system derives the waits it already knows; one page in the user console.

## 1. What exists and what is missing (investigation)

| source | what it knows | gap for this request |
|---|---|---|
| `fixes/PROGRESS.json` + `/progress` (ts-progress) | fix items in plain words: state `base/testing/diagnosing/landed/dropped`, stage R-L, best numbers, felt, checks | fix items only; no priority, no "waiting on", no tool/research/phone/review/ops work; hand-curated by mgmt-ops, lands with docs batches (hours behind) |
| `progress.mjs gatherLive` / `lockView` | live holders + queues of `iphone` and `chrome-measure`, active incidents, pending console steps | shown as global boxes, not attached to a workstream |
| `ops-handover.md` "Peer directory", "Who waits on what" | every agent, what it owns, what it waits on | prose tables, written by hand (the "Who waits on what" table is stamped 08:55Z, ten hours stale at the time of writing) |
| incidents, findings, console stores | one JSON per record in `<git-common-dir>/fastwork-mirror/<store>/`, `withGuard` for read-modify-write, `store.mjs` helpers | the pattern to copy |

Conclusion: the curated layer (PROGRESS) is right for results and should stay; the missing piece is a *self-reported,
per-workstream* record that agents write at each transition (seconds, not hours, behind) plus the live waits joined
onto it. mgmt-ops-6 agrees with this split (message 2026-10-02): the board owns workstreams, priority and live waits;
PROGRESS keeps the user-facing fix narrative; they link by id.

## 2. Data model

Store: `<git-common-dir>/fastwork-mirror/status/<id>.json` (`$FW_STATE_DIR/status/` in tests), one file per
workstream, written atomically under `withGuard('status-store')` (as incidents/findings/console). Gitignored by
location; visible to every worktree at once.

```js
{
  "schema": "fw-status/1",
  "id": "style-recalc",              // slug ^[a-z0-9][a-z0-9-]{0,40}$; a fix workstream reuses its PROGRESS id
  "title": "Style recalculation cost (the user's idea)",   // plain, <= 90 chars
  "kind": "fix|tool|research|phone|review|ops",
  "owner": "de-style-recalc",        // agent name; matched against lock owners and step authors
  "aliases": ["style-recalc"],       // optional: other owner names this work uses on the locks/console
  "progress": "style-recalc",        // optional: PROGRESS.json item id (the page links to it, never copies it)
  "refs": ["P-039", "I-042"],        // optional: ledger/finding/incident/console ids
  "priority": 1,                     // integer 1..99 (1 = top) or null; only the lead sets it
  "state": "researching",            // section 3
  "stateSince": "<ISO>",             // when the state last changed ("measuring for 40 min")
  "waitingOn": { "kind": "agent", "target": "fix-nav-morph", "text": "y≈1960 answer" },   // self-reported, or null
  "note": "<one plain line: what is happening>",          // <= 200 chars
  "next": "<one plain line: the next step>",              // <= 200 chars
  "createdAt", "createdBy", "updatedAt", "updatedBy",
  "history": [{ "at", "by", "action": "created|set|priority", "changes": {…}, "note" }]   // last 100 kept
}
```

Hard rule 12: every string field is checked with `progress.mjs findPersonal` on write and **refused** (exit 1,
"contains an ip address …"), not silently stored; every string is `sanitize`d again on the way out (page, text,
JSON), including the live lock/step/incident strings. Fixtures use 192.168.77.x / `.invalid`.

## 3. States (refined)

| state | plain words on the page | group |
|---|---|---|
| `queued` | Not started yet | waiting to start |
| `researching` | Finding out where and why it is slow | working |
| `designing` | Planning the change (design, ticket, review of the plan) | working |
| `implementing` | Building the change | working |
| `testing` | Checking it works (test suite, mechanism checks) | working |
| `measuring` | Measuring it on Chrome or the phone | working |
| `reviewing` | Reviewing someone else's work (reviewer items) | working |
| `coordinating` | Keeping the work moving: queues, landing, the summary (ops items) | working |
| `waiting` | Stopped until something else happens (`waitingOn` required) | waiting |
| `ready-to-land` | Finished; the lead can land it (implies waiting on the lead) | waiting |
| `parked` | Paused on purpose; may resume | parked |
| `landed` | On main | finished |
| `done` | Finished without landing code (report, review verdict, research answer) | finished |
| `dropped` | Stopped; will not continue (`note` says why) | finished |

Changes from the brief: `testing` and `measuring` are separate (the user asked for "testing"; for this study a Chrome
or phone measurement is the slow, queue-bound step and deserves its own word). "Under review" is not a state of the
fix item: it is `waiting` on `review:<reviewer>`, while the reviewer's own item is `reviewing`. `done` is added for
work that never lands code. No transition rules are enforced (any state to any state; history records it): agents
skip steps legitimately and a state machine would only produce refusals.

## 4. Waiting on

Self-reported (`--waiting-on <kind>[:<target>][:<text>]`; `none` clears it):

| kind | target | example | page |
|---|---|---|---|
| `chrome` | – | `chrome:A/B of st5` | Waiting for the Chrome slot |
| `phone` | – | `phone:P-039 block` | Waiting for the phone |
| `user` | – | `user:swipe test` | Waiting on you |
| `lead` | – | `lead:land request` | Waiting on the lead (land / approval / signature) |
| `agent` | agent name | `agent:fix-nav-morph:y answer` | Waiting on fix-nav-morph |
| `review` | reviewer | `review:review-cdwc` | Waiting for a review by review-cdwc |
| `incident` | I-0NN | `incident:I-042` | Blocked by I-042 (its title) |
| `item` | status id | `item:st5` | Waiting on another workstream (its state shown) |
| `other` | – | `other:Xcode setup` | the text |

`set --state <s>` is a full transition report: `waitingOn` becomes what that command gives (cleared if it gives
none). `set` without `--state` (a note or next-step update) keeps it. `waiting` without `--waiting-on` is refused;
`ready-to-land` defaults to `lead:land request`.

Derived (computed at read time from `gatherLive()` in progress.mjs, never stored, shown beside the self-reported
state, never overwriting it). A workstream matches a record when the record's owner is the item's `owner`, its `id`
or one of its `aliases`:
- **Chrome / phone queue:** queued on `chrome-measure` / `iphone` → "in line for Chrome, #2 of 3" (`status(r).queue`
  order; the short lane can reorder, so the page says "in line", not an ETA). Holding the lock → "using Chrome now /
  on the phone now" (an activity marker, not a wait).
- **User:** a pending/active console step posted by the owner → "waiting on you: C-014 <title>" (title sanitized,
  never the URL or instructions), linked to `/#C-014`.
- **Incident:** an active incident with `blocking` whose reporter or a blocking `affected` entry is the owner →
  "blocked by I-042 <title>".
- **Resolved waits:** a self-reported `incident:` wait whose incident is resolved/parked, or an `item:` wait whose item
  is finished, is flagged "what it waited on is over: update?" (catches stale waits).

## 5. Priority and staleness

- `status.mjs priority <id> <n>|none --by lead [--note why]`: refused unless `--by lead` (the same convention as
  `finding.mjs resolve`; `set --priority` does not exist). History records it. Sort: priority ascending (unranked last),
  then group (working, waiting, waiting to start, parked, finished), then most recently updated.
- Stale: an item in a working/waiting/queued state not updated for more than **2 h** (`FW_STATUS_STALE_MIN`) shows
  "not updated". Lead decision (2026-10-02): an item with a *live* derived wait (still in the Chrome or phone queue,
  holding a lock, or with a pending console step) is not stale; otherwise waiting and measuring go stale at 2 h too.
  Parked and finished items are never stale.

## 6. CLI (`tools/status.mjs`, library `tools/lib/status.mjs`)

```sh
# agents, at every state change and on resume (creates the item on first use if --kind and --title are given)
node tools/status.mjs set <id> --by <agent> --state implementing --note "<plain line>" [--next "<plain line>"]
     [--waiting-on lead:"land request" | none] [--kind fix --title "<plain>"] [--owner <agent>] [--progress <PROGRESS id>]
     [--refs P-039,I-042] [--alias <lock owner name>]          # prints SET <id>: <state> (was <old>)
node tools/status.mjs mine --by <agent>                        # my items (resume)
node tools/status.mjs list [--all] [--state s] [--kind k] [--owner a] [--json]   # the board as text, priority order
node tools/status.mjs show <id> [--json]                       # one item with history and live waits
# lead
node tools/status.mjs priority <id> <n>|none --by lead [--note "<why>"]
# once (lead/mgmt-ops): seed from PROGRESS.json (active fix items) + a seed file; dry run unless --apply
node tools/status.mjs seed --by <agent> [--file <seed.json>] [--apply]   # skips ids that exist
node tools/console.mjs status [--json]                         # the same text as `status.mjs list`
```

Exit codes: 0 ok, 1 usage or refused (reason on stderr). `--by` defaults to `$FW_AGENT`. No `wait` command (nothing
needs to block on a status).

## 7. Page

A new page **`/status`** ("Status" in the console menu, between "Your steps" and "Progress"), not a section on
`/progress`. Reasons: a different unit (workstreams, ~25, vs fix results, ~13) and a different rhythm (self-reported,
refreshes every 5 s; `/progress` is a curated narrative); `/progress` is already long; the two link each other by id
(a status row whose item has `progress` links to `/progress#<id>`). `GET /api/status` returns the view, read-only,
behind the same localhost Host check and CSP; the page never writes (priority stays a lead CLI command).

Layout, plain words, text only (`textContent`):
1. Header: "Who is doing what", live time, counts ("14 working, 5 waiting, 2 waiting on you, 3 not updated").
2. "Waiting on you" callout when any item waits on the user (derived steps or `user:` waits), linked to the steps page.
3. Filter chips by group (All active / Working / Waiting / Parked / Finished) and by kind (Fixes, Tools, Research,
   Phone, Reviews, Ops); remembered in localStorage.
4. Table sorted by priority: Priority (badge, "–" unranked) · Workstream (title, kind chip, id, link to Progress) ·
   State (plain label, "for 40 min") · Waiting on (self + derived, each a chip; "#2 for Chrome") · Owner · Updated
   ("12 min ago", stale in amber) · Note and Next. Below 640 px the rows stack as cards.

## 8. Relation to PROGRESS.json

PROGRESS stays the curated headline of fix results. A status item carries `progress: "<item id>"`; neither file
restates the other. `seed` creates one status item per PROGRESS item in state testing/diagnosing (owner, title and
`progress` copied once; state `measuring`/`researching` by stage; note "seeded from PROGRESS; update me").

## 9. Adoption

- `.claude/agents/fix-owner.md`, `toolsmith.md`, `wave-integrator.md`, `fix-reviewer.md` (a store write, not a
  commit): one paragraph "Status board: `status.mjs set <id> --by <you> --state …` at every state change, when you
  start waiting and when it ends, and `status.mjs mine` on resume." `bundle-mapper` gets nothing (its fix owner reports).
- `fixes/AGENT_ROLES.md`: a "Status board" section (who reports what, the lead sets priority, mgmt-ops curates stale
  items).
- Proposed CLAUDE.md line (lead-owned, not edited by me), under "Agent communication":
  `- **Status board** (tools/status.mjs, console /status): report your workstream's state at every transition, when
  a wait starts or ends, and on resume (status.mjs mine --by <you>): node tools/status.mjs set <id> --by <you> --state
  researching|designing|implementing|testing|measuring|reviewing|coordinating|waiting|ready-to-land|parked|landed|done|
  dropped --note "<one plain line>" [--next "…"] [--waiting-on lead:"land request"|agent:<name>|incident:I-0NN|…]; the
  board adds your Chrome/phone queue place, your console steps and blocking incidents by itself; only the lead sets
  priority (status.mjs priority <id> <n> --by lead).`
- mgmt-ops: replaces the hand-written "Who waits on what" table in ops-handover.md with `status.mjs list`; nudges owners
  of stale items.
- Seed: `research/architecture/status-board-seed.json` (docs commit) from the peer directory, lock and incident state
  of the day; the lead runs `node tools/status.mjs seed --by lead --file research/architecture/status-board-seed.json
  --apply` after landing; priority left empty for the lead.

## 10. Tests

- `tests/unit/status.test.mjs` (temp `FW_STATE_DIR` each): id/state/waiting-on parsing; `set` creates, updates,
  clears waits on a state change, keeps them on a note update, refuses `waiting` without a wait, refuses unknown items
  without `--kind/--title`; history cap; priority only `--by lead`; personal data refused on write (URL, 192.168.77.12,
  e-mail, device id, home path) and scrubbed on read (a lock owner / step title with a LAN URL); derivation: queue
  positions on both locks via lease waiters, holder marker, pending step by the owner, blocking incident, alias match,
  resolved-wait flag; staleness at the boundary; sort order; `renderText`; seed from a PROGRESS fixture + seed file
  (dry run writes nothing, `--apply` skips existing ids).
- `tests/e2e/status-cli.test.mjs`: the CLI end to end on a temp state dir; `console.mjs serve --port 0` serves
  `/status` (menu with Status highlighted) and `/api/status` (no `192.168`, `http://`, `/Users/` in the body; POST 404;
  foreign Host 421); `console.mjs status` prints the board. Menu tests extended for the third link.
- I-041: no lock-library changes; all tests run on temp state dirs, never the live `.git/fastwork-mirror/`. My manual
  page check runs `console.mjs serve` on a temp `FW_STATE_DIR` and its own port (the lead's 5559 untouched; the server
  writes `server.json` into the state dir, so the temp dir also keeps the lead's server record intact).

## 11. Questions, answered by the lead (2026-10-02)

1. Priority scale: integers 1..99, ties allowed, lower = sooner; shown "#1, #2…", none sorts last. (Implemented.)
2. The page stays read-only; priority only from the lead CLI (the user asks the lead, later via console threads).
3. Stale at 2 h for every working/waiting state, except while a derived wait is live (§5). (Implemented.)
4. A live-status chip on `/progress` items: done in the same tool commit (`progress.mjs` attaches `status` to each
   item linked by `progress`; the page shows "now: measuring · in line for Chrome, #2 of 3", linked to
   `/status#<id>`; `console.mjs progress` prints a "now:" line).

## 12. As built (differences from the plan above)

- `coordinating` added for ops items (mgmt-ops, the lead's own coordination), group "working".
- `/status#<id>` and `/progress#<id>` scroll to and flash that row/card once (the shared `ConsoleNav.reveal` only knows
  console step ids).
- The menu reads "Your steps · Status · Progress" (ts-console-threads adds "Threads" after Progress; agreed hunks).
