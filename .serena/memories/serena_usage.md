# Using Serena in this repo

- Read-only: project.yml sets `read_only: true` and hides editing/memory-writing tools. Edit with Claude Code's Edit.
- One Serena process per Claude Code session, rooted where the session started (`--project-from-cwd`;
  `activate_project` is disabled in the claude-code context). Worktree subagents (`isolation: "worktree"`) and
  agent-team teammates share the lead's Serena, i.e. the MAIN checkout (verified 2026-10-01: a worktree subagent's
  Serena calls hit the main checkout's server). So Serena paths are relative to the main checkout:
  - baseline: `site-pretty/_app/immutable/...`
  - your overlay: `.claude/worktrees/<wt>/fixes/<topic>/overlay/_app/immutable/...` (indexed; edits you make with
    Edit are picked up by Serena on the next call).
  Map Serena results back to absolute worktree paths before editing; never edit a `site-pretty/` path.
- A session launched directly inside a worktree (`claude` run in `.claude/worktrees/<wt>/`) gets its own Serena rooted
  at that worktree (no site-pretty there; only tools/, research/ and the overlay are indexed; index takes ~2 s).
- Index/cache: `.serena/cache/` per checkout, untracked. Warm-up for the main checkout: `serena project index`
  (35 files, ~1 s after LS start).
- Lines: Serena is 0-based, editors/sed are 1-based. See `hot_code_map` for verified symbol name paths.
