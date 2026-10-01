# Fix: mw10e-arm-scope-c (F3, comment re-cut: the landing build)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** landing build for F3 (lead 15:0xZ). The code is token-identical to `mw10e-arm-scope`; only comments
changed. Measured evidence is in `fixes/mw10e-arm-scope/README.md` and `results.json`. P-036 (G), F and review run on
this build.
**Base:** stacked on `aw1-10e` (`node tools/fix.mjs apply mw10e-arm-scope-c --on aw1-10e`). JS only.

## What changed vs mw10e-arm-scope

The two patch comments are reworded to what the sources support:
- **Removed:** the touch-region argument (F-055, REFUTED for iOS 26.6, F-070), and "every wheel/touch listener
  add/remove on the window invalidates the ROOT style".
- **New wording:**
  - the window wheel listener triggers a full style rebuild only when the set of event-region types changes
    (WebKit source, arch-claims, tag 7624.4.5);
  - touch event regions are compiled out on iOS before WebKit 7625;
  - the ~100 ms frame follows the listener add (observed);
  - which listener costs it is unresolved (F-062).

## Token-identical check

The check strips every full-line `//` comment from both files and compares the rest byte for byte. No line changed
outside full-line comments. `node --check` passes.

| | sha256 |
|---|---|
| mw10e-arm-scope (measured) `2.DyWL8TcE.js` | `7b0d6222554580061903a5ccc405489f94cca3a6d5031cb26efa9e50287b6d5f` |
| mw10e-arm-scope-c (landing) `2.DyWL8TcE.js` | `c6d3590576a7a6326a101d35894b16c4735847f15b72a856ee67bb7e23d307d7` |
| both, comments stripped | `13d36da9308ea6a274bee2f256584c6e0bf56742226a847179db2c880e3fea23` (identical) |

- The comment-stripped diff is empty. Full-line comment lines: 75 in both.
- So the phone evidence (P4 block B, P-022 HIT) and the Chrome regression A/B of `mw10e-arm-scope` carry over to
  this build.
- CSS = base (c6aad94b455f).
- Immutable snapshot copy for the phone: the worktree's `out/snapshots/mw10e-arm-scope-c-c6d3590576a7/` (read-only,
  serve with `--overlay <it>,fixes/aw1-10e/overlay`).
