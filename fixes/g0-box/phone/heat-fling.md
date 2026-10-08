# heat-fling: uncounted WDA heat program (user T-247, 2026-10-08)

`heat-fling.json` (`ms-heat-fling` v1) warms the iPhone toward real thermal Serious faster than the scripted
smooth scroll (about 0.4-0.5 C/min). It is an **uncounted heat run**: nothing is read from it, it is never a
measurement, and it never replaces a gate or a counted run. Format and runner: `g-fastshort-g0b.json`,
`tools/lib/gesture.mjs`, `tools/lib/gesture-run.mjs`.

## What it does

- Only `fling` strokes, `pressMs` 10, x 215: hard and fast (long strokes 540 px / 130 ms, lift-off 7054 px/s;
  short strokes 60-200 px / 50-90 ms for the end-of-page menu close/open).
- Start: 4 up flings (top to bottom), then a **full-page pass** (down flings 540 px / 140 ms toward the top, at most
  5, then up flings back to the end), 3 end cycles, a second full-page pass, 5 more end cycles, a last return to the end.
- **End cycle** (most of the run): 2 up flings to the end, one short up fling, a short down fling (closes the
  end-of-page menu, the page coasts up), 2 up flings back to the end, a short up fling (opens it). Short stroke
  sizes rotate 60/50, 120/60, 200/90 (px/ms), like E20-E31 of the g0 program.
- 72 strokes, marks `heat-start` and `heat-done`, no reload (start from an open page, any scroll position).

## Geometry (mirror original page, lead's numbers)

Document height about 6035 px at 430x775, so maxY is about 5260; the end-of-page menu jack is near y 5214. The
program does not read positions: an up fling of 540 px / 130 ms carries the page 2000+ px, so 4 of them reach the
end from the top, and the end cycle's 60/50, 120/60 and 200/90 down flings coast the page 500-1100 px up, well
past the jack (menu closes); the following up flings return to the end and the short up fling there opens it
again. endY 5000 (the default) is only the static guard model's lower bound of maxY. On the live page (taller or
shorter by a few hundred px) the same strokes apply; up flings past the end just rubber-band.

## Safe on any page state (P-165 lesson F-347)

- No non-optional `until`: nothing can abort on a timeout. Only fixed `repeat` counts and `repeat ... until atTop`
  loops (runtime loops that end by themselves).
- Every down fling sits in such a one-pass or five-pass loop. Outside a loop, the runner throws (aborts the run)
  when a down stroke's pull-to-refresh guard misses (page not at rest in 5 s, or scrollY below the guard); inside
  a loop it only ends that loop and sends nothing. Up strokes never abort.
- Left to the runner as always: Safari not in front, page hidden or not portrait stops the run before a stroke.

## Check (no phone, no locks)

`node tools/iphone.mjs gesture fixes/g0-box/phone/heat-fling.json --dry-run`:

- `ms-heat-fling v1 hash 137ef5c2c60a`, full `GESTURE_HASH 137ef5c2c60a39f21c5cac4bdeda9e8a1f716f836f85f9730e428189548736c4`
- 72 strokes, static estimate ~33 s (counts each loop once, no WDA setup or rest waits)
- `GESTURE_BUDGET_S 150` (the minimum; the real wall time is not measured yet)
- Expected wall time on the phone: 70-110 s (about 0.12 s WDA setup per path point, rest waits before down flings
  and before up flings at the end, up to 5 s each, plus the runtime loops). The first use records the real
  duration; run it twice back to back if one pass is short.

## Command (fix-g0-box)

Primary page: the mirror's original page (the kit's B port, the same files as arm C; user T-247 #7). The live page
works too (fallback).

```sh
node tools/iphone.mjs open <B port URL>
node tools/iphone.mjs gesture fixes/g0-box/phone/heat-fling.json --owner fix-g0-box --warmup --profile real-serious
# live page instead: node tools/iphone.mjs open https://fastwork.com/ , then the same gesture command
```

Inside the phone hold (`lock.mjs run iphone --owner fix-g0-box -- ...`), as the kit's pre-warm and heat-hold runs
are. Uncounted, user T-247; the swap from `iphone.mjs run --driver scroll --warmup` happens at a hold boundary and
is a kit change recorded in the P-165 README. Hash from a dry run on the branch it is run from: the hash changes
with any edit of the JSON. Dry-run only here: nothing was run on the phone, Chrome or the Simulator.
