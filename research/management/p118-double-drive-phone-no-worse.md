# P-118: phone no-worse check for v8 + double-drive (mgmt-ops-10, 2026-10-05, before any P-118 data)

**What this is.** fix-double-drive drafted the ticket (its worktree: fixes/double-drive/phone/TICKET.md, sha256/12
9a6dc3ff95b7 when ops read it, as P-117's shape, with the id left open). Ops numbered it **P-118** and validated it. The
ticket text stays in the owner's file; this card holds the number, the pins ops checked on disk, and the gaps to close
before the lead's read. No counted run happens before the lead signs.

**profile: xcode-serious** (lead amendment ~21:55Z below; ops first recorded real-serious under the phone-ticket
profile rule, ops-handover.md "Phone ticket profile", before the amendment reached it). No counted run used real heat.
Its blocks never pool with a real-heat block.

## Pins ops checked on disk (2026-10-05, in the owner's worktree)

| item | sha256/12 | result |
|---|---|---|
| C JS (out/pdd/snap/C) | 3e3e94cb6e9f | = v8-best, matches the ticket |
| C CSS | f836404b3728 | matches |
| V JS (out/pdd/snap/V) | 3076c5a8c9a3 | matches the ticket and HASHES.txt |
| V CSS | 2f7197880ffd | matches. **V's CSS differs from C's**, unlike P-117 |
| fixes/double-drive/delta.diff | baae6114cd65 | matches the ticket (commit 96293d29) |
| fixes/double-drive/phone/serve.sh | 730fb0718409 | uncommitted when read; pin the committed file |

The snapshot copies are read-only. HASHES.txt lists the four files with full sha256, equal to the ticket's.

## Ops validation of the ticket: PASS WITH GAPS (all gaps are before the read, none is a design objection)

What is sound: the question is one fixed no-worse question; arms and holds are P-117's layout (S n = 4 per arm C V V C
C V V C, G part M n = 3, sentinels with their own labels, one warm-up per arm port); the gates are P-105's, unchanged;
outcomes and predictions are written before data (S 0.9, GM 0.8, overall 0.75: consistent with S x GM = 0.72); the
statement that this block is a no-worse check only is right, because the owner's own note says the desktop gain cannot
show on a phone.

Gaps to close before the lead's read:
1. **No scorer exists.** The ticket says "P-117's scorer with this ticket's arm hashes". P-117's scorer
   (fixes/v8-best/phone/p117/score.mjs, 23cfb35e5516) hard-codes P-117's V (e8d8323f674b) with V's CSS equal to C's. This
   V has its own CSS, so the served check and the arm table need a P-118 scorer, as P-116 had for its X arm
   (fixes/v8-best/phone/p116/score.mjs, own CSS). Needed: p118/score.mjs plus a self-test that reproduces P-105's S gate
   (d -1) and GM gate (d 0, no new cluster), imports P-105's scorer unchanged (b9a29ffcc7bb, refused if changed), and
   pins both hashes in the ticket. Suggested owner: int-v8 (wrote P-116's and P-117's), ops second read.
2. **No hold.sh.** Only serve.sh exists. The runner needs the hold script with the items, labels `p118-*` and P-117's
   gates (P-116's hold.sh b25c8fc83e6f is the template). Pin its hash.
3. **Provisional pins.** The Simulator pixel check (set 2) is still running, and the arms may change after it. Rule,
   fixed now: any change to V's JS or CSS voids the lead's signature. The ticket gets new hashes, ops re-checks them on
   disk, the lead re-signs, and only then does a counted run start.
4. **Placeholders.** Replace every `P-<ops>` in the ticket with P-118, including the `--block` argument and the labels.
5. **Coverage question (not a block).** The ticket's G part is M (people, pain, commission). Please state in one line
   where the future card sits in y on the phone. If it lies in the end-of-page range, G part E (the end flick) covers
   it better than M, and the ticket should say why M is enough. The owner's claims about the phone (commission
   transform none, future scale fixed at 1, 4 to 2 transitionruns in Chrome and 3 to 2 in the Simulator) are
   OBSERVED in our setup; they explain the prediction and gate nothing.
6. **Order.** The ticket says "after P-117". P-117 is on hold, and V here does not contain nav-hit-cache or scroll-cb,
   so P-118 does not depend on P-117's outcome. Only the lead's phone order decides. Say so in the ticket.

## What each reader does next

- fix-double-drive: items 1 (with int-v8), 2, 4, 5, 6 in the ticket, commit, send ops the sha. Item 3 follows the
  Simulator pixel set 2.
- Ops: second read of the scorer and hold script once the hashes are in; check them on disk before data.
- The lead: pre-data read and signature after item 3 resolves. A signature on provisional pins is not enough to start.

## Ops re-check after fix-double-drive's close (commit 063c9edd, 2026-10-05 04:20+07, on its branch)

| item | sha256/12 | result |
|---|---|---|
| TICKET.md | 6bfd511f9a89 | placeholders gone; P-118 in the --block argument and labels |
| phone/hold.sh | 58d285cb0094 | diffed against P-116's b25c8fc83e6f, see below |
| phone/serve.sh | 730fb0718409 | committed; same bytes as read before |
| delta.diff | baae6114cd65 | unchanged |
| V JS / CSS | 3076c5a8c9a3 / 2f7197880ffd | unchanged by Simulator pixel set 2 (the owner says so; the hashes on disk match) |

- **hold.sh diff against P-116's:** only the arms (C, V), the S items (wC, wV, C<n>, V<n>), the G part M items
  (wg[CV], gM[CV]<n>), the snapshot folder (out/pdd/snap), the scenario (flick-middle-v1.json), the labels p118-*, the
  block P-118 and the serve.sh path changed. The gate, pre-warm, served check before every item, park after every G
  run and the sleep check are P-116's lines. The relative `cd` is correct for its path. A counted C S run is a heat
  sentinel by default in the run tool (tools/lib/iphone-run.mjs line 214), as in P-105, so the missing
  `--heat-sentinel` on C<n> is right.
- **Gaps 2, 4, 5, 6: closed.** Coverage (gap 5): the owner puts the future card's shrink at scrollY 1468-2860 of 5189 on
  the phone, inside flick-middle-v1's window (y 1900-3800 is the flick's work range), so part M fits and part E has
  no future-card shrink. That is the owner's OBSERVED position, which gates nothing.
- **Gap 1, the scorer: open.** The lead assigned p118/score.mjs and its self-test to int-v8 (21:19Z). Its hashes go
  into the ticket, and ops reads and re-runs it before the lead's read.
- **Gap 3, provisional pins:** the desktop commission recheck is still queued. If it changes V, the owner re-hashes
  and tells ops, and the signature is void until the new pins are read.
- Status: **ready for the lead's read once the scorer's hashes are in the ticket.**

## Lead signature (2026-10-04 ~21:30Z, before any P-118 data): SIGNED, with conditions S1-S3

Pre-data read: ticket 6bfd511f9a89, hold.sh 58d285cb0094, serve.sh 730fb0718409, arms C 3e3e94cb6e9f / f836404b3728 and
V 3076c5a8c9a3 / 2f7197880ffd, scorer score.mjs 652bba12f6a3 + selftest f2823168094f (bb68123d, self-test passes),
ops validation PASS WITH GAPS with gaps 2, 4, 5 and 6 closed (063c9edd). Signed now so the idle phone runs (user T-161 #4,
roles v3 R3), with:
- **S1 arms-superseded rule.** fix-double-drive's desktop at-rest probe (y 6000 commission card, ~5 css px lower in V,
  diagnostic) is still open. If it changes V's JS or CSS, every P-118 run is kept but marked `arms-superseded`: it is
  not counted, the ticket gets new pins, ops' disk check and a new signature before any counted run.
- **S2 scoring waits on ops' second read of the scorer** (running and recording do not).
- **S3** no change to the layout: S H1/H2 + G part M H3, sentinels and gates as P-105; one block, the sequential rule.

## Ops scorer read (int-v8's commit bb68123d, 2026-10-05 04:25+07, on its branch): PASS

| file | sha256/12 on disk | result |
|---|---|---|
| fixes/double-drive/phone/p118/score.mjs | 652bba12f6a3 | as named in the ticket |
| fixes/double-drive/phone/p118/selftest.mjs | f2823168094f | as named in the ticket; re-run by ops: 29 OK, 0 failed, "all OK" |
| fixes/v7-best/phone/score.mjs (imported) | b9a29ffcc7bb | P-105's scorer, unchanged |

- **Diff against P-117's score.mjs (23cfb35e5516):** header comments, the names (P117 → P118, scoreS117 → scoreS118,
  scoreP117 → scoreP118, `checkOk(log, cfg = P118)`) and the V pin only. No logic change; P-117's code already checks
  each arm's CSS against that arm's own pin, which V (own CSS) needs.
- **The scorer's pins match the snapshot on disk in full** (out/pdd/snap/HASHES.txt, all 64 hex digits): C JS
  3e3e94cb6e9f / CSS f836404b3728, V JS 3076c5a8c9a3 / CSS 2f7197880ffd. The served check's B pin (4606120cf392 /
  27776f3d4138) matches serve.sh's `check` case.
- **Check logs line up:** hold.sh writes `p118-<H>-check-<item>.log` before every item; the scorer reads the newest
  `*-check-<item>.log` beside each run file and matches serve.sh's line `<A> pid … port … served JS <j> CSS <c> ok`.
- **Self-test on P-105's records:** S gate d −1 at > 50 (no-worse), GM gate d 0 with no new cluster at > 50
  (no-worse), both equal to P-105's own scorer run directly; block no-worse, threshold-sensitive (GM new cluster at
  > 46, 3250-3499; none at > 54), as P-105 read. The synthetic cases void a run that serves another V, V's JS with C's
  CSS, or C for V; void G runs with no check log or a wrong hash; void runs since a failed sentinel; and report
  > 100 ms frames.
- **On main:** the scorer landed as 97bbd4ad; main's score.mjs, selftest.mjs and P-105's scorer hash as in the table.
- **Ticket committed:** fix-double-drive committed the ticket's scorer lines in 2de7f724 on its branch (TICKET.md
  dfbac7327abe, checked from the commit). It is on main as fd2aede3, with the same hash.
- **S1:** the owner reports that the at-rest check left V unchanged. The snapshot's V hashes on disk are still
  3076c5a8c9a3 / 2f7197880ffd, so the arms stand and this read holds.
- Status: **scorer second read PASS; the signature's S2 condition is met, P-118's data may be scored with this scorer.**

## Lead amendment (2026-10-04 ~21:55Z, user T-162 #3/#5): profile xcode-serious

No counted run had started: warm-up hold 1 (21:37-21:45Z) left a cold phone (Nominal 30.7 °C) at Fair 34.9 °C after 12
flicks. The user chose Xcode's Thermal State "Serious" as the default profile with no heat pre-warm, so P-118 runs under
profile `xcode-serious`: gate `--expect serious --accept-induced` (c4875944) at the start and end of every hold, no
pre-warm, the per-arm load warm-up (A3/U5) kept, ceiling 44 °C / Critical. Arms, order, scorer and gates are unchanged.
Order: iphone-runner's decisive check part OFF on the cool phone, mgmt-devices' console step (the user sets the
condition), part ON, then H1. P-118 data never pools with real-heat blocks. Whether induced Serious also slows the chip
stays UNRESOLVED until the decisive check reports.

## Ops xcode-serious check of the pinned scripts (2026-10-05, before H1, asked by the lead): FAIL on 2 of 4

Read against the four xcode-serious checks (ops-handover.md "Phone ticket profile"). The amendment (eae96f01) changed
the card, not the pinned hold.sh, which is still **58d285cb0094** in every worktree that has it (agent-a4f202310c79fbd82,
agent-a830cd580ed840805, mgmt-devices-gate, and ops' copy).

| # | check | hold.sh 58d285cb0094 | result |
|---|---|---|---|
| 1 | no heat pre-warm | lines 42-51: before the first gate read, every hold runs `iphone.mjs run … --warmup` on B (`p118-<H>-prewarm<n>`), and on gate exit 2 it repeats, at most 4 | **FAIL** |
| 2 | `thermal-gate.mjs --accept-induced` at start and end of each hold | line 40: `--expect serious --max-c 44`, no `--accept-induced`; with an induced Serious `gateVerdict` returns 4 ("induced by Xcode", verdict.mjs at c4875944), so H1 would void at its start gate after one pre-warm run | **FAIL** |
| 3 | one uncounted load warm-up per arm port | items wC / wV (S) and wgC / wgV (G part M), labels `--warmup --arm C|V` | PASS |
| 4 | 44 °C / Critical ceiling | `--max-c 44`; Critical or battery >= 44 exits 3 in every profile; start exit 5 VOID, end exit 3 VOID | PASS |

Nothing is lost if H1 runs as pinned (it voids before any counted run), but it would heat the phone with real runs
first, which the profile forbids. Needed before H1, owned by the script owner, signed like the amendment:
- a revised hold.sh: drop the pre-warm loop; `gate start` read once, exit 2 = VOID (no retry by heating, the user resets
  the condition); `--accept-induced` on both gate calls; everything else byte-for-byte;
- its new hash committed before data, the PIN line in the H1 log, and the gate tool at c4875944 or later in the
  checkout that runs it;
- the decisive check (part OFF, the user's console step, part ON) still precedes H1 per the amendment.
Ops re-reads the revised script (diff against 58d285cb0094: only those lines) on request.
