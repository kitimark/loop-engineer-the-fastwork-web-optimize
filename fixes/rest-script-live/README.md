# rest-script-live: the "Try it" copy of rest-script v4 (not a fix of its own)

> Personal, educational study of fastwork.com on a local mirror; not affiliated with Fastwork. `patch.diff` contains
> excerpts of Fastwork's code: keep it on local branches, never push.

**What:** `patch.diff` is rest-script v4 written against the plain baseline, so the console's "Try it" panel
(`live`, I-074/I-093) can serve it. That panel refuses stacked patches, and `fixes/rest-script/patch.diff` is stacked
on st6-rb2.

**Built (2026-10-04, fix-rest-script):** `node tools/fix.mjs combine rest-script-live st6-rb2 rest-script`, then
`node tools/fix.mjs diff rest-script-live`. Both patches applied cleanly. The combined overlay is byte-identical to
what rest-script measured and scored:

| file | sha256 (combined overlay) | equals |
|---|---|---|
| `_app/immutable/nodes/2.DyWL8TcE.js` | `520d5f1139c7…` | `fixes/rest-script/overlay` (v4) |
| `_app/immutable/assets/2.gBuqKVzi.css` | `f523598b2a24…` | `fixes/st6-rb2/overlay` |

**Used by:** PR-014 (P-089 keep/drop). Option keep: B = this patch, A = `fixes/st6-rb2/patch.diff` (the current best
build). Option drop: B = A = st6-rb2.

**Not measured.** No A/B, card or pixel score was run on this directory. Every number lives in
`fixes/rest-script/README.md`, measured on the same bytes.
