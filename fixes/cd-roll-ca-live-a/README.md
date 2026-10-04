# cd-roll-ca-live-a: the "Try it" A side for cd-roll-ca (C8; not a fix of its own)

> Personal, educational study of fastwork.com on a local mirror; not affiliated with Fastwork. `patch.diff` contains
> excerpts of Fastwork's code: keep it on local branches, never push.

**What:** `patch.diff` is C8 (st6-rb2 + cd-strip strip-tc, the control of every cd-roll-ca measurement) written
against the plain baseline, so the console's "Try it" panel (`live`, I-093) can serve it as A. B is
`fixes/cd-roll-ca-live/patch.diff` (V9).

**Built (2026-10-04, fix-cd-roll-ca):** `node tools/fix.mjs combine cd-roll-ca-live-a st6-rb2 cd-strip`, then
`node tools/fix.mjs diff cd-roll-ca-live-a` (patch.diff sha256 `66de9aa47bda…`). Both patches applied cleanly. The
combined overlay is byte-identical to C8:

| file | sha256 (combined overlay) | equals |
|---|---|---|
| `_app/immutable/nodes/2.DyWL8TcE.js` | `6fa0e1e8a221…` | C8, `out/cd-roll-ca/snap/C8` |
| `_app/immutable/assets/2.gBuqKVzi.css` | `982a747d9263…` | cd-strip strip-tc |

**Not measured.** Every number lives in `fixes/cd-roll-ca/README.md`.
