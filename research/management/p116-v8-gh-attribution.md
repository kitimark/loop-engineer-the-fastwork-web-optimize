# P-116 draft: v8 hero-flick (GH) attribution ticket (mgmt-ops-10, 2026-10-05, before any P-116 data)

Drafted by ops at the lead's request after the second read of P-105, which agreed: v7 is WORSE than v6 on GH, and the
result is threshold-sensitive. **This is a draft.** The lead does the pre-data read, because ops wrote the ticket. int-v8
builds the arms and fills in the hashes before that read. No counted run happens before the read.

Why this block:
- **P-105 (v7 vs v6):** GH > 50 per run was C 7 / 7 / 8 and V 10 / 9 / 10, so d = +3. The twins were +3 at > 46 and
  +1 at > 54. No new cluster. Removing each hold's first V run gives +2.5, so the result does not depend on warm-up.
- **The v7 − v6 difference** is three groups: cd-strip, cd-roll-ca (V9 in v7) and rest-script v4.
- **v8** carries all three groups. Its roll is K in place of V9, and it adds faces, glue, accent exact and morph rev 3.
- **P-114 (v8 vs v7)** gave GH d −1, i.e. no-worse within +2. That is a verdict, not an equality. Values from different
  blocks do not compare, so whether v8 still carries v7's +3 against v6 is **unknown**. This block asks it, by component.

```
PHONE TICKET P-116 v8-best · GH attribution: which v7 group carries P-105's hero-flick cost, still in v8 · runner
  iphone-runner · builder and verdict owner int-v8 · registered before any phone data; no counted run before the
  lead's pre-data read
when: after the iPhone is back (I-173 USB lost) and after PR-018 rev 7b's phone slot; the lead sets the phone order.
arms (3, all on v8; CSS v8's f836404b3728 unless a removal changes CSS, then that arm's own CSS):
  C = v8-best: JS 3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16
  X = v8 minus the countdown group (cd-strip + cd-roll-ca K + countdown-faces + glue-heup), i.e. v8 with v6's countdown:
      JS 65d72981246f820cf70b74b926ac1243be5d09e370a1b9739a7246eb499070a3
      CSS 4c9a9b4fc7bf432c41b7bb3832558658d6f6b8b405c40da6821e2e7b24a5698a (own CSS: cd-strip changes the CSS)
  Y = v8 minus rest-script v4: JS 528c09e97de66010d1f75395f765c6a625f51fb4602cc1cdf1e38a237c6f67cd
      CSS f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43 (v8's; rest-script is JS only)
  why groups: K is a delta on the cd-strip build, faces sits on strip + K and the glue on faces x hero R2, so "v8
  minus cd-strip" alone is not a build. The countdown group comes out whole. Splitting it (strip vs K) is block 2, only
  if X is CAUSE.
identity (int-v8, best-build's strict applier, no fuzz; a P-113 build.mjs successor that refuses on any failure):
  every input equals its owner's build; X + (strip, K, faces, glue) = C and Y + rest = C by forward application;
  X = v6 + rest + accent exact + morph rev 3, so X minus rest, accent and morph rev 3 equals v6 byte for byte
  (8018ce062d30 / 71b65c667720); three different JS; node --check on X and Y.
copies: out/p116/snap/{C,X,Y} in int-v8's worktree, read-only, HASHES.txt (full sha256).
question: does removing the countdown group, or rest-script, take v8's hero-flick > 50 count down by more than 2 per
  run? Attribution only; it decides no landing.
ports, served check, thermal gate, start method, sleep check: as P-114 (B plain baseline for pre-warm and gates, C X Y;
  --port 0 --latency 150 --vendors=local, plain http; served-hash check before every item, exit 4 on a wrong one;
  thermal-gate.mjs --expect serious --max-c 44 at the start and end of every hold; pre-warm on B with S runs, at most
  4; pmcheck.mjs). A hold counts only if both reads PASS; else VOID, run once more with the same items. Ports go to the
  runner by message, never into a committed file.
Mac: every hold inside the runner's EXCLUSIVE no-timing hold of chrome-measure (P-114's line), so no shared job runs
  beside it; load1 per run kept, voids nothing.
holds (G-H runs ~33 s; each hold <= 10 min):
  H1: sCo wgC wgX wgY gHC1 gHX1 gHY1 gHX2 gHY2 gHC2 sCc
  H2: sCo gHY3 gHC3 gHX3 gHC4 gHY4 gHX4 sCc
  - n = 4 per arm (P-105 had 3; per-run spread 7-10 needs the fourth). The order is a rotated Latin square, C X Y · X Y C
    · Y C X · C Y X, so each arm sits once or twice in each position.
  - One uncounted warm-up per arm port (A3/U5; P-105 had none for V in its G holds, its ticket gap 2).
  - sCo / sCc: the opening and closing S heat sentinel on C. Each has its own label (P-105 gap 1: the closing one
    overwrote the opening one).
  - Then `iphone.mjs park`; int-v8 stops the servers.
driver: G part H = flick-hero-v1.json (6ae05e12ace9 / GESTURE_HASH 53a8e657fa28; the same gesture as P-105, P-111,
  P-113 and P-114), window down1 -> end, moving frames only. Timeline off.
scorer: int-v8 writes p116/score.mjs. It imports P-105's scorer unchanged (fixes/v7-best/phone/score.mjs b9a29ffcc7bb,
  refused if changed): scoreG's moving frames and voids, applySentinel's chain, and median/gate. Three arms, plus a
  self-test on P-105's own G-H records: with C = P-105's C and V = P-105's V, it must give d = +3 and twins +3 / +1.
  Hashes go into this ticket before the read.
  - Per removal arm A in {X, Y}: dA = median(A) − median(C) of moving frames > 50 per run.
  - CAUSE when dA < −2, i.e. the removal takes away more than P-105's whole no-worse margin.
  - PART when −2 <= dA <= −1.
  - NOT THE CAUSE when dA > −1.
  - Threshold-sensitive when the > 46 or > 54 verdict differs.
  - Block verdict: COUNTDOWN / REST / BOTH (both CAUSE) / SPLIT (no CAUSE, both PART) / NOT LOCATED (neither CAUSE nor
    SPLIT) / insufficient (< 3 valid runs in an arm).
  - Reported, not gated:
    - per run: moving frames, > 50 per 100 moving frames, > 34, and the largest moving dt;
    - per arm: frames > 100 ms (P-105's V had four 104-116 ms frames, at scrollY 114-1398; C had none above 86);
    - the 250 px bins with a > 50 frame in >= 2 runs, per arm.
  - Voids: P-105's G voids (no record, aborted, run errors, missing marks, median moving dt > 25 ms, the served check
    before the item not ok), and the sentinel chain. At most one extra hold.
what each outcome means (fixed before data):
  - COUNTDOWN CAUSE: block 2 (the last on this question, §5.3) splits strip vs K. Arms: C, v8 with V9 for K (P-113's
    R build), and the strip-only form if int-v8 can build it exactly. The lead decides whether a fix of that part is
    a new topic.
  - REST CAUSE: the hero-flick cost goes to rest-script's owner as a new question. No block 2.
  - BOTH or SPLIT: the cost is spread. Report to the lead; no block 2 by default.
  - NOT LOCATED: neither group carries a > 2 cost in v8, so P-105's +3 is not attributable in v8 (it may not be there
    at all). The lead decides whether block 2 is a v8 vs v6 confirm (same gate as P-105's GH).
  - A VOID hold: the same items once more.
predictions (before data):
  - X (countdown out) CAUSE: P 0.25. P-113 put faces + glue and K back to back with no change in the hero band, but
    strip is untested.
  - Y (rest out) CAUSE: P 0.15.
  - NOT LOCATED: P 0.55. In P-113 and P-114, v8's own GH counts ran 7-9 per run, which suggests (only suggests: values
    from different blocks do not compare) that P-105's +3 is mostly v7-specific or noise at 3 runs.
  - Frames > 100 ms appear in C (v8) in >= 2 of 4 runs: P 0.3.
  - Sentinels pass on the first try: P 0.8.
minutes: ~14 of phone time (2 holds, 17 G runs + 4 sentinels, pre-warm and gates), plus the waits for each exclusive
  hold.
```

Open items before the read (int-v8):
1. Build X and Y with the identity checks, and fill in the hashes.
2. Write p116/score.mjs and its self-test, and pin both hashes.
3. Write hold.sh and serve.sh (P-114's with three arms, labels p116-*), and pin their hashes.
4. If reversing the group from v8 does not apply cleanly, build X forward instead: v6 + rest + accent exact + morph
   rev 3. These are the same intended bytes; say which way was used. v8 with V9 for K (P-113's R) is not a substitute
   for X, because V9 is v7's own roll and the group stays in.

## Pins (int-v8, 2026-10-05, before any P-116 data)

All four open items are done; files in `fixes/v8-best/phone/p116/`, committed together with this section.

1. **Arms**, `node fixes/v8-best/phone/p116/build.mjs` (best-build's strict applier, no fuzz; refuses on any failure,
   writes nothing then; `--dry` checks only). Copies `out/p116/snap/{C,X,Y}` in int-v8's worktree, read-only, with
   HASHES.txt (full sha256 per file; HASHES.txt itself 435424487a8b).

   | arm | JS (sha256) | CSS (sha256) |
   |---|---|---|
   | C = v8-best | 3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16 | f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43 |
   | X = v8 minus the countdown group | 65d72981246f820cf70b74b926ac1243be5d09e370a1b9739a7246eb499070a3 | 4c9a9b4fc7bf432c41b7bb3832558658d6f6b8b405c40da6821e2e7b24a5698a |
   | Y = v8 minus rest-script v4 | 528c09e97de66010d1f75395f765c6a625f51fb4602cc1cdf1e38a237c6f67cd | f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43 |

   - **Which way (item 4): by reversal.** X = C − glue − faces' − K − strip, and Y = C − rest, both apply strictly.
     The forward builds give the same bytes and are checked too: X = v6 + rest + accent exact + morph rev 3, and
     Y = best + hero, strip, K, faces', accent, morph, glue (no rest).
   - **Identities, all pass:** 10 inputs equal their owners' builds (st6-rb2, best-build, v6, cd-strip, cd-roll-ca K,
     rest-script v4, v7-best, accent exact, morph rev 3, v8 patch.diff); the forward v8 = C; X + strip + K + faces' +
     glue = C; Y + rest = C; X − rest − accent − morph = v6 byte for byte (8018ce062d30 / 71b65c667720); three
     different JS; Y's CSS = v8's; node --check on X and Y.
   - **X's CSS is its own** (cd-strip changes the CSS), as the arms line allows.
   - Components are derived as in `fixes/v8-best/check.mjs`: strip, K and rest as build differences, the other five
     from their committed delta files.
2. **Scorer** `score.mjs`, and its self-test `selftest.mjs`.
   - It imports P-105's scorer unchanged (b9a29ffcc7bb…, full sha pinned in the file; it refuses if that file changed):
     scoreG, applySentinel, gate, median.
   - P-116's own parts:
     - The items.
     - The served check's arm lines: B, C, X and Y must all be "ok". P-105's scoreG looks for B, C and V lines, so a
       log that passes P-116's check is handed to it as a B/C/V "ok" log. A log that fails is handed over unchanged,
       plus WRONG, and scoreG voids that run with its own reason.
     - The S sentinels on C (pass feeds P-105's chain).
     - The class and block rules above, and the reported-only lines.
   - The self-test passes 23/23:
     - Unit and synthetic-block checks: COUNTDOWN / REST / SPLIT, a missing or WRONG check log voids, a failing closing
       sentinel voids the hold, frames > 100 ms counted.
     - **The ticket's check on P-105's own G-H records** (H4: sC-H4-open, gHC1 to gHC3, gHV1 to gHV3, sC-H4; copies in
       int-v8's `out/p105/runs`, input sha256s printed). It gives d = +3 at > 50, +3 at > 46 and +1 at > 54 (C 7/7/8,
       V 10/9/10), the same deltas as P-105's scorer run directly.
3. **serve.sh / hold.sh**, P-114's with three arms and labels `p116-*`:
   - serve.sh serves B, C, X and Y. Its `snap` mode runs build.mjs.
   - hold.sh drops P-114's M items. Its items are sCo/sCc, wgC/wgX/wgY and gH[CXY]<n>. Sentinel labels are
     `p116-sCo-<H>` / `p116-sCc-<H>`, so they no longer overwrite each other.
   - Its G line, S sentinel line, gates and sleep check are P-114's, unchanged.
   - Dry serve on 2026-10-04 at 19:40Z, in a shared slot, with no phone:
     - B, C, X and Y each served their pinned JS/CSS, "ok" on both the start check and `check`.
     - The servers were then stopped.
   - Hold length, estimated from P-114's H3 (7 items, 349 s; G runs about 32 s apart):
     - H1 (11 items): about 480 s.
     - H2 (8 items): about 380 s.
     - Both are under the 600 s hold.

| file | sha256 (12) |
|---|---|
| fixes/v8-best/phone/p116/build.mjs | 29e2c92c23db |
| fixes/v8-best/phone/p116/serve.sh | 1f0c0d4ba825 |
| fixes/v8-best/phone/p116/hold.sh | b25c8fc83e6f |
| fixes/v8-best/phone/p116/score.mjs | 6c5dbcfac85e |
| fixes/v8-best/phone/p116/selftest.mjs | 0f6b57150ef4 |
| fixes/v7-best/phone/score.mjs (P-105's, imported) | b9a29ffcc7bb |
| fixes/v8-best/phone/g/flick-hero-v1.json | 6ae05e12ace9 |

## Lead pre-data read (2026-10-04 19:4xZ, before any P-116 data): PASS, with R1-R3

- Pins checked on main (9e67e2ca): all seven sha256/12 in the table above match the files. No P-116 data exists.
- Arms, question, classes, outcomes and predictions were fixed before data, by ops (writer) and int-v8 (builder). The
  lead did not write them.
- Ops' P-105 notes are covered: N1 (only +1 at > 54) by the threshold-sensitive rule; N2 (n = 3) by n = 4 per arm.
- **R1, the served-check adapter: accepted.** P-116's check (B, C, X, Y all ok) runs first, and a failing log reaches
  P-105's scoreG with WRONG, so the void is scoreG's own. The arm of each run comes from P-116's item label, never
  from scoreG's B/C/V names. The self-test's WRONG and missing-log cases cover it.
- **R2, gesture budget (I-112):** if `iphone.mjs gesture` refuses an item for lack of hold time, that item is
  missing, not a void of the hold. It runs in the one extra hold, with the hold's sentinels. The extra hold is
  still at most one.
- **R3, phone order:** after PR-018's phone step (fix-hero-exit-threaded: rev 7c robot part, then the user's blind
  finger pair). User steps go first (memory user-steps-first). iphone-runner runs H1 and H2; int-v8 owns the verdict.
