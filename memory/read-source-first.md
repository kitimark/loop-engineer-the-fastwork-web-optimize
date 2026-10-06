---
name: read-source-first
description: "if the answer is in open source code (WebKit, Chromium, a library), read that source directly (gh, read-only) before guessing, probing or web searching"
type: feedback
audience: every agent
since: 2026-10-06
updated: 2026-10-06
---

**Rule.** When a question can be answered by open source code (WebKit, Chromium, Svelte, a vendor library, our own
tools), read that code directly first: the public mirrors on GitHub (github.com/WebKit/WebKit,
github.com/chromium/chromium) through the logged-in `gh` CLI, read-only (`gh api repos/<o>/<r>/contents/<path>`,
`gh search code --repo <o>/<r>`), or source.chromium.org. Cite path, line and commit. Probes and web search come
after, to check what the code says or when the code is not open.

**Why.** On 2026-10-06 (user T-221 #1/#3) a helper searched the web for Chrome bugs about the CM blank corners, ran
into the session's web-search limit, and returned nothing citable. The user asked why we did not read Chrome's
engine source directly, and asked for this to be the policy: if something can be known from open source, read it.

**How to apply.** Before a probe series or a web search on engine behaviour, ask: is the answer in open code? If
yes, read it (a sonnet `bundle-mapper` helper with gh is enough), then probe only to confirm. A claim backed by the
code is CONFIRMED with the citation; see [verify-platform-claims](verify-platform-claims.md) and
[github-via-gh](github-via-gh.md). Queries carry no personal data (Hard rule 12).
