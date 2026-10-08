# g0.0e: g0.0c + the Join waitlist fade fix + the logo-close fix (best build)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**What it is.** The best build after the user accepted PR-036 (2026-10-08 03:02:03Z) and PR-037 (03:02:30Z):
- g0.0c (`fixes/platform-corners-g00b/patch.diff`: v14 above the end, the original end-of-page with the Join no-lift, the
  platform-card corner fix);
- plus the join-fade block (`fixes/join-fade/`, the CSS block appended at the end; PR-036);
- plus the logo-close rule (`fixes/logo-close/delta.diff`, one declaration in the ≤640 block; PR-037).

g0.0d (g0.0c + join-fade only, CSS 32a2bf7c17b0) was best for under a minute and is not served separately.

**Pins** (sha256, first 12; baseline-relative `patch.diff`, rebuilt by the lead from fresh `site-pretty` copies):

| file | g0.0c | g0.0e |
|---|---|---|
| `_app/immutable/nodes/2.DyWL8TcE.js` | 5c39f7a96e41 | 5c39f7a96e41 (unchanged) |
| `_app/immutable/assets/2.gBuqKVzi.css` | c65da97ba01f | d4e684032482 |

**How it was built.** Apply `fixes/join-fade-g00c/patch.diff` to fresh baseline copies (CSS 32a2bf7c17b0, as that
patch's README states), then `fixes/logo-close/delta.diff` (it touches CSS line ~12038; join-fade only appends at the
end, so it applies unchanged), then diff against the baseline. `patch.diff` applied to fresh copies gives the pins above.

**Checks.** No new measurement. Both fixes were gated on g0.0c on their own (their READMEs). fix-g0-box dry-ran
join-fade, logo-close and v3-W together on g0.0c in either order with identical results. The two changes touch different
rules (the Join pill and the gap vs the logo's transform-origin). Not checked on the combined build: the screenshot gates
and the phone.

**Open on top:** PR-038 (v3-W, the Safari-only GPU menu bar, `fixes/v3w-g00c/`) waits on the user. If it is accepted,
re-check the Join clip under v3-W's nav clip-path (fix-join-fade's note) and rebuild v3-W on g0.0e.
