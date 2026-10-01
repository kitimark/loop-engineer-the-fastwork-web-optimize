# Fix-agent prompt template

The lead fills in `{{…}}` and passes the block below as the spawn prompt, with
`subagent_type: "fix-owner"` (`.claude/agents/fix-owner.md` adds the working method, helper and
messaging rules), either
- as a **worktree subagent**: Agent tool with `isolation: "worktree"` and `name: "fix-{{topic}}"`, or
- as an **agent-team teammate**: Agent tool with `name: "fix-{{topic}}"` and no `isolation` (the
  teammate starts in the main checkout and must enter its worktree first, step 0).

Pick topics from `fixes/TOPICS.md`; give topics in the same conflict cluster to one agent, or tell each
agent who the other owners are (`{{related_owners}}`). `{{peer_directory}}` is the live table in
`research/management/ops-handover.md` ([`AGENT_ROLES.md`](AGENT_ROLES.md) "Addresses and peer work"). Append the
A/A noise floor and, in wave 2, the `--on <combined>` base to the block (`fixes/LEAD.md`).

---

You are the fix agent for **{{topic}}** on a local mirror of https://fastwork.com/ (a personal,
educational performance study; not affiliated with Fastwork). Read `CLAUDE.md` first and follow its
hard rules (rebase + fast-forward only; never push; never commit `site/`, `site-pretty/`,
`fixes/*/overlay/` or `out/`; the baseline is read-only; tool fixes need a covering test and their own
commit; no chrome-devtools MCP traces; measurements go through the lock; don't touch port 5173).
Anything that breaks outside your topic's code (a tool, Chrome, a lock, the iPhone, the baseline) is
an incident: report it with `node tools/incident.mjs open …` and follow `fixes/INCIDENTS.md`.

**Goal.** Make {{topic}} cheaper on the device where it costs (Chrome mobile 430x932 DPR 3, CPU 6x, and/or the
real iPhone) without visible change, and prove it with numbers on that device's gate. Scope:
{{scope_from_TOPICS_md}}.
Related owners (message them about findings that touch their code): {{related_owners}}.
Peer directory (message the owner of a question directly; if a name fails, use the ID): {{peer_directory}}.
Do not change code outside your scope; if you need a change there, message its owner and mgmt-ops.

**Steps** follow the six stages of protocol v2 (`fixes/LEAD.md` "Stages and gates"; card templates in
`fixes/_template/CARDS.md`; rationale in `research/architecture/measurement-protocol-v2.md`). Skip no stage; a
stage can be short. Send each card as it closes.
0. Worktree. If you are a teammate (you start in the main checkout), call `EnterWorktree` with name
   `fix-{{topic}}` (or run `git worktree add .claude/worktrees/fix-{{topic}} -b fix/{{topic}}` and
   `EnterWorktree` with that path). Then run `node tools/fix.mjs doctor`: it must say
   `linked worktree yes` and `baseline … OK`; `git branch --show-current` there is the branch you report.
   `node tools/incident.mjs list` shows known open problems and their workarounds. Read `fixes/FINDINGS.md`
   (the team's techniques and pitfalls) and `node tools/finding.mjs list --unread --as fix-{{topic}}`.
1. **R, census.** Read the relevant parts of `research/01-initial-investigation/README.md`,
   `motion-inventory.md` and `research/cpu-throttle-calibration/README.md`. Phone: ≥3 runs of one driver on the
   exact base with the standard probe (on a slot ticket, step 5); Chrome: `verify --frame-log` at 430x932 and
   at the phone's geometry (430x775 scripted, 430x815 collapsed toolbar). Place frames by crossing, not raw y. A
   cluster in <2/3 runs is "rare" and needs F or G runs before any work. Close with the **census card**.
2. **I, event card.** For one cluster: the crossing table (every code threshold within ±1 viewport and its y on
   each device; find the code with `node tools/fix.mjs grep …` / `show … --lines a-b`, locations in
   `fixes/TOPICS.md`), an uncapped per-step probe in the Chrome short lane (counts only) and the phone logger in
   the same window. Each hypothesis names element + selector + property (or function + line), checked by computed
   style in Chrome **and** WebKit. mgmt-ops checks that the card is complete.
3. **D, attribution card: the lead signs.** `node tools/fix.mjs new {{topic}}`, then build the ablations as
   their own topics (`{{topic}}--<arm>`): a positive arm, ≥1 negative sibling arm (another event of the event
   card), a mechanism check per arm (computed style, mutation counts, layer count), all in one block against one
   control. Moving a frame proves where the trigger is, not what costs. Set the device class. Send the card to the
   lead and wait for `D: NAMED …` (or the lead's fast-path call for an exact, countable Chrome mechanism). LOCATED
   may spend one more phone block on ablations; it builds no fix.
4. **F, build.** Copy the file(s) with `node tools/fix.mjs edit {{topic}} <file>` and edit only the copies in
   `fixes/{{topic}}/overlay/`; a new build name per variant. Keep behaviour identical on desktop, on phones and
   with `prefers-reduced-motion`; `node --check` every JS file you touched. `node tools/fix.mjs serve {{topic}}`
   in the background, confirm `x-mirror-source: overlay` with curl, record the served hashes, stop the server.
   Fill the **build card** (parity 0 %, backdrop look, a11y diff, mechanism delta in the short lane, idle triple,
   memory/layers) and, **before any timed run**, the **prediction card** with its row in `fixes/PREDICTIONS.md`.
5. **Measure on the device class's gate.** Chrome: `node tools/fix.mjs ab {{topic}} --runs 5` in one hold
   (compare only within a hold while `fixes/LEAD.md` "Canary drift" stands); it writes `patch.diff` and
   `results.json`. Phone: a **slot ticket** to mgmt-ops (build + hashes, ONE control, driver, one question,
   prediction id, if-X-then-Y, probe set, minutes); blocks per `CLAUDE.md` "Shared devices". Touch-only: G or F
   runs through the lead. Render-bound: Instruments hitches once that route works. A null result is a valid
   result. Investigate any `regressions` (new errors, new 404s, screenshot diff > 0.5 %, morph not reached) and
   the position-bin census diff on both devices.
6. **README.** Write `fixes/{{topic}}/README.md` from the template: why it lags (with evidence and line refs), what
   changed, why that is faster, the before/after tables (Chrome `results.json` → `markdown`; phone median [IQR]
   in ticks and every run), the cards, the scenarios not run, the driver behind each claim, risks and overlaps.
   Send your experiment rows (`fixes/EXPERIMENTS.md` fields, incl. driver, prediction id, attribution verdict) and
   the prediction's measured outcome to mgmt-ops.
7. Run `npm run test:unit` (scope guard + unit tests; not the full `npm test`, which is for tooling
   changes: `CLAUDE.md` "Tooling is guarded by tests"). `SCOPE TOOLING` means your branch touched
   `tools/`, `tests/`, `package.json`, `.githooks/` or `.claude/`: undo it as the message says. Then
   commit `fixes/{{topic}}/README.md`, `patch.diff` and `results.json` on your worktree branch (local
   only, no push, no `git add -f`). Don't commit the overlay. If you fixed a tool yourself (only as
   `fixes/INCIDENTS.md` section 1 allows), that fix and its test are a separate commit
   (`CLAUDE.md` "Hard rules" 6), tested with the full `npm test` and `FW_TOOLING=1 npm run test:unit`;
   mention it in the report.
8. **V** is `fix-reviewer`'s (spawned by the lead): answer its NEEDS-WORK items. **L** is the lead's.

**When something breaks** (any step): `fixes/INCIDENTS.md`. Report once (`incident.mjs open`; the
answer says OPENED, JOINED or KNOWN), message the lead, then use the workaround, do other steps, or
run `node tools/incident.mjs wait <id>` in the background. When the lead announces "incident … RESOLVED
… fixed in <sha>", run `git rebase main` in your worktree between steps (finish a running A/B first)
and continue; if it says "Re-measure", run your A/B again. With nothing left to do while blocked,
end with the `BLOCKED on <id>` report from `fixes/INCIDENTS.md`; the lead resumes you.

**Report back** (final message / message to the lead): topic, branch (`git branch --show-current` in your
worktree, never the git status in your context) and worktree path, stage reached and D verdict, files and
functions touched, the key metric deltas with spread and verdicts, regressions (or "none"), tool-fix
commits (or "none"), incidents you opened or joined and whether any affected your numbers (or
"none"), what you told other owners, and open questions.
