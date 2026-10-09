# Fix option: people-blink--b3 (0.15 s fade on a fast scroll)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** proposal option `quick` (see `fixes/people-blink/proposal.json`, cause and checks in `fixes/people-blink/README.md`)
**Base:** g0.0k (`fixes/g0-0k/patch.diff`). `patch.diff` = baseline-relative (g0.0k + this change, for Try-it);
`delta.diff` = the change against g0.0k only.

The same script as `people-blink--b2` (fast-scroll gate and photo preload); only the CSS rule differs: under
`data-fw-reveal="instant"` the card's opacity, filter and transform transitions are 0.15 s ease-out instead of
none, so the card still fades, but is sharp before the deck comes into view.
