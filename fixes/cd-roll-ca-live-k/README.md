# cd-roll-ca-live-k: the "Try it" copy of cd-roll-ca VK (not a fix of its own)

> Personal, educational study of fastwork.com on a local mirror; not affiliated with Fastwork. `patch.diff` contains
> excerpts of Fastwork's code: keep it on local branches, never push.

**What:** `patch.diff` is VK (V9 + K: the same roll path in about 4x fewer keyframes, per-frame quadratic pieces as
per-keyframe cubic-bezier easings) written against the plain baseline, so the console's "Try it" panel (I-074/I-093) can
serve it as B for the PR-017 follow-up rev. A is `fixes/cd-roll-ca-live/patch.diff` (V9, the accepted page).

**Built (2026-10-04, fix-cd-roll-ca):** the overlay is a byte copy of the immutable snapshot `out/cd-roll-ca/snap/VK`,
then `node tools/fix.mjs diff cd-roll-ca-live-k` (patch.diff sha256 `e617565993f3…`).

| file | sha256 (overlay) | equals |
|---|---|---|
| `_app/immutable/nodes/2.DyWL8TcE.js` | `b43fe790c20c…` | VK, `out/cd-roll-ca/snap/VK` |
| `_app/immutable/assets/2.gBuqKVzi.css` | `982a747d9263…` | cd-strip strip-tc (C8 = V9 = VK) |

**Not measured.** No A/B, card or pixel score was run on this directory. Every number lives in
`fixes/cd-roll-ca/README.md` ("K: fewer keyframes, same path"), measured on the same bytes.
