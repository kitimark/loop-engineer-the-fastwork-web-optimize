# Project overview (fastwork-com-web-optimize)

Personal, educational scroll-performance study of the public homepage https://fastwork.com/ on a local
mirror (not affiliated with Fastwork). Authoritative docs, read them instead of relying on this summary:
- `CLAUDE.md`: layout, hard rules, fix workflow in worktrees, locks, agent teams.
- `README.md`: mirror tooling (`tools/mirror.mjs`, `serve.mjs`, `verify.mjs`, `prettify.mjs`).
- `research/01-initial-investigation/` (README findings, `motion-inventory.md` = every scroll effect).
- `research/cpu-throttle-calibration/` (which Chrome CPU throttle matches the iPhone).
- `fixes/TOPICS.md` (12 fix topics, pretty line ranges, conflict clusters), `fixes/README.md`, `fixes/AGENT_PROMPT.md`.

Layout:
- `tools/*.mjs`, `tools/lib/*.mjs`: Node ESM tooling (tracked). Key: `fix.mjs` (new/edit/show/grep/serve/ab/diff/combine),
  `lock.mjs` + `lib/lock.mjs` (cross-worktree locks in the git common dir), `lib/paths.mjs` (finds the baseline in the
  main checkout via `git rev-parse --git-common-dir`), `lib/cdp.mjs` (raw CDP), `verify.mjs` (measurement).
- `research/**/tools`: one-off .mjs/.py/.js scripts; `research/**/data`: JSON results (not indexed by Serena).
- `site/` (byte-identical mirror) and `site-pretty/` (Prettier copy): gitignored, main checkout only, Fastwork's code.
  Serena indexes only `site-pretty/_app/` (first-party SvelteKit bundles, 12 JS files).
- `fixes/<topic>/`: README.md, patch.diff, results.json (committed on local worktree branches) + gitignored `overlay/`
  (editable copies of baseline files, served in front of the baseline).
- `out/`: gitignored measurement output / Chrome profiles.
