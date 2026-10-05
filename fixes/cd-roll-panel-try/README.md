# Fix: cd-roll-panel-try (Try-it B for the panel clock roll proposal)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

Build only, no new code: the baseline-relative patch the console's Try-it panel serves as B for the panel clock roll
proposal (P-097 rev 4.2, lead 2026-10-06). It is A + the P-097 delta, nothing else.

- A = the current v9-final = baseline + `fixes/morph-scroll-v9try/patch.diff` (v9-final + menu rev 7d):
  JS 2.DyWL8TcE.js 1b2eecc66011, CSS 2.gBuqKVzi.css e1359ab9994a.
- B = A + `fixes/cd-roll-panel/patch.diff` (0a53abca21ff, the P-097 delta measured on pre-7d v9-final 647c9ef2b1e2 ->
  5c203b483c18): JS 2cfd990c788d, CSS e1359ab9994a (unchanged).
- Check: the delta applies to 1b2eecc66011 with `patch -p1`, all 9 hunks, no fuzz; `node --check` OK; it touches no
  7d line (byte-diff in fixes/cd-roll-ca/README.md, "P-097 rev 4.2 addendum").
- `patch.diff` here = `fix.mjs diff` of an overlay holding exactly those two files (baseline-relative, 2 files).

Measurements and their limits: `fixes/cd-roll-ca/README.md`, "P-097 rev 4.2 result" (on the pre-7d base only).
