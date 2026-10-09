# Fix option: people-blink--b2 (instant card on a fast scroll)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** proposal option `instant` (see `fixes/people-blink/proposal.json`, cause and checks in `fixes/people-blink/README.md`)
**Base:** g0.0k (`fixes/g0-0k/patch.diff`). `patch.diff` = baseline-relative (g0.0k + this change, for Try-it);
`delta.diff` = the change against g0.0k only.

- `l()` in the people section's mount effect: when `.is-visible` turns on while the page scrolls at >= 0.8 px/ms (scrollY
  step since the previous `l()`, one per rAF; 0 after 200 ms of rest), `#people` gets `data-fw-reveal="instant"` for
  400 ms; the CSS rule `.start-selling-future[data-fw-reveal="instant"] > .start-selling-future-card { transition: none
  !important }` makes the card take its end state at once. Removed at once when the class turns off (hide fade unchanged).
- A local mirror (`fwRvOn`) of the last value written, so the mount effect does not subscribe to the state.
- Preload: 1.5 s after mount (then an idle callback, 2 s cap), every image in the active profile shell and the next one
  gets `loading = eager` (lazy ones) and `decode()`.
