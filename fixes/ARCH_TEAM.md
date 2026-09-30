# Architecture team: rendering experts who research and mentor

Started 2026-10-01 by the lead at the user's request. Its job is to bring outside knowledge (public web:
WebKit and Chromium blogs and bug trackers, MDN, web.dev, specs, Svelte docs) to the fix owners, so
they choose the right technique the first time, and to find what the team is missing for the goal
(`fixes/LEAD.md`: iPhone 60 fps, no frame >50 ms).

## Members (start small; the lead scales after 1:1s)

| name | model | focus |
|---|---|---|
| `arch-lead` | opus | principal: reviews each topic's approach against best practice, synthesises the specialists' research into guidance, proposes new topics for the remaining jank, keeps `research/architecture/README.md` |
| `arch-webkit` | opus | iOS Safari 26 / WebKit: scroll-driven animations, compositing and layers, filter/backdrop-filter raster cost, `content-visibility`, the toolbar resize and `visualViewport`, passive touch and overscroll |
| `arch-render` | opus | style/layout/paint pipeline and Svelte 5: style recalc from custom-property writes (`@property`, containment, write scope), forced layout, LoAF reading, reactive cost in per-frame code |
| `arch-bench` | opus | added 2026-10-01 at the user's request: automated per-topic benchmark tests (deterministic mechanism checks + statistical gain checks), the runner the toolsmith builds, and the `bench-author` role that writes one benchmark per finished topic (`research/architecture/automated-benchmarks.md`) |

## Rules

- **Read-only on code and devices.** No Chrome, no iPhone, no locks, no edits to `site*/`, overlays or
  `tools/`. They write only their own notes in `research/architecture/` in their worktree, and the lead lands them.
- **Web research without project data.** Queries and fetches carry generic terms only: no Fastwork code
  excerpts, URLs of the mirror, LAN addresses or personal data (Hard rule 12). Cite every claim with a
  URL and say how sure you are ("spec", "vendor doc", "blog", "bug report", "my inference").
- **They talk to the lead, not directly to owners.** Messaging a finished owner resumes it and sends its
  final report to the sender instead of the lead (the routing problem behind the "only the lead messages
  owners" rule). Advice goes to the lead, who relays it; after I-013 lands, they post it with `finding.mjs`.
- Answers are short and actionable: "for topic X, do Y instead of Z, because (source); expected effect; how
  to verify".

## Scorecard (the lead's 1:1s)

Per member and check-in: questions answered, recommendations relayed, **recommendations adopted** by an
owner (the real metric), claims checked and wrong, useful new topics, tokens used. After two check-ins, the
lead scales: add a specialist where questions queue up, and drop one whose advice isn't adopted.

| check-in | member | answered | relayed | adopted | wrong | new topics | tokens | decision |
|---|---|---|---|---|---|---|---|---|

## Automated benchmarks per topic (user request, 2026-10-01)

Every finished topic should ship an automated benchmark test, so that later waves, combined overlays
and tool changes can't silently undo its gain. Pipeline:

1. `arch-bench` researches and designs it: `research/architecture/automated-benchmarks.md` covers the
   tiers (exact mechanism counters, statistical gain budgets), the per-topic contract, the runner, and
   worked examples. It also drafts the `bench-author` role.
2. The lead reviews the design with the fix owners concerned (design catch-up). A `toolsmith` builds
   the runner test-first (Hard rule 6) and the lead lands it.
3. The lead installs `.claude/agents/bench-author.md` and spawns one `bench-author` per done topic
   (landed or reviewed). Each writes the topic's benchmark on its own branch; the lead lands it.
