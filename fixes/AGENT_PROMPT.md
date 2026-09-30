# Fix-agent prompt template

The lead fills in `{{…}}` and passes the block below as the spawn prompt, with
`subagent_type: "fix-owner"` (`.claude/agents/fix-owner.md` adds the working method, helper and
messaging rules), either
- as a **worktree subagent**: Agent tool with `isolation: "worktree"` and `name: "fix-{{topic}}"`, or
- as an **agent-team teammate**: Agent tool with `name: "fix-{{topic}}"` and no `isolation` (the
  teammate starts in the main checkout and must enter its worktree first, step 0).

Pick topics from `fixes/TOPICS.md`; give topics in the same conflict cluster to one agent, or tell each
agent who the other owners are (`{{related_owners}}`). Append the A/A noise floor and, in wave 2, the
`--on <combined>` base to the block (`fixes/LEAD.md`).

---

You are the fix agent for **{{topic}}** on a local mirror of https://fastwork.com/ (a personal,
educational performance study; not affiliated with Fastwork). Read `CLAUDE.md` first and follow its
hard rules: never commit or push `site/`, `site-pretty/`, `fixes/*/overlay/` or `out/`; the baseline is
read-only; no chrome-devtools MCP; measurements go through the lock; don't touch port 5173.

**Goal.** Make {{topic}} cheaper on the calibrated setting (Chrome mobile 430x932 DPR 3, CPU 6x) without
visible change, and prove it with numbers. Scope: {{scope_from_TOPICS_md}}.
Related owners (message them about findings that touch their code): {{related_owners}}.
Do not change code outside your scope; if you need a change there, message its owner and the lead.

**Steps**
0. Worktree. If you are a teammate (you start in the main checkout), call `EnterWorktree` with name
   `fix-{{topic}}` (or run `git worktree add .claude/worktrees/fix-{{topic}} -b fix/{{topic}}` and
   `EnterWorktree` with that path). Then run `node tools/fix.mjs doctor`: it must say
   `linked worktree yes` and `baseline … OK`.
1. Evidence. Read the relevant parts of `research/01-initial-investigation/README.md`,
   `motion-inventory.md` and `research/cpu-throttle-calibration/README.md`. Find the code with
   `node tools/fix.mjs grep …` / `show … --lines a-b` (locations are in `fixes/TOPICS.md`).
2. Baseline numbers. `node tools/fix.mjs new {{topic}}`, copy the file(s) you will change with
   `node tools/fix.mjs edit {{topic}} <file>`, then (optional, before editing) `node tools/fix.mjs ab --aa --runs 3`
   for the noise floor. The A/B lock may make you wait; do reading/planning meanwhile.
3. Change. Edit only the copies in `fixes/{{topic}}/overlay/`. Keep behaviour identical on desktop,
   on phones, and with `prefers-reduced-motion`. `node --check` every JS file you touched.
4. Check it works. `node tools/fix.mjs serve {{topic}}` in the background; confirm with curl that your
   file comes back with `x-mirror-source: overlay`; stop the server when done.
5. Measure. `node tools/fix.mjs ab {{topic}} --runs 5` (add `--viewport desktop` as a second run if the
   effect is desktop-relevant). It writes `fixes/{{topic}}/patch.diff` and `results.json`. If the
   verdicts are "within noise", say so: a null result is a valid result. Investigate any
   `regressions` (new errors, new 404s, screenshot diff > 0.5 %, morph not reached).
6. Optional iPhone check, only with the lease (CLAUDE.md "Shared devices"): acquire, tell the lead,
   `iphone.mjs open` + `iphone.mjs scroll` for baseline and patched, ask the lead for a finger test if
   your topic is touch-only (scroll-jack, toolbar resize), release, tell the lead.
7. Write `fixes/{{topic}}/README.md` from the template: why it lags (with evidence and line refs), what
   changed, why that is faster, the before/after table (paste `results.json` → `markdown`), risks and
   overlaps with other topics.
8. Commit `fixes/{{topic}}/README.md`, `patch.diff` and `results.json` on your worktree branch (local
   only, no push, no `git add -f`). Don't commit the overlay.

**Report back** (final message / message to the lead): topic, branch and worktree path, files and
functions touched, the key metric deltas with spread and verdicts, regressions (or "none"), what you
told other owners, and open questions.
