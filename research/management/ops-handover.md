# mgmt-ops living state (updated with every digest)

Living state file (LEAD.md "Rules from mgmt-lead iteration 2"): the next mgmt-ops restarts from it (about every 2 h
or at ~60 % context). Charter: `fixes/LEAD.md` "Delegation: mgmt-ops runs the day-to-day". Current instance:
**mgmt-ops-10** (named spawn; from 10-03 08:2xZ; mgmt-ops-9 ran 10-03 00:0xZ-08:2xZ, mgmt-ops-8 10-02 23:5xZ-10-03
00:0xZ, mgmt-ops-7 10-02 09:13Z-23:5xZ), worktree `.claude/worktrees/agent-a606363cace2803d5`, branch
`worktree-agent-a606363cace2803d5`. Next instance: **mgmt-ops-11**, named (at ~60 % context). Last update:
**10-04 07:4xZ** (mgmt-ops-10).

## Answer format (standing, user T-080, memory/answer-format.md, 0f868e6d)

Every answer to the user (threads, chat, proposals, console step text) follows it:
- the answer first;
- short plain bullets;
- codes explained (P-095, PR-017, ...);
- numbers in small tables that say which side is better;
- UTC times;
- about 10 lines at most;
- "What you need to do" last.

Running agents don't reload memory, so put this rule in every spawn prompt (mgmt-ops-11's included) and in every
resume brief.

## Resume briefs (deliver with the next message that wakes the agent; then strike the line)

Lead 10-03 15:1xZ: don't wake a parked agent only for a note; add it here and send it with the next real wake-up.

- ~~**fix-hero-exit-threaded** (wake: right after C-033, for the P-081 block): morph-inherit landed on main (b11f977 + 0ad5407). From its next build on, it stacks on main + morph-inherit (no overlap with its patches). P-081 stands as registered: its band is y <= 884, outside the morph.~~ SENT by the lead 10-03 15:0xZ with the PR-011 restack.
- **fix-hero-exit-threaded** (wake: its next real wake-up after best-build lands): **restack on best-build** (fixes/best-build/patch.diff, T-046), not on main + morph-inherit alone. Its Try-it A side becomes best-build (I-093), and a finger A/B is best vs best + hero-exit. (Lead 16:2xZ: PR-011 rev 1 ACCEPTED, accept-both, 15:23:14Z; no rev 2; it waits only on P-081 and the finger test.)
- **fix-cd-roll-ca** (wake: after cd-strip lands): morph-inherit landed on main (b11f977 + 0ad5407). Its next build stacks on main + morph-inherit + cd-strip (no overlap with its patches). WebKit morph numbers measured on stacks without morph-inherit are void for the morph region; re-measure there. The reviewer saw the panel countdown cells differ from the baseline at m 0.9 and 1 in WebKit (max 11, 52 px over 8), attributed to st6-rb2, OBSERVED. Its resume list still has the panel clock roll (#1, less-work, m-gate condition). **PR-010 wide (15:21Z): re-tier with the five numbers** (largest shade, share beyond A/A, CSS px area, edge or fill, static or moving; it was near-identical; T2 lands after the numbers check, a motion-only difference stays a proposal). **Lead 15:2xZ: restack on best-build** (fixes/best-build/patch.diff, T-046) once it lands, not on main + morph-inherit + cd-strip alone.
- **fix-cd-strip** (wake: when C-033 reopens, or earlier if the lead asks): run the reduced-motion frozen-frame check (Chrome + Sim, with A/A, counts-only shared lane, ~5 min each) to close its PR-010 T2 tier before the landing card; the other T2 numbers are in the 16:2xZ log entry.
- **fix-platform-idle** (wake: only with its next real wake-up): PR-010 wide accepted 15:21Z; PR-009 was already the user's OK, so the landing stands; state its tier with the five numbers for the record.

## Backlog (lead items not yet scheduled; strike when done)
- DONE 6deb294/bea8564 (I-097, on main 17:3xZ): `lock.mjs leave <lock> --owner <o>`; was: no way to leave a queue; stale entries (ts-i093 shared w2, 10-03 16:0xZ) linger until the 10-min drop. Toolsmith item, lead 18:5xZ.
- fix-morph-gpu N2: gated on a measured Simulator paint/raster win before any proposal (Chrome shows no win; T3 in motion; the stale-clip WebKit defect stays OBSERVED). No Sim win -> N2 parks. Lead 16:3xZ.

- **F-188 cost check** (wi-best-build, OBSERVED, counts only): platform-idle restyles ~+835 elements (+13 %) over the morph drive in Chrome vs st6-rb2 (same style/layout pass counts; adds up cleanly with morph-inherit in the best build). Confirm in a later cost-card check; suspected cause the sweep-band ::after and glint elements restyled while --morph-fade changes (unchecked; relates to F-182).
- **tools/pixtol.mjs** (de-pixel-rule's proposal: the five PR-010 numbers + a tier verdict): a toolsmith after I-095 and I-093, priority #3.
- **Ship build**: `__fwMorphDrive` stays in the best build for now (the M driver needs it; lead 17:5xZ); strip it only in a final ship build.
- **best-build COMPONENTS**: carousel-leaver and cd-strip each join best-build as one COMPONENTS line once they land (lead 17:5xZ).

## mgmt-ops-10 log (from 10-03 08:2xZ, newest first)

- 10-04 08:2xZ Landed: I-118 + T-079 (77849780, 02280180; console restarted, /agents works, Versions page live), ops aa84a0ff. I-126 is in its full test. **P-096 scored STYLE fails.** Ops second read PASS: tools re-hashed, crossing-read re-run byte-identical, data after the freeze. One descriptive error sent to the owner as C1: the README's C column shows 704 / 455, the medians are 697 / 440. Candidate F is not built; the crossing residual is a phone-only cost, OBSERVED. hand-over nav-morph -> rest-script clean (08:02:45Z); now watching rest-script -> cd-roll-ca. **Lead rulings:**
  - **F3 (nav-morph):** no landing on the single pair. Next are two swipe-pair steps by fix-nav-morph in one lease hold (the BA pair with V first, then the hidden catch pair; lead-approved change from one 4-part step), after P-094 and P-093, once the user says "ready" in T-087. Felt stays "better (one pair, provisional)". hero-exit-threaded landed as v6 (5bf5d1e4); its next is the morph stage A proposal.
  - **PR-017 rev 3** (cd-roll-ca): review READY. It lands after P-093 and the user's decision. It is not ready while T-085 is open.

- 10-04 08:0xZ Landed: ops bd29c3e1, I-124 disk guard 62d1f2f8. More merges, on the lead's go:
  - heat: T-039 closed into T-029;
  - breakpoints: T-040, T-053, T-063 closed into T-034.

  Each canonical thread got a merge note. **ts-threads** (spawned 07:57Z) adds `thread merge <dup> --into <keep>`, relate and unmerge, a Related box and a Merged banner, routing to the kept thread, and a SIMILAR check on `thread new`. After it lands it backfills these manual merges. Until then the desk merges by hand: self-assign, `close --note "Merged into …"`, then a note in the kept thread.

  fix-hero-exit-threaded:
  - land request for its README commits e0040db3 and 25bc2488 (first-swipe trace: the countdown digit redraw is about 40 of 61 paints in the first 200 ms, OBSERVED, Simulator);
  - the morph proposal waits on fix-nav-morph's setter and gate.

- 10-04 07:5xZ The lead landed the ops commits as e5a1c2df (not waiting for ts-i118: v6 is both last and flagged). **Countdown rulings (lead):**
  1. cd-strip goes into the next best build. cd-roll-ca joins it if the user lands PR-017; if PR-017 is parked, cd-strip goes alone. The build runs after P-093 and the PR-017 decision. A wave integrator (wi-countdown) builds B-R2 + cd-strip [+ cd-roll-ca] with the identity check, Chrome functional + census, Simulator pixels and one phone no-worse check. The result becomes **v7**.
  2. countdown-faces (b), hide while unseen: owned by fix-cd-roll-ca after cd-roll-ca lands, on top of it, in its own branch. Nobody starts it before then.

  v6 cost line now also cites the README section "### First scroll after load, Simulator work counts" (B +~50 paints in the rest of the first scroll after load, 185-186 vs 121-141; the first-200 ms burst is equal at 61-68).

  **One thread per topic (user T-024 #13).** The desk self-assigned and closed duplicates, each with a "Merged into T-xxx. Related: …" note:
  - countdown: canonical T-024; closed T-055, T-057, T-077. T-085 stays with fix-cd-roll-ca until it answers, then closes into T-024.
  - best build / what lands next: canonical T-066; closed T-035, T-046, T-067, T-072, T-076, T-079.
  - Start over slow/stuck: canonical T-087; closed T-078.

  Keep this going: route a new thread on a known topic into its canonical one. Possible later merges, not done: heat T-029/T-039; breakpoints T-034/T-040/T-053/T-063.

  P-098 is registered at fix-morph-gpu 330f5323 (3 holds of at most 900 s). Its G fling-into-end check gets its own id after `wda check` and `gesture --dry-run`.

- 10-04 07:4xZ **v6-best-br2** added to `versions` (hero-exit-threaded B-R2, JS 8018ce062d30 / CSS 71b65c667720, P-095 HIT, swipe C-038 to C-040). It now carries `"best": true` and v4 no longer does (exactly one best). Try-it server "best-br2", http, port 60238, served from fix-hero-exit-threaded's out/tryit/best-br2; only the lead kills it. Its cost line comes from main's README (first move after a rest paints 8-19 vs 2-8; frame about 330 ms after a rest 4-6 vs 0-1). The newer Simulator first-scroll counts (B +~50 paints, e0040db3) are not landed and not cited. **P-098 = morph-gpu rev 2 phone block** (C best-65052c4a3902 vs V rv2a, driver M, ticket 618b43b8). Ops read PASS: scorer fa2212d0a307 and its diff checked, P-092 re-scored as rv2a reproduces the ticket, both snapshots hash as stated. Lead: 3 holds approved; a G fling-into-end check C vs A before landing, after P-094 and P-093. Next free P-099. The answer-format rule (T-080) is now a standing section at the top of this file. After the rebase, the ops commits from 07:3xZ are 7af3baae (best flag) and fdd02896 (P-097).

- 10-04 07:3xZ An API usage limit stopped several agents at about 07:25Z; the user switched accounts and the lead resumed them. iphone-runner died on it after C-038 to C-040 had finished (T-082, unblinded: B-R2 won both pairs, catch "same"); the lead killed its orphaned thread wait. Phone order (final while the user is active): fix-nav-morph (C-041 F3 swipe, holder since 07:22:19Z), then fix-rest-script (P-094), then cd-roll-ca (P-093). **P-097 = cd-roll-ca panel clock roll #1** (next free P-098). Lead ruling on versions: the "today's best build" chip goes only to an entry with `"best": true` (v4), and v5 gets a "to try" chip (ts-i118 22973643 is held until it changes). Ops commits 3cf849cd (best flag) and e51b686c (P-097) land after ts-i118's land request. I-124 approved: under 8 GB free, new timing holds refuse with DISK-LOW (shared jobs, phone runs and running holds are not stopped; the refusal says how to free space); the 20 GB warning goes to the desk. ts-i123 was sent back to rebase (conflicts with I-121/I-119). T-083 (idle alarm while the phone waits on the user's Start) closed as the I-125 case. T-084: the user used the phone during fix-nav-morph's lease with C-041 not started, so no data was hit; fix-nav-morph reloads Page 1 before Start.

- 10-04 07:1xZ Landed: a8790625 + ed2827c5 (ops), I-120 61cdf9d8, I-117 a458c9fd, I-119 a01a4a38 + docs 273f27b5 (phone Try-it links in threads are now written `http://lan:<port>/`, resolved by the Threads page; T-076 #15 has the six). I-118 back to ts-i118 for a rebase (status.mjs conflict with I-117). I-125 (idle alarm on a ready user step) folded into ts-i123; I-126 opened (proposals page shows the lan placeholder as text). C-038 (hero swipe) started 07:10:15Z, at the lead's 07:10Z pause mark, so the phone order stands. **v5-gpu-preview** added to `versions` (wi-gpu-bundle build 8aa2fe0b, JS c0c8ad4e36cb / CSS d0f1017e692d, patch 17a2764ec8a7; counts and pixels only, not landed; PR-016 draft rev 2, the lead publishes it between phone blocks).

- 10-04 06:5xZ **T-079 approved (lead):** `versions` array in PROGRESS.json, oldest first, v0-baseline, v1-st6-rb, v2-shell-hold-c, v3-st6-rb2, v4-best-build (fields per ts-i118's shape plus `hashes`, `verdict`, `tryIt.server`; dates = patch commit times, results from the items' best lines and T-011). **gpu-preview (c0c8ad4e36cb / d0f1017e692d) is added as v5 once wi-gpu-bundle's checks pass.** The page section goes to ts-i118 after I-118 lands. Phone order (lead): hero user steps (iphone-runner) -> fix-nav-morph -> fix-rest-script H2/H3 -> cd-roll-ca. T-080: the lead posted the format rules; until the user OKs them every desk answer follows them (answer first, short bullets, plain words, codes explained, "what you need to do" last, <= 10 lines).

- 10-04 06:4xZ P-092 ledger row corrected after review (fix-morph-gpu): the registered table has 6 lines (the S-sentinel line "sent", README line 420, was missing in the row); now HIT 5 of 6, wdt miss in V's favour, ratio n/a (predicted d 0); lesson adds the tween-start cost and F-208. Phone: fix-rest-script P-094 H1 VALID (C1 sentinel fail 57.7 < 58 voids C1 only, per ticket lines 937-947; V2/V3 hang on C4's sentinel; C9 re-runs C1), released 06:40Z for the user steps; cd-roll-ca took the lease 06:40:36Z against the lead's posted order (T-078 #14), ops relayed the order, it released 06:42:53Z after an uncounted warm-up; iphone-runner holds for the user swipe steps. Desk: T-049 #27 user YES to auto-delete + keep blog-post evidence (escalated); T-080 new, format rules for answers proposed in #2 (escalated).

- 10-04 06:3xZ Lead landed a154d656 + f0056f16. Disk plan in T-049 #24, I-124 -> ts-i124 (peer row added); auto-delete waits on the user's yes/no. Ops sent ts-i124 the idea "landed branch's worktree listed as deletable in the report". review-cd-roll-ca-4 running (peer row); cd-roll-ca pixel tier ruled T2. P-096 freeze PASS, rep 1 cleared by ops and lead.
- 10-04 06:3xZ **New user rule: one phone step at a time** (memory/one-phone-step-at-a-time.md, 48ad2387; T-078 #8/#11): only the lease holder posts a phone step, one open at a time; the lead sets the order; nothing is posted before the user says "ready"; runners renew 2 min early, arm `--until redo` from part 1, check the previous holder's step before the first open. Phone-step requests go to the lead, not the console. Ops told fix-nav-morph, iphone-runner, fix-hero-exit-threaded, cd-roll-ca (by id a65f148991747deb7; the name was unreachable), fix-rest-script, wi-gpu-bundle. I-122 resolved as a duplicate of I-123 (ts-i123: lease guard, REDO wake-up, stuck-ready alarm). I-121 (flaky console test) -> ts-i115 after I-120. Landed: I-111 54fb1f47, 6992d463 (ops).
- 10-04 06:2xZ Lead landed I-116 00dcb450 (the P-090 ledger misparse is fixed; two-space empty cells stay the convention), I-112 a5f3bdc5 (WDA check, GESTURE_BUDGET_S), docs cc47d0fc, 1be73acb (ops). cd-roll-ca safe-to-delete list: T-049 #19. **Hand-over watch, new pattern:** a queued phone waiter whose agent task shows completed has an orphaned lease request (iphone-runner and fix-rest-script ended their turns; the lead resumed both). At each hand-over check, confirm the next holder's agent is still running; if not, tell the lead. **Unit-test failures:** capture the name with `node --test ... 2>&1 | grep -B2 'not ok'`.
- 10-04 06:1xZ Lead landed 51c98146. P-096 C1 hold confirmed: no rep until the freeze text and crossing-read.mjs agree and ops re-reads; a code change means a new crossing-read hash in the freeze commit. morph-gpu land request waits on **review-morph-gpu** (never had a fix review). **Disk:** about 10 GB free, falling about 1 GB per 10 min; the lead asked the user in T-049 to delete the listed folders and asked cd-roll-ca to write less. Desk answers that touch disk point to **T-049 #18**.
- 10-04 06:1xZ **P-092 closed** (ledger HIT, ops re-score identical; landed a41ac6d0). Lead ruling: PASS as no-worse, no gain claimed; tween-start +7 ms (V 60-64 vs C 54-56) is a real cost: morph-gpu lands as a record, stays in the GPU preview, NOT in the next best build; rev 2 (clip layer prepared before the tween) gets a ticket, falsifier V <= C + 2 ms, ops pre-data read. Desk wording: "not worse", never "fewer frames over 34 ms" for P-092. **P-096 freeze read** (d0ff57bd, tool hashes match): CHANGES C1 (line-base rule: text says fixed base 1 + only-other-base = UNRESOLVED; crossing-read detects the base per run); no rep before the re-read PASS. I-120 -> ts-i115 after I-116.
- 10-04 06:0xZ Lead landed 7d067b1a (I-114 resolved: shared npm-test is now `--weight npm-test --max-seconds 480`), b410fc25 (I-108 follow-up: "landed?" only on ready-to-land/reviewing rows; T-075 answered) and 4ec58d83 (ops). T-076: the six Try-it LAN links went to the user as console step **C-036** (one part per version, `http://lan:<port>/` resolved when shown). **Desk rule (lead): never put addresses in threads, not even as host:port text;** the thread scrubber hides them on purpose (Hard rule 12), so LAN links go in a console step. **I-119** (open, low priority, unowned): an improvement, not a bug. A thread reply should be able to carry an `http://lan:<port>/` link, stored as "lan" and resolved only when shown, like steps. T-077 #5: explained "parked".
- 10-04 05:5xZ **Try-it servers (user T-076, lead):** six localhost servers run from the main checkout, one per version: baseline, st6-rb, st6-rb+shell-hold-c, st6-rb2, best-build 65052c4a, gpu-preview c0c8ad4e ("not yet passed"). Overlays in out/tryit/, state files out/tryit/serve-*.json, served hashes checked. They stay up until the user says done; **only the lead may kill them.** T-077: user asked why cdwc is "dropped"; it is the T-070 board cleanup label, the fix is still in the best build (P-032 paused); answered #2; lead fixed it (#3): cdwc, re-keep-op, blur-cubic, countdown-faces now **parked**, fwreskip landed. **Desk rule (lead): "dropped" on the board means abandoned only**; paused or superseded work is parked. Rightly dropped: pill-swap, image-size, anim-transform, duplicates.
- 10-04 05:4xZ Lead landed 607201d8; spawned ts-i118 (I-118, user T-074; peer row added). I-117 stays unowned until ts-i109 finishes I-114 and I-111. P-092 H2 (morph-gpu) moved to #1 on chrome-measure. User T-075: "may be out of date" on the ops row is the I-108 landed-branch check misfiring for an ongoing role (ops lands often); answered #2, told the lead.
- 10-04 05:3xZ Lead landed 2e070587 (ops) and rest-script 5378e891 + 785bbb2c (P-094 ticket + byte check); frame-audit row done (da543cb3; Svelte batching CONFIRMED, per microtask not per frame; T-067 #2 lead, #3 ops: version tag scrubbed as e-mail, P-091 VOID). **P-096 reserved** = F3 crossing-frame count check (fix-nav-morph, e2f2512d draft). Lead approved pending ops read; **ops read CHANGES R1-R6** (H1 Chrome needs an absolute floor; Sim H1 not falsifiable; H2 "top frame" vs Svelte helpers; file+hash per line range; freeze tool hashes after the dry run; add probabilities). Re-read on its revised commit, then tell nav-morph directly. Acks: morph-gpu 9693eb5e lease #1; rest-script queues when cd-roll-ca's entry shows; iphone-runner P-095 hold 1 from 05:25Z, S1 PASS.
- 10-04 05:4xZ Lead landed 91adcbc9 (P-091 VOID), ea609a5f (I-108 part 2, resolved), 8961e042 (I-115, resolved); console restarted. **User T-073 (05:24Z) priority:** 1 I-108, 2 GPU rendering fixes bundled into a new best build for the user to test, 3 frame audit (lead answered T-073). **Phone queue (lead, supersedes 05:3xZ):** 1 P-095 hero R2 (iphone-runner, running) -> 2 P-092 morph-gpu (moved to #1 in the iphone queue) -> 3 F3 blind swipe A/B + S2 (fix-nav-morph, user step) -> 4 P-093 cd-roll-ca -> 5 P-094 rest-script -> (6) F3 style ticket only if the count check says STYLE. **New agent wi-gpu-bundle** (integrator): GPU preview = best build + hero R2 + morph-gpu + cd-roll-ca, checks only, Try-it for the user (peer row added). Broadcast to every live agent: `git rebase main` between steps, set the board row again (the board records the branch), `--owner` on every wait.
- 10-04 05:3xZ a7c1b86c landed. **P-091 closed VOID** (8a1a25ee on worktree-agent-a277ea00c8773c1ea): 8 counted runs from VALID holds h041713/h043142/h050416, S1 and S2 PASS, frozen edge-score ad0037856fa5 control 2/4 -> VOID (C2/C4 longest frames "unmatched"). **Ops second read PASS**: scorer + runner copy = registered hash; re-scored from raw on an ops copy, score.txt/score.json identical; counted V4/C4 are h050416 files (not the void/ ones); arms and order C V V C C V V C match. Ledger row closed (VOID, lesson: check the Timeline record model on fresh Serious data before freezing a scorer; RenderingFrame claim OBSERVED, gh-only plan in the README). Hand-over watch 05:15:53Z: iphone-runner idle at +74 s, nudged by SendMessage, keep-warm running by 05:17Z (watch PASS after a nudge). **Lead F3 ruling 05:2xZ:** F3 lands on its named-hitch evidence (P-013/P-022) + the user blind swipe A/B (C plain B vs V best-65052c4a3902) + one S2 sentinel; the style residual goes to a Chrome+Simulator count check (shared lane) first, a phone ticket only if STYLE holds, after P-094. **Phone queue now:** 1 P-095 hero R2 (iphone-runner, running) -> 2 F3 blind swipe A/B + S2 (fix-nav-morph, user step, ahead of P-092; the lead moves its lease entry) -> 3 P-092 morph-gpu -> 4 P-093 cd-roll-ca -> 5 P-094 rest-script -> (6) F3 style-residual ticket only if the count check says STYLE.
- 10-04 05:1xZ d7adbf38 landed. P-091 h050416: start gate try 1 Fair (the phone was cooled to 41.09 C at 04:57Z, then waited ~6 min for chrome-measure with no pre-warm and fell to 38.6 C), try 2 PASS 05:10:45Z Serious 39.59 C; V4 C4 S2 running. **Lesson (lead):** a phone left to cool while its owner waits for Chrome costs a gate retry: every next phone holder pre-warms while it waits (T-058). User T-072 (Best build page: "4 new results"): false flag, the P-091..P-095 ledger rows had empty "| |" cells that the progress parser read as a result; data fixed (empty cells now two spaces), parser incident I-116 opened (lead). PROGRESS.json 05:15Z. **Incident owners (lead 05:1xZ):** ts-i103: I-108 part 2, then I-104, then I-112; ts-i109: I-106, I-110, I-111, I-114 (ruling: npm-test shared jobs up to 480 s); ts-i115: I-115, then I-113.
- 10-04 05:0xZ Lead: T-070 #6 done (7 stale rows set done/dropped: count-checks, claims-audit, i063-sim done; cdwc, re-keep-op, blur-cubic, countdown-faces dropped 'off for now'). T-071 #10 'add the hook' -> I-115, ts-i115 spawned (peer row added). Lead npm test on 71190916 1586/1586. **Watch item:** when cd-roll-ca lands, ping the lead to decide whether countdown-faces comes back.
- 10-04 04:5xZ User T-071: GitHub via gh, never curl -> F-203, announced to 9 live agents, lead saved memory/github-via-gh.md (a8f1806d); rule line added above the peer directory. T-070 (board 'waiting for a user reply' lines): I-108 part 1 in its hook test, user asked highest priority + workaround (escalated: hide 7 stale parked rows); ops posts the 'live' note only after the lead's 'console restarted'. P-091 h043142 VALID (V2 C2 C3 V3); h044740 GATE-FAIL (end Critical 42.89 °C), strike 1, V4 C4 S2 void; nav-morph cools under its lease (< 41.5 °C) then re-runs H4; ops advised no swap to P-095 (its start gate also needs Serious).
- 10-04 04:4xZ Lead landed 2518e9ca (P-095 pre-block met: pxbr2 PASS, ops digit check R2 21 / R2b 33 / B 57; owner README 93705754). T-066 #11-#14 (Svelte batching idea, design-engineer ask) escalated; lead spawned de-frame-audit (peer directory row added). F-202 pitfall (acquire --wait re-run lost ts-i103's place) sent to 7 agents; lead opened I-113, ops note added (immediate iphone re-run kept fix-morph-gpu's 03:25Z place). P-091 h041713 VALID (C1 V1, S1 PASS, 40.89 -> 42.39 °C, sleep clean); hold 3 running, hold 4 next; P-095 then takes the phone (iphone-runner #1, wait good to 05:16Z).
- 10-04 04:2xZ **P-094 and P-095 registered** (62c252cf, 5757e71f). P-094: fix-rest-script's best-build byte check 87e4b603 PASS, ops re-ran it (diff -U0 st6-rb2 -> v4 equals best-build 65052c4a3902 -> combined e9b94ba7c560, 223 lines; best-build changes start at 12451), so C stays st6-rb2. P-095 (hero R2 on best-build, runner iphone-runner): pre-block read PASS (scorers 32ed5f4e81f9 / 40d0d302c3f1, gate 4604218c4041, gesture e3f31872b82f, p095.mjs = p088.mjs with arms/labels only, then 53a74ccd1bcc with a GO-pxbr2 wait block, serve095 a38b04f9d481, copies match the full sha256s, --fn lines checked). Open: the pxbr2 Simulator PASS (fix-hero-exit-threaded); the runner writes out/p095/GO-pxbr2 only on that message. Phone order (lead): P-091 (running; hold h040657 VALID but no counted step, WDA was down, no strike; re-queued), P-095, P-092, P-093, P-094; fix-morph-gpu told. Lesson for every G ticket: `iphone.mjs wda status` before the hold. PROGRESS refreshed (c8187d4d). T-066 #5 (GPU / parallel rendering) answered #6 as desk. Nothing landed on main since c187fa19. idle.mjs check OK 04:22Z.
- 21:1xZ Lead check-in: P-089 Chrome not started at 21:14Z (rest-script sat in a 10-min thread wait; OK re-sent). rest-script: chainJ.sh chrome started about 21:17Z (430r, 1440, 1440r; shared lane, --max-seconds 300, pmset per hold) -> out/rest-script/chainJ/chrome.out. Ops waits on its EXIT line, then does the Chrome result read. Digest sent 21:15Z.
- 10-04 04:0xZ **P-088 RESULT: neither arm passes -> back to F** (ops re-score from raw files with the registered scorers, hashes verified, matches fix-hero-exit-threaded's read line by line; outputs in the ops scratchpad p088/out/). Holds h032856 + h034817 VALID (Serious 38.3-41.8 °C, no sleep, 9 counted / 0 void, S1/S2 PASS, hold 2 alone in holds.log). a in (C 0.76-0.79, N 0.016-0.017, Fb 0.009-0.019). N: b-ts OUT (N1 ts1, N3 ts2), b-fm-rest OUT (fm2/fm4 every pair, paint +5), b-rest OUT (reported), fm1 >50 0 / >34 0 threshold-sensitive, band f50 -1 f34 -8; same on rows 2-3, not load-sensitive. Fb: b-rest OUT (falsifier), fm1 >34 +1 WORSE (twins agree), b-ts/b-fm-rest OUT all rows but in on rows 2-3 (load-sensitive), band f50 -1 f34 -6. fm1 S/L residual: N 0; Fb +2 S in Fb1 only. No px14, no swipe, no further block on these builds. Phone P-088 -> P-091 at 04:00:27Z, 0 idle min (today 14). **Try-it rule (user T-063 #2, memory/proposal-try-it-required.md, dfb10c70):** every proposal option carries a Try-it entry (A and B pages from the snapshot copies the shots came from; an option that cannot be built says so); ops checks it in every proposal read; I-109 (validator) queued for the next free toolsmith. PR-015 (T-053): match option needs a can't-build entry, keep option's served hashes must equal the shots' (65052c4a3902 / e0f92804c521), asked of de-breakpoints. bp-vp980: ops recommended committing its README + listing the overlay path in research/breakpoints/evidence.json, awaiting the lead. Landed: 91bcaae6 (ops), b68749f3 (breakpoints evidence), dfb10c70 (memory).
- 10-04 03:5xZ **Phone hand-over rule (lead, T-058), from P-091 on:** the next owner starts its uncounted pre-warm under the lease at once, beside any shared group (I-056 allows it), and queues its --no-timing hold at the same time; counted runs only inside its own hold. This hides the ~5 min shared-group gap inside the ~6 min pre-warm. Applied to P-091, P-092, P-093: the extra pre-warm is uncounted and the ticketed start method inside the hold (pre-warm + start gate) is unchanged, so the gate still decides; each owner logs it as a runner deviation. **Waits carry --owner:** the board shows `wait.mjs` / `lock.mjs wait` without --owner as "unknown" (I-108 item 6 fixes the tools); owners reminded (ts-i105, cd-roll-ca, fix-rest-script, fix-nav-morph, fix-morph-gpu, iphone-runner); ops' own lease wait re-armed with --owner. Evidence: ev-landed's six lists (0d785157, landed 138f6ea4, ~379 MB) read clean; rest-script 20cdcff0 read clean (scratchpad copy in out/rest-script/scratch/, ic2 missing + neverProduced, ~138 MB). P-089 is published as PR-014 (keep vs drop, recommended keep; Try it via fixes/rest-script-live, 04bb3156), accepted by the user 03:57Z (keep, final; the lead un-parked rest-script): P-094 = its short phone no-worse check, place 5 after P-093, ticket pending ops read; next free P-095. The desk owns T-062 and PR-014 questions. I-108 open (board listener shown as waiting for a user reply), queued for ts-i103 after I-104.
- 10-04 03:4xZ P-088 hold h032856 VALID (gates Serious/not induced 38.3 -> 40.5 °C, no sleep), it held wC wN wFb, S1 PASS and row 1 (C1 N1 Fb1); hold 2 (rows 2-3 + S2) queued. ts-i103's amend-hook npm test ran unleased 03:36:30-03:40:31Z beside S1/C1/N1/Fb1 (load1 12.0/9.1/7.8/5.5): I-107 (ops). Lead ruling: row 1 counts, flagged; verdict reported on all rows and on rows 2-3 only; if they differ it is Mac-load-sensitive, no hit claimed. **Lesson (lead):** a commit whose hook runs npm test must hold its shared lease first; if the acquire is still queued, don't commit, wait for the lease. P-093 = cd-roll-ca phone no-worse (place 4): CHANGES 03:3xZ (sentinel skip on already-void C runs, start method, hold/I-098 lines), rev 2 at 3f7ce94a re-read PASS 03:4xZ (score.mjs 57856e3f530a, hold.sh 6bd99cf3909e), registered; next free P-094. P-091 runner (p091.mjs) and P-092 driver (n2.mjs) checked; both use 900 s holds against their tickets' 600 s text, logged as runner deviations (lead's condition-B rule). Hero swipe pair read-ahead PASS (best-build A 65052c4a3902 vs B-N 1c3bacf36fcd / B-Fb 2aca1672e74e); lead: P-091 gets the phone after P-088 whatever the result; the swipe goes after P-091 if P-088 hits, px14 passes and the user is there. Evidence lists (T-049): morph-gpu 85467da5, nav-morph 58a12ccb, hero-exit cce444ea checked clean; cd-roll-ca, de-breakpoints and ev-landed (landed topics + countdown-faces) pending. T-049 #10-#14: delete commands given to the user (Simulator copy via find -path '*/scratchpad/lead/ios-platform'; leftover profiles from out/space.tsv after the lead's space report). The console scrubs session ids in paths, so give paths as find patterns. Disk about 12 GiB free at 03:3xZ.
- 10-04 03:2xZ **Phone queue rule (lead, after user T-058 "the iPhone was free a long time"):** (1) the next owners queue the iphone lease at once (`lock.mjs acquire iphone --owner <them> --ttl 900 --wait 3600` in the background, re-run on exit 3) so it hands over the moment the running block releases; P-091 (fix-nav-morph) queued first, P-092 (fix-morph-gpu) right after nav-morph's entry shows; (2) ops keeps the next two phone tickets read and PASSed before the running block ends, and every phone-ready ticket comes to ops as soon as its owner has it; (3) between blocks the only allowed gap is a user step, no cooling wait (warm starts want Serious); (4) every digest reports phone idle minutes while a PASSed ticket waited (target 0). Today: 03:10Z (pause lifted) to 03:24Z (P-088 lease) = 14 min idle with P-088 PASSed; 02:50-03:10Z was the I-098 pause. Ops arms `lock.mjs wait iphone --until released-by:<holder>` for each block. T-058 #2 answered (desk). Lead 03:2xZ: place 4 = cd-roll-ca short phone no-worse (less-work rule; T-055 waived only the finger A/B; warm start, one control, top-window no-worse like P-079; read ahead), countdown-faces later the same way. If P-088 hits, the user finger swipe A/B (C vs the land build) follows as a user step, pre-built by fix-hero-exit-threaded; it goes ahead of P-091 only if the user is present.
- 10-04 03:1xZ T-052 answered 03:10Z (user: option A, keep the Mac awake with caffeinate; the user starts it, until then lib/awake per hold). The I-098 timing pause is lifted; the I-098 rules stay (a hold spanning a sleep is VOID and re-run; 2 sleep-VOIDs in a row -> park). Phone queue (lead), one block at a time: 1 P-088 hero-exit-threaded (pre-block read PASS: scorers, gesture, N/Fb/C snapshots re-hashed, ticket text unchanged since e5a8a650, phone tools and pin unchanged to main), 2 P-091 F3 edge (registered; start-method amendment 4a786165 checked), 3 P-092 morph-gpu N2 (CHANGES R1-R3, re-read PASS at 55064128, scorer f3a50b8ec2dd). Lead ruling: pre-warm on the plain baseline page for every arm (memory/phone-checks-start-warm.md, the P-073 lesson). Countdown: cd-strip landed 5d1ca102; cd-roll-ca unparked under T-055 (counts + reduced motion exact, no finger or watch A/B); my countdown-tags ask is resolved. Carousel closed (PR-013 keep-st6, 15d3d95b). T-053 goes to a proposal (user 03:15Z); de-breakpoints drafts it and asks ops for a read. Ops is now the thread desk (lead, after T-050 #7-8): keep `console.mjs thread wait --as mgmt-ops-<N>` armed; answer catch-ups, escalate decisions; T-050 #11 promised a re-count of lead wake-ups at about 05:2xZ.
- 10-04 02:4xZ Mac FullWake 02:37Z (lead). C-035 (cd-strip finger A/B) answered: user picked C (st6-rb2), low confidence; recordings show V with more >50 ms frames per 1000 scrolling frames (18.7 vs 9.6, then 8.3 vs 6.7), hero/countdown region; OBSERVED only (C always first, V swipes longer, no thermal read). Write-up: fixes/cd-strip/README.md "Finger swipe A/B", results.json fingerSwipeAB (d436f235, fix-cd-strip branch). No registered P-id for C-035, nothing to score. Landing is the lead's call; ops asks the lead to clear the countdown topic tags (cd-strip -> cd-roll-ca -> countdown-faces).
- 23:2xZ-02:1xZ Landed c3df2dbb + f180f0d5 as ab57b54e / 9f6edfe8 (main = 9f6edfe8); lead accepted the home-path ruling (local only). Check-ins 23:43, 00:24, 00:43, 01:19, 01:45, 02:13Z: no change.
- 23:1xZ Lead: DarkWake with no sleep since 23:00:50Z, so non-timing work resumes (timing holds paused until T-052). Ops test:unit 23:15:33-23:16:47Z: 835 tests, 835 pass, 0 skipped, 60 s, no sleep in the window: the earlier 834 was the sleep (no incident). fix-rest-script committed c3df2dbb (README dedbd049513e, proposal-p089.json fd1dc74c2c91, both verified from the commit; test:unit 835/0); diff vs main only fixes/rest-script/ (README, proposal, topic-local tools). One land request sent for c3df2dbb and this ops commit. Note for the lead's scrub: rest-script's topic-local tools carry absolute home paths (precedent: 22 files on main).
- 23:0xZ Landed 7a8d3e5f (main). Lead: on a full wake run test:unit and compare test names with the 21:00Z run (834 vs 835); a name missing while awake = incident, 835 = it was the sleep. Mac in DarkWake since 23:00:50Z: parked, no holds, no tests. I-101 resolved as a duplicate of I-098 (rest-script's hangs matched sleeps 21:43:31-21:58:58Z and 22:00:07-22:15:26Z). P-089 T3 proposal draft read (fixes/rest-script/proposal-p089.json 7e9cbb4172f1, README dedbd049513e, both uncommitted): CHANGES. R1 area max 426.75 CSS px (Chrome 1024), not 296; R2 keep must name the less-work gate (lead un-park + short phone no-worse check, after T-052); R3 reduced-motion users save nothing (census 430r all SAME) but get the non-exact row; R4 the Sim "about 1.5 s" was not measured (rest shot T2, quiet 2.5 s T0); nits: maxima from different shots, census wording/windows, name st6-rb2, add fill 64. rest-script revised it to fd1dc74c2c91: ops re-read PASS (all 8 points; settle 1200 in fw-sim fix.json supports "about 1.4 s"). Commit after a full wake + test:unit; lead publishes after the user batch.
- 22:1xZ Lead rulings P-089: (a) 430r T3 stands (user wording "reduced motion exact"), rest-script parks, no v5, no new legs; (b) no 1440 intoview remedy, unscored, harness change only if the user decision needs desktop numbers (re-hash + ops diff read); (c) T3 beats no verdict. Scored: T3 0.35 HIT, T2 PASS MISS, no verdict MISS. Next: rest-script drafts the T3 proposal (keep / drop rest-script; must state 1440 intoview unscored), ops reads the draft, lead publishes after the open user batch (PR-012, PR-013, C-035, T-052, T-053). rest-script head 7088208e (README 430r correction), 5c1777f5 (Chrome run note); it opened I-101 (two unit tests hung ~920 s at 21:43Z and 22:00Z, not blocking).
- 22:1xZ I-098 update (lead): the Mac cycles Maintenance Sleep / DarkWake every few minutes (21:39-21:40Z, 21:41-21:42Z, a DarkWake 22:15:26Z); user away. Workaround: after two sleep-VOIDs in a row, park the chain until a full wake or the user's next message; no keep-awake (C-024). No agent had queued chrome-measure or simulator holds at 22:17Z. iphone-runner: the C-035 runner died in a sleep, the lease lapsed 22:08-22:16Z with nobody taking the phone; fixed with 10-min wait pieces plus a renewal before each (lease to 22:46Z).
- 21:5xZ P-089 Chrome result read sent to the lead. Chain EXIT 0 21:37:19Z; hashes = option A set every hold; shared lane w2; pmset OK per hold; ops re-score byte-identical. 430r T2 on all 5 shots (shade <= 4, 10305 px over A/A, 0 counted): fails registered rule 2 (reduced motion T0/T1) = T3 by the decisions list; 1440 and 1440r LEG VOID (intoview record resize 386.8 / 490.5 ms; deterministic, both arms, st6 325.5 / 492.7). Ops CORRECTION: the 20:4xZ "reduced-motion legs 0.75 HIT" scored the Sim leg only; now MISS. Lead rulings pending: (a) 430r rule 2, (b) 1440 intoview remedy (rest-script prefers a harness change: needs lead OK, re-hash, ops diff read), (c) T3 vs no-verdict precedence. rest-script told: no re-runs or harness change until the lead rules.
- 21:3xZ P-089 Chrome interim (relayed to lead): chrome-430r OK and scored (REST-QUIET agree, MASK OK). chrome-1440-rec try 1 HOLD VOID (Maintenance Sleep 21:17:39Z to DarkWake 21:32:57Z, PMSET VOID, rc 124), not a strike; try 2 from 21:33:03Z. rest-script attached caffeinate -i -s -w <chain pid>; lead ruling 21:3xZ: no caffeinate on Chrome pixel holds (C-024 = timing, Simulator, phone only), kill relayed (pid exited 21:35:59Z; assertion window 21:33:41-21:35:59Z: chrome-1440-rec try 2 from 38 s in to its end 21:35:09Z, and the first 50 s of chrome-1440-rep try 1 (start 21:35:09Z); flag both in the read; also name pid 57532 = Claude Code's own -i -t 300, PreventUserIdleSystemSleep only, not an agent's, no effect in DarkWake); try 1 excluded everywhere, sleep-VOID = re-run not strike, pmset window checked on every hold. The slow test:unit was this sleep (closed).
- 21:3xZ Note: npm run test:unit took about 16 min wall (835/0) while the Chrome chain ran; normally ~5 s. Cause: the Mac slept (next line).
- 21:0xZ Landed 4bb26c19. Lead adds to the P-089 Chrome result read: confirm every Chrome hold ran in the shared lane (no timing; holds.log weight 2, --shared) and pmset was clean per hold, as for the Sim legs.
- 21:0xZ Landed 34b59994. Lead: P-089 Chrome need not wait for fix-morph-gpu (its re-runs wait on PR-012, not queued; FIFO if they queue later). rest-script README condition at 99c26adb (README only; Chrome verdict = worst over quiet, intoview, moving; rest excluded; intoview VOID = one re-run). Ops re-checked all 10 tool hashes at 99c26adb and live: unchanged. OK sent: chainJ.sh chrome may queue; no tools/ edits until its scoring ends.
- 20:5xZ **P-089 Simulator result read PASS + option A diff read PASS (one wording condition).** Sim chains (be00187f) ran 13/13 holds first try under the 931d7ee6 hashes (hash files before/after both chains identical); ops re-score from raw with the registered t2score/t2aux reproduces every tier. fw-sim rest T2 / quiet T0; fw-ipad rest+quiet T0; reduced motion all T0/T1; coverage 12/12, MASK OK (fw-sim far-0/intoview/smooth-100 are T1 only under the mask, unmasked still T2: noted to the lead). The fw-ipad repst6 hold and carousel leg (b) shared fw-ipad in sequence (lock serialized: 20:38:33-20:40:19 vs 20:40:25-), no overlap. Option A 19ac898b: hashes in PREDICTIONS P-089; condition: README states the Chrome verdict excludes rest. Chrome holds may queue after that line and fix-morph-gpu's re-runs.
- 20:5xZ Landed 276e98e7. **PR-013 published** by the lead (rev 4 = rev 3 at 44711176 + the L1530 nit): avatar slider keep-st6 (recommended) / match-original; Simulator screen-crop pairs (phone rest, reduced motion, iPad; base vs base2 for B); "Try it" on A; B cost row "expected, not measured on the original code". Board: carousel-leaver waiting on user PR-013; fix-carousel-leaver owns the follow-up. PROGRESS hero-carousel next + change entry updated.
- 20:4xZ P-090 AMENDMENT 1 results + draft rev 3 (44711176) read PASS, sent to the lead to publish. Re-scored both legs from raw with tierq c36772776b4a: exact. (a) reduced motion NOT exact (S~base 1761 vs A/A 1260; S face 1 outside A/A), T2 static holds; (b) iPad 1032 DPR 2 within T2 static, not mask-dependent. Base loads differ under reduced motion (OBSERVED). Rev 3 applies the lead flags (a)-(c); one wording nit ("never" -> "did not in two loads"). Predictions scored in PREDICTIONS P-090.
- 20:3xZ P-090 read + carousel proposal draft rev 2 (6070bf5c, README L1406-1459) sent to the lead together. Rulings (a)-(d) applied. Three wording flags left for the lead: Chrome "0 px" is n8 0 but A~S any 3360 px max 3 (A~A2 4292 max 5, re-computed from h4b raw), and the frames are just after a slide, not rest; "within near-identical" is phone width only until legs (a)/(b); option B "19-27 come back" is inferred from S7 C. Lead queue order relayed: amendment leg (a) running since 20:36Z, (b) next, between rest-script holds. Lead accepted the three flags; rev 3 (flags + leg results) comes to ops for a read, then sha + read to the lead, who publishes.
- 20:3xZ Landed 5d90b4d7. Lead number rulings for the carousel draft: (a) 71/71->1/36 only for st6-rb2 if the slider code is shown unchanged from aw1-10e, else name aw1-10e / "an earlier build with the same slider change" / drop; (b) screen share 0.0315 % plus per-face max 69.9 beside the 126 sum; (c) 19-27->0 labelled "scripted scroll test, 4 runs each, one session, OBSERVED"; (d) st5-lead disclosed, St/So/Sw VOID, conclusion on Sv + Hold B. Forwarded. P-090 AMENDMENT 1 read PASS (87d9e925; hashes in PREDICTIONS) with 3 run conditions (matchMedia VOID from the recorded field, screen share reported, first iPad boot timeout not a strike); legs may queue after rest-script. Carousel draft rev 1 still flagged (0.04 % of view, aw1-10e wording, 19-27 label, cites VOID Sw 605/48 in option B, unsourced "Chrome 0 px at rest", motion sources): rev 2 requested; read + draft go to the lead together.
- 20:3xZ **P-090 result read (a88327d7) + lead METHOD RULING.** Ruling (lead, 20:2xZ): on screen (simctl composited screenshot) governs T2 on WebKit; the snapshot path (Page.snapshotRect) is reported alongside, labelled OBSERVED. Read: Hold A/B re-scored from raw with the registered tierq/screenfaces, reproduce exactly (A on screen S/St/So 1137/50, Sv 998/48, Sw 605/48, A/A 0 both ways; B: base #11-13 match base, Bs no match, Bs~base 1824/92); served hashes match; pmset clean. DEVIATION to disclose: slot st5-lead (collapsed leaver, opacity 0) is not .st5-next, and St/Sw keep matrix(0.35), So keeps opacity 0 there, so under addendum item 3 St/So/Sw are VOID as written; README says "every override applied". Conclusion unchanged (no candidate; S, Sv do not match either). Number check for the user draft: 0.0379 % is of the page viewport 430x775 DPR 3, not "the screen" (screen gives 0.0315 %); 126 CSS px2 = 1137/9, sum of 4 faces (max face 69.9); max 50 = Sim on-screen, quiet rest, A/A 0 over 2 loads; 71/71 -> 1/36 = rotator-st6 README L37-46, phone Timeline W, view Layout >=10 ms at slide starts, C = aw1-10e (not st6-rb2), mechanism count; 19-27 -> 0 per 20 s = P-067 S7, scripted, idle 20 at top, n=4/arm, one block, OBSERVED. Lead amendment leg (not an attempt, not a strike): on screen quiet rest st6-rb2 vs base with A/A each, (a) reduce-motion on at 430 (+ matchMedia VOID), (b) 1024 DPR 2 (F-199: A/A >= 3 loads or crop off EN); ops reads it before the hold. All sent to fix-carousel-leaver; read + revised draft go to the lead together.
- 20:2xZ **Lead: P-089 Chrome option A approved under P-084** (no Chrome hold run, adds a measurement, drops none). Conditions: (1) rot2 quiet shot as simrot2 (slide end, freeze with timers held, 2500 ms, capture; own replay and A/A); (2) a `since` field on every Chrome rest/quiet/intoview shot, rest kept and labelled "transient-exposed"; (3) Chrome PASS/FAIL on quiet and intoview, a rest/quiet disagreement goes to the lead; (4) ops reads the diff and re-hashes rot2, t2aux and chainJ before any Chrome hold, amendment and hashes into PREDICTIONS.md, predictions unchanged. No C; the claim stays UNRESOLVED. Relayed to fix-rest-script.
- 20:2xZ **Correction (ops): the P-089 Chrome-leg ruling was wrong.** It rested on fix-rest-script's wording ("rest >= 3.2 s quiet") without a check of rot2. rot2's 2000 ms quiet is at page load (L108); the rest shot is slide start + 400 ms, freeze, + 1200 ms settle (L149, L128): 1383-1459 ms after the slide end in the v4 ident4 records (intoview 3906-3984 ms). Under the lead's 1.5 s condition every Chrome rest shot goes back. fix-rest-script holds `chainJ.sh chrome` (README 3de2eaed). Options sent to the lead: A rot2 quiet shot + `since` field (harness change, ops diff read), B waive with the numbers, C settle Blink's image-quality timer from Chromium source. Sim chain unaffected. Lesson: check a ticket's timing claims against its code before ruling.
- 20:1xZ 5296256c landed. Lead: the Chrome-leg ruling stands on the >= 3.2 s ground only; "F-200 is WebKit-only" stays UNRESOLVED unless Chromium source is cited; at the P-089 result read, any Chrome rest shot < 1.5 s after a slide or resize sends that leg back for a quiet shot (relayed to fix-rest-script). P-090 probe repair as non-strike: agreed.
- 20:1xZ **P-089 REGISTERED** (fix-rest-script addendum 931d7ee6, read PASS): pmcheck (per-hold pmset window from an in-hold stamp), hold VOID + one retry + leg stop in chainJ, t2aux coverage and unmasked; all hashes, selftests and re-runs reproduce (unmasked 1024/sim4: MASK OK). Chrome legs need rest/intoview only (accepted because rot2's rest is >= 3.2 s quiet; "F-200 is WebKit-only" flagged as an unchecked platform claim to mark UNRESOLVED or drop). Lane: chainJ sim then reduced after P-090 Holds A/B; chrome after fix-morph-gpu. **P-090 Hold A run 1 VOID before any shot** (20:13-20:16Z, SLOTS expression SyntaxError); probe repair 1 simquiet 7188a92a6782 (74ba400e, one line), not a strike; re-run allowed. Host load1 56.5 at 20:13Z noted to the lead.
- 20:0xZ **P-090 REGISTERED** (fix-carousel-leaver addendum 8d35207b, read PASS): all 7 items and the lead's masked-pass ruling are in; simquiet records each slot's transform/opacity/will-change, so the override VOID rule can be read; probe hashes unchanged. Predictions: on screen P(S matches base) 0.25; snapshot P(exactly one of St/So) 0.6, P(So | one) 0.6; Hold B 0.55. Row added to PREDICTIONS.md. Hold A may queue now (Sim lane, first). P-089 addendum still owed.
- 20:0xZ a59b8b98 landed. **Lead mask ruling** (for the P-089 and P-090 result reads): a T2 PASS or match that holds only because the A/A mask hides the fix's own differing pixels is not a PASS. It goes to the lead as "mask-dependent", with the unmasked counts (fill max, edge max, share, CSS px), and the lead decides whether it becomes a user proposal. Lane order approved: P-090 Holds A and B, then P-089 Sim chain; P-089 Chrome after fix-morph-gpu; all non-timing shared-lane holds under the I-098 easing (pmset check per hold, re-run on overlap). Ruling relayed to both owners for their addenda.
- 20:0xZ **Registration reads, both CHANGES (addenda before any run).** **P-089** (fix-rest-script a79d3866): all 8 hashes match at the commit and in the live tree; t2score and t2aux selftests OK; t2score on sim4 and ident4 1024 reproduces the README line for line. Owed: a pmset check per hold (I-098); a failed hold voids its leg and stops the chain; rest/quiet/intoview non-VOID and >= 10 of 12 moving frames per leg; the A/A mask cuts both ways (1024 smooth-160: 10154 px differ, A/A mask 1208, 5 counted), so ops will count the unmasked d > 8 at the result read and flag "mask-dependent" labels to the lead; frozen moving frames are at Default quality (1200 ms settle, F-200); predictions (P(T2 PASS), readings a/b/c, P(quiet T0/T1)). **P-090** (fix-carousel-leaver 00cb3d84): probe and overlay hashes match, each overlay is one appended block; tierq on D4 quiet crops reproduces 81/523/0.0174 %; screenfaces passes a 72 px-shift fixture. Owed: the case where 2+ of St/So/Sv match; an A/A floor (base~base2 on screen n8 >= 523 makes Hold A inconclusive, matches in both directions); a VOID when computed overrides did not apply; pmset VOID; burst shots scored only when the whole window is inside; scoreable snapshot and Hold B predictions; per-class fill/edge maxima before part 2. Lane: P-090 Holds A and B first, then P-089 sim and reduced.
- 19:5xZ **I-100 landed** (0b082d16, resolved; npm test 1556/1556): `sim.mjs session --reduce-motion on|off` + `sim.mjs reduce-motion` check; documented in research/simulator/README.md 7 (ops, docs only). fix-rest-script (P-089) and fix-carousel-leaver (G, P-090) told to rebase and write a real Sim reduced-motion leg (matchMedia read per arm, Sim A/A) instead of "pending I-100". F-200 citation complete: WebKit 789c0d1be2b7 ImageQualityController.cpp L46 / L146-228 / L83-101 / L108-122 (fix-carousel-leaver 656629cf, which also notes the version gap between WebKit main and the Simulator's WebKit; the explanation of our numbers stays OBSERVED). de-breakpoints census db01a8c8 (land request to the lead): all 15 configs counted, no setting reverses a count; under reduced motion st6-rb2 adds a small rest cost (+4 recalcs, +24 paints in 4 s, +19/+27 layers); F-199 acked (census is counts-only; earlier pixel legs masked or repeated EN).
- 19:5xZ **F-200** + carousel D4 (32708ca, 19:31:32-19:34:20Z, pmset clean, A/A 0): the WebKit rest difference is image interpolation quality, not geometry. WebKit ImageQualityController (CONFIRMED in source, but read from WebKit main without a commit hash: ops asked for the commit + lines; until then the citation is incomplete) switches scaled bitmaps page-wide to Low for 500 ms after an image paints at two sizes; the baseline's width-animating leaver triggers it, st6's transform-only slots never do; snapshotRect settle loops (<500 ms) keep it on. With quality matched, S~base is 523 px, max 81 (> T2 fill 64), from st6's slot scale(1)/opacity .999. P-087 W1/W3 and D1 rows now say "measured under the settle loop". Options to the lead (README "D4 result"): G1 = F + slot rest values back to base (expected exact, but brings back the hasTransform/isOpaque flips st6 removed), a transform-vs-opacity split first, or a user proposal; WebKit on-screen checks need a composited-frame capture (snapshotRect repaints). F-199: EN not in any carousel crop (acked). F-200 relayed to fix-rest-script: P-084 v4's sharper 4th avatar fits the mechanism (no slide played -> no Low mode); P-089 adds a >= 1.5 s quiet rest shot and an image-rendering pin arm.
- 19:5xZ **F-199** (fix-morph-gpu, 19:34Z): nav "EN" label at one of two sub-pixel x positions per load, either build, 22 CSS px, shade <= 94, edge; a two-load A/A misses it when both loads land alike; pixel tickets covering the nav mask the EN strip or take the A/A over >= 3 loads. Ops acked; relayed to fix-carousel-leaver (G, P-090), fix-rest-script (P-089) and de-breakpoints before registration. **PR-012 corrections posted to the user as T-054 (lead)** instead of revising the undecided proposal: its A/A line misses the EN flip, and item 4's "exact" ignores Chrome's two-state flip at m 1. morph-gpu re-run 0b0070e2 is notes only, not landing now.
- 19:5xZ fix-morph-gpu confirmation re-run (0b0070e2, one shared probe slot 19:23:14-19:26:15Z, pmset clean): counts and desktop reproduce; PR-012 unchanged. **Correction to the 18:3xZ entry:** its three sleep-hit runs had already been re-run cleanly at 18:09:58-18:13:01Z and PR-012 rev 1 carries those numbers, so this was a second confirmation, not owed work. New noise source (OBSERVED, cause unknown): the nav "EN" label lands at one of two sub-pixel positions per load in either build (22 CSS px, shade up to 94); a two-load A/A can miss it; old vs new values to the lead for PR-012. Coupling with de-breakpoints' rm1440 "EN" pixels; asked for a findings post. Chrome lane free again: de-breakpoints census next (lead).
- 19:4xZ Lead decisions: fix-morph-gpu resumed for the owed I-098 sleep-hit re-runs (one shared Chrome slot, reports to lead + ops, flags PR-012 number changes); **P-089 desk work started**: fix-rest-script (a326003adcb764633) resumed by ops with the brief (five-number scorer hashed, run on sim4/, ident4 1024 scored, ticket with Chrome 430r/1440, Sim desktop + A/A, Sim moving check, WebKit reduced motion "pending I-100"; no T2 pass without it). I-100 opened, ts-i100 spawned (sim.mjs reduced motion); peer row added. de-breakpoints part 3.2.2 landed (e9525b6e): decode identical, the soft baseline is a never-repainted first-paint raster, an invisible repaint makes it sharp; no difference without reduced motion. **rm1440 closed by the lead reading (T1 within the baseline's load states), pending objection in T-053.** st6-rb2 avatars stay OPEN (F-198). Board breakpoints: parked, census after morph-gpu, T-040 iPad after carousel diagnostics. carousel-leaver: D2 (19:15:42-19:18:10Z) at-rest geometry identical; D3 (27e8213, 19:22-19:24Z) card opacity/blur, slot layers and slot opacity/transform do not explain it (Sw moves away); suspect WebKit ImageQualityController low-quality mode (source read; ops asked: cite file/line/commit for CONFIRMED mechanism, OBSERVED for our 3303 px; settle-loop caveat on P-087 WebKit numbers; G bar is the baseline look, smoother = T3); D4 (simcrop 809bc40fc2de, opt-in CL_QUIET) describes-only, running.
- 19:3xZ Digest sent. **P-090 reserved for carousel G** (D2 describes-only at 1ad123c, simgeo 65c07d103536, OK from ops); F3 edge ticket -> P-091+ (fix-nav-morph told). P-087 wording fixed b56a3e6. hero-exit named residual R2-iPad-AFP (20dc195b): iPad Private Browsing window <= 600 CSS px, finger only, still takes the phone path (lead: stays open, no UA term; closes with an iPad narrow-window Sim check, needs a sim.mjs resize). Free Chrome lane candidates sent to the lead: (1) fix-morph-gpu re-runs (stepped switch-off, desktop, per-phase counts; 3 runs hit by I-098 sleeps), (2) P-089 registration then Chrome legs (reduced motion WebKit leg cannot run: no sim.mjs reduced motion), (3) de-breakpoints parked census after its 3.2.2 decode trace.
- 19:2xZ **P-087 result read PASS** (19d6d38): served.txt x5 match, last pmset Sleep/DarkWake 17:57:12Z before every span (18:26-19:01Z), P5 re-scored from copies of c2/back-* with pairs 8a246b42bcf6 / score fdbcae16946d: identical (A~F L.w 10.248 vs A~A2 10.232; 8 quantities out by <= 0.018, reported as such). Ruling P3 Sim: "F~E" does not cover F2 -> HIT as registered, noise-limited (F~F2 medians exceed the limits). Lead: P5 strict MISS stands; F-198 route = bounded st6-rb2 follow-up G by fix-carousel-leaver (next free id, two attempts); PROGRESS hero-carousel: st6-rb2 WebKit pixel status OPEN (landing check Chrome only, st6-rb2 README rows 57-60), best-build unchanged. **P-088 second read PASS** (01dfc011 + e5a8a650): hashes, snapshots and --fn lines verified, scorers run in P-088 form on P-081 data (fm1F reproduces the note); must-fix done (b-* verdicts read from per-pair lines, summary line unused); h165958 no-strike, 5.3 cooling, fm1F params frozen with disclosure. Table row added; runs after T-052. **F3 edge draft rev 2 PASS** (db908c97; fixture invocation re-run identical; final scorer ad0037856fa5 at 6cb662d7, only the VOID wording changed), lead approved, registers P-090+ after T-052 behind P-088. rm1440 (de-breakpoints 8047f298, landed 5ad6b3b2): raster-scale REFUTED, load-dependent hero photo rendering; same-state T3 in st6-rb2 (lead takes it to the user), T1 against the baseline cold/fast range; Sim reduced-motion leg UNRESOLVED (simctl cannot set it). Pmset: no sleep since 17:57:12Z. hero-exit R2 (580e5e00, lead ruling: gate narrowed to touch phones): JS 924be86afac8, CSS cc74cd980e72, snapshot hext-R2-924be86afac8, s at 4503; gate truth table Sim iPhone on, Sim iPad 13 off, Chrome off, stubbed narrow mouse off; phone pixels R2~R 0 outside the seconds cell; residual iPad Private Browsing finger-only window <= 600 still takes the phone path (CONFIRMED from WebKit blog 14795 + WebPageIOS.mm 4641-4644 at 5d643104e491, not run); UA term offered to the lead. For R's landing record, not a P-088 arm.
- 18:5xZ **Digest + lead questions.** rest-script P-084 v4 vs T2 from the record: 5131 DEVICE px (fw-sim DPR 3, crop y = 177 + 3*top) = ~570 CSS px^2, one element (4th avatar), Sim A/A 0/0 so all beyond A/A, max 49, fill (resampling, Laplacian 1010 vs 962), static; worst case <= 0.14 % screen, <= 570 CSS px^2: size numbers pass, but no >8 count, no reduced-motion identity (430r/Sim), no desktop width scored (ident4 1024 ran unscored), no Sim moving check (simrot logpoints 0): T2 not confirmable. Lead: re-judge is a new question, **P-089 reserved**, registers after rm1440 and P-087 clear the lane. rm1440: owner de-breakpoints (a3218eb3da6f14d91, README 3.2 re-raster toggle); lead resumed it for Chrome then (if sim.mjs can set reduced motion) a Sim leg, shared lane, results to lead + ops. T-040 plan is not a file: de-breakpoints SendMessage to main 10:02:43Z (its task transcript); I-087 (fe99224) already gave fw-ipad + rotation; T-040 iPad pixel check queued behind rm1440, Mac Safari leg only if the iPad leg needs it (user steps). I-099 resolved (97cc63a). P-087 probe repair be76bd9 accepted (pord 492e7980cb65, VARIANT after centring; C3/C5 void pre-catch, one re-run each). P5 ruling to fix-carousel-leaver: strict, F~A 10.248 vs A~A2 10.232 = MISS by 0.016 px, late-start frame post-hoc, landing weight to the lead. fix-nav-morph: panel-dvh REFUTED, closed (1c2831f9); F3 edge-residual draft 3c39f49a second read: CHANGES (2-of-4 and mixed-owner gaps, misaligned style/paint windows, numeric control void check, prediction, scorer hashed + fixture-run at registration, run void rules + two-strikes, Composite != CA commit claim, served hashes); stays unregistered until T-052 (lead); M out, B1 end-pin M hold a later ticket, B1 needs no hold now. fix-hero-exit-threaded y0 scroll-cue T2 note (R/F7): shade 6, 0.055 %, 219 CSS px^2, edge, static, A/A 0; with shade 6 the >8-level count is 0; reduced motion + desktop width checked at the P-088 read. PROGRESS f3-arm-scope next = lead wording.
- 18:4xZ **P-085 result read PASS** (e22dd73, land/p085 on main): scorers 385eb00f1564 / f7ae2c55677b, 10 run files + read file byte-identical runner vs scorer copy, frames re-run equal except paths, phone-read --analyse equal (DOM PASS, earn d +1, visible -11 [-32, 17]); moving >50 21 -> 0.5, >34 56 -> 1; whole stack vs baseline. morph-inherit: landed, correctness fix, not less-work nor top-3, so no finger test; P-085 was its last check: PROGRESS gate/next/detail + change line. Board tidy (lead): image-cost landed (4a17ad3); f3-arm-scope landed (e22dd73); morph-gpu waiting on user PR-012; countdown-faces / cd-roll-ca (parked) / cd-strip now wait on C-035 (live re-run of skipped C-033). I-095, I-097 resolved; I-099 open (non-blocking, ts-i099). Thread routing a2f487f (T-050/T-051) broadcast: findings board + fix-hero-exit-threaded, fix-carousel-leaver, iphone-runner, fix-nav-morph (resumed by it), ts-proposal-talk (resumed by it); topic-map commands sent to the lead (status ids + hero/end/morph/countdown/carousel; morph-gpu unmapped so PR-012 reaches the lead). Peer directory rows added for this session's agents. Rebase reminder sent (e22dd73).
- 18:3xZ **I-098 eased** (lead 18:10Z): timing holds and phone blocks stay paused until T-052; non-timing shared-lane jobs (tests, test:unit, commits, Sim/Chrome pixel and count probes) run again, each followed by `pmset -g log | grep -E '\s(Sleep|DarkWake)\s' | tail -2` and a re-run if a sleep fell inside; one job per agent, light load. Relayed to all six; PROGRESS line updated. All six confirmed paused before the easing (iphone-runner, de-image-cost, fix-morph-gpu, ts-proposal-talk, fix-carousel-leaver; fix-hero-exit-threaded via the lead). Sleep checks: P-085 holds clean (end 17:13Z); de-image-cost clean; fix-morph-gpu F-195 data clean, 3 count/pixel runs (17:38:50-17:39:55, 17:40:05-17:40:44, 17:58:17-17:59:21Z) to re-run; 5466194 (T-048) landed, no sleep in 18:00-18:04Z. Asked the lead: P-087 is all pixel/paint-order/count probes, so may it run under the eased rule (the lead had said "when timing resumes").
- 18:2xZ **I-098 pause** (lead 18:1xZ, blocking): second sleep 17:41:47-17:57:12Z, then ~15 min sleeps with 3-4 min dark wakes; no new lock holds (Sim, tests, probes, phone runs, npm-test commits), desk work only, anything overlapping a sleep void; waiting on user T-052. Relayed to iphone-runner, fix-carousel-leaver, fix-morph-gpu, ts-proposal-talk, de-image-cost, fix-hero-exit-threaded; findings board + status row + PROGRESS change line. Confirmed paused: ts-proposal-talk (5466194 npm test 18:00:28-18:04:19Z, 1487/1487, check vs pmset), fix-carousel-leaver. **P-087 second read PASS** at 7643f68 (P6 desktop: Chrome 1440x900x2d C4 clp / C5 pord, Sim fw-ipad W3 simcrop; hashes hold87 d87b8f1c3d43, pord b81ea4a401d0, clp 07120dcca1ef, others unchanged; diff is --view + VARIANT only, default path unchanged). Runs after the pause lifts.
- 18:0xZ **I-098** (lead): the Mac slept 17:23:02-17:38:16Z (idle sleep, then a Dark Wake Thermal Emergency sleep; pmset); every process frozen. Lead rule: any hold, Sim session, probe or test spanning it is re-run, never scored (wall-clock timeouts, Sim counts, lease expiry broke). P-085 ended before 17:13Z: unaffected. Relayed: findings board + fix-carousel-leaver, fix-hero-exit-threaded. Possible second stall ~17:47-17:57Z (ops' 500 s wait took 18 min), sent to the lead to check. User asked in T-052 how to keep the Mac awake (C-024 limits caffeinate to holds). At every result read: check run stamps against these windows.
- 17:1xZ **P-087 second read** (fix-carousel-leaver, registration 946b98e): probe hashes all 9 verified; snap E1/F1 0444, JS 7bf7c4657d21 both, CSS E 9c12648e24e1 / F a984ae7b7715, F = E + `z-index: 1` (+ comment) only; lead terms covered (P1 0 px Chrome+WebKit, P2 paint order every t, P3 motion as E, P4 layouts per slide E +- 1, P-086 void rules). Condition 1 (ops): mechanical A/A-limited rule (a t with A/A > 0 is undecided, one re-run, then the lead; sole exception Chrome clp post300 if WebKit post300 A/A 0 and F 0): addendum 7c00972, checked. Condition 2 (lead 17:1xZ, PR-010 reading: phone + one desktop width): one desktop-width pass (Chrome + Sim wide, A/A, same t grid, P1 + P2) or a one-line DOM check if the carousel is not the sliding variant there; PASS on that sha. hold87.sh prints served hashes without enforcing: ops checks served.txt at the result read. No iPhone part. P-085: block done (iphone-runner): H1 h161622, H2 h164019, H3 h170510 all VALID (Serious/No both ends, sentinels S1 60.2/52.3, S2 60.0/51.7), 8 counted, 0 voids, 0 strikes. H3 first try h165958: start read exit 1 "state changed during the read" (Fair->Serious, 38.5 °C), no step, no files: ops ruled not a strike, lead agreed. Driver out/iphone-runner/p085.mjs sha256 05cb22a59969: warm-and-reread retry only in the start loop (exit 2 too cool, exit 1 state changed); end gate single read, no retry, GATE-FAIL never scored (checked by the runner; goes into the results record). Scoring with fix-nav-morph, then the ops result read. Lead: C-033 (cd-strip swipe A/B) re-posted by iphone-runner; phone order after it: P-088, then any P-087 phone part (none). ts-i097 has I-097 + `lock.mjs leave` + SIGKILL grace.
- 16:3xZ **P-081 RESULT** f23b583 (fix-hero-exit-threaded): ops second read PASS, scorers re-hashed, all four outputs re-run from raw byte-identical. a-C, a-F hit; b-fm MISS both pairs (first-move from a rest at y548: P 9-19 vs C 2-5, go-live from parked; fm1 y3 L +3/+1); b-ts OUT in pair 2 only, in on C1 vs F1: load-sensitive, no verdict; frames band no-worse, not threshold-sensitive. Ticket rule: back to F. Label deviation: scoreF hardcodes claim arm V; the ticket text said `--fn F:` (my registration read missed it); the owner ran F as V:, no number changed. No F3/C3 ran (iphone-runner). **P-088 reserved and approved by the lead** for hero-exit round 9 (arms (a) keep layers, (b) no in-band park; Sim cost card with a start-from-rest case; pixels per arm; ticket with the V label; after P-085). next free P-089. Lead: I-096 resolves once the lead's npm test on main passes; fix-morph-gpu told to collapse its three queue entries to one. P-085 H1 started 16:12Z (iphone-runner, 3 holds: H1 S1 R wB wM | H2 B1 M2 M3 B4 | H3 B5 M6 M7 B8 S2).
- 18:5xZ **P-081 data** (iphone-runner, hold h155146 15:51-16:05Z; start gate Fair (too cool, before any run) then Serious after pre-warm, end Serious 41.79 °C, timer 30 ms; sentinels S1 60.2/58.1, S2 60.1/58.5 PASS; C1 F1 F2 C2 Timeline on, exit 0; files agent-a7696771bf38f1229 out/p081/). ts-i093's commit hook ran npm test outside any lease from ~16:01Z: load1 F2 4.27->20.43, C2 17.74->11.48; F2 gesture span 24,240 ms vs ~23,700-23,950. Ops ruled keep all four + a pre-declared C1-vs-F1 sensitivity line (a verdict that differs between all-four and C1-vs-F1 is load-sensitive: it goes to the lead with no verdict claimed). The lead first voided F2/C2, then **withdrew the void: ops ruling stands, all four scored, no strike**; any re-run already under way is supplementary F3/C3, reported apart, never a replacement. Told fix-hero-exit-threaded (twice: void, then correction) and iphone-runner (the lead also told iphone-runner). ts-i093 told by the lead: commit only while shown as a shared reader. Backlog (lead): `lock.mjs leave <lock> --owner <o>` to leave a queue (a stale "ts-i093 shared w2" entry lingered until timeout). Lead also landed df03d80 (research/architecture/thread-routing.md, T-050; user OK pending; toolsmith after ts-proposal-talk's console work, or the same toolsmith).
- 18:4xZ (lead): 757a59e landed. **Build F approved; P-087 given to fix-carousel-leaver** with the lead's terms (0 px vs baseline at every t, Chrome AND WebKit, A/A 0; motion rects unchanged from E; layouts per slide E ± 1; paint-order check over the whole slide: follower, scene overlay, next slot; P-086 void rules carry over). Registration before any F build or data; ops second read on its sha. st6-rb2 and so best-build carry the same paint-order difference: F landing fixes it in best-build via carousel-leaver's COMPONENTS line. Next free P-088.
- 18:3xZ **P-086 result read: PASS (the scoring is right; the verdicts are as the agent reported)** (fix-carousel-leaver 03ec4ec). Ops re-ran score.mjs fdbcae16946d on every Chrome (h4a) and Sim (sim3) pair: byte-identical to the agent's score files; recomputed every crop n8 from the h4b PNGs: same counts; served hashes, inView (all arms) and crop rects checked in the raw files. Verdicts: (1) Chrome hit, Sim miss (E2 F.xr 7.313 > 5.769; uninformative Sim matching); **(2) miss**: A~E n8 1083/477/213/78 at t 0-50 ms, 0 after; positive control live; cause paint order in the overlap lens (F-191); (3) hit; (4) Chrome DOM/Layout/Paint hit, UpdateLayoutTree miss by per-slide arithmetic only (totals 306 in every arm); Sim view-rooted hit (-10.4/-2.2; E window held 6 slides vs 5), carousel-rooted miss (7.4-7.5 < 8). Decision as registered: E not offered as exact. **Build F** (E + `.is-sliding img.st5-lead { z-index: 1 }`) needs a new P-id (next free P-087) and the lead's OK. E's five numbers: max 229, 0.030 %, 120 CSS px at t 0, fill, moving 0-50 ms -> beyond T2 (fill > 64) and moving: T3 as it stands. Row filled in PREDICTIONS.
- 17:5xZ (lead): **best-build LANDED 60df1cf** (main ff from 95ba751; only fixes/best-build/; snapshot and scope checks clean): JS 65052c4a3902, CSS e0f92804c521 = st6-rb2 + platform-idle + morph-inherit (wi-best-build). PROGRESS build{} now names it (since 15:48:02Z; fixes + platform-idle, morph-inherit, both inBuild true); change line 15:48Z; board wi-best-build row set landed; finding F-190 asks every agent to rebase between steps. Backlog section added (F-188 cost check, pixtol, ship-build driver strip, COMPONENTS rule). **P-081 hold 1 not a strike**: Safari had 4 tabs open, `open` refused AMBIGUOUS before any gate-counted run; iphone-runner posted C-034 (close the tabs) and keeps the lease. Count it as no hold (no gate read failed).
- 17:2xZ **P-086 conditions met at ada8fb0** (simclp 56c422d5cfbc: inView false -> arm VOID before Timeline, Timeline failure -> arm VOID, no retry; README void list: inView false voids every mode; clp 37b9e94812fa, score.mjs, hold.sh unchanged). Chrome holds 4a/4b ran on 37b9e94812fa before the conditions arrived; they stand (condition 1 was Sim-only; reported inView true in all 5 arms, carousel 449.9-481.9 of 932; 4b no blank shot, crops inside the capture [162, 1337, 337x121]; served hashes match): re-check in the raw files at the result read. Sim run 3 on ada8fb0.
- 17:1xZ **P-086 amendment second read: PASS with 2 conditions** (fix-carousel-leaver 2ebf2dc; position = the carousel itself centred at 0.5 vh, inView recorded; clp 37b9e94812fa, simclp 6d807217b80f, score.mjs fdbcae16946d and hold.sh eb3b5b00e30d unchanged, shape/leavtab/pairs new; hold 3 void with no data, run before clp.mjs was committed, procedural miss on record). Conditions before hold 4a / Sim run 3: (1) simclp's Timeline retry re-opens the tab without re-centring (geo from the old tab): re-centre per tab, or void any retried arm; (2) inView false voids an arm in every mode (README void list, ideally a code check). Lead sent its in-view OK ~15:37Z; disk: the user runs a script freeing ~21 GB (throwaway Chrome profiles + Simulator copy); ts-i095 owns prevention (T-049 #5).
- 17:0xZ (lead): landed 2d81d29 and de-pixel-rule 8285b1e (as 71bda7a: Try-it panel vs own tab, the slider is the same in both, OBSERVED, Chrome). **Memory 101e511 settles the wide-rule reading**: share and area count only over-8 pixels beyond the A/A mask (largest shade covers every pixel); moving content is T2 only when every sampled frame meets the numbers and stays within 1 device px, a difference only in motion or one that changes how something moves is a proposal (the stricter reading wins); check at phone width + one desktop width and the DPRs the technique depends on; no photo special case. Broadcast as **F-189**. Effect on the records: PR-011 R6 passes share/area over 8 (0.148 %, 470 CSS px) but stays a proposal (motion-only); item 1 the same; both accepted anyway. cd-strip's differences are all delta 1, so over-8 share/area is 0 (still T2 pending the reduced-motion check). (a) **P-086 amendment, lead-approved**: the registered #future-heading position left the carousel ~700 px below the screen, so holds 4a/4b and Sim run 3 scroll it into view, on fix-carousel-leaver's 2ebf2dc probes; hold 1 and Sim run 2 stay "off-screen" data only; the scoring by animation progress (shape.mjs) is post hoc. fix-carousel-leaver sends ops the amended line before the first hold: second read it then (hashes at 2ebf2dc, positive control non-blank). (b) **I-095 disk full**: user frees space (T-049; lead inventory ~21 GB no impact, ~50 GB small impact); agents hit ENOSPC. (c) **I-096**: comments only work on Threads (T-043 #6); ts-proposal-talk fixes it first, then T-048 (talk inside a proposal, small per T-048 #4). (d) New study **de-image-cost** (T-042 #20, user yes): photo sizes, decode and paint cost in the Simulator. (e) Backlog: **tools/pixtol.mjs** (five numbers + tier verdict, de-pixel-rule's proposal), a toolsmith after I-095 and I-093, priority #3.
- 16:5xZ **P-086 mid-run repairs** (fix-carousel-leaver, before re-runs): hold 2 VOID (every crop blank incl. the A-vs-S control: CDP clip rect) -> clp.mjs 8c8558b0b706 -> d9a98ec75d01 (full-viewport shot, crop in Node; same region/metric/t grid), hold 3 = the one allowed re-run, valid only with no blank shot and the S control showing n8 above A/A at t 17-200; simclp.mjs b63aa5821294 -> 22e0b266882b (Timeline retry; Sim run 1 void, run 2 scored); shape.mjs 10520d556eba + leavtab.mjs 76044f96b68c post hoc, descriptive only: (1)-Sim is scored by the registered score.mjs (Sim A/A 11.8 px widens its interval, does not void it). Early: Chrome E vs A <= 0.011 px (= A/A); Sim view-rooted E - S -1.2/slide (hit, negative: asked for per-slide counts), carousel-rooted 9.6/10.8 (in [8, 16]). Disk full, I-095 opened by fix-carousel-leaver. Ops asked for: commit hashes before hold 3, results sha with served.txt and re-hashed snapshots.
- 16:4xZ **PR-011 tiers for the record** (fix-hero-exit-threaded, README "Tiers under the wide rule", e5bc982 on worktree-agent-ae86b805e8f947ff0; Sim frozen frames, F k vs C k+1, A/A = C2; classes by C's 3x3 range: fill <= 2, texture 3-47, strong edge >= 48; countdown/clock rows excluded): item 1 (cue/headline edges) max 17, 0.237 % any level / 0.059 % over 8, cue 810 CSS px (197 over 8), edges, moving only (to 300 ms after stop): every T2 number passes, but motion-only -> the user's call; item 2 R6 (deck cards 120 ms after a live return to top) max 88 = edge level (strong edge 12,953 px max 88; texture max 33; fill max 2), 1.597 % any level / 0.148 % over 8, left cards 3,894 CSS px (470 over 8), moving only -> **T3** (fails 0.5 % and 2,000 CSS px at any level, photo detail, motion-only). Both moot: PR-011 accepted 15:23Z. Open question for the pixel rule: "share/area at any level" vs "over 8 levels" is not fixed by the memory text; de-pixel-rule's write-up should say which reading counts.
- 16:2xZ (lead): **PR-010 rev 3 ACCEPTED, option "wide", 15:21Z** (user note: the carousel can be investigated in parallel, there might be a console issue). Rule in memory 21b70e6 (`memory/illusion-must-be-pixel-identical.md`): T0 exact / T1 within A/A land as before; T2 lands after a numbers check (edge/sub-pixel only; fill <= 64, edge <= 128; <= 0.5 % of screen beyond A/A, <= 2,000 CSS px per element; nothing moved/recoloured/re-worded; reduced motion exact; real A/A in Chrome AND Sim; moving parts within 1 device px every frame; five numbers per case); T3 and motion-only differences stay proposals. **15:22Z the user undid PR-011 changes-requested, then 15:23:14Z ACCEPTED PR-011 rev 1 (accept-both)**, same note as PR-010 (carousel in parallel, console issue suspected). hero-exit-threaded waits only on P-081, then the finger test (phone disconnected, T-047); queue unchanged P-081 -> P-085 -> C-033. Done: finding **F-187** to all topics; re-tier for the record asked of fix-hero-exit-threaded (PR-011 items 1 and 2; R6 photo detail max 88: fill > 64 -> T3, or edge; owner decides with numbers) and fix-cd-strip (resumed by my message, stopped again): **cd-strip strip-tc = T2 pending a reduced-motion check** (Chrome T2: largest shade 1/255, 0.003 % of screen beyond A/A, worst shot ~13 CSS px, element ~9 CSS px, glyph edges, moving; WebKit T1 in effect: 1/255, ~0.001 %, ~3 CSS px, edges, moving, rate = A/A; strip-tc has 0 clock layout shifts, PR-008's were strip-rw's; within 1 device px by inference, OBSERVED; reduced motion NO DATA, ~5 min counts-only shared job each in Chrome and Sim, on its next wake, before its landing card; landing still gated on C-033); resume briefs for fix-cd-roll-ca and fix-platform-idle (PR-009 accepted, record only); fix-carousel-leaver told the leaver (~10 px, in motion) is T3 under any option, continue P-086 and give E's five numbers; de-pixel-rule checks the console-panel cause in parallel. PROGRESS: change lines 15:21Z and 15:23Z, hero-exit-threaded gate/next/detail, cd-strip gate, cd-roll-ca and platform-idle details. Digest 15:2xZ sent; ts-i094 row set landed (abd3e9f).
- 16:1xZ **P-086 second read PASS** (fix-carousel-leaver, 0399af4, no timing): probe hashes and E overlay/snapshot files re-hashed (E CSS 9c12648e24e1, JS = st6-rb2). Notes sent: served hashes are only teed to served.txt (score.mjs does not check them), so check them at the result read; snapshots live in the session scratchpad, re-hash them in the results; a hold killed at 300 s is void; report swap-race frames per arm. Row added; it measures now. Next: its result read.
- 16:0xZ (lead): d744b12 landed (ff-only). **T-047: the user is disconnecting the iPhone; all phone steps paused** until reconnect. P-085 runs by **iphone-runner from main's checkout, after P-081**, once the phone is back; the baseline-sentinel risk stays on the ticket (P(sent) 0.7). I-094: iphone-runner stopped iproxy :8100, so sim-orient should pass by environment; ts-i094's fix still lands. Open for the next ops: P-086 result read; P-081 result second read after its block; build{}/inBuild in PROGRESS when best-build lands; fix-morph-gpu may ask for P-087.
- 15:4xZ (lead): **priority change, user T-046 #5: hero and end-of-page morph on the GPU are top priority.** (1) Phone queue now **P-081 -> P-085 -> C-033**. (2) New agent **fix-morph-gpu** (board row morph-gpu): end-of-page morph on the compositor, pixel-identical design first, else a proposal; coordinates with fix-nav-morph; may ask for P-ids (next free P-087; P-086 went to fix-carousel-leaver 15:4xZ). (3) best-build + I-093 gate both PR-011 rev 2 and PR-010 rev 4: wi-best-build and ts-i093 top priority in the lock queue. (4) The lead adds an "original vs best build" Try-it once I-093 lands. (5) cd-strip does not land without the C-033 finger answer (top-3 fix, less-work rule); its row is user-waiting. **P-085**: fix-nav-morph's wording fix 3602ebf checked (README only: two strikes -> A word for word, EARN within spelled out; scorer hashes unchanged); P-085 row added to PREDICTIONS. PROGRESS: change line 15:45Z, next lines of hero-exit-threaded / morph-inherit / cd-strip / hero-carousel (leaver bug), two upcoming entries. Open: build{} still lists st6-rb2's fixes; when best-build lands, update build{} and inBuild (platform-idle, morph-inherit, cd-strip). Unit tests: 766/767, the one fail is I-094 (sim-orient, WDA :8100 up; ts-i094).
- 15:3xZ (lead 15:2xZ): (1) **T-046 best-build**: one baseline-relative `fixes/best-build/patch.diff` = st6-rb2 + platform-idle + morph-inherit (+ cd-strip once landed); it becomes the Try-it A side (ts-i093: `live.a` takes any committed patch); phone finger A/Bs use best vs best + fix. **wi-best-build** spawned to build and check it (no timing). (2) **T-042 #10, carousel leaver**: the lead ruled st6-rb2's leaving-face change a bug; **fix-carousel-leaver** spawned (delta vs st6-rb2, frame-by-frame identity, keeps st6-rb2's saving); next free P-086 if it asks. **Flag: P-067 and the st6-rb2 controls' pixel claims are "frozen at rest; missed the leaver"** (their identity checks compared frames at rest and never caught the leaving face; the timing results stand). Same flag on the P-067 row in PREDICTIONS. (3) **I-094** (mine): ts-i094 fixes sim-orient's :8100 check; it blocks `npm test` for ts-i093's commit while iproxy is up. (4) **PR-010 rev 3** posted (de-pixel-rule); rev 4 waits on best-build + I-093; **PR-011 rev 2** waits on the same. (5) **C-033 skipped** by the user ("not now"); phone off USB. Phone queue unchanged: C-033 -> P-081 -> P-085; iphone-runner keeps its servers. (6) Resume briefs: cd-roll-ca and hero-exit-threaded now say "restack on best-build". (7) **P-085 second read PASS** on fix-nav-morph's ticket 08169e4, on one wording fix before data: "Two failing holds in a row" -> "two strikes (two gate-failed holds, not necessarily in a row) -> A", as P-081/1065e2a. Verified: phone-read f7ae2c55677b, frames-p085 385eb00f1564, build.mjs c525536ab700; snapshots mi 7c61fe7d0662/f523598b2a24, bdrive afd388b8945a/27776f3d4138 (CSS = baseline's; JS = baseline + the 31-line driver only; its driver text equals mi's except __pinMax/__pinY -> page max / window.scrollY); thermal-gate 4604218c4041 is on main only (branch merge-base 01c83d5), so the block runs from main as ticketed. Notes sent: commit subject's arm order (9 letters) differs from the README's B M M B B M M B (README is the spec); "EARN within" = start within and visible not beyond; the scorer has no minimum runs per arm, safe only with the "second void at one position voids the block" rule. P-085 row goes into PREDICTIONS with the fix sha.
- 15:0xZ (lead): ba35f69 = my 3debdfb rebased. (1) **PR-011 changes-requested 14:44Z**: the user wants a Try-it. fix-hero-exit-threaded restacks on main + morph-inherit (resume brief sent by the lead, struck) and adds a hero-region identity check vs the P-081 snapshot; PR-011 rev 2 after I-093. P-081 itself stands as registered (C-033 first). (2) **I-093 open, blocking**: the Try-it panel compares only against the plain baseline, so option B also shows st6-rb2's own changes; that explains the user's PR-010 carousel confusion. ts-i093 adds `live.a` (a chosen A side). (3) **PR-010 rev 3** needs I-093's `a` so each option shows only its own change, whatever de-pixel-rule finds about the carousel. Watch: if the carousel difference turns out real, flag P-067 / st6-rb2 controls (see 14:5xZ).
- 14:5xZ **Digest.** I-092 (threads page lightbox blocking every click) fixed and landed d4117f1 (lead). **PR-010 rev 2 changes-requested 14:41Z** (T-042 pixel-tolerance rule): the user saw the avatar carousel animate differently in the Try-it panels for options B and C; de-pixel-rule checks phase offset vs a real st6/st6-rb2 change. If real, it touches the landed best build (hero-carousel, P-067; and every control on st6-rb2): ledger rows to flag then. Rev 3 must answer every point (proposal-decision-is-the-spec). fix-nav-morph running the P-085 Sim dry run (shared, 14:41Z); morph-inherit time series 44f522e landed.
- 15:0xZ **morph-inherit landed** (b11f977 + 0ad5407, review ACCEPT). Lead: (1) WebKit morph numbers on stacks without it are void for the morph region (P-079 morph attribution, F3 step 1), re-measure on main; marked in PREDICTIONS P-079 and PROGRESS. (2) Restack: cd-strip, cd-roll-ca, countdown-faces and hero-exit-threaded build on main + morph-inherit from their next build; C-033 and P-081 stand (countdown; y <= 884). (3) Reviewer's panel countdown cells at m 0.9/1 differ from the baseline in WebKit (max 11, 52 px over 8), attributed to st6-rb2, OBSERVED: sent to fix-cd-strip and de-countdown. (4) P-085: Simulator time-series check first, then fix-nav-morph's ticket, then ops second read. PROGRESS item morph-inherit added (landed).
- 14:3xZ **platform-idle landed** (501d9f7, lead): PROGRESS item platform-idle added as landed (L) with its P-077 numbers. The lead's line said "stays pixel-identical"; the README says not identical by a few LSB, accepted by the user (PR-009), so the plain line says "looking the way you accepted" (told the lead). Lead 14:2xZ: reduced-motion face-photo pixels are load noise, OBSERVED, cause unknown; PR-009 and the P-077 carry stand.
- 14:1xZ **P-085 = morph-inherit** (lead): a short phone no-worse check of morph-inherit (c4228b8, JS 7c61fe7d0662) against the baseline at the morph, driver M or a push past the end, under T-039 B; queued after C-033 and the P-081 block. fix-nav-morph registers the ticket after review-morph-inherit accepts; ops second read before data. The lead cherry-picks c4228b8 if the review accepts (its gate scripts sit in 28c36e2). Hand-backs go straight to the lead.
- 14:0xZ **Morph caveats applied (lead: the phone agrees):** iphone-runner's out/navread on st6-rb2 and strip-tc: header --morph 1, children 0, logo x 43, earn 110, panel frozen at 0.924; status "OBSERVED on phone + Sim, cause UNRESOLVED (WebKit main says it should re-resolve)", F-183/F-184; fix-nav-morph owns the correction (morph-inherit). Notes added as listed: P-049 to P-052 (RB morph cost suspect), P-079 (pin absolute values and morph attribution; V - C stands), P-067 (absolute values), F3 candidate A step 1 (PROGRESS f3-arm-scope details; no P-id yet). Not changed: P-077 (no morph metric; its phone frames share the morph in both arms), P-074/P-081 (band above the hero end). **P-077 re-ticket carried:** ops second read of the identity holds PASS (V-new CSS e0f92804c521 = V-old d67d599ab034 at the A/A floor in Chrome at 10 viewports and the Sim; computed style equal; counts inside P-077's V results); row says "carried by identity check, re-ticket e0f92804c521". **P-081 registered:** ticket d4f1f63, ops second read PASS (all hashes re-checked, framesF re-run on P-074's files reproduces the ticket's numbers); the lead's standing rule for every phone block until the user says otherwise: T-039 B, gate at each hold's start and end, ceiling 44 °C/Critical, two strikes -> A, reported in T-039.
- 13:5xZ **R4b morph caveat, prepared list (lead: change nothing yet):** fix-nav-morph sees the nav morph's children stuck at --morph 0 in the WebKit Sim on st6-rb2 (R4b `@property --morph` inherits:false + explicit inherit), OBSERVED, Sim only, a baseline control running. If confirmed, WebKit only: directly affected P-079 attribution pin frames + pin Layout (top, re-entry, backing not), P-049 to P-052 (RB introduced R4b; P-052 HIT and P-050 'RB 1-3 ms' suspect), F3 candidate A step 1; shared by both arms (comparison holds, absolute caveat) P-067; likely unaffected P-077, P-078/080/083/084, P-074/P-081 (band y 1..780), P-075/076; unaffected P-071/P-073 (aw1-10e, baseline CSS). **P-081:** hero-exit F inputs in (F hext-V-8e43f3792dbf, scoreF 32ed5f4e81f9 verified at 8c42575); asked for the committed ticket (condition B unless the lead says otherwise, n/order, sentinel, falsifiers with twins, decisions, P(hit), ports, minutes).
- 13:3xZ **P-084 miss, rest-script parked** (lead's v4 rule): Chrome 430 identity clean and census no MORE (far SAVE), but the Simulator identity shot at rest differs V vs C 5131 px / delta 49 against an A/A of 0/0 (4th avatar sharper in V). Ops re-ran analyse.mjs on ident4 and sim4 and tocard on ic5: all byte-identical. Harness defect noted: WebKit logpoints never fired, so the Sim per-frame model check did not run. fix-rest-script sends the cause to the lead. Its phone no-worse check (P-080's bound) will not run.
- 13:2xZ **platform-idle re-ticket rule (lead):** the @supports wrap rebuild is a re-ticket; V-new = V-old in one hold (probe8 pixels at 9 viewports + 320 px, one Chrome + one Sim count load per arm) carries P-077's phone verdict to the new hash ("carried by identity check, re-ticket <hash>"); any difference = new P-id + phone check. Ops to second-read the identity hold when it comes. bba97ac landed. P-084: Chrome 430 identity + census clean (ops re-runs byte-identical); Sim identity running in chainI.
- 13:1xZ **P-084 second read PASS** (rest-script v4, 57888c9 at 13:04:28Z before chainI's first job 13:04:36Z; chainI 574b8dae658f, overlay 520d5f1139c7, all 16 registered probe copies and the start/cost probes re-hashed, all match; the lead's last-iteration line in; start-time claim split CONFIRMED (spec) / WebKit fits / Chromium OBSERVED). Row added. Watch: the identity trials (Chrome 430 first, then Sim) decide; a miss or any MORE parks the topic.
- 13:0xZ **P-077 phone check closed (lead (a)):** "no worse, threshold-sensitive (twins carried by the shared onset frame, V1 only, n = 2)" on fix-platform-idle's scroll-start check 79983a0; second-block ticket dropped; platform-idle's land request comes from fix-platform-idle. 81e7d93 landed.
- 12:5xZ **P-083 miss** (rest-script v3, identity at Chrome 430: 6 of 27 slides resume one frame early, smooth-40 427 px / delta 5 vs A/A 0; ops re-ran analyse.mjs 03b2df89340e on ident3, byte-identical). Lead: one v4 OK'd (option (a), 'current' clock animation, start frame checked in Chrome + Sim first); **P-084 reserved** for it; v4 is the last, any identity miss or MORE parks rest-script (replaces the v3 cap). fix-cd-roll-ca was resumed by my relay message (a SendMessage to a stopped agent resumes it); it only added the panel clock roll to its resume list and stopped again.
- 12:4xZ **Lead decisions:** P-077 phone check (a) accept, conditional on fix-platform-idle's scroll-start check (V code idle at y 0-100 -> "no worse, threshold-sensitive (twins carried by the shared onset frame, V1 only, n = 2)", never a clean pass; V code acts there -> (b) second block); waiting for the lead's word on the check. rest-script cap: v3 is the last automatic re-registration; a v3 MORE stops the topic and goes to the lead, no v4 without the lead's OK (added to the P-083 row; fix-rest-script told to add it to its card). 5e98eaf landed.
- 12:3xZ **platform-idle phone no-worse check (P-077, B):** hold h121509 VALID (both gates Serious, Is Induced = No). Ops formal read: registered rule met (scroll >50 V 2 vs C 1 + 1; bottom fps 59.7 vs 60.2 - 2) but **threshold-sensitive** (>46 V 4 vs C 1 + 1, >54 V 2 vs C 0 + 1 WORSE), carried by V1's scroll-start frame (64 ms at y 0-43). Lead: not in a land batch yet; fix-platform-idle asked whether V acts at scroll start; a possible second block (8 counted runs) is a PENDING ticket (no P-id reserved), phone spot after cd-strip's finger A/B (C-033) and the cd-strip landing.
- 12:3xZ **Batch plan update (lead):** F3 back in the plan as **candidate A, 'tween paint diet'** (pixel-identical class; base st6-rb2 + cd-strip tc): A step 1 = Simulator attribution only (shared slots, no phone, no ticket yet); fix-nav-morph registers the expected effect with ops for a new P-id before step 3 (the phone block). **Panel clock roll (#1)** added to cd-roll-ca's resume list as a less-work item, with an m-gate condition. Phone order now: cd-strip finger A/B (C-033) -> cd-strip landing -> possible platform-idle second block -> hero-exit F (P-081) -> F3 A step 3 (new id).
- 12:2xZ **F3 V dropped** as a perf fix (lead; fix-nav-morph's cover map 9bfb4ab: V's non-passive touchmove gap is a 5-15 px frame at the screen edges, outside G's safe zone x 140-290, so V = C on every reachable stroke); P-082 released unused; F3 leaves the phone batch until a new ticket (fix-nav-morph plans a new candidate, possibly the morph-panel clock on the compositor roll). **P-080 miss / P-083 = rest-script v3:** v2 census 430 MORE at far y2796 (rafFires 0/0 vs 4,4; code calls 17/17 vs 20,20), ops re-ran tocard 05daca3beb58 on ic3, card byte-identical; v3 registration e5428d1 (12:17:31Z) precedes chainE's first job (12:17:40Z); chainE e6821c987249, overlay 6c09e47961ba and all 20 probe copies re-hashed, all match. Open note to the owner: the empty animation's same-frame start time is a platform claim, UNRESOLVED (identity trials decide). Third registration of this topic: no cap on 'MORE -> fix and re-register' in the card; flagged to the lead. Platform-idle hold h121509 started 12:15Z, start gate Fair, re-warming.
- 12:0xZ **P-079 RESULT, ops second read PASS** (score079 302b608e09e7 re-hashed from 99d4914; re-scored from the raw files in iphone-runner's out/p079, JSON byte-identical to fix-cd-strip's): frames top + pin, re-entry, backing hit, top Layout in band; pin Layout 'not enough by the scorer's n rule; the falsifier is unreachable' (V 116, 123 vs any C median >= 110: at most +13). a3:C failed the M sentinel (~30 Hz held frames, OBSERVED, cause unknown), voiding a2 + a3; no cool-down/restart after it (noted in the row). Lead chose (a), no top-up. Row logged, PROGRESS cd-strip -> finger test. Phone order now: platform-idle -> the user's cd-strip finger A/B -> hero-exit F (P-081) -> F3 (P-082).
- 11:5xZ **F3 decision (lead):** cost card 41a2829: D does more work than C (2 window listener ops at the arm, a doubled handler entry, one extra 29-Paint frame in Chrome); V is count-neutral and cuts non-passive coverage to 93.2 %. D parked (no D'), V goes forward: fix-nav-morph drafts an F3 V-vs-C ticket + prediction with ops (driver G, cold loads counted, B gate pair, 900 s holds, pre-registered touch-latency / pin-frame prediction); **P-082 reserved**, P-081 reserved for hero-exit F; phone batch order: P-079, platform-idle, hero-exit F (P-081), F3 (P-082). Checklist sent to fix-nav-morph. **P-079 interim (ops pre-score, score079 302b608e09e7 re-hashed from 99d4914):** h112000 gates Serious/No both ends (38.8 -> 39.3 °C), 8 counted W runs all valid, top frames **hit** (median V - C: >50 +0.5, twins 0/+0.5, >34 0); attribution a1-a6 pending. iphone lease went STALE 11:46:44Z between holds (told the lead).
- 11:2xZ **P-079 scheduling (lead, ticket note):** 900 s holds, back to back at #1 after fix-nav-morph's single rep, until the block is done. A strike = a hold with no passing start gate; a pass after re-warming inside the hold is not a strike. Readers (ts-thread-images, rest-script, hero-exit Sim) wait until P-079 is done, then the platform-idle hold. Gate record so far: h104636 (10:46-10:53Z) start Fair x3, no steps (unscored); h110448 start Fair then Serious PASS (37.9 °C, 30 ms grid), end Serious PASS (38.2 °C), warm-up wC only. platform-idle ticket sent to iphone-runner 11:1xZ (immutable V copy of de29ff8aa622 / d67d599ab034, C st6-rb2, n = 2 C V V C, B gate pair; ops clarification before data: >50 count from the scroll phase, fps from the bottom phase, ±4 ms twins; fix-platform-idle confirmed).
- 11:0xZ **Phone batch plan** (lead; T-045 disconnect cancelled at 10:55Z, the phone stays; P-079 hold 1 h104636 10:46-10:53Z failed its start gate, Fair x3, 35.2-37.1 °C, 8 ms grid, no steps, unscored; resumes with a warm-up hold, B kept). Every block needs a pre-registered prediction and the heat-gate pair (start and end read). Order and readiness:
  1. P-079 cd-strip strip-tc: READY (ops GO fdb3145, ports line 99d4914; row + notes on main).
  2. hero-exit F block: MISSING the F build, its card, a new P-id (next free P-081) and the nested-TimerFire scorer hashed before data.
  3. platform-idle no-worse (P-077): READY (b369d15, B gate, n = 2 C V V C fixed by the lead; PR-009 accepted).
  4. rest-script no-worse (P-080): bound registered (df6e338); MISSING the B-gate line (asked 10:2xZ) and the v2 census/Sim verdicts (rule (1) needs them first).
  5. F3 (fix-nav-morph): MISSING the cost-card result and a phone ticket + prediction.
  6. the user's finger tests, fixes 1-3 swipe A/B (console protocol): after the blocks of the fixes they cover.
- 10:4xZ PR-009 accepted, option "both" (10:31Z); platform-idle phone check n = 2 per arm C V V C after P-079 (lead, before data). T-042: user asked for a pixel-tolerance rule; de-pixel-rule drafts a proposal; until decided, identical or the user's OK per fix (PROGRESS line). P-079: gate-filter line closed at 8760bf4 (scorer and probe hashes unchanged); **GO held** by the lead until fix-cd-strip's attr079 Simulator retest reports (moved to #1); if attr079's hash changes, re-read before the GO.
- 10:4xZ **P-077 ops second read PASS** (platform-idle 718e303; registration f5390bc 09:20:16Z before the first load 09:22:36Z; scorer e86a19940a07 read line by line against the card; re-scored from the raw records, JSON byte-identical): PASS + PASS. Row added. PR-009 with the user; phone no-worse check to be re-specified to B (heat gate per hold, back to back; its n = 1 per arm bound is weak, noted) before any run, after P-079. **P-079 rev 2** (a3cfd86): hashes match (score079 302b608e09e7, attr079 dcaacf4a8170), pin pairing and B gate in; one line owed: gate-failed holds' files must be left out of the scorer call (score079 has no gate input). Counted W runs are Timeline-off; Timeline counts moved to the attribution cycles (pre-data design change).
- 10:2xZ User T-039 #21: B is an experiment; on a blocker (Serious not held, holds keep failing the gate) the lead reports in T-039 and switches to A (start only at Fair/Nominal, same xctrace gate; user pre-approved). Fallback written into PROGRESS and P-079's row note; fix-cd-strip adds it to the ticket. Memory on main 6f808a5.
- 10:1xZ **User T-039 B** (lead): real thermal Serious is the phone test condition. Gate: xctrace Thermal State (~40 s) at start and end of every phone hold, both Serious with Is Induced = No, else re-run; each hold logs timer-grid median and battery °C; stop at 44 °C or Critical; each top-3 fix gets one short no-worse check at Fair before the goal is called done; 4 ms-grid blocks (P-071 and earlier) don't pool with B blocks; P-074 is B data. Milestone 1 = smooth at real Serious; milestone 2 keeps the 42-44 °C hot start and Xcode-induced Serious. Lead updates memory/. Ops second reads now check the B gate on every phone card. Written into P-079's row (pre-data note) and PROGRESS; fix-cd-strip adds it to the ticket.
- 10:1xZ **P-074 RESULT, ops second read PASS** (15b3d6d; re-scored from iphone-runner's raw files with 1d1fc26908f1, JSON byte-identical): (a) C 0.814/0.794 in, V 0/0 in; (b) touchstart OUT (mostly +2 RecalcStyle) -> back to F; rest no data (nested TimerFire). Condition, lead: **real thermal Serious** (xctrace 10:02Z; first read as a leftover Xcode condition, corrected), milestone-2 (a) data. P-074b proposed then cancelled before registration; next hero-exit block = new id on the F build with a nested-TimerFire scorer hashed before data. Flags: block ran in 2 holds (12 min gap, 4 pre-warm cycles). **P-080** = rest-script v2 (supersedes P-078 before v2 data after v1's registered MORE). **P-079 GO** waits on the 2 ticket fixes AND the user's T-039 start rule (A: gate on xctrace Fair/Nominal; B: Serious counts as warm); add the chosen gate to the ticket before any run. Phone order: user Xcode step, iphone-runner N2/S/N3 grid check, then P-079. PROGRESS: thermal trial superseded, hero-exit back to F. Next free P-081.
- 09:5xZ **P-078 ops PASS** at df6e338 (fixes committed before any post-registration output was opened): exact position classes from C rep 1 layout, pooled SAVE/MORE/SAME with floor max(2, |C1-C2|), one decision per outcome, phone no-worse bound (S, C V V C, >50 V-C <= +1, >34 <= +2, twins), confidence per prediction; scorer tocard v2 05daca3beb58 committed (v1 replaced before scored data); row registered. **P-079 ticket** 8dcf6e0 NEEDS-FIX (scorer name+hash, pin-hold V-C pairing; confidence nit), with fix-cd-strip. Lead 09:5xZ: de-breakpoints may finish its queued holds then README + T-034 summary (flag only a new kind of job); I-083 resolves on the lead's npm test; I-084/I-085 close with ts-recipient's commits. Main 18fc807 (lead rebased my 2 commits onto 42e3170).
- 09:4xZ **P-079** registered for cd-strip strip-tc (supersedes P-072 before data; user accepted PR-008 rev 2 option land-strip-tc 09:31:49Z; hashes checked on the snapshot files; ticket owed: n/order, per-run aggregation, 3 pin holds, question/ports/minutes/confidence); next free P-080. **P-078 second read NEEDS-FIX** (fix-rest-script 22dd92e: position classes for prediction 1, rep aggregation, decisions per outcome, phone no-worse bound; 1-2 before reading census data, which already runs); probe hashes match. PROGRESS upcoming (lead, T-039 #10/#12/#13): Serious timer check after P-074; milestone 2 after fixes 1-3 are smooth warm: (a) Serious on, (b) hot start 42-44 °C.
- 09:3xZ (lead, main 43193f5): **ops cadence cut** (usage on pace for ~95 % of the window, ops #2 consumer): at most one land request per 30 min unless an agent is blocked, no PROGRESS-only commits, digests only when the lead asks. **de-breakpoints told to wrap up and park.** **P-074 row note:** d3a2061's rest-row rule (judge by the next unit alone) withdrawn by the lead before scoring, relabelled 73aa870 (checked: verdict text unchanged from fad5d51, only a post-hoc heRest split beside an OUT rest row; scorer still 1d1fc26908f1); noted on the row. P-074 block running (iphone-runner).
- 09:3xZ (lead, main f1948c2): **P-074 phone GO** ~09:25Z to fix-hero-exit-threaded (iphone-runner drives; one start method per block, stop rather than mix; heRest share only as a post-hoc diagnostic; review-hero-exit ACCEPT with notes). **P-077 D signed** (f5390bc); platform-idle's user proposal after P-077 is scored; its phone no-worse check after the user's A/C choice, queued after hero-exit. Memory f1948c2: console steps only for user actions, answers/FYIs in threads; T-039 open (heat trial + CLI research; iphone-runner, de-thermal-cli). **PR-008 rev 2** OK'd to post (fix-cd-strip): track the user's decision, then P-072 second read on the chosen build and cd-roll-ca's restart. PROGRESS: hero-exit and cd-strip next lines, change line 09:25Z.
- 09:2xZ **P-074 ops PASS** (start-band line at fad5d51: 38-40 °C, one start method, met-temperature logged per run, LPM dropped; scorer still 1d1fc26908f1). Same commit: r2j y800-900 check, the band absent on a re-run in V-vs-C, V-vs-C2 and C-vs-C (not reproduced in C-vs-C, only absent): the lead decides whether that meets GO part (3). **P-078** assigned to fix-rest-script (less-work gate); next free P-079. P-077's index time corrected 10:0xZ -> 09:0xZ (a0b532c at 09:05Z).
- 09:1xZ **Thermal trial done** (iphone-runner, lease 08:58-09:13Z, S driver, plain baseline, warm start >= 38 °C; OBSERVED): N1/SER1/SER2/N2 all rAF 59 Hz; scroll 52.3-53.5 fps, >50 5-7, >34 13-19 (Serious inside the normal spread), bottom 60 fps. No CLI can read the thermal state, so 'no effect' and 'never applied' can't be told apart; not a hot-phone stand-in. Files in iphone-runner's out/thermal-trial/. Removed from PROGRESS upcoming, change line added. Lead's P-074 GO now has 4 parts: start-band line (ops), review-hero-exit ACCEPT, y800-900 Sim C-vs-C band check (fix-hero-exit-threaded), phone free (met 09:13Z). Host load1 89.9 at 09:15Z flagged to the lead.
- 09:0xZ **P-074 re-read at b93db07** (fix-hero-exit-threaded, review round 3): hashes checked on the snapshot files (V JS d48d224adcd4 / CSS 55ba45f138c9, C 7bf7c4657d21 / f523598b2a24, scorer 1d1fc26908f1, gesture e3f31872b82f), --fn lines checked on both snapshots, all round-2 must-fixes resolved. One wording fix owed: the ticket must name the start band 38-40 °C and one start method (T-029 #30); ops checks only that line. Row P-074 registered in PREDICTIONS.md (pre-data). Phone GO = that line + review-hero-exit ACCEPT. fix-rest-script will name the less-work rule as its D gate and ask for a P-id (next free P-078).
- **10:1xZ P-077 assigned** to fix-platform-idle (G1 glint + G3 sweep on st6-rb2). Its D card is gated by the
  less-work rule.
  - Chrome frozen frames are not pixel-identical: sweep gradient phase ≤ 23 LSB; glint ≤ 64 LSB on AA edge rows in
    visible phases. So it goes to the user as a proposal (illusion rule).
  - Reduced motion is identical at all 9 viewports.
  - Next: Chrome comp-census (3 arms), then Sim pixels, Timeline and LayerTree. Next free **P-078**.
- **10:0xZ user accepted all 5 recommendations (T-029 #30, 08:52Z).** Memory notes are on main 03fb95e:
  `memory/less-work-landing-rule.md` and `memory/phone-checks-start-warm.md`.
  - (1) "Less work" fixes land on cost-card counts (per event, frame-driven counts from the full page) plus one short
    phone no-worse check. The top-3 smoothness fixes (hero-exit, cd-strip, F3) keep the phone and the finger test.
  - (2) Warm starts 38-40 °C, one start method per block.
  - (3) One 10-min Xcode thermal-state trial; iphone-runner plans it. It is in PROGRESS upcoming.
  - (4) LPM left out: record it, drop and re-run any LPM run.
  - (5) No countdown-only test page.
  - **Ops second reads from now on:** a less-work card names rule (1) as its gate. Every phone card names its start
    band, and a block keeps one start method for every run. Signed D gates stay unless the lead re-signs them.
  - Posted **F-170** (measurement, all) pointing at both notes. Told fix-platform-idle and fix-rest-script (the first
    fixes under rule 1) that their D card names the rule. PROGRESS has a change line and the thermal trial in
    upcoming.
- **09:4xZ main b85af11** (my batch, rebased by the lead onto arch-isolated-measure's branch at 30d4c7f).
  - **I-083 opened, and ts-costcard spawned** (toolsmith, named, worktree). It builds `tools/costcard.mjs` from README
    §6; the first consumer is fix-nav-morph's F3 records. Added to the peer directory.
  - The user has the plain-words pilot, cost card and Mac Safari answers (T-029 #27). Both open lead promises are
    delivered; the cost card itself now tracks under I-083.
- **09:3xZ open lead promises (handover item 5): both now have a deliverable on arch-isolated-measure's branch.**
  - (a) The rendering cost card design is README §6 (f6614fa; §6.2 updated at 30a710b). Building it is a toolsmith
    job in `tools/` (§6.4: event-aligned window from judge-tick, Paint-clip area, Chrome layer memory, Animation
    failure reasons, md writer, with tests). Spawning it is the lead's call. PROGRESS upcoming is updated.
  - (b) Mac Safari/WebKit as a heat-free source: README §7 desk research (no install, nothing run). Short answer: no
    for the cost card. Mac layers and tiles take other code paths (CONFIRMED in WebKit source), and there is no
    non-UI Timeline/LayerTree path without installing something. The Simulator stays the WebKit source. The lead
    relays it to the user.
- **09:3xZ P-076 result: family PASS, 0 of 3** (arch-isolated-measure 30a710b, README §4.5; ops second read PASS).
  - judge-tick b84f4156010c re-run on p076-data: judge-tick.json is byte-identical (7c041f2d0009).
  - Raw records: 18 loads per mode, no partial slot, no VOID; fires in fires1 everywhere (trace lineNumber 1-based,
    OBSERVED); T matches each arm; FRZ clock = 2 everywhere. AA 0.3.
  - Pairs: Vf-C -0.3 vs 0.0; C6-S -0.2 vs 0.0; V7-C6 -24.5 vs -25.0 (tol 3.8). Every pre-data confidence (0.6-0.75)
    came out PASS.
  - Ops cautions sent (wording only): (a) only V7-C6 is decisive; the other two pass at the tol floor on null effects.
    (b) The median drops roll seconds (60-95 calls), so the card field is "steady-second countdown calls", not total
    countdown script.
  - Cost card §6.2 now takes per-event countdown script from FRZ. P-075's per-window FAIL stands.
- **09:2xZ lead decisions.**
  - F3: the lead agreed fix-nav-morph's plan: the rendering cost card first, with a cold-first-pin row; no phone
    block, landing or parking until it reports. PROGRESS f3-arm-scope next, detail and upcoming are updated.
  - Posted **F-169** (pitfall, phone): `wait.mjs phone-temp --below X` is met at exactly X; for strictly below X,
    pass X-0.1. It matches protocol §5.3's "at or below", so no tool change.
- **09:2xZ P-073 committed da0ef39** (fix-nav-morph; `fixes/mw10e-arm-scope-d/p073/`). score.txt and score.json are
  byte-identical to the ops re-score, and the ledger row has its outcome.
  - **Flag sent to the lead:** D's cold-port warm-ups collapsed in both blocks that had one (P-071 wD sustained,
    P-073 wD transient), and C and V did not. OBSERVED, n = 2, uncounted.
  - Ops recommendation: the next F3 block carries a pre-registered cold-load arm on fresh ports, not a warm-up.
- **09:1xZ main 7e5cb00 landed** (P-073 result, P-076 registration, P-075 data). The lead forwards ops notes (a) and
  (b) to fix-nav-morph (low-bin runs clustered in time; start method confounded with arm).
- **09:1xZ P-074 second read: NEEDS-FIX, small, pre-data** (fix-hero-exit-threaded e36423f).
  - Verified: score074.mjs aaf93e3c485e, gesture hero-pass-v1 e3f31872b82f, snapshot JS V 301ec740291b and
    C 7bf7c4657d21. The --fn lines are 1-based and right: V s 4493, heRest 4446; C s 4391.
  - Must-fix: (1) the ticket lacks the decision for each outcome, the one question, confidence, minutes, ports and
    C's CSS hash; (2) void runs enter the (b) pairing, and an arm with < 2 valid runs still gets in/out; (3) (b) says
    OUT when no hand-over unit is found.
  - Nits: the writer match ignores the script name; the rest pairing uses +400 ms (not in the card) and pairs by index
    instead of by time; a `Cs[0]` fallback; the (a) verdict combines arms.
  - The phone GO needs ops PASS plus review-hero-exit's ACCEPT (the lead).
- **09:0xZ P-075 data commit f6614fa** (arch-isolated-measure; README §4.4, `p075-data/`, P-076 PREDICTIONS row).
  - Ops re-ran judge.mjs 73679603afcd on p075-data: judge.json is byte-identical (36a24aa02ea3).
  - Chrome: countdownCalls family FAIL, 3 of 3; style, layout and paint PASS. Style is labelled low-power (tol 185),
    and V7-C6's H9 label is printed with the owner's post-hoc reading marked as such.
  - Sim (4th slot; the first slot was voided by a harness bug): family PASS on all six counts. V7-C6 misses
    RenderingFrame, RecalculateStyles and Composite (H9), 1 of 2 judged each, so no Sim family FAIL. Per the
    single-miss rule those cost-card rows take FULL. The owner's post-hoc reading: frame-driven counts from FULL.
  - AA flags: none.
  - P-076: slots running. In our setup the trace FunctionCall lineNumber is 1-based (fires1 holds the fires, fires0
    is empty), OBSERVED.
- **09:0xZ P-073 result: row 5, INCONCLUSIVE (V not in condition). Ops second read PASS.** iphone-runner ran
  07:40-08:35Z, files in its worktree's `out/p073/` (local only).
  - Ops re-ran iphone-runner's scorer copy (sha256 30c16ec042c8, verified) on its manifest: txt and json are
    byte-identical to score-final.txt and score-p073.json.
  - Row walk: D 3 counted, 0 collapses (rows 1-2 pass); C 3 counted, clean (rows 3-4 pass); V clean 0/3 with 1 low-bin
    run, so the top-up ran (runs 10-12, after the Latin square, 3 of max 3), all 3 high, so V low-bin stays 1 → row 5.
  - Order C V D / V D C / D C V as carded. Start temps 40.29-40.89 °C, max 41.59, read ages ≤ 5.1 s, charge held+ext
    in all 12, idle 59.0-60.0 fps, prevented 100 % everywhere. Flags: none from the scorer.
  - Ops notes for the next design (not decision-changing): (a) all three low-bin runs were runs 7-9 (08:14-08:22Z),
    one per arm, and every other run settled at 5220, so the bin looks time-clustered rather than random per run
    (compare F-164); (b) the start method is confounded with arm (C all direct, D all cooled, V mixed); (c) D run 3
    has the only mid-run dips (58.5 53.5 57 46 ... 50.5), well above 30; (d) every run but the first warm-up ran beside
    shared groups (load1 up to 92.9), per the lead's rule.
  - Prediction check: the card gave "V not in condition" ~45 % and V clean ~35 %; the modal V outcome (collapse ~50 %)
    did not happen. fix-nav-morph fills the measured columns in its row.
  - PROGRESS f3-arm-scope: next, P-073 check, detail, change line and upcoming updated in plain words. Next step: the
    lead, on fix-nav-morph's options.
- **09:0xZ P-076 registered at 1032787** (pre-data). The capped-slot rule is in: a partial file is scored as it is
  and the readout says "partial slot". The 1-based fire-line note is in. The comment-only revisions are hash-verified:
  tick-probe 967461d775ec, tick-hold a344a6351f45; judge-tick b84f4156010c is unchanged. The Chrome slots may queue.
  When the readout comes, ops second-reads it against judge-tick b84f4156010c.
- **08:5xZ P-076 re-read PASS at 930ee63** (arch-isolated-measure). Hashes verified: judge-tick **b84f4156010c**,
  tick-probe d30b38cc15be, tick-hold 3e8c1e4dce2c, run-tick 1c2ebd25142f. The probe was read line by line. The
  must-fix and nits 2-6 are done, and the vs-C pairs are dropped.
  - Owed before the first slot: a one-line rule for a slot that hits its 300 s cap (18 loads at ≥ ~13 s each; the
    probe writes `partial: true`). Ops suggested taking the partial file as it is, with "partial slot" printed.
  - Nits: stale comments (a "4 s trace", 4 screenshots, the old file names). With a 1-based trace, fires0 lands on
    `ne(() => {`, and a re-run there VOIDs as ambiguous, which is safe.
- **08:4xZ P-075 Chrome readout** (arch-isolated-measure; judge.mjs 73679603afcd). The commit holding the scrubbed
  data and judge.json is owed after the Sim slot; the first Sim slot was voided by a harness bug and a 4th slot
  replaces it.
  - **countdownCalls: family FAIL, 3 of 3.** Vf-C 34.7 vs tol 22 and C6-S 32 vs 22 are both noise-sensitive. The
    scorer labels V7-C6 (45.3 vs 22) H9-real-interaction; the owner reads it as window noise (C6 FRZ 150/115/215),
    which ops marked as a post-hoc reading.
  - **style, layout, paint: family PASS, 0 of 3 each.** Paint Vf-C sits exactly on tol (11.3). The style AA is 92.3,
    so tol is about 185: ops asked to label that PASS low-power.
  - AA came from both modes (calls 11, style 92.3, layout 2, paint 5.7). No FRZ voids.
- **08:4xZ P-076 second read: PASS with one must-fix** (prereg and scorer 49ea17d; judge-tick.mjs **3605ca71b0a3**,
  hash verified, read line by line).
  - Must-fix: commit the probe that writes fires0/fires1, cd, timers and countdownScreenChanges, and put its hash in
    the prereg and the row.
  - Nits: a missing FRZ screen-change field should void; the header still says `fires`; with AA UNKNOWN, tol treats
    AA as 0; the T = 2 seconds overlap, and a second interval that isn't running voids S/C6/V7 (INCONCLUSIVE); the
    secondary pairs mix T = 1 and T = 2 arms.
  - The row text is received and matches the prereg. It goes into the ledger once the probe hash is added.
- **08:3xZ P-076 assigned** to arch-isolated-measure: the lead asked for a per-tick countdown check. It uses the same
  arms as P-075 (C, C2, Vf, S, C6, V7), the same tolerance and family rule, and countdown calls per full 1 s tick
  interval (median per load), cut at the countdown's own interval fires. It runs on new loads in two shared-lane
  probe slots, with no phone. P-075's Chrome family FAIL on countdown call counts stands and is not re-scored. Asked
  for: the row text before data (prereg sha, arm hashes, scorer hash, tick-cut rule, void rules, decision per
  outcome, confidence) and P-075's readout sha. Next free **P-077**.
- **08:2xZ landed 65ae96d** (takeover). fix-nav-morph commits P-073's manifest and score (txt + json, scorer
  30c16ec042c8) to `fixes/mw10e-arm-scope-d/p073/` on its branch and sends the sha. Ops second-reads it, and the
  verdict line goes to the lead.
- **08:2xZ takeover.** Rebased on main e11807f (mgmt-ops-9's handover). Acked the handover to mgmt-ops-9; `ops` board
  row now owned by mgmt-ops-10. No incidents open. Findings board: nothing new since F-166. P-073 at 8 of 9 counted
  (iphone-runner, all clean so far, cooling before V3). Next free P-id: **P-076**.

## Handover mgmt-ops-9 -> mgmt-ops-10 (10-03 08:2xZ; read this first, then the log below)

Main is at 313aafb, and every ops commit has landed. Next free P-id: **P-076**. No incidents are open.

Owed by ops, in order:
1. **P-073 result** (F3 B1 hot-held; fix-nav-morph owns the row; iphone-runner runs the block, counted run 6 of 9
   at 08:09Z, eta ~09:09Z).
   - Scorer `fixes/morph-webkit/p073-score.mjs` **30c16ec042c8** (4ece74c, verified).
   - When the verdict comes: second-read the scored output against the card. Check the rows in order: D, then C, then
     V; top-up only on the low bin; settle- and rule-sensitive flags; void-collapse and high-bin flags.
   - Log it in PROGRESS f3-arm-scope (`next`, the P-036/P-073 checks, a change line). This gate decides F3's landing:
     row 6 means the P-036 confirmation on D, then the user's F swipe.
2. **P-074** (hero-exit-threaded's phone Timeline attribution block).
   - The ticket is on hold until its post-review build hashes come; review-hero-exit was NEEDS-FIX. The gesture is
     hero-pass-v1 c414f67158e33da3, the control st6-rb2.
   - Ops asked for: the scorer and hash, the n = 2 read rule, how hand-over frames are located, what "matching
     frames" means in C, and the void rules. Second-read before it takes the phone.
3. **P-075** (arch-isolated-measure countdown pilot) PASSED at 5eade1e (judge 73679603afcd). Log its readout when it
   comes. Its family FAIL/PASS lines decide whether frozen-rest deltas can stand in for full-page counts per count
   (README §4.2 rule 2).
4. **cd-strip / PR-008**: the user accepted land-strip at 06:52Z, and the lead holds it (proposal hold cd966b7).
   - strip-tc S2 + G11 clean; G12, S3, G13 and G14 next; then PR-008 rev 2 goes to the lead, and the user decides
     again.
   - P-072 is written against the build the user chooses, before any phone data. Ops second-reads it.
   - cd-roll-ca waits for that decision and then restarts its counted set.
5. **Open lead promises to the user** (track until delivered; both in PROGRESS upcoming or the handover):
   - (a) the per-fix rendering cost card (T-029 #23/#24; arch-isolated-measure, README §6, after the pilot);
   - (b) macOS Safari/WebKit as a heat-free source (T-029 #25/#26; a plan goes to the lead first; installing STP or
     Playwright browsers is the user's decision).
6. **Heat goal agents:** fix-platform-idle (glint-ca + sweep-exact) and map-rest-script (read-only). Assign a P-id when
   they ask.
7. **Peer directory** ("## Peer directory", near the end of this file): refreshed at 08:2xZ. It has new rows for
   mgmt-ops-10, fix-platform-idle, map-rest-script, arch-isolated-measure, ts-i082 and ts-proposal-hold (done). Send
   it to every agent that joins.
8. **Batches:** send a land request at each user-visible PROGRESS change, otherwise about every 30 min. The lead lands
   at once.

Method notes (from this shift):
- PROGRESS limits: `next` and change text ≤ 300 chars; details ≤ 600; upcoming title ≤ 160; at most 30 changes, drop
  the oldest. Run `console.mjs progress --check` and `npm run test:unit` before every land request. Edit through
  python scripts in `<scratchpad>/mgmt-ops-N/` (the guard refuses compound shell and git commands).
- Peer branches: read them with `git show <sha>:<path>` (objects are shared). Wait for a peer's commit with
  `node tools/wait.mjs git --ref <their branch> --timeout 580` (no option = waits for the branch to move).
- A second read checks the card against the scorer code line by line. Both P-073 and P-075 had a scorer branch that
  did not match a card row (n = 2 verdict vs "fewer than 3 → void"; family verdict not computed). Verify the hash with
  `git show <sha>:<file> | shasum -a 256`.
- The lead never wants a pre-registered prediction restated: mark it superseded before data and register a new id.

## mgmt-ops-9 log (from 10-03 00:0xZ, newest first; START HERE)

- **08:1xZ-b main 5589164 (my batch) landed.**
  - **P-075 re-read PASS** (arch-isolated-measure 5eade1e, judge.mjs **73679603afcd**, verified). The family verdict
    needs min(2, judged builds) misses: Chrome 2 of 3, Sim 2 of 2. AA is flagged one-mode or UNKNOWN. noise-sensitive
    is set on misses only. The H9 reading is in, and void or hash-mismatch records are dropped.
    - Disclosure, logged: per-load counts had scrolled by in the Chrome slot log before the rev. The scorer had not been
      run, and every change was requested by ops before any data and maps to the prereg text.
    - Nit, not blocking: repeat the AA flag on the family line.
  - **Second open lead promise to the user (T-029 #25/#26):** check macOS Safari/WebKit as a heat-free source for the
    cost card: fidelity vs the Sim, automation, 430 px / DPR 3. arch-isolated-measure does it after the pilot and
    cost-card §6, and the plan goes to the lead first. Installing STP or Playwright browsers is a user decision.
  - **F-166 posted** (pitfall, lanes): a non-timing job queued as a plain normal `run` sits at the host CPU gate and
    blocks shared readers. This hit hero-exit at 08:03Z with 4 readers behind it. Use `--no-timing` (> 300 s or Mac
    alone) or `--shared --weight simulator|probe` (≤ 300 s).
  - P-073: counted run 6 of 9 at 08:09Z (iphone-runner, eta ~09:09Z).

- **08:1xZ main 86c6798 (my P-075 batch) landed.**
  - **Open lead promise to the user (T-029 #23 / #24):** the user wants fixes judged by rendering complexity, element
    by element, using the phone less. The lead promised a per-fix **"rendering cost card"** built from Chrome and the
    Sim only: thread, layers and memory, repaint area × rate, layout, script. arch-isolated-measure designs it after
    the pilot, as §6 of the isolated-measurement README. It is in PROGRESS upcoming. Track it until delivered.
  - **P-075 second read: NEEDS-FIX, small, before any data is read.** Row and scorer at 6ac0a15; judge.mjs
    8c7691299477, verified.
    - Must-fix: (1) compute the family verdict; (2) the Sim AA silently becomes 0 when a C load is void, and the
      Chrome AA becomes NaN when every C' FRZ load is void; (3) flag noise-sensitive on misses only, as the prereg says.
    - Nits: compute the H9 Layout/Paint reading; say what a JS hash mismatch does; any confidence numbers are marked
      as added after the slot started.
    - The timing deviation is disclosed and fine: the row and scorer were added after the Chrome FULL slot started,
      with no data read.
  - **cd-strip** (lead): S2 + G11 clean for strip-tc. No cdwrap shifts; backed layers 16 / 0.39 MB vs faces 48 /
    1.18 MB; hero 0 px. G12, S3, G13 and G14 come next, then rev 2's text goes to the lead. PR-008 stays on hold.

- **08:0xZ main 1ed2419 on cd966b7 on ec7eb08 (my 07:3xZ log).**
  - **cd966b7** (user T-030 #19): console proposal hold/unhold, stale decisions on revise, decisionState. After npm
    test on main the lead restarts the console and puts PR-008 on hold, so the user's acceptance shows as "under
    review".
  - **1ed2419** (arch-isolated-measure): the isolated measurement and heat plan for T-029. It covers heat-immune vs
    heat-disturbed numbers, a frozen-rest harness, phone options and a countdown pilot.
  - **P-075 = T-029 countdown isolation pilot** (arch-isolated-measure; prereg b89ec7f on worktree-agent-a41fb01cae3b26082,
    `research/architecture/isolated-measurement/pilot-prereg.md`, confirmed by the lead).
    - No phone: 3 shared-lane slots of ≤ 300 s each (2 Chrome probes, 1 Sim functional).
    - Arms: C, C', countdown-faces V, cd-roll-ca, cd-strip.
    - Question: do the full-page countdown count deltas match the frozen-rest deltas?
    - Ops asked for a ledger row (prereg sha, arm hashes, scorer hash, decision rule) before data, then a second read.
    - Next free **P-076**.

- **07:3xZ main 566f3db (my 07:2xZ batch) landed; I-082 RESOLVED (7e28dce, npm test 1373/1373; Sim counts compare
  only within one session, never across the rebase).**
  - **P-073 scorer guard VERIFIED** (fix-nav-morph 4ece74c): `p073-score.mjs` sha256 **30c16ec042c8**, in the card and
    the ledger row, `node --check` ok.
    - Without a top-up, rows 5-7 need V.counted ≥ 3 (V at n = 2 → row 8).
    - Ops nits done: start-read age (flag > 60 s), a `thermal` void field, a charge tie goes to the lead, and a flag
      when a run has no battery read.
    - The lead was told; iphone-runner starts the counted runs (lease "P-073", eta ~09:04Z). The ticket went to
      iphone-runner with scorer 30c16ec042c8: ports C 5731, V 5732, D 5733, S 5734, warming page 5735 (lead GO).
  - **fix-nav-morph cfc51c1:** arm-B Sim census for the panel-clock pair (F-165), counts only: 0 of 84 panel faces
    composited, and v1c exposure equals D's. The A/D census and the pixel compare come after the P-073 block.

- **07:2xZ main 7e28dce (I-082 fix: Sim sessions ran in the Simulator's own background CPU storm; npm test running,
  resolve pending) on 25fcad2 (my 06:5xZ batch).**
  - **Phone:** the user disconnected it at 07:01Z (T-033) and reconnected it at 07:09Z (T-033 #4/#5). The lead released
    the lease.
  - **P-073 SIGNED (lead 07:2xZ) on rev 2.1 2746920** (fix-nav-morph).
    - Path: rev 2 38cd056, then ops NEEDS-FIX, then rev 2.1. It adds the reading rule for n = 2 / n ≤ 1, rows 1-8 (D,
      then C, then V), bins low ≤ 5216 / high ≥ 5217, prevented pooled over the 9 pin pushes, charge state in P-068
      form, and the lead's V top-up (≤ 3 extra V runs, low-bin reading only).
    - Scorer `fixes/morph-webkit/p073-score.mjs` d4854dd7061f (hash verified by ops). Ops re-read: card PASS. The
      scorer gives a verdict at n = 2 in the all-runs reading, so V with 2 counted runs and no top-up could reach row
      6/7 where the card says row 8.
    - **Condition of the signature:** a `V.counted >= 3` guard on rows 6-7 outside the top-up, re-hashed into the card
      and the ledger before the first counted run. Ops checks that diff.
    - Nits sent: the start read's age; a manifest field for an iOS thermal notice; a charge-state tie goes to the lead.
    - iphone-runner has the GO; fix-nav-morph sends the ticket. The ledger branch only adds the P-071 and P-073 rows
      since a02c915, so it rebases cleanly.
  - **P-074 = hero-exit-threaded's phone Timeline attribution block** (attribution, not gain; lead GO 07:09Z).
    review-hero-exit came back NEEDS-FIX with code changes: a pending-frame flash in d(), filter none vs blur(0px) at
    rest, two listener nits. So the ticket is on hold until the new build hashes and their Sim checks.
    - Same gesture hero-pass-v1 c414f67158e33da3; same control st6-rb2.
    - Ops asked for: the scorer and its hash, the n = 2 read rule, how hand-over frames are located, what "matching
      frames" means in C, and the void rules.
    - Next free **P-075**.
  - **cd-strip back to the user.** The user accepted PR-008 land-strip at 06:52:53Z; the lead holds that acceptance
    and nothing lands on it.
    - G7: a Chrome delta-1 class at 0.9 fade (13-83 px; PR-008 said "Chrome shows nothing"), and 4-5 layout-shift
      deliveries per 5 s vs 2 for the faces, sources unrecorded.
    - G8: 2 vs 2 entries and the same CLS 0.0011 in both arms, all from h1.
    - PR-008 rev 2 comes after G9, possibly with a CLS-free third option, and the user decides again. P-072 waits.
      cd-roll-ca pauses queuing.
  - **T-030 #19** (the user wants better proposal handling): ts-proposal-hold is building proposal hold/unhold and a
    "stale: re-decide" state on revise.
  - **Heat goal (T-029, P-068: Fastwork warms the phone ~5x apple.com):** new agents fix-platform-idle (glint-ca +
    sweep-exact, unparked) and map-rest-script (read-only map of the middle-section script work at rest). Both are in
    the peer directory, with ts-proposal-hold and ts-i082.
  - **fix-nav-morph 628d1a3:** the 80-layer panel clock exists only on the baseline/F3 line, not on st6-rb2 or wave 2.
    A one-rule attribution pair is proposed for after P-073 (F-165; not registered).
  - **hero-exit-threaded:** final card 66d2abe, review NEEDS-FIX (above).
  - PROGRESS:
    - Change lines 07:01Z (phone away and back) and 07:20Z (strip choice on hold).
    - F3 `next`: the warm-phone test is approved and starts next. The detail records rev 2.1 and the signature.
    - hero-exit `next`: review fixes, then a Sim check, then P-074.
    - cd-strip `next`, P-072 check, detail, and an upcoming "your new decision" item.
    - cd-roll-ca `next`: waits for the strips decision.

- **06:5xZ main 158f77c (my 76fd3db) on 1fb0b49 (I-081 fix: an exclusive short grant left its last-grant record on
  an idle lock; the lead resolves I-081 after npm test).**
  - **F3 D2 gate SIGNED (lead 06:4xZ)** on fix-nav-morph's reading of iphone-runner's Timeline runs tD1-3/tC/tV
    (G driver, Timeline on, n=1 per arm and 3 for D; files and shas in iphone-runner's `out/p071`; analyzers
    `p071-tl.mjs` 0cc2217b49af, `p071-comp.mjs` e022de3b6a32). OBSERVED: no long frame names D's listener
    add/remove (event dispatch < 1 ms); every >50 ms frame is one Composite with ~91-94 Paint children in every arm;
    most Composite time lies outside the Paint children, cause UNRESOLVED; C3's collapse fits the down-stroke dip.
    **D's land gate is now P-073 alone** (then P-036 confirmation, then the F swipe). Phone free after the runs.
  - **fix-cd-strip 6ae6908**: strip-rw JS 5e37af69bcc4, CSS 9b2f89ea58bd, patch 48bc7adf7f03, base st6-rb2; P-070
    unedited, superseded before data (strip-cl -> strip-rb -> strip-rw).
  - **User ACCEPTED PR-008 land-strip at 06:52:53Z** (confirmed T-030 #18; stands, nothing withdrawn).
    review-cd-strip-r2 NEEDS-FIX: (1) the hero .strip/.cell skipped st6-rb2's scene-pause will-change rule, so 96 hero
    clock layers stayed up in the paused-but-rendered band, where the faces have 0; (2) the card's R-fade rate was pooled
    across sessions; in the same sessions it is strip-rw 3/26 vs A/A 1/26. **New base:** patch 1f3c26a16563, JS
    5e37af69bcc4 unchanged, CSS 40078cb2d9cf. Then re-check, re-card, review round 3, land. **P-072** goes into the
    ledger against the new BUILD card before any phone data; ops second-reads it.
  - **cd-roll-ca**: the counted set is stopped until it gets the new strip hashes; the sessions so far are first-build
    data. It rebuilds on 1f3c26a16563 and restarts.
  - **I-082** (env, not blocking): the Simulator's SleepWidgetExtension burns a core during sessions (load1 37-108).
    ts-i082 is on it. Simulator count results carry it as a caveat.
  - **F3 v1c** (Sim): it capped V (9 pushes, 453/453 prevented). The lead cut the check to D×1 + C×1; then P-073 rev 2.
  - The lead answered T-030 #14 (06:35Z) and #16 (glint/sweep battery question).
  - PROGRESS:
    - F3 `next`: the odd run is traced and is not F3's code; the warm-phone test remains. Added a D2 detail; the
      swipe "when" no longer mentions the trace.
    - Change line 06:53Z: the user chose to land the strips.
    - cd-strip `next`: the style fix is being re-checked; nothing for the user to decide. The P-072 check is to be
      written against the corrected build. Added a detail.
    - Dropped the upcoming "your choice" item.
    - cd-roll-ca `next` and detail: rebuilds on the new base.

- **06:4xZ main 915237a (I-080 fix: a shared group left its last-grant record on an idle lock; resolved).**
  - **I-081** open, not blocking (ts-i080 reported): an exclusive `--short` grant also leaves a short last-grant
    record on an idle lock (doctor: last-grant-short-outlived); owner **ts-i081** (worktree subagent, spawned 06:12Z).
  - **Rotation (lead, all holds <= 300 s):** P-071 attribution tC (iphone-runner, Timeline, 06:19Z) -> cd-strip G4
    (moved up: its card blocks the user's choice and cd-roll-ca) -> cd-roll-ca debug run 3 -> fix-nav-morph v1c Sim
    holds 2-3 -> hero-exit-threaded (locating the y884 paints).
  - **P-073 rev 2** (fix-nav-morph): ops points 1-4 and the reviewer's 3 nits are in (uncapped hot-run collapse flagged
    to the lead; battery temp logged at pin arrival; "D collapses" row first, first matching row wins). v1c =
    `fixes/morph-webkit/gestures/arm-scope-touch-v1c.json` 0653995a35be (55cfbec, v1 minus the end loop's
    `until atEnd`). Rev 2 sha comes to ops after the v1c Sim result; ops re-reads, the lead signs.

- **06:1xZ ef16659 landed. F3 ruling; P-073 assigned, second read NEEDS-FIX.**
  - **Lead's F3 ruling:** D proceeds on its own merit, gated on (1) the D2 Timeline attribution not naming D's
    listener add/remove or other D changes, (2) a new hot-held block. P-071 ran at 37-38.6 °C; P-036's V-only
    collapses were at 40.3-43.3 °C, so temperature is the new question that reopens B1. P-036 confirmation and the
    user swipe wait for both gates. PROGRESS F3 `next` in the lead's plain words; upcoming swipe re-dated.
  - **P-073** (fix-nav-morph; card "P-073 prediction card" in fixes/mw10e-arm-scope-d/README.md, 9dfca7f on
    fix/f3-arm-scope, fe27e9a working; ledger row after P-071): B1 hot-held, C / V / D, arm-scope-touch-v1, counted =
    capped runs only (re-run in place), band 40.0-41.0 °C at each run start, warming by uncounted W cycles on the
    plain baseline page, idle >= 57 fps validity, S sentinel in band (a failure stops the block), collapse as P-071 +
    a "sustained" second reading, budget <= 20 runs / 100 min, lead's decision table. **Ops second read NEEDS-FIX:**
    (1) no row for D "not enough" (and say what an under-filled control means); (2) heat ceiling (park + void at >=
    42.5 °C or an iOS thermal notice, cool to <= 41); (3) charge state per run, constant across arms, change = void;
    (4) scope for the lead: his message said "C vs D", the card adds V as positive control (ops thinks V belongs).
    **Lead accepted all four:** C / V / D, V kept as positive control; budget pressure from V's cap re-runs is for the
    forced-cap v1c (Sim check first; if v1c fails, raise the budget or register "arm short of 3 -> inconclusive ->
    lead"); D < 3 counted -> inconclusive -> lead, no landing; an under-filled C or V voids that arm's comparison.
    Rev 2 list sent to fix-nav-morph (plus review-f3-arm-scope's three nits, text not seen by ops). Lead signs rev 2
    after ops' PASS and the v1c Sim result. Ledger "next free" P-074.

- **05:5xZ P-071 block done and scored (official, lead 05:5xZ); scorer second read PASS.**
  - Block 03:59-05:37Z, valid: S-open PASS 60.2/57.9 (LOAD>8 flag at stamp), S-end PASS 60.2/57.6; LPM off (C-027,
    idle rAF 59 Hz every run); battery 78-79 % held; 0 errors; every counted run and sentinel in its own
    `--no-timing` hold. Deviation: the chain hit Bash's 2 h cap at 05:34Z in the cooling gate after V3; S-end
    re-issued by hand in its own hold; no run affected.
  - **Official verdict:** V clean 0/3, D clean 0/3; C 1/3 (C3, cycle phase, 2 windows 27.5/25 fps 3 s after a
    touchend with no touch and the morph closed; recovered after the up stroke) is outside the decision rule and a
    miss on "C clean ~90 %". Card units (per-run max dt): arm C 70/64/74, V 68/64/69, D 70/98/66; disarm C 32/33/35,
    V 33/34/35, D 35/85/39: no separated-worse anywhere. The ~60 % prediction missed on its second half (D2 c2 disarm
    85 ms, the only disarm frame > 50 in any arm). **B1 UNRESOLVED under pin-hold-v2; no second block without a new
    question.** D2 outlier goes to Timeline attribution before D lands. The lead's arm >50 counts (C 10/11/14 vs V
    8/7/9) are exploratory only, not pre-registered, threshold-sensitive, never a gain.
  - **Scorer second read (ops): PASS.** `out/iphone-runner/p071-score.mjs` a90e807d4296 matches card b88f100: pin
    arrival = first frame y >= 5200; 2 s windows from pin arrival, collapse = 2 consecutive < 30 fps; strokes after
    mark `cycle`, up = arm [first touchmove −50, lift +500], down = disarm [lift +400, lift +1200]; twins >46/>54,
    >30/>38, near bands (30,38]/(46,54]; per-run max taken over the 2 strokes of a kind. Re-run on the 9 gesture files
    (sha12 match iphone-runner's table; GESTURE_HASH 2d3a97b742cf47c6): output byte-identical to score-p071.json
    f8e231d4b617.
  - PROGRESS: 05:50Z change line (lead's plain words), F3 `next`, P-071 check, details, upcoming swipe "after one
    odd run is traced". The P-071 row lives on fix-nav-morph's branch: it fills measured/in?/lesson there.
  - Next: Timeline attribution (iphone-runner, `gesture --timeline` after rebase on df55321): V at the pin
    (reference), D's cycle phase, C's cycle phase (C3). P-071 row filled by fix-nav-morph (97abb52 on its working
    branch, f5c2b48 on fix/f3-arm-scope; README f342e2b, 54adbdd); ratio median D/C 1.00 arm max, 1.06 disarm max.
    The V/L ruling is the lead's: the card has no V-clean + D-clean branch.
  - **cd-strip (lead 05:4xZ):** the fade50 delta-1 digit class shows in both strip builds above the A/A rate; it goes
    to the user as a proposal (land with the residual or park) once its card is done; P-072 waits for that decision.
    PROGRESS `next` + an upcoming "your choice" entry.
  - **I-080** open (tool, lead): a shared-lane group leaves `chrome-measure.last-grant.json` marked short after it
    ends (doctor: last-grant-short-outlived); ts-i080 on it.

- **05:1xZ 7f00616 landed. cd-strip -> strip-rw; hero-exit frozen frames explained; P-071 on its last counted run.**
  - **cd-strip** builds **strip-rw** (strip-rb + a wrapper, one write per m change; strip-rb raised style writes at
    mid/end pin); 3-gap check plan (one Sim job per P-071 cooling gap); **P-072 re-registered against strip-rw's card
    before data** (ops second read owed when fix-cd-strip sends the sha). cd-roll-ca adapts `__crTops` to the wrapper.
  - **hero-exit-threaded:** frozen frames done: R1 = C's own two raster states, R2 = deck-edge shadow, R3 = the
    unarmed first frame; trying a scroll-event re-add for R3, then the user options.
  - **F-161** (pitfall, fix-hero-exit-threaded): `lock.mjs wait --until released-by:X` is met whenever X does not
    hold; to queue after X's NEXT run chain `--until held-by:X` then `--until released-by:X`. Its 04:32Z Sim job
    delayed P-071 V2.
  - **P-071 holds:** D2 04:45, C2 04:54, D3 05:04, C3 05:14-05:16Z; **V3 (last counted) next**, then the end
    sentinel and the attribution runs; counted done ~05:30Z.

- **04:4xZ add7185 landed. cd-strip picked; cd-roll-ca rebuild; Sim gap rule; P-071 at D2.**
  - **cd-strip** (lead): picked **strip-rb**, identical on all rows; the idle-paint gain is withdrawn; gains = re-entry
    Paint, backing MB, style writes. PROGRESS `fixes`/`next` and a 04:45Z change line say so in plain words. **Lead's rule
    (04:5xZ): a pre-registered prediction is never restated.** P-070 (made for strip-cl, no data) is "superseded before
    data: build changed (strip-cl -> strip-rb, lead 04:4xZ); text unchanged" in cd-strip's ledger; fix-cd-strip
    registers **P-072** (ops id, 04:5xZ) for strip-rb before any wave-2/phone data (re-entry Paint, backing MB, style
    writes, no new slow frames; no idle-redraw claim unless meant); ops second-reads it. PROGRESS check line now
    points at P-072; ledger "next free" P-073.
  - **cd-roll-ca** rebuilds as "cells-only" on strip-rb; round-3 PASS (dbb113f) covered the earlier build.
  - **Gap rule (lead):** one Simulator job per P-071 cooling gap, alternating cd-strip / hero-exit-threaded.
  - **Pitfall (hero-exit-threaded posting it):** `lock.mjs wait --until released-by:<o>` is a state check, not an
    event: it is met whenever <o> does not hold, also before <o> ever took the lock.
  - **P-071 holds (holds.log):** S-open 03:59:11Z, C1 03:59:52-04:01:55, V1 04:12-04:15, D1 04:23-04:26, V2
    04:34-04:38; D2 next (the lease label names the next run during cooling). ~11 min per run with cooling: counted
    runs done ~05:35Z, then the end sentinel and the attribution runs (`gesture --timeline`, df55321).

- **04:1xZ main df55321: 68dc897 (ops), fe3d1e5 (de-heat P-068 nits: D1 raw-slope wording, ledger share marked
  descriptive), df55321 (I-079 fix: `iphone.mjs gesture --timeline`, rebased from 2ff855d); lead runs npm test on
  df55321, then resolves I-079.**
  - **P-071 running** (iphone-runner): warm-ups C 03:40Z, D 03:44Z; S-open PASS 03:59Z (load1 10.8 at stamp, record
    8.5 -> 7.0, flagged LOAD>8); C1 clean 04:00Z (load1 6.5). **Ops misread, no deviation:** at 04:02Z the lease's job
    label already read "run V1" while the chain sat in the phone-temp gate between holds (C1's hold ended 04:01:55Z,
    Safari parked); V1 had not run. Every counted run and both sentinels run in their own `--no-timing` hold
    ("acquired after N s" in the run log); per the lead, each hold first waits up to 90 s for load1 <= 8, else the run
    keeps a LOAD>8 flag. fix-nav-morph's conditional V1 ruling (count, flag, report with/without V1) is moot. Lesson:
    the iphone lease's job text names the NEXT run during cooling; check chrome-measure holds.log, not the label.
  - fix-nav-morph's state at its hand-back: `fix/f3-arm-scope` d20f7f7 (landing candidate, built on D, unlanded);
    working branch `worktree-agent-a277ea00c8773c1ea` 50d7646; Timeline attribution waits for I-079 (now landed),
    collapse results stay OBSERVED until it runs.

- **03:4xZ 10ac0af landed. P-068 heat test scored; ops second read PASS; heat goal now firm.**
  - **P-068** (iphone-runner, H1 + H2, both attempt 1, held at 80 %, floor check pass both): score.json
    61219d594ea6 on samples.jsonl 3c14bcd297ce, scorer 1ca63e2b4d11. Ops re-ran `heat.mjs score --in` on the same
    samples: output byte-identical. **Fastwork heats more** (B − A corrected 0.565/0.413, raw 0.433/0.365, both
    >= 0.10, not start-sensitive); **the fixes cool the phone** (B − X 0.428/0.162, raw 0.337/0.141, both >= 0.05).
    Corrected slopes F −0.085/−0.105, A 0.055/−0.013, B 0.62/0.40, X 0.192/0.238. Deviations D1-D4 in iphone-runner's
    RUNLOG (H1-3B pre-warm likely inflates H1's B; H2 alone passes both verdicts). Write-up + ledger row: de-heat
    2801f4a (README "Result"); **ops second read PASS** (re-score identical; D2 recompute with H2's B 0.40 -> B − A
    +0.345, B − X +0.208 checked; misses stated as misses; system power descriptive, no units; "fixes cool" scoped to
    st6-rb2 without the countdown fix). Nits, not blocking: D1's "low start biases the corrected slope upward" is
    about the raw slope (the correction removes the modelled part); the ledger lesson's "32-61 %" lacks the README's
    "descriptive". Per the pre-registered outcome: work at rest becomes a ranked goal (countdown first, then the
    carousel); "the fixes cool the phone" goes into PROGRESS as a heat gain (change line 03:45Z, share marked a
    rough figure). PROGRESS goal's conditional heat clause made firm.
  - **Lead 03:24Z** moved iphone-runner's H2-4F to #1 (after ts-i079's npm test). hero-exit-threaded stays at I.
  - **cd-roll-ca wording** (review finding 3): it is a watched blind side-by-side comparison, no touch; PROGRESS
    item, gate, next and upcoming reworded.
  - **Phone:** P-071 pin-hold started 03:34Z (warm-ups), iphone-runner, ops OK given.

- **03:3xZ 5b1e544 landed. P-071 second read PASS; reviews; I-079 open.**
  - **P-071 PASS** at b88f100 (fix-nav-morph; card dd122cc, ledger row fedec12). All four round-1 points closed:
    S sentinel on C with void/cool/stop; arm-level >= 2/3 collapse, 0/3 clean, 1/3 inconclusive (V 55/30/15, D|V
    50/40/10); unit = per-run max over 2 cycles, n=3v3, separated-worse = every D > every C and median diff >= 16.7 ms
    at > 50 (twins 46/54); LPM recorded, on = void. Pre-data amendment: arm window first touchmove -50 ms to lift
    +500 ms (Sim 02:47Z: cycle 1 reopens by native scroll to the end, 0/27-28 prevented; cycle 2 31/31). iphone-runner
    has ops' OK to start after P-068 H2. Ledger "next free" now P-072 (P-071 row on the owner's branch until it lands).
  - **I-079** (open, tool, iphone-runner): `iphone.mjs gesture` cannot record WebKit Timeline during a WDA gesture
    run; needed for P-071's attribution runs (not its counted runs); ts-i079 on it.
  - **cd-roll-ca** review round 3 PASS (dbb113f, JS 2af461dc); blind test after cd-strip lands.
  - **cd-strip:** lead picks strip + per-cell layers if its last pixel rows pass.
  - **hero-exit-threaded:** Chrome path gated to WebKit only (lead approved); WebKit residual -> A/A, hunt, then user
    options; accent paints at 1.5x block its phone ticket.
  - **Flaky unit test** (5b1e544's first test:unit, 1 fail of 675): name lost (my grep kept only counts), 2 reruns
    clean; no incident without a name. Ops keeps full logs (scratchpad/mgmt-ops-9/unit*.log) from now on.
  - **Phone:** P-068 H2 segment 4 (F) at 03:2xZ; iphone-runner queued 3rd for its no-timing hold behind two shared
    readers (ts-i079, fix-hero-exit-threaded).

- **02:5xZ a02c915 landed (ff). P-071 card (fix-nav-morph, F3 B1 pin-hold) second read: NEEDS-FIX.**
  - **P-071** (bb33c14 on worktree-agent-a277ea00c8773c1ea; pre-data): C aw1-10e 3e2f599a1632 / V F3 c6d3590576a7 /
    D mw10e-arm-scope-d 999c4497f37e, CSS c6aad94b455f; G pin-hold-v2 2d3a97b742cf (transit to atEnd, 8 s idle at
    the pin, 2 close/open cycles); C V D / V D C / D C V, warm-up per port, own no-timing hold, Timeline off, attribution
    after; metrics: collapse per run (2 consecutive 2 s windows < 30 fps) + arm/disarm window frames (phone ms
    thresholds, twins). Predicted: C 0 collapses (~90 %), V >= 2/3 (~55 %) or 0/3 (~30 %); given V collapses, D 0
    (~50 %). Decisions: V yes/D no and D windows not separated-worse -> short P-036 on D -> F swipe; D collapses ->
    build E (Sim + Chrome review first); D arm frame separated-worse -> lead with Timeline; V never -> B1 stays
    UNRESOLVED, no second block. **Ops asked for:** (1) S sentinel on C at open and end (P-036 rule, void + cooling +
    stop rule); (2) arm-level collapse rule, incl. V or D at exactly 1 of 3; (3) unit for separated-worse (per-run max
    n=3 vs per-cycle n=6) and which twins decide; (4) Low Power Mode recorded off, a run with it on void. Card under the
    id P-071 in the README + ledger row on the owner's branch; ops re-reads the amended sha before iphone-runner starts.
  - **cd-roll-ca review round 2 PASS with nits** (a57444b, V JS 673b110d); lead holds the sign-off until the hide-check
    re-analysis (108/247.9 -> 3.29/0.27 px) is explained; waits on cd-strip.
  - **cd-strip step 4:** remainder variant dropped; the suspect is the backing size (only the visible cell and per-cell
    layers both give 0 px); a size sweep runs, then a cost table to the lead. Chrome: identical except at hero fade 0.9
    (delta 1, beyond A/A, 7 shots); PROGRESS line narrowed accordingly.
  - **Phone order (lead):** P-068 H2 straight after H1 (one sitting) -> F3 B1 pin-hold P-071 (~03:30Z) -> cd-roll-ca
    blind test once cd-strip has landed.

- **02:3xZ a265420 landed (ff). F3 B2 fixed, B1 unresolved; cd-strip WebKit hero-pixel delta; P-068 H1 F, A, B done.**
  - Lead moved iphone-runner to chrome-measure #1 (audited) so the P-068 H1 segments stay back-to-back (fix-nav-morph
    next); each segment runs in its own exclusive `--no-timing` hold (README line 92), never beside a shared group. I-077
    phone confirmation is in the incident record (lead).
  - **F3 (fix-nav-morph 909747c, on its branch):** B2 FIXED in new build mw10e-arm-scope-d (JS 999c4497f37e: window
    touch listeners while the morph is active; Chrome gap cases at m=1 edge and below the nav mid-tween: V fails, C and D
    pass). **B1 UNRESOLVED:** Simulator G pin repro and Chrome pin counts show no collapse and no arm difference. Phone
    ticket after P-068: G pin-hold C/V/D, then Timeline; D also needs a short P-036 confirmation before landing. F
    swipe stays postponed. A prediction card for the ticket takes **P-071** (ops second read).
  - **cd-strip hero pixels (lead, OBSERVED, cause unknown):** in WebKit the hero digit edges are uniformly 1 level
    lighter (delta <= 3); the static check (cell at 0) still differs, so it is not the offset. fix-cd-strip hunts a
    pixel-identical layer variant (lead: no exception); if none exists it goes to the user as an options proposal.
    cd-roll-ca rebases on whatever cd-strip lands; its review B1 is fixed in code, hidden-tab check queued.
  - hero-exit-threaded: Chrome ablation located a 1-px copy shift in the copy's scroll-timeline animation; next a
    WebKit Simulator screenshot check C/C/V plus the y300 at-rest layout count.
  - P-068 H1: F, A, B done; X next after cooling to 37 °C (H1 ends ~02:35Z); H2 ETA not given yet.
  - PROGRESS: F3 next (missed-touch case fixed, end-hold check on the phone after the heat test) + B1/B2 detail;
    cd-strip next (simulator digit edges a shade lighter; identical variant hunted, else options for you).

- **01:5xZ 3de2653 landed as 9b9c3ef (lead rebased it onto 5d656c3); main 77c9f75.** 5d656c3: de-countdown scopes the
  clock-down hypothesis to baseline arms (F-152, fix-pill-swap: st6-rb2 has no avatar swap and no 1 Hz heavy layout;
  OBSERVED, Simulator). 77c9f75: de-countdown plans the part (b) restack, stack order **st6-rb2 -> cd-strip ->
  cd-roll-ca -> (b)**, gate/roll contract agreed with fix-cd-roll-ca (hold via `__crStop`, show via `z(a, held)`).
  - **F-153 (fix-cd-strip, coupling; acked by de-countdown and fix-cd-roll-ca):** cd-strip supersedes countdown-faces
    (a) (and illusion-digit-layers for the countdown); **(b), the hidden-skip gate, must be rebuilt on cd-strip by
    de-countdown after cd-strip lands, on the lead's order.** cdwc's panel `.face` rule (CSS 11953) matches nothing after
    cd-strip (arm b ships its own `.strip` will-change: auto retarget); `__cdStripY` is periodic, so a strip driver keeps
    offsets in [0, 9] (cd-roll-ca applied it). PROGRESS cd-strip details carry it.
  - Lead lands by rebasing ops commits itself when main moved: after a land, `git rebase main` drops the landed patch.
  - **cd-roll-ca:** D signed (fast path); review-cd-roll-ca reviews 2625f49. The user's blind roll test (3 pairs, a
    catch pair 2nd) is posted after P-068 and the review pass. (b) is rebuilt after cd-roll-ca lands.
  - **I-077 CONFIRMED on the real phone** (lead): P-068 H1 segments 1 and 2 opened in the parked tab with no Safari
    restart (793c8bc). The incident record note is the lead's (`incident.mjs update --by lead`).
  - **P-068:** H1-1F done (5 cycles, 01:33-01:40Z); H1-2A running.

- **01:4xZ F3 review CHANGES REQUIRED; pill-swap DROPPED; I-078 RESOLVED; P-068 running.** Rebased on main 9df12de
  (4fb3098: de-heat's P-068 system-power amendment, pre-data: PowerTelemetryData logged, reported descriptively,
  verdicts unchanged, scorer 1ca63e2b4d11; both ledger rows kept).
  - **F3 (f3-arm-scope): review-f3-arm-scope on fix/f3-arm-scope 846427e: CHANGES REQUIRED.** P-036's card part stands
    (scorer rerun identical, PASS also without V2). B1 (OBSERVED, cause unknown): a V-only frame-rate collapse at the
    end pin when the run settles at y 5215 (5-21 fps idle vs C 52-60; 2/2 V vs 0/5 C). B2: touch-coverage gap
    mid-tween and at m=1, where the morph does not reverse. **F3 does not land; the user's F swipe is postponed.**
    fix-nav-morph committed the scorer on fix/f3-arm-scope 846427e (fixes/mw10e-arm-scope-c/p036-score.mjs; records in
    iphone-runner's out/p036/). Lead decision: no user phone step while P-068's timed holds run (user-steps-first
    applies only once a step is posted); the F3 swipe is batched with cd-roll-ca's if ready.
  - **pill-swap: D NOT PRESENT, dropped (9df12de, lead).** F-146/F-148's avatar template swap was measured on the plain
    baseline; st6-rb2 already contains rotator-st6, which removed it (Sim 0 heavy rotator layouts at every position;
    Chrome pastHero ~4 light layouts per 4 s). No fix built. The 01:00Z PROGRESS line is corrected (on the best build an
    earlier fix already removed the swap); item pill-swap dropped; ledger note added (no card was made).
  - **I-078 RESOLVED** (84a0982, npm test on main 1343/1343). Relayed to the Simulator users (fix-cd-strip,
    fix-cd-roll-ca, fix-pill-swap, fix-hero-exit-threaded, fix-nav-morph): `git rebase main` between steps, no
    re-measure.
  - **cd-strip review round 1: CHANGES REQUIRED** (code fine): WebKit Sim pixel parity, more Chrome scenarios, README
    fixes, idle-triple counts.
  - **P-068** running: iphone-runner's no-timing hold from 01:16Z (warm-ups F A B X, then cooling for H1).
  - PROGRESS: 01:15Z line corrected (robot-finger test passed, review found a possible slowdown at the end hold and a
    missed-touch case, swipe postponed, heat test now); F3 item next + review detail; upcoming F3 swipe postponed;
    01:00Z line corrected; pill-swap dropped; cd-strip next (review round 1). Ledger: P-036 review note, pill-swap note.

- **01:2xZ P-036 SCORED: card part PASS (fix-nav-morph 6fb21b2; ops second read PASS).** Landed since 4e29fd5: 9b7454d
  (de-countdown caveat: X1 layersForNode paintCount deltas may count the census itself; Timeline digit-Paint counts
  and the stage-2 decision unaffected), 2998720 (de-gpu G2 correction: Timeline 13 -> 0 per 4 s; the lead told the user
  in T-030 #12), 84a0982 (I-078 tool fix).
  - **P-036** (G, 00:28-01:10Z, signed amendment 4084772, iphone-runner; C aw1-10e 3e2f599a1632 vs V F3 c6d3590576a7,
    CSS c6aad94b455f, script d72ee13644cc): median touch-to-scroll C / V Z1 196.8 / 192 (-4.7), Z2 193 / 194.5 (+1.5),
    Z3 189 / 189 (0) ms, every zone overlap (Z1 still overlap without the hot V2: V 190-192.5 vs C 192.5-201). 8/8
    valid; S-open 60 / 58.9 fps (38.9 °C), S-end 60.2 / 57.1 (40.7 °C) PASS. Deviations disclosed: V2 hot (42.6-43.3
    °C, Safari unparked ~6 min between holds 1 and 2), V2/V4 started at decaying load1 20-26 (2.3-4.5 inside holds), C2
    re-run in place. Info only: first touchmove cancelable Z1 C 0/4 vs V 4/4 (OBSERVED), no cost (queue delay 14.5-17
    vs 15-17 ms); Z1 dt>50 per run C 2,1,3,2 vs V 1,16,3,2 (16 = hot V2). **Ops second read:** per-run medians recomputed
    from the README table (derived numbers only; no gesture record committed, N1): all six zone medians and the overlap
    verdicts match; decision follows the registered rule. P-036 ledger row filled (Z1/Z2/Z3 in, card part PASS).
    **Next under the rule: the F part (user console blind swipe of F3, incl. strokes from the nav header), then an
    independent review, then landing.** fix-nav-morph's land-request contents went to the lead (branch
    worktree-agent-a277ea00c8773c1ea rebased on 2998720, 6fb21b2 … bc4b3fa); the console F step needs the lead's word.
  - **cd-strip:** D signed by the lead (fast path, no gain claim); review-cd-strip reviews tip cb45b05 (2d35411 fix,
    2a7163d P-070 card, cb45b05 id confirmed). **P-070 assigned by ops** (no other branch claims it); next free id
    **P-071**. Arm (b) unlayered: hero 0/259 shots differ, panel 1/169 (= A/A noise); Sim hero-clock paints 13 -> 0 per
    4 s, clock layers 80 -> 8, clock memory 1.18 -> 2.10 MB (OBSERVED, 2 sessions). Arm (a) layered rejected (67/169
    panel shots differ).
  - Phone: iphone-runner goes to P-068 next (cooling + rebase first); scorer iphone-runner, ops second read.
  - PROGRESS: change line 01:15Z (F3 robot-finger test passed; blind swipe + review next; then the heat test); F3 item
    next/check/details; upcoming F3 swipe "next for F3"; cd-strip next + P-070 check.

- **01:0xZ 7bc3d42 landed; bcb8ef5 + 8529d59 landed (de-countdown): F-146 EXPLAINED, countdown-faces clear for wave 2.**
  - **F-146:** the 1/s pastHero Layout burst is the community-pill avatar template swap (JS 11415-11447), a
    full-viewport Layout twice a second, identical in every arm; the PoC adds no write or invalidation while hidden
    (Simulator probe). On the phone the same layouts run longer in V: CPU-clock-down hypothesis, UNRESOLVED; research
    plan 8529d59 (CLPC/XNU and WebKit idle references, four probe-artefact checks, a decisive phone check only if a
    decision needs it). **New fix owner `fix-pill-swap`** (on st6-rb2) owns that component.
  - **P-036 hold-2 SIGTERM explained (iphone-runner):** its own Bash job hit the 30-min background limit. Hold 2 ran
    V2 (valid); C2 started 00:45:33, cut at stroke 7/16, VOID (aborted), re-run in place so the order stays C V V C C V
    V C. Hold 1 (00:28-00:37): wC, wV, S-open PASS (bottom 60, scroll 58.9), C1, V1 valid. No counted run outside a
    quiet hold. Remaining: hold 2b (C2, C3, V3), hold 3 (V4, C4, S-end). **Lead moved iphone-runner to chrome-measure
    queue #1 (audited)** to keep the holds close. fix-nav-morph scores; iphone-runner sends ops the result.
  - **I-078 triaged:** `ts-i078` spawned; workaround on the incident: wait for the Simulator shutdown to finish, retry.
  - Lead signs the cd-strip D card and the hero-exit-threaded ST-1 card when they arrive.
  - PROGRESS: change line 01:00Z (F-146 explained, countdown fix clear for wave 2, pill-swap fix), item pill-swap (I).

- **00:5xZ bad68d3 landed (ops batch: X1 stage 2 + second read PASS). I-077 RESOLVED (793c8bc, npm test 1339/1339 on
  main):** `iphone.mjs open` reaches Safari after a park again; D1's `--no-park` workaround is no longer needed for new
  blocks (rebase first). **I-078 OPEN** (tool, de-countdown 00:43Z): `sim session` refuses when fw-sim is in the
  transitional "Shutting Down" state at join (twice in a row; two 0.3 s countdown-faces shared holds exited 1).
  - **P-036 (iphone-runner, F3 G, signed S-sentinel plan):** hold 1 (no-timing, exclusive) 00:28:41-00:37:14 exit 0;
    hold 2 from 00:43:01 ended 00:46:39 by **SIGTERM (code 130, 217 s)** while the phone job read "run C2"; the
    shared group (cd-strip Simulator + others) took chrome-measure right after, load1 ~52. Asked iphone-runner what
    ran in hold 2 and whether C2 counts; a run outside its quiet hold voids under the plan.
  - GPU fixes (board 00:4xZ): cd-strip hero pixels 0 px / 259 shots vs st6-rb2, Sim hero digit layers 80 -> 8, paints
    166 -> 24 (counts, Simulator), D card to the lead next; hero-exit-threaded ST-1 Sim run 2 (run 1 never crossed the
    flip: html smooth scroll), ST-1 card next; cd-roll-ca tick rolls within the original's own stamp jitter (0.45 vs
    0.61 px), first-frame start edge fixed; F-146 Simulator probe of the 1/s Layout burst at pastHero (de-countdown).

- **00:3xZ landed: 630c700 (memory move), 3251486 + b44f58c (X1 stage 2), d8351b1 (de-gpu addendum), 793c8bc (I-077
  tool fix; incident still listed open at 00:3xZ, waits on the lead's resolve).** Rebased on 793c8bc.
  - **X1 stage 2 readout b44f58c (de-countdown, P-069 phone scored in PREDICTIONS):** one block 23:59-00:15Z, C V V C
    C V V C, 8/8 valid (4 ticks per window, hashes match, LPM off, no inspector), heat checks open 60/53.2, end 60/52
    PASS, no run in the C-027 settings window. Row 1 top L+P+C C 1028.9-1065.4 / V 1013.7-1100.6 ms, median V - C
    -19.2, **not separated -> "full" stays, X1 closes** (no pause-only offer). Row 2 pastHero S+L+P+C C 877.5-1053.8 /
    V 619.1-645.8, **V separated below, V/C 0.62 -> (b) confirmed on the device.** Row 3 resume not separated; frames
    > 50 at top not V-only. P-069 phone: row 1 in, |median diff| < 4 out (19), row 2 in, frames > 50 0-1 out,
    falsifier not met. **Open F-146** (post-hoc, OBSERVED, cause unknown): at pastHero at rest V has more long frames
    though less total work; the lead wants it explained before wave 2; de-countdown runs a Simulator `--lt` session.
    D1 3251486 = the I-077 workaround (mechanics only, accepted pre-count). **Ops second read of b44f58c: PASS** (recomputed
    from x1-stage2.json, counted runs 1-8 only, attribution runs excluded): served hashes C 4606120cf392 / V
    638b8e03e81c (CSS 27776f3d4138 both) as on the card; 4 ticks in every window; row 1 median V - C -19.2, not
    separated; row 2 V 619.1-645.8 vs C 877.5-1053.8, V below, V/C 0.618; resume and heroExit not separated; > 50 ms
    counts as in the readout. Decisions follow the card as written.
  - **d8351b1:** de-gpu's gpu-props addendum (section 4: X1 stage 2 outcome and F-146); de-gpu's tip was a628a6c.
  - **630c700 memory move (user OK both, T-032 #7):** `memory/` (README index + 15 scrubbed notes), imported by
    CLAUDE.md (`@memory/README.md`); Serena rules/project_overview are pointers; the auto-memory folder stays with a
    pointer header until a fresh session confirms the import. **The import works only in a FRESH session:** agents
    spawned in this session still see the old CLAUDE.md, so tell every peer you message to read `memory/README.md` by
    hand. Only the lead adds or edits notes; send the lead what should be remembered.
  - **P-068 scorer named (lead):** iphone-runner runs `heat.mjs score` (d1ec5c5345f7) after H1+H2 and sends ops the
    verdict; ops second-reads, then the conditional heat goal line becomes firm or is dropped.
  - Load spike: shared group (cd-strip + hero-exit-threaded Simulator) vs P-036 exclusive holds; the lead watches it
    (load1 ~29 at 00:3xZ, from 53).
  - PROGRESS: change line 00:30Z (countdown phone test: full stays, about 40 % less work past the hero, F-146 open),
    upcoming countdown test removed, F3 P-036 marked running (item next + upcoming).

- **00:2xZ T-030 report landed (41563ad, de-gpu; F-145); three GPU fixes at user priority #1; arch-memory proposal
  landed (cfe3693).** Rebased on main cfe3693.
  - **de-gpu T-030 (done):** lag left in st6-rb2, C-026 finger runs (F, one run per arm, OBSERVED): the first ~1000 px
    (hero exit + #people entry) hold 63 of 81 moving long frames; holding the morph at the end gives 91 frames > 34 ms
    (median 20 ms) that the moving count misses; middle and bottom nearly clean (17 / 1 vs O 45 / 21). Toolbar resize:
    real work in WebKit (CONFIRMED in source: fixed/sticky re-layout, vh/svh/dvh re-check) but small here (13-18 ms
    mid-page), not a fix candidate. Side effect: the open morph panel's `calc(100dvh - 40px)` re-lays out per toolbar
    frame (84/66/42 ms scrolling back up, one run, OBSERVED); fix-nav-morph takes it after P-036 (svh or px set once,
    pixel-identical in both toolbar states). Safari 26.4+ runs scroll-driven animations on the compositor thread
    (CONFIRMED, WebKit blog + source).
  - **Lead spawned, NAMED:** `fix-cd-strip` (F1, digits as sliding strips, identical by construction; D proposal
    APPROVED by the lead: the strip replaces countdown-faces (a), (b) stays; coordinates with de-countdown);
    `fix-hero-exit-threaded` (F2, hero exit as a scroll-driven animation on st6-rb2, ST-1 Timeline split first: v2 once
    +11 ms at y≈700, cause not named); `fix-cd-roll-ca` (user T-030 #10, 00:10Z: top priority too; stacks on cd-strip,
    prototypes the roll first; judged by sub-pixel motion numbers at 60/120 Hz and a blind swipe before any build).
    glint-ca, sweep-exact (battery/heat only) PARKED. fix-nav-morph sent both F1/F2 owners F3's nodes/2 range (~13307-13370);
    F3 lands first, they stack on it.
  - **T-032 #3 (user, paraphrased):** move agent memory into the project. arch-memory's proposal cfe3693 (inventory,
    one structure: memory/ + CLAUDE.md import, scrubbed drafts of the lead notes; nothing moved) waits on the user's two
    OKs in T-032.
  - **P-068 scorer unassigned:** de-heat's run ended; it asks the lead to name who runs `node research/phone-heat/heat.mjs
    score` (scorer d1ec5c5345f7) after H1+H2 and sends ops the verdict. Ops recommends iphone-runner (it runs the
    sessions), ops second-reads. de-heat's note that 39a846d still waits to land is stale: it landed as 9ff40e6.
  - **Phone:** X1 stage 2 block DONE (de-countdown board 00:2xZ: 8 counted runs valid, both heat checks pass); scoring
    and write-up (README, P-069) pending, not logged as a result yet. iphone-runner took the phone 00:16Z for the P-036
    re-run (signed S-sentinel plan): cooling from 41.1 °C, then 3 exclusive holds (quiet Mac). Host at 00:2xZ: load1 53,
    memory pressure warn (shared group cd-strip + hero-exit-threaded Simulator); the exclusive holds wait for that group.
  - PROGRESS: change line 00:12Z (T-030 result + three top-priority fixes), items cd-strip (F), hero-exit-threaded (I),
    cd-roll-ca (F), upcoming: blind swipe of cd-roll-ca (oldest change dropped, 30 max).

- **00:1xZ mgmt-ops-9 took over** (lead spawn, named so peers can message "mgmt-ops-9"); rebased on main 25d952d
  (mgmt-ops-8's last entry: I-077, X1 D1, X1 restarts, I-076/I-072; not repeated here). **mgmt-ops-8 (agent ID
  ace57ef63584bdfb6) is retired:** it was spawned unnamed, so peers could not reach it by name. Peers message
  **mgmt-ops-9**. Board row `ops` now owned by mgmt-ops-9.
  - **User T-032 (00:01Z, paraphrased):** the user asked why agents show up as "general-purpose" and asked that they
    follow the naming convention. Lead's answer: project agent types load only at session start, so a mid-session
    spawn runs as general-purpose and reads its role file first (same role, other label); three spawns after the
    lead's context compaction went out unnamed (the I-076 toolsmith, done; the ops hub, now replaced by mgmt-ops-9;
    the I-077 toolsmith, kept running because it only talks to the lead), the lead's slip; every spawn is named again.
    **Follow-up from the user in the same thread (00:02Z, paraphrased, open with the lead):** move all agent memory
    into the project where an agent has nowhere to store it; investigate and restructure the project to support it.
  - **I-077 toolsmith is unnamed:** board row `i077` says ts-i077, but `SendMessage` by that name won't resolve; use
    agent ID a46d520fdb1912d3c (or the lead). It is reading the park/open code (00:03Z).
  - Live at 00:03Z: de-countdown holds the phone and a `--no-timing` hold for X1 stage 2 part A (heat check);
    iphone-runner queued #1 for the phone (P-036 re-run, then P-068 H1); load1 2.8.
  - Waiting on: X1 stage 2 result (de-countdown), P-036 (iphone-runner + fix-nav-morph), P-068 H1/H2 (iphone-runner,
    de-heat; afterwards the conditional heat line in the PROGRESS goal becomes firm or is dropped), de-gpu T-030
    report (user's top priority: the lag left in st6-rb2, the toolbar-resize lead).

## mgmt-ops-8 log (10-02 23:5xZ-10-03 00:0xZ, newest first)

- **00:0xZ 91f8411 landed; lead's 9d6fa3c (CLAUDE.md npm test figures after I-076) on main; rebased.**
  - **I-077 OPEN** (tool, non-blocking; ts-i077 spawned): after `iphone.mjs run` parks Safari, `iphone.mjs open` can't
    reach a page (only about:blank views listed). Workaround: `--no-park` within a block, `safari-restart --url` to
    reopen, one park at the block end.
  - **X1 amendment D1 (c89a8b9, de-countdown; mechanics only, lead ACCEPTED, pre-count):** applies the I-077 workaround
    (runs keep the page, a part finding Safari parked reopens it with safari-restart, one park at the block end); run
    log with the C-027 settings window; nothing voided. X1 part A restarted twice before any counted run (about:blank
    after the earlier park; then the open-after-park failure). Ops reads D1 when it lands; no scoring change.
  - I-076 + I-072 RESOLVED (f8aa122). Peers address ops by agent ID or through the lead.
  - Waiting on: X1 stage 2 result, P-036 (after X1), P-068 H1/H2, de-gpu T-030 report.
- **23:5xZ mgmt-ops-8 took over** from mgmt-ops-7 (pinned to another agent's worktree by a peer's message; can't
  commit). Worktree `.claude/worktrees/agent-ace57ef63584bdfb6`, branch `worktree-agent-ace57ef63584bdfb6`, from main
  4647b27 (f8aa122: I-076 + I-072 resolved, npm test ~163 s at --test-concurrency=6). mgmt-ops-7's scratchpad drafts
  (mgmt-ops/mk2358.py, batch texts) were read, not run (the permission check had refused the script); the texts were
  applied by hand.
- **23:5xZ P-036 sentinel amendment 4084772 (rebased a4b1790, worktree-agent-a277ea00c8773c1ea) SIGNED (lead 23:58Z,
  pre-data); ops read OK.** The hero-none G heat check is dropped (failed 3/3 at any temperature and Mac load; G
  cadence clusters fit F-071; OBSERVED, cause unknown) for the standard S sentinel on C (own port, uncounted; bottom
  >= 58, scroll >= 44 fps) after the warm-ups and after C4; a failing sentinel voids since the last pass, cooling §5.3,
  stop rule on the S sentinel. All else unchanged (d72ee13644cc, C V V C C V V C, ms scoring, quiet Mac). UPDATE on the
  P-036 row. Phone order: X1 stage 2 (de-countdown holds the phone; user lift T-024 #8) → P-036 (iphone-runner, own
  quiet hold) → P-068 H1 then H2 (user C-027 "all set" 23:51:53Z: phone settings in place). Open: T-031 #3 wave-2
  timing lift once wave 2 is built; de-gpu (T-030) top priority, incl. the toolbar-resize lead.
  PROGRESS: f3-arm-scope next + P-036 check (new signed plan, runs after the countdown test), upcoming order (X1 stage
  2 → P-036 → heat), user line 23:58Z (oldest change entry dropped, 30 max).
- **23:5xZ docs (lead GO, I-076 f8aa122):** lane doc §2 npm-test line (concurrency 6, ~160-164 s, ~1.75 cores mean,
  bursts up to 6; weight 2 and 300 s unchanged); postmortem 2026-09-30 fix (b) marked superseded (concurrency raised to
  6). CLAUDE.md figures ("~60 CPU-s", "195-220 s wall") are the lead's to update.

## mgmt-ops-7 log (10-02, newest first)

- **23:4xZ (b) df0e21f landed (2259bf1 + df0e21f; scrub OK). P-036 re-run STOPPED under the stop rule:** the hero-none
  heat check failed on a cool phone (37.5 °C) and a quiet Mac (load 4.8), inside iphone-runner's own hold: p95 29-30 ms,
  ~290 of 1760 frames over 20 ms, 3 records. Not heat; OBSERVED, cause unknown. No counted runs. fix-nav-morph
  explains the failure and the lead signs a plan before P-036 is requeued. Phone order now: X1 stage 2 (de-countdown
  has the lease) → P-036 (after the page check + signature) → P-068. Board f3-arm-scope researching, waiting on
  fix-nav-morph. PROGRESS: f3-arm-scope next + P-036 check result, upcoming reordered (X1 stage 2 now), user line
  23:50Z. Log the explanation on the P-036 row when fix-nav-morph sends it.
- **23:4xZ C-026 blind swipe (T-031 #3 a) answered 23:41Z:** original (O, 4606120cf392/27776f3d4138) vs st6-rb2
  (B, 7bf7c4657d21/f523598b2a24), coin page1 = O; the user picked page 2 = **B smoother**: the hero and the nav morph
  quite a bit smoother than the original; still a little laggy (the user's guess: CPU work) and asks de-gpu whether
  GPU work can smooth it further; the lead made that de-gpu's top task, incl. the toolbar-resize lead (innerHeightChanges
  63/94 per swipe). Finger records (single F runs, not a counted block, OBSERVED): moving frames O 944 / B 895, >34 ms
  122 / 81, >50 ms 44 / 13, max 100 / 96 ms; battery 37.4 → 39.1 °C, load1 ~4. PROGRESS best-stack
  felt = the blind result, upcoming swipe entry removed, user line 23:45Z. Landed meanwhile: 3fb0ebb (de-countdown X1
  stage 2 block plan, pre-data). Next on the phone: F3 P-036 re-run, then X1 stage 2, then P-068.
- **23:3xZ (b) fcfc391 landed (main = fcfc391). X1 A1b (P-069, de-countdown) VALID, 23:24Z; user chose X1 stage 2 (T-024 #8).** (iv) EXPLAINED as
  pre-registered: V's 2 stale updates sit at rendered opacity exactly 0 in both arms; the clock is live from the first
  visible update. (i) is with the user, T-024 #7, 3 options: a short countdown-only phone timing test (recommended),
  accept and let the wave-2 timing run cover it, or hold the fix out of wave 2. Board countdown-faces waits on the user.
  de-countdown's 5 commits 754e79e..dd87946 conflict with ops rows in PREDICTIONS.md; it is rebasing, the lead lands the
  new tip; landed as 24b7db4.
  - **User T-024 #8 (23:31Z): option 1, X1 stage 2** (countdown-only timed phone test): a scoped timing lift for that
    test only. The user also asked de-gpu to look at the counting animation for GPU-friendly practices; any variant from
    that is a separate PoC and question, not in the stage-2 block. Phone order: blind swipe C-026 (st6-rb2, loading) →
    F3 P-036 re-run → X1 stage 2 (~20 min + cooling; before P-068 because it is short) → P-068 heat. PROGRESS: stage 2
    in upcoming (item countdown-ca), user line 23:35Z. Board countdown-faces waits on iphone-runner.
- **23:3xZ (batch) 512be87 landed (my 6afd23d, rebased); I-075 RESOLVED (aac5b4a); de-heat pre-flight 39a846d landed as 9ff40e6; P-036 amendment SIGNED; user T-031 #3: blind swipe original vs st6-rb2 now, wave-2 timing lift.**
  - **P-036** (F3 G, fix-nav-morph) amendment SIGNED by the lead 23:25Z: first attempt void (opening heat check failed:
    hero-none f2cef11cb363, moving gaps p50 17 / p95 29 ms, 37.8 °C, after a devicectl Safari restart, load1 18.4);
    C1 V1 V2 VOID. Re-run: one uncounted warm-up of the heat-check page on its port before the opening check (A3),
    quiet Mac (--require-quiet or the runner's own --no-timing hold), cooling §5.3, a failed opening check stops the
    script, a second failure on a cool phone + quiet Mac stops the block for a page check by fix-nav-morph. Scoring
    unchanged. UPDATE on the P-036 row; fix-nav-morph passed condition + stop rule to iphone-runner.
  - **User T-031 #3 (23:27Z):** (a) YES, blind swipe test original vs st6-rb2 now; iphone-runner runs it before the
    P-036 re-run (T-017), P-036 moves ~15 min. (b) YES, one full phone timing run of wave 2 once built and checked:
    a scoped timing lift for the wave-2 build only; timing stays deferred elsewhere. PROGRESS: both in upcoming
    (item best-stack) + one user line. Phone order now: blind swipe st6-rb2 → F3 P-036 re-run → P-068 heat (~2 h)
    → X1 stage 2 only with the user's lift; wave-2 timing run when the build is checked.
  - **I-074 "Try it" live:** console restarted 23:25Z, PR-007 live entry set (option full, patch 221a60aa94cb); user told
    in T-028 #5. **ts-i076 spawned** for I-076 (npm test 293 s vs the 300 s cap) + I-072 (fixture orphans), board row
    i076. Board: i063-sim parked (I-071 not a bug, optional hardening uncommitted); phone-heat waits on iphone-runner.
  - Usage 23:27Z: window 23.5 M units, last 30 min 11.0 M; top main, de-heat, mgmt-ops-7, de-countdown, ts-i074.
- **23:2xZ (batch) c7ecacd..253720a landed 23:03Z; S7 GAIN landed (6571b62); I-074 resolved; F3 P-036 G running; A1 re-read PASS.**
  - Landed: 47b38a0 (**I-074 RESOLVED**: "Try it" in console proposals, original and PoC side by side), **6571b62 S7 /
    P-067 scored Gain** (phone S, 20 s idle at the top, 8/8 valid, heat checks 60.2/58.3 and 60.2/57.7): idle >34 V
    0,0,0,0 vs C 22,19,27,24, separated, not threshold-sensitive; ticks >34 V 0/152 vs C 103/152; guard scroll >50
    median V 0.5 vs C 1 (no regression). PROGRESS hero-carousel: landed/L, P-067 first in best[], check, gate, next;
    user line (the user also has it in T-027 #8).
  - **I-075** (phone heat tooling) in its land test; de-heat's pre-flight line 39a846d lands after it. **I-076 OPEN**:
    npm test wall time 285 s, close to the shared lane's 300 s cap.
  - **F3 P-036 G block started 23:05Z** (iphone-runner). Then P-068 heat (~2 h), then X1 stage 2 only with the user's lift.
  - **X1 amendment A1** (8163838, x1.mjs 5d0c9e4c41db) re-read **PASS** (rendered-opacity product per update, non-numbers
    skipped and counted, zeroAt + chain dumps, cv auxiliary, ticksInWindow >= 3, instrument check op > 0 at rest in
    both arms; outcomes: stale V digit at op > 0 -> (iv) stands; all stale at op 0 -> explained; none -> lead). Gap
    closed by the lead before scoring: **C stale in any update -> no decision, chain dump to the lead.** Notes: op reads
    opacity only (errs toward the code); one session, n = 1.
  - Ops was pinned 23:13Z (re-pinned by its own message to de-countdown); lead fallback if pinned at a check-in: ops
    writes the batch as a diff + message to scratchpad/mgmt-ops/batch-<HHMM>.{diff,msg}, the lead applies it.
- **23:0xZ (batch) P-068 landed in full (e9dcfce, 08b7978, 98da974, 172d61e); X1 stage 1 scored, lead decisions.**
  - **P-068 reads closed (mgmt-ops-7):** ddc74d6 / 98da974 fallback fix PASS (attempt per segment, last attempt scored,
    `findLast` picks the end-of-session re-run, fallback gate TIMEOUT -> incomplete, exclusion over 0-360 s, user's
    80 % limit confirmed T-029 #8); 172d61e attempt marker PASS (heat.mjs d1ec5c5345f7; a gate timeout before any
    attempt-2 segment scores incomplete; 8th synthetic check). heat.check.mjs read, not run by ops (de-heat: 8/8).
    Runs after F3 (~2 h, 2 sessions); iphone-runner takes it from the README on main. **I-075** (tool, non-blocking):
    battery logger, power keys in BATTERY_KEYS, skip of the Mac-side served-hash GETs on non-mirror pages (ts-i075 has
    not replied to de-heat); rule: arm A uses a skip only if it lands before session 1, H2 keeps H1's tooling.
  - **X1 stage 1 readout 754e79e (de-countdown), ops second read:** trigger and outcome applied as pre-registered:
    (i), (iii), (iv) hold -> no phone stage, back to the code. Hits: face layers 80 -> 24 (2/2), total layers 54 (edge),
    pastHero ratios 0.41-0.47, rAF 0.96/1.09, exit-opacity 0 at heroExit. Misses: face memory V/C 1.0, C repaints face
    layers too, S3 0/-10, heroExit Layout 0.96/0.98, S6 V not live at the first update at y 0 (falsifier met as written;
    the 2 stale updates are at --exit-opacity 0).
  - **Lead decisions on X1 (23:0xZ):** (a) the x1.mjs change after the void session 1 (smooth scroll; 9de230198cf8 ->
    9a6f3f9ed143; no window, count or rule changed) ACCEPTED, lead signs; (b) the missing per-window tick count is added
    in the re-run; (c) (iii) ACCEPTED as page-driven, a signed post-data deviation (view-sized Layouts equal in both
    arms; the clock's digit Paints 80 -> 0); **(iv) NOT accepted yet:** one more Simulator session with the rendered
    opacity fixed, under a pre-registered amendment (ops re-reads it): clock visible with a stale digit -> back to the
    code; opacity 0 in every stale update -> explained. If (iv) is explained, only (i) remains and the lead asks the
    user for the stage-2 timing lift.
  - **New user thread T-030: GPU/compositor-only CSS for animations.** de-gpu researches it in research/gpu-props/:
    a Chrome vs WebKit reference table with status words, an audit of every animation on the page, the top 3-5
    candidates. No phone, no timing.
- **22:5xZ 1153c70 landed (main tip). P-068 amendment 56636f8 re-read: NEEDS-WORK (fallback scoring); lead holds 4bf2319+56636f8.**
  - Amendment (de-heat, heat.mjs 341a774801ae): every arm "held" (on the cable, not charging; state read 22:42Z, 80 %);
    `heat.mjs charge-wait` gate before each segment (<= 20 min); one non-held read excludes the segment, re-run last;
    fallback = a whole session "charging"; a verdict needs both sessions in one charge state. X = "landed fixes without
    the countdown fix" (X2 later); ops' H1/H2 line in. apple.com Mac-side GETs accepted, tracked in **I-075**.
  - Held path, X wording, I-075: PASS. **Fallback path NEEDS-WORK:** (1) verdicts() builds a session's charge mode from
    all its segments, so a fallback session (aborted held segments "kept but not used" + charging restart) always reads
    held+charging -> "incomplete"; (2) `get()` takes the first match, i.e. an aborted held segment over the charging
    re-run; (3) no outcome pre-registered for a fallback gate TIMEOUT (likely at an 80 % limit). Asked: an attempt
    number per segment, score only the last attempt, a synthetic one-restart test, a TIMEOUT rule. Minor: say the
    exclusion counts all samples 0-360 s. Ops re-reads only those lines when de-heat sends the sha.
- **22:4xZ (batch) 626783b landed; P-065 closed (531b254); P-068 heat ticket read PASS; phone order set.**
  - Landed: 626783b (ops), f2d71fd (X1 stage 2 needs the user's timing lift; a trigger goes to the lead), 3534e51 (S7
    C vs V pixel check: bottom 0 px; 0.54 % vs baseline common to both arms, phase), **531b254 P-065 Block 1 scored:**
    word alone 0 frames >34/>50 in every run; full page 4-8 >34 in the 'you' windows, separated, twins agree (the rest
    of the page brings them); Block 2 skipped by rules 2/3 before any data; **topic closes, keep the SVG.** PROGRESS
    illusion-proposals next + P-065 check updated.
  - **P-068 second read (mgmt-ops-7) PASS** on 4bf2319 (de-heat; row between P-067 and P-069; heat.mjs 38f81442ccad):
    arms F floor / A apple.com live (iphone-air fallback pre-set) / B baseline / X st6-rb2; H1 F A B X, H2 X B A F;
    6-min segments, slope over 60-360 s corrected to 37.0 °C (k 0.045/min); verdicts need both sessions; charging
    segments excluded (one re-run), user's charging setting recorded; phone settings fixed; VOID rules; no device ids
    in output; nothing of apple.com committed. Ops asked for one line: the X swap (st6-rb2 + countdown-faces) decided
    and logged before H1's first segment. **Lead: charging, X wording and the Mac-side apple.com fetches are still being
    settled with de-heat; the lead lands 4bf2319 with those fixes.**
  - **Phone order (lead):** S7 (P-067) -> F3 P-036 G -> **P-068 heat (2 sessions, ~1 h each)** -> X1 stage 2 only with the
    user's timing lift. The user was told "after S7 and F3" (T-029 #6).
- **22:3xZ (batch, b) 2d2555c landed; P-069 / X1 second read PASS; X1 stage 2 is a timing decision (needs the user's lift).**
  - **P-069 second read (mgmt-ops-7) PASS** on d7449c4 (de-countdown branch, row after P-067): V copy
    out/countdown-faces/snap-x1/poc JS 638b8e03e81c (read-only), x1.mjs 9de230198cf8. Settled pre-data: (a) stage-2
    trigger exact ("above" = both V sessions beyond both C sessions; an S2 hit, or S3 alone, opens stage 2; (iii)
    pastHero/heroExit ratio > 0.8 and (iv) a failed resume check take precedence: back to the code, no phone);
    (b) per-run exclusive-ms sum per 4-tick window, range and median over 4 runs, separated = 4 vs 4 with a >= 4 ms gap,
    no twins on ms sums; (c) stage 1 counts only: hashes match, >= 3 ticks per window, exit-opacity 0 at heroExit, else
    redone once; (d) stage 2 Timeline-OFF S heat checks at open and end, attribution runs after (§5.2).
  - **Lead decision:** X1 stage 2 is NOT attribution: its ms comparison decides whether the 3-face part lands, so it
    is a timing decision and needs the user's lift; the lead asks in the console only if stage 1 triggers it.
    de-countdown adds that line to the ticket and routes any trigger to the lead. **Stage 1 may start now.**
  - Ops rule (lead): wherever ops is resumed, commit only in .claude/worktrees/mgmt-ops-2 with `git -C`.
- **22:3xZ (a) bc90d7a + a553980 landed (ff); no real LAN address left outside site*/ (lead's grep). PROGRESS goal line: heat goal added as CONDITIONAL** (the user framed it "if my assumption is right"): smooth scrolling; and, if P-068 shows Fastwork heats the phone more than apple.com, less work at rest. **When P-068 has a result: make it firm or drop it.**
  - **P-069 = de-countdown, countdown-faces X1 segment card** (pre-data; stage 1 Simulator mechanism, 2 sessions, shared
    lane weight simulator; stage 2 short phone Timeline block only if a stage-1 WebKit cost question stays open, queued
    after S7 and F3). Ops asked for exact wording on: the stage-2 trigger, the P1/P2 statistic, stage-1 validity, the
    stage-2 Timeline-OFF sentinels. Second read when the row sha arrives. Next free P-070.
- **22:2xZ (batch, b) d637310 landed (7945951); S7 on main; I-073 RESOLVED; LAN scrub bc90d7a; new goal: phone heat (T-029 #4); P-068 = de-heat.**
  - Landed: 7945951 (ops batch), 0066608 + 2182886 (S7 / P-067 ticket, pre-data), 5f37fcb (I-073 LAN resolver +
    placeholder `lan-host`, CLAUDE.md edit with the user's OK; I-073 RESOLVED).
  - **LAN scrub (lead's job, ops commit bc90d7a):** the Mac's LAN address replaced by `lan-host` (tools/lib/iphone-url.mjs
    LAN_HOST) in 236 committed `fixes/iphone-wave2/raw/*.json` files (240 occurrences, href/host fields). Deterministic
    byte replacement; every file parses as JSON; reverting the replacement restores the exact bytes. Nothing hashes the
    raw files; the offline readers morph-clock-replay.mjs and unknowns-ux-metric.mjs print identical output before and
    after. The only other LAN-style addresses in tracked files outside site*/ are fake test addresses (tests/, research/architecture,
    README.md example): left as they are. Git history still holds the old bytes (local only, never pushed, rule 2).
  - **User direction (T-029 #4, scrubbed): phone heat and energy (less work at rest, a cooler phone) becomes a goal next
    to smoothness.** de-heat (research/phone-heat/) writes the ticket, Fastwork vs apple.com. **Every fix reports
    "work at rest" from now on.**
  - **P-068 = de-heat**, phone-heat ticket (pre-data, row on its branch; second read by ops before any phone queue).
- **22:2xZ (batch) fwreskip dropped; user lifts the timing hold for st6 + F3 (T-027 #5); P-067 = S7; P-036 G re-read PASS; PR-007 accepted; I-073 landing, I-074 open.**
  - Landed: ed43bd0 (ops), 3e2ebe8 (fwreskip G2 scored: band >50 0 vs 0, >34 0 vs 0, No gain -> (B); P-064 filled),
    cf95b03 + 3c67f93 + 6890fe5 (countdown-faces PoC, round 2, review r2 notes).
  - **fwreskip DROPPED** (G2 no gain; user told T-027 #7). PROGRESS: state dropped, why, P-064 check.
  - **User asked for 2 more high-gain fixes (T-027 #3):** the lead picked hero-carousel st6 and f3-arm-scope; the user
    lifted the timing hold for those two only (T-027 #5, 21:57Z). **Phone queue:** P-065 word-alone Blocks 1-2, then
    st6 (S7, P-067, fix-scroll-engine), then F3 P-036 G (fix-nav-morph), then F3's blind swipe. PROGRESS next fields
    and the upcoming row updated.
  - **P-067 = fix-scroll-engine, phone ticket S7** (f328be1, pre-data): C = st6-rb2 − st6 (JS 0144d2cd032a, CSS
    add63ff17fb7) vs V = st6-rb2 (7bf7c4657d21 / f523598b2a24, = main's st6-rb2 row), S driver `--idle 20`,
    C V V C C V V C, primary idle dt>34/>50 sums; scorer st6score.py 7a8fed7fb4c3. **Second read (mgmt-ops-7) PASS
    with 2 notes, to settle before data:** (1) Gain = V's >34 sum at least 2 below C's is a thin margin against a
    predicted C 32-100 vs V 0-8 summed: add per-run separation (every V run below every C run) as the condition or the
    confidence label, or keep sums knowingly; (2) the guard row's statistic ("median per run") needs exact wording.
    Hashes of the 4 served files and the scorer checked on disk (read-only copies). **Both settled pre-data in
    feeef69** (re-read PASS): Gain = (a) every V run's idle >34 below every C run's AND (b) sum margin >= 2 AND (c) V >50
    sum <= C's, twins per part; new falsifier "any V run reaches the lowest C run"; guard = per-arm median over 4 runs,
    V <= C + 1. Scorer now 772ef9e0e8a4 (checked on disk); A1 per run C 3,2,4 vs NB 0,0,0, separated.
  - **P-036 G re-read PASS** (fix-nav-morph, ticket to iphone-runner 22:0xZ after T-027 #5): UPDATE line added to the
    P-036 row in fixes/PREDICTIONS.md, plus fix-nav-morph's pre-data Simulator check (105c977, OBSERVED): V makes every
    first touchmove cancelable (Z1 C 0/4 vs V 4/4), so the expectation is revised to Z1 V FLAGGED or WORSE possible,
    Z2 overlap, Z3 overlap; the rule is unchanged.
  - **countdown-faces:** round 2 (3c67f93) replaced the replay with an always-running hidden spring, exact by
    construction (0 of 295 frames differ); busy-time "28-40 %" withdrawn, now 764-815 ms lower per 6 s (n=1).
    **PR-007 ACCEPTED, option "full" (22:08:59Z)**; parked until a phone segment card (X1) ticket.
  - **I-073** (LAN resolver + placeholder, CLAUDE.md edit with the user's OK T-026 #5): ts-i073, landing now.
    **I-074 OPEN** (user T-028): a "Try it" panel with live original vs PoC iframes in proposals; ts-i074 building.
  - **Lead list, scrub job (local-only hygiene):** ts-i073 reports 236 committed `fixes/iphone-wave2/raw/*.json` files
    that still hold the Mac's raw LAN address (never pushed, rule 2; Hard rule 12 says it should not be committed).
- **21:4xZ (batch) 5678f13 landed (ts-i063 follow-up); phone back (T-025), ioscap first run C-025 PASSED; Wi-Fi reconnect (T-026) voids G2 runs; countdown-faces NEEDS-WORK; I-072 open.**
  - Landed: cb2a3c8 (ops) and **5678f13** (ts-i063 follow-up, review-i063 ACCEPT; npm test on main 1286/1286 in the
    shared lane 21:21-21:25Z). ts-i063's I-071 check.chrome hardening is still staged in its worktree and waits for
    an awake Mac.
  - **countdown-faces 97317db: review-countdown-faces NEEDS-WORK**, 3 blocking: (a) the resume pixel proof is
    frame-aligned by the harness (lead decision: make the replay exact, anchored to the frame grid); (b) a one-frame
    hop after an instant jump (IO timing); (c) the overlap with topic #1 countdown-idle-raf is not documented.
    de-countdown is fixing them; its T-024 #6 progress went to the user.
  - **Phone reconnected by the user (T-025, 21:28Z).** ioscap built (selftest 29/29, Apple Development signing).
    **First run C-025 PASSED:** opened only "iOS Device", refused 0; the user confirmed the camera light stayed OFF
    (T-025 #4). The recording ran 17 s past the user's Done because the lead messaged agents first; disclosed in
    T-025 #3.
  - **Wi-Fi reconnect (T-026, ~21:40Z):** the Mac's LAN address changed. G2 runs around it are void; iphone-runner
    restarts its servers and re-runs G2 from the warm-ups. CLAUDE.md's example LAN URL (Shared devices block) is
    stale; ops proposed an address-free wording to the lead (a CLAUDE.md edit asks the user).
  - **I-072 OPEN (non-blocking):** the WDA e2e tests left 3 fake-xcodebuild/fake-iproxy orphans for 14 h; the lead
    killed them. ts-i063: sim-warm can't cause it.
  - Phone order: G2 (fwreskip, P-064), then P-065 word-alone Blocks 1-2 (de-illusion-style sent the arm letters).
  - Usage ~8.8 % at 21:37Z (lead's estimate). PROGRESS: fwreskip and illusion-proposals `next` now say the phone is back.
- **19:1xZ (batch) I-071 not-a-bug; ts-i063 follow-up blocked by Mac sleep cycling; de-countdown measuring.**
  - a66dfd4 landed (ops). Nothing else on main since 17:15Z.
  - **I-071 RESOLVED not-a-bug:** the 15:52Z test:chrome failure was an Idle Sleep. test:chrome passed 13/13 on
    a66dfd4 at 17:38Z, run under caffeinate as a measurement.
  - **ts-i063's follow-up commit is blocked:** since ~17:30Z the Mac cycles DarkWake / Maintenance Sleep, so the
    pre-commit npm test can't finish (the T8+ display/wake test failed mid-sleep). It retries when the Mac stays awake.
  - **de-countdown** holds chrome-measure since 19:11Z for its pixel diffs and isolated-page counts.
  - Usage at 19:13Z: about 2.9 % of the window (lead's estimate).
- **16:4xZ I-063 + I-069 landed (0aa2227); test:chrome failed -> I-071 (P1); Mac sleeping since 16:09Z.**
  - Landed 0aa2227: I-063 (859776b, da5de60, e35f0b4; **MEASUREMENT CODE**: lib/lock.mjs gate, verify, bench) and
    I-069; npm test 1282/1282; both RESOLVED. Sim users get warm reuse after a rebase.
  - **test:chrome failed:** check.chrome (no check.json) at 15:52Z; then the Mac's Maintenance Sleep (15:53-16:08Z)
    cancelled the rest. `--short` holds get no caffeinate since I-070. **I-071 opened (P1, ts-i063):** bisect 9135b35
    vs 0aa2227. The lead repaired the stale chrome-measure last-grant record again.
  - **pmset since 16:08Z** (ops read, local log): DarkWake 16:08:33Z, Sleep ('Maintenance Sleep') 16:09:27Z, DarkWake
    16:24:27Z, Sleep ('Sleep Service Back to Sleep') 16:25:11Z, DarkWake 16:40:15Z. No full Wake: the Mac has been
    asleep since 16:09Z apart from ~1-min DarkWakes every ~15 min (dasd SleepService wake requests). It slept again
    16:41-16:56Z: ops stalled mid-check-in (the lead's watchdog fired) and a pmset read hung until the wake. Sleeps the
    lead counts this hour: 15:53-16:08, 16:25-16:40, 16:41-16:56Z.
  - **T-024 #5** (de-countdown census, to the user): 2 countdowns x 80 faces roll in 4 hidden states, ~20-40 % of
    main-thread busy at 6x (n=1, OBSERVED). The PoC is built and being measured.
  - **CLAUDE.md suggestion (later, lead/user-owned; ops does not edit it):** document the warm Simulator
    (`FW_SIM_IDLE_SEC`, default 600 s, keeper shutdown on idle or a queued timing hold) and that keep-awake applies
    only to measurement holds (I-070: timing holds, phone parts, Sim sessions; not `--short`/shared jobs).
- **15:5xZ image-size null write-up landed (909464c); fix-image-size done.** fixes/image-size/README.md + the P-066
  outcome row; findings F-134 and F-135 posted. PROGRESS image-size writeup path added. ts-i063 rebases I-063 onto
  0de8103 and fixes n1-n3; I-069 after. de-countdown (T-024) is researching.
- **15:4xZ P-066 RETRACTED (falsified); image-size dropped; I-070 resolved; I-063 re-review accepted; T-024 ->
  de-countdown.**
  - **Correction to 15:1xZ:** fix-image-size retracted the P-066 HIT. With more sessions the within-session A/A of the
    Sim images-category peak is 6.6, 14.0 and 29.1 MB, so -14.5 / -17.1 MB is inside the noise: **FALSIFIED at the
    metric's resolution** (no detectable saving). PR-006 withdrawn (a draft, never shown to the user). image-size is
    dropped with a null write-up (land request from fix-image-size; PROGRESS gets its writeup path once that lands).
    PROGRESS image-size: state dropped, why + P-066 check read "no detectable memory saving, dropped"; the 15:20Z
    changes[] line rewritten.
  - **I-070 RESOLVED** (0de8103, npm test 1264/1264 on main): keep the Mac awake only during measurements (timing
    holds, phone parts, Sim sessions).
  - **I-063 re-review ACCEPT-WITH-NOTES;** ts-i063 rebases onto I-070 and fixes n1-n3 before landing.
  - **T-024** (the user's countdown request) -> new agent **de-countdown**, topic countdown-faces, board priority #1;
    it uses the user's apple.com off-screen-pause reference.
- **15:1xZ (batch) Flakes landed; user answers C-024 / PR-005 / T-023; P-066 HIT; I-069, I-070.**
  - Landed: ddfbc8c (ops), dc5651c (I-065 bdc2e04 + I-066; npm test 1257/1257; both RESOLVED), 8df1413 (fwreskip
    README, the PR-005 decision).
  - **C-024:** "Keep awake only during measurements" -> I-070 opened, ts-i070 spawned. It found I-026 already
    caffeinates every hold and queue waiter; I-070 narrows that to measurement holds with `caffeinate -i -s` (-i alone is
    useless in DarkWake, IOPMLib.h CONFIRMED).
  - **PR-005: C** (park and re-test; G2 when the phone is back; P-064 stays open). PROGRESS fwreskip next updated.
  - **T-023: "no, thanks"** (no Playwright WebKit experiment).
  - **I-069** (P2): sim safari-restart on a restored data: tab never lands; triaged to ts-i063 after its I-063 round.
  - **P-066 HIT** (Sim peak decoded-image memory): -14.5 / -17.1 MB vs A/A 6.6 MB, n=2, OBSERVED. fix-image-size drafts
    a 3-option proposal for the lead's review. PROGRESS image-size: state testing, stage V, owner fix-image-size, P-066
    check added.
- **14:4xZ (batch) review-i063 verdicts; 5th Mac sleep; Sim runs across a sleep are void.**
  - The Mac idle-slept again 14:21-14:36Z (5 sleeps since 12:27Z, each ~15-16 min). fix-image-size stalled again; the
    lead resumed it. **Rule (lead): any Simulator run that spans a sleep is void.** The lead repaired chrome-measure's
    last-grant record again after that sleep (audited).
  - **review-i063:** 8eab8ba (I-065) and 99b37b3 (I-066) ACCEPT-WITH-NOTES. 3a85564 (I-063) NEEDS-WORK: B1 a failed
    shutdown is counted as done; B2 verify and bench measure beside a booted Simulator when the backstop fails.
    ts-i063 splits the accepted two onto branch `ts-i063/flakes` to land first, then a fix round on I-063 and a re-review.
  - Still unanswered by the user: C-024 (keep the Mac awake), PR-005, T-023 #3.
- **14:1xZ (batch) Mac slept again; fix-image-size resumed; lock record repaired.**
  - The Mac idle-slept again 14:01-14:17Z (C-024, the caffeinate question, is still unanswered).
  - fix-image-size stalled (watchdog); the lead resumed it. Its first Sim session (P-066) started 14:18Z, shared w3 +
    the simulator lock; the P-066 row was committed pre-data (5107519) before it.
  - The lead repaired the stale chrome-measure last-grant record (`lock.mjs repair`, audited).
  - Still unanswered by the user: C-024, PR-005 (fwreskip, rev 1), T-023 #3.
- **13:4xZ (batch) ts-i063 batch in review; I-068 not-a-bug (Mac idle sleep); C-024 caffeinate question.**
  - **ts-i063 batch** on worktree-agent-afa5d960a2fe5d5e8: 3a85564, 8eab8ba, 99b37b3 (not landed). I-063: a functional
    sim session keeps fw-sim warm for FW_SIM_IDLE_SEC (default 600 s); a keeper shuts it down when idle or as soon as a
    timing hold is queued; verify.mjs and bench shut down a leftover warm device before the first run (MEASUREMENT
    CODE: host.simWarm; call out for A/B comparability, test:chrome after landing). I-065: three flakes fixed at the
    root (1 ms clock drift in console/proposal; a serve auto-port collision with the console's 5559). I-066: a sparse
    worktree's leftover site*/ no longer shadows the baseline. **review-i063** (read-only fix-reviewer) is reviewing it.
    After landing, Sim users (fix-scroll-engine, de-illusion-style, fix-image-size) rebase to get warm reuse.
  - **I-068 RESOLVED as not-a-bug:** the Mac idle-slept 12:55-13:11Z (also 12:27-12:43Z and 13:12-13:28Z), so the
    thread wait overran. The lead posted console **C-024** (pending): keep the Mac awake with `caffeinate -i` for 4 h?
  - PR-005 (fwreskip) is still proposed rev 1; T-023 still waits on the user.
- **13:0xZ (batch) P-066 row filed pre-data; bbdf5b8 landed (lead, ff).**
  - fix-image-size committed the P-066 row on worktree-agent-af756241c686d490e (5107519, one line in PREDICTIONS.md,
    checked by ops), before any Sim session; it rides its land request. Gaps closed: ~0 = |delta| within the A/A spread,
    or < 3 MB without an A/A; outcomes: [-25, -3] in both sessions = hit; ~0 = falsified, park; beyond the A/A spread
    but above -3 = miss low, lead decides, no extra session; < -25 = miss high (good, land-eligible, lesson logged);
    > ~0 = drop; sessions disagree = report both, no third without the lead; driver Sim functional, "Simulator MB are
    structure only, never a phone gain". Overlay id c5391b3e6971 (45 files). It sends the measured line after it lands.
  - **Land rule (lead 13:0xZ):** an idle ops can't wake itself for a 30-min window. When a task ends, send the land
    request with the hand-back if the batch is older than 30 min; otherwise the lead picks it up at the next check-in.
- **12:4xZ (batch) P-066 issued to fix-image-size; fbe149f landed.**
  - **P-066** (fix-image-size, card received 12:3xZ): image-size (48 raster files replaced at the same URL, markup
    unchanged) vs baseline; Sim functional sessions (no timing), A B | B A over 2 sessions, + A/A if it fits; metric
    Web Inspector Memory "images" (peak, end), layers, total, WebContent RSS, bytes, pixels. Predicted images delta
    -3 to -25 MB (point ~-5 MB; WebKit's async decode at drawn size for large images, CONFIRMED for WebKit main, may
    already shrink the large-image share). Falsified if ~0 or positive. Decision: in interval -> land as memory
    insurance; ~0 -> park; worse -> drop. Ops asked for three pre-data fixes: a fixed ~0 fallback without an A/A
    (e.g. |delta| < 3 MB), outcomes for a delta between the A/A spread and -3 MB and beyond -25 MB, and "Sim MB =
    structure only" in the row. The row goes on its own branch, pre-data, before its first Sim session (none yet at
    12:44Z: its holds so far were shared weight-1 and one 2 s --no-timing).
- **12:3xZ a3abc07 landed (the lead rebased the batch on ecd4f88); PR-005 posted; T-023 answered.** Corrections to the
  12:2xZ digest:
  - **fwreskip: PR-005 posted** after the lead's review (A ship / B drop, recommended / C park + re-test).
    fix-scroll-engine waits on the user. PROGRESS fwreskip next updated.
  - **ecd4f88 landed:** de-illusion-style's phone-off results plus F-132: on Chrome the 'you' draw is about 15 % of its
    own cost; the rest is the full page's per-frame cost pulled up to 60 fps; Layerize 311 ms per draw (OBSERVED,
    Chrome). PROGRESS illusion-proposals next/whyNot updated (word-alone picked, phone test on hold).
  - **T-023 answered** (T-023 #3, waits on the user): Safari on the Mac can't stand in for timing; it can do WebKit
    mechanism counts. Lead recommends a small experiment with the cached Playwright WebKit build (no user step); the
    alternative, real Safari through safaridriver, needs `sudo safaridriver --enable` from the user once.
  - **de-safari-mac and iphone-runner are done.**
  - Land rule now: a land request only when something changes PROGRESS, or after 30 min.
- **12:1xZ-b (batch) Lead decisions on the parked list; fix-image-size spawned; peer directory refreshed.**
  - **image-size started:** fix-image-size (worktree). Gate: Chrome pixels, Simulator decoded memory (counts only) and
    bytes; no timing. The lead fast-paths D. Expect a PREDICTIONS row request from it (next free P-066).
  - **Stay parked:** anim-transform, re-keep-op, cdwc, f3-arm-scope, blur-cubic, the wi-stack Sim spot check (low value
    without the phone; the Mac lane is busy with the Simulator). r4-v3's Chrome check is parked too (fix-scene-scope
    isn't running); the lead revisits if the Mac lane goes idle.
  - Peer directory rewritten to this session's live agents; the 10-01 rows were removed (in git history).
  - **ts-i063** spawned 12:05Z: owns I-063 (Simulator stays booted between sessions, idle shutdown) and I-065 (both
    flakes), in two separate commits; both incidents now status fixing.
- **12:1xZ (batch) No-phone plan posted (lead, T-022 #4, 11:55Z); phone released 11:56Z; T-023 opened.**
  - **On hold until the phone returns:** P-065 word-alone (2 blocks), G2 (P-064), the ioscap first run (hardening done).
  - **Now (Chrome/Sim only, no timing tests):** de-illusion-style: Sim tlcounts FP vs WA, then the 1 % pixel cause,
    then the Chrome call tree. fix-scroll-engine: Sim step 3 (S vs T on st6-rb), then an A/B/C proposal recommending
    (B) drop fwreskip (the lead reviews the draft first; it rests on older-build phone data). st6-rb2: nothing pending.
  - **iphone-runner parked**; T-009 partial curve (40 reads 11:13-11:55Z, on external power, label cool-t009-c1end):
    38.9 -> 37.1 (+6 min) -> 35.7 (+13) -> 34.6 (+20) -> 33.8 (+26) -> 33.0 (+38) -> 32.9 C (+42); rates 0.24 / 0.16 /
    0.09 / 0.05 C/min per 10-min band; not flat by the rule; floor ~33 C; 10 min cools ~2.4 C from 38.9, so
    `phone-temp --below auto` ends inside its 10-min cap when the last passing sentinel ran at >= 37 C; targets under
    ~34 need >= 25 min, under ~33.3 may never end (OBSERVED). It pre-builds the P-065 scripts.
  - wi-stack done (best-stack done; optional Sim check of the F-129 spots avatars +is-sliding / commission +entering,
    HC vs S6, structure only, if the lead assigns it; a second C1 block parked). fix-scene-scope done (r4-v3's Chrome
    check needs no phone if assigned; its panel-driver phone test parked).
  - **T-023** (user idea: Safari on the Mac as an iPhone stand-in): de-safari-mac (read-only researcher) is on it.
  - **I-065** covers both flakes (the proposal test and console.test.mjs:274), P3.
  - **Parked fixes without the phone** (ops note to the lead): image-size fully doable (Sim/Instruments memory + pixels,
    no phone gate; unowned); anim-transform partly (Chrome pixels + Sim structure; gain needs the phone); re-keep-op,
    cdwc, f3-arm-scope little (mechanisms CONFIRMED or Chrome done; their gates are phone/G/finger); blur-cubic no
    (not applied, GPU cost).
- **12:0xZ (batch) PHONE DISCONNECTED (user T-022, 11:53Z); 661c744 landed; I-064 resolved (11bc722).**
  - The user is disconnecting the iPhone and asked the team to revise its plans. The phone queue (G2, the ioscap first
    run, word-alone Blocks 1-2) is ON HOLD. iphone-runner stops T-009 and releases the phone. The lead asked
    fix-scroll-engine and de-illusion-style for no-phone plans; ops collects a one-screen "revised plan without the
    phone" (message to the lead, not a commit).
  - I-065 (flaky unit tests) gets a second flake: console.test.mjs:274 (I-059 B attempts), a millisecond-boundary endedAt.
- **11:5xZ st6-rb2 landed (cff1a03, 11:49:57Z); PROGRESS build updated; I-065 open.**
  - PROGRESS build: name "st6-rb2: the wave-1 base plus seven fixes", since 11:49:57Z, same 8 ids (style-recalc now in
    its final RBi40pti form); summary caveat "the same fixes as before with the final version of the style fix; checked
    by mechanism and pixels, not timed on the phone as a whole". The build has no writeup field (schema): fixes/st6-rb2/
    README.md is cited in style-recalc's details. style-recalc got its first best[]: the T-011 switch layout 17-23 ms ->
    gone (OBSERVED, W, P-061, attribution only). changes[] line added.
  - I-064 landed in two rounds (8ec1c6d, 11bc722) with the user's YES (T-019) to deleting the old recorder.
  - P-065 (word-alone, two blocks) landed as 60e6c85.
  - **I-065 open** (not blocking): a flaky proposal unit test (ops saw test:unit 624/1 once at 11:5xZ, 625/0 on rerun).
  - G2 is next on the phone after T-009.
- **11:4xZ-b (batch) I-064 round 1 landed; st6-rb2 checks ran; P-065 to word-alone; phone order.**
  - **I-064 round 1 landed as 8ec1c6d** (ioscap F2-F5). The user said YES in T-019 to deleting the old recorder. The
    lead's npm test on main 8ec1c6d ran; round 2 (ts-i064: no frame viewing, wrappers unwrapped, asks on the wrapper
    scripts) is on main as 11bc722. I-064 stays open (the lead resolves) and blocks the ioscap first run until then.
  - **st6-rb2:** its Sim and pixel checks ran at 11:38Z (result not yet reported to ops); PROGRESS build unchanged
    until it lands.
  - **P-065** = de-illusion-style, word-alone (PR-004). The lead approved the ticket split into two blocks: Block 1
    isolation (FP vs WA-C, 8 runs); Block 2 the arms alone (WA-C / WA-F2 / WA-B, 9 runs).
  - **Phone order after T-009:** G2 (P-064), then the ioscap user step (once I-064 round 2 lands), then word-alone
    Block 1, then Block 2.
- **11:4xZ (batch) scene-scope and fwreskip landed; st6-rb2 restack planned.**
  - **scene-scope landed as 1ce70e8 (11:2xZ):** the review wording fixes plus finding F-130. PROGRESS: style-recalc is
    now state landed, stage L; P-061 added to its checks (T-011: the switch RS's view-rooted nested Layout, 17-23 ms per
    crossing in C, gone in all 4 V runs; nothing moved into the window after it; OBSERVED, W driver). No best[] entry yet:
    the build still carries RB, and RBi40pti joins it only with st6-rb2.
  - **fwreskip landed as 491f2ce** (with d00815a, a7526e0): G2 (P-064) is pre-registered on main with the amended gain
    line; P-060 measured (rest arm hit; no-pause arm misses "after the mark >= 3/4", >50 3/4 but >54 0/4,
    threshold-sensitive; ratio n/a; lesson: the timer fires at the start of the rest). iphone-runner runs G2 after T-009.
    PITFALL for PREDICTIONS.md conflicts (fix-scroll-engine): suffixed ids (P-056a/b/c) are easy to drop on rebase; check
    them after any conflict.
  - **st6-rb2 restack** (lead decision): HC with RB replaced by RBi40pti (40 #platform selectors and one gate line),
    nothing else different. Accepted by mechanism: fix.mjs check, pixels against HC with an A/A, and a Sim W check of
    both mechanisms, before G2's counted runs or after G2. When it lands, PROGRESS build becomes st6-rb2 with the caveat
    "accepted by mechanism and pixels, not timed on the phone as a stack" (and style-recalc gets its T-011 best[] entry).
    Do not change PROGRESS build before that land.
  - **Batch rule (lead):** one land request when st6-rb2 lands (it changes PROGRESS) or at about 12:00Z, whichever first.
- **11:5xZ G2 second read signed (lead 11:25Z, one amendment); 45a104b landed.** Correction to 11:4xZ: G2 no longer
  waits on the lead. Amendment: Gain needs V's >50 count in band + hold at least 2 lower than C's over the 4 runs per
  arm, with (ii) (V's >34 <= C's) still holding. Verdicts are checked in the order Gain -> Mixed -> No gain; a
  threshold-sensitive result counts as not Gain. fix-scroll-engine commits the amended ticket, then sends it to
  iphone-runner. **Phone order:** T-009 (running), then G2 (P2-1+P5), unless I-064 lands first (then the ioscap
  first-run console step goes before G2), then word-alone (de-illusion-style).
- **11:4xZ I-042 phone check done from G1b data; P-064 issued (G2); P-060 measured.**
  - **I-042 phone check** (iphone-runner, from G1b's data, no block of its own): G strokes play faithfully within
    ±10 % on a quiet Mac. 23 G runs (16 counted, 4 warm-ups, 3 voided); the 20 kept runs have 160 strokes, all 8/8
    delivered, +1.5 to +10.5 % against the planned contact time (median +4.7 %); every stroke ran long, none short or
    dropped; only one over +10 % (an uncounted warm-up, +10.5 %). The 3 voided runs (+12.5, +13.0 % at Mac load1 26-62;
    +11.0 % at load1 12.5 falling to ~7) were re-run valid at load1 6-7. The overshoot grows with Mac load (OBSERVED in
    our setup, cause unknown; likely Mac-side driver timing, not checked). Notes stay in iphone-runner's worktree
    (out/iphone-runner/i042-phone-check.md, not committed).
  - **P-064** = fix-scroll-engine, phone ticket G2 (P2-1): V = S6P2b (st6-rb + fwreskip P2b, JS ad7f029e43c6) vs C = S6
    (JS 59b23b3f57fd), CSS d22542d0b5f8 both; W driver 2600 -> 3400, hold 3 s; counts >50 / >34 (+ twins) in the band
    y [2950, 3250] and the 3 s hold. Predicted no gain (C band max <= 38 ms in >= 3/4; band >50 0-1 per arm; V's hold
    >= 1 frame >34 in >= 3/4). Falsified if C's band has >= 2 frames >50 over 4 runs that V lacks. Decision: (A) only
    if V has fewer >50 in band + hold AND V's >34 <= C's; otherwise (B) drop fwreskip (mixed: (B) with the trade shown
    to the user). Ticket draft: fwreskip README "Phone ticket G2" at 1e845ee, awaiting the lead's second read; not queued.
    The row lives on fix-scroll-engine's branch until it lands (like P-057, P-060).
  - **P-060 measured** (G1b, fwreskip README "G1b result"): rest arm all hit (flip before the mark 4/4; no long fling
    frame; idle un-skip frame >34 4/4, >50 2/4 (55, 54) vs B 0/4; falsifier (c) not triggered). No-pause arm: the
    un-skip still fired in idle 4/4 (the WDA fling starts ~800 ms after its mark, so "inside the fling" can't be tested
    with G); frames 54/44/51/54 vs B 15-18: >50 3/4, >54 0/4, threshold-sensitive. Lesson: the pair forms during the
    last stroke, so the timer fires at the start of the rest (the ticket's "between strokes" guess was wrong).
  - iphone-runner also confirms: G1b no-pause block done 10:33Z (data to fix-scroll-engine); T-011 done 10:58Z; C1
    done 11:12Z; T-009 cooling curve running.
- **11:3xZ C1 confirmed (81dbc9b); shell-hold-c in the best build; I-064 open.**
  - **C1** (wi-stack, scored on iphone-runner's block, 8/8 runs valid): spot (c) frame S6 37 -> HC 17 ms (median, 4 runs each,
    no overlap); the reveal and scroll guards hold; P-063 hit. Caveat: the page-wide scroll >34 count is unchanged (8 vs
    7.5). It removes one slow frame at spot (c) and does not lower the page-wide count. PROGRESS: new item shell-hold-c
    (inBuild, writeup fixes/shell-hold-c/README.md, that caveat) and added to build.fixes.
  - **I-064 open** (blocks the ioscap first run): review-ioscap rated the recorder SAFE WITH FIXES; ts-i064 closes
    F2-F5 (an old unhardened recorder still tracked in research/; Photo Booth and FaceTime not denied; `open -a ioscap`
    skips the lease and the first-run ask; a rebuild keeps the Camera grant).
  - **Phone order now:** P2-1+P5 (fix-scroll-engine), then word-alone (de-illusion-style); the ioscap first-run console
    step slots in when I-064 lands.
- **11:2xZ Corrections from the lead (the 11:1xZ digest was behind); caa3c68 landed.**
  - I-060 and I-061 were resolved at 10:44Z. I-062 is resolved (4df8bb2, npm test 1149/1149 on main); its first run is
    still gated on review-ioscap and the user's console step. I-063 stays open.
  - **PR-004 ACCEPTED** by the user at 11:15:14Z: rev 3, option word-alone. de-illusion-style is building it.
  - **C1 done** at 11:12Z: 8 valid runs; quick read HC fn 16-17 vs S6 36-40 (OBSERVED, not scored). wi-stack is scoring it.
  - **I-042 phone check dropped**: G1b's stroke-gate data covers it; iphone-runner sends ops the write-up.
  - **T-011 review: LAND WITH FIXES** (re-scored exactly); fix-scene-scope is doing the wording fixes.
  - **Phone order after T-009:** user console steps (the ioscap first run), then P2-1+P5 (fix-scroll-engine), then
    word-alone (de-illusion-style).
- **11:1xZ T-011 scored; C1 running; I-062 landed; I-063 open; PR-004 rev 3.** Landed since 10:49Z: ca408c4 + ead9159
  (PROGRESS /build: st6-rb with 7 items, pin-clamp item, scene-scope retitle), 39786a2/71934c1/9b1e574/4df8bb2 (I-062
  ioscap), the illusion-accent-frames series f91dd4e..36a28b1 (de-illusion-style).
  - **T-011 scored** (fix-scene-scope): P-061 a/b/d PASS; in review.
  - **C1 running** (iphone-runner, wi-stack ticket, signed 10:4xZ). Then the **P5 Sim hold** after C1, then T-009 (cooling
    curve; the phone-queue row showed a T-009 battery read at 11:13Z), I-042.
  - **I-062 landed** (tools/ioscap.mjs, a hardened recorder that can only open the iOS screen device; enforcement denies
    other recording routes and asks on its first run). The first run is gated on review-ioscap and a console step for
    the user. NO CAMERA holds.
  - **I-063 open** (tool): sim.mjs session always cold-boots the Simulator (load1 60-70 for ~1 min), and a shared hold
    (<= 300 s) cannot keep a device booted across holds.
  - **PR-004 rev 3 posted** (de-illusion-style, 36a28b1): "did we measure the word alone? (no), and how to do it",
    4 options; waits on the user.
- **10:4xZ C1 signed; G1b voids; 7d14ed0 landed 10:16Z.**
  - **Phone order (lead 10:4xZ):** G1b (running) -> T-011 -> **C1** -> T-009 -> I-042.
  - **C1** (wi-stack, shell-hold-c "A + shrink hold", 366e693, P-063 pre-data): S6 = st6-rb (snap-a/st6rb, JS
    59b23b3f57fd / CSS d22542d0b5f8) vs HC (snap-c/hc, 59b23b3f57fd / a3b34c3a3920); hashes re-checked by
    mgmt-ops-7, both copies read-only; S driver, 8 runs S6 HC HC S6 S6 HC HC S6, ~25 min + cooling. **Signed by the
    lead 10:4xZ** with 4 amendments (wi-stack writes them into the README and P-063): ±4 ms twins and near-band
    flags; every S6 run is a sentinel, phone-temp --below auto, at most 2 blocks; a 1440 DOM geometry probe before
    the land request (not before the phone run); a no-effect result reads "THREADED_ANIMATIONS UNRESOLVED", not refuted.
  - **G1b stroke-gate voids:** no-pause arm 6 of 8 valid; runs 6P2b and 8B voided by the ±10 % stroke-fidelity gate
    (+12.5 / +13.0 % off plan) and re-run by iphone-runner (the gate works as registered).
  - **PITFALL (mgmt-ops, 10:3xZ):** when a peer's SendMessage resumes mgmt-ops, mgmt-ops runs pinned to that peer's
    worktree and the harness refuses git in `.claude/worktrees/mgmt-ops-2`. Peers send ops requests anyway, and expect
    ops to batch the docs commits until the lead resumes it. From a lead resume, use `git -C <abs worktree>`, never cd.
    **Lead rule (10-02 22:4xZ, after 626783b):** when pinned, do the read-only work (second reads), reply to the peer and
    queue the commit; the lead resumes ops from main at check-ins to commit. Never work around the guard.
- **10:1xZ A1 done, I-059 resolved, G1b running.** Main: a2c15e7 (ops docs), 62b4053 (I-059 B "Start over";
  I-059 RESOLVED; console restarted 10:00Z), wi-stack series 94b8010..e7d2de2.
  - **PR-003 A CONFIRMED on the phone** (A1, wi-stack): #people frame 2 median NB 44 vs C 42 vs V 74 ms, idle gain kept,
    P-062 HIT. Landed as st6-rb (df04a4a build with the scene-arm will-change selector, e7d2de2 results). B: WebKit source
    refutes the filter-extent hypothesis (f4a7600); B pixel gate next (Sim only).
  - **G1b is running on the phone now** (iphone-runner; fix-scroll-engine be4c331). Then T-011, T-009, I-042.
  - **PR-004** (PR-001 follow-up, de-illusion-style): rev 2 = phone test report + 4 next-step options; WAITING ON THE USER.
  - **T-019 #18**: the user asked for a hardened Mac-side iPhone screen recorder. de-iphone-screenrec researches (docs
    only); a toolsmith follows; the first run needs the user's OK. NO CAMERA still holds until then.
  - **I-060** (ts-i060, open): progress page "Right now" shows only who holds a device, not the job or the fix (user
    T-020). ts-i060's full npm test ran in the shared lane at 10:12Z.
- **09:4xZ (later) C-021/C-023 DEFERRED by the user** (T-019 #9, 09:43:56Z: make the test easier first).
  - iphone-runner stops the retry and returns to the queue: block B attribution -> A1 -> G1b -> T-011 -> T-009 -> I-042.
    It writes a grooming note for the next try: the user only starts and stops the recording; the phone plays everything.
  - PR-001 rev 3 ("keep" recommended) no longer waits on the recording: de-illusion-style drafts it now, the lead reviews.
  - I-059 still lands first (before any new recording step).
- **09:4xZ I-059 open; C-023 retry.** c393993 landed.
  - I-059 (tool, open, ts-i059): the console let the user tap Done on a part the runner ends itself (C-021 part 2
    marked done 5 s after start). The user accepted "retry entire process" for retriable steps (T-019 #7): ts-i059
    builds (A) runner-ended parts + a minimal (B) "Start over".
  - C-023 (retry of C-021, the user's own screen recording) hit the same Done bug at part 2 (09:42:24Z);
    iphone-runner drives part 2 itself. Phone lease iphone-runner; then block B attribution, A1, G1b, T-011, T-009, I-042.
  - fix-scroll-engine 918af20 + 1f39750: P2b inside the same-build B-A spread in Sim time spent; P2-1 re-run planned
    on RB + st6-rb once PR-003 A lands.
- **09:3xZ (later) PR-001 block B DONE; route (b) approved.** dc7ceb8 landed.
  - Block B (C V B): 9/9 valid, sentinels passed. P-058 overall: no arm beats the SVG on the phone (rule 4). F1/F3
    freeze mid-stroke; V reaches the end of only 67 % of draws (its own start-detection bug); F2 and B are eligible
    but not better. PR-001 rev 3 adds a "keep" option and recommends it (de-illusion-style drafts, the lead reviews).
  - The user APPROVED visual route (b) (T-018 #11): C-021, the user's own iPhone screen recording, 4 parts, ACTIVE.
    No Mac camera; NO CAMERA still holds.
  - Phone order now: C-021 (user step, first) -> block B attribution -> A1 (PR-003 A) -> G1b -> T-011 -> T-009 -> I-042.
  - PR-003 change wait dropped: the lead's thread wait wakes on every proposal decision event (I-045).
  - PROGRESS illusion-proposals: next = second round done, a final "keep" proposal after the recording check.
- **09:3xZ I-056 LANDED on main d2d77ad** (lead's npm test 1037/1037 in the main checkout) and RESOLVED: phone runs no
  longer wait for shared groups; `--require-quiet` opts in to waiting. Open incidents: none. The lead confirmed A1's
  slot to iphone-runner (after PR-001 block B).
  - **Visual route (b): WAITING ON THE USER.** The lead posted the plan in T-018 #10 (an ask, ~8 min of the user's time,
    right after block B if the user agrees). Nothing is recorded until the user agrees; NO CAMERA holds.
- **09:2xZ second reads, both PASS.**
  - **G1b** (fix-scroll-engine be4c331 on worktree-agent-a1722cf5058e25591): stroke-fidelity gate ±10 % in run
    validity, ~15 min per block (~40 min for 2 with phone-temp cooling), P-060 "Amended pre-data 10-02 09:16Z" naming P2b
    JS b4ff6ec56cc2 / snap-g1b2. Hashes re-checked: snap-g1b2/P2b JS b4ff6ec56cc2, B JS dbd5fdb4f1fb.
  - **A1** (wi-stack 1ad3a61 on worktree-agent-a93135040e12a061d, rebased on cc2a029): PR-003 A ticket, C = RB
    (snap-s5/best dbd5fdb4f1fb / 0d7dfc79e703), V = stack5 (59b23b3f57fd / 6e09b2c708fa), NB = RB+st6 (snap-loo/noblur
    59b23b3f57fd / e9603231b413). All hashes match. S driver, Timeline off, warm-up per port, open/end sentinels plus every
    counted C run, Latin square C V NB · V NB C · NB C V (9 runs), ~30 min, decision per row, P-062 pre-data. Note for
    the runner: log load1 and battery temperature per run (A4).
  - B research plan (B1 will-change: filter, B2 no overlap-compositing of the 4 hidden profile shells) is in the
    same commit: Sim + pixel only until A1 is done.
- **09:1xZ takeover.** mgmt-ops-7 took the `ops` row; rebased on main cc2a029 (mgmt-ops-6's final commit, LANDED).
  - **PR-003 DECIDED 09:12:55Z**: accepted, option A (drop-blur: RB + st6, no blur-cubic). User note, paraphrased: wants
    to know B's (prepromote) performance too; apply A first, research B in parallel at lower priority.
    Lead plan: wi-stack writes A's phone ticket (C = today's best / stack5 / RB+st6, P-062 pre-data), mgmt-ops
    second-reads it; wi-stack also owns B research (Sim + pixel identity only, no phone until A is done);
    fix-scroll-engine adds st6's selector to RB's will-change list (coupling). PROGRESS best-stack updated.
    Re-arm on a changed decision: `console.mjs proposal wait PR-003 --until changed --since 2026-10-02T09:12:55.131Z`.
  - **Phone order (lead 09:1xZ, replaces mgmt-ops-6's):** (1) PR-001 block B (iphone-runner, running, no recordings);
    (2) PR-003 A block (wi-stack); (3) G1b (fix-scroll-engine); (4) T-011; (5) T-009 curve; (6) I-042 check.
    Posted user steps still jump the queue (T-017).
  - **G1b second read**: d57b9a1 PASS pending one commit with (i) stroke-fidelity gate in run validity (G run void if
    any stroke > ±10 % off plan), (ii) minutes per block, (iii) dated pre-data P-060 amendment naming P2b JS
    b4ff6ec56cc2 / snap-g1b2. No commit after d57b9a1 yet on worktree-agent-a1722cf5058e25591 (asked 09:1xZ).
  - **I-056 lands now** (lead resolves): phone runs no longer wait for shared groups; `--require-quiet` opts in.
  - **Visual route**: the user picked route (b) in T-018 #8 (the user's OWN iPhone Screen Recording, started by the
    user). de-illusion-style + iphone-runner write the plan for the lead; nothing is recorded until the lead has asked
    the user and the user agrees. NO CAMERA stays the top rule.

## START HERE, mgmt-ops-7 (written by mgmt-ops-6, 10-02 09:0xZ; the dated log below has the detail)

mgmt-ops-6 FINAL (09:1xZ, ~60 % context): main carries every ops commit up to this one. G1b second read (d57b9a1)
PASS with one pre-data fix asked: add the lead's stroke-fidelity gate (G run void if any stroke > ±10 % off plan) to its
run validity; cosmetic: minutes per block, a dated P-060 amendment naming P2b b4ff6ec56cc2 / snap-g1b2. Check the
owner's next commit for these before G1b takes the phone. Then any rerun of T-011 or P-058.
Board rows `ops`, `phone-queue`, `fwreskip`, `best-stack` and `phone-stack-test` are current as of 09:0xZ.

- **Top rules, newest first.**
  - NO CAMERA (T-018): no QuickTime movie recording, no camera capture API, no camera device listing. Recordings are
    suspended until the user approves a route. The session log is kept as evidence (user T-018 #5, 09:02Z; not deleted).
  - User steps first, with an ack `--message` at every change (T-017).
  - Every wait sets its board row first (T-016, CLAUDE.md feb5936).
  - Phone cooling = `wait.mjs phone-temp --below auto`.
  - Quiet window for S/W/M = preferred, not blocking.
  - Timing stays deferred, except PR-001 (phone) and the finished stack test.
- **Phone order** (lead 09:1xZ). Posted user steps jump the queue. Then:
  (1) PR-001 block B (iphone-runner; no recordings; not gated);
  (2) G1b (fix-scroll-engine d57b9a1, snap-g1b2 P2b JS b4ff6ec56cc2; second read PASS pending the stroke-fidelity line);
  (3) PR-003 option A's block, if the user picks A;
  (4) T-011 (fix-scene-scope RBi40pti, 06d2290; it has ended, the lead resumes it);
  (5) T-009 curve;
  (6) I-042 check.
  The visual look at the PR-001 winner and any capture route WAIT ON THE USER. The lead posts these in T-018 together
  with the ioscap account (iphone-runner's old AVFoundation capture binary from 10-01; sent in T-018 #7) and the options:
  (a) USB screenshots, (b) the user's own phone screen recording, (c) drop.
- **Top investigation (T-017).** stack5's remaining lag.
  - wi-stack built a files-only map: #people frame 2 is the only V regression, and the Sim leave-one-out puts it on
    blur-cubic (OBSERVED).
  - wi-stack posts ONE proposal with options A/B/C. Zero spawns for it; parked stays parked.
- **Live agents (this session).** main (lead), iphone-runner, wi-stack, de-illusion-style, fix-scroll-engine,
  ts-i056 (I-056 a-d), review-fwreskip-3, and the I-058 toolsmith (I-058 is resolved).
  - Ended: fix-scene-scope (done until T-011), ts-i054, ts-i053 (once I-053/055/057 resolved).
  - Directory rows below that are older than 10-02 06:00Z are unverified.
- **Open incidents.** I-056 only (ts-i056). I-053/054/055/057/058 are resolved.
- **P-ids.** (P-059 wi-stack, P-060 fix-scroll-engine G1b, P-061 fix-scene-scope T-011,
  P-062 wi-stack A1, P-063 wi-stack C1, P-064 fix-scroll-engine G2, P-065 de-illusion-style word-alone, P-066 fix-image-size image-size, P-067 fix-scroll-engine S7 st6, P-068 de-heat phone heat, P-069 de-countdown X1): next free P-070.
- **Mechanics.**
  - PROGRESS.json: targeted Python replacement; the old JSON string must match exactly once. next/gate ≤ 300 chars,
    details ≤ 600. Bump `updatedAt` to the real `date -u`, never ahead.
  - LAND request: branch@sha, rebased, clean, test:unit count, progress --check, LAN grep 0.
  - Batching (lead 10-02 11:5xZ): batch handover-only entries; at most one land request per ~30 min. Send one at
    once only when it changes PROGRESS.json or something the user sees. Idle ops can't wake for a window (lead
    13:0xZ): at the end of a task, send the land request with the hand-back if the batch is older than 30 min.
  - Second reads: hashes (shasum the snapshot files), one control, driver, warm-up RUN per port, sentinel (every
    control in a non-Timeline block), minutes, P-row committed pre-data.

## USER DIRECTION 19:27Z (standing; overrides any older plan below)

1. Performance TIMING is DEFERRED: no new timing A/Bs (`fix.mjs ab` gain runs, bench timing), no phone gain/fps blocks.
   Parked: P-033, P-038, P12, P10, P5, P9; G blocks P-032/P-036 wait too (I-042 tool work continues).
2. The work: (a) Chrome call tree (which functions/work, how often), style/layout counts, invalidation and layout roots,
   layer counts; (b) Safari layout/rendering: Timeline records (style, layout, paint, composite), roots, nested layouts;
   no fps verdicts. Simulator wherever its records match the phone (de-counts-sim decides); phone = attribution only.
3. Chrome -> 3 agents in parallel via ts-lock-share's shared lane (lead lands it first); until then exclusive lock,
   holds short and counts-only (short lane where possible).
4. Phone queue: scene-scope attribution block (nested Layout count at the platform flip) -> st5 split attribution
   (fix-scroll-engine: C, st5, st5-noanim, st5-waapi, V1). Tickets: attribution only, second read as before.
6. Cooling (lead 19:56Z): attribution-only phone blocks skip the fixed 10-min cooling; the Timeline-OFF heat sentinel
   (start + end) decides, a failing one = cooling + redo. Cooling = `node tools/wait.mjs phone-temp --below auto` (<=10 min,
   protocol §5.3, user T-009), never a fixed `wait.mjs time` (lead 08:2xZ, user T-016; fixes/LEAD.md "Timing deferred").
7. USER (console T-001, 20:24Z): "slow frames on the phone are dominated by layout" tasks are HIGHEST priority. Board
   (lead): style-recalc #1, fwreskip #1, r4-v3 #2, hero-carousel #2 (slide-start whole-page layout), count-checks #3
   (Sim-vs-phone verdict gates moving the root hunt off the phone). Phone/Sim order: LAYOUT ROOT HUNT tickets
   (fix-scene-scope H1-H4, fwReskip, morph start) first after the running st5 split; any other phone ticket that would
   delay them is deferred. Timing stays deferred; lock-share stays the top Chrome tooling item.
8. Sim structure holds (lead 20:3xZ, until the user lifts the timing deferral): Simulator attribution holds that read
   records for STRUCTURE only (record kinds, nested-layout counts, roots, initiators; no ms claims) take a `--no-timing`
   normal hold: `lock.mjs run chrome-measure --owner <x> --no-timing --max-seconds 420 -- node tools/sim.mjs session …`
   (lib/sim.mjs holdGate accepts it). Why: the user's own apps closed the host gate (load1 ~15-17), up to 600 s idle per
   gated hold. Sim ms from such holds is host-uncontrolled. The Sim refuses the short lane.
9. Root-hunt owners (lead 20:3xZ): F-108 page-wide background dirtier, then the morph start -> fix-scroll-engine; the
   #platform switch + fwReskip root hunt and RB -> fix-scene-scope. Short-lane order: ts-lock-share, ts-proposals, rest.
5. Every agent keeps its status-board row matching. Broadcast to all 13 live agents 19:3xZ (mgmt-ops-6).
   Priority order (lead 19:1xZ): style recalc > illusion proposals > phone-tool fixes > st5 > tooling.

## How mgmt-ops-3 worked (keep doing this)

- Wait in the foreground with `sh <scratchpad>/mgmt-ops/tick.sh 300` (returns on a lock-holder or incident change; Bash
  timeout 500000). No background monitors. Never end a turn with background work running.
- Messages to agents resume them if they ended; that is fine for GOs. Iphone requests: message `iphone-runner` directly
  for scripted checks (lead OK 07:25Z); finger tests only via the lead. The lead lands, resolves, reorders, spawns.
- Every docs commit: rebase on main, `npm run test:unit`, commit, then a "LAND BATCH" message with the sha(s).
- NO CAMERA, TOP RULE (user T-018, 08:49Z; user privacy): no agent opens QuickTime movie recording, any camera
  capture API, or a camera device listing. Phone RECORDINGS ARE SUSPENDED until the user approves a route that never
  touches the Mac camera. G1b uses in-page flash detection only. Tell every agent that touches the phone.
- USER STEPS FIRST (user T-017, 08:29Z): a posted console step the user waits on (swipe pair, finger test) takes the
  phone next, ahead of any measurement block; never gated on cooling or a Mac-quiet hold; its recordings are evidence
  only (log the load). Post a step only when the phone is free for it. Every agent running a step acks each change with
  a plain one-line `--message` (doing what, ETA) so the user can follow it on the step page (T-017 08:31Z).
- WAITS (lead 08:2xZ, user T-016): every wait sets its board row first (`status.mjs set <id> --state waiting
  --waiting-on …`). No fixed `wait.mjs time` without a reason on the board; phone cooling is `wait.mjs phone-temp`. I-058
  (tool, open): waits will post their reason to the board themselves.
- Quote goal progress as frames > 50 / > 34 ms (Chrome, within ONE hold) and iPhone numbers; > 34 ms varies ±2 across
  holds. Success is judged on the iPhone under a finger first (user decision 08:04Z).
- **Standing lead policy (lead-retrospective-24h.md §5, c220e82; lead 19:1xZ):** (1) two-speed loop: inner =
  deterministic counts (Chrome headless in parallel + WebKit counts from the Simulator, validated against existing phone
  pairs); outer = one phone block only for candidates that pass the counts; finger tests only for stacked builds
  (de-counts-chrome + de-counts-sim, then a toolsmith). (2) Size the team to the devices: at most 2 timing-measuring
  agents at once; tool builds and full `npm test` batched into windows outside phone blocks; load1 on the status board.
  (3) Root-cause hardware faults at the source after the first repeat; ask the user about the setup first (other
  inspectors, other apps on the phone, Low Power Mode). (4) Fix budget >= 50 % of agent-hours on fix topics, split shown
  on the status board; state the cost of every side request to the user before starting it. (5) Design spike on the
  page's engine (C6): one researcher, counts only. (6) Shrink CLAUDE.md to hard rules + pointers. (7) Honest goal check:
  a full-scroll phone block of B vs baseline (>50 / >34, fps) once scene-scope lands, recorded in the retrospective's
  successor §1. Parked by this policy (19:1xZ): anim-transform (ranks 5-6), image-size (7) until scene-scope and R4+V3
  have a phone result.
- **Status board (ts-status-board, pending land; seed research/architecture/status-board-seed.json, the lead applies
  it):** mgmt-ops owns item `ops` (state coordinating); refresh rows whose owner ended (`node tools/status.mjs set <id>
  --by mgmt-ops-N --state … --note …`), nudge owners of rows flagged "not updated" (2 h, no queue place or console step),
  seed new workstreams (`set <id> --kind … --title … --state …`); `status.mjs list` replaces "Who waits on what".
- **Phone vs Simulator (user standing rule, lead 17:5xZ):** a job that needs an iPhone but no performance number runs
  on the iOS Simulator (tool mechanism checks, WDA/gesture compile tests, inspector-connection bugs, safari-restart,
  page-state/DOM checks, script dry runs), in a normal chrome-measure hold (sim.mjs, <= ~7 min). The phone is only for
  timing and perception: S/W/M/G blocks, sentinels, Timeline attribution, F finger tests, user sittings. F-084 holds:
  Simulator timing is never a verdict. Route new tickets by this before they reach the phone queue.

## Digest log (newest first, 5 lines each)

- **22:1xZ IPHONE UNPLUGGED by the user (T-011).** PHONE BACKLOG, run in this order when it is plugged back in:
  (a) the rest of the cooldown curve (ts-phone-cool, `wait.mjs phone-temp`); (b) scene-scope's ST ticket; (c) the fwreskip
  candidate; (d) ts-gesture's G run with the compiler v2 hashes (finger-protocol-v1 ee84ebd4e916, slow-drag-v1 5bd9f52ed38e; I-042 fix f16c65b, npm test 960/960; sim.mjs gesture is timed = normal hold); (e) the morph start (parked); (f) PR-001 WebKit frame capture on the phone (lead 23:4xZ; Sim frames first).
  Also landed: 6ff7dd4 usage.mjs (T-010; the lead runs it every 30 min and posts to T-010), fdb2577/8c3187e phone-temp.
  Open: I-042, I-045, I-046 (check.chrome screen size), I-047 (phone park between blocks), I-048 (shared readers hidden).
  Lead corrections 22:1xZ: I-042 resolves on the lead's npm test on main (shared lane), not on the phone G run, which is
  backlog (d) only; I-048 owner ts-progress-lane; ts-lock-share's exclusive hold moved to the back; scene-scope merges its two queue entries.
  Land requests to expect and pass on: ts-lock-share (2116109 docs + I-046), ts-proposal-watch (I-045), ts-phone-park (I-047), cal-headless60.
  iphone-runner §4v/§4w landed 211f923.
  22:2xZ: 4a903b2 (ts-lock-share shared-lane docs) landed. USER PRIORITY T-006 #5 (22:26Z): PR-001 (de-illusion-style, hero accent
  draw/erase frames) is the top of the testing lane: lead moved it to #1 in chrome-measure, board priority 1. Whenever
  de-illusion-style requeues, tell the lead at once so it moves the entry to the front. P-036 row: G on compiler v2 only (d72ee13644cc).
  22:4xZ: 866ea63 and fd23ed0 (I-045 proposal decision events wake every wait) landed. USER RULE T-006 (PR-001 lesson,
  AGENT_ROLES item 8): a changes-requested decision is the spec for the next revision of the SAME proposal: read it in
  full (`proposal show`), relay it verbatim, answer with `proposal revise <id>` quoting the request first and answering
  each point; arms not asked for go only under "also tried, not chosen", never as new proposals. PR-001 rev 2 = frames/
  video only (de-illusion-style); A/B arms are no longer posted. Accent containment result (de-illusion-style, Chrome):
  contain: layout size gives a 0-px diff on all 14 draws; its canvas-frames arm's first diff failed (alignment being
  fixed); a Sim F-108 run comes next. I-049 (lead, 22:44Z): shared readers starve behind later exclusive holds.
  Lead corrections 22:4xZ: containment is NOT a candidate. It is pixel-identical on Chrome, but WebKit source REFUTES it as a
  Safari fix (the svg is already a layout boundary; the full layout comes from 3 dirty svg roots in one frame,
  de-illusion-style 22:34Z): never present contain to the user. ts-lock-share's docs landed as 4a903b2 (rebased from 2116109);
  only I-046 is pending from it, then I-049 (owner ts-lock-share). fix-nav-morph steps out of the queue until the shared
  group runs (I-049 workaround): if it is still queued when the exclusive holder releases, tell the lead.
  22:5xZ-23:0xZ: lead's npm test on main 969/969 (22:54Z): I-042 and I-045 RESOLVED. 6ac64ae (cal-headless60, T-008 headless
  Chrome at 60 Hz) landed. de-illusion-style requeues often (short shared jobs): each time, tell the lead.
  Lock settings (lead): the shared lane stays at cap 4 (ts-lock-share batch 2); timing stays exclusive, cap 1 (from
  cal-headless60's parallel A/A). The headless-60 Hz mode proposal is parked until the user wants timing work back.
  23:4xZ: landed I-047 (72a7eb9, 5ad847c), I-046 (d00ee9a, MEASUREMENT CODE, headless only), I-048 (9fd2d3a), I-049
  (212059d: no later exclusive passes an earlier reader, 10 min reader age bound, head-of-line bypass); lead's npm test
  986/986, chrome:fn 6/6. I-046..I-049 RESOLVED (rebase). Open: I-050 only (stale Sim Safari tab, ts-phone-park).
  Correction: de-illusion-style's r10 "58/58 identical after handback" is INVALID (blank captures); the real figure is r11:
  421/436 frames identical in Chrome headless, 15 frames of one word open. Decision (lead): PR-001 frames must be
  WebKit-made: Sim frames first, the phone capture joins the phone backlog as (f).
  23:5xZ: PR-001 r12 (OBSERVED, Chrome headless): frames 436/436 identical ('you' and the Korean word); scroll sequence
  68/72 identical, 0 BLANK, ink floor 500; the 4 misses are off-grid t rows. The lead has NOT accepted "test artifact": a
  rAF-phase check (WebKit elapsed mod atlas step) is added to Sim d2. fix-nav-morph's Sim hold failed again (23:38Z: the
  dead stale tab doesn't answer Runtime.evaluate): blocked on I-050 (ts-phone-park, its top item). A mixed-version
  lock wait left Chrome free ~4 min (23:34-23:38Z); it cleared within the bound; ts-lock-share records it in lane §10.
  00:0xZ: cbc7975 (lane capacity cap 3 vs 4, T-008; live mixed-version wait) landed. I-051 owner ts-lock-share after its
  batch 3: measure the Sim boot cost first, then recommend keeping fw-sim booted between sessions, joins on CPU busy
  instead of load1, or accepting it; coordinate the sim.mjs change with ts-phone-park, which lands I-050 first.
  scene-scope: ST (RB + rotator-st6) NOT pixel-identical in Chrome: will-change:transform blurs the avatars by up to
  72/255 (≤2/255 without the transform); Sim checks pending, ST not signed. I4/I40 recommendation SIGNED: RBi lands
  first (after a pixel A/B on tools ≥d00ee9a and a phone ticket); I40 held until a Sim RBi40 count.
  fwreskip: [WITHDRAWN 00:4xZ, probe artifact, see below] "stale layout state in #profile-showcase/#people, cleared by
  re-creating its children". Usage: ~34 % ESTIMATE at 23:53Z, ~60 % expected by the 02:20Z reset.
  00:1xZ: I-050 landed (7fa4251), RESOLVED; only I-051 open. SIM PITFALL (standing): Safari can serve stale immutable
  CSS/JS across reused ports, so every Sim arm server runs with --no-cache and its server log shows a GET check
  (de-illusion-style finding; lead alerted scene-scope, fwreskip, nav-morph). PR-001 Safari copy: half the mismatch was
  that stale CSS, half a real half-device-px placement blur in WebKit; a sweep is next.
  I-052 (F-115, owner ts-phone-park): Sim Safari keeps cached immutable assets per origin and --no-cache does not evict
  them. Workaround: a never-seen port per session plus the overlay GET count; the fix makes every Sim session start with
  an empty Safari cache. Earlier cache-on Sim arm results are VOID (PR-001's d1 orig captures stand). PR-001 v2
  (OBSERVED, Sim): the canvas moves out of the hero-copy layer, because of a half-device-px resample inside it. Queue
  (lead 00:2xZ): PR-001 v2 Sim hold first, fix-nav-morph right after (~00:27Z); flag only if it has not started by
  00:32Z. A shared slot running while an exclusive waiter sits at the host gate pass window is by design.
  00:3xZ nav-morph/cdwc: fix-nav-morph FINISHED. P-032 Sim mechanism re-check clean (counts only, compiler v2
  ee84ebd4e916, 2 runs: exactly 2 forward tweens per run as registered, every push/dwell move prevented, no one-move
  flicks; t0 lag 10-19 ms OBSERVED, Sim). Committed 3ac33c5 + e7a9522 on worktree-agent-a277ea00c8773c1ea; lands with
  the topic's review. cdwc row parked until timing returns. STROKE-FIDELITY GATE (lead decision 00:3xZ, registered before any phone data): phone G/F runs are void when any stroke's contact time is more than ±10 % off plan (symmetric); Simulator runs are never scored, so exempt; a block that voids runs at +10-20 % keeps the rule; a change needs a new registration before the next block. Why: the phone's
  measured overshoot (+4 to +8 %, ts-gesture) passes; loosening to +20 % on Simulator data alone would be post hoc.
  WHOEVER RESUMES THE PHONE BLOCK (backlog (d)/(e), P-032/P-036) APPLIES THIS GATE.
  fix-nav-morph done: the gate is in fixes/mw10e-cdwc/README.md (26de4ad, on top of 3ac33c5 + 66f5f9f + e7a9522, not
  rebased); its scorer exempts Sim records. Nothing queued; it lands with the topic's review.
  00:4xZ fwreskip CORRECTION (fix-scroll-engine, lead): the r6-r9 "stale layout state in #profile-showcase/#people, cured
  by re-creating its children" is WITHDRAWN: a probe artifact (hiding the shells shrank #people across our own fwFar
  re-skip edge, so fwReskip deferred it). Revised claim, OBSERVED in our setup (Sim): each containment flip (y2988 hero
  deferred, y3047 platform-card will-change) costs ~20 ms only while #people (1327 px) is still rendered; its own re-skip
  comes only at ~y3539. Next r11 localizes the box; then fix choice (a) re-skip #people no later than the hero or (b) a
  structural change in #profile. No build until the lead has seen it.
  00:5xZ fwreskip: r11/r12 found the box: the whole rendered profile deck relays out (~20 ms, OBSERVED, Sim); deferring
  #people with its correct size gives ~1-2 ms on the Sim (attribution, not a gain). Lead SIGNED option (a1h): when the
  hero far re-skips, also re-skip the next inactive deferRendering section wholly above the viewport and keep it skipped
  until the hero un-skips (keeps today's hysteresis; our own scroll-engine code, offscreen only). Before landing:
  geometry, A/A pixels in Chrome and Sim, Sim W Layout ≤3 ms at 2988/3047, jumps with no blank frame, a deck swipe
  count check; no timing A/B. PROGRESS must not promise a speed-up.
  I-051 (ts-lock-share): building option (b), a CPU-busy join check, plus a "handing over to X (gated: reason)" status
  line; (a) keep fw-sim booted is REJECTED; the timing-gate candidate is deferred until timing resumes.
  01:1xZ: I-052 landed (85ad9a0): every sim session empties Safari's HTTP cache at boot, so the never-seen-port-per-arm
  rule is no longer needed ACROSS sessions (it supersedes the 00:2xZ workaround). WITHIN a session, check the server-log
  GETs or `sim.mjs fetched`; a transferSize of 300 does not prove a network fetch (OBSERVED).
  01:4xZ scene-scope: review of RBi40 (8690486) NEEDS-WORK. The V1i one-shot cut changes reachable frames (at <=600 px
  the hero scroll-cue copy-in after a reload while scrolled or a bfcache restore; the accent stroke paused mid-way on a
  fling); the pixel checks were phase-blind and missed #platform (y>=4082); mechanism and regression checks are missing
  for the landing build. Decision: build RBi40p (cut only the #platform-internal one-shots + tracks + will-change
  classes; keep the hero/people/commission/nav/sb-* entries), then re-review; no user-acceptance route. PROGRESS: no
  "byte-identical" wording for scene-scope until then. PR-001: the w00 1-ms atlas is built; its first Sim parity run
  failed 1/130 (likely a test-hook artefact), re-run queued. ESTIMATES: 7 words ~2.3 MB WebP, ~31 MB decoded; rev 2
  must show decode timing and a cost/benefit table.
  02:0xZ: I-051 RESOLVED (dd02aac CPU-busy join, 47bdb2d hand-over line, 42ca964 docs §12; npm test on main
  1002/1002). NO incidents open. ts-lock-share and ts-phone-park done; iphone-runner (a7696771) done and parked (the
  fwreskip phone check waits for the phone). PR-001: Sim arm parity run 3 PASSED, 71/71 in and out byte-identical
  (OBSERVED, Sim 26.5), whole-CSS-px canvas placement; the GPU-process canvas default is CONFIRMED in source, whether the
  shipping build uses it is UNRESOLVED; sim-counts next. The illusion-proposals PROGRESS line no longer cites the Chrome
  436/436: the canvas is Safari-only (whole-ms clock, CONFIRMED in WebKit source), Chrome keeps the SVG.
  review-fwreskip on 6fd09a6: NEEDS-WORK. B1 Chrome one-frame #people placeholder after an instant jump from the band
  ~[3659, 3892] (C11 queued un-skip); B2 short reversal not run; B3 no idle triple; B4 scenarios list incomplete. Lead:
  no waiver; fix-scroll-engine builds variant (a): synchronous un-skip of the fwWith partner in the rE scroll listener
  within ~1 vh, rule restricted to the hero's partner; reruns the jump checks with controls n>=5, the Sim reversal and
  the idle triple; re-review. 3959e8f (docs) may ride along. User told (T-005), with a correction: the lead's "settled
  pixels identical" was too strong.
  02:1xZ PR-001 CORRECTION (de-illusion-style): real-time FAILURE on WebKit (OBSERVED, Sim, Timeline off, 50 s at y0).
  Each canvas draw runs only 2-8 rAF ticks, then no rAF until the 900 ms end timer: the word freezes part-way, then
  jumps. The 71/71 and 142/142 parity held only on a stopped clock (render(t) flushes with getImageData), so live
  playback is NOT pixel-identical. Per-draw counts (SVG ~58 recalcs vs canvas ~5) are distorted by the stall: never
  quote them as savings. Cause UNRESOLVED (hypothesis: GPU-process readback, accelerated ImageBitmap into a
  willReadFrequently canvas). Next: one Sim hold, 4 variants + an SVG rAF control + console errors. Rev 2 ON HOLD.
  02:3xZ PR-001 4 variants (OBSERVED, Sim): none ticks every frame; the whole page's rendering updates stop 1-2 s per
  canvas draw, while the SVG control in the same session runs clean (54 ticks per draw); no errors; apply() 0-1 ms per
  tick; GPU-readback hypothesis UNSUPPORTED. Next ~2 min hold: (a) engaged, nothing drawn; (b) one drawImage per tick;
  (c) SVG hidden, no canvas; (d) a minimal standalone canvas page with no Fastwork code (tells a Sim artifact from our
  page). Then rev 2 whatever the outcome; likely parked pending a phone check.
  BOARD HYGIENE (lead, standing): when the lead lands a tool or fix branch, ops sets its board row to landed in the same
  pass as the handover entry (I-051 lock-share and I-052 rows sat at ready-to-land after landing).
  02:4xZ PR-001 REV 2 POSTED to the console (state: proposed rev 2). Frozen frames exact (142/142); live playback stalls
  in the Sim, and so does a minimal page with no Fastwork code, so the Sim cannot judge it. Parked for a phone check, NOT
  withdrawn; no savings claimed. The user decides: approve the phone check (arm 1 tiles + arm 2 one-copy-per-frame, test
  only, ~83 MB ESTIMATE) or withdraw; the lead's wait on the decision is armed. de-illusion-style FINISHED: 186fb5b on
  worktree-agent-afc7d9fff1fcc6154 (README, patch.diff, tools/standalone.{html,js}; test:unit 555/555); not a land
  request yet, it waits on the user's decision; void list in its README; finding F-120 (query-flag pitfall). If
  approved, the phone check joins the phone backlog as (f) (the phone is still unplugged).
  03:0xZ (lead): no new illusion owner; on approval de-illusion-style resumes for the PR-001 phone ticket (iphone-runner
  runs it as (f)); de-illusion-composite's items stay parked off the page. h9 (morph start, fixes/layout-containment/README.md)
  stays parked: the user deferred the morph-start first slide-in (T-001 #14); it resumes after fwreskip lands and only
  if the user un-defers it. fwreskip f1 r1 corner diff (182-603 px, Δ4, = B's own fresh-raster frame, OBSERVED) is posted
  to the user in T-005 #17: the user's call, together with the review result. The B2 up-pass +1 Layout (3 vs 2, A/A 3,
  n=1) is being re-run at n=3.
  03:3xZ: 438f933 landed (layout-containment README: F-108 cause, morph-start h2-h8, h9 parked per T-001).
  review-fwreskip-2 on 3ce8ce3: NEEDS-WORK. Review-1 B1/B2/B4 closed; (i) survived a vcross rerun. Blocking: (1) the
  down-pass is overstated (first descent per run B 2,2,2 / P 0,0,3 / A 2,2,3; down2 P 1 vs B 2); (2) Sim idle not settled
  (Paint +23 % at 3100, n=1, no A arm); (3) the no-initiator Layouts sit at the extra #people un-skip; (4) undeclared
  touch/async-scroll risk (on iOS the UI process scrolls ahead of iE, which un-skips from the main thread). Lead: fwreskip
  does NOT land before a phone G/F fling check (protocol): it waits on the phone (backlog (g)). Sim repeats: 6
  back-to-back holds of 3.5 min, B P A A P B. User told T-005 #18.
  review-scene-scope-2 on dfb15bc: NEEDS-WORK. Census and cut correct; the RBi40 failure modes stay gone. D card sent back:
  count view-rooted nested Layouts only (B 2 / RB 1 / RBi40pw 1 / RBi40p 0) and state that it does not explain the
  ~18 ms layout. Blocking: fix.mjs check ran on baseline JS (rerun --on bplus); README speed-ish wording and a false
  "overlap" line; #platform pixels are state evidence, not byte identity (fix: deterministic A/A, timer hold or virtual
  time). Lead: RBi40p does not land alone (stepping stone: same switch cost, same recalc count, plus a coupling to fwWCSel
  and the 50 % margin). Next: RBi40pt (+ the 4 row-title entries), own P-row, deterministic pixel A/A first, check
  --on bplus, Sim W n>=3. User told T-001 #16.
  PHONE BACKLOG add (g): fwreskip phone G/F fling check (lead 03:3xZ), before it may land.
  03:5xZ fwreskip: review-fwreskip-2 recheck on f7f24f4 ACCEPT on README and data (high confidence; numbers recomputed,
  the v7 recount judged legitimate). (iii) idle closed by the lead: "no idle cost found (n=4 windows from 2 holds per
  arm, A/A)". The owner makes wording-only edits (new sha to follow, no re-review). The user is asked (i) the corner
  pixels and (ii) the up-pass trade in T-005 #19 (--ask). Landing gate (iv): the phone G/F fling check, backlog (g),
  when the iPhone is on USB.
  04:1xZ PHONE ORDER (lead, supersedes the (a)-(g) order above): 1 phone-fwreskip-g1 (the G/F fling landing gate; ticket
  in fix-scroll-engine's README, pending its report), 2 PR-001 (only if the user approves), 3 scene-scope ST, 4 the
  T-009 cooldown curve, 5 the I-042 G check. The morph start (e) stays parked (user deferred, T-001 #14).
  04:2xZ (g) = phone-fwreskip-g1 TICKET (fix-scroll-engine, prepared, not run): b5f24a5 on worktree-agent-a1722cf5058e25591,
  README "Phone ticket G1 (item iv)". Snapshots out/fwreskip/snap-g1/{B,P} in that worktree: B JS dbd5fdb4f1fb, P JS
  96b876639c84, CSS 0d7dfc79e703 both (second read mgmt-ops-6 04:3xZ: all 4 sha256 prefixes match). Gesture
  fling-band-v1.json, compiler v2 (fast 5,850 px/s hash 3195734415a8, medium 3,240 px/s hash f7cded2f3ea6); logger flinglog.mjs with a magenta calibration flash. Block
  B P P B B P P B, fast; medium only if no FAIL; F via the console if G is inconclusive. Stroke-fidelity gate ±10 %
  applies (lead 00:3xZ). Board item phone-fwreskip-g1, owner iphone-runner; fix-scroll-engine parked.
  Second read: question, one control (B = RB), driver G (F fallback), warm-up per port, Timeline-off sentinel, ~15 min per
  block, at most 2 blocks, void and FAIL rules written before data: OK. MISSING: a P-row in fixes/PREDICTIONS.md (the
  owner's prediction for item (iv)); register it before the block runs. -> DONE: P-057, e73676d on
  worktree-agent-a1722cf5058e25591 (rebased on e8fade9, no measurements): no FAIL in block 1 (fast, ~65 %) or block 2
  (medium, ~80 %). It lands with the fwreskip branch, not via ops.
  04:4xZ scene-scope: deterministic A/A converges 22/22 at 430 (RBi40p and RBi40pt both 22/22; blocking item 3 closed at
  430). RBi40pt FAILED its P-056 phase falsifier at 1440 (sweeps start at 3433 of 4000 ms, n=1). Lead approved (a): a
  one-line init-paused change in PMsweepGate (JS 3982), with a P-056a onset-time falsifier at 430 and 1440; (b)
  desktop-only acceptance REJECTED. P-056/P-056a and P-057 live on the owners' branches until they land.
  PR-001: the lead's proposal wait is re-armed; still "proposed rev 2", no user decision.
  05:4xZ scene-scope at ba384b1, candidate RBi40pti (variants/23.diff): P-056a phase + onset HIT at 430 and 1440.
  Frames (c1) strict MISS: at 430 the count-up also differs in A/A; at 1440 the y7500 rings frame differed in 1/7 V loads
  vs 0/12 S0 (unexplained). Sim W: view-rooted nested 0, no Layout after the switch RS. Outer RS count MISSES its
  interval. Every Chrome hold ran with the display OFF (I-033). Lead resumed fix-scene-scope for one more frames hold:
  pin the count-up so A/A is identical at 430; 20+20 interleaved loads of the y7500 frame with a Fisher p. Then
  review-scene-scope-3, and the lead takes the 1440 numbers to the user (no pixel waiver by the lead).
  06:1xZ scene-scope frames re-check 61b9b9b: 1440 y7500 V 0/22 vs S0 0/22 differing, p = 1 (pooled 1/23 vs 0/24,
  p = 0.49). 430 with pageframes4 (IO hold): the remaining differences also show in A/A (y3900 "5" glyph 76 px Δ1; S0's
  first-load avatar Δ66); none are V-only. P-056a(c1) stays a strict MISS as written (the gap is in the frame check).
  review-scene-scope-3 spawned (read-only, fix-reviewer definition); fix-scene-scope parked waiting on it. After the
  verdict the lead takes the pixel numbers to the user (T-001), then signs or returns the D card.
  06:2xZ review-scene-scope-3: NEEDS-WORK (medium-high); the fix is sound. Blocking: (1) the 1440 y7500 V-only frame
  (hash 559c68ab9d) is still open: the 22/22 re-check used a shorter walk; rerun q40ui's exact procedure, >=10 loads per
  arm, with a prediction row committed first; (2) README contradictions (candidate status, rows 17/23, risks,
  scenarios); (3) the D-card WebKit claim is wrong and has no status word: mark it UNRESOLVED until T-011. Lead resumed
  fix-scene-scope: prediction row, then the 1440 rerun, then review-4. PHONE ORDER item 3 is now scene-scope RBi40pti
  (T-011 runs RBi40pti, NOT RBi40p). Board: phone-fwreskip-g1 refreshed (queued, waiting on the phone, ticket b5f24a5,
  P-057 e73676d); phone-queue next updated.
  06:4xZ PHONE BACK: the iPhone is on USB since 06:26Z (user T-013; usbmux 1, proxy :9222 up, WDA up); T-011 resolved.
  iphone-runner resumed and runs G1 (fwreskip, landing gate (iv), P-057); C-017 posted for the QuickTime recording
  permission. Order after G1: PR-001 blocks, scene-scope RBi40pti (after its review-4), T-009 curve, I-042 check.
  PR-001 rev 2 ACCEPTED by the user (06:31Z): all solutions OK, "a bit" of pixel difference acceptable, pick the best
  performer. de-illusion-style resumed; lead OK on its plan: arms C, F1 tiles, F2 one-copy (memory-limited), F3 middle
  layout, V HEVC-alpha video, B visible copy only; P-058 committed before data; 2 phone blocks (A: C F1 F2 F3; B: C V B),
  then PR-001 rev 3 with the pick. Phone TIMING LIFTED FOR PR-001 ONLY (user told T-006 #22); everything else stays
  timing-deferred. I-053 (tool, non-blocking): one proposal carrying several options for the user to pick; ts-i053
  spawned, row i053-proposal-options. CONSOLE OUTAGE 01:50Z-06:17Z (it ran as a 2 h-capped Bash job); now detached via
  nohup on :5559, the lead checks `console.mjs url` at each check-in.
  06:5xZ scene-scope f03c024 (P-056b 8a6eee6 committed first): under q40ui's exact 1440 procedure the odd frame recurred
  V 0/10, S0 0/10: "not reproduced". README blocking 2 and 3 fixed. review-scene-scope-4 spawned (focused re-check); the
  user is asked in T-001 #17: (a) accept as noise, (b) a display-off rerun, (c) reject. fix-scene-scope parked. Lead
  summarized T-008 for the user (#27).
  07:0xZ: review-scene-scope-4 ACCEPT; PR-002 (scene-scope RBi40pti) POSTED, linked in T-001, answers #17/#18;
  fix-scene-scope parked on the user's decision (worktree-agent-a49a278f1d0bd6803, README 58f4df5 + 7f9d5ba); board
  style-recalc waiting on user "PR-002 decision". I-054 (serve.mjs has no HTTP Range support: Safari never loads an
  overlay <video>; blocks PR-001 arm V): ts-i054 spawned; measurement-adjacent (what is served), test:chrome.
  COORDINATION GAP (lead 07:0xZ): G1 records with QuickTime on the Mac, so phone blocks are no longer Mac-independent.
  At 06:54Z a shared-lane Simulator boot (de-illusion-style, w3) pushed load1 to 38.9 / CPU 99 % mid-G1. iphone-runner
  logs load per run and checks the recordings for frame drops. Draft below, APPLIED by the lead at 07:0xZ (see 07:1xZ):
  a Mac-quiet window for phone blocks that record on the Mac.
   1. Each counted part runs inside `node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing
      --max-seconds 600 -- sh -c '<part>'` (exclusive: the shared group drains first and nothing joins; parts <= 10 min,
      requeue between parts; the lead moves the runner to the front). --no-timing skips the host gate, so the part
      first checks load (e.g. `lock.mjs wait chrome-measure --until idle --for 60` before queueing, and load1 logged
      per run); a run with load1 above the gate's threshold is flagged, not counted, until the lead decides otherwise.
   2. Tool gaps found while drafting (for a toolsmith if applied; read from tools/lib/iphone-run.mjs, lock.mjs):
      (a) measureGuard (iphone.mjs run) passes a shared group, because the group reads as a short holder, so a Sim
      boot does not stop a timed phone run; (b) it has no same-owner exception, so the runner's own --no-timing hold
      would make iphone.mjs run WAIT (only --allow-during-measure, documented for diagnostics, passes); (c)
      gesture-run.mjs (iphone.mjs gesture, G runs) calls no measureGuard at all.
   3. Cost: everyone else waits about 20 min per block (2 x 10-min holds); phone blocks without Mac recording stay
      outside the window.
  07:1xZ MAC-QUIET WINDOW APPLIED (lead 07:0xZ; standing). Data (iphone-runner): every G1 block-1 recording dropped frames
  (26-65 gaps > 1.5x median, max ~50 ms) at load1 38-94; 4 of 8 recordings lost the calibration frame (VOID). Form: an
  idle wait (`lock.mjs wait chrome-measure --until idle --for 60`), then `lock.mjs run chrome-measure --owner
  iphone-runner --no-timing --max-seconds 600 -- <part>`, one per part, requeued between parts. Only G runs inside it
  for now (`iphone.mjs run` would WAIT on its own guard). Shared Sim and npm-test jobs wait ~10 min per recorded part
  (de-illusion-style and ts-i054 told). I-056 OPEN (non-blocking): guard gaps (a)/(b)/(c) above; a toolsmith after
  ts-i053/ts-i054 land. I-055 (flaky wda e2e test under load): ts-i053, separate commit after I-053.
  G1: the white deck placeholder at fling +1013 ms (7P) also shows in B (1B, 4B): NOT fwreskip's; re-runs of the 4 void
  recordings run in the quiet window; the landing gate holds until the check is done.
  PR-002 = CHANGES-REQUESTED (user 07:00Z; paraphrased: does it still animate exactly like the live site? an illusion
  almost no user can detect is acceptable; investigate and verify). Lead go for rev 2 (fix-scene-scope): per-animation
  census (shared, probe w1), motion frames (2 normal holds), a side-by-side clip, P-056c committed before data; no
  display-off rerun.
  T-014 #3 (user 07:07Z): "stack test, then PR-001". Timing hold lifted for the stack test only. wi-stack spawned (see
  directory). PHONE ORDER (supersedes 04:1xZ): (1) finish G1 (4 void re-runs + the white-deck check); (2) stack test;
  (3) PR-001 blocks A/B; (4) PR-002 / T-011; (5) T-009 curve; (6) I-042 check.
  07:2xZ STACK TEST A/B (lead pick A): wi-stack found today's best RB (= bplus + scene-scope; JS dbd5fdb4f1fb, CSS
  0d7dfc79e703) already carries cdwc, re-keep-op and F3. C = RB; V = stack5 = RB + blur-cubic + st6 (JS 59b23b3f57fd,
  CSS 6e09b2c708fa). (B) rb-aw / stack5-aw was built and NOT measured. User corrected in T-014 #5. Ticket: one S block
  ~15 min + a recorded swipe pair (Mac-quiet window), after G1, before PR-001. P-ID REGISTRY: P-056/056a/056b/056c
  fix-scene-scope, P-057 fix-scroll-engine (G1), P-058 de-illusion-style (PR-001 phone), P-059 wi-stack (stack test);
  next free P-060. Rows live on the owners' branches until they land.
  07:4xZ G1 BLOCK 1 FINAL (fwreskip): no FAIL; the white deck placeholder shows in B too; formally INCONCLUSIVE (B n=1,
  the 1-frame magenta flash can be missed). Real finding: P adds 15-40 ms at the #people un-skip on a fast fling up
  (P 65-92 ms vs B <=57). Block 2 CANCELLED on this build. P2 = the un-skip runs when idle, after 300 ms of rest;
  P-060 committed pre-data (c6d13ca); snapshots out/fwreskip/snap-g1b/{B,P2}, second read OK (P2 JS 9fe824464da2,
  B dbd5fdb4f1fb, CSS 0d7dfc79e703 both); flinglog v2, fling-band-v2.json. Next: Sim checks, review, then ticket G1b.
  iphone-runner stops the G1 servers. PHONE ORDER (supersedes 07:1xZ): (1) stack test; (2) PR-001 blocks A/B; (3) G1b;
  (4) PR-002 / T-011; (5) T-009 curve; (6) I-042 check. P-ID REGISTRY: + P-060 fix-scroll-engine (G1b); next free P-061.
  LOAD: load1 175 (5-min 71) at 07:28Z during a Sim session (de-illusion-style). holds.log shows one short hold that
  failed then: test-chrome (ts-i054's checkout) 07:22-07:26Z exit 1, re-run from 07:37Z. Shared-lane readers write no
  hold record, so their failures and timeouts can't be checked from the lock logs (gap reported to the lead).
  I-057 OPEN (tool, non-blocking): flaky e2e progress-cli I-048 shared-lane test (load1 > 16 refuses the 2nd reader); assigned to ts-i053.
  07:5xZ I-054 LANDED 67847b4 + RESOLVED (serve.mjs HTTP Range; re-measure only for A/Bs that serve video or media).
  Broadcast to active worktree agents: rebase between steps, never mid-hold. Sim-load: no cap change (lead). I-056 gets
  item (d): shared-lane readers log exit code and duration to holds.log. ts-i056 spawned for I-056 (a)-(d).
  S1 STACK TICKET second read (wi-stack 3ec9fc9, P-059 pre-data in the same commit): hashes OK (C JS dbd5fdb4f1fb /
  CSS 0d7dfc79e703; V JS 59b23b3f57fd / CSS 6e09b2c708fa), one control (RB), driver S, warm-up per port, C V V C C V V
  C, ~15 min, Timeline off. One fix asked: a non-Timeline S block also holds every counted C run to the sentinel
  (bottom >=58, scroll >=44; a failing C voids runs since the last passing control). S1 is now next on the phone.
  08:0xZ b58fa25 LANDED. S1 RUNNING: iphone-runner holds the iphone lease since 07:59Z (S block ~15 min, then the
  lead-approved blind swipe pair in a Mac-quiet window). PR-002 rev 2 checks DONE (fix-scene-scope; P-056c 71fe09a
  pre-data): census no per-animation difference beyond A/A; motion frames 430 V 64/64 identical, 1440 only a known A/A
  digit raster variant; summary with the lead, waiting for the OK to `proposal revise`; optional blind swipe A/B only
  after the lead's OK. st6 and the will-change selector: owner fix-scroll-engine (lead).
  08:1xZ PR-002 rev 2 ACCEPTED by the user 08:07:38Z (no notes, no swipe). SCENE-SCOPE D SIGNED (lead): NAMED for the
  nesting mechanism, class phone-only, gate T-011; the ~18 ms view Layout is LOCATED (row-title entries), mechanism
  UNEXPLAINED, a separate card. S1 BLOCK 1: primary (scroll gt34) BLOCK2, idle gt34 WIN, P-059 HIT; lead approved
  block 2 (iphone-runner from 08:17Z), then wi-stack runs the swipe pair C-019. T-015 QuickTime stuck dialogs: lead
  quit QuickTime 08:14Z, nothing lost; root cause assigned to iphone-runner.
  08:2xZ T-016 (user): iphone-runner cooled with a fixed `wait.mjs time 9m`. Cause: CLAUDE.md "Phone blocks" still says
  "10 min cooling between blocks" (also the wait list "cooling: `wait.mjs time 10m`" and the sentinel "cools 10 min");
  protocol §5.3 replaced it with `wait.mjs phone-temp`. LEAD.md and this handover fixed; CLAUDE.md left to the lead
  (agent messages can't authorize CLAUDE.md edits). Waits rule added above. I-058 OPEN (tool): waits post their reason
  to the board; toolsmith after the current land. Lead fixed CLAUDE.md (feb5936: lines 379/540 + "set your board row
  before any wait"). 42c14a0 LANDED: I-053 options, I-055, I-057 RESOLVED; console restarted 08:22Z with options live.
  08:3xZ S1 FINAL (stack test): pooled primary (scroll gt34) NO-WIN, p 0.162, THRESHOLD-SENSITIVE (gt30 WIN); idle gt34
  WIN (block 1); scroll gt50 block 2 +1.5, pooled +1 (P-059 edge HIT). Block 2 ran at Mac load1 up to 96 and its scroll
  phase was ~250 ms longer in both arms (OBSERVED; iphone-runner checks load vs run from the files).
  QUIET WINDOW FOR S/W/M (lead 08:28Z, softened 08:3xZ): PREFERRED, NOT BLOCKING (load doesn't pace the S driver): run
  S/W/M blocks in an exclusive --no-timing hold (load1 <= 8 at run start) when one is available, otherwise run anyway and
  log the load; recorded parts keep the Mac-quiet window (07:1xZ). I-056(b) (ts-i056) makes the hold usable for them.
  USER RULE T-017 (08:29Z/08:31Z): C-019 highest priority, don't make the user wait; user steps first (working rules).
  T-011 TICKET (fix-scene-scope 96300df, RBi40pti) second read; P-061 = fix-scene-scope (T-011); next free P-062.
  PHONE ORDER (supersedes 07:4xZ; user steps first, T-017): (0) any posted user step: now C-019 swipe pair (wi-stack);
  (1) PR-001 blocks A/B; (2) G1b; (3) T-011 (scene-scope RBi40pti, W Timeline, ~20 min); (4) T-009 curve; (5) I-042
  check. Post a user step only when the phone is free for it.
  08:4xZ c9bd0ae LANDED. C-019 ANSWERED 08:34Z (wi-stack): blind pick page 1 = V (stack5) over C (RB), rated 3/5;
  user note (paraphrased): better, but still a bit laggy, can it improve? iphone-runner: V's worst frame at the #people
  entry 66-75 ms vs C 48-57 (no overlap, OBSERVED). wi-stack runs a Sim leave-one-out (V-st6, V-blur-cubic). Load does not
  pace the S driver (iphone-runner, rho +0.11), hence the quiet window is preferred, not blocking. PR-001 blocks: run by
  iphone-runner (waiting for de-illusion-style's ticket with the V hashes). fix-scene-scope stopped; the lead resumes it
  with the 3 T-011 fixes (warm-up run per port, quiet hold preferred, P-061 time 08:3x) when T-011 is near.
  PHONE ORDER now: (1) PR-001 A/B; (2) G1b; (3) T-011; (4) T-009 curve; (5) I-042 check; user steps jump the queue.
  08:4xZ TOP INVESTIGATION (user T-017 08:36Z, paraphrased: investigate, tell the causes apart, design, then plan the
  improvements; mind priority and token budget): wi-stack builds a FILES-ONLY remaining-lag map of stack5 (every V
  dt>34 by crossing, sorted by excess ms, tagged by known cause); then the lead posts ONE proposal so the user picks the
  order. Zero new spawns for it; parked topics stay parked. 2c36b62 landed (PROGRESS wording OK); the lead sent
  fix-scene-scope the "preferred, not blocking" correction (it amends 06d2290).
  08:4xZ LAG MAP IN (wi-stack): #people frame 2 is the only V regression (+299 ms over 8 runs); three unknown rows get
  one combined Sim check each; user summary in T-017. review-fwreskip-3 spawned on fwreskip P2 (c6d13ca + f8cd750),
  ahead of G1b. PR-001 BLOCK A RUNNING on the phone (iphone-runner, lease to 09:03Z); its ticket had no mgmt-ops second
  read (went straight to the runner). I-056 and I-058 fixing (toolsmiths).
  08:5xZ T-018 CAMERA INCIDENT (facts from iphone-runner, disclosed to the user): the iPhone recording route turned the
  Mac camera on; it recorded ~08:46:57-08:48:15Z, plus an unsaved second recording to ~08:49:30Z; the agent viewed one
  still frame; a camera device listing ran at 08:51-52Z; all files deleted and the deletion verified; C-020 withdrawn;
  recording suspended; NO-CAMERA is the top working rule (above). P-058's visual-defect check (PR-001) is BLOCKED
  without recordings: an alternative or a drop, to be decided (lead). I-058 LANDED 29e0cca + RESOLVED (waits on the
  board); console restarted 08:54Z.
  LEAVE-ONE-OUT (wi-stack, Sim, OBSERVED): blur-cubic carries the #people frame-2 Composite, not st6 (details pending);
  wi-stack posts the design as ONE proposal with options A/B/C.
  09:0xZ 525d916 LANDED. PR-001 BLOCK A DONE: 8/8 valid, sentinels passed; load1 > 8 in runs 1-7 (flagged, not void).
  P-058 ticket (de-illusion-style, rebased: a5c6512 ticket, b6144af, ed6b323, 234d2b7, 0d6f1d2 V pixel, 9fe02d6 Mac
  load, 730f3b5 youdraws fix, 7dbc973 no recordings) SECOND READ PASS for block B: all 6 arm hashes match (shared JS
  a330f386556d; V mp4 7d5b834b69c5 / 8e8f113f8565, manifest 120f23bcae4f), runner has 67847b4 (Range), one control per
  block, W at the top, warm-up per port, S sentinels, phone-temp cooling, B = 9 counted. Cosmetic asks: minutes per
  block (B ~22-25 min + cooling), two stale lines. 7dbc973 changed the visual-defect criterion after block A's runs
  were in (before analysis): disclosed, rev 3 names it. BLOCK B NEXT, NOT GATED (lead correction): runs without
  recordings once iphone-runner has done tlcounts, the rebase and cooling. Only the live visual look at the winner and
  any capture route (screenshots over USB / the user's own phone screen recording / drop) WAIT ON THE USER.
  09:1xZ ae7189d LANDED. T-018 #7: the ioscap account went to the user (built 10-01; requested camera permission twice,
  denied; listed external devices only (the iPhone), never the Mac camera; no frame; source on main at
  research/architecture/oss-rendering-libs/ioscap.swift, removal is the user's call). PR-001 BLOCK A RESULT: F2 is the
  best canvas arm, but no frame gain over the SVG on the phone (n=2); F1 and F3 freeze mid-stroke. PR-003 POSTED
  (wi-stack, 3 options for the blur-cubic #people cost, A recommended).
- **21:4xZ** (resumed after the usage reset) SHARED LANE ON 21:40Z (d777f3e + 087e36b..c05ec41; cap 3, join load 16;
  `sim.mjs session --functional` = shared slot weight 3). I-044 fixed e1515ad. PHONE COOLING BY TEMPERATURE (user T-009):
  ts-phone-cool builds `wait.mjs phone-temp` (replaces fixed cooling waits). Landed candidates: f7d3b1b rotator-st6
  (user blind finger pick), 8207797 scene-scope V1+R4a+R4b (RB; root hunt parked), f230912 illusion-composite PoCs.
  HERO F-108 = the accent word's draw/erase (h7): de-illusion-style takes draw/erase (containment first, then frames/
  video; PR-001 changes-requested: user wants pixel-identical, apple.com-style frames/video); fix-scroll-engine takes the
  morph start (h8). ms-1 REFUTED img src writes on the phone. AGENT_ROLES item 8: how DEs post proposals. I-045 open.
- **20:4xZ T-002 20:37Z: usage 78 %, hero + page-end only until 04:20 reset** (21:20Z). Live: fix-scroll-engine (st6
  rotator, F-108 dirtier), fix-scene-scope (RB r4-v3 + morph start), iphone-runner (their finger checks); all else parked.
  mgmt-ops-6 PARKED (lead resumes after 21:20Z). Unlanded: nothing. Phone: no lease, waits for root-hunt tickets.
- **20:3xZ** Landed 0c90cdc (I-038 fix; npm test on main queued), f93f798 (iphone-wave2 §4s-4u), 7c1cdd5 (st5 split
  scored: P-042..P-044 HIT; st6 slide-start view 1/36 vs st5 24/35, C 71/71; trigger = animation-sampled opacity/
  transform flips; F-108 page-wide background dirtier). st6 = rotator F candidate (gain block deferred). New rules: Sim
  `--no-timing` structure holds; root-hunt owners (USER DIRECTION items 8-9). Note: one flaky test:unit fail at 20:33Z,
  passed on rerun.
- **20:3xZ USER PRIORITY (T-001, 20:24Z): layout-dominated slow frames first** (see USER DIRECTION item 7). Layout root
  hunt: t3 strict P-049/050/051 MISS, P-052 HIT (RB cuts steady-tween nested Layouts ~15x; neither arm changes the morph
  start). F-106 H1 (will-change restore) REFUTED by WebKit source; F-107 fwReskip crossing = two writes in one step.
  de-counts-sim holds chrome-measure since 20:30Z (Sim n1). st5 split on phone until ~20:40Z; then root-hunt tickets.
- **20:2xZ** WORKTREE CLEANUP (lead, user request): 56 finished worktrees removed (their work on main; 6 leftover doc commits
  landed first); untracked results archived in `.git/fastwork-mirror/archive/worktrees/<agent-id>/` (146 MB, local only);
  11 orphan arch-sim serve.mjs stopped. Kept: live agents + parked fix-nav-morph (a277ea00, 48 unlanded) and fix-hero-exit
  (a77e2ec7, 27 unlanded). Broadcast: `git rebase main` at the next safe point; headless needs main >= 8fa38f7. ts-headless
  and ts-console-threads are ENDED (worktrees gone; can't be resumed). USER: lock-share = HIGHEST Chrome priority.
  scene-scope t2: P-045/046 HIT, P-047/048 MISS; outside view Layout 12-18 ms in every arm -> root hunt (H1 will-change
  restore on .start-selling-platform-card, source check running). st5-split Chrome counts 18dacf0: st6 removes both
  flips, parity 0.00 %, Chrome Layout not discriminating (as predicted). de-counts-sim: Sim refuses the short lane by
  design -> 3 normal holds <= 420 s (n1 A/B, n2 C/N calibration, n3 V1/V1i); its Sim-vs-phone verdict waits on n1+n2.
  scene-scope t3 (R4, M, 20:12-20:20Z): P-049/P-051 MISS (morph-start keeps 2 nested view Layouts), P-050 RA MISS / RB
  near (1-3 vs 30-44 per tween), P-052 HIT (tween RS RB 0.1-0.2 vs C 0.5-0.7 ms). st5 split on phone 20:22-~20:40Z.
- **20:0xZ** Console THREADS landed (77d318c, rule fc07bb1): an agent the lead assigns a thread arms `console.mjs thread
  wait --as <me>` and answers there, not in chat; broadcast to 12 live agents. scene-scope block-1 scoring (owner, strict
  raw count): P-040 MISS, P-041 HIT. Tickets 2 (C=B, I4, I40; W; P-045..P-048) and 3 (C=B+V1, RA, RB; M; P-049..P-052)
  went straight to iphone-runner on the user's "run now"; second read in parallel OK, hashes match. Phone order: t2 ->
  t3 -> st5 split. Proposals waiting for the page: boil-ca, accent-wipe, typing-chunks, digit-layers (+2).
- **19:5xZ** scene-scope attribution block done (iphone-runner 19:44-19:52Z, 9/9, heat sentinels pass): nested Layouts
  in the switch RS C 2 / V 2 raw (2nd 0.1 ms non-view -> 1) / I 1; RS self C 2.4-3.7, V 1.2-1.4, I 0.6-0.9 ms; but the
  cost MOVED: fwReskip RS (y~2990) C 14 / V 18-21.5 / I 21-23 ms, switch + fwReskip C 32-35 / V 33-39 / I 39-41
  (OBSERVED; P-040/P-041 scoring = fix-scene-scope). st5-split ticket validated (cfef9cf, bands as P-039, ~15-18 min) and
  sent to the PHONE at once (phone free, de-counts-sim gate pending, Chrome queue 6+). I-044 (status.mjs stale "now" line).
- **19:4xZ** User GO 19:41Z: iphone-runner runs the scene-scope ATTRIBUTION block (C=B, V1, V1i; W; Timeline; nested
  Layouts at the #platform flip) = P-040/P-041 (ids assigned after the fact, predictions pre-data in the ticket msg;
  hashes checked in parallel, match). st5-split ticket (fix-scroll-engine 2944262; C, V1, st5, noanim, waapi, st6) =
  P-042..P-044, second read OK pending (1) band conflict (view >= 50 vs MIXED 25-75) and (2) device minutes; snap2 hashes
  match; Sim if de-counts-sim's C/N gate passes. de-pm-hero land request 78c2b4b/372ecae/1ae7225 (F-102: WebKit
  opacity/transform flip forces layout, CONFIRMED source; our cause UNRESOLVED; st6 = no-flip arm). de-counts-sim: 3
  short chunks; WebKit has no restyle element count (CONFIRMED source), "345 -> 30" is Chrome-only.
- **19:3xZ** Landed a22657a + b8a533c (ops), dfc8e08 STATUS BOARD (seed applied, lead set priorities, console /status).
  RULE: owners `status.mjs set <id> --by <me> --state … --note …` at every transition, `status.mjs mine` on resume; PROGRESS
  = user narrative, live state = board. Pinged all 13 live owners 19:28Z (ids per lead); report non-adopters ~19:43Z.
  P-039 st5 (19:12-19:23Z, valid): MIXED, swap ticks 1/31 view, slide-start 15/33; idle y1500 dt>34 70->29, >50 4->0;
  cost-moved not tripped; next = lead (split block needs 3rd-block exception / gain block / park). I-042 D4 (phone,
  OBSERVED): safari-restart 6.0 s; >= 25 ms segments within +8 %, 17 ms +31 %, 8 ms collapse; ~115-125 ms per pointerMove
  before touch-down (Sim ~50); compile v2 = piecewise >= 40 ms segments (15-20 moves / 900 ms), COMPILER_VERSION 2: G
  numbers compare only within v2. Phone: cooling to 19:33:30Z, then P-033 unless scene-scope's ticket is validated first.
- **19:1xZ LEAD PRIORITY ORDER (supersedes 18:4xZ):** (1) style recalc (fix-scene-scope); (2) USER: illusion proposals
  (de-illusion-style, de-illusion-composite, ts-proposals; PROGRESS `illusion-proposals`): counts first, <= 2 batched
  Chrome holds each, queued after scene-scope + de-counts-chrome/-sim; no phone before the user Accepts; an accepted
  proposal -> fix topic + phone ticket via mgmt-ops; (3) phone-tool fixes (I-042 compile, I-038); (4) st5 / P-039;
  (5) lock-share / headless / status-board / threads / proposals tooling. Watch chrome-measure queue length (load).
- **19:1xZ** Landed c220e82 (lead retrospective; §5 now "Standing lead policy" above), a93d0c9 (§4p), 62e3fd9 (§2.1 final
  inspector-clean block: OPEN (a) below DONE), 8e26131 (PROGRESS ranked items). anim-transform + image-size PARKED (small
  gain, after scene-scope + R4+V3 phone result). fix-scene-scope hold 1: V1 `:is(70-list)` made the flip ULT slower
  (OBSERVED) -> rewritten as a flat list; Chrome does not reproduce the phone's 25 ms nested Layout; WebKit
  StyleTreeResolver `updateStateForQueryContainer` SkipDescendants CONFIRMED in source; hold 2 = A, A+V1, B, B+V1, then
  its W Timeline ticket (ahead of P-039's successors). P-039 st5 block started 19:12Z (~42 min).
- **19:0xZ** Landed 30eaa11 (de-style-recalc DONE: style-recalc-images.md, F-093..F-096): H1 nested CSS REFUTED (scope, not
  matching), H2 images = memory only. Ranked fixes 1 scene-scope, 2 R4+V3 (fix-scene-scope), 3 st5, 4 fwReskip, 5-6
  sweep/packet -> transform, 7 image right-sizing (Sim memory + pixel check, no phone) -> PROGRESS items. ts-gesture I-042
  D1-D3 (Sim, OBSERVED, n=1): >= 33 ms segments play as written, 25 ms stretch +31 %, today's 8 ms collapse to a 50 ms
  flick, ~50 ms per pointerMove before touchstart; fix = compileStroke one move per >= 40 ms; phone D4 ~19:10Z <= 7 min.
  **OPEN (track):** (a) DONE 62e3fd9. §2.1's final B numbers: when iphone-runner's inspector-clean SR rerun lands, fix-scene-scope (or
  mgmt-ops) appends them to style-recalc-images.md §2.1, append-only (re-read the y≈2615 and y≈5260 rows). (b) UNRESOLVED:
  why the y≈2610 scene flip was cheap in ~30/35 older runs and costly in every B block-1 run (dirty-container hypothesis;
  decisive = scene-scope's Chrome check of Layout dirty objects at the flip). (c) UNRESOLVED: Chrome's per-frame `.hero`
  inline-style writes (40-55 ms at 6x, JS 4172) have no phone counterpart: skipped or priced low? (phone Timeline
  FunctionCall at JS 4172 in an idle-hero window). (d) UNRESOLVED: `step-end` opacity boils (commission underline, B CSS
  165-171) wake the main thread per step or per frame (§3.2).

- **18:5xZ** fix-scene-scope spawned (lead): de-style-recalc's proposal (`:where(*)` scene pause narrowed V1 / API pause
  V1b / early flip V2 / panel + R4 V3, on B). PHONE ORDER: iphone-runner style-recalc block (lease to 19:12Z) ->
  ts-gesture ~5 min -> fix-scene-scope W Timeline block (after its Chrome check + second read) -> P-039 st5 -> P-033 ->
  P-038 -> P12 -> P10 -> P5 -> P9. ts-status-board seeded with the workstream map (mgmt-ops-6 18:5xZ). Landed fa7fc6b.

- **18:4xZ LEAD PRIORITY ORDER:** (1) style recalc (de-style-recalc + iphone-runner's block, then a scene-scope fix);
  (2) phone-feeding tool fixes (ts-gesture I-042, ts-iphone-run I-038); (3) st5 / P-039; (4) lock-share, headless,
  status-board tooling; (5) the rest. New: ts-status-board (briefed on the PROGRESS split).

- **18:4xZ** Landed: a3b2832 (docs-2), 1e0dedf (ts-lock-bundle 5 commits; announcements + CLAUDE.md --no-timing line =
  lead), 511908f (P-039 ticket). P-039 st5 TICKET VALIDATED (second read 18:4xZ, row in PREDICTIONS). C-014 (lead): the
  user's Mac Safari Web Inspector was attached to the phone in parallel = likely cause of the inspector wedges (I-038),
  closed 18:41:48Z (noted in I-038). Phone: iphone-runner style-recalc block (lease to 18:58Z) -> ts-gesture (queued)
  -> st5 (P-039) -> P-033 -> P-038 -> P12 -> P10 -> P5 -> P9. chrome-measure: de-style-recalc #1 (lead).

- **18:3xZ USER PRIORITY (18:32Z): style recalculation is the HIGHEST priority** (overrides the order below). Phone:
  iphone-runner style-recalc Timeline attribution block on the sitting's A/B NOW -> ts-gesture ~5 min -> st5 / P-033 ->
  P-038 -> P12 -> P10 -> P5 -> P9. chrome-measure: de-style-recalc to #1 whenever it queues (lead moves it; tell the
  lead the moment it queues). Any de-style-recalc fix proposal is FAST-TRACKED: owner, ticket (second read at once),
  phone block next. ts-gesture told.

- **18:3xZ** USER SITTING C-013 done 18:30Z (lead): hero + page end "B quite smoother" (B = aw1-10e + g + cdwc + re-keep-op +
  arm-scope-c; not blind, one viewer, OBSERVED perception). User's own idea: style recalc ~19-20 ms (> 16.7 ms budget)
  is the lag; hypotheses (1) nested/complex CSS selector matching, (2) per-frame image rotation/resizing, image sizes,
  native CSS -> lead spawns de-style-recalc. PROGRESS: items best-stack (felt better) + style-recalc. Phone free ->
  ts-gesture ~5 min -> st5 or P-033. Lead reorder 18:24Z: chrome-measure ts-gesture, layout-containment first.

- **18:0xZ** P14 DONE 17:42-17:54Z (9/9 valid; sentinels bottom 60.2, scroll 56.6): V1 st4-noswap HIT (2/67 view ticks),
  V2 #people-rooted HIT but 0.57 of C (MISS on <= half) -> LEAD SIGNED D (rotator: swap path); fix-scroll-engine st5 next.
  PHONE ORDER (lead 17:5xZ): user sitting C-013 (lease `user` until 18:54Z; A :5611 baseline, B :5647 B+) -> ts-gesture
  ~5 min -> st5 (C / st5 / V1, ~45 min; after Chrome mech + screenshot diff, de-pm-hero cross-check, second read) ->
  P-033 gain -> P-038 -> P12 -> P10 -> P5 -> P9 (if st5 isn't ready, P-033 first). Landed 508d8b4, 1302f64.

- **17:5xZ** Landed: 079e1cf (docs-2), 379d5e5 (ts-iphone-run N1: no LAN host in tab-pick/gesture errors), I-032
  fe7db9f..9e59002 (RESOLVED; main npm test 771/771), 5137637 (I-043 wip.mjs socket leak, ts-iphone-run). P14 (W)
  started 17:42Z (~30-35 min) -> user sitting (A = original baseline :5611, B = B+ with arm-scope-c :5647; lead holds
  the lease as `user`) -> ts-gesture (~5 min phone confirmation; I-042 D1-D3 + new `safari-restart` tool on the Sim).
  Spawned: ts-console-nav (console menu + notifications), ts-lock-share (shared lane for functional-only jobs, design
  first), review-lock-bundle (ts-lock-bundle's 5 commits). USER RULE: no-number iPhone jobs go to the Simulator (above).

- **17:3xZ** (mgmt-ops-6) Took over from mgmt-ops-5 (17:28Z). Landed: ts-progress 7614401 + c9ceb98 (console Progress
  page, fixes/PROGRESS.json). PREDICTIONS: P-032 (b) G-based items marked G-invalid (flick, I-042, F-085); P-031 G,
  P-035 G, P-036 G marked BLOCKED until I-042. Phone: P14 (W) -> user sitting (lead, owner `user`) -> ts-gesture I-042
  probe -> P-033 gain -> P-038 -> P12 -> P10 -> P5 -> P9. Caffeinate reminder ~18:30Z.

- **12:3xZ** Landed bd6762e (docs-2 P-029 row, F-059 corrections; doc-protocol-v2 layerPainted M148+, rAF 60 Hz, L13).
  P1 HIT (P-017), P2 miss (P-016b). Lead: P10 right after P-029 (same session, 10 min cooling); runs count only with the
  P0-cleared probe until T1a lands (T1a NEEDS-WORK B1, scrollHeight read). T8+ NEEDS-WORK (2 items). Gate 25 % (user).
  Caffeinate ends ~13:32Z (lead restarts). Pending: mw-stub rerun (finger batch), arch-claims layout verdicts.
- **11:5xZ** P0 CLOSED (P-023 neutral; A9 lifted for rAF-only loggers, lead 28aab81 + 747d80a, F-061; doc-protocol-v2
  carries it into protocol §3.2/§5.5 + unknowns-actions). User setup done (Developer Mode, UI Automation, cert); ts-gesture
  wda build holds the lease until <= 12:03Z, then runner: T10 -> P1+P2. P9 PASS (bbf2061). T8+ npm test in the short lane;
  C1 = lead, after T8+ review. Land: iphone-runner 8445b5f + eb107d7 (on 28aab81), docs-2.
- **11:3xZ** (mgmt-ops-5) Took over. Lead 11:30Z: P10 change approved (gh-cdwc vs gh-cdwc + A1 only if P1 passes, gated
  on the per-tween max edge leap; arch-lead writes it); user-ask bundle with the user now; ts-bench-gain (nit 1) being
  spawned; T2 only after T1a lands (nit 3 in its prompt). Landed since 11:24Z: none new (main 5a3c72b). Asked
  fix-nav-morph for the P1 ticket (gh-cdwc/gh-cdhid hashes + P-017 card). Caffeinate reminder ~12:50Z.
- **11:25Z** P0 logger-ysrc A/A RUNNING since 11:23Z (hand-patched runner yswin.mjs, aw1-10e immutable :5476; battery
  80 %, not charging, 39.4 °C logged per run). Next P1+P2 once fix-nav-morph sends gh-cdwc/gh-cdhid hashes.
- **11:24Z** HANDOVER to mgmt-ops-5 at the phone-back boundary (11:22Z). Runner has the §3 order and the P0 logger-ysrc
  ticket; ST-2 builds cleared (pr5; +1.13 s frame = `is-future-shrinking` transform none -> scale(1)). New topic N14
  layout-containment -> fix-scroll-engine (TOPICS). /10d parked until its phone check. User-ask bundle in "Next
  actions" item 2. Landed since 11:06Z: 4259051, fix-scroll-engine records 79202d8..b3e5df9, T3 stats 488b9df..e46c6bc.

- **11:17Z** Lead adopted arch-lead's ranked list (unknowns-actions.md §3, 197c2fa): phone P0 y-source A/A -> P1/P2
  countdown + P-016b -> OSS ca-check -> P3 ST-2 -> P4 y≈1960 F1/F3 -> P11/P12 containment -> P5 ST-1 -> rest. Holds:
  fixed-size, ghr85a, R7, R8 nav half, a1, h4. New: map-webkit-amplifiers (D2), ts-host-state (T8+). Phone still with
  the user. Runner has the new order.

- **11:16Z** Phone HELD by the user (lead): no phone calls until "phone back". Morph session: Composite carries the cost,
  ~78 layers/cycle, R1/R2 refuted. Display back-tag landed ddc3450 (display on since 06:22:55Z). OSS: P0 ca-check + P1
  (F3) approved, P2-P4 wait for P0; F-048 caveat (our T10 linear() blur may be main-thread). P-018..P-022 logged (ST-1,
  ST-2, ST-2d, P0, P1). Asked arch-lead for the "y-source A/A" ticket. fix-scroll-engine stack unlanded (needs review).

- **11:05Z** Tickets validated: y≈1960 F1/F2 as two 2-arm blocks after the morph session (lead confirmed), de-pm-morph
  hold-250 pair (P-016). U1 display caveat in DIRECTION (display-on from 11:01:46Z; DarkWake runs compare with nothing
  later); back-tag desk task -> fix-scroll-engine. U5/U7/U9/U2 routed (runner, ts-iphone-run, ts-analysis,
  doc-protocol-v2). Gesture tool landed 5d357b1; user asks bundled: WDA signing, Instruments pairing, finger batch.

- **10:48Z** y≈1960 NAMED: na (listeners armed at setup) 104/107 -> 34/35 ms, nb stays; P2b = style 34-42 + composite
  58-72 ms. fix-nav-morph: attribution card -> lead, then landable fix + ticket. ghr85a held (no ticket). Runner next:
  morph attribution P2/P3 + ghbn mech check (recipe from de-safari a4ce1669dd33aa4dc). PREDICTIONS P-011/012 hits.

- **10:46Z** Protocol v2 landed (670b4bf) and approved; executing §8.3 by hand. fixes/PREDICTIONS.md started (P-001..010;
  misses: gh>=25, ghb additive, src, noinert, h1<=34). F-047 Timeline clock fix PASSED. ghbn = render-bound LOCATED
  (waits for Instruments). Queue (lead): na/nb+P2b -> morph P2/P3 -> hero 2 blocks+P3b -> R2 bg -> /10d -> N12 -> R3/h3.
  New: ts-iphone-run, ts-analysis, ts-render-signals (I-032), doc-protocol-v2, arch-unknowns, de-unknowns-render/-ux.

- **10:33Z** noinert NOT a winner either (y≈1960: control 102 vs noinert 98 ms; the frame now carries only 2 tabindex
  writes -> cost is other IO-callback work). F-045 (y≈1250 scene gate) weakened by phone data (frames 35-37 ms, no flip
  in-frame): no build. Timeline clock fix (Page.disable+enable before Timeline.start; de-devtools/de-safari) -> runner
  1-min check, then a y≈1960 Timeline capture. AGENT_ROLES: naming `<role>-<topic>`, unique; general-purpose workaround.

- **10:27Z** Lead: peer-to-peer mode, mgmt-ops = hub (F-046 directory above; AGENT_ROLES "Addresses and peer work").
  noinert (fix-nav-morph 213ca19, y≈1960 inert fix) queued right after the morph driver round. y≈1250 frame candidate
  = .commission scene gate flip (F-045) -> runner adds `data-start-selling-scene` + uncapped per-type counts to the logger;
  fix-scroll-engine owns it if it confirms. /10d: no Chrome re-measure; phone check last, then reviewer (ask lead).

- **10:25Z** mw10e-src NOT a winner; y≈1960 trigger = morph panel `inert` removal (F-044 corrects F-043; logger cap 12/frame).
  PROTOCOL V2 IN PROGRESS (arch-lead, research/architecture/measurement-protocol-v2.md; ops input sent: ablation labels
  checked by computed style, uncapped per-type loggers, warm-up run, thermal checks between rounds, phone slot tickets,
  immutable served snapshots, ABBA vs one control + pre-registered prediction). Queue unchanged until the lead approves.

- **10:17Z** hero-A: h1 -11-13 ms at the flip (h1v2 52 vs P 65, h1 45 vs P2 56), <= 34 ms 1/6; y≈1250 41-51 ms frame in
  all builds (unowned). fix-hero-exit rebasing (between blocks). Runner on mw10e-src. NEW read-only research (user
  request): arch-devtools (research/architecture/devtools-methodology.md), de-devtools
  (research/design-engineering/devtools-render-metrics.md); neither measures. Runner's 2 h background limit kills servers.

- **10:08Z** (timestamps from `date -u` from here on; my 09:15-09:58 stamps ran ~10 min fast) main acce613 verified
  (npm test, test:chrome 9/9, canary 75.9/75.2 = the ~76-78 band, watch unchanged); rebase GO sent to fix-hero-exit (after
  hero-A), fix-scroll-engine (done, 77e48cf), iphone-runner (done, c45d086 write-up -> LAND). fix-nav-morph still held.
  /10d Chrome neutral (p95 flag gone) -> review recommended after its phone check. Phone cooling; queue in DIRECTION.

- **09:58Z** Landed: ts-snapshot follow-ups (..d1c324c, user approved enforcement parts), de-morph rev 1043651, de-apple
  1babddb, my bf7896d. Lead's tests + A/A canary on main RUNNING: announce NO rebase until the lead confirms. N10 dropped;
  /10d gets one normal slot after the tests (rebase on d1c324c first). Queue: morph-2 (ghb, ghbn, clip probe) -> hero-A
  -> hero-B -> apple-ref (+ idle Timeline) -> R2 -> N12 -> img-sourcing -> ts-gesture V0. Caffeinate: lead ~10:10Z.

- **09:52Z** e1/e2 CONFIRM: y≈1960 frame = morph IO img-src burst (>= 12) -> fix-nav-morph (#2), N10 a-d to the end
  (F-043). R2 clip probe needs the user's look (screenshot misses backdrop-filter; asked lead). R3 named (vinyl under mask,
  F-041) -> owner question with lead. Asked lead: /10d normal slot? Morph-2 ghb running. F-042 warm-up control.

- **09:33Z** Lead: fix-nav-morph built ghb (gh + no blurs, diagnostic) + R2 clip-path/backdrop probe page (ac40b3f,
  f63fc70) -> morph-2 slot right after e1/e2 (sent to iphone-runner). de-morph resumed to reconcile its model with the
  driver numbers. NEW (user request): `de-apple` design engineer, apple.com's rendering math ->
  research/design-engineering/apple-math.md (read-only, <= ~10 polite fetches into the scratchpad). Caffeinate: lead ~10:10Z.

- **09:30Z** Morph block done: gh ≈ gb (p50 26/29 vs g 35 ms), neither R1 nor blur dominates; fix-nav-morph has details.
  Phone heat pause ~12 min, then e1/e2 (control :5462, e1 :5463, e2 :5464, hashes match) -> hero bisect -> apple-ref (user
  request, live apple.com, write-up in apple-verify.md "iPhone Safari check") -> N12 -> N10. fix-nav-morph keeps holding
  rebase (e1/e2 + N12 serve from it). /10d prototype se10d-aw1 e920843 built (mech clean); fix-scroll-engine on R2.

- **09:25Z** All three design notes on main (5c4fc37, 7576f74, 7d60f9f); DIRECTION records the lead's ranking (gh/R1 ->
  y≈1830 IO -> h1 flip -> h3 countdown strip -> middle R2 -> h2). Phone queue: morph+gh -> e1/e2 -> hero bisect (v7, v6,
  v4, v5) -> N12 -> N10 a-d. h3 = next spawn candidate (fix-countdown-idle-raf) when a phone slot is in sight; ask lead.
  ts-snapshot ACCEPT, 3 fixups, then user OK + land; bench toolsSha changes -> re-calibration announced with it.

- **09:15Z** Hero block done (P2 /10e small gain; hero v2 kills y≈50 but y≈700 +10 ms WebKit-only, F-035) -> hero bisect
  queued after morph. Morph block partial (phone throttled 09:07, resumes ~09:23): moving p50 ~30 ms, fb n=1 p95 45 vs f
  53-64. de-morph done (5c4fc37): cost = full repaint of resized layers, not blur -> h-fixedpanel ablation (fix-nav-morph)
  joins the morph block. F-034 (freeze served overlays), F-036-039 (de-morph). fix-scroll-engine rebased 272f6c7 + sparse;
  GO /10d prototype (no normal hold before the N10 verdict).

- **09:00Z** (mgmt-ops-4) Lead: 4edb872 npm test 495/495, test:chrome 8/9 (fix-ab test CONTAMINATED by environment,
  topProcs name WindowServer/duetexpertd/zed/iTerm2/claude; accepted as an environmental pass). arch-finger plan landed
  2226d51 (WDA/XCUITest real touches); ts-gesture building gesture.mjs + wda.mjs (measurement code -> reviewer before
  landing); user setup pending. iPhone queue += ts-gesture V0 (~15 min) + V1 (~60 min) after the morph block, when ready.
  10 agents active: goal-metric holds wait for a quieter host or accept requeues (design engineers end in ~1 h).

- **08:55Z** HANDOVER. Snapshot landed (4edb872): all worktrees rebase + `baseline.mjs sparse` between steps; done:
  fix-hero-exit (7169a6a, 9e84199), mgmt-ops-2; HOLDING until their iPhone block ends: fix-nav-morph, fix-scroll-engine
  (iphone-runner serves from them). Base `aw1-10e` (/10e F-030 hotfix landed 60f66b6). Morph: g fixes the jitter, not the
  lag (rendering); scripted driver + mw10e-f/g/fb/gb/ge/gc queued on the phone as #1 after the hero block (B/P/P2/P3).
  Marquee idle check clean. Canary-fps watch still open.

- **08:33Z** Landed: ts-i021 stack 43e40ce (B-E + I-031; canary PASSED, npm test 462/462; I-027, I-031 RESOLVED), I-018.
  Morph root cause (fix-nav-morph): pin target 5312 > maxY 5220 → re-pins every frame against the bounce; candidate
  mw-g-pinclamp-osb waits for the user's finger block (lead). F-030: /10c face will-change churn ~1,500 writes/s at idle in
  the hero → fix-scroll-engine hotfix se10e (lands after parity + short review). hero-exit owns y 0-900 incl. F-032
  people-o. WATCH: canary baseline fps 78 / > 20 ms 57 vs ~92 / ~25 at 04:25Z (n=1, iPhone serving at the time).

- **08:11Z** USER FEEDBACK: no felt difference baseline vs aw1-10c on the iPhone; lag at END (morph pin at y 5220 runs
  10-18 fps under a finger, > 50 ms 50-75/pass) and TOP (hero y 0-900). New order: morph (fix-nav-morph resumed) →
  hero-exit (resumed) → N10. Landed: I-018 d61231e (traced attribution: 5 frames > 34 ms; gtag named; "other" class →
  fix-scroll-engine diagnostic on spare capacity), I-031 reviewed, docs. ts-i021 rebasing B-E + I-031 on I-018 → one
  test:chrome + one canary. npm test ~280 s (watch after B-E). Baseline freeze (ts-snapshot) in progress.

- **07:31Z** iPhone BACK (iphone-runner owns it; I may message it directly for scripted checks, finger tests via lead).
  iPhone goal check baseline → aw1-10c: > 50 ms 5→3, > 34 ms 16→9, fps 52.8→57.1; #1 target ~106 ms at y≈1970 → N10
  (fix-scroll-engine, 4 phone ablations d,c,b,a built d24a656). Chrome: page-owned > 50 ms 0 on aw1-10c, 1 vendor gtag
  frame (user-facing, lead). Landed: Q3 note d33d957 (wave1-dry ENDED), I-030 8bab8b7, docs. N13 CLOSED (0/49). N12 + #6
  land after finger verdict. I-031 opened (other CPU 20-26 % mid-hold) → ts-i021 top-5 process log after D/E.

- **06:32Z** Landed: ts-bench I-028 follow-up 1e2c402 (ts-bench ENDED for good), docs b586b9a + ff00155. N13 forced-toggle
  probe: 0 storms in 2 x 41 toggles → agents-ask visual NOT the trigger (F-027 supersedes F-026); N13 storm-catch hold
  (≤ 24 fresh loads, traced/untraced alternating) queued #2. N12 A/B `--on aw1-10c` starting 06:31 (waited 14 min: I-030,
  shorts pass a normal whose gate isn't settled; ts-i021 after I-027; workaround: no new shorts while a goal normal is #1).
  Bench pilot: tool OK (styleWrite Proxy counts), VACUOUS/FAIL rows are spec choices. Lead caffeinate until ~08:36Z.

- **06:16Z** Landed: /10c 8f9ebe5 (review-10c ACCEPT-WITH-NOTES; counts "> 50 ms 2 → 1 in the measured window, load-time
  cost bounded by mech probe, iPhone pending"), docs 1b8aeac + cc09344. Wave-2 base `aw1-10c` (hashes confirmed). E3 →
  F-026 storm → N13 (fix-scroll-engine, forced-toggle probe, before /10d). Part 4 done (diagnostic). I-018 NEEDS-WORK →
  CDP metrics opt-in, validation = one traced run + test:chrome. 05:56Z contamination = ts-i017 e2e outside the lock
  (rule now in CLAUDE.md). wave1-dry: pilot-only spec (B) + Q3-final requeue.

- **05:58Z** Landed: N11 fea23a5 (mechanism only), docs 7542538, I-028+I-029 4f5667d (ts-bench ENDED; review-i028
  ACCEPT-WITH-NOTES → one ts-bench follow-up commit, tracked in I-028 notes). /10c hold 05:39-05:46: > 50 ms 2→1 BETTER,
  > 34 ms 4→3 noise, F-011 gone 5/5, p95 +0.8 ms WORSE flag; review-10c on a7b95d1, lead lands on ACCEPT. Lead started the
  I-018 gate early (ts-i017 rebasing f71ee42 → reviewer → A/A on/off hold ahead of q3). Starvation note: shorts drained
  ahead of /10c ~13 min → ping lead when a goal-path normal waits > 10 min (mgmt-lead iteration 3 item).

- **05:17Z** (mgmt-ops-3) Lead: npm test 0e8f288 414/414; test:chrome 7/8, bench.chrome FAIL → I-028 (ts-bench, styleWrite
  probe vacuous). GO sent: ts-i021 (I-027 + I-026 reopen; no file overlap with I-028), wave1-dry (Q3 only; bench pilot held
  until I-028), fix-scroll-engine (/10c `--on all-wave1`). N11 hold 05:05-05:15: clean (0/10), goal metrics FLAT
  (> 50 ms 2→2, > 34 ms 3→4); waiting on owner phases.mjs readout before land/no-land. q3 took the lock 05:16 ahead of
  scroll-engine (normal ≤ 10 min). kpi friction: no alarms; warns IPHONE-PARKED/STALE, STRAY-CHROME (MCP Chrome 10.9 h).

- **05:02Z** GOAL HOLD done (all-wave1 42f4033 → main 0e8f288, F-022): > 50 ms 3→2, > 34 ms 5→5 within noise; fps
  93.8→110.6 hint; left > 50 ms = gtag (N11) + F-011 render frame (/10c). ts-bench batch landed (bench on main),
  ts-bench ENDED; lead's npm test + test:chrome on 0e8f288 running → then GO ts-i021 I-027. Wave 2: N11 queued (normal,
  GO given) → /10c → I-018 (f71ee42 review + A/A cdp-metrics on/off + test:chrome) → N12 → hero-exit → countdown 05/08
  → E4 (folded into attribution). DIRECTION updated (mgmt-ops/docs-2). apple-verify hold 5 done (report pending).

- **04:25Z** Landed: I-023/I-024A 48ace89+772e675+85fdeac, I-026 93b4af2 (holds keep the Mac awake), cap docs b93ec5f (npm
  test + commit lease 300 s). Canary PASSED on 93b4af2 (A/A runs 1 clean, test:chrome 7/7); I-017/22/23/24 RESOLVED,
  I-016 parked (e4 user/hooks, f P3). GO sent to wave1-dry 04:2xZ (goal hold, --max-seconds 1200). NEW floor: canary
  baseline fps 92, > 50 ms 4, > 34 ms 5 (vs ~75 fps pre-gate): never compare to old baselines. Mac slept 04:04-04:20Z
  with the lock free (I-026 gap → reopen note: assertion while anyone is QUEUED; lead caffeinate 4 h again; user asked
  about `pmset -c sleep 0`). Next: apple-verify ~4 min hold → N11 → /10c → N12; ts-bench rebase (lead) after the hold.

- **03:43Z** I-023 chain: 48ace89 (review NEEDS-WORK) + 772e675 fixup (review ACCEPT) + a 3rd commit (verify installs its own
  SIGINT/SIGTERM/SIGHUP handlers; re-entered holds had none and left Chrome running) committing now; test:chrome after it
  (772e675 was 6/7). Lead lands all 3 when 7/7, review-i023 re-checks the 3rd (1 file), then I-026 rebase, canary
  (`ab --aa --runs 1` + test:chrome), bench rebase (fake-chrome.mjs; review-bench ACCEPT-WITH-NOTES), then GO wave1-dry.
  Wave 2 ready: N11 (parity incl. pagehide flush), N12 v4 (parity 0/5, "20-34 ms band only"), scroll-engine /10c in mech-c.

- **02:55Z** Landed: I-021 0f29e7b+d10b132 (RESOLVED), I-020 4b1034e (RESOLVED), I-024B e7ce0e4, CLAUDE.md lock
  rules 10f7bee, N3 docs 6a0db1a, handover b579b78. I-027 (P2, ts-i021, after I-024A) opened. ts-i017 I-023/I-024A ETA
  ~03:35Z + queue (02:37Z probe: idle Chrome survives 80 s; sleep explains 1953 s). scroll-engine mech10: 339 ms LoAF
  in /10 only + layers 304->741 (re-run). N12 v2: nav reads ~0, parity desktop 24/168 (v3). N11: flush edge re-probe.
- **02:46Z** no change; ts-i017 moved to #1 by lead (02:37Z).

- **02:34Z** I-023/I-024A (P0, ts-i017) no sha; ts-i017 not queued yet (lead moves it to #1 on queue). No ALARM,
  host QUIET. NEW I-026 (env): Mac Maintenance Sleep/DarkWake during holds stalls timers (explains 933-940 s
  verify-fake); rec caffeinate/pmset = user. Land: mgmt-ops docs 6a0db1a (N3 rejected). User: I-026, Spotlight,
  FW_TOOLING hook, iPhone.
- **01:40Z** first digest after restart; incident candidate (hook npm test under load) became I-024 (lead).

## Next actions for the next mgmt-ops (in order; mgmt-ops-4 -> mgmt-ops-5, 11:24Z)

How mgmt-ops-4 worked (keep): **hub mode** (lead 10:35Z): owners, iphone-runner and research agents come to mgmt-ops;
the lead only lands, resolves incidents, reorders locks, spawns and talks to the user. Validate slot tickets (protocol
v2 §2.5: build + hashes, ONE control on the same base, driver, one question, prediction id, if-X-then-Y, probes,
minutes; warm-up per served port, U5), log every prediction in `fixes/PREDICTIONS.md` before the run and the result
after it, route results to the owner + the question's author, keep DIRECTION / handover / directory current, send LAND
BATCH shas. **Stamp times from `date -u`** (mgmt-ops-4 drifted ~5-10 min ahead twice). Wait with
`sh <scratchpad>/mgmt-ops/tick2.sh 150-240` (returns on incident changes; prints lock + phone state); messages arrive
between tool calls.

1. **iPhone order** (updated 13:5xZ by mgmt-ops-5; lead-ranked; 14:0xZ: P4 paused for a user blind swipe A/B of the
   countdown fix, 3 real-page pairs = first v3-style F stage): DONE: P0 (P-023), P1 (P-017 HIT), P2 (P-016b miss),
   F2 pre-check, finger batch F1-F6 (F6-try3 apple.com 0 >50 / 1 >34 moving; F6-try2 ~80 Hz stretches = F-071),
   ca-check wca2 (captured, `window.__ca` filled; analysis waits for a free chrome-measure), **P-029 HIT** (13:17-13:25Z),
   **P3 HIT** (13:35-13:44Z: P-019 re-dur + re-keep HIT, baseline-A third frame unresolved; P-020: reveal-end Layouts
   fire at rest = Card 4), **pacing v2 s1** (13:45-13:50Z: late-gap clip 8/8, P10 RELEASED). **NOW:** P4 ~14:00Z (A = F1
   arm-load P-013, B = F3 arm-scope P-022; T1a on/off A/A in its warm-up slot, definition from ts-iphone-run) -> P11
   Block A (P-028, ~40 min; Block B conditional) + **P14** (P-025, ~47-48 min; C aw1-10e, V1 st4-strict, V2
   re-contain-js `<scratchpad>/hero-exit/snap/re-contain-js`; separate sentinels) -> P12 -> **P10** (P-024, own gate: P1
   then the phone block) -> P5 ST-1 (P-018) -> P9 (P-026) -> **P-030** listener split (~25 min) -> **P-031 G** (rAF-rate
   pages; earlier if the phone idles) -> hero-B -> R2 bg -> /10d -> N12 -> P6-P8, P13. re-keep-op gain block: placed
   when fix-hero-exit sends its ticket; right BEFORE it, same session: one untimed attribution run at rest, re-keep-op vs
   re-keep (LayerTree read of the card + idle Paint events over it; ticket P-033 VALIDATED 14:1xZ, after P11 + P14, lead: no
   jump ahead), because a non-composited opacity-0.999 card may paint
   through a transparency layer on every repaint (UNRESOLVED; F-075 CONFIRMED the premise: presence flip none<->value in
   StyleDifference, claims-audit §2.8 762fc40).
   **14:1xZ:** P4 paused for the user's cdwc blind swipe A/B (pairs on mw10e-cdwc; pair 1 = "same" saved; pair 2 page 2
   running after a Safari-inspector stall); if it stalls again the phone goes back to P4 and the swipe test is
   rescheduled (lead). **review-cdwc NEEDS-WORK** (evidence + wording only): fix-nav-morph runs a short-lane
   inertness probe (panel scene paused, 0 faces with will-change at every 250 px step, both builds) + DPR 3 frozen-clock
   countdown crop (expect 0 %); a clean n=5 `--on aw1-10e --frame-log` only if the probe fails. Lead B3: NO waiver ->
   **P-032 G block aw1-10e vs mw10e-cdwc right after P4** (card from fix-nav-morph pending). P-029 (4) moving p95
   recorded OUTSIDE [28, 45] on the better side (median 23). **F-076 (UNRESOLVED) -> P-034 gate** on any countdown-ca
   ticket; put it in the fix-countdown-idle-raf spawn prompt (de-oss-map waits on it).
   **Swipe A/B (cdwc F stage) PAUSED after pairs 1-2 (both "same"; user feels the lag at the hero and the page end; tab
   stalled twice, some recordings lost); pair 3 moves to ts-user-console's console (iphone-runner keeps the key so it
   stays blind). User-facing steps go through the console once it lands, not the lead's chat.
   **LAND-REQUEST RULE (lead 14:3xZ, all agents):** before asking the lead to land, rebase on CURRENT main with a CLEAN
   tree (git status empty: commit or stash every edit); then send branch name + "tree clean, rebased on <main sha>" + SHAs.
   The lead only fast-forwards; a dirty tree or stale base bounces the request. Lead 14:3xZ also: ef802b9 (phone minShift
   4 ms, whole-ms medians) CONFIRMED, lands after ts-analysis adds the phone-platform guard (infer phone from meta.device,
   warn on explicit chrome) + review-stats OK, with doc-protocol-v2's §5 text; doc-protocol-v2 sends the lead replacement
   text for the CLAUDE.md phone-threshold line + Sentinel bullet, and updates fix-reviewer check 15. Spawned:
   ts-user-console, ts-lock-bundle (item 7b + sleep wording; branch worktree-agent-a413c9626c75bd1a3).
   **USER PRIORITY (lead 15:22Z, "make simulator task as highest priority"; overrides every order below):**
   chrome-measure: ts-sim and arch-sim before fix A/Bs and other toolsmiths (lead moved ts-sim to #1; whenever either
   queues, tell the lead to move it to the front; I-035 open, so don't trust "moved by lead" when the entry already
   sits at its own position); arch-sim fidelity holds are normal holds and outrank fix measurements. Phone: arch-sim
   real-device reference runs, if needed, go next after the current block, ahead of P-032 / P14 / P-035 (15:2xZ
   mgmt-ops-5 asked arch-sim for a ticket to iphone-runner by 15:31Z; none -> P-032 at 15:31Z, arch-sim after its
   block). Reviews/landing: anything ts-sim needs first (ts-analysis deviceOf = already on main a1fd3bc: "simulator"
   is its own device, stats refuse to pool it with iPhone/Chrome, exit 2); tell the lead THE MOMENT sim.mjs is ready
   (he spawns its reviewer). Broadcast 15:2xZ to arch-sim, ts-sim, iphone-runner, ts-analysis, ts-iphone-run,
   ts-lock-bundle, fix-nav-morph, fix-scroll-engine, fix-hero-exit, arch-claims, review-render-signals.
   **15:2xZ state:** P11 Block A DONE (P-028: HIT mechanism, MISS ms, NULL frame time; Block B DROPPED by the owner;
   lc-cq3 not a candidate) -> P14 after P-032. P-032 CLEARED: fix-nav-morph's owed (A)/(B) in the row (2 forward
   tweens/run, (4) kept; scorer <scratchpad>/fix-nav-morph/p032-score.mjs).
   **16:2xZ (resume after the usage reset):** landed f86290e (ts-analysis), c14b6b0 + a68376e (sim.mjs, review-sim
   ACCEPT-WITH-NOTES, npm test 716/716), 19a383d (arch-sim). Simulator verdict F-084: classes 1, 2, 4 not usable, class 3
   lead generator only, class 5 untested; FP-6 (gesture) not funded for now. Swipe pair 3 = "same" (0/2 V, catch passed):
   cdwc not felt, landing rests on P-032 alone. F-v3 run 1 = C-002 (fv3-set1.json), run 2 = C-004 (user, 16:2xZ). Phone
   next: C-004 -> cooling -> P-032 -> P14 -> P-035 G -> P-036 G. User question "phone over Wi-Fi, no cable": lead answered
   UNRESOLVED, check offered after C-004, HOLD until the user replies. I-032 B1 (paint units/layerScale) open with
   ts-render-signals. Digest to the lead every 30 min.
   **16:5xZ:** P14 (P-025, V1 = st4-noswap) and P-038 (PoC 2 blur-cubic, reveal only, behind P-033 gain) VALIDATED
   after second read. F-v3 scored per tester (7c95689): passive NOT FELT 2/4 for the user and a second tester -> P-035 G
   alone decides. User question "phone over Wi-Fi, no cable" ANSWERED (lead + user 16:45-16:53Z, OBSERVED, in I-040):
   cable out, devicectl sees the phone over the network but idevice_id -l/-n and iwdp :9221/:9222 show 0 for 1.5 min;
   cause UNRESOLVED (likely usbmuxd vs CoreDevice/RemoteXPC); decision: stay on the cable, no toolsmith. I-041 (lead):
   ts-lock-bundle's unlanded (f) co-hold code broke chrome-measure exclusivity 16:28-16:45Z; (f) tested on a temp
   FW_STATE_DIR only until it lands; both test:chrome runs in 16:38-16:45Z void; ts-iphone-run reruns npm test (short
   lane) before its land; ts-render-signals' I-032 land needs a clean test:chrome. Caffeinate renewed until ~18:45Z.
   **17:1xZ:** P-032 attempt 1 VOID (0 valid runs, WDA /actions 8-15 s per stroke -> I-042, env, blocking for every G
   block, owner ts-gesture). G blocks (P-032, P-035 G, P-036 G, P-031 G) WAIT for I-042; phone order meanwhile: P14 (W,
   ~17:17Z after cooling, iphone-runner rebased on main for I-037 b80a767 + probe v3, tools sha in meta) -> P12 -> P10
   -> P5 -> P-033 gain -> P-038 -> P9. Landed: I-035 (8935a7d), I-037 (b80a767, RESOLVED), T1a series, lanSafeUrl
   (7ec95a5); I-041 RESOLVED ((f) shelved on local branch ts-lock-bundle-f-shelf, never lands). Lead: NO redaction of
   the old fixes/iphone-wave2/raw LAN hosts (evidence integrity; user may overrule); new committed files carry none.
   **LATER (not urgent, needs a fix-reviewer pass before landing):** ts-lock-bundle 65903b9 docs, e143153 (a)(b) gate
   wake, 2f7751c `run --no-timing`, 3f2b100 (d) served-check retry (measurement-code pre-check), 1369205 (c)(e)
   HOST-DISPLAY-CHANGED; test:chrome for (d)/(e) only after they land (needs main's lock code).
   **17:2xZ PHONE ORDER (lead, supersedes 17:1xZ):** P14 (W, running) -> USER SITTING (lead holds the lease as owner
   `user`: render test A = original baseline vs B = best build now, mw10e-g + cdwc + arm-scope-c (+ re-keep-op if it
   combines cleanly), iphone-runner prepares; NOBODY touches the phone) -> ts-gesture I-042 slot (~15 min) -> P-033
   gain -> P-038 -> P12 -> P10 -> P5 -> P9. After I-042: P-032 G first (fresh block 1, full cap, stop at > 2 WDA
   voids), then P-036 G, then the next finger sitting. I-042 interim (ts-gesture): G strokes play as ~50 ms flicks
   (pointerMove durations dropped) -> ALL G data so far is invalid as a finger proxy; G stays blocked. I-035 RESOLVED
   (8935a7d, npm test 730/730). Console server stopped at its 2 h limit 17:16Z (lead restarts). After ts-progress lands:
   keep fixes/PROGRESS.json current on every P-row result, verdict or land.
   **SIM ROUTING (user rule, table approved by the lead 17:5xZ):** phone = P14, user sitting, ts-gesture's ~5 min I-042
   confirmation, P-033 gain, P-038, P10, P5, P9, P-030, hero-B, R2 bg, /10d, N12, P6, P8, P-032/P-035/P-036/P-031 G,
   finger sittings, P-037, P7 (Instruments), P13 (device memory), WDA re-sign before 10-08 (outside blocks). P12 = desk
   first (tldump on P11/F1 captures), phone only if they don't cover y≈2678. SIMULATOR: I-038 repro/fix check
   (ts-iphone-run), P-032 (b) mechanism re-checks (fix-nav-morph; only if WDA on the Sim plays strokes as written, ask
   ts-gesture), F-076 / P-034 face-layer check (fix-nav-morph, after cdwc lands; phone only if it decides a fix),
   de-unknowns-ux cancelable/DOM part (its timeStamp C2 part stays phone: Sim touches are host HID), R2 clip/backdrop
   look, T10 / Instruments-lane tooling dry runs. Told: ts-iphone-run, iphone-runner, ts-gesture, fix-nav-morph (acked);
   de-unknowns-ux was resumed by mistake before the lead said "live agents only". **17:5xZ de-unknowns-ux:** C2 phone
   slot after P-035 DROPPED (C2 read from the saved F drag visits, 68af31a, F-087: touch timeStamp taken before
   main-thread dispatch, moves coalesced while blocked; OBSERVED, source UNRESOLVED, arch-claims has it; P-035's
   N T T N N T drag runs repeat it); cancelable is logged by P-035 G on the phone at no cost, no Sim job. **No Sim touch
   driver exists yet** (`sim.mjs gesture` not built, FP-6 untested; `iphone.mjs gesture` with FW_WDA_URL at WDA-sim
   still asks for the iphone lease): every Sim job that needs strokes (P-032 (b) re-check) waits for one; ask ts-gesture.
   **PROGRESS.json (ts-progress, landed 7614401 + c9ceb98):** After every P-row result/verdict/drop/land: update
   fixes/PROGRESS.json (changes + checks[].result + next + updatedAt), run `node tools/console.mjs progress --check`,
   land with the docs batch; the page flags ledger results missing from it. Schema in the header of
   tools/lib/progress.mjs (fw-progress/1); plain words outside `details`; every `best[]` number has tag + driver in
   plain words + ref; updatedAt never later than now; updatedBy = own name; no URLs/IPs/hosts/device ids/names; when
   I-042 lands or a G block runs, update `next` of cdwc, f3-arm-scope, nonpassive-touch.
   **PHONE ORDER (lead 14:2xZ, supersedes the NOW line above):** P4 (started ~14:2xZ; block A + T1a A/A PASSED (ABBA aw1-10e S, on vs off: dt>50 3 vs 7, dt>34 18 vs 21, fps
   57.4 vs 57.3; T1a now absolute; minShift revisit CLOSED: HL p95 on-off +0.48 ms, n=2/arm (crude), stays 4 ms,
   ts-analysis 14:3xZ), 10 min, block B) -> P-033 step 0
   (lead 14:4xZ: after P4 B's end sentinel: F1 edge Timeline attribution run (fix-nav-morph), then P-033 step 0) -> 10 min cooling -> P-032 G cdwc (VALIDATED, ~20 min) -> 10 min cooling -> P-035 G-v3 (pacing v3, no user,
   ~20 min lease, filler; F-v3 waits for the user console) -> F3 G touch A/B aw1-10e vs mw10e-arm-scope (pacing v3 urls
   mode for F; G = P-036 VALIDATED 14:5xZ, runner opens the arms directly; lead 14:4xZ: F3 forward, F1 stops; P4 done
   14:45Z, phone 40.9 °C; P-033 step 0 PASS 14:47Z) ->
   P11 Block A + P14 -> P12 -> P10 -> P5 -> P-033 gain (VALIDATED; step 0 fills any free phone gap) -> P9 -> P-030 ->
   P-031 G -> hero-B -> R2 bg -> /10d -> N12 -> P6-P8, P13. P-033 "within noise" -> bundle candidate, not standalone.
   **mw10e-cdwc landing branch fix/mw10e-cdwc 6652ad9** (on 77c480e): review-cdwc round 2 resolved B1/B2/B4, B5 fixed; lands only
   after P-032 PASS (rebase on current main first); no further review round. P4 block A (P-013) done 14:25-14:30Z.
   **F-080 CONFIRMED (arch-oss-survey, 14:5xZ):** on the phone linear() freezes during main-thread blocks (transform +
   filter), cubic-bezier and sampled WAAPI keep moving. Routed: PoC 2 blur-easing-cubic -> fix-hero-exit (h1 owner);
   PoC 3 countdown-ca -> fix-nav-morph after cdwc (first attribute the countdown's 1 Hz idle spike; with P-034);
   morph-ca -> fix-nav-morph (blur/opacity/scale usable; backdrop undecided, needs a larger-contrast lane).
   arch-oss-survey: no unlanded commits. Step-0 side observation (idle whole-view Layouts at rest on #people: rotator
   ~25-30 ms per tick; ~750 x 0.75 ms per 20 s from a per-frame RecalculateStyles) -> fix-scroll-engine + de-pm-hero.
   **NAMED 15:0xZ, F-081 (OBSERVED, 1 run/arm, time association):** of ~795 small Layouts / 20 s: countdown digit spring
   rAF (re-keep JS L4039, started by the 1 s setInterval L4142; on screen, so the off-screen gate rightly keeps it) ~320;
   accent stroke-dashoffset 0.9 s animation (CSS L1274-1280, JS timers L3858/3864/3869, ~5 cycles / 20 s) ~440;
   avatars-exit ~24; other 9. Cost ~165 ms / 20 s (~0.21 ms each, ~0.8 % main thread), no long frame -> no ticket now
   (fix-scroll-engine); option: 2-3 min untimed rider (accent off + spring snapped, rest at y 904); accent fix idea:
   animate a mask/clip transform instead of stroke-dashoffset. Why stroke-dashoffset invalidates WebKit layout:
   UNRESOLVED. **CORRECTION 15:0xZ (fix-scroll-engine): the spring is REFUTED as the dirtier** (co-occurrence inside
   accent windows; spring frames have small Layouts 13 % vs 23 % without; it raises only ScheduleStyleRecalculation);
   residual outside accent windows (~65 / 7.6 s) leans to the rotator (~40 % within 60 ms of L11571 vs ~10 % expected).
   Lead: F-081 rider skipped. de-pm-hero b050627: §7.9 risk VOID at rest; D3 rotator prediction HIT (2 per cycle).
   **Lead 15:0xZ:** arch-claims owns the Instruments render-hitch lane definition; ts-iphone-run builds its tooling after
   I-037 + the probe v3 fix (not urgent). P-037 (PoC 3 idle attribution, fix-nav-morph) VALIDATED as filler after
   P-036. ts-lock-bundle implements (f) shared short holds next (short lane waited 17 min > 15 min line), reviewer gate
   kept. F-081 residual by Layout root (fix-scroll-engine, all < 5 ms): ~23 near rotator ticks = 104x32 subtree at
   (58, 2054) inside Composite-after-paint beside a Cloudflare-beacon PerformanceObserver callback (image-load size
   invalidation after the src swap? UNRESOLVED); ~31 RenderView-rooted after script-less style recalc (some CSS
   animation, UNRESOLVED); ~7 countdown tick = 398x52 subtree at (16, 920).
   **USER CONSOLE LIVE (lead 15:2xZ; tools/console.mjs 4698218, CLAUDE.md 9666bba; server from the lead at
   localhost:5559):** EVERY user-facing step goes through `node tools/console.mjs post` (then `wait --until
   started|recording|done|answered`), never the lead's chat. iphone-runner posts swipe pair 3 (redo page 1 + page 2, key
   in --meta) and de-unknowns-ux F-v3, but per lead 15:3xZ ONE BATCHED RESTED SITTING: swipe pair 3 + F-v3 + P-031 F +
   P-036 F posted together once every agent-side flow is ready and a ~20-25 min phone gap fits (after G-v3 P-035 and
   P-036 G); mgmt-ops tells the lead when posted (one heads-up to the user). Waits: wait.mjs / lock.mjs wait only, no
   sleep or until-grep loops (lead 15:3xZ). iphone-runner stops its old serve.mjs processes (ports 54xx) not needed for
   P11 / P-032 / P14 / the sitting (own processes only; 5173 is the user's).
   **P-032 BLOCKED 15:1xZ by I-038** (morph-log hook = 2nd inspector connection hangs the gesture tool; iphone-runner's
   I-039 is a duplicate -> lead merges); lead approved amendment (b) (t0 = first defaultPrevented touchmove per end push),
   second-read OK 15:2xZ with 5 conditions (see the P-032 row); runs hook-free after P11 Block A (running ~15:20Z) + cooling.
   Caffeinate: lead renewed 16:4xZ for 2 h -> ends ~18:45Z, remind ~18:30Z.
   **I-037 [open, blocking]:** iPhone tools pick a background app's about:blank web view instead of Safari's tab.
   Lead 15:0xZ: 7b(f) option (A) not taken to the user (rebases change the staged tree; enforcement layer); (f) stays a
   design in ts-lock-bundle's ticket; tell the lead if short-lane waits exceed ~15 min again.
   **F-076 / P-034 owner = fix-nav-morph after cdwc lands** (lead: same countdown code; no fix-countdown-idle-raf spawn).
   Toolsmith bundle: lead spawns after ts-wait's npm test on main (c4a1ee2) passes. ts-user-console (tools/console.mjs:
   user-facing step console, agents `console.mjs wait <id> --until started|answered`) in progress.
   **arch-sim** (iOS Simulator fidelity): normal chrome-measure holds <= 420 s, announced to mgmt-ops each time;
   `--port auto`; own iwdp `-c null:9231,SIMULATOR:9232` (iwdp attaches only configured devices, so never the phone);
   no iphone lease; results tagged meta.device "simulator".
   **ts-analysis eea3c06 -> review-stats NEEDS-WORK** (cross-block driver pooling unwarned; "near thresholds" line pools
   frames across runs, §5.3): ts-analysis fixing; lands only after ACCEPT. Protocol questions (lead 14:1xZ): (a) A5
   "threshold-sensitive" wording vs code (code flags when gt46 or gt54 differs from gt50, stricter) -> doc-protocol-v2;
   (b) phone p50/p95 minimum shift -> arch-claims DECIDED 14:2xZ: 4 ms (the ±4 band; phone stamps 1 ms,
   off-grid, claims-audit §2.3), phone median futility in whole ms (not ticks); revisit after P4's T1a A/A (|HL p95
   shift| >= 4 ms raises the floor); Chrome unchanged; sent to ts-analysis for the eea3c06 fix. (a) DONE doc-protocol-v2 157eeea (docs follow the code: threshold-sensitive if EITHER twin's verdict differs; near
   bands half-open (30, 38] / (46, 54]; rAF-rate text per 6f71f51). Lead-only: CLAUDE.md phone line wording, CLAUDE.md
   "Sentinel" bullet vs the Timeline-block sentinel, fix-reviewer check 15 phone tick forms.
   **Pacing v2 (de-unknowns-ux e64b6de, pacing-result §4):** verdict accepted on intent (§0/§2), OBSERVED, one user, not
   rested; §3 sign erratum added with the scoring commit, kept visible. **Lead rule 13:5xZ: pre-registered rules get a
   second reader (arch-claims or mgmt-ops) BEFORE data arrives.** de-unknowns-ux drafts a pacing v3 (touch A/B) plan; it
   could replace P-031's F part.
   **Lead 13:5xZ: pacing v3 APPROVED** (arm 3 passive vs non-passive touchmove = decision arm; load from measured phone
   long tasks; synthetic, but the swipe-and-pick UI + scorer also wrap two URLs): **F stage of every fix = a blind
   real-page swipe A/B via the v3 UI** (first user: cdwc countdown fix); second reader before data; G first, then F rested.
   doc-protocol-v2 folds this into protocol §5 when convenient.
   **F-071 [OBSERVED] (arch-claims 13:2xZ):** finger/touch scrolls show sustained 12-13 ms (~80 Hz) rAF stretches
   (F6-try2 563/1027, try3 171/1385; fastwork E1 seg1 43/352, A1 seg2 30/816); S/W runs and idle show 16-17 ms. fps
   and frame counts from F/G runs do not compare with S/W runs; ms thresholds unaffected. ver-rafrate checks the cause;
   proposed CLAUDE.md qualifier after verification: "60 Hz idle and in scripted scrolls; ~80 Hz observed in finger scrolls".
   **WDA signing profile expires 2026-10-08T12:19:35Z** (free team, ts-gesture): re-run `wda build` before then.
   Pacing v2 page: research/design-engineering/pacing/v2.html (d28c2cb); F5 result = F-069 OBSERVED n=1.
   **Phone scoring (lead, CLAUDE.md 668b612, supersedes the v>=3 decision):** dt > 50 goal (target 0) + dt > 34, counts
   at ±4 ms (dt>46/54, dt>30/38), "threshold-sensitive" if the verdict differs; no k forms on the phone; Low Power Mode
   per run. fix-reviewer check 15 updated (13da193).
   **Timeline-block sentinel (lead 12:5xZ, every Timeline block: P3, P11, P14, listener):** one uncounted Timeline-OFF
   control sentinel run after the warm-ups and one at the block end carry the >=58/>=44 rule (a failure voids the block);
   counted runs keep Timeline on in every arm, judged within the block; record counted C fps with Timeline on as info.
   If Timeline-on C >= 44 data exists, only the end sentinel is needed. doc-protocol-v2 writes it into protocol §5.
   **Probe rule (lead 13:3xZ):** T1a landed (f8e7d5a) but counts as absolute only after a T1a on/off A/A in P4's warm-up
   slot (approved); until then counted runs use the P0-cleared logger (P-029, P3 did). T1a deltas f8e7d5a on e0b3821 (npm test 630 before rebase, unit 308 after; docH null at
   y 0 / raf-legacy, told ts-analysis); phone dt>50/34 ±4 ms reporting is a separate measurement-code change (lead).
   **Holds:** fixed-size morph diagnostic, ghr85a, R7, R8 nav half, a1 (behind the countdown fix), h4.
   Countdown fix mw10e-cdwc (CSS 5dc6e8e37388 on aw1-10e; 269df637 differed only in a comment, never served) lands on phone gain evidence + review; mechanism wording stays
   OBSERVED ("repaint of the faces removed (observed)") until ver-webkit-paint reports (lead).
2. **USER-ASK BUNDLE: answered 11:3xZ.** Approved: C1 (the lead runs it himself in the main checkout after T8+ /
   I-033 lands and is reviewed, when the user is away from the Mac; P-027), F6 (phone visits the Apple page), T10
   (Instruments pairing). WDA setup by the user in progress (step 1 Xcode account done 11:4xZ). The finger batch
   F1-F7 + R2 clip look: tell the lead when its pages are built (mw-stub: fix-nav-morph; pacing page: de-unknowns-ux;
   fw-clip-probe exists) AND P1/P2 are done; the lead pings the user.
3. **Results routing:** y≈1960 -> fix-nav-morph (touch-only class: G or F before landing; F1 landing gate = touch latency,
   finger F4); morph -> fix-nav-morph + de-pm-morph (Composite carries the cost, ~78 layers per cycle; R1/R2 refuted);
   hero -> fix-hero-exit + de-pm-hero; y-source -> arch-lead; ca-check -> arch-oss-survey + de-oss-map (if F-048
   confirmed: OSS P2 blur-easing-cubic fixes our own T10 base and goes first); N14 -> fix-scroll-engine.
4. **Pending lands:** none from docs agents (12:3xZ main bd6762e: docs-2 196af02, doc-protocol-v2 1b09dad/5ffb00c/cb74826). Toolsmiths: ts-host-state
   T8+ (I-033), ts-bench-gain (I-034, nit 1), ts-render-signals (I-032), ts-iphone-run (T1a), ts-gesture follow-up. fix-scroll-engine's /10d
   stays parked until its phone check (no base change mid-queue).
5. ts-gesture notes (apply once landed): `wda build` = `node tools/lock.mjs run chrome-measure --owner iphone-runner
   --max-seconds 600 -- node tools/iphone.mjs wda build --owner iphone-runner` (normal lane, iphone lease, xcodebuild
   capped at 540 s); gesture key `pinReversals` -> `pin` (`pin.excursions`, `pin.fight`, `pin.bounces`); first G run:
   check perStroke `endLagMs` is not always 0 (review-gesture-2 B1). (17:3xZ: moot until I-042; every G stroke so far
   was a ~50 ms flick, F-085; redo this check on the first valid G run after the fix.)
6. Caffeinate: lead started a new one 18:13Z until ~20:13Z; remind the lead ~19:55Z. Display has been on since 06:22:55Z (back-tag ddc3450): holds after 06:22Z compare.
7. **Toolsmith asks from ts-analysis (review-stats T3 nits; need a lead spawn):** (nit 1) `tools/bench.mjs` calls
   `gainVerdict` at :555 and :689 without try/catch; since 86424b0 bench-stats throws on non-finite input, so a null/NaN
   scenario metric crashes bench (and in reconfirm loses later topics' tier B results) instead of INCONCLUSIVE. Fix
   drafted (~15 lines + 1 test, not measurement code): `tools/lib/bench-gain.mjs` series() drops non-finite values into
   `errors`; draft in `<scratchpad>/ts-analysis/nit1-series.diff` + `bench-gain-series.test.mjs`. (nit 3, for the T2
   spawn prompt) `stats.mjs runs` scores a run with some non-finite frame times on its finite frames only (`partial`),
   so count metrics read better: T2 must auto-void a counted run that loses more than a few percent of its frames
   (reason in `meta.void`). iphone-runner voids such runs by hand until T2 exists.
   **ts-iphone-run status for the T2 prompt (relayed by mgmt-ops-4, 11:4xZ):** U7 done (e96e5b5: meta.wallStartMs,
   pre.clock {wallMs, perfMs}); U9 done (meta.settings: media queries, hardwareConcurrency, batteryPct/charging; Low
   Power, Limit Frame Rate, case, brightness, content blockers, feature flags recorded 'unknown'); U2 covered (raw dt,
   both k>=5/k>=7 and >34/>50); **U5 open -> T2**: `iphone.mjs run --warmup` is only a label, so tickets keep the
   uncounted warm-up per served port by hand until T2 lands. T1a review starts after the probeVersion bump (raf-legacy
   optional since the A9 lift, lead 747d80a).
7c2. **ts-lock-bundle 7b (f) shared short holds: NOT implemented (proposal 14:5xZ, its own ticket if wanted).** "One holder"
   is an invariant of status/release, FW_LOCK_HELD re-entry + keepAwake, last-grant + 900 s drain budget, doctor/repair,
   wda buildGate, iphone measureGuard, `lock.mjs wait --until`, verify's gate record + holds.log. Design if wanted: a
   separate `<r>.cohold.json` slot, granted only when holder AND requester are short, no live normal waiter (movedBy
   counts as normal), drain budget unspent, slot free, different checkout; normal waiters need holder + slot free and pass
   the host gate on a fresh window; release/stale/doctor/repair/status learn the slot. Gates: 2 concurrent `npm test` x3
   on an idle host, 0 failures, wall time recorded (no gain if >= 2x one); a test that a normal grant never happens while
   the slot is taken (incl. stale paths). Cheaper first: (A) pre-commit skips `npm test` when the same staged tree
   (git write-tree) passed in the last N min (pass stamp in the shared git dir; changes .githooks = USER decision);
   (B) slow fake-Chrome e2e files opt-in for commits outside their area (riskier). Today's queue: 7 entries, 6 short.
7b. **Toolsmith queue (lead 11:5xZ; spawn after T8+ / I-034 land, not urgent):** (1) I-035: `lock.mjs repair --move X
   --to <X's current position> --apply` prints "moved by lead" but writes no movedBy, so short jobs pass X (workaround:
   move to 2, then to 1). (2) Proposal: `lock.mjs run --no-timing` (or similar) that skips the host gate and marks the
   hold non-measuring (the wda build waited for quiet while the user worked at the Mac); no arch spawn (lead 12:0xZ): the
   I-035 toolsmith writes the proposal in the same task; the lead's measurement-code fix-reviewer is the sign-off (a
   non-measuring hold must never let a timing run start on a loud host). **Same ticket (lead 12:5xZ):** (a) the head
   waiter at the gate calls keepAwakeQueued while gated (lib/lock.mjs acquire); (b) a gate sleep longer than timeoutSec
   must not end in a throw on wake; (c) N2: tag a gain judged against a calibration stored in another display state.
   (d) (lead 13:4xZ) flaky fixture-server request timeout under load: tests/e2e/baseline-snapshot.test.mjs:138
   (fix.mjs:312 'timeout …/2.fixture.js'). (e) display-off detection only tested with fake readings. T8+ landed
   (21ec95a + 34f6069, I-033 RESOLVED 13:4xZ): spawn when the lead decides.
7e. **USER DECISION 12:20Z: host gate quiet-CPU threshold 20 -> 25 %** (20 % was uncalibrated, provisional per the
   09-30 post-mortem). ts-gate25 (toolsmith) makes the change and checks the existing results.json host-busy data on
   whether 30 % is safe later. A/Bs stay comparable: the config records the threshold. T8+ (599471e) is NEEDS-WORK
   (review-host-state: 2 small blocking items, with ts-host-state); I-035 + --no-timing stay queued after T8+.
7d. **NEW RULE (user, CLAUDE.md 71ad57d):** a browser/engine limitation is OBSERVED until confirmed against docs, spec,
   engine source or a bug tracker (cited). mgmt-ops signs no card that relies on an OBSERVED claim as its mechanism
   (experiments that TEST a claim are fine); route arch-claims' refuted/weakened claims to owners and amend tickets.
7c. **F-059 / F-064: CONFIRMED by source AND check (13:0xZ, F-066):** Chrome 154 0 layerPainted in all 4 arms, CfT 143
   8/10 (root contents layer); CompositeAfterPaint theory REFUTED (143 has CAP and still fires). paint-rects --on/off
   A/A: scroll 86.6 -> 66.6 fps, so "never in timing runs" stands. New caveat (res-layerpainted, OBSERVED/inference): a
   will-change layer whose only change is a solid background colour gets no layerPainted and no paint on 143 (solid-colour
   layer = property update?), so paint counts/rects may miss such changes; routed to doc-protocol-v2 + ts-render-signals.
   History (12:2xZ):
   layerPainted is dead on M148+ because of Chromium 1bf9d9eb ("[HiC] Allow cc::Layer update rect mutation during
   paint callback", crbug 488803411): `LayerTreeHost::WillCommit` resets update_rect before probe::LayerTreePainted;
   not CompositeAfterPaint. Decisive 7-arm check (Chrome 154 vs CfT 143, ~70 s short lane) -> ts-render-signals.
   Corrections routed: doc-protocol-v2 = protocol §2.4 l.124, §3.7, §6.2 + devtools-render-metrics.md l.51/214/268/
   283/292 + morph-endpage.md V3 l.333; ts-render-signals = paint-rects.mjs l.10-11 in its T6+T7 commit;
   res-layerpainted posts the correcting finding. The lead digests F-059 into FINDINGS only after the check. paintCount
   fallback stays; trace-snapshot rects are opt-in, attribution only.
8. Backlog for mgmt-lead (none urgent): as before (recheck pauses, gate.since, WindowServer in the gate, verify has no
   load phase, trace buffer, review-10e note (a)); plus T8+ host record (ts-host-state), protocol amendments A1-A9.

## Where the project stands (08:55Z; see DIRECTION for 11:2xZ)

- main = 4edb872 (snapshot) on the wave-2 base `aw1-10e` = all-wave1 + scroll-engine /10e. Chrome: page-owned > 50 ms
  frames 0; 1 vendor frame per run (gtag `onscrollend`, removable only by the site's GA "Scrolls" setting; user-facing,
  lead). I-018 attribution: remaining > 34 ms classes = gtag, nav `ee()` forced style (N12 v5 fixes), a 429-element
  restyle at +1.1 s, paint.
- iPhone (scripted, aw1-10c): > 50 ms 5→3, > 34 ms 16→9; user feels NO difference. Felt lag: morph pin (10-18 fps, render
  cost, three per-frame blur radii suspected) and the hero window (y≈50 frame, F-032 people-o reflow).
- Closed today: N11 (mechanism only, vendor), N13 (rare, not reproducible), I-018, I-026-I-031, I-028/029.

## Incidents (10-02 08:3xZ; see `incident.mjs list`)

| id | state | owner | note |
|---|---|---|---|
| I-068 | RESOLVED not-a-bug (Mac idle sleep; C-024) | ts-i063 | console thread wait overran its timeout |
| I-074 | RESOLVED (47b38a0) | ts-i074 | user T-028: proposals get a "Try it" panel with live original vs PoC iframes |
| I-076 | open, ts-i076 | ts-i076 | npm test wall time 285-293 s, close to the shared lane's 300 s cap; ts-i076 spawned 23:2xZ (with I-072) |
| I-075 | RESOLVED (aac5b4a) | ts-i075 | phone heat tooling: battery logger, power keys, served-hash GETs on non-mirror pages |
| I-073 | RESOLVED (5f37fcb) | ts-i073 | LAN address resolver + placeholder; CLAUDE.md edit with the user's OK (T-026 #5) |
| I-072 | open, non-blocking, ts-i076 | lead | WDA e2e tests left 3 fake-xcodebuild/fake-iproxy orphans (14 h); killed by the lead; not sim-warm (ts-i063) |
| I-071 | RESOLVED not-a-bug (Idle Sleep; test:chrome 13/13 at 17:38Z) | ts-i063 | test:chrome check.chrome failed (no check.json); bisect 9135b35 vs 0aa2227 |
| I-070 | RESOLVED (0de8103) | ts-i070 | keep the Mac awake only during measurement holds (caffeinate -i -s) |
| I-069 | RESOLVED (0aa2227) | ts-i063 | sim safari-restart on a restored data: tab |
| I-066 | RESOLVED (dc5651c) | ts-i063 | sparse worktree's leftover site*/ shadowed the baseline |
| I-065 | RESOLVED (bdc2e04) | ts-i063 | flaky unit tests: a proposal test; console.test.mjs:274 ms-boundary endedAt |
| I-064 | RESOLVED (11bc722); user YES to deleting the old recorder | ts-i064 | ioscap review fixes F2-F5; blocks the ioscap first run |
| I-063 | RESOLVED (0aa2227; measurement code) | ts-i063 | sim.mjs session cold-boots the Simulator every hold; shared holds can't keep it booted |
| I-062 | RESOLVED (4df8bb2; npm test 1149/1149) | ts-i062 | ioscap recorder; first run gated on review-ioscap + a console step |
| I-061 | RESOLVED 10:44Z (517fdb4) | (lead) | PROGRESS build data schema |
| I-060 | RESOLVED 10:44Z | ts-i060 | progress page "Right now": show the job and the fix, not only the holder (user T-020) |
| I-059 | RESOLVED 10:0xZ, landed 17eeb1a + 62b4053 | ts-i059 | console: a runner-ended part can be marked Done by the user; fix (A) runner-ended parts + (B) "Start over" (T-019 #7) |
| I-056 | RESOLVED 09:3xZ, landed d2d77ad (phone runs no longer wait for shared groups, `--require-quiet` opts in) | ts-i056 | phone measure guard (a) shared group as short, (b) same-owner --no-timing exception (lets S/W/M blocks use the preferred quiet hold), (c) gesture-run guard, (d) shared readers log to holds.log |
| I-058 | open | toolsmith (lead spawning) | waits invisible on the board; fixed-time waits where a probe exists (user T-016) |
| – | resolved 10-02: I-053 (proposal options, 42c14a0), I-054 (Range, 67847b4), I-055 + I-057 (flaky e2e, 42c14a0) | – | console restarted 08:22Z with options live |

## Peer directory (F-046; keep current, send to every agent that joins)

**Rules for every spawn prompt (send with the directory):** GitHub only through the `gh` CLI, read-only, never plain `curl` (user T-071, memory/github-via-gh.md, a8f1806d; F-203); `--owner` on every wait (I-108); long `--wait` or `lock.mjs run`, never a short-timeout acquire retry (F-202, I-113); `iphone.mjs wda status` before a G hold (I-112).

Lead decision 10:35Z: agents work peer to peer; **mgmt-ops is the hub** for everything that is not lead-only (land,
incident resolution, lock reorder, spawn, user). Role names work only if `ListAgents` shows them; else use the ID.

| address | owns | state (10-02 12:0xZ by mgmt-ops-7; rows refreshed 10-03 08:2xZ by mgmt-ops-9, 09:4xZ by mgmt-ops-10) |
|---|---|---|
| `main` | lead: lands, resolves incidents, reorders locks, spawns, talks to the user | alive |
| `ts-i119` (name; spawned 10-04 06:1xZ, user T-076 #12) | toolsmith I-119: a thread reply may carry an `http://lan:<port>/` link, stored as "lan" and resolved only when shown (like steps) | alive |
| `ts-i124` (name; spawned 10-04 06:3xZ, user T-049 #22) | toolsmith I-124 disk hardening: alarm at 20 GB, timing holds refused below 8 GB, per-writer/per-agent report with "cited by", self-deleting temp profiles, frames kept only on a diff, a paste-ready delete block for the user; auto-delete waits on the user's yes/no in T-049 | alive |
| `review-cd-roll-ca-4` (name; spawned 10-04 06:3xZ) | fix-reviewer, round 4 on cd-roll-ca (deliverables dd878533, evidence fa302685); pixel tier ruled T2 (PR-010 wide numbers, A/A in Chrome + Simulator) | alive |
| `ts-i118` (name; spawned 10-04 05:4xZ, user T-074) | toolsmith I-118: per-agent console page /agent/<name>, /agents list in the nav, agent names linked on Status, Progress and Threads, CLI `status.mjs agent <name>`; coordinates files with ts-i103 | alive |
| `wi-gpu-bundle` (name; spawned 10-04 05:4xZ, user T-073) | integrator: GPU preview build = best build + hero R2 + morph-gpu + cd-roll-ca; identity, pixel and function checks only (no timing); Try-it for the user | alive |
| `ts-i115` (name; spawned 10-04 05:0xZ, user T-071 #10) | I-115 landed 8961e042 (resolved); next I-113, then I-116 (lead 05:1xZ) | alive |
| `de-frame-audit` (name; spawned 10-04 04:4xZ, user T-066 #11/#12) | page-wide audit of per-frame and per-second script: is each result visible at that moment, would skipping or batching it remove work; checks the Svelte batching claim (docs, tick()); counts only, shared lane, no phone, ~90 min; user-facing answers go through T-066 | done 10-04 05:3xZ (da543cb3 on main, T-067 #2-#3 posted) |
| `ts-i100` (name; spawned 10-03 19:3xZ) | I-100: reduced-motion option for sim.mjs sessions (matchMedia check, restored at session end); unblocks P-089's WebKit reduced-motion leg and the T-034 Sim reduced-motion gap | alive |
| `fix-carousel-leaver` (a468e571c76f341a1) | carousel-leaver: st6-rb2 leaving face (T-042 #10); P-086 done (miss), P-087 build F PASS 7643f68, measuring | alive (10-03 18:4xZ) |
| `fix-morph-gpu` (a4e37c413d9ae3d5b) | morph-gpu: end-of-page morph on the GPU (T-046 #5); PR-012 published (92aab2c), phone block only after an accept | idle, waits on the user (10-03 18:4xZ) |
| `ts-proposal-talk` (a0dd48d8c04a74e8a) | T-048 talk in proposals (5466194 landed), T-050 thread routing (3dfc627 + a2f487f) | alive |
| `ts-i099` (name; spawned 10-03 18:3xZ) | I-099: lock-shared-cli kill-grace test races under load (non-blocking) | alive |
| `ts-i097` (name) | I-097 lead-move rule, `lock.mjs leave`, SIGKILL grace (6deb294, bea8564) | done: I-097 resolved |
| `ts-i095` (aa7a9a59d414fe6cd) | I-095 temp-file hygiene (disk full) | done: I-095 resolved |
| `de-image-cost` (a674d18f45fc08b12) | T-042 #3 image cost study (4a17ad3 landed; F-192) | done |
| `arch-thread-routing` (ac83100f0aabb7793) | T-050 thread routing design (df03d80, 1e9126e) | done |
| `iphone-runner` (a7696771bf38f1229), 10-03 | P-081 and P-085 blocks done; C-035 posted; owns countdown threads for C-035 and phone-queue | alive (10-03 18:4xZ) |
| `mgmt-ops-10` (named; spawned by the lead after 10-03 08:2xZ) | ops hub: handover, land batches, PREDICTIONS P-ids, PROGRESS.json, ticket second reads | alive (from 10-03 08:2xZ). mgmt-ops-9 (acfd7a13b6014f754) ENDED after the ack; mgmt-ops-8 and earlier are RETIRED. Next: mgmt-ops-11 at ~60 % context |
| `fix-nav-morph` (name) | f3-arm-scope (F3, D build; P-071 done, P-073 signed and running), panel-clock attribution pair (F-165), cdwc (parked) | alive (10-03 09:4xZ): P-073 done (row 5, inconclusive, da0ef39); F3 waits on the cost card with a cold-first-pin row (lead), no phone block until it reports |
| `de-gpu` (ae7885a4cf83f8d7b) | T-030 GPU/compositor-only CSS (research/gpu-props/, 41563ad, F-145) | done 10-03 00:1xZ |
| `fix-cd-strip` (name) | cd-strip: countdown digits as sliding strips (T-030 F1, user priority #1); PR-008 on hold, rev 2 after G12-G14 | alive (10-03 08:2xZ) |
| `fix-hero-exit-threaded` (name) | hero-exit-threaded: hero exit as a scroll-driven animation (T-030 F2); review NEEDS-FIX fixes, then P-074 ticket | alive (10-03 08:2xZ) |
| `fix-cd-roll-ca` (name, not `cd-roll-ca`; id a65f148991747deb7) | cd-roll-ca: countdown roll on the GPU, stacks on cd-strip (T-030 #10); paused until the strips decision | alive (10-03 08:2xZ) |
| `fix-platform-idle` (name; new 10-03 07:2xZ) | heat goal (T-029, P-068: Fastwork warms the phone ~5x apple.com): glint-ca + sweep-exact, unparked | alive |
| `map-rest-script` (name; new 10-03 07:2xZ) | heat goal: read-only map of the middle-section script work at rest | alive |
| `ts-proposal-hold` (name; 10-03 07:2xZ) | T-030 #19: console proposal hold/unhold and a "stale: re-decide" state on revise | done: cd966b7 landed |
| `arch-isolated-measure` (name; ID a41fb01cae3b26082) | T-029 isolated measurement and heat plan (1ed2419); P-075 pilot and P-076 per-tick check done (landed 30d4c7f); cost card design README §6, Mac WebKit desk research §7 | alive (10-03 09:4xZ) |
| `ts-lease-renew` (name; new 10-03 12:0xZ, toolsmith, worktree) | I-091: a lease renew that shortens a live lease | alive |
| `ts-ipad-sim` (name; ID a06bca9b99e53bb60, toolsmith) | I-087 (iPad Simulator + rotation in sim.mjs, user T-040), I-088 (fw-sim left Booted, blocking cd-roll-ca) | alive |
| `ts-thread-images` (name; ID ab47e809a72bc59ad, toolsmith) | I-089 (images in console threads, 525921c landed), I-090 (comment on any element, T-043) | alive |
| `de-pixel-rule` (name) | T-042 pixel-tolerance rule: PR-010 drafts (5b74b50, rev 2 519610e) | alive |
| rest-script fix owner (lock owner `rest-script`; ID a326003adcb764633) | heat goal: script work at rest, P-080 (v2; supersedes P-078) | alive |
| `ts-costcard` (name; new 10-03 09:4xZ, toolsmith, worktree) | I-083: builds `tools/costcard.mjs` from isolated-measurement README §6 (event-aligned window, Paint-clip area, Chrome layer memory, Animation failure reasons, md writer, tests); first consumer: fix-nav-morph's F3 records | alive |
| `ts-i082` (name) | I-082: Sim sessions in the Simulator's background CPU storm (fix 7e28dce on main, resolve pending) | alive |
| `fix-pill-swap` (name) | pill-swap: community-pill avatar template swap, full-viewport Layout 2/s at pastHero (JS 11415-11447; from F-146), on st6-rb2 | done: dropped at D (9df12de, 10-03 01:3xZ) |
| `ts-i078` (name) | I-078: `sim session` refuses while fw-sim is "Shutting Down" (workaround: wait, retry) | done: I-078 resolved 84a0982 |
| `arch-memory` (name) | T-032: agent memory into the project (proposal cfe3693, waits on the user's two OKs) | alive (10-03 00:2xZ) |
| `fix-nav-morph` ID | a277ea00c8773c1ea; also takes the morph panel dvh height after P-036 | – |
| ts-i077 (UNNAMED: agent ID a46d520fdb1912d3c; the name does not resolve) | I-077 (open after park), talks to the lead | done: I-077 resolved 793c8bc (10-03 00:5xZ) |
| `iphone-runner` (a7696771bf38f1229) | phone blocks, sentinels, logger | alive (10-03 09:4xZ): P-073 done 08:35Z, idle; P-074 (hero-exit) next once its ticket passes (ops re-read + review-hero-exit ACCEPT) |
| `fix-scroll-engine` (a1722cf5058e25591) | fwreskip (PR-005 posted, waits on the user); hero-carousel (parked) | alive |
| `de-illusion-style` (afc7d9fff1fcc6154) | illusion-proposals / word-alone (P-065, PR-004): Sim counts, 1 % pixel cause, Chrome call tree | alive (phone part on hold) |
| `fix-image-size` (new 12:0xZ; ID af756241c686d490e) | image-size: P-066 falsified (no detectable saving), dropped; null write-up 909464c | done |
| `de-countdown` (a097ffbf8f44a4d14) | T-024 countdown-faces (board priority #1; apple.com off-screen-pause reference) | alive: X1 stage 2 phone block running (10-03 00:0xZ) |
| `de-heat` (a19ec71e8ca8fff91) | T-029 phone heat, P-068 ticket (research/phone-heat/) | done (run ended 10-03 00:1xZ); P-068 H1/H2 run by iphone-runner after P-036, scorer to be named by the lead |
| `de-gpu` (ID via ListAgents) | T-030 GPU/compositor-only CSS for animations (research/gpu-props/), no phone, no timing | alive |
| `de-safari-mac` (ID via ListAgents) | T-023: Safari on the Mac as an iPhone stand-in (read-only research) | done (user: no, thanks) |
| `review-ioscap` (ac18cae341e16fdc7) | privacy review of tools/ioscap.mjs (SAFE WITH FIXES -> I-064, resolved 11bc722) | done |
| `ts-i063` (spawned 12:05Z; ID via ListAgents) | I-063, I-065, I-066, I-069 (follow-up 5678f13 landed), I-068/I-071 (not-a-bug); I-071 check.chrome hardening staged, waits for an awake Mac | alive |
| `ts-i070` (ID via ListAgents) | I-070: caffeinate only measurement holds (resolved 0de8103) | done |
| `review-i063` (ID via ListAgents) | read-only fix-reviewer of ts-i063's batch (measurement code: host.simWarm) | alive |
| `ts-i064` | I-064 toolsmith (rounds 1-2 landed 8ec1c6d, 11bc722) | done |
| `wi-stack` (a93135040e12a061d) | best-stack, shell-hold-c (landed 81dbc9b), F-129; an optional Sim spot check is parked | done |
| `fix-scene-scope` (a49a278f1d0bd6803) | scene-scope / RBi40pti (landed 1ce70e8), st6-rb2 restack (cff1a03); r4-v3 unassigned and parked | done (worktree kept) |

Rows from the 10-01 session (fix-nav-morph, fix-hero-exit, ts-*, arch-*, de-*, review-*, and others) were removed at
12:0xZ: those agents are not live in this session. Their owners in PROGRESS.json (fix-nav-morph for cdwc, f3-arm-scope
and pin-clamp; fix-hero-exit for re-keep-op and blur-cubic) are now historical; ask the lead before messaging them. The
old table is in this file's git history (before this commit).

## Who waits on what (08:55Z)

| agent | state | waits on | next |
|---|---|---|---|
| iphone-runner | owns the phone; hero block (B/P/P2/P3) | – | morph driver block → N12 → N10 |
| fix-nav-morph | morph owner (#1); driver + mw10e-* builds 4732f6c; holds rebase/sparse until morph AND N12 blocks end; building h-fixedpanel (lead) | morph driver block results | h vs b decide → R1 size-stable panel or N2/R7 |
| fix-hero-exit | hero window owner (#2) + h1 coordinator; 6e0a49f (rebased + sparse) | hero-A (h1v2 vs P, h1 vs P2; 6e0a49f) then hero-B bisect, on the phone | if h1v2 wins: review (a11y change, 14 MB) → one Chrome A/B `--on aw1-10e` |
| fix-scroll-engine | N10 a-d deprioritized (y≈1960 -> fix-nav-morph 09:48Z); rebased 272f6c7 + sparse; N10 overlays frozen (aw1-10e 3e2f599a, d 7de8ee9a) | phone (last in queue) | R2 built: r2-bg-layers 91d7571 (CSS ce301ce3, parity 0 %, F-040), queued on the phone before N12; /10d built: se10d-aw1 e920843 (JS ff58a433, CSS = aw1-10e; idle F-030 0/s, parity 0 diffs, restore bug fixed, quiet gate works); needs review + A/B + phone after N10 verdict; /10d Chrome A/B waits for the e1/e2 verdict; offered read-only look at de-middle R3 (unowned) |
| ts-snapshot | DONE: 5 follow-up commits on worktree-agent-a29e6d138799d9fb8 (git-guard unwrap, BASELINE verdict prefix + per-run re-check in verify = MEASUREMENT CODE, SCOPE SNAPSHOT, settings.json worktree deny rules, docs) | review-snapshot-fu; user OK for the enforcement-layer commits | lead lands (never mid-block), then test:chrome + canary; owners rebase after the announcement |
| arch-finger | plan landed 2226d51 (finger-simulation.md) | – | – |
| ts-gesture | toolsmith: gesture.mjs + wda.mjs vs a fake WDA | user's one-time setup (Xcode, Developer Mode, UI Automation) | reviewer, then V0/V1 on the phone (queue b2) |
| de-morph, de-hero, de-middle | notes landed (5c4fc37, 7576f74, 7d60f9f); de-morph resumed 09:3xZ to reconcile with the driver numbers | – | – |
| arch-devtools, de-devtools | NEW (user request ~10:15Z), read-only, narrowed to Chrome: DevTools methodology / render-metric blind spots | – | report to the lead |
| arch-safari, de-safari | NEW (user request ~10:18Z), read-only: Safari Web Inspector / iOS probing (research/architecture/safari-inspector-probing.md) and the iOS per-frame time model + probes for morph and hero (research/design-engineering/safari-render-signals.md) | – | probe proposals go to the lead before anything runs on the phone |
| de-apple | landed 1babddb; NEW (user request 09:3xZ): apple.com rendering math -> research/design-engineering/apple-math.md | – | reports to the lead |
| ts-i017, ts-i021, ts-bench, wave1-dry, N11, apple-verify | ENDED | – | do not resume without the lead |

## Priority order (user feedback 08:04Z; DIRECTION "Priority from user feedback")

(1) morph on WebKit (fix-nav-morph) → (2) hero window y 0-900 (fix-hero-exit) → (3) N10 y≈1970 (fix-scroll-engine) →
/10d → countdown 05/08. Chrome-only 20-50 ms work on spare capacity. New variants `--on aw1-10e`; normal holds ≤ 10 min.

## Queue rules and monitors

- Shorts: ONE 300 s lease for commit + hook, gate open; `--timeout 14400` on every `lock.mjs run`/`acquire` wait.
- I-030 landed: shorts never pass a lead-moved normal and pass any gated normal only in its first 120 s. Still ping the
  lead when a goal-path normal waits > 10 min. Quick shorts ≤ ~90 s while a goal normal is #1 are accepted.
- Outside a lock slot: unit test files only (CLAUDE.md); no builds (combine, npx) while a normal holds chrome-measure.
- HOLDER-IDLE > 5 min with 3+ waiting → lead IMMEDIATELY. Friction scan (`node research/management/tools/kpi.mjs
  --friction`) at check-ins; ALARM in 2 consecutive check-ins → incident candidate.
- No Monitors armed. Use the foreground `tick.sh` (scratchpad `mgmt-ops/`); it points at the mgmt-ops-2 worktree.
- Measurement-code canary: any verify/cdp/fix-ab change lands only after `ab --aa --runs 1` on main + test:chrome.
- Reviewer checklist (LEAD.md §4, F-030): topics adding observers/listeners/attribute writes get an idle-counts probe at
  y=0 before landing.

## Open user-facing questions (lead holds them)

Chrome vendor residual (gtag `onscrollend`, site GA "Scrolls" setting); pmset sleep setting (caffeinate stopgap); finger
tests (C/D #6 postponed until a morph render fix exists); arch-finger's touch-simulation plan.
