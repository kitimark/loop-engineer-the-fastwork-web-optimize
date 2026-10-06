# v10: main's v9-final (rev 7d) + F1+U2 + P1

int-v8. The lead accepted the plan and asked for a pre-stage on 2026-10-06. PR-027 is not in: the user has not picked an
option yet, and its overlap and apply check comes when they do.

v10 lands only after the P-153 (P1) and P-152 (F1+U2) reads pass. If either fails, v10 drops that delta and the lead
re-rules.

## Arms (immutable snapshot `out/v10/snap-f5068db34a32`, HASHES.txt sha256/12 **e30901263912**)

| arm | build | JS | CSS |
|---|---|---|---|
| C | v9-final on main since 189ca7ed: baseline + `fixes/morph-scroll-v9try/patch.diff` (6d1632eb0ee9), rev 7d | 1b2eecc66011 | e1359ab9994a |
| V | C + F1+U2 (befc17cec97f, `fixes/nav-hit-cache/patch-on-v9f-f12.diff`) + P1 (d310e4d2ba0c, `fixes/end-morph-p1-v9f/p1-delta.diff`) | f5068db34a32 | a81b9af7b2c9 |

Full V hashes:

- JS f5068db34a32d5c930b4e4c7d9f175be2b0299dd6c644978b34eed44c1ae2662
- CSS a81b9af7b2c90b2b095364542c8d2d2bfe5b92bbab5de463066fdd76c51f0684

## Build: `sh fixes/v10/build.sh`

Every apply is `patch -p1 -F 0`: offsets are allowed, fuzz is not. Every intermediate step is pinned. V is built by three
routes, and all three give the same bytes:

| route | steps | pins |
|---|---|---|
| R1 | C, then F1+U2, then P1 | C + F1+U2 = 738bc075f7f8 / e1359ab9994a |
| R1b | C, then P1, then F1+U2 | C + P1 = 291f70523bd6 / a81b9af7b2c9 |
| R2 | rev 7d's own diff (v9-final 647c9ef2b1e2 to C; JS only, 4 hunks, 326167f95dc6), applied on the measured P-152/P-153 build v9-final + F1+U2 + P1 = 4da641f828bb / a81b9af7b2c9 | the measured bytes plus only rev 7d |

On top of R1, F1+U2 applies at offset -159 lines. That offset comes from the delta's own hunk headers, so it is the same
on v9-final. P1's JS applies at +21 and its CSS exactly.

**Code parity** (`fixes/v10/codeparity.mjs`): C to V's changed lines equal the union of the two deltas' changed lines,
compared as multisets. Context is ignored, so offsets don't count.

| file | lines removed | lines added | differences |
|---|---|---|---|
| JS | 3 | 157 | 0 |
| CSS | 0 | 65 | 0 |

Negative control: the same check of C against the measured build (which has no rev 7d) fails with 15 differences, all
rev 7d's lines.

The build refuses when:

- the baseline is not the pinned snapshot;
- any of the four patch files is not its pinned hash;
- any step is off its pin;
- the routes differ;
- code parity fails;
- V fails `node --check`;
- the snapshot holds extra files;
- the snapshot already exists (immutable).

## Overlap with rev 7d

Line numbers below are v9-final's, from `diff -U0`.

- **rev 7d:**
  - 14170: comment;
  - after 14221: `__msF0`;
  - 14258-14259: `__msSettle`, the fling-down exception;
  - 14282: touchstart records `__msF0`;
  - after 14285: an inert `__msDbg` log;
  - no CSS change.
- **F1+U2:**
  - after 14033: `__nsMsPend`;
  - after 14137: `_()` defers its test to `__msTick`;
  - 14156: F1 `visibility`;
  - 14312-14313: the `__msTick` morph-value write.
- **P1:**
  - JS: after 14589 (139 lines) and after 14718;
  - CSS: after 12414 / 12415.

The changes are disjoint at the line level. The nearest pair is F1 at 14156 and rev 7d at 14170, 14 lines apart. But rev
7d and U2 work on the same morph-scroll machinery:

- rev 7d lets a fast fling-down leave the end screen by its own momentum;
- U2 moves the nav hit test into `__msTick` while the morph is open, and forces the first frame after a close.

So the parity checks below include a fling-out. That rests on a code reading only (OBSERVED).

## Parity checks

These run in the shared lane only (`--shared`, probe weight). Nothing is timed.

- U2 parity on the v10 engine: `fixes/nav-hit-cache` base `v10u2`, C = 1b2eecc66011 + P1, V = v10.
- Chrome pixels at the morph stops: v10 against the measured 4da641f828bb.
- Chrome counts: v10 and 1b2eecc66011 against 4da641f828bb and 647c9ef2b1e2.
- A rev 7d fling-out probe.
- Simulator pixels and counts when a window opens.

Results are added below as they come in.
