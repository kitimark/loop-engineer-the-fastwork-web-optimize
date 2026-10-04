# P-117 card: phone no-worse check for v8 + nav-hit-cache + scroll-cb (mgmt-ops-10, 2026-10-05, before any P-117 data)

**What this is.** The lead asked for one ticket and one block. It is the short no-worse phone check under the
less-work rule, for two fixes that both passed their count cards:
- **nav-hit-cache:** P-107, on v8.
- **scroll-cb:** P-108, on best-build v4.

Ops wrote this card, so the lead does the pre-data read and signs it. int-v8 fills in V's hashes and the harness hashes
before that read. There is no counted run before the read.

```
PHONE TICKET P-117 · less-work no-worse check, combined: v8 vs v8 + nav-hit-cache + scroll-cb · runner iphone-runner ·
  builder and verdict owner int-v8 (ops second read) · registered before any phone data; no counted run before the
  lead's pre-data read
when: after P-116 on the phone (and after I-173); the lead sets the phone order.
arms (2):
  C = v8-best: JS 3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16, CSS f836404b3728 (full sha256 in
      HASHES.txt)
  V = v8 + nav-hit-cache (fixes/nav-hit-cache/patch-on-v8.diff 7bbb6d4212ff, = P-107's V fd3688901f50, without the
      VA audit hook) + scroll-cb (fixes/scroll-cb-phone/patch-on-best.diff c2dc144b7bd2, carried onto v8 by int-v8):
      JS <int-v8 fills> / CSS f836404b3728 (neither fix touches CSS; if the build says otherwise, stop and report)
build and identity (int-v8, after scoring P-116; best-build's strict applier, no fuzz, refuses on any failure):
  - C equals v8's pin; nav-hit-cache on C equals fd3688901f50.
  - scroll-cb's hunks: report, hunk by hunk, whether each applies to v8 + nav-hit-cache with exact context. Its patch is
    on best-build v4; v8 changed the countdown, faces, glue, rest-script, accent and morph rev 3. If any hunk needs
    more than a line offset (a context or semantic merge), stop: that V is a new build. fix-scroll-cb must review it,
    and its counts no longer carry over from P-108 (see N2).
  - Order check: nav-hit-cache then scroll-cb gives the same bytes as scroll-cb then nav-hit-cache (the two owners
    agreed disjoint regions, README "Boundaries").
  - The reverse checks: V − scroll-cb = fd3688901f50, and V − nav-hit-cache = v8 + scroll-cb (hash reported).
  - node --check on V; debug hooks in V are the same as in C (no VA audit hook, no __nsForce change).
copies: out/p117/snap/{C,V} in int-v8's worktree, read-only, HASHES.txt (full sha256).
question: at real thermal Serious on a quiet Mac, does the combined V add slow frames over v8 in a scripted scroll of
  the whole page or in fast flicks through the middle of the page? No-worse only. No smoothness claim.
ports, served check, thermal gate, start method, sleep check: as P-114 (B plain baseline for pre-warm and gates, C, V;
  --port 0 --latency 150 --vendors=local, plain http; served-hash check before every item, exit 4 on a wrong one;
  thermal-gate.mjs --expect serious --max-c 44 at the start and end of every hold; pre-warm on B with S runs, at most 4;
  pmcheck.mjs). A hold counts only if both reads PASS. Otherwise it is VOID and runs once more with the same items. A
  VOID at the opening gate before any item does not use up that re-run (the lead's P-114 ruling). Ports go to the runner
  by message, never into a committed file.
Mac: every hold inside the runner's EXCLUSIVE no-timing hold of chrome-measure (P-114's line). load1 is kept per run
  and voids nothing.
holds (S runs ~37 s, G runs ~33 s; each hold <= 10 min):
  H1 (S): wC wV C1 V2 V3 C4
  H2 (S): C5 V6 V7 C8
  H3 (G part M): sCo wgC wgV gMC1 gMV1 gMV2 gMC2 gMC3 gMV3 sCc
  - S: n = 4 per arm, C V V C C V V C. Every counted C S run is a heat sentinel.
  - G: n = 3 per arm, C V V C C V (the new-cluster rule needs P-105's layout).
  - One uncounted warm-up per arm port per leg (wC/wV, wgC/wgV), so P-105's gap 2 is closed.
  - sCo / sCc: the opening and closing S sentinel on C, each with its own label (p117-sCo-H3 / p117-sCc-H3), so P-105's
    gap 1 is closed.
  - Then `iphone.mjs park`; int-v8 stops the servers. ~20 min of phone time.
drivers: S = `iphone.mjs run --driver scroll --probe std --block P-117 --arm C|V --run <n>` (whole page; Timeline off;
  sentinel runs with --heat-sentinel). G part M = flick-middle-v1.json (sha256/12 0f97205f1d42, P-105's and P-111's),
  window mid1 -> end, moving frames only. Why M: it crosses people, pain and commission, where scroll-cb's side
  jobs run, and the nav is live there too. Hero (H) flicks are P-116's question and are not repeated here.
scorer: int-v8 writes p117/score.mjs. It imports P-105's scorer unchanged (fixes/v7-best/phone/score.mjs b9a29ffcc7bb,
  refused if changed) for scoreS, scoreG, applySentinel, gate and clusters. Only the arm hashes are this ticket's; say
  how the served check gets them. Self-test: given P-105's own records and arms, it must give P-105's S gate (d −1) and
  GM gate (d 0, no new cluster). All hashes go into this card before the read.
  Gates (P-105's, unchanged):
  - S and GM: d = median V − median C of dt > 50 per run. WORSE at d > +2. Twins 46 / 54: a verdict that differs at a
    twin is threshold-sensitive. > 34 (twins 30 / 38) reported.
  - GM: any NEW cluster fails, even inside +2. A NEW cluster is a 250 px bin with a > 50 frame in >= 2 V runs, where no
    C run has one in that bin or a neighbour. Also scored at > 46 and > 54.
  - Fewer than 3 valid runs per arm in a leg or part: insufficient. At most one extra hold per leg.
  - Voids: P-105's (S: meta.error, served not the arm's, Low Power Mode, missing marks; G: no record, aborted, run
    errors, missing marks, median moving dt > 25 ms, served check not ok), plus the sentinel chain.
  Reported, not gated: per run the largest moving dt and frames > 100 ms; load1.
what each outcome means (fixed before data):
  - no-worse on S and GM, no new cluster: the phone part of the less-work rule is met for both fixes together. The land
    request still needs: fix-nav-morph's combined parity audit on this exact V (the VA hook on V, all 5 cases, task
    mode the gate, as P-107); and, if any scroll-cb hunk needed more than an offset, scroll-cb's counts on v8 (N2).
  - WORSE or a NEW cluster (threshold-sensitive or not): no land on this block. The verdict owner reports the gate,
    the bins and the size. Splitting the two fixes is a new question and the lead's call; it would be the second and
    last block on it (§5.3).
  - insufficient after the extra hold: no land from this block; report to the lead.
predictions (before data):
  - S no-worse: P 0.85 (both fixes remove work from scroll frames, and v8's S runs had 0-4 > 50 per run in P-105).
  - GM no-worse, no new cluster: P 0.75 (P-105's GM had 0 > 50 per run in both arms; new-cluster noise at 3 runs).
  - Sentinels pass on the first try: P 0.8.
  - Overall no-worse: P 0.65.
minutes: ~20 of phone time (3 holds), plus the waits for each exclusive hold.
```

Ops notes for the lead's read:
- **N1 (parity on touch).** P-107's parity audit drives the scroll from script, in Chrome. On the phone, momentum
  scrolling is the case where nav-hit-cache's cached scroll position (`__nsY`, written by the passive listener) could
  differ. Scroll events fire during momentum per the "run the scroll steps" order, but that is the HTML spec; that
  WebKit fires them every frame during momentum is UNRESOLVED here. Suggestion for fix-nav-morph's combined audit:
  add one Simulator G-gesture case with the VA hook (functional, shared lane, no timing), scored like task mode. Not
  part of this phone gate.
- **N2 (scroll-cb's counts were on v4).** P-108 measured scroll-cb on best-build v4. If every scroll-cb hunk carries
  to v8 with only offsets, its judged counts are element-owned (the less-work rule's pilot reading) and carry over. If
  any hunk needs a merge, that V needs scroll-cb's own count check on v8 (P-108's judged counts and guards, phone and
  Simulator, 2 loads per arm) before this block.
- **N3.** `__nsForce = !0` is owed only in a build combined with PR-018. This V has no PR-018, so it does not apply here.

## The lead's rulings (2026-10-05, before data)

- **N2 confirmed.** If any scroll-cb hunk needs more than line offsets on v8, int-v8 stops and reports. fix-scroll-cb
  then reviews the merged V and re-counts on it, with its pins sent to the lead and ops before data; the lead reads
  them. phone775 is not re-tested.
- **N1 accepted.** fix-nav-morph's parity audit on the exact V adds one Simulator momentum-flick case. WebKit's
  scroll-event timing during momentum is UNRESOLVED, so this case decides it locally.
- The lead signs this card once int-v8 has filled in V's JS hash and the harness hashes.

## Build filled in by int-v8 (2026-10-05, before data; ops checked the hashes on disk)

int-v8, branch worktree-agent-a068af37646232e05 @ 833fb29e (not landed yet). sha256/12; the full ones are in HASHES.txt.

| item | hash |
|---|---|
| C JS / CSS | 3e3e94cb6e9f / f836404b3728 |
| V JS / CSS | e8d8323f674b (e8d8323f674b0dd713b38b070f706f0a8540fcd7927c9fbab87f5cbb9ea0f657) / f836404b3728 |
| C + nav-hit-cache (reference) | fd3688901f50 (P-107's V) |
| C + scroll-cb alone (reference) | 4c48e372ecdd |
| build script fixes/v8-best/phone/nsc/build.mjs | 2e8e72b6d927 |
| carried patch fixes/v8-best/phone/nsc/scroll-cb-on-v8.diff | 3abcd7008e61 |
| inputs read from git | nav patch-on-v8.diff 7bbb6d4212ff @ 64ad0b9b; scroll-cb patch-on-best.diff c2dc144b7bd2 @ 5e616aa5 |
| snapshot HASHES.txt | e69686f9522b |

- **Snapshot path.** The copies are out/nsc/snap/{C,V}, not out/p117/snap as the card says. Ops re-hashed both JS
  files and HASHES.txt on disk: all match.
- **Identity checks, all ok (int-v8):**
  - each input equals its owner's build (27f23f6a3878 on best, fd3688901f50 on v8);
  - nav-hit-cache and scroll-cb commute, and V − nav-hit-cache = C + scroll-cb;
  - V's CSS equals C's, and node --check passes.
- **Carry: N2 is triggered.** 14 of the 16 scroll-cb hunks apply to v8 unchanged. 2 hunks, in the future section
  (`mM`), collide with rest-script v4: in v8, `u` = `fwCheck()` + `rAF(l)`. The original `scbU` would also skip
  `fwCheck` on phones while the gate is closed. int-v8's carry keeps it:
  `scbU = () => { ((scbPoke = !0), !scbOff || scbDirty || scbG.near() ? u() : fwCheck()); }`
  so only the job's rAF is gated. That is a semantic merge, so P-108's counts do not carry over. Under the lead's N2
  ruling, before this block:
  1. fix-scroll-cb reviews the merged V;
  2. it re-counts on it (pins before data; its phone view and the Simulator, 2 loads per arm, P-108 rules);
  3. it runs its class-state parity on phone and resize, combined vs C.
  int-v8 says `fwCheck` is a cached box with no layout read; that is int-v8's reading, and fix-scroll-cb's review
  checks it.
- **Still owed before the read:**
  - p117/score.mjs, its self-test on P-105's records, and their hashes (int-v8);
  - fix-nav-morph's VA audit on V e8d8323f674b, with the N1 case.
- **Servers** start at block time from int-v8's snapshot, not before. Ports go to the runner by message.
