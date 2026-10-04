# cd-roll-ca-live: the "Try it" copy of cd-roll-ca V9 (not a fix of its own)

> Personal, educational study of fastwork.com on a local mirror; not affiliated with Fastwork. `patch.diff` contains
> excerpts of Fastwork's code: keep it on local branches, never push.

**What:** `patch.diff` is V9 (st6-rb2 + cd-strip strip-tc + cd-roll-ca) written against the plain baseline, so the
console's "Try it" panel (`live`, I-074/I-093) can serve it as B. The panel refuses stacked patches, and
`fixes/cd-roll-ca/patch.diff` is stacked on cd-strip. A is `fixes/cd-roll-ca-live-a/patch.diff` (C8).

**Built (2026-10-04, fix-cd-roll-ca):** `node tools/fix.mjs combine cd-roll-ca-live st6-rb2 cd-strip cd-roll-ca`, then
`node tools/fix.mjs diff cd-roll-ca-live` (patch.diff sha256 `936b5b13b5ac…`). All three patches applied cleanly. The
combined overlay is byte-identical to what cd-roll-ca measured:

| file | sha256 (combined overlay) | equals |
|---|---|---|
| `_app/immutable/nodes/2.DyWL8TcE.js` | `582d120c9f8f…` | V9, `out/cd-roll-ca/snap/V9` |
| `_app/immutable/assets/2.gBuqKVzi.css` | `982a747d9263…` | cd-strip strip-tc (C8 = V9) |

**Not measured.** No A/B, card or pixel score was run on this directory. Every number lives in
`fixes/cd-roll-ca/README.md`, measured on the same bytes.
