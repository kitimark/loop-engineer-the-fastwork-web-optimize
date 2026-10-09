# Accepted proposals by build version

User T-252 #1 (2026-10-08). Compiled by the helper map-pr-versions from `console.mjs proposal list`,
`fixes/BEST_BUILDS.md`, `fixes/PROGRESS.json`, the build READMEs and markers in g0.0f's patch
(`fixes/v3w-g00e/patch.diff`). "First build" = the first version that carried the proposal's code.
Rows marked (unconfirmed) rest on one source only.

## First build per accepted proposal (newest first)

| Build | Proposals first applied | In g0.0l (best now)? |
|---|---|---|
| g0.0l | PR-041 people card appears sharp on a fast scroll (option instant, accepted 2026-10-09 07:23Z) | yes |
| g0.0k | PR-040 end-of-page menu follows the finger with a steady glass (accepted 2026-10-09 03:40Z) | yes |
| g0.0h | PR-039 menu photo columns kept as a still picture while closed (keep-phase) | yes |
| g0.0f | PR-038 Safari menu bar drawn by the GPU | yes |
| g0.0e | PR-037 logo does not jump at menu close | yes |
| g0.0d | PR-036 Join button fade: clean edges, kept gap | yes |
| g0.0c | PR-035 platform-card corners in Safari | yes |
| g0.0b | PR-034 original fastwork.com end of the page (the rollback); PR-027's no-rise effect re-added | yes |
| v12 | PR-032 Join button timed fade | no (removed by the rollback) |
| v11 | PR-031 People title slide (X2) (first best build with it: g0.0b) | yes |
| v10 | PR-030 GPU end menu card; PR-027 Join no-lift; PR-012 menu reveal (option b) | PR-030, PR-012: no (rollback); PR-027: effect yes |
| v9 / v9-final | PR-018 menu follows the swipe; PR-021 Join button timing; PR-022 middle cards double-drive; PR-023 long swipe back up | PR-021, PR-022: yes; PR-018, PR-023: no (rollback) |
| v8 | PR-007 countdown faces (unconfirmed: may start earlier); PR-017 countdown roll, option K; PR-019 accent word | yes |
| v7 | PR-008 countdown strips; PR-014 calmer avatar row and counters at rest | yes |
| v6 | PR-011 hero exit on Safari scroll animations | yes |
| v4 | PR-009 platform idle sweep and glint on the GPU | yes |
| v3 | PR-002 platform section, less style work (unconfirmed: may be v1-v2) | yes |
| v1 | PR-013 avatar slider (option keep-st6) | yes |

## Accepted but not in g0.0l

- Removed by the g0.0b rollback (fixes/g0-revert/README.md 133-143): PR-012, PR-018, PR-023, PR-030, PR-032.
- Accepted but never built into a best build:
  - PR-024 people word starts when the card is fully shown (ready to land; only the unlanded v9.2 listed it).
  - PR-026 end-menu clock rolls like the top clock (Try-it build only; phone check P-147 paused).
  - PR-025 lighter pictures (a recipe; no re-encoded images committed) (unconfirmed).
  - PR-001 (no arm beat the SVG in P-058).
- Accepted, no code needed: PR-003, PR-004, PR-005, PR-010, PR-015, PR-020.
- Not accepted: PR-029 and PR-033 rejected; PR-028 changes requested; PR-016 draft.

Updated by the lead 2026-10-09 (g0.0k best): PR-039 (g0.0h) and PR-040 (g0.0k) added; builds g0.0f-g0.0k carry every "yes" row.
