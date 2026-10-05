# end-morph-v9f: fix-end-morph's F1 + U2 on the best build (v9-final)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with Fastwork). The
> snapshot and the deltas contain Fastwork's code: they stay on this machine.

**Status:** built and pinned (int-v8, integrator; fix-end-morph owns the change and its gates). U2 parity on v9-final
PASS. No timing, no phone. Next: fix-end-morph's gates (Chrome and Simulator frozen-frame pixels, Chrome counts) and the
phone no-worse check, both on this snapshot.
**Why:** user T-204 #4 (the end-of-page nav morph is the only focus); v9.2 is NO-LAND (P-142), so fix-end-morph's F1 + U2
candidate, built on v9.2, is rebuilt on v9-final, the best build (lead).

## Build

| arm | what | JS | CSS |
|---|---|---|---|
| C | v9-final as landed (8b5ce9b3; P-142's control) | `647c9ef2b1e2` | `e1359ab9994a` |
| V | C + F1 + U2 | **`a6426953727a`** (a6426953727acd4342fd17f6f114d840e67b5e612b63d41dc45c7abab1362c5b) | `e1359ab9994a` (unchanged) |

- **Delta:** fix-end-morph's `fixes/end-morph-f12/delta.diff`, sha256/12 `befc17cec97f`, commit 293876b8 on
  `worktree-agent-aa06ada9c80534d32` (agreed with the owner; U2 credited to fix-nav-morph). Applied unchanged with
  `patch -p1 -F 0`: all hunks clean on v9-final. The same file on v9.2 gives the owner's `3625c64871fa` (checked).
  Byte copy here: `fixes/nav-hit-cache/patch-on-v9f-f12.diff` (befc17cec97f).
- **Snapshot:** `out/emv9f/snap-a6426953727a/{C,V}` (read-only), `HASHES.txt` sha256/12 `0817a71bf0c7`, made by
  `sh fixes/end-morph-v9f/build.sh` (a49871d4d40c; refuses another delta, another C, a non-strict apply, V bytes other
  than the pin, or any file beyond the four arms' files). `node --check` OK. The first make (script 4c51d28e65f1) left
  patch's backup `V/.../2.DyWL8TcE.js.orig` beside V's JS (never requested, outside HASHES.txt; fix-end-morph's note): it
  was removed by hand and the script now removes and refuses such files; the four pinned files are unchanged (HASHES.txt
  checks OK, 0817a71bf0c7).
- **Phone servers** (fix-end-morph's no-worse check, later): `sh fixes/end-morph-v9f/serve.sh` (ed92e54852d2), plain
  http, `--port 0`, `--latency 150`, `--vendors=local`, B / C / V from the snapshot, served-hash check (`check`, exit 4
  if wrong), `stop`. Smoke 22:58Z: B 4606120cf392 / 27776f3d4138, C 647c9ef2b1e2 / e1359ab9994a, V a6426953727a /
  e1359ab9994a, all ok; stopped.
- Cross-check by fix-end-morph-p1 (its strict applier): C + F12 = a6426953727a / e1359ab9994a, the same bytes.
- v9-final has no rev 7d: its morph engine is rev 7c (`__msEnd`, `__msTick`, `__nsTrSel` and the `--morph-fade` write
  are all present, so F1's and U2's anchors apply).

## U2 parity on v9-final (lead: before the pin; the engine differs from the earlier v9f7d / v9.1d runs)

Owner's choice: audit the exact candidate (F1 included). New base `v9ff12` in `fixes/nav-hit-cache/build.mjs` (additive;
C = v9-final from `out/p142/snap/C`, patch = the delta above, U2 audit hook): V `a6426953727a`, VA `7c446f3e62e5`
(CSS `e1359ab9994a`). `node fixes/nav-hit-cache/probe.mjs parity --base v9ff12`, Chrome 154, no throttle, three shared
probe slots (2026-10-05 ~22:5x-23:1xZ): a = mobile, desktop; b = mobile-rtl, desktop-rtl; c = mobile-shift. Records
`out/emv9f/parity-{a,b,c}.json` (f6f6f34be22f, f3c2206b5af5, 115861fc8dfc).

| case | served | errors | dmis (all modes) | task modes: lag / theme / sticky / pill | deferred 10 / 40 px |
|---|---|---|---|---|---|
| mobile | VA | 0 | 0 | 0 / 0 / 0 / 0 | 187 / 47 |
| mobile-rtl | VA | 0 | 0 | 0 / 0 / 0 / 0 | 187 / 47 |
| mobile-shift | VA | 0 | 0 | 0 / 0 / 0 / 0 | 187 / 47 |
| desktop | VA | 0 | 0 | 0 / 0 / 0 / 0 | 0 / 0 |
| desktop-rtl | VA | 0 | 0 | 0 / 0 / 0 / 0 | 0 / 0 |

- **PASS** on the owner's line: VA served everywhere, no page error; 0 dmis in every case; 0 lag frames and 0 theme /
  sticky / pill mismatches in task modes; rAF modes show only the earlier runs' harness entries (pill 2, theme 1 at
  40 px, none in sync). Deferred counts (reported, not gated) equal the v9.2 and v9f7d runs (187 / 47 mobile, 0 desktop).
- **F1 state** (owner's addition; `probe.mjs` records, report only, after the down pass and after the up pass): every
  mobile case and mode: `section#platform` hidden with `--morph-fade` 0 at the page end, visible with fade 1 back at the
  top (no stuck hidden); desktop: no fade written, visible (F1 acts only where the morph runs).
- `probe.mjs` change (report only, 4fb489fef170): the F1 state read; it changes no audit count.
- **Edits to fix-nav-morph's tools** (made by int-v8 for this run, credited to fix-nav-morph's nav-hit-cache harness;
  accepted by the lead while the owner is parked): the additive `v9ff12` base in `fixes/nav-hit-cache/build.mjs` (no
  other base changed) and the report-only F1 read in `fixes/nav-hit-cache/probe.mjs`. Lead: v9-final + F1 + U2
  (a6426953727a / e1359ab9994a, HASHES 0817a71bf0c7) is the landing base for fix-end-morph's gates; this commit lands
  with fix-end-morph's F1 + U2 landing.

## Not in it

P1 (morph-gpu rev 1) needs its own port to v9-final (fix-end-morph's `end-morph-p1` sits on 7d): later, not started.
