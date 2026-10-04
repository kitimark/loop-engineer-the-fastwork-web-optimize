# Phone ticket draft: double-drive no-worse check (fix-double-drive, 2026-10-05, before any phone data)

Drafted by the fix owner for mgmt-ops to validate and number, and for the lead to read and sign. Its shape copies
P-117 (research/management/p117-combined-phone-no-worse.md). Only the arms, the question and the predictions are new.
There is no counted run before the lead's pre-data read.

```
PHONE TICKET P-118 · less-work no-worse check: v8 vs v8 + double-drive · runner iphone-runner · builder and verdict
  owner fix-double-drive (ops second read) · registered before any phone data
profile: xcode-serious (lead amendment aacfbd40, user T-162 #3; ops rule c10a3660). No heat pre-warm, no cooling wait;
  every counted run is under Xcode-induced Serious. Never pooled with a real-heat block.
when: the Simulator pixel check (set 2 of 2) passed (0 consistent differences) and left V unchanged. The phone order
  is the lead's call; P-118 runs first, independent of P-117 (V has neither nav-hit-cache nor scroll-cb).
V pinned (final, before the lead's read): JS 3076c5a8c9a3 / CSS 2f7197880ffd (full sha256 above). Any change to V's
  JS or CSS after this voids the lead's signature: re-hash, ops re-checks, the lead re-signs.
coverage (G part M is the right part): on the phone (430x775 probe) the future card carries .is-future-shrinking at
  scrollY 1468-2860 of a 5189 page, i.e. the middle, not the end; flick-middle-v1 works y 1900-3800, so it covers that
  range. The page end (G part E) has no future card shrink. The commission card is compact on phones.
arms (2):
  C = v8-best: JS 3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16,
               CSS f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43
  V = v8 + fixes/double-drive/delta.diff (sha256/12 baae6114cd65, commit 96293d29):
               JS 3076c5a8c9a376616f95962d10773bd861a81a2c0a081068fc7df23256ac5785,
               CSS 2f7197880ffddb8dcde04664e24d22d0893ecd02579e8fdd773c5f5a7704b40e
  The same V is v9 component 3. int-v8 checked that it commutes with menu swipe rev 7c.
build and identity: `sh fixes/double-drive/phone/serve.sh snap` copies C from v8's snapshot and applies delta.diff with
  `patch -p1`. It refuses on fuzz, .orig/.rej or any hash other than the four above. Copies: out/pdd/snap/{C,V},
  read-only, HASHES.txt with the full sha256. V adds no debug hooks over C.
question: at Xcode-induced thermal Serious on a quiet Mac, does V add slow frames over v8 in a scripted scroll of the whole page,
  or in fast flicks through the middle of the page (#people, pain, commission)? No-worse only, no smoothness claim.
  On phones V changes little: the commission card is compact (transform none, untouched), and the future card's
  scale is fixed at 1, so V only drops the future card's transform transition while it shrinks. That is 4 -> 2
  transitionruns in Chrome at 430x775 and 3 -> 2 in the Simulator, with geometry identical in both arms.
ports, served check, thermal gate, start method, sleep check: as P-117 (B plain baseline for the gates' timer page, C, V;
  --port 0 --latency 150 --vendors=local, plain http; `sh fixes/double-drive/phone/serve.sh check` before every item,
  exit 4 on a wrong hash; thermal-gate.mjs --expect serious --max-c 44 --accept-induced once at the start and once at the
  end of every hold (after the last run), labelled p118-<H>-start / -end; exit 2 condition dropped or Nominal/Fair, 3
  ceiling, 7 real heat instead of the Xcode condition; no heat pre-warm; pmcheck.mjs).
  A hold counts only if both reads PASS, otherwise VOID and once more with the
  same items. Ports go to the runner by message, never into a committed file.
Mac: every hold inside the runner's EXCLUSIVE no-timing hold of chrome-measure (P-117's line).
holds (each <= 10 min):
  H1 (S): wC wV C1 V2 V3 C4
  H2 (S): C5 V6 V7 C8
  H3 (G part M): sCo wgC wgV gMC1 gMV1 gMV2 gMC2 gMC3 gMV3 sCc
  S n = 4 per arm, C V V C C V V C; every counted C S run is a heat sentinel. G n = 3 per arm. One uncounted warm-up
  per arm port per leg. Then `iphone.mjs park`; the servers stop (serve.sh stop). ~20 min of phone time.
drivers: S = `iphone.mjs run --driver scroll --probe std --block P-118 --arm C|V --run <n>`; G part M =
  flick-middle-v1.json (sha256/12 0f97205f1d42, as P-105/P-111/P-117), window mid1 -> end, moving frames only.
scripts (pinned, sha256/12): fixes/double-drive/phone/serve.sh 730fb0718409 (committed in a95e4ea7);
  fixes/double-drive/phone/hold.sh 09c0b21eaa0f (a copy of P-116's hold.sh b25c8fc83e6f with arms C and V and P-117's
  items; labels p118-*, --block P-118; revised for xcode-serious: pre-warm removed, gates --accept-induced; it was
  58d285cb0094 before).
scorer: fixes/double-drive/phone/p118/score.mjs 652bba12f6a3 and selftest.mjs f2823168094f (sha256/12), written by
  int-v8 (lead's order, 21:19Z; its commit bb68123d) on P-116's scorer, which handled an arm with its own CSS; ops reads
  them before data. Run in block order: `node fixes/double-drive/phone/p118/score.mjs <item>:<file> ... --json out.json`
  (it reads p118-<H>-check-<item>.log beside each run file, as hold.sh writes it). It imports P-105's scorer unchanged
  (b9a29ffcc7bb, refused if changed: scoreS, scoreG, applySentinel, gate, clusters), and its self-test must reproduce
  P-105's S gate (d -1) and GM gate (d 0, no new cluster). Item names as in hold.sh.
  Gates (P-105's, unchanged): S and GM: d = median V − median C of dt > 50 per run, WORSE at d > +2; twins 46 / 54
  (threshold-sensitive if a twin's verdict differs); > 34 (twins 30 / 38) reported. GM: any NEW cluster fails (a 250 px
  bin with a > 50 frame in >= 2 V runs and none in C in that bin or a neighbour). Fewer than 3 valid runs per arm:
  insufficient; at most one extra hold per leg. Voids as P-105 plus the sentinel chain.
what each outcome means (fixed before data):
  - no-worse on S and GM, no new cluster: the phone part of the less-work rule is met; double-drive may land (on v8, or
    inside v9 as component 3).
  - WORSE or a NEW cluster: no land on this block. The verdict owner reports the gate, the bins and the size. A second
    block is the lead's call (the last one, §5.3).
  - insufficient after the extra hold: no land from this block; report to the lead.
predictions (before data):
  - S no-worse: P 0.9 (V removes one transform transition per class toggle and changes no geometry on phones).
  - GM no-worse, no new cluster: P 0.8 (P-105's and P-111's GM had 0 frames > 50 per run in both arms).
  - Sentinels pass on the first try: P 0.8.
  - Overall no-worse: P 0.75.
minutes: ~20 of phone time (3 holds), plus the wait for each exclusive hold.
```

Owner's note: the desktop gain (no future-card trail, no origin flips on a fast scroll up) can't show on the phone,
because phones run neither the shrinking scale nor the commission transform. This block is a no-worse check only.
