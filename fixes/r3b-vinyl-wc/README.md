# Fix: r3b-vinyl-wc (R3 phone diagnostic b)

> Personal, educational experiment on a local mirror of https://fastwork.com/ (not affiliated with
> Fastwork). `patch.diff` contains excerpts of Fastwork's code: keep it on local branches, never push.

**Status:** phone diagnostic (cheap test); no Chrome parity run (a `will-change` hint, no paint change intended).
**Owner:** fix-scroll-engine, for de-middle R3 (lead OK 09:50Z). **Base:** `aw1-10e`. Standalone overlay
(aw1-10e + this change). Rebuild: `node tools/fix.mjs apply r3b-vinyl-wc --on aw1-10e`.
Overlay CSS d879ae02ec836a6d…, JS = aw1-10e. `patch.diff` +2/-0, sha 57618e864d0f477a.

## What changed

`.record.spinning.svelte-ox8yzs` gets `will-change: transform` (CSS 3880-3884): the spinning vinyl gets its own
layer up front. The `.feed .body` mask-image stays. Why: see `fixes/r3a-feed-fade/README.md` and F-041. If this alone
removes the per-frame `36,1665,373,344` repaint on the phone, the mask is not the blocker and (b) is the minimal fix.
If only r3a does, the masked ancestor is the cause.
Interaction: the scroll engine's paused-scene rule sets `will-change: auto` in paused scenes (/10b), so the layer
exists only while #people's scene is active.

## Phone check (iphone-runner)

Serve (plain http): `node tools/serve.mjs --root site-pretty --overlay /Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a1722cf5058e25591/fixes/r3b-vinyl-wc/overlay --port auto --vendors=local --latency 150`.
Base: the same with `fixes/aw1-10e/overlay`; frames > 20/34 ms over y 1600-2500, paint rects at y≈1900 if possible.
