---
name: lead-delegates-research
description: "the lead spawns a helper for every research or investigation step (docs, source, bundle code, data, a web-platform question) instead of doing it in its own context; it keeps decisions, landing, user answers and short reads"
type: feedback
audience: lead
since: 2026-10-11
---

**Rule (user, T-170 #343, 2026-10-11): the lead spawns subagents to research instead of researching itself.**

When a user question or a step needs research (Cloudflare/Medium/WebKit/Chromium docs or source, a bundle or code
search, reading logs or data, comparing options), the lead hands it to a helper and waits for the answer:
1. **Spawn a named helper** (`name: <role>-<topic>`, memory [[agent-spawn-names]]): `bundle-mapper` for code and
   web-platform questions (`model: "haiku"` for mechanical lookups), `general-purpose` for docs, product or data
   research. One short prompt: the question, where to look, the status words of [[verify-platform-claims]] and
   [[read-source-first]], and the answer shape (cited, short).
2. **Run it in the background** and keep answering the user; reply in the thread first ("an agent checks X") so the
   user is not left waiting, then post the cited result when it lands.
3. **The lead keeps only**: the decision, landing, the user's thread answers, spawns, and one or two short reads to
   verify a helper's claim (a file:line, a doc line) before it goes to the user.

**Why:** research done inline fills the lead's context, slows its answers to the user and repeats what a cheap helper
does as well. The user asked for it after the lead researched Cloudflare Stream quality and Access login options
itself (T-170 #341 and earlier, 2026-10-11).

**How to apply:** before any `gh api`/WebFetch/doc search or multi-file read, ask "is this research?"; if yes, spawn.
Exempt: a single known-path read or one-line check of a helper's citation. Related: [[lead-delegates-areas-measures]]
(problem areas get owners), [[busy-workers-answer-later]] (helpers answer the user's side questions).
