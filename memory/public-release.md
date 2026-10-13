---
name: public-release
description: "the study's public release: Fastwork approved; a scrubbed copy built outside this repo, history and all branches kept and rewritten, large files as GitHub Release files; only the user pushes and uploads"
type: project
audience: every agent
since: 2026-10-13
---

**Rule (user, Claude Code chat, 2026-10-13; console thread T-170 #412-#430).** Hard rules 2 and 3 have one exception: a
scrubbed public release, with the patches in its repo and the frozen snapshot plus reviewed proposal pictures and videos
as GitHub Release files. It is built in a separate folder outside this repo, and only the user pushes it and uploads its
files. This repo still gets no remote and no push, and nothing Fastwork-derived is committed here for it.

**Why.** Fastwork's Engineering Partner approved publishing "the link and source ... according to your study" (12 Oct, pasted
by the user in T-170 #412). The user chose to include the compiled snapshot (option B, #416), keep every commit and all
284 branches rewritten rather than fresh history (#421, #423), keep their own commit name and email (artifact comment), put
large files in a GitHub Release fetched by a setup script (#418), and include the parts of `out/` that write-ups cite (#419).

**How to apply.**
- The release copy is made by script, never by hand: rewrite (git-filter-repo v2.47.0, values to tokens, cited SHAs
  remapped), scrub, fail-closed checker, console export, picture encoder, packer with `release-assets.json`, `npm run init`.
- Personal values sit in a file outside the repo (mode 600) and are never printed. The checker must report 0 matches
  before the user reviews the scrub report; nothing is pushed or uploaded before that review.
- Uncommitted work in agent worktrees is saved as evidence branches at build time, without touching the worktrees.
- Never run `git push`, `gh release create` or an upload yourself, even in the release folder: hand the user the exact
  line. Plan page and trial data: the lead's release plan (T-170), scratch dirs release-history/, release-branches/,
  release-out/, scrub/.
