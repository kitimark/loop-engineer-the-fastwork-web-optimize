# Hard rules (summary; CLAUDE.md "Hard rules" is authoritative)

1. Never commit or push Fastwork assets: `site/`, `site-pretty/`, `fixes/*/overlay/`, `out/` (and never `.serena/cache/`,
   it holds symbol data derived from site-pretty). No remote, nothing is pushed. `patch.diff` only on local branches.
2. The baseline (`site/`, `site-pretty/`) is read-only. Change code only in `fixes/<topic>/overlay/` copies made with
   `node tools/fix.mjs edit <topic> <file>`, in your own worktree. Serena is read-only here for the same reason.
3. No chrome-devtools MCP tracing (hangs on throttled traces). Use `tools/verify.mjs`, `tools/fix.mjs ab`, `tools/lib/cdp.mjs`.
4. Calibrated test setting: Chrome, mobile viewport 430x932, DPR 3, touch, CPU throttle 6x (~ iPhone 15 Pro Max jank),
   served with `--vendors=local --https --latency 150`. Source: `research/cpu-throttle-calibration/README.md`.
5. Measurements are serialized through the `chrome-measure` lock; the iPhone through the `iphone` lease (`tools/lock.mjs`).
6. Never use or kill the main session's server on port 5173; worktrees use `serve.mjs --port auto` (5200-5999).
