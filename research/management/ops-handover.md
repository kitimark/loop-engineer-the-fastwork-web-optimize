# mgmt-ops living state (updated with every digest)

Living state file (LEAD.md "Rules from mgmt-lead iteration 2"): the next mgmt-ops restarts from it (about every 2 h
or at ~60 % context). Charter: `fixes/LEAD.md` "Delegation: mgmt-ops runs the day-to-day". Current instance:
**mgmt-ops-6** (from 17:28Z; mgmt-ops-5 ran 11:26-17:28Z, mgmt-ops-4 08:52-11:25Z), worktree
`.claude/worktrees/mgmt-ops-2` (sparse, on the snapshot), branch `mgmt-ops/docs-2`. Next instance: **mgmt-ops-7** (at
~60 % context). Last update: **17:3xZ**.

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
   (start + end) decides, a failing one = cooling + redo. Timing/gain blocks keep the 10-min rule when they return
   (fixes/LEAD.md "Timing deferred", protocol v2 §5 note).
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

## Incidents (08:55Z; see `incident.mjs list`)

| id | state | owner | note |
|---|---|---|---|
| I-016 | parked | lead | e4 hooks via short lane (user), f orphans P3 |
| – | all others resolved today (I-018, I-026 … I-031) | – | follow-ups are in the backlog line above |

## Peer directory (F-046; keep current, send to every agent that joins)

Lead decision 10:35Z: agents work peer to peer; **mgmt-ops is the hub** for everything that is not lead-only (land,
incident resolution, lock reorder, spawn, user). Role names work only if `ListAgents` shows them; else use the ID.

| address | owns | state (12:2xZ; mgmt-ops, ts-* rows 17:3xZ) |
|---|---|---|
| `main` | lead: lands, resolves, reorders locks, spawns, user | alive |
| `mgmt-ops-6` (spawned by the lead 17:2xZ; mgmt-ops-5 ENDED 17:28Z, mgmt-ops-4 ended) | ops hub, iPhone queue, DIRECTION, handover, land batches, PREDICTIONS, PROGRESS.json | alive |
| `iphone-runner` (a7696771bf38f1229) | phone blocks, controls, logger | alive |
| `fix-nav-morph` (a277ea00c8773c1ea) | morph (gh, ghbn, R8/R5, R2), y≈1960 IO frame (src, noinert: no win), N12 | alive, holds rebase |
| `fix-hero-exit` (a77e2ec753b6381fb) | hero window y 0-900: v2, h1, ST-2 builds, D5, hero-B | alive |
| fix-scroll-engine = ID `a1722cf5058e25591` | N14 layout-containment (R/I now), /10d (parked), R2 bg-layers, R3a/b | alive |
| `ts-gesture` | WDA gesture tool (NEEDS-WORK; user setup pending) | alive |
| arch-lead = `ae2d21af96d758d16` | measurement protocol v2 | ENDED 11:4xZ (docs follow-ups -> doc-protocol-v2) |
| arch-safari = `a765c480ea490a443`, de-safari = `a4ce1669dd33aa4dc` | Safari probing / iOS time model (read-only) | alive |
| arch-devtools = `ad5593c3c7d3b8c97`, de-devtools = `a21e6c00411aba4d8` | Chrome DevTools method (read-only) | done |
| `ts-iphone-run` (T1a f8e7d5a), `ts-analysis` (T3), `ts-render-signals` (T6+T7, I-032) | protocol v2 tools; 17:3xZ: ts-iphone-run owes N1 (pickTab errors leak the LAN host into gesture JSON; no gesture JSON in committed files until it lands), then I-038; ts-render-signals owes the I-032 land request (B1 58857d0 ACCEPT, rebase + clean test:chrome after 16:45Z) | alive |
| `arch-sim` | iOS Simulator fidelity (user work stream, lead 14:0xZ): research, plan, probe the Simulator against real-device records; Simulator runs are host-heavy -> always inside chrome-measure holds (≤ 10 min), slot like research holds | alive |
| `ts-sim` | toolsmith: tools/sim.mjs from arch-sim's spec (lead spawns when the spec arrives) | not yet spawned |
| `review-cdwc` | fix-reviewer of mw10e-cdwc (fix-nav-morph 051d0aa): NEEDS-WORK 14:1xZ (B1-B4) | done |
| `review-stats` | fix-reviewer of ts-analysis eea3c06 (phone thresholds): NEEDS-WORK 14:1xZ; re-check 8409b95+ef802b9 ACCEPT-WITH-NOTES 14:2xZ | alive |
| `ts-user-console` | toolsmith: tools/console.mjs local user step console (user-facing steps go there once landed) | alive |
| `ts-progress` (a5748ebf9e8a3b086) | console Progress page + fixes/PROGRESS.json (landed 7614401 + c9ceb98) | done |
| `ts-lock-bundle` | toolsmith: handover item 7b; I-035 landed 8935a7d; f10193c, a17909d, fb59f13, bb07e33, 14e503f (on c6ff3ea) under review by review-lock-bundle (17:5xZ); (f) shelved for good | alive |
| `review-lock-bundle` | fix-reviewer (read-only) of ts-lock-bundle's 5 commits (lead spawn 17:5xZ): 18:0xZ NO BLOCKERS (f10193c ACCEPT; a17909d, fb59f13, bb07e33, 14e503f ACCEPT-WITH-NOTES); after landing: announce bench gain HOST-DISPLAY-CHANGED exit 3 until recalibration; host-real chrome test + test:chrome only with main's lock.mjs (I-041); CLAUDE.md line on `--no-timing` (lead) | done |
| `ts-lock-share` | toolsmith (lead spawn 17:5xZ, user request): shared lane so functional-only jobs (npm test, Sim mechanism checks, bench mech, load-only sanity) run in parallel while timing keeps the exclusive slot; design first in research/architecture/lock-shared-lane.md for the lead, then implements under the I-041 rule | alive |
| `ts-console-nav` | toolsmith (lead spawn 17:4xZ): user console menu + notifications | alive |
| `ts-status-board` | toolsmith (lead spawn 18:4xZ, user request): live per-workstream status board (priority = lead only, state, waits from queues/console/incidents) on a console page next to /progress; design first in research/architecture/status-board.md (lead approves); briefed by mgmt-ops-6 on the PROGRESS.json split (board = workstreams + priority + waits; PROGRESS = user-facing fix narrative; link by item id). Once landed: keep the board in step with the lead | alive |
| `fix-scene-scope` | fix owner (lead spawn 18:5xZ, PRIORITY 1 under style recalc): de-style-recalc's proposal, stacked on B: V1 narrow the `:where(*)` scene pause, V1b pause by API, V2 flip early, V3 panel + R4; Chrome check, then a W Timeline phone ticket (ahead of P-039 if both ready) | alive |
| `de-illusion-style` | research (lead spawn 19:1xZ, USER PRIORITY 2 "optical illusion is acceptable"): cheaper look-alike renderings for style/layout costs; counts first, <= 2 batched Chrome holds before first proposals (queued after scene-scope + de-counts pair); proposals to the user via ts-proposals' page; no phone before Accept | alive |
| `de-illusion-composite` | research (lead spawn 19:1xZ, USER PRIORITY 2): cheaper look-alikes for compositing/layers/blur; same rules as de-illusion-style | alive |
| `ts-proposals` | toolsmith (lead spawn 19:1xZ): console Proposals page (read, visual compare, Accept/Reject/Request change); full `npm test` in the short lane | alive |
| `ts-progress-lane` | toolsmith (lead spawn 22:11Z): I-048, shared-lane readers missing from the progress page and status board | ended (I-048 landed 9fd2d3a) |
| `ts-i053` | toolsmith (lead spawn 06:4xZ): I-053, one proposal carries several options, the user picks one | alive |
| `wi-stack` | wave integrator (lead spawn 07:1xZ): stack5 = cdwc + f3-arm-scope + re-keep-op + blur-cubic + st6 on today's best; functional checks (shared), phone ticket best vs stack5 (S) + blind swipe pair, P-row first; ask mgmt-ops for shas/branches | alive |
| `ts-i054` | toolsmith (lead spawn 06:5xZ): I-054, serve.mjs HTTP Range support (blocks PR-001 arm V); changes what serve.mjs serves (called out, test:chrome); expect a shared-lane npm test | ENDED (landed 67847b4) |
| `ts-i056` | toolsmith (lead spawn 07:5xZ): I-056 phone measure guard (a) shared group passes as short, (b) same-owner --no-timing exception, (c) gesture-run.mjs guard, (d) shared readers log to holds.log | alive |
| `de-style-recalc` | design engineer (lead spawn 18:3xZ, USER PRIORITY 1): tests the user's style-recalc hypotheses (selector matching, per-frame image work); fix proposals fast-tracked | alive |
| `ts-headless` | toolsmith (lead spawn 17:5xZ, user request): headless Chrome functional checks, pairs with ts-lock-share's shared lane | ended (landed 14806cb..8fa38f7; worktree removed 20:2xZ) |
| `ts-console-threads` | toolsmith: console threads (one thread per topic for the user) | ended (landed 545cf85, 77d318c, fc07bb1; worktree removed 20:2xZ) |
| `ts-gesture` (Sim) | also owns the Simulator touch driver (`sim.mjs gesture`, after I-042 D1-D3 + safari-restart; lead 17:5xZ); the P-032 (b) Sim re-check waits on it | alive |
| `review-t1a` | re-check of ts-iphone-run 7c83786 / f28f47e / 8d4f6a1 | alive |
| `ts-wait` | toolsmith (lead spawn 13:3xZ, user request): blocking wait commands so agents stop sleep-loop polling; may ask iphone-runner + others what waiting hurt most | alive |
| `ts-gesture` | gesture tool landed (3a3f895, 74f5abd); owns I-042 (G strokes play as flicks, F-085): phone probe slot after the user sitting | alive |
| `res-layerpainted` | F-059/F-064/F-066 stamped, F-068 limitation posted | done |
| `doc-protocol-v2` (aa630a1a8c0adae9f) | v2 docs pass (LEAD, README DoD, AGENT_PROMPT, fix-reviewer, EXPERIMENTS, CLAUDE.md); not ops docs | alive |
| `arch-unknowns` (ENDED; C1 spec in unknowns-validity U1), `de-unknowns-render`, `de-unknowns-ux` (a47fed2b13de28ab2: pacing page F5, P-024) | unknowns hunt | de-* alive |
| `map-webkit-amplifiers` | D2 mapper (haiku): page-wide scan for the two WebKit amplifiers | alive |
| `ts-host-state` (a2bdbbb64c7731b2e) | T8+ host record landed 21ec95a + 34f6069 (I-033 RESOLVED) | done; C1 (lead, when the user is away) |
| `ts-claims-board` | claims-audit §4: findings-board claim status + refs (lead spawn 12:5xZ) | alive |
| `ts-bench-gain` (aabf938f2344fa8fc) | I-034 landed 526642f | done |
| `arch-claims` (ae93098a3c9f77a35) | claim audit (user rule CLAUDE.md 71ad57d "Platform claims: confirm against a reference"): research/architecture/claims-audit.md, verifiers ver-webkit-style / ver-webkit-ca / ver-chrome; refutations -> owners + mgmt-ops | alive |
| `review-host-state` | fix-reviewer (measurement mode) of T8+ 599471e | alive |
| `de-pm-morph`, `de-pm-hero` (a3f2c31df32a28d11) | post-mortems (postmortem-morph.md, postmortem-hero.md §7 D3 = avatar rotator, F-058, F-063); de-pm-hero scores P14 offline (resumable) | de-pm-morph ENDED; de-pm-hero idle |
| `arch-oss-survey` (a14e692b6f530f1c0), `de-oss-map` (af4a76a52eface067) | OSS rendering libraries survey + mechanism map -> 3-5 PoC shortlist for the lead (read-only) | alive |

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
