# Console proposals: the user reads, compares and decides on visual PoCs

Status: implemented (ts-proposals, 2026-10-02; design approved by the lead with three additions: `wait --any`,
`needsPhone`, Mac-only live links), for the user request of 2026-10-02: design engineers
(`de-illusion-style`, `de-illusion-composite`) build PoCs that replace an expensive live effect (style recalc,
compositing) with a cheaper one that looks the same or nearly the same. Each PoC reaches the user as a
**proposal** in the user console. The user reads it, compares the original and the PoC, and accepts it,
rejects it, or asks for a change.

**Options (I-053, ts-i053, 2026-10-02).** The user, on PR-001 (06:31Z): "the proposal feature could propose the
multiple solution in the same proposal topics and allow user to decide which one". A proposal may now carry 2-6
named **options** (§2.3), each with its own idea, visual difference, gain, risk and B shots against the shared
original A; the user picks one when accepting, and every wait reports the pick as `option`. A proposal without
options (every proposal before I-053) is stored, served and shown exactly as before.

**Holds and stale decisions (T-030, ts-proposal-hold, 2026-10-03).** In console thread T-030 the user asked for
tools that handle this case properly. PR-008 was posted. A review then found errors in its card, and the lead
asked the user in a thread not to decide. Six minutes later the user accepted it on the Proposals page, where
nothing said it was under revision. `revise` then refused the accepted proposal ("post a new proposal instead"),
so the acceptance stayed tied to the incomplete card. Three additions handle this (§4.1):
- An agent or the lead can put a proposal **on hold**: the page shows the note on top and switches the decision off.
- A hold on a decided proposal puts that decision **under review**.
- A revision after a decision makes the decision **stale**, and the user decides again on the new revision.

A proposal that is never held, and never revised after a decision, is stored, served and shown exactly as before.

## 1. Pieces

| piece | file | what it does |
|---|---|---|
| store, schema, state machine | `tools/lib/proposal.mjs` | `fw-proposal/1` validation, scrubbing, media copy, post / revise / decide / withdraw, wait condition |
| CLI | `tools/lib/proposal-cli.mjs`, entered from `tools/console.mjs proposal …` | post, list, show, revise, publish, withdraw, decide (the lead, for a chat answer), hold, unhold, wait |
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

T-030 (§4.1) adds three stored fields and one computed value:
- `hold` `{by, note, at, rev}`, present while the proposal is on hold.
- `staleDecision`: the decision a revision made stale, plus `staleAt` and `staleOnRev`. It stays until the user
  decides again. The same entry in `decisions` is marked too.
- `decision.keptThrough`, set after `revise --keep-decision`.
- `decisionState` is computed, never stored. `show --json`, `list --json` and the waits carry it.

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

### 2.3 Options: several solutions in one proposal (I-053)

When there is more than one way to do it, put them in one proposal as `options` instead of posting one proposal per
way. The problem and the original A are shared; each option is a full solution of its own, compared against that
same A. Mark the one you recommend, with a reason.

```jsonc
{
  "schema": "fw-proposal/1",
  "title": "Word swap without restyles",
  "area": "hero",
  "problem": "The word swap restyles 120 elements per frame.",         // shared, required
  "idea": "Three ways to show the same swap without a restyle.",      // optional shared text (so are looksSame, risk)
  "compare": { "a": { "label": "Original (SVG)", "url": "https://localhost:5612/" }, "view": "side" },
  "options": [                                                          // 2-6
    { "name": "tiles",                                                  // short id: a-z 0-9 . _ - (decide --option tiles)
      "label": "Frames as tiles",                                       // what the user reads (default: the name)
      "idea": "…", "looksSame": "…", "risk": "…",                       // looksSame may come from the shared one
      "visualDiff": ["0 px differ at 7 frozen times"],
      "gain": [{ "what": "Elements restyled per frame", "before": "120", "after": "0", "tag": "OBSERVED", "how": "Chrome trace, 3 runs" }],
      "compare": { "b": { "label": "Tiles", "url": "http://localhost:5613/" },
                   "shots": [{ "caption": "Top", "a": "out/a-0.png", "b": "out/tiles-0.png" }] } },
    { "name": "video", "label": "Video, HEVC with alpha", "…": "…",
      "compare": { "b": { "label": "Video" }, "video": { "a": "out/a.mp4", "b": "out/video.mp4" } } },
    { "name": "copy", "label": "Visible copy only", "…": "…", "compare": { "b": { "label": "Copy" }, "shots": [ … ] } }
  ],
  "recommended": { "option": "tiles", "why": "Fewest restyles and 0 px differ." }   // optional
}
```

- With `options`, `visualDiff`, `gain`, `compare.b`, `compare.shots` and `compare.video` go **in each option**
  (at the top they are refused); `idea`, `looksSame` and `risk` may stand at the top as shared text. Every option
  needs an idea, a visual difference, a gain row, a risk and a screenshot pair or a video (a draft only the names).
- A's screenshots are given per pair in each option (the same file may repeat). Media are stored per option:
  `r1-o2-a-1.png`, `r1-o2-video-b.mp4` (o2 = the second option).
- CLI shots with options: `--option <name>` says which option `--shot-a/--shot-b/--video…` belong to (required
  then; one option per call), e.g. `proposal post --file p.md --option tiles --shot-a a.png --shot-b t.png`, then
  `proposal revise <id> --note "video clip" --option video --video-a a.mp4 --video-b v.mp4`.
- Markdown: `## Option <name>: <label>` blocks, each with an optional `b: label | url` line and `### Idea`,
  `### Looks the same`, `### Visual difference`, `### Gain`, `### Risk`; front matter `recommended: <name> | <why>`.
- `revise --file`: the file's list replaces the old one, so options can be **added, changed or dropped**; an option
  without new shots keeps the media of the old option with the same name (a renamed option needs new shots). A
  file without `options` turns it back into one solution (and one with options turns a single one into options).
- Decisions: on a proposal with options, **accept needs the option** (`decision.option` = its name; the page asks
  "Which option do you accept?", the CLI takes `--option <name or label>`); a change request may name one ("About
  which option?"); reject is for the whole proposal (to drop one option, request a change). An undo keeps the
  undone pick as `wasOption` in the events.

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
     # T-030 (§4.1): accepted | rejected -> proposed (rev+1), and the decision goes STALE.
     #   [--keep-decision] instead keeps it final (typo fixes only).
     #   A hold stays, unless --unhold or --publish is given.
node tools/console.mjs proposal hold <id> --by <agent|lead> --note "<plain words, for the user>"   # HELD PR-008 …
node tools/console.mjs proposal unhold <id> --by <agent|lead> [--note "..."]                        # UNHELD PR-008 …
node tools/console.mjs proposal publish <id> --by <agent>          # draft -> proposed
node tools/console.mjs proposal withdraw <id> --by <agent> [--note "..."]   # no longer offered (wait: NEVER)
node tools/console.mjs proposal decide <id> --by lead --value accept|reject|change [--option <name>] [--notes "..."]  # the user answered in chat
     # options (§2.3): accept needs --option; post/revise take --option <name> for their --shot-a/--shot-b/--video flags
node tools/console.mjs proposal wait <id> [--until decided|changed] [--since <ISO>] [--timeout 3600] [--json] [--quiet]
     # exit 0 MET, prints {id, rev, value, notes, at, title, was}; 3 TIMEOUT; 4 NEVER (withdrawn); 1 usage
     # decided: met while it stands decided (at once if it already is); --since T: a decision after T that still
     # stands (an undo alone does not wake it, the re-decision does). changed (--since default now): any decision
     # event after T, i.e. a decision, an undo, a changed decision; prints {id, state, decision, events}.
     # Every MET prints "Re-arm (wakes on an undo or a changed decision): … --until changed --since <last event>"
     # T-030: only a FINAL decision meets `decided` (not one on hold, not a stale one). On a held or stale proposal
     #   the wait starts with a "note: …" line on stderr, and its state says "on hold (lead: …)" or
     #   "… is stale: re-decide on rev N". `changed` also wakes on held / unheld / stale events.
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

**The picked option (I-053).** Every decision JSON (`wait <id>`, `wait --any` decisions, `wait --until changed`
decision) carries `option` (the name, or null), and every event `option` and `wasOption` (the pick an undo took
back, or the one a re-decision replaced). The printed lines say it: `PROPOSAL PR-004 decided accepted, option: tiles
(was accepted, option: video) by user at …`, `proposal list`/`show` `-> accepted, option: tiles`, and a plain
`wait <id>` prints `  option: tiles` under its MET line.

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
  refused (409, "it was revised; reload"). `accepted` and `rejected` stay final until a hold or a revision (§4.1).
  A new idea is still a new proposal.
- The user can change their mind on the page until the agent acts: "Change my decision" on a decided proposal
  sets it back to `proposed` (history keeps both). `wait --until decided` returns at the first decision; an
  undo or a changed decision after it wakes `wait --until changed --since <that decision>`, `wait --any` and the
  lead's `thread wait --as lead` (I-045).
- **Request change**: the notes are stored on the proposal (`decision.notes`). If the proposal names a `thread`,
  the page links it (`/threads#T-004`); creating a thread from the page waits for ts-console-threads to land.

### 4.1 Holds and stale decisions (T-030)

```
proposed --hold--> proposed + hold   (not waiting: no badge, not in list --waiting; page: banner, decision off)
accepted --hold--> accepted + hold   (decisionState under-review: kept, not final; wait --until decided not met)
<any> + hold --unhold | revise --unhold | revise --publish--> without the hold (a standing decision is final again)
accepted | rejected --revise--> proposed rev+1, decision null, staleDecision set (decisionState stale; re-decide)
accepted | rejected --revise --keep-decision--> same state, rev+1, decision still final (keptThrough = rev+1)
```

**`decisionState`** takes one of four values:

| value | meaning |
|---|---|
| `final` | a decision stands and the proposal is not on hold |
| `under-review` | a decision stands and the proposal is on hold |
| `stale` | no decision stands, because a revision replaced the one the user made |
| `null` | never decided |

- **Who reads it.** An agent acts on a decision only when it is `final`. `show --json` and `list --json` always
  carry it. The page API carries it only when it is not final, so a never-held proposal is served byte for byte
  as before.
- **Hold.** The author or the lead runs `proposal hold <id> --by <you> --note "…"`. The note is scrubbed
  (Hard rule 12). While the hold stands:
  - the page puts a banner with the note at the top of that proposal ("On hold: please don't decide yet");
  - it disables Accept, Reject, Request change and "Change my decision";
  - the proposal moves under "On hold" in the list and out of the badge count;
  - `decide` and `undo` refuse with "PR-008 is on hold (lead: …): …": 409 on the page API, exit 1 in the CLI;
  - if the user is typing notes when the hold arrives, the page redraws anyway.

  A second `hold` replaces the note. Drafts can't be held (the user doesn't see them), and neither can withdrawn
  proposals. `unhold` lifts the hold.
- **Under review.** A hold on a decided proposal keeps the decision (in `decision` and the history), but the
  decision is not final:
  - `wait --until decided` is not met, and `wait --any` leaves it out of `decisions`;
  - a `held` event wakes `wait --until changed`, `wait --any` and `thread wait`. The lead's wait covers all
    proposals; an author's covers only its own.

  `unhold` without a revision makes the same decision final again and records an `unheld` event.
  `wait --until decided --since T` is met when the release comes after T.
- **Stale.** A revision of an accepted or rejected proposal changes what the user decided on. By default the
  decision goes stale:
  - the state goes back to `proposed` on the new revision, and `decision` is null;
  - the old decision is kept in `staleDecision` and in `decisions` (marked `staleOnRev`);
  - the page shows "Please decide again on revision N" with the revision note;
  - a `stale` event wakes the waits above. Example line: `PROPOSAL PR-008 decision stale (was accepted on rev 1):
    re-decide on rev 2, revised by …`.

  `wait --until decided` waits for the re-decision, which arrives as a `decided` event whose `was` is the stale
  decision. Before T-030, revise refused such a proposal ("post a new proposal instead").
- **`--keep-decision`** is for a revision that does not change what the user decided on: a typo, a clearer word.
  A revision that changes a number, a gain, a visual difference, the risk or the media must go stale (the
  default). When in doubt, leave the flag off. It is refused on a proposal without a standing accepted or
  rejected decision, because such a revision answers a change request.
- **The PR-008 flow.**
  1. As soon as a review finds an error in the card, the lead (or the author) holds the proposal instead of asking
     in a thread, for example: `proposal hold PR-008 --by lead --note "A review found errors in the card; a
     corrected revision follows. Please don't decide yet."`. A decision the user already made is now under review.
  2. The author revises the card. The decision goes stale, and the hold stays while more checks run.
  3. When the card is right, the author runs `proposal revise PR-008 … --unhold` (or the lead runs `proposal
     unhold PR-008`).
  4. The user decides again on the corrected revision. The author's `wait --until decided` returns only then.

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

On hold (T-030, §4.1):
- a banner with the note sits at the top of the proposal;
- the decision buttons and "Change my decision" are disabled;
- a decision already made reads "(under review, not final)";
- the list shows the proposal in an "On hold" section.

A stale decision gets a banner "Please decide again on revision N" that says what changed, and the list row reads
"decide again".

With options (I-053), items 2-4 become: the shared text, then "N ways to do it": one card per option side by side
(label, "Recommended", the first gain row, the first visual difference), which are the tabs (click or arrow keys);
the recommendation and its reason; and the chosen option in full (idea, looks the same, what looks different, gain,
risk) with its own compare block (A vs this option's B, its own shot pairs and video). Accept shows "Which option
do you accept?" (the option on screen is preselected) and the button names it ("Accept "Frames as tiles" (revision
1)"); Request change offers "About which option? (optional)"; Reject says it turns down every option. A decided
proposal shows "Accepted: <option>", and opens on that option. The list row says "· 3 options".

Notifications: the menu badge counts waiting proposals, the tab title adds them to the steps count, and a new
proposal raises a banner ("New proposal: …", Open -> `/proposals#PR-001`), the chime and a desktop notification
(once per browser), and with `serve --notify` a macOS notification. Proposals are never reminded: they are not
urgent the way a gated finger test is.

## 6. Hard rules

- Rule 3: screenshots and recordings are Fastwork-derived. The CLI **copies** them into the store
  (`.git/fastwork-mirror/console/proposals/<id>/`); the server serves them only to localhost (the console's
  Host check), from that directory only (`/media/PR-001/r1-a-1.png`; the name must match
  `^r\d+-(o\d+-)?(a|b)-\d+\.(png|jpg|webp|gif)$` or `^r\d+-(o\d+-)?video-(a|b|both)\.(mp4|mov|webm)$`, the
  `o<k>-` part for an option's media (I-053), so no path traversal).
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
`changes-requested` revise with `proposal revise <id> --note …`; never land a PoC the user has not accepted.
When your card turns out wrong (a review, a later check), run `proposal hold <id> --note …` at once, then revise.
Act on a decision only while `proposal show <id> --json` says `decisionState: "final"`."
