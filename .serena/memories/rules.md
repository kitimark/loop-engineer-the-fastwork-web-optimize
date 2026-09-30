# Hard rules (summary; CLAUDE.md "Hard rules" is authoritative, with reasons and enforcement)

1. Rebase + fast-forward only: `git rebase main` on the branch, then `git merge --ff-only <branch>`. No merge commits,
   no squash merges, never merge main into a branch; `git pull --rebase` only.
2. Never push; no remote; publish nothing (`gh repo create`, gists, PRs).
3. Never commit `site/`, `site-pretty/`, `out/`, `fixes/*/overlay/`, `.serena/cache/`, `*.pem`; never `git add -f`.
   `patch.diff` only on local branches.
4. The baseline (`site/`, `site-pretty/`) is read-only. Change code only in `fixes/<topic>/overlay/` copies made with
   `node tools/fix.mjs edit <topic> <file>`; don't run mirror/prettify while agents work.
5. Work in your own worktree under `.claude/worktrees/`; only the lead uses the main checkout and lands on main.
6. Fix agents never modify `tools/`, `tests/`, `.githooks/`, `.claude/hooks/`, `.claude/settings.json`: report to the lead.
7. Chrome A/B only via `tools/verify.mjs` / `tools/fix.mjs ab` under the `chrome-measure` lock; never `--no-lock`.
8. No chrome-devtools MCP performance traces (they hang on throttled traces).
9. The iPhone only while holding the `iphone` lease (`tools/lock.mjs`).
10. Never use or kill port 5173; worktrees use `serve.mjs --port auto` (5200-5999).
11. Serena is read-only here: navigate with it, edit with Claude Code's Edit tool, never write memories.
12. Never send the user's personal data to external services.

Calibrated test setting (not a rule, the default): Chrome, mobile 430x932, DPR 3, touch, CPU 6x, served with
`--vendors=local --https --latency 150`. Source: `research/cpu-throttle-calibration/README.md`.
