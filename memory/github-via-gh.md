---
name: github-via-gh
description: "fetch GitHub (source, issues, raw files) with the gh CLI, read-only; never plain curl to github.com / raw.githubusercontent.com"
type: feedback
audience: every agent
since: 2026-10-04
---

**Rule (user, T-071 #1/#3/#5, 2026-10-04 04:52-04:54Z).** Read GitHub through the authenticated `gh` CLI:
`gh api repos/<owner>/<repo>/contents/<path>?ref=<sha|tag>` (base64 `content`), `gh api repos/<o>/<r>/commits/<sha>`,
`gh search code '<q>' --repo <o>/<r>`, `gh issue view <n> --repo <o>/<r>`. Never plain `curl` or WebFetch to
`github.com`, `api.github.com` or `raw.githubusercontent.com`.

**Why.** Agents fetching engine and framework source (WebKit, Chromium mirrors, Svelte) for platform-claim checks with
unauthenticated curl hit GitHub's rate limit; `gh` is logged in on this Mac and has a far higher limit.

**How to apply.** Read-only only: no `gh repo create`, gist, PR, issue or comment, no push (Hard rule 2). Send no
personal data in queries (Hard rule 12). If `gh auth status` says not logged in, or a call is rate-limited, report it to
the lead (incident, class env) instead of falling back to curl. Cite the repo, path, commit sha and line in the claim.
Board finding F-203.
