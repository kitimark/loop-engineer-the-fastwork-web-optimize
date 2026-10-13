# Status board

| id | title | kind | owner | state | note |
|---|---|---|---|---|---|
| accent-ca | Hero accent word on the graphics side (accent-ca) | fix | fix-accent-ca | landed | Exact accent boil landed on main (87775b6e); phone no-worse check runs in v8's phone block (v8 integrator) |
| anim-transform | Endless sweep and line animations in the platform section | fix | unassigned | dropped | Superseded by platform-idle (glint-ca + sweep-exact, exact GPU forms), unparked for the heat goal (T-029, P-068) |
| art-ar-gifs | Article GIFs from iPhone -ar- recordings | research | art-ar-gifs | done | All article GIFs done: Day 8 menu, Day 3 carousel, Day 8 People title (v2 recordings, moon checked) |
| art-beforeafter | Article before/after animation (script) | research | art-beforeafter | landed | landed b576354b (script + v8 MP4s); v9 re-run when v9-best is built |
| art-day2-day5-clips | Day 2 / Day 5 article clips | research | art-day2-day5-clips | done | Day 2 / Day 5 clips recorded and cut (1f103f12); in article v110 for the owner's review |
| art-join-closeup | Day 9 Join close-up GIF | research | art-join-closeup | done | Day 9 close-up GIFs done, incl. 3-panel versions with the original site |
| art-medium-verify | Medium draft verify + writer playbook | ops | art-medium-verify | landed | follow-ups landed (transfer check, title first, trailing line); writer told |
| art-medium-visuals | Medium images of the team article's visuals | research | art-medium-visuals | done | Medium images v01-v11 and the copy made; script landed 602a2a0b; GIFs held until the user rules on the Fastwork-images banner (T-170 #81) |
| art-rec | Part 1 draft pictures (art-rec) | ops | art-rec | done | Part 1 draft pictures in place (Day 5 redo, Day 6, Day 9 logo); hand-back to the lead |
| art-worst-cases | Article: worst cases on the original | research | art-worst-cases | landed | Six real-iPhone clips in the article (C-066 OK); 9 commits, research/team-article only |
| article-clips | Article clips: original vs v10 on the real iPhone | research | arch-article-clips | parked | Waits for the finished v10 build (A + pause + hit-skip + nolift + I-219), not the v10 prep that landed at f0988c76; the lead resumes it when int-v8 posts the v10 pins |
| best-stack | Stack test: five candidates on today's best build | fix | iphone-runner | done | Landed: the best build before v8. Superseded by v7 and the coming v8. Ignore the label 'nothing to land'. |
| blur-cubic-v8 | blur-cubic on v8 (T-153) | research | lead | closed-no-fix | blur-cubic on v8 doubles the #people frame-2 Composite (Sim C 55 vs V 111 ms); stays out; landed 4ae4dff9 |
| blur-cubic | Card reveal blur with a standard easing curve | fix | fix-hero-exit | closed-no-fix | blur-cubic stays out: v8 + blur-cubic doubles the people-cards frame in the Simulator (4ae4dff9, T-153 #10) |
| breakpoints-v7 | Screen-size check of v7 vs baseline | research | de-breakpoints-v7 | done | v7 screen-size check delivered: v7-check.md, commit 243858a5 |
| breakpoints | Breakpoint coverage (T-034) | research | de-breakpoints | done | T-034 done: census 15/15 landed, PR-015 accepted (keep, no code change); last commit d06367e1 awaiting ops read and landing |
| build-cf-review | Cloudflare review folders (local build) | ops | build-cf-review | done | review folders built and checked; copied to main checkout out/cf-review (not deployed) |
| cap-end-openclose | End of page: menu open/close in one take (orig vs g0.0m) | phone | cap-end-openclose | landed | Day 11 done: reveal flick (eee99e1a) and swipe replay + 9 Oct slow drags on 3 builds (45d31225); kit ad134ce0/c5941c40; 4 + 30 clean runs, Serious 36.7-40.0 C, no Critical |
| cap-end-orig | P-137o: original at the end of the page (Fig. 8) | phone | cap-end-orig | done | P-137o (63d887b8) and P-095o (6b0edc30) measured and written up; condition cleared, Safari parked, phone handed on |
| cap-finger-hero | Hero cards with the user's own finger: original vs g0.0m (T-170 #193) | phone | cap-finger-hero | done | landed on main 1763cef4: the user's finger recordings + 8 robot replays, orig vs g0.0m |
| cap-heat-builds | P-068b phone heat: later builds (F, B, V6, M) | phone | cap-heat-builds | landed | P-068b done: corr H1/H2 F -0.198/-0.221, B +0.269/+0.270, v6 +0.057/+0.098, g0.0m +0.057/+0.115; README section committed d0e2996b |
| carousel-leaver | Avatar slider leaving face (st6-rb2) | fix | fix-carousel-leaver | landed | Closed: PR-013 accepted keep-st6 (user, 02:59:56Z); write-up + decision on main 619d5303; st6-rb2 slider stays as is |
| cd-roll-ca-r4 | P-097 rev 4: panel clock WAAPI roll on v9-final | fix | fix-cd-roll-ca-r4 | parked | paused for the end-of-page morph focus (T-204 #4); P-147 set A ready |
| cd-roll-ca | Countdown roll as one GPU animation per digit (user-approved, near-identical) | fix | fix-cd-roll-ca | landed | K deliverable landed 54627150; joins v8 (int-v8 builds it) |
| cd-strip | Countdown digits as sliding strips (GPU, identical) | fix | fix-cd-strip | landed | strip-tc landed on main 5ce2b7f5 (T-055 cost-count basis; reduced motion exact); cd-roll-ca and de-countdown told |
| cdwc | Countdown fix: digits stop repainting when the end panel moves | fix | fix-nav-morph | done | In best build (v7); end-panel slow frames 1-27 -> 0 |
| chat-audit | Audit of the chat export for confidential data (T-170 #441) | research | de-chat-audit | done | Audit done: no identifiers or third-party names; private links (C) and personal context (D) listed for the user; 3 files in scratchpad/de-chat-audit |
| claims-audit | Platform claims checked against references | research | arch-claims | done | Finished: claims are now checked on demand when a fix relies on one (T-070). |
| cm-return | cm-return: PR-030 end card back on g0.0h, glass+nav flicker fixed | fix | fix-cm-return | done | g0.0k landed bfac24c6, best build; P-173 PASS |
| compositor-morph | Compositor-only end morph (transform/opacity, scroll-driven) | research | arch-compositor-morph | closed-no-fix | PR-033 (bar row hold/late) rejected by the user 15:36Z; v14's bar motion stays (it follows the original's top calc at <=640 px); rest cost = known K6 cost (F-330) |
| console-nav | Console menu and notifications | tool | ts-console-nav | done | menu, badge and alerts landed |
| console-threads | Threads page in the user console (talk to the lead) | tool | ts-console-threads | landed | landed 2beae72 + dbe73f1 (CLAUDE.md rule) |
| costcard | Rendering cost card tool | tool | ts-costcard | landed | cost card tool on main as 07b16da; lead's npm test queued (#2 shared) before I-083 closes |
| count-checks | Fast count checks before phone tests (restyled elements, layers, paints) | research | de-counts-chrome | done | Finished: its count checks are now part of every fix's cost card (taken off the board, T-070). |
| countdown-ca | Countdown ticking at rest | fix | fix-nav-morph | dropped | Dropped (Progress: see its why); cd-roll-ca carries the countdown work |
| countdown-faces | Countdown: 3 faces per digit, no hidden animation (T-024) | fix | de-countdown | landed | done: landed on main; goes into the next best build (v8) with its phone no-worse check |
| countdown-tick | Countdown self-correcting tick (no skipped second under heat) | fix | fix-countdown-tick | parked | Kit on main (a7476c9f, 20a923bf, a8b94f36); no step until P-130 data; lead resumes fix-countdown-tick with the result |
| de-offscreen | Off-screen layers: do g0.0e/g0.0f render outside the viewport? | research | de-offscreen | parked | Nav/end-menu layer census done (T-253 #7, commit 19c1fbd9); items 3 and 3b handed to fix-g0-box |
| de-pm-hero | Hero post-mortem (rotator layout) | research | de-pm-hero | landed | landed 589c8da |
| deck-chrome | Deck blink on fast fling (Chrome attribution) | research | fix-deck-chrome | done | cause: people card reveal starts after the deck is on screen (blank, then blur, then sharp); K removes it, D doesn't; committed d9774531 |
| deck-contain | Profile deck size containment | fix | fix-deck-contain | parked | P-149: L and R done (R3 T0 at all 20 Chrome stops), S1 done (1 unstable stop), S2 not run; interim UNDECIDED-UNSTABLE |
| desk | User desk (threads, progress pages) | ops | mgmt-desk-2 | parked | mgmt-desk-2 handed back; the lead is the desk for now (I-163). No listener running. |
| device-plan | Device plan: who holds and who is next on the phone, Mac and Simulator | ops | lead | done | Team stopped gracefully on the user's request (T-274). Final: g0.0m best build; article live on Medium; waiting for Fastwork's answer. |
| devices | Device dispatcher (iPhone + Mac lock idle watch) | ops | mgmt-devices | parked | P-124 (7d phone count) waits on the user's PR-023 decision (proposal replaced the swipe test, T-175 #3); phone free, nothing startable |
| direction | Direction: order of the day and next lead decisions | ops | lead | done | Team stopped gracefully on the user's request (T-274). Final: g0.0m best build; article live on Medium; waiting for Fastwork's answer. |
| double-drive-fix | v8 double-driven cards: future card + commission card (T-157) | fix | lead | done | P-118 NO-WORSE under xcode-serious, ops read a8f03130 (re-score byte-identical); in v9 step 4 |
| end-bg | Optimize all images (T-193 #28) | research | fix-end-bg | parked | P-150 cost card signed (PASS on Chrome R1-R4; Simulator R1 INVALID, cache); addendum df71bdbd |
| end-fresh | End-of-page morph: independent fresh review | research | arch-end-fresh | closed-no-fix | D1b/P-163 line superseded: the user chose the original end-of-page (PR-034, g0.0b best) |
| end-morph-int | End morph on v9-final: F1 + U2 build for fix-end-morph | fix | int-v8 | dropped | Superseded: P-152 failed F1+U2 (09:05Z ruling); the v10 base is now decided by P-155 (F1-only / U2-only split), tracked in the v10 row |
| end-morph-p1 | End morph P1 (composited clip reveal) on v9-final | fix | fix-end-morph-p1 | landed | P-156 read, ruling (A into v10), O1 attribution and the new phone kit landed on main (e76e0ff7) |
| end-morph | End-of-page nav morph smoothness (T-204) | fix | fix-end-morph | closed-no-fix | PR-029 rev 4 (shimmer freeze on v14) rejected by the user 15:36Z; end-of-page work continues in end-fresh (P-163) |
| f3-arm-scope | F3: touch listeners set up once (the hitch in the middle) | fix | fix-nav-morph | landed | F3 landed as aaffbb57 (clean branch land-f3); C-042 V 4/5, C-044 catch passed |
| fg-guard | Guard: long commands only in the background (user T-152) | tool | ts-fg-guard | landed | landed on main; long commands now refused in the foreground |
| frame-audit | Frame audit (T-066) | research | de-frame-audit | done | Landed affda47d; summary in T-067 (#2, #3). Next steps wait for the user (T-073 priority 3). |
| fwreskip | A size write in the middle of the page (y about 2990) | fix | fix-scroll-engine | dropped | Dropped (Progress: see its why) |
| g0-box | g0 M3-B: nav box clip-path reveal | fix | fix-g0-box | closed-no-fix | superseded by PR-040 / g0.0k; te frame confirmed by fix-cm-return's counts |
| g0-gpu | g0.1: original end menu, card and section fades on the GPU | fix | fix-g0-gpu | done | g0.1a on v0 landed (063cfb7b); port onto g0.0 recorded as 968a7c64: parity ok, no gain on g0.0 (box re-layout M3 is the remaining cost) |
| g0-revert | g0.0: v14 with the original end-of-page | fix | fix-g0-revert | done | PR-034 rev 2 accepted (g0) 18:44Z; g0.0b = current best (BEST_BUILDS) |
| gpu-lessons | What made the countdown smoother, and where else it applies (T-096) | research | arch-gpu-lessons | landed | landed f23e0c4e (README) and 63117cc1 (frameworks.md, T-102) |
| gpu-original | g0: original scroll on the GPU | research | arch-gpu-original | done | g0 design landed (c55e06a0); build steps g0.0 (fix-g0-revert) and g0.1 (fix-g0-gpu) spawned in parallel |
| gpu-preview | GPU preview build (best build + 3 GPU fixes) | fix | wi-gpu-bundle | landed | GPU preview record landed on main (0f03aef1); PR-016 draft rev 2 to be published by the lead after the current swipe set |
| gpu-props | GPU/compositor-only CSS for animations (T-030) | research | de-gpu | done | README committed efa4c5d: toolbar not the cause; 3 ranked briefs cd-strip, hero-exit-threaded, cd-roll-ca |
| headless | Headless Chrome functional checks | tool | ts-headless | landed | landed 68ea33d; review: nothing serious |
| headless60 | Headless-60 timing calibration | research | cal-headless60 | landed | landed 6db585f: headless 60 Hz, 7x count-equivalent to phone S (OBSERVED), not a timing replacement; timing stays exclusive (cap 1) |
| hero-carousel | Avatar carousel: each tick re-lays out the whole page | fix | fix-scroll-engine | landed | S7 Gain landed (affe99a): idle >34 V 0 vs C 19-27; st6 confirmed on the phone |
| hero-covered-pause | Pause the hero's animations while it cannot be seen (under the People card or off screen) | fix | fix-people-gpu | done | docs landed 1a9fd53e; delta goes into the build after v10 (int-v8) |
| hero-exit-threaded | Hero fade-out on Safari's scroll thread (GPU, identical) | fix | fix-hero-exit-threaded | done | In best build v7. PR-018 rev 7 work is tracked on row pr-018-menu-morph. |
| i038-inspector | Gesture tool hangs when a second inspector connection closes (I-038) | tool | ts-iphone-run | done | Done: the gesture-tool fix (I-038) is on main; nothing left. |
| i042-gesture | Robot finger on the phone: strokes play as flicks (I-042) | tool | ts-gesture | landed | 176d888 on main: compiler v2 (hash ee84ebd4…), sim.mjs gesture (timed), safari-restart; peers told |
| i044-unlink | Status board: owner can drop a derived incident line (I-044) | tool | ts-status-board | landed | landed a4fe740 |
| i045-proposal-watch | I-045 proposal decision watch | tool | ts-proposal-watch | landed | I-045 landed as f1566a3; lead resolves after npm test on main |
| i047-phone-park | I-047 park Safari between phone blocks | tool | ts-phone-park | landed | landed on main ae2e08d (I-046/I-047/I-049) |
| i048-progress-lane | I-048 shared lane on progress page and status board | tool | ts-progress-lane | done | I-048 resolved; npm test 974/974 on main |
| i050-sim-stale-tab | I-050 sim open: stale restored Safari tab | tool | ts-phone-park | done | I-050 resolved; npm test on main 990/990 after landing |
| i052-sim-safari-cache | I-052 Sim Safari starts with an empty HTTP cache | tool | ts-phone-park | landed | I-052 landed on main (cb894b1); npm test 995/995 on main; incident resolved |
| i053-proposal-options | Proposal options (pick one) | tool | ts-i053 | landed | I-053 options, I-055, I-057 landed on main (d26035f); console server restarted 08:22Z |
| i063-sim | Simulator stays booted between checks (I-063) | tool | ts-i063 | done | Finished: the Simulator fix is on main; the optional extra check is not needed now (T-070). |
| i074-live-frames | Side-by-side live pages in proposals | tool | ts-i074 | done | PR-007 Try it live in the console (restarted 23:25Z) |
| i074 | Try-it panel in proposals (T-028) | tool | lead | dropped | duplicate row; tracked in i074-live-frames (ts-i074) |
| i075 | Phone battery keys + skip served fetch (I-075) | tool | ts-i075 | landed | I-075 landed 56f3862 (battery keys, served skip), npm test 1331/1331 |
| i076 | Faster test suite and no leftover test processes (I-076, I-072) | tool | ts-i076 | landed | landed 7cbbd32: npm test 163 s (was 299 s), fixtures never outlive their test; I-076 and I-072 resolved |
| i077 | Open a page after Safari was parked (I-077) | tool | ts-i077 | landed | Landed e5cb15a; npm test on main queued in the shared lane (behind P-036 holds); resolve after it passes |
| i078 | Simulator join waits out a shutdown in progress (I-078) | tool | ts-i078 | landed | Landed ba79209 (npm test on main 1343/1343); I-078 resolved |
| i081 | Short-lane last-grant record left on idle lock | tool | ts-i081 | landed | landed 03b3d81, npm test 1363/1363, I-081 resolved |
| i082 | Sim background CPU (I-082) | tool | ts-i082 | landed | 17e7d04 on main, npm test 1373/1373, I-082 resolved |
| i093-live-base | Try it: compare against the current best build (I-093) | tool | ts-i093 | landed | landed e60d691; npm test on main 1467/1467; console restarted; I-093 resolved |
| i095-space | Disk space: temp Chrome profile cleanup + space report (I-095) | tool | ts-i095 | landed | landed on main as cbc38ee; lead runs npm test on main, then resolves |
| i096-comments | Comments on every console page | tool | ts-proposal-talk | landed | landed ead0a10, console restarted; resolve after lead npm test on main |
| i097-lock | Lock: lead move beats reader rule; lock leave | tool | ts-i097 | done | landed on main as 5fab2ce (+ docs 5c125ed); my npm test re-run dropped, the lead's run on main covers it |
| i131 | Stale cached builds on reused ports (I-131) | tool | ts-i131 | landed | landed on main c7427cd0 |
| i132 | Flaky agent-link page test (I-132) | tool | ts-i132 | landed | landed on main 25c95377 |
| i136 | Lock: readers ahead of exclusive join group; phone-block hold priority | tool | ts-i136 | landed | landed on main 7ba0456d |
| i219-hydrate | I-219 hydrate failure (nav earn span) | fix | fix-i219-hydrate | parked | Waits for the finished v10 build (not the v10 prep at f0988c76); the lead resolves I-219 when v10 lands |
| i223-usb-port | Phone on another USB port: no device | tool | ts-i223 | done | landed 49a7ea05; I-223 resolved |
| i228-scrubber | Thread scrubber false positives (I-228, I-139) | tool | ts-i228 | landed | Landed 3b5744ac; npm test on main 2412/2412; I-228 and I-139 resolved |
| i265-agents-page | Agents page sees live team agents (I-265) | tool | ts-I-265 | landed | landed 6cd00479, npm test 2525/2525, console restarted |
| i268-release-init | Release: untracked snapshot check + npm run init | tool | ts-i268-release-init | done | 04b1e3f0 + 865dac94 landed on main; I-268 complete |
| i269-release-rewrite | Release history rewrite (I-269) | tool | ts-i269-release-rewrite | testing | rebased on 865dac94; secret-kv follow-up commit, hook npm test running |
| i270-release-export | Release export tooling (I-270) | tool | ts-i270-release-export | done | I-270 series on main (d2a8de82, 77163fca, ec0fc117, 2e8e0bbb); branch = main; nothing pending |
| i273-release-chat | Release chat export from the lead's transcripts | tool | ts-i273-release-chat | dropped | user dropped the chat export (T-170 #454) |
| i274-teammate-stall | Flag teammates not woken by their background jobs | tool | ts-i274-teammate-stall | landed | b032b8cc on main; I-274 resolved |
| illusion-proposals | Cheaper look-alike effects (user priority 2) | fix | de-illusion-style | done | Closed, no change used: 5 image/video ways to draw the word 'you' did not beat today's on the phone; drawn alone it had 0 slow frames (P-065). Other look-alikes became their own fixes. |
| image-cost | Image cost study (T-042 point 3) | research | de-image-cost | landed | Image cost study landed f2eef48 (lead); T-042 got the image summary |
| image-size | Images bigger than they need to be (memory) | fix | fix-image-size | dropped | Null result: P-066 falsified (Sim images A/A up to 29 MB > -15 MB). Not pixel-identical either. README+manifest+rebuild committed (79a1224); land request sent |
| ipad-sim | iPad Simulator device + rotation for sim.mjs (I-087) | tool | ts-ipad-sim | landed | Landed on main (72d628a) |
| isolated-measure | Isolated-element measurement plan (heat) | research | arch-isolated-measure | done | landed on main at 606451f: P-075 pilot readout, P-076 PASS, cost card §6 (I-083 ts-costcard builds the tool), Mac WebKit §7 |
| join-fade | Join waitlist fade: corners and gap (T-242) | fix | fix-join-fade | landed | PR-036 accepted 03:02Z; in best build g0.0e (8d831601) |
| lock-share | Shared lane: functional checks run beside timing runs | tool | ts-lock-share | landed | I-051 landed on main (344cf09, 6c1c2c1, dc14755); npm test 1002/1002 on main; incident resolved |
| logo-close | Logo jump at end-of-page close (T-245) | fix | fix-logo-close | landed | PR-037 accepted 03:02Z; in best build g0.0e (8d831601) |
| memory-structure | Move agent memory into the project | research | arch-memory | landed | memory/ + CLAUDE.md import landed a286d37; takes effect in a fresh session (helper in this session still saw the old CLAUDE.md) |
| menu-layers | End menu: drop overlap layers + panel clock repaint (T-253 #10) | fix | fix-menu-layers | landed | landed as g0.0i (26ccb25d), best build |
| morph-close-peak | PR-018 closing-frame repaint (morph panel) | fix | fix-morph-gpu | landed | g11 v9.1 close landed a31f1b3f; goes into v9.1 with scroll-cb after P-122 |
| morph-first-open | Menu first open after load: why it costs more | research | fix-morph-gpu | closed-no-fix | Located, closed with no fix (lead 2026-10-05): first decode of panel images off main thread; reopen only if a phone run shows a first-open penalty |
| morph-gpu-rev2 | morph-gpu rev 2 (reveal setup before the tween) | fix | fix-morph-gpu | dropped | superseded by rev 3 (one CSS line), which joins v8 |
| morph-gpu | End-of-page morph on the GPU | fix | fix-morph-gpu | done | rev 3 in best build v8 |
| nav-earn | Nav Join waitlist at end-section morph (T-148) | fix | fix-nav-earn | done | PR-021 rev 3 landed (3924a306); double-drive check: top-bar close retargets 8 (rev 2) to 0 (rev 3), sent to fix-double-drive |
| nav-fade | Nav Join + language button fade lag (T-183 #4) | fix | fix-nav-fade | parked | P-142 (v9.2) never landed; re-check against v11 when the lead resumes it |
| nav-hit-cache | Nav colour without a per-frame hit test | fix | fix-nav-morph | parked | v9.3 prep done: both v9.2 pixel spots are per-load phase (F-294); U2 eligible for v9.3 per lead ruling; 16 commits sent for landing (head d73e4c92) |
| ops-clerk | Ops clerk (Sonnet) | ops | mgmt-clerk-1 | parked | digest sent 19:13Z; nothing pending |
| ops | Ops hub: predictions, progress summary, handover, land batches | ops | mgmt-ops-10 | parked | mgmt-ops-10 parked (T-196 #3): bookkeeping to mgmt-clerk-1, reads to per-read ops-reader-<P>; Reader brief in ops-handover (3e795c62) |
| p117-combined | P-117 combined phone no-worse (v8 + nav-hit-cache + scroll-cb) | phone | int-v8 | dropped | Superseded by P-120 (v9 step 4 phone block); closed by ops 56574c22, lead ruling |
| pages-build | GitHub Pages export (local) | ops | pages-build | done | Pages export refreshed: article uses the Pages before-after figure (3 MP4 files), v5/v9 relabelled; 123.6 MB; all Chrome load checks + video check pass |
| panel-dvh | Morph panel dvh height on toolbar resize (C-026) | research | fix-nav-morph | done | C-026 dvh hypothesis REFUTED from existing phone data: toolbar never moves while the jack is active (0/1136 frames, 54 G runs); no fix (1c2831f9) |
| panel-height | End-page nav panel taller than the visible iPhone screen (T-204 #20) | fix | fix-panel-height | parked | PR-028 changes-requested: rev 3 after the end-of-page morph work lands (rebase both options, measure, Try-it) |
| people-avatars | People word + avatar row lag (user T-107 #1): trace and propose | research | fix-hero-exit-threaded | parked | Lead 01:16Z: GPU O + small images not taken now; cause is hero layout (F-227), which v6-v9 move to the compositor. Re-check on build v9 first. |
| people-blink | people section blink on g0.0j | fix | fix-scrollcb-g0 | done | g0.0l landed 3604cb31, best build; P-174 PASS |
| people-gpu | People section title and card on the compositor | fix | fix-people-gpu | parked | PR-031 accepted 00:09Z; X2 is gated and built into v11X by int-v11 after the v11-nw block; nothing for fix-people-gpu until a gate fails |
| people-word | People word animation timing (proposal) | fix | fix-people-word | landed | PR-024 option a accepted; README + patch.diff committed (head dbdf8cec), unit tests 1250/1250 |
| phone-cool | Phone cooling by battery temperature (T-009) | tool | ts-phone-cool | landed | landed cd16414 (wait.mjs phone-temp + protocol/CLAUDE.md sentinel line) |
| phone-fwreskip-g1 | Phone: fwreskip finger fling up through the people cards (ticket G1, B vs P) | phone | iphone-runner | done | Block 1 inconclusive (B n=1); P slower at the #people un-skip on a fast fling up; block 2 cancelled; replaced by G1b (P2, P-060) |
| phone-heat | Phone heat: Fastwork vs apple.com (T-029) | research | de-heat | landed | P-068 done and landed: Fastwork heats more (B-A +0.57/+0.41 C/min); the fixes cool the phone (B-X +0.43/+0.16); second read PASS |
| phone-queue | Phone blocks (timing and attribution on the iPhone) | phone | lead | done | Team stopped gracefully on the user's request (T-274). Final: g0.0m best build; article live on Medium; waiting for Fastwork's answer. |
| phone-stack-test | Stack test (wi-stack): RB vs stack5 | phone | iphone-runner | done | folded into best-stack: A landed (st6-rb), B Sim-only, A + shrink hold runs as C1 |
| pill-swap | Community pill avatar swap without a full-page re-layout | fix | fix-pill-swap | dropped | D: NOT PRESENT on st6-rb2 (rotator-st6 already removed the swap); record landed 798df7c; dropped |
| pixel-tolerance | Pixel rule for near-identical fixes (PR-010) | research | lead | done | PR-010 accepted wide (15:21Z); rule in memory (fca8355, reading 6078a11); Try-it panel ruled out as the carousel cause (8add0f2) |
| platform-corners | Platform visual rounded corners (T-240) | fix | fix-platform-corners | landed | On main as 2b498944 + 23b253a6; g0.0c = g0.0b + this fix (PR-035 accepted) |
| platform-idle | platform-idle: glint-ca + sweep-exact | fix | fix-platform-idle | landed | landed af05a8d (rebased d12365d); reduced-motion face-photo pixels accepted as load noise (C~C2 too) |
| pr-010 | PR-010 pixel rule: rev 4 (Try-it on the best build) | research | de-pixel-rule | done | PR-010 accepted (wide); panel investigation done: the panel does not cause the slider difference; pixtol tool brief sent to the lead |
| pr-018-menu-morph | Hero park past its end (hero-park, P-140) + T-194 slow layouts | fix | fix-hero-exit-threaded | parked | Parked: hero-park closed before data (P-140); T-194 deck find (9605013e) handed to fix-deck-contain (P-143) |
| pr-018 | End-of-page menu follows the finger (PR-018 rev 7) | fix | fix-hero-exit-threaded | dropped | duplicate of pr-018-menu-morph (the desk's row) |
| private-demo | Private demo kit (T-212) | research | build-private-demo | parked | Waits for the finished v10 build (A + pause + hit-skip + nolift + I-219), not the v10 prep that landed at f0988c76; the lead resumes it when int-v8 posts the v10 pins |
| proposal-hold | Proposal hold and stale decisions (T-030) | tool | ts-proposal-hold | landed | 78520d8 on main, npm test 1381/1381, console restarted; PR-008 on hold |
| proposal-progress | Proposal revising state (I-177) | tool | ts-proposal-progress | landed | 11913a22 on worktree-agent-a9cf841a05a9535c5, rebased on main 559ebf24; full npm test 2182/2182 pass |
| proposal-talk | Talk inside a proposal | tool | ts-proposal-talk | done | T-048, T-050 and T-051 are on main (db5db67, c00560f, dcf2e17); console restarted by the lead |
| proposals-page | Proposals page in the console (read, compare, accept) | tool | ts-proposals | landed | landed on main 6a35185 (cddb86e tools, 6a35185 docs); lead restarts console after C-016 and tells the DEs after 21:20Z |
| r4-v3 | Panel push at the page end: less style work when it starts | fix | fix-scene-scope | landed | RB landed b43443b; user finger check: better, still a bit laggy |
| re-keep-op | Card reveal ends without a page re-layout | fix | fix-hero-exit | done | In best build (v7) |
| recipient | Console: show who gets each answer | tool | ts-recipient | landed | on main as a99dbd2 + 5928e7b; lead's npm test running, then console restart and I-084/I-085 resolve |
| release-branches | Why 89 branches never landed (release evidence) | research | de-release-branches | done | report at scratchpad/release-branches/README.md |
| release-history | History rewrite trial for the public release | research | de-release-history | done | p9 fix: main 16 old IDs (data files only), residual 0; unit 1347/1348, the 1 fail is load-flaky and passes on rerun |
| release-inventory | Release: inventory of what we have | research | de-release-inventory | done | inventory delivered to lead |
| release-out | out/ survey for the public release | research | de-release-out | done | out/ survey delivered: ~500 MB include set, 3.4 GB excluded |
| release-plan | Public release plan after Fastwork's approval (T-170 #412) | ops | lead | coordinating | rule change committed d423623e; release tooling workflow running (I-268/269/270 + review) |
| release-scrub | Release: personal-data scrub survey | research | de-release-scrub | done | scrub survey parts 1+2 delivered |
| rest-script | Rest-time script loops (pixel-identical) | fix | fix-rest-script | done | LANDED and in the best build (avatar row and counters: less work). Ignore the label 'nothing to land'. |
| reveal-paint | Reveal frame paint (g0.0m) | fix | fix-reveal-paint | landed | g0.0m landed on main (5dfd866c) and is the current best (8eb380d5) |
| review-cd-roll-ca | review of the countdown roll GPU fix, round 4 | review | review-cd-roll-ca | done | NEEDS-WORK: T2 not stated, no Chrome mid-roll A/A, cost card missing, protocol v2 owed list |
| review-cd-strip-r2 | review of cd-strip strip-rw (round 2) | review | review-cd-strip-r2 | done | NEEDS-FIX: hero strips/cells miss the scene-pause will-change rule; R-fade card should show same-session A/A (3/26 vs 1/26) |
| review-cd-strip | review of cd-strip (countdown digits as sliding strips) | review | review-cd-strip | done | round 3 strip-tc 4cd9529: ACCEPT-WITH-NOTES; must-fix: README discloses the stale CSS comment too |
| review-countdown-faces | review of countdown-faces (3 faces + no roll while unseen) | review | review-countdown-faces | done | round 2 ACCEPT: resume is exact by construction, no forced layout; fix two PR-007 lines and the .hero vs .hero-copy wording |
| review-end-morph-p1 | review of the end-morph P1 port (composited clip reveal on v9-final) | review | review-end-morph-p1 | done | NEEDS-WORK: gate (b) residue-area proxy not decisive (exact-m per-pixel check asked); 932 post residue unreported; build/stack/counts/guard/desktop verified |
| review-f3-arm-scope | review of F3 arm-scope land request | review | review-f3-arm-scope | done | CHANGES REQUIRED: V-only frame collapse at the end pin (2/2 V vs 0/5 C capped runs); touches outside #platform/header after m>0.52 not caught |
| review-fwreskip-2 | review of fwreskip rev 2 (3ce8ce3) | review | review-fwreskip-2 | done | recheck rev 2.1 f7f24f4: ACCEPT (README/data); landing gated on phone G/F (iv); (i),(ii) for user; (iii) closable |
| review-fwreskip | review of fwreskip (scroll-engine /10f, a1h) | review | review-fwreskip | done | NEEDS-WORK: Chrome c4 shows a P-only placeholder frame on jump; reversal path and idle triple missing |
| review-hero-exit | review of hero-exit-threaded final build | review | review-hero-exit | done | round 3 (b93db07): build ACCEPT-WITH-NOTES; P-074 scorer ACCEPT; PREDICTIONS row must land before data |
| review-i063 | review of the I-063/I-065/I-066 tool fixes | review | review-i063 | done | I-063 delta 06c4954 + I-069 fc7b13e: ACCEPT-WITH-NOTES (rebase on I-070 clean; notes sent to the lead) |
| review-i219 | review of the I-219 hydration fix | review | review-i219 | done | ACCEPT (medium-high): delta minimal and correct, parity holds in Chrome; Safari/desktop check still open |
| review-i270 | re-review of the release build tools (I-270) | review | review-i270 | done | build-c fix 6d9e5160: ACCEPT (non-blocking: short TIFF noted, sniffMedia gate suggested) |
| review-morph-gpu | review of morph-gpu rev 1 (clip-path morph reveal on the GPU) | review | review-morph-gpu | done | NEEDS-WORK: hashes and block verified; cost wording too broad, stale status lines, a source claim marked CONFIRMED that the source doesn't confirm, D card unsigned, idle/memory/segment-card items owed |
| review-morph-inherit | review of morph-inherit (nav --morph inline fix) | review | review-morph-inherit | done | ACCEPT: c4228b8+4c59bde, delta reproduces 7c61fe7d0662, gates check out; 4 non-blocking notes |
| review-p1b | review of the end-morph P1b first-open fix | review | review-p1b | done | NEEDS-WORK: armed clip hides the language menu; phone card conditions sent to the lead |
| review-p152-read | independent read of phone ticket P-152 (end-morph-f12) | review | ops-reader-P152 | done | FAIL but threshold-sensitive: recount equal to 815f7bb6; direction robust, size not |
| review-p153-block2 | independent read of phone block P-153 block 2 (end-morph-p1) | review | read-p153 | done | CONFIRMED: reader re-run identical, NO-WORSE PASS + FIRST-OPEN RISK SEEN (f2 +10 ms) |
| review-p155-predata | pre-data read of phone ticket P-155 (end-morph F1-only / U2-only split) | review | ops-reader-P155 | done | FIX-FIRST, doc only: pins, arms, reader and block all check out; the card must fix 4 rules before data (block-2 trigger, U2 landing vs split outcome, order disclosure, probabilities) |
| review-p155-result | independent result read of phone ticket P-155 (end-morph split) | review | ops-reader-P155 | done | agree with owner: UNRESOLVED (partial), P1 holds +9, P2 fails +5, U2 no-worse PASS (p 4/20), U2 does not land, no block 2 |
| review-p156-predata | pre-data read of phone card P-156 (end-morph P1b part a) | review | ops-reader-P156 | done | FIX-FIRST: pins uncommitted, part B close window, Pr4 combine, park gates, block-2 rule, +2 ms below phone floor |
| review-platform-idle | review of platform-idle (glint + sweep on compositor) | review | review-platform-idle | done | round 2 ACCEPT: 4 blocking items closed; fix the stale results.json outcome and add a morph-state line at landing |
| review-release-tooling | review of the four release tool commits (I-269, I-273, I-268, I-270) | review | review-release-tooling | done | I-269 fix round c458415c: ACCEPT; I-270 must pass --source to check.mjs; secret-kv false positives on hex SHAs (non-blocking) |
| review-scene-scope-2 | review of scene-scope RBi40p | review | review-scene-scope-2 | done | NEEDS-WORK: check on bplus JS, wording, D-card count rule, deterministic #platform frames |
| review-scene-scope | review of scene-scope RBi40pti land candidate (T-011) | review | review-scene-scope | done | LAND WITH FIXES: T-011 verdict reproduced; land 63bfeed after rebase; README wording fixes and y7500 decision record |
| review-v10 | review of the v10 best build | review | review-v10 | done | ACCEPT (medium-high): build reproduced byte for byte; Chrome parity holds; Simulator part and P-152/P-153 reads still gate the land |
| scene-scope | Scene flip style recalc: narrow the paused-scene rules | fix | fix-scene-scope | dropped | duplicate of style-recalc |
| scroll-cb-phone | Skip phone-off scroll callbacks (frame audit item 2) | fix | fix-scroll-cb | parked | Rejoins in v9.1 (v9-final fd2ac7dd + scroll-cb + g11 close), built by int-v8; fix-scroll-cb answers int-v8's questions only. |
| scrollcb-g0 | Scroll callback side jobs gated on g0.0f | fix | fix-scrollcb-g0 | closed-no-fix | gate removes no pass; landed 08f411ee |
| serious-heat | Smooth under Serious heat (T-178 #6) | research | arch-serious-heat | parked | P-129 rev 2 committed 5e8db148 (frozen reader + self-test, C1-C4, N1-N5); waits for ops' delta check and the lead's signature |
| status-board | This status board | tool | ts-status-board | landed | Status page and status.mjs landed |
| sticky-far | sticky-far: finger-drag sticky relayout | research | fix-scrollcb-g0 | dropped | renamed sticky-walk (un-sticking far boxes predicted no gain) |
| sticky-walk | sticky-walk: what the sticky-triggered layout walks | research | fix-scrollcb-g0 | landed | blind swipe done: both pairs picked g0.0j (VC page 1, CV page 2); phone released, servers stopped |
| style-recalc | Style recalculation (your idea: about 19-20 ms per frame) | fix | fix-scene-scope | done | LANDED and in the best build (9d7f9cb). Ignore the label 'nothing to land': that is the board's wording for every done row. |
| t113 | v7 fast-flick stress test (hero cards, end of page; user T-113) | fix | iphone-runner | parked | P-105 and P-114 closed; the hero lag continues in P-115 (fix-toolbar-resize, row toolbar-resize) |
| t275-claims | T-275 platform-claim check | research | de-distill-claims | done | 25 claims checked against WebKit/Chromium source and docs, table sent to the writer |
| t275-distillation | Knowledge distillation (T-275) | research | lead | done | document committed (e038af5d, page da77ea05), published as a page, link in T-275 |
| t275-hero | T-275 reader: hero | research | de-distill-hero | done | lessons sent to de-distill-writer |
| t275-math-measure | T-275 math: measurement and statistics | research | de-viz-math-measure | done | page v2 published (790793c1) |
| t275-math-render | T-275 math: rendering, layers, paint | research | de-viz-math-render | done | page v2 published (790793c1) |
| t275-paint | T-275 reader: paint | research | de-distill-paint | done | lessons sent to de-distill-writer |
| t275-process | T-275 reader: process | research | de-distill-process | done | lessons sent to de-distill-writer |
| t275-review | T-275 document review | review | review-distill | done | Review done: ACCEPT (2 high, 8 medium, 14 low found; all high and medium fixed) |
| t275-scroll | T-275 reader: scroll | research | de-distill-scroll | done | lessons sent to de-distill-writer |
| t275-tools-engine | Tools research: engine rule lists and papers | research | de-tools-engine | done | report published, committed |
| t275-tools-runtime | Tools research: profilers and device testing | research | de-tools-runtime | done | report published, committed |
| t275-tools-static | Tools research: code checkers and build plugins | research | de-tools-static | done | report published, committed |
| t275-tools-synth | Tools research: check, map to lessons, report | research | de-tools-synth | done | report published, committed |
| t275-tools | Existing tools for engine-cost analysis (T-275 #13) | research | lead | done | report published, committed |
| t275-viz-build | T-275 page builder (diagrams, charts) | research | de-viz-builder | done | page v2 published (790793c1) |
| t275-viz-review | T-275 page review (math and charts) | review | review-viz | done | page v2 published (790793c1) |
| t275-viz | T-275 page: explain, visualize, math (user T-275 #6) | research | lead | done | page v2 published (790793c1) |
| t275-writer | T-275 document writer | research | de-distill-writer | done | T-275 document written and revised after review (30 lessons, 7 sections) |
| t277-history | T-277: how the loop grew (history, costs) | research | de-loop-history | done | published, committed |
| t277-loop | Loop engineering distillation (T-277) | research | lead | done | published, committed |
| t277-mechanics | T-277: loop mechanics and rules | research | de-loop-mechanics | done | published, committed |
| t277-review | T-277 document review | review | review-loop | done | published, committed |
| t277-writer | T-277 document writer | research | de-loop-writer | done | published, committed |
| thread-images | Images in console threads | tool | ts-thread-images | landed | Landed on main (72d628a) |
| thread-routing | Thread reply routing (T-050) | research | arch-thread-routing | done | User OK (T-050); design + decisions committed cf39b46; build handed to ts-proposal-talk after I-096 and T-048 |
| toolbar-resize | Hero lag when Safari's toolbar collapses (P-115, user T-113) | fix | fix-toolbar-resize | parked | P-141 confirmed and landed (7e4e741d): each sticky part alone keeps the toolbar-step layout work; attribution closed; only look-changing proposals remain, on the user's request |
| tryit | Try-it pages: one server, start on click (T-106) | tool | ts-tryit | landed | landed 51fb199f + 280c3a27 (14:15Z); 6 Try-it builds migrated |
| ts-246 | Real-heat phone profile (I-246) | tool | ts-246 | done | landed a84b2916 (npm test 2462/2462); I-246 resolved; docs 9cbc2e13 |
| ts-247 | iphone.mjs run --timeline (I-247) | tool | ts-247 | done | landed 11e86d55 (npm test 2469/2469 in worktree); I-247 resolves after the main-checkout npm test post P-165 |
| ts-250 | xctrace thermal read timeout (I-250) | tool | ts-250 | done | I-250 fix landed 3bdcb63c, npm test on main ok, incident resolved |
| ts-251 | Three tool incidents: WDA stale CoreDevice, rearm RSD retry, orphan wait | tool | ts-251 | done | I-248/I-249/I-251 landed and resolved; main npm test 2482/2482 |
| ts-252 | usblink: no re-plug step while the user holds the iPhone | tool | ts-252 | done | I-252 fix landed 392c3dc2, resolved |
| ts-257 | I-257: no manual Xcode thermal step from phone tools | tool | ts-257 | done | I-257 fixed on main f8747c0c (rebased fd02085c); npm test on main 2488/2488; incident resolved |
| ts-answer-lint | Answer-format check for thread replies | tool | ts-answer-lint | landed | answer-format check and proposal savings-table check landed on main (3248906f) |
| ts-artifact-link | Keep claude.ai artifact links in console texts (I-191) | tool | ts-artifact-link | done | I-191 landed on main as 442168c1 (npm test 2243/2243); follow-up I-194 open for the lead |
| ts-board | board updates itself from events (I-145, I-147, I-152 N9) | tool | ts-board | done | I-175 landed on main as 92069d2f (rebased from 191475dd); I-187 was a duplicate; nothing left on this row |
| ts-flake-243 | Flaky sim-warm keeper test (I-243) | tool | ts-flake-243 | done | I-243 fixed (aff82320), full tests on main passed, incident closed |
| ts-flakes-237 | Flaky bench/sim e2e tests | tool | ts-flakes-237 | done | landed as deab9b24 + f7c9d550 (I-237, I-238); follow-ups noted: http twin port 0, fake Chrome silent fetch failure |
| ts-gate-lane | Gate lane: count-only sim gestures and gate pass (I-184/I-185) | tool | ts-gate-lane | done | landed on main by the lead (I-182 20a04da9; I-188 8bc6e872; I-184/I-185 earlier) |
| ts-gesture-capture | Finger gesture capture and replay converter (I-218) | tool | ts-gesture-capture | landed | I-218 landed on main as 0168b6f5 at 04:58Z; npm test 2385/2385 |
| ts-head-aging | Cap reader aging so an exclusive head waits at most one shared group (I-210) | tool | ts-head-aging | landed | I-210 lock fix landed on main; npm test on main running, then resolve |
| ts-i054 | serve.mjs HTTP Range support (I-054) | tool | ts-i054 | landed | Landed 77c1fca; I-054 resolved (re-measure only for A/Bs that serve video) |
| ts-i056 | I-056 phone measure guard | tool | ts-i056 | landed | I-056 landed 9e92a90 (npm test 1037/1037), resolved |
| ts-i058 | Waits show on the board (I-058) | tool | ts-i058 | landed | on main 9316307; fix owners and iphone-runner told to pass --owner and rebase |
| ts-i059 | I-059 console runner-ended parts | tool | ts-i059 | landed | I-059 A fda5653 + B 79c1252 on main; resolved 10:00Z; console restarted |
| ts-i060 | Progress page: say what each device and agent is doing (I-060) | tool | ts-i060 | landed | I-060 (67613fb, 6ccb69c) and I-061 (c9bbd80) landed, npm test 1071/1071, both resolved |
| ts-i062 | iPhone screen recorder (I-062) | tool | ts-i062 | done | I-062 landed 5395cf0; privacy review: SAFE WITH FIXES; hardening continues as I-064 (ts-i064) |
| ts-i064 | ioscap hardening (I-064) | tool | ts-i064 | landed | I-064 both commits landed (7f02c12, 05b195d); lead runs npm test on main, then resolves |
| ts-i070 | I-070 keep Mac awake during measurements | tool | ts-i070 | landed | landed on main as c6301fe (rebased 99f0461), I-070 resolved |
| ts-i073 | LAN address resolver (I-073) | tool | ts-i073 | landed | landed 5ed4788, I-073 resolved |
| ts-i079 | gesture --timeline (I-079) | tool | ts-i079 | landed | landed on main 0411b08; npm test on main queued, then I-079 resolved |
| ts-i080 | Stale shared last-grant record (I-080) | tool | ts-i080 | landed | landed 6a59c2a on main, npm test 1355/1355; I-080 resolved; I-081 follow-up with ts-i081 |
| ts-i094 | sim-orient phone-port refusal (I-094) | tool | ts-i094 | landed | I-094 fixed in 14ffdc4 (landed on main, incident resolved; npm test green on main) |
| ts-i100 | Simulator reduced-motion switch (I-100) | tool | ts-i100 | landed | Landed on main as 08684c78; I-100 resolved 19:50Z. Row closed by the lead. |
| ts-i103 | Console: comment button overlaps a link | tool | ts-i103 | landed | I-103 landed e9f08c05 (comment button avoids controls, icon). Next on this agent: I-104 Status/Progress links. |
| ts-i104 | Console: links between Status and Progress | tool | ts-i103 | landed | I-104 landed on main as 0f8bcaaa (Status rows and Progress items link to each other); resolved |
| ts-i105 | Idle alarm for iPhone and Chrome (I-105) | tool | ts-i105 | landed | I-105 idle alarm landed on main as 7c71e7f5 (04:08Z) |
| ts-i108 | I-108: status board shows outdated and wrong waits | tool | ts-i103 | landed | I-108 follow-up landed on main as 91def2dd ('landed?' only on ready-to-land and reviewing rows); T-075 answered |
| ts-i109 | Toolsmith: I-109 Try-it required, I-106 profile cleanup, I-110 status json cut | tool | ts-i109 | landed | I-109, I-106, I-110, I-114, I-111, I-117 all on main (last 2319403a) |
| ts-i112 | I-112: WDA preflight and gesture run budget for phone blocks | tool | ts-i103 | landed | phone block preflight fix is on main; fix-nav-morph told |
| ts-i115 | Ask before plain curl to GitHub | tool | ts-i115 | done | I-115, I-113, I-116, I-120, I-121 all landed and resolved |
| ts-i118 | Per-agent page /agent/<name> (I-118) | tool | ts-i118 | landed | I-118 agent pages + T-079 versions landed (292ec4df, 546bfaa6) |
| ts-i119 | Phone links in console threads (I-119) | tool | ts-i119 | landed | I-119 landed 6c72bc5e (+ docs 6596b1d3); resolved |
| ts-i123 | I-123 phone lease vs active user step | tool | ts-i123 | landed | I-123 + I-125 landed a80057cd; docs in CLAUDE.md step 3 |
| ts-i124 | Disk-space guard (I-124) | tool | ts-i124 | landed | I-124 disk guard landed on main as 90870373 |
| ts-i126 | Phone links for Try-it on the Proposals page | tool | ts-i126 | done | I-126/T-086 landed on main (6d51b420); T-086 answered (#4) |
| ts-i130 | Console menu wraps over the banner (I-130) | tool | ts-i130 | done | landed 577c96c8; user answered in T-092 |
| ts-i181 | Fix thread wait triage + monitor crash | tool | ts-i181 | landed | I-181 559ebf24; I-183 ab9fdcc1 + I-189 9db58eef landed (npm test 2227/0) |
| ts-i200 | GitHub fetch: refuse instead of asking the user | tool | ts-i200 | landed | I-200 landed 85f33a82 (GitHub fetches refused with the gh recipe) |
| ts-i201 | Phone heat check: Xcode condition level | tool | ts-i201 | done | I-201 fix eb12e914 and hint follow-up 53c54f3f landed; I-201 resolved |
| ts-i220 | WDA ensure: restart only if needed, retry once, re-plug exit | tool | ts-i220 | done | I-220 fix landed caf9d44b (11:34Z), incident resolved |
| ts-i225 | Probed Xcode-condition re-arm (iphone.mjs rearm) | tool | ts-i225 | done | I-225 and I-233 landed on main (776174d2); no steps left |
| ts-i227 | iPhone preflight after re-plug (I-227) | tool | ts-i227 | done | landed 5ba09f99; npm test 2406/2406 on main; I-227 resolved |
| ts-i228 | Thread scrubber eats version iPhone phrases | tool | ts-i228 | landed | Landed 3b5744ac; npm test on main 2412/2412; I-228, I-139 resolved |
| ts-i265 | Agents page sees live team agents (I-265) | tool | ts-I-265 | dropped | duplicate row made by mistake; the real row is i265-agents-page |
| ts-i269-release-rewrite | Release history rewrite (I-269) | tool | ts-i269-release-rewrite | done | landed on main as 8839b1f7, af38fe58, 2095a0e1; I-269 resolved |
| ts-i275-prune-scope | Disk auto-clean scope + image restore | tool | ts-i275-prune-scope | done | landed as a840ca8c; restore checked against the release reviewer's notes |
| ts-idle-ready | Idle alarm: block gaps and startable phone work (I-189, I-182) | tool | ts-idle-ready | done | landed on main by the lead (I-182 20a04da9; I-188 8bc6e872; I-184/I-185 earlier) |
| ts-idle-reload | gesture --idle-after-reload (I-203) | tool | ts-idle-reload | done | I-203 landed on main as 61950199 |
| ts-lease-renew | Lease renew never shortens a live lease (I-091) | tool | ts-lease-renew | landed | Landed on main (4fec8aa) |
| ts-live-overlay | Try-it live overlay (I-209) | tool | ts-live-overlay | landed | I-209 tool fix landed on main ed06dcd5 (rebased from 957a668d); npm test on main running, then resolve |
| ts-lock-gaps | Lock gaps: phone-block readers + --between after hold | tool | ts-lock-gaps | landed | Landed 430d35fb (I-207, I-202); lead npm test on main queued, then resolve |
| ts-lock-rules | Lock rules: Simulator vs phone blocks (I-160), phone lease ready flag (I-155) | tool | ts-lock-rules | landed | I-171/172/176 landed 915cba34, d27eb718, 1a5e78c2 (rebased shas); incidents resolved |
| ts-npm-parallel | npm test safe to run twice (I-192, I-193) | tool | ts-npm-parallel | landed | Landed on main as d1c55d94 (rebased from c379f18c) after npm test passed; I-192, I-193, I-195 and I-166 resolved. |
| ts-phone-hold | Phone hold ledger and process holds (I-167, I-168) | tool | ts-phone-hold | landed | I-168 T2 landed 3c072dfb |
| ts-phone-profile | Phone thermal profile gate (I-186) | tool | ts-phone-profile | landed | I-186 landed 6967a25f + a6ff814c; resolved |
| ts-phone-steps | Harden phone steps (I-140 stale ack, I-141 lost finger recording) | tool | ts-phone-steps | landed | Landed aee04a85 (I-140, I-141, I-143, I-144) |
| ts-proposal-watch | I-045 proposal decision watch | tool | ts-proposal-watch | dropped | duplicate row: see i045-proposal-watch |
| ts-small-fixes | Small tool fixes I-204, I-206 | tool | ts-small-fixes | landed | Landed 6993bedf + 581e1c4b (I-204, I-206); lead npm test on main queued, then resolve |
| ts-table-lint | Table separator lint | tool | ts-table-lint | landed | landed e8f7fa98 (A-F); npm test on main running |
| ts-testspeed | Faster npm test (T-105 #2) | tool | ts-testspeed | parked | Lead 04:12Z: stays paused while timing work runs (worst-case clips, v9 step 4, P-122); its npm test runs load the Mac. Resume after v9 is out |
| ts-thermal-own | Own iPhone heat-mode tool (thermal.mjs) | tool | ts-thermal-own | done | I-199 done: tool 2086bd24; stage 3 answered (set replaces Xcode's condition, F-280); no rerun (lead decision a) |
| ts-threads | Thread merge and related threads | tool | ts-threads | done | I-134 + T-101 and progress set/best + build.since check landed (d8b3df55, 03db838b); replied in T-099 and T-101 |
| ts-usb-attach | usblink watch logs re-attach between polls (I-242) | tool | ts-usb-attach | landed | I-242 fix 490481f4: watch logs REATTACH for a re-plug between polls |
| ts-usb-link | iPhone USB link watchdog | tool | ts-usb-link | done | I-222 (19df6559) and I-241 (a4afb1e1) landed; watch and loopback-only proxy running |
| v7 | Best build v7 (v6 + countdown strips + rest-script v4 + countdown roll) | fix | wave-v7 | landed | v7 landed 1efa2e61 and is the best build; phone no-worse check owed |
| v8-double-drive | v8: other elements for the PR-021 treatment (T-154) | research | de-v8-double-drive | done | landed on main as 1f2a03db; answer posted in T-154 and T-157 |
| v8-gh-attribution | v8 hero-flick attribution (P-116) | phone | int-v8 | done | P-116 landed (f010f30e): NOT LOCATED; no block 2 (lead ruling); the hero-exit cost goes to fix-toolbar-resize's showcase line (P-115) |
| v8-section-ms | v8 rendering ms per page section (user T-151) | research | de-v8-section-ms | done | per-section ms v7/v8/baseline, n=2 (hold 2 timed out in queue); commit 23794175 on worktree-agent-aea3847b5ce28bfa6 |
| v8 | Best build v8 (next wave: countdown, scroll handlers, accent word, top bar) | fix | lead | done | v8 landed on main 4b9db407 (gate passed); PROGRESS v7 to v8 switch by mgmt-ops-11 |
| v9-1 | v9.1 build (v9-final + scroll-cb + g11 close) | fix | int-v8 | parked | P-151 bisect PARKED as committed (780f058e + 190b1dba); reader later, no phone (user T-204 #4) |
| v9-best | Best build v9: v8 + 6 fixes (user T-159) | fix | lead | landed | v9-final landed on main fd2ac7dd |
| v10 | v10 = main v9-final (rev 7d) + F1+U2 + P1 | fix | int-v8 | parked | v10 done (landed 0820c192); swipe test and v11 handed to int-v11; swipe runner staged 8cbab4b9 |
| v11 | v11 best build (Vc + V13 + H1c) and the C vs Vc swipe test | fix | int-v11 | parked | card landed 3c638d9b, BEST_BUILDS 6d6f496e. v11 stays candidate; c2 (arch-compositor-morph) next, then a short phone check |
| wi-best-build | Best build (all landed fixes in one patch) | fix | wi-best-build | landed | best-build landed 127ffd5 (JS 65052c4a3902, CSS e0f92804c521 = st6-rb2 + platform-idle + morph-inherit) |
| worst-cases-capture | iPhone captures: worst cases, original vs g0.0l (blog Part 1) | phone | cap-worst | landed | People title v2 recordings landed |

Full records: [status.json](status.json)
