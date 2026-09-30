# Direction: the road to "ultra smooth" (set by the lead, 2026-09-30)

The user asked the team to find the best animation-render optimisation on its own. This is the lead's
roadmap, ranked by what stands between us and the goal (`LEAD.md`: iPhone steady 60 fps under a finger,
no frame > 50 ms; Chrome mobile 6x: frames > 50 ms -> 0, > 34 ms -> ~0). Evidence:
`research/architecture/measurement-review.md`, `README.md`, `webkit.md`, `render.md`,
`research/measurement-parallelism/`. Revisit after every clean combined measurement.

## What is left, by kind of frame

| frame class | where it comes from (evidence) | lever | topics |
|---|---|---|---|
| **> 50 ms, Chrome** | only 4 LoAF entries: gtag `onscrollend` (vendor), morph IO callback (panel mount), engine `iE`, future `l` | remove each entry | E1 lazy mount (13), E4 `.hero-track` IO, engine scope (9/10/12), N11 vendor-scrollend |
| **> 34 ms, iPhone** | ~10 per run at 7 fixed scroll positions: section state flips (scene gate, `will-change`, `content-visibility`); worst 89-119 ms at y~1970 | make transitions cheap: no whole-subtree flips, pre-warm before entry, hysteresis | N10 transition-frames, N9 scene-gate-flap, W1/W3 answers |
| **20-34 ms, both** | per-frame style recalc (UpdateLayoutTree ~2x script in old traces), inherited custom properties, main-thread infinite animations | fewer, narrower style invalidations; declarative/compositor animations | N4 custom-property-scope, N3 main-thread-infinite-animations, scroll-driven conversions (hero-exit done; future/platform/commission/profile next) |
| **GPU, iPhone only** | backdrop-filter re-blur, large blur layers | smaller area/radius, fixed radius, opacity fades | large-area-blur, N6 nav-backdrop-budget, N2 morph-composited |
| **touch path** | non-passive wheel/touch listeners near the morph | passive listeners, scroll-driven morph | morph-scrolljack-passive, N8 |

## Principles for choosing work

1. **Remove a whole frame class, not a percentage.** Prefer changes that delete a LoAF entry or a transition
   cluster over changes that shave a few ms everywhere.
2. **Declarative beats per-frame JS**: scroll-driven CSS, WAAPI with `linear()` springs, compositor-only
   properties (opacity, transform, filter with matching lists).
3. **Narrow every invalidation**: `@property ... inherits: false`, write on the element that uses it,
   `contain`, no subtree-wide `will-change` / `content-visibility` flips during scroll.
4. **Prototype in parallel, measure in series**: owners build and self-check (parity, probes, Tier A
   benchmark counts in the short lane) while waiting; the one Chrome slot goes to the highest expected gain.
5. **Every claim reproducible**: experiment rows + variant diffs + benchmarks (`EXPERIMENTS.md`,
   `fixes/README.md` 7a/8); clean host or it is provisional.

## Lock-slot priority (the lead reorders owners' queue entries by this, not by arrival)

1. E1 nav-morph-all (lazy mount + hit test + passive + countdown active): removes the morph IO LoAF.
2. scroll-engine diagnostic slot: E2 state-change probe (explains the iPhone clusters), N9 idle probe, E3 animation ablation (decides N3's rank).
3. Final A/Bs that gate the wave-1 combine (commission, layout-animations follow-up, countdown, pain, large-area-blur re-run).
4. Wave-1 combined A/B on a quiet host (the number for the goal), then wave 2 `--on` it: hero-exit, scroll-engine (+ hysteresis), E4.
5. N3 / N4 / N10 fixes as their prototypes pass Tier A.

## Started now (prototype while the queue drains)

- N3 `main-thread-infinite-animations`: new owner.
- N11 `vendor-scrollend`: new owner, research first (can the page avoid gtag's 45-74 ms `onscrollend`
  without breaking analytics? Label any vendor-config change as "needs the site's GA setting").
- W1-W3 / R1-R3 answers (arch-research2) feed N10 and the touch-path metrics.
