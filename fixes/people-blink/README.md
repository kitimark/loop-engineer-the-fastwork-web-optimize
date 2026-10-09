# Fix: people-blink (the deck "blink" on a fast fling)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` files contain excerpts of Fastwork's code: keep them on local branches, never push.

**Status:** cause read done (iPhone, Simulator, Chrome); fix options as a proposal with Try-it (look change)
**Stage:** D (attribution), proposal for F
**Device class / gate:** touch-only look issue (G driver on the phone, Simulator pixels, Chrome screencast)
**Driver(s) behind the claims:** phone G (WDA flick), Simulator WDA flick + screenshots, Chrome synthetic fling (fix-deck-chrome)
**Topic:** user T-228 #124 / #126 / #134 / #143: "the people section blinks, in `.start-selling-profile-deck`, when a fast
scroll down from the hero lands on it"; the original site blinks too.
**Files touched (options):** `/_app/immutable/nodes/2.DyWL8TcE.js` (people-section mount effect: `l()`, the reveal
trigger, pretty lines 12360-12420 in the g0.0k overlay), `/_app/immutable/assets/2.gBuqKVzi.css` (one rule appended).
Options: `fixes/people-blink--b2/` (instant reveal on a fast scroll) and `fixes/people-blink--b3/` (0.15 s fade on a
fast scroll), both on g0.0k (`fixes/g0-0k/patch.diff`); `delta.diff` in each is the change against g0.0k.

## Cause (all OBSERVED in our setup)

The blink is the people card's own reveal, not a stall and not the deck's own events.

- The card `.start-selling-future-card` is hidden (`visibility: hidden; opacity: 0; filter: blur(14px);
  translateY(48px)`) until `#people` gets `.is-visible`, which the script sets at hero-track progress 0.72
  (`l()`: `z(y, e.matches || i / r >= 0.72, !0)`, baseline JS 11310, g0.0k overlay 12367; CSS baseline 2393-2414).
- Then a time-based fade runs: opacity 0.7 s, blur 1.6 s (baseline) or 0.9 s `linear()` (g0 builds), lift 0.9 s.
- A fast fling scrolls from the flip point (y ~600) to the deck (y 1180-2070) in ~0.5 s. So the deck arrives hidden
  (white), then blurred and faded, and turns sharp near the landing: the "blink".

### iPhone 15 Pro Max (iOS 26.6.1 Safari), driver G (WDA flick 300 px / 220 ms from the top, lands y 1316-1440),
4 flings per arm, fair profile (Nominal, 35.7 °C), Timeline on (attribution), ioscap screen numbers.
Times in ms after the scroll starts. Reader `phone/pb-phone-read.mjs`; data `out/pbp/read-*.json` (not committed).

| | V = g0.0j | B = baseline | K = g0.0j, reveal knocked out |
|---|---|---|---|
| deck in view but still hidden | 163-181 ms | 181-376 ms | 0 |
| `.is-visible` flips | +315-345 (y 595-610) | +340-515 (y 614-800) | +315-355 (no fade) |
| blur ends | +1215-1250 (y 1208-1248) | +1940-2105 (y 1297-1411) | sharp from the first frame |
| blur end vs. the fling within 20 px of its stop | 790-850 ms before | 134 ms before to 83 ms after | — |
| longest main-thread frame at the flip (rAF / Timeline) | 51-59 / 58-65 ms | 71-104 / 54-92 ms | 30-64 / 56-67 ms |
| screen capture: frame gaps > 34 ms in the fling | 0 (60 fps) | 0 | 0 |

- Strips (every 100 ms, address bar masked; `out/people-blink/phone-frames/sheet-{V,B,K}.png`, not committed): V and
  B show the whole card blurred from y ~680 until y ~1180 (V) / ~1300 (B); K is sharp throughout, but the deck's photo
  tiles are empty grey placeholders at y 861-1047 and then pop in.
- Deck photos: the active shell's 8 lazy photos load during the fling (y 460-1180), today hidden by the fade.

### Simulator (iPhone 15 Pro Max, 430x775), WDA flick 300 px / 220 ms, screenshots every 200-300 ms (session s5)

Sharpness (mean |Laplacian| over the web view; settled frame 11.7) while the deck comes in (y 230-1300):
V 1.2-3.7, VD (deck events knocked out: will-change pinned, shell-hold off) 1.4-6.4, B 2.8-5.1 (white at y 491),
VK (reveal knocked out) 10.9-14.0. So the deck's own events don't matter; the reveal does.

### Chrome (fix-deck-chrome; 430x932 DPR3, CPU 6x, synthetic touch fling, every screencast frame)

Stop-on-deck fling (lands y 1223-1264): blur after landing base +900 ms (n=3), g0.0i +221 ms (n=1), g0.0j +200-222 ms
(n=3); base + K and g0.0j + K: no blank frames, no transition; g0.0j + D unchanged. No one-frame flash frame on the deck
in 27 runs (the A-B-A detector's 4.5-5.3 % peak is the fixed nav). In Chrome the deck photos are already loaded at page
load (inside Chrome's lazy margin).

### Cases

- Fast fling down from the hero that lands with the deck in view: the case. Baseline: the blur clears right at the
  landing. g0.0i: longer frames delay the fade start. g0.0j / g0.0k: the 0.9 s blur clears ~0.8 s before the landing on
  the phone, so it shows less (the user's "less than g0.0i").
- Slow scroll: the card fades in where it comes into view, as designed; no deck blink reported.
- Scroll up: the card hides with its fade-out (not part of the report).
- Reduced motion: `.is-visible` is set at once (`e.matches`), the CSS fade still applies.

## Fix options (proposal; changes the look of the fast case only)

- **B2 instant** (`fixes/people-blink--b2/`): when `.is-visible` turns on while the page scrolls at >= 0.8 px/ms, the
  card takes its end state at once (`data-fw-reveal="instant"` on `#people` → `transition: none`). The speed is the
  scrollY step since the previous `l()` call (one per rAF while scrolling; none after 200 ms of rest). The attribute is
  removed 400 ms later (nothing is transitioning, so that starts nothing) and at once when the class turns off (the
  hide fade is unchanged). Slower scrolls never get it: their fade is today's.
- **B3 quick fade** (`fixes/people-blink--b3/`): the same gate, but a 0.15 s fade instead of none.
- Both load the active deck's lazy photos once the page is idle after mount (1.5 s, then an idle callback with a 2 s
  cap), so they don't pop in on a deck you can now see.
- Phone flip speeds measured: 1.04-2.89 px/ms over the frame before the flip (12 flings); the Simulator slow drag is
  ~0.43 px/ms.
- Considered, not proposed: a scroll-driven reveal (`animation-timeline`). Supported in Safari 26
  (`ScrollDrivenAnimationsEnabled` stable/default-on from WebKit's safari-7622 branch, `UnifiedWebPreferences.yaml`;
  CONFIRMED by source), but threaded only from the safari-7624 branch (`ThreadedScrollDrivenAnimationsEnabled`,
  UNRESOLVED for iOS 26.6.1), and it changes the look at rest: a page stopped inside the range shows a half-blurred card.

## Checks (iPhone 15 Pro Max Simulator, 430x775; sessions s6-s8; counts and pixels only)

Builds: A = g0.0k (`fixes/g0-0k/patch.diff`), P = B2 instant, Q = B3 quick fade; read-only copies made by
`pb-snap.sh` (final pins in `pb-frames.mjs`: A e0b7b1e7e158/a9d4fa8992d9, P ac48233916ad/440582cec781,
Q 38c9b995cf80/8f63e55cfc2d). Per build: 2 flicks of 300 px / 220 ms from the top (land y 1480-1590), then 3 slow drags
of 520 px / 1200 ms; reader `pb-mech.mjs`, shots `pb-shots.py`.

| check | A (g0.0k) | P (B2) | Q (B3) |
|---|---|---|---|
| flick: speed at the flip (px/ms) | 1.76-2.13 | 1.82-2.13 | 1.38-2.13 |
| flick: `data-fw-reveal` set at the flip | never | every flick (removed +400 ms) | every flick |
| flick: card transitions at the reveal | opacity, filter, transform | none | the 0.15 s ones |
| flick: sharpness while the deck comes in (y 450-1260) | 1.6-3.8 | 13.3-13.8 | 12.4-14.0 |
| slow drag: speed at the flip | 0.47-0.50 | 0.47-0.57 | 0.47-0.50 |
| slow drag: attribute / transitions | never / today's | never / today's | never / today's |
| scroll up: hide transitions | today's | today's | today's |
| deck photos (first 3 profiles) loaded before the first flick | 0 of 15 | 15 of 15 | 15 of 15 |

Rest pixels at y 1300 (same session, > 8 of 255 counted): every differing area is self-animated content (status-bar
clock, the spinning record tile, the avatar row, the glass nav over them), plus 40 device px at the profile photo's
edge, max 31 (A against A across sessions: 0 there). Within T2 (fill 64, edge 128, 0.5 %).

## Risks, conflicts, follow-ups

- Look change only for fast scrolls into the section; slow scroll, rest and reduced motion keep today's look (to be
  shown by the checks above).
- The photo preload loads 8 more images after page idle on every visit (today they load only when scrolled near).
- Overlap: the people section's mount effect also drives the avatar rotator (`fwNearChange`, rest-script) and the
  shrink (double-drive); the change only adds to `l()` and the mount/cleanup lines.
- Tools here (`pb-frames.mjs`, `pb-shots.py`, `phone/*`) are this topic's own probes, not shared tooling.
