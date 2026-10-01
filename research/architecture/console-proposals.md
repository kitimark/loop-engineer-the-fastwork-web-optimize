# Console proposals: the user reads, compares and decides on visual PoCs

Status: implemented (ts-proposals, 2026-10-02; design approved by the lead with three additions: `wait --any`,
`needsPhone`, Mac-only live links), for the user request of 2026-10-02: design engineers
(`de-illusion-style`, `de-illusion-composite`) build PoCs that replace an expensive live effect (style recalc,
compositing) with a cheaper one that looks the same or nearly the same. Each PoC reaches the user as a
**proposal** in the user console. The user reads it, compares the original and the PoC, and accepts it,
rejects it, or asks for a change.

## 1. Pieces

| piece | file | what it does |
|---|---|---|
| store, schema, state machine | `tools/lib/proposal.mjs` | `fw-proposal/1` validation, scrubbing, media copy, post / revise / decide / withdraw, wait condition |
| CLI | `tools/lib/proposal-cli.mjs`, entered from `tools/console.mjs proposal …` | post, list, show, revise, publish, withdraw, decide (the lead, for a chat answer), wait |
| page | `tools/lib/proposals-page.html` at `/proposals` | list (waiting first), one proposal, compare views, the decision buttons |
| HTTP | `tools/lib/console-server.mjs` (an additive block) | `GET /proposals`, `GET /api/proposals[/<id>]`, `GET /media/<id>/<file>`, `POST /api/proposals/<id>/decide` |
| badge, banner | `console-notify.mjs` `waitingView().proposals`, `console-nav.js` | a "Proposals" menu badge (proposals waiting for a decision), a "New proposal" banner and chime, `--notify` |

Store: `<git-common-dir>/fastwork-mirror/console/proposals/PR-001.json`, media in
`…/console/proposals/PR-001/` (`$FW_STATE_DIR/console/proposals/` in tests). The store is the console's: local,
gitignored, shared by every worktree, never committed (Hard rule 3).

## 2. Schema `fw-proposal/1`

An author writes a JSON file (or a Markdown file, §2.2); the tool assigns `id`, `by`, times, `state`, `rev`.

```jsonc
{
  "schema": "fw-proposal/1",
  "title": "Hero glow as a pre-rendered image",                 // one line, ≤ 120
  "area": "hero",                                                // hero | middle | end | whole
  "topic": "style-recalc-r4",                                    // optional: a PROGRESS item id / topic slug
  "thread": "T-004",                                             // optional: a console thread id (ts-console-threads)
  "problem": "Plain words: what costs, where, the numbers.",     // ≤ 2000 each
  "idea": "What changes.",
  "looksSame": "Why it looks the same.",
  "visualDiff": [                                                // honest list: what differs, when you'd notice it
    "The glow no longer follows the cursor on desktop; on the phone there is no cursor.",
    "At 3x zoom the glow edge shows 1-2 px banding."
  ],
  "gain": [                                                      // 1-12 rows
    { "what": "Elements restyled per scroll frame", "before": "412", "after": "38",
      "tag": "OBSERVED", "how": "Chrome trace, 430x932, CPU 6x, 3 runs" },
    { "what": "Composited layers in the hero", "before": "41", "after": "12",
      "tag": "estimate", "how": "Chrome layer count; WebKit not checked yet", "needsPhone": true }
  ],
  "risk": "What could go wrong.",
  "compare": {
    "a": { "label": "Original (baseline)", "url": "https://localhost:5612/" },
    "b": { "label": "PoC", "url": "https://localhost:5613/" },
    "shots": [                                                   // matching scroll positions; paths relative to this file
      { "caption": "Top of the page (scrollY 0)", "a": "out/shots/a-0.png", "b": "out/shots/b-0.png" },
      { "caption": "Middle (scrollY 2400)",       "a": "out/shots/a-2400.png", "b": "out/shots/b-2400.png" }
    ],
    "video": { "a": "out/rec/a.mp4", "b": "out/rec/b.mp4" },     // optional; or { "both": "out/rec/side-by-side.mp4" }
    "view": "slider"                                             // optional default view: side | slider | blink
  }
}
```

- `tag`: `OBSERVED | CONFIRMED | estimate` (`UNRESOLVED`, `REFUTED` are also accepted, as on the Progress page).
  `before` and `after` are strings (a number is turned into a string), each ≤ 80 characters.
- Gains are **counts** (user direction 2026-10-02 19:27Z: timing is deferred): restyled elements, layout counts,
  layers, paint area, records. A timing row is allowed but is not the headline.
- `needsPhone: true` on a gain row: the page shows a "phone check needed" chip (a compositing gain only the
  iPhone can confirm). `how` is required for a proposed (not a draft) row.
- `compare.a.url` and `compare.b.url`: **localhost only** (`http(s)://localhost|127.0.0.1|[::1]:<port>/…`). Any
  other host is refused (Hard rule 12: no LAN addresses). They are optional: a proposal can be screenshots only.
- Shots: at least one pair, or a video, is required for `proposed` (a `draft` can have none). Up to 12 pairs.
  PNG, JPEG, WebP or GIF, ≤ 15 MB each (checked by magic bytes, not the extension). Video: MP4/MOV or WebM,
  ≤ 200 MB. Pairs are side by side, so A and B should have the same size (the page scales both to one width).
- Text fields are plain text; the page shows them with `textContent`, never as HTML. Blank lines split paragraphs.

### 2.1 What the tool adds

`id` (`PR-001`…), `by`, `createdAt`, `updatedAt`, `rev` (1, +1 per `revise`), `state`, `decision`
`{value: accepted|rejected|changes-requested, notes, at, who, rev}`, `decisions` (all of them, oldest first),
`revisions` `[{rev, at, by, note}]`, and `history`. Media paths are rewritten to the stored names
(`r1-a-1.png`, `r2-b-1.png`, `r1-video-a.mp4`, …).

### 2.2 Markdown form

A `.md` file with a front-matter block for the short fields and `## Problem`, `## Idea`, `## Looks the same`,
`## Visual difference` (a `- ` list), `## Gain` (a table: what | before | after | tag | how), `## Risk` sections:

```markdown
---
title: Hero glow as a pre-rendered image
area: hero
topic: style-recalc-r4
a: Original (baseline) | https://localhost:5612/
b: PoC | https://localhost:5613/
view: slider
---
## Problem
...
## Gain
| what | before | after | tag | how |
|---|---|---|---|---|
| Elements restyled per frame | 412 | 38 | OBSERVED | Chrome trace, 3 runs |
```

Screenshots and videos come from the CLI flags (§3) with a Markdown file.

## 3. CLI

```sh
node tools/console.mjs proposal post --by <agent> --file <proposal.json|md> \
     [--shot-a <png> --shot-b <png> [--caption "<scroll position>"]]… [--video <mp4> | --video-a <mp4> --video-b <mp4>] [--draft]
     # prints POSTED PR-001: <title>; scrub notes on stderr ("scrubbed 1 ip address in problem")
node tools/console.mjs proposal list [--waiting] [--all] [--by <agent>] [--json]
node tools/console.mjs proposal show <id> [--json]
node tools/console.mjs proposal revise <id> --by <agent> --note "<what changed>" [--file <new json|md>] [--shot-a … --shot-b …] [--video …] [--publish]
     # changes-requested | proposed -> proposed (rev+1); a draft stays a draft unless --publish. --file replaces all
     # text fields; without it the text stays. Shots or videos given replace all old ones; none keep them.
node tools/console.mjs proposal publish <id> --by <agent>          # draft -> proposed
node tools/console.mjs proposal withdraw <id> --by <agent> [--note "..."]   # no longer offered (wait: NEVER)
node tools/console.mjs proposal decide <id> --by lead --value accept|reject|change [--notes "..."]  # the user answered in chat
node tools/console.mjs proposal wait <id> [--until decided|changed] [--since <ISO>] [--timeout 3600] [--json] [--quiet]
     # exit 0 MET, prints {id, rev, value, notes, at, title, was}; 3 TIMEOUT; 4 NEVER (withdrawn); 1 usage
     # decided: met while it stands decided (at once if it already is); --since T: a decision after T that still
     # stands (an undo alone does not wake it, the re-decision does). changed (--since default now): any decision
     # event after T, i.e. a decision, an undo, a changed decision; prints {id, state, decision, events}.
     # Every MET prints "Re-arm (wakes on an undo or a changed decision): … --until changed --since <last event>"
node tools/console.mjs proposal wait --any [--by <agent>] [--since <ISO>] [--timeout 3600] [--json] [--quiet]
     # one background wait for all of an author's proposals, or for ALL proposals without --by (the lead): MET on
     # any decision event after --since (default: when the wait starts), prints {decisions: [standing decisions
     # {id, rev, value, notes, at, title, was}], events: [...]}, one PROPOSAL line per event and
     # "Re-arm: … --since <the last event's at>"
```

**Decision events (I-045).** The user decided PR-001 "rejected" (21:02:13Z), undid it (21:02:45Z) and requested a
change (21:04:04Z); the author's `wait --until decided` had exited on "rejected" and no wait covered all proposals,
so the change notified nobody. The waits now read the history, not only the standing state: every `decided` and
`undecided` entry is an event `{id, n, event: decided|undecided, value, was, rev, notes, who, at, title, by}`
(`was`: the decision undone; on a `decided` right after an undo, the decision it replaced). `--since` is strict
(`at > since`), so re-arming with the printed hint never repeats an event.

The lead's one standing wait covers proposals too: `node tools/console.mjs thread wait --as lead` (without
`--thread`) also wakes on every decision event on every proposal, and an agent's `thread wait --as <agent>` on its
own proposals, printing `PROPOSAL PR-001 decided changes-requested (was rejected) by user at …: <notes>` (`--json`:
items with `kind: "proposal"` after the thread items). Each event is reported once per reader: a read mark per
reader in `<console>/proposal-reads.json` (`{since, seen: {PR-001: <history entries reported>}}`) starts when that
reader's wait is first armed, so older decisions are not news, and moves past what a MET printed.

`--shot-a`/`--shot-b`/`--caption` repeat and pair by order (also comma lists). Agents arm `wait` in the
background (Bash `run_in_background`), as with `console.mjs wait`.

## 4. States

```
draft --publish / revise --publish--> proposed --user--> accepted | rejected | changes-requested
changes-requested --revise--> proposed (rev+1) --user--> …
draft | proposed | changes-requested --withdraw--> withdrawn
```

- Only `proposed` waits for the user: it is counted in the badge and listed first.
- A decision applies to the revision the user saw: the page sends `rev`, and a decision on an older revision is
  refused (409, "it was revised; reload"). `accepted` and `rejected` are final; a new idea is a new proposal.
- The user can change their mind on the page until the agent acts: "Change my decision" on a decided proposal
  sets it back to `proposed` (history keeps both). `wait --until decided` returns at the first decision; an
  undo or a changed decision after it wakes `wait --until changed --since <that decision>`, `wait --any` and the
  lead's `thread wait --as lead` (I-045).
- **Request change**: the notes are stored on the proposal (`decision.notes`). If the proposal names a `thread`,
  the page links it (`/threads#T-004`); creating a thread from the page waits for ts-console-threads to land.

## 5. Page

`/proposals`, a fourth menu entry "Proposals" with its own badge (the number of `proposed`). The list shows
waiting proposals first (oldest first), then the decided ones (newest first). One proposal (`/proposals#PR-001`):

1. Title, area, by, revision, state; the decision (and its notes) when decided.
2. Problem, Idea, Why it looks the same, What looks different (a list), Gain (a table with the tag as a chip,
   "phone check needed" where `needsPhone`, and "how measured" under it), Risk.
3. **Compare**: a view switch **Side by side** | **Slider** (B laid over A, a range input moves the split; also
   the arrow keys) | **Blink** (A and B swap on a button, the space bar, or "auto" every 0.8 s), one shot pair
   at a time with its caption and a pair picker; a link to open each image full size; video A and B side by side
   (or the combined clip), with "play both".
4. "Try it yourself": links to A and B (`target=_blank`, `rel=noopener noreferrer`), with the note that they open
   on this Mac only (localhost), that the server may have stopped, and that the phone goes through the lead.
5. Decision: **Accept**, **Reject**, **Request change**, each with the notes box (Request change needs a note).

Notifications: the menu badge counts waiting proposals, the tab title adds them to the steps count, and a new
proposal raises a banner ("New proposal: …", Open -> `/proposals#PR-001`), the chime and a desktop notification
(once per browser), and with `serve --notify` a macOS notification. Proposals are never reminded: they are not
urgent the way a gated finger test is.

## 6. Hard rules

- Rule 3: screenshots and recordings are Fastwork-derived. The CLI **copies** them into the store
  (`.git/fastwork-mirror/console/proposals/<id>/`); the server serves them only to localhost (the console's
  Host check), from that directory only (`/media/PR-001/r1-a-1.png`; the name must match
  `^r\d+-(a|b)-\d+\.(png|jpg|webp|gif)$` or `^r\d+-video-(a|b|both)\.(mp4|mov|webm)$`, so no path traversal).
- Rule 12: compare URLs must be localhost. Every text field is scrubbed when stored (`progress.mjs sanitize`:
  URLs other than localhost, IP addresses, `*.local`/`*.lan` hosts, e-mail, device ids, home paths, plus
  `redact.mjs`), and the CLI prints what it scrubbed. Pixels can't be scrubbed: take screenshots of the
  localhost pages in Chrome (not Safari's LAN address bar), or crop the address bar off.
- The page renders agent text with `textContent` only; the CSP stays `default-src 'none'` (adds
  `media-src 'self'` for the videos). POST needs `x-console: 1` and a localhost Host header (no CSRF, no DNS
  rebinding), like the step routes; the body is JSON ≤ 64 KB.
- Tests use fake images (generated bytes) and fake addresses (192.168.77.12), a temp state dir and port 0.

## 7. How a DE posts (proposed AGENT_ROLES line)

"Design engineers post a PoC to the user as a proposal: `node tools/console.mjs proposal post --by <you> --file
out/proposal-<slug>.json` with screenshot pairs at matching scroll positions (localhost pages in Chrome, 430x932)
and an honest `visualDiff`; arm `proposal wait <id> --until decided` in the background (after it, re-arm the
printed `--until changed --since …` line so an undo or a changed decision reaches you); on
`changes-requested` revise with `proposal revise <id> --note …`; never land a PoC the user has not accepted."
