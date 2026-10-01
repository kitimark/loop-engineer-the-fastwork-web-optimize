# mgmt-ops handover (2026-10-01 01:15Z)

Written by mgmt-ops (agent ac3dd7811b6861c73) for the next mgmt-ops. Charter: `fixes/LEAD.md` "Delegation: mgmt-ops
runs the day-to-day". Main at handover: `eb8a447`. All my docs commits are landed.

## Where the project stands

- **Wave 1 is complete on main** (F-013): phone-invisible-shrink, commission-forced-layout, layout-animations v10
  (7bf12016), pain-offscreen-notes, large-area-blur, nav-hit-test, countdown-idle-raf 03 (160d69a0, 5dda3bd),
  morph-panel-lazy-mount v03 (06c0b10c, eb8a447). Labels: "mechanism + review, gain pending combined".
  #6 morph-scrolljack-passive v05 (63d6980e, nav-morph branch) lands only after the iPhone finger test.
- **wave1-partial** (5 topics, unreviewed partial combine) is the only clean combined number so far:
  fps 74.9 → 95.4, > 20 ms 65 → 24 (DIRECTION slot 3, mgmt-lead KPI table).
- **The all-wave1 goal run failed** (00:18-00:53Z): no usable data. It is blocked on **I-023** (P0 per lead → ts-i017).
- Host gate (I-016/I-017) is on main (84ebdac, 77693c3, f144d8f; F-012). It has the I-023 bug.

## Blocking incident I-023 (open, tool, blocking)

verify.mjs per-run host recheck (fc07297). A/A run 1: Chrome CDP closed after a 60.1 s wait. A/B run 1: recheck waited
1953 s against `recheckMaxWaitSec` 60, then measured a broken session (fps 119.6, 3 errors, CONTAMINATED).
**Lead scope for ts-i017:** recheck before Chrome launches (or keep CDP alive), a hard per-run watchdog in verify (no
progress for N s → clear failure, never hang holding the lock), a fake-host test that stays busy past the window;
test:chrome must pass before it lands.
**TODO next mgmt-ops:** (1) confirm the lead set I-023 P0 → ts-i017 (my message may not have gone out: the auto-mode
classifier was timing out); (2) the lead adds wave1-dry's evidence with `incident.mjs update --note` (wave1-dry's
message: grant 00:18:36 after 89 s; A/A error at cdp.mjs:94:26, out/ab/_aa/2026-10-01T00-18-36-749Z/ empty; A/B
recheck 1953.2 s; run 1 base fps 119.6 / 3 errors; log in wave1-dry's scratchpad `wave1-dry/aw1-hold.log`).
(3) Once I-023 lands + test:chrome passes: signal wave1-dry (below).

## Who waits on what

| agent | state | waits on | next step |
|---|---|---|---|
| wave1-dry (a304ca7) | idle, all-wave1 combine ready (8 shas checked) | I-023 fixed | ONE announced hold: guard (no gate TIMEOUT) ; `ab --aa --runs 5` ; `ab all-wave1 --runs 5` ; `timeout 60 probe-countdown-active.mjs` (panel countdown writes = 0 at scrollY 0 after #13 idle mount); attribution of F-011 frame (y≈2100-2150) and F-009c (nav platform IO 46 ms). Kill on CONTAMINATED / TIMEOUT only, not on `warn:`. Commit the probe with results. |
| ts-i017 (a13d7bf) | I-018 + E5 commit (lease now) | – | then I-023 (P0) |
| ts-i002 (a1fe618) | I-022 rebased onto gate, uncommitted | short lease (moved to #1 by lead, slid to #2) | commit (hook npm test), then full `npm run test:chrome` short 300 s (split if exit 124); report sha, count, per file. Lead resolves I-016/I-017/I-022 on it (I-023 fix must also pass test:chrome). |
| ts-i021 (a8690dc) | I-021 rebased onto eb8a447, recommitting | short lease (#3) | docs commit also raises the full-suite cap 120 → 150; send shas → land batch (lead: agent-def changes + test:unit outside lock accepted). FW_TOOLING pre-commit block = user decision (lead asking). Announcement text in ts-i021's report. |
| ts-prio (a7fad4c) | building I-020 | – | PRIORITY: "at each hand-over drain ALL queued shorts before the next normal" (cap by count or ~15 min), tests incl. lead move and gate R1; then lease TTL / run-not-lease, fast hand-over, lock-meta idle length, CLAUDE.md wording (servers inside the sh -c hold; ≤ 10 min normal holds; drain-all). When it lands, tell scroll-engine and apple-verify. |
| ts-bench (ad57dba) | steps 3+4, short #5 | – | visual parity kind (±1 device px, F-008) is a follow-up |
| fix-scroll-engine (a1722cf) | parts 1-2 done (F-009, F-011); /10 built (`se10-w1`) | chain: no short waiters AND all-wave1 hold has run once | part 3 (anim ablation), part 4 (E3 A/B), then mech10 short (ticket: R3 logger shows all un-skips in idle, 0 in scroll; cv churn 0; will-change only in window; no idle LoAF > 50 ms). /10 A/B `--on all-wave1`. NOTE: its chain waits for an all-wave1 hold that will not come until I-023 — re-arm it (e.g. "short queue empty") if I-023 takes long. |
| fix-nav-morph (a277ea0) | N12 stage 1 built (offset cache + section ranges) | short lane (requeued, 2 h timeout) | report Tier A counts (rect/gCS/elementsFromPoint per frame before → after) + parity mismatches (mobile, desktop, mobile-shift, desktop-rtl, mobile-rtl). iOS toolbar line for FINGER_TESTS later. #6 waits for finger test; N2 after; E4 after all-wave1 (holds ≤ 10 min). |
| fix-vendor-scrollend N11 (a6a570e) | probe fixed (F-014, 9764e0f) | short #1 | validation; final A/B `--on all-wave1` first in wave 2 (with /10) |
| fix-infinite-anims N3 (a0b5fe9) | DONE: **REJECTED**, branch sha 61ed9f7 (README, probe.mjs, slot.sh; no patch) | land batch (docs/topic scripts only) | premise false: the hero CTA orbit is `display:none` (CSS 1821-1828), 0/7 stops (F-015); all CSS animations together cost ~1 ms/frame at 6x (R2); no unowned idle JS loop (countdown spring 46-144/s on w1 = hidden panel countdown, countdown open check (b)). TODO: correct TOPICS N3 + arch README row 4; E3 (scroll-engine part 3 ablation) still pending; iPhone checks (WebKit steps() loops) listed in its README. |
| countdown (a03218c) | done, stopped | – | wave 2: 05/08 counts + A/B `--on all-wave1` after N12 (ahead of N12 only if all-wave1 still shows the y≈2100-2150 frame); open checks (hero off-screen, `active`) |
| layout-animations (a7da36d) | done, stopped | iPhone | — |
| apple-verify (a2e856b, lead's) | hold 1 done | short queue empty AND all-wave1 run | part 2 (normal lease ≤ 10 min, MCP Chrome idle while others hold) |

## Wave-2 order (lead decisions, DIRECTION slot 3)

N11 and scroll-engine /10 first (whichever is ready; one ~7 min hold each) → N12 (nav-morph; absorbs arch-apple #2 + #4)
→ hero-exit → countdown 05/08 → E4. Every A/B `--on all-wave1`, normal holds ≤ ~10 min (F-007). Exception: the goal
number (A/A + all-wave1) is one announced ~15 min hold. arch-apple #8 (reveal without blur) parked for the user.

## Queue plan and rules

- Current short-lane rule (I-011 budget 300 s) hands the lock to the next normal after ~1 short regardless of queue
  position. Until ts-prio's drain-all lands: normal waiters pause (dequeue) while 3+ shorts wait; the lead uses
  `repair --move` for critical-path shorts. Ask the lead for moves, with the owner name.
- **HOLDER-IDLE > 5 min with 3+ waiting → message the lead immediately** (lead rule after the 33-min all-wave1 hang).
  My monitor for it: `scratchpad/mgmt-ops/idlewatch.sh` (task bhlahyi2r). Other monitors: `watch.sh` (b6z9zgx1u: lock
  holder, incidents, findings, tick), `quiet.sh` (b1lqrn0am: load1 ≤ 6 for 10 min). Stop them when you take over.
- Friction scan each check-in: `node .claude/worktrees/agent-a1ecf91dac9344dc2/research/management/tools/kpi.mjs --friction`.
- Host: Spotlight (`spotlightknowledged`, 75-90 % CPU) and earlier `mediaanalysisd` keep "other CPU" above the gate's
  20 %. The user has the question (wait, or `sudo mdutil -a -i off`).
- Queue entries drop silently after 1 h: `lock.mjs run` has a default 3600 s acquire timeout (N11 and nav-morph lost
  their places this way; both requeued with longer timeouts). Tell long-waiting owners to pass `--timeout 14400`;
  candidate item for ts-prio (I-020) if waits stay long.
- No normal timing A/Bs until I-023 lands (lead, 01:15Z); mechanism and short-lane work continues.
- Digest to the lead every ≤ 30 min: counts waiting/working/idle, backlog, memory, ALARM lines. Last digest 00:12Z.
- mgmt-lead re-run was due ~01:00Z (iteration 2): remind the lead.

## Findings posted this stretch

F-006 wave1-partial, F-007 ≤ 10-min holds, F-008 shift-tolerant pixel diff, F-009 scroll-engine part 1, F-010 I-019,
F-011 scroll-engine part 2, F-012 gate, F-013 wave 1 complete, F-014 probe cert pitfall. The lead folds them into FINDINGS.md.
