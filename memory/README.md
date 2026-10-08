# Project memory (index of `memory/`; imported by CLAUDE.md; note links are relative to `memory/`)

Every agent:
- [Verify platform claims](verify-platform-claims.md): probe-found browser behaviour stays OBSERVED until a doc, source or bug confirms it; rule text in CLAUDE.md "Platform claims"
- [Read source first](read-source-first.md): if the answer is in open source code (WebKit, Chromium, libraries), read it directly via gh (read-only) before probing or web searching, and cite path + line
- [Breakthroughs become practices](breakthroughs-become-practices.md): a clear win is written up in research/architecture/, posted as a technique finding, broadcast by the lead; every owner checks its own area and reports applies / does not apply
- [GPU compositor checklist](../research/architecture/gpu-compositor-playbook.md): first practice (F-317): for any scroll-linked or always-running animation, check §7 before designing; move per-frame work to transform/opacity/filter on a scroll or time timeline, gate Chrome counts → Simulator counts → rest probe → screencast pixels → layers → phone block
- [User tasks via console](user-tasks-via-console.md): user steps go into the local console (Start, answer, next), never relayed through the lead's chat
- [Console steps: wait yourself](console-step-wait-yourself.md): post a step, arm `console.mjs wait <id>` in its own background call in the same turn
- [User steps first](user-steps-first.md): a posted user step takes the phone next; no cooling or Mac-quiet gate on it
- [No phone steps during blocks](no-phone-steps-during-blocks.md): never ask the user to touch the iPhone while a timed block runs
- [Perception tests: touch A/B](perception-tests-touch-ab.md): the user judges lag by finger-following; blind swipe A/B, not watched clips
- [Simulator for non-timing phone jobs](simulator-for-non-perf-phone-jobs.md): no timing or perception number needed, use the Simulator; since T-204 #35 a free iPhone may be used for any end-of-page test
- [Defer timing; call tree + layout](defer-timing-focus-call-tree.md): no timing A/Bs or phone gain blocks except the listed exceptions
- [Illusions must be pixel-identical](illusion-must-be-pixel-identical.md): look-alike fixes are exact, or T2 within the PR-010 wide numbers (fill 64, edge 128, 0.5 %, Chrome + Simulator A/A); more, or motion-only, is a proposal
- [Proposal decision is the spec](proposal-decision-is-the-spec.md): changes-requested means rev N+1 of the same proposal, every point answered
- [Proposals need Try-it](proposal-try-it-required.md): every option gets a live Try-it panel (A and B pages), not only shots
- [Proposal revision visible](proposal-revision-visible.md): after changes-requested the user always sees who revises, the step and the expected time; post rev N+1 once Try-it works
- [GitHub via gh](github-via-gh.md): read GitHub with the logged-in `gh` CLI (read-only), never plain curl; report if gh is not logged in
- [No camera access](no-camera-access.md): never open a Mac camera; screen recording only via `ioscap.mjs`
- [Keep awake only during measurements](keep-awake-only-during-measurements.md): `caffeinate -i -s` inside measurement holds only
- [Less-work landing rule](less-work-landing-rule.md): a "does less work" fix lands on cost-card counts + a short phone no-worse check; top-3 smoothness fixes keep phone + finger test (countdown waived, T-055)
- [Console steps only for actions](console-steps-only-for-actions.md): "Your steps" is only for what the user must do; answers, results and FYIs go in a thread (the lead opens it)
- [Milestone 2: heat profiles](milestone-2-heat-profiles.md): after fixes 1-3 are smooth at real Serious, stay smooth from a 42-44 °C start and under Xcode-induced Serious
- [Phone checks start warm](phone-checks-start-warm.md): tests run at thermal Serious, since T-162 #3 Xcode-induced Serious by default (no heat pre-warm), real heat once for the final build; ceiling 44 °C/Critical; Fair no-worse check at the end; LPM dropped
- [Heat probe for blog posts](heat-probe-for-blog.md): HEATRATE lines (°C/min per heat method and page) stay reproducible; the user writes blog posts from them (T-247 #10)
- [One phone step at a time](one-phone-step-at-a-time.md): only the lease holder posts a phone step, one open at a time, after the user says ready; the lead sets the order; renew 2 min early, arm `--until redo`
- [Phone problems: fix first](phone-problems-fix-first.md): a phone link or test-driver failure the user did not cause is investigated and repaired by the lead first (logs, WDA restart); a user step only with evidence it is needed
- [Answer format](answer-format.md): every answer to the user: answer first, short plain bullets, codes explained, numbers in small tables, ~10 lines, "What you need to do" last
- [Trace before asking](trace-before-asking.md): a reported lag or bug is traced from our recordings, logs and probes first; ask the user only what no data can answer
- [Busy workers answer later](busy-workers-answer-later.md): never pull a busy worker off its work for a user question; a helper answers now, the worker may reply later
- [Issue loop: investigate, distinguish, workaround, long-term](lead-owns-issue-loop.md): every issue the user raises gets cause from our data, which cases, a workaround now and a long-term fix with an owner, in the first answer; the lead owns it for user threads
- [Proactive by default](proactive-by-default.md): pull your next step, results straight to their consumers, pre-stage while waiting, one owner per answer (T-160 #7)

Lead:
- [Agent spawn names](agent-spawn-names.md): every spawn gets `name: <role>-<topic>`; check the first spawn after each compaction
- [Console server detached](console-server-detached.md): run `console.mjs serve` with nohup; check `console.mjs url` each check-in
- [Usage meter every 30 min](usage-meter-every-30-min.md): re-create the 30-min cron each session; data stays local
- [Idle alarms are a pattern](idle-alarms-are-a-pattern.md): phone held and unused 2 min, read the holder's processes; from the 3rd idle alarm a day, review them together
- [Best builds list](best-builds-list.md): `fixes/BEST_BUILDS.md` lists best-build versions newest first; update it and post in T-228 at every build change (user T-228 #3)
- [Lead delegates areas, measures](lead-delegates-areas-measures.md): a recurring problem area gets an owner agent (cause, long-term fix, delegation); the lead measures it against an exit target and parks the owner when tools carry it
