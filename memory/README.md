# Project memory (index of `memory/`; imported by CLAUDE.md; note links are relative to `memory/`)

Every agent:
- [Verify platform claims](verify-platform-claims.md): probe-found browser behaviour stays OBSERVED until a doc, source or bug confirms it; rule text in CLAUDE.md "Platform claims"
- [User tasks via console](user-tasks-via-console.md): user steps go into the local console (Start, answer, next), never relayed through the lead's chat
- [Console steps: wait yourself](console-step-wait-yourself.md): post a step, arm `console.mjs wait <id>` in its own background call in the same turn
- [User steps first](user-steps-first.md): a posted user step takes the phone next; no cooling or Mac-quiet gate on it
- [No phone steps during blocks](no-phone-steps-during-blocks.md): never ask the user to touch the iPhone while a timed block runs
- [Perception tests: touch A/B](perception-tests-touch-ab.md): the user judges lag by finger-following; blind swipe A/B, not watched clips
- [Simulator for non-timing phone jobs](simulator-for-non-perf-phone-jobs.md): no timing or perception number needed, use the Simulator
- [Defer timing; call tree + layout](defer-timing-focus-call-tree.md): no timing A/Bs or phone gain blocks except the listed exceptions
- [Illusions must be pixel-identical](illusion-must-be-pixel-identical.md): look-alike fixes are exact, or T2 within the PR-010 wide numbers (fill 64, edge 128, 0.5 %, Chrome + Simulator A/A); more, or motion-only, is a proposal
- [Proposal decision is the spec](proposal-decision-is-the-spec.md): changes-requested means rev N+1 of the same proposal, every point answered
- [No camera access](no-camera-access.md): never open a Mac camera; screen recording only via `ioscap.mjs`
- [Keep awake only during measurements](keep-awake-only-during-measurements.md): `caffeinate -i -s` inside measurement holds only
- [Less-work landing rule](less-work-landing-rule.md): a "does less work" fix lands on cost-card counts + a short phone no-worse check; top-3 smoothness fixes keep phone + finger test (countdown waived, T-055)
- [Console steps only for actions](console-steps-only-for-actions.md): "Your steps" is only for what the user must do; answers, results and FYIs go in a thread (the lead opens it)
- [Milestone 2: heat profiles](milestone-2-heat-profiles.md): after fixes 1-3 are smooth at real Serious, stay smooth from a 42-44 °C start and under Xcode-induced Serious
- [Phone checks start warm](phone-checks-start-warm.md): tests run at real thermal Serious (xctrace gate per hold, ceiling 44 °C/Critical), Fair no-worse check at the end; LPM runs dropped; no countdown-only test page

Lead:
- [Agent spawn names](agent-spawn-names.md): every spawn gets `name: <role>-<topic>`; check the first spawn after each compaction
- [Console server detached](console-server-detached.md): run `console.mjs serve` with nohup; check `console.mjs url` each check-in
- [Usage meter every 30 min](usage-meter-every-30-min.md): re-create the 30-min cron each session; data stays local
